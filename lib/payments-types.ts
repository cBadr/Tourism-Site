/**
 * عقد بوابات الدفع الإلكترونية (المرحلة ٩) — المرجع الأوحد.
 *
 * ── الواقع الذي يحكم التصميم ───────────────────────────────────────────────
 * لا حساب بوابة واحداً جاهزاً اليوم، وبعض المزوّدين (Stripe و2Checkout) قد لا
 * يقبلون فرداً في مصر أصلاً. فالبناء على «سنجرّب لما نفتح حساباً» يعني مرحلة
 * لا تُختبر إطلاقاً. لذلك:
 *
 *   • مزوّد `test` مدمج يعمل بلا أي بيانات اعتماد ويُنتج نفس أحداث المزوّد
 *     الحقيقي (بدء دفعة، إعادة توجيه، webhook موقّع، تأكيد) — فتُختبر السلسلة
 *     كاملة اليوم: دفع ← تأكيد ← قيد في الدفتر ← بدء البث.
 *   • كل مزوّد حقيقي محوّل (adapter) خامل حتى تُدخَل مفاتيحه من اللوحة.
 *   • المفاتيح السرّية في متغيرات البيئة لا في قاعدة البيانات؛ واللوحة تحمل
 *     التفعيل والترتيب والمعرّفات العامة فقط.
 *
 * ── قواعد لا تُخرق ────────────────────────────────────────────────────────
 * (١) **المبلغ لا يُؤخذ من المتصفح أبداً** — يُقرأ من الحجز في الخادم، تماماً
 *     كقاعدة المرحلة ٤ في `create_booking`.
 * (٢) **الـ webhook هو مصدر الحقيقة** لا صفحة العودة: العميل قد يغلق المتصفح
 *     قبل الرجوع، وقد يزوّر رابط النجاح. التأكيد يقع بالـ webhook وحده.
 * (٣) **تحقق التوقيع إلزامي** لكل مزوّد، ورفض التوقيع يعني ٤٠٠ بلا أي أثر.
 * (٤) **الإحكام (idempotency)**: المزوّد يعيد إرسال الحدث مراراً؛ الحدث يُسجَّل
 *     بمعرّفه ويُتجاهل تكراره — وإلا تضاعف التحصيل في الدفتر.
 */

/** المزوّدون المدعومون — الترتيب هو ترتيب الإطلاق في خارطة الطريق */
export type PaymentProvider =
  | "test" // مزوّد اختباري بلا اعتمادات — للتحقق والتجربة
  | "paymob" // بطاقات محلية (مصر) — الأقرب واقعياً
  | "stripe"
  | "paypal"
  | "twocheckout"
  | "binancepay"
  | "nowpayments";

/** حالة جلسة الدفع لدى المزوّد */
export type PaymentIntentStatus =
  | "created" // أُنشئت وبانتظار توجيه العميل
  | "pending" // العميل عند المزوّد
  | "succeeded" // تأكيد موقّع وصل
  | "failed"
  | "cancelled"
  | "expired";

/** صف جلسة دفع — جدول `payment_intents` */
export type PaymentIntentRow = {
  id: string;
  bookingId: string;
  provider: PaymentProvider;
  /** معرّف الجلسة لدى المزوّد (order id / session id) */
  providerRef: string | null;
  /** المبلغ بالقرش/السنت — أعداد صحيحة تفادياً لانحراف الكسور */
  amountMinor: number;
  currency: string;
  status: PaymentIntentStatus;
  /** رابط صفحة الدفع لدى المزوّد */
  redirectUrl: string | null;
  failureReason: string | null;
  createdAt: string;
  completedAt: string | null;
};

/** حدث webhook مستلَم — جدول `payment_events` (للإحكام والتدقيق) */
export type PaymentEventRow = {
  id: string;
  provider: PaymentProvider;
  /** معرّف الحدث لدى المزوّد — فريد لكل (provider, event_id) */
  eventId: string;
  intentId: string | null;
  eventType: string;
  signatureValid: boolean;
  payload: Record<string, unknown>;
  processedAt: string | null;
  createdAt: string;
};

/** إعدادات مزوّد كما تُدار من اللوحة — لا أسرار هنا */
export type ProviderSettings = {
  provider: PaymentProvider;
  enabled: boolean;
  /** ترتيب الظهور في صفحة الدفع */
  sort: number;
  /** اسم يظهر للعميل (يُترجَم عبر مساحة `payment`) */
  label: string;
  /** وضع الاختبار لدى المزوّد نفسه (sandbox) */
  sandbox: boolean;
  /** معرّفات عامة غير سرّية: رقم التاجر، معرّف الإطار، إلخ */
  publicConfig: Record<string, string>;
};

/** ما يحتاجه كل مزوّد من متغيرات بيئة — تُعرض في شاشة الإعدادات كقائمة تحقق */
export type ProviderCredentialSpec = {
  provider: PaymentProvider;
  /** أسماء متغيرات البيئة السرّية المطلوبة */
  envKeys: string[];
  /** ما يجب أن يُدخل من اللوحة */
  publicKeys: string[];
  /** ملاحظة تعاقدية صريحة (سجل تجاري، إتاحة جغرافية...) */
  note: string;
};

/** نتيجة بدء الدفع — تُعاد إلى المتصفح */
export type StartPaymentResponse =
  | { ok: true; intentId: string; redirectUrl: string }
  | { ok: false; code: string; message: string };

/**
 * واجهة المحوِّل — كل مزوّد يحققها، ولا شيء خارجها يعرف تفاصيله.
 *
 *   createIntent  : ينشئ جلسة لدى المزوّد ويعيد رابط الدفع ومعرّفه.
 *   verifySignature: يتحقق من توقيع الـ webhook من الجسم الخام والترويسات.
 *   parseEvent    : يحوّل جسم الـ webhook إلى حدث موحّد.
 */
export type NormalizedEvent = {
  eventId: string;
  eventType: string;
  providerRef: string | null;
  status: PaymentIntentStatus;
  amountMinor: number | null;
  currency: string | null;
  failureReason: string | null;
};

export type PaymentAdapter = {
  provider: PaymentProvider;
  createIntent(input: {
    bookingId: string;
    reference: string;
    amountMinor: number;
    currency: string;
    returnUrl: string;
    webhookUrl: string;
    settings: ProviderSettings;
  }): Promise<{ providerRef: string; redirectUrl: string }>;
  verifySignature(input: {
    rawBody: string;
    headers: Record<string, string>;
    settings: ProviderSettings;
  }): boolean;
  parseEvent(input: { rawBody: string; headers: Record<string, string> }): NormalizedEvent | null;
};

/** تواقيع Postgres (هجرة 0020) */
export type PaymentSqlContract = {
  /** create_payment_intent(p_booking uuid, p_provider text, p_amount_minor int, p_currency text) */
  createPaymentIntent: never;
  /** attach_intent_ref(p_intent uuid, p_ref text, p_redirect text) */
  attachIntentRef: never;
  /**
   * settle_payment_intent(p_provider text, p_event_id text, p_ref text,
   *                       p_status text, p_amount_minor int, p_payload jsonb)
   * محكمة التكرار: تُسجّل الحدث، وعند النجاح تُنشئ صف `payments` معتمداً
   * (فيقيَّد في الدفتر بمشغّل المرحلة ٧) وتنقل الحجز إلى «مؤكد».
   */
  settlePaymentIntent: never;
};

export const DEFAULT_PROVIDERS: ProviderSettings[] = [
  // معطَّلة عمداً: أداة تحقق لا وسيلة تحصيل. تفعيلها من اللوحة **وحده** لا يكفي —
  // يلزم كذلك ALLOW_TEST_PAYMENTS=1 في البيئة (متغيّر لا يُضبط في الإنتاج أبداً).
  { provider: "test", enabled: false, sort: 0, label: "بطاقة تجريبية (اختبار)", sandbox: true, publicConfig: {} },
  { provider: "paymob", enabled: false, sort: 1, label: "بطاقة بنكية", sandbox: true, publicConfig: {} },
  { provider: "stripe", enabled: false, sort: 2, label: "Stripe", sandbox: true, publicConfig: {} },
  { provider: "paypal", enabled: false, sort: 3, label: "PayPal", sandbox: true, publicConfig: {} },
  { provider: "twocheckout", enabled: false, sort: 4, label: "2Checkout", sandbox: true, publicConfig: {} },
  { provider: "binancepay", enabled: false, sort: 5, label: "Binance Pay", sandbox: true, publicConfig: {} },
  { provider: "nowpayments", enabled: false, sort: 6, label: "NOWPayments", sandbox: true, publicConfig: {} },
];
