/**
 * جسر الشاشة إلى سجل المحوّلات — **لا نسخة ثانية من الحقيقة**.
 *
 * مواصفة الاعتمادات (`envKeys` و`publicKeys` والملاحظة التعاقدية) وحالة التهيئة
 * كلها من `lib/payments/registry.ts`، وهو المكان الوحيد الذي يعرف أسماء
 * المزوّدين ومفاتيحهم. الشاشة تقرأ المواصفة ولا تعرف مزوّداً بعينه: كل بند في
 * قائمة التحقق وكل حقل معرّف عام مولَّد من هناك، فإضافة مزوّد أو مفتاح في السجل
 * تظهر في اللوحة بلا لمس سطر واحد هنا.
 *
 * ما يخصّ هذا الملف وحده هو **مفردات العرض العربية**: وصف نوع المزوّد واسم كل
 * معرّف عام. لا سرّ يمرّ من هنا — `envKeys` أسماء فقط، وقيمها تُقرأ في
 * `providerReadiness` على الخادم ولا تغادره.
 */

export {
  CREDENTIAL_SPECS,
  PROVIDER_CODES,
  credentialSpec,
  isPaymentProvider,
  providerReadiness,
  type ProviderReadiness,
} from "@/lib/payments/registry";

/** وصف قصير للمزوّد يظهر تحت اسمه في اللوحة (لا يراه عميل) */
export const PROVIDER_KIND: Record<string, string> = {
  test: "اختباري مدمج",
  paymob: "بطاقات محلية — مصر",
  stripe: "بطاقات عالمية",
  paypal: "محفظة عالمية",
  twocheckout: "بطاقات عالمية",
  binancepay: "عملات رقمية",
  nowpayments: "عملات رقمية",
};

/** أسماء المعرّفات العامة بالعربية — تُعرض فوق حقولها في نموذج المزوّد */
const PUBLIC_KEY_LABELS: Record<string, string> = {
  integrationId: "معرّف التكامل (Integration ID)",
  iframeId: "معرّف الإطار (Iframe ID)",
  publishableKey: "المفتاح المنشور (Publishable key)",
  merchantId: "معرّف التاجر",
  merchantCode: "رمز التاجر (Merchant Code)",
  brandName: "اسم العلامة في صفحة الدفع",
  currency: "عملة التسوية",
  payoutCurrency: "عملة التسوية",
};

/** المفتاح غير المعروف يُعرض باسمه الحرفي — أوضح من «معرّف» مبهمة */
export const publicKeyLabel = (key: string): string => PUBLIC_KEY_LABELS[key] ?? key;
