"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { createServerSupabase } from "@/lib/supabase/server";

/**
 * إنشاء صفحة محتوى جديدة — الأنواع المسموح إنشاؤها يدوياً: مسار سيو أو صفحة ثابتة
 * (الرئيسية وصفحات الخدمات تُبذر من النظام ولا تُنشأ من هنا).
 * اتفاقية «إعادة التوجيه بعد العملية» (اعتبار ٨): النجاح يفتح محرر الصفحة مباشرة،
 * والفشل يعود للنموذج برمز خطأ في الـ query string.
 */

const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
/** `landing` أُضيف مع منشئ الصفحات — نوعٌ رابع يُبنى بالكتل ويُصيَّر على `/{slug}` */
const ALLOWED_KINDS = ["corridor", "static", "landing"] as const;

export async function createPage(formData: FormData) {
  const supabase = await createServerSupabase();
  if (!supabase) redirect("/admin/content/new?error=env");

  const get = (name: string): string | null => {
    const v = formData.get(name);
    return typeof v === "string" && v.trim() !== "" ? v.trim() : null;
  };

  const title = get("title");
  if (!title) redirect("/admin/content/new?error=title");

  const slug = get("slug")?.toLowerCase() ?? null;
  if (!slug || !SLUG_PATTERN.test(slug)) redirect("/admin/content/new?error=slug");

  const kind = get("kind");
  if (!kind || !(ALLOWED_KINDS as readonly string[]).includes(kind))
    redirect("/admin/content/new?error=kind");

  /**
   * 🔴 فحص التصادم **قبل** الإدراج — وسببه عطبٌ كان قائماً:
   * `app/[slug]/page.tsx` يرفض بـ`notFound()` كل مقطعٍ يملكه ملفٌ في `app/`
   * (`about` · `book` · `track` …)، بينما الإنشاء كان يقبل أي slug يطابق النمط.
   * فالنتيجة صفحةٌ تبدو «منشورة» في اللوحة و**٤٠٤ للأبد** على الويب — ولا سطر
   * في أي سجل يقول ذلك.
   *
   * والدالة ترجع **رمزاً** (`SlugRejectCode`) لا جملة، فالشاشة تترجمه. وهي هنا
   * لتعطي سبباً بعينه؛ والحدّ الحقيقي مُشغّلٌ على `pages` في القاعدة، لأن أي
   * إدراج مباشر عبر PostgREST أو محرر SQL يتخطى هذا السطر.
   */
  const reject = await supabase.rpc("page_slug_reject", {
    p_kind: kind,
    p_slug: slug,
    p_page: null,
  });
  if (!reject.error && typeof reject.data === "string" && reject.data !== "")
    redirect(`/admin/content/new?error=${reject.data}`);

  // تُنشأ كمسودة — تُنشر من المحرر أو من زر النشر في القائمة بعد اكتمال أقسامها
  const res = await supabase
    .from("pages")
    .insert({ slug, kind, title, published: false })
    .select("id")
    .single();

  if (res.error || !res.data) {
    // المُشغّل يبعث `SlugRejectCode` في `hint`؛ و23505 = تكرار slug
    const hint = typeof res.error?.hint === "string" && res.error.hint !== "" ? res.error.hint : null;
    const code = hint ?? (res.error?.code === "23505" ? "exists" : "save");
    redirect(`/admin/content/new?error=${code}`);
  }

  revalidatePath("/", "layout");
  // صفحة الهبوط تُبنى بالكتل، فوجهتها المنشئ لا المحرر القديم
  redirect(
    kind === "landing"
      ? `/admin/content/${res.data.id}/builder?saved=1`
      : `/admin/content/${res.data.id}?saved=1`
  );
}
