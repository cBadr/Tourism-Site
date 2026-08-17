import { createServerSupabase } from "@/lib/supabase/server";
import {
  ensureBookingRouteMap,
  readStoredRouteMap,
  routeMapEnabled,
  routeMapStatusReady,
} from "@/lib/maps/route-map";

/**
 * صورة خريطة المسار للعميل — `/booking/<token>/map`.
 *
 * ── لماذا نقطةُ نهايةٍ أصلاً، ولا `<img src="https://maps.googleapis…">` ─────
 *
 * لأن الرابط المباشر يعني **نداءً مدفوعاً من متصفح كل زائر في كل تحديث** —
 * وصفحة المتابعة تُفتح مراراً على الهاتف — **ويعني مفتاح المزوّد في مصدر
 * الصفحة** (الاتفاقية ٣: الأسرار في البيئة). فالصورة تُولَّد مرةً وتُخزَّن،
 * وهذه النقطة تُقدّم المخزون.
 *
 * ── الحارس هو التوكن نفسه، بلا حارسٍ ثانٍ يُخترع ────────────────────────────
 *
 * نفس بوابة الصفحة حرفاً بحرف: `get_booking_by_token` — دالة `security definer`
 * تأذن بحيازة التوكن وحده وترفض ما دون ٣٢ محرفاً. ومن يملك التوكن يقرأ الصفحة
 * كاملةً بوسميها ومواعيدها أصلاً، فالخريطة لا تفتح باباً جديداً عليه.
 *
 * 🔒 **والحالة تُقرأ من الصفّ لا من الطلب:** قبل التأكيد لا صورة — ولا يكفي أن
 * الصفحة لا ترسم `<img>`، لأن العنوان يُطلب مباشرةً.
 */

export async function GET(
  _request: Request,
  ctx: { params: Promise<{ token: string }> }
): Promise<Response> {
  const { token } = await ctx.params;

  const notFound = () =>
    new Response(null, {
      status: 404,
      headers: { "cache-control": "no-store", "x-robots-tag": "noindex, nofollow" },
    });

  if (typeof token !== "string" || token.length < 32) return notFound();

  const supabase = await createServerSupabase();
  if (!supabase) return notFound();

  const { data, error } = await supabase.rpc("get_booking_by_token", { p_token: token });
  if (error) return notFound();

  const row = Array.isArray(data) ? data[0] : data;
  if (!row || typeof row !== "object") return notFound();

  const record = row as Record<string, unknown>;
  const bookingId = typeof record.id === "string" ? record.id : "";
  const status = typeof record.status === "string" ? record.status : "";

  if (bookingId.length === 0) return notFound();
  // 🔴 الزناد هو التأكيد — الحالة التي تبدأ عندها `start_dispatch` — لا السداد
  //    الكامل: حجزٌ بعربونٍ مدفوع مؤكَّدٌ ويُبَثّ وعليه متبقٍّ.
  if (!routeMapStatusReady(status)) return notFound();
  // مفتاح الإطفاء يحكم **التقديم** كما يحكم التوليد: أطفأه المالك ⇒ لا صورة
  // حتى لو كانت مخزَّنة، فيتوقف الأثر البصري كما تتوقف الكلفة.
  if (!(await routeMapEnabled())) return notFound();

  // التوليد الكسول: أول فتحٍ بعد التأكيد. ولا يكرر الإنفاق — الصفّ الموجود
  // يُنهي النداء قبل أي اتصال خارجي.
  await ensureBookingRouteMap(bookingId);

  const image = await readStoredRouteMap(bookingId);
  if (!image) return notFound();

  return new Response(image.bytes as unknown as BodyInit, {
    status: 200,
    headers: {
      "content-type": image.contentType,
      "content-length": String(image.bytes.byteLength),
      // `private` لا `public`: العنوان يحمل توكن الحجز، فلا يُخزَّن في وسيطٍ
      // مشترك. والصورة لا تتغيّر لهذا الحجز أبداً، فساعةٌ في متصفحه مكسبٌ صافٍ.
      "cache-control": "private, max-age=3600",
      "x-robots-tag": "noindex, nofollow",
    },
  });
}
