import { toArabicDigits } from "@/components/booking/format";
import { toLatinDigits, zonedParts } from "../../orders/_components/booking-ui";

/**
 * نطاق التاريخ لشاشات المالية — **تواريخ لا مبالغ**.
 *
 * كل حساب في هذا الملف على تقويم لا على نقود: بداية الشهر، اليوم السابق، طول
 * الفترة بالأيام. لا جنيه واحد يُجمع أو يُطرح هنا ولا في أي ملف من ملفات
 * المرحلة ٧ — المبالغ كلها تصل محسوبة من دوال وعروض Postgres.
 *
 * التوقيت المرجعي هو القاهرة لأن التشغيل والعملاء في مصر: «هذا الشهر» يعني
 * الشهر كما يراه المالك على تقويمه، لا كما يراه خادم يعمل بـ UTC. لذلك يُقرأ
 * «اليوم» عبر `zonedParts` (نفس الدالة التي تحسب بها شاشة حسابات الدفع نوافذ
 * الحدود اليومية والشهرية).
 *
 * الصيغة المتبادلة في الروابط ومع دوال SQL هي `YYYY-MM-DD` بأرقام لاتينية —
 * وهي أيضاً الصيغة التي يقبلها `<input type="date">`. العرض وحده يُعرَّب.
 */

export type RangeKey =
  | "today"
  | "last7"
  | "month"
  | "prev_month"
  | "last90"
  | "year"
  | "custom";

export type DateRange = {
  key: RangeKey;
  /** أول يوم في النطاق (شامل) — YYYY-MM-DD */
  from: string;
  /** آخر يوم في النطاق (شامل) — YYYY-MM-DD */
  to: string;
  /** طول النطاق بالأيام شاملاً طرفيه */
  days: number;
};

export const RANGE_LABELS: Record<RangeKey, string> = {
  today: "اليوم",
  last7: "آخر ٧ أيام",
  month: "هذا الشهر",
  prev_month: "الشهر الماضي",
  last90: "آخر ٩٠ يوماً",
  year: "هذا العام",
  custom: "نطاق مخصص",
};

/** النطاقات السريعة بالترتيب المعروض — «custom» ليس زراً بل نتيجة تحرير الحقلين */
export const QUICK_RANGES: Exclude<RangeKey, "custom">[] = [
  "today",
  "last7",
  "month",
  "prev_month",
  "last90",
  "year",
];

export const DEFAULT_RANGE_KEY: RangeKey = "month";

const ISO_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;

const pad2 = (n: number) => (n < 10 ? `0${n}` : String(n));

/** تركيب تاريخ ISO من أجزائه */
export const isoOf = (year: number, month: number, day: number): string =>
  `${year}-${pad2(month)}-${pad2(day)}`;

/** «اليوم» بتوقيت القاهرة — نقطة الإسناد الوحيدة لكل النطاقات السريعة */
export function cairoToday(): string {
  const p = zonedParts(new Date());
  return isoOf(p.year, p.month, p.day);
}

/**
 * قراءة تاريخ من الرابط: يقبل الأرقام العربية الهندية، ويرفض ما لا يوجد في
 * التقويم (٢٠٢٦-٠٢-٣١ مثلاً) عبر رحلة ذهاب وعودة على UTC — التحقق من المدى
 * وحده يمرّر تواريخ وهمية يفسّرها Postgres بطريقته.
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

/** إزاحة تاريخ بعدد أيام (سالب أو موجب) — الحساب على UTC فلا يتدخل التوقيت الصيفي */
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

/** آخر يوم في شهر — يوم قبل أول الشهر التالي */
function endOfMonth(year: number, month: number): string {
  const t = new Date(Date.UTC(year, month, 0));
  return isoOf(t.getUTCFullYear(), t.getUTCMonth() + 1, t.getUTCDate());
}

/**
 * حدود نطاق سريع بالنسبة لليوم الجاري.
 *
 * ملاحظة مقصودة: النطاقات الجارية (اليوم/هذا الشهر/هذا العام) تنتهي **اليوم**
 * لا بنهاية الفترة — لا معنى لعرض أيام لم تأتِ بعد في تدفق نقدي.
 */
function quickBounds(key: Exclude<RangeKey, "custom">, today: string): { from: string; to: string } {
  const m = ISO_PATTERN.exec(today);
  const year = m ? Number(m[1]) : 1970;
  const month = m ? Number(m[2]) : 1;

  switch (key) {
    case "today":
      return { from: today, to: today };
    case "last7":
      return { from: addDays(today, -6), to: today };
    case "month":
      return { from: isoOf(year, month, 1), to: today };
    case "prev_month": {
      const prevYear = month === 1 ? year - 1 : year;
      const prevMonth = month === 1 ? 12 : month - 1;
      return { from: isoOf(prevYear, prevMonth, 1), to: endOfMonth(prevYear, prevMonth) };
    }
    case "last90":
      return { from: addDays(today, -89), to: today };
    case "year":
      return { from: isoOf(year, 1, 1), to: today };
  }
}

const isQuickKey = (v: unknown): v is Exclude<RangeKey, "custom"> =>
  typeof v === "string" && (QUICK_RANGES as string[]).includes(v);

const firstParam = (v: string | string[] | undefined): string | undefined =>
  Array.isArray(v) ? v[0] : v;

/**
 * النطاق الساري من معاملات الرابط.
 *
 * الأولوية: نطاق سريع صريح ← تاريخان مكتوبان (نطاق مخصص) ← «هذا الشهر»
 * افتراضاً. وإن كُتب التاريخان مقلوبين بُدِّلا بدل رفض الطلب — خطأ ترتيب لا
 * خطأ نية، ورفضه يعطي المالك شاشة فارغة بلا سبب مفهوم.
 */
export function resolveRange(params: Record<string, string | string[] | undefined>): DateRange {
  const today = cairoToday();
  const rawKey = firstParam(params.range);

  if (isQuickKey(rawKey)) {
    const { from, to } = quickBounds(rawKey, today);
    return { key: rawKey, from, to, days: daysBetween(from, to) };
  }

  const rawFrom = parseIsoDate(firstParam(params.from));
  const rawTo = parseIsoDate(firstParam(params.to));

  if (rawFrom || rawTo) {
    let from = rawFrom ?? rawTo ?? today;
    let to = rawTo ?? rawFrom ?? today;
    if (from > to) [from, to] = [to, from];
    return { key: "custom", from, to, days: daysBetween(from, to) };
  }

  const { from, to } = quickBounds(DEFAULT_RANGE_KEY as Exclude<RangeKey, "custom">, today);
  return { key: DEFAULT_RANGE_KEY, from, to, days: daysBetween(from, to) };
}

// ---------------------------------------------------------------------------
// حبيبات التدفق النقدي
// ---------------------------------------------------------------------------

export type Granularity = "day" | "week" | "month";

export const GRANULARITY_LABELS: Record<Granularity, string> = {
  day: "يومي",
  week: "أسبوعي",
  month: "شهري",
};

export const GRANULARITIES: Granularity[] = ["day", "week", "month"];

/**
 * الحبيبة المناسبة لطول الفترة — حتى لا يُرسم مخطط بـ ٣٦٥ عموداً على شاشة
 * موبايل، ولا عمود واحد ليوم واحد.
 */
export function defaultGranularity(days: number): Granularity {
  if (days <= 45) return "day";
  if (days <= 240) return "week";
  return "month";
}

export function resolveGranularity(
  raw: string | string[] | undefined,
  days: number
): Granularity {
  const value = firstParam(raw);
  return GRANULARITIES.includes(value as Granularity)
    ? (value as Granularity)
    : defaultGranularity(days);
}

// ---------------------------------------------------------------------------
// العرض العربي
// ---------------------------------------------------------------------------

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

/**
 * تاريخ بالعربية — مثال: ١٢ أغسطس ٢٠٢٦.
 *
 * يقبل `YYYY-MM-DD` (تاريخ صرف) و ISO كاملاً (طابع زمني). التاريخ الصرف
 * يُقرأ من نصّه مباشرة ولا يمر بـ `Date`: تحويله لحظةً زمنية يجعل «١ أغسطس»
 * يظهر «٣١ يوليو» أو العكس بحسب المنطقة الزمنية.
 */
export function dateLabel(value: string | null | undefined): string {
  if (!value) return "—";
  const plain = ISO_PATTERN.exec(value.trim());
  if (plain) {
    const [, y, m, d] = plain;
    return `${toArabicDigits(Number(d))} ${AR_MONTHS[Number(m) - 1]} ${toArabicDigits(y)}`;
  }
  const t = Date.parse(value);
  if (!Number.isFinite(t)) return "—";
  const p = zonedParts(new Date(t));
  return `${toArabicDigits(p.day)} ${AR_MONTHS[p.month - 1]} ${toArabicDigits(p.year)}`;
}

/** تاريخ مختصر بلا سنة — لمحاور المخططات: ١٢ أغسطس */
export function shortDateLabel(value: string): string {
  const plain = ISO_PATTERN.exec(value.trim());
  if (plain) {
    const [, , m, d] = plain;
    return `${toArabicDigits(Number(d))} ${AR_MONTHS[Number(m) - 1]}`;
  }
  const t = Date.parse(value);
  if (!Number.isFinite(t)) return value;
  const p = zonedParts(new Date(t));
  return `${toArabicDigits(p.day)} ${AR_MONTHS[p.month - 1]}`;
}

/** عنوان عمود في مخطط التدفق بحسب حبيبته */
export function bucketLabel(bucket: string, granularity: Granularity): string {
  const value = bucket.trim();
  if (granularity === "month") {
    const plain = ISO_PATTERN.exec(value);
    if (plain) return `${AR_MONTHS[Number(plain[2]) - 1]} ${toArabicDigits(plain[1])}`;
    const t = Date.parse(value);
    if (Number.isFinite(t)) {
      const p = zonedParts(new Date(t));
      return `${AR_MONTHS[p.month - 1]} ${toArabicDigits(p.year)}`;
    }
    return value;
  }
  const short = shortDateLabel(value);
  return granularity === "week" ? `أسبوع ${short}` : short;
}

/** وصف النطاق في جملة واحدة — يظهر تحت الفلتر وفي ترويسة الطباعة */
export function rangeSentence(range: DateRange): string {
  return range.from === range.to
    ? dateLabel(range.from)
    : `${dateLabel(range.from)} — ${dateLabel(range.to)}`;
}

/** معاملات النطاق كما تُكتب في الرابط (النطاق السريع يُختصر بمفتاحه) */
export function rangeParams(range: DateRange): Record<string, string> {
  return range.key === "custom"
    ? { from: range.from, to: range.to }
    : { range: range.key };
}

// ---------------------------------------------------------------------------
// من تاريخ القاهرة إلى لحظة زمنية — حدود ترشيح `occurred_at` (timestamptz)
// ---------------------------------------------------------------------------

/**
 * منتصف ليل القاهرة ليوم بعينه كسلسلة ISO بتوقيت UTC.
 *
 * لماذا لا نمرّر `YYYY-MM-DD` مباشرة إلى مقارنة `timestamptz`؟ لأن Postgres
 * يفسّرها بمنطقة الجلسة (UTC غالباً)، فيصير «يوم ١٢» عند المالك ممتداً من الساعة
 * ٣ صباحاً إلى ٣ صباح اليوم التالي — وتُنسب حركات الليل إلى اليوم الخطأ.
 *
 * الإزاحة تُقاس عند التاريخ نفسه لا عند «الآن»: مصر تعمل بالتوقيت الصيفي، وإزاحة
 * أغسطس (+٣) ليست إزاحة يناير (+٢). نفس أسلوب نوافذ الحدود في شاشة حسابات الدفع.
 */
export function cairoMidnightUtc(iso: string): string {
  const m = ISO_PATTERN.exec(iso);
  if (!m) return `${iso}T00:00:00.000Z`;
  const guess = Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  const p = zonedParts(new Date(guess));
  const asUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
  return new Date(guess - (asUtc - guess)).toISOString();
}

/** حدّا الترشيح للفترة: [بداية اليوم الأول، بداية اليوم التالي للأخير) */
export function rangeInstants(range: DateRange): { start: string; end: string } {
  return {
    start: cairoMidnightUtc(range.from),
    end: cairoMidnightUtc(addDays(range.to, 1)),
  };
}

/**
 * لحظة تسجيل حركة يكتب المالك تاريخها فقط.
 *
 * اليوم الجاري يُسجَّل بلحظته الفعلية (فترتب الحركات داخل اليوم صحيح)، والتاريخ
 * القديم يُسجَّل عند ظهر القاهرة — بعيداً عن حدّي اليوم بحيث لا يقفز إلى يوم
 * مجاور مهما كانت منطقة قراءته لاحقاً.
 */
export function cairoInstantForDate(iso: string): string {
  if (iso === cairoToday()) return new Date().toISOString();
  return new Date(Date.parse(cairoMidnightUtc(iso)) + 12 * 3_600_000).toISOString();
}
