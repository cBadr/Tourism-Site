import type { NormalizedEvent, PaymentAdapter, PaymentIntentStatus, ProviderSettings } from "@/lib/payments-types";

import { decimalToMinor, minorToDecimalString, normalizeCurrency } from "@/lib/payments/amount";
import { crc32, verifyRsaSha256 } from "@/lib/payments/crypto";
import { PaymentProviderError, requireEnv } from "@/lib/payments/errors";
import { httpJson, readString } from "@/lib/payments/http";
import { pickHeader } from "@/lib/payments/webhook-headers";

/**
 * PayPal — طلب Orders v2 مع إعادة توجيه إلى صفحة موافقة الدافع.
 *
 * ── التدفق ────────────────────────────────────────────────────────────────
 *   ١) POST /v1/oauth2/token  (Basic بالعميل والسر) ← رمز وصول قصير العمر
 *   ٢) POST /v2/checkout/orders ← يرد `id` وقائمة `links`، فنعيد التوجيه إلى
 *      الرابط ذي العلاقة `payer-action` (أو `approve` في الشكل الأقدم).
 *
 * ⚠ **الالتقاط (capture)**: طلب PayPal لا يتحوّل مالاً بمجرد موافقة الدافع؛
 * يحتاج نداء التقاط صريحاً. نطلب ذلك بـ `processing_instruction:
 * ORDER_COMPLETE_ON_PAYMENT_APPROVAL` فيلتقط PayPal تلقائياً لحظة الموافقة
 * ويرسل `PAYMENT.CAPTURE.COMPLETED`. إن كان حساب التاجر لا يُفعّل هذه
 * التعليمة، فلن يصل إلا `CHECKOUT.ORDER.APPROVED` — وهو **ليس** نجاحاً هنا (نردّه
 * `pending` عمداً)، وعندها يجب استدعاء `capturePayPalOrder` أدناه من صفحة العودة.
 * هذا القرار مُتعمَّد: تأكيد حجز بموافقة لم تُلتقط يعني رحلة تُنفَّذ بلا مال.
 *
 * ── التوقيع ───────────────────────────────────────────────────────────────
 * الطريق الذي توثّقه PayPal أولاً هو نداء `/v1/notifications/verify-webhook-
 * signature` — **وهو غير ممكن هنا**: واجهة العقد `verifySignature` متزامنة
 * وتُرجع boolean، ولا مكان فيها لنداء شبكة. لذلك نُنفّذ الخوارزمية المحلية التي
 * توثّقها PayPal نفسها:
 *
 *     RSA-SHA256( "<transmissionId>|<transmissionTime>|<webhookId>|<crc32(الجسم الخام)>" )
 *
 * بالتحقق من التوقيع (base64) بشهادة PayPal العامة. الشهادة تُنزَّل مرة واحدة من
 * `paypal-cert-url` وتوضع في `PAYPAL_WEBHOOK_CERT_PEM` — وغيابها «غير مهيّأ»، لا
 * قبولاً صامتاً.
 *
 * ── العملة ────────────────────────────────────────────────────────────────
 * PayPal لا تتعامل بالجنيه المصري: المبلغ يجب أن يكون بعملة مدعومة (دولار مثلاً)،
 * وهذا قرار تجاري لا برمجي — راجع ملاحظات التكامل.
 */

const LIVE_BASE = "https://api-m.paypal.com";
const SANDBOX_BASE = "https://api-m.sandbox.paypal.com";

export const PAYPAL_ENV_KEYS = [
  "PAYPAL_CLIENT_ID",
  "PAYPAL_CLIENT_SECRET",
  "PAYPAL_WEBHOOK_ID",
  "PAYPAL_WEBHOOK_CERT_PEM",
];

function apiBase(settings: ProviderSettings): string {
  return settings.sandbox ? SANDBOX_BASE : LIVE_BASE;
}

async function accessToken(settings: ProviderSettings): Promise<string> {
  const env = requireEnv("paypal", ["PAYPAL_CLIENT_ID", "PAYPAL_CLIENT_SECRET"]);
  const basic = Buffer.from(`${env.PAYPAL_CLIENT_ID}:${env.PAYPAL_CLIENT_SECRET}`).toString("base64");

  const body = new URLSearchParams({ grant_type: "client_credentials" });
  const result = await httpJson({
    provider: "paypal",
    url: `${apiBase(settings)}/v1/oauth2/token`,
    headers: { Authorization: `Basic ${basic}` },
    body,
  });

  const token = readString(result, "access_token");
  if (token === null) {
    throw new PaymentProviderError("paypal", "invalid-response", "لم تُرجع PayPal رمز وصول.");
  }
  return token;
}

/** الشهادة في متغير بيئة: أسطرها قد تصل مهروبة `\n` من لوحة النشر */
function certPem(): string {
  const env = requireEnv("paypal", ["PAYPAL_WEBHOOK_CERT_PEM"]);
  return env.PAYPAL_WEBHOOK_CERT_PEM.replace(/\\n/g, "\n");
}

function statusOf(eventType: string): PaymentIntentStatus {
  switch (eventType) {
    case "PAYMENT.CAPTURE.COMPLETED":
      return "succeeded";
    case "PAYMENT.CAPTURE.DENIED":
    case "PAYMENT.CAPTURE.REVERSED":
    case "PAYMENT.CAPTURE.REFUNDED":
      return "failed";
    case "CHECKOUT.ORDER.VOIDED":
      return "cancelled";
    // موافقة الدافع ليست تحصيلاً — تبقى «معلّقة» حتى يصل الالتقاط
    case "CHECKOUT.ORDER.APPROVED":
    case "CHECKOUT.ORDER.PROCESSED":
      return "pending";
    default:
      return "pending";
  }
}

/**
 * التقاط طلب موافق عليه — يُستدعى يدوياً من صفحة العودة إن لم يلتقط PayPal
 * تلقائياً. لا يستدعيه الـ webhook: واجهة المحوّل متزامنة بلا خطاف بعد الحدث.
 */
export async function capturePayPalOrder(
  orderId: string,
  settings: ProviderSettings
): Promise<{ status: string; captureId: string | null }> {
  const token = await accessToken(settings);
  const result = await httpJson({
    provider: "paypal",
    url: `${apiBase(settings)}/v2/checkout/orders/${encodeURIComponent(orderId)}/capture`,
    headers: { Authorization: `Bearer ${token}` },
    body: {},
  });

  const captures = (result.purchase_units as Array<Record<string, unknown>> | undefined)?.[0];
  const capture = (captures?.payments as Record<string, unknown> | undefined)?.captures;
  const first = Array.isArray(capture) ? (capture[0] as Record<string, unknown>) : undefined;

  return {
    status: readString(result, "status") ?? "UNKNOWN",
    captureId: first === undefined ? null : readString(first, "id"),
  };
}

export const paypalAdapter: PaymentAdapter = {
  provider: "paypal",

  async createIntent(input) {
    // كل المفاتيح معاً: بوابة تفتح صفحة دفع ولا تستطيع التحقق من إشعارها
    // تقبض مالاً بلا تأكيد حجز — تعطّلٌ صريح أفضل من ذلك بكثير.
    requireEnv("paypal", PAYPAL_ENV_KEYS);

    const currency = normalizeCurrency(input.currency) ?? "USD";
    const token = await accessToken(input.settings);

    const order = await httpJson({
      provider: "paypal",
      url: `${apiBase(input.settings)}/v2/checkout/orders`,
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: {
        intent: "CAPTURE",
        processing_instruction: "ORDER_COMPLETE_ON_PAYMENT_APPROVAL",
        purchase_units: [
          {
            reference_id: input.reference,
            custom_id: input.bookingId,
            description: `حجز ${input.reference}`,
            amount: {
              currency_code: currency,
              value: minorToDecimalString(input.amountMinor, currency),
            },
          },
        ],
        payment_source: {
          paypal: {
            experience_context: {
              user_action: "PAY_NOW",
              return_url: input.returnUrl,
              cancel_url: input.returnUrl,
            },
          },
        },
      },
    });

    const id = readString(order, "id");
    const links = Array.isArray(order.links) ? (order.links as Array<Record<string, unknown>>) : [];
    const action =
      links.find((link) => readString(link, "rel") === "payer-action") ??
      links.find((link) => readString(link, "rel") === "approve");
    const href = action === undefined ? null : readString(action, "href");

    if (id === null || href === null) {
      throw new PaymentProviderError(
        "paypal",
        "invalid-response",
        "لم تُرجع PayPal معرّف الطلب أو رابط الموافقة."
      );
    }

    return { providerRef: id, redirectUrl: href };
  },

  verifySignature({ rawBody, headers }) {
    const env = requireEnv("paypal", ["PAYPAL_WEBHOOK_ID"]);
    const pem = certPem();

    const transmissionId = pickHeader(headers, "paypal-transmission-id");
    const transmissionTime = pickHeader(headers, "paypal-transmission-time");
    const signature = pickHeader(headers, "paypal-transmission-sig");
    const certUrl = pickHeader(headers, "paypal-cert-url");
    const algorithm = pickHeader(headers, "paypal-auth-algo");

    if (transmissionId === null || transmissionTime === null || signature === null) return false;

    // الشهادة عندنا من البيئة، لكن عنواناً من نطاق غريب علامة تلفيق صريحة
    if (certUrl !== null) {
      try {
        const host = new URL(certUrl).hostname;
        if (host !== "paypal.com" && !host.endsWith(".paypal.com")) return false;
      } catch {
        return false;
      }
    }

    // PayPal توثّق SHA256withRSA؛ أي خوارزمية أخرى ليست ما نتحقق منه
    if (algorithm !== null && !/sha256/i.test(algorithm)) return false;

    const message = [
      transmissionId,
      transmissionTime,
      env.PAYPAL_WEBHOOK_ID,
      String(crc32(rawBody)),
    ].join("|");

    return verifyRsaSha256(pem, message, signature);
  },

  parseEvent({ rawBody }): NormalizedEvent | null {
    let body: unknown;
    try {
      body = JSON.parse(rawBody);
    } catch {
      return null;
    }
    if (body === null || typeof body !== "object") return null;

    const event = body as Record<string, unknown>;
    const eventId = readString(event, "id");
    const eventType = readString(event, "event_type");
    const resource = event.resource;

    if (eventId === null || eventType === null || resource === null || typeof resource !== "object") {
      return null;
    }

    const payload = resource as Record<string, unknown>;
    const status = statusOf(eventType);

    // مرجعنا هو **معرّف الطلب**. في أحداث الالتقاط يكون `resource.id` معرّف
    // عملية الالتقاط لا الطلب، ومعرّف الطلب يسكن `supplementary_data`.
    const orderId =
      readString(payload, "supplementary_data", "related_ids", "order_id") ??
      (eventType.startsWith("CHECKOUT.ORDER") ? readString(payload, "id") : null);

    const currency =
      normalizeCurrency(readString(payload, "amount", "currency_code")) ??
      normalizeCurrency(readString(payload, "purchase_units", "0", "amount", "currency_code"));
    const value = readString(payload, "amount", "value");

    return {
      eventId,
      eventType,
      providerRef: orderId,
      status,
      amountMinor: value === null || currency === null ? null : decimalToMinor(value, currency),
      currency,
      failureReason:
        status === "failed" ? readString(payload, "status_details", "reason") ?? eventType : null,
    };
  },
};
