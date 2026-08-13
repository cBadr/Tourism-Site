"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { startDispatchFor } from "@/lib/dispatch/start";
import { createServerSupabase } from "@/lib/supabase/server";

/**
 * إجراءات لوحة الإسناد داخل شاشة الطلب — بدء البث، إعادة البث، والإسناد اليدوي.
 *
 * كل القرار في Postgres (عقد المرحلة ٦ في `lib/dispatch-types.ts`)، ولا منطق بث
 * ولا إسناد في TypeScript. هنا تحقق شكلي من المدخلات وترجمة رمز الفشل فقط.
 *
 * **لماذا عميلان مختلفان؟**
 * - البث يمرّ بـ `startDispatchFor` (غلاف `lib/dispatch/start.ts`) لأنه **نفس**
 *   المسار الذي يسلكه الإطلاق التلقائي عند اعتماد التحويل: عميل خدمة، وسجل
 *   موحّد، ونتيجة راجعة لا استثناء. و`force: true` يتخطى بوابة «البدء التلقائي»
 *   لأن هذا الزر تدخّل بشري صريح.
 * - الإسناد اليدوي يمرّ بجلسة المدير مباشرة لأنه إجراء إداري تحرسه `is_admin()`
 *   داخل الدالة، تماماً كـ `verify_payment` و`review_price_list` في المرحلتين
 *   ٤ و٥ — فيُسجَّل المنفِّذ الحقيقي في سجل الطلب.
 *
 * **وإسنادان لا واحد** منذ 0027: `manualAssign` العادي، و`manualAssignOverLimit`
 * الذي يمرّ بدالة مستقلة الاسم في القاعدة لتجاوز سقف دين المتعهد بقرار بشري
 * مكتوب. كلٌّ خلف خطوة تأكيد مستقلة في الرابط (‎?confirm=assign‎ و‎?confirm=override‎)،
 * فلا يتحول التجاوز إلى «أعد المحاولة».
 *
 * اتفاقية «إعادة التوجيه بعد العملية»: النجاح والفشل كلاهما redirect برمز في
 * الرابط، والوجهة لوحة الإسناد نفسها (‎#dispatch‎) لا أعلى الصفحة.
 * و`revalidatePath("/", "layout")` لأن الإسناد ينقل الحجز إلى «مُسند» فتتغير
 * صفحة متابعة العميل وبوابة المتعهد معاً.
 */

const url = (bookingId: string, qs: string) => `/admin/orders/${bookingId}?${qs}#dispatch`;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** حد أعلى عاقل للمستحق — ما فوقه خطأ كتابة لا نية */
const MAX_PAYOUT = 1_000_000;
const MAX_NOTE = 500;

/** الأرقام العربية الهندية مقبولة في حقل المستحق وتُحوَّل قبل التحقق */
const toLatinDigits = (s: string) =>
  s.replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 0x0660));

function text(formData: FormData, name: string): string | null {
  const v = formData.get(name);
  return typeof v === "string" && v.trim() !== "" ? v.trim() : null;
}

function num(formData: FormData, name: string): number | null {
  const raw = text(formData, name);
  if (raw === null) return null;
  const n = Number(toLatinDigits(raw));
  return Number.isFinite(n) ? n : null;
}

/**
 * رموز `hint` التي ترفعها دوال المرحلة ٦ → رموز الأخطاء في الرابط.
 * القائمة أوسع من اللازم عمداً: الهجرة يملكها وكيل SQL، وترجمة رمز مجهول إلى
 * «فشلت العملية» تتهم الصلاحيات في خطأ سببه الحالة. أي رمز غير معروف يسقط على
 * البديل الذي يحدده المُنادي.
 */
const HINT_CODES: Record<string, string> = {
  forbidden: "forbidden",
  "invalid-input": "input",
  "invalid-status": "dstatus",
  "invalid-dispatch-status": "dstatus",
  // موجة سارية بالفعل — رسالة خاصة تدلّ على المخرج (دورة الإسناد) لا مجرد «لا يجوز»
  "already-dispatching": "broadcasting",
  "already-broadcasting": "broadcasting",
  "illegal-transition": "bstatus",
  "invalid-booking-status": "bstatus",
  "booking-not-confirmed": "bstatus",
  "booking-not-found": "missing",
  "dispatch-not-found": "missing",
  "offer-not-found": "missing",
  "subcontractor-not-found": "missing",
  "not-found": "missing",
  "already-assigned": "assigned",
  assigned: "assigned",
  "no-candidates": "nopartners",
  "no-partners": "nopartners",
  "no-coverage": "nopartners",
  "margin-floor": "margin",
  "min-margin": "margin",
  margin: "margin",
  // ── سقف ديون المتعهدين (0027): مُشغّل `trip_offers` يرفض الفوز لمن بلغ سقفه.
  // بلا هذا السطر يسقط الرفض على «فشلت العملية — تأكد أنك مسجل الدخول بحساب
  // دوره admin»: اتهام صلاحيات في مشكلة دَين، وهو تحديداً ما يحذّر منه تعليق
  // هذا الجدول أعلاه.
  "debt-limit": "debtlimit",
  // `manual_assign_over_limit` ترفض السبب الفارغ. النموذج يفرضه أصلاً، فهذا
  // مسار لا يُبلغ عادةً — لكنه لو بلغ فالرسالة تقول «اكتب السبب» لا «لا صلاحية».
  "note-required": "note",
};

/** رموز فشل غلاف البث (`StartDispatchResult.reason`) — وما عداها `hint` من SQL */
const START_REASONS: Record<string, string> = {
  "invalid-booking": "input",
  "no-service-client": "nokey",
  "no-function": "notready",
  "no-table": "notready",
  "rpc-failed": "save",
  "worker-error": "save",
  // نجاح بلا بث — أسباب يعرفها المشغّل من الصف الراجع لا من استثناء
  "auto-start-off": "autooff",
  "rounds-exhausted": "exhausted",
  "already-dispatching": "broadcasting",
  "already-assigned": "assigned",
  "no-candidates": "nopartners",
};

/** دالة أو جدول غير موجودين = هجرة المرحلة ٦ لم تُنفَّذ بعد */
const MISSING_OBJECT = new Set(["PGRST202", "42883", "42P01", "PGRST205"]);

function rpcCode(
  error: { hint?: string | null; code?: string | null } | null,
  fallback: string
): string {
  const code = typeof error?.code === "string" ? error.code : "";
  if (MISSING_OBJECT.has(code)) return "notready";
  const hint = typeof error?.hint === "string" ? error.hint.trim() : "";
  return HINT_CODES[hint] ?? fallback;
}

/**
 * بدء البث أو إعادته — نفس الدالة في الحالتين بحسب العقد:
 * `start_dispatch` تبدأ الموجة ١ على الحجز المؤكد، وتفتح الموجة التالية مبكراً
 * على الحجز الذي ما زال في موجة سارية (بدل انتظار انتهاء مهلتها).
 *
 * `again` لا يغيّر الاستدعاء — يغيّر رسالة النجاح وحدها، فيعرف التشغيل أيهما وقع.
 */
export async function startBroadcast(bookingId: string, again: boolean) {
  if (!UUID.test(bookingId)) redirect(url(bookingId, "error=missing"));

  // حارس صلاحية صريح: هذا الإجراء يمر بعميل الخدمة، فلا تنطبق عليه حراسة
  // قاعدة البيانات — بدونه يبثّ أي جلسة تصل إلى الـ action.
  const session = await createServerSupabase();
  if (!session) redirect(url(bookingId, "error=env"));
  const { data: isAdmin, error: roleError } = await session.rpc("is_admin");
  if (roleError || isAdmin !== true) redirect(url(bookingId, "error=forbidden"));

  const result = await startDispatchFor(bookingId, { force: true });

  if (!result.ok) {
    const reason = result.reason ?? "";
    const code = START_REASONS[reason] ?? HINT_CODES[reason] ?? "save";
    redirect(url(bookingId, `error=${code}`));
  }

  // النجاح بلا بث ليس نجاحاً للمشغّل: نفرّق بين «بُثَّت موجة» و«لم يوجد مرشح»
  if (!result.started) {
    const reason = result.reason ?? "";
    const code = START_REASONS[reason] ?? HINT_CODES[reason] ?? "nopartners";
    redirect(url(bookingId, `error=${code}`));
  }

  revalidatePath("/", "layout");
  redirect(url(bookingId, again ? "saved=rebroadcast" : "saved=broadcast"));
}

/**
 * الإسناد اليدوي — تجاوز صريح لدورة البث بعد خطوة تأكيد في الواجهة.
 *
 * التحقق هنا شكلي بحت: معرّف صالح، ومبلغ موجب في مدى عاقل، وسبب مكتوب. أما
 * «هل يجوز الإسناد الآن؟» و«هل يترك هذا المستحق هامشاً مقبولاً؟» فقرار
 * `manual_assign` وحدها — وهي التي تُلغي العروض المفتوحة وتنقل حالة الحجز عبر
 * الحارس نفسه الذي يحرس كل انتقالات المرحلة ٤.
 */
export async function manualAssign(bookingId: string, formData: FormData) {
  const back = (qs: string) => url(bookingId, `${qs}&confirm=assign`);

  const supabase = await createServerSupabase();
  if (!supabase) redirect(back("error=env"));

  const subcontractorId = text(formData, "manual.subcontractor_id");
  if (!subcontractorId || !UUID.test(subcontractorId)) redirect(back("error=partner"));

  const payout = num(formData, "manual.payout");
  if (payout === null || payout < 0 || payout > MAX_PAYOUT) redirect(back("error=payout"));

  const note = text(formData, "manual.note")?.slice(0, MAX_NOTE) ?? null;
  if (!note) redirect(back("error=note"));

  const { error } = await supabase.rpc("manual_assign", {
    p_booking_id: bookingId,
    p_subcontractor_id: subcontractorId,
    p_payout: payout,
    p_note: note,
  });
  if (error) redirect(back(`error=${rpcCode(error, "save")}`));

  revalidatePath("/", "layout");
  redirect(url(bookingId, "saved=manual"));
}

/**
 * الإسناد فوق سقف الدين — **الباب الوحيد** لتجاوز حاجز 0027.
 *
 * مُشغّل `trip_offers` يرفض فوز متعهد بلغ سقف دينه لنا، ويرفضه على `manual_assign`
 * كما يرفضه على القبول من البورتال. والتجاوز دالة أخرى باسمها:
 * `manual_assign_over_limit` ترفع `tours.allow_partner_debt` لهذه المعاملة وحدها
 * ثم تنادي `manual_assign` نفسها — نفس نمط `manual_assign_with_loss`.
 *
 * وهي **ترفع حارساً واحداً لا كل الحرّاس**: أرضية الهامش تبقى سارية، والمتعهد
 * الموقوف أو غير المعتمد يبقى مرفوضاً. من احتاج تجاوز حاجزين معاً يرفع الأرضية
 * أو يسدّد الدين أولاً.
 *
 * السبب المكتوب شرطٌ في القاعدة نفسها (‏`note-required`) لا في الواجهة وحدها،
 * لأنه الأثر الدائم الوحيد للقرار: يُكتب في سجل الطلب وفي سبب صف العرض.
 */
export async function manualAssignOverLimit(bookingId: string, formData: FormData) {
  const back = (qs: string) => url(bookingId, `${qs}&confirm=override`);

  const supabase = await createServerSupabase();
  if (!supabase) redirect(back("error=env"));

  const subcontractorId = text(formData, "manual.subcontractor_id");
  if (!subcontractorId || !UUID.test(subcontractorId)) redirect(back("error=partner"));

  const payout = num(formData, "manual.payout");
  if (payout === null || payout < 0 || payout > MAX_PAYOUT) redirect(back("error=payout"));

  const note = text(formData, "manual.note")?.slice(0, MAX_NOTE) ?? null;
  if (!note) redirect(back("error=note"));

  const { error } = await supabase.rpc("manual_assign_over_limit", {
    p_booking_id: bookingId,
    p_subcontractor_id: subcontractorId,
    p_payout: payout,
    p_note: note,
  });

  if (error) {
    // الدالة غير موجودة ⇒ هجرة **0027** لم تُنفَّذ. ورسالة `notready` العامة تحيل
    // إلى هجرة المرحلة ٦، فتُرسل المشغّل إلى الملف الخطأ — ولذلك رمز مستقل.
    const code =
      typeof error.code === "string" && MISSING_OBJECT.has(error.code)
        ? "nolimitfn"
        : rpcCode(error, "save");
    redirect(back(`error=${code}`));
  }

  revalidatePath("/", "layout");
  redirect(url(bookingId, "saved=override"));
}
