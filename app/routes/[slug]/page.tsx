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
 * صفحة مسار سيو واحدة (/routes/[slug]) — مثل «القاهرة–الإسكندرية»،
 * المحتوى من نظام الأقسام، والـ slug غير المطابق لنوع «مسار» يعيد 404.
 * الـ slug يبقى كما هو في كل اللغات؛ المترجَم هو العنوان والميتا والأقسام.
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
 * و`generateStaticParams` تبقى: تخدم توليد المسارات المعروفة ولا تتعارض معها.
 */
export const dynamic = "force-dynamic";

export async function generateStaticParams(): Promise<{ slug: string }[]> {
  return [];
}

export async function generateMetadata({ params }: PageParams): Promise<Metadata> {
  const { slug } = await params;
  const locale = await resolveLocale(params);
  const page = await getPageBySlug(slug, locale);
  if (!page || page.kind !== "corridor") return {};

  return buildPageMetadata({
    title: page.meta.title ?? page.title,
    description: page.meta.description ?? undefined,
    path: `/routes/${slug}`,
    locale,
  });
}

export default async function CorridorPage({ params }: PageParams) {
  const { slug } = await params;
  const locale = await resolveLocale(params);
  const [settings, page] = await Promise.all([
    getSettings(locale),
    getPageBySlug(slug, locale),
  ]);

  if (!page || page.kind !== "corridor") notFound();

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
