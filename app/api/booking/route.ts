import { trackFunnel } from "@/lib/analytics/emit";
import { routeDistance } from "@/lib/geo/route";
import { createServiceSupabase } from "@/lib/supabase/admin";
import type {
  BookingError,
  CreateBookingRequest,
  CreateBookingResponse,
  PaymentPlan,
} from "@/lib/booking-types";

/**
 * POST /api/booking — إنشاء حجز ضيف (بلا حساب) من مدخلات الرحلة.
 *
 * المبدأ الأمني الحاكم (عقد lib/booking-types.ts): **لا سعر ولا مسافة من العميل.**
 * الجسم يحمل مدخلات الرحلة فقط؛ المسافة تُعاد حسابها هنا عبر routeDistance،
 * والسعر كله داخل `create_booking` في Postgres التي تستدعي `quote_price` وتخزّن
 * اللقطة. أي `total` أو `distanceKm` يصل من المتصفح يُتجاهَل تماماً — لا يُقرأ أصلاً.
 *
 * التنفيذ بمفتاح الخدمة (service_role) لا بمفتاح anon: صلاحية تنفيذ
 * `create_booking` سُحبت من anon و authenticated ومُنحت لـ service_role وحده،
 * فلم يبقَ إلى الدالة طريق إلا هذا المسار — وهو الوحيد الذي يحسب المسافة بنفسه.
 * لولا ذلك لأمكن استدعاء الدالة مباشرة بمفتاح anon بمسافة مُختلقة وشراء رحلة
 * القاهرة–أسوان بسعر كيلومترين. الدالة نفسها تحمل أرضية تعقّل (مقارنة بمسافة
 * الخط المستقيم) كطبقة ثانية، وكل حراسات الحالات والحدود ما زالت داخل SQL.
 *
 * المفتاح لا يُسرَّب: الوحدة `lib/supabase/admin` تحمل "server-only"، وهذا الملف
 * معالج مسار خادمي بحت (`runtime = "nodejs"`).
 *
 * المرحلة ٥ — لقطة مصدر السعر: لا تغيير وظيفياً في هذا المسار. التوقيع الخمس‑عشري
 * لـ `create_booking` وأعمدة إرجاعها السبعة كما هي، وهي التي تستدعي `quote_price`
 * بإحداثيات الرحلة (وهي تملكها أصلاً من `p_origin`/`p_destination`) وتخزّن
 * `price_source` و`subcontractor_id` و`subcontractor_cost` و`margin_amount` في صف
 * الحجز بنفسها. المسار هنا لا يمرّر شيئاً من ذلك ولا يقرؤه.
 *
 * 🔒 حدّ الـ whitelabel: جسم الرد يُبنى حقلاً حقلاً من `CreateBookingResponse`
 * (مرجع، توكن، إجمالي، مستحق، متبقٍّ، عملة) — فحتى لو أضافت الدالة أعمدة تكلفة
 * أو هوية متعهد إلى صف الإرجاع مستقبلاً فلن تتسرب إلى المتصفح من هنا.
 *
 * رموز الخطأ (الواجهة تعرض `message` مباشرة في كل الحالات):
 *   invalid-input     ٤٠٠ — مدخلات ناقصة أو خارج الحدود
 *   class-unavailable ٤٠٩ — الفئة المختارة لم تعد صالحة لهذه الرحلة
 *   pricing-failed    ٥٠٠ — تعذّر تثبيت السعر داخل قاعدة البيانات
 *   db-unavailable    ٥٠٣ — مفتاح الخدمة غائب أو الهجرة غير مطبَّقة أو خطأ غير متوقع
 */

export const runtime = "nodejs";

const NO_STORE = { "Cache-Control": "no-store" };

const MIN_PASSENGERS = 1;
const MAX_PASSENGERS = 60;
const MAX_WAITING_HOURS = 24;
const MIN_NAME_LENGTH = 3;
const MAX_NAME_LENGTH = 120;
const MAX_NOTES_LENGTH = 1000;
const MAX_LABEL_LENGTH = 240;
/** تسامح مع فارق ساعة جهاز الزائر عن الخادم */
const CLOCK_SKEW_MS = 5 * 60 * 1000;
/** أقصى مدى مستقبلي مقبول لموعد الانطلاق — سنة */
const MAX_AHEAD_MS = 365 * 24 * 60 * 60 * 1000;

/** أحرف الهاتف المسموحة — تحقق فضفاض عمداً: الأرقام المصرية تُكتب بصيغ كثيرة */
const PHONE_PATTERN = /^[+\d\s()-]{8,20}$/;

/**
 * صف create_booking كما يرجع من rpc (أسماء snake_case حسب توقيع SQL في العقد).
 *
 * الأعمدة السبعة هي كل ما يقرؤه هذا المسار. أي عمود إضافي يعود من الدالة
 * (لقطة المتعهد مثلاً) يُتجاهَل هنا بالبناء — الرد يُركَّب من هذه السبعة وحدها.
 */
type CreateBookingRow = {
  id: string;
  reference: string;
  public_token: string;
  total: number | string;
  amount_due: number | string;
  amount_remaining: number | string;
  currency: string;
};

type ParseResult =
  | { ok: true; value: CreateBookingRequest }
  | { ok: false; message: string };

function errorJson(code: string, message: string, status: number): Response {
  const body: BookingError = { ok: false, code, message };
  return Response.json(body, { status, headers: NO_STORE });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** نص مُنظَّف: مسافات مضغوطة وطول محدود */
function cleanLine(value: unknown, maxLength: number): string {
  if (typeof value !== "string") return "";
  return value.replace(/\s+/g, " ").trim().slice(0, maxLength);
}

/** نص حر يحافظ على الأسطر — لملاحظات العميل */
function cleanBlock(value: unknown, maxLength: number): string {
  if (typeof value !== "string") return "";
  return value.replace(/\r\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim().slice(0, maxLength);
}

/** نقطة بإحداثيات منتهية وضمن مجال خرائط صالح */
function parsePlace(value: unknown): { label: string; lat: number; lng: number } | null {
  if (!isRecord(value)) return null;
  const { lat, lng } = value;
  if (typeof lat !== "number" || !Number.isFinite(lat) || Math.abs(lat) > 90) return null;
  if (typeof lng !== "number" || !Number.isFinite(lng) || Math.abs(lng) > 180) return null;
  return { label: cleanLine(value.label, MAX_LABEL_LENGTH), lat, lng };
}

/** هاتف مقبول شكلياً — نحفظه كما كتبه العميل بعد ضغط المسافات */
function parsePhone(value: unknown): string | null {
  const raw = cleanLine(value, 20);
  if (!PHONE_PATTERN.test(raw)) return null;
  const digits = raw.replace(/\D/g, "");
  if (digits.length < 8 || digits.length > 15) return null;
  return raw;
}

/** موعد الانطلاق: ISO صالح في المستقبل القريب — أو null (اختياري) */
function parsePickupAt(value: unknown): { ok: true; value: string | null } | { ok: false } {
  if (value === undefined || value === null || value === "") return { ok: true, value: null };
  if (typeof value !== "string") return { ok: false };

  const date = new Date(value);
  const time = date.getTime();
  if (Number.isNaN(time)) return { ok: false };

  const now = Date.now();
  if (time < now - CLOCK_SKEW_MS) return { ok: false };
  if (time > now + MAX_AHEAD_MS) return { ok: false };

  return { ok: true, value: date.toISOString() };
}

/** تحقق كامل من جسم الطلب — رسالة عربية دقيقة لكل سبب رفض */
function parseBody(body: unknown): ParseResult {
  if (!isRecord(body)) {
    return { ok: false, message: "جسم الطلب غير صالح." };
  }

  const origin = parsePlace(body.origin);
  const destination = parsePlace(body.destination);
  if (!origin || !destination) {
    return {
      ok: false,
      message: "حدد نقطة الانطلاق ونقطة الوصول من قائمة الاقتراحات حتى نحصل على موقعيهما بدقة.",
    };
  }

  const passengers = body.passengers;
  if (
    typeof passengers !== "number" ||
    !Number.isInteger(passengers) ||
    passengers < MIN_PASSENGERS ||
    passengers > MAX_PASSENGERS
  ) {
    return { ok: false, message: "عدد الركاب يجب أن يكون بين ١ و٦٠ راكباً." };
  }

  if (typeof body.roundTrip !== "boolean") {
    return { ok: false, message: "حدد نوع الرحلة: ذهاب فقط أو ذهاب وعودة." };
  }

  const waitingHours = body.waitingHours;
  if (
    typeof waitingHours !== "number" ||
    !Number.isFinite(waitingHours) ||
    waitingHours < 0 ||
    waitingHours > MAX_WAITING_HOURS
  ) {
    return { ok: false, message: "ساعات الانتظار يجب أن تكون بين ٠ و٢٤ ساعة." };
  }

  const classSlug = cleanLine(body.classSlug, 64);
  if (classSlug.length === 0) {
    return { ok: false, message: "اختر فئة السيارة من العروض المعروضة." };
  }

  const plan = body.plan;
  if (plan !== "full" && plan !== "deposit") {
    return { ok: false, message: "اختر طريقة الدفع: كامل المبلغ أو عربون." };
  }

  const customerName = cleanLine(body.customerName, MAX_NAME_LENGTH);
  if (customerName.length < MIN_NAME_LENGTH) {
    return { ok: false, message: "اكتب اسمك كاملاً (٣ أحرف على الأقل)." };
  }

  const customerPhone = parsePhone(body.customerPhone);
  if (!customerPhone) {
    return { ok: false, message: "اكتب رقم هاتف صحيح للتواصل معك بشأن الرحلة." };
  }

  const whatsappRaw = body.customerWhatsapp;
  let customerWhatsapp: string | null = null;
  if (typeof whatsappRaw === "string" && whatsappRaw.trim().length > 0) {
    customerWhatsapp = parsePhone(whatsappRaw);
    if (!customerWhatsapp) {
      return { ok: false, message: "رقم الواتساب غير صحيح — اتركه فارغاً إن كان نفس رقم الهاتف." };
    }
  }

  const pickup = parsePickupAt(body.pickupAt);
  if (!pickup.ok) {
    return { ok: false, message: "موعد الانطلاق يجب أن يكون تاريخاً صحيحاً في المستقبل." };
  }

  const notes = cleanBlock(body.notes, MAX_NOTES_LENGTH);

  return {
    ok: true,
    value: {
      origin,
      destination,
      passengers,
      roundTrip: body.roundTrip,
      waitingHours,
      classSlug,
      plan: plan as PaymentPlan,
      customerName,
      customerPhone,
      customerWhatsapp,
      pickupAt: pickup.value,
      notes: notes.length > 0 ? notes : null,
    },
  };
}

/**
 * يترجم خطأ قاعدة البيانات إلى رمز العقد ورسالة عربية للعميل.
 *
 * دالة `create_booking` ترفع أخطاءها بـ `using hint = '<رمز العقد>'` (هجرة 0007)
 * فالـ hint هو المصدر الأدق؛ ونرجع إلى رمز PostgREST حين يغيب (خطأ بنية تحتية
 * لا خطأ منطق أعمال). لا نعرض نص خطأ SQL للعميل: رسائلنا هنا أوضح وأأمن.
 */
function mapDbError(error: { code?: string; message?: string; details?: string; hint?: string }): {
  code: string;
  message: string;
  status: number;
} {
  const hint = (error.hint ?? "").trim();

  if (hint === "invalid-input") {
    return {
      code: "invalid-input",
      message: "بيانات الرحلة غير مكتملة أو خارج الحدود المقبولة. راجع الحقول وأعد المحاولة.",
      status: 400,
    };
  }

  if (hint === "class-unavailable") {
    return {
      code: "class-unavailable",
      message: "الفئة المختارة لم تعد متاحة لهذه الرحلة. أعد حساب السعر واختر من العروض المتاحة.",
      status: 409,
    };
  }

  if (hint === "pricing-failed") {
    return {
      code: "pricing-failed",
      message: "تعذّر تثبيت سعر الرحلة الآن. أعد المحاولة بعد قليل.",
      status: 500,
    };
  }

  // الدالة غير موجودة أصلاً (هجرة غير مطبَّقة) أو صلاحية التنفيذ لم تُمنح
  // لـ service_role بعد سحبها من anon — كلاهما «البيئة غير جاهزة» لا خطأ عميل
  const code = error.code ?? "";
  if (code === "PGRST202" || code === "42883" || code === "42501") {
    return {
      code: "db-unavailable",
      message: "خدمة الحجز غير مهيأة بعد. تواصل معنا مباشرة لإتمام حجزك.",
      status: 503,
    };
  }

  return {
    code: "db-unavailable",
    message: "تعذّر إنشاء الحجز الآن. حاول مرة أخرى، أو تواصل معنا لإتمام الحجز.",
    status: 503,
  };
}

export async function POST(request: Request) {
  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return errorJson("invalid-input", "جسم الطلب ليس JSON صالحاً.", 400);
  }

  const parsed = parseBody(raw);
  if (!parsed.ok) return errorJson("invalid-input", parsed.message, 400);
  const input = parsed.value;

  // (١) عميل الخدمة أولاً — غيابه (SUPABASE_SERVICE_ROLE_KEY غير مضبوط) يعني أن
  //     الحجز الآلي معطَّل في هذه البيئة؛ نقولها قبل استهلاك طلب مسافة خارجي
  const supabase = createServiceSupabase();
  if (!supabase) {
    return errorJson(
      "db-unavailable",
      "خدمة الحجز غير مهيأة بعد. تواصل معنا مباشرة لإتمام حجزك.",
      503
    );
  }

  // (٢) المسافة تُعاد حسابها على الخادم دائماً — ما يرسله المتصفح لا يُقرأ
  let distance;
  try {
    distance = await routeDistance(input.origin, input.destination);
  } catch {
    return errorJson("pricing-failed", "تعذّر حساب مسافة الرحلة. حاول مرة أخرى.", 500);
  }

  // (٣) الإنشاء والتسعير وتوليد المرجع والتوكن — كله داخل دالة واحدة في Postgres
  const { data, error } = await supabase.rpc("create_booking", {
    p_origin: { label: input.origin.label, lat: input.origin.lat, lng: input.origin.lng },
    p_destination: {
      label: input.destination.label,
      lat: input.destination.lat,
      lng: input.destination.lng,
    },
    p_passengers: input.passengers,
    p_round_trip: input.roundTrip,
    p_waiting_hours: input.waitingHours,
    p_distance_km: distance.distanceKm,
    p_duration_min: distance.durationMin,
    p_distance_source: distance.source,
    p_class_slug: input.classSlug,
    p_plan: input.plan,
    p_customer_name: input.customerName,
    p_customer_phone: input.customerPhone,
    p_customer_whatsapp: input.customerWhatsapp,
    p_pickup_at: input.pickupAt,
    p_notes: input.notes,
  });

  if (error) {
    const mapped = mapDbError(error);
    return errorJson(mapped.code, mapped.message, mapped.status);
  }

  // دالة تُرجع جدولاً ⇒ مصفوفة صفوف؛ الحارس يحمي من تغيّر الشكل مستقبلاً
  const row = (Array.isArray(data) ? data[0] : data) as CreateBookingRow | undefined | null;
  if (!row || typeof row.public_token !== "string" || row.public_token.length === 0) {
    return errorJson(
      "class-unavailable",
      "تعذّر إنشاء الحجز بهذه الفئة. أعد حساب السعر واختر من العروض المتاحة.",
      409
    );
  }

  const body: CreateBookingResponse = {
    ok: true,
    reference: String(row.reference ?? ""),
    publicToken: row.public_token,
    total: Number(row.total ?? 0),
    amountDue: Number(row.amount_due ?? 0),
    amountRemaining: Number(row.amount_remaining ?? 0),
    currency: String(row.currency ?? "EGP"),
  };

  // ── قياس القمع (المرحلة ١٠) ─────────────────────────────────────────────
  //
  // 🔒 الحمولة تُبنى حقلاً حقلاً من `FunnelPayload`، وما يغيب عنها مقصود:
  //   • لا `customerName` ولا `customerPhone` ولا `customerWhatsapp` — PII.
  //   • لا `publicToken` — هو **مفتاح وصول** إلى صفحة متابعة الحجز، وتسريبه
  //     إلى جوجل أو ميتا تسريب صلاحية لا تسريب رقم.
  // والحدث `booking_created` لا `booking_paid`: الحجز هنا ما زال بحالة
  // `pending_payment`. عدّه شراءً يعني أن كل حجز مهجور يصير إيراداً في تقارير
  // الإعلانات — أرقام تبدو ممتازة وهي كاذبة.
  trackFunnel("booking_created", {
    reference: body.reference,
    value: body.total,
    currency: body.currency,
    classSlug: input.classSlug,
    passengers: input.passengers,
    distanceKm: distance.distanceKm,
  });

  return Response.json(body, { headers: NO_STORE });
}
