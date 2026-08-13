import type { NormalizedEvent, PaymentAdapter, PaymentIntentStatus } from "@/lib/payments-types";

import { normalizeCurrency } from "@/lib/payments/amount";
import { hmacHex, randomAlnum, safeEqualHex } from "@/lib/payments/crypto";
import { PaymentProviderError, requireEnv } from "@/lib/payments/errors";
import { httpJson, readString } from "@/lib/payments/http";
import { pickHeader } from "@/lib/payments/webhook-headers";

/**
 * Paymob — سكة البطاقات الواقعية في مصر.
 *
 * ── التدفق المُنفَّذ (الكلاسيكي ثلاثي الخطوات، وهو الموثّق الأوسع) ──────────
 *   ١) POST /api/auth/tokens               ← رمز جلسة من `PAYMOB_API_KEY`
 *   ٢) POST /api/ecommerce/orders          ← طلب لدى Paymob بمبلغ بالقروش
 *   ٣) POST /api/acceptance/payment_keys   ← مفتاح دفع مربوط بـ integration_id
 *   ثم الإعادة إلى /api/acceptance/iframes/<iframe_id>?payment_token=<key>
 *
 * لدى Paymob أيضاً واجهة أحدث موحّدة (`POST /v1/intention/` ثم Unified
 * Checkout). لم تُنفَّذ هنا لأن الحسابات الحالية تختلف فيما يُفعَّل لها، والأول
 * يعمل على الحسابين. التبديل بينهما تغيير داخل هذا الملف وحده.
 *
 * ── التوقيع ───────────────────────────────────────────────────────────────
 * Paymob يرسل `hmac` في **سلسلة الاستعلام** (ويكرره في الجسم أحياناً)، محسوباً
 * HMAC-**SHA512** على تسلسل حقول بعينها بترتيب معجمي ثابت — لا على الجسم الخام.
 * الترتيب أدناه هو المنشور في توثيقهم؛ أي حرف زائد أو ناقص يقلب النتيجة.
 *
 * ── المبلغ ────────────────────────────────────────────────────────────────
 * Paymob يعمل بالقروش أصلاً (`amount_cents`) فلا تحويل ولا كسور — وهو بالضبط
 * سبب تخزين العقد للمبلغ بالوحدات الصغرى.
 */

const BASE_URL = "https://accept.paymob.com";

/** ترتيب حقول التوقيع كما تنشره Paymob — لا يُعاد ترتيبه ولا يُختصر */
const HMAC_FIELDS = [
  "amount_cents",
  "created_at",
  "currency",
  "error_occured",
  "has_parent_transaction",
  "id",
  "integration_id",
  "is_3d_secure",
  "is_auth",
  "is_capture",
  "is_refunded",
  "is_standalone_payment",
  "is_voided",
  "order.id",
  "owner",
  "source_data.pan",
  "source_data.sub_type",
  "source_data.type",
  "success",
] as const;

/**
 * ملاحظة دقيقة: بعض نسخ التوثيق تُدرج `pending` بين `owner` و`source_data.pan`.
 * لذلك نحسب التوقيع بالترتيبين ونقبل أياً منهما — الأمان لا يتأثر (كلاهما HMAC
 * بالمفتاح السرّي نفسه على حقول الحدث نفسه) والتوافق يتحسن مع اختلاف الحسابات.
 */
const HMAC_FIELDS_WITH_PENDING = [
  "amount_cents",
  "created_at",
  "currency",
  "error_occured",
  "has_parent_transaction",
  "id",
  "integration_id",
  "is_3d_secure",
  "is_auth",
  "is_capture",
  "is_refunded",
  "is_standalone_payment",
  "is_voided",
  "order.id",
  "owner",
  "pending",
  "source_data.pan",
  "source_data.sub_type",
  "source_data.type",
  "success",
] as const;

export const PAYMOB_ENV_KEYS = ["PAYMOB_API_KEY", "PAYMOB_HMAC_SECRET"];

function dig(source: unknown, path: string): unknown {
  let current: unknown = source;
  for (const key of path.split(".")) {
    if (current === null || typeof current !== "object") return undefined;
    current = (current as Record<string, unknown>)[key];
  }
  return current;
}

/** التسلسل يستعمل التمثيل النصي لقيمة JSON: true/false صغيرة، والغائب فراغ */
function scalar(value: unknown): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "boolean") return value ? "true" : "false";
  if (typeof value === "number") return String(value);
  if (typeof value === "string") return value;
  return "";
}

function concatFields(obj: unknown, fields: readonly string[]): string {
  return fields.map((field) => scalar(dig(obj, field))).join("");
}

function statusOf(obj: Record<string, unknown>): PaymentIntentStatus {
  if (obj.is_voided === true || obj.is_refunded === true) return "cancelled";
  if (obj.success === true) return obj.pending === true ? "pending" : "succeeded";
  if (obj.pending === true) return "pending";
  return "failed";
}

export const paymobAdapter: PaymentAdapter = {
  provider: "paymob",

  async createIntent(input) {
    const env = requireEnv("paymob", PAYMOB_ENV_KEYS);

    // المعرّفات العامة من اللوحة لا من البيئة — ليست أسراراً، ويحتاج المالك
    // تبديلها بين وسائل الدفع (بطاقة، محفظة، تقسيط) بلا إعادة نشر.
    const integrationId =
      input.settings.publicConfig.integrationId ?? input.settings.publicConfig.integration_id ?? "";
    const iframeId =
      input.settings.publicConfig.iframeId ?? input.settings.publicConfig.iframe_id ?? "";

    if (integrationId.trim() === "" || iframeId.trim() === "") {
      throw new PaymentProviderError(
        "paymob",
        "not-configured",
        "أدخل «integrationId» و«iframeId» في إعدادات بوابة Paymob من اللوحة.",
        { missing: ["integrationId", "iframeId"] }
      );
    }

    const currency = normalizeCurrency(input.currency) ?? "EGP";
    // مرجع فريد لكل محاولة: Paymob يرفض تكرار merchant_order_id، ومحاولة ثانية
    // على الحجز نفسه أمر عادي تماماً (بطاقة مرفوضة ثم أخرى).
    const merchantOrderId = `${input.reference}-${randomAlnum(5)}`;

    // (١) رمز الجلسة
    const auth = await httpJson({
      provider: "paymob",
      url: `${BASE_URL}/api/auth/tokens`,
      body: { api_key: env.PAYMOB_API_KEY },
    });
    const authToken = readString(auth, "token");
    if (authToken === null) {
      throw new PaymentProviderError("paymob", "invalid-response", "لم يُرجع Paymob رمز جلسة.");
    }

    // (٢) الطلب
    const order = await httpJson({
      provider: "paymob",
      url: `${BASE_URL}/api/ecommerce/orders`,
      body: {
        auth_token: authToken,
        delivery_needed: false,
        amount_cents: String(input.amountMinor),
        currency,
        merchant_order_id: merchantOrderId,
        items: [],
      },
    });
    const orderId = readString(order, "id");
    if (orderId === null) {
      throw new PaymentProviderError("paymob", "invalid-response", "لم يُرجع Paymob معرّف الطلب.");
    }

    // (٣) مفتاح الدفع — `billing_data` إلزامية الحقول عند Paymob، والمجهول منها
    //     يُرسل "NA" كما توثّق هي نفسها (لا نجمع بيانات لا نحتاجها).
    const key = await httpJson({
      provider: "paymob",
      url: `${BASE_URL}/api/acceptance/payment_keys`,
      body: {
        auth_token: authToken,
        amount_cents: String(input.amountMinor),
        expiration: 3600,
        order_id: orderId,
        currency,
        integration_id: Number(integrationId) || integrationId,
        lock_order_when_paid: true,
        billing_data: {
          first_name: "NA",
          last_name: "NA",
          email: "NA@NA.com",
          phone_number: "NA",
          apartment: "NA",
          floor: "NA",
          street: "NA",
          building: "NA",
          shipping_method: "NA",
          postal_code: "NA",
          city: "NA",
          state: "NA",
          country: "NA",
        },
      },
    });
    const paymentToken = readString(key, "token");
    if (paymentToken === null) {
      throw new PaymentProviderError("paymob", "invalid-response", "لم يُرجع Paymob مفتاح الدفع.");
    }

    const redirectUrl =
      `${BASE_URL}/api/acceptance/iframes/${encodeURIComponent(iframeId)}` +
      `?payment_token=${encodeURIComponent(paymentToken)}`;

    // المرجع هو **معرّف الطلب الرقمي** لا `merchant_order_id`: هو الحقل الذي
    // يغطيه توقيع Paymob (`order.id` داخل قائمتَي HMAC أعلاه). ربط الحجز بحقل
    // خارج التوقيع يعني أن المهاجم يوقّع مبلغاً صحيحاً ثم يوجّهه إلى حجز آخر.
    // ويبقى `merchant_order_id` في الحمولة للمطابقة البشرية فقط.
    return { providerRef: String(orderId), redirectUrl };
  },

  verifySignature({ rawBody, headers }) {
    const env = requireEnv("paymob", ["PAYMOB_HMAC_SECRET"]);

    let body: unknown;
    try {
      body = JSON.parse(rawBody);
    } catch {
      return false;
    }
    if (body === null || typeof body !== "object") return false;

    const obj = (body as Record<string, unknown>).obj;
    if (obj === null || typeof obj !== "object") return false;

    // التوقيع في الاستعلام أولاً (المسار المنشور)، ثم في الجسم لمن يرسله هكذا
    const provided =
      pickHeader(headers, "x-query-hmac", "hmac") ??
      (typeof (body as Record<string, unknown>).hmac === "string"
        ? ((body as Record<string, unknown>).hmac as string)
        : null);
    if (provided === null) return false;

    for (const fields of [HMAC_FIELDS, HMAC_FIELDS_WITH_PENDING]) {
      const expected = hmacHex("sha512", env.PAYMOB_HMAC_SECRET, concatFields(obj, fields));
      if (safeEqualHex(expected, provided)) return true;
    }
    return false;
  },

  parseEvent({ rawBody }): NormalizedEvent | null {
    let body: unknown;
    try {
      body = JSON.parse(rawBody);
    } catch {
      return null;
    }
    if (body === null || typeof body !== "object") return null;

    const envelope = body as Record<string, unknown>;
    const obj = envelope.obj;
    if (obj === null || typeof obj !== "object") return null;

    const transaction = obj as Record<string, unknown>;
    const transactionId = readString(transaction, "id");
    if (transactionId === null) return null;

    // المرجع المخزَّن هو `order.id` — الحقل الموقَّع وحده. لا ارتداد إلى
    // `merchant_order_id` لأنه خارج التوقيع: قبوله يعيد فتح الباب الذي
    // أُغلق في createIntent (توقيع صحيح موجَّه إلى حجز آخر).
    const merchantRef = readString(transaction, "order", "id");

    const amountText = readString(transaction, "amount_cents");
    const amountValue = amountText === null ? Number.NaN : Number(amountText);
    const status = statusOf(transaction);

    return {
      // معرّف المعاملة هو مفتاح الإحكام: Paymob يعيد إرسال نفس المعاملة عند
      // فشل الاستقبال، وهو ثابت عبر المحاولات.
      eventId: `paymob_${transactionId}`,
      eventType: typeof envelope.type === "string" ? envelope.type : "TRANSACTION",
      providerRef: merchantRef,
      status,
      amountMinor: Number.isFinite(amountValue) ? Math.round(amountValue) : null,
      currency: normalizeCurrency(readString(transaction, "currency")),
      failureReason:
        status === "failed"
          ? readString(transaction, "data", "message") ?? "رفضت الشبكة العملية"
          : null,
    };
  },
};
