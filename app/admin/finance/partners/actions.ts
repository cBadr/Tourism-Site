"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { createServerSupabase } from "@/lib/supabase/server";
import {
  amountField,
  noteField,
  occurredAtField,
  rpcErrorCode,
  uuidField,
} from "../_components/form";
import { cairoInstantForDate } from "../_components/range";

/**
 * إجراء المقاصة: تسجيل دفعة لمتعهد عبر `record_partner_payout`.
 *
 * الدفعة حركتان في قيد واحد تكتبه الدالة: خروج نقد من حساب خزينة، وخصم من
 * الالتزام تجاه الشريك. لذلك لا يُحسب هنا صافٍ جديد ولا يُقارن المبلغ بالمستحق:
 * الدفعة الجزئية مشروعة، والدفع لشريك مدين لنا مشروع أيضاً (مقدَّم عن رحلات
 * قادمة) — والقرار المحاسبي كله داخل الدالة، والشاشة تحذّر فقط.
 *
 * اتفاقية «إعادة التوجيه بعد العملية» سارية: النجاح والفشل كلاهما redirect برمز.
 */

const PATH = "/admin/finance/partners";
const url = (qs: string) => `${PATH}?${qs}`;

export async function recordPartnerPayout(formData: FormData) {
  const supabase = await createServerSupabase();
  if (!supabase) redirect(url("error=env"));

  const subcontractor = uuidField(formData, "subcontractor");
  if (!subcontractor) redirect(url("error=partner"));

  // عند الفشل نُعيد فتح نموذج نفس الشريك حتى لا يبحث المالك عن صفه من جديد
  const back = (code: string) =>
    url(`pay=${encodeURIComponent(subcontractor)}&error=${code}`);

  const account = uuidField(formData, "account");
  if (!account) redirect(back("account"));

  const amount = amountField(formData);
  if (typeof amount === "string") redirect(back(amount));

  const occurredAt = occurredAtField(formData);
  if (occurredAt === "date" || occurredAt === "future") redirect(back(occurredAt));

  const { error } = await supabase.rpc("record_partner_payout", {
    p_sub: subcontractor,
    p_account: account,
    p_amount: amount,
    p_at: cairoInstantForDate(occurredAt),
    p_note: noteField(formData),
  });

  if (error) redirect(back(rpcErrorCode(error)));

  revalidatePath("/admin/finance", "layout");
  redirect(url("saved=1"));
}
