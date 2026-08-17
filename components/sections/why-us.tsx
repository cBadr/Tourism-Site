import { WhyUsSection as WhyUsVisual } from "@/components/site/why-us";
import type { SectionContentMap } from "@/lib/content-types";
import type { BlockStyle } from "@/lib/page-builder-types";
import { DEFAULT_LOCALE } from "@/lib/i18n-types";

/**
 * قسم «لماذا نحن» — نقاط القيمة من المرحلة ١ مع تجاوزات العنوان والوصف.
 * و`style` يمرّ لأن شكل العرض (مضغوط/بصريّ) رمزٌ فيه (‏`whyUsLayout`).
 */
export function WhyUsSection({
  content,
  locale = DEFAULT_LOCALE,
  style,
}: {
  content: SectionContentMap["why-us"];
  locale?: string;
  style?: BlockStyle | null;
}) {
  return <WhyUsVisual content={content} locale={locale} style={style} />;
}
