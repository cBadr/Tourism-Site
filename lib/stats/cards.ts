import type { FunnelEvent, StatCard } from "@/lib/analytics-types";

/**
 * عقد أسماء بطاقات المؤشرات ومراحل القمع بين شاشات الإحصائيات وهجرة 0022.
 *
 * `StatCard.key` في العقد نص حر، وهذا الملف يثبّت **المفاتيح التي تعرف الشاشة
 * كيف ترسمها بشكل خاص**. أي مفتاح آخر تُرجعه `section_stats` يظهر بطاقةً عادية
 * في الشبكة بلا تعديل في أي ملف — إضافة مؤشر جديد لقسم قائم يجب أن تكون هجرةً
 * فقط، لا هجرة + نشراً.
 *
 * المطابقة متسامحة بعدة أسماء مرشّحة تحسّباً لاختلاف تسمية بين وكيلين متوازيين
 * (النمط ٤ في `handover/LESSONS.md`، وقد كلّف هجرة كاملة). الاسم **الأول** في
 * كل قائمة هو الاسم المعتمد في 0022، والباقي شبكة أمان.
 */

/** بطاقة كما وصلت من القاعدة: عقد `StatCard` حرفياً + حقول قراءة اختيارية */
export type LoadedStatCard = StatCard & {
  /** ترتيب العرض إن أرجعته الدالة — 0022 لا تُرجعه فيبقى ترتيب الصفوف كما وصل */
  sort: number | null;
  /** وحدة المدة إن أرجعتها الدالة — 0022 تُرجع الدقائق فيبقى `null` */
  unit: string | null;
};

/** أول بطاقة يطابق مفتاحها أحد الأسماء المرشّحة */
export function findCard(cards: LoadedStatCard[], names: string[]): LoadedStatCard | null {
  for (const name of names) {
    const found = cards.find((card) => card.key === name);
    if (found) return found;
  }
  return null;
}

/** بطاقات بمفاتيح بعينها، بترتيب المفاتيح لا بترتيب وصولها */
export function cardsByKeys(cards: LoadedStatCard[], keys: string[]): LoadedStatCard[] {
  return keys
    .map((key) => cards.find((card) => card.key === key))
    .filter((card): card is LoadedStatCard => card !== undefined);
}

// ---------------------------------------------------------------------------
// القمع: أربع مراحل ومعدلات التحول بينها
// ---------------------------------------------------------------------------

/**
 * **نص واحد يشرح ما تقيسه أرقام القمع** — يظهر مع كل مرحلة وفي رأس اللوحة.
 *
 * سببه أن الفارق بين قاع القمع وعدد الحجوزات في «الطلبات» فارقٌ **صحيح**
 * ومقصود، وبلا هذه الجملة يقرؤه المالك يوماً على أنه عطب في النظام ويبني عليه
 * قراراً. (وهذا هو ما جعل النموذج السابق يُخرج معدل تحول يتجاوز ١٠٠٪: كان
 * يجمع قاعاً من جدول الحجوزات مع رأسٍ من سجل الأحداث.)
 */
export const FUNNEL_SCOPE_NOTE =
  "هذه الأرقام تقيس الرحلة على الموقع لا إجمالي أعمال الشركة: حجزٌ يُدخله فريق التشغيل هاتفياً — أو حجزٌ أُنشئ قبل تشغيل القياس — لا يظهر في القمع، وهذا صحيح لا نقص. الأرقام المرجعية للحجوزات والتحصيل مكانها قسم الطلبات وقسم الخزينة.";

/**
 * مراحل القمع الأربع، بمفاتيح **أسماء الأحداث في العقد نفسه** (`FunnelEvent`)
 * لا بأسماء مخترعة — فالاسم واحد من الحدث الذي يُكتب في `funnel_events` إلى
 * المرحلة التي تعرض عدده.
 *
 * **مصدر المراحل الأربع واحد**: `public.funnel_events` (هجرة 0023). المرحلة
 * لا تُعدّ من `bookings` ولا من `payments` ولا من `quote_requests` — خلط
 * المصادر هو ما جعل حجوزات ما قبل القياس والحجوزات الهاتفية تدخل قاع القمع
 * بلا رأس، فتتجاوز النسبة ١٠٠٪.
 *
 * و`quote_requested` و`booking_started` خارج السلسلة تماماً (`FUNNEL_SIDE`):
 * الأولى مسار دخول موازٍ والثانية فرع البوابة الإلكترونية — و«التحول» بين
 * مرحلتين غير متتاليتين رقم بلا معنى.
 */
export const FUNNEL_ORDER: {
  event: FunnelEvent;
  label: string;
  help: string;
  /** تفسير **معدل التحول إلى** هذه المرحلة — تعريفه يختلف باختلافها (0023 §٣) */
  rateHelp?: string;
}[] = [
  {
    event: "search_performed",
    label: "بحث عن رحلة",
    help: "زائر ملأ نقطتي الانطلاق والوصول وطلب السعر. يُسجَّل صفاً في جدول أحداث القمع داخل قاعدتنا — لا يعتمد على جوجل ولا يُسقطه مانع إعلانات.",
  },
  {
    event: "quote_viewed",
    label: "ظهرت العروض",
    help: "البحث انتهى بعروض أسعار معروضة فعلاً. الفارق بينه وبين البحث هو الرحلات خارج نطاق التغطية أو التي فشل تسعيرها.",
    rateHelp:
      "نسبة عمليات البحث التي انتهت بعروض معروضة. الحدثان يُكتبان معاً في اللحظة نفسها، فهذه النسبة لا تتجاوز ١٠٠٪ أبداً ولا يُفرض عليها سقف — وتجاوزها لو وقع يوماً يعني خللاً في القياس لا في السوق.",
  },
  {
    event: "booking_created",
    label: "أُنشئ الحجز",
    help: "الزائر أكمل بياناته على الموقع وأُنشئ له حجز برقم مرجعي — سواء دفع بعدها أم لا. يُعدّ من سجل أحداث القمع وحده، فحجزٌ أدخله فريق التشغيل هاتفياً لا يظهر هنا (عدده الكامل في قسم الطلبات).",
    rateHelp:
      "نسبة من رأى العروض ثم أنشأ حجزاً. وهي وحدها المسقوفة عند ١٠٠٪: نافذة الفترة تقطع الزمن، فزائرٌ رأى العروض أمس وحجز اليوم يظهر داخل النافذة بلا رأسه.",
  },
  {
    event: "booking_paid",
    label: "وصل التحصيل",
    help: "أول تحصيل معتمد لحجزٍ بدأ على الموقع: تحويل يدوي اعتمده التشغيل أو بوابة إلكترونية أكّدت الدفع. إعادة إرسال إشعار البوابة لا تضاعف الرقم — الأحداث الحاملة لنفس الرقم المرجعي تُعدّ مرة واحدة. والتحصيل الكامل للشركة في قسم الخزينة.",
    rateHelp:
      "من أُنشئ حجزه داخل الفترة، كم وصل تحصيله داخلها — لا نسبة عدّادين. التحويل البنكي يُعتمد بعد أيام من الحجز، فقد تحوي الفترة تحصيلات لحجوزات أقدم: تُحسب في الرقم المعروض أعلاه ولا تدخل هذه النسبة، وبهذا تبقى ≤ ١٠٠٪ حقيقةً لا بسقف يخفي الفارق.",
  },
];

/**
 * الحدثان **خارج السلسلة** — يُعرضان بعدّادهما وحده بلا معدل تحول.
 *
 * إبقاؤهما معروضين مقصود: كلاهما يُقاس فعلاً وله دلالة، وإخفاؤه يعني عمل قاعدة
 * بلا مستهلك. وإخراجهما من السلسلة مقصود بالقدر نفسه: نسبتهما إلى ما قبلهما
 * كانت رقماً لا يعني شيئاً.
 */
export const FUNNEL_SIDE: { event: FunnelEvent; label: string; help: string }[] = [
  {
    event: "quote_requested",
    label: "طلب عرض سعر يدوي",
    help: "مسار دخول موازٍ للحاسبة الفورية (الجولات والمناسبات وما لا تغطيه التعريفة). لا يقع بين مرحلتين من القمع فلا نسبة له. ارتفاعه مع ثبات الحجوزات يعني أن الحاسبة لا تغطي ما يطلبه الزوار.",
  },
  {
    event: "booking_started",
    label: "اختار وسيلة دفع إلكترونية",
    help: "فرعٌ داخل الحجز يُسجَّل عند فتح صفحة البوابة وحدها. والمسار الافتراضي في هذه المنصة تحويل بنكي يدوي لا يمر به — فصفرٌ هنا لا يعني «لا أحد يدفع»، ولذلك هو خارج السلسلة.",
  },
];

/** مفاتيح بطاقات مراحل القمع لو أُرجعت ضمن `section_stats('orders')` */
const STAGE_CARD_KEYS: Record<FunnelEvent, string[]> = {
  search_performed: ["search_performed", "funnel_search", "searches"],
  quote_viewed: ["quote_viewed", "funnel_quote", "quotes_viewed"],
  quote_requested: ["quote_requested", "funnel_quote_requested"],
  booking_started: ["booking_started", "funnel_booking_started"],
  booking_created: ["booking_created", "funnel_booking", "bookings_created"],
  booking_paid: ["booking_paid", "funnel_paid", "bookings_paid"],
};

/** مفاتيح بطاقات معدل التحول **إلى** كل مرحلة */
const RATE_CARD_KEYS: Partial<Record<FunnelEvent, string[]>> = {
  quote_viewed: ["cvr_quote_viewed", "funnel_cvr_quote"],
  booking_created: ["cvr_booking_created", "funnel_cvr_booking"],
  booking_paid: ["cvr_booking_paid", "funnel_cvr_paid"],
};

export type FunnelStageView = {
  event: FunnelEvent;
  label: string;
  help: string;
  /** القيمة كما وصلت من القاعدة — `null` تعني «لم تصل» لا «صفر» */
  value: number | null;
  /** معدل التحول **إلى** هذه المرحلة (٠–١٠٠) — `null` للأولى أو حين لم يصل */
  ratePercent: number | null;
  rateHelp: string | null;
};

/** حدث خارج السلسلة كما يُعرض: عدّاد وحده، بلا نسبة */
export type FunnelSideView = {
  event: FunnelEvent;
  label: string;
  help: string;
  /** القيمة كما وصلت من القاعدة — `null` تعني «لم تصل» لا «صفر» */
  value: number | null;
};

/**
 * صف مرحلة كما تُرجعه دالة ملخّص القمع في القاعدة.
 *
 * `funnel_daily` تُرجع القمع **يومياً** فقط، ولا يجوز جمع نقاطها هنا: التجميع
 * في TypeScript ممنوع بنص المرحلة، والقسمة فيه أخطر — مقام صفر يعني `NaN` على
 * شاشة المالك ورقماً يخالف أي تقرير آخر.
 *
 * لذلك تقرأ الشاشة `public.funnel_summary(p_from, p_to)` (هجرة 0023 §٣):
 *   `(key text, label text, value numeric, rate_percent numeric, in_chain boolean)`
 * — `in_chain` يفصل المراحل الأربع عن الحدثين الجانبيين، و`rate_percent` بمقياس
 * ٠–١٠٠ يُحسب على سابقتها **داخل السلسلة فقط**، و`null` للمرحلة الأولى
 * وللجانبيين ولكل مقام صفر.
 *
 * ومصدرها هو `funnel_counts` نفسه الذي تقرأ منه `funnel_daily` — فمجموع الرسم
 * يساوي رقم البطاقة فوقه بالبناء، ويؤكده الاختبار (ج-ب) في
 * `supabase/tests/analytics_tests.sql`. وحين تتعذّر قراءتها (هجرة لم تُنفَّذ)
 * يعرض الرسم حالة فراغ تسمّيها بدل رقم مخترع.
 */
export type FunnelSummaryRow = {
  key: string;
  label: string | null;
  value: number | null;
  ratePercent: number | null;
  /** `null` تعني «لم تُرجعه القاعدة» — قاعدة توقّفت عند 0022 */
  inChain: boolean | null;
};

/** يبني المراحل الأربع من صفوف `funnel_summary` */
export function stagesFromSummary(rows: FunnelSummaryRow[]): FunnelStageView[] {
  return FUNNEL_ORDER.map((stage, index) => {
    const row = rows.find((r) => r.key === stage.event) ?? null;
    return {
      event: stage.event,
      label: row?.label ?? stage.label,
      help: stage.help,
      value: row?.value ?? null,
      ratePercent: index === 0 ? null : (row?.ratePercent ?? null),
      // تعريف النسبة يختلف بين المراحل (بلا سقف / بسقف / كوهورت) فلا يجوز نصٌّ
      // عامّ واحد يقول للثلاث «مسقوفة عند ١٠٠٪» — كان أحدها كذباً على المالك.
      rateHelp: stage.rateHelp ?? null,
    };
  });
}

/**
 * يبني الحدثين الجانبيين من صفوف `funnel_summary`.
 *
 * 🔒 النسبة **لا تُقرأ هنا إطلاقاً** ولا يوجد لها حقل في `FunnelSideView`:
 * القاعدة تُرجع `null` لهما، وما لا وجود له في النوع لا يظهر على الشاشة بخطأ.
 */
export function sideFromSummary(rows: FunnelSummaryRow[]): FunnelSideView[] {
  return FUNNEL_SIDE.map((side) => {
    const row = rows.find((r) => r.key === side.event) ?? null;
    return {
      event: side.event,
      label: row?.label ?? side.label,
      help: side.help,
      value: row?.value ?? null,
    };
  });
}

/** هل وصل عدّاد واحد على الأقل للحدثين الجانبيين؟ */
export const hasSideValues = (side: FunnelSideView[]): boolean =>
  side.some((one) => one.value !== null);

/**
 * مسار احتياطي: بناء المراحل من بطاقات `section_stats('orders')` إن أرجعتها
 * يوماً ما بمفاتيح الأحداث. لا يقع اليوم — موجود كي لا يحتاج توسيعُ الهجرة
 * لاحقاً أي تعديل في الواجهة.
 */
export function stagesFromCards(cards: LoadedStatCard[]): FunnelStageView[] {
  return FUNNEL_ORDER.map((stage, index) => {
    const card = findCard(cards, STAGE_CARD_KEYS[stage.event]);
    const rateKeys = RATE_CARD_KEYS[stage.event];
    const rateCard = index === 0 || !rateKeys ? null : findCard(cards, rateKeys);
    return {
      event: stage.event,
      label: card?.label ?? stage.label,
      help: card?.help ?? stage.help,
      value: card?.value ?? null,
      ratePercent: rateCard?.value ?? null,
      rateHelp: rateCard?.help ?? null,
    };
  });
}

/** كل المفاتيح التي يستهلكها رسم القمع — لاستبعادها من شبكة البطاقات */
const FUNNEL_CARD_KEYS = new Set<string>([
  ...Object.values(STAGE_CARD_KEYS).flat(),
  ...Object.values(RATE_CARD_KEYS).flat(),
]);

/** بطاقات القسم بلا بطاقات القمع (إن وُجدت) */
export function cardsWithoutFunnel(cards: LoadedStatCard[]): LoadedStatCard[] {
  return cards.filter((card) => !FUNNEL_CARD_KEYS.has(card.key));
}

/** هل في المراحل قيمة واحدة على الأقل؟ وإلا فلا رسم قمع بل رسالة صريحة */
export const hasFunnelValues = (stages: FunnelStageView[]): boolean =>
  stages.some((stage) => stage.value !== null);
