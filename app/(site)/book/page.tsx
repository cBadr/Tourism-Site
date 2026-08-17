import type { Metadata } from "next";
import { BadgeCheck, Clock, Route, Users } from "lucide-react";
import { getSettings } from "@/lib/settings";
import { buildPageMetadata } from "@/lib/seo";
import { getT, resolveLocale } from "@/lib/i18n/content";
import { SiteHeader } from "@/components/site/header";
import { SiteFooter } from "@/components/site/footer";
import { WhatsAppFab } from "@/components/site/whatsapp-fab";
import { SearchWidget } from "@/components/booking/search-widget";
import { PromoBanners } from "@/components/booking/promo-banner";
import { getPublicExtras } from "@/components/booking/extras-catalog";
import { getFleetCaps } from "@/components/booking/fleet-luggage";
import { getPromoBanners } from "@/lib/discounts/banners";
import { isDiscountEnabled } from "@/lib/discounts/settings";
import { isLoyaltyEnabled } from "@/lib/loyalty/settings";
import { readPlaceSearchSettings } from "@/lib/geo/place-search-settings";

/**
 * صفحة الحجز (/book) — الصفحة المخصصة لمحرك التسعير: ترويسة قصيرة،
 * ويدجت البحث بعرض كامل، ثم نقاط ثقة تشرح ما يعنيه السعر المعروض.
 *
 * صفحة خادمية: تقرأ الإعدادات وتمرر قنوات التواصل إلى الويدجت (جزيرة العميل)
 * حتى تبقى كل بيانات العلامة خارج كود المكوّنات (انضباط الـ whitelabel).
 *
 * المرحلة ٨: كل نص هنا من مساحة `pages.book`، واللغة تُمرَّر إلى الويدجت
 * فتُنسَّق الأسعار والمسافات بلغة الزائر.
 */

export async function generateMetadata(): Promise<Metadata> {
  const locale = await resolveLocale();
  const t = await getT("pages.book", locale);
  return buildPageMetadata({
    title: t("metaTitle", "احجز رحلتك"),
    description: t(
      "metaDescription",
      "احسب سعر رحلتك بالكيلومتر في ثوانٍ: حدد نقطة الانطلاق والوصول وعدد الركاب، واحصل على سعر واضح لكل فئة سيارة مناسبة قبل الحجز."
    ),
    path: "/book",
    locale,
  });
}

/** نقاط الثقة أسفل الويدجت — تشرح قيمة السعر الفوري بلا وعود تشغيلية */
const TRUST_POINTS = [
  {
    key: "perKm",
    icon: Route,
    title: "سعر بالكيلومتر لا بالتخمين",
    text: "المسافة تُحسب على الطريق الفعلي بين نقطتَي رحلتك، والسعر يبنى عليها مباشرة.",
  },
  {
    key: "autoClass",
    icon: Users,
    title: "الفئة المناسبة تلقائياً",
    text: "نرشّح لك أصغر سيارة تتسع لمجموعتك، ونعرض الفئة الأعلى إن أردت راحة أوسع.",
  },
  {
    key: "clearTerms",
    icon: BadgeCheck,
    title: "بنود واضحة بلا مفاجآت",
    text: "كل عرض يعرض تفاصيله: المصروف الأساسي، المسافة، الانتظار، والخدمات الإضافية إن اخترتها.",
  },
  {
    key: "instantEdit",
    icon: Clock,
    // ساعات الانتظار لم تعد حقلاً يغيّره الزائر (الدفعة ٣) — والنص كان يعد
    // بحقل محذوف، وهو بالضبط «شاشة تَعِد بما لا تفعله».
    title: "تعديل الرحلة في ثوانٍ",
    text: "غيّر عدد الركاب أو الحقائب أو موعد العودة أو نوع الرحلة، ويتحدث السعر فوراً.",
  },
] as const;

export default async function BookPage() {
  const locale = await resolveLocale();
  // الخصومات (المرحلة ١٢أ): الصفحة الخادمية وحدها تقرأ `site_settings` وجدول
  // البانرات، وتمرّرهما props إلى جزيرة العميل — فلا يقرأ المتصفح إعداداً ولا
  // يستنتج وجود حملة من غياب حقل. البانرات محتوى عرض بلا أثر على أي سعر.
  const [
    settings,
    t,
    offerBanners,
    checkoutBanners,
    discountEnabled,
    loyaltyEnabled,
    extras,
    fleet,
    placeSearch,
  ] = await Promise.all([
      getSettings(locale),
      getT("pages.book", locale),
      getPromoBanners("offers"),
      getPromoBanners("checkout"),
      isDiscountEnabled(),
      // راية الولاء (١٢ب) — رايةٌ لا رقم، والصفحة الخادمية وحدها تقرؤها
      isLoyaltyEnabled(),
      // كتالوج الخدمات الإضافية (0031) — الصفحة الخادمية وحدها تقرؤه
      getPublicExtras(),
      // سقفا عدّادَي الركاب والحقائب من الأسطول النشط — **قراءة واحدة للرقمين**:
      // بدونهما يصعد العدّادان إلى ثابتيهما (٦٠ راكباً و٢٠ حقيبة) فيعرضان على
      // العميل أرقاماً تضمن معها القاعدةُ صفرَ عروض. والفشل يعيد null للرقمين
      // فيبقى الثابتان كما كانا.
      getFleetCaps(),
      // إعدادات بحث الأماكن (0076) — نفس القراءة التي يفعلها `BookingWidget`،
      // ولأن هذه الصفحة تُركّب `SearchWidget` مباشرةً لا عبر الغلاف.
      readPlaceSearchSettings(),
    ]);
  const contact = {
    whatsapp: settings.contact.whatsapp,
    phone: settings.contact.phone,
  };

  return (
    <>
      <SiteHeader settings={settings} locale={locale} />

      <main id="main" className="flex-1">
        {/* ترويسة الصفحة — نفس لغة الصفحات الداخلية */}
        <section className="site-hero-bg relative overflow-hidden">
          <div aria-hidden="true" className="pointer-events-none absolute inset-0">
            <div className="site-dots absolute inset-0 opacity-60 [mask-image:radial-gradient(ellipse_70%_90%_at_50%_0%,black,transparent)]" />
            <div className="absolute -top-24 left-1/2 h-44 w-[24rem] -translate-x-1/2 rounded-full bg-[color-mix(in_oklab,var(--primary)_14%,transparent)] blur-3xl" />
            <div className="absolute inset-x-0 bottom-0 h-px bg-gradient-to-l from-transparent via-border to-transparent" />
          </div>

          <div className="relative mx-auto flex w-full max-w-4xl flex-col items-center gap-4 px-4 pb-12 pt-12 text-center sm:px-6 md:pb-16 md:pt-16">
            <h1 className="text-balance text-3xl font-extrabold leading-[1.3] tracking-tight sm:text-4xl md:text-5xl md:leading-[1.2]">
              {t("title", "احسب سعر رحلتك واحجز في دقيقة")}
            </h1>
            <p className="max-w-2xl text-pretty leading-8 text-muted-foreground sm:text-lg sm:leading-9">
              {t(
                "lead",
                "حدد نقطة الانطلاق والوصول وعدد الركاب، ونعرض لك سعر كل فئة سيارة مناسبة فوراً — بتفاصيل واضحة قبل أي التزام."
              )}
            </p>
          </div>
        </section>

        {/* الويدجت بعرض كامل */}
        <section className="py-10 md:py-14">
          <div className="mx-auto flex w-full max-w-4xl flex-col gap-4 px-4 sm:px-6">
            {/*
              موضع «شاشة العروض» هنا **على مستوى الصفحة** لا داخل النتائج: هذه
              الصفحة هي شاشة العروض بعينها، والبانر فوق الويدجت يظل مرئياً بعد
              ظهور النتائج. ولذلك لا يُمرَّر `offerBanners` إلى الويدجت أيضاً —
              وإلا ظهر البانر نفسه مرتين في الشاشة الواحدة.
            */}
            <PromoBanners banners={offerBanners} />
            <SearchWidget
              contact={contact}
              locale={locale}
              discountEnabled={discountEnabled}
              loyaltyEnabled={loyaltyEnabled}
              checkoutBanners={checkoutBanners}
              extras={extras}
              maxLuggage={fleet.maxLuggage}
              maxPassengers={fleet.maxPassengers}
              placeSearch={placeSearch}
            />
          </div>
        </section>

        {/* نقاط الثقة */}
        <section className="bg-muted/40 py-14 md:py-20">
          <div className="mx-auto w-full max-w-5xl px-4 sm:px-6">
            <h2 className="text-center text-2xl font-bold tracking-tight sm:text-3xl">
              {t("trustTitle", "لماذا السعر هنا واضح؟")}
            </h2>
            <ul className="mt-10 grid gap-5 sm:grid-cols-2">
              {TRUST_POINTS.map((point) => {
                const Icon = point.icon;
                return (
                  <li
                    key={point.key}
                    className="flex items-start gap-4 rounded-2xl border border-border bg-card p-5 text-card-foreground"
                  >
                    <span className="grid size-11 shrink-0 place-items-center rounded-2xl bg-primary/10 text-primary">
                      <Icon className="size-5" aria-hidden="true" />
                    </span>
                    <div className="flex flex-col gap-1.5">
                      <h3 className="text-base font-bold leading-snug">
                        {t(`trust.${point.key}.title`, point.title)}
                      </h3>
                      <p className="text-sm leading-7 text-muted-foreground">
                        {t(`trust.${point.key}.text`, point.text)}
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
