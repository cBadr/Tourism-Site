"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import type { TreasuryAccountKind } from "@/lib/finance-types";
import { createServerSupabase } from "@/lib/supabase/server";

/**
 * إجراءات شاشة حسابات الدفع والخزينة — إدارة `payment_accounts` (محافظ وانستا باي
 * وبطاقات، إضافةً إلى النقدية والبنك الداخليَّين في المرحلة ٧) ومفتاح `payment` في
 * `site_settings` (نسبة العربون وحده الأدنى وتعليمات التحويل).
 *
 * قواعد ثابتة:
 * - الحدود اليومية والشهرية **تُفرض في SQL** داخل `available_payment_accounts`؛ هنا
 *   تحقق من المدخلات وكتابة فقط، ولا يُقرَّر في TypeScript أي حساب يُعرض على العميل.
 * - `customer_facing` مُدخَل لا قرار: الدالة نفسها هي التي ترشِّح به، وهذه الشاشة
 *   تكتب قيمته فقط.
 * - العربون كذلك **يُحسب في SQL** داخل `create_booking` من نفس المفتاح المكتوب هنا؛
 *   هذه الشاشة تضبط القيم فقط ولا تحسب مبلغاً واحداً.
 * - اتفاقية «إعادة التوجيه بعد العملية»: النجاح والفشل كلاهما redirect برمز في الرابط.
 * - فخ RLS المعروف: insert/update/delete/upsert تنجح ظاهرياً بصفر صفوف عند رفض
 *   السياسة — لذلك `.select()` بعد كل كتابة وفحص طول النتيجة.
 * - `revalidatePath("/", "layout")` لأن هذه الحسابات تظهر للعميل في صفحة التحويل.
 */

const url = (qs: string) => `/admin/payment-accounts?${qs}`;

/** أنواع الخزينة كما في عقد `lib/finance-types.ts` — المصدر الأوحد */
const KINDS: TreasuryAccountKind[] = ["wallet", "instapay", "card", "cash", "bank"];

/**
 * «العمود غير موجود» — قاعدة لم تُطبَّق عليها هجرة المرحلة ٧ بعد.
 * Postgres يرفع 42703، وPostgREST يردّ PGRST204 من ذاكرة المخطط عند الكتابة.
 * الحالتان تعنيان الشيء نفسه: أعد الكتابة بأعمدة ما قبل المرحلة ٧.
 */
const isMissingColumn = (code: string | undefined) =>
  code === "42703" || code === "PGRST204";

/** 23514 = check_violation — قيد `kind` لم يتوسّع بعد ليقبل النقدية والبنك */
const isKindRejected = (code: string | undefined) => code === "23514";

/** نسخة الحقول بلا ما تضيفه هجرة المرحلة ٧ — للمحاولة الثانية وحدها */
function withoutTreasuryFields(fields: AccountFields): Record<string, unknown> {
  const legacy: Record<string, unknown> = { ...fields };
  delete legacy.customer_facing;
  return legacy;
}

/** حدود عاقلة تمنع الأخطاء المطبعية الكارثية (ليست قواعد مالية) */
const MAX_SORT = 999;
const MAX_AMOUNT = 100_000_000;

/** الأرقام العربية الهندية تُقبل في الحقول الرقمية وتُحوَّل قبل التحقق */
const toLatinDigits = (s: string) =>
  s.replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 0x0660));

function text(formData: FormData, name: string): string | null {
  const v = formData.get(name);
  return typeof v === "string" && v.trim() !== "" ? v.trim() : null;
}

/** رقم منتهٍ أو null (الفارغ وغير الرقمي كلاهما null) */
function num(formData: FormData, name: string): number | null {
  const v = formData.get(name);
  if (typeof v !== "string" || v.trim() === "") return null;
  const n = Number(toLatinDigits(v.trim()));
  return Number.isFinite(n) ? n : null;
}

const checked = (formData: FormData, name: string) => formData.get(name) != null;

type AccountFields = {
  kind: TreasuryAccountKind;
  label: string;
  handle: string;
  holder_name: string | null;
  opening_balance: number;
  daily_cap: number | null;
  monthly_cap: number | null;
  active: boolean;
  sort: number;
  /** يُعرض في صفحة التحويل — ترشيح `available_payment_accounts` يعتمد عليه */
  customer_facing: boolean;
};

/**
 * قراءة حقول الحساب والتحقق منها — يعيد رمز خطأ نصياً بدل الرمي،
 * فيتولى المُنادي إعادة التوجيه بالرمز المناسب.
 */
function readAccount(formData: FormData, prefix = ""): AccountFields | string {
  const p = (name: string) => `${prefix}${name}`;

  const kind = text(formData, p("kind"));
  if (!kind || !(KINDS as string[]).includes(kind)) return "kind";

  const label = text(formData, p("label"));
  if (!label) return "label";

  const handle = text(formData, p("handle"));
  if (!handle) return "handle";

  const opening = num(formData, p("opening_balance")) ?? 0;
  if (opening < 0 || opening > MAX_AMOUNT) return "amount";

  // الحد الفارغ يعني «بلا حد» — null صراحةً وليس صفراً (الصفر يعني حساباً مشبعاً دائماً)
  const daily = num(formData, p("daily_cap"));
  const monthly = num(formData, p("monthly_cap"));
  for (const cap of [daily, monthly]) {
    if (cap !== null && (cap < 0 || cap > MAX_AMOUNT)) return "amount";
  }

  const sort = num(formData, p("sort")) ?? 0;
  if (!Number.isInteger(sort) || sort < 0 || sort > MAX_SORT) return "sort";

  /**
   * الأنواع الداخلية لا تُعرض على عميل مهما كان المفتاح — الشاشة تعطّل خانة
   * الاختيار على الحساب الداخلي، والخانة المعطّلة لا تُرسَل أصلاً. هذا السطر
   * يحسم الحالة على الخادم أيضاً فلا يفتحها نموذج مُلفَّق يدوياً.
   */
  const internalKind = kind === "cash" || kind === "bank";

  return {
    kind: kind as TreasuryAccountKind,
    label,
    handle,
    holder_name: text(formData, p("holder_name")),
    opening_balance: opening,
    daily_cap: daily,
    monthly_cap: monthly,
    active: checked(formData, p("active")),
    sort,
    customer_facing: internalKind ? false : checked(formData, p("customer_facing")),
  };
}

/**
 * ترجمة خطأ الكتابة إلى رمز تعرضه الشاشة برسالة عربية مفهومة.
 * 23505 = unique_violation على (kind, handle) — الفهرس الفريد في هجرة المرحلة ٤.
 * 23514 = قيد `kind` لم يتوسّع بعد — رسالة تقول ما ينقص بالضبط لا «فشلت العملية».
 * وما عدا ذلك (ومنه صفر صفوف مع نجاح ظاهري) = RLS رفضت الكتابة أو خطأ غير متوقع.
 */
const writeErrorCode = (code: string | undefined): string =>
  code === "23505" ? "exists" : isKindRejected(code) ? "kindnew" : "save";

/** حفظ حساب قائم */
export async function saveAccount(accountId: string, formData: FormData) {
  const supabase = await createServerSupabase();
  if (!supabase) redirect(url("error=env"));

  const fields = readAccount(formData);
  if (typeof fields === "string") redirect(url(`error=${fields}`));

  const write = (values: Record<string, unknown>) =>
    supabase.from("payment_accounts").update(values).eq("id", accountId).select("id");

  let { data, error } = await write(fields);
  // قاعدة قبل هجرة المرحلة ٧: أعد الكتابة بلا الحقول التي تضيفها، فتُحفظ بقية
  // البيانات بدل أن يفشل الحفظ كله على عمود غائب
  if (error && isMissingColumn(error.code)) {
    ({ data, error } = await write(withoutTreasuryFields(fields)));
  }

  if (error || !data || data.length === 0) {
    redirect(url(`error=${writeErrorCode(error?.code)}`));
  }

  revalidatePath("/", "layout");
  redirect(url("saved=1"));
}

/** إضافة حساب جديد — يُنشأ نشطاً أو متوقفاً بحسب المفتاح في النموذج */
export async function createAccount(formData: FormData) {
  const supabase = await createServerSupabase();
  if (!supabase) redirect(url("error=env"));

  const fields = readAccount(formData, "new.");
  if (typeof fields === "string") redirect(url(`error=${fields}`));

  const write = (values: Record<string, unknown>) =>
    supabase.from("payment_accounts").insert(values).select("id");

  let { data, error } = await write(fields);
  if (error && isMissingColumn(error.code)) {
    ({ data, error } = await write(withoutTreasuryFields(fields)));
  }

  if (error || !data || data.length === 0) {
    redirect(url(`error=${writeErrorCode(error?.code)}`));
  }

  revalidatePath("/", "layout");
  redirect(url("saved=1"));
}

/** تفعيل/إيقاف حساب بضغطة واحدة من ترويسة بطاقته */
export async function toggleAccountActive(accountId: string) {
  const supabase = await createServerSupabase();
  if (!supabase) redirect(url("error=env"));

  const current = await supabase
    .from("payment_accounts")
    .select("active")
    .eq("id", accountId)
    .maybeSingle();
  if (current.error || !current.data) redirect(url("error=missing"));

  const { data, error } = await supabase
    .from("payment_accounts")
    .update({ active: current.data.active !== true })
    .eq("id", accountId)
    .select("id");
  if (error || !data || data.length === 0) redirect(url("error=save"));

  revalidatePath("/", "layout");
  redirect(url("saved=1"));
}

/**
 * حذف حساب — بعد خطوة تأكيد في الواجهة.
 *
 * لماذا فحص مسبق بدل الاعتماد على المفتاح الأجنبي؟ لأن `payments.account_id`
 * معرَّف `on delete set null` في هجرة المرحلة ٤: القاعدة **لا** ترفض الحذف، بل
 * تقطع صلة المدفوعات القديمة بحسابها بصمت فيُفقد أثرها المالي. فالرفض هنا قرار
 * التطبيق: أي حساب استُقبل عليه مدفوع واحد لا يُحذف، والإيقاف هو البديل.
 */
export async function deleteAccount(accountId: string) {
  const supabase = await createServerSupabase();
  if (!supabase) redirect(url("error=env"));

  // عدّ فقط (head) — لا تُنقل صفوف المدفوعات إلى الخادم لمجرد معرفة وجودها
  const used = await supabase
    .from("payments")
    .select("id", { count: "exact", head: true })
    .eq("account_id", accountId);

  // تعذّر التحقق = لا نحذف: الحذف لا رجعة فيه والشك يكفي لإيقافه
  if (used.error) redirect(url("error=save"));
  if ((used.count ?? 0) > 0) redirect(url("error=inuse"));

  const { data, error } = await supabase
    .from("payment_accounts")
    .delete()
    .eq("id", accountId)
    .select("id");

  // صفر صفوف مع نجاح ظاهري = RLS رفضت الحذف (المستخدم ليس admin)
  if (error || !data || data.length === 0) redirect(url("error=save"));

  revalidatePath("/", "layout");
  redirect(url("saved=1"));
}

// ---------------------------------------------------------------------------
// إعدادات الدفع — مفتاح `payment` في `site_settings`
// ---------------------------------------------------------------------------

/** أقصى طول لتعليمات التحويل — فقرة قصيرة يقرأها العميل، لا صفحة */
const MAX_INSTRUCTIONS = 1000;

/**
 * حفظ إعدادات الدفع — النسبة والحد الأدنى للعربون وتعليمات التحويل.
 *
 * هذه القيم يقرأها Postgres داخل `create_booking` لتحديد «المطلوب تحويله»، وتقرأها
 * صفحة الحجز لعرض التعليمات. القاعدة نفسها تحمي من القيم الشاذة (تحصر العربون بين
 * صفر والإجمالي)، والحصر هنا طبقة ثانية تمنع الخطأ المطبعي قبل أن يصل أصلاً.
 */
export async function savePaymentSettings(formData: FormData) {
  const supabase = await createServerSupabase();
  if (!supabase) redirect(url("error=env"));

  const rawPercent = num(formData, "payment.depositPercent");
  const rawMin = num(formData, "payment.depositMinAmount");
  if (rawPercent === null || rawMin === null) redirect(url("error=amount"));
  if (rawMin > MAX_AMOUNT) redirect(url("error=amount"));

  // حصر لا رفض: النسبة نسبة مئوية بطبيعتها، والحد الأدنى مبلغ غير سالب
  const depositPercent = Math.min(100, Math.max(0, rawPercent));
  const depositMinAmount = Math.max(0, rawMin);
  // نص فارغ = «استخدم النص الافتراضي» — القارئ في واجهة الحجز يسقط عليه بالفعل
  const transferInstructions = (text(formData, "payment.transferInstructions") ?? "").slice(
    0,
    MAX_INSTRUCTIONS
  );

  const row = {
    key: "payment",
    value: { depositPercent, depositMinAmount, transferInstructions },
  };

  const { data, error } = await supabase
    .from("site_settings")
    .upsert([row], { onConflict: "key" })
    .select("key");

  // صفر صفوف مع نجاح ظاهري = RLS رفضت الكتابة (المستخدم ليس admin)
  if (error || !data || data.length === 0) redirect(url("error=save"));

  revalidatePath("/", "layout");
  redirect(url("saved=payment"));
}
