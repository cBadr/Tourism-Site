"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { createServerSupabase } from "@/lib/supabase/server";
import type { BuilderBlock } from "@/lib/page-builder-types";
import { importTemplate } from "@/lib/page-builder/template";
import {
  blocksToSections,
  readSnapshot,
  stampContentVersion,
  validateBlocks,
  validatePlacement,
} from "@/lib/page-builder/snapshot";

/**
 * إجراءات المنشئ — على اتفاقية المشروع: أربع خطوات بالترتيب، والحالة تسافر
 * **رمزاً** في الـ query string والشاشة تترجمه (‏`handover/CONVENTIONS.md` §٤).
 *
 * ── ثلاثة أشياء تخصّ هذا الملف بعينه ───────────────────────────────────────
 *
 * (١) 🔴 **الحفظ كتابةٌ واحدة لا سلسلة** (‏**D-48**: كل نداء PostgREST معاملة
 *     واحدة). اللقطة كائنٌ واحد في عمود `jsonb` واحد، فإعادة ترتيب عشرين كتلة
 *     وتعديل ثلاثة نصوص وحذف كتلة تصل كلها في `update` واحد — ينجح كاملاً أو
 *     يفشل كاملاً. ولو كانت الواجهة تكتب `sections` صفاً صفاً لكان انقطاع
 *     الشبكة في المنتصف يترك الصفحة بنصف ترتيبٍ جديد ونصف قديم.
 *
 * (٢) 🔒 **التزامن يُحرَس بعدّاد داخل اللقطة** (`snapshot.rev`): الحفظ يشترط
 *     العدّاد المقروء في `where`، فصفر صفوف = سبقك تبويبٌ آخر ⇒ `stale-revision`
 *     ولا يُمحى عمله. التفصيل الكامل ومبرر عدم إضافة عمود في
 *     `lib/page-builder/snapshot.ts`.
 *
 * (٣) **الصلاحية تُسأل من القاعدة في كل إجراء** لا تُورَّث من الشاشة: الشاشة
 *     تُخفي الأزرار عن `ops` (العقد §٩)، وهذا يمنعه من الكتابة أصلاً — فلا
 *     يصطدم بفخ «صفر صفوف بلا خطأ» ولا يضيع عمله.
 */

const builderUrl = (pageId: string, qs?: string) =>
  qs ? `/admin/content/${pageId}/builder?${qs}` : `/admin/content/${pageId}/builder`;

/** رمز الخطأ الذي يبعثه الحارس داخل الدالة يصل في `hint` (قناة المشروع المعتمدة) */
function codeFromError(error: { hint?: string | null; code?: string | null } | null): string {
  if (!error) return "save";
  if (typeof error.hint === "string" && error.hint !== "") return error.hint;
  if (error.code === "23505") return "stale-revision";
  return "save";
}

async function requireEditor(): Promise<
  { ok: true; supabase: NonNullable<Awaited<ReturnType<typeof createServerSupabase>>> } | { ok: false; code: string }
> {
  const supabase = await createServerSupabase();
  if (!supabase) return { ok: false, code: "env" };
  const access = await supabase.rpc("builder_access");
  if (access.error) return { ok: false, code: "forbidden" };
  if (access.data !== "edit") return { ok: false, code: "forbidden" };
  return { ok: true, supabase };
}

/** ختم `style._v` على الشجرة كلها — الشقّ التنفيذي من العقد §٥ */
function stampBlocks(blocks: readonly BuilderBlock[]): BuilderBlock[] {
  return blocks.map((block) => ({
    ...block,
    content: stampContentVersion(block.content ?? {}),
    children: stampBlocks(block.children ?? []),
  }));
}

function parseBlocks(raw: FormDataEntryValue | null): BuilderBlock[] | null {
  if (typeof raw !== "string" || raw === "") return null;
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return null;
    return parsed as BuilderBlock[];
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// حفظ المسودة
// ---------------------------------------------------------------------------

export async function saveDraft(pageId: string, formData: FormData) {
  const guard = await requireEditor();
  if (!guard.ok) redirect(builderUrl(pageId, `error=${guard.code}`));
  const supabase = guard.supabase;

  const blocks = parseBlocks(formData.get("blocks"));
  if (!blocks) redirect(builderUrl(pageId, "error=template-shape"));

  const pageRes = await supabase.from("pages").select("kind, slug, title").eq("id", pageId).maybeSingle();
  if (pageRes.error || !pageRes.data) redirect(builderUrl(pageId, "error=not-found"));
  const page = pageRes.data as { kind: string; slug: string; title: string };

  const shapeError = validateBlocks(blocks) ?? validatePlacement(blocks, page.kind);
  if (shapeError) redirect(builderUrl(pageId, `error=${shapeError}`));

  // ختم إصدار الشكل على كل كتلة يكتبها المنشئ (العقد §٥) — يجعل أي ترحيلٍ لاحق
  // لشكل `content` قابلاً للتمييز بلا تخمين، ويكلّف مفتاحاً واحداً في `style`.
  const stamped = stampBlocks(blocks);

  const revisionId = typeof formData.get("revisionId") === "string" ? String(formData.get("revisionId")) : "";
  const expectedRev = Number(formData.get("rev") ?? 0);
  const nextRev = (Number.isFinite(expectedRev) ? expectedRev : 0) + 1;

  const snapshot = {
    page: { id: pageId, slug: page.slug, kind: page.kind, title: page.title },
    sections: blocksToSections(stamped, pageId),
    rev: nextRev,
  };

  if (revisionId === "") {
    // أول حفظ على هذه الصفحة — لا مسودة مفتوحة بعد.
    // 🔒 والفهرس الفريد الجزئي (مسودة واحدة لكل صفحة) هو ما يجعل السباق مكشوفاً:
    //    تبويبٌ آخر أنشأها قبلنا ⇒ 23505 ⇒ `stale-revision`، لا مسودتان.
    const { data: userData } = await supabase.auth.getUser();
    const res = await supabase
      .from("page_revisions")
      .insert({
        page_id: pageId,
        status: "draft",
        snapshot,
        created_by: userData.user?.id ?? null,
      })
      .select("id");
    if (res.error || !res.data || res.data.length === 0)
      redirect(builderUrl(pageId, `error=${codeFromError(res.error)}`));
    redirect(builderUrl(pageId, "saved=1"));
  }

  // 🔒 المقارنة والاستبدال في نداءٍ واحد — لا قراءة ثم كتابة (لكانت نافذةَ سباق)
  const res = await supabase
    .from("page_revisions")
    .update({ snapshot })
    .eq("id", revisionId)
    .eq("page_id", pageId)
    .eq("status", "draft")
    .eq("snapshot->>rev", String(expectedRev))
    .select("id");

  if (res.error) redirect(builderUrl(pageId, `error=${codeFromError(res.error)}`));
  if (!res.data || res.data.length === 0) redirect(builderUrl(pageId, "error=stale-revision"));

  redirect(builderUrl(pageId, "saved=1"));
}

// ---------------------------------------------------------------------------
// النشر
// ---------------------------------------------------------------------------

export async function publishDraft(pageId: string, formData: FormData) {
  const guard = await requireEditor();
  if (!guard.ok) redirect(builderUrl(pageId, `error=${guard.code}`));
  const supabase = guard.supabase;

  const revisionId = typeof formData.get("revisionId") === "string" ? String(formData.get("revisionId")) : "";
  if (revisionId === "") redirect(builderUrl(pageId, "error=stale-revision"));

  // نداءٌ واحد = معاملة واحدة: البوابة والقفل والفرق والنشر داخل الدالة نفسها
  const res = await supabase.rpc("publish_page_revision", {
    p_page: pageId,
    p_revision: revisionId,
  });
  if (res.error) redirect(builderUrl(pageId, `error=${codeFromError(res.error)}`));

  const result = (res.data ?? {}) as {
    updated?: number;
    inserted?: number;
    deleted?: number;
    keptSectionIds?: string[];
  };

  // المحتوى يظهر في الموقع كله (القوائم وخريطة الموقع أيضاً) فيُبطَل الجذر
  revalidatePath("/", "layout");
  redirect(
    builderUrl(
      pageId,
      `published=1&u=${result.updated ?? 0}&i=${result.inserted ?? 0}&d=${result.deleted ?? 0}`
    )
  );
}

// ---------------------------------------------------------------------------
// إسقاط المسودة — والعودة إلى المنشور الحيّ
// ---------------------------------------------------------------------------

export async function discardDraft(pageId: string, formData: FormData) {
  const guard = await requireEditor();
  if (!guard.ok) redirect(builderUrl(pageId, `error=${guard.code}`));
  const supabase = guard.supabase;

  const revisionId = typeof formData.get("revisionId") === "string" ? String(formData.get("revisionId")) : "";
  if (revisionId === "") redirect(builderUrl(pageId));

  const res = await supabase
    .from("page_revisions")
    .delete()
    .eq("id", revisionId)
    .eq("page_id", pageId)
    .eq("status", "draft")
    .select("id");
  if (res.error || !res.data || res.data.length === 0)
    redirect(builderUrl(pageId, `error=${codeFromError(res.error)}`));

  redirect(builderUrl(pageId, "discarded=1"));
}

// ---------------------------------------------------------------------------
// بيانات الصفحة — **تُحفظ فوراً وليست جزءاً من المسودة**
//
// السبب ليس اختصاراً: `page_publish_blockers` تقرأ `pages.title` و
// `pages.meta->>description` من **الصف الحيّ** لا من اللقطة. فلو عاشا في
// المسودة لبقي المانعان `empty-title` و`no-meta-description` قائمين مهما كتب
// المالك — ولا شيء في الشاشة يفسّر له لماذا.
// ---------------------------------------------------------------------------

export async function savePageMeta(pageId: string, formData: FormData) {
  const guard = await requireEditor();
  if (!guard.ok) redirect(builderUrl(pageId, `error=${guard.code}`));
  const supabase = guard.supabase;

  const read = (name: string): string | null => {
    const v = formData.get(name);
    return typeof v === "string" && v.trim() !== "" ? v.trim() : null;
  };

  const title = read("title");
  if (!title) redirect(builderUrl(pageId, "error=title"));

  // 🔒 القراءة قبل الكتابة — `pages.meta` عمود jsonb يُستبدل كاملاً، وفيه مقابض
  //    مركز السيو (`noindex` · `excludeFromSitemap` · `ogImageUrl` · `canonicalPath`).
  //    كتابته من مفتاحين يمحو الباقي صامتاً — عيبٌ أمسكته المراجعة في محرر
  //    المحتوى القديم، ولا يُعاد هنا.
  const existing = await supabase.from("pages").select("meta").eq("id", pageId).maybeSingle();
  if (existing.error) redirect(builderUrl(pageId, "error=save"));

  const meta = {
    ...((existing.data?.meta as Record<string, unknown> | null) ?? {}),
    description: read("metaDescription"),
  };

  /**
   * ⚠ **حالة نشر الصفحة نفسها تُدار من هنا** — ولها سببٌ مقيس:
   * `publish_page_revision` تنشر **الكتل** ولا تلمس `pages.published` بقصد (نشرُ
   * تعديلٍ على صفحةٍ أخفاها المالك عمداً لا يجوز أن يعيدها للويب). فلو لم يوجد
   * هذا المفتاح هنا لكان المالك ينشر لقطته ويرى «نُشرت» ثم يفتح الرابط فيجد
   * ٤٠٤ — من غير أن يقول له شيءٌ أن الصفحة نفسها ما زالت مسودة.
   */
  const published = formData.get("published") != null;

  const res = await supabase
    .from("pages")
    .update({ title, meta, published })
    .eq("id", pageId)
    .select("id");
  if (res.error || !res.data || res.data.length === 0)
    redirect(builderUrl(pageId, `error=${codeFromError(res.error)}`));

  revalidatePath("/", "layout");
  redirect(builderUrl(pageId, "saved=1"));
}

// ---------------------------------------------------------------------------
// استيراد قالب — يستبدل مسودة الصفحة بالكامل بعد **إعادة سكّ كل المفاتيح**
// ---------------------------------------------------------------------------

export async function importTemplateIntoPage(pageId: string, formData: FormData) {
  const guard = await requireEditor();
  if (!guard.ok) redirect(builderUrl(pageId, `error=${guard.code}`));
  const supabase = guard.supabase;

  const raw = formData.get("template");
  if (typeof raw !== "string" || raw.trim() === "")
    redirect(builderUrl(pageId, "error=template-shape"));

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    redirect(builderUrl(pageId, "error=template-shape"));
  }

  const result = importTemplate(parsed, pageId);
  if (!result.ok) redirect(builderUrl(pageId, `error=${result.code}`));

  const pageRes = await supabase.from("pages").select("kind, slug, title").eq("id", pageId).maybeSingle();
  if (pageRes.error || !pageRes.data) redirect(builderUrl(pageId, "error=not-found"));
  const page = pageRes.data as { kind: string; slug: string; title: string };

  const shapeError = validateBlocks(result.blocks) ?? validatePlacement(result.blocks, page.kind);
  if (shapeError) redirect(builderUrl(pageId, `error=${shapeError}`));

  const existingDraft = await supabase
    .from("page_revisions")
    .select("id, snapshot")
    .eq("page_id", pageId)
    .eq("status", "draft")
    .maybeSingle();
  if (existingDraft.error) redirect(builderUrl(pageId, "error=save"));

  const currentRev = existingDraft.data
    ? readSnapshot(existingDraft.data.snapshot, pageId).rev
    : 0;

  const snapshot = {
    page: { id: pageId, slug: page.slug, kind: page.kind, title: page.title },
    sections: blocksToSections(result.blocks, pageId),
    rev: currentRev + 1,
  };

  if (!existingDraft.data) {
    const { data: userData } = await supabase.auth.getUser();
    const res = await supabase
      .from("page_revisions")
      .insert({ page_id: pageId, status: "draft", snapshot, created_by: userData.user?.id ?? null })
      .select("id");
    if (res.error || !res.data || res.data.length === 0)
      redirect(builderUrl(pageId, `error=${codeFromError(res.error)}`));
  } else {
    const res = await supabase
      .from("page_revisions")
      .update({ snapshot })
      .eq("id", existingDraft.data.id)
      .eq("snapshot->>rev", String(currentRev))
      .select("id");
    if (res.error) redirect(builderUrl(pageId, `error=${codeFromError(res.error)}`));
    if (!res.data || res.data.length === 0) redirect(builderUrl(pageId, "error=stale-revision"));
  }

  redirect(builderUrl(pageId, "imported=1"));
}
