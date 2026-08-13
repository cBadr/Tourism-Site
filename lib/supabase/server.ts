import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * عميل Supabase للمكوّنات الخادمية (Server Components / Route Handlers).
 * يرجع null عندما تكون متغيرات البيئة غير مضبوطة — الموقع يعمل حينها
 * بالقيم الافتراضية من lib/site-config.ts بلا أي انهيار.
 *
 * ملاحظة Next 16: cookies() أصبحت async لذلك الدالة كلها async.
 * يُنشأ عميل جديد لكل طلب — لا تشاركه بين الطلبات أبداً.
 */
export async function createServerSupabase(): Promise<SupabaseClient | null> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anonKey) return null;

  const cookieStore = await cookies();

  return createServerClient(url, anonKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          for (const { name, value, options } of cookiesToSet) {
            cookieStore.set(name, value, options);
          }
        } catch {
          // استدعاء من Server Component: الكتابة في الكوكيز غير متاحة هنا.
          // تجديد الجلسة يتكفل به middleware عند إضافته (مرحلة لاحقة).
        }
      },
    },
  });
}
