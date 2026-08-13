/**
 * العقد المركزي لإعدادات الموقع — انضباط الـ Whitelabel:
 * كل قيمة خاصة بالعلامة التجارية تمر من هنا، ولا يُكتب اسم أو لون أو رقم تواصل
 * مباشرة داخل أي مكوّن. المصدر النهائي هو جدول `site_settings` في قاعدة البيانات،
 * وهذه القيم الافتراضية هي fallback حتى تُربط قاعدة البيانات (وتبقى fallback بعدها).
 */

import { DEFAULT_PAYMENT_SETTINGS, type PaymentSettings } from "@/lib/booking-types";

export type BrandSettings = {
  /** اسم العلامة — placeholder حتى يحدد المالك الاسم النهائي */
  name: string;
  tagline: string;
  logoUrl: string | null;
  colors: {
    /** oklch/hex — تُحقن كمتغيرات CSS في الجذر */
    primary: string;
    primaryForeground: string;
    accent: string;
  };
};

export type ContactSettings = {
  phone: string | null;
  whatsapp: string | null;
  telegram: string | null;
  email: string | null;
};

export type SocialSettings = {
  facebook: string | null;
  x: string | null;
  linkedin: string | null;
  github: string | null;
  instagram: string | null;
};

export type CompanyInfo = {
  legalName: string | null;
  activity: string;
};

/**
 * إعدادات الإشعارات — مفتاح "notifications" في `site_settings` (المرحلة ٤).
 * الوجهات فقط تُدار من اللوحة؛ أما المفاتيح السرّية (توكن بوت تليجرام ومفتاح
 * مزوّد البريد) فمكانها متغيرات البيئة ولا تُخزَّن في قاعدة البيانات أبداً.
 * القناة تُرسل فعلياً حين تجتمع ثلاثة شروط: مفعّلة + وجهة مضبوطة + بيانات اعتماد
 * في البيئة — وإلا سُجّل الإشعار «متجاوَز» بسبب واضح في شاشة الإشعارات.
 */
export type NotificationSettings = {
  /** معرّف محادثة أو مجموعة تليجرام التي تستقبل تنبيهات التشغيل (قد يبدأ بسالب للمجموعات) */
  telegramChatId: string | null;
  telegramEnabled: boolean;
  /** بريد فريق التشغيل الذي يستقبل التنبيهات */
  emailTo: string | null;
  emailEnabled: boolean;
};

export type SiteSettings = {
  brand: BrandSettings;
  contact: ContactSettings;
  socials: SocialSettings;
  company: CompanyInfo;
  seo: {
    titleTemplate: string;
    defaultDescription: string;
  };
  /** إعدادات الإشعارات — يقرأها عامل الإرسال وشاشة الإشعارات */
  notifications: NotificationSettings;
  /** إعدادات الدفع المحلي — النوع من عقد lib/booking-types.ts (مصدر واحد لا نسخة) */
  payment: PaymentSettings;
};

export type ServiceDef = {
  slug: string;
  title: string;
  short: string;
  icon: "plane" | "building" | "route" | "landmark" | "party" | "mic";
};

export type VehicleClassDef = {
  slug: "sedan" | "suv" | "minibus" | "bus";
  title: string;
  seats: string;
  short: string;
};

/** الخدمات الست — من VISION.md (تصبح بيانات من قاعدة البيانات في المرحلة ٢) */
export const SERVICES: ServiceDef[] = [
  { slug: "airport-transfer", title: "استقبال المطارات", short: "استقبال وتوصيل من وإلى جميع مطارات مصر على مدار الساعة.", icon: "plane" },
  { slug: "city-rides", title: "التنقل داخل المدينة", short: "تنقلات مريحة داخل مدينتك بسائقين محترفين.", icon: "building" },
  { slug: "intercity-travel", title: "السفر عبر المدن", short: "رحلات بين المحافظات بسيارات حديثة وأسعار واضحة.", icon: "route" },
  { slug: "tours", title: "الجولات السياحية", short: "جولات لأشهر المزارات بسيارة خاصة وسائق يعرف الطريق.", icon: "landmark" },
  { slug: "events", title: "المناسبات الخاصة", short: "تحركات منظمة لمناسباتك الخاصة بمواعيد دقيقة.", icon: "party" },
  { slug: "conferences", title: "الحفلات والمؤتمرات", short: "أساطيل منسقة للحفلات والمؤتمرات والوفود.", icon: "mic" },
];

/** فئات السيارات الأربع — من VISION.md (آلية تحديد السيارات) */
export const VEHICLE_CLASSES: VehicleClassDef[] = [
  { slug: "sedan", title: "سيدان", seats: "حتى ٣ ركاب", short: "خيار اقتصادي أنيق للأفراد والرحلات الخفيفة." },
  { slug: "suv", title: "SUV", seats: "حتى ٦ ركاب", short: "مساحة وراحة أعلى للعائلات والحقائب." },
  { slug: "minibus", title: "ميني باص", seats: "٧–١٤ راكباً", short: "مثالي للمجموعات المتوسطة والرحلات المشتركة." },
  { slug: "bus", title: "باص", seats: "١٥+ راكباً", short: "للمجموعات الكبيرة والمؤتمرات والأفواج." },
];

export const DEFAULT_SETTINGS: SiteSettings = {
  brand: {
    name: "منصة النقل السياحي", // placeholder — بانتظار اسم العلامة من المالك
    tagline: "خدمات نقل سياحي موثوقة في جميع أنحاء مصر",
    logoUrl: null,
    colors: {
      primary: "oklch(0.45 0.15 250)",
      primaryForeground: "oklch(0.985 0 0)",
      accent: "oklch(0.75 0.15 85)",
    },
  },
  contact: { phone: null, whatsapp: null, telegram: null, email: null },
  socials: { facebook: null, x: null, linkedin: null, github: null, instagram: null },
  company: { legalName: null, activity: "خدمات النقل السياحي داخل جمهورية مصر العربية" },
  seo: {
    titleTemplate: "%s | منصة النقل السياحي",
    defaultDescription:
      "احجز سيارتك بسائق في ثوانٍ — استقبال مطارات، تنقلات داخل المدينة وبين المحافظات، جولات سياحية ومناسبات. أسعار واضحة وسيارات حديثة.",
  },
  // القناتان مفعّلتان مبدئياً حتى تعمل التنبيهات لحظة إدخال الوجهة وبيانات الاعتماد
  // بلا خطوة إضافية؛ والإطفاء متاح من تبويب الإشعارات في شاشة الإعدادات.
  notifications: {
    telegramChatId: null,
    telegramEnabled: true,
    emailTo: null,
    emailEnabled: true,
  },
  payment: DEFAULT_PAYMENT_SETTINGS,
};
