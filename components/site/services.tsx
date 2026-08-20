import Image from "next/image";
import { FileText } from "lucide-react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { getPagesByKind } from "@/lib/content";
import { pagePublicPath } from "@/lib/seo/site-paths";
import { DEFAULT_LOCALE } from "@/lib/i18n-types";
import { getLocalizedServices, getT } from "@/lib/i18n/content";
import { iconFor, type IconComponent } from "@/components/sections/icons";
import { safeMediaSrc } from "@/components/sections/image";
import { RAIL_GRID_3, Rail, RailItem } from "@/components/sections/rail";
import type { SectionContentMap } from "@/lib/content-types";
import { internalPath, localeHref } from "./links";
import { SectionHeading } from "./section-heading";

/**
 * ── الفجوة ١٥: الخدمات الثلاث التي **لا تخدمها الحاسبة بنيوياً** ───────────
 *
 * `/quote-request` مسارٌ حيّ بخانق خمسة طلبات لكل عشر دقائق، **وهو الطريق
 * الوحيد** إلى ثلاث من الخدمات الست: الجولات والمناسبات والمؤتمرات. والحاسبة
 * تسعّر رحلةً بنقطتين وفئة — فمن دخل يريد جولةً ليوم كامل أو تحرّك وفدٍ على عدة
 * مركبات لا يجد فيها ما يخدمه، ويخرج بلا طريق.
 *
 * وقرار الفجوة صريح: **زرٌّ داخل بطاقات الخدمات الثلاث نفسها** — أي عند اللحظة
 * التي يقرأ فيها الزائر «الجولات السياحية» بالضبط.
 *
 * 🔒 **وهو يبقى عاملاً على البطاقة المتجاوَزة كذلك** (م‑٧): الـslug يُشتق من
 * `href` المكتوب (`/services/tours` ⇐ `tours`) لا من حقلٍ سادس. فحقلٌ أقلّ
 * يكتبه المالك، وميزةٌ لا تسقط حين يملك البطاقات.
 */
const QUOTE_ONLY_SERVICES: ReadonlySet<string> = new Set(["tours", "events", "conferences"]);

/** الـslug من مسار خدمةٍ داخلي — `/services/tours?x=1` ⇐ `tours`، وما عداه `null` */
function serviceSlugFromHref(href: string | null): string | null {
  if (href === null) return null;
  const path = href.split(/[?#]/)[0] ?? "";
  const match = /^\/services\/([a-z0-9]+(?:-[a-z0-9]+)*)\/?$/.exec(path);
  return match ? match[1] : null;
}

/**
 * قسم الخدمات الست — بطاقات ترتفع بلطف عند التحويم.
 *
 * ── مساران، والثاني هو ما تضيفه م‑٧ ─────────────────────────────────────────
 *
 * **(أ) بلا `items`** — السلوك القائم حرفاً: الخدمات من `SERVICES` عبر
 * `getLocalizedServices`، والوجهة من الصفحات **المنشورة** لا من الثابت، فما
 * لا صفحةَ له يبقى عنواناً صامتاً و«إلغاء النشر يُطفئ الرابط ولا يكسره».
 *
 * **(ب) مع `items`** — المالك يملك البطاقات: العنوان والنصّ والصورة والأيقونة
 * والوجهة، كلها صفوفٌ في `sections` تُحرَّر من المنشئ. وهذا هو تنفيذ القيد غير
 * القابل للتفاوض على أصعب موضعٍ فيه: بيانات الخدمات كانت **في ملف TS**
 * (`lib/site-config.ts`) — أي في الكود، خارج ما تصله اللوحة إطلاقاً.
 *
 * ⚠ **والثمن يُكتب لا يُخفى:** البطاقة المتجاوَزة تأخذ وجهتها من `href`
 * المكتوب، فإلغاءُ نشر صفحة خدمة لم يعد يُطفئ رابطها بل يجعله **٤٠٤
 * داخلياً**. وهو نفس الثمن الذي قبله `route-rail` بقرارٍ مكتوب، وحدُّه محفوظ
 * بـ`internalPath`: لا وجهة خارجية من قلب الرئيسية بحال.
 *
 * المرحلة ٨: أسماء الخدمات ووصفها من مساحة `service` في جدول الترجمات في
 * المسار (أ)، ومن فهرس الأقسام (`section`) في المسار (ب) — كلاهما مفهرس.
 */
export async function ServicesSection({
  content,
  locale = DEFAULT_LOCALE,
}: {
  content?: SectionContentMap["services-grid"];
  locale?: string;
} = {}) {
  const [t, services, servicePages] = await Promise.all([
    getT("site.services", locale),
    getLocalizedServices(locale),
    getPagesByKind("service", locale),
  ]);

  /** slug ⇐ مسار الصفحة المنشورة — المفتاح الوحيد الذي يقرّر: أيربط أم لا */
  const publishedPaths = new Map(
    servicePages.map((page) => [page.slug, localeHref(pagePublicPath(page.kind, page.slug), locale)])
  );

  /**
   * البطاقات الموحَّدة — مصدرها المحتوى إن وُجد، وإلا بيانات النظام. ومن هنا
   * فصاعداً **حلقة تصيير واحدة**: نسختان من قالب البطاقة كانتا ستنحرفان أول
   * مرة يُعدَّل التخطيط (النمط ٤ في `LESSONS.md`).
   */
  const overrides = (content?.items ?? []).filter((item) => item?.title);

  type Card = {
    key: string;
    title: string;
    short: string | undefined;
    href: string | null;
    quoteSlug: string | null;
    src: string | null;
    alt: string;
    Icon: IconComponent | null;
  };

  const cards: Card[] =
    overrides.length > 0
      ? overrides.map((item, index) => {
          const path = internalPath(item.href);
          return {
            key: (item as { _k?: string })._k ?? `${item.title}-${index}`,
            title: item.title,
            short: item.text,
            href: path === null ? null : localeHref(path, locale),
            quoteSlug: serviceSlugFromHref(path),
            src: safeMediaSrc(item.src),
            alt: typeof item.alt === "string" ? item.alt.trim() : "",
            Icon: iconFor(item.icon),
          };
        })
      : services.map((service) => ({
          key: service.slug,
          title: service.title,
          short: service.short,
          href: publishedPaths.get(service.slug) ?? null,
          quoteSlug: service.slug,
          src: null,
          alt: "",
          Icon: iconFor(service.icon),
        }));

  return (
    <section id="services" className="scroll-mt-24 py-20 md:py-28">
      <div className="mx-auto w-full max-w-6xl px-4 sm:px-6">
        <SectionHeading
          eyebrow={t("eyebrow", "خدماتنا")}
          title={content?.title ?? t("title", "ستة حلول نقل تغطي رحلتك من أولها لآخرها")}
          description={
            content?.sub ??
            t(
              "description",
              "من باب المطار إلى أبعد مزار — اختر الخدمة التي تناسبك، ودع الطريق علينا."
            )
          }
        />

        {/**
         * 🆕 **سكةٌ أفقية على الجوال — بأمر بدر بعد أن فتح الموقع المنشور على
         * هاتفه:** «الجزء الخاص بالخدمات في واجهة الموبايل، خلينا نعمله بنفس
         * الطريقة بتاعت المسارات و الأسطول».
         *
         * وهو **أكبر مكسبٍ باقٍ على الجوال**: ٢٠٤٣ بكسل مقيسة عند ٣٧٥ عرضاً —
         * أطول من الأسطول قبل تحويله، وأطول قسمٍ في الصفحة كلها.
         *
         * والآلية **مستوردة لا مكتوبة**: نفس `Rail` التي تحمل المسارات
         * والأسطول — ثالثةُ سكةٍ بصفر سطرٍ منسوخ (القاعدة الذهبية ١٢).
         *
         * 🔒 **و`RAIL_GRID_3` ليست تخميناً**: شبكة التصميم (`.svcx__grid`)
         * ثلاثة أعمدة فوق ‎١٠٠٠px، وهو تخطيط هذا القسم القائم حرفاً
         * (`lg:grid-cols-3`). فالسكة **لا تغيّر المكتب ببكسل** — تغيّر ما دون
         * `md` وحده. وستُّ خدماتٍ في ثلاثة أعمدة = صفّان مكتملان بلا خانةٍ
         * فارغة، وهي العلّة نفسها التي يعالجها التصميم بمدّ البطاقة الأخيرة
         * حين تكون الأعمدة عمودين.
         */}
        <Rail
          id="servicesRail"
          label={t("railLabel", "خدماتنا")}
          gridClassName={RAIL_GRID_3}
          className="mt-12 md:mt-16"
        >
          {cards.map((card) => {
            const quoteHref =
              card.quoteSlug && QUOTE_ONLY_SERVICES.has(card.quoteSlug)
                ? localeHref(`/quote-request?service=${card.quoteSlug}`, locale)
                : null;
            const { Icon } = card;

            /*
             * `h-full` شرطٌ لا تجميل: الشبكة تمدّد عناصرها إلى ارتفاع الصف
             * (`stretch`)، وأي غلافٍ يدخل بينها وبين البطاقة يصير هو المتمدّد
             * فتعود البطاقات إلى ارتفاعاتٍ متفاوتة بحسب طول الوصف.
             *
             * و`relative` هنا هي مرساة **الرابط الممدود**: الرابط على العنوان
             * وحده في DOM، و`after:inset-0` يبسط هدف نقره على البطاقة كاملة.
             * ولماذا هذا الشكل بدل `<a>` تلفّ البطاقة؟ لأن زرّ «اطلب عرض سعر»
             * رابطٌ ثانٍ، **ورابطٌ داخل رابط HTML غير صالح** ولا يعمل في أي
             * متصفح. فالنمط الممدود هو الذي يجمع الاثنين.
             *
             * وحلقة التركيز على البطاقة لا على الكلمة (`has-[a:focus-visible]`)
             * وإلا رأى من يتنقّل بلوحة المفاتيح حلقةً حول ثلاث كلمات في وسط
             * بطاقةٍ لا يعرف حدودها.
             */
            const body = (
              <Card
                className={cn(
                  "relative h-full overflow-hidden rounded-2xl ring-border transition-all duration-300 hover:-translate-y-1.5 hover:shadow-xl hover:shadow-primary/10 hover:ring-primary/30 has-[a:focus-visible]:ring-2 has-[a:focus-visible]:ring-ring/60 [--card-spacing:--spacing(6)]",
                  /**
                   * ارتفاعٌ أدنى مع الصورة: بلاه تُقصّ الصورة إلى شريطٍ خلف
                   * سطرين من نصّ، فيضيع تخطيط `bento` الذي تقوم عليه الشبكة
                   * في التصميم. وبلا صورة يبقى الارتفاع من المحتوى كما كان.
                   */
                  /**
                   * 🔴 `isolate` **شرطُ عمل الرابط الممدود، لا زينة** — والعلّة
                   * أُمسكت بقياسٍ حيّ عند تحويل القسم إلى سكة (2026-08-17).
                   *
                   * كان `CardHeader` يحمل `relative z-10` ليعلو الصورة، فصار
                   * **هو** الكتلةَ الحاويةَ لـ`after:inset-0` بدل البطاقة —
                   * لأن `inset` يُحلّ على أقرب سلفٍ **موضَّع**. فهدف النقر لم
                   * يكن «البطاقة كاملة» كما يَعِد التعليق أسفله، بل شريط
                   * الترويسة وحده: مقيسٌ بمسحٍ بخمسة صفوف × ثلاثة أعمدة على
                   * الصفحة الحيّة — **الصفّان العلويان والصفّ السفلي يقعان خارج
                   * الرابط**، أي أعلى ٤٠٪ من البطاقة وأسفل ٨٪ منها لا تفتح شيئاً.
                   *
                   * وهو عيبٌ سابقٌ لهذا التغيير (وُلد مع صور م‑٧)، لكنه يتفاقم
                   * بالسكة: البطاقة صارت ٢٥٦ بكسل بدل ٣٤٣.
                   *
                   * والعلاج أن تعود البطاقة كتلةً حاوية: `isolate` تنشئ عليها
                   * سياق تكديس (وهو ما يفعله التصميم حرفاً في `.svcx__a`:
                   * `position:relative; isolation:isolate`)، فتنزل الصورة إلى
                   * `-z-10` داخله، وتستغني الترويسة عن `relative` — فيُحلّ
                   * `inset-0` على البطاقة وتصير كلها هدفاً.
                   */
                  card.src
                    ? "isolate min-h-64 justify-end border-transparent bg-transparent text-white ring-white/15"
                    : null
                )}
              >
                {/*
                 * صورة البطاقة — طبقةٌ خلف النصّ لا رأسٌ فوقه، وهو تخطيط
                 * التصميم (`bento`). والحجاب شرطُ قراءةٍ لا زينة.
                 *
                 * و`alt=""` معلنٌ لا مسكوتٌ عنه: صورةُ بطاقةٍ عنوانها يقول ما
                 * تقوله **زخرفة**، وقارئ الشاشة يتخطاها بدل أن يقرأ مساراً.
                 */}
                {card.src ? (
                  <span
                    aria-hidden={card.alt === "" ? "true" : undefined}
                    /* `-z-10` داخل سياق `isolate` أعلاه — لا تهرب خلف البطاقة */
                    className="absolute inset-0 -z-10"
                  >
                    <Image
                      src={card.src}
                      alt={card.alt}
                      fill
                      /**
                       * 🔴 مقيسٌ على السكة لا على الشبكة التي كانت.
                       *
                       * كان `100vw` تحت ٦٤٠ — والبطاقة صارت **٢٥٦ بكسل**
                       * (`w-64`) لا عرض الشاشة. وترْكُه كان يُبقي `next/image`
                       * يطلب نسخة `w=750` (مقيسة على الصفحة الحيّة) لبطاقةٍ
                       * ثلثَ ذلك العرض — أي بطاقةٌ تقصر على الهاتف **وتحمّل
                       * البايتات نفسها**، فلا يربح صاحب الشبكة الضعيفة شيئاً.
                       */
                      sizes="(max-width: 767px) 256px, (max-width: 1023px) 50vw, 384px"
                      quality={55}
                      className="object-cover transition-transform duration-500 group-hover/card:scale-105"
                    />
                    <span className="absolute inset-0 bg-[linear-gradient(to_top,color-mix(in_oklab,var(--ink)_93%,transparent),color-mix(in_oklab,var(--ink)_66%,transparent)_55%,color-mix(in_oklab,var(--ink)_34%,transparent))]" />
                  </span>
                ) : null}

                {/* بلا `relative`: الصورة تحتها بـ`-z-10` فتعلوها بلا تموضع،
                    والبطاقة تبقى الكتلة الحاوية للرابط الممدود */}
                <CardHeader className={card.src ? "mt-auto" : undefined}>
                  {Icon ? (
                    <div
                      className={cn(
                        "mb-3 grid size-12 place-items-center rounded-xl transition-colors duration-300",
                        card.src
                          ? "bg-white/15 text-white backdrop-blur-sm"
                          : "bg-primary/10 text-primary group-hover/card:bg-primary group-hover/card:text-primary-foreground"
                      )}
                    >
                      <Icon className="size-6" aria-hidden="true" />
                    </div>
                  ) : null}
                  <CardTitle
                    className={cn(
                      "text-lg font-bold transition-colors duration-300",
                      card.src ? null : "group-hover/card:text-primary"
                    )}
                  >
                    {/*
                     * والوجهة تُشتق من المنشور في المسار (أ) — فما لا صفحةَ له
                     * يبقى عنواناً صامتاً كما كان، ولا يصير رابطاً إلى ٤٠٤.
                     *
                     * ولا نصّ «اعرف المزيد» عمداً: الإشارة بصرية — ارتفاع
                     * البطاقة وتلوّن عنوانها — ولا حرف يحتاج ترجمة.
                     */}
                    {card.href ? (
                      <a
                        href={card.href}
                        className="outline-none after:absolute after:inset-0 after:content-['']"
                      >
                        {card.title}
                      </a>
                    ) : (
                      card.title
                    )}
                  </CardTitle>
                  {card.short ? (
                    <CardDescription
                      className={cn("leading-7", card.src ? "text-white/80" : null)}
                    >
                      {card.short}
                    </CardDescription>
                  ) : null}
                </CardHeader>

                {/*
                 * 🔴 الفجوة ١٥ — «اطلب عرض سعر لهذه الخدمة».
                 *
                 * `z-10` شرطُ عمله: الرابط الممدود أعلاه يغطّي البطاقة كاملة،
                 * فبلا رفعِ هذا فوقه تبتلع النقرةَ البطاقةُ ويصل الزائر صفحة
                 * الخدمة بدل نموذج العرض. و`relative` تُفعّل `z-index` أصلاً.
                 *
                 * و`?service=` يُقرأ في `app/quote-request/page.tsx` فيصل
                 * الزائر ونوعُ خدمته مختارٌ سلفاً — والـslug لا يُترجَم، فالرابط
                 * نفسه يعمل من العربية ومن `/en` معاً.
                 */}
                {quoteHref ? (
                  <CardContent className="relative z-10 mt-auto">
                    {/*
                     * 🔴 **والنصُّ المرئيُّ واحدٌ عمداً، والمنطوقُ يسمّي خدمته.**
                     *
                     * رسب هذا في PageSpeed 2026-08-20: «روابطُ متطابقةٌ لها الغرضُ
                     * نفسه» — ثلاثةُ روابطَ نصُّها «اطلب عرض سعر لهذه الخدمة»
                     * ووجهاتُها `tours` و`events` و`conferences`. ومن يتصفّح
                     * بقائمة روابط الصفحة (وهو أشيعُ ما يفعله مستخدمُ قارئ الشاشة)
                     * يسمع ثلاثةً متطابقةً **ولا يعرف أيُّها أيّ**.
                     *
                     * والعلاجُ `aria-label` لا تغييرُ النصّ المرئيّ: «لهذه الخدمة»
                     * صادقةٌ للمبصر لأن البطاقةَ تحيط بها وعنوانُها فوقها مباشرة،
                     * والسياقُ البصريُّ هو بعينه ما يفقده القارئ الصوتيّ.
                     *
                     * ⚠ و`aria-label` **تحلّ محلَّ** النصّ الداخليّ لا تُضاف إليه،
                     * فيجب أن تحمل الفعلَ كاملاً لا اسمَ الخدمة وحده — وإلا سمع
                     * «رحلات» ولم يعرف أنه رابطُ طلبِ عرضِ سعر.
                     */}
                    <a
                      href={quoteHref}
                      aria-label={
                        card.title
                          ? t("quoteCtaNamed", "اطلب عرض سعر لخدمة {service}", {
                              service: card.title,
                            })
                          : undefined
                      }
                      className={cn(
                        "inline-flex items-center gap-1.5 rounded-lg text-sm font-semibold underline-offset-4 transition-colors hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60",
                        card.src ? "text-white" : "text-primary"
                      )}
                    >
                      <FileText className="size-4 shrink-0" aria-hidden="true" />
                      {t("quoteCta", "اطلب عرض سعر لهذه الخدمة")}
                    </a>
                  </CardContent>
                ) : null}
              </Card>
            );

            /*
             * ⚠ **كان `<Fragment>` بلا عقدة DOM** لأن البطاقة كانت عنصر الشبكة
             * مباشرةً. والسكة تشترط `<li>` — لأنها `role="list"` ولأن
             * `snap-start` و`w-64` يقعان على العنصر لا على البطاقة. و`RailItem`
             * هي تلك الـ`<li>` بعرضها الموحَّد.
             *
             * وتمدّد البطاقة لم يُفقد: حاوية السكة `flex` بمحاذاة `stretch`
             * الافتراضية، فتتمدد الـ`<li>` إلى أطول أخواتها و`h-full` على
             * البطاقة (وهي عليها أصلاً) تملؤها. ونفس الشيء داخل الشبكة فوق `md`.
             */
            return <RailItem key={card.key}>{body}</RailItem>;
          })}
        </Rail>
      </div>
    </section>
  );
}
