import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getSettings } from "@/lib/settings";
import { getPageBySlug, getPagesByKind } from "@/lib/content";
import { buildPageMetadata } from "@/lib/seo";
import { resolveLocale } from "@/lib/i18n/content";
import { SiteHeader } from "@/components/site/header";
import { SiteFooter } from "@/components/site/footer";
import { WhatsAppFab } from "@/components/site/whatsapp-fab";
import { RenderSections } from "@/components/sections/render";
import { ShareBar } from "@/components/site/share-bar";

/**
 * الصفحات الثابتة على الجذر (/terms و/refund-policy و/privacy وما يضيفه المدير
 * لاحقاً بنوع «static») — المحتوى من نظام الأقسام نفسه، بنفس نمط
 * `app/services/[slug]` و`app/routes/[slug]`: لا حساب ولا نص مكتوب هنا.
 *
 * لماذا على الجذر؟ لأن تذييل الموقع يربط هذه الصفحات بـ `/{slug}` مباشرة،
 * وقبل هذا الملف كانت الروابط الثلاثة تعيد 404.
 *
 * التعارض مع المسارات الحقيقية: Next يقدّم المقطع الثابت (`/about`, `/book`…)
 * على المقطع الديناميكي دائماً، لكننا نحرس الأمر صراحةً بقائمة محجوزة حتى لا
 * تلتقط هذه الصفحة سطراً في `pages` سُمّي بخطأ باسم مسار قائم فتُظهر محتوى
 * مختلفاً على عنوان محجوز.
 *
 * ── المرحلة ١٣: **وصفحات الهبوط أيضاً، وبلا ملف مسار جديد** ─────────────────
 *
 * `landing` هو النوع الرابع في `pages_kind_check` (هجرة `0058` §١)، ويُصيَّر من
 * **هذا الملف نفسه** على `/{slug}` — بلا بادئة لغة (**D-24**) وبلا مسار عام
 * جديد (‏`PHASE_13_OUT_OF_SCOPE` البند ٧). فالمنشئ لا يوسّع سطح المسارات: يضيف
 * صفوفاً إلى جدولٍ يقرؤه مقطعٌ قائم.
 *
 * 🔒 **والمحجوزات هنا ليست تحذيراً بل نصف الحارس:** الشقّ الآخر مُشغّل
 * `pages_guard_slug` في القاعدة يرفض الحفظ برمز `SlugRejectCode`. ولماذا
 * الشقّان؟ لأن هذا الملف لا يستطيع أن يمنع الكتابة، والمُشغّل لا يستطيع أن
 * يمنع Next من تقديم المقطع الثابت. وقبل `0058` كان الشقّ الأول وحده موجوداً:
 * يقبل المالك `slug='book'`، ويراها «منشورة» في اللوحة، وهي **٤٠٤ للأبد**.
 */

type PageParams = { params: Promise<{ slug: string; locale?: string }> };

/**
 * الأنواع التي يقدّمها هذا المقطع. وشرطُ النوع ليس زينة: بدونه تلتقط
 * `/{slug}` صفحةَ خدمةٍ اسمها `airport-transfer` على الجذر أيضاً، فيصير
 * للمحتوى الواحد عنوانان — وهو محتوى مكرر يقسم وزن الصفحة في نتائج البحث.
 */
const ROOT_PAGE_KINDS = ["static", "landing"] as const;

function servesAtRoot(kind: string): boolean {
  return (ROOT_PAGE_KINDS as readonly string[]).includes(kind);
}

/** المسارات التي يملكها ملف/مجلد حقيقي في `app/` — لا يجوز أن يلتقطها هذا المقطع */
const RESERVED_SLUGS: ReadonlySet<string> = new Set([
  "about",
  "book",
  "booking",
  "admin",
  "portal",
  "quote-request",
  "routes",
  "services",
  "track",
  "api",
]);

/**
 * الصفحات الثابتة المنشورة وقت البناء (بلا المحجوزة).
 * عند غياب قاعدة البيانات تعيد طبقة المحتوى الافتراضيات، فتُبنى الصفحات
 * القانونية الثلاث دائماً — والـ slug غير المذكور هنا يبقى متاحاً عند الطلب.
 */
export async function generateStaticParams(): Promise<{ slug: string }[]> {
  const groups = await Promise.all(ROOT_PAGE_KINDS.map((kind) => getPagesByKind(kind)));
  return groups
    .flat()
    .filter((page) => !RESERVED_SLUGS.has(page.slug))
    .map((page) => ({ slug: page.slug }));
}

export async function generateMetadata({ params }: PageParams): Promise<Metadata> {
  const { slug } = await params;
  if (RESERVED_SLUGS.has(slug)) return {};

  const locale = await resolveLocale(params);
  const page = await getPageBySlug(slug, locale);
  /**
   * `getPageBySlug` تقرأ من `lib/content.ts` وهي **لا ترى إلا المنشور**
   * (`.eq("published", true)`)، ومسودةُ المنشئ لا تلمس `sections` أصلاً — تعيش
   * في `page_revisions`. فالصفحة غير المنشورة تخرج من هنا `{}` ومن الجسم أدناه
   * ٤٠٤، ولا تدخل خريطة الموقع. **مقيسٌ لا مفترَض** — انظر تقرير المرحلة.
   */
  if (!page || !servesAtRoot(page.kind)) return {};

  return buildPageMetadata({
    title: page.meta.title ?? page.title,
    description: page.meta.description ?? undefined,
    path: `/${slug}`,
    locale,
    // خيارات سيو الصفحة الواحدة (منع الفهرسة، صورة المشاركة، المسار القانوني)
    meta: page.meta,
  });
}

export default async function StaticContentPage({ params }: PageParams) {
  const { slug } = await params;
  if (RESERVED_SLUGS.has(slug)) notFound();

  const locale = await resolveLocale(params);
  const [settings, page] = await Promise.all([
    getSettings(locale),
    getPageBySlug(slug, locale),
  ]);

  if (!page || !servesAtRoot(page.kind)) notFound();

  return (
    <>
      <SiteHeader settings={settings} locale={locale} />
      <main id="main" className="flex-1">
        <RenderSections sections={page.sections} settings={settings} locale={locale} />
        {/* المشاركة العامة — صفحة محتوى ثابتة على الجذر: عامة مفهرَسة بلا سرّ.
            و`RESERVED_SLUGS` أعلاه تضمن ألا يلتقط هذا المقطع `booking` فيضع
            الشريط فوق صفحة رحلة (الشرح في رأس `share-bar.tsx`). */}
        <ShareBar
          title={page.meta.title ?? page.title}
          description={page.meta.description}
          path={`/${slug}`}
          locale={locale}
        />
      </main>
      <SiteFooter settings={settings} locale={locale} />
      <WhatsAppFab settings={settings} locale={locale} />
    </>
  );
}
