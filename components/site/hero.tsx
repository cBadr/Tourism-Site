import { ArrowLeft, CircleCheck, Sparkles } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { SiteSettings } from "@/lib/site-config";
import { DEFAULT_LOCALE } from "@/lib/i18n-types";
import { getT } from "@/lib/i18n/content";
import { bookingHref, externalLinkProps, localeHref } from "./links";

/** نقاط الثقة الأربع تحت أزرار الحجز — النص من `site.hero.trust.*` */
const TRUST_POINTS = [
  { key: "trust.modernCars", label: "سيارات حديثة" },
  { key: "trust.professionalDrivers", label: "سائقون محترفون" },
  { key: "trust.clearPrices", label: "أسعار واضحة" },
  { key: "trust.support", label: "متابعة ٢٤/٧" },
] as const;

/**
 * قسم البطل: عنوان قوي مبني على شعار العلامة، سطر داعم من وصف السيو،
 * وزخارف هندسية متدرجة بلون العلامة — بلا صور جاهزة.
 * `content` اختياري من نظام الأقسام (المرحلة ٢) — عند غيابه يبقى الإخراج مطابقاً للمرحلة ١.
 *
 * المرحلة ٨: العنوان والوصف ونشاط الشركة تصل مترجمة من نظام المحتوى والإعدادات،
 * وأزرار البطل ونقاط الثقة من مساحة `site.hero`.
 */
export async function Hero({
  settings,
  content,
  locale = DEFAULT_LOCALE,
}: {
  settings: SiteSettings;
  content?: { headline?: string; sub?: string };
  locale?: string;
}) {
  const t = await getT("site.hero", locale);
  const booking = bookingHref(settings, locale);
  const headline = content?.headline ?? settings.brand.tagline;
  const sub = content?.sub ?? settings.seo.defaultDescription;

  return (
    <section className="site-hero-bg relative overflow-hidden">
      {/* طبقات زخرفية: توهجات بلون العلامة + نمط نقاط خافت */}
      <div aria-hidden="true" className="pointer-events-none absolute inset-0">
        <div className="site-float absolute -top-28 right-[10%] size-72 rounded-full bg-[color-mix(in_oklab,var(--primary)_16%,transparent)] blur-3xl" />
        <div className="site-float-slow absolute -bottom-36 left-[6%] size-96 rounded-full bg-[color-mix(in_oklab,var(--brand-accent)_18%,transparent)] blur-3xl" />
        <div className="site-dots absolute inset-0 opacity-70 [mask-image:radial-gradient(ellipse_60%_60%_at_50%_40%,black,transparent)]" />
        <div className="absolute inset-x-0 bottom-0 h-px bg-gradient-to-l from-transparent via-border to-transparent" />
      </div>

      <div className="relative mx-auto flex w-full max-w-6xl flex-col items-center gap-8 px-4 pb-24 pt-16 text-center sm:px-6 md:pb-32 md:pt-24">
        <span className="inline-flex items-center gap-2 rounded-full border border-primary/20 bg-primary/5 px-4 py-1.5 text-sm font-medium text-primary">
          <Sparkles className="size-4" aria-hidden="true" />
          {settings.company.activity}
        </span>

        <h1 className="max-w-3xl text-balance text-4xl font-extrabold leading-[1.25] tracking-tight sm:text-5xl sm:leading-[1.2] md:text-6xl md:leading-[1.15]">
          {headline}
        </h1>

        <p className="max-w-2xl text-pretty text-base leading-8 text-muted-foreground sm:text-lg sm:leading-9">
          {sub}
        </p>

        <div className="flex w-full flex-col items-center justify-center gap-3 sm:w-auto sm:flex-row">
          <a
            href={booking}
            {...externalLinkProps(booking)}
            className={cn(
              buttonVariants({ size: "lg" }),
              "h-12 w-full rounded-2xl px-8 text-base font-semibold shadow-lg shadow-primary/25 sm:w-auto"
            )}
          >
            {t("bookNow", "احجز الآن")}
            <ArrowLeft className="size-5" aria-hidden="true" />
          </a>
          <a
            href={localeHref("/#services", locale)}
            className={cn(
              buttonVariants({ variant: "outline", size: "lg" }),
              "h-12 w-full rounded-2xl bg-background/70 px-8 text-base font-semibold backdrop-blur sm:w-auto"
            )}
          >
            {t("exploreServices", "استكشف خدماتنا")}
          </a>
        </div>

        <ul className="mt-2 flex flex-wrap items-center justify-center gap-x-7 gap-y-3 text-sm font-medium text-muted-foreground">
          {TRUST_POINTS.map((point) => (
            <li key={point.key} className="flex items-center gap-2">
              <CircleCheck className="size-4 shrink-0 text-primary" aria-hidden="true" />
              {t(point.key, point.label)}
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
