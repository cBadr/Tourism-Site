"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import type { BusinessInfo } from "@/lib/seo-types";
import { createServerSupabase } from "@/lib/supabase/server";

/**
 * حفظ بطاقة النشاط — مفتاح `business` في `site_settings` (مفتاح جديد بلا هجرة،
 * لأن `site_settings.value` عمود `jsonb` أصلاً).
 *
 * ── قاعدة هذا الملف كلها في سطر ─────────────────────────────────────────────
 * **بطاقة تعلن عنواناً غير صحيح أسوأ من بطاقة بلا عنوان.** الأولى تُفقد الثقة عند
 * أول زائر يصل إلى مكان لا وجود له — وقد يُعاقَب عليها الترتيب المحلي — والثانية
 * تنقص إشارةً وحسب. ولذلك: كل حقل **اختياري بـ`null`**، ولا يُخترع افتراضي لحقل
 * لم يكتبه المالك، وأي قيمة لا تجتاز التحقق تُرفض بصوت عالٍ لا تُصحَّح بالتخمين.
 *
 * وأربع خطوات اتفاقية `CONVENTIONS.md §٤`: البيئة، ثم التحقق بخروج فوري برمز
 * واضح، ثم الكتابة مع `.select()` وفحص صفر صفوف (فخ RLS)، ثم إبطال الكاش
 * فالتوجيه — في النجاح والفشل معاً.
 */

const url = (qs: string) => `/admin/seo/business?${qs}`;

/** سقوف صلبة — حاجز أمام لصق نص طويل في حقل عنوان */
const MAX_SHORT = 120;
const MAX_HOURS = 200;
const MAX_AREAS = 40;

/** رمز الدولة في schema.org حرفان لاتينيان (‏EG · SA · AE) */
const COUNTRY_CODE = /^[A-Za-z]{2}$/;

/**
 * الأرقام العربية الهندية مقبولة في حقول الإحداثيات وتُحوَّل قبل التحقق — نفس
 * ما تفعله `app/admin/settings/actions.ts` في حقل المهلة.
 */
const toLatinDigits = (value: string) =>
  value.replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 0x0660));

function text(formData: FormData, name: string): string | null {
  const value = formData.get(name);
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed === "" ? null : trimmed;
}

/**
 * إحداثية: `null` حين يترك الحقل فارغاً، والعدد حين يكون **رقماً حقيقياً داخل
 * مداه**، و`false` حين يكون نصاً لا يصلح رقماً أصلاً.
 *
 * والتفريق بين الثلاثة ضروري: `Number("")` يساوي صفراً، و`Number("شمال")` يساوي
 * `NaN`. فبلا هذا التمييز يصبح حقل خط عرض فارغ إحداثيةَ الصفر — وهي نقطة في
 * المحيط الأطلسي قرب غانا تُعلَن لجوجل موقعَ نشاطك.
 */
function coordinate(formData: FormData, name: string, limit: number): number | null | false {
  const raw = text(formData, name);
  if (raw === null) return null;
  const value = Number(toLatinDigits(raw));
  if (!Number.isFinite(value)) return false;
  if (value < -limit || value > limit) return false;
  return value;
}

export async function saveBusinessInfo(formData: FormData) {
  // (١) البيئة
  const supabase = await createServerSupabase();
  if (!supabase) redirect(url("error=env"));

  // (٢) التحقق — كله قبل أي كتابة
  const streetAddress = text(formData, "streetAddress");
  const addressLocality = text(formData, "addressLocality");
  const addressRegion = text(formData, "addressRegion");
  const postalCode = text(formData, "postalCode");
  const openingHours = text(formData, "openingHours");
  const priceRange = text(formData, "priceRange");

  for (const value of [streetAddress, addressLocality, addressRegion, postalCode, priceRange]) {
    if (value !== null && value.length > MAX_SHORT) redirect(url("error=long"));
  }
  if (openingHours !== null && openingHours.length > MAX_HOURS) redirect(url("error=long"));

  const countryRaw = text(formData, "addressCountry");
  if (countryRaw !== null && !COUNTRY_CODE.test(countryRaw)) redirect(url("error=country"));
  const addressCountry = countryRaw === null ? null : countryRaw.toUpperCase();

  const latitude = coordinate(formData, "latitude", 90);
  if (latitude === false) redirect(url("error=latitude"));
  const longitude = coordinate(formData, "longitude", 180);
  if (longitude === false) redirect(url("error=longitude"));

  /**
   * الإحداثيتان معاً أو لا شيء: نقطة على الخريطة بخط عرض بلا خط طول ليست نقطة،
   * وقبولها يعني حقلاً محفوظاً لا يُخرج شيئاً — وهو أسوأ من رفضٍ يشرح نفسه.
   */
  if ((latitude === null) !== (longitude === null)) redirect(url("error=geopair"));

  const areasRaw = formData.get("areaServed");
  const areaLines =
    typeof areasRaw === "string"
      ? areasRaw
          .split("\n")
          .map((line) => line.trim())
          .filter((line) => line !== "")
      : [];
  if (areaLines.length > MAX_AREAS) redirect(url("error=areas-many"));
  for (const line of areaLines) {
    if (line.length > MAX_SHORT) redirect(url("error=long"));
  }
  const areaServed = [...new Set(areaLines)];

  // النوع الصريح: أي حقل يُضاف إلى العقد ولا يُقرأ هنا يصير **خطأ بناء**، لأن
  // `site_settings.value` يُستبدل كاملاً ولا يُدمج — فالحقل الغائب يُمحى.
  const value: BusinessInfo = {
    streetAddress,
    addressLocality,
    addressRegion,
    postalCode,
    addressCountry,
    latitude,
    longitude,
    openingHours,
    priceRange,
    areaServed,
  };

  // (٣) الكتابة مع فحص صفر صفوف
  const res = await supabase
    .from("site_settings")
    .upsert([{ key: "business", value }], { onConflict: "key" })
    .select("key");

  // صفر صفوف مع نجاح ظاهري = RLS رفضت الكتابة (المستخدم ليس admin)
  if (res.error || !res.data || res.data.length === 0) redirect(url("error=save"));

  // (٤) البطاقة تُقرأ مع إعدادات الموقع في كل صفحة عامة
  revalidatePath("/", "layout");
  redirect(url("saved=1"));
}
