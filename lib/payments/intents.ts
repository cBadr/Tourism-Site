import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import type { NormalizedEvent, PaymentProvider } from "@/lib/payments-types";

/**
 * غلاف رقيق فوق دوال المرحلة ٩ في Postgres — ولا حساب مالي واحد هنا.
 *
 * القاعدة المعمارية للمشروع كله: **كل رقم مالي يُحسب في SQL.** لذلك هذا الملف
 * لا يضرب في مئة ولا يقارن مبلغاً بمبلغ؛ يمرّر ويقرأ ويترجم الأخطاء. أي حساب
 * يظهر هنا يعني نسخة ثانية من الحقيقة تختلف عن الأولى يوماً ما.
 *
 * كل الدوال تُستدعى بعميل الخدمة: مسار الـ webhook بلا جلسة أصلاً، ومسار البدء
 * يقرأ الحجز بتوكنه — والتحقق من التوكن نفسه هو الإذن.
 *
 * اتفاقية الأخطاء في هذا المشروع: كل `raise exception` في SQL يحمل
 * `using hint = '<رمز>'`، فنقرأ `error.hint` رمزاً ونحوّله إلى حالة HTTP.
 */

const NO_TABLE = new Set(["42P01", "PGRST205"]);
const NO_FUNCTION = new Set(["42883", "PGRST202"]);

export type DbFailure = {
  ok: false;
  /** no-function | no-table | رمز التلميح من SQL | rpc-failed */
  code: string;
  message: string;
};

type RpcError = { code?: string; message?: string; hint?: string } | null;

function failure(error: RpcError, fallback: string): DbFailure {
  const code = error?.code ?? "";
  const hint = typeof error?.hint === "string" ? error.hint.trim() : "";

  return {
    ok: false,
    code: NO_FUNCTION.has(code)
      ? "no-function"
      : NO_TABLE.has(code)
        ? "no-table"
        : hint !== ""
          ? hint
          : "rpc-failed",
    message: error?.message ?? fallback,
  };
}

/** أول صف من دالة تُرجع جدولاً — PostgREST يعيد مصفوفة، وقد يعيد قيمة مفردة */
function firstRow(data: unknown): Record<string, unknown> | null {
  if (Array.isArray(data)) {
    const row = data[0];
    return row !== null && typeof row === "object" ? (row as Record<string, unknown>) : null;
  }
  if (data !== null && typeof data === "object") return data as Record<string, unknown>;
  return null;
}

function str(row: Record<string, unknown> | null, ...keys: string[]): string | null {
  if (row === null) return null;
  for (const key of keys) {
    const value = row[key];
    if (typeof value === "string" && value.trim() !== "") return value;
    if (typeof value === "number" && Number.isFinite(value)) return String(value);
  }
  return null;
}

function int(row: Record<string, unknown> | null, ...keys: string[]): number | null {
  const value = str(row, ...keys);
  if (value === null) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.round(parsed) : null;
}

function flag(row: Record<string, unknown> | null, ...keys: string[]): boolean | null {
  if (row === null) return null;
  for (const key of keys) {
    const value = row[key];
    if (typeof value === "boolean") return value;
    if (typeof value === "string") {
      const text = value.trim().toLowerCase();
      if (text === "true" || text === "t") return true;
      if (text === "false" || text === "f") return false;
    }
  }
  return null;
}

/* ────────────────────────────────────────────────────────────────────────────
 * (١) الحجز من توكنه — عبر `get_booking_by_token` (منفذ الضيف الوحيد)
 * ──────────────────────────────────────────────────────────────────────────── */

export type BookingForPayment = {
  id: string;
  reference: string;
  status: string;
  amountDue: number;
  currency: string;
};

export async function resolveBooking(
  supabase: SupabaseClient,
  token: string
): Promise<{ ok: true; booking: BookingForPayment } | DbFailure> {
  const { data, error } = await supabase.rpc("get_booking_by_token", { p_token: token });
  if (error) return failure(error as RpcError, "تعذّر قراءة الحجز");

  const row = firstRow(data);
  const id = str(row, "id");
  if (row === null || id === null) {
    return { ok: false, code: "booking-not-found", message: "لا يوجد حجز بهذا الرابط" };
  }

  const amountText = str(row, "amount_due", "amountDue") ?? "0";

  return {
    ok: true,
    booking: {
      id,
      reference: str(row, "reference") ?? "",
      status: str(row, "status") ?? "",
      amountDue: Number(amountText),
      currency: str(row, "currency") ?? "EGP",
    },
  };
}

/* ────────────────────────────────────────────────────────────────────────────
 * (٢) إنشاء جلسة الدفع — `create_payment_intent`
 *
 * **المبلغ يُحسب في SQL** من `bookings.amount_due`. نمرّر `p_amount_minor` و
 * `p_currency` فارغين (null) وهي إشارة صريحة: «احسبهما أنت».
 *
 * والاحتياط أدناه مقصود: لو كانت نسخة الدالة في القاعدة تشترط المبلغ صراحةً
 * (لا تقبل null)، نعيد المحاولة مرة واحدة بقيمة **محسوبة في الخادم من الحجز
 * الذي قرأناه للتوّ** — لا من جسم الطلب. المتصفح لا يمسّ هذا الرقم في أي مسار.
 * ──────────────────────────────────────────────────────────────────────────── */

export type CreatedIntent = {
  intentId: string;
  amountMinor: number;
  currency: string;
};

export async function createIntent(
  supabase: SupabaseClient,
  input: { bookingId: string; provider: PaymentProvider; fallbackAmountMinor: number; fallbackCurrency: string }
): Promise<{ ok: true; intent: CreatedIntent } | DbFailure> {
  const call = (amountMinor: number | null, currency: string | null) =>
    supabase.rpc("create_payment_intent", {
      p_booking: input.bookingId,
      p_provider: input.provider,
      p_amount_minor: amountMinor,
      p_currency: currency,
    });

  // نداء واحد بالقيم التي قرأها الخادم من الحجز نفسه (لا من جسم الطلب) —
  // فتبقى القاعدة الأولى سليمة، وتصير مقارنة القاعدة تدقيقاً مزدوجاً حقيقياً.
  //
  // كان هنا «نداء استكشافي» بقيم null يعقبه إعادة محاولة: والدالة ترفض null
  // برمز `amount-mismatch` — أي أن **كل** عملية دفع سليمة كانت تُطلق إنذار
  // مكافحة التلاعب ثم تنجح في المحاولة الثانية. إنذار يرن دائماً لا يُسمع.
  const { data, error } = await call(input.fallbackAmountMinor, input.fallbackCurrency);
  if (error) return failure(error as RpcError, "تعذّر إنشاء جلسة الدفع");

  const row = firstRow(data);
  const intentId = str(row, "id", "intent_id", "intentId") ?? (typeof data === "string" ? data : null);
  if (intentId === null) {
    return { ok: false, code: "intent-failed", message: "لم تُرجع القاعدة معرّف جلسة الدفع" };
  }

  return {
    ok: true,
    intent: {
      intentId,
      amountMinor: int(row, "amount_minor", "amountMinor") ?? input.fallbackAmountMinor,
      currency: str(row, "currency") ?? input.fallbackCurrency,
    },
  };
}

/* ────────────────────────────────────────────────────────────────────────────
 * (٣) تثبيت مرجع المزوّد ورابط الدفع — `attach_intent_ref`
 * ──────────────────────────────────────────────────────────────────────────── */

export async function attachIntentRef(
  supabase: SupabaseClient,
  input: { intentId: string; providerRef: string; redirectUrl: string }
): Promise<{ ok: true } | DbFailure> {
  const { error } = await supabase.rpc("attach_intent_ref", {
    p_intent: input.intentId,
    p_ref: input.providerRef,
    p_redirect: input.redirectUrl,
  });

  if (error) return failure(error as RpcError, "تعذّر تثبيت مرجع جلسة الدفع");
  return { ok: true };
}

/* ────────────────────────────────────────────────────────────────────────────
 * (٤) التسوية — `settle_payment_intent`
 *
 * محكمة التكرار داخل SQL: تسجّل الحدث بمفتاح (المزوّد، معرّف الحدث)، وعند
 * النجاح تُنشئ صف `payments` معتمداً — فيقيّده مشغّل المرحلة ٧ في الدفتر —
 * وتنقل الحجز إلى «مؤكد». إعادة إرسال الحدث نفسه لا تُنتج قيداً ثانياً.
 * ──────────────────────────────────────────────────────────────────────────── */

export type SettleOutcome = {
  /**
   * نتيجة الدالة كما هي: settled | recorded | already_processed | failed |
   * ignored | unmatched. المسار يفرّع عليها صراحةً بدل استنتاج «جديد/مكرر».
   */
  result: string;
  /** التسوية اكتملت والحجز صار «مؤكداً» — الشرط الوحيد لبدء البث */
  confirmed: boolean;
  /** هل كان الحدث جديداً؟ false = مكرر مُبتلَع (وهو نجاح لا خطأ) */
  fresh: boolean;
  /** حالة الجلسة بعد التسوية كما أعادتها القاعدة */
  status: string | null;
  bookingId: string | null;
  intentId: string | null;
};

export async function settleIntent(
  supabase: SupabaseClient,
  input: { provider: PaymentProvider; event: NormalizedEvent; payload: unknown }
): Promise<{ ok: true; outcome: SettleOutcome } | DbFailure> {
  // `settle_payment_intent_v2` (هجرة 0021) تفحص العملة قبل أي كتابة ثم تفوّض؛
  // والارتداد إلى التوقيع القديم يبقي المسار عاملاً على قاعدة لم تُرقَّ بعد.
  let { data, error } = await supabase.rpc("settle_payment_intent_v2", {
    p_provider: input.provider,
    p_event_id: input.event.eventId,
    p_ref: input.event.providerRef,
    p_status: input.event.status,
    p_amount_minor: input.event.amountMinor,
    p_currency: input.event.currency,
    p_payload: input.payload ?? {},
  });

  if (error && (error.code === "PGRST202" || error.code === "42883")) {
    ({ data, error } = await supabase.rpc("settle_payment_intent", {
      p_provider: input.provider,
      p_event_id: input.event.eventId,
      p_ref: input.event.providerRef,
      p_status: input.event.status,
      p_amount_minor: input.event.amountMinor,
      p_payload: input.payload ?? {},
    }));
  }

  if (error) return failure(error as RpcError, "تعذّرت تسوية الدفعة");

  const row = firstRow(data);

  // العمود الذي تُرجعه الدالة فعلاً هو `outcome` — وكانت القراءة تبحث عن أسماء
  // لا وجود لها (duplicate/fresh/...) فتُرجع null دائماً، فيُعتبر **كل** حدث
  // جديداً. أثر ذلك ليس نظرياً: الحدث المُعاد إرساله من البوابة كان يُعيد
  // إطلاق البث على المتعهدين في كل مرة.
  const result = str(row, "outcome") ?? "";

  return {
    ok: true,
    outcome: {
      result,
      /** التسوية الوحيدة التي تضمن أن الحجز صار «مؤكداً» — وهي شرط بدء البث */
      confirmed: result === "settled",
      fresh: result !== "already_processed" && result !== "unmatched",
      status: str(row, "intent_status", "status"),
      bookingId: str(row, "booking_id", "bookingId"),
      intentId: str(row, "intent_id", "intentId", "id"),
    },
  };
}

/* ────────────────────────────────────────────────────────────────────────────
 * (٥) الحجز صاحب المرجع — احتياط حين لا تُرجعه دالة التسوية
 *
 * البث لا يبدأ بلا معرّف حجز، وقراءة صف الجلسة أرخص من ترك حجز مدفوع بلا بث.
 * ──────────────────────────────────────────────────────────────────────────── */

export async function bookingIdForRef(
  supabase: SupabaseClient,
  provider: PaymentProvider,
  providerRef: string
): Promise<string | null> {
  try {
    const { data, error } = await supabase
      .from("payment_intents")
      .select("booking_id")
      .eq("provider", provider)
      .eq("provider_ref", providerRef)
      .order("created_at", { ascending: false })
      .limit(1);

    if (error) return null;
    return str(firstRow(data), "booking_id", "bookingId");
  } catch {
    return null;
  }
}
