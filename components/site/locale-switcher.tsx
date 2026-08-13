import { Check, Globe } from "lucide-react";
import { cn } from "@/lib/utils";
import { getEnabledLocales } from "@/i18n/locales";
import { getActiveLocale, getActivePath, hrefForLocale } from "@/i18n/server";
import type { LocaleDef } from "@/i18n/config";
import { getT } from "@/lib/i18n/content";

/**
 * مبدّل لغة الموقع — مكوّن خادمي بلا أي JavaScript على العميل.
 *
 * ثلاثة قرارات تفسّر شكله:
 *
 * (١) **يبقيك مكانك.** الرابط يُبنى من المسار الحالي بعد قشر بادئة اللغة ومعه
 *     سلسلة الاستعلام (`x-locale-path` من الوسيط)، فمن كان على
 *     `/services/airport-transfer?x=1` ينتقل إلى `/en/services/airport-transfer?x=1`
 *     لا إلى الصفحة الرئيسية. إعادة الزائر إلى البداية عند تغيير اللغة أسوأ من
 *     عدم عرض المبدّل أصلاً.
 *
 * (٢) **روابط حقيقية لا أزرار.** التبديل تنقّل، فيستحق `<a href>`: يعمل بالكيبورد
 *     ومع قارئ الشاشة وبفتح في تبويب جديد، ويزحف عليه محرك البحث فيكتشف النسخة
 *     الأخرى. مع لغتين نعرض رابطاً واحداً مباشراً؛ ومع ثلاث فأكثر قائمة
 *     `details/summary` الأصلية — نفس نمط قائمة الجوال في الترويسة، ومفتوحة
 *     بالكيبورد بلا سطر JavaScript.
 *
 * (٣) **لا يظهر بلا داعٍ.** لغة واحدة مفعّلة = لا مبدّل.
 *
 * النصوص تمر بـ `getT` لا بـ `getTranslations` مباشرة: القاعدة الرابعة في عقد
 * المرحلة تقول إن غياب المفتاح يعني النص العربي لا المفتاح الخام — و`getT` هي
 * التي تضمن ذلك في كل المشروع.
 */

type LocaleSwitcherProps = {
  className?: string;
  /** "menu" للترويسة (مضغوط)، "inline" لصف روابط في التذييل */
  variant?: "menu" | "inline";
};

const linkClass =
  "rounded-lg px-3 py-2 text-sm font-medium transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60";

/** الاسم كما يكتبه أهل اللغة — بلغته واتجاهه حتى لا ينقلب داخل صفحة معاكسة */
function NativeName({ locale }: { locale: LocaleDef }) {
  return (
    <span lang={locale.htmlLang} dir={locale.dir}>
      {locale.nativeName}
    </span>
  );
}

export async function LocaleSwitcher({
  className,
  variant = "menu",
}: LocaleSwitcherProps) {
  const activeCode = await getActiveLocale();
  const [locales, currentPath, t] = await Promise.all([
    getEnabledLocales(),
    getActivePath(),
    getT("site.localeSwitcher", activeCode),
  ]);

  if (locales.length < 2) return null;

  const active = locales.find((locale) => locale.code === activeCode) ?? locales[0];
  const others = locales.filter((locale) => locale.code !== active.code);

  /* صف روابط مكشوف — للتذييل */
  if (variant === "inline") {
    return (
      <nav
        aria-label={t("menuLabel", "اختيار لغة الموقع")}
        className={cn("flex flex-wrap items-center gap-1", className)}
      >
        {locales.map((locale) => {
          const isActive = locale.code === active.code;
          return (
            <a
              key={locale.code}
              href={hrefForLocale(locale.code, currentPath)}
              hrefLang={locale.htmlLang}
              lang={locale.htmlLang}
              aria-current={isActive ? "true" : undefined}
              aria-label={
                isActive
                  ? t("current", "اللغة الحالية: {language}", { language: locale.nativeName })
                  : t("switchTo", "عرض الموقع بلغة {language}", { language: locale.nativeName })
              }
              className={cn(
                linkClass,
                isActive ? "text-foreground" : "text-muted-foreground hover:text-foreground"
              )}
            >
              <NativeName locale={locale} />
            </a>
          );
        })}
      </nav>
    );
  }

  /* لغتان: رابط واحد مباشر — أقصر طريق وأقل نقرة */
  if (others.length === 1) {
    const target = others[0];
    return (
      <a
        href={hrefForLocale(target.code, currentPath)}
        hrefLang={target.htmlLang}
        lang={target.htmlLang}
        aria-label={t("switchTo", "عرض الموقع بلغة {language}", { language: target.nativeName })}
        className={cn(
          linkClass,
          "inline-flex items-center gap-1.5 border border-border text-muted-foreground hover:text-foreground",
          className
        )}
      >
        <Globe className="size-4 shrink-0" aria-hidden="true" />
        <NativeName locale={target} />
      </a>
    );
  }

  /* ثلاث لغات فأكثر: قائمة أصلية تعمل بلا JavaScript */
  return (
    <details className={cn("group relative", className)}>
      <summary
        aria-label={t("menuLabel", "اختيار لغة الموقع")}
        className="inline-flex cursor-pointer list-none items-center gap-1.5 rounded-lg border border-border px-3 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60 [&::-webkit-details-marker]:hidden"
      >
        <Globe className="size-4 shrink-0" aria-hidden="true" />
        <NativeName locale={active} />
      </summary>

      <nav
        aria-label={t("menuLabel", "اختيار لغة الموقع")}
        className="absolute end-0 top-11 z-50 flex w-48 flex-col gap-1 rounded-2xl border border-border bg-background p-2 shadow-xl"
      >
        {locales.map((locale) => {
          const isActive = locale.code === active.code;
          return (
            <a
              key={locale.code}
              href={hrefForLocale(locale.code, currentPath)}
              hrefLang={locale.htmlLang}
              lang={locale.htmlLang}
              aria-current={isActive ? "true" : undefined}
              aria-label={
                isActive
                  ? t("current", "اللغة الحالية: {language}", { language: locale.nativeName })
                  : t("switchTo", "عرض الموقع بلغة {language}", { language: locale.nativeName })
              }
              className={cn(
                "flex items-center justify-between gap-2 rounded-xl px-3 py-2.5 text-sm font-medium transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60",
                isActive ? "text-foreground" : "text-muted-foreground"
              )}
            >
              <NativeName locale={locale} />
              {isActive ? (
                <Check className="size-4 shrink-0 text-primary" aria-hidden="true" />
              ) : null}
            </a>
          );
        })}
      </nav>
    </details>
  );
}

export default LocaleSwitcher;
