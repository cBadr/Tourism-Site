import type { NormalizedEvent, PaymentAdapter, PaymentIntentStatus } from "@/lib/payments-types";

import { decimalToMinor, minorToDecimalString, normalizeCurrency } from "@/lib/payments/amount";
import { hmacHex, randomAlnum, safeEqualHex } from "@/lib/payments/crypto";
import { PaymentProviderError, requireEnv } from "@/lib/payments/errors";

/**
 * 2Checkout (Verifone) — رابط شراء موقّع + إشعار IPN موقّع.
 *
 * ── التدفق ────────────────────────────────────────────────────────────────
 * لا نداء API عند البدء إطلاقاً: نبني رابط `secure.2checkout.com/checkout/buy`
 * بمنتج ديناميكي (اسم وسعر وعملة) ومرجعنا في `order-ext-ref`، ونوقّعه بكلمة سر
 * روابط الشراء. هذا هو الشكل الموثّق لـ ConvertPlus، وهو الأنسب هنا لأنه لا
 * يحتاج جلسة ولا رمز وصول.
 *
 * ── التوقيع (في الاتجاهين) ────────────────────────────────────────────────
 * 2Checkout توقّع على تسلسل بطول مسبوق: لكل قيمة `طولها + القيمة` بلا فواصل،
 * ثم HMAC-SHA256 بكلمة السر. عند بناء الرابط يكون الترتيب **أبجدياً** بأسماء
 * الوسائط، وعند التحقق من الـ IPN يكون بالترتيب الذي وصلت به الحقول.
 *
 * ⚠ **افصح عن حدود اليقين**: أشكال هذا التوقيع تغيّرت بين 2Checkout القديمة
 * وVerifone Central، ويختلف الحقل المستعمل (`SIGNATURE_SHA2_256` أو `HASH`
 * القديم بـ MD5) بحسب إعداد الحساب. المنفَّذ هنا هو الشكل الحديث بالترتيبين
 * (كما وصلت، وأبجدياً) ويجب تأكيده مقابل حساب التاجر قبل أول دفعة حقيقية.
 */

const BUY_URL = "https://secure.2checkout.com/checkout/buy";

export const TWOCHECKOUT_ENV_KEYS = ["TWOCHECKOUT_BUY_LINK_SECRET", "TWOCHECKOUT_INS_SECRET"];

/** حقول لا تدخل في التسلسل لأنها التوقيع نفسه */
const SIGNATURE_FIELDS = new Set(["signature", "hash", "signature_sha2_256", "signature_sha3_256"]);

/** التسلسل المطلوب: `طول القيمة` ثم القيمة، بلا أي فاصل */
function lengthPrefixed(values: string[]): string {
  return values.map((value) => `${value.length}${value}`).join("");
}

function statusOf(orderStatus: string): PaymentIntentStatus {
  switch (orderStatus.toUpperCase()) {
    case "COMPLETE":
    case "AUTHRECEIVED":
      return "succeeded";
    case "PENDING":
    case "PURCHASEPENDING":
      return "pending";
    case "CANCELED":
    case "CANCELLED":
      return "cancelled";
    case "EXPIRED":
      return "expired";
    default:
      return "failed";
  }
}

export const twocheckoutAdapter: PaymentAdapter = {
  provider: "twocheckout",

  async createIntent(input) {
    // كلمتا السر معاً: التي توقّع الرابط، والتي يُتحقق بها من الإشعار لاحقاً
    const env = requireEnv("twocheckout", TWOCHECKOUT_ENV_KEYS);

    const merchantCode =
      input.settings.publicConfig.merchantCode ?? input.settings.publicConfig.merchant_code ?? "";
    if (merchantCode.trim() === "") {
      throw new PaymentProviderError(
        "twocheckout",
        "not-configured",
        "أدخل «merchantCode» في إعدادات بوابة 2Checkout من اللوحة.",
        { missing: ["merchantCode"] }
      );
    }

    const currency = normalizeCurrency(input.currency) ?? "USD";

    // مرجع فريد لكل محاولة: `payment_intents` فريد على (provider, provider_ref)،
    // فاستعمال رقم الحجز وحده كان يمنع أي محاولة دفع ثانية على الحجز نفسه —
    // وهي حالة عادية تماماً (بطاقة مرفوضة ثم أخرى).
    const externalRef = `${input.reference}-${randomAlnum(5)}`;

    // الوسائط بأسمائها كما توثّقها 2Checkout لرابط الشراء الديناميكي
    const params: Record<string, string> = {
      "merchant": merchantCode,
      "dynamic": "1",
      "prod": `حجز ${input.reference}`,
      "price": minorToDecimalString(input.amountMinor, currency),
      "currency": currency,
      "qty": "1",
      "type": "digital",
      "order-ext-ref": externalRef,
      "customer-ext-ref": input.bookingId,
      "return-url": input.returnUrl,
      "return-type": "redirect",
    };

    const signature = hmacHex(
      "sha256",
      env.TWOCHECKOUT_BUY_LINK_SECRET,
      lengthPrefixed(Object.keys(params).sort().map((key) => params[key]))
    );

    const url = new URL(BUY_URL);
    for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value);
    url.searchParams.set("signature", signature);

    // لا جلسة لدى المزوّد نتيجة النداء (لا نداء أصلاً)، فمرجعنا هو ما أرسلناه
    // في `order-ext-ref` — وهو نفسه ما يعود في `REFNOEXT` داخل الـ IPN.
    return { providerRef: externalRef, redirectUrl: url.toString() };
  },

  verifySignature({ rawBody }) {
    const env = requireEnv("twocheckout", ["TWOCHECKOUT_INS_SECRET"]);

    // إشعار IPN يصل بترميز النماذج لا JSON
    const fields = new URLSearchParams(rawBody);

    let provided = "";
    const received: string[] = [];
    const named: Array<[string, string]> = [];

    fields.forEach((value, key) => {
      const lower = key.toLowerCase().replace(/\[\]$/, "");
      if (SIGNATURE_FIELDS.has(lower)) {
        if (lower === "signature_sha2_256" || (provided === "" && lower === "signature")) {
          provided = value;
        }
        return;
      }
      received.push(value);
      named.push([key, value]);
    });

    if (provided.trim() === "") return false;

    const asReceived = hmacHex("sha256", env.TWOCHECKOUT_INS_SECRET, lengthPrefixed(received));
    if (safeEqualHex(asReceived, provided)) return true;

    const sorted = named
      .slice()
      .sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0))
      .map((entry) => entry[1]);
    return safeEqualHex(hmacHex("sha256", env.TWOCHECKOUT_INS_SECRET, lengthPrefixed(sorted)), provided);
  },

  parseEvent({ rawBody }): NormalizedEvent | null {
    const fields = new URLSearchParams(rawBody);

    const refNo = fields.get("REFNO") ?? fields.get("refno");
    const externalRef = fields.get("REFNOEXT") ?? fields.get("refnoext");
    const orderStatus = fields.get("ORDERSTATUS") ?? fields.get("orderstatus") ?? "";
    const ipnDate = fields.get("IPN_DATE") ?? fields.get("ipn_date") ?? "";

    if (refNo === null && externalRef === null) return null;

    const currency = normalizeCurrency(fields.get("CURRENCY") ?? fields.get("IPN_CURRENCY"));
    const total = fields.get("IPN_TOTALGENERAL") ?? fields.get("IPN_TOTAL");
    const status = statusOf(orderStatus);

    return {
      // الطابع الزمني للإشعار جزء من المعرّف: 2Checkout ترسل إشعاراً لكل تغيّر
      // حالة على الطلب نفسه، فبدونه يبتلع الإحكامُ إشعاراً مشروعاً لاحقاً.
      eventId: `2co_${refNo ?? externalRef}_${orderStatus || "IPN"}_${ipnDate}`.trim(),
      eventType: orderStatus === "" ? "IPN" : orderStatus,
      providerRef: externalRef ?? refNo,
      status,
      amountMinor: total === null || currency === null ? null : decimalToMinor(total, currency),
      currency,
      failureReason: status === "failed" ? `حالة الطلب لدى 2Checkout: ${orderStatus}` : null,
    };
  },
};
