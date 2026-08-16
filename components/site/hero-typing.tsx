"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { usePrefersReducedMotion } from "@/components/motion";
import type { TypingHoldToken, TypingSpeedToken } from "@/lib/page-builder-types";

/* ============================================================================
   ن‑٤ — أثر الكتابة على عنوان البطل، **قناعاً فوق نصٍّ كامل من الخادم**

   🔴 القرار الذي وافق عليه بدر، ولماذا رُفض نظيره الشائع:

   الطريقة المعتادة تحقن الحروف واحداً واحداً في `textContent`. وهي تكلّف
   الصفحةَ أغلى ما فيها مرتين:

     ١) **البحث** — `<h1>` أهم عنصرٍ في الصفحة، ويصل الزاحفَ **فارغاً أو
        ناقصاً** لأن HTML الخادمي لا يحمل إلا ما حُقن حتى تلك اللحظة (وغالباً
        لا شيء، فالحقن يبدأ بعد الترطيب).
     ٢) **قارئ الشاشة** — عنصرٌ يتبدّل نصّه ثلاثين مرة في الثانية يُنطق حرفاً
        حرفاً عند بعض القرّاء، فيصير العنوان ضجيجاً لا جملة.

   فالنصّ هنا **يُصيَّر كاملاً على الخادم** (`lines[0]` نصٌّ حقيقي داخل الـ
   `<h1>`)، والحركة كلها `clip-path` على العنصر نفسه: لا حرفَ يُضاف ولا يُحذف
   أثناء الكتابة، ولا `aria-live` — فالعنوان يُنطق مرةً واحدة كاملاً عند
   تحميل الصفحة، تماماً كأي عنوانٍ ساكن.

   ── وثلاثة قيودٍ تُقرأ قبل تعديل سطرٍ هنا ──────────────────────────────────

   • **الارتفاع محجوزٌ لأطول جملة بالبناء لا بالحساب:** السطر `nowrap`، وحجم
     خطّه محسوبٌ من **أطول** جملة، فارتفاعه سطرٌ واحدٌ ثابت مهما تبدّل النصّ.
     ولا قفزة تخطيط على ما تحته (ويدجت الحجز يتداخل مع حافة البطل بـ`-mt-12`،
     فقفزةٌ هنا تهزّ نموذج الحجز نفسه).

   • **`prefers-reduced-motion` يُظهر فوراً ولا يحذف:** الفرع الساكن هو نفسه
     مخرَجُ الخادم — نصٌّ كامل بلا `clip-path` أصلاً. ولقطة الخادم في
     `usePrefersReducedMotion` هي `true`، فلا إطار حركةٍ واحد يسبق اكتشاف
     الرغبة.

   • **الاتجاه يُقرأ حيّاً لا يُفترض:** الموقع عربيٌّ `rtl` وإنجليزيُّه `ltr`
     تحت `/en`. و`inset()` **مادّيّة** (يمين/يسار) لا منطقية، فالجهة تُقرأ من
     `getComputedStyle` مرةً عند البدء — ولو حُفرت `rtl` لانكشف النصّ
     الإنجليزي من آخره.
   ============================================================================ */

/** مللي ثانية لكل حرف أثناء الكتابة */
const TYPE_MS: Record<TypingSpeedToken, number> = { slow: 130, normal: 80, fast: 45 };
/** ومحوٌ أسرع من الكتابة دائماً — الرجوع لا يُقرأ فلا يُنتظر */
const ERASE_MS: Record<TypingSpeedToken, number> = { slow: 70, normal: 40, fast: 22 };
/** مهلة ثبات الجملة المكتملة — وهي وحدها ما يُقرأ فعلاً */
const HOLD_MS: Record<TypingHoldToken, number> = { short: 1200, normal: 2400, long: 4000 };

/**
 * معامل ملاءمة حجم الخط: عرضُ الحرف العربي الوسطي ≈ ‏0.5em، فـ`100cqi / N × 1.6`
 * يترك ~٢٠٪ هامشاً. ولماذا `min(1em, …)` لا الحساب وحده: الجملة القصيرة تأخذ
 * حجم العنوان كاملاً، والطويلة وحدها تتقلّص — فلا يُصغَّر عنوانٌ بلا سبب.
 */
const FIT_FACTOR = 1.6;

/** `useLayoutEffect` على العميل وحده — القناع يجب أن يُطبَّق قبل أول رسمة */
const useIsoLayoutEffect = typeof window === "undefined" ? useEffect : useLayoutEffect;

export function HeroTyping({
  lines,
  speed = "normal",
  hold = "normal",
  erase = "normal",
  loop = false,
}: {
  /** جملةٌ واحدة على الأقل — والصفر يُفحص في الخادم فلا يُصيَّر هذا المكوّن أصلاً */
  lines: readonly string[];
  speed?: TypingSpeedToken;
  hold?: TypingHoldToken;
  erase?: TypingSpeedToken;
  loop?: boolean;
}) {
  const reduced = usePrefersReducedMotion();
  const [index, setIndex] = useState(0);

  const textRef = useRef<HTMLSpanElement>(null);
  const caretRef = useRef<HTMLSpanElement>(null);
  const dirRef = useRef<"rtl" | "ltr">("rtl");

  /** أطول جملة هي التي تحكم حجم الخط، فيثبت الارتفاع والعرض عبر الدورات كلها */
  const maxChars = Math.max(1, ...lines.map((line) => line.length));
  const line = lines[Math.min(index, lines.length - 1)] ?? "";

  useIsoLayoutEffect(() => {
    const text = textRef.current;
    const caret = caretRef.current;
    if (!text) return;

    /**
     * الفرع الساكن: **لا `clip-path` إطلاقاً** — لا `inset(0)` ولا قناعٌ
     * مفتوح. أي أن العنصر يعود إلى حالته الخادمية حرفاً، فمن قلب مفتاح تقليل
     * الحركة والصفحة مفتوحة يرى النصّ كاملاً في الإطار التالي.
     */
    if (reduced) {
      text.style.clipPath = "";
      if (caret) caret.style.opacity = "0";
      return;
    }

    dirRef.current = getComputedStyle(text).direction === "ltr" ? "ltr" : "rtl";

    const chars = Math.max(1, line.length);
    const typeStep = TYPE_MS[speed];
    const eraseStep = ERASE_MS[erase];
    const typeDur = chars * typeStep;
    const holdDur = HOLD_MS[hold];
    const eraseDur = chars * eraseStep;
    /** آخر جملةٍ بلا تكرار ⇒ تكتمل وتقف. وهو الافتراضي بقرار بدر. */
    const stopHere = index === lines.length - 1 && !loop;

    const paint = (ratio: number) => {
      const hidden = (1 - ratio) * 100;
      text.style.clipPath =
        dirRef.current === "rtl" ? `inset(0 0 0 ${hidden}%)` : `inset(0 ${hidden}% 0 0)`;
      if (caret) {
        // النسبة من **بداية السطر** فتصلح للاتجاهين معاً بلا فرع
        caret.style.insetInlineStart = `${ratio * 100}%`;
        caret.style.opacity = "1";
      }
    };

    // القناع مغلقٌ قبل أول رسمة — ولولا ذلك لومض النصّ كاملاً إطاراً ثم اختفى
    paint(0);

    let raf = 0;
    let started = 0;

    const frame = (now: number) => {
      if (started === 0) started = now;
      const t = now - started;

      if (t < typeDur) {
        paint(Math.floor(t / typeStep) / chars);
        raf = requestAnimationFrame(frame);
        return;
      }

      paint(1);

      if (stopHere) {
        // تقف مكتملةً، والمؤشّر يختفي فلا تبقى شرطةٌ معلّقة إلى الأبد
        if (caret) caret.style.opacity = "0";
        return;
      }

      if (t < typeDur + holdDur) {
        raf = requestAnimationFrame(frame);
        return;
      }

      const erased = t - typeDur - holdDur;
      if (erased < eraseDur) {
        paint(1 - Math.floor(erased / eraseStep) / chars);
        raf = requestAnimationFrame(frame);
        return;
      }

      // 🔒 تبديل النصّ يقع والقناع **مغلقٌ تماماً**: لا يرى أحد حرفاً يتبدّل
      paint(0);
      setIndex((current) => (current + 1) % lines.length);
    };

    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
    // `line` مشتقّة من `index` و`lines`، وذكرها يجعل التبعية صريحة لا ضمنية
  }, [index, line, lines, reduced, speed, hold, erase, loop]);

  return (
    /**
     * حاوية استعلامٍ بعرض العنوان — `100cqi` فيها هو عرض السطر المتاح، وهو ما
     * يُقاس عليه حجم الخط. و`container-type: inline-size` يجعل عرضها مستقلاً عن
     * محتواها، فسطرٌ `nowrap` أطول من المتوقّع لا يوسّع العنوان ولا يُخرج
     * الصفحة عن حدّها الأفقي.
     */
    <span className="@container block">
      <span
        className="relative inline-block whitespace-nowrap align-top"
        style={{ fontSize: `min(1em, calc(100cqi / ${maxChars} * ${FIT_FACTOR}))` }}
      >
        <span ref={textRef} className="block">
          {line}
        </span>
        {/*
          المؤشّر زخرفةٌ خالصة: يقول «تُكتب الآن» للعين وحدها، ويختفي حين يقف
          الأثر فلا تبقى شرطةٌ معلّقة إلى الأبد. ولونه **رمز** `--primary` —
          وهو عنبر التصميم نفسه — لا قيمةٌ مكتوبة (‏D-01/D-04).
        */}
        <span
          ref={caretRef}
          aria-hidden="true"
          className="pointer-events-none absolute inset-y-[0.14em] w-[2px] rounded-full bg-primary opacity-0"
        />
      </span>
    </span>
  );
}
