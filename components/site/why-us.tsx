import { CarFront, Headset, UserCheck, Wallet } from "lucide-react";
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
 * قسم «لماذا نحن»: أربع قيم مختصرة بإيقاع هادئ بلا بطاقات ثقيلة.
 * `content` اختياري من نظام الأقسام — عند غيابه تُستخدم نصوص `site.whyUs`.
 */
export async function WhyUsSection({
  content,
  locale = DEFAULT_LOCALE,
}: {
  content?: { title?: string; sub?: string };
  locale?: string;
} = {}) {
  const t = await getT("site.whyUs", locale);

  return (
    <section id="why" className="scroll-mt-24 py-20 md:py-28">
      <div className="mx-auto w-full max-w-6xl px-4 sm:px-6">
        <SectionHeading
          eyebrow={t("eyebrow", "لماذا نحن")}
          title={content?.title ?? t("title", "تفاصيل صغيرة تصنع رحلة مريحة")}
          description={
            content?.sub ??
            t("description", "نهتم بما يجعل تجربتك سلسة من لحظة الحجز حتى الوصول بأمان.")
          }
        />

        <div className="mt-12 grid gap-x-8 gap-y-12 sm:grid-cols-2 lg:grid-cols-4 md:mt-16">
          {VALUE_POINTS.map((point) => (
            <div key={point.key} className="flex flex-col items-center gap-4 text-center">
              <div className="grid size-14 place-items-center rounded-2xl bg-primary/10 text-primary ring-1 ring-primary/15">
                <point.icon className="size-7" aria-hidden="true" />
              </div>
              <h3 className="text-lg font-bold">
                {t(`points.${point.key}.title`, point.title)}
              </h3>
              <p className="text-pretty text-sm leading-7 text-muted-foreground">
                {t(`points.${point.key}.description`, point.description)}
              </p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
