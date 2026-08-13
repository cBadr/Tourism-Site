"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { createServerSupabase } from "@/lib/supabase/server";
import {
  cairoInstant,
  checked,
  classSlugs,
  nonNegative,
  normalizeCouponCode,
  num,
  positiveInt,
  text,
} from "./input";

/**
 * إجراءات إدارة الخصومات — الكوبونات وإعدادات النظام.
 *
 * ثلاث قواعد تحكم هذا الملف:
 *
 * (١) **لا حساب خصم هنا إطلاقاً.** ما يقع: تحقق من المدخلات وكتابة صفوف. قيمة
 *     الخصم الفعلية تُحسب في `public.apply_discount` وحدها، وهي التي تفرض أرضية
 *     الهامش (القاعدة ٣ في `lib/discount-types.ts`) — فلا يستطيع أي مسار في
 *     الواجهة أن يتخطاها، ولا هذه الشاشة أن «تسمح» بخصم ترفضه القاعدة.
 *
 * (٢) الشكل القياسي لأي Server Action في هذا المستودع: فحص البيئة ← تحقق مع
 *     خروج فوري برمز عربي واضح ← كتابة مع `.select()` وفحص صفر صفوف (فخ RLS
 *     الصامت) ← `revalidatePath` ثم `redirect`.
 *
 * (٣) **الكوبون لا يُحذف.** التعطيل فقط: صفوف `coupon_redemptions` تشير إليه،
 *     وحذفه يمحو تاريخ خصومات مُنحت فعلاً (سابقة الدفتر append-only).
 */

const listUrl = (qs: string) => `/admin/discounts?${qs}`;
const couponUrl = (id: string, qs: string) => `/admin/discounts/${id}?${qs}`;

/** حدود عاقلة تمنع الأخطاء المطبعية الكارثية — ليست قواعد تسعير */
const MAX_PERCENT_VALUE = 100;
const MAX_AMOUNT_VALUE = 1_000_000;
const MAX_USES_CEILING = 1_000_000;
const MAX_RATE_LIMIT = 600;
const MAX_MARGIN_PERCENT = 100;

/** وجهات العودة المسموح بها بعد التعطيل/التفعيل — لا فتح لتحويل خارجي */
function safeReturn(value: string | null): string {
  if (!value) return "/admin/discounts";
  return value.startsWith("/admin/discounts") ? value : "/admin/discounts";
}

/**
 * حقول الكوبون المشتركة بين الإنشاء والتعديل.
 * ترجع `{ patch }` أو `{ error }` برمز الحقل الذي سقط — رمز مستقل لكل سبب،
 * فالرسالة الواحدة العامة تُخفي أي الحقول أخطأ.
 */
type Parsed = { patch: Record<string, unknown> } | { error: string };

function parseCouponFields(formData: FormData): Parsed {
  const kind = formData.get("kind");
  if (kind !== "percent" && kind !== "amount") return { error: "kind" };
  const isPercent = kind === "percent";

  const value = num(formData, "value");
  if (value === null || value <= 0) return { error: "value" };
  if (isPercent && value > MAX_PERCENT_VALUE) return { error: "percent" };
  if (!isPercent && value > MAX_AMOUNT_VALUE) return { error: "value" };

  // سقف قيمة الخصم لا معنى له إلا مع النسبة — يُخزَّن null مع المبلغ الثابت
  const maxAmount = nonNegative(formData, "max_amount");
  if (maxAmount === false) return { error: "maxamount" };
  if (maxAmount !== null && (maxAmount <= 0 || maxAmount > MAX_AMOUNT_VALUE))
    return { error: "maxamount" };

  const minTripTotal = nonNegative(formData, "min_trip_total");
  if (minTripTotal === false) return { error: "mintotal" };
  if (minTripTotal !== null && minTripTotal > MAX_AMOUNT_VALUE) return { error: "mintotal" };

  const slugs = classSlugs(formData);
  if (slugs === false) return { error: "classes" };

  const startsAt = cairoInstant(text(formData, "starts_at"), "start");
  const endsAt = cairoInstant(text(formData, "ends_at"), "end");
  if (startsAt === false || endsAt === false) return { error: "dates" };
  if (startsAt !== null && endsAt !== null && startsAt >= endsAt) return { error: "window" };

  const maxUses = positiveInt(formData, "max_uses");
  if (maxUses === false || (maxUses !== null && maxUses > MAX_USES_CEILING))
    return { error: "maxuses" };

  const maxUsesPerPhone = positiveInt(formData, "max_uses_per_phone");
  if (maxUsesPerPhone === false || (maxUsesPerPhone !== null && maxUsesPerPhone > MAX_USES_CEILING))
    return { error: "perphone" };

  return {
    patch: {
      kind: isPercent ? "percent" : "amount",
      value,
      max_amount: isPercent ? maxAmount : null,
      min_trip_total: minTripTotal === 0 ? null : minTripTotal,
      class_slugs: slugs,
      starts_at: startsAt,
      ends_at: endsAt,
      max_uses: maxUses,
      max_uses_per_phone: maxUsesPerPhone,
      enabled: checked(formData, "enabled"),
    },
  };
}

/**
 * ترجمة خطأ كتابة على `coupons` إلى رمز رسالة.
 *
 * القاعدة تحرس بقيود على الصف نفسه (0024): الرمز فريد، والنافذة يجب أن تنتهي
 * بعد بدايتها، و**سقف الاستخدام لا ينزل تحت العدّاد الواقع**. لكلٍّ رسالته:
 * «فشل الحفظ — تأكد أنك admin» على خطأ رقم كانت ستُرسل المالك إلى مسار خاطئ
 * تماماً.
 */
function couponWriteError(error: { code?: string; message?: string } | null): string {
  if (!error) return "save";
  if (error.code === "23505") return "exists";
  if (error.code === "23514") {
    const message = error.message ?? "";
    if (message.includes("used_within_max")) return "capbelowused";
    if (message.includes("window")) return "window";
    if (message.includes("percent_range")) return "percent";
    return "constraint";
  }
  return "save";
}

/** كل معرّف فئة مُرسَل موجود فعلاً — كوبون لفئة لا وجود لها لا يعمل ولا يُنبِّه */
async function classSlugsExist(
  supabase: NonNullable<Awaited<ReturnType<typeof createServerSupabase>>>,
  slugs: string[]
): Promise<boolean> {
  if (slugs.length === 0) return true;
  const res = await supabase.from("vehicle_classes").select("slug").in("slug", slugs);
  if (res.error || !res.data) return false;
  const found = new Set((res.data as { slug: string }[]).map((row) => row.slug));
  return slugs.every((slug) => found.has(slug));
}

// ---------------------------------------------------------------------------
// (١) إنشاء كوبون — يُنشأ **معطَّلاً** دائماً
// ---------------------------------------------------------------------------

/**
 * الإنشاء يأخذ الرمز والنوع والقيمة فقط، وبقية الشروط تُضبط في شاشة الكوبون.
 *
 * ولماذا معطَّلاً دائماً مهما كان مربّع «مفعّل»؟ القرار ١٠ في موجز المرحلة: لا
 * حملة تبدأ بلا قرار بشري. كوبون يُنشأ فعّالاً بنافذة صلاحية فارغة يعني خصماً
 * سارياً على كل الرحلات في اللحظة التي يُضغط فيها زر الإضافة.
 */
export async function createCoupon(formData: FormData) {
  const supabase = await createServerSupabase();
  if (!supabase) redirect(listUrl("error=env"));

  const code = normalizeCouponCode(text(formData, "code"));
  if (!code) redirect(listUrl("error=code"));

  const kind = formData.get("kind");
  if (kind !== "percent" && kind !== "amount") redirect(listUrl("error=kind"));

  const value = num(formData, "value");
  if (value === null || value <= 0) redirect(listUrl("error=value"));
  if (kind === "percent" && value > MAX_PERCENT_VALUE) redirect(listUrl("error=percent"));
  if (kind === "amount" && value > MAX_AMOUNT_VALUE) redirect(listUrl("error=value"));

  const created = await supabase
    .from("coupons")
    .insert({
      code,
      kind,
      value,
      class_slugs: [],
      enabled: false,
      used_count: 0,
    })
    .select("id")
    .single();

  if (created.error || !created.data) {
    // 23505 = unique_violation على الرمز — رسالة أوضح من فشل حفظ عام
    redirect(listUrl(`error=${couponWriteError(created.error)}`));
  }

  revalidatePath("/", "layout");
  redirect(couponUrl(created.data.id as string, "created=1"));
}

// ---------------------------------------------------------------------------
// (٢) تعديل كوبون
// ---------------------------------------------------------------------------

export async function saveCoupon(couponId: string, formData: FormData) {
  const supabase = await createServerSupabase();
  if (!supabase) redirect(couponUrl(couponId, "error=env"));

  const parsed = parseCouponFields(formData);
  if ("error" in parsed) redirect(couponUrl(couponId, `error=${parsed.error}`));

  const slugs = (parsed.patch.class_slugs as string[]) ?? [];
  if (!(await classSlugsExist(supabase, slugs))) redirect(couponUrl(couponId, "error=classes"));

  // الرمز يُعدَّل أيضاً: حملة قد تُطلق برمز مطبوع خطأً قبل استخدامها مرة واحدة
  const code = normalizeCouponCode(text(formData, "code"));
  if (!code) redirect(couponUrl(couponId, "error=code"));

  const res = await supabase
    .from("coupons")
    .update({ ...parsed.patch, code })
    .eq("id", couponId)
    .select("id");

  if (res.error) {
    // 23514 = check_violation. القاعدة تحرس بقيود على الصف نفسه، وأشهرها هنا
    // `coupons_used_within_max_chk` (سقف أقل من الاستخدام الواقع) — ورسالتها
    // تختلف عن «فشل الحفظ» تماماً: المالك لم يخطئ في الصلاحية بل في الرقم.
    redirect(couponUrl(couponId, `error=${couponWriteError(res.error)}`));
  }
  // صفر صفوف مع نجاح ظاهري = RLS رفضت الكتابة (المستخدم ليس admin)
  if (!res.data || res.data.length === 0) redirect(couponUrl(couponId, "error=save"));

  revalidatePath("/", "layout");
  redirect(couponUrl(couponId, "saved=1"));
}

// ---------------------------------------------------------------------------
// (٣) تعطيل / تفعيل
// ---------------------------------------------------------------------------

/**
 * قلب حالة الكوبون. الحالة الحالية تُقرأ من القاعدة لا من الشاشة: زرّ مبنيّ على
 * صفحة قديمة كان سيعيد تفعيل كوبون أطفأه زميل قبل ثانية.
 */
export async function toggleCoupon(couponId: string, returnTo: string) {
  const back = safeReturn(returnTo);
  const supabase = await createServerSupabase();
  if (!supabase) redirect(`${back}?error=env`);

  const current = await supabase
    .from("coupons")
    .select("enabled")
    .eq("id", couponId)
    .maybeSingle();
  if (current.error || current.data == null) redirect(`${back}?error=save`);

  const next = !(current.data as { enabled: boolean | null }).enabled;

  const res = await supabase
    .from("coupons")
    .update({ enabled: next })
    .eq("id", couponId)
    .select("id");
  if (res.error || !res.data || res.data.length === 0) redirect(`${back}?error=save`);

  revalidatePath("/", "layout");
  redirect(`${back}?${next ? "enabled=1" : "disabled=1"}`);
}

// ---------------------------------------------------------------------------
// (٤) إعدادات نظام الخصومات
// ---------------------------------------------------------------------------

/**
 * `discount_settings` جدول صف واحد كنظيره `pricing_settings`: نحدّث الصف
 * الموجود، وإن لم يوجد نُدرجه. القيم كلها **حدود تقرؤها القاعدة**؛ لا يُفرض
 * منها شيء في هذه الشاشة.
 */
export async function saveDiscountSettings(formData: FormData) {
  const supabase = await createServerSupabase();
  if (!supabase) redirect(listUrl("error=env"));

  const maxPercent = num(formData, "max_percent");
  if (maxPercent === null || maxPercent < 0 || maxPercent > MAX_PERCENT_VALUE)
    redirect(listUrl("error=maxpercent"));

  const minMarginPercent = num(formData, "min_margin_percent_after_discount");
  if (minMarginPercent === null || minMarginPercent < 0 || minMarginPercent > MAX_MARGIN_PERCENT)
    redirect(listUrl("error=marginpercent"));

  const minMarginAmount = num(formData, "min_margin_amount_after_discount");
  if (minMarginAmount === null || minMarginAmount < 0 || minMarginAmount > MAX_AMOUNT_VALUE)
    redirect(listUrl("error=marginamount"));

  const rateLimit = num(formData, "verify_rate_limit_per_minute");
  if (
    rateLimit === null ||
    !Number.isInteger(rateLimit) ||
    rateLimit < 1 ||
    rateLimit > MAX_RATE_LIMIT
  )
    redirect(listUrl("error=ratelimit"));

  const patch = {
    enabled: checked(formData, "enabled"),
    max_percent: maxPercent,
    min_margin_percent_after_discount: minMarginPercent,
    min_margin_amount_after_discount: minMarginAmount,
    verify_rate_limit_per_minute: rateLimit,
  };

  const existing = await supabase.from("discount_settings").select("*").limit(1);
  if (existing.error) redirect(listUrl("error=save"));

  const current = (existing.data?.[0] ?? null) as Record<string, unknown> | null;

  if (current) {
    // الصف الوحيد: نقيّده بعمود id إن وُجد، وإلا بمرشّح يطابق الصف الوحيد دائماً
    // — لا نرسل تحديثاً بلا مرشّح أبداً (نفس ما تفعله شاشة التسعير)
    const query = supabase.from("discount_settings").update(patch);
    const res = await (current.id === undefined
      ? query.not("enabled", "is", null)
      : query.eq("id", current.id as string)
    ).select();
    if (res.error || !res.data || res.data.length === 0) redirect(listUrl("error=save"));
  } else {
    const res = await supabase.from("discount_settings").insert(patch).select();
    if (res.error || !res.data || res.data.length === 0) redirect(listUrl("error=save"));
  }

  revalidatePath("/", "layout");
  redirect(listUrl("saved=1"));
}
