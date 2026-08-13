/**
 * حدود الميتاداتا وحالتها — طبقة عرض بحتة.
 *
 * لماذا هنا لا في Postgres؟ قاعدة المشروع «كل حساب رقمي في Postgres» تحكم
 * **أرقام المنتج** (المال والإحصاءات والمؤشرات) كي لا يوجد رقمان لنفس الشيء في
 * شاشتين. عدّ أحرف حقل بينما المستخدم يكتب فيه ليس رقم منتج بل تحقّق نموذج،
 * ولا يمكن أن يقع إلا حيث يقع النص — تماماً كما أن هندسة ارتفاع العمود في
 * `finance-ui.tsx` استثناء منصوص عليه. أرقام **قسم المحتوى/السيو المجمّعة**
 * (نسبة اكتمال الميتاداتا مثلاً) تبقى في `v_stats_content` وشاشة الإحصائيات.
 *
 * الحدود ليست قواعد من جوجل بل ما يظهر عملياً قبل القص في نتيجة البحث. لذلك
 * تجاوزها **تحذير لا منع**: العنوان الطويل لا يُرفض، بل يُقال للمالك إن ذيله
 * لن يظهر للباحث.
 */

/** الحد الموصى به لعنوان الصفحة قبل القص في نتيجة البحث */
export const META_TITLE_MAX = 60;
/** عنوان أقصر من هذا يهدر مساحة ولا يحمل كلمات مفتاحية كافية */
export const META_TITLE_MIN = 20;

/** الحد الموصى به لوصف الصفحة قبل القص */
export const META_DESCRIPTION_MAX = 160;
/** وصف أقصر من هذا لا يقنع الباحث بالنقر */
export const META_DESCRIPTION_MIN = 70;

export type MetaField = "title" | "description";

export const META_LIMITS: Record<MetaField, { min: number; max: number }> = {
  title: { min: META_TITLE_MIN, max: META_TITLE_MAX },
  description: { min: META_DESCRIPTION_MIN, max: META_DESCRIPTION_MAX },
};

/** حالة حقل واحد — تُلوَّن في الشاشة وتُحسب في المتصفح أثناء الكتابة بنفس المنطق */
export type MetaFieldState = "empty" | "short" | "ok" | "long";

export function metaFieldState(value: string | null | undefined, field: MetaField): MetaFieldState {
  const text = (value ?? "").trim();
  if (text === "") return "empty";
  const { min, max } = META_LIMITS[field];
  if (text.length > max) return "long";
  if (text.length < min) return "short";
  return "ok";
}

/** نص الحالة كما يقرؤه المالك تحت الحقل */
export function metaStateLabel(state: MetaFieldState, field: MetaField): string {
  const { min, max } = META_LIMITS[field];
  const what = field === "title" ? "العنوان" : "الوصف";
  switch (state) {
    case "empty":
      return field === "title"
        ? "فارغ — سيُستعمل عنوان الصفحة نفسه في نتيجة البحث."
        : "فارغ — سيُستعمل الوصف الافتراضي العام، وهو نفسه على كل صفحة.";
    case "short":
      return `${what} أقصر من ${min} حرفاً — أضف تفصيلاً يميّز الصفحة.`;
    case "long":
      return `${what} أطول من ${max} حرفاً — ما بعدها يُقصّ في نتيجة البحث.`;
    case "ok":
      return "ضمن الطول الموصى به.";
  }
}

/** الصفحة مكتملة الميتاداتا = عنوان ووصف غير فارغين */
export function isMetaComplete(meta: { title: string | null; description: string | null }): boolean {
  return (meta.title ?? "").trim() !== "" && (meta.description ?? "").trim() !== "";
}
