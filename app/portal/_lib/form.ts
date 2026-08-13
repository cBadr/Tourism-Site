/**
 * قارئات حقول النماذج في البورتال — دوال نقية بلا أي أثر جانبي.
 *
 * نفس اتفاقيات اللوحة حرفياً: الأرقام العربية الهندية مقبولة في كل حقل رقمي
 * وتُحوَّل قبل التحقق، والحقل الفارغ يعني `null` لا صفراً (الفرق جوهري: صفر في
 * حقل سعر يعني «رحلة مجانية»، بينما الفراغ يعني «لا أغطي هذه الفئة»).
 *
 * لا حساب مالي هنا إطلاقاً — تحقق من المدخلات فقط، والحساب كله في Postgres.
 */

/** الأرقام العربية الهندية تُقبل في الحقول الرقمية وتُحوَّل قبل التحقق */
export const toLatinDigits = (s: string) =>
  s.replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 0x0660));

/** نص مُشذّب أو null */
export function text(formData: FormData, name: string): string | null {
  const v = formData.get(name);
  return typeof v === "string" && v.trim() !== "" ? v.trim() : null;
}

/** رقم منتهٍ أو null (الفارغ وغير الرقمي كلاهما null) */
export function num(formData: FormData, name: string): number | null {
  const v = formData.get(name);
  if (typeof v !== "string" || v.trim() === "") return null;
  const n = Number(toLatinDigits(v.trim()));
  return Number.isFinite(n) ? n : null;
}

export const checked = (formData: FormData, name: string) => formData.get(name) != null;

/** حدود عاقلة تمنع الأخطاء المطبعية الكارثية (ليست قواعد تسعير) */
export const MAX_COST = 10_000_000;
export const MAX_RADIUS_KM = 500;
export const MAX_SEATS = 200;
export const MIN_MODEL_YEAR = 1970;
export const MAX_MODEL_YEAR = 2100;
export const MAX_TEXT = 160;

/** حدود الإحداثيات — تمنع حفظ نقطة مستحيلة لو تلاعب أحد بالحقول المخفية */
export function isLat(v: number | null): v is number {
  return v !== null && Number.isFinite(v) && v >= -90 && v <= 90;
}

export function isLng(v: number | null): v is number {
  return v !== null && Number.isFinite(v) && v >= -180 && v <= 180;
}

/** رابط بروتوكوله http/https فقط — يمنع `javascript:` في حقول السوشيال والصورة */
export function safeUrl(value: string | null): string | null {
  if (!value) return null;
  const candidate = /^https?:\/\//i.test(value) ? value : `https://${value}`;
  try {
    const parsed = new URL(candidate);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return null;
    return parsed.toString();
  } catch {
    return null;
  }
}

/** قص النصوص الطويلة قبل الكتابة — الحقل الحر لا يُترك بلا سقف */
export const clamp = (value: string | null, max = MAX_TEXT) =>
  value === null ? null : value.slice(0, max);
