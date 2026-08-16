"use client";

import * as React from "react";
import { CreditCard, FlaskConical, LoaderCircle, ShieldCheck, TriangleAlert, Wallet } from "lucide-react";

import { useT } from "@/components/site/i18n";
import { trackBrowserFunnel } from "@/lib/analytics/browser";
import { PRINT_HIDDEN_CLASS } from "@/lib/export-types";
import { cn } from "@/lib/utils";

/**
 * منتقي وسيلة الدفع في صفحة متابعة الحجز (المرحلة ٩).
 *
 * ثلاثة قرارات تحكم هذا المكوّن:
 *
 * (١) **التحويل اليدوي هو الافتراضي ولا يتراجع.** حالة البداية `manual`، فلوحة
 *     التحويل (أرقام الحسابات ورفع الإيصال) تصل من الخادم عبر `children` وتُصيَّر
 *     في HTML الأول كما كانت قبل هذه المرحلة. لو تعطّل الـ JS كلياً بقي المسار
 *     الأصلي معروضاً وعاملاً — البوابات وحدها تحتاج JS.
 *
 * (٢) **المبلغ لا يُرسل من المتصفح إطلاقاً** (القاعدة الأولى في عقد المرحلة).
 *     الطلب يحمل توكن الحجز واسم المزوّد فقط، والخادم يقرأ المطلوب من صف الحجز
 *     نفسه. أي مبلغ يصل من هنا كان سيُتجاهل — فلا نرسله أصلاً.
 *
 * (٣) **النجاح لا يُقرَّر هنا.** الضغط ينتهي بإعادة توجيه إلى صفحة المزوّد، ثم
 *     يعود العميل إلى صفحة عودة تعرض الحالة كما قرأتها من قاعدة البيانات.
 *     التأكيد يقع بالـ webhook الموقّع وحده.
 */

export type GatewayChoice = {
  provider: string;
  /** الاسم الظاهر مترجَماً — يصل جاهزاً من الخادم */
  label: string;
  sandbox: boolean;
};

const MANUAL = "manual";

/** استخراج رابط التوجيه من رد `/api/payments/start` بأي من الصيغتين */
function readRedirect(payload: unknown): string | null {
  if (typeof payload !== "object" || payload === null) return null;
  const row = payload as Record<string, unknown>;
  for (const key of ["redirectUrl", "redirect_url"]) {
    const value = row[key];
    if (typeof value === "string" && value.trim().length > 0) return value.trim();
  }
  return null;
}

function readMessage(payload: unknown): string | null {
  if (typeof payload !== "object" || payload === null) return null;
  const value = (payload as Record<string, unknown>).message;
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

export function PaymentMethodChoice({
  token,
  gateways,
  children,
}: {
  /** توكن الحجز العام — هو كل ما يُرسل مع اسم المزوّد */
  token: string;
  gateways: GatewayChoice[];
  /** لوحة التحويل اليدوي كما صيّرها الخادم — تُعرض حين يكون الاختيار «تحويل يدوي» */
  children: React.ReactNode;
}) {
  const t = useT("payment");
  const uid = React.useId();

  const [method, setMethod] = React.useState<string>(MANUAL);
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const selectedGateway = gateways.find((gateway) => gateway.provider === method) ?? null;

  async function startPayment(provider: string) {
    if (busy) return;
    setBusy(true);
    setError(null);

    try {
      const res = await fetch("/api/payments/start", {
        method: "POST",
        headers: { "content-type": "application/json" },
        // `bookingToken` و`provider` فقط — وهما كل ما يقرؤه المسار من الجسم.
        // لا مبلغ ولا عملة ولا خطة دفع: الخادم يقرأها كلها من صف الحجز.
        body: JSON.stringify({ bookingToken: token, provider }),
      });

      const payload: unknown = await res.json().catch(() => null);
      const redirectUrl = readRedirect(payload);
      const ok =
        res.ok &&
        typeof payload === "object" &&
        payload !== null &&
        (payload as Record<string, unknown>).ok === true;

      if (!ok || !redirectUrl) {
        setError(
          readMessage(payload) ??
            t(
              "errors.startFailed",
              "تعذّر فتح صفحة الدفع الآن. جرّب وسيلة أخرى أو حوّل يدوياً — حجزك محفوظ برقمه."
            )
        );
        setBusy(false);
        return;
      }

      // القمع في المتصفح: نظير `trackFunnel("booking_started")` في
      // `/api/payments/start`، وفي نفس لحظته (بعد أن صار للزائر رابط دفع فعلي).
      // بلا حمولة إطلاقاً: التوكن مفتاح وصول، والمبلغ لا يعرفه المتصفح أصلاً.
      trackBrowserFunnel("booking_started");

      // مغادرة الصفحة إلى المزوّد — لا نُنهي حالة الانتظار كي لا يُضغط الزر مرتين
      window.location.assign(redirectUrl);
    } catch {
      setError(
        t("errors.network", "تعذّر الاتصال بالخادم. تأكد من اتصالك بالإنترنت وحاول مرة أخرى.")
      );
      setBusy(false);
    }
  }

  const optionClass = (active: boolean) =>
    cn(
      "flex cursor-pointer items-start gap-3 rounded-2xl border p-4 transition-colors",
      active
        ? "border-primary bg-primary/5 shadow-sm shadow-primary/10"
        : "border-border bg-card hover:bg-muted/50"
    );

  return (
    <div className="flex flex-col gap-4">
      {/*
        🖨 `no-print` عليه هو **بعينه**، لا على `fieldset` عارياً في ورقة الرحلة.
        القاعدة المشتركة تُسقط كل `input` داخل `.print-sheet`، فتبقى تسميات
        الوسائل نصّاً بلا خيارٍ يُختار — ومكانها الحجب. أما القاعدة العارية فكانت
        تبتلع `AccountChooser` معه (وسمُه `fieldset` كذلك) فتخرج الورقة بلا رقم
        تحويلٍ واحد، وهو نقيض ما تَعِد به `PRINT_CSS` في صفحة الرحلة.
      */}
      <fieldset className={cn(PRINT_HIDDEN_CLASS, "flex flex-col gap-2.5")}>
        <legend className="mb-2.5 text-sm font-bold">
          {t("methodLegend", "اختر وسيلة الدفع")}
        </legend>

        {/* التحويل اليدوي أولاً ومحدداً — المسار الأصلي لا يتزحزح */}
        <label htmlFor={`${uid}-${MANUAL}`} className={optionClass(method === MANUAL)}>
          <input
            id={`${uid}-${MANUAL}`}
            type="radio"
            name={`${uid}-method`}
            value={MANUAL}
            checked={method === MANUAL}
            onChange={() => {
              setMethod(MANUAL);
              setError(null);
            }}
            className="mt-1 size-4 shrink-0 accent-primary"
          />
          <span className="flex min-w-0 flex-1 flex-col gap-1">
            <span className="flex items-center gap-2 text-sm font-bold">
              <Wallet className="size-4 shrink-0 text-primary" aria-hidden="true" />
              {t("manual.label", "تحويل يدوي — محفظة أو انستا باي")}
            </span>
            <span className="text-xs leading-6 text-muted-foreground">
              {t(
                "manual.hint",
                "تحوّل من تطبيقك ثم ترفع صورة الإيصال، ويؤكد فريقنا حجزك بعد المراجعة."
              )}
            </span>
          </span>
        </label>

        {gateways.map((gateway) => {
          const active = method === gateway.provider;
          return (
            <label
              key={gateway.provider}
              htmlFor={`${uid}-${gateway.provider}`}
              className={optionClass(active)}
            >
              <input
                id={`${uid}-${gateway.provider}`}
                type="radio"
                name={`${uid}-method`}
                value={gateway.provider}
                checked={active}
                onChange={() => {
                  setMethod(gateway.provider);
                  setError(null);
                }}
                className="mt-1 size-4 shrink-0 accent-primary"
              />
              <span className="flex min-w-0 flex-1 flex-col gap-1">
                <span className="flex flex-wrap items-center gap-2 text-sm font-bold">
                  <CreditCard className="size-4 shrink-0 text-primary" aria-hidden="true" />
                  {gateway.label}
                  {gateway.sandbox ? (
                    <span className="inline-flex items-center gap-1 rounded-full border border-amber-500/50 bg-amber-500/10 px-2 py-0.5 text-[11px] font-medium text-amber-900 dark:text-amber-200">
                      <FlaskConical className="size-3" aria-hidden="true" />
                      {t("sandboxBadge", "وضع تجريبي")}
                    </span>
                  ) : null}
                </span>
                <span className="text-xs leading-6 text-muted-foreground">
                  {t("gateway.hint", "تُحوَّل إلى صفحة الدفع الآمنة، ويتأكد حجزك فور وصول تأكيد البنك.")}
                </span>
              </span>
            </label>
          );
        })}
      </fieldset>

      {method === MANUAL ? (
        children
      ) : (
        <>
          {/*
            🖨 **الاختيار يبدّل ما يُعرض على الشاشة وحدها — لا ما يُطبع.**

            `children` هي لوحة التحويل اليدوي بأرقام الحسابات، وكانت عند اختيار
            بوابةٍ لا تُصيَّر إطلاقاً. وعقد `lib/export-types.ts` §٤ ينصّ على أن
            أرقام الحسابات **تُطبع عمداً**: من يطبع ورقته وهو بانتظار الدفع
            يحتاجها في يده، وهي نصّ لا أداة تفاعل. فمن اختار بوابةً ثم طبع كان
            يخرج بورقة عنوانها «ادفع … لتأكيد الحجز» وتحتها «اختر الوسيلة الأنسب
            لك» **وبلا وسيلة واحدة**: `fieldset` يذهب بقاعدة `PRINT_CSS` في
            صفحة الرحلة، وزرُّ البوابة بقاعدة `.print-sheet button` في الكتلة
            المشتركة — فلا يبقى على الورق شيء يُدفع به.

            فالفرع الآن وجهان لحالة واحدة: طاقم البوابة يلبس `no-print` فيذهب مع
            الورق، ولوحة التحويل تُصيَّر في حاوية `print-only hidden` — مخفيّة
            على الشاشة بـ`hidden` فلا يتغيّر من سلوك الاختيار بكسل واحد، ويكشفها
            `!important` داخل `@media print` وحدها. ولا نسخة مكررة في الشجرة:
            الفرعان متبادلان، فنسخةُ `children` واحدة في كل حال.

            ⚠ والبوابات صفرٌ اليوم فلا يقع هذا الفرع أصلاً — ويوم تُفعَّل أولاها
            يقع في يد عميل لا في اختبار.
          */}
          <div
            className={cn(PRINT_HIDDEN_CLASS, "flex flex-col gap-3 border-t border-border pt-4")}
          >
            <button
              type="button"
              onClick={() => selectedGateway && startPayment(selectedGateway.provider)}
              disabled={busy || selectedGateway === null}
              className="inline-flex h-12 items-center justify-center gap-2 rounded-2xl bg-primary px-6 text-base font-semibold text-primary-foreground shadow-lg shadow-primary/25 transition-all hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50 disabled:pointer-events-none disabled:opacity-60"
            >
              {busy ? (
                <>
                  <LoaderCircle className="size-5 animate-spin" aria-hidden="true" />
                  {t("gateway.starting", "جارٍ فتح صفحة الدفع…")}
                </>
              ) : (
                <>
                  <CreditCard className="size-5" aria-hidden="true" />
                  {t("gateway.pay", "المتابعة إلى الدفع")}
                </>
              )}
            </button>

            <p className="flex items-start gap-2 text-xs leading-6 text-muted-foreground">
              <ShieldCheck className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden="true" />
              {t(
                "gateway.security",
                "بيانات بطاقتك تُدخل في صفحة المزوّد وحدها ولا تمر بموقعنا ولا تُخزَّن عندنا."
              )}
            </p>

            {error ? (
              <p
                role="alert"
                className="flex items-start gap-2 rounded-2xl border border-destructive/40 bg-destructive/10 px-3 py-2.5 text-sm leading-6 text-destructive"
              >
                <TriangleAlert className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
                {error}
              </p>
            ) : null}

            <span className="sr-only" role="status" aria-live="polite">
              {busy ? t("gateway.startingStatus", "جارٍ فتح صفحة الدفع") : (error ?? "")}
            </span>
          </div>

          {/* لوحة التحويل للورق وحده — انظر التعليق أعلاه. والتباعد يعيش على
              غلافٍ داخلي لأن `.print-only` تفرض `display:block` بـ`!important`،
              فأي `gap` على الحاوية نفسها يسقط ملغياً وتخرج التعليماتُ ملتصقةً
              بالبطاقات؛ وبالغلاف تخرج الورقة بإيقاع مسار «بلا بوابات» نفسه */}
          <div className="print-only hidden">
            <div className="flex flex-col gap-4">{children}</div>
          </div>
        </>
      )}
    </div>
  );
}
