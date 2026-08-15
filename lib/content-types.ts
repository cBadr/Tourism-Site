/**
 * عقد نظام المحتوى (المرحلة ٢) — نموذج «الأقسام»:
 * كل صفحة عامة = صف في `pages` + أقسام مرتبة في `sections` بمحتوى JSONB.
 * هذا الملف هو المرجع الأوحد لأنواع الأقسام وأشكال محتواها — قاعدة البيانات
 * والواجهة العامة ولوحة التحكم والـ Page Builder لاحقاً كلهم يلتزمون به.
 */

import type { PageSeoExtras } from "@/lib/seo-types";

/**
 * أنواع الصفحات — والرابع `landing` من المرحلة ١٣ (‏`0058_page_builder.sql` §١).
 *
 * ولماذا نوعٌ مستقل لا إعادةُ استعمال `static`؟ لأن ثلاثة مستهلكين يفرّقون فعلاً
 * بين «سياسة الخصوصية» و«صفحة هبوط تسويقية»: `PRIORITY` في `app/sitemap.ts`،
 * و`pagePublicPath` في `lib/seo/site-paths.ts`، وقائمة `/admin/content`.
 *
 * ⚠ **وإضافته هنا خطأُ بناءٍ مقصود** في كل `switch` بلا `default` وكل
 * `Record<PageKind, …>` — فنسيانُ التعامل معه يظهر في `tsc` لا صامتاً في الإنتاج
 * (العقد `lib/page-builder-types.ts` §٨ يسمّي هذه «فائدة مجانية مقصودة»).
 */
export type PageKind = "home" | "service" | "corridor" | "static" | "landing";

/**
 * ميتاداتا الصفحة — عمود `pages.meta` من نوع `jsonb`.
 *
 * الحقول الأربعة الجديدة تأتي من عقد `lib/seo-types.ts` بلا إعادة كتابة، وهي
 * **`Partial` بقصد**: نصّ العقد يقول إن المفتاح الغائب في صفٍّ قديم ليس خطأً بل
 * «غير مضبوط» يسقط إلى الافتراضي الآمن. فلو جُعلت مطلوبةً لصار كل صفٍّ مبذور
 * وكل كائن `meta` في `lib/default-content.ts` خطأَ بناء، ولاحتاج الأمر ترحيل
 * بيانات يكتب قيمةً في صفوف لم يلمسها المالك — وهو ما استبعده العقد صراحةً.
 *
 * ولذلك يقرأ كل مستهلك بمقارنة صريحة (`meta.noindex === true`) لا بصدق القيمة:
 * `undefined` و`null` و`false` ثلاثتها تعني «لم يُطلَب المنع».
 */
export type PageMeta = {
  /** يدخل في قالب العنوان العام %s */
  title: string | null;
  description: string | null;
} & Partial<PageSeoExtras>;

export type Page = {
  id: string;
  slug: string;
  kind: PageKind;
  title: string;
  meta: PageMeta;
  published: boolean;
  sort: number;
  /**
   * ختم آخر تعديل بصيغة ISO — مصدره العمود `updated_at` في جدول `pages` الذي
   * يحدّثه مشغّل `pages_touch_updated_at` (`0003_content.sql:23,27-30`).
   *
   * اختياري **هنا** لأن مُحمّل لوحة التحكم (`app/admin/content/loader.ts`) يبني
   * صفحاته لغرض التحرير ولا يحتاجه؛ أما الواجهة العامة فتضمنه عبر `PublicPage`.
   */
  updatedAt?: string | null;
};

export type SectionType =
  | "hero" // الرئيسية فقط — يقرأ الهوية من الإعدادات
  | "page-hero" // ترويسة صفحة داخلية: عنوان + نص + CTA اختياري
  | "services-grid" // شبكة الخدمات الست (بياناتها من site-config حالياً)
  | "fleet" // فئات السيارات الأربع
  | "why-us" // نقاط القيمة
  | "features" // قائمة مزايا عامة بعناصر حرة
  | "rich-text" // فقرات نصية (سطر فارغ = فقرة جديدة)
  | "faq" // أسئلة شائعة — تُصدَّر أيضاً كـ JSON-LD
  | "cta-band" // شريط دعوة للحجز
  | "contact" // قنوات التواصل من الإعدادات
  // ── كتلتا المرحلة ١٣ ────────────────────────────────────────────────────
  | "columns" // كتلة تخطيط: لا نصَّ لها، وأبناؤها صفوفٌ في `sections` بـ`parent_id`
  | "image"; // صورة من دلو `media` + نصٌّ بديل **قابل للترجمة**

/** أشكال محتوى JSONB لكل نوع قسم — الحقول الاختيارية تُعرض فقط عند وجودها */
export type SectionContentMap = {
  hero: { headline?: string; sub?: string };
  "page-hero": { title: string; sub?: string; ctaLabel?: string };
  "services-grid": { title?: string; sub?: string };
  fleet: { title?: string; sub?: string };
  "why-us": { title?: string; sub?: string };
  features: {
    title?: string;
    sub?: string;
    items: { title: string; text?: string }[];
  };
  "rich-text": { title?: string; body: string };
  faq: { title?: string; items: { q: string; a: string }[] };
  "cta-band": { title?: string; note?: string };
  contact: { title?: string; sub?: string };
  /**
   * كتلة تخطيط بلا محتوى إطلاقاً — أبناؤها **صفوفٌ** في `sections` يربطها
   * `parent_id`، لا مفاتيح داخل `jsonb` (العقد §٣: العمق في الصفوف لا في
   * الحقول، وإلا اختفى النصّ من فهرس الترجمة بدل أن ينفجر).
   */
  columns: Record<string, never>;
  /** `alt` نصٌّ قابل للترجمة لا سمةٌ تقنية — وإغفاله هو الخطأ المعتاد (العقد §١٠) */
  image: { src: string; alt: string; caption?: string };
};

export type Section<T extends SectionType = SectionType> = {
  id: string;
  pageId: string;
  type: T;
  content: SectionContentMap[T];
  sort: number;
  visible: boolean;
  /**
   * الكتلة الأمّ (`sections.parent_id` — هجرة `0058`). `null`/الغياب = كتلة جذر.
   *
   * **اختياري لا مطلوب، والسبب مقيس:** الأقسام الـ٩٣ القائمة كلها بلا أب، ولكل
   * مُحمّل في المشروع مصدرُه (‏`lib/content.ts` للعامة و`app/admin/content/loader.ts`
   * للوحة). جعلُه مطلوباً كان يحوّل كل مُحمّل لم يُحدَّث بعد إلى خطأ بناء بلا أن
   * يكسبه ذلك شيئاً — والعارضة تقرؤه بـ`?? null` فتتصرّف مع الغياب تصرّفها مع
   * الجذر حرفياً.
   */
  parentId?: string | null;
};

export type PageWithSections = Page & { sections: Section[] };

/**
 * الصفحة كما تخرج من طبقة المحتوى العامة (`lib/content.ts`) — الفرق الوحيد عن
 * `PageWithSections` أن ختم آخر تعديل **حقل مطلوب** (وقد تكون قيمته `null` إن
 * لم يصل العمود من القاعدة).
 *
 * لماذا نوع مستقل بدل جعل الحقل مطلوباً في `Page` كلها؟ لأن `updated_at` كان
 * موجوداً في القاعدة منذ `0003` ومع ذلك سقط صامتاً في التحويل، فبقيت خريطة
 * الموقع تعلن تاريخ التصيير لكل صفحة — أي أنها تكذب على محركات البحث بكل بناء.
 * طلبه صراحةً في نوع المخرجات يجعل إسقاطه **خطأ بناء** لا نقصاً صامتاً، دون أن
 * يُلزم مُحمّل اللوحة بحقل لا يستعمله.
 */
export type PublicPage = PageWithSections & { updatedAt: string | null };

/** ثوابت واجهة الإدارة: الاسم العربي + وصف قصير لكل نوع قسم */
export const SECTION_TYPE_LABELS: Record<SectionType, { label: string; hint: string }> = {
  hero: { label: "الواجهة الرئيسية", hint: "ترويسة الصفحة الرئيسية — العنوان والوصف من الهوية أو من هنا" },
  "page-hero": { label: "ترويسة صفحة", hint: "عنوان الصفحة الداخلية ونصها التمهيدي" },
  "services-grid": { label: "شبكة الخدمات", hint: "الخدمات الست — عناوين البطاقات من بيانات النظام" },
  fleet: { label: "الأسطول", hint: "فئات السيارات الأربع" },
  "why-us": { label: "لماذا نحن", hint: "نقاط القيمة الأساسية" },
  features: { label: "مزايا", hint: "قائمة مزايا بعناصر حرة (عنوان + نص)" },
  "rich-text": { label: "نص", hint: "فقرات نصية — اترك سطراً فارغاً بين الفقرات" },
  faq: { label: "أسئلة شائعة", hint: "أسئلة وأجوبة — تُغذّي نتائج البحث أيضاً" },
  "cta-band": { label: "شريط الحجز", hint: "دعوة للحجز بلون العلامة" },
  contact: { label: "التواصل", hint: "القنوات المفعّلة من الإعدادات" },
  columns: {
    label: "أعمدة",
    hint: "كتلة تخطيط — تحمل حتى أربع كتل أبناء جنباً إلى جنب، ولا نصَّ لها",
  },
  image: { label: "صورة", hint: "صورة من مكتبة الوسائط — النص البديل مطلوب" },
};
