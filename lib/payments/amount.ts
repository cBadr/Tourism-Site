/**
 * تحويل الوحدات الصغرى ← نص عشري، ولا شيء غير ذلك.
 *
 * العقد يخزّن المبلغ **بالقرش عدداً صحيحاً** (`amountMinor`) تفادياً لانحراف
 * الكسور العشرية في JavaScript: `0.1 + 0.2 !== 0.3`، و«جنيه واحد» فرق في حجز
 * واحد يعني ساعة مطابقة في نهاية الشهر. الحساب المالي كله في Postgres، وهذه
 * الوحدة لا تحسب شيئاً — تعيد التمثيل فقط لأن بعض المزوّدين (PayPal،
 * NOWPayments، 2Checkout) لا يقبلون إلا نصاً عشرياً.
 *
 * أسّ العملة ليس ١٠٠ دائماً: الين الياباني والوون الكوري بلا كسور إطلاقاً،
 * والدينار الكويتي ثلاثة أرقام عشرية. القسمة على ١٠٠ في كل الأحوال تعني تحصيل
 * ١٪ من قيمة الحجز بالين — لذلك الجدول أدناه، محدود عمداً بما هو غير قياسي.
 */

/** عملات بلا وحدات صغرى — المبلغ الصغير هو المبلغ نفسه */
const ZERO_DECIMAL = new Set([
  "BIF", "CLP", "DJF", "GNF", "JPY", "KMF", "KRW", "MGA",
  "PYG", "RWF", "UGX", "VND", "VUV", "XAF", "XOF", "XPF",
]);

/** عملات بثلاثة أرقام عشرية */
const THREE_DECIMAL = new Set(["BHD", "IQD", "JOD", "KWD", "LYD", "OMR", "TND"]);

export function currencyExponent(currency: string): number {
  const code = (currency ?? "").trim().toUpperCase();
  if (ZERO_DECIMAL.has(code)) return 0;
  if (THREE_DECIMAL.has(code)) return 3;
  return 2;
}

/** ٢٥٠٠ قرشاً + EGP ← "25.00" — نص لأن الرقم العشري نفسه هو مصدر الانحراف */
export function minorToDecimalString(amountMinor: number, currency: string): string {
  const exponent = currencyExponent(currency);
  const value = Math.round(amountMinor);
  const sign = value < 0 ? "-" : "";
  const digits = Math.abs(value).toString().padStart(exponent + 1, "0");
  if (exponent === 0) return `${sign}${digits}`;
  const whole = digits.slice(0, digits.length - exponent);
  const fraction = digits.slice(digits.length - exponent);
  return `${sign}${whole}.${fraction}`;
}

/** "25.00" + EGP ← ٢٥٠٠ — لقراءة المبالغ العائدة في أجسام الـ webhook */
export function decimalToMinor(value: string | number, currency: string): number | null {
  const text = typeof value === "number" ? String(value) : (value ?? "").trim();
  if (text === "" || !/^-?\d+(\.\d+)?$/.test(text)) return null;
  const amount = Number(text);
  if (!Number.isFinite(amount)) return null;
  return Math.round(amount * 10 ** currencyExponent(currency));
}

/** العملة بصيغتها القياسية (ثلاثة حروف كبيرة) — أو null إن لم تكن كذلك */
export function normalizeCurrency(currency: string | null | undefined): string | null {
  const code = (currency ?? "").trim().toUpperCase();
  return /^[A-Z]{3}$/.test(code) ? code : null;
}
