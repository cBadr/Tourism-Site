/**
 * فحص البيانات المهيكلة والميتاداتا — **قراءة محضة، لا يعدّل شيئاً**.
 *
 * ── لماذا هذا الفحص صادق ولماذا هذا مهم ─────────────────────────────────────
 * درس `LESSONS.md` النمط ٢: «الواجهة تَعِد بما لا تنفّذه القاعدة». فحص سيو
 * يقول «الصفحة صالحة» وهو لا يعرف ما يُصدَّر فعلاً أسوأ من غياب الفحص، لأنه
 * يُسكت المالك عن عطب حقيقي.
 *
 * لذلك هذا الملف لا يخمّن: هو يعكس **ما يفعله الكود اليوم حرفاً بحرف**، وهذه
 * مواضع JSON-LD الثلاثة في المستودع كله (وأشكالها كلها من `lib/seo/jsonld.ts`
 * الذي يستورده هذا الملف أيضاً — فالفحص يستدعي **الباني نفسه** لا نسخة عنه):
 *
 *   ١) `components/seo/JsonLd.tsx` ← `<JsonLd />` في `app/page.tsx` **وحدها**:
 *      `Organization` + `WebSite` + `LocalBusiness` + `ItemList` ⇒ الرئيسية فقط.
 *   ٢) `components/seo/JsonLd.tsx` ← `<PageJsonLd />` في `app/services/[slug]`
 *      و`app/routes/[slug]`: `Service` + `BreadcrumbList` لصفحة الخدمة،
 *      و`BreadcrumbList` وحده لصفحة المسار (المسار استهداف عبارة بحث لا خدمة
 *      معروضة، ووسمه خدمةً يجعله ينافس الخدمات الست على التصنيف نفسه).
 *   ٣) `components/sections/faq.tsx` — `FAQPage`، لكل قسم `faq`.
 *      وقيده الحرفي: `items.filter((i) => i.q && i.a)` ثم
 *      `if (items.length === 0) return null` ⇒ قسم أسئلة بلا عنصر مكتمل
 *      **لا يُصدِّر شيئاً**، والقسم المخفي لا يُصيَّر أصلاً.
 *
 * وما دون ذلك — أي الصفحة الثابتة بلا قسم أسئلة — فبلا بيانات مهيكلة. هذه هي
 * الفجوة الحقيقية التي يكشفها التقرير، لا «نسبة اكتمال» مطمئنة.
 */

import type { PageKind, PageWithSections } from "@/lib/content-types";
import { metaFieldState, type MetaFieldState } from "@/lib/seo/meta";
import { pagePublicPath } from "@/lib/seo/site-paths";
import { geoNode, postalAddressNode, sameAsList } from "@/lib/seo/jsonld";
import { socialHrefs, type SiteSettings } from "@/lib/site-config";

/** أنواع البيانات المهيكلة التي يُصدّرها هذا المستودع فعلاً */
export type SchemaType =
  | "Organization"
  | "WebSite"
  | "LocalBusiness"
  | "ItemList"
  | "Service"
  | "BreadcrumbList"
  | "FAQPage";

export const SCHEMA_LABELS: Record<SchemaType, string> = {
  Organization: "المؤسسة",
  WebSite: "الموقع الإلكتروني",
  LocalBusiness: "نشاط تجاري محلي",
  ItemList: "قائمة الخدمات",
  Service: "خدمة",
  BreadcrumbList: "مسار التنقّل",
  FAQPage: "أسئلة شائعة",
};

export type IssueSeverity = "error" | "warn" | "info";

export type AuditIssueCode =
  | "faq-hidden"
  | "faq-empty"
  | "no-jsonld"
  | "meta-title-missing"
  | "meta-description-missing"
  | "meta-title-long"
  | "meta-description-long"
  | "meta-title-short"
  | "meta-description-short"
  | "draft";

export type AuditIssue = {
  code: AuditIssueCode;
  severity: IssueSeverity;
  /** ماذا يحدث فعلاً — لا وصف مجرّد */
  text: string;
};

const ISSUES: Record<AuditIssueCode, { severity: IssueSeverity; text: string }> = {
  "faq-hidden": {
    severity: "error",
    text: "قسم الأسئلة الشائعة مخفي — لا يظهر للزائر ولا تُصدَّر بياناته المهيكلة.",
  },
  "faq-empty": {
    severity: "error",
    text: "قسم الأسئلة الشائعة بلا عنصر مكتمل (سؤال وجواب معاً) — القسم لا يُعرض ولا يُصدَّر إطلاقاً.",
  },
  "no-jsonld": {
    severity: "warn",
    text: "لا بيانات مهيكلة على هذه الصفحة — أضف قسم «أسئلة شائعة» بعناصر مكتملة ليظهر مقتطف موسّع في نتائج البحث.",
  },
  "meta-title-missing": {
    severity: "warn",
    text: "لا عنوان سيو — نتيجة البحث ستستعمل عنوان الصفحة كما هو.",
  },
  "meta-description-missing": {
    severity: "warn",
    text: "لا وصف سيو — سيُستعمل الوصف الافتراضي العام، وهو نفسه على كل صفحات الموقع.",
  },
  "meta-title-long": {
    severity: "info",
    text: "عنوان السيو أطول من الحد الموصى به — ذيله يُقصّ في نتيجة البحث.",
  },
  "meta-description-long": {
    severity: "info",
    text: "وصف السيو أطول من الحد الموصى به — ذيله يُقصّ في نتيجة البحث.",
  },
  "meta-title-short": {
    severity: "info",
    text: "عنوان السيو قصير — مساحة مهدرة في نتيجة البحث.",
  },
  "meta-description-short": {
    severity: "info",
    text: "وصف السيو قصير — لا يقنع الباحث بالنقر.",
  },
  draft: {
    severity: "info",
    text: "الصفحة مسودة — لا تظهر للزوار ولا تُفهرَس. أصلح ميتاداتاها قبل النشر.",
  },
};

const issue = (code: AuditIssueCode): AuditIssue => ({ code, ...ISSUES[code] });

export type PageAudit = {
  id: string;
  title: string;
  kind: PageKind;
  slug: string;
  /** المسار العام بالعربية الأصيلة */
  path: string;
  published: boolean;
  metaTitle: string | null;
  metaDescription: string | null;
  titleState: MetaFieldState;
  descriptionState: MetaFieldState;
  /** أنواع البيانات المهيكلة التي **ستُصدَّر فعلاً** عند فتح الصفحة */
  jsonLd: SchemaType[];
  /** أقسام أسئلة موجودة لكنها لا تُنتج بيانات مهيكلة (مخفية أو فارغة) */
  brokenFaqSections: number;
  issues: AuditIssue[];
};

/** عنصر أسئلة صالح = سؤال وجواب غير فارغين (نفس شرط المكوّن حرفياً) */
function countValidFaqItems(content: unknown): number {
  if (typeof content !== "object" || content === null) return 0;
  const items = (content as { items?: unknown }).items;
  if (!Array.isArray(items)) return 0;
  return items.filter((item) => {
    if (typeof item !== "object" || item === null) return false;
    const rec = item as { q?: unknown; a?: unknown };
    return (
      typeof rec.q === "string" && rec.q.trim() !== "" &&
      typeof rec.a === "string" && rec.a.trim() !== ""
    );
  }).length;
}

/** فحص صفحة واحدة */
export function auditPage(page: PageWithSections): PageAudit {
  const faqSections = page.sections.filter((s) => s.type === "faq");

  let exportsFaq = false;
  let hidden = 0;
  let empty = 0;

  for (const section of faqSections) {
    const valid = countValidFaqItems(section.content);
    if (valid === 0) {
      empty += 1;
      continue;
    }
    if (!section.visible) {
      hidden += 1;
      continue;
    }
    exportsFaq = true;
  }

  /**
   * ما تُصدّره هذه الصفحة **فعلاً** عند فتحها — مشتقّ من نوعها لا من أمنية.
   * كل سطر هنا يقابل موضع تصيير حقيقياً مذكوراً في رأس الملف، ونقضه يبدأ بحذف
   * `<PageJsonLd />` من صفحةٍ ما فيصير التقرير كاذباً في الاتجاه الأخطر:
   * يطمئن المالك إلى بيانات لا تخرج.
   */
  const jsonLd: SchemaType[] = [];
  if (page.kind === "home") {
    jsonLd.push("Organization", "WebSite", "LocalBusiness", "ItemList");
  }
  // الخدمة تُعرّف نفسها ومسارها؛ والمسار مسارَه وحده
  if (page.kind === "service") jsonLd.push("Service", "BreadcrumbList");
  if (page.kind === "corridor") jsonLd.push("BreadcrumbList");
  if (exportsFaq) jsonLd.push("FAQPage");

  const titleState = metaFieldState(page.meta.title, "title");
  const descriptionState = metaFieldState(page.meta.description, "description");

  const issues: AuditIssue[] = [];
  if (hidden > 0) issues.push(issue("faq-hidden"));
  if (empty > 0) issues.push(issue("faq-empty"));
  if (jsonLd.length === 0) issues.push(issue("no-jsonld"));
  if (titleState === "empty") issues.push(issue("meta-title-missing"));
  else if (titleState === "long") issues.push(issue("meta-title-long"));
  else if (titleState === "short") issues.push(issue("meta-title-short"));
  if (descriptionState === "empty") issues.push(issue("meta-description-missing"));
  else if (descriptionState === "long") issues.push(issue("meta-description-long"));
  else if (descriptionState === "short") issues.push(issue("meta-description-short"));
  if (!page.published) issues.push(issue("draft"));

  return {
    id: page.id,
    title: page.title,
    kind: page.kind,
    slug: page.slug,
    path: pagePublicPath(page.kind, page.slug),
    published: page.published,
    metaTitle: page.meta.title,
    metaDescription: page.meta.description,
    titleState,
    descriptionState,
    jsonLd,
    brokenFaqSections: hidden + empty,
    issues,
  };
}

export function auditPages(pages: PageWithSections[]): PageAudit[] {
  return pages.map(auditPage);
}

/** أعلى خطورة في صفحة — لترتيب القائمة وتلوين صفّها */
export function worstSeverity(issues: AuditIssue[]): IssueSeverity | null {
  if (issues.some((i) => i.severity === "error")) return "error";
  if (issues.some((i) => i.severity === "warn")) return "warn";
  if (issues.length > 0) return "info";
  return null;
}

const SEVERITY_RANK: Record<IssueSeverity, number> = { error: 0, warn: 1, info: 2 };

/** الأسوأ أولاً — المالك يرى ما ينزف قبل ما يُحسَّن */
export function sortByUrgency(rows: PageAudit[]): PageAudit[] {
  return [...rows].sort((a, b) => {
    const sa = worstSeverity(a.issues);
    const sb = worstSeverity(b.issues);
    const ra = sa === null ? 3 : SEVERITY_RANK[sa];
    const rb = sb === null ? 3 : SEVERITY_RANK[sb];
    if (ra !== rb) return ra - rb;
    if (a.published !== b.published) return a.published ? -1 : 1;
    return a.title.localeCompare(b.title, "ar");
  });
}

/* ------------------------------------------------------------------ */
/* فحص البيانات المهيكلة على مستوى الموقع (LocalBusiness في الرئيسية)   */
/* ------------------------------------------------------------------ */

/** ثلاث مجموعات تُقرأ سطراً واحداً: من نحن · أين نحن · كيف نعمل */
export type BusinessFieldGroup = "identity" | "location" | "operation";

export const BUSINESS_GROUP_LABELS: Record<BusinessFieldGroup, string> = {
  identity: "الهوية والاتصال",
  location: "الموقع الجغرافي",
  operation: "التشغيل ونطاق الخدمة",
};

export type BusinessField = {
  key: string;
  label: string;
  group: BusinessFieldGroup;
  /**
   * 🔒 **`warn` أو `info` — ولا `error` هنا أبداً.**
   *
   * الحقل الاختياري غير المملوء ليس عطباً: `jsonld.ts` لا يُدرجه أصلاً فتخرج
   * البطاقة صحيحة ناقصةً لا كاذبة. وتلوينه أحمر يعلّم المالك تجاهل الأحمر، فيمرّ
   * عليه يوماً عطبٌ حقيقي بلا انتباه — وهو ثمن أغلى من الحقل الناقص نفسه.
   *
   * والقسمة: `warn` لما له أثر مباشر في الترتيب المحلي، و`info` لما دونه.
   */
  severity: Exclude<IssueSeverity, "error">;
  present: boolean;
  /** ما أثر غيابه فعلاً */
  note: string;
};

/**
 * حقول بطاقة النشاط — وكل سطر هنا يعكس شرط الإدراج في `lib/seo/jsonld.ts`.
 *
 * ⚠ وحقلا العنوان والإحداثيات لا يُفحصان بنصّ مكتوب هنا بل **بمناداة الباني
 * نفسه** (`postalAddressNode` و`geoNode`): لو تشدّد الباني يوماً (رفض إحداثي
 * خارج مداه مثلاً) تشدّد الفحص معه في السطر نفسه. ونسخةُ شرطٍ ثانية هنا تعني
 * شاشةً تقول «مضبوط» عن قيمة يرفضها التصيير صامتاً — وهو بالضبط النمط ٢ الذي
 * يوجد هذا الملف لمنعه.
 */
export function auditBusiness(settings: SiteSettings): BusinessField[] {
  const business = settings.business;
  /**
   * نفس مسار التصيير حرفاً بحرف — لا نسخة عنه (انظر تعليق الدالة أعلاه):
   * `socialHrefs` تطبّع المعرّف المجرّد إلى عنوان مطلق، ثم `sameAsList` تحرس
   * الناتج كما تفعل في `JsonLd`. وقبل هذا كانت الشاشة تقرأ الخام فتقول «لا
   * حسابات» عن حساباتٍ يعرضها التذييل — وهو عين ما وُجد هذا الملف ليمنعه.
   */
  const socials = sameAsList(socialHrefs(settings.socials));
  const set = (value: string | null): boolean => (value ?? "").trim() !== "";

  return [
    {
      key: "telephone",
      label: "رقم الهاتف",
      group: "identity",
      severity: "warn",
      present: set(settings.contact.phone),
      note: "بلا رقم لا تعرض جوجل زر الاتصال بجوار نتيجة الموقع.",
    },
    {
      key: "description",
      label: "الوصف الافتراضي",
      group: "identity",
      severity: "warn",
      present: set(settings.seo.defaultDescription),
      note: "الوصف نفسه يُستعمل في بطاقة النشاط وفي كل صفحة بلا وصف خاص.",
    },
    {
      key: "logo",
      label: "شعار العلامة",
      group: "identity",
      severity: "info",
      present: set(settings.brand.logoUrl),
      note: "الشعار عقدة صورة واحدة تشير إليها المؤسسة وبطاقة النشاط معاً — وبدونه تخرج النتيجة بلا أيقونة.",
    },
    {
      key: "legalName",
      label: "الاسم القانوني",
      group: "identity",
      severity: "info",
      present: set(settings.company.legalName),
      note: "يفصل الكيان المسجَّل عن الاسم التجاري في عقدة المؤسسة، ولا يُشتق من الاسم التجاري لأنه ادّعاء عن كيان مسجَّل.",
    },
    {
      key: "sameAs",
      label: "حسابات التواصل",
      group: "identity",
      severity: "info",
      present: socials.length > 0,
      note: "اكتب اسم الحساب وحده (RentLimousine) فيُبنى عنوانه تلقائياً، أو الصق العنوان الكامل. وما لا يُبنى منه عنوان — قيمة فيها مسافات مثلاً — لا يُعلَن ولا يُعرض.",
    },
    {
      key: "address",
      label: "العنوان البريدي",
      group: "location",
      severity: "warn",
      present: postalAddressNode(business) !== null,
      note: "بلا جزء واحد من العنوان لا تُدرَج PostalAddress إطلاقاً، ولا يظهر النشاط في نتائج الخرائط المحلية.",
    },
    {
      key: "addressLocality",
      label: "المدينة",
      group: "location",
      severity: "warn",
      present: set(business.addressLocality),
      note: "المدينة أقوى إشارة ترتيب محلي — بحثٌ بنيّة محلية لا يصلك بدونها.",
    },
    {
      key: "addressCountry",
      label: "رمز الدولة",
      group: "location",
      severity: "warn",
      present: set(business.addressCountry),
      note: "بحرفين مثل EG — بدونه يبقى العنوان معلّقاً بلا بلد يُنسب إليه.",
    },
    {
      key: "addressRegion",
      label: "المحافظة",
      group: "location",
      severity: "info",
      present: set(business.addressRegion),
      note: "تدقّق موضع النشاط داخل الدولة ولا يشترطها جوجل.",
    },
    {
      key: "postalCode",
      label: "الرمز البريدي",
      group: "location",
      severity: "info",
      present: set(business.postalCode),
      note: "يرفع ثقة مطابقة العنوان، وغيابه لا يُبطل العنوان.",
    },
    {
      key: "geo",
      label: "الإحداثيات",
      group: "location",
      severity: "warn",
      present: geoNode(business) !== null,
      note: "خط العرض وخط الطول يخرجان معاً أو لا يخرجان — وواحدٌ منهما بلا الآخر (أو خارج مداه) لا يُدرَج إطلاقاً.",
    },
    {
      key: "openingHours",
      label: "ساعات العمل",
      group: "operation",
      severity: "info",
      present: set(business.openingHours),
      note: "بصيغة schema.org مثل Mo-Su 00:00-23:59 — تُظهر حالة «مفتوح الآن» بجوار النتيجة.",
    },
    {
      key: "priceRange",
      label: "نطاق السعر",
      group: "operation",
      severity: "info",
      present: set(business.priceRange),
      note: "إشارة مقارنة يعرضها جوجل بجوار النشاط، ولا علاقة لها بأي سعر محسوب.",
    },
    {
      /**
       * ⚠ الحقل الوحيد الذي **نقص** بهذه التوسعة لا زاد، والتصريح به هنا مقصود:
       * كان `"EG"` مثبَّتاً في `JsonLd.tsx` يخرج لكل نسخة whitelabel مهما كان
       * بلدها (نقض D-04)، فصار من الإعدادات — والقائمة الفارغة لا تُخرج شيئاً.
       */
      key: "areaServed",
      label: "المناطق المخدومة",
      group: "operation",
      severity: "warn",
      present: business.areaServed.length > 0,
      note: "كانت مثبَّتة «EG» في الكود لكل نسخة من المنتج، وصارت من الإعدادات: الفارغة لا تُخرج الحقل أصلاً بدل أن تعلن بلداً لم تقله.",
    },
  ];
}

/** حقول مجموعة واحدة — لعرضها تحت عنوانها في الشاشة */
export function businessFieldsByGroup(
  fields: BusinessField[],
  group: BusinessFieldGroup
): BusinessField[] {
  return fields.filter((field) => field.group === group);
}
