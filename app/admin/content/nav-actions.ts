"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { createServerSupabase } from "@/lib/supabase/server";
import {
  NAV_LABEL_MAX,
  isAccountReservedHref,
  isNavHrefShapeOk,
} from "@/components/site/links";

/**
 * إجراءات بنود الشريط العلوي الحرّة — جدول `nav_links` (هجرة `0094`).
 *
 * على اتفاقية شاشات المحتوى نفسها: كل عملية تنتهي بـ`redirect` ورسالةٌ في
 * الـquery string، و`revalidatePath("/", "layout")` لأن الشريط في **كل** صفحة من
 * الموقع العام. وفخّ RLS المعروف يُعالَج بـ`.select()` بعد كل كتابة: التحديث
 * والحذف ينجحان ظاهرياً بصفر صفوف عند رفض السياسة.
 *
 * ── 🔴 والحارس الحقيقي في القاعدة لا هنا ────────────────────────────────────
 *
 * `nav_links_href_not_account` قيدٌ على الجدول، و`nav_links_guard` مُشغّلٌ يسمّي
 * السبب. والفحوص أدناه **للرسالة قبل الرحلة** وحدها — لتقرأ عيناً عربيةً مفهومة
 * بدل ارتدادٍ عامّ. ولو انحرفت النسختان فالقاعدة تكسب، وهو الاتجاه الصحيح.
 */

const listUrl = (qs: string) => `/admin/content?${qs}`;

/** نص مُشذّب أو null */
function str(formData: FormData, name: string): string | null {
  const value = formData.get(name);
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed === "" ? null : trimmed;
}

function intOr(formData: FormData, name: string, fallback: number): number {
  const parsed = Number.parseInt(String(formData.get(name) ?? ""), 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}

/** الفحوص المشتركة بين الإضافة والتعديل — رمزُ خطأٍ أو null */
function validate(label: string | null, href: string | null): string | null {
  if (!label) return "navLinkLabel";
  if (label.length > NAV_LABEL_MAX) return "navLinkLabelLong";
  if (!href) return "navLinkHref";
  if (!isNavHrefShapeOk(href)) return "navLinkHref";
  // 🔴 البند الثالث من بنود بدر — مدخل الحساب لا يصير بنداً قابلاً للحذف
  if (isAccountReservedHref(href)) return "navLinkAccount";
  return null;
}

/** إضافة بند حرّ في آخر الشريط */
export async function addNavLink(formData: FormData) {
  const supabase = await createServerSupabase();
  if (!supabase) redirect(listUrl("error=env"));

  const label = str(formData, "label");
  const href = str(formData, "href");
  const bad = validate(label, href);
  if (bad) redirect(listUrl(`error=${bad}`));

  /**
   * الترتيب الافتراضي = أكبر ترتيبٍ قائم + ١٠، فيقع البند الجديد **آخر** الشريط.
   * والقفزة عشرةٌ لا واحد لأن السلّم مشترك مع `pages.nav_sort` — فيبقى بين كل
   * بندين موضعٌ للإدراج بلا إعادة ترقيم أحدٍ.
   */
  const [lastLink, lastPage] = await Promise.all([
    supabase.from("nav_links").select("nav_sort").order("nav_sort", { ascending: false }).limit(1),
    supabase
      .from("pages")
      .select("nav_sort")
      .eq("nav_show", true)
      .order("nav_sort", { ascending: false })
      .limit(1),
  ]);
  const highest = Math.max(
    (lastLink.data?.[0]?.nav_sort as number | undefined) ?? 0,
    (lastPage.data?.[0]?.nav_sort as number | undefined) ?? 0
  );

  const res = await supabase
    .from("nav_links")
    .insert({
      label,
      href,
      nav_sort: highest + 10,
      active: true,
      // 🔒 `label_key` تبقى فارغة دائماً من هذه الشاشة: مفاتيح الرسائل يملكها
      //    المستودع، وبندٌ يكتبه المالك تسميتُه نصُّه — ويُترجَم بمفتاح
      //    `settings`/`nav.<id>.label` الذي يولّده فهرس `0094`.
      label_key: null,
    })
    .select("id");
  if (res.error || !res.data?.length) redirect(listUrl("error=save"));

  revalidatePath("/", "layout");
  redirect(listUrl("saved=1"));
}

/** تعديل بند حرّ: التسمية والرابط والترتيب */
export async function saveNavLink(linkId: string, formData: FormData) {
  const supabase = await createServerSupabase();
  if (!supabase) redirect(listUrl("error=env"));

  const label = str(formData, `link-${linkId}-label`);
  const href = str(formData, `link-${linkId}-href`);
  const bad = validate(label, href);
  if (bad) redirect(listUrl(`error=${bad}`));

  const res = await supabase
    .from("nav_links")
    .update({ label, href, nav_sort: intOr(formData, `link-${linkId}-sort`, 0) })
    .eq("id", linkId)
    .select("id");
  if (res.error || !res.data?.length) redirect(listUrl("error=save"));

  revalidatePath("/", "layout");
  redirect(listUrl("saved=1"));
}

/**
 * إظهار البند أو إخفاؤه — **البديل المعروض عن الحذف.**
 *
 * والفرق ليس تجميلياً: الإخفاء يُبقي معرّف الصفّ، ومعرّفُ الصفّ هو **عنوان
 * ترجمة تسميته** (`nav.<id>.label` في فهرس `0094`). فحذفُ بندٍ ثم إعادةُ إنشائه
 * يُيتّم ترجمته ولا يُعاد ما ضاع — نفس علّة `_k` في `0059` بالضبط. ولذلك يقف
 * الحذف في الشاشة خلف تسميةٍ صريحة، والإخفاء هو الفعل الأول المعروض.
 */
export async function toggleNavLink(linkId: string) {
  const supabase = await createServerSupabase();
  if (!supabase) redirect(listUrl("error=env"));

  const current = await supabase
    .from("nav_links")
    .select("active")
    .eq("id", linkId)
    .maybeSingle();
  if (current.error || current.data == null) redirect(listUrl("error=save"));

  const res = await supabase
    .from("nav_links")
    .update({ active: !current.data.active })
    .eq("id", linkId)
    .select("id");
  if (res.error || !res.data?.length) redirect(listUrl("error=save"));

  revalidatePath("/", "layout");
  redirect(listUrl("saved=1"));
}

/** حذف بند حرّ نهائياً */
export async function deleteNavLink(linkId: string) {
  const supabase = await createServerSupabase();
  if (!supabase) redirect(listUrl("error=env"));

  const res = await supabase.from("nav_links").delete().eq("id", linkId).select("id");
  if (res.error || !res.data?.length) redirect(listUrl("error=save"));

  revalidatePath("/", "layout");
  redirect(listUrl("saved=1"));
}

/** إخراج صفحة من الشريط من شاشة القائمة — بلا فتح محررها */
export async function hidePageFromNav(pageId: string) {
  const supabase = await createServerSupabase();
  if (!supabase) redirect(listUrl("error=env"));

  const res = await supabase
    .from("pages")
    .update({ nav_show: false })
    .eq("id", pageId)
    .select("id");
  if (res.error || !res.data?.length) redirect(listUrl("error=save"));

  revalidatePath("/", "layout");
  redirect(listUrl("saved=1"));
}
