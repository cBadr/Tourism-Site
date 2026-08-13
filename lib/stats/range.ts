/**
 * منتقي الفترة الموحّد لشاشات الإحصائيات: ٧ / ٣٠ / ٩٠ يوماً — **تواريخ لا أرقام**.
 *
 * ثلاثة قرارات تحكم هذا الملف:
 *
 * (١) **لا حساب واحد على قيمة معروضة هنا.** كل ما يجري في هذا الملف تقويم:
 *     بداية النطاق، طوله بالأيام، وحدود الفترة السابقة المكافئة. الأرقام
 *     الإحصائية كلها تصل محسوبة من `section_stats` و`funnel_daily` والعروض.
 *
 * (٢) **الفترة السابقة تُحسب هنا وتُعرض للمالك، ولا تُرسَل إلى القاعدة.**
 *     `section_stats(p_section, p_from, p_to)` تشتق فترة المقارنة داخلها
 *     (نفس الطول، تنتهي قبل `p_from` بيوم) وتُرجع `delta_percent` جاهزاً. سبب
 *     عرضها هنا رغم ذلك: مؤشر «−١٢٪» بلا ذكر ما قُورِن به ادعاء لا معلومة،
 *     والمالك يجب أن يقرأ «مقارنةً بـ ١ – ٧ أغسطس» بعينه.
 *
 * (٣) **التوقيت المرجعي القاهرة.** كل تجميع يومي في هذا المستودع يقع على
 *     `(occurred_at at time zone 'Africa/Cairo')::date`؛ فلو قرأت الواجهة
 *     «اليوم» بتوقيت الخادم (UTC على المنصات السحابية) لانزاح النطاق يوماً
 *     كاملاً عن أرقام المرحلة ٧، وهو بالضبط العطب الذي تحرّمه قاعدة «رقمان
 *     لنفس الشيء في شاشتين».
 *
 * ولماذا لا يُستورَد نطاق شاشة المالية (`app/admin/finance/_components/range.ts`)؟
 * لسببين: مفرداته غير مفردات هذه المرحلة (اليوم / هذا الشهر / الشهر الماضي
 * مقابل ٧ / ٣٠ / ٩٠ ومقارنة تلقائية)، و`lib/` لا يجوز أن يعتمد على مجلد شاشة
 * بعينه. الدوال التقويمية المكررة أدناه بدائية ولا تحمل أي قرار عمل، فلا يوجد
 * «مصدر حقيقة ثانٍ» ينحرف.
 */

/** مفاتيح الفترة — القيم كما تُكتب في الرابط `?range=` */
export type StatRangeKey = "last7" | "last30" | "last90" | "custom";

export type StatRange = {
  key: StatRangeKey;
  /** أول يوم في النطاق (شامل) — YYYY-MM-DD */
  from: string;
  /** آخر يوم في النطاق (شامل) — YYYY-MM-DD */
  to: string;
  /** طول النطاق بالأيام شاملاً طرفيه */
  days: number;
  /** أول يوم في الفترة السابقة المكافئة */
  prevFrom: string;
  /** آخر يوم في الفترة السابقة المكافئة (اليوم السابق مباشرة لـ `from`) */
  prevTo: string;
};

export const STAT_RANGE_LABELS: Record<StatRangeKey, string> = {
  last7: "٧ أيام",
  last30: "٣٠ يوماً",
  last90: "٩٠ يوماً",
  custom: "نطاق مخصص",
};

/** الأزرار السريعة بالترتيب المعروض — «custom» نتيجة تحرير الحقلين لا زر */
export const STAT_QUICK_RANGES: Exclude<StatRangeKey, "custom">[] = [
  "last7",
  "last30",
  "last90",
];

export const DEFAULT_STAT_RANGE: StatRangeKey = "last30";

/** طول كل نطاق سريع بالأيام شاملاً اليوم الجاري */
const QUICK_DAYS: Record<Exclude<StatRangeKey, "custom">, number> = {
  last7: 7,
  last30: 30,
  last90: 90,
};

const ISO_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;
const TIME_ZONE = "Africa/Cairo";

const pad2 = (n: number) => (n < 10 ? `0${n}` : String(n));

export const isoOf = (year: number, month: number, day: number): string =>
  `${year}-${pad2(month)}-${pad2(day)}`;

/** الأرقام العربية الهندية مقبولة في حقول التاريخ كما في بقية المستودع */
const toLatinDigits = (s: string) => s.replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 0x0660));

/**
 * «اليوم» بتوقيت القاهرة. السقوط إلى UTC عند غياب بيانات المناطق الزمنية
 * (بيئات تشغيل مقلّمة) — انزياح ساعتين أهون من انهيار الشاشة.
 */
export function cairoToday(): string {
  const now = new Date();
  try {
    const parts = new Intl.DateTimeFormat("en-US", {
      timeZone: TIME_ZONE,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).formatToParts(now);
    const read = (type: string) => Number(parts.find((p) => p.type === type)?.value ?? "0");
    return isoOf(read("year"), read("month"), read("day"));
  } catch {
    return isoOf(now.getUTCFullYear(), now.getUTCMonth() + 1, now.getUTCDate());
  }
}

/**
 * قراءة تاريخ من الرابط: يرفض ما لا يوجد في التقويم (٢٠٢٦-٠٢-٣١) عبر رحلة
 * ذهاب وعودة على UTC — التحقق من المدى وحده يمرّر تواريخ وهمية يفسّرها
 * Postgres بطريقته.
 */
export function parseIsoDate(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const m = ISO_PATTERN.exec(toLatinDigits(value.trim()));
  if (!m) return null;
  const [year, month, day] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const probe = new Date(Date.UTC(year, month - 1, day));
  if (
    probe.getUTCFullYear() !== year ||
    probe.getUTCMonth() !== month - 1 ||
    probe.getUTCDate() !== day
  ) {
    return null;
  }
  return isoOf(year, month, day);
}

/** إزاحة تاريخ بعدد أيام — الحساب على UTC فلا يتدخل التوقيت الصيفي */
export function addDays(iso: string, days: number): string {
  const m = ISO_PATTERN.exec(iso);
  if (!m) return iso;
  const t = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]) + days));
  return isoOf(t.getUTCFullYear(), t.getUTCMonth() + 1, t.getUTCDate());
}

/** عدد الأيام بين تاريخين شاملاً طرفيه (١ لليوم الواحد) */
export function daysBetween(from: string, to: string): number {
  const a = ISO_PATTERN.exec(from);
  const b = ISO_PATTERN.exec(to);
  if (!a || !b) return 1;
  const start = Date.UTC(Number(a[1]), Number(a[2]) - 1, Number(a[3]));
  const end = Date.UTC(Number(b[1]), Number(b[2]) - 1, Number(b[3]));
  return Math.max(1, Math.round((end - start) / 86_400_000) + 1);
}

/** يبني النطاق بفترته السابقة المكافئة — نفس الطول، تنتهي قبل `from` بيوم */
function withPrevious(key: StatRangeKey, from: string, to: string): StatRange {
  const days = daysBetween(from, to);
  const prevTo = addDays(from, -1);
  return { key, from, to, days, prevFrom: addDays(prevTo, -(days - 1)), prevTo };
}

const isQuickKey = (v: unknown): v is Exclude<StatRangeKey, "custom"> =>
  typeof v === "string" && (STAT_QUICK_RANGES as string[]).includes(v);

const firstParam = (v: string | string[] | undefined): string | undefined =>
  Array.isArray(v) ? v[0] : v;

/**
 * النطاق الساري من معاملات الرابط.
 *
 * الأولوية: نطاق سريع صريح ← تاريخان مكتوبان ← ٣٠ يوماً افتراضاً. وإن كُتب
 * التاريخان مقلوبين بُدِّلا بدل رفض الطلب: خطأ ترتيب لا خطأ نية، ورفضه يعطي
 * المالك شاشة فارغة بلا سبب مفهوم.
 */
export function resolveStatRange(
  params: Record<string, string | string[] | undefined>
): StatRange {
  const today = cairoToday();
  const rawKey = firstParam(params.range);

  if (isQuickKey(rawKey)) {
    return withPrevious(rawKey, addDays(today, -(QUICK_DAYS[rawKey] - 1)), today);
  }

  const rawFrom = parseIsoDate(firstParam(params.from));
  const rawTo = parseIsoDate(firstParam(params.to));

  if (rawFrom || rawTo) {
    let from = rawFrom ?? rawTo ?? today;
    let to = rawTo ?? rawFrom ?? today;
    if (from > to) [from, to] = [to, from];
    return withPrevious("custom", from, to);
  }

  const fallback = DEFAULT_STAT_RANGE as Exclude<StatRangeKey, "custom">;
  return withPrevious(fallback, addDays(today, -(QUICK_DAYS[fallback] - 1)), today);
}

/** معاملات النطاق كما تُكتب في الرابط (النطاق السريع يُختصر بمفتاحه) */
export function statRangeParams(range: StatRange): Record<string, string> {
  return range.key === "custom" ? { from: range.from, to: range.to } : { range: range.key };
}

/** سلسلة الاستعلام للفترة — تنتقل مع المستخدم بين الأقسام الستة */
export function statRangeQuery(range: StatRange): string {
  return new URLSearchParams(statRangeParams(range)).toString();
}

/** بناء رابط بمعاملات — الفارغ يُحذف فلا تتراكم معاملات بلا قيمة */
export function statHref(basePath: string, params: Record<string, string | undefined>): string {
  const qs = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== "") qs.set(key, value);
  }
  const s = qs.toString();
  return s ? `${basePath}?${s}` : basePath;
}

// ---------------------------------------------------------------------------
// حبيبة السلاسل الزمنية
// ---------------------------------------------------------------------------

/**
 * حبيبة السلسلة = **وصفٌ لما تُرجعه القاعدة فعلاً**، لا اختيارُ عرض.
 *
 * ⚠ كانت هنا `statGranularity(days)` تُرجع "week" لكل مدى بين ٣٢ و١٢٠ يوماً،
 * وتُمرَّر إلى `StatChart` فوق نقاط `funnel_daily` **اليومية**. النتيجة: زر
 * «٩٠ يوماً» يجعل المحور والتلميح وجدول الأرقام تحت الرسم تكتب «أسبوع ١٢
 * أغسطس» بجوار عدد **ذلك اليوم وحده** — بيانات صحيحة بوسم كاذب، وهو أسوأ من
 * بيانات غائبة. وهجرة 0022 لا تعرف حبيبة غير اليوم أصلاً (`funnel_daily` بلا
 * معامل سلة، و`v_stats_treasury` مجمَّع باليوم كذلك)، فحُذفت الدالة بدل أن
 * تبقى فخاً يعيد نفسه: كل مصادر المخططات اليوم يومية، والشاشات تمرّر "day"
 * صراحةً. وإن أُضيفت سلال أسبوعية/شهرية يوماً فمكان تجميعها Postgres
 * (`date_trunc` بتوقيت Africa/Cairo) لا TypeScript.
 */
export type StatGranularity = "day" | "week" | "month";

// ---------------------------------------------------------------------------
// العرض العربي
// ---------------------------------------------------------------------------

/**
 * أسماء الشهور محلياً لا مستوردة: التاريخ الصرف `YYYY-MM-DD` لا يجوز أن يمر
 * بـ `new Date()` — تحويله لحظةً زمنية يجعل «١ أغسطس» يظهر «٣١ يوليو» أو
 * العكس بحسب منطقة القارئ، ودوال التاريخ الجاهزة في المستودع تستقبل طوابع
 * زمنية كاملة.
 */
const AR_MONTHS = [
  "يناير",
  "فبراير",
  "مارس",
  "أبريل",
  "مايو",
  "يونيو",
  "يوليو",
  "أغسطس",
  "سبتمبر",
  "أكتوبر",
  "نوفمبر",
  "ديسمبر",
];

const arDigits = (value: string | number): string =>
  String(value).replace(/[0-9]/g, (d) => "٠١٢٣٤٥٦٧٨٩"[Number(d)] ?? d);

/** تاريخ بالعربية — ١٢ أغسطس ٢٠٢٦ */
export function statDateLabel(value: string | null | undefined): string {
  if (!value) return "—";
  const m = ISO_PATTERN.exec(value.trim());
  if (!m) return value;
  return `${arDigits(Number(m[3]))} ${AR_MONTHS[Number(m[2]) - 1]} ${arDigits(m[1])}`;
}

/** تاريخ مختصر بلا سنة — لمحاور المخططات: ١٢ أغسطس */
export function statShortDateLabel(value: string | null | undefined): string {
  if (!value) return "—";
  const m = ISO_PATTERN.exec(value.trim());
  if (!m) return value;
  return `${arDigits(Number(m[3]))} ${AR_MONTHS[Number(m[2]) - 1]}`;
}

/** عنوان سلة في مخطط بحسب حبيبتها */
export function statBucketLabel(bucket: string, granularity: StatGranularity): string {
  const value = (bucket ?? "").trim();
  const m = ISO_PATTERN.exec(value);
  if (!m) return value || "—";
  if (granularity === "month") {
    return `${AR_MONTHS[Number(m[2]) - 1]} ${arDigits(m[1])}`;
  }
  const short = statShortDateLabel(value);
  return granularity === "week" ? `أسبوع ${short}` : short;
}

/** وصف النطاق في جملة واحدة */
export function statRangeSentence(from: string, to: string): string {
  return from === to ? statDateLabel(from) : `${statDateLabel(from)} — ${statDateLabel(to)}`;
}
