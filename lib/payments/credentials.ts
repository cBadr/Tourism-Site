import type { PaymentProvider, ProviderCredentialSpec } from "@/lib/payments-types";

import { missingEnv } from "@/lib/payments/errors";

/**
 * جدول بيانات الاعتماد — ما يحتاجه كل مزوّد من **أوراق ومفاتيح**، بلغة صريحة.
 *
 * الملاحظات هنا واقعية لا تسويقية: ثلاث بوابات من الستّ قد لا تقبل فرداً مصرياً
 * أصلاً، وإخفاء ذلك خلف زر «تفعيل» يعني أن يكتشف المالك الحقيقة بعد أسبوعين من
 * انتظار مراجعة حساب كان مرفوضاً من أول يوم.
 *
 * لماذا ملف مستقل عن `registry.ts`: السجل يستورد كل المحوّلات، والمحوّلات
 * تستورد `node:crypto`. شاشة `/admin/payments` قد تكون مكوّن عميل، واستيرادها
 * للسجل كان سيسحب وحدات Node إلى حزمة المتصفح فينكسر البناء. هذا الملف بيانات
 * صرفة يستوردها أي طرف بلا أثر — و`registry.ts` يعيد تصديره فيبقى «السجل + جدول
 * الاعتمادات» مدخلاً واحداً لمن يريده كذلك.
 */

export const CREDENTIAL_SPECS: ProviderCredentialSpec[] = [
  {
    provider: "test",
    envKeys: [],
    publicKeys: [],
    note:
      "بوابة اختبار داخلية بلا أي حساب خارجي ولا أوراق: تعرض صفحة دفع وهمية بزرَّي نجاح وفشل، " +
      "وترسل webhook موقّعاً إلى نظامنا كما يفعل مزوّد حقيقي — فتُختبر السلسلة كاملة (دفع ← تأكيد ← " +
      "قيد في الخزينة ← بدء البث) اليوم بلا انتظار أي موافقة. في التطوير تعمل بلا إعداد إطلاقاً؛ " +
      "وفي الإنتاج تشترط ضبط NOTIFY_DISPATCH_KEY لأن سرّ التوقيع مشتق منه، وبدونه يصبح السرّ " +
      "معلوماً لأي أحد. لا تُترك مفعّلة على موقع حيّ يستقبل عملاء.",
  },
  {
    provider: "paymob",
    envKeys: ["PAYMOB_API_KEY", "PAYMOB_HMAC_SECRET"],
    publicKeys: ["integrationId", "iframeId"],
    note:
      "السكة الواقعية للبطاقات في مصر. الحساب يُفتح لدى Paymob مصر ويطلب في العادة سجلاً تجارياً " +
      "وبطاقة ضريبية وحساباً بنكياً باسم النشاط (وقد يُقبل نشاط فردي مسجَّل — يُحسم مع فريق مبيعاتهم " +
      "لا بالتخمين). بعد التفعيل: API Key من Settings ← Account Info، وHMAC Secret من نفس الشاشة، " +
      "ومعرّف التكامل ومعرّف الإطار (Integration ID / Iframe ID) لكل وسيلة دفع على حدة (بطاقة، محفظة، " +
      "تقسيط) — والأخيران يُدخلان من هذه اللوحة لأنهما ليسا سرّين. " +
      "وسجّل رابط الإشعار /api/payments/webhook/paymob في خانة Transaction Processed Callback.",
  },
  {
    provider: "stripe",
    envKeys: ["STRIPE_SECRET_KEY", "STRIPE_WEBHOOK_SECRET"],
    publicKeys: ["publishableKey"],
    note:
      "⚠ مصر ليست ضمن الدول التي تقبل Stripe فيها تسجيل نشاط تجاري. عملياً: لا يستطيع فرد مصري فتح " +
      "حساب تحصيل، ويلزم كيان مسجَّل في دولة مدعومة بحساب بنكي فيها (أو Stripe Atlas وما يتبعه من " +
      "التزامات ضريبية سنوية). المفاتيح حين تتوفر: Secret Key من Developers ← API keys، وسرّ الإشعار " +
      "من Developers ← Webhooks بعد إضافة نقطة النهاية /api/payments/webhook/stripe والاشتراك في " +
      "حدث checkout.session.completed. لا تُفعَّل قبل وجود حساب فعلي.",
  },
  {
    provider: "paypal",
    envKeys: [
      "PAYPAL_CLIENT_ID",
      "PAYPAL_CLIENT_SECRET",
      "PAYPAL_WEBHOOK_ID",
      "PAYPAL_WEBHOOK_CERT_PEM",
    ],
    publicKeys: ["brandName"],
    note:
      "⚠ استقبال المدفوعات عبر PayPal مقيَّد في مصر، والجنيه المصري ليس عملة تحصيل مقبولة لديها — " +
      "أي أن التسعير يجب أن يكون بعملة أخرى (دولار مثلاً) بسعر صرف يقرره المالك. " +
      "المفاتيح من developer.paypal.com ← My Apps & Credentials (Client ID و Secret)، ومعرّف الإشعار " +
      "(Webhook ID) بعد إنشائه على /api/payments/webhook/paypal. " +
      "وPAYPAL_WEBHOOK_CERT_PEM هي شهادة PayPal العامة: تُنزَّل مرة واحدة من عنوان ترويسة " +
      "paypal-cert-url وتُلصق كاملة — التحقق المحلي من التوقيع لا يستطيع تنزيلها بنفسه.",
  },
  {
    provider: "twocheckout",
    envKeys: ["TWOCHECKOUT_BUY_LINK_SECRET", "TWOCHECKOUT_INS_SECRET"],
    publicKeys: ["merchantCode"],
    note:
      "⚠ 2Checkout (Verifone) بائع مسجَّل (Merchant of Record) ويطلب كياناً تجارياً موثَّقاً؛ طلبات " +
      "الأفراد من مصر تُرفض غالباً. الإعداد بعد القبول: رمز التاجر (Merchant Code) من لوحة التاجر " +
      "ويُدخل هنا، وكلمة سر روابط الشراء (Buy Link Secret Word)، وكلمة سر الإشعارات (INS Secret Word) " +
      "— والأخيرتان في متغيرات البيئة. " +
      "ملاحظة تشغيلية: 2Checkout تنتظر رداً نصياً خاصاً على إشعار IPN؛ راجع ملاحظات التكامل.",
  },
  {
    provider: "binancepay",
    envKeys: ["BINANCEPAY_API_KEY", "BINANCEPAY_API_SECRET", "BINANCEPAY_WEBHOOK_PUBLIC_KEY"],
    publicKeys: ["currency"],
    note:
      "⚠ يحتاج حساب تاجر Binance Pay، وهو تحقق مؤسسي (KYB) لا فردي: وثائق كيان ونشاط معتمد. " +
      "التحصيل بالعملات الرقمية لا بالجنيه، والحصيلة تبقى رصيداً داخل Binance حتى يحوّله المالك. " +
      "المفاتيح من Merchant Portal ← Developers (API Key و Secret Key)، والمفتاح العام للتحقق من " +
      "الإشعار يُجلب مرة واحدة من واجهة الشهادات ويوضع في متغير البيئة. " +
      "«currency» في هذه اللوحة هي العملة الرقمية للتسوية (USDT افتراضاً).",
  },
  {
    provider: "nowpayments",
    envKeys: ["NOWPAYMENTS_API_KEY", "NOWPAYMENTS_IPN_SECRET"],
    publicKeys: [],
    note:
      "أيسر بوابات العملات الرقمية تسجيلاً (حساب ببريد ومحفظة استلام)، لكن السحب إلى حساب بنكي يمر " +
      "بتحقق هوية وشريك صرافة، والرسوم وسعر الصرف يقررهما المزوّد لحظة الدفع. " +
      "المفاتيح من لوحة NOWPayments: API Key، ثم IPN Secret بعد ضبط رابط الإشعار " +
      "/api/payments/webhook/nowpayments في Store Settings. " +
      "وافحص أن الجنيه المصري ضمن عملات التسعير المدعومة لديهم قبل التفعيل.",
  },
];

/** رموز المزوّدين بترتيب الإطلاق — مشتقة من الجدول فلا تفترق نسختان */
export const PROVIDER_CODES: PaymentProvider[] = CREDENTIAL_SPECS.map((spec) => spec.provider);

const SPECS = new Map(CREDENTIAL_SPECS.map((spec) => [spec.provider, spec]));

export function isPaymentProvider(value: unknown): value is PaymentProvider {
  return typeof value === "string" && SPECS.has(value as PaymentProvider);
}

export function credentialSpec(provider: PaymentProvider): ProviderCredentialSpec {
  return SPECS.get(provider) ?? { provider, envKeys: [], publicKeys: [], note: "" };
}

/**
 * حالة تهيئة مزوّد — تقرؤها شاشة اللوحة لترسم «جاهز» أو «ينقصه كذا».
 *
 * تُرجع **أسماء** المتغيرات الناقصة لا قيمها، ولا تلمس قيمة أي مفتاح مضبوط:
 * شاشة إعدادات تعرض جزءاً من مفتاح سرّي تسرّبه في أول لقطة شاشة تُرسل للدعم.
 * (تُستدعى في الخادم؛ متغيرات البيئة السرّية غير مرئية للمتصفح أصلاً.)
 */
export type ProviderReadiness = {
  provider: PaymentProvider;
  ready: boolean;
  missingEnv: string[];
  missingPublic: string[];
};

export function providerReadiness(
  provider: PaymentProvider,
  publicConfig: Record<string, string> = {}
): ProviderReadiness {
  const spec = credentialSpec(provider);
  const missing = missingEnv(spec.envKeys);
  const missingPublic = spec.publicKeys.filter((key) => (publicConfig[key] ?? "").trim() === "");

  return {
    provider,
    ready: missing.length === 0 && missingPublic.length === 0,
    missingEnv: missing,
    missingPublic,
  };
}
