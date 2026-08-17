import { createServerSupabase } from "@/lib/supabase/server";
import {
  ensureBookingRouteMap,
  readStoredRouteMap,
  routeMapEnabled,
} from "@/lib/maps/route-map";

/**
 * صورة خريطة المسار للمتعهد — `/portal/trips/map/<bookingId>`.
 *
 * ══ 🔴 حدُّ الجمهور — واحدٌ لا اثنان ═════════════════════════════════════════
 *
 * الحدّ قائمٌ في المستودع منذ `0014` و`0028`، ولم يُخترع هنا:
 *
 * | متى | ما يصل المتعهد | من يفرضه |
 * |---|---|---|
 * | **قبل القبول** | وسمٌ معمَّم بلا رقم عقار (`dispatch_public_label`) وملاحظةٌ منقّحة | `portal_offers()` |
 * | **بعد الإسناد** | الوسم الخام بعنوانه الدقيق وهاتف العميل | `portal_trips()` |
 *
 * وخريطةٌ دقيقة قبل القبول كانت **تنقض ذلك بصورةٍ بدل نصّ** — والرابط يُعاد
 * توجيهه، ولهذا قنّعت `0049` الهاتف أصلاً (‏D-19 · D-46).
 *
 * فالحارس هنا `partner_route_map_visible(uuid)` — و**جسمُه هو شرط `where` في
 * `portal_trips()` حرفاً بحرف**: مُسنَدةٌ إليه هو، وحالةُ الدورة `assigned`.
 * فلا يمكن للحدَّين أن يفترقا بتعديلٍ في أحدهما دون الآخر.
 *
 * ── وطبقةٌ بنيوية تسبق الحارس ────────────────────────────────────────────────
 *
 * `portal_offers()` **لا تُرجع `booking_id` أصلاً** — تُرجع `offer_id` وحده.
 * فالمتعهد قبل القبول لا يملك المعرّف الذي يُسأل به هذا العنوان، ولا يُخمَّن
 * (‏uuid). الحارس هو الطبقة الثانية، وغيابُ المعرّف هو الأولى.
 *
 * ── ولماذا نفس الصورة لا صورةٌ ثانية له ─────────────────────────────────────
 *
 * القيد المكتوب: **صورة واحدة لكل حجز** (الواجهة تُحاسِب على كل صورة). والمتعهد
 * بعد الإسناد يقرأ الوسمين الخامّين وهاتف العميل من `portal_trips()` بالفعل،
 * فالصورة الكاملة **داخل ما يملكه**، لا توسيعٌ له.
 */

export async function GET(
  _request: Request,
  ctx: { params: Promise<{ bookingId: string }> }
): Promise<Response> {
  const { bookingId } = await ctx.params;

  const notFound = () =>
    new Response(null, {
      status: 404,
      headers: { "cache-control": "no-store", "x-robots-tag": "noindex, nofollow" },
    });

  const id = typeof bookingId === "string" ? bookingId.trim() : "";
  if (id.length === 0) return notFound();

  // بجلسة المتعهد نفسه — لا بمفتاح الخدمة: الحارس يقرأ `current_subcontractor_id()`
  // من الجلسة، فنداءٌ بمفتاح الخدمة كان سيُجيب «نعم» لكل أحد.
  const supabase = await createServerSupabase();
  if (!supabase) return notFound();

  const { data, error } = await supabase.rpc("partner_route_map_visible", {
    p_booking_id: id,
  });
  // ⚠ الفشل مغلقاً: خطأُ نداءٍ أو قيمةٌ غير منطقية ⇒ ٤٠٤، لا «فلنفترض أنه مُسنَد»
  if (error || data !== true) return notFound();

  if (!(await routeMapEnabled())) return notFound();

  // قد يكون المتعهد أول من يفتح الخريطة (العميل لم يفتح صفحته بعد). والصفّ
  // الموجود يُنهي النداء بلا كلفة، فالصورة تبقى واحدة لكل حجز مهما تعدّد
  // من يطلبها.
  await ensureBookingRouteMap(id);

  const image = await readStoredRouteMap(id);
  if (!image) return notFound();

  return new Response(image.bytes as unknown as BodyInit, {
    status: 200,
    headers: {
      "content-type": image.contentType,
      "content-length": String(image.bytes.byteLength),
      "cache-control": "private, max-age=3600",
      "x-robots-tag": "noindex, nofollow",
    },
  });
}
