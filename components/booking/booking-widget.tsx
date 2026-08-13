import { getPromoBanners } from "@/lib/discounts/banners";
import { isDiscountEnabled } from "@/lib/discounts/settings";
import { DEFAULT_LOCALE } from "@/lib/i18n-types";
import { SearchWidget } from "./search-widget";
import { getPublicExtras } from "./extras-catalog";
import { getMaxLuggageCapacity } from "./fleet-luggage";
import type { BookingContact } from "./offers";

/**
 * غلاف خادمي حول ويدجت البحث — يجلب ما تحتاجه طبقة الخصومات ويمرّره props.
 *
 * ── لماذا غلاف أصلاً ──────────────────────────────────────────────────────
 * `SearchWidget` جزيرة عميل، ولا يجوز أن تقرأ `site_settings` ولا جدول البانرات
 * بنفسها: قراءة الإعدادات من المتصفح تعني كشف سياسة الخصم للزائر، ورحلة شبكة
 * إضافية على أسخن مسار في الموقع. فتُقرأ هنا على الخادم (مُذاكَرة لكل طلب) وتصل
 * الويدجت props قابلة للتسلسل.
 *
 * وهو **مكوّن خادمي غير متزامن**، يُصيَّر من مكوّنات متزامنة بلا مشكلة — نفس ما
 * يفعله `HeroSection` مع `<Hero>` المتزامن الشكل غير المتزامن التنفيذ. هذا ما
 * يُبقي سجل الأقسام (`components/sections/render.tsx`) على نوعه بلا تعديل.
 *
 * 🔒 ما يعبر إلى المتصفح: `discountEnabled` (رايةٌ لا رقم) ونصوص البانرات
 * المعروضة للعامة أصلاً. ولا تعبر `maxPercent` ولا أرضيات الهامش ولا أي رقم من
 * `DiscountSettings` — لا يوجد له مكان في أنواع الويدجت أصلاً.
 */
export async function BookingWidget({
  contact,
  compact = false,
  locale = DEFAULT_LOCALE,
  className,
}: {
  contact?: BookingContact;
  compact?: boolean;
  locale?: string;
  className?: string;
}) {
  const [discountEnabled, offerBanners, checkoutBanners, extras, maxLuggage] = await Promise.all([
    isDiscountEnabled(),
    getPromoBanners("offers"),
    getPromoBanners("checkout"),
    // كتالوج الخدمات (0031): يُقرأ هنا لا في الجزيرة — والفارغ يعني ألّا يظهر
    // في الويدجت شيء إطلاقاً، وهي الحالة الافتراضية حتى يضيف المالك خدماته.
    getPublicExtras(),
    // سقف عدّاد الحقائب من الأسطول نفسه: عدّادٌ يصعد فوق أكبر سعة يعرض على
    // العميل رقماً يضمن «لا توجد فئة». والفشل يعيد null فيبقى السقف الثابت.
    getMaxLuggageCapacity(),
  ]);

  return (
    <SearchWidget
      contact={contact}
      compact={compact}
      locale={locale}
      className={className}
      discountEnabled={discountEnabled}
      offerBanners={offerBanners}
      checkoutBanners={checkoutBanners}
      extras={extras}
      maxLuggage={maxLuggage}
    />
  );
}
