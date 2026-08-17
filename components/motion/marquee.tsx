"use client";

import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { cn } from "@/lib/utils";
import { TIMING } from "./tokens";
import { usePrefersReducedMotion } from "./use-reduced-motion";
import styles from "./motion.module.css";

/**
 * شريطٌ يجري بلا نهاية — شريط شعارات الماركات في التصميم.
 *
 * الميكانيكا كما هي: المسار نسخٌ متطابقة بعرضٍ متساوٍ تماماً، وإزاحته بمقدار
 * `١٠٠٪ ÷ عدد النسخ` تضع النسخة التالية في مكان السابقة بالضبط ⇒ التفاف بلا
 * قفزة. والحركة CSS خالص على `transform` وحده، فتبقى على المُركِّب ولا تلمس
 * الخيط الرئيسي — وهذه حركةٌ تدور طوال عمر الصفحة، فالفرق ليس نظرياً.
 *
 * ودور الجافاسكربت هنا **توفير طاقة لا حركة**: يوقف الشريط حين يخرج من الشاشة
 * أو حين يصير التبويب في الخلفية. أما التوقّف عند التحويم وعند تركيز لوحة
 * المفاتيح فبلا جافاسكربت إطلاقاً (في `motion.module.css`)، والثاني منهما شرط
 * إتاحة لا زينة: من يتنقّل بالـTab لا يستطيع ملاحقة رابطٍ يهرب منه.
 *
 * 🔴 **وتقليل الحركة لا يعني «شريطاً متوقفاً»**: شريطٌ ساكن يقصّه
 * `overflow:hidden` يُخفي أكثر من نصف الشعارات بلا طريقة لرؤيتها. فتُفكّ
 * الحاوية وتُخفى النسخ المكرّرة وتلتفّ الشعارات في شبكة مرتّبة.
 */
export function Marquee({
  children,
  copies = 4,
  durationSec = TIMING.marqueeSec,
  reverse = false,
  pauseOnHover = true,
  className,
  setClassName,
  label,
}: {
  /** محتوى نسخةٍ واحدة — عناصر `<li>` عادةً. */
  children: ReactNode;
  /** عدد النسخ المتطابقة. أربعٌ تغطي حتى ~٤٥٠٠ بكسل من العرض. */
  copies?: number;
  durationSec?: number;
  /**
   * 🆕 ن‑٩ — يجري **عكس** اتجاه القراءة؟ والافتراضي «مع القراءة».
   *
   * ولا يُمرَّر «يمين/يسار»: الاتجاه الأساس يأتي من `[dir]` في CSS (وإلا سار
   * الشريط عكس القراءة على `/en`)، وهذا المقبض **يقلبه نسبياً** فيبقى صحيحاً
   * في اللغتين معاً.
   */
  reverse?: boolean;
  /**
   * 🆕 ن‑٩ — يقف عند التحويم؟ والافتراضي **نعم**، فمن يقرأ عنصراً يمرّ يستطيع
   * أن يقرأه.
   *
   * ⚠ **وتوقّف التركيز بلوحة المفاتيح لا يُطفئه هذا المقبض**: من يتنقّل بالـTab
   * لا يستطيع ملاحقة رابطٍ يهرب منه، وهو شرط إتاحة لا خيار — ولذلك قاعدتُه في
   * `motion.module.css` مستقلةٌ عن هذه السمة.
   */
  pauseOnHover?: boolean;
  className?: string;
  /** أصناف النسخة الواحدة (الفجوات والمحاذاة) — يملكها القسم لا هذا المكوّن. */
  setClassName?: string;
  /** اسمٌ مقروء للقائمة الحقيقية. */
  label?: string;
}) {
  const reduced = usePrefersReducedMotion();
  const viewportRef = useRef<HTMLDivElement>(null);
  const [paused, setPaused] = useState(false);

  useEffect(() => {
    if (reduced) return;
    const node = viewportRef.current;
    if (!node) return;

    let onScreen = true;
    let tabVisible = !document.hidden;
    const apply = () => setPaused(!(onScreen && tabVisible));

    const onVisibility = () => {
      tabVisible = !document.hidden;
      apply();
    };
    document.addEventListener("visibilitychange", onVisibility);

    let io: IntersectionObserver | undefined;
    if (typeof IntersectionObserver !== "undefined") {
      io = new IntersectionObserver(
        (entries) => {
          for (const e of entries) onScreen = e.isIntersecting;
          apply();
        },
        // هامشٌ سخيّ: يبدأ الجريان قبل أن يصل الشريط الشاشة بقليل فلا يبدو
        // كأنه «استيقظ» أمام القارئ.
        { rootMargin: "150px 0px" }
      );
      io.observe(node);
    }

    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      io?.disconnect();
    };
  }, [reduced]);

  const sets = Array.from({ length: Math.max(1, copies) });

  return (
    <div
      ref={viewportRef}
      className={cn(styles.marqueeViewport, className)}
      /**
       * سمةٌ **سالبة** لا موجبة: الافتراضي (بلا سمة) هو الوقوف عند التحويم،
       * فالقاعدة في CSS تُقرأ `:not([data-no-hover-pause])`. ولو كانت موجبة
       * لصار كل مستهلكٍ لا يعرف المقبض شريطاً لا يقف — وهو انحدارٌ صامت.
       */
      {...(pauseOnHover ? null : { "data-no-hover-pause": "" })}
    >
      <div
        className={styles.marqueeTrack}
        style={
          {
            "--marquee-dur": `${durationSec}s`,
            "--marquee-copies": Math.max(1, copies),
          } as CSSProperties
        }
        {...(paused ? { "data-paused": "" } : null)}
        {...(reverse ? { "data-reverse": "" } : null)}
      >
        {sets.map((_, i) => (
          <ul
            key={i}
            role="list"
            className={cn(setClassName, i > 0 && styles.marqueeSetDuplicate)}
            // النسخ الزائدة تكرارٌ بصريّ محض: يقرؤها القارئ الآلي عشر مرات
            // إن لم تُحجب، فتُحجب — وتبقى النسخة الأولى وحدها في شجرة الإتاحة.
            {...(i > 0
              ? { "aria-hidden": true as const }
              : label
                ? { "aria-label": label }
                : null)}
          >
            {children}
          </ul>
        ))}
      </div>
    </div>
  );
}
