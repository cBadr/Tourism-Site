import type { NormalizedEvent, PaymentAdapter, PaymentIntentStatus } from "@/lib/payments-types";

import { hmacHex, randomAlnum, safeEqualHex } from "@/lib/payments/crypto";
import { notConfigured, readEnv } from "@/lib/payments/errors";

/**
 * المزوّد الاختباري — البوابة الوحيدة التي تعمل اليوم، وهي ليست لعبة.
 *
 * ── لماذا يوجد ────────────────────────────────────────────────────────────
 * لا حساب بوابة واحداً جاهزاً، وبعض المزوّدين قد لا يقبلون فرداً في مصر أصلاً.
 * بناء مرحلة كاملة على «سنجرّب حين نفتح حساباً» يعني شفرة لا تُختبر إطلاقاً —
 * ثم يُكتشف أول عطب يوم يدفع عميل حقيقي. لذلك هذا المحوِّل يسلك **نفس المسار
 * حرفياً**: إنشاء جلسة ← إعادة توجيه إلى صفحة دفع ← webhook موقّع ← تسوية ←
 * قيد في الدفتر ← بدء البث. لا فرع واحد في أي ملف خارج هذا الملف يعرف بوجوده.
 *
 * ── صفحة الدفع ────────────────────────────────────────────────────────────
 * الإعادة تذهب إلى `/api/payments/sandbox/<ref>` — وهي بمنزلة موقع المزوّد:
 * تعرض المبلغ وزرَّي «نجحت» و«فشلت»، وعند الضغط تُنشئ حدثاً موقّعاً وترسله إلى
 * `/api/payments/webhook/test` تماماً كما يفعل مزوّد حقيقي من خادمه.
 *
 * ── السرّ ─────────────────────────────────────────────────────────────────
 * مشتق من `NOTIFY_DISPATCH_KEY` (لا مساوٍ له: نشتقه بـ HMAC على ثابت، فلا
 * يتسرب مفتاح تشغيل العامل من توقيع دفعة). وفي التطوير وحده يُقبل سرّ احتياطي
 * ثابت حتى يعمل المزوّد بلا أي إعداد على جهاز المالك. أما في الإنتاج فغياب
 * `NOTIFY_DISPATCH_KEY` يعني أن السرّ معروف للجميع — وسرّ معروف ليس توقيعاً —
 * فيرمي المحوّل «غير مهيّأ» بدل أن يقبل أحداثاً يستطيع أي أحد تلفيقها.
 */

export const TEST_SIGNATURE_HEADER = "x-test-signature";

/** ثابت الاشتقاق — تغييره يُبطل كل الروابط والتواقيع القديمة (وهو مقصود) */
const SECRET_LABEL = "tours:payments:test-provider:v1";

/** يُستعمل في التطوير فقط — قيمة معلومة عمداً ولا معنى لإخفائها */
const DEV_FALLBACK = "tours-local-development-test-provider";

/**
 * حارس ثانٍ مستقل عن اللوحة تماماً.
 *
 * تفعيل صف البوابة من `/admin/payments` سهواً على موقع منشور يعني زر «أكّد
 * حجزي مجاناً»: يُقيَّد إيراد وهمي في الدفتر ويُبَث الطلب على المتعهدين. لذلك
 * لا يكفي الصف — يلزم متغيّر بيئة صريح لا يُضبط في الإنتاج أبداً. أي مسار في
 * هذا المزوّد (إنشاء جلسة، توقيع، تحقق) يمر من هنا أولاً.
 */
export function assertTestPaymentsAllowed(): void {
  if (readEnv("ALLOW_TEST_PAYMENTS") === "1") return;
  if (process.env.NODE_ENV !== "production") return;
  throw notConfigured("test", ["ALLOW_TEST_PAYMENTS"]);
}

export function testSigningSecret(): string {
  assertTestPaymentsAllowed();

  const key = readEnv("NOTIFY_DISPATCH_KEY");
  if (key !== null) return hmacHex("sha256", key, SECRET_LABEL);

  if (process.env.NODE_ENV === "production") {
    throw notConfigured("test", ["NOTIFY_DISPATCH_KEY"]);
  }
  return hmacHex("sha256", DEV_FALLBACK, SECRET_LABEL);
}

/* ────────────────────────────────────────────────────────────────────────────
 * رابط صفحة الدفع الوهمية
 *
 * كل ما تحتاجه الصفحة يسافر في الرابط، **وموقّعاً**: بلا التوقيع يصبح المسار
 * آلة تُصدر أحداث دفع صحيحة لأي مرجع وأي مبلغ يكتبه الزائر في شريط العنوان.
 * ومع التوقيع لا ينشئ الرابطَ إلا `createIntent` نفسه.
 * ──────────────────────────────────────────────────────────────────────────── */

export type SandboxLink = {
  ref: string;
  amountMinor: number;
  currency: string;
  returnUrl: string;
  webhookUrl: string;
};

function linkPayload(link: SandboxLink): string {
  return [link.ref, String(link.amountMinor), link.currency, link.returnUrl, link.webhookUrl].join("|");
}

export function signSandboxLink(link: SandboxLink): string {
  return hmacHex("sha256", testSigningSecret(), linkPayload(link));
}

export function verifySandboxLink(link: SandboxLink, signature: string): boolean {
  return safeEqualHex(signSandboxLink(link), signature);
}

/* ────────────────────────────────────────────────────────────────────────────
 * الحدث وتوقيعه — ما يرسله «المزوّد» إلى الـ webhook
 * ──────────────────────────────────────────────────────────────────────────── */

/**
 * معرّف الحدث ثابت لكل (مرجع + نتيجة) عمداً: الضغط على «نجحت» مرتين يرسل
 * **الحدث نفسه** لا حدثاً جديداً، فتُختبر قاعدة الإحكام (idempotency) بضغطة
 * زر بدل انتظار إعادة إرسال من مزوّد حقيقي.
 */
export function testEventId(ref: string, status: "succeeded" | "failed"): string {
  return `evt_${ref}_${status}`;
}

export function buildTestEvent(input: {
  ref: string;
  status: "succeeded" | "failed";
  amountMinor: number;
  currency: string;
}): Record<string, unknown> {
  return {
    id: testEventId(input.ref, input.status),
    type: input.status === "succeeded" ? "payment.succeeded" : "payment.failed",
    ref: input.ref,
    status: input.status,
    amountMinor: input.amountMinor,
    currency: input.currency,
    failureReason: input.status === "failed" ? "رفض تجريبي من صفحة الاختبار" : null,
    createdAt: new Date().toISOString(),
  };
}

/** توقيع الجسم الخام — بالضبط ما يتحقق منه `verifySignature` أدناه */
export function signTestBody(rawBody: string): string {
  return hmacHex("sha256", testSigningSecret(), rawBody);
}

/* ────────────────────────────────────────────────────────────────────────────
 * المحوِّل
 * ──────────────────────────────────────────────────────────────────────────── */

const STATUS_MAP: Record<string, PaymentIntentStatus> = {
  succeeded: "succeeded",
  failed: "failed",
  cancelled: "cancelled",
  expired: "expired",
  pending: "pending",
};

export const testAdapter: PaymentAdapter = {
  provider: "test",

  async createIntent(input) {
    assertTestPaymentsAllowed();

    // المرجع من إنتاجنا لأن «المزوّد» هنا نحن — والعشوائية تمنع تصادم محاولتين
    // على الحجز نفسه (كل محاولة جلسة مستقلة بمعرّف مستقل).
    const ref = `TEST-${input.reference}-${randomAlnum(6)}`;

    const link: SandboxLink = {
      ref,
      amountMinor: input.amountMinor,
      currency: input.currency,
      returnUrl: input.returnUrl,
      webhookUrl: input.webhookUrl,
    };

    // أصل الموقع يُشتق من رابط الـ webhook الذي مرّره المسار: صفحة الدفع
    // الوهمية تسكن نفس النطاق دائماً، فلا حاجة لقراءة إعداد آخر قد يختلف.
    const origin = new URL(input.webhookUrl).origin;
    const url = new URL(`/api/payments/sandbox/${encodeURIComponent(ref)}`, origin);
    url.searchParams.set("amount", String(input.amountMinor));
    url.searchParams.set("currency", input.currency);
    url.searchParams.set("return", input.returnUrl);
    url.searchParams.set("webhook", input.webhookUrl);
    url.searchParams.set("sig", signSandboxLink(link));

    return { providerRef: ref, redirectUrl: url.toString() };
  },

  verifySignature({ rawBody, headers }) {
    const signature = headers[TEST_SIGNATURE_HEADER] ?? "";
    if (signature.trim() === "") return false;
    return safeEqualHex(signTestBody(rawBody), signature);
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
    const eventId = typeof event.id === "string" ? event.id : "";
    const ref = typeof event.ref === "string" ? event.ref : "";
    const status = STATUS_MAP[String(event.status ?? "")];

    if (eventId === "" || ref === "" || status === undefined) return null;

    const amount = Number(event.amountMinor);

    return {
      eventId,
      eventType: typeof event.type === "string" ? event.type : `payment.${status}`,
      providerRef: ref,
      status,
      amountMinor: Number.isFinite(amount) ? Math.round(amount) : null,
      currency: typeof event.currency === "string" ? event.currency : null,
      failureReason: typeof event.failureReason === "string" ? event.failureReason : null,
    };
  },
};
