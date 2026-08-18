import "server-only";

import { errorJson, NO_STORE, readJson, type PushApiError } from "@/app/api/push/_shared";
import { checkPerMinute, clientIp } from "@/lib/discounts/rate-limit";
import { createServiceSupabase } from "@/lib/supabase/admin";

/**
 * ما يشترك فيه مسارا `/api/push/customer/*` — الحارسُ وقراءةُ التوكن.
 *
 * ══════════════════════════════════════════════════════════════════════════
 *  🔒 لماذا حارسٌ مستقلٌّ عن `guard()` في `app/api/push/_shared.ts`
 * ══════════════════════════════════════════════════════════════════════════
 *
 * ذاك الحارسُ `portalAccess()` — جلسةُ متعهدٍ **معتمَد**. والعميلُ هنا **زائرٌ
 * بلا حساب** (‏صفرُ حسابِ عميلٍ مسجَّل على القاعدة، و`create_booking` لا تقرأ
 * `auth.uid()` أصلاً). فمفتاحُه الوحيد هو **توكنُ متابعة حجزه** — وهو نفسُه
 * مفتاحُ `/booking/[token]` و`get_booking_by_token`.
 *
 * ولذلك:
 *   • **التحقق من التوكن في القاعدة لا هنا**: `customer_register_push` ترفض
 *     أي توكنٍ لا يطابق حجزاً، فلا نسخةَ ثانية من القاعدة في TypeScript.
 *   • **الخانقُ على العنوان** لا على معرّفٍ من الجلسة (لا جلسةَ أصلاً). وهذا
 *     نفسُ خيار `/track` و`/api/discount/verify` حرفياً — ومداه ما دام العنوان
 *     صادقاً، وهو مكتوبٌ بصراحته في `lib/discounts/rate-limit.ts`.
 *
 * ⚠ **ولا يُعاد إلى المتصفح فرقٌ بين «توكنٌ لا وجود له» و«توكنٌ لغيرك»**: كلاهما
 *   `invalid`. والفرقُ يقول لمن يجرّب إن كان التوكن قائماً.
 */

export { errorJson, NO_STORE, readJson };
export type { PushApiError };

/** حدُّ الطلبات لكل عنوان — الاشتراكُ حدثٌ نادر بطبعه (مرةٌ لكل جهاز) */
export const MAX_PER_MINUTE = 12;

/** أقصى طولِ توكن نقبله قبل أن نمرّره إلى القاعدة — التوكن الحقيقي ٤٨ محرفاً */
const MAX_TOKEN = 200;

export type CustomerGate =
  | { ok: true; token: string; body: Record<string, unknown>; supabase: NonNullable<ReturnType<typeof createServiceSupabase>> }
  | { ok: false; response: Response };

/**
 * يقرأ الجسم، يخنق بالعنوان، ويستخرج التوكن — ولا يسأل القاعدة عن شيء.
 *
 * ⚠ ويعمل بعميل **الخدمة**: الدوالُّ ممنوحةٌ لـ`anon` كذلك، لكن مسار `/api`
 *   بلا كوكيز جلسةٍ يُنتج عميلاً بلا دور واضح — ومفتاحُ الخدمة هنا لا يوسّع
 *   شيئاً لأن الحارسَ الحقيقيَّ داخل الدالة (التوكن)، لا في الدور.
 */
export async function customerGate(request: Request, bucket: string): Promise<CustomerGate> {
  const supabase = createServiceSupabase();
  if (!supabase) return { ok: false, response: errorJson("env", 503) };

  const verdict = checkPerMinute(`push-customer:${bucket}:${clientIp(request)}`, MAX_PER_MINUTE);
  if (!verdict.ok) {
    return {
      ok: false,
      response: errorJson("rate-limited", 429, { "Retry-After": String(verdict.retryAfterSec) }),
    };
  }

  const body = await readJson(request);
  if (!body) return { ok: false, response: errorJson("invalid", 400) };

  const raw = typeof body.token === "string" ? body.token.trim() : "";
  if (raw.length < 32 || raw.length > MAX_TOKEN) {
    return { ok: false, response: errorJson("invalid", 400) };
  }

  return { ok: true, token: raw, body, supabase };
}
