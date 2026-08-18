import "server-only";

import { randomUUID } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";

import {
  DRIVER_DOCS_BUCKET,
  DRIVER_DOC_MAX_BYTES,
  DRIVER_DOC_PATH_PATTERN,
  DRIVER_DOC_TYPES,
  DRIVER_DOC_URL_TTL,
  type DriverDocKind,
} from "@/lib/driver-docs-types";

/**
 * طبقة تخزين مستندات السائق — العقد الملزم `lib/driver-docs-types.ts`.
 *
 * ── 🔒 القاعدة التي تحكم هذا الملف كلّه: لا مفتاح خدمة في مسار قراءةٍ ولا كتابة
 *
 * كل دالة هنا تأخذ **عميل جلسة المنادي** (`SupabaseClient` من
 * `createServerSupabase()`), لا `createServiceSupabase()`. والفرق ليس أسلوبياً:
 * مفتاح الخدمة **يتجاوز RLS**، فلو وقّعنا به رابطاً لصار الحارسُ الحقيقي سطرَ
 * `if` في TypeScript — و«اختبارٌ» يمرّ عليه لا يشهد على شيء. أما بجلسة المنادي
 * فالسياسة `driver_docs_select_own_or_admin` هي التي تقرّر، ويمكن إثباتها بجلسة
 * شريكٍ ثانٍ حقيقية (وهو ما يفعله `driver_docs_tests.sql`).
 *
 * والاستثناء الوحيد: **عاملُ الكنس** في `lib/drivers/retention.ts` — يعمل بمفتاح
 * الخدمة لأنه يحذف ملفات شركاء لا جلسة لهم، وهو مسارٌ مجدول لا يبلغه متصفح.
 */

/** رموز الأخطاء — تُترجَم إلى عربية في الشاشة، ولا تُرمى استثناءات */
export type DriverDocError = "doc_type" | "doc_size" | "doc_empty" | "upload" | "save";

/**
 * بناء مفتاح الكائن: `<sub>/<driver>/<kind>-<hex32>.<ext>`.
 *
 * والعشوائيةُ مقصودة: اسمٌ ثابت (`license.jpg`) يعني أن استبدال الصورة يكتب فوق
 * القديمة، فيبقى الرابط الموقَّع القديم صالحاً على محتوى جديد — ويعني كذلك أن
 * من عرف المعرِّفين عرف المسار. وهي ليست حارساً (الحارس السياسة) بل طبقةُ
 * إخفاءٍ لا تُكلّف شيئاً.
 */
export function buildDriverDocPath(
  subcontractorId: string,
  driverId: string,
  kind: DriverDocKind,
  ext: string
): string {
  const rand = randomUUID().replace(/-/g, "");
  return `${subcontractorId}/${driverId}/${kind}-${rand}.${ext}`;
}

/** المسار الذي نكتبه يجب أن يمرّ بنفس النمط الذي يفرضه القيد في القاعدة */
export const isDriverDocPath = (value: string | null | undefined): value is string =>
  typeof value === "string" && DRIVER_DOC_PATH_PATTERN.test(value);

/**
 * فحص الملف قبل الرفع — رفضٌ مبكر يوفّر رحلة شبكة، **لا حراسة**.
 * الحدود الحقيقية على الدلو نفسه (`file_size_limit` و`allowed_mime_types`)،
 * تماماً كما في `0009`: «فحص الحجم والنوع في مسار الـ API يحمي المتصفح الودود
 * وحده؛ من يرفع بمفتاح anon مباشرة إلى Storage API يتجاوزه كلياً».
 */
export function readDriverDocFile(value: FormDataEntryValue | null):
  | { ok: true; file: File; ext: string }
  | { ok: false; error: DriverDocError } {
  if (!(value instanceof File) || value.size === 0) return { ok: false, error: "doc_empty" };
  const ext = DRIVER_DOC_TYPES[value.type];
  if (!ext) return { ok: false, error: "doc_type" };
  if (value.size > DRIVER_DOC_MAX_BYTES) return { ok: false, error: "doc_size" };
  return { ok: true, file: value, ext };
}

/**
 * رفع ملف بجلسة المنادي — فسياسة `driver_docs_insert_own_or_admin` هي التي
 * تسمح أو تمنع، ومعها `driver_doc_upload_allowed` التي تتحقق من الشكل والملكية
 * وسقف العدد داخل القاعدة.
 */
export async function uploadDriverDoc(
  supabase: SupabaseClient,
  path: string,
  file: File
): Promise<boolean> {
  const res = await supabase.storage
    .from(DRIVER_DOCS_BUCKET)
    .upload(path, file, { contentType: file.type, upsert: false });
  return !res.error;
}

/**
 * حذفٌ بأفضل جهد — فشلُه لا يوقف شيئاً ولا يُخفى:
 * الملف الباقي يصير **يتيماً**، ودورةُ الكنس تلتقطه بعد يوم (القسم ٧ في 0120).
 * وهذا هو الفرق بين «حذفٌ قد يفشل صامتاً» و«حذفٌ له شبكة أمان مقيسة».
 */
export async function removeDriverDocs(
  supabase: SupabaseClient,
  paths: string[]
): Promise<number> {
  const valid = paths.filter(isDriverDocPath);
  if (valid.length === 0) return 0;
  try {
    const res = await supabase.storage.from(DRIVER_DOCS_BUCKET).remove(valid);
    if (res.error) return 0;
    return res.data?.length ?? valid.length;
  } catch {
    return 0;
  }
}

/**
 * روابط موقَّتة لعدة مسارات في نداءٍ واحد — تُولَّد لحظة التصيير وتموت بعد
 * دقيقة، **ولا تُخزَّن ولا تُمرَّر في رابط صفحة**.
 *
 * والمسار الخام لا يخرج إلى المتصفح أبداً: ما يصل الشاشة هو الرابط الموقَّع
 * وحده — نفس قرار `receipt_path` في 0039.
 *
 * ── 🔴 ولماذا صار لكل مسارٍ **حصيلةٌ** لا `undefined` صامت ────────────────
 *
 * كانت هذه الدالة تُرجع `Map` فيها الناجحون وحدهم، فيقرأ المستهلك `get(path)`
 * ويجد `undefined` — **بلا أن يعرف أيَّ الثلاثة وقع**: مسارٌ لم يطابق النمط
 * فسقط من التصفية قبل أي نداء · أم أن التخزين ردّ «لا وجود أو لا صلاحية» ·
 * أم أن الاتصال نفسه أخفق. والثلاثة كانت تُعرض جملةً واحدة («تعذّر عرضها
 * الآن») لا تقول للمالك ما يفعل. فصارت الحصيلة صريحة، والجملة تُشتق منها.
 */

/** سببُ تعذُّر العرض — ثلاثةٌ لا تُخلط، لأن علاج كلٍّ منها مختلف */
export type DriverDocFailure =
  /** المسار المخزَّن في الصف لا يطابق النمط الملزم — عطلُ بياناتٍ لا صلاحية */
  | "bad_path"
  /** التخزين ردّ رفضاً لهذا المفتاح: إمّا لا وجود له، وإمّا لا تشمله صلاحيتك */
  | "unavailable"
  /** لم يصل الردّ أصلاً — التخزين غير قابلٍ للاتصال الآن */
  | "unreachable";

/** حصيلةُ مسارٍ واحد: رابطٌ يُعرض، أو سببٌ يُكتب — ولا حالةَ ثالثة صامتة */
export type DriverDocOutcome = { url: string } | { failure: DriverDocFailure };

/**
 * التوقيع المفصَّل — لكل مسارٍ **حصيلة**، فلا يبتلع المستهلكُ سبباً.
 *
 * ⚠ ولا مفتاح خدمة هنا: العميل هو عميل جلسة المنادي، فالسياسة
 * `driver_docs_select_own_or_admin` هي التي تسمح أو تمنع — ولو وُقِّع بمفتاح
 * الخدمة لَعملت الشاشة حتى لو انهارت السياسة.
 */
export async function signDriverDocsDetailed(
  supabase: SupabaseClient,
  paths: (string | null)[]
): Promise<Map<string, DriverDocOutcome>> {
  const out = new Map<string, DriverDocOutcome>();

  // المسارات المطلوبة كما وردت — كي يحصل غيرُ المطابق على سببه لا على صمت
  const asked = [...new Set(paths.filter((p): p is string => typeof p === "string" && p !== ""))];
  const valid = asked.filter(isDriverDocPath);
  for (const p of asked) {
    if (!valid.includes(p)) out.set(p, { failure: "bad_path" });
  }
  if (valid.length === 0) return out;

  try {
    const { data, error } = await supabase.storage
      .from(DRIVER_DOCS_BUCKET)
      .createSignedUrls(valid, DRIVER_DOC_URL_TTL);

    if (error || !data) {
      for (const p of valid) out.set(p, { failure: "unreachable" });
      return out;
    }

    // 🔴 الردّ ٢٠٠ حتى حين يُرفض مفتاح: الرفض يأتي **داخل الصف**
    // (`signedUrl === null`) لا في `error`. فالاعتماد على `error` وحده كان
    // يجعل الرفض يبدو نجاحاً بخريطةٍ ناقصة.
    for (const row of data) {
      if (row.path && row.signedUrl) out.set(row.path, { url: row.signedUrl });
    }
    for (const p of valid) {
      if (!out.has(p)) out.set(p, { failure: "unavailable" });
    }
  } catch {
    for (const p of valid) if (!out.has(p)) out.set(p, { failure: "unreachable" });
  }
  return out;
}

/**
 * الشكل المختصر — رابطٌ أو لا شيء. يبقى لأن `app/portal/drivers/data.ts`
 * يستهلكه بهذا العقد، ولئلا يصير للتوقيع مسارانِ ينحرفان (النمط ٨).
 */
export async function signDriverDocs(
  supabase: SupabaseClient,
  paths: (string | null)[]
): Promise<Map<string, string>> {
  const detailed = await signDriverDocsDetailed(supabase, paths);
  const out = new Map<string, string>();
  for (const [path, outcome] of detailed) {
    if ("url" in outcome) out.set(path, outcome.url);
  }
  return out;
}
