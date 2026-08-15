"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { clamp, text, toLatinDigits } from "../_lib/form";
import { portalSetupAccess } from "../_lib/session";

/**
 * إجراءات سجلّ سائقي المتعهد — جدول `subcontractor_drivers` (هجرة 0040).
 *
 * نظير `fleet/actions.ts` حرفاً بحرف، وبقواعده الثلاث نفسها:
 * - `portalSetupAccess()` أولاً في **كل** إجراء: الغلاف يحمي شجرة التصيير لا نقاط
 *   الـ POST، وهذه نقاط مستقلة تُنادى مباشرة. وهو الحارس **الموسَّع** لأن السجلّ
 *   ملك الشريك ولا يمسّ تشغيلاً — بينما `set_trip_crew` التي تقرأ منه تبقى على
 *   الحارس الضيّق. ولهذا التقسيم قياسٌ يسنده: `subcontractor_drivers` كان فارغاً
 *   عند كل شريكٍ حقيقي في قاعدة بدر، لأن أحداً لم يعرف أن عليه ملؤه قبل الرحلة.
 * - كل استعلام مقيَّد بـ `subcontractor_id` صراحةً رغم أن RLS تعزل أصلاً —
 *   الشرط يجعل النية مقروءة، والسياسة تبقى خط الدفاع الذي لا يُتجاوز.
 * - فخ RLS المعروف: الكتابة «تنجح» بصفر صفوف حين ترفضها السياسة، فـ`.select()`
 *   بعد كل كتابة وفحص طول النتيجة.
 *
 * والتحقق هنا يسبق القاعدة عن قصد: قيدا `subcontractor_drivers_name_chk`
 * و`_phone_chk` يردّان الصف برسالة Postgres خام، والمتعهد يستحق جملة عربية تقول
 * أي حقل أخطأ ولماذا. فالقيد خط الدفاع الأخير لا رسالة الخطأ الأولى.
 */

const url = (qs: string) => `/portal/drivers?${qs}`;

/** حدود مطابقة لقيود الجدول في 0040: الاسم ٢–١٢٠ حرفاً، والهاتف ٨ أرقام فأكثر */
const MIN_NAME = 2;
const MAX_NAME = 120;
const MIN_PHONE_DIGITS = 8;
const MAX_PHONE = 32;
const MAX_LICENSE = 40;

/** رقم هاتف معقول بعد تحويل الأرقام العربية — نفس نمط `profile/actions.ts` */
const PHONE_PATTERN = /^\+?[\d\s()-]{7,20}$/;

type DriverFields = {
  name: string;
  phone: string;
  license_no: string | null;
  active: boolean;
};

/** قراءة الحقول والتحقق منها — تُعيد رمز خطأ نصياً بدل الرمي (اتفاقية الأسطول) */
function readDriver(formData: FormData, prefix = ""): DriverFields | string {
  const p = (name: string) => `${prefix}${name}`;

  const name = clamp(text(formData, p("name")), MAX_NAME);
  if (!name || name.length < MIN_NAME) return "name";

  const rawPhone = text(formData, p("phone"));
  const phone = rawPhone ? clamp(toLatinDigits(rawPhone), MAX_PHONE) : null;
  if (!phone || !PHONE_PATTERN.test(phone)) return "phone";
  // القيد في القاعدة يعدّ **الأرقام** لا الطول: «(٠٢) - -» يمرّ بالنمط ويسقط هناك
  if (phone.replace(/\D/g, "").length < MIN_PHONE_DIGITS) return "phone";

  return {
    name,
    phone,
    license_no: clamp(text(formData, p("license_no")), MAX_LICENSE),
    active: formData.get(p("active")) != null,
  };
}

export async function createDriver(formData: FormData) {
  const access = await portalSetupAccess();
  if (!access.ok) redirect(url(`error=${access.code}`));
  const { supabase, sub } = access;

  const fields = readDriver(formData, "new.");
  if (typeof fields === "string") redirect(url(`error=${fields}`));

  const res = await supabase
    .from("subcontractor_drivers")
    .insert({ ...fields, subcontractor_id: sub.id })
    .select("id");

  if (res.error || !res.data || res.data.length === 0) redirect(url("error=save"));

  revalidatePath("/", "layout");
  redirect(url("saved=1"));
}

export async function saveDriver(driverId: string, formData: FormData) {
  const access = await portalSetupAccess();
  if (!access.ok) redirect(url(`error=${access.code}`));
  const { supabase, sub } = access;

  const fields = readDriver(formData);
  if (typeof fields === "string") redirect(url(`error=${fields}`));

  const res = await supabase
    .from("subcontractor_drivers")
    .update(fields)
    .eq("id", driverId)
    .eq("subcontractor_id", sub.id)
    .select("id");

  if (res.error) redirect(url("error=save"));
  if (!res.data || res.data.length === 0) redirect(url("error=notfound"));

  revalidatePath("/", "layout");
  redirect(url("saved=1"));
}

/**
 * تفعيل/إيقاف سائق — الإيقاف يبقيه بكل بياناته ويخرجه من قائمة الإسناد.
 *
 * ولماذا الإيقاف أصلاً وليس الحذف؟ لأن `dispatches.assigned_driver_id` مرجعٌ
 * بـ`on delete set null`: حذفُ سائقٍ نفّذ رحلات يمحو اسمه من صفحات عملائها بأثر
 * رجعي، بينما الإيقاف يوقف الإسناد الجديد ولا يمسّ ما مضى.
 */
export async function toggleDriver(driverId: string) {
  const access = await portalSetupAccess();
  if (!access.ok) redirect(url(`error=${access.code}`));
  const { supabase, sub } = access;

  const current = await supabase
    .from("subcontractor_drivers")
    .select("active")
    .eq("id", driverId)
    .eq("subcontractor_id", sub.id)
    .maybeSingle();

  if (current.error) redirect(url("error=save"));
  if (!current.data) redirect(url("error=notfound"));

  const res = await supabase
    .from("subcontractor_drivers")
    .update({ active: current.data.active !== true })
    .eq("id", driverId)
    .eq("subcontractor_id", sub.id)
    .select("id");

  if (res.error || !res.data || res.data.length === 0) redirect(url("error=save"));

  revalidatePath("/", "layout");
  redirect(url("saved=1"));
}

export async function deleteDriver(driverId: string) {
  const access = await portalSetupAccess();
  if (!access.ok) redirect(url(`error=${access.code}`));
  const { supabase, sub } = access;

  const res = await supabase
    .from("subcontractor_drivers")
    .delete()
    .eq("id", driverId)
    .eq("subcontractor_id", sub.id)
    .select("id");

  if (res.error) redirect(url("error=save"));
  if (!res.data || res.data.length === 0) redirect(url("error=notfound"));

  revalidatePath("/", "layout");
  redirect(url("deleted=1"));
}
