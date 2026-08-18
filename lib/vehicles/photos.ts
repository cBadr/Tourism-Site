import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import {
  buildDriverDocPath,
  isDriverDocPath,
  readDriverDocFile,
  type DriverDocError,
} from "@/lib/drivers/documents";
import {
  FLEET_PHOTOS_MAX_ROWS,
  VEHICLE_PHOTOS_BUCKET,
  VEHICLE_PHOTO_URL_TTL,
  type FleetClassRow,
  type VehiclePhotoState,
  type VehiclePhotoView,
} from "./types";

/**
 * طبقة تخزين صور المركبات — العقد الملزم `lib/vehicles/types.ts`.
 *
 * ── 🔒 القاعدة التي تحكم هذا الملف كلّه: لا مفتاح خدمة في مسار قراءةٍ ولا كتابة
 *
 * كل دالة هنا تأخذ **عميل جلسة المنادي** (`createServerSupabase()`)، لا
 * `createServiceSupabase()`. مفتاح الخدمة **يتجاوز RLS**، فلو وُقِّع به رابطٌ
 * لصار الحارسُ الحقيقي سطرَ `if` في TypeScript — و«اختبارٌ» يمرّ عليه لا يشهد
 * على شيء. أما بجلسة المنادي فالسياسة `vehicle_photos_select_own_or_admin` هي
 * التي تقرّر، ويمكن إثباتها بجلسة شريكٍ ثانٍ حقيقية (وهو ما يفعله
 * `supabase/tests/vehicle_photos_tests.sql`). نفس قرار `lib/drivers/documents.ts`.
 *
 * ── وما يُفوَّض إلى `lib/drivers/documents.ts` ولا يُستنسخ (القاعدة ١٢) ────
 *
 * شكلُ المفتاح **واحد** في المنظومتين: `<owner>/<row>/<kind>-<hex>.<ext>`.
 * فبناؤه وفحصُه وفحصُ الملف قبل الرفع كلُّها تُنادى من هناك، **ويُضاف فوقها
 * تضييقان يخصّان المركبة** — الصنفُ `photo` وحده، ولا PDF — تماماً كما فعلت
 * `vehicle_photo_path_ok` فوق `driver_doc_path_ok` في القاعدة. فالتضييق في
 * الطرفين مكتوبٌ بنفس الشكل، ولا صيغةَ نمطيةٌ ثانيةٌ تنحرف.
 *
 * ── والتوقيع وحده مكتوبٌ هنا، ولسببٍ واحد ────────────────────────────────
 *
 * `signDriverDocsDetailed` تحمل اسم دلوها ثابتاً في جسمها، وملفُّها خارج هذه
 * الجبهة فلا يُعدَّل. فنُقل **الدرسان المدفوعان** فيها لا شكلُها:
 *   (١) الردّ ٢٠٠ حتى حين يُرفض مفتاح — الرفض يأتي **داخل الصف**
 *       (`signedUrl === null`) لا في `error`. والاعتماد على `error` وحده يجعل
 *       الرفض يبدو نجاحاً بخريطةٍ ناقصة.
 *   (٢) لكل مسارٍ **حصيلة** لا `undefined` صامت — فلا يبتلع المستهلك سبباً.
 */

/** رموز الأخطاء — تُترجَم إلى عربية في الشاشة، ولا تُرمى استثناءات */
export type VehiclePhotoError = DriverDocError;

/**
 * شكلُ مفتاح صورة المركبة = شكلُ مستند السائق **مضيَّقاً**.
 *
 * والتضييقان نظيرا ما في `vehicle_photo_path_ok` بالقاعدة حرفاً بحرف:
 * الصنفُ `photo` وحده (لا `license`)، ولا امتداد `pdf`.
 */
const VEHICLE_PHOTO_TAIL = /\/photo-[0-9a-f]{16,64}\.(jpg|jpeg|png|webp)$/;

export const isVehiclePhotoPath = (value: string | null | undefined): value is string =>
  isDriverDocPath(value) && VEHICLE_PHOTO_TAIL.test(value);

/**
 * بناء مفتاح الكائن: `<sub>/<vehicle>/photo-<hex32>.<ext>`.
 *
 * والعشوائيةُ مقصودة (وهي ميراثُ `buildDriverDocPath`): اسمٌ ثابت يعني أن
 * الاستبدال يكتب فوق القديم فيبقى الرابط الموقَّع القديم صالحاً على محتوى
 * جديد، ويعني كذلك أن من عرف المعرِّفين عرف المسار.
 */
export function buildVehiclePhotoPath(
  subcontractorId: string,
  vehicleId: string,
  ext: string
): string {
  return buildDriverDocPath(subcontractorId, vehicleId, "photo", ext);
}

/**
 * فحص الملف قبل الرفع — رفضٌ مبكر يوفّر رحلة شبكة، **لا حراسة**. الحدود
 * الحقيقية على الدلو نفسه (`file_size_limit` و`allowed_mime_types`)، فمن يرفع
 * إلى Storage API مباشرةً يتجاوز هذا كلياً.
 *
 * ⚠ والتضييق عن مستندات السائق: **لا PDF**. الدلو يرفضه أصلاً في
 * `allowed_mime_types`، وهذا يقول للمستخدم لماذا بدل أن يردّ التخزينُ رفضاً خاماً.
 */
export function readVehiclePhotoFile(value: FormDataEntryValue | null):
  | { ok: true; file: File; ext: string }
  | { ok: false; error: VehiclePhotoError } {
  const read = readDriverDocFile(value);
  if (!read.ok) return read;
  if (read.ext === "pdf") return { ok: false, error: "doc_type" };
  return read;
}

/** رفع ملف بجلسة المنادي — السياسة و`vehicle_photo_upload_allowed` هما الحارس */
export async function uploadVehiclePhoto(
  supabase: SupabaseClient,
  path: string,
  file: File
): Promise<boolean> {
  const res = await supabase.storage
    .from(VEHICLE_PHOTOS_BUCKET)
    .upload(path, file, { contentType: file.type, upsert: false });
  return !res.error;
}

/** حذفٌ بأفضل جهد — فشلُه لا يوقف شيئاً، ويلتقطه الكنسُ في الرفعة التالية */
export async function removeVehiclePhotos(
  supabase: SupabaseClient,
  paths: string[]
): Promise<number> {
  const valid = paths.filter(isVehiclePhotoPath);
  if (valid.length === 0) return 0;
  try {
    const res = await supabase.storage.from(VEHICLE_PHOTOS_BUCKET).remove(valid);
    if (res.error) return 0;
    return res.data?.length ?? valid.length;
  } catch {
    return 0;
  }
}

/**
 * 🔴 كنسُ مجلّد المركبة — **وهذا هو بديلُ العامل المجدول، لا نسيانُه**.
 *
 * اتفاقية `0113` تَعِد بمهلة الخمس سنوات لصور **السائقين والرخص** وحدها ولا
 * تَعِد بشيءٍ عن صورة المركبة، فلا مهلةَ حفظٍ هنا ولا دالةَ كنسٍ في القاعدة —
 * **ودالةٌ بلا منادٍ ليست مبنيّة** (القاعدة الذهبية ١٧).
 *
 * فما الذي يمنع تراكم الأيتام إذن؟ **هذه**: بعد كل رفعٍ ناجح، وعند كل إزالةٍ
 * أو حذفِ مركبة، يُقرأ مجلّد المركبة كاملاً ويُحذف منه **كلُّ ما عدا الملف
 * المُبقى**. فالمجلّد يعود إلى ملفٍّ واحد (أو صفر) في كل دورة عمل، ورفعٌ انقطع
 * قبل كتابة الصف يُكنس في الرفعة التالية بلا جدولةٍ تُنسى.
 *
 * ⚠ وحدُّها المُعلَن: مركبةٌ رُفع لها ملفٌّ ثم انقطع الاتصال **ولم يُرفع لها
 *   شيءٌ بعده أبداً** تُبقي ملفاً يتيماً واحداً. وسقفُ الستة في
 *   `vehicle_photo_upload_allowed` هو ما يمنع تحوّل ذلك إلى تراكم.
 */
export async function sweepVehicleFolder(
  supabase: SupabaseClient,
  subcontractorId: string,
  vehicleId: string,
  keepPath: string | null
): Promise<number> {
  const folder = `${subcontractorId}/${vehicleId}`;
  try {
    const listed = await supabase.storage
      .from(VEHICLE_PHOTOS_BUCKET)
      .list(folder, { limit: 100 });
    if (listed.error || !listed.data) return 0;

    const stale = listed.data
      .map((entry) => `${folder}/${entry.name}`)
      .filter((path) => path !== keepPath && isVehiclePhotoPath(path));

    if (stale.length === 0) return 0;
    return await removeVehiclePhotos(supabase, stale);
  } catch {
    return 0;
  }
}

/**
 * روابط موقَّتة لعدة مسارات في نداءٍ واحد — تُولَّد لحظة التصيير وتموت بعد
 * دقيقة، **ولا تُخزَّن ولا تُمرَّر في رابط صفحة**. والمسار الخام لا يخرج إلى
 * المتصفح أبداً: ما يصل الشاشة هو الرابط الموقَّع وحده.
 */
export async function signVehiclePhotos(
  supabase: SupabaseClient,
  paths: (string | null)[]
): Promise<Map<string, VehiclePhotoState>> {
  const out = new Map<string, VehiclePhotoState>();

  const asked = [...new Set(paths.filter((p): p is string => typeof p === "string" && p !== ""))];
  const valid = asked.filter(isVehiclePhotoPath);
  for (const p of asked) {
    if (!valid.includes(p)) out.set(p, { kind: "bad_path" });
  }
  if (valid.length === 0) return out;

  try {
    const { data, error } = await supabase.storage
      .from(VEHICLE_PHOTOS_BUCKET)
      .createSignedUrls(valid, VEHICLE_PHOTO_URL_TTL);

    if (error || !data) {
      for (const p of valid) out.set(p, { kind: "unreachable" });
      return out;
    }

    // 🔴 الردّ ٢٠٠ حتى حين يُرفض مفتاح: الرفض يأتي **داخل الصف**
    // (`signedUrl === null`) لا في `error`. فالاعتماد على `error` وحده كان
    // يجعل الرفض يبدو نجاحاً بخريطةٍ ناقصة (درسٌ مدفوع في مستندات السائقين).
    for (const row of data) {
      if (row.path && row.signedUrl) out.set(row.path, { kind: "url", url: row.signedUrl });
    }
    for (const p of valid) {
      if (!out.has(p)) out.set(p, { kind: "unavailable" });
    }
  } catch {
    for (const p of valid) if (!out.has(p)) out.set(p, { kind: "unreachable" });
  }
  return out;
}

const asText = (v: unknown): string | null =>
  typeof v === "string" && v.trim() !== "" ? v.trim() : null;

const asInt = (v: unknown): number | null =>
  typeof v === "number" && Number.isFinite(v) ? Math.trunc(v) : null;

/**
 * تفصيلُ الأسطول لكل فئة — **مصدرٌ واحد**: دالة Postgres، لا عدٌّ في TypeScript.
 *
 * 🔒 ولو عُدّت الفئات هنا من صفوف المركبات لَما ظهرت الفئة التي **لا مركبة له
 * فيها** أصلاً — وهي بالضبط ما طلب المالك أن يراه. والصفرُ لا يُشتق من غياب،
 * بل يُقرأ من كتالوج الفئات.
 */
export async function loadFleetBreakdown(
  supabase: SupabaseClient,
  subcontractorId: string
): Promise<{ ready: boolean; rows: FleetClassRow[] }> {
  const res = await supabase.rpc("subcontractor_fleet_breakdown", {
    p_subcontractor_id: subcontractorId,
  });

  // 0136 غير مطبَّقة ⇒ لا شبكة، ولا شاشة خطأ تُقلق بلا داعٍ
  if (res.error || !Array.isArray(res.data)) return { ready: false, rows: [] };

  const rows = (res.data as Record<string, unknown>[]).map((r) => ({
    classSlug: String(r.class_slug ?? ""),
    title: asText(r.title) ?? String(r.class_slug ?? ""),
    capacity: asInt(r.capacity),
    classActive: r.class_active === true,
    total: asInt(r.vehicles_total) ?? 0,
    active: asInt(r.vehicles_active) ?? 0,
    withPhoto: asInt(r.vehicles_with_photo) ?? 0,
    seatsMin: asInt(r.seats_min),
    seatsMax: asInt(r.seats_max),
    seatsMismatch: asInt(r.seats_mismatch) ?? 0,
  }));

  return { ready: true, rows };
}

/**
 * صفوفُ المركبات بصورها الموقَّعة — لجلسة المنادي، فما لا تشمله سياستُه لا
 * يُوقَّع له.
 *
 * ويُرجع `truncated` صريحاً: الاقتطاع الصامت عند سقفٍ ضمنيّ هو ما يجعل الشبكة
 * تعرض أقلَّ ممّا يقوله العدّاد فوقها، فيظنّ المشرف أن الفارق عطل.
 */
export async function loadFleetPhotos(
  supabase: SupabaseClient,
  subcontractorId: string
): Promise<{ ready: boolean; vehicles: VehiclePhotoView[]; truncated: boolean }> {
  const res = await supabase
    .from("subcontractor_vehicles")
    .select("id, class_slug, label, seats, active, plate, color, model_year, photo_path")
    .eq("subcontractor_id", subcontractorId)
    .order("class_slug", { ascending: true })
    .order("label", { ascending: true })
    .limit(FLEET_PHOTOS_MAX_ROWS);

  if (res.error) return { ready: false, vehicles: [], truncated: false };

  const raw = (res.data ?? []).map((r) => r as Record<string, unknown>);
  const states = await signVehiclePhotos(supabase, raw.map((r) => asText(r.photo_path)));

  const vehicles = raw.map((r): VehiclePhotoView => {
    const path = asText(r.photo_path);
    return {
      id: String(r.id),
      classSlug: String(r.class_slug ?? ""),
      label: asText(r.label) ?? "مركبة بلا اسم",
      seats: asInt(r.seats),
      active: r.active === true,
      plate: asText(r.plate),
      color: asText(r.color),
      modelYear: asInt(r.model_year),
      photo: path === null ? { kind: "none" } : (states.get(path) ?? { kind: "unreachable" }),
    };
  });

  return { ready: true, vehicles, truncated: vehicles.length >= FLEET_PHOTOS_MAX_ROWS };
}
