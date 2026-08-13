"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { createServerSupabase } from "@/lib/supabase/server";

/**
 * إجراءات غلاف البورتال — الخروج وحده.
 *
 * الخروج server action لا زر عميل: حذف كوكيز الجلسة يجري على الخادم في نفس
 * الاستجابة، فلا تبقى نافذة يظل فيها الكوكي حياً بينما تظهر الواجهة كأنها خرجت.
 */
export async function signOutPortal() {
  const supabase = await createServerSupabase();
  if (supabase) await supabase.auth.signOut();

  // الغلاف والصفحات كلها مبنية على الجلسة — تُفرَّغ ذاكرتها كاملة بعد الخروج
  revalidatePath("/", "layout");
  redirect("/admin/login");
}
