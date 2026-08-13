import type { ReactNode } from "react";
import type {
  Section,
  SectionContentMap,
  SectionType,
} from "@/lib/content-types";
import type { SiteSettings } from "@/lib/site-config";
import { DEFAULT_LOCALE } from "@/lib/i18n-types";
import { HeroSection } from "./hero";
import { PageHeroSection } from "./page-hero";
import { ServicesGridSection } from "./services-grid";
import { FleetSection } from "./fleet";
import { WhyUsSection } from "./why-us";
import { FeaturesSection } from "./features";
import { RichTextSection } from "./rich-text";
import { FaqSection } from "./faq";
import { CtaBandSection } from "./cta-band";
import { ContactSection } from "./contact";

/**
 * سجل الأقسام الأوحد: كل نوع في `SectionType` يقابله مكوّن واحد هنا.
 * الواجهة العامة كلها ترسم أقسامها عبر <RenderSections> — لا استدعاء مباشر
 * لمكوّنات الأقسام من الصفحات. النوع غير المعروف يُتجاهل بأمان.
 *
 * المرحلة ٨: اللغة تمر من الصفحة إلى كل قسم. محتوى القسم نفسه يصل مترجماً من
 * `lib/content.ts`، واللغة هنا لنصوص الواجهة الثابتة داخل الأقسام (الشارات
 * والأزرار) ولبيانات النظام (الخدمات وفئات السيارات) ولتنسيق الأرقام.
 */

type SectionProps<T extends SectionType> = {
  content: SectionContentMap[T];
  settings: SiteSettings;
  locale: string;
};

const SECTION_REGISTRY: {
  [T in SectionType]: (props: SectionProps<T>) => ReactNode;
} = {
  hero: HeroSection,
  "page-hero": PageHeroSection,
  "services-grid": ServicesGridSection,
  fleet: FleetSection,
  "why-us": WhyUsSection,
  features: FeaturesSection,
  "rich-text": RichTextSection,
  faq: FaqSection,
  "cta-band": CtaBandSection,
  contact: ContactSection,
};

/** يرسم الأقسام المرئية بترتيبها عبر السجل — القسم غير المعروف يُرسم null */
export function RenderSections({
  sections,
  settings,
  locale = DEFAULT_LOCALE,
}: {
  sections: Section[];
  settings: SiteSettings;
  locale?: string;
}) {
  return (
    <>
      {sections
        .filter((section) => section.visible)
        .map((section) => {
          const Component = SECTION_REGISTRY[section.type] as
            | ((props: {
                content: Section["content"];
                settings: SiteSettings;
                locale: string;
              }) => ReactNode)
            | undefined;

          if (!Component) {
            if (process.env.NODE_ENV !== "production") {
              console.warn(
                `[sections] نوع قسم غير معروف تم تجاهله: "${section.type}"`
              );
            }
            return null;
          }

          return (
            <Component
              key={section.id}
              content={section.content}
              settings={settings}
              locale={locale}
            />
          );
        })}
    </>
  );
}
