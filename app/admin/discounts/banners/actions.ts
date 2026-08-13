"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { createServerSupabase } from "@/lib/supabase/server";
import {
  cairoInstant,
  checked,
  isBannerPlacement,
  normalizeCouponCode,
  num,
  text,
} from "../input";

/**
 * إجراءات بانرات العروض.
 *
 * **البانر نصٌّ لا سعر.** لا يمنح خصماً ولا يغيّر رقماً: هو إعلان يعرض رمزاً،
 * والتحقق من الرمز يبقى في `apply_discount` وحدها. لذلك لا يوجد في هذا الملف
 * أي كتابة تمسّ `coupons` ولا العدّاد — بانر برمز خاطئ يعني إعلاناً لا يعمل،
 * لا خصماً بلا كوبون.
 */

const url = (qs: string) => `/admin/discounts/banners?${qs}`;

const MAX_TITLE = 120;
const MAX_BODY = 400;
const MAX_SORT = 999;

/** وجهات العودة المسموح بها — لا فتح لتحويل خارجي */
const BACK = "/admin/discounts/banners";

type Parsed = { patch: Record<string, unknown> } | { error: string };

function parseBanner(formData: FormData, prefix = ""): Parsed {
  const field = (name: string) => `${prefix}${name}`;

  const title = text(formData, field("title"));
  if (!title || title.length > MAX_TITLE) return { error: "title" };

  const body = text(formData, field("body"));
  if (body !== null && body.length > MAX_BODY) return { error: "body" };

  const placement = formData.get(field("placement"));
  if (!isBannerPlacement(placement)) return { error: "placement" };

  // الرمز اختياري؛ وحين يُكتب يُطبَّع بنفس قاعدة الكوبونات كي يتطابق المعروض
  // مع المخزَّن. صحّة وجوده تُفحص في الشاشة وتُعرض تحذيراً — لا تمنع الحفظ:
  // بانر يُجهَّز قبل كوبونه حالة عمل مشروعة.
  const rawCode = text(formData, field("coupon_code"));
  const couponCode = rawCode === null ? null : normalizeCouponCode(rawCode);
  if (rawCode !== null && couponCode === null) return { error: "code" };

  const startsAt = cairoInstant(text(formData, field("starts_at")), "start");
  const endsAt = cairoInstant(text(formData, field("ends_at")), "end");
  if (startsAt === false || endsAt === false) return { error: "dates" };
  if (startsAt !== null && endsAt !== null && startsAt >= endsAt) return { error: "window" };

  const sort = num(formData, field("sort")) ?? 0;
  if (!Number.isInteger(sort) || sort < 0 || sort > MAX_SORT) return { error: "sort" };

  return {
    patch: {
      title,
      body,
      coupon_code: couponCode,
      placement,
      starts_at: startsAt,
      ends_at: endsAt,
      sort,
      enabled: checked(formData, field("enabled")),
    },
  };
}

/**
 * بانر جديد — يُنشأ **معطَّلاً** مهما كان المربّع: نفس قاعدة الكوبون، لا يظهر
 * إعلان على الموقع العام بضغطة إضافة واحدة بلا مراجعة نصّه.
 */
export async function createBanner(formData: FormData) {
  const supabase = await createServerSupabase();
  if (!supabase) redirect(url("error=env"));

  const parsed = parseBanner(formData, "new.");
  if ("error" in parsed) redirect(url(`error=${parsed.error}`));

  const res = await supabase
    .from("promo_banners")
    .insert({ ...parsed.patch, enabled: false })
    .select("id");

  if (res.error || !res.data || res.data.length === 0) redirect(url("error=save"));

  revalidatePath("/", "layout");
  redirect(url("created=1"));
}

export async function saveBanner(bannerId: string, formData: FormData) {
  const supabase = await createServerSupabase();
  if (!supabase) redirect(url("error=env"));

  const parsed = parseBanner(formData);
  if ("error" in parsed) redirect(url(`error=${parsed.error}`));

  const res = await supabase
    .from("promo_banners")
    .update(parsed.patch)
    .eq("id", bannerId)
    .select("id");

  // صفر صفوف مع نجاح ظاهري = RLS رفضت الكتابة (المستخدم ليس admin)
  if (res.error || !res.data || res.data.length === 0) redirect(url("error=save"));

  revalidatePath("/", "layout");
  redirect(url("saved=1"));
}

/** قلب حالة البانر — الحالة الحالية من القاعدة لا من الشاشة المعروضة */
export async function toggleBanner(bannerId: string) {
  const supabase = await createServerSupabase();
  if (!supabase) redirect(`${BACK}?error=env`);

  const current = await supabase
    .from("promo_banners")
    .select("enabled")
    .eq("id", bannerId)
    .maybeSingle();
  if (current.error || current.data == null) redirect(`${BACK}?error=save`);

  const next = !(current.data as { enabled: boolean | null }).enabled;

  const res = await supabase
    .from("promo_banners")
    .update({ enabled: next })
    .eq("id", bannerId)
    .select("id");
  if (res.error || !res.data || res.data.length === 0) redirect(`${BACK}?error=save`);

  revalidatePath("/", "layout");
  redirect(`${BACK}?${next ? "enabled=1" : "disabled=1"}`);
}
