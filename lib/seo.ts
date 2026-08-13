import type { Metadata } from "next";
import { getSettings } from "@/lib/settings";
import type { SiteSettings } from "@/lib/site-config";
import { DEFAULT_LOCALE, localeOg, localePath, type LocaleDef } from "@/i18n/config";
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
 */
function absoluteImageUrl(value: string | null): string | null {
  const raw = (value ?? "").trim();
  if (raw === "") return null;
  if (/^https?:\/\//i.test(raw)) return raw;
  if (raw.startsWith("/")) return absoluteUrl(raw);
  return null;
}

/** وصف صورة مشاركة — شكل واحد يقبله `openGraph.images` و`twitter.images` معاً */
type ShareImage = { url: string; width?: number; height?: number; alt?: string };

/**
 * صور Open Graph لصفحة — شعار العلامة إن ضبطه المالك، وإلا الصورة الافتراضية.
 *
 * المقاسان يُعلَنان **للافتراضية وحدها** لأننا نعرفهما يقيناً؛ أما شعار المالك
 * فمقاسه مجهول هنا، وإعلان مقاس كاذب يجعل المنصة ترسم إطاراً فارغاً حول صورة
 * لا تملؤه. غياب المقاس يدفع المنصة إلى قياس الملف بنفسها وهو السلوك الصحيح.
 */
function ogImages(settings: SiteSettings): ShareImage[] {
  const alt = settings.brand.name;
  const logo = absoluteImageUrl(settings.brand.logoUrl);
  if (logo !== null) return [{ url: logo, alt }];
  return [
    {
      url: absoluteUrl(DEFAULT_OG_IMAGE.path),
      width: DEFAULT_OG_IMAGE.width,
      height: DEFAULT_OG_IMAGE.height,
      alt,
    },
  ];
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
};

/** يبني Metadata كاملة لصفحة خادمية اعتماداً على إعدادات الموقع (whitelabel) */
export async function buildPageMetadata({
  title,
  description,
  path,
  locale,
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
  const canonicalUrl = localeUrl(isEnabled ? activeLocale : DEFAULT_LOCALE, path);
  const pageUrl = localeUrl(activeLocale, path);
  const resolvedDescription = description ?? settings.seo.defaultDescription;

  const languages = languageAlternates(locales, path);

  const alternateOg = locales
    .filter((entry) => entry.code !== activeLocale)
    .map((entry) => entry.ogLocale);

  const base = metadataBase();
  const images = ogImages(settings);
  const cardTitle = title ?? settings.brand.name;

  return {
    ...(base !== undefined ? { metadataBase: base } : {}),
    ...(title !== undefined ? { title } : {}),
    description: resolvedDescription,
    ...(isEnabled ? {} : { robots: { index: false, follow: true } }),
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
     * صراحةً، وإلا خرج الرابط سطراً نصياً بلا صورة. القيم نفسها بلا حساب ثانٍ.
     */
    twitter: {
      card: "summary_large_image",
      title: cardTitle,
      description: resolvedDescription,
      images,
    },
  };
}
