import type { MetadataRoute } from "next";
import { languageAlternates, localeUrl } from "@/lib/seo";
import { getEnabledLocales } from "@/i18n/locales";
import { getPublishedPages } from "@/lib/content";
import type { PageKind } from "@/lib/content-types";

/**
 * خريطة الموقع — تُبنى من الصفحات المنشورة في نظام المحتوى:
 * الرئيسية + صفحات الخدمات (/services) + صفحات المسارات (/routes) + الثابتة (/about)،
 * ومعها **مسارات يملكها التطبيق نفسه** لا صفوف لها في جدول `pages`.
 *
 * كل صفحة تظهر بكل لغة مفعّلة (العربية بلا بادئة، وغيرها تحتها) ويحمل كل مدخل
 * `alternates.languages` نفسه — بالضبط ما تعلنه ترويسة الصفحة في `lib/seo.ts`.
 * اختلاف الاثنتين إشارة متضاربة لمحركات البحث، فالمصدر واحد: `languageAlternates`.
 */

/** مسار كل صفحة حسب نوعها — بالعربية الأصيلة، والبادئة تُركَّب لاحقاً */
function pagePath(kind: PageKind, slug: string): string {
  switch (kind) {
    case "home":
      return "/";
    case "service":
      return `/services/${slug}`;
    case "corridor":
      return `/routes/${slug}`;
    case "static":
      return `/${slug}`;
  }
}

/** أولوية الفهرسة: الرئيسية أولاً ثم الخدمات والمسارات فالصفحات الثابتة */
const PRIORITY: Record<PageKind, number> = {
  home: 1,
  service: 0.8,
  corridor: 0.8,
  static: 0.5,
};

type Listing = {
  priority: number;
  changeFrequency: "weekly" | "monthly";
};

/**
 * مسارات يملكها التطبيق لا نظام المحتوى: صفحتا الحجز وطلب عرض السعر مكتوبتان
 * في `app/` ولا صف لهما في جدول `pages`، فكانتا تغيبان عن الخريطة كلياً — بلا
 * مدخل ولا `hreflang` — رغم أنهما الصفحتان اللتان تصنعان التحويل فعلاً.
 * أولويتهما فوق الصفحات الثابتة ودون الرئيسية.
 */
const APP_ROUTES: { path: string; priority: number }[] = [
  { path: "/book", priority: 0.9 },
  { path: "/quote-request", priority: 0.7 },
];

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const [pages, locales] = await Promise.all([getPublishedPages(), getEnabledLocales()]);
  const lastModified = new Date();

  // مسارات فريدة — تحمي من صفحتين بنفس الـ slug في نظام المحتوى
  const paths = new Map<string, Listing>();
  for (const page of pages) {
    paths.set(pagePath(page.kind, page.slug), {
      priority: PRIORITY[page.kind],
      changeFrequency: page.kind === "home" ? "weekly" : "monthly",
    });
  }
  // ضمانة: الرئيسية حاضرة دائماً حتى لو غاب المحتوى كلياً
  if (!paths.has("/")) paths.set("/", { priority: PRIORITY.home, changeFrequency: "weekly" });

  // صفحة محتوى بنفس المسار (لو وُجدت يوماً) أولى بوصفها — لا نطمس ما قاله المالك
  for (const route of APP_ROUTES) {
    if (!paths.has(route.path)) {
      paths.set(route.path, { priority: route.priority, changeFrequency: "monthly" });
    }
  }

  const entries: MetadataRoute.Sitemap = [];
  for (const [path, listing] of paths) {
    const languages = languageAlternates(locales, path);
    for (const locale of locales) {
      entries.push({
        url: localeUrl(locale.code, path),
        lastModified,
        changeFrequency: listing.changeFrequency,
        priority: listing.priority,
        alternates: { languages },
      });
    }
  }

  return entries;
}
