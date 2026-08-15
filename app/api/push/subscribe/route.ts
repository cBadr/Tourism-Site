import { errorJson, guard, NO_STORE, parseSubscription, readJson } from "@/app/api/push/_shared";
import { isSchemaMissing } from "@/lib/supabase/schema-errors";

/**
 * POST /api/push/subscribe — تسجيل جهازٍ في `partner_push_subscriptions`.
 *
 * ── لماذا مسار API لا server action ────────────────────────────────────────
 *
 * لأن له منادياً ثانياً لا يملك شجرة تصيير: **عامل الخدمة** في
 * `pushsubscriptionchange` (‏`public/sw.js`) — حدثٌ يقع والصفحة مغلقة تماماً،
 * حين تُبطل خدمةُ الدفع عنوانَ الجهاز وتعطيه بديلاً. وبلا مسارٍ يناديه العامل
 * تموت القناة صامتة: يبقى في القاعدة صفٌّ لعنوانٍ مبطَل، فيُعدّ صاحبه «بالغاً»
 * ولا يصله شيء.
 *
 * ── والكتابة عبر الدالة لا عبر الجدول ──────────────────────────────────────
 *
 * `portal_register_push` هي المكتوبة في `0054`، وتتصرّف في التصادم على
 * `endpoint` تصرّفاً مقصوداً: **جهازٌ انتقل إلى حسابٍ آخر يتبع صاحبه الجديد**
 * ولا يبقى معلَّقاً على القديم (متعهدٌ سلّم هاتفه لموظّفه مثلاً). وإدراجٌ مباشر
 * من هنا كان سيفشل بتصادم مفتاحٍ فريد ويترك الجهاز يرنّ لصاحبه السابق.
 *
 * وللمتعهد `insert` على الجدول ولا `update` (‏`0055`) — فالمسار الوحيد للتحديث
 * هو هذه الدالة، ولا يستطيع أحد تحويل اشتراكٍ قائم إلى نفسه بكتابةٍ مباشرة.
 */

export const runtime = "nodejs";

/** الاشتراك حدثٌ نادر بطبعه: مرةٌ لكل جهاز، وتجديدٌ كل بضعة أشهر */
const MAX_PER_MINUTE = 10;

export async function POST(request: Request): Promise<Response> {
  const gate = await guard(MAX_PER_MINUTE, "subscribe");
  if (!gate.ok) return gate.response;

  const body = await readJson(request);
  if (!body) return errorJson("invalid", 400);

  const subscription = parseSubscription(body);
  if (!subscription) return errorJson("invalid", 400);

  const { data, error } = await gate.access.supabase.rpc("portal_register_push", {
    p_endpoint: subscription.endpoint,
    p_p256dh: subscription.p256dh,
    p_auth: subscription.auth,
    p_agent: subscription.userAgent,
  });

  if (error) {
    if (isSchemaMissing(error)) return errorJson("schema", 503);
    return errorJson("save", 500);
  }

  // الدالة تُرجع معرّف الصف؛ وغيابه يعني كتابةً لم تحدث رغم غياب الخطأ
  const id = typeof data === "string" ? data : null;
  if (!id) return errorJson("save", 500);

  return Response.json({ ok: true, id }, { headers: NO_STORE });
}
