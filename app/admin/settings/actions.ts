"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createServerSupabase } from "@/lib/supabase/server";

/**
 * حفظ إعدادات الموقع — يكتب مفاتيح النموذج الستة في `site_settings` دفعة واحدة.
 * (المفتاح السادس `notifications` أُضيف في المرحلة ٤؛ مفتاح `payment` تُحرّره
 *  شاشة «حسابات الدفع» `/admin/payment-accounts` ولا يمسّه هذا النموذج.)
 * اتفاقية «إعادة التوجيه بعد العملية» (اعتبار ٨): النجاح والفشل كلاهما redirect
 * برسالة في الـ query string تعرضها الصفحة كتنبيه.
 * فخ RLS المعروف: upsert ينجح بصفر صفوف عند رفض السياسة — لذلك نفحص `.select()`.
 */
export async function saveSettings(formData: FormData) {
  const supabase = await createServerSupabase();
  if (!supabase) redirect("/admin/settings?error=env");

  const s = (name: string): string | null => {
    const v = formData.get(name);
    return typeof v === "string" && v.trim() !== "" ? v.trim() : null;
  };

  const brandName = s("brand.name");
  if (!brandName) redirect("/admin/settings?error=name");

  const rows = [
    {
      key: "brand",
      value: {
        name: brandName,
        tagline: s("brand.tagline") ?? "",
        logoUrl: s("brand.logoUrl"),
        colors: {
          primary: s("brand.colors.primary") ?? "oklch(0.45 0.15 250)",
          primaryForeground: s("brand.colors.primaryForeground") ?? "oklch(0.985 0 0)",
          accent: s("brand.colors.accent") ?? "oklch(0.75 0.15 85)",
        },
      },
    },
    {
      key: "contact",
      value: {
        phone: s("contact.phone"),
        whatsapp: s("contact.whatsapp"),
        telegram: s("contact.telegram"),
        email: s("contact.email"),
      },
    },
    {
      key: "socials",
      value: {
        facebook: s("socials.facebook"),
        x: s("socials.x"),
        linkedin: s("socials.linkedin"),
        github: s("socials.github"),
        instagram: s("socials.instagram"),
      },
    },
    {
      key: "company",
      value: {
        legalName: s("company.legalName"),
        activity: s("company.activity") ?? "",
      },
    },
    {
      key: "seo",
      value: {
        titleTemplate: s("seo.titleTemplate") ?? `%s | ${brandName}`,
        defaultDescription: s("seo.defaultDescription") ?? "",
      },
    },
    {
      // وجهات الإشعارات فقط — لا مفاتيح سرّية هنا إطلاقاً: توكن بوت تليجرام
      // ومفتاح مزوّد البريد يبقيان في متغيرات البيئة (راجع docs/NOTIFICATIONS.md)
      key: "notifications",
      value: {
        telegramChatId: s("notifications.telegramChatId"),
        // مربع اختيار غير مؤشَّر لا يُرسل أصلاً — الغياب يعني «مطفأ»
        telegramEnabled: formData.get("notifications.telegramEnabled") != null,
        emailTo: s("notifications.emailTo"),
        emailEnabled: formData.get("notifications.emailEnabled") != null,
      },
    },
  ];

  const { data, error } = await supabase
    .from("site_settings")
    .upsert(rows, { onConflict: "key" })
    .select("key");

  // صفر صفوف مع نجاح ظاهري = RLS رفضت الكتابة (المستخدم ليس admin)
  if (error || !data || data.length === 0) redirect("/admin/settings?error=save");

  revalidatePath("/", "layout");
  redirect("/admin/settings?saved=1");
}
