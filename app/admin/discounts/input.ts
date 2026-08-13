/**
 * قراءة مدخلات نماذج الخصومات والتحقق منها — **بلا أي حساب مالي**.
 *
 * كل رقم هنا يُقرأ ويُتحقق من مداه ثم يُكتب كما هو؛ قيمة الخصم نفسها لا تُضرب
 * ولا تُقسم في TypeScript إطلاقاً — ذلك كله داخل `public.apply_discount`
 * (القاعدة ٣ في `lib/discount-types.ts`: الحاجز في الدالة لا في الشاشة).
 *
 * الملف مشترك بين إجراءات الكوبونات وإجراءات البانرات، فلا يوجد تعريفان
 * لنافذة الصلاحية أو لتحويل الأرقام العربية الهندية (نمط الانحراف ٤ في
 * `handover/LESSONS.md`).
 */

/** الأرقام العربية الهندية تُقبل في كل حقل رقمي وتُحوَّل قبل التحقق */
export const toLatinDigits = (s: string) =>
  s.replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 0x0660));

/** نص مُشذّب أو null (الفارغ = null) */
export function text(formData: FormData, name: string): string | null {
  const v = formData.get(name);
  return typeof v === "string" && v.trim() !== "" ? v.trim() : null;
}

/** رقم منتهٍ أو null — الفارغ وغير الرقمي كلاهما null */
export function num(formData: FormData, name: string): number | null {
  const v = formData.get(name);
  if (typeof v !== "string" || v.trim() === "") return null;
  const n = Number(toLatinDigits(v.trim()));
  return Number.isFinite(n) ? n : null;
}

export const checked = (formData: FormData, name: string) => formData.get(name) != null;

/** عدد صحيح موجب أو null، و`false` حين كُتب شيء غير صالح (الفرق يغيّر الرسالة) */
export function positiveInt(formData: FormData, name: string): number | null | false {
  const raw = formData.get(name);
  if (typeof raw !== "string" || raw.trim() === "") return null;
  const n = Number(toLatinDigits(raw.trim()));
  if (!Number.isFinite(n) || !Number.isInteger(n) || n < 1) return false;
  return n;
}

/** مبلغ غير سالب أو null، و`false` حين كُتب شيء غير صالح */
export function nonNegative(formData: FormData, name: string): number | null | false {
  const raw = formData.get(name);
  if (typeof raw !== "string" || raw.trim() === "") return null;
  const n = Number(toLatinDigits(raw.trim()));
  if (!Number.isFinite(n) || n < 0) return false;
  return n;
}

// ---------------------------------------------------------------------------
// رمز الكوبون
// ---------------------------------------------------------------------------

/**
 * الرمز كما يُخزَّن: حروف لاتينية كبيرة وأرقام وشرطات، ٣–٣٢ خانة.
 *
 * التطبيع هنا **للتخزين والعرض فقط**؛ المقارنة وقت التحقق تقع في
 * `apply_discount` بلا حساسية لحالة الأحرف ولا مسافات (نص العقد حرفياً). أي
 * تطبيع في الواجهة وحدها كان سيصير حارساً وهمياً — والحارس في القاعدة.
 */
export const COUPON_CODE_PATTERN = /^[A-Z0-9][A-Z0-9-]{1,30}[A-Z0-9]$/;

export function normalizeCouponCode(raw: string | null): string | null {
  if (!raw) return null;
  const code = toLatinDigits(raw).trim().toUpperCase().replace(/\s+/g, "");
  return COUPON_CODE_PATTERN.test(code) ? code : null;
}

/** معرّف الفئة كما في `vehicle_classes.slug` */
export const CLASS_SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

/**
 * فئات الكوبون — مصفوفة فارغة تعني **كل الفئات** (نص العقد). ترجع `false` حين
 * يصل معرّف غير صالح الشكل، فلا يُكتب كوبون موجَّه لفئة لا وجود لها ثم يُشكّ
 * في القاعدة حين لا يعمل.
 */
export function classSlugs(formData: FormData): string[] | false {
  const raw = formData.getAll("class_slugs");
  const slugs: string[] = [];
  for (const value of raw) {
    if (typeof value !== "string") return false;
    const slug = value.trim().toLowerCase();
    if (slug === "") continue;
    if (!CLASS_SLUG_PATTERN.test(slug)) return false;
    if (!slugs.includes(slug)) slugs.push(slug);
  }
  return slugs;
}

// ---------------------------------------------------------------------------
// نافذة الصلاحية — التاريخ يُكتب يوماً، ويُخزَّن لحظةً بتوقيت القاهرة
// ---------------------------------------------------------------------------

const TIME_ZONE = "Africa/Cairo";

const CAIRO_PARTS = new Intl.DateTimeFormat("en-US", {
  timeZone: TIME_ZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hourCycle: "h23",
});

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/** الساعة الجدارية في القاهرة للحظة معطاة، بالمللي ثانية «كأنها UTC» */
function cairoWallClock(instant: number): number {
  const parts = CAIRO_PARTS.formatToParts(new Date(instant));
  const read = (type: string) => Number(parts.find((p) => p.type === type)?.value ?? "0");
  return Date.UTC(
    read("year"),
    read("month") - 1,
    read("day"),
    read("hour"),
    read("minute"),
    read("second")
  );
}

/**
 * يوم مكتوب في حقل `type="date"` ← لحظة حقيقية بتوقيت القاهرة.
 *
 * `edge = "start"` تعني منتصف ليل ذلك اليوم، و`"end"` تعني آخر ثانية فيه —
 * فـ«ينتهي ٣١ أغسطس» يعني نهاية ٣١ لا بدايته (وهو ما يفهمه المالك، وخلافه
 * يقطع الحملة قبل يوم كامل).
 *
 * لماذا لا نرسل `"2026-08-31"` خاماً إلى عمود `timestamptz`؟ لأن Postgres
 * يفسّره بمنطقة الجلسة (UTC على Supabase) فينزاح الحد ساعتين أو ثلاثاً بحسب
 * التوقيت الصيفي — وحدٌّ ينزاح بلا علم المالك هو بالضبط ما تمنعه قاعدة «الواجهة
 * لا تَعِد بما لا يقع». والإزاحة تُقاس من `Intl` (تعرف التوقيت الصيفي) بمرّتين:
 * الأولى تقديرية والثانية تصحّح نفسها لو وقع اليوم على حدّ تغيير التوقيت.
 *
 * الإرجاع: `null` للحقل الفارغ (بلا حد)، و`false` لتاريخ غير صالح.
 */
export function cairoInstant(value: string | null, edge: "start" | "end"): string | null | false {
  if (value === null) return null;
  const day = toLatinDigits(value).trim();
  if (!ISO_DATE.test(day)) return false;

  const [y, m, d] = day.split("-").map(Number) as [number, number, number];
  if (!y || !m || !d || m > 12 || d > 31) return false;

  const wanted =
    edge === "start" ? Date.UTC(y, m - 1, d, 0, 0, 0) : Date.UTC(y, m - 1, d, 23, 59, 59);

  // التقريب الأول: نفترض أن الإزاحة عند اللحظة المطلوبة كإزاحتها عند نفس
  // الساعة الجدارية بتوقيت UTC، ثم نصحّحها بقياس ثانٍ عند اللحظة الناتجة.
  let instant = wanted - (cairoWallClock(wanted) - wanted);
  instant = wanted - (cairoWallClock(instant) - instant);

  const date = new Date(instant);
  if (Number.isNaN(date.getTime())) return false;
  // تحقق أخير: هل يقع اليوم المطلوب فعلاً في القاهرة؟ (حدّ التوقيت الصيفي)
  const back = new Date(cairoWallClock(instant));
  if (back.getUTCFullYear() !== y || back.getUTCMonth() + 1 !== m || back.getUTCDate() !== d)
    return false;

  return date.toISOString();
}

/** لحظة مخزَّنة ← اليوم كما يُكتب في حقل `type="date"` بتوقيت القاهرة */
export function cairoDateInput(value: string | null | undefined): string {
  if (!value) return "";
  const at = new Date(value);
  if (Number.isNaN(at.getTime())) return "";
  const wall = new Date(cairoWallClock(at.getTime()));
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${wall.getUTCFullYear()}-${pad(wall.getUTCMonth() + 1)}-${pad(wall.getUTCDate())}`;
}

/** مواضع البانر الثلاثة — نفس اتحاد `PromoBanner["placement"]` حرفاً بحرف */
export const BANNER_PLACEMENTS = ["home", "offers", "checkout"] as const;

export type BannerPlacement = (typeof BANNER_PLACEMENTS)[number];

export const isBannerPlacement = (value: unknown): value is BannerPlacement =>
  typeof value === "string" && (BANNER_PLACEMENTS as readonly string[]).includes(value);
