import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getSettings } from "@/lib/settings";
import { getPageBySlug } from "@/lib/content";
import { buildPageMetadata } from "@/lib/seo";
import { resolveLocale } from "@/lib/i18n/content";
import { SiteHeader } from "@/components/site/header";
import { SiteFooter } from "@/components/site/footer";
import { WhatsAppFab } from "@/components/site/whatsapp-fab";
import { RenderSections } from "@/components/sections/render";
import { ShareBar } from "@/components/site/share-bar";
import { PageJsonLd } from "@/components/seo/JsonLd";

/**
 * صفحة خدمة واحدة (/services/[slug]) — المحتوى من نظام الأقسام،
 * والـ slug غير الموجود أو غير المطابق لنوع «خدمة» يعيد 404.
 *
 * المرحلة ٨: الـ slug لا يُترجم أبداً (الرابط أصل سيو)، والمترجَم هو العنوان
 * والميتا ومحتوى الأقسام — يصل جاهزاً من `getPageBySlug(slug, locale)`.
 */

type PageParams = { params: Promise<{ slug: string; locale?: string }> };

/** المحتوى ديناميكي (يُدار من اللوحة) — لا مسارات مبنية مسبقاً */
/**
 * ⚠ **ديناميكية بالضرورة لا بالاختيار.**
 *
 * لغة الصفحة تأتي من ترويسة يضبطها `proxy.ts` عند إعادة كتابة `/en/...` — لا من
 * مسار الملف. فصفحةٌ ثابتة هنا تعني تجميد لغة واحدة في HTML واحد لكل المسارات.
 * وقد ظهر ذلك عملياً في أول تشغيل إنتاجي (2026-08-14): كانت مصنَّفة ثابتة فردّت
 * **٥٠٠** على كل طلب حقيقي بـ `DYNAMIC_SERVER_USAGE`، بينما مرّ `pnpm build`
 * و`pnpm db:test` والتطوير كلها خضراء — لأن أياً منها لا يصيّر تصييراً ثابتاً
 * عند الطلب. التفصيل في `lib/next-control-flow.ts`.
 *
 * و`generateStaticParams` تبقى: تخدم `sitemap` وتوليد المسارات المعروفة، ولا
 * تتعارض مع التصيير عند الطلب.
 */
export const dynamic = "force-dynamic";

export async function generateStaticParams(): Promise<{ slug: string }[]> {
  return [];
}

export async function generateMetadata({ params }: PageParams): Promise<Metadata> {
  const { slug } = await params;
  const locale = await resolveLocale(params);
  const page = await getPageBySlug(slug, locale);
  if (!page || page.kind !== "service") return {};

  return buildPageMetadata({
    title: page.meta.title ?? page.title,
    description: page.meta.description ?? undefined,
    path: `/services/${slug}`,
    locale,
    // خيارات سيو الصفحة الواحدة (منع الفهرسة، صورة المشاركة، المسار القانوني)
    meta: page.meta,
  });
}

export default async function ServicePage({ params }: PageParams) {
  const { slug } = await params;
  const locale = await resolveLocale(params);
  const [settings, page] = await Promise.all([
    getSettings(locale),
    getPageBySlug(slug, locale),
  ]);

  if (!page || page.kind !== "service") notFound();

  return (
    <>
      {/* Service + BreadcrumbList — لم تكن على هذه الصفحة بيانات مهيكلة إطلاقاً */}
      <PageJsonLd page={page} locale={locale} />
      <SiteHeader settings={settings} locale={locale} />
      <main id="main" className="flex-1">
        <RenderSections sections={page.sections} settings={settings} locale={locale} />
        {/* المشاركة العامة — صفحة خدمة: رابط عام مفهرَس بُني ليُشارَك ويجلب
            زواراً، ولا سرّ فيه (بخلاف `/booking/[token]`؛ الشرح في رأس
            `share-bar.tsx`). */}
        <ShareBar
          title={page.meta.title ?? page.title}
          description={page.meta.description}
          path={`/services/${slug}`}
          locale={locale}
        />
      </main>
      <SiteFooter settings={settings} locale={locale} />
      <WhatsAppFab settings={settings} locale={locale} />
    </>
  );
}
