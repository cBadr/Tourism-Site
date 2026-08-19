import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import type { DistanceSource, GeoPlace, RouteDistance } from "@/lib/pricing-types";
import { MAX_TRIP_STOPS } from "@/lib/booking-types";
import { createServiceSupabase } from "@/lib/supabase/admin";
import { haversineKm } from "@/lib/geo/haversine";
import { afterResponse } from "@/lib/geo/background";

/**
 * محرك المسافات متعدد الطبقات (قرار معماري ٣ في ROADMAP):
 *   كاش دائم في Postgres ← Google Routes API (عند وجود المفتاح) ← OSRM المجاني
 *   ← تقدير هافرساين × ١٫٣ — التسعير لا يتوقف أبداً.
 *
 * مفتاح الكاش شبكي: الإحداثيات مقرَّبة إلى ٣ منازل عشرية (~١١٠ متراً) للطرفين،
 * ويُفحص الاتجاهان (ذهاباً وإياباً) لأن مسافة القيادة متماثلة عملياً لأغراض التسعير.
 * التقديرات لا تُخزَّن أبداً — الكاش للمصادر الحقيقية (google/osrm) فقط.
 *
 * عقد جدول الكاش (تنفذه هجرة المرحلة ٣):
 *   distance_cache(route_key text primary key, distance_km numeric not null,
 *                  duration_min numeric, source text not null check (source in ('google','osrm')),
 *                  created_at timestamptz not null default now())
 *
 * ══════════════════════════════════════════════════════════════════════════
 *  المحطات الوسطى — رجلٌ رجلاً على **نفس** الكاش ونفس المفتاح
 * ══════════════════════════════════════════════════════════════════════════
 *
 * `routeDistance(origin, destination, stops)` — والمعامل الثالث **بافتراضيّ**
 * `[]`، فكلُّ نداءٍ قائم (`/api/quote` · `/api/booking` · `/api/discount/verify`
 * · `/api/loyalty/preview`) يبقى كما هو حرفاً بحرف، **ورحلةٌ بلا محطات تسلك
 * المسار القديم نفسه** بلا فرقٍ في نداءٍ ولا في مصدر.
 *
 * والمحطات تُقسِّم الرحلة أرجلاً: `origin → s₁ → … → sₙ → destination`.
 * وكلُّ رجلٍ **يُقاس بمفتاح الكاش الحالي نفسه** — لا جدولَ جديد ولا مفتاحَ ثانٍ
 * (القاعدة ١٢: لا يُستنسخ منطقٌ قائم، بل يُفوَّض إليه). والمجموعُ هو المسافة.
 *
 * 🔴 **ومصدرُ المسافة هو أضعفُ أرجلها.** رجلٌ سقطت إلى `estimate` تجعل الرحلة
 * كلَّها `estimate` — ولا يُعلَن `osrm` على مجموعٍ فيه تقدير. النصُّ الذي يصف
 * المصدر يجب أن يصدق على **أضعف** جزءٍ لا على أقواه، لأن قارئه (شارة «سعر
 * استرشادي» في الواجهة، ولقطةُ `distance_source` في الحجز) يبني عليه ثقةً
 * برقمٍ ماليّ.
 *
 * 🔴 **والمدةُ كذلك**: رجلٌ بلا مدة (‏كلُّ تقديرٍ بلا مدة) تجعل مدة الرحلة `null`.
 * جمعُ ما عُرف وحده يُنتج رقماً **أقصر من الحقيقة** يبدو معلوماً — وهو أسوأ من
 * لا شيء.
 *
 * ── الكلفة: كم نداءً خارجياً؟ ─────────────────────────────────────────────
 *
 * ن محطة ⇒ ن+١ رجل. والخنق **ثلاثيّ**، وكلُّ طبقةٍ منه تُقلّل صنفاً من النداء:
 *
 *   (١) **تجميعُ الكاش**: قراءةُ كلِّ الأرجل في استعلامٍ واحد (`in(route_key, …)`)
 *       وكتابتُها في `upsert` واحد ⇒ نداءا قاعدةٍ اثنان مهما بلغ عددُ الأرجل،
 *       بدل ٢ن.
 *   (٢) **حدُّ التوازي** `MAX_PARALLEL_LEGS` ⇒ لا يزيد ما يُفتح على OSRM في وقتٍ
 *       واحد عن ثلاثة، فلا ننفجر على خادمٍ مجانيّ عام.
 *   (٣) **سقفُ المحطات** `MAX_TRIP_STOPS` ⇒ ما تجاوزه **لا يُقاس خارجياً إطلاقاً**
 *       بل يُقدَّر كلُّه (صفر نداء) ويخرج موسوماً `estimate`. والرفضُ المبكر
 *       برسالةٍ مفهومة في مسارَي `/api/quote` و`/api/booking`، وهذا هنا حاجزُ
 *       كلفةٍ أخير لمن نادى الوحدة من طريقٍ آخر.
 *
 * 🔴 **والرقمُ هنا سقفُ كلفةٍ مطلق، لا سقفُ المالك.** سقفُ المالك
 * `max_trip_stops()` (‏افتراضُه ٣) يُقرأ في مسارَي الـAPI عبر `getStopsCap`
 * فيرفضان قبل الوصول إلى هنا — **ولا يُقرأ في هذه الوحدة بحال**: هي تُنادى على
 * كل تسعيرة، وقراءةُ إعدادٍ فيها تعني نداءَ قاعدةٍ لكل طلب. فما بين السقفين
 * (٤ و٥ محطات) لا يبلغ هذه الوحدة إلا من نادى `routeDistance` مباشرةً، وحينها
 * يُقاس بالكاش وOSRM كأي رحلة — والحاجزُ المطلق هو ما يمنع الانفجار.
 *
 * ⚠ **ولا نداءَ لجوجل على الأرجل**: حصّةُ بدر بلا سقفٍ اليوم، ورحلةٌ بخمس محطات
 * تضربُ الفاتورة ×٦. فالأرجل تُقاس بـ**الكاش ثم OSRM ثم التقدير**، وتبقى
 * جوجلُ على المسار ذي النقطتين وحده كما هو اليوم بلا تغيير. (ويومَ يضع بدرٌ
 * سقفَ حصّة، رفعُ هذا الحدّ سطرٌ واحد: `allowGoogle`.)
 *
 * 🔒 **ومحطةٌ بلا إحداثيات لا تدخل حساب مسافة** (D-09). وهي تُرفض في مسار الـAPI
 * برسالةٍ مفهومة قبل أن تصل هنا؛ وما وصل مشوَّهاً يُسقَط هنا **دفاعاً**، لأن ما
 * ليس نقطةً لا يُقاس إليه طريق.
 */

const OSRM_URL = "https://router.project-osrm.org/route/v1/driving";
const GOOGLE_ROUTES_URL = "https://routes.googleapis.com/directions/v2:computeRoutes";
const TIMEOUT_MS = 6000;
/** معامل تعرّج الطرق فوق مسافة الخط المستقيم */
const ESTIMATE_FACTOR = 1.3;
/** أقصى عددٍ من الأرجل تُقاس خارجياً في وقتٍ واحد — خنقُ OSRM العام */
const MAX_PARALLEL_LEGS = 3;

type Coords = Pick<GeoPlace, "lat" | "lng">;

/** رجلٌ واحدة: نقطتان ومفتاحا كاشها في الاتجاهين */
type Leg = { from: Coords; to: Coords; key: string; reverseKey: string };

/** قيمةُ كاشٍ مقروءة — بلا مصدرها، لأن كلَّ ما في الجدول مصدرٌ حقيقيّ */
type CachedLeg = { distanceKm: number; durationMin: number | null } | null;

/**
 * ترتيبُ القوة — والأصغرُ أضعف. تُستعمل لاختيار **أضعف** أرجل الرحلة مصدراً.
 *
 * و`cache` فوق `osrm` لأن ما في الجدول قياسٌ حقيقيّ مخزَّن (‏`google` أو `osrm`)
 * لا تخميناً؛ وتحته `google` لأنها أعلى دقةً وأحدثُ بيانات طريق. والفارقُ
 * الحامل للمعنى واحدٌ فقط: **`estimate` مقابل ما عداه** — وهو ما تقرؤه الواجهة.
 */
const SOURCE_STRENGTH: Record<DistanceSource, number> = {
  estimate: 0,
  osrm: 1,
  cache: 2,
  google: 3,
};

function round3(n: number): number {
  return Math.round(n * 1000) / 1000;
}

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

function routeKey(origin: Coords, destination: Coords): string {
  return `${round3(origin.lat)},${round3(origin.lng)}|${round3(destination.lat)},${round3(destination.lng)}`;
}

/** إحداثيتان منتهيتان داخل مجال خرائط صالح — وما عداهما ليس نقطة */
function isFiniteCoords(value: unknown): value is Coords {
  if (typeof value !== "object" || value === null) return false;
  const p = value as { lat?: unknown; lng?: unknown };
  return (
    typeof p.lat === "number" &&
    Number.isFinite(p.lat) &&
    Math.abs(p.lat) <= 90 &&
    typeof p.lng === "number" &&
    Number.isFinite(p.lng) &&
    Math.abs(p.lng) <= 180
  );
}

/** نقطتان تقعان في خانة الشبكة نفسها (~١١٠ متراً) — أي رجلٌ بلا طول */
function samePoint(a: Coords, b: Coords): boolean {
  return round3(a.lat) === round3(b.lat) && round3(a.lng) === round3(b.lng);
}

/** Google Routes API — computeRoutes (يعمل فقط عند ضبط GOOGLE_MAPS_API_KEY) */
async function fetchGoogle(
  origin: Coords,
  destination: Coords,
  apiKey: string
): Promise<RouteDistance | null> {
  const res = await fetch(GOOGLE_ROUTES_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Goog-Api-Key": apiKey,
      // FieldMask إلزامي — نطلب الحقلين المستخدمين فقط
      "X-Goog-FieldMask": "routes.distanceMeters,routes.duration",
    },
    body: JSON.stringify({
      origin: { location: { latLng: { latitude: origin.lat, longitude: origin.lng } } },
      destination: {
        location: { latLng: { latitude: destination.lat, longitude: destination.lng } },
      },
      travelMode: "DRIVE",
    }),
    signal: AbortSignal.timeout(TIMEOUT_MS),
    cache: "no-store",
  });
  if (!res.ok) return null;

  const body = (await res.json()) as {
    routes?: { distanceMeters?: number; duration?: string }[];
  };
  const route = body.routes?.[0];
  if (!route || !Number.isFinite(route.distanceMeters)) return null;

  // duration تأتي بصيغة "3600s"
  const seconds = route.duration ? Number.parseInt(route.duration, 10) : NaN;
  return {
    distanceKm: round1((route.distanceMeters as number) / 1000),
    durationMin: Number.isFinite(seconds) ? Math.round(seconds / 60) : null,
    source: "google",
  };
}

/** OSRM العام — المسار الافتراضي المجاني (الإحداثيات بترتيب lng,lat) */
async function fetchOsrm(origin: Coords, destination: Coords): Promise<RouteDistance | null> {
  const path = `${origin.lng},${origin.lat};${destination.lng},${destination.lat}`;
  const res = await fetch(`${OSRM_URL}/${path}?overview=false`, {
    signal: AbortSignal.timeout(TIMEOUT_MS),
    cache: "no-store",
  });
  if (!res.ok) return null;

  const body = (await res.json()) as {
    code?: string;
    routes?: { distance?: number; duration?: number }[];
  };
  const route = body.routes?.[0];
  if (body.code !== "Ok" || !route || !Number.isFinite(route.distance)) return null;

  return {
    distanceKm: round1((route.distance as number) / 1000),
    durationMin: Number.isFinite(route.duration) ? Math.round((route.duration as number) / 60) : null,
    source: "osrm",
  };
}

/** الطبقة الأخيرة: هافرساين × معامل التعرّج — بلا مدة، ولا تُخزَّن أبداً */
function estimateLeg(origin: Coords, destination: Coords): RouteDistance {
  return {
    distanceKm: round1(
      haversineKm(origin.lat, origin.lng, destination.lat, destination.lng) * ESTIMATE_FACTOR
    ),
    durationMin: null,
    source: "estimate",
  };
}

/**
 * قراءةُ الكاش لكل الأرجل **باستعلامٍ واحد** مهما بلغ عددها.
 *
 * ولا يتغيّر بها شيءٌ للرحلة ذات الرجل الواحدة: نفس المفتاحين، ونفس الجدول،
 * ونفس التسامح مع `duration_min` الفارغة (‏`Number(null) = 0` فخٌّ يحوّل «لا مدة»
 * إلى «صفر دقيقة»، فيُفحص العدمُ صراحةً قبل التحويل).
 */
async function readCacheLegs(supabase: SupabaseClient, legs: Leg[]): Promise<CachedLeg[]> {
  const empty = legs.map(() => null);
  const keys = Array.from(new Set(legs.flatMap((leg) => [leg.key, leg.reverseKey])));
  try {
    const { data } = await supabase
      .from("distance_cache")
      .select("route_key, distance_km, duration_min")
      .in("route_key", keys);
    if (!Array.isArray(data)) return empty;

    const rows = new Map<string, { distance_km: unknown; duration_min: unknown }>();
    for (const row of data as { route_key: string; distance_km: unknown; duration_min: unknown }[]) {
      if (typeof row.route_key === "string") rows.set(row.route_key, row);
    }

    return legs.map((leg) => {
      const row = rows.get(leg.key) ?? rows.get(leg.reverseKey);
      if (!row) return null;
      const distanceKm = Number(row.distance_km);
      if (!Number.isFinite(distanceKm)) return null;
      const rawDuration = row.duration_min;
      const durationMin =
        rawDuration === null || rawDuration === undefined ? NaN : Number(rawDuration);
      return { distanceKm, durationMin: Number.isFinite(durationMin) ? durationMin : null };
    });
  } catch {
    // فشل الكاش لا يوقف الحساب
    return empty;
  }
}

/** تشغيلٌ متوازٍ بسقفٍ — يحفظ ترتيب النتائج ولا يفتح أكثر من `limit` في وقتٍ واحد */
async function mapWithLimit<T, R>(
  items: T[],
  limit: number,
  work: (item: T) => Promise<R>
): Promise<R[]> {
  const out = new Array<R>(items.length);
  let cursor = 0;
  const runner = async (): Promise<void> => {
    for (;;) {
      const index = cursor++;
      if (index >= items.length) return;
      out[index] = await work(items[index]);
    }
  };
  await Promise.all(
    Array.from({ length: Math.max(1, Math.min(limit, items.length)) }, runner)
  );
  return out;
}

/**
 * يقيس كل رجلٍ لم يجدها الكاش: جوجل (‏للرجل الواحدة وحدها) ثم OSRM ثم التقدير.
 * ويكتب المصادر الحقيقية إلى الكاش بـ`upsert` واحد بعد الاستجابة.
 */
async function measureLegs(
  supabase: SupabaseClient | null,
  legs: Leg[],
  allowGoogle: boolean
): Promise<RouteDistance[]> {
  const cached: CachedLeg[] = supabase
    ? await readCacheLegs(supabase, legs)
    : legs.map(() => null);

  // الأرجل المتماثلة تُقاس **مرةً واحدة**: رحلةٌ تذهب إلى محطةٍ وتعود منها
  // (‏A→B ثم B→A) طريقٌ واحد، والكاش نفسه يعامل الاتجاهين سواءً — فنداءان
  // لنفس الطريق شراءٌ لما هو مدفوعٌ سلفاً.
  const pending: { leg: Leg; indexes: number[] }[] = [];
  const byRoad = new Map<string, { leg: Leg; indexes: number[] }>();
  const results = new Array<RouteDistance>(legs.length);
  cached.forEach((hit, index) => {
    if (hit) {
      results[index] = { distanceKm: hit.distanceKm, durationMin: hit.durationMin, source: "cache" };
      return;
    }
    const leg = legs[index];
    const road = [leg.key, leg.reverseKey].sort().join("#");
    const group = byRoad.get(road);
    if (group) {
      group.indexes.push(index);
      return;
    }
    const created = { leg, indexes: [index] };
    byRoad.set(road, created);
    pending.push(created);
  });

  if (pending.length > 0) {
    const apiKey = allowGoogle ? process.env.GOOGLE_MAPS_API_KEY : undefined;
    const fetched = await mapWithLimit(pending, MAX_PARALLEL_LEGS, async ({ leg }) => {
      // (٢) Google عند وجود المفتاح، وفشلها لا يوقفنا — ننزل لـ OSRM
      if (apiKey) {
        try {
          const viaGoogle = await fetchGoogle(leg.from, leg.to, apiKey);
          if (viaGoogle) return viaGoogle;
        } catch {
          // تجاهُلٌ مقصود — الطبقة التالية تتكفّل
        }
      }
      // (٣) OSRM المجاني
      try {
        const viaOsrm = await fetchOsrm(leg.from, leg.to);
        if (viaOsrm) return viaOsrm;
      } catch {
        // تجاهُلٌ مقصود
      }
      return null;
    });

    // (٤) كتابة الكاش للمصادر الحقيقية فقط — التقديرات لا تُخزَّن أبداً.
    //     تُنفَّذ بعد الاستجابة حتى لا تؤخر عرض السعر ولا تضيع عند تجميد الدالة،
    //     و`upsert` واحد لكل الأرجل: نداءُ قاعدةٍ واحد مهما بلغ عددها.
    const rows = new Map<string, {
      route_key: string;
      distance_km: number;
      duration_min: number | null;
      source: DistanceSource;
    }>();

    fetched.forEach((value, order) => {
      const { leg, indexes } = pending[order];
      if (value) {
        for (const index of indexes) results[index] = value;
        // مفتاحٌ واحد لكل طريق — والتكرار داخل نفس الـupsert يرفضه Postgres
        rows.set(leg.key, {
          route_key: leg.key,
          distance_km: value.distanceKm,
          duration_min: value.durationMin,
          source: value.source,
        });
      } else {
        // (٥) الطبقة الأخيرة
        const fallback = estimateLeg(leg.from, leg.to);
        for (const index of indexes) results[index] = fallback;
      }
    });

    if (supabase && rows.size > 0) {
      const payload = Array.from(rows.values());
      afterResponse(() =>
        supabase.from("distance_cache").upsert(payload, { onConflict: "route_key" })
      );
    }
  }

  return results;
}

/** المجموعُ مسافةً، وأضعفُ الأرجل مصدراً، و`null` مدةً إن جهلها أيُّ رجل */
function combineLegs(legs: RouteDistance[]): RouteDistance {
  if (legs.length === 1) return legs[0];

  let distanceKm = 0;
  let durationMin: number | null = 0;
  let weakest: DistanceSource = "google";

  for (const leg of legs) {
    distanceKm += leg.distanceKm;
    if (durationMin !== null) {
      durationMin = leg.durationMin === null ? null : durationMin + leg.durationMin;
    }
    if (SOURCE_STRENGTH[leg.source] < SOURCE_STRENGTH[weakest]) weakest = leg.source;
  }

  return {
    distanceKm: round1(distanceKm),
    durationMin: durationMin === null ? null : Math.round(durationMin),
    source: weakest,
  };
}

/**
 * نقاطُ الرحلة بالترتيب — وتُسقَط منها المحطةُ التي لا تضيف طولاً:
 *   • ما ليس نقطةً بإحداثيتين صالحتين (D-09).
 *   • ومحطةٌ في خانة الشبكة نفسها التي قبلها ⇒ رجلٌ بطول صفر ونداءٌ بلا معنى.
 *
 * ⚠ **والوجهة تُضاف دائماً إلا إن كانت هي آخرَ محطة** — فرحلةٌ تنتهي عند محطتها
 * الأخيرة لا تحتاج رجلاً صفريّاً في ذيلها. وحين لا تنجو محطةٌ واحدة تعود القائمة
 * `[origin, destination]` بالضبط، أي **المسار القديم حرفاً بحرف**.
 */
function buildPoints(origin: Coords, destination: Coords, stops: readonly unknown[]): Coords[] {
  const points: Coords[] = [origin];
  for (const stop of stops) {
    if (!isFiniteCoords(stop)) continue;
    if (samePoint(points[points.length - 1], stop)) continue;
    points.push({ lat: stop.lat, lng: stop.lng });
  }
  if (points.length === 1 || !samePoint(points[points.length - 1], destination)) {
    points.push(destination);
  }
  return points;
}

/**
 * مسافة القيادة من المنطلق إلى الوجهة، **مارّةً بالمحطات بالترتيب** —
 * ولا ترمي أبداً: أسوأ الأحوال تقدير مُعلَّم بـ "estimate".
 *
 * @param stops محطاتٌ وسطى بالترتيب. **بافتراضيّ `[]`** فالنداء بنقطتين يبقى
 *              كما كان: نفس عدد النداءات، ونفس المصدر، ونفس الرقم.
 */
export async function routeDistance(
  origin: Coords,
  destination: Coords,
  stops: readonly Coords[] = []
): Promise<RouteDistance> {
  const supabase = createServiceSupabase();

  const points = buildPoints(origin, destination, stops);
  const legs: Leg[] = [];
  for (let i = 1; i < points.length; i += 1) {
    const from = points[i - 1];
    const to = points[i];
    legs.push({ from, to, key: routeKey(from, to), reverseKey: routeKey(to, from) });
  }

  // بناءُ النقاط يضمن رجلاً واحدة على الأقل؛ والحارس يمنع انهيار الجمع لو تغيّر
  if (legs.length === 0) return estimateLeg(origin, destination);

  // 🔒 حاجزُ الكلفة الأخير: ما تجاوز السقف لا يُقاس خارجياً إطلاقاً — يُقدَّر
  //    كلُّه (صفر نداء) ويخرج موسوماً `estimate` فيراه العميل «سعراً استرشادياً»
  //    ويُسعَّر بالتعريفة. والرفضُ المفهوم مكانه مسارُ الـAPI لا هنا.
  if (legs.length > MAX_TRIP_STOPS + 1) {
    return combineLegs(legs.map((leg) => estimateLeg(leg.from, leg.to)));
  }

  // جوجل للمسار ذي النقطتين وحده — ورحلةٌ بخمس محطات لا تضرب الحصّة ×٦
  const measured = await measureLegs(supabase, legs, legs.length === 1);
  return combineLegs(measured);
}
