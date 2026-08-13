import { cache } from "react";
import type { Page, PageWithSections, Section } from "@/lib/content-types";
import { DEFAULT_LOCALE } from "@/lib/i18n-types";

/**
 * طبقة المحتوى — نفس فلسفة lib/settings.ts:
 * تقرأ من جدولي `pages` و`sections` عند اتصال قاعدة البيانات،
 * وترجع للمحتوى الافتراضي في `lib/default-content.ts` عند غيابها أو فشلها.
 * الواجهة العامة تقرأ من هنا حصراً (منشور/مرئي فقط)؛ أما لوحة التحكم فلها
 * مُحمّلها الخاص `app/admin/content/loader.ts` لأنها ترى المسودات أيضاً.
 *
 * ── المرحلة ٨: وعي اللغة ────────────────────────────────────────────────────
 * كل دالة تقبل `locale` **اختيارياً** بقيمة افتراضية «ar»، فأي مستدعٍ قديم
 * (`getPageBySlug("home")`) يبقى يعمل حرفياً كما كان.
 *
 * للغة غير الأساس نقرأ عبر دالة `localized_page(p_slug, p_locale)` ثم **ندمج
 * حقلاً حقلاً فوق العربي**: النص المترجم يُستعمل إن وُجد وكان غير فارغ، وإلا
 * بقي العربي. الشكل النهائي مشتق من الصف العربي دائماً — أي أن ردّاً ناقصاً أو
 * مشوَّهاً من قاعدة البيانات لا يستطيع أن يُسقط صفحة أو يُظهر عقدة فارغة
 * (القاعدة الرابعة في عقد المرحلة).
 */

const hasEnv = () =>
  Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);

type PageRow = {
  id: string;
  slug: string;
  kind: Page["kind"];
  title: string;
  meta: Page["meta"] | null;
  published: boolean;
  sort: number;
};

type SectionRow = {
  id: string;
  page_id: string;
  type: Section["type"];
  content: Record<string, unknown>;
  sort: number;
  visible: boolean;
};

function mapPage(row: PageRow, sections: SectionRow[]): PageWithSections {
  return {
    id: row.id,
    slug: row.slug,
    kind: row.kind,
    title: row.title,
    meta: row.meta ?? { title: null, description: null },
    published: row.published,
    sort: row.sort,
    sections: sections
      .filter((s) => s.page_id === row.id)
      .sort((a, b) => a.sort - b.sort)
      .map((s) => ({
        id: s.id,
        pageId: s.page_id,
        type: s.type,
        content: s.content as Section["content"],
        sort: s.sort,
        visible: s.visible,
      })),
  };
}

async function loadDefaults(): Promise<PageWithSections[]> {
  const { DEFAULT_PAGES } = await import("@/lib/default-content");
  return DEFAULT_PAGES;
}

/* ------------------------------------------------------------------ */
/* دمج الترجمة فوق العربي                                               */
/* ------------------------------------------------------------------ */

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * يدمج قيمة مترجمة فوق القيمة العربية **بشكل العربية**:
 * النص غير الفارغ يُستبدل، وما عداه يبقى كما هو. الشكل لا يتغيّر أبداً — لا
 * مفاتيح جديدة ولا عناصر إضافية من طرف الترجمة.
 */
export function mergeLocalized<T>(base: T, localized: unknown): T {
  if (typeof base === "string") {
    return (typeof localized === "string" && localized.trim().length > 0
      ? localized
      : base) as T;
  }
  if (Array.isArray(base)) {
    if (!Array.isArray(localized)) return base;
    return base.map((item, index) => mergeLocalized(item, localized[index])) as T;
  }
  if (isPlainObject(base)) {
    if (!isPlainObject(localized)) return base;
    const out: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(base)) {
      out[key] = mergeLocalized(value, localized[key]);
    }
    return out as T;
  }
  return base;
}

/** صف الصفحة المترجم كما ترجعه `localized_page` — كله اختياري ودفاعي */
type LocalizedPagePayload = {
  title?: unknown;
  meta?: unknown;
  sections?: unknown;
};

/** يستخرج كائن الصفحة من رد RPC قد يكون كائناً أو مصفوفة بصف واحد */
function firstRow(data: unknown): Record<string, unknown> | null {
  if (Array.isArray(data)) return isPlainObject(data[0]) ? data[0] : null;
  return isPlainObject(data) ? data : null;
}

/** يدمج صفحة مترجمة فوق الصفحة العربية — الأقسام تُطابَق بالمعرّف لا بالترتيب */
function mergePage(base: PageWithSections, payload: unknown): PageWithSections {
  const row = firstRow(payload) as LocalizedPagePayload | null;
  if (!row) return base;

  const localizedSections = new Map<string, Record<string, unknown>>();
  if (Array.isArray(row.sections)) {
    for (const item of row.sections) {
      if (!isPlainObject(item)) continue;
      const id = typeof item.id === "string" ? item.id : null;
      if (id) localizedSections.set(id, item);
    }
  }

  return {
    ...base,
    title: mergeLocalized(base.title, row.title),
    meta: {
      title: mergeLocalized(base.meta.title, isPlainObject(row.meta) ? row.meta.title : undefined),
      description: mergeLocalized(
        base.meta.description,
        isPlainObject(row.meta) ? row.meta.description : undefined
      ),
    },
    sections: base.sections.map((section) => {
      const localized = localizedSections.get(section.id);
      if (!localized) return section;
      return {
        ...section,
        content: mergeLocalized(section.content, localized.content),
      };
    }),
  };
}

/* ------------------------------------------------------------------ */
/* التحميل                                                              */
/* ------------------------------------------------------------------ */

/** الصفحات العربية الأساس — مصدر كل احتياطي، ومُذاكَرة لكل طلب */
const loadBasePages = cache(async (): Promise<PageWithSections[]> => {
  if (!hasEnv()) return loadDefaults();
  try {
    const { createServerSupabase } = await import("@/lib/supabase/server");
    const supabase = await createServerSupabase();
    if (!supabase) return loadDefaults();

    const [pagesRes, sectionsRes] = await Promise.all([
      supabase.from("pages").select("*").eq("published", true).order("sort"),
      supabase.from("sections").select("*").eq("visible", true),
    ]);
    if (pagesRes.error || !pagesRes.data?.length) return loadDefaults();

    const sections = (sectionsRes.data ?? []) as SectionRow[];
    return (pagesRes.data as PageRow[]).map((p) => mapPage(p, sections));
  } catch {
    return loadDefaults();
  }
});

/**
 * ذاكرة قصيرة للنسخ المترجمة داخل العملية — نفس نمط `i18n/locales.ts`.
 *
 * `localized_page` تأخذ صفحة واحدة، والتذييل يحتاج قائمة الصفحات كلها؛ فبلا
 * ذاكرة يصير كل عرض لصفحة إنجليزية سبعة عشر نداءً. المسار العربي — وهو الأغلب
 * الأعم — لا يمر من هنا أصلاً، وتأخير ظهور ترجمة جديدة لا يتجاوز دقيقة.
 */
const LOCALIZED_TTL_MS = 60_000;
const localizedMemo = new Map<string, { at: number; pages: PageWithSections[] }>();

/**
 * إسقاط ذاكرة النسخ المترجمة بعد نشر ترجمة من اللوحة.
 *
 * `revalidatePath` وحده لا يكفي: هو يُبطل ذاكرة Next لا هذه الخريطة داخل
 * العملية، فكان المالك ينشر ترجمة ثم يفتح `/en` فيرى العربي دقيقةً كاملة
 * ويظن النشر لم يعمل. الإسقاط يخص العملية الجارية وحدها (كما هي حال أي ذاكرة
 * محلية على منصة بلا حالة مشتركة) — والـ TTL يبقى شبكة الأمان لبقية العمليات.
 */
export function clearContentCache(): void {
  localizedMemo.clear();
}

/**
 * الصفحات بلغة الزائر. للغة الأساس نُرجع العربي كما هو (ولا استدعاء إضافي)،
 * ولغيرها نطلب `localized_page` لكل صفحة على التوازي ثم ندمج فوق العربي.
 * أي فشل — شبكة أو دالة غير موجودة بعد — يرجع بالعربي كاملاً.
 */
const loadPages = cache(async (locale: string): Promise<PageWithSections[]> => {
  const base = await loadBasePages();
  if (locale === DEFAULT_LOCALE || !hasEnv()) return base;

  const cached = localizedMemo.get(locale);
  if (cached && Date.now() - cached.at < LOCALIZED_TTL_MS) return cached.pages;

  try {
    const { createServerSupabase } = await import("@/lib/supabase/server");
    const supabase = await createServerSupabase();
    if (!supabase) return base;

    const results = await Promise.all(
      base.map(async (page) => {
        const { data, error } = await supabase.rpc("localized_page", {
          p_slug: page.slug,
          p_locale: locale,
        });
        if (error) return page;
        return mergePage(page, data);
      })
    );
    localizedMemo.set(locale, { at: Date.now(), pages: results });
    return results;
  } catch {
    return base;
  }
});

/** يُطبّع اللغة الواصلة من الصفحات — الفراغ يعني الأساس */
function normalize(locale?: string | null): string {
  const value = (locale ?? "").trim().toLowerCase();
  return value.length > 0 ? value : DEFAULT_LOCALE;
}

/** كل الصفحات المنشورة بأقسامها — للـ sitemap والقوائم */
export async function getPublishedPages(locale?: string): Promise<PageWithSections[]> {
  return loadPages(normalize(locale));
}

/** صفحة منشورة واحدة بأقسامها المرئية — null إن لم توجد */
export async function getPageBySlug(
  slug: string,
  locale?: string
): Promise<PageWithSections | null> {
  const pages = await loadPages(normalize(locale));
  return pages.find((p) => p.slug === slug) ?? null;
}

/** صفحات نوع معين (خدمات/مسارات) — للقوائم والفهارس */
export async function getPagesByKind(
  kind: Page["kind"],
  locale?: string
): Promise<PageWithSections[]> {
  const pages = await loadPages(normalize(locale));
  return pages.filter((p) => p.kind === kind).sort((a, b) => a.sort - b.sort);
}
