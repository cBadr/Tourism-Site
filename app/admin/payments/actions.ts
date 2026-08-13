"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { credentialSpec, isPaymentProvider } from "@/lib/payments/registry";
import { createServerSupabase } from "@/lib/supabase/server";

/**
 * إجراءات شاشة بوابات الدفع — إدارة جدول `payment_providers` وحده.
 *
 * ما يُكتب هنا **لا يشمل سرّاً واحداً**: الجدول يحمل التفعيل والترتيب والاسم
 * الظاهر ووضع الاختبار والمعرّفات العامة فقط (قرار العقد في
 * `lib/payments-types.ts`). المفاتيح السرّية تعيش في متغيرات بيئة الخادم ولا
 * تمر بقاعدة البيانات ولا بنموذج HTML ولا بهذا الملف.
 *
 * وليس هنا إدراج ولا حذف عمداً: قائمة المزوّدين مغلقة بقيد `check` في هجرة ٠٠٢٠
 * ومبذورة فيها، والقاعدة لا تمنح `insert` ولا `delete` لأي دور مستخدم. اللوحة
 * تعدّل الصفوف السبعة ولا تخترع ثامناً — فلا يظهر للعميل مزوّد بلا محوّل.
 *
 * الاتفاقيات الثابتة في اللوحة:
 * - فحص البيئة أولاً: بلا عميل Supabase لا كتابة، والخطأ يعود في الرابط.
 * - فخ الصفوف الصفرية: كل كتابة تُتبع بـ `.select()` وفحص طول النتيجة، فرفض
 *   RLS يظهر نجاحاً بصفر صفوف لا خطأً.
 * - `revalidatePath("/", "layout")` لأن قائمة البوابات المفعّلة تُقرأ في صفحة
 *   متابعة الحجز التي يراها العميل — تعطيل بوابة يجب أن يخفيها فوراً.
 * - إعادة التوجيه بعد العملية: النجاح والفشل كلاهما redirect برمز في الرابط.
 */

const url = (qs: string) => `/admin/payments?${qs}`;

/** حدود عاقلة تمنع الخطأ المطبعي الكارثي (ليست قواعد عمل) */
const MAX_SORT = 99;
const MAX_LABEL = 60;
const MAX_PUBLIC_VALUE = 200;

/** الأرقام العربية الهندية مقبولة في حقل الترتيب وتُحوَّل قبل التحقق */
const toLatinDigits = (s: string) =>
  s.replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 0x0660));

function text(formData: FormData, name: string): string | null {
  const value = formData.get(name);
  return typeof value === "string" && value.trim() !== "" ? value.trim() : null;
}

function num(formData: FormData, name: string): number | null {
  const value = formData.get(name);
  if (typeof value !== "string" || value.trim() === "") return null;
  const parsed = Number(toLatinDigits(value.trim()));
  return Number.isFinite(parsed) ? parsed : null;
}

const checked = (formData: FormData, name: string) => formData.get(name) != null;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

/**
 * «الجدول/العمود غير موجود» — قاعدة لم تُطبَّق عليها هجرة المرحلة ٩ (0020).
 * 42P01 = جدول غائب، 42703 = عمود غائب، PGRST20x = ذاكرة مخطط PostgREST.
 */
const isMissingSchema = (code: string | undefined) =>
  code === "42P01" || code === "42703" || code === "PGRST204" || code === "PGRST205";

/**
 * حفظ إعدادات مزوّد واحد — الاسم الظاهر والترتيب ووضع الاختبار والتفعيل
 * والمعرّفات العامة.
 *
 * حقول المعرّفات العامة **مولَّدة من مواصفة السجل** (`publicKeys`) لا من قائمة
 * مكتوبة هنا، فإضافة معرّف لمزوّد في السجل تُظهر حقله في الشاشة وتحفظه بلا لمس
 * هذا الملف. والدمج فوق القيمة الحالية مقصود: المحوّل قد يكتب مفاتيح لا تعرفها
 * الشاشة، فالكتابة الكاملة كانت ستمحوها بصمت.
 */
export async function saveProvider(provider: string, formData: FormData) {
  const supabase = await createServerSupabase();
  if (!supabase) redirect(url("error=env"));

  if (!isPaymentProvider(provider)) redirect(url("error=provider"));

  const label = text(formData, "label");
  if (!label) redirect(url("error=label"));
  if (label.length > MAX_LABEL) redirect(url("error=label"));

  const sort = num(formData, "sort") ?? 0;
  if (!Number.isInteger(sort) || sort < 0 || sort > MAX_SORT) redirect(url("error=sort"));

  const publicKeys = credentialSpec(provider).publicKeys;
  let publicConfig: Record<string, unknown> | null = null;

  if (publicKeys.length > 0) {
    const current = await supabase
      .from("payment_providers")
      .select("public_config")
      .eq("provider", provider)
      .maybeSingle();

    if (current.error && isMissingSchema(current.error.code)) redirect(url("error=notready"));

    const existing = isRecord(current.data?.public_config) ? current.data.public_config : {};
    const merged: Record<string, unknown> = { ...existing };
    for (const key of publicKeys) {
      const value = text(formData, `public.${key}`);
      // الحقل الفارغ يعني «امسح هذا المعرّف» لا «أبقِ القديم» — وإلا استحال المسح
      if (value === null) delete merged[key];
      else merged[key] = value.slice(0, MAX_PUBLIC_VALUE);
    }
    publicConfig = merged;
  }

  const values: Record<string, unknown> = {
    label,
    sort,
    sandbox: checked(formData, "sandbox"),
    enabled: checked(formData, "enabled"),
  };
  if (publicConfig !== null) values.public_config = publicConfig;

  const { data, error } = await supabase
    .from("payment_providers")
    .update(values)
    .eq("provider", provider)
    .select("provider");

  if (error && isMissingSchema(error.code)) redirect(url("error=notready"));
  // صفر صفوف مع نجاح ظاهري = RLS رفضت الكتابة (المستخدم ليس admin)
  if (error || !data || data.length === 0) redirect(url("error=save"));

  revalidatePath("/", "layout");
  redirect(url("saved=1"));
}

/**
 * تبديل مفتاح منطقي واحد على مزوّد — قراءة الحالة الراهنة ثم عكسها.
 *
 * لماذا قراءة قبل الكتابة؟ لأن القيمة المعروضة قد تكون قديمة (تبويب مفتوح منذ
 * ساعة)، والعكس المبني على ما في الصفحة كان سيكتب ما يظنه المستخدم لا ما هو
 * قائم فعلاً. صفر صفوف في القراءة يعني صفاً اختفى أو RLS رفضت — والحالتان
 * «لا تكتب».
 */
async function flip(
  provider: string,
  column: "enabled" | "sandbox",
  savedKey: string
): Promise<never> {
  const supabase = await createServerSupabase();
  if (!supabase) redirect(url("error=env"));

  if (!isPaymentProvider(provider)) redirect(url("error=provider"));

  const current = await supabase
    .from("payment_providers")
    .select(column)
    .eq("provider", provider)
    .maybeSingle();

  if (current.error && isMissingSchema(current.error.code)) redirect(url("error=notready"));
  if (current.error || !current.data) redirect(url("error=missing"));

  const row = current.data as Record<string, unknown>;
  const { data, error } = await supabase
    .from("payment_providers")
    .update({ [column]: row[column] !== true })
    .eq("provider", provider)
    .select("provider");

  if (error || !data || data.length === 0) redirect(url("error=save"));

  revalidatePath("/", "layout");
  redirect(url(`saved=${savedKey}`));
}

/** تفعيل/تعطيل مزوّد بضغطة واحدة — المعطَّل يختفي من صفحة الدفع فوراً */
export async function toggleProvider(provider: string) {
  await flip(provider, "enabled", "enabled");
}

/** تبديل وضع الاختبار (sandbox) لمزوّد واحد */
export async function toggleSandbox(provider: string) {
  await flip(provider, "sandbox", "sandbox");
}
