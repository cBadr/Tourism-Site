import { ArrowLeft } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { bookingHref, externalLinkProps } from "@/components/site/links";
import type { SectionContentMap } from "@/lib/content-types";
import type { SiteSettings } from "@/lib/site-config";
import { DEFAULT_LOCALE } from "@/lib/i18n-types";

/**
 * ترويسة الصفحات الداخلية: نفس لغة قسم البطل (تدرج العلامة + نقاط خافتة)
 * بإيقاع أصغر، مع زر CTA اختياري يتبع سلسلة الحجز (واتساب ← هاتف ← تواصل).
 */
export function PageHeroSection({
  content,
  settings,
  locale = DEFAULT_LOCALE,
}: {
  content: SectionContentMap["page-hero"];
  settings: SiteSettings;
  locale?: string;
}) {
  const booking = bookingHref(settings, locale);

  return (
    <section className="site-hero-bg relative overflow-hidden">
      {/* زخارف: نقاط خافتة + توهج علوي بلون العلامة + خط فاصل سفلي */}
      <div aria-hidden="true" className="pointer-events-none absolute inset-0">
        <div className="site-dots absolute inset-0 opacity-60 [mask-image:radial-gradient(ellipse_70%_90%_at_50%_0%,black,transparent)]" />
        <div className="absolute -top-24 left-1/2 h-44 w-[24rem] -translate-x-1/2 rounded-full bg-[color-mix(in_oklab,var(--primary)_14%,transparent)] blur-3xl" />
        <div className="absolute -bottom-28 right-[8%] size-56 rounded-full bg-[color-mix(in_oklab,var(--brand-accent)_14%,transparent)] blur-3xl" />
        <div className="absolute inset-x-0 bottom-0 h-px bg-gradient-to-l from-transparent via-border to-transparent" />
      </div>

      <div className="relative mx-auto flex w-full max-w-6xl flex-col items-center gap-5 px-4 pb-16 pt-12 text-center sm:px-6 md:pb-20 md:pt-16">
        <h1 className="max-w-3xl text-balance text-3xl font-extrabold leading-[1.3] tracking-tight sm:text-4xl sm:leading-[1.25] md:text-5xl md:leading-[1.2]">
          {content.title}
        </h1>

        {content.sub ? (
          <p className="max-w-2xl text-pretty leading-8 text-muted-foreground sm:text-lg sm:leading-9">
            {content.sub}
          </p>
        ) : null}

        {content.ctaLabel ? (
          <a
            href={booking}
            {...externalLinkProps(booking)}
            className={cn(
              buttonVariants({ size: "lg" }),
              "mt-2 h-12 rounded-2xl px-8 text-base font-semibold shadow-lg shadow-primary/25"
            )}
          >
            {content.ctaLabel}
            <ArrowLeft className="size-5" aria-hidden="true" />
          </a>
        ) : null}
      </div>
    </section>
  );
}
