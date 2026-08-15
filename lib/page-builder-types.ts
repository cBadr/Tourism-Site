import type { PageKind, SectionType } from "@/lib/content-types";

/**
 * عقد منشئ الصفحات (المرحلة ١٣) — المرجع الأوحد. يُقرأ **قبل** أول سطر SQL
 * وقبل أول مكوّن، ومعه `docs/phase-briefs/PAGE-BUILDER.md`.
 *
 * ملفات تُقرأ معه ولا يُغني عنها: `lib/content-types.ts` (نموذج الأقسام) ·
 * `supabase/migrations/0018_i18n.sql` (طبقة الترجمة) · **D-23** و**D-24**
 * و**D-25** و**D-20** و**D-48** و**D-58**.
 *
 * ── لماذا وُجد هذا الملف ────────────────────────────────────────────────────
 *
 * المنشئ يولّد **شجرة**، وطبقة الترجمة تفهرس **مستويين**. والاصطدام لا يظهر
 * انهياراً — يظهر صمتاً، وهذا أسوأ ما فيه.
 *
 * ── ما قِيس فعلاً على القاعدة الحية (2026-08-15، داخل معاملة أُلغيت) ────────
 *
 * ١) **الشكل القائم مستويان لا أكثر، والأرقام تثبته:** ١٧ صفحة · ٩٣ قسماً ·
 *    ١٠ أنواع. ومفاتيح `content` كلها سبعة: `title`(٧٩) `body`(٤٠) `sub`(٢١)
 *    `items`(١٩ مصفوفة) `note`(١٣) `ctaLabel`(١٢) `headline`(١). **صفر** مصفوفة
 *    باسم غير `items`، و**صفر** كائن متداخل في ٩٣ قسماً. وعناصر `items` كلها
 *    كائنات مسطّحة من نصوص (`q`/`a` و`title`/`text`).
 *
 * ٢) **الفهرس يعرف صيغتين اثنتين فقط:** `i18n_corpus_rows()` تُخرج ٢٩٠ مفتاح
 *    قسم — **١٦٦** بصيغة `<sectionId>.<field>` و**١٢٤** بصيغة
 *    `<sectionId>.items.<ordinal>.<field>`. ولا صيغة ثالثة في القاعدة كلها.
 *
 * ٣) 🔴 **العمق الزائد لا ينفجر — يختفي.** قسمٌ اختباري حمل `columns:[{heading}]`
 *    و`style:{label}` أخرج **صفر** صفٍّ من الفهرس، بينما أخرج `items` أربعة.
 *    و`i18n_apply` مرّرت الاثنين كما هما. فالنتيجة ليست خطأً بل:
 *      • نصٌّ عربي يظهر على `/en` بلا أن يعلم أحد،
 *      • و`translation_progress().percent` يُحسب على **الفهرس** لا على الصفحة
 *        ⇒ العدّاد يقول ١٠٠٪ والصفحة نصفها عربي،
 *      • و`enabled_locales().published_count` يعدّ **صفوفاً** لا تغطية ⇒
 *        **D-25 يصير غير قابل للفرض**: تُعلَن اللغة في hreflang وخريطة الموقع
 *        وفيها محتوى غير مترجَم أصلاً.
 *
 * ٤) 🔴 **العنوان الترتيبي ينكسر بالحركة التي يقوم عليها المنشئ.** بُدّل عنصرا
 *    `faq` (وهو ما يفعله السحب والإفلات حرفياً) فصارت الصفحة الإنجليزية تعرض
 *    `{ q: "QUESTION-ALEF", a: "جواب باء" }` — سؤالٌ مترجَم ملصوقٌ بجواب عنصرٍ
 *    آخر، **معروضٌ على الزائر**. الطابور وسمه `stale=true`، لكن `localized_page`
 *    ترشّح على `status='published'` وحده فتخدمه. واليوم إعادة الترتيب حركةٌ
 *    نادرة خلف زرَّين؛ وفي المنشئ **هي التفاعل نفسه**.
 *
 * فالخلاصة: القيد على الشكل صحيح، لكن **الشكل القائم ليس آمناً كما هو**.
 */

// ---------------------------------------------------------------------------
// (١) 🔴 القرار المحوري — الترجمة تعنون بمسارٍ **مسطّح ثابت**، والبنية لا تُترجَم
// ---------------------------------------------------------------------------

/**
 * **القرار:** الخيار (ج) الهجين، بإضافةٍ لا تحتملها صياغته المجرّدة:
 *
 *   • كل نصٍّ قابل للترجمة يبقى على **مستويين من جذر القسم**: حقلٌ نصّي أعلى،
 *     أو حقلٌ نصّي داخل عنصرٍ من قائمة **واحدة** اسمها `items` حرفياً.
 *   • «التداخل» الذي تطلبه الخارطة يُنفَّذ **تداخلَ كتل** (‏`sections.parent_id`)
 *     لا تداخلَ حقول — أي عمقاً في **صفوف** الجدول لا في `jsonb`.
 *   • وعنوان العنصر يصير **مفتاحاً ثابتاً** (`_k`) لا ترتيباً.
 *   • وكل ما ليس نصاً يعيش تحت مفتاحٍ محجوز واحد (`style`) **لا يدخله الفهرس
 *     أبداً** — فـ«غير قابل للترجمة» يُعلَن بـ**موضعه** لا يُستنتَج من نوعه.
 *
 * **المبرر:** الصيغتان اللتان تعرفهما القاعدة تبقيان صيغتين، فلا يتضخم فضاء
 * المفاتيح ولا يفقد `translation_progress` مقاماً ثابتاً. والعمق الذي يريده
 * المالك يصل كاملاً — لكن عبر آلية **تعرفها الترجمة أصلاً**: كل كتلة ابنة قسمٌ
 * له `id` خاص، فنصوصها مفهرسة بذلك المعرّف تلقائياً وبلا سطرٍ جديد في الفهرس.
 *
 * **عاقبة النقض — إن سُمح للشجرة أن تعمق داخل `jsonb`:**
 *   • مفاتيح `translations.key` تصير مساراتٍ **يتغيّر معناها بسحبةٍ واحدة**،
 *     والفهرس الفريد `(locale, namespace, key)` يحمل عنواناً غير مستقر.
 *   • ونصفُ محتوى الصفحات المبنية لا يظهر في الطابور إطلاقاً ⇒ عودةٌ إلى
 *     العطب المقيس في (٣) أعلاه، مضروبةً في كل صفحة يبنيها المالك.
 *   • **ولا رجعة:** المفتاح الذي نُشر لا يُسحب — تصحيحُ العنونة بعد النشر يعني
 *     إسقاط ترجماتٍ راجعها إنسان.
 *
 * **ولماذا لا (أ) ولا (ب):**
 *   • (أ) «قيّد المنشئ على الشكل القائم» — القيد صحيح والشكل معطوب: لو شُحن كما
 *     هو لشُحن عطبُ إعادة الترتيب المقيس في (٤) **ميزةً**.
 *   • (ب) «وسّع الترجمة لعمقٍ حر» — أغلى الثلاثة نقضاً، وقد فصّلته الفقرة أعلاه.
 */
export const TRANSLATION_SHAPE_DECISION = "flat-path-stable-key" as const;

/** إصدار شكل `content` — يُكتب في `style._v` عند أول كتابة من المنشئ */
export const BUILDER_CONTENT_VERSION = 1;

// ---------------------------------------------------------------------------
// (٢) نموذج الصفحة — لا جدول ثالث، و**لا ترحيل بيانات**
// ---------------------------------------------------------------------------

/**
 * **القرار:** `pages` + `sections` هما النموذج، حرفياً وبلا بديل (**D-23**).
 * المرحلة ١٣ تضيف **أعمدة وجداول مجاورة** ولا تنقل صفاً واحداً:
 *   • `sections.parent_id uuid null references sections(id) on delete cascade`
 *   • `sections.block_key text null`  ← مفتاح ثابت للكتلة داخل قالبٍ مصدَّر
 *   • جدول `page_revisions` (المسودة كاملةً لقطةً) — القسم ٧
 *   • جدول `block_registry` (كتالوج الكتل في القاعدة) — القسم ٦
 *
 * **المبرر:** الضمانة المكتوبة في الخارطة («كل صفحات النظام القديم تُفتح
 * وتُحرَّر في المنشئ بلا كسر») تتحقق مجاناً حين لا يكون هناك ما يُنقَل. والقسم
 * القائم يصير كتلةً بمجرد أن يُسجَّل نوعه في الكتالوج.
 *
 * **عاقبة النقض:** نموذج بياناتٍ ثانٍ ⇒ ترحيل ١٧ صفحة و٩٣ قسماً، **وإسقاط ٢٩٠
 * مفتاح ترجمة** لأن المفاتيح مبنية على `sections.id`؛ وضمانة «بلا كسر» تسقط في
 * أول سطر.
 *
 * ⚠ **والحارس على هذا القرار مقيس لا مُعلَن:** فحصٌ في مجموعة الاختبار يقارن
 * ناتج `i18n_corpus_rows()` **قبل الهجرة وبعدها** ويشترط تطابق ٣٦١ صفاً حرفياً
 * (٢٩٠ قسم · ٥١ صفحة · ٨ مركبة · ٦ خدمة · ٦ إعدادات).
 */
export const PAGE_BUILDER_TABLES = [
  "sections", // + parent_id, block_key
  "pages", // + kind 'landing'
  "page_revisions", // جديد
  "block_registry", // جديد
] as const;

// ---------------------------------------------------------------------------
// (٣) التداخل — تداخل **كتل** لا تداخل **حقول**
// ---------------------------------------------------------------------------

/**
 * **القرار:** الكتلة التخطيطية `columns` تقبل أبناءً عبر `parent_id`، والأبناء
 * صفوفٌ في `sections` لها معرّفاتها وترتيبها. العمق **مستوى واحد** (كتلة أب
 * وأبناؤها) ولا يُسمح بحفيد.
 *
 * **المبرر:** كل نص في الصفحة يبقى على بُعد مستويين من **جذر قسمه**، وهو
 * بالضبط ما يعنونه الفهرس. والعمق الثاني كان سيضيف قدرةً تخطيطية لا يطلبها
 * أحد، ويفتح دوراتٍ في `parent_id` تحتاج حارساً بنيوياً بذاته.
 *
 * **عاقبة النقض:** جدولٌ من صفوف وأعمدة (وهو الشكل الوحيد الذي يستدعي حفيداً)
 * يصير قابلاً للبناء — وكل خلية فيه نصٌّ لا يعرف الفهرس عنوانه.
 *
 * **الثمن، مكتوباً بلا تجميل:** بناء صفٍّ من ثلاثة أعمدة نصية = **٤ صفوف** في
 * `sections` لا صفٌّ واحد، والمالك يتعلّم أن «العمود كتلة». وهذا هو الفارق
 * الحقيقي بين ما تعده الخارطة بكلمة «تداخل» وما يُشحن.
 */
export const MAX_BLOCK_DEPTH = 1;

/** حارسٌ بنيوي: `parent_id` لا يشير إلى كتلةٍ لها أبٌ (لا حفيد) ولا إلى نفسها */
export const NESTING_GUARD_TRIGGER = "sections_guard_depth" as const;

// ---------------------------------------------------------------------------
// (٤) 🔴 مفتاح العنصر `_k` — العلاج المباشر للعطب المقيس في الترويسة (٤)
// ---------------------------------------------------------------------------

/**
 * **القرار:** كل عنصر في `items` يحمل `_k`: ست خانات `[a-z0-9]` تُسَكّ عند
 * **إنشاء العنصر** ولا تتغير أبداً ولا يُعاد استعمالها. ويصير عنوان الترجمة:
 *
 *     <sectionId>.items.<_k>.<field>        ← الجديد
 *     <sectionId>.items.<ordinal>.<field>   ← القديم، **يبقى يعمل**
 *
 * `i18n_corpus_rows` تُخرج الصيغة الأولى حين يوجد `_k` والثانية حين لا يوجد،
 * و`i18n_apply` تبحث بـ`_k` أولاً ثم تسقط إلى الترتيب. فالمفاتيح الـ١٢٤ القائمة
 * لا تتغير ولا يُرحَّل صفٌّ واحد؛ والعنصر الذي يلمسه المنشئ يكتسب `_k` ويهاجر
 * مفتاحه **مرةً واحدة** بوصفه نصاً جديداً في الطابور.
 *
 * **المبرر:** العنوان يجب أن يصف **العنصر** لا **موضعه**، وإلا كان كل سحبٍ
 * إعادةَ إسنادٍ صامتة لترجماتٍ منشورة.
 *
 * **عاقبة النقض (وهي مقيسة لا متوقَّعة):** سحبةٌ واحدة تنقل ترجمة العنصر الأول
 * إلى الثاني، وتُعرَض على الزائر ممزوجةً بعربية العنصر الآخر. والوسم `stale`
 * يظهر في اللوحة فقط — **الموقع يخدم الخطأ إلى أن يفتح المالك الطابور**.
 *
 * ⚠ **وقاعدة مشتقة إلزامية:** السحب والإفلات **لا يُفعَّل** على `items` كتلةٍ
 * لا يحمل عناصرها `_k`. زرّا «أعلى/أسفل» في المحرر القديم يبقيان — لكن المنشئ
 * لا يعرض مقبض السحب إلا بعد سكّ المفاتيح.
 */
export const ITEM_KEY_FIELD = "_k" as const;
export const ITEM_KEY_PATTERN = /^[a-z0-9]{6}$/;
export type ItemKey = string;

/** المفتاح المحجوز للتنسيق — القسم ٥ */
export const STYLE_FIELD = "style" as const;
export const ITEMS_FIELD = "items" as const;

/** مفاتيح لا يجوز أن يحملها حقلٌ نصّي قابل للترجمة، ولا أن يخترعها كاتب كتلة */
export const RESERVED_CONTENT_KEYS = [ITEM_KEY_FIELD, STYLE_FIELD] as const;

/** بُناة العناوين — **مصدر واحد** تشترك فيه TypeScript وSQL بنصّها */
export function sectionFieldKey(sectionId: string, field: string): string {
  return `${sectionId}.${field}`;
}
export function sectionItemKey(sectionId: string, itemKey: ItemKey, field: string): string {
  return `${sectionId}.${ITEMS_FIELD}.${itemKey}.${field}`;
}
/** الصيغة القديمة — تبقى مقروءةً ولا تُكتب في عنصرٍ جديد */
export function legacySectionItemKey(sectionId: string, ordinal: number, field: string): string {
  return `${sectionId}.${ITEMS_FIELD}.${ordinal}.${field}`;
}

// ---------------------------------------------------------------------------
// (٥) `style` — منطقةٌ لا تدخلها الترجمة، ولا يدخلها CSS حرّ
// ---------------------------------------------------------------------------

/**
 * **القرار:** كل ما ليس نصاً للزائر يعيش تحت `content.style` وحده، والفهرس
 * يتجاوز هذا المفتاح **بالاسم**. وقيم `style` **رموزٌ من الثيم لا ألوان خام**.
 *
 * **المبرر (شقّان):**
 *  (أ) **للترجمة:** «غير قابل للترجمة» يجب أن يكون قراراً معلَناً بموضعه، لا
 *      استنتاجاً من نوع القيمة. فلو أضاف كاتب كتلةٍ حقلاً نصياً للتنسيق
 *      (`align: "start"`) لدخل الفهرسَ ولطُلبت ترجمته وظهر في الطابور نصاً
 *      عربياً بلا معنى — ولترجمه مزوّد آلي فعلاً.
 *  (ب) **للعلامة (D-04 · D-01):** لونٌ خام مكتوبٌ في صفٍّ يكسر النسخة الثانية
 *      صامتاً، لأن النسخة الثانية تُطلق بتغيير **بيانات** لا كود — وبيانات
 *      المحتوى تُصدَّر معها قالباً.
 *
 * **عاقبة النقض:** لونٌ محفور في محتوى صفحة ⇒ الـ Whitelabel يعطي علامةً ثانية
 * لونَ الأولى في كل صفحة مبنية؛ ونصُّ تنسيقٍ في الفهرس ⇒ طابور مراجعةٍ يُعلَّم
 * قارئه أن يتجاوزه (وهو النمط نفسه الذي وصفته القاعدة الذهبية ١٣).
 *
 * ⚠ **و«إضافة CSS» في الرؤية مؤجَّلة لا محذوفة (D-39)** — سببها في §١٢.
 */
export const THEME_COLOR_TOKENS = [
  "default", // بلا تجاوز — يرث القسم لونه من الثيم
  "primary",
  "secondary",
  "accent",
  "muted",
  "card",
  "brand-accent",
] as const;
export type ThemeColorToken = (typeof THEME_COLOR_TOKENS)[number];

export const SPACING_TOKENS = ["compact", "default", "roomy"] as const;
export type SpacingToken = (typeof SPACING_TOKENS)[number];

/**
 * شكل `content.style`. كل حقوله اختيارية، **والغياب يعني «الافتراضي»** لا
 * «صفر» — نفس تمييز القاعدة الذهبية ١٥.
 */
export type BlockStyle = {
  /** إصدار شكل المحتوى — يسمح بترحيلٍ لاحق بلا تخمين */
  _v?: number;
  background?: ThemeColorToken;
  spacing?: SpacingToken;
  /** إخفاء الكتلة على الجوال — تخطيط لا محتوى */
  hideOnMobile?: boolean;
};

// ---------------------------------------------------------------------------
// (٦) سجل الكتل — كتالوجٌ في القاعدة، وحارسٌ يجعل الشكل غير القانوني غير قابل للكتابة
// ---------------------------------------------------------------------------

/** دور الكتلة في الصفحة */
export type BlockRole =
  | "layout" // تحمل أبناءً ولا نصَّ لها (`columns`)
  | "content" // نصّها من `content` (‏`rich-text`, `faq`, …)
  | "system"; // بياناتها من الإعدادات أو `site-config` والنصّ تجاوزٌ اختياري

/** أين يُسمح بوضع الكتلة وكم مرة */
export type BlockPlacement =
  | "any" // في أي صفحة وبأي عدد
  | "once-per-page" // مرة واحدة لكل صفحة
  | "home-only"; // في صفحة `kind='home'` وحدها، ومرة واحدة

/**
 * تعريف الكتلة الواحدة. **هذا هو العقد الذي يقرؤه الحارس البنيوي**:
 * هجرة `0058` تمرّ على كل صفٍّ في `block_registry` وترفع استثناءً إن أعلنت
 * كتلةٌ حقلاً لا تستطيع قواعد العنونة في §٤ أن تعنونه — فالشكل غير القانوني
 * **لا يُكتب** بدل أن يُكتشف لاحقاً بكاشفٍ نصّي (القاعدة الذهبية ١٩).
 */
export type BlockDef = {
  type: BuilderBlockType;
  role: BlockRole;
  placement: BlockPlacement;
  /** يقبل أبناءً؟ `layout` وحدها */
  acceptsChildren: boolean;
  maxChildren: number | null;
  /** الحقول النصية العليا القابلة للترجمة */
  textFields: readonly string[];
  /** حقول العنصر داخل `items` — `null` = لا قائمة في هذه الكتلة */
  itemFields: readonly string[] | null;
  /**
   * ما بدونه لا تُصيَّر الكتلة إطلاقاً (تُرجع `null`).
   * حقلٌ في `requiredFields` ولا في `textFields`/`itemFields` = خطأ تسجيل.
   */
  requiredFields: readonly string[];
  /** مقابض التنسيق المتاحة لهذه الكتلة — ما ليس هنا لا يُعرض في المحرر */
  styleKeys: readonly (keyof BlockStyle)[];
};

/**
 * أنواع الكتل = أنواع الأقسام العشرة القائمة + كتلتان جديدتان.
 * ⚠ `sections.type` **بلا قيد `check`** في القاعدة (مقيس) — فالتسجيل هنا وفي
 * `block_registry` هو الحدّ الوحيد، و`render.tsx` تتجاهل المجهول بأمان (مقيس).
 */
export type BuilderBlockType = SectionType | "columns" | "image";

// ---------------------------------------------------------------------------
// (٧) المسودة والنشر — لقطةُ مراجعة، **والنشر فرقٌ بالمعرّف لا حذفٌ وإدراج**
// ---------------------------------------------------------------------------

/**
 * **القرار:** المنشئ يكتب في `page_revisions` (لقطة `jsonb` للصفحة كاملةً
 * بأقسامها)، ولا يلمس `sections` إلا لحظة النشر. والنشر **فرقٌ يُطابَق
 * بـ`sections.id`**: يُحدَّث الموجود، ويُدرَج الجديد، ويُحذف المرفوع من اللقطة —
 * كلٌّ في **معاملةٍ واحدة** (‏**D-48**: كل نداء PostgREST معاملة واحدة، فالنشر
 * دالةٌ واحدة `publish_page_revision(p_page uuid, p_revision uuid)` لا سلسلة
 * نداءات من الواجهة).
 *
 * **المبرر:**
 *  • القراءة العامة و`i18n_corpus_rows` تقرآن `sections` وحدها ⇒ **المسودة لا
 *    تصل الفهرس ولا الطابور ولا `enabled_locales`** ⇒ D-25 يبقى مفروضاً بلا
 *    سطرٍ إضافي، ولا تتضخم الترجمة بنصوصٍ لم تُنشر.
 *  • واللقطة تعطي المعاينة كائناً واحداً يُعنوَن، وتعطي «احفظ كقالب» معناها
 *    الحرفي: **القالب لقطة**.
 *
 * 🔴 **عاقبة النقض — والأخطر في هذه المرحلة كلها:** نشرٌ بـ«احذف أقسام الصفحة
 * ثم أدرجها من اللقطة» يبدو أبسط ويعمل تماماً في أول تجربة — **ويُبيد كل ترجمات
 * الصفحة في كل نشرة**، لأن كل مفاتيح `namespace='section'` مبنية على
 * `sections.id`. صفحةٌ فيها ٢٠ مفتاحاً تفقدها كلها بضغطة «نشر»، ولا يظهر ذلك
 * في أي شاشة عربية.
 *
 * ⚠ **ولا يُلمس `created_at`/`updated_at` بغير حاجة:** `pages_touch_updated_at`
 * يغذّي `lastModified` في خريطة الموقع؛ ونشرةٌ لا تغيّر شيئاً يجب ألا تعلن
 * تعديلاً (نفس مبرر الختم المحفور في `lib/content.ts`).
 */
export type RevisionStatus = "draft" | "published" | "archived";

export type PageRevisionRow = {
  id: string;
  page_id: string;
  status: RevisionStatus;
  /** اللقطة: `{ page: {...}, sections: [...] }` بشكل `PageWithSections` */
  snapshot: Record<string, unknown>;
  /** من أنشأها — من `profiles` */
  created_by: string | null;
  created_at: string;
  published_at: string | null;
};

/** نتيجة النشر — أعداد لا جُمل، فتُقرأ في الإيصال وفي السجل معاً */
export type PublishResult = {
  updated: number;
  inserted: number;
  deleted: number;
  /** معرّفات الأقسام التي بقيت — بها تُقاس سلامة الترجمة بعد النشر */
  keptSectionIds: string[];
};

/**
 * **المعاينة:** مسارٌ **تحت `/admin`** لا رابطٌ عام بتوكن.
 *
 * **المبرر:** `/admin` محجوب في `robots.txt`، ومحروس طبقتين (`proxy.ts` +
 * `app/admin/layout.tsx`)، وبلا وسم قياس واحد (**D-44**). أما رابط معاينة عام
 * — ولو بتوكن — فصفحةٌ غير منشورة قابلة للزحف: يكفي أن يُلصق في محادثة أو
 * يُفتح على متصفحٍ يُزامن سجلّه. والمشروع أمسك سلفاً تناقض «امنع الفهرسة» بين
 * `robots` والخريطة؛ هذا وجهه الآخر.
 *
 * ⚠ **وشرطٌ على الشاشة:** صفحة المعاينة تستعمل **حارس** `/admin` ولا تستعمل
 * **قشرته** — تُصيَّر بعرضٍ كامل بلا شريط جانبي، وإلا صارت المعاينة تكذب على
 * من ينظر إليها.
 */
export const PREVIEW_PATH = "/admin/content/[id]/preview" as const;

// ---------------------------------------------------------------------------
// (٨) المسار والـ slug
// ---------------------------------------------------------------------------

/**
 * **القرار:** نوع صفحة رابع `landing` يُضاف إلى القيد
 * `pages_kind_check` (‏**القيد قائم ومقيس**: `home|service|corridor|static`)،
 * ويُصيَّر من `app/[slug]/page.tsx` نفسه على `/{slug}` — **بلا بادئة لغة**
 * (‏**D-24**) وبلا ملف مسار جديد.
 *
 * **المبرر:** `/{slug}` هو الشكل الذي يريده المالك لصفحةٍ يبنيها، و`app/[slug]`
 * يملكه أصلاً. ونوعٌ مستقل — لا إعادة استعمال `static` — لأن `PRIORITY` في
 * `app/sitemap.ts` و`pagePublicPath` وقائمة `/admin/content` كلها تفرّق بين
 * «سياسة الخصوصية» و«صفحة هبوط تسويقية».
 *
 * ⚠ **وفائدة مجانية مقصودة:** `pagePublicPath` في `lib/seo/site-paths.ts`
 * `switch` على `PageKind` **بلا `default`** — فإضافة النوع تجعل نسيانَ
 * التعامل معه **خطأ بناء** لا نقصاً صامتاً.
 *
 * 🔴 **والتصادم موجودٌ اليوم ولا يحرسه شيء:** `createPage` يقبل أي `slug`
 * يطابق النمط، بينما `app/[slug]/page.tsx` يرفض بـ`notFound()` كل slug في
 * `RESERVED_SLUGS`. أي أن المالك **يستطيع الآن** إنشاء صفحة `about` أو `book`
 * ونشرها ورؤيتها «منشورة» في اللوحة — وهي ٤٠٤ للأبد. Next يقدّم المقطع الثابت
 * دائماً، **فالملف يفوز ولا مجال لغير ذلك**؛ والحلّ **رفضٌ عند الحفظ** لا تحذير.
 *
 * **القرار الإجرائي:** الرفض يقع في **القاعدة** (مُشغّل على `pages`) لا في
 * الـ Server Action وحدها — لأن الإدراج المباشر عبر PostgREST أو محرر SQL
 * يتخطى الواجهة (نفس مبرر `bookings_guard_return_leg` في `0032`).
 *
 * **عاقبة النقض:** صفحةٌ تبدو حيّة في اللوحة وميتة على الويب، ولا سطر في أي
 * سجل يقول ذلك — وهو بالضبط النمط ٣ في `LESSONS.md`.
 */
export const BUILDER_PAGE_KIND: PageKind | "landing" = "landing";

/**
 * مصدر المحجوزات **واحد لا يُنسخ**: `lib/seo/site-paths.ts`
 * (‏`APP_OWNED_PATHS` · `RESERVED_PATH_PREFIXES` · `RESERVED_EXACT_FILES`)
 * و`RESERVED_SLUGS` في `app/[slug]/page.tsx`. الهجرة تبذر الجدول
 * `reserved_slugs` من هذه القائمة **نصاً**، وفحصٌ في `page_builder_tests.sql`
 * يقارن الجدول بالملف ويفشل عند الانحراف.
 */
export const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

/** رموز رفض الـ slug — رمزٌ لكل سبب، لا رسالة واحدة عامة */
export const SLUG_REJECT_CODES = [
  "slug-format", // لا يطابق النمط
  "slug-reserved", // يملكه ملف في `app/` (`about`, `book`, `track` …)
  "slug-prefix", // يقع تحت بادئة محجوزة (`services/…`, `booking/…`)
  "slug-taken", // صفٌّ آخر في `pages` يحمله
  "slug-redirect", // مسارٌ يخطفه `redirects` — الصفحة لن تُرى أبداً
] as const;
export type SlugRejectCode = (typeof SLUG_REJECT_CODES)[number];

// ---------------------------------------------------------------------------
// (٩) من يبني — `is_admin()` وحدها
// ---------------------------------------------------------------------------

/**
 * **القرار:** حقّ البناء والنشر = `public.is_admin()`، أي `profiles.role='admin'`
 * حصراً (‏`0001_core.sql:81`). ولا دالة جديدة ولا حارس جديد.
 *
 * **المبرر (‏**D-20** حرفياً):** `authenticated` يشمل **كل متعهد** وكل عميل
 * مسجَّل منذ ١٢ب. والسياسات القائمة على `pages`/`sections` كلها `is_admin()`
 * للكتابة سلفاً، فالمنشئ لا يوسّع سطحاً — يستعمل القائم.
 *
 * ⚠ **والفخ المقيس هنا ليس في الكتابة بل في الشاشة:** `proxy.ts` يُدخل
 * `admin` **و`ops`** إلى `/admin`، بينما كل سياسة كتابة تشترط `is_admin()`.
 * فدور `ops` يفتح المنشئ اليوم، ويسحب، ويفلت، ويضغط «حفظ» — ويصطدم بفخ
 * Supabase الشهير: **صفر صفوف بلا خطأ** ⇒ `error=save` بلا سبب مفهوم، وعملُه
 * ضائع. **فالمنشئ يقرأ الدور ويُصيَّر للقراءة فقط لـ`ops`** — لا مقبض سحب ولا
 * زر نشر — بدل أن يسمح بعملٍ يُرفض عند الحفظ.
 *
 * **عاقبة النقض (لو فُتح لـ`authenticated`):** كل متعهد يحرّر صفحات الموقع
 * العام — وهو أوسع سطحٍ يمكن فتحه بخطأٍ واحد في هذا المشروع.
 *
 * 📌 **وتوسيع الحقّ إلى `ops` قرارُ مالكٍ لا قرارُ جلسة** — مفتوحٌ سلفاً في
 * `OPEN_TASKS` ج، ومكرَّرٌ هنا سؤالاً في `docs/phase-briefs/PAGE-BUILDER.md`.
 */
export const BUILDER_ROLE_CHECK = "public.is_admin()" as const;
export type BuilderAccess = "edit" | "read-only" | "denied";

// ---------------------------------------------------------------------------
// (١٠) كتالوج الكتل — وماذا تفعل الكتلة حين ينقص حقلها
// ---------------------------------------------------------------------------

/**
 * **القاعدة الحاكمة، بلا استثناء:** كتلةٌ ينقصها حقلٌ إلزامي **تُصيَّر `null`**.
 * لا نصَّ نائب، ولا صندوق «اضبطني»، ولا انهيار.
 *
 * **وهي ليست نظرية:** ثلاث كتل تفعلها اليوم بالفعل (`rich-text` و`faq` و
 * `features` ترجع `null` عند الفراغ — مقروءةً من الملفات)، **وواحدة تخالفها**:
 *
 * 🔴 `page-hero` تُصيَّر `{content.title}` **بلا شرط**، والمحتوى الابتدائي
 *    لقسمٍ جديد `{ title: "" }` (‏`app/admin/content/[id]/actions.ts`).
 *    فسحبُ ترويسة صفحة ونشرُها اليوم = **`<h1>` فارغ على صفحة عامة** — وهو عيب
 *    سيو لا يراه أحد بالعين. **إصلاحه بندٌ في المرحلة ١٣ لا تحسينٌ اختياري.**
 *
 * وثلاث قيود موضعٍ خرجت من قراءة العارضات نفسها:
 *  • `hero` **للرئيسية وحدها**: هي الكتلة الوحيدة التي تركّب ويدجت الحجز
 *    (`BookingWidget`)، ونسختان منها = ويدجتان على صفحة واحدة.
 *  • `services-grid` · `fleet` · `why-us` · `contact` **مرة واحدة لكل صفحة**:
 *    بياناتها من `site-config`/الإعدادات لا من `content`، فتكرارها يكرر
 *    المحتوى نفسه حرفياً.
 *  • `faq` **بلا سقف** — وهو سلوك مكتوب بقصدٍ في `components/sections/faq.tsx`
 *    («القسم قد يتكرر… وكل نسخة تصف أسئلتها هي»). ⚠ لكنه يُخرج عقدة `FAQPage`
 *    لكل نسخة، وتعدّدها على صفحة واحدة مأخذٌ في البيانات المهيكلة —
 *    **سؤالٌ للمالك في الموجز، لا قراراً يُتخذ هنا** فوق قرارٍ مكتوب.
 */
export const BLOCK_CATALOGUE: readonly BlockDef[] = [
  // ── كتلٌ حرّة: تُستعمل في أي صفحة وبأي عدد ──────────────────────────────
  {
    type: "rich-text",
    role: "content",
    placement: "any",
    acceptsChildren: false,
    maxChildren: null,
    textFields: ["title", "body"],
    itemFields: null,
    requiredFields: ["body"],
    styleKeys: ["background", "spacing", "hideOnMobile"],
  },
  {
    type: "page-hero",
    role: "content",
    placement: "any",
    acceptsChildren: false,
    maxChildren: null,
    textFields: ["title", "sub", "ctaLabel"],
    itemFields: null,
    /** 🔴 الإلزام هنا هو الإصلاح: بلا عنوان لا تُصيَّر — لا `<h1>` فارغ */
    requiredFields: ["title"],
    styleKeys: ["background", "spacing"],
  },
  {
    type: "features",
    role: "content",
    placement: "any",
    acceptsChildren: false,
    maxChildren: null,
    textFields: ["title", "sub"],
    itemFields: ["title", "text"],
    requiredFields: ["items"],
    styleKeys: ["background", "spacing", "hideOnMobile"],
  },
  {
    type: "faq",
    role: "content",
    placement: "any",
    acceptsChildren: false,
    maxChildren: null,
    textFields: ["title"],
    itemFields: ["q", "a"],
    requiredFields: ["items"],
    styleKeys: ["background", "spacing"],
  },
  {
    type: "cta-band",
    role: "content",
    placement: "any",
    acceptsChildren: false,
    maxChildren: null,
    textFields: ["title", "note"],
    itemFields: null,
    /** بلا حقلٍ إلزامي: نصوصها الافتراضية من الإعدادات، فهي تُصيَّر دائماً */
    requiredFields: [],
    styleKeys: ["background", "spacing", "hideOnMobile"],
  },

  // ── كتل النظام: بياناتها من الإعدادات، والنصّ تجاوزٌ اختياري ─────────────
  {
    type: "services-grid",
    role: "system",
    placement: "once-per-page",
    acceptsChildren: false,
    maxChildren: null,
    textFields: ["title", "sub"],
    itemFields: null,
    requiredFields: [],
    styleKeys: ["background", "spacing"],
  },
  {
    type: "fleet",
    role: "system",
    placement: "once-per-page",
    acceptsChildren: false,
    maxChildren: null,
    textFields: ["title", "sub"],
    itemFields: null,
    requiredFields: [],
    styleKeys: ["background", "spacing"],
  },
  {
    type: "why-us",
    role: "system",
    placement: "once-per-page",
    acceptsChildren: false,
    maxChildren: null,
    textFields: ["title", "sub"],
    itemFields: null,
    requiredFields: [],
    styleKeys: ["background", "spacing"],
  },
  {
    type: "contact",
    role: "system",
    placement: "once-per-page",
    acceptsChildren: false,
    maxChildren: null,
    textFields: ["title", "sub"],
    itemFields: null,
    requiredFields: [],
    styleKeys: ["background", "spacing"],
  },
  {
    type: "hero",
    role: "system",
    placement: "home-only",
    acceptsChildren: false,
    maxChildren: null,
    textFields: ["headline", "sub"],
    itemFields: null,
    requiredFields: [],
    styleKeys: [],
  },

  // ── الكتلتان الجديدتان ────────────────────────────────────────────────
  {
    /** جواب «التداخل» في الخارطة — تخطيطٌ لا محتوى، فلا نصَّ لها إطلاقاً */
    type: "columns",
    role: "layout",
    placement: "any",
    acceptsChildren: true,
    maxChildren: 4,
    textFields: [],
    itemFields: null,
    requiredFields: [],
    styleKeys: ["background", "spacing", "hideOnMobile"],
  },
  {
    /**
     * `alt` **نصٌّ قابل للترجمة** لا سمةٌ تقنية — وإغفاله هو الخطأ المعتاد.
     * و`src` مسارٌ في دلو `media` (قائمٌ منذ `0003`)، ولا يقبل نطاقاً خارجياً.
     */
    type: "image",
    role: "content",
    placement: "any",
    acceptsChildren: false,
    maxChildren: null,
    textFields: ["alt", "caption"],
    itemFields: null,
    requiredFields: ["src", "alt"],
    styleKeys: ["spacing", "hideOnMobile"],
  },
] as const;

/** المفتاح غير النصّي الوحيد المسموح خارج `style` — مسار الصورة */
export const NON_TEXT_CONTENT_FIELDS = ["src"] as const;

// ---------------------------------------------------------------------------
// (١١) بوابة النشر — رموزٌ من القاعدة، لا فحصٌ في المتصفح
// ---------------------------------------------------------------------------

/**
 * **القرار:** `page_publish_blockers(p_page uuid)` في Postgres تُرجع **رموزاً**،
 * وزر النشر معطَّل ما دامت غير فارغة.
 *
 * **المبرر:** «لا ينشر نصف صفحة بالخطأ» شرطٌ في الطلب، وفحصٌ في JavaScript
 * يتخطاه أي `update` مباشر. ورمزٌ لا جملة لأن الخادم يرسل رمزاً والواجهة
 * تترجمه (قاعدة المشروع، وإلا ظهرت العربية على `/en`).
 *
 * **عاقبة النقض:** صفحةٌ فارغة أو بعنوان فارغ تدخل `sitemap.xml` وتُعلَن
 * للزاحف — وسحبُها من النتائج أبطأ بكثير من منعها.
 */
export const PUBLISH_BLOCKER_CODES = [
  "no-blocks", // لا كتلة واحدة
  "all-blocks-empty", // كل الكتل تُصيَّر null ⇒ صفحة بيضاء
  "missing-required", // كتلة ينقصها حقل إلزامي
  "empty-title", // عنوان الصفحة فارغ
  "no-meta-description", // بلا وصف سيو — تحذيرٌ يمنع لأن السيو هو المنتج
  "orphan-child", // كتلة ابنة بلا أب (أو أبٌ حُذف)
  "depth-exceeded", // حفيدٌ — يخالف §٣
  "slug-conflict", // §٨
  "duplicate-singleton", // كتلة `once-per-page` مكررة
  "home-only-misplaced", // `hero` خارج الرئيسية
] as const;
export type PublishBlockerCode = (typeof PUBLISH_BLOCKER_CODES)[number];

/** رموز الخطأ التي تسافر في الـ query string من إجراءات المنشئ */
export const BUILDER_ERROR_CODES = [
  "env", // لا متغيرات بيئة
  "forbidden", // ليس `admin`
  "save", // صفر صفوف بعد الكتابة (فخ RLS)
  "stale-revision", // حُرِّرت اللقطة من جلسة أخرى
  "publish-blocked", // البوابة رفضت — التفصيل في `PublishBlockerCode`
  "block-unknown", // نوع كتلة غير مسجَّل
  "block-placement", // موضع مخالف
  "item-key", // `_k` مكرر أو مخالف للنمط
  "template-shape", // قالبٌ مستورَد لا يطابق القواعد
] as const;
export type BuilderErrorCode = (typeof BUILDER_ERROR_CODES)[number];

// ---------------------------------------------------------------------------
// (١٢) ما **لا** تبنيه المرحلة ١٣ — مؤجَّلٌ بسببٍ مكتوب (D-39: الحذف ممنوع)
// ---------------------------------------------------------------------------

/**
 * كل بندٍ هنا مذكورٌ في الرؤية أو الخارطة، **ولم يُحذف** — أُجّل بسببه:
 *
 * ١) **CSS حرّ لكل صفحة وللموقع** (‏`VISION.md:97`) — مؤجَّل إلى المرحلة ١٤.
 *    **السبب:** نصٌّ يُحقن في `<head>` مصدرُه صفٌّ في القاعدة، فيكسر ثلاثة
 *    أشياء دفعةً: قواعد RTL المنطقية (`ms/me/ps/pe`) التي يقوم عليها التحوّل
 *    إلى `/en`، وثيمَ العلامة الذي تُطلق به النسخة الثانية (**D-01**)، وسطحَ
 *    حقنٍ لا يمرّ على مراجعة. والبديل المشحون: رموز ثيم لكل كتلة (§٥) — وهي
 *    ٩٠٪ مما يطلبه المالك عملياً («التحكم في الألوان»).
 * ٢) **معرض قوالب وسوقٌ لها** — يُشحن التصدير والاستيراد (لقطة `page_revisions`
 *    ملفَ `json`) بلا معرض. **السبب:** المعرض واجهةٌ فوق قدرةٍ لا وجود لها بعد،
 *    وقيمته صفر قبل وجود قالبٍ ثانٍ.
 * ٣) **الاستيراد من منشئات خارجية** — الشكل المستورَد يجب أن يطيع قواعد §١–§٥،
 *    فما لا يطيعها يُرفض برمز `template-shape` ولا يُحوَّل بالتخمين.
 * ٤) **تداخلٌ أعمق من مستوى** (§٣) — مؤجَّل حتى يطلبه تخطيطٌ حقيقي.
 * ٥) **مكتبة وسائط كاملة** (وسوم · قصّ · أحجام متعددة) — يُشحن منها المطلوب
 *    لكتلة `image` وحده: رفعٌ إلى دلو `media` القائم واختيارٌ من قائمته.
 * ٦) **ترجمة `style`** — لا تُترجَم أبداً، بقرارٍ لا بتأجيل (§٥).
 * ٧) **مسار عام جديد** — صفر ملف تحت `app/` خارج `/{slug}` القائم (**D-24**).
 *
 * 🔴 **ثمنٌ يخصّ الطريق لا النطاق، ويجب أن يُقرأ قبل البدء:**
 * محرر المحتوى القائم يعيد بناء `content` **كاملاً** من النموذج في كل حفظ
 * (‏`sectionContentFromForm` — `switch` يُسقط كل مفتاح لا يعرفه). فأي كتلة تكتب
 * `style` أو `_k` ثم تُحفَظ من `/admin/content/[id]` القديم **تفقدهما صامتة**.
 * فإما أن يصير المنشئ **الكاتب الوحيد** لأنواع الكتل التي يديرها، وإما أن
 * يُوسَّع المحرر القديم ليحفظ المفتاحين. **الثالث — تركهما يكتبان معاً — عطبٌ
 * مؤكد لا احتمال.**
 */
export const PHASE_13_OUT_OF_SCOPE = [
  "custom-css",
  "template-gallery",
  "external-import",
  "deep-nesting",
  "media-library-full",
  "style-translation",
  "new-public-routes",
] as const;

// ---------------------------------------------------------------------------
// (١٣) أنواع الشاشة — ما تقرؤه مكوّنات المنشئ
// ---------------------------------------------------------------------------

/** كتلة كما يعرضها المنشئ (لقطةً أو حيّة) */
export type BuilderBlock = {
  id: string;
  pageId: string;
  parentId: string | null;
  type: BuilderBlockType;
  content: Record<string, unknown>;
  sort: number;
  visible: boolean;
  /** الأبناء مرتّبين — فارغة لغير `layout` */
  children: BuilderBlock[];
};

export type BuilderPage = {
  id: string;
  slug: string;
  kind: PageKind | "landing";
  title: string;
  published: boolean;
  /** اللقطة المفتوحة للتحرير — `null` = لا مسودة، الحيّ هو المعروض */
  draftRevisionId: string | null;
  /** فرقٌ بين المسودة والمنشور؟ يُحسب في القاعدة لا بمقارنة في المتصفح */
  hasUnpublishedChanges: boolean;
  blocks: BuilderBlock[];
  access: BuilderAccess;
};

/**
 * صفٌّ في كتالوج القاعدة `block_registry`. **مرآةٌ لـ`BLOCK_CATALOGUE`**،
 * والاختبار يقارنهما ويفشل عند الانحراف — نسختان تنحرفان يوم تُضاف كتلة
 * (النمط ٤ في `LESSONS.md`).
 */
export type BlockRegistryRow = {
  type: string;
  role: BlockRole;
  placement: BlockPlacement;
  accepts_children: boolean;
  max_children: number | null;
  text_fields: string[];
  item_fields: string[] | null;
  required_fields: string[];
  enabled: boolean;
};

/** بحثٌ سريع عن تعريف كتلة — المصدر الوحيد في طبقة TypeScript */
export function blockDef(type: string): BlockDef | null {
  return BLOCK_CATALOGUE.find((b) => b.type === type) ?? null;
}

/**
 * هل تُصيَّر هذه الكتلة أصلاً؟ **نفس المنطق الذي تنفّذه العارضة** — يُستعمل في
 * المعاينة وفي بوابة النشر معاً، فلا يختلف حكمُ الشاشة عن حكم الصفحة.
 */
export function blockRenders(type: string, content: Record<string, unknown>): boolean {
  const def = blockDef(type);
  if (!def) return false;
  for (const field of def.requiredFields) {
    const value = content[field];
    if (field === ITEMS_FIELD) {
      if (!Array.isArray(value) || value.length === 0) return false;
      continue;
    }
    if (typeof value !== "string" || value.trim() === "") return false;
  }
  return true;
}
