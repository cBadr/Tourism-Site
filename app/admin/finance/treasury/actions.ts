"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { createServerSupabase } from "@/lib/supabase/server";
import {
  amountField,
  occurredAtField,
  reasonField,
  rpcErrorCode,
  textField,
  uuidField,
} from "../_components/form";
import { cairoInstantForDate } from "../_components/range";

/**
 * إجراء الخزينة الوحيد: تسوية يدوية.
 *
 * قواعد ثابتة في كل إجراءات المرحلة ٧:
 * - **لا حساب مالي هنا.** الإجراء يتحقق من الشكل ثم يستدعي `record_adjustment`،
 *   والدالة وحدها تكتب القيد وتحرك الرصيد داخل معاملة واحدة.
 * - السبب إلزامي. تسوية بلا سبب مكتوب تحوّل الدفتر من سجل يُراجَع إلى أرقام
 *   يُصدَّق عليها، وهي أول ما يُسأل عنه عند أي فرق.
 * - اتفاقية «إعادة التوجيه بعد العملية»: النجاح والفشل كلاهما redirect برمز،
 *   مع الحفاظ على الحساب والفترة المعروضين حتى يعود المالك إلى مكانه لا إلى
 *   أول القائمة.
 * - فخ RLS المعروف: استدعاء دالة مرفوضة قد يعود بخطأ صريح، وقد تكون الدالة
 *   نفسها غائبة (هجرة غير منفَّذة) — `rpcErrorCode` تفرّق بينهما بدل «فشل».
 */

const PATH = "/admin/finance/treasury";

/** رابط العودة محافظاً على الحساب والفترة المعروضين قبل الإرسال */
function returnUrl(formData: FormData, result: string): string {
  const qs = new URLSearchParams();
  const account = textField(formData, "return_account");
  const range = textField(formData, "return_range");
  const from = textField(formData, "return_from");
  const to = textField(formData, "return_to");
  if (account) qs.set("account", account);
  if (range) qs.set("range", range);
  if (from) qs.set("from", from);
  if (to) qs.set("to", to);
  for (const [key, value] of new URLSearchParams(result)) qs.set(key, value);
  return `${PATH}?${qs.toString()}`;
}

export async function recordAdjustment(formData: FormData) {
  const supabase = await createServerSupabase();
  if (!supabase) redirect(returnUrl(formData, "error=env"));

  const account = uuidField(formData, "account");
  if (!account) redirect(returnUrl(formData, "error=account"));

  const direction = textField(formData, "direction");
  if (direction !== "in" && direction !== "out") {
    redirect(returnUrl(formData, "error=direction"));
  }

  const amount = amountField(formData);
  if (typeof amount === "string") redirect(returnUrl(formData, `error=${amount}`));

  const occurredAt = occurredAtField(formData);
  if (occurredAt === "date" || occurredAt === "future") {
    redirect(returnUrl(formData, `error=${occurredAt}`));
  }

  const note = reasonField(formData);
  if (note === "reason") redirect(returnUrl(formData, "error=reason"));

  const { error } = await supabase.rpc("record_adjustment", {
    p_account: account,
    p_direction: direction,
    p_amount: amount,
    p_at: cairoInstantForDate(occurredAt),
    p_note: note,
  });

  if (error) redirect(returnUrl(formData, `error=${rpcErrorCode(error)}`));

  revalidatePath("/admin/finance", "layout");
  redirect(returnUrl(formData, "saved=1"));
}
