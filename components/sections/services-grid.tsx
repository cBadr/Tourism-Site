import { ServicesSection as ServicesVisual } from "@/components/site/services";
import type { SectionContentMap } from "@/lib/content-types";
import { DEFAULT_LOCALE } from "@/lib/i18n-types";

/** قسم «شبكة الخدمات» — بطاقات الخدمات الست من المرحلة ١ مع تجاوزات العنوان والوصف */
export function ServicesGridSection({
  content,
  locale = DEFAULT_LOCALE,
}: {
  content: SectionContentMap["services-grid"];
  locale?: string;
}) {
  return <ServicesVisual content={content} locale={locale} />;
}
