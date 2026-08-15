import { routeDistance } from "@/lib/geo/route";
import { createServiceSupabase } from "@/lib/supabase/admin";
import { createServerSupabase } from "@/lib/supabase/server";
import { checkPerMinute, clientIp } from "@/lib/discounts/rate-limit";
import { isSchemaMissing } from "@/lib/supabase/schema-errors";
import { isLoyaltyEnabled } from "@/lib/loyalty/settings";
import { redeemText, toRedeemReason } from "@/lib/loyalty/messages";
import type {
  RedeemDeclined,
  RedeemRequest,
  RedeemRequestError,
  RedeemResponse,
  RedeemUnavailable,
} from "@/lib/loyalty/types";
import { parseLuggage } from "@/components/booking/extras";

/**
 * POST /api/loyalty/preview — كم من نقاط العميل تُنفَق على هذه الرحلة، وكم يوفّر.
 *
 * نظير `/api/discount/verify` في موضعه من المسار: يسبق التأكيد ليعرف العميل ما
 * الذي سيتغيّر، **ولا يحجز شيئاً ولا يخصم نقطة**. الخصم الذرّي كلّه في
 * `redeem_points` داخل معاملة `create_booking` وحدها (‏**D-48**).
 *
 * ══════════════════════════════════════════════════════════════════════════
 *  🔒 (١) الهوية من الجلسة، ولا معرّف يُقبل من الجسم
 * ══════════════════════════════════════════════════════════════════════════
 *
 * صاحبُ الرصيد يُشتقّ هنا من `auth.getUser()` — لا من حقلٍ في الطلب. ولو قُبل
 * معرّفٌ من المتصفح لصار **إنفاق رصيد أي حسابٍ نداءً واحداً**، وهو أوضح ثغرة
 * يمكن أن تُفتح في هذه المرحلة كلها.
 *
 * و`getUser()` لا `getSession()`: الأولى تتحقق من التوكن مع خادم المصادقة،
 * والثانية تصدّق ما في الكوكي كما هو — نفس ما تفعله بوابة `/account` والبورتال.
 *
 * ══════════════════════════════════════════════════════════════════════════
 *  🔒 (٢) ولماذا مفتاح الخدمة **بعد** إثبات الهوية بجلسة صاحبها
 * ══════════════════════════════════════════════════════════════════════════
 *
 * `preview_redeem_points` تسعّر الرحلة وتقرأ أرضية الهامش، فهي ممنوحة لـ
 * `service_role` وحده كـ`discount_floor_room` وللسبب نفسه: كل متعهد مستخدم
 * `authenticated`، ومنحُها له يسلّمه مسبار هوامش بنداءين.
 *
 * فالترتيب هو الحارس، وهو نفس ترتيب `openBooking` حرفاً بحرف: **يُثبَت الإذن
 * أولاً بجلسة صاحبه، ثم — وبعدها فقط — يُنفَّذ بمفتاح الخدمة.** ومن يقلبهما
 * يكون قد قرأ رصيد حسابٍ قبل أن يسأل عن صاحبه.
 *
 * ══════════════════════════════════════════════════════════════════════════
 *  🔒 (٣) لا سعر ولا مسافة ولا عدد نقاط من العميل
 * ══════════════════════════════════════════════════════════════════════════
 *
 * الجسم يحمل مدخلات الرحلة ورمز الكوبون المطبَّق فقط. المسافة تُعاد حسابها هنا،
 * والسعر والأرضية والرصيد كلها داخل الدالة. ولا حقلَ نقاطٍ في الطلب أصلاً
 * (‏`RedeemRequest`): **UI يقترح، والقاعدة تقرّر** — وهي D-05 بلفظها.
 *
 * ⚠ **ورمز الكوبون حقلٌ إلزامي المعنى لا زخرفة**: §١ في العقد الأم تقول إن
 * السقف **واحد للطبقتين مجتمعتين**. فمعاينةٌ تجهل الكوبون تَعِد بنقاطٍ أكله
 * الكوبون سلفاً — ثم إمّا تُخيّب العميل لحظة التأكيد، أو تمرّ فتنزل بالإجمالي
 * تحت أرضية المتعهد. وهو العطب الصامت الذي وُلدت `0046` لإغلاقه.
 *
 * ── وما لا يخرج من هنا ────────────────────────────────────────────────────
 * لا رايةَ «قلّصته الأرضية»، ولا سببٌ يفرّق «لا مساحة» عن «الكوبون أخذ السقف»:
 * كلاهما `not-applicable` بلا رقم (‏`lib/loyalty/messages.ts`). ولا `phone_norm`
 * ولا تكلفة ولا هامش — لا مكان لها في نوع الرد أصلاً.
 *
 * رموز الخطأ:
 *   invalid-input   ٤٠٠ — جسم الطلب ناقص أو خارج الحدود
 *   rate-limited    ٤٢٩ — تجاوز حدّ المحاولات
 *   pricing-failed  ٥٠٠ — تعذّر حساب المسافة أو السعر
 *   db-unavailable  ٥٠٣ — البيئة غير مهيأة
 * وما عدا ذلك ليس خطأً بل **جواباً بـ«لا»**: حالة ٢٠٠ و`available: false` بسببها.
 */

export const runtime = "nodejs";

const NO_STORE = { "Cache-Control": "no-store" };

const MIN_PASSENGERS = 1;
const MAX_PASSENGERS = 60;
const MAX_WAITING_HOURS = 24;
const MAX_CODE_LENGTH = 40;

/**
 * السقف المطلق لكل عنوان — أرخص فحص وأول ما يُنفَّذ، قبل أي قراءة أو مصادقة.
 * عالٍ عمداً: هو حارس البنية التحتية لا حدّ الاستعمال.
 */
const ABSOLUTE_MAX_PER_MINUTE = 60;

/**
 * الحدّ الملزِم عملياً — **على معرّف الحساب لا على العنوان**، وهذا هو الفرق عن
 * `/api/discount/verify`. المعاينة هنا تكلّف نداء مسافةٍ خارجياً وتسعيراً كاملاً،
 * ومسارها خلف تسجيل دخول ⇒ فالمفتاح المتاح **لا يُزوَّر ولا يُدوَّر**: معرّف
 * الحساب من الجلسة. ودلو العنوان وحده كان يخنق مقهىً أو شبكة جوّالٍ كاملة بينما
 * يمرّ صاحبُ عشرة حسابات بلا حدّ.
 */
const MAX_PREVIEWS_PER_MINUTE = 12;

function errorJson(code: string, message: string, status: number, extra?: HeadersInit): Response {
  const body: RedeemRequestError = { ok: false, code, message };
  return Response.json(body, { status, headers: { ...NO_STORE, ...extra } });
}

/** «لا» ليست خطأ: الاستعلام تمّ ونتيجته أن الاستبدال غير متاح */
function declinedJson(reason: RedeemUnavailable): Response {
  const body: RedeemDeclined = {
    ok: true,
    available: false,
    reason,
    message: redeemText(reason),
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

/** تنظيف رمز الكوبون — مرآةُ نقلٍ لا مقارنة، والتطبيع الحقيقي في القاعدة */
function normalizeCode(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const cleaned = value.replace(/\s+/g, "").slice(0, MAX_CODE_LENGTH).toUpperCase();
  return cleaned.length > 0 ? cleaned : null;
}

type ParseResult = { ok: true; value: RedeemRequest } | { ok: false; message: string };

function parseBody(body: unknown): ParseResult {
  if (!isRecord(body)) return { ok: false, message: "جسم الطلب غير صالح." };

  if (!isFiniteCoords(body.origin) || !isFiniteCoords(body.destination)) {
    return { ok: false, message: "بيانات الرحلة غير مكتملة. أعد حساب السعر ثم حاول مرة أخرى." };
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
    return { ok: false, message: "اختر فئة السيارة أولاً." };
  }

  // نفس مُحلِّل `/api/quote` حرفياً — مصدر واحد لحدود الحقائب، ورفضٌ صريح لا ابتلاع
  const luggage = parseLuggage(body.luggage);
  if (luggage === null) {
    return { ok: false, message: "عدد الحقائب يجب أن يكون عدداً صحيحاً بين ٠ و٢٠." };
  }

  return {
    ok: true,
    value: {
      origin: { lat: body.origin.lat, lng: body.origin.lng },
      destination: { lat: body.destination.lat, lng: body.destination.lng },
      passengers,
      roundTrip: body.roundTrip,
      waitingHours,
      luggage,
      classSlug,
      couponCode: normalizeCode(body.couponCode),
    },
  };
}

/** صفُّ `preview_redeem_points` — الأعمدة التي يقرؤها هذا المسار وحدها */
type PreviewRow = {
  points?: number | string | null;
  worth?: number | string | null;
  balance?: number | string | null;
  ride_before?: number | string | null;
  ride_after?: number | string | null;
  currency?: string | null;
  reason?: string | null;
};

const num = (value: unknown): number => {
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

export async function POST(request: Request): Promise<Response> {
  // ── (١) السقف المطلق: قبل أي قراءة أو مصادقة ────────────────────────────
  const hardLimit = checkPerMinute(`redeem:hard:${clientIp(request)}`, ABSOLUTE_MAX_PER_MINUTE);
  if (!hardLimit.ok) {
    return errorJson("rate-limited", redeemText("rate-limited"), 429, {
      "Retry-After": String(hardLimit.retryAfterSec),
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

  // ── (٢) النظام مطفأ أو غير مجهَّز ⇒ «غير متاح» لا خطأ ────────────────────
  //
  // ⚠ **وهذه هي حالة القاعدة اليوم**: محرّك الولاء لم يُطبَّق بعد، فـ
  // `loyalty_enabled()` غير موجودة و`isLoyaltyEnabled` تُرجع `false` بلا رمي.
  // فالمسار حيٌّ وصادق قبل الهجرة: يردّ «غير متاح» ولا ينهار ولا يَعِد.
  if (!(await isLoyaltyEnabled())) return declinedJson("unavailable");

  // ── (٣) 🔒 الهوية من الجلسة وحدها ───────────────────────────────────────
  const session = await createServerSupabase();
  if (!session) return errorJson("db-unavailable", redeemText("unavailable"), 503);

  const { data: auth } = await session.auth.getUser();
  const profileId = auth?.user?.id ?? null;
  if (!profileId) return declinedJson("signed-out");

  // ── (٤) الحدّ على الحساب — مفتاحٌ لا يُزوَّر ولا يُدوَّر ─────────────────
  const rate = checkPerMinute(`redeem:acct:${profileId}`, MAX_PREVIEWS_PER_MINUTE);
  if (!rate.ok) {
    return errorJson("rate-limited", redeemText("rate-limited"), 429, {
      "Retry-After": String(rate.retryAfterSec),
    });
  }

  const service = createServiceSupabase();
  if (!service) return errorJson("db-unavailable", redeemText("unavailable"), 503);

  // ── (٥) المسافة تُعاد حسابها على الخادم — ما يرسله المتصفح لا يُقرأ ──────
  let distance;
  try {
    distance = await routeDistance(input.origin, input.destination);
  } catch {
    return errorJson("pricing-failed", "تعذّر حساب مسافة الرحلة. حاول مرة أخرى.", 500);
  }

  // ── (٦) النداء الوحيد: التسعير والكوبون والأرضية والرصيد في دالة واحدة ──
  const { data, error } = await service.rpc("preview_redeem_points", {
    p_profile: profileId,
    p_distance_km: distance.distanceKm,
    p_passengers: input.passengers,
    p_round_trip: input.roundTrip,
    p_waiting_hours: input.waitingHours,
    p_origin_lat: input.origin.lat,
    p_origin_lng: input.origin.lng,
    p_dest_lat: input.destination.lat,
    p_dest_lng: input.destination.lng,
    p_class_slug: input.classSlug,
    p_coupon_code: input.couponCode,
    p_luggage: input.luggage,
  });

  if (error) {
    // هجرة المحرّك غير مطبَّقة، أو الصلاحية غير ممنوحة ⇒ «غير متاح» لا عطل:
    // العميل يتابع حجزه بالسعر المعروض ولا يرى شاشة خطأ على ميزةٍ ثانوية.
    // 🔒 ولا سقوطَ إلى توقيعٍ أقدم كما في مسار الكوبون: لا توقيع أقدم لهذه
    // الدالة أصلاً، وأي «تسامح» هنا يعني تقديرَ خصمٍ من عندنا — وهو ما يمنعه
    // D-05 قبل أي اعتبار آخر.
    if (isSchemaMissing(error) || error.code === "42501") return declinedJson("unavailable");
    return errorJson("pricing-failed", "تعذّر حساب قيمة نقاطك الآن. حاول مرة أخرى.", 500);
  }

  const row = (Array.isArray(data) ? data[0] : data) as PreviewRow | undefined | null;
  if (!row) return declinedJson("not-applicable");

  const points = num(row.points);
  const worth = num(row.worth);
  const rideAfter = num(row.ride_after);

  // صفرُ نقاطٍ ليس عرضاً: تُقرأ منه **علّته** كما أرجعتها القاعدة، والقيمةُ
  // المجهولة تسقط إلى `not-applicable` (الفشل مغلقاً — `toRedeemReason`).
  if (points <= 0 || worth <= 0) return declinedJson(toRedeemReason(row.reason));

  // 🔒 الرد يُبنى حقلاً حقلاً: ما ليس في `RedeemOffered` لا يخرج ولو أضافت
  // الدالة عموداً غداً — نفس تنقيح `/api/discount/verify` حرفاً بحرف.
  const body: RedeemResponse = {
    ok: true,
    available: true,
    points,
    worth,
    balance: num(row.balance),
    rideBefore: num(row.ride_before),
    rideAfter,
    currency: typeof row.currency === "string" && row.currency.trim() ? row.currency.trim() : "EGP",
  };
  return Response.json(body, { headers: NO_STORE });
}
