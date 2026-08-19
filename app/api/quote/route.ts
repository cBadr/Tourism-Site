import { trackFunnelBatch } from "@/lib/analytics/emit";
import { routeDistance } from "@/lib/geo/route";
import { createServiceSupabase } from "@/lib/supabase/admin";
import type { FunnelPayload } from "@/lib/analytics-types";
import {
  MAX_PLACE_LABEL_LENGTH,
  MAX_TRIP_STOPS,
  sanitizeLine,
  type TripStop,
} from "@/lib/booking-types";
import { getStopsCap } from "@/components/booking/stops-cap";
import type { QuoteError } from "@/lib/pricing-types";
import type { OfferPricing, PriceSource } from "@/lib/subcontractor-types";
import {
  parseExtrasSelection,
  parseLuggage,
  readExtraLines,
  type OfferWithExtras,
  type QuoteRequestWithExtras,
  type QuoteResponseWithExtras,
} from "@/components/booking/extras";

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
 * ══════════════════════════════════════════════════════════════════════════
 *  الدفعة ٣ (هجرة 0031) — الحقائب والخدمات وتاريخ العودة
 * ══════════════════════════════════════════════════════════════════════════
 *
 * (١) **الحقائب** تُمرَّر `p_luggage` وتُصفّى داخل `quote_price` وحدها
 *     (‏`luggage_capacity >= p_luggage` داخل CTE `eligible`). لا ترشيح هنا ولا
 *     في المتصفح: فئةٌ لا تتسع لحقائب العميل **لا تعود أصلاً** (D-12).
 *
 * (٢) **الخدمات** تُمرَّر `p_extras` **رموزاً وكميات فقط**، و`price_extras`
 *     تقرأ أسعارها من الكتالوج وتقصّ الكميات على `max_qty`. ولا يصل من المتصفح
 *     سعر ولا إجمالي — لا يُقرأ أصلاً (D-09).
 *
 * (٣) **ساعات الانتظار لم تعد حقلاً في الشاشة**، بل تُشتق من موعد العودة.
 *     و**الاشتقاق في القاعدة**: هذا المسار ينادي `derive_waiting_hours` نداءً
 *     مستقلاً ويمرّر ناتجها إلى `quote_public` — لأن `quote_public` تأخذ
 *     الساعات ولا تأخذ التاريخين (ق٧ في المواصفة). فالرقم يخرج من نفس الدالة
 *     التي ستشتقّه ثانيةً داخل `create_booking`، ولا يُحسب في TypeScript ولا في
 *     المتصفح أبداً — مصدر واحد للرقم مهما تعدد مستهلكوه (النمط ٨ في
 *     `handover/LESSONS.md`). ويعود الرقم في جسم الرد ليحمله المتصفح إلى
 *     معاينة الكوبون ثم إلى الحجز بلا اشتقاق ثانٍ.
 *
 * (٤) **الإجمالي يُعرض مفصولاً**: `ride_total` (الرحلة بعد الخصم وقبل الخدمات)
 *     و`extras_total` و`extras`، وكلها من `quote_public`. الفصل ليس تجميلاً:
 *     الكوبون يخصم الرحلة وحدها والخدمات تُجمع بعده (القرار ب في
 *     `lib/extras-types.ts`)، وشاشةٌ تُوحي بغير ذلك تَعِد بما لا تفعله القاعدة.
 *
 * الرموز التي قد ترجع:
 *   invalid-input      ٤٠٠ — جسم الطلب ناقص أو خارج الحدود
 *   no-classes         ٢٠٠ — لا فئة تتسع لعدد **الركاب** (ليس خطأ خادم)
 *   no-classes-luggage ٢٠٠ — لا فئة تتسع للركاب **والحقائب** معاً
 *   pricing-failed     ٥٠٠/٥٠٣ — فشل دالة التسعير أو بيئة غير مضبوطة
 *   stops-unsupported  ٥٠٣ — طُلبت محطات وقاعدةُ البيانات لا تعرف `p_stops` بعد
 *   distance-failed    ٥٠٠ — احتياطي لا يقع عملياً (طبقة التقدير تضمن مسافة)
 *
 * ══════════════════════════════════════════════════════════════════════════
 *  المحطات الوسطى — والفشلُ فيها **مغلقٌ** لا متسامح
 * ══════════════════════════════════════════════════════════════════════════
 *
 * الجسم يقبل `stops` (‏`TripStop[]`، عقد `lib/booking-types.ts`) ويمرّرها في
 * موضعين لا ثالث لهما:
 *   (١) `routeDistance(origin, destination, stops)` ⇒ المسافة صارت **مجموع
 *       الأرجل** لا الخط المباشر، وهي ما يُسعَّر عليه العميل.
 *   (٢) `quote_public(..., p_stops)` ⇒ القاعدةُ وحدها تقرّر أثرَها على مصدر
 *       السعر. **ولا شرطَ هنا ولا مقارنة**: كلُّ حسابٍ ماليّ في Postgres (D-05).
 *
 * 🔴 **وسلّم التوافق يسقط كلُّه حين توجد محطة.** إعادةُ النداء بلا `p_stops`
 * تعني تسعير **مسارٍ مباشر** لرحلةٍ فيها انحراف — أي أن تُطابَق قائمةُ أسعار
 * متعهدٍ سعّر رحلةً أقصر، فيُطلب منه ما لم يسعّره. فما لا نعرف تسعيره **يُرفض
 * برمزٍ صريح** ولا يُسعَّر ناقصاً؛ ونافذةُ هذا الرمز دقائقُ النشر قبل الهجرة.
 * (نفس ما حسمته `0024` في حالة الكوبون: `0024_discounts.sql:1035`.)
 *
 * ⚠ **ورمزا `no-classes*` ليسا خطأً — هما نتيجة بحث.** الواجهة **تفرّقهما عن
 * البقية** بالرمز: البقية صندوق أحمر «حاول مرة أخرى»، وهما بطاقةُ مخرج تحمل ما
 * كتبه العميل إلى `/quote-request`. ومن يضيف رمزاً جديداً هنا فليسأل أولاً: هل
 * هذا عطلٌ يُعاد معه المحاولة، أم طريقٌ آخر؟
 *
 * 🔒 **ورمزاهما يخرجان بـ`message` فارغ بقصد**: النصّ المعروض تختاره الواجهة من
 * `messages/*.json` بحسب الرمز. جملةٌ عربية يؤلّفها الخادم تصل زائرَ `/en`
 * عربيةً وتغلب النصَّ المترجم — وهذا بالضبط ما كان يقع هنا قبل هذا الإصلاح.
 * القاعدة عامة لا خاصة بهذا الموضع: **ما يعبر من الخادم إلى الواجهة رمزٌ لا
 * جملة.**
 *
 * ══════════════════════════════════════════════════════════════════════════
 *  ولا `GET` في هذا الملف — وسقف عدّاد الركاب يصل `prop`
 * ══════════════════════════════════════════════════════════════════════════
 * كان هنا `GET` يقرأ أكبر سعة ركاب من `vehicle_classes` بينما
 * `components/booking/fleet-luggage.ts` يقرأ أكبر سعة حقائب من الجدول نفسه —
 * **مصدران لرقمٍ واحد**، وهو نمط العيب الذي احترق به هذا المشروع مراراً. فصار
 * الرقمان يخرجان من قراءةٍ واحدة في ذلك الملف (`getFleetCaps`)، ويصلان الويدجت
 * `props` من غلافيه الخادميَّين (`app/book/page.tsx` و
 * `components/booking/booking-widget.tsx`) — وهما كلّ مَن يُركّب الويدجت، فلم
 * يبقَ للمسار العام منادٍ.
 */

export const runtime = "nodejs";

const NO_STORE = { "Cache-Control": "no-store" };

/**
 * الحدّ الأعلى المطلق لعدد الركاب الذي يقبله هذا المسار.
 *
 * ⚠ **حدُّ عقلٍ لا حدُّ أسطول**: ما يقرّر أي فئة تتسع هو `quote_price` وحدها
 * (‏`capacity >= p_passengers`، D-12). هذا الرقم يمنع حمولةً عبثية من الوصول إلى
 * القاعدة، ولا يُشتق من الأسطول ولا يُخفَّض معه — وإلا صار للأهلية مصدران.
 */
const MAX_PASSENGERS = 60;

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
  /** أعمدة 0031 — اختيارية للسبب نفسه: قاعدة قبل الهجرة لا ترجعها */
  ride_total?: number | string | null;
  extras_total?: number | string | null;
  extras?: unknown;
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

/**
 * أقصى طول تسمية مكان — **مستوردٌ من عقد الحجز، لا رقمٌ محلّيّ**.
 *
 * 🔴 وكان هذا الملف يقصّ وسمَ **المحطة** ولا يقصّ وسمَ المنطلق ولا الوجهة
 * إطلاقاً — يمرّان خاميْن. قِيس حياً: وسمُ منطلقٍ بـ٥٠٠٣ محارف يبدأ بـU+202E
 * وفيه U+0007 قُبل بـ٢٠٠.
 *
 * ⚠ **وحدُّ الأثر يُقال كما هو**: الوسمان هنا **لا يُخزَّنان ولا يُرسَلان** —
 * `funnel_events` بلا عمودٍ لهما بقصد، و`meta-capi` و`browser` تُسقطهما صراحةً
 * (عنوانُ الالتقاط كثيراً ما يكون بيت العميل). فالمكسبُ ثلاثة لا واحد:
 * (١) لا يعبر نصٌّ بلا حدٍّ من جسمٍ غير موثوق داخل الخادم؛ (٢) الوسمُ الذي
 * يُسعَّر هو الوسمُ الذي يُحجز — فلا يفترق مسارٌ عن مسار؛ (٣) ومن يقرأ
 * `FunnelPayload` غداً لا يرث ثقباً مفتوحاً.
 */
const MAX_LABEL_LENGTH = MAX_PLACE_LABEL_LENGTH;

/**
 * المحطات الوسطى: مصفوفةُ نقاطٍ صالحة بالترتيب — و**الرفضُ صريحٌ لا صامت**.
 *
 * ثلاثة أسباب رفض، وكلُّها تُرجع `null` ⇒ ٤٠٠:
 *   • ليست مصفوفة.
 *   • أكثر من `MAX_TRIP_STOPS` محطة (حدُّ كلفة: كل محطةٍ رجلٌ ونداءٌ خارجيّ).
 *   • محطةٌ بلا إحداثيات صالحة (D-09).
 *
 * 🔴 **ولا تُبتلع محطةٌ مشوَّهة بصمت.** إسقاطُها يعني تسعير رحلةٍ **أقصر** مما
 * سيقودها السائق — وهو العطلُ الماليّ بعينه، لا حالةٌ حافّة. والغيابُ التامّ
 * للحقل ليس رفضاً: هو رحلةُ النقطتين كما كانت دائماً.
 *
 * ⚠ **والتنقيةُ هنا شكليةٌ لا حارسٌ ثانٍ**: صحةُ النقطة رياضياً تُفحص هنا لتخرج
 * رسالةٌ مفهومة مبكراً، وكلُّ ما هو حكمٌ (تسعيرٌ · تغطيةٌ · مسافة) في القاعدة.
 */
function parseStops(value: unknown): TripStop[] | null {
  if (value === undefined || value === null) return [];
  if (!Array.isArray(value)) return null;
  if (value.length > MAX_TRIP_STOPS) return null;

  const stops: TripStop[] = [];
  for (const item of value) {
    if (!isFiniteCoords(item)) return null;
    // 🔒 التنقية مفوَّضةٌ إلى `sanitizeLine` في عقد الحجز — نفسُ ما يفعله
    //    `/api/booking` حرفاً (القاعدة الذهبية ١٢). وكان السطر هنا
    //    `label.replace(/\s+/g," ")` و`\s` لا يمسّ U+0007 ولا U+202E.
    const label = sanitizeLine((item as { label?: unknown }).label, MAX_LABEL_LENGTH);
    // 🔴 **الوسمُ الفارغ رفض** — مرآةٌ لـ`trip_stops_reject_reason` في القاعدة
    //    (`stop-label-missing`). وبلا هذا يُعرض سعرٌ لرحلةٍ ترفضها `create_booking`.
    if (label.length === 0) return null;
    stops.push({ label, lat: item.lat, lng: item.lng });
  }
  return stops;
}

/** تاريخ ISO صالح للعرض السعري — أو null. لا حدود مستقبلية هنا: هذا مسار معاينة
 *  لا يُنشئ شيئاً، وحدود الوقت الحقيقية (انحراف الساعة والسقف السنوي وترتيب
 *  العودة بعد الانطلاق) تُفرض في `/api/booking` وفي `create_booking`. */
function parseIsoOrNull(value: unknown): string | null {
  if (typeof value !== "string" || value.trim().length === 0) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

/**
 * جسمُ هذا المسار بعد المحطات.
 *
 * والتوسعةُ **محليّة** لأن `QuoteRequestWithExtras` عقدٌ يعيش في
 * `components/booking/extras.ts` — وهو خارج ملفّات هذه الجبهة، ومن يلمسه هو من
 * يبني الويدجت. والاسمُ `stops` هو نفسه في العقود الثلاثة (‏اللقطة · جسم الحجز ·
 * هذا الجسم) فلا ينحرف مفتاحٌ عن مفتاح.
 */
type QuoteRequestWithStops = QuoteRequestWithExtras & { stops: TripStop[] };

/** تحقق كامل من جسم الطلب — يرجع null عند أي خلل */
function parseQuoteRequest(body: unknown): QuoteRequestWithStops | null {
  if (typeof body !== "object" || body === null) return null;
  const b = body as Record<string, unknown>;

  if (!isFiniteCoords(b.origin) || !isFiniteCoords(b.destination)) return null;

  const passengers = b.passengers;
  if (typeof passengers !== "number" || !Number.isInteger(passengers)) return null;
  if (passengers < 1 || passengers > MAX_PASSENGERS) return null;

  const waitingHours = b.waitingHours;
  if (typeof waitingHours !== "number" || !Number.isFinite(waitingHours)) return null;
  if (waitingHours < 0 || waitingHours > 24) return null;

  if (typeof b.roundTrip !== "boolean") return null;

  // الحقائب والخدمات (0031): الرفض صريح لا صامت — قيمة خارج الحدود أو اختيار
  // مشوَّه يعني ٤٠٠، لا تسعيراً «تقريبياً» بحقائب مبتلَعة.
  const luggage = parseLuggage(b.luggage);
  if (luggage === null) return null;

  const extras = parseExtrasSelection(b.extras);
  if (extras === null) return null;

  // المحطات الوسطى — الرفض صريح (مصفوفة مشوَّهة · تجاوُز السقف · نقطة بلا إحداثيات)
  const stops = parseStops(b.stops);
  if (stops === null) return null;

  // 🔴 وسما المنطلق والوجهة يمرّان بنفس مُنقّي المحطة — كانا يعبران **خاميْن**
  //    بلا سقفٍ ولا تنقية (وحدُّ أثرهما مشروحٌ عند `MAX_LABEL_LENGTH` أعلاه).
  //    والوسمُ هنا **معلومةُ عرضٍ لا شرطُ قبول**: خلوّه لا يُفشل عرضَ سعرٍ
  //    يُحسب على الإحداثيات وحدها — بخلاف المحطة التي ترفضها القاعدة بلا وسم.
  const originLabel = sanitizeLine((b.origin as { label?: unknown }).label, MAX_LABEL_LENGTH);
  const destLabel = sanitizeLine((b.destination as { label?: unknown }).label, MAX_LABEL_LENGTH);

  return {
    stops,
    origin: {
      label: originLabel,
      lat: b.origin.lat,
      lng: b.origin.lng,
    },
    destination: {
      label: destLabel,
      lat: b.destination.lat,
      lng: b.destination.lng,
    },
    passengers,
    roundTrip: b.roundTrip,
    waitingHours,
    pickupAt: parseIsoOrNull(b.pickupAt),
    returnAt: parseIsoOrNull(b.returnAt),
    luggage,
    extras,
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

/* ------------------------------------------------------------------ */
/* POST — عرض الأسعار                                                  */
/* ------------------------------------------------------------------ */

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
      // ⚠ **بلا عددِ محطاتٍ هنا بقصد**: عددُها يحكمه سقفُ المالك، وتقوله بوابةُ
      //   `getStopsCap` أدناه بقيمته الحيّة. ورقمان لشيءٍ واحد في رسالتين يُربكان.
      "بيانات الرحلة غير مكتملة: نقطتا الانطلاق والوصول بإحداثيات صحيحة، وعدد ركاب من ١ إلى ٦٠، وعدد حقائب من ٠ إلى ٢٠، ومحطاتٌ وسطى كلٌّ منها مختارة من قائمة الاقتراحات ولها اسم.",
      400
    );
  }

  /**
   * ══════════════════════════════════════════════════════════════════════
   *  🔴 (٠) سقفُ المحطات **من القاعدة** — قبل نداء المسافة الخارجيّ
   * ══════════════════════════════════════════════════════════════════════
   *
   * كان هذا المسار يعرف `MAX_TRIP_STOPS` = ٥ وحده، والقاعدةُ تفرض
   * `max_trip_stops()` = **٣** بالافتراض (‏هجرة `0140`، يضبطه المالك في
   * `trip_settings`). قِيس حياً قبل هذا الفرع: أربعُ محطاتٍ ⇒ ٢٠٠ بسعر ٩٤٨ ج،
   * وخمسٌ ⇒ ٢٠٠ بسعر ١٠٥٩ ج — **وكلتاهما ترفضها `create_booking`**. أي أن
   * الشاشة تعرض سعراً، وتستهلك ٥–٦ أرجلٍ من OSRM لتحسبه، لرحلةٍ **لا تُحجز**.
   *
   * والقراءةُ مفوَّضةٌ إلى `getStopsCap` — نفسُ ما تقرؤه الحاسبة لتقرّر كم زرَّ
   * «أضف محطة» تعرض (القاعدة الذهبية ١٢)، فالرقمُ واحدٌ في الشاشة والمسار
   * والقاعدة.
   *
   * ⚠ **ولا نداءَ قاعدةٍ لكل طلب**: الشرطُ `hasStops` — ورحلةُ النقطتين، وهي
   * الغالبةُ الساحقة على هذا المسار الساخن، لا تدفع رحلةَ شبكةٍ واحدة.
   *
   * 🔒 **والفشلُ مغلق**: تعذّرت القراءة ⇒ `DEFAULT_STOPS_CAP` = ٣ = افتراضُ
   * العمود، أي **الأدنى لا الأعلى**.
   *
   * ⚠ **وموضعُه قبل `routeDistance` بقصد**: بعده كنّا ندفع نداءً خارجياً ثم
   * نرفض. ورمزُه `invalid-input` لا رمزٌ جديد — فالواجهة تعرض `message` لكل ما
   * ليس `no-classes*`، ورمزٌ جديد كان يلزمه فرعٌ في مكوّنٍ خارج هذه الجبهة.
   */
  if (input.stops.length > 0) {
    const cap = await getStopsCap();
    if (input.stops.length > cap) {
      return errorJson(
        "invalid-input",
        cap === 0
          ? "الرحلات متعددة المحطات غير متاحة حالياً. جرّب رحلةً من نقطة إلى نقطة، أو اطلب عرض سعر مخصص."
          : `لا يمكن إضافة أكثر من ${cap.toLocaleString("ar-EG")} محطات وسطى في الرحلة الواحدة. احذف محطة أو اطلب عرض سعر مخصص.`,
        400
      );
    }
  }

  // (١) المسافة — لا تفشل نظرياً (طبقة التقدير تضمن رقماً دائماً)، والحارس احتياط.
  //     ومع المحطات تصير **مجموع الأرجل**، ومصدرُها أضعفُ رجلٍ فيها.
  let distance;
  try {
    distance = await routeDistance(input.origin, input.destination, input.stops);
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

  // ── (٢أ) ساعات الانتظار تُشتق في القاعدة لا هنا ──────────────────────────
  //
  // الشاشة لم تعد تسأل عن ساعات انتظار (حُذف الحقل في الدفعة ٣)؛ تسأل عن **موعد
  // العودة**. والاشتقاق قاعدةُ عمل تملكها Postgres: عودة في اليوم نفسه ⇒ الفارق
  // مُقرَّباً لأعلى بسقف `MAX_DERIVED_WAITING_HOURS`، وفي يوم آخر ⇒ صفر ومعامل
  // الذهاب والعودة وحده يسعّر العودة.
  //
  // نناديها هنا نداءً مستقلاً لأن `quote_public` تأخذ الساعات لا التاريخين. وما
  // يعود منها هو **الرقم نفسه** الذي ستشتقّه `create_booking` من التاريخين
  // ذاتهما، فلا ينحرف المعروض عن المُثبَّت.
  //
  // ⚠ **وفشل هذا النداء يُفشل عرض السعر ولا يُبتلع.** لو أرجعنا صفراً عند الفشل
  // لعرضنا سعراً بلا انتظار ثم أضافته `create_booking` من عندها (فهي تشتقّه
  // داخلها بصلاحيات المالك) — أي بطاقة بسعر وحجز بسعر أعلى، وهو نمط الفشل ٢ في
  // `handover/LESSONS.md` بعينه. والصفر المشروع (عودة في يوم آخر) ليس فشلاً:
  // يأتي **من الدالة** بلا خطأ فيمرّ كما هو.
  let derivedWaiting = 0;
  if (input.returnAt && input.pickupAt) {
    const derived = await supabase.rpc("derive_waiting_hours", {
      p_pickup_at: input.pickupAt,
      p_return_at: input.returnAt,
    });
    const value = Number(derived.data);
    if (derived.error || !Number.isFinite(value) || value < 0) {
      return errorJson(
        "pricing-failed",
        "تعذر احتساب سعر رحلة العودة الآن. حاول مرة أخرى، أو اختر «ذهاب فقط».",
        500
      );
    }
    derivedWaiting = value;
  }

  // `greatest` لا استبدال — مرآةٌ حرفية لما تفعله `create_booking` (ق٨ خطوة ٢):
  // العميل قد يطلب انتظاراً أطول من فارق التوقيت، والمشتق **أرضية لا سقف**.
  // (وهذا اختيار مدة لا حساب مال؛ كل جنيه ما زال داخل SQL.)
  const waitingHours = Math.max(input.waitingHours, derivedWaiting);

  // الوسائط المشتركة بين التوقيعات — الإحداثيات وحدها هي الزيادة
  const baseArgs = {
    p_distance_km: distance.distanceKm,
    p_passengers: input.passengers,
    p_round_trip: input.roundTrip,
    p_waiting_hours: waitingHours,
  };

  const publicArgs = {
    ...baseArgs,
    p_origin_lat: input.origin.lat,
    p_origin_lng: input.origin.lng,
    p_dest_lat: input.destination.lat,
    p_dest_lng: input.destination.lng,
  };

  // `quote_public` (هجرة 0012) لا تحمل هوية المتعهد ولا تكلفته ولا الهامش في
  // نوع إرجاعها أصلاً — فتسريبها إلى المتصفح مستحيل بنيوياً لا بالانضباط.
  //
  // ⚠ **الحقائب والخدمات تُمرَّران دائماً** ولو كانا صفراً/فارغين: تمريرهما
  // شرطياً يعني توقيعين مختلفين حسب المُدخل، وأولهما يخفي فشل الآخر.
  const hasStops = input.stops.length > 0;

  let { data, error } = await supabase.rpc("quote_public", {
    ...publicArgs,
    p_luggage: input.luggage ?? 0,
    p_extras: input.extras && input.extras.length > 0 ? input.extras : null,
    // المحطات تُلحق **بالشرط**: رحلةُ النقطتين تبقى على التوقيع الذي تعرفه كل
    // قاعدة اليوم، فلا ينكسر التسعير العام لحظةَ تُطبَّق الهجرة ولا قبلها.
    ...(hasStops ? { p_stops: input.stops } : {}),
  });

  const missingSignature = (code?: string) => code === "PGRST202" || code === "42883";

  // ── سلّم التوافق أثناء النشر — ثلاث درجات، وكلٌّ منها أضعف مما فوقها ──────
  //
  // (١) قاعدة قبل 0031: التوقيع الحادي عشر غير موجود ⇒ نُعيد النداء بالتساعي.
  //     ما يسقط هنا: ترشيح الحقائب وتسعير الخدمات. والخدمات لا تسقط عملياً لأن
  //     `public_extras()` غير موجودة أصلاً في تلك القاعدة، فالكتالوج يصل فارغاً
  //     ولا يستطيع الزائر اختيار شيء. أما الحقائب فتُتجاهَل — وهو **سلوك اليوم
  //     نفسه** قبل الهجرة، لا انحدار جديد، ونافذته دقائق النشر.
  // (٢) قاعدة قبل 0012: `quote_public` نفسها غير موجودة ⇒ التوقيع الرباعي.
  //
  // 🔴 **والسلّم كلُّه موقوفٌ حين توجد محطة.** كلُّ درجةٍ فيه تُسقط `p_stops`
  // فتُسعِّر **مساراً مباشراً** لرحلةٍ فيها انحراف: تُطابَق تغطيةُ متعهدٍ سعّر
  // ما هو أقصر، فيُطلب منه ما لم يسعّره ويُعرض على العميل سعرُ رحلةٍ غير رحلته.
  // فالفشل يقع **مغلقاً** برمزٍ صريح، ونافذتُه دقائقُ النشر قبل الهجرة.
  if (hasStops) {
    if (error && missingSignature(error.code)) {
      return errorJson(
        "stops-unsupported",
        "الرحلات متعددة المحطات غير متاحة في هذه اللحظة. أعد المحاولة بعد قليل، أو احجز رحلةً من نقطة إلى نقطة.",
        503
      );
    }
  } else {
    if (error && missingSignature(error.code)) {
      ({ data, error } = await supabase.rpc("quote_public", publicArgs));
    }
    if (error && missingSignature(error.code)) {
      ({ data, error } = await supabase.rpc("quote_price", baseArgs));
    }
  }

  if (error) {
    return errorJson("pricing-failed", "تعذر احتساب الأسعار حالياً. حاول مرة أخرى.", 500);
  }

  // دالة تُرجع جدولاً ⇒ مصفوفة صفوف؛ الحارس يمنع انهيار .map لو تغير الشكل
  const rows: QuotePriceRow[] = Array.isArray(data) ? (data as QuotePriceRow[]) : [];
  const offers: OfferWithExtras[] = rows.map((row) => {
    // `quote_public` لا ترجع مصدر السعر أصلاً؛ يبقى النداء للتوافق مع المسار
    // الاحتياطي القديم، ويظل ينقّح كل ما عدا المصدر.
    const pricing = redactPricing(row);
    const total = Number(row.total);
    // قاعدة قبل 0031 لا ترجع العمودين: عندها **سعر الرحلة هو الإجمالي** بلا
    // خدمات — لا اشتقاق ولا طرح، فقط سقوط إلى الحالة التي كانت قائمة فعلاً.
    const extrasTotal = row.extras_total == null ? 0 : Number(row.extras_total);
    const rideTotal = row.ride_total == null ? total : Number(row.ride_total);
    return {
      classSlug: row.class_slug,
      classTitle: row.class_title,
      capacity: Number(row.capacity),
      total,
      currency: "EGP",
      breakdown: {
        baseFee: Number(row.base_fee),
        distanceCost: Number(row.distance_cost),
        waitingCost: Number(row.waiting_cost),
        roundTripApplied: Boolean(row.round_trip_applied),
        peakApplied: Boolean(row.peak_applied),
        minApplied: Boolean(row.min_applied),
      },
      rideTotal: Number.isFinite(rideTotal) ? rideTotal : total,
      extrasTotal: Number.isFinite(extrasTotal) ? extrasTotal : 0,
      extras: readExtraLines(row.extras),
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

    // ══════════════════════════════════════════════════════════════════════
    // 🔒 **رمزٌ لا جملة** — والسبب أن هذا الردّ يُقرأ على `/en` أيضاً.
    // ══════════════════════════════════════════════════════════════════════
    //
    // كان هذا الموضع يؤلّف جملةً عربية ويطبعها الويدجت كما هي، فتَغلب النصَّ
    // المترجم في `messages/*.json` ويرى زائر `/en` عربيةً في بطاقة الإنقاذ
    // وحدها. والقاعدة الحاكمة: **كل نص يعبر من الخادم إلى الواجهة رمزٌ لا
    // جملة** — الخادم يقول *ماذا حدث*، والواجهة تختار *بأي لغة تقوله*.
    //
    // والرمزان يفرّقان السببين اللذين كانت الجملتان تفرّقانهما بالضبط، فلا
    // معلومة ضاعت في التحويل:
    //   no-classes          — الركاب وحدهم (لم يُعلن العميل حقيبة)
    //   no-classes-luggage  — الركاب **و**الحقائب معاً، فيُقال له إن تقليل
    //                         الحقائب قد يفتح فئة (وهي نصيحة لا تصحّ بلا حقائب)
    //
    // ⚠ و`message` يخرج **فارغاً بقصد** لا مهملاً: الويدجت يقرأ الرمز ويختار
    // نصّه، ولو سقط ذلك الفرع يوماً فإن مساره العام `json.message || t(…)`
    // ينزل إلى **نصٍّ مترجم** لا إلى عربيةٍ عالقة. أي أن الإصلاح بنيوي لا
    // انضباطي: لا توجد جملة تُطبع أصلاً.
    return errorJson((input.luggage ?? 0) > 0 ? "no-classes-luggage" : "no-classes", "", 200);
  }

  trackFunnelBatch([
    { event: "search_performed", payload: funnelTrip },
    { event: "quote_viewed", payload: funnelTrip },
  ]);

  const body: QuoteResponseWithExtras = {
    ok: true,
    distanceKm: distance.distanceKm,
    durationMin: distance.durationMin,
    distanceSource: distance.source,
    offers,
    // الرقم الذي اشتقّته القاعدة — يمضي مع المتصفح إلى معاينة الكوبون وإلى
    // الحجز، فلا يشتقّه أحد مرتين ولا يظهر رقمان لشيء واحد.
    waitingHours,
  };
  return Response.json(body, { headers: NO_STORE });
}
