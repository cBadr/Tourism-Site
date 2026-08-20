import type { Metadata } from "next";
import type { ReactNode } from "react";
import { headers } from "next/headers";
import { redirect } from "next/navigation";

import { ThemeToggleMenu } from "@/components/site/theme-toggle";
import { getSettings } from "@/lib/settings";
import { createServerSupabase } from "@/lib/supabase/server";
import { AdminShell } from "./_components/admin-shell";

/**
 * غلاف مجموعة مسارات الإدارة `/admin`.
 *
 * (١) حارس الدور — أُضيف في المرحلة ٥: قبلها لم يكن في المنصة إلا حسابات
 *     مشرفين، فكان «وجود جلسة» كافياً في `proxy.ts`. ومع بورتال المتعهدين
 *     صارت هناك جلسات غير إدارية، ولو مرّت من هنا لرأى المتعهد شاشة الهامش
 *     وملفه الإداري بما فيه ملاحظات الإدارة الخاصة عنه. الحارس في الطبقة
 *     الخادمية لا في الوسيط لأن الوسيط لا يقرأ الدور من قاعدة البيانات.
 *
 * (٢) اسم العلامة من الإعدادات (انضباط الـ Whitelabel)، وصفحتا الدخول وتعيين
 *     كلمة المرور تُعرضان داخل الغلاف نفسه بلا شريط جانبي ولا حارس.
 *
 * (٣) لوحُ المظهر (م‑٩ب) — **نسخةٌ واحدة** من مبدّل الموقع العام لا ثانيةٌ له
 *     (القاعدة ١٢). ويُصيَّر هنا لا في `AdminShell` لأن الأخير `"use client"`
 *     والمبدّل خادميٌّ يقرأ الكوكي. أما **قرار المظهر نفسه** فليس هنا إطلاقاً:
 *     `app/layout.tsx` يحمله على `<body>` فيسري على الأغلفة الثلاثة.
 */

export const metadata: Metadata = {
  title: "لوحة التحكم",
};

/** مسارات المصادقة — لا حارس عليها وإلا استحال تسجيل الدخول أصلاً */
function isAuthPath(pathname: string): boolean {
  return (
    pathname === "/admin/login" ||
    pathname.startsWith("/admin/login/") ||
    pathname === "/admin/set-password" ||
    pathname.startsWith("/admin/set-password/")
  );
}

export default async function AdminLayout({ children }: { children: ReactNode }) {
  const [settings, headerList] = await Promise.all([getSettings(), headers()]);

  // المسار يصل من الوسيط في ترويسة `x-pathname` (يضبطها proxy.ts لكل طلب)؛
  // وعند غيابها نفترض مساراً محمياً — الأحوط أن نفحص لا أن نمرّر.
  const pathname = headerList.get("x-pathname") ?? "/admin";

  if (!isAuthPath(pathname)) {
    const supabase = await createServerSupabase();
    // بلا بيئة Supabase (تطوير محلي قبل الربط) يمر كل شيء كما في الوسيط
    if (supabase) {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (user) {
        const { data: isAdmin } = await supabase.rpc("is_admin");
        if (isAdmin !== true) {
          // متعهد أو حساب عميل وصل إلى اللوحة — وجهته بورتاله لا شاشات الإدارة
          const { data: profile } = await supabase
            .from("profiles")
            .select("role")
            .eq("id", user.id)
            .maybeSingle();
          redirect(profile?.role === "subcontractor" ? "/portal" : "/");
        }
      }
    }
  }

  return (
    <AdminShell brandName={settings.brand.name} themeMenu={<ThemeToggleMenu />}>
      {children}
    </AdminShell>
  );
}
