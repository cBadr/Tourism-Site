"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { createServerSupabase } from "@/lib/supabase/server";

/**
 * إجراء محرر الميتاداتا الجماعي — يكتب عمود `meta` (JSONB) في `pages` لعدة صفوف.
 *
 * أربع خطوات اتفاقية `CONVENTIONS.md §٤` بلا تخطٍّ:
 *   (١) فحص البيئة أولاً.
 *   (٢) التحقق ← خروج فوري برمز واضح.
 *   (٣) الكتابة مع `.select()` وفحص صفر صفوف (فخ RLS: الرفض يظهر نجاحاً).
 *   (٤) `revalidatePath` ثم `redirect`.
 *
 * قرار أمني مقصود: **قائمة الصفحات تُقرأ من قاعدة البيانات لا من النموذج.**
 * العميل يرسل القيم فقط، والمعرّفات مصدرها الخادم — نفس حدّ الأمان في
 * `app/admin/content/[id]/actions.ts`. بلا ذلك يستطيع نموذج معدَّل أن يكتب على
 * صف لم يُعرض له أصلاً.
 *
 * 🔒 وحدّ ثانٍ فوقه: **الصف الذي لم يُعرَض في النموذج لا يُلمس إطلاقاً.** الشاشة
 * ترسل `rendered=<id>` لكل صف صيّرته، والحلقة أدناه تتقاطع معها. السبب عطبٌ
 * حقيقي كان قائماً: مع `?filter=missing` لا تُصيَّر إلا الصفحات الناقصة، فحقول
 * الصفحات المكتملة تغيب عن `FormData`، و`formData.get` تُرجع `null` للحقل
 * الغائب تماماً كما تُرجعه للحقل المُفرَّغ — فيُحسب ذلك «تغييراً» وتُكتب
 * `{title: null, description: null}` على كل صفحة مكتملة. أي أن ملء ثلاث صفحات
 * ناقصة كان يمحو ميتاداتا السبعة عشر الباقية، بلا رسالة، وبلا نسخة سابقة
 * لعمود `meta` يُرجَع إليها. التقاطع (لا المعرّفات وحدها) هو ما يمنع ذلك،
 * وحدّ الأمان باقٍ لأن المعرّفات ما زالت تُطابَق بصفوف القاعدة.
 *
 * ولا يُكتب إلا ما **تغيّر فعلاً**: حفظ عشرين صفحة بلا تعديل كان سيحرّك
 * `updated_at` لكلها ويطمس متى تغيّرت الميتاداتا حقاً.
 */

/** سقف صلب — ليس التوصية (٦٠/١٦٠) بل حاجز أمام لصق صفحة كاملة في حقل */
const HARD_MAX_TITLE = 300;
const HARD_MAX_DESCRIPTION = 700;

const url = (qs: string) => `/admin/seo?${qs}`;

/** نص مُشذّب أو null — الفارغ يعني «لا ميتاداتا خاصة» لا نصاً فارغاً */
function text(formData: FormData, name: string): string | null {
  const value = formData.get(name);
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed === "" ? null : trimmed;
}

type PageMetaRow = {
  id: string;
  meta: { title: string | null; description: string | null } | null;
};

export async function saveMetadata(formData: FormData) {
  // (١) البيئة
  const supabase = await createServerSupabase();
  if (!supabase) redirect(url("error=env"));

  // الفلتر يعود مع النتيجة كي لا يقفز المالك من «الناقصة» إلى «الكل» بعد الحفظ
  const rawFilter = formData.get("filter");
  const filter = rawFilter === "missing" ? "missing" : null;
  const withFilter = (qs: string) => (filter ? `${qs}&filter=${filter}` : qs);

  const listRes = await supabase.from("pages").select("id, meta");
  if (listRes.error || !listRes.data) redirect(url(withFilter("error=load")));

  const rows = listRes.data as PageMetaRow[];

  // الصفوف التي عُرضت فعلاً في النموذج — وهي وحدها القابلة للتعديل في هذا الحفظ
  const rendered = new Set(
    formData.getAll("rendered").filter((v): v is string => typeof v === "string")
  );

  // (٢) التحقق — قبل أي كتابة، حتى لا تُحفظ نصف الصفحات ثم يفشل الباقي
  type Change = { id: string; meta: { title: string | null; description: string | null } };
  const changes: Change[] = [];

  for (const row of rows) {
    // لم يُعرض ⇒ لا رأي للنموذج فيه ⇒ يبقى كما هو (لا محو ولا كتابة)
    if (!rendered.has(row.id)) continue;

    const nextTitle = text(formData, `meta-${row.id}-title`);
    const nextDescription = text(formData, `meta-${row.id}-description`);

    if ((nextTitle?.length ?? 0) > HARD_MAX_TITLE) redirect(url(withFilter("error=title")));
    if ((nextDescription?.length ?? 0) > HARD_MAX_DESCRIPTION) {
      redirect(url(withFilter("error=description")));
    }

    const currentTitle = row.meta?.title ?? null;
    const currentDescription = row.meta?.description ?? null;
    if (nextTitle === currentTitle && nextDescription === currentDescription) continue;

    changes.push({ id: row.id, meta: { title: nextTitle, description: nextDescription } });
  }

  if (changes.length === 0) redirect(url(withFilter("saved=0")));

  // (٣) الكتابة صفاً صفاً مع فحص صفر صفوف
  for (const change of changes) {
    const res = await supabase
      .from("pages")
      .update({ meta: change.meta })
      .eq("id", change.id)
      .select("id");
    if (res.error || !res.data || res.data.length === 0) {
      redirect(url(withFilter("error=save")));
    }
  }

  // (٤) الميتاداتا تُقرأ في ترويسة كل صفحة عامة وفي خريطة الموقع
  revalidatePath("/", "layout");
  redirect(url(withFilter(`saved=${changes.length}`)));
}
