import { cache } from "react";
import type { Page, PageWithSections, Section } from "@/lib/content-types";
import { getPublishedPages } from "@/lib/content";
import { createServerSupabase } from "@/lib/supabase/server";

/**
 * مُحمّل محتوى لوحة التحكم — يقرأ *كل* الصفحات (المنشورة والمسودات) بأقسامها كلها
 * (المرئية والمخفية) عبر عميل Supabase الخادمي: المستخدم المُسجَّل يرى الكل بحسب RLS،
 * بعكس `lib/content.ts` الذي يخدم الواجهة العامة بالمحتوى المنشور فقط.
 * عند غياب البيئة أو فراغ الجداول: يرجع للمحتوى الافتراضي عبر طبقة `lib/content.ts`
 * (التي تحمّل `DEFAULT_PAGES`) مع علامة `readOnly` — فالافتراضيات ليست صفوفاً
 * حقيقية ولا يمكن حفظ تعديلات عليها.
 */

export type AdminContent = {
  pages: PageWithSections[];
  /** true = نعرض المحتوى الافتراضي للمعاينة فقط — التحرير معطّل */
  readOnly: boolean;
};

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
  /** `sections.parent_id` — كتلة الأعمدة الأمّ، أو `null` لكتلة جذر (هجرة `0058`) */
  parent_id: string | null;
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
        // يمرّ إلى الواجهة كي تميّز شاشةُ التحرير القديمة كتل الجذر من أبناء
        // كتلة الأعمدة — وبدونه كانت تعرضها كلها في مستوىً واحد وترقّم `sort`
        // فوق بعضها، فتخلط ترتيب الأعمدة بترتيب الصفحة.
        parentId: s.parent_id ?? null,
        type: s.type,
        content: s.content as Section["content"],
        sort: s.sort,
        visible: s.visible,
      })),
  };
}

async function loadDefaultsReadOnly(): Promise<AdminContent> {
  // الافتراضيات عبر طبقة المحتوى الوحيدة — لا استيراد مباشر لملف الافتراضيات من هنا
  return { pages: await getPublishedPages(), readOnly: true };
}

/** كل صفحات الموقع بأقسامها لواجهة الإدارة — مع علامة القراءة فقط عند الافتراضيات */
export const getAdminContent = cache(async (): Promise<AdminContent> => {
  if (!hasEnv()) return loadDefaultsReadOnly();
  try {
    const supabase = await createServerSupabase();
    if (!supabase) return loadDefaultsReadOnly();

    const [pagesRes, sectionsRes] = await Promise.all([
      supabase.from("pages").select("*").order("sort"),
      supabase.from("sections").select("*"),
    ]);
    // جداول فارغة أو فشل = لم تُنفَّذ migrations/seed المرحلة ٢ بعد → معاينة الافتراضيات
    if (pagesRes.error || !pagesRes.data?.length) return loadDefaultsReadOnly();

    const sections = (sectionsRes.data ?? []) as SectionRow[];
    return {
      pages: (pagesRes.data as PageRow[]).map((p) => mapPage(p, sections)),
      readOnly: false,
    };
  } catch {
    return loadDefaultsReadOnly();
  }
});

/** صفحة واحدة بمعرّفها لمحرر المحتوى — null إن لم توجد */
export const getAdminPageById = cache(
  async (id: string): Promise<{ page: PageWithSections | null; readOnly: boolean }> => {
    const { pages, readOnly } = await getAdminContent();
    return { page: pages.find((p) => p.id === id) ?? null, readOnly };
  }
);
