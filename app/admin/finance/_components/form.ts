import { isMissingFunction, isMissingTable } from "@/lib/dispatch/settings";
import { cairoToday, parseIsoDate } from "./range";

/**
 * قراءة نماذج المالية والتحقق منها — طبقة واحدة تشترك فيها إجراءات الشاشات
 * الأربع (تسوية، مصروف، دفعة متعهد).
 *
 * التحقق هنا **شكلي بحت**: هل المبلغ رقم موجب؟ هل التاريخ موجود في التقويم؟ هل
 * السبب مكتوب؟ أما القرار المحاسبي — هل يسمح الرصيد؟ هل المتعهد مستحق؟ — فيقع
 * كله داخل دوال Postgres، ولا يُكرَّر هنا: تحقق مكرَّر في الواجهة يوهم بالأمان
 * ويسقط أول ما يُستدعى نفس الإجراء من مكان آخر.
 *
 * الأرقام العربية الهندية مقبولة في كل حقل رقمي وتُحوَّل قبل التحقق — المالك
 * يكتب بلوحة مفاتيح عربية ولا شأن له بترميز الخانات.
 */

export const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** حدود عاقلة تمنع الخطأ المطبعي الكارثي (ليست قواعد محاسبية) */
export const MAX_AMOUNT = 100_000_000;
export const MAX_NOTE = 500;
export const MIN_REASON = 4;

const toLatinDigits = (s: string) =>
  s.replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 0x0660));

export function textField(formData: FormData, name: string): string | null {
  const v = formData.get(name);
  return typeof v === "string" && v.trim() !== "" ? v.trim() : null;
}

/** رقم منتهٍ أو null (الفارغ وغير الرقمي كلاهما null) */
export function numberField(formData: FormData, name: string): number | null {
  const v = formData.get(name);
  if (typeof v !== "string" || v.trim() === "") return null;
  const n = Number(toLatinDigits(v.trim()));
  return Number.isFinite(n) ? n : null;
}

export function uuidField(formData: FormData, name: string): string | null {
  const v = textField(formData, name);
  return v && UUID_PATTERN.test(v) ? v : null;
}

/** مبلغ موجب داخل الحد الأعلى — يرجع رمز الخطأ نصاً بدل الرمي */
export function amountField(formData: FormData, name = "amount"): number | string {
  const amount = numberField(formData, name);
  if (amount === null || amount <= 0 || amount > MAX_AMOUNT) return "amount";
  return amount;
}

/** تاريخ حركة: موجود في التقويم وليس في المستقبل (بتوقيت القاهرة) */
export function occurredAtField(formData: FormData, name = "occurred_at"): string {
  const raw = parseIsoDate(textField(formData, name));
  if (!raw) return "date";
  return raw > cairoToday() ? "future" : raw;
}

/** ملاحظة اختيارية مقصوصة على الحد */
export function noteField(formData: FormData, name = "note"): string | null {
  const note = textField(formData, name);
  return note ? note.slice(0, MAX_NOTE) : null;
}

/** سبب إلزامي — التسوية بلا سبب مكتوب قيد لا يُراجَع */
export function reasonField(formData: FormData, name = "note"): string {
  const note = textField(formData, name);
  if (!note || note.length < MIN_REASON) return "reason";
  return note.slice(0, MAX_NOTE);
}

/**
 * ترجمة خطأ استدعاء دالة مالية إلى رمز تعرضه الشاشة.
 *
 * دوال المرحلة ٧ ترفع أخطاءها بـ `using hint = '<رمز>'` كما في بقية المشروع،
 * فأي تلميح يطابق مفتاحاً في `FINANCE_ERRORS` يمرّ كما هو ويصير جملة عربية
 * دقيقة. وما عدا ذلك يُصنَّف: دالة غائبة = هجرة ناقصة، ٤٢٥٠١ = صلاحية.
 */
const KNOWN_HINTS = new Set([
  "account",
  "amount",
  "direction",
  "reason",
  "date",
  "future",
  "partner",
  "category",
  "balance",
  "missing",
  "forbidden",
  "notready",
]);

/**
 * تلميحات هجرة 0027 (سقف ديون المتعهدين) — رمزها في الشاشة يخالف نص التلميح،
 * فتُترجم هنا لا في كل مستدعٍ على حدة. بدون هذا الجدول يسقط أي مستدعٍ آخر
 * لـ `record_partner_payout` على رسالة «فشلت العملية» العامة التي لا تقول شيئاً.
 */
const HINT_ALIASES: Record<string, string> = {
  "partner-owing": "owing",
  "note-required": "advnote",
};

export function rpcErrorCode(
  error: { code?: string; hint?: string | null; message?: string } | null
): string {
  if (!error) return "save";
  const hint = (error.hint ?? "").trim();
  if (HINT_ALIASES[hint]) return HINT_ALIASES[hint] as string;
  if (KNOWN_HINTS.has(hint)) return hint;
  if (isMissingFunction(error.code) || isMissingTable(error.code)) return "notready";
  if (error.code === "42501") return "forbidden";
  return "save";
}
