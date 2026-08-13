import type { SendOutcome } from "@/lib/notifications/types";

/**
 * قناة البريد — إرسال عبر Resend REST مباشرة (بلا حزمة إضافية: قيد «لا تعديل
 * على package.json» قائم، وواجهة Resend مكالمة HTTP واحدة لا تستحق اعتماداً).
 *
 * المفتاح `RESEND_API_KEY` سرّ خادمي. عنوان المُرسِل من `NOTIFY_EMAIL_FROM`
 * ويرجع افتراضياً إلى نطاق Resend التجريبي `onboarding@resend.dev` الذي يعمل
 * فوراً بلا توثيق نطاق — يصلح للتجربة فقط، والإنتاج يحتاج نطاقاً موثّقاً.
 *
 * نفس دلالات التجاوز في قناة تليجرام: غياب المفتاح أو الوجهة ليس خطأ.
 * لا استثناء يخرج من هذه الدالة أبداً.
 */

const API_URL = "https://api.resend.com/emails";
const TIMEOUT_MS = 8000;
const DEFAULT_FROM = "onboarding@resend.dev";

export function hasEmailCredentials(): boolean {
  return Boolean(process.env.RESEND_API_KEY);
}

/** عنوان المُرسِل الفعلي — يظهر للمالك في بطاقة حالة القنوات */
export function emailFrom(): string {
  const configured = process.env.NOTIFY_EMAIL_FROM?.trim();
  return configured && configured !== "" ? configured : DEFAULT_FROM;
}

export async function sendEmail(
  to: string | null | undefined,
  subject: string,
  html: string
): Promise<SendOutcome> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) return { ok: false, skipped: "no-credentials" };

  const target = typeof to === "string" ? to.trim() : "";
  if (!target) return { ok: false, skipped: "no-recipient" };

  try {
    const res = await fetch(API_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: emailFrom(),
        // يقبل الحقل قائمة — نسمح بأكثر من مستلم مفصولين بفاصلة من الإعدادات
        to: target.split(",").map((one) => one.trim()).filter(Boolean),
        subject,
        html,
      }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
      cache: "no-store",
    });

    const json = (await res.json().catch(() => null)) as
      | { id?: string; message?: string; name?: string; error?: { message?: string } }
      | null;

    if (res.ok && json?.id) return { ok: true, detail: json.id };

    const description =
      json?.error?.message ?? json?.message ?? json?.name ?? `HTTP ${res.status}`;
    return { ok: false, error: `email: ${description}` };
  } catch (err) {
    const reason =
      err instanceof Error && err.name === "TimeoutError"
        ? `انتهت المهلة بعد ${TIMEOUT_MS / 1000} ثوانٍ`
        : err instanceof Error
          ? err.message
          : "خطأ غير معروف";
    return { ok: false, error: `email: ${reason}` };
  }
}
