import "server-only";

import { createHash } from "node:crypto";
import { headers } from "next/headers";

import { clientIp } from "@/lib/discounts/rate-limit";

/**
 * البصمة المجهولة التي تصل القاعدة في `p_client_key` — **نسخة واحدة يقرأها كل
 * سطحٍ يبحث بمرجع وهاتف**.
 *
 * كانت تعيش داخل `app/track/actions.ts` وحدها حين كان السطح واحداً. ثم جاءت
 * المرحلة ١٢ب بسطحٍ ثانٍ («أضِف حجزاً سابقاً» في `/account/bookings`) يفوّض إلى
 * الدالة المُصلَّبة نفسها — ونسخُ عشرين سطراً فيها **ترتيبُ ملحٍ أمنيٌّ** يعني
 * نسختين تنحرفان يوم يُصحَّح الأصل. فالقاعدة ١٢ حرفياً: فوِّض ولا تستنسخ.
 *
 * ولا يمكن استيرادها من ملف `"use server"`: كل صادراته يجب أن تكون دوالَّ
 * غير متزامنة تصير نقاطَ إجراء حقيقية، فالمكان الطبيعي وحدةٌ مشتركة — وهذه هي.
 */

/**
 * عنوان الزائر — من `clientIp` وحدها، ولا نسخة ثانية من ترتيب الترويسات هنا.
 *
 * تلك الدالة تأخذ `Request` والإجراء الخادمي لا يملك واحداً؛ يملك ترويسات الطلب
 * الجاري وحدها. فنمرّر غلافاً يحمل `headers` بدل إعادة كتابة الترتيب (منصة ←
 * وسيط ← **آخر** عنصر في `x-forwarded-for`) نسخةً ثانية تنحرف يوم يُصحَّح الأصل.
 * وذلك الترتيب هو بيت القصيد: النسخة الساذجة في `app/api/quote-request/route.ts`
 * تأخذ **أول** عنصر في السلسلة، وهو ما يكتبه العميل ⇒ خانق يُدار بتدوير ترويسة.
 */
export async function requestIp(): Promise<string> {
  try {
    const list = await headers();
    return clientIp({ headers: list } as unknown as Request);
  } catch {
    // خارج سياق طلب (لا يقع عملياً في إجراء نموذج) — دلو مشترك أضيق لا أوسع
    return "unknown";
  }
}

/**
 * بصمة مجهولة للعميل — هذا وحده ما يصل القاعدة.
 *
 * ⚠ **ترتيب الاحتياطيات ليس تجميلاً.** الملح الصريح `LOOKUP_SALT` أولاً، ثم
 * **مفتاح الخدمة** — وهو سرٌّ خادميّ لا يخرج إلى حزمة المتصفح أبداً. ولا يصح
 * السقوط على `NEXT_PUBLIC_SUPABASE_URL`: قيمةٌ **علنية** تُقرأ من أي صفحة، وملحٌ
 * منشور يجعل البصمة قابلة للعكس بتجربة فضاء IPv4 كله (٤ مليارات) — فيصير جدول
 * المحاولات سجلَّ عناوين، وهو نقضٌ لما يَعِد به تعليق الجدول نفسه في الهجرة.
 * والسقوط الأخير قيمة ثابتة: بيئةٌ بلا سرّ واحد ليست بيئة إنتاج بحال.
 */
export function fingerprint(ip: string): string {
  const salt =
    process.env.LOOKUP_SALT ??
    process.env.SUPABASE_SERVICE_ROLE_KEY ??
    "tours-lookup";
  return createHash("sha256").update(`${ip}:${salt}`, "utf8").digest("hex").slice(0, 32);
}

/** بصمة الطلب الجاري — الشكل الذي يستعمله كل منادٍ فعلاً */
export async function requestClientKey(): Promise<string> {
  return fingerprint(await requestIp());
}
