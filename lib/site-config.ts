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

/**
 * لوحة الألوان كاملةً — **سبعة عشر رمزاً، هي كتلة `:root` اللونية في التصميم
 * حرفاً بحرف** (`Tours-02/landing/assets/css/style.css`).
 *
 * ── لماذا اللوحة كلها في القاعدة، ولماذا بقيمها الأصلية ──────────────────────
 *
 * كانت هنا ثلاثة مفاتيح، والباقي **يُشتقّ** منها في `globals.css` بصيغة
 * `oklch(from var(--primary) L C h)`. والاشتقاق أنيق نظرياً وخاطئ عملياً:
 * درجةُ لونِ العلامة كانت تفرض نفسها على **كل** أرضية ونصّ وحدّ في الموقع، فلمّا
 * كان `--primary` أزرق (‏h 250) خرجت أرضيات التصميم الرملية زرقاء، ولم يكن في
 * الطبقة أي مخرج: القيمة تُحقن سطرياً على `<html>` فتسبق `:root` دائماً. أي أن
 * **هوية التصميم كانت تُمحى بلونٍ واحد في صفٍّ واحد**.
 *
 * والقسمة الصحيحة ليست «التصميم يملك السلّم والعلامة تملك الدرجة»، بل:
 *
 *   ┌─ **التصميم يملك القيم** — تُنقل كما هي، بلا اشتقاق ولا إعادة حساب.
 *   └─ **القاعدة تملك المكان** — تُبذَر فيها تلك القيم نفسها، فتُحرَّر من اللوحة.
 *
 * فيجتمع الثلاثة الذي كان يبدو متعارضاً: الموقع يشبه التصميم لأن القيم قيمُه،
 * والمالك يغيّرها من اللوحة لأنها صفٌّ في `site_settings`، ونسخة الـwhite-label
 * تُعاد صبغتها بتبديل الصفّ لا بتفريع الكود (المرحلة ١٤).
 *
 * ⚠ **وما ليس هنا ليس سهواً.** أربعة رموز تبقى **مشتقّة** في `globals.css` لأنها
 * قواعد قراءةٍ لا خيارات هوية: `--primary-on-sand` و`--brand-accent-on-sand`
 * و`--danger-on-sand` و`--danger-on-ink` — درجاتٌ داكنة تفرضها نسبة التباين فوق
 * الأرضية الفاتحة (وحزمة التصميم نفسها تنصّ عليها). ولو صارت مفاتيح لأمكن أن
 * تُضبط على قيمةٍ تسقط دون AA بلا حارس.
 */
export type BrandPalette = {
  /* ── الإشارتان: «فعل» و«معلومة» — أسماء المشروع التاريخية لهما تبقى ──────
     `--amber` في التصميم هو `primary` هنا (زرّ · سعر · تركيز)، و`--nile` هو
     `accent` (شارة · أيقونة). ولا يُعاد تسميتهما: كل مكوّن shadcn في المستودع
     يقرأ `--primary` أصلاً، وإعادة التسمية تعني تعديل ٤٠+ شاشة بلا مقابل. */
  /** `--amber` — لون الفعل. قيمة القاعدة أو hex أو oklch */
  primary: string;
  /** `--amber-ink` — نصّ فوق لون الفعل. داكنٌ لا أبيض: الكهرمان أرضية فاتحة */
  primaryForeground: string;
  /** `--amber-hi` — الدرجة الأفتح: hover وتوهّج وحلقة التركيز على الداكن */
  primaryHi: string;
  /** `--nile` — لون المعلومة */
  accent: string;
  /** `--nile-soft` — أرضية شارةٍ من لون المعلومة فوق الداكن */
  accentSoft: string;

  /* ── الأرضيات الداكنة — أربع رتب ───────────────────────────────────────── */
  ink: string;
  ink1: string;
  ink2: string;
  inkLine: string;

  /* ── الأرضيات الفاتحة — ثلاث رتب ───────────────────────────────────────── */
  sand: string;
  sand2: string;
  sandLine: string;

  /* ── النصوص — رتبتان فوق كل أرضية ──────────────────────────────────────── */
  onInk: string;
  onInkMut: string;
  onSand: string;
  onSandMut: string;

  /**
   * `--danger` — الخطر. مفتاحٌ كالبقية **لكن معناه ليس هوية**: علامةٌ حمراء لا
   * تجعل رسالة الخطأ خضراء. فيبقى على درجة التصميم، ودرجتاه فوق الأرضيتين
   * تُشتقّان منه في `globals.css` بإضاءةٍ مقيسة لا منقولة.
   */
  danger: string;
};

export type BrandSettings = {
  /** اسم العلامة — placeholder حتى يحدد المالك الاسم النهائي */
  name: string;
  tagline: string;
  logoUrl: string | null;
  /** oklch/hex — تُحقن كمتغيرات CSS في الجذر (`app/layout.tsx`) */
  colors: BrandPalette;
};

/**
 * لوحة التصميم الأصلية — **المصدر الواحد** لقيم الألوان في هذا المستودع.
 *
 * تُقرأ من هنا في ثلاثة مواضع ولا رابع: احتياطي `DEFAULT_SETTINGS` أدناه، وكتلة
 * `:root` الثابتة في `app/globals.css` (نفس القيم حرفاً — كي لا تظهر الصفحة بلا
 * تنسيق قبل وصول الإعدادات)، وبذرة الهجرة `0063`. وتغييرُ لونٍ في نسخةٍ أخرى
 * يقع في صفّ `site_settings` لا هنا.
 */
export const DESIGN_PALETTE: BrandPalette = {
  primary: "#D89A3E",
  primaryForeground: "#1A1206",
  primaryHi: "#EDB45B",
  accent: "#2E9184",
  accentSoft: "#1B4A45",
  ink: "#08100F",
  ink1: "#0D1917",
  ink2: "#142522",
  inkLine: "#21322E",
  sand: "#F4F0E7",
  sand2: "#FFFFFF",
  sandLine: "#E0D8C8",
  onInk: "#F3F1EB",
  onInkMut: "#9FB2AC",
  onSand: "#16201D",
  onSandMut: "#55635E",
  danger: "#D64545",
};

/**
 * ترتيب حقن اللوحة في `<html style>` — الرمز في CSS مقابل مفتاحه في الإعدادات.
 *
 * **مصدرٌ واحد لا اثنان**: `app/layout.tsx` يبني منه السمة السطرية، وشاشة
 * `/admin/settings` تبني منه حقول التحرير وإجراءُ الحفظ يبني منه الصفّ. فمفتاحٌ
 * يُضاف هنا يظهر في الثلاثة معاً — ولا يبقى مفتاحٌ يُحرَّر ولا يُحقن، ولا مفتاحٌ
 * يُحقن ولا يُحفظ (وهو بالضبط الفخّ الذي أطاح بمفتاح `seo` مرة).
 */
/**
 * ترتيب حقن اللوحة في `<html style>` — الرمز في CSS مقابل مفتاحه في الإعدادات.
 *
 * **مصدرٌ واحد لا اثنان**: `app/layout.tsx` يبني منه السمة السطرية، وشاشة
 * `/admin/settings` تبني منه حقول التحرير وإجراءُ الحفظ يبني منه الصفّ. فمفتاحٌ
 * يُضاف هنا يظهر في الثلاثة معاً — ولا يبقى مفتاحٌ يُحرَّر ولا يُحقن، ولا مفتاحٌ
 * يُحقن ولا يُحفظ (وهو بالضبط الفخّ الذي أطاح بمفتاح `seo` مرة).
 */
export const PALETTE_CSS_VARS: ReadonlyArray<readonly [keyof BrandPalette, string]> = [
  ["primary", "--primary"],
  ["primaryForeground", "--primary-foreground"],
  ["primaryHi", "--primary-hi"],
  ["accent", "--brand-accent"],
  ["accentSoft", "--brand-accent-soft"],
  ["ink", "--ink"],
  ["ink1", "--ink-1"],
  ["ink2", "--ink-2"],
  ["inkLine", "--ink-line"],
  ["sand", "--sand"],
  ["sand2", "--sand-2"],
  ["sandLine", "--sand-line"],
  ["onInk", "--on-ink"],
  ["onInkMut", "--on-ink-mut"],
  ["onSand", "--on-sand"],
  ["onSandMut", "--on-sand-mut"],
  ["danger", "--danger"],
] as const;

/**
 * ما يصلح **قيمةَ لون** — وهو حارسٌ أمني لا تجميل.
 *
 * القيم تُحقن سمةً سطرية على `<html>`، و`site_settings` صفٌّ يُكتب من اللوحة ومن
 * PostgREST معاً. فقيمةٌ مثل `red;display:none` كانت ستطفئ الصفحة كلها لكل زائر
 * بضربة صفٍّ واحد. والمسموح: خانات ست عشرية ودوالّ الألوان (`oklch` · `rgb` ·
 * `color-mix` …) وأسماء CSS — أي حروف وأرقام و`#%.,()/+-` ومسافات، لا أكثر.
 * فالفاصلة المنقوطة والقوس المعقوف والاقتباس خارج المجموعة أصلاً.
 */
const COLOR_VALUE = /^[A-Za-z0-9#%.,()/+\- ]{1,72}$/;

/** القيمة إن كانت لوناً صالحاً، وإلا `null` فيسقط الرمز إلى قيمة `:root` */
export function safeColorValue(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!COLOR_VALUE.test(trimmed)) return null;
  // `url(` الوحيدة التي تمرّ من المجموعة أعلاه وتجلب طلباً خارجياً — تُمنع صراحةً
  if (/url\s*\(/i.test(trimmed)) return null;
  return trimmed;
}

/**
 * اللوحة سمةً سطرية جاهزة — يستدعيها `app/layout.tsx` وحده.
 *
 * الرمز الذي تسقط قيمته (غائبة أو مرفوضة) **لا يُكتب أصلاً**، فيرثه المتصفح من
 * `:root` في `globals.css` — وهي نفس قيم التصميم. أي أن أسوأ حالة هي «الموقع
 * يظهر بالتصميم الأصلي»، لا «الموقع بلا ألوان».
 */
export function paletteVars(colors: Partial<BrandPalette> | null | undefined): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [key, cssVar] of PALETTE_CSS_VARS) {
    const value = safeColorValue(colors?.[key]);
    if (value !== null) out[cssVar] = value;
  }
  return out;
}

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

/**
 * ماركة مركبة واحدة في شريط الماركات — مفتاح `fleetBrands` في `site_settings`.
 *
 * ── لماذا هنا لا داخل الكتلة (قرار بدر ٤) ───────────────────────────────────
 * الشعارات **بيانات نظام** كفئات الأسطول تماماً، لا نصٌّ في قسم.
 *
 * 🔴 **وتصحيحٌ على المبرر — 2026-08-16 (م‑٧):** كان مكتوباً أن السبب بنيوي —
 * «`src` داخل عنصر قائمة شكلٌ لم يُقنَّن في عقد المنشئ، وتوسيعُه بابٌ يُفتح لكل
 * كتلة لاحقة». **والباب فُتح بأمر بدر** («التحكم في كل شيء من لوحة التحكم بما
 * فيها الصور والأيكونات»)، والشكل مقنَّنٌ في `lib/item-fields-types.ts`
 * والهجرة `0065`. فالسبب الباقي **نطاقٌ لا بنية**: قائمةٌ واحدة تخدم كل صفحةٍ
 * تحمل الشريط، ووضعُها في `items` يجعل ماركةً تُضاف في صفحةٍ وتغيب في أخرى.
 *
 * ⚠ **وشرط استعمالها المكتوب في الاتفاق §٤:** وصفٌ للمركبات لا ادّعاء شراكة —
 * فلا يقول نصُّ الكتلة «شركاؤنا» ولا «معتمدون من».
 */
export type FleetBrand = {
  /** معرّف ثابت — مفتاح React ولا يُعرض */
  slug: string;
  /** اسم الماركة كما يُقرأ — يصير النصّ البديل للشعار */
  name: string;
  /** مسار الشعار. `null` ⇒ يُعرض الاسم نصّاً بدل أن تختفي الماركة */
  logoUrl: string | null;
};

export type SiteSettings = {
  brand: BrandSettings;
  contact: ContactSettings;
  socials: SocialSettings;
  company: CompanyInfo;
  /**
   * ماركات الأسطول — تقرؤها كتلة `logo-strip` وحدها. قائمةٌ فارغة تُخفي
   * الشريط كله بدل أن تعرض إطاراً بلا شعار (تمييز «صفر» عن «غير مضبوط»،
   * القاعدة الذهبية ١٥).
   */
  fleetBrands: FleetBrand[];
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

/**
 * فئة سيارة كما تعرضها الواجهة العامة.
 *
 * 🔴 **و`slug` صار `string` في م‑٧ ولم يعد اتحاداً من أربعة** — والسبب أن
 * المصدر تغيّر: `getLocalizedVehicleClasses` تقرأ اليوم **جدول
 * `vehicle_classes`** لا هذا الثابت، و`/admin/fleet` يسمح بإنشاء فئة خامسة
 * بأي slug. فاتحادٌ من أربعة كان سيجعل الفئة التي ينشئها المالك **خطأ نوعٍ**
 * لا بياناتٍ جديدة. والقائمة أدناه تبقى **احتياطياً** لا مصدراً.
 */
export type VehicleClassDef = {
  slug: string;
  title: string;
  seats: string;
  short: string;
  /**
   * صورة الفئة — العمود `vehicle_classes.image_url` (قائمٌ منذ `0005`، ومُلئ
   * في `0065`). `null`/الغياب ⇒ بطاقةٌ بأيقونة كما كانت، لا إطارٌ مكسور.
   */
  imageUrl?: string | null;
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

/**
 * فئات السيارات الأربع — **احتياطيٌّ لا مصدر** منذ م‑٧.
 *
 * المصدر الحيّ جدول `vehicle_classes` (سعةٌ وحقائبُ وصورةٌ وترتيب)، وهذه
 * القائمة تظهر حين تتعذّر القراءة وحدها — فالصفحة تبقى معروضة ولا تصير فارغة.
 * ⚠ ولا يُحرَّر هنا شيء: من أراد تغيير فئة يفتح `/admin/fleet`.
 */
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
    // الاحتياطي هو لوحة التصميم نفسها — فالموقع بلا قاعدة يظهر بهويته لا بأزرق قالب
    colors: DESIGN_PALETTE,
  },
  contact: { phone: null, whatsapp: null, telegram: null, email: null },
  socials: { facebook: null, x: null, linkedin: null, github: null, instagram: null },
  company: { legalName: null, activity: "خدمات النقل السياحي داخل جمهورية مصر العربية" },
  /**
   * احتياطيٌّ لا مصدر — كالقيم كلها في هذا الملف. المصدر الحيّ صفُّ
   * `fleetBrands` في `site_settings` (بذَرَته الهجرة `0061`)، ومن أراد ماركة
   * أخرى بدّل الصفَّ لا هذا السطر.
   */
  fleetBrands: [
    { slug: "mercedes", name: "مرسيدس", logoUrl: "/brands/mercedes.svg" },
    { slug: "toyota", name: "تويوتا", logoUrl: "/brands/toyota.svg" },
    { slug: "bmw", name: "بي إم دبليو", logoUrl: "/brands/bmw.svg" },
    { slug: "hyundai", name: "هيونداي", logoUrl: "/brands/hyundai.svg" },
    { slug: "nissan", name: "نيسان", logoUrl: "/brands/nissan.svg" },
    { slug: "kia", name: "كيا", logoUrl: "/brands/kia.svg" },
    { slug: "mg", name: "إم جي", logoUrl: "/brands/mg.svg" },
    { slug: "jetour", name: "جيتور", logoUrl: "/brands/jetour.svg" },
    { slug: "byd", name: "بي واي دي", logoUrl: "/brands/byd.svg" },
    { slug: "honda", name: "هوندا", logoUrl: "/brands/honda.svg" },
  ],
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
