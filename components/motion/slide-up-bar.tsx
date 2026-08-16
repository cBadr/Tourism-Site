"use client";

import { useCallback, useRef, type ReactNode } from "react";
import { cn } from "@/lib/utils";
import { useScrollPast } from "./use-scroll-past";
import styles from "./motion.module.css";

/**
 * الشريط اللاصق السفلي — ينزلق صاعداً بعد تجاوز البطل.
 *
 * حدّ التصميم: `ارتفاع البطل − ١٤٠` — أي أنه يظهر قبل أن يختفي البطل تماماً،
 * فلا تمرّ على القارئ لحظةٌ واحدة بلا زرّ حجز على الشاشة.
 *
 * 🔴 **وبلا جافاسكربت يبقى الشريط ظاهراً** (الإخفاء مشروط في CSS بـ
 * `scripting: enabled`). زرُّ حجزٍ ظاهرٌ دائماً أسوأ احتمالاته أنه زائد،
 * وزرٌّ مخفيّ للأبد خسارةُ تحويلٍ صامتة.
 */
export function SlideUpBar({
  children,
  className,
  /** ارتفاع البطل بالبكسل، أو `undefined` فيُقرأ من العنصر ذي هذا المعرّف. */
  heroId = "hero",
  offset = 140,
}: {
  children: ReactNode;
  className?: string;
  heroId?: string;
  offset?: number;
}) {
  // نقرأ الارتفاع عند كل نداء لا مرّة واحدة: ارتفاع البطل يتغيّر بالدوران،
  // وبتحميل الخطوط، وبالتفاف العنوان على شاشةٍ ضيقة.
  const cached = useRef(0);
  const threshold = useCallback(() => {
    const hero = document.getElementById(heroId);
    if (hero) cached.current = hero.offsetHeight;
    // بلا بطل على الصفحة: حدٌّ معقول بدل صفر (وإلا ظهر الشريط فوق البطل نفسه)
    return (cached.current || window.innerHeight * 0.8) - offset;
  }, [heroId, offset]);

  const on = useScrollPast(threshold);

  return (
    <div
      className={cn(styles.slideUpBar, className)}
      {...(on ? { "data-on": "" } : null)}
    >
      {children}
    </div>
  );
}
