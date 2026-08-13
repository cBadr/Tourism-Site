/**
 * فحص البيانات المهيكلة والميتاداتا — **قراءة محضة، لا يعدّل شيئاً**.
 *
 * ── لماذا هذا الفحص صادق ولماذا هذا مهم ─────────────────────────────────────
 * درس `LESSONS.md` النمط ٢: «الواجهة تَعِد بما لا تنفّذه القاعدة». فحص سيو
 * يقول «الصفحة صالحة» وهو لا يعرف ما يُصدَّر فعلاً أسوأ من غياب الفحص، لأنه
 * يُسكت المالك عن عطب حقيقي.
 *
 * لذلك هذا الملف لا يخمّن: هو يعكس **ما يفعله الكود اليوم حرفاً بحرف**، وهذان
 * هما موضعا JSON-LD الوحيدان في المستودع كله:
 *
 *   ١) `components/seo/JsonLd.tsx` — `LocalBusiness` + `ItemList` للخدمات،
 *      مستعمَل في `app/page.tsx` **وحدها** ⇒ الصفحة الرئيسية فقط.
 *   ٢) `components/sections/faq.tsx` — `FAQPage`، لكل قسم `faq`.
 *      وقيده الحرفي: `items.filter((i) => i.q && i.a)` ثم
 *      `if (items.length === 0) return null` ⇒ قسم أسئلة بلا عنصر مكتمل
 *      **لا يُصدِّر شيئاً**، والقسم المخفي لا يُصيَّر أصلاً.
 *
 * وما دون ذلك فالصفحة بلا بيانات مهيكلة. هذه هي الفجوة الحقيقية التي يكشفها
 * التقرير — لا «نسبة اكتمال» مطمئنة.
 */

import type { PageKind, PageWithSections } from "@/lib/content-types";
import { metaFieldState, type MetaFieldState } from "@/lib/seo/meta";
import { pagePublicPath } from "@/lib/seo/site-paths";

/** أنواع البيانات المهيكلة التي يُصدّرها هذا المستودع فعلاً */
export type SchemaType = "LocalBusiness" | "ItemList" | "FAQPage";

export const SCHEMA_LABELS: Record<SchemaType, string> = {
  LocalBusiness: "نشاط تجاري محلي",
  ItemList: "قائمة الخدمات",
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

  const jsonLd: SchemaType[] = [];
  // الرئيسية وحدها تُصيّر <JsonLd /> — تحقّق: app/page.tsx السطر ٤١
  if (page.kind === "home") jsonLd.push("LocalBusiness", "ItemList");
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

export type BusinessField = {
  key: string;
  label: string;
  present: boolean;
  /** ما أثر غيابه فعلاً */
  note: string;
};

/**
 * الحقول الاختيارية في `LocalBusiness` — `JsonLd.tsx` **لا يُدرجها إن كانت
 * فارغة**، فغيابها ليس خطأ برمجياً بل بيانات ناقصة يملأها المالك من الإعدادات.
 */
export function auditBusiness(input: {
  phone: string | null;
  description: string | null;
  socials: (string | null)[];
}): BusinessField[] {
  const socials = input.socials.filter((s) => s !== null && s.trim() !== "");
  return [
    {
      key: "telephone",
      label: "رقم الهاتف",
      present: (input.phone ?? "").trim() !== "",
      note: "بلا رقم لا تعرض جوجل زر الاتصال بجوار نتيجة الموقع.",
    },
    {
      key: "description",
      label: "الوصف الافتراضي",
      present: (input.description ?? "").trim() !== "",
      note: "الوصف نفسه يُستعمل في بطاقة النشاط وفي كل صفحة بلا وصف خاص.",
    },
    {
      key: "sameAs",
      label: "حسابات التواصل",
      present: socials.length > 0,
      note: "روابط التواصل تربط الموقع بحساباته الرسمية في نظر محركات البحث.",
    },
  ];
}
