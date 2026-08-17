import { CarFront, Headset, UserCheck, Wallet } from "lucide-react";
import {
  PointerGlowGrid,
  PointerGlowLayer,
  Reveal,
  fx,
  pointerGlowHostClass,
} from "@/components/motion";
import { cn } from "@/lib/utils";
import type { BlockStyle } from "@/lib/page-builder-types";
import { DEFAULT_LOCALE } from "@/lib/i18n-types";
import { getT } from "@/lib/i18n/content";
import { SectionHeading } from "./section-heading";

/** نقاط القيمة الأربع — لماذا يختارنا العميل (النص من `site.whyUs.points.*`) */
const VALUE_POINTS = [
  {
    key: "fleet",
    icon: CarFront,
    title: "أسطول حديث ومتنوع",
    description:
      "سيارات نظيفة بموديلات حديثة تناسب كل حجم رحلة — من السيدان إلى الباص الكامل.",
  },
  {
    key: "drivers",
    icon: UserCheck,
    title: "سائقون محترفون",
    description:
      "سائقون مدرّبون يعرفون الطرق جيداً، يلتزمون بالمواعيد ويحرصون على راحتك.",
  },
  {
    key: "pricing",
    icon: Wallet,
    title: "أسعار واضحة",
    description:
      "سعر نهائي معلن قبل التحرك — لا رسوم مخفية ولا مفاجآت عند الوصول.",
  },
  {
    key: "support",
    icon: Headset,
    title: "متابعة ٢٤/٧",
    description:
      "فريق متابعة متاح على مدار الساعة — قبل الرحلة وأثناءها وبعد الوصول.",
  },
] as const;

/**
 * ╔══════════════════════════════════════════════════════════════════════════╗
 * ║  «لماذا نحن» — شكلان يختار بينهما المالك من المنشئ                       ║
 * ╚══════════════════════════════════════════════════════════════════════════╝
 *
 * ── الشكوى المقيسة ─────────────────────────────────────────────────────────
 *
 * بدر، بعد أن فتح الموقع على هاتفه، عن «ما تحصل عليه في كل حجز»:
 * «أسلوب العرض الحالي يستهلك مساحة كبيرة نسبياً على الموبايل… يمكن عرض الأمر
 * بشكل مختلف مع استخدام رسومات أو مؤثرات معينة لإطفاء الاحترافية و عوامل
 * الإنبهار».
 *
 * والشكل الذي شكا منه كان: **عمودٌ واحد على الجوال**، كل بند فيه مركزٌ أفقياً
 * بأيقونةٍ ٥٦ بكسل فوق عنوانٍ فوق فقرة، والفجوة الرأسية بينها `gap-y-12`
 * (٤٨ بكسل). أي ~٣٠٠ بكسل للبند الواحد.
 *
 * ── ولماذا شكلان لا واحد ───────────────────────────────────────────────────
 *
 * | `dense` (الافتراضي) | `expressive` |
 * |---|---|
 * | الأيقونة والعنوان على **سطرٍ واحد**، والوصف تحته مباشرةً؛ بلا بطاقةٍ ولا إطار | بطاقاتٌ برقمٍ ضخم خلفها ووهجٍ يتبع المؤشّر وظهورٍ مُدرَّج |
 * | يكسب لأن القسم **يُقرأ ليُقرَّر** لا ليُعجَب — والشاشة صغيرة والصبر أقصر | يكسب حين تكون الرسالة «نحن محترفون» لا «إليك ما تحصل عليه» |
 *
 * **والاختيار لبدر لا لي.** ورأيي مكتوبٌ ولا يُنفَّذ بلا رده: الاحترافية في
 * قسمٍ قراريّ تأتي من الكثافة والوضوح لا من الأثر — لكنه يعرف جمهوره،
 * فالشكلان مبنيّان بالجدّية نفسها وتبديلُهما قائمةٌ واحدة في المنشئ.
 *
 * ⚠ **وكل حركةٍ هنا مستوردة من `components/motion/**` ولا شيء جديد**:
 * `Reveal` و`PointerGlow*` و`fx.cardLift` — وكلها محروسة داخلياً بـ
 * `prefers-reduced-motion: no-preference`، فمن طلب تقليل الحركة يرى الشكل
 * البصريّ ساكناً كاملاً لا ناقصاً.
 */
export async function WhyUsSection({
  content,
  locale = DEFAULT_LOCALE,
  style,
}: {
  content?: { title?: string; sub?: string };
  locale?: string;
  style?: BlockStyle | null;
} = {}) {
  const t = await getT("site.whyUs", locale);
  const expressive = style?.whyUsLayout === "expressive";

  const points = VALUE_POINTS.map((point) => ({
    key: point.key,
    Icon: point.icon,
    title: t(`points.${point.key}.title`, point.title),
    description: t(`points.${point.key}.description`, point.description),
  }));

  return (
    <section
      id="why"
      className={cn("scroll-mt-24", expressive ? "py-20 md:py-28" : "py-14 md:py-24")}
    >
      <div className="mx-auto w-full max-w-6xl px-4 sm:px-6">
        <SectionHeading
          eyebrow={t("eyebrow", "لماذا نحن")}
          title={content?.title ?? t("title", "تفاصيل صغيرة تصنع رحلة مريحة")}
          description={
            content?.sub ??
            t("description", "نهتم بما يجعل تجربتك سلسة من لحظة الحجز حتى الوصول بأمان.")
          }
        />

        {expressive ? (
          /* ═══ (ب) البصريّ ═══════════════════════════════════════════════
             رقمٌ ضخم خلف كل بند يعطي القسم إيقاعاً يُقرأ قبل النصّ، ووهجٌ
             يتبع المؤشّر على المكتب، وظهورٌ مُدرَّج عند دخول الشاشة.
             والرقم `aria-hidden` زخرفةٌ خالصة: البنود ليست مرتَّبة، وقارئ
             الشاشة يقرأ العنوان وحده. */
          <PointerGlowGrid
            as="ul"
            className="mt-10 grid gap-4 sm:grid-cols-2 md:mt-14 lg:grid-cols-4"
          >
            {points.map((point, index) => (
              <Reveal
                as="li"
                key={point.key}
                stagger={index}
                className={cn(
                  pointerGlowHostClass,
                  fx.cardLift,
                  "relative overflow-hidden rounded-2xl border border-border bg-gradient-to-bl from-primary/[0.09] to-transparent p-5 ring-1 ring-inset ring-white/5"
                )}
              >
                <PointerGlowLayer />
                <span
                  aria-hidden="true"
                  /* الجهة المقابلة للأيقونة: كلاهما في الأعلى، فتجاورهما على
                     الجهة نفسها كان يجعل الرقم يُقرأ خلف الرمز لا بجانبه */
                  className="pointer-events-none absolute -top-3 end-3 select-none text-7xl font-black leading-none text-primary/10"
                >
                  {index + 1}
                </span>
                <div className="relative">
                  <span className="grid size-12 place-items-center rounded-xl bg-primary/12 text-primary ring-1 ring-primary/20">
                    <point.Icon className="size-6" aria-hidden="true" />
                  </span>
                  <h3 className="mt-4 text-base font-bold leading-6">{point.title}</h3>
                  <p className="mt-2 text-pretty text-sm leading-6 text-muted-foreground">
                    {point.description}
                  </p>
                </div>
              </Reveal>
            ))}
          </PointerGlowGrid>
        ) : (
          /* ═══ (أ) المضغوط ═══════════════════════════════════════════════
             صفٌّ واحد لكل بند: أيقونةٌ ٣٦ بكسل والعنوان بجوارها على السطر
             نفسه، والوصف تحته. بلا بطاقة ولا إطار ولا ظل — وثلاثتها كانت
             تدفع الارتفاع بلا أن تضيف معنى، لأن الفصل بين البنود يكفيه
             الفراغُ نفسه. */
          <ul className="mt-8 grid gap-x-8 gap-y-6 sm:grid-cols-2 md:mt-12 lg:grid-cols-4">
            {points.map((point) => (
              <li key={point.key} className="flex items-start gap-3">
                <span className="mt-0.5 grid size-9 shrink-0 place-items-center rounded-lg bg-primary/10 text-primary">
                  <point.Icon className="size-5" aria-hidden="true" />
                </span>
                <div className="min-w-0">
                  <h3 className="text-base font-bold leading-6">{point.title}</h3>
                  <p className="mt-1 text-pretty text-sm leading-6 text-muted-foreground">
                    {point.description}
                  </p>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}
