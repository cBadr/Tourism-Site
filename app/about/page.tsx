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

/**
 * صفحة «من نحن» (/about) — صفحة ثابتة (slug = about) من نظام الأقسام،
 * بنفس نمط صفحات الخدمات والمسارات. المسار العربي يبقى `/about` والإنجليزي
 * `/en/about` بإعادة كتابة من الوسيط — الملف واحد لكل اللغات.
 */

export async function generateMetadata(): Promise<Metadata> {
  const locale = await resolveLocale();
  const page = await getPageBySlug("about", locale);
  if (!page || page.kind !== "static") return {};

  return buildPageMetadata({
    title: page.meta.title ?? page.title,
    description: page.meta.description ?? undefined,
    path: "/about",
    locale,
  });
}

export default async function AboutPage() {
  const locale = await resolveLocale();
  const [settings, page] = await Promise.all([
    getSettings(locale),
    getPageBySlug("about", locale),
  ]);

  if (!page || page.kind !== "static") notFound();

  return (
    <>
      <SiteHeader settings={settings} locale={locale} />
      <main id="main" className="flex-1">
        <RenderSections sections={page.sections} settings={settings} locale={locale} />
      </main>
      <SiteFooter settings={settings} locale={locale} />
      <WhatsAppFab settings={settings} locale={locale} />
    </>
  );
}
