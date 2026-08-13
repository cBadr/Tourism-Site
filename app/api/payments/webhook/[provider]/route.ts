import { startDispatchFor } from "@/lib/dispatch/start";
import { isPaymentProviderError } from "@/lib/payments/errors";
import { bookingIdForRef, settleIntent } from "@/lib/payments/intents";
import { findAdapter } from "@/lib/payments/registry";
import { readOneProviderSettings } from "@/lib/payments/settings";
import { buildHeaderMap } from "@/lib/payments/webhook-headers";
import { createServiceSupabase } from "@/lib/supabase/admin";

/**
 * POST /api/payments/webhook/[provider] — **مصدر الحقيقة الوحيد** للتأكيد.
 *
 * صفحة العودة في المتصفح لا تؤكد شيئاً: العميل قد يغلق المتصفح قبل أن يعود،
 * وقد يفتح رابط النجاح بنفسه بلا أن يدفع. التأكيد يقع هنا وحده — من خادم
 * المزوّد إلى خادمنا، بتوقيع.
 *
 * ── ترتيب لا يُبدَّل ──────────────────────────────────────────────────────
 * (١) قراءة الجسم **خاماً** أولاً: `request.json()` يعيد بناء النص فيغيّر
 *     المسافات وترتيب المفاتيح، والتوقيع محسوب على البايتات كما أُرسلت. أي
 *     تحليل قبل التحقق يكسر توقيعاً صحيحاً — أو أسوأ: يجعلنا نتصرّف بمحتوى لم
 *     نتحقق منه بعد.
 * (٢) التحقق من التوقيع: الرفض ٤٠٠ **بلا أي أثر جانبي** — لا صف حدث، ولا
 *     دفعة، ولا تغيير حالة، ولا بث.
 * (٣) التسوية في SQL: محكمة التكرار على (المزوّد، معرّف الحدث).
 * (٤) البث: حجز دُفع إلكترونياً يدخل البث تماماً كحجز اعتُمد تحويله يدوياً.
 *
 * ── لماذا ٢٠٠ للحدث المكرر ────────────────────────────────────────────────
 * كل المزوّدين يعيدون الإرسال حتى يستلموا ٢٠٠. الرد بخطأ على حدث عالجناه من
 * قبل يعني إعادة إرسال أبدية ثم تعطيل نقطة النهاية من طرفهم. المكرر عندنا
 * **نجاح**: عولج، ولا شيء يُعاد فعله.
 *
 * ── البوابة المعطّلة ──────────────────────────────────────────────────────
 * `enabled` يحكم عرض البوابة في صفحة الدفع لا قبول تأكيداتها. من دفع قبل أن
 * يطفئ المالك البوابة يجب أن يُؤكد حجزه؛ العكس يعني عميلاً دفع وحجزاً معلّقاً.
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const NO_STORE = { "Cache-Control": "no-store" };

/**
 * `returnCode` في كل رد ناجح: Binance Pay لا يعدّ الإشعار مستلَماً إلا برد
 * يحوي `{"returnCode":"SUCCESS"}`. حقل زائد لا يضر بقية المزوّدين، وإضافته
 * للجميع أنظف من فرع `if (provider === "binancepay")` داخل مسار مشترك.
 */
function ok(payload: Record<string, unknown>): Response {
  return Response.json(
    { ok: true, returnCode: "SUCCESS", returnMessage: null, ...payload },
    { status: 200, headers: NO_STORE }
  );
}

function log(level: "info" | "warn" | "error", data: Record<string, unknown>): void {
  const line = `[payments:webhook] ${JSON.stringify({ at: new Date().toISOString(), ...data })}`;
  if (level === "info") console.info(line);
  else if (level === "warn") console.warn(line);
  else console.error(line);
}

/** الحمولة كما تُخزَّن للتدقيق: JSON إن كان، وإلا حقول النموذج، وإلا النص خاماً */
function asPayload(rawBody: string): Record<string, unknown> {
  try {
    const parsed = JSON.parse(rawBody);
    if (parsed !== null && typeof parsed === "object" && !Array.isArray(parsed)) {
      return parsed as Record<string, unknown>;
    }
    return { value: parsed };
  } catch {
    // إشعارات بترميز النماذج (2Checkout مثلاً)
    if (rawBody.includes("=")) {
      const fields: Record<string, unknown> = {};
      new URLSearchParams(rawBody).forEach((value, key) => {
        fields[key] = value;
      });
      if (Object.keys(fields).length > 0) return fields;
    }
    return { raw: rawBody.slice(0, 4000) };
  }
}

export async function POST(
  request: Request,
  context: { params: Promise<{ provider: string }> }
): Promise<Response> {
  const { provider: providerParam } = await context.params;

  const adapter = findAdapter(providerParam);
  if (adapter === null) {
    // مزوّد مجهول: لا شيء نتحقق منه، ولا شيء نفعله
    return Response.json({ ok: false, code: "unknown-provider" }, { status: 404, headers: NO_STORE });
  }
  const provider = adapter.provider;

  // (١) الجسم الخام قبل أي شيء
  let rawBody: string;
  try {
    rawBody = await request.text();
  } catch {
    return Response.json({ ok: false, code: "unreadable-body" }, { status: 400, headers: NO_STORE });
  }

  const headers = buildHeaderMap(request);

  const supabase = createServiceSupabase();
  if (!supabase) {
    log("error", { provider, stage: "client", code: "no-service-client" });
    // ٥٠٣ لا ٢٠٠: نريد من المزوّد أن يعيد المحاولة بعد إصلاح الإعداد
    return Response.json({ ok: false, code: "db-unavailable" }, { status: 503, headers: NO_STORE });
  }

  // الإعدادات يحتاجها بعض المحوّلات في التحقق (المعرّفات العامة)
  const { settings } = await readOneProviderSettings(supabase, provider);

  // (٢) التوقيع — قبل أي كتابة، ومهما كان مصدر الطلب
  let valid = false;
  try {
    valid = adapter.verifySignature({ rawBody, headers, settings });
  } catch (err) {
    if (isPaymentProviderError(err) && err.code === "not-configured") {
      log("error", { provider, stage: "verify", code: "not-configured", missing: err.missing });
      return Response.json(
        { ok: false, code: "provider-not-configured" },
        { status: 503, headers: NO_STORE }
      );
    }
    log("error", {
      provider,
      stage: "verify",
      code: "verify-failed",
      detail: err instanceof Error ? err.message : String(err),
    });
    return Response.json({ ok: false, code: "verify-failed" }, { status: 400, headers: NO_STORE });
  }

  if (!valid) {
    log("warn", { provider, stage: "verify", code: "bad-signature", bytes: rawBody.length });
    return Response.json({ ok: false, code: "bad-signature" }, { status: 400, headers: NO_STORE });
  }

  // (٣) الحدث الموحّد
  const event = adapter.parseEvent({ rawBody, headers });
  if (event === null) {
    // توقيع صحيح لكن شكل لا نفهمه: لا نطلب إعادة إرسال ما لن نفهمه أبداً
    log("warn", { provider, stage: "parse", code: "unparsable" });
    return ok({ ignored: true, reason: "unparsable" });
  }

  if (event.providerRef === null || event.providerRef.trim() === "") {
    log("warn", { provider, stage: "parse", code: "no-ref", eventId: event.eventId });
    return ok({ ignored: true, reason: "no-ref" });
  }

  // (٤) التسوية — الإحكام كله داخل SQL
  const settled = await settleIntent(supabase, { provider, event, payload: asPayload(rawBody) });

  if (!settled.ok) {
    const missing = settled.code === "no-function" || settled.code === "no-table";
    log("error", {
      provider,
      stage: "settle",
      code: settled.code,
      eventId: event.eventId,
      detail: settled.message,
    });

    // «الجلسة غير موجودة» ليست خطأً عابراً: إعادة الإرسال لن تُنشئها. أما فشل
    // القاعدة أو غياب الهجرة فعابر بطبعه، فنطلب إعادة المحاولة.
    if (settled.code === "intent-not-found" || settled.code === "unknown-ref") {
      return ok({ ignored: true, reason: settled.code });
    }
    return Response.json(
      { ok: false, code: settled.code },
      { status: missing ? 503 : 500, headers: NO_STORE }
    );
  }

  const { outcome } = settled;

  // (٥) البث — نفس الخطاف الذي يعمل عند اعتماد تحويل يدوي، بلا فرق واحد.
  //     لا يُستدعى على حدث مكرر: التسوية لم تُغيّر شيئاً فلا جديد يُبَث.
  //     والشرط هو نتيجة القاعدة نفسها لا حالة الحدث: `settled` وحدها تضمن أن
  //     الحجز صار «مؤكداً»، وهو ما تشترطه `start_dispatch`. أما `recorded`
  //     (وصل المال وحجزه غير قابل للتأكيد) و`already_processed` فلا بث فيهما.
  let dispatch: string | null = null;
  if (outcome.confirmed) {
    const bookingId =
      outcome.bookingId ?? (await bookingIdForRef(supabase, provider, event.providerRef));

    if (bookingId === null) {
      log("warn", { provider, stage: "dispatch", code: "no-booking", ref: event.providerRef });
    } else {
      // لا يرمي أبداً بعقده: فشل البث لا يجوز أن يُفشل تأكيد دفعة وصلت
      const result = await startDispatchFor(bookingId);
      dispatch = result.started ? "started" : (result.reason ?? "skipped");
    }
  }

  log("info", {
    provider,
    stage: "done",
    eventId: event.eventId,
    eventType: event.eventType,
    ref: event.providerRef,
    status: event.status,
    outcome: outcome.result,
    fresh: outcome.fresh,
    dispatch,
  });

  return ok({
    eventId: event.eventId,
    status: outcome.status ?? event.status,
    outcome: outcome.result,
    replayed: outcome.result === "already_processed",
    dispatch,
  });
}
