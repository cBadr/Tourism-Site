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
 * المراجَع في اللغة دفعةً واحدة، و**اعتماد كل المسودات ونشرها** دفعةً واحدة.
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
 *
 * ⚠ **و`publishDrafts` لا تستثني نفسها من القاعدة أعلاه.** طلب المالك زرّاً
 * واحداً ينشر المسودات، **والحلّ ليس أن تكتب الواجهة `published` في الجدول** بل
 * أن تُعتمد الصفوف باسمه ثم تُنشر بالمسار القائم — وذلك كله داخل
 * `review_and_publish_drafts` (هجرة `0100`). فالمالك يضغط ضغطةً واحدة،
 * و`updated_by` يحفظ جواب «من اعتمد هذا النص؟».
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

/**
 * مفاتيح حالة الشاشة المسموح بعودتها: الموضع والترشيح والبحث ورقم الصفحة.
 *
 * **قائمةُ سماحٍ لا قائمةُ منع**: القيمة تصل من نموذجٍ في المتصفح، وما ليس في
 * هذه القائمة يسقط صامتاً. والمسار نفسه مبنيٌّ في الخادم من `locale` المتحقَّق
 * منه، فلا يستطيع حقلٌ من الصفحة أن يحوّل الوجهة إلى موقعٍ آخر.
 */
const BACK_KEYS = ["g", "ns", "status", "q", "p"];

/** سقفٌ عاقلٌ لقيمة واحدة في رابط العودة — يمنع رابطاً منتفخاً لا أكثر */
const MAX_BACK_VALUE = 200;

/**
 * رابط العودة — الشاشة تعود كما تركها المراجع: نفس الموضع والترشيح والبحث
 * **ونفس الصفحة**.
 *
 * ⚠ وكانت هذه الحالة تُنقل بحقلٍ مخفيٍّ لكل مفتاح (`return_ns` و`return_status`)،
 *   أي حقلان في **كل صفٍّ من الطابور**. ومع إضافة البحث ورقم الصفحة والموضع
 *   كانت تصير خمسة × عدد الصفوف. فصارت سلسلةً واحدة في حقلٍ واحد: نفس
 *   المعلومة، وحقلٌ واحد بدل خمسة.
 */
function returnUrl(formData: FormData, locale: string, result: string): string {
  const qs = new URLSearchParams();
  const back = field(formData, "back");
  if (back) {
    for (const [key, value] of new URLSearchParams(back)) {
      if (BACK_KEYS.includes(key) && value !== "") qs.set(key, value.slice(0, MAX_BACK_VALUE));
    }
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

/**
 * الأصل العربي لمفتاحٍ لم يُترجَم قط — **يُقرأ من الفهرس الحيّ لا من النموذج**.
 *
 * ══════════════════════════════════════════════════════════════════════════
 *  🔴 لماذا لم يعد يصل من المتصفح
 * ══════════════════════════════════════════════════════════════════════════
 *
 * كان الطابور يرسل الأصلَ في `<input type="hidden" name="source_text">` مع كل
 * صف. وثمنه ثقلٌ مقيس (الأصل يُرسَل مرتين في كل صف)، **وخطرُه أكبر**:
 * `upsert_translations` تكتب ما يصلها في `source_text` **وتشتقّ منه البصمة**
 * (`i18n_source_hash`) — والبصمة هي ما يقرّر لاحقاً «هل تغيّر الأصل؟». فقيمةٌ
 * مبدَّلةٌ في المتصفح تُنتج صفاً يبدو مطابقاً لأصلٍ لم يُترجَم عنه قط، فلا يشتعل
 * وسم «الأصل تغيّر» أبداً — وهو عطبٌ صامتٌ يقرؤه الزائر ولا يراه أحد.
 *
 * ⇒ فالمصدر الوحيد للأصل صار `translation_corpus()`: نفس الفهرس الذي بُني منه
 *   الطابور، ونفس ما تقرؤه `review_translation` بنفسها للصفوف المكتوبة.
 *
 * ⚠ **ولا رحلةَ زائدة في المسار الشائع**: هذه الدالة لا تُنادى إلا للصفِّ
 *   **الناقص** (بلا معرّف) — وهو المسار الذي كان يقرأ الطابور مرتين على أي حال.
 */
async function readSourceText(
  supabase: SupabaseClient,
  namespace: string,
  key: string
): Promise<string | null> {
  const result = await supabase.rpc("translation_corpus");
  if (result.error || !Array.isArray(result.data)) return null;

  for (const row of result.data as Record<string, unknown>[]) {
    const ns = row.namespace ?? row.ns;
    const k = row.key ?? row.k;
    if (ns === namespace && k === key) {
      const src = row.source_text ?? row.sourceText ?? row.src;
      return typeof src === "string" && src.trim() !== "" ? src : null;
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
    // 🔴 الأصل من الفهرس الحيّ لا من النموذج (الشرح فوق `readSourceText`).
    // وغيابُه يعني أن المفتاح لم يعد في محتوى الموقع — فلا يُكتب صفٌّ ليتيم.
    const sourceText = await readSourceText(supabase, namespace, key);
    if (sourceText === null) redirect(returnUrl(formData, locale, "error=row"));

    const draft = await supabase.rpc("upsert_translations", {
      p_rows: [
        {
          locale,
          namespace,
          key,
          sourceText,
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

/** عددٌ من حصيلة `jsonb` — كل ما ليس رقماً محدوداً يصير صفراً لا `NaN` في الرابط */
function countOf(data: unknown, key: string): number {
  if (data === null || typeof data !== "object") return 0;
  const value = (data as Record<string, unknown>)[key];
  return typeof value === "number" && Number.isFinite(value) ? Math.max(0, Math.trunc(value)) : 0;
}

/**
 * «انشر كل المسودات» — طلب المالك 2026-08-17.
 *
 * الحصيلة **تُنقل بأرقامها في الرابط** لا برقمٍ واحد، لأن الوعد الذي قطعناه له
 * أن يعرف **ما لم يحدث ولماذا**: زرٌّ يقول «تم» وهو يتخطّى أربعين صفاً صامتاً
 * أسوأ من لا زرّ. والرمز `saved` يفرّق حالتين ليختلف نصّ الشريط بجوار الزرّ:
 * `bulkall` نُشر كل مؤهَّل بلا استثناء، و`bulkpart` استُثني شيء (آليّ أو قديم
 * أو فارغ) فالتفصيل في شريط أعلى الصفحة.
 */
export async function publishDrafts(formData: FormData) {
  const supabase = await createServerSupabase();

  const rawLocale = field(formData, "locale");
  const locale = rawLocale && LOCALE_PATTERN.test(rawLocale) ? rawLocale.toLowerCase() : null;
  if (!locale || locale === DEFAULT_LOCALE) redirect("/admin/languages?error=locale");
  if (!supabase) redirect(returnUrl(formData, locale, "error=env"));

  const { data, error } = await supabase.rpc("review_and_publish_drafts", { p_locale: locale });
  if (error) redirect(returnUrl(formData, locale, `error=${errorCode(error)}`));

  const approved = countOf(data, "approved");
  const published = countOf(data, "published");
  const machine = countOf(data, "skippedMachine");
  const stale = countOf(data, "skippedStale");
  const blank = countOf(data, "skippedBlank");
  const staleReviewed = countOf(data, "staleReviewed");

  const partial = machine + stale + blank + staleReviewed > 0;
  const qs = new URLSearchParams({
    saved: partial ? "bulkpart" : "bulkall",
    ap: String(approved),
    pb: String(published),
    mt: String(machine),
    st: String(stale),
    bl: String(blank),
    sr: String(staleReviewed),
  });

  revalidatePath("/admin/languages", "layout");
  revalidatePath("/", "layout");
  clearPublicCaches();
  redirect(returnUrl(formData, locale, qs.toString()));
}
