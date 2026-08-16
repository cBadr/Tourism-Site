import type { Metadata } from "next";
import { Geist_Mono } from "next/font/google";
import localFont from "next/font/local";
import { NextIntlClientProvider } from "next-intl";
import { getSettings } from "@/lib/settings";
import { paletteVars } from "@/lib/site-config";
import { getActiveLocale, getActiveLocaleDef } from "@/i18n/server";
import { AnalyticsTags } from "@/lib/analytics/tags";
import { normalizeIntegrations, resolveIntegration } from "@/lib/analytics/services";
import "./globals.css";

/**
 * الجذر — يحمل قرار اللغة كله في سمتين: `lang` و`dir`.
 *
 * لماذا لا `app/[locale]/layout.tsx`؟ لأن العربية بلا بادئة (القاعدة ١): مقطع
 * `[locale]` كان سيجرّ كل رابط عربي إلى `/ar/...`. اللغة تصل من ترويسة يضبطها
 * `proxy.ts`، فتبقى شجرة الصفحات واحدة كما هي.
 *
 * ── الخطوط: Alexandria + IBM Plex Sans Arabic، محليّان (القرار ٢٦) ───────────
 *
 * كان هنا `Cairo` و`Inter` من Google Fonts. والتصميم يقوم على خطّين آخرين،
 * وملفاتهما الاثنا عشر مشحونةٌ في `public/fonts/` منذ م‑٣ — **ولم يسجّلها أحد**.
 * فكان `--font-display` و`--font-body` في `globals.css` يسقطان كلاهما إلى
 * `--font-sans` أي القاهري، والصفحة تُصيَّر بخطّ التصميم القديم كاملاً.
 *
 * **ولماذا أربع مناداة لا اثنتان؟** لأن `next/font/local` يقبل `unicode-range`
 * في `declarations` وحدها، و`declarations` تسري على **كل** ملفات المناداة. فكل
 * خطٍّ يُسجَّل مرّتين: نداءٌ للنطاق العربي ونداءٌ للنطاق اللاتيني، بنفس النطاقات
 * المكتوبة في `Tours-02/landing/assets/css/fonts.css` حرفاً. والثمرة قياسية:
 * القارئ العربي لا ينزّل ملفّاً لاتينياً واحداً، والعكس بالعكس — بلا `preload`
 * للنطاق الثاني لأن المتصفح لا يطلبه إلا إن ظهر حرفٌ من مداه.
 *
 * ولهذا **سقط تبديل الخط بحسب الاتجاه**: النطاقان يحسمان الأمر لكل حرف على حدة،
 * فصفحة `/en` تنال Latin تلقائياً من نفس العائلة — لا من عائلة ثانية تُبدَّل.
 */

/*
 * 🔴 **النطاقان مكرّران أربع مرات حرفياً — ولا يُختصران في ثابت. أبداً.**
 *
 * `next/font` مُحلَّل **من نصّ المصدر وقت البناء** ولا يُنفَّذ الملف قط، فكل خيار
 * يجب أن يكون قيمةً مكتوبة في موضعها. و`const` مرفوعٌ فوق النداء — مهما بدا
 * ثابتاً بداهةً — يُسقط البناء كلَّه برسالة:
 *
 *     Build Error: Font loader values must be explicitly written literals.
 *
 * وقد أسقطه فعلاً في هذه الجلسة. فمن رأى التكرار قبحاً فليقرأ هذا السطر قبل أن
 * «ينظّفه»: القبح هنا **الشكل الوحيد المقبول**، والقاعدة تسري على `src`
 * و`weight` و`display` و`variable` كذلك لا على `declarations` وحدها.
 *
 * ومصدر النطاقين: `Tours-02\landing\assets\css\fonts.css` — منقولان بلا تعديل.
 */

/** خطّ العناوين — ثلاثة أوزان (٦٠٠·٧٠٠·٨٠٠)، والتصميم يكتب العناوين بـ٨٠٠ */
const alexandriaArabic = localFont({
  variable: "--font-alexandria-ar",
  display: "swap",
  declarations: [
    {
      prop: "unicode-range",
      value:
        "U+0600-06FF,U+0750-077F,U+0870-088E,U+0890-0891,U+0898-08E1,U+08E3-08FF,U+200C-200E,U+2010-2011,U+204F,U+2E41,U+FB50-FDFF,U+FE70-FE74,U+FE76-FEFC",
    },
  ],
  src: [
    { path: "../public/fonts/alexandria-arabic-600-normal.woff2", weight: "600", style: "normal" },
    { path: "../public/fonts/alexandria-arabic-700-normal.woff2", weight: "700", style: "normal" },
    { path: "../public/fonts/alexandria-arabic-800-normal.woff2", weight: "800", style: "normal" },
  ],
});

const alexandriaLatin = localFont({
  variable: "--font-alexandria-latin",
  display: "swap",
  // لا `preload`: الصفحة عربية، فلا يُحجز عرض النطاق لملفٍّ قد لا يُطلب أصلاً
  preload: false,
  declarations: [
    {
      prop: "unicode-range",
      value:
        "U+0000-00FF,U+0131,U+0152-0153,U+02BB-02BC,U+02C6,U+02DA,U+02DC,U+0304,U+0308,U+0329,U+2000-206F,U+20AC,U+2122,U+2191,U+2193,U+2212,U+2215,U+FEFF,U+FFFD",
    },
  ],
  src: [
    { path: "../public/fonts/alexandria-latin-600-normal.woff2", weight: "600", style: "normal" },
    { path: "../public/fonts/alexandria-latin-700-normal.woff2", weight: "700", style: "normal" },
    { path: "../public/fonts/alexandria-latin-800-normal.woff2", weight: "800", style: "normal" },
  ],
});

/** خطّ المتن — ثلاثة أوزان (٤٠٠·٥٠٠·٦٠٠) */
const plexArabic = localFont({
  variable: "--font-plex-ar",
  display: "swap",
  declarations: [
    {
      prop: "unicode-range",
      value:
        "U+0600-06FF,U+0750-077F,U+0870-088E,U+0890-0891,U+0898-08E1,U+08E3-08FF,U+200C-200E,U+2010-2011,U+204F,U+2E41,U+FB50-FDFF,U+FE70-FE74,U+FE76-FEFC",
    },
  ],
  src: [
    { path: "../public/fonts/ibm-plex-sans-arabic-arabic-400-normal.woff2", weight: "400", style: "normal" },
    { path: "../public/fonts/ibm-plex-sans-arabic-arabic-500-normal.woff2", weight: "500", style: "normal" },
    { path: "../public/fonts/ibm-plex-sans-arabic-arabic-600-normal.woff2", weight: "600", style: "normal" },
  ],
});

const plexLatin = localFont({
  variable: "--font-plex-latin",
  display: "swap",
  preload: false,
  declarations: [
    {
      prop: "unicode-range",
      value:
        "U+0000-00FF,U+0131,U+0152-0153,U+02BB-02BC,U+02C6,U+02DA,U+02DC,U+0304,U+0308,U+0329,U+2000-206F,U+20AC,U+2122,U+2191,U+2193,U+2212,U+2215,U+FEFF,U+FFFD",
    },
  ],
  src: [
    { path: "../public/fonts/ibm-plex-sans-arabic-latin-400-normal.woff2", weight: "400", style: "normal" },
    { path: "../public/fonts/ibm-plex-sans-arabic-latin-500-normal.woff2", weight: "500", style: "normal" },
    { path: "../public/fonts/ibm-plex-sans-arabic-latin-600-normal.woff2", weight: "600", style: "normal" },
  ],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

/** كومة الخطّ الواحدة: العربي أولاً ثم اللاتيني ثم احتياطيّا النظام */
const DISPLAY_STACK =
  "var(--font-alexandria-ar), var(--font-alexandria-latin), 'Segoe UI', Tahoma, sans-serif";
const BODY_STACK =
  "var(--font-plex-ar), var(--font-plex-latin), 'Segoe UI', Tahoma, sans-serif";

/**
 * العنوان الافتراضي وقالبه ووصف الموقع كلها نصوص مترجمة في `site_settings`،
 * فتُقرأ بلغة الطلب لا بالعربية دائماً — وإلا حمل تبويب المتصفح في `/en`
 * اسم علامة عربياً. `getSettings("ar")` تختصر إلى القراءة العربية نفسها.
 *
 * ── المرحلة ١٠: وسما التحقق (Search Console وBing) ──────────────────────────
 * يخرجان من هنا لا من `<head>` مكتوب بيد: لا وسم head يدوي في هذا المشروع
 * إطلاقاً، و`metadata.verification` هي واجهة Next الرسمية لهما
 * (`google` ⇒ google-site-verification، و`other["msvalidate.01"]` ⇒ بينج).
 *
 * القرار ٧: الحقل **يغيب تماماً** حين تكون الخدمة مطفأة أو بلا معرّف — لا وسم
 * فارغ ولا وسم بقيمة null. و`resolveIntegration` تُعيد فحص صيغة المعرّف قبل
 * إخراجه، فصفٌّ عُدّل بيد في القاعدة لا يزرع نصاً عشوائياً في ترويسة كل صفحة.
 */
export async function generateMetadata(): Promise<Metadata> {
  const locale = await getActiveLocale();
  const settings = await getSettings(locale);

  const integrations = normalizeIntegrations(settings.integrations);
  const google = resolveIntegration("gsc", integrations.gsc).id;
  const bing = resolveIntegration("bing", integrations.bing).id;

  return {
    title: {
      default: settings.brand.name,
      template: settings.seo.titleTemplate,
    },
    description: settings.seo.defaultDescription,
    ...(google || bing
      ? {
          verification: {
            ...(google ? { google } : {}),
            ...(bing ? { other: { "msvalidate.01": bing } } : {}),
          },
        }
      : {}),
  };
}

export default async function RootLayout({ children }: LayoutProps<"/">) {
  const [settings, locale] = await Promise.all([getSettings(), getActiveLocaleDef()]);

  /**
   * لوحة التصميم كاملةً من `site_settings` إلى `<html style>`.
   *
   * ── لماذا **كلّها** لا ثلاثة مفاتيح ─────────────────────────────────────────
   * السمة السطرية تسبق `:root` دائماً — وهذه كانت المشكلة لا الحلّ: ثلاثة رموز
   * محقونة كانت تُملي درجةَ لونها على السبعة عشر كلها عبر الاشتقاق في
   * `globals.css`، فلا يبقى للتصميم موضعٌ يفوز فيه. والآن تُحقن الطبقةُ نفسها
   * التي كانت تُشتقّ: ما في القاعدة هو ما يظهر، حرفاً بحرف.
   *
   * والقيم المحقونة **ليست موثوقة كنصّ CSS حرّ**: تمرّ من `paletteVars` التي
   * ترفض ما ليس قيمة لون (`lib/site-config.ts`)، لأن `site_settings` قابل
   * للتعديل من اللوحة ومن PostgREST، وقيمةٌ مثل `red;} html{display:none` كانت
   * ستخرج إلى سمةٍ سطرية على `<html>`.
   *
   * ورمزٌ غائبٌ من الصفّ لا يُحقن أصلاً فيسقط إلى قيمة `:root` في `globals.css` —
   * وهي **نفس قيم التصميم**، فالصفحة لا تظهر بلا هوية في أي حال.
   */
  const brandVars = {
    ...paletteVars(settings.brand.colors),
    // الخطّان: العناوين Alexandria والمتن IBM Plex — وكلاهما يغطّي العربية
    // واللاتينية بنطاقَي يونيكود، فلا تبديل بحسب الاتجاه بعد اليوم.
    "--font-display": DISPLAY_STACK,
    "--font-body": BODY_STACK,
    "--font-sans": BODY_STACK,
  } as React.CSSProperties;

  return (
    <html
      lang={locale.htmlLang}
      dir={locale.dir}
      style={brandVars}
      className={`${alexandriaArabic.variable} ${alexandriaLatin.variable} ${plexArabic.variable} ${plexLatin.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col font-sans">
        {/* مزوّد الرسائل لجزر العميل (ويدجت البحث، مسار الحجز، نماذج الطلب) */}
        <NextIntlClientProvider>{children}</NextIntlClientProvider>
        {/* وسوم القياس من اللوحة (المرحلة ١٠) — ترجع null بلا أي سكربت حين
            لا خدمة مضبوطة ومفعّلة. وسما التحقق في generateMetadata أعلاه. */}
        <AnalyticsTags />
      </body>
    </html>
  );
}
