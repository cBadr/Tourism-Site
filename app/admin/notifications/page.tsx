import Link from "next/link";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  AlertTriangle,
  BellRing,
  Check,
  CheckCheck,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  CircleDot,
  CircleSlash,
  Eye,
  EyeOff,
  KeyRound,
  Minus,
  RefreshCw,
  Send,
  Undo2,
  X,
  XCircle,
} from "lucide-react";

import { toArabicDigits } from "@/components/booking/format";
import { HelpTip } from "@/components/shared/HelpTip";
import { PagePulse } from "@/components/stats/page-pulse";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { channelReadiness } from "@/lib/notifications/dispatch";
import { emailFrom } from "@/lib/notifications/email";
import {
  CHANNEL_LABELS,
  EVENT_TITLES,
  audienceLink,
  channelLabel,
  eventEmoji,
  eventTitle,
  formatDateTime,
  notificationBrief,
  statusLabel,
} from "@/lib/notifications/render";
import type { ChannelOutcome } from "@/lib/notifications/types";
import { getSettings } from "@/lib/settings";
import { readPagePulse } from "@/lib/stats/pulse";
import { createServerSupabase } from "@/lib/supabase/server";

import { controlClass } from "../orders/_components/booking-ui";
import {
  dismissNotification,
  markAllRead,
  restoreNotification,
  retryNotification,
  runDispatch,
} from "./actions";

/**
 * مركز الإشعارات — الشاشة التي يرى فيها المالك أنبوب الإشعارات كله:
 * ما وصل، وما تجاوزه النظام ولماذا، وما فشل ويستحق إعادة محاولة.
 *
 * ── 🔴 القاعدة التي تحكم كل سطر هنا: **سجلُّ تسليم لا قائمةُ واجهة** ──────────
 *
 * هذه الشاشة تعرض **كل** صف: المقروء والمكنوس وصفوف المتعهدين معاً. لا إخفاء
 * ولا حذف — الجرس في الشريط العلوي هو سطح «ما الجديد»، وهذه الشاشة سطح «ماذا
 * أُرسل، وهل وصل». وفي 2026-08-16 شُخِّص عيبُ تسليمٍ حقيقي (‏`trip_offered` لا
 * يبلغ أحداً) **من هذه الصفوف نفسها**، فصفٌّ يُخفى اليوم هو عطلٌ لا يُشخَّص غداً.
 *
 * فلسفة الشاشة: **لا سحر ولا صمت**. القناة التي تنقصها بيانات اعتماد تُقال
 * صراحة مع مكان إضافتها بالضبط، لأن أسوأ ما يصيب أنبوب إشعارات أن يبدو شغالاً
 * وهو صامت. والقناة التي فشلت تُرى **فاشلة** لا شارةً محايدة (‏`0077`).
 *
 * وكل حالة الشاشة في الرابط: خمسة مرشّحات وصفحةٌ — فرابط «أرِني ما فشل على
 * تليجرام لمتعهدٍ هذا الأسبوع» يُنسخ ويُرسل ويُحفظ في المفضلة.
 */

export const metadata = { title: "الإشعارات" };

const LIST_LIMIT = 50;

/**
 * سقفُ الصفحات قبل أي نداء — حاجزٌ ضد `?page=999999999` الذي يطلب من القاعدة
 * إزاحةً بمليارات الصفوف. والحد الحقيقي يُحسب بعد العدّ ويُقال للمالك صراحةً.
 */
const MAX_PAGE = 500;

type Row = {
  id: string;
  event: string;
  payload: Record<string, unknown> | null;
  channels: string[] | null;
  status: string;
  attempts: number | null;
  error: string | null;
  created_at: string | null;
  delivered_at: string | null;
  /** أضافته 0054 — `not null default 'ops'`، وغيابه على خادمٍ أقدم يُقرأ «تشغيل» */
  recipient_kind: string | null;
  /** حالةُ عرضٍ لا تسليم (0054 · 0077) */
  read_at: string | null;
  dismissed_at: string | null;
  /**
   * ⚠ `unknown` عمداً: العمود `jsonb` حرٌّ من القاعدة، وتحويله إلى
   * `ChannelOutcome[]` بـ`as` وحده ادّعاءُ شكلٍ لم يُفحص — والشاشة تقرؤه
   * بـ`.map()`. القراءة تمرّ بـ`parseOutcomes` وحدها.
   */
  channel_outcomes: unknown;
};

// ---------------------------------------------------------------------------
// المرشّحات — كلها من الرابط، وكلها تُطابَق بقائمتها قبل أن تُستعمل
// ---------------------------------------------------------------------------

const STATUS_KEYS = ["queued", "sent", "skipped", "failed"] as const;

/** حالات الطابور — التسميات من `STATUS_LABELS` لا مكتوبةً هنا مرة ثانية */
const STATUS_FILTERS = [
  { key: "all", label: "الكل" },
  ...STATUS_KEYS.map((key) => ({ key, label: statusLabel(key) })),
] as const;

const AUDIENCE_FILTERS = [
  { key: "all", label: "كل الوجهات" },
  { key: "ops", label: "فريق التشغيل" },
  { key: "partner", label: "متعهد" },
] as const;

const VIEW_FILTERS = [
  { key: "all", label: "كل حالات العرض" },
  { key: "open", label: "مفتوح" },
  { key: "read", label: "مقروء" },
  { key: "dismissed", label: "مُكنَس" },
] as const;

/**
 * الأحداث والقنوات **تُبنى من خرائط `render.ts` نفسها** لا من قائمةٍ مكتوبة
 * هنا: حدثٌ جديد يُضاف هناك يظهر مرشّحه بلا لمس هذا الملف — وهو بعينه ما منع
 * ظهور أحداث البثّ الأربعة في الشاشة حين أُضيفت.
 */
const EVENT_KEYS = Object.keys(EVENT_TITLES);
const CHANNEL_KEYS = Object.keys(CHANNEL_LABELS);

type Filters = {
  status: string;
  event: string;
  audience: string;
  channel: string;
  view: string;
  page: number;
};

/** قيمةٌ من الرابط لا تُستعمل إلا بعد مطابقتها بقائمتها — والمجهول يسقط إلى «all» */
function pickFilter(value: string | string[] | undefined, allowed: readonly string[]): string {
  return typeof value === "string" && allowed.includes(value) ? value : "all";
}

/** رقم الصفحة: عدد صحيح موجب داخل السقف — وما عداه الصفحة الأولى */
function pickPage(value: string | string[] | undefined): number {
  if (typeof value !== "string" || !/^\d{1,4}$/.test(value)) return 1;
  const page = Number(value);
  return page >= 1 && page <= MAX_PAGE ? page : 1;
}

/** المرشّحات الفعّالة كسلسلة استعلام — «all» والصفحة الأولى لا تُكتبان */
function toQuery(f: Filters): string {
  const qs = new URLSearchParams();
  if (f.status !== "all") qs.set("status", f.status);
  if (f.event !== "all") qs.set("event", f.event);
  if (f.audience !== "all") qs.set("audience", f.audience);
  if (f.channel !== "all") qs.set("channel", f.channel);
  if (f.view !== "all") qs.set("view", f.view);
  if (f.page > 1) qs.set("page", String(f.page));
  return qs.toString();
}

/**
 * رابطٌ يحمل **كل** المرشّحات الفعّالة مع تعديل واحد.
 *
 * وتغييرُ أي مرشّح يعيد الترقيم إلى الصفحة الأولى ما لم تُذكر الصفحة صراحةً:
 * «الصفحة السابعة» من ترشيحٍ آخر قد لا توجد أصلاً، فيهبط المالك على جدول فارغ
 * ظاهرُه «لا شيء هنا».
 */
function hrefWith(f: Filters, patch: Partial<Filters>): string {
  const qs = toQuery({ ...f, page: 1, ...patch });
  return qs ? `/admin/notifications?${qs}` : "/admin/notifications";
}

const ERROR_MESSAGES: Record<string, string> = {
  id: "لم يصل معرّف الإشعار.",
  forbidden:
    "هذا الإجراء متاح لحساب دوره admin فقط — وقاعدة البيانات يجب أن تكون مربوطة (راجع supabase/README.md).",
  retry: "تعذّرت إعادة الجدولة — تأكد أنك مسجل الدخول بحساب admin وأن الإشعار ما زال موجوداً.",
  dismiss:
    "تعذّر كنس الإشعار — الصفوف الموجَّهة إلى متعهد لا تُكنس من هنا (حالة قراءتها تخصّه هو)، وربما كان الصف مكنوساً سلفاً.",
  restore: "تعذّرت إعادة الإشعار إلى الجرس — ربما كان مفتوحاً أصلاً، أو أن الصف يخصّ متعهداً.",
  read: "تعذّر تعليم الإشعارات كمقروءة — تأكد أنك مسجل الدخول بحساب admin وأن هجرة 0077 منفَّذة.",
};

const REASON_MESSAGES: Record<string, string> = {
  "no-service-client":
    "عامل الإرسال يحتاج SUPABASE_SERVICE_ROLE_KEY في ‎.env.local — بدونه لا يستطيع قراءة الطابور.",
  "no-table": "جدول notifications غير موجود — نفِّذ هجرة المرحلة ٤ ثم أعد المحاولة.",
  "read-failed": "تعذّرت قراءة طابور الإشعارات من قاعدة البيانات.",
  "empty-queue": "لا شيء في الطابور — كل الإشعارات مُعالَجة.",
  "already-running": "دورة إرسال أخرى تعمل الآن — انتظر ثوانٍ ثم أعد المحاولة.",
  "write-failed":
    "تعذّر تسجيل نتيجة الإرسال على بعض الصفوف، وستُعاد محاولتها في الدورة القادمة — تأكد أن حالات جدول notifications تقبل sent/skipped/failed وأن مفتاح الخدمة صالح.",
};

const STATUS_STYLES: Record<string, string> = {
  sent: "border-emerald-300 bg-emerald-50 text-emerald-900 dark:border-emerald-700 dark:bg-emerald-950 dark:text-emerald-100",
  queued: "border-amber-300 bg-amber-50 text-amber-900 dark:border-amber-700 dark:bg-amber-950 dark:text-amber-100",
  skipped: "border-border bg-muted text-muted-foreground",
  failed:
    "border-red-300 bg-red-50 text-red-900 dark:border-red-700 dark:bg-red-950 dark:text-red-100",
};

/** حصيلة القناة الواحدة — بنفس نمط `STATUS_STYLES` ومعها بديلها الداكن */
const OUTCOME_STYLES: Record<ChannelOutcome["result"], string> = {
  sent: "border-emerald-300 bg-emerald-50 text-emerald-900 dark:border-emerald-700 dark:bg-emerald-950 dark:text-emerald-100",
  skipped: "border-border bg-muted text-muted-foreground",
  failed:
    "border-red-300 bg-red-50 text-red-900 dark:border-red-700 dark:bg-red-950 dark:text-red-100",
};

const num = (v: number | null | undefined) => toArabicDigits(v ?? 0);

/** رقم قادم من الرابط — يُطبَّع قبل العرض (قد يصل كمصفوفة أو غائباً) */
const qsNum = (v: string | string[] | undefined) =>
  toArabicDigits(typeof v === "string" && /^\d+$/.test(v) ? v : "0");

/** وجهة الصف كما تُقال للمالك — والغياب «تشغيل» كما تقرؤه القاعدة (0054) */
const audienceLabel = (kind: string | null) => (kind === "partner" ? "متعهد" : "فريق التشغيل");

// ---------------------------------------------------------------------------
// قراءة السجل
// ---------------------------------------------------------------------------

/**
 * يُطبّق المرشّحات على أي استعلام على `notifications` — **موضعٌ واحد** يخدم
 * صفوف الصفحة وعدّادات الحالات معاً، فلا ينحرف رقمٌ عن جدولٍ يُفترض أنه يعدّه.
 *
 * ⚠ ومرشّحا `view` وحدهما يلمسان عمودَي `0077`: على قاعدةٍ لم تُهاجَر يبقى
 * «كل حالات العرض» (الافتراضي) شغّالاً بلا نقصان، ولا تنكسر الشاشة كلها.
 */
function scoped(supabase: SupabaseClient, f: Filters, head: boolean) {
  let q = head
    ? supabase.from("notifications").select("id", { count: "exact", head: true })
    : supabase.from("notifications").select("*");

  if (f.status !== "all") q = q.eq("status", f.status);
  if (f.event !== "all") q = q.eq("event", f.event);
  if (f.audience !== "all") q = q.eq("recipient_kind", f.audience);
  // القنوات مصفوفة نصية في القاعدة — و«يحتوي» هو السؤال الصحيح عليها
  if (f.channel !== "all") q = q.contains("channels", [f.channel]);

  if (f.view === "open") q = q.is("read_at", null).is("dismissed_at", null);
  else if (f.view === "read") q = q.not("read_at", "is", null);
  else if (f.view === "dismissed") q = q.not("dismissed_at", "is", null);

  return q;
}

type LogPage = {
  rows: Row[];
  ready: boolean;
  /** عدّاد لكل حالة **ضمن بقية المرشّحات** — أو null إن تعذّر العدّ */
  counts: Record<string, number> | null;
  /** إجمالي ما يطابق المرشّحات كلها — أساس الترقيم */
  total: number | null;
};

/**
 * قراءةٌ واحدة تخدم الجدول والعدّادات والترقيم — بعميلٍ واحد ونداءٍ متوازٍ.
 *
 * والعدّادات **مقيَّدة ببقية المرشّحات** عمداً: رقمٌ بجوار «فشل» يجب أن يعني
 * «فشل ضمن ما تراه الآن» لا «فشل في الطابور كله» — وإلا نقر المالك على الرقم
 * فوجد أقل منه، وهي أسرع طريقة لإفقاد عدّادٍ ثقتَه.
 *
 * ولا يكلّف ذلك نداءً إضافياً: مجموع العدّادات هو إجمالي الترقيم نفسه.
 */
async function loadLog(supabase: SupabaseClient | null, f: Filters): Promise<LogPage> {
  if (!supabase) return { rows: [], ready: false, counts: null, total: null };

  const from = (f.page - 1) * LIST_LIMIT;

  /**
   * ⚠ `id` فاصلٌ ثانٍ لا زينة: موجةُ بثٍّ واحدة تُدرج صفّاً لكل متعهد **في
   * المعاملة نفسها**، فـ`created_at` متطابق بينها تماماً. وترتيبٌ بعمودٍ غير
   * فريد يجعل الإزاحة تعيد صفاً وتُسقط آخر بين صفحتين.
   */
  const rowsQuery = scoped(supabase, f, false)
    .order("created_at", { ascending: false })
    .order("id", { ascending: false })
    .range(from, from + LIST_LIMIT - 1);

  const [rowsRes, countRes] = await Promise.all([
    rowsQuery,
    Promise.all(STATUS_KEYS.map((key) => scoped(supabase, { ...f, status: key }, true))),
  ]);

  if (rowsRes.error) return { rows: [], ready: false, counts: null, total: null };
  const rows = (rowsRes.data ?? []) as Row[];

  if (countRes.some((r) => r.error)) {
    // الجدول يُقرأ والعدّ لا — تُعرض الصفوف بلا أرقامٍ نصف صادقة
    return { rows, ready: true, counts: null, total: null };
  }

  const counts: Record<string, number> = {};
  STATUS_KEYS.forEach((key, i) => {
    counts[key] = countRes[i].count ?? 0;
  });
  counts.all = STATUS_KEYS.reduce((sum, key) => sum + (counts[key] ?? 0), 0);

  return { rows, ready: true, counts, total: counts[f.status] ?? counts.all };
}

// ---------------------------------------------------------------------------
// حصيلة القنوات — تُقرأ بحذر ولا تُختلَق
// ---------------------------------------------------------------------------

/**
 * 🔒 قراءة `channel_outcomes` — **ولا تُخترع حصيلة لصفٍّ لا يملكها**.
 *
 * ثلاث حالات لا تُخلط:
 *   • `null`  ⇒ صفٌّ سابقٌ لهجرة 0077 (أو شكلٌ لا نعرفه): القنوات المطلوبة
 *              معروفة والحصيلة **مجهولة**. تُعرض شاراتٌ محايدة مع قول ذلك.
 *   • `[]`    ⇒ العامل مرّ على الصف ولم تُطلب له قناةٌ واحدة. **غير المجهول.**
 *   • مصفوفة ⇒ حصيلةُ كل قناة كما حسبها العامل.
 *
 * ⚠ ولا يُقرأ عمود `error` هنا ولا يُحلَّل نصه لاستنباط ما فشل: نصٌّ حرٌّ ليس
 * عقداً، واستنباطُ حالةٍ منه هو بعينه العيب الذي وُجد العمود ليغلقه.
 */
function parseOutcomes(raw: unknown): ChannelOutcome[] | null {
  if (!Array.isArray(raw)) return null;

  const list: ChannelOutcome[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const record = item as Record<string, unknown>;
    const channel = typeof record.channel === "string" ? record.channel.trim() : "";
    const result = record.result;
    if (!channel) continue;
    if (result !== "sent" && result !== "skipped" && result !== "failed") continue;
    const reason =
      typeof record.reason === "string" && record.reason.trim() !== ""
        ? record.reason.trim()
        : undefined;
    list.push(reason ? { channel, result, reason } : { channel, result });
  }

  // مصفوفةٌ مملوءةٌ بشكلٍ لا نفهمه: تُعامَل كالمجهول لا كـ«لا قناة»
  if (raw.length > 0 && list.length === 0) return null;
  return list;
}

const OUTCOME_ICON = { sent: Check, skipped: Minus, failed: X } as const;

/** شارةُ قناةٍ بحصيلتها — واللون هو الخبر، والسبب في التلميح */
function OutcomeChip({ outcome }: { outcome: ChannelOutcome }) {
  const Icon = OUTCOME_ICON[outcome.result];
  const state = statusLabel(outcome.result);
  return (
    <span
      title={outcome.reason ? `${state} — ${outcome.reason}` : state}
      className={`inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 text-xs font-medium whitespace-nowrap ${
        OUTCOME_STYLES[outcome.result]
      }`}
    >
      <Icon aria-hidden className="size-3" />
      {channelLabel(outcome.channel)}
      <span className="sr-only">— {state}</span>
    </span>
  );
}

/**
 * خلية «التسليم لكل قناة» بحالاتها الثلاث الصريحة.
 *
 * ⚠ **و«في الطابور» يقلب معنى الحصيلة** ولا يُلغيها. صفٌّ أُعيد إلى الطابور
 * بزرّ «إعادة المحاولة» يحتفظ بحصيلة **محاولته السابقة** — وهي دليلٌ يُقرأ لا
 * يُمحى (هذا سجلُّ تسليم). لكن عرضَها بلا قيدٍ كذبٌ في الاتجاه الآخر: شارةٌ
 * خضراء «تليجرام: تم» على صفٍّ ينتظر الإرسال الآن تُقرأ «وصل»، وهو لم يُرسَل
 * بعد. فالقيد سطرٌ واحد يقول لأي محاولةٍ تعود.
 */
function DeliveryCell({ row }: { row: Row }) {
  const outcomes = parseOutcomes(row.channel_outcomes);
  const requeued = row.status === "queued";

  if (outcomes === null) {
    return (
      <span className="flex flex-col gap-1">
        <span className="flex flex-wrap gap-1">
          {(row.channels ?? []).map((channel) => (
            <Badge key={channel} variant="outline" className="whitespace-nowrap">
              {channelLabel(channel)}
            </Badge>
          ))}
        </span>
        <span className="text-[11px] leading-relaxed text-muted-foreground">
          {requeued
            ? "القنوات المطلوبة — ينتظر دورة الإرسال، ولا حصيلة له بعد."
            : "القنوات المطلوبة فقط — حصيلة كل قناة غير مسجَّلة على هذا الصف (أُرسل قبل هجرة 0077)."}
        </span>
      </span>
    );
  }

  if (outcomes.length === 0) {
    return (
      <span className="text-xs leading-relaxed text-muted-foreground">
        لا قناة واحدة — مرّ عليه العامل ولم تُطلب له قناة.
      </span>
    );
  }

  return (
    <span className="flex flex-col gap-1">
      <span className="flex flex-wrap gap-1">
        {outcomes.map((outcome, i) => (
          <OutcomeChip key={`${outcome.channel}-${i}`} outcome={outcome} />
        ))}
      </span>
      {requeued && (
        <span className="text-[11px] leading-relaxed text-amber-700 dark:text-amber-300">
          حصيلةُ المحاولة السابقة — الصف عاد إلى الطابور وسيُرسَل كاملاً من جديد.
        </span>
      )}
    </span>
  );
}

/**
 * خلية حالة العرض.
 *
 * ⚠ و«مقروء» ليست معنىً واحداً: على صفّ متعهد هي علامةُ قراءته **هو** في صندوق
 * البورتال (0054)، وعلى صفّ تشغيل هي قراءةُ المالك (0077). فالتلميح يقول أيّهما
 * — وإلا قرأ المالك علامةَ غيره على أنها علامته.
 */
function ViewStateCell({ row }: { row: Row }) {
  const isPartner = row.recipient_kind === "partner";
  const readBy = isPartner ? "قرأه المتعهد" : "قرأه المالك";
  const readAt = formatDateTime(row.read_at);
  const dismissedAt = formatDateTime(row.dismissed_at);

  const marker = row.dismissed_at ? (
    <span
      title={dismissedAt ? `كُنس من الجرس: ${dismissedAt}` : "كُنس من الجرس"}
      className="inline-flex items-center gap-1 rounded-md border border-border bg-muted px-1.5 py-0.5 text-xs font-medium whitespace-nowrap text-muted-foreground"
    >
      <EyeOff aria-hidden className="size-3" />
      مُكنَس
    </span>
  ) : row.read_at ? (
    <span
      title={readAt ? `${readBy}: ${readAt}` : readBy}
      className="inline-flex items-center gap-1 rounded-md border border-border px-1.5 py-0.5 text-xs font-medium whitespace-nowrap text-muted-foreground"
    >
      <Eye aria-hidden className="size-3" />
      مقروء
    </span>
  ) : (
    <span
      title="لم يُقرأ ولم يُكنس — ما زال في الجرس"
      className="inline-flex items-center gap-1 rounded-md border border-primary/40 bg-primary/10 px-1.5 py-0.5 text-xs font-medium whitespace-nowrap text-primary"
    >
      <CircleDot aria-hidden className="size-3" />
      مفتوح
    </span>
  );

  return (
    <span className="flex flex-col gap-1">
      {marker}
      {readAt && (
        <span className="text-[11px] whitespace-nowrap text-muted-foreground">
          {readBy}: {readAt}
        </span>
      )}
      {dismissedAt && (
        <span className="text-[11px] whitespace-nowrap text-muted-foreground">
          كُنس: {dismissedAt}
        </span>
      )}
    </span>
  );
}

// ---------------------------------------------------------------------------
// الشاشة
// ---------------------------------------------------------------------------

export default async function NotificationsPage({
  searchParams,
}: PageProps<"/admin/notifications">) {
  const params = await searchParams;

  const filters: Filters = {
    status: pickFilter(params.status, ["all", ...STATUS_KEYS]),
    event: pickFilter(params.event, ["all", ...EVENT_KEYS]),
    audience: pickFilter(params.audience, AUDIENCE_FILTERS.map((f) => f.key)),
    channel: pickFilter(params.channel, ["all", ...CHANNEL_KEYS]),
    view: pickFilter(params.view, VIEW_FILTERS.map((f) => f.key)),
    page: pickPage(params.page),
  };
  /** يُمرَّر في كل نموذج ليعود المالك إلى ترشيحه هو بعد أي إجراء */
  const filtersQuery = toQuery(filters);
  const filtered =
    filters.status !== "all" ||
    filters.event !== "all" ||
    filters.audience !== "all" ||
    filters.channel !== "all" ||
    filters.view !== "all";

  const supabase = await createServerSupabase();

  const [settings, log, pulse] = await Promise.all([
    getSettings(),
    // عميلٌ واحد للسجل والعدّادات معاً — لا عميلٌ لكل قراءة
    loadLog(supabase, filters),
    // نبض الشاشة (الملاحظة ١٢): نافذة ثابتة ٣٠ يوماً لا تُبدّل عدّادات المرشّح
    // أدناه — تلك تعدّ ما يطابق الترشيح الآن، وهذه تقيس آخر شهر. وكل رقم من Postgres.
    readPagePulse(supabase, "/admin/notifications"),
  ]);

  const { rows, ready, counts, total } = log;

  const readiness = channelReadiness(settings.notifications);
  const hasServiceKey = Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY);
  const hasDispatchKey = Boolean(process.env.NOTIFY_DISPATCH_KEY);

  const error = typeof params.error === "string" ? params.error : null;
  const ran = params.ran === "1";
  // ⚠ يُقصّ قبل العرض: ما يصل من الرابط ليس بالضرورة رمزاً من عامل الإرسال
  const reason = typeof params.reason === "string" ? params.reason.slice(0, 60) : null;
  const queuedOk = params.queued === "1";
  const sweptOk = params.swept === "1";
  const restoredOk = params.restored === "1";
  // عددُ ما عُلّم مقروءاً — رقمٌ فقط، وما عداه ليس جواب الخادم
  const marked =
    typeof params.marked === "string" && /^\d{1,6}$/.test(params.marked) ? params.marked : null;

  // الترقيم — والإجمالي مجهولٌ حين يتعذّر العدّ، فيُقاس «هل من تالٍ؟» بامتلاء الصفحة
  const totalPages = total === null ? null : Math.max(1, Math.ceil(total / LIST_LIMIT));
  const rangeStart = rows.length === 0 ? 0 : (filters.page - 1) * LIST_LIMIT + 1;
  const rangeEnd = (filters.page - 1) * LIST_LIMIT + rows.length;
  const hasPrev = filters.page > 1;
  const hasNext =
    totalPages === null ? rows.length === LIST_LIMIT : filters.page < totalPages;
  const outOfRange = ready && rows.length === 0 && filters.page > 1 && (total ?? 0) > 0;

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="flex items-center gap-2 font-heading text-lg font-bold">
          <BellRing className="size-5 text-primary" />
          مركز الإشعارات
        </h2>
        <HelpTip>
          كل تغيّر في حالة حجز أو طلب عرض سعر يكتب صفاً في طابور الإشعارات داخل نفس عملية
          التغيير، ثم يوزّعه عامل الإرسال على القنوات المفعّلة. لا إشعار يضيع ولا يُحذف: هذه
          الشاشة سجلُّ التسليم كاملاً — المقروء والمكنوس وما يخصّ المتعهدين معاً — و«الكنس»
          إخفاءٌ من الجرس وحده يمكن التراجع عنه.
        </HelpTip>
        <div className="ms-auto flex flex-wrap items-center gap-2">
          <form action={markAllRead}>
            <input type="hidden" name="filters" value={filtersQuery} />
            <Button type="submit" size="sm" variant="outline">
              <CheckCheck />
              تعليم إشعارات التشغيل كمقروءة
            </Button>
          </form>
          <form action={runDispatch}>
            <input type="hidden" name="filters" value={filtersQuery} />
            <Button type="submit" size="sm">
              <Send />
              تشغيل الإرسال الآن
            </Button>
          </form>
        </div>
      </div>

      <PagePulse data={pulse} />

      {ran && (
        <Card className="flex flex-row items-start gap-3 border-emerald-300 bg-emerald-50 p-4 text-emerald-900 dark:border-emerald-700 dark:bg-emerald-950 dark:text-emerald-100">
          <CheckCircle2 className="mt-0.5 size-5 shrink-0" />
          <div className="text-sm leading-relaxed">
            <p className="font-semibold">
              انتهت دورة الإرسال — عولج {qsNum(params.processed)} إشعاراً: {qsNum(params.sent)}{" "}
              أُرسل · {qsNum(params.skipped)} متجاوَز · {qsNum(params.failed)} فشل.
            </p>
            {/* 🔒 رمزٌ لا جملة: ما لا خريطة له يُعرض **رمزاً** داخل `code` لا نصّاً
                عربياً كأنه رسالة النظام — فالرابط يكتبه من يفتحه. */}
            {reason && (
              <p>
                {REASON_MESSAGES[reason] ?? (
                  <>
                    لم تُنفَّذ الدورة، ورمز السبب: <code dir="ltr">{reason}</code>
                  </>
                )}
              </p>
            )}
          </div>
        </Card>
      )}

      {queuedOk && (
        <Card className="flex flex-row items-center gap-3 border-emerald-300 bg-emerald-50 p-4 text-emerald-900 dark:border-emerald-700 dark:bg-emerald-950 dark:text-emerald-100">
          <CheckCircle2 className="size-5 shrink-0" />
          <p className="text-sm font-medium">
            أُعيد الإشعار إلى الطابور — اضغط «تشغيل الإرسال الآن» أو انتظر المهمة المجدولة.
          </p>
        </Card>
      )}

      {sweptOk && (
        <Card className="flex flex-row items-center gap-3 p-4">
          <EyeOff className="size-5 shrink-0 text-muted-foreground" />
          <p className="text-sm leading-relaxed">
            كُنس الإشعار من الجرس. والصف باقٍ هنا كاملاً بكل حصيلته — ويعود إلى الجرس بزر
            «إرجاع».
          </p>
        </Card>
      )}

      {restoredOk && (
        <Card className="flex flex-row items-center gap-3 p-4">
          <Undo2 className="size-5 shrink-0 text-muted-foreground" />
          <p className="text-sm font-medium">أُعيد الإشعار إلى الجرس مفتوحاً وغير مقروء.</p>
        </Card>
      )}

      {marked !== null && (
        <Card className="flex flex-row items-center gap-3 p-4">
          <CheckCheck className="size-5 shrink-0 text-muted-foreground" />
          <p className="text-sm leading-relaxed">
            {marked === "0"
              ? "لا إشعار تشغيلٍ مفتوح لتعليمه — الجرس فارغ أصلاً."
              : `عُلّم ${qsNum(marked)} إشعاراً كمقروء. وصفوف المتعهدين لم تُمسّ: علامة قراءتها تخصّهم هم.`}
          </p>
        </Card>
      )}

      {error && (
        <Card className="flex flex-row items-center gap-3 border-red-300 bg-red-50 p-4 text-red-900 dark:border-red-700 dark:bg-red-950 dark:text-red-100">
          <XCircle className="size-5 shrink-0" />
          <p className="text-sm font-medium">{ERROR_MESSAGES[error] ?? "حدث خطأ غير متوقع."}</p>
        </Card>
      )}

      {/* بطاقة بيانات الاعتماد — أهم بطاقة في الشاشة: تقول بالضبط ما ينقص وأين يُضاف */}
      <Card className="space-y-4 p-5">
        <div>
          <h3 className="flex items-center gap-1.5 font-heading text-base font-bold">
            <KeyRound className="size-4 text-primary" />
            حالة قنوات الإشعار
          </h3>
          <p className="text-sm text-muted-foreground">
            جرس اللوحة يعمل دائماً. القنوات الخارجية تحتاج مفتاحاً في البيئة ووجهة في الإعدادات —
            وحتى ذلك الحين تُسجَّل رسائلها «متجاوَزة» بسبب واضح ولا تضيع.
          </p>
        </div>

        <div className="grid gap-3 sm:grid-cols-3">
          {readiness.map((channel) => (
            <div
              key={channel.channel}
              className={`rounded-lg border p-3 text-sm ${
                channel.ready
                  ? "border-emerald-300 bg-emerald-50 dark:border-emerald-800 dark:bg-emerald-950/40"
                  : "border-border bg-muted/40"
              }`}
            >
              <p className="flex items-center gap-1.5 font-medium">
                {channel.ready ? (
                  <CheckCircle2 className="size-4 text-emerald-600 dark:text-emerald-400" />
                ) : (
                  <CircleSlash className="size-4 text-muted-foreground" />
                )}
                {channel.label}
              </p>
              {channel.ready ? (
                <p className="mt-1 text-xs text-emerald-700 dark:text-emerald-300">جاهزة للإرسال</p>
              ) : (
                <ul className="mt-1 space-y-0.5 text-xs text-muted-foreground">
                  {channel.missing.map((item) => (
                    <li key={item}>ينقص: {item}</li>
                  ))}
                </ul>
              )}
            </div>
          ))}
        </div>

        <Card className="gap-2 bg-muted/40 p-4 text-sm leading-relaxed ring-0">
          <p className="font-medium">أين تُضاف كل قيمة؟</p>
          <ul className="space-y-1 text-muted-foreground">
            <li>
              <code dir="ltr">TELEGRAM_BOT_TOKEN</code> و<code dir="ltr">RESEND_API_KEY</code> و
              <code dir="ltr">NOTIFY_EMAIL_FROM</code>: ملف <code dir="ltr">.env.local</code> على
              جهازك (وفي متغيرات بيئة Vercel عند النشر) ثم أعد تشغيل الخادم.
            </li>
            <li>
              معرّف محادثة تليجرام وبريد الاستقبال ومفتاحا التشغيل/الإطفاء: تبويب «الإشعارات» في{" "}
              <Link href="/admin/settings#notifications" className="text-primary hover:underline">
                شاشة الإعدادات
              </Link>
              .
            </li>
            <li>
              الشرح خطوة بخطوة (إنشاء البوت، استخراج معرّف المحادثة، حساب Resend، جدولة العامل):
              ملف <code dir="ltr">docs/NOTIFICATIONS.md</code>.
            </li>
            <li>
              المُرسِل الحالي للبريد: <code dir="ltr">{emailFrom()}</code> — النطاق التجريبي يصلح
              للتجربة فقط، والإنتاج يحتاج نطاقاً موثّقاً في Resend.
            </li>
            <li>
              عامل الإرسال:{" "}
              <code dir="ltr">
                {hasServiceKey ? "SUPABASE_SERVICE_ROLE_KEY ✓" : "SUPABASE_SERVICE_ROLE_KEY ✗"}
              </code>{" "}
              ·{" "}
              <code dir="ltr">
                {hasDispatchKey ? "NOTIFY_DISPATCH_KEY ✓" : "NOTIFY_DISPATCH_KEY ✗"}
              </code>{" "}
              — الأول لازم لتشغيل الطابور، والثاني لحماية المسار حين تجدوله لاحقاً.
            </li>
          </ul>
        </Card>
      </Card>

      {/* مرشّح الحالة — والعدّاد بجواره يعدّ **ضمن** بقية المرشّحات لا الطابور كله */}
      <nav aria-label="ترشيح السجل بالحالة" className="flex flex-wrap items-center gap-2">
        {STATUS_FILTERS.map((item) => {
          const active = item.key === filters.status;
          const count = counts?.[item.key];
          return (
            <Link
              key={item.key}
              href={hrefWith(filters, { status: item.key })}
              aria-current={active ? "page" : undefined}
              className={`rounded-lg border px-3 py-1.5 text-sm transition-colors ${
                active
                  ? "border-primary bg-primary text-primary-foreground"
                  : "border-border hover:bg-muted"
              }`}
            >
              {item.label}
              {typeof count === "number" && (
                <span className="ms-1.5 text-xs opacity-80">{num(count)}</span>
              )}
            </Link>
          );
        })}
      </nav>

      {/* بقية المرشّحات: نموذج GET حتى يبقى الرابط قابلاً للمشاركة ويعمل بجافاسكربت معطّل */}
      <form action="/admin/notifications" method="get">
        <Card className="gap-3 p-4">
          {/* الحالة تُختار من الشرائح أعلاه — وتُحمل هنا كي لا يمحوها «تطبيق» */}
          {filters.status !== "all" && (
            <input type="hidden" name="status" value={filters.status} />
          )}

          <div className="flex flex-wrap items-end gap-3">
            <div className="min-w-52 flex-1 space-y-1.5">
              <Label htmlFor="notif-event" className="text-xs">
                الحدث
              </Label>
              <select
                id="notif-event"
                name="event"
                key={`event-${filters.event}`}
                defaultValue={filters.event}
                className={controlClass}
              >
                <option value="all">كل الأحداث</option>
                {EVENT_KEYS.map((key) => (
                  <option key={key} value={key}>
                    {eventTitle(key)}
                  </option>
                ))}
              </select>
            </div>

            <div className="min-w-40 space-y-1.5">
              <Label htmlFor="notif-audience" className="flex items-center gap-1.5 text-xs">
                الوجهة
                <HelpTip>
                  صفُّ «فريق التشغيل» يخصّك أنت، وصفُّ «متعهد» أُنشئ لمتعهد بعينه في موجة بثّ.
                  والفرق يهمّ: علامة القراءة على صفّ المتعهد تخصّه هو في صندوق البورتال، ولا
                  تُكنس من هنا.
                </HelpTip>
              </Label>
              <select
                id="notif-audience"
                name="audience"
                key={`audience-${filters.audience}`}
                defaultValue={filters.audience}
                className={controlClass}
              >
                {AUDIENCE_FILTERS.map((item) => (
                  <option key={item.key} value={item.key}>
                    {item.label}
                  </option>
                ))}
              </select>
            </div>

            <div className="min-w-40 space-y-1.5">
              <Label htmlFor="notif-channel" className="text-xs">
                القناة
              </Label>
              <select
                id="notif-channel"
                name="channel"
                key={`channel-${filters.channel}`}
                defaultValue={filters.channel}
                className={controlClass}
              >
                <option value="all">كل القنوات</option>
                {CHANNEL_KEYS.map((key) => (
                  <option key={key} value={key}>
                    {channelLabel(key)}
                  </option>
                ))}
              </select>
            </div>

            <div className="min-w-40 space-y-1.5">
              <Label htmlFor="notif-view" className="text-xs">
                حالة العرض
              </Label>
              <select
                id="notif-view"
                name="view"
                key={`view-${filters.view}`}
                defaultValue={filters.view}
                className={controlClass}
              >
                {VIEW_FILTERS.map((item) => (
                  <option key={item.key} value={item.key}>
                    {item.label}
                  </option>
                ))}
              </select>
            </div>

            <Button type="submit">تطبيق</Button>
            {filtered && (
              <Link
                href="/admin/notifications"
                className="pb-1.5 text-sm text-muted-foreground transition-colors hover:text-primary hover:underline"
              >
                مسح الترشيح
              </Link>
            )}
          </div>

          <p className="text-xs leading-relaxed text-muted-foreground">
            المرشّحات تتجمّع معاً، وكلها في الرابط — و«القناة» تُرشّح على القنوات{" "}
            <span className="font-medium text-foreground">المطلوبة</span> للصف (عمود{" "}
            <code dir="ltr">channels</code>)، لا على التي وصلت فعلاً. ولمعرفة ما فشل على قناةٍ
            بعينها اجمعها مع حالة «فشل».
          </p>
        </Card>
      </form>

      {!ready ? (
        <Card className="flex flex-row items-start gap-3 border-amber-300 bg-amber-50 p-4 text-amber-900 dark:border-amber-700 dark:bg-amber-950 dark:text-amber-100">
          <AlertTriangle className="mt-0.5 size-5 shrink-0" />
          <div className="text-sm leading-relaxed">
            <p className="font-semibold">لا يمكن قراءة طابور الإشعارات بعد</p>
            <p>
              إما أن قاعدة البيانات غير مربوطة (خطوات <code dir="ltr">supabase/README.md</code>)،
              أو أن هجرة المرحلة ٤ التي تُنشئ جدول <code dir="ltr">notifications</code> لم تُنفَّذ،
              أو أن حسابك بلا صلاحية قراءتها. ومرشّح «حالة العرض» يحتاج هجرة{" "}
              <code dir="ltr">0077</code> تحديداً. الجرس وبقية اللوحة تعمل طبيعياً.
            </p>
          </div>
        </Card>
      ) : outOfRange ? (
        <Card className="flex flex-row items-start gap-3 p-5 text-sm leading-relaxed">
          <AlertTriangle className="mt-0.5 size-5 shrink-0 text-muted-foreground" />
          <p>
            الصفحة {toArabicDigits(filters.page)} خارج المدى — هذا الترشيح يعرض{" "}
            {toArabicDigits(totalPages ?? 1)} صفحة فقط.{" "}
            <Link
              href={hrefWith(filters, { page: totalPages ?? 1 })}
              className="text-primary hover:underline"
            >
              اذهب إلى آخر صفحة
            </Link>
            .
          </p>
        </Card>
      ) : rows.length === 0 ? (
        <Card className="p-5 text-sm text-muted-foreground">
          لا إشعارات تطابق هذا الترشيح. والسجل لا يُحذف منه شيء — جرّب «مسح الترشيح».
        </Card>
      ) : (
        <Card className="space-y-3 p-5">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[72rem] text-sm">
              <thead>
                <tr className="border-b border-border text-xs text-muted-foreground">
                  <th className="p-2 text-start font-medium">الحدث</th>
                  <th className="p-2 text-start font-medium">الوجهة</th>
                  <th className="p-2 text-start font-medium">التسليم لكل قناة</th>
                  <th className="p-2 text-start font-medium">الحالة</th>
                  <th className="p-2 text-start font-medium">المحاولات</th>
                  <th className="p-2 text-start font-medium">حالة العرض</th>
                  <th className="p-2 text-start font-medium">التفاصيل</th>
                  <th className="p-2 text-start font-medium">أُنشئ</th>
                  <th className="p-2 text-start font-medium">سُلّم</th>
                  <th className="p-2 text-start font-medium">إجراء</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => {
                  const brief = notificationBrief(row.payload);
                  const retryable = row.status === "failed" || row.status === "skipped";
                  /**
                   * 🔒 صفوف المتعهدين **لا تُكنس ولا تُرجَع من هنا**: `read_at`
                   * عليها علامةُ قراءة المتعهد في صندوق البورتال (0054)، وكنسها
                   * من لوحة المالك إطفاءٌ لصندوق غيره. والدالةُ في القاعدة تفرض
                   * ذلك أصلاً (‏`recipient_kind = 'ops'`) — وهذا الشرط هنا كي لا
                   * يُعرض زرٌّ يعِد بما ترفضه القاعدة.
                   */
                  const opsRow = row.recipient_kind !== "partner";
                  const canDismiss = opsRow && !row.dismissed_at;
                  const canRestore = opsRow && Boolean(row.dismissed_at || row.read_at);
                  /**
                   * 🔒 وجهةُ **قارئ هذه الشاشة** لا وجهةُ مستقبِل الصف.
                   *
                   * القارئ هنا إداريٌّ دائماً — والشاشة تعرض صفوف المتعهدين
                   * كذلك (بخلاف الجرس الذي يُرشّحها). فحتى صفُّ متعهدٍ يقود
                   * إلى `/admin/orders/<id>`: المالك يريد أن يرى **أيّ طلبٍ**
                   * كان ذلك التنبيه عنه، لا أن يفتح بورتال شريكه.
                   *
                   * ولا يُسرَّب بهذا شيء: حمولةُ صفّ المتعهد عامّةٌ أصلاً
                   * (‏`bookingId` بلا مرجعٍ ولا توكن — `0056`)، والوجهة لوحةٌ
                   * محروسةٌ بالدور (**D-22**).
                   */
                  const target = audienceLink(row.payload, "ops");
                  const heading = (
                    <span className="font-medium">
                      {eventEmoji(row.event)} {eventTitle(row.event)}
                    </span>
                  );
                  return (
                    <tr key={row.id} className="border-b border-border align-top last:border-0">
                      <td className="p-2">
                        {target ? (
                          <Link
                            href={target.href}
                            className="font-medium hover:text-primary hover:underline"
                            title={target.label}
                          >
                            {eventEmoji(row.event)} {eventTitle(row.event)}
                          </Link>
                        ) : (
                          heading
                        )}
                        {brief && (
                          <span className="block text-xs text-muted-foreground">{brief}</span>
                        )}
                      </td>
                      <td className="p-2">
                        <Badge
                          variant={opsRow ? "secondary" : "outline"}
                          className="whitespace-nowrap"
                        >
                          {audienceLabel(row.recipient_kind)}
                        </Badge>
                      </td>
                      <td className="p-2">
                        <DeliveryCell row={row} />
                      </td>
                      <td className="p-2">
                        <span
                          className={`inline-flex rounded-md border px-2 py-0.5 text-xs font-medium whitespace-nowrap ${
                            STATUS_STYLES[row.status] ?? "border-border"
                          }`}
                        >
                          {statusLabel(row.status)}
                        </span>
                      </td>
                      <td className="p-2" dir="ltr">
                        {num(row.attempts)}
                      </td>
                      <td className="p-2">
                        <ViewStateCell row={row} />
                      </td>
                      <td className="p-2 text-xs leading-relaxed text-muted-foreground">
                        {row.error ?? "—"}
                      </td>
                      <td className="p-2 text-xs whitespace-nowrap text-muted-foreground">
                        {formatDateTime(row.created_at) ?? "—"}
                      </td>
                      <td className="p-2 text-xs whitespace-nowrap text-muted-foreground">
                        {formatDateTime(row.delivered_at) ?? "—"}
                      </td>
                      <td className="p-2">
                        <span className="flex flex-col items-start gap-1">
                          {retryable && (
                            <form action={retryNotification}>
                              <input type="hidden" name="id" value={row.id} />
                              <input type="hidden" name="filters" value={filtersQuery} />
                              <Button type="submit" variant="outline" size="sm">
                                <RefreshCw />
                                إعادة المحاولة
                              </Button>
                            </form>
                          )}
                          {canDismiss && (
                            <form action={dismissNotification}>
                              <input type="hidden" name="id" value={row.id} />
                              <input type="hidden" name="filters" value={filtersQuery} />
                              <Button
                                type="submit"
                                variant="ghost"
                                size="sm"
                                title="إخفاؤه من الجرس — يبقى في هذا السجل ويمكن إرجاعه"
                              >
                                <EyeOff />
                                كنس من الجرس
                              </Button>
                            </form>
                          )}
                          {canRestore && (
                            <form action={restoreNotification}>
                              <input type="hidden" name="id" value={row.id} />
                              <input type="hidden" name="filters" value={filtersQuery} />
                              <Button
                                type="submit"
                                variant="ghost"
                                size="sm"
                                title="إعادته إلى الجرس مفتوحاً وغير مقروء"
                              >
                                <Undo2 />
                                إرجاع
                              </Button>
                            </form>
                          )}
                          {!retryable && !canDismiss && !canRestore && (
                            <span className="text-xs text-muted-foreground">
                              {opsRow ? "—" : "حالة قراءته تخصّ المتعهد"}
                            </span>
                          )}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <Separator />

          {/* الترقيم — بلا حالته يبقى ٦٧٥ صفاً من ٧٢٥ غير قابلٍ للوصول أصلاً */}
          <nav
            aria-label="تنقّل بين صفحات السجل"
            className="flex flex-wrap items-center justify-between gap-2"
          >
            <p className="text-xs text-muted-foreground">
              تُعرض {toArabicDigits(rangeStart)}–{toArabicDigits(rangeEnd)}
              {total !== null && ` من ${toArabicDigits(total)}`}
              {totalPages !== null &&
                ` · صفحة ${toArabicDigits(filters.page)} من ${toArabicDigits(totalPages)}`}
            </p>
            <span className="flex items-center gap-2">
              {hasPrev ? (
                <Link
                  href={hrefWith(filters, { page: filters.page - 1 })}
                  className="inline-flex items-center gap-1 rounded-lg border border-border px-3 py-1.5 text-sm transition-colors hover:bg-muted"
                >
                  <ChevronRight className="size-4" />
                  السابق
                </Link>
              ) : (
                <span className="inline-flex items-center gap-1 rounded-lg border border-border px-3 py-1.5 text-sm text-muted-foreground opacity-50">
                  <ChevronRight className="size-4" />
                  السابق
                </span>
              )}
              {hasNext ? (
                <Link
                  href={hrefWith(filters, { page: filters.page + 1 })}
                  className="inline-flex items-center gap-1 rounded-lg border border-border px-3 py-1.5 text-sm transition-colors hover:bg-muted"
                >
                  التالي
                  <ChevronLeft className="size-4" />
                </Link>
              ) : (
                <span className="inline-flex items-center gap-1 rounded-lg border border-border px-3 py-1.5 text-sm text-muted-foreground opacity-50">
                  التالي
                  <ChevronLeft className="size-4" />
                </span>
              )}
            </span>
          </nav>

          <p className="text-xs leading-relaxed text-muted-foreground">
            {toArabicDigits(LIST_LIMIT)} صفاً في الصفحة. «إعادة المحاولة» تعيد الصف إلى الطابور
            وتُرسله كاملاً لكل قنواته في الدورة التالية — فإن كانت قناة قد نجحت من قبل فقد تصل
            رسالتها مرتين، وهذا مقصود: تكرار رسالة أهون من ضياع حجز. و«كنس من الجرس» لا يحذف
            شيئاً: الصف باقٍ هنا بحصيلته كاملة، ولا مسار حذفٍ واحد في هذه الشاشة ولا في القاعدة.
          </p>
        </Card>
      )}
    </div>
  );
}
