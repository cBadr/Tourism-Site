import "server-only";

import type { GeoPlace } from "@/lib/pricing-types";
import type {
  PlaceProvider,
  PlaceSearchSettings,
  PlaceSuggestion,
  SuggestResponse,
} from "@/lib/place-search-types";
import { normalizeQuery, searchPlacesResult } from "@/lib/geo/geocode";
import { googleAutocomplete, googlePlaceDetails, hasGoogleKey } from "@/lib/geo/places-google";
import { readPlaceSearchSettings } from "@/lib/geo/place-search-settings";

/**
 * محرّك بحث الأماكن متعدد الطبقات — **نفس شكل محرّك المسافات** (‏`route.ts`،
 * وقراره D-13). وهو الشكل الذي أثبت نفسه: مزوّدٌ مدفوع أدقّ، ثم مجانيٌّ يكفي،
 * ثم مخرجٌ لا يتوقف عنده العميل أبداً.
 *
 *     Google Places  →  Nominatim  →  «حدّد على الخريطة»  →  «اطلب عرض سعر»
 *
 * والطبقتان الأخيرتان ليستا مزوّدَي بحث بل **مخرجان**، ولذلك لا تعيشان هنا:
 * الخريطة تُرجع إحداثيات بلا بحث، وعرضُ السعر يترك الموقع بطلبٍ لا بسعر.
 * ما يقرّره هذا الملف هو **متى يُعرضان** — وهو ما تحمله `exhausted`.
 *
 * ══════════════════════════════════════════════════════════════════════════
 *  🔴 قاعدة الارتداد — وما هو «فشل» وما ليس فشلاً
 * ══════════════════════════════════════════════════════════════════════════
 *
 * **فشلٌ ⇒ ننزل للمزوّد التالي:** مفتاح مفقود · حصّة منتهية · خطأ شبكة · جسم
 * فاسد. أي أن المزوّد **لم يجب**، فسؤاله ليس جواباً.
 *
 * **صفر نتيجة ⇒ ليس فشلاً، ولا ننزل لأحد.** المزوّد أجاب: «لا أعرف هذا
 * المكان». وسؤالُ الثاني بعده يكلّف ثانيةً من انتظار العميل ليعود بالجواب
 * نفسه غالباً — فيمضي مباشرةً إلى الخريطة، وهي أدقّ من كليهما أصلاً.
 *
 * ⚠ **وقياسٌ يخصّ هذه القاعدة، يُذكر لأنه يخالف حدسها** (2026-08-17، على
 * الواجهتين الحيّتين): تغطية المزوّدَين **متكاملة لا متداخلة**. «فندق ماريوت
 * مينا هاوس» و«فندق فور سيزونز نايل بلازا»: جوجل يجدهما و OSM لا. و«كمبوند
 * مدينتي»: OSM يجده بخمس نتائج وجوجل لا يجده. فصفرُ أحدهما **لا يتنبأ** بصفر
 * الآخر. والقاعدة المطبَّقة هنا هي **أمر المالك نصّاً**، وموضع تغييرها سطرٌ
 * واحد مُعلَّم أدناه — يُعرض عليه القياس ويقرّر هو.
 */

/** اللغة التي تُطلب بها نتائج جوجل — الواجهة عربية أصلاً، والإنجليزية لاحقاً */
function googleLanguage(locale: string | undefined): string {
  return locale === "en" ? "en" : "ar";
}

/**
 * ترتيب المزوّدين الفعلي لهذا الطلب.
 *
 * 🔒 **`googleEnabled` مفتاح قطع مطلق**: إطفاؤه يُخرج جوجل من القائمة مهما
 * كانت قيمة `primaryProvider` — فمفتاح القطع لا يُلتف عليه بحقلٍ آخر. وغيابُ
 * المفتاح من البيئة يُخرجه كذلك: تفعيلٌ بلا مفتاح كان سينفق نداءً على كل
 * ضغطة مفتاح ليعود بـ«غير متاح» ثم ينزل لـNominatim.
 */
function providerOrder(settings: PlaceSearchSettings): PlaceProvider[] {
  const google = settings.googleEnabled && hasGoogleKey();
  if (!google) return ["nominatim"];
  return settings.primaryProvider === "google"
    ? ["google", "nominatim"]
    : ["nominatim", "google"];
}

/** نتيجة مزوّدٍ واحد — بنفس ثلاثية `GoogleSuggestResult` حتى يتوحد التعامل */
type ProviderResult =
  | { status: "ok"; suggestions: PlaceSuggestion[] }
  | { status: "unavailable" };

async function askProvider(
  provider: PlaceProvider,
  query: string,
  sessionToken: string | undefined,
  locale: string | undefined
): Promise<ProviderResult> {
  if (provider === "google") {
    return googleAutocomplete(query, sessionToken, googleLanguage(locale));
  }

  const result = await searchPlacesResult(query);
  if (result.status === "unavailable") return { status: "unavailable" };

  // اقتراح Nominatim يحمل إحداثياته معه — فاختياره لا يلمس الشبكة إطلاقاً
  return {
    status: "ok",
    suggestions: result.places.map((place, index) => ({
      ref: place.ref ?? `osm-${index}-${place.lat},${place.lng}`,
      provider: "nominatim" as const,
      label: place.label,
      place,
    })),
  };
}

/**
 * البحث. **لا يرمي أبداً** — أسوأ الأحوال `exhausted: true` والعميل أمام
 * الخريطة وطلب عرض السعر.
 */
export async function suggestPlaces(options: {
  query: string;
  sessionToken?: string;
  locale?: string;
  settings?: PlaceSearchSettings;
}): Promise<SuggestResponse> {
  const settings = options.settings ?? (await readPlaceSearchSettings());
  const query = normalizeQuery(options.query);

  if (query.length < settings.minQueryChars) return { ok: false, code: "too-short" };

  for (const provider of providerOrder(settings)) {
    const result = await askProvider(provider, query, options.sessionToken, options.locale);

    if (result.status === "unavailable") continue; // ← المزوّد لم يجب: التالي

    if (result.suggestions.length > 0) {
      return { ok: true, provider, suggestions: result.suggestions, exhausted: false };
    }

    // 👇 السطر الذي يجسّد القاعدة: **صفر نتيجة جوابٌ نهائي**، فلا يُسأل التالي.
    //    (لتغيير هذا إلى «جرّب الآخر» يُحذف هذا الـ`break` وحده — والقياس الذي
    //     قد يبرّره مذكورٌ في ترويسة هذا الملف.)
    break;
  }

  // كلهم أجابوا بصفر، أو كلهم سقطوا — **والمخرج واحد في الحالتين بقصد**:
  // العميل الذي لا يجد مكانه لا يعنيه أي المزوّدين سقط، ويعنيه أن أمامه
  // طريقاً يمشيه الآن. فمخرجٌ يعمل خيرٌ من عذرٍ صادق.
  return { ok: true, provider: null, suggestions: [], exhausted: true };
}

/**
 * تحويل اقتراحٍ إلى مكانٍ بإحداثيات — **وهو ما يُنهي جلسة فوترة جوجل**.
 *
 * 🔒 اقتراح Nominatim لا يمرّ من هنا أصلاً (يحمل إحداثياته)، فهذا المسار
 * لجوجل وحده عملياً؛ وبقاؤه عاماً يُبقي عقد الواجهة واحداً مهما تبدّل
 * المزوّد الأساسي.
 */
export async function resolveSuggestion(options: {
  ref: string;
  provider: PlaceProvider;
  sessionToken?: string;
  locale?: string;
  settings?: PlaceSearchSettings;
}): Promise<GeoPlace | null> {
  const settings = options.settings ?? (await readPlaceSearchSettings());

  // ⚠ حارسٌ لا زخرفة: `provider` يصل من المتصفح. ولولا هذا الفحص لأمكن لطلبٍ
  //   مصنوع أن يُنفق نداءَ تفاصيل جوجل والمالك مطفئٌ جوجل من لوحته.
  if (options.provider !== "google") return null;
  if (!settings.googleEnabled || !hasGoogleKey()) return null;

  return googlePlaceDetails(options.ref, options.sessionToken, googleLanguage(options.locale));
}
