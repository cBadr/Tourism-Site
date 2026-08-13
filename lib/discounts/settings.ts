import "server-only";

import { cache } from "react";
import {
  DEFAULT_DISCOUNT_SETTINGS,
  type DiscountSettings,
} from "@/lib/discount-types";

/**
 * قارئا إعدادات نظام الخصومات — دالتان في القاعدة لا مفتاح في `site_settings`.
 *
 * ── لماذا ليست في `site_settings` ─────────────────────────────────────────
 * هجرة 0024 وضعت الإعدادات في جدول `discount_settings` مستقل، وسببها مكتوب في
 * ترويستها: `site_settings` **مقروء علناً بالكامل** (سياسة
 * `site_settings_select_public` من 0001 تعطي anon ‏`using (true)`)، و
 * `min_margin_percent_after_discount` يكشف سياسة هامش الموقع — وهو بالضبط ما
 * أغلقته 0011 حين سحبت أعمدة الهامش عن كل دور مستخدم. فلا مفتاح إعدادات هنا.
 *
 * ── دالتان لا واحدة، وهذا هو بيت القصيد ───────────────────────────────────
 *   `discount_config()`  — كل الأرقام، **ممنوحة لـ `service_role` وحده**.
 *                          يستدعيها مسار التحقق من الخادم ليقرأ حدّ المعدّل.
 *   `discount_enabled()` — رايةٌ واحدة بلا رقم، ممنوحة لـ anon وauthenticated.
 *                          هي كل ما تحتاجه الصفحة العامة لتقرر إظهار حقل الكوبون.
 *
 * أي عطل أو غياب بيئة ⇒ `DEFAULT_DISCOUNT_SETTINGS` وهي `enabled: false`
 * (القرار ١٠). الفشل يقع مغلقاً: قاعدة غير مهيأة تعني «لا خصومات» لا
 * «خصومات بلا حدود».
 */

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** رقم منتهٍ وغير سالب — وما عداه يسقط إلى الافتراضي */
function readNumber(source: Record<string, unknown>, key: string, fallback: number): number {
  const value = source[key];
  const parsed = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) return fallback;
  return parsed;
}

const loadDiscountSettings = cache(async (): Promise<DiscountSettings> => {
  try {
    const { createServiceSupabase } = await import("@/lib/supabase/admin");
    const supabase = createServiceSupabase();
    if (!supabase) return DEFAULT_DISCOUNT_SETTINGS;

    const { data, error } = await supabase.rpc("discount_config");
    if (error) return DEFAULT_DISCOUNT_SETTINGS;

    const row = Array.isArray(data) ? data[0] : data;
    if (!isRecord(row)) return DEFAULT_DISCOUNT_SETTINGS;

    return {
      enabled: row.enabled === true,
      maxPercent: readNumber(row, "max_percent", DEFAULT_DISCOUNT_SETTINGS.maxPercent),
      minMarginPercentAfterDiscount: readNumber(
        row,
        "min_margin_percent_after_discount",
        DEFAULT_DISCOUNT_SETTINGS.minMarginPercentAfterDiscount
      ),
      minMarginAmountAfterDiscount: readNumber(
        row,
        "min_margin_amount_after_discount",
        DEFAULT_DISCOUNT_SETTINGS.minMarginAmountAfterDiscount
      ),
      verifyRateLimitPerMinute: readNumber(
        row,
        "verify_rate_limit_per_minute",
        DEFAULT_DISCOUNT_SETTINGS.verifyRateLimitPerMinute
      ),
    };
  } catch {
    return DEFAULT_DISCOUNT_SETTINGS;
  }
});

/**
 * إعدادات الخصم كاملة — **للخادم وحده، ولا يُمرَّر منها رقم إلى المتصفح**.
 * `maxPercent` و`minMargin*` أرقام تصف سياسة الهامش؛ وجودها في هذا الكائن لأن
 * العقد يعرّفه هكذا، لا لأن للواجهة حاجة بها.
 */
export const getDiscountSettings = loadDiscountSettings;

/**
 * هل نظام الخصومات مفعَّل؟ — الرقم الوحيد الذي يجوز أن يعرفه المتصفح.
 *
 * تُقرأ بعميل الخادم العادي (anon) لا بمفتاح الخدمة: `discount_enabled()`
 * ممنوحة لـ anon أصلاً، ولا سبب لاستعمال مفتاح يتجاوز RLS لقراءة راية عامة.
 * والغياب أو العطل يعني «مطفأ» — فلا يظهر حقل كوبون على قاعدة غير مهيأة.
 */
export const isDiscountEnabled = cache(async (): Promise<boolean> => {
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) {
    return false;
  }
  try {
    const { createServerSupabase } = await import("@/lib/supabase/server");
    const supabase = await createServerSupabase();
    if (!supabase) return false;

    const { data, error } = await supabase.rpc("discount_enabled");
    if (error) return false;

    const value = Array.isArray(data) ? data[0] : data;
    return value === true;
  } catch {
    return false;
  }
});
