"use client";

import { useEffect, useRef, useState } from "react";
import { animate } from "motion/react";
import { cn } from "@/lib/utils";
import { DESIGN_ONLY, TIMING } from "./tokens";
import { usePrefersReducedMotion } from "./use-reduced-motion";
import { useInViewOnce } from "./use-in-view";
import styles from "./motion.module.css";

/* ============================================================
   عدّاد شريط الأرقام

   القيمة النهائية مكتوبة في HTML الخادمي أصلاً — هذه الحلقة **تحسين بصري
   فقط**. من عطّل جافاسكربت، أو طلب تقليل الحركة، أو سقطت عنه الحزمة: يرى
   الرقم النهائي كما كتبه المالك في اللوحة، حرفاً بحرف.

   ⚠ **ولا يخترع هذا المكوّن رقماً ولا صيغة.** يصله النص كما كُتب في
   `sections.content` (‏`value` حقلٌ نصّي بقرار جدول الفجوات §٣، لأن العربية
   تكتب ١٢٬٤٠٠ والإنجليزية 12,400 والفاصلة نفسها تختلف). فالعدّ يقرأ رقماً من
   ذلك النص، ويعدّ إليه بنفس **نظام أرقامه ونفس فواصله**، ثم يضع النص الأصلي
   في الإطار الأخير — فلا ينحرف المعروض عمّا كتبه المالك ولو حرفاً.

   وما لا يستطيع قراءته بيقين (‏«٢٤/٧» مثلاً) **لا يعدّه**: يعرضه كما هو بلا
   حركة. رقمٌ يُعدّ خطأً أسوأ من رقمٍ ساكن.
   ============================================================ */

/** خريطة الأرقام العربية-الهندية والفارسية إلى اللاتينية. */
const DIGIT_MAP: Record<string, string> = {};
for (let i = 0; i < 10; i++) {
  DIGIT_MAP[String.fromCharCode(0x0660 + i)] = String(i); // ٠-٩
  DIGIT_MAP[String.fromCharCode(0x06f0 + i)] = String(i); // ۰-۹
}

const ARABIC_DIGIT = /[٠-٩۰-۹]/;
/** فواصل التجميع المقبولة: الفاصلة اللاتينية، وفاصلة الآلاف العربية `٬`. */
const GROUP_SEP = /[,٬]/g;
/** الفاصلة العشرية: النقطة، أو العلامة العشرية العربية `٫`. */
const DECIMAL_SEP = /[.٫]/;

type Parsed = {
  target: number;
  decimals: number;
  grouped: boolean;
  arabicDigits: boolean;
};

/**
 * يقرأ النص المكتوب في اللوحة. يرجع `null` لكل ما ليس عدداً خالصاً —
 * وهو الفرق بين «١٢٬٤٠٠» (يُعدّ) و«٢٤/٧» (لا يُعدّ).
 */
function parseAuthored(text: string): Parsed | null {
  const raw = text.trim();
  if (!raw) return null;

  const arabicDigits = ARABIC_DIGIT.test(raw);
  const grouped = GROUP_SEP.test(raw);
  GROUP_SEP.lastIndex = 0;

  // توحيد الأرقام ثم نزع فواصل التجميع وتوحيد الفاصلة العشرية
  let latin = "";
  for (const ch of raw) latin += DIGIT_MAP[ch] ?? ch;
  latin = latin.replace(GROUP_SEP, "").replace(DECIMAL_SEP, ".");

  // ما بقي يجب أن يكون عدداً وحده: لا شرطة، ولا مائلة، ولا حرف، ولا لاحقة.
  if (!/^\d+(\.\d+)?$/.test(latin)) return null;

  const target = Number(latin);
  if (!Number.isFinite(target)) return null;

  const dot = latin.indexOf(".");
  return {
    target,
    decimals: dot < 0 ? 0 : latin.length - dot - 1,
    grouped,
    arabicDigits,
  };
}

function makeFormatter(p: Parsed): Intl.NumberFormat {
  return new Intl.NumberFormat(p.arabicDigits ? "ar-EG" : "en-US", {
    numberingSystem: p.arabicDigits ? "arab" : "latn",
    useGrouping: p.grouped,
    minimumFractionDigits: p.decimals,
    maximumFractionDigits: p.decimals,
  });
}

export function CountUp({
  value,
  suffix,
  stagger = 0,
  className,
}: {
  /** النص كما كتبه المالك في اللوحة — هو المعروض قبل العدّ وبعده. */
  value: string;
  /** لاحقة لا تُعدّ («+» · «/5»)، تبقى ملتصقة بالرقم أثناء العدّ. */
  suffix?: string;
  /** رتبة العدّاد في الشريط — تدرّجٌ خفيف يوازي ظهور البطاقات. */
  stagger?: number;
  className?: string;
}) {
  const reduced = usePrefersReducedMotion();
  const [hostRef, inView] = useInViewOnce<HTMLSpanElement>({
    threshold: 0.6,
    rootMargin: "0px",
    disabled: reduced,
  });
  const numRef = useRef<HTMLSpanElement>(null);
  const [phase, setPhase] = useState<"idle" | "running" | "done">("idle");

  useEffect(() => {
    if (!inView || reduced) return;

    const parsed = parseAuthored(value);
    const host = hostRef.current;
    const num = numRef.current;
    if (!parsed || !host || !num) {
      setPhase("done");
      return;
    }

    const format = makeFormatter(parsed);
    let cancelled = false;
    let controls: { stop: () => void } | null = null;
    let safety: ReturnType<typeof setTimeout> | undefined;
    let startTimer: ReturnType<typeof setTimeout> | undefined;
    let fontTimer: ReturnType<typeof setTimeout> | undefined;

    /** الحالة النهائية الأكيدة: النص الأصلي، وتحرير حجز العرض. */
    const settle = () => {
      if (cancelled) return;
      cancelled = true;
      controls?.stop();
      num.textContent = value;
      host.style.minInlineSize = "";
      setPhase("done");
    };

    const run = () => {
      if (cancelled) return;

      /*
        نحجز عرض الكتلة النهائية (الرقم + اللاحقة) بالبكسل قبل أن نضع صفراً
        مكانها — وإلا انكمش الصندوق ثم اتسع مع كل رقم يُضاف، فقفز التخطيط
        وانفصلت اللاحقة عن الرقم. ويُحرَّر الحجز فور الانتهاء.
      */
      const w = host.getBoundingClientRect().width;
      if (w) host.style.minInlineSize = `${Math.ceil(w)}px`;

      setPhase("running");
      num.textContent = format.format(0);

      /*
        🔴 هنا تُستدعى `motion` لأنها **تكسب مكانها**: الأصل يحلّ منحنى بيزييه
        مكعّباً بالتنصيف في أربعة عشر تكراراً لكل إطار — أربعون سطراً من
        الرياضيات المكتوبة يدوياً. `animate` تأخذ المنحنى الأربعة أعداد نفسها
        وتديره على مجدوِل واحد يشاركه كل ما في الصفحة، وتوقف نفسها عند تفكيك
        المكوّن. المدة والمنحنى من `tokens.ts` لا مكتوبان هنا.
      */
      controls = animate(0, parsed.target, {
        duration: TIMING.countMs / 1000,
        ease: [...DESIGN_ONLY.easeCount],
        onUpdate: (v) => {
          if (!cancelled) num.textContent = format.format(v);
        },
        onComplete: settle,
      });

      // شبكة أمان: لو تعطّل إطار العرض (تبويب في الخلفية، تقييد المتصفح)
      // يظهر الرقم النهائي على كل حال بدل أن يتجمّد على صفر.
      safety = setTimeout(settle, TIMING.countMs + 700);
    };

    /*
      لا نقيس العرض قبل جهوز الخطوط: القياس بخطٍّ احتياطي يعطي حجزاً أضيق من
      الحقيقي، فيقفز الرقم في نهاية العدّ — وهو بالضبط ما يفترض الحجز منعه.
      والمهلة ١٢٠٠ms للحالة التي لا يُحسم فيها وعد الخطوط لأي سبب.
    */
    const begin = () => {
      if (cancelled || startTimer !== undefined) return;
      startTimer = setTimeout(run, stagger * TIMING.countStepMs);
    };

    if (typeof document !== "undefined" && document.fonts?.ready) {
      document.fonts.ready.then(begin, begin);
      fontTimer = setTimeout(begin, 1200);
    } else {
      begin();
    }

    return () => {
      cancelled = true;
      controls?.stop();
      clearTimeout(safety);
      clearTimeout(startTimer);
      clearTimeout(fontTimer);
      host.style.minInlineSize = "";
    };
  }, [inView, reduced, value, stagger, hostRef]);

  return (
    <span
      ref={hostRef}
      className={cn(styles.counter, className)}
      /* «ساكن» هي حالة الخادم وحالة تقليل الحركة معاً — وكلتاهما بلا وهج،
         فلا سمةٌ تُكتب ثم يسحبها الترطيب. */
      data-count={phase}
    >
      {/* الرقم يُصيَّر نصّاً كما كُتب — فما يصل الزاحف والقارئ الآلي هو الرقم لا صفر */}
      <span ref={numRef}>{value}</span>
      {/* اللاحقة معنى لا زخرفة («+» تقول «أكثر من») فتبقى مقروءة للقارئ الآلي */}
      {suffix ? <span>{suffix}</span> : null}
    </span>
  );
}
