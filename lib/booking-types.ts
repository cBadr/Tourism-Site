/**
 * عقد الحجز والدفع (المرحلة ٤) — المرجع الأوحد لأنواع الحجز وتواقيع دواله.
 *
 * مبدأ أمني حاكم: **السعر لا يُؤخذ من العميل أبداً.** الواجهة ترسل مدخلات
 * الرحلة (نقطتان، ركاب، ذهاب وعودة، ساعات انتظار، الفئة المختارة) ودالة
 * `create_booking` في Postgres تعيد حساب السعر بنفسها عبر `quote_price`
 * وتخزّن اللقطة كاملة. أي سعر يصل من المتصفح يُتجاهَل.
 */

// النوع الوحيد المستورد هنا: حمولة الطاقم التي يراها العميل. تعيش في عقد
// الدفعة ٥ لأن مالكها ذلك المجال، وتُستعمل هنا لأن ناقلها عمودٌ في
// `get_booking_by_token` (انظر قسم «طاقم الرحلة» أسفل الملف).
import type { CustomerCrewView } from "@/lib/crew-types";

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
 *
 * المرحلة ١٢أ — الخصومات: تُوسَّع الدالة في هجرة 0024 بمعامل **اختياري**
 * `p_coupon_code text` (العقد: `lib/discount-types.ts`). و`total` المُرجَع يصير
 * الإجمالي **بعد** الخصم — وهو ما يجعل تقارير الهامش تصح بلا قيد دفتر جديد
 * (القاعدة ٥ في عقد الخصومات). أعمدة الإرجاع السبعة لم تتغير أسماؤها ولا عددها،
 * فلا مستهلك قائم يحتاج تعديلاً.
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
  /**
   * رمز الكوبون — **الرمز وحده، ولا مبلغ خصم أبداً** (المرحلة ١٢أ).
   * نفس مبدأ «لا سعر من العميل»: قيمة الخصم تُحسب داخل `create_booking` عبر
   * `apply_discount` وتُجمَّد في لقطة الحجز. ما يعرضه المتصفح معاينة لا التزام.
   */
  couponCode?: string | null;
  /**
   * «استخدم رصيد نقاطي» — **رايةٌ منطقية، ولا عدد نقاط ولا مبلغ** (المرحلة ١٢ب).
   *
   * تقف بجوار `couponCode` لأنها من صنفها بالضبط: كلتاهما تقول للقاعدة **ماذا
   * تفعل** ولا تقول لها **بكم**. والقيمة تُحسب في `redeem_points` داخل معاملة
   * `create_booking` وتُجمَّد في اللقطة، فما يعرضه المتصفح معاينة لا التزام.
   *
   * 🔒 **ولا معرّف حساب معها.** صاحب الرصيد يُشتقّ من جلسة الطلب على الخادم
   * (‏`auth.getUser()` في `/api/booking`)؛ ولو قُبل معرّفٌ من المتصفح لصار
   * إنفاقُ رصيد أي حسابٍ نداءً واحداً — وهي أوضح ثغرة يمكن أن تُفتح هنا.
   */
  redeemPoints?: boolean;
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
  /**
   * invalid-input | class-unavailable | coupon-rejected | pricing-failed | db-unavailable
   *
   * `coupon-rejected` (٤٠٩، المرحلة ١٢أ): رمزٌ أُرسل ولم تقبله القاعدة لحظة
   * الحجز. الواجهة تُسقط الكوبون عند رؤيته وإلا أُعيد إرساله فأخفقت كل محاولة.
   */
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

/* ══════════════════════════════════════════════════════════════════════════
 * الدفعة ٢ من ملاحظات المراجعة — هجرة `0027_batch_two.sql`
 * (ملحق ٢ في docs/VISION.md: الملاحظات ٣ و٢ و١)
 * ══════════════════════════════════════════════════════════════════════════ */

/**
 * إعدادات الرحلات — صف وحيد في جدول `trip_settings` (الملاحظة ٣).
 *
 * **لماذا جدول مستقل ولا مفتاح في `site_settings`:** ذاك الجدول مقروء علناً
 * بسياسة `site_settings_select_public` (‏`using (true)` لـ anon)، وسياسة تشغيلية
 * مثل «متى نلغي الطلب غير المدفوع» لا تُعرض على الزائر. نفس سابقة
 * `discount_settings` (‏`lib/discounts/settings.ts`) و`dispatch_settings`.
 *
 * **الافتراضي الآمن:** الكنس **مطفأ** بالبذرة. ميزة تلغي حجوزات حقيقية بلا تدخل
 * بشري لا تُشحن مفعّلة (نمط الفشل ٧ في handover/LESSONS.md — بوابة الاختبار
 * بُذرت مفعّلة مرة). يفعّلها المالك بعد أن يحدد المهلة التي تناسب تشغيله.
 */
export type TripSettings = {
  /** تفعيل الإلغاء التلقائي للطلبات غير المدفوعة */
  unpaidCancelEnabled: boolean;
  /** المهلة بالدقائق من إنشاء الحجز حتى الإلغاء التلقائي */
  unpaidTimeoutMinutes: number;
};

export const DEFAULT_TRIP_SETTINGS: TripSettings = {
  unpaidCancelEnabled: false,
  unpaidTimeoutMinutes: 1440, // ٢٤ ساعة — قيمة مقترحة لا نافذة حتى يُفعَّل المفتاح
};

/** حالة إيصال التحويل */
export type ReceiptStatus = "pending" | "approved" | "rejected";

/**
 * صف تحصيل في `payments` — عمودان جديدان في 0027 (الملاحظة ٢).
 *
 * **`visibleToCustomer` يُفرَض داخل `get_booking_by_token` بإسقاط الصف من مصفوفة
 * `payments` في الحمولة نفسها — لا في طبقة العرض.** حامل التوكن يقرأ الحمولة
 * الخام من PostgREST، فإخفاءٌ في JSX ليس إخفاءً. والحجب **يسقط الصف كاملاً** لا
 * يخفي حقلاً منه، لأن `note` يحمل ملاحظة المشرف التشغيلية.
 *
 * **الحجب لا يمسّ المحاسبة:** الإيصال المخفي المعتمَد يقيَّد في الدفتر ويستهلك
 * حد حساب الاستقبال كأي إيصال — الرؤية شأن العميل، والمال شأن الخزينة.
 */
export type PaymentReceiptRow = {
  id: string;
  bookingId: string;
  accountId: string | null;
  amount: number;
  status: ReceiptStatus;
  receiptPath: string | null;
  note: string | null;
  /** يظهر للعميل في `/booking/[token]`؟ — الافتراضي true فلا يتغير سلوك الصفوف القائمة */
  visibleToCustomer: boolean;
  /** رفعه فريق التشغيل نيابة عن العميل (وصله على واتساب أو هاتفياً) لا العميل بنفسه */
  uploadedByAdmin: boolean;
  verifiedAt: string | null;
  createdAt: string;
};

/**
 * رموز خطأ نموذج «تابع حجزك» (الملاحظة ١) — كل رمز رسالة عربية مستقلة.
 * `rate-limited` ليس تجميلاً: `TR-XXXXXX` فضاؤه ٣١⁶ ≈ ٢٩٫٧ بت وقابل للتعداد،
 * بخلاف التوكن (١٩٢ بت). الحدّ هو ما يمنع المسح، لا سرّية المرجع.
 */
export type BookingLookupErrorCode =
  | "invalid-input" // مرجع أو هاتف بصيغة غير مقبولة
  | "not-found" // لا حجز يطابق الاثنين معاً
  | "rate-limited" // تجاوز حدّ المحاولات
  | "db-unavailable";

/**
 * تواقيع Postgres التي تضيفها هجرة 0027:
 *
 *   trip_config()
 *     → table(unpaid_cancel_enabled boolean, unpaid_timeout_minutes integer)
 *     قارئ متسامح على نمط `dispatch_config()`: يرجع صفاً واحداً حتى لو الجدول فارغ.
 *
 *   cancel_stale_bookings(p_limit integer default 200)
 *     → table(scanned integer, cancelled integer, failed integer)
 *     الكنس الدوري. حارسه `dispatch_ops_allowed()` لا `is_admin()` — لأن
 *     `set_booking_status` ممنوحة للمشرف وحده ولا تصلح لدورة تعمل بمفتاح الخدمة.
 *     يستثني: الحجوزات التي لها جلسة بوابة حيّة (`payment_intents` في
 *     `created|pending` أحدث من المهلة) حتى لا يُلغى حجز والمال في الطريق.
 *     و`failed` ليس زينة: كل صف داخل كتلة استثناء مستقلة، فصفٌّ واحد سام لا
 *     يُسقط الدورة كلها ولا يبقى العطب صامتاً — يظهر عدده في رد المسار وفي
 *     شاشة الإعدادات، ومعه `raise warning` في سجل الخادم.
 *
 *   admin_attach_receipt(p_booking_id uuid, p_amount numeric, p_receipt_path text,
 *                        p_note text, p_visible boolean)
 *     → uuid (معرّف صف التحصيل)
 *     رفع الأدمن للإيصال. يقبل الحجز في `pending_payment` أو `under_review` فقط،
 *     ويرفض بوجود إيصال `pending` آخر (‏`verify_payment` تعالج الأحدث وحده فيبقى
 *     السابق معلّقاً للأبد). ينقل الحجز إلى `under_review` ويُطفئ إشعار
 *     «رفع إيصال» الوسيط كما يفعل مسار البوابة في 0020.
 *
 *   set_receipt_visibility(p_payment_id uuid, p_visible boolean) → boolean
 *
 *   find_booking_by_reference(p_reference text, p_phone text, p_client_key text)
 *     → table(public_token text)   — **صفر صفوف = لا نتيجة**، لا استثناء
 *     البحث بمرجع + هاتف. `security definer` تستدعي `normalize_phone` **داخلها**
 *     — ولا تُمنح `normalize_phone` لـ `anon` بحال (فحص في 0026 يُسقط الهجرة
 *     والاختبار معاً). و`p_client_key` بصمة مجهولة للعميل تحسبها طبقة الخادم،
 *     ولا يصل عنوان IP إلى القاعدة أبداً.
 *
 *     **قاعدتان في هذه الدالة تحملان الميزة كلها، ونقضُ أيٍّ منهما يُبطل الخانق:**
 *     (أ) مسار «لا نتيجة» يرجع **صفر صفوف ولا يرمي**. كل نداء PostgREST معاملة
 *         واحدة، فالاستثناء يُرجعها ومعها صفُّ العدّاد المكتوب لتوّه ⇒ المحاولة
 *         الفاشلة لا تُحسب، فيبقى التعداد بلا خانق ويُقفَل الباب على العميل
 *         الشرعي وحده. لذلك تترجم طبقة الخادم **الفراغ** إلى `not-found`.
 *     (ب) الدالة **غير ممنوحة لـ `anon` ولا `authenticated`** — تُنادى من إجراء
 *         الخادم بمفتاح الخدمة وحده. ولو مُنحت للزائر لاختار بصمة جديدة كل طلب
 *         فصار لكل محاولة دلوٌ عدّاده ١ ولا يبلغ الحدّ أبداً.
 */

/* ══════════════════════════════════════════════════════════════════════════
 * الدفعة ٥ — طاقم الرحلة في حمولة التوكن
 * (هجرة `0040_trip_crew.sql`، مصلَّحةً بـ`0043_trip_crew_hardening.sql`)
 * (ملحق ٢ في docs/VISION.md، الملاحظة ٥ — الشقّ الأول)
 *
 * العقد الحاكم للمجال كله `lib/crew-types.ts` ويُقرأ قبل هذا القسم.
 * ══════════════════════════════════════════════════════════════════════════ */

/**
 * عمود `crew jsonb` — **العمود الثامن عشر** في نوع إرجاع `get_booking_by_token`.
 *
 * ── لماذا اسمٌ هنا وليس نوعاً ثانياً؟ ──────────────────────────────────────
 *
 * كان هذا نوعاً مستقلاً يصف «ما تُخرجه الدالة الحيّة» بخلاف «ما اتُّفق عليه»
 * في `CustomerCrewView`، وكان الفرق بينهما حقيقياً: 0040 كانت تُخرج `byAdmin`
 * و`assignedAt` إلى `anon` وليسا في العقد. **و0043 أزالت الفرق من المصدر** —
 * حذفت الحقلين من `jsonb_build_object` نفسها — فلم يبقَ بين الشكلين حرف.
 *
 * ونسختان متطابقتان تُكتبان باليد تنحرفان بصمت (النمط ٨ في `handover/LESSONS.md`)،
 * فصار هذا **اسماً للعقد لا نسخةً منه**: أي توسعة مستقبلية (حقل صورة يوم يُشحن
 * الدلو الخاص) تُكتب في `lib/crew-types.ts` وحده فتصل هنا، ولا يمكن أن يقرأ
 * أحدُ الملفين ما لا يقرؤه الآخر.
 *
 * 🔒 **وما حُذف من الحمولة لا يُعاد قراءته من الواجهة.** `byAdmin` علمٌ تشغيلي
 * يخبر العميل أن جهةً غير كاتب الصفحة أملت البيانات — أي إشارةٌ إلى منفّذٍ ثالث
 * في منتج white-label. وكانت الصفحة «لا تعرضه رغم وصوله»، وهو حجبٌ في العرض
 * ترفضه قاعدة هذا المجال: **ما لا يجب أن يصل لا يخرج من الدالة أصلاً**.
 *
 * 🔒 **و`driverPhone` يصل `null` خارج نافذته لأن القاعدة حجبته، لا لأن الواجهة
 * أخفته.** المقارنة تقع داخل `get_booking_by_token` نفسها، والدالة ممنوحة
 * لـ`anon` وتُنادى مباشرةً من PostgREST — فحاجبٌ في JSX كان يُتخطّى بنداء واحد
 * (نفس درس إيصالات الأدمن في الدفعة ٢).
 *
 * ⚠ **والنافذة بطرفين منذ 0043:** تُفتح قبل الالتقاء بمهلة اللوحة و**تُغلق بعده
 * باثنتي عشرة ساعة**. فـ`phoneVisibleAt` **ليس وعداً بالظهور**: إن كان في
 * الماضي والهاتف `null` فالنافذة **انقضت** ولن يعود الرقم — والصفحة التي تقول
 * «سيظهر قبل الموعد» في هذه الحال تَعِد بما لا تفعله القاعدة. (وهو `null` وحده
 * حين تخلو لقطة الرحلة من `pickupAt` فلا نافذة تُحسب أصلاً.)
 *
 * والكائن كله `null` في ثلاث حالات تُقرأ واحدة على الشاشة — **غياب البطاقة**:
 * لا مركبة ولا سائق مسجَّلان، أو الإسناد عاد إلى الطابور (‏`dispatches.status`
 * ليست `assigned`)، أو الحجز ملغى (‏`bookings.status` خارج `assigned`
 * و`completed`). القاعدة لا تُخرج غلافاً فارغاً، فلا تُصيَّر بطاقةٌ تَعِد
 * ببيانات لا وجود لها.
 */
export type BookingTokenCrew = CustomerCrewView;

/** حالة إشعار في طابور الإرسال */
export type NotificationChannel = "dashboard" | "telegram" | "email";

export type NotificationEvent =
  | "booking_created"
  | "receipt_uploaded"
  | "booking_confirmed"
  | "booking_cancelled"
  | "quote_requested";
