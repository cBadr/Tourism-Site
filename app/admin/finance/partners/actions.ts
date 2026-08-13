"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { isMissingFunction, isMissingTable } from "@/lib/dispatch/settings";
import { createServerSupabase } from "@/lib/supabase/server";
import {
  amountField,
  MAX_AMOUNT,
  noteField,
  numberField,
  occurredAtField,
  reasonField,
  referenceField,
  rpcErrorCode,
  uuidField,
} from "../_components/form";
import { cairoInstantForDate } from "../_components/range";

/**
 * إجراءات المقاصة: التسوية الموحّدة باتجاهيها، والمقدَّم الصريح، وسقف الديون.
 *
 * ── التسوية الموحّدة (هجرة 0029، و١) ────────────────────────────────────────
 * الشاشة صارت **مدخلاً واحداً** لكل متعهد، والاتجاه يُشتق من `net_due` في
 * `v_partner_settlements` لا من اختيار المشرف:
 *
 *   `net_due > 0` (له علينا) ⇒ `record_partner_payout`   — دفع، كما هو اليوم
 *   `net_due < 0` (عليه لنا) ⇒ `record_partner_settlement` — تحصيل، الاتجاه الجديد
 *
 * والسبب أن اختيار الاتجاه باليد صنفٌ كامل من خطأ المشغّل لا حالة نادرة: أن
 * تدفع لمن عليه لك، أو تحاول تسجيل تحصيل دفعةً — وكلاهما يزيد الدين بدل أن
 * ينقصه. والاشتقاق نفسه يقع في `settlementDirection` على إشارة عمود واحد.
 *
 * الدفعة حركتان في قيد واحد تكتبه `record_partner_payout`: خروج نقد من حساب
 * خزينة، وخصم من الالتزام تجاه الشريك. لذلك لا يُحسب هنا صافٍ جديد ولا يُقارن
 * المبلغ بالمستحق — الدفعة الجزئية مشروعة، والقرار المحاسبي كله داخل الدالة.
 *
 * ── القاعدة الجديدة (الملاحظة ١٧، هجرة 0027) — نقضٌ واعٍ لما كان هنا ──────────
 * كان مكتوباً في هذا الموضع أن «الدفع لشريك مدين لنا مشروع (مقدَّم عن رحلات
 * قادمة) والشاشة تحذّر فقط». **نقض بدر هذه القاعدة نصاً**: «فلا ندفع لمتعهد
 * بينما لنا عنده مال» (‏`docs/VISION.md` ملاحظة ١٧). فصارت القاعدة:
 *
 *   مع تفعيل `block_payout` (وهو **الافتراضي**) ترفض `record_partner_payout`
 *   أي دفعة لمتعهد رصيده سالب، وترفع `hint = 'partner-owing'`.
 *
 * وحدّ هذا المنع يستحق الوضوح: هو يقع على **أي دين مهما صغر** (‏`partner_debt >
 * 0`) ولا يقرأ قيمة `debt_limit` إطلاقاً — السقف يخصّ حجب العروض والقبول لا
 * الدفع. فسقف بصفر («بلا سقف») لا يعطّل هذا المنع.
 *
 * والتجاوز موجود ومقصود: `record_partner_payout_advance` تسجّل الدفعة **مقدَّماً
 * صريحاً** بملاحظة إلزامية، على سابقة `manual_assign_with_loss`. قرار بشري
 * مكتوب في الدفتر — لا التفاف صامت على الحارس.
 *
 * اتفاقية «إعادة التوجيه بعد العملية» سارية: النجاح والفشل كلاهما redirect برمز.
 */

const PATH = "/admin/finance/partners";
const url = (qs: string) => `${PATH}?${qs}`;

/**
 * ما يُحمل في الرابط عند العودة إلى النموذج — الحالة كلها في الـ query string
 * ولا `useState` في أي مكان (اتفاقية §٤).
 *
 * إعادة المبلغ والحساب والتاريخ ليست تجميلاً: بلا حملها يعود التاريخ صامتاً إلى
 * «اليوم» ويفقد المشرف ما كتبه بيده كلما رفضت القاعدة الدفعة — وهذا بالضبط ما
 * سيقع الآن مع كل متعهد مدين، لا في حالة نادرة.
 */
type Carried = {
  error?: string;
  /** خطوة التأكيد الصريحة للمقدَّم — على نمط `?confirm=cancel` في شاشة الطلب */
  confirm?: "advance";
  account?: string | null;
  amount?: number | null;
  /** تاريخ الحركة `YYYY-MM-DD` كما كتبه المشرف */
  at?: string | null;
  /**
   * مرجع العملية في فرع التحصيل. حمله ليس تجميلاً: أشيع رفضٍ في هذا النموذج هو
   * `reference-required`، وبلا حمله يفقد المشرف رقم التحويل الذي نسخه من إشعار
   * العملية كلما ردّته القاعدة — فيعود إلى تطبيق البنك ليجده مرة أخرى.
   */
  reference?: string | null;
};

const formUrl = (subcontractor: string, carried: Carried): string => {
  const qs = new URLSearchParams({ pay: subcontractor });
  if (carried.confirm) qs.set("confirm", carried.confirm);
  if (carried.error) qs.set("error", carried.error);
  if (carried.account) qs.set("account", carried.account);
  if (carried.amount !== null && carried.amount !== undefined) {
    qs.set("amount", String(carried.amount));
  }
  if (carried.at) qs.set("at", carried.at);
  if (carried.reference) qs.set("reference", carried.reference);
  return `${PATH}?${qs.toString()}`;
};

/**
 * تسجيل دفعة لمتعهد.
 *
 * المسار السعيد بلا تغيير. الجديد هو مسار الرفض: `partner-owing` تلميحٌ لا
 * يعرفه `rpcErrorCode` (وهو مشترك مع شاشات المالية الأخرى ولا يخصّ هذه الشاشة)،
 * فيُترجَم هنا إلى رمز `owing` مع إعادة فتح النموذج بقيمه وعرض زر المقدَّم.
 */
export async function recordPartnerPayout(formData: FormData) {
  const supabase = await createServerSupabase();
  if (!supabase) redirect(url("error=env"));

  const subcontractor = uuidField(formData, "subcontractor");
  if (!subcontractor) redirect(url("error=partner"));

  // عند الفشل نُعيد فتح نموذج نفس الشريك بقيمه حتى لا يعيد المالك كتابتها
  const back = (code: string, carried: Carried = {}) =>
    formUrl(subcontractor, { error: code, ...carried });

  const account = uuidField(formData, "account");
  if (!account) redirect(back("account"));

  const amount = amountField(formData);
  if (typeof amount === "string") redirect(back(amount, { account }));

  const occurredAt = occurredAtField(formData);
  if (occurredAt === "date" || occurredAt === "future") {
    redirect(back(occurredAt, { account, amount }));
  }

  const kept: Carried = { account, amount, at: occurredAt };

  const { error } = await supabase.rpc("record_partner_payout", {
    p_sub: subcontractor,
    p_account: account,
    p_amount: amount,
    p_at: cairoInstantForDate(occurredAt),
    p_note: noteField(formData),
  });

  if (error) {
    const hint = (error.hint ?? "").trim();
    redirect(back(hint === "partner-owing" ? "owing" : rpcErrorCode(error), kept));
  }

  revalidatePath("/admin/finance", "layout");
  redirect(url("saved=1"));
}

/** أول صف من نتيجة دالة جدولية — `record_partner_settlement` ترجع صفاً واحداً */
const firstRow = (data: unknown): Record<string, unknown> | null =>
  Array.isArray(data) ? ((data[0] as Record<string, unknown>) ?? null) : null;

/**
 * تمرير رقم أرجعته القاعدة إلى الرابط **كما هو** — لا تقريب ولا إعادة حساب.
 *
 * PostgREST قد يمرّر `numeric` رقماً أو نصاً بحسب الإعداد، فيُقبل الشكلان ويُرفض
 * ما عداهما. وما يُرفض هنا لا يُستبدل بصفر: البطاقة تعرض «—» ويبقى الجدول أسفلها
 * هو الحقيقة المقروءة من العرض.
 */
const passThrough = (value: unknown): string | null => {
  if (typeof value === "number") return Number.isFinite(value) ? String(value) : null;
  if (typeof value === "string") {
    const trimmed = value.trim();
    return trimmed !== "" && Number.isFinite(Number(trimmed)) ? trimmed : null;
  }
  return null;
};

/**
 * تحصيل من متعهد — الاتجاه الثاني للحساب المفتوح (هجرة 0029).
 *
 * تُستدعى من فرع «عليه لنا» في التسوية الموحّدة وحده، ولا تختار اتجاهاً بنفسها:
 * الاختيار وقع في الشاشة على إشارة `net_due`، والقاعدة تكتب القيد بدور `received`
 * على حساب خزينة حقيقي — فيرتفع الرصيد وينخفض الدين بقيدٍ واحد.
 *
 * **لا يُقارن المبلغ بالدين هنا ولا يُقصّ عليه.** الجزئي هو العرف (يسدّد على
 * دفعات)، والزائد على الدين مشروع أيضاً فيقلب الصافي إلى موجب — وقصّ ما كتبه
 * المشرف صامتاً كان سيعني قيداً بمبلغ لم يُسلَّم فعلاً، وهو أسوأ من رقم يبدو
 * غريباً في الشاشة.
 *
 * وإلزامية المرجع لغير النقدية تُفرض في القاعدة وحدها (‏`reference-required`):
 * الشاشة لا تعرف نوع الحساب إلا مما حمّلته، والقاعدة تعرفه يقيناً. الواجهة
 * تشرح — والحارس واحد لا اثنان ينحرفان.
 */
export async function recordPartnerSettlement(formData: FormData) {
  const supabase = await createServerSupabase();
  if (!supabase) redirect(url("error=env"));

  const subcontractor = uuidField(formData, "subcontractor");
  if (!subcontractor) redirect(url("error=partner"));

  const back = (code: string, carried: Carried = {}) =>
    formUrl(subcontractor, { error: code, ...carried });

  const account = uuidField(formData, "account");
  if (!account) redirect(back("account"));

  const amount = amountField(formData);
  if (typeof amount === "string") redirect(back(amount, { account }));

  const occurredAt = occurredAtField(formData);
  if (occurredAt === "date" || occurredAt === "future") {
    redirect(back(occurredAt, { account, amount }));
  }

  const reference = referenceField(formData);
  const kept: Carried = { account, amount, at: occurredAt, reference };

  const { data, error } = await supabase.rpc("record_partner_settlement", {
    p_sub: subcontractor,
    p_account: account,
    p_amount: amount,
    p_at: cairoInstantForDate(occurredAt),
    p_reference: reference,
    p_note: noteField(formData),
  });

  if (error) {
    /**
     * «الدالة غير موجودة» = هجرة 0029 لم تُنفَّذ بعد، ورسالتها تخصّها بالاسم
     * والرقم لا رسالة `notready` العامة التي تحيل إلى هجرة 0015. أما ٤٢٥٠١
     * (رفض صلاحية) و`forbidden` و`reference-required` فيصنّفها `rpcErrorCode`.
     */
    redirect(
      back(isMissingFunction(error.code) ? "settlenotready" : rpcErrorCode(error), kept)
    );
  }

  /**
   * ما يسافر في الرابط: **المبلغ المُسجَّل وحده**.
   *
   * كان يسافر معه `net` (موقف المتعهد) و`bal` (رصيد حساب الخزينة كاملاً). والرابط
   * ليس قناة خاصة: يستقر في تاريخ المتصفح، وفي سجلات الخادم، وفي ترويسة `Referer`
   * لأي رابط خارجي يُنقر من الصفحة بعدها. ورصيد الخزينة تحديداً هو **أعمق رقم في
   * الشركة** ولا شأن له بهذه العملية أصلاً.
   *
   * ولا يضيع شيء بحذفهما: الصافي تقرؤه الصفحة من `v_partner_settlements` والرصيد
   * من `v_account_balances` بعد `revalidatePath` أدناه — أي **أحدث** مما كان في
   * الرابط لا أقدم، ومن مصدرهما لا من نسخة منقولة. والمبلغ يبقى لأنه ما كتبه
   * المشرف للتوّ ولا مصدر ثانياً له في الصفحة.
   */
  const row = firstRow(data);
  const done = new URLSearchParams({ saved: "settlement", who: subcontractor, acc: account });
  const settled = passThrough(row?.amount);
  if (settled !== null) done.set("amt", settled);

  revalidatePath("/admin/finance", "layout");
  redirect(url(done.toString()));
}

/**
 * المقدَّم الصريح — تجاوز بشري لمنع الدفع لمدين.
 *
 * لا تُستدعى إلا من بطاقة التأكيد الثانية (‏`?confirm=advance`)، والملاحظة فيها
 * **إلزامية** في الواجهة وفي القاعدة معاً: القاعدة ترفع `note-required`، والحقل
 * هنا يرفض ما دون أربعة أحرف قبل أن يصل إليها. الحارسان مستقلان عمداً — الواجهة
 * تشرح، والقاعدة تمنع.
 */
export async function recordPartnerPayoutAdvance(formData: FormData) {
  const supabase = await createServerSupabase();
  if (!supabase) redirect(url("error=env"));

  const subcontractor = uuidField(formData, "subcontractor");
  if (!subcontractor) redirect(url("error=partner"));

  // الفشل يعيد فتح **بطاقة المقدَّم** لا نموذج الدفع العادي
  const back = (code: string, carried: Carried = {}) =>
    formUrl(subcontractor, { error: code, confirm: "advance", ...carried });

  const account = uuidField(formData, "account");
  if (!account) redirect(back("account"));

  const amount = amountField(formData);
  if (typeof amount === "string") redirect(back(amount, { account }));

  const occurredAt = occurredAtField(formData);
  if (occurredAt === "date" || occurredAt === "future") {
    redirect(back(occurredAt, { account, amount }));
  }

  const note = reasonField(formData);
  if (note === "reason") redirect(back("advnote", { account, amount, at: occurredAt }));

  const kept: Carried = { account, amount, at: occurredAt };

  const { error } = await supabase.rpc("record_partner_payout_advance", {
    p_sub: subcontractor,
    p_account: account,
    p_amount: amount,
    p_at: cairoInstantForDate(occurredAt),
    p_note: note,
  });

  if (error) {
    const hint = (error.hint ?? "").trim();
    redirect(back(hint === "note-required" ? "advnote" : rpcErrorCode(error), kept));
  }

  revalidatePath("/admin/finance", "layout");
  redirect(url("saved=advance"));
}

/**
 * حفظ سقف ديون المتعهدين — صف وحيد في `partner_credit_settings` (هجرة 0027).
 *
 * نفس نمط `pricing_settings` و`dispatch_settings`: نحدّث الصف الموجود، وإن لم
 * يوجد نُدرجه. ولا حساب هنا إطلاقاً — الرقم يُخزَّن كما كُتب، وكل مقارنة به تقع
 * في `partner_over_debt_limit()` و`v_partner_settlements` داخل القاعدة.
 */

/** سقف أعلى عاقل للرقم المكتوب — ما فوقه خطأ لوحة مفاتيح لا نية (والعمود numeric(12,2)) */
const MAX_DEBT_LIMIT = MAX_AMOUNT;

export async function savePartnerCreditSettings(formData: FormData) {
  const supabase = await createServerSupabase();
  if (!supabase) redirect(url("error=env"));

  // الأرقام العربية الهندية مقبولة ويحوّلها `numberField` قبل التحقق
  const debtLimit = numberField(formData, "debt_limit") ?? 0;
  if (!Number.isFinite(debtLimit) || debtLimit < 0 || debtLimit > MAX_DEBT_LIMIT) {
    redirect(url("error=limit"));
  }

  const patch: Record<string, unknown> = {
    debt_limit: debtLimit,
    block_dispatch: formData.get("block_dispatch") != null,
    block_payout: formData.get("block_payout") != null,
  };

  const existing = await supabase.from("partner_credit_settings").select("*").limit(1);
  if (existing.error) {
    // جدول غائب = هجرة 0027 لم تُنفَّذ؛ وأي فشل آخر رفضُ قراءةٍ من RLS
    redirect(
      url(isMissingTable(existing.error.code) ? "error=creditnotready" : "error=creditsave")
    );
  }

  const current = (existing.data?.[0] ?? null) as Record<string, unknown> | null;

  if (current) {
    // أسماء أعمدة الهجرة يجب أن تطابق العقد — وإلا فالتحديث ينجح صامتاً بلا أثر
    if (Object.keys(patch).some((column) => !(column in current))) {
      redirect(url("error=creditschema"));
    }

    // مفتاح الصف الوحيد `id boolean` قيمته `true` دائماً؛ وإن غاب العمود لسبب ما
    // قيّدنا بمرشّح يطابق الصف الوحيد — لا تحديث بلا مرشّح أبداً
    const query = supabase.from("partner_credit_settings").update(patch);
    const res = await (current.id === undefined
      ? query.not("debt_limit", "is", null)
      : query.eq("id", current.id as boolean)
    ).select();
    // صفر صفوف مع نجاح ظاهري = RLS رفضت الكتابة (المستخدم ليس admin)
    if (res.error || !res.data || res.data.length === 0) redirect(url("error=creditsave"));
  } else {
    const res = await supabase.from("partner_credit_settings").insert(patch).select();
    if (res.error || !res.data || res.data.length === 0) redirect(url("error=creditsave"));
  }

  // السقف يقرأه البث والقبول والمقاصة معاً — إبطال الشجرة كلها لا هذه الشاشة
  revalidatePath("/", "layout");
  redirect(url("saved=credit"));
}
