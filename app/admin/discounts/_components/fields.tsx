import * as React from "react";
import { AlertTriangle, CheckCircle2, Scissors, XCircle } from "lucide-react";

import { formatAmount } from "@/components/booking/format";
import { HelpTip } from "@/components/shared/HelpTip";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
// نوع محض (يُمحى عند البناء) — فلا يجرّ `server-only` إلى حزمة العميل
import type { DiscountFailure } from "../loader";

/**
 * لبنات شاشات الخصومات — كلها **مكوّنات خادمية** بلا `"use client"` وبلا حالة:
 * كل تفاعل يمر بنموذج أو برابط، فتعمل الشاشات بجافاسكربت معطّل، ولا يُرسل
 * جافاسكربت لأجل تلميح أو شريط.
 *
 * ولا يُحسب هنا رقم واحد يُطبع: `UsageMeter` يعرض العددين كما وصلا من القاعدة،
 * وعرض الشريط هندسة تخطيط لا نسبة تُقرأ (نفس قاعدة `StatBars` في المرحلة ١٠).
 */

/** نفس مظهر Input لعناصر select وtextarea الأصلية (لا مكوّن جاهز لهما في ui/) */
export const fieldControlClass =
  "w-full min-w-0 rounded-lg border border-input bg-transparent px-2.5 py-1.5 text-base transition-colors outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:pointer-events-none disabled:cursor-not-allowed disabled:bg-input/50 disabled:opacity-50 md:text-sm dark:bg-input/30 dark:disabled:bg-input/80";

// ---------------------------------------------------------------------------
// حقول
// ---------------------------------------------------------------------------

export function TextField({
  id,
  label,
  name,
  defaultValue,
  placeholder,
  help,
  dir = "rtl",
  disabled,
  required,
  pattern,
  maxLength,
  hint,
}: {
  id: string;
  label: string;
  name: string;
  defaultValue?: string | null;
  placeholder?: string;
  help?: React.ReactNode;
  dir?: "rtl" | "ltr";
  disabled?: boolean;
  required?: boolean;
  pattern?: string;
  maxLength?: number;
  /** سطر تحت الحقل — يبقى مقروءاً بلا تحويم (للقواعد التي لا تُخفى) */
  hint?: React.ReactNode;
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
        dir={dir}
        defaultValue={defaultValue ?? ""}
        placeholder={placeholder}
        disabled={disabled}
        required={required}
        pattern={pattern}
        maxLength={maxLength}
      />
      {hint ? <p className="text-xs leading-relaxed text-muted-foreground">{hint}</p> : null}
    </div>
  );
}

/** حقل رقمي — الأرقام دائماً ltr حتى تُقرأ الكسور والعملة بترتيبها الصحيح */
export function NumberField({
  id,
  label,
  name,
  defaultValue,
  help,
  disabled,
  required,
  step = "0.01",
  min = 0,
  max,
  placeholder,
  hint,
}: {
  id: string;
  label: string;
  name: string;
  defaultValue?: number | null;
  help?: React.ReactNode;
  disabled?: boolean;
  required?: boolean;
  step?: string;
  min?: number;
  max?: number;
  placeholder?: string;
  hint?: React.ReactNode;
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
      {hint ? <p className="text-xs leading-relaxed text-muted-foreground">{hint}</p> : null}
    </div>
  );
}

/** حقل يوم — يُخزَّن لحظةً بتوقيت القاهرة (`cairoInstant` في `input.ts`) */
export function DateField({
  id,
  label,
  name,
  defaultValue,
  help,
  disabled,
  hint,
}: {
  id: string;
  label: string;
  name: string;
  defaultValue?: string;
  help?: React.ReactNode;
  disabled?: boolean;
  hint?: React.ReactNode;
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
        type="date"
        dir="ltr"
        defaultValue={defaultValue ?? ""}
        disabled={disabled}
      />
      {hint ? <p className="text-xs leading-relaxed text-muted-foreground">{hint}</p> : null}
    </div>
  );
}

export function TextareaField({
  id,
  label,
  name,
  defaultValue,
  placeholder,
  help,
  rows = 3,
  disabled,
  maxLength,
}: {
  id: string;
  label: string;
  name: string;
  defaultValue?: string | null;
  placeholder?: string;
  help?: React.ReactNode;
  rows?: number;
  disabled?: boolean;
  maxLength?: number;
}) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id} className="flex items-center gap-1.5">
        {label}
        {help ? <HelpTip>{help}</HelpTip> : null}
      </Label>
      <textarea
        id={id}
        name={name}
        rows={rows}
        maxLength={maxLength}
        defaultValue={defaultValue ?? ""}
        placeholder={placeholder}
        disabled={disabled}
        className={cn(fieldControlClass, "min-h-20 leading-relaxed")}
      />
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
  disabled,
  hint,
}: {
  id: string;
  label: string;
  name: string;
  defaultValue?: string;
  options: { value: string; label: string }[];
  help?: React.ReactNode;
  disabled?: boolean;
  hint?: React.ReactNode;
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
        defaultValue={defaultValue}
        disabled={disabled}
        className={fieldControlClass}
      >
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
      {hint ? <p className="text-xs leading-relaxed text-muted-foreground">{hint}</p> : null}
    </div>
  );
}

export function CheckboxField({
  id,
  label,
  name,
  defaultChecked,
  disabled,
  help,
}: {
  id: string;
  label: string;
  name: string;
  defaultChecked?: boolean;
  disabled?: boolean;
  help?: React.ReactNode;
}) {
  return (
    <Label
      htmlFor={id}
      className="flex w-fit cursor-pointer items-center gap-2 text-sm font-normal"
    >
      <input
        id={id}
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

// ---------------------------------------------------------------------------
// بطاقات الحالة
// ---------------------------------------------------------------------------

export function SavedAlert({ children }: { children: React.ReactNode }) {
  return (
    <Card className="flex flex-row items-center gap-3 border-emerald-300 bg-emerald-50 p-4 text-emerald-900 dark:border-emerald-700 dark:bg-emerald-950 dark:text-emerald-100">
      <CheckCircle2 className="size-5 shrink-0" />
      <p className="text-sm font-medium">{children}</p>
    </Card>
  );
}

export function ErrorAlert({ children }: { children: React.ReactNode }) {
  return (
    <Card className="flex flex-row items-center gap-3 border-red-300 bg-red-50 p-4 text-red-900 dark:border-red-700 dark:bg-red-950 dark:text-red-100">
      <XCircle className="size-5 shrink-0" />
      <p className="text-sm font-medium">{children}</p>
    </Card>
  );
}

const FAILURE_TITLES: Record<DiscountFailure, string> = {
  migration: "نظام الخصومات غير منفَّذ في قاعدة البيانات",
  forbidden: "هذه الشاشة للمديرين فقط",
  input: "رفضت قاعدة البيانات مُدخلات هذه القراءة",
  failed: "تعذّرت قراءة بيانات الخصومات",
};

/**
 * «غير جاهزة» بسبب مسمّى — التفريق بين «الهجرة لم تُنفَّذ» و«حسابك ليس admin»
 * و«فشل قراءة» ليس ترفاً: الأولى يحلّها المالك بأمر واحد، والثانية بتسجيل دخول
 * آخر، والثالثة تحتاج سجل الخادم.
 */
export function NotReady({
  wired,
  missing,
  failure,
}: {
  wired: boolean;
  missing: string;
  failure: DiscountFailure | null;
}) {
  const kind: DiscountFailure = failure ?? "failed";
  return (
    <Card className="flex flex-row items-start gap-3 border-amber-300 bg-amber-50 p-4 text-amber-900 dark:border-amber-700 dark:bg-amber-950 dark:text-amber-100">
      <AlertTriangle className="mt-0.5 size-5 shrink-0" />
      <div className="space-y-1 text-sm leading-relaxed">
        <p className="font-semibold">
          {wired ? FAILURE_TITLES[kind] : "قاعدة البيانات غير مربوطة بعد"}
        </p>
        {!wired ? (
          <p>
            تُفعَّل إدارة الخصومات بعد تنفيذ خطوات <code dir="ltr">supabase/README.md</code> وإعادة
            تشغيل الخادم. بقية اللوحة تعمل طبيعياً.
          </p>
        ) : kind === "migration" ? (
          <p>
            قاعدة البيانات مربوطة لكن <code dir="ltr">{missing}</code> غير موجود — نفِّذ هجرة
            المرحلة ١٢أ (<code dir="ltr">0024_discounts.sql</code>) بأمر{" "}
            <code dir="ltr">pnpm db:migrate</code> ثم أعد تحميل الصفحة. لا كوبون يعمل قبلها،
            ولا يُطبَّق خصم على أي سعر.
          </p>
        ) : kind === "forbidden" ? (
          <p>
            رفضت قاعدة البيانات قراءة <code dir="ltr">{missing}</code> — إدارة الخصومات محروسة
            بحساب دوره <code dir="ltr">admin</code>. سجّل الدخول بحساب مدير؛ حسابات المتعهدين لا
            تصل إلى هذه الشاشة ولا إلى أرقام الهامش فيها.
          </p>
        ) : kind === "input" ? (
          <p>
            رفضت <code dir="ltr">{missing}</code> المُدخلات المرسلة. راجع نافذة الصلاحية أو
            المعرّف في الرابط.
          </p>
        ) : (
          <p>
            تعذّرت قراءة <code dir="ltr">{missing}</code>. راجع سجل الخادم لرسالة قاعدة البيانات؛
            بقية أجزاء الشاشة تُعرض بما توفّر منها.
          </p>
        )}
      </div>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// عدّاد الاستخدام ووسم التقليص
// ---------------------------------------------------------------------------

/** أقل عرض مرئي لشريط قيمته أكبر من صفر — كي لا يختفي استخدام واحد تماماً */
const MIN_BAR_PERCENT = 3;

/**
 * الاستخدام مقابل السقف.
 *
 * العددان يصلان من `coupons.used_count` و`coupons.max_uses` كما هما، ولا تُطبع
 * بينهما نسبة: عرض الشريط **هندسة تخطيط** لا رقماً يُقرأ. والسقف الفارغ يعني
 * «بلا سقف» صراحةً لا صفراً.
 */
export function UsageMeter({
  used,
  cap,
  compact = false,
}: {
  used: number;
  cap: number | null;
  compact?: boolean;
}) {
  const width =
    cap === null || cap <= 0
      ? 0
      : Math.max(used > 0 ? MIN_BAR_PERCENT : 0, Math.min(100, (used / cap) * 100));
  const exhausted = cap !== null && used >= cap;

  return (
    <div className={cn("space-y-1", compact ? "min-w-28" : "min-w-40")}>
      <div className="flex items-baseline gap-1.5 text-sm">
        <span dir="ltr" className="font-medium tabular-nums">
          {formatAmount(used)}
        </span>
        <span className="text-xs text-muted-foreground">
          {cap === null ? "استخدام · بلا سقف" : `من ${formatAmount(cap)}`}
        </span>
        {exhausted ? (
          <Badge variant="outline" className="ms-1 shrink-0 text-[10px] font-normal">
            بلغ السقف
          </Badge>
        ) : null}
      </div>
      {cap !== null ? (
        <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
          <div
            className={cn("h-full rounded-full transition-all", exhausted ? "bg-amber-500" : "bg-primary")}
            style={{ width: `${width}%` }}
          />
        </div>
      ) : null}
    </div>
  );
}

/** وسم الخصم المقلَّص — الشفافية المطلوبة في القرار ٣ وفي §٧ من موجز المرحلة */
export function ClampedBadge() {
  return (
    <Badge
      variant="outline"
      className="gap-1 border-amber-400 text-[10px] font-normal text-amber-700 dark:text-amber-300"
    >
      <Scissors className="size-3" />
      قُلِّص بأرضية الهامش
    </Badge>
  );
}
