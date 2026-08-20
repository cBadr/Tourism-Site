import type { Metadata } from "next";
import { Geist_Mono } from "next/font/google";
import localFont from "next/font/local";
import { NextIntlClientProvider } from "next-intl";
import { getSettings } from "@/lib/settings";
import { PALETTE_PREFIX, paletteVars } from "@/lib/site-config";
import { getActiveLocale, getActiveLocaleDef } from "@/i18n/server";
import { AnalyticsTags } from "@/lib/analytics/tags";
import { normalizeIntegrations, resolveIntegration } from "@/lib/analytics/services";
import { SiteTimeZoneSync } from "@/components/shared/site-time-zone-sync";
import { colorSchemeFor, getThemeChoice } from "@/lib/theme";
import "./globals.css";

/**
 * الجذر — يحمل قرار اللغة كله في سمتين: `lang` و`dir`.
 *
 * لماذا لا `app/[locale]/layout.tsx`؟ لأن العربية بلا بادئة (القاعدة ١): مقطع
 * `[locale]` كان سيجرّ كل رابط عربي إلى `/ar/...`. اللغة تصل من ترويسة يضبطها
 * `proxy.ts`، فتبقى شجرة الصفحات واحدة كما هي.
 *
 * ── الخطوط: Alexandria + Readex Pro، محليّان (القرار ٢٦، والمتن بُدِّل 2026-08-17) ─
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

/**
 * خطّ المتن — ثلاثة أوزان (٤٠٠·٥٠٠·٦٠٠)
 *
 * ── لماذا Readex Pro بدل IBM Plex Sans Arabic (اختيار المالك، 2026-08-17) ────
 *
 * راجع بدر عيّنةً تعرض الخطَّين تحت عنوانٍ بـAlexandria 800 على أرضية `--ink`،
 * بجملته المرجعية وبفقرةٍ من صفحة «من نحن»، فاختار Readex Pro. والعلّة الطباعية
 * أن Plex كوفيُّ النبرة وهندسيٌّ كـAlexandria نفسها — فالزوج يُقرأ خطّاً واحداً
 * بوزنين لا عنواناً ومتناً. وReadex أعرض وأدفأ وأكثر انفتاحاً في العيون
 * (‏ص ه ع ف)، فيتباين مع العنوان بدل أن يردّده.
 *
 * ⚠ **وتغطية المحارف قيست قبل الاستبدال لا بعده**: نطاق Readex العربي ٨٢ رمزاً
 * مقابل ٦٨١ لـPlex، والفارق كلّه فارسي/أردي وعلامات قرآنية و«أشكال العرض»
 * (‏U+FB50…). ومسحُ ٨ ملايين محرف من المستودع كلّه + محتوى الصفحات والرسائل
 * أخرج **صفر محرفٍ مرئيّ** خارج تغطيته؛ والأرقام الهندية `٠-٩` (‏U+0660) مغطّاة.
 * أما `۰-۹` الفارسية (‏U+06F0) فلا تُعرض قط — مواضعها الثلاثة خرائط تطبيع
 * ومدياتُ regex تُقرأ ولا تُرسم (`count-up.tsx` · `services.ts` · `0026`).
 *
 * والرخصة SIL OFL 1.1 — مثبتةً من جدول `name` في الملف نفسه (‏nameID 0 و14)
 * ومن نصّها المشحون بجواره في `public/fonts/readex-pro-LICENSE.txt`.
 */
const readexArabic = localFont({
  variable: "--font-readex-ar",
  display: "swap",
  declarations: [
    {
      prop: "unicode-range",
      value:
        "U+0600-06FF,U+0750-077F,U+0870-088E,U+0890-0891,U+0898-08E1,U+08E3-08FF,U+200C-200E,U+2010-2011,U+204F,U+2E41,U+FB50-FDFF,U+FE70-FE74,U+FE76-FEFC",
    },
  ],
  src: [
    { path: "../public/fonts/readex-pro-arabic-400-normal.woff2", weight: "400", style: "normal" },
    { path: "../public/fonts/readex-pro-arabic-500-normal.woff2", weight: "500", style: "normal" },
    { path: "../public/fonts/readex-pro-arabic-600-normal.woff2", weight: "600", style: "normal" },
  ],
});

const readexLatin = localFont({
  variable: "--font-readex-latin",
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
    { path: "../public/fonts/readex-pro-latin-400-normal.woff2", weight: "400", style: "normal" },
    { path: "../public/fonts/readex-pro-latin-500-normal.woff2", weight: "500", style: "normal" },
    { path: "../public/fonts/readex-pro-latin-600-normal.woff2", weight: "600", style: "normal" },
  ],
});

/**
 * 🔴 **`preload: false` — والسبب قياسٌ في شلال Lighthouse لا تفضيل.**
 *
 * كان هذا الخطّ يُحجَز في `<head>` **على كل صفحة**: ٢٣ ك.ب بأولوية عالية أمام
 * صورة البطل. والقياس على الرئيسية (‏Slow 4G، هاتف): الصورة الأكبر (LCP)
 * انتظرت `Load Delay = 2311ms` وهي **٥٤٪ من الزمن كله**، بينما ثمانية ملفات
 * خطّ (~١٩٨ ك.ب) تسبقها في الطابور.
 *
 * و`font-mono` **لا يظهر على الرئيسية ولا على أي صفحة هبوط إطلاقاً**: مواضعه
 * كلها مرجعُ حجزٍ أو عدّادٌ أو شاشةُ لوحة (`grep font-mono`). فحجزُه على صفحةٍ
 * لا تستعمله هو تعريف الهدر.
 *
 * ⚠ **ولا يتغير أنه محلّي**: `next/font/google` ينزّل الملف **وقت البناء**
 *   ويخدمه من نطاقنا، فلا اتصال بأي مضيف خارجي قبل الإزالة ولا بعدها. وما
 *   أُزيل هو وسم `<link rel=preload>` وحده — والخطّ يُطلب كما كان فور أن
 *   يطابقه عنصر على صفحة تستعمله.
 */
const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
  preload: false,
});

/** كومة الخطّ الواحدة: العربي أولاً ثم اللاتيني ثم احتياطيّا النظام */
const DISPLAY_STACK =
  "var(--font-alexandria-ar), var(--font-alexandria-latin), 'Segoe UI', Tahoma, sans-serif";
const BODY_STACK =
  "var(--font-readex-ar), var(--font-readex-latin), 'Segoe UI', Tahoma, sans-serif";

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

/**
 * ╔══════════════════════════════════════════════════════════════════════════╗
 * ║  🔴 م‑٩ب — المظهر صار قرار **الجذر**، لا قرار مجموعة `(site)` وحدها      ║
 * ╚══════════════════════════════════════════════════════════════════════════╝
 *
 * ── ما نُقض صراحةً، ولا يُطوى ────────────────────────────────────────────────
 *
 * غلاف `app/(site)/layout.tsx` كان يحمل الوسم بقصدٍ مكتوب: «هذا الملف لا يُصيَّر
 * إلا داخل مجموعة `(site)`، فاللوحة والبورتال لا يريانه إطلاقاً». وكان معه
 * سطران في `globals.css`: «النطاق `.site-theme` مقصود ولا يُوسَّع إلى `<html>` —
 * اللوحة `/admin` والبورتال `/portal` فاتحان **بقرار**». **وهذان القراران
 * منقوضان هنا بأمر الجبهة**: المظهر تفضيلُ **شخص** لا خاصّيةُ **سطح**، ومن اختار
 * الداكن على الموقع العام يفتح لوحته فيجدها داكنة.
 *
 * وثمنُ النقض مقيسٌ ومذكور: **٩٥٥ أداةَ `dark:`** كانت مكتوبةً في `app/admin`
 * (‏٨٦٩ في ٦٧ ملفاً) و`app/portal` (‏٨٦ في ١٩) **ولم تُصيَّر قط** لأن أغلفتها بلا
 * `.dark` ولا `data-theme`. وهي تشتعل كلُّها بهذا التغيير دفعةً واحدة، ومنها ما
 * كُتب بلا أن يراه أحد. فالوصلُ هنا، **وقياس التباين وإصلاحه جبهةٌ تالية**.
 *
 * ── ولماذا `<body>` لا `<html>` — والسبب سطرٌ في ذيل `globals.css` ───────────
 *
 * 🔴 كتلة `:root` الثانية (‏`--tone-*` قرب نهاية الملف) تأتي **بعد** كتلة
 * `.site-theme`، وكلتاهما بأولوية (0,1,0). فلو لبس `<html>` الصنفَ لَغلبت تلك
 * الكتلةُ إسناداتِ `light-dark()` للنبرات الأربع على العنصر نفسه، ولَجمُدت
 * «نجاح/تحذير/معلومة» على قيمها الفاتحة عند كل من لم يختر ونظامُه داكن —
 * **بلا خطأ ولا اختبارٍ يسقط**. و`<body>` عنصرٌ آخر، وإسنادُه الخاص يغلب الوراثة
 * دائماً مهما تأخّرت كتل `:root` — فينجو التتالي كله كما هو مقيسٌ اليوم.
 *
 * ── و`color-scheme` يبقى على `<html>` لأن الشريط لا يُرسم من غيره ───────────
 *
 * شريطُ تمرير الصفحة وأرضيةُ اللوحة (canvas) يرسمهما المتصفح من **العنصر
 * الجذر**، فلا يبلغهما إسنادٌ على `<body>`. وكان يصل قبل اليوم عبر وسم
 * `<style>{`:root{…}`}</style>` مزروعٍ في غلاف `(site)` — وهو التفافٌ وُلد من
 * عجز ذلك الغلاف عن بلوغ `<html>` أصلاً. وقد بلغناه هنا، فسقط الالتفاف: القيمة
 * تُكتب سمةً سطرية على `<html>` مباشرةً، وهي **جزءٌ من أول بايت** كسمة `lang`
 * تماماً — بلا وسم زائد وبلا سطرٍ في المسار الحرج.
 *
 * ⚠ والقيمة ليست نصاً حراً: `colorSchemeFor` تُخرج واحدةً من ثلاث سلاسل مكتوبة
 * في `lib/theme.ts`، ومدخلُها مرشَّحٌ بـ`normalizeThemeChoice` — فكوكيٌّ مصنوعٌ
 * بيد لا يكتب حرفاً في السمة.
 *
 * ── وثلاثُ خصائص لم تتغيّر، وهي شرطُ صحّة هذا النقل ─────────────────────────
 *
 * ١) **بلا وميض**: الاختيار الصريح يصل كوكيّاً مع الطلب فيخرج `<body>` مطلياً من
 *    الخادم؛ و«اتبع نظامي» يُحسم في CSS بـ`light-dark()` قبل أول طلاء.
 * ٢) **بلا جافاسكربت**: لا سكربت حاجز ولا `useEffect` ولا `localStorage`.
 * ٣) **الحالات ثلاث**: و«اتبع نظامي» = غيابُ الكوكي وغيابُ الصنف معاً.
 */
export default async function RootLayout({ children }: LayoutProps<"/">) {
  const [settings, locale, theme] = await Promise.all([
    getSettings(),
    getActiveLocaleDef(),
    getThemeChoice(),
  ]);

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
    /**
     * 🔴 **لوحتان لا واحدة، وكلتاهما مُبَدَّأة (م‑٩).**
     *
     * القاعدة التي بُنيت عليها `0063` كانت: «السطريّ يسبق `:root` دائماً، فليحمل
     * السطريُّ اللوحةَ كلها». وهي صحيحة ما دامت اللوحة واحدة. ومع لوحتين ينقلب
     * السبقُ نفسه إلى مانع: رمزٌ عارٍ محقونٌ هنا **لا تستطيع أي كتلة CSS أن
     * تبدّله**، فلا مبدّل أصلاً. فيُحقن الاثنان مُبَدَّأين — والاختيار بينهما
     * في `globals.css` §١ب على غلاف الموقع وحده.
     *
     * والحجم: ٣٤ رمزاً بدل ١٧ — أي ~٦٠٠ بايت مضغوطةً في وثيقة، ولا طلبَ شبكةٍ
     * ولا سكربت. وهو الثمن الكامل لمبدّلٍ بلا وميض.
     */
    ...paletteVars(settings.brand.colors, PALETTE_PREFIX.dark),
    ...paletteVars(settings.brand.colorsLight, PALETTE_PREFIX.light),
    // الخطّان: العناوين Alexandria والمتن Readex Pro — وكلاهما يغطّي العربية
    // واللاتينية بنطاقَي يونيكود، فلا تبديل بحسب الاتجاه بعد اليوم.
    "--font-display": DISPLAY_STACK,
    "--font-body": BODY_STACK,
    "--font-sans": BODY_STACK,
    /* أدوات المتصفح التي لا يبلغها `<body>`: شريط تمرير الصفحة وأرضية اللوحة —
       المبرر الكامل في ترويسة `RootLayout` أعلاه. */
    colorScheme: colorSchemeFor(theme),
  } as React.CSSProperties;

  return (
    <html
      lang={locale.htmlLang}
      dir={locale.dir}
      style={brandVars}
      className={`${alexandriaArabic.variable} ${alexandriaLatin.variable} ${readexArabic.variable} ${readexLatin.variable} ${geistMono.variable} h-full antialiased`}
    >
      {/* `site-theme` نطاقُ إسناد الرموز (‏`globals.css` §١ب)، و`data-theme` هو
          الاختيار كما وصل، و`dark` **لا تُكتب إلا مع الاختيار الصريح** — الحالة
          `system` تنقلب عبر `color-scheme` و`light-dark()` وحدهما، وصنفٌ ثابت
          هنا كان سيجمّدها على الداكن ويُلغي الاتّباع. */}
      <body
        data-theme={theme}
        className={`site-theme min-h-full flex flex-col font-sans${
          theme === "dark" ? " dark" : ""
        }`}
      >
        {/* مزوّد الرسائل لجزر العميل (ويدجت البحث، مسار الحجز، نماذج الطلب) */}
        <NextIntlClientProvider>
          {/* 🔴 أول ابنٍ عمداً: يعكس منطقة الموقع إلى `lib/site-timezone.ts`
              **أثناء التصيير**، فتستقر قبل أن يُصيَّر أي شيء يقرؤها. الأخوة
              يُصيَّرون بالترتيب، والتأثيرات تعمل بعد الشجرة كلها — فـ`useEffect`
              كان سيصل متأخراً بتصييرة كاملة (ترويسة المكوّن). */}
          <SiteTimeZoneSync />
          {children}
        </NextIntlClientProvider>
        {/* وسوم القياس من اللوحة (المرحلة ١٠) — ترجع null بلا أي سكربت حين
            لا خدمة مضبوطة ومفعّلة. وسما التحقق في generateMetadata أعلاه. */}
        <AnalyticsTags />
      </body>
    </html>
  );
}
