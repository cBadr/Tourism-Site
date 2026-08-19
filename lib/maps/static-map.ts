import "server-only";

/**
 * مزوّد الخريطة الثابتة — الطبقة الوحيدة في المشروع التي تنادي خدمة خرائط
 * لتحصل على **صورة**. (وأختُها `lib/geo/route.ts` تنادي لتحصل على **مسافة**.)
 *
 * ── ولماذا `import "server-only"` أول سطر ────────────────────────────────────
 *
 * نفس سبب `lib/geo/route.ts:1`: المفتاح يُقرأ هنا، و«server-only» يمنع تسرّبه
 * إلى حزمة المتصفح **وقت البناء** لا وقت التشغيل. ولو بُنيت الصورة في العميل
 * لصار المفتاح في مصدر الصفحة، ولصار كل تحديثٍ للصفحة نداءً مدفوعاً جديداً.
 *
 * ── العقد: لا ترمي أبداً، وترجع `null` عند أي تعثّر ──────────────────────────
 *
 * مستهلكها الوحيد `lib/maps/route-map.ts`، وهو يعمل داخل تصيير صفحةٍ يفتحها
 * عميلٌ ليطمئن على حجزه. فانقطاعُ خدمة الخرائط يجب أن يعني **صفحةً بلا صورة**
 * لا صفحةَ خطأ — وهي روح D-48 نفسها مطبَّقةً خارج القاعدة.
 *
 * ── ولماذا صورة واحدة لكل حجز لا واحدة لكل جمهور ────────────────────────────
 *
 * الصورة تُقدَّم للعميل بعد التأكيد، وللمتعهد **بعد الإسناد وحده**. وصورتان
 * تعني ضِعف الكلفة على ميزةٍ كل قيدها كلفةٌ لكل صورة. والمتعهد بعد الإسناد
 * يقرأ أصلاً الوسم الخام بعنوانه الدقيق وهاتف العميل من `portal_trips()` —
 * فالصورة الكاملة داخل ما يملكه بالفعل، لا توسيعٌ له.
 */

/** إحداثيات نقطة — الحدّ الأدنى الذي تحتاجه الصورة */
export type MapPoint = { lat: number; lng: number };

/** بأيّ هندسةٍ رُسم الخط — مرآةٌ لقيد `check` في 0079 حرفاً بحرف */
export type RouteGeometrySource = "osrm" | "google" | "straight";

export type RouteGeometry = {
  /** خط مُرمَّز بصيغة Google Encoded Polyline (نفس صيغة OSRM بدقة ٥) */
  encoded: string;
  source: Exclude<RouteGeometrySource, "straight">;
};

export type StaticMapImage = {
  bytes: Uint8Array;
  contentType: string;
  width: number;
  height: number;
  provider: "google";
  geometrySource: RouteGeometrySource;
};

const GOOGLE_STATIC_MAP_URL = "https://maps.googleapis.com/maps/api/staticmap";
const OSRM_ROUTE_URL = "https://router.project-osrm.org/route/v1/driving";
const TIMEOUT_MS = 8000;

/**
 * مقاس الصورة المنطقي. و`scale=2` يضاعف البكسلات الفعلية (‏١٢٨٠×٧٢٠) بلا أن
 * يضاعف الكلفة — شاشة الهاتف عالية الكثافة، وصورةٌ ١×عليها تُقرأ ضبابية.
 */
const WIDTH = 640;
const HEIGHT = 360;
const SCALE = 2;

/** حدٌّ أعلى عاقل للاستجابة — صورةُ خريطةٍ ثابتة لا تتجاوزه بحال */
const MAX_BYTES = 3 * 1024 * 1024;

/**
 * سقف طول عنوان الخريطة. حدُّ Google الموثَّق ١٦٣٨٤ محرفاً، والسقف هنا دونه
 * بهامشٍ واسع: عنوانٌ يتجاوزه يُردّ ٤٠٣ فتضيع الصورة كلها — والتراجع إلى الخط
 * المستقيم **موسوماً** أهون من لا صورة. (و`overview=simplified` تُبقي الخط في
 * مئاتٍ من المحارف عملياً — قِيس ١٦٠ محرفاً على القاهرة ← الساحل الشمالي.)
 */
const MAX_URL_LENGTH = 8000;

function isFiniteCoord(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

/**
 * نقطةٌ صالحة للرسم؟
 *
 * ⚠ **الفحص على المدى لا على «الصدق»**: `0` إحداثيٌّ مشروع (خط الاستواء وخط
 * غرينتش)، فـ`if (!lat)` كان سيرفض نقطةً صحيحة. ولذلك `Number.isFinite` والمدى.
 */
export function isDrawablePoint(
  point: { lat: number | null | undefined; lng: number | null | undefined } | null | undefined
): point is MapPoint {
  if (!point) return false;
  return (
    isFiniteCoord(point.lat) &&
    isFiniteCoord(point.lng) &&
    point.lat >= -90 &&
    point.lat <= 90 &&
    point.lng >= -180 &&
    point.lng <= 180
  );
}

function coord(point: MapPoint): string {
  // ست منازل ≈ ١١ سم — أدقّ مما تحتاجه صورةٌ عرضها ٦٤٠ بكسلاً، وتُبقي الرابط قصيراً
  return `${point.lat.toFixed(6)},${point.lng.toFixed(6)}`;
}

/**
 * ══════════════════════════════════════════════════════════════════════════════
 *  هندسة الطريق — 🔴 **مسار القيادة الفعلي، لا الخط المستقيم**
 * ══════════════════════════════════════════════════════════════════════════════
 *
 * ملاحظة المالك (2026-08-17)، وهي أعمق من الشكل: **السعر مشتقٌّ من مسافة
 * طريق**، فخطٌّ مستقيم يعبر النيل أو الصحراء يرسم مسافةً غير التي سُعِّرت.
 *
 * ── الجرد قبل الإنفاق ───────────────────────────────────────────────────────
 *
 * سُئل أولاً: هل نملك الهندسة سلفاً؟ **لا.**
 *   • `lib/geo/route.ts` تطلب من Google `FieldMask` فيه `distanceMeters`
 *     و`duration` **فقط** — بلا `routes.polyline.encodedPolyline`.
 *   • ونداء OSRM فيها بـ`overview=false` — أي تُسقط الهندسة صراحةً.
 *   • و`distance_cache` بلا عمود هندسة (مقروءاً من `information_schema`).
 *
 * ⚠ وإضافةُ الخط إلى نفس نداء Google **مجّانية** (نفس الطلب ونفس الشريحة) وهي
 * التحسين الصحيح — لكن `lib/geo/**` **يعمل عليه وكيلٌ آخر في هذه الجلسة**،
 * فتُرفع توصيةً ولا تُنفَّذ بيدين على ملفٍّ واحد.
 *
 * ── فالمصدر هنا OSRM: صفرُ كلفة، وصفرُ نداءٍ مدفوعٍ جديد ────────────────────
 *
 * مجانيٌّ بلا مفتاح، وهو أصلاً طبقة التوجيه المجانية في هذا المشروع (D-13).
 * و`overview=simplified` صيغةُ عرضٍ مقصودة: تكفي لخطٍّ على صورةٍ عرضها ٦٤٠
 * بكسلاً وتُبقي العنوان قصيراً. والنداء **مرةً واحدة لكل حجز** كالصورة تماماً.
 *
 * ولا ترمي أبداً: `null` تعني «ارسم مستقيماً وقُل إنه تقريبي».
 */
export async function fetchRouteGeometry(
  origin: MapPoint,
  destination: MapPoint,
  stops: readonly MapPoint[] = []
): Promise<RouteGeometry | null> {
  if (!isDrawablePoint(origin) || !isDrawablePoint(destination)) return null;
  if (stops.some((stop) => !isDrawablePoint(stop))) return null;

  // ⚠ ترتيب OSRM هو `lng,lat` — معكوسٌ عن كل بقية المشروع.
  //
  // والمحطات إحداثياتٌ وسطى في **نفس** المسار مفصولةٌ بـ`;`، أي **نداءٌ واحد
  // للرحلة كلها** لا نداءٌ لكل رجل. وهذا يخالف `lib/geo/route.ts` عمداً: ذاك
  // يقيس **رجلاً رجلاً** ليكيّش كل رجلٍ على حدة ويجمع الأطوال، ونحن نريد
  // **هندسةً متصلة** لخطٍّ واحد يُرسم — ورجلان مقيستان منفصلتين تعطيان خطين
  // لا خطاً. والكلفة صفرٌ في الحالتين (OSRM مجاني بلا مفتاح).
  const path = [origin, ...stops, destination]
    .map((point) => `${point.lng},${point.lat}`)
    .join(";");
  try {
    const res = await fetch(`${OSRM_ROUTE_URL}/${path}?overview=simplified&geometries=polyline`, {
      signal: AbortSignal.timeout(TIMEOUT_MS),
      cache: "no-store",
    });
    if (!res.ok) return null;

    const body = (await res.json()) as {
      code?: string;
      routes?: { geometry?: unknown }[];
    };
    if (body.code !== "Ok") return null;

    const geometry = body.routes?.[0]?.geometry;
    if (typeof geometry !== "string" || geometry.trim().length === 0) return null;

    return { encoded: geometry, source: "osrm" };
  } catch {
    return null;
  }
}

/**
 * صورة خريطة ثابتة لمسار الرحلة: من المنطلق، **مارّاً بالمحطات في ترتيبها**،
 * إلى الوجهة. ورحلةُ النقطتين (`stops` فارغة) تُنتج العنوانَ نفسه حرفاً.
 *
 * ⚠ **بلا `center` ولا `zoom` عمداً**: تركُهما يجعل الخدمة تحسب الإطار الذي
 * يسع العلامتين والخط معاً. وحسابُهما هنا كان سيعني معادلة إطارٍ ثانية في
 * TypeScript تنحرف عن الأولى — ورحلةً قصيرة تخرج من الكادر أو طويلة تصير نقطة.
 *
 * ⚠ **وبلا `label:A` و`label:B`** (ملاحظة المالك ١): وسم العلامة في هذه الواجهة
 * **محرفٌ لاتيني واحد أو رقم** — لا يقبل «نقطة الانطلاق» بحال. فالتفريق باللون،
 * و**الأسماء العربية تُكتب في مفتاح الخريطة تحت الصورة** حيث تُقرأ فعلاً
 * وتصل قارئ الشاشة — لا حرفاً أعجمياً لا يقول للعميل العربي شيئاً.
 *
 * ══ 🔴 والمحطاتُ الوسطى تُرقَّم — والرقمُ هو الاستثناء من القاعدة أعلاه ══════
 *
 * الطرفان لا وسمَ لهما لأن اللونَ يكفي لتمييز اثنين. أما المحطاتُ فثلاثٌ بلونٍ
 * واحد، **ومحطةٌ بلا رقمٍ لا تقول للسائق أيُّها أولاً** — وهو بعينه ما تُحلّه
 * هذه الميزة. والرقمُ ١..٩ محرفٌ واحد تقبله الواجهة، ولا يحتاج ترجمةً: الرقمُ
 * اللاتينيّ يُقرأ على كل خريطة. والاسمُ العربيُّ يبقى في مفتاح الخريطة تحتها
 * مقابلَ رقمه.
 */
export async function fetchStaticRouteMap(
  origin: MapPoint,
  destination: MapPoint,
  stops: readonly MapPoint[] = []
): Promise<StaticMapImage | null> {
  const apiKey = process.env.GOOGLE_MAPS_API_KEY;
  if (!apiKey) return null;
  if (!isDrawablePoint(origin) || !isDrawablePoint(destination)) return null;
  // محطةٌ لا تصلح للرسم ⇒ لا صورة. ورسمُ الباقي كان سيُنتج **مساراً أقصر من
  // المُسعَّر** مرسوماً بثقة — وهو العطل الذي وُجدت الميزة لتفاديه.
  if (stops.some((stop) => !isDrawablePoint(stop))) return null;

  const geometry = await fetchRouteGeometry(origin, destination, stops);

  const build = (source: RouteGeometrySource): URL => {
    const url = new URL(GOOGLE_STATIC_MAP_URL);
    url.searchParams.set("size", `${WIDTH}x${HEIGHT}`);
    url.searchParams.set("scale", String(SCALE));
    url.searchParams.set("maptype", "roadmap");
    url.searchParams.set("format", "png");
    // أسماءُ الأماكن على الصورة بالعربية — والصورة **واحدة لكل حجز** فلا تتبع
    // لغة الزائر. ولغة الموقع الأصل عربية (الاتفاقية ١)، والنصّ البديل ومفتاح
    // الخريطة يُترجَمان وقت العرض فيصل الزائرَ الإنجليزي وصفُ الصورة بلغته.
    url.searchParams.set("language", "ar");
    url.searchParams.append("markers", `color:0x2563eb|${coord(origin)}`);
    // ⚠ **بعد المنطلق وقبل الوجهة** — لا لترتيبٍ تفرضه الواجهة (لا تفرضه)، بل
    //    ليقرأ الإنسانُ العنوانَ في سجلٍّ أو أثرٍ بترتيب القيادة نفسه.
    stops.forEach((stop, index) => {
      const number = index + 1;
      // وسمُ العلامة محرفٌ **واحد**: ١..٩ وحدها تُرقَّم. وما بعدها — وهو غيرُ
      // بالغٍ بنيوياً (`MAX_TRIP_STOPS` = ٥) — يُرسم بلا رقمٍ ولا يُسقَط:
      // نقطةٌ بلا رقمٍ أفضلُ من مسارٍ ناقصِ نقطة.
      const label = number <= 9 ? `label:${number}|` : "";
      url.searchParams.append("markers", `color:0xd97706|${label}${coord(stop)}`);
    });
    url.searchParams.append("markers", `color:0x16a34a|${coord(destination)}`);
    url.searchParams.append(
      "path",
      source === "straight" || !geometry
        ? // 🔴 التراجعُ **يمرّ بالمحطات أيضاً**: خطٌّ مكسورٌ منطلق←محطات←وجهة.
          //    وقفزُه فوقها كان سيرسم طريقاً لا يمرّ بما دفع العميل ثمنه — أي
          //    نفس العطل في ثوب «تقريبيّ».
          `color:0x2563ebcc|weight:5|${[origin, ...stops, destination].map(coord).join("|")}`
        : `color:0x2563ebcc|weight:5|enc:${geometry.encoded}`
    );
    url.searchParams.set("key", apiKey);
    return url;
  };

  // خطٌّ طويلٌ جداً ⇒ عنوانٌ يُردّ ٤٠٣ فتضيع الصورة كلها. والتراجع إلى المستقيم
  // **موسوماً** أهون من لا صورة — والوسم هو ما يجعله صادقاً (0079).
  let source: RouteGeometrySource = geometry ? geometry.source : "straight";
  let url = build(source);
  if (source !== "straight" && url.toString().length > MAX_URL_LENGTH) {
    source = "straight";
    url = build(source);
  }

  try {
    const res = await fetch(url, {
      signal: AbortSignal.timeout(TIMEOUT_MS),
      cache: "no-store",
    });
    if (!res.ok) return null;

    const contentType = res.headers.get("content-type") ?? "";
    // الخدمة ترد بنصّ خطأ برمز ٢٠٠ في بعض الحالات — فالنوع هو الفحص لا الرمز
    if (!contentType.startsWith("image/")) return null;

    const buffer = await res.arrayBuffer();
    if (buffer.byteLength === 0 || buffer.byteLength > MAX_BYTES) return null;

    return {
      bytes: new Uint8Array(buffer),
      contentType,
      width: WIDTH * SCALE,
      height: HEIGHT * SCALE,
      provider: "google",
      geometrySource: source,
    };
  } catch {
    // انقطاعُ شبكة، أو مهلة، أو مفتاحٌ بلا الواجهة المفعّلة — كلها «لا صورة»
    return null;
  }
}

/** هل المزوّد مُهيَّأ أصلاً؟ يُسأل قبل أي عمل كي لا نُشغّل مساراً لا ينتهي بشيء */
export function staticMapConfigured(): boolean {
  return (
    typeof process.env.GOOGLE_MAPS_API_KEY === "string" &&
    process.env.GOOGLE_MAPS_API_KEY.trim().length > 0
  );
}
