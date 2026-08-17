/**
 * طبقة الحركة — نقطة الدخول الوحيدة.
 *
 * كل ما تحتاجه عارضةُ قسمٍ يُستورد من هنا:
 *
 *     import { Reveal, CountUp, fx } from "@/components/motion";
 *
 * ── القسمة الحاكمة في هذا المجلد ──────────────────────────────────────────
 *
 * | الحالة | الأداة | لماذا |
 * |---|---|---|
 * | القيمة معلومة سلفاً (من ١٤px إلى صفر) | CSS | يديرها المُركِّب بلا خيطٍ رئيسي |
 * | القيمة تُحسب إطاراً بإطار (عدّاد · مسار) | `motion` | تكسب مكانها |
 * | إطلاقٌ عند دخول الشاشة | `IntersectionObserver` مشترك | مراقبٌ واحد لكل الصفحة |
 * | حدّ تمرير (فوق/تحت) | مستمع مشترك + rAF | بتٌّ لا قيمة على مدى |
 *
 * ولا `locomotive-scroll` ولا `barba-js`: كلتاهما تخطف التمرير والتوجيه
 * فتتصادم مع App Router (‏`DESIGN-INTEGRATION.md` §٧).
 * ولا `gsap/ScrollTrigger`: لا حركة في التصميم كله مربوطةٌ بموضع التمرير
 * (‏scrub) ولا تثبّت قسماً (‏pin) — والتقرير يفصّل القياس.
 */

export { DUR, EASE, EASE_BACK, DESIGN_ONLY, TIMING, HERO_VIDEO_MIN_WIDTH } from "./tokens";
export { fx, pointerGlowHostClass } from "./classes";

export { usePrefersReducedMotion, prefersReducedMotionNow } from "./use-reduced-motion";
export { useInViewOnce } from "./use-in-view";
export { useScrollPast } from "./use-scroll-past";

export { Reveal } from "./reveal";
export { CountUp } from "./count-up";
export { Marquee } from "./marquee";
export { HeroMedia, Sparks, PulseDot, kenBurnsClass, scrollCueClass } from "./hero-ambience";
export { HeroVideo, type HeroVideoSource } from "./hero-video";
export { FlowRoad, FlowRail } from "./flow-road";
/* ⚠ `pointerGlowHostClass` يُصدَّر من `./classes` أعلاه لا من هنا — والسبب مقيسٌ
   ومكتوبٌ هناك: قيمةٌ من وحدة `"use client"` تصل الخادمَ مرجعَ عميل لا نصّاً.
   وهذا البرميل نفسه **محيَّد ويجب أن يبقى كذلك**: `"use client"` في أعلاه يُسقط
   `fx` و`pointerGlowHostClass` و`DUR` وكلَّ ثابتٍ يمرّ عبره في اللحظة نفسها. */
export { PointerGlowGrid, PointerGlowLayer } from "./pointer-glow";
export { RailDots } from "./rail-dots";
export { SlideUpBar } from "./slide-up-bar";
