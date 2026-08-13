import "server-only";

import type { Coupon, DiscountSettings, PromoBanner } from "@/lib/discount-types";
import { DEFAULT_DISCOUNT_SETTINGS } from "@/lib/discount-types";
import {
  boolOf,
  classifyStatsError,
  numberOf,
  rowsOf,
  type StatsFailure,
  textOf,
} from "@/lib/stats/read";
import type { createServerSupabase } from "@/lib/supabase/server";

/**
 * قرّاء شاشات الخصومات — **قراءة وتحويل شكل فقط، صفر حساب**.
 *
 * (١) لا رقم يُشتق هنا: قيمة الخصم وعدّاد الاستخدام والقيمة الاسمية كلها تصل
 *     كما كتبتها القاعدة. حتى نسبة «المستخدم من السقف» لا تُحسب — الشاشة تعرض
 *     العددين ورسم شريط، والشريط هندسة عرض لا رقم يُطبع.
 *
 * (٢) عميل الجلسة لا عميل الخدمة: كل قراءة تمر على RLS وعلى حارس الدور في
 *     `app/admin/layout.tsx`. مفتاح الخدمة هنا كان سيحوّل أي خلل في الحارس إلى
 *     تسريب كامل (النمط ١ في `handover/LESSONS.md`).
 *
 * (٣) قراءة **متسامحة بأسماء الأعمدة**: هجرة 0024 يكتبها وكيل آخر في نفس
 *     المرحلة. الاسم الأول في كل قائمة هو المعتمد في العقد
 *     (`lib/discount-types.ts`) والباقي شبكة أمان — والانحراف حين يقع يظهر
 *     «—» لا صفراً كاذباً.
 *
 * (٤) التمييز بين «الهجرة لم تُنفَّذ» و«ممنوع» و«فشل قراءة»: أدوات التصنيف
 *     مستوردة من طبقة الإحصائيات نفسها (`lib/stats/read.ts`) كي لا يوجد
 *     تعريفان لمعنى «القاعدة غير جاهزة» في لوحة واحدة.
 */

type Supabase = NonNullable<Awaited<ReturnType<typeof createServerSupabase>>>;

export type { StatsFailure as DiscountFailure };

export type Read<T> = {
  data: T;
  /** هل وصلت البيانات فعلاً؟ `false` يعني اعرض سبباً لا صفراً */
  ready: boolean;
  failure: StatsFailure | null;
  /** اسم ما تعذّرت قراءته — يظهر للمالك ليعرف أي هجرة ينفّذ */
  missing: string | null;
};

const ok = <T,>(data: T): Read<T> => ({ data, ready: true, failure: null, missing: null });

const failed = <T,>(
  data: T,
  name: string,
  error: { code?: string; hint?: string | null; message?: string } | null
): Read<T> => ({ data, ready: false, failure: classifyStatsError(error), missing: name });

/** حالة ابتدائية حين لا عميل قاعدة بيانات أصلاً (بيئة غير مربوطة) */
export const blank = <T,>(data: T, name: string): Read<T> => ({
  data,
  ready: false,
  failure: null,
  missing: name,
});

export const hasSupabaseEnv = () =>
  Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);

/** سقف صفوف الجداول التفصيلية — شاشة تشغيل لا أرشيف */
export const MAX_ROWS = 200;

// ---------------------------------------------------------------------------
// (١) إعدادات نظام الخصومات
// ---------------------------------------------------------------------------

export type LoadedDiscountSettings = DiscountSettings & {
  /** معرّف الصف الوحيد — قد يغيب على جدول بلا عمود id */
  id: string | null;
  /** هل وُجد صف فعلاً؟ `false` يعني أن المعروض هو افتراضي العقد لا محفوظ */
  exists: boolean;
};

const SETTINGS_FALLBACK: LoadedDiscountSettings = {
  ...DEFAULT_DISCOUNT_SETTINGS,
  id: null,
  exists: false,
};

/**
 * `discount_settings` — جدول صف واحد كنظيره `pricing_settings`.
 *
 * حين لا يوجد صف تُعرض قيم `DEFAULT_DISCOUNT_SETTINGS` من العقد **موسومةً بأنها
 * افتراضية لا محفوظة**، وأهمها `enabled = false`: النظام مطفأ في البذرة (القرار
 * ١٠)، وعرضه «مفعّلاً» قبل وجود صف كان سيجعل المالك يظن أن حملةً تعمل.
 */
export async function readDiscountSettings(
  supabase: Supabase
): Promise<Read<LoadedDiscountSettings>> {
  const res = await supabase.from("discount_settings").select("*").limit(1).maybeSingle();
  if (res.error) return failed(SETTINGS_FALLBACK, "discount_settings", res.error);

  const row = (res.data ?? null) as Record<string, unknown> | null;
  if (!row) return ok(SETTINGS_FALLBACK);

  return ok({
    id: textOf(row, ["id"]),
    exists: true,
    enabled: boolOf(row, ["enabled"], false),
    maxPercent: numberOf(row, ["max_percent", "maxPercent"]) ?? DEFAULT_DISCOUNT_SETTINGS.maxPercent,
    minMarginPercentAfterDiscount:
      numberOf(row, ["min_margin_percent_after_discount", "minMarginPercentAfterDiscount"]) ??
      DEFAULT_DISCOUNT_SETTINGS.minMarginPercentAfterDiscount,
    minMarginAmountAfterDiscount:
      numberOf(row, ["min_margin_amount_after_discount", "minMarginAmountAfterDiscount"]) ??
      DEFAULT_DISCOUNT_SETTINGS.minMarginAmountAfterDiscount,
    verifyRateLimitPerMinute:
      numberOf(row, ["verify_rate_limit_per_minute", "verifyRateLimitPerMinute"]) ??
      DEFAULT_DISCOUNT_SETTINGS.verifyRateLimitPerMinute,
  });
}

// ---------------------------------------------------------------------------
// (٢) الكوبونات
// ---------------------------------------------------------------------------

export type LoadedCoupon = Coupon & {
  createdAt: string | null;
};

/** `class_slugs` تصل مصفوفة نصية — والقيمة الفارغة تعني «كل الفئات» (العقد) */
function slugsOf(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((one): one is string => typeof one === "string" && one.trim() !== "");
}

function toCoupon(row: Record<string, unknown>): LoadedCoupon {
  const kind = textOf(row, ["kind", "discount_kind", "type"]) === "amount" ? "amount" : "percent";
  return {
    id: textOf(row, ["id"]) ?? "",
    code: textOf(row, ["code"]) ?? "",
    kind,
    value: numberOf(row, ["value", "discount_value", "amount"]) ?? 0,
    maxAmount: numberOf(row, ["max_amount", "maxAmount", "cap_amount"]),
    minTripTotal: numberOf(row, ["min_trip_total", "minTripTotal", "min_total"]),
    classSlugs: slugsOf(row.class_slugs ?? row.classSlugs),
    startsAt: textOf(row, ["starts_at", "startsAt"]),
    endsAt: textOf(row, ["ends_at", "endsAt"]),
    maxUses: numberOf(row, ["max_uses", "maxUses"]),
    maxUsesPerPhone: numberOf(row, ["max_uses_per_phone", "maxUsesPerPhone"]),
    enabled: boolOf(row, ["enabled", "active"], false),
    usedCount: numberOf(row, ["used_count", "usedCount", "uses"]) ?? 0,
    createdAt: textOf(row, ["created_at", "createdAt"]),
  };
}

export async function readCoupons(supabase: Supabase): Promise<Read<LoadedCoupon[]>> {
  const res = await supabase
    .from("coupons")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(MAX_ROWS);

  if (res.error) return failed<LoadedCoupon[]>([], "coupons", res.error);

  const coupons = rowsOf(res.data)
    .map(toCoupon)
    .filter((coupon) => coupon.id !== "");
  return ok(coupons);
}

export async function readCoupon(
  supabase: Supabase,
  id: string
): Promise<Read<LoadedCoupon | null>> {
  const res = await supabase.from("coupons").select("*").eq("id", id).maybeSingle();
  if (res.error) return failed<LoadedCoupon | null>(null, "coupons", res.error);
  const row = (res.data ?? null) as Record<string, unknown> | null;
  return ok(row ? toCoupon(row) : null);
}

// ---------------------------------------------------------------------------
// (٣) سجل الاستخدام — الشفافية عن التقليص
// ---------------------------------------------------------------------------

/**
 * صف استخدام واحد.
 *
 * `clamped` هو ما يجعل التقليص مرئياً للمالك بدل أن يكتشفه من فرق في تقرير
 * الهامش (النمط ٢ في `handover/LESSONS.md`: واجهة تَعِد بما لا يقع).
 *
 * ⚠ `amountNominal` **لا عمود له في 0024**: الجدول يسجّل المطبَّق فعلاً ووسم
 * التقليص، لا القيمة قبل التقليص. فيصل `null` دائماً اليوم، وتعرض الشاشة «—»
 * وتقول السبب بالاسم — ولا تملأ الخانة بقيمة المطبَّق: عمودٌ يوحي بأن كل خصم
 * وقع كاملاً أسوأ من عمود فارغ. الحقل باقٍ في النوع لأن إضافة العمود لاحقاً
 * تجعل الجدول كاملاً بلا تعديل واجهة.
 */
export type CouponRedemption = {
  id: string;
  couponId: string | null;
  bookingId: string | null;
  /** الرمز كما كان لحظة الاستخدام — مجمَّد، فتغيير الرمز لاحقاً لا يعيد كتابته */
  code: string | null;
  /** الهاتف = هوية العميل الوحيدة اليوم (`0022_analytics.sql:654`) */
  phone: string | null;
  /** قيمة الخصم الفعلية بعد كل الحدود */
  amount: number | null;
  /** القيمة الاسمية قبل أرضية الهامش — `null` يعني «لم تُرجعها القاعدة» */
  amountNominal: number | null;
  /** `null` يعني «لم تُرجعه القاعدة» لا «لم يُقلَّص» */
  clamped: boolean | null;
  createdAt: string | null;
};

function toRedemption(row: Record<string, unknown>): CouponRedemption {
  const hasClamped = ["clamped", "was_clamped", "is_clamped"].some(
    (name) => row[name] !== undefined && row[name] !== null
  );
  return {
    id: textOf(row, ["id"]) ?? "",
    couponId: textOf(row, ["coupon_id", "couponId"]),
    bookingId: textOf(row, ["booking_id", "bookingId"]),
    code: textOf(row, ["code", "coupon_code"]),
    phone: textOf(row, ["phone", "customer_phone"]),
    amount: numberOf(row, ["amount", "discount_amount", "amount_applied"]),
    amountNominal: numberOf(row, ["amount_nominal", "nominal_amount", "amount_before_clamp"]),
    clamped: hasClamped ? boolOf(row, ["clamped", "was_clamped", "is_clamped"], false) : null,
    createdAt: textOf(row, ["redeemed_at", "created_at", "createdAt"]),
  };
}

export async function readRedemptions(
  supabase: Supabase,
  couponId: string
): Promise<Read<CouponRedemption[]>> {
  // ⚠ عمود الزمن في 0024 اسمه `redeemed_at` لا `created_at` — والترتيب باسم
  // غير موجود يردّه PostgREST خطأً، فتفرغ الشاشة بلا سبب مفهوم.
  const res = await supabase
    .from("coupon_redemptions")
    .select("*")
    .eq("coupon_id", couponId)
    .order("redeemed_at", { ascending: false })
    .limit(MAX_ROWS);

  if (res.error) return failed<CouponRedemption[]>([], "coupon_redemptions", res.error);

  const rows = rowsOf(res.data)
    .map(toRedemption)
    .filter((row) => row.id !== "");
  return ok(rows);
}

/** رقم الحجز المرجعي لكل معرّف — الجدول يعرض رقماً يعرفه المالك لا UUID */
export async function readBookingRefs(
  supabase: Supabase,
  ids: string[]
): Promise<Map<string, { reference: string; status: string | null; total: number | null }>> {
  const map = new Map<string, { reference: string; status: string | null; total: number | null }>();
  const unique = [...new Set(ids.filter((id) => id !== ""))];
  if (unique.length === 0) return map;

  const res = await supabase
    .from("bookings")
    .select("id, reference, status, total")
    .in("id", unique.slice(0, MAX_ROWS));

  if (res.error) return map;

  for (const row of rowsOf(res.data)) {
    const id = textOf(row, ["id"]);
    const reference = textOf(row, ["reference"]);
    if (!id || !reference) continue;
    map.set(id, {
      reference,
      status: textOf(row, ["status"]),
      total: numberOf(row, ["total"]),
    });
  }
  return map;
}

// ---------------------------------------------------------------------------
// (٤) بانرات العروض
// ---------------------------------------------------------------------------

export type LoadedBanner = PromoBanner;

function toBanner(row: Record<string, unknown>): LoadedBanner {
  const placement = textOf(row, ["placement", "slot", "position"]);
  return {
    id: textOf(row, ["id"]) ?? "",
    title: textOf(row, ["title", "heading"]) ?? "",
    body: textOf(row, ["body", "text", "subtitle"]),
    couponCode: textOf(row, ["coupon_code", "couponCode", "code"]),
    placement: placement === "offers" || placement === "checkout" ? placement : "home",
    startsAt: textOf(row, ["starts_at", "startsAt"]),
    endsAt: textOf(row, ["ends_at", "endsAt"]),
    enabled: boolOf(row, ["enabled", "active"], false),
    sort: numberOf(row, ["sort", "position", "ord"]) ?? 0,
  };
}

export async function readBanners(supabase: Supabase): Promise<Read<LoadedBanner[]>> {
  const res = await supabase
    .from("promo_banners")
    .select("*")
    .order("sort", { ascending: true })
    .limit(MAX_ROWS);

  if (res.error) return failed<LoadedBanner[]>([], "promo_banners", res.error);

  const banners = rowsOf(res.data)
    .map(toBanner)
    .filter((banner) => banner.id !== "");
  return ok(banners);
}

// ---------------------------------------------------------------------------
// (٥) مراجع مشتركة: فئات السيارات والعملة
// ---------------------------------------------------------------------------

export type ClassOption = { slug: string; title: string; active: boolean };

/**
 * فئات السيارات لتخصيص الكوبون. تُقرأ **كلها** لا النشطة وحدها: كوبون موجَّه
 * لفئة أوقفها المالك مؤقتاً يجب أن يبقى ظاهراً في نموذجه، وإلا اختفى تخصيصه
 * من الشاشة بلا أن يختفي من القاعدة.
 */
export async function readClassOptions(supabase: Supabase): Promise<Read<ClassOption[]>> {
  const res = await supabase
    .from("vehicle_classes")
    .select("slug, title, active")
    .order("sort", { ascending: true });

  if (res.error) return failed<ClassOption[]>([], "vehicle_classes", res.error);

  const options = rowsOf(res.data)
    .map((row) => ({
      slug: textOf(row, ["slug"]) ?? "",
      title: textOf(row, ["title"]) ?? "",
      active: boolOf(row, ["active"], false),
    }))
    .filter((option) => option.slug !== "");

  return ok(options);
}

/** رمز العملة من `pricing_settings` — نفس مصدر بقية أسعار الموقع واللوحة */
export async function readCurrency(supabase: Supabase): Promise<string> {
  const res = await supabase.from("pricing_settings").select("currency").limit(1).maybeSingle();
  if (res.error) return "EGP";
  return textOf((res.data ?? null) as Record<string, unknown> | null, ["currency"]) ?? "EGP";
}
