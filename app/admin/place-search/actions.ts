"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { PLACE_SEARCH_BOUNDS, isWithinServiceArea } from "@/lib/place-search-types";
import { createServerSupabase } from "@/lib/supabase/server";

/**
 * إجراء شاشة «بحث الأماكن» — الصفّ الوحيد في `place_search_settings` (هجرة 0076).
 *
 * الشكل هو شكل `app/admin/pricing/actions.ts` حرفياً (اتفاقية §٤): فحص البيئة ←
 * تحقّق من المدخلات برمزٍ لكل سبب ← كتابة بـ`.select()` وفحص صفر صفوف ←
 * `revalidatePath` ← `redirect` برمز. ولا جملة عربية واحدة تخرج من هنا: الرموز
 * تسافر في الرابط والصفحة وحدها تترجمها — فتبقى الرسالة في مكانٍ واحد.
 *
 * 🔴 **ولا مفتاح جوجل في أي حقل من هذا النموذج.** `GOOGLE_MAPS_API_KEY` في
 * البيئة وحدها (اتفاقية §٣ · D-30). ما يكتبه المالك هنا هو **هل يُستعمل جوجل**
 * لا **ما هو مفتاحه** — وحقلُ مفتاحٍ في اللوحة يضعه في نطاق أي ثغرة قراءة.
 *
 * ⚠ **والحدود التي يفرضها هذا الملف نسخةٌ لطيفة لا حارس.** الحارس الوحيد الذي
 * لا يُلتف عليه هو `check` في القاعدة (0076): يرتدّ عنه نداءٌ بمفتاح الخدمة
 * وسكربتٌ يدوي وطلبٌ مصنوع. وما هنا يمنع رحلةَ ذهابٍ وإياب إلى القاعدة لتُرفض.
 */

const url = (qs: string) => `/admin/place-search?${qs}`;

/** الأرقام العربية الهندية تُقبل في الحقول الرقمية وتُحوَّل قبل التحقق */
const toLatinDigits = (s: string) =>
  s.replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 0x0660));

function num(formData: FormData, name: string): number | null {
  const v = formData.get(name);
  if (typeof v !== "string" || v.trim() === "") return null;
  const n = Number(toLatinDigits(v.trim()));
  return Number.isFinite(n) ? n : null;
}

/**
 * عددٌ صحيح داخل مدى العقد. و`Number.isInteger` ليست زخرفة: العمودان
 * `integer` في القاعدة، فـ`2.5` يرتدّ من PostgREST برسالة نوعٍ غامضة بدل رسالةٍ
 * تقول للمالك ما الخطأ في حقله.
 */
function inBounds(value: number | null, bounds: { min: number; max: number }): boolean {
  return value !== null && Number.isInteger(value) && value >= bounds.min && value <= bounds.max;
}

export async function savePlaceSearchSettings(formData: FormData) {
  // (١) البيئة أولاً: بلا متغيراتها يرجع العميل `null` وينفجر أول استدعاء عليه
  const supabase = await createServerSupabase();
  if (!supabase) redirect(url("error=env"));

  // (٢) التحقق — رمزٌ مستقل لكل سبب، فيعرف المالك أيّ حقلٍ ردّه
  const provider = formData.get("primary_provider");
  if (provider !== "google" && provider !== "nominatim") redirect(url("error=provider"));

  const minQueryChars = num(formData, "min_query_chars");
  if (!inBounds(minQueryChars, PLACE_SEARCH_BOUNDS.minQueryChars)) redirect(url("error=chars"));

  const debounceMs = num(formData, "debounce_ms");
  if (!inBounds(debounceMs, PLACE_SEARCH_BOUNDS.debounceMs)) redirect(url("error=debounce"));

  /**
   * مرساة الخريطة (0080) — رقمان عشريان لا صحيحان، ولذلك لا تمرّان بـ`inBounds`.
   *
   * 🔴 والحكم `isWithinServiceArea` **نفسها** التي يرفض بها `/api/geocode/reverse`
   * ويقصّ إليها المنتقي: مركزٌ خارج نطاق التشغيل يُردّ برمزه هنا قبل أن يرتدّ
   * من قيد القاعدة برسالةٍ خام. وصندوقٌ ثانٍ في هذا الملف كان سينحرف يوماً عن
   * الأول — والانحراف يكون خريطةً تفتح حيث لا نخدم.
   */
  const centerLat = num(formData, "default_center_lat");
  const centerLng = num(formData, "default_center_lng");
  if (
    centerLat === null ||
    centerLng === null ||
    !isWithinServiceArea(centerLat, centerLng)
  ) {
    redirect(url("error=center"));
  }

  /**
   * مفاتيح الإطفاء الثلاثة تُقرأ بالحضور لا بالقيمة: مربّع اختيار غير مؤشَّر لا
   * يُرسَل في الجسم أصلاً — فغيابه هو «مطفأ»، وقراءته بـ`=== "on"` تعمل صدفةً
   * وتنكسر بأول تغيير في السمة `value`.
   */
  const patch = {
    google_enabled: formData.get("google_enabled") != null,
    primary_provider: provider,
    map_picker_enabled: formData.get("map_picker_enabled") != null,
    quote_fallback_enabled: formData.get("quote_fallback_enabled") != null,
    min_query_chars: minQueryChars,
    debounce_ms: debounceMs,
    default_center_lat: centerLat,
    default_center_lng: centerLng,
  };

  /**
   * (٣) الكتابة.
   *
   * 🔴 **فخ الصفوف الصفرية**: RLS ترفض الكتابة **بلا خطأ** — يرجع `error: null`
   * و`data: []`، فيبدو الحفظ ناجحاً وقيمة القاعدة كما كانت. ولذلك `.select("id")`
   * بعد كل كتابة، و`length === 0` يساوي فشلاً لا نجاحاً صامتاً.
   *
   * وقراءةُ الوجود قبل الكتابة ليست ترفاً: 0076 تبذر الصفّ، لكن قاعدةً استُعيدت
   * من نسخةٍ أقدم أو حُذف صفّها يدوياً تجعل `update` تصيب صفر صفوف **وهي محقّة** —
   * فيُقال للمالك «لستَ admin» وهو admin. فمن لا صفَّ له يُدرَج له صفّ، ومن رُفض
   * إدراجه فقد رُفض بـRLS فعلاً.
   */
  const existing = await supabase.from("place_search_settings").select("id").limit(1);
  if (existing.error) redirect(url("error=save"));

  const res = existing.data?.[0]
    ? await supabase
        .from("place_search_settings")
        .update(patch)
        .eq("id", true)
        .select("id")
    : await supabase
        .from("place_search_settings")
        .insert({ ...patch, id: true })
        .select("id");

  if (res.error || !res.data || res.data.length === 0) redirect(url("error=save"));

  // (٤) الإعدادات تُقرأ في شجرة الموقع كلها، فيلزم إبطالها قبل التوجيه
  revalidatePath("/", "layout");
  redirect(url("saved=1"));
}
