import type { Metadata } from "next";
import { CalendarRange, Landmark, PartyPopper, Users } from "lucide-react";
import { getSettings } from "@/lib/settings";
import { buildPageMetadata } from "@/lib/seo";
import { getLocalizedServices, getT, resolveLocale } from "@/lib/i18n/content";
import { readPlaceSearchSettings } from "@/lib/geo/place-search-settings";
import { SiteHeader } from "@/components/site/header";
import { SiteFooter } from "@/components/site/footer";
import { WhatsAppFab } from "@/components/site/whatsapp-fab";
import { localeHref } from "@/components/site/links";
import { readTripPrefill } from "./_lib/prefill";
import { readCampaignTags } from "./_lib/source";
import { QuoteRequestForm } from "./_components/quote-form";

/**
 * صفحة «اطلب عرض سعر» (/quote-request) — المسار الموازي للحاسبة الفورية:
 * الجولات والمناسبات والإيجار اليومي والمجموعات الكبيرة، أي ما لا يُختصر في
 * نقطتين على الخريطة. النموذج جزيرة عميل، والصفحة نفسها خادمية.
 *
 * يقبل ?service=slug لتحديد الخدمة مسبقاً (روابط صفحات الخدمات) — والـ slug
 * لا يُترجم أبداً، فالرابط نفسه يعمل من أي لغة.
 *
 * ويقبل **حمولة بطاقة الإنقاذ** كذلك: `from` و`to` و`passengers` و`pickup`،
 * وهي ما تكتبه `buildQuoteRequestHref` في `components/booking/offers.tsx` حين
 * تعجز الحاسبة عن الرحلة. كانت الصفحة تقرأ `service` وحده وتُسقط الأربعة —
 * فتقول البطاقة «ننقل معك تفاصيل رحلتك» ولا يصل شيء، والعميل يعيد الكتابة.
 * القراءة والتنقية في `_lib/prefill.ts`، وتركيب السطر في جزيرة العميل.
 *
 * ── 0127: وتقرأ **وسوم الحملة** كذلك (`utm_source` · `utm_medium` ·
 *    `utm_campaign`) ───────────────────────────────────────────────────────
 * بدر يريد أن يعرف من أيّ حملةٍ جاء كل طلب. والوسوم تُقرأ هنا على الخادم
 * وتُنقّى في `_lib/source.ts`، ثم تسافر مع جسم الطلب إلى `create_quote_request`.
 *
 * 🔒 وهي **مدخلُ مستخدم** لا واقعة: يكتبها الزائر في شريط العنوان. فالتنقية هنا
 *    قصٌّ مبكر، والحاجز ثلاث طبقاتٍ في القاعدة (‏هجرة 0127 §٢ و§٣).
 * ⚠ **ولا يُقرأ المُحيل هنا**: `document.referrer` لا يعرفه الخادم إلا من ترويسة
 *    قد تُحذف أو تُزوَّر، وقراءتها كانت ستجعل الصفحة ديناميكية على الترويسة.
 *    فالمُحيل يُقرأ في جزيرة العميل عند التركيب.
 */

type QuoteRequestPageProps = {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
};

export async function generateMetadata(): Promise<Metadata> {
  const locale = await resolveLocale();
  const t = await getT("pages.quoteRequest", locale);
  return buildPageMetadata({
    title: t("metaTitle", "اطلب عرض سعر"),
    description: t(
      "metaDescription",
      "رحلتك خارج الحاسبة الفورية؟ اطلب عرض سعر مخصص للجولات السياحية والمناسبات والإيجار اليومي والمجموعات الكبيرة — نرد عليك بعرض واضح."
    ),
    path: "/quote-request",
    locale,
  });
}

/** متى تُستخدم هذه الصفحة بدل الحاسبة الفورية */
const USE_CASES = [
  {
    key: "tours",
    icon: Landmark,
    title: "جولات بعدة محطات",
    text: "برنامج يوم كامل بأكثر من وجهة — نسعّره كبرنامج لا كرحلة بين نقطتين.",
  },
  {
    key: "events",
    icon: PartyPopper,
    title: "مناسبات وحفلات",
    text: "تحركات منظمة بمواعيد دقيقة وأكثر من سيارة في وقت واحد.",
  },
  {
    key: "daily",
    icon: CalendarRange,
    title: "إيجار يومي أو لعدة أيام",
    text: "سيارة بسائق تحت تصرفك بالساعة أو باليوم، بسعر متفق عليه مسبقاً.",
  },
  {
    key: "groups",
    icon: Users,
    title: "مجموعات ووفود كبيرة",
    text: "أعداد تتجاوز سيارة واحدة — نرتّب الأسطول المناسب لها.",
  },
] as const;

export default async function QuoteRequestPage({ searchParams }: QuoteRequestPageProps) {
  const locale = await resolveLocale();
  const [settings, t, services, params, placeSearch] = await Promise.all([
    getSettings(locale),
    getT("pages.quoteRequest", locale),
    getLocalizedServices(locale),
    searchParams,
    // إعدادات البحث الرباعي — نفس ما يقرؤه `/book`، فالحقلان هنا وهناك سواء
    readPlaceSearchSettings(),
  ]);

  const requested = typeof params.service === "string" ? params.service : "";
  const defaultService = services.some((service) => service.slug === requested)
    ? requested
    : undefined;

  // 🔒 اقتراح تعبئة يحرّره العميل، لا واقعة تُخزَّن — والتنقية تحرس الحقل والتخطيط
  const tripPrefill = readTripPrefill(params);

  // 0127 — وسوم الحملة من الرابط: مدخلُ مستخدمٍ يُقصّ هنا ويُحرَس في القاعدة
  const campaign = readCampaignTags(params);

  return (
    <>
      <SiteHeader settings={settings} locale={locale} />

      <main id="main" className="flex-1">
        {/* ترويسة الصفحة */}
        <section className="site-hero-bg relative overflow-hidden">
          <div aria-hidden="true" className="pointer-events-none absolute inset-0">
            <div className="site-dots absolute inset-0 opacity-60 [mask-image:radial-gradient(ellipse_70%_90%_at_50%_0%,black,transparent)]" />
            <div className="absolute -top-24 left-1/2 h-44 w-[24rem] -translate-x-1/2 rounded-full bg-[color-mix(in_oklab,var(--primary)_14%,transparent)] blur-3xl" />
            <div className="absolute inset-x-0 bottom-0 h-px bg-gradient-to-l from-transparent via-border to-transparent" />
          </div>

          <div className="relative mx-auto flex w-full max-w-3xl flex-col items-center gap-4 px-4 pb-12 pt-12 text-center sm:px-6 md:pb-16 md:pt-16">
            <h1 className="text-balance text-3xl font-extrabold leading-[1.3] tracking-tight sm:text-4xl">
              {t("title", "اطلب عرض سعر مخصص")}
            </h1>
            <p className="max-w-2xl text-pretty leading-8 text-muted-foreground sm:text-lg sm:leading-9">
              {t(
                "lead",
                "للجولات والمناسبات والإيجار اليومي وكل ما لا تحسبه آلة التسعير الفوري — اكتب لنا تفاصيل رحلتك ويصلك عرض واضح من فريقنا."
              )}
            </p>
            <a
              href={localeHref("/book", locale)}
              className="text-sm font-medium text-primary underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
            >
              {t("calculatorLink", "رحلتك بين نقطتين؟ احسب سعرها فوراً")}
            </a>
          </div>
        </section>

        {/* النموذج */}
        <section className="py-10 md:py-14">
          <div className="mx-auto w-full max-w-2xl px-4 sm:px-6">
            <QuoteRequestForm
              defaultService={defaultService}
              tripPrefill={tripPrefill}
              campaign={campaign}
              services={services}
              placeSearch={placeSearch}
              locale={locale}
            />
          </div>
        </section>

        {/* متى تُستخدم */}
        <section className="bg-muted/40 py-14 md:py-20">
          <div className="mx-auto w-full max-w-5xl px-4 sm:px-6">
            <h2 className="text-center text-2xl font-bold tracking-tight sm:text-3xl">
              {t("useCasesTitle", "متى تطلب عرضاً مخصصاً؟")}
            </h2>
            <ul className="mt-10 grid gap-5 sm:grid-cols-2">
              {USE_CASES.map((item) => {
                const Icon = item.icon;
                return (
                  <li
                    key={item.key}
                    className="flex items-start gap-4 rounded-2xl border border-border bg-card p-5 text-card-foreground"
                  >
                    <span className="grid size-11 shrink-0 place-items-center rounded-2xl bg-primary/10 text-primary">
                      <Icon className="size-5" aria-hidden="true" />
                    </span>
                    <div className="flex flex-col gap-1.5">
                      <h3 className="text-base font-bold leading-snug">
                        {t(`useCases.${item.key}.title`, item.title)}
                      </h3>
                      <p className="text-sm leading-7 text-muted-foreground">
                        {t(`useCases.${item.key}.text`, item.text)}
                      </p>
                    </div>
                  </li>
                );
              })}
            </ul>
          </div>
        </section>
      </main>

      <SiteFooter settings={settings} locale={locale} />
      <WhatsAppFab settings={settings} locale={locale} />
    </>
  );
}
