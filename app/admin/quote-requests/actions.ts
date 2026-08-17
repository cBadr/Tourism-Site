"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import type { QuoteRequestStatus } from "@/lib/booking-types";
import { createServerSupabase } from "@/lib/supabase/server";

/**
 * إجراءات شاشة طلبات الأسعار — نقلة الحالة في آلةٍ تحرسها القاعدة (هجرة 0084).
 *
 * اتفاقية «إعادة التوجيه بعد العملية»: النجاح والفشل كلاهما redirect برمز في الرابط.
 *
 * ══════════════════════════════════════════════════════════════════════════
 *  🔴 لماذا نداءُ دالةٍ لا `update` مباشر — والفرق ليس أسلوبياً
 * ══════════════════════════════════════════════════════════════════════════
 *
 * الحالة «مسعَّر» **تحمل مبلغاً**، وقيدُ `quote_requests_priced_states_chk` يرفض
 * أن تقوم بدونه. فتحديثان متتاليان من هنا (حالةٌ ثم مبلغ) يعنيان لحظةً وسطى
 * يرفضها القيد بحق ⇒ يفشل النصف الأول ويبقى الصف بحالةٍ قديمة ورسالةٍ غامضة.
 *
 * `set_quote_request_status` تكتبهما في **معاملةٍ واحدة** (D-48: نداء PostgREST
 * واحد = معاملة واحدة)، وتقفل الصف قبل القراءة فلا يسعّره موظفان معاً، وتحرس
 * `is_admin()` داخل جسمها — لأن `authenticated` يشمل كل متعهّد من الباطن فلا
 * يعني مشرفاً أبداً (D-20).
 *
 * وفخّ RLS المعروف (‏`update` ينجح ظاهرياً بصفر صفوف عند رفض السياسة) لا يقع
 * هنا أصلاً: الدالة ترفع خطأً صريحاً بدل أن تُرجع صفراً صامتاً.
 */

const url = (qs: string) => `/admin/quote-requests?${qs}`;

const STATUSES: QuoteRequestStatus[] = ["new", "quoted", "converted", "rejected"];

const isStatus = (value: string): value is QuoteRequestStatus =>
  (STATUSES as string[]).includes(value);

/** سقف المبلغ — حارس إدخالٍ لا سياسة تسعير: رقمٌ فوقه خطأُ لوحة مفاتيح */
const MAX_QUOTE_AMOUNT = 100_000_000;

/**
 * رموز رفض الدالة (‏`hint`) ← رموز الرابط التي تترجمها الشاشة.
 * ورمزٌ لا جملة: النص يعيش في الشاشة وحدها.
 */
const HINT_TO_CODE: Record<string, string> = {
  forbidden: "forbidden",
  "invalid-status": "status",
  "invalid-transition": "transition",
  "amount-required": "amount",
  "not-found": "missing",
  "no-change": "nochange",
  // 0088 — «محوَّل» لم تبقَ وسماً تُلصقه هذه الدالة
  "use-convert": "useconvert",
};

/**
 * رموز رفض `convert_quote_request` (هجرة 0088) ← رموز الرابط.
 *
 * 🔴 و`floor` أهمّها: السعر اليدوي دون أرضية الهامش. الرمز وحده لا يكفي هنا —
 * الشاشة تحتاج **الرقم** لتقول للمالك أين الحدّ، ويسافر في `min` بياناً لا جملة.
 */
const CONVERT_HINT_TO_CODE: Record<string, string> = {
  forbidden: "forbidden",
  "invalid-input": "save",
  "not-found": "missing",
  "not-quoted": "notquoted",
  "already-converted": "already",
  "amount-required": "amount",
  "origin-required": "noorigin",
  "pickup-required": "nopickup",
  "pickup-past": "pastpickup",
  "class-unknown": "classunknown",
  "class-too-small": "classsmall",
  "cost-required": "costrequired",
  "cost-negative": "costnegative",
  "below-floor": "floor",
  "partner-not-found": "nopartner",
  "destination-required": "nodest",
  "db-unavailable": "save",
};

/** سقف أساس التكلفة — حارس إدخالٍ لا سياسة: رقمٌ فوقه خطأُ لوحة مفاتيح */
const MAX_PARTNER_COST = 100_000_000;

/** `detail` تصل بصيغة `min=6900.00` — ويُقرأ رقماً أو يُهمَل، ولا يُطبَع نصّه أبداً */
function readFloorMin(details: string | null | undefined): string | null {
  const match = /(^|[^a-z])min=(\d+(?:\.\d+)?)/i.exec(details ?? "");
  if (!match) return null;
  const value = Number(match[2]);
  return Number.isFinite(value) && value > 0 ? String(Math.ceil(value)) : null;
}

export async function setQuoteStatus(requestId: string, formData: FormData) {
  const supabase = await createServerSupabase();
  if (!supabase) redirect(url("error=env"));

  const raw = formData.get("status");
  const status = typeof raw === "string" ? raw.trim() : "";
  if (!isStatus(status)) redirect(url("error=status"));

  // الرجوع إلى نفس التبويب الذي كان المستخدم يعمل فيه — قيمة من قائمة مغلقة فقط
  const tabRaw = formData.get("tab");
  const tab = typeof tabRaw === "string" && isStatus(tabRaw) ? tabRaw : null;
  const back = (qs: string) => url(tab ? `status=${tab}&${qs}` : qs);

  // المبلغ يُقرأ للتسعير وحده؛ وما عداه تتولاه القاعدة (يُورَّث أو يُمحى)
  let amount: number | null = null;
  if (status === "quoted") {
    const amountRaw = formData.get("amount");
    const parsed = typeof amountRaw === "string" ? Number(amountRaw.trim()) : Number.NaN;
    if (!Number.isFinite(parsed) || parsed <= 0 || parsed > MAX_QUOTE_AMOUNT) {
      redirect(back("error=amount"));
    }
    // القاعدة تقرّب إلى قرشين — والتقريب هنا لعرضٍ متسق لا لحسابٍ ثانٍ (D-05)
    amount = parsed;
  }

  const noteRaw = formData.get("note");
  const note = typeof noteRaw === "string" ? noteRaw.trim().slice(0, 2000) : "";

  const { error } = await supabase.rpc("set_quote_request_status", {
    p_id: requestId,
    p_status: status,
    p_amount: amount,
    p_note: note.length > 0 ? note : null,
  });

  if (error) {
    const hint = (error.hint ?? "").trim();
    redirect(back(`error=${HINT_TO_CODE[hint] ?? "save"}`));
  }

  revalidatePath("/", "layout");
  redirect(back("saved=1"));
}

/**
 * ب‑٣ — تحويل طلبٍ مسعَّر إلى **حجزٍ حقيقي** (هجرة 0088).
 *
 * ══════════════════════════════════════════════════════════════════════════
 *  🔴 لماذا لا يُحسب هنا شيء — ولا حتى الهامش
 * ══════════════════════════════════════════════════════════════════════════
 *
 * السعر في هذه الشاشة **يدويّ**، أي أنه لا يمرّ بـ`quote_price` ولا بحواجزها.
 * فلو فُحصت أرضية الهامش هنا لكان الحاجز في **الواجهة**: من ينادي PostgREST
 * مباشرةً — أو مسارٌ يُكتب غداً — يتخطّاه ويبيع بخسارة. الفحص كله في
 * `convert_quote_request`: الأرضية (D-16 · D-05) وأهلية الفئة والموعد وأساس
 * التكلفة والحالة، **ثم** إنشاء الحجز وربط الصفّين في معاملةٍ واحدة (D-48).
 *
 * وهذا الملف يفعل شيئين لا ثالث: يقرأ الحقول من النموذج ويترجم رمز الرفض.
 *
 * ⚠ والحقول الرقمية تُرسَل كما كُتبت ولا تُقرَّب هنا: القاعدة تقرّب إلى قرشين،
 * وتقريبٌ ثانٍ في TypeScript هو بعينه ما تمنعه D-05.
 */
export async function convertQuoteRequest(requestId: string, formData: FormData) {
  const supabase = await createServerSupabase();
  if (!supabase) redirect(url("error=env"));

  const tabRaw = formData.get("tab");
  const tab = typeof tabRaw === "string" && isStatus(tabRaw) ? tabRaw : null;
  const back = (qs: string) => url(tab ? `status=${tab}&${qs}` : qs);

  const text = (name: string) => {
    const raw = formData.get(name);
    return typeof raw === "string" ? raw.trim() : "";
  };

  const classSlug = text("classSlug");
  if (classSlug.length === 0) redirect(back("error=classunknown"));

  // أساس التكلفة: **مطلوب**. والفحص هنا للرسالة لا للحماية — القاعدة ترفض
  // الفراغ بنفسها، لأن التكلفة المشتقة من السعر تجعل الأرضية تقيس الرقم بنفسه.
  const costRaw = text("partnerCost");
  const cost = costRaw.length === 0 ? Number.NaN : Number(costRaw);
  if (!Number.isFinite(cost)) redirect(back("error=costrequired"));
  if (cost < 0) redirect(back("error=costnegative"));
  if (cost > MAX_PARTNER_COST) redirect(back("error=costrange"));

  const destLabel = text("destLabel").slice(0, 200);
  if (destLabel.length === 0) redirect(back("error=nodest"));

  const partnerId = text("subcontractorId");
  const note = text("note").slice(0, 2000);

  const { error } = await supabase.rpc("convert_quote_request", {
    p_id: requestId,
    p_class_slug: classSlug,
    p_partner_cost: cost,
    p_dest_label: destLabel,
    p_subcontractor_id: partnerId.length > 0 ? partnerId : null,
    p_note: note.length > 0 ? note : null,
  });

  if (error) {
    const hint = (error.hint ?? "").trim();
    const code = CONVERT_HINT_TO_CODE[hint] ?? "save";
    if (code === "floor") {
      const min = readFloorMin(error.details);
      redirect(back(min ? `error=floor&min=${min}` : "error=floor"));
    }
    redirect(back(`error=${code}`));
  }

  revalidatePath("/", "layout");
  redirect(back("converted=1"));
}
