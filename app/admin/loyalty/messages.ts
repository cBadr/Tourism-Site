/**
 * ╔══════════════════════════════════════════════════════════════════════════╗
 * ║  رموز شاشة الولاء ← رسائلها العربية                                       ║
 * ╚══════════════════════════════════════════════════════════════════════════╝
 *
 * الحالة تسافر في `query string` لا في ذاكرة العميل (اتفاقية ٤)، فالإجراء يعيد
 * التوجيه برمز والصفحة تترجمه. وهذا المستودع **شحن رموزاً بلا رسائل أكثر من
 * مرة**: يعود المالك إلى شاشةٍ لا سطر فيها يشرح ما حدث — وهو أسوأ من رسالة
 * عامة، لأنه يبدو نجاحاً صامتاً.
 *
 * 🔒 **فالخريطتان مُفهرستان بنوع الاتحاد** (`Record<LoyaltyErrorCode, …>`)، لا
 * `Record<string, string>`: رمزٌ يُضاف إلى الاتحاد بلا رسالة **لا يُبنى أصلاً**
 * — `tsc` يرفض الخريطة الناقصة. الانضباط بنيويّ لا انتباهيّ، على سابقة
 * `app/account/_lib/messages.ts`.
 *
 * ولا تُخلط الخريطتان: نبرة الرسالة من الخريطة لا من اسم المَعلم، والفصل بين
 * `?error=` و`?done=` للقراءة البشرية للرابط وحدها.
 */

/** كل ما يستطيع `saveLoyaltySettings` أن يُنتجه من رموز فشل — لا رمز خارجها */
export type LoyaltyErrorCode =
  | "env"
  | "migration"
  | "ack"
  | "perpoint"
  | "pointvalue"
  | "minredeem"
  | "maxredeem"
  /** 0119 — صلاحية النقطة بالأشهر، والصفر معنىً لا خطأ */
  | "expiremonths"
  | "constraint"
  | "save";

/** كل رسالة تقول للمالك **ماذا يفعل الآن** لا ماذا حدث عندنا */
export const LOYALTY_ERRORS: Record<LoyaltyErrorCode, string> = {
  env: "قاعدة البيانات غير مربوطة — لا يمكن الحفظ بعد. راجع supabase/README.md ثم أعد تشغيل الخادم.",
  migration:
    "جدول إعدادات الولاء غير موجود في قاعدة البيانات — نفِّذ هجرة المرحلة ١٢ب (0047_loyalty.sql) بأمر pnpm db:migrate ثم أعد المحاولة.",
  ack: "التفعيل يبدأ سكّ التزام مالي على كل رحلة مكتملة — علّم مربّع الإقرار أسفل المفتاح ثم احفظ.",
  perpoint: "«النقاط لكل جنيه» يجب أن يكون رقماً غير سالب لا يتجاوز ١٠٠.",
  pointvalue:
    "«قيمة النقطة بالجنيه» يجب أن تكون رقماً أكبر من صفر لا يتجاوز ١٬٠٠٠. والصفر مرفوض في القاعدة نفسها: نقطةٌ بلا قيمة تُسكّ ولا تُستبدل أبداً — ولإيقاف النظام استعمل المفتاح الرئيسي.",
  minredeem: "«أقل رصيد يُستبدل» يجب أن يكون عدداً صحيحاً غير سالب لا يتجاوز ١٬٠٠٠٬٠٠٠ نقطة.",
  expiremonths:
    "«صلاحية النقطة» عددٌ صحيح من الأشهر بين ٠ و١٢٠. والصفر ليس خطأً بل معنى: «بلا انتهاء» — النقاط تبقى إلى الأبد كما كانت قبل تفعيل الصلاحية.",
  maxredeem: "«أقصى نسبة تُدفع بالنقاط» يجب أن تكون نسبة بين ٠ و١٠٠٪.",
  constraint:
    "رفضت قاعدة البيانات هذه القيم لمخالفتها أحد قيودها. راجع الأرقام الأربعة ثم أعد المحاولة — الحدّ الفعلي في القاعدة لا في هذه الشاشة.",
  save: "فشل الحفظ — تأكد أنك مسجل الدخول بحساب دوره admin (راجع supabase/README.md، فخ الصفوف الصفرية: RLS ترفض الكتابة بلا خطأ).",
};

/** نبرة بطاقة الإشعار — تحكم اللون، ولا تُشتق من اسم الرمز */
export type LoyaltyTone = "success" | "warning";

/** ما ينجح — و«فُعِّل» ليس «حُفظ»: الأول لحظةٌ يبدأ عندها التزامٌ مالي */
export type LoyaltyNoticeCode = "saved" | "on" | "off";

export const LOYALTY_NOTICES: Record<LoyaltyNoticeCode, { tone: LoyaltyTone; text: string }> = {
  saved: {
    tone: "success",
    text: "حُفظت الإعدادات وسرت على الرحلات والاستبدالات الجديدة فوراً. والحجوزات القائمة لا تتأثر — لقطة سعرها مجمَّدة.",
  },
  on: {
    tone: "warning",
    text: "فُعِّل نظام الولاء الآن. من هذه اللحظة تسكّ كل رحلة تكتمل نقاطاً في دفتر الولاء، والنقاط المسكوكة التزامٌ مالي علينا لا ينتهي بمرور الوقت.",
  },
  off: {
    tone: "success",
    text: "أُطفئ نظام الولاء. لا نقطة تُسكّ ولا تُستبدل من الآن — والأرصدة المسكوكة سابقاً تبقى في الدفتر كما هي، فالالتزام قائم حتى يُستبدل.",
  },
};

type SearchParams = Record<string, string | string[] | undefined>;

const first = (value: string | string[] | undefined): string | undefined =>
  Array.isArray(value) ? value[0] : value;

/** الرمز إن كان معروفاً — وما ليس في الخريطة **لا يُعرض إطلاقاً** */
export function readLoyaltyError(params: SearchParams): LoyaltyErrorCode | null {
  const value = first(params.error);
  return typeof value === "string" && value in LOYALTY_ERRORS
    ? (value as LoyaltyErrorCode)
    : null;
}

export function readLoyaltyNotice(params: SearchParams): LoyaltyNoticeCode | null {
  const value = first(params.done);
  return typeof value === "string" && value in LOYALTY_NOTICES
    ? (value as LoyaltyNoticeCode)
    : null;
}
