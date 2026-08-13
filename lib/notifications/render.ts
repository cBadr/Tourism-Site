import {
  formatMoney,
  hoursText,
  passengersLabel,
  toArabicDigits,
} from "@/components/booking/format";

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

/** عناوين الأحداث كما تظهر في الجرس وفي جدول الإشعارات */
export const EVENT_TITLES: Record<string, string> = {
  booking_created: "حجز جديد بانتظار التحويل",
  receipt_uploaded: "إيصال تحويل بانتظار المراجعة",
  booking_confirmed: "حجز مؤكَّد",
  booking_cancelled: "حجز ملغى",
  quote_requested: "طلب عرض سعر جديد",
  // أحداث البث والإسناد (المرحلة ٦) — بدونها تظهر كلها بعنوان «إشعار جديد»
  trip_offered: "عرض رحلة جديد على المتعهدين",
  trip_assigned: "أُسندت الرحلة إلى متعهد",
  dispatch_round_expired: "انتهت مهلة موجة البث",
  dispatch_exhausted: "لم يقبل أي متعهد — إسناد يدوي",
};

const EVENT_EMOJI: Record<string, string> = {
  booking_created: "🚗",
  receipt_uploaded: "🧾",
  booking_confirmed: "✅",
  booking_cancelled: "🚫",
  quote_requested: "📝",
  trip_offered: "📢",
  trip_assigned: "🤝",
  dispatch_round_expired: "⏳",
  dispatch_exhausted: "🆘",
};

/** أسماء القنوات كما تظهر للمالك */
export const CHANNEL_LABELS: Record<string, string> = {
  dashboard: "لوحة التحكم",
  telegram: "تليجرام",
  email: "البريد",
};

/** أسماء حالات الطابور كما تظهر للمالك */
export const STATUS_LABELS: Record<string, string> = {
  queued: "في الطابور",
  sent: "أُرسل",
  skipped: "متجاوَز",
  failed: "فشل",
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

/** مسار المتابعة النسبي — الجرس يستعمله كما هو */
export function bookingPath(payload: Payload): string | null {
  const token = bookingToken(payload);
  return token ? `/booking/${token}` : null;
}

/** «القاهرة ← الغردقة» — يرجع null إن غابت الأطراف */
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

/** التاريخ والوقت بالعربية — يعمل في الخادم والمتصفح بنفس النتيجة (UTC+ثابت) */
export function formatDateTime(iso: string | null): string | null {
  if (!iso) return null;
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return null;
  try {
    return new Intl.DateTimeFormat("ar-EG", {
      dateStyle: "medium",
      timeStyle: "short",
      timeZone: "Africa/Cairo",
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
  ctx: RenderContext
): RenderedMessage {
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

    default: {
      emoji = eventEmoji(event);
      title = eventTitle(event);
      lead = `حدث جديد على ${ctx.brandName} يحتاج مراجعتك من لوحة التحكم.`;
      push(lines, "المرجع", reference);
      push(lines, "العميل", customerName);
      push(lines, "الهاتف", customerPhone);
    }
  }

  const path = bookingPath(payload);
  const base = (ctx.baseUrl ?? "").replace(/\/+$/, "");
  const linkLabel = event === "quote_requested" ? "صفحة متابعة الطلب" : "صفحة متابعة الحجز";
  const link = path ? { label: linkLabel, href: `${base}${path}` } : null;

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
