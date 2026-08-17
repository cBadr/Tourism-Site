import { formatMoney } from "@/components/booking/format";
import { Badge } from "@/components/ui/badge";
import type { DispatchStatus, TripOfferStatus } from "@/lib/dispatch-types";
import { cn } from "@/lib/utils";
import { asNumber, asText, pick } from "../../orders/_components/booking-ui";

/**
 * لبنات مشتركة لشاشات البث والإسناد (لوحة `/admin/dispatch` + لوحة الطلب الواحد):
 * وسوم الحالات، قراءة صفوف الجداول قراءةً متسامحة، ورسائل الأخطاء.
 *
 * كلها مكوّنات خادمية الصلاحية (بلا "use client") — تُستدعى داخل مكوّنات الخادم فقط.
 * والقراءة متسامحة عمداً: جداول `dispatches` و`trip_offers` و`dispatch_settings`
 * يملكها وكيل SQL (هجرة 0013)، وقد لا تكون منفَّذة على القاعدة بعد — فلا يجوز أن
 * يُسقط عمودٌ مفقود شاشةً كاملة، ولا أن يُخترع رقم مكان رقم غائب.
 */

// ---------------------------------------------------------------------------
// حالة دورة البث للحجز ككل
// ---------------------------------------------------------------------------

export const DISPATCH_STATUSES: DispatchStatus[] = [
  "queued",
  "broadcasting",
  "assigned",
  "manual",
  "cancelled",
];

export const DISPATCH_STATUS_LABELS: Record<DispatchStatus, string> = {
  queued: "في الطابور",
  broadcasting: "بثّ جارٍ",
  assigned: "تم الإسناد",
  manual: "بانتظار إسناد يدوي",
  cancelled: "تم الإلغاء",
};

export const DISPATCH_STATUS_HINTS: Record<DispatchStatus, string> = {
  queued: "الحجز مؤهل للبث ولم تبدأ الموجة الأولى بعد.",
  broadcasting: "موجة معروضة على المتعهدين الآن وتنتظر ردودهم حتى انتهاء المهلة.",
  assigned: "فاز متعهد — إما بقبوله العرض أو بإسناد يدوي — وأُغلق الطلب أمام الباقين.",
  manual: "استُنفدت كل الموجات بلا قبول، والقرار الآن لفريق التشغيل يدوياً.",
  cancelled: "أُلغي الحجز فتوقف البث ولم يعد أي عرض قابلاً للقبول.",
};

const DISPATCH_TONE: Record<DispatchStatus, string> = {
  queued:
    "border-slate-300 bg-slate-100 text-slate-900 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-100",
  broadcasting:
    "border-sky-300 bg-sky-100 text-sky-900 dark:border-sky-700 dark:bg-sky-950 dark:text-sky-100",
  assigned:
    "border-violet-300 bg-violet-100 text-violet-900 dark:border-violet-700 dark:bg-violet-950 dark:text-violet-100",
  manual:
    "border-amber-300 bg-amber-100 text-amber-900 dark:border-amber-700 dark:bg-amber-950 dark:text-amber-100",
  cancelled:
    "border-red-300 bg-red-100 text-red-900 dark:border-red-700 dark:bg-red-950 dark:text-red-100",
};

export function isDispatchStatus(value: unknown): value is DispatchStatus {
  return typeof value === "string" && (DISPATCH_STATUSES as string[]).includes(value);
}

export function DispatchBadge({ status, className }: { status: string; className?: string }) {
  const known = isDispatchStatus(status);
  return (
    <Badge
      variant="outline"
      className={cn(known ? DISPATCH_TONE[status] : "border-border text-muted-foreground", className)}
    >
      {known ? DISPATCH_STATUS_LABELS[status] : status || "—"}
    </Badge>
  );
}

// ---------------------------------------------------------------------------
// حالة عرض واحد على متعهد بعينه
// ---------------------------------------------------------------------------

const OFFER_STATUSES: TripOfferStatus[] = [
  "pending",
  "accepted",
  "rejected",
  "expired",
  "revoked",
];

export const OFFER_STATUS_LABELS: Record<TripOfferStatus, string> = {
  pending: "بانتظار الرد",
  accepted: "تم القبول",
  rejected: "تم الرفض",
  expired: "انتهت المهلة",
  revoked: "تم الإغلاق",
};

export const OFFER_STATUS_HINTS: Record<TripOfferStatus, string> = {
  pending: "بُثَّ العرض ولم يردّ المتعهد بعد — المهلة ما زالت سارية.",
  accepted: "هذا هو الفائز: أول من ضغط «قبول»، وقفل القاعدة منع أي قبول آخر بعده.",
  rejected: "ردّ المتعهد بالرفض صراحةً — السبب مسجَّل إن كتبه.",
  expired: "انتهت المهلة بلا رد (تجاهل) — تُحتسب على المتعهد في تقييم أدائه.",
  revoked: "أُغلق العرض لأن متعهداً آخر قَبِل الطلب أو لأن التشغيل أسنده يدوياً.",
};

const OFFER_TONE: Record<TripOfferStatus, string> = {
  pending:
    "border-amber-300 bg-amber-100 text-amber-900 dark:border-amber-700 dark:bg-amber-950 dark:text-amber-100",
  accepted:
    "border-emerald-300 bg-emerald-100 text-emerald-900 dark:border-emerald-700 dark:bg-emerald-950 dark:text-emerald-100",
  rejected:
    "border-red-300 bg-red-100 text-red-900 dark:border-red-700 dark:bg-red-950 dark:text-red-100",
  expired: "border-border bg-muted text-muted-foreground",
  revoked: "border-border bg-muted text-muted-foreground",
};

export function isOfferStatus(value: unknown): value is TripOfferStatus {
  return typeof value === "string" && (OFFER_STATUSES as string[]).includes(value);
}

export function OfferBadge({ status }: { status: string }) {
  const known = isOfferStatus(status);
  return (
    <Badge
      variant="outline"
      className={cn(
        "whitespace-nowrap",
        known ? OFFER_TONE[status] : "border-border text-muted-foreground"
      )}
    >
      {known ? OFFER_STATUS_LABELS[status] : status || "—"}
    </Badge>
  );
}

// ---------------------------------------------------------------------------
// قراءة الصفوف — بأسماء أعمدة العقد، مع بدائل محتملة، وبلا أي افتراض قاتل
// ---------------------------------------------------------------------------

export type DispatchView = {
  bookingId: string | null;
  /** نص الحالة كما هو في القاعدة — الترجمة تقع في الوسم لا هنا */
  status: string;
  round: number | null;
  assignedSubcontractorId: string | null;
  assignedAt: string | null;
  assignedPayout: number | null;
  manualAssign: boolean;
  lastBroadcastAt: string | null;
  createdAt: string | null;
};

export function readDispatch(row: Record<string, unknown>): DispatchView {
  return {
    bookingId: asText(pick(row, ["booking_id"])),
    status: asText(pick(row, ["status"])) ?? "",
    round: asNumber(pick(row, ["round"])),
    assignedSubcontractorId: asText(
      pick(row, ["assigned_subcontractor_id", "subcontractor_id"])
    ),
    assignedAt: asText(pick(row, ["assigned_at"])),
    assignedPayout: asNumber(pick(row, ["assigned_payout", "payout"])),
    manualAssign: pick(row, ["manual_assign", "manual"]) === true,
    lastBroadcastAt: asText(pick(row, ["last_broadcast_at", "broadcast_at"])),
    createdAt: asText(pick(row, ["created_at"])),
  };
}

export type OfferView = {
  key: string;
  subcontractorId: string | null;
  round: number | null;
  payout: number | null;
  status: string;
  expiresAt: string | null;
  respondedAt: string | null;
  reason: string | null;
  createdAt: string | null;
};

export function readOffer(row: Record<string, unknown>, index: number): OfferView {
  return {
    key: asText(pick(row, ["id"])) ?? `offer-${index}`,
    subcontractorId: asText(pick(row, ["subcontractor_id"])),
    round: asNumber(pick(row, ["round"])),
    payout: asNumber(pick(row, ["payout"])),
    status: asText(pick(row, ["status"])) ?? "",
    expiresAt: asText(pick(row, ["expires_at"])),
    respondedAt: asText(pick(row, ["responded_at"])),
    reason: asText(pick(row, ["reason", "note"])),
    createdAt: asText(pick(row, ["created_at", "sent_at"])),
  };
}

// ---------------------------------------------------------------------------
// إعدادات البث — صف وحيد في `dispatch_settings`
// ---------------------------------------------------------------------------

/**
 * أسماء أعمدة صف الإعدادات كما يفرضها عقد `lib/dispatch-types.ts` بصيغة
 * snake_case — للكتابة وحدها.
 *
 * **القراءة لا تمر من هنا**: الشاشتان تقرآن الإعدادات بـ
 * `readDispatchSettings` في `lib/dispatch/settings.ts` — وهي نفس الدالة التي
 * يقرأ بها عامل البث. لو قرأت الواجهة بطريقتها الخاصة لأمكن أن تعرض قيمة
 * ويشتغل المحرّك بغيرها، وهذا أسوأ خلل ممكن في شاشة إعدادات.
 * الكتابة وحدها تحتاج الأسماء الصريحة، ومكانها هنا في موضع واحد.
 */
export const SETTINGS_COLUMNS = {
  windowMinutes: "window_minutes",
  maxRounds: "max_rounds",
  autoStart: "auto_start",
  minMarginAmount: "min_margin_amount",
} as const;

// ---------------------------------------------------------------------------
// الهامش الحقيقي — إشارة تشغيل لا قرار
// ---------------------------------------------------------------------------

/**
 * الهامش الحقيقي للرحلة = إجمالي الحجز − **إيراد الخدمات الإضافية** − مستحق
 * المتعهد المنفِّذ.
 *
 * الفارق عن «هامش الموقع» في بطاقة الربحية: ذاك لقطة لحظة التسعير محسوبة على
 * أرخص متعهد مغطٍّ، وهذا ما تحقق فعلاً بعد أن قَبِل متعهدٌ بعينه بمستحقه هو —
 * وقد يكون أعلى (الموجة ٢) فيأكل الهامش أو يقلبه خسارة. لذلك تُظهره الشاشة
 * صراحةً بدل تركه في رأس المحاسب.
 *
 * ── ولماذا تُطرح الخدمات (هجرة 0033) ──────────────────────────────────────
 * منذ 0031 صار `bookings.total` يحمل ثمن الخدمات الإضافية: `total = (ride −
 * discount) + extras`. والخدمة شيءٌ **ننفّذه نحن** ولا يراه المتعهد أصلاً
 * (القرار ج)، فعدُّها هامشاً يجعل صفقةً هامشها صفرٌ تبدو بهامش ٤٠٠ لأن العميل
 * اشترى كرسيَّي أطفال — وهذه الشاشة تلوّن الرقم بمقارنته بأرضية الهامش، فتُطلى
 * صفقةٌ تحت الأرضية **باللون الأخضر**. وهو نفس العيب الذي أصلحته 0032 في سقف
 * موجة البث و0033 في `realMargin` داخل حمولة إشعار الإسناد — والرقم هنا يجب أن
 * يطابق ما تُرسله القاعدة هناك حرفاً بحرف، وإلا صار للهامش رقمان.
 *
 * لماذا الطرح في الواجهة لا في SQL: الأعداد الثلاثة مخزَّنة جاهزة في مواضع
 * مختلفة (`bookings.total` · `bookings.trip -> 'extrasTotal'` ·
 * `dispatches.assigned_payout`) وPostgREST لا يُجري عمليات حسابية بينها. ولا
 * يُشتق هنا شيء: كل حدٍّ مقروء كما خزّنته القاعدة، والعملية طرحٌ محض.
 * متى أضافت هجرةٌ عموداً محسوباً للهامش فاقرأه بدل هذا الطرح.
 *
 * ⚠ **وهذا عرضٌ لا حارس — ولا حارس خلفه:** `manual_assign` تفحص الحالة والإيقاف
 * وأن المستحق غير سالب، **ولا تفحص سقفاً ولا أرضية هامش إطلاقاً** (‏0033 يقول
 * ذلك نصاً). فالإسناد اليدوي بمستحق يبتلع الهامش كله **ينجح**، وهذا الرقم هو
 * إشارة الهامش الوحيدة التي يراها المشغّل قبل الضغط. سقفُ الموجة
 * (`dispatch_ceiling`) يحرس مسار **البث** وحده لا هذا الزر.
 *
 * @param extrasTotal مجموع الخدمات من لقطة الحجز — و`null` تعني «لا مفتاح في
 *        اللقطة» أي حجزاً سابقاً لـ0031، وهي صفرٌ حقيقي لا قيمة مجهولة.
 */
export function realMargin(
  total: number | null,
  payout: number | null,
  extrasTotal: number | null
): number | null {
  if (total === null || payout === null) return null;
  return total - (extrasTotal ?? 0) - payout;
}

/** نبرة الهامش: خسارة / دون الأرضية / سليم */
export function marginTone(
  margin: number | null,
  floor: number | null
): "loss" | "thin" | "ok" | "unknown" {
  if (margin === null) return "unknown";
  if (margin < 0) return "loss";
  if (floor !== null && floor > 0 && margin < floor) return "thin";
  return "ok";
}

const MARGIN_CLASS: Record<"loss" | "thin" | "ok" | "unknown", string> = {
  loss: "border-red-300 bg-red-100 text-red-900 dark:border-red-700 dark:bg-red-950 dark:text-red-100",
  thin: "border-amber-300 bg-amber-100 text-amber-900 dark:border-amber-700 dark:bg-amber-950 dark:text-amber-100",
  ok: "border-emerald-300 bg-emerald-100 text-emerald-900 dark:border-emerald-700 dark:bg-emerald-950 dark:text-emerald-100",
  unknown: "border-border text-muted-foreground",
};

/** وسم الهامش الحقيقي — أحمر عند الخسارة، كهرماني تحت الأرضية */
export function MarginPill({
  margin,
  floor,
  currency,
  className,
}: {
  margin: number | null;
  floor: number | null;
  currency: string;
  className?: string;
}) {
  const tone = marginTone(margin, floor);
  return (
    <Badge variant="outline" className={cn("whitespace-nowrap", MARGIN_CLASS[tone], className)}>
      <span dir="ltr">{margin === null ? "—" : formatMoney(margin, currency)}</span>
    </Badge>
  );
}

// ---------------------------------------------------------------------------
// رسائل الأخطاء — مشتركة بين شاشة الإسناد وبطاقة الطلب
// ---------------------------------------------------------------------------

export const DISPATCH_ERRORS: Record<string, string> = {
  env: "قاعدة البيانات غير مربوطة — لا يمكن تنفيذ العملية بعد.",
  forbidden:
    "لا تملك صلاحية تنفيذ هذا الإجراء — يتطلب حساباً دوره admin. سجّل الدخول بحساب مشرف ثم أعد المحاولة.",
  save: "فشلت العملية — تأكد أنك مسجل الدخول بحساب دوره admin (راجع supabase/README.md، فخ الصفوف الصفرية).",
  missing: "لم يعد هذا السجل موجوداً — أعد تحميل الصفحة.",
  input: "بيانات الإجراء ناقصة أو غير صالحة — راجع الحقول ثم أعد المحاولة.",
  notready:
    "جداول البث والإسناد غير موجودة في قاعدة البيانات بعد — نفِّذ هجرة المرحلة ٦ من supabase/migrations ثم أعد المحاولة.",
  dstatus:
    "حالة البث الحالية لا تسمح بهذا الإجراء — يبدو أنها تغيّرت بعد فتح الصفحة (قد يكون متعهد قَبِل للتو). أعد تحميل الصفحة لترى الحالة الحقيقية.",
  broadcasting:
    "هناك موجة مفتوحة على هذا الطلب الآن، وقاعدة البيانات ترفض فتح موجة جديدة قبل انتهاء مهلتها. انتظر انتهاء المهلة، أو اضغط «تشغيل دورة الإسناد الآن» في شاشة الإسناد لتُنهي المهل المنتهية وتفتح الموجة التالية.",
  bstatus:
    "البث لا يبدأ إلا على حجز «تم التأكيد» — أي بعد اعتماد التحويل. اعتمد التحويل أولاً من بطاقة الإجراءات.",
  assigned:
    "الطلب مُسند بالفعل: قاعدة «أول قابل يفوز» أغلقته أمام الجميع. لإسناده لمتعهد آخر يلزم إجراء إعادة إسناد صريح.",
  nopartners:
    "لا يوجد متعهد معتمد يغطي هذا المسار بسقف تكلفة هذه الموجة — راجع قوائم الأسعار ونطاقاتها، أو أسنِد يدوياً.",
  exhausted:
    "استُنفدت كل موجات البث على هذا الطلب. ارفع «عدد الموجات» من إعدادات الإسناد ثم أعد البث، أو أسنِد يدوياً من هذه الشاشة.",
  autooff:
    "«البدء التلقائي» مطفأ في إعدادات الإسناد — فعّله ليبدأ البث فور اعتماد التحويل، أو ابدأ البث يدوياً من هنا.",
  margin:
    "المستحق المُدخل يترك هامشاً أقل من الأرضية المسموح بها في إعدادات الإسناد — عدّل المستحق أو ارفع الأرضية بعد قرار واعٍ.",
  payout: "قيمة المستحق غير صالحة — اكتب مبلغاً موجباً بالجنيه لا يتجاوز إجمالي الحجز بمراحل.",
  partner: "اختر متعهداً من القائمة قبل تأكيد الإسناد اليدوي.",
  note: "سبب الإسناد اليدوي إلزامي — يبقى في سجل الطلب مرجعاً لأي مراجعة لاحقة.",
  tick: "تعذّر تشغيل دورة الإسناد — تأكد أن دالة dispatch_tick منفَّذة في قاعدة البيانات وأن SUPABASE_SERVICE_ROLE_KEY مضبوط في البيئة.",
  nokey:
    "فتح موجة بث يحتاج SUPABASE_SERVICE_ROLE_KEY في ‎.env.local‎ (وفي متغيرات بيئة Vercel عند النشر) — أضفه ثم أعد تشغيل الخادم. هذا نفس المفتاح الذي يشغّل البث التلقائي عند اعتماد التحويل.",
  window: "مهلة الموجة يجب أن تكون رقماً صحيحاً من دقيقة واحدة إلى ٢٤ ساعة (١٤٤٠ دقيقة).",
  rounds: "عدد الموجات يجب أن يكون رقماً صحيحاً من ١ إلى ٥ — ما فوق ذلك تأخير للعميل بلا فائدة.",
  floor: "أرضية الهامش يجب أن تكون مبلغاً موجباً بالجنيه (الصفر يعني: امنع الخسارة فقط).",
  schema:
    "أعمدة جدول dispatch_settings لا تطابق أسماء العقد (window_minutes / max_rounds / auto_start / min_margin_amount) — راجع هجرة المرحلة ٦.",
};
