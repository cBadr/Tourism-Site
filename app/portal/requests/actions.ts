"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { clamp, text } from "../_lib/form";
import { portalAccess } from "../_lib/session";
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
