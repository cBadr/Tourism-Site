import "server-only";

import { cache } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";

import { createServerSupabase } from "@/lib/supabase/server";
import type { BuilderAccess, BuilderBlock } from "@/lib/page-builder-types";
import { readSnapshot, sectionsToBlocks, type SnapshotSection } from "./snapshot";

/**
 * قراءة صفحةٍ للمنشئ — **كل الأحكام تُقرأ من القاعدة**، ولا شيء يُستنتج هنا:
 * الصلاحية من `builder_access()`، وفرقُ المسودة عن المنشور من
 * `page_has_unpublished_changes()`، وموانع النشر من `page_publish_blockers()`.
 *
 * ⚠ ولماذا `builder_revisions()` بدل `select` على `page_revisions`؟ لأن سياسة
 * الجدول `is_admin()` في الاتجاهات الأربعة، فدور `ops` — الذي يفتح المنشئ
 * للقراءة بحكم العقد §٩ — كان سيحصل على **صفر صفوف بلا خطأ** ويرى شاشةً تقول
 * «لا مسودة» وهي كاذبة. والدالتان `definer` بإسقاطٍ مُدرَج لهذا الغرض بعينه.
 */

export type BuilderRevisionRow = {
  id: string;
  status: string;
  created_by: string | null;
  created_by_name: string | null;
  created_at: string;
  published_at: string | null;
};

export type BuilderPageData = {
  id: string;
  slug: string;
  kind: string;
  title: string;
  metaDescription: string | null;
  published: boolean;
  access: BuilderAccess;
  /** اللقطة المفتوحة للتحرير — `null` = لا مسودة، والمعروض هو المنشور الحيّ */
  draftRevisionId: string | null;
  /** عدّاد التزامن المقروء مع اللقطة — يُعاد إرساله مع الحفظ (تفصيله في snapshot.ts) */
  draftRev: number;
  hasUnpublishedChanges: boolean;
  blocks: BuilderBlock[];
  /** موانع النشر كما تراها القاعدة على **ما سيُنشر** (اللقطة إن وُجدت) */
  blockers: string[];
  revisions: BuilderRevisionRow[];
};

type PageRow = {
  id: string;
  slug: string;
  kind: string;
  title: string;
  meta: Record<string, unknown> | null;
  published: boolean;
};

async function liveSections(
  supabase: SupabaseClient,
  pageId: string
): Promise<SnapshotSection[]> {
  const res = await supabase
    .from("sections")
    .select("id, page_id, parent_id, type, content, sort, visible, block_key")
    .eq("page_id", pageId)
    .order("sort");
  if (res.error || !res.data) return [];
  return res.data as SnapshotSection[];
}

export const readBuilderPage = cache(async (pageId: string): Promise<BuilderPageData | null> => {
  const supabase = await createServerSupabase();
  if (!supabase) return null;

  const pageRes = await supabase
    .from("pages")
    .select("id, slug, kind, title, meta, published")
    .eq("id", pageId)
    .maybeSingle();
  if (pageRes.error || !pageRes.data) return null;
  const page = pageRes.data as PageRow;

  const accessRes = await supabase.rpc("builder_access");
  const access: BuilderAccess =
    accessRes.data === "edit" || accessRes.data === "read-only" ? accessRes.data : "denied";

  if (access === "denied") {
    return {
      id: page.id,
      slug: page.slug,
      kind: page.kind,
      title: page.title,
      metaDescription: null,
      published: page.published,
      access,
      draftRevisionId: null,
      draftRev: 0,
      hasUnpublishedChanges: false,
      blocks: [],
      blockers: [],
      revisions: [],
    };
  }

  const revisionsRes = await supabase.rpc("builder_revisions", { p_page: pageId });
  const revisions = (revisionsRes.data ?? []) as BuilderRevisionRow[];
  const draft = revisions.find((r) => r.status === "draft") ?? null;

  let blocks: BuilderBlock[] = [];
  let draftRev = 0;

  if (draft) {
    const snapRes = await supabase.rpc("builder_revision_snapshot", { p_revision: draft.id });
    const parsed = readSnapshot(snapRes.data, pageId);
    blocks = sectionsToBlocks(parsed.sections);
    draftRev = parsed.rev;
  } else {
    blocks = sectionsToBlocks(await liveSections(supabase, pageId));
  }

  const [changesRes, blockersRes] = await Promise.all([
    supabase.rpc("page_has_unpublished_changes", { p_page: pageId }),
    supabase.rpc("page_publish_blockers", { p_page: pageId, p_revision: draft?.id ?? null }),
  ]);

  // ⚠ الموانع تصل كصفوف نصّية من `setof text` — والفشل يُعرض مانعاً مسمّى لا
  //   قائمةً فارغة، وإلا بدا زر النشر متاحاً بينما القاعدة سترفضه.
  const blockers: string[] = blockersRes.error
    ? ["read-failed"]
    : ((blockersRes.data ?? []) as unknown[])
        .map((row) => (typeof row === "string" ? row : ((row as { code?: string })?.code ?? "")))
        .filter((code): code is string => code !== "");

  const metaDescription =
    typeof page.meta?.description === "string" ? (page.meta.description as string) : null;

  return {
    id: page.id,
    slug: page.slug,
    kind: page.kind,
    title: page.title,
    metaDescription,
    published: page.published,
    access,
    draftRevisionId: draft?.id ?? null,
    draftRev,
    hasUnpublishedChanges: changesRes.data === true,
    blocks,
    blockers,
    revisions,
  };
});

/**
 * الكتل التي تُعرض في المعاينة — المسودة إن وُجدت وإلا المنشور الحيّ.
 * تُقرأ مستقلةً عن `readBuilderPage` لأن شاشة المعاينة لا تحتاج الموانع ولا
 * تاريخ اللقطات، وتحميلها يعني نداءي RPC زائدين في كل فتحة.
 */
export const readPreviewBlocks = cache(
  async (pageId: string): Promise<{ page: PageRow; blocks: BuilderBlock[]; fromDraft: boolean } | null> => {
    const supabase = await createServerSupabase();
    if (!supabase) return null;

    const pageRes = await supabase
      .from("pages")
      .select("id, slug, kind, title, meta, published")
      .eq("id", pageId)
      .maybeSingle();
    if (pageRes.error || !pageRes.data) return null;
    const page = pageRes.data as PageRow;

    const accessRes = await supabase.rpc("builder_access");
    if (accessRes.data !== "edit" && accessRes.data !== "read-only") return null;

    const revisionsRes = await supabase.rpc("builder_revisions", { p_page: pageId });
    const draft = ((revisionsRes.data ?? []) as BuilderRevisionRow[]).find(
      (r) => r.status === "draft"
    );

    if (draft) {
      const snapRes = await supabase.rpc("builder_revision_snapshot", { p_revision: draft.id });
      const parsed = readSnapshot(snapRes.data, pageId);
      return { page, blocks: sectionsToBlocks(parsed.sections), fromDraft: true };
    }
    return { page, blocks: sectionsToBlocks(await liveSections(supabase, pageId)), fromDraft: false };
  }
);
