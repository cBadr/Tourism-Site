import { socialHref, type SiteSettings, type SocialSettings } from "@/lib/site-config";
import { DEFAULT_LOCALE, localePath } from "@/lib/i18n-types";
import type { Tx } from "./i18n";

/**
 * روابط التنقل والأدوات المشتركة لمكوّنات الموقع العام.
 * لا قيم علامة تجارية هنا — كل شيء يُشتق من SiteSettings وقت التنفيذ.
 *
 * المرحلة ٨: كل رابط داخلي يمر بـ `localePath(locale, path)` — العربية تبقى بلا
 * بادئة حرفياً (`/#services`)، والإنجليزية تحصل على `/en#services`. ونصوص
 * القائمة تأتي من مساحة `site.nav`، وأسماء الشبكات من `site.social`.
 */

/**
 * روابط القائمة — مسارات مطلقة عمداً (`/#services` لا `#services`):
 * الترويسة تظهر في كل الصفحات، والمرساة النسبية لا تعني شيئاً في
 * `/book` أو `/services/...` لأن تلك الأقسام موجودة في الرئيسية وحدها.
 */
export const NAV_LINKS = [
  { href: "/#services", key: "services", label: "الخدمات" },
  { href: "/#fleet", key: "fleet", label: "الأسطول" },
  { href: "/#why", key: "why", label: "لماذا نحن" },
  { href: "/#contact", key: "contact", label: "تواصل" },
  /**
   * «تابع حجزك» — الملاحظة ١ في ملحق ٢ من الرؤية: من أغلق التبويب فقد الطريق
   * إلى حجزه، والمطلوب **مدخل ظاهر في الموقع** لا نموذجاً مدفوناً.
   *
   * موضعه في هذه القائمة وحدها يكفي لثلاثة أسطح: التنقل في الترويسة، وقائمة
   * الجوال (‏`details` بلا JavaScript)، وعمود «أقسام الموقع» في التذييل —
   * ثلاثتها تقرأ `navLinks()` من هنا. ومسارٌ مطلق لأن الترويسة تظهر في كل صفحة.
   *
   * وهو **آخر** القائمة عمداً: من يبحث عن حجزه يعرف ما يريد ويمسح القائمة
   * كاملة، ومن يتصفح لأول مرة يجب أن تلقاه الخدمات لا نموذج متابعة لا يعنيه.
   */
  { href: "/track", key: "track", label: "تابع حجزك" },
] as const;

/** روابط القائمة بلغة الزائر — النص من مساحة `site.nav` والمسار من localePath */
export function navLinks(t?: Tx, locale: string = DEFAULT_LOCALE): { href: string; label: string }[] {
  return NAV_LINKS.map((link) => ({
    href: localeHref(link.href, locale),
    label: t ? t(link.key, link.label) : link.label,
  }));
}

/** مسار داخلي بلغة الزائر — يحافظ على مرساة `#` وعلى الروابط الخارجية كما هي */
export function localeHref(path: string, locale: string = DEFAULT_LOCALE): string {
  if (/^(https?:|mailto:|tel:|#)/.test(path)) return path;
  const [pathname = "/", hash] = path.split("#");
  const prefixed = localePath(locale, pathname || "/");
  return hash ? `${prefixed}#${hash}` : prefixed;
}

/** يبني رابط wa.me من رقم قد يحتوي مسافات أو رموزاً */
export function waHref(whatsapp: string): string {
  return `https://wa.me/${whatsapp.replace(/\D/g, "")}`;
}

/**
 * نيّة مشاركة على واتساب **بلا رقم مستقبِل** — `wa.me/?text=…`.
 *
 * والفرق عن `waHref` أعلاه ليس تجميلياً: ذاك يفتح محادثة مع رقمنا نحن، وهذا يفتح
 * منتقي جهات الاتصال فيختار المُرسِل وجهته بنفسه (نفسه غالباً). ولهذا وحده يصلح
 * لصفحة `/booking/[token]`: نيّة خاصة موجَّهة يملك العميل طرفيها، لا نشر عام
 * يضع رابطاً هو مفتاح حجزه في فهرس (‏`lib/export-types.ts` §٥).
 */
export function waShareHref(text: string): string {
  return `https://wa.me/?text=${encodeURIComponent(text)}`;
}

/** يبني رابط تليجرام من معرف أو رابط كامل */
export function telegramHref(telegram: string): string {
  if (/^https?:\/\//.test(telegram)) return telegram;
  return `https://t.me/${telegram.replace(/^@/, "")}`;
}

/** يبني رابط اتصال هاتفي نظيفاً */
export function telHref(phone: string): string {
  return `tel:${phone.replace(/[^+\d]/g, "")}`;
}

/**
 * وجهة زر «احجز الآن» = صفحة الحجز دائماً (منذ المرحلة ٣: محرك التسعير والحجز
 * يعمل فعلياً، فلا معنى لتحويل العميل إلى واتساب أو إلى قسم التواصل).
 * قنوات التواصل تبقى متاحة كبديل ثانوي: الزر العائم وقسم «تواصل» وأزرار
 * الاستفسار في بطاقات العروض.
 */
export const BOOKING_PATH = "/book";

export function bookingHref(_settings?: SiteSettings, locale: string = DEFAULT_LOCALE): string {
  return localeHref(BOOKING_PATH, locale);
}

/**
 * قناة الاستفسار الثانوية: واتساب إن وُجد، وإلا الهاتف، وإلا قسم التواصل
 * في الصفحة الرئيسية. تُستخدم في الأزرار الثانوية لا في زر الحجز الأساسي.
 */
export function contactHref(settings: SiteSettings, locale: string = DEFAULT_LOCALE): string {
  if (settings.contact.whatsapp) return waHref(settings.contact.whatsapp);
  if (settings.contact.phone) return telHref(settings.contact.phone);
  return localeHref("/#contact", locale);
}

/** خصائص الروابط الخارجية (تُفتح في تبويب جديد) */
export function externalLinkProps(
  href: string
): { target: "_blank"; rel: "noopener noreferrer" } | Record<string, never> {
  return href.startsWith("http")
    ? { target: "_blank", rel: "noopener noreferrer" }
    : {};
}

export type SocialKey = keyof SocialSettings;

export const SOCIAL_LABELS: Record<SocialKey, string> = {
  facebook: "فيسبوك",
  x: "منصة إكس",
  linkedin: "لينكد إن",
  github: "جيت هاب",
  instagram: "إنستغرام",
};

export type SocialEntry = { key: SocialKey; label: string; href: string };

/**
 * حسابات التواصل التي **يُبنى منها رابط مطلق** — بأسماء بلغة الزائر.
 *
 * ⚠ الشرط ليس «غير فارغ» بل «‏`socialHref` أرجعت عنواناً»: القيمة المخزّنة معرّف
 * حساب غالباً (`RentLimousine`)، ووضعُها في `href` كما هي يصنع رابطاً **نسبياً**
 * يتغيّر مقصده بتغيّر الصفحة. الشرح الكامل ولماذا يُرفض ما لا يُطبَّع في
 * `lib/site-config.ts` عند `socialHref` — وهي المصدر الوحيد الذي تناديه هذه
 * الدالة و`sameAs` في البيانات المهيكلة وشاشة فحص السيو معاً.
 */
export function socialEntries(socials: SocialSettings, t?: Tx): SocialEntry[] {
  return (Object.keys(SOCIAL_LABELS) as SocialKey[]).flatMap((key) => {
    const href = socialHref(key, socials[key]);
    if (!href) return [];
    const label = t ? t(key, SOCIAL_LABELS[key]) : SOCIAL_LABELS[key];
    return [{ key, label, href }];
  });
}
