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
 * **فشلٌ ⇒ ننزل للمزوّد التالي دائماً:** مفتاح مفقود · حصّة منتهية · خطأ شبكة ·
 * جسم فاسد. أي أن المزوّد **لم يجب**، فسؤاله ليس جواباً.
 *
 * **وصفر نتيجة ⇒ ننزل كذلك، لكن بشرط الاتجاه** (تعديل المالك، 2026-08-17).
 *
 * والقاعدة السابقة كانت «صفرٌ جوابٌ نهائي، ولا يُسأل الثاني»، **ونقضها قياسٌ
 * على الواجهتين الحيّتين**: تغطية المزوّدَين **متكاملة لا متداخلة**. «فندق
 * ماريوت مينا هاوس» و«فور سيزونز نايل بلازا»: جوجل يجدهما و OSM لا. و«كمبوند
 * مدينتي»: OSM يجده بخمس نتائج وجوجل يردّ `200 {}`. فصفرُ أحدهما **لا يتنبأ**
 * بصفر الآخر — ومع القاعدة القديمة كان تشغيلُ جوجل يعني أن يخسر العميل نصف
 * التغطية على كل استعلامٍ لا يعرفه الأول.
 *
 * ⚠ **وشرطُ الاتجاه ليس تفصيلاً — هو ضابط الفاتورة** (`mayFallThroughOnEmpty`
 * أدناه): الصفر ينزل **حين يكون التالي مجانياً وحده**. فجوجلُ الذي ردّ بصفر
 * يُتبَع بنداء Nominatim (مجاني، والمكسب تغطيةٌ مقيسة)، أما Nominatim الذي ردّ
 * بصفر فلا يُتبَع بنداء جوجل مدفوع: **صفرٌ مجانيٌّ لا يُنفق مالاً تلقائياً**.
 * ومن أراد تغطية جوجل يجعله الأساسي من اللوحة — لا أن يدفع عن كل استعلامٍ
 * فاشل عند المجاني.
 *
 * 🔴 **والفشل يبقى متميّزاً عن الفراغ حتى النهاية** — وهو ما تحمله قيمة
 * `answered` أدناه: إن أجاب مزوّدٌ واحد على الأقل ولم يجد أحدٌ شيئاً فذلك
 * `exhausted: true` («بحثنا ولم نجد»)؛ وإن **لم يُجب أحد** فذلك
 * `{ ok: false, code: "unavailable" }` («البحث متعطّل») — وهو المعنى المكتوب
 * لهذا الرمز في العقد حرفياً. ورسالة العميل في الحالتين ليست واحدة.
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

/**
 * 🔴 **هل يجوز النزول للتالي بعد صفر نتيجة؟** — الموضع الوحيد لهذا القرار.
 *
 * ⚠ ولا يُخلط بالنزول بعد **فشل**: ذاك غير مشروط ويقع في الحلقة أدناه، لأن
 * مزوّداً لم يجب لم يُعطِ جواباً أصلاً. أما الصفر فجوابٌ حقيقي، والنزول بعده
 * **شراءُ تغطيةٍ إضافية بثمن** — فيُشترط أن يكون الثمن صفراً.
 *
 * والقياس الذي يبرّر الشرط، لا الحدس: نداءُ Nominatim مجاني بلا سقف تعاقدي،
 * ونداءُ جوجل وحدةُ فوترة. فترتيب «جوجل ثم Nominatim» يعني أن كل استعلامٍ
 * لا يعرفه جوجل يكسب تغطية OSM بلا قرش؛ والعكس — «Nominatim ثم جوجل» — يعني
 * أن **كل** استعلامٍ لا يعرفه OSM يفتح فاتورة، وأكثرُ ما لا يعرفه OSM أخطاءُ
 * تهجئةٍ ونصوصٌ لا معنى لها. فالسقف عندها عددُ ما يكتبه الزوّار من هراء.
 */
function mayFallThroughOnEmpty(next: PlaceProvider): boolean {
  return next === "nominatim";
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

  const order = providerOrder(settings);
  /** أجاب مزوّدٌ واحد على الأقل جواباً حقيقياً (ولو بصفر) — لا مجرّد سقوط */
  let answered = false;

  for (let index = 0; index < order.length; index += 1) {
    const provider = order[index];
    const result = await askProvider(provider, query, options.sessionToken, options.locale);

    // ← لم يجب: ننزل للتالي **بلا شرط**. وهذا ليس جواباً فلا يُحتسب.
    if (result.status === "unavailable") continue;

    answered = true;

    if (result.suggestions.length > 0) {
      return { ok: true, provider, suggestions: result.suggestions, exhausted: false };
    }

    // 👇 موضع القاعدة المعدَّلة: صفرُ نتيجة **ينزل للتالي حين يكون مجانياً**.
    //    (كان هنا `break` مطلق يجعل الصفر نهائياً — نقضه المالك بقياسٍ مذكور
    //     في ترويسة هذا الملف، وأبقى شرط الاتجاه ضابطاً للفاتورة.)
    const next = order[index + 1];
    if (next === undefined || !mayFallThroughOnEmpty(next)) break;
  }

  // 🔴 هنا يفترق الحدثان اللذان كانا يخرجان من بابٍ واحد:
  //
  //   • **لم يُجب أحد** ⇒ البحث متعطّل، لا «لا نتائج». والرمز `unavailable`
  //     معناه في العقد حرفياً «كل المزوّدين سقطوا — لا نتيجة ولا حتى صفر نتيجة
  //     موثوقة»، فهذا موضعه الطبيعي وقد كان يُكتب ولا يُرسَل أبداً.
  //
  //   ⚠ والواجهة لا تخسر شيئاً بهذا: `place-field.tsx` يفتح مخارج الطبقتين ٣
  //     و٤ على كل ردٍّ غير `ok` (‏`setExhausted(json.ok ? json.exhausted : true)`)،
  //     فالعميل يبقى أمام الخريطة وطلب عرض السعر كما كان — والفرق أن الواجهة
  //     صار **بيدها** أن تقول «البحث متعطّل مؤقتاً» بدل «لا نتائج مطابقة»،
  //     وهما جملتان لا تصلح إحداهما مكان الأخرى.
  if (!answered) return { ok: false, code: "unavailable" };

  // • **أجابوا ولم يجدوا** ⇒ صفرٌ صادق: بحثنا في كل ما نملك ولا نعرف هذا المكان.
  return { ok: true, provider: null, suggestions: [], exhausted: true };
}

/**
 * تحويل اقتراحٍ إلى مكانٍ بإحداثيات — **وهو ما يُنهي جلسة فوترة جوجل**.
 *
 * 🔒 اقتراح Nominatim لا يمرّ من هنا أصلاً (يحمل إحداثياته)، فهذا المسار
 * لجوجل وحده عملياً؛ وبقاؤه عاماً يُبقي عقد الواجهة واحداً مهما تبدّل
 * المزوّد الأساسي.
 *
 * 🔴 **وثلاث حالات لا اثنتان منذ 2026-08-17**: أُضيفت `out-of-area` لأن هذا
 * المسار هو **البوابة التي تصير عندها نتيجةُ جوجل مكاناً قابلاً للحجز**، وهو
 * المسار الوحيد في المحرّك الذي **لا يمكن تقييده إقليمياً في الطلب**:
 * `places/{id}` يأخذ معرّفاً ولا يقبل قيد إقليمٍ ولا صندوق إحداثيات، و`ref`
 * يصل من المتصفح. التفصيل والقياس في ترويسة `googlePlaceDetails`.
 */
export type ResolveResult =
  | { status: "ok"; place: GeoPlace }
  | { status: "out-of-area" }
  | { status: "not-found" };

export async function resolveSuggestion(options: {
  ref: string;
  provider: PlaceProvider;
  sessionToken?: string;
  locale?: string;
  settings?: PlaceSearchSettings;
}): Promise<ResolveResult> {
  const settings = options.settings ?? (await readPlaceSearchSettings());

  // ⚠ حارسٌ لا زخرفة: `provider` يصل من المتصفح. ولولا هذا الفحص لأمكن لطلبٍ
  //   مصنوع أن يُنفق نداءَ تفاصيل جوجل والمالك مطفئٌ جوجل من لوحته.
  if (options.provider !== "google") return { status: "not-found" };
  if (!settings.googleEnabled || !hasGoogleKey()) return { status: "not-found" };

  return googlePlaceDetails(options.ref, options.sessionToken, googleLanguage(options.locale));
}
