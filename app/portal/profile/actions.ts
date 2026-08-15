"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { createServiceSupabase } from "@/lib/supabase/admin";
import { clamp, safeUrl, text, toLatinDigits } from "../_lib/form";
import { portalSetupAccess } from "../_lib/session";

/**
 * إجراءات ملف المتعهد — تعديل صفه في `subcontractors` ورفع صورته.
 *
 * قواعد ثابتة:
 * - `portalSetupAccess()` أولاً في كل إجراء: الغلاف لا يحمي نقاط الـ POST.
 *   وهو الحارس **الموسَّع** (معتمَد أو مدعوّ في مرحلة التجهيز) لا الضيّق: الملف
 *   بيانات الشريك نفسه، وRLS تسمح بتعديله بلا شرط حالة منذ `0011` — متحقَّقٌ حياً
 *   بانتحال صفة شريكٍ `pending` داخل معاملة مُلغاة. ولا شيء هنا يمسّ تشغيلاً.
 * - الحقول المكتوبة محصورة في قائمة بيضاء صريحة — لا `status` ولا `profile_id`
 *   ولا `notes` تمر من نموذج، مهما أُرسل في الـ FormData.
 * - فخ RLS المعروف: التحديث ينجح ظاهرياً بصفر صفوف عند رفض السياسة، لذلك
 *   `.select()` بعد كل كتابة وفحص طول النتيجة.
 * - اتفاقية «إعادة التوجيه بعد العملية»: النجاح والفشل كلاهما redirect برمز.
 */

const url = (qs: string) => `/portal/profile?${qs}`;

/** رقم هاتف معقول بعد تحويل الأرقام العربية — لا تحقق دولي صارم */
const PHONE_PATTERN = /^\+?[\d\s()-]{7,20}$/;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const MAX_NAME = 120;
const MAX_AVATAR_BYTES = 2 * 1024 * 1024;

/** أنواع الصور المقبولة وامتداداتها — الامتداد يُشتق من النوع لا من اسم الملف */
const AVATAR_TYPES: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};

/**
 * رفع الصورة يمر بعميل الخدمة عمداً: سياسات دلو `media` في هجرة 0003 تسمح
 * بالإدراج لـ `is_admin()` وحده، والمتعهد ليس مديراً. البديل الآمن هو رفعٌ من
 * الخادم **بعد** التحقق من هوية المتعهد، بمسار يُشتق من معرّفه لا من مدخلاته،
 * فلا يستطيع أحد الكتابة خارج مجلده حتى لو تلاعب بالنموذج.
 */
async function uploadAvatar(
  file: File,
  subcontractorId: string
): Promise<{ url: string } | { error: string }> {
  const service = createServiceSupabase();
  if (!service) return { error: "upload" };

  const extension = AVATAR_TYPES[file.type];
  if (!extension) return { error: "avatar_type" };
  if (file.size > MAX_AVATAR_BYTES) return { error: "avatar_size" };

  const path = `subcontractors/${subcontractorId}/${Date.now()}.${extension}`;
  const upload = await service.storage
    .from("media")
    .upload(path, file, { contentType: file.type, upsert: false });

  if (upload.error) return { error: "upload" };

  const { data } = service.storage.from("media").getPublicUrl(path);
  if (!data?.publicUrl) return { error: "upload" };
  return { url: data.publicUrl };
}

export async function saveProfile(formData: FormData) {
  const access = await portalSetupAccess();
  if (!access.ok) redirect(url(`error=${access.code}`));
  const { supabase, sub } = access;

  const companyName = clamp(text(formData, "company_name"), MAX_NAME);
  if (!companyName) redirect(url("error=company"));

  const rawPhone = text(formData, "phone");
  const phone = rawPhone ? toLatinDigits(rawPhone) : null;
  if (!phone || !PHONE_PATTERN.test(phone)) redirect(url("error=phone"));

  const rawWhatsapp = text(formData, "whatsapp");
  const whatsapp = rawWhatsapp ? toLatinDigits(rawWhatsapp) : null;
  if (whatsapp && !PHONE_PATTERN.test(whatsapp)) redirect(url("error=whatsapp"));

  const email = text(formData, "email")?.toLowerCase() ?? null;
  if (email && !EMAIL_PATTERN.test(email)) redirect(url("error=email"));

  // الروابط الاجتماعية: بروتوكول http/https فقط — الفارغ يبقى فارغاً لا نصاً مكسوراً
  const socialFields = ["facebook", "instagram", "website"] as const;
  const socials: Record<string, string | null> = {};
  for (const field of socialFields) {
    const raw = text(formData, field);
    if (!raw) {
      socials[field] = null;
      continue;
    }
    const normalized = safeUrl(raw);
    if (!normalized) redirect(url("error=link"));
    socials[field] = normalized;
  }

  // الصورة: ملف مرفوع يفوز على الرابط النصي، والرابط النصي يفوز على القيمة الحالية
  let avatarUrl = safeUrl(text(formData, "avatar_url"));
  const file = formData.get("avatar");
  if (file instanceof File && file.size > 0) {
    const uploaded = await uploadAvatar(file, sub.id);
    if ("error" in uploaded) redirect(url(`error=${uploaded.error}`));
    avatarUrl = uploaded.url;
  }

  const res = await supabase
    .from("subcontractors")
    .update({
      company_name: companyName,
      contact_name: clamp(text(formData, "contact_name"), MAX_NAME),
      phone,
      whatsapp,
      email,
      avatar_url: avatarUrl,
      socials,
    })
    .eq("id", sub.id)
    .select("id");

  if (res.error || !res.data || res.data.length === 0) redirect(url("error=save"));

  revalidatePath("/", "layout");
  redirect(url("saved=1"));
}

/** إزالة الصورة — نمسح الرابط فقط ونترك الملف في الدلو (لا حذف صامت لبيانات) */
export async function removeAvatar() {
  const access = await portalSetupAccess();
  if (!access.ok) redirect(url(`error=${access.code}`));
  const { supabase, sub } = access;

  const res = await supabase
    .from("subcontractors")
    .update({ avatar_url: null })
    .eq("id", sub.id)
    .select("id");

  if (res.error || !res.data || res.data.length === 0) redirect(url("error=save"));

  revalidatePath("/", "layout");
  redirect(url("saved=1"));
}
