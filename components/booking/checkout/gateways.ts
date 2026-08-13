import "server-only";

import { isPaymentProvider } from "@/lib/payments/registry";
import { createServiceSupabase } from "@/lib/supabase/admin";

/**
 * قراءة بوابات الدفع المفعّلة لعرضها على العميل (المرحلة ٩).
 *
 * ثلاثة قرارات تحكم هذه القراءة:
 *
 * (١) **البوابات إضافة لا بديل.** التحويل اليدوي (المحفظة وانستا باي) هو المسار
 *     الأصلي ويبقى متاحاً دائماً. غياب الجدول أو خطأ القراءة أو صفر بوابات
 *     مفعّلة ⇒ مصفوفة فارغة ⇒ صفحة الحجز كما كانت حرفاً بحرف. لا رمي ولا انهيار:
 *     عميلٌ يرى التحويل اليدوي وحده أفضل من صفحة لا تُعرض.
 *
 * (٢) **عميل الخدمة لا عميل الزائر.** هجرة ٠٠٢٠ لا تمنح `anon` حرفاً على
 *     `payment_providers` (القراءة محصورة بـ `is_admin()`)، فقراءة الزائر تفشل
 *     دائماً. والصفحة خادمية، فتقرأ بمفتاح الخدمة **أربعة أعمدة غير سرّية**:
 *     الرمز والاسم الظاهر ووضع الاختبار والترتيب. `public_config` غير مقروء
 *     أصلاً — صفحة العميل لا تحتاج معرّف تاجر، والمحوّل في الخادم هو من يبني
 *     الجلسة. وغياب مفتاح الخدمة يعني صفر بوابات لا خطأً.
 *
 * (٣) **لا افتراضيات هنا.** `readProviderSettings` في `lib/payments/settings.ts`
 *     تسقط على `DEFAULT_PROVIDERS` عند تعذّر القراءة — وهو سلوك صحيح لمسار
 *     الخادم، وخاطئ أمام عميل: كان سيعرض بوابة «مفعّلة» على قاعدة لم تُهاجَر،
 *     فيضغط العميل «ادفع» ويصطدم بـ ٥٠٣. هنا الصمت أصدق: ما لا نقرؤه لا نعرضه.
 */

/** صف بوابة مفعّلة كما تقرأه صفحة متابعة الحجز */
export type GatewayRow = {
  provider: string;
  /** الاسم الظاهر كما كتبه المشرف — يُترجم عبر مساحة `payment` قبل العرض */
  label: string;
  sandbox: boolean;
  sort: number;
};

const asText = (value: unknown): string | null =>
  typeof value === "string" && value.trim() !== "" ? value.trim() : null;

const asNumber = (value: unknown): number | null => {
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};

/** البوابات المفعّلة مرتّبةً بترتيب اللوحة — ومصفوفة فارغة عند أي تعذّر */
export async function readEnabledGateways(): Promise<GatewayRow[]> {
  const supabase = createServiceSupabase();
  if (!supabase) return [];

  try {
    const { data, error } = await supabase
      .from("payment_providers")
      .select("provider, label, sandbox, sort")
      .eq("enabled", true)
      .order("sort", { ascending: true });

    if (error) return [];

    return (Array.isArray(data) ? data : [])
      .map((entry) => {
        const row = entry as Record<string, unknown>;
        const provider = asText(row.provider) ?? "";
        return {
          provider,
          label: asText(row.label) ?? provider,
          sandbox: row.sandbox === true,
          sort: asNumber(row.sort) ?? 0,
        };
      })
      // رمز بلا محوّل في السجل لا يُعرض: زر يقود إلى ٤٠٠ ليس خياراً
      .filter((row) => isPaymentProvider(row.provider));
  } catch {
    return [];
  }
}
