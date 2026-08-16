"use client";

import type { CSSProperties, ElementType, ReactNode } from "react";
import { cn } from "@/lib/utils";
import { usePrefersReducedMotion } from "./use-reduced-motion";
import { useInViewOnce } from "./use-in-view";
import styles from "./motion.module.css";

/**
 * الظهور المُدرَّج عند التمرير — نقلٌ حرفيّ لـ`.reveal` في التصميم:
 * ارتفاعٌ ١٤ بكسل + تلاشٍ، على مدى `--dur-3` بمنحنى `--motion-ease`،
 * وتأخيرٌ `stagger × ٧٠ms` يجعل بطاقات الصف تظهر تباعاً لا دفعة.
 *
 * 🔴 **لماذا هذا ليس `motion.div`؟** لأن العنصر الواحد هنا لا يحتاج محرّك
 * حركة: انتقالٌ CSS واحد يديره المُركِّب. و`<Reveal>` سيلفّ عشرات العناصر في
 * الصفحة (التصميم يحمل ٥١) — فلو كان كلٌّ منها مكوّن `motion` لصار في الصفحة
 * عشرات المشتركين في حلقة إطارات جافاسكربت مقابل حركةٍ واحدة تافهة. الحدّ
 * المكتوب في `README` هذه المجلد: `motion` تُستدعى حين تكون القيمة **محسوبة**
 * (عدّاد · مسار)، لا حين تكون **معلومة سلفاً** (من ١٤ إلى صفر).
 *
 * والجافاسكربت هنا يفعل شيئاً واحداً: يضع `data-in` عند أول دخول للشاشة.
 * أما إخفاء ما قبله فمشروطٌ في CSS بـ`scripting: enabled` و`no-preference`
 * معاً، وله شبكة أمان CSS خالصة تكشفه بعد ست ثوانٍ لو مات الجافاسكربت.
 */
export function Reveal({
  as: Tag = "div",
  stagger = 0,
  eager = false,
  className,
  style,
  children,
  ...rest
}: {
  /** الوسم المُصيَّر — `li` داخل قائمة، `section` لقسم، وهكذا. */
  as?: ElementType;
  /** رتبة العنصر في مجموعته: صفر للأول، واحد للثاني… */
  stagger?: number;
  /**
   * 🔴 **يُستعمل لكل ما يقع فوق الطيّة، وعلى رأسه عنوان البطل.**
   *
   * العنصر المُدرَّج يبدأ **مخفياً** ولا يظهر إلا بعد الترطيب ودخول الشاشة.
   * وهذا مقبولٌ لقسمٍ في منتصف الصفحة، وغيرُ مقبول لعنوان البطل: هو مرشّح
   * LCP، فإخفاؤه حتى تصل الحزمة يؤخّر أكبر رسمةٍ في الصفحة بمقدار زمن
   * الترطيب كاملاً — في منتجٍ السيو هو منتجه.
   *
   * ومع `eager` يخرج العنصر من الخادم في حالته النهائية ولا يُخفى قط، ويبقى
   * التدرّج نفسه عاملاً لمن تحته.
   */
  eager?: boolean;
  className?: string;
  style?: CSSProperties;
  children?: ReactNode;
} & Record<string, unknown>) {
  const reduced = usePrefersReducedMotion();
  const [ref, inView] = useInViewOnce<HTMLElement>({ disabled: reduced || eager });

  /*
    ⚠ لا `|| reduced` هنا — وهذا سطرٌ يمنع وميضاً حقيقياً.

    `usePrefersReducedMotion` ترجع `true` على الخادم (الفرع الآمن). فلو عُلِّقت
    السمة على «تقليل الحركة» لخرجت في HTML، ثم أزالها الترطيب حين يكتشف المتصفح
    أن الحركة مطلوبة — فيرى القارئ: **نصّاً ظاهراً ⇐ يختفي ⇐ يعود متلاشياً**.

    والصحيح أن الحالتين مستقلّتان أصلاً: قاعدة الإخفاء كلها داخل
    `(prefers-reduced-motion: no-preference)`، فمن طلب تقليل الحركة لا تمسّه
    السمة أصلاً — حاضرةً كانت أو غائبة.
  */
  return (
    <Tag
      ref={ref}
      className={cn(styles.reveal, className)}
      style={{ ...style, "--stagger": stagger } as CSSProperties}
      {...(inView || eager ? { "data-in": "" } : null)}
      {...rest}
    >
      {children}
    </Tag>
  );
}
