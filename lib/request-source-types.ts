/**
 * ╔══════════════════════════════════════════════════════════════════════════╗
 * ║  عقد «مصدر الطلب» — من أين جاء طلب عرض السعر (هجرة 0127)                ║
 * ╚══════════════════════════════════════════════════════════════════════════╝
 *
 * بدر يريد أن يعرف عن كل طلب: **أيّ صفحةٍ أرسلته، ومن أيّ حملةٍ أو رابط.**
 * وهذا الملف عقد ذلك السؤال بين ثلاث طبقات: جزيرة النموذج ← مسار `/api` ←
 * `create_quote_request`.
 *
 * ══════════════════════════════════════════════════════════════════════════
 *  🔴 ضفّتان لا ضفّةٌ واحدة — وهذا أهمّ سطرٍ في الملف
 * ══════════════════════════════════════════════════════════════════════════
 *
 * | الحقل | من أين | الثقة |
 * |---|---|---|
 * | `page` | مسارٌ داخليّ على موقعنا | **يُطابَق في القاعدة بقائمةٍ مغلقة** من `pages` و`reserved_slugs` — فأسوأ ما يفعله كاذبٌ أن ينسب طلبه إلى صفحةٍ **من صفحاتنا** |
 * | `referrer` | مضيف المُحيل الخارجي | **مدخلُ مستخدم** |
 * | `utm*` | وسومٌ يكتبها الزائر في الرابط | **مدخلُ مستخدم** |
 *
 * 🔒 **والحارس ليس هنا.** الدوال في هذا الملف **قصٌّ مبكر** يوفّر رحلةَ شبكة
 * ويجعل ما يُرسَل معقولاً. الحاجز الحقيقي ثلاث طبقاتٍ في Postgres:
 * `quote_source_tag` / `quote_source_host` / `quote_source_page`، ومُشغّلٌ
 * يطبّقها على **كل** كاتب، وقيودُ شكلٍ ثابتة خلفهما. ولو حُذف هذا الملف كله لما
 * دخل الجدولَ محرفٌ واحد لم تُطهّره القاعدة.
 *
 * ولماذا يوجد إذن؟ لسببين: ألّا يُرسَل خمسة آلاف حرفٍ في جسم طلبٍ لتُقصّ عند
 * الوصول، **وألّا يُبنى في الواجهة اجتهادٌ ثانٍ** في «ما هو المسار الداخلي» —
 * فالقواعد مكتوبةٌ هنا مرةً واحدة يقرؤها الخادم والعميل معاً.
 *
 * ⚠ **وحدٌّ مُعلَن على `page`:** يُقرأ من `document.referrer`، وهو **مرجع
 *   المستند المُحمَّل** لا آخر مسارٍ في تنقّلٍ ليّن (`<Link>`). وكل روابط
 *   `/quote-request` القائمة اليوم `<a href>` تُحدث تنقّلاً كاملاً (شبكة
 *   الخدمات، وبطاقة الإنقاذ في الحاسبة، وحقلا البحث) فتصل صحيحة. لكن رابطاً
 *   يُضاف غداً بـ`<Link>` سيُسجَّل بمرجع الصفحة التي حُمِّلت أصلاً لا بالتي
 *   نُقر منها. **الغياب هنا يقول «لا أعرف» لا «مباشر»** — والقاعدة تُخزّن `null`.
 *
 * 🔒 **والخصوصية**: هذه بياناتٌ عن الزائر. المُحيل يُقصّ إلى **مضيفٍ** لا عنوان
 *   كامل (عنوانُ مُحيلٍ كامل قد يحمل في استعلامه بريدَ زائرٍ أو معرّف جلسته)،
 *   ولا شيء منها يدخل حمولةً تصل عميلاً أو متعهداً — لا في الإشعارات ولا في
 *   لقطة الحجز (D-19 · D-20، والشاهد في `supabase/tests/request_source_tests.sql` (و)).
 */

/** ما يُرسَل في جسم `POST /api/quote-request` تحت المفتاح `source` */
export type RequestSourceInput = {
  /** مسارٌ داخليّ على موقعنا — تُطابقه القاعدة بقائمتها المغلقة */
  page?: string | null;
  /** مضيف المُحيل الخارجي وحده — بلا مخطَّط ولا مسار ولا استعلام */
  referrer?: string | null;
  utmSource?: string | null;
  utmMedium?: string | null;
  utmCampaign?: string | null;
};

/** الشكل المُطبَّع الذي يعبر إلى `create_quote_request` — `null` = غير معروف */
export type RequestSource = {
  page: string | null;
  referrer: string | null;
  utmSource: string | null;
  utmMedium: string | null;
  utmCampaign: string | null;
};

export const EMPTY_REQUEST_SOURCE: RequestSource = {
  page: null,
  referrer: null,
  utmSource: null,
  utmMedium: null,
  utmCampaign: null,
};

/** أسماء معاملات الحملة في الرابط — الثلاثة المتعارف عليها ولا رابع */
export const CAMPAIGN_PARAM_KEYS = ["utm_source", "utm_medium", "utm_campaign"] as const;

/** سقف الوسم — **نفس ٦٤ في `quote_source_tag`**، ومصدرٌ واحد لا مصدران */
export const MAX_SOURCE_TAG_LENGTH = 64;
/** سقف المضيف — نفس ١٠٠ في `quote_source_host` */
export const MAX_SOURCE_HOST_LENGTH = 100;
/** سقف المسار — نفس ٨٠ في قيد `quote_requests_source_page_shape_chk` */
export const MAX_SOURCE_PATH_LENGTH = 80;

/**
 * قائمة السماح المحرفية للوسم — **مرآةُ** التعبير في `quote_source_tag`:
 * لاتينيّ · رقم · عربيّ (`U+0600..U+06FF`، وفيها الأرقام الهندية) · مسافة ·
 * `.` `_` `-`. وكلُّ ما عداها يسقط، وفيه محارفُ التحكم ومحارفُ توجيه الكتابة
 * (`U+200E/200F`, `U+202A..202E`, `U+2066..2069`) — وهي أخطرها في واجهة RTL:
 * محرفٌ واحد غير مرئي يقلب اتجاه ما بعده فتبدو شاشة المالك معطوبة.
 */
/**
 * ⚠ والمديات بـ`\uXXXX` لا بمحارفَ حرفية — في **الملفّين**: كتابة
 * `[^a-z0-9 ._-؀-ۿ]` تجعل `_-؀` مدىً من `U+005F` إلى `U+0600` فتفتح قائمة
 * السماح على آلاف المحارف. حارسٌ يبدو قائماً وهو ساقط، ولا اختبارَ عينٍ يكشفه.
 *
 * 🔴 **والمدى العربي مقسومٌ عمداً لا `U+0600..U+06FF` كاملاً** (‏`0129`): في ذلك
 * المدى ثمانيةُ محارفٍ من فئة `Cf` — تنسيقٌ **غير مرئيّ** — هي `U+0600..U+0605`
 * و`U+061C` و`U+06DD`. و`U+061C` (ARABIC LETTER MARK) محرفُ اتجاهٍ قويّ تماماً
 * كـ`U+200F`، فكان يسقط أخوه ويبقى هو، فتبدو الحراسة قائمةً وهي مثقوبة.
 *
 * والضررُ المقيس ليس تشويهَ الاتجاه وحده بل **كذبُ التجميع**: الوسمُ مفتاحُ
 * `group by` في `quote_request_sources()`، فوسمان يُقرآن `ramadan` ويفترق أحدهما
 * بمحرفٍ لا يُرى يخرجان حبّتين متطابقتَي المنظر، كلٌّ بنصف العدد. و`dir="ltr"`
 * في اللوحة لا يعالجه: يعزل القيمة عمّا حولها ولا ينزع محرفاً من داخلها.
 */
const TAG_DISALLOWED = /[^a-z0-9 ._\u002D\u0606-\u061B\u061D-\u06DC\u06DE-\u06FF]/g;
const TAG_SEPARATOR_RUN = /[ ._-]{2,}/g;
const TAG_EDGE = /^[ ._-]+|[ ._-]+$/g;

/** يُطبّع وسم حملةٍ كما تفعل `quote_source_tag` — ويعيد `null` لما لا يبقى منه شيء */
export function normalizeSourceTag(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const cleaned = raw
    .slice(0, 512)
    .toLowerCase()
    .replace(TAG_DISALLOWED, "")
    .replace(TAG_SEPARATOR_RUN, "-")
    .replace(TAG_EDGE, "")
    .slice(0, MAX_SOURCE_TAG_LENGTH)
    .replace(TAG_EDGE, "");
  return cleaned.length === 0 ? null : cleaned;
}

/** اسمُ مضيفٍ خالص، أو `null`. ولا يُقبل عنوانٌ كامل — يُرفض ولا يُقصّ */
const HOST_SHAPE = /^[a-z0-9]([a-z0-9.-]{0,253}[a-z0-9])?$/;

export function normalizeSourceHost(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const lowered = raw.trim().slice(0, 256).toLowerCase();
  if (!HOST_SHAPE.test(lowered)) return null;
  const stripped = lowered
    .replace(/^www\./, "")
    .slice(0, MAX_SOURCE_HOST_LENGTH)
    .replace(/[^a-z0-9]+$/, "");
  return stripped.length === 0 ? null : stripped;
}

/**
 * شكلُ المسار الداخلي — **الشكل وحده**. والعضويةُ في قائمة صفحاتنا تُقرَّر في
 * `quote_source_page` داخل القاعدة، لأنها وحدها تعرف صفوف `pages`.
 * وبادئة اللغة تُنزع هنا وهناك (D-24): `/en/business` و`/business` صفحةٌ واحدة.
 */
const PATH_SHAPE = /^\/[a-z0-9/_-]*$/;

export function normalizeSourcePath(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  let path = raw.trim().slice(0, 200).toLowerCase();
  if (path.length === 0) return null;

  path = path.split("?")[0].split("#")[0];
  if (!PATH_SHAPE.test(path)) return null;

  path = path.replace(/^\/(en|ar)(\/|$)/, "/");
  if (path !== "/") path = path.replace(/\/+$/, "");
  if (path.length === 0) path = "/";

  return path.length > MAX_SOURCE_PATH_LENGTH ? null : path;
}

/**
 * يقسم `document.referrer` إلى ضفّتيه بحسب الأصل.
 *
 * 🔒 والقسمة بالأصل لا بالنصّ: مُحيلٌ من `oursite.example` يُسجَّل **مساراً**،
 * ومن أي أصلٍ آخر يُسجَّل **مضيفاً وحده**. ولا يُخلط بينهما أبداً — لأن الأول
 * تُطابقه القاعدة بقائمتها والثاني لا يُطابَق بشيء.
 */
export function splitReferrer(
  referrer: string | null | undefined,
  currentOrigin: string
): { page: string | null; referrer: string | null } {
  if (!referrer) return { page: null, referrer: null };
  let url: URL;
  try {
    url = new URL(referrer);
  } catch {
    return { page: null, referrer: null };
  }
  if (url.origin === currentOrigin) {
    return { page: normalizeSourcePath(url.pathname), referrer: null };
  }
  return { page: null, referrer: normalizeSourceHost(url.hostname) };
}

/** يُطبّع حمولة المصدر كاملةً — يُستعمل في المسار الخادميّ قبل نداء القاعدة */
export function normalizeRequestSource(input: unknown): RequestSource {
  if (typeof input !== "object" || input === null || Array.isArray(input)) {
    return EMPTY_REQUEST_SOURCE;
  }
  const raw = input as Record<string, unknown>;
  return {
    page: normalizeSourcePath(raw.page),
    referrer: normalizeSourceHost(raw.referrer),
    utmSource: normalizeSourceTag(raw.utmSource),
    utmMedium: normalizeSourceTag(raw.utmMedium),
    utmCampaign: normalizeSourceTag(raw.utmCampaign),
  };
}

/** هل في الحمولة ما يستحق الإرسال أصلاً؟ (تجنّب مفاتيح `null` في كل جسم طلب) */
export function hasRequestSource(source: RequestSource): boolean {
  return Boolean(
    source.page || source.referrer || source.utmSource || source.utmMedium || source.utmCampaign
  );
}
