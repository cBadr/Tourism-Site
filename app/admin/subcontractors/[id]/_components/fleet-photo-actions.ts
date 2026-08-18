"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { createServerSupabase } from "@/lib/supabase/server";
import {
  buildVehiclePhotoPath,
  readVehiclePhotoFile,
  removeVehiclePhotos,
  sweepVehicleFolder,
  uploadVehiclePhoto,
} from "@/lib/vehicles/photos";

/**
 * رفعُ صورة المركبة وإزالتُها **من اللوحة** — نظير إجراءَي البوابة تماماً،
 * والفرقُ الوحيد جلسةُ المنادي وموضعُ العودة.
 *
 * ── لماذا للمشرف بابٌ أصلاً، والأسطول «يديره المتعهد من بوابته»؟ ──────────
 *
 * قرارُ المالك 2026-08-18 صريح: **يرفعها المتعهد من بوابته ويرفعها المشرف كذلك
 * من اللوحة.** والسببُ عمليّ: شريكٌ لا يرفع صورة سيارته يترك المشرف بلا وسيلةٍ
 * لمعرفة ما سيصل العميل. فالمشرف يرفع **الصورة وحدها** — ولا يُنشئ مركبةً ولا
 * يعدّل بياناتها ولا يحذفها، فذلك سجلٌّ يملكه الشريك.
 *
 * 🔒 **والحارس في القاعدة لا هنا** (القاعدة الذهبية ١٩: كاشفٌ يقرأ نصّاً يكذب
 * في الاتجاهين). ثلاثة أقفال مستقلة تعمل على هذا المسار:
 *
 *   ١) سياسةُ الرفع `vehicle_photos_insert_own_or_admin` ← تنادي
 *      `vehicle_photo_upload_allowed`: شكلُ المسار + وجودُ المركبة + أن يكون
 *      الرافع `is_admin()` **أو** مالكَ المركبة + سقفُ ستة ملفات.
 *   ٢) سياسةُ التعديل على `subcontractor_vehicles` ← `is_admin()` أو المالك،
 *      فكتابةُ العمود نفسها محروسة. والكتابةُ تُفحص بـ`.select()` وطولِ النتيجة
 *      لأن RLS ترفض **بلا خطأ**: «نجاحٌ» بصفر صفوف.
 *   ٣) مُشغّلُ `subcontractor_vehicles_photo_guard` ← المسار يجب أن يقع تحت
 *      مجلّد مالكه ومركبته، فمسارٌ سليم الشكل يخصّ مركبةً أخرى يُرفض.
 *
 * فحتى لو نادى متعهدٌ هذه الدالة مباشرةً بمعرّف منافسه، تسقط عند القفل الأول.
 */

/**
 * 🔴 ولماذا `fleetphoto=` لا `error=`/`saved=` المعتادين في هذه الشاشة؟
 *
 * خريطةُ رسائل هذه الصفحة (`SUBCONTRACTOR_ERRORS`) تعيش في ملفٍّ مشترك **خارج
 * هذه الجبهة** فلا يُحرَّر (قاعدة العمل المتوازي: وكيلان على ملفٍّ واحد يمحو
 * أحدهما الآخر صامتاً). ولو أُرسلت رموزُ الصورة في `error=` لقرأها الشريطُ
 * العلويّ ولم يجدها، فطبع «حدث خطأ غير متوقع» — وهي أسوأ من الصمت: تُخفي أن
 * الملف كان كبيراً أو صيغته مرفوضة، فيعيد المشرف المحاولة بنفس الملف.
 *
 * فمفتاحٌ مستقل يعني: الشريطُ العلويّ لا يراه أصلاً، **والبطاقة تقول السبب
 * كاملاً في مكانه** — وهو نفس مبدأ «رمز خطأ مستقل لكل سبب» في اتفاقية §٤.
 */
const back = (subcontractorId: string, code: string) =>
  `/admin/subcontractors/${subcontractorId}?fleetphoto=${code}#fleet-detail`;

export async function adminUploadVehiclePhoto(
  subcontractorId: string,
  vehicleId: string,
  formData: FormData
) {
  const supabase = await createServerSupabase();
  if (!supabase) redirect(back(subcontractorId, "env"));

  const read = readVehiclePhotoFile(formData.get("file"));
  if (!read.ok) redirect(back(subcontractorId, read.error));

  // المركبة موجودةٌ وتخصّ هذا الشريك — والقاعدة تحرسها على كل حال، لكن رمزاً
  // واضحاً أولى من رفضٍ خام من التخزين
  const current = await supabase
    .from("subcontractor_vehicles")
    .select("id")
    .eq("id", vehicleId)
    .eq("subcontractor_id", subcontractorId)
    .maybeSingle();

  if (current.error) redirect(back(subcontractorId, "save"));
  if (!current.data) redirect(back(subcontractorId, "notfound"));

  const path = buildVehiclePhotoPath(subcontractorId, vehicleId, read.ext);
  const uploaded = await uploadVehiclePhoto(supabase, path, read.file);
  if (!uploaded) redirect(back(subcontractorId, "upload"));

  const res = await supabase
    .from("subcontractor_vehicles")
    .update({ photo_path: path })
    .eq("id", vehicleId)
    .eq("subcontractor_id", subcontractorId)
    .select("id");

  if (res.error || !res.data || res.data.length === 0) {
    // الصف لم يُكتب ⇒ الملف لا يشير إليه شيء: يُحذف فوراً
    await removeVehiclePhotos(supabase, [path]);
    redirect(back(subcontractorId, "save"));
  }

  // الكنسُ بديلُ العامل المجدول لا نسيانُه — انظر ترويسة 0136 و`sweepVehicleFolder`
  await sweepVehicleFolder(supabase, subcontractorId, vehicleId, path);

  revalidatePath("/", "layout");
  redirect(back(subcontractorId, "saved"));
}

export async function adminRemoveVehiclePhoto(subcontractorId: string, vehicleId: string) {
  const supabase = await createServerSupabase();
  if (!supabase) redirect(back(subcontractorId, "env"));

  const res = await supabase
    .from("subcontractor_vehicles")
    .update({ photo_path: null })
    .eq("id", vehicleId)
    .eq("subcontractor_id", subcontractorId)
    .select("id");

  if (res.error) redirect(back(subcontractorId, "save"));
  if (!res.data || res.data.length === 0) redirect(back(subcontractorId, "notfound"));

  await sweepVehicleFolder(supabase, subcontractorId, vehicleId, null);

  revalidatePath("/", "layout");
  redirect(back(subcontractorId, "saved"));
}
