import type { DispatchSettings, DispatchStatus, TripOfferStatus } from "@/lib/dispatch-types";

/**
 * أنواع طبقة تشغيل البث في TypeScript — الغلاف حول دوال Postgres (هجرة 0013).
 *
 * قاعدة هذه الطبقة كلها: **لا منطق قرار هنا**. من يقرر انتهاء المهلة، ومن
 * يستحق الموجة التالية، ومن يفوز بالطلب — كله في SQL. ما هنا مجرد نقل نتيجة
 * الدالة إلى شكل ثابت تقرؤه الواجهة والمهمة المجدولة، ولا يرمي استثناءً أبداً
 * (نفس عقد عامل الإشعارات في المرحلة ٤: ملخّص دائماً، حتى عند الفشل).
 */

/**
 * سبب عدم تنفيذ الدورة — يُعرض كما هو في الرد ويقرؤه المالك:
 *   already-running   دورة أخرى جارية في نفس العملية
 *   no-service-client مفتاح SUPABASE_SERVICE_ROLE_KEY ناقص
 *   no-function       دالة dispatch_tick غير موجودة (هجرة 0013 لم تُطبَّق)
 *   no-table          جداول البث غير موجودة
 *   rpc-failed        الدالة موجودة وفشلت — النص في `raw`
 *   worker-error      خلل غير متوقع في الغلاف نفسه
 */
export type DispatchTickReason =
  | "already-running"
  | "no-service-client"
  | "no-function"
  | "no-table"
  | "rpc-failed"
  | "worker-error";

/** ملخّص دورة بث واحدة — ما رجعته `dispatch_tick()` مُطبَّعاً */
export type DispatchTickSummary = {
  ok: boolean;
  ranAt: string;
  /** عروض انتهت مهلتها في هذه الدورة (تحولت إلى expired) */
  expiredOffers: number;
  /** موجات جديدة بُثّت (round + 1) */
  newRounds: number;
  /** عروض جديدة أُنشئت في تلك الموجات */
  newOffers: number;
  /** حجوزات استُنفدت موجاتها فتحولت إلى الطابور اليدوي */
  escalated: number;
  /** كم حجزاً مسّته الدورة إجمالاً */
  processed: number;
  reason?: DispatchTickReason | string;
  /** ما رجع من القاعدة حرفياً — لا يُفقد شيء مهما اختلف شكل الدالة */
  raw: unknown;
};

/** حصيلة محاولة بدء البث لحجز واحد */
export type StartDispatchResult = {
  ok: boolean;
  bookingId: string;
  /** هل بدأ البث فعلاً؟ false مع ok=true تعني تخطياً مقصوداً (autoStart مطفأ مثلاً) */
  started: boolean;
  /**
   * auto-start-off | invalid-booking | no-service-client | no-function |
   * no-table | already-dispatching | rpc-failed | worker-error
   */
  reason?: string;
  /** رسالة القاعدة عند الفشل — للسجل لا للعرض للعميل */
  detail?: string;
};

/** إحصاء طابور البث — يخدم GET على مسار الدورة وبطاقة الحالة في اللوحة */
export type DispatchQueueStats = {
  ok: boolean;
  ranAt: string;
  /** عدد الحجوزات في كل حالة بث */
  dispatches: Record<DispatchStatus, number>;
  /** عدد العروض في كل حالة */
  offers: Record<TripOfferStatus, number>;
  /** عروض تجاوزت مهلتها ولم تُغلق بعد — أي أن الدورة متأخرة عن موعدها */
  overdueOffers: number;
  /** الإعدادات السارية (أو الافتراضية عند غياب الجدول) */
  settings: DispatchSettings;
  /** هل قُرئت الإعدادات من الجدول فعلاً؟ */
  settingsLoaded: boolean;
  reason?: string;
};
