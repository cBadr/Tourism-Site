"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { SupabaseClient } from "@supabase/supabase-js";

import { dispatchNotifications } from "@/lib/notifications/dispatch";
import { createServiceSupabase } from "@/lib/supabase/admin";
import { createServerSupabase } from "@/lib/supabase/server";

/**
 * إجراءات مركز الإشعارات: إعادة جدولة إشعار فاشل، وتشغيل عامل الإرسال يدوياً،
 * وحالةُ العرض التي أضافتها `0077` (كنس · إرجاع · تعليم الكل كمقروء).
 *
 * الأمان: كل إجراء يتحقق أولاً أن صاحب الجلسة `admin` عبر دالة `is_admin()` في
 * قاعدة البيانات (نفس الدالة التي تحرس كل سياسات RLS). سبب الفحص الصريح: حارس
 * المسارات يتأكد من *وجود* جلسة لا من *دورها*، وهذه الإجراءات تشغّل إرسالاً
 * خارجياً وتكتب في طابور النظام.
 *
 * 🔴 **ولا حذف في هذا الملف ولا في هذه الشاشة.** `notifications` سجلُّ تسليم:
 * منه شُخِّص عيبٌ حقيقي (‏`trip_offered` لا يبلغ أحداً)، والكنس **حالةُ عرضٍ
 * تُكتب ولا تُمحى** — ولذلك لكل كنسٍ إرجاعٌ بجواره. و`0077` تسحب `delete`
 * و`truncate` من `authenticated` أصلاً، فأي `.delete()` هنا يفشل من القاعدة.
 *
 * اتفاقية «إعادة التوجيه بعد العملية» سارية كالمعتاد، والخادم يعيد **رمزاً لا
 * جملة** — الشاشة وحدها تؤلّف العربية.
 */

const url = (qs: string) => `/admin/notifications?${qs}`;

/**
 * مفاتيح الترشيح التي تُحمل عبر **كل** إعادة توجيه.
 *
 * قائمةُ سماحٍ لا نسخٌ لما وصل: القيمة تأتي من نموذجٍ في المتصفح، ومفتاحٌ
 * مجهول يُهمَل بدل أن يُعاد إلى الرابط. والشاشة تتحقق من كل قيمة ثانيةً على أي
 * حال (قيمةٌ غير معروفة تسقط إلى «الكل»)، فهذه طبقةٌ أولى لا وحيدة.
 */
const FILTER_KEYS = ["status", "event", "audience", "channel", "view", "page"] as const;

/** أطول قيمة مرشّح معقولة — ما زاد عنها ليس مرشّحاً بل حشو */
const MAX_FILTER_VALUE = 40;

/**
 * يحافظ على كل المرشّحات المعروضة بعد إعادة التوجيه.
 *
 * كان يحفظ `status` وحده، فكل ضغطة «إعادة محاولة» تُلقي المالك خارج ترشيحه
 * (الوجهة والقناة وحالة العرض والصفحة) — وهو أوضح ما يظهر مع الترقيم: صفٌّ
 * يُعاد جدولته في الصفحة الرابعة كان يرجع بالمالك إلى الأولى.
 */
function withFilters(formData: FormData, params: Record<string, string>): string {
  const qs = new URLSearchParams(params);
  const raw = formData.get("filters");
  if (typeof raw === "string" && raw !== "") {
    const kept = new URLSearchParams(raw);
    for (const key of FILTER_KEYS) {
      const value = kept.get(key)?.trim();
      // `!qs.has(key)` — ما تضعه العملية نفسها أولى بما جاء من النموذج
      if (value && value.length <= MAX_FILTER_VALUE && !qs.has(key)) qs.set(key, value);
    }
  }
  return qs.toString();
}

/**
 * عميل الكتابة بعد التأكد من الدور — null تعني «ليس admin أو البيئة ناقصة».
 *
 * يُفضَّل عميل الخدمة لأن طابور الإشعارات ملك للنظام وقد لا تكون له سياسة
 * UPDATE للمستخدمين — ولو غاب مفتاح الخدمة نعود لعميل الجلسة ونعتمد على RLS.
 */
async function adminClient(): Promise<SupabaseClient | null> {
  const session = await createServerSupabase();
  if (!session) return null;

  const { data, error } = await session.rpc("is_admin");
  if (error || data !== true) return null;

  return createServiceSupabase() ?? session;
}

/**
 * 🔒 عميل **الجلسة** بعد التأكد من الدور — ولا يصلح `adminClient()` مكانه.
 *
 * دوالُّ `0077` الثلاث تحرس نفسها بـ`is_admin()`، و`is_admin()` تقرأ
 * `auth.uid()` من الجلسة. ومفتاحُ الخدمة بلا مستخدم ⇒ `auth.uid()` فارغة ⇒
 * الدالة ترفع الاستثناء وترفض المالكَ نفسَه. فهذه النداءات بجلسة المالك حصراً،
 * وهي آمنة كذلك: الدوالّ `security definer` فتتخطى RLS، و`execute` ممنوحة
 * لـ`authenticated` وحدها بلا `anon`.
 */
async function sessionAdminClient(): Promise<SupabaseClient | null> {
  const session = await createServerSupabase();
  if (!session) return null;

  const { data, error } = await session.rpc("is_admin");
  if (error || data !== true) return null;

  return session;
}

/** إعادة إشعار إلى الطابور — يمسح نص الخطأ ويُبقي عدّاد المحاولات كسجل */
export async function retryNotification(formData: FormData) {
  const id = formData.get("id");
  if (typeof id !== "string" || id.trim() === "") {
    redirect(url(withFilters(formData, { error: "id" })));
  }

  const supabase = await adminClient();
  if (!supabase) redirect(url(withFilters(formData, { error: "forbidden" })));

  const res = await supabase
    .from("notifications")
    .update({ status: "queued", error: null })
    .eq("id", id.trim())
    .select("id");

  // فخ الصفوف الصفرية: نجاح ظاهري بصفر صفوف = الكتابة مرفوضة
  if (res.error || !res.data || res.data.length === 0) {
    redirect(url(withFilters(formData, { error: "retry" })));
  }

  revalidatePath("/admin/notifications");
  redirect(url(withFilters(formData, { queued: "1" })));
}

/**
 * كنسُ صفٍّ واحد من الجرس — **حالةُ عرضٍ لا حذف**.
 *
 * الحارس الحقيقي في القاعدة لا هنا: `ops_notifications_dismiss` تشترط
 * `recipient_kind = 'ops'` داخل البيان، فصفُّ متعهدٍ يعود بصفر صفوف مهما فعلت
 * الواجهة. والشاشة لا تعرض الزر على صفوف المتعهدين أصلاً — حارسان لا واحد.
 */
export async function dismissNotification(formData: FormData) {
  const id = formData.get("id");
  if (typeof id !== "string" || id.trim() === "") {
    redirect(url(withFilters(formData, { error: "id" })));
  }

  const supabase = await sessionAdminClient();
  if (!supabase) redirect(url(withFilters(formData, { error: "forbidden" })));

  const { data, error } = await supabase.rpc("ops_notifications_dismiss", { p_id: id.trim() });

  // الدالة ترجع عدد الصفوف — والصفر هنا رفضٌ لا نجاح (صفُّ متعهد أو مكنوسٌ سلفاً)
  if (error || typeof data !== "number" || data === 0) {
    redirect(url(withFilters(formData, { error: "dismiss" })));
  }

  revalidatePath("/admin/notifications");
  redirect(url(withFilters(formData, { swept: "1" })));
}

/**
 * إرجاع صفٍّ مكنوس (أو مقروء) إلى الجرس — وهو ما يجعل الكنس قراراً غير نهائي.
 * بدونه يصير الكنس حذفاً عملياً وإن بقي الصف في السجل.
 */
export async function restoreNotification(formData: FormData) {
  const id = formData.get("id");
  if (typeof id !== "string" || id.trim() === "") {
    redirect(url(withFilters(formData, { error: "id" })));
  }

  const supabase = await sessionAdminClient();
  if (!supabase) redirect(url(withFilters(formData, { error: "forbidden" })));

  const { data, error } = await supabase.rpc("ops_notifications_restore", { p_id: id.trim() });

  if (error || typeof data !== "number" || data === 0) {
    redirect(url(withFilters(formData, { error: "restore" })));
  }

  revalidatePath("/admin/notifications");
  redirect(url(withFilters(formData, { restored: "1" })));
}

/**
 * تعليم كل إشعارات فريق التشغيل المفتوحة كمقروءة — بيانٌ واحد لا نداءٌ لكل صف.
 *
 * ⚠ و`p_id` فارغاً **لا يعني «كل الصفوف»** بل «كل صفوف التشغيل المفتوحة»:
 * شرطُ `recipient_kind = 'ops'` مفروضٌ في الدالة، وبدونه كان «تعليم الكل» يُطفئ
 * صناديق كل المتعهدين دفعةً واحدة — عرضٌ معلّقٌ يصير مقروءاً بلا أن يفتحه صاحبه.
 *
 * والصفر ليس خطأً هنا: «لا شيء مفتوح» جوابٌ صحيح — فيُعاد العدد رمزاً وتقوله
 * الشاشة بالعربية.
 */
export async function markAllRead(formData: FormData) {
  const supabase = await sessionAdminClient();
  if (!supabase) redirect(url(withFilters(formData, { error: "forbidden" })));

  const { data, error } = await supabase.rpc("ops_notifications_mark_read", { p_id: null });

  if (error || typeof data !== "number") {
    redirect(url(withFilters(formData, { error: "read" })));
  }

  revalidatePath("/admin/notifications");
  redirect(url(withFilters(formData, { marked: String(data) })));
}

/** تشغيل دورة إرسال فوراً من اللوحة — نفس الدورة التي تشغّلها المهمة المجدولة */
export async function runDispatch(formData: FormData) {
  const supabase = await adminClient();
  if (!supabase) redirect(url(withFilters(formData, { error: "forbidden" })));

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
  redirect(url(withFilters(formData, params)));
}
