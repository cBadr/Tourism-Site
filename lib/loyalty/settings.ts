import "server-only";

import { cache } from "react";

/**
 * راية «نظام الولاء مفعَّل» — الرقم الوحيد الذي يجوز أن يعرفه المتصفح.
 *
 * ── ولماذا مفتاح الخدمة هنا، بخلاف نظيرتها في الخصومات ────────────────────
 *
 * `isDiscountEnabled` تقرأ `discount_enabled()` بعميل anon، لأن 0024 أفردت
 * **دالتين**: `discount_config()` بكل الأرقام لـ`service_role`، و
 * `discount_enabled()` رايةً عاريةً لـ anon. أما 0047 فأفردت **دالةً واحدة**:
 * `loyalty_config()` — ممنوحة لـ`service_role` وحده (قِيس على القاعدة الحيّة).
 *
 * فلا سبيل إلى الراية إلا عبرها، ولذلك تُقرأ هنا بمفتاح الخدمة **ولا يعبر منها
 * إلى المتصفح إلا `enabled`**. وبقيةُ الصف — `currency_per_point` و
 * `max_redeem_percent` و`min_redeem_points` — تصف سياسة التنزيل ولا يقرؤها
 * أحدٌ في هذه الوحدة أصلاً: الدالة تُرجع `boolean` لا كائناً، فلا يوجد مكانٌ
 * يتسرّب منه رقم ولو أضاف مستدعٍ سطراً غداً (أمانٌ بنيوي لا انضباطي).
 *
 * ⚠ **وهذا فرقٌ يستحق التوحيد يوماً**: رايةٌ عارية ممنوحة لـ anon
 * (‏`loyalty_enabled()`) كانت ستُغني عن مفتاح الخدمة في مسارٍ عامٍّ ساخن، وهي
 * سطران في هجرة. مذكورةٌ هنا كي لا تُنسى، ومقروءةٌ اليوم كما هي القاعدة فعلاً.
 *
 * ── والغياب يعني مطفأ ─────────────────────────────────────────────────────
 *
 * بيئةٌ ناقصة أو هجرةٌ لم تُطبَّق أو عطلٌ في الشبكة — كلها `false`. والافتراضي
 * هو ما سيعمل في الإنتاج (النمط ٧ في `handover/LESSONS.md`)، وبذرة الولاء نفسها
 * `enabled = false` بنصّ العقد الأم: «لا نظام ولاء يبدأ بلا قرار بشري».
 *
 * ⚠ وهي **راية عرضٍ لا حارس**: من عطّل النظام من اللوحة لا يُوقفه هذا السطر بل
 * القاعدة — `apply_points` تردّ `not-enabled` قبل أن تقرأ رصيداً. وظيفة الراية
 * أن تمنع لوحةً تظهر ثم تعتذر، لا أن تمنع إنفاقاً.
 */
export const isLoyaltyEnabled = cache(async (): Promise<boolean> => {
  try {
    const { createServiceSupabase } = await import("@/lib/supabase/admin");
    const supabase = createServiceSupabase();
    if (!supabase) return false;

    const { data, error } = await supabase.rpc("loyalty_config");
    if (error) return false;

    const row = Array.isArray(data) ? data[0] : data;
    if (typeof row !== "object" || row === null) return false;

    // 🔒 حقلٌ واحد يُقرأ، والباقي لا يُلمَس ولا يُعاد
    return (row as Record<string, unknown>).enabled === true;
  } catch {
    return false;
  }
});
