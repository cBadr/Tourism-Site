import { errorJson, guard, NO_STORE, readJson } from "@/app/api/push/_shared";
import { isSchemaMissing } from "@/lib/supabase/schema-errors";

/**
 * POST /api/push/unsubscribe — إزالة جهاز.
 *
 * ── مدخلان لأن للإزالة سياقين مختلفين ──────────────────────────────────────
 *
 * - `{ id }` — من قائمة الأجهزة في البورتال: «هذا هاتفٌ لم أعد أستعمله».
 *   والمعرّف هو ما تعرضه `portal_push_devices()` (وهي لا تُخرج `endpoint` أبداً).
 * - `{ endpoint }` — من الجهاز نفسه وهو يُلغي اشتراكه: المتصفح يعرف عنوانه ولا
 *   يعرف معرّفنا. **والعنوان لا يُطابَق إلا داخل صفوف صاحب الجلسة** (سياسة
 *   `partner_push_select_own_or_admin`)، فلا يصلح مسباراً لاشتراكات غيره.
 *
 * ── والحذف يمرّ بالدالة لا بالجدول ─────────────────────────────────────────
 *
 * `portal_remove_push` تشترط `subcontractor_id = current_subcontractor_id()`
 * داخلها، وترجع `false` حين لا تُصاب صفوف — وهو **فخّ الصفر صفوف** الذي تنصّ
 * عليه اتفاقية ٤: «نجاحٌ» بلا كتابة يعني رفضاً من RLS لا نجاحاً.
 *
 * 🔒 **والإزالة من الخادم لا تُلغي التصريح على الجهاز**، والعكس كذلك. فالشاشة
 * تفعل الاثنين معاً (`push-setup.tsx`)، وهذا المسار يفعل نصفه الخادمي فقط.
 */

export const runtime = "nodejs";

const MAX_PER_MINUTE = 15;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function POST(request: Request): Promise<Response> {
  const gate = await guard(MAX_PER_MINUTE, "unsubscribe");
  if (!gate.ok) return gate.response;

  const body = await readJson(request);
  if (!body) return errorJson("invalid", 400);

  const supabase = gate.access.supabase;
  let id = typeof body.id === "string" && UUID.test(body.id.trim()) ? body.id.trim() : null;

  if (!id) {
    const endpoint = typeof body.endpoint === "string" ? body.endpoint.trim() : "";
    if (endpoint === "" || endpoint.length > 1000) return errorJson("invalid", 400);

    // البحث بالعنوان داخل صفوف صاحب الجلسة وحدها — RLS هي الحدّ، لا شرطٌ نكتبه
    const found = await supabase
      .from("partner_push_subscriptions")
      .select("id")
      .eq("endpoint", endpoint)
      .limit(1);

    if (found.error) {
      return isSchemaMissing(found.error) ? errorJson("schema", 503) : errorJson("save", 500);
    }
    const row = found.data?.[0] as { id?: string } | undefined;
    // جهازٌ غير مسجَّل عندنا أصلاً: النتيجة المطلوبة تحقّقت، فلا خطأ
    if (!row?.id) return Response.json({ ok: true, removed: false }, { headers: NO_STORE });
    id = row.id;
  }

  const { data, error } = await supabase.rpc("portal_remove_push", { p_id: id });
  if (error) {
    return isSchemaMissing(error) ? errorJson("schema", 503) : errorJson("save", 500);
  }

  return Response.json({ ok: true, removed: data === true }, { headers: NO_STORE });
}
