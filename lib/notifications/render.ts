import {
  formatMoney,
  hoursText,
  passengersLabel,
  toArabicDigits,
} from "@/components/booking/format";
import { MAX_PLACE_LABEL_LENGTH, sanitizeLine } from "@/lib/booking-types";
import { siteTimeZone } from "@/lib/site-timezone";

/**
 * صياغة نص الإشعار بالعربية — وحدة محايدة (بلا استيراد خادمي) يستعملها
 * عامل الإرسال في الخادم وجرس اللوحة في المتصفح معاً.
 *
 * قاعدتان تحكمان هذا الملف:
 * ١) لا اسم علامة ولا رقم تواصل مكتوب هنا — كله يصل عبر `ctx` من الإعدادات.
 * ٢) الحمولة (`payload`) يكتبها مُنتِج الإشعار في SQL، فنقرأها بتسامح: نقبل
 *    الاسم بصيغة snake_case وcamelCase معاً، ونتخطى أي حقل غائب بلا انهيار.
 *    رسالة ناقصة سطراً أفضل من إشعار لا يصل.
 */

export type MessageLine = { label: string; value: string };

export type RenderedMessage = {
  /** رمز تعبيري واحد يميّز نوع الحدث في تليجرام وفي الجرس */
  emoji: string;
  /** عنوان قصير — «حجز جديد بانتظار التحويل» */
  title: string;
  /** جملة بشرية كاملة تشرح ما حدث وما المطلوب */
  lead: string;
  lines: MessageLine[];
  /** رابط المتابعة — مطلق في الرسائل الخارجية ونسبي في اللوحة */
  link: { label: string; href: string } | null;
  reference: string | null;
};

export type RenderContext = {
  /** اسم العلامة من الإعدادات — لا قيمة افتراضية في الكود */
  brandName: string;
  /** عملة العرض من `pricing_settings` */
  currency: string;
  /** أصل الموقع بلا شرطة في النهاية — يُترك فارغاً لروابط نسبية (اللوحة) */
  baseUrl?: string;
};

/**
 * ═══════════════════════════════════════════════════════════════════════════
 *  خريطة الأحداث — **مصدرٌ واحد للعنوان والإيموجي معاً**
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * ── لماذا صفٌّ واحد بحقلين لا خريطتان متوازيتان ─────────────────────────────
 *
 * كانت `EVENT_TITLES` و`EVENT_EMOJI` خريطتين مستقلتين بالمفاتيح نفسها، فيُضاف
 * الحدث إلى إحداهما ويُنسى في الأخرى **بلا خطأ بناءٍ ولا اختبارٍ يسقط**. وهو
 * النمط ٨ في `LESSONS.md` حرفياً — مصدران لشيءٍ واحد ينحرفان حتماً. والآن
 * النوعُ نفسه يفرض الحقلين معاً: صفٌّ ناقصٌ **لا يُبنى**.
 *
 * ── 🔴 والنقصُ المقيس الذي وُلدت منه هذه الكتلة ──────────────────────────────
 *
 * قِيس على القاعدة الحيّة بـ`pg_get_functiondef` على كل دوال `public`: تبعث
 * الدوالُ **سبعة عشر** حدثاً، وكان لتسعةٍ منها عنوانٌ فقط. فثمانيةٌ تصل الجرسَ
 * وتليجرام والبريد بعنوان «إشعار جديد» لا يميّزها عن حجزٍ عاديّ:
 *
 *   `trip_completion_requested` · `trip_completion_approved` ·
 *   `trip_completion_rejected` · `trip_withdrawn_manual` ·
 *   `trip_withdrawn_rebroadcast` · `partner_grievance_filed` ·
 *   `partner_grievance_resolved` · `ops_job_failed`
 *
 * 🚨 **وأخطرها `ops_job_failed`: هو الجرسُ الوحيد** الذي يقول إن
 * `settle_due_completions` أو `expire_loyalty_points` سقطت داخل `dispatch_tick`
 * (‏نداءان مقيسان في جسمها، كلٌّ في `exception when others`). أي أن عطلاً في
 * مالٍ مجدولٍ كان يبدو في الجرس كأنه حجزٌ جديد.
 *
 * ── والحارس الذي يمنع عودته ─────────────────────────────────────────────────
 *
 *   `node scripts/check-notification-event-titles.mjs`
 *
 * يقرأ `pg_get_functiondef` من **القاعدة الحيّة** (‏D-58) فيستخرج ما تبعثه
 * الدوالُ فعلاً، ويقابله بمفاتيح هذه الخريطة، ويحمرّ على أي حدثٍ بلا عنوان —
 * وعلى أي مفتاحٍ هنا لا تبعثه دالة. والاكتشافُ اليدوي وقع مرّتين؛ الثالثة
 * تمسكها الآلة.
 */
type EventMeta = {
  /** عنوان قصير عربيّ — يظهر في الجرس وفي جدول الإشعارات وفي موضوع البريد */
  title: string;
  /** رمزٌ واحد يميّز نوع الحدث قبل أن يُقرأ العنوان */
  emoji: string;
};

export const EVENT_META: Record<string, EventMeta> = {
  booking_created: { title: "حجز جديد بانتظار التحويل", emoji: "🚗" },
  receipt_uploaded: { title: "إيصال تحويل بانتظار المراجعة", emoji: "🧾" },
  booking_confirmed: { title: "تم تأكيد الحجز", emoji: "✅" },
  booking_cancelled: { title: "تم إلغاء الحجز", emoji: "🚫" },
  quote_requested: { title: "طلب عرض سعر جديد", emoji: "📝" },

  // أحداث البث والإسناد (المرحلة ٦) — بدونها تظهر كلها بعنوان «إشعار جديد»
  trip_offered: { title: "عرض رحلة جديد على المتعهدين", emoji: "📢" },
  trip_assigned: { title: "تم إسناد الرحلة إلى متعهد", emoji: "🤝" },
  dispatch_round_expired: { title: "انتهت مهلة موجة البث", emoji: "⏳" },
  dispatch_exhausted: { title: "لم يقبل أي متعهد — إسناد يدوي", emoji: "🆘" },

  // ── إغلاق الرحلة: إعلانُ المتعهد وقرارُ الإدارة (‏`request_trip_completion`
  //    و`decide_trip_completion` و`settle_due_completions`) ──────────────────
  trip_completion_requested: {
    title: "المتعهد أعلن إتمام الرحلة — بانتظار الاعتماد",
    emoji: "🏁",
  },
  // يذهب إلى المتعهد نفسه، ولحظتُه هي التي يتحرك فيها الدفتر: مستحقُّه يُقيَّد
  // ونقاطُ العميل تُسكّ. فالرمز مالٌ لا علامةُ صح.
  trip_completion_approved: { title: "اعتُمد إتمام الرحلة — وتحرّك الدفتر", emoji: "💰" },
  trip_completion_rejected: { title: "رُفض إعلان إتمام الرحلة", emoji: "↩️" },

  // ── اعتذار المتعهد بعد القبول (‏`withdraw_from_trip`) — والوجهة تفرّق ──────
  //    «يدويّ» يعني: لا منفِّذ لهذه الرحلة الآن وينتظرها إنسان.
  trip_withdrawn_manual: { title: "اعتذر المتعهد — الرحلة إلى الإسناد اليدوي", emoji: "🛑" },
  trip_withdrawn_rebroadcast: { title: "اعتذر المتعهد — أُعيد بثّ الرحلة", emoji: "🔁" },

  // ── تظلّمات المتعهدين (‏`file_grievance` / `resolve_grievance`) ────────────
  partner_grievance_filed: { title: "تظلُّم جديد من متعهد", emoji: "🙋" },
  partner_grievance_resolved: { title: "صدر قرارٌ في تظلُّم المتعهد", emoji: "⚖️" },
  // 0135: المشرف يحرّر سعراً معتمَداً بالنقر ⇒ الرقمُ المُعلَن للمتعهد تغيّر،
  // وهو سندُ البند ٨. فالإشعارُ ليس تحسيناً بل شرطُ ألّا يتغيّر رقمُه بلا علمه.
  partner_price_edited: { title: "تعديلٌ على سعرٍ معتمَدٍ في قائمتك", emoji: "✏️" },

  // ── 🚨 جرسُ الأعطال — لا يشبه غيره بقصد ───────────────────────────────────
  //    مهمةٌ مجدولة سقطت داخل `dispatch_tick`. وهذا الصفُّ هو **الأثر الوحيد**
  //    الذي يصل إنساناً؛ ما عداه ابتلعته `exception when others` بهدوء.
  //    ⚠ ولا يُكرَّر الرمز داخل العنوان: الأسطح التي تعرضهما تعرضهما معاً
  //      (`{emoji} {title}` في الجرس وفي تليجرام)، فالتكرار يُنتج «🚨 🚨».
  ops_job_failed: { title: "عطل في مهمة مجدولة — تدخُّل فوري", emoji: "🚨" },

  // ── 👤 أحداثُ العميل (‏0131) — أوّلُ أحداثٍ في المنظومة يقرؤها **العميل** ──
  //
  // 🔒 ولماذا أسماءٌ مستقلّة لا الأسماءُ نفسها بجمهورٍ مختلف: العنوانُ يُقرأ في
  //    الجرس وفي تليجرام وفي بطاقة الجهاز، وهو **واحدٌ لكل حدث**. فـ
  //    `trip_assigned` عنوانُه «تم إسناد الرحلة إلى متعهد» — وكلمةُ «متعهد»
  //    نفسُها لا تُقال للعميل (**D-19**). ولو تشارك الجمهوران الاسمَ لَاحتاج
  //    العنوانُ أن يتفرّع بالجمهور، وحينها يصير مصدرين لشيءٍ واحد.
  //
  // ⚠ والرموزُ لا تشبه رموزَ التشغيل ولا بعضَها: الحارس
  //   `check:event-titles` يُحمِّر على أي رمزٍ مكرَّر، ولأن الأربعة تصل
  //   **شاشةَ قفلِ العميل** فتمييزُها قبل القراءة هو كلُّ فائدتها.
  customer_booking_confirmed: { title: "تأكّد حجزك", emoji: "🎉" },
  customer_trip_assigned: { title: "جهّزنا رحلتك", emoji: "🚙" },
  customer_trip_reminder: { title: "اقترب موعد رحلتك", emoji: "⏰" },
  customer_trip_completed: { title: "انتهت رحلتك — شكراً لك", emoji: "🧳" },
};

/**
 * أحداثُ العميل — **مصدرٌ واحد** يقرؤه الراسمُ وطبقةُ التسليم معاً.
 *
 * 🔒 وهي حارسٌ لا قائمةَ تصنيف: `renderNotification` يرفض أن يرسم **أي** حدثٍ
 * آخر لجمهور العميل (انظر الحارس في رأس الدالة). فحمولةُ `trip_assigned`
 * — وفيها `payout` و`realMargin` و`companyName` — لا تجد طريقاً إلى رسالةٍ
 * يقرؤها عميل حتى لو أخطأ مُوجِّهٌ يوماً وأعطاها جمهورَ العميل.
 */
export const CUSTOMER_EVENTS: readonly string[] = [
  "customer_booking_confirmed",
  "customer_trip_assigned",
  "customer_trip_reminder",
  "customer_trip_completed",
];

export function isCustomerEvent(event: string): boolean {
  return CUSTOMER_EVENTS.includes(event);
}

/**
 * عناوين الأحداث كما تظهر في الجرس وفي جدول الإشعارات.
 *
 * ⚠ **إسقاطٌ من `EVENT_META` لا مصدرٌ ثانٍ.** ويبقى مُصدَّراً لأن
 * `app/admin/notifications/page.tsx` يبني منه قائمة المرشِّحات
 * (`Object.keys`)، وترتيبُ الإدراج هنا هو ترتيبُها هناك.
 */
export const EVENT_TITLES: Record<string, string> = Object.fromEntries(
  Object.entries(EVENT_META).map(([event, meta]) => [event, meta.title])
);

export const EVENT_EMOJI: Record<string, string> = Object.fromEntries(
  Object.entries(EVENT_META).map(([event, meta]) => [event, meta.emoji])
);

/**
 * أثرُ سقوط كل مهمةٍ مجدولة — بالعواقب لا بالأسماء.
 *
 * المفاتيح هي قيم `'job'` في حمولة `ops_job_failed` كما تكتبها `dispatch_tick`
 * حرفياً (مقيسةٌ من `pg_get_functiondef`: نداءان لا ثالث لهما). ومهمةٌ تُضاف
 * غداً بلا سطرٍ هنا **لا تكسر شيئاً** — يسقط سطرُ الأثر وحده وتبقى المهمة
 * والسبب، وهو الاتجاه الآمن: إنذارٌ ناقصُ سطرٍ خيرٌ من إنذارٍ لا يصل.
 */
const OPS_JOB_IMPACT: Record<string, string> = {
  settle_due_completions:
    "طلبات إتمامٍ انقضت مهلتها لم تُعتمد — أي مستحقات متعهدين لم تُقيَّد ونقاط عملاء لم تُسكّ بعد.",
  expire_loyalty_points:
    "نقاط ولاءٍ بلغت أجلها لم تُطفأ — أي أن رصيداً كان يجب أن يسقط ما زال قابلاً للإنفاق.",
};

/** أسماء القنوات كما تظهر للمالك */
export const CHANNEL_LABELS: Record<string, string> = {
  dashboard: "لوحة التحكم",
  telegram: "تليجرام",
  email: "البريد",
  // قنوات المتعهد (0054) — بدونها تظهر بأسمائها الإنجليزية في شاشة الإشعارات
  webpush: "إشعار الجهاز",
  inbox: "صندوق البورتال",
  // قنوات العميل (0131) — أسماؤها مستقلّةٌ **بقصد**: لا يعرفها كودٌ منشورٌ قديم
  // فلا يسلّمها على وجهةِ مالكٍ أو متعهد. والشرحُ الكامل في ترويسة الهجرة.
  customer_inbox: "صندوق العميل",
  customer_push: "إشعار جهاز العميل",
  customer_whatsapp: "واتساب العميل",
};

/** أسماء حالات الطابور كما تظهر للمالك */
export const STATUS_LABELS: Record<string, string> = {
  queued: "في الطابور",
  sent: "تم الإرسال",
  skipped: "تم التجاوز",
  failed: "لم يتم الإرسال",
};

export function channelLabel(channel: string): string {
  return CHANNEL_LABELS[channel] ?? channel;
}

export function statusLabel(status: string): string {
  return STATUS_LABELS[status] ?? status;
}

export function eventTitle(event: string): string {
  return EVENT_TITLES[event] ?? "إشعار جديد";
}

export function eventEmoji(event: string): string {
  return EVENT_EMOJI[event] ?? "🔔";
}

// ---------------------------------------------------------------------------
// قراءة الحمولة بتسامح
// ---------------------------------------------------------------------------

type Payload = Record<string, unknown> | null | undefined;

/** يحوّل camelCase إلى snake_case حتى نبحث عن الاسمين معاً */
const toSnake = (key: string) => key.replace(/([a-z0-9])([A-Z])/g, "$1_$2").toLowerCase();

/** يبحث عن المفتاح في الحمولة ثم داخل `trip` (لقطة الرحلة) بالصيغتين */
function raw(payload: Payload, key: string): unknown {
  if (!payload || typeof payload !== "object") return undefined;
  const names = [key, toSnake(key)];
  for (const name of names) {
    const v = (payload as Record<string, unknown>)[name];
    if (v !== undefined && v !== null) return v;
  }
  const trip = (payload as Record<string, unknown>).trip;
  if (trip && typeof trip === "object") {
    for (const name of names) {
      const v = (trip as Record<string, unknown>)[name];
      if (v !== undefined && v !== null) return v;
    }
  }
  return undefined;
}

export function str(payload: Payload, key: string): string | null {
  const v = raw(payload, key);
  if (typeof v === "string") return v.trim() === "" ? null : v.trim();
  if (typeof v === "number" && Number.isFinite(v)) return String(v);
  return null;
}

function numeric(payload: Payload, key: string): number | null {
  const v = raw(payload, key);
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string" && v.trim() !== "") {
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

function bool(payload: Payload, key: string): boolean {
  const v = raw(payload, key);
  return v === true || v === "true";
}

/** أول قيمة نصية موجودة من عدة أسماء محتملة */
function firstStr(payload: Payload, keys: string[]): string | null {
  for (const key of keys) {
    const v = str(payload, key);
    if (v) return v;
  }
  return null;
}

/** توكن المتابعة العام — أساس رابط الحجز في كل القنوات */
export function bookingToken(payload: Payload): string | null {
  return firstStr(payload, ["publicToken", "token", "bookingToken"]);
}

export function bookingReference(payload: Payload): string | null {
  return firstStr(payload, ["reference", "bookingReference"]);
}

/**
 * مسار المتابعة النسبي — **وجهةُ العميل وحده**.
 *
 * ⚠ ولا يُنادى من شاشةٍ ولا من قناةٍ مباشرةً: مناديه الوحيد `audienceLink`
 * أدناه، وهناك يُختار بحسب الجمهور. ونداؤه مباشرةً هو بعينه العيب الذي أُصلح
 * (انظر ترويسة `audienceLink`).
 */
export function bookingPath(payload: Payload): string | null {
  const token = bookingToken(payload);
  return token ? `/booking/${token}` : null;
}

// ---------------------------------------------------------------------------
// وجهة الإشعار بحسب جمهوره — مكانٌ واحد لا ثلاثة
// ---------------------------------------------------------------------------

/**
 * جمهور الإشعار. ثلاثة لا رابع لهم، ولكلٍّ **صفحته هو**.
 *
 * و`ops` جمهورٌ واحد وإن تعدّدت أسطحه: جرسُ اللوحة و`/admin/notifications`
 * وتليجرام التشغيل وبريده كلها العين نفسها — يفرّق بينها `baseUrl` وحده
 * (فارغٌ ⇒ مسارٌ نسبي داخل اللوحة، ومملوءٌ ⇒ رابطٌ مطلق في رسالةٍ خارجية).
 */
export type NotificationAudience = "ops" | "partner" | "customer";

/**
 * 🔒 **وجهةُ كل جمهور — قرارٌ في موضعٍ واحد، على طراز `audienceReference`.**
 *
 * ── العيب الذي وُجدت هذه الدالة لتغلقه (بلاغ المالك 2026-08-17) ─────────────
 *
 * كان الرابط يُبنى من `bookingPath(payload)` في **ثلاثة مواضع مستقلة** — في
 * `renderNotification` هنا، وفي `dispatchLink` بـ`lib/dispatch/messages.ts`
 * احتياطاً، وفي جرس اللوحة مباشرةً. وثلاثتها تسأل السؤال نفسه: «ما توكن
 * الحجز؟» — أي أنها تبني **وجهة العميل** لكل من يقرأ، أياً كان.
 *
 * فالمالك ينقر إشعاراً في جرس لوحته فيهبط على `/booking/<token>`: الصفحة
 * المصمَّمة **لتُخفي** عنه ما يحتاجه. مقيسٌ على القاعدة الحيّة: ٥٧٤ صفاً من
 * `booking_created` و`booking_confirmed` و`receipt_uploaded` كلها كانت تقود
 * إلى صفحة العميل، بينما تحمل حمولاتُها `bookingId` كاملاً (٥٧٤ من ٥٧٤).
 *
 * ── ولماذا هي **حارسٌ أمني** لا تحسينُ تنقّل ─────────────────────────────────
 *
 * قِيس ما تعرضه `/booking/<token>` لحاملِ توكنٍ اليوم: **إجمالي العميل**
 * (3845.00) · **مرجع الحجز** (`TR-…`) · اسمه كاملاً · و`destLabel` وإحداثيات
 * ونصّ ملاحظاته الحرّ **بلا تقنيع** (‏`dispatch_public_label` و
 * `dispatch_safe_notes` لا تمرّان على هذه الصفحة). و`0049` قنّعت الهاتف
 * والواتساب — ولم تجعلها غير ضارّة: متعهدٌ يعرف **مستحقه**، فإجمالي العميل في
 * يده = **هامشنا** على تلك الرحلة. وذلك نقضٌ مباشر لـ**D-19** و**D-46**، وهو
 * نفسه البابُ الذي أغلقته `0056` من جهة المرجع.
 *
 * ── والقاعدة التي تمنع عودته ────────────────────────────────────────────────
 *
 * فرعُ `ops` **لا يقرأ التوكن إطلاقاً** — لا شرطاً ولا احتياطاً ولا `??`.
 * فحتى لو حملت حمولةٌ توكناً (وكلها تحمله)، **لا يوجد في هذا الملف مسارٌ
 * يسوق به إدارياً إلى صفحة العميل**. وهي حرفياً قاعدةُ `audienceReference`
 * نفسها مطبَّقةً على الوجهة بدل المعرّف؛ فالاحتياطُ لو كُتب هنا
 * `adminPath ?? bookingPath` لأعاد العيب في أول حمولةٍ بلا معرّف.
 *
 * ⚠ **وسقوطُ الرابط أهون من سقوطه على الوجهة الخطأ**: حمولةٌ بلا `bookingId`
 * ولا `quoteRequestId` تُنتج **بلا رابط** لا رابطاً إلى صفحة العميل. وقِيس أن
 * ذلك لا يُفقد صفاً واحداً رابطَه اليوم: كل حمولةٍ غير بثّية تحمل `bookingId`،
 * و`quote_requested` — وهي الوحيدة بلا معرّف حجزٍ ولا توكن — تحمل
 * `quoteRequestId` فتُوصَل إلى شاشتها.
 *
 * ── ولماذا هنا لا في `lib/dispatch/messages.ts` بجوار `audienceReference` ───
 *
 * لأن اتجاه الاستيراد يفرضه: `messages.ts` يستورد من هذا الملف، فالوجهةُ
 * موضوعةً هناك لا يستطيع `renderNotification` هنا أن يناديها إلا بحلقةٍ
 * دائرية. والمقصود من السابقة محفوظٌ كاملاً — **آلةٌ واحدة تقرّر لكل الجماهير**
 * يناديها الراسمان معاً — لا موضعُها من شجرة الملفات.
 */
export function audienceLink(
  payload: Payload,
  audience: NotificationAudience,
  baseUrl?: string
): { label: string; href: string } | null {
  const base = (baseUrl ?? "").replace(/\/+$/, "");

  // المتعهد: شاشتُه هو — لا صفحةَ العميل ولا اللوحة. ولا يقرأ هذا الفرع
  // الحمولةَ أصلاً، فلا مفتاحَ فيها يستطيع أن يغيّر وجهته.
  if (audience === "partner") {
    return { label: "صندوق طلباتي في البورتال", href: `${base}/portal/requests` };
  }

  // العميل: صفحته الوحيدة. ولا مستهلكَ لهذا الفرع في أنبوب الإشعارات اليوم
  // (لا صفَّ `notifications` موجَّهاً إلى عميل — `recipient_kind` إمّا `ops`
  // أو `partner`)، وهو مكتوبٌ لأن الخريطة تُقرأ كاملةً أو لا تُقرأ: من يضيف
  // غداً إشعاراً للعميل يجد وجهته هنا بدل أن يستنسخ `bookingPath` من جديد —
  // وذلك الاستنساخ بعينه هو ما أنتج هذا العيب.
  if (audience === "customer") {
    const path = bookingPath(payload);
    return path ? { label: "صفحة متابعة الحجز", href: `${base}${path}` } : null;
  }

  // فريق التشغيل: صفحة الطلب في اللوحة — حيث التكلفة والهامش والمتعهد والأزرار
  const bookingId = str(payload, "bookingId");
  if (bookingId) {
    return { label: "صفحة الطلب في اللوحة", href: `${base}/admin/orders/${bookingId}` };
  }

  // طلب عرض السعر ليس حجزاً: لا معرّف حجزٍ له ولا توكن — ومرساةُ شاشته هي
  // وجهته (‏`#status-<id>` موجودة على بطاقة كل طلب في `/admin/quote-requests`).
  const quoteRequestId = str(payload, "quoteRequestId");
  if (quoteRequestId) {
    return {
      label: "طلب عرض السعر في اللوحة",
      href: `${base}/admin/quote-requests#status-${quoteRequestId}`,
    };
  }

  return null;
}

// ---------------------------------------------------------------------------
// 🚏 المحطات الوسطى (0140 ⇐ 0144) — قراءةٌ واحدة يشترك فيها الراسمان
// ---------------------------------------------------------------------------

/**
 * 🔴 **العيب الذي وُلدت منه هذه الكتلة — رسالةٌ تصنع قراراً كاذباً.**
 *
 * نزلت المحطاتُ الوسطى في `0140` وعرضتها بطاقةُ البورتال. **لكنّ المتعهد لا
 * يفتح البورتال ليكتشف العرض — يصله إشعارٌ ثم يقرّر.** وحمولةُ `trip_offered`
 * كانت بلا `stops`، و`routeLabel()` تبني «من ← إلى» وحدها. فيصله «مطار القاهرة
 * ← حلوان · ٥٨ كم» فيظنّها مباشرة، ويقبل، ثم يجد محطتين في الطريق.
 * **الشاشةُ صارت صادقة، والرسالةُ التي تصنع القرار ما زالت تكذب.**
 *
 * ── ولماذا نسخةٌ واحدة هنا لا نسختان ───────────────────────────────────────
 *
 * كانت `routeLabel` مكتوبةً **مرّتين**: هنا ولأحداث الحجز، وفي
 * `lib/dispatch/messages.ts` لأحداث البثّ — بنفس الجسم حرفاً بحرف. وهو النمط ٨
 * في `LESSONS.md`: مصدران لشيءٍ واحد ينحرفان حتماً. وقد انحرفا فعلاً في
 * اللحظة التي تُقاس: إصلاحُ أحدهما وحده كان يترك **العرضَ نفسه** — الرسالة
 * الوحيدة التي يُتّخذ القرار عليها — كاذباً. فصارت هنا وحدها ويستوردها ذاك.
 */

/**
 * وسمُ محطةٍ لا وسمَ لها. وهو ليس تجميلاً: `dispatch_public_label` **بلا
 * fallback ثالث** (تعليقُها في القاعدة صريح)، فوسمٌ كلُّ مقاطعه مرقَّمة يخرج
 * منها `null`. والعدّ يجب أن يبقى صادقاً — «٣ محطات» تعني ثلاثاً حتى لو عُمّي
 * وسمُ إحداها، وإسقاطُ الصفّ من القائمة كان يجعل الرسالة تكذب من الجهة الأخرى.
 */
const UNNAMED_STOP = "محطة بلا وسم";

/**
 * أقصى عددٍ تُسرد أسماؤه **داخل سطر المسار نفسه**.
 *
 * ⚠ والحدُّ تفرضه **القناة لا الذوق**: سطرُ «المسار» هو السطر الوحيد من
 * أسطر الرحلة الذي يعبر إلى **بطاقة الجهاز** (`PUSH_CARD_LABELS` في
 * `lib/notifications/dispatch.ts`) وإلى **جرس اللوحة** (`notificationBrief`)،
 * وكلاهما سطرٌ واحد مقصوص. فسلسلةٌ من خمس عُقد على شاشةٍ مقفلة لا تُقرأ —
 * **وسطرٌ لا يُقرأ ليس تحسيناً**. وما جاوز الحدَّ يُقال عدداً في سطر المسار
 * (فيبقى المعنى الحاسم «ليست رحلةً مباشرة» واصلاً في كل قناة) وتُسرَد أسماؤه
 * كاملةً في سطر «المحطات» — وهو سطرٌ **خارج** قائمة بطاقة الجهاز عمداً، فلا
 * يزاحم فيها ما يُقرَّر عليه.
 */
const MAX_INLINE_STOPS = 2;

export type TripStops = {
  /** عددُ المحطات كما في الحمولة — لا كما أمكن تسميتُه */
  count: number;
  /** بطول `count` دائماً، وبترتيبها؛ وما لا وسم له يأخذ `UNNAMED_STOP` */
  labels: string[];
  /** هل نجحت تسميةُ كلِّ محطة؟ */
  allNamed: boolean;
};

/**
 * المحطات كما تقرؤها الرسالة — **وسومٌ فقط**.
 *
 * 🔒 ولا تُقرأ `lat`/`lng` هنا ولا تُطبع (D-19: المتعهد قبل القبول لا إحداثيات).
 * والحمولةُ العامة لا تحملها أصلاً — `trip_stops_public()` تبني `[{label}]`
 * وحدها — لكنّ حمولةَ التشغيل تصل من `log_booking_change` بلقطة `trip` كاملة،
 * فالقيدُ هنا طبقةٌ ثانية لا تكرار.
 *
 * ⚠ والقراءةُ متسامحةٌ بثلاثة أوجه لأن ثلاثة مُنتِجين يكتبون الحقل:
 *   · `stops` في أعلى الحمولة (`dispatch_trip_payload` · `customer_notification_payload`)
 *   · `trip.stops` (‏`log_booking_change` تمرّر اللقطة كما هي) — و`raw` تبحث فيها
 *   · عنصرٌ نصّيّ خام بدل كائن — يُقبل ولا يُسقط الرسالة
 *
 * 🔒 **وكلُّ وسمٍ يمرّ على `sanitizeLine`** قبل أن يدخل نصّاً. وسمُ المحطة
 * **مدخلُ مستخدم**، و`U+202E` واحدٌ بلا مُغلق يقلب اتجاه كلِّ ما بعده في
 * الرسالة — أي أن محطةً واحدة تستطيع أن تقلب سطرَ المستحق. وليس هذا تحوّطاً
 * نظرياً: قِيس على قاعدة الإنتاج **صفٌّ حيٌّ واحد** يحمل `U+202C` في
 * `originLabel` (‏«مدينتى، ثانى القاهرة الجديدة، محافظة القاهرة» + U+202C).
 * ولذلك تمرّ **أطرافُ المسار كذلك** على المُنقّي هنا، لا المحطاتُ وحدها.
 */
export function tripStops(payload: Payload): TripStops {
  const value = raw(payload, "stops");
  if (!Array.isArray(value)) return { count: 0, labels: [], allNamed: true };

  const labels: string[] = [];
  let allNamed = true;

  for (const item of value) {
    const source =
      item && typeof item === "object"
        ? (item as Record<string, unknown>).label
        : item;
    const clean = sanitizeLine(source, MAX_PLACE_LABEL_LENGTH);
    if (clean) labels.push(clean);
    else {
      labels.push(UNNAMED_STOP);
      allNamed = false;
    }
  }

  return { count: labels.length, labels, allNamed };
}

/** «محطة واحدة» · «محطتان» · «٣ محطات» — والسقف في القاعدة ١٠ (`max_trip_stops`) */
function stopsCountText(count: number): string {
  if (count === 1) return "محطة واحدة";
  if (count === 2) return "محطتان";
  return count <= 10 ? `${toArabicDigits(count)} محطات` : `${toArabicDigits(count)} محطة`;
}

/** هل تُسرَد الأسماءُ داخل سطر المسار نفسه؟ — الشرط الوحيد، ويقرؤه السطران معاً */
function namesFitInRoute(stops: TripStops): boolean {
  return stops.count > 0 && stops.count <= MAX_INLINE_STOPS && stops.allNamed;
}

/**
 * «القاهرة ← الغردقة» بلا محطات · «مطار القاهرة ← المعادي ← حلوان» بمحطتين ·
 * «مطار القاهرة ← حلوان · ٤ محطات في الطريق» بما فوقهما.
 *
 * يرجع `null` إن غابت الأطراف والمحطات معاً.
 */
export function routeLabel(payload: Payload): string | null {
  const clean = (value: string | null): string | null =>
    value === null ? null : sanitizeLine(value, MAX_PLACE_LABEL_LENGTH) || null;

  const from = clean(firstStr(payload, ["originLabel", "origin", "from"]));
  const to = clean(firstStr(payload, ["destLabel", "destinationLabel", "destination", "to"]));
  const ends = from && to ? `${from} ← ${to}` : (from ?? to);

  const stops = tripStops(payload);
  if (stops.count === 0) return ends;

  if (from && to && namesFitInRoute(stops)) return [from, ...stops.labels, to].join(" ← ");

  const tail = `${stopsCountText(stops.count)} في الطريق`;
  return ends ? `${ends} · ${tail}` : tail;
}

/**
 * سطرُ «المحطات» — الأسماءُ كاملةً بترتيبها، **مُكمِّلاً لسطر المسار لا مكرِّراً
 * له**: يرجع `null` بالضبط حين يكون سطرُ المسار قد سمّاها بنفسه.
 *
 * ⚠ ولا يُضاف إلى `PUSH_CARD_LABELS`: البطاقةُ سطرٌ واحد مقصوص، وقد قال سطرُ
 *   المسار فيها ما يلزم للقرار.
 */
export function stopsLine(payload: Payload): string | null {
  const stops = tripStops(payload);
  if (stops.count === 0 || namesFitInRoute(stops)) return null;
  return stops.labels.map((label, i) => `${toArabicDigits(i + 1)}) ${label}`).join(" · ");
}

/** «SUV · ٤ ركاب · ذهاب وعودة · انتظار ساعتان» */
function tripLabel(payload: Payload): string | null {
  const parts: string[] = [];
  const cls = firstStr(payload, ["classTitle", "className", "classSlug"]);
  if (cls) parts.push(cls);
  const passengers = numeric(payload, "passengers");
  if (passengers !== null && passengers > 0) parts.push(passengersLabel(passengers));
  if (bool(payload, "roundTrip")) parts.push("ذهاب وعودة");
  const waiting = numeric(payload, "waitingHours");
  if (waiting !== null && waiting > 0) parts.push(`انتظار ${hoursText(waiting)}`);
  return parts.length > 0 ? parts.join(" · ") : null;
}

/**
 * سطر مختصر يصف الإشعار في الجرس وفي جدول اللوحة:
 * «TR-8F3K2Q · القاهرة ← الغردقة» أو ما توفّر منهما.
 */
export function notificationBrief(payload: Payload): string | null {
  const parts = [
    bookingReference(payload),
    routeLabel(payload),
    firstStr(payload, ["customerName", "name"]),
  ].filter((p): p is string => Boolean(p));
  return parts.length > 0 ? parts.slice(0, 2).join(" · ") : null;
}

/**
 * التاريخ والوقت بالعربية — يعمل في الخادم والمتصفح بنفس النتيجة.
 *
 * المنطقة **من إعداد الموقع** لا نصّاً في السطر (هجرة 0075). ومساراه اثنان:
 * شاشات اللوحة والبورتال (يضبطها `i18n/request.ts` مع تصيير الجذر)، وعامل
 * الإشعارات في `/api/notifications/dispatch` — **وهو ينادي `getSiteTimeZone()`
 * صراحةً قبل أن يرسم أي رسالة**، لأن مسار `/api` لا يمرّ بالتخطيط فلا يُضبط
 * تلقائياً. وبلا ذلك كانت رسالة تليجرام وحدها تخالف الشاشة في الساعة.
 */
export function formatDateTime(iso: string | null): string | null {
  if (!iso) return null;
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return null;
  try {
    return new Intl.DateTimeFormat("ar-EG", {
      dateStyle: "medium",
      timeStyle: "short",
      timeZone: siteTimeZone(),
    }).format(date);
  } catch {
    return date.toISOString().replace("T", " ").slice(0, 16);
  }
}

/** «منذ ٣ دقائق» — للجرس وجدول الإشعارات */
export function relativeTime(iso: string | null | undefined): string {
  if (!iso) return "";
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return "";
  const seconds = Math.max(0, Math.round((Date.now() - then) / 1000));
  if (seconds < 45) return "الآن";
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) {
    if (minutes === 1) return "منذ دقيقة";
    if (minutes === 2) return "منذ دقيقتين";
    return minutes <= 10 ? `منذ ${toArabicDigits(minutes)} دقائق` : `منذ ${toArabicDigits(minutes)} دقيقة`;
  }
  const hours = Math.round(minutes / 60);
  if (hours < 24) {
    if (hours === 1) return "منذ ساعة";
    if (hours === 2) return "منذ ساعتين";
    return hours <= 10 ? `منذ ${toArabicDigits(hours)} ساعات` : `منذ ${toArabicDigits(hours)} ساعة`;
  }
  const days = Math.round(hours / 24);
  if (days === 1) return "أمس";
  if (days === 2) return "منذ يومين";
  if (days <= 10) return `منذ ${toArabicDigits(days)} أيام`;
  return `منذ ${toArabicDigits(days)} يوماً`;
}

// ---------------------------------------------------------------------------
// بناء الرسالة لكل حدث
// ---------------------------------------------------------------------------

function money(value: number | null, currency: string): string | null {
  return value === null ? null : formatMoney(value, currency);
}

function push(lines: MessageLine[], label: string, value: string | null | undefined) {
  if (value) lines.push({ label, value });
}

/**
 * يبني رسالة الحدث كاملة. الأسطر مرتبة بأولوية التشغيل: ما يحتاجه المستلم
 * ليتصرف فوراً (المرجع، المسار، المطلوب تحصيله، هاتف العميل) قبل التفاصيل.
 */
export function renderNotification(
  event: string,
  payload: Payload,
  ctx: RenderContext,
  /**
   * ⚠ والافتراضُ `ops` يسقط في الاتجاه الآمن: من نسي تمريره يحصل على رابط
   * `/admin` — وهو محروسٌ بالدور (**D-22**) فيردّ غيرَ الإداري ولا يعرض شيئاً.
   * ولو كان الافتراض `customer` لكان النسيانُ **تسريباً** لا رابطاً ميّتاً.
   */
  audience: NotificationAudience = "ops"
): RenderedMessage {
  /**
   * 🔒 **حارسُ الجمهور — بنيويّ لا انضباطيّ** (‏0131 · D-19).
   *
   * حمولاتُ التشغيل تحمل `payout` و`realMargin` و`companyName` و`partnerPhone`.
   * فلو أخطأ مُوجِّهٌ يوماً وأعطى حدثاً تشغيلياً جمهورَ العميل، لَبنى الفرعُ
   * الافتراضي أدناه رسالةً منها. والحارسُ هنا يقطع ذلك الطريق قبل أن يبدأ:
   * جمهورُ العميل يرى **أحداثَه هو** أو جملةً عامةً بلا سطرٍ واحد — ولا ثالث.
   *
   * ⚠ وهو ليس تحوّطاً زائداً: بطاقةُ الإشعار تظهر على شاشةٍ مقفلة يراها من يقف
   *   بجوار الهاتف، ومستحقُّ المتعهد + إجمالي العميل = هامشُنا على تلك الرحلة.
   */
  if (audience === "customer" && !isCustomerEvent(event)) {
    return {
      emoji: "🔔",
      title: "تحديث على حجزك",
      lead: `طرأ تحديثٌ على حجزك لدى ${ctx.brandName}. افتح صفحة متابعة الحجز لترى تفاصيله.`,
      lines: [],
      link: audienceLink(payload, "customer", ctx.baseUrl),
      reference: bookingReference(payload),
    };
  }

  const currency = str(payload, "currency") ?? ctx.currency;
  const reference = bookingReference(payload);
  const lines: MessageLine[] = [];

  const customerName = firstStr(payload, ["customerName", "name"]);
  const customerPhone = firstStr(payload, ["customerPhone", "phone", "mobile"]);
  const customerWhatsapp = firstStr(payload, ["customerWhatsapp", "whatsapp"]);
  const total = numeric(payload, "total");
  const amountDue = numeric(payload, "amountDue");
  const amountRemaining = numeric(payload, "amountRemaining");
  const plan = str(payload, "plan");
  const pickup = formatDateTime(firstStr(payload, ["pickupAt", "pickup"]));
  const notes = firstStr(payload, ["notes", "note", "details"]);

  let emoji = eventEmoji(event);
  let title = eventTitle(event);
  let lead: string;

  switch (event) {
    case "booking_created": {
      lead = `حجز جديد على ${ctx.brandName} — العميل اختار سيارته وبانتظار تحويل المبلغ. تابع وصول الإيصال.`;
      push(lines, "رقم الحجز", reference);
      push(lines, "المسار", routeLabel(payload));
      push(lines, "المحطات", stopsLine(payload));
      push(lines, "الرحلة", tripLabel(payload));
      push(lines, "موعد الانطلاق", pickup);
      push(lines, "الإجمالي", money(total, currency));
      push(
        lines,
        plan === "deposit" ? "المطلوب تحويله الآن (عربون)" : "المطلوب تحويله الآن",
        money(amountDue, currency)
      );
      push(lines, "يُحصَّل مع السائق", money(amountRemaining, currency));
      push(lines, "العميل", customerName);
      push(lines, "الهاتف", customerPhone);
      push(lines, "واتساب", customerWhatsapp);
      push(lines, "ملاحظات العميل", notes);
      break;
    }

    case "receipt_uploaded": {
      lead = `رفع العميل إيصال التحويل — الحجز انتقل إلى «قيد المراجعة» وينتظر تحقق التشغيل من وصول المبلغ.`;
      push(lines, "رقم الحجز", reference);
      push(lines, "المسار", routeLabel(payload));
      push(lines, "المحطات", stopsLine(payload));
      push(lines, "المبلغ المفترض تحويله", money(amountDue, currency));
      push(lines, "الإجمالي", money(total, currency));
      push(lines, "العميل", customerName);
      push(lines, "الهاتف", customerPhone);
      break;
    }

    case "booking_confirmed": {
      lead = `تم تأكيد الحجز بعد التحقق من التحويل — جهّز الإسناد وأبلغ العميل بموعد السائق.`;
      push(lines, "رقم الحجز", reference);
      push(lines, "المسار", routeLabel(payload));
      push(lines, "المحطات", stopsLine(payload));
      push(lines, "الرحلة", tripLabel(payload));
      push(lines, "موعد الانطلاق", pickup);
      push(lines, "الإجمالي", money(total, currency));
      push(lines, "المحصَّل", money(amountDue, currency));
      push(lines, "يُحصَّل مع السائق", money(amountRemaining, currency));
      push(lines, "العميل", customerName);
      push(lines, "الهاتف", customerPhone);
      break;
    }

    case "booking_cancelled": {
      lead = `أُلغي الحجز. راجع سبب الإلغاء وتصرّف في أي مبلغ محصَّل حسب سياسة الاسترداد.`;
      push(lines, "رقم الحجز", reference);
      push(lines, "المسار", routeLabel(payload));
      push(lines, "المحطات", stopsLine(payload));
      push(lines, "الإجمالي", money(total, currency));
      push(lines, "سبب الإلغاء", firstStr(payload, ["reason", "note", "statusNote"]));
      push(lines, "العميل", customerName);
      push(lines, "الهاتف", customerPhone);
      break;
    }

    case "quote_requested": {
      lead = `طلب عرض سعر جديد — تواصل مع العميل وأرسل له السعر قبل أن يذهب لغيرك.`;
      push(lines, "رقم الطلب", reference);
      push(lines, "الخدمة", firstStr(payload, ["serviceTitle", "serviceSlug"]));
      push(lines, "العميل", customerName);
      push(lines, "الهاتف", customerPhone);
      push(lines, "واتساب", customerWhatsapp);
      push(lines, "التفاصيل", notes);
      break;
    }

    /**
     * 🚨 **جرسُ الأعطال — ولا يُترك للفرع الافتراضي.**
     *
     * حمولتُه مقيسةٌ من `dispatch_tick`: `{ job, error }` ولا شيء غيرهما — لا
     * مرجعَ ولا عميلَ ولا هاتف. فالفرعُ الافتراضي كان يُنتج له رسالةً **بجسمٍ
     * فارغ تماماً** (‏`push` يتخطى كل قيمةٍ غائبة) وبجملةٍ عامة تقول «حدث جديد
     * يحتاج مراجعتك» — أي إنذاراً لا يقول ما الذي سقط ولا ما أثره.
     *
     * ولا رابطَ له عمداً: `audienceLink` تُرجع `null` لحمولةٍ بلا `bookingId`
     * ولا `quoteRequestId`، **وسقوطُ الرابط أهون من سقوطه على وجهةٍ خاطئة**
     * (انظر ترويسة `audienceLink`). فالمكانُ الذي يُتابَع منه هذا الحدث ليس
     * صفحةَ طلبٍ أصلاً.
     */
    case "ops_job_failed": {
      const job = firstStr(payload, ["job", "jobName"]);
      lead =
        `مهمة مجدولة سقطت داخل دورة البثّ ولم تكتمل — والدورة مضت بعدها. ` +
        `أثرُها لم يقع، ولا شيء يعيد المحاولة من تلقائه: راجع السبب ثم شغّلها.`;
      push(lines, "المهمة", job);
      push(lines, "سبب السقوط", firstStr(payload, ["error", "message", "detail"]));
      push(lines, "ما الذي لم يقع", job === null ? null : (OPS_JOB_IMPACT[job] ?? null));
      break;
    }

    /* ═════════════════════════════════════════════════════════════════════
     *  👤 أحداثُ العميل (‏0131) — يقرؤها **صاحبُ الحجز**، لا التشغيل
     * ═════════════════════════════════════════════════════════════════════
     *
     * وحمولتُها تبنيها `customer_notification_payload` في القاعدة من
     * `bookings` مباشرةً: بلا تكلفةٍ ولا هامشٍ ولا متعهدٍ ولا هاتف. فما لا
     * يوجد في الحمولة لا يُطبع هنا حتى لو كُتب سطرُه بالسهو.
     *
     * ⚠ ونبرةُ السطور نبرةُ **مَن يُخدَم** لا نبرةُ من يشغّل: «رقم حجزك» لا
     *   «رقم الحجز»، ولا أمرَ فيها بإجراءٍ تشغيليّ.
     */
    case "customer_booking_confirmed": {
      lead =
        `تأكّد حجزك لدى ${ctx.brandName} ووصلَنا مبلغُك. ` +
        `سنُجهّز سيارتك ونوافيك ببياناتها قبل الموعد، وتجد كل التفاصيل في صفحة متابعة حجزك.`;
      push(lines, "رقم حجزك", reference);
      push(lines, "المسار", routeLabel(payload));
      push(lines, "المحطات", stopsLine(payload));
      push(lines, "الرحلة", tripLabel(payload));
      push(lines, "موعد الانطلاق", pickup);
      push(lines, "إجمالي الرحلة", money(total, currency));
      push(lines, "يُدفع مع السائق", money(amountRemaining, currency));
      break;
    }

    /**
     * 🔒 ولا اسمَ متعهدٍ ولا هاتفَه ولا مستحقَّه — **ولا كلمةَ «متعهد» أصلاً**.
     * بيانات السيارة والسائق تظهر للعميل في صفحته وحدها، وبنافذةٍ زمنية
     * يحكمها `get_booking_by_token` (‏0043) — فالإشعارُ يقوده إليها ولا ينسخها.
     */
    case "customer_trip_assigned": {
      lead =
        `جهّزنا سيارة رحلتك. تظهر بياناتُها — الطراز واللون واللوحة — في صفحة متابعة حجزك، ` +
        `ويظهر رقم السائق قبل الموعد بوقتٍ كافٍ.`;
      push(lines, "رقم حجزك", reference);
      push(lines, "المسار", routeLabel(payload));
      push(lines, "المحطات", stopsLine(payload));
      push(lines, "الرحلة", tripLabel(payload));
      push(lines, "موعد الانطلاق", pickup);
      break;
    }

    case "customer_trip_reminder": {
      lead =
        `اقترب موعد رحلتك. راجع نقطة الانطلاق والوقت، ` +
        `وتجد بيانات السيارة والسائق في صفحة متابعة حجزك.`;
      push(lines, "رقم حجزك", reference);
      push(lines, "المسار", routeLabel(payload));
      push(lines, "المحطات", stopsLine(payload));
      push(lines, "موعد الانطلاق", pickup);
      push(lines, "يُدفع مع السائق", money(amountRemaining, currency));
      break;
    }

    case "customer_trip_completed": {
      lead =
        `انتهت رحلتك — شكراً لاختيارك ${ctx.brandName}. ` +
        `تجد تفاصيلها كاملةً في صفحة متابعة حجزك متى احتجتها.`;
      push(lines, "رقم حجزك", reference);
      push(lines, "المسار", routeLabel(payload));
      push(lines, "المحطات", stopsLine(payload));
      push(lines, "موعد الانطلاق", pickup);
      break;
    }

    default: {
      emoji = eventEmoji(event);
      title = eventTitle(event);
      lead = `حدث جديد على ${ctx.brandName} يحتاج مراجعتك من لوحة التحكم.`;
      push(lines, "المرجع", reference);
      push(lines, "العميل", customerName);
      push(lines, "الهاتف", customerPhone);
    }
  }

  // 🔒 الوجهة من الآلة الواحدة — ولا يُبنى هنا مسارٌ باليد بعد اليوم
  const link = audienceLink(payload, audience, ctx.baseUrl);

  return { emoji, title, lead, lines, link, reference };
}

// ---------------------------------------------------------------------------
// تحويل الرسالة لصيغ القنوات
// ---------------------------------------------------------------------------

/** تهريب HTML — إلزامي: أسماء العملاء وملاحظاتهم نص حر يدخل رسالة HTML */
export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** نص تليجرام بصيغة HTML (parse_mode=HTML) */
export function toTelegramHtml(message: RenderedMessage, ctx: RenderContext): string {
  const head = `${message.emoji} <b>${escapeHtml(message.title)}</b> — ${escapeHtml(ctx.brandName)}`;
  const body = message.lines
    .map((line) => `${escapeHtml(line.label)}: <b>${escapeHtml(line.value)}</b>`)
    .join("\n");
  const tail = message.link ? `\n\n<a href="${escapeHtml(message.link.href)}">${escapeHtml(message.link.label)}</a>` : "";
  return `${head}\n\n${escapeHtml(message.lead)}\n\n${body}${tail}`;
}

/** عنوان رسالة البريد — المرجع في العنوان ليسهل البحث في صندوق الوارد */
export function toEmailSubject(message: RenderedMessage, ctx: RenderContext): string {
  const ref = message.reference ? ` ${message.reference}` : "";
  return `${message.title}${ref} — ${ctx.brandName}`;
}

/** جسم رسالة البريد: HTML بسيط RTL يعمل في كل عملاء البريد بلا CSS خارجي */
export function toEmailHtml(message: RenderedMessage, ctx: RenderContext): string {
  const rows = message.lines
    .map(
      (line) =>
        `<tr><td style="padding:6px 0;color:#6b7280;white-space:nowrap">${escapeHtml(line.label)}</td>` +
        `<td style="padding:6px 12px;font-weight:700;color:#111827">${escapeHtml(line.value)}</td></tr>`
    )
    .join("");
  const button = message.link
    ? `<p style="margin:20px 0 0"><a href="${escapeHtml(message.link.href)}" ` +
      `style="display:inline-block;padding:10px 18px;border-radius:8px;background:#111827;color:#ffffff;text-decoration:none">` +
      `${escapeHtml(message.link.label)}</a></p>`
    : "";

  return [
    `<div dir="rtl" lang="ar" style="font-family:system-ui,'Segoe UI',Tahoma,sans-serif;background:#f3f4f6;padding:24px">`,
    `<div style="max-width:560px;margin:0 auto;background:#ffffff;border-radius:12px;padding:24px">`,
    `<p style="margin:0 0 4px;color:#6b7280;font-size:13px">${escapeHtml(ctx.brandName)}</p>`,
    `<h1 style="margin:0 0 12px;font-size:18px;color:#111827">${message.emoji} ${escapeHtml(message.title)}</h1>`,
    `<p style="margin:0 0 16px;line-height:1.8;color:#374151">${escapeHtml(message.lead)}</p>`,
    `<table style="width:100%;border-collapse:collapse;font-size:14px">${rows}</table>`,
    button,
    `<p style="margin:20px 0 0;color:#9ca3af;font-size:12px">رسالة آلية من لوحة تحكم ${escapeHtml(ctx.brandName)}.</p>`,
    `</div></div>`,
  ].join("");
}
