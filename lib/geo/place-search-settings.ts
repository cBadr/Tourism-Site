import "server-only";

import { cache } from "react";

import {
  PLACE_SEARCH_DEFAULTS,
  isWithinServiceArea,
  type PlaceProvider,
  type PlaceSearchSettings,
} from "@/lib/place-search-types";
import { createServiceSupabase } from "@/lib/supabase/admin";

/**
 * قارئ إعدادات بحث الأماكن — المصدر الوحيد في طبقة TypeScript.
 *
 * يقرأ `public.place_search_config()` (هجرة 0076) بمفتاح الخدمة، لا الجدول
 * مباشرةً: الدالة `security definer` تُرجع صفاً واحداً **دائماً** حتى على
 * قاعدة لم تُبذر، فلا ينكسر البحث العام على نسخةٍ جديدة.
 *
 * 🔒 **وكل فشلٍ يسقط على `PLACE_SEARCH_DEFAULTS`** — وهي سلوك اليوم: جوجل
 * مطفأ. أي أن تعذُّر قراءة الإعدادات **لا يمكن أن يفتح مزوّداً مدفوعاً**.
 * والاتجاه المعاكس (السقوط على «مفعّل») كان سيجعل انقطاع القاعدة فاتورةً.
 *
 * و`cache()` من React تحفظ النتيجة **داخل الطلب الواحد** لا عبر الطلبات:
 * الصفحة الخادمية ومسار الاقتراحات قد يقرآن في الطلب نفسه، ومفتاح القطع يجب
 * أن يسري **فور** حفظه من اللوحة — فلا كاش زمني هنا بقصد.
 */
export const readPlaceSearchSettings = cache(async (): Promise<PlaceSearchSettings> => {
  const supabase = createServiceSupabase();
  if (!supabase) return PLACE_SEARCH_DEFAULTS;

  try {
    const { data, error } = await supabase.rpc("place_search_config");
    if (error) return PLACE_SEARCH_DEFAULTS;

    // الدالة تُرجع جدولاً بصفٍّ واحد
    const row = (Array.isArray(data) ? data[0] : data) as Record<string, unknown> | null;
    if (!row) return PLACE_SEARCH_DEFAULTS;

    return {
      googleEnabled: bool(row.google_enabled, PLACE_SEARCH_DEFAULTS.googleEnabled),
      primaryProvider: provider(row.primary_provider),
      mapPickerEnabled: bool(row.map_picker_enabled, PLACE_SEARCH_DEFAULTS.mapPickerEnabled),
      quoteFallbackEnabled: bool(
        row.quote_fallback_enabled,
        PLACE_SEARCH_DEFAULTS.quoteFallbackEnabled
      ),
      minQueryChars: int(row.min_query_chars, PLACE_SEARCH_DEFAULTS.minQueryChars),
      debounceMs: int(row.debounce_ms, PLACE_SEARCH_DEFAULTS.debounceMs),
      // 0080 — المرساة. والسقوط على الافتراضي **بالنقطة كاملةً لا بمحورٍ
      // مستقل**: نصفُ إحداثيٍّ من القاعدة ونصفٌ من العقد يعطي مركزاً في مكانٍ
      // ثالث لا يقصده أحد. و`isWithinServiceArea` هي الحكم — لا صندوق ثانٍ.
      defaultCenter: center(row.default_center_lat, row.default_center_lng),
    };
  } catch {
    return PLACE_SEARCH_DEFAULTS;
  }
});

function bool(value: unknown, fallback: boolean): boolean {
  return typeof value === "boolean" ? value : fallback;
}

function int(value: unknown, fallback: number): number {
  const n = Number(value);
  // ⚠ القاعدة هي الحارس (‏`check` في 0076)؛ وهذا يحمي من `null` أو نصٍّ فقط،
  //   ولا يعيد فرض المدى هنا — مدىً ثانٍ في TypeScript ينحرف عن الأول حتماً.
  return Number.isFinite(n) ? Math.trunc(n) : fallback;
}

/**
 * مرساةُ الخريطة — نقطةٌ كاملة أو الافتراضي، ولا خلط بينهما.
 *
 * 🔴 والفحص `isWithinServiceArea` نفسها التي يفرضها `/api/geocode/reverse`:
 * صفٌّ خارج مصر (‏تعديلٌ يدوي على قاعدةٍ سبقت قيد 0080) **لا يفتح خريطةً على
 * روما** بل يسقط إلى المطار. والقاعدة هي الحارس، وهذا حزامٌ ثانٍ لا بديل.
 */
function center(lat: unknown, lng: unknown): PlaceSearchSettings["defaultCenter"] {
  const la = Number(lat);
  const ln = Number(lng);
  return isWithinServiceArea(la, ln) ? { lat: la, lng: ln } : PLACE_SEARCH_DEFAULTS.defaultCenter;
}

function provider(value: unknown): PlaceProvider {
  return value === "google" || value === "nominatim" ? value : PLACE_SEARCH_DEFAULTS.primaryProvider;
}
