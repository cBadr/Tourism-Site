import type { NotificationChannel, NotificationEvent } from "@/lib/booking-types";

/**
 * أنواع أنبوب الإشعارات (المرحلة ٤ — قرار ٦: نمط Outbox).
 *
 * مصدر الحقيقة هو جدول `notifications` في Postgres: كل تغيّر حالة يكتب صفاً في
 * نفس معاملة التغيير، ثم يمرّ عامل الإرسال على الصفوف المصفوفة ويوزّعها على
 * القنوات. الفائدة: لا إشعار يضيع لو تعطّل تليجرام أو البريد، وكل محاولة مسجَّلة.
 *
 * أسماء الأحداث والقنوات من العقد `lib/booking-types.ts` — لا تُعرَّف هنا مجدداً.
 */

/** حالة صف الإشعار في الطابور */
export type NotificationStatus =
  | "queued" // بانتظار الإرسال
  | "sent" // وصل لقناة خارجية واحدة على الأقل
  | "skipped" // لا قناة خارجية صالحة (بيانات اعتماد ناقصة أو القناة مطفأة)
  | "failed"; // فشلت قناة خارجية — قابل لإعادة المحاولة من شاشة الإشعارات

/**
 * صف الإشعار كما يصل من قاعدة البيانات (snake_case).
 * الحقول اختيارية عمداً: العامل يعمل حتى لو اختلف الجدول قليلاً عن المتوقع
 * (مثلاً بلا عمود attempts) بدل أن ينهار الطابور كله.
 */
export type NotificationRecord = {
  id: string;
  event: NotificationEvent | string;
  payload: Record<string, unknown> | null;
  channels: string[] | null;
  status: NotificationStatus | string;
  attempts?: number | null;
  error?: string | null;
  created_at?: string | null;
  delivered_at?: string | null;
};

/**
 * نتيجة إرسال واحدة من موزّعي القنوات (تليجرام/البريد).
 * التمييز بين «متجاوَز» و«فاشل» جوهري: المتجاوَز ينتظر بيانات اعتماد ولا يستحق
 * إعادة محاولة آلية، والفاشل خلل مؤقت يستحقها.
 */
export type SendOutcome =
  | { ok: true; detail?: string }
  | { ok: false; skipped: string }
  | { ok: false; error: string };

/** هل النتيجة تجاوُز (لا خطأ)؟ */
export function isSkipped(outcome: SendOutcome): outcome is { ok: false; skipped: string } {
  return outcome.ok === false && "skipped" in outcome;
}

/** حصيلة قناة واحدة داخل إشعار واحد */
export type ChannelOutcome = {
  channel: NotificationChannel | string;
  result: "sent" | "skipped" | "failed";
  /** سبب التجاوز أو نص الخطأ — يظهر للمالك في شاشة الإشعارات */
  reason?: string;
};

/** حصيلة إشعار واحد بعد المرور على كل قنواته */
export type NotificationOutcome = {
  id: string;
  event: string;
  status: NotificationStatus;
  channels: ChannelOutcome[];
};

/**
 * ملخّص دورة تشغيل كاملة للعامل — لا يرمي استثناءً أبداً، يُرجع هذا دائماً.
 * `reason` يُملأ حين لا تُنفَّذ الدورة أصلاً (بيئة ناقصة أو جدول غير موجود).
 */
export type DispatchSummary = {
  ok: boolean;
  ranAt: string;
  processed: number;
  sent: number;
  skipped: number;
  failed: number;
  /** no-service-client | no-table | read-failed | empty-queue */
  reason?: string;
  results: NotificationOutcome[];
};

/** إحصاء الطابور — يخدم GET على مسار العامل وبطاقة الحالة في اللوحة */
export type QueueStats = {
  ok: boolean;
  queued: number;
  sent: number;
  skipped: number;
  failed: number;
  reason?: string;
};

/** حالة قناة من منظور «جاهزة للإرسال أم لا» — تغذّي بطاقة بيانات الاعتماد */
export type ChannelReadiness = {
  channel: NotificationChannel;
  label: string;
  ready: boolean;
  /** ما ينقص بالضبط، جاهزاً للعرض بالعربية */
  missing: string[];
};
