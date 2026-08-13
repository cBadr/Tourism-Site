"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import type { QuoteRequestRow } from "@/lib/booking-types";
import { createServerSupabase } from "@/lib/supabase/server";

/**
 * إجراءات شاشة طلبات الأسعار — تحديث حالة المتابعة في `quote_requests`.
 *
 * اتفاقية «إعادة التوجيه بعد العملية»: النجاح والفشل كلاهما redirect برمز في الرابط.
 * فخ RLS المعروف: update ينجح ظاهرياً بصفر صفوف عند رفض السياسة — لذلك `.select()`
 * وفحص طول النتيجة بعد الكتابة.
 */

const url = (qs: string) => `/admin/quote-requests?${qs}`;

const STATUSES: QuoteRequestRow["status"][] = ["new", "contacted", "converted", "closed"];

export async function setQuoteStatus(requestId: string, formData: FormData) {
  const supabase = await createServerSupabase();
  if (!supabase) redirect(url("error=env"));

  const raw = formData.get("status");
  const status = typeof raw === "string" ? raw.trim() : "";
  if (!(STATUSES as string[]).includes(status)) redirect(url("error=status"));

  // الرجوع إلى نفس التبويب الذي كان المستخدم يعمل فيه — قيمة من قائمة مغلقة فقط
  const tabRaw = formData.get("tab");
  const tab =
    typeof tabRaw === "string" && (STATUSES as string[]).includes(tabRaw) ? tabRaw : null;

  const { data, error } = await supabase
    .from("quote_requests")
    .update({ status })
    .eq("id", requestId)
    .select("id");

  if (error || !data || data.length === 0) redirect(url("error=save"));

  revalidatePath("/", "layout");
  redirect(url(tab ? `status=${tab}&saved=1` : "saved=1"));
}
