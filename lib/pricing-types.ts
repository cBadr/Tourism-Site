/**
 * عقد محرك التسعير والمسافات (المرحلة ٣) — المرجع الأوحد للأنواع والتواقيع.
 *
 * قاعدة الأهلية (من VISION.md — آلية تحديد السيارات): تُرتَّب الفئات النشطة
 * تصاعدياً بالسعة، والمؤهل = الفئات التي سعتها ≥ عدد الركاب (الأطفال يُحسبون)،
 * وتُعرض أول فئتين منها (الأصغر الكافية + التي تليها تحفيزاً). هذه القاعدة
 * تُطبَّق داخل دالة SQL حصراً — لا منطق تسعير في TypeScript إطلاقاً.
 *
 * توقيع دالة التسعير في Postgres (تنفذها هجرة 0005 ويستدعيها /api/quote عبر rpc):
 *   quote_price(p_distance_km numeric, p_passengers int,
 *               p_round_trip boolean, p_waiting_hours numeric)
 *   returns table(class_slug text, class_title text, capacity int,
 *                 total numeric, base_fee numeric, distance_cost numeric,
 *                 waiting_cost numeric, round_trip_applied boolean,
 *                 peak_applied boolean, min_applied boolean)
 *
 * معادلة السعر للفئة الواحدة:
 *   subtotal = base_fee + distance_km × per_km
 *   subtotal = max(subtotal, min_price)                    ← أرضية الفئة (min_applied)
 *   subtotal = subtotal × round_trip_factor  (إن ذهاب وعودة)
 *   subtotal = subtotal + waiting_hours × waiting_hour_price
 *   total    = subtotal × (1 + peak_percent/100)  (إن peak_enabled)  ← يُقرَّب لأقرب جنيه
 */

import type { OfferPricing } from "@/lib/subcontractor-types";

/** فئة سيارة — صف جدول vehicle_classes (تُدار من اللوحة) */
export type VehicleClassRow = {
  id: string;
  slug: string;
  title: string;
  /** السعة القصوى بالركاب — أساس قاعدة الأهلية */
  capacity: number;
  short: string | null;
  imageUrl: string | null;
  active: boolean;
  sort: number;
};

/** تعريفة فئة — صف جدول tariffs (صف واحد لكل فئة، تُدار من اللوحة) */
export type TariffRow = {
  classId: string;
  perKm: number;
  baseFee: number;
  minPrice: number;
  waitingHourPrice: number;
  /** معامل الذهاب والعودة — مثال 1.8 يعني خصم ١٠٪ عن ضعف السعر */
  roundTripFactor: number;
};

/** إعدادات التسعير العامة — صف وحيد في pricing_settings */
export type PricingSettings = {
  peakEnabled: boolean;
  peakPercent: number;
  currency: "EGP";
};

/** نتيجة الجيوكودنج — من /api/geocode */
export type GeoPlace = {
  label: string;
  lat: number;
  lng: number;
  /** مُعرّف مزود الخريطة إن وُجد */
  ref?: string;
};

/** مصدر المسافة بترتيب المحاولة */
export type DistanceSource = "cache" | "google" | "osrm" | "estimate";

export type RouteDistance = {
  distanceKm: number;
  durationMin: number | null;
  source: DistanceSource;
};

/** جسم طلب POST /api/quote */
export type QuoteRequest = {
  origin: GeoPlace;
  destination: GeoPlace;
  passengers: number;
  roundTrip: boolean;
  waitingHours: number;
};

/** عرض سعر لفئة واحدة — صف من quote_price بعد تحويل أسماء الحقول */
export type Offer = {
  classSlug: string;
  classTitle: string;
  capacity: number;
  total: number;
  currency: "EGP";
  breakdown: {
    baseFee: number;
    distanceCost: number;
    waitingCost: number;
    roundTripApplied: boolean;
    peakApplied: boolean;
    minApplied: boolean;
  };
  /**
   * مصدر السعر ولقطة التكلفة والهامش (المرحلة ٥ — أعمدة quote_price الأربعة).
   *
   * اختياري عمداً: الاستدعاء بلا إحداثيات، أو قبل تطبيق هجرة 0010، يُرجع عروضاً
   * بلا هذا الحقل — فتبقى كل مكوّنات components/booking/** تعمل بلا تعديل حرف.
   *
   * ⚠ حدّ الـ whitelabel: النسخة التي تغادر الخادم إلى المتصفح تحمل
   * `priceSource` وحده، والحقول الثلاثة الباقية `null` دائماً. هوية المتعهد
   * وتكلفته وهامش الموقع بيانات داخلية لا يراها العميل إطلاقاً (انظر
   * app/api/quote/route.ts — دالة التنقيح).
   */
  pricing?: OfferPricing;
};

/** استجابة /api/quote */
export type QuoteResponse = {
  ok: true;
  distanceKm: number;
  durationMin: number | null;
  /** "estimate" يعني مسافة تقديرية (هافرساين×١٫٣) — تُعرض للعميل بوسم «سعر استرشادي» */
  distanceSource: DistanceSource;
  offers: Offer[];
};

export type QuoteError = {
  ok: false;
  /** invalid-input | no-classes | distance-failed */
  code: string;
  message: string;
};
