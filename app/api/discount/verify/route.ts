import { routeDistance } from "@/lib/geo/route";
import { createServiceSupabase } from "@/lib/supabase/admin";
import { getDiscountSettings } from "@/lib/discounts/settings";
import { checkPerMinute, clientIp } from "@/lib/discounts/rate-limit";
import { publicRejectionText, toPublicRejection } from "@/lib/discounts/messages";
import type {
  CouponRejected,
  CouponRequestError,
  PublicRejection,
  VerifyCouponRequest,
  VerifyCouponResponse,
} from "@/lib/discounts/types";

/**
 * POST /api/discount/verify — تحقق عام من رمز كوبون ومعاينة أثره على السعر.
 *
 * ── لماذا يوجد هذا المسار أصلاً ────────────────────────────────────────────
 * كي يعرف الزائر قيمة كوبونه **قبل** أن يضغط «تأكيد الحجز»، بلا أن نحسب له
 * جنيهاً واحداً في المتصفح. كل رقم يخرج من هنا خرج من `apply_discount` داخل
 * `quote_public`، وTypeScript ينقل ويُنسّق لا غير (اتفاقية ٢ في `CONVENTIONS.md`).
 *
 * ── خمس حراسات، بترتيب التنفيذ ─────────────────────────────────────────────
 *
 * (١) **خانق مزدوج الطبقة.** القرار ٧ في موجز المرحلة: مسار عام يقبل مدخلاً من
 *     المتصفح يلزمه حدّ معدّل صريح، وإلا جُرِّبت آلاف الرموز حتى يُصاب صالح.
 *     والطبقتان لأن الحدّ المُعلَن (`verify_rate_limit_per_minute`) يعيش في
 *     قاعدة البيانات — فقراءته وحدها استعلام. لذلك:
 *       • سقف مطلق ثابت في الذاكرة **قبل أي عمل** — يحمي حتى قراءة الإعداد.
 *       • ثم الحدّ الذي ضبطه المالك، وهو الملزِم عملياً (١٠ افتراضياً).
 *     دلوان مستقلان يعدّان نفس الطلب، والثاني لا يُبلَغ إلا بعد اجتياز الأول.
 *
 * (٢) **لا سعر ولا مسافة من العميل.** نفس المبدأ الحاكم في `/api/booking`:
 *     الجسم يحمل مدخلات الرحلة فقط، والمسافة تُعاد حسابها هنا، والإجمالي يأتي
 *     من `quote_public`. لو قبِلنا `total` من المتصفح لصار هذا المسار **مسبار
 *     هوامش**: يرفع المهاجم الإجمالي تدريجياً حتى يتوقف التقليص فيقرأ أرضية
 *     الهامش بالفرق — نقضاً لكل ما بُنيت عليه القاعدة ٣ في العقد الأم.
 *
 * (٣) **`quote_public` لا `apply_discount` مباشرةً.** الفرق أمنيّ لا أسلوبي:
 *     `apply_discount` تأخذ `p_partner_cost` وسيطاً، فاستدعاؤها من هنا يعني أن
 *     هذا المسار يقرأ تكلفة المتعهد ويحملها في متغيّر — سطرٌ واحد سهوٌ ويتسرب.
 *     أما `quote_public` فتقرأ التكلفة داخلها وتمرّرها بنفسها، و**لا تحمل عمود
 *     تكلفة في نوع إرجاعها أصلاً** (هجرة 0012 ثم 0024). الأمان بنيوي لا
 *     انضباطي — اتفاقية ٧ في `CONVENTIONS.md` حرفياً.
 *
 * (٤) **تنقيح الرد.** الرد يُبنى حقلاً حقلاً من `CouponApplied` —
 *     **بلا `discount_clamped`**. الدالة تحمل الراية في نوع إرجاعها ولا يقرؤها
 *     أحد هنا؛ ومصدر اللوحة هو `coupon_redemptions.clamped` لا هذا المسار.
 *     والزائر يرى قيمة الخصم الفعلية ولا يرى أن الأرضية قلّصتها: `clamped`
 *     تقول «هنا لامسنا الهامش»، ومن يجرّب رحلات مختلفة ويراقبها يرسم خريطة
 *     الهوامش من الخارج. التفصيل للوحة لا للزائر (القرار ٨).
 *
 * (٥) **لا هاتف في هذا المسار إطلاقاً.** `quote_public` لا تقبل هاتفاً بقرار
 *     من الهجرة نفسها (سقف العميل يُفرض في `redeem_coupon` داخل معاملة الحجز
 *     حيث الهاتف معروف أصلاً). فلا يُرسل رقم إلى مسار عام يقبل التخمين، ولا
 *     يُبنى هنا أي ربط بين رمز كوبون وشخص.
 *
 * ── ما لا يفعله هذا المسار ────────────────────────────────────────────────
 * لا يُصدر حدث قمع ولا يكتب صفاً في `funnel_events`: الموجز يقول صراحةً
 * «`funnel_events` بلا PII بنيوياً — لا تضف إليه حقلاً يحمل رمز كوبون مرتبطاً
 * بشخص». ولا يحجز استخداماً ولا يزيد أي عدّاد؛ الحجز الذرّي يقع في
 * `redeem_coupon` داخل معاملة `create_booking` وحدها.
 *
 * رموز الخطأ (الواجهة تعرض `message` مباشرة في كل الحالات):
 *   invalid-input     ٤٠٠ — جسم الطلب ناقص أو خارج الحدود
 *   rate-limited      ٤٢٩ — تجاوز حدّ المحاولات
 *   class-unavailable ٤٠٩ — الفئة المطلوبة غير متاحة لهذه الرحلة
 *   pricing-failed    ٥٠٠ — تعذّر حساب المسافة أو السعر
 *   db-unavailable    ٥٠٣ — البيئة غير مهيأة أو الهجرة 0024 غير مطبَّقة
 */

export const runtime = "nodejs";

const NO_STORE = { "Cache-Control": "no-store" };

const MIN_PASSENGERS = 1;
const MAX_PASSENGERS = 60;
const MAX_WAITING_HOURS = 24;
const MAX_CODE_LENGTH = 40;

/**
 * السقف المطلق للطبقة الأولى — لا يُقرأ من القاعدة بحكم التعريف: هو ما يحمي
 * قراءة القاعدة نفسها. عالٍ عمداً حتى لا يزاحم الحدّ الذي ضبطه المالك.
 */
const ABSOLUTE_MAX_PER_MINUTE = 60;

/** الجنيه عملة المعاملة — نفس تثبيت `/api/quote` و`PricingSettings.currency` */
const CURRENCY = "EGP";

/**
 * صف `quote_public` (التوقيع التساعي، هجرة 0024) — الأعمدة التي يقرؤها هذا
 * المسار وحدها. لا وجود لعمود تكلفة أو هامش في نوع الإرجاع أصلاً.
 */
type QuotePublicRow = {
  class_slug: string;
  total: number | string;
  discount_applied?: boolean | null;
  discount_code?: string | null;
  discount_amount?: number | string | null;
  /** 🔒 يُعرَّف هنا للتوثيق ولا يُقرأ ولا يُعاد — انظر الحراسة (٤) أعلاه */
  discount_clamped?: boolean | null;
  discount_rejection?: string | null;
  total_before_discount?: number | string | null;
};

function errorJson(code: string, message: string, status: number, extra?: HeadersInit): Response {
  const body: CouponRequestError = { ok: false, code, message };
  return Response.json(body, { status, headers: { ...NO_STORE, ...extra } });
}

/** رفض كوبون — ليس خطأ طلب: الحالة ٢٠٠ لأن التحقق تمّ ونتيجته «لا» */
function rejectedJson(rejection: PublicRejection): Response {
  const body: CouponRejected = {
    ok: true,
    applied: false,
    rejection,
    message: publicRejectionText(rejection),
  };
  return Response.json(body, { headers: NO_STORE });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isFiniteCoords(v: unknown): v is { lat: number; lng: number } {
  if (!isRecord(v)) return false;
  const { lat, lng } = v;
  return (
    typeof lat === "number" &&
    Number.isFinite(lat) &&
    Math.abs(lat) <= 90 &&
    typeof lng === "number" &&
    Number.isFinite(lng) &&
    Math.abs(lng) <= 180
  );
}

function cleanLine(value: unknown, maxLength: number): string {
  if (typeof value !== "string") return "";
  return value.replace(/\s+/g, " ").trim().slice(0, maxLength);
}

/**
 * تنظيف الرمز: حذف كل المسافات ورفع الحروف — مرآةُ نقلٍ لا مقارنة.
 *
 * المقارنة الفعلية تبقى في `discount_normalize_code` داخل القاعدة، وهي المصدر
 * الوحيد للتطبيع (نصّ الهجرة: «كي لا ينحرف المخزَّن عن المبحوث عنه»). ما يجري
 * هنا منعُ فشلٍ سببه مسافة التقطتها لوحة مفاتيح الجوال قبل أن يصل الرمز أصلاً.
 */
function normalizeCode(value: unknown): string {
  if (typeof value !== "string") return "";
  return value.replace(/\s+/g, "").slice(0, MAX_CODE_LENGTH).toUpperCase();
}

type ParseResult = { ok: true; value: VerifyCouponRequest } | { ok: false; message: string };

function parseBody(body: unknown): ParseResult {
  if (!isRecord(body)) return { ok: false, message: "جسم الطلب غير صالح." };

  const code = normalizeCode(body.code);
  if (code.length === 0) {
    return { ok: false, message: "اكتب رمز الخصم كما وصلك." };
  }

  if (!isFiniteCoords(body.origin) || !isFiniteCoords(body.destination)) {
    return {
      ok: false,
      message: "بيانات الرحلة غير مكتملة. أعد حساب السعر ثم جرّب الرمز مرة أخرى.",
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
    return { ok: false, message: "اختر فئة السيارة أولاً ثم جرّب رمز الخصم." };
  }

  return {
    ok: true,
    value: {
      code,
      origin: { lat: body.origin.lat, lng: body.origin.lng },
      destination: { lat: body.destination.lat, lng: body.destination.lng },
      passengers,
      roundTrip: body.roundTrip,
      waitingHours,
      classSlug,
    },
  };
}

/** الدالة غائبة أو صلاحيتها غير ممنوحة ⇒ البيئة غير جاهزة لا خطأ عميل */
function isMissingFunction(code: string | undefined): boolean {
  return code === "PGRST202" || code === "42883" || code === "42501";
}

const ENV_MESSAGE = "خدمة الخصومات غير مهيأة بعد. تابع حجزك بالسعر المعروض.";

export async function POST(request: Request): Promise<Response> {
  const ip = clientIp(request);

  // ── الحراسة (١أ): السقف المطلق — أرخص فحص، وقبل أي قراءة أو تحليل ──────
  const hardLimit = checkPerMinute(`discount:hard:${ip}`, ABSOLUTE_MAX_PER_MINUTE);
  if (!hardLimit.ok) {
    return errorJson("rate-limited", publicRejectionText("rate-limited"), 429, {
      "Retry-After": String(hardLimit.retryAfterSec),
    });
  }

  const settings = await getDiscountSettings();

  // ── الحراسة (١ب): الحدّ الذي ضبطه المالك ──────────────────────────────
  const rate = checkPerMinute(`discount:cfg:${ip}`, settings.verifyRateLimitPerMinute);
  if (!rate.ok) {
    return errorJson("rate-limited", publicRejectionText("rate-limited"), 429, {
      "Retry-After": String(rate.retryAfterSec),
    });
  }

  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return errorJson("invalid-input", "جسم الطلب ليس JSON صالحاً.", 400);
  }

  const parsed = parseBody(raw);
  if (!parsed.ok) return errorJson("invalid-input", parsed.message, 400);
  const input = parsed.value;

  // نظام الخصومات مطفأ ⇒ **نفس رسالة الرمز غير الصالح** لا رسالة «النظام مغلق»:
  // الفرق بين الردّين يخبر المخمّن أن ثمة حملة قائمة من عدمها.
  if (!settings.enabled) return rejectedJson("unavailable");

  // عميل الخدمة — وهو **شرط** لا أسلوب: `quote_public` ممنوحة لـ anon للتسعير
  // بلا رمز (الموقع يسعّر قبل الدخول)، لكنها ترفض **معامل الكوبون** حين يكون دور
  // الاتصال anon أو authenticated (حارس في مطلع الدالة، 0024). فبمفتاح anon لا
  // يمرّ رمزٌ إلى القاعدة أصلاً، وهذا المسار — بخانقه — هو الطريق الوحيد إليها.
  const supabase = createServiceSupabase();
  if (!supabase) return errorJson("db-unavailable", ENV_MESSAGE, 503);

  // ── (٢) المسافة تُعاد حسابها على الخادم — ما يرسله المتصفح لا يُقرأ ─────
  let distance;
  try {
    distance = await routeDistance(input.origin, input.destination);
  } catch {
    return errorJson("pricing-failed", "تعذّر حساب مسافة الرحلة. حاول مرة أخرى.", 500);
  }

  // ── (٣) السعر والخصم في استدعاء واحد بلا أي رقم داخلي يعبر إلى هنا ─────
  const { data, error } = await supabase.rpc("quote_public", {
    p_distance_km: distance.distanceKm,
    p_passengers: input.passengers,
    p_round_trip: input.roundTrip,
    p_waiting_hours: input.waitingHours,
    p_origin_lat: input.origin.lat,
    p_origin_lng: input.origin.lng,
    p_dest_lat: input.destination.lat,
    p_dest_lng: input.destination.lng,
    p_coupon_code: input.code,
  });

  if (error) {
    // التوقيع التساعي غير موجود (هجرة 0024 غير مطبَّقة) ⇒ البيئة غير جاهزة.
    // ولا سقوط إلى التوقيع الثماني: نتيجته «سعر بلا خصم» تُعرض للزائر على أنها
    // «الرمز غير صالح» — كذبة تُفقد المالك حملته بلا أثر في أي سجل.
    if (isMissingFunction(error.code)) {
      return errorJson("db-unavailable", ENV_MESSAGE, 503);
    }
    return errorJson("pricing-failed", "تعذّر التحقق من الرمز الآن. حاول مرة أخرى.", 500);
  }

  const rows: QuotePublicRow[] = Array.isArray(data) ? (data as QuotePublicRow[]) : [];
  const row = rows.find((candidate) => candidate.class_slug === input.classSlug);
  if (!row) {
    return errorJson(
      "class-unavailable",
      "الفئة المختارة لم تعد متاحة لهذه الرحلة. أعد حساب السعر واختر من العروض المتاحة.",
      409
    );
  }

  // صف بلا حقول خصم = قاعدة أقدم من الهجرة ردّت على توقيع آخر ⇒ نفشل مغلقاً
  if (row.discount_applied !== true) {
    return rejectedJson(toPublicRejection(row.discount_rejection));
  }

  const amount = Number(row.discount_amount ?? 0);
  const totalAfter = Number(row.total);
  const totalBefore = Number(row.total_before_discount ?? row.total);
  if (!Number.isFinite(amount) || !Number.isFinite(totalAfter) || !Number.isFinite(totalBefore)) {
    return rejectedJson("not-applicable");
  }

  // 🔒 الرد يُبنى حقلاً حقلاً — `row.discount_clamped` **لا يُقرأ ولا يُنسخ**،
  // ولا يوجد في `CouponApplied` مكان يستقبله أصلاً.
  const body: VerifyCouponResponse = {
    ok: true,
    applied: true,
    code: row.discount_code ?? input.code,
    amount,
    totalBefore,
    totalAfter,
    currency: CURRENCY,
  };
  return Response.json(body, { headers: NO_STORE });
}
