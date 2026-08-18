import { parseSubscription } from "@/app/api/push/_shared";
import { customerGate, errorJson, NO_STORE } from "@/app/api/push/customer/_guard";
import { isSchemaMissing } from "@/lib/supabase/schema-errors";

/**
 * POST /api/push/customer/subscribe — تسجيلُ جهازِ العميل على **حجزه**.
 *
 * الجسم: `{ token, endpoint, keys: { p256dh, auth }, userAgent? }`
 *
 * ── الكتابةُ عبر الدالة لا عبر الجدول ──────────────────────────────────────
 *
 * `customer_register_push` هي المكتوبة في `0131`، وهي التي تتحقق من التوكن
 * وتتصرّف في التصادم على `(booking_id, endpoint)`: **الجهازُ نفسُه على الحجز
 * نفسه يُحدَّث ولا يُكرَّر**، وعلى حجزٍ آخر يُنشئ صفاً ثانياً — فمتصفحٌ واحد
 * يتابع حجزين. وإدراجٌ مباشرٌ من هنا كان يحتاج نسخةً ثانية من ذلك القرار.
 *
 * 🔒 ولا يخرج من هذا المسار شيءٌ يقول إن التوكن قائمٌ أو لا: الفشلُ رمزٌ واحد.
 */

export const runtime = "nodejs";

export async function POST(request: Request): Promise<Response> {
  const gate = await customerGate(request, "subscribe");
  if (!gate.ok) return gate.response;

  const subscription = parseSubscription(gate.body);
  if (!subscription) return errorJson("invalid", 400);

  const { data, error } = await gate.supabase.rpc("customer_register_push", {
    p_token: gate.token,
    p_endpoint: subscription.endpoint,
    p_p256dh: subscription.p256dh,
    p_auth: subscription.auth,
    p_agent: subscription.userAgent,
  });

  if (error) {
    if (isSchemaMissing(error)) return errorJson("schema", 503);
    // الدالةُ ترمي على توكنٍ لا يطابق حجزاً — ورمزُه `invalid` لا `save`،
    // فالواجهةُ تقول «انتهت صلاحية الرابط» بدل «تعذّر الحفظ».
    if (typeof error.message === "string" && error.message.includes("رابطُ متابعةِ الحجز")) {
      return errorJson("invalid", 400);
    }
    return errorJson("save", 500);
  }

  const id = typeof data === "string" ? data : null;
  if (!id) return errorJson("save", 500);

  return Response.json({ ok: true }, { headers: NO_STORE });
}
