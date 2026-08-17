import "server-only";

import { createServiceSupabase } from "@/lib/supabase/admin";
import { afterResponse } from "@/lib/geo/background";
import { readTripSettings } from "@/lib/trip-settings";
import { isWithinServiceArea } from "@/lib/place-search-types";
import {
  fetchStaticRouteMap,
  isDrawablePoint,
  staticMapConfigured,
  type MapPoint,
  type RouteGeometrySource,
} from "@/lib/maps/static-map";

/**
 * خريطة مسار الحجز — التوليد مرةً، والتخزين، والتقديم من المخزون.
 *
 * ══ القواعد الأربع التي يفرضها هذا الملف ═════════════════════════════════════
 *
 * 🔴 **(١) لا نداء خارجي داخل معاملة الحجز أبداً (D-48).** التوليد يقع في
 *    مسارين لا ثالث: خطّاف التأكيد في اللوحة/الويبهوك (بعد أن صار الحجز
 *    مؤكَّداً بالفعل)، وأول فتحٍ للصفحة بعد التأكيد. وكلاهما **خارج**
 *    `create_booking` بالضرورة — والقاعدة تفرض ذلك بنفسها: مُشغّل
 *    `booking_route_maps_confirmed_guard` يرفض الصفّ على حجزٍ غير مؤكَّد،
 *    والحجز لحظة إنشائه `pending_payment`. أي أن الحارس بنيويٌّ لا انضباطي:
 *    من يكتب النداء داخل المعاملة غداً **يفشل**، لا «يخالف تعليقاً».
 *
 * 🔴 **(٢) صورة واحدة لكل حجز لا واحدة لكل مشاهدة.** صفحة المتابعة تُفتح مراراً
 *    على الهاتف، وواجهةُ الخرائط الثابتة تُحاسِب على كل صورة. فالصفّ مفتاحه
 *    `booking_id` (‏0078)، والمخزَّن **بايتات** في دلوٍ خاص لا رابط مزوّد:
 *    رابطٌ مخزَّن كان يعني نداءً من متصفح كل زائر في كل تحديث.
 *
 * 🔴 **(٣) الزناد هو التأكيد لا «المدفوع بالكامل».** الحالات الثلاث
 *    `confirmed`/`assigned`/`completed` هي بعينها ما تشترطه `start_dispatch`
 *    ومن بعدها الإسناد. وحجزٌ بعربونٍ مدفوع **مؤكَّدٌ ويُبَثّ** ويبقى
 *    `amount_remaining > 0` عليه — فربطُ الخريطة بالسداد الكامل كان سيقول
 *    «غير مدفوع» لمن دفع.
 *
 * 🔴 **(٤) لا ترمي شيئاً من هنا.** أي تعثّر — بلا مفتاح، بلا عميل خدمة، مزوّد
 *    ساقط، دلو غير موجود — ينتهي بـ`null`. وصفحةُ متابعةٍ بلا صورة أهون من
 *    صفحةِ متابعةٍ لا تُفتح.
 *
 * 🔴 **(٥) لا خريطة لنقطةٍ خارج منطقة الخدمة (المالك، 2026-08-17: «داخل مصر
 *    فقط»).** والحدُّ **قائمٌ ولا يُعاد تعريفه**: `isWithinServiceArea` في
 *    `lib/place-search-types.ts` — نفسها التي يرفض بها `/api/geocode/reverse`
 *    بالرمز `out-of-area`، ونفسها التي يقصّ إليها منتقي الخريطة. وصندوقٌ ثانٍ
 *    هنا كان سيختلف عنها يوماً، والخلاف يكون **صورةَ مسارٍ لا نخدمه** مرسومةً
 *    على حجزٍ مدفوع.
 *
 *    ولمَ يُفحص هنا أصلاً وقد فُحص عند الإدخال؟ لأن حجوزاً **سبقت** ذلك الحدّ
 *    موجودةٌ في القاعدة الآن، ولأن الإدخال ليس الطريق الوحيد إلى `bookings`
 *    (اللوحة، محرّر SQL). فالفحص يقع حيث يُنفَق المال.
 */

/** الدلو الخاص — أُنشئ في 0078 بلا أي سياسة قراءة: الخادم وحده يصله */
const BUCKET = "maps";

/** الحالات التي بدأ عندها التجهيز فعلاً — نفس شرط `start_dispatch` وما بعده */
const MAP_READY_STATUSES = new Set(["confirmed", "assigned", "completed"]);

export type StoredRouteMap = {
  bytes: Uint8Array;
  contentType: string;
  width: number;
  height: number;
};

/**
 * ما تحتاجه الصفحة لترسم الخريطة **وتكتب نصّها الصادق** — لا البايتات.
 *
 * 🔴 `geometrySource` ليس بياناً وصفياً: صورةٌ رُسمت بخطٍّ مستقيم لأن مزوّد
 * الهندسة سقط **يجب أن تقول ذلك عن نفسها**، وصورةٌ رُسمت بمسار قيادة حقيقي
 * تقول غيرها. ونصٌّ واحد للحالتين يكذب في إحداهما (0079).
 */
export type RouteMapView = {
  geometrySource: RouteGeometrySource;
};

type BookingMapRow = {
  id: string;
  status: string;
  origin: MapPoint | null;
  destination: MapPoint | null;
};

function readPoint(trip: Record<string, unknown>, latKeys: string[], lngKeys: string[]) {
  const pick = (keys: string[]): number | null => {
    for (const key of keys) {
      const raw = trip[key];
      const value = typeof raw === "number" ? raw : Number(raw);
      if (raw !== null && raw !== undefined && raw !== "" && Number.isFinite(value)) return value;
    }
    return null;
  };
  const lat = pick(latKeys);
  const lng = pick(lngKeys);
  const point = { lat, lng };
  return isDrawablePoint(point) ? point : null;
}

/**
 * صفّ الحجز بما تحتاجه الخريطة وحده.
 *
 * ⚠ **الإحداثيات من لقطة الحجز لا من جيوكودنج جديد**: `create_booking` جمّدت
 * `originLat/originLng/destLat/destLng` في `bookings.trip` لحظة الحجز، وهي
 * النقاط التي سُعِّرت عليها الرحلة فعلاً. وإعادةُ ترميز الوسم اليوم قد تُعطي
 * نقطةً أخرى — أي خريطةً لرحلةٍ غير التي دفع ثمنها.
 */
async function loadBookingForMap(bookingId: string): Promise<BookingMapRow | null> {
  const supabase = createServiceSupabase();
  if (!supabase) return null;

  const { data, error } = await supabase
    .from("bookings")
    .select("id, status, trip")
    .eq("id", bookingId)
    .maybeSingle();

  if (error || !data) return null;

  const trip =
    typeof data.trip === "object" && data.trip !== null && !Array.isArray(data.trip)
      ? (data.trip as Record<string, unknown>)
      : {};

  return {
    id: String(data.id),
    status: String(data.status ?? ""),
    origin: readPoint(trip, ["originLat", "origin_lat"], ["originLng", "origin_lng"]),
    destination: readPoint(trip, ["destLat", "dest_lat"], ["destLng", "dest_lng"]),
  };
}

/** نقطةٌ داخل نطاق التشغيل؟ — تفويضٌ إلى الحدّ الوحيد، بلا إعادة تعريف */
export function withinServiceArea(point: MapPoint): boolean {
  return isWithinServiceArea(point.lat, point.lng);
}

/**
 * نقطتا الرحلة من لقطة الحجز — لبناء رابط خرائط جوجل المجاني.
 *
 * ⚠ **مقروءتان من اللقطة المجمَّدة لا من ترميزٍ جديد**: هما النقطتان اللتان
 * حُسبت عليهما المسافة والسعر، فالرابط والفاتورة يصفان الشيء نفسه.
 *
 * 🔴 وحدُّ الجمهور **ليس هنا**: هذه الدالة تقرأ بمفتاح الخدمة وتُرجع الإحداثيات
 * لمن سألها. من ينادي عليه أن يكون قد أثبت أن سائله يستحقها —
 * `partner_route_map_visible` للمتعهد، والتوكن للعميل.
 */
export async function readBookingRoutePoints(
  bookingId: string
): Promise<{ origin: MapPoint; destination: MapPoint } | null> {
  try {
    const booking = await loadBookingForMap(bookingId);
    if (!booking?.origin || !booking.destination) return null;
    if (!withinServiceArea(booking.origin) || !withinServiceArea(booking.destination)) return null;
    return { origin: booking.origin, destination: booking.destination };
  } catch {
    return null;
  }
}

/** مفتاح الإطفاء من اللوحة — يُقرأ من الجدول بمفتاح الخدمة كبقية أعمدة الشاشة */
export async function routeMapEnabled(): Promise<boolean> {
  const supabase = createServiceSupabase();
  if (!supabase) return false;
  const { settings } = await readTripSettings(supabase);
  return settings.routeMapEnabled;
}

/**
 * هل يُعرض للحجز خريطة أصلاً؟ — يُسأل في **تصيير الصفحة** قبل رسم أي `<img>`.
 *
 * الترتيب مقصود: الحالة أولاً (أرخص فحص وأكثرها رفضاً)، ثم المفتاح، ثم
 * الإعداد — فلا نقرأ الإعدادات لحجزٍ بانتظار الدفع أصلاً.
 */
export function routeMapStatusReady(status: string | null | undefined): boolean {
  return typeof status === "string" && MAP_READY_STATUSES.has(status);
}

/** قراءةٌ دفاعية لعمود الهندسة — قيمةٌ لا نعرفها تُقرأ «تقريبية» لا «مسار قيادة» */
function readGeometrySource(value: unknown): RouteGeometrySource {
  return value === "osrm" || value === "google" ? value : "straight";
}

/**
 * يضمن وجود الصورة، ويُرجع ما تحتاجه الصفحة لتصفها بصدق — أو `null`.
 *
 * يُنادى من: (أ) خطّاف التأكيد — فتكون جاهزةً قبل أن يفتح العميل صفحته؛
 * (ب) أول فتحٍ للصفحة بعد التأكيد — فلا يعتمد شيءٌ على نجاح (أ).
 * ومن ينادي مرتين لا يدفع مرتين: الصفّ الموجود يُنهي النداء فوراً.
 */
export async function ensureBookingRouteMap(bookingId: string): Promise<RouteMapView | null> {
  const id = typeof bookingId === "string" ? bookingId.trim() : "";
  if (id.length === 0) return null;

  try {
    const supabase = createServiceSupabase();
    if (!supabase) return null;

    // (١) صفٌّ موجود ⇒ لا نداء ولا كلفة. **قبل** أي فحصٍ آخر: صورةٌ وُلدت
    //     أمسِ تبقى صالحةً حتى لو أطفأ المالك المفتاح اليوم — والإطفاء يُخفيها
    //     في طبقة التقديم، ولا يجعل هذه الدالة تُنفق من جديد.
    const existing = await supabase
      .from("booking_route_maps")
      .select("booking_id, geometry_source")
      .eq("booking_id", id)
      .maybeSingle();
    if (existing.data) return { geometrySource: readGeometrySource(existing.data.geometry_source) };

    if (!staticMapConfigured()) return null;
    if (!(await routeMapEnabled())) return null;

    const booking = await loadBookingForMap(id);
    if (!booking) return null;
    // 🔒 حارسٌ ثانٍ فوق مُشغّل القاعدة — لا بديلاً عنه: لا نُنفق على نداءٍ
    //    نعرف سلفاً أن القاعدة سترفض ثمرته.
    if (!routeMapStatusReady(booking.status)) return null;
    if (!booking.origin || !booking.destination) return null;
    // 🔴 خارج نطاق التشغيل ⇒ لا صورة ولا نداء. والحكم `isWithinServiceArea`
    //    نفسها لا صندوقٌ ثانٍ (القاعدة ٥ في ترويسة الملف).
    if (!withinServiceArea(booking.origin) || !withinServiceArea(booking.destination)) return null;

    const image = await fetchStaticRouteMap(booking.origin, booking.destination);
    if (!image) return null;

    const path = `${id}.png`;
    const upload = await supabase.storage.from(BUCKET).upload(path, image.bytes, {
      contentType: image.contentType,
      upsert: true,
    });
    if (upload.error) return null;

    // `.select()` وفحص صفر صفوف — الفخ المعروف: الكتابة قد «تنجح» بلا صفّ
    const inserted = await supabase
      .from("booking_route_maps")
      .upsert(
        {
          booking_id: id,
          storage_path: path,
          provider: image.provider,
          width: image.width,
          height: image.height,
          byte_size: image.bytes.byteLength,
          geometry_source: image.geometrySource,
        },
        { onConflict: "booking_id" }
      )
      .select();

    if (inserted.error || !inserted.data || inserted.data.length === 0) {
      // الصف لم يُكتب (مُشغّل الحالة رفض، أو RLS) ⇒ لا نترك ملفاً يتيماً في
      // الدلو يُدفع ثمن تخزينه ولا يُقرأ أبداً
      await supabase.storage.from(BUCKET).remove([path]);
      return null;
    }

    return { geometrySource: image.geometrySource };
  } catch {
    return null;
  }
}

/** سقفُ ما يُجدَّل توليده في تصييرةٍ واحدة — يمنع دفعةً من النداءات معاً */
const SCHEDULE_BURST_CAP = 3;

/**
 * أيُّ هذه الحجوزات له صورةٌ مخزَّنة الآن؟ — **استعلامٌ واحد لقائمةٍ كاملة**.
 *
 * تخدم بورتال المتعهد: بطاقاتُ الرحلات تُصيَّر معاً، وسؤالُ صفٍّ لكل بطاقة كان
 * سيضرب القاعدة مرةً لكل رحلة. والغرض أن لا تُرسَم `<img>` لصورةٍ لا وجود لها
 * (‏٤٠٤ تُصيَّر أيقونةَ صورةٍ مكسورة على بطاقةِ رحلةٍ حقيقية).
 *
 * والناقص يُجدَّل توليده بعد الاستجابة: قد يكون خطّاف التأكيد أخفق، وقد يكون
 * المتعهد أول من يفتح — ولا صورة ثانية تُدفع بذلك، فالصفّ الموجود يُنهي النداء.
 */
export async function routeMapAvailability(
  bookingIds: string[]
): Promise<Map<string, RouteMapView>> {
  const empty = new Map<string, RouteMapView>();
  const ids = Array.from(
    new Set(
      (Array.isArray(bookingIds) ? bookingIds : [])
        .map((id) => (typeof id === "string" ? id.trim() : ""))
        .filter((id) => id.length > 0)
    )
  );
  if (ids.length === 0) return empty;

  try {
    const supabase = createServiceSupabase();
    if (!supabase) return empty;
    if (!(await routeMapEnabled())) return empty;

    const { data, error } = await supabase
      .from("booking_route_maps")
      .select("booking_id, geometry_source")
      .in("booking_id", ids);
    if (error || !Array.isArray(data)) return empty;

    const have = new Map<string, RouteMapView>(
      data.map((row) => [
        String(row.booking_id),
        { geometrySource: readGeometrySource(row.geometry_source) },
      ])
    );
    ids
      .filter((id) => !have.has(id))
      .slice(0, SCHEDULE_BURST_CAP)
      .forEach((id) => scheduleBookingRouteMap(id));

    return have;
  } catch {
    return empty;
  }
}

/**
 * خطّاف التأكيد — يُجدول التوليد **بعد** إرسال الاستجابة.
 *
 * 🔴 **موضعه بعد أن صار الحجز مؤكَّداً في القاعدة، لا قبله ولا معه.** ولو
 * انتُظرت نتيجتُه داخل إجراء اعتماد التحويل لصار انقطاعُ خدمة الخرائط قادراً
 * على تأخير — أو إفشال — اعتمادِ دفعةٍ وصلت فعلاً. وهذا هو نفس المنطق الذي
 * يجعل `startDispatchFor` لا ترمي أبداً.
 *
 * و`afterResponse` لا مجرّد وعدٍ مُهمَل: على منصةٍ بلا خادم يُجمَّد التنفيذ فور
 * انتهاء الاستجابة، فالوعد المعلَّق قد لا يكتمل أبداً.
 *
 * ولا يعتمد عليه شيء: أول فتحٍ للصفحة بعد التأكيد يولّدها إن لم تكن وُلدت.
 */
export function scheduleBookingRouteMap(bookingId: string): void {
  const id = typeof bookingId === "string" ? bookingId.trim() : "";
  if (id.length === 0) return;
  afterResponse(() => ensureBookingRouteMap(id));
}

/**
 * البايتات المخزَّنة — لطبقة التقديم وحدها (مسارا `/map` للعميل وللمتعهد).
 *
 * ⚠ **لا تولّد شيئاً**: من ينادي هذه ينادي `ensureBookingRouteMap` أولاً إن
 * أراد التوليد. والفصل مقصود — نقطةُ نهايةٍ تُولّد عند كل طلب هي بعينها
 * «صورة لكل مشاهدة» التي يمنعها القيد.
 */
export async function readStoredRouteMap(bookingId: string): Promise<StoredRouteMap | null> {
  const id = typeof bookingId === "string" ? bookingId.trim() : "";
  if (id.length === 0) return null;

  try {
    const supabase = createServiceSupabase();
    if (!supabase) return null;

    const { data: row, error } = await supabase
      .from("booking_route_maps")
      .select("storage_path, width, height")
      .eq("booking_id", id)
      .maybeSingle();
    if (error || !row) return null;

    const file = await supabase.storage.from(BUCKET).download(String(row.storage_path));
    if (file.error || !file.data) return null;

    const buffer = await file.data.arrayBuffer();
    if (buffer.byteLength === 0) return null;

    return {
      bytes: new Uint8Array(buffer),
      contentType: file.data.type || "image/png",
      width: Number(row.width) || 0,
      height: Number(row.height) || 0,
    };
  } catch {
    return null;
  }
}
