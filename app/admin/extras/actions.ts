"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { createServerSupabase } from "@/lib/supabase/server";

/**
 * إجراءات كتالوج الخدمات الإضافية — جدول `extra_services` (هجرة `0031`).
 *
 * قواعد ثابتة (نفس ما تفرضه `app/admin/fleet/actions.ts` و`payment-accounts`):
 * - **لا حساب مالي هنا إطلاقاً**: هذه الشاشة تكتب سعر الوحدة وحده، والضربُ في
 *   الكمية والجمع إلى الإجمالي كلاهما داخل `price_extras` و`create_booking` في
 *   Postgres (قرار معماري ٤ · D-09: لا سعر من المتصفح).
 * - اتفاقية «إعادة التوجيه بعد العملية» (اعتبار ٨): النجاح والفشل كلاهما
 *   `redirect` برمز في الـ query string تترجمه الصفحة إلى رسالة عربية، **ورمزٌ
 *   مستقل لكل سبب** فلا تُخفي رسالةٌ عامة أي الحقول أخطأ.
 * - فخ RLS المعروف: insert/update/delete تنجح ظاهرياً بصفر صفوف عند رفض
 *   السياسة — لذلك `.select()` بعد كل كتابة وفحص طول النتيجة.
 * - `revalidatePath("/", "layout")` لأن الكتالوج يظهر في نموذج الحجز العام
 *   (‏`public_extras()`).
 *
 * 🔒 **الحذف مقابل الإطفاء:** `booking_extras.extra_id` معرَّف
 * `on delete restrict` — فالقاعدة **ترفض** حذف خدمة دخلت حجزاً واحداً، حمايةً
 * لتفسير سعر قديم (نفس مبرر لقطة D-10). نحن لا نستبق القاعدة بعدٍّ مسبق: نُنفّذ
 * الحذف ونلتقط `23503` ونقول للمالك إن الإطفاء هو ما يريده فعلاً. مصدرُ قرارٍ
 * واحد لا اثنان ينحرفان.
 */

const url = (qs: string) => `/admin/extras?${qs}`;

/** معرّف لاتيني صغير بشرطات — يرسله نموذج الحجز إلى `price_extras` فلا يُترك حراً */
const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

/** حدود القاعدة نفسها مكتوبةً هنا — كي يقرأ المالك رسالة مفهومة لا خطأ قيد خام */
const MIN_SLUG_LENGTH = 2;
const MAX_SLUG_LENGTH = 40;
/** `check (max_qty between 1 and 20)` في الهجرة */
const MIN_QTY = 1;
const MAX_QTY = 20;
const MAX_SORT = 999;
/** سقف مطبعي لا قاعدة تسعير: خدمةٌ بمليون جنيه خطأ لوحة مفاتيح لا قراراً */
const MAX_PRICE = 1_000_000;
const MAX_DESCRIPTION = 300;

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

/**
 * ترجمة خطأ الكتابة إلى رمز تعرضه الشاشة:
 * - `42P01` / `PGRST205` = الجدول غير موجود ⇒ هجرة `0031` لم تُنفَّذ بعد.
 * - `23505` = تكرار `slug`.
 * - `23503` = `on delete restrict` ⇒ الخدمة داخل حجز فلا تُحذف.
 * - `23514` = خرق قيد في القاعدة (سعر سالب أو كمية خارج المدى) — لا يقع إن مرّ
 *   التحقق أعلاه، فوجوده يعني انحراف الواجهة عن القيد لا خطأ المالك.
 */
const isMissingTable = (code: string | undefined) => code === "42P01" || code === "PGRST205";

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

type ExtraFields = {
  title: string;
  description: string | null;
  price: number;
  max_qty: number;
  active: boolean;
  sort: number;
};

/**
 * قراءة حقول الخدمة والتحقق منها — تعيد رمز خطأ نصياً بدل الرمي، فيتولى المُنادي
 * إعادة التوجيه به. حدودها هي حدود القيود في الهجرة حرفياً.
 */
function readExtra(formData: FormData, prefix = ""): ExtraFields | string {
  const p = (name: string) => `${prefix}${name}`;

  const title = text(formData, p("title"));
  if (!title) return "title";

  const description = text(formData, p("description"));
  if (description !== null && description.length > MAX_DESCRIPTION) return "desc";

  const price = num(formData, p("price"));
  if (price === null || price < 0 || price > MAX_PRICE) return "price";

  const maxQty = num(formData, p("max_qty"));
  if (maxQty === null || !Number.isInteger(maxQty) || maxQty < MIN_QTY || maxQty > MAX_QTY)
    return "qty";

  const sort = num(formData, p("sort")) ?? 0;
  if (!Number.isInteger(sort) || sort < 0 || sort > MAX_SORT) return "sort";

  return {
    title,
    description,
    price,
    max_qty: maxQty,
    active: checked(formData, p("active")),
    sort,
  };
}

/**
 * حفظ خدمة قائمة — **بلا `slug`**: المعرّف ثابت بعد الإنشاء لأن نموذج الحجز
 * يرسله، وتغييره يقطع كل رابط محفوظ ويجعل اختيار العميل يسقط صامتاً.
 */
export async function saveExtra(extraId: string, formData: FormData) {
  const supabase = await createServerSupabase();
  if (!supabase) redirect(url("error=env"));

  const fields = readExtra(formData);
  if (typeof fields === "string") redirect(url(`error=${fields}`));

  const { data, error } = await supabase
    .from("extra_services")
    .update(fields)
    .eq("id", extraId)
    .select("id");

  if (error || !data || data.length === 0) redirect(url(`error=${writeErrorCode(error?.code)}`));

  revalidatePath("/", "layout");
  redirect(url("saved=1"));
}

/**
 * إضافة خدمة جديدة.
 *
 * تُنشأ **نشطة** بحسب مفتاح النموذج (افتراضيه مفعّل) — بخلاف فئة السيارة التي
 * تُنشأ متوقفة: الفئة تُنشأ بتعريفة صفرية فبياناتها ناقصة حتى يضبطها، أما الخدمة
 * فسعرها وكميتها القصوى إلزاميان في النموذج نفسه، فلا شيء ناقص بعد الإضافة.
 * ومن أراد تجهيزها قبل عرضها فليُلغِ المفتاح صراحةً.
 */
export async function createExtra(formData: FormData) {
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

  const fields = readExtra(formData, "new.");
  if (typeof fields === "string") redirect(url(`error=${fields}`));

  // ترتيب العرض: بعد آخر خدمة موجودة — كي لا تتصدّر الجديدةُ القائمةَ بلا سبب
  const last = await supabase
    .from("extra_services")
    .select("sort")
    .order("sort", { ascending: false })
    .limit(1);
  if (last.error && isMissingTable(last.error.code)) redirect(url("error=notready"));
  const nextSort = ((last.data?.[0]?.sort as number | undefined) ?? -1) + 1;

  const { data, error } = await supabase
    .from("extra_services")
    .insert({ ...fields, slug, sort: nextSort })
    .select("id");

  if (error || !data || data.length === 0) redirect(url(`error=${writeErrorCode(error?.code)}`));

  revalidatePath("/", "layout");
  redirect(url("saved=1"));
}

/** تفعيل/إيقاف خدمة بضغطة واحدة من ترويسة بطاقتها */
export async function toggleExtraActive(extraId: string) {
  const supabase = await createServerSupabase();
  if (!supabase) redirect(url("error=env"));

  const current = await supabase
    .from("extra_services")
    .select("active")
    .eq("id", extraId)
    .maybeSingle();
  if (current.error) redirect(url(`error=${writeErrorCode(current.error.code)}`));
  if (!current.data) redirect(url("error=missing"));

  const { data, error } = await supabase
    .from("extra_services")
    .update({ active: current.data.active !== true })
    .eq("id", extraId)
    .select("id");
  if (error || !data || data.length === 0) redirect(url(`error=${writeErrorCode(error?.code)}`));

  revalidatePath("/", "layout");
  redirect(url("saved=1"));
}

/**
 * حذف خدمة — بعد خطوة تأكيد في الواجهة.
 *
 * القاعدة هي الحارس لا هذه الدالة: `booking_extras.extra_id … on delete restrict`
 * ترفض حذف خدمة دخلت حجزاً وترفع `23503`، فنترجمها إلى رسالة تقول للمالك إن
 * الإطفاء هو ما يريده. ولو عددنا الحجوزات هنا قبل الحذف لصار للقرار مصدران
 * ينحرفان (النمط ٨ في `handover/LESSONS.md`) — والقاعدة تعرف ما لا نعرفه.
 */
export async function deleteExtra(extraId: string) {
  const supabase = await createServerSupabase();
  if (!supabase) redirect(url("error=env"));

  const { data, error } = await supabase
    .from("extra_services")
    .delete()
    .eq("id", extraId)
    .select("id");

  // صفر صفوف مع نجاح ظاهري = RLS رفضت الحذف (المستخدم ليس admin)
  if (error || !data || data.length === 0) redirect(url(`error=${writeErrorCode(error?.code)}`));

  revalidatePath("/", "layout");
  redirect(url("saved=deleted"));
}
