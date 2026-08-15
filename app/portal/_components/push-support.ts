/**
 * كشف قدرة الجهاز على استقبال دفع الويب — دوالٌّ نقية يستعملها
 * `push-setup.tsx`، ولا تطلب إذناً ولا تسجّل عاملاً ولا تلمس الشبكة.
 *
 * ── 🔒 قيد آيفون، وهو قيد Apple لا قيدنا ───────────────────────────────────
 *
 * Safari على iOS/iPadOS يدعم دفع الويب منذ 16.4 **لموقعٍ مثبَّت على الشاشة
 * الرئيسية وحده**. وفي المتصفح العادي لا يوجد `PushManager` أصلاً — لا تصريح
 * يُطلب ولا خطأ يظهر.
 *
 * والقرار المكتوب في الموجز (١-ز): **يُكشف نظام الجهاز فتُعرض تعليماته وحده**.
 * لأن البديل — زرٌّ لا يفعل شيئاً — أسوأ من غيابه: المتعهد ينقره فلا يحدث شيء،
 * فيستنتج أن النظام معطوب ولا يعود. والقيد يُقال له صراحةً بخطواتٍ ينفّذها.
 *
 * ⚠ **وكل الكشف على العميل بعد التركيب، لا على الخادم.** استنتاجُ النظام من
 * ترويسة `User-Agent` في مكوّن خادمي يعني صفحةً تختلف باختلاف الجهاز — أي
 * كسرَ الكاش على كل مسارات البورتال، وخطرَ عدم تطابق الترطيب. فالحالة الأولى
 * دائماً `checking`، وتُحسم في `useEffect`.
 */

/** لماذا لا يستطيع هذا الجهاز؟ رمزٌ لا جملة — الشاشة تترجمه */
export type PushBlockCode =
  | "insecure" // ليس HTTPS (ولا localhost) — الـAPI غير موجود أصلاً
  | "ios-needs-install" // آيفون/آيباد بلا تثبيت على الشاشة الرئيسية
  | "ios-needs-update" // مثبَّت لكن النظام أقدم من 16.4
  | "unsupported"; // متصفح لا يدعم عامل خدمة أو دفعاً

export type PushCapability =
  | { ready: true; ios: boolean; standalone: boolean }
  | { ready: false; code: PushBlockCode; ios: boolean; standalone: boolean };

/**
 * هل نحن داخل تطبيقٍ مثبَّت (standalone)؟
 *
 * مصدران لأن أيّاً منهما وحده يكذب: `display-mode` هو المعيار وتدعمه Safari
 * الحديثة، و`navigator.standalone` خاصية Apple القديمة وما زالت أدقّ على بعض
 * الإصدارات. والقراءة داخل `try` لأن `matchMedia` قد تغيب في بيئات محدودة.
 */
export function isStandaloneDisplay(): boolean {
  try {
    if (window.matchMedia?.("(display-mode: standalone)").matches) return true;
  } catch {
    /* بيئة بلا matchMedia — نكمل بالمصدر الثاني */
  }
  const legacy = (window.navigator as Navigator & { standalone?: boolean }).standalone;
  return legacy === true;
}

/**
 * آيفون أو آيباد؟
 *
 * ⚠ وشرط `MacIntel + maxTouchPoints > 1` ليس زخرفة: آيباد منذ iPadOS 13 يعلن
 * نفسه ماكنتوش في `User-Agent` افتراضياً. وبدونه يُصنَّف آيبادٌ حاسوباً مكتبياً
 * فيُعرض له زرٌّ لا يعمل — وهو بالضبط ما تمنعه هذه الوحدة.
 */
export function isApplePlatform(): boolean {
  const nav = window.navigator;
  if (/iPad|iPhone|iPod/.test(nav.userAgent)) return true;
  return nav.platform === "MacIntel" && nav.maxTouchPoints > 1;
}

export function readPushCapability(): PushCapability {
  const ios = isApplePlatform();
  const standalone = isStandaloneDisplay();

  // HTTPS شرطٌ في المعيار نفسه (localhost مستثنى وله `isSecureContext = true`)
  if (!window.isSecureContext) return { ready: false, code: "insecure", ios, standalone };

  const hasStack =
    "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;

  if (!hasStack) {
    // على أجهزة Apple التمييز ممكنٌ ونافع: التثبيت خطوةٌ ينفّذها، والتحديث خطوة أخرى
    if (ios) {
      return { ready: false, code: standalone ? "ios-needs-update" : "ios-needs-install", ios, standalone };
    }
    return { ready: false, code: "unsupported", ios, standalone };
  }

  // الحزمة موجودة لكن التطبيق غير مثبَّت على آيفون: بعض الإصدارات تُظهر
  // `PushManager` ثم يفشل `subscribe` — فالمنع هنا أوضح من فشلٍ بعد نقرة
  if (ios && !standalone) {
    return { ready: false, code: "ios-needs-install", ios, standalone };
  }

  return { ready: true, ios, standalone };
}

/**
 * فكّ base64url إلى بايتات.
 *
 * `applicationServerKey` يقبل نصّاً في المتصفحات الحديثة **ولا يقبله** في
 * إصدارات ما زالت في أيدي الناس. والبايتات تعمل في الحالتين، فلا سبب للمخاطرة.
 */
export function urlBase64ToUint8Array(base64: string): Uint8Array {
  const padding = "=".repeat((4 - (base64.length % 4)) % 4);
  const normalized = (base64 + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = window.atob(normalized);
  const output = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i += 1) output[i] = raw.charCodeAt(i);
  return output;
}

/**
 * وصفٌ قصير للجهاز — «Chrome · أندرويد».
 *
 * ⚠ **ولماذا لا نرسل `User-Agent` كاملاً؟** لأن العمود يُعرض في قائمة الأجهزة
 * ويُخزَّن إلى الأبد، ونصُّ الوكيل الكامل بصمةٌ طويلة لا يقرؤها أحد ولا يميّز
 * بها المتعهد هاتفه من حاسوبه. والغرض تمييزٌ لا تعريف.
 */
export function describeDevice(): string {
  const ua = window.navigator.userAgent;

  const browser =
    /Edg\//.test(ua) ? "Edge"
    : /OPR\/|Opera/.test(ua) ? "Opera"
    : /Firefox\//.test(ua) ? "Firefox"
    : /SamsungBrowser\//.test(ua) ? "Samsung Internet"
    : /Chrome\//.test(ua) ? "Chrome"
    : /Safari\//.test(ua) ? "Safari"
    : "متصفح";

  const platform =
    /Android/.test(ua) ? "أندرويد"
    : /iPhone/.test(ua) ? "آيفون"
    : /iPad/.test(ua) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1) ? "آيباد"
    : /Windows/.test(ua) ? "ويندوز"
    : /Mac OS X/.test(ua) ? "ماك"
    : /Linux/.test(ua) ? "لينكس"
    : "جهاز";

  return `${browser} · ${platform}`;
}
