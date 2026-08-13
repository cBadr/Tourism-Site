import type { Metadata } from "next";
import { getSettings } from "@/lib/settings";
import { getPageBySlug } from "@/lib/content";
import { buildPageMetadata } from "@/lib/seo";
import { resolveLocale } from "@/lib/i18n/content";
import { SiteHeader } from "@/components/site/header";
import { SiteFooter } from "@/components/site/footer";
import { WhatsAppFab } from "@/components/site/whatsapp-fab";
import { RenderSections } from "@/components/sections/render";
import { PromoBanners } from "@/components/booking/promo-banner";
import { getPromoBanners } from "@/lib/discounts/banners";
import JsonLd from "@/components/seo/JsonLd";

/**
 * الصفحة الرئيسية العامة — أقسامها من نظام المحتوى (صفحة slug = home)
 * عبر سجل الأقسام الموحد. الصفحة موجودة دائماً بفضل المحتوى الافتراضي،
 * لذلك لا notFound() هنا أبداً.
 *
 * المرحلة ٨: اللغة تُقرأ من ترويسة الوسيط (`resolveLocale`) وتُمرَّر إلى طبقة
 * المحتوى والإعدادات والأقسام — المسار نفسه يخدم `/` و`/en`.
 */

export async function generateMetadata(): Promise<Metadata> {
  const locale = await resolveLocale();
  const page = await getPageBySlug("home", locale);
  // بلا title — الصفحة الرئيسية تأخذ الاسم الافتراضي من قالب الجذر
  return buildPageMetadata({
    description: page?.meta.description ?? undefined,
    path: "/",
    locale,
  });
}

export default async function Home() {
  const locale = await resolveLocale();
  const [settings, page, homeBanners] = await Promise.all([
    getSettings(locale),
    getPageBySlug("home", locale),
    getPromoBanners("home"),
  ]);

  return (
    <>
      <JsonLd />
      <SiteHeader settings={settings} locale={locale} />
      <main id="main" className="flex-1">
        {/*
          بانر موضع «الرئيسية» — شريط فوق أقسام الصفحة، نصّ تحفيزي بلا أثر على
          أي سعر (نصّ العقد). غيابه (لا بانر نشط) لا يترك فراغاً: المكوّن يُرجع
          null فلا يُصيَّر الحاوي بمحتوى فارغ.
        */}
        {homeBanners.length > 0 ? (
          <div className="mx-auto w-full max-w-6xl px-4 pt-4 sm:px-6">
            <PromoBanners banners={homeBanners} />
          </div>
        ) : null}

        <RenderSections
          sections={page?.sections ?? []}
          settings={settings}
          locale={locale}
        />
      </main>
      <SiteFooter settings={settings} locale={locale} />
      <WhatsAppFab settings={settings} locale={locale} />
    </>
  );
}
