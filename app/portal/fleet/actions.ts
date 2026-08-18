"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { SupabaseClient } from "@supabase/supabase-js";

import {
  buildVehiclePhotoPath,
  readVehiclePhotoFile,
  removeVehiclePhotos,
  sweepVehicleFolder,
  uploadVehiclePhoto,
} from "@/lib/vehicles/photos";
import {
  clamp,
  MAX_MODEL_YEAR,
  MAX_SEATS,
  MIN_MODEL_YEAR,
  num,
  text,
} from "../_lib/form";
import { portalSetupAccess } from "../_lib/session";

/**
 * إجراءات أسطول المتعهد — جدول `subcontractor_vehicles`.
 *
 * قواعد ثابتة:
 * - `portalSetupAccess()` أولاً — الحارس **الموسَّع**: الأسطول سجلٌّ يملكه الشريك،
 *   وسياساته الأربع بلا شرط حالة، والمدعوّ يجهّزه قبل اعتماده. والضرر ممنوع حيث
 *   يجب: `dispatch_pool` تشترط `s.status = 'approved'`، فمركبة من ينتظر لا تدخل
 *   بثاً. وكل استعلام مقيَّد بـ `subcontractor_id` صراحةً فوق RLS.
 * - فئة المركبة تُتحقَّق من `vehicle_classes` النشطة على الخادم: القائمة المنسدلة
 *   حماية تجربة لا حماية بيانات، فمن يعدّل النموذج لا يستطيع اختراع فئة.
 * - فخ RLS المعروف: `.select()` بعد كل كتابة وفحص طول النتيجة (صفر صفوف = رفض سياسة).
 */

const url = (qs: string) => `/portal/fleet?${qs}`;

const MAX_LABEL = 120;
const MAX_PLATE = 32;
/** اللون وصفٌ لا معرّف — سقفٌ يمنع الفقرة، ولا قائمة مغلقة تُجبر «فضي» على «رمادي» */
const MAX_COLOR = 40;

type VehicleFields = {
  class_slug: string;
  label: string;
  model_year: number | null;
  plate: string | null;
  color: string | null;
  seats: number | null;
  active: boolean;
};

/** قراءة الحقول والتحقق منها — تُعيد رمز خطأ نصياً بدل الرمي */
function readVehicle(formData: FormData, prefix = ""): VehicleFields | string {
  const p = (name: string) => `${prefix}${name}`;

  const classSlug = text(formData, p("class_slug"));
  if (!classSlug) return "class";

  const label = clamp(text(formData, p("label")), MAX_LABEL);
  if (!label) return "label";

  const modelYear = num(formData, p("model_year"));
  if (
    modelYear !== null &&
    (!Number.isInteger(modelYear) || modelYear < MIN_MODEL_YEAR || modelYear > MAX_MODEL_YEAR)
  )
    return "year";

  const seats = num(formData, p("seats"));
  if (seats !== null && (!Number.isInteger(seats) || seats < 1 || seats > MAX_SEATS)) return "seats";

  return {
    class_slug: classSlug,
    label,
    model_year: modelYear,
    plate: clamp(text(formData, p("plate")), MAX_PLATE),
    color: clamp(text(formData, p("color")), MAX_COLOR),
    seats,
    active: formData.get(p("active")) != null,
  };
}

/** الفئة موجودة ونشطة فعلاً — وإلا فالمركبة لن تُسعَّر أبداً وسيظن صاحبها العكس */
async function classExists(supabase: SupabaseClient, slug: string): Promise<boolean> {
  const res = await supabase
    .from("vehicle_classes")
    .select("slug")
    .eq("slug", slug)
    .eq("active", true)
    .limit(1);
  return !res.error && (res.data?.length ?? 0) > 0;
}

export async function createVehicle(formData: FormData) {
  const access = await portalSetupAccess();
  if (!access.ok) redirect(url(`error=${access.code}`));
  const { supabase, sub } = access;

  const fields = readVehicle(formData, "new.");
  if (typeof fields === "string") redirect(url(`error=${fields}`));
  if (!(await classExists(supabase, fields.class_slug))) redirect(url("error=class"));

  const res = await supabase
    .from("subcontractor_vehicles")
    .insert({ ...fields, subcontractor_id: sub.id })
    .select("id");

  if (res.error || !res.data || res.data.length === 0) redirect(url("error=save"));

  revalidatePath("/", "layout");
  redirect(url("saved=1"));
}

export async function saveVehicle(vehicleId: string, formData: FormData) {
  const access = await portalSetupAccess();
  if (!access.ok) redirect(url(`error=${access.code}`));
  const { supabase, sub } = access;

  const fields = readVehicle(formData);
  if (typeof fields === "string") redirect(url(`error=${fields}`));
  if (!(await classExists(supabase, fields.class_slug))) redirect(url("error=class"));

  const res = await supabase
    .from("subcontractor_vehicles")
    .update(fields)
    .eq("id", vehicleId)
    .eq("subcontractor_id", sub.id)
    .select("id");

  if (res.error) redirect(url("error=save"));
  if (!res.data || res.data.length === 0) redirect(url("error=notfound"));

  revalidatePath("/", "layout");
  redirect(url("saved=1"));
}

/** تفعيل/إيقاف مركبة — الإيقاف يبقيها في السجل ويخرجها من حساب فئاتك المطلوبة */
export async function toggleVehicle(vehicleId: string) {
  const access = await portalSetupAccess();
  if (!access.ok) redirect(url(`error=${access.code}`));
  const { supabase, sub } = access;

  const current = await supabase
    .from("subcontractor_vehicles")
    .select("active")
    .eq("id", vehicleId)
    .eq("subcontractor_id", sub.id)
    .maybeSingle();

  if (current.error) redirect(url("error=save"));
  if (!current.data) redirect(url("error=notfound"));

  const res = await supabase
    .from("subcontractor_vehicles")
    .update({ active: current.data.active !== true })
    .eq("id", vehicleId)
    .eq("subcontractor_id", sub.id)
    .select("id");

  if (res.error || !res.data || res.data.length === 0) redirect(url("error=save"));

  revalidatePath("/", "layout");
  redirect(url("saved=1"));
}

export async function deleteVehicle(vehicleId: string) {
  const access = await portalSetupAccess();
  if (!access.ok) redirect(url(`error=${access.code}`));
  const { supabase, sub } = access;

  const res = await supabase
    .from("subcontractor_vehicles")
    .delete()
    .eq("id", vehicleId)
    .eq("subcontractor_id", sub.id)
    .select("id");

  if (res.error) redirect(url("error=save"));
  if (!res.data || res.data.length === 0) redirect(url("error=notfound"));

  // الصفُّ ذهب ⇒ ملفُّ صورته يتيمٌ لا يشير إليه شيء. ولا عاملَ كنسٍ مجدولاً
  // لهذا الدلو (‏0136 القسم الأخير: لا مهلةَ حفظٍ في الاتفاقية ⇒ لا دالةَ كنسٍ
  // بلا منادٍ — القاعدة ١٧)، فالكنسُ يقع هنا وفي كل رفعٍ ناجح.
  await sweepVehicleFolder(supabase, sub.id, vehicleId, null);

  revalidatePath("/", "layout");
  redirect(url("deleted=1"));
}

// ---------------------------------------------------------------------------
// صورة المركبة — العقد الملزم `lib/vehicles/types.ts`، والهجرة 0136
//
// 🔒 والرفع بجلسة الشريك لا بمفتاح الخدمة: سياسة
// `vehicle_photos_insert_own_or_admin` ومعها `vehicle_photo_upload_allowed`
// (شكلُ المسار + ملكيةُ المركبة + سقفُ العدد) هي التي تسمح أو تمنع **داخل
// القاعدة**. ولو رُفع بمفتاح الخدمة لصار الحارسُ سطرَ
// `.eq("subcontractor_id", sub.id)` في هذا الملف — وهو ما لا يشهد عليه اختبار.
//
// ── وترتيبُ العمليات مقصود في الاتجاهين ────────────────────────────────────
//
// **الرفع**: يُرفع الملف ← يُكتب المسار في الصف ← يُكنس المجلّد ممّا عداه. وإن
// فشلت كتابة الصف حُذف الجديد فوراً. **الإزالة**: يُمحى المسار من الصف ← ثم
// يُكنس المجلّد. لأن صفّاً يشير إلى ملفٍّ ذهب أسوأ من ملفٍّ لا يشير إليه صف:
// الأول يعرض عطلاً للمستخدم، والثاني يُكنس في العملية التالية.
// ---------------------------------------------------------------------------

/** رفع صورة المركبة أو استبدالها */
export async function uploadVehiclePhotoAction(vehicleId: string, formData: FormData) {
  const access = await portalSetupAccess();
  if (!access.ok) redirect(url(`error=${access.code}`));
  const { supabase, sub } = access;

  const read = readVehiclePhotoFile(formData.get("file"));
  if (!read.ok) redirect(url(`error=${read.error}`));

  // وجودُ المركبة وملكيتُها يُتحقَّقان قبل الرفع — الرفضُ في القاعدة قائمٌ على
  // كل حال، لكن الرسالة العربية أولى من رفضٍ خام من التخزين
  const current = await supabase
    .from("subcontractor_vehicles")
    .select("id")
    .eq("id", vehicleId)
    .eq("subcontractor_id", sub.id)
    .maybeSingle();

  if (current.error) redirect(url("error=save"));
  if (!current.data) redirect(url("error=notfound"));

  const path = buildVehiclePhotoPath(sub.id, vehicleId, read.ext);
  const uploaded = await uploadVehiclePhoto(supabase, path, read.file);
  if (!uploaded) redirect(url("error=upload"));

  const res = await supabase
    .from("subcontractor_vehicles")
    .update({ photo_path: path })
    .eq("id", vehicleId)
    .eq("subcontractor_id", sub.id)
    .select("id");

  if (res.error || !res.data || res.data.length === 0) {
    // الصف لم يُكتب ⇒ الملف المرفوع لا يشير إليه شيء: يُحذف فوراً
    await removeVehiclePhotos(supabase, [path]);
    redirect(url("error=save"));
  }

  await sweepVehicleFolder(supabase, sub.id, vehicleId, path);

  revalidatePath("/", "layout");
  redirect(url("saved=1"));
}

/** إزالة صورة المركبة — يبقى الصفّ بكل بياناته */
export async function removeVehiclePhotoAction(vehicleId: string) {
  const access = await portalSetupAccess();
  if (!access.ok) redirect(url(`error=${access.code}`));
  const { supabase, sub } = access;

  const res = await supabase
    .from("subcontractor_vehicles")
    .update({ photo_path: null })
    .eq("id", vehicleId)
    .eq("subcontractor_id", sub.id)
    .select("id");

  if (res.error) redirect(url("error=save"));
  if (!res.data || res.data.length === 0) redirect(url("error=notfound"));

  await sweepVehicleFolder(supabase, sub.id, vehicleId, null);

  revalidatePath("/", "layout");
  redirect(url("saved=1"));
}
