"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { createServerSupabase } from "@/lib/supabase/server";

/**
 * توثيق رخصة سائق من اللوحة — الإجراء الوحيد الذي تملكه الإدارة على هذا السطح.
 *
 * ⚠ **ولا شاشة «سائقون» في `/admin` ولن تكون**: «قسم السائقين أُلغي بقرار بدر
 * (2026-08-11) — لا إدارة سائقين مباشرين إطلاقاً» (العمود الأول من أعمدة المنتج).
 * فالإدارة **تقرأ** ما أعلنه الشريك و**تشهد** على أنها رأت الرخصة، ولا تُنشئ
 * سائقاً ولا تعدّل اسمه ولا هاتفه ولا تحذفه.
 *
 * 🔒 **والحارس في القاعدة لا هنا**: `admin_verify_driver_license` دالة
 * `security definer` أول سطرٍ فيها `if not public.is_admin() then raise` — فهي
 * مرفوضة على كل متعهد ولو نادى PostgREST مباشرةً بجلسته. وما في هذا الملف
 * تجربةُ استخدام فوق ذلك الحارس لا بديلٌ عنه.
 *
 * والتوثيق **يسقط من تلقائه** عند أي تعديل لاحق على رقم الرخصة أو تاريخها أو
 * صورتها (مُشغّل `subcontractor_drivers_docs_guard` في 0120) — فلا يشهد وسمُ
 * «موثَّقة» على ملفٍّ استُبدل بعد الشهادة.
 */

export async function verifyDriverLicense(
  subcontractorId: string,
  driverId: string,
  verified: boolean
) {
  const back = (qs: string) => `/admin/subcontractors/${subcontractorId}?${qs}#drivers`;

  const supabase = await createServerSupabase();
  if (!supabase) redirect(back("error=env"));

  const { error } = await supabase.rpc("admin_verify_driver_license", {
    p_driver_id: driverId,
    p_verified: verified,
  });

  // `forbidden` من الدالة يعني «لست إدارة» — و`save` في `COMMON_BOOKING_ERRORS`
  // تقول ذلك بنصّها («تأكد أنك مسجل الدخول بحساب دوره admin»)، فلا رمزَ جديد
  // يُضاف إلى خريطةِ رسائلٍ مشتركة يبنيها غيري الآن.
  if (error) redirect(back(error.hint === "driver-not-found" ? "error=notfound" : "error=save"));

  revalidatePath("/", "layout");
  redirect(back("saved=1"));
}
