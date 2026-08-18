import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { signDriverDocs } from "@/lib/drivers/documents";
import { isSchemaMissing } from "../_lib/session";

/**
 * قراءة سجلّ سائقي المتعهد — العقدان الملزمان `lib/crew-types.ts` (الطاقم)
 * و`lib/driver-docs-types.ts` (الصورة والرخصة).
 *
 * ⚠ السجلّ **ملك الشريك لا المنصة**: «قسم السائقين أُلغي بقرار بدر (2026-08-11)
 * — لا إدارة سائقين مباشرين إطلاقاً». فما هنا نظير `loadVehicles` حرفاً بحرف —
 * صفوف المتعهد وحده، مقيَّدة بـ`subcontractor_id` صراحةً فوق RLS (حزامان لا
 * حزام واحد).
 *
 * ── 🔒 وما تغيّر مع 0120: الصورة والرخصة صارتا تُقرآن — ومساراهما لا تخرجان ──
 *
 * كان `photo_path` **لا يُقرأ عمداً** لأن الرفع كان مؤجَّلاً بقرارٍ مكتوب في
 * ترويسة `0040` (دلو `media` عام، وصورة السائق بيانات طرفٍ ثالث). وقد شُحن الدلو
 * الخاص، فصار يُقرأ — **لكن المسار الخام لا يصل المتصفح**: تُحوَّل المسارات هنا
 * إلى **روابط موقَّعة عمرها دقيقة**، والمسار نفسه يبقى على الخادم.
 *
 * 🔒 **والتوقيع بجلسة الشريك نفسها لا بمفتاح الخدمة**: السياسة
 * `driver_docs_select_own_or_admin` هي التي تسمح، فلو نادى شريكٌ هذه الشاشة على
 * سائق غيره لَما وقّعت القاعدة له رابطاً. ولو وقّعنا بمفتاح الخدمة لصار الحارس
 * شرطَ `.eq()` في هذا الملف — وهو ما لا يشهد عليه اختبار.
 *
 * `ready = false` تعني «هجرة 0040 غير منفَّذة» لا «فشل» — والفرق يُقرأ على الشاشة.
 */

export type PortalDriver = {
  id: string;
  name: string;
  phone: string;
  /** رقم الرخصة — سجلّ دائم بين الشريك والإدارة، ولا يصل العميل إطلاقاً */
  licenseNo: string | null;
  /** تاريخ انتهاء الرخصة — سجلّ دائم كذلك، ولا يُحذف مع الصورة */
  licenseExpiry: string | null;
  /** وثّقتها الإدارة في هذا التاريخ — `null` تعني «لم تُراجَع» لا «مرفوضة» */
  licenseVerifiedAt: string | null;
  /** متى حُذفت الصور بانقضاء المدة — يُعرض كي لا يُقرأ غيابها عطلاً */
  docsPurgedAt: string | null;
  /** رابطٌ موقَّت لصورة السائق — `null` = لا صورة، أو تعذّر التوقيع */
  photoUrl: string | null;
  /** رابطٌ موقَّت لصورة الرخصة */
  licenseUrl: string | null;
  /** هل يوجد ملفٌّ مرفوع أصلاً؟ يفصل «لا صورة» عن «صورةٌ تعذّر توقيعها» */
  hasPhoto: boolean;
  hasLicensePhoto: boolean;
  active: boolean;
};

export const DRIVER_COLUMNS =
  "id, name, phone, license_no, license_expiry, license_verified_at, docs_purged_at, photo_path, license_photo_path, active";

const asText = (v: unknown): string | null =>
  typeof v === "string" && v.trim() !== "" ? v.trim() : null;

export async function loadDrivers(
  supabase: SupabaseClient,
  subcontractorId: string
): Promise<{ drivers: PortalDriver[]; ready: boolean }> {
  const res = await supabase
    .from("subcontractor_drivers")
    .select(DRIVER_COLUMNS)
    .eq("subcontractor_id", subcontractorId)
    // العاملون أولاً: من يُسنَد إليه اليوم يتصدّر، والموقوف يبقى مقروءاً أسفله
    .order("active", { ascending: false })
    .order("name", { ascending: true });

  if (res.error) return { drivers: [], ready: !isSchemaMissing(res.error) };

  const rows = (res.data ?? []).map((row) => row as Record<string, unknown>);

  // توقيعٌ واحد لكل المسارات — البديل نداء لكل صورة، وشريكٌ بعشرين سائقاً
  // يدفع أربعين رحلة شبكة في كل فتحة للصفحة.
  const links = await signDriverDocs(
    supabase,
    rows.flatMap((r) => [asText(r.photo_path), asText(r.license_photo_path)])
  );

  const drivers = rows.map((r) => {
    const photoPath = asText(r.photo_path);
    const licensePath = asText(r.license_photo_path);
    return {
      id: String(r.id),
      name: asText(r.name) ?? "",
      phone: asText(r.phone) ?? "",
      licenseNo: asText(r.license_no),
      licenseExpiry: asText(r.license_expiry),
      licenseVerifiedAt: asText(r.license_verified_at),
      docsPurgedAt: asText(r.docs_purged_at),
      photoUrl: photoPath ? (links.get(photoPath) ?? null) : null,
      licenseUrl: licensePath ? (links.get(licensePath) ?? null) : null,
      hasPhoto: Boolean(photoPath),
      hasLicensePhoto: Boolean(licensePath),
      active: r.active === true,
    };
  });

  return { drivers, ready: true };
}
