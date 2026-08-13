import { durationLabel, formatAmount, formatMoney, toArabicDigits } from "@/components/booking/format";
import type { StatCard } from "@/lib/analytics-types";

/**
 * تنسيق قيم بطاقات المؤشرات — **عرض محض، لا حساب**.
 *
 * القاعدة الحاكمة للمرحلة (قرار ٣ في موجز المرحلة ١٠، وقاعدة ٢ في العقد
 * `lib/analytics-types.ts`): كل رقم ورسم يأتي من view أو دالة في Postgres.
 * ما يجري في هذا الملف ثلاثة أشياء لا رابع:
 *
 *  ١) اختيار الخانات والفواصل بحسب لغة العرض (عربية هندية افتراضاً).
 *  ٢) وصل الرقم برمز عملته أو بعلامة النسبة أو بصياغة المدة.
 *  ٣) اختيار **لون** سهم التغيّر — ولا يغيّر ذلك الرقم ولا إشارته.
 *
 * لا جمع ولا طرح ولا قسمة على قيمة تُعرض. الاستثناء الوحيد تحويل وحدة المدة
 * (ثانية ⇄ دقيقة) وهو صياغة لا محاسبة: الرقم نفسه ومصدره لا يتغيّران.
 */

/** صيغ العرض من العقد — لا تُوسَّع إلا بتوسيع `StatCard["format"]` نفسه */
export type StatFormat = StatCard["format"];

/**
 * وحدة قيمة البطاقات من نوع `duration`.
 *
 * ⚠ **عقد مع هجرة 0022:** الافتراض هو **الدقائق**، لأن `durationLabel` في
 * المستودع كله يستقبل دقائق. وإن أرجعت الدالة عموداً اختيارياً `unit`
 * (`seconds` مثلاً — وهو ما ينتج طبيعياً عن `extract(epoch from …)`) فالتحويل
 * يقع هنا للعرض. العمود ليس جزءاً من `StatCard` في العقد؛ يُقرأ إن وُجد
 * ويُتجاهل إن غاب، فلا انحراف في الاتجاهين.
 */
export type StatDurationUnit = "seconds" | "minutes" | "hours";

const ARABIC_DECIMAL_SEPARATOR = "٫";
/** علامة النسبة العربية U+066A */
const ARABIC_PERCENT = "٪";

/** رقم بخانة عشرية واحدة بالعربية — للنسب الصغيرة التي يخفيها التقريب */
function oneDecimalArabic(value: number): string {
  const sign = value < 0 ? "−" : "";
  const [intPart = "0", fracPart = "0"] = Math.abs(value).toFixed(1).split(".");
  return `${sign}${toArabicDigits(intPart)}${ARABIC_DECIMAL_SEPARATOR}${toArabicDigits(fracPart)}`;
}

/**
 * نسبة مئوية. **العقد: القيمة تصل بمقياس ٠–١٠٠ لا ٠–١** — نفس مقياس
 * `translation_progress().percent` القائم منذ المرحلة ٨، وهو ما يقرؤه شريط
 * التقدم بلا تحويل.
 *
 * النسب الصغيرة تُعرض بخانة عشرية واحدة: «٠٪» بدل «٠٫٤٪» يقول للمالك إن
 * التحويل معدوم وهو ليس كذلك.
 */
export function formatStatPercent(value: number): string {
  const abs = Math.abs(value);
  const text =
    abs > 0 && abs < 10 && !Number.isInteger(value) ? oneDecimalArabic(value) : formatAmount(value);
  return `${text}${ARABIC_PERCENT}`;
}

/** تحويل وحدة المدة إلى دقائق — صياغة عرض لا حساب محاسبي */
function toMinutes(value: number, unit: StatDurationUnit): number {
  if (unit === "seconds") return value / 60;
  if (unit === "hours") return value * 60;
  return value;
}

/**
 * قيمة بطاقة جاهزة للعرض. `null` تعني «غير معروف» وتُطبع «—» — و«٠» تكذب حين
 * لا نعرف (نفس قاعدة شاشات المالية).
 */
export function formatStatValue(
  value: number | null,
  format: StatFormat,
  currency: string,
  unit: StatDurationUnit = "minutes"
): string {
  if (value === null || !Number.isFinite(value)) return "—";
  switch (format) {
    case "money":
      return formatMoney(value, currency);
    case "percent":
      return formatStatPercent(value);
    case "duration":
      return durationLabel(toMinutes(value, unit));
    case "number":
    default:
      return formatAmount(value);
  }
}

// ---------------------------------------------------------------------------
// التغيّر عن الفترة السابقة
// ---------------------------------------------------------------------------

export type DeltaDirection = "up" | "down" | "flat";

/**
 * اتجاه التغيّر — `null` حين لا مقارنة.
 *
 * `deltaPercent = null` في العقد تعني «لا مقارنة»: إمّا لأن الفترة السابقة
 * كانت صفراً (فالنسبة غير معرَّفة رياضياً ولا تُخترع)، وإمّا لأن المؤشر لحظي
 * لا فترة له. لا تُترجَم `null` إلى صفر في أي موضع.
 */
export function deltaDirection(deltaPercent: number | null): DeltaDirection | null {
  if (deltaPercent === null || !Number.isFinite(deltaPercent)) return null;
  if (deltaPercent > 0) return "up";
  if (deltaPercent < 0) return "down";
  return "flat";
}

/** نص التغيّر مع إشارته — «+١٢٪» / «−٨٫٤٪» / «بلا تغيّر» */
export function formatDelta(deltaPercent: number | null): string | null {
  const dir = deltaDirection(deltaPercent);
  if (dir === null || deltaPercent === null) return null;
  if (dir === "flat") return "بلا تغيّر";
  return `${dir === "up" ? "+" : "−"}${formatStatPercent(Math.abs(deltaPercent))}`;
}

/**
 * مؤشرات ارتفاعها سيّئ — الملونة عكسياً.
 *
 * السبب: «الطلبات الملغاة +٤٠٪» بلون أخضر كذبة بصرية. المطابقة بجزء من مفتاح
 * البطاقة لا بمساواته، حتى يظل المفتاح حراً في هجرة 0022 (`cancelled_orders`
 * و`orders_cancelled` كلاهما يُلتقط). هذا **تلوين فقط** ولا يمس الرقم ولا
 * إشارته ولا نصّه.
 *
 * ⚠ القائمة تُطابَق **مفتاحاً بمفتاح** مع ما تُرجعه `section_stats` في هجرة
 * 0022؛ كُتبت أول مرة بأسماء مفترضة قبل وجود الهجرة فأخطأت ثلاثة:
 *   • `manual_assign` ⇒ المفتاح الحقيقي `manual_rate` (نسبة الإسناد اليدوي —
 *     ارتفاعها يعني أن البث توقف عن العمل، فكانت تظهر خضراء).
 *   • `first_accept_minutes` (متوسط زمن أول قبول) — تضاعف الزمن خبر سيئ.
 *   • `expenses` (المصروفات) — ارتفاعها خبر سيئ.
 * وما تُرك عمداً: `partner_cost` — تكلفة المتعهدين ترتفع لأن الرحلات ازدادت،
 * فتلوينها بالأحمر كذبة معاكسة. من احتاج قطبيةً لمفتاح ملتبس يمرّرها صراحةً
 * عبر `inverted` من الشاشة.
 */
const INVERTED_KEY_HINTS = [
  "cancel",
  "reject",
  "expire",
  "fail",
  "refund",
  "missing",
  "stale",
  "draft",
  "unassigned",
  "unpublished",
  "no_meta",
  "meta_missing",
  "manual_rate",
  "manual_assign",
  "first_accept",
  "expense",
  "overdue",
  "abandon",
];

export function deltaIsInverted(key: string): boolean {
  const k = (key ?? "").toLowerCase();
  return INVERTED_KEY_HINTS.some((hint) => k.includes(hint));
}

/**
 * هل هذا التغيّر خبر جيد؟ `null` حين لا مقارنة أو حين لا تغيّر.
 * `inverted` يسمح للشاشة بفرض القطبية صراحةً حين لا يكفي اسم المفتاح.
 */
export function deltaIsGood(
  key: string,
  deltaPercent: number | null,
  inverted?: boolean
): boolean | null {
  const dir = deltaDirection(deltaPercent);
  if (dir === null || dir === "flat") return null;
  const flip = inverted ?? deltaIsInverted(key);
  return flip ? dir === "down" : dir === "up";
}

// ---------------------------------------------------------------------------
// تحويل البطاقات إلى صفوف مقارنة أفقية
// ---------------------------------------------------------------------------

export type StatBarItem = {
  key: string;
  label: string;
  /** القيمة كما وصلت من القاعدة — لهندسة عرض الشريط فقط */
  value: number | null;
  /** النص المعروض بجوار الشريط */
  display: string;
  hint?: string;
};

/**
 * بطاقات ← أشرطة مقارنة. لا يُشتق رقم جديد: نفس القيمة ونفس نصّها المنسَّق،
 * والشريط يعرض طولاً نسبياً وحسب (هندسة عرض، لا محاسبة).
 */
export function cardsToBars(cards: StatCard[], currency: string): StatBarItem[] {
  return cards.map((card) => ({
    key: card.key,
    label: card.label,
    value: card.value,
    display: formatStatValue(card.value, card.format, currency),
    hint: card.help,
  }));
}
