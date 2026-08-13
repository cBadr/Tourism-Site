/**
 * عقد الحجز والدفع (المرحلة ٤) — المرجع الأوحد لأنواع الحجز وتواقيع دواله.
 *
 * مبدأ أمني حاكم: **السعر لا يُؤخذ من العميل أبداً.** الواجهة ترسل مدخلات
 * الرحلة (نقطتان، ركاب، ذهاب وعودة، ساعات انتظار، الفئة المختارة) ودالة
 * `create_booking` في Postgres تعيد حساب السعر بنفسها عبر `quote_price`
 * وتخزّن اللقطة كاملة. أي سعر يصل من المتصفح يُتجاهَل.
 */

/** دورة حياة الحجز — الانتقالات محروسة في SQL */
export type BookingStatus =
  | "pending_payment" // أُنشئ وبانتظار تحويل العميل
  | "under_review" // رُفع الإيصال وبانتظار تحقق التشغيل
  | "confirmed" // تحقق التشغيل من التحويل
  | "assigned" // أُسند لمتعهد (المرحلة ٦)
  | "completed" // نُفذت الرحلة
  | "cancelled"; // أُلغي في أي مرحلة

/** ما الذي يدفعه العميل الآن */
export type PaymentPlan = "full" | "deposit";

/** وسيلة التحويل المحلية */
export type PaymentMethodKind = "wallet" | "instapay";

/** حساب استقبال مدفوعات — يُدار من اللوحة بحدوده وأرصدته */
export type PaymentAccountRow = {
  id: string;
  kind: PaymentMethodKind;
  /** الاسم الظاهر للعميل — مثال «فودافون كاش» */
  label: string;
  /** رقم المحفظة أو عنوان انستا باي */
  handle: string;
  holderName: string | null;
  openingBalance: number;
  dailyCap: number | null;
  monthlyCap: number | null;
  active: boolean;
  sort: number;
};

/** حساب مُتاح للعرض على العميل بعد فحص الحدود */
export type AvailablePaymentAccount = {
  id: string;
  kind: PaymentMethodKind;
  label: string;
  handle: string;
  holderName: string | null;
  /** المتبقي اليوم/الشهر — null = بلا حد */
  dailyHeadroom: number | null;
  monthlyHeadroom: number | null;
};

/** لقطة الرحلة المخزنة مع الحجز — لا تتغير بتغير التعريفات لاحقاً */
export type TripSnapshot = {
  originLabel: string;
  originLat: number;
  originLng: number;
  destLabel: string;
  destLat: number;
  destLng: number;
  distanceKm: number;
  durationMin: number | null;
  distanceSource: string;
  passengers: number;
  roundTrip: boolean;
  waitingHours: number;
  pickupAt: string | null; // ISO — موعد الانطلاق
  notes: string | null;
};

export type BookingRow = {
  id: string;
  /** رقم مرجعي قصير للعميل — مثال TR-8F3K2Q */
  reference: string;
  /** توكن رابط المتابعة العام /booking/[token] — بلا حساب */
  publicToken: string;
  status: BookingStatus;
  classSlug: string;
  classTitle: string;
  total: number;
  currency: string;
  plan: PaymentPlan;
  /** المطلوب تحويله الآن (كامل المبلغ أو العربون) */
  amountDue: number;
  /** المتبقي تحصيله مع السائق */
  amountRemaining: number;
  customerName: string;
  customerPhone: string;
  customerWhatsapp: string | null;
  trip: TripSnapshot;
  createdAt: string;
};

/**
 * توقيع دالة الإنشاء في Postgres (هجرة 0007) — تُستدعى من /api/booking:
 *   create_booking(p_origin jsonb, p_destination jsonb, p_passengers int,
 *                  p_round_trip boolean, p_waiting_hours numeric,
 *                  p_distance_km numeric, p_duration_min numeric,
 *                  p_distance_source text, p_class_slug text,
 *                  p_plan text, p_customer_name text, p_customer_phone text,
 *                  p_customer_whatsapp text, p_pickup_at timestamptz, p_notes text)
 *   returns table(id uuid, reference text, public_token text, total numeric,
 *                 amount_due numeric, amount_remaining numeric, currency text)
 */
export type CreateBookingRequest = {
  origin: { label: string; lat: number; lng: number };
  destination: { label: string; lat: number; lng: number };
  passengers: number;
  roundTrip: boolean;
  waitingHours: number;
  classSlug: string;
  plan: PaymentPlan;
  customerName: string;
  customerPhone: string;
  customerWhatsapp?: string | null;
  pickupAt?: string | null;
  notes?: string | null;
};

export type CreateBookingResponse = {
  ok: true;
  reference: string;
  publicToken: string;
  total: number;
  amountDue: number;
  amountRemaining: number;
  currency: string;
};

export type BookingError = {
  ok: false;
  /** invalid-input | class-unavailable | pricing-failed | db-unavailable */
  code: string;
  message: string;
};

/** طلب عرض سعر — للجولات والمناسبات وما هو خارج التسعير الفوري */
export type QuoteRequestRow = {
  id: string;
  reference: string;
  serviceSlug: string | null;
  customerName: string;
  customerPhone: string;
  details: string;
  status: "new" | "contacted" | "converted" | "closed";
  createdAt: string;
};

/** إعدادات الدفع — ضمن site_settings بمفتاح "payment" */
export type PaymentSettings = {
  /** نسبة العربون المئوية من الإجمالي */
  depositPercent: number;
  /** حد أدنى للعربون بالجنيه */
  depositMinAmount: number;
  /** تعليمات تظهر للعميل في صفحة التحويل */
  transferInstructions: string;
};

export const DEFAULT_PAYMENT_SETTINGS: PaymentSettings = {
  depositPercent: 30,
  depositMinAmount: 200,
  transferInstructions:
    "حوّل المبلغ على أحد الحسابات المعروضة، ثم ارفع صورة إيصال التحويل. يراجع فريقنا التحويل ويؤكد حجزك خلال دقائق.",
};

/** حالة إشعار في طابور الإرسال */
export type NotificationChannel = "dashboard" | "telegram" | "email";

export type NotificationEvent =
  | "booking_created"
  | "receipt_uploaded"
  | "booking_confirmed"
  | "booking_cancelled"
  | "quote_requested";
