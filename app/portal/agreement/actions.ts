"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { portalSetupAccess } from "../_lib/session";

/**
 * قبول اتفاقية المتعهد — الفعل الوحيد في هذه الشاشة.
 *
 * ── ثلاث قواعد ────────────────────────────────────────────────────────────
 *
 * (١) **`portalSetupAccess()` أولاً**: الغلاف لا يحمي نقاط الـPOST، وهذه نقطةٌ
 *     مستقلة عن شجرة التصيير. والحارس الموسَّع بقصد — المدعوُّ يقبل قبل اعتماده
 *     فيصل يوم الاعتماد قابلاً لا ناقصاً، والقبولُ ليس فعلاً على رحلةِ عميلٍ دفع.
 *
 * (٢) **لا قرار هنا ولا حساب.** الشرطُ كلُّه في `accept_partner_agreement`:
 *     هويةُ الشريك من `current_subcontractor_id()` داخل الدالة (لا وسيط شريك
 *     يُرسَل من هنا)، ورفضُ إصدارٍ ليس السارية، ورفضُ الاسم القصير. وهذه الطبقة
 *     تنقل الحقلين وتترجم الخطأ إلى رمز.
 *
 * (٣) **معرّف الإصدار يُرسَل من النموذج بقصد**: هو ما قرأه الشريك على الشاشة.
 *     فلو نُشرت نسخةٌ أحدث بين فتحِه الصفحة وضغطِه الزر، رفضت القاعدةُ القبول
 *     بـ`agreement-stale` — ولا يُسجَّل قبولٌ على نصٍّ لم يقرأه. والبديل (أن
 *     تقرأ الدالةُ الساريَ بنفسها وتقبله) كان يُنتج **قبولاً على نصٍّ لم يُعرض**،
 *     وهو بعينه ما يُبطل الاحتجاج بالسجل.
 */

const url = (qs: string) => `/portal/agreement?${qs}`;

/** رموز الخطأ التي ترفعها القاعدة (`using hint = …`) مترجَمةً إلى رمز شاشة */
function codeFor(message: string, hint: string | null): string {
  const text = `${hint ?? ""} ${message}`;
  if (text.includes("agreement-stale")) return "stale";
  if (text.includes("signed-name-required")) return "name";
  if (text.includes("agreement-missing")) return "missing";
  if (text.includes("forbidden")) return "account";
  return "save";
}

export async function acceptAgreement(formData: FormData) {
  const access = await portalSetupAccess();
  if (!access.ok) redirect(url(`error=${access.code}`));

  const versionId = formData.get("version_id");
  if (typeof versionId !== "string" || versionId.trim() === "") redirect(url("error=stale"));

  // الإقرار خانةُ اختيار: لا تُرسَل أصلاً حين لا تُعلَّم، فغيابها هو الرفض
  if (formData.get("confirm") == null) redirect(url("error=confirm"));

  const signedName = formData.get("signed_name");
  const name = typeof signedName === "string" ? signedName.trim() : "";
  if (name.length < 2) redirect(url("error=name"));

  const res = await access.supabase.rpc("accept_partner_agreement", {
    p_agreement_id: versionId.trim(),
    p_signed_name: name.slice(0, 160),
  });

  if (res.error) {
    const hint = (res.error as { hint?: string | null }).hint ?? null;
    redirect(url(`error=${codeFor(res.error.message ?? "", hint)}`));
  }

  /*
    القبول يغيّر **أهلية البثّ** لا هذه الشاشة وحدها: بند المعالج في `/portal`
    والشريطُ فيها يُقرآن من نفس النداء. فبطلانُ الذاكرة يشمل الاثنتين، وإلا قرأ
    الشريك «لم تقبل بعد» بعد أن قبل — وهو أسوأ من ألا تظهر رسالة نجاح أصلاً.
  */
  revalidatePath("/portal/agreement");
  revalidatePath("/portal");
  redirect(url("saved=1"));
}
