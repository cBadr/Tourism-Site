import { timingSafeEqual } from "node:crypto";

import { dispatchNotifications, getQueueStats } from "@/lib/notifications/dispatch";

/**
 * مسار عامل الإشعارات.
 *
 *   POST /api/notifications/dispatch        ← يشغّل دورة إرسال ويرجع ملخّصها
 *   GET  /api/notifications/dispatch        ← إحصاء الطابور (queued/sent/skipped/failed)
 *   GET  /api/notifications/dispatch?run=1  ← يشغّل دورة أيضاً (مهام Vercel Cron ترسل GET فقط)
 *
 * الحماية (من عقد المرحلة ٤): ترويسة `x-dispatch-key` تُطابَق بـ `NOTIFY_DISPATCH_KEY`.
 * ويُقبل كذلك `Authorization: Bearer <key>` لأن Vercel Cron يرسل السرّ بهذه الصيغة،
 * ويُقبل `CRON_SECRET` كمفتاح بديل إن ضُبط. المقارنة بزمن ثابت (timingSafeEqual).
 *
 * حين لا يكون أي مفتاح مضبوطاً: المسار **يرفض في الإنتاج** ويسمح في التطوير من
 * localhost وحدها — حتى يجرّبه المالك على جهازه بلا إعداد، ولا يبقى مفتوحاً على
 * الإنترنت بأي حال.
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const NO_STORE = { "Cache-Control": "no-store" };

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

type Denial = { code: string; message: string };

function authorize(request: Request): Denial | null {
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
        "عامل الإشعارات مقفل: اضبط NOTIFY_DISPATCH_KEY في متغيرات البيئة ثم أرسل قيمته في ترويسة x-dispatch-key.",
    };
  }
  return { code: "unauthorized", message: "مفتاح تشغيل عامل الإشعارات غير صحيح." };
}

function denied(denial: Denial): Response {
  return Response.json({ ok: false, ...denial }, { status: 401, headers: NO_STORE });
}

/** إعدادات ناقصة أو هجرة غير منفَّذة ⇒ ٥٠٣ حتى تُنبّه المهمة المجدولة المالكَ */
const BROKEN_REASONS = new Set(["no-service-client", "no-table", "read-failed"]);

export async function POST(request: Request): Promise<Response> {
  const denial = authorize(request);
  if (denial) return denied(denial);

  const summary = await dispatchNotifications();
  const status = summary.reason && BROKEN_REASONS.has(summary.reason) ? 503 : 200;
  return Response.json(summary, { status, headers: NO_STORE });
}

export async function GET(request: Request): Promise<Response> {
  const denial = authorize(request);
  if (denial) return denied(denial);

  // Vercel Cron لا يرسل إلا GET — لذلك ?run=1 يشغّل نفس دورة POST
  const run = new URL(request.url).searchParams.get("run");
  if (run === "1" || run === "true") {
    const summary = await dispatchNotifications();
    const status = summary.reason && BROKEN_REASONS.has(summary.reason) ? 503 : 200;
    return Response.json(summary, { status, headers: NO_STORE });
  }

  const stats = await getQueueStats();
  const status = stats.reason && BROKEN_REASONS.has(stats.reason) ? 503 : 200;
  return Response.json(stats, { status, headers: NO_STORE });
}
