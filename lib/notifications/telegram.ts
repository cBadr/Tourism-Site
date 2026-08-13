import type { SendOutcome } from "@/lib/notifications/types";

/**
 * قناة تليجرام — إرسال رسالة واحدة عبر Bot API.
 *
 * التوكن سرّ خادمي بحت: `TELEGRAM_BOT_TOKEN` في البيئة، ولا يُخزَّن في قاعدة
 * البيانات ولا يبدأ باسم NEXT_PUBLIC_ إطلاقاً. وجهة الإرسال (chat id) تُدار من
 * شاشة الإعدادات لأنها ليست سرّاً وقد يغيّرها المالك بين مجموعة وأخرى.
 *
 * انضباط التدهور الرشيق: غياب التوكن أو الوجهة **ليس خطأ** — يرجع «متجاوَز»
 * بسبب واضح فيسجّله العامل في صف الإشعار وتعرضه شاشة الإشعارات، ويبقى الموقع
 * كله يعمل بلا أي بيانات اعتماد. لا استثناء يخرج من هذه الدالة أبداً.
 */

const API_BASE = "https://api.telegram.org";
const TIMEOUT_MS = 8000;
/** حد تليجرام لرسالة واحدة ٤٠٩٦ حرفاً — نقصّ قبله بهامش أمان */
const MAX_TEXT_LENGTH = 3900;

export function hasTelegramCredentials(): boolean {
  return Boolean(process.env.TELEGRAM_BOT_TOKEN);
}

export async function sendTelegram(
  chatId: string | null | undefined,
  text: string
): Promise<SendOutcome> {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) return { ok: false, skipped: "no-credentials" };

  const target = typeof chatId === "string" ? chatId.trim() : "";
  if (!target) return { ok: false, skipped: "no-recipient" };

  const body = {
    chat_id: target,
    text: text.length > MAX_TEXT_LENGTH ? `${text.slice(0, MAX_TEXT_LENGTH)}…` : text,
    parse_mode: "HTML",
    // لا معاينة روابط: رابط المتابعة يجرّ بطاقة تُشتت الرسالة في مجموعة التشغيل
    link_preview_options: { is_disabled: true },
  };

  try {
    const res = await fetch(`${API_BASE}/bot${token}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(TIMEOUT_MS),
      cache: "no-store",
    });

    // Bot API يرجع 200 مع ok=false أحياناً، لذلك نقرأ الجسم دائماً
    const json = (await res.json().catch(() => null)) as
      | { ok?: boolean; description?: string; error_code?: number }
      | null;

    if (res.ok && json?.ok === true) return { ok: true };

    const description = json?.description ?? `HTTP ${res.status}`;
    return { ok: false, error: `telegram: ${description}` };
  } catch (err) {
    const reason =
      err instanceof Error && err.name === "TimeoutError"
        ? `انتهت المهلة بعد ${TIMEOUT_MS / 1000} ثوانٍ`
        : err instanceof Error
          ? err.message
          : "خطأ غير معروف";
    return { ok: false, error: `telegram: ${reason}` };
  }
}
