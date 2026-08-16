"use client";

import {
  useEffect,
  useMemo,
  useRef,
  type CSSProperties,
  type ReactNode,
} from "react";
import { cn } from "@/lib/utils";
import { DESIGN_ONLY, TIMING } from "./tokens";
import { usePrefersReducedMotion } from "./use-reduced-motion";
import { useInViewOnce } from "./use-in-view";
import styles from "./motion.module.css";

/* ============================================================
   «كيف نعمل» — الخط يُرسم والسيارة تسير عليه

   الرسم كله زخرفة (`aria-hidden`): المحتوى كامل في قائمة الخطوات تحته ويُقرأ
   بلا حرفٍ من هذا الملف.

   ── ما نُقل حرفياً وما استُبدل ──────────────────────────────────────────────

   نُقل: شكل الموجة، ومدّة الرحلة (٣٦٠٠ms)، ومنحنى القيادة المستقل، ومشاركة
   الخط والسيارة نفس المدة والمنحنى — فتبقى السيارة عند رأس الخط المرسوم طوال
   الرحلة **بلا أي مزامنة بالجافاسكربت**. ونُقلت إضاءة كل محطة لحظة مرور
   السيارة بها فعلاً عبر `--at`.

   🔴 **واستُبدلت آلية القياس، والاستبدال هو المكسب الأكبر هنا.** الأصل يقيس
   مراكز شارات الخطوات من الـDOM في كل تغيّر عرض، ثم يعيد بناء الموجة بالبكسل،
   ثم يعيد كتابة `viewBox` — كل ذلك لأن الشارات **قد** تقع في أي مكان. وعندنا
   لا تقع في أي مكان: أعمدة الخطوات متساوية بالبناء (`repeat(n, 1fr)` بلا
   فجوة)، فمركز العمود k هو `(k + ½)/n` من العرض حسابياً لا قياساً.

   والنتيجة ثلاثة مكاسب لا واحد:
     ١) **المسار صحيح على الخادم**: الـSVG يخرج مرسوماً كاملاً في HTML بنظام
        إحداثيات منسّق (`viewBox 0 0 1200 120` + `preserveAspectRatio="none"`)،
        فمن لا جافاسكربت عنده يرى القسم كما صُمّم لا هيكلاً فارغاً.
     ٢) **صفر اعتماد على DOM عارضةٍ أخرى**: لا `querySelector` على `.step__dot`
        يملكه وكيلٌ آخر وينكسر يوم يعيد تسمية صنف.
     ٣) **لا إعادة كتابة `viewBox`**: نظاما الإحداثيات (المنسّق للرسم، والبكسل
        لمسار السيارة) متطابقان بالبناء، فلا شيء يُزامَن.

   وما بقي للجافاسكربت شيئان فقط: مسار السيارة بالبكسل (لأن `offset-path`
   يقرأ بكسلات لا نِسَباً — وهذا سبب وجود الجافاسكربت أصلاً)، وإطلاق الرحلة
   عند دخول القسم الشاشة.
   ============================================================ */

/** نظام الإحداثيات المنسّق — نفس أرقام التصميم. */
const VB_W = 1200;
const VB_H = 120;
/** خط المحطات (y=100) وقمة الموجة (y=26) داخل الـviewBox. */
const LOW = 100;
const HIGH = 26;

/** مراكز الأعمدة كنِسَب من العرض، بترتيب القراءة. */
function columnCentres(steps: number, rtl: boolean): number[] {
  const out: number[] = [];
  for (let i = 0; i < steps; i++) {
    const f = (i + 0.5) / steps;
    out.push(rtl ? 1 - f : f);
  }
  return out;
}

/**
 * منحنى الموجة بين كل نقطتين — منقول من `main.js/wavePath` بأرقامه:
 * القمة عند منتصف المسافة بالضبط، وهي موضع نقطة التوقف الوسيطة.
 */
function wavePath(
  xs: number[],
  lo: number,
  hi: number,
  ox = 0,
  oy = 0
): string {
  const n = (v: number) => Math.round(v * 10) / 10;
  const L = n(lo - oy);
  const H = n(hi - oy);
  let d = `M${n(xs[0] - ox)},${L}`;
  for (let i = 0; i < xs.length - 1; i++) {
    const x = xs[i] - ox;
    const g = xs[i + 1] - xs[i];
    d +=
      `C${n(x + 0.2 * g)},${L} ${n(x + 0.2333 * g)},${H} ${n(x + 0.5 * g)},${H}` +
      `C${n(x + 0.7667 * g)},${H} ${n(x + 0.8 * g)},${L} ${n(x + g)},${L}`;
  }
  return d;
}

/* ---- عكس منحنى القيادة: عند أي **زمن** تصل السيارة إلى مسافةٍ ما؟ ----
   `--at` في التصميم مكتوبة يدوياً (0 · .278 · .398 · .5 · .602 · .722 · 1)
   وتصحّ لأربع خطوات وحدها. هنا تُحسب لأي عدد — والدالة تعيد أرقام التصميم
   نفسها بالضبط حين يكون العدد أربعة. */
const [BX1, BY1, BX2, BY2] = DESIGN_ONLY.easeDrive;

function bezier(t: number, a: number, b: number): number {
  const u = 1 - t;
  return 3 * u * u * t * a + 3 * u * t * t * b + t * t * t;
}

function easeAt(p: number): number {
  let lo = 0;
  let hi = 1;
  let t = p;
  for (let i = 0; i < 24; i++) {
    t = (lo + hi) / 2;
    if (bezier(t, BX1, BX2) < p) lo = t;
    else hi = t;
  }
  return bezier((lo + hi) / 2, BY1, BY2);
}

/** الزمن الذي تبلغ عنده الحركةُ المسافةَ `d` — بالتنصيف على منحنىً رتيب. */
function timeAtDistance(d: number): number {
  if (d <= 0) return 0;
  if (d >= 1) return 1;
  let lo = 0;
  let hi = 1;
  for (let i = 0; i < 24; i++) {
    const p = (lo + hi) / 2;
    if (easeAt(p) < d) lo = p;
    else hi = p;
  }
  return Math.round(((lo + hi) / 2) * 1000) / 1000;
}

/** هل يدعم المتصفح `offset-path` فعلاً؟ اختبارٌ حيّ لا استنتاج من الوكيل. */
function supportsOffsetPath(): boolean {
  if (typeof window === "undefined") return false;
  if (window.CSS?.supports) {
    return window.CSS.supports("offset-path", 'path("M0,0 L1,1")');
  }
  return false;
}

type CommonProps = {
  /** أيقونة السيارة — يمرّرها القسم فلا يعرف هذا الملف أي أيقونة بعينها. */
  icon: ReactNode;
  className?: string;
};

/* ══════════════════════════════════════════════════════════════
   الديسكتوب: موجة أفقية فوق الخطوات
   ══════════════════════════════════════════════════════════════ */

export function FlowRoad({
  steps,
  icon,
  dir = "rtl",
  className,
  markClassName,
  midClassName,
  carClassName,
}: CommonProps & {
  /** عدد الخطوات — هو نفسه عدد أعمدة الشبكة تحته. */
  steps: number;
  /**
   * اتجاه الصفحة. يخصّ **الرسم على الخادم** وحده (نقطة بدء الخط)، والعميل
   * يقرأ الاتجاه الحقيقي بنفسه لمسار السيارة. والشكل مرآةُ نفسه فلا يتبدّل
   * المرئي لو أخطأت القيمة — يتبدّل من أي طرفٍ يبدأ الرسم.
   */
  dir?: "rtl" | "ltr";
  markClassName?: string;
  midClassName?: string;
  carClassName?: string;
}) {
  const reduced = usePrefersReducedMotion();
  const [viewRef, inView] = useInViewOnce<HTMLDivElement>({ threshold: 0.18 });
  const roadRef = useRef<HTMLDivElement>(null);
  const carRef = useRef<HTMLSpanElement>(null);

  /*
    كما في <Reveal>: لا نعلّق السمة على «تقليل الحركة».  `usePrefersReducedMotion`
    ترجع `true` على الخادم، فتعليقُها عليه يُخرج `data-drawn` في HTML ثم يسحبها
    الترطيب — فيُرسم الخط كاملاً ثم ينمحي ثم يُعاد رسمه. وقواعد الرسم كلها داخل
    `(prefers-reduced-motion: no-preference)` أصلاً، فمن طلب تقليل الحركة يرى
    الخط كاملاً والسيارة راسية بلا أي سمة.
  */
  const drawn = inView;
  const n = Math.max(2, steps);

  /** المسار المنسّق — يُحسب مرّةً ويخرج مع HTML الخادمي. */
  const staticPath = useMemo(() => {
    const xs = columnCentres(n, dir === "rtl").map((f) => f * VB_W);
    return wavePath(xs, LOW, HIGH);
  }, [n, dir]);

  /** أزمنة إضاءة المحطات والنقاط الوسيطة. */
  const stops = useMemo(() => {
    const marks = Array.from({ length: n }, (_, i) => ({
      at: timeAtDistance(i / (n - 1)),
      pos: (i + 0.5) / n,
    }));
    const mids = Array.from({ length: n - 1 }, (_, i) => ({
      at: timeAtDistance((2 * i + 1) / (2 * (n - 1))),
      pos: (i + 1) / n,
    }));
    return { marks, mids };
  }, [n]);

  /* ---- مسار السيارة بالبكسل ---- */
  useEffect(() => {
    if (reduced) return;
    const road = roadRef.current;
    const car = carRef.current;
    if (!road || !car) return;
    if (!supportsOffsetPath()) return;

    /*
      `is-live` تُكتب على الـDOM مباشرة لا عبر حالة React: هذه قدرةُ متصفحٍ
      تُقاس مرّة ولا تتبدّل، فتحويلها إلى حالة يعني دورة تصيير كاملة للصفحة
      مقابل صنفٍ واحد — وهو أيضاً ما يمنعه `react-hooks/set-state-in-effect`.
      والصنف على `road` لا على الجذر لأنه يجب أن يكون **جدّ** السيارة.
    */
    road.classList.add(styles.flowLive);

    const paint = () => {
      const rect = road.getBoundingClientRect();
      if (rect.width < 2 || rect.height < 2) return;

      const rtl = getComputedStyle(road).direction === "rtl";
      const xs = columnCentres(n, rtl).map((f) => f * rect.width);
      const lo = (rect.height * LOW) / VB_H;
      const hi = (rect.height * HIGH) / VB_H;

      /*
        أصل إحداثيات `offset-path` هو موضع العنصر التخطيطي نفسه، لا زاوية
        الحاوية — ولهذا تُطرح `offsetLeft/offsetTop`. و`offsetLeft` قياسٌ
        تخطيطي لا يتأثر بالـ`transform` ولا بالمسار المطبَّق، فقراءته أثناء
        الحركة آمنة.
      */
      const ox = car.offsetParent === road ? car.offsetLeft : 0;
      const oy = car.offsetParent === road ? car.offsetTop : 0;
      car.style.offsetPath = `path("${wavePath(xs, lo, hi, ox, oy)}")`;
    };

    let pending = false;
    const schedule = () => {
      if (pending) return;
      pending = true;
      requestAnimationFrame(() => {
        pending = false;
        paint();
      });
    };

    paint();

    // ارتفاع الشريط وعرضه يتغيّران مع العرض والخطوط معاً.
    const ro = new ResizeObserver(schedule);
    ro.observe(road);
    if (document.fonts?.ready) document.fonts.ready.then(schedule, () => {});

    return () => {
      ro.disconnect();
      road.classList.remove(styles.flowLive);
    };
  }, [reduced, n]);

  return (
    <div
      ref={viewRef}
      className={className}
      aria-hidden="true"
      style={
        {
          "--flow-drive": `${TIMING.driveMs}ms`,
          "--flow-ease": `cubic-bezier(${DESIGN_ONLY.easeDrive.join(",")})`,
          position: "relative",
        } as CSSProperties
      }
    >
      <div ref={roadRef} style={{ position: "relative", blockSize: "100%" }}>
        <svg
          viewBox={`0 0 ${VB_W} ${VB_H}`}
          preserveAspectRatio="none"
          role="presentation"
          focusable="false"
          style={{
            position: "absolute",
            inset: 0,
            inlineSize: "100%",
            blockSize: "100%",
            overflow: "visible",
          }}
        >
          {/* الخط الباهت: المسار كاملاً، حاضرٌ دائماً */}
          <path
            className={styles.flowTrack}
            d={staticPath}
            vectorEffect="non-scaling-stroke"
          />
          {/* الخط الظاهر: يُرسم من طرفه. `pathLength=1` يجعل الـdash نسبةً
              لا طولاً، فلا يحتاج قياساً بالجافاسكربت. */}
          <path
            className={cn(styles.flowDraw, styles.flowDrawArmed)}
            d={staticPath}
            pathLength={1}
            vectorEffect="non-scaling-stroke"
            {...(drawn ? { "data-drawn": "" } : null)}
          />
        </svg>

        {stops.marks.map((m, i) => (
          <span
            key={`mark-${i}`}
            className={cn(styles.flowMark, styles.flowStop, markClassName)}
            style={
              {
                "--x": `${m.pos * 100}%`,
                "--y": `${(LOW / VB_H) * 100}%`,
                "--at": m.at,
              } as CSSProperties
            }
            {...(drawn ? { "data-drawn": "" } : null)}
          />
        ))}

        {stops.mids.map((m, i) => (
          <span
            key={`mid-${i}`}
            className={cn(styles.flowMid, styles.flowStop, midClassName)}
            style={
              {
                "--x": `${m.pos * 100}%`,
                "--y": `${(HIGH / VB_H) * 100}%`,
                "--at": m.at,
              } as CSSProperties
            }
            {...(drawn ? { "data-drawn": "" } : null)}
          />
        ))}

        {/* موقف السيارة بلا جافاسكربت: مركز عمود الخطوة الأخيرة على خط المحطات.
            هذه هي الحالة الصحيحة أيضاً عند تقليل الحركة وعند غياب `offset-path`. */}
        <span
          ref={carRef}
          className={cn(
            styles.flowCar,
            styles.flowCarHorizontal,
            styles.flowCarArmed,
            carClassName
          )}
          style={
            {
              "--x": `${((n - 0.5) / n) * 100}%`,
              "--y": `${(LOW / VB_H) * 100}%`,
            } as CSSProperties
          }
          {...(drawn ? { "data-drawn": "" } : null)}
        >
          {icon}
        </span>
      </div>
    </div>
  );
}

/* ══════════════════════════════════════════════════════════════
   الجوال: خطٌّ رأسي على محور الشارات
   يُوضع مطلقاً داخل حاويةٍ نسبية يملكها القسم — ويقيس ارتفاع **نفسه** لا
   ارتفاع أي عنصرٍ في شجرة غيره.
   ══════════════════════════════════════════════════════════════ */

export function FlowRail({ icon, className, carClassName }: CommonProps & {
  carClassName?: string;
}) {
  const reduced = usePrefersReducedMotion();
  const [viewRef, inView] = useInViewOnce<HTMLDivElement>({ threshold: 0.15 });
  const boxRef = useRef<HTMLDivElement>(null);
  const carRef = useRef<HTMLSpanElement>(null);

  /*
    كما في <Reveal>: لا نعلّق السمة على «تقليل الحركة».  `usePrefersReducedMotion`
    ترجع `true` على الخادم، فتعليقُها عليه يُخرج `data-drawn` في HTML ثم يسحبها
    الترطيب — فيُرسم الخط كاملاً ثم ينمحي ثم يُعاد رسمه. وقواعد الرسم كلها داخل
    `(prefers-reduced-motion: no-preference)` أصلاً، فمن طلب تقليل الحركة يرى
    الخط كاملاً والسيارة راسية بلا أي سمة.
  */
  const drawn = inView;

  useEffect(() => {
    if (reduced) return;
    const box = boxRef.current;
    const car = carRef.current;
    if (!box || !car || !supportsOffsetPath()) return;

    box.classList.add(styles.flowLive);

    const paint = () => {
      const rect = box.getBoundingClientRect();
      if (rect.height < 60) return;
      const ox = car.offsetParent === box ? car.offsetLeft : 0;
      const oy = car.offsetParent === box ? car.offsetTop : 0;
      const x = rect.width / 2 - ox;
      car.style.offsetPath = `path("M${x.toFixed(1)},${(-oy).toFixed(1)} L${x.toFixed(1)},${(rect.height - oy).toFixed(1)}")`;
    };

    let pending = false;
    const schedule = () => {
      if (pending) return;
      pending = true;
      requestAnimationFrame(() => {
        pending = false;
        paint();
      });
    };

    paint();
    // ارتفاع الخطوات يتغيّر مع التفاف النص، والمسار الرأسي مبنيّ عليه.
    const ro = new ResizeObserver(schedule);
    ro.observe(box);

    return () => {
      ro.disconnect();
      box.classList.remove(styles.flowLive);
    };
  }, [reduced]);

  return (
    <div
      ref={viewRef}
      className={className}
      aria-hidden="true"
      style={
        {
          "--flow-drive": `${TIMING.driveMs}ms`,
          "--flow-ease": `cubic-bezier(${DESIGN_ONLY.easeDrive.join(",")})`,
        } as CSSProperties
      }
    >
      <div ref={boxRef} style={{ position: "relative", blockSize: "100%" }}>
        <svg
          viewBox="0 0 44 1000"
          preserveAspectRatio="none"
          role="presentation"
          focusable="false"
          style={{
            position: "absolute",
            inset: 0,
            inlineSize: "100%",
            blockSize: "100%",
            overflow: "visible",
          }}
        >
          <path
            className={styles.flowTrack}
            d="M22 0V1000"
            vectorEffect="non-scaling-stroke"
          />
          <path
            className={cn(styles.flowDraw, styles.flowDrawArmed)}
            d="M22 0V1000"
            pathLength={1}
            vectorEffect="non-scaling-stroke"
            {...(drawn ? { "data-drawn": "" } : null)}
          />
        </svg>

        <span
          ref={carRef}
          className={cn(styles.flowCar, styles.flowCarArmed, carClassName)}
          style={{ "--x": "50%", "--y": "100%" } as CSSProperties}
          {...(drawn ? { "data-drawn": "" } : null)}
        >
          {icon}
        </span>
      </div>
    </div>
  );
}
