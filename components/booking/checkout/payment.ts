import {
  DEFAULT_PAYMENT_SETTINGS,
  type PaymentPlan,
  type PaymentSettings,
} from "@/lib/booking-types";

/**
 * قراءة إعدادات الدفع من إعدادات الموقع + معاينة العربون للعرض فقط.
 *
 * لماذا القراءة دفاعية؟ مفتاح `payment` يُضاف إلى `site_settings` وإلى نوع
 * SiteSettings في هجرة المرحلة ٤ (يملكها وكيلان آخران)، فهذه الوحدة تقرأه من
 * كائن مجهول النوع وتُسقط على الافتراضيات عند غيابه — فلا تتعطل الواجهة قبل
 * وصول تلك التعديلات ولا بعدها.
 *
 * تنبيه معماري: `splitAmounts` **عرضٌ تقديري فقط** لتوضيح خيار الدفع للعميل.
 * المبالغ المُلزِمة كلها تُحسب في Postgres داخل `create_booking` (قرار ٤) وتصل
 * جاهزة في CreateBookingResponse وفي صفحة متابعة الحجز — ولا يُرسل أي مبلغ من
 * المتصفح إلى الخادم إطلاقاً.
 */

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** رقم محدود بمجال — أي قيمة غير صالحة ترجع للافتراضي */
function clampedNumber(value: unknown, fallback: number, min: number, max: number): number {
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, n));
}

/** إعدادات الدفع من كائن الإعدادات — بلا افتراض وجود المفتاح في النوع */
export function readPaymentSettings(source: unknown): PaymentSettings {
  const raw = isRecord(source) ? source["payment"] : undefined;
  if (!isRecord(raw)) return DEFAULT_PAYMENT_SETTINGS;

  const instructions =
    typeof raw.transferInstructions === "string" && raw.transferInstructions.trim().length > 0
      ? raw.transferInstructions.trim()
      : DEFAULT_PAYMENT_SETTINGS.transferInstructions;

  return {
    depositPercent: clampedNumber(
      raw.depositPercent,
      DEFAULT_PAYMENT_SETTINGS.depositPercent,
      0,
      100
    ),
    depositMinAmount: clampedNumber(
      raw.depositMinAmount,
      DEFAULT_PAYMENT_SETTINGS.depositMinAmount,
      0,
      Number.MAX_SAFE_INTEGER
    ),
    transferInstructions: instructions,
  };
}

/**
 * معاينة تقسيم المبلغ حسب خطة الدفع — للعرض في خطوة «الدفع» قبل الإرسال.
 * العربون = النسبة من الإجمالي بحدٍّ أدنى من الإعدادات، ولا يتجاوز الإجمالي أبداً.
 */
export function splitAmounts(
  total: number,
  plan: PaymentPlan,
  settings: PaymentSettings
): { amountDue: number; amountRemaining: number } {
  const safeTotal = Number.isFinite(total) && total > 0 ? Math.round(total) : 0;
  if (plan === "full") return { amountDue: safeTotal, amountRemaining: 0 };

  const byPercent = Math.round((safeTotal * settings.depositPercent) / 100);
  const due = Math.min(safeTotal, Math.max(byPercent, Math.round(settings.depositMinAmount)));
  return { amountDue: due, amountRemaining: Math.max(0, safeTotal - due) };
}
