"use client";

import { useEffect, useState } from "react";

/* ============================================================
   «هل تجاوز التمرير هذا الحدّ؟»

   مستمع تمرير **واحد** لكل الصفحة، ومجدوِلٌ مربوط بإطار العرض — نفس بنية
   `main.js` في التصميم، وسببها أن مستمعي التمرير هم أول ما يقتل سلاسة
   الصفحة: كل واحدٍ منهم يستيقظ عشرات المرات في الثانية.

   وهنا ثلاث طبقات تقلّل الكلفة:
     ١) مستمع واحد مشترك مهما كثر المشتركون.
     ٢) `passive: true` — يقول للمتصفح إننا لن نمنع التمرير، فلا ينتظرنا.
     ٣) كل النداءات تُجمَّع في إطارٍ واحد عبر `requestAnimationFrame`.

   ⚠ **ولا `motion` هنا عن قصد.** `useScroll` تشترك في نفس الحدث نفسه ثم
   تبني حوله قيمة حركية — ونحن لا نحتاج قيمة متصلة بل **بتّاً**: فوق الحدّ أو
   تحته. والقاعدة في هذا المجلد: `motion` حين تكون القيمة محسوبة على مدى،
   لا حين تكون سؤالاً بنعم أو لا.
   ============================================================ */

type Job = () => void;

const jobs = new Set<Job>();
let attached = false;
let pending = false;

function run() {
  pending = false;
  for (const job of jobs) job();
}

function schedule() {
  if (pending) return;
  pending = true;
  requestAnimationFrame(run);
}

function subscribe(job: Job): () => void {
  jobs.add(job);
  if (!attached) {
    attached = true;
    window.addEventListener("scroll", schedule, { passive: true });
    window.addEventListener("resize", schedule, { passive: true });
  }
  return () => {
    jobs.delete(job);
  };
}

/**
 * @param threshold ارتفاع بالبكسل، أو دالةٌ تحسبه عند كل نداء (مفيدةٌ حين
 * يعتمد الحدّ على ارتفاع عنصرٍ يتغيّر — كارتفاع البطل).
 */
export function useScrollPast(threshold: number | (() => number)): boolean {
  const [past, setPast] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;

    const tick = () => {
      const limit =
        typeof threshold === "function" ? threshold() : threshold;
      setPast(window.scrollY > limit);
    };

    const off = subscribe(tick);
    tick(); // القراءة الأولى فوراً: الصفحة قد تُفتح على موضعٍ محفوظ
    return off;
  }, [threshold]);

  return past;
}
