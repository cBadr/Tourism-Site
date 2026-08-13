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
/** مرجع العملية: رقم تحويل أو معرّف عملية — لا حقل ملاحظات ثانٍ */
export const MAX_REFERENCE = 120;

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

/**
 * مرجع العملية — تحقق **شكلي بحت**: نص مقصوص على الحد، أو `null` للفارغ.
 *
 * وإلزاميته ليست هنا: القاعدة وحدها تقرأ `kind` من `payment_accounts` وترفع
 * `reference-required` حين يكون الحساب غير نقدي (هجرة 0029، ق٦ فقرة ٤). وتكرار
 * الشرط في هذه الطبقة يعني نسخة ثانية من قائمة «الأنواع النقدية» تنحرف عن
 * الأولى أول ما يُضاف نوع حساب — والواجهة تشرح ولا تحرس.
 */
export function referenceField(formData: FormData, name = "reference"): string | null {
  const reference = textField(formData, name);
  return reference ? reference.slice(0, MAX_REFERENCE) : null;
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
  /**
   * هجرة 0029 — `record_partner_settlement` ترفعه حين يكون حساب الخزينة المختار
   * غير نقدي ولا مرجع مكتوب. يمرّ بنصّه (لا اسم مستعار له) لأن الرمز نفسه مفهوم
   * في الرابط، ورسالته في `FINANCE_ERRORS` تقول للمشرف ماذا يكتب الآن.
   */
  "reference-required",
]);

/**
 * تلميحات تخالف رمزَها في الشاشة، فتُترجم هنا لا في كل مستدعٍ على حدة. بدون هذا
 * الجدول يسقط كل واحد منها على رسالة «فشلت العملية» العامة التي لا تقول شيئاً
 * ولا تدلّ على حقل.
 *
 * الأولان من هجرة 0027 (سقف ديون المتعهدين). والأخيران من `record_partner_settlement`
 * في 0029، وكلاهما كان يسقط على الرسالة العامة: الدالة ترفع `account-not-found`
 * لحساب خزينة غير موجود و`not-found` لمتعهد غير موجود، بينما الرمزان المعروفان
 * في `FINANCE_ERRORS` هما `account` و`partner` — والرسالتان موجودتان أصلاً وتقولان
 * للمشرف ماذا يفعل الآن («أعد تحميل الصفحة واختر من القائمة»).
 *
 * ⚠ و`not-found` تلميحٌ **عام في القاعدة** يعني «الصف غير موجود» لا «المتعهد غير
 * موجود» وحده: ترفعه `reverse_ledger_entry` عن قيد مفقود، وترفعه دوال قوائم
 * الأسعار في 0010 عن قائمة مفقودة. وترجمته إلى «المتعهد» صحيحة هنا لأن مستدعيات
 * `rpcErrorCode` اليوم أربعة لا غير — `record_expense` و`record_adjustment`
 * (ولا ترفعان `not-found` أصلاً) وثلاث دوال متعهد ترفعه بمعنى المتعهد وحده.
 * فمن يضيف مستدعياً خامساً لدالة ترفعه بمعنى آخر عليه أن يفرّق قبل أن يصل هنا.
 */
const HINT_ALIASES: Record<string, string> = {
  "partner-owing": "owing",
  "note-required": "advnote",
  "account-not-found": "account",
  "not-found": "partner",
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
