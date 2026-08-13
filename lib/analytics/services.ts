/**
 * فهرس خدمات القياس السبع — المرجع الوحيد لكل ما يخص «هل نحقن وسماً أم لا».
 *
 * العقد الحاكم: `lib/analytics-types.ts` (لا يُعدَّل). هذا الملف لا يضيف خدمة
 * ولا يغيّر اسم مفتاح — يصف كل مفتاح موجود في `IntegrationKey` فقط: ماذا يفعل،
 * ومن أين يجلب المالك معرّفه، وما الصيغة المقبولة له، وكيف يُطبَّع النص الملصوق.
 *
 * ── لماذا التحقق من الصيغة يعيش هنا لا في الشاشة ────────────────────────────
 * لأن له مستهلكَين لا واحداً:
 *   (١) `saveIntegrations` ترفض المعرّف الخاطئ برسالة عربية قبل الحفظ.
 *   (٢) `AnalyticsTags` **تُعيد** التحقق قبل الحقن — فصف عُدِّل بيد في القاعدة
 *       (أو استُورد من نسخة whitelabel أخرى) لا يحقن نصاً عشوائياً في الصفحة.
 * الأمان بنيوي لا انضباطي: كل صيغة مقبولة هنا محصورة في حروف وأرقام وشرطات،
 * فلا علامة اقتباس ولا `<` تصل إلى سكربت سطري أصلاً.
 *
 * ⚠ لا سرّ في هذا الملف ولا في مفتاح `integrations` بالقاعدة: جدول
 * `site_settings` **مقروء علناً** بسياسة `site_settings_select_public`. المعرّفات
 * أعلاه كلها عامة بطبعها (تظهر في مصدر أي صفحة)، أما توكن Meta CAPI فمكانه
 * متغيّر البيئة `META_CAPI_ACCESS_TOKEN` وحده — راجع `lib/analytics/meta-capi.ts`.
 */

import {
  DEFAULT_INTEGRATIONS,
  type IntegrationConfig,
  type IntegrationKey,
  type IntegrationsSettings,
} from "@/lib/analytics-types";

/** أين يعمل الوسم: في المتصفح، أو وسم تحقق في الترويسة، أو نداء خادمي */
export type IntegrationChannel = "browser" | "verification" | "server";

export type IntegrationService = {
  key: IntegrationKey;
  /** الاسم العربي في الشاشة */
  label: string;
  /** الاسم كما يظهر في لوحة المزوّد نفسه — يُعرض بـ dir="ltr" */
  latinLabel: string;
  channel: IntegrationChannel;
  /** ماذا يحدث فعلاً حين يكون «مضبوطاً ومفعّلاً» — بلا وعود زائدة */
  effect: string;
  /** من أين يجلب المالك المعرّف، خطوة بخطوة */
  where: string;
  /** مثال شكلي للحقل — لا معرّف حقيقي */
  placeholder: string;
  /** وصف الصيغة المقبولة بالعربية، يظهر في رسالة الرفض وفي التلميح */
  shape: string;
  /** 🔒 الصيغة المقبولة — حروف وأرقام وشرطات فقط في كل الحالات */
  pattern: RegExp;
};

/**
 * ترتيب العرض مقصود: أدوات جوجل الثلاث معاً (وGTM بعد GA4 لأن أحدهما يغني عن
 * الآخر عادةً)، ثم أداتا ميتا (متصفح ثم خادم)، ثم أداتا مايكروسوفت.
 */
export const INTEGRATION_SERVICES: IntegrationService[] = [
  {
    key: "ga4",
    label: "إحصاءات جوجل",
    latinLabel: "Google Analytics 4",
    channel: "browser",
    effect: "يُحمَّل سكربت gtag.js في كل صفحة ويُسجَّل مشاهدات الصفحات.",
    where:
      "analytics.google.com ← الإدارة (Admin) ← تدفقات البيانات (Data Streams) ← اختر تدفق الويب ← «معرّف القياس» (Measurement ID) أعلى اليمين.",
    placeholder: "G-XXXXXXXXXX",
    shape: "يبدأ بـ G- ثم حروف وأرقام (مثال الشكل: G-XXXXXXXXXX)",
    pattern: /^G-[A-Z0-9]{4,20}$/,
  },
  {
    key: "gtm",
    label: "مدير وسوم جوجل",
    latinLabel: "Google Tag Manager",
    channel: "browser",
    effect: "يُحمَّل حاوية الوسوم، فتتحكم أنت من لوحة GTM بما يُطلق بعد ذلك.",
    where:
      "tagmanager.google.com ← اختر الحاوية ← معرّف الحاوية ظاهر بجوار اسمها في الشريط العلوي.",
    placeholder: "GTM-XXXXXXX",
    shape: "يبدأ بـ GTM- ثم حروف وأرقام (مثال الشكل: GTM-XXXXXXX)",
    pattern: /^GTM-[A-Z0-9]{4,20}$/,
  },
  {
    key: "gsc",
    label: "أدوات مشرفي المواقع من جوجل",
    latinLabel: "Google Search Console",
    channel: "verification",
    effect:
      "يُضاف وسم <meta name=\"google-site-verification\"> إلى ترويسة كل صفحة — لإثبات ملكية الموقع فقط، ولا يقيس شيئاً.",
    where:
      "search.google.com/search-console ← أضف موقعاً (بادئة عنوان URL) ← طريقة التحقق «وسم HTML» ← انسخ قيمة content (أو الصق الوسم كاملاً هنا وسنستخرجها).",
    placeholder: "الصق وسم HTML كاملاً أو قيمة content وحدها",
    shape: "نص التحقق: حروف وأرقام و‎_‎ و‎-‎ بطول ٢٠ حرفاً فأكثر",
    pattern: /^[A-Za-z0-9_-]{20,100}$/,
  },
  {
    key: "metaPixel",
    label: "بكسل ميتا",
    latinLabel: "Meta Pixel",
    channel: "browser",
    effect: "يُحمَّل سكربت fbevents.js ويُطلق حدث PageView من متصفح الزائر.",
    where:
      "business.facebook.com ← مدير الأحداث (Events Manager) ← مصادر البيانات ← اختر البكسل ← معرّف البكسل رقم أسفل اسمه مباشرة.",
    placeholder: "١٥ رقماً تقريباً",
    shape: "أرقام فقط (١٠ إلى ٢٠ رقماً)",
    pattern: /^[0-9]{10,20}$/,
  },
  {
    key: "metaCapi",
    label: "واجهة التحويلات من ميتا (خادمية)",
    latinLabel: "Meta Conversions API",
    channel: "server",
    effect:
      "يُرسل حدث الشراء من خادمنا مباشرة إلى ميتا عند تأكيد التحصيل — فلا يُسقطه مانع الإعلانات. يحتاج التوكن السرّي في البيئة أيضاً.",
    where:
      "نفس معرّف البكسل أعلاه (مدير الأحداث ← مصادر البيانات). اتركه فارغاً ليُستعمل معرّف البكسل نفسه تلقائياً. أما التوكن فمن: مدير الأحداث ← الإعدادات ← «إنشاء رمز وصول» — ومكانه ملف البيئة لا هذه الشاشة.",
    placeholder: "اتركه فارغاً ليستعمل معرّف البكسل",
    shape: "أرقام فقط (١٠ إلى ٢٠ رقماً)",
    pattern: /^[0-9]{10,20}$/,
  },
  {
    key: "clarity",
    label: "مايكروسوفت كلاريتي",
    latinLabel: "Microsoft Clarity",
    channel: "browser",
    effect: "يُحمَّل سكربت كلاريتي لتسجيل الجلسات وخرائط الحرارة.",
    where:
      "clarity.microsoft.com ← اختر المشروع ← الإعدادات (Settings) ← «إعداد Clarity» ← معرّف المشروع (Project ID) في السكربت بعد ‎/tag/‎.",
    placeholder: "abcd1234ef",
    shape: "حروف صغيرة وأرقام (٥ إلى ٢٠ خانة)",
    pattern: /^[a-z0-9]{5,20}$/,
  },
  {
    key: "bing",
    label: "أدوات مشرفي المواقع من بينج",
    latinLabel: "Bing Webmaster Tools",
    channel: "verification",
    effect:
      'يُضاف وسم <meta name="msvalidate.01"> إلى ترويسة كل صفحة — لإثبات الملكية فقط، ولا يقيس شيئاً.',
    where:
      "bing.com/webmasters ← أضف موقعاً ← طريقة التحقق «وسم HTML Meta» ← انسخ قيمة content (أو الصق الوسم كاملاً هنا).",
    placeholder: "الصق وسم HTML كاملاً أو قيمة content وحدها",
    shape: "حروف وأرقام (١٦ إلى ٦٤ خانة)",
    pattern: /^[A-Za-z0-9]{16,64}$/,
  },
];

const SERVICE_BY_KEY: Record<IntegrationKey, IntegrationService> = INTEGRATION_SERVICES.reduce(
  (acc, service) => {
    acc[service.key] = service;
    return acc;
  },
  {} as Record<IntegrationKey, IntegrationService>
);

export function integrationService(key: IntegrationKey): IntegrationService {
  return SERVICE_BY_KEY[key];
}

/* ────────────────────────────────────────────────────────────────────────────
 * (١) تطبيع النص الملصوق
 * ──────────────────────────────────────────────────────────────────────────── */

const ARABIC_INDIC = "٠١٢٣٤٥٦٧٨٩";
const EXTENDED_INDIC = "۰۱۲۳۴۵۶۷۸۹";

/** الأرقام العربية الهندية تصل من لوحة مفاتيح المستخدم العربي (اتفاقية §١) */
function toLatinDigits(value: string): string {
  return value.replace(/[٠-٩۰-۹]/g, (d) => {
    const i = ARABIC_INDIC.indexOf(d);
    return String(i >= 0 ? i : EXTENDED_INDIC.indexOf(d));
  });
}

/**
 * يستخرج المعرّف من كل ما قد يلصقه المالك: قيمة مجرّدة، أو وسم HTML كامل، أو
 * السكربت كاملاً كما تعطيه لوحة المزوّد. الهدف عملي بحت: أكثر أسباب «الوسم لا
 * يعمل» شيوعاً هو لصق السكربت كله في خانة المعرّف.
 */
export function normalizeIntegrationId(key: IntegrationKey, raw: string): string {
  let value = toLatinDigits(String(raw ?? "")).trim();
  if (value === "") return "";

  // (أ) وسم <meta ... content="..."> — يخص GSC وBing، ويصح لغيرهما بلا ضرر
  const metaContent = value.match(/content\s*=\s*["']([^"']+)["']/i);
  if (metaContent && metaContent[1]) value = metaContent[1].trim();

  // (ب) سكربت المزوّد كاملاً — نلتقط المعرّف بنمطه الخاص بكل خدمة
  if (key === "ga4" || key === "gtm") {
    const inline = value.match(key === "ga4" ? /\bG-[A-Za-z0-9]{4,20}\b/ : /\bGTM-[A-Za-z0-9]{4,20}\b/);
    if (inline) value = inline[0];
  } else if (key === "clarity") {
    const inline = value.match(/clarity\.ms\/tag\/([A-Za-z0-9]+)/i);
    if (inline && inline[1]) value = inline[1];
  } else if (key === "metaPixel" || key === "metaCapi") {
    const inline = value.match(/fbq\(\s*['"]init['"]\s*,\s*['"]([0-9]{10,20})['"]/);
    if (inline && inline[1]) value = inline[1];
  }

  value = value.replace(/\s+/g, "");

  // GA4 وGTM موثّقان بحروف كبيرة. الباقي **لا تُمسّ حالته**: نص تحقق GSC
  // حساس لحالة الأحرف، وتغييرها يكسر التحقق بلا رسالة خطأ.
  if (key === "ga4" || key === "gtm") value = value.toUpperCase();
  if (key === "clarity") value = value.toLowerCase();

  return value;
}

/** هل يطابق النص المُطبَّع صيغة الخدمة؟ */
export function isValidIntegrationId(key: IntegrationKey, value: string): boolean {
  return SERVICE_BY_KEY[key].pattern.test(value);
}

/* ────────────────────────────────────────────────────────────────────────────
 * (٢) قراءة مفتاح `integrations` بتسامح
 *
 * الشكل يصل من صف JSONB يملكه بانٍ آخر وقد يُحرَّر بيد — فلا نثق ببنيته.
 * ──────────────────────────────────────────────────────────────────────────── */

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** يبني كائناً كامل المفاتيح السبعة مهما كان الوارد ناقصاً أو مشوّهاً */
export function normalizeIntegrations(value: unknown): IntegrationsSettings {
  const source = isRecord(value) ? value : {};
  const out = {} as IntegrationsSettings;

  for (const service of INTEGRATION_SERVICES) {
    const raw = source[service.key];
    const cfg = isRecord(raw) ? raw : {};
    const id = typeof cfg.id === "string" && cfg.id.trim() !== "" ? cfg.id.trim() : null;
    out[service.key] = {
      enabled: cfg.enabled === true,
      id,
    };
  }

  // احتياط: مفتاح غاب من الفهرس لسبب ما يعود إلى افتراضيه المطفأ
  for (const key of Object.keys(DEFAULT_INTEGRATIONS) as IntegrationKey[]) {
    if (out[key] === undefined) out[key] = { ...DEFAULT_INTEGRATIONS[key] };
  }

  return out;
}

/* ────────────────────────────────────────────────────────────────────────────
 * (٣) حالة الإعداد — **حالة إعداد لا حالة اتصال**
 *
 * ⚠ هذه الحالة تصف ما في القاعدة وما سيُحقن في الصفحة، ولا تصف إطلاقاً ما إذا
 * كانت جوجل أو ميتا قد استقبلت شيئاً: مانع الإعلانات في متصفح الزائر يُسقط
 * سكربتات جوجل وميتا **صامتاً** والصفحة تُصيَّر سليمة تماماً. التحقق الحقيقي
 * الوحيد من لوحة الخدمة نفسها. الشاشة تقول ذلك بنصّها لا بهذا التعليق وحده.
 * ──────────────────────────────────────────────────────────────────────────── */

export type IntegrationStatus =
  /** مفعّل ومعرّفه سليم ⇒ الوسم يُحقن في الصفحة */
  | "ready"
  /** مطفأ ⇒ لا يُحقن شيء مهما كان المعرّف */
  | "off"
  /** مفعّل بلا معرّف ⇒ لا يُحقن شيء */
  | "no-id"
  /** مفعّل بمعرّف لا يطابق صيغة المزوّد ⇒ لا يُحقن شيء */
  | "bad-id";

export type ResolvedIntegration = {
  status: IntegrationStatus;
  /** المعرّف الصالح للحقن — غير null في حالة `ready` وحدها */
  id: string | null;
};

/**
 * القرار الوحيد: هل نحقن، وبأي معرّف؟
 * القرار ٧ في موجز المرحلة: لا وسم يُحقن إن كانت الخدمة `enabled: false` أو
 * `id: null` — صفحة نظيفة افتراضياً بلا أي طلب لجهة خارجية.
 */
export function resolveIntegration(
  key: IntegrationKey,
  config: IntegrationConfig | undefined
): ResolvedIntegration {
  const enabled = config?.enabled === true;
  const raw = typeof config?.id === "string" ? config.id.trim() : "";

  if (!enabled) return { status: "off", id: null };
  if (raw === "") return { status: "no-id", id: null };
  if (!isValidIntegrationId(key, raw)) return { status: "bad-id", id: null };
  return { status: "ready", id: raw };
}

/** نص الحالة كما يُعرض — يسمّي «الإعداد» صراحة ولا يدّعي فحصاً حياً */
export const STATUS_LABELS: Record<IntegrationStatus, string> = {
  ready: "مضبوط ومفعّل — الوسم يُحقن في الصفحة",
  off: "مطفأ — لا يُحقن أي وسم",
  "no-id": "مفعّل بلا معرّف — لا يُحقن أي وسم",
  "bad-id": "صيغة المعرّف غير صحيحة — لا يُحقن أي وسم",
};
