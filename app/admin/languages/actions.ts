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
 * إجراءات مدير اللغات: إضافة لغة، تفعيلها/تعطيلها، مفتاح النشر التلقائي،
 * وتحديث قائمة العمل (`translation_corpus`).
 *
 * ثلاث قواعد تحكم هذا الملف:
 *
 * (١) **العربية لا تُمس.** لا تُضاف ولا تُعطَّل ولا يُغيَّر كونها الأصل. الرفض
 *     هنا رفض مبكر ومهذّب؛ الرفض الحقيقي واجب على قاعدة البيانات لأن هذه
 *     الشاشة ليست الباب الوحيد.
 *
 * (٢) **اللغة الجديدة تُولد مطفأة.** إضافتها لا تنشرها: تُسجَّل معطَّلة، ثم
 *     يولّد المالك قائمة العمل ويترجم ويراجع وينشر، وعندها يفعّلها. لو وُلدت
 *     مفعّلة لظهر ‎/en‎ فارغاً أو نصفه عربي في نتائج البحث — وهذا ما يعاقب عليه
 *     جوجل فعلاً.
 *
 * (٣) **النشر التلقائي قرار صريح.** مفتاحه هنا، وتحذيره مكتوب في الشاشة لا في
 *     التوثيق وحده.
 *
 * الكتابة بجلسة المدير لا بمفتاح الخدمة: RLS هي الحارس الحقيقي، ومفتاح الخدمة
 * يتجاوزها — استعماله لعملية يقودها بشر يُفقد النظام أثر «من غيّر ماذا».
 */

const PATH = "/admin/languages";

/** نفس قيد `locales.code` في الهجرة حرفياً — رفض مبكر برسالة مفهومة */
const LOCALE_PATTERN = /^[a-z]{2}(-[a-z]{2})?$/i;

function field(formData: FormData, name: string): string | null {
  const value = formData.get(name);
  return typeof value === "string" && value.trim() !== "" ? value.trim() : null;
}

/**
 * إسقاط ذواكر الواجهة العامة داخل هذه العملية.
 *
 * `revalidatePath` يُبطل ذاكرة Next للصفحات، لكن ثلاث خرائط دقيقة تعيش **داخل
 * العملية** خارج علمه: قائمة اللغات المفعّلة، والصفحات المترجمة، ومساحات نصوص
 * الواجهة. بلا إسقاطها يضغط المالك «إظهار» فلا تظهر اللغة في المبدّل إلا بعد
 * دقيقة، فيظن الزر معطلاً ويكرر الضغط. الإسقاط محلي للعملية الجارية — والـ TTL
 * يبقى شبكة الأمان لبقية العمليات على منصة بلا حالة مشتركة.
 */
function clearPublicCaches(): void {
  clearLocalesCache();
  clearContentCache();
  clearTranslationsCache();
}

/** رمز خطأ من قاعدة البيانات ← رمز تعرضه الشاشة (التلميح أولاً كعادة المشروع) */
function errorCode(error: { code?: string; hint?: string | null } | null): string {
  if (!error) return "save";
  const hint = (error.hint ?? "").trim();
  if (hint === "forbidden") return "forbidden";
  if (hint === "default-locale") return "base";
  if (hint === "invalid-input") return "code";
  if (hint === "not-found") return "locale";
  if (error.code === "23505") return "exists";
  if (error.code === "23514") return "code"; // قيد `code ~ '^[a-z]{2}(-[a-z]{2})?$'`
  if (error.code === "42501") return "forbidden";
  if (error.code === "42P01" || error.code === "PGRST205") return "notready";
  if (error.code === "42883" || error.code === "PGRST202") return "notready";
  return "save";
}

/**
 * قراءة الفهرس الحي — «قائمة العمل».
 *
 * `translation_corpus()` **دالة قراءة لا كتابة**: تستخرج كل نص عربي قابل
 * للترجمة من المحتوى نفسه لحظة الطلب. أي أن القائمة لا «تُولَّد» ولا تحتاج
 * مزامنة: قسم جديد بالعربية يظهر في طوابير كل اللغات فور حفظه.
 *
 * فما فائدة الزر إذاً؟ أن يرى المالك بعينه أن الفهرس مقروء وكم فيه من نص —
 * وأن تُعاد قراءة أرقام التقدم (وفيها كشف «الأصل تغيّر») بعد تعديل المحتوى.
 */
async function readCorpusCount(
  supabase: SupabaseClient
): Promise<{ count: number; error: { code?: string; hint?: string | null } | null }> {
  const { data, error } = await supabase.rpc("translation_corpus");
  if (error) return { count: 0, error };
  return { count: Array.isArray(data) ? data.length : 0, error: null };
}

export async function addLocale(formData: FormData) {
  const supabase = await createServerSupabase();
  if (!supabase) redirect(`${PATH}?error=env`);

  const raw = field(formData, "code");
  const code = raw ? raw.toLowerCase() : null;
  if (!code || !LOCALE_PATTERN.test(code)) redirect(`${PATH}?error=code`);
  if (code === DEFAULT_LOCALE) redirect(`${PATH}?error=base`);

  const name = field(formData, "name");
  if (!name) redirect(`${PATH}?error=name`);

  const nativeName = field(formData, "native_name");
  if (!nativeName) redirect(`${PATH}?error=native`);

  const dir = field(formData, "dir");
  if (dir !== "rtl" && dir !== "ltr") redirect(`${PATH}?error=dir`);

  const sortRaw = field(formData, "sort");
  const sort = sortRaw !== null && /^\d{1,3}$/.test(sortRaw) ? Number(sortRaw) : null;

  const { error } = await supabase.from("locales").insert({
    code,
    name,
    native_name: nativeName,
    dir,
    // مطفأة عمداً: تُفعَّل بعد المراجعة والنشر لا قبلهما
    enabled: false,
    auto_publish: false,
    ...(sort === null ? {} : { sort }),
  });

  if (error) redirect(`${PATH}?error=${errorCode(error)}`);

  revalidatePath(PATH, "layout");
  redirect(`${PATH}?added=${code}`);
}

export async function setLocaleEnabled(formData: FormData) {
  const supabase = await createServerSupabase();
  if (!supabase) redirect(`${PATH}?error=env`);

  const raw = field(formData, "code");
  const code = raw ? raw.toLowerCase() : null;
  if (!code || !LOCALE_PATTERN.test(code)) redirect(`${PATH}?error=locale`);
  if (code === DEFAULT_LOCALE) redirect(`${PATH}?error=base`);

  const enabled = field(formData, "enabled") === "1";

  const { error } = await supabase.from("locales").update({ enabled }).eq("code", code);
  if (error) redirect(`${PATH}?error=${errorCode(error)}`);

  revalidatePath(PATH, "layout");
  // تغيير اللغات يغيّر مبدّل اللغة وخريطة الموقع في الواجهة العامة كلها
  revalidatePath("/", "layout");
  clearPublicCaches();
  redirect(`${PATH}?${enabled ? "enabled" : "disabled"}=${code}`);
}

export async function setLocaleAutoPublish(formData: FormData) {
  const supabase = await createServerSupabase();
  if (!supabase) redirect(`${PATH}?error=env`);

  const raw = field(formData, "code");
  const code = raw ? raw.toLowerCase() : null;
  if (!code || !LOCALE_PATTERN.test(code)) redirect(`${PATH}?error=locale`);
  if (code === DEFAULT_LOCALE) redirect(`${PATH}?error=base`);

  const autoPublish = field(formData, "auto_publish") === "1";

  const { error } = await supabase
    .from("locales")
    .update({ auto_publish: autoPublish })
    .eq("code", code);
  if (error) redirect(`${PATH}?error=${errorCode(error)}`);

  revalidatePath(PATH, "layout");
  revalidatePath("/", "layout");
  clearPublicCaches();
  redirect(`${PATH}?${autoPublish ? "auto" : "manual"}=${code}`);
}

export async function refreshCorpus() {
  const supabase = await createServerSupabase();
  if (!supabase) redirect(`${PATH}?error=env`);

  const { count, error } = await readCorpusCount(supabase);
  if (error) redirect(`${PATH}?error=${errorCode(error)}`);

  revalidatePath(PATH, "layout");
  redirect(`${PATH}?refreshed=${count}`);
}
