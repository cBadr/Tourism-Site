"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { absoluteImageUrl, canonicalOverridePath } from "@/lib/seo";
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
 * 🔒 **وحدّ ثالث أُضيف مع خيارات سيو الصفحة الواحدة: الكتابة بالنشر لا بالاستبدال.**
 * كان السطر يبني كائناً جديداً بمفتاحين (`{title, description}`) ويكتبه فوق
 * `meta` كله. وما دام العمود يحمل مفتاحين فذلك سليم؛ لكن لحظة دخول `noindex`
 * و`excludeFromSitemap` و`ogImageUrl` و`canonicalPath` يصير كل حفظ من هذه
 * الشاشة **محواً صامتاً** لها — صفحةٌ مُنع فهرستها تعود إلى نتائج البحث لأن
 * أحدهم صحّح فاصلة في وصفها. فالنشر (`...row.meta`) يحفظ ما لا تعرفه هذه
 * الشاشة، والحذف الصريح أدناه يمنع تراكم مفاتيح بلا معنى.
 *
 * ولا يُكتب إلا ما **تغيّر فعلاً**: حفظ عشرين صفحة بلا تعديل كان سيحرّك
 * `updated_at` لكلها ويطمس متى تغيّرت الميتاداتا حقاً.
 */

/** سقف صلب — ليس التوصية (٦٠/١٦٠) بل حاجز أمام لصق صفحة كاملة في حقل */
const HARD_MAX_TITLE = 300;
const HARD_MAX_DESCRIPTION = 700;
const HARD_MAX_URL = 500;

const url = (qs: string) => `/admin/seo?${qs}`;

/** نص مُشذّب أو null — الفارغ يعني «لا ميتاداتا خاصة» لا نصاً فارغاً */
function text(formData: FormData, name: string): string | null {
  const value = formData.get(name);
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed === "" ? null : trimmed;
}

/**
 * صف كما يصل من `jsonb`: `meta` كائن حرّ لا شكل مضمون.
 *
 * ولماذا لا `PageMeta` مباشرةً؟ لأن العمود قد يحمل مفاتيح كتبتها نسخة أحدث من
 * الشاشة أو أداة استيراد، والنشر أدناه يحفظها. النوع المتساهل هنا **يصف
 * الواقع**، والنوع الصارم يُفرض على المكتوب لا على المقروء.
 */
type PageMetaRow = { id: string; meta: Record<string, unknown> | null };

/** قيمة نصية من `jsonb` — وما ليس نصاً يُقرأ «غير مضبوط» لا يُصدَّق */
function metaText(meta: Record<string, unknown> | null, key: string): string | null {
  const value = meta?.[key];
  return typeof value === "string" && value.trim() !== "" ? value.trim() : null;
}

export async function saveMetadata(formData: FormData) {
  // (١) البيئة
  const supabase = await createServerSupabase();
  if (!supabase) redirect(url("error=env"));

  // الفلتر يعود مع النتيجة كي لا يقفز المالك من «الناقصة» إلى «الكل» بعد الحفظ
  const rawFilter = formData.get("filter");
  const filter = rawFilter === "missing" ? "missing" : null;
  const withFilter = (qs: string) => (filter ? `${qs}&filter=${filter}` : qs);
  /** خطأ يخصّ صفاً بعينه — الصف يعود في الرابط فتُبرزه الشاشة بدل بحثٍ يدوي */
  const failRow = (code: string, id: string) => url(withFilter(`error=${code}&row=${id}`));

  const listRes = await supabase.from("pages").select("id, meta");
  if (listRes.error || !listRes.data) redirect(url(withFilter("error=load")));

  const rows = listRes.data as PageMetaRow[];

  // الصفوف التي عُرضت فعلاً في النموذج — وهي وحدها القابلة للتعديل في هذا الحفظ
  const rendered = new Set(
    formData.getAll("rendered").filter((v): v is string => typeof v === "string")
  );

  // (٢) التحقق — قبل أي كتابة، حتى لا تُحفظ نصف الصفحات ثم يفشل الباقي
  type Change = { id: string; meta: Record<string, unknown> };
  const changes: Change[] = [];

  for (const row of rows) {
    // لم يُعرض ⇒ لا رأي للنموذج فيه ⇒ يبقى كما هو (لا محو ولا كتابة)
    if (!rendered.has(row.id)) continue;

    const nextTitle = text(formData, `meta-${row.id}-title`);
    const nextDescription = text(formData, `meta-${row.id}-description`);

    if ((nextTitle?.length ?? 0) > HARD_MAX_TITLE) redirect(failRow("title", row.id));
    if ((nextDescription?.length ?? 0) > HARD_MAX_DESCRIPTION) {
      redirect(failRow("description", row.id));
    }

    // مربع اختيار غير مؤشَّر لا يُرسل — والصف معروض بيقين (تقاطع `rendered`
    // أعلاه)، فالغياب هنا يعني «أطفأه المالك» لا «لم يصل الحقل».
    const nextNoindex = formData.get(`meta-${row.id}-noindex`) != null;
    const nextExclude = formData.get(`meta-${row.id}-nositemap`) != null;

    /**
     * صورة الصفحة تُفحص **بالدالة التي تبني الوسم نفسها**: القبول هنا مع الرفض
     * هناك يعني بطاقة مشاركة بلا صورة يظن المالك أنه ضبطها.
     */
    const rawImage = text(formData, `meta-${row.id}-ogimage`);
    if ((rawImage?.length ?? 0) > HARD_MAX_URL) redirect(failRow("ogimage", row.id));
    if (rawImage !== null && absoluteImageUrl(rawImage) === null) {
      redirect(failRow("ogimage", row.id));
    }

    /**
     * 🔒 D-24: المسار القانوني **داخلي فقط**. الرفض هنا صاخب بينما هو صامت في
     * `lib/seo.ts` بقصد: الصفحة العامة تُصيَّر بأي حال ولا تُسقَط بسبب إعداد،
     * أما المالك فيجب أن يعرف أن قيمته لن تُطبَّق بدل أن يحفظها ويطمئن.
     */
    const rawCanonical = text(formData, `meta-${row.id}-canonical`);
    if ((rawCanonical?.length ?? 0) > HARD_MAX_URL) redirect(failRow("canonical", row.id));
    const nextCanonical = rawCanonical === null ? null : canonicalOverridePath(rawCanonical);
    if (rawCanonical !== null && nextCanonical === null) redirect(failRow("canonical", row.id));

    const currentTitle = metaText(row.meta, "title");
    const currentDescription = metaText(row.meta, "description");
    const currentNoindex = row.meta?.noindex === true;
    const currentExclude = row.meta?.excludeFromSitemap === true;
    const currentImage = metaText(row.meta, "ogImageUrl");
    const currentCanonical = metaText(row.meta, "canonicalPath");

    if (
      nextTitle === currentTitle &&
      nextDescription === currentDescription &&
      nextNoindex === currentNoindex &&
      nextExclude === currentExclude &&
      rawImage === currentImage &&
      nextCanonical === currentCanonical
    ) {
      continue;
    }

    /**
     * النشر يحفظ كل مفتاح لا تعرفه هذه الشاشة، والحذف الصريح يمنع تراكم مفاتيح
     * بلا معنى: العقد ينصّ أن **المفتاح الغائب = غير مضبوط**، فصفحةٌ لم تُطلب
     * لها هذه الخيارات تبقى بمفتاحيها الاثنين كما كانت — لا تكتسب أربعة مفاتيح
     * قيمتها «لا شيء».
     */
    const meta: Record<string, unknown> = {
      ...(row.meta ?? {}),
      title: nextTitle,
      description: nextDescription,
    };
    if (nextNoindex) meta.noindex = true;
    else delete meta.noindex;
    if (nextExclude) meta.excludeFromSitemap = true;
    else delete meta.excludeFromSitemap;
    if (rawImage !== null) meta.ogImageUrl = rawImage;
    else delete meta.ogImageUrl;
    if (nextCanonical !== null) meta.canonicalPath = nextCanonical;
    else delete meta.canonicalPath;

    changes.push({ id: row.id, meta });
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
