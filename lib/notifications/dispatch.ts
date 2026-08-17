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
  isProviderReady,
  missingEnvFor,
  syncProviderReadiness,
} from "@/lib/notifications/providers";
import {
  DEFAULT_PARTNER_PREFS,
  type PartnerRoutingRow,
} from "@/lib/partner-alerts-types";
import {
  channelLabel,
  renderNotification,
  toEmailHtml,
  toEmailSubject,
  toTelegramHtml,
  type RenderContext,
  type RenderedMessage,
} from "@/lib/notifications/render";
import { hasTelegramCredentials, sendTelegram } from "@/lib/notifications/telegram";
import { deliverPushToPartner } from "@/lib/push/deliver";
import { buildPushPayload } from "@/lib/push/payload";
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
import { getSiteTimeZone } from "@/lib/site-timezone.server";

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
/**
 * القنوات المفترضة حين لا يحدّد الصف قنواته.
 *
 * ⚠ وهي قنوات **التشغيل** لا المتعهد: صفٌّ بلا قنوات هو صفٌّ لم تُحسب وجهته،
 * ووجهته الافتراضية اللوحة. ولا يُضاف إليها `inbox` ولا `webpush` — إضافةُ
 * قناةٍ هنا تجعل كل صفٍّ مشوّه يطرق باب المتعهدين.
 */
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
// توجيه لكل مستقبِل: قراءة المتعهدين المقصودين في الدورة دفعةً واحدة
// ---------------------------------------------------------------------------

/**
 * خريطة المتعهدين المقصودين في هذه الدورة.
 *
 * **قراءةٌ واحدة لكل دورة لا لكل صف**: موجةُ بثٍّ واحدة تُنتج صفاً لكل متعهد
 * مغطٍّ، فقراءةٌ لكل صفّ تعني عشرات الرحلات إلى القاعدة لصفوفٍ متجاورة.
 */
type PartnerMap = Map<string, PartnerRoutingRow>;

async function loadPartners(
  supabase: SupabaseClient,
  ids: readonly string[]
): Promise<PartnerMap> {
  const map: PartnerMap = new Map();
  if (ids.length === 0) return map;

  const [subs, prefs, pushes] = await Promise.all([
    supabase
      .from("subcontractors")
      .select("id, company_name, telegram_chat_id, email")
      .in("id", ids),
    supabase
      .from("partner_alert_prefs")
      .select(
        "subcontractor_id, telegram_enabled, webpush_enabled, inbox_enabled, email_enabled, accepting_offers"
      )
      .in("subcontractor_id", ids),
    supabase.from("partner_push_subscriptions").select("subcontractor_id").in("subcontractor_id", ids),
  ]);

  // متعهدٌ لا يُقرأ صفّه أصلاً ليس «بلا تفضيلات» — هو **غير موجود** في الخريطة،
  // فيصعّد الإشعار بـ`partner-not-found` بدل أن يُسلَّم على افتراضاتٍ متفائلة.
  if (subs.error || !Array.isArray(subs.data)) return map;

  const prefsById = new Map<string, Record<string, unknown>>();
  if (!prefs.error && Array.isArray(prefs.data)) {
    for (const row of prefs.data as Record<string, unknown>[]) {
      prefsById.set(String(row.subcontractor_id), row);
    }
  }

  const pushCount = new Map<string, number>();
  if (!pushes.error && Array.isArray(pushes.data)) {
    for (const row of pushes.data as { subcontractor_id: string }[]) {
      const key = String(row.subcontractor_id);
      pushCount.set(key, (pushCount.get(key) ?? 0) + 1);
    }
  }

  const flag = (row: Record<string, unknown> | undefined, key: string, fallback: boolean) =>
    row && typeof row[key] === "boolean" ? (row[key] as boolean) : fallback;

  for (const sub of subs.data as Record<string, unknown>[]) {
    const id = String(sub.id);
    const p = prefsById.get(id);
    map.set(id, {
      subcontractorId: id,
      companyName: typeof sub.company_name === "string" ? sub.company_name : "",
      telegramChatId:
        typeof sub.telegram_chat_id === "string" && sub.telegram_chat_id.trim() !== ""
          ? sub.telegram_chat_id.trim()
          : null,
      email: typeof sub.email === "string" && sub.email.trim() !== "" ? sub.email.trim() : null,
      prefs: {
        // 🔒 غيابُ صفّ التفضيلات ليس صمتاً — الافتراضات من العقد، نسخةٌ واحدة
        telegram_enabled: flag(p, "telegram_enabled", DEFAULT_PARTNER_PREFS.telegram_enabled),
        webpush_enabled: flag(p, "webpush_enabled", DEFAULT_PARTNER_PREFS.webpush_enabled),
        inbox_enabled: flag(p, "inbox_enabled", DEFAULT_PARTNER_PREFS.inbox_enabled),
        email_enabled: flag(p, "email_enabled", DEFAULT_PARTNER_PREFS.email_enabled),
        accepting_offers: flag(p, "accepting_offers", DEFAULT_PARTNER_PREFS.accepting_offers),
      },
      pushEndpoints: pushCount.get(id) ?? 0,
    });
  }

  return map;
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
  webpush: {
    disabled: "دفع الويب مطفأ عند هذا المتعهد",
    "no-credentials": "لا توجد مفاتيح VAPID في متغيرات البيئة",
    "no-recipient": "لا جهاز مسجَّلاً لدفع الويب عند هذا المتعهد",
  },
};

/**
 * رسائل التصعيد — رمزٌ واحد لكل سبب، والنص هنا للمالك في شاشة الإشعارات.
 * 🔒 وظهورُ أيٍّ منهما يعني أن عرضاً كان سيُبتلع صامتاً فأُنقذ.
 */
const ESCALATION_TEXT: Record<string, string> = {
  "partner-unreachable":
    "صُعِّد إلى فريق التشغيل: تعذّر بلوغ المتعهد على كل قناةٍ اختارها — أبلغه هاتفياً",
  "partner-not-found":
    "صُعِّد إلى فريق التشغيل: مستقبِل الإشعار لا يقابل متعهداً في القاعدة",
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
// بطاقة الجهاز — ما يُسمح بظهوره على شاشةٍ مقفلة
// ---------------------------------------------------------------------------

/**
 * 🔒 أسطر البطاقة — **قائمة سماحٍ لا قائمة منع** (D-19).
 *
 * البطاقة تظهر على شاشةٍ **مقفلة** يقرؤها من يقف بجوار الهاتف، وتمرّ قبلها
 * بخادم Apple/Google/Mozilla الذي يخزّنها حتى التسليم. فما يدخلها يُختار
 * صراحةً، ولا يُستبعَد منها ما نتذكّر استبعاده: قائمةُ المنع تُنسى أولَ يومٍ
 * يضيف فيه حدثٌ جديد سطراً، وقائمةُ السماح تُسقطه بالبناء.
 *
 * وأسوأ ما ينتج عن خطأٍ هنا سطرٌ ناقص في بطاقة — لا اسمُ عميلٍ على شاشةِ غريب.
 * («ملاحظات» و«رقم الطلب» خارجها بقصد: الأولى نصٌّ حرّ يكتبه العميل، والثاني
 * يضعه عاملُ الخدمة بنفسه في صدر السطر من الحقل `ref` فلا يتكرّر.)
 *
 * ⚠ و`ref` **ليس مرجع الحجز**: يأتي من `message.reference` وهي واعيةٌ بالجمهور
 * منذ 0056 — رمزُ الرحلة `#A1B2C3D4` للمتعهد، والمرجع لفريق التشغيل وحده.
 * فمن يبني هذه البطاقة من الحمولة مباشرةً يعيد التسريب الذي أغلقته تلك الهجرة.
 */
const PUSH_CARD_LABELS: readonly string[] = [
  "المسار",
  "الرحلة",
  "موعد الانطلاق",
  "مستحقك",
  "تنتهي المهلة",
];

/**
 * يبني بطاقة الجهاز من **الرسالة المصوغة نفسها** لا من صياغةٍ ثانية بجوارها:
 * نصّان لحدثٍ واحد ينحرفان بعد أول تعديل، ولا يقول ذلك أحد.
 *
 * والوجهة تُشتقّ من رابط الرسالة بحذف الأصل — لأن العقد يشترط مساراً نسبياً
 * (`safeUrl` في `lib/push/payload.ts` ثم ثانيةً في `public/sw.js`).
 */
function pushCardFor(record: NotificationRecord, message: RenderedMessage, baseUrl: string) {
  const base = baseUrl.replace(/\/+$/, "");
  const href = message.link?.href ?? "";
  const path = base && href.startsWith(base) ? href.slice(base.length) : href;

  const body = message.lines
    .filter((line) => PUSH_CARD_LABELS.includes(line.label))
    .slice(0, 4)
    .map((line) => `${line.label}: ${line.value}`)
    .join(" · ");

  return buildPushPayload({
    event: String(record.event),
    title: message.title,
    // بطاقةٌ بلا سطرٍ مسموح خيرٌ لها جملةُ الحدث من فراغ
    body: body || message.lead,
    url: path || "/portal",
    /**
     * الوسم **معرّف الصف** لا اسم الحدث: عرضان لرحلتين مختلفتين بطاقتان
     * متجاورتان، لا واحدةٌ تبتلع الأخرى (تعليق `PushPayload.tag` في العقد).
     */
    tag: record.id,
    ref: message.reference,
  });
}

// ---------------------------------------------------------------------------
// تسليم إشعار واحد
// ---------------------------------------------------------------------------

async function deliverOne(
  supabase: SupabaseClient,
  record: NotificationRecord,
  settings: WorkerSettings,
  baseUrl: string,
  partners: PartnerMap
): Promise<{ outcome: NotificationOutcome; errorText: string | null }> {
  const ctx: RenderContext = {
    brandName: settings.brandName,
    currency: settings.currency,
    baseUrl,
  };

  const event = String(record.event);

  /**
   * ── التوجيه لكل مستقبِل (0054) ──────────────────────────────────────────
   *
   * القنوات المفعَّلة تُقرأ من **صاحب الصف**: تفضيلاتِ المتعهد إن كان الصف له،
   * وإعداداتِ المالك إن كان تشغيلياً. وهذا هو التعديل الجوهري كله — قبله كانت
   * `notification_channels()` تقرأ إعدادات المالك **وتقرّر للجميع**.
   */
  const recipientKind = String(record.recipient_kind ?? "ops") === "partner" ? "partner" : "ops";
  const recipientId = record.recipient_id ? String(record.recipient_id) : null;
  const partner = recipientKind === "partner" && recipientId ? partners.get(recipientId) : undefined;

  /**
   * ⚠ **القنوات تُحسب قبل الوجهة** — وهذا الترتيب هو الإصلاح نفسه لا تنظيماً.
   * كانت الوجهة تُقرَّر أولاً من «هل للمتعهد عنوان؟» ثم تُحسب القنوات، فيصير
   * المتعهد جمهوراً بعنوان بريدٍ على قناةٍ غير مطلوبة، ويسقط الاحتياطي إلى فريق
   * التشغيل بلا أن يُنادى. الشرح الكامل عند `dispatchRecipients`.
   */
  const requested =
    Array.isArray(record.channels) && record.channels.length > 0
      ? record.channels.map((c) => String(c))
      : DEFAULT_CHANNELS;

  /**
   * وجهة الرسالة (المرحلة ٦): أحداث البث الأربعة لها صياغتها ووجهتها.
   * `trip_offered` يذهب إلى قناة المتعهد نفسه **إن كان بالغاً عليها فعلاً**،
   * وإلا يسقط على فريق التشغيل. وما عداه تشغيلي بحت فوجهته إعدادات اللوحة.
   */
  const to = dispatchRecipients(
    event,
    // حمولةُ الصف قد تسبق تسجيل معرّف تليجرام — فالوجهة الحيّة تُرجَّح عليها
    partner
      ? { ...(record.payload ?? {}), partnerTelegramChatId: partner.telegramChatId, partnerEmail: partner.email }
      : (record.payload ?? null),
    {
      telegramChatId: settings.notifications.telegramChatId,
      emailTo: settings.notifications.emailTo,
    },
    partner
      ? {
          requested,
          // 🔒 تفضيلاتُ المتعهد **وجاهزيةُ المزوّد** معاً: مفتاحٌ مفعَّل بلا
          // مزوّد ليس قناةً بالغة، وعدُّه بلوغاً يُسكِت الاحتياطي.
          telegramEnabled: partner.prefs.telegram_enabled && isProviderReady("telegram"),
          emailEnabled: partner.prefs.email_enabled && isProviderReady("email"),
          webpushEnabled: partner.prefs.webpush_enabled && isProviderReady("webpush"),
          webpushSubscribed: partner.pushEndpoints > 0,
        }
      : {
          requested,
          telegramEnabled: settings.notifications.telegramEnabled,
          emailEnabled: settings.notifications.emailEnabled,
        },
    { kind: recipientKind, found: recipientKind === "ops" || partner !== undefined }
  );

  /**
   * قنوات **التسليم** بعد معرفة الجمهور.
   *
   * ⚠ وهنا فرقٌ يسهل السهو عنه: صفُّ المتعهد يحمل قنوات المتعهد، فإن صُعِّد
   * إلى التشغيل وجب التسليم على قنوات **المالك** لا على قنواته هو — وإلا
   * سلّمنا «الاحتياطي» على القنوات نفسها التي تعذّر بلوغها، أي لم نصعّد شيئاً.
   */
  const delivering =
    to.audience === "ops" && recipientKind === "partner" ? DEFAULT_CHANNELS : requested;

  /**
   * ⚠ **والجمهور يُمرَّر إلى الراسمَين معاً** — لا إلى راسم البثّ وحده.
   *
   * كان `renderNotification` يُنادى بلا جمهور، فيبني وجهةً واحدة للجميع هي
   * صفحةُ العميل: فالمالك يهبط على `/booking/<token>` بدل صفحة الطلب في لوحته
   * (بلاغ المالك 2026-08-17)، **وأيُّ حدثٍ غير بثّي يُوجَّه غداً إلى متعهد**
   * كان سيسلّمه إجماليَ العميل ومرجعه واسمه وإحداثيات التقاطه (D-19 · D-46).
   * و`to.audience` محسوبٌ أعلاه بالفعل — فتمريره هو كل ما كان ينقص.
   */
  const message = isDispatchEvent(event)
    ? renderDispatchNotification(event, record.payload ?? null, ctx, to.audience)
    : renderNotification(event, record.payload ?? null, ctx, to.audience);

  const outcomes: ChannelOutcome[] = [];

  /**
   * مفتاحُ القناة يُقرأ من **صاحب التسليم**، لا من المالك دائماً.
   *
   * ⚠ ولماذا لا يكون مفتاح المالك مفتاحاً رئيسياً فوق الجميع؟ لأن ذلك يعيد
   * العيب نفسه من بابٍ آخر: القاعدة تحسب المتعهد «بالغاً على تليجرام» فيتخطّى
   * البثُّ غيره لصالحه، ثم يُوسم التسليم «متجاوَزاً» لأن مفتاح **المالك** مطفأ
   * — فلا يصل العرض ولا يُنادى الاحتياطي. مفتاح المالك يحكم صفوف التشغيل،
   * ومفتاح المتعهد يحكم صفوفه هو. وهذا هو التوجيه لكل مستقبِل بعينه.
   */
  const partnerBound = to.audience === "partner" && partner !== undefined;
  const telegramOn = partnerBound
    ? partner!.prefs.telegram_enabled
    : settings.notifications.telegramEnabled;
  const emailOn = partnerBound
    ? partner!.prefs.email_enabled
    : settings.notifications.emailEnabled;

  // لوحة التحكم: الصف نفسه هو الإشعار — لا تسليم خارجياً ولا أثر على الحالة
  if (delivering.includes("dashboard")) {
    outcomes.push({ channel: "dashboard", result: "sent" });
  }

  /**
   * صندوق البورتال: الصفُّ نفسه هو التسليم (يقرؤه `portal_inbox()`).
   * 🔒 ولا يدخل حساب الحالة — كـ`dashboard` تماماً — لأنه **لا يبلغ صاحبه**؛
   * ولو عُدّ نجاحاً لظهر كل عرضٍ «أُرسل» بينما لم يصل المتعهدَ شيء.
   */
  if (delivering.includes("inbox")) {
    outcomes.push({ channel: "inbox", result: "sent" });
  }

  const jobs: Promise<ChannelOutcome>[] = [];

  if (delivering.includes("telegram")) {
    jobs.push(
      (async () => {
        if (!telegramOn) {
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

  if (delivering.includes("email")) {
    jobs.push(
      (async () => {
        if (!emailOn) {
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

  /**
   * دفع الويب — **موصولٌ بطبقة التسليم** (`lib/push/deliver.ts`).
   *
   * ⚠ **قناةُ متعهدٍ وحده**: لا جهاز مسجَّلاً لفريق التشغيل، و`notification_channels()`
   * لا تُرجعها لصفوف التشغيل أصلاً. فصفٌّ تشغيلي يطلبها صفٌّ **بلا مستقبِل**،
   * لا فشلٌ يستحق إعادة محاولة — ولذلك يخرج بـ`no-recipient` لا بخطأ.
   *
   * وثلاثة أشياء لا تتغيّر مهما ساءت الحال:
   *   ١. **لا استثناء يخرج من هنا** — `deliverPushToPartner` لا ترمي أبداً،
   *      والفشل يعود في `reason`؛ فالمهمة تُسلَّم إلى `Promise.all` مع تليجرام
   *      والبريد بلا أن تُسقط الإشعار كله.
   *   ٢. **فشلُ الدفع لا يُفشل القنوات الأخرى** — كلٌّ يسجّل حصيلته وحده، وحالةُ
   *      الصف تُحسب من مجموعها كما هي منذ المرحلة ٤.
   *   ٣. 🔒 **الاشتراك الميت يُحذف ولا يُعاد عليه.** الحذف داخل طبقة التسليم
   *      (٤٠٤/٤١٠ ⇒ `gone`)، وحين لا يبقى بعده جهازٌ واحد فالحصيلة **«لا
   *      مستقبِل» لا «فشل»**: صفٌّ حُذف لأنه مات ليس خطأً مؤقتاً، وعدّه فشلاً
   *      يضع الصف في طابور إعادةٍ لا نهاية له على جهازٍ لم يعد موجوداً.
   */
  if (delivering.includes("webpush")) {
    jobs.push(
      (async () => {
        if (!partnerBound) {
          return toOutcome("webpush", { ok: false, skipped: "no-recipient" });
        }
        if (!partner!.prefs.webpush_enabled) {
          return toOutcome("webpush", { ok: false, skipped: "disabled" });
        }
        if (!isProviderReady("webpush")) {
          return toOutcome("webpush", { ok: false, skipped: "no-credentials" });
        }
        // عدُّ الأجهزة مقروءٌ سلفاً لهذه الدورة — فحصٌ بلا رحلةٍ إلى القاعدة
        if (partner!.pushEndpoints === 0) {
          return toOutcome("webpush", { ok: false, skipped: "no-recipient" });
        }

        const report = await deliverPushToPartner(
          supabase,
          partner!.subcontractorId,
          pushCardFor(record, message, baseUrl),
          /**
           * `high` لا `normal`: أندرويد يؤجّل رسائل `normal` في وضع توفير
           * الطاقة إلى نافذة الصيانة التالية — وقد تكون **بعد** انتهاء مهلة
           * موجة البث، فيصل العرض بعد أن مات.
           */
          { urgency: "high" }
        );

        // «نجح» = جهازٌ واحد على الأقل (عقد `PushDeliveryReport`)
        if (report.sent > 0) return toOutcome("webpush", { ok: true });

        // لا جهاز أصلاً، أو ماتت كل أجهزته وحُذفت في هذه الدورة نفسها
        if (report.targets === 0 || report.pruned >= report.targets) {
          return toOutcome("webpush", { ok: false, skipped: "no-recipient" });
        }

        return toOutcome("webpush", {
          ok: false,
          error: report.reason ?? "دفع الويب: فشل بلا سبب معروف",
        });
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
  // سببُ التصعيد أول ما يُقرأ في الشاشة — فيتصدّر السطر لا يُذيَّل به
  if (to.escalation) notes.unshift(ESCALATION_TEXT[to.escalation] ?? to.escalation);

  return {
    outcome: {
      id: record.id,
      event: String(record.event),
      status,
      channels: outcomes,
      escalation: to.escalation,
    },
    errorText: notes.length > 0 ? notes.join(" · ") : null,
  };
}

/**
 * كتابة النتيجة على الصف — مع تراجع لأقل الحقول إن رفض المخطط أحدها.
 * ترجع false حين تفشل الكتابة تماماً: عندها يبقى الصف «في الطابور» وسيُعاد
 * إرساله في الدورة القادمة، لذلك نرفع الأمر في ملخّص الدورة بدل ابتلاعه
 * (تكرار صامت بلا سبب ظاهر أسوأ عطب ممكن في طابور إشعارات).
 *
 * ── التراجع **ثلاث درجات** لا درجتان (0077) ────────────────────────────────
 *
 * `channel_outcomes` عمودٌ جديد، وقاعدةٌ لم تُهاجَر بعد ترفض الكتابة كلها.
 * ولو بقي التراجع درجتين (كامل ⇒ `status` وحدها) لكان أول خادمٍ بلا الهجرة
 * **يفقد `attempts` و`error` و`escalation` معاً** — أي يفقد سببَ الفشل نفسه
 * الذي وُجد العمود ليوضّحه. فالدرجة الوسطى تحفظ ما كان يُكتب قبل 0077 حرفياً.
 */
async function writeResult(
  supabase: SupabaseClient,
  record: NotificationRecord,
  status: NotificationStatus,
  errorText: string | null,
  escalation?: string,
  /** حصيلة كل قناة — تُخزَّن كما حُسبت، ولا تُذاب في جملة (0077) */
  channelOutcomes?: ChannelOutcome[]
): Promise<boolean> {
  const attempts = typeof record.attempts === "number" ? record.attempts + 1 : 1;
  /** ما كان يُكتب قبل 0077 — وهو درجة التراجع الوسطى بعينها */
  const legacy: Record<string, unknown> = {
    status,
    attempts,
    error: errorText,
    // رمزٌ لا جملة — يُخزَّن ليُصفّى عليه لاحقاً («كم عرضاً صُعِّد هذا الأسبوع؟»)
    escalation: escalation ?? null,
  };
  // delivered_at يُكتب مرة واحدة عند أول تسليم ناجح ولا يُمسح بعدها
  if (status === "sent" && !record.delivered_at) legacy.delivered_at = new Date().toISOString();

  const full: Record<string, unknown> = {
    ...legacy,
    // مصفوفةٌ دائماً (القيد في القاعدة يفرض ذلك) — و«صفر قناة خارجية» تُكتب `[]`
    // لا `null`: الفرق بين «لا قناة» و«قبل 0077» يجب أن يبقى مقروءاً في الشاشة.
    channel_outcomes: channelOutcomes ?? [],
  };

  const first = await supabase.from("notifications").update(full).eq("id", record.id).select("id");
  // فخ الصفوف الصفرية: نجاح ظاهري بصفر صفوف = الكتابة لم تحدث
  if (!first.error && (first.data?.length ?? 0) > 0) return true;

  const second = await supabase
    .from("notifications")
    .update(legacy)
    .eq("id", record.id)
    .select("id");
  if (!second.error && (second.data?.length ?? 0) > 0) return true;

  const third = await supabase
    .from("notifications")
    .update({ status })
    .eq("id", record.id)
    .select("id");
  return !third.error && (third.data?.length ?? 0) > 0;
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
    /**
     * 🔴 **منطقة الموقع أولاً** (هجرة 0075): هذا العامل يعمل من `/api` ومن زرّ
     * اللوحة، ومسار `/api` **لا يمرّ بالتخطيط** فلا يضبط `i18n/request.ts`
     * الوحدةَ المشتركة. وبلا هذا السطر تُرسَم مواعيد الرحلات في تليجرام
     * والبريد بالمنطقة الافتراضية بينما تعرضها الشاشة بمنطقة المالك —
     * رقمان لشيء واحد، وأسوأهما أن المتعهد يقرأ الخطأ لا نحن.
     */
    await getSiteTimeZone();

    const supabase = createServiceSupabase();
    if (!supabase) return emptySummary("no-service-client");

    /**
     * ⚠ **قبل قراءة الطابور، لا بعد الخروج منه فارغاً.**
     *
     * وُضعت هذه السطور أولاً بعد قراءة الطابور فسقطت عملياً: الطابور فارغٌ في
     * الأغلب الساحق من الدورات، والخروج المبكر كان يتخطّى المزامنة — فتبقى
     * جاهزيةُ المزوّدين في القاعدة **كما بذرتها الهجرة** إلى أن يصادف وجودُ
     * صفٍّ في الطابور. وليست شاشةً تتأخر: القاعدة تحسب بها **إتاحة المتعهد**،
     * فحوض البث يقرّر على معلومةٍ قديمة — أي **من يصله العرض** أصلاً.
     *
     * وسقوطُها كان يفشل في الاتجاه المتحفّظ (قناةٌ تُحسب مطفأة فيُصعَّد إلى
     * التشغيل بدل الابتلاع الصامت)، لكن «يفشل في الاتجاه الآمن» ليس «يعمل».
     */
    const providersSynced = await syncProviderReadiness(supabase);

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
    // والطابور الفارغ دورةٌ ناجحة — لكنها تُبلّغ عن فشل المزامنة إن وقع،
    // فلا يمرّ العطبُ الصامت الذي يغيّر حساب الإتاحة على الشبكة كلها
    if (records.length === 0) {
      return emptySummary(providersSynced ? "empty-queue" : "providers-stale", true);
    }

    const settings = await loadWorkerSettings(supabase);
    const baseUrl = getBaseUrl();

    // المتعهدون المقصودون في هذه الدفعة — قراءةٌ واحدة لا واحدةٌ لكل صف
    const partnerIds = Array.from(
      new Set(
        records
          .filter((r) => String(r.recipient_kind ?? "ops") === "partner" && r.recipient_id)
          .map((r) => String(r.recipient_id))
      )
    );
    const partners = await loadPartners(supabase, partnerIds);

    const results: NotificationOutcome[] = [];
    let writeFailures = 0;

    for (let i = 0; i < records.length; i += CONCURRENCY) {
      if (Date.now() - startedAt > TIME_BUDGET_MS) break; // الباقي يبقى في الطابور
      const slice = records.slice(i, i + CONCURRENCY);
      const done = await Promise.all(
        slice.map(async (record) => {
          try {
            const { outcome, errorText } = await deliverOne(
              supabase,
              record,
              settings,
              baseUrl,
              partners
            );
            const wrote = await writeResult(
              supabase,
              record,
              outcome.status,
              errorText,
              outcome.escalation,
              outcome.channels
            );
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
      // فشلُ مزامنة الجاهزية يُرفع ولا يُبتلع: الإتاحة تُحسب بعده على قيمةٍ
      // قديمة، وذلك يغيّر **من يصله العرض** لا شكل شاشةٍ فقط
      reason: writeFailures > 0 ? "write-failed" : providersSynced ? undefined : "providers-stale",
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

  /**
   * دفع الويب في بطاقة المالك رغم أنها **قناة متعهد**.
   *
   * ولماذا هنا؟ لأن ما ينقصها ينقصه **هو**: مفاتيح VAPID في بيئة الخادم. وبلا
   * هذا السطر تبقى القناة مظلمة ولا شاشةَ إدارةٍ واحدة تقول السبب — يراه المتعهد
   * في `/portal/notifications` («المزوّد غير مضبوط») ولا يراه من يملك إصلاحه.
   * ولا مفتاح لها في الإعدادات: القيمة **مقيسة** من البيئة لا مُدخَلة (D-53).
   */
  const webpushMissing = missingEnvFor("webpush").map((name) => `${name} في ‎.env.local`);

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
    {
      channel: "webpush",
      label: channelLabel("webpush"),
      ready: webpushMissing.length === 0,
      missing: webpushMissing,
    },
  ];
}
