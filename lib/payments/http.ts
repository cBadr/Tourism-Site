import type { PaymentProvider } from "@/lib/payments-types";

import { PaymentProviderError } from "@/lib/payments/errors";

/**
 * نداء HTTP واحد لكل المحوّلات — بمهلة، وبتحويل كل فشل إلى `PaymentProviderError`.
 *
 * لماذا مهلة صريحة: `fetch` بلا مهلة قد يعلّق طلب العميل حتى مهلة المنصة كاملة
 * (٦٠ ثانية على Vercel)، والعميل ينتظر أمام زر «ادفع» بلا أي رد. بوابة بطيئة
 * يجب أن تفشل بسرعة برسالة مفهومة، لا أن تجمّد الصفحة.
 *
 * ولماذا نُرجع الجسم الخام دائماً: رسائل أخطاء المزوّدين هي كل ما سيملكه المالك
 * حين يعطب المفتاح، وابتلاعها يعني تشخيصاً بالتخمين. تُسجَّل في الخادم ولا تصل
 * إلى المتصفح (قد تحوي جزءاً من مفتاح أو معرّفات داخلية).
 */

const DEFAULT_TIMEOUT_MS = 15000;

export type HttpResult = {
  status: number;
  ok: boolean;
  text: string;
  json: unknown;
};

export type HttpRequest = {
  provider: PaymentProvider;
  url: string;
  method?: "GET" | "POST";
  headers?: Record<string, string>;
  /** جسم جاهز — نص أو كائن يُسلسل JSON */
  body?: string | Record<string, unknown> | URLSearchParams;
  timeoutMs?: number;
};

function parseJson(text: string): unknown {
  if (text.trim() === "") return null;
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

export async function httpRequest(request: HttpRequest): Promise<HttpResult> {
  const { provider, url } = request;
  const headers: Record<string, string> = { Accept: "application/json", ...request.headers };

  let body: string | undefined;
  if (request.body instanceof URLSearchParams) {
    body = request.body.toString();
    headers["Content-Type"] ??= "application/x-www-form-urlencoded";
  } else if (typeof request.body === "string") {
    body = request.body;
    headers["Content-Type"] ??= "application/json";
  } else if (request.body !== undefined) {
    body = JSON.stringify(request.body);
    headers["Content-Type"] ??= "application/json";
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), request.timeoutMs ?? DEFAULT_TIMEOUT_MS);

  let response: Response;
  try {
    response = await fetch(url, {
      method: request.method ?? "POST",
      headers,
      body,
      signal: controller.signal,
      cache: "no-store",
    });
  } catch (err) {
    const aborted = err instanceof Error && err.name === "AbortError";
    throw new PaymentProviderError(
      provider,
      "provider-error",
      aborted
        ? `لم ترد بوابة «${provider}» خلال المهلة المحددة.`
        : `تعذّر الاتصال ببوابة «${provider}».`,
      { cause: err }
    );
  } finally {
    clearTimeout(timer);
  }

  const text = await response.text();
  return { status: response.status, ok: response.ok, text, json: parseJson(text) };
}

/** رد ناجح أو رمي — الرسالة تحمل جزءاً من جسم المزوّد ليكون التشخيص ممكناً */
export async function httpJson(request: HttpRequest): Promise<Record<string, unknown>> {
  const result = await httpRequest(request);

  if (!result.ok) {
    throw new PaymentProviderError(
      request.provider,
      "provider-error",
      `بوابة «${request.provider}» ردّت بالحالة ${result.status}: ${result.text.slice(0, 500)}`,
      { status: result.status }
    );
  }

  if (result.json === null || typeof result.json !== "object") {
    throw new PaymentProviderError(
      request.provider,
      "invalid-response",
      `رد بوابة «${request.provider}» ليس JSON صالحاً: ${result.text.slice(0, 300)}`,
      { status: result.status }
    );
  }

  return result.json as Record<string, unknown>;
}

/** قراءة نص من رد المزوّد بلا افتراضات عن الشكل */
export function readString(source: unknown, ...path: string[]): string | null {
  let current: unknown = source;
  for (const key of path) {
    if (current === null || typeof current !== "object") return null;
    current = (current as Record<string, unknown>)[key];
  }
  if (typeof current === "string") return current.trim() === "" ? null : current;
  if (typeof current === "number" && Number.isFinite(current)) return String(current);
  return null;
}

/** قراءة رقم من رد المزوّد — الأرقام تصل نصوصاً كثيراً */
export function readNumber(source: unknown, ...path: string[]): number | null {
  const text = readString(source, ...path);
  if (text === null) return null;
  const value = Number(text);
  return Number.isFinite(value) ? value : null;
}
