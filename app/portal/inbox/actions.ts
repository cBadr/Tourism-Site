"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { text } from "../_lib/form";
import { portalAccess } from "../_lib/session";

/**
 * تعليم صفوف الصندوق مقروءة — الكتابة الوحيدة التي يملكها هذا السطح.
 *
 * ولماذا دالة `portal_inbox_mark_read` لا `update` مباشر على `notifications`؟
 * لنفس سبب القراءة حرفياً: لا سياسة `UPDATE` على جدولٍ فيه بيانات عملاء، وإلا
 * صار المتعهد يكتب على صفوفٍ ليست له. الدالة تحصر التعديل في
 * `recipient_id = current_subcontractor_id()` وفي `read_at is null` وحدهما —
 * فلا يُعاد ختم مقروء، ولا يُلمس صفُّ أحدٍ آخر مهما أُرسل من معرّف.
 *
 * 🔒 **ولا مسار بديل عند غياب الدالة**: من لا يستطيع تعليم المقروء يبقى صندوقه
 * كما هو ويقرأ رمز خطأ صريحاً. تعليمُ «مقروء» بلا أثرٍ في القاعدة أسوأ من رفضٍ
 * معلن، لأنه يُنسي المتعهد ما لم يقرأه فعلاً.
 */

const url = (qs: string) => `/portal/inbox?${qs}`;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** رموز «الدالة غير موجودة» — تعني أن هجرة 0054 لم تُنفَّذ على هذا الخادم */
const MISSING_FUNCTION_CODES = new Set(["PGRST202", "42883"]);

/**
 * `p_id = null` تعني «الكل» في توقيع الدالة — وهو السلوك المقصود لزرّ «علّم الكل
 * مقروءاً». والمعرّف حين يصل يُتحقق من شكله هنا قبل إرساله: معرّفٌ مشوّه يرتدّ
 * من PostgREST بخطأ نوعٍ غامض، ورمزُ `notfound` أوضح منه للمتعهد.
 */
async function markRead(id: string | null) {
  // (١) الحارس أولاً — الصندوق سطح تشغيلي، فحارسه الضيّق
  const access = await portalAccess();
  if (!access.ok) redirect(url(`error=${access.code}`));

  // (٢) التحقق من المدخل ← خروج فوري برمز واضح
  if (id !== null && !UUID.test(id)) redirect(url("error=notfound"));

  // (٣) النداء وفحص نتيجته — والغياب يُفرَز عن الفشل
  const res = await access.supabase.rpc("portal_inbox_mark_read", { p_id: id });
  if (res.error) {
    const code = String(res.error.code ?? "");
    redirect(url(`error=${MISSING_FUNCTION_CODES.has(code) ? "schema" : "save"}`));
  }

  // (٤) إبطال الكاش ثم إعادة توجيه بنجاح — والعدّ يعود ليُقرأ في الشريط
  const marked = typeof res.data === "number" ? res.data : Number(res.data ?? 0);
  revalidatePath("/portal/inbox");
  redirect(url(`read=${Number.isFinite(marked) && marked > 0 ? marked : 0}`));
}

/** زرّ السطر الواحد */
export async function markInboxItemRead(formData: FormData) {
  await markRead(text(formData, "id"));
}

/** زرّ الشريط العلوي — الكل دفعةً واحدة */
export async function markInboxAllRead() {
  await markRead(null);
}
