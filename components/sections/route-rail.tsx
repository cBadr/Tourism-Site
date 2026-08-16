import Image from "next/image";
import { ArrowLeft, Clock, Route } from "lucide-react";
import { Card } from "@/components/ui/card";
import { SectionHeading } from "@/components/site/section-heading";
import { internalPath, localeHref } from "@/components/site/links";
import { safeMediaSrc } from "@/components/sections/image";
import { iconFor } from "@/components/sections/icons";
import { cn } from "@/lib/utils";
import type { SectionContentMap } from "@/lib/content-types";
import { DEFAULT_LOCALE } from "@/lib/i18n-types";
import { getT } from "@/lib/i18n/content";

/**
 * سكة المسارات — نقلٌ لقسم `.rail--rt` في التصميم.
 *
 * ── أربعة قرارات مكتوبة، وأحدها نُقض بأمر المالك ─────────────────────────────
 *
 * 🔴 (١) **بلا أسعار** (قرار بدر ١) — **قائم ولم يُنقَض**. التصميم يكتب «من
 *     ٩٥٠ ج.م» على البطاقة، و`pages` **بلا حقل سعر أصلاً** — فالرقم ادّعاءٌ بلا
 *     مصدر. وأخطر منه أنه يخالف ما تحسبه الحاسبة بعد ثانيتين، فيهدم الجملة
 *     التي بُني عليها المنتج: «سعر ثابت تعرفه قبل ما تحجز».
 *
 * (٢) **الروابط تتبع الـslug لا العكس** (قرار بدر ٦). ثلاثة من مسارات التصميم
 *     الستة لا وجود لها في القاعدة، وتغيير الـslug ممنوع بقرار مكتوب (D-24).
 *
 * (٣) 🔒 **الرابط الداخلي وحده يُصيَّر رابطاً.** الحقل يكتبه مشرف، لكن قيمةً
 *     خارجية في محتوى صفحةٍ عامة تعني إمكان تحويل الزائر إلى نطاق آخر من قلب
 *     الرئيسية — فما لا يبدأ بـ`/` **يُصيَّر بطاقةً بلا رابط**. والحارس
 *     `internalPath` صار في `components/site/links.ts` (نقلٌ لا استنساخ:
 *     بطاقات الخدمات تحتاجه الآن كذلك — القاعدة الذهبية ١٢).
 *
 * 🔴 (٤) **«بلا صورة» نُقض صراحةً — 2026-08-16، بأمر بدر:** «ضيف الأعمدة
 *     المطلوبة بحيث يمكن التحكم في كل شيء من خلال لوحة التحكم بما فيها الصور
 *     والأيكونات». وكان مكتوباً هنا أن الصورة «قيدُ عقدٍ لا نقصُ تنفيذ» لأن
 *     `src` داخل عنصر قائمة شكلٌ لم يُقنَّن — **فقُنِّن** في م‑٧:
 *     `lib/item-fields-types.ts` عقداً، والهجرة `0065` قاعدةً وحارساً.
 *
 *     والبطاقة اليوم **مسنودةٌ بصورة** كما في التصميم: الصورة تملأ البطاقة،
 *     والنصّ فوق حجابٍ متدرّج — وبلا `src` تعود إلى تدرّج اللون حرفاً كما
 *     كانت، فصفحةٌ قائمة لا تتغيّر ببايت حتى يكتب المالك أول مسار.
 *
 * ⚠ **و`alt` نصٌّ يُترجَم ولا يلحق بالوسائط** — يقرؤه من لا يرى الصورة
 *   ويفهرسه جوجل. والفارغ يعني **زخرفة** (`alt=""`) وهو الصواب حين يقول اسم
 *   البطاقة ما تقوله صورتها؛ فالإلزام على وجود الحقل لا على قيمته.
 */

export async function RouteRailSection({
  content,
  locale = DEFAULT_LOCALE,
}: {
  content: SectionContentMap["route-rail"];
  locale?: string;
}) {
  const items = (content.items ?? []).filter((item) => item?.name);
  if (items.length === 0) return null;

  const t = await getT("sections.routeRail", locale);

  return (
    <section id="routes" className="scroll-mt-24 py-16 md:py-24">
      <div className="mx-auto w-full max-w-6xl px-4 sm:px-6">
        {content.title ? (
          <SectionHeading
            eyebrow={t("eyebrow", "المسارات")}
            title={content.title}
            description={content.sub}
          />
        ) : null}

        {/**
         * سكة أفقية على الجوال وشبكة على المكتب — وهو سلوك التصميم نفسه.
         * `snap` يجعل السحب يستقر على بطاقة كاملة لا على نصفها، و`-mx-4 px-4`
         * يُبقي أول بطاقة وآخرها ملتصقتين بحافة الشاشة أثناء السحب.
         */}
        <ul
          role="list"
          className={cn(
            "-mx-4 flex snap-x snap-mandatory gap-4 overflow-x-auto px-4 pb-4 sm:-mx-6 sm:px-6",
            "md:mx-0 md:grid md:grid-cols-2 md:gap-5 md:overflow-visible md:px-0 md:pb-0 lg:grid-cols-3",
            content.title && "mt-10 md:mt-14"
          )}
        >
          {items.map((item, index) => {
            const href = internalPath(item.href);
            const key = (item as { _k?: string })._k ?? `${item.name}-${index}`;
            /** الوسائط تمرّ من حارسها هي — لا من حارس الروابط (الفرق في `links.ts`) */
            const src = safeMediaSrc(item.src);
            const alt = typeof item.alt === "string" ? item.alt.trim() : "";
            const Icon = iconFor(item.icon);

            const body = (
              <>
                {/*
                 * الأيقونة فوق الاسم — رمزٌ يختاره المالك من قائمة مغلقة.
                 * وغيابها لا يترك فراغاً: العنصر كله لا يُصيَّر.
                 */}
                {Icon ? (
                  <span
                    className={cn(
                      "mb-3 grid size-10 shrink-0 place-items-center rounded-xl",
                      src
                        ? "bg-white/15 text-white backdrop-blur-sm"
                        : "bg-primary/10 text-primary"
                    )}
                  >
                    <Icon className="size-5" aria-hidden="true" />
                  </span>
                ) : null}

                <span className="flex-1 text-pretty text-base font-bold leading-7">
                  {item.name}
                </span>

                {item.duration || item.distance ? (
                  <span
                    className={cn(
                      "mt-3 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-sm",
                      // فوق صورة معتمة يُرفع النصّ الثانوي درجةً: `muted` يقارب حدّ AA
                      src ? "text-white/80" : "text-muted-foreground"
                    )}
                  >
                    {item.duration ? (
                      <span className="inline-flex items-center gap-1.5">
                        <Clock className="size-4 shrink-0" aria-hidden="true" />
                        {item.duration}
                      </span>
                    ) : null}
                    {item.distance ? (
                      <span className="inline-flex items-center gap-1.5">
                        <Route className="size-4 shrink-0" aria-hidden="true" />
                        {item.distance}
                      </span>
                    ) : null}
                  </span>
                ) : null}

                {href ? (
                  <span
                    className={cn(
                      "mt-4 inline-flex items-center gap-1.5 text-sm font-semibold",
                      src ? "text-white" : "text-primary"
                    )}
                  >
                    {t("cta", "اعرف السعر")}
                    {/* السهم يشير إلى جهة القراءة التالية — والإزاحة معه */}
                    <ArrowLeft
                      className="size-4 transition-transform duration-300 group-hover/route:-translate-x-1"
                      aria-hidden="true"
                    />
                  </span>
                ) : null}
              </>
            );

            /**
             * طبقة الصورة — مطلقةٌ خلف النصّ كما في التصميم، لا بطاقةٌ فوقها
             * صورة. والتعتيم **شرط قراءةٍ لا زينة**: نصٌّ فاتح فوق صورةٍ فاتحة
             * يسقط دون AA في أي بقعة مضيئة منها.
             *
             * و`sizes` مقيسٌ على التخطيط أعلاه: ٢٥٦ بكسل عرض البطاقة على
             * الجوال (`w-64`)، وثلث الحاوية (١١٥٢) على المكتب. ورقمٌ خاطئ هنا
             * يجعل `next/image` يطلب نسخةً أعرض بلا بكسل مرئي إضافي.
             */
            const media =
              src !== null ? (
                <span aria-hidden={alt === "" ? "true" : undefined} className="absolute inset-0 z-0">
                  <Image
                    src={src}
                    alt={alt}
                    fill
                    sizes="(max-width: 767px) 256px, (max-width: 1023px) 50vw, 384px"
                    quality={55}
                    className="object-cover transition-transform duration-500 group-hover/route:scale-105"
                  />
                  <span className="absolute inset-0 bg-[linear-gradient(to_top,color-mix(in_oklab,var(--ink)_92%,transparent),color-mix(in_oklab,var(--ink)_58%,transparent)_58%,color-mix(in_oklab,var(--ink)_30%,transparent))]" />
                </span>
              ) : null;

            return (
              <li key={key} className="w-64 shrink-0 snap-start md:w-auto">
                <Card
                  className={cn(
                    "group/route relative h-full overflow-hidden rounded-2xl ring-border transition-all duration-300",
                    src
                      ? "min-h-56 border-transparent bg-transparent text-white ring-white/15"
                      : "bg-gradient-to-bl from-primary/[0.07] to-transparent",
                    href &&
                      "hover:-translate-y-1.5 hover:shadow-xl hover:shadow-primary/10 hover:ring-primary/30"
                  )}
                >
                  {media}
                  {href ? (
                    <a
                      href={localeHref(href, locale)}
                      className="relative z-10 flex h-full flex-col justify-end p-5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"
                    >
                      {body}
                    </a>
                  ) : (
                    /* رابطٌ غير داخلي ⇒ بطاقة صامتة، لا وجهة خارجية من الرئيسية */
                    <div className="relative z-10 flex h-full flex-col justify-end p-5">{body}</div>
                  )}
                </Card>
              </li>
            );
          })}
        </ul>

        {content.note ? (
          <p className="mt-6 text-center text-xs leading-6 text-muted-foreground/80">
            {content.note}
          </p>
        ) : null}
      </div>
    </section>
  );
}
