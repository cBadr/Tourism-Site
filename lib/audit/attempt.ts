import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * تسجيل المحاولة المرفوضة — النصف الثاني من نظام السجلات (الملاحظة ١٥).
 *
 * ── لماذا يوجد هذا الملف أصلاً ─────────────────────────────────────────────
 *
 * سجلّ `audit_log` يكتبه مُشغّل داخل معاملة التغيير، فيثبت معها ويُلغى معها.
 * وهذا صحيح للتغيير المُنفَّذ — لكنه يعني أن **المحاولة المرفوضة لا تُسجَّل
 * أبداً**: الدالة ترفع استثناءً، فيُرجِع الاستثناءُ كلَّ ما كُتب في معاملته
 * ومنه سطر السجل. وهو **D-48** بنصّه: «العدّاد الذي يُكتب في المعاملة نفسها
 * التي ترمي الاستثناء لا وجود له».
 *
 * والمحاولات المرفوضة هي بالضبط ما يريده التدقيق الأمني: من حاول تجاوز سقف
 * دَينه؟ من حاول إسناداً تحت أرضية الهامش؟ من حاول تعديل قيدٍ مجمَّد؟ من طرق
 * باباً ليس له؟ (‏٦١ رفضاً بـ`forbidden` في القاعدة اليوم.)
 *
 * ── القاعدة التي يفرضها هذا الملف على كل مستدعٍ ────────────────────────────
 *
 * 🔒 **يُنادى بعد فشل العملية، في معاملة ثانية — لا داخل `try` معها.**
 * النداء أدناه رحلةٌ مستقلة إلى القاعدة تقع **بعد** أن ارتدّت معاملة العملية،
 * فتثبت وحدها. ومن يضعه داخل نفس المعاملة يكون قد أعاد إنتاج D-48 بيده ولن
 * تُسجَّل محاولة واحدة.
 *
 * 🔒 **ولا يرمي أبداً.** فشلُ التسجيل لا يجوز أن يحجب عن المستخدم رسالةَ الخطأ
 * الحقيقية ولا أن يحوّل رفضاً مفهوماً إلى انهيار. الأثر التدقيقي مهم، ورسالة
 * المالك أهم — نفس منطق `current_actor()` التي تبتلع استثناءها في 0007
 * («الحجز أهم من تسجيل الفاعل»).
 */

/** شكل خطأ PostgREST كما يصل من `supabase.rpc()` */
type RpcError = {
  code?: string | null;
  hint?: string | null;
  message?: string | null;
} | null;

/**
 * سبب الرفض كما يُخزَّن. الأولوية للتلميح لأنه **مفردات المشروع نفسها**
 * (`forbidden` · `debt-limit` · `margin-floor` · `partner-owing` ·
 * `already-assigned` · `illegal-transition` · `immutable-row`) — وهي مفردات
 * مقصودة يقرؤها الكود ويعرضها للمالك، بخلاف رمز SQLSTATE العام.
 */
function reasonOf(error: RpcError): string {
  const hint = (error?.hint ?? "").trim();
  if (hint !== "") return hint;
  const code = (error?.code ?? "").trim();
  if (code !== "") return `sqlstate:${code}`;
  return "unknown";
}

/**
 * يسجّل محاولةً مرفوضة. **يُنادى بعد فشل العملية لا معها.**
 *
 * @param supabase عميل الجلسة نفسه الذي فشلت عليه العملية — كي يبقى الفاعل
 *                 مشتقاً من الجلسة لا مُمرَّراً (وقاعدة «الفاعل لا يُمرَّر»
 *                 هي ما يمنع انتحال التاريخ).
 * @param operation اسم العملية كما يعرفها الكود: `record_partner_payout` …
 * @param error     كائن الخطأ كما وصل من القاعدة
 */
export async function recordRejectedAttempt(
  supabase: SupabaseClient | null,
  operation: string,
  error: RpcError,
  options?: { entity?: string; entityId?: string | null; detail?: string | null }
): Promise<void> {
  if (!supabase) return;

  try {
    await supabase.rpc("record_audit_attempt", {
      p_operation: operation,
      p_reason: reasonOf(error),
      p_entity: options?.entity ?? null,
      p_entity_id: options?.entityId ?? null,
      // رسالة القاعدة عربية ومفهومة، وهي أفضل تفصيل متاح بلا حقول إضافية
      p_detail: options?.detail ?? (error?.message ?? null),
    });
  } catch {
    // صامت بقصد — انظر القاعدة الثانية في ترويسة الملف
  }
}
