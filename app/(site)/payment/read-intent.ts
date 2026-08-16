import type { SupabaseClient } from "@supabase/supabase-js";
import type { PaymentIntentStatus } from "@/lib/payments-types";

/**
 * قارئ حالة جلسة الدفع لصفحة العودة (المرحلة ٩).
 *
 * **القاعدة الثانية في عقد المرحلة**: الـ webhook هو مصدر الحقيقة، وصفحة العودة
 * تعرض ولا تقرر. لذلك هذا الملف **قراءة خالصة**: لا يكتب حرفاً، ولا يستنتج
 * نجاحاً، ولا ينظر إلى معاملات الرابط إطلاقاً — العميل قد يفتح رابطاً فيه
 * `?success=true` ويصل، فلا شيء هنا يصدّقه.
 *
 * النافذة الوحيدة هي `get_payment_intent_status(p_intent uuid)` — دالة
 * `security definer` تُرجع **حقلين لا ثالث لهما**: حالة الجلسة وتوكن الحجز. لا
 * حمولة مزوّد ولا مرجع ولا مبلغ ولا رابط دفع، لأن الصفحة لا تحتاج شيئاً منها
 * ولا يجوز أن تملكه. والزائر المجهول يملك `execute` عليها وحدها: لا SELECT على
 * `payment_intents` بحال (هجرة ٠٠٢٠).
 *
 * الأمان قائم على أن معرّف الجلسة UUID عشوائي لا يعرفه إلا العميل والمزوّد —
 * نفس نموذج الثقة الذي يقوم عليه توكن المتابعة منذ المرحلة ٤.
 *
 * الفشل يعني `null` لا استثناءً: صفحة تقول «تعذّرت قراءة الحالة» أفضل من صفحة
 * لا تُعرض، والعميل حينها يتابع من رابط حجزه.
 */

export type IntentView = {
  status: PaymentIntentStatus | null;
  /** توكن متابعة الحجز — رابط العميل الوحيد إلى صفحته */
  bookingToken: string | null;
};

const STATUSES: PaymentIntentStatus[] = [
  "created",
  "pending",
  "succeeded",
  "failed",
  "cancelled",
  "expired",
];

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** المعرّف صالح شكلاً؟ — يمنع نداءً يفشل حتماً بخطأ صيغة (22P02) */
export const isIntentId = (value: string): boolean => UUID_RE.test(value.trim());

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const readText = (row: Record<string, unknown>, ...keys: string[]): string | null => {
  for (const key of keys) {
    const value = row[key];
    if (typeof value === "string" && value.trim().length > 0) return value.trim();
  }
  return null;
};

/** أول صف من دالة جدولية — PostgREST يعيد مصفوفة، وقد يعيد صفاً مفرداً */
const firstRow = (data: unknown): Record<string, unknown> | null => {
  if (Array.isArray(data)) return isRecord(data[0]) ? data[0] : null;
  return isRecord(data) ? data : null;
};

/**
 * حالة الجلسة وتوكن حجزها كما هما في قاعدة البيانات — أو `null` إن تعذّرت
 * القراءة (معرّف غير صالح، أو جلسة غير موجودة، أو الهجرة لم تُنفَّذ بعد).
 */
export async function readIntentStatus(
  supabase: SupabaseClient,
  intentId: string
): Promise<IntentView | null> {
  const id = intentId.trim();
  if (!isIntentId(id)) return null;

  try {
    const { data, error } = await supabase.rpc("get_payment_intent_status", { p_intent: id });
    if (error) return null;

    const row = firstRow(data);
    if (row === null) return null;

    const status = readText(row, "status");
    return {
      status: STATUSES.find((value) => value === status) ?? null,
      bookingToken: readText(row, "booking_token", "bookingToken", "public_token"),
    };
  } catch {
    return null;
  }
}
