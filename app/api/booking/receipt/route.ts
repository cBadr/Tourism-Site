import type { SupabaseClient } from "@supabase/supabase-js";
import { createServerSupabase } from "@/lib/supabase/server";

/**
 * POST /api/booking/receipt — رفع إيصال التحويل ونقل الحجز إلى «قيد المراجعة».
 *
 * الجسم multipart/form-data: token (توكن الحجز العام) + file (صورة أو PDF).
 *
 * **المبلغ لا يأتي من العميل.** كان النموذج يرسل `amount` وكان المسار يمرّره إلى
 * التوقيع الأربعي، فيصبح «كم حوّلت» إقراراً من المتصفح تُبنى عليه حدود الحسابات
 * ومطابقة المحاسبة. الآن نستدعي الغلاف الثنائي `attach_receipt(p_token, p_path)`
 * وحده، والدالة تثبّت المبلغ من `bookings.amount_due` بنفسها. أي حقل `amount` أو
 * `accountId` يصل مع النموذج يُتجاهَل تماماً — لا يُقرأ أصلاً.
 *
 * الخصوصية: دلو `receipts` **خاص** — سياسة التخزين تسمح بالإدراج (والحذف) للزائر
 * على مسار حجزٍ ما زال بانتظار الدفع فقط، والقراءة محصورة بالإدارة عبر روابط
 * موقّعة قصيرة العمر. لذلك نرفع هنا بمفتاح anon (لا service_role): الصلاحية التي
 * يملكها الزائر هي بالضبط ما يحتاجه.
 *
 * ترتيب العمليات مقصود: نفحص حالة الحجز **قبل** الرفع (get_booking_by_token)،
 * لأن الحالة الشائعة للفشل هي الرفع المكرر على حجز غادر «بانتظار الدفع» — وفحصٌ
 * واحد يوفّر كتابة ملف يتيم لا يقرأه أحد. وإن فشل الإرفاق بعد نجاح الرفع نحذف
 * الملف بأفضل جهد (سياسة الحذف للزائر تجعل ذلك ممكناً) فلا يتراكم في الدلو.
 *
 * حدود الملف (النوع والحجم) يفرضها الدلو نفسه — `file_size_limit` و
 * `allowed_mime_types` — والفحص هنا مجرد رفض مبكر يوفّر رحلة شبكة كاملة.
 *
 * المسار `${token}/${uuid}.${ext}` مقطعان بالضبط: التوكن أولاً ثم اسم الملف،
 * كما تشترط سياسة الدلو، والامتداد يُشتق من نوع المحتوى لا من اسم الملف
 * (اسم الملف نص من العميل لا يُوثق به).
 */

export const runtime = "nodejs";

const NO_STORE = { "Cache-Control": "no-store" };

const MAX_BYTES = 5 * 1024 * 1024;

/** أنواع الإيصال المقبولة ← الامتداد المخزَّن (مطابقة لإعداد الدلو) */
const ALLOWED_TYPES: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "application/pdf": "pdf",
};

/** التوكن العام: ٤٨ محرفاً ست عشرياً؛ الدوال ترفض أقصر من ٣٢ فنرفضه هنا مبكراً */
const TOKEN_PATTERN = /^[A-Za-z0-9_-]{32,128}$/;

const BUCKET = "receipts";

type ReceiptError = { ok: false; code: string; message: string };

function errorJson(code: string, message: string, status: number): Response {
  const body: ReceiptError = { ok: false, code, message };
  return Response.json(body, { status, headers: NO_STORE });
}

type DbError = { code?: string; message?: string; hint?: string };

/**
 * فحص مسبق لحالة الحجز عبر `get_booking_by_token` — المنفذ الوحيد للضيف.
 * غرضه توفير رفع ملف يتيم في الحالة الشائعة (حجز غادر «بانتظار الدفع»)، لا
 * الحراسة: الحراسة الحقيقية داخل `attach_receipt` وسياسة الدلو. لذلك أي فشل
 * غير حاسم (الدالة غائبة، شبكة) يعود "unknown" ونكمل — الفحص تحسين لا شرط.
 */
type BookingProbe = "pending" | "not-found" | "wrong-status" | "unknown";

async function probeBooking(supabase: SupabaseClient, token: string): Promise<BookingProbe> {
  try {
    const { data, error } = await supabase.rpc("get_booking_by_token", { p_token: token });
    if (error) return "unknown";

    // دالة تُرجع جدولاً ⇒ مصفوفة صفوف؛ الحارس يحمي من تغيّر الشكل مستقبلاً
    const row = (Array.isArray(data) ? data[0] : data) as { status?: unknown } | null | undefined;
    if (!row) return "not-found";
    return row.status === "pending_payment" ? "pending" : "wrong-status";
  } catch {
    return "unknown";
  }
}

/** حذف الملف اليتيم بعد فشل الإرفاق — بأفضل جهد: فشله لا يغيّر رد العميل */
async function removeOrphan(supabase: SupabaseClient, path: string): Promise<void> {
  try {
    await supabase.storage.from(BUCKET).remove([path]);
  } catch {
    // الدلو خاص وغير قابل للقراءة عاماً؛ ملف يتيم هنا مشكلة تنظيف لا تسريب
  }
}

/**
 * ترجمة خطأ الإرفاق — دالة SQL ترفع الأخطاء بـ `using hint = '<رمز>'` (هجرة 0007).
 * أهم حالة: `invalid-status` أي أن الحجز غادر «بانتظار الدفع» (رفع مكرر غالباً)،
 * وهي ليست فشلاً يقلق العميل بل حالة يجب شرحها له بوضوح.
 */
function mapAttachError(error: DbError): { code: string; message: string; status: number } {
  const hint = (error.hint ?? "").trim();

  if (hint === "booking-not-found") {
    return {
      code: "not-found",
      message: "لم نعثر على هذا الحجز. تأكد من فتح الصفحة من رابط المتابعة المحفوظ.",
      status: 404,
    };
  }
  if (hint === "invalid-status") {
    return {
      code: "invalid-status",
      message: "لا حاجة لرفع إيصال آخر — حجزك لم يعد بانتظار الدفع. حدّث الصفحة لمتابعة حالته.",
      status: 409,
    };
  }
  if (hint === "account-unavailable") {
    return {
      code: "account-unavailable",
      message: "حساب التحويل المختار لم يعد متاحاً. حدّث الصفحة واختر حساباً من المعروضة.",
      status: 409,
    };
  }
  if (hint === "invalid-input") {
    return { code: "invalid-input", message: "بيانات الإيصال غير مكتملة. أعد المحاولة.", status: 400 };
  }
  if (error.code === "PGRST202" || error.code === "42883" || error.code === "42501") {
    return {
      code: "db-unavailable",
      message: "خدمة مراجعة الإيصالات غير مهيأة بعد. تواصل معنا لتأكيد التحويل.",
      status: 503,
    };
  }

  return {
    code: "attach-failed",
    message: "تعذّر تسجيل إيصالك الآن. أعد المحاولة، وإن تكرر الأمر تواصل معنا.",
    status: 500,
  };
}

export async function POST(request: Request) {
  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return errorJson("invalid-input", "تعذّرت قراءة بيانات النموذج. أعد المحاولة.", 400);
  }

  const token = String(form.get("token") ?? "").trim();
  if (!TOKEN_PATTERN.test(token)) {
    return errorJson("invalid-input", "رابط الحجز غير صالح. افتح صفحة حجزك من الرابط المحفوظ.", 400);
  }

  const file = form.get("file");
  if (!(file instanceof File) || file.size === 0) {
    return errorJson("invalid-input", "أرفق صورة إيصال التحويل أو ملف PDF.", 400);
  }

  // رفض مبكر يوفّر رفع ٥ ميجابايت ليرفضها الدلو — الدلو هو الحكم النهائي
  if (file.size > MAX_BYTES) {
    return errorJson("file-too-large", "حجم الملف أكبر من ٥ ميجابايت. أرسل صورة أصغر.", 413);
  }

  const extension = ALLOWED_TYPES[file.type];
  if (!extension) {
    return errorJson(
      "invalid-file-type",
      "نوع الملف غير مدعوم — أرفق صورة (JPG أو PNG أو WebP) أو ملف PDF.",
      415
    );
  }

  const supabase = await createServerSupabase();
  if (!supabase) {
    return errorJson(
      "db-unavailable",
      "خدمة رفع الإيصالات غير مهيأة بعد. تواصل معنا لإرسال الإيصال.",
      503
    );
  }

  // (١) فحص الحالة قبل الرفع — لا نكتب ملفاً لحجز لا يقبل إيصالاً أصلاً
  const probe = await probeBooking(supabase, token);
  if (probe === "not-found") {
    return errorJson(
      "not-found",
      "لم نعثر على هذا الحجز. تأكد من فتح الصفحة من رابط المتابعة المحفوظ.",
      404
    );
  }
  if (probe === "wrong-status") {
    return errorJson(
      "invalid-status",
      "لا حاجة لرفع إيصال آخر — حجزك لم يعد بانتظار الدفع. حدّث الصفحة لمتابعة حالته.",
      409
    );
  }

  // (٢) الرفع — سياسة الدلو تعيد فحص التوكن والحالة والامتداد وعدد الملفات
  const path = `${token}/${crypto.randomUUID()}.${extension}`;
  const { error: uploadError } = await supabase.storage.from(BUCKET).upload(path, file, {
    contentType: file.type,
    upsert: false,
  });

  if (uploadError) {
    // سياسة الدلو تقبل الرفع فقط باسم يحوي توكن حجز ما زال بانتظار الدفع،
    // فرفض الصلاحية هنا يعني غالباً أن الحجز غادر تلك الحالة بين الفحص والرفع،
    // أو أن ملفات هذا الحجز بلغت الحد — نقولها بدل رسالة «مشكلة اتصال» المضلِّلة.
    const text = `${uploadError.message ?? ""}`.toLowerCase();
    const denied =
      text.includes("row-level security") ||
      text.includes("unauthorized") ||
      text.includes("violates") ||
      text.includes("policy");

    if (denied) {
      return errorJson(
        "upload-denied",
        "تعذّر قبول الإيصال — تأكد أن حجزك ما زال بانتظار الدفع، ثم حدّث الصفحة وأعد المحاولة.",
        403
      );
    }

    // الدلو يرفض النوع والحجم بنفسه؛ نميّز رسالتيه حتى لا تبدو خطأ شبكة
    if (text.includes("exceeded the maximum allowed size") || text.includes("payload too large")) {
      return errorJson("file-too-large", "حجم الملف أكبر من ٥ ميجابايت. أرسل صورة أصغر.", 413);
    }
    if (text.includes("mime type") || text.includes("content type")) {
      return errorJson(
        "invalid-file-type",
        "نوع الملف غير مدعوم — أرفق صورة (JPG أو PNG أو WebP) أو ملف PDF.",
        415
      );
    }

    return errorJson(
      "upload-failed",
      "تعذّر رفع الإيصال الآن. تأكد من اتصالك وحاول مرة أخرى.",
      502
    );
  }

  // (٣) الإرفاق — المبلغ من الحجز داخل الدالة، ولا وسائط سوى التوكن والمسار
  const { error: attachError } = await supabase.rpc("attach_receipt", {
    p_token: token,
    p_path: path,
  });

  if (attachError) {
    // الملف رُفع ولم يُربط بأي دفعة ⇒ يتيم: نحذفه فوراً بأفضل جهد
    await removeOrphan(supabase, path);
    const mapped = mapAttachError(attachError);
    return errorJson(mapped.code, mapped.message, mapped.status);
  }

  return Response.json({ ok: true as const }, { headers: NO_STORE });
}
