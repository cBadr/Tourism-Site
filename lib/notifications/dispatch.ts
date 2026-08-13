import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { getBaseUrl } from "@/lib/seo";
import { DEFAULT_SETTINGS, type NotificationSettings } from "@/lib/site-config";
import { createServiceSupabase } from "@/lib/supabase/admin";
import {
  dispatchRecipients,
  isDispatchEvent,
  renderDispatchNotification,
} from "@/lib/dispatch/messages";
import { hasEmailCredentials, sendEmail } from "@/lib/notifications/email";
import {
  channelLabel,
  renderNotification,
  toEmailHtml,
  toEmailSubject,
  toTelegramHtml,
  type RenderContext,
} from "@/lib/notifications/render";
import { hasTelegramCredentials, sendTelegram } from "@/lib/notifications/telegram";
import {
  isSkipped,
  type ChannelOutcome,
  type ChannelReadiness,
  type DispatchSummary,
  type NotificationOutcome,
  type NotificationRecord,
  type NotificationStatus,
  type QueueStats,
  type SendOutcome,
} from "@/lib/notifications/types";

/**
 * عامل الإشعارات — قلب أنبوب Outbox (قرار ٦ من خارطة الطريق).
 *
 * دورة العمل: اقرأ أقدم ٥٠ إشعاراً في الطابور ← احسب قنوات كل إشعار من
 * الإعدادات ← صُغ الرسالة بالعربية ← سلّمها لكل قناة ← سجّل النتيجة على الصف
 * (الحالة + عدّاد المحاولات + نص السبب). **لا يرمي استثناءً أبداً** ويرجع
 * ملخّصاً دائماً — لأن مستدعيه إما زر في اللوحة أو مهمة مجدولة، وانهياره
 * الصامت أسوأ من فشل مُبلَّغ عنه.
 *
 * قرارات مقصودة:
 * - يعمل بعميل الخدمة (service_role) لأن المهمة نظامية بلا مستخدم مسجَّل.
 * - قناة «لوحة التحكم» مُسلَّمة بحكم وجود الصف نفسه (الجرس يقرأه)، فلا تدخل
 *   في حساب النجاح/الفشل. حالة الصف تعكس القنوات الخارجية وحدها، وإلا لظهرت
 *   كل الإشعارات «أُرسلت» بينما لم يصل تليجرام ولا بريد.
 * - أي حقل قد يكون مفقوداً في الجدول (attempts/error/delivered_at) يُحاول
 *   كتابته أولاً، ثم يُعاد التحديث بأقل الحقول عند الرفض — فالعامل يشتغل حتى
 *   لو اختلف مخطط الجدول قليلاً عن المتوقع.
 */

/** أقصى عدد صفوف في الدورة الواحدة (من العقد) */
const BATCH_LIMIT = 50;
/** كم إشعاراً يُعالَج بالتوازي — تليجرام يسمح بأكثر، لكن ٥ كافية وآمنة */
const CONCURRENCY = 5;
/** ميزانية زمنية للدورة كلها: ما بقي يظل في الطابور للدورة التالية */
const TIME_BUDGET_MS = 20_000;
/** القنوات المفترضة حين لا يحدّد الصف قنواته */
const DEFAULT_CHANNELS = ["dashboard", "telegram", "email"];

/** قفل داخل نفس العملية يمنع تداخل دورتين (زر اللوحة + مهمة مجدولة) */
let running = false;

// ---------------------------------------------------------------------------
// قراءة الإعدادات بعميل الخدمة (بلا cookies) حتى يعمل العامل من أي سياق
// ---------------------------------------------------------------------------

type WorkerSettings = {
  brandName: string;
  currency: string;
  notifications: NotificationSettings;
};

function mergeNotificationSettings(value: unknown): NotificationSettings {
  const base = DEFAULT_SETTINGS.notifications;
  if (typeof value !== "object" || value === null) return base;
  const v = value as Record<string, unknown>;
  const text = (key: string): string | null =>
    typeof v[key] === "string" && (v[key] as string).trim() !== ""
      ? (v[key] as string).trim()
      : null;
  const flag = (key: string, fallback: boolean): boolean =>
    typeof v[key] === "boolean" ? (v[key] as boolean) : fallback;

  return {
    telegramChatId: text("telegramChatId") ?? base.telegramChatId,
    telegramEnabled: flag("telegramEnabled", base.telegramEnabled),
    emailTo: text("emailTo") ?? base.emailTo,
    emailEnabled: flag("emailEnabled", base.emailEnabled),
  };
}

async function loadWorkerSettings(supabase: SupabaseClient): Promise<WorkerSettings> {
  const fallback: WorkerSettings = {
    brandName: DEFAULT_SETTINGS.brand.name,
    currency: "EGP",
    notifications: DEFAULT_SETTINGS.notifications,
  };

  const [settingsRes, pricingRes] = await Promise.all([
    supabase.from("site_settings").select("key, value"),
    supabase.from("pricing_settings").select("currency").limit(1),
  ]);

  let brandName = fallback.brandName;
  let notifications = fallback.notifications;

  if (!settingsRes.error && Array.isArray(settingsRes.data)) {
    for (const row of settingsRes.data as { key: string; value: unknown }[]) {
      if (row.key === "brand" && typeof row.value === "object" && row.value !== null) {
        const name = (row.value as Record<string, unknown>).name;
        if (typeof name === "string" && name.trim() !== "") brandName = name.trim();
      }
      if (row.key === "notifications") notifications = mergeNotificationSettings(row.value);
    }
  }

  const currencyRow = pricingRes.error ? null : (pricingRes.data?.[0] as { currency?: unknown } | undefined);
  const currency =
    currencyRow && typeof currencyRow.currency === "string" && currencyRow.currency.trim() !== ""
      ? currencyRow.currency.trim()
      : fallback.currency;

  return { brandName, currency, notifications };
}

// ---------------------------------------------------------------------------
// صياغة أسباب التجاوز والفشل بالعربية — هذا النص يقرؤه المالك في شاشة الإشعارات
// ---------------------------------------------------------------------------

const SKIP_REASONS: Record<string, Record<string, string>> = {
  telegram: {
    disabled: "القناة مطفأة من تبويب الإشعارات في الإعدادات",
    "no-credentials": "لا يوجد TELEGRAM_BOT_TOKEN في متغيرات البيئة",
    "no-recipient": "لم يُضبط معرّف محادثة تليجرام في الإعدادات",
  },
  email: {
    disabled: "القناة مطفأة من تبويب الإشعارات في الإعدادات",
    "no-credentials": "لا يوجد RESEND_API_KEY في متغيرات البيئة",
    "no-recipient": "لم يُضبط بريد الاستقبال في الإعدادات",
  },
};

function skipText(channel: string, reason: string): string {
  return SKIP_REASONS[channel]?.[reason] ?? reason;
}

/** سطر واحد يلخّص حصيلة قناة — يُخزَّن في عمود error ويظهر كما هو في اللوحة */
function outcomeText(outcome: ChannelOutcome): string {
  const name = channelLabel(outcome.channel);
  if (outcome.result === "sent") return `${name}: تم`;
  if (outcome.result === "skipped") return `${name}: متجاوَز — ${outcome.reason ?? ""}`.trim();
  return `${name}: فشل — ${outcome.reason ?? "خطأ غير معروف"}`;
}

function toOutcome(channel: string, result: SendOutcome): ChannelOutcome {
  if (result.ok) return { channel, result: "sent" };
  if (isSkipped(result)) {
    return { channel, result: "skipped", reason: skipText(channel, result.skipped) };
  }
  return { channel, result: "failed", reason: result.error };
}

// ---------------------------------------------------------------------------
// تسليم إشعار واحد
// ---------------------------------------------------------------------------

async function deliverOne(
  record: NotificationRecord,
  settings: WorkerSettings,
  baseUrl: string
): Promise<{ outcome: NotificationOutcome; errorText: string | null }> {
  const ctx: RenderContext = {
    brandName: settings.brandName,
    currency: settings.currency,
    baseUrl,
  };

  const event = String(record.event);

  /**
   * وجهة الرسالة (المرحلة ٦): أحداث البث الأربعة لها صياغتها ووجهتها.
   * `trip_offered` يذهب إلى قناة المتعهد نفسه إن عرفتها الحمولة، وإلا يسقط على
   * فريق التشغيل. وما عداه تشغيلي بحت فوجهته إعدادات اللوحة كالمعتاد.
   */
  const to = dispatchRecipients(event, record.payload ?? null, {
    telegramChatId: settings.notifications.telegramChatId,
    emailTo: settings.notifications.emailTo,
  });

  const message = isDispatchEvent(event)
    ? renderDispatchNotification(event, record.payload ?? null, ctx, to.audience)
    : renderNotification(event, record.payload ?? null, ctx);

  const requested =
    Array.isArray(record.channels) && record.channels.length > 0
      ? record.channels.map((c) => String(c))
      : DEFAULT_CHANNELS;

  const outcomes: ChannelOutcome[] = [];

  // لوحة التحكم: الصف نفسه هو الإشعار — لا تسليم خارجياً ولا أثر على الحالة
  if (requested.includes("dashboard")) {
    outcomes.push({ channel: "dashboard", result: "sent" });
  }

  const jobs: Promise<ChannelOutcome>[] = [];

  if (requested.includes("telegram")) {
    jobs.push(
      (async () => {
        if (!settings.notifications.telegramEnabled) {
          return toOutcome("telegram", { ok: false, skipped: "disabled" });
        }
        // متعهد بلا معرّف تليجرام: سبب التجاوز يخصّه هو، لا «راجع الإعدادات»
        if (to.audience === "partner" && !to.telegramChatId) {
          return {
            channel: "telegram",
            result: "skipped" as const,
            reason: "لا يوجد معرّف محادثة تليجرام مسجَّل لهذا المتعهد",
          };
        }
        const result = await sendTelegram(to.telegramChatId, toTelegramHtml(message, ctx));
        return toOutcome("telegram", result);
      })()
    );
  }

  if (requested.includes("email")) {
    jobs.push(
      (async () => {
        if (!settings.notifications.emailEnabled) {
          return toOutcome("email", { ok: false, skipped: "disabled" });
        }
        if (to.audience === "partner" && !to.emailTo) {
          return {
            channel: "email",
            result: "skipped" as const,
            reason: "لا يوجد بريد مسجَّل لهذا المتعهد",
          };
        }
        const result = await sendEmail(
          to.emailTo,
          toEmailSubject(message, ctx),
          toEmailHtml(message, ctx)
        );
        return toOutcome("email", result);
      })()
    );
  }

  const external = await Promise.all(jobs);
  outcomes.push(...external);

  // الحالة من القنوات الخارجية وحدها (لوحة التحكم مضمونة دائماً):
  // فشل واحد ⇒ failed (يستحق إعادة محاولة) — وإلا نجاح واحد ⇒ sent — وإلا skipped
  let status: NotificationStatus;
  if (external.length === 0) {
    status = "sent";
  } else if (external.some((o) => o.result === "failed")) {
    status = "failed";
  } else if (external.some((o) => o.result === "sent")) {
    status = "sent";
  } else {
    status = "skipped";
  }

  const notes = outcomes.filter((o) => o.result !== "sent").map(outcomeText);
  return {
    outcome: { id: record.id, event: String(record.event), status, channels: outcomes },
    errorText: notes.length > 0 ? notes.join(" · ") : null,
  };
}

/**
 * كتابة النتيجة على الصف — مع تراجع لأقل الحقول إن رفض المخطط أحدها.
 * ترجع false حين تفشل الكتابة تماماً: عندها يبقى الصف «في الطابور» وسيُعاد
 * إرساله في الدورة القادمة، لذلك نرفع الأمر في ملخّص الدورة بدل ابتلاعه
 * (تكرار صامت بلا سبب ظاهر أسوأ عطب ممكن في طابور إشعارات).
 */
async function writeResult(
  supabase: SupabaseClient,
  record: NotificationRecord,
  status: NotificationStatus,
  errorText: string | null
): Promise<boolean> {
  const attempts = typeof record.attempts === "number" ? record.attempts + 1 : 1;
  const full: Record<string, unknown> = {
    status,
    attempts,
    error: errorText,
  };
  // delivered_at يُكتب مرة واحدة عند أول تسليم ناجح ولا يُمسح بعدها
  if (status === "sent" && !record.delivered_at) full.delivered_at = new Date().toISOString();

  const first = await supabase.from("notifications").update(full).eq("id", record.id).select("id");
  // فخ الصفوف الصفرية: نجاح ظاهري بصفر صفوف = الكتابة لم تحدث
  if (!first.error && (first.data?.length ?? 0) > 0) return true;

  const second = await supabase
    .from("notifications")
    .update({ status })
    .eq("id", record.id)
    .select("id");
  return !second.error && (second.data?.length ?? 0) > 0;
}

// ---------------------------------------------------------------------------
// الدورة الكاملة
// ---------------------------------------------------------------------------

function emptySummary(reason: string, ok = false): DispatchSummary {
  return {
    ok,
    ranAt: new Date().toISOString(),
    processed: 0,
    sent: 0,
    skipped: 0,
    failed: 0,
    reason,
    results: [],
  };
}

/** رمز «الجدول غير موجود» من Postgres (42P01) أو من كاش مخطط PostgREST (PGRST205) */
function isMissingTable(code: string | undefined): boolean {
  return code === "42P01" || code === "PGRST205";
}

export async function dispatchNotifications(
  options: { limit?: number } = {}
): Promise<DispatchSummary> {
  if (running) return emptySummary("already-running");
  running = true;
  const startedAt = Date.now();

  try {
    const supabase = createServiceSupabase();
    if (!supabase) return emptySummary("no-service-client");

    const limit = Math.min(Math.max(options.limit ?? BATCH_LIMIT, 1), BATCH_LIMIT);

    const queue = await supabase
      .from("notifications")
      .select("*")
      .eq("status", "queued")
      .order("created_at", { ascending: true })
      .limit(limit);

    if (queue.error) {
      return emptySummary(isMissingTable(queue.error.code) ? "no-table" : "read-failed");
    }

    const records = (queue.data ?? []) as NotificationRecord[];
    if (records.length === 0) return emptySummary("empty-queue", true);

    const settings = await loadWorkerSettings(supabase);
    const baseUrl = getBaseUrl();

    const results: NotificationOutcome[] = [];
    let writeFailures = 0;

    for (let i = 0; i < records.length; i += CONCURRENCY) {
      if (Date.now() - startedAt > TIME_BUDGET_MS) break; // الباقي يبقى في الطابور
      const slice = records.slice(i, i + CONCURRENCY);
      const done = await Promise.all(
        slice.map(async (record) => {
          try {
            const { outcome, errorText } = await deliverOne(record, settings, baseUrl);
            const wrote = await writeResult(supabase, record, outcome.status, errorText);
            return { outcome, wrote };
          } catch (err) {
            // حارس أخير: خلل غير متوقع في صف واحد لا يوقف الدورة
            const reason = err instanceof Error ? err.message : "خطأ غير متوقع";
            const wrote = await writeResult(
              supabase,
              record,
              "failed",
              `عامل الإرسال: ${reason}`
            );
            return {
              outcome: {
                id: record.id,
                event: String(record.event),
                status: "failed" as NotificationStatus,
                channels: [],
              },
              wrote,
            };
          }
        })
      );
      for (const item of done) {
        results.push(item.outcome);
        if (!item.wrote) writeFailures += 1;
      }
    }

    return {
      ok: true,
      ranAt: new Date().toISOString(),
      processed: results.length,
      sent: results.filter((r) => r.status === "sent").length,
      skipped: results.filter((r) => r.status === "skipped").length,
      failed: results.filter((r) => r.status === "failed").length,
      reason: writeFailures > 0 ? "write-failed" : undefined,
      results,
    };
  } catch (err) {
    // العقد: لا استثناء يخرج من هذه الدالة إطلاقاً
    return emptySummary(err instanceof Error ? `worker-error: ${err.message}` : "worker-error");
  } finally {
    running = false;
  }
}

/** إحصاء الطابور — يخدم GET على مسار العامل وبطاقة الحالة في شاشة الإشعارات */
export async function getQueueStats(): Promise<QueueStats> {
  const empty: QueueStats = { ok: false, queued: 0, sent: 0, skipped: 0, failed: 0 };

  const supabase = createServiceSupabase();
  if (!supabase) return { ...empty, reason: "no-service-client" };

  const statuses: NotificationStatus[] = ["queued", "sent", "skipped", "failed"];
  const counts = await Promise.all(
    statuses.map((status) =>
      supabase
        .from("notifications")
        .select("id", { count: "exact", head: true })
        .eq("status", status)
    )
  );

  const failedRead = counts.find((res) => res.error);
  if (failedRead?.error) {
    return { ...empty, reason: isMissingTable(failedRead.error.code) ? "no-table" : "read-failed" };
  }

  return {
    ok: true,
    queued: counts[0].count ?? 0,
    sent: counts[1].count ?? 0,
    skipped: counts[2].count ?? 0,
    failed: counts[3].count ?? 0,
  };
}

/**
 * جاهزية القنوات — ما ينقص كل قناة بالضبط، للعرض في بطاقة الحالة.
 * تُقرأ من البيئة والإعدادات معاً ولا تكشف أي قيمة سرّية (بوليان فقط).
 */
export function channelReadiness(settings: NotificationSettings): ChannelReadiness[] {
  const telegramMissing: string[] = [];
  if (!settings.telegramEnabled) telegramMissing.push("القناة مطفأة من الإعدادات");
  if (!hasTelegramCredentials()) telegramMissing.push("TELEGRAM_BOT_TOKEN في ‎.env.local");
  if (!settings.telegramChatId) telegramMissing.push("معرّف محادثة تليجرام في الإعدادات");

  const emailMissing: string[] = [];
  if (!settings.emailEnabled) emailMissing.push("القناة مطفأة من الإعدادات");
  if (!hasEmailCredentials()) emailMissing.push("RESEND_API_KEY في ‎.env.local");
  if (!settings.emailTo) emailMissing.push("بريد الاستقبال في الإعدادات");

  return [
    { channel: "dashboard", label: "جرس لوحة التحكم", ready: true, missing: [] },
    {
      channel: "telegram",
      label: "بوت تليجرام",
      ready: telegramMissing.length === 0,
      missing: telegramMissing,
    },
    {
      channel: "email",
      label: "البريد الإلكتروني",
      ready: emailMissing.length === 0,
      missing: emailMissing,
    },
  ];
}
