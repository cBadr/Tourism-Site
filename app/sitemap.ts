import type { MetadataRoute } from "next";
import { languageAlternates, localeUrl } from "@/lib/seo";
import { getEnabledLocales } from "@/i18n/locales";
import { getPublishedPages } from "@/lib/content";
import { APP_OWNED_PATHS, pagePublicPath } from "@/lib/seo/site-paths";
import type { PageKind } from "@/lib/content-types";

/**
 * خريطة الموقع — تُبنى من الصفحات المنشورة في نظام المحتوى:
 * الرئيسية + صفحات الخدمات (/services) + صفحات المسارات (/routes) + الثابتة (/about)،
 * ومعها **مسارات يملكها التطبيق نفسه** لا صفوف لها في جدول `pages`.
 *
 * كل صفحة تظهر بكل لغة مفعّلة (العربية بلا بادئة، وغيرها تحتها) ويحمل كل مدخل
 * `alternates.languages` نفسه — بالضبط ما تعلنه ترويسة الصفحة في `lib/seo.ts`.
 * اختلاف الاثنتين إشارة متضاربة لمحركات البحث، فالمصدر واحد: `languageAlternates`.
 *
 * ── ثلاثة مصادر واحدة، لا نسخ ────────────────────────────────────────────────
 *  ١ شكل مسار صفحة المحتوى: `pagePublicPath` في `lib/seo/site-paths.ts`
 *    (كانت نسخة ثانية هنا اسمها `pagePath` — نسختان تنحرفان يوم يتغيّر شكل مسار).
 *  ٢ قائمة المسارات التي يملكها `app/`: `APP_OWNED_PATHS` من الملف نفسه — وهي
 *    القائمة التي يتحقق منها مدير التحويلات أصلاً. صفحة جديدة تُسجَّل مرة واحدة
 *    فتظهر في الخريطة **ويحميها** التحقق من التحويلات معاً.
 *  ٣ تاريخ آخر تعديل: عمود `updated_at` في `pages` عبر `PublicPage.updatedAt`.
 */

/** أولوية الفهرسة: الرئيسية أولاً ثم الخدمات والمسارات فالصفحات الثابتة */
const PRIORITY: Record<PageKind, number> = {
  home: 1,
  service: 0.8,
  corridor: 0.8,
  static: 0.5,
};

/**
 * أولوية المسارات التي يملكها `app/` — صفحتا الحجز وطلب عرض السعر تصنعان
 * التحويل فعلاً فأولويتهما فوق الصفحات الثابتة ودون الرئيسية.
 *
 * ما لا يُذكر هنا **لا يغيب عن الخريطة**: يأخذ أولوية الصفحة الثابتة. وهذا هو
 * الفرق عن القائمة اليدوية السابقة — نسيان سطر هنا يخفض أولوية مسار، ولا يمحوه
 * من الخريطة كما كان يحدث.
 */
const APP_ROUTE_PRIORITY: Record<string, number> = {
  "/": PRIORITY.home,
  "/book": 0.9,
  "/quote-request": 0.7,
  /**
   * `/track` — صفحة «تابع حجزك». دون صفحتَي التحويل وفوق الصفحة الثابتة:
   * هي سطح **خدمة** لعميل حجز أصلاً لا سطح اكتساب، لكنها تُفهرَس عمداً لأن من
   * أغلق التبويب يبحث عن «متابعة حجز <اسم العلامة>» في جوجل لا في الموقع.
   */
  "/track": 0.6,
};

type Listing = {
  priority: number;
  changeFrequency: "weekly" | "monthly";
  /** ISO من القاعدة — `null` لمسار لا نعرف تاريخ تعديله (مسارات الكود) */
  lastModified: string | null;
};

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const [pages, locales] = await Promise.all([getPublishedPages(), getEnabledLocales()]);

  // مسارات فريدة — تحمي من صفحتين بنفس الـ slug في نظام المحتوى
  const paths = new Map<string, Listing>();
  for (const page of pages) {
    paths.set(pagePublicPath(page.kind, page.slug), {
      priority: PRIORITY[page.kind],
      changeFrequency: page.kind === "home" ? "weekly" : "monthly",
      lastModified: page.updatedAt,
    });
  }
  // ضمانة: الرئيسية حاضرة دائماً حتى لو غاب المحتوى كلياً
  if (!paths.has("/")) {
    paths.set("/", { priority: PRIORITY.home, changeFrequency: "weekly", lastModified: null });
  }

  // صفحة محتوى بنفس المسار (لو وُجدت يوماً) أولى بوصفها — لا نطمس ما قاله المالك
  for (const path of APP_OWNED_PATHS) {
    if (paths.has(path)) continue;
    paths.set(path, {
      priority: APP_ROUTE_PRIORITY[path] ?? PRIORITY.static,
      changeFrequency: "monthly",
      /**
       * مسار يملكه ملف في `app/` لا صف في `pages`: لا تاريخ تعديل نعرفه، ووضع
       * `new Date()` هنا يعني إعلان تعديل كاذب في كل زحف. الحقل يغيب — وغياب
       * `lastModified` مسموح في معيار خريطة الموقع، أما التاريخ الكاذب فيُفقِد
       * الحقل مصداقيته على النطاق كله.
       */
      lastModified: null,
    });
  }

  const entries: MetadataRoute.Sitemap = [];
  for (const [path, listing] of paths) {
    const languages = languageAlternates(locales, path);
    for (const locale of locales) {
      entries.push({
        url: localeUrl(locale.code, path),
        ...(listing.lastModified !== null ? { lastModified: listing.lastModified } : {}),
        changeFrequency: listing.changeFrequency,
        priority: listing.priority,
        alternates: { languages },
      });
    }
  }

  return entries;
}
