"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { trackBookingPaid } from "@/lib/analytics/emit";
import type { BookingStatus } from "@/lib/booking-types";
import { startDispatchFor } from "@/lib/dispatch/start";
import { createServiceSupabase } from "@/lib/supabase/admin";
import { createServerSupabase } from "@/lib/supabase/server";

/**
 * إجراءات شاشة تفاصيل الطلب — كلها استدعاءات لدوال Postgres، بلا أي منطق حالة في TypeScript.
 *
 * قواعد ثابتة:
 * - **آلة الحالات محروسة في SQL** (قرار المرحلة ٤): الانتقال غير المسموح يرفع خطأ من
 *   `set_booking_status`، والواجهة تعرض الرسالة فقط ولا تقرر شيئاً.
 * - اتفاقية «إعادة التوجيه بعد العملية»: النجاح والفشل كلاهما redirect برمز في الرابط.
 * - فخ RLS المعروف: الكتابة المباشرة تنجح ظاهرياً بصفر صفوف عند رفض السياسة. هنا كل
 *   الكتابة تمر بدوال `security definer` تتحقق من `is_admin()` بنفسها وترفع استثناءً
 *   عند الرفض، فالفحص المكافئ هو فحص `error` بعد كل rpc.
 * - **رسالة الخطأ تأتي من القاعدة لا من التخمين**: كل `raise exception` في هجرة
 *   المرحلة ٤ تحمل `using hint = '...'`، وPostgREST يمرّره في `error.hint`. نترجم
 *   هذا الرمز إلى رمز في الرابط تعرض له الصفحة جملة دقيقة، بدل رسالة «فشل الحفظ»
 *   العامة التي كانت تتهم الصلاحيات في كل الحالات.
 * - `revalidatePath("/", "layout")` لأن حالة الحجز تظهر أيضاً في صفحة المتابعة العامة
 *   `/booking/[token]` التي يفتحها العميل.
 */

const url = (bookingId: string, qs: string) => `/admin/orders/${bookingId}?${qs}`;

/**
 * ترجمة `hint` القادم من دوال Postgres إلى رمز الخطأ في الرابط.
 * الرموز المعرَّفة في الهجرة: forbidden / invalid-status / payment-not-found /
 * booking-not-found / illegal-transition / invalid-input، ومنذ 0027:
 * receipt-pending (إيصال معلّق يمنع رفع إيصال ثانٍ) و receipt-missing (الملف
 * غير موجود في الدلو رغم نجاح الرفع ظاهرياً).
 *
 * ⚠ كل رمز ترفعه دالة نناديها من هنا **يجب أن يوجد في هذا الجدول**: الرمز
 * المجهول يسقط على `fallback` وهو غالباً `save` — ورسالته تتهم الصلاحيات في
 * خطأ سببه المخزن أو الحالة (نمط الفشل ٢ في handover/LESSONS.md).
 */
const HINT_CODES: Record<string, string> = {
  forbidden: "forbidden",
  "invalid-status": "vstatus",
  "payment-not-found": "noreceipt",
  "booking-not-found": "missing",
  "illegal-transition": "status",
  "invalid-input": "input",
  "receipt-pending": "pending",
  "receipt-missing": "filemissing",
  // 0040: لا طاقم رحلة قبل الإسناد — رفضٌ عن **حالة** لا عن صلاحية
  "not-assigned": "notassigned",
};

/**
 * `overrides` لأن **الرمز الواحد يعني شيئين في دالتين**: `payment-not-found` من
 * `verify_payment` يعني «لا إيصال ينتظر البتّ» (رسالة `noreceipt`)، ومن
 * `set_receipt_visibility` يعني «صف الإيصال نفسه اختفى». رسالة واحدة للاثنين
 * كانت ستُرسل المشغّل يبحث عن إيصال معلّق لا علاقة له بالأمر.
 */
function hintCode(
  error: { hint?: string | null } | null,
  fallback: string,
  overrides?: Record<string, string>
): string {
  const hint = typeof error?.hint === "string" ? error.hint.trim() : "";
  return overrides?.[hint] ?? HINT_CODES[hint] ?? fallback;
}

/** الدالة غير موجودة على هذه القاعدة ⇒ الهجرة التي تعرّفها لم تُنفَّذ بعد */
const isMissingFunction = (code: string | undefined | null): boolean =>
  code === "42883" || code === "PGRST202";

const STATUSES: BookingStatus[] = [
  "pending_payment",
  "under_review",
  "confirmed",
  "assigned",
  "completed",
  "cancelled",
];

/** نص مُشذّب أو null */
function text(formData: FormData, name: string): string | null {
  const v = formData.get(name);
  return typeof v === "string" && v.trim() !== "" ? v.trim() : null;
}

/** حد أعلى عاقل للملاحظة — تُخزَّن في سجل الحالة ويقرأها التشغيل لاحقاً */
const MAX_NOTE = 500;

const trimNote = (note: string | null) => (note ? note.slice(0, MAX_NOTE) : null);

/**
 * اعتماد التحويل أو رفضه — `verify_payment` تنقل الحجز إلى `confirmed` عند الاعتماد
 * أو تعيده إلى `pending_payment` عند الرفض، وتكتب صف الحدث والإشعار في نفس المعاملة.
 * سبب الرفض إلزامي: العميل يراه في صفحة متابعة حجزه فلا يُترك بلا تفسير.
 *
 * الدالة تشترط أن يكون الحجز «قيد المراجعة» وأن يوجد إيصال بحالة `pending`،
 * وترفع `invalid-status` أو `payment-not-found` وإلا — والرسالتان مختلفتان تماماً
 * عن رسالة نقص الصلاحيات (`forbidden`)، فلا تُخلط الثلاثة في «فشل الحفظ».
 */
export async function verifyTransfer(bookingId: string, approve: boolean, formData: FormData) {
  const supabase = await createServerSupabase();
  if (!supabase) redirect(url(bookingId, "error=env"));

  const note = trimNote(text(formData, approve ? "approve_note" : "reject_note"));
  if (!approve && !note) redirect(url(bookingId, "error=note"));

  const { error } = await supabase.rpc("verify_payment", {
    p_booking_id: bookingId,
    p_approve: approve,
    p_note: note,
  });
  if (error) redirect(url(bookingId, `error=${hintCode(error, "save")}`));

  // الحجز صار «مؤكَّداً» ⇒ إطلاق البث تلقائياً (المرحلة ٦). الدالة لا ترمي أبداً
  // ولا تغيّر نتيجة الاعتماد: البوابة `dispatch_settings.autoStart` تقرر التنفيذ،
  // وأي فشل في البث يُسجَّل ويُعالَج من طابور الإسناد اليدوي — ولا يُفشل اعتماد
  // تحويل وصل فعلاً.
  if (approve) {
    await startDispatchFor(bookingId);

    // حدث الشراء (المرحلة ١٠) — **التوأم المنسي** لخطاف الويبهوك: التحويل
    // البنكي المعتمد يدوياً هو المسار الافتراضي في هذه المنصة، وتجاهل هذه
    // النقطة كان سيعني موقعاً يبيع فعلاً وصفراً في تقارير جوجل وميتا.
    // بعد نجاح `verify_payment` وحده (أي بعد أن صار الحجز مؤكداً في القاعدة)،
    // ولا ينتظر شيئاً: الجدولة بـ `after` تعمل حتى مع `redirect()` بعدها.
    trackBookingPaid(bookingId);
  }

  revalidatePath("/", "layout");
  redirect(url(bookingId, "saved=1"));
}

/**
 * تغيير الحالة يدوياً — التحقق هنا شكلي فقط (قيمة ضمن العقد)، والحراسة الحقيقية
 * على الانتقال نفسه داخل `set_booking_status` في قاعدة البيانات.
 */
export async function changeStatus(bookingId: string, formData: FormData) {
  const supabase = await createServerSupabase();
  if (!supabase) redirect(url(bookingId, "error=env"));

  const next = text(formData, "status");
  if (!next || !(STATUSES as string[]).includes(next)) redirect(url(bookingId, "error=status"));

  const { error } = await supabase.rpc("set_booking_status", {
    p_booking_id: bookingId,
    p_status: next,
    p_note: trimNote(text(formData, "status_note")),
  });
  if (error) redirect(url(bookingId, `error=${hintCode(error, "status")}`));

  revalidatePath("/", "layout");
  redirect(url(bookingId, "saved=1"));
}

/**
 * إلغاء الحجز — خطوة تأكيد إجبارية قبلها (رابط ?confirm=cancel يعرض بطاقة التأكيد)،
 * فلا يقع الإلغاء بضغطة واحدة على حجز مدفوع.
 */
export async function cancelBooking(bookingId: string, formData: FormData) {
  const supabase = await createServerSupabase();
  if (!supabase) redirect(url(bookingId, "error=env"));

  const note = trimNote(text(formData, "cancel_note"));
  if (!note) redirect(url(bookingId, "error=note&confirm=cancel"));

  const { error } = await supabase.rpc("set_booking_status", {
    p_booking_id: bookingId,
    p_status: "cancelled",
    p_note: note,
  });
  if (error) redirect(url(bookingId, `error=${hintCode(error, "status")}&confirm=cancel`));

  revalidatePath("/", "layout");
  redirect(url(bookingId, "saved=1"));
}

/* ══════════════════════════════════════════════════════════════════════════
 * رفع الإيصال نيابة عن العميل، وإظهاره أو إخفاؤه (الملاحظة ٢ — هجرة 0027)
 *
 * الواقع التشغيلي: كثير من العملاء يرسل صورة التحويل على واتساب أو يقرأ رقم
 * العملية هاتفياً، فيبقى الحجز «بانتظار الدفع» وقد وصل المال. هذان الإجراءان
 * يغلقان تلك الفجوة: يرفع فريق التشغيل الإيصال بنفسه فينتقل الحجز إلى «قيد
 * المراجعة» ويمر بعدها بنفس مسار الاعتماد المعتاد — لا مسار موازٍ ولا اعتماد
 * تلقائي.
 *
 * وكل القرار في SQL كالعادة: `admin_attach_receipt` هي التي تفحص الدور والحالة
 * ووجود إيصال معلّق وتثبّت المبلغ وتنقل الحالة وتُطفئ الإشعار الوسيط. هنا:
 * تحقق شكلي من الملف، ورفع، واستدعاء، وترجمة رمز الخطأ.
 * ══════════════════════════════════════════════════════════════════════════ */

const BUCKET = "receipts";

/** رفض مبكر يطابق حدّ الدلو نفسه — والدلو هو الحكم النهائي */
const MAX_BYTES = 5 * 1024 * 1024;

/** الأنواع المقبولة ← الامتداد المخزَّن (مطابقة لإعداد الدلو في المرحلة ٤) */
const ALLOWED_TYPES: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "application/pdf": "pdf",
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** الأرقام العربية الهندية مقبولة في الحقول الرقمية وتُحوَّل قبل التحقق */
const toLatinDigits = (s: string) =>
  s.replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 0x0660));

/**
 * قراءة مبلغ من النموذج — **قراءة لا حساب**: لا تقريب ولا سقف ولا نسبة هنا.
 * `admin_attach_receipt` هي التي تقرّب لخانتين وترفض ما ليس موجباً.
 */
function amountOf(formData: FormData, name: string): number | null {
  const v = formData.get(name);
  if (typeof v !== "string" || v.trim() === "") return null;
  const n = Number(toLatinDigits(v.trim()));
  return Number.isFinite(n) ? n : null;
}

/** حذف الملف اليتيم بعد فشل الإرفاق — بأفضل جهد، وفشله لا يغيّر رد الشاشة */
async function removeOrphan(path: string): Promise<void> {
  const service = createServiceSupabase();
  if (!service) return;
  try {
    await service.storage.from(BUCKET).remove([path]);
  } catch {
    // الدلو خاص ولا يُقرأ عاماً — الملف اليتيم مسألة تنظيف لا تسريب
  }
}

/**
 * رفع إيصال نيابة عن العميل.
 *
 * ترتيب العمليات مقصود: **الرفع أولاً ثم الاستدعاء**. لو أُنشئ صف التحصيل أولاً
 * ثم فشل الرفع لبقي إيصال يدّعي صورة لا وجود لها؛ وبالترتيب الحالي أسوأ ما يقع
 * ملف يتيم — ونحذفه فور فشل الاستدعاء.
 *
 * الرفع **بمفتاح الخدمة**: سياسات دلو `receipts` مكتوبة للزائر الرافع لإيصال
 * حجزه (مسار من مقطعين يبدأ بتوكن حجز ما زال بانتظار الدفع)، ولا تمنح الإدارة
 * إدراجاً على المسار الإداري. وبغياب المفتاح نرفض برسالة صريحة بدل تسجيل إيصال
 * بلا صورة.
 *
 * ⚠ **ولذلك حارس الدور هنا لا في القاعدة وحدها:** مفتاح الخدمة يتجاوز سياسات
 * الدلو بحكم تعريفه، و`admin_attach_receipt` تفحص `is_admin()` **بعد** أن يكون
 * الملف قد كُتب فعلاً. فالفحص يسبق الرفع بنفس شكل `runStaleBookingsSweep` في
 * `app/admin/settings/actions.ts`.
 */
export async function uploadAdminReceipt(bookingId: string, formData: FormData) {
  // معرّف الحجز يدخل **مسار التخزين** فيُتحقق من شكله قبل أي كتابة.
  if (!UUID.test(bookingId)) redirect("/admin/orders");

  const supabase = await createServerSupabase();
  if (!supabase) redirect(url(bookingId, "error=env"));

  // حارس صلاحية صريح **قبل أي كتابة في المخزن**: الكتابة تقع بمفتاح الخدمة،
  // فلا تنطبق عليها حراسة القاعدة، وحارس `admin_attach_receipt` يأتي بعدها.
  // حارس `/admin` في `proxy.ts` يغطي هذا الإجراء اليوم — وهذه الطبقة الثانية
  // لا تتكل عليه، وهو ما كان تعليق هذه الدالة يدّعيه قبل أن يكون صحيحاً.
  const { data: isAdmin, error: roleError } = await supabase.rpc("is_admin");
  if (roleError || isAdmin !== true) redirect(url(bookingId, "error=forbidden"));

  const file = formData.get("receipt_file");
  if (!(file instanceof File) || file.size === 0) redirect(url(bookingId, "error=nofile"));

  if (file.size > MAX_BYTES) redirect(url(bookingId, "error=filesize"));

  const extension = ALLOWED_TYPES[file.type];
  if (!extension) redirect(url(bookingId, "error=filetype"));

  // المبلغ إقرار من المشغّل بما وصل فعلاً — لا يُشتق من الحجز ولا يُقرَّب هنا
  const amount = amountOf(formData, "receipt_amount");
  if (amount === null || amount <= 0) redirect(url(bookingId, "error=amount"));

  const note = trimNote(text(formData, "receipt_note"));
  // مربع اختيار غير مؤشَّر لا يُرسل أصلاً — الغياب يعني «داخلي لا يراه العميل»
  const visible = formData.get("receipt_visible") != null;

  const service = createServiceSupabase();
  if (!service) redirect(url(bookingId, "error=nokey"));

  const path = `admin/${bookingId}/${crypto.randomUUID()}.${extension}`;
  const { error: uploadError } = await service.storage
    .from(BUCKET)
    .upload(path, file, { contentType: file.type, upsert: false });

  if (uploadError) redirect(url(bookingId, "error=upload"));

  const { error } = await supabase.rpc("admin_attach_receipt", {
    p_booking_id: bookingId,
    p_amount: amount,
    p_receipt_path: path,
    p_note: note,
    p_visible: visible,
  });

  if (error) {
    // الملف رُفع ولم يُربط بأي تحصيل ⇒ يتيم: يُحذف قبل الخروج لا بعده
    await removeOrphan(path);
    const code = isMissingFunction(error.code) ? "notready" : hintCode(error, "save");
    redirect(url(bookingId, `error=${code}`));
  }

  revalidatePath("/", "layout");
  redirect(url(bookingId, "saved=receipt"));
}

/**
 * إظهار إيصال للعميل أو إخفاؤه عنه.
 *
 * الحجب يقع في **القاعدة** لا في العرض: `get_booking_by_token` تُسقط الصف من
 * حمولة صفحة المتابعة، وحاملُ التوكن يقرأ الحمولة الخام — فإخفاءٌ في JSX ليس
 * إخفاءً. ولا أثر محاسبياً للحجب: الإيصال المخفي المعتمَد يُقيَّد في الدفتر
 * ويستهلك حد حساب الاستقبال كأي إيصال.
 */
export async function setReceiptVisibility(
  bookingId: string,
  paymentId: string,
  visible: boolean
) {
  if (!UUID.test(bookingId)) redirect("/admin/orders");

  const supabase = await createServerSupabase();
  if (!supabase) redirect(url(bookingId, "error=env"));

  if (!UUID.test(paymentId)) redirect(url(bookingId, "error=input"));

  const { error } = await supabase.rpc("set_receipt_visibility", {
    p_payment_id: paymentId,
    p_visible: visible,
  });

  if (error) {
    const code = isMissingFunction(error.code)
      ? "notready"
      : hintCode(error, "save", { "payment-not-found": "norow" });
    redirect(url(bookingId, `error=${code}`));
  }

  revalidatePath("/", "layout");
  redirect(url(bookingId, visible ? "saved=shown" : "saved=hidden"));
}

/* ══════════════════════════════════════════════════════════════════════════
 * تسجيل طاقم الرحلة نيابةً عن المتعهد (الدفعة ٥ — الملاحظة ٥، هجرة 0040)
 *
 * الواقع التشغيلي الذي يبرّر وجود هذا المسار أصلاً: المتعهد يملي المركبة
 * والسائق **هاتفياً** ولا يفتح بورتاله. وبلا هذا الزر تبقى صفحة العميل خالية
 * من الجواب الذي بُنيت الملاحظة كلها لأجله — لا لأن البيانات مجهولة، بل لأن
 * من يعرفها لم يكتبها في نموذج.
 *
 * والمسار **منفصل ومحروس ويترك أثره**، على سابقة `admin_attach_receipt`: دالة
 * `admin_set_trip_crew` تفحص `is_admin()` بنفسها، وتفحص أن المركبة والسائق من
 * سجلّ **المتعهد المُسنَد إليه** لا من سجلّ أي شريك، ثم تسم الصف بـ
 * `crew_by_admin` — فالتجاوز موسومٌ لا التفافٌ صامت على الحارس.
 *
 * ⚠ **ولا شاشة إدارة سائقين هنا ولا تُبنى**: القرار محسوم (‏2026-08-11) أن
 * المنصة لا تدير سائقين، والسجلّ ملك المتعهد. هذا النموذج **يختار من سجلّه هو**
 * ولا يُنشئ فيه صفاً واحداً — والقاعدة ترفض أي معرّف من خارجه بـ`invalid-input`.
 * ══════════════════════════════════════════════════════════════════════════ */

/**
 * تسجيل مركبة الرحلة وسائقها بوسم «إدخال إداري».
 *
 * الحقل الفارغ يعني **مسحاً صريحاً** لا سهواً: خيار «— بلا —» موجود في القائمة
 * لأن اللوحة التي كُتبت خطأً يجب أن تُرفع عن صفحة العميل فوراً، لا أن تبقى
 * لأن الشاشة لا تعرف كيف تفرّغ حقلاً. والقائمتان تُبنيان من قيم الطاقم الحالية
 * فالحفظ بلا تغيير يعيد كتابة القيم نفسها — وهو ما يفسّر تجديد `crew_at` كل
 * مرة: الطابع يقول «متى أُقرّت هذه البيانات آخر مرة» لا «متى تغيّرت».
 *
 * ولا فحص «صفر صفوف» هنا لأن لا كتابة مباشرة: النداء دالة `security definer`
 * ترفع استثناءً عند الرفض، والفحص المكافئ فحصُ `error` — كما في رأس هذا الملف.
 */
export async function setTripCrewByAdmin(bookingId: string, formData: FormData) {
  if (!UUID.test(bookingId)) redirect("/admin/orders");

  const supabase = await createServerSupabase();
  if (!supabase) redirect(url(bookingId, "error=env"));

  const vehicleId = text(formData, "crew_vehicle_id");
  const driverId = text(formData, "crew_driver_id");

  // تحقق شكلي وحده — **والملكية تفحصها القاعدة**: أن تكون المركبة من أسطول
  // المتعهد المُسنَد إليه شرطٌ لا يُفحص في الواجهة لأن الواجهة لا تُحتكم إليها.
  if (vehicleId !== null && !UUID.test(vehicleId)) redirect(url(bookingId, "error=input"));
  if (driverId !== null && !UUID.test(driverId)) redirect(url(bookingId, "error=input"));

  const { error } = await supabase.rpc("admin_set_trip_crew", {
    p_booking_id: bookingId,
    p_vehicle_id: vehicleId,
    p_driver_id: driverId,
  });

  if (error) {
    // `invalid-input` من هذه الدالة معناه واحدٌ بعينه — «ليس من سجلّ المنفّذ» —
    // ورسالةُ «بيانات ناقصة» العامة كانت سترسل المشغّل يراجع حقولاً سليمة.
    const code = isMissingFunction(error.code)
      ? "crewnotready"
      : hintCode(error, "save", { "invalid-input": "crewowner" });
    redirect(url(bookingId, `error=${code}`));
  }

  // صفحة متابعة العميل تعرض الطاقم نفسه — فتُبطَل ذاكرة المسارات كلها كالمعتاد
  revalidatePath("/", "layout");
  redirect(url(bookingId, "saved=crew"));
}
