import { createBrowserClient } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * عميل Supabase للمتصفح (Client Components).
 * Singleton على مستوى الوحدة: نفس النسخة تُعاد في كل استدعاء داخل الجلسة.
 * يرجع null عندما تكون متغيرات البيئة غير مضبوطة — على المكوّن التعامل مع ذلك.
 */
let browserClient: SupabaseClient | null = null;

export function createBrowserSupabase(): SupabaseClient | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anonKey) return null;

  if (!browserClient) {
    browserClient = createBrowserClient(url, anonKey);
  }
  return browserClient;
}
