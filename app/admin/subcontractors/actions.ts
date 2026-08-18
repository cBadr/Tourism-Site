"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { SupabaseClient } from "@supabase/supabase-js";

import { getBaseUrl } from "@/lib/seo";
import type { SubcontractorStatus } from "@/lib/subcontractor-types";
import { createServiceSupabase } from "@/lib/supabase/admin";
import { createServerSupabase } from "@/lib/supabase/server";

/**
 * إجراءات شاشات المتعهدين — الدعوة، الاعتماد والإيقاف، ومراجعة قوائم الأسعار.
 *
 * قواعد ثابتة (نفس اتفاقيات شاشتي الطلبات وحسابات الدفع):
 * - **لا كلمات مرور هنا إطلاقاً**: الدعوة بريد رسمي من Supabase والمتعهد يحدد كلمة
 *   مروره بنفسه من الرابط، تماماً كما يفعل `scripts/invite-admin.mjs`.
 * - اتفاقية «إعادة التوجيه بعد العملية»: النجاح والفشل كلاهما redirect برمز في الرابط.
 * - فخ RLS المعروف: الكتابة المباشرة تنجح ظاهرياً بصفر صفوف عند رفض السياسة —
 *   لذلك `.select()` بعد كل كتابة وفحص طول النتيجة، أما استدعاءات rpc فيكفي فحص
 *   `error` لأن دوال `security definer` ترفع استثناءً عند الرفض.
 * - **قرار الاعتماد/الرفض للقوائم يقع في SQL** داخل `review_price_list`؛ هنا تحقق
 *   من المدخلات وترجمة رسالة الخطأ فقط.
 * - `revalidatePath("/", "layout")` لأن اعتماد متعهد أو قائمة أسعار يغيّر أسعار
 *   الموقع العام فوراً (أرخص متعهد مغطٍّ + الهامش).
 * - **لا معرّف ولا بريد في الرابط**: إعادة التوجيه بعد الدعوة تقصد صفحة الملف نفسه،
 *   فبيانات المتعهد تُقرأ من القاعدة ولا تمر في الـ query string.
 */

const LIST_PATH = "/admin/subcontractors";
const REVIEWS_PATH = "/admin/subcontractors/reviews";
const ROUTES_PATH = "/admin/subcontractors/routes";

const listUrl = (qs: string) => `${LIST_PATH}?${qs}`;
const detailUrl = (id: string, qs: string) => `${LIST_PATH}/${id}?${qs}`;

/**
 * إلحاق رمز الحالة بوجهةٍ قد تحمل استعلاماً سلفاً — فلا يخرج `?a=1?saved=1`.
 * صار لازماً حين بدأ التعديل بالنقر يقع داخل شاشة بحث المسارات، وهي تحمل
 * البحث والصفحة والمسار المفتوح في الرابط ولا يجوز أن تضيع بعد كل حفظ.
 */
const withCode = (to: string, qs: string) => {
  const cut = to.indexOf("#");
  const bare = cut === -1 ? to : to.slice(0, cut);
  const anchor = cut === -1 ? "" : to.slice(cut);
  return `${bare}${bare.includes("?") ? "&" : "?"}${qs}${anchor}`;
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** بريد بسيط الشكل — التحقق الحقيقي يقع عند إرسال الدعوة نفسها */
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

const MAX_NAME = 120;
const MAX_PHONE = 32;
const MAX_NOTE = 500;

/** الأرقام العربية الهندية تُقبل في حقل الموبايل وتُحوَّل قبل الحفظ */
const toLatinDigits = (s: string) =>
  s.replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 0x0660));

function text(formData: FormData, name: string): string | null {
  const v = formData.get(name);
  return typeof v === "string" && v.trim() !== "" ? v.trim() : null;
}

const trimNote = (note: string | null) => (note ? note.slice(0, MAX_NOTE) : null);

/**
 * رموز `hint` التي ترفعها دوال المرحلة ٥ → رموز الأخطاء في الرابط.
 * أي رمز غير معروف يسقط على البديل الذي يحدده المُنادي، فلا تُتهم الصلاحيات
 * في خطأ سببه حالة القائمة.
 */
const HINT_CODES: Record<string, string> = {
  forbidden: "forbidden",
  "invalid-status": "liststatus",
  "invalid-input": "input",
  "price-list-not-found": "notfound",
  "list-not-found": "notfound",
  "not-found": "notfound",
  "subcontractor-not-found": "notfound",
  "note-required": "note",
  // 0109: عدد مسارات الكشف تغيّر بين رسم الصفحة والضغط ⇒ لم تُكتب حالةٌ واحدة
  "count-changed": "sheetcount",
  // 0135: القيمة المعروضة على الشاشة لم تعد هي القيمة في القاعدة ⇒ لا كتابة
  stale: "pricestale",
};

function hintCode(error: { hint?: string | null } | null, fallback: string): string {
  const hint = typeof error?.hint === "string" ? error.hint.trim() : "";
  return HINT_CODES[hint] ?? fallback;
}

/**
 * وجهة العودة بعد المراجعة أو التعديل — **قائمة بيضاء لا نص حر**.
 *
 * والمسار والاستعلام يُبنيان من جديد لا يُمرَّران: أربعة مفاتيح معلومة بأطوالٍ
 * مسقوفة (بحثُ المسارات · الصفحة · المسار المفتوح · تبويب الحالة)، وما عداها
 * يسقط. فالوجهةُ تبقى مغلقةً على اللوحة ولا تصير تحويلاً مفتوحاً، **ويبقى مع
 * ذلك** بحثُ المشرف وصفحتُه بعد كل حفظ — وضياعُهما بعد كل تعديل خانةٍ يجعل
 * التحرير بالنقر غير قابلٍ للاستعمال أصلاً على مئة مسار.
 */
const KEEP_PARAMS = new Set(["q", "offset", "route", "status"]);

/**
 * مراسٍ مسموحة — بها يعود المشرف إلى قسم المسارات لا إلى رأس الصفحة بعد كل حفظ.
 * ⚠ ولا تُترك حرّة: مرساةٌ غير مُنقّاة تصل `route=<uuid>#routes` فيصير المعرّف
 * نصّاً لا معرّفاً — أي أن غيابَ هذا التنقية يكسر الوجهة صامتاً لا يفتح ثغرة.
 */
const KEEP_HASHES = new Set(["routes", "route-detail"]);

function safeReturn(to: string): string {
  const hashCut = to.indexOf("#");
  const hash = hashCut === -1 ? "" : to.slice(hashCut + 1);
  const bare = hashCut === -1 ? to : to.slice(0, hashCut);

  const cut = bare.indexOf("?");
  const path = cut === -1 ? bare : bare.slice(0, cut);
  const query = cut === -1 ? "" : bare.slice(cut + 1);

  let base: string;
  if (path === REVIEWS_PATH || path === ROUTES_PATH || path === LIST_PATH) {
    base = path;
  } else {
    const id = path.startsWith(`${LIST_PATH}/`) ? path.slice(LIST_PATH.length + 1) : "";
    base = UUID.test(id) ? `${LIST_PATH}/${id}` : REVIEWS_PATH;
  }

  const keep = new URLSearchParams();
  for (const [key, value] of new URLSearchParams(query)) {
    if (KEEP_PARAMS.has(key) && value.length <= 120) keep.set(key, value);
  }
  const rest = keep.toString();
  const anchor = KEEP_HASHES.has(hash) ? `#${hash}` : "";
  return `${base}${rest ? `?${rest}` : ""}${anchor}`;
}

// ---------------------------------------------------------------------------
// الدعوة — إنشاء صف المتعهد ثم بريد الدعوة الرسمي
// ---------------------------------------------------------------------------

type InviteOutcome = { userId: string | null; failed: boolean };

/**
 * إرسال رابط تعيين كلمة المرور — لا ترمي أبداً ولا تُعيد توجيهاً؛ تُرجع النتيجة
 * ليقرر المُنادي.
 *
 * البريد المسجَّل مسبقاً ليس فشلاً لكنه ليس دعوة أيضاً: Supabase ترفض دعوة حساب
 * قائم فلا يخرج أي بريد، ولو اكتفينا بالتقاط معرّفه لأخبرنا المدير كذباً أن
 * الرسالة أُرسلت. لذلك نتحول في هذه الحال إلى بريد استعادة كلمة المرور — يفتح
 * الصفحة نفسها ويؤدي الغرض نفسه (نفس ما يفعله `scripts/resend-password-link.mjs`).
 */
async function sendInvite(service: SupabaseClient, email: string): Promise<InviteOutcome> {
  const redirectTo = `${getBaseUrl()}/admin/set-password`;
  try {
    const { data, error } = await service.auth.admin.inviteUserByEmail(email, { redirectTo });
    if (!error) return { userId: data.user?.id ?? null, failed: false };

    if (String(error.message).toLowerCase().includes("already")) {
      const { data: list, error: listError } = await service.auth.admin.listUsers({
        perPage: 1000,
      });
      const found = listError
        ? null
        : (list.users.find((u) => (u.email ?? "").toLowerCase() === email)?.id ?? null);
      const { error: resetError } = await service.auth.resetPasswordForEmail(email, {
        redirectTo,
      });
      return { userId: found, failed: Boolean(resetError) };
    }
    return { userId: null, failed: true };
  } catch {
    // تعذّر الاتصال بخدمة المصادقة — الصف محفوظ والرابط يُرسل يدوياً بالسكربت
    return { userId: null, failed: true };
  }
}

/**
 * ربط حساب الدخول بالمتعهد: `subcontractors.profile_id` ثم `profiles.role`.
 * الفشل هنا ليس قاتلاً — الصف موجود والدعوة أُرسلت، وشاشة الملف تعرض حالة الربط
 * الحقيقية مع الأمر الذي يصلحها، بدل أن يضيع المتعهد كله بسبب خطوة ثانوية.
 */
async function linkProfile(
  supabase: SupabaseClient,
  service: SupabaseClient,
  subcontractorId: string,
  userId: string
): Promise<void> {
  await supabase
    .from("subcontractors")
    .update({ profile_id: userId })
    .eq("id", subcontractorId)
    .select("id");

  await service.from("profiles").update({ role: "subcontractor" }).eq("id", userId).select("id");
}

/**
 * دعوة متعهد جديد — اسم الشركة والبريد والموبايل.
 *
 * الترتيب مقصود: يُنشأ صف المتعهد أولاً بجلسة المدير (فتمر الكتابة على RLS وتُكشف
 * الصفوف الصفرية)، ثم تُرسل الدعوة. فإن غاب مفتاح الخدمة أو تعثّر البريد بقي
 * المتعهد مسجّلاً وظهر للمدير أمر الإرسال اليدوي — لا يضيع الإدخال أبداً.
 */
export async function inviteSubcontractor(formData: FormData) {
  const supabase = await createServerSupabase();
  if (!supabase) redirect(listUrl("error=env"));

  const companyName = text(formData, "new.company_name")?.slice(0, MAX_NAME) ?? null;
  if (!companyName) redirect(listUrl("error=company"));

  const email = (text(formData, "new.email") ?? "").toLowerCase();
  if (!EMAIL.test(email)) redirect(listUrl("error=email"));

  const rawPhone = text(formData, "new.phone");
  const phone = rawPhone ? toLatinDigits(rawPhone).slice(0, MAX_PHONE) : null;
  if (!phone) redirect(listUrl("error=phone"));

  const insert = await supabase
    .from("subcontractors")
    .insert({ company_name: companyName, email, phone, status: "pending" })
    .select("id");

  // 23505 = تكرار البريد أو الرقم؛ صفر صفوف مع نجاح ظاهري = RLS رفضت (لست admin)
  if (insert.error || !insert.data || insert.data.length === 0) {
    redirect(listUrl(`error=${insert.error?.code === "23505" ? "exists" : "save"}`));
  }
  const subcontractorId = String(insert.data[0].id);

  const service = createServiceSupabase();
  if (!service) {
    revalidatePath("/", "layout");
    redirect(detailUrl(subcontractorId, "saved=manual"));
  }

  const invite = await sendInvite(service, email);
  if (invite.userId) await linkProfile(supabase, service, subcontractorId, invite.userId);

  revalidatePath("/", "layout");
  redirect(detailUrl(subcontractorId, invite.failed ? "saved=invitefail" : "saved=invited"));
}

/**
 * إعادة إرسال الدعوة من صفحة الملف — للحساب الذي لم يُربط بعد أو ضاع بريده.
 * البريد يُقرأ من القاعدة لا من النموذج، فلا يمر بريد أحد في رابط أو حقل مخفي.
 */
export async function resendInvite(subcontractorId: string) {
  const supabase = await createServerSupabase();
  if (!supabase) redirect(detailUrl(subcontractorId, "error=env"));

  const row = await supabase
    .from("subcontractors")
    .select("id, email")
    .eq("id", subcontractorId)
    .maybeSingle();
  if (row.error || !row.data) redirect(detailUrl(subcontractorId, "error=notfound"));

  const email = typeof row.data.email === "string" ? row.data.email.trim().toLowerCase() : "";
  if (!EMAIL.test(email)) redirect(detailUrl(subcontractorId, "error=email"));

  const service = createServiceSupabase();
  if (!service) redirect(detailUrl(subcontractorId, "saved=manual"));

  const invite = await sendInvite(service, email);
  if (invite.userId) await linkProfile(supabase, service, subcontractorId, invite.userId);

  revalidatePath("/", "layout");
  redirect(detailUrl(subcontractorId, invite.failed ? "saved=invitefail" : "saved=invited"));
}

// ---------------------------------------------------------------------------
// اعتماد المتعهد وإيقافه
// ---------------------------------------------------------------------------

const STATUSES: SubcontractorStatus[] = ["pending", "approved", "suspended"];

/**
 * تغيير حالة المتعهد — بعد خطوة تأكيد في الواجهة.
 * الأثر مباشر على العميل: أسعار المعتمد وحده تدخل `quote_price`، وإيقافه يخرجها
 * من التسعير فوراً بلا حذف صف واحد.
 */
export async function setSubcontractorStatus(
  subcontractorId: string,
  status: SubcontractorStatus
) {
  const supabase = await createServerSupabase();
  if (!supabase) redirect(detailUrl(subcontractorId, "error=env"));

  if (!(STATUSES as string[]).includes(status)) {
    redirect(detailUrl(subcontractorId, "error=substatus"));
  }

  const { data, error } = await supabase
    .from("subcontractors")
    .update({ status })
    .eq("id", subcontractorId)
    .select("id");

  // صفر صفوف مع نجاح ظاهري = RLS رفضت التحديث (المستخدم ليس admin)
  if (error || !data || data.length === 0) redirect(detailUrl(subcontractorId, "error=save"));

  revalidatePath("/", "layout");
  redirect(detailUrl(subcontractorId, `saved=${status}`));
}

// ---------------------------------------------------------------------------
// فصل ربط تليجرام عن متعهد — مخرجُ المالك من ارتباطٍ خاطئ
// ---------------------------------------------------------------------------

/**
 * لماذا يملك المالك هذا الزر أصلاً؟ لأن الارتباط الخاطئ قد يكون **هو الذي يمنع
 * المالك من الوصول**: محادثةٌ سُجّلت لمتعهدٍ ترك الشركة، أو — وهي الحالة المقيسة
 * في قاعدة بدر — محادثةٌ هي نفسها وجهةُ إشعارات فريق التشغيل، فتختلط رسائل
 * الإدارة (اسم العميل وهاتفه وسعره وهامشنا) بعروض المتعهد في محادثةٍ واحدة.
 *
 * وحارسُ `0057` يمنع **الجديد** ولا يزيل **القديم** — فلا بد من مخرجٍ بنقرة،
 * وإلا بقي الارتباط لأن لا أحد يملك حذفه: المتعهد قد لا يدخل بورتاله أصلاً.
 *
 * 🔒 **والتفريغ لا يتصادم أبداً**: `null` ليس ارتباطاً، فلا يمرّ على أي فرعٍ في
 * `telegram_chat_conflict` — أي أن هذا الزرّ لا يمكن أن يفشل بسبب الحارس نفسه.
 * ولا معرّف محادثةٍ يمرّ في رابطٍ ولا يُقرأ إلى الواجهة: المسح بالمعرّف وحده.
 */
export async function unlinkPartnerTelegram(subcontractorId: string) {
  const supabase = await createServerSupabase();
  if (!supabase) redirect(detailUrl(subcontractorId, "error=env"));

  const { data, error } = await supabase
    .from("subcontractors")
    .update({ telegram_chat_id: null })
    .eq("id", subcontractorId)
    .select("id");

  // صفر صفوف مع نجاح ظاهري = RLS رفضت التحديث (المستخدم ليس admin)
  if (error || !data || data.length === 0) redirect(detailUrl(subcontractorId, "error=save"));

  revalidatePath("/", "layout");
  redirect(detailUrl(subcontractorId, "saved=tgunlinked"));
}

// ---------------------------------------------------------------------------
// مراجعة قوائم الأسعار — من طابور المراجعة أو من ملف المتعهد
// ---------------------------------------------------------------------------

/**
 * اعتماد قائمة أسعار أو رفضها — `review_price_list` وحدها من يغيّر الحالة، وهي
 * ترفض أي قائمة ليست «بانتظار المراجعة» وترفض غير المشرف. الملاحظة إلزامية عند
 * الرفض لأن المتعهد يقرأها ليصحّح قائمته.
 *
 * `returnTo` يصل مربوطاً من الخادم (bind) ويُمرَّر على قائمة بيضاء قبل استعماله،
 * فلا يتحول إلى وجهة تحويل مفتوحة.
 */
export async function reviewPriceList(
  priceListId: string,
  approve: boolean,
  returnTo: string,
  formData: FormData
) {
  const back = safeReturn(returnTo);
  const url = (qs: string) => withCode(back, qs);

  const supabase = await createServerSupabase();
  if (!supabase) redirect(url("error=env"));

  const note = trimNote(text(formData, approve ? "approve_note" : "reject_note"));
  if (!approve && !note) redirect(url("error=note"));

  const { error } = await supabase.rpc("review_price_list", {
    p_id: priceListId,
    p_approve: approve,
    p_note: note,
  });
  if (error) redirect(url(`error=${hintCode(error, "save")}`));

  revalidatePath("/", "layout");
  // رمزان مستقلان عن رمزي حالة المتعهد نفسه (`saved=approved` هناك يعني اعتماد
  // الشريك لا اعتماد قائمته) — نفس الصفحة تستقبل الاثنين فلا يجوز خلطهما
  redirect(url(approve ? "saved=approvedlist" : "saved=rejectedlist"));
}

/**
 * اعتماد **كشف أسعار كامل** أو رفضه — قرارٌ واحد لكل مساراته المنتظرة (0102).
 *
 * هذا هو ما طلبه المالك: متعهد يُدخل ~١٠٠ مسار لا ينتج ~١٠٠ طلب اعتماد.
 * و`review_price_sheet` هي من يكتب، وهي ترفض غير المشرف صراحةً — وفوقها يبقى
 * المُشغّل `price_lists_guard_review` مانعاً المتعهد من كتابة `approved` بأي طريق.
 * الملاحظة إلزامية عند الرفض وتُكتب على كل مسارات الدفعة فيقرؤها المتعهد.
 *
 * 🔴 `expected` هو **العدد المطبوع على الزرّ نفسه**، ويصل مربوطاً من الخادم.
 * وهجرة 0109 تجعله إلزامياً في القاعدة: أي اختلافٍ بينه وبين ما تُمسكه الدالة
 * `for update` يوقف الكتابة كلها ويعيد `hint = count-changed`. فالرقم المعروض
 * والرقم المكتوب شيءٌ واحد بنيوياً — لا شيئان يتصادف تطابقهما.
 * (‏والعبث بالقيمة لا يفتح باباً: من يبلغ هنا مشرفٌ سلفاً، وأقصى ما يناله رقمٌ
 * يطابق الواقع — أي بالضبط ما كان سيحدث لو أعاد التحميل.)
 */
export async function reviewPriceSheet(
  sheetId: string,
  approve: boolean,
  returnTo: string,
  expected: number,
  formData: FormData
) {
  const back = safeReturn(returnTo);
  const url = (qs: string) => withCode(back, qs);

  const supabase = await createServerSupabase();
  if (!supabase) redirect(url("error=env"));

  const note = trimNote(text(formData, approve ? "approve_note" : "reject_note"));
  if (!approve && !note) redirect(url("error=note"));

  // عددٌ غير صحيحٍ لا يُرسَل إلى القاعدة أصلاً: `null` هناك رسالتها عامة، وهنا
  // نعرف السبب بدقة — الشاشة لم تُحصِ ما ستعتمده.
  if (!Number.isSafeInteger(expected) || expected < 1) redirect(url("error=sheetcount"));

  const { error } = await supabase.rpc("review_price_sheet", {
    p_id: sheetId,
    p_approve: approve,
    p_note: note,
    p_expected: expected,
  });
  if (error) redirect(url(`error=${hintCode(error, "save")}`));

  revalidatePath("/", "layout");
  redirect(url(approve ? "saved=approvedsheet" : "saved=rejectedsheet"));
}

// ---------------------------------------------------------------------------
// الاعتماد الجزئي — مساراتٌ مختارة من كشفٍ واحد (0135)
// ---------------------------------------------------------------------------

/**
 * سقفُ ما يُرسله نموذجٌ واحد. حدُّ الاستيراد نفسه (٥٠٠ صف/ملف)، فكشفٌ أكبر
 * يُراجَع دفعةً كاملة بزرّ الكشف لا باختيارٍ يدوي لخمسمئة خانة.
 */
const MAX_SELECTION = 500;

/**
 * اعتماد أو رفض **مساراتٍ بأعيانها** من كشف — `review_selected_price_lists`
 * وحدها من يقرّر، وهي تفوّض كل صفٍّ إلى `review_price_list` فلا منطقَ اعتمادٍ
 * ثانٍ لا هنا ولا هناك.
 *
 * 🔴 والرقمُ المُمرَّر في `p_expected` هو **عدد الخانات كما وصلت من المتصفح
 * قبل أي تنقية** (`raw.length`)، بينما القاعدة تقارنه بعددها هي **بعد**
 * `distinct` وعضويةِ الكشف. فهما رقمان من مصدرين، واختلافُهما يوقف الكتابة
 * كلها — ولو اشتُقّ الاثنان من المصفوفة نفسها لصار الفحص زينةً لا تفشل أبداً
 * (‏`LESSONS.md` النمط ٩). ومعرّفٌ مكرَّر أو مشوَّه أو من كشفٍ آخر يُسقط النداء
 * كلَّه بدل أن يعتمد أقلَّ مما علّم عليه المشرف بصمت.
 */
export async function reviewSelectedPriceLists(
  sheetId: string,
  approve: boolean,
  returnTo: string,
  formData: FormData
) {
  const back = safeReturn(returnTo);
  const url = (qs: string) => withCode(back, qs);

  const supabase = await createServerSupabase();
  if (!supabase) redirect(url("error=env"));

  const raw = formData.getAll("route").filter((v): v is string => typeof v === "string");
  if (raw.length === 0) redirect(url("error=noselection"));
  if (raw.length > MAX_SELECTION) redirect(url("error=selbig"));

  const ids = raw.filter((v) => UUID.test(v));

  const note = trimNote(text(formData, approve ? "select_approve_note" : "select_reject_note"));
  if (!approve && !note) redirect(url("error=note"));

  const { error } = await supabase.rpc("review_selected_price_lists", {
    p_sheet: sheetId,
    p_ids: ids,
    p_approve: approve,
    p_note: note,
    p_expected: raw.length,
  });
  if (error) {
    const code = hintCode(error, "save");
    // «تغيّر العدد» هنا ليس نموّ الكشف بل انحرافُ الاختيار — ورسالتان مختلفتان
    redirect(url(`error=${code === "sheetcount" ? "selcount" : code}`));
  }

  revalidatePath("/", "layout");
  redirect(url(approve ? "saved=approvedsome" : "saved=rejectedsome"));
}

// ---------------------------------------------------------------------------
// التعديل بالنقر — خانةُ تكلفةٍ واحدة (0135)
// ---------------------------------------------------------------------------

/**
 * حفظُ تكلفة فئةٍ واحدة في مسار.
 *
 * 🔴 **ولا رقمَ يُحسب ولا يُتحقَّق منه هنا** (D-05): النصّ يُمرَّر كما كتبه
 * المشرف إلى `set_price_list_item_cost`، وهي التي تُطبّع الأرقام العربية
 * الهندية وتردّ `NaN` و`±Infinity` و«ليس رقماً» بحرّاسٍ قائمة (0108 · 0112).
 * وأيُّ تحقّقٍ نُكرّره هنا يصير رقماً ثانياً ينحرف عن الأول.
 *
 * و`seen` هي القيمة التي كانت **معروضةً على شاشة المشرف** حين فتحها: تُرسل مع
 * التعديل فترفض القاعدة الكتابةَ فوق تعديلِ زميلٍ وقع في الأثناء، وتقول الرقمين
 * معاً بدل أن يضيع أحدهما صامتاً.
 */
export async function setPriceListItemCost(
  priceListId: string,
  classSlug: string,
  returnTo: string,
  formData: FormData
) {
  const back = safeReturn(returnTo);
  const url = (qs: string) => withCode(back, qs);

  const supabase = await createServerSupabase();
  if (!supabase) redirect(url("error=env"));

  const rawCost = formData.get("cost");
  const rawSeen = formData.get("seen");
  if (typeof rawCost !== "string" || typeof rawSeen !== "string") {
    redirect(url("error=cost"));
  }
  // سقفُ طولٍ لا تحقّقٌ من الشكل: حقلٌ بمئة ألف محرف لا معنى له، والشكل للقاعدة
  const cost = rawCost.slice(0, 40);
  const seen = rawSeen.slice(0, 40);

  const { data, error } = await supabase.rpc("set_price_list_item_cost", {
    p_list: priceListId,
    p_class: classSlug,
    p_cost: cost,
    p_seen_cost: seen,
  });
  if (error) {
    const code = hintCode(error, "save");
    redirect(url(`error=${code === "input" ? "cost" : code}`));
  }

  // الدالة تُرجع صفاً واحداً؛ `changed = false` تعني «الرقم نفسه» لا فشلاً
  const row = Array.isArray(data) ? (data[0] as Record<string, unknown> | undefined) : undefined;
  const changed = row?.changed === true;
  const notified = row?.notified === true;

  revalidatePath("/", "layout");
  redirect(
    url(!changed ? "saved=costsame" : notified ? "saved=costlive" : "saved=costsaved")
  );
}
