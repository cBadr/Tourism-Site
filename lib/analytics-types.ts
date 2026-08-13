/**
 * عقد الربط الخارجي والإحصائيات (المرحلة ١٠) — المرجع الأوحد.
 *
 * من VISION.md: «ربط الموقع مع خدمات جوجل ومايكروسوفت وميتا لقياس وتحليل
 * الأداء»، و«اعتبار ٦: إحصائية شاملة وكاملة لكل قسم مدعمة بالرسوم البيانية
 * والمؤشرات»، و«اعتبار ٥: تحكم المدير في كافة خصائص الميتاداتا والسيو».
 *
 * ── ثلاث قواعد تحكم التصميم ────────────────────────────────────────────────
 *
 * (١) **المعرّفات من اللوحة لا من الكود.** كل معرّف قياس (GA4, GTM, Pixel,
 *     Clarity, GSC, Bing) يُدخَل من `/admin/integrations` ويُخزَّن في
 *     `site_settings` بمفتاح `integrations`. لا متغيّر بيئة لمعرّف عام، لأن
 *     نسخة الـ whitelabel الثانية لها معرّفاتها هي — ولو عاشت في البيئة لصار
 *     كل إطلاق علامة جديدة نشراً جديداً. الأسرار وحدها (توكن CAPI مثلاً) تبقى
 *     في البيئة.
 *
 * (٢) **الإحصائيات تُحسب في Postgres.** كل رقم ورسم في اللوحة يأتي من view أو
 *     دالة — لا تجميع في TypeScript ولا جلب صفوف خام ثم عدّها. نفس مبدأ
 *     المرحلة ٧، ولنفس السبب: رقمان لنفس الشيء في شاشتين يعني نظاماً لا يُوثق به.
 *
 * (٣) **القياس لا يكسر الخصوصية ولا الـ whitelabel.** أحداث التحويل تحمل قيمة
 *     الحجز وفئته ومساره، ولا تحمل **أبداً**: اسم العميل ولا رقمه، ولا هوية
 *     المتعهد، ولا تكلفته، ولا هامش الموقع. ما مُنع في المرحلتين ٥ و٩ من
 *     المتصفح لا يُسرَّب هنا إلى جوجل وميتا.
 */

/** خدمات القياس المدعومة */
export type IntegrationKey =
  | "ga4" // Google Analytics 4
  | "gtm" // Google Tag Manager
  | "gsc" // Google Search Console (وسم التحقق)
  | "metaPixel" // Meta Pixel (متصفح)
  | "metaCapi" // Meta Conversions API (خادم — سرّه في البيئة)
  | "clarity" // Microsoft Clarity
  | "bing"; // Bing Webmaster (وسم التحقق)

/** إعداد خدمة واحدة — يُخزَّن ضمن مفتاح `integrations` في site_settings */
export type IntegrationConfig = {
  enabled: boolean;
  /** المعرّف العام: G-XXXX أو GTM-XXXX أو رقم البكسل أو وسم التحقق */
  id: string | null;
};

export type IntegrationsSettings = Record<IntegrationKey, IntegrationConfig>;

export const DEFAULT_INTEGRATIONS: IntegrationsSettings = {
  ga4: { enabled: false, id: null },
  gtm: { enabled: false, id: null },
  gsc: { enabled: false, id: null },
  metaPixel: { enabled: false, id: null },
  metaCapi: { enabled: false, id: null },
  clarity: { enabled: false, id: null },
  bing: { enabled: false, id: null },
};

/**
 * أحداث القمع — الاسم موحّد عبر كل المزوّدين، ويُترجَم داخل كل محوّل إلى
 * اسمه لدى المزوّد (مثلاً `booking_paid` ⇒ `purchase` في GA4 و`Purchase` في ميتا).
 */
export type FunnelEvent =
  | "search_performed" // بحث عن رحلة
  | "quote_viewed" // ظهرت العروض
  | "booking_started" // بدأ مسار الحجز
  | "booking_created" // أُنشئ الحجز
  | "booking_paid" // وصل التحصيل (يدوي معتمد أو webhook)
  | "quote_requested"; // طلب عرض سعر يدوي

/** حمولة الحدث — منقّحة عمداً: لا PII ولا أرقام داخلية */
export type FunnelPayload = {
  /** رقم الحجز المرجعي — معرّف غير شخصي يصلح للمطابقة */
  reference?: string;
  value?: number;
  currency?: string;
  classSlug?: string;
  originLabel?: string;
  destLabel?: string;
  passengers?: number;
  distanceKm?: number;
};

/**
 * تواقيع Postgres (هجرة 0022) — كلها إدارية عدا ما يُذكر:
 *
 *   v_stats_orders        — الطلبات: عدد وقيمة بالحالة وباليوم
 *   v_stats_dispatch      — البث: معدل القبول، زمن أول قبول، نسبة اليدوي
 *   v_stats_partners      — المتعهدون: رحلات وقيمة وهامش ونسبة قبول لكل شريك
 *   v_stats_content       — المحتوى والسيو: صفحات منشورة/مسودة، اكتمال الميتاداتا
 *   v_stats_locales       — اللغات: نسبة الاكتمال والقديم لكل لغة
 *   section_stats(p_section text, p_from date, p_to date)
 *       — واجهة موحّدة تُرجع بطاقات المؤشرات لأي قسم بشكل واحد
 *   funnel_daily(p_from date, p_to date)
 *       — القمع يومياً من بيانات المنصة نفسها (لا من جوجل): بحث ← عرض ← حجز ← دفع
 *
 * ملاحظة: `search_performed` و`quote_viewed` لا يوجد لهما أثر في القاعدة اليوم،
 * فتحتاج جدول `funnel_events` خفيفاً يكتب فيه `/api/quote` صفاً واحداً بلا PII.
 * هذا هو التغيير الوحيد الذي يلمس مساراً قائماً — أبقِه رخيصاً (إدراج واحد،
 * لا يفشل الطلب إن فشل).
 */

/** بطاقة مؤشر موحّدة تعرضها كل شاشات الإحصائيات */
export type StatCard = {
  key: string;
  label: string;
  value: number;
  /** التغير عن الفترة السابقة بالنسبة المئوية — null حين لا مقارنة */
  deltaPercent: number | null;
  format: "number" | "money" | "percent" | "duration";
  help: string;
};

/** سلسلة زمنية لرسم بياني — الرسم CSS/SVG بلا مكتبات */
export type StatSeries = {
  key: string;
  label: string;
  points: { bucket: string; value: number }[];
};
