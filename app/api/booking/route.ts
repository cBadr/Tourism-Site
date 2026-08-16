import { trackFunnel } from "@/lib/analytics/emit";
import { routeDistance } from "@/lib/geo/route";
import { createServiceSupabase } from "@/lib/supabase/admin";
import type {
  BookingError,
  CreateBookingResponse,
  PaymentPlan,
} from "@/lib/booking-types";
import {
  parseExtrasSelection,
  parseLuggage,
  type CreateBookingRequestWithExtras,
} from "@/components/booking/extras";

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
 * المرحلة ١٢أ — الكوبون: الجسم يقبل `couponCode` (الرمز وحده، ولا مبلغ خصم
 * أبداً — نفس مبدأ «لا سعر من العميل»). يُنظَّف هنا شكلياً ويُمرَّر إلى
 * `create_booking` التي تستدعي `apply_discount` و`redeem_coupon` داخل معاملتها،
 * فتفرض أرضية الهامش وتحجز الاستخدام ذرّياً. و**رمزٌ مُرسَل ولم يُطبَّق يُفشل
 * الحجز** (‏`0024_discounts.sql:1035`): العميل اختار الحجز بسعر مخصوم، وإنشاؤه
 * بسعر أعلى بلا علمه أسوأ من رسالة خطأ. فيصل ذلك بالرمز `coupon-rejected` بحالة
 * ٤٠٩ — لا ٥٠٣ — و`Checkout` يُسقط الكوبون تلقائياً فتنجح المحاولة التالية.
 * و`total` العائد هو الإجمالي بعد الخصم، فما يُقاس في القمع أدناه هو القيمة
 * الحقيقية للحجز لا القيمة قبل الخصم.
 *
 * الدفعة ٣ (هجرة 0031) — ثلاثة حقول جديدة تمرّ **كما وصلت** إلى الدالة:
 *   `returnAt`  موعد العودة. يُتحقق منه هنا بنفس معاملة `pickupAt` حرفياً
 *               (انحراف ساعة الجهاز + سقف سنة) **وزيادةً**: يجب أن يكون بعد
 *               موعد الانطلاق، ولا يُقبل بلا موعد انطلاق أصلاً. والقاعدة تعيد
 *               الفحص نفسه بـ `hint='invalid-input'` — طبقتان لا واحدة، لأن
 *               `p_pickup_at` بقي بلا تحقق في SQL حتى هذه الهجرة.
 *   `luggage`   عدد الحقائب. لا أثر له هنا إطلاقاً غير التمرير: الأهلية
 *               (`luggage_capacity >= p_luggage`) داخل `quote_price` وحدها،
 *               وفئة لا تتسع ترجع `class-unavailable` كما اليوم.
 *   `extras`    **رموز وكميات فقط ولا سعر** — نفس مبدأ الكوبون حرفياً.
 *               `price_extras` تقرأ الأسعار من الكتالوج وتقصّها على `max_qty`،
 *               و`create_booking` تجمّدها في `booking_extras`.
 *
 * ⚠ **ساعات الانتظار لم تعد اختياراً في الشاشة**: تُشتق من موعد العودة داخل
 * `create_booking` (‏`greatest(p_waiting_hours, derive_waiting_hours(...))`).
 * وما يصل هنا في `waitingHours` هو الرقم الذي أرجعه `/api/quote` من نفس الدالة،
 * فالمعروض للعميل والمُثبَّت في الحجز رقم واحد لا رقمان.
 *
 * 🔒 حدّ الـ whitelabel: جسم الرد يُبنى حقلاً حقلاً من `CreateBookingResponse`
 * (مرجع، توكن، إجمالي، مستحق، متبقٍّ، عملة) — فحتى لو أضافت الدالة أعمدة تكلفة
 * أو هوية متعهد إلى صف الإرجاع مستقبلاً فلن تتسرب إلى المتصفح من هنا.
 *
 * المرحلة ١٢ب — النقاط: الجسم يقبل `redeemPoints` **رايةً منطقية وحدها** (ولا
 * عدد نقاط ولا مبلغ ولا معرّف حساب — نفس مبدأ الكوبون حرفياً). و**الراية
 * تُرفض اليوم مغلقةً**: التوقيع المطبَّق في `0047` ينفق رصيد الرقم المكتوب في
 * النموذج بلا إثبات ملكيته، فلا يُمرَّر المعامل أصلاً. التفصيل الكامل ومطلبُ
 * هجرة التصليب في الفرع (١ب) أدناه وفي `lib/loyalty/types.ts`.
 *
 * رموز الخطأ (الواجهة تعرض `message` مباشرة في كل الحالات):
 *   invalid-input     ٤٠٠ — مدخلات ناقصة أو خارج الحدود
 *   class-unavailable ٤٠٩ — الفئة المختارة لم تعد صالحة لهذه الرحلة
 *   coupon-rejected   ٤٠٩ — رمز الخصم لم يعد صالحاً لحظة الحجز (تُسقطه الواجهة)
 *   redeem-rejected   ٤٠٩ — تعذّر استبدال النقاط لحظة الحجز (تُسقطه الواجهة)
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
/** أقصى طول رمز كوبون — مرآة لحدّ `/api/discount/verify` */
const MAX_COUPON_LENGTH = 40;
/** تسامح مع فارق ساعة جهاز الزائر عن الخادم */
const CLOCK_SKEW_MS = 5 * 60 * 1000;
/** أقصى مدى مستقبلي مقبول لموعد الانطلاق — سنة */
const MAX_AHEAD_MS = 365 * 24 * 60 * 60 * 1000;

/** أحرف الهاتف المسموحة — تحقق فضفاض عمداً: الأرقام المصرية تُكتب بصيغ كثيرة */
const PHONE_PATTERN = /^[+\d\s()-]{8,20}$/;
/**
 * أقصى طول لرقم الرحلة الجوية قبل التطبيع — **قصٌّ لا رفض** (ج‑٣، هجرة 0067).
 *
 * 🔒 ولا نمط شكلٍ هنا بحال: «رمز شركة + أرقام» تلميحٌ في الشاشة لا حاجز في
 * المسار. رقمُ رحلةٍ خاطئ معلومةٌ ناقصة للمتعهد، ورفضُ الحجز بسببه خسارةُ
 * العميل كله — وهو نقيض ما وُجد الحقل لأجله. والقاعدة تُطبّع بنفسها
 * (`normalize_flight_number`) وتقصّ إلى ١٢، وهذا السقف يمنع حمولةً سخيفة فقط.
 */
const MAX_FLIGHT_LENGTH = 24;

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
  | { ok: true; value: CreateBookingRequestWithExtras }
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

/**
 * موعد العودة: نفس حدود موعد الانطلاق **وزيادةً** ترتيبهما.
 *
 * ثلاثة رفضات صريحة بدل تجاهل صامت:
 *   • تاريخ فاسد أو خارج النافذة (ماضٍ · أبعد من سنة) — كما `pickupAt`.
 *   • عودة بلا انطلاق: `derive_waiting_hours` تحتاج الطرفين، وحجزٌ يحمل عودةً
 *     بلا ذهاب لقطةٌ ناقصة يقرؤها التشغيل خطأً.
 *   • عودة ≤ الانطلاق: تُرفض **ولا تُتجاهَل** (نص ق٨ في المواصفة). تجاهلها يعني
 *     حجزاً يظن صاحبه أنه بعودة وليس فيه عودة.
 */
function parseReturnAt(
  value: unknown,
  pickupIso: string | null
): { ok: true; value: string | null } | { ok: false; reason: "invalid" | "no-pickup" | "order" } {
  if (value === undefined || value === null || value === "") return { ok: true, value: null };
  if (typeof value !== "string") return { ok: false, reason: "invalid" };

  const date = new Date(value);
  const time = date.getTime();
  if (Number.isNaN(time)) return { ok: false, reason: "invalid" };

  const now = Date.now();
  if (time < now - CLOCK_SKEW_MS) return { ok: false, reason: "invalid" };
  if (time > now + MAX_AHEAD_MS) return { ok: false, reason: "invalid" };

  if (!pickupIso) return { ok: false, reason: "no-pickup" };
  if (time <= new Date(pickupIso).getTime()) return { ok: false, reason: "order" };

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

  const back = parseReturnAt(body.returnAt, pickup.value);
  if (!back.ok) {
    return {
      ok: false,
      message:
        back.reason === "order"
          ? "موعد العودة يجب أن يكون بعد موعد الانطلاق."
          : back.reason === "no-pickup"
            ? "حدد موعد الانطلاق أولاً حتى نحسب رحلة العودة."
            : "موعد العودة يجب أن يكون تاريخاً صحيحاً في المستقبل.",
    };
  }

  // الحقائب والخدمات (0031) — رفض صريح لكل سبب، ولا قصّ صامت هنا: القصّ على
  // `max_qty` قرار القاعدة وحدها (`price_extras`).
  const luggage = parseLuggage(body.luggage);
  if (luggage === null) {
    return { ok: false, message: "عدد الحقائب يجب أن يكون رقماً صحيحاً بين ٠ و٢٠." };
  }

  const extras = parseExtrasSelection(body.extras);
  if (extras === null) {
    return { ok: false, message: "الخدمات الإضافية المختارة غير صالحة. أعد اختيارها من القائمة." };
  }

  const notes = cleanBlock(body.notes, MAX_NOTES_LENGTH);

  // رقم الرحلة الجوية (ج‑٣): يُنظَّف شكلياً ويُقصّ، **ولا يُرفض أبداً**.
  const flightNumber = cleanLine(body.flightNumber, MAX_FLIGHT_LENGTH);

  // رمز الكوبون: يُنظَّف ولا يُتحقق منه هنا. التحقق والحساب والحجز الذرّي
  // للاستخدام كلها داخل `create_booking` (المرحلة ١٢أ) — ورمز غير صالح لا يُفشل
  // الحجز بل يمرّ بلا خصم، فلا يخسر العميل رحلته بسبب حرف مكتوب خطأ.
  const couponCode = cleanLine(body.couponCode, MAX_COUPON_LENGTH)
    .replace(/\s+/g, "")
    .toUpperCase();

  return {
    ok: true,
    value: {
      couponCode: couponCode.length > 0 ? couponCode : null,
      // النقاط (١٢ب): **رايةٌ منطقية صارمة** — وما ليس `true` فليس طلبَ استبدال.
      // ولا يُقرأ من الجسم عددُ نقاطٍ ولا مبلغٌ ولا معرّف حساب: لا وجود لها في
      // `CreateBookingRequest` أصلاً، فتسريبُ رقمٍ من المتصفح إلى المال مستحيل
      // بنيوياً لا انضباطياً.
      redeemPoints: body.redeemPoints === true,
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
      returnAt: back.value,
      luggage,
      extras,
      flightNumber: flightNumber.length > 0 ? flightNumber : null,
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

  /**
   * ── أدنى مهلة قبل الانطلاق (أ‑٢، هجرة 0067) ─────────────────────────────
   *
   * `create_booking` ترفع `lead-time` حين يكون الموعد أقرب من
   * `booking_min_pickup_at()`. و**رمزٌ مستقل لا `invalid-input`** لسببٍ عملي:
   * العلاج مختلف تماماً. رسالةُ «راجع الحقول» تدفع العميل يفتّش في نموذجٍ كل
   * ما فيه صحيح؛ والصواب أن يعود إلى الخطوة الأولى ويختار موعداً أبعد —
   * و`Checkout` تفعل ذلك بنفسها عند رؤية هذا الرمز وتُحدّث أرضية المنتقي.
   *
   * والحالة ٤٠٩ لا ٤٠٠: لا شيء في الطلب مشوَّه — الحالة تغيّرت تحته (زحف
   * «الآن» على موعدٍ اختير قبل دقائق)، وهو بعينه معنى «تعارض».
   *
   * 🔒 و**نصّ القاعدة يُعرض كما هو** استثناءً من قاعدة هذا الملف: هو الموضع
   * الوحيد الذي يعرف أقرب موعدٍ متاح بالضبط، وإعادةُ صياغته هنا تعني حساب
   * التاريخ مرتين — بينما بقية الرموز تصف أعطالاً لا أرقاماً فيها.
   */
  if (hint === "lead-time") {
    return {
      code: "lead-time",
      message:
        (error.message ?? "").trim() ||
        "موعد الانطلاق أقرب من مهلة التجهيز. اختر موعداً أبعد وأعد التأكيد.",
      status: 409,
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

  // ── رفض الكوبون لحظة الحجز — خطأ عميل قابل للإصلاح لا عطل بنية تحتية ──────
  //
  // `create_booking` ترمي `coupon-rejected` حين لا تُطبَّق `apply_discount`
  // (منتهٍ · فئة غير مشمولة · أرضية الهامش · نفد سقفه بين المعاينة والتأكيد)،
  // و`redeem_coupon` ترمي `coupon-exhausted` و`coupon-per-customer` داخل نفس
  // المعاملة — وسقف العميل بالذات **لا تراه المعاينة أصلاً** لأنها بلا هاتف
  // بقرار تصميمي. وكلها SQLSTATE P0001 فلا يلتقطها فحص رموز PostgREST أدناه.
  // بلا هذا الفرع تصير كلها ٥٠٣ «تعذّر إنشاء الحجز… حاول مرة أخرى» — إعادةٌ
  // تفشل حتماً ما دام الرمز في الحالة، والعميل لا يعرف أن إزالته تحلّ المشكلة.
  //
  // رسالة واحدة للأسباب الثلاثة (القرار ٨: لا تفرّق للزائر بين الأسباب)، ورمز
  // مستقل تقرؤه `Checkout` فتُسقط الكوبون تلقائياً وتصير المحاولة التالية ناجحة.
  if (hint === "coupon-rejected" || hint === "coupon-exhausted" || hint === "coupon-per-customer") {
    return {
      code: "coupon-rejected",
      message: "رمز الخصم لم يعد صالحاً لهذه الرحلة. أزلناه — راجع السعر وأكّد حجزك من جديد.",
      status: 409,
    };
  }

  // ── رفض استبدال النقاط لحظة الحجز (١٢ب) — نظير الفرع أعلاه حرفاً بحرف ─────
  //
  // ⚠ **التلميح المطبَّق `points-rejected`** — قُرئ من جسم `create_booking`
  // الحيّ لا من ملف الهجرة (‏**D-58**). و`redeem-rejected` مكتوبٌ معه لأنه
  // اسم **الرمز** الذي تقرؤه `Checkout`، وأرخصُ من مطاردة تلميحٍ يتغيّر أن
  // يُترجَم الاثنان إلى الجملة الصحيحة.
  //
  // `create_booking` ترفعه حين طُلب الاستبدال وتعذّر: أُنفق
  // الرصيد في تبويبٍ آخر بين المعاينة والتأكيد، أو ضاقت المساحة المشتركة مع
  // الكوبون (‏§١)، أو أُطفئ النظام. و**الفشل مغلقٌ بقصد**: العميل اختار سعراً
  // مخفَّضاً، وإنشاء حجزٍ بسعرٍ أعلى بلا علمه أسوأ من رسالة خطأ — وهو نفس ما
  // حسمته 0024 في حالة الكوبون.
  //
  // ورمزٌ مستقل عن `coupon-rejected` لأن العلاج مختلف: `Checkout` يُسقط
  // الاستبدال **ويُبقي الكوبون** — وسقوطهما معاً يحرم العميل من خصمٍ صالح.
  if (hint === "points-rejected" || hint === "redeem-rejected") {
    return {
      code: "redeem-rejected",
      message:
        "تعذّر استخدام نقاطك في هذه الرحلة. ألغينا استخدامها — راجع السعر وأكّد حجزك من جديد، ورصيدك كما هو.",
      status: 409,
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

  /**
   * ══════════════════════════════════════════════════════════════════════
   *  🔴 (١ب) الاستبدال **يُرفض مغلقاً** حتى تُثبِت القاعدة ملكية الهاتف
   * ══════════════════════════════════════════════════════════════════════
   *
   * التوقيع المطبَّق (‏0047، مقروءٌ من الكتالوج الحيّ لا من ملف الهجرة — D-58):
   *
   *     create_booking(..., p_redeem_points integer default 0)
   *       └── apply_points(v_phone, …)   حيث  v_phone = p_customer_phone
   *
   * أي أن النقاط تُنفَق من رصيد **الرقم المكتوب في هذا النموذج**، بلا
   * `auth.uid()` في المسار وبلا قراءةٍ لـ`customer_bookings`. فمن يعرف رقم
   * عميلٍ آخر يكتبه في حجزه هو فينفق رصيد صاحبه — وهو §٢ و§٣ في العقد الأم
   * يُفتحان من بابٍ ثالث: `my_loyalty` تحرس **القراءة** بالهاتف المُثبَت
   * وحده، والكتابةُ بجوارها بلا حارس. والقراءة تكشف رصيداً، والكتابة تُنفقه.
   *
   * 🔒 **والحارس لا يمكن أن يعيش هنا.** لا دالةَ تُجيب «هل هذا الرقم من هواتف
   * جلستي المُثبَتة؟»، و`my_loyalty` لا تُرجع هاتفاً — **وهو قرارٌ صحيح** لا
   * نقص (‏`LOYALTY_FORBIDDEN_COLUMNS`)، فلا يُنقض هنا التفافاً. وفحصٌ في
   * TypeScript فوق دالةٍ بلا حارس هو «حمايةٌ بالعُرف لا بالحاجز» — وهي عبارة
   * `CONVENTIONS.md` §٦ عن `create_booking` نفسها قبل المرحلة ٤.
   *
   * فالمطلوب من هجرة التصليب: `p_redeem_profile uuid` تشترط داخلها صفَّ
   * `customer_bookings` بـ`link_source='reference'` يربط الحساب بهاتف الحجز.
   * وحينها يصير هذا الفرع نداءً بالمعرّف المُثبَت من الجلسة، ويُحذف الرفض.
   *
   * وحتى ذلك: **رفضٌ صريح لا تجاهلٌ صامت.** تجاهل الراية يعني حجزاً يُنشأ
   * بالسعر الكامل بعد أن اختار العميل سعراً مخفَّضاً — وهو ما رفضته 0024 في
   * حالة الكوبون بعينها. والرمز `redeem-rejected` تقرؤه `Checkout` فتُسقط
   * الاستبدال وتُبقي الكوبون، فتنجح المحاولة التالية فوراً.
   *
   * ⚠ ولا يقع هذا الفرع عملياً اليوم: اللوحة لا تظهر أصلاً بلا دالة المعاينة
   * (‏`lib/loyalty/types.ts`)، فلا شيء يرفع الراية. وهو حارس الغد لا رسالة اليوم.
   */
  if (input.redeemPoints) {
    return errorJson(
      "redeem-rejected",
      "تعذّر استخدام نقاطك في هذه الرحلة. ألغينا استخدامها — أكّد حجزك من جديد، ورصيدك كما هو.",
      409
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
  const baseArgs = {
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
  };

  // الخصم (المرحلة ١٢أ): **الرمز وحده يُمرَّر**، ولا مبلغ من المتصفح إطلاقاً.
  // `create_booking` تستدعي `apply_discount` و`redeem_coupon` داخل معاملتها،
  // فالحساب والحجز الذرّي للاستخدام كلاهما في القاعدة — وحجزان متزامنان على آخر
  // استخدام لا يتجاوزان السقف.
  //
  // بلا كوبون: يُستدعى التوقيع القديم حرفياً فلا يتغير شيء لأي حجز عادي.
  // ومع كوبون على قاعدة لم تُطبَّق عليها 0024 بعد: PostgREST لا يجد التوقيع
  // (PGRST202) فنُعيد المحاولة بلا المعامل — الحجز يتم بالسعر الكامل بدل أن
  // يسقط مسار الحجز كله أثناء نشر الهجرة (نفس نمط التوافق في `/api/quote`).
  //
  // وحقول 0031 تُلحق **بالشرط لا دائماً**، لنفس السبب: حجزٌ بلا عودة ولا حقائب
  // ولا خدمات يبقى نداءً بالتوقيع القائم فينجح على قاعدة لم تصلها الهجرة بعد.
  const extrasSelection = input.extras ?? [];
  const luggage = input.luggage ?? 0;
  const flightNumber = input.flightNumber ?? null;
  /**
   * حقولٌ **لا يجوز إسقاطها** عند فقدان التوقيع — انظر التعليق أسفل النداء.
   * ورقم الرحلة منها: إسقاطه يعني حجز مطارٍ يظن صاحبه أن السائق يعرف رحلته.
   */
  const hasNewSignatureFields =
    input.returnAt !== null ||
    luggage > 0 ||
    extrasSelection.length > 0 ||
    flightNumber !== null;

  const args = {
    ...baseArgs,
    ...(input.couponCode ? { p_coupon_code: input.couponCode } : {}),
    ...(input.returnAt ? { p_return_at: input.returnAt } : {}),
    ...(luggage > 0 ? { p_luggage: luggage } : {}),
    ...(extrasSelection.length > 0 ? { p_extras: extrasSelection } : {}),
    // ج‑٣: يُلحق **بالشرط** كإخوته — حجزٌ بلا رقم رحلة يبقى نداءً بالتوقيع
    // الذي تعرفه أي قاعدة لم تصلها 0067 بعد، فلا ينكسر مسار الحجز أثناء النشر.
    ...(flightNumber ? { p_flight_number: flightNumber } : {}),
    // 🔒 ولا `p_redeem_points` هنا: كل مسارٍ يطلب الاستبدال رُفض أعلاه، فلا
    // يصل هذا السطر إلا حجزٌ بلا نقاط. وحذفُ المعامل يبقي النداء على التوقيع
    // الذي تعرفه القواعد التي لم تصلها 0047 بعد.
  };

  let { data, error } = await supabase.rpc("create_booking", args);

  // ⚠ **السقوط مسموح للكوبون وحده.** إسقاط `p_return_at` أو `p_extras` عند
  // فقدان التوقيع يعني حجزاً بلا موعد عودة في لقطته وبلا الخدمات التي اختارها
  // العميل ورآها في السعر — أي إنشاء حجز مختلف عمّا وافق عليه، وهو بالضبط ما
  // رفضته 0024 في حالة الكوبون (`0024_discounts.sql:1035`). فالفشل هنا يقع
  // **مغلقاً**: ٥٠٣ ورسالة تدعو للتواصل، لا حجزاً ناقصاً بصمت.
  const missingSignature = (code?: string) => code === "PGRST202" || code === "42883";

  if (error && missingSignature(error.code) && !hasNewSignatureFields && input.couponCode) {
    ({ data, error } = await supabase.rpc("create_booking", baseArgs));
  }

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
