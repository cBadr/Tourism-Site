import type { SupabaseClient } from "@supabase/supabase-js";

import type { PageKind } from "@/lib/content-types";
import {
  REDIRECT_STATUS_CODES,
  isMissingRelation,
  type RedirectStatus,
} from "@/lib/seo/redirects";
import { pagePublicPath } from "@/lib/seo/site-paths";
import type { RedirectRecord } from "@/lib/seo/validate";

/**
 * قراءة مدير التحويلات — تشترك فيها الشاشة والإجراءات معاً.
 *
 * تُقرأ عبر عميل Supabase الخادمي (لا REST المباشر الذي يستعمله الوسيط): هنا
 * جلسة المشرف حاضرة وRLS سارية، فتظهر الصفوف المعطّلة أيضاً — والوسيط لا يرى
 * إلا المفعّلة لأن سياسة `anon` تقصره عليها.
 */

export type RedirectsLoad = {
  rows: RedirectRecord[];
  /** جدول `redirects` غير موجود بعد — الهجرة لم تُنفَّذ */
  missingTable: boolean;
  /** خطأ آخر في القراءة (صلاحيات أو شبكة) */
  failed: boolean;
};

type RedirectRow = {
  id: unknown;
  from_path: unknown;
  to_path: unknown;
  status_code: unknown;
  enabled: unknown;
  note: unknown;
};

function mapRow(row: RedirectRow): RedirectRecord | null {
  if (typeof row.id !== "string") return null;
  if (typeof row.from_path !== "string" || typeof row.to_path !== "string") return null;

  const status = Number(row.status_code);
  return {
    id: row.id,
    fromPath: row.from_path,
    toPath: row.to_path,
    statusCode: (REDIRECT_STATUS_CODES as readonly number[]).includes(status)
      ? (status as RedirectStatus)
      : 301,
    enabled: row.enabled === true,
    note: typeof row.note === "string" && row.note.trim() !== "" ? row.note : null,
  };
}

export async function loadRedirects(supabase: SupabaseClient): Promise<RedirectsLoad> {
  const res = await supabase
    .from("redirects")
    .select("id, from_path, to_path, status_code, enabled, note")
    .order("from_path");

  if (res.error) {
    return {
      rows: [],
      missingTable: isMissingRelation(res.error.code),
      failed: !isMissingRelation(res.error.code),
    };
  }

  const rows = ((res.data ?? []) as RedirectRow[])
    .map(mapRow)
    .filter((row): row is RedirectRecord => row !== null);

  return { rows, missingTable: false, failed: false };
}

/**
 * مسارات كل صفحات `pages` العامة — **المنشورة والمسودة معاً**.
 * المسودة مقصودة: تحويل يبتلع مسار مسودة عيب نائم لا يظهر إلا لحظة نشرها.
 * الفشل هنا لا يوقف الحفظ بل يُضيّق التحقق إلى مسارات `app/` وحدها؛ ولذلك
 * تُعامل نتيجته على أنها «ما نعرفه» لا «كل ما هو موجود».
 */
export async function loadPagePaths(supabase: SupabaseClient): Promise<string[]> {
  const res = await supabase.from("pages").select("kind, slug");
  if (res.error || !res.data) return [];

  return (res.data as { kind: PageKind; slug: string }[]).map((row) =>
    pagePublicPath(row.kind, row.slug)
  );
}
