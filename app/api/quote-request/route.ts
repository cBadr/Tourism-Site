import { trackFunnel } from "@/lib/analytics/emit";
import { createServerSupabase } from "@/lib/supabase/server";
import { SERVICES } from "@/lib/site-config";
import { isWithinServiceArea } from "@/lib/place-search-types";

/**
 * POST /api/quote-request — طلب عرض سعر لما هو خارج الحاسبة الفورية
 * (الجولات، المناسبات، الإيجار اليومي، المجموعات الكبيرة).
 *
 * الطريق **الوحيد** دالة `create_quote_request` (security definer، هجرة 0007
 * ومحدَّثة في 0009 ثم **0084**): تُدرج الطلب وتُرجع رقمه المرجعي بلا منح الزائر
 * أي SELECT على الجدول، وتتحقق من المدخلات داخل القاعدة (طول الاسم، أرقام
 * الهاتف، سقف التفاصيل، الخدمة من القائمة المعروفة) بحيث تكون الحراسة في مكان
 * واحد.
 *
 * ── ما تغيّر في 0084: الطلب صار **مُهيكلاً** ──────────────────────────────
 * كان كل ما يعرفه الصف عن الرحلة فقرةً حرّة في `details`. صار يحمل نقطتين
 * بإحداثياتهما وموعداً وعدد ركاب وحقائب — أي بياناً يُسعَّر ويُقاس عليه، لا نصّاً
 * يُعاد سؤال العميل عنه.
 *
 * 🔴 و**لا يُسعَّر نصٌّ لم يُحلّ إلى نقطة** (D-09): `origin` و`destination` يصلان
 *    ثلاثيّين (تسمية + إحداثيتان) من نفس مكوّن البحث الذي يستعمله ويدجت الحجز،
 *    ومن أرسل تسميةً بلا إحداثيات رُفض. والتوقيع الرباعي القديم **أُسقط** في
 *    0084 فلا يبقى بابٌ خلفيّ يُدرج طلباً بلا نقطة.
 *
 * كان هنا سقوط إلى إدراج مباشر عند غياب الدالة؛ حُذف: صلاحية INSERT على
 * `public.quote_requests` سُحبت من anon وسياستها المتساهلة أُسقطت، فلم يكن
 * المسار البديل ليعمل أصلاً — كان يحوّل «الهجرة غير مطبَّقة» إلى فشل صامت.
 *
 * الخانق: خمسة طلبات لكل عنوان IP في عشر دقائق. **بأفضل جهد وبذاكرة النسخة
 * الواحدة فقط** — خريطة في الذاكرة تُصفَّر مع كل نشر أو تجميد، ولا تُشارك بين
 * نسخ الخادم (على Vercel كل نسخة خانقها المستقل). هذا يكفي لصد النموذج المكرر
 * والسكربت الساذج؛ الحماية الجادة من الإغراق تحتاج طبقة أمام التطبيق.
 */

export const runtime = "nodejs";

const NO_STORE = { "Cache-Control": "no-store" };

const MIN_NAME_LENGTH = 3;
const MAX_NAME_LENGTH = 120;
const MAX_DETAILS_LENGTH = 2000;
const MAX_PLACE_LABEL_LENGTH = 240;

/** نفس مدى القاعدة في 0084 — والقيد هناك هو الحاجز، وهذا رفضٌ مبكر برسالة أوضح */
const MAX_PASSENGERS = 200;
const MAX_LUGGAGE = 400;

const PHONE_PATTERN = /^[+\d\s()-]{8,20}$/;

const SERVICE_SLUGS = new Set(SERVICES.map((service) => service.slug));

/** الخانق: العدد الأقصى داخل النافذة، وطول النافذة */
const RATE_LIMIT = 5;
const RATE_WINDOW_MS = 10 * 60 * 1000;
/** سقف حجم الخريطة قبل كنسة تقليم شاملة — حارس ذاكرة لا سياسة أمان */
const RATE_MAP_SWEEP_AT = 5000;

/** IP ← طوابع زمنية للطلبات داخل النافذة (تُقلَّم عند كل قراءة) */
const rateHits = new Map<string, number[]>();

type QuoteRequestError = { ok: false; code: string; message: string };
type QuoteRequestSuccess = { ok: true; reference: string | null };

function errorJson(code: string, message: string, status: number): Response {
  const body: QuoteRequestError = { ok: false, code, message };
  return Response.json(body, { status, headers: NO_STORE });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function cleanLine(value: unknown, maxLength: number): string {
  if (typeof value !== "string") return "";
  return value.replace(/\s+/g, " ").trim().slice(0, maxLength);
}

function cleanBlock(value: unknown, maxLength: number): string {
  if (typeof value !== "string") return "";
  return value.replace(/\r\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim().slice(0, maxLength);
}

/**
 * عنوان الزائر خلف بروكسي Vercel: أول عنوان في x-forwarded-for هو العميل.
 * غيابه (تشغيل محلي أو ترويسة محذوفة) يعني دلواً مشتركاً باسم "unknown" —
 * وهذا مقبول: الخانق بأفضل جهد لا حارس هوية.
 */
function clientIp(request: Request): string {
  const forwarded = request.headers.get("x-forwarded-for");
  const first = forwarded?.split(",")[0]?.trim();
  if (first) return first.slice(0, 64);

  const real = request.headers.get("x-real-ip")?.trim();
  if (real) return real.slice(0, 64);

  return "unknown";
}

/** تقليم الطوابع المنتهية ثم قرار القبول — يعيد ثواني الانتظار عند المنع */
function checkRate(ip: string): { ok: true } | { ok: false; retryAfterSec: number } {
  const now = Date.now();
  const cutoff = now - RATE_WINDOW_MS;

  // كنسة شاملة عند تضخم الخريطة: المفاتيح الخاملة لا تُلمس ثانيةً بلا هذا
  if (rateHits.size > RATE_MAP_SWEEP_AT) {
    for (const [key, stamps] of rateHits) {
      const alive = stamps.filter((stamp) => stamp > cutoff);
      if (alive.length === 0) rateHits.delete(key);
      else rateHits.set(key, alive);
    }
  }

  const recent = (rateHits.get(ip) ?? []).filter((stamp) => stamp > cutoff);

  if (recent.length >= RATE_LIMIT) {
    rateHits.set(ip, recent);
    const oldest = recent[0] ?? now;
    return { ok: false, retryAfterSec: Math.max(1, Math.ceil((oldest + RATE_WINDOW_MS - now) / 1000)) };
  }

  recent.push(now);
  rateHits.set(ip, recent);
  return { ok: true };
}

/**
 * رسائل رفض الدالة الحارسة — الرمز يأتي في `hint`.
 *
 * ⚠ وهذه الخريطة كانت مكتوبةً سلفاً **وتنتظر** رموزاً لا تصل: هجرة 0009 كانت
 * ترفع `invalid-input` الجامع لكل حقل. وهجرة 0084 فصّلتها، فصار لكل حقل رسالته
 * — والعميل يعرف **أيّ** حقلٍ يصلحه بدل جملةٍ واحدة عن «بيانات غير مكتملة».
 */
const GENERIC_VALIDATION_MESSAGE =
  "بيانات الطلب غير مكتملة أو خارج الحدود المقبولة. راجع الحقول وأعد المحاولة.";

const VALIDATION_MESSAGES: Record<string, string | undefined> = {
  "invalid-input": GENERIC_VALIDATION_MESSAGE,
  "invalid-name": "اكتب اسمك كاملاً (٣ أحرف على الأقل).",
  "invalid-phone": "اكتب رقم هاتف صحيح للتواصل معك.",
  "invalid-details": "اكتب تفاصيل طلبك: الوجهة والتاريخ وعدد الأفراد وأي ملاحظات.",
  "invalid-service": "الخدمة المختارة غير معروفة. اختر خدمة من القائمة المعروضة.",
  "invalid-origin": "اختر نقطة الانطلاق من نتائج البحث حتى نعرف مكانها بالضبط.",
  "invalid-destination": "اختر الوجهة من نتائج البحث، أو اتركها فارغة إن كانت الرحلة بلا وجهة واحدة.",
  "out-of-area": "نخدم داخل مصر فقط حالياً — اختر مكاناً داخل نطاق التشغيل.",
  "invalid-pickup": "حدّد تاريخ الرحلة ووقتها.",
  "pickup-past": "موعد الرحلة يجب أن يكون في المستقبل.",
  "invalid-passengers": "اكتب عدد الركاب (واحد على الأقل).",
  "invalid-luggage": "عدد الحقائب غير صالح.",
};

/**
 * مكانٌ محلول من جسم الطلب — **ثلاثيٌّ لا يتجزأ** (D-09).
 *
 * `undefined` = لم يُرسل · `null` = أُرسل ناقصاً أو فاسداً ⇒ رفض.
 * والفرق بينهما هو ما يسمح للوجهة أن تكون اختيارية بلا أن تُقبل نصّاً بلا نقطة.
 */
type ParsedPlace = { label: string; lat: number; lng: number };

function parsePlace(value: unknown): ParsedPlace | null | undefined {
  if (value === undefined || value === null) return undefined;
  if (!isRecord(value)) return null;

  const label = cleanLine(value.label, MAX_PLACE_LABEL_LENGTH);
  const lat = typeof value.lat === "number" ? value.lat : Number.NaN;
  const lng = typeof value.lng === "number" ? value.lng : Number.NaN;

  if (label.length === 0 || !Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  return { label, lat, lng };
}

/** عددٌ صحيح داخل مدىً — وما ليس عدداً يُرفض ولا يُقرَّب بصمت */
function parseCount(value: unknown, min: number, max: number): number | null | undefined {
  if (value === undefined || value === null || value === "") return undefined;
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(n) || !Number.isInteger(n) || n < min || n > max) return null;
  return n;
}

export async function POST(request: Request) {
  // الخانق أولاً: أرخص فحص، ويمنع حتى قراءة جسم الطلب من المُغرِق
  const rate = checkRate(clientIp(request));
  if (!rate.ok) {
    const body: QuoteRequestError = {
      ok: false,
      code: "rate-limited",
      message: "وصلنا منك عدة طلبات للتو. انتظر قليلاً قبل إرسال طلب جديد، أو تواصل معنا مباشرة.",
    };
    return Response.json(body, {
      status: 429,
      headers: { ...NO_STORE, "Retry-After": String(rate.retryAfterSec) },
    });
  }

  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return errorJson("invalid-input", "جسم الطلب ليس JSON صالحاً.", 400);
  }

  if (!isRecord(raw)) {
    return errorJson("invalid-input", "جسم الطلب غير صالح.", 400);
  }

  const serviceRaw = cleanLine(raw.serviceSlug, 64);
  const serviceSlug = SERVICE_SLUGS.has(serviceRaw) ? serviceRaw : null;

  const customerName = cleanLine(raw.customerName ?? raw.name, MAX_NAME_LENGTH);
  if (customerName.length < MIN_NAME_LENGTH) {
    return errorJson("invalid-input", "اكتب اسمك كاملاً (٣ أحرف على الأقل).", 400);
  }

  const customerPhone = cleanLine(raw.customerPhone ?? raw.phone, 20);
  const digits = customerPhone.replace(/\D/g, "");
  if (!PHONE_PATTERN.test(customerPhone) || digits.length < 8 || digits.length > 15) {
    return errorJson("invalid-input", "اكتب رقم هاتف صحيح للتواصل معك.", 400);
  }

  // التفاصيل صارت **ملاحظاتٍ اختيارية**: الرحلة نفسها تحملها الحقول المُهيكلة
  // أدناه، فاشتراط فقرةٍ حرّة صار ضريبةً على من ملأ كل شيء بدقة.
  const details = cleanBlock(raw.details, MAX_DETAILS_LENGTH);

  // ── الرحلة المُهيكلة ────────────────────────────────────────────────────
  const origin = parsePlace(raw.origin);
  if (!origin) {
    return errorJson(
      "invalid-input",
      VALIDATION_MESSAGES["invalid-origin"] ?? GENERIC_VALIDATION_MESSAGE,
      400
    );
  }

  const destination = parsePlace(raw.destination);
  if (destination === null) {
    return errorJson(
      "invalid-input",
      VALIDATION_MESSAGES["invalid-destination"] ?? GENERIC_VALIDATION_MESSAGE,
      400
    );
  }

  // 🔴 مصر وحدها — `isWithinServiceArea` **نفسها** التي يرفض بها
  // `/api/geocode/reverse` وتقصّ بها الخريطة: تعريفٌ واحد لا نسخة ثانية.
  // والقاعدة تحرسها مرةً أخرى في 0084؛ الرفض هنا ليخرج رمزٌ مفهوم قبل الرحلة.
  if (!isWithinServiceArea(origin.lat, origin.lng)) {
    return errorJson("invalid-input", VALIDATION_MESSAGES["out-of-area"]!, 400);
  }
  if (destination && !isWithinServiceArea(destination.lat, destination.lng)) {
    return errorJson("invalid-input", VALIDATION_MESSAGES["out-of-area"]!, 400);
  }

  const pickupRaw = typeof raw.pickupAt === "string" ? raw.pickupAt.trim() : "";
  const pickupMs = pickupRaw ? Date.parse(pickupRaw) : Number.NaN;
  if (!Number.isFinite(pickupMs)) {
    return errorJson("invalid-input", VALIDATION_MESSAGES["invalid-pickup"]!, 400);
  }
  if (pickupMs <= Date.now()) {
    return errorJson("invalid-input", VALIDATION_MESSAGES["pickup-past"]!, 400);
  }

  const passengers = parseCount(raw.passengers, 1, MAX_PASSENGERS);
  if (!passengers) {
    return errorJson("invalid-input", VALIDATION_MESSAGES["invalid-passengers"]!, 400);
  }

  const luggage = parseCount(raw.luggage, 0, MAX_LUGGAGE);
  if (luggage === null) {
    return errorJson("invalid-input", VALIDATION_MESSAGES["invalid-luggage"]!, 400);
  }

  const supabase = await createServerSupabase();
  if (!supabase) {
    return errorJson(
      "db-unavailable",
      "خدمة طلبات الأسعار غير مهيأة بعد. تواصل معنا مباشرة وسنرسل لك عرضاً.",
      503
    );
  }

  const { data, error } = await supabase.rpc("create_quote_request", {
    p_service_slug: serviceSlug,
    p_customer_name: customerName,
    p_customer_phone: customerPhone,
    p_details: details,
    p_origin_label: origin.label,
    p_origin_lat: origin.lat,
    p_origin_lng: origin.lng,
    p_dest_label: destination?.label ?? null,
    p_dest_lat: destination?.lat ?? null,
    p_dest_lng: destination?.lng ?? null,
    p_pickup_at: new Date(pickupMs).toISOString(),
    p_passengers: passengers,
    p_luggage: luggage ?? null,
  });

  if (!error) {
    const row = Array.isArray(data) ? data[0] : data;
    const reference =
      isRecord(row) && typeof row.reference === "string" && row.reference.length > 0
        ? row.reference
        : null;
    // ── قياس القمع (المرحلة ١٠) ───────────────────────────────────────────
    // `quote_requested` كان معرَّفاً في العقد ومعروضاً في جدول `/admin/integrations`
    // ولا يُستدعى من سطر واحد في المستودع.
    //
    // ⚠ ومنذ هجرة 0023 صار هذا السطر **المصدر الوحيد** للحدث: كل ما يعرضه القمع
    // يُعدّ من `public.funnel_events` وحده، ولا تقرأ `funnel_daily` جدول
    // `quote_requests` إطلاقاً. فقدان هذا الإصدار = اختفاء «طلب عرض سعر يدوي»
    // من اللوحة كلياً (لا نقصٌ خفيّ كما كان في 0022) — وهذا هو الثمن المقبول
    // للمصدر الواحد: رقمٌ يقيس الموقع بصدق، ويسقط كاملاً إن سقط إصداره.
    // ويعني أيضاً أن حدث Lead لا يصل ميتا ولا جوجل، وهو الحدث الوحيد الذي تهتم
    // به حملة توليد العملاء.
    //
    // 🔒 الرقم المرجعي وحده (QR-…): لا اسم ولا هاتف ولا نص التفاصيل — نفس
    // انضباط `app/api/booking/route.ts`. ولا يفشل الطلب إن فشل القياس.
    trackFunnel("quote_requested", reference ? { reference } : {});

    const body: QuoteRequestSuccess = { ok: true, reference };
    return Response.json(body, { headers: NO_STORE });
  }

  // رفض الدالة الحارسة أو قيد CHECK المرآة على الجدول ⇒ خطأ مدخلات لا خطأ خادم
  const hint = (error.hint ?? "").trim();
  const validationMessage = VALIDATION_MESSAGES[hint];
  if (validationMessage) {
    return errorJson("invalid-input", validationMessage, 400);
  }
  if (error.code === "23514") {
    return errorJson("invalid-input", GENERIC_VALIDATION_MESSAGE, 400);
  }

  // الدالة غائبة (هجرة غير مطبَّقة) أو صلاحية التنفيذ غير ممنوحة ⇒ البيئة غير جاهزة.
  // لا سقوط إلى إدراج مباشر: صلاحية INSERT للزائر مسحوبة عمداً (قرار D4).
  if (error.code === "PGRST202" || error.code === "42883" || error.code === "42501") {
    return errorJson(
      "db-unavailable",
      "خدمة طلبات الأسعار غير مهيأة بعد. تواصل معنا مباشرة وسنرسل لك عرضاً.",
      503
    );
  }

  return errorJson("insert-failed", "تعذّر إرسال طلبك الآن. حاول مرة أخرى بعد قليل.", 500);
}
