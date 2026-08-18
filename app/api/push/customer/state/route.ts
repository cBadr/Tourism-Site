import { customerGate, errorJson, NO_STORE } from "@/app/api/push/customer/_guard";
import { isSchemaMissing } from "@/lib/supabase/schema-errors";

/**
 * POST /api/push/customer/state — هل **هذا الجهاز** مشترَكٌ في هذا الحجز؟
 *
 * الجسم: `{ token, endpoint }` · الجواب: `{ ok: true, registered: boolean }`
 *
 * ── لماذا POST لا GET ──────────────────────────────────────────────────────
 *
 * لأن المعاملين سرّان تشغيليان: التوكنُ مفتاحُ صفحة الحجز، و`endpoint` **معرّفٌ
 * ومفتاحٌ معاً** (‏القيد ٢ في `lib/push/types.ts`: من يملكه يرسل إلى الجهاز).
 * ووضعُهما في سلسلة الاستعلام يضعهما في سجلّات الوسطاء وفي تاريخ المتصفح.
 *
 * ⚠ والمقصودُ منه أن يعرف الزرُّ حالتَه **من الخادم** لا من `localStorage`:
 *   جهازٌ ألغى المستخدمُ تصريحَه من إعدادات المتصفح يبقى صفُّه في القاعدة إلى
 *   أن تكنسه دورةُ تسليمٍ فاشلة، فحالةُ الزرّ تُقرأ من مصدرٍ واحد لا اثنين.
 */

export const runtime = "nodejs";

export async function POST(request: Request): Promise<Response> {
  const gate = await customerGate(request, "state");
  if (!gate.ok) return gate.response;

  const endpoint = typeof gate.body.endpoint === "string" ? gate.body.endpoint.trim() : "";
  if (endpoint === "") return errorJson("invalid", 400);

  const { data, error } = await gate.supabase.rpc("customer_push_registered", {
    p_token: gate.token,
    p_endpoint: endpoint,
  });

  if (error) {
    if (isSchemaMissing(error)) return errorJson("schema", 503);
    return errorJson("save", 500);
  }

  return Response.json({ ok: true, registered: data === true }, { headers: NO_STORE });
}
