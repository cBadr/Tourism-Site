"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import type { BookingStatus } from "@/lib/booking-types";
import { startDispatchFor } from "@/lib/dispatch/start";
import { createServerSupabase } from "@/lib/supabase/server";

/**
 * إجراءات شاشة تفاصيل الطلب — كلها استدعاءات لدوال Postgres، بلا أي منطق حالة في TypeScript.
 *
 * قواعد ثابتة:
 * - **آلة الحالات محروسة في SQL** (قرار المرحلة ٤): الانتقال غير المسموح يرفع خطأ من
 *   `set_booking_status`، والواجهة تعرض الرسالة فقط ولا تقرر شيئاً.
 * - اتفاقية «إعادة التوجيه بعد العملية»: النجاح والفشل كلاهما redirect برمز في الرابط.
 * - فخ RLS المعروف: الكتابة المباشرة تنجح ظاهرياً بصفر صفوف عند رفض السياسة. هنا كل
 *   الكتابة تمر بدوال `security definer` تتحقق من `is_admin()` بنفسها وترفع استثناءً
 *   عند الرفض، فالفحص المكافئ هو فحص `error` بعد كل rpc.
 * - **رسالة الخطأ تأتي من القاعدة لا من التخمين**: كل `raise exception` في هجرة
 *   المرحلة ٤ تحمل `using hint = '...'`، وPostgREST يمرّره في `error.hint`. نترجم
 *   هذا الرمز إلى رمز في الرابط تعرض له الصفحة جملة دقيقة، بدل رسالة «فشل الحفظ»
 *   العامة التي كانت تتهم الصلاحيات في كل الحالات.
 * - `revalidatePath("/", "layout")` لأن حالة الحجز تظهر أيضاً في صفحة المتابعة العامة
 *   `/booking/[token]` التي يفتحها العميل.
 */

const url = (bookingId: string, qs: string) => `/admin/orders/${bookingId}?${qs}`;

/**
 * ترجمة `hint` القادم من دوال Postgres إلى رمز الخطأ في الرابط.
 * الرموز المعرَّفة في الهجرة: forbidden / invalid-status / payment-not-found /
 * booking-not-found / illegal-transition / invalid-input.
 * أي رمز غير معروف يسقط على `fallback` الذي يحدده المُنادي.
 */
const HINT_CODES: Record<string, string> = {
  forbidden: "forbidden",
  "invalid-status": "vstatus",
  "payment-not-found": "noreceipt",
  "booking-not-found": "missing",
  "illegal-transition": "status",
  "invalid-input": "input",
};

function hintCode(error: { hint?: string | null } | null, fallback: string): string {
  const hint = typeof error?.hint === "string" ? error.hint.trim() : "";
  return HINT_CODES[hint] ?? fallback;
}

const STATUSES: BookingStatus[] = [
  "pending_payment",
  "under_review",
  "confirmed",
  "assigned",
  "completed",
  "cancelled",
];

/** نص مُشذّب أو null */
function text(formData: FormData, name: string): string | null {
  const v = formData.get(name);
  return typeof v === "string" && v.trim() !== "" ? v.trim() : null;
}

/** حد أعلى عاقل للملاحظة — تُخزَّن في سجل الحالة ويقرأها التشغيل لاحقاً */
const MAX_NOTE = 500;

const trimNote = (note: string | null) => (note ? note.slice(0, MAX_NOTE) : null);

/**
 * اعتماد التحويل أو رفضه — `verify_payment` تنقل الحجز إلى `confirmed` عند الاعتماد
 * أو تعيده إلى `pending_payment` عند الرفض، وتكتب صف الحدث والإشعار في نفس المعاملة.
 * سبب الرفض إلزامي: العميل يراه في صفحة متابعة حجزه فلا يُترك بلا تفسير.
 *
 * الدالة تشترط أن يكون الحجز «قيد المراجعة» وأن يوجد إيصال بحالة `pending`،
 * وترفع `invalid-status` أو `payment-not-found` وإلا — والرسالتان مختلفتان تماماً
 * عن رسالة نقص الصلاحيات (`forbidden`)، فلا تُخلط الثلاثة في «فشل الحفظ».
 */
export async function verifyTransfer(bookingId: string, approve: boolean, formData: FormData) {
  const supabase = await createServerSupabase();
  if (!supabase) redirect(url(bookingId, "error=env"));

  const note = trimNote(text(formData, approve ? "approve_note" : "reject_note"));
  if (!approve && !note) redirect(url(bookingId, "error=note"));

  const { error } = await supabase.rpc("verify_payment", {
    p_booking_id: bookingId,
    p_approve: approve,
    p_note: note,
  });
  if (error) redirect(url(bookingId, `error=${hintCode(error, "save")}`));

  // الحجز صار «مؤكَّداً» ⇒ إطلاق البث تلقائياً (المرحلة ٦). الدالة لا ترمي أبداً
  // ولا تغيّر نتيجة الاعتماد: البوابة `dispatch_settings.autoStart` تقرر التنفيذ،
  // وأي فشل في البث يُسجَّل ويُعالَج من طابور الإسناد اليدوي — ولا يُفشل اعتماد
  // تحويل وصل فعلاً.
  if (approve) await startDispatchFor(bookingId);

  revalidatePath("/", "layout");
  redirect(url(bookingId, "saved=1"));
}

/**
 * تغيير الحالة يدوياً — التحقق هنا شكلي فقط (قيمة ضمن العقد)، والحراسة الحقيقية
 * على الانتقال نفسه داخل `set_booking_status` في قاعدة البيانات.
 */
export async function changeStatus(bookingId: string, formData: FormData) {
  const supabase = await createServerSupabase();
  if (!supabase) redirect(url(bookingId, "error=env"));

  const next = text(formData, "status");
  if (!next || !(STATUSES as string[]).includes(next)) redirect(url(bookingId, "error=status"));

  const { error } = await supabase.rpc("set_booking_status", {
    p_booking_id: bookingId,
    p_status: next,
    p_note: trimNote(text(formData, "status_note")),
  });
  if (error) redirect(url(bookingId, `error=${hintCode(error, "status")}`));

  revalidatePath("/", "layout");
  redirect(url(bookingId, "saved=1"));
}

/**
 * إلغاء الحجز — خطوة تأكيد إجبارية قبلها (رابط ?confirm=cancel يعرض بطاقة التأكيد)،
 * فلا يقع الإلغاء بضغطة واحدة على حجز مدفوع.
 */
export async function cancelBooking(bookingId: string, formData: FormData) {
  const supabase = await createServerSupabase();
  if (!supabase) redirect(url(bookingId, "error=env"));

  const note = trimNote(text(formData, "cancel_note"));
  if (!note) redirect(url(bookingId, "error=note&confirm=cancel"));

  const { error } = await supabase.rpc("set_booking_status", {
    p_booking_id: bookingId,
    p_status: "cancelled",
    p_note: note,
  });
  if (error) redirect(url(bookingId, `error=${hintCode(error, "status")}&confirm=cancel`));

  revalidatePath("/", "layout");
  redirect(url(bookingId, "saved=1"));
}
