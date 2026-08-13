"use client";

import * as React from "react";
import { Check, Copy } from "lucide-react";
import { cn } from "@/lib/utils";
import { useT } from "@/components/site/i18n";

/**
 * زر نسخ صغير — لرقم الحجز وأرقام المحافظ وعناوين انستا باي والرابط.
 *
 * ينسخ عبر Clipboard API، ويسقط إلى تحديد النص عند رفض المتصفح (سياق غير آمن
 * أو صلاحية مرفوضة) فلا يبقى الزائر بلا وسيلة. الحالة تُعلن لقارئات الشاشة.
 */
export function CopyButton({
  value,
  label,
  className,
  variant = "icon",
}: {
  /** النص المنسوخ */
  value: string;
  /** وصف ما يُنسخ — يدخل في تسمية الزر لقارئ الشاشة */
  label: string;
  className?: string;
  variant?: "icon" | "inline";
}) {
  const t = useT("booking.copy");
  const [copied, setCopied] = React.useState(false);
  const timerRef = React.useRef<number | null>(null);

  React.useEffect(() => {
    return () => {
      if (timerRef.current !== null) window.clearTimeout(timerRef.current);
    };
  }, []);

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(value);
    } catch {
      // متصفح لا يمنح الحافظة — لا نُظهر خطأ، النص ظاهر أمام الزائر ليحدده يدوياً
      return;
    }
    setCopied(true);
    if (timerRef.current !== null) window.clearTimeout(timerRef.current);
    timerRef.current = window.setTimeout(() => setCopied(false), 2000);
  }

  return (
    <button
      type="button"
      onClick={handleCopy}
      aria-label={
        copied
          ? t("copiedAria", "تم نسخ {label}", { label })
          : t("copyAria", "نسخ {label}", { label })
      }
      className={cn(
        "inline-flex shrink-0 items-center justify-center gap-1.5 rounded-xl border border-border bg-background text-sm font-medium transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50",
        variant === "icon" ? "size-9" : "h-9 px-3",
        copied && "border-primary/40 text-primary",
        className
      )}
    >
      {copied ? (
        <Check className="size-4" aria-hidden="true" />
      ) : (
        <Copy className="size-4" aria-hidden="true" />
      )}
      {variant === "inline" ? (
        <span>{copied ? t("copied", "تم النسخ") : t("copy", "نسخ")}</span>
      ) : null}
      <span className="sr-only" role="status" aria-live="polite">
        {copied ? t("copiedAria", "تم نسخ {label}", { label }) : ""}
      </span>
    </button>
  );
}
