"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { clamp, text } from "../_lib/form";
import { portalAccess } from "../_lib/session";
import { loadTrips } from "./data";
import { rejectReasonLabel } from "./reasons";

/**
 * قبول العرض ورفضه — الطرف الأمامي لقرار «أول قابل يفوز».
 *
 * مبدأ حاكم: **لا يوجد مسار بديل هنا.** بقية شاشات البورتال تسقط إلى كتابة مباشرة
 * حين تغيب دالة Postgres، أما القبول فذرّي بطبيعته: قفل صف ومؤشر فريد يضمنان عرضاً
 * مقبولاً واحداً لكل حجز. محاكاة ذلك بـ PostgREST تعني قبولين متزامنين ينجحان معاً
 * ورحلة يظن متعهدان أنها لهما. فإن لم تكن `accept_offer` منشورة، قلنا ذلك صراحةً
 * ولم نكتب شيئاً.
 *
 * والخسارة ليست خطأ: من يصل ثانياً يرى «سبقك متعهد آخر» بنبرة الخبر لا نبرة العطل،
 * لأنها النتيجة الطبيعية لنظام السرعة فيه جزء من اللعبة.
 */

const requestsUrl = (qs: string) => `/portal/requests?${qs}`;
const tripsUrl = (qs: string) => `/portal/trips?${qs}`;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** سقف نص سبب الرفض — الحقل الحر لا يُترك بلا حد */
const MAX_REASON = 300;

/**
 * نتائج البث كما تصل من SQL. الدالة قد تُعيد نصاً أو صفاً أو منطقياً، وقد ترمي
 * استثناءً برسالة؛ نقرأ الثلاثة بنفس المفردات بدل التعلق بشكل واحد.
 */
type Outcome = "done" | "already_assigned" | "expired" | "not_pending" | "gone" | "failed";

/**
 * أنماط النتائج **غير الناجحة** وحدها، ولا نمط للنجاح إطلاقاً — وهذا احتياط مقصود:
 * رسائل أخطاء Postgres تحمل اسم الدالة نفسها («permission denied for function
 * accept_offer»)، فأي نمط نجاح يفحص كلمة accept كان سيقرأ عطل صلاحيات فوزاً
 * ويرسل المتعهد إلى «رحلاتي» ببشارة كاذبة. النجاح هنا استنتاج بالنفي: نداء لم
 * يُخطئ ولم يحمل إشارة خسارة = نجاح.
 *
 * والترتيب مقصود كذلك: «already-assigned» تحمل كلمة assigned، فتُفحص أولاً.
 */
const OUTCOME_PATTERNS: [RegExp, Outcome][] = [
  [/already[\s_-]*assign|taken|too[\s_-]*late|lost|another|other[\s_-]*(partner|sub)/i, "already_assigned"],
  [/expir|timed?[\s_-]*out|window[\s_-]*closed|deadline|past[\s_-]*due/i, "expired"],
  [/not[\s_-]*pending|no[\s_-]*longer|revoked|withdrawn|closed|cancel/i, "not_pending"],
  [/not[\s_-]*found|no[\s_-]*such|unknown[\s_-]*offer|invalid[\s_-]*offer/i, "gone"],
];

function matchOutcome(value: string | null): Outcome | null {
  if (!value) return null;
  for (const [pattern, outcome] of OUTCOME_PATTERNS) {
    if (pattern.test(value)) return outcome;
  }
  return null;
}

/** رموز «الدالة غير موجودة» — تعني أن هجرة 0013 لم تُنفَّذ على هذا الخادم */
const MISSING_FUNCTION_CODES = new Set(["PGRST202", "42883"]);

type RpcResult = { data: unknown; error: { message?: string; details?: string; hint?: string; code?: string } | null };

/** أعلام سالبة صريحة تسبق أي نص — عمود واحد صادق أوثق من رسالة تُفسَّر */
const NEGATIVE_FLAGS: [string, Outcome][] = [
  ["already_assigned", "already_assigned"],
  ["alreadyAssigned", "already_assigned"],
  ["lost", "already_assigned"],
  ["expired", "expired"],
];

const TEXT_KEYS = ["result", "outcome", "status", "hint", "code", "message", "detail", "reason"];
const POSITIVE_FLAGS = ["accepted", "assigned", "ok", "success", "won", "rejected"];

/**
 * قراءة النتيجة من قيمة الإرجاع أياً كان شكلها (نص/منطقي/صف).
 * `false` من دالة منطقية تُقرأ «سبقك غيرك»: تلك هي الخسارة المتوقعة الوحيدة في
 * نظام أول قابل يفوز، وأي سبب آخر (مهلة/إلغاء) يصل نصاً أو علماً صريحاً.
 */
function outcomeFromData(data: unknown): Outcome | null {
  if (typeof data === "boolean") return data ? "done" : "already_assigned";
  if (typeof data === "string") return matchOutcome(data) ?? "done";

  const row = Array.isArray(data) ? data[0] : data;
  if (!row || typeof row !== "object") return null;
  const record = row as Record<string, unknown>;

  for (const [key, outcome] of NEGATIVE_FLAGS) {
    if (record[key] === true) return outcome;
  }
  for (const key of TEXT_KEYS) {
    const value = record[key];
    if (typeof value === "string" && value.trim() !== "") return matchOutcome(value) ?? "done";
  }
  for (const key of POSITIVE_FLAGS) {
    const value = record[key];
    if (typeof value === "boolean") return value ? "done" : "already_assigned";
  }
  return null;
}

/** ترجمة نتيجة النداء كاملة (خطأً كانت أو قيمة إرجاع) إلى نتيجة واحدة صريحة */
function toOutcome(res: RpcResult): Outcome {
  if (res.error) {
    if (res.error.code && MISSING_FUNCTION_CODES.has(res.error.code)) return "failed";
    const blob = [res.error.message, res.error.details, res.error.hint].filter(Boolean).join(" | ");
    return matchOutcome(blob) ?? "failed";
  }

  // دالة بلا قيمة إرجاع (void) نجحت ما دامت لم ترمِ — وهذا المتوقع من SQL نظيف
  return outcomeFromData(res.data) ?? "done";
}

/** هل غابت الدالة عن الخادم أصلاً؟ (تُفصل عن الفشل العام لتظهر رسالة الهجرة) */
const isMissingFunction = (res: RpcResult) =>
  Boolean(res.error?.code && MISSING_FUNCTION_CODES.has(res.error.code));

/* ------------------------------------------------------------------ */
/* القبول                                                              */
/* ------------------------------------------------------------------ */

/**
 * قبول عرض — النجاح ينقل المتعهد إلى «رحلاتي» حيث تظهر بيانات التواصل لأول مرة،
 * فالانتقال نفسه جزء من الشرح: ما كان محجوباً صار مرئياً لأنك التزمت بالتنفيذ.
 */
export async function acceptOffer(offerId: string) {
  const access = await portalAccess();
  if (!access.ok) redirect(requestsUrl(`error=${access.code}`));
  if (!UUID.test(offerId)) redirect(requestsUrl("outcome=gone"));

  const res = (await access.supabase.rpc("accept_offer", { p_offer_id: offerId })) as RpcResult;
  if (isMissingFunction(res)) redirect(requestsUrl("error=schema"));

  const outcome = toOutcome(res);

  // الصندوق والرحلات والشارة كلها مشتقة من نفس النداءين — تُفرَّغ ذاكرتها معاً
  revalidatePath("/", "layout");

  if (outcome === "done") redirect(tripsUrl("accepted=1"));
  if (outcome === "failed") redirect(requestsUrl("error=save"));
  redirect(requestsUrl(`outcome=${outcome}`));
}

/* ------------------------------------------------------------------ */
/* الرفض                                                               */
/* ------------------------------------------------------------------ */

/**
 * رفض صريح. السبب اختياري: قائمة قصيرة + سطر حر يُدمجان في نص واحد يُخزَّن كما هو
 * (`reject_offer(p_offer_id, p_reason)`)، فيقرأه التشغيل لاحقاً بلا تفسير.
 */
export async function rejectOffer(offerId: string, formData: FormData) {
  const access = await portalAccess();
  if (!access.ok) redirect(requestsUrl(`error=${access.code}`));
  if (!UUID.test(offerId)) redirect(requestsUrl("outcome=gone"));

  const label = rejectReasonLabel(text(formData, "reason"));
  const note = clamp(text(formData, "note"), MAX_REASON);
  const reason = clamp([label, note].filter(Boolean).join(" — ") || null, MAX_REASON);

  const res = (await access.supabase.rpc("reject_offer", {
    p_offer_id: offerId,
    p_reason: reason,
  })) as RpcResult;
  if (isMissingFunction(res)) redirect(requestsUrl("error=schema"));

  const outcome = toOutcome(res);
  revalidatePath("/", "layout");

  if (outcome === "done") redirect(requestsUrl("rejected=1"));
  if (outcome === "failed") redirect(requestsUrl("error=save"));
  redirect(requestsUrl(`outcome=${outcome}`));
}

/* ------------------------------------------------------------------ */
/* طاقم الرحلة — المركبة والسائق بعد الإسناد                            */
/* ------------------------------------------------------------------ */

/**
 * رموز `hint` التي ترفعها `set_trip_crew` → رموز أخطاء الرابط.
 *
 * ولا تُعرض رسالة Postgres الخام أبداً: نصّها عربيٌّ سليم في الهجرة، لكنه يكشف
 * أسماء الجداول والدوال لمن يقرأه، ويتغيّر بتغيّر الهجرة فتتغير الشاشة بلا علمنا.
 * الرمز عقدٌ ثابت بيننا وبين القاعدة، والجملة ملك الشاشة.
 *
 * و`forbidden` ترفعه الدالة — كما قرأناه من `pg_get_functiondef` لا من ملف
 * الهجرة — في **أربع** حالات: حسابٌ ليس متعهداً، ورحلةٌ أُسندت لغيره، ودورةُ
 * إسنادٍ خرجت من حالة `assigned` (حارس 0043)، ومركبةٌ أو سائقٌ ليسا من سجلّه.
 */
const CREW_HINTS: Record<string, string> = {
  /** أساسٌ قد يُرقّى إلى `crew_stale` — انظر `crewRefusalCode` أدناه */
  forbidden: "crew_forbidden",
  "not-found": "crew_missing",
  "not-assigned": "crew_stale",
};

/**
 * أي الجملتين تُقال بعد رفضٍ بـ`forbidden`؟
 *
 * الحاجة: حارس الحالة الذي أضافته 0043 («لا تسجيل إلا على رحلة مُسنَدة جارية»)
 * يرفع **نفس** `hint` الذي يرفعه رفضُ مركبةٍ ليست من الأسطول، فالرمز وحده لا
 * يفرّق. والجملتان مختلفتان جوهرياً: الأولى «لا شيء مطلوب منك، الرحلة خرجت من
 * يدك»، والثانية «أعد الاختيار من سجلّك».
 *
 * والتمييز يُشتق من **قائمة الشريك نفسها** لا من سبب الرفض: `portal_trips()` لا
 * تُرجع إلا دورات `status = 'assigned'` المُسندة إليه هو، فغيابُ الحجز عنها هو
 * بعينه معنى «لم تعد رحلتك» بشقّيه (أُعيد إسنادها، أو خرجت الدورة من الطابور).
 *
 * 🔒 **ولا يُنقض بهذا قرارُ «لا تفريق بين حدَّي المنع»**: نحن لا نقرأ من القاعدة
 * أي الحدّين اصطدم به، بل نقرأ ما **يراه هو أصلاً على شاشته** — فلا معلومة تعبر
 * حدّاً جديداً، ومن يجرّب لا يتعلّم من الجملة شيئاً ليس في قائمته.
 *
 * ⚠ وهذا ليس حارساً ثانياً في TypeScript: يجري **بعد** أن رفضت القاعدة وحدها،
 * ولا يحوّل رفضاً إلى نجاح بحال. وحين تتعذّر القراءة نرجع إلى الجملة الجامعة —
 * أي نفشل إلى الأعمّ لا إلى الأدقّ.
 */
async function crewRefusalCode(bookingId: string): Promise<string> {
  const { trips, ready, failed } = await loadTrips();
  if (!ready || failed) return "crew_forbidden";
  return trips.some((trip) => trip.bookingId === bookingId) ? "crew_forbidden" : "crew_stale";
}

/**
 * تسجيل مركبة الرحلة وسائقها — «العميل لا يعرف ما سيأتيه» (الملاحظة ٥).
 *
 * الهوية **تُشتق داخل الدالة** من `current_subcontractor_id()` ولا تُمرَّر، نمطَ
 * `accept_offer`: فلا يُسند متعهدٌ طاقماً لرحلة غيره ولو زوّر معرّف الحجز في
 * النموذج. ونحن هنا لا نتحقق من الملكية إطلاقاً **قبل النداء** — التحقق موضعه
 * القاعدة وحدها، وتكراره في TypeScript يوهم بحارس ثانٍ ويسقط أولَ ما يتفرّع مسار.
 * (وما تفعله `crewRefusalCode` **بعد** الرفض اختيارُ جملة لا إذنٌ بكتابة — الفرق
 * مشروح فوقها.)
 *
 * ولا `.select()` بعد الكتابة هنا لأن الدالة `void`: ما يقوم مقام فحص الصفوف
 * الصفرية هو أن الرفض يصل **استثناءً** لا صمتاً — وهو ما نقرؤه من `res.error`.
 */
export async function setTripCrew(bookingId: string, formData: FormData) {
  const access = await portalAccess();
  if (!access.ok) redirect(tripsUrl(`error=${access.code}`));
  if (!UUID.test(bookingId)) redirect(tripsUrl("error=crew_missing"));

  const vehicleId = text(formData, "vehicle_id");
  const driverId = text(formData, "driver_id");

  // نصف طاقم لا يطمئن عميلاً: مركبةٌ بلا سائق تترك سؤال «ومن سيأتي؟» قائماً،
  // فيُطلب الحقلان معاً. والقائمة المنسدلة تفرضهما أصلاً — وهذا حارس من يعدّل النموذج.
  if (!vehicleId || !driverId || !UUID.test(vehicleId) || !UUID.test(driverId)) {
    redirect(tripsUrl("error=crew_input"));
  }

  const res = (await access.supabase.rpc("set_trip_crew", {
    p_booking_id: bookingId,
    p_vehicle_id: vehicleId,
    p_driver_id: driverId,
  })) as RpcResult;

  if (isMissingFunction(res)) redirect(tripsUrl("error=schema"));

  if (res.error) {
    const hint = typeof res.error.hint === "string" ? res.error.hint.trim() : "";
    const base = CREW_HINTS[hint] ?? "crew_save";
    const code = base === "crew_forbidden" ? await crewRefusalCode(bookingId) : base;
    redirect(tripsUrl(`error=${code}`));
  }

  // صفحة متابعة العميل تقرأ الطاقم من `get_booking_by_token` — فالتفريغ عام
  revalidatePath("/", "layout");
  redirect(tripsUrl("crew=1"));
}

/* ------------------------------------------------------------------ */
/* إغلاق الرحلة: طلبُ الإتمام · الاعتذار · التظلّم (هجرتا 0119 و0121)   */
/* ------------------------------------------------------------------ */

/**
 * لماذا لا مسار بديل هنا كذلك — نفس مبدأ `acceptOffer` في رأس الملف:
 *
 * هذه الثلاثة تلمس **بوابة المال**. طلبُ الإتمام يفتح عدّاداً ينتهي باعتمادٍ
 * يحرّك الدفتر، والاعتذار يُخلي إسناداً ويُعيد بثّاً، والتظلّم سطرٌ في سجلٍّ
 * يُبنى عليه قرارٌ مالي. فمحاكاةُ أيٍّ منها بكتابةٍ مباشرة عبر PostgREST تعني
 * أن نصف العملية قد يقع دون نصفها — والقاعدة تضمن الذرّية بمعاملةٍ واحدة
 * (‏**D-48**). فإن غابت الدالة قلنا ذلك صراحةً ولم نكتب شيئاً.
 *
 * 🔒 **ولا هوية تُمرَّر في أي نداء**: الثلاثة تشتقّ المتعهد من
 * `current_subcontractor_id()` داخلها كما تفعل `accept_offer`. فمن زوّر معرّف
 * حجزٍ في النموذج يصطدم بشرط الإسناد في القاعدة لا بفحصٍ هنا.
 */

/** سقف نصّ الاعتذار والتظلّم — الحقل الحر لا يُترك بلا حد */
const MAX_NOTE = 500;
const MAX_GRIEVANCE = 2000;

/**
 * رموز `hint` التي ترفعها دوال الإغلاق → رموز أخطاء الرابط.
 *
 * ⚠ **ورمزٌ بلا جملة صمتٌ لا خطأ**: `Banners` يقع على الجملة الجامعة، فيقرأ
 * الشريك رفضاً مفهوماً في القاعدة كعطلٍ مجهول عندنا. فكل رمز هنا له مفتاح في
 * `ERROR_MESSAGES` بصفحة «رحلاتي»، ولا يُضاف رمزٌ إلا ومعه جملته.
 */
const CLOSURE_HINTS: Record<string, string> = {
  forbidden: "closure_forbidden",
  "invalid-status": "closure_status",
  "too-early": "closure_early",
  "already-requested": "closure_duplicate",
  "completion-pending": "closure_pending",
  "reason-not-found": "closure_reason",
  "reason-inactive": "closure_reason",
  "reason-out-of-scope": "closure_reason",
  "booking-not-found": "closure_gone",
  "already-filed": "grievance_duplicate",
  "body-too-short": "grievance_short",
};

const closureCode = (res: RpcResult): string => {
  const hint = typeof res.error?.hint === "string" ? res.error.hint.trim() : "";
  return CLOSURE_HINTS[hint] ?? "closure_save";
};

/**
 * إعلانُ إتمام الرحلة — **طلبٌ لا إتمام**، والفرق هو كل الفكرة.
 *
 * ولذلك لا يُسمّى الزرّ «تمّت الرحلة»: الحجز يبقى «مُسندة»، ولا قيد دفترٍ
 * يُكتب، ولا نقطةَ تُسكّ للعميل — حتى تعتمد الإدارة أو تمضي مهلة اللوحة.
 * وشاشةُ البطاقة تقول ذلك بنصّها كي لا ينتظر الشريك مستحقاً ظنّه استحقّ.
 */
export async function requestTripCompletion(bookingId: string) {
  const access = await portalAccess();
  if (!access.ok) redirect(tripsUrl(`error=${access.code}`));
  if (!UUID.test(bookingId)) redirect(tripsUrl("error=closure_gone"));

  const res = (await access.supabase.rpc("request_trip_completion", {
    p_booking_id: bookingId,
    p_note: null,
  })) as RpcResult;

  if (isMissingFunction(res)) redirect(tripsUrl("error=schema"));
  if (res.error) redirect(tripsUrl(`error=${closureCode(res)}`));

  revalidatePath("/", "layout");
  redirect(tripsUrl("completion=1"));
}

/**
 * الاعتذار عن رحلةٍ قَبِلها — المخرج الذي لم يكن موجوداً.
 *
 * `reject_offer` تعمل على **عرضٍ** لا على رحلةٍ مُسنَدة، فبعد القبول كان الشريك
 * بلا باب: من تعطّلت سيارته يختفي، والرحلة تبقى باسمه حتى تفشل. وهذا يبني بابه.
 *
 * والوجهةُ بعده تتفرّع في القاعدة بالوقت المتبقي (‏`apology_route`)، فلا تُعاد
 * كتابةُ الشرط هنا: الرابط يحمل ما وقع فعلاً كي تقوله الشاشة بلا تخمين.
 */
export async function withdrawFromTrip(bookingId: string, formData: FormData) {
  const access = await portalAccess();
  if (!access.ok) redirect(tripsUrl(`error=${access.code}`));
  if (!UUID.test(bookingId)) redirect(tripsUrl("error=closure_gone"));

  const reason = text(formData, "reason");
  if (!reason) redirect(tripsUrl("error=closure_reason"));

  const res = (await access.supabase.rpc("withdraw_from_trip", {
    p_booking_id: bookingId,
    p_reason_slug: reason,
    p_note: clamp(text(formData, "note"), MAX_NOTE),
  })) as RpcResult;

  if (isMissingFunction(res)) redirect(tripsUrl("error=schema"));
  if (res.error) redirect(tripsUrl(`error=${closureCode(res)}`));

  // الوجهة كما قرّرتها القاعدة — تُقرأ ولا تُحسب هنا ثانيةً
  const row = Array.isArray(res.data) ? res.data[0] : res.data;
  const routed =
    row && typeof row === "object" && (row as Record<string, unknown>).routed === "manual"
      ? "manual"
      : "rebroadcast";

  revalidatePath("/", "layout");
  redirect(tripsUrl(`withdrawn=${routed}`));
}

/**
 * تظلّمٌ على قرارٍ مالي — «خصمٌ ومعه بابٌ يُطرَق» (قرار المالك).
 *
 * ولا يبتّ فيه صاحبه: `resolve_grievance` للمشرف وحده. وقبولُ التظلّم **لا يردّ
 * مالاً من تلقائه** — ردُّ الخصم حركةٌ مسمّاة في الدفتر يجريها المشرف بيده، فلا
 * أثرَ ماليٌّ صامت.
 */
export async function fileTripGrievance(bookingId: string, formData: FormData) {
  const access = await portalAccess();
  if (!access.ok) redirect(tripsUrl(`error=${access.code}`));
  if (!UUID.test(bookingId)) redirect(tripsUrl("error=closure_gone"));

  const body = clamp(text(formData, "body"), MAX_GRIEVANCE);
  if (!body || body.length < 10) redirect(tripsUrl("error=grievance_short"));

  const res = (await access.supabase.rpc("file_grievance", {
    p_booking_id: bookingId,
    p_kind: text(formData, "kind") === "failure" ? "failure" : "apology",
    p_body: body,
  })) as RpcResult;

  if (isMissingFunction(res)) redirect(tripsUrl("error=schema"));
  if (res.error) redirect(tripsUrl(`error=${closureCode(res)}`));

  revalidatePath("/", "layout");
  redirect(tripsUrl("grievance=1"));
}
