import type { ReactNode } from "react";
import { CheckCircle2, CircleAlert, Info, XCircle } from "lucide-react";

import { toArabicDigits } from "@/components/booking/format";
import { HelpTip } from "@/components/shared/HelpTip";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { PriceListStatus, SubcontractorStatus } from "@/lib/subcontractor-types";
import { cn } from "@/lib/utils";

/**
 * لبنات واجهة بورتال المتعهدين.
 *
 * البورتال ليس «لوحة تحكم مصغَّرة»: نبرته نبرة أداة شريك — بطاقات هادئة، جملة
 * واحدة تشرح كل حقل، وحالات فارغة تقول للمتعهد ماذا يفعل الآن بدل أن تخبره
 * بأن الجدول فارغ. لذلك لبناته مستقلة عن لبنات `/admin` ولا تستوردها.
 *
 * كلها مكوّنات خادمية (بلا "use client") — الناتج نص جاهز في الـ HTML.
 */

/** تنسيق موحّد لعناصر الإدخال الخام (select وtextarea) — نفس إيقاع `Input` */
export const controlClass =
  "w-full min-w-0 rounded-lg border border-input bg-transparent px-2.5 py-1.5 text-base transition-colors outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:pointer-events-none disabled:cursor-not-allowed disabled:bg-input/50 disabled:opacity-50 md:text-sm dark:bg-input/30 dark:disabled:bg-input/80";

/* ------------------------------------------------------------------ */
/* الحالات                                                             */
/* ------------------------------------------------------------------ */

export const SUB_STATUS_LABELS: Record<SubcontractorStatus, string> = {
  pending: "قيد المراجعة",
  approved: "معتمد",
  suspended: "موقوف",
};

const SUB_STATUS_TONE: Record<SubcontractorStatus, string> = {
  pending:
    "border-amber-300 bg-amber-100 text-amber-900 dark:border-amber-700 dark:bg-amber-950 dark:text-amber-100",
  approved:
    "border-emerald-300 bg-emerald-100 text-emerald-900 dark:border-emerald-700 dark:bg-emerald-950 dark:text-emerald-100",
  suspended:
    "border-red-300 bg-red-100 text-red-900 dark:border-red-700 dark:bg-red-950 dark:text-red-100",
};

export function SubStatusBadge({
  status,
  className,
}: {
  status: SubcontractorStatus;
  className?: string;
}) {
  return (
    <Badge variant="outline" className={cn(SUB_STATUS_TONE[status], className)}>
      {SUB_STATUS_LABELS[status]}
    </Badge>
  );
}

export const LIST_STATUS_LABELS: Record<PriceListStatus, string> = {
  draft: "مسودة",
  pending: "قيد الاعتماد",
  approved: "معتمدة",
  rejected: "مرفوضة",
};

/** ما تعنيه كل حالة **للمتعهد** لا للإدارة — الفرق هو كل الفرق في نبرة البورتال */
export const LIST_STATUS_HINTS: Record<PriceListStatus, string> = {
  draft: "محفوظة عندك ولم تُرسل للاعتماد بعد — لا تدخل التسعير.",
  pending: "وصلت الإدارة وتنتظر المراجعة — لا تدخل التسعير حتى تُعتمد.",
  approved: "معتمدة وتدخل تسعير رحلات المسار الذي تغطيه.",
  rejected: "أعادتها الإدارة بملاحظة — عدّلها ثم أرسلها للاعتماد من جديد.",
};

const LIST_STATUS_TONE: Record<PriceListStatus, string> = {
  draft: "border-border bg-muted text-muted-foreground",
  pending:
    "border-sky-300 bg-sky-100 text-sky-900 dark:border-sky-700 dark:bg-sky-950 dark:text-sky-100",
  approved:
    "border-emerald-300 bg-emerald-100 text-emerald-900 dark:border-emerald-700 dark:bg-emerald-950 dark:text-emerald-100",
  rejected:
    "border-red-300 bg-red-100 text-red-900 dark:border-red-700 dark:bg-red-950 dark:text-red-100",
};

export function PriceListStatusBadge({
  status,
  className,
}: {
  status: PriceListStatus;
  className?: string;
}) {
  return (
    <Badge variant="outline" className={cn(LIST_STATUS_TONE[status], className)}>
      {LIST_STATUS_LABELS[status]}
    </Badge>
  );
}

/* ------------------------------------------------------------------ */
/* بطاقات التنبيه                                                       */
/* ------------------------------------------------------------------ */

/** رموز منع الوصول المشتركة بين كل إجراءات البورتال (`portalAccess`) */
export const COMMON_PORTAL_ERRORS: Record<string, string> = {
  env: "قاعدة البيانات غير مربوطة — لا يمكن الحفظ الآن.",
  auth: "انتهت جلستك — سجّل الدخول من جديد ثم أعد المحاولة.",
  schema: "جداول المتعهدين غير جاهزة بعد على الخادم — راجع الإدارة.",
  account: "حسابك غير معتمد حالياً، فلا يمكن حفظ التعديلات.",
  save: "تعذر الحفظ — إن تكرر الأمر راسل الإدارة بالرسالة كما تظهر هنا.",
  notfound: "لم نعثر على هذا العنصر — ربما حُذف من جهاز آخر.",
};

type NoticeTone = "info" | "success" | "warning" | "danger";

const NOTICE_TONES: Record<NoticeTone, string> = {
  info: "border-sky-300 bg-sky-50 text-sky-900 dark:border-sky-800 dark:bg-sky-950 dark:text-sky-100",
  success:
    "border-emerald-300 bg-emerald-50 text-emerald-900 dark:border-emerald-800 dark:bg-emerald-950 dark:text-emerald-100",
  warning:
    "border-amber-300 bg-amber-50 text-amber-900 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-100",
  danger: "border-red-300 bg-red-50 text-red-900 dark:border-red-800 dark:bg-red-950 dark:text-red-100",
};

export function Notice({
  tone,
  icon,
  children,
  className,
}: {
  tone: NoticeTone;
  icon?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  const fallback =
    tone === "success" ? (
      <CheckCircle2 className="size-5 shrink-0" />
    ) : tone === "danger" ? (
      <XCircle className="size-5 shrink-0" />
    ) : tone === "warning" ? (
      <CircleAlert className="size-5 shrink-0" />
    ) : (
      <Info className="size-5 shrink-0" />
    );

  return (
    <Card className={cn("flex flex-row items-start gap-3 border p-4", NOTICE_TONES[tone], className)}>
      <span className="mt-0.5">{icon ?? fallback}</span>
      <div className="min-w-0 text-sm leading-relaxed">{children}</div>
    </Card>
  );
}

/**
 * شريطا «تم الحفظ» و«فشل الحفظ» — اتفاقية «إعادة التوجيه بعد العملية»:
 * كل إجراء ينتهي بـ redirect يحمل `saved=1` أو `error=code` في الرابط.
 */
export function Banners({
  saved,
  error,
  errorMessages,
  savedMessage = "حُفظت التعديلات.",
}: {
  saved: boolean;
  error: string | null;
  errorMessages?: Record<string, string>;
  savedMessage?: string;
}) {
  return (
    <>
      {saved && (
        <Notice tone="success">
          <p className="font-medium">{savedMessage}</p>
        </Notice>
      )}
      {error && (
        <Notice tone="danger">
          <p className="font-medium">
            {errorMessages?.[error] ??
              COMMON_PORTAL_ERRORS[error] ??
              "حدث خطأ غير متوقع — أعد المحاولة."}
          </p>
        </Notice>
      )}
    </>
  );
}

/** بطاقة «الشاشة غير جاهزة بعد» — تُعرض حين تنقص جداول المرحلة ٥ */
export function NotReadyNotice({ what }: { what: string }) {
  return (
    <Notice tone="warning">
      <p className="font-semibold">{what} غير متاح بعد</p>
      <p>
        جداول المتعهدين لم تُنشأ على الخادم حتى الآن. تواصل مع الإدارة — لا شيء مطلوب منك،
        وستجد شاشتك جاهزة فور اكتمال التجهيز.
      </p>
    </Notice>
  );
}

/* ------------------------------------------------------------------ */
/* عناوين وحالات فارغة                                                  */
/* ------------------------------------------------------------------ */

export function PageHeading({
  title,
  help,
  children,
  action,
}: {
  title: string;
  help?: ReactNode;
  /** سطر واحد يشرح غرض الشاشة بلغة المتعهد */
  children?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div className="min-w-0 space-y-1">
        <h2 className="flex items-center gap-1.5 font-heading text-lg font-bold">
          {title}
          {help ? <HelpTip>{help}</HelpTip> : null}
        </h2>
        {children ? (
          <p className="max-w-prose text-sm leading-relaxed text-muted-foreground">{children}</p>
        ) : null}
      </div>
      {action ? <div className="shrink-0">{action}</div> : null}
    </div>
  );
}

/** حالة فارغة تشرح **لماذا** يهم هذا القسم وما الخطوة التالية */
export function EmptyState({
  icon,
  title,
  children,
  action,
}: {
  icon: ReactNode;
  title: string;
  children: ReactNode;
  action?: ReactNode;
}) {
  return (
    <Card className="items-center gap-3 border border-dashed border-border p-8 text-center">
      <span className="grid size-11 place-items-center rounded-full bg-muted text-muted-foreground">
        {icon}
      </span>
      <h3 className="font-heading text-base font-bold">{title}</h3>
      <div className="mx-auto max-w-md text-sm leading-relaxed text-muted-foreground">
        {children}
      </div>
      {action ? <div className="pt-1">{action}</div> : null}
    </Card>
  );
}

/* ------------------------------------------------------------------ */
/* حقول النماذج                                                         */
/* ------------------------------------------------------------------ */

export function TextField({
  id,
  label,
  name,
  defaultValue,
  placeholder,
  help,
  hint,
  dir = "rtl",
  type = "text",
  disabled,
  required,
  maxLength,
}: {
  id: string;
  label: string;
  name: string;
  defaultValue?: string | null;
  placeholder?: string;
  help?: ReactNode;
  /** سطر تحت الحقل — للإرشاد الدائم لا للتلميح المخفي */
  hint?: ReactNode;
  dir?: "rtl" | "ltr";
  type?: "text" | "email" | "tel" | "url";
  disabled?: boolean;
  required?: boolean;
  maxLength?: number;
}) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id} className="flex items-center gap-1.5">
        {label}
        {help ? <HelpTip>{help}</HelpTip> : null}
      </Label>
      <Input
        id={id}
        name={name}
        type={type}
        dir={dir}
        defaultValue={defaultValue ?? ""}
        placeholder={placeholder}
        disabled={disabled}
        required={required}
        maxLength={maxLength}
      />
      {hint ? <p className="text-xs leading-5 text-muted-foreground">{hint}</p> : null}
    </div>
  );
}

/** حقل رقمي — الأرقام دائماً ltr حتى تُقرأ الكسور والعملة بترتيبها الصحيح */
export function NumberField({
  id,
  label,
  name,
  defaultValue,
  placeholder,
  help,
  hint,
  disabled,
  required,
  step = "1",
  min = 0,
  max,
}: {
  id: string;
  label: string;
  name: string;
  defaultValue?: number | null;
  placeholder?: string;
  help?: ReactNode;
  hint?: ReactNode;
  disabled?: boolean;
  required?: boolean;
  step?: string;
  min?: number;
  max?: number;
}) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id} className="flex items-center gap-1.5">
        {label}
        {help ? <HelpTip>{help}</HelpTip> : null}
      </Label>
      <Input
        id={id}
        name={name}
        type="number"
        inputMode="decimal"
        dir="ltr"
        step={step}
        min={min}
        max={max}
        placeholder={placeholder}
        defaultValue={defaultValue ?? ""}
        disabled={disabled}
        required={required}
      />
      {hint ? <p className="text-xs leading-5 text-muted-foreground">{hint}</p> : null}
    </div>
  );
}

export function SelectField({
  id,
  label,
  name,
  defaultValue,
  options,
  help,
  hint,
  disabled,
  required,
  placeholder,
}: {
  id: string;
  label: string;
  name: string;
  defaultValue?: string | null;
  options: { value: string; label: string }[];
  help?: ReactNode;
  hint?: ReactNode;
  disabled?: boolean;
  required?: boolean;
  placeholder?: string;
}) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id} className="flex items-center gap-1.5">
        {label}
        {help ? <HelpTip>{help}</HelpTip> : null}
      </Label>
      <select
        id={id}
        name={name}
        defaultValue={defaultValue ?? ""}
        disabled={disabled}
        required={required}
        className={controlClass}
      >
        {placeholder ? (
          <option value="" disabled>
            {placeholder}
          </option>
        ) : null}
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
      {hint ? <p className="text-xs leading-5 text-muted-foreground">{hint}</p> : null}
    </div>
  );
}

export function CheckboxField({
  name,
  label,
  defaultChecked,
  disabled,
  help,
}: {
  name: string;
  label: string;
  defaultChecked?: boolean;
  disabled?: boolean;
  help?: ReactNode;
}) {
  return (
    <Label className="flex w-fit cursor-pointer items-center gap-2 text-sm font-normal">
      <input
        type="checkbox"
        name={name}
        defaultChecked={defaultChecked}
        disabled={disabled}
        className="size-4 accent-primary"
      />
      {label}
      {help ? <HelpTip>{help}</HelpTip> : null}
    </Label>
  );
}

/* ------------------------------------------------------------------ */
/* أدوات عرض                                                            */
/* ------------------------------------------------------------------ */

const CAIRO_TIME_ZONE = "Africa/Cairo";

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

/** تاريخ قصير بتوقيت القاهرة — التشغيل والمتعهدون في مصر */
export function dateLabel(value: string | null): string {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: CAIRO_TIME_ZONE,
    year: "numeric",
    month: "numeric",
    day: "numeric",
  }).formatToParts(date);
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value ?? "0");
  const month = AR_MONTHS[Math.min(11, Math.max(0, get("month") - 1))];
  return `${toArabicDigits(get("day"))} ${month} ${toArabicDigits(get("year"))}`;
}

/** عدد بالأرقام العربية الهندية — للعدّادات والإحصاءات */
export const countLabel = (value: number) => toArabicDigits(Math.max(0, Math.round(value)));
