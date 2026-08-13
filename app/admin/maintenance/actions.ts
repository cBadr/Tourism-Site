"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { createServerSupabase } from "@/lib/supabase/server";
import {
  DEFAULT_MAINTENANCE,
  MAINTENANCE_SETTINGS_KEY,
  MAX_MAINTENANCE_MESSAGE,
  clearMaintenanceCache,
} from "@/lib/maintenance";

/**
 * إجراء شاشة الصيانة — يكتب مفتاح `maintenance` الواحد في `site_settings`.
 * اتفاقية «إعادة التوجيه بعد العملية»: النجاح والفشل كلاهما redirect برمز في الرابط.
 * فخ RLS المعروف: upsert ينجح بصفر صفوف عند رفض السياسة — لذلك نفحص `.select()`.
 */

// ملف "use server" لا يصدّر إلا دوالّ async — الثوابت مكانها lib/maintenance.ts
const url = (qs: string) => `/admin/maintenance?${qs}`;

export async function saveMaintenance(formData: FormData) {
  const supabase = await createServerSupabase();
  if (!supabase) redirect(url("error=env"));

  const enabled = formData.get("enabled") != null;

  const raw = formData.get("message");
  const message = typeof raw === "string" ? raw.trim() : "";
  if (message.length > MAX_MAINTENANCE_MESSAGE) redirect(url("error=length"));

  const value = {
    enabled,
    // رسالة فارغة = الرجوع للنص الافتراضي، فلا يرى الزائر صفحة بلا شرح أبداً
    message: message === "" ? DEFAULT_MAINTENANCE.message : message,
    // يبقى true في هذه المرحلة: إغلاق اللوحة أثناء الصيانة يقفل باب الإطفاء نفسه
    allowAdmin: true,
  };

  const { data, error } = await supabase
    .from("site_settings")
    .upsert({ key: MAINTENANCE_SETTINGS_KEY, value }, { onConflict: "key" })
    .select("key");

  // صفر صفوف مع نجاح ظاهري = RLS رفضت الكتابة (المستخدم ليس admin)
  if (error || !data || data.length === 0) redirect(url("error=save"));

  clearMaintenanceCache();
  revalidatePath("/", "layout");
  redirect(url(enabled ? "saved=on" : "saved=off"));
}
