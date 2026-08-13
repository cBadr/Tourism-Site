import type { NormalizedEvent, PaymentAdapter, PaymentIntentStatus } from "@/lib/payments-types";

import { decimalToMinor, minorToDecimalString, normalizeCurrency } from "@/lib/payments/amount";
import { hmacHex, randomAlnum, safeEqualHex, sortedJson } from "@/lib/payments/crypto";
import { PaymentProviderError, requireEnv } from "@/lib/payments/errors";
import { httpJson, readString } from "@/lib/payments/http";
import { pickHeader } from "@/lib/payments/webhook-headers";

/**
 * NOWPayments — فاتورة عملات رقمية بسعر معلن بعملة ورقية.
 *
 * ── التدفق ────────────────────────────────────────────────────────────────
 * POST https://api.nowpayments.io/v1/invoice بترويسة `x-api-key` ← يرد
 * `invoice_url` (صفحة يختار فيها العميل العملة الرقمية) و`id`. المبلغ يُرسل
 * `price_amount` بعملة الحجز، وNOWPayments يتولى سعر الصرف لحظة الدفع.
 *
 * ── التوقيع ───────────────────────────────────────────────────────────────
 * ترويسة `x-nowpayments-sig` = HMAC-SHA512 على الجسم **بعد ترتيب مفاتيحه
 * أبجدياً** ثم تسلسله JSON. هذا هو الاستثناء الوحيد لقاعدة «وقّع على الجسم
 * الخام» في المشروع: المزوّد يوثّق إعادة البناء صراحةً، فنبنيه كما وثّقه —
 * `sortedJson` في `lib/payments/crypto.ts` تفعل ذلك متعدّية على كل المستويات.
 *
 * ⚠ حدّ اليقين: NOWPayments لا ترسل معرّف حدث. نركّب المعرّف من
 * `payment_id` + الحالة، فتكرار الإشعار لنفس الحالة يُبتلع بالإحكام، وانتقال
 * الحالة (confirming ← finished) يمر حدثاً جديداً — وهو السلوك المطلوب.
 */

const INVOICE_URL = "https://api.nowpayments.io/v1/invoice";

export const NOWPAYMENTS_ENV_KEYS = ["NOWPAYMENTS_API_KEY", "NOWPAYMENTS_IPN_SECRET"];

export const NOWPAYMENTS_SIGNATURE_HEADER = "x-nowpayments-sig";

function statusOf(paymentStatus: string): PaymentIntentStatus {
  switch (paymentStatus.toLowerCase()) {
    case "finished":
      return "succeeded";
    case "failed":
    case "partially_paid":
      return "failed";
    case "refunded":
      return "cancelled";
    case "expired":
      return "expired";
    default:
      // waiting / confirming / confirmed / sending
      return "pending";
  }
}

export const nowpaymentsAdapter: PaymentAdapter = {
  provider: "nowpayments",

  async createIntent(input) {
    // سرّ الإشعار مطلوب من الآن لا عند وصول أول إشعار: بوابة تقبض ولا تتحقق
    // من إشعارها تترك حجزاً مدفوعاً بلا تأكيد.
    const env = requireEnv("nowpayments", NOWPAYMENTS_ENV_KEYS);

    const currency = normalizeCurrency(input.currency) ?? "EGP";
    // مرجع فريد لكل محاولة: الفاتورة القديمة قد تبقى مفتوحة لدى المزوّد
    const orderId = `${input.reference}-${randomAlnum(5)}`;

    const invoice = await httpJson({
      provider: "nowpayments",
      url: INVOICE_URL,
      headers: { "x-api-key": env.NOWPAYMENTS_API_KEY, "Content-Type": "application/json" },
      body: {
        price_amount: Number(minorToDecimalString(input.amountMinor, currency)),
        price_currency: currency.toLowerCase(),
        order_id: orderId,
        order_description: `حجز ${input.reference}`,
        ipn_callback_url: input.webhookUrl,
        success_url: input.returnUrl,
        cancel_url: input.returnUrl,
      },
    });

    const url = readString(invoice, "invoice_url");
    if (url === null) {
      throw new PaymentProviderError(
        "nowpayments",
        "invalid-response",
        "لم تُرجع NOWPayments رابط الفاتورة."
      );
    }

    // المرجع هو `order_id` لأنه الحقل الذي يعود في كل إشعار IPN
    return { providerRef: orderId, redirectUrl: url };
  },

  verifySignature({ rawBody, headers }) {
    const env = requireEnv("nowpayments", ["NOWPAYMENTS_IPN_SECRET"]);

    const provided = pickHeader(headers, NOWPAYMENTS_SIGNATURE_HEADER);
    if (provided === null) return false;

    let body: unknown;
    try {
      body = JSON.parse(rawBody);
    } catch {
      return false;
    }
    if (body === null || typeof body !== "object") return false;

    const expected = hmacHex("sha512", env.NOWPAYMENTS_IPN_SECRET, sortedJson(body));
    return safeEqualHex(expected, provided);
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
    const paymentId = readString(event, "payment_id");
    const paymentStatus = readString(event, "payment_status") ?? "";
    const orderId = readString(event, "order_id");

    if (paymentId === null || paymentStatus === "") return null;

    const currency = normalizeCurrency(readString(event, "price_currency"));
    const amount = readString(event, "price_amount");
    const status = statusOf(paymentStatus);

    return {
      eventId: `nowp_${paymentId}_${paymentStatus}`,
      eventType: `payment.${paymentStatus}`,
      providerRef: orderId,
      status,
      amountMinor: amount === null || currency === null ? null : decimalToMinor(amount, currency),
      currency,
      failureReason: status === "failed" ? `حالة NOWPayments: ${paymentStatus}` : null,
    };
  },
};
