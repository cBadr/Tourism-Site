import type { StartPaymentResponse } from "@/lib/payments-types";

import { isPaymentProviderError } from "@/lib/payments/errors";
import { attachIntentRef, createIntent, resolveBooking } from "@/lib/payments/intents";
import { findAdapter } from "@/lib/payments/registry";
import { readOneProviderSettings } from "@/lib/payments/settings";
import { createServiceSupabase } from "@/lib/supabase/admin";

/**
 * POST /api/payments/start — بدء دفعة إلكترونية على حجز قائم.
 *
 * الجسم: `{ bookingToken, provider }` — **ولا شيء غير ذلك يُقرأ منه.**
 *
 * ── القاعدة الأولى من قواعد العقد ─────────────────────────────────────────
 * المبلغ لا يأتي من المتصفح أبداً. هذا المسار لا يقرأ حقل مبلغ حتى لو أُرسل:
 * التوكن يُترجم إلى حجز في الخادم، ثم `create_payment_intent` في Postgres تقرأ
 * `bookings.amount_due` وتحوّلها إلى وحدات صغرى. لو أُتيح للمتصفح تمرير رقم
 * لأمكن شراء رحلة القاهرة–أسوان بجنيه واحد.
 *
 * ── الترتيب مقصود ─────────────────────────────────────────────────────────
 * الحجز ← البوابة مفعّلة؟ ← جلسة في قاعدتنا **قبل** نداء المزوّد ← نداء
 * المزوّد ← تثبيت المرجع. السبب: جلسة بلا مرجع أثر مرئي في اللوحة يشرح ما جرى،
 * أما مرجع لدى مزوّد بلا صف عندنا فدفعة يتيمة لا يعرف النظام لمن تُنسب.
 *
 * ── ما لا يقرره هذا المسار ────────────────────────────────────────────────
 * لا يؤكد حجزاً ولا يقيّد في الدفتر ولا يبدأ بثاً. رابط الدفع وحده ما يعيده،
 * والتأكيد يقع في الـ webhook حصراً (القاعدة الثانية).
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const NO_STORE = { "Cache-Control": "no-store" };

/** توكن المتابعة العام: ٤٨ محرفاً ست عشرياً، والدوال ترفض ما دون ٣٢ */
const TOKEN_PATTERN = /^[A-Za-z0-9_-]{32,128}$/;

function fail(code: string, message: string, status: number): Response {
  const body: StartPaymentResponse = { ok: false, code, message };
  return Response.json(body, { status, headers: NO_STORE });
}

/**
 * أصل الموقع للروابط المطلقة التي يحتاجها المزوّد (العودة والـ webhook).
 *
 * `SITE_URL` أولاً لأنه ما يعرفه المالك ويسجّله في لوحات البوابات، ثم عنوان
 * Vercel، وأخيراً أصل الطلب نفسه — والأخير أدق من «localhost» ثابتة: نفق
 * تطوير (ngrok مثلاً) هو الطريق الوحيد لاستقبال webhook حقيقي على جهاز محلي.
 */
function baseUrl(request: Request): string {
  const configured = process.env.SITE_URL?.trim();
  if (configured) return configured.replace(/\/+$/, "");

  const vercel = process.env.VERCEL_URL?.trim();
  if (vercel) return `https://${vercel.replace(/\/+$/, "")}`;

  return new URL(request.url).origin;
}

export async function POST(request: Request): Promise<Response> {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return fail("invalid-input", "تعذّرت قراءة بيانات الطلب.", 400);
  }

  const input = (body ?? {}) as Record<string, unknown>;
  const token = typeof input.bookingToken === "string" ? input.bookingToken.trim() : "";
  const providerCode = typeof input.provider === "string" ? input.provider.trim() : "";

  if (!TOKEN_PATTERN.test(token)) {
    return fail("invalid-input", "رابط متابعة الحجز غير صالح.", 400);
  }

  const adapter = findAdapter(providerCode);
  if (adapter === null) {
    return fail("unknown-provider", "وسيلة الدفع المطلوبة غير معروفة.", 400);
  }
  const provider = adapter.provider;

  const supabase = createServiceSupabase();
  if (!supabase) {
    return fail(
      "db-unavailable",
      "خدمة الدفع غير متاحة الآن (إعدادات قاعدة البيانات ناقصة).",
      503
    );
  }

  // (١) الحجز من توكنه — هنا وحده يُعرف المبلغ والعملة
  const booking = await resolveBooking(supabase, token);
  if (!booking.ok) {
    const status = booking.code === "booking-not-found" ? 404 : 503;
    return fail(booking.code, "تعذّر العثور على الحجز المطلوب.", status);
  }

  if (booking.booking.status !== "pending_payment") {
    return fail(
      "invalid-status",
      booking.booking.status === "confirmed" || booking.booking.status === "assigned"
        ? "هذا الحجز مؤكَّد بالفعل."
        : "لا يمكن بدء دفعة والحجز في حالته الحالية.",
      409
    );
  }

  // (٢) البوابة مفعّلة من اللوحة؟ — المعطّلة تختفي من صفحة الدفع، ومن يستدعي
  //     المسار مباشرة يُرد بنفس القرار (لا حراسة في الواجهة وحدها).
  const { settings } = await readOneProviderSettings(supabase, provider);
  if (!settings.enabled) {
    return fail("provider-disabled", "وسيلة الدفع هذه غير مفعّلة حالياً.", 403);
  }

  // (٣) الجلسة في قاعدتنا أولاً — والمبلغ يُحسب داخل SQL لا هنا
  const created = await createIntent(supabase, {
    bookingId: booking.booking.id,
    provider,
    // احتياط لا مصدر: يُستعمل فقط لو اشترطت نسخة الدالة في القاعدة مبلغاً
    // صريحاً، وهو محسوب من الحجز الذي قرأناه للتوّ لا من جسم الطلب.
    fallbackAmountMinor: Math.round(booking.booking.amountDue * 100),
    fallbackCurrency: booking.booking.currency,
  });
  if (!created.ok) {
    const status = created.code === "no-function" || created.code === "no-table" ? 503 : 400;
    return fail(
      created.code,
      status === 503
        ? "منظومة الدفع الإلكتروني غير مهيّأة على قاعدة البيانات بعد."
        : "تعذّر بدء الدفع لهذا الحجز.",
      status
    );
  }

  const { intentId, amountMinor, currency } = created.intent;
  const origin = baseUrl(request);

  // (٤) نداء المزوّد
  let providerRef: string;
  let redirectUrl: string;
  try {
    const result = await adapter.createIntent({
      bookingId: booking.booking.id,
      reference: booking.booking.reference,
      amountMinor,
      currency,
      returnUrl: `${origin}/payment/return/${intentId}`,
      webhookUrl: `${origin}/api/payments/webhook/${provider}`,
      settings,
    });
    providerRef = result.providerRef;
    redirectUrl = result.redirectUrl;
  } catch (err) {
    // الرسالة الفنية للسجل وحده: قد تحمل رد المزوّد بحرفه
    console.error(
      `[payments:start] ${JSON.stringify({
        provider,
        intentId,
        code: isPaymentProviderError(err) ? err.code : "unknown",
        detail: err instanceof Error ? err.message : String(err),
      })}`
    );

    if (isPaymentProviderError(err) && err.code === "not-configured") {
      return fail(
        "provider-not-configured",
        "وسيلة الدفع هذه لم تُستكمل إعداداتها بعد. جرّب وسيلة أخرى أو تواصل معنا.",
        503
      );
    }
    return fail("provider-error", "تعذّر فتح صفحة الدفع لدى المزوّد. حاول مرة أخرى.", 502);
  }

  // (٥) تثبيت المرجع — بدونه لا يجد الـ webhook جلسته
  const attached = await attachIntentRef(supabase, { intentId, providerRef, redirectUrl });
  if (!attached.ok) {
    console.error(
      `[payments:start] ${JSON.stringify({ provider, intentId, providerRef, code: attached.code })}`
    );
    return fail("intent-failed", "تعذّر حفظ بيانات جلسة الدفع. حاول مرة أخرى.", 500);
  }

  const ok: StartPaymentResponse = { ok: true, intentId, redirectUrl };
  return Response.json(ok, { status: 200, headers: NO_STORE });
}
