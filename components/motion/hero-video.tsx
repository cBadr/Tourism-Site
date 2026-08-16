"use client";

import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import { HERO_VIDEO_MIN_WIDTH } from "./tokens";
import styles from "./motion.module.css";

/* ============================================================
   خلفية فيديو للبطل — أربعة شروط قبل أن يُحمَّل بايت واحد

   القرار مكتوب في `DESIGN-INTEGRATION.md` §٥ و`DESIGN-DECISIONS.md` بند ٧:
   الفيديو يبقى («عمل فارقاً كبيراً» — بدر)، وخسارته تُتفادى تقنياً لا بحذفه.

   🔴 **والعنصر لا يُصيَّر على الخادم إطلاقاً.** لا `<video>` في HTML، ولا
   `preload`، ولا مصدر — فالمتصفح لا يملك ما يطلبه أصلاً حتى يقرّر العميل.
   وهذا هو الفرق بين «صفر بايت على الجوال» وبين «طلبٌ يُلغى بعد أن بدأ».

   الشروط الأربعة، وكلها تُقاس عند العميل:
     ١) عرض الشاشة ≥ ٩٠٠ — لا معنى لتحميل ~١٫٨م.ب على شبكة موبايل.
     ٢) `prefers-reduced-motion` غير مطلوب — خلفيةٌ متحركة أعنف ما في الصفحة.
     ٣) لا `saveData` ولا `prefers-reduced-data` ولا شبكة `2g`.
     ٤) الصورة (poster) تحته دائماً فلا وميض ولا فراغ أثناء التحميل.

   ولا يُكشف قبل `readyState ≥ 2`: أي لا نُظهره قبل توفّر إطارٍ حقيقي، وإلا
   ظهر مستطيلٌ أسود مكان الصورة لثانية.

   ⏳ **وشرطٌ خامس زمني لا شرطي (م‑٣):** حتى بعد أن تُستوفى الأربعة، لا يبدأ
   الطلب قبل حدث `load` ثم أول فترة خمول. السبب مقيس لا مذهبي: الفيديو ١٫٨١
   م.ب على نفس الاتصال الذي يحمّل صورة البطل (‏LCP) وحزمة ويدجت الحجز — وبدء
   الثلاثة معاً يؤخّر الرسم الأكبر بلا أن يعجّل الفيديو. «الفيديو يبقى،
   وكلفته لا تبقى» تعني هذا بالضبط: يُدفع ثمنه **بعد** أن تكتمل الصفحة.
   ============================================================ */

/** فترة الخمول قد لا تأتي أبداً في تبويب مشغول — سقفٌ زمني يضمن البدء. */
const IDLE_TIMEOUT_MS = 2500;

export type HeroVideoSource = {
  src: string;
  /** مثل `video/webm; codecs=av01.0.05M.08` — ترتيب المصادر هو ترتيب الأفضلية. */
  type: string;
};

export function HeroVideo({
  sources,
  poster,
  className,
  minWidth = HERO_VIDEO_MIN_WIDTH,
}: {
  sources: HeroVideoSource[];
  /** صورة الغلاف — نفس صورة البطل عادةً، فلا تُحمَّل صورة ثانية. */
  poster?: string;
  className?: string;
  minWidth?: number;
}) {
  const [allowed, setAllowed] = useState(false);
  const [idle, setIdle] = useState(false);
  const [failed, setFailed] = useState(false);
  const [playing, setPlaying] = useState(false);
  const ref = useRef<HTMLVideoElement>(null);

  /* ---- القرار: هل نحمّل أصلاً؟ ---- */
  useEffect(() => {
    if (typeof window === "undefined" || !window.matchMedia) return;

    const wide = window.matchMedia(`(min-width: ${minWidth}px)`);
    const calm = window.matchMedia("(prefers-reduced-motion: reduce)");
    /**
     * النظير المعياري لـ`saveData`. المتصفح الذي لا يعرف الاستعلام يرجع
     * `matches:false` — فالإضافة تكسب متصفحاً ولا تكسر آخر.
     */
    const frugal = window.matchMedia("(prefers-reduced-data: reduce)");

    type Conn = {
      saveData?: boolean;
      effectiveType?: string;
      addEventListener?: (t: string, l: () => void) => void;
      removeEventListener?: (t: string, l: () => void) => void;
    };
    const nav = navigator as Navigator & {
      connection?: Conn;
      mozConnection?: Conn;
      webkitConnection?: Conn;
    };
    const conn = nav.connection ?? nav.mozConnection ?? nav.webkitConnection;

    const decide = () => {
      // ⚠ تُقرأ **عند كل قرار** لا مرة واحدة: مفتاح توفير البيانات يُقلَب
      // والصفحة مفتوحة، والانتقال من واي-فاي إلى شبكة الجوال يغيّر `2g`.
      const thrifty = Boolean(
        conn && (conn.saveData || /2g/.test(conn.effectiveType ?? "")),
      );
      setAllowed(
        wide.matches && !calm.matches && !frugal.matches && !thrifty,
      );
    };

    decide();
    // العرض يتغيّر بتدوير الجهاز، ومفتاح تقليل الحركة يتغيّر والصفحة مفتوحة.
    wide.addEventListener("change", decide);
    calm.addEventListener("change", decide);
    frugal.addEventListener("change", decide);
    conn?.addEventListener?.("change", decide);
    return () => {
      wide.removeEventListener("change", decide);
      calm.removeEventListener("change", decide);
      frugal.removeEventListener("change", decide);
      conn?.removeEventListener?.("change", decide);
    };
  }, [minWidth]);

  /* ---- التأجيل: لا طلب قبل اكتمال الصفحة ثم أول خمول ---- */
  useEffect(() => {
    if (typeof window === "undefined") return;

    let idleId: number | undefined;
    let timerId: number | undefined;

    const schedule = () => {
      const ric = (
        window as Window & {
          requestIdleCallback?: (cb: () => void, o?: { timeout: number }) => number;
        }
      ).requestIdleCallback;
      if (ric) idleId = ric(() => setIdle(true), { timeout: IDLE_TIMEOUT_MS });
      // سفاري لا يعرف `requestIdleCallback` — مؤقّتٌ صريح بدل حرمانه الفيديو.
      else timerId = window.setTimeout(() => setIdle(true), 300);
    };

    if (document.readyState === "complete") schedule();
    else window.addEventListener("load", schedule, { once: true });

    return () => {
      window.removeEventListener("load", schedule);
      if (timerId !== undefined) window.clearTimeout(timerId);
      const cic = (
        window as Window & { cancelIdleCallback?: (id: number) => void }
      ).cancelIdleCallback;
      if (idleId !== undefined) cic?.(idleId);
    };
  }, []);

  /* ---- بعد التركيب: نحاول التشغيل ولا نكشف قبل إطارٍ صالح ---- */
  useEffect(() => {
    const v = ref.current;
    if (!v || !allowed || !idle || failed) return;

    const attempt = () => {
      // الرفض قبل اكتمال التحميل طبيعي — ننتظر حدثاً لاحقاً بدل حذف العنصر.
      v.play()?.catch(() => {});
    };
    const check = () => {
      attempt();
      if (v.readyState >= 2) setPlaying(true);
    };

    const events = [
      "loadeddata",
      "canplay",
      "canplaythrough",
      "playing",
      "timeupdate",
    ] as const;
    for (const ev of events) v.addEventListener(ev, check);

    // فشل التحميل يزيل العنصر بصمت: الصورة تحته كاملة، فلا شيء يُفقد.
    const onError = () => setFailed(true);
    v.addEventListener("error", onError);

    v.load();
    attempt();

    return () => {
      for (const ev of events) v.removeEventListener(ev, check);
      v.removeEventListener("error", onError);
    };
  }, [allowed, idle, failed]);

  if (!allowed || !idle || failed || sources.length === 0) return null;

  return (
    <video
      ref={ref}
      className={cn(styles.heroVideo, className)}
      poster={poster}
      muted
      loop
      autoPlay
      playsInline
      // `none` وليس `auto`: القرار اتُّخذ بالفعل، والتحميل يبدأ بـ`load()`
      // أعلاه بعد ربط المستمعين — لا قبلهم، وإلا فاتنا أول حدث.
      preload="none"
      // خلفيةٌ زخرفية لا محتوى: لا صورة-في-صورة ولا بثّ إلى تلفاز.
      disablePictureInPicture
      disableRemotePlayback
      aria-hidden="true"
      tabIndex={-1}
      {...(playing ? { "data-playing": "" } : null)}
    >
      {sources.map((s) => (
        <source key={s.src} src={s.src} type={s.type} />
      ))}
    </video>
  );
}
