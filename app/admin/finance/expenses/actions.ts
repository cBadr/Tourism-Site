"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { SupabaseClient } from "@supabase/supabase-js";

import { createServiceSupabase } from "@/lib/supabase/admin";
import { createServerSupabase } from "@/lib/supabase/server";
import {
  amountField,
  noteField,
  occurredAtField,
  rpcErrorCode,
  textField,
  uuidField,
} from "../_components/form";
import { cairoInstantForDate } from "../_components/range";

/**
 * إجراء المصروفات: تسجيل مصروف (بمرفق اختياري) عبر `record_expense`.
 *
 * ترتيب العمليات مقصود: **الرفع أولاً ثم القيد**. لو قيّدنا أولاً ثم فشل الرفع
 * لبقي مصروف يدّعي مرفقاً لا وجود له؛ وبالترتيب الحالي أسوأ ما يحدث ملف يتيم —
 * ونحذفه بأفضل جهد فور فشل القيد.
 *
 * المرفق يذهب إلى دلو `receipts` **الخاص** تحت بادئة `expenses/` (قرار العقد:
 * لا دلو جديد). سياسات ذلك الدلو مكتوبة للزائر الرافع لإيصال حجزه، ولا تمنح
 * الإدارة إدراجاً — لذلك يقع الرفع بمفتاح الخدمة، مع محاولة ثانية بجلسة المدير
 * إن كانت هناك سياسة إدارية مضافة. وبغياب الاثنين يُرفض التسجيل برسالة صريحة
 * بدل تسجيل مصروف ناقص المستند بصمت.
 *
 * لا حساب مالي هنا: المبلغ يُمرَّر كما كُتب، والقيد وتحريك الرصيد داخل الدالة.
 */

const PATH = "/admin/finance/expenses";
const BUCKET = "receipts";
const PREFIX = "expenses";

const MAX_BYTES = 5 * 1024 * 1024;

/** الأنواع المقبولة ← الامتداد المخزَّن (مطابقة لإعداد الدلو في المرحلة ٤) */
const ALLOWED_TYPES: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "application/pdf": "pdf",
};

function returnUrl(formData: FormData, result: string): string {
  const qs = new URLSearchParams();
  for (const key of ["range", "from", "to", "category"]) {
    const value = textField(formData, `return_${key}`);
    if (value) qs.set(key, value);
  }
  for (const [key, value] of new URLSearchParams(result)) qs.set(key, value);
  return `${PATH}?${qs.toString()}`;
}

/** رفع المرفق — مفتاح الخدمة أولاً ثم جلسة المدير؛ null تعني «لا مرفق» */
async function uploadAttachment(
  session: SupabaseClient,
  file: File
): Promise<{ path: string } | { error: string }> {
  if (file.size > MAX_BYTES) return { error: "upload" };
  const extension = ALLOWED_TYPES[file.type];
  if (!extension) return { error: "upload" };

  const path = `${PREFIX}/${crypto.randomUUID()}.${extension}`;
  const service = createServiceSupabase();

  for (const client of [service, session]) {
    if (!client) continue;
    const { error } = await client.storage
      .from(BUCKET)
      .upload(path, file, { contentType: file.type, upsert: false });
    if (!error) return { path };
  }

  return { error: "upload" };
}

/** حذف ملف يتيم بعد فشل القيد — بأفضل جهد، وفشله لا يغيّر رد الشاشة */
async function removeOrphan(session: SupabaseClient, path: string): Promise<void> {
  const service = createServiceSupabase();
  for (const client of [service, session]) {
    if (!client) continue;
    try {
      const { error } = await client.storage.from(BUCKET).remove([path]);
      if (!error) return;
    } catch {
      // الدلو خاص وغير مقروء عاماً — الملف اليتيم مسألة تنظيف لا تسريب
    }
  }
}

export async function recordExpense(formData: FormData) {
  const supabase = await createServerSupabase();
  if (!supabase) redirect(returnUrl(formData, "error=env"));

  const account = uuidField(formData, "account");
  if (!account) redirect(returnUrl(formData, "error=account"));

  // الفئة اختيارية: الفارغ يعني «بلا فئة» صراحةً، والقيمة غير الصالحة خطأ
  const rawCategory = textField(formData, "category");
  const category = rawCategory === null ? null : uuidField(formData, "category");
  if (rawCategory !== null && category === null) redirect(returnUrl(formData, "error=category"));

  const amount = amountField(formData);
  if (typeof amount === "string") redirect(returnUrl(formData, `error=${amount}`));

  const occurredAt = occurredAtField(formData);
  if (occurredAt === "date" || occurredAt === "future") {
    redirect(returnUrl(formData, `error=${occurredAt}`));
  }

  const note = noteField(formData);

  const file = formData.get("attachment");
  let path: string | null = null;
  if (file instanceof File && file.size > 0) {
    const uploaded = await uploadAttachment(supabase, file);
    if ("error" in uploaded) redirect(returnUrl(formData, `error=${uploaded.error}`));
    path = uploaded.path;
  }

  const { error } = await supabase.rpc("record_expense", {
    p_account: account,
    p_category: category,
    p_amount: amount,
    p_at: cairoInstantForDate(occurredAt),
    p_note: note,
    p_path: path,
  });

  if (error) {
    if (path) await removeOrphan(supabase, path);
    redirect(returnUrl(formData, `error=${rpcErrorCode(error)}`));
  }

  revalidatePath("/admin/finance", "layout");
  redirect(returnUrl(formData, "saved=1"));
}
