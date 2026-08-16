"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import { prefersReducedMotionNow } from "./use-reduced-motion";

/* ============================================================
   نقاط مؤشّر الشريط الأفقي (الأسطول · المسارات)

   الشريط نفسه يعمل بلا هذا المكوّن: قابلٌ للسحب باللمس وللتنقّل بالـTab.
   والنقاط لا تُصيَّر على الخادم إطلاقاً — فمن لا جافاسكربت عنده لا يرى
   أزراراً لا تعمل.

   🔴 **ومصيدة RTL التي يحذّر منها التصميم نفسه، وقد وقع فيها في موضعين:**

   > «كروم الحديث يجعل مدى `scrollLeft` في الاتجاه من اليمين لليسار **سالباً**
   > (من `-(scrollWidth - clientWidth)` إلى صفر)، بينما `offsetLeft` يبقى
   > موجباً من حافة اليسار — فخلطهما يعطي قيمةً خارج المدى تُقصّ إلى الصفر ولا
   > يتحرك الشريط إطلاقاً.» — تعليق `main.js` عند شريط الآراء

   والتعليق نفسه يعترف: «نفس الخلط موجود في `initRail` أعلاه لشريطَي الأسطول
   والمسارات». أي أن **النسختين المستعملتين فعلاً في التصميم مكسورتان**،
   والصحيحة كُتبت للقسم الوحيد الذي قرّر بدر ألا يُبنى (الآراء).

   فالمنقول هنا هو **النسخة الصحيحة**: كل الحساب بفروق
   `getBoundingClientRect` النسبية و`scrollBy`، بلا `scrollLeft` مطلق ولا
   `offsetLeft` — فيعمل في الاتجاهين بلا فرعٍ لكلٍّ منهما.
   ============================================================ */

export function RailDots({
  railId,
  label,
  itemSelector = ":scope > li",
  className,
  dotClassName,
}: {
  /** معرّف حاوية التمرير الأفقي. */
  railId: string;
  /** اسمٌ مقروء لكل نقطة: «الفئة ٢» مثلاً. */
  label: string;
  itemSelector?: string;
  className?: string;
  dotClassName?: string;
}) {
  const [count, setCount] = useState(0);
  const [active, setActive] = useState(0);
  const railRef = useRef<HTMLElement | null>(null);
  const cardsRef = useRef<HTMLElement[]>([]);

  /** المسافة الأفقية بين مركز البطاقة ومركز الشريط، بإحداثيات الشاشة. */
  const offsetToCentre = useCallback((card: HTMLElement): number => {
    const rail = railRef.current;
    if (!rail) return 0;
    const r = rail.getBoundingClientRect();
    const c = card.getBoundingClientRect();
    return c.left + c.width / 2 - (r.left + r.width / 2);
  }, []);

  const current = useCallback((): number => {
    let best = 0;
    let bestD = Infinity;
    cardsRef.current.forEach((card, i) => {
      const d = Math.abs(offsetToCentre(card));
      if (d < bestD) {
        bestD = d;
        best = i;
      }
    });
    return best;
  }, [offsetToCentre]);

  useEffect(() => {
    const rail = document.getElementById(railId);
    if (!rail) return;
    railRef.current = rail;

    const cards = Array.from(
      rail.querySelectorAll<HTMLElement>(itemSelector)
    );
    cardsRef.current = cards;
    if (cards.length < 2) return; // نقطةٌ واحدة لا تدلّ على شيء

    // القياس من الـDOM يُعلَن في الإطار التالي لا في جسم الأثر
    // (‏`react-hooks/set-state-in-effect`).
    const frame = requestAnimationFrame(() => {
      setCount(cards.length);
      setActive(current());
    });

    /*
      بوابةٌ زمنية لا رايةٌ منطقية: لو تعطّل `requestAnimationFrame` (تبويب في
      الخلفية، تقييد المتصفح) لا تبقى الراية مرفوعة للأبد فتتجمّد النقاط —
      تتعافى وحدها بعد ٨٠ms.
    */
    let lastTick = 0;
    const onScroll = () => {
      const now = Date.now();
      if (now - lastTick <= 80) return;
      lastTick = now;
      requestAnimationFrame(() => setActive(current()));
    };

    rail.addEventListener("scroll", onScroll, { passive: true });

    return () => {
      cancelAnimationFrame(frame);
      rail.removeEventListener("scroll", onScroll);
    };
  }, [railId, itemSelector, current]);

  const goTo = (index: number) => {
    const rail = railRef.current;
    const card = cardsRef.current[index];
    if (!rail || !card) return;

    const dx = offsetToCentre(card);
    if (Math.abs(dx) >= 1) {
      rail.scrollBy({
        left: dx,
        behavior: prefersReducedMotionNow() ? "auto" : "smooth",
      });
    }
    // تحديثٌ مؤكَّد بعد انتهاء الانزلاق، فلا تعلق النقطة على القديمة.
    window.setTimeout(() => setActive(current()), 520);
  };

  if (count === 0) return null;

  return (
    <div role="tablist" aria-label={label} className={className}>
      {Array.from({ length: count }, (_, i) => (
        <button
          key={i}
          type="button"
          role="tab"
          aria-selected={i === active}
          aria-label={`${label} ${i + 1}`}
          className={cn(dotClassName)}
          onClick={() => goTo(i)}
        />
      ))}
    </div>
  );
}
