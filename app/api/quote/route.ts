import { trackFunnelBatch } from "@/lib/analytics/emit";
import { routeDistance } from "@/lib/geo/route";
import { createServiceSupabase } from "@/lib/supabase/admin";
import type { FunnelPayload } from "@/lib/analytics-types";
import type { Offer, QuoteError, QuoteRequest, QuoteResponse } from "@/lib/pricing-types";
import type { OfferPricing, PriceSource } from "@/lib/subcontractor-types";

/**
 * POST /api/quote — عرض الأسعار للرحلة (يخدم ويدجت الحجز وصفحة /book).
 *
 * التسعير عام (بلا تسجيل دخول) لذلك نستخدم عميل الخادم بمفتاح anon —
 * دالة quote_price في Postgres هي صاحبة كل الحساب المالي، وTypeScript
 * هنا ينقل الأرقام فقط ولا يحسب أي سعر إطلاقاً (قرار معماري ٤).
 *
 * المرحلة ٥ — التغطية والهامش: نمرّر إحداثيات النقطتين إلى الدالة المُرقَّاة
 * فتشتغل مطابقة التغطية: إن وُجد متعهد معتمد يغطي المسار صار السعر «أرخص
 * تكلفة متعهد + الهامش»، وإلا بقيت تعريفة الكيلومتر كما في المرحلة ٣.
 * الاختيار كله داخل SQL — هذا الملف يمرّر الإحداثيات وينقل الناتج لا غير.
 *
 * 🔒 حدّ الـ whitelabel (القاعدة الحاكمة لهذا الملف):
 * الدالة تُرجع أربعة أعمدة جديدة: price_source و subcontractor_id و
 * subcontractor_cost و margin_amount. الثلاثة الأخيرة **لا تغادر الخادم**:
 * لو رآها المتصفح لعرف العميل من ينفّذ رحلته وبكم اشتراها الموقع، وهذا نقض
 * لكامل فكرة الوسيط. لذلك يمرّ كل صف على `redactPricing` قبل بناء الاستجابة،
 * ولا يوجد في هذا الملف أي مسار آخر يكتب الحقول الثلاثة في جسم الرد.
 *
 * التوافق الخلفي مزدوج الطبقة (الموقع يجب ألّا يسقط أثناء نشر الهجرة):
 *   ١) الدالة المُرقَّاة بلا إحداثيات = سلوك المرحلة ٣ حرفياً.
 *   ٢) وقبل تطبيق الهجرة أصلاً، الاستدعاء الثماني يفشل بـ PGRST202 فنُعيد
 *      المحاولة بالتوقيع الرباعي القديم — لا انقطاع في التسعير العام.
 *
 * لا كاش لهذه الاستجابة: مفتاح الذروة من اللوحة يغيّر النتيجة فوراً.
 *
 * رموز الخطأ التي قد ترجع (تقرأ الواجهة `message` مباشرة في كل الحالات):
 *   invalid-input   ٤٠٠ — جسم الطلب ناقص أو خارج الحدود
 *   no-classes      ٢٠٠ — لا فئة تتسع لعدد الركاب (ليس خطأ خادم)
 *   pricing-failed  ٥٠٠/٥٠٣ — فشل دالة التسعير أو بيئة غير مضبوطة
 *   distance-failed ٥٠٠ — احتياطي لا يقع عملياً (طبقة التقدير تضمن مسافة)
 */

export const runtime = "nodejs";

const NO_STORE = { "Cache-Control": "no-store" };

/**
 * صف quote_price كما يرجع من rpc — الأسماء snake_case حسب توقيع SQL في العقد.
 * الأعمدة الأربعة الأخيرة اختيارية في النوع لأن قاعدة بيانات لم تُطبَّق عليها
 * هجرة 0010 بعدُ لا ترجعها أصلاً.
 */
type QuotePriceRow = {
  class_slug: string;
  class_title: string;
  capacity: number;
  total: number;
  base_fee: number;
  distance_cost: number;
  waiting_cost: number;
  round_trip_applied: boolean;
  peak_applied: boolean;
  min_applied: boolean;
  price_source?: string | null;
  subcontractor_id?: string | null;
  subcontractor_cost?: number | string | null;
  margin_amount?: number | string | null;
};

function errorJson(code: string, message: string, status: number): Response {
  const body: QuoteError = { ok: false, code, message };
  return Response.json(body, { status, headers: NO_STORE });
}

function isFiniteCoords(v: unknown): v is { lat: number; lng: number } {
  if (typeof v !== "object" || v === null) return false;
  const p = v as { lat?: unknown; lng?: unknown };
  return (
    typeof p.lat === "number" &&
    Number.isFinite(p.lat) &&
    Math.abs(p.lat) <= 90 &&
    typeof p.lng === "number" &&
    Number.isFinite(p.lng) &&
    Math.abs(p.lng) <= 180
  );
}

/** تحقق كامل من جسم الطلب — يرجع null عند أي خلل */
function parseQuoteRequest(body: unknown): QuoteRequest | null {
  if (typeof body !== "object" || body === null) return null;
  const b = body as Record<string, unknown>;

  if (!isFiniteCoords(b.origin) || !isFiniteCoords(b.destination)) return null;

  const passengers = b.passengers;
  if (typeof passengers !== "number" || !Number.isInteger(passengers)) return null;
  if (passengers < 1 || passengers > 60) return null;

  const waitingHours = b.waitingHours;
  if (typeof waitingHours !== "number" || !Number.isFinite(waitingHours)) return null;
  if (waitingHours < 0 || waitingHours > 24) return null;

  if (typeof b.roundTrip !== "boolean") return null;

  const originLabel = (b.origin as { label?: unknown }).label;
  const destLabel = (b.destination as { label?: unknown }).label;

  return {
    origin: {
      label: typeof originLabel === "string" ? originLabel : "",
      lat: b.origin.lat,
      lng: b.origin.lng,
    },
    destination: {
      label: typeof destLabel === "string" ? destLabel : "",
      lat: b.destination.lat,
      lng: b.destination.lng,
    },
    passengers,
    roundTrip: b.roundTrip,
    waitingHours,
  };
}

function isPriceSource(value: unknown): value is PriceSource {
  return value === "subcontractor" || value === "tariff";
}

/**
 * 🔒 التنقيح — الحارس الوحيد بين الأعمدة الداخلية والمتصفح.
 *
 * يخرج منها `priceSource` فقط (وهو لا يسمّي أحداً ولا يكشف رقماً)، والحقول
 * الثلاثة الباقية مثبَّتة على null بالبناء لا بالحذف: لو أضاف SQL عموداً
 * حساساً جديداً غداً فلن يتسرب من هنا لأن الكائن يُبنى حقلاً حقلاً.
 *
 * صف بلا `price_source` (قاعدة قبل الهجرة) ← undefined فلا يظهر المفتاح أصلاً.
 */
function redactPricing(row: QuotePriceRow): OfferPricing | undefined {
  if (!isPriceSource(row.price_source)) return undefined;
  return {
    priceSource: row.price_source,
    subcontractorId: null,
    subcontractorCost: null,
    marginAmount: null,
  };
}

export async function POST(request: Request) {
  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return errorJson("invalid-input", "جسم الطلب ليس JSON صالحاً.", 400);
  }

  const input = parseQuoteRequest(raw);
  if (!input) {
    return errorJson(
      "invalid-input",
      "بيانات الرحلة غير مكتملة: نقطتا الانطلاق والوصول بإحداثيات صحيحة، وعدد ركاب من ١ إلى ٦٠، وساعات انتظار من ٠ إلى ٢٤.",
      400
    );
  }

  // (١) المسافة — لا تفشل نظرياً (طبقة التقدير تضمن رقماً دائماً)، والحارس احتياط
  let distance;
  try {
    distance = await routeDistance(input.origin, input.destination);
  } catch {
    return errorJson("distance-failed", "تعذر حساب مسافة الرحلة. حاول مرة أخرى.", 500);
  }

  // (٢) التسعير — كله داخل دالة quote_price في Postgres، عبر **عميل الخدمة**.
  //
  // لماذا الخدمة لا anon (هجرة 0011): التوقيع الثماني (بالإحداثيات) يكشف
  // مسار التسعير بالمتعهد، ومتعهدٌ يعرف تكلفته يستنتج الهامش من base_fee ثم
  // يطبّقه على مسارات غيره فيستخرج تكاليف منافسيه. لذلك سُحبت صلاحية تنفيذه
  // من anon ومن authenticated معاً، وصار الوصول إليه من الخادم حصراً — وهو
  // ما لا يغيّر شيئاً للزائر لأن الطلب يمر بهذا المسار أصلاً.
  const supabase = createServiceSupabase();
  if (!supabase) {
    // بيئة غير مضبوطة — ليست «لا توجد فئة مناسبة»: الرمز مختلف حتى لا تعرض
    // الواجهة رسالة سعة الركاب في موقف سببه الإعداد
    return errorJson(
      "pricing-failed",
      "خدمة التسعير غير مهيأة بعد. تواصل معنا مباشرة للحصول على عرض سعر.",
      503
    );
  }

  // الوسائط المشتركة بين التوقيعين — الإحداثيات وحدها هي الزيادة
  const baseArgs = {
    p_distance_km: distance.distanceKm,
    p_passengers: input.passengers,
    p_round_trip: input.roundTrip,
    p_waiting_hours: input.waitingHours,
  };

  // `quote_public` (هجرة 0012) لا تحمل هوية المتعهد ولا تكلفته ولا الهامش في
  // نوع إرجاعها أصلاً — فتسريبها إلى المتصفح مستحيل بنيوياً لا بالانضباط.
  let { data, error } = await supabase.rpc("quote_public", {
    ...baseArgs,
    p_origin_lat: input.origin.lat,
    p_origin_lng: input.origin.lng,
    p_dest_lat: input.destination.lat,
    p_dest_lng: input.destination.lng,
  });

  // قاعدة لم تُطبَّق عليها هجرة 0012: PostgREST لا يجد الدالة (PGRST202)
  // فنسقط إلى التوقيع الرباعي القديم بدل تعطيل التسعير بالكامل.
  if (error && (error.code === "PGRST202" || error.code === "42883")) {
    ({ data, error } = await supabase.rpc("quote_price", baseArgs));
  }

  if (error) {
    return errorJson("pricing-failed", "تعذر احتساب الأسعار حالياً. حاول مرة أخرى.", 500);
  }

  // دالة تُرجع جدولاً ⇒ مصفوفة صفوف؛ الحارس يمنع انهيار .map لو تغير الشكل
  const rows: QuotePriceRow[] = Array.isArray(data) ? (data as QuotePriceRow[]) : [];
  const offers: Offer[] = rows.map((row) => {
    // `quote_public` لا ترجع مصدر السعر أصلاً؛ يبقى النداء للتوافق مع المسار
    // الاحتياطي القديم، ويظل ينقّح كل ما عدا المصدر.
    const pricing = redactPricing(row);
    return {
      classSlug: row.class_slug,
      classTitle: row.class_title,
      capacity: Number(row.capacity),
      total: Number(row.total),
      currency: "EGP",
      breakdown: {
        baseFee: Number(row.base_fee),
        distanceCost: Number(row.distance_cost),
        waitingCost: Number(row.waiting_cost),
        roundTripApplied: Boolean(row.round_trip_applied),
        peakApplied: Boolean(row.peak_applied),
        minApplied: Boolean(row.min_applied),
      },
      // المفتاح يغيب تماماً حين لا مصدر معروف — لا `pricing: undefined` في JSON
      ...(pricing ? { pricing } : {}),
    };
  });

  // ── قياس القمع (المرحلة ١٠) ─────────────────────────────────────────────
  //
  // هذا هو التغيير الوحيد الذي تلمس به المرحلة ١٠ مساراً قائماً، وعقده صريح في
  // `lib/analytics-types.ts`: **رخيص، ولا يفشل الطلب إن فشل**. عملياً:
  //   • `trackFunnelBatch` يجدول العمل بـ `after` فيقع **بعد** إرسال الرد ⇒
  //     الزائر لا يدفع ملّي‑ثانية واحدة ثمناً للقياس على أسخن مسار عام.
  //   • الحدثان يُكتبان بإدراج واحد ⇒ رحلة شبكة واحدة لا اثنتان.
  //   • الدالة لا ترمي أبداً، وجدول غير موجود بعد يُبتلع بصمت.
  //
  // 🔒 الحمولة تُبنى حقلاً حقلاً من `FunnelPayload` ولا تُنسخ من `input`: لا سعر
  // ولا مصدر سعر ولا أي أثر لمتعهد. ولا نُخرج قيمة أرخص عرض هنا لسببين — أن
  // انتقاءها حساب في TypeScript وهو ممنوع، وأن قيمة القمع الحقيقية تُقاس عند
  // الحجز لا عند العرض.
  const funnelTrip: FunnelPayload = {
    ...(input.origin.label !== "" ? { originLabel: input.origin.label } : {}),
    ...(input.destination.label !== "" ? { destLabel: input.destination.label } : {}),
    passengers: input.passengers,
    distanceKm: distance.distanceKm,
  };

  if (offers.length === 0) {
    // بحث تمّ وأنتج «لا فئة مناسبة» — خطوة قمع حقيقية تستحق التسجيل، ونسبتها
    // إلى `quote_viewed` هي بالضبط «كم بحثاً لم ينتج عرضاً».
    trackFunnelBatch([{ event: "search_performed", payload: funnelTrip }]);
    return errorJson(
      "no-classes",
      "لا توجد فئة سيارات تتسع لهذا العدد من الركاب. تواصل معنا لترتيب أكثر من سيارة.",
      200
    );
  }

  trackFunnelBatch([
    { event: "search_performed", payload: funnelTrip },
    { event: "quote_viewed", payload: funnelTrip },
  ]);

  const body: QuoteResponse = {
    ok: true,
    distanceKm: distance.distanceKm,
    durationMin: distance.durationMin,
    distanceSource: distance.source,
    offers,
  };
  return Response.json(body, { headers: NO_STORE });
}
