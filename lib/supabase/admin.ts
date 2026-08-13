import { createClient, type SupabaseClient } from "@supabase/supabase-js";

/**
 * عميل الخدمة (service_role) — للخادم فقط: يتجاوز RLS بالكامل.
 * يُستخدم حصراً في مهام النظام الداخلية (كاش المسافات والجيوكودنج، المهام المجدولة).
 * ممنوع استيراده من أي مكوّن عميل — وجود "server-only" يضمن ذلك وقت البناء.
 */
import "server-only";

let cached: SupabaseClient | null | undefined;

export function createServiceSupabase(): SupabaseClient | null {
  if (cached !== undefined) return cached;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  cached =
    url && key
      ? createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } })
      : null;
  return cached;
}
