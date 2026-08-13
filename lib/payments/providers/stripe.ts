import type { NormalizedEvent, PaymentAdapter, PaymentIntentStatus } from "@/lib/payments-types";

import { normalizeCurrency } from "@/lib/payments/amount";
import { hmacHex, safeEqualHex } from "@/lib/payments/crypto";
import { PaymentProviderError, requireEnv } from "@/lib/payments/errors";
import { httpJson, readNumber, readString } from "@/lib/payments/http";
import { pickHeader } from "@/lib/payments/webhook-headers";

/**
 * Stripe — جلسة دفع مستضافة (Checkout Session).
 *
 * ── التدفق ────────────────────────────────────────────────────────────────
 * POST https://api.stripe.com/v1/checkout/sessions بجسم `x-www-form-urlencoded`
 * (Stripe لا تقبل JSON في هذه الواجهة) ← يرد `{ id, url }`، فنعيد `url` رابطَ
 * دفع و`id` (بصيغة `cs_...`) مرجعاً. نفس المعرّف يعود في الـ webhook داخل
 * `data.object.id` فتلتقي التسوية بجلستها.
 *
 * ── التوقيع ───────────────────────────────────────────────────────────────
 * ترويسة `Stripe-Signature` بصيغة `t=<طابع زمني>,v1=<توقيع>` (وقد تحمل أكثر من
 * `v1` أثناء تدوير السرّ). المُوقَّع عليه هو `"<t>.<الجسم الخام>"` بـ HMAC-SHA256
 * والمفتاح `STRIPE_WEBHOOK_SECRET` (يبدأ بـ `whsec_`) — **لا مفتاح الحساب**؛
 * خلطهما خطأ شائع ينتج رفضاً دائماً.
 *
 * وهناك نافذة زمنية (٥ دقائق): بدونها يستطيع من التقط طلباً صحيحاً إعادة بثّه
 * بعد شهر بتوقيع سليم. الإحكام في `settle_payment_intent` يمنع أثره المزدوج،
 * لكن رفضه هنا أنظف.
 */

const API_BASE = "https://api.stripe.com/v1";

const TOLERANCE_SECONDS = 300;

export const STRIPE_ENV_KEYS = ["STRIPE_SECRET_KEY", "STRIPE_WEBHOOK_SECRET"];

/** حالات الجلسة/النية عند Stripe ← حالات العقد */
function statusOf(eventType: string, object: Record<string, unknown>): PaymentIntentStatus {
  const paymentStatus = readString(object, "payment_status");
  const objectStatus = readString(object, "status");

  if (eventType === "checkout.session.completed" || eventType === "checkout.session.async_payment_succeeded") {
    return paymentStatus === "paid" || paymentStatus === "no_payment_required" ? "succeeded" : "pending";
  }
  if (eventType === "checkout.session.expired") return "expired";
  if (eventType === "checkout.session.async_payment_failed") return "failed";
  if (eventType === "payment_intent.succeeded") return "succeeded";
  if (eventType === "payment_intent.payment_failed") return "failed";
  if (eventType === "payment_intent.canceled") return "cancelled";

  if (objectStatus === "complete") return "succeeded";
  if (objectStatus === "expired") return "expired";
  return "pending";
}

export const stripeAdapter: PaymentAdapter = {
  provider: "stripe",

  async createIntent(input) {
    // المفتاحان معاً لا مفتاح البدء وحده: من يستطيع فتح صفحة دفع ولا يستطيع
    // التحقق من إشعارها يقبض مالاً بلا أن يؤكد حجزاً — وهو أسوأ من التعطّل.
    const env = requireEnv("stripe", STRIPE_ENV_KEYS);

    const currency = normalizeCurrency(input.currency) ?? "EGP";
    const form = new URLSearchParams();
    form.set("mode", "payment");
    form.set("success_url", input.returnUrl);
    form.set("cancel_url", input.returnUrl);
    // مرجعنا داخل الجلسة: يظهر في لوحة Stripe وفي كل حدث، فتتم المطابقة
    // اليدوية عند المراجعة المالية بلا بحث.
    form.set("client_reference_id", input.reference);
    form.set("metadata[booking_id]", input.bookingId);
    form.set("metadata[reference]", input.reference);
    form.set("line_items[0][quantity]", "1");
    form.set("line_items[0][price_data][currency]", currency.toLowerCase());
    form.set("line_items[0][price_data][unit_amount]", String(input.amountMinor));
    form.set("line_items[0][price_data][product_data][name]", `حجز ${input.reference}`);

    const session = await httpJson({
      provider: "stripe",
      url: `${API_BASE}/checkout/sessions`,
      headers: { Authorization: `Bearer ${env.STRIPE_SECRET_KEY}` },
      body: form,
    });

    const id = readString(session, "id");
    const url = readString(session, "url");
    if (id === null || url === null) {
      throw new PaymentProviderError(
        "stripe",
        "invalid-response",
        "لم تُرجع Stripe معرّف الجلسة أو رابط الدفع."
      );
    }

    return { providerRef: id, redirectUrl: url };
  },

  verifySignature({ rawBody, headers }) {
    const env = requireEnv("stripe", ["STRIPE_WEBHOOK_SECRET"]);

    const header = pickHeader(headers, "stripe-signature");
    if (header === null) return false;

    let timestamp = "";
    const signatures: string[] = [];
    for (const part of header.split(",")) {
      const [key, value] = part.split("=", 2);
      if (key === undefined || value === undefined) continue;
      if (key.trim() === "t") timestamp = value.trim();
      if (key.trim() === "v1") signatures.push(value.trim());
    }

    if (timestamp === "" || signatures.length === 0) return false;

    const sent = Number(timestamp);
    if (!Number.isFinite(sent)) return false;
    const age = Math.abs(Math.floor(Date.now() / 1000) - sent);
    if (age > TOLERANCE_SECONDS) return false;

    const expected = hmacHex("sha256", env.STRIPE_WEBHOOK_SECRET, `${timestamp}.${rawBody}`);
    return signatures.some((signature) => safeEqualHex(expected, signature));
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
    const eventType = readString(event, "type");
    const object = (event.data as Record<string, unknown> | undefined)?.object;

    if (eventId === null || eventType === null || object === null || typeof object !== "object") {
      return null;
    }

    const payload = object as Record<string, unknown>;
    const status = statusOf(eventType, payload);
    const amount = readNumber(payload, "amount_total") ?? readNumber(payload, "amount");

    return {
      eventId,
      eventType,
      // مرجعنا هو معرّف الجلسة؛ وحين يأتي الحدث من `payment_intent` مباشرة لا
      // تحمل الحمولة معرّف الجلسة، فنقع على `client_reference_id` كاحتياط.
      providerRef: readString(payload, "id") ?? readString(payload, "client_reference_id"),
      status,
      amountMinor: amount === null ? null : Math.round(amount),
      currency: normalizeCurrency(readString(payload, "currency")),
      failureReason:
        status === "failed"
          ? readString(payload, "last_payment_error", "message") ?? "رفضت Stripe العملية"
          : null,
    };
  },
};
