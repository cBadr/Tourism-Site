import "server-only";

import { encryptPushPayload } from "@/lib/push/encrypt";
import { encodePushPayload } from "@/lib/push/payload";
import type { PushPayload, PushSendOutcome, PushTarget } from "@/lib/push/types";
import { loadVapid, vapidAuthorization } from "@/lib/push/vapid";

/**
 * إرسالٌ واحد إلى جهازٍ واحد.
 *
 * ── انضباط التدهور الرشيق — نفس انضباط `lib/notifications/telegram.ts` ─────
 *
 * **لا استثناء يخرج من هذه الدالة أبداً.** غياب المفاتيح ليس خطأ بل «متجاوَز»
 * بسببٍ صريح، وموتُ الاشتراك ليس خطأ بل أمرٌ بالحذف. والفرق بين الثلاثة هو ما
 * يقرّر ماذا يفعل الطابور: ينتظر مفتاحاً · يعيد المحاولة · يحذف صفّاً.
 *
 * ── 🔒 والحارس الذي قد لا يبدو ضرورياً: وجهةُ الطلب ───────────────────────
 *
 * `endpoint` قيمةٌ **يكتبها المتصفح** ونخزّنها كما هي، ثم يرسل خادمُنا إليها
 * طلب POST. أي أن أي متعهدٍ مسجَّل الدخول يستطيع — نظرياً — أن يجعل خادمنا
 * ينادي عنواناً يختاره هو، ومنه عناوين الشبكة الداخلية التي لا تصلها الإنترنت
 * (`169.254.169.254` وما شابهها في أي مستضيف). فالمنعُ هنا بنيوي: **HTTPS
 * وحدها، ولا مضيفٍ محلي ولا عنوان IP حرفي**. وخدماتُ الدفع الحقيقية كلها
 * نطاقاتٌ عامة على HTTPS، فالحارس لا يمنع حالةً مشروعة واحدة.
 */

const TIMEOUT_MS = 10_000;

/** بقاء الرسالة في طابور خدمة الدفع إن كان الجهاز مطفأً — ساعتان */
const DEFAULT_TTL_SECONDS = 2 * 60 * 60;

/**
 * عناوين لا يُرسَل إليها مهما قال الصف.
 *
 * ⚠ وهذا فحصٌ نصّي على المضيف لا على ما يحلّه DNS — فهو يمنع **الشكل المباشر**
 * لا كلَّ تحايلٍ ممكن. والحارس الحقيقي أن `endpoint` لا يصل الجدول إلا عبر
 * `/api/push/subscribe` وقد فحصه هناك أولاً؛ وهذا الفحصُ الثاني لأن الصف قد
 * يكون أقدم من الحارس الأول.
 */
function isAllowedEndpoint(endpoint: string): boolean {
  let url: URL;
  try {
    url = new URL(endpoint);
  } catch {
    return false;
  }
  if (url.protocol !== "https:") return false;

  const host = url.hostname.toLowerCase();
  if (host === "localhost" || host.endsWith(".localhost") || host.endsWith(".local")) return false;
  // عنوان IP حرفي (رباعي أو سداسي عشري بين قوسين): لا خدمة دفع حقيقية تستعمله
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(host)) return false;
  if (host.startsWith("[")) return false;
  // مضيفٌ بلا نقطة = اسمٌ داخلي على الشبكة نفسها
  if (!host.includes(".")) return false;

  return true;
}

export type SendOptions = {
  /** كم تحتفظ الخدمة بالرسالة إن كان الجهاز مطفأً */
  ttlSeconds?: number;
  /**
   * `high` لعرض الرحلة (يوقظ الجهاز)، و`normal` لما دونه. والإلحاح ليس زخرفة:
   * أندرويد يؤجّل رسائل `normal` في وضع توفير الطاقة إلى نافذة الصيانة التالية
   * — وقد تكون بعد انتهاء مهلة موجة البث.
   */
  urgency?: "very-low" | "low" | "normal" | "high";
};

export async function sendWebPush(
  target: PushTarget,
  payload: PushPayload,
  options: SendOptions = {}
): Promise<PushSendOutcome> {
  const vapid = loadVapid();
  if (!vapid.ok) {
    // رمزُ التجاوز يحمل **علّته** لا كلمة عامة: «مفاتيح ناقصة» و«زوجٌ غير
    // متطابق» يُعالجان بإجراءين مختلفين تماماً من مالك الخادم
    return { ok: false, skipped: `no-credentials:${vapid.code}` };
  }

  if (!isAllowedEndpoint(target.endpoint)) {
    // اشتراكٌ لا يمكن أن ينجح ولا يجوز أن يُنادى ⇒ يُحذف
    return { ok: false, skipped: "bad-endpoint", gone: true };
  }

  const authorization = vapidAuthorization(target.endpoint);
  if (!authorization) return { ok: false, error: "push: تعذّر توقيع VAPID" };

  const encrypted = encryptPushPayload(encodePushPayload(payload), target.p256dh, target.auth);
  if (!encrypted.ok) {
    // `bad-key` صفٌّ تالف لن يعمل أبداً؛ و`too-large` عيبُ برمجةٍ في المنادي —
    // والثاني لا يُحذف له اشتراك، فالجهاز سليم والخلل عندنا
    return encrypted.code === "bad-key"
      ? { ok: false, skipped: "bad-subscription", gone: true }
      : { ok: false, error: `push: ${encrypted.code}` };
  }

  try {
    const response = await fetch(target.endpoint, {
      method: "POST",
      headers: {
        Authorization: authorization,
        "Content-Encoding": "aes128gcm",
        "Content-Type": "application/octet-stream",
        TTL: String(Math.max(0, Math.floor(options.ttlSeconds ?? DEFAULT_TTL_SECONDS))),
        Urgency: options.urgency ?? "high",
      },
      body: new Uint8Array(encrypted.body),
      signal: AbortSignal.timeout(TIMEOUT_MS),
      cache: "no-store",
    });

    if (response.status >= 200 && response.status < 300) return { ok: true };

    /**
     * 🔒 ٤٠٤/٤١٠ = **الاشتراك مات**: أزال المستخدم التصريح أو مُسح الموقع من
     * جهازه. وحذفُه ليس تنظيفاً بل شرطُ صحة حساب الإتاحة: صفٌّ ميت يُبقي
     * `partner_channels` تعدّ `webpush` قناةً بالغة، فيُحسب المتعهد «متاحاً»
     * ويصله البثّ ولا يسمع شيئاً — وهو نفس العيب الذي وُجدت هذه الموجة لعلاجه.
     */
    if (response.status === 404 || response.status === 410) {
      return { ok: false, error: `push: HTTP ${response.status}`, gone: true };
    }

    const detail = (await response.text().catch(() => "")).slice(0, 180).replace(/\s+/g, " ");
    if (response.status === 413) return { ok: false, error: "push: الحمولة أكبر من حدّ الخدمة" };
    if (response.status === 429) {
      const retry = response.headers.get("retry-after") ?? "";
      return { ok: false, error: `push: خنق من الخدمة${retry ? ` (أعد بعد ${retry})` : ""}` };
    }
    if (response.status === 401 || response.status === 403) {
      // أشيع أسبابه: زوج VAPID تغيّر بعد تسجيل الاشتراك، أو `sub` غير مقبول
      return { ok: false, error: `push: رفضت الخدمة توقيعنا (HTTP ${response.status}) ${detail}` };
    }
    return { ok: false, error: `push: HTTP ${response.status} ${detail}` };
  } catch (err) {
    const reason =
      err instanceof Error && err.name === "TimeoutError"
        ? `انتهت المهلة بعد ${TIMEOUT_MS / 1000} ثوانٍ`
        : err instanceof Error
          ? err.message
          : "خطأ غير معروف";
    return { ok: false, error: `push: ${reason}` };
  }
}
