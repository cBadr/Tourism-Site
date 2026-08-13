/**
 * نصوص رفض الكوبون — المصدر الأوحد لربط سبب الرفض بما يقرؤه الزائر.
 *
 * القرار ٨ في موجز المرحلة: **رسالة الرفض للزائر لا تفرّق بين «غير موجود»
 * و«معطَّل»** — التفريق يخبر من يخمّن الرموز أنه اقترب. وقاعدة العرض في العقد
 * الأم تقول الشيء نفسه: «التفصيل للوحة لا للزائر».
 *
 * ── كيف جُمِّعت الأسباب التسعة ─────────────────────────────────────────────
 *
 * محور أول — **هل الرمز موجود ومتاح أصلاً؟** هذا هو المحور الذي يستغله من
 * يخمّن: أي رد مختلف عن رفيقه يصير «أوراكل وجود». لذلك تنهار خمس حالات في
 * رسالة واحدة لا تميّز بينها:
 *   not-found (لا وجود له أو معطَّل) · expired · not-started · exhausted
 *   ⇒ `unavailable`
 * ويُضاف إليها نظام الخصومات المطفأ كلياً: زائرٌ يكتب رمزاً والنظام مغلق يرى
 * الرسالة نفسها، فلا يُستدل من فرق الرد على أن حملةً قائمة.
 *
 * محور ثانٍ — **الرمز صالح لكنه لا ينطبق على هذه الرحلة.** هنا التفصيل مفيد
 * للعميل الصادق ولا يضيف للمخمّن شيئاً يستحق: من بلغ هذا المحور يعرف أصلاً أن
 * الرمز صالح. ورسالة «الرمز غير صالح» في هذا الموضع تُرجع عميلاً حقيقياً إلى
 * الصفر بلا خطوة تالية — وهو ما تمنعه اتفاقية النبرة في `handover/CONVENTIONS.md`.
 *   class-not-eligible · below-min-total · per-customer-limit
 *
 * محور ثالث — **الأرضية تدخّلت.** `floor-guard` تصير `not-applicable`: رسالة
 * بلا سبب وبلا رقم. قول «الخصم يخترق أرضية الهامش» للزائر يعني إعلان الهامش.
 *
 * `rate-limited` تُعامَل كخطأ طلب لا كرفض كوبون، لكن نصها هنا لتبقى النصوص
 * كلها في ملف واحد.
 *
 * الجدول `Record<DiscountRejection, PublicRejection>` **شامل بالنوع**: أي سبب
 * جديد يُضاف إلى العقد الأم يكسر البناء هنا حتى يُقرَّر نصه — وهذا مقصود
 * (النمط ٤ في `handover/LESSONS.md`: انحراف العقد بين وكلاء متوازيين).
 */

import type { DiscountRejection } from "@/lib/discount-types";
import type { PublicRejection } from "./types";

/** كل سبب داخلي ← ما يقابله في الواجهة العامة */
export const PUBLIC_REJECTION: Record<DiscountRejection, PublicRejection> = {
  "not-found": "unavailable",
  expired: "unavailable",
  "not-started": "unavailable",
  exhausted: "unavailable",
  "per-customer-limit": "per-customer-limit",
  "class-not-eligible": "class-not-eligible",
  "below-min-total": "below-min-total",
  "floor-guard": "not-applicable",
  "rate-limited": "rate-limited",
};

/** مفتاح الترجمة والنص العربي الاحتياطي لكل سبب ظاهر */
export const REJECTION_TEXT: Record<PublicRejection, { key: string; ar: string }> = {
  unavailable: {
    key: "reject.unavailable",
    ar: "هذا الرمز غير صالح للاستخدام الآن. راجع كتابته أو تابع بلا كوبون.",
  },
  "class-not-eligible": {
    key: "reject.classNotEligible",
    ar: "هذا الرمز لا ينطبق على فئة السيارة المختارة. جرّبه على فئة أخرى.",
  },
  "below-min-total": {
    key: "reject.belowMinTotal",
    ar: "هذا الرمز يبدأ من إجمالي رحلة أعلى من إجمالي رحلتك.",
  },
  "not-applicable": {
    key: "reject.notApplicable",
    ar: "تعذّر تطبيق هذا الرمز على هذه الرحلة. يمكنك المتابعة بالسعر المعروض.",
  },
  "per-customer-limit": {
    key: "reject.perCustomerLimit",
    ar: "استُخدم هذا الرمز بهذا الرقم بالحد المسموح به.",
  },
  "rate-limited": {
    key: "reject.rateLimited",
    ar: "جرّبت رموزاً كثيرة في وقت قصير. انتظر دقيقة ثم أعد المحاولة.",
  },
};

/** نص عربي مباشر لسبب ظاهر — يستعمله الخادم (المتصفح يترجمه بمساحة `discount`) */
export function publicRejectionText(rejection: PublicRejection): string {
  return REJECTION_TEXT[rejection].ar;
}

/**
 * يحوّل ما ترفعه `apply_discount` في عمود `rejection` إلى سبب ظاهر.
 * القيمة الغريبة (نسخة قاعدة أحدث من هذا الملف) تسقط إلى `unavailable`:
 * أعمّ رسالة وأقلّها إفشاءً — الفشل مغلقاً لا مفتوحاً.
 */
export function toPublicRejection(raw: unknown): PublicRejection {
  if (typeof raw !== "string") return "unavailable";
  const key = raw.trim() as DiscountRejection;
  return PUBLIC_REJECTION[key] ?? "unavailable";
}
