/**
 * عقد وكيل الذكاء الاصطناعي (المرحلة ١١) — المرجع الأوحد.
 *
 * من VISION.md: «استخدام **وكيل ذكاء اصطناعي داخلي** يدير النظام ويتعامل مع
 * الخدمات المختلفة ويحدّث الـ SEO والـ Metadata بشكل دوري»، ومن ملحق القرارات
 * البند ٥ — وهو نصّ D-37: «يعمل **بنظامين: أوتوماتيكي، ويدوي يتطلب موافقة** —
 * قابلان للضبط».
 *
 * ── خمس قواعد تحكم التصميم ─────────────────────────────────────────────────
 *
 * (١) **الوضع لكل قدرة على حدة، لا للوكيل ككل.** D-37. ومعه قاعدة لا يذكرها
 *     القرار وتُستمد من سوابق المشروع: **كل قدرة تُبذَر في الوضع اليدوي**،
 *     وتفعيل الأوتوماتيكي فعل بشري صريح لكل قدرة. (نفس منطق D-25 حيث النشر
 *     التلقائي للترجمة مطفأ، وD-31 حيث بوابة الاختبار معطَّلة في البذرة.)
 *
 * (٢) **ما لا يُتراجع عنه لا يعمل أوتوماتيكياً — بحاجز لا بتعليق.** لكل قدرة
 *     `reversibility`، و`none` ممنوعة من الوضع الأوتوماتيكي **في القاعدة**
 *     لا في طبقة التطبيق. الخارطة تشترط «تراجع عن أي تغيير»، والواقع أن فئة
 *     كاملة لا تُتراجع بطبعها: إشعار أُرسل، نداء خارجي، سعر رآه عميل فحجز عليه.
 *     إنكار ذلك يجعل الشرط شعاراً. (سابقة D-31: حارسان مستقلان لا تعليق يرجو.)
 *
 * (٣) **السرّ في البيئة، وما ليس سرّاً في اللوحة.** مفتاح المزوّد في
 *     `ANTHROPIC_API_KEY` / `OPENAI_API_KEY`، ولا يدخل القاعدة ولا يُعرض في
 *     شاشة ولا جزءاً منه. اللوحة تدير المزوّد والموديل والأوضاع والسقوف.
 *     **تصحيح لازم:** `docs/ROADMAP.md` (المرحلة ١١) و`handover/OPEN_TASKS.md`
 *     يقولان «مفتاح مشفر» — وهذا طموح لا بنية له: لا `pgcrypto` ولا `vault`
 *     ولا جدول أسرار في المستودع كله، ومفاتيح بوابات الدفع نفسها في البيئة
 *     (`lib/payments-types.ts:13`). ولو شُفِّر في القاعدة لبقي المفتاح الرئيس
 *     في البيئة، فالمكسب «إدخاله من اللوحة» لا سرّية أعلى — بثمن بنية جديدة
 *     بلا سابقة. الحسم: البيئة، ويُصحَّح سطر الخارطة.
 *
 * (٤) **لا يمكن تسريب عمود غير موجود.** طبقة أدوات الوكيل تُبنى بحيث لا تحمل
 *     أنواعُ إرجاعها أصلاً: اسم عميل ولا هاتفه ولا بريده، ولا هوية متعهد ولا
 *     تكلفته، ولا هامش الموقع. لا تنقيح انضباطي — غياب بنيوي. (سابقة D-18.)
 *     والسبب أن كل ما تعيده أداة يخرج في نصّ الطلب إلى مزوّد خارجي؛ وهو تسريب
 *     أوسع من D-44 لأنه لا يقف عند ما تعرضه صفحة.
 *
 * (٥) **الوكيل لا يكتب في جدول حيّ مباشرة أبداً.** يقترح عبر `agent_actions`،
 *     والتطبيق يمرّ بدالة واحدة تسجّل اللقطة قبل وبعد. ولا يكتب بحرية إلا في
 *     `agent_knowledge` — وهو ما يحقق «يستطيع الوكيل تحديثها بشكل كامل» في
 *     الرؤية دون فتح `tariffs` و`pricing_settings` على مصراعيهما.
 */

/** مزوّدو النماذج المدعومون — القيد نفسه في القاعدة حرفاً بحرف */
export type AgentProvider = "anthropic" | "openai";

/** أسماء متغيّرات البيئة لكل مزوّد — تُعرض **أسماؤها** عند النقص، لا قيمها */
export const AGENT_PROVIDER_ENV: Record<AgentProvider, string[]> = {
  anthropic: ["ANTHROPIC_API_KEY"],
  openai: ["OPENAI_API_KEY"],
};

/**
 * جاهزية المزوّد — على نسق `providerReadiness` في المرحلة ٩ حرفياً:
 * تُرجع أسماء الناقص ولا تلمس قيمة مفتاح مضبوط. شاشة تعرض جزءاً من مفتاح
 * سرّي تسرّبه في أول لقطة شاشة تُرسل للدعم.
 */
export type AgentReadiness = {
  provider: AgentProvider;
  ready: boolean;
  missingEnv: string[];
};

/** قدرات الإطلاق الأربع — الأسماء موحّدة عبر القاعدة والكود واللوحة */
export type AgentCapability =
  | "seo_review" // مراجعة السيو والميتاداتا دورياً باقتراحات
  | "health_watch" // مراقبة جاهزية البوابات والربط الخارجي
  | "error_triage" // فرز إشارات الفشل وتنبيه التشغيل
  | "peak_toggle" // تفعيل عمولة الذروة أو إطفاؤها
  | "knowledge_sync"; // تحديث قاعدة المعرفة من الجداول الحية

/**
 * قابلية التراجع — تحدَّد لكل قدرة في جدول ثابت تبذره الهجرة، ولا تُترك للوحة.
 *
 *   full         — لقطة سابقة تُعاد كما هي (ميتاداتا صفحة، مفتاح الذروة)
 *   compensating — لا يُمحى بل يُقابَل بقيد مضاد (سابقة `reverse_ledger_entry`)
 *   none         — لا رجعة: إشعار أُرسل، نداء خارجي، أثر غادر النظام
 */
export type Reversibility = "full" | "compensating" | "none";

/** وضع القدرة — D-37. الافتراض عند البذر `manual` بلا استثناء */
export type CapabilityMode = "manual" | "auto";

export type CapabilityDef = {
  capability: AgentCapability;
  label: string;
  reversibility: Reversibility;
  /** أثر الخطأ في هذه القدرة بلغة المالك — يظهر بجانب مفتاح الوضع في اللوحة */
  risk: string;
};

/**
 * الكتالوج الثابت. `reversibility` هنا **ليست تفضيلاً** — تقابلها قيم مبذورة
 * في القاعدة، والقاعدة ترفض `mode='auto'` على أي قدرة قيمتها `none`.
 */
export const AGENT_CAPABILITIES: CapabilityDef[] = [
  {
    capability: "seo_review",
    label: "مراجعة السيو والميتاداتا",
    reversibility: "full",
    risk: "كتابة ميتاداتا خاطئة على صفحات منشورة — تُستعاد من اللقطة السابقة.",
  },
  {
    capability: "health_watch",
    label: "مراقبة جاهزية البوابات والربط",
    reversibility: "none",
    risk: "قراءة محضة، لكن أثرها إشعار مُرسَل لا يُستردّ — فلا تعمل أوتوماتيكياً بلا مفتاح إفلات.",
  },
  {
    capability: "error_triage",
    label: "فرز إشارات الفشل والتنبيه",
    reversibility: "none",
    risk: "إنذار كاذب متكرر يُفقد التنبيه معناه — نفس درس المرحلة ٩: إنذار يرن دائماً لا يُسمع.",
  },
  {
    capability: "peak_toggle",
    label: "عمولة الذروة",
    reversibility: "full",
    risk: "تصيب كل عرض سعر جديد فوراً — والحجوزات القائمة محميّة بلقطة السعر (D-10).",
  },
  {
    capability: "knowledge_sync",
    label: "تحديث قاعدة المعرفة",
    reversibility: "full",
    risk: "معرفة قديمة تُنتج اقتراحات خاطئة لاحقاً — تُستعاد من اللقطة.",
  },
];

/**
 * حدود الوكيل — تُدار من اللوحة، وتُفرض في القاعدة لا في طبقة الوكيل.
 * سابقة D-13 (سقف ميزانية شهري لمزوّد خارجي مدفوع) وD-16 (الأرضية في SQL).
 */
export type AgentLimits = {
  /** سقف إنفاق شهري تقديري بالدولار — تجاوزه يوقف الاستدعاءات لا ينبّه فقط */
  monthlyBudgetUsd: number;
  /** أقصى نسبة ذروة يجوز للوكيل ضبطها — أدنى من سقف اللوحة البشري */
  maxPeakPercent: number;
  /** الذروة التي يفعّلها الوكيل تنتهي تلقائياً بعد هذه المدة */
  peakExpiryHours: number;
  /** نافذة كتم التنبيه المكرر لنفس المفتاح */
  alertDedupeMinutes: number;
};

export const DEFAULT_AGENT_LIMITS: AgentLimits = {
  monthlyBudgetUsd: 20,
  maxPeakPercent: 25,
  peakExpiryHours: 24,
  alertDedupeMinutes: 120,
};

/** حالة الإجراء — الانتقالات كلها بدوال، ولا `update` مباشر على السجل */
export type ActionStatus =
  | "proposed" // اقتراح ينتظر (الوضع اليدوي)
  | "approved" // وافق عليه بشر ولم يُطبَّق بعد
  | "rejected" // رُفض — يبقى في السجل ولا يُحذف
  | "applied" // طُبِّق
  | "reverted" // تُوجِع عنه
  | "failed"; // فشل التطبيق

/**
 * إجراء واحد في السجل. `before`/`after` لقطتان كاملتان — هما آلية التراجع
 * الوحيدة، لأن `pages` و`pricing_settings` بلا جدول تاريخ في المستودع.
 */
export type AgentAction = {
  id: string;
  agentId: string;
  capability: AgentCapability;
  status: ActionStatus;
  /** ما مسّه الإجراء بصيغة قابلة للقراءة: `pages/cairo-alexandria` مثلاً */
  target: string;
  before: unknown;
  after: unknown;
  /** لماذا اقترحه الوكيل — إلزامي، ويظهر في طابور الموافقة */
  reason: string;
  createdAt: string;
  appliedAt: string | null;
};

/**
 * تواقيع Postgres (هجرة 0025) — **هذا الملف هو المرجع الأوحد لأسمائها.**
 * أي دالة تُولد بعده تُضاف هنا في نفس الالتزام (درس المرحلة ١٠: عقد ناقص
 * يجعل الجلسة التالية تعيد بناء ما هو موجود).
 *
 *   agents                      — نسخ الوكلاء: المزوّد والموديل والتفعيل والحدود
 *   agent_capability_catalog    — الكتالوج الثابت أعلاه مبذوراً، بقابلية التراجع
 *   agent_capabilities          — وضع كل قدرة لكل وكيل (مع حاجز auto/none)
 *   agent_actions               — السجل append-only بلقطتَيه
 *   agent_knowledge             — المخزن الوحيد الذي يكتب فيه الوكيل بحرية
 *
 *   agent_propose(p_agent uuid, p_capability text, p_target text,
 *                 p_before jsonb, p_after jsonb, p_reason text) returns uuid
 *       — نقطة الدخول الوحيدة. تقرأ وضع القدرة: `auto` ⇒ تطبّق وتسجّل،
 *         و`manual` ⇒ تترك الصف `proposed`.
 *   agent_approve(p_action uuid, p_actor uuid) returns jsonb
 *   agent_reject(p_action uuid, p_actor uuid, p_note text) returns jsonb
 *   agent_apply(p_action uuid) returns jsonb
 *   agent_revert(p_action uuid, p_actor uuid, p_note text) returns jsonb
 *       — تعيد لقطة `before`، وتكتب صفاً جديداً. لا `update` ولا `delete`.
 *   agent_knowledge_upsert(p_topic text, p_key text, p_value jsonb) returns uuid
 *   v_stats_agent               — إحصائيات قسم الوكيل (اعتبار ٦: بلا استثناء)
 *
 * وتُوسَّع `section_stats` بقسم سابع `agent`.
 */

/** ما يُصدَّر في حزمة العلامة (المرحلة ١٤) وما لا يُصدَّر — يُحسم الآن لا لاحقاً */
export const AGENT_EXPORTABLE = {
  /** يُصدَّر: التكوين والمعرفة */
  include: ["agents", "agent_capabilities", "agent_knowledge"],
  /** لا يُصدَّر أبداً: سجل إجراءات نسخة أخرى ليس تاريخ هذه النسخة */
  exclude: ["agent_actions"],
  /** ولا يُصدَّر ولا يوجد أصلاً في القاعدة: المفتاح */
  neverInDatabase: ["ANTHROPIC_API_KEY", "OPENAI_API_KEY"],
} as const;
