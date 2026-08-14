/**
 * العقد المركزي لإعدادات الموقع — انضباط الـ Whitelabel:
 * كل قيمة خاصة بالعلامة التجارية تمر من هنا، ولا يُكتب اسم أو لون أو رقم تواصل
 * مباشرة داخل أي مكوّن. المصدر النهائي هو جدول `site_settings` في قاعدة البيانات،
 * وهذه القيم الافتراضية هي fallback حتى تُربط قاعدة البيانات (وتبقى fallback بعدها).
 */

import { DEFAULT_INTEGRATIONS, type IntegrationsSettings } from "@/lib/analytics-types";
import { DEFAULT_PAYMENT_SETTINGS, type PaymentSettings } from "@/lib/booking-types";
import {
  DEFAULT_BUSINESS,
  DEFAULT_ROBOTS,
  type BusinessInfo,
  type SeoSettings,
} from "@/lib/seo-types";

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

/* -------------------------------------------------------------------------- */
/* حسابات التواصل: من معرّف مجرّد إلى رابط مطلق — مصدرٌ واحد لكل مستهلك         */
/* -------------------------------------------------------------------------- */

/**
 * قواعد عناوين الشبكات. والمالك يكتب في اللوحة ما يعرفه عن حسابه — واسم الحساب
 * (`RentLimousine`) هو ما يعرفه الناس، لا العنوان الكامل. فالتطبيع هنا لا في
 * ذهن المالك.
 *
 * ⚠ **ولينكد إن وحدها ملتبسة**: `/in/` للأشخاص و`/company/` للشركات، والمعرّف
 * المجرّد لا يفصح أيهما. وهذه الإعدادات إعدادات **نشاط تجاري** لا شخص، فالمجرّد
 * يُحمل على `/company/`؛ ومن أراد حساباً شخصياً يلصق العنوان الكامل فيُقبل كما
 * هو (انظر القاعدة الأولى في `socialHref`).
 */
export const SOCIAL_BASE_URLS: Record<keyof SocialSettings, string> = {
  facebook: "https://www.facebook.com/",
  x: "https://x.com/",
  linkedin: "https://www.linkedin.com/company/",
  github: "https://github.com/",
  instagram: "https://www.instagram.com/",
};

/** ما يصلح معرّف حساب: حروف وأرقام ونقطة وشرطتان — بلا مسافة ولا شرطة مائلة */
const SOCIAL_HANDLE = /^[A-Za-z0-9._-]+$/;

/** مضيفٌ مكتوبٌ بلا بروتوكول: `facebook.com/x` أو `www.instagram.com/x` */
const HOST_WITHOUT_SCHEME = /^(www\.)?[a-z0-9-]+(\.[a-z0-9-]+)+\//i;

/**
 * رابط الحساب مطلقاً، أو `null` إن تعذّر بناؤه.
 *
 * ── لماذا هذه الدالة موجودة أصلاً ───────────────────────────────────────────
 *
 * كانت القيمة تذهب إلى `href` **كما هي**. والقاعدة الحية تحمل `RentLimousine`
 * في الحقول الخمسة، فيصير `href="RentLimousine"` رابطاً **نسبياً**: من الرئيسية
 * يقصد `/RentLimousine`، ومن `/services/vip` يقصد `/services/RentLimousine`،
 * ومن `/en/book` يقصد `/en/RentLimousine`. أي أن التذييل — وهو في **كل** صفحة —
 * كان يولّد خمسة روابط مكسورة لكل مسار في الموقع. وهذا ليس رابطاً مكسوراً
 * واحداً بل **مصيدة زحف**: الزاحف يتبعها فيجد 404 تتكاثر بعدد الصفحات، في منتج
 * كل عملائه يأتون من البحث. وزاد الطين أن `externalLinkProps` تفتح تبويباً
 * جديداً للروابط المطلقة وحدها، فكان الزائر **يغادر الموقع** إلى صفحة خطأ.
 *
 * ── والقواعد بترتيبها ───────────────────────────────────────────────────────
 *
 * 1. **عنوان مطلق يُقبل كما هو** — من لصق رابط ملفه الشخصي فهو أدرى بحسابه،
 *    ولا نعيد بناء ما كتبه صحيحاً (وهو المخرج الوحيد من التباس لينكد إن).
 * 2. **مضيفٌ بلا بروتوكول يُكمَّل** — `facebook.com/x` نيّة واضحة، ورفضها تعنّت.
 * 3. **ما يبدأ بشرطة مائلة يُرفض** — مسارٌ داخلي ليس حساباً، وقبوله يعيد العيب.
 * 4. **المعرّف المجرّد يُركَّب على قاعدة شبكته** — وتُحذف `@` البادئة.
 * 5. **وما عدا ذلك يُرفض** — قيمةٌ بمسافات أو رموز لا يُبنى منها عنوانٌ سليم،
 *    و**رابطٌ خاطئ أسوأ من غياب رابط**: الغياب يُخفي أيقونة، والخطأ يُخرج الزائر
 *    من الموقع ويعلن لجوجل هويةً لا يصل إليها.
 */
export function socialHref(key: keyof SocialSettings, value: string | null): string | null {
  const raw = (value ?? "").trim();
  if (raw === "") return null;
  if (/^https?:\/\//i.test(raw)) return raw;
  if (HOST_WITHOUT_SCHEME.test(raw)) return `https://${raw}`;
  if (raw.startsWith("/")) return null;

  const handle = raw.replace(/^@/, "");
  if (!SOCIAL_HANDLE.test(handle)) return null;
  return `${SOCIAL_BASE_URLS[key]}${handle}`;
}

/**
 * روابط الحسابات كلها مطلقةً — للاستهلاك الذي لا يحتاج المفتاح (‏`sameAs` في
 * البيانات المهيكلة، وشاشة فحص السيو). والترتيب ترتيب `SOCIAL_BASE_URLS`.
 */
export function socialHrefs(socials: SocialSettings): string[] {
  return (Object.keys(SOCIAL_BASE_URLS) as (keyof SocialSettings)[]).flatMap((key) => {
    const href = socialHref(key, socials[key]);
    return href ? [href] : [];
  });
}


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
  /**
   * إعدادات السيو الكاملة — النوع من عقد lib/seo-types.ts (مصدر واحد لا نسخة،
   * تماماً كـ PaymentSettings وIntegrationsSettings).
   *
   * كان هذا المفتاح حقلين لا ثالث لهما — قالب العنوان والوصف الافتراضي — وكل ما
   * عداه محفوراً في الكود: قاعدة `robots.txt` واحدة صمّاء، وصورة مشاركة ملفاً
   * ثابتاً، ونوع بطاقة إكس مكتوباً حرفياً، ولا سبيل لإطفاء الفهرسة. وتوسيعه بلا
   * هجرة لأن `site_settings.value` عمود `jsonb`: مفتاحٌ غائب في صفٍّ قديم يُقرأ
   * «غير مضبوط» فيسقط إلى الافتراضي الآمن في `DEFAULT_SETTINGS` أدناه.
   */
  seo: SeoSettings;
  /**
   * بطاقة النشاط (LocalBusiness) — مفتاح جديد في `site_settings`، وهو أعلى عائد
   * سيو في منتج نقل **محلي**: العنوان والإحداثيات وساعات العمل ونطاق السعر هي
   * إشارات الترتيب المحلي التي لم يكن المخطط يُخرج منها شيئاً.
   *
   * كل حقوله `null` ابتداءً بقرار العقد ولا يُخترع له افتراضي: بطاقة تعلن
   * عنواناً غير صحيح أسوأ من بطاقة بلا عنوان.
   */
  business: BusinessInfo;
  /** إعدادات الإشعارات — يقرأها عامل الإرسال وشاشة الإشعارات */
  notifications: NotificationSettings;
  /** إعدادات الدفع المحلي — النوع من عقد lib/booking-types.ts (مصدر واحد لا نسخة) */
  payment: PaymentSettings;
  /**
   * معرّفات خدمات القياس السبع — النوع من عقد lib/analytics-types.ts
   * (مصدر واحد لا نسخة، تماماً كـ PaymentSettings).
   *
   * القرار ١ في المرحلة ١٠: المعرّفات في القاعدة لا في متغيّرات البيئة، لأن
   * نسخة الـ whitelabel الثانية لها معرّفاتها — ولو عاشت في البيئة لصار كل
   * إطلاق علامة جديدة نشراً جديداً. أما الأسرار (توكن Meta CAPI) فتبقى في
   * البيئة: جدول `site_settings` مقروء علناً بسياسة `site_settings_select_public`.
   */
  integrations: IntegrationsSettings;
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
  /**
   * الافتراضي هنا مُعايَر على قاعدة واحدة: **قيمةٌ غير مضبوطة تُخرج نفس ما كان
   * الكود يخرجه حرفياً قبل هذه التوسعة.** بالترتيب:
   *   • `ogImageUrl: null` ⇒ تبقى أولوية الشعار ثم الملف المرفق كما كانت.
   *   • `twitterSite: null` ⇒ لا يخرج `twitter:site` أصلاً (لا وسم فارغ).
   *   • `twitterCard` ⇒ نفس القيمة التي كانت مكتوبة حرفياً في `lib/seo.ts`.
   *   • `robots` ⇒ مفهرَس، بلا منع إضافي، وبلا حجب زواحف — أي `robots.txt`
   *     الحالي نفسه. وموقعٌ محجوب صامتاً عن جوجل عطبٌ لا يُلاحَظ لأسابيع.
   */
  seo: {
    titleTemplate: "%s | منصة النقل السياحي",
    defaultDescription:
      "احجز سيارتك بسائق في ثوانٍ — استقبال مطارات، تنقلات داخل المدينة وبين المحافظات، جولات سياحية ومناسبات. أسعار واضحة وسيارات حديثة.",
    ogImageUrl: null,
    twitterSite: null,
    twitterCard: "summary_large_image",
    robots: DEFAULT_ROBOTS,
  },
  // بطاقة نشاط فارغة بالكامل — لا يخرج منها حقل واحد حتى يكتبه المالك
  business: DEFAULT_BUSINESS,
  // القناتان مفعّلتان مبدئياً حتى تعمل التنبيهات لحظة إدخال الوجهة وبيانات الاعتماد
  // بلا خطوة إضافية؛ والإطفاء متاح من تبويب الإشعارات في شاشة الإعدادات.
  notifications: {
    telegramChatId: null,
    telegramEnabled: true,
    emailTo: null,
    emailEnabled: true,
  },
  payment: DEFAULT_PAYMENT_SETTINGS,
  // الافتراضي الآمن: كل خدمة مطفأة وبلا معرّف ⇒ صفر سكربت خارجي على موقع
  // منشور حتى يقرر المالك صراحةً من `/admin/integrations` (درس «الافتراضي
  // الخطر» في handover/LESSONS.md — بوابة الدفع التجريبية بُذرت مفعّلة مرة).
  integrations: DEFAULT_INTEGRATIONS,
};
