import type { PaymentAdapter, PaymentProvider } from "@/lib/payments-types";

import { isPaymentProvider } from "@/lib/payments/credentials";
import { binancepayAdapter } from "@/lib/payments/providers/binancepay";
import { nowpaymentsAdapter } from "@/lib/payments/providers/nowpayments";
import { paymobAdapter } from "@/lib/payments/providers/paymob";
import { paypalAdapter } from "@/lib/payments/providers/paypal";
import { stripeAdapter } from "@/lib/payments/providers/stripe";
import { testAdapter } from "@/lib/payments/providers/test";
import { twocheckoutAdapter } from "@/lib/payments/providers/twocheckout";

/**
 * سجل المزوّدين — الرمز ← المحوِّل.
 *
 * هذا الملف هو **المكان الوحيد** الذي يعرف أسماء المزوّدين مجتمعة. المسارات
 * تعرف «مزوّداً» مجرّداً وتستدعي `getAdapter`؛ ولا سطر واحد فيها يسأل «هل هذا
 * المزوّد هو test؟» — وإلا لصار المزوّد الاختباري طريقاً موازياً لا اختباراً
 * للطريق الحقيقي، ولانتفت الفائدة كلها.
 *
 * نوع `Record<PaymentProvider, PaymentAdapter>` ليس تزيّناً: إضافة مزوّد إلى
 * الاتحاد في العقد بلا محوّل هنا **خطأ ترجمة**، لا اكتشافاً وقت التشغيل حين
 * يضغط عميل زر الدفع.
 *
 * جدول بيانات الاعتماد يُعاد تصديره من `credentials.ts` (بيانات صرفة بلا
 * `node:crypto`) فيبقى «السجل + الجدول» مدخلاً واحداً لمن يريده، وتستطيع شاشة
 * اللوحة استيراد الجدول وحده بلا أن تجرّ محوّلاً واحداً إلى حزمة المتصفح.
 */

const ADAPTERS: Record<PaymentProvider, PaymentAdapter> = {
  test: testAdapter,
  paymob: paymobAdapter,
  stripe: stripeAdapter,
  paypal: paypalAdapter,
  twocheckout: twocheckoutAdapter,
  binancepay: binancepayAdapter,
  nowpayments: nowpaymentsAdapter,
};

export function getAdapter(provider: PaymentProvider): PaymentAdapter {
  return ADAPTERS[provider];
}

/** المحوِّل أو null — للمدخلات القادمة من الشبكة قبل أي تحقق */
export function findAdapter(value: unknown): PaymentAdapter | null {
  return isPaymentProvider(value) ? ADAPTERS[value] : null;
}

export {
  CREDENTIAL_SPECS,
  PROVIDER_CODES,
  credentialSpec,
  isPaymentProvider,
  providerReadiness,
  type ProviderReadiness,
} from "@/lib/payments/credentials";
