import type { Metadata } from "next";
import { Cairo, Geist_Mono, Inter } from "next/font/google";
import { NextIntlClientProvider } from "next-intl";
import { getSettings } from "@/lib/settings";
import { getActiveLocale, getActiveLocaleDef } from "@/i18n/server";
import { Analytics } from "@/components/analytics";
import "./globals.css";

/**
 * الجذر — يحمل قرار اللغة كله في سمتين: `lang` و`dir`.
 *
 * لماذا لا `app/[locale]/layout.tsx`؟ لأن العربية بلا بادئة (القاعدة ١): مقطع
 * `[locale]` كان سيجرّ كل رابط عربي إلى `/ar/...`. اللغة تصل من ترويسة يضبطها
 * `proxy.ts`، فتبقى شجرة الصفحات واحدة كما هي.
 *
 * الخطوط: القاهري للعربية وInter للاتينية، وكلاهما محمّل دائماً (خطاف الخطوط
 * في Next لا يعمل داخل شرط). المستعمَل منهما يُحسم بمتغير `--font-sans` الذي
 * تقرؤه Tailwind من `@theme inline` في globals.css — فالتبديل بلا لمس أي
 * صنف أو متغير آخر في السمة.
 */

const cairo = Cairo({
  variable: "--font-arabic",
  subsets: ["arabic", "latin"],
  fallback: ["Segoe UI", "Tahoma", "sans-serif"],
});

const inter = Inter({
  variable: "--font-latin",
  subsets: ["latin"],
  fallback: ["Segoe UI", "Helvetica Neue", "Arial", "sans-serif"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

/**
 * العنوان الافتراضي وقالبه ووصف الموقع كلها نصوص مترجمة في `site_settings`،
 * فتُقرأ بلغة الطلب لا بالعربية دائماً — وإلا حمل تبويب المتصفح في `/en`
 * اسم علامة عربياً. `getSettings("ar")` تختصر إلى القراءة العربية نفسها.
 */
export async function generateMetadata(): Promise<Metadata> {
  const locale = await getActiveLocale();
  const settings = await getSettings(locale);
  return {
    title: {
      default: settings.brand.name,
      template: settings.seo.titleTemplate,
    },
    description: settings.seo.defaultDescription,
  };
}

export default async function RootLayout({ children }: LayoutProps<"/">) {
  const [settings, locale] = await Promise.all([getSettings(), getActiveLocaleDef()]);

  const brandVars = {
    "--primary": settings.brand.colors.primary,
    "--primary-foreground": settings.brand.colors.primaryForeground,
    "--brand-accent": settings.brand.colors.accent,
    // خط الواجهة تبعاً لاتجاه اللغة — يسبق ما تعرّفه أصناف next/font لأنه سطري
    "--font-sans": locale.dir === "rtl" ? "var(--font-arabic)" : "var(--font-latin)",
  } as React.CSSProperties;

  return (
    <html
      lang={locale.htmlLang}
      dir={locale.dir}
      style={brandVars}
      className={`${cairo.variable} ${inter.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col font-sans">
        {/* مزوّد الرسائل لجزر العميل (ويدجت البحث، مسار الحجز، نماذج الطلب) */}
        <NextIntlClientProvider>{children}</NextIntlClientProvider>
        <Analytics />
      </body>
    </html>
  );
}
