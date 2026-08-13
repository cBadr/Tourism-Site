import { Hero } from "@/components/site/hero";
import { BookingWidget } from "@/components/booking/booking-widget";
import type { SectionContentMap } from "@/lib/content-types";
import type { SiteSettings } from "@/lib/site-config";
import { DEFAULT_LOCALE } from "@/lib/i18n-types";

/**
 * قسم «الواجهة الرئيسية» — غلاف حول مكوّن المرحلة ١ مع تمرير تجاوزات المحتوى.
 *
 * المرحلة ٣: ويدجت البحث المضغوط يُركَّب أسفل أزرار البطل مباشرة كبطاقة عائمة
 * تتداخل مع حافة القسم — الزائر يحصل على سعره من الصفحة الأولى بلا تنقل.
 * قنوات التواصل تمر من الإعدادات إلى الويدجت (أزرار الحجز المرحلية).
 *
 * المرحلة ٨: اللغة تُمرَّر إلى الويدجت (جزيرة عميل) فتُنسَّق الأرقام والأسعار
 * بها وتُقرأ نصوصها من مساحة `booking.widget`.
 *
 * المرحلة ١٢أ: الويدجت يُركَّب عبر `<BookingWidget>` — غلاف خادمي غير متزامن
 * يجلب راية تفعيل الخصومات وبانرات العرض ويمرّرها props. القسم نفسه يبقى
 * متزامناً، فلا يتغير نوعه في سجل الأقسام.
 */
export function HeroSection({
  content,
  settings,
  locale = DEFAULT_LOCALE,
}: {
  content: SectionContentMap["hero"];
  settings: SiteSettings;
  locale?: string;
}) {
  return (
    <>
      <Hero settings={settings} content={content} locale={locale} />
      <div className="relative z-10 -mt-12 px-4 pb-6 sm:px-6 md:-mt-16">
        <div className="mx-auto w-full max-w-4xl">
          <BookingWidget
            compact
            locale={locale}
            contact={{
              whatsapp: settings.contact.whatsapp,
              phone: settings.contact.phone,
            }}
            className="shadow-2xl shadow-primary/10"
          />
        </div>
      </div>
    </>
  );
}
