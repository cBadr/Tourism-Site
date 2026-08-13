"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { SupabaseClient } from "@supabase/supabase-js";

import { clearLocalesCache } from "@/i18n/locales";
import { clearContentCache } from "@/lib/content";
import { clearTranslationsCache } from "@/lib/i18n/content";
import { DEFAULT_LOCALE } from "@/lib/i18n-types";
import { createServerSupabase } from "@/lib/supabase/server";

/**
 * إجراءات طابور المراجعة: اعتماد ترجمة صف واحد (بنشرها أو بدونه)، ونشر كل
 * المراجَع في اللغة دفعةً واحدة.
 *
 * **الاعتماد والنشر يقعان داخل `review_translation` و`publish_locale` في
 * Postgres لا هنا.** السبب ليس أناقة: قاعدة الحالات (مسودة ← مراجَعة ← منشورة)
 * تحرس ما يراه الزائر، ولو كتبت الواجهة الحالة مباشرة في الجدول لأمكن نشر نص
 * لم يمرّ بالمراجعة من أي باب آخر — وهو بالضبط ما يمنعه القرار الثالث في
 * العقد.
 *
 * حالة خاصة يعالجها الملف: صف **ناقص** (مفتاح بلا ترجمة بعد) قد لا يملك
 * معرِّفاً أصلاً لأنه لم يُكتب في `translations` قط. عندها نكتبه مسودةً أولاً
 * ثم نعتمده بمعرّفه الحقيقي — فالمراجع يكتب ترجمته من الطابور مباشرة بلا
 * انتظار دورة ترجمة آلية.
 */

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
/** نفس قيد `locales.code` في الهجرة حرفياً — رفض مبكر برسالة مفهومة */
const LOCALE_PATTERN = /^[a-z]{2}(-[a-z]{2})?$/i;

/** حد أعلى عاقل لطول الترجمة — يمنع الخطأ المطبعي الكارثي لا أكثر */
const MAX_VALUE = 5000;

function field(formData: FormData, name: string): string | null {
  const value = formData.get(name);
  return typeof value === "string" && value.trim() !== "" ? value.trim() : null;
}

/**
 * إسقاط ذواكر الواجهة العامة داخل هذه العملية بعد نشر ترجمة.
 *
 * `revalidatePath` يُبطل ذاكرة Next للصفحات، لكن ثلاث خرائط دقيقة تعيش **داخل
 * العملية** خارج علمه: قائمة اللغات المفعّلة (وهي تعتمد على عدد المنشور، فأول
 * نص يُنشر في لغة هو ما يُظهرها أصلاً)، والصفحات المترجمة، ومساحات نصوص
 * الواجهة. بلا إسقاطها ينشر المراجع ثم يفتح `/en` فيرى العربي ويظن النشر فشل.
 */
function clearPublicCaches(): void {
  clearLocalesCache();
  clearContentCache();
  clearTranslationsCache();
}

/** رابط العودة مع إبقاء الترشيح كما تركه المراجع */
function returnUrl(formData: FormData, locale: string, result: string): string {
  const qs = new URLSearchParams();
  for (const key of ["ns", "status"]) {
    const value = field(formData, `return_${key}`);
    if (value) qs.set(key, value);
  }
  for (const [key, value] of new URLSearchParams(result)) qs.set(key, value);
  return `/admin/languages/${locale}?${qs.toString()}`;
}

/**
 * رمز خطأ من قاعدة البيانات ← رمز تعرضه الشاشة.
 *
 * دوال المرحلة ٨ ترفع أخطاءها بـ `using hint = '<رمز>'` كما في بقية المشروع،
 * فالتلميح هو أدق ما نملك: `invalid-input` نص فارغ أو حالة مجهولة،
 * و`not-found` صف أو لغة غير موجودة، و`forbidden` حساب غير مشرف.
 */
function errorCode(error: { code?: string; hint?: string | null } | null): string {
  if (!error) return "save";
  const hint = (error.hint ?? "").trim();
  if (hint === "forbidden") return "forbidden";
  if (hint === "invalid-input") return "value";
  if (hint === "not-found") return "row";
  if (hint === "default-locale") return "base";
  if (error.code === "42501") return "forbidden";
  if (error.code === "42P01" || error.code === "PGRST205") return "notready";
  if (error.code === "42883" || error.code === "PGRST202") return "notready";
  return "save";
}

/**
 * معرّف صف ترجمة موجود — يُقرأ من `translation_queue` لا من الجدول مباشرة.
 *
 * جدول `translations` بلا أي صلاحية للأدوار العامة عمداً (دفاع في العمق في
 * هجرة ٠٠١٨): كل وصول إليه يمرّ بدالة إدارية حارسها داخلها. لذلك حتى قراءة
 * معرّف صف واحد تقع عبر الطابور.
 */
async function findRowId(
  supabase: SupabaseClient,
  locale: string,
  namespace: string,
  key: string
): Promise<string | null> {
  const result = await supabase.rpc("translation_queue", {
    p_locale: locale,
    p_status: null,
  });
  if (result.error || !Array.isArray(result.data)) return null;

  for (const row of result.data as Record<string, unknown>[]) {
    if (row.namespace === namespace && row.key === key && typeof row.id === "string") {
      return row.id;
    }
  }
  return null;
}

export async function saveTranslation(formData: FormData) {
  const supabase = await createServerSupabase();

  const rawLocale = field(formData, "locale");
  const locale = rawLocale && LOCALE_PATTERN.test(rawLocale) ? rawLocale.toLowerCase() : null;
  if (!locale || locale === DEFAULT_LOCALE) redirect("/admin/languages?error=locale");
  if (!supabase) redirect(returnUrl(formData, locale, "error=env"));

  const namespace = field(formData, "namespace");
  const key = field(formData, "key");
  if (!namespace || !key) redirect(returnUrl(formData, locale, "error=row"));

  const raw = formData.get("value");
  const value = typeof raw === "string" ? raw.trim().slice(0, MAX_VALUE) : "";
  if (value === "") redirect(returnUrl(formData, locale, "error=value"));

  const publish = field(formData, "publish") === "1";

  const rawId = field(formData, "id");
  let id = rawId && UUID_PATTERN.test(rawId) ? rawId : null;

  // صف ناقص بلا معرّف: يُكتب أولاً بالنص المكتوب ثم يُعتمد بمعرّفه الحقيقي.
  // شكل العنصر هو ما تقرؤه `upsert_translations`: المصدر بالاسم `sourceText`،
  // والحالة والبصمة تُحسبان داخل القاعدة لا هنا.
  if (id === null) {
    id = await findRowId(supabase, locale, namespace, key);
  }
  if (id === null) {
    const draft = await supabase.rpc("upsert_translations", {
      p_rows: [
        {
          locale,
          namespace,
          key,
          sourceText: field(formData, "source_text") ?? "",
          value,
        },
      ],
    });
    if (draft.error) redirect(returnUrl(formData, locale, `error=${errorCode(draft.error)}`));
    id = await findRowId(supabase, locale, namespace, key);
  }
  if (id === null) redirect(returnUrl(formData, locale, "error=row"));

  const { error } = await supabase.rpc("review_translation", {
    p_id: id,
    p_value: value,
    p_publish: publish,
  });
  if (error) redirect(returnUrl(formData, locale, `error=${errorCode(error)}`));

  revalidatePath("/admin/languages", "layout");
  // النص المنشور يظهر للزائر فوراً — الواجهة العامة كلها تُبطَّل ذاكرتها
  if (publish) revalidatePath("/", "layout");
  clearPublicCaches();

  redirect(returnUrl(formData, locale, publish ? "published=1" : "saved=1"));
}

export async function publishReviewed(formData: FormData) {
  const supabase = await createServerSupabase();

  const rawLocale = field(formData, "locale");
  const locale = rawLocale && LOCALE_PATTERN.test(rawLocale) ? rawLocale.toLowerCase() : null;
  if (!locale || locale === DEFAULT_LOCALE) redirect("/admin/languages?error=locale");
  if (!supabase) redirect(returnUrl(formData, locale, "error=env"));

  // الدالة تُرجع عدد الصفوف التي نُشرت فعلاً — نمرّره ليكون التأكيد رقماً لا وعداً
  const { data, error } = await supabase.rpc("publish_locale", { p_locale: locale });
  if (error) redirect(returnUrl(formData, locale, `error=${errorCode(error)}`));

  const count = typeof data === "number" && Number.isFinite(data) ? Math.max(0, data) : 0;

  revalidatePath("/admin/languages", "layout");
  revalidatePath("/", "layout");
  clearPublicCaches();
  redirect(returnUrl(formData, locale, `bulk=${count}`));
}
