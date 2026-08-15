import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import {
  PROVIDER_ENV,
  type NotificationProviderRow,
  type ProviderChannel,
} from "@/lib/partner-alerts-types";

/**
 * جاهزية المزوّدين — الجسر الوحيد بين `process.env` وقاعدة البيانات.
 *
 * ── لماذا يوجد هذا الملف ────────────────────────────────────────────────────
 *
 * القاعدة تحسب **حالة إتاحة المتعهد** (بالغٌ × راغب)، وحوض البث يتخطّى غير
 * المتاح. لكن «بالغ» يستلزم أن يكون للقناة **مزوّدٌ يعمل** — وهذا لا تعرفه
 * القاعدة: `RESEND_API_KEY` و`TELEGRAM_BOT_TOKEN` و`VAPID_*` كلها في البيئة.
 *
 * فلو حسبت القاعدةُ البريدَ قناةً بالغة بمجرّد وجود عنوان، لأعلنت متعهداً
 * «متاحاً» وهو **لا يسمع شيئاً**، ولتخطّى البثُّ من يسمع فعلاً لصالحه.
 *
 * 🔒 **القيمة مقيسة لا مُدخَلة**: لا شاشة تكتب هذا الجدول ولا مفتاح في اللوحة
 * يقلبه. تُقاس من البيئة على كل دورة عامل، فمفتاحٌ يُضاف غداً يقلب الصف بلا
 * هجرة ولا نشر — ومفتاحٌ يُسحب يقلبه في الاتجاه الآخر خلال دورة واحدة.
 */

/** ما ينقص من البيئة لهذه القناة — مصفوفة فارغة تعني جاهزة */
export function missingEnvFor(channel: ProviderChannel): string[] {
  return PROVIDER_ENV[channel].filter((name) => {
    const value = process.env[name];
    return typeof value !== "string" || value.trim() === "";
  });
}

export function isProviderReady(channel: ProviderChannel): boolean {
  return missingEnvFor(channel).length === 0;
}

/** القياس الكامل للقنوات الثلاث، جاهزاً للكتابة أو للعرض */
export function measureProviders(): Omit<NotificationProviderRow, "updated_at">[] {
  return (Object.keys(PROVIDER_ENV) as ProviderChannel[]).map((channel) => {
    const missing = missingEnvFor(channel);
    return { channel, ready: missing.length === 0, missing_env: missing };
  });
}

/**
 * مزامنة ما قِيس إلى القاعدة.
 *
 * **لا ترمي أبداً** — تُنادى من داخل دورة العامل، وانهيارها يوقف طابور
 * الإشعارات كله بسبب جدولٍ مساعد. وترجع `false` بصمت ليظهر ذلك في الملخّص.
 *
 * ⚠ وحين تفشل، القاعدة تحتفظ بآخر قيمة **مقيسة**، لا بقيمة متفائلة: الجدول
 * يبدأ من `ready = false` للثلاث (بذرة الهجرة)، فالفشل يُبقي القنوات مطفأة —
 * والاحتياطي يوقظ التشغيل بدل أن يبتلع العرض.
 */
export async function syncProviderReadiness(supabase: SupabaseClient): Promise<boolean> {
  try {
    const rows = measureProviders().map((row) => ({
      ...row,
      updated_at: new Date().toISOString(),
    }));
    const res = await supabase
      .from("notification_providers")
      .upsert(rows, { onConflict: "channel" })
      .select("channel");
    // فخ الصفوف الصفرية: نجاح ظاهري بصفر صفوف = الكتابة لم تحدث
    return !res.error && (res.data?.length ?? 0) === rows.length;
  } catch {
    return false;
  }
}
