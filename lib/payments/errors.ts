import type { PaymentProvider } from "@/lib/payments-types";

/**
 * أخطاء طبقة المزوّدين — نوع واحد يحمل رمزاً يقرؤه المسار ويحوّله إلى حالة HTTP.
 *
 * القاعدة الحاكمة (من العقد): **مزوّد معطَّل لا يعمل نصف عمل.** المحوِّل الذي
 * لا يجد متغيرات بيئته يرمي `not-configured` فوراً — لا يحاول نداء المزوّد بلا
 * مفتاح، ولا يعيد رابطاً وهمياً، ولا «يتحقق» من توقيع بسرّ فارغ (وهو أخطر ما
 * يمكن: HMAC بمفتاح فارغ توقيعٌ يستطيع أي أحد إنتاجه).
 *
 * الرموز:
 *   not-configured   → متغير بيئة ناقص. المسار يرد ٥٠٣ (يعيد المزوّد المحاولة).
 *   provider-error   → المزوّد رد بخطأ أو بشكل غير متوقع.
 *   invalid-response → رد ناجح لكنه لا يحمل ما نحتاجه (رابط أو معرّف).
 *   invalid-request  → مدخل لا يقبله المزوّد (عملة غير مدعومة مثلاً).
 */

export type PaymentErrorCode =
  | "not-configured"
  | "provider-error"
  | "invalid-response"
  | "invalid-request";

export class PaymentProviderError extends Error {
  readonly provider: PaymentProvider;
  readonly code: PaymentErrorCode;
  /** أسماء متغيرات البيئة الناقصة — تُعرض في قائمة تحقق اللوحة */
  readonly missing: string[];
  /** حالة HTTP التي ردّ بها المزوّد إن وُجدت — للسجل لا للعميل */
  readonly status?: number;

  constructor(
    provider: PaymentProvider,
    code: PaymentErrorCode,
    message: string,
    options: { missing?: string[]; status?: number; cause?: unknown } = {}
  ) {
    super(message, options.cause === undefined ? undefined : { cause: options.cause });
    this.name = "PaymentProviderError";
    this.provider = provider;
    this.code = code;
    this.missing = options.missing ?? [];
    this.status = options.status;
  }
}

export function isPaymentProviderError(err: unknown): err is PaymentProviderError {
  return err instanceof PaymentProviderError;
}

export function isNotConfigured(err: unknown): boolean {
  return isPaymentProviderError(err) && err.code === "not-configured";
}

/** خطأ «غير مهيّأ» المُنمَّط — كل محوِّل يستدعيه بأسماء متغيراته الناقصة */
export function notConfigured(provider: PaymentProvider, missing: string[]): PaymentProviderError {
  return new PaymentProviderError(
    provider,
    "not-configured",
    `بوابة «${provider}» غير مهيّأة: ${missing.join("، ")} غير مضبوط في متغيرات البيئة.`,
    { missing }
  );
}

/**
 * قراءة متغيرات البيئة **لحظة الاستدعاء** لا وقت تحميل الوحدة.
 *
 * السبب ليس أسلوبياً: الوحدة تُحمَّل مرة واحدة في عمر العملية، فقراءة المفاتيح
 * في أعلى الملف تعني أن ضبط متغير جديد على Vercel لا يسري إلا بإعادة نشر
 * كاملة، وأن أي اختبار لا يستطيع تبديل المفتاح بين حالتين.
 *
 * القيمة الفارغة أو المسافات البيضاء = غياب. مفتاح بقيمة `""` في لوحة النشر
 * خطأ شائع، ولو عدّدناه موجوداً لبنينا توقيعاً بمفتاح فارغ.
 */
export function readEnv(name: string): string | null {
  const value = process.env[name];
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed === "" ? null : trimmed;
}

/** كل الأسماء أو الرمي — الترتيب محفوظ في الناتج بنفس ترتيب الطلب */
export function requireEnv(provider: PaymentProvider, names: string[]): Record<string, string> {
  const found: Record<string, string> = {};
  const missing: string[] = [];

  for (const name of names) {
    const value = readEnv(name);
    if (value === null) missing.push(name);
    else found[name] = value;
  }

  if (missing.length > 0) throw notConfigured(provider, missing);
  return found;
}

/** هل كل متغيرات هذا المزوّد مضبوطة؟ — تستعمله اللوحة لرسم قائمة التحقق */
export function missingEnv(names: string[]): string[] {
  return names.filter((name) => readEnv(name) === null);
}
