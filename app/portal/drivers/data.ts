import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { isSchemaMissing } from "../_lib/session";

/**
 * قراءة سجلّ سائقي المتعهد — العقد الملزم `lib/crew-types.ts`.
 *
 * ⚠ السجلّ **ملك الشريك لا المنصة**: «قسم السائقين أُلغي بقرار بدر (2026-08-11)
 * — لا إدارة سائقين مباشرين إطلاقاً». فما هنا نظير `loadVehicles` حرفاً بحرف —
 * صفوف المتعهد وحده، مقيَّدة بـ`subcontractor_id` صراحةً فوق RLS (حزامان لا
 * حزام واحد) — ولا شاشة سائقين في `/admin` تقابله.
 *
 * ولماذا سجلّ لا حقول تُملأ في كل رحلة؟ لأن متعهداً بعشر رحلات يومياً يعيد كتابة
 * الاسم والهاتف خمسين مرة أسبوعياً، ومن يفعل ذلك أسبوعاً يتوقف — فيبقى العميل
 * بلا معلومة وتبقى الميزة مبنيّة ولا تُستعمل.
 *
 * و`photo_path` **لا يُقرأ هنا عمداً**: العمود موجود والرفع مؤجَّل بقرار مكتوب في
 * ترويسة الهجرة 0040 (دلو `media` عام، وصورة السائق بيانات شخصية لطرفٍ ثالث ليس
 * مستخدماً عندنا). وما لا يُقرأ لا يصل الشاشة بخطأ برمجي.
 *
 * `ready = false` تعني «هجرة 0040 غير منفَّذة» لا «فشل» — والفرق يُقرأ على الشاشة:
 * «سجلّك فارغ» و«سجلّك غير جاهز» جملتان لا يجوز الخلط بينهما.
 */

export type PortalDriver = {
  id: string;
  name: string;
  phone: string;
  /** رقم الرخصة — سجلّ داخلي بين الشريك والإدارة، ولا يصل العميل إطلاقاً */
  licenseNo: string | null;
  active: boolean;
};

export const DRIVER_COLUMNS = "id, name, phone, license_no, active";

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

  const drivers = (res.data ?? []).map((row) => {
    const r = row as Record<string, unknown>;
    return {
      id: String(r.id),
      name: asText(r.name) ?? "",
      phone: asText(r.phone) ?? "",
      licenseNo: asText(r.license_no),
      active: r.active === true,
    };
  });

  return { drivers, ready: true };
}
