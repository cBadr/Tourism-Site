/**
 * عقد نظام المحتوى (المرحلة ٢) — نموذج «الأقسام»:
 * كل صفحة عامة = صف في `pages` + أقسام مرتبة في `sections` بمحتوى JSONB.
 * هذا الملف هو المرجع الأوحد لأنواع الأقسام وأشكال محتواها — قاعدة البيانات
 * والواجهة العامة ولوحة التحكم والـ Page Builder لاحقاً كلهم يلتزمون به.
 */

export type PageKind = "home" | "service" | "corridor" | "static";

export type PageMeta = {
  /** يدخل في قالب العنوان العام %s */
  title: string | null;
  description: string | null;
};

export type Page = {
  id: string;
  slug: string;
  kind: PageKind;
  title: string;
  meta: PageMeta;
  published: boolean;
  sort: number;
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
  | "contact"; // قنوات التواصل من الإعدادات

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
};

export type Section<T extends SectionType = SectionType> = {
  id: string;
  pageId: string;
  type: T;
  content: SectionContentMap[T];
  sort: number;
  visible: boolean;
};

export type PageWithSections = Page & { sections: Section[] };

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
};
