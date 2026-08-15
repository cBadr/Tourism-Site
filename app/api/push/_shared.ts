import "server-only";

import { portalAccess, type PortalAccess, type PortalDenial } from "@/app/portal/_lib/session";
import { checkPerMinute } from "@/lib/discounts/rate-limit";
import { AUTH_SECRET_BYTES, fromBase64Url, isValidPublicKey, P256_PUBLIC_KEY_BYTES } from "@/lib/push/keys";
import type { PushTarget } from "@/lib/push/types";

/**
 * ما يشترك فيه مسارات `/api/push` — الحارس وقراءة الجسم وترجمة أخطاء القاعدة.
 *
 * 🔒 **الحارس واحدٌ ومستورد لا منسوخ**: `portalAccess()` من بوابة البورتال.
 * وهو الحارس الضيّق (`active` وحدها) بقرارٍ مكتوب في مصدره — ومتعهدٌ في مرحلة
 * التجهيز لا يستقبل بثّاً أصلاً، فتفعيلُ إشعاراته سطحٌ يَعِد بما لا يقع.
 *
 * ⚠ ونسخُ الحارس هنا كان سيكسر ذلك بصمت أولَ يومٍ تتغيّر فيه قاعدةُ الوصول في
 * مكانٍ واحد من اثنين.
 */

export const NO_STORE = { "Cache-Control": "no-store" } as const;

/** رموز الخطأ — رمزٌ لا جملة (قاعدة المشروع)، والواجهة تترجمها */
export type PushApiError =
  | "auth" // لا جلسة متعهد معتمد
  | "env" // البيئة غير مضبوطة
  | "schema" // هجرة 0054 غير مطبَّقة
  | "invalid" // جسم الطلب غير صالح
  | "rate-limited"
  | "save" // القاعدة رفضت الكتابة
  | "not-configured"; // لا مفاتيح VAPID على الخادم

export function errorJson(code: PushApiError, status: number, extra?: HeadersInit): Response {
  return Response.json({ ok: false, code }, { status, headers: { ...NO_STORE, ...extra } });
}

/**
 * ترجمة رمز منع الوصول إلى حالة HTTP.
 *
 * و`account` مع `auth` في سلّةٍ واحدة (٤٠١) بقصد: الفرق بين «لا جلسة» و«جلسةٌ
 * لحسابٍ غير معتمد» يخصّ شاشة البورتال لا مسارَ API، وإفشاؤه هنا يقول لمن
 * يجرّب: «هذا الحساب موجودٌ لكنه غير معتمد».
 */
export function denialResponse(code: PortalDenial): Response {
  if (code === "auth" || code === "account") return errorJson("auth", 401);
  if (code === "schema") return errorJson("schema", 503);
  return errorJson("env", 503);
}

/**
 * الحارس + خانقٌ لكل حساب.
 *
 * والخانق **على معرّف المتعهد لا على العنوان**: المسار خلف تسجيل دخول، فالمفتاح
 * المتاح لا يُزوَّر ولا يُدوَّر — ودلو العنوان وحده كان يخنق مكتباً كاملاً خلف
 * عنوانٍ واحد (نفس تعليل `/api/loyalty/preview`).
 */
export async function guard(
  limitPerMinute: number,
  bucket: string
): Promise<{ ok: true; access: Extract<PortalAccess, { ok: true }> } | { ok: false; response: Response }> {
  const access = await portalAccess();
  if (!access.ok) return { ok: false, response: denialResponse(access.code) };

  const verdict = checkPerMinute(`push:${bucket}:${access.sub.id}`, limitPerMinute);
  if (!verdict.ok) {
    return {
      ok: false,
      response: errorJson("rate-limited", 429, { "Retry-After": String(verdict.retryAfterSec) }),
    };
  }
  return { ok: true, access };
}

export async function readJson(request: Request): Promise<Record<string, unknown> | null> {
  try {
    const body = await request.json();
    return typeof body === "object" && body !== null && !Array.isArray(body)
      ? (body as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
}

/* ------------------------------------------------------------------ */
/* التحقق من الاشتراك القادم من المتصفح                                  */
/* ------------------------------------------------------------------ */

/** أقصى طولٍ لعنوان خدمة الدفع — الحقيقي دون ٥٠٠ حرفاً بكثير عند كل الخدمات */
const MAX_ENDPOINT = 1000;

/** وصفُ الجهاز كما يعرضه صاحبه — نصٌّ يكتبه المتصفح، فيُقصّ ويُخزَّن كما هو */
const MAX_USER_AGENT = 200;

/**
 * 🔒 **الحارس البنيوي لوجهة الإرسال.**
 *
 * `endpoint` قيمةٌ يكتبها المتصفح وسيرسل إليها خادمُنا طلب POST لاحقاً. فبلا
 * هذا الفحص يستطيع متعهدٌ مسجَّل الدخول أن يجعل الخادم ينادي عنواناً يختاره —
 * ومنه عناوين الشبكة الداخلية التي لا تصلها الإنترنت. والشرط: **HTTPS، ونطاقٌ
 * عام، ولا عنوان IP حرفي**. وخدمات الدفع الحقيقية كلها كذلك، فلا حالة مشروعة
 * واحدة يمنعها.
 *
 * ⚠ ولا نحصر القبول في قائمة نطاقاتٍ معروفة (`fcm.googleapis.com` وأخواتها):
 * قائمةٌ كهذه تبدو أشدّ، لكنها تكسر أول متصفحٍ يغيّر مزوّده — بلا خطأٍ مفهوم،
 * وعلى متعهدٍ واحدٍ فقط، وهو أصعب عطبٍ يُشخَّص.
 */
function isAcceptableEndpoint(value: unknown): value is string {
  if (typeof value !== "string") return false;
  const trimmed = value.trim();
  if (trimmed.length === 0 || trimmed.length > MAX_ENDPOINT) return false;

  let url: URL;
  try {
    url = new URL(trimmed);
  } catch {
    return false;
  }
  if (url.protocol !== "https:") return false;

  const host = url.hostname.toLowerCase();
  if (host === "localhost" || host.endsWith(".localhost") || host.endsWith(".local")) return false;
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(host)) return false;
  if (host.startsWith("[")) return false;
  if (!host.includes(".")) return false;
  return true;
}

export type ParsedSubscription = PushTarget & { userAgent: string | null };

/**
 * يقرأ ما يرسله `PushSubscription.toJSON()` ويتحقق من **أطوال المفاتيح**.
 *
 * والتحقق من الطول ليس شكلياً: `Buffer.from(x, 'base64url')` لا ترمي على نصٍّ
 * تالف بل ترجع ما تجمّع — فمفتاحٌ مبتور يمرّ ويُخزَّن، ثم تنجح كل عملية إرسالٍ
 * ظاهرياً ولا تظهر بطاقة واحدة على الجهاز. الرفضُ هنا، عند الباب.
 */
export function parseSubscription(body: Record<string, unknown>): ParsedSubscription | null {
  if (!isAcceptableEndpoint(body.endpoint)) return null;

  const keys = body.keys;
  if (typeof keys !== "object" || keys === null) return null;
  const { p256dh, auth } = keys as Record<string, unknown>;
  if (typeof p256dh !== "string" || typeof auth !== "string") return null;

  if (!isValidPublicKey(fromBase64Url(p256dh, P256_PUBLIC_KEY_BYTES))) return null;
  if (!fromBase64Url(auth, AUTH_SECRET_BYTES)) return null;

  const rawAgent = typeof body.userAgent === "string" ? body.userAgent : "";
  const userAgent = rawAgent.replace(/\s+/g, " ").trim().slice(0, MAX_USER_AGENT);

  return {
    endpoint: (body.endpoint as string).trim(),
    p256dh: p256dh.trim(),
    auth: auth.trim(),
    userAgent: userAgent === "" ? null : userAgent,
  };
}
