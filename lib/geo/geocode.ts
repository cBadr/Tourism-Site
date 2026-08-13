import "server-only";

import type { GeoPlace } from "@/lib/pricing-types";
import { createServiceSupabase } from "@/lib/supabase/admin";
import { afterResponse } from "@/lib/geo/background";

/**
 * طبقة الجيوكودنج — تحويل نص البحث (بالعربية غالباً) إلى أماكن بإحداثيات.
 *
 * الترتيب: كاش دائم في Postgres (جدول geocode_cache عبر عميل الخدمة — يتجاوز RLS)
 * ثم Nominatim المجاني مقيَّداً بمصر وبالعربية. غياب بيئة الخدمة لا يعطّل البحث:
 * نتخطى الكاش ونستدعي المزوّد مباشرة. أي فشل خارجي يرجع [] بلا انهيار.
 *
 * عقد جدول الكاش (تنفذه هجرة المرحلة ٣):
 *   geocode_cache(query_key text primary key, places jsonb not null,
 *                 created_at timestamptz not null default now())
 */

const NOMINATIM_URL = "https://nominatim.openstreetmap.org/search";
/** سياسة Nominatim تُلزم بهوية واضحة للتطبيق */
const USER_AGENT = "Tours01/1.0";
const TIMEOUT_MS = 6000;
const MAX_RESULTS = 5;

type NominatimItem = {
  place_id?: number;
  osm_type?: string;
  osm_id?: number;
  lat?: string;
  lon?: string;
  display_name?: string;
};

/** توحيد نص البحث: إزالة الأطراف وضغط الفراغات المتتالية */
export function normalizeQuery(q: string): string {
  return q.trim().replace(/\s+/g, " ");
}

/** مفتاح الكاش: النص الموحَّد بحروف صغيرة (يوحّد الاستعلامات اللاتينية المتطابقة) */
function cacheKey(normalized: string): string {
  return normalized.toLowerCase();
}

/**
 * اختصار display_name الطويل إلى وسم مقروء: أول ثلاثة مقاطع ذات معنى،
 * مع إسقاط الرموز البريدية واسم الدولة (كل النتائج داخل مصر أصلاً).
 */
function toLabel(displayName: string): string {
  const parts = displayName
    .split(",")
    .map((p) => p.trim())
    .filter((p) => p.length > 0 && !/^\d{4,}$/.test(p));
  const last = parts[parts.length - 1];
  if (parts.length > 1 && (last === "مصر" || last?.toLowerCase() === "egypt")) {
    parts.pop();
  }
  return parts.slice(0, 3).join("، ") || displayName.trim();
}

/** فحص أن قيمة الكاش المخزنة فعلاً مصفوفة أماكن سليمة */
function isGeoPlaceArray(value: unknown): value is GeoPlace[] {
  return (
    Array.isArray(value) &&
    value.every(
      (p) =>
        typeof p === "object" &&
        p !== null &&
        typeof (p as GeoPlace).label === "string" &&
        Number.isFinite((p as GeoPlace).lat) &&
        Number.isFinite((p as GeoPlace).lng)
    )
  );
}

async function fetchNominatim(normalized: string): Promise<GeoPlace[]> {
  const params = new URLSearchParams({
    q: normalized,
    format: "jsonv2",
    countrycodes: "eg",
    "accept-language": "ar",
    limit: String(MAX_RESULTS),
    addressdetails: "0",
  });

  const res = await fetch(`${NOMINATIM_URL}?${params.toString()}`, {
    headers: { "User-Agent": USER_AGENT },
    signal: AbortSignal.timeout(TIMEOUT_MS),
    cache: "no-store",
  });
  // فشل HTTP (تقييد معدل 429 أو 5xx) = رمي — حتى لا يُخزَّن فشلٌ عابر
  // في الكاش الدائم كنتيجة فارغة «صحيحة» (تسميم الكاش)
  if (!res.ok) throw new Error(`nominatim ${res.status}`);

  const items = (await res.json()) as NominatimItem[];
  if (!Array.isArray(items)) throw new Error("nominatim malformed body");

  const places: GeoPlace[] = [];
  const seen = new Set<string>();
  for (const item of items) {
    const lat = Number(item.lat);
    const lng = Number(item.lon);
    if (!Number.isFinite(lat) || !Number.isFinite(lng) || !item.display_name) continue;
    const label = toLabel(item.display_name);
    if (seen.has(label)) continue; // إسقاط التكرارات المتطابقة الوسم
    seen.add(label);
    places.push({
      label,
      lat,
      lng,
      ref:
        item.osm_type && item.osm_id != null
          ? `${item.osm_type}/${item.osm_id}`
          : item.place_id != null
            ? String(item.place_id)
            : undefined,
    });
  }
  return places.slice(0, MAX_RESULTS);
}

/**
 * طلبات جارية بنفس المفتاح — تُشارَك بدل تكرار النداء الخارجي.
 * سياسة Nominatim تسمح بطلب واحد في الثانية، وويدجت البحث أثناء الكتابة
 * قد يُطلق عدة طلبات متزامنة بنفس النص؛ المشاركة تحمي المزوّد المجاني.
 */
const inFlight = new Map<string, Promise<GeoPlace[]>>();

/**
 * البحث عن أماكن داخل مصر. لا ترمي أبداً — الفشل الخارجي يعني [].
 */
export async function searchPlaces(q: string): Promise<GeoPlace[]> {
  const normalized = normalizeQuery(q);
  if (normalized.length < 2) return [];

  const key = cacheKey(normalized);
  const running = inFlight.get(key);
  if (running) return running;

  const task = lookup(normalized, key)
    .catch((): GeoPlace[] => [])
    .finally(() => {
      inFlight.delete(key);
    });
  inFlight.set(key, task);
  return task;
}

async function lookup(normalized: string, key: string): Promise<GeoPlace[]> {
  const supabase = createServiceSupabase();

  // (١) الكاش الدائم — يخدم الاستعلامات المكررة بلا أي نداء خارجي
  if (supabase) {
    try {
      const { data } = await supabase
        .from("geocode_cache")
        .select("places")
        .eq("query_key", key)
        .maybeSingle();
      if (data && isGeoPlaceArray(data.places)) return data.places;
    } catch {
      // فشل قراءة الكاش لا يمنع البحث المباشر
    }
  }

  // (٢) Nominatim — المزوّد المجاني
  let places: GeoPlace[];
  try {
    places = await fetchNominatim(normalized);
  } catch {
    return [];
  }

  // (٣) كتابة الكاش بعد الاستجابة (لا تؤخر الرد) — حتى النتائج الفارغة تُخزَّن
  //     لأن تكرار استعلام بلا نتائج يستحق الخدمة من الكاش أيضاً
  if (supabase) {
    afterResponse(() =>
      supabase.from("geocode_cache").upsert({ query_key: key, places }, { onConflict: "query_key" })
    );
  }

  return places;
}
