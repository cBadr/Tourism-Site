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
const ALLOWED_KINDS = ["corridor", "static"] as const;

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

  // تُنشأ كمسودة — تُنشر من المحرر أو من زر النشر في القائمة بعد اكتمال أقسامها
  const res = await supabase
    .from("pages")
    .insert({ slug, kind, title, published: false })
    .select("id")
    .single();

  if (res.error || !res.data) {
    // 23505 = unique_violation على slug — رسالة أوضح من فشل الحفظ العام
    const code = res.error?.code === "23505" ? "exists" : "save";
    redirect(`/admin/content/new?error=${code}`);
  }

  revalidatePath("/", "layout");
  redirect(`/admin/content/${res.data.id}?saved=1`);
}
