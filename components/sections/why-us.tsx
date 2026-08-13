import { WhyUsSection as WhyUsVisual } from "@/components/site/why-us";
import type { SectionContentMap } from "@/lib/content-types";
import { DEFAULT_LOCALE } from "@/lib/i18n-types";

/** قسم «لماذا نحن» — نقاط القيمة من المرحلة ١ مع تجاوزات العنوان والوصف */
export function WhyUsSection({
  content,
  locale = DEFAULT_LOCALE,
}: {
  content: SectionContentMap["why-us"];
  locale?: string;
}) {
  return <WhyUsVisual content={content} locale={locale} />;
}
