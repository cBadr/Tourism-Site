"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { SupabaseClient } from "@supabase/supabase-js";

import { dispatchNotifications } from "@/lib/notifications/dispatch";
import { createServiceSupabase } from "@/lib/supabase/admin";
import { createServerSupabase } from "@/lib/supabase/server";

/**
 * إجراءات مركز الإشعارات: إعادة جدولة إشعار فاشل، وتشغيل عامل الإرسال يدوياً.
 *
 * الأمان: كلا الإجراءين يتحققان أولاً أن صاحب الجلسة `admin` عبر دالة
 * `is_admin()` في قاعدة البيانات (نفس الدالة التي تحرس كل سياسات RLS). سبب
 * الفحص الصريح: حارس المسارات يتأكد من *وجود* جلسة لا من *دورها*، وهذان
 * الإجراءان يشغّلان إرسالاً خارجياً ويكتبان في طابور النظام.
 *
 * بعد التحقق تُنفَّذ الكتابة بعميل الخدمة لأن طابور الإشعارات ملك للنظام وقد لا
 * تكون له سياسة UPDATE للمستخدمين — ولو غاب مفتاح الخدمة نعود لعميل الجلسة
 * ونعتمد على RLS. اتفاقية «إعادة التوجيه بعد العملية» سارية كالمعتاد.
 */

const url = (qs: string) => `/admin/notifications?${qs}`;

/** يحافظ على مرشّح الحالة المعروض بعد إعادة التوجيه */
function withFilter(formData: FormData, params: Record<string, string>): string {
  const filter = formData.get("filter");
  const qs = new URLSearchParams(params);
  if (typeof filter === "string" && filter.trim() !== "") qs.set("status", filter.trim());
  return qs.toString();
}

/** عميل الكتابة بعد التأكد من الدور — null تعني «ليس admin أو البيئة ناقصة» */
async function adminClient(): Promise<SupabaseClient | null> {
  const session = await createServerSupabase();
  if (!session) return null;

  const { data, error } = await session.rpc("is_admin");
  if (error || data !== true) return null;

  return createServiceSupabase() ?? session;
}

/** إعادة إشعار إلى الطابور — يمسح نص الخطأ ويُبقي عدّاد المحاولات كسجل */
export async function retryNotification(formData: FormData) {
  const id = formData.get("id");
  if (typeof id !== "string" || id.trim() === "") {
    redirect(url(withFilter(formData, { error: "id" })));
  }

  const supabase = await adminClient();
  if (!supabase) redirect(url(withFilter(formData, { error: "forbidden" })));

  const res = await supabase
    .from("notifications")
    .update({ status: "queued", error: null })
    .eq("id", id.trim())
    .select("id");

  // فخ الصفوف الصفرية: نجاح ظاهري بصفر صفوف = الكتابة مرفوضة
  if (res.error || !res.data || res.data.length === 0) {
    redirect(url(withFilter(formData, { error: "retry" })));
  }

  revalidatePath("/admin/notifications");
  redirect(url(withFilter(formData, { queued: "1" })));
}

/** تشغيل دورة إرسال فوراً من اللوحة — نفس الدورة التي تشغّلها المهمة المجدولة */
export async function runDispatch(formData: FormData) {
  const supabase = await adminClient();
  if (!supabase) redirect(url(withFilter(formData, { error: "forbidden" })));

  const summary = await dispatchNotifications();

  const params: Record<string, string> = {
    ran: "1",
    processed: String(summary.processed),
    sent: String(summary.sent),
    skipped: String(summary.skipped),
    failed: String(summary.failed),
  };
  if (summary.reason) params.reason = summary.reason;

  revalidatePath("/admin/notifications");
  redirect(url(withFilter(formData, params)));
}
