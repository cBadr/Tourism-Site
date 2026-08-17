import "server-only";

import type { GeoPlace } from "@/lib/pricing-types";
import type { PlaceSuggestion } from "@/lib/place-search-types";
import { isSessionToken } from "@/lib/place-search-types";

/**
 * محوّل Google Places API (New) — الطبقة الأولى في بحث الأماكن.
 *
 * `import "server-only"` إلزامي: هذا الملف يقرأ `GOOGLE_MAPS_API_KEY`، والسطر
 * يمنع تسرّبه إلى حزمة المتصفح **وقت البناء** لا وقت التشغيل (اتفاقية §٩).
 *
 * ══════════════════════════════════════════════════════════════════════════
 *  🔴 ولا يُكتب من جوجل شيءٌ في `geocode_cache` — ولا سطر
 * ══════════════════════════════════════════════════════════════════════════
 *
 * `geocode_cache` يكاش Nominatim بلا حرج لأن بيانات OSM مفتوحة. أما شروط
 * جوجل فمقيِّدة، وهذا ما قرأناه فيها (سياسات Places API + شروط منصة الخرائط):
 *
 *   • **`place_id` مستثنى صراحةً** من قيود الكاش، ويجوز تخزينه **بلا أجل**.
 *   • **خطا الطول والعرض** يجوز كاشُهما **مؤقتاً**، والمدة المعلَنة **٣٠ يوماً
 *     تقويمياً متصلاً** ثم تُحذف.
 *   • **وما عدا ذلك من محتوى Places لا يُسبق جلبه ولا يُكاش ولا يُخزَّن.**
 *
 * والوسم المقروء — اسم المكان وعنوانه — هو **بالضبط** ما يقع في «ما عدا ذلك».
 * وهو في قائمة الإكمال التلقائي **الحمولة كلها**: كاشٌ يحمل `place_id`
 * وإحداثيات بلا وسمٍ لا يخدم سطراً واحداً على الشاشة. فالمكسب صفر والمخاطرة
 * مخالفةُ ترخيص **مدفونة في جدولٍ ننساه**.
 *
 * 🔒 **فالقرار: صفر كتابة من جوجل إلى أي جدول.** وكاش Nominatim يبقى كما هو
 * حرفاً بحرف (‏`lib/geo/geocode.ts` لم يُمسّ).
 *
 * ⚠ ويمتد القرار إلى الـCDN: مسار الاقتراحات `POST` وبترويسة `no-store` —
 * كاشٌ مشترك على الحافة تخزينٌ كذلك، ولا يقلّ عن جدول.
 *
 * وما يُخزَّن فعلاً من رحلة العميل هو ما اختاره هو لحجزه: الإحداثيات ووسمٌ
 * صار جزءاً من عقده معنا. وهذا استعمالٌ للبيانات في معاملة العميل نفسها، لا
 * بناءُ نسخةٍ من قاعدة جوجل لخدمة زائرين آخرين — والفرق بينهما هو الفرق بين
 * الاستعمال والاستنساخ.
 *
 * ⚠ ولو تغيّرت الشروط: موضع القرار **هذا التعليق وحده**، ولا يوجد في الملف
 * أي مسار كتابة يُفعَّل بتبديل راية. إضافةُ الكاش عملٌ واعٍ لا مفتاح.
 */

const AUTOCOMPLETE_URL = "https://places.googleapis.com/v1/places:autocomplete";
const DETAILS_URL = "https://places.googleapis.com/v1/places";
const TIMEOUT_MS = 6000;
const MAX_RESULTS = 5;
/** كل بحثنا داخل مصر — نفس قيد Nominatim حرفياً */
const REGION_CODES = ["eg"];

/**
 * FieldMask إلزامي عند جوجل، **وهو ضابط تكلفة لا تحسيناً**: الحقول المطلوبة
 * تحدّد فئة الفوترة. نطلب المعرّف والنصّين وحدها — ولا `types` ولا
 * `distanceMeters` ولا شيء لا يُرسم على الشاشة.
 */
const AUTOCOMPLETE_FIELDS = [
  "suggestions.placePrediction.placeId",
  "suggestions.placePrediction.text.text",
  "suggestions.placePrediction.structuredFormat.mainText.text",
  "suggestions.placePrediction.structuredFormat.secondaryText.text",
].join(",");

/** تفاصيل المكان المختار — الإحداثيات هي المقصد، والوسم للعرض */
const DETAILS_FIELDS = ["id", "displayName", "formattedAddress", "location"].join(",");

/**
 * نتيجة نداء جوجل — **ثلاث حالات لا اثنتان**.
 *
 * التمييز بين `ok` بصفر نتيجة وبين `unavailable` هو قلب قاعدة الارتداد:
 *   • `unavailable` (مفتاح مفقود · حصّة · شبكة · جسم فاسد) ⇒ ننزل لـ Nominatim.
 *   • `ok` بصفر نتيجة ⇒ **ليست فشلاً**، ولا ننزل لمزوّدٍ ثانٍ: نذهب مباشرةً
 *     إلى الخريطة. (أمر المالك صراحةً.)
 */
export type GoogleSuggestResult =
  | { status: "ok"; suggestions: PlaceSuggestion[] }
  | { status: "unavailable" };

/** المفتاح حاضر في البيئة؟ — تُقرأ من اللوحة للعرض فقط، ولا تكشف القيمة أبداً */
export function hasGoogleKey(): boolean {
  return Boolean(process.env.GOOGLE_MAPS_API_KEY);
}

/**
 * 🔴 رمز الجلسة — يُفحص قبل الإرسال، ويُسقَط عند الشك.
 *
 * مقيسٌ على واجهة جوجل الحيّة: رمزٌ خارج base64 الآمن للروابط يردّ
 * **`HTTP 400 — session_token: must be a URL and filename safe base64 string`**.
 * والرمز يصل من المتصفح، فلو مُرِّر كما هو لكان **كل** نداء جوجل يفشل بـ٤٠٠،
 * وينزل المحرّك إلى Nominatim دائماً — ميزةٌ ميتة بلا شكوى في أي سجل.
 *
 * فالمقايضة محسومة: الرمز الفاسد **يُحذف** ويمضي النداء بلا جلسة. النتيجة
 * فوترةٌ بالطلب بدل الجلسة لذلك الطلب وحده — **أغلى، لا معطَّل**.
 */
function sessionField(token: string | undefined): { sessionToken?: string } {
  return isSessionToken(token) ? { sessionToken: token } : {};
}

type AutocompleteBody = {
  suggestions?: {
    placePrediction?: {
      placeId?: string;
      text?: { text?: string };
      structuredFormat?: {
        mainText?: { text?: string };
        secondaryText?: { text?: string };
      };
    };
  }[];
};

/**
 * الإكمال التلقائي. **لا يرمي أبداً** — كل فشلٍ خارجي يصير `unavailable`.
 *
 * ⚠ وردّ ٢٠٠ بجسمٍ فارغ `{}` هو **صفر نتيجة** لا جسمٌ فاسد — وهذا شكل جوجل
 * الفعلي حين لا يجد شيئاً (مقيس: «كمبوند مدينتي» ⇒ `200 {}`). واعتبارُه فساداً
 * كان سينزل بنا إلى Nominatim في كل بحثٍ لا نتيجة له، أي **نداءٌ زائد على كل
 * استعلامٍ فاشل** — وهو ما تمنعه القاعدة نصّاً.
 */
export async function googleAutocomplete(
  input: string,
  sessionToken: string | undefined,
  languageCode: string
): Promise<GoogleSuggestResult> {
  const apiKey = process.env.GOOGLE_MAPS_API_KEY;
  if (!apiKey) return { status: "unavailable" };

  let body: AutocompleteBody;
  try {
    const res = await fetch(AUTOCOMPLETE_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Goog-Api-Key": apiKey,
        "X-Goog-FieldMask": AUTOCOMPLETE_FIELDS,
      },
      body: JSON.stringify({
        input,
        languageCode,
        includedRegionCodes: REGION_CODES,
        ...sessionField(sessionToken),
      }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
      cache: "no-store",
    });
    // ٤٢٩ (حصّة) و٤٠٣ (مفتاح مرفوض) و5xx كلها «المزوّد لم يجب» ⇒ ارتداد
    if (!res.ok) return { status: "unavailable" };
    body = (await res.json()) as AutocompleteBody;
  } catch {
    // شبكة أو مهلة أو JSON فاسد
    return { status: "unavailable" };
  }

  if (body === null || typeof body !== "object") return { status: "unavailable" };
  // الغياب = صفر نتيجة (الشكل الحقيقي `{}`)؛ والحضور بنوعٍ خاطئ = جسم فاسد
  if (body.suggestions !== undefined && !Array.isArray(body.suggestions)) {
    return { status: "unavailable" };
  }

  const suggestions: PlaceSuggestion[] = [];
  const seen = new Set<string>();
  for (const item of body.suggestions ?? []) {
    const prediction = item?.placePrediction;
    const ref = prediction?.placeId;
    if (!ref || seen.has(ref)) continue;

    const main = prediction.structuredFormat?.mainText?.text?.trim();
    const secondary = prediction.structuredFormat?.secondaryText?.text?.trim();
    const full = prediction.text?.text?.trim();
    const label = main || full;
    if (!label) continue;

    seen.add(ref);
    suggestions.push({
      ref,
      provider: "google",
      label,
      // السطر الثاني يُعرض رمادياً؛ وغيابه لا يمنع الاقتراح
      ...(secondary ? { secondary } : {}),
      // 🔒 بلا `place`: الإحداثيات لا تأتي مع الاقتراح أصلاً، وطلبها لكل سطر
      //    يعني فاتورة تفاصيل لكل ما يراه العميل ولا يختاره.
    });
    if (suggestions.length >= MAX_RESULTS) break;
  }

  return { status: "ok", suggestions };
}

type DetailsBody = {
  id?: string;
  displayName?: { text?: string };
  formattedAddress?: string;
  location?: { latitude?: number; longitude?: number };
};

/**
 * اختصار عنوان جوجل الكامل إلى وسمٍ مقروء — **نفس قاعدة `toLabel` في
 * `geocode.ts`** حتى لا يختلف شكل السطر باختلاف المزوّد: ثلاثة مقاطع، بلا
 * رمزٍ بريدي وبلا اسم الدولة (كل نتائجنا داخل مصر أصلاً).
 */
function googleLabel(displayName: string | undefined, formattedAddress: string | undefined): string {
  const parts = (formattedAddress ?? "")
    .split(/[,،]/)
    .map((p) => p.trim())
    .filter((p) => p.length > 0 && !/^\d{4,}$/.test(p));

  const last = parts[parts.length - 1];
  if (parts.length > 1 && (last === "مصر" || last?.toLowerCase() === "egypt")) parts.pop();

  const name = displayName?.trim();
  // الاسم يتصدّر الوسم ما لم يكن العنوان يبدأ به أصلاً (فلا يتكرر)
  if (name && parts[0] !== name) parts.unshift(name);

  return parts.slice(0, 3).join("، ") || name || "";
}

/**
 * تفاصيل المكان المختار — **وهذا النداء هو ما يُنهي جلسة الفوترة**.
 *
 * فالترتيب الذي يجعل «القاهرة» فاتورةً واحدة: سبعة نداءات إكمال بنفس الرمز،
 * ثم هذا النداء بنفس الرمز — تُغلق الجلسة، ويتلف العميل الرمز.
 *
 * لا يرمي أبداً: `null` تعني «تعذّر التحويل»، وتترجمها طبقة المسار إلى رمز.
 */
export async function googlePlaceDetails(
  placeId: string,
  sessionToken: string | undefined,
  languageCode: string
): Promise<GeoPlace | null> {
  const apiKey = process.env.GOOGLE_MAPS_API_KEY;
  if (!apiKey) return null;

  const params = new URLSearchParams({ languageCode });
  // ⚠ الرمز هنا وسيط استعلام لا حقل جسم — والتفاصيل نداء GET
  if (isSessionToken(sessionToken)) params.set("sessionToken", sessionToken);

  let body: DetailsBody;
  try {
    const res = await fetch(
      `${DETAILS_URL}/${encodeURIComponent(placeId)}?${params.toString()}`,
      {
        headers: { "X-Goog-Api-Key": apiKey, "X-Goog-FieldMask": DETAILS_FIELDS },
        signal: AbortSignal.timeout(TIMEOUT_MS),
        cache: "no-store",
      }
    );
    if (!res.ok) return null;
    body = (await res.json()) as DetailsBody;
  } catch {
    return null;
  }

  const lat = Number(body?.location?.latitude);
  const lng = Number(body?.location?.longitude);
  // 🔒 بلا إحداثيات لا مكان: النص وحده لا يُسعَّر (D-09)
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;

  const label = googleLabel(body.displayName?.text, body.formattedAddress);
  if (!label) return null;

  return {
    label,
    lat,
    lng,
    // `place_id` وحده مما ترجعه جوجل يجوز الاحتفاظ به بلا أجل — وهو المعرّف
    // الذي يسافر مع لقطة الرحلة، فيبقى الحجز قابلاً للتفسير لاحقاً.
    ref: body.id ?? placeId,
  };
}
