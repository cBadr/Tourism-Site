import * as React from "react";

import { cn } from "@/lib/utils";

/**
 * اعتبار ٧ من الرؤية: أيقونة «؟» إرشادية بجوار كل خيار في لوحات التحكم.
 * Tooltip خفيف بلا أي مكتبة إضافية — CSS + ARIA فقط:
 * يظهر بالتحويم وبتركيز لوحة المفاتيح (وباللمس عبر التركيز على الموبايل).
 * يعمل في مكوّنات الخادم والعميل معاً (لا "use client" هنا).
 *
 * الاستخدام: <HelpTip>نص إرشادي قصير يشرح الخيار</HelpTip>
 */
export function HelpTip({
  children,
  className,
}: {
  /** نص الإرشاد الذي يظهر داخل التلميح */
  children: React.ReactNode;
  className?: string;
}) {
  const id = React.useId();

  return (
    <span className={cn("group/helptip relative inline-flex align-middle", className)}>
      <button
        type="button"
        aria-label="مساعدة"
        aria-describedby={id}
        className="inline-flex size-4 shrink-0 cursor-help items-center justify-center rounded-full border border-muted-foreground/40 text-[0.65rem] font-bold leading-none text-muted-foreground outline-none transition-colors hover:border-primary hover:text-primary focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/50"
      >
        ؟
      </button>
      <span
        role="tooltip"
        id={id}
        className="pointer-events-none absolute bottom-full start-1/2 z-50 mb-2 w-56 rounded-lg bg-foreground px-3 py-2 text-start text-xs font-normal leading-relaxed whitespace-normal text-background opacity-0 shadow-md transition-opacity duration-150 group-focus-within/helptip:opacity-100 group-hover/helptip:opacity-100 ltr:-translate-x-1/2 rtl:translate-x-1/2"
      >
        {children}
      </span>
    </span>
  );
}
