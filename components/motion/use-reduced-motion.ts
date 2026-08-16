"use client";

import { useSyncExternalStore } from "react";

/**
 * هل يطلب المستخدم تقليل الحركة؟
 *
 * 🔴 **الافتراض هو «نعم».** لقطة الخادم ترجع `true` دائماً، فأول تصيير على
 * الإطلاق — وأي بيئة بلا `matchMedia` — تقع في الفرع الساكن. ثم يصحّحها
 * المتصفح بعد الترطيب إن كان الجواب `no-preference` صراحةً.
 *
 * ولهذا ثمرتان لا واحدة:
 *  ١) من طلب تقليل الحركة **لا يرى إطاراً واحداً** من الحركة قبل أن تُكتشف
 *     رغبته — وهو بالضبط ما يفشل فيه النمط الشائع `useState(false)` ثم
 *     `useEffect`.
 *  ٢) HTML الخادمي يخرج في حالته النهائية الساكنة، فما يصل الزاحف صفحةٌ كاملة
 *     لا هيكلٌ ينتظر جافاسكربت.
 *
 * ويستمع للتغيّر حياً: من قلب المفتاح في نظام التشغيل والصفحة مفتوحة تتوقف
 * الحركة عنده فوراً بلا إعادة تحميل.
 */

const QUERY = "(prefers-reduced-motion: reduce)";

function subscribe(onChange: () => void): () => void {
  if (typeof window === "undefined" || !window.matchMedia) return () => {};
  const mq = window.matchMedia(QUERY);
  mq.addEventListener("change", onChange);
  return () => mq.removeEventListener("change", onChange);
}

function getSnapshot(): boolean {
  // بلا `matchMedia` نبقى على الفرع الآمن: ساكن.
  if (typeof window === "undefined" || !window.matchMedia) return true;
  return window.matchMedia(QUERY).matches;
}

function getServerSnapshot(): boolean {
  return true;
}

export function usePrefersReducedMotion(): boolean {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}

/**
 * مساعدٌ خارج React لنفس السؤال — تحتاجه الحلقات التي تعمل داخل `useEffect`
 * قبل أن يعيد React التصيير (العدّاد ومحرّك المسار).
 */
export function prefersReducedMotionNow(): boolean {
  return getSnapshot();
}
