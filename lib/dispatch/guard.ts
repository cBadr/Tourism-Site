import { timingSafeEqual } from "node:crypto";

/**
 * حارس مسارات التشغيل الآلي — **نسخة مطابقة** لحارس
 * `app/api/notifications/dispatch/route.ts` (عقد المرحلة ٤)، مستخرجة هنا لأن
 * المرحلة ٦ تضيف مساراً ثانياً بنفس الشروط بالضبط: مهمة مجدولة تنادي نقطة
 * نهاية على الإنترنت المفتوح، فتحميها كلمة سر مشتركة.
 *
 * المفتاح نفسه (`NOTIFY_DISPATCH_KEY`) لا مفتاح جديد: المالك يضبط سرّاً واحداً
 * لكل مهام النظام المجدولة، وزيادة الأسرار زيادة في فرص الخطأ لا في الأمان.
 * ويُقبل `CRON_SECRET` أيضاً لأن Vercel Cron يرسله في ترويسة `Authorization`.
 *
 * الطرق الثلاث للمصادقة:
 *   1) ترويسة `x-dispatch-key: <السر>`         (الاستدعاء اليدوي و cron-job.org)
 *   2) ترويسة `Authorization: Bearer <السر>`   (Vercel Cron)
 *   3) بلا مفتاح — من localhost وفي التطوير فقط (تجربة المالك على جهازه)
 *
 * المقارنة بزمن ثابت (timingSafeEqual) حتى لا يُستدل على السر من فروق التوقيت.
 * وفي الإنتاج بلا أي مفتاح مضبوط: المسار **مقفل**، لا مفتوح.
 */

export const NO_STORE = { "Cache-Control": "no-store" } as const;

export type DispatchDenial = { code: string; message: string };

function safeEqual(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  if (left.length !== right.length) return false;
  return timingSafeEqual(left, right);
}

/** المفتاح المُرسَل: ترويسة مخصصة أولاً ثم Bearer */
function providedKey(request: Request): string | null {
  const header = request.headers.get("x-dispatch-key");
  if (header && header.trim() !== "") return header.trim();

  const auth = request.headers.get("authorization");
  if (auth && /^bearer\s+/i.test(auth)) {
    const value = auth.replace(/^bearer\s+/i, "").trim();
    if (value !== "") return value;
  }
  return null;
}

/** طلب محلي في وضع التطوير — الاستثناء الوحيد لغياب المفتاح */
function isLocalDevRequest(request: Request): boolean {
  if (process.env.NODE_ENV === "production") return false;
  const host = (request.headers.get("host") ?? "").toLowerCase();
  const name = host.split(":")[0];
  return name === "localhost" || name === "127.0.0.1" || name === "[::1]" || name === "::1";
}

export function authorizeDispatchRequest(request: Request): DispatchDenial | null {
  const secrets = [process.env.NOTIFY_DISPATCH_KEY, process.env.CRON_SECRET]
    .map((s) => s?.trim())
    .filter((s): s is string => Boolean(s));

  const provided = providedKey(request);
  if (secrets.length > 0 && provided && secrets.some((secret) => safeEqual(provided, secret))) {
    return null;
  }

  if (isLocalDevRequest(request)) return null;

  if (secrets.length === 0) {
    return {
      code: "not-configured",
      message:
        "دورة البث مقفلة: اضبط NOTIFY_DISPATCH_KEY في متغيرات البيئة ثم أرسل قيمته في ترويسة x-dispatch-key.",
    };
  }
  return { code: "unauthorized", message: "مفتاح تشغيل دورة البث غير صحيح." };
}

export function dispatchDenied(denial: DispatchDenial): Response {
  return Response.json({ ok: false, ...denial }, { status: 401, headers: NO_STORE });
}
