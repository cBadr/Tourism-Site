import type { CSSProperties } from "react";
import { Car, CircleCheck } from "lucide-react";
import {
  Card,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { SectionHeading } from "@/components/site/section-heading";
import { iconFor } from "@/components/sections/icons";
import { FlowRail, FlowRoad } from "@/components/motion";
import { createFormatter } from "@/components/booking/format";
import { cn } from "@/lib/utils";
import type { SectionContentMap } from "@/lib/content-types";
import type { BlockStyle } from "@/lib/page-builder-types";
import { DEFAULT_LOCALE } from "@/lib/i18n-types";
import { getT } from "@/lib/i18n/content";

/**
 * قسم المزايا — **شكلان لبنيةٍ واحدة**، يختارهما المالك من المنشئ:
 *
 *   `cards` (الافتراضي) — شبكة بطاقات بنفس لغة بطاقات الخدمات.
 *   `steps` — مسارٌ مرقَّم بخطٍّ يربط خطواته وسيارةٍ تسير عليه: شكل قسم «كيف
 *             نعمل» في حزمة التصميم حرفاً.
 *
 * 🆕 **م‑٧ — الأيقونة صارت للمالك.** كانت `CircleCheck` محفورةً لكل عنصر، وهو
 * قسمٌ يحمل اليوم «كيف نعمل» و«الضمانات الست» معاً (١٩ صفاً حيّاً) — والتصميم
 * يعطي لكل بطاقة رمزها. و`icon` اسمٌ من قائمة مغلقة (`ITEM_ICON_NAMES`) لا
 * حقل نصّ حرّ، **ولا يدخل فهرس الترجمة** (اسمُ مكوّن لا جملة).
 *
 * والغياب يرجع إلى `CircleCheck` حرفاً، فالصفحات القائمة لا تتغيّر ببايت.
 *
 * ── لماذا رمزٌ في `style` لا كتلةٌ جديدة ─────────────────────────────────────
 *
 * الحجّة كاملةً عند `FEATURES_LAYOUT_TOKENS` في `lib/page-builder-types.ts`.
 * وخلاصتها: الرئيسية تحمل **صفَّي `features`** بالبنية نفسها حرفاً، ويختلفان
 * في شكل العرض وحده — فتحويل العارضة كلها إلى مسارٍ مرقَّم كان يجعل «الضمانات
 * الست» تُقرأ إجراءً ذا ترتيب، وهو خطأُ معنى لا ذوق.
 */
export async function FeaturesSection({
  content,
  locale = DEFAULT_LOCALE,
  style,
}: {
  content: SectionContentMap["features"];
  locale?: string;
  style?: BlockStyle | null;
}) {
  const items = (content.items ?? []).filter((item) => item.title);
  if (items.length === 0) return null;

  const t = await getT("sections.features", locale);
  const isSteps = style?.featuresLayout === "steps";

  return (
    <section className="bg-muted/40 py-16 md:py-24">
      <div className="mx-auto w-full max-w-6xl px-4 sm:px-6">
        {content.title ? (
          <SectionHeading
            /**
             * شارة الخطوات ليست «المزايا»: القسم يصف **إجراءً** لا قائمة قيم،
             * وشارةٌ تكذّب ما تحتها أسوأ من غيابها. و`SectionHeading` تشترط
             * شارةً، فالفرق نصٌّ من فهرس الترجمة لا شكلٌ ثانٍ للترويسة.
             */
            eyebrow={isSteps ? t("stepsEyebrow", "كيف نعمل") : t("eyebrow", "المزايا")}
            title={content.title}
            description={content.sub}
          />
        ) : null}

        {isSteps ? (
          <StepsFlow items={items} locale={locale} spaced={Boolean(content.title)} />
        ) : (
          <div
            className={cn(
              "grid gap-5 sm:grid-cols-2 lg:grid-cols-3",
              content.title && "mt-10 md:mt-14"
            )}
          >
            {items.map((item) => {
              /* المجهول يغيب ولا ينهار — والافتراضي هو الرمز الذي كان محفوراً */
              const Icon = iconFor(item.icon, CircleCheck);
              return (
                <Card
                  key={item.title}
                  className="rounded-2xl ring-border transition-all duration-300 hover:-translate-y-1.5 hover:shadow-xl hover:shadow-primary/10 hover:ring-primary/30 [--card-spacing:--spacing(6)]"
                >
                  <CardHeader>
                    <div className="mb-3 grid size-11 place-items-center rounded-xl bg-primary/10 text-primary">
                      {Icon ? <Icon className="size-6" aria-hidden="true" /> : null}
                    </div>
                    <CardTitle className="text-lg font-bold">{item.title}</CardTitle>
                    {item.text ? (
                      <CardDescription className="leading-7">{item.text}</CardDescription>
                    ) : null}
                  </CardHeader>
                </Card>
              );
            })}
          </div>
        )}
      </div>
    </section>
  );
}

/* ══════════════════════════════════════════════════════════════════════════
   شكل «الخطوات» — نقلٌ لقسم `#how` في التصميم
   ══════════════════════════════════════════════════════════════════════════

   ── ما كان هنا قبل هذا التغيير، وما فرَّق بينه وبين التصميم ────────────────

   كان القسم **شبكة بطاقات** لا يفترق فيها «الحجز في ثلاث خطوات» عن أي قائمة
   مزايا: صندوقٌ لكل خطوة، وأيقونة `CircleCheck` نفسها ثلاث مرات، **وبلا رقمٍ
   ولا رابطٍ بين خطوةٍ وتاليتها**. وعلى الجوال تصير الخطوات ثلاثة صناديق فوق
   بعضها — يقرؤها الزائر قائمةً لا إجراءً متتابعاً.

   والتصميم يقول العكس في أربعة أشياء بعينها، وكلها منقولةٌ هنا:

     ١) **رقمٌ في قرص** لكل خطوة (`.step__dot > b.num`)، لا أيقونة.
     ٢) **خطٌّ يربط الخطوات**: رأسيٌّ على الجوال على محور الأقراص، وموجةٌ أفقية
        فوقها على المكتب — وهو ما يجعل الثلاثة تُقرأ مساراً واحداً.
     ٣) **سيارةٌ تسير على الخط** فتصل نهايته، فيقرأ العينُ اتجاه الإجراء.
     ٤) **بلا بطاقة**: النصّ عارٍ على أرضية القسم، فيسقط ثلاثة إطارات وثلاثة
        ظلال من ارتفاع الجوال.

   🔒 **والرسم كله `aria-hidden` زخرفة**: المحتوى كامل في `<ol>` ويُقرأ بلا
   حرفٍ منه. ومن طلب تقليل الحركة يرى الخطّ مرسوماً كاملاً والسيارة راسية عند
   نهايته — حالةٌ صحيحة ساكنة لا حالةُ عطل (القواعد كلها داخل
   `prefers-reduced-motion: no-preference` في `motion.module.css`).

   ⚠ **ولا حركةَ جديدة كُتبت هنا**: `FlowRoad` و`FlowRail` مبنيّتان في
   `components/motion/flow-road.tsx` منذ م‑٥ — **ولم يكن يستوردهما أحد**.
   فالقسم يستعملهما ولا ينسخ منهما سطراً. */

const RAIL = "2.875rem"; /* ٤٦px — عمود الأقراص على الجوال، وقطر قرص السيارة */

function StepsFlow({
  items,
  locale,
  spaced,
}: {
  items: NonNullable<SectionContentMap["features"]["items"]>;
  locale: string;
  spaced: boolean;
}) {
  const fmt = createFormatter(locale);
  const n = items.length;

  const carIcon = <Car className="size-6 -scale-x-100" aria-hidden="true" />;

  return (
    <div
      className={cn("relative", spaced && "mt-10 md:mt-14")}
      style={
        {
          "--flow-rail": RAIL,
          /**
           * حلقة الفصل حول القرص والمحطة والسيارة = **أرضية هذا القسم بعينها**
           * (`bg-muted/40` فوق `background`)، لا `--background` وحدها. ولو تُركت
           * الافتراضية لظهرت حلقةٌ أفتح من الأرضية حول كل قرص — وهي أظهر ما يكون
           * على الأرضية الداكنة.
           */
          "--flow-ring": "color-mix(in oklab, var(--muted) 40%, var(--background))",
        } as CSSProperties
      }
    >
      {/* الموجة الأفقية — المكتب وحده. ارتفاعها = ارتفاع الـviewBox فلا تشوّه رأسي */}
      <FlowRoad
        steps={n}
        icon={carIcon}
        className="mb-4 hidden h-30 md:block"
        carClassName="size-11"
      />

      {/* الخطّ الرأسي — الجوال وحده. يمتد من مركز أول قرص إلى مركز السيارة
          الراسية: لا بدايةٌ معلّقة ولا ذيلٌ زائد. */}
      <FlowRail
        icon={carIcon}
        className="absolute start-0 top-[calc(var(--flow-rail)/2)] bottom-[calc(var(--flow-rail)/2)] w-[var(--flow-rail)] md:hidden"
        carClassName="size-11"
      />

      <ol
        className={cn(
          "relative grid gap-8",
          /* حشوٌ سفلي بقدر قرص السيارة — موقفها، ولولاه لركبت آخر خطوة */
          "pb-12 md:gap-0 md:pb-0",
          /* أعمدةٌ متساوية بلا فجوة: `FlowRoad` تحسب مركز العمود k حسابياً
             (`(k+½)/n`) لا قياساً من الـDOM، فالفجوة كانت تزيح كل محطة عن قرصها */
          "md:grid-cols-[repeat(var(--flow-cols),minmax(0,1fr))]"
        )}
        style={{ "--flow-cols": n } as CSSProperties}
      >
        {items.map((item, index) => (
          <li
            key={(item as { _k?: string })._k ?? `${item.title}-${index}`}
            className="relative grid grid-cols-[var(--flow-rail)_1fr] items-start gap-x-4 md:block md:px-2 md:text-center"
          >
            <span
              aria-hidden="true"
              className="relative z-10 grid size-[var(--flow-rail)] place-items-center rounded-full border-2 border-primary bg-card text-lg font-extrabold text-primary md:mx-auto md:mb-3"
            >
              {/* الرقم موضعيّ لا حقل: إعادةُ ترتيب عنصرٍ من المنشئ تعيد ترقيمه */}
              {fmt.digits(index + 1)}
            </span>
            <div className="pt-1.5 md:pt-0">
              <h3 className="text-lg font-bold leading-7">{item.title}</h3>
              {item.text ? (
                <p className="mt-1.5 text-pretty text-sm leading-7 text-muted-foreground">
                  {item.text}
                </p>
              ) : null}
            </div>
          </li>
        ))}
      </ol>
    </div>
  );
}
