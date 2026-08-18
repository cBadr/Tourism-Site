"use client";

import { useCallback, useEffect, useState } from "react";
import { BellOff, BellRing, Loader2, ShieldAlert } from "lucide-react";

import { Button } from "@/components/ui/button";
import { PRINT_HIDDEN_CLASS } from "@/lib/export-types";
import {
  describeDevice,
  readPushCapability,
  urlBase64ToUint8Array,
  type PushCapability,
} from "@/app/portal/_components/push-support";

/**
 * «نبّهني على هذا الجهاز» — اشتراكُ العميل في إشعارات حجزه (‏هجرة 0131).
 *
 * ══════════════════════════════════════════════════════════════════════════
 *  🔒 القيدُ الأول، وهو سببُ وجود المكوّن بهذا الشكل
 * ══════════════════════════════════════════════════════════════════════════
 *
 * **لا يُطلب إذنُ الإشعارات عند فتح الصفحة أبداً — ولا اشتراكَ صامت.**
 * من يرى الطلبَ فجأةً يضغط «حظر» انعكاساً، **والحظرُ شبه دائم**: لا يعود
 * المتصفح يسأل ولا يُلغى إلا من إعداداته يدوياً. فنخسر القناةَ للأبد بنقرةٍ
 * نحن من دفعناه إليها. والتسلسلُ الملزِم: **شرحٌ ← زرٌّ صريح ← ثم طلبُ
 * المتصفح**. ولذلك `Notification.requestPermission()` هنا **داخل معالج نقرةٍ
 * واحدٍ لا غير**، ولا يُنادى من `useEffect` بحال.
 *
 * وله أثرٌ ثانٍ يبدو تفصيلاً وليس كذلك: **عاملُ الخدمة لا يُسجَّل عند التركيب**
 * بل عند النقر. فمن قرّر ألا يفعّل لا يبقى على جهازه عاملُ خدمةٍ لم يطلبه.
 *
 * ── وما لا يُستنسخ من بورتال المتعهد (‏القاعدة الذهبية ١٢) ──────────────────
 *
 * كشفُ قدرة الجهاز وفكُّ `base64url` ووصفُ الجهاز مستوردةٌ من
 * `app/portal/_components/push-support` — وحدةٌ نقيّة بلا `"use client"` ولا
 * شبكة. ونسخُها هنا كان يعني نسختين من قيد Apple تنحرفان في أول تصحيح.
 *
 * ⚠ **والفرقُ عن البورتال مقصود**: هذه بطاقةٌ صغيرة بزرٍّ واحد، بلا قائمةِ
 *   أجهزةٍ ولا «أرسل تنبيهاً تجريبياً». العميلُ يفتح هذه الصفحة مرةً أو مرتين،
 *   ولوحةُ إدارةِ أجهزةٍ هنا سطحٌ يصونه ولا يستعمله.
 *
 * ── وقيدٌ ثالث يُقال ولا يُخفى ─────────────────────────────────────────────
 *
 * `endpoint` قد يُبطله مزوّدُ الدفع ويعطي بديلاً (`pushsubscriptionchange`).
 * وعاملُ الخدمة يبلّغ عن ذلك إلى `/api/push/subscribe` — وهو مسارُ **المتعهد**
 * المحروسُ بجلسة بورتال. فاشتراكُ عميلٍ دُوِّر عنوانُه يموت صامتاً حتى يفتح
 * صفحته ثانيةً، فتعيد هذه البطاقةُ تسجيلَه. وهو حدٌّ معلَنٌ لا عيبٌ مخفيّ.
 */

type Props = {
  /** توكنُ متابعة الحجز — هو المفتاح الوحيد، ويأتي وسيطاً مربوطاً من الخادم */
  token: string;
  /** لا تُعرض على حجزٍ انتهى أو أُلغي: قناةٌ لا رسالةَ فيها بعدُ */
  active: boolean;
};

type State =
  | { kind: "checking" }
  | { kind: "blocked"; text: string }
  | { kind: "idle" }
  | { kind: "busy" }
  | { kind: "on" }
  | { kind: "denied" }
  | { kind: "error"; text: string };

/** رسائلُ المنع — كلُّ واحدةٍ تقول للمستخدم ماذا يفعل الآن، لا ماذا حدث */
const BLOCK_TEXT: Record<string, string> = {
  insecure: "إشعارات الأجهزة تحتاج اتصالاً آمناً (https).",
  "ios-needs-install":
    "على آيفون وآيباد: افتح قائمة المشاركة ثم «إضافة إلى الشاشة الرئيسية»، وافتح الحجز من الأيقونة — عندها يمكن تفعيل التنبيهات.",
  "ios-needs-update": "إشعارات الأجهزة تحتاج iOS 16.4 أو أحدث.",
  unsupported: "هذا المتصفح لا يدعم إشعارات الأجهزة.",
};

const API_ERROR: Record<string, string> = {
  invalid: "انتهت صلاحية رابط المتابعة أو تغيّر — حدّث الصفحة ثم أعد المحاولة.",
  env: "الخدمة غير متاحة الآن — أعد المحاولة بعد قليل.",
  schema: "الخدمة غير متاحة الآن — أعد المحاولة بعد قليل.",
  "rate-limited": "محاولاتٌ كثيرة في وقتٍ قصير — انتظر دقيقة ثم أعد المحاولة.",
  save: "تعذّر حفظ التنبيهات — أعد المحاولة، وإن تكرّر الأمر راسلنا.",
  "not-configured": "التنبيهات غير مفعَّلة على الخادم بعد. لا شيء مطلوبٌ منك.",
};

async function post<T>(url: string, body: unknown): Promise<{ ok: true; data: T } | { ok: false; code: string }> {
  try {
    const res = await fetch(url, {
      method: "POST",
      cache: "no-store",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    const json = (await res.json().catch(() => null)) as (T & { ok?: boolean; code?: string }) | null;
    if (!res.ok || !json || json.ok === false) return { ok: false, code: (json?.code as string) ?? "save" };
    return { ok: true, data: json as T };
  } catch {
    return { ok: false, code: "save" };
  }
}

export function TripAlerts({ token, active }: Props) {
  const [state, setState] = useState<State>({ kind: "checking" });

  /**
   * قراءةُ الحالة عند الفتح — **بلا طلبِ إذنٍ وبلا تسجيل عاملِ خدمة**.
   * تقرأ التصريحَ القائم واشتراكَ المتصفح إن وُجدا، ثم تسأل الخادمَ هل هذا
   * الجهاز مسجَّلٌ على **هذا الحجز** (‏قد يكون مشترَكاً في حجزٍ آخر).
   */
  useEffect(() => {
    let alive = true;
    (async () => {
      const capability: PushCapability = readPushCapability();
      if (!capability.ready) {
        if (alive) setState({ kind: "blocked", text: BLOCK_TEXT[capability.code] ?? BLOCK_TEXT.unsupported });
        return;
      }
      if (Notification.permission === "denied") {
        if (alive) setState({ kind: "denied" });
        return;
      }
      try {
        const registration = await navigator.serviceWorker.getRegistration("/");
        const subscription = await registration?.pushManager.getSubscription();
        if (!subscription) {
          if (alive) setState({ kind: "idle" });
          return;
        }
        const res = await post<{ registered: boolean }>("/api/push/customer/state", {
          token,
          endpoint: subscription.endpoint,
        });
        if (!alive) return;
        setState(res.ok && res.data.registered ? { kind: "on" } : { kind: "idle" });
      } catch {
        if (alive) setState({ kind: "idle" });
      }
    })();
    return () => {
      alive = false;
    };
  }, [token]);

  const enable = useCallback(async () => {
    setState({ kind: "busy" });

    // (١) التصريح — **داخل معالج النقرة، وهنا وحده**
    let permission: NotificationPermission;
    try {
      permission = await Notification.requestPermission();
    } catch {
      setState({ kind: "error", text: API_ERROR.save });
      return;
    }
    if (permission !== "granted") {
      setState({ kind: "denied" });
      return;
    }

    try {
      // (٢) المفتاح العام — من الخادم لا من حزمة البناء (انظر `/api/push/key`)
      const keyRes = await fetch("/api/push/key", { cache: "no-store" });
      const key = (await keyRes.json().catch(() => null)) as
        | { ready: boolean; publicKey: string | null }
        | null;
      if (!key?.ready || !key.publicKey) {
        setState({ kind: "error", text: API_ERROR["not-configured"] });
        return;
      }

      // (٣) عاملُ الخدمة — يُسجَّل الآن لا عند التركيب
      const registration = await navigator.serviceWorker.register("/sw.js", { scope: "/" });
      await navigator.serviceWorker.ready;

      const existing = await registration.pushManager.getSubscription();
      const subscription =
        existing ??
        (await registration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(key.publicKey) as BufferSource,
        }));

      const json = subscription.toJSON() as { endpoint?: string; keys?: Record<string, string> };
      const res = await post("/api/push/customer/subscribe", {
        token,
        endpoint: json.endpoint,
        keys: json.keys,
        userAgent: describeDevice(),
      });
      if (!res.ok) {
        setState({ kind: "error", text: API_ERROR[res.code] ?? API_ERROR.save });
        return;
      }
      setState({ kind: "on" });
    } catch {
      setState({ kind: "error", text: API_ERROR.save });
    }
  }, [token]);

  const disable = useCallback(async () => {
    setState({ kind: "busy" });
    try {
      const registration = await navigator.serviceWorker.getRegistration("/");
      const subscription = await registration?.pushManager.getSubscription();
      if (!subscription) {
        setState({ kind: "idle" });
        return;
      }
      /**
       * ⚠ ولا يُنادى `subscription.unsubscribe()`: اشتراكُ المتصفح **واحدٌ لكل
       * أصل**، وقد يكون هذا الجهازُ متابعاً لحجزٍ آخر — أو بورتالَ متعهدٍ من
       * المتصفح نفسه. فالإيقافُ صفُّ هذا الحجز وحده على الخادم.
       */
      const res = await post("/api/push/customer/unsubscribe", {
        token,
        endpoint: subscription.endpoint,
      });
      setState(res.ok ? { kind: "idle" } : { kind: "error", text: API_ERROR[res.code] ?? API_ERROR.save });
    } catch {
      setState({ kind: "error", text: API_ERROR.save });
    }
  }, [token]);

  // حجزٌ انتهى أو أُلغي: لا رسالةَ قادمة، فالبطاقةُ وعدٌ بلا مضمون
  if (!active) return null;
  // ولا تُعرض قبل أن نعرف قدرة الجهاز — وميضُ زرٍّ ثم اختفاؤه أسوأ من تأخّره
  if (state.kind === "checking") return null;

  const on = state.kind === "on";
  const busy = state.kind === "busy";

  return (
    <section
      className={`${PRINT_HIDDEN_CLASS} rounded-2xl border border-border bg-card p-5 text-card-foreground`}
      aria-labelledby="trip-alerts-title"
    >
      <div className="flex items-start gap-4">
        <span className="grid size-11 shrink-0 place-items-center rounded-2xl bg-primary/10 text-primary">
          {on ? <BellRing className="size-5" aria-hidden="true" /> : <BellOff className="size-5" aria-hidden="true" />}
        </span>
        <div className="flex flex-1 flex-col gap-2">
          <h2 id="trip-alerts-title" className="text-base font-bold leading-snug">
            تنبيهات هذه الرحلة على هذا الجهاز
          </h2>
          <p className="text-sm leading-7 text-muted-foreground">
            {on
              ? "سنُنبّهك على هذا الجهاز عند تأكيد الحجز، وعند تجهيز سيارتك، وقبل الموعد، وبعد انتهاء الرحلة. يمكنك الإيقاف متى شئت."
              : "فعّلها لتصلك أربعة تنبيهات لا غير: تأكيد الحجز، تجهيز سيارتك، قرب الموعد، وانتهاء الرحلة. ولن نرسل لك شيئاً آخر."}
          </p>

          {state.kind === "blocked" ? (
            <p className="flex items-start gap-2 text-sm leading-7 text-muted-foreground">
              <ShieldAlert className="mt-1 size-4 shrink-0" aria-hidden="true" />
              <span>{state.text}</span>
            </p>
          ) : null}

          {state.kind === "denied" ? (
            <p className="flex items-start gap-2 text-sm leading-7 text-muted-foreground">
              <ShieldAlert className="mt-1 size-4 shrink-0" aria-hidden="true" />
              <span>
                التنبيهات محظورة لهذا الموقع في إعدادات متصفحك. اسمح بها من إعدادات الموقع ثم أعد المحاولة —
                ورابط هذه الصفحة يبقى طريقك إلى الحجز في كل الأحوال.
              </span>
            </p>
          ) : null}

          {state.kind === "error" ? (
            <p className="text-sm leading-7 text-destructive">{state.text}</p>
          ) : null}

          {state.kind === "blocked" || state.kind === "denied" ? null : (
            <div>
              <Button
                type="button"
                variant={on ? "outline" : "default"}
                onClick={on ? disable : enable}
                disabled={busy}
              >
                {busy ? (
                  <Loader2 className="size-4 animate-spin" aria-hidden="true" />
                ) : on ? (
                  <BellOff className="size-4" aria-hidden="true" />
                ) : (
                  <BellRing className="size-4" aria-hidden="true" />
                )}
                {busy ? "لحظة…" : on ? "إيقاف التنبيهات" : "نبّهني على هذا الجهاز"}
              </Button>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
