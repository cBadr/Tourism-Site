"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { DRIVER_DOC_KINDS, type DriverDocKind } from "@/lib/driver-docs-types";
import {
  buildDriverDocPath,
  readDriverDocFile,
  removeDriverDocs,
  uploadDriverDoc,
} from "@/lib/drivers/documents";
import { clamp, text, toLatinDigits } from "../_lib/form";
import { portalSetupAccess } from "../_lib/session";

/**
 * إجراءات سجلّ سائقي المتعهد — جدول `subcontractor_drivers` (‏0040 ثم 0120).
 *
 * نظير `fleet/actions.ts` حرفاً بحرف، وبقواعده الثلاث نفسها:
 * - `portalSetupAccess()` أولاً في **كل** إجراء: الغلاف يحمي شجرة التصيير لا نقاط
 *   الـ POST، وهذه نقاط مستقلة تُنادى مباشرة. وهو الحارس **الموسَّع** لأن السجلّ
 *   ملك الشريك ولا يمسّ تشغيلاً — بينما `set_trip_crew` التي تقرأ منه تبقى على
 *   الحارس الضيّق.
 * - كل استعلام مقيَّد بـ `subcontractor_id` صراحةً رغم أن RLS تعزل أصلاً.
 * - فخ RLS المعروف: الكتابة «تنجح» بصفر صفوف حين ترفضها السياسة، فـ`.select()`
 *   بعد كل كتابة وفحص طول النتيجة.
 *
 * ── 🔒 وما أضافته 0120: الرفع بجلسة الشريك لا بمفتاح الخدمة ───────────────
 *
 * `access.supabase` هو عميل جلسته هو. فسياسة `driver_docs_insert_own_or_admin`
 * ومعها `driver_doc_upload_allowed` (شكلُ المسار + ملكيةُ السائق + سقفُ العدد)
 * هي التي تسمح أو تمنع **داخل القاعدة**. ولو رفعنا بمفتاح الخدمة لصار الحارسُ
 * سطرَ `.eq("subcontractor_id", sub.id)` في هذا الملف — وهو ما لا يشهد عليه
 * اختبار، ولا ينفع إن نُسي في إجراءٍ يُكتب غداً.
 *
 * ── وترتيبُ العمليات مقصود في الاتجاهين ──────────────────────────────────
 *
 * **الرفع**: يُرفع الملف ← يُكتب المسار في الصف ← يُحذف الملف القديم. وإن فشلت
 * كتابة الصف حُذف الجديد فوراً؛ وإن أفلت فهو **يتيمٌ** تلتقطه دورة الكنس بعد
 * يوم — لا يبقى إلى الأبد.
 * **الإزالة اليدوية**: يُمحى المسار من الصف ← ثم يُحذف الملف. لأن الشبكة الآمنة
 * هنا هي كنسُ الأيتام؛ والعكس (حذف الملف أولاً) كان سيترك صفّاً يعرض صورةً
 * مكسورة لو فشلت الكتابة. أما **كنسُ مدّة الحفظ** فترتيبه معكوس بقصد
 * (‏`lib/drivers/retention.ts`) لأن شبكته الآمنة هي القراءة من الدلو نفسه.
 */

const url = (qs: string) => `/portal/drivers?${qs}`;

/**
 * العودة إلى **لوح السائق مفتوحاً** بعد الحفظ أو الرفع.
 *
 * 🔴 وليست زينة: لوحُ السائق يُفتح بالرابط (`?edit=`) كي تُوقَّع روابط صوره
 * لحظة التصيير — عمرُها دقيقة (`DRIVER_DOC_URL_TTL`). فالعودة إلى صفحةٍ بلا
 * `edit` بعد رفع صورةٍ تعني ألّا يرى الشريك ما رفعه للتوّ، وهو نصفُ العطل
 * الذي عولج في `lib/drivers/doc-thumb.tsx` في 2026-08-18.
 */
const panelUrl = (driverId: string, qs: string) =>
  `/portal/drivers?${qs}&edit=${encodeURIComponent(driverId)}#driver-panel`;

/** حدود مطابقة لقيود الجدول في 0040 و0120 */
const MIN_NAME = 2;
const MAX_NAME = 120;
const MIN_PHONE_DIGITS = 8;
const MAX_PHONE = 32;
const MAX_LICENSE = 40;
const MIN_LICENSE = 3;

/** رقم هاتف معقول بعد تحويل الأرقام العربية — نفس نمط `profile/actions.ts` */
const PHONE_PATTERN = /^\+?[\d\s()-]{7,20}$/;

/** تاريخ ISO من حقل `type="date"` — والقيد في القاعدة يحصره بين ١٩٧٠ و٢١٠٠ */
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

type DriverFields = {
  name: string;
  phone: string;
  license_no: string | null;
  license_expiry: string | null;
  active: boolean;
};

/** قراءة الحقول والتحقق منها — تُعيد رمز خطأ نصياً بدل الرمي (اتفاقية الأسطول) */
function readDriver(formData: FormData, prefix = ""): DriverFields | string {
  const p = (name: string) => `${prefix}${name}`;

  const name = clamp(text(formData, p("name")), MAX_NAME);
  if (!name || name.length < MIN_NAME) return "name";

  const rawPhone = text(formData, p("phone"));
  const phone = rawPhone ? clamp(toLatinDigits(rawPhone), MAX_PHONE) : null;
  if (!phone || !PHONE_PATTERN.test(phone)) return "phone";
  // القيد في القاعدة يعدّ **الأرقام** لا الطول: «(٠٢) - -» يمرّ بالنمط ويسقط هناك
  if (phone.replace(/\D/g, "").length < MIN_PHONE_DIGITS) return "phone";

  const licenseNo = clamp(text(formData, p("license_no")), MAX_LICENSE);
  // القيد `subcontractor_drivers_license_no_chk` يرفض أقصر من ثلاثة — والرسالة
  // العربية أولى من خطأ Postgres خام
  if (licenseNo !== null && licenseNo.length < MIN_LICENSE) return "license";

  const rawExpiry = text(formData, p("license_expiry"));
  if (rawExpiry !== null && !DATE_PATTERN.test(rawExpiry)) return "expiry";

  return {
    name,
    phone,
    license_no: licenseNo,
    license_expiry: rawExpiry,
    active: formData.get(p("active")) != null,
  };
}

export async function createDriver(formData: FormData) {
  const access = await portalSetupAccess();
  if (!access.ok) redirect(url(`error=${access.code}`));
  const { supabase, sub } = access;

  const fields = readDriver(formData, "new.");
  if (typeof fields === "string") redirect(url(`error=${fields}`));

  const res = await supabase
    .from("subcontractor_drivers")
    .insert({ ...fields, subcontractor_id: sub.id })
    .select("id");

  if (res.error || !res.data || res.data.length === 0) redirect(url("error=save"));

  revalidatePath("/", "layout");
  redirect(url("saved=1"));
}

export async function saveDriver(driverId: string, formData: FormData) {
  const access = await portalSetupAccess();
  if (!access.ok) redirect(url(`error=${access.code}`));
  const { supabase, sub } = access;

  const fields = readDriver(formData);
  if (typeof fields === "string") redirect(url(`error=${fields}`));

  const res = await supabase
    .from("subcontractor_drivers")
    .update(fields)
    .eq("id", driverId)
    .eq("subcontractor_id", sub.id)
    .select("id");

  if (res.error) redirect(url("error=save"));
  if (!res.data || res.data.length === 0) redirect(url("error=notfound"));

  revalidatePath("/", "layout");
  redirect(panelUrl(driverId, "saved=1"));
}

/** عمود المسار لكل صنف — الخريطة مكتوبة مرة واحدة فلا تنحرف نسختان */
const PATH_COLUMN: Record<DriverDocKind, string> = {
  photo: "photo_path",
  license: "license_photo_path",
};

const isKind = (value: unknown): value is DriverDocKind =>
  typeof value === "string" && (DRIVER_DOC_KINDS as readonly string[]).includes(value);

/**
 * رفع صورة السائق أو صورة رخصته.
 *
 * 🔒 والصنف يأتي من النموذج فيُفحص بقائمة مغلقة قبل أن يصير اسم عمود — نصٌّ من
 * المتصفح لا يُبنى منه استعلامٌ بلا تحقّق.
 */
export async function uploadDriverDocument(driverId: string, formData: FormData) {
  const access = await portalSetupAccess();
  if (!access.ok) redirect(url(`error=${access.code}`));
  const { supabase, sub } = access;

  const kind = formData.get("kind");
  if (!isKind(kind)) redirect(url("error=doc_type"));

  const read = readDriverDocFile(formData.get("file"));
  if (!read.ok) redirect(url(`error=${read.error}`));

  const column = PATH_COLUMN[kind];

  // المسار القديم يُقرأ **قبل** الرفع كي يُحذف بعد نجاح الكتابة لا قبلها
  const current = await supabase
    .from("subcontractor_drivers")
    .select("id, photo_path, license_photo_path")
    .eq("id", driverId)
    .eq("subcontractor_id", sub.id)
    .maybeSingle();

  if (current.error) redirect(url("error=save"));
  if (!current.data) redirect(url("error=notfound"));

  const previous = (current.data as unknown as Record<string, unknown>)[column];
  const oldPath = typeof previous === "string" && previous.trim() !== "" ? previous : null;

  const path = buildDriverDocPath(sub.id, driverId, kind, read.ext);
  const uploaded = await uploadDriverDoc(supabase, path, read.file);
  if (!uploaded) redirect(url("error=upload"));

  const res = await supabase
    .from("subcontractor_drivers")
    .update({ [column]: path })
    .eq("id", driverId)
    .eq("subcontractor_id", sub.id)
    .select("id");

  if (res.error || !res.data || res.data.length === 0) {
    // الصف لم يُكتب ⇒ الملف المرفوع لا يشير إليه شيء: يُحذف فوراً، وإن أفلت
    // فدورة الكنس تلتقطه بعد يوم (لا يبقى إلى الأبد)
    await removeDriverDocs(supabase, [path]);
    redirect(url("error=save"));
  }

  if (oldPath && oldPath !== path) await removeDriverDocs(supabase, [oldPath]);

  revalidatePath("/", "layout");
  redirect(panelUrl(driverId, "saved=1"));
}

/** حذف صورة قبل انقضاء مدتها — حقُّ الشريك في بيانات سائقه، ويبقى النصّ كما هو */
export async function removeDriverDocument(driverId: string, formData: FormData) {
  const access = await portalSetupAccess();
  if (!access.ok) redirect(url(`error=${access.code}`));
  const { supabase, sub } = access;

  const kind = formData.get("kind");
  if (!isKind(kind)) redirect(url("error=doc_type"));

  const column = PATH_COLUMN[kind];

  // المسار يُقرأ **قبل** التصفير — فبعدها لا سبيل إلى معرفة أي ملفٍّ يُحذف،
  // ويبقى الملف في الدلو يوماً كاملاً حتى يلتقطه كنس الأيتام. والشريك الذي
  // ضغط «إزالة» يستحق أن تذهب الصورة الآن لا غداً.
  const current = await supabase
    .from("subcontractor_drivers")
    .select("id, photo_path, license_photo_path")
    .eq("id", driverId)
    .eq("subcontractor_id", sub.id)
    .maybeSingle();

  if (current.error) redirect(url("error=save"));
  if (!current.data) redirect(url("error=notfound"));

  const previous = (current.data as unknown as Record<string, unknown>)[column];
  const oldPath = typeof previous === "string" && previous.trim() !== "" ? previous : null;

  const res = await supabase
    .from("subcontractor_drivers")
    .update({ [column]: null })
    .eq("id", driverId)
    .eq("subcontractor_id", sub.id)
    .select("id");

  if (res.error) redirect(url("error=save"));
  if (!res.data || res.data.length === 0) redirect(url("error=notfound"));

  // الصف أولاً ثم الملف: فشلُ الحذف يترك يتيماً تلتقطه الدورة، ولا يترك صفّاً
  // يشير إلى ملفٍّ ذهب. (وكنسُ مدّة الحفظ معكوسٌ بقصد — انظر ترويسة الملف.)
  if (oldPath) await removeDriverDocs(supabase, [oldPath]);

  revalidatePath("/", "layout");
  redirect(panelUrl(driverId, "saved=1"));
}

/**
 * تفعيل/إيقاف سائق — الإيقاف يبقيه بكل بياناته ويخرجه من قائمة الإسناد.
 *
 * ولماذا الإيقاف أصلاً وليس الحذف؟ لأن `dispatches.assigned_driver_id` مرجعٌ
 * بـ`on delete set null`: حذفُ سائقٍ نفّذ رحلات يمحو اسمه من صفحات عملائها بأثر
 * رجعي، بينما الإيقاف يوقف الإسناد الجديد ولا يمسّ ما مضى.
 */
export async function toggleDriver(driverId: string) {
  const access = await portalSetupAccess();
  if (!access.ok) redirect(url(`error=${access.code}`));
  const { supabase, sub } = access;

  const current = await supabase
    .from("subcontractor_drivers")
    .select("active")
    .eq("id", driverId)
    .eq("subcontractor_id", sub.id)
    .maybeSingle();

  if (current.error) redirect(url("error=save"));
  if (!current.data) redirect(url("error=notfound"));

  const res = await supabase
    .from("subcontractor_drivers")
    .update({ active: current.data.active !== true })
    .eq("id", driverId)
    .eq("subcontractor_id", sub.id)
    .select("id");

  if (res.error || !res.data || res.data.length === 0) redirect(url("error=save"));

  revalidatePath("/", "layout");
  redirect(panelUrl(driverId, "saved=1"));
}

export async function deleteDriver(driverId: string) {
  const access = await portalSetupAccess();
  if (!access.ok) redirect(url(`error=${access.code}`));
  const { supabase, sub } = access;

  // المساران يُقرآن قبل الحذف كي تُحذف الملفات معه؛ وما يفلت منهما يصير يتيماً
  // تلتقطه دورة الكنس — فلا تبقى صورة سائقٍ حُذف صفُّه في الدلو.
  const current = await supabase
    .from("subcontractor_drivers")
    .select("photo_path, license_photo_path")
    .eq("id", driverId)
    .eq("subcontractor_id", sub.id)
    .maybeSingle();

  const paths = current.data
    ? [current.data.photo_path, current.data.license_photo_path].filter(
        (p): p is string => typeof p === "string" && p.trim() !== ""
      )
    : [];

  const res = await supabase
    .from("subcontractor_drivers")
    .delete()
    .eq("id", driverId)
    .eq("subcontractor_id", sub.id)
    .select("id");

  if (res.error) redirect(url("error=save"));
  if (!res.data || res.data.length === 0) redirect(url("error=notfound"));

  if (paths.length > 0) await removeDriverDocs(supabase, paths);

  revalidatePath("/", "layout");
  redirect(url("deleted=1"));
}
