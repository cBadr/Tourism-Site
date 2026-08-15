import "server-only";

import { MAX_PUSH_PLAINTEXT, type PushPayload } from "@/lib/push/types";

/**
 * بناء حمولة البطاقة وقصّها — **قبل التشفير لا بعده**.
 *
 * ── لماذا القصّ هنا ────────────────────────────────────────────────────────
 *
 * السقف ٤٠٩٦ بايت للجسم كله عند كل خدمة دفع، وتجاوزه يردّ `413` على **كل**
 * أجهزة المتعهد دفعةً واحدة. والعطب من الصنف الذي لا يظهر في التطوير: رحلةٌ
 * قصيرة تمرّ، ورحلةٌ بملاحظة عميلٍ طويلة تسقط وحدها — فيبدو الأمر «عشوائياً».
 *
 * ولذلك القصّ **مقصود ومكتوب**: البطاقة إشعارٌ لا رسالة. مهمتها أن يعرف
 * المتعهد أن هناك عرضاً وأن ينقر، والتفاصيل في البورتال خلف النقرة.
 *
 * ── 🔒 وما لا يدخل الحمولة أبداً (D-19) ────────────────────────────────────
 *
 * لا اسم عميل، ولا هاتفه، ولا إجمالي ما دفعه. البطاقة تظهر **على شاشة مقفلة**
 * يقرؤها من يقف بجوار الهاتف — وهي كذلك تعبر خدمةً وسيطة وتُخزَّن عندها حتى
 * التسليم. والنصّ يُبنى من الحمولة العامة (`dispatch_trip_payload(_, true)`)
 * التي يقرؤها `portal_inbox` نفسه، لا من الحمولة التشغيلية.
 *
 * وهذا ليس تحوّطاً نظرياً: `portal_offers()` نفسها لا تحمل أعمدة العميل
 * (اتفاقية ٧ — ما لا يوجد في نوع الإرجاع لا يُسرَّب)، والبطاقة يجب ألا تكون
 * الثغرة التي تلتفّ على ذلك.
 *
 * ── 🔒 و`ref` **رمزُ رحلةٍ أو لا شيء** (0056) ───────────────────────────────
 *
 * كل بطاقةِ دفعٍ في هذا المشروع تذهب إلى **متعهد** بلا استثناء: جدول
 * الاشتراكات `partner_push_subscriptions` مفتاحه متعهد، ولا مستقبِل آخر له.
 * فحقل `ref` — «مرجع الحجز إن وُجد» في العقد — كان بابَ تسريبٍ مفتوحاً بحسن
 * نيّة: أول منادٍ يمرّر `payload.reference` يضع مرجع العميل على **شاشةٍ
 * مقفلة** يقرؤها من يقف بجوار الهاتف، وفي **خدمةٍ وسيطة** تخزّنه حتى التسليم.
 * والمرجع + هاتف العميل (وهو معه بضرورةٍ تنفيذية) = مفتاحا «تابع حجزك» ⇒
 * صفحة العميل ⇒ إجماليه ⇒ هامشنا. وهو نفس العيب الذي أغلقته 0028.
 *
 * فالقبول هنا **بقائمةٍ بيضاء على الشكل** لا بحسن ظنٍّ بالمنادي: ما لا يطابق
 * شكل `partner_trip_code` يسقط بلا ضجيج. والقصّ صامتٌ عمداً — بطاقةٌ بلا سطر
 * مرجعٍ تصل، والرمي هنا يعني عرضاً لا يصل صاحبه أصلاً.
 */

/** حدودٌ للعرض لا للأمان — بطاقةُ الإشعار تقصّ أطول من ذلك بنفسها على كل حال */
const MAX_TITLE = 120;
const MAX_BODY = 300;
const MAX_REF = 32;

/**
 * شكل رمز الرحلة كما تولّده `partner_trip_code` في القاعدة: `#` + ثماني خانات
 * سداسية عشرية كبيرة، من أول معرّف الحجز. ومرجع العميل (`TR-XXXXXX`) لا يطابقه
 * بحال — وهذا هو المقصود: القائمة بيضاء لا سوداء، فلا يمرّ شكلٌ لم نتوقّعه.
 */
const TRIP_CODE = /^#[0-9A-F]{8}$/;

export type PushPayloadInput = {
  event: string;
  title: string;
  body: string;
  /** مسارٌ نسبي داخل الموقع — يُرفض أي عنوان مطلق (انظر `safeUrl`) */
  url: string;
  tag: string;
  /**
   * 🔒 **رمز الرحلة وحده** (`#A1B2C3D4`) — لا مرجع العميل ولا أي نصٍّ آخر.
   * ما لا يطابق `TRIP_CODE` يُسقط، فالبطاقة تخرج بلا سطر مرجعٍ ولا تحمل سرّاً.
   */
  ref?: string | null;
};

const oneLine = (value: string, max: number): string =>
  value.replace(/\s+/g, " ").trim().slice(0, max);

/** رمز الرحلة أو لا شيء — انظر ترويسة الملف: القبول بالشكل لا بحسن الظن */
function safeRef(value: string | null | undefined): string {
  if (!value) return "";
  const trimmed = oneLine(value, MAX_REF).toUpperCase();
  return TRIP_CODE.test(trimmed) ? trimmed : "";
}

/**
 * وجهة النقر: **مسارٌ نسبي وحده**.
 *
 * عامل الخدمة يفتح ما يصله كما هو. فحمولةٌ تحمل عنواناً مطلقاً تعني أن أي مسارٍ
 * يبني بطاقةً غداً يستطيع أن يقود المتعهد خارج الموقع — وهو نمط تصيّدٍ مثالي
 * لأن البطاقة تحمل اسم علامتنا وأيقونتها. فالتحقق هنا، **وثانيةً في العامل**
 * (`public/sw.js`): طبقتان لأن إحداهما تعيش في متصفحٍ لا نحدّثه متى شئنا.
 */
function safeUrl(value: string): string {
  const trimmed = value.trim();
  if (!trimmed.startsWith("/") || trimmed.startsWith("//")) return "/portal";
  return trimmed.slice(0, 200);
}

export function buildPushPayload(input: PushPayloadInput): PushPayload {
  const payload: PushPayload = {
    v: 1,
    event: oneLine(input.event, 64) || "notification",
    title: oneLine(input.title, MAX_TITLE),
    body: oneLine(input.body, MAX_BODY),
    url: safeUrl(input.url),
    tag: oneLine(input.tag, 64) || "notification",
  };
  const ref = safeRef(input.ref);
  if (ref) payload.ref = ref;
  return payload;
}

const byteLength = (value: string): number => Buffer.byteLength(value, "utf8");

/**
 * يحوّل الحمولة إلى بايتات جاهزة للتشفير، **مضموناً ألا تتجاوز السقف**.
 *
 * الترتيب في القصّ ليس اعتباطاً: يذهب أولاً ما تكلفته أقلّ على الفهم.
 *   ١. الجسم — سطرُ تفصيلٍ يُغني عنه فتحُ البورتال.
 *   ٢. المرجع — رقمٌ يجده في الشاشة.
 *   ٣. العنوان — آخر ما يُمسّ: بلا عنوانٍ لا تعني البطاقة شيئاً.
 * والوجهة (`url`) و`tag` **لا تُقصّان أبداً**: الأولى تكسر النقر، والثانية تكسر
 * منعَ التكرار فتتراكم بطاقاتٌ لعرضٍ واحد.
 */
export function encodePushPayload(payload: PushPayload): Buffer {
  const encode = (value: PushPayload) => JSON.stringify(value);

  let current: PushPayload = { ...payload };
  let text = encode(current);
  if (byteLength(text) <= MAX_PUSH_PLAINTEXT) return Buffer.from(text, "utf8");

  const overflow = () => byteLength(encode(current)) - MAX_PUSH_PLAINTEXT;

  // ١) الجسم
  if (current.body.length > 0) {
    const keep = Math.max(0, current.body.length - overflow() - 1);
    current = { ...current, body: current.body.slice(0, keep) };
    text = encode(current);
    if (byteLength(text) <= MAX_PUSH_PLAINTEXT) return Buffer.from(text, "utf8");
  }

  // ٢) المرجع
  if (current.ref) {
    current = {
      v: current.v,
      event: current.event,
      title: current.title,
      body: current.body,
      url: current.url,
      tag: current.tag,
    };
    text = encode(current);
    if (byteLength(text) <= MAX_PUSH_PLAINTEXT) return Buffer.from(text, "utf8");
  }

  // ٣) العنوان — وقصّه الأخير يضمن الخروج من هنا تحت السقف مهما كان المدخل
  const keepTitle = Math.max(0, current.title.length - overflow() - 1);
  current = { ...current, title: current.title.slice(0, keepTitle) };
  return Buffer.from(encode(current), "utf8");
}
