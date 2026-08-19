import { createServerSupabase } from "@/lib/supabase/server";
import { pickupDirectionsUrl, tripDirectionsUrl } from "@/lib/maps/directions";
import { readBookingRoutePoints } from "@/lib/maps/route-map";

/**
 * ══════════════════════════════════════════════════════════════════════════════
 *  اتجاهات خرائط جوجل للمتعهد — `/portal/trips/directions/<bookingId>`
 * ══════════════════════════════════════════════════════════════════════════════
 *
 * قرار المالك (2026-08-17): رابطٌ عاديّ لخرائط جوجل **بعيداً عن الـAPI**،
 * «وكأن العميل هو اللي بيبحث عن الوجهات». وهو الوصف الدقيق: عنوانٌ عام موثَّق
 * بلا مفتاح وبلا فاتورة، يفتح تطبيق الخرائط بالمرور الحيّ والاتجاهات خطوةً
 * بخطوة — وهي أشياء لا تعطيها صورةٌ ثابتة أبداً.
 *
 * ── 🔴 ولماذا تحويلٌ من الخادم لا رابطٌ في الصفحة ───────────────────────────
 *
 * لأن الرابط يحمل **الإحداثيات الدقيقة**، و`portal_trips()` لا تُرجع إحداثيات
 * إطلاقاً — بقصدٍ يعود إلى D-19: ما ليس في نوع الإرجاع لا يُسرَّب بخطأ في
 * الواجهة. فبناءُ الرابط في صفحة البورتال كان يعني حقن الإحداثيات في حمولتها،
 * أي **نقضَ الحاجز البنيوي لأجل راحةٍ في العرض**.
 *
 * فالصفحة تحمل رابطاً إلى هذا المسار وحده، والإحداثيات تُقرأ هنا **بعد** أن
 * يُثبت الحارس أن السائل هو المنفّذ. والمتعهد قبل القبول لا يملك `bookingId`
 * أصلاً (‏`portal_offers()` تُرجع `offer_id` وحده)، فلا عنوان يبنيه.
 *
 * ── والحارس هو حارس الصورة نفسه، لا حدٌّ ثالث ───────────────────────────────
 *
 * `partner_route_map_visible(uuid)` — وجسمُه شرط `where` في `portal_trips()`
 * حرفاً بحرف. **ورابطٌ يكشف نقطة الالتقاط قبل القبول هو نفس تسريب الصورة في
 * غلافٍ آخر**، فيمرّ من نفس البوابة.
 *
 * ── و`to=pickup` هو الافتراضي، لا `route` ───────────────────────────────────
 *
 * فعلُ المتعهد ليس تأمّل المسار بل **الوصول إلى العميل**. فالافتراضي رابطٌ بلا
 * `origin` — يبدأ من موضعه هو الآن وينتهي عند نقطة الالتقاط. و`to=route` يعطي
 * المسار كاملاً لمن أراد أن يقدّر الرحلة.
 */

export async function GET(
  request: Request,
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
  // ⚠ الفشل مغلقاً: خطأُ نداءٍ أو قيمةٌ غير منطقية ⇒ ٤٠٤
  if (error || data !== true) return notFound();

  // 🔴 وخارج نطاق التشغيل لا رابط كذلك — نفس `isWithinServiceArea` التي تحكم
  //    الصورة والمنتقي والمسار العام (تُفرَض داخل `readBookingRoutePoints`).
  const points = await readBookingRoutePoints(id);
  if (!points) return notFound();

  /**
   * ── 🔴 والمسارُ يمرّ بالمحطات، وإلا فلا مسار ────────────────────────────────
   *
   * `points.stops` ثلاثُ حالات (‏`readTripRouteStops`): `[]` رحلةُ نقطتين فيبقى
   * الرابط كما كان حرفاً · مصفوفةٌ صالحة فتصير نقاطَ مرورٍ بترتيبها · و`null`
   * محطةٌ لا نثق بها **فلا رابطَ مسارٍ إطلاقاً**.
   *
   * ولماذا ٤٠٤ لا «رابطٌ مباشر»؟ لأن الضرر هنا **ليس غياب الرابط بل صحّته
   * الكاذبة**: السائقُ قَبِل الرحلة سلفاً، فرابطٌ يفتح له طريقاً لا يمرّ بمحطات
   * العميل يقوده إلى غير طريقه **وهو واثق**. و«الملاحة إلى نقطة الالتقاط» —
   * وهي فعلُه الأول لا الثاني — تبقى عاملةً في كل هذه الحالات.
   */
  const to = new URL(request.url).searchParams.get("to");
  let target: string | null;
  if (to === "route") {
    target =
      points.stops === null
        ? null
        : tripDirectionsUrl(points.origin, points.destination, points.stops);
  } else {
    target = pickupDirectionsUrl(points.origin);
  }
  if (!target) return notFound();

  return new Response(null, {
    status: 302,
    headers: {
      location: target,
      // لا كاش: الحارس يُعاد تقييمه في كل ضغطة — رحلةٌ أُعيدت إلى الطابور
      // يجب أن يتوقف رابطها في اللحظة نفسها لا بعد انتهاء عمر كاش.
      "cache-control": "no-store",
      "x-robots-tag": "noindex, nofollow",
      // ⚠ لا ترويسة `referer` إلى جوجل تحمل مسارنا الداخلي ومعرّف الحجز
      "referrer-policy": "no-referrer",
    },
  });
}
