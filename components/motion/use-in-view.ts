"use client";

import { useEffect, useRef, useState, type RefObject } from "react";

/**
 * «هل دخل هذا العنصر الشاشة مرة؟» — بمراقبٍ **مشترك** لا مراقبٍ لكل عنصر.
 *
 * لماذا المشاركة أصلاً؟ لأن `<Reveal>` سيلفّ عشرات العناصر في الصفحة الواحدة
 * (التصميم يحمل ٥١ منها)، و`new IntersectionObserver` لكل واحد يعني ٥١ مراقباً
 * يستيقظ كلٌّ منها على حدة. المراقب الواحد بنفس الخيارات يقبل عناصر بلا حدّ،
 * فتصير الكلفة مراقباً واحداً لكل **مجموعة خيارات** لا لكل عنصر.
 *
 * والمراقبة تُفكّ فور أول دخول: هذه حركة «مرّة واحدة» لا حالةٌ تتبدّل.
 */

type Options = {
  /** نفس هوامش التصميم الافتراضية للظهور المُدرَّج. */
  rootMargin?: string;
  threshold?: number;
  /**
   * لا تُراقب أصلاً (حالة تقليل الحركة). والنتيجة تبقى `false` —
   * فمن يحتاج «الحالة النهائية عند التعطيل» يكتبها بنفسه: `inView || reduced`.
   * والسبب في التقرير المرافق: الخلط بينهما يُنتج وميضاً عند الترطيب.
   */
  disabled?: boolean;
};

type Entry = { observer: IntersectionObserver; seen: WeakMap<Element, true> };

const pools = new Map<string, Entry>();
const callbacks = new WeakMap<Element, () => void>();

function pool(rootMargin: string, threshold: number): Entry | null {
  if (typeof IntersectionObserver === "undefined") return null;
  const key = `${rootMargin}|${threshold}`;
  let entry = pools.get(key);
  if (!entry) {
    const observer = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (!e.isIntersecting) continue;
          observer.unobserve(e.target);
          callbacks.get(e.target)?.();
          callbacks.delete(e.target);
        }
      },
      { rootMargin, threshold }
    );
    entry = { observer, seen: new WeakMap() };
    pools.set(key, entry);
  }
  return entry;
}

export function useInViewOnce<T extends Element>(
  options: Options = {}
): [RefObject<T | null>, boolean] {
  const {
    rootMargin = "0px 0px -8% 0px",
    threshold = 0.08,
    disabled = false,
  } = options;

  const ref = useRef<T | null>(null);
  const [seen, setSeen] = useState(false);

  useEffect(() => {
    if (disabled) return;
    const node = ref.current;
    if (!node) return;

    const entry = pool(rootMargin, threshold);

    /*
      حالتان تُحسمان فوراً: لا مراقب في المتصفح أصلاً، أو عنصرٌ سبق أن دخل.
      وكلتاهما تُعلَن **في الإطار التالي** لا في جسم الأثر — فتغيير الحالة
      داخل الجسم يُطلق دورة تصيير متتالية، وهي بالضبط ما يمنعه
      `react-hooks/set-state-in-effect`.
    */
    if (!entry || entry.seen.has(node)) {
      // بلا دعم المراقب: نُظهر بدل أن نُخفي للأبد. نفس اختيار التصميم.
      const frame = requestAnimationFrame(() => setSeen(true));
      return () => cancelAnimationFrame(frame);
    }

    callbacks.set(node, () => {
      entry.seen.set(node, true);
      setSeen(true);
    });
    entry.observer.observe(node);

    return () => {
      entry.observer.unobserve(node);
      callbacks.delete(node);
    };
  }, [disabled, rootMargin, threshold]);

  return [ref, seen];
}
