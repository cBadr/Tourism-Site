import * as React from "react"
import { AlertTriangle, CheckCircle2, Info, XCircle } from "lucide-react"

import { cn } from "@/lib/utils"

/**
 * نبرة البطاقة الدلالية — خمس قيم لا أكثر.
 *
 * `default` هي الحالة الصامتة، **وهي الأغلبية الساحقة**. البطاقة الملوّنة تقول
 * «انظر إليّ الآن»؛ فإن لُوّنت كل البطاقات لم تعد أي واحدة تقول شيئاً، ونعود
 * إلى الشكل الواحد الذي شكا منه المالك — بألوان هذه المرة.
 */
export type CardVariant = "default" | "success" | "warning" | "danger" | "info"

/**
 * كل نبرة تضبط `--card-tone` وحده؛ والقشرة أدناه تقرؤه.
 * القيم رموز من `app/globals.css` لا ألوان مكتوبة هنا (اتفاقيات §٣).
 */
const CARD_TONE_VAR: Record<Exclude<CardVariant, "default">, string> = {
  success: "[--card-tone:var(--tone-success)]",
  warning: "[--card-tone:var(--tone-warning)]",
  danger: "[--card-tone:var(--tone-danger)]",
  info: "[--card-tone:var(--tone-info)]",
}

/**
 * قشرة النبرة: حدّ جانبي ملوّن + تلوين خفيف جداً للخلفية + حلقة ملوّنة.
 * `border-s-*` خاصية منطقية فتنقلب مع الاتجاه وحدها — الحدّ في جهة بداية
 * السطر عربياً وإنجليزياً معاً (اتفاقيات §١).
 * ٦٪ من اللون في الخلفية: يُميَّز بطرف العين ولا يخفض تباين النص.
 */
const CARD_TONE_SKIN =
  "border-s-[3px] border-s-[color:var(--card-tone)] bg-[color:color-mix(in_oklab,var(--card-tone)_6%,var(--card))] ring-[color:color-mix(in_oklab,var(--card-tone)_34%,transparent)]"

/** الأيقونة تحمل المعنى لمن لا يميّز الألوان — اللون وحده ليس إشارة */
const CARD_TONE_ICON: Record<Exclude<CardVariant, "default">, React.ElementType> = {
  success: CheckCircle2,
  warning: AlertTriangle,
  danger: XCircle,
  info: Info,
}

const CARD_TONE_LABEL: Record<Exclude<CardVariant, "default">, string> = {
  success: "سليم",
  warning: "يحتاج انتباهك",
  danger: "خطر",
  info: "للعلم",
}

function Card({
  className,
  size = "default",
  variant = "default",
  ...props
}: React.ComponentProps<"div"> & {
  size?: "default" | "sm"
  /** النبرة الدلالية — لا تُستعمل إلا حين يحمل اللون معنى تشغيلياً */
  variant?: CardVariant
}) {
  const toned = variant !== "default"
  return (
    <div
      data-slot="card"
      data-size={size}
      data-variant={variant}
      className={cn(
        "group/card flex flex-col gap-(--card-spacing) overflow-hidden rounded-xl py-(--card-spacing) text-sm text-card-foreground ring-1 [--card-spacing:--spacing(4)] has-data-[slot=card-footer]:pb-0 has-[>img:first-child]:pt-0 data-[size=sm]:[--card-spacing:--spacing(3)] data-[size=sm]:has-data-[slot=card-footer]:pb-0 *:[img:first-child]:rounded-t-xl *:[img:last-child]:rounded-b-xl",
        toned ? [CARD_TONE_VAR[variant], CARD_TONE_SKIN] : "bg-card ring-foreground/10",
        className
      )}
      {...props}
    />
  )
}

/**
 * أيقونة النبرة — تُعرض داخل البطاقة الملوّنة فتصير الحالة مقروءة بلا لون.
 * تضبط `--card-tone` بنفسها فتعمل داخل البطاقة وخارجها معاً.
 */
function CardToneIcon({
  variant,
  className,
}: {
  variant: CardVariant
  className?: string
}) {
  if (variant === "default") return null
  const Icon = CARD_TONE_ICON[variant]
  return (
    <span className={cn("inline-flex items-center", CARD_TONE_VAR[variant], className)}>
      <Icon aria-hidden className="size-4 shrink-0 text-[color:var(--card-tone)]" />
      <span className="sr-only">{CARD_TONE_LABEL[variant]}</span>
    </span>
  )
}

function CardHeader({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="card-header"
      className={cn(
        "group/card-header @container/card-header grid auto-rows-min items-start gap-1 rounded-t-xl px-(--card-spacing) has-data-[slot=card-action]:grid-cols-[1fr_auto] has-data-[slot=card-description]:grid-rows-[auto_auto] [.border-b]:pb-(--card-spacing)",
        className
      )}
      {...props}
    />
  )
}

function CardTitle({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="card-title"
      className={cn(
        "font-heading text-base leading-snug font-medium group-data-[size=sm]/card:text-sm",
        className
      )}
      {...props}
    />
  )
}

function CardDescription({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="card-description"
      className={cn("text-sm text-muted-foreground", className)}
      {...props}
    />
  )
}

function CardAction({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="card-action"
      className={cn(
        "col-start-2 row-span-2 row-start-1 self-start justify-self-end",
        className
      )}
      {...props}
    />
  )
}

function CardContent({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="card-content"
      className={cn("px-(--card-spacing)", className)}
      {...props}
    />
  )
}

function CardFooter({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="card-footer"
      className={cn(
        "flex items-center rounded-b-xl border-t bg-muted/50 p-(--card-spacing)",
        className
      )}
      {...props}
    />
  )
}

export {
  Card,
  CardHeader,
  CardFooter,
  CardTitle,
  CardAction,
  CardDescription,
  CardContent,
  CardToneIcon,
}
