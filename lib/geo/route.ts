import "server-only";

import type { GeoPlace, RouteDistance } from "@/lib/pricing-types";
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
 */

const OSRM_URL = "https://router.project-osrm.org/route/v1/driving";
const GOOGLE_ROUTES_URL = "https://routes.googleapis.com/directions/v2:computeRoutes";
const TIMEOUT_MS = 6000;
/** معامل تعرّج الطرق فوق مسافة الخط المستقيم */
const ESTIMATE_FACTOR = 1.3;

type Coords = Pick<GeoPlace, "lat" | "lng">;

function round3(n: number): number {
  return Math.round(n * 1000) / 1000;
}

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

function routeKey(origin: Coords, destination: Coords): string {
  return `${round3(origin.lat)},${round3(origin.lng)}|${round3(destination.lat)},${round3(destination.lng)}`;
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

/**
 * مسافة القيادة بين نقطتين — لا ترمي أبداً: أسوأ الأحوال تقدير مُعلَّم بـ "estimate".
 */
export async function routeDistance(
  origin: Coords,
  destination: Coords
): Promise<RouteDistance> {
  const key = routeKey(origin, destination);
  const reverseKey = routeKey(destination, origin);
  const supabase = createServiceSupabase();

  // (١) الكاش الدائم — يُفحص الاتجاهان بطلب واحد
  if (supabase) {
    try {
      const { data } = await supabase
        .from("distance_cache")
        .select("distance_km, duration_min")
        .in("route_key", [key, reverseKey])
        .limit(1)
        .maybeSingle();
      if (data && Number.isFinite(Number(data.distance_km))) {
        // duration_min قد تكون null في الصف المخزَّن — و Number(null) = 0
        // لذلك نفحص العدم صراحةً قبل التحويل حتى لا تتحول «لا مدة» إلى «صفر دقيقة»
        const rawDuration = data.duration_min;
        const durationMin =
          rawDuration === null || rawDuration === undefined ? NaN : Number(rawDuration);
        return {
          distanceKm: Number(data.distance_km),
          durationMin: Number.isFinite(durationMin) ? durationMin : null,
          source: "cache",
        };
      }
    } catch {
      // فشل الكاش لا يوقف الحساب
    }
  }

  // (٢) Google عند وجود المفتاح، وفشلها لا يوقفنا — ننزل لـ OSRM
  let result: RouteDistance | null = null;
  const apiKey = process.env.GOOGLE_MAPS_API_KEY;
  if (apiKey) {
    try {
      result = await fetchGoogle(origin, destination, apiKey);
    } catch {
      result = null;
    }
  }

  // (٣) OSRM المجاني
  if (!result) {
    try {
      result = await fetchOsrm(origin, destination);
    } catch {
      result = null;
    }
  }

  // (٤) كتابة الكاش للمصادر الحقيقية فقط — التقديرات لا تُخزَّن أبداً
  //     تُنفَّذ بعد الاستجابة حتى لا تؤخر عرض السعر ولا تضيع عند تجميد الدالة
  if (result && supabase) {
    const row = {
      route_key: key,
      distance_km: result.distanceKm,
      duration_min: result.durationMin,
      source: result.source,
    };
    afterResponse(() =>
      supabase.from("distance_cache").upsert(row, { onConflict: "route_key" })
    );
  }
  if (result) return result;

  // (٥) الطبقة الأخيرة: تقدير هافرساين × معامل التعرّج — بلا مدة
  return {
    distanceKm: round1(
      haversineKm(origin.lat, origin.lng, destination.lat, destination.lng) * ESTIMATE_FACTOR
    ),
    durationMin: null,
    source: "estimate",
  };
}
