import { ContactSection as ContactVisual } from "@/components/site/contact";
import type { SectionContentMap } from "@/lib/content-types";
import type { SiteSettings } from "@/lib/site-config";
import { DEFAULT_LOCALE } from "@/lib/i18n-types";

/** قسم «التواصل» — قنوات التواصل من المرحلة ١ مع تجاوزات العنوان والوصف */
export function ContactSection({
  content,
  settings,
  locale = DEFAULT_LOCALE,
}: {
  content: SectionContentMap["contact"];
  settings: SiteSettings;
  locale?: string;
}) {
  return <ContactVisual settings={settings} content={content} locale={locale} />;
}
