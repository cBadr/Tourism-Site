/**
 * عقد الواجهة العامة للخصم — ما يغادر الخادم إلى المتصفح، لا أكثر.
 *
 * العقد الأم `lib/discount-types.ts` يصف الحقيقة الداخلية كاملةً (‏`DiscountOutcome`
 * بحقل `clamped`، و`DiscountRejection` بتسعة أسباب). وهذا الملف يصف **النسخة
 * المنقّحة** التي يراها الزائر — وهو نظير `redactPricing` في `app/api/quote/route.ts`
 * حرفاً بحرف: الكائن يُبنى حقلاً حقلاً، فما لا يوجد في هذا النوع لا يتسرب ولو
 * أضافت دالة SQL عموداً حساساً غداً.
 *
 * ── ما يُحجب ولماذا ────────────────────────────────────────────────────────
 *
 * (١) **`clamped` لا يخرج إلى المتصفح إطلاقاً.**
 *     العقد الأم يقول: «الشفافية هنا مقصودة — **المالك** يجب أن يرى أن حملته لم
 *     تُطبَّق كما أعلنها». والمالك لا الزائر. لأن `clamped = true` تعني حرفياً
 *     «أرضية الهامش تدخّلت هنا»، ومن يجرّب رحلات مختلفة بنفس الكوبون ويراقب هذه
 *     الراية يرسم خريطة هوامش الموقع من الخارج. الزائر يرى **القيمة الفعلية**
 *     للخصم — وهي صحيحة وكاملة — ولا يرى سببها.
 *
 * (٢) **أسباب الرفض تُجمَّع.** `DiscountRejection` تسعة أسباب دقيقة للوحة،
 *     ويقابلها هنا اتحاد أصغر (`PublicRejection`). التفصيل في `messages.ts`.
 *
 * (٣) **لا تكلفة متعهد ولا هامش ولا أي أثر لهما.** لا يوجد في هذا الملف حقل
 *     يحملهما أصلاً، فتسريبهما مستحيل بنيوياً لا انضباطياً.
 */

/**
 * سبب الرفض كما يراه الزائر — اتحاد مُصغَّر عمداً.
 *
 * `unavailable` هي الحالة الجامعة: «غير موجود» و«معطَّل» و«انتهى» و«لم يبدأ»
 * و«نفد» ونظام الخصومات مطفأ — كلها رسالة واحدة لا تفرّق بينها. التفريق يخبر
 * من يخمّن الرموز أنه اقترب (القرار ٨ في موجز المرحلة).
 */
export type PublicRejection =
  | "unavailable"
  | "class-not-eligible"
  | "below-min-total"
  | "not-applicable"
  | "per-customer-limit"
  | "rate-limited";

/**
 * جسم طلب POST /api/discount/verify.
 *
 * **لا سعر ولا مسافة من العميل** — نفس المبدأ الحاكم في `lib/booking-types.ts`.
 * المتصفح يرسل مدخلات الرحلة والفئة والرمز، والخادم يعيد حساب المسافة ويستدعي
 * دالة التسعير بنفسه ثم يمرّر الناتج إلى `apply_discount`. لو قبِل هذا المسار
 * `total` من المتصفح لصار مسبار هوامش: يرفع الإجمالي حتى يتوقف التقليص فيقرأ
 * الأرضية بالفرق.
 */
export type VerifyCouponRequest = {
  code: string;
  origin: { label?: string; lat: number; lng: number };
  destination: { label?: string; lat: number; lng: number };
  passengers: number;
  roundTrip: boolean;
  waitingHours: number;
  /** الفئة التي اختارها الزائر — الخصم يخصّ فئة بعينها لا سلة العروض */
  classSlug: string;
};

/**
 * **لا حقل هاتف هنا عمداً.** `quote_public` لا تقبل هاتفاً بقرار من هجرة 0024
 * نفسها: سقف «الاستخدام لكل عميل» يُفرض في `redeem_coupon` داخل معاملة الحجز
 * حيث الهاتف معروف أصلاً. فلا يُرسَل رقم إلى مسار عام يقبل التخمين، ولا يُبنى
 * في هذا المسار أي ربط بين رمز كوبون وشخص.
 *
 * والأثر على الواجهة مكتوب لا مخفي: `per-customer-limit` **لا يظهر في
 * المعاينة**. عميلٌ استنفد حصته يرى الخصم معروضاً ثم يُنشأ حجزه بالسعر الكامل،
 * والمبالغ النهائية في صفحة متابعة الحجز (وهي مصدرها الوحيد).
 */


/**
 * الكوبون طُبِّق — كل رقم هنا من `apply_discount` بلا حساب في TypeScript.
 *
 * **لا حقل `kind` هنا عمداً.** نوع الإرجاع في العقد الأم هو
 * `(applied, amount, total_after, clamped, rejection)` ولا يحمل نوع الخصم؛
 * وإضافة حقل تملؤه الواجهة من عندها هو بالضبط «الكود يقرأ عموداً لا تُرجعه
 * الدالة» (النمط ٤ في `handover/LESSONS.md`). وما يهمّ العميل مبلغٌ لا صيغة:
 * يرى «‑٤٥ ج.م» سواء وُلدت من نسبة أو من مبلغ ثابت.
 */
export type CouponApplied = {
  ok: true;
  applied: true;
  /** الرمز بصيغته المُنظَّفة كما أُرسل — القاعدة لا تُرجع الرمز في نوعها */
  code: string;
  /** قيمة الخصم الفعلية — قد تكون أقل من القيمة الاسمية، ولا يُقال للزائر لماذا */
  amount: number;
  totalBefore: number;
  totalAfter: number;
  currency: string;
};

/** الكوبون رُفض — سبب مُجمَّع ونص عربي جاهز */
export type CouponRejected = {
  ok: true;
  applied: false;
  rejection: PublicRejection;
  message: string;
};

/** خطأ طلب أو بيئة — نفس شكل `QuoteError` و`BookingError` */
export type CouponRequestError = {
  ok: false;
  /** invalid-input | rate-limited | db-unavailable | pricing-failed */
  code: string;
  message: string;
};

export type VerifyCouponResponse = CouponApplied | CouponRejected | CouponRequestError;

/**
 * الخصم المطبَّق كما تحمله واجهة الحجز بين مكوّناتها.
 * نسخة `CouponApplied` بلا رايات النقل — تُمرَّر إلى تفصيل السعر وإلى الإرسال.
 *
 * ⚠ **معاينة لا التزام.** الأرقام هنا ناتج `apply_discount` على سعرٍ حُسب
 * لحظة التحقق. الرقم المُلزِم هو ما تُثبّته `create_booking` داخل معاملتها
 * (القاعدة ٤ في العقد الأم: الخصم المطبَّق يُجمَّد في لقطة الحجز). ولذلك لا
 * يُرسَل أي مبلغ من المتصفح إلى `/api/booking` — يُرسَل الرمز وحده.
 */
export type AppliedDiscount = {
  code: string;
  amount: number;
  totalBefore: number;
  totalAfter: number;
  currency: string;
};
