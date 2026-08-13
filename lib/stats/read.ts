import "server-only";

import type { StatSeries } from "@/lib/analytics-types";
import { isMissingFunction, isMissingTable } from "@/lib/dispatch/settings";
import type { FunnelSummaryRow, LoadedStatCard } from "@/lib/stats/cards";
import type { StatSectionKey } from "@/lib/stats/sections";
import type { createServerSupabase } from "@/lib/supabase/server";

/**
 * قرّاء طبقة الإحصائيات — **قراءة وتحويل شكل فقط، صفر تجميع**.
 *
 * ثلاث قواعد يفرضها هذا الملف على كل من يستورده:
 *
 * (١) **لا تجميع في TypeScript.** لا `reduce` على قيمة تُعرض، ولا عدّ صفوف، ولا
 *     نسبة مئوية. كل رقم يخرج من هنا وصل محسوباً من `section_stats` أو
 *     `funnel_daily` أو من عرض جاهز. ما يجري هنا: قراءة أعمدة بأسماء متسامحة،
 *     وترتيب صفوف للعرض، وفكّ مصفوفة النقاط التي تُرجعها القاعدة jsonb.
 *
 * (٢) **العميل هو عميل الجلسة** (`createServerSupabase`) لا عميل الخدمة: كل
 *     قراءة تمر على RLS وعلى حارس `analytics_admin_allowed()` داخل الدوال.
 *     استعمال مفتاح الخدمة هنا كان سيجعل أي خلل في حارس الصفحة تسريباً كاملاً،
 *     وكان سيجعل متعهداً يقرأ تكلفة منافسيه لو أخطأت شاشة واحدة.
 *
 * (٣) **التمييز بين «غير موجود» و«ممنوع» و«فشل».** الرسالة تقول للمالك ما ينقص
 *     بالاسم (هجرة لم تُنفَّذ / حساب ليس admin) بدل «حدث خطأ» — نفس ما تفعله
 *     شاشات المالية واللغات منذ المرحلتين ٧ و٨.
 */

export type Supabase = NonNullable<Awaited<ReturnType<typeof createServerSupabase>>>;

export const hasSupabaseEnv = () =>
  Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);

/** سقف صفوف الجداول التفصيلية — شاشة قراءة لا أرشيف */
export const MAX_DETAIL_ROWS = 200;

// ---------------------------------------------------------------------------
// قراءة متسامحة (الجداول والدوال يملكها وكيل SQL: snake_case أو أسماء العقد)
// ---------------------------------------------------------------------------

export const rowsOf = (data: unknown): Record<string, unknown>[] =>
  Array.isArray(data) ? (data as Record<string, unknown>[]) : [];

export function textOf(row: Record<string, unknown> | null, names: string[]): string | null {
  if (!row) return null;
  for (const name of names) {
    const value = row[name];
    if (typeof value === "string" && value.trim() !== "") return value.trim();
    if (typeof value === "number" && Number.isFinite(value)) return String(value);
  }
  return null;
}

/** `null` تعني «غير معروف» لا صفراً — الفرق يظهر للمالك «—» لا «٠» */
export function numberOf(row: Record<string, unknown> | null, names: string[]): number | null {
  if (!row) return null;
  for (const name of names) {
    const value = row[name];
    if (typeof value === "number" && Number.isFinite(value)) return value;
    // أعمدة numeric تصل نصوصاً عبر PostgREST حفاظاً على الدقة
    if (typeof value === "string" && value.trim() !== "") {
      const n = Number(value);
      if (Number.isFinite(n)) return n;
    }
  }
  return null;
}

export function boolOf(
  row: Record<string, unknown> | null,
  names: string[],
  fallback = false
): boolean {
  if (!row) return fallback;
  for (const name of names) {
    const value = row[name];
    if (typeof value === "boolean") return value;
    if (typeof value === "string") {
      const s = value.trim().toLowerCase();
      if (s === "true" || s === "t" || s === "1") return true;
      if (s === "false" || s === "f" || s === "0") return false;
    }
  }
  return fallback;
}

// ---------------------------------------------------------------------------
// تصنيف الأخطاء
// ---------------------------------------------------------------------------

export type StatsFailure =
  /** الجدول/العرض/الدالة غير موجود — هجرة 0022 لم تُنفَّذ */
  | "migration"
  /** القاعدة رفضت: الحساب ليس admin (حارس analytics_admin_allowed) */
  | "forbidden"
  /** مُدخل مرفوض: قسم مجهول أو فترة معكوسة أو مدى أطول من ٤٠٠ يوم */
  | "input"
  /** فشل قراءة آخر */
  | "failed";

type PgError = { code?: string; hint?: string | null; message?: string } | null;

export function classifyStatsError(error: PgError): StatsFailure | null {
  if (!error) return null;
  if (isMissingTable(error.code) || isMissingFunction(error.code)) return "migration";
  const hint = (error.hint ?? "").trim();
  if (hint === "forbidden" || error.code === "42501") return "forbidden";
  if (hint === "invalid-input" || hint === "not-found") return "input";
  return "failed";
}

export type StatsRead<T> = {
  data: T;
  /** هل وصلت البيانات فعلاً؟ `false` يعني اعرض سبباً لا صفراً */
  ready: boolean;
  failure: StatsFailure | null;
  /** اسم ما تعذّرت قراءته — يظهر للمالك ليعرف أي هجرة ينفّذ */
  missing: string | null;
};

const failed = <T,>(data: T, name: string, error: PgError): StatsRead<T> => ({
  data,
  ready: false,
  failure: classifyStatsError(error),
  missing: name,
});

const ok = <T,>(data: T): StatsRead<T> => ({ data, ready: true, failure: null, missing: null });

/** حالة ابتدائية حين لا عميل قاعدة بيانات أصلاً (بيئة غير مربوطة) */
export const blankRead = <T,>(data: T, name: string): StatsRead<T> => ({
  data,
  ready: false,
  failure: null,
  missing: name,
});

// ---------------------------------------------------------------------------
// (١) بطاقات المؤشرات — الواجهة الموحّدة لكل قسم
// ---------------------------------------------------------------------------

const FORMATS = new Set(["number", "money", "percent", "duration"]);

/**
 * `section_stats(p_section, p_from, p_to)` — بطاقات قسم واحد.
 *
 * الدالة تشتق فترة المقارنة داخلها (نفس الطول، ملاصقة) وتُرجع `delta_percent`
 * جاهزاً؛ الواجهة لا ترسل فترة سابقة ولا تحسب فرقاً. و`value` لا يكون null
 * بعقد الدالة، بينما `delta_percent` قد يكون null بصدق: مؤشر لقطة لحظية (النقد
 * في اليد، عدد الصفحات) لا فترة له فلا مقارنة له.
 */
export async function readSectionCards(
  supabase: Supabase,
  section: StatSectionKey,
  from: string,
  to: string
): Promise<StatsRead<LoadedStatCard[]>> {
  const result = await supabase.rpc("section_stats", {
    p_section: section,
    p_from: from,
    p_to: to,
  });

  if (result.error) return failed([], "section_stats", result.error);

  const cards: LoadedStatCard[] = rowsOf(result.data)
    .map((row) => {
      const format = textOf(row, ["format", "value_format", "fmt"]) ?? "number";
      return {
        key: textOf(row, ["key", "card_key", "stat_key"]) ?? "",
        label: textOf(row, ["label", "title", "name"]) ?? "",
        value: numberOf(row, ["value", "stat_value", "amount"]) ?? 0,
        deltaPercent: numberOf(row, ["delta_percent", "deltaPercent", "delta"]),
        format: (FORMATS.has(format) ? format : "number") as LoadedStatCard["format"],
        help: textOf(row, ["help", "hint", "description"]) ?? "",
        sort: numberOf(row, ["sort", "position", "ord"]),
        unit: textOf(row, ["unit", "value_unit"]),
      };
    })
    .filter((card) => card.key !== "");

  // 0022 تُرجع البطاقات بترتيبها المقصود ولا عمود `sort` لها. الترتيب أدناه
  // ثابت (stable) فيُبقي هذا الترتيب كما هو، ويحترم `sort` لو أُضيف لاحقاً.
  cards.sort((a, b) => (a.sort ?? Number.MAX_SAFE_INTEGER) - (b.sort ?? Number.MAX_SAFE_INTEGER));

  return ok(cards);
}

// ---------------------------------------------------------------------------
// (٢) القمع — سلاسل يومية وملخّص الفترة
// ---------------------------------------------------------------------------

/** نقطة واحدة داخل مصفوفة `points` التي تُرجعها `funnel_daily` بشكل jsonb */
function readPoints(value: unknown): { bucket: string; value: number }[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((entry) => {
      if (!entry || typeof entry !== "object") return null;
      const row = entry as Record<string, unknown>;
      const bucket = textOf(row, ["bucket", "day", "date"]);
      const n = numberOf(row, ["value", "n", "count"]);
      return bucket === null ? null : { bucket, value: n ?? 0 };
    })
    .filter((point): point is { bucket: string; value: number } => point !== null)
    .sort((a, b) => a.bucket.localeCompare(b.bucket));
}

/**
 * `funnel_daily(p_from, p_to)` ← سلاسل `StatSeries` **جاهزة من القاعدة**.
 *
 * الدالة تُرجع `(key, label, points jsonb)` — أي صف `StatSeries` حرفياً، وكل
 * يوم في المدى له نقطة حتى لو كانت صفراً (رسمٌ يقفز فوق الأيام الفارغة يكذب على
 * العين). ما يقع هنا فكّ الـ jsonb إلى الشكل الذي يقرؤه المخطط، لا أكثر.
 *
 * ست سلاسل تصل، كلها من `public.funnel_events` وحده (هجرة 0023): المراحل
 * الأربع داخل السلسلة (بحث ← عرض سعر ← حجز ← دفع)، ومعها الحدثان **خارج
 * السلسلة** — `quote_requested` (مسار دخول موازٍ) و`booking_started` (فرع
 * البوابة الإلكترونية، لا يمر به الحجز المدفوع بتحويل بنكي أصلاً). الشاشة
 * تختار منها ما يخصها بالترشيح — والترشيح اختيارٌ لا تجميع. والسلسلتان
 * الأخيرتان تُعرضان في لوحة «أحداث خارج السلسلة» في `/admin/stats/orders`
 * فلا تبقى سلسلة تُحسب ولا تُعرض.
 */
export async function readFunnelSeries(
  supabase: Supabase,
  from: string,
  to: string
): Promise<StatsRead<StatSeries[]>> {
  const result = await supabase.rpc("funnel_daily", { p_from: from, p_to: to });
  if (result.error) return failed([], "funnel_daily", result.error);

  const series: StatSeries[] = rowsOf(result.data)
    .map((row) => ({
      key: textOf(row, ["key", "series_key"]) ?? "",
      label: textOf(row, ["label", "title"]) ?? "",
      points: readPoints(row.points ?? row.data),
    }))
    .filter((one) => one.key !== "");

  return ok(series);
}

/** اختيار سلاسل بمفاتيح بعينها وبترتيبها — ترشيح لا تجميع */
export function pickSeries(series: StatSeries[], keys: string[]): StatSeries[] {
  return keys
    .map((key) => series.find((one) => one.key === key))
    .filter((one): one is StatSeries => one !== undefined);
}

/**
 * `funnel_summary(p_from, p_to)` ← مجاميع القمع ومعدلات التحول داخل السلسلة.
 *
 * الدالة في هجرة 0023 (القسم ٣) وتُرجع ستة صفوف: أربع مراحل داخل السلسلة
 * (`in_chain = true`) بمعدل تحول على سابقتها، وحدثين خارجها (`in_chain = false`)
 * بعدّادهما وحده و`rate_percent = null`. ومصدرها `funnel_counts` نفسه الذي
 * تقرأ منه `funnel_daily` — فمجموع الرسم اليومي يساوي رقم البطاقة فوقه على
 * الشاشة نفسها **بالبناء**. وغيابها (قاعدة لم تُنفَّذ عليها الهجرة) يُصنَّف
 * `migration` فتعرض الشاشة رسالة تسمّيها بدل رقم مخترع.
 *
 * ⚠ `inChain` قد يصل `null` على قاعدة توقّفت عند 0022 (العمود لم يكن موجوداً
 * حينها) — والشاشة تعتمد ترتيب `FUNNEL_ORDER`/`FUNNEL_SIDE` لا هذا الحقل في
 * التوزيع، فلا تنكسر. الحقل يُقرأ للتحقق والعرض لا للتصنيف.
 *
 * ولماذا لا تُجمع النقاط هنا: التجميع في TypeScript ممنوع بنص المرحلة،
 * والقسمة فيه أخطر — مقام صفر يعني `NaN` على شاشة المالك ورقماً يخالف كل
 * تقرير آخر.
 */
export async function readFunnelSummary(
  supabase: Supabase,
  from: string,
  to: string
): Promise<StatsRead<FunnelSummaryRow[]>> {
  const result = await supabase.rpc("funnel_summary", { p_from: from, p_to: to });
  if (result.error) return failed<FunnelSummaryRow[]>([], "funnel_summary", result.error);

  const rows: FunnelSummaryRow[] = rowsOf(result.data)
    .map((row) => ({
      key: textOf(row, ["key", "event", "stage"]) ?? "",
      label: textOf(row, ["label", "title"]),
      value: numberOf(row, ["value", "total", "count"]),
      ratePercent: numberOf(row, ["rate_percent", "ratePercent", "cvr", "conversion_percent"]),
      inChain:
        row.in_chain === undefined && row.inChain === undefined
          ? null
          : boolOf(row, ["in_chain", "inChain"], false),
    }))
    .filter((row) => row.key !== "");

  return ok(rows);
}

// ---------------------------------------------------------------------------
// (٣) الخزينة — نفس محرّك بطاقات القسم كي لا يوجد رقمان لشيء واحد
// ---------------------------------------------------------------------------

/**
 * `v_stats_treasury` ← سلسلتان: الوارد والمنصرف يوماً بيوم.
 *
 * لماذا هذا العرض لا `cash_flow()` من المرحلة ٧؟ لأن بطاقات هذه الشاشة نفسها
 * تُجمَّع من `v_stats_treasury` داخل `section_stats('treasury')` — فقراءة
 * المخطط من مصدر آخر كانت ستضع رقمين لشيء واحد على **الشاشة الواحدة**. والعرض
 * يطبّق قاعدة `cash_flow` حرفياً (القيود ذات الحساب وحدها) فلا يفترقان.
 *
 * ⚠ الأيام بلا حركة لا صف لها في العرض، فلا نقطة لها في المخطط. لا نُدرج
 * أصفاراً من عندنا: «لا صف» و«صفر» ليسا الشيء نفسه، والفرق مكتوب في وصف اللوحة.
 */
export async function readTreasurySeries(
  supabase: Supabase,
  from: string,
  to: string
): Promise<StatsRead<StatSeries[]>> {
  const result = await supabase
    .from("v_stats_treasury")
    .select("day, inflow, outflow, net")
    .gte("day", from)
    .lte("day", to);

  if (result.error) return failed<StatSeries[]>([], "v_stats_treasury", result.error);

  const rows = rowsOf(result.data)
    .map((row) => ({ day: textOf(row, ["day"]), row }))
    .filter((entry): entry is { day: string; row: Record<string, unknown> } => entry.day !== null)
    .sort((a, b) => a.day.localeCompare(b.day));

  const series: StatSeries[] = [
    {
      key: "inflow",
      label: "الوارد",
      points: rows.map((entry) => ({
        bucket: entry.day,
        value: numberOf(entry.row, ["inflow"]) ?? 0,
      })),
    },
    {
      key: "outflow",
      label: "المنصرف",
      points: rows.map((entry) => ({
        bucket: entry.day,
        value: numberOf(entry.row, ["outflow"]) ?? 0,
      })),
    },
  ];

  return ok(series);
}

// ---------------------------------------------------------------------------
// (٤) العروض التفصيلية — صف لكل كيان
// ---------------------------------------------------------------------------

/** صف متعهد في شاشة الإحصائيات — **بلا أي عمود تكلفة أو هامش أو إيراد** */
export type PartnerStatRow = {
  id: string;
  companyName: string;
  status: string | null;
  tripsCount: number | null;
  completedCount: number | null;
  offersCount: number | null;
  acceptedCount: number | null;
  acceptRate: number | null;
};

/**
 * `v_stats_partners` ← صف لكل متعهد (تراكمي لا مقطّع بفترة).
 *
 * 🔒 **العرض يحمل `revenue` و`partner_cost` و`gross_profit`، وهذا القارئ لا
 * يقرؤها ولا يمرّرها.** الحقول المسموح بها مثبَّتة في النوع أعلاه، فما ليس فيه
 * لا يوجد له مسار إلى JSX أصلاً — الأمان بنيوي لا انضباطي (قاعدة المرحلة ٥).
 * أرقام التكلفة والهامش تُقرأ من بطاقات `section_stats('partners')` ومن شاشة
 * المالية، وكلاهما إداري بحارس الدور نفسه؛ والفرق أن هذه الشاشة تعرض **صفاً
 * لكل شريك**، وربط الشريك بتكلفته صفاً صفاً هو ما يجعل التسريب مؤذياً.
 */
export async function readPartnerStats(supabase: Supabase): Promise<StatsRead<PartnerStatRow[]>> {
  const result = await supabase
    .from("v_stats_partners")
    .select(
      "subcontractor_id, company_name, partner_status, trips_count, completed_count, offers_count, accepted_count, accept_rate"
    )
    .limit(MAX_DETAIL_ROWS);

  if (result.error) return failed<PartnerStatRow[]>([], "v_stats_partners", result.error);

  const rows: PartnerStatRow[] = rowsOf(result.data)
    .map((row) => ({
      id: textOf(row, ["subcontractor_id", "subcontractorId", "id"]) ?? "",
      companyName: textOf(row, ["company_name", "companyName", "label", "name"]) ?? "متعهد بلا اسم",
      status: textOf(row, ["partner_status", "status"]),
      tripsCount: numberOf(row, ["trips_count", "tripsCount", "trips"]),
      completedCount: numberOf(row, ["completed_count", "completedCount"]),
      offersCount: numberOf(row, ["offers_count", "offersCount", "offers"]),
      acceptedCount: numberOf(row, ["accepted_count", "acceptedCount", "accepted"]),
      acceptRate: numberOf(row, ["accept_rate", "acceptRate", "acceptance_rate"]),
    }))
    .filter((row) => row.id !== "")
    .sort((a, b) => (b.tripsCount ?? 0) - (a.tripsCount ?? 0));

  return ok(rows);
}

/**
 * لقطة المحتوى والسيو — **صف واحد** لا صف لكل صفحة.
 *
 * `v_stats_content` عرض رفيع فوق `stats_content_rows()` وهي تُرجع صفاً مجمَّعاً
 * واحداً. فلا جدول صفحات هنا: قائمة الصفحات الناقصة بعينها مكانها مركز السيو
 * (`/admin/seo`) الذي يملك تحريرها، وتكرارها هنا كان سيصنع شاشتين تختلفان
 * بمرور الوقت.
 */
export type ContentSnapshot = {
  pagesTotal: number | null;
  pagesPublished: number | null;
  pagesDraft: number | null;
  metaTitleCount: number | null;
  metaDescCount: number | null;
  metaComplete: number | null;
  metaMissing: number | null;
  faqPages: number | null;
  sectionsTotal: number | null;
  sectionsVisible: number | null;
};

const EMPTY_CONTENT: ContentSnapshot = {
  pagesTotal: null,
  pagesPublished: null,
  pagesDraft: null,
  metaTitleCount: null,
  metaDescCount: null,
  metaComplete: null,
  metaMissing: null,
  faqPages: null,
  sectionsTotal: null,
  sectionsVisible: null,
};

export async function readContentSnapshot(
  supabase: Supabase
): Promise<StatsRead<ContentSnapshot>> {
  const result = await supabase.from("v_stats_content").select("*").limit(1).maybeSingle();
  if (result.error) return failed(EMPTY_CONTENT, "v_stats_content", result.error);

  const row = (result.data ?? null) as Record<string, unknown> | null;
  // الدالة «تفشل مغلقة» بصفر صف لغير المشرف — لا صف يعني لا أرقام، لا أصفاراً
  if (!row) return failed(EMPTY_CONTENT, "v_stats_content", { hint: "forbidden" });

  return ok({
    pagesTotal: numberOf(row, ["pages_total"]),
    pagesPublished: numberOf(row, ["pages_published"]),
    pagesDraft: numberOf(row, ["pages_draft"]),
    metaTitleCount: numberOf(row, ["meta_title_count"]),
    metaDescCount: numberOf(row, ["meta_desc_count"]),
    metaComplete: numberOf(row, ["meta_complete"]),
    metaMissing: numberOf(row, ["meta_missing"]),
    faqPages: numberOf(row, ["faq_pages"]),
    sectionsTotal: numberOf(row, ["sections_total"]),
    sectionsVisible: numberOf(row, ["sections_visible"]),
  });
}

/** صف لغة في إحصائيات اللغات */
export type LocaleStatRow = {
  locale: string;
  name: string;
  nativeName: string | null;
  enabled: boolean;
  isDefault: boolean;
  total: number | null;
  published: number | null;
  reviewed: number | null;
  draft: number | null;
  missing: number | null;
  stale: number | null;
  percent: number | null;
};

/** `v_stats_locales` ← صف لكل لغة: نسبة الاكتمال والناقص والقديم */
export async function readLocaleStats(supabase: Supabase): Promise<StatsRead<LocaleStatRow[]>> {
  const result = await supabase.from("v_stats_locales").select("*").limit(MAX_DETAIL_ROWS);
  if (result.error) return failed<LocaleStatRow[]>([], "v_stats_locales", result.error);

  const rows: LocaleStatRow[] = rowsOf(result.data)
    .map((row) => {
      const locale = (textOf(row, ["code", "locale"]) ?? "").toLowerCase();
      return {
        locale,
        name: textOf(row, ["name", "label"]) ?? locale,
        nativeName: textOf(row, ["native_name", "nativeName"]),
        enabled: boolOf(row, ["enabled", "is_enabled", "active"], false),
        isDefault: boolOf(row, ["is_default", "isDefault"], false),
        total: numberOf(row, ["total", "total_keys"]),
        published: numberOf(row, ["published"]),
        reviewed: numberOf(row, ["reviewed"]),
        draft: numberOf(row, ["draft", "drafts"]),
        missing: numberOf(row, ["missing"]),
        stale: numberOf(row, ["stale", "outdated"]),
        percent: numberOf(row, ["percent", "percentage", "pct"]),
      };
    })
    .filter((row) => row.locale !== "")
    .sort((a, b) => {
      if (a.isDefault !== b.isDefault) return a.isDefault ? -1 : 1;
      if (a.enabled !== b.enabled) return a.enabled ? -1 : 1;
      return a.locale.localeCompare(b.locale);
    });

  return ok(rows);
}

// ---------------------------------------------------------------------------
// (٥) العملة — من القاعدة لا من الكود
// ---------------------------------------------------------------------------

/** رمز العملة من `pricing_settings` — نفس مصدر بقية أسعار الموقع واللوحة */
export async function readStatsCurrency(supabase: Supabase): Promise<string> {
  const result = await supabase.from("pricing_settings").select("currency").limit(1).maybeSingle();
  if (result.error) return "EGP";
  return textOf((result.data ?? null) as Record<string, unknown> | null, ["currency"]) ?? "EGP";
}
