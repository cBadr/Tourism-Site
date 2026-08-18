import { customerGate, errorJson, NO_STORE } from "@/app/api/push/customer/_guard";
import { isSchemaMissing } from "@/lib/supabase/schema-errors";

/**
 * POST /api/push/customer/unsubscribe — إيقافُ إشعارات هذا الجهاز عن هذا الحجز.
 *
 * الجسم: `{ token, endpoint }`
 *
 * ⚠ **ولا يُلغي اشتراكَ المتصفح نفسه** (‏`PushSubscription.unsubscribe()`):
 *   المتصفحُ اشتراكُه واحدٌ لكل أصل، وقد يكون العميلُ متابعاً لحجزٍ آخر — أو
 *   متعهداً على البورتال من الجهاز نفسه. فالإلغاءُ هنا **صفُّ هذا الحجز وحده**،
 *   والمتصفحُ يبقى مشترَكاً. وهذا فرقٌ يسهل السهو عنه ويكسر قناةَ غيرِ صاحبها.
 */

export const runtime = "nodejs";

export async function POST(request: Request): Promise<Response> {
  const gate = await customerGate(request, "unsubscribe");
  if (!gate.ok) return gate.response;

  const endpoint = typeof gate.body.endpoint === "string" ? gate.body.endpoint.trim() : "";
  if (endpoint === "") return errorJson("invalid", 400);

  const { data, error } = await gate.supabase.rpc("customer_remove_push", {
    p_token: gate.token,
    p_endpoint: endpoint,
  });

  if (error) {
    if (isSchemaMissing(error)) return errorJson("schema", 503);
    return errorJson("save", 500);
  }

  // `false` ليست خطأً: جهازٌ لم يكن مسجَّلاً أصلاً نتيجتُه المطلوبة نفسُها.
  return Response.json({ ok: true, removed: data === true }, { headers: NO_STORE });
}
