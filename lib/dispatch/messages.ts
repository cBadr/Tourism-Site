import {
  formatDistance,
  formatMoney,
  hoursText,
  passengersLabel,
  toArabicDigits,
} from "@/components/booking/format";
import {
  bookingPath,
  bookingReference,
  formatDateTime,
  str,
  type MessageLine,
  type RenderContext,
  type RenderedMessage,
} from "@/lib/notifications/render";
import type { EscalationCode, RecipientKind } from "@/lib/partner-alerts-types";

/**
 * صياغة رسائل أحداث البث الأربعة بالعربية (`DispatchNotificationEvent`).
 *
 * وحدة محايدة عمداً — بلا `server-only` وبلا أي استيراد خادمي — حتى يستعملها
 * عامل الإرسال في الخادم وجرس اللوحة في المتصفح بنفس النص، تماماً كما تفعل
 * `lib/notifications/render.ts` لأحداث المرحلة ٤.
 *
 * ── قاعدة الخصوصية (قرار ٢ في عقد المرحلة ٦) ────────────────────────────────
 * رسالة `trip_offered` تذهب إلى **متعهد لم يقبل الطلب بعد**، فيمنع فيها منعاً
 * باتاً: اسم العميل، هاتفه، واتسابه، عنوانه الدقيق، وسعر العميل. المسموح: نقطتا
 * المسار العامّتان، وصف الرحلة، **مستحق المتعهد وحده**، والمهلة. هذا الملف لا
 * يقرأ حقول العميل أصلاً في فرع العرض — الحارس بالبناء لا بالمراجعة.
 *
 * 🔒 **ومنها مرجع الحجز نفسه (0056).** كان سطر «رقم الطلب» يُطبع من
 * `payload.reference` **لكلا الجمهورين**، فيتسلّم المتعهد على تليجرام المفتاحَ
 * الذي أزالته 0028 من `portal_offers`: المرجع + الهاتف الذي يملكه أصلاً =
 * نموذج «تابع حجزك» ⇒ صفحة العميل ⇒ إجماليه ⇒ هامشنا. فصار ما يقرؤه هذا الملف
 * لجمهور المتعهد **`tripCode` وحده** (`audienceReference` أدناه)، وحُذف المرجع
 * من الحمولة العامة في القاعدة — طبقتان، لأن إحداهما وحدها تُنسى عند أول حدثٍ
 * جديد يُوجَّه إلى متعهد.
 *
 * الحمولة يكتبها مُنتِج الإشعار في SQL، فتُقرأ بتسامح (snake_case وcamelCase
 * معاً عبر `str` المشتركة) ويُتخطى أي حقل غائب: رسالة ناقصة سطراً أفضل من
 * إشعار لا يصل.
 *
 * ── مفاتيح الحمولة التي تقرؤها هذه الوحدة (كلها اختيارية) ───────────────────
 *   المشترك:        trip_code (للمتعهد) · reference (للتشغيل وحده)،
 *                   booking_id, round, max_rounds, currency,
 *                   origin_label, dest_label, distance_km, class_title,
 *                   passengers, round_trip, waiting_hours, pickup_at
 *   trip_offered:   payout, expires_at, window_minutes, notes,
 *                   company_name, partner_telegram_chat_id, partner_email
 *   trip_assigned:  company_name, partner_phone, payout, total,
 *                   margin_amount, manual_assign
 *   round_expired:  round, next_round, pending_count
 *   exhausted:      rounds, offers_count, total, priced_cost
 * أي مفتاح إضافي يُتجاهَل بلا ضرر، وأي مفتاح ناقص يحذف سطره فقط.
 */

export type DispatchAudience = "partner" | "ops";

type Payload = Record<string, unknown> | null | undefined;

/** أحداث هذه المرحلة — مطابقة لـ `DispatchNotificationEvent` في العقد */
export const DISPATCH_EVENTS = [
  "trip_offered",
  "trip_assigned",
  "dispatch_round_expired",
  "dispatch_exhausted",
] as const;

export type DispatchEvent = (typeof DISPATCH_EVENTS)[number];

export function isDispatchEvent(event: string): event is DispatchEvent {
  return (DISPATCH_EVENTS as readonly string[]).includes(event);
}

/** عناوين الأحداث كما تظهر في الجرس وفي جدول الإشعارات */
export const DISPATCH_EVENT_TITLES: Record<DispatchEvent, string> = {
  trip_offered: "عرض رحلة جديد",
  trip_assigned: "أُسندت الرحلة إلى متعهد",
  dispatch_round_expired: "انتهت مهلة موجة البث",
  dispatch_exhausted: "لم يقبل أي متعهد — إسناد يدوي",
};

export const DISPATCH_EVENT_EMOJI: Record<DispatchEvent, string> = {
  trip_offered: "📢",
  trip_assigned: "🤝",
  dispatch_round_expired: "⏳",
  dispatch_exhausted: "🆘",
};

// ---------------------------------------------------------------------------
// قراءة الحمولة
// ---------------------------------------------------------------------------

const toSnake = (key: string) => key.replace(/([a-z0-9])([A-Z])/g, "$1_$2").toLowerCase();

/** بوليان من الحمولة — `str` لا تُرجع البوليانات فنقرؤها هنا مباشرة */
function flag(payload: Payload, key: string): boolean {
  if (!payload || typeof payload !== "object") return false;
  for (const name of [key, toSnake(key)]) {
    const v = (payload as Record<string, unknown>)[name];
    if (v === true || v === "true") return true;
  }
  return false;
}

function num(payload: Payload, key: string): number | null {
  const v = str(payload, key);
  if (v === null) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function firstStr(payload: Payload, keys: string[]): string | null {
  for (const key of keys) {
    const v = str(payload, key);
    if (v) return v;
  }
  return null;
}

function firstNum(payload: Payload, keys: string[]): number | null {
  for (const key of keys) {
    const v = num(payload, key);
    if (v !== null) return v;
  }
  return null;
}

function push(lines: MessageLine[], label: string, value: string | null | undefined) {
  if (value) lines.push({ label, value });
}

function money(value: number | null, currency: string): string | null {
  return value === null ? null : formatMoney(value, currency);
}

/** صيغة الجمع العربية للدقائق — نفس منطق واجهة الحجز */
function minutesText(count: number): string {
  const n = Math.max(0, Math.round(count));
  if (n === 1) return "دقيقة واحدة";
  if (n === 2) return "دقيقتان";
  if (n <= 10) return `${toArabicDigits(n)} دقائق`;
  return `${toArabicDigits(n)} دقيقة`;
}

/** «الموجة ٢ من ٣» أو «الموجة ٢» حين لا نعرف الحد الأقصى */
function roundLabel(round: number | null, maxRounds: number | null): string | null {
  if (round === null) return null;
  const head = `الموجة ${toArabicDigits(round)}`;
  return maxRounds !== null && maxRounds > 0 ? `${head} من ${toArabicDigits(maxRounds)}` : head;
}

/** «القاهرة ← الغردقة» — نقطتان عامّتان لا عنوان دقيق */
function routeLabel(payload: Payload): string | null {
  const from = firstStr(payload, ["originLabel", "origin", "from"]);
  const to = firstStr(payload, ["destLabel", "destinationLabel", "destination", "to"]);
  if (from && to) return `${from} ← ${to}`;
  return from ?? to;
}

/** «SUV · ٤ ركاب · ذهاب وعودة · انتظار ساعتان» */
function tripLabel(payload: Payload): string | null {
  const parts: string[] = [];
  const cls = firstStr(payload, ["classTitle", "className", "classSlug"]);
  if (cls) parts.push(cls);
  const passengers = num(payload, "passengers");
  if (passengers !== null && passengers > 0) parts.push(passengersLabel(passengers));
  if (flag(payload, "roundTrip")) parts.push("ذهاب وعودة");
  const waiting = num(payload, "waitingHours");
  if (waiting !== null && waiting > 0) parts.push(`انتظار ${hoursText(waiting)}`);
  return parts.length > 0 ? parts.join(" · ") : null;
}

function distanceLabel(payload: Payload): string | null {
  const km = firstNum(payload, ["distanceKm", "distance"]);
  return km !== null && km > 0 ? formatDistance(km) : null;
}

function companyName(payload: Payload): string | null {
  return firstStr(payload, ["companyName", "subcontractorName", "partnerName"]);
}

/**
 * رمز الرحلة كما يراه المتعهد: `#A1B2C3D4` — مشتقٌّ من معرّف الحجز
 * (`partner_trip_code` في القاعدة)، وتعرضه له `portal_offers` و`portal_trips`
 * وصندوق البورتال بالاسم نفسه منذ 0028.
 */
function tripCode(payload: Payload): string | null {
  return firstStr(payload, ["tripCode", "partnerTripCode"]);
}

/**
 * 🔒 **المعرّف المسموح لهذا الجمهور — وهو الحارس البنيوي كله.**
 *
 * فرعُ المتعهد **لا يقرأ `reference` إطلاقاً**: لا شرطاً ولا احتياطاً ولا
 * `??`. فحتى لو حملت حمولةٌ قديمة في الطابور مرجعَ العميل، أو أعادته هجرةٌ
 * قادمة إلى النصف العام سهواً، **لا يوجد في هذا الملف مسارٌ يطبعه للمتعهد**.
 * والاحتياطُ لو كُتب هنا `tripCode ?? reference` لكان أعاد العيب حرفياً في
 * أول صفٍّ لم يُحدَّث — وهو بالضبط شكل الانحدار الذي وقع في 0031 (D-58).
 *
 * وفرعُ التشغيل بالعكس: المرجع أولاً لأن المالك يطابق به ما يقوله العميل،
 * والرمز بديلاً حين يكون الصفُّ صفَّ متعهدٍ صُعِّد إليه (حمولته عامّة بلا مرجع).
 */
function audienceReference(payload: Payload, audience: DispatchAudience): string | null {
  if (audience === "partner") return tripCode(payload);
  return bookingReference(payload) ?? tripCode(payload);
}

// ---------------------------------------------------------------------------
// توجيه الرسالة: المتعهد أم فريق التشغيل؟
// ---------------------------------------------------------------------------

export type DispatchRecipients = {
  audience: DispatchAudience;
  telegramChatId: string | null;
  emailTo: string | null;
  /**
   * 🔒 رمزُ سبب التصعيد حين يسقط الجمهور من «متعهد» إلى «تشغيل». رمزٌ لا جملة،
   * ويُخزَّن على الصف ليعرف المالك **لماذا** وصله عرضٌ كان لغيره.
   */
  escalation?: EscalationCode;
};

/** وسائل تواصل المتعهد كما تكتبها SQL في حمولة الإشعار (كلها اختيارية) */
export function partnerContacts(payload: Payload): {
  telegramChatId: string | null;
  emailTo: string | null;
} {
  return {
    telegramChatId: firstStr(payload, [
      "partnerTelegramChatId",
      "subcontractorTelegramChatId",
      "telegramChatId",
    ]),
    emailTo: firstStr(payload, ["partnerEmail", "subcontractorEmail"]),
  };
}

/**
 * حالة القنوات وقت التسليم — المطلوبة في صف الإشعار، والمفعَّلة **عند صاحبها**.
 *
 * ⚠ ومنذ 0054 صار «المفعَّلة» يعني شيئين مختلفين بحسب الجمهور: إعدادات المالك
 * لصفوف التشغيل، و**تفضيلات المتعهد نفسه** لصفوفه هو. والمنادي هو من يملأها
 * من المصدر الصحيح — وهذا هو التوجيه لكل مستقبِل بعينه.
 */
export type ChannelState = {
  /** ما طُلب فعلاً لهذا الصف (`notification_channels_for()` وقت الإدراج) */
  requested: readonly string[];
  telegramEnabled: boolean;
  emailEnabled: boolean;
  /** دفع الويب — القناة البالغة الثالثة (0054). الغياب = غير مفعَّلة */
  webpushEnabled?: boolean;
  /** وهل له اشتراك جهازٍ واحد فعلاً؟ قناةٌ بلا جهاز مسجَّل لا تبلغ أحداً */
  webpushSubscribed?: boolean;
};

/** من هو مستقبِل هذا الصف كما تقوله القاعدة (0054) */
export type RecipientState = {
  kind: RecipientKind;
  /** هل عُثر على المتعهد فعلاً؟ معرّفٌ يتيم يصعّد بـ`partner-not-found` */
  found: boolean;
};

/**
 * إلى أين تذهب الرسالة؟
 *
 * `trip_offered` وحده موجَّه للمتعهد — **إن كان بالغاً على قناةٍ تعمل الآن**.
 * وإلا سقطت على فريق التشغيل ليبلّغه هاتفياً، لا تُبتلع بصمت. أما الأحداث
 * الثلاثة الأخرى فتشغيلية بحتة ووجهتها اللوحة دائماً.
 *
 * ── ⚠ ولماذا صار الشرط «بالغ» بدل «له عنوان» ──────────────────────────────
 *
 * كان الشرط `partner.telegramChatId || partner.emailTo` — أي **مجرّد وجود
 * عنوان**، أياً كانت قناته. والقياس على القاعدة الحيّة كشف أن هذا يُسقط الرسالة
 * كلها في الحالة **الشائعة لا النادرة**:
 *
 * | الحلقة | الواقع المقيس |
 * |---|---|
 * | القنوات المطلوبة | `{dashboard, telegram}` — البريد مستبعَد لأن `emailTo` التشغيلي فارغ |
 * | حمولة العرض | تحمل `partnerEmail` **فقط**؛ ولا متعهد يسجّل معرّف تليجرام |
 * | فالقرار | `audience = "partner"` لأنه «يملك عنواناً» |
 * | فالتسليم على تليجرام | بلا وجهة ⇒ يُوسم «تجاوز» |
 * | والاحتياطي إلى التشغيل | **لا يعمل** — فالجمهور صار «متعهد» |
 *
 * أي أن **الاحتياطي المبنيّ تحديداً لمنع الابتلاع الصامت يتخطّاه الشرط الذي وُجد
 * ليمسكه**. وطبقة التسليم كانت تعرف الحالة وتسمّيها «لا معرّف تليجرام لهذا
 * المتعهد» — لكنها عاملتها **تجاوزَ قناة** لا **تعذّرَ بلوغ**، والفرق بينهما هو
 * كل شيء: الأول يعني «جرّب غيرها»، والثاني يعني «أبلغ إنساناً».
 *
 * وعرضُ الرحلة ليس إشعاراً كمالياً: دورة البث تنتهي بمهلة (`dispatch_round_expired`)،
 * فعرضٌ لا يصل صاحبه ينتهي غير مقروء وتُعاد الرحلة إلى الطابور.
 *
 * 🔒 **والقناة `dashboard` لا تجعل المتعهد بالغاً**: صفُّ الإشعار سطحُ الإدارة لا
 * البورتال — والمتعهد يقرأ عروضه من `portal_offers()` — فاعتبارها بلوغاً يعني
 * «أُرسل إليه» عن شيءٍ لن يراه ما لم يفتح الشاشة من تلقائه.
 */
export function dispatchRecipients(
  event: string,
  payload: Payload,
  ops: { telegramChatId: string | null; emailTo: string | null },
  channels?: ChannelState,
  recipient?: RecipientState
): DispatchRecipients {
  /**
   * ── ومنذ 0054: الوجهة تُقرأ من الصف لا تُستنتج من اسم الحدث ──────────────
   *
   * `recipient_kind` عمودٌ على `notifications` تكتبه `queue_notification`.
   * واستنتاجُها من `event === "trip_offered"` كان صحيحاً ما دام حدثاً واحداً
   * موجَّهاً للمتعهد؛ وأولُ حدثٍ ثانٍ يُوجَّه إليه كان سيذهب إلى المالك بصمت.
   *
   * والشرط القديم يبقى **فرعاً احتياطياً** لصفوفٍ أُدرجت قبل الهجرة وما زالت
   * في الطابور: بلا العمود، `trip_offered` وحده يُعامَل معاملة المتعهد.
   */
  const partnerBound =
    recipient !== undefined ? recipient.kind === "partner" : event === "trip_offered";

  if (partnerBound) {
    const toOps = (escalation: EscalationCode): DispatchRecipients => ({
      audience: "ops",
      telegramChatId: ops.telegramChatId,
      emailTo: ops.emailTo,
      escalation,
    });

    // معرّفُ مستقبِلٍ لا يقابل متعهداً (حُذف أو بياناتٌ قديمة): لا تُبتلع الرسالة
    if (recipient?.kind === "partner" && !recipient.found) {
      return toOps("partner-not-found");
    }

    const partner = partnerContacts(payload);

    /**
     * بلا وصفٍ للقنوات نعود إلى السلوك القديم (وجود عنوان يكفي) — لأن الوسيط
     * اختياري كي لا ينكسر أي منادٍ لم يُحدَّث بعد. والمنادي الحقيقي الوحيد
     * (`lib/notifications/dispatch.ts`) يمرّره، فالمسار العامل محروس.
     *
     * 🔒 و`inbox` **ليس في هذه القائمة** كما أن `dashboard` ليس فيها: كلاهما
     * يستلزم أن ينظر صاحبه، فاعتباره بلوغاً يُسكِت الاحتياطي في الحالة التي
     * وُجد لها بالضبط. القائمة هنا هي القنوات **البالغة** وحدها.
     */
    const reachable = channels
      ? (channels.requested.includes("telegram") &&
          channels.telegramEnabled &&
          Boolean(partner.telegramChatId)) ||
        (channels.requested.includes("email") &&
          channels.emailEnabled &&
          Boolean(partner.emailTo)) ||
        (channels.requested.includes("webpush") &&
          Boolean(channels.webpushEnabled) &&
          Boolean(channels.webpushSubscribed))
      : Boolean(partner.telegramChatId || partner.emailTo);

    if (reachable) {
      return { audience: "partner", ...partner };
    }
    return toOps("partner-unreachable");
  }
  return { audience: "ops", telegramChatId: ops.telegramChatId, emailTo: ops.emailTo };
}

// ---------------------------------------------------------------------------
// بناء الرسالة
// ---------------------------------------------------------------------------

function dispatchLink(
  payload: Payload,
  ctx: RenderContext,
  audience: DispatchAudience
): { label: string; href: string } | null {
  const base = (ctx.baseUrl ?? "").replace(/\/+$/, "");

  if (audience === "partner") {
    return { label: "صندوق طلباتي في البورتال", href: `${base}/portal/requests` };
  }

  const bookingId = firstStr(payload, ["bookingId", "id"]);
  if (bookingId) {
    return { label: "صفحة الطلب في اللوحة", href: `${base}/admin/orders/${bookingId}` };
  }

  // احتياط: لو لم تحمل الحمولة معرّف الحجز نستعمل رابط المتابعة العام
  const path = bookingPath(payload);
  return path ? { label: "صفحة متابعة الحجز", href: `${base}${path}` } : null;
}

/**
 * يبني رسالة حدث بث واحد. الأسطر مرتّبة بأولوية التصرّف: ما يحتاجه المستلم
 * ليقرر فوراً (المرجع، المسار، المبلغ، المهلة) قبل التفاصيل.
 */
export function renderDispatchNotification(
  event: DispatchEvent,
  payload: Payload,
  ctx: RenderContext,
  audience: DispatchAudience = "ops"
): RenderedMessage {
  const currency = str(payload, "currency") ?? ctx.currency;
  // 🔒 0056: المرجع بحسب الجمهور — المتعهد يرى رمز الرحلة، والتشغيل يرى المرجع
  const reference = audienceReference(payload, audience);
  const lines: MessageLine[] = [];

  const route = routeLabel(payload);
  const trip = tripLabel(payload);
  const pickup = formatDateTime(firstStr(payload, ["pickupAt", "pickup"]));
  const round = firstNum(payload, ["round", "roundNumber"]);
  const maxRounds = firstNum(payload, ["maxRounds", "roundsMax", "maxRound"]);
  const company = companyName(payload);
  const payout = firstNum(payload, ["payout", "assignedPayout", "cost"]);

  const title = DISPATCH_EVENT_TITLES[event];
  const emoji = DISPATCH_EVENT_EMOJI[event];
  let lead: string;

  switch (event) {
    case "trip_offered": {
      // ⛔ لا اسم عميل ولا هاتف ولا سعر عميل في هذا الفرع — قرار الخصوصية
      const expires = formatDateTime(firstStr(payload, ["expiresAt", "expireAt"]));
      const windowMinutes = firstNum(payload, ["windowMinutes", "window"]);

      lead =
        audience === "partner"
          ? `وصلك عرض رحلة جديد من ${ctx.brandName}. راجع التفاصيل واقبله من صندوق طلباتك قبل انتهاء المهلة — أول متعهد يقبل يفوز بالرحلة.`
          : `بُث عرض رحلة على متعهد لا نملك له وسيلة تواصل مسجَّلة. أبلغه هاتفياً أو أضف بياناته من صفحة المتعهدين قبل انتهاء المهلة.`;

      // «رقم الطلب» للمتعهد = رمز الرحلة `#A1B2C3D4` — نفس ما تعرضه له شاشة
      // `/portal/requests`، فيبقى الطرفان على معرّفٍ واحد بلا مفتاح «تابع حجزك»
      push(lines, "رقم الطلب", reference);
      if (audience === "ops") push(lines, "المتعهد", company);
      push(lines, "المسار", route);
      push(lines, "المسافة", distanceLabel(payload));
      push(lines, "الرحلة", trip);
      push(lines, "موعد الانطلاق", pickup);
      push(lines, audience === "partner" ? "مستحقك" : "مستحق المتعهد", money(payout, currency));
      push(lines, "تنتهي المهلة", expires);
      if (windowMinutes !== null && windowMinutes > 0) {
        push(lines, "مدة المهلة", minutesText(windowMinutes));
      }
      push(lines, "الموجة", roundLabel(round, maxRounds));
      push(lines, "ملاحظات", firstStr(payload, ["notes", "note"]));
      break;
    }

    case "trip_assigned": {
      const manual = flag(payload, "manualAssign") || flag(payload, "manual");
      const total = firstNum(payload, ["total", "customerPrice", "price"]);
      const margin =
        firstNum(payload, ["marginAmount", "margin", "realMargin"]) ??
        (total !== null && payout !== null ? total - payout : null);

      lead = manual
        ? `أُسندت الرحلة يدوياً${company ? ` إلى «${company}»` : ""} وأُغلق الطلب أمام باقي المتعهدين. تابع التنفيذ وأبلغ العميل.`
        : `قبل${company ? ` «${company}»` : " أحد المتعهدين"} الرحلة وفاز بها، وأُغلقت أمام الباقين. تابع التنفيذ وأبلغ العميل بموعد السائق.`;

      push(lines, "رقم الحجز", reference);
      push(lines, "المتعهد", company);
      push(lines, "هاتف المتعهد", firstStr(payload, ["partnerPhone", "subcontractorPhone"]));
      push(lines, "المسار", route);
      push(lines, "الرحلة", trip);
      push(lines, "موعد الانطلاق", pickup);
      push(lines, "مستحق المتعهد", money(payout, currency));
      push(lines, "سعر العميل", money(total, currency));
      push(lines, "الهامش المحقق", money(margin, currency));
      push(lines, "الموجة", roundLabel(round, maxRounds));
      push(lines, "طريقة الإسناد", manual ? "إسناد يدوي من التشغيل" : "قبول تلقائي من المتعهد");
      break;
    }

    case "dispatch_round_expired": {
      const pending = firstNum(payload, ["pendingCount", "expiredCount", "offersCount", "offers"]);
      const nextRound = firstNum(payload, ["nextRound"]) ?? (round !== null ? round + 1 : null);
      /**
       * «موجة تالية» ليست مضمونة: الموجة المنتهية قد تكون الأخيرة. ولا نكتفي
       * بمقارنة الحد الأقصى — نشترط أيضاً أن تكون التالية **بعد** المنتهية،
       * وإلا لظهر «الموجة ٢ ← الموجة ٢» لو أرسلت الحمولة رقماً غير متقدّم.
       */
      const hasNext =
        nextRound !== null &&
        (round === null || nextRound > round) &&
        (maxRounds === null || nextRound <= maxRounds);

      lead = hasNext
        ? `انتهت مهلة ${roundLabel(round, maxRounds) ?? "الموجة"} بلا قبول. سيبث النظام الموجة التالية تلقائياً بسقف تكلفة أوسع — راقب الطلب، فتأخّره يقرّب موعد الرحلة.`
        : `انتهت مهلة ${roundLabel(round, maxRounds) ?? "الموجة"} بلا قبول، ولا موجة بعدها — الطلب في طريقه إلى الإسناد اليدوي. ابدأ البحث عن متعهد الآن.`;

      push(lines, "رقم الحجز", reference);
      push(lines, "المسار", route);
      push(lines, "الموجة المنتهية", roundLabel(round, maxRounds));
      if (pending !== null && pending > 0) {
        push(lines, "متعهدون لم يردّوا", toArabicDigits(pending));
      }
      if (hasNext) push(lines, "الموجة التالية", roundLabel(nextRound, maxRounds));
      push(lines, "موعد الانطلاق", pickup);
      break;
    }

    case "dispatch_exhausted": {
      const rounds = firstNum(payload, ["rounds", "roundsUsed"]) ?? round;
      const offers = firstNum(payload, ["offersCount", "offers", "notifiedCount"]);
      const total = firstNum(payload, ["total", "customerPrice", "price"]);

      lead = `استُنفدت كل موجات البث ولم يقبل أي متعهد. الطلب انتقل إلى طابور الإسناد اليدوي — أسنده بنفسك من صفحة الطلب أو تواصل مع متعهد خارج القائمة قبل موعد الرحلة.`;

      push(lines, "رقم الحجز", reference);
      push(lines, "المسار", route);
      push(lines, "الرحلة", trip);
      push(lines, "موعد الانطلاق", pickup);
      if (rounds !== null && rounds > 0) push(lines, "عدد الموجات", toArabicDigits(rounds));
      if (offers !== null && offers > 0) push(lines, "متعهدون بُث عليهم", toArabicDigits(offers));
      push(lines, "سعر العميل", money(total, currency));
      push(
        lines,
        "التكلفة المُسعَّر بها",
        money(firstNum(payload, ["pricedCost", "subcontractorCost", "baseCost"]), currency)
      );
      break;
    }
  }

  return {
    emoji,
    title,
    lead,
    lines,
    link: dispatchLink(payload, ctx, audience),
    reference,
  };
}
