import { CtaBand } from "@/components/site/cta";
import type { SectionContentMap } from "@/lib/content-types";
import type { SiteSettings } from "@/lib/site-config";
import { DEFAULT_LOCALE } from "@/lib/i18n-types";

/** قسم «شريط الحجز» — شريط الدعوة من المرحلة ١ مع تجاوزات العنوان والتنويه */
export function CtaBandSection({
  content,
  settings,
  locale = DEFAULT_LOCALE,
}: {
  content: SectionContentMap["cta-band"];
  settings: SiteSettings;
  locale?: string;
}) {
  return <CtaBand settings={settings} content={content} locale={locale} />;
}
