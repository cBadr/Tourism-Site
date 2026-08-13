/**
 * مسافة هافرساين (الدائرة العظمى) بين نقطتين بالكيلومتر — دالة نقية بلا أي اعتماد.
 * تُستخدم كطبقة أخيرة في محرك المسافات: تقدير = هافرساين × ١٫٣ (معامل تعرّج الطرق).
 *
 * تحقق حي (نُفِّذ فعلياً على هذه القيم):
 *   القاهرة (30.0444, 31.2357) ← الإسكندرية (31.2001, 29.9187) = 180.0 كم
 *   والتقدير 180.0 × ١٫٣ = 234.0 كم مقابل 218.3 كم من OSRM — انحراف ٧٪ فوق
 *   الحقيقة، وهو الاتجاه الآمن للتسعير (لا نُسعّر بأقل من التكلفة).
 *   نفس النقطة ← نفس النقطة = 0 ✓
 */

const EARTH_RADIUS_KM = 6371;

function toRadians(deg: number): number {
  return (deg * Math.PI) / 180;
}

export function haversineKm(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number
): number {
  const dLat = toRadians(lat2 - lat1);
  const dLng = toRadians(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRadians(lat1)) * Math.cos(toRadians(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.sqrt(a));
}
