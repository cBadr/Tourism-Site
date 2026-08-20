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
      {/*
        🔴 **الدائرةُ المرئية ١٦ بكسلاً، وهدفُ اللمس ٤٤** — والفرقُ بينهما مقصود.
        (‏PageSpeed 2026-08-20: «هدفُ لمسٍ أصغرُ من اللازم»، وهو أحدُ بندَين رسبا.)

        فتكبيرُ الدائرة إلى ٤٤ يجعل علامةَ استفهامٍ جانبيةً تنافس النصَّ الذي
        تشرحه؛ وتركُها ١٦ يجعل الإصابةَ بالإبهام حظّاً. والعلاجُ **طبقةٌ شفافة
        موسَّعة** بـ`::after` تمتدّ من مركز الزرّ: المظهرُ لا يتغيّر بكسلاً،
        والمساحةُ القابلة للنقر تصير ٤٤×٤٤.

        ⚠ و`relative` على الزرّ لا على الغلاف: الغلافُ `relative` سلفاً لأن
        التلميحَ يُرسى إليه، فطبقةٌ محسوبةٌ منه كانت ستنزاح مع عرض النصّ.
        ⚠ و`z-0` تُبقي الطبقةَ تحت التلميح (`z-50`) فلا تبتلع تمريره.
      */}
      <button
        type="button"
        aria-label="مساعدة"
        aria-describedby={id}
        className="relative z-0 inline-flex size-4 shrink-0 cursor-help items-center justify-center rounded-full border border-muted-foreground/40 text-[0.65rem] font-bold leading-none text-muted-foreground outline-none transition-colors after:absolute after:left-1/2 after:top-1/2 after:size-11 after:-translate-x-1/2 after:-translate-y-1/2 after:content-[''] hover:border-primary hover:text-primary focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/50"
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
