"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { createServerSupabase } from "@/lib/supabase/server";

/**
 * إجراءات كتالوج أسباب فشل الرحلة — جدول `failure_reasons` (هجرة `0051`).
 *
 * **لماذا كتالوجٌ يُحرَّر أصلاً ولا ثابتٌ في الكود؟** قرار بدر 2026-08-15 نصّاً:
 * «يمكنك إنشاء مجموعة أسباب **مع إمكانية إدارتها**». والمكسب ثلاثة: الاتساق (نفس
 * الحالة تُعامَل المعاملة نفسها لا بمزاج اليوم)، والقياس («كم رحلة فشلت بذنب هذا
 * المتعهد؟» سؤالٌ له جواب — وهو أساس تقييم المتعهدين لاحقاً)، والسجل (سطر تدقيقٍ
 * بسببٍ مصنَّف لا بجملة حرّة).
 *
 * وهذا الملف يتبع `app/admin/extras/actions.ts` حرفاً بحرف — نفس الاتفاقيات:
 * - **لا حساب ولا قرار مالي هنا**: هذه الشاشة تكتب *اقتراحاً* لإجراءٍ مالي،
 *   ومن ينفّذه `mark_booking_failed` في Postgres وحدها (‏D-05).
 * - «إعادة التوجيه بعد العملية»: النجاح والفشل كلاهما `redirect` برمز في الـ
 *   query string تترجمه الصفحة إلى رسالة عربية، **ورمزٌ مستقل لكل سبب**.
 * - فخ RLS المعروف: الكتابة تنجح ظاهرياً بصفر صفوف عند رفض السياسة — لذلك
 *   `.select()` بعد كل كتابة وفحص طول النتيجة.
 *
 * 🔒 **الحذف مقابل التعطيل:** `booking_failures.reason_id` معرَّف
 * `on delete restrict` — فالقاعدة **ترفض** حذف سببٍ وقعت عليه رحلةٌ واحدة، حمايةً
 * لتقارير الماضي. والشاشة تقول ذلك قبل الضغط (عدّاد الاستعمال في البطاقة)،
 * **والقاعدة تبقى الحَكَم**: ننفّذ الحذف ونلتقط `23503` ونقول للمالك إن التعطيل
 * هو ما يريده. عدٌّ مسبق يحجب الزر وحده كان سيصير مصدرَ قرارٍ ثانياً ينحرف.
 *
 * ⚠ **ولا تُمسّ التسمية في الصفوف القديمة أبداً:** `booking_failures` تلقط
 * `reason_label` و`default_action` لحظة الفشل، فإعادة التسمية هنا آمنة تماماً
 * ولا تُعيد كتابة تقارير العام الماضي — وهي بالضبط علّة اللقطة في الهجرة.
 */

const url = (qs: string) => `/admin/failure-reasons?${qs}`;

/** معرّف لاتيني صغير بشرطات — يسافر إلى `mark_booking_failed` فلا يُترك حراً */
const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

/** حدود القيود في الهجرة حرفياً — كي يقرأ المالك رسالة مفهومة لا خطأ قيد خام */
const MIN_SLUG_LENGTH = 2;
/** `check (length(slug) between 2 and 64)` */
const MAX_SLUG_LENGTH = 64;
const MIN_LABEL_LENGTH = 2;
/** `check (length(btrim(label)) between 2 and 160)` */
const MAX_LABEL_LENGTH = 160;
const MAX_SORT = 999;

/** `check (default_action = any (array['none','pay','deduct']))` */
const ACTIONS = ["none", "pay", "deduct"];

/** `failure_reasons_scope_chk` — قائمةٌ واحدة بنطاق لا قائمتان (قرار المالك) */
const SCOPES = ["failure", "apology", "both"];

/** `failure_reasons_initiator_chk` — ومن بادر */
const INITIATORS = ["platform", "partner", "any"];

/** سقفٌ عاقل للمبلغ المقترح — والقيد في القاعدة `< 1e9` */
const MAX_DEDUCT = 1_000_000;

/** الأرقام العربية الهندية تُقبل في الحقول الرقمية وتُحوَّل قبل التحقق */
const toLatinDigits = (s: string) =>
  s.replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 0x0660));

/** نص مُشذّب أو null */
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

const isMissingTable = (code: string | undefined) => code === "42P01" || code === "PGRST205";

/**
 * ترجمة خطأ الكتابة إلى رمز تعرضه الشاشة:
 * - `42P01`/`PGRST205` = الجدول غير موجود ⇒ هجرة `0051` لم تُنفَّذ بعد.
 * - `23505` = تكرار `slug`.
 * - `23503` = `on delete restrict` ⇒ السبب دخل رحلةً فاشلة فلا يُحذف.
 * - `23514` = خرق قيدٍ في القاعدة — لا يقع إن مرّ التحقق أعلاه، فوجوده يعني
 *   انحراف الواجهة عن القيد لا خطأ المالك.
 */
const writeErrorCode = (code: string | undefined): string =>
  isMissingTable(code)
    ? "notready"
    : code === "23505"
      ? "exists"
      : code === "23503"
        ? "inuse"
        : code === "23514"
          ? "limits"
          : "save";

type ReasonFields = {
  label: string;
  default_action: string;
  active: boolean;
  sort: number;
  applies_to: string;
  initiator: string;
  default_deduct_amount: number | null;
};

/**
 * قراءة حقول السبب والتحقق منها — تعيد رمز خطأ نصياً بدل الرمي، فيتولى المُنادي
 * إعادة التوجيه به. حدودها هي حدود القيود في الهجرة حرفياً.
 */
function readReason(formData: FormData, prefix = ""): ReasonFields | string {
  const p = (name: string) => `${prefix}${name}`;

  const label = text(formData, p("label"));
  if (!label || label.length < MIN_LABEL_LENGTH || label.length > MAX_LABEL_LENGTH)
    return "label";

  const action = text(formData, p("default_action"));
  if (!action || !ACTIONS.includes(action)) return "action";

  const sort = num(formData, p("sort")) ?? 0;
  if (!Number.isInteger(sort) || sort < 0 || sort > MAX_SORT) return "sort";

  const scope = text(formData, p("applies_to")) ?? "failure";
  if (!SCOPES.includes(scope)) return "scope";

  const initiator = text(formData, p("initiator")) ?? "any";
  if (!INITIATORS.includes(initiator)) return "initiator";

  // 🔒 «ادفع كاملاً» لمن بادر بالانسحاب تناقضٌ لا خيار — والقاعدة تمنعه بقيد
  //    جدول (`failure_reasons_pay_initiator_chk`). والفحص هنا **ليس حارساً
  //    ثانياً** بل ترجمةٌ مبكرة: بدونه يصل المالك رمزَ خرقِ قيدٍ عاماً لا جملةً
  //    تقول أي حقلين تناقضا.
  if (action === "pay" && initiator === "partner") return "payinitiator";

  // المبلغ حكرٌ على الخصم — وفارغه `null` لا صفر: الصفر رقمٌ يُقرأ اقتراحاً
  const rawAmount = num(formData, p("default_deduct_amount"));
  if (action !== "deduct") {
    if (rawAmount !== null && rawAmount !== 0) return "deductunused";
  } else if (rawAmount !== null && (rawAmount <= 0 || rawAmount > MAX_DEDUCT)) {
    return "deductrange";
  }

  return {
    label,
    default_action: action,
    active: checked(formData, p("active")),
    sort,
    applies_to: scope,
    initiator,
    default_deduct_amount: action === "deduct" && rawAmount ? rawAmount : null,
  };
}

/* ------------------------------------------------------------------ */
/* مقابض الإغلاق — مهلةُ الاعتماد وعتبةُ الاعتذار ومفتاحُ الخصم (0119)   */
/* ------------------------------------------------------------------ */

/**
 * لماذا هذه المقابض **هنا** ولا في «إعدادات الرحلات»؟
 *
 * لأن قارئها واحد: من يضبط أسباب الاعتذار هو من يقرّر متى تُعتمد الرحلة تلقائياً
 * ومتى يذهب الاعتذارُ إلى الإسناد اليدوي. وثلاثة أرقامٍ في شاشةٍ أخرى تعني أن
 * يقرأ المالك نصفَ السياسة هنا ونصفَها هناك.
 *
 * 🔴 **ومفتاح الخصم مطفأٌ بقرار** (المالك لم يثبّت الأساس التعاقدي بعد): الاعتذار
 * يحسب المبلغ ويسجّله ولا يكتب قيداً واحداً، والمنفِّذ `apply_withdrawal_deduction`
 * يرفض ما دام المفتاح مطفأ. فالنص أدناه يقول ذلك، ولا يَعِد بما لا يقع.
 */
const MIN_APPROVE_HOURS = 1;
/** `trip_closure_approve_hours_chk` — أسبوعان سقفاً */
const MAX_APPROVE_HOURS = 336;
/** `trip_closure_manual_hours_chk` — والصفر يعني «ابثَّ دائماً» */
const MAX_MANUAL_HOURS = 168;

export async function saveClosureSettings(formData: FormData) {
  const supabase = await createServerSupabase();
  if (!supabase) redirect(url("error=env"));

  const approve = num(formData, "completion_approve_hours");
  if (approve === null || !Number.isInteger(approve)
      || approve < MIN_APPROVE_HOURS || approve > MAX_APPROVE_HOURS)
    redirect(url("error=approvehours"));

  const manual = num(formData, "apology_manual_hours");
  if (manual === null || !Number.isInteger(manual) || manual < 0 || manual > MAX_MANUAL_HOURS)
    redirect(url("error=manualhours"));

  const { data, error } = await supabase
    .from("trip_closure_settings")
    .update({
      completion_approve_hours: approve,
      apology_manual_hours: manual,
      apology_deduction_enabled: checked(formData, "apology_deduction_enabled"),
    })
    .eq("id", true)
    .select("id");

  if (error || !data || data.length === 0)
    redirect(url(`error=${isMissingTable(error?.code) ? "notready" : "save"}`));

  revalidatePath("/", "layout");
  redirect(url("saved=closure"));
}

/**
 * حفظ سببٍ قائم — **بلا `slug`**: المعرّف ثابت بعد الإنشاء لأنه المفتاح الذي
 * تسافر به الشاشة إلى `mark_booking_failed`، ولأن صفوف `booking_failures`
 * القديمة تحمل نسخته. تغييره يقطع الاثنين معاً.
 */
export async function saveReason(reasonId: string, formData: FormData) {
  const supabase = await createServerSupabase();
  if (!supabase) redirect(url("error=env"));

  const fields = readReason(formData);
  if (typeof fields === "string") redirect(url(`error=${fields}`));

  const { data, error } = await supabase
    .from("failure_reasons")
    .update(fields)
    .eq("id", reasonId)
    .select("id");

  if (error || !data || data.length === 0) redirect(url(`error=${writeErrorCode(error?.code)}`));

  revalidatePath("/", "layout");
  redirect(url("saved=1"));
}

/**
 * إضافة سبب جديد — يُنشأ **مفعَّلاً** بحسب مفتاح النموذج (افتراضيه مفعّل): لا
 * حقل ناقص فيه بعد الحفظ، فالتسمية والإجراء إلزاميان في النموذج نفسه.
 */
export async function createReason(formData: FormData) {
  const supabase = await createServerSupabase();
  if (!supabase) redirect(url("error=env"));

  const slug = text(formData, "new.slug")?.toLowerCase() ?? null;
  if (
    !slug ||
    !SLUG_PATTERN.test(slug) ||
    slug.length < MIN_SLUG_LENGTH ||
    slug.length > MAX_SLUG_LENGTH
  )
    redirect(url("error=slug"));

  const fields = readReason(formData, "new.");
  if (typeof fields === "string") redirect(url(`error=${fields}`));

  // ترتيب العرض: بعد آخر سبب موجود — كي لا يتصدّر الجديدُ القائمةَ بلا سبب.
  // والقفزة عشرة لا واحد: البذرة نفسها بفواصل عشرة، فتبقى للمالك فرجة يدسّ فيها
  // سبباً بين اثنين بلا إعادة ترقيم الكتالوج كله.
  const last = await supabase
    .from("failure_reasons")
    .select("sort")
    .order("sort", { ascending: false })
    .limit(1);
  if (last.error && isMissingTable(last.error.code)) redirect(url("error=notready"));
  const nextSort = ((last.data?.[0]?.sort as number | undefined) ?? 0) + 10;

  const { data, error } = await supabase
    .from("failure_reasons")
    .insert({ ...fields, slug, sort: nextSort })
    .select("id");

  if (error || !data || data.length === 0) redirect(url(`error=${writeErrorCode(error?.code)}`));

  revalidatePath("/", "layout");
  redirect(url("saved=1"));
}

/**
 * تفعيل/تعطيل سبب بضغطة واحدة من ترويسة بطاقته.
 *
 * والمعطَّل **ليس محذوفاً**: `mark_booking_failed` ترفض اختياره لرحلةٍ جديدة
 * (‏`reason-inactive`) ويبقى مرجعاً لكل رحلةٍ وقعت عليه من قبل.
 */
export async function toggleReasonActive(reasonId: string) {
  const supabase = await createServerSupabase();
  if (!supabase) redirect(url("error=env"));

  const current = await supabase
    .from("failure_reasons")
    .select("active")
    .eq("id", reasonId)
    .maybeSingle();
  if (current.error) redirect(url(`error=${writeErrorCode(current.error.code)}`));
  if (!current.data) redirect(url("error=missing"));

  const { data, error } = await supabase
    .from("failure_reasons")
    .update({ active: current.data.active !== true })
    .eq("id", reasonId)
    .select("id");
  if (error || !data || data.length === 0) redirect(url(`error=${writeErrorCode(error?.code)}`));

  revalidatePath("/", "layout");
  redirect(url("saved=1"));
}

/**
 * حذف سبب — بعد خطوة تأكيد في الواجهة.
 *
 * القاعدة هي الحارس لا هذه الدالة: المفتاح الأجنبي `on delete restrict` يرفع
 * `23503` على سببٍ دخل رحلةً فاشلة، فنترجمها إلى رسالة تقول للمالك إن التعطيل هو
 * ما يريده. والشاشة تعرض عدّاد الاستعمال قبل ذلك **لتفسّر لا لتقرّر**.
 */
export async function deleteReason(reasonId: string) {
  const supabase = await createServerSupabase();
  if (!supabase) redirect(url("error=env"));

  const { data, error } = await supabase
    .from("failure_reasons")
    .delete()
    .eq("id", reasonId)
    .select("id");

  // صفر صفوف مع نجاح ظاهري = RLS رفضت الحذف (المستخدم ليس admin)
  if (error || !data || data.length === 0) redirect(url(`error=${writeErrorCode(error?.code)}`));

  revalidatePath("/", "layout");
  redirect(url("saved=deleted"));
}
