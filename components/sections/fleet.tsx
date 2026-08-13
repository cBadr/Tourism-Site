import { FleetSection as FleetVisual } from "@/components/site/fleet";
import type { SectionContentMap } from "@/lib/content-types";
import { DEFAULT_LOCALE } from "@/lib/i18n-types";

/** قسم «الأسطول» — فئات السيارات الأربع من المرحلة ١ مع تجاوزات العنوان والوصف */
export function FleetSection({
  content,
  locale = DEFAULT_LOCALE,
}: {
  content: SectionContentMap["fleet"];
  locale?: string;
}) {
  return <FleetVisual content={content} locale={locale} />;
}
