"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { absoluteImageUrl, internalCanonicalPath } from "@/lib/seo";
import type { SeoSettings, TwitterCardType } from "@/lib/seo-types";
import { createServerSupabase } from "@/lib/supabase/server";

/**
 * حفظ إعدادات السيو العامة — مفتاح `seo` في `site_settings`.
 *
 * ── لماذا إجراء مستقل عن `app/admin/settings/actions.ts` ────────────────────
 * ذاك يبني مصفوفة صفوف بمفاتيح ثابتة ويرفعها `upsert` واحداً، وكان يكتب مفتاح
 * `seo` **بحقلين اثنين فقط**. ولأن `site_settings.value` عمود `jsonb` يُستبدل
 * كاملاً لا يُدمج، فأول حفظ من تلك الشاشة بعد توسعة العقد كان سيمحو صورة
 * المشاركة وحساب إكس ونوع البطاقة وكتلة `robots` كلها — بنجاحٍ ظاهر وبلا رسالة.
 * ولذلك حُذف مفتاح `seo` من هناك نهائياً: **شاشة واحدة تملك المفتاح، لا شاشتان.**
 *
 * ⚠ **وهذا الإجراء يملك المفتاح كاملاً**: أي حقل يُضاف إلى `SeoSettings` ولا
 * يُقرأ هنا سيُمحى عند أول حفظ. النوع الصريح أدناه (`SeoSettings`) يجعل ذلك
 * **خطأ بناء** لا عطباً صامتاً.
 *
 * وأربع خطوات اتفاقية `CONVENTIONS.md §٤` بلا تخطٍّ: البيئة، ثم التحقق بخروج
 * فوري برمز واضح، ثم الكتابة مع `.select()` وفحص صفر صفوف (فخ RLS: الرفض يظهر
 * نجاحاً)، ثم `revalidatePath` فـ`redirect`.
 */

const url = (qs: string) => `/admin/seo/settings?${qs}`;

/** سقوف صلبة — ليست توصية سيو بل حاجز أمام لصق صفحة كاملة في حقل */
const MAX_TITLE_TEMPLATE = 200;
const MAX_DESCRIPTION = 700;
/** سقف الروابط والمسارات معاً — أطول من أي مسار حقيقي بكثير */
const MAX_IMAGE_URL = 500;
/** أكثر من هذا العدد من أسطر المنع علامة لصقٍ لا ضبطٍ واعٍ */
const MAX_DISALLOW = 50;

/** حسابات إكس: حروف وأرقام وشرطة سفلية، وطولها ١٥ خانة فأقل */
const X_HANDLE = /^[A-Za-z0-9_]{1,15}$/;

/** نص مُشذّب أو `null` — الفارغ يعني «غير مضبوط» لا نصاً فارغاً */
function text(formData: FormData, name: string): string | null {
  const value = formData.get(name);
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed === "" ? null : trimmed;
}

export async function saveSeoSettings(formData: FormData) {
  // (١) البيئة
  const supabase = await createServerSupabase();
  if (!supabase) redirect(url("error=env"));

  // (٢) التحقق — كله قبل أي كتابة

  /**
   * قالب العنوان: `%s` ليس زينةً بل موضع عنوان الصفحة الذي يقرؤه Next في
   * `app/layout.tsx`. وقالبٌ بلا `%s` يجعل **كل صفحة في الموقع** تحمل العنوان
   * نفسه في نتائج البحث — وهو أسوأ ما يُفعل بموقع قناة اكتسابه الوحيدة البحث.
   */
  const titleTemplate = text(formData, "titleTemplate");
  if (titleTemplate === null) redirect(url("error=template-empty"));
  if (titleTemplate.length > MAX_TITLE_TEMPLATE) redirect(url("error=template-long"));
  if (!titleTemplate.includes("%s")) redirect(url("error=template-placeholder"));

  const defaultDescription = text(formData, "defaultDescription");
  if (defaultDescription === null) redirect(url("error=description-empty"));
  if (defaultDescription.length > MAX_DESCRIPTION) redirect(url("error=description-long"));

  /**
   * صورة المشاركة: تُفحص **بنفس الدالة التي تبني الوسم** لا بفحص مشابه. القبول
   * هنا مع الرفض هناك يعني بطاقة مشاركة بلا صورة يظن المالك أنه ضبطها.
   */
  const ogImageRaw = text(formData, "ogImageUrl");
  if (ogImageRaw !== null && ogImageRaw.length > MAX_IMAGE_URL) redirect(url("error=image-long"));
  if (ogImageRaw !== null && absoluteImageUrl(ogImageRaw) === null) redirect(url("error=image"));

  /**
   * حساب إكس بلا `@` — والعلامة تُقصّ هنا احتمالَ أن يكتبها المالك رغم الشرح،
   * تماماً كما يقصّها `lib/seo.ts` قبل بناء الوسم.
   */
  const twitterRaw = text(formData, "twitterSite");
  const twitterSite = twitterRaw === null ? null : twitterRaw.replace(/^@+/, "");
  if (twitterSite !== null && !X_HANDLE.test(twitterSite)) redirect(url("error=twitter"));

  const cardRaw = formData.get("twitterCard");
  const twitterCard: TwitterCardType =
    cardRaw === "summary" ? "summary" : "summary_large_image";

  /**
   * قائمة المنع: سطر لكل مسار. والفحص هو فحص المسار الداخلي نفسه — سطرُ منعٍ
   * يحمل نطاقاً غريباً (‏`https://x.com/y`) لا يمنع شيئاً ويوهم المالك أنه يمنع.
   */
  const disallowRaw = formData.get("disallow");
  const disallowLines =
    typeof disallowRaw === "string"
      ? disallowRaw
          .split("\n")
          .map((line) => line.trim())
          .filter((line) => line !== "")
      : [];
  if (disallowLines.length > MAX_DISALLOW) redirect(url("error=disallow-many"));
  for (const line of disallowLines) {
    // الطول أولاً: `internalCanonicalPath` تفحص الشكل لا الحجم، وسطرٌ بطول صفحة
    // كاملة يمر منها سليماً ثم يُكتب في ملف يقرؤه كل زاحف.
    if (line.length > MAX_IMAGE_URL) redirect(url("error=disallow"));
    if (internalCanonicalPath(line) === null) redirect(url("error=disallow"));
    /*
     * 🔒 و`/` وحدها ترفض برسالتها الخاصة: هي مسار داخلي سليم شكلاً فتجتاز
     * الفحص أعلاه، لكنها تمنع **الموقع كله**. والملف الناتج يحمل `Allow: /`
     * و`Disallow: /` معاً — جوجل يرجّح السماح عند تساوي الطول وبينج يرجّح
     * المنع، فيُحجب نصف محركات البحث صامتاً بينما مفتاح «امنع فهرسة الموقع»
     * مطفأ في هذه الشاشة نفسها. والرسالة تحيل إلى المفتاح الصحيح بدل أن تقول
     * «مسار غير صالح» عن مسارٍ صالح.
     */
    if (line === "/") redirect(url("error=disallow-root"));
  }
  // التكرار يُسقط: سطران متطابقان في الملف لا يمنعان مرتين
  const disallow = [...new Set(disallowLines)];

  const value: SeoSettings = {
    titleTemplate,
    defaultDescription,
    ogImageUrl: ogImageRaw,
    twitterSite,
    twitterCard,
    robots: {
      // مربع اختيار غير مؤشَّر لا يُرسل — والغياب هنا يعني «احجب الموقع كله»،
      // فالحقل معكوس في الشاشة (`noindexAll`) كي يبقى الافتراضي الآمن مفهرَساً
      // حتى لو وصل نموذج مبتور.
      indexable: formData.get("noindexAll") == null,
      disallow,
      blockAiCrawlers: formData.get("blockAiCrawlers") != null,
    },
  };

  // (٣) الكتابة مع فحص صفر صفوف
  const res = await supabase
    .from("site_settings")
    .upsert([{ key: "seo", value }], { onConflict: "key" })
    .select("key");

  // صفر صفوف مع نجاح ظاهري = RLS رفضت الكتابة (المستخدم ليس admin)
  if (res.error || !res.data || res.data.length === 0) redirect(url("error=save"));

  // (٤) الميتاداتا تُقرأ في ترويسة كل صفحة عامة، و`robots.txt` مسار مستقل
  revalidatePath("/", "layout");
  redirect(url("saved=1"));
}
