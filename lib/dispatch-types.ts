/**
 * عقد البث والإسناد (المرحلة ٦) — المرجع الأوحد.
 *
 * من VISION.md (قسم المتعهدين + ملحق ٢):
 *   «يقوم الموقع بإشعار المتعهدين المناسبين فور وصول الطلب، على أن يقوم المتعهد
 *    بفحص الطلب ثم الموافقة عليه أو رفضه أو تجاهله في إطار زمني معين، مع مراعاة
 *    أن يُسند الطلب إلى المتعهد الذي قام بقبوله ومنع الآخرين من التفاعل معه.»
 *   والمهلة وعدد إعادات البث يُضبطان من الإعدادات، وبعد استنفادهما يتحول الطلب
 *   إلى فريق التشغيل يدوياً.
 *
 * ── قراران يحميان الهامش والخصوصية ─────────────────────────────────────────
 *
 * (١) الموجات: سعر العميل حُسب من **أرخص** متعهد مغطٍّ. لو قبل الطلبَ متعهد
 *     أغلى، تآكل الهامش أو انقلب خسارة. لذلك البث على موجات بسقف تكلفة يتسع:
 *       الموجة ١ — من تكلفته ≤ التكلفة المُسعَّر بها (الهامش كامل)
 *       الموجة ٢ — من تكلفته ≤ التكلفة + الهامش (لا ربح ولا خسارة)
 *       الموجة ٣ — طابور التشغيل اليدوي (قرار بشري بالتعويض أو التسعير)
 *     عدد الموجات ومهلة كل موجة من الإعدادات.
 *
 * (٢) خصوصية العميل: المتعهد **قبل القبول** يرى الرحلة ومستحقه فقط — لا اسم
 *     العميل ولا رقمه ولا العنوان الدقيق. بعد الإسناد يرى بيانات التواصل
 *     اللازمة للتنفيذ. هذا صون لبيانات العميل ولحاجز الـ white-label معاً.
 */

/** حالة عرض الرحلة على متعهد بعينه */
export type TripOfferStatus =
  | "pending" // بُث وينتظر رده داخل المهلة
  | "accepted" // قبله — وهو الفائز
  | "rejected" // رفضه صراحةً
  | "expired" // انتهت المهلة بلا رد (تجاهل)
  | "revoked"; // أُغلق لأن غيره قبل الطلب أو أُسند يدوياً

/** حالة دورة البث للحجز ككل */
export type DispatchStatus =
  | "queued" // مؤهل للبث ولم يبدأ بعد
  | "broadcasting" // موجة جارية بانتظار الردود
  | "assigned" // فاز متعهد وأُغلق الطلب
  | "manual" // استُنفدت الموجات ⇒ طابور التشغيل اليدوي
  | "cancelled"; // أُلغي الحجز فتوقف البث

export type TripOfferRow = {
  id: string;
  bookingId: string;
  subcontractorId: string;
  /** رقم الموجة التي بُث فيها هذا العرض (١ فأعلى) */
  round: number;
  /** مستحق المتعهد من قائمة أسعاره هو — لا سعر العميل */
  payout: number;
  status: TripOfferStatus;
  /** لحظة انتهاء المهلة — بعدها يصير expired بفعل المهمة المجدولة */
  expiresAt: string;
  respondedAt: string | null;
  /** سبب الرفض الاختياري — يفيد تقييم المتعهدين لاحقاً */
  reason: string | null;
  createdAt: string;
};

export type DispatchRow = {
  bookingId: string;
  status: DispatchStatus;
  round: number;
  /** المتعهد الفائز بعد الإسناد */
  assignedSubcontractorId: string | null;
  assignedAt: string | null;
  /** مستحق المتعهد الفائز فعلياً (قد يفوق التكلفة المُسعَّر بها في الموجة ٢) */
  assignedPayout: number | null;
  /** أُسند يدوياً من فريق التشغيل لا بقبول تلقائي */
  manualAssign: boolean;
  lastBroadcastAt: string | null;
  createdAt: string;
};

/** ما يراه المتعهد **قبل** القبول — بلا أي بيانات تعريف للعميل */
export type OfferPreview = {
  offerId: string;
  /**
   * **رمز المتعهد لا مرجع العميل** (هجرة 0028 — `partner_trip_code`).
   *
   * كان هذا الحقل يحمل `TR-XXXXXX` حرفياً، فأنتجت الدفعة ٢ ثغرة حرجة: صفحة
   * «تابع حجزك» تقبل **مرجع + هاتف** وتُرجع توكن الحجز، والمتعهد يرى الهاتف
   * بعد الإسناد بحكم التنفيذ (‏`portal_trips`) — فاجتمع لديه العاملان، ومن
   * التوكن يقرأ `get_booking_by_token` فيرى **سعر العميل**، وسعرُ العميل ناقص
   * مستحقه هو **الهامش** الذي بُنيت ثلاث هجرات لحجبه عنه.
   *
   * فصار ما يصله رمزاً مشتقاً من معرّف الحجز (`#A1B2C3D4`): ثابتٌ يتخاطب به مع
   * التشغيل، ولا يُقبل في نموذج المتابعة أصلاً. والتشغيل يرى الرمز نفسه في شاشة
   * الطلب فيبقى الطرفان على أرض واحدة.
   */
  reference: string;
  originLabel: string;
  destLabel: string;
  distanceKm: number;
  passengers: number;
  roundTrip: boolean;
  waitingHours: number;
  classTitle: string;
  pickupAt: string | null;
  payout: number;
  currency: string;
  expiresAt: string;
  notes: string | null;
};

/** ما يُضاف بعد الإسناد — بيانات التنفيذ */
export type AssignedTripDetails = OfferPreview & {
  customerName: string;
  customerPhone: string;
  customerWhatsapp: string | null;
};

/** إعدادات البث — صف وحيد في `dispatch_settings` */
export type DispatchSettings = {
  /** مهلة الموجة الواحدة بالدقائق */
  windowMinutes: number;
  /** أقصى عدد موجات قبل التحويل اليدوي (٢ = موجة الهامش الكامل ثم موجة التعادل) */
  maxRounds: number;
  /** يبدأ البث تلقائياً فور تأكيد الدفع */
  autoStart: boolean;
  /** أقل هامش مقبول بالجنيه في الموجة الأخيرة قبل التحويل اليدوي */
  minMarginAmount: number;
};

export const DEFAULT_DISPATCH: DispatchSettings = {
  windowMinutes: 30,
  maxRounds: 2,
  autoStart: true,
  minMarginAmount: 0,
};

/** أحداث الإشعارات التي تضيفها هذه المرحلة */
export type DispatchNotificationEvent =
  | "trip_offered" // وصل عرض لمتعهد
  | "trip_assigned" // فاز متعهد وأُغلق الطلب
  | "dispatch_round_expired" // انتهت موجة بلا قبول
  | "dispatch_exhausted"; // استُنفدت الموجات ⇒ تصعيد لفريق التشغيل

/**
 * تواقيع دوال Postgres (هجرة 0013):
 *   start_dispatch(p_booking_id uuid)            — يبدأ الموجة ١ (أو يعيد البث)
 *   accept_offer(p_offer_id uuid)                — القبول الذرّي: أول قابل يفوز
 *   reject_offer(p_offer_id uuid, p_reason text) — رفض صريح
 *   dispatch_tick()                              — تنتهي المهل، تُبث الموجة التالية أو يُصعَّد
 *   manual_assign(p_booking_id uuid, p_subcontractor_id uuid, p_payout numeric, p_note text)
 *   portal_offers()                              — عروض المتعهد الحالي (OfferPreview)
 *   portal_trips()                               — رحلاته المُسندة (AssignedTripDetails)
 *
 * ── سقف ديون المتعهدين (الدفعة ٢، هجرة 0027) ────────────────────────────────
 * متعهدٌ بلغ سقف دينه لنا لا يستقبل عرضاً ولا يفوز بقبول. العقد الكامل للسقف
 * في `lib/finance-types.ts` (‏`PartnerCreditSettings`)، وأثره هنا في ثلاثة مواضع:
 *
 *   (١) `dispatch_broadcast` — يُستبعد من الإدراج فلا يصله عرض أصلاً.
 *   (٢) `trip_offers_guard_accept` (مُشغّل الجدول) — **الحاجز الحقيقي**: يغطي
 *       `accept_offer` و`manual_assign` ومحرر SQL وأي كاتب مستقبلي، تماماً كما
 *       يغطي قاعدة «لا يفوز متعهد غير معتمد». التجاوز البشري الصريح عبر
 *       `manual_assign_over_limit(...)` التي تضبط `tours.allow_partner_debt`
 *       — نفس نمط `manual_assign_with_loss` وليست بديلاً عنها (كلٌّ يرفع حارساً
 *       مختلفاً؛ من احتاج الاثنين معاً يرفع الأرضية أو يسدّد الدين أولاً).
 *   (٣) `portal_offers()` — يُخفي العرض القديم الذي بُث قبل بلوغ السقف، فلا يبقى
 *       زرٌّ يفشل دائماً (نمط الفشل ٣: طريق مسدود).
 *
 * ولا يُذكر للمتعهد رقمٌ في رسالة الرفض: `hint = 'debt-limit'` بلا مبلغ — البورتال
 * لا يعرض له رصيداً اليوم أصلاً، والرفض ليس مكاناً لكشفه.
 */
