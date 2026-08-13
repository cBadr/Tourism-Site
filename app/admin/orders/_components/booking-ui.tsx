import type { ReactNode } from "react";
import { AlertTriangle, CheckCircle2, XCircle } from "lucide-react";

import { toArabicDigits } from "@/components/booking/format";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import type { BookingStatus } from "@/lib/booking-types";
import { cn } from "@/lib/utils";

/**
 * لبنات مشتركة لشاشات الطلبات (قائمة + تفاصيل) — بنفس إيقاع شاشتي الأسطول والإعدادات:
 * وسوم حالة ملوّنة، وقت نسبي عربي، تاريخ بتوقيت القاهرة، وبطاقات تنبيه عبر الـ query string.
 *
 * كلها مكوّنات خادمية الصلاحية (بلا "use client") — تُستدعى داخل مكوّنات الخادم فقط،
 * فلا خطر اختلاف ICU بين الخادم والمتصفح لأن الناتج نص جاهز في الـ HTML.
 * لا حساب مالي هنا: الأرقام تصل جاهزة من قاعدة البيانات وما يجري تنسيق عرض فقط.
 */

/** ترتيب دورة الحياة كما في lib/booking-types.ts */
export const BOOKING_STATUSES: BookingStatus[] = [
  "pending_payment",
  "under_review",
  "confirmed",
  "assigned",
  "completed",
  "cancelled",
];

export const STATUS_LABELS: Record<BookingStatus, string> = {
  pending_payment: "بانتظار الدفع",
  under_review: "قيد المراجعة",
  confirmed: "مؤكد",
  assigned: "مُسند",
  completed: "منفذ",
  cancelled: "ملغي",
};

/** شرح مختصر لكل حالة — يظهر في تلميحات الشاشة وقائمة تغيير الحالة */
export const STATUS_HINTS: Record<BookingStatus, string> = {
  pending_payment: "أُنشئ الحجز والعميل لم يرفع إيصال التحويل بعد.",
  under_review: "رُفع الإيصال وينتظر تحقق التشغيل من وصول المبلغ.",
  confirmed: "تحقق التشغيل من التحويل والحجز مضمون للعميل.",
  assigned: "أُسند لمتعهد — يُفعَّل بالكامل في المرحلة ٦.",
  completed: "نُفذت الرحلة وانتهى الالتزام.",
  cancelled: "أُلغي الحجز — حالة نهائية.",
};

/** ألوان الحالة — نفس لوحة ألوان بطاقات التنبيه في بقية اللوحة */
const STATUS_TONE: Record<BookingStatus, string> = {
  pending_payment:
    "border-amber-300 bg-amber-100 text-amber-900 dark:border-amber-700 dark:bg-amber-950 dark:text-amber-100",
  under_review:
    "border-sky-300 bg-sky-100 text-sky-900 dark:border-sky-700 dark:bg-sky-950 dark:text-sky-100",
  confirmed:
    "border-emerald-300 bg-emerald-100 text-emerald-900 dark:border-emerald-700 dark:bg-emerald-950 dark:text-emerald-100",
  assigned:
    "border-violet-300 bg-violet-100 text-violet-900 dark:border-violet-700 dark:bg-violet-950 dark:text-violet-100",
  completed:
    "border-teal-300 bg-teal-100 text-teal-900 dark:border-teal-700 dark:bg-teal-950 dark:text-teal-100",
  cancelled:
    "border-red-300 bg-red-100 text-red-900 dark:border-red-700 dark:bg-red-950 dark:text-red-100",
};

export function isBookingStatus(value: unknown): value is BookingStatus {
  return typeof value === "string" && (BOOKING_STATUSES as string[]).includes(value);
}

export function StatusBadge({ status, className }: { status: string; className?: string }) {
  const known = isBookingStatus(status);
  return (
    <Badge
      variant="outline"
      className={cn(
        known ? STATUS_TONE[status] : "border-border text-muted-foreground",
        className
      )}
    >
      {known ? STATUS_LABELS[status] : status}
    </Badge>
  );
}

/** أسماء أحداث الإشعارات (lib/booking-types.ts) بالعربية — تظهر في سجل الحالة */
const EVENT_LABELS: Record<string, string> = {
  booking_created: "أُنشئ الحجز",
  receipt_uploaded: "رُفع إيصال التحويل",
  booking_confirmed: "تأكيد الحجز",
  booking_cancelled: "إلغاء الحجز",
  quote_requested: "طلب عرض سعر",
  payment_verified: "اعتماد التحويل",
  payment_rejected: "رفض التحويل",
};

/** عنوان صف في سجل الحالة: اسم حدث معروف، أو اسم حالة، أو القيمة كما هي */
export function eventLabel(value: string | null): string {
  if (!value) return "تغيير في الحجز";
  if (EVENT_LABELS[value]) return EVENT_LABELS[value];
  if (isBookingStatus(value)) return `الحالة: ${STATUS_LABELS[value]}`;
  return value;
}

export const PAYMENT_KIND_LABELS: Record<string, string> = {
  wallet: "محفظة إلكترونية",
  instapay: "انستا باي",
};

export const PLAN_LABELS: Record<string, string> = {
  full: "كامل المبلغ",
  deposit: "عربون",
};

// ---------------------------------------------------------------------------
// الوقت — كل التواريخ تُعرض بتوقيت القاهرة لأن التشغيل والعملاء في مصر
// ---------------------------------------------------------------------------

export const CAIRO_TIME_ZONE = "Africa/Cairo";

const AR_MONTHS = [
  "يناير",
  "فبراير",
  "مارس",
  "أبريل",
  "مايو",
  "يونيو",
  "يوليو",
  "أغسطس",
  "سبتمبر",
  "أكتوبر",
  "نوفمبر",
  "ديسمبر",
];

/** أجزاء التاريخ في منطقة زمنية بعينها — أرقام لاتينية جاهزة للحساب */
export function zonedParts(
  date: Date,
  timeZone: string = CAIRO_TIME_ZONE
): { year: number; month: number; day: number; hour: number; minute: number; second: number } {
  const dtf = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hour12: false,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
  const out: Record<string, number> = {};
  for (const part of dtf.formatToParts(date)) {
    if (part.type !== "literal") out[part.type] = Number(part.value);
  }
  return {
    year: out.year ?? 0,
    month: out.month ?? 1,
    day: out.day ?? 1,
    // بعض إصدارات ICU تعطي ٢٤ لمنتصف الليل مع hour12:false
    hour: (out.hour ?? 0) % 24,
    minute: out.minute ?? 0,
    second: out.second ?? 0,
  };
}

const pad2 = (n: number) => (n < 10 ? `0${n}` : String(n));

/** تاريخ ووقت كاملان — مثال: ١٢ أغسطس ٢٠٢٦ · ٧:٣٠ م (بتوقيت القاهرة) */
export function dateTimeLabel(iso: string | null | undefined): string {
  if (!iso) return "—";
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return "—";
  const p = zonedParts(new Date(t));
  const period = p.hour < 12 ? "ص" : "م";
  const hour12 = p.hour % 12 === 0 ? 12 : p.hour % 12;
  return `${toArabicDigits(p.day)} ${AR_MONTHS[p.month - 1]} ${toArabicDigits(p.year)} · ${toArabicDigits(hour12)}:${toArabicDigits(pad2(p.minute))} ${period}`;
}

/** صيغة الجمع العربية لوحدة زمنية: مفرد / مثنى / جمع قلة / جمع كثرة */
function unitText(n: number, forms: [string, string, string, string]): string {
  if (n === 1) return forms[0];
  if (n === 2) return forms[1];
  if (n <= 10) return `${toArabicDigits(n)} ${forms[2]}`;
  return `${toArabicDigits(n)} ${forms[3]}`;
}

const TIME_UNITS: { seconds: number; forms: [string, string, string, string] }[] = [
  { seconds: 31536000, forms: ["سنة", "سنتين", "سنوات", "سنة"] },
  { seconds: 2592000, forms: ["شهر", "شهرين", "أشهر", "شهراً"] },
  { seconds: 86400, forms: ["يوم", "يومين", "أيام", "يوماً"] },
  { seconds: 3600, forms: ["ساعة", "ساعتين", "ساعات", "ساعة"] },
  { seconds: 60, forms: ["دقيقة", "دقيقتين", "دقائق", "دقيقة"] },
];

/**
 * وقت نسبي عربي — «قبل ٣ دقائق» / «بعد ساعتين» / «الآن».
 * يُحتسب لحظة العرض على الخادم، ولا يُعاد حسابه في المتصفح.
 */
export function relativeTime(iso: string | null | undefined): string {
  if (!iso) return "—";
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return "—";
  const diffSec = Math.round((Date.now() - t) / 1000);
  const abs = Math.abs(diffSec);
  if (abs < 45) return "الآن";
  const prefix = diffSec >= 0 ? "قبل" : "بعد";
  for (const unit of TIME_UNITS) {
    if (abs >= unit.seconds) {
      const value = Math.floor(abs / unit.seconds);
      return `${prefix} ${unitText(value, unit.forms)}`;
    }
  }
  return `${prefix} ${unitText(Math.floor(abs), ["ثانية", "ثانيتين", "ثوانٍ", "ثانية"])}`;
}

// ---------------------------------------------------------------------------
// بطاقات الحالة — نفس الاتفاقية: النجاح والفشل يصلان في الـ query string
// ---------------------------------------------------------------------------

/** رسائل الأخطاء المشتركة بين شاشات المرحلة ٤ */
export const COMMON_BOOKING_ERRORS: Record<string, string> = {
  env: "قاعدة البيانات غير مربوطة — لا يمكن تنفيذ العملية بعد.",
  save: "فشلت العملية — تأكد أنك مسجل الدخول بحساب دوره admin (راجع supabase/README.md، فخ الصفوف الصفرية).",
  status: "حالة غير معروفة أو انتقال غير مسموح — راجع آلة الحالات في قاعدة البيانات.",
  note: "سبب الرفض حقل إلزامي — اكتب ملاحظة توضّح للعميل سبب رفض التحويل.",
  missing: "لم يعد هذا السجل موجوداً — أعد تحميل الصفحة.",
};

export function Banners({
  wired,
  readOnly,
  saved,
  error,
  errorMessages,
  savedMessage = "نُفذت العملية وحُدِّثت الحالة.",
  readOnlyTitle,
  readOnlyBody,
}: {
  wired: boolean;
  readOnly: boolean;
  saved: boolean;
  error: string | null;
  errorMessages: Record<string, string>;
  savedMessage?: string;
  readOnlyTitle: string;
  readOnlyBody: ReactNode;
}) {
  return (
    <>
      {readOnly && (
        <Card className="flex flex-row items-start gap-3 border-amber-300 bg-amber-50 p-4 text-amber-900 dark:border-amber-700 dark:bg-amber-950 dark:text-amber-100">
          <AlertTriangle className="mt-0.5 size-5 shrink-0" />
          <div className="text-sm leading-relaxed">
            <p className="font-semibold">{readOnlyTitle}</p>
            {wired ? (
              readOnlyBody
            ) : (
              <p>
                قاعدة البيانات غير مربوطة بعد — التحرير يُفعَّل بعد تنفيذ خطوات{" "}
                <code dir="ltr">supabase/README.md</code> وإعادة تشغيل الخادم.
              </p>
            )}
          </div>
        </Card>
      )}

      {saved && (
        <Card className="flex flex-row items-center gap-3 border-emerald-300 bg-emerald-50 p-4 text-emerald-900 dark:border-emerald-700 dark:bg-emerald-950 dark:text-emerald-100">
          <CheckCircle2 className="size-5 shrink-0" />
          <p className="text-sm font-medium">{savedMessage}</p>
        </Card>
      )}

      {error && (
        <Card className="flex flex-row items-center gap-3 border-red-300 bg-red-50 p-4 text-red-900 dark:border-red-700 dark:bg-red-950 dark:text-red-100">
          <XCircle className="size-5 shrink-0" />
          <p className="text-sm font-medium">
            {errorMessages[error] ?? COMMON_BOOKING_ERRORS[error] ?? "حدث خطأ غير متوقع."}
          </p>
        </Card>
      )}
    </>
  );
}

/** نفس مظهر Input لعناصر select وtextarea الأصلية (لا مكوّن جاهز لهما في ui/) */
export const controlClass =
  "w-full min-w-0 rounded-lg border border-input bg-transparent px-2.5 py-1.5 text-base transition-colors outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:pointer-events-none disabled:cursor-not-allowed disabled:bg-input/50 disabled:opacity-50 md:text-sm dark:bg-input/30 dark:disabled:bg-input/80";

/** الأرقام العربية الهندية تُقبل في حقول البحث والأرقام وتُحوَّل قبل الاستخدام */
export const toLatinDigits = (s: string) =>
  s.replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 0x0660));

/** قراءة حقل من صف مجهول البنية بأول اسم موجود — الجداول يملكها وكيل SQL */
export function pick(row: Record<string, unknown> | null, names: string[]): unknown {
  if (!row) return undefined;
  for (const name of names) {
    const value = row[name];
    if (value !== undefined && value !== null) return value;
  }
  return undefined;
}

export const asText = (v: unknown): string | null =>
  typeof v === "string" && v.trim() !== "" ? v.trim() : null;

export const asNumber = (v: unknown): number | null => {
  const n = typeof v === "number" ? v : typeof v === "string" ? Number(v) : NaN;
  return Number.isFinite(n) ? n : null;
};
