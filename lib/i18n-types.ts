/**
 * عقد اللغات والترجمة (المرحلة ٨) — المرجع الأوحد.
 *
 * من VISION.md: العربية هي الأساس والجنيه العملة الافتراضية · ترجمة عبر API
 * مجاني · إدارة كاملة للغات من تبويب في الإعدادات · اللوجوهات وبيانات الموقع
 * تظهر بلغة العميل.
 *
 * ── ثلاثة قرارات تحكم المرحلة ───────────────────────────────────────────────
 *
 * (١) **العربية بلا بادئة في الرابط.** `/` و`/services/airport-transfer` تبقى
 *     كما هي حرفاً بحرف، والإنجليزية على `/en/...`. نقل العربية إلى `/ar/...`
 *     كان سيغيّر كل رابط في الموقع ويهدم عمر الصفحات في نتائج البحث — وهو
 *     الأصل الوحيد الذي لا يُشترى.
 *
 * (٢) **لوحة التحكم وبورتال المتعهدين عربيان فقط.** الترجمة للواجهة العامة
 *     وحدها: هي المنتج التسويقي، أما الخلفية فيستخدمها المالك وشركاؤه.
 *     هذا يقصّ نصف العمل بلا خسارة حقيقية.
 *
 * (٣) **لا نشر تلقائي للترجمة الآلية افتراضياً.** السيو هو المنتج، وجوجل
 *     يعامل الترجمة الآلية غير المراجَعة كمحتوى ضعيف قد يجرّ النطاق كله.
 *     المسودة تُراجَع ثم تُنشر، وللمالك مفتاح نشر تلقائي لكل لغة على حدة
 *     (افتراضياً مطفأ) للغات الذيل الطويل.
 */

/** لغة مسجَّلة في `locales` */
export type LocaleRow = {
  code: string; // ISO-639-1: ar, en, fr...
  name: string; // بالعربية للوحة
  nativeName: string; // كما يكتبها أهلها: English, Français
  dir: "rtl" | "ltr";
  /** العربية: أساس لا يُعطَّل ولا يُحذف */
  isDefault: boolean;
  enabled: boolean;
  /** نشر مسودات الترجمة الآلية بلا مراجعة — افتراضياً false */
  autoPublish: boolean;
  sort: number;
};

/** حالة سطر ترجمة واحد */
export type TranslationStatus = "draft" | "reviewed" | "published";

/**
 * مساحات المفاتيح — تفصل مصدر النص:
 *  ui       : نصوص الواجهة الثابتة (من ملفات الرسائل في المستودع)
 *  page     : عنوان الصفحة وميتاداتاها  (المفتاح: <pageId>.title|meta.title|meta.description)
 *  section  : محتوى قسم                (المفتاح: <sectionId>.<field> أو <sectionId>.items.<i>.<field>)
 *  settings : الهوية وبيانات الشركة     (المفتاح: brand.name|brand.tagline|company.activity|seo.*)
 *  service  : أسماء الخدمات الست ووصفها (المفتاح: <slug>.title|<slug>.short)
 *  vehicle  : فئات السيارات             (المفتاح: <slug>.title|<slug>.seats|<slug>.short)
 */
export type TranslationNamespace = "ui" | "page" | "section" | "settings" | "service" | "vehicle";

export type TranslationRow = {
  id: string;
  locale: string;
  namespace: TranslationNamespace;
  key: string;
  /** النص العربي وقت التوليد — يكشف تغيّر الأصل بعد الترجمة */
  sourceText: string;
  /** بصمة الأصل: تغيّرها يعني أن الترجمة صارت قديمة */
  sourceHash: string;
  value: string | null;
  status: TranslationStatus;
  /** مزوّد الترجمة الآلية الذي ولّد المسودة (أو null للترجمة اليدوية) */
  provider: string | null;
  updatedBy: string | null;
  updatedAt: string;
};

/** تقدم لغة — من `translation_progress()` */
export type LocaleProgress = {
  locale: string;
  total: number;
  published: number;
  reviewed: number;
  draft: number;
  missing: number;
  /** ترجمات نُشرت ثم تغيّر أصلها العربي */
  stale: number;
  percent: number;
};

/** مزوّد الترجمة الآلية — الواجهة التي يلتزم بها كل مزوّد */
export type MtProvider = {
  id: string;
  label: string;
  /** يترجم دفعة نصوص من العربية إلى لغة الهدف */
  translate(texts: string[], target: string): Promise<(string | null)[]>;
};

/** استجابة /api/i18n/translate (إدارية) */
export type TranslateBatchResult = {
  ok: boolean;
  locale: string;
  requested: number;
  translated: number;
  skipped: number;
  failed: number;
  provider: string;
  message?: string;
};

/**
 * تواقيع Postgres (هجرة 0018):
 *   locales, translations                    — الجدولان
 *   t(p_locale text, p_ns text, p_key text)  — النص المنشور أو null (definer, للعامة)
 *   localized_page(p_slug text, p_locale text)      — صفحة بأقسامها مترجمة
 *   localized_settings(p_locale text)               — الهوية وبيانات الشركة باللغة
 *   translation_progress()                          — تقدم كل لغة (إدارية)
 *   upsert_translations(p_rows jsonb)               — كتابة دفعة مسودات (إدارية)
 *   review_translation(p_id uuid, p_value text, p_publish boolean)
 *   publish_locale(p_locale text)                   — نشر كل المراجَع دفعة
 *   translation_queue(p_locale text, p_status text) — طابور المراجعة (إدارية)
 */

export const DEFAULT_LOCALE = "ar";

/** يُستعمل في الروابط: العربية بلا بادئة */
export function localePath(locale: string, path: string): string {
  const clean = path.startsWith("/") ? path : `/${path}`;
  return locale === DEFAULT_LOCALE ? clean : `/${locale}${clean === "/" ? "" : clean}`;
}
