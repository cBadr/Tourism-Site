"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  BellOff,
  BellRing,
  Check,
  Loader2,
  Send,
  Share,
  ShieldAlert,
  Smartphone,
  Trash2,
} from "lucide-react";

import { dateLabel, Notice } from "@/components/portal/portal-ui";
import { HelpTip } from "@/components/shared/HelpTip";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import type { PushDeviceView } from "@/lib/partner-alerts-types";
import { cn } from "@/lib/utils";
import {
  describeDevice,
  readPushCapability,
  urlBase64ToUint8Array,
  type PushCapability,
} from "./push-support";

/**
 * «تنبيهات هذا الجهاز» — تدفّق الإذن المُرشِد للقناة ج٢ (دفع الويب).
 *
 * ══════════════════════════════════════════════════════════════════════════
 *  🔒 القيد الأول، وهو سبب وجود المكوّن بهذا الشكل
 * ══════════════════════════════════════════════════════════════════════════
 *
 * **لا يُطلب إذن الإشعارات عند فتح الصفحة أبداً** (‏١-ز في الموجز، اعتراضٌ قبله
 * بدر). من يرى الطلب فجأة يضغط «حظر» انعكاساً — **والحظر شبه دائم**: لا يعود
 * المتصفح يسأل، ولا يُلغى إلا من إعداداته يدوياً. فنخسر المتعهد للأبد بنقرة،
 * وهي نقرةٌ نحن من دفعناه إليها.
 *
 * والتسلسل الملزم: **شاشة ← شرحُ لماذا ← زرٌّ صريح ← ثم طلب المتصفح**. ولذلك
 * `Notification.requestPermission()` في هذا الملف **داخل معالج نقرةٍ واحد لا
 * غير**، ولا يُنادى من `useEffect` بحالٍ. ومن يوسّع الملف: هذا أول ما يُراجَع.
 *
 * ⚠ وله أثرٌ ثانٍ يبدو تفصيلاً وليس كذلك: **عامل الخدمة لا يُسجَّل عند التركيب**
 * بل عند النقر. فمتعهدٌ قرّر ألا يفعّل لا يبقى على جهازه عاملُ خدمةٍ لم يطلبه.
 *
 * ══════════════════════════════════════════════════════════════════════════
 *  🔒 القيد الثاني: آيفون — قيدُ Apple يُقال صراحةً ولا يُترك زرّاً لا يعمل
 * ══════════════════════════════════════════════════════════════════════════
 *
 * دفع الويب على iOS/iPadOS يعمل **للموقع المثبَّت على الشاشة الرئيسية وحده**
 * (16.4+). فيُكشف الجهاز وتُعرض خطواته — لأن زرّاً لا يفعل شيئاً يُفهَم عطباً
 * في المنصة، ومن استنتج ذلك لا يعود.
 *
 * ══════════════════════════════════════════════════════════════════════════
 *  والمزامنة الصامتة عند الفتح — لا تطلب شيئاً وتصلح عطباً حقيقياً
 * ══════════════════════════════════════════════════════════════════════════
 *
 * إن كان التصريح ممنوحاً والاشتراك قائماً على الجهاز، نعيد إرساله إلى الخادم
 * (‏`upsert` على `endpoint` فلا صفَّ مكرراً). وهذا يغلق فجوةً حقيقية: خدمة الدفع
 * تدوّر العناوين، و`pushsubscriptionchange` قد يقع والمتصفح مغلق فيضيع. فبلا
 * هذه المزامنة يبقى في القاعدة عنوانٌ مبطَل — و`partner_channels` تعدّه قناةً
 * **بالغة**، فيُحسب صاحبه «متاحاً» ويشمله البثّ ولا يصله شيء. وهو حرفياً العيب
 * الذي وُجدت هذه الموجة كلها لعلاجه.
 */

/* ------------------------------------------------------------------ */
/* الرسائل — رمز الخادم يُترجم هنا، ولا جملةَ عربية تعبر من مسار API      */
/* ------------------------------------------------------------------ */

const API_ERRORS: Record<string, string> = {
  auth: "انتهت جلستك أو لم يعد حسابك معتمداً — سجّل الدخول ثم أعد المحاولة.",
  env: "قاعدة البيانات غير مربوطة على الخادم — لا يمكن حفظ الاشتراك الآن.",
  schema: "جداول التنبيهات غير جاهزة بعد على الخادم — راجع الإدارة.",
  invalid: "رفض الخادم بيانات الاشتراك. حدّث الصفحة ثم أعد المحاولة.",
  "rate-limited": "محاولات كثيرة في وقت قصير — انتظر دقيقة ثم أعد المحاولة.",
  save: "تعذّر حفظ الاشتراك على الخادم — أعد المحاولة، وإن تكرر الأمر راسل الإدارة.",
  "not-configured":
    "قناة إشعارات الأجهزة غير مضبوطة على الخادم بعد. لا شيء مطلوب منك — راسل الإدارة، وستعمل فور ضبطها.",
};

type Feedback = { tone: "info" | "success" | "warning" | "danger"; text: string };

type ApiResult<T> = { ok: true; data: T } | { ok: false; code: string };

async function callApi<T>(url: string, init?: RequestInit): Promise<ApiResult<T>> {
  try {
    const res = await fetch(url, { cache: "no-store", ...init });
    const json = (await res.json().catch(() => null)) as (T & { ok?: boolean; code?: string }) | null;
    if (!res.ok || !json || json.ok === false) {
      return { ok: false, code: (json?.code as string) ?? "save" };
    }
    return { ok: true, data: json as T };
  } catch {
    return { ok: false, code: "save" };
  }
}

/** معرّف صفّ هذا الجهاز في القاعدة — ليعرف المتعهد أيّ سطرٍ هو في القائمة */
const DEVICE_ID_KEY = "portal-push-device-id";

function rememberDeviceId(id: string | null) {
  try {
    if (id) window.localStorage.setItem(DEVICE_ID_KEY, id);
    else window.localStorage.removeItem(DEVICE_ID_KEY);
  } catch {
    /* تخزينٌ ممنوع (وضع خاص): تفقد القائمة وسمَ «هذا الجهاز» ولا شيء غير ذلك */
  }
}

function readDeviceId(): string | null {
  try {
    return window.localStorage.getItem(DEVICE_ID_KEY);
  } catch {
    return null;
  }
}

/**
 * هل هذا الاشتراك موقَّعٌ بمفتاحنا الحالي؟
 *
 * ⚠ حالةٌ نادرة وأثرها كامل: لو غُيّر زوج VAPID على الخادم، يبقى على الجهاز
 * اشتراكٌ بالمفتاح القديم — و`subscribe` بمفتاحٍ مختلف **يرمي** `InvalidStateError`،
 * والإرسال إلى القديم يُردّ بـ`403` إلى الأبد. فالعلاج: إلغاء القديم ثم اشتراكٌ
 * جديد، بلا أن يفهم المتعهد شيئاً مما جرى.
 */
function matchesKey(subscription: PushSubscription, desired: Uint8Array): boolean {
  const raw = subscription.options?.applicationServerKey;
  if (!raw) return false;
  const current = new Uint8Array(raw as ArrayBuffer);
  if (current.length !== desired.length) return false;
  for (let i = 0; i < current.length; i += 1) if (current[i] !== desired[i]) return false;
  return true;
}

export function PushSetup({ className }: { className?: string }) {
  const [capability, setCapability] = useState<PushCapability | null>(null);
  const [permission, setPermission] = useState<NotificationPermission | null>(null);
  const [subscribed, setSubscribed] = useState(false);
  const [publicKey, setPublicKey] = useState<string | null>(null);
  const [serverReady, setServerReady] = useState<boolean | null>(null);
  const [devices, setDevices] = useState<PushDeviceView[] | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<Feedback | null>(null);
  const mounted = useRef(true);

  const loadDevices = useCallback(async () => {
    const res = await callApi<{ devices: PushDeviceView[] }>("/api/push/devices");
    if (!mounted.current) return;
    setDevices(res.ok ? res.data.devices : []);
  }, []);

  const saveSubscription = useCallback(async (subscription: PushSubscription) => {
    const json = subscription.toJSON() as { endpoint?: string; keys?: Record<string, string> };
    return callApi<{ id: string }>("/api/push/subscribe", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        endpoint: json.endpoint,
        keys: json.keys,
        userAgent: describeDevice(),
      }),
    });
  }, []);

  /**
   * التركيب: كشفٌ وقراءةٌ فقط. **لا `requestPermission` ولا `register`** — أي
   * لا شيء يظهر للمتعهد قبل أن ينقر.
   */
  useEffect(() => {
    mounted.current = true;

    (async () => {
      const cap = readPushCapability();
      if (!mounted.current) return;
      setCapability(cap);
      setPermission("Notification" in window ? Notification.permission : null);

      const key = await callApi<{ ready: boolean; publicKey: string | null }>("/api/push/key");
      if (!mounted.current) return;
      setServerReady(key.ok ? key.data.ready : false);
      setPublicKey(key.ok ? key.data.publicKey : null);

      await loadDevices();

      if (!cap.ready || Notification.permission !== "granted") return;

      // مزامنةٌ صامتة (اقرأ ترويسة الملف): اشتراكٌ قائم يُعاد تسجيله فلا يبقى
      // في القاعدة عنوانٌ مبطَل يُحسب قناةً بالغة
      const registration = await navigator.serviceWorker.getRegistration("/");
      const existing = await registration?.pushManager.getSubscription();
      if (!mounted.current || !existing) return;

      setSubscribed(true);
      const saved = await saveSubscription(existing);
      if (saved.ok) {
        rememberDeviceId(saved.data.id);
        await loadDevices();
      }
    })();

    return () => {
      mounted.current = false;
    };
  }, [loadDevices, saveSubscription]);

  /* ---------------------------------------------------------------- */
  /* التفعيل — المسار الوحيد الذي يظهر فيه طلب المتصفح                   */
  /* ---------------------------------------------------------------- */

  const enableOnThisDevice = useCallback(async () => {
    setBusy("enable");
    setFeedback(null);
    try {
      // 🔒 الإذن **أولاً وداخل النقرة مباشرة**: بعض المتصفحات تُسقط «إيماءة
      // المستخدم» بعد أول `await` طويل، فيُرفض الطلب تلقائياً بلا أن يظهر
      const decision = await Notification.requestPermission();
      setPermission(decision);

      if (decision === "denied") {
        setFeedback({
          tone: "danger",
          text: "مُنعت التنبيهات على هذا المتصفح. لن يسألك ثانيةً — أعد السماح من إعداداته كما هو موضّح أدناه.",
        });
        return;
      }
      if (decision !== "granted") {
        setFeedback({
          tone: "warning",
          text: "أغلقت النافذة بلا قرار. لم يُمنع شيء — انقر الزر متى شئت وسيسألك المتصفح من جديد.",
        });
        return;
      }

      if (!publicKey) {
        setFeedback({ tone: "warning", text: API_ERRORS["not-configured"] });
        return;
      }

      const registration = await navigator.serviceWorker.register("/sw.js", { scope: "/" });
      await navigator.serviceWorker.ready;

      const desired = urlBase64ToUint8Array(publicKey);
      let subscription = await registration.pushManager.getSubscription();
      if (subscription && !matchesKey(subscription, desired)) {
        await subscription.unsubscribe();
        subscription = null;
      }
      if (!subscription) {
        subscription = await registration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: desired as BufferSource,
        });
      }

      const saved = await saveSubscription(subscription);
      if (!saved.ok) {
        setFeedback({ tone: "danger", text: API_ERRORS[saved.code] ?? API_ERRORS.save });
        return;
      }

      rememberDeviceId(saved.data.id);
      setSubscribed(true);
      await loadDevices();
      setFeedback({
        tone: "success",
        text: "فُعّلت التنبيهات على هذا الجهاز. جرّبها الآن بالزر أدناه لتتأكد أنها تظهر فعلاً.",
      });
    } catch {
      // فشلٌ من المتصفح نفسه (اشتراك مرفوض · عامل خدمة لم يُسجَّل · وضع خاص)
      setFeedback({
        tone: "danger",
        text: "تعذّر تفعيل التنبيهات على هذا المتصفح. جرّب إغلاق وضع التصفح الخاص إن كنت تستعمله، أو أعد المحاولة من متصفح آخر.",
      });
    } finally {
      if (mounted.current) setBusy(null);
    }
  }, [loadDevices, publicKey, saveSubscription]);

  /* ---------------------------------------------------------------- */
  /* الإيقاف على هذا الجهاز                                             */
  /* ---------------------------------------------------------------- */

  const disableOnThisDevice = useCallback(async () => {
    setBusy("disable");
    setFeedback(null);
    try {
      const registration = await navigator.serviceWorker.getRegistration("/");
      const subscription = await registration?.pushManager.getSubscription();

      if (subscription) {
        /**
         * الخادم أولاً لأنه يحتاج العنوان، **ثم** الإلغاء المحلي. وفشلُ الخادم
         * لا يوقف الإلغاء: الاشتراك الملغى يردّ ٤١٠ في أول إرسال فيُحذف صفّه
         * تلقائياً (`lib/push/deliver.ts`). فالنتيجة صحيحة في المسارين.
         */
        await callApi("/api/push/unsubscribe", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ endpoint: subscription.endpoint }),
        });
        await subscription.unsubscribe();
      }

      rememberDeviceId(null);
      setSubscribed(false);
      await loadDevices();
      setFeedback({
        tone: "info",
        text: "أوقفنا التنبيهات على هذا الجهاز. تصلك العروض في البوابة كالعادة — لكن عليك أن تفتحها لتراها.",
      });
    } catch {
      setFeedback({ tone: "danger", text: "تعذّر الإيقاف — أعد المحاولة." });
    } finally {
      if (mounted.current) setBusy(null);
    }
  }, [loadDevices]);

  /* ---------------------------------------------------------------- */
  /* تنبيه تجريبي — يسلك المسار الحقيقي كاملاً                           */
  /* ---------------------------------------------------------------- */

  const sendTest = useCallback(async () => {
    setBusy("test");
    setFeedback(null);
    const res = await callApi<{ sent: number; targets: number; reason: string | null }>(
      "/api/push/test",
      { method: "POST" }
    );
    if (!mounted.current) return;

    if (!res.ok) {
      setFeedback({ tone: "danger", text: API_ERRORS[res.code] ?? API_ERRORS.save });
    } else if (res.data.sent > 0) {
      setFeedback({
        tone: "success",
        text: "أرسلنا تنبيهاً تجريبياً. إن لم تره خلال ثوانٍ فالتنبيهات مكتومة على مستوى نظام جهازك — راجع إعدادات الإشعارات فيه.",
      });
    } else {
      setFeedback({
        tone: "warning",
        text: "لم يصل التنبيه إلى أي جهاز. فعّل التنبيهات على هذا الجهاز أولاً، ثم أعد التجربة.",
      });
    }
    setBusy(null);
  }, []);

  const removeDevice = useCallback(
    async (id: string) => {
      setBusy(`device:${id}`);
      setFeedback(null);
      const res = await callApi("/api/push/unsubscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id }),
      });
      if (!mounted.current) return;

      if (!res.ok) {
        setFeedback({ tone: "danger", text: API_ERRORS[res.code] ?? API_ERRORS.save });
        setBusy(null);
        return;
      }

      // إن كان الصفّ المحذوف هو هذا الجهاز، يُلغى اشتراكه محلياً أيضاً — وإلا
      // بقيت الشاشة تقول «مفعَّل» وقد زال صفّه من القاعدة
      if (readDeviceId() === id) {
        const registration = await navigator.serviceWorker.getRegistration("/");
        const subscription = await registration?.pushManager.getSubscription();
        await subscription?.unsubscribe();
        rememberDeviceId(null);
        setSubscribed(false);
      }
      await loadDevices();
      setBusy(null);
    },
    [loadDevices]
  );

  /* ---------------------------------------------------------------- */
  /* العرض                                                             */
  /* ---------------------------------------------------------------- */

  const myDeviceId = typeof window === "undefined" ? null : readDeviceId();
  const working = busy !== null;

  return (
    <Card className={cn("gap-4 px-5", className)}>
      <div className="space-y-4">
        <div className="space-y-1">
          <h3 className="flex items-center gap-1.5 font-heading text-base font-bold">
            <BellRing className="size-4.5 shrink-0 text-muted-foreground" />
            تنبيهات هذا الجهاز
            <HelpTip>
              تنبيهٌ يظهر على الجهاز نفسه — الهاتف أو الحاسوب — والبوابة مغلقة. يعمل على ويندوز
              وأندرويد، وعلى الآيفون بشرط تثبيت البوابة على الشاشة الرئيسية.
            </HelpTip>
          </h3>
          {/* 🔒 «لماذا» قبل أي زر — وهو نصف التدفّق لا مقدّمة له */}
          <p className="max-w-prose text-sm leading-relaxed text-muted-foreground">
            عرض الرحلة يذهب لأول متعهد يقبله، وللعرض مهلةٌ تنتهي. فمن يراه بعد ساعة يكون قد خسره
            — والبوابة لا تنبّهك ما لم تكن مفتوحة أمامك. هذا التنبيه يصلك في حينه، حتى والشاشة
            مقفلة.
          </p>
        </div>

        {feedback ? <Notice tone={feedback.tone}>{feedback.text}</Notice> : null}

        {capability === null ? (
          <p className="text-sm text-muted-foreground">جارٍ فحص هذا الجهاز…</p>
        ) : !capability.ready ? (
          <BlockedDevice code={capability.code} />
        ) : permission === "denied" ? (
          <PermissionBlocked />
        ) : subscribed ? (
          <div className="space-y-3">
            <Notice tone="success">
              <p className="font-medium">التنبيهات مفعّلة على هذا الجهاز.</p>
            </Notice>
            <div className="flex flex-wrap gap-2">
              <Button type="button" variant="outline" onClick={sendTest} disabled={working}>
                {busy === "test" ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  <Send className="size-4" />
                )}
                أرسل تنبيهاً تجريبياً
              </Button>
              <Button
                type="button"
                variant="ghost"
                onClick={disableOnThisDevice}
                disabled={working}
              >
                {busy === "disable" ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  <BellOff className="size-4" />
                )}
                أوقفها على هذا الجهاز
              </Button>
            </div>
          </div>
        ) : (
          <div className="space-y-3">
            {serverReady === false ? (
              <Notice tone="warning">{API_ERRORS["not-configured"]}</Notice>
            ) : null}
            {/*
              النصّ الذي يسبق الطلب مباشرةً — يقول ما سيحدث بعد النقر بالضبط،
              فلا يفاجئه طلبُ المتصفح فيضغط «حظر» انعكاساً (وهو حظرٌ شبه دائم)
            */}
            <p className="max-w-prose text-sm leading-relaxed">
              بعد نقر الزر سيسألك المتصفح: «هل تسمح لهذا الموقع بإرسال إشعارات؟» — اختر
              <span className="font-semibold"> سماح</span>. ولن نطلب هذا الإذن من تلقائنا في أي
              صفحة أخرى.
            </p>
            <Button
              type="button"
              onClick={enableOnThisDevice}
              disabled={working || serverReady === false}
            >
              {busy === "enable" ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <BellRing className="size-4" />
              )}
              فعّل التنبيهات على هذا الجهاز
            </Button>
          </div>
        )}

        <DeviceList
          devices={devices}
          myDeviceId={myDeviceId}
          busy={busy}
          onRemove={removeDevice}
        />
      </div>
    </Card>
  );
}

/* ------------------------------------------------------------------ */
/* حالات المنع                                                          */
/* ------------------------------------------------------------------ */

/** خطوات التثبيت على آيفون — بصيغة ما يراه المستخدم على شاشته لا بمصطلحاتنا */
function IosInstallSteps() {
  return (
    <ol className="list-inside list-decimal space-y-1 text-sm leading-relaxed">
      <li>
        افتح هذه الصفحة في <span className="font-semibold">Safari</span> (لا من داخل تطبيق آخر).
      </li>
      <li className="flex flex-wrap items-center gap-1">
        انقر زر المشاركة <Share className="inline size-4" /> في شريط المتصفح.
      </li>
      <li>
        اختر <span className="font-semibold">«إضافة إلى الشاشة الرئيسية»</span>.
      </li>
      <li>افتح البوابة من الأيقونة الجديدة على شاشتك، ثم عد إلى هذه الصفحة وفعّل التنبيهات.</li>
    </ol>
  );
}

function BlockedDevice({ code }: { code: "insecure" | "ios-needs-install" | "ios-needs-update" | "unsupported" }) {
  if (code === "ios-needs-install") {
    return (
      <Notice tone="info" icon={<Smartphone className="size-5 shrink-0" />}>
        <p className="mb-2 font-medium">
          على الآيفون والآيباد تعمل التنبيهات للبوابة المثبَّتة على الشاشة الرئيسية فقط.
        </p>
        <p className="mb-2 text-muted-foreground">
          هذا قيدٌ من Apple على كل المواقع، لا شيء يخصّنا — والخطوات مرة واحدة:
        </p>
        <IosInstallSteps />
      </Notice>
    );
  }

  if (code === "ios-needs-update") {
    return (
      <Notice tone="warning" icon={<Smartphone className="size-5 shrink-0" />}>
        <p className="font-medium">نظام جهازك أقدم من أن يدعم هذه التنبيهات.</p>
        <p>
          تحتاج iOS/iPadOS بإصدار 16.4 أو أحدث. حدّث النظام من «الإعدادات ← عام ← تحديث
          البرنامج»، ثم عد إلى هنا. وحتى ذلك الحين تصلك العروض في البوابة، وتحتاج أن تفتحها.
        </p>
      </Notice>
    );
  }

  if (code === "insecure") {
    return (
      <Notice tone="warning">
        <p className="font-medium">التنبيهات تحتاج اتصالاً آمناً (https).</p>
        <p>هذه الشاشة مفتوحة على وصلة غير آمنة، والمتصفح يمنع الإشعارات عليها. راجع الإدارة.</p>
      </Notice>
    );
  }

  return (
    <Notice tone="warning">
      <p className="font-medium">هذا المتصفح لا يدعم تنبيهات الأجهزة.</p>
      <p>
        جرّب Chrome أو Edge أو Firefox على الحاسوب، أو Chrome على أندرويد. وإن كنت في وضع التصفح
        الخاص فأغلقه — التنبيهات لا تعمل فيه.
      </p>
    </Notice>
  );
}

/**
 * الحظر — أهمّ حالةٍ في هذا الملف كله.
 *
 * المتصفح **لا يسأل ثانية** بعد «حظر»، فزرُّ «فعّل» هنا يكون زرّاً لا يفعل شيئاً.
 * والمطلوب خطواتٌ يدوية يمشي عليها المتعهد — ولذلك تُكتب بما يراه على شاشته
 * (أيقونة القفل) لا بمصطلحات الإعدادات التي تختلف بين متصفح وآخر.
 */
function PermissionBlocked() {
  return (
    <Notice tone="danger" icon={<ShieldAlert className="size-5 shrink-0" />}>
      <p className="mb-2 font-medium">التنبيهات محظورة لهذا الموقع على هذا المتصفح.</p>
      <p className="mb-2">
        لن يسألك المتصفح مرة أخرى — الحظر يُلغى يدوياً منه:
      </p>
      <ol className="list-inside list-decimal space-y-1">
        <li>انقر أيقونة القفل (أو «ⓘ») بجوار عنوان الموقع في شريط العنوان.</li>
        <li>
          افتح <span className="font-semibold">الإشعارات</span> واختر{" "}
          <span className="font-semibold">«سماح»</span>.
        </li>
        <li>حدّث هذه الصفحة، ثم فعّل التنبيهات من الزر.</li>
      </ol>
      <p className="mt-2 text-muted-foreground">
        وإن كان جهازك آخر ما تملك، فلا شيء ضائع: العروض تبقى في البوابة، وتحتاج أن تفتحها.
      </p>
    </Notice>
  );
}

/* ------------------------------------------------------------------ */
/* قائمة الأجهزة                                                        */
/* ------------------------------------------------------------------ */

/**
 * ⚠ **لماذا تظهر القائمة أصلاً؟** لأن السؤال الذي يكسر الثقة في هذه القناة هو
 * «هل فعّلتُها أم لا؟»: يفعّل من هاتفه ثم يفتح الحاسوب فيرى «غير مفعّل»
 * فيظنّها لا تعمل. القائمة تفصل «هذا الجهاز» عن «أجهزتك المستقبِلة»، فتُجيب
 * السؤالين بجملةٍ واحدة.
 */
function DeviceList({
  devices,
  myDeviceId,
  busy,
  onRemove,
}: {
  devices: PushDeviceView[] | null;
  myDeviceId: string | null;
  busy: string | null;
  onRemove: (id: string) => void;
}) {
  if (devices === null || devices.length === 0) return null;

  return (
    <div className="space-y-2 border-t border-border pt-4">
      <p className="text-sm font-medium">الأجهزة التي تستقبل تنبيهاتك</p>
      <ul className="space-y-1.5">
        {devices.map((device) => (
          <li
            key={device.id}
            className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border px-3 py-2 text-sm"
          >
            <span className="flex min-w-0 items-center gap-2">
              <Smartphone className="size-4 shrink-0 text-muted-foreground" />
              <span className="truncate">{device.label ?? "جهاز غير معروف"}</span>
              {device.id === myDeviceId ? (
                <span className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">
                  <Check className="size-3" />
                  هذا الجهاز
                </span>
              ) : null}
            </span>
            <span className="flex items-center gap-2">
              <span className="text-xs text-muted-foreground">
                منذ {dateLabel(device.createdAt)}
              </span>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => onRemove(device.id)}
                disabled={busy !== null}
                aria-label="أزل هذا الجهاز"
              >
                {busy === `device:${device.id}` ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  <Trash2 className="size-4" />
                )}
              </Button>
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
