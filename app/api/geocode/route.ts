import type { NextRequest } from "next/server";
import { searchPlaces, normalizeQuery } from "@/lib/geo/geocode";

/**
 * GET /api/geocode?q=... — بحث الأماكن داخل مصر (يخدم ويدجت الحجز).
 * الاستجابة: { ok: true, places: GeoPlace[] } أو { ok: false, code, message }.
 *
 * نفس الاستعلام يتكرر كثيراً بين الزوار، لذلك نسمح بكاش CDN ليوم كامل
 * (الطبقة الثانية فوق كاش Postgres الدائم).
 */

export const runtime = "nodejs";

const CACHE_HEADERS = {
  "Cache-Control": "public, s-maxage=86400, stale-while-revalidate=43200",
};

export async function GET(request: NextRequest) {
  const q = request.nextUrl.searchParams.get("q") ?? "";
  const normalized = normalizeQuery(q);

  if (normalized.length < 2) {
    return Response.json(
      {
        ok: false,
        code: "invalid-input",
        message: "اكتب حرفين على الأقل للبحث عن مكان.",
      },
      { status: 400 }
    );
  }

  const places = await searchPlaces(normalized);
  // كاش CDN للنتائج غير الفارغة فقط: النتيجة الفارغة قد تكون فشلاً عابراً
  // في المزوّد ولا يصح تثبيتها يوماً كاملاً — الفارغة الحقيقية يخدمها كاش Postgres
  return Response.json(
    { ok: true, places },
    { headers: places.length > 0 ? CACHE_HEADERS : { "Cache-Control": "no-store" } }
  );
}
