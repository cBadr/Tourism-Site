import type { MetadataRoute } from "next";
import { languageAlternates, localeUrl } from "@/lib/seo";
import { getEnabledLocales } from "@/i18n/locales";
import { getPublishedPages } from "@/lib/content";
import { getSettings } from "@/lib/settings";
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
  /**
   * صفحة هبوط مبنيّة بالمنشئ (المرحلة ١٣): **فوق الثابتة ودون الخدمات**.
   *
   * والسبب هو الفرق الذي وُلد النوع من أجله: «سياسة الخصوصية» صفحةٌ يجب أن
   * توجد ولا يُبحث عنها، وصفحة الهبوط تُبنى **لتُقصَد من البحث** — لكنها لا
   * تسبق صفحات الخدمات وهي قناة الاكتساب المصمَّمة.
   *
   * ⚠ والقيمة `0.7` هي **المقترح** في `docs/phase-briefs/PAGE-BUILDER.md` §٦
   * سؤال ٤ — سؤالٌ مفتوحٌ لبدر لا قرارٌ محسوم. وتغييرها سطرٌ واحد هنا.
   */
  landing: 0.7,
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
  const [pages, locales, settings] = await Promise.all([
    getPublishedPages(),
    getEnabledLocales(),
    getSettings(),
  ]);

  /**
   * 🔒 مفتاح «امنع فهرسة الموقع كله» يُفرَغ الخريطة كذلك — الطبقة الثالثة.
   *
   * كان المفتاح يُنتج `Disallow: /` في `robots.txt` وحده، بينما تبقى الخريطة
   * تعلن أربعين رابطاً وسطرُ `Sitemap:` قائمٌ داخل ملف المنع نفسه. والنتيجة
   * **عكس الوعد حرفياً**: الزحف يتوقف فلا يرى الزاحف توجيه المنع، وتبقى
   * الروابط المفهرَسة سلفاً في النتائج بلا وصف — وسحبُها أبطأ ما يكون لأن
   * الزاحف ممنوع من رؤية ما يسحبها. أمسكته المراجعتان معاً، وهو النمط ٧ في
   * `LESSONS.md` الذي استشهد به العقد نفسه.
   *
   * فالمنع الآن بثلاث طبقات متسقة: `robots.txt` يمنع الزحف، وكل صفحة تحمل وسم
   * `noindex` (‏`lib/seo.ts`)، والخريطة تخرج فارغة فلا تدعو إلى ما مُنع.
   */
  if (settings.seo.robots.indexable === false) return [];

  // مسارات فريدة — تحمي من صفحتين بنفس الـ slug في نظام المحتوى
  const paths = new Map<string, Listing>();
  /**
   * المسارات التي استبعدها المالك — تُجمع صراحةً ولا يكفي **عدم** إضافتها.
   *
   * لأن ما بعد هذه الحلقة يعيد ملء ما ينقص: ضمانة الرئيسية أدناه، وحلقة
   * `APP_OWNED_PATHS` التي تضيف كل مسار غائب. فصفحة `/about` مستبعدة تُحذف من
   * هنا ثم تعود من هناك — أي أن الخيار يبدو مضبوطاً في اللوحة وبلا أثر في الملف،
   * وهو أسوأ من غيابه لأنه يوهم المالك أنه ضبط شيئاً.
   */
  const excluded = new Set<string>();
  for (const page of pages) {
    const path = pagePublicPath(page.kind, page.slug);
    /**
     * شرطان يُخرجان الصفحة: استبعادٌ صريح من الخريطة، أو منعُ فهرسة.
     *
     * والثاني ليس تشدداً بل تصحيح تناقض: صفحة تحمل `noindex` ثم تُعلَن في خريطة
     * الموقع تقول لجوجل «افهرسها» و«لا تفهرسها» معاً، وتظهر في Search Console
     * خطأً صريحاً على النطاق. أما بقاؤهما خيارين منفصلين في الشاشة فبقصد: صفحة
     * تُخفى من الخريطة وتبقى مفهرسة حالةٌ مشروعة (صفحة قديمة لها روابط واردة).
     */
    if (page.meta.excludeFromSitemap === true || page.meta.noindex === true) {
      excluded.add(path);
      continue;
    }
    paths.set(path, {
      priority: PRIORITY[page.kind],
      changeFrequency: page.kind === "home" ? "weekly" : "monthly",
      lastModified: page.updatedAt,
    });
  }
  // ضمانة: الرئيسية حاضرة دائماً حتى لو غاب المحتوى كلياً — إلا أن يكون المالك
  // قد استبعدها بنفسه، فالضمانة ضد غياب المحتوى لا ضد قرار مكتوب
  if (!paths.has("/") && !excluded.has("/")) {
    paths.set("/", { priority: PRIORITY.home, changeFrequency: "weekly", lastModified: null });
  }

  // صفحة محتوى بنفس المسار (لو وُجدت يوماً) أولى بوصفها — لا نطمس ما قاله المالك
  for (const path of APP_OWNED_PATHS) {
    if (paths.has(path) || excluded.has(path)) continue;
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
