import type { NormalizedEvent, PaymentAdapter, PaymentIntentStatus } from "@/lib/payments-types";

import { decimalToMinor, minorToDecimalString, normalizeCurrency } from "@/lib/payments/amount";
import { hmacHex, randomAlnum, verifyRsaSha256 } from "@/lib/payments/crypto";
import { PaymentProviderError, requireEnv } from "@/lib/payments/errors";
import { httpJson, readString } from "@/lib/payments/http";
import { pickHeader } from "@/lib/payments/webhook-headers";

/**
 * Binance Pay — طلب دفع بالعملات الرقمية.
 *
 * ── التوقيع الصادر ────────────────────────────────────────────────────────
 * كل نداء يحمل ثلاث ترويسات: طابع زمني (ميلي ثانية)، ورقم عشوائي بطول ٣٢، وتوقيع
 * HMAC-SHA512 **بحروف كبيرة** على `"<timestamp>\n<nonce>\n<الجسم>\n"` — والسطر
 * الجديد الأخير جزء من المُوقَّع عليه، وإسقاطه سبب شائع لرفض «signature error».
 *
 * ── التوقيع الوارد ────────────────────────────────────────────────────────
 * الـ webhook يوقَّع بمفتاح Binance **العام** (RSA-SHA256، التوقيع base64) على
 * الصيغة نفسها. المفتاح يُجلب مرة واحدة من واجهة الشهادات ويوضع في
 * `BINANCEPAY_WEBHOOK_PUBLIC_KEY` — لأن `verifySignature` في العقد متزامنة ولا
 * تحتمل نداء شبكة، وغياب المفتاح «غير مهيّأ» لا قبولاً صامتاً.
 *
 * ── العملة (قيد حقيقي لا تفصيل) ───────────────────────────────────────────
 * Binance Pay يحصّل عملة رقمية. الحجز بالجنيه، فالمبلغ يُرسل بصيغة «سعر بعملة
 * ورقية» (`fiatAmount`/`fiatCurrency`) ليتولى Binance التحويل. إن كان حساب
 * التاجر لا يقبل هذه الصيغة فعلى المالك ضبط `currency` في إعدادات البوابة
 * بعملة رقمية والتسعير بها — راجع ملاحظات التكامل.
 */

const API_URL = "https://bpay.binanceapi.com/binancepay/openapi/v2/order";

export const BINANCEPAY_ENV_KEYS = [
  "BINANCEPAY_API_KEY",
  "BINANCEPAY_API_SECRET",
  "BINANCEPAY_WEBHOOK_PUBLIC_KEY",
];

/** عملات Binance Pay الشائعة — ما عداها يُعامل كعملة ورقية للتحويل */
const CRYPTO = new Set(["USDT", "USDC", "BUSD", "BNB", "BTC", "ETH", "FDUSD", "TUSD", "DAI"]);

function statusOf(bizStatus: string): PaymentIntentStatus {
  switch (bizStatus.toUpperCase()) {
    case "PAY_SUCCESS":
      return "succeeded";
    case "PAY_CLOSED":
      return "cancelled";
    case "PAY_EXPIRED":
      return "expired";
    case "REFUND_SUCCESS":
    case "REFUND_REJECTED":
      return "failed";
    default:
      return "pending";
  }
}

/** مفتاح RSA العام قد يصل بأسطر مهروبة من لوحة النشر */
function publicKeyPem(): string {
  const env = requireEnv("binancepay", ["BINANCEPAY_WEBHOOK_PUBLIC_KEY"]);
  return env.BINANCEPAY_WEBHOOK_PUBLIC_KEY.replace(/\\n/g, "\n");
}

export const binancepayAdapter: PaymentAdapter = {
  provider: "binancepay",

  async createIntent(input) {
    // المفتاح العام للتحقق مطلوب من الآن: بلا قدرة على التحقق من الإشعار لا
    // معنى لفتح صفحة دفع (مال يُقبض بلا تأكيد حجز).
    const env = requireEnv("binancepay", BINANCEPAY_ENV_KEYS);

    const bookingCurrency = normalizeCurrency(input.currency) ?? "EGP";
    const cryptoCurrency =
      normalizeCurrency(input.settings.publicConfig.currency ?? "") ??
      (CRYPTO.has(bookingCurrency) ? bookingCurrency : "USDT");

    // المرجع لدى Binance: حروف وأرقام فقط وبطول محدود — مرجع الحجز فيه شرطة
    const merchantTradeNo = `${input.reference.replace(/[^A-Za-z0-9]/g, "")}${randomAlnum(6)}`.slice(0, 32);

    const amount = minorToDecimalString(input.amountMinor, bookingCurrency);
    const pricedInCrypto = CRYPTO.has(bookingCurrency);

    const payload: Record<string, unknown> = {
      env: { terminalType: "WEB" },
      merchantTradeNo,
      currency: cryptoCurrency,
      goods: {
        goodsType: "02", // خدمة افتراضية
        goodsCategory: "Z000", // أخرى
        referenceGoodsId: input.reference,
        goodsName: `حجز ${input.reference}`,
      },
      returnUrl: input.returnUrl,
      cancelUrl: input.returnUrl,
      webhookUrl: input.webhookUrl,
    };

    if (pricedInCrypto) payload.orderAmount = Number(amount);
    else {
      payload.fiatAmount = Number(amount);
      payload.fiatCurrency = bookingCurrency;
    }

    const body = JSON.stringify(payload);
    const timestamp = String(Date.now());
    const nonce = randomAlnum(32);
    const signature = hmacHex(
      "sha512",
      env.BINANCEPAY_API_SECRET,
      `${timestamp}\n${nonce}\n${body}\n`
    ).toUpperCase();

    const result = await httpJson({
      provider: "binancepay",
      url: API_URL,
      headers: {
        "Content-Type": "application/json",
        "BinancePay-Timestamp": timestamp,
        "BinancePay-Nonce": nonce,
        "BinancePay-Certificate-SN": env.BINANCEPAY_API_KEY,
        "BinancePay-Signature": signature,
      },
      body,
    });

    // Binance ترد ٢٠٠ حتى على الفشل المنطقي — الحكم من `status` لا من حالة HTTP
    if (readString(result, "status") !== "SUCCESS") {
      throw new PaymentProviderError(
        "binancepay",
        "provider-error",
        `رفض Binance Pay الطلب: ${readString(result, "code") ?? "?"} ${readString(result, "errorMessage") ?? ""}`.trim()
      );
    }

    const checkoutUrl =
      readString(result, "data", "checkoutUrl") ?? readString(result, "data", "universalUrl");
    if (checkoutUrl === null) {
      throw new PaymentProviderError(
        "binancepay",
        "invalid-response",
        "لم يُرجع Binance Pay رابط صفحة الدفع."
      );
    }

    // المرجع هو `merchantTradeNo` لأنه ما يعود داخل حمولة الـ webhook
    return { providerRef: merchantTradeNo, redirectUrl: checkoutUrl };
  },

  verifySignature({ rawBody, headers }) {
    const pem = publicKeyPem();

    const timestamp = pickHeader(headers, "binancepay-timestamp");
    const nonce = pickHeader(headers, "binancepay-nonce");
    const signature = pickHeader(headers, "binancepay-signature");

    if (timestamp === null || nonce === null || signature === null) return false;

    return verifyRsaSha256(pem, `${timestamp}\n${nonce}\n${rawBody}\n`, signature);
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
    const bizStatus = readString(event, "bizStatus") ?? "";
    const bizId = readString(event, "bizIdStr") ?? readString(event, "bizId");
    if (bizStatus === "" || bizId === null) return null;

    // `data` نص JSON داخل الحدث لا كائناً — هكذا يرسله Binance
    let detail: Record<string, unknown> = {};
    const rawDetail = event.data;
    if (typeof rawDetail === "string") {
      try {
        const parsed = JSON.parse(rawDetail);
        if (parsed !== null && typeof parsed === "object") detail = parsed as Record<string, unknown>;
      } catch {
        detail = {};
      }
    } else if (rawDetail !== null && typeof rawDetail === "object") {
      detail = rawDetail as Record<string, unknown>;
    }

    const currency = normalizeCurrency(readString(detail, "currency"));
    const total = readString(detail, "totalFee");
    const status = statusOf(bizStatus);

    return {
      eventId: `bnb_${bizId}_${bizStatus}`,
      eventType: readString(event, "bizType") ?? "PAY",
      providerRef: readString(detail, "merchantTradeNo"),
      status,
      amountMinor: total === null || currency === null ? null : decimalToMinor(total, currency),
      currency,
      failureReason: status === "failed" || status === "cancelled" ? `حالة Binance Pay: ${bizStatus}` : null,
    };
  },
};
