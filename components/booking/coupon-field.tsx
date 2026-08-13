"use client";

import * as React from "react";
import { BadgePercent, LoaderCircle, TriangleAlert, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { useT, type Tx } from "@/components/site/i18n";
import { DEFAULT_LOCALE } from "@/lib/i18n-types";
import { REJECTION_TEXT } from "@/lib/discounts/messages";
import type { AppliedDiscount, VerifyCouponResponse } from "@/lib/discounts/types";
import type { VerifyCouponRequestWithLuggage } from "./extras";
import { createFormatter, type LocaleFormatter } from "./format";

/**
 * حقل رمز الخصم وتفصيل السعر بعده — جزيرة عميل داخل مسار الحجز.
 *
 * ── قاعدة واحدة تحكم هذا الملف كله ────────────────────────────────────────
 * **لا يُحسب هنا جنيه واحد.** لا طرح ولا نسبة ولا تقريب: `amount` و`totalBefore`
 * و`totalAfter` تصل الثلاثة جاهزة من `apply_discount` عبر `/api/discount/verify`.
 * أقصى ما يفعله هذا الملف هو تنسيق العرض (اتفاقية ٢ في `CONVENTIONS.md`:
 * TypeScript يعرض ويُنسّق فقط).
 *
 * ── ولماذا لا يظهر سبب التقليص ────────────────────────────────────────────
 * حين تقلّص أرضيةُ الهامش الخصمَ عن قيمته الاسمية، يرى العميل **القيمة الفعلية**
 * ولا يرى أنها قُلّصت ولا لماذا: راية `clamped` لا تغادر الخادم أصلاً (انظر
 * `lib/discounts/types.ts`). المالك يراها في اللوحة — وهو المقصود بالشفافية في
 * العقد الأم، لا الزائر.
 *
 * ── والمعاينة ليست التزاماً ───────────────────────────────────────────────
 * ما يظهر هنا معاينة. الرقم المُلزِم تثبّته `create_booking` في لقطة الحجز داخل
 * معاملتها، ولذلك يُرسَل **الرمز وحده** إلى `/api/booking` ولا يُرسَل أي مبلغ.
 * وإن رفضت القاعدةُ الرمزَ لحظة الحجز (نفد سقفه بين المعاينة والتأكيد، أو بلغ
 * هذا العميل سقفه الشخصي وهو ما لا تراه المعاينة أصلاً لأنها بلا هاتف) **فالحجز
 * يفشل ولا يُنشأ بالسعر الكامل بصمت** (‏`0024_discounts.sql:1035`): إنشاء حجز
 * بسعر أعلى مما اختاره العميل أسوأ من رسالة خطأ. يصل الرفض بالرمز
 * `coupon-rejected` بحالة ٤٠٩، و`Checkout` يُسقط الكوبون فوراً فيعود التفصيل
 * إلى السعر الكامل وتنجح المحاولة التالية.
 *
 * ── ولا رقم هاتف يغادر هذا المكوّن إلى مسار التحقق ────────────────────────
 * `/api/discount/verify` مسار عام يقبل التخمين؛ إرسال رقم العميل إليه يبني
 * ربطاً بين رمز كوبون وشخص في أكثر المسارات انكشافاً. سقف العميل يُفرض في
 * `redeem_coupon` داخل معاملة الحجز حيث الهاتف معروف أصلاً.
 *
 * ── وما يغادره **بالضرورة** منذ الدفعة ٣: عدد الحقائب ─────────────────────
 * الأهلية صارت شرطين (‏`capacity ≥ passengers` **و** `luggage_capacity ≥
 * luggage`)، والاختيار بعدهما `order by capacity asc limit 2`. فالحقائب
 * **تُزيح** زوج الفئات المعروض ولا تضيّقه: من يحمل ستّ حقائب لراكبين يرى
 * «ميني باص وباص»، فإن نادى مسارُ الكوبون `quote_public` بلا حقائب عاد إليه
 * بـ«سيدان وسوّار» ولم يجد فئته — فيرد ٤٠٩ ونصيحةً بإعادة الحساب لا يمكن أن
 * تنجح. لذلك تُرسَل الحقائب هنا كما تُرسَل إلى `/api/quote` حرفياً.
 * ⚠ **ولا تُرسَل الخدمات**: الكوبون يخصم الرحلة وحدها (القرار ب)، والخدمات
 * تُجمع فوق الرحلة المخصومة في `Checkout` لا في هذه المعاينة.
 */

/** أقصى طول رمز — مرآة لحدّ الخادم، لا حارس (الحارس هناك) */
const MAX_CODE_LENGTH = 40;

export type CouponTripInput = {
  originLat: number;
  originLng: number;
  destLat: number;
  destLng: number;
  passengers: number;
  roundTrip: boolean;
  waitingHours: number;
  /**
   * عدد الحقائب كما سُعِّرت به الرحلة — **مُدخل أهلية لا معلومة عرض**: بدونه
   * يستقبل مسارُ التحقق زوج فئات آخر فلا يجد فئة العميل (انظر الترويسة).
   */
  luggage?: number;
};

export type CouponFieldProps = {
  trip: CouponTripInput;
  classSlug: string;
  applied: AppliedDiscount | null;
  onApply: (discount: AppliedDiscount | null) => void;
  /** رمز يقترحه بانر عرض قائم — يملأ الحقل ولا يطبّق شيئاً بنفسه */
  suggestedCode?: string | null;
  disabled?: boolean;
  compact?: boolean;
  locale?: string;
};

/** نص الرفض بلغة الزائر — المفتاح من `lib/discounts/messages.ts` مصدراً واحداً */
function rejectionText(t: Tx, rejection: string, serverMessage: string): string {
  const entry = REJECTION_TEXT[rejection as keyof typeof REJECTION_TEXT];
  if (!entry) return serverMessage;
  return t(entry.key, entry.ar);
}

export function CouponField({
  trip,
  classSlug,
  applied,
  onApply,
  suggestedCode = null,
  disabled = false,
  compact = false,
  locale = DEFAULT_LOCALE,
}: CouponFieldProps) {
  const t = useT("discount");
  const fmt = React.useMemo(() => createFormatter(locale), [locale]);
  const uid = React.useId();

  const [code, setCode] = React.useState(suggestedCode ?? "");
  const [pending, setPending] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const fieldHeight = compact ? "h-11" : "h-12";

  // ⚠ إبطال المعاينة عند تغيّر المدخلات **مسؤولية المالك** (`Checkout`) لا هذا
  // المكوّن: `applied` حالةٌ يملكها الأب، وتعديل حالة الأب أثناء عرض الابن نمط
  // يرفضه React صراحةً. وهنا نُبطل ما نملكه وحده: رسالة الخطأ القديمة.
  const [lastAppliedCode, setLastAppliedCode] = React.useState<string | null>(
    applied?.code ?? null
  );
  if (lastAppliedCode !== (applied?.code ?? null)) {
    setLastAppliedCode(applied?.code ?? null);
    if (applied === null && error) setError(null);
  }

  async function verify() {
    const cleaned = code.replace(/\s+/g, "").toUpperCase().slice(0, MAX_CODE_LENGTH);
    if (cleaned.length === 0) {
      setError(t("errors.empty", "اكتب رمز الخصم كما وصلك."));
      return;
    }

    const payload: VerifyCouponRequestWithLuggage = {
      code: cleaned,
      origin: { lat: trip.originLat, lng: trip.originLng },
      destination: { lat: trip.destLat, lng: trip.destLng },
      passengers: trip.passengers,
      roundTrip: trip.roundTrip,
      waitingHours: trip.waitingHours,
      // نفس الرقم الذي بُنيت عليه البطاقة — وإلا سعّر الخادم فئتين غير المعروضتين
      luggage: trip.luggage ?? 0,
      classSlug,
    };

    setPending(true);
    setError(null);
    try {
      const res = await fetch("/api/discount/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const json = (await res.json()) as VerifyCouponResponse;

      if (!json.ok) {
        onApply(null);
        setError(
          json.code === "rate-limited"
            ? rejectionText(t, "rate-limited", json.message)
            : json.message || t("errors.failed", "تعذّر التحقق من الرمز. حاول مرة أخرى.")
        );
        return;
      }

      if (!json.applied) {
        onApply(null);
        setError(rejectionText(t, json.rejection, json.message));
        return;
      }

      setCode(json.code);
      onApply({
        code: json.code,
        amount: json.amount,
        totalBefore: json.totalBefore,
        totalAfter: json.totalAfter,
        currency: json.currency,
      });
    } catch {
      onApply(null);
      setError(
        t("errors.network", "تعذّر الاتصال بالخادم. تأكد من اتصالك بالإنترنت وحاول مرة أخرى.")
      );
    } finally {
      setPending(false);
    }
  }

  function remove() {
    onApply(null);
    setError(null);
    setCode("");
  }

  return (
    <div className="flex flex-col gap-2">
      <label htmlFor={`${uid}-coupon`} className="flex items-center gap-2 text-sm font-medium">
        <BadgePercent className="size-4 shrink-0 text-primary" aria-hidden="true" />
        {t("field.label", "رمز خصم")}
      </label>

      <div className="flex items-stretch gap-2">
        <input
          id={`${uid}-coupon`}
          type="text"
          inputMode="text"
          autoComplete="off"
          autoCapitalize="characters"
          spellCheck={false}
          maxLength={MAX_CODE_LENGTH}
          value={code}
          disabled={disabled || pending || applied !== null}
          onChange={(event) => {
            setCode(event.target.value);
            if (error) setError(null);
          }}
          onKeyDown={(event) => {
            // Enter داخل نموذج الحجز يعني «الخطوة التالية» — هنا يعني «تطبيق»
            if (event.key !== "Enter") return;
            event.preventDefault();
            if (!disabled && !pending && applied === null) void verify();
          }}
          placeholder={t("field.placeholder", "مثل SUMMER25")}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? `${uid}-coupon-error` : `${uid}-coupon-help`}
          className={cn(
            "min-w-0 flex-1 rounded-2xl border border-input bg-background px-3 text-base uppercase outline-none transition-colors focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:opacity-60",
            fieldHeight
          )}
        />

        {applied ? (
          <button
            type="button"
            onClick={remove}
            disabled={disabled}
            className={cn(
              "inline-flex shrink-0 items-center justify-center gap-1.5 rounded-2xl border border-border bg-background px-4 text-sm font-semibold transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50 disabled:opacity-50",
              fieldHeight
            )}
          >
            <X className="size-4" aria-hidden="true" />
            {t("actions.remove", "إزالة")}
          </button>
        ) : (
          <button
            type="button"
            onClick={() => void verify()}
            disabled={disabled || pending}
            className={cn(
              "inline-flex shrink-0 items-center justify-center gap-1.5 rounded-2xl border border-primary/40 bg-primary/10 px-4 text-sm font-semibold text-primary transition-colors hover:bg-primary/15 focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50 disabled:pointer-events-none disabled:opacity-60",
              fieldHeight
            )}
          >
            {pending ? (
              <>
                <LoaderCircle className="size-4 animate-spin" aria-hidden="true" />
                {t("actions.applying", "جارٍ التحقق…")}
              </>
            ) : (
              t("actions.apply", "تطبيق")
            )}
          </button>
        )}
      </div>

      {error ? (
        <p
          id={`${uid}-coupon-error`}
          className="flex items-start gap-1.5 text-xs leading-5 text-destructive"
        >
          <TriangleAlert className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
          {error}
        </p>
      ) : applied ? (
        <p className="text-xs leading-5 text-primary">
          {t("field.appliedNote", "طُبِّق الرمز {code} — وفّرت {amount}.", {
            code: applied.code,
            amount: fmt.money(applied.amount, applied.currency),
          })}
        </p>
      ) : (
        <p id={`${uid}-coupon-help`} className="text-xs leading-5 text-muted-foreground">
          {t("field.help", "معك رمز خصم؟ اكتبه هنا واضغط تطبيق قبل تأكيد الحجز.")}
        </p>
      )}

      <span className="sr-only" role="status" aria-live="polite">
        {pending
          ? t("status.checking", "جارٍ التحقق من رمز الخصم")
          : error
            ? error
            : applied
              ? t("status.applied", "طُبِّق رمز الخصم")
              : ""}
      </span>
    </div>
  );
}

/**
 * صفوف تفصيل السعر بعد الخصم — الإجمالي قبل، قيمة الخصم، الإجمالي بعد.
 * ثلاثة أرقام كلها من `apply_discount`، ولا رابع يُشتق منها هنا.
 *
 * `scope` ليس تنسيقاً: منذ الدفعة ٣ صار الكوبون يخصم **سعر الرحلة وحده**
 * والخدمات تُجمع فوقه (القرار ب في `lib/extras-types.ts`). فحين توجد خدمات في
 * الحجز تصير كلمة «الإجمالي» كاذبة — وهذه الصفوف تسمّي ما تخصمه فعلاً.
 */
export function DiscountRows({
  discount,
  t,
  fmt,
  scope = "total",
}: {
  discount: AppliedDiscount;
  /** مترجم مساحة `discount` */
  t: Tx;
  fmt: LocaleFormatter;
  /** `ride` حين تُضاف خدمات بعد الخصم، و`total` حين لا شيء بعده */
  scope?: "total" | "ride";
}) {
  const rideScope = scope === "ride";
  return (
    <>
      <div className="flex items-center justify-between gap-3">
        <dt className="text-muted-foreground">
          {rideScope
            ? t("rows.rideBefore", "سعر الرحلة قبل الخصم")
            : t("rows.before", "الإجمالي قبل الخصم")}
        </dt>
        <dd className="font-medium line-through decoration-muted-foreground/60">
          {fmt.money(discount.totalBefore, discount.currency)}
        </dd>
      </div>
      <div className="flex items-center justify-between gap-3">
        <dt className="flex items-center gap-1.5 text-primary">
          <BadgePercent className="size-4 shrink-0" aria-hidden="true" />
          {t("rows.discount", "الخصم ({code})", { code: discount.code })}
        </dt>
        <dd className="font-semibold text-primary">
          {t("rows.minus", "‑{amount}", {
            amount: fmt.money(discount.amount, discount.currency),
          })}
        </dd>
      </div>
      <div className="flex items-center justify-between gap-3 border-t border-border pt-2">
        <dt className="font-semibold">
          {rideScope
            ? t("rows.rideAfter", "سعر الرحلة بعد الخصم")
            : t("rows.after", "الإجمالي بعد الخصم")}
        </dt>
        <dd className="font-bold">{fmt.money(discount.totalAfter, discount.currency)}</dd>
      </div>
    </>
  );
}
