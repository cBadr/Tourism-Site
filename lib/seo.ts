import type { Metadata } from "next";
import { getSettings } from "@/lib/settings";
import type { SiteSettings } from "@/lib/site-config";
import type { PageMeta } from "@/lib/content-types";
import {
  DEFAULT_LOCALE,
  isRoutingLocale,
  localeOg,
  localePath,
  type LocaleDef,
} from "@/i18n/config";
import { getEnabledLocales } from "@/i18n/locales";
import { getActiveLocale } from "@/i18n/server";

/**
 * أدوات السيو المركزية — كل صفحة تبني بياناتها الوصفية من هنا
 * حتى تبقى الروابط القانونية (canonical) وبطاقات Open Graph متسقة عبر الموقع.
 *
 * ── اللغات (المرحلة ٨) ──────────────────────────────────────────────────────
 * `path` يبقى دائماً **المسار العربي الأصيل** كما تكتبه الصفحة: `/book`،
 * `/services/x`. البادئة تُركَّب هنا لا في الصفحات — فلا صفحة تعرف شيئاً عن
 * `/en` ولا رابط عربي تغيّر (القاعدة ١).
 *
 * لكل صفحة رابط قانوني بلغتها، ومعه `alternates.languages` يعلن أخواتها بكل
 * لغة مفعّلة + `x-default` يشير إلى العربية. هذا ما يجعل جوجل يعرض للباحث
 * بالإنجليزية نسخته الإنجليزية بدل أن يعدّ النسختين محتوى مكرراً.
 */

/** عنوان الموقع الأساسي: SITE_URL ثم VERCEL_URL ثم localhost — بدون شرطة مائلة في النهاية */
export function getBaseUrl(): string {
  if (process.env.SITE_URL) {
    return process.env.SITE_URL.replace(/\/+$/, "");
  }
  if (process.env.VERCEL_URL) {
    return `https://${process.env.VERCEL_URL.replace(/\/+$/, "")}`;
  }
  return "http://localhost:3000";
}

/** رابط مطلق من مسار — الجذر يبقى بلا شرطة مائلة زائدة */
export function absoluteUrl(path: string): string {
  const base = getBaseUrl();
  return !path || path === "/" ? base : `${base}${path}`;
}

/** الرابط المطلق لصفحة بلغة بعينها */
export function localeUrl(locale: string, path: string): string {
  return absoluteUrl(localePath(locale, path));
}

/**
 * خريطة hreflang لصفحة واحدة: كل لغة مفعّلة + `x-default` على العربية.
 * صيغة نقية تأخذ اللغات جاهزة — تستعملها خريطة الموقع لكل صفحة بلا قراءة مكررة.
 */
export function languageAlternates(
  locales: readonly LocaleDef[],
  path: string
): Record<string, string> {
  const languages: Record<string, string> = {};
  for (const locale of locales) {
    languages[locale.htmlLang] = localeUrl(locale.code, path);
  }
  languages["x-default"] = localeUrl(DEFAULT_LOCALE, path);
  return languages;
}

/** نفس الخريطة مع قراءة اللغات المفعّلة بنفسها */
export async function buildLanguageAlternates(
  path: string
): Promise<Record<string, string>> {
  return languageAlternates(await getEnabledLocales(), path);
}

/* ------------------------------------------------------------------ */
/* الأساس المطلق وصورة المشاركة                                          */
/* ------------------------------------------------------------------ */

/**
 * `metadataBase` — الأساس الذي يحلّ عليه Next كل رابط نسبي في الميتاداتا.
 * غيابه (وكان غائباً تماماً) يعني تحذيراً في كل بناء وروابط `og:` نسبية لا
 * تفهمها منصات المشاركة أصلاً. `URL` قد ترمي لو كان `SITE_URL` مشوّهاً في
 * البيئة، فنُرجع `undefined` بدل إسقاط تصيير الصفحة كلها بسبب متغيّر بيئة.
 */
function metadataBase(): URL | undefined {
  try {
    return new URL(getBaseUrl());
  } catch {
    return undefined;
  }
}

/**
 * صورة المشاركة الافتراضية — ملف حقيقي في `public/brand/` بمقاس ١٢٠٠×٦٣٠،
 * وهو المقاس الذي تطلبه فيسبوك وواتساب وإكس. بلا نص وبلا اسم علامة: أصل مشترك
 * لكل نسخة whitelabel، ويحل محله شعار المالك لحظة ضبطه من شاشة الإعدادات.
 */
const DEFAULT_OG_IMAGE = { path: "/brand/og-default.png", width: 1200, height: 630 } as const;

/**
 * يحوّل قيمة صورة قادمة من الإعدادات إلى رابط **مطلق** — أو `null` إن كانت غير
 * صالحة كصورة مشاركة. المنصات تجلب الصورة من خوادمها لا من متصفح الزائر، فلا
 * ينفع فيها مسار نسبي ولا `data:` مهما عُرضت في الترويسة سليمة.
 *
 * مُصدَّرة كي **ترفض شاشتا السيو بالضبط ما يتجاهله هذا الملف**: لو كتبت الشاشة
 * فحصها الخاص لقبِلت يوماً قيمةً يُسقطها التصيير صامتاً، فيظن المالك أنه ضبط
 * صورة مشاركة وهي غير موجودة في البطاقة أصلاً (النمط ٨: مصدران لقرار واحد).
 */
export function absoluteImageUrl(value: string | null): string | null {
  const raw = (value ?? "").trim();
  if (raw === "") return null;
  if (/^https?:\/\//i.test(raw)) return raw;
  if (raw.startsWith("/")) return absoluteUrl(raw);
  return null;
}

/** وصف صورة مشاركة — شكل واحد يقبله `openGraph.images` و`twitter.images` معاً */
type ShareImage = { url: string; width?: number; height?: number; alt?: string };

/**
 * صور Open Graph لصفحة — ثلاثة مرشّحين بترتيب من الأخصّ إلى الأعمّ:
 * صورة **هذه الصفحة** ← صورة الموقع من الإعدادات ← الملف المرفق ١٢٠٠×٦٣٠.
 *
 * ── ⚠ ولماذا حُذف الشعار من السلسلة ───────────────────────────────────────
 *
 * كان **شعار العلامة** مرشّحاً ثالثاً بحجّة «وشعارُه أفضر من لا شيء» — وهي
 * مقدّمة **كاذبة** أثبتها القياس: الشعار الذي ضبطه المالك ملفٌ **١٤١×٤٩ بكسل**،
 * وفيسبوك تُسقط ما دون ٢٠٠×٢٠٠، وإكس تشترط ٣٠٠×١٥٧ لبطاقة
 * `summary_large_image` — وهي البطاقة المعلَنة هنا. فالشعار لم يكن «أفضل من لا
 * شيء»، بل **أسوأ**: المنصة تقيسه وترفضه فتخرج البطاقة بلا صورة، بينما ملفُ
 * `og-default.png` ‏(‏١٢٠٠×٦٣٠، مقيسٌ فعلاً) كان سيُرسَم لو لم يُزحزَح. أي أن
 * وجود الشعار **يهزم** الاحتياطي الصحيح. مقيس على الإنتاج: `og:image` و
 * `twitter:image` كلاهما يحملان الشعار على كل صفحة عامة.
 *
 * 🔒 **والشعار ليس صورة مشاركة أصلاً**: موضعه الترويسة وعقدة `#logo` في البيانات
 * المهيكلة — أصلٌ صغير شفّاف غالباً، يُصمَّم ليُقرأ في ٤٠ بكسل لا ليملأ بطاقة
 * عريضة. ومن أراد بطاقةً بعلامته يضبط `seo.ogImageUrl` وهو الحقل الموجود لهذا.
 *
 * المقاسان يُعلَنان **للافتراضية وحدها** لأننا نعرفهما يقيناً — هي ملف في
 * المستودع نعرف أبعاده؛ أما ما يضبطه المالك فمقاسه مجهول هنا، وإعلان مقاس كاذب
 * يجعل المنصة ترسم إطاراً فارغاً حول صورة لا تملؤه. غياب المقاس يدفع المنصة إلى
 * قياس الملف بنفسها وهو السلوك الصحيح.
 */
function ogImages(settings: SiteSettings, pageImage: string | null): ShareImage[] {
  const alt = settings.brand.name;
  for (const candidate of [pageImage, settings.seo.ogImageUrl]) {
    const url = absoluteImageUrl(candidate);
    if (url !== null) return [{ url, alt }];
  }
  return [
    {
      url: absoluteUrl(DEFAULT_OG_IMAGE.path),
      width: DEFAULT_OG_IMAGE.width,
      height: DEFAULT_OG_IMAGE.height,
      alt,
    },
  ];
}

/**
 * المسار القانوني المخصّص من `pages.meta` — يُقبل **داخلياً فقط** أو يُرفض إلى
 * `null` فيبقى المسار المحسوب.
 *
 * ولماذا الرفض صامت لا صاخب؟ لأن إسقاط تصيير صفحة عامة بسبب إعدادٍ كتبه المالك
 * خطأً عقوبةٌ أشد من الخطأ نفسه — والقيمة المتجاهَلة تُبقي الصفحة على قانونيّها
 * الصحيح، أي على السلوك الذي كان قبل الإعداد.
 *
 * وثلاث صور تبدأ بشرطة مائلة ومع ذلك تغادر النطاق، وكلها تهدي وزن الصفحة لموقع
 * آخر بلا رسالة خطأ واحدة (D-24):
 *   • `//evil.com` — رابط بروتوكول-نسبي.
 *   • `/\evil.com` — تقرؤه متصفحات كسابقه بعد تطبيع الشرطة المائلة العكسية.
 *   • أي `:` في النص — لا مسار داخلي مشروع يحملها، ووجودها علامة مخطط مدسوس.
 *
 * مُصدَّرة كي تستعملها شاشتا السيو في **الرفض الصاخب عند الحفظ**: هنا الرفض
 * صامت لأن الصفحة العامة تُصيَّر بأي حال، أما في اللوحة فالمالك يجب أن يعرف أن
 * قيمته لن تُطبَّق بدل أن يحفظها ويطمئن. والفحص واحد لا نسختان — وإلا قبِلت
 * الشاشة يوماً ما يرفضه التصيير.
 *
 * ويصلح الفحص نفسه لمسارات المنع في `robots.txt`: كلاهما مسار داخلي لا يجوز أن
 * يغادر النطاق، وسطر منعٍ يحمل نطاقاً غريباً لا يمنع شيئاً ويوهم أنه يمنع.
 */
export function internalCanonicalPath(value: string | null | undefined): string | null {
  const raw = (value ?? "").trim();
  if (!raw.startsWith("/")) return null;
  if (raw.startsWith("//") || raw.startsWith("/\\")) return null;
  if (raw.includes(":")) return null;
  // محرف تحكّم داخل مسار = قيمة مصنوعة لحقن سطر في الترويسة لا مسار حقيقي
  if (/[\u0000-\u001f\u007f]/.test(raw)) return null;
  return raw;
}

/**
 * 🔒 المسار القانوني وحده — يرفض **بادئة اللغة** زيادةً على ما سبق.
 *
 * الفحص العام أعلاه يصلح لسطر منعٍ في `robots.txt`، لكنه يقبل `/en/about`
 * لأنه مسار داخلي سليم شكلاً. والعقد ينصّ أن هذا الحقل «لا يمسّ بادئة اللغة
 * إطلاقاً (D-24)» — ولم يكن شيء يفرض ذلك حتى أمسكته المراجعتان معاً. والعطبان
 * اللذان يقعان بلا هذا الحارس صامتان كلاهما:
 *
 *   • على `/en` تُركَّب البادئة فوق القيمة ⇒ `/en/en/about` — رابطٌ قانوني
 *     يشير إلى **٤٠٤**، أي إخراج الصفحة من النتائج بلا رسالة واحدة.
 *   • وعلى النسخة العربية ⇒ canonical يعلن الإنجليزي بينما `hreflang` وخريطة
 *     الموقع يعلنان العربي — إشارتان متضاربتان على الصفحة الواحدة، وأخطر ما
 *     فيهما أنهما تصمتان.
 *
 * والقيمة تُكتب دائماً **بالمسار العربي الأصيل**، وتُركَّب البادئة في
 * `localeUrl` كما لكل مسار في المشروع.
 */
export function canonicalOverridePath(value: string | null | undefined): string | null {
  const raw = internalCanonicalPath(value);
  if (raw === null) return null;
  // `/en/x` ⇒ ["", "en", "x"] — فالمقطع الأول بعد الشرطة هو الفهرس ١
  const first = raw.split("/")[1] ?? "";
  return isRoutingLocale(first) ? null : raw;
}

type PageMetadataInput = {
  /** عنوان الصفحة — يُمرر إلى قالب العنوان في الجذر؛ اتركه فارغاً للصفحة الرئيسية */
  title?: string;
  /** وصف الصفحة — يرجع للوصف الافتراضي من الإعدادات عند غيابه */
  description?: string;
  /** المسار العربي الأصيل بادئاً بشرطة مائلة، مثل "/" أو "/services" — بلا بادئة لغة */
  path: string;
  /** اللغة — تُقرأ من ترويسة الطلب عند غيابها */
  locale?: string;
  /**
   * ميتاداتا الصفحة من `pages.meta` — تفعّل خيارات سيو الصفحة الواحدة.
   *
   * اختيارية بالضرورة لا بالتساهل: نصف المسارات العامة يملكها ملف في `app/` بلا
   * صفٍّ في `pages` (`/book`، `/track`، `/quote-request`)، فلا `meta` لها أصلاً.
   * وغيابها يُبقي كل مخرجات هذه الدالة كما كانت حرفاً بحرف.
   */
  meta?: PageMeta | null;
};

/** يبني Metadata كاملة لصفحة خادمية اعتماداً على إعدادات الموقع (whitelabel) */
export async function buildPageMetadata({
  title,
  description,
  path,
  locale,
  meta,
}: PageMetadataInput): Promise<Metadata> {
  /**
   * اللغة تُحسم **أولاً** لأن الإعدادات نفسها مترجمة: اسم العلامة ووصف السيو
   * الافتراضي يصلان بلغة الصفحة. `getSettings()` بلا وسيط كانت تعني العربية
   * دائماً — أي بطاقة Open Graph عربية فوق صفحة إنجليزية. والعكس ليس خطراً:
   * `getSettings("ar")` تختصر إلى نفس القراءة العربية حرفاً بحرف.
   */
  const activeLocale = locale ?? (await getActiveLocale());
  const [settings, locales] = await Promise.all([
    getSettings(activeLocale),
    getEnabledLocales(),
  ]);

  /**
   * لغة يعرف الوسيط توجيهها لكن المالك أطفأها من جدول `locales`: الرابط يبقى
   * حياً (لا نكسر رابطاً منشوراً) لكنه لا يُفهرَس، ورابطه القانوني يشير إلى
   * العربية — وإلا صار محتوى مكرراً يقسم وزن الصفحة في نتائج البحث.
   */
  const isEnabled = locales.some((entry) => entry.code === activeLocale);

  /**
   * المسار القانوني: ما اختارته الصفحة إن كان داخلياً صالحاً، وإلا المحسوب.
   *
   * وأثره يقتصر على `alternates.canonical` وحده بقصد: `og:url` يبقى عنوان
   * **هذه** الصفحة (المنصة تعرض ما شاركه الزائر فعلاً)، وخريطة hreflang تبقى
   * على مسارها الحقيقي كي تطابق `app/sitemap.ts` حرفاً بحرف — واختلافهما إشارة
   * متضاربة لمحركات البحث كما ينصّ رأس ملف الخريطة.
   */
  const canonicalPath = canonicalOverridePath(meta?.canonicalPath) ?? path;
  const canonicalUrl = localeUrl(isEnabled ? activeLocale : DEFAULT_LOCALE, canonicalPath);
  const pageUrl = localeUrl(activeLocale, path);
  const resolvedDescription = description ?? settings.seo.defaultDescription;

  /**
   * شرطان مستقلان يتجمّعان ولا يحلّ أحدهما محل الآخر:
   *   • لغة أطفأها المالك — الرابط حيّ ولا يُفهرَس (السلوك القائم أعلاه).
   *   • صفحة منشورة طلب المالك منعها صراحةً — الحالة الوسطى التي لم تكن ممكنة:
   *     صفحة شكر أو عرض مؤقت تبقى للزوار وتُخفى عن البحث.
   * و`follow: true` في الحالتين: لا نفهرس الصفحة لكن لا نقطع وزنها عن روابطها.
   */
  /**
   * ثلاثة أسباب مستقلة للمنع، و**الثالث كان غائباً** حتى أمسكته المراجعتان معاً:
   *
   * (١) لغة أطفأها المالك — الرابط يبقى حياً ولا يُفهرَس.
   * (٢) صفحة وسمها المالك `noindex` من مركز السيو.
   * (٣) **مفتاح «امنع فهرسة الموقع كله»** — وكان مستهلكه الوحيد `robots.txt`.
   *
   * والثالث بلا هذا السطر ينتج **عكس ما يَعِد به حرفياً**: `Disallow: /` يمنع
   * الزحف، فلا يرى جوجل توجيه noindex أصلاً، فتبقى الروابط المفهرَسة سلفاً في
   * النتائج بلا وصف («لا يتوفر وصف لهذه النتيجة») — وسحبُها بعدها أبطأ ما يكون
   * لأن الزاحف ممنوع من رؤية التوجيه الذي يسحبها. وهو النمط ٧ في `LESSONS.md`
   * بنصّه: «الافتراضي هو ما سيعمل في الإنتاج»، والمفتاح الذي يَعِد بالمنع يجب
   * أن يمنع بالطبقتين معاً — الزحف والفهرسة.
   */
  const noindex =
    !isEnabled || meta?.noindex === true || settings.seo.robots.indexable === false;

  const languages = languageAlternates(locales, path);

  const alternateOg = locales
    .filter((entry) => entry.code !== activeLocale)
    .map((entry) => entry.ogLocale);

  const base = metadataBase();
  const images = ogImages(settings, meta?.ogImageUrl ?? null);
  const cardTitle = title ?? settings.brand.name;

  /**
   * `twitter:site` يريد الحساب بعلامة `@`، والعقد يطلب من المالك كتابته بلا
   * علامة — فالتطبيع هنا لا في الشاشة، ويحتمل أن يكتبها المالك رغم ذلك.
   * وغياب الحساب يعني **غياب الحقل** لا حقلاً فارغاً (نفس منطق وسمَي التحقق).
   */
  const twitterHandle = (settings.seo.twitterSite ?? "").trim().replace(/^@+/, "");

  return {
    ...(base !== undefined ? { metadataBase: base } : {}),
    ...(title !== undefined ? { title } : {}),
    description: resolvedDescription,
    ...(noindex ? { robots: { index: false, follow: true } } : {}),
    alternates: {
      canonical: canonicalUrl,
      languages,
    },
    openGraph: {
      type: "website",
      locale: localeOg(activeLocale),
      ...(alternateOg.length > 0 ? { alternateLocale: alternateOg } : {}),
      url: pageUrl,
      siteName: settings.brand.name,
      title: cardTitle,
      description: resolvedDescription,
      images,
    },
    /**
     * إكس (تويتر) لا يقرأ `og:image` وحده في بطاقة كبيرة — يحتاج `twitter:card`
     * صراحةً، وإلا خرج الرابط سطراً نصياً بلا صورة. القيم نفسها بلا حساب ثانٍ،
     * والنوع صار من الإعدادات بعد أن كان مكتوباً حرفاً هنا (وافتراضه نفس الحرف).
     */
    twitter: {
      card: settings.seo.twitterCard,
      ...(twitterHandle !== "" ? { site: `@${twitterHandle}` } : {}),
      title: cardTitle,
      description: resolvedDescription,
      images,
    },
  };
}
