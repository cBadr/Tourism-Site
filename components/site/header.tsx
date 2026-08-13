import { Menu } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { SiteSettings } from "@/lib/site-config";
import { DEFAULT_LOCALE } from "@/lib/i18n-types";
import { getT } from "@/lib/i18n/content";
import { LocaleSwitcher } from "./locale-switcher";
import { bookingHref, externalLinkProps, localeHref, navLinks } from "./links";

/**
 * الترويسة الثابتة: هوية العلامة + تنقّل داخلي + زر «احجز الآن».
 * قائمة الجوال تعمل بلا JavaScript عبر عنصر details.
 *
 * المرحلة ٨: نصوص الترويسة من مساحة `site.header` (والقائمة من `site.nav`)،
 * والروابط تمر بـ localeHref فتبقى العربية بلا بادئة والإنجليزية تحت /en.
 * اسم العلامة وشعارها يصلان مترجمَين أصلاً داخل `settings`.
 */
export async function SiteHeader({
  settings,
  locale = DEFAULT_LOCALE,
}: {
  settings: SiteSettings;
  locale?: string;
}) {
  const [t, tNav] = await Promise.all([
    getT("site.header", locale),
    getT("site.nav", locale),
  ]);
  const booking = bookingHref(settings, locale);
  const links = navLinks(tNav, locale);

  return (
    <header className="sticky top-0 z-40 border-b border-border/60 bg-background/85 backdrop-blur-md">
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:absolute focus:end-4 focus:top-4 focus:z-50 focus:rounded-lg focus:bg-primary focus:px-4 focus:py-2 focus:text-primary-foreground"
      >
        {t("skipToContent", "تخطي إلى المحتوى")}
      </a>
      <div className="mx-auto flex h-16 w-full max-w-6xl items-center justify-between gap-4 px-4 sm:px-6">
        {/* هوية العلامة */}
        <a
          href={localeHref("/", locale)}
          className="flex items-center gap-3 rounded-xl outline-none focus-visible:ring-2 focus-visible:ring-ring/60"
          aria-label={settings.brand.name}
        >
          {settings.brand.logoUrl ? (
            // شعار مرفوع من الإعدادات — قد يكون رابطاً خارجياً، لذلك img عادية
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={settings.brand.logoUrl}
              alt={settings.brand.name}
              className="h-9 w-auto"
            />
          ) : (
            <>
              <span
                aria-hidden="true"
                className="grid size-9 shrink-0 place-items-center rounded-xl bg-primary text-lg font-bold text-primary-foreground shadow-sm"
              >
                {settings.brand.name.trim().charAt(0)}
              </span>
              <span className="text-base font-bold tracking-tight sm:text-lg">
                {settings.brand.name}
              </span>
            </>
          )}
        </a>

        {/* التنقل — شاشات متوسطة فأكبر */}
        <nav
          aria-label={t("mainNav", "التنقل الرئيسي")}
          className="hidden items-center gap-1 lg:flex"
        >
          {links.map((link) => (
            <a
              key={link.href}
              href={link.href}
              className="rounded-lg px-3 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60"
            >
              {link.label}
            </a>
          ))}
        </nav>

        <div className="flex items-center gap-2">
          {/*
           * مبدّل اللغة قبل زر الحجز — يحلّ لغته ومساره بنفسه من ترويستَي
           * الوسيط، ويختفي وحده حين تكون اللغة المفعّلة واحدة.
           */}
          <LocaleSwitcher />

          <a
            href={booking}
            {...externalLinkProps(booking)}
            className={cn(
              buttonVariants({ size: "lg" }),
              "rounded-xl px-5 font-semibold shadow-sm shadow-primary/20"
            )}
          >
            {t("bookNow", "احجز الآن")}
          </a>

          {/* قائمة الجوال — بلا JavaScript */}
          {/* العتبة `lg` لا `md`: بند «تابع حجزك» رفع روابط التنقّل إلى خمسة،
              ومع مبدّل اللغة (يظهر فور تفعيل لغة ثانية) يفيض الشريط بين ٧٦٨ و٨٦٠ بكسل. */}
          <details className="group relative lg:hidden">
            <summary
              className="grid size-9 cursor-pointer list-none place-items-center rounded-xl border border-border bg-background text-foreground transition-colors hover:bg-muted [&::-webkit-details-marker]:hidden"
              aria-label={t("menu", "القائمة")}
            >
              <Menu className="size-5" aria-hidden="true" />
            </summary>
            <nav
              aria-label={t("mobileNav", "قائمة التنقل للجوال")}
              className="absolute end-0 top-11 z-50 flex w-52 flex-col gap-1 rounded-2xl border border-border bg-background p-2 shadow-xl"
            >
              {links.map((link) => (
                <a
                  key={link.href}
                  href={link.href}
                  className="rounded-xl px-3 py-2.5 text-sm font-medium text-foreground transition-colors hover:bg-muted"
                >
                  {link.label}
                </a>
              ))}
            </nav>
          </details>
        </div>
      </div>
    </header>
  );
}
