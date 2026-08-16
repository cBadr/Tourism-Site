"use client";

import { useEffect, useRef, type ReactNode } from "react";
import { cn } from "@/lib/utils";
import styles from "./motion.module.css";

/* ============================================================
   وهجٌ يتبع المؤشّر على بطاقات الخدمات

   تحسينٌ بحت: بلا جافاسكربت يبقى الوهج ثابتاً أعلى البطاقة عند التحويم
   (القيمتان الافتراضيتان `--mx/--my` في CSS)، والقسم يعمل كاملاً.

   وثلاثة شروط قبل أن يعمل، وكلها من التصميم:
     ١) `prefers-reduced-motion` غير مطلوب.
     ٢) جهاز تأشير دقيق (`hover: hover` و`pointer: fine`) — على شاشة اللمس
        لا مؤشّر يُتبَع أصلاً، والمستمع يصير كلفةً بلا أثر.
     ٣) `pointerType === "mouse"` — القلم واللمس يولّدان `pointermove` أيضاً.

   ⚠ **والمستمع واحدٌ على الشبكة لا واحدٌ لكل بطاقة** (تفويض). ست بطاقات
   بستة مستمعي `pointermove` ستّ حلقاتٍ تستيقظ مع كل حركة إصبع.
   ============================================================ */

/** طبقة الوهج نفسها — تُوضع داخل البطاقة فوق الصورة وتحت النص. */
export function PointerGlowLayer({ className }: { className?: string }) {
  return <span className={cn(styles.pointerGlow, className)} aria-hidden="true" />;
}

/** صنف البطاقة الحاضنة — هو ما يُظهر الوهج عند التحويم والتركيز. */
export const pointerGlowHostClass = styles.pointerGlowHost;

/**
 * حاوية الشبكة: تلتقط حركة المؤشّر مرّة واحدة وتوزّعها على البطاقة تحته.
 * `cardSelector` هو ما يميّز البطاقة داخل الشبكة — يمرّره القسم لأنه يملك
 * ماركَبه، وافتراضه صنف الحاضن أعلاه.
 */
export function PointerGlowGrid({
  children,
  className,
  cardSelector,
  as: Tag = "div",
}: {
  children: ReactNode;
  className?: string;
  cardSelector?: string;
  as?: "div" | "ul" | "ol" | "section";
}) {
  const ref = useRef<HTMLElement>(null);
  const selector = cardSelector ?? `.${styles.pointerGlowHost}`;

  useEffect(() => {
    const grid = ref.current;
    if (!grid || !window.matchMedia) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    if (!window.matchMedia("(hover: hover) and (pointer: fine)").matches) return;

    let target: HTMLElement | null = null;
    let px = 0;
    let py = 0;
    let pending = false;

    const paint = () => {
      pending = false;
      if (!target) return;
      const r = target.getBoundingClientRect();
      if (!r.width || !r.height) return;
      target.style.setProperty(
        "--mx",
        `${(((px - r.left) / r.width) * 100).toFixed(2)}%`
      );
      target.style.setProperty(
        "--my",
        `${(((py - r.top) / r.height) * 100).toFixed(2)}%`
      );
    };

    const onMove = (e: PointerEvent) => {
      if (e.pointerType && e.pointerType !== "mouse") return;
      const card = (e.target as Element | null)?.closest?.(selector);
      if (!(card instanceof HTMLElement)) return;
      target = card;
      px = e.clientX;
      py = e.clientY;
      if (!pending) {
        pending = true;
        requestAnimationFrame(paint);
      }
    };

    const onLeave = () => {
      if (!target) return;
      target.style.removeProperty("--mx");
      target.style.removeProperty("--my");
      target = null;
    };

    grid.addEventListener("pointermove", onMove, { passive: true });
    grid.addEventListener("pointerleave", onLeave, { passive: true });
    return () => {
      grid.removeEventListener("pointermove", onMove);
      grid.removeEventListener("pointerleave", onLeave);
    };
  }, [selector]);

  return (
    <Tag ref={ref as never} className={className}>
      {children}
    </Tag>
  );
}
