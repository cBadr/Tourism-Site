/* eslint-disable */
/**
 * عامل الخدمة — القناة ج٢ (دفع الويب) من
 * `docs/phase-briefs/FAILED-TRIPS-AND-PARTNER-ALERTS.md`.
 *
 * ⚠ **هذا الملف يعيش في متصفح المتعهد، لا على خادمنا.** النسخة المسجَّلة عنده
 * قد تبقى أسابيع: المتصفح لا يفحص التحديث إلا حين يفتح البورتال (أو كل ٢٤ ساعة
 * على الأكثر). فكل تغيير هنا يجب أن يبقى **متوافقاً مع حمولةٍ قديمة ومع حمولةٍ
 * جديدة معاً** — والعقد المشترك مكتوبٌ في `lib/push/types.ts` (`PushPayload`)،
 * والحقول **تُضاف ولا تُزاح**.
 *
 * ── 🔒 لا `fetch` هنا. بقصد. ────────────────────────────────────────────────
 *
 * لا مُعالِج `fetch` ولا تخزينَ مؤقتاً ولا وضعَ «عمل بلا اتصال». والسبب أن
 * الموقع مصيَّرٌ على الخادم بالكامل ويقرأ أسعاراً وعروضاً حيّة: عاملٌ يخزّن
 * الصفحات مؤقتاً يعني متعهداً يرى عرضاً انتهت مهلته، أو سعراً قديماً على شاشة
 * التسعير. وأسوأ من ذلك أنه يعطب **كل** الموقع لا ميزةً واحدة، ولا يُشفى
 * بتحديث الصفحة. فالعامل هنا مهمّته واحدة: **يستقبل الدفع ويعرض البطاقة**.
 *
 * ── وما يفعله بالضبط ────────────────────────────────────────────────────────
 *   push                    ← يعرض البطاقة (وإظهارها **إلزامي**، انظر أدناه)
 *   notificationclick       ← يفتح البورتال أو يركّز نافذةً مفتوحة
 *   pushsubscriptionchange  ← يجدّد الاشتراك حين تُبطله الخدمة، وإلا مات صامتاً
 */

/** إصدار العامل — يُرفع عند كل تغيير جوهري ليسهل تمييزه في أدوات المطوّر */
const SW_VERSION = "push-1";

/** وجهة النقر الافتراضية — البورتال هو المكان الذي يتصرّف فيه المتعهد */
const DEFAULT_URL = "/portal/requests";

/**
 * نصّان يظهران حين لا تصل حمولة.
 * ⚠ بلا اسم علامة ولا رقم تواصل (اتفاقية ٣: صفر نصوص علامة في الكود) — ولا
 * سبيل هنا إلى قراءة الإعدادات أصلاً، فالعامل يعمل والصفحة مغلقة.
 */
const FALLBACK_TITLE = "لديك تنبيه جديد";
const FALLBACK_BODY = "افتح بوابة المتعهدين لمتابعته.";

self.addEventListener("install", () => {
  // لا انتظار: عاملٌ جديد يحلّ محل القديم فوراً. لا كاش يُبطَل ولا حالة تُفقد
  // (انظر «لا fetch هنا» أعلاه)، فالانتظار كلفةٌ بلا مقابل.
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

/**
 * وجهة النقر: **مسارٌ نسبي وحده**.
 *
 * طبقةُ تحققٍ ثانية بعد `safeUrl` في `lib/push/payload.ts`، ولها سببٌ مستقل:
 * هذه النسخة تعمل في متصفحٍ لا نحدّثه متى شئنا. فلو سُرِّبت حمولةٌ يوماً بعنوان
 * مطلق، لقادت البطاقةُ — وعليها اسم علامتنا وأيقونتها — إلى موقعٍ آخر.
 */
function safePath(value) {
  if (typeof value !== "string") return DEFAULT_URL;
  const trimmed = value.trim();
  if (!trimmed.startsWith("/") || trimmed.startsWith("//")) return DEFAULT_URL;
  return trimmed;
}

function readPayload(event) {
  if (!event.data) return null;
  try {
    const parsed = event.data.json();
    return parsed && typeof parsed === "object" ? parsed : null;
  } catch (_) {
    // حمولةٌ ليست JSON (اختبارٌ يدوي من أدوات المطوّر مثلاً): نصٌّ خام يُقرأ جسماً
    try {
      const text = event.data.text();
      return text ? { body: text } : null;
    } catch (_) {
      return null;
    }
  }
}

self.addEventListener("push", (event) => {
  /**
   * 🔒 **إظهار بطاقةٍ إلزامي.** اشتراكنا `userVisibleOnly: true`، وهو الوحيد
   * المسموح في المتصفحات؛ فعاملٌ يستقبل دفعاً ولا يُظهر شيئاً يجعل المتصفح
   * يعرض بطاقةً عامة بنفسه («تم تحديث هذا الموقع في الخلفية») — أي ضجيجاً بلا
   * معنى — ثم **يسحب التصريح** بعد تكرارها. ولذلك كل مسارٍ هنا ينتهي بـ
   * `showNotification`، حتى حين لا تصل حمولة.
   */
  const data = readPayload(event) || {};

  const title = typeof data.title === "string" && data.title.trim() ? data.title : FALLBACK_TITLE;
  const bodyText = typeof data.body === "string" && data.body.trim() ? data.body : FALLBACK_BODY;
  const reference = typeof data.ref === "string" && data.ref.trim() ? data.ref : null;
  const url = safePath(data.url);

  const options = {
    body: reference ? `${reference} · ${bodyText}` : bodyText,
    // العربية اتجاهها من اليمين — وبدونها تُعرض علامات الترقيم في غير موضعها
    dir: "rtl",
    lang: "ar",
    icon: "/favicon.ico",
    /**
     * الوسم يمنع التراكم: بطاقتان بالوسم نفسه ⇒ الثانية تحلّ محل الأولى.
     * والافتراضي `undefined` **لا** يعني «لا وسم» بل بطاقةً مستقلة لكل رسالة —
     * وهو الصواب هنا: عرضان لرحلتين مختلفتين بطاقتان لا واحدة.
     */
    tag: typeof data.tag === "string" && data.tag ? data.tag : undefined,
    renotify: Boolean(data.tag),
    /**
     * تبقى البطاقة حتى يتفاعل معها: عرضُ الرحلة له مهلةٌ تنتهي، وبطاقةٌ تختفي
     * بعد ثوانٍ من هاتفٍ في جيب صاحبه هي بالضبط الحالة التي وُجدت القناة لها.
     */
    requireInteraction: true,
    data: { url, event: typeof data.event === "string" ? data.event : null },
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();

  const target = safePath(event.notification.data && event.notification.data.url);
  const absolute = new URL(target, self.location.origin).href;

  event.waitUntil(
    (async () => {
      const windows = await self.clients.matchAll({ type: "window", includeUncontrolled: true });

      // نافذةٌ مفتوحة على المسار نفسه: تُركَّز ولا تُفتح ثانية
      for (const client of windows) {
        if (client.url === absolute && "focus" in client) return client.focus();
      }
      // وإلا: أي نافذةٍ من موقعنا تُوجَّه إلى المسار — أرحم من تبويبٍ ثالثٍ
      // على متعهدٍ فتح البورتال أصلاً
      for (const client of windows) {
        if (client.url.startsWith(self.location.origin) && "navigate" in client) {
          await client.focus();
          return client.navigate(absolute);
        }
      }
      return self.clients.openWindow(absolute);
    })()
  );
});

/**
 * تجديد الاشتراك حين تُبطله خدمة الدفع.
 *
 * 🔒 **وبدونه تموت القناة صامتة.** الخدمة تدوّر العناوين من تلقائها (تحديث
 * متصفح · مرور زمن · إعادة تثبيت التطبيق على iOS)، فيبقى في قاعدتنا صفٌّ لعنوانٍ
 * مبطَل: `partner_channels` تعدّه قناةً **بالغة**، فيُحسب المتعهد «متاحاً»
 * ويشمله البثّ ولا يصله شيء. ثم لا يظهر العطب إلا حين يشتكي إنسان.
 *
 * والخادم يحذف الصفّ الميت حين يرد ٤٠٤/٤١٠ (`lib/push/deliver.ts`) — وهذا
 * النصف الآخر: **تسجيل البديل فوراً** فلا تمرّ رسالةٌ واحدة في الفجوة.
 */
self.addEventListener("pushsubscriptionchange", (event) => {
  event.waitUntil(
    (async () => {
      try {
        let subscription = event.newSubscription || null;

        if (!subscription) {
          // المفتاح من الاشتراك القديم إن توفّر، وإلا من الخادم — ونداءٌ واحد
          // لا يكلّف شيئاً في حدثٍ يقع مرةً كل بضعة أشهر
          let key = event.oldSubscription && event.oldSubscription.options
            ? event.oldSubscription.options.applicationServerKey
            : null;

          if (!key) {
            const res = await fetch("/api/push/key", { cache: "no-store" });
            const json = await res.json();
            if (!json || !json.publicKey) return;
            key = urlBase64ToUint8Array(json.publicKey);
          }

          subscription = await self.registration.pushManager.subscribe({
            userVisibleOnly: true,
            applicationServerKey: key,
          });
        }

        const json = subscription.toJSON();
        await fetch("/api/push/subscribe", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          // الكوكيز تُرسَل افتراضياً في طلبات نفس الأصل من العامل — وبلا جلسة
          // صالحة يردّ الخادم ٤٠١ ولا شيء نملك فعله هنا: يعيد المتعهد التفعيل
          // من الشاشة حين يفتحها، وشاشتُه تقول له ذلك صراحةً
          body: JSON.stringify({
            endpoint: json.endpoint,
            keys: json.keys,
            userAgent: self.navigator ? self.navigator.userAgent : null,
          }),
        });
      } catch (_) {
        // لا شيء نملك فعله من هنا؛ والشاشة تكتشف الفجوة حين تُفتح
      }
    })()
  );
});

/** فكّ base64url إلى بايتات — `applicationServerKey` لا يقبل نصّاً في كل المتصفحات */
function urlBase64ToUint8Array(base64) {
  const padding = "=".repeat((4 - (base64.length % 4)) % 4);
  const normalized = (base64 + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = self.atob(normalized);
  const output = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i += 1) output[i] = raw.charCodeAt(i);
  return output;
}

// يُقرأ في أدوات المطوّر لمعرفة أي نسخةٍ تعمل على جهاز المتعهد
self.SW_VERSION = SW_VERSION;
