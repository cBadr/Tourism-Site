"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { isMissingTable } from "@/lib/dispatch/settings";
import { runDispatchTick as runTickWorker } from "@/lib/dispatch/tick";
import { createServerSupabase } from "@/lib/supabase/server";
import { SETTINGS_COLUMNS } from "./_components/dispatch-ui";

/**
 * إجراءات شاشة الإسناد: حفظ إعدادات البث، وتشغيل دورة الإسناد يدوياً.
 *
 * `dispatch_settings` جدول صف واحد (نفس نمط `pricing_settings`): نحدّث الصف
 * الموجود، وإن لم يوجد نُدرجه. لا حساب هنا — تحقق من المدخلات فقط، وكل أثر
 * الإعدادات يقع داخل دوال `start_dispatch` و`dispatch_tick`.
 *
 * دورة الإسناد نفسها (`dispatch_tick`) هي ما تنتهي به المهل وتُفتح به الموجة
 * التالية أو يُصعَّد الطلب للطابور اليدوي. الزر هنا يشغّل **نفس** عامل الدورة
 * الذي تستدعيه المهمة المجدولة على `/api/dispatch/tick` (`lib/dispatch/tick.ts`)
 * — لا نسخة ثانية منه — بنفس حراسة «تشغيل الإرسال الآن» في مركز الإشعارات:
 * تحقق صريح من الدور عبر `is_admin()` أولاً، لأن حارس المسارات يتأكد من *وجود*
 * جلسة لا من *دورها*، وهذه عملية نظام تكتب في طابور وتُطلق إشعارات.
 *
 * اتفاقية «إعادة التوجيه بعد العملية» سارية: النجاح والفشل كلاهما redirect برمز.
 */

const PATH = "/admin/dispatch";
const url = (qs: string) => `${PATH}?${qs}`;

/** حدود عاقلة للإعدادات — ما خرج عنها خطأ كتابة لا نية */
const MAX_WINDOW_MINUTES = 1440;
const MAX_ROUNDS = 5;
const MAX_MARGIN_FLOOR = 1_000_000;

/** الأرقام العربية الهندية مقبولة في الحقول الرقمية وتُحوَّل قبل التحقق */
const toLatinDigits = (s: string) =>
  s.replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 0x0660));

function num(formData: FormData, name: string): number | null {
  const v = formData.get(name);
  if (typeof v !== "string" || v.trim() === "") return null;
  const n = Number(toLatinDigits(v.trim()));
  return Number.isFinite(n) ? n : null;
}

/**
 * حفظ إعدادات البث: مهلة الموجة، عدد الموجات، البدء التلقائي، أرضية الهامش.
 *
 * التحقق شكلي بحت (أرقام صحيحة في مدى عاقل) — أثرها الحقيقي داخل دوال البث.
 * وقبل الكتابة نتأكد أن أعمدة العقد موجودة فعلاً في الصف المقروء: عمود باسم
 * مختلف كان سيُنتج تحديثاً ينجح ظاهرياً ولا يغيّر شيئاً، وهذا أسوأ من خطأ صريح.
 */
export async function saveDispatchSettings(formData: FormData) {
  const supabase = await createServerSupabase();
  if (!supabase) redirect(url("error=env"));

  const windowMinutes = num(formData, "window_minutes");
  if (
    windowMinutes === null ||
    !Number.isInteger(windowMinutes) ||
    windowMinutes < 1 ||
    windowMinutes > MAX_WINDOW_MINUTES
  ) {
    redirect(url("error=window"));
  }

  const maxRounds = num(formData, "max_rounds");
  if (maxRounds === null || !Number.isInteger(maxRounds) || maxRounds < 1 || maxRounds > MAX_ROUNDS) {
    redirect(url("error=rounds"));
  }

  const minMargin = num(formData, "min_margin_amount") ?? 0;
  if (minMargin < 0 || minMargin > MAX_MARGIN_FLOOR) redirect(url("error=floor"));

  const patch: Record<string, unknown> = {
    [SETTINGS_COLUMNS.windowMinutes]: windowMinutes,
    [SETTINGS_COLUMNS.maxRounds]: maxRounds,
    [SETTINGS_COLUMNS.autoStart]: formData.get("auto_start") != null,
    [SETTINGS_COLUMNS.minMarginAmount]: minMargin,
  };

  const existing = await supabase.from("dispatch_settings").select("*").limit(1);
  if (existing.error) {
    // جدول غائب = هجرة المرحلة ٦ لم تُنفَّذ؛ وأي فشل آخر رفضُ قراءةٍ من RLS
    redirect(url(isMissingTable(existing.error.code) ? "error=notready" : "error=save"));
  }

  const current = (existing.data?.[0] ?? null) as Record<string, unknown> | null;

  if (current) {
    // أسماء أعمدة الهجرة يجب أن تطابق العقد — وإلا فالتحديث صامت بلا أثر
    if (Object.keys(patch).some((column) => !(column in current))) redirect(url("error=schema"));

    // الصف الوحيد: نقيّده بعمود id إن وُجد، وإلا بمرشّح يطابقه دائماً — لا تحديث
    // بلا مرشّح أبداً
    const query = supabase.from("dispatch_settings").update(patch);
    const res = await (current.id === undefined
      ? query.not(SETTINGS_COLUMNS.windowMinutes, "is", null)
      : query.eq("id", current.id as string)
    ).select();
    // صفر صفوف مع نجاح ظاهري = RLS رفضت الكتابة (المستخدم ليس admin)
    if (res.error || !res.data || res.data.length === 0) redirect(url("error=save"));
  } else {
    const res = await supabase.from("dispatch_settings").insert(patch).select();
    if (res.error || !res.data || res.data.length === 0) redirect(url("error=save"));
  }

  revalidatePath("/", "layout");
  redirect(url("saved=1"));
}

/**
 * تشغيل دورة الإسناد فوراً — نفس الدورة التي تستدعيها المهمة المجدولة على
 * `/api/dispatch/tick`: تُنهي المهل المنتهية، وتفتح الموجة التالية لمن بقي له
 * موجات، وتُصعّد الباقي إلى الطابور اليدوي بإشعار.
 *
 * الحراسة: «وجود جلسة» لا يكفي لتشغيل عملية نظام تُرسل إشعارات وتكتب في جداول
 * البث — لذلك تحقق صريح من الدور أولاً (نفس دالة `is_admin()` التي تحرس سياسات
 * RLS)، ثم التنفيذ بعميل الخدمة إن وُجد لأن الدالة قد تكون ممنوحة له وحده كما
 * هي حال المهام المجدولة.
 */
export async function runDispatchTick() {
  const session = await createServerSupabase();
  if (!session) redirect(url("error=env"));

  const { data: isAdmin, error: roleError } = await session.rpc("is_admin");
  if (roleError || isAdmin !== true) redirect(url("error=forbidden"));

  // العامل لا يرمي استثناءً أبداً — يرجع ملخّصاً حتى حين لا تُنفَّذ الدورة أصلاً
  const summary = await runTickWorker();

  const params = new URLSearchParams({
    ran: "1",
    processed: String(summary.processed),
    rounds: String(summary.newRounds),
    offers: String(summary.newOffers),
    expired: String(summary.expiredOffers),
    escalated: String(summary.escalated),
  });
  if (summary.reason) params.set("reason", summary.reason);

  revalidatePath("/", "layout");
  redirect(url(params.toString()));
}
