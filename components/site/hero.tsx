import Image from "next/image";
import { ArrowLeft, ChevronDown, CircleCheck, Sparkles } from "lucide-react";
import { HeroMedia, HeroVideo, Sparks, kenBurnsClass } from "@/components/motion";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { SiteSettings } from "@/lib/site-config";
import { DEFAULT_LOCALE } from "@/lib/i18n-types";
import { getT } from "@/lib/i18n/content";
import { safeMediaSrc } from "@/components/sections/image";
import type { BlockStyle } from "@/lib/page-builder-types";
import { HeroTyping } from "./hero-typing";
import { bookingHref, externalLinkProps, localeHref } from "./links";

/**
 * نقاط الثقة الأربع تحت أزرار الحجز — النص من `site.hero.trust.*`.
 *
 * ⚠ **وهي الآن احتياطيٌّ لا مصدر** (م‑٢): الكتلة تحمل `items` محرَّرة من
 * اللوحة، وهذه القائمة تظهر حين لا يكتب المالك عنصراً واحداً — فالصفحة الحيّة
 * لا تتغيّر ببايت حتى يُكتب أول تجاوز.
 */
const TRUST_POINTS = [
  { key: "trust.modernCars", label: "سيارات حديثة" },
  { key: "trust.professionalDrivers", label: "سائقون محترفون" },
  { key: "trust.clearPrices", label: "أسعار واضحة" },
  { key: "trust.support", label: "متابعة ٢٤/٧" },
] as const;

/**
 * ن‑٤ — الجُمل المتناوبة: **سطرٌ لكل جملة**، والفراغُ لا يُنتج جملة.
 *
 * تُقرأ هنا على الخادم لا في مكوّن العميل، لأن المكوّن `"use client"` ولا
 * تُستدعى دوالُّه من الخادم. والقصّ `trim` شرطٌ لا تجميل: سطرٌ فيه مسافةٌ
 * واحدة كان سينتج «جملة» فارغة تُكتب في صمتٍ ثم تُمحى، فيبدو الأثر معطوباً.
 */
function parseTypingLines(raw: unknown): string[] {
  if (typeof raw !== "string") return [];
  return raw
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
}

/**
 * قسم البطل.
 *
 * ── طبقة الوسائط (هذه الجلسة) ───────────────────────────────────────────────
 *
 * كان التعليق هنا يقول «زخارف هندسية متدرجة بلون العلامة — **بلا صور جاهزة**»،
 * وكان صادقاً وقتَه. لكن م‑٣ حوّلت ١٩ صورة إلى `public/img/*.avif` ولم يشر إليها
 * سطرٌ واحد في المستودع (مقيس: صفر `.avif` في HTML الصفحة الحيّة)، وبقيت
 * `components/motion/hero-video.tsx` و`HeroMedia` و`Sparks` **مبنيّةً ولا
 * يستوردها أحد**. فالبطل كان توهّجاً ملوّناً حيث يضع التصميم صورة السائق.
 *
 * والطبقة الآن ثلاث، بترتيب الرسم:
 *   ١) `next/image` بصورة البطل — `priority` لأنها الرسم الأكبر (LCP).
 *   ٢) `HeroVideo` فوقها — لا يُصيَّر على الخادم إطلاقاً، ولا يُحمَّل بايت إلا
 *      بعد أربعة شروط عميل وحدث `load` (الشرح في رأس `hero-video.tsx`).
 *   ٣) `Sparks` جسيماتٌ تختفي كلياً مع `prefers-reduced-motion`.
 *
 * 🔴 **والمسارات من المحتوى لا من الكود** (القيد غير القابل للتفاوض): `src`
 * و`poster` و`video` حقولٌ في صفّ القسم تُحرَّر من اللوحة. وغيابها **لا يكسر
 * شيئاً**: بلا `src` لا تُصيَّر الحاوية أصلاً ويعود البطل إلى شكله السابق حرفاً.
 *
 * المرحلة ٨: العنوان والوصف ونشاط الشركة تصل مترجمة من نظام المحتوى والإعدادات،
 * وأزرار البطل ونقاط الثقة من مساحة `site.hero`.
 */
export async function Hero({
  settings,
  content,
  style,
  locale = DEFAULT_LOCALE,
}: {
  settings: SiteSettings;
  content?: {
    headline?: string;
    sub?: string;
    /** ن‑٤ — الجزء الثابت من العنوان، لا يُعاد كتابته في أي دورة */
    typingPrefix?: string;
    /** ن‑٤ — الجُمل المتناوبة، سطرٌ لكل جملة. الفارغ يُبقي `headline` كما هو */
    typingLines?: string;
    badge?: string;
    scrollLabel?: string;
    /** مسار صورة البطل — أي مسار داخلي أو عنوان مضيف الوسائط المسموح */
    src?: string;
    /** نصّ بديل للصورة. غيابه ⇒ الصورة زخرفةٌ بـ`alt=""` لا صورة بلا وصف */
    imageAlt?: string;
    /** غلاف الفيديو — الصورة نفسها عادةً فلا يُحمَّل ملفٌّ ثانٍ */
    poster?: string;
    /** مصدر الفيديو (MP4 اليوم). غيابه ⇒ صورةٌ بلا فيديو، وهو مسار سليم */
    video?: string;
    items?: { title: string }[];
  };
  /**
   * ن‑٤ — مقابض الحركة مطهَّرةً من `readBlockStyle`. تصل عبر `SectionProps.style`
   * وحده: `sanitizeContent` تُسقط `content.style` قبل العارضة بقصد، فلا يقرؤه
   * أي مكوّن بنفسه (العقد §٥).
   */
  style?: BlockStyle | null;
  locale?: string;
}) {
  const t = await getT("site.hero", locale);
  const booking = bookingHref(settings, locale);
  const headline = content?.headline ?? settings.brand.tagline;
  const sub = content?.sub ?? settings.seo.defaultDescription;
  /**
   * الشارة: تجاوزٌ من الكتلة، وإلا نشاط الشركة من الإعدادات كما كان حرفياً.
   * ⚠ ولا يُكتب فيها رقمٌ بلا مصدر: شارة التصميم تقول «٩ محافظات · سائقون
   * معتمدون» و`areaServed` فارغ و`subcontractors = 0`.
   */
  const badge = content?.badge ?? settings.company.activity;
  /** ضمانات البطل — المحرَّرة تسبق، والأربع المترجَمة احتياطيٌّ لا مصدر */
  const trust = (content?.items ?? []).filter((item) => item?.title);
  const scrollLabel = content?.scrollLabel?.trim();

  /**
   * ── ن‑٤ — العنوان: مسارٌ واحدٌ يعمل، لا مساران يتنافسان ────────────────────
   *
   * بلا جملةٍ واحدة في `typingLines` يخرج `<h1>` **حرفاً بحرف كما كان**: نصٌّ
   * واحد، بلا مكوّن عميل، وبلا عقدة DOM زائدة. فالصفحة القائمة لا تتغيّر ببايت
   * حتى يكتب المالك أول جملة — وهو نفس مذهب `items` والوسائط في هذه الكتلة.
   *
   * وبأول جملة يصير العنوان: الجزء الثابت ساكناً، وما بعده متحرّكاً. و`headline`
   * يبقى محفوظاً في الصفّ ويعود لحظة تُفرَّغ الجُمل — فلا نصَّ يضيع بتجريب.
   */
  const typingLines = parseTypingLines(content?.typingLines);
  const typingPrefix = content?.typingPrefix?.trim() ?? "";
  const isTyping = typingLines.length > 0;

  /**
   * الوسائط — كلها اختيارية، وكلها تمرّ من `safeMediaSrc`: مسارٌ داخلي أو عنوانٌ
   * من مضيف الوسائط وحده. والسبب مكتوب في رأس `components/sections/image.tsx`
   * (خصوصية الزائر · قابلية القالب للنسخ · `javascript:` و`//host`).
   */
  const mediaSrc = safeMediaSrc(content?.src);
  const posterSrc = safeMediaSrc(content?.poster) ?? mediaSrc ?? undefined;
  const videoSrc = safeMediaSrc(content?.video);
  /** نصٌّ بديل فارغ = زخرفة. وهو الصواب هنا: العنوان يقول ما تقوله الصورة */
  const imageAlt = content?.imageAlt?.trim() ?? "";

  /** بصورة: الوسائط ملءُ القسم والنصّ فوقها — تركيب التصميم. وبلا صورة: الشكل السابق حرفاً */
  const hasMedia = mediaSrc !== null;

  return (
    <section
      /**
       * `id="hero"` — مرجعُ حدّ ظهور الشريط السفلي (`SlideUpBar` يقرأ ارتفاعه
       * فيظهر عند `ارتفاع البطل − ١٤٠` كما في التصميم). وهو آمنٌ بلا تكرار:
       * كتلة `hero` مسجَّلة `placement: "home-only"` فلا تقع مرتين في صفحة.
       * وبقية الصفحات لا بطلَ لها بهذا المعرّف فتأخذ الحدّ الاحتياطي (٨٠٪ من
       * ارتفاع الشاشة) — وهو تدهورٌ مقبول لا عطل.
       */
      id="hero"
      className={cn("relative overflow-hidden", hasMedia ? "surface-ink" : "site-hero-bg")}
    >
      {/*
        ── طبقة الوسائط: ملءُ القسم خلف النصّ، كما في `index.html` ──────────────
        التصميم يجعل `.hero__media` مطلقةً بـ`inset:0` والنصّ فوقها؛ ولا يضعها
        بطاقةً في عمودٍ ثانٍ. والفرق ليس ذوقياً: النصّ فوق صورةٍ معتمة هو ما
        يعطي البطل ثقله، والبطاقة الجانبية تجعله «قسماً فيه صورة».

        والتعتيم شرطُ قراءةٍ لا زينة: نصٌّ فاتح فوق صورةٍ فاتحة يسقط دون AA في
        أي بقعة مضيئة منها. فطبقتان: تدرّجٌ من الحافة يثبّت جانب النصّ، وحجابٌ
        عامٌّ خفيف يضمن الأرضية في أسوأ بقعة.
      */}
      {hasMedia ? (
        <>
          <HeroMedia hasVideo={videoSrc !== null} className="z-0">
            <Image
              src={mediaSrc}
              alt={imageAlt}
              fill
              className={cn(kenBurnsClass, "object-cover object-[center_38%]")}
              sizes="100vw"
              /* الرسم الأكبر في الصفحة — لا `lazy` ولا تأخير */
              priority
              /**
               * 🔴 **`fetchPriority` صراحةً — لأن `priority` وحدها لا تضعها.**
               *
               * مقيسٌ على ناتج البناء: وسم `<img>` يخرج بلا `fetchpriority`،
               * ووسمُ `<link rel=preload>` كذلك. وفحص `lcp-discovery` في
               * Lighthouse يقولها حرفاً: `priorityHinted: false` بينما
               * `requestDiscoverable: true` و`eagerlyLoaded: true` — أي أن
               * المتصفح **يعرف** بالصورة مبكراً ولا يعرف أنها الأهم.
               *
               * والفرق يظهر تحت الخنق وحده: على Slow 4G تسبقها في الطابور
               * ثمانية ملفات خطّ وثلاث أوراق أنماط، فيخرج
               * `Load Delay = 2311ms` = **٥٤٪ من زمن LCP كله**. والتلميح
               * يرفعها فوقها في نفس الموجة بلا طلبٍ إضافي.
               */
              fetchPriority="high"
              quality={65}
            />
            {videoSrc !== null ? (
              <HeroVideo poster={posterSrc} sources={[{ src: videoSrc, type: "video/mp4" }]} />
            ) : null}
            <Sparks />
          </HeroMedia>
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-0 z-[2] bg-[linear-gradient(to_left,color-mix(in_oklab,var(--ink)_88%,transparent),color-mix(in_oklab,var(--ink)_62%,transparent)_46%,transparent_78%)]"
          />
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-0 z-[2] bg-[color-mix(in_oklab,var(--ink)_38%,transparent)]"
          />
        </>
      ) : (
        /* الشكل السابق حرفاً حين لا يكتب المالك صورة — توهجان ونمط نقاط */
        <div aria-hidden="true" className="pointer-events-none absolute inset-0">
          <div className="site-float absolute -top-28 right-[10%] size-72 rounded-full bg-[color-mix(in_oklab,var(--primary)_16%,transparent)] blur-3xl" />
          <div className="site-float-slow absolute -bottom-36 left-[6%] size-96 rounded-full bg-[color-mix(in_oklab,var(--brand-accent)_18%,transparent)] blur-3xl" />
          <div className="site-dots absolute inset-0 opacity-70 [mask-image:radial-gradient(ellipse_60%_60%_at_50%_40%,black,transparent)]" />
          <div className="absolute inset-x-0 bottom-0 h-px bg-gradient-to-l from-transparent via-border to-transparent" />
        </div>
      )}

      <div
        className={cn(
          "relative z-10 mx-auto flex w-full max-w-6xl flex-col gap-8 px-4 pb-24 pt-16 sm:px-6 md:pb-32 md:pt-24",
          // فوق صورة: النصّ يبدأ من حافة القراءة ويُقيَّد عرضه — تركيب التصميم
          hasMedia
            ? "items-start text-start md:pt-36 lg:max-w-[min(100%,72rem)]"
            : "items-center text-center"
        )}
      >
        <div
          className={cn(
            "flex w-full flex-col gap-8",
            // فوق صورة: ترويسة البطل تأخذ عرض الحاوية كاملاً على المكتب لأن
            // النصّ الثانوي يقف بجانب العنوان لا تحته (ن‑٣)
            hasMedia ? "max-w-3xl items-start lg:max-w-none" : "items-center"
          )}
        >
        {/*
          ── ن‑٣ — موضع النصّ الثانوي، مطابقاً `Tours-02/landing` ─────────────

          التصميم هناك (`assets/css/style.css` — «إخراج البطل الطباعي») يجعل
          `.hero__head` شبكةَ **عمودين محاذاةً لأسفل** من ‏1000px: العنوان في
          `1.3fr` والجملة في `1fr` بخطٍّ عنبريٍّ رأسي يفصلها، والشارة تعبر
          العمودين. وعلى الجوال يبقى الكل عموداً واحداً.

          والفرق ليس ذوقياً: الجملة تحت العنوان تدفع الأزرار والويدجت لأسفل
          الطيّة، وبجانبه تُقرأ في نفس نظرة العين — وهو ما بُني له التصميم.

          ⚠ واللون **رمزٌ لا قيمة**: الخطّ العنبري في التصميم `#D89A3E`، وهو
          `--primary` في هذا الثيم حرفاً — فيُكتب رمزاً (`border-s-primary/55`)
          لا قيمةً. وتبديل اللوحة في م‑٩ يبدّل الخطّ معها، ولا لونٌ مكتوب في
          هذا الملف (‏D-01/D-04).
        */}
        <div
          className={cn(
            "grid w-full gap-y-8 justify-items-start",
            hasMedia
              ? "lg:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)] lg:items-end lg:gap-x-10"
              : "justify-items-center"
          )}
        >
        {badge ? (
          <span className="inline-flex items-center gap-2 rounded-full border border-primary/20 bg-primary/5 px-4 py-1.5 text-sm font-medium text-primary lg:col-span-full">
            <Sparkles className="size-4" aria-hidden="true" />
            {badge}
          </span>
        ) : null}

        {/**
         * 🔴 **`<h1>` واحدٌ دلالياً، ونصُّه كاملٌ من الخادم.** الجزء الثابت
         * والجملة الأولى كلاهما نصٌّ حقيقي داخل العنوان في HTML الخادمي —
         * والحركة `clip-path` فوقهما لا حقنُ حروف (‏`hero-typing.tsx`).
         */}
        <h1
          className={cn(
            "w-full max-w-3xl text-4xl font-extrabold leading-[1.25] tracking-tight sm:text-5xl sm:leading-[1.2] md:text-6xl md:leading-[1.15]",
            hasMedia ? "lg:max-w-none" : "",
            // `text-balance` يوازن أسطر النصّ المتدفّق، ولا معنى له على سطرٍ
            // `nowrap` مقنَّع — بل يزاحم حساب العرض. فيُرفع في وضع الكتابة.
            isTyping ? "" : "text-balance"
          )}
        >
          {isTyping ? (
            <>
              {/*
                🔴 **المسافة بعد الجزء الثابت شرطٌ لا تنسيق.** السطران كتلتان،
                فبلا هذه المسافة يصير `h1.textContent` كلمةً ملتحمة:
                «ايجار ليموزينبسعر مناسب…» — وهو ما يقرؤه الزاحف وما يبني منه
                قارئُ الشاشة اسمَ العنوان. والمسافة في آخر سطرٍ كتليّ تُطوى
                بصرياً فلا يتغيّر ما تراه العين ببكسل. (مقيسٌ حيّاً لا مفترضاً.)
              */}
              {typingPrefix ? <span className="block">{typingPrefix} </span> : null}
              <HeroTyping
                lines={typingLines}
                speed={style?.typingSpeed}
                hold={style?.typingHold}
                erase={style?.typingErase}
                loop={style?.typingLoop === true}
              />
            </>
          ) : (
            headline
          )}
        </h1>

        <p
          className={cn(
            "max-w-2xl text-pretty text-base leading-8 text-muted-foreground sm:text-lg sm:leading-9",
            hasMedia
              ? "lg:max-w-none lg:border-s-2 lg:border-s-primary/55 lg:ps-4 lg:pb-1.5"
              : ""
          )}
        >
          {sub}
        </p>
        </div>

        <div
          className={cn(
            "flex w-full flex-col gap-3 sm:w-auto sm:flex-row",
            hasMedia ? "items-stretch sm:items-center" : "items-center justify-center"
          )}
        >
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

        <ul
          className={cn(
            "mt-2 flex flex-wrap items-center gap-x-7 gap-y-3 text-sm font-medium",
            // فوق الصورة يُرفع النصّ الثانوي درجةً: `muted` فوق صورة معتمة يقارب الحدّ
            hasMedia ? "justify-start text-foreground/80" : "justify-center text-muted-foreground"
          )}
        >
          {trust.length > 0
            ? trust.map((item, index) => (
                <li
                  key={(item as { _k?: string })._k ?? `${item.title}-${index}`}
                  className="flex items-center gap-2"
                >
                  <CircleCheck className="size-4 shrink-0 text-primary" aria-hidden="true" />
                  {item.title}
                </li>
              ))
            : TRUST_POINTS.map((point) => (
                <li key={point.key} className="flex items-center gap-2">
                  <CircleCheck className="size-4 shrink-0 text-primary" aria-hidden="true" />
                  {t(point.key, point.label)}
                </li>
              ))}
        </ul>

        {/**
         * سهم «اكتشف» — يظهر بنصٍّ فقط. رابطٌ داخلي إلى أول قسم بعد البطل:
         * `#services` هو المرساة الوحيدة المضمونة في الرئيسية اليوم، فلا يُوعَد
         * بمرساةٍ قد لا توجد. والفارغ يُخفيه كله بدل أن يعرض سهماً بلا كلمة.
         */}
        {scrollLabel ? (
          <a
            href={localeHref("/#services", locale)}
            className="group mt-4 inline-flex flex-col items-center gap-1.5 text-xs font-semibold tracking-wide text-muted-foreground transition-colors hover:text-primary"
          >
            {scrollLabel}
            <ChevronDown
              className="size-5 animate-bounce motion-reduce:animate-none"
              aria-hidden="true"
            />
          </a>
        ) : null}
        </div>
      </div>
    </section>
  );
}
