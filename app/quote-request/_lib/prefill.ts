/**
 * حمولة «بطاقة الإنقاذ» في رابط `/quote-request` — قراءةً وتنقية.
 *
 * ── لماذا هذا الملف ────────────────────────────────────────────────────────
 * بطاقة الإنقاذ في `components/booking/offers.tsx` (‏`buildQuoteRequestHref`)
 * تَعِد العميل نصاً: «ننقل معك تفاصيل رحلتك إلى النموذج». وكانت الصفحة تقرأ
 * `?service=` وحدها وتُسقط الأربعة الباقية — فالوعد كاذب، والعميل يعيد كتابة ما
 * كتبه قبل ثانية، وهو بالضبط جمهور المجموعات والوفود الذي وُلدت البطاقة لإنقاذه.
 *
 * ── والمبدأ الحاكم لكل سطر هنا ─────────────────────────────────────────────
 * 🔒 **هذه معاملات رابط، لا وقائع.** الرابط يُشارَك ويُلصَق ويُصنَع باليد، فما
 * يصل منه **اقتراحُ تعبئة يحرّره العميل** لا بيانٌ يُخزَّن. لا يُشتق منه سعر ولا
 * يُكتب في عمود، وكل ما يفعله أنه يملأ `details` — وهو الحقل النصّي الحر نفسه
 * الذي كان العميل سيكتبه بيده. ولذلك التنقية هنا تحرس **العرض** (تخطيط الصفحة
 * وحدود الحقل) لا صحّة البيانات.
 *
 * ── وما لا يُعاد هنا ───────────────────────────────────────────────────────
 * **جملةٌ جاهزة.** لا تُركَّب العبارة العربية في الخادم: نصٌّ يُؤلَّف هنا يصل
 * صفحة `/en` عربياً بلا ترجمة. فالخارج **بياناتٌ مُرمَّزة** (اسم مكان، عدد،
 * طابع زمني ISO) وتركيبُ الجملة في جزيرة العميل بمفاتيح ترجمة ومُنسِّق اللغة.
 */

/** ما تحمله البطاقة فعلاً — والأسماء متفق عليها مع `buildQuoteRequestHref` */
export type QuoteTripPrefill = {
  /** اسم مكان الانطلاق كما اختاره العميل من الاقتراحات */
  from?: string;
  /** اسم الوجهة */
  to?: string;
  /** عدد الركاب */
  passengers?: number;
  /** موعد الانطلاق — ISO بمنطقة زمنية **صريحة** */
  pickupAt?: string;
};

type SearchParamsShape = { [key: string]: string | string[] | undefined };

/**
 * أقصى طول لاسم مكان — نفس `MAX_PREFILL_LABEL` في `offers.tsx`.
 * الباني يقصّ عنده، ونحن نقصّ ثانيةً لأن الباني ليس المصدر الوحيد الممكن للرابط.
 */
const MAX_LABEL = 120;

/**
 * سقف الركاب — نفس `MAX_PASSENGERS` في ويدجت البحث (٦٠).
 * وما فوقه **يُسقَط ولا يُقصّ إلى ٦٠**: القصّ يكتب في الحقل عدداً لم يقله العميل،
 * والبطاقة نفسها لا تستطيع إنتاج أكبر من هذا أصلاً (عدّادها محدود به).
 */
const MAX_PASSENGERS = 60;

/** نافذة الموعد المقبولة: سنة إلى الوراء وخمس إلى الأمام */
const PAST_WINDOW_MS = 365 * 24 * 60 * 60 * 1000;
const FUTURE_WINDOW_MS = 5 * 365 * 24 * 60 * 60 * 1000;

/**
 * ISO **بمنطقة زمنية صريحة** حصراً (‏`Z` أو `±hh:mm`).
 *
 * البطاقة تُنتج ناتج `toISOString()` دائماً، فالتشدّد لا يفقد حالةً حقيقية —
 * ويغلق الالتباس الذي يُنتج ساعةً خاطئة: `new Date("2026-09-01T07:00")` بلا
 * منطقة تُفسَّر **بتوقيت المُفسِّر**، وهو UTC على الخادم بينما الموعد قاهري.
 */
const ISO_WITH_ZONE =
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d{1,6})?)?(Z|[+-]\d{2}:\d{2})$/;

/** محارف التحكم — سطرٌ واحد يصير عشرين ويمطّ الحقل */
const CONTROL_CHARS = /[\u0000-\u001F\u007F]/g;

/**
 * محارف توجيه الكتابة — أخطر ما يصل من رابط إلى واجهة RTL: محرف واحد غير مرئي
 * يقلب اتجاه بقية النص فتبدو الصفحة معطوبة، والعميل لا يرى سببه ليحذفه.
 */
const BIDI_CHARS = /[\u200E\u200F\u202A-\u202E\u2066-\u2069]/g;

/** يقرأ مفتاحاً نصّياً واحداً — والمفتاح المكرر (مصفوفة) يُهمَل كما يُهمَل الغائب */
function single(value: string | string[] | undefined): string | undefined {
  return typeof value === "string" ? value : undefined;
}

/**
 * قصٌّ لا يشطر رمزاً: `slice` على وحدات UTF-16 قد يقطع زوجاً بديلاً (إيموجي)
 * فيبقى نصفه يتيماً — محرفٌ غير صالح يعبر إلى الحقل ثم إلى جسم الطلب.
 */
function sliceSafe(text: string, max: number): string {
  if (text.length <= max) return text;
  const cut = text.slice(0, max);
  const last = cut.charCodeAt(cut.length - 1);
  return last >= 0xd800 && last <= 0xdbff ? cut.slice(0, -1) : cut;
}

/**
 * اسم مكان صالح للعرض داخل سطر واحد، أو `undefined`.
 *
 * والفراغ المتكرر يُطوى إلى مسافة واحدة — نفس ما تفعله `cleanLine` في
 * `app/api/quote-request/route.ts` قبل الإرسال، فلا يفاجئ العميلَ فرقٌ بين ما
 * رآه في الحقل وما وصل الإدارة.
 */
function cleanLabel(raw: string | undefined): string | undefined {
  if (raw === undefined) return undefined;
  const cleaned = raw
    .replace(CONTROL_CHARS, " ")
    .replace(BIDI_CHARS, "")
    .replace(/\s+/g, " ")
    .trim();
  if (cleaned.length === 0) return undefined;
  return sliceSafe(cleaned, MAX_LABEL).trim() || undefined;
}

/** عدد ركاب صحيح داخل سقف الأسطول، أو `undefined` */
function cleanPassengers(raw: string | undefined): number | undefined {
  if (raw === undefined) return undefined;
  const trimmed = raw.trim();
  // خانات لاتينية فقط: هذا ما يكتبه الباني، وأي شكل آخر لا يُخمَّن
  if (!/^\d{1,4}$/.test(trimmed)) return undefined;
  const value = Number(trimmed);
  if (!Number.isInteger(value) || value < 1 || value > MAX_PASSENGERS) return undefined;
  return value;
}

/** موعد انطلاق داخل نافذة معقولة، معاداً بصيغة موحّدة، أو `undefined` */
function cleanPickup(raw: string | undefined): string | undefined {
  if (raw === undefined) return undefined;
  const trimmed = raw.trim();
  if (trimmed.length > 40 || !ISO_WITH_ZONE.test(trimmed)) return undefined;

  const ms = Date.parse(trimmed);
  if (!Number.isFinite(ms)) return undefined;

  // موعدٌ في سنة ٩٩٩٩ يُنسَّق بلا خطأ ويُظهر الحقل هزلياً — والنافذة تكفي
  const now = Date.now();
  if (ms < now - PAST_WINDOW_MS || ms > now + FUTURE_WINDOW_MS) return undefined;

  return new Date(ms).toISOString();
}

/**
 * يقرأ حمولة الرحلة من معاملات الرابط.
 *
 * المعامل الغائب أو غير الصالح **يغيب من الناتج** فلا يظهر «undefined» في الحقل
 * ولا رسالة خطأ: الصفحة تفتح كما تفتح اليوم بالضبط، والحقل يبدأ فارغاً.
 */
export function readTripPrefill(params: SearchParamsShape): QuoteTripPrefill {
  const prefill: QuoteTripPrefill = {};

  const from = cleanLabel(single(params.from));
  if (from) prefill.from = from;

  const to = cleanLabel(single(params.to));
  if (to) prefill.to = to;

  const passengers = cleanPassengers(single(params.passengers));
  if (passengers !== undefined) prefill.passengers = passengers;

  const pickupAt = cleanPickup(single(params.pickup));
  if (pickupAt) prefill.pickupAt = pickupAt;

  return prefill;
}

/** هل في الحمولة ما يستحق أن يُكتب في الحقل؟ */
export function hasTripPrefill(prefill: QuoteTripPrefill): boolean {
  return Boolean(prefill.from || prefill.to || prefill.passengers || prefill.pickupAt);
}
