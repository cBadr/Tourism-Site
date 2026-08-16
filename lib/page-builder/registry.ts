/**
 * مرآة `BLOCK_CATALOGUE` للشاشات — التسميات العربية وقواعد الموضع ورموز الخطأ.
 *
 * لماذا ملفٌ مستقل عن `lib/page-builder-types.ts`؟ لأن العقد يصف **الشكل**
 * (حقولٌ وأدوارٌ ومواضع) والشاشة تحتاج **النصّ** — والنصّ يتغيّر بلا أن يتغيّر
 * العقد. ولا نسخة ثانية للكتالوج هنا: كل ما يخصّ البنية يُقرأ من العقد نفسه،
 * وهذا الملف يضيف طبقة العرض فوقه لا بجانبه (النمط ٤ في `handover/LESSONS.md`).
 *
 * ⚠ والتسميات العشر القائمة تُقرأ من `SECTION_TYPE_LABELS` ولا تُنسخ — الكتلتان
 * الجديدتان وحدهما تُضافان هنا، فإن سجّلهما مالك `lib/content-types.ts` لاحقاً
 * تطابق النصّان بلا انحراف.
 */

import { SECTION_TYPE_LABELS, type PageKind } from "@/lib/content-types";
import {
  BLOCK_CATALOGUE,
  CALLOUT_TONE_TOKENS,
  blockDef,
  ITEMS_FIELD,
  SPACING_TOKENS,
  STYLE_FIELD,
  THEME_COLOR_TOKENS,
  type BlockDef,
  type BlockStyle,
  type BuilderBlockType,
  type BuilderErrorCode,
  type CalloutToneToken,
  type PublishBlockerCode,
  type SpacingToken,
  type ThemeColorToken,
} from "@/lib/page-builder-types";

export { blockDef, BLOCK_CATALOGUE };

/**
 * نوع الصفحة كما يراه المنشئ. مكتوبٌ `PageKind | "landing"` حرفياً كما في العقد
 * §٨ حتى يعمل الملف **قبل وبعد** إضافة النوع إلى `lib/content-types.ts` — ذلك
 * الملف يملكه عارضُ الصفحات، وشاشة المنشئ لا يجوز أن تتعطّل بانتظاره.
 */
export type BuilderPageKind = PageKind | "landing";

/** تسميات أنواع الصفحات — مفاتيحها `string` بقصد: النوع يتوسّع ولا تنكسر الشاشة */
export const BUILDER_KIND_LABELS: Record<string, string> = {
  home: "الرئيسية",
  service: "خدمة",
  corridor: "مسار",
  static: "صفحة ثابتة",
  landing: "صفحة هبوط",
};

/**
 * المسار العام للصفحة. نسخةٌ متسامحة من `pagePublicPath` في `lib/seo/site-paths.ts`:
 * تلك `switch` بلا `default` بقصد (نسيان نوعٍ = خطأ بناء)، وهذه تُنادى بقيمةٍ
 * قادمة من القاعدة قد تسبق تحديث الأنواع — فترجع `null` بدل أن تنهار.
 */
export function builderPublicPath(kind: string, slug: string): string | null {
  switch (kind) {
    case "home":
      return "/";
    case "service":
      return `/services/${slug}`;
    case "corridor":
      return `/routes/${slug}`;
    case "static":
    case "landing":
      return `/${slug}`;
    default:
      return null;
  }
}

type BlockLabel = { label: string; hint: string };

/** تسميات الكتل — العشر من مصدرها، والجديدتان هنا */
export const BLOCK_LABELS: Record<string, BlockLabel> = {
  ...(SECTION_TYPE_LABELS as Record<string, BlockLabel>),
  columns: {
    label: "أعمدة",
    hint: "كتلة تخطيط تحمل حتى أربع كتل بجانب بعضها — لا نصّ لها هي نفسها، والنصّ في أبنائها.",
  },
  image: {
    label: "صورة",
    hint: "صورة من مكتبة الوسائط بنصٍّ بديل إلزامي — النصّ البديل يُقرأ في نتائج البحث ولقارئ الشاشة.",
  },
};

export function blockLabel(type: string): BlockLabel {
  return BLOCK_LABELS[type] ?? { label: type, hint: "نوع كتلة غير مسجَّل في الكتالوج." };
}

/** وصف حقلٍ نصّي واحد داخل كتلة */
export type FieldLabel = { label: string; help?: string; multiline?: boolean; dir?: "rtl" | "ltr" };

/**
 * تسميات الحقول. المفتاح هو اسم الحقل في `content` نفسه — مصدرٌ واحد يخدم
 * الحقول العليا وحقول العناصر معاً، فلا تنشأ خريطتان تنحرفان.
 */
export const FIELD_LABELS: Record<string, FieldLabel> = {
  title: { label: "العنوان" },
  headline: { label: "العنوان الرئيسي" },
  sub: { label: "النص التمهيدي", multiline: true },
  body: {
    label: "النصّ",
    multiline: true,
    help: "اترك سطراً فارغاً بين الفقرات — كل فقرة تُعرض منفصلة.",
  },
  /**
   * ⚠ «ملاحظة» لا «ملاحظة تحت العنوان»: أربع كتل تستعمل هذا الحقل اليوم،
   * وموضعه يختلف بينها (تحت عنوان الشريط · **أسفل** الجدول). واسمٌ يصف موضعاً
   * لا يصحّ إلا في ثلاثةٍ من أربعة كذبٌ صغير على من يقرأ الحقل الرابع.
   */
  note: { label: "ملاحظة" },
  ctaLabel: { label: "نص زر الحجز" },
  alt: {
    label: "النص البديل للصورة",
    help:
      "يصف ما في الصورة لمن لا يراها، ويُقرأ في نتائج البحث ولقارئ الشاشة — ويُترجَم كأي نصّ. " +
      "واتركه فارغاً حين يقول عنوان البطاقة ما تقوله صورتها: تصير الصورة زخرفةً معلنة يتخطاها قارئ الشاشة.",
  },
  caption: { label: "تعليق أسفل الصورة" },
  src: {
    label: "مسار الصورة في مكتبة الوسائط",
    dir: "ltr",
    help: "مسارٌ داخل دلو media — لا نطاق خارجي (صورة على نطاق غيرنا تختفي يوم يحذفها صاحبها).",
  },
  q: { label: "السؤال" },
  a: { label: "الجواب", multiline: true },
  text: { label: "النص", multiline: true },
  // ── حقول كتل م‑٢ ────────────────────────────────────────────────────────
  badge: {
    label: "نص الشارة فوق العنوان",
    help: "الفارغ يعرض نشاط الشركة من الإعدادات — ولا تكتب فيه رقماً لا تملك مصدره.",
  },
  scrollLabel: {
    label: "نص سهم النزول",
    help: "كلمة واحدة أسفل البطل تدعو للنزول («اكتشف») — الفارغ يُخفي السهم كله.",
  },
  value: {
    label: "الرقم",
    help: "نصّ لا رقم، لأنه يُكتب ١٢٬٤٠٠ بالعربية و12,400 بالإنجليزية — فيُترجَم كأي نص.",
  },
  suffix: { label: "اللاحقة", help: "ما يلي الرقم مباشرة: + أو /5 أو ٪ — والفارغ لا يظهر." },
  label: { label: "تسمية الرقم" },
  name: { label: "اسم المسار" },
  href: {
    label: "رابط المسار",
    dir: "ltr",
    help: "مسارٌ داخلي يبدأ بـ/ مثل /routes/cairo-alexandria — والصفحة يجب أن تكون منشورة فعلاً وإلا كان الرابط ٤٠٤.",
  },
  duration: { label: "المدة", help: "كما تُقرأ: «٣ ساعات» أو «٤٥ دقيقة» — والفارغ لا يظهر." },
  distance: { label: "المسافة", help: "كما تُقرأ: «٢٢٠ كم» — والفارغ لا يظهر." },
  // ── حقول م‑٧ غير النصّية ────────────────────────────────────────────────
  poster: {
    label: "غلاف الفيديو",
    dir: "ltr",
    help: "الصورة التي تُعرض قبل تشغيل الفيديو — اتركها فارغة لتُستعمل صورة القسم نفسها فلا يُحمَّل ملفٌّ ثانٍ.",
  },
  video: {
    label: "مسار الفيديو",
    dir: "ltr",
    help: "ملف MP4 داخلي. الفارغ يعني صورةً ساكنة — وهو مسارٌ سليم لا نقص. ولا يُحمَّل على الجوال إطلاقاً.",
  },
  icon: {
    label: "الأيقونة",
    help: "رمزٌ صغير فوق العنوان. القائمة مغلقة عمداً: الاسم المكتوب بيدك لا يقابل رمزاً، ولا شيء كان سيقول لك ذلك.",
  },
  // ── حقول كتل المستندات (م‑١٠) ───────────────────────────────────────────
  num: {
    label: "رقم البند",
    help:
      "كما يُقرأ: «٤» أو «٤-٢». وهو نصٌّ يُترجَم لأن العربية تكتب ٤ والإنجليزية 4 — " +
      "والفارغ يعرض العنوان بلا رقم.",
  },
  anchor: {
    label: "مرساة البند (في الرابط)",
    dir: "ltr",
    help:
      "معرّفٌ لاتيني قصير يظهر في الرابط بعد #، مثل cancellation ⇐ ‎/terms#cancellation. " +
      "🔴 وهو ثابتٌ بقصد: لا يتغيّر أبداً بتعديل عنوان البند ولا نصّه، فالرابط الذي أرسلتَه لعميل " +
      "يظل يفتح البند نفسه. واتركه فارغاً فيتولّد رابطٌ طويل يعمل تماماً — " +
      "لكن **اكتبه بيدك قبل أن ترسل الرابط لأحد**، فتغييره لاحقاً هو الشيء الوحيد الذي يكسر ما أُرسل.",
  },
  h1: { label: "عنوان العمود ١" },
  h2: { label: "عنوان العمود ٢" },
  h3: { label: "عنوان العمود ٣" },
  h4: { label: "عنوان العمود ٤" },
  c1: { label: "الخانة ١" },
  c2: { label: "الخانة ٢" },
  c3: { label: "الخانة ٣" },
  c4: { label: "الخانة ٤" },
};

/**
 * 🔴 **الحدّ الأدنى الذي تشترطه م‑٧ على نفسها** (‏`lib/item-fields-types.ts` §٨):
 * منتقي الوسائط الكامل مؤجَّل، **لكن لا يُشحن حقلُ مسارٍ عارٍ**. فقائمة الأصول
 * القائمة تحت `public/` تُعرض اقتراحاً (`<datalist>`) — والمالك يختار بدل أن
 * يكتب مساراً بيده ويكتشف خطأه صورةً غائبة.
 *
 * ⚠ وهي **اقتراحٌ لا قيد**: الحقل يبقى قابلاً للكتابة، لأن دلو `media` سيصير
 * مصدراً ثانياً يوم يُفتح الرفع، و`safeMediaSrc` هي الحارس لا هذه القائمة.
 */
export const MEDIA_SUGGESTIONS: readonly string[] = [
  "/img/hero-chauffeur.avif",
  "/img/hero-video-poster.avif",
  "/img/fleet-sedan.avif",
  "/img/fleet-suv.avif",
  "/img/fleet-minibus.avif",
  "/img/fleet-bus.avif",
  "/img/service-airport.avif",
  "/img/service-city.avif",
  "/img/service-intercity.avif",
  "/img/service-tours.avif",
  "/img/service-events.avif",
  "/img/service-conference.avif",
  "/img/egypt-cairo.avif",
  "/img/egypt-luxor.avif",
  "/img/egypt-redsea.avif",
  "/img/night-road.avif",
  "/img/traveler-airport.avif",
  "/img/interior-van.avif",
  "/img/interior-detail.avif",
] as const;

/** أصول الفيديو القائمة — حقلٌ واحد يستعملها اليوم (`hero.video`) */
export const VIDEO_SUGGESTIONS: readonly string[] = ["/video/hero-loop.mp4"] as const;

/** تسميات الأيقونات بالعربية — القائمة نفسها من العقد، والنصّ هنا */
export const ICON_LABELS: Record<string, string> = {
  plane: "طائرة",
  building: "مبنى",
  route: "مسار",
  landmark: "معلم أثري",
  party: "مناسبة",
  mic: "ميكروفون",
  shield: "درع",
  check: "علامة صحّ",
  clock: "ساعة",
  wallet: "محفظة",
  star: "نجمة",
  headset: "سمّاعة دعم",
  car: "سيارة",
  bus: "باص",
  users: "ركاب",
  luggage: "حقيبة",
  mapPin: "دبوس خريطة",
  phone: "هاتف",
};

export function fieldLabel(field: string): FieldLabel {
  return FIELD_LABELS[field] ?? { label: field };
}

/** المحتوى الابتدائي لكتلةٍ جديدة — أدنى شكلٍ صالح، والحقول الإلزامية فارغة تُملأ */
export function defaultContentFor(type: BuilderBlockType): Record<string, unknown> {
  const def = blockDef(type);
  if (!def) return {};
  const content: Record<string, unknown> = {};
  for (const field of def.requiredFields) {
    if (field === ITEMS_FIELD) content[ITEMS_FIELD] = [];
    else content[field] = "";
  }
  return content;
}

// ---------------------------------------------------------------------------
// قواعد الموضع — تُفحص في الشاشة **قبل** الإضافة، وفي القاعدة عند النشر
// ---------------------------------------------------------------------------

/**
 * هل يجوز إضافة كتلة من هذا النوع إلى هذه الصفحة الآن؟ يرجع سبب المنع أو `null`.
 *
 * ⚠ هذا فحصٌ **مساعد للشاشة لا حارس**: الحارس هو `page_publish_blockers` في
 * القاعدة (‏`duplicate-singleton` و`home-only-misplaced`). وجودُه هنا يمنع
 * المالكَ من بناء شيءٍ سيُرفض عند النشر، لا أكثر.
 */
export function placementBlockReason(
  type: BuilderBlockType,
  pageKind: string,
  existingTypes: readonly string[]
): string | null {
  const def = blockDef(type);
  if (!def) return "نوع كتلة غير مسجَّل في الكتالوج.";
  if (def.placement === "home-only") {
    if (pageKind !== "home") return "هذه الكتلة للصفحة الرئيسية وحدها.";
    if (existingTypes.includes(type)) return "موجودة في الصفحة — ولا تتكرر.";
  }
  if (def.placement === "once-per-page" && existingTypes.includes(type)) {
    return "بياناتها من الإعدادات، فتكرارها يكرر المحتوى نفسه حرفياً.";
  }
  return null;
}

/** مقابض التنسيق المتاحة لكتلة — ما ليس هنا لا يُعرض في المحرر (العقد §٥) */
export function styleKeysFor(type: string): readonly (keyof BlockStyle)[] {
  return blockDef(type)?.styleKeys ?? [];
}

export const STYLE_FIELD_NAME = STYLE_FIELD;

export const THEME_COLOR_LABELS: Record<ThemeColorToken, string> = {
  default: "بلا تجاوز (يرث الثيم)",
  primary: "اللون الأساسي",
  secondary: "اللون الثانوي",
  accent: "لون التمييز",
  muted: "خلفية هادئة",
  card: "خلفية بطاقة",
  "brand-accent": "تمييز العلامة",
};

export const SPACING_LABELS: Record<SpacingToken, string> = {
  compact: "متقارب",
  default: "افتراضي",
  roomy: "متباعد",
};

/**
 * نبرة التنبيه (م‑١٠) — رمزان لا خمسة. واللون **ليس** هو الرسالة: كل نبرة
 * تحمل أيقونتها ونصّاً لقارئ الشاشة، فمن لا يميّز الألوان يقرأ المعنى نفسه.
 */
export const CALLOUT_TONE_LABELS: Record<CalloutToneToken, string> = {
  info: "معلومة",
  warning: "تحذير",
};

export const THEME_COLOR_OPTIONS = THEME_COLOR_TOKENS;
export const SPACING_OPTIONS = SPACING_TOKENS;
export const CALLOUT_TONE_OPTIONS = CALLOUT_TONE_TOKENS;

// ---------------------------------------------------------------------------
// الرموز → عربية. **الخادم يرسل رمزاً والشاشة تترجمه** (قاعدة المشروع)
// ---------------------------------------------------------------------------

export const BUILDER_ERROR_MESSAGES: Record<BuilderErrorCode | string, string> = {
  env: "قاعدة البيانات غير مربوطة — لا يمكن الحفظ بعد.",
  forbidden: "البناء والنشر لحساب دوره admin وحده — حسابك يفتح المنشئ للقراءة فقط.",
  save: "فشل الحفظ بصفر صفوف — تأكد أنك مسجّل الدخول بحساب دوره admin.",
  "stale-revision":
    "حُرِّرت هذه المسودة من تبويب أو جلسة أخرى بعد أن فتحتَ هذه الشاشة، فلم يُكتب تعديلك حتى لا يُمحى تعديلها. أعِد تحميل الصفحة لترى أحدث نسخة ثم أعِد ترتيبك عليها.",
  "publish-blocked": "النشر ممنوع — عالج الملاحظات المذكورة في بطاقة «قبل النشر» ثم أعد المحاولة.",
  "block-unknown": "نوع الكتلة غير مسجَّل في الكتالوج — لا تُحفظ كتلة لا تعرفها القاعدة.",
  "block-placement":
    "موضع كتلة مخالف: كتلة «مرة واحدة لكل صفحة» مكررة، أو كتلة الرئيسية خارج الرئيسية، أو كتلة داخل كتلة داخل كتلة (العمق مستوى واحد: كتلة أعمدة وأبناؤها فقط).",
  "item-key": "مفاتيح العناصر مكررة أو مخالفة للنمط — ست خانات لاتينية صغيرة وأرقام.",
  "template-shape": "القالب المستورد لا يطابق قواعد المنشئ، فلم يُقبل بلا تحويلٍ بالتخمين.",
  "not-found": "الصفحة أو اللقطة غير موجودة.",
  slug: "المعرّف غير صالح — حروف لاتينية صغيرة وأرقام تفصلها شرطات فقط.",
  title: "عنوان الصفحة حقل إلزامي.",
  "slug-format": "المعرّف غير صالح — حروف لاتينية صغيرة وأرقام تفصلها شرطات فقط (مثال: summer-offer).",
  "slug-reserved":
    "هذا المعرّف يملكه ملفٌ في التطبيق نفسه — الملف يفوز دائماً، فالصفحة كانت ستُنشر وتبقى ٤٠٤ للأبد.",
  "slug-prefix": "هذا المقطع بادئة يملكها قسم آخر من الموقع (الخدمات أو المسارات أو الحجز).",
  "slug-taken": "توجد صفحة أخرى بهذا المعرّف.",
  "slug-redirect": "يوجد تحويل رابط يخطف هذا المسار — الصفحة لن تُرى أبداً.",
};

export function builderErrorMessage(code: string | null): string | null {
  if (!code) return null;
  return BUILDER_ERROR_MESSAGES[code] ?? "حدث خطأ غير متوقع.";
}

export const PUBLISH_BLOCKER_MESSAGES: Record<PublishBlockerCode | string, string> = {
  "no-blocks": "الصفحة بلا كتلة واحدة — أضف كتلةً على الأقل.",
  "all-blocks-empty": "كل الكتل الظاهرة فارغة، فالصفحة ستُنشر بيضاء.",
  "missing-required": "كتلة ظاهرة ينقصها حقل إلزامي — الكتلة الناقصة لا تُصيَّر إطلاقاً (لا تظهر على الصفحة).",
  "empty-title": "عنوان الصفحة فارغ.",
  "no-meta-description": "لا وصف سيو للصفحة — والسيو هو المنتج، فالوصف يمنع لا يحذّر.",
  "orphan-child": "كتلة ابنة بلا أب — احذفها أو أعِدها إلى كتلة أعمدة.",
  "depth-exceeded": "حفيد: كتلة ابنة تحمل أبناءً — العمق مستوى واحد.",
  "slug-conflict": "مسار الصفحة يصطدم بمسارٍ يملكه التطبيق — لن تُرى على الويب.",
  "duplicate-singleton": "كتلة «مرة واحدة لكل صفحة» مكررة.",
  "home-only-misplaced": "كتلة الواجهة الرئيسية موضوعة في صفحة غير الرئيسية.",
  /**
   * ليس رمزاً من العقد §١١ بل حالةُ «لم نستطع القراءة» — ويُعرض **مانعاً** لا
   * قائمةً فارغة: بوابةٌ تعذّرت قراءتها تعني أن النشر قد يُرفض ونحن لا نعلم،
   * وزرٌّ متاح على مجهول أسوأ من زرٍّ معطَّل بسببٍ مكتوب (القاعدة الذهبية ١٥).
   */
  "read-failed":
    "تعذّرت قراءة موانع النشر من قاعدة البيانات — أعِد تحميل الصفحة، وإن تكرر فتأكد أن جلستك ما زالت بحساب admin.",
};

export function publishBlockerMessage(code: string): string {
  return PUBLISH_BLOCKER_MESSAGES[code] ?? `مانع نشر غير معروف: ${code}`;
}

/** تعريف الكتلة أو `null` — يُعاد تصديره للشاشات كي لا تستورد العقد مباشرةً */
export type { BlockDef, BuilderBlockType };
