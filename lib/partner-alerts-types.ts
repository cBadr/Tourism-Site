/**
 * عقد تنبيهات المتعهدين — الموجة الثالثة، المرحلتان 🅱 و🅳 من
 * `docs/phase-briefs/FAILED-TRIPS-AND-PARTNER-ALERTS.md`.
 *
 * يُقرأ قبل لمس أي شيء في `lib/notifications/` أو `supabase/migrations/0054*`.
 *
 * ── لماذا وُجد هذا الملف أصلاً ───────────────────────────────────────────────
 *
 * `notification_channels()` **عامّة**: تقرأ إعدادات المالك وتقرّر القنوات
 * **للجميع**. فصفُّ إشعارٍ موجَّه إلى متعهد يحمل قنوات المالك لا قنواته هو —
 * ومن هنا جاء العيب المقيس: عرضُ الرحلة لا يصل أحداً. التوجيه هنا يصير
 * **لكل مستقبِل**، وكل ما بعده يركب على هذا.
 *
 * ── ثلاثة تمييزات تحمل التصميم كله ──────────────────────────────────────────
 *
 * 1. **«مطلوبة» ≠ «بالغة»**: القناة قد تكون مطلوبةً في صفّ الإشعار ثم لا يبلغ
 *    صاحبَها شيء (لا معرّف · لا مزوّد · مطفأة). و«بالغ» وحده ما يمنع التصعيد.
 * 2. **`inbox` و`dashboard` لا يجعلان أحداً بالغاً** — كلاهما يستلزم أن **ينظر**
 *    صاحبه. اعتبارهما بلوغاً يعني «أُرسل إليه» عن شيءٍ قد لا يفتحه أبداً،
 *    فيصمت الاحتياطي في الحالة التي وُجد لها بالضبط (ج٣ في الموجز).
 * 3. **البريد مصمَّمٌ ومطفأ**: القناة كاملة في العقد وفي القاعدة، وجاهزيتها
 *    تُقاس من البيئة (`RESEND_API_KEY`) **ولا تُدَّعى**. جدول `notification_providers`
 *    يحمل ما قِيس، والقاعدة تقرؤه فلا تحسب قناةً ميتة بلوغاً.
 */

// ---------------------------------------------------------------------------
// (١) القنوات
// ---------------------------------------------------------------------------

/**
 * قنوات المتعهد الأربع. الترتيب هو ترتيب الأفضلية عند العرض لا عند التسليم
 * (التسليم متوازٍ على كل قناة مطلوبة).
 *
 * ⚠ `whatsapp` **مؤجَّلة باتفاق** (١-ح): تستلزم BSP وقوالب معتمدة من Meta
 * ورسوماً لكل رسالة. ومكانها محفوظ هنا في تعليقٍ لا في نوعٍ حيّ، فإضافتها
 * لاحقاً سطرٌ واحد ولا يُعاد بناء شيء.
 */
export const PARTNER_CHANNELS = ["telegram", "webpush", "inbox", "email"] as const;
export type PartnerChannel = (typeof PARTNER_CHANNELS)[number];

/**
 * القنوات التي **تبلغ** صاحبها بلا أن ينظر — وهي وحدها ما يُحسب في عامل
 * «بالغ». `inbox` خارجها بقرار، لا بسهو.
 */
export const REACHING_CHANNELS: readonly PartnerChannel[] = ["telegram", "webpush", "email"];

export function isPartnerChannel(value: string): value is PartnerChannel {
  return (PARTNER_CHANNELS as readonly string[]).includes(value);
}

export function isReachingChannel(value: string): boolean {
  return (REACHING_CHANNELS as readonly string[]).includes(value);
}

// ---------------------------------------------------------------------------
// (٢) تفضيلات المتعهد — صفّ `partner_alert_prefs`
// ---------------------------------------------------------------------------

/**
 * صف التفضيلات كما يصل من القاعدة (snake_case).
 *
 * 🔒 **الغياب ليس صمتاً**: متعهدٌ بلا صفٍّ هنا تُطبَّق عليه الافتراضات
 * (كل القنوات مفعَّلة · يستقبل الطلبات). لو كان الغياب يعني «مطفأ» لأفرغ أولُ
 * نشرٍ حوضَ البث كلَّه بلا سطرٍ واحد يقول لماذا.
 */
export type PartnerAlertPrefsRow = {
  subcontractor_id: string;
  telegram_enabled: boolean;
  webpush_enabled: boolean;
  inbox_enabled: boolean;
  email_enabled: boolean;
  /** مفتاح «راغب» بيد المتعهد — العامل الثاني في الإتاحة (١-و) */
  accepting_offers: boolean;
  updated_at: string;
};

/** الافتراضات المطبَّقة حين لا يوجد صف — نسخةٌ واحدة من الحقيقة في الطبقتين */
export const DEFAULT_PARTNER_PREFS: Omit<PartnerAlertPrefsRow, "subcontractor_id" | "updated_at"> = {
  telegram_enabled: true,
  webpush_enabled: true,
  inbox_enabled: true,
  email_enabled: true,
  accepting_offers: true,
};

// ---------------------------------------------------------------------------
// (٣) الإتاحة بعاملين (١-و)
// ---------------------------------------------------------------------------

/**
 * حالة إتاحة متعهد. **بالغٌ × راغب** — وكلاهما شرط.
 *
 * وإطفاءُ كل القنوات = **غير متصل**، لا «متصلٌ بلا إشعارات»: فلا يصير «لم
 * يصلني عرض» عذراً دائماً.
 */
export type PartnerAvailability = {
  subcontractorId: string;
  /** له قناةٌ **بالغة** واحدة على الأقل (تليجرام أو دفع الويب أو بريد جاهز) */
  reachable: boolean;
  /** مفتاحه هو: يستقبل الطلبات الآن؟ */
  willing: boolean;
  /** `reachable && willing` — وهو ما يقرؤه حوض البث */
  available: boolean;
  /** القنوات البالغة فعلاً الآن، للعرض في شاشة «مَن يسمع الآن» */
  reachingChannels: PartnerChannel[];
};

/**
 * سبب عدم الإتاحة — **رمزٌ لا جملة** (🔒 قاعدة المشروع: الخادم يرسل رمزاً
 * والواجهة تترجمه، وإلا ظهرت العربية على `/en`).
 */
export const UNAVAILABLE_CODES = [
  "no-channel", // أطفأ كل قنواته البالغة أو لا عنوان له على أيٍّ منها
  "no-telegram-id", // فعّل تليجرام ولم يسجّل معرّف محادثة
  "no-push-subscription", // فعّل دفع الويب ولا اشتراك جهازٍ واحد
  "email-provider-dark", // فعّل البريد والمزوّد غير مضبوط في البيئة
  "not-accepting", // أوقف استقبال الطلبات بنفسه
] as const;
export type UnavailableCode = (typeof UNAVAILABLE_CODES)[number];

// ---------------------------------------------------------------------------
// (٤) وجهة الإشعار — امتداد صفّ `notifications` لا جدولٌ جديد
// ---------------------------------------------------------------------------

/**
 * لمن هذا الصف؟ عمودان يُضافان إلى `notifications`:
 * `recipient_kind` و`recipient_id`. والقنوات تُحسب من المستقبِل لا من المالك.
 */
export type RecipientKind = "ops" | "partner";

export type NotificationRecipient =
  | { kind: "ops" }
  | { kind: "partner"; subcontractorId: string };

// ---------------------------------------------------------------------------
// (٥) جاهزية المزوّدين — ما قِيس من البيئة، مكتوباً لتقرأه القاعدة
// ---------------------------------------------------------------------------

/**
 * القاعدة لا تقرأ `process.env`. فبلا هذا الجدول تحسب القاعدةُ البريدَ قناةً
 * بالغة بينما لا مزوّد له، فتَعُدّ متعهداً «متاحاً» وهو لا يسمع شيئاً.
 *
 * **الكاتب الوحيد `service_role`** من طبقة التسليم، على كل دورة عامل: القيمة
 * **مقيسة** من البيئة لا مُدخَلة من شاشة — ومفتاحٌ يُضاف غداً يقلبها بلا هجرة.
 */
export type ProviderChannel = Extract<PartnerChannel, "telegram" | "email" | "webpush">;

export type NotificationProviderRow = {
  channel: ProviderChannel;
  ready: boolean;
  /** ما ينقص بالضبط — رمزُ متغيّر البيئة، لا جملة */
  missing_env: string[];
  updated_at: string;
};

/** متغيّرات البيئة التي تُقاس لكل مزوّد — مصدرٌ واحد للطبقتين */
export const PROVIDER_ENV: Record<ProviderChannel, string[]> = {
  telegram: ["TELEGRAM_BOT_TOKEN"],
  email: ["RESEND_API_KEY"],
  webpush: ["VAPID_PUBLIC_KEY", "VAPID_PRIVATE_KEY", "VAPID_SUBJECT"],
};

// ---------------------------------------------------------------------------
// (٦) اشتراك دفع الويب
// ---------------------------------------------------------------------------

/**
 * اشتراك جهازٍ واحد. متعهدٌ له هاتفٌ وحاسوب = صفّان.
 *
 * ⚠ `endpoint` **معرّفٌ فريد ومفتاحٌ سرّي معاً**: من يملكه يرسل إلى الجهاز.
 * فلا يُعاد إلى أي واجهة ولا يدخل أي حمولة — ولذلك لا يظهر في نوع الإرجاع
 * الذي يقرؤه البورتال أدناه (اتفاقية ٧: ما لا يوجد في نوع الإرجاع لا يُسرَّب).
 */
export type PushSubscriptionRow = {
  id: string;
  subcontractor_id: string;
  endpoint: string;
  p256dh: string;
  auth: string;
  user_agent: string | null;
  created_at: string;
  last_seen_at: string | null;
};

/** ما يراه المتعهد عن أجهزته: عدٌّ ووصفٌ، بلا مفتاح واحد */
export type PushDeviceView = {
  id: string;
  label: string | null;
  createdAt: string;
  lastSeenAt: string | null;
};

// ---------------------------------------------------------------------------
// (٧) صندوق البورتال
// ---------------------------------------------------------------------------

/**
 * صندوق الوارد **ليس جدولاً جديداً**: هو `notifications` نفسه مقروءاً بدالة
 * `security definer` بإسقاطٍ آمن (`portal_inbox()`).
 *
 * 🔒 **ولماذا دالة لا سياسة `SELECT`؟** لأن `notifications` يحمل صفوفاً
 * تشغيلية فيها اسم العميل وهاتفه وإجمالي حجزه — وPostgres **لا يملك RLS على
 * مستوى العمود**. فسياسةٌ واحدة تفتح الجدول كله. القاعدة نفسها المكتوبة عن
 * `bookings` في `handover/INDEX.md`، وتنطبق هنا حرفياً.
 */
export type PortalInboxItem = {
  id: string;
  /** رمز الحدث — الواجهة تترجمه، والخادم لا يؤلّف جملة */
  event: string;
  bookingReference: string | null;
  offerId: string | null;
  createdAt: string;
  readAt: string | null;
  /** حمولةٌ **عامة** فقط (`dispatch_trip_payload(_, true)`) — بلا عميل ولا إجمالي */
  summary: Record<string, unknown>;
};

// ---------------------------------------------------------------------------
// (٨) حصيلة التوجيه — ما تُرجعه طبقة التسليم عن صفٍّ واحد
// ---------------------------------------------------------------------------

/**
 * لماذا صعد الإشعار إلى التشغيل؟ رمزٌ واحد يُخزَّن ويُعرض.
 * 🔒 والحارس نفسه **قائمٌ منذ هذه الجلسة ويجب أن يبقى**: متعهدٌ تعذّر بلوغه على
 * كل قناةٍ اختارها ⇒ الإشعار إلى فريق التشغيل ليبلّغه هاتفياً، **لا يُبتلع**.
 */
export const ESCALATION_CODES = [
  "partner-unreachable", // لا قناة بالغة له وقت التسليم
  "partner-not-found", // معرّف مستقبِلٍ لا يقابل متعهداً (بيانات قديمة)
] as const;
export type EscalationCode = (typeof ESCALATION_CODES)[number];

/** ما تحتاجه طبقة التسليم عن مستقبِلٍ واحد — تُقرأ دفعةً واحدة لكل دورة */
export type PartnerRoutingRow = {
  subcontractorId: string;
  companyName: string;
  telegramChatId: string | null;
  email: string | null;
  prefs: Omit<PartnerAlertPrefsRow, "subcontractor_id" | "updated_at">;
  pushEndpoints: number;
};

// ---------------------------------------------------------------------------
// (٩) ارتباط المحادثة — محادثةٌ واحدة = مستقبِلٌ واحد (0057)
// ---------------------------------------------------------------------------

/**
 * لماذا وُجد هذا القسم؟ لأن العمود `subcontractors.telegram_chat_id` وُلد في
 * `0054` **بلا قيدٍ واحد** (مقيسٌ من `pg_indexes` و`pg_constraint`، لا من ملف
 * الهجرة — D-58): لا فهرسَ فريداً ولا مُشغِّل. فكان تصادمان ممكنين، وهما ليسا
 * سواءً:
 *
 * | التصادم | ما يتسرّب |
 * |---|---|
 * | متعهدان يتقاسمان محادثة | كلٌّ يقرأ **مستحق** الآخر ⇒ تكاليف منافسه (D-20) |
 * | متعهدٌ = وجهةُ **فريق التشغيل** | 🔴 رسائل التشغيل فيها اسم العميل وهاتفه و**سعر العميل والهامش المحقق** ⇒ نقضٌ مباشر لـ**D-19** |
 *
 * ورسالةُ المتعهد مُنقّاةٌ بالبناء (ترويسة `lib/dispatch/messages.ts`)، ورسالةُ
 * التشغيل ليست كذلك — وطبقةُ التسليم تقرأ لكلٍّ وجهتَه **ولا تقارنهما أبداً**.
 * فالحارس يجب أن يكون في القاعدة على **الجدول**، لا في المسار الذي نتذكّره.
 */

/**
 * رموز رفض الارتباط. 🔒 **رمزٌ لا جملة**: القاعدة ترفعها في `hint`، والواجهة
 * وحدها تؤلّف العربية — وإلا وصل الشريكَ نصُّ Postgres الخام
 * («duplicate key value violates unique constraint»).
 */
export const TELEGRAM_BIND_CODES = [
  /** المحادثة مربوطة بمتعهدٍ آخر — والقرار **رفضٌ لا نقل** (انظر أدناه) */
  "telegram-taken",
  /** المحادثة هي وجهة إشعارات فريق التشغيل — أخطر الشقّين */
  "telegram-is-ops",
  /** الاتجاه المعاكس: المالك يضبط وجهة التشغيل على محادثةِ متعهدٍ مربوط */
  "ops-telegram-taken",
] as const;
export type TelegramBindCode = (typeof TELEGRAM_BIND_CODES)[number];

export function isTelegramBindCode(value: unknown): value is TelegramBindCode {
  return typeof value === "string" && (TELEGRAM_BIND_CODES as readonly string[]).includes(value);
}

/**
 * قراءة رمز الرفض من خطأ القاعدة.
 *
 * 🔒 **ولا تقرأ نصّ الرسالة أبداً** — النصّ عربيٌّ للسجل ومحرر SQL، ومطابقتُه
 * تنكسر بأول تحسينٍ لصياغته (النمط ١٩ في `INDEX.md`: الكاشف الذي يقرأ النصّ
 * يكذب في الاتجاهين). القناتان المقروءتان اثنتان لا ثالث لهما:
 *   • `hint` — رمزُ المُشغِّل، وهو المسار العادي.
 *   • `23505` — الفهرس الفريد، ولا يُرى إلا في **سباقٍ حقيقي**: نقرتان
 *     متزامنتان تمرّان معاً من `exists` في المُشغِّل ولا تمرّان من الفهرس.
 *     وسقوطُه على `telegram-taken` هو معناه بالضبط.
 */
export function readTelegramBindCode(error: unknown): TelegramBindCode | null {
  if (typeof error !== "object" || error === null) return null;
  const e = error as { hint?: unknown; code?: unknown };
  if (isTelegramBindCode(e.hint)) return e.hint;
  return e.code === "23505" ? "telegram-taken" : null;
}
