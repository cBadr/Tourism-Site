import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import styles from "./motion.module.css";

/* ============================================================
   أجواء البطل — أربع حركات، وصفر جافاسكربت

   ⚠ **ولا `"use client"` في هذا الملف عن قصد.** الأربع حركاتٌ لا نهائية
   زخرفية، وكلها CSS خالص يديره المُركِّب. لو صارت مكوّنات `motion` لدفعنا
   ثمناً مزدوجاً بلا مقابل: حزمة جافاسكربت إضافية على **المسار الحرج** (البطل
   أول ما يُرسم)، وحلقة إطارات تدور عشرين دقيقة لتحريك صورةٍ بمقدار ٪٨.

   وهذه هي القسمة التي يقوم عليها المجلد كله: `motion` حين تكون القيمة
   **محسوبة**، وCSS حين تكون **معلومة سلفاً**.
   ============================================================ */

/** صنف Ken Burns — يُوضع على صورة البطل. */
export const kenBurnsClass = styles.kenBurns;

/** حاوية وسائط البطل: ترتّب طبقات الصورة والفيديو والجسيمات ترتيباً صريحاً. */
export function HeroMedia({
  hasVideo = false,
  className,
  children,
}: {
  /** يوقف Ken Burns حين يعمل الفيديو فلا تتحرك طبقتان فوق بعضهما. */
  hasVideo?: boolean;
  className?: string;
  children: ReactNode;
}) {
  return (
    <div
      className={cn(styles.heroMedia, hasVideo && styles.mediaHasVideo, className)}
      // الطبقة كلها زخرفة خلف نصٍّ مقروء — لا شيء فيها يحمل معنى.
      aria-hidden="true"
    >
      {children}
    </div>
  );
}

/**
 * ست جسيمات ضوئية تطفو صعوداً — مواضعها ومددها وتأخيراتها من التصميم حرفاً
 * بحرف. مع تقليل الحركة: لا تظهر إطلاقاً (شفافيتها الأساس صفر، والحركة وحدها
 * تُظهرها) — أي أنها تختفي بلا قاعدة إخفاء ثانية.
 */
export function Sparks({ className }: { className?: string }) {
  return (
    <div className={cn(styles.sparks, className)} aria-hidden="true">
      <span className={cn(styles.spark, styles.spark1)} />
      <span className={cn(styles.spark, styles.spark2)} />
      <span className={cn(styles.spark, styles.spark3)} />
      <span className={cn(styles.spark, styles.spark4)} />
      <span className={cn(styles.spark, styles.spark5)} />
      <span className={cn(styles.spark, styles.spark6)} />
    </div>
  );
}

/** نقطة تنبض داخل شارة البطل — «متاح الآن» ونحوها. */
export function PulseDot({ className }: { className?: string }) {
  return <span className={cn(styles.pulseDot, className)} aria-hidden="true" />;
}

/** صنف سهم «مرّر لأسفل» المتأرجح — يُوضع على حاوية الأيقونة. */
export const scrollCueClass = styles.scrollCue;
