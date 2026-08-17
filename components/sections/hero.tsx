import { Hero } from "@/components/site/hero";
import { BookingWidget } from "@/components/booking/booking-widget";
import { BOOKING_WIDGET_ANCHOR_ID } from "@/components/site/links";
import type { SectionContentMap } from "@/lib/content-types";
import type { SiteSettings } from "@/lib/site-config";
import type { BlockStyle } from "@/lib/page-builder-types";
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
  style,
  locale = DEFAULT_LOCALE,
}: {
  content: SectionContentMap["hero"];
  settings: SiteSettings;
  /**
   * ن‑٤: مقابض أثر الكتابة مطهَّرةً (‏`readBlockStyle`). تمرّ عبر هذا الوسيط
   * وحده — `sanitizeContent` تُسقط `content.style` قبل العارضة بقصد، فلا يقرأ
   * أي مكوّن قسمٍ `content.style` بنفسه (العقد §٥ · نفس مسار `callout.tone`).
   */
  style?: BlockStyle | null;
  locale?: string;
}) {
  return (
    <>
      <Hero settings={settings} content={content} style={style} locale={locale} />
      <div className="relative z-10 -mt-12 px-4 pb-6 sm:px-6 md:-mt-16">
        {/*
          🔴 المعرّف ليس زخرفةً: **حدّ ظهور الشريط السفلي يُقاس منه**.

          الويدجت يتداخل مع البطل (‏`-mt-12`) ويمتدّ تحته، فحدُّ «ارتفاع البطل
          − ١٤٠» كان يقع **داخل** الويدجت — أي يصل الشريط وزرّ «احسب السعر» ما
          زال على الشاشة. والقياس صار من قاع هذا الغلاف: الشريط لا يظهر قبل أن
          يغادر الويدجت كاملاً (‏`SlideUpBar` عند `afterId`).

          وهو على **الغلاف الداخلي** لا الخارجي: الخارجي يحمل `pb-6`، فقياسه
          يؤخّر الشريط بحشوٍ لا علاقة له بالويدجت.
        */}
        <div id={BOOKING_WIDGET_ANCHOR_ID} className="mx-auto w-full max-w-4xl">
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
