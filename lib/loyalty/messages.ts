import type { RedeemUnavailable } from "./types";

/**
 * نصوص تعذّر الاستبدال — المصدر الأوحد لربط السبب بما يقرؤه العميل.
 *
 * نظير `lib/discounts/messages.ts` بنيةً وانضباطاً، وبفارقٍ واحد جوهري: **لا
 * أوراكل هنا يُحمى منه**. رمز الكوبون يُخمَّن، فتنهار أسبابه في رسالةٍ واحدة كي
 * لا يعرف المخمّن أنه اقترب. والنقاط لا تُخمَّن — الرصيد يخصّ صاحب الجلسة
 * وحده — فالتفصيل هنا **يفيد العميل ولا يفيد مهاجماً**، ويُكتب صريحاً:
 * «رصيدك أقل من الحد الأدنى» جملةٌ تُفهَم ويُبنى عليها تصرّف، و«تعذّر» في
 * موضعها تُرجع العميل إلى الصفر (اتفاقية النبرة في `handover/CONVENTIONS.md`).
 *
 * ⚠ **والاستثناء الوحيد هو `not-applicable`** — وهو المقصود بالكتمان: تحته
 * «الأرضية لم تترك مساحة» و«الكوبون أخذ السقف كله» (‏§١ في العقد الأم). وقول
 * ذلك للعميل إعلانٌ لموضع حاجز الهامش، وهو بالضبط ما طوته طبقةُ الخصم في
 * `floor-guard ⇒ not-applicable`. فالرسالة بلا سبب وبلا رقم، وتقول له ما يفعله
 * الآن: تابع بالسعر المعروض.
 *
 * والجدول `Record<RedeemUnavailable, …>` **شامل بالنوع**: سببٌ جديد يُضاف إلى
 * العقد بلا نصٍّ هنا **لا يبني** — نفس الحارس البنيوي الذي يمنع «رمزٌ يُشحن بلا
 * رسالة» في `app/account/bookings/actions.ts`.
 */
export const REDEEM_TEXT: Record<RedeemUnavailable, { key: string; ar: string }> = {
  "signed-out": {
    key: "redeem.signedOut",
    ar: "نقاطك تُستخدم بعد تسجيل الدخول — أكمل حجزك الآن، والنقاط تُحتسب لك على كل حال.",
  },
  "no-balance": {
    key: "redeem.noBalance",
    ar: "لا رصيد نقاط في حسابك بعد. النقاط تُحتسب على الرحلات المنفَّذة.",
  },
  "below-minimum": {
    key: "redeem.belowMinimum",
    ar: "رصيدك أقل من أدنى حد للاستبدال. اجمع نقاطاً أكثر واستخدمها في رحلة قادمة.",
  },
  "not-applicable": {
    key: "redeem.notApplicable",
    ar: "لا يمكن استخدام نقاطك في هذه الرحلة. تابع بالسعر المعروض — ورصيدك يبقى كما هو.",
  },
  unavailable: {
    key: "redeem.unavailable",
    ar: "استبدال النقاط غير متاح الآن. تابع بالسعر المعروض.",
  },
  "rate-limited": {
    key: "redeem.rateLimited",
    ar: "طلبات كثيرة في وقت قصير. انتظر دقيقة ثم أعد المحاولة.",
  },
};

/** نص عربي مباشر — يستعمله الخادم، والمتصفح يترجمه بمساحة `loyalty` */
export function redeemText(reason: RedeemUnavailable): string {
  return REDEEM_TEXT[reason].ar;
}

/**
 * يحوّل ما تُرجعه `preview_redeem_points` في عمود `reason` إلى سببٍ ظاهر.
 *
 * القيمة الغريبة — نسخةُ قاعدةٍ أحدث من هذا الملف — تسقط إلى `not-applicable`:
 * أعمّ رسالة وأقلّها إفشاءً. **الفشل مغلقاً لا مفتوحاً**، وهو نفس اختيار
 * `toPublicRejection`؛ ولو سقطت إلى `unavailable` لقالت للعميل إن النظام مطفأ
 * وهو يعمل، فذهب يبحث عن عطلٍ لا وجود له.
 */
export function toRedeemReason(raw: unknown): RedeemUnavailable {
  if (typeof raw !== "string") return "not-applicable";
  const key = raw.trim() as RedeemUnavailable;
  return key in REDEEM_TEXT ? key : "not-applicable";
}
