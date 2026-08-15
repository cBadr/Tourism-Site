"use client";

import * as React from "react";
import { Coins, LoaderCircle, Sparkles, TriangleAlert } from "lucide-react";
import { cn } from "@/lib/utils";
import { useT, type Tx } from "@/components/site/i18n";
import { DEFAULT_LOCALE } from "@/lib/i18n-types";
import { REDEEM_TEXT } from "@/lib/loyalty/messages";
import type {
  AppliedRedemption,
  RedeemRequest,
  RedeemResponse,
  RedeemUnavailable,
} from "@/lib/loyalty/types";
import { createFormatter, type LocaleFormatter } from "./format";

/**
 * لوحة استبدال النقاط وصفوفها في تفصيل السعر — جزيرة عميل داخل مسار الحجز.
 *
 * **شقيقة `coupon-field.tsx` لا نمطٌ جديد**: نفس الموضع (الخطوة ٣ قبل خطة
 * الدفع)، ونفس القاعدة الحاكمة، ونفس شكل الرد. ومن قرأ ذاك الملف يعرف هذا.
 *
 * ── قاعدة واحدة تحكم هذا الملف كله ────────────────────────────────────────
 * **لا يُحسب هنا جنيه واحد ولا نقطة واحدة.** لا طرح ولا ضرب في قيمة النقطة ولا
 * تقريب: `points` و`worth` و`rideBefore` و`rideAfter` تصل الأربعة جاهزة من
 * `preview_redeem_points` عبر `/api/loyalty/preview`. أقصى ما يفعله هذا الملف
 * تنسيقُ العرض (اتفاقية ٢ في `CONVENTIONS.md`).
 *
 * ── والفرق الجوهري عن حقل الكوبون: **لا شيء يُكتب** ────────────────────────
 * الكوبون رمزٌ يملكه الزائر ويكتبه، فالحقل حقلُ إدخال بزر «تطبيق». والنقاط
 * رصيدٌ **نملك نحن معرفته**، فالسؤال الوحيد المطروح على العميل: أتستخدمه الآن؟
 * ولذلك لوحةٌ بمفتاحٍ واحد لا حقل نص — ولا خانةَ «كم نقطة»، لسببٍ مكتوب في
 * `lib/loyalty/types.ts` (٣).
 *
 * ولذلك أيضاً **تسأل هذه اللوحة الخادمَ من تلقاء نفسها** حين تُعرض، بينما حقل
 * الكوبون لا يسأل إلا بضغطة: هي لا تعرف قبل السؤال إن كان هناك ما يُعرض أصلاً.
 * ولا تظهر إلا حين يكون الجواب «نعم» — فلا يرى من لا رصيد له لوحةً تعتذر له.
 *
 * ── ⚠ نيّةُ العميل تبقى، والأرقام تُجدَّد ────────────────────────────────
 * ما يملكه هذا المكوّن هو **النيّة** (`wanted`: أريد استخدام نقاطي)، وما يملكه
 * الأب هو **الأرقام** (`applied`). فحين يتغيّر الكوبون تسقط الأرقام فوراً عند
 * الأب — لأن السقف مشترك (‏§١) وأي رقمٍ قديم يصير كذبة في اللحظة نفسها — ثم
 * يُعاد السؤال، وتُطبَّق النيّة على الجواب الجديد. والعميل يرى الرقم الجديد في
 * تفصيل السعر قبل أن يضغط «تأكيد»، فلا يُلزَم بشيء لم يره.
 *
 * ── والمعاينة ليست التزاماً ───────────────────────────────────────────────
 * الرقم المُلزِم تثبّته `create_booking` في لقطتها داخل معاملتها، ولذلك يُرسَل
 * إلى `/api/booking` **رايةٌ منطقية واحدة** ولا يُرسَل عدد نقاطٍ ولا مبلغ. وإن
 * تعذّر الاستبدال لحظة التأكيد **فالحجز يفشل ولا يُنشأ بالسعر الأعلى بصمت**
 * (نفس قرار `coupon-rejected` حرفاً بحرف) — يصل الرمز `redeem-rejected` بحالة
 * ٤٠٩، و`Checkout` يُسقط الاستبدال فتنجح المحاولة التالية.
 */

export type RedeemTripInput = {
  originLat: number;
  originLng: number;
  destLat: number;
  destLng: number;
  passengers: number;
  roundTrip: boolean;
  waitingHours: number;
  /** مُدخل أهلية لا معلومة عرض — انظر ترويسة `coupon-field.tsx` */
  luggage?: number;
};

export type RedeemFieldProps = {
  trip: RedeemTripInput;
  classSlug: string;
  /**
   * 🔒 رمز الكوبون المطبَّق الآن — يُرسَل مع كل معاينة، **وتغيّره يُعيد السؤال**.
   * السقف واحدٌ للطبقتين مجتمعتين (‏§١)، فمعاينةٌ تجهل الكوبون تَعِد بما لا يُنفَّذ.
   */
  couponCode: string | null;
  applied: AppliedRedemption | null;
  onApply: (redemption: AppliedRedemption | null) => void;
  disabled?: boolean;
  compact?: boolean;
  locale?: string;
};

/** نص التعذّر بلغة الزائر — المفتاح من `lib/loyalty/messages.ts` مصدراً واحداً */
function reasonText(t: Tx, reason: RedeemUnavailable, serverMessage: string): string {
  const entry = REDEEM_TEXT[reason];
  if (!entry) return serverMessage;
  return t(entry.key, entry.ar);
}

export function RedeemField({
  trip,
  classSlug,
  couponCode,
  applied,
  onApply,
  disabled = false,
  compact = false,
  locale = DEFAULT_LOCALE,
}: RedeemFieldProps) {
  const t = useT("loyalty");
  const fmt = React.useMemo(() => createFormatter(locale), [locale]);
  const uid = React.useId();

  /** ما أرجعه الخادم آخر مرة — `null` يعني «لا شيء يُعرض» */
  const [offer, setOffer] = React.useState<(AppliedRedemption & { balance: number }) | null>(null);
  const [notice, setNotice] = React.useState<string | null>(null);
  const [pending, setPending] = React.useState(false);

  /**
   * نيّة العميل — وهي **حالة هذا المكوّن وحده**، تنجو من تجديد الأرقام.
   * ولا تُشتقّ من `applied` لأن الأب يُسقطه عند تغيّر الكوبون: اشتقاقُها منه
   * يعني أن تغيير الكوبون يلغي اختيار العميل بلا أن يطلب هو ذلك.
   */
  const [wanted, setWanted] = React.useState(false);

  /**
   * أحدث نداء وحده هو الذي يكتب في الحالة.
   *
   * ⚠ **وهذا ليس تحوّطاً**: تغيير الكوبون يُطلق معاينةً ثانية بينما الأولى في
   * الطريق، وردّ الأولى قد يصل **بعد** الثانية فيكتب رقماً لسقفٍ لم يعد قائماً —
   * أي يعرض على العميل خصماً بنقاطٍ أكلها الكوبون. عدّادٌ تصاعدي يجعل ذلك
   * مستحيلاً بدل أن يكون نادراً.
   */
  const runId = React.useRef(0);

  const onApplyRef = React.useRef(onApply);
  React.useEffect(() => {
    onApplyRef.current = onApply;
  }, [onApply]);

  const { originLat, originLng, destLat, destLng, passengers, roundTrip, waitingHours } = trip;
  const luggage = trip.luggage ?? 0;

  React.useEffect(() => {
    const controller = new AbortController();
    const id = ++runId.current;

    void (async () => {
      setPending(true);
      try {
        // 🔒 لا سعر ولا مسافة ولا عدد نقاط في الجسم — مدخلات الرحلة والرمز فقط.
        const payload: RedeemRequest = {
          origin: { lat: originLat, lng: originLng },
          destination: { lat: destLat, lng: destLng },
          passengers,
          roundTrip,
          waitingHours,
          luggage,
          classSlug,
          couponCode,
        };

        const res = await fetch("/api/loyalty/preview", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
          signal: controller.signal,
        });
        const json = (await res.json()) as RedeemResponse;
        if (id !== runId.current) return;

        if (!json.ok) {
          // خطأ طلبٍ أو بيئة: اللوحة تختفي ولا تعرض عطلاً على ميزةٍ ثانوية.
          // العميل يتابع بالسعر المعروض، ورصيده لم يُمَس.
          setOffer(null);
          setNotice(null);
          onApplyRef.current(null);
          return;
        }

        if (!json.available) {
          setOffer(null);
          // «لا رصيد» و«غير متاح» و«خارج الخدمة» لا تُقال لمن لم يسأل: اللوحة
          // تصمت. وتنطق في حالتين فقط — أن يكون له رصيد دون الحدّ الأدنى (فيها
          // خطوةٌ تالية يفعلها)، أو أن يكون قد **اختار** الاستخدام ثم تعذّر.
          const speak = json.reason === "below-minimum" || wanted;
          setNotice(speak ? reasonText(t, json.reason, json.message) : null);
          onApplyRef.current(null);
          return;
        }

        const fresh: AppliedRedemption & { balance: number } = {
          points: json.points,
          worth: json.worth,
          rideBefore: json.rideBefore,
          rideAfter: json.rideAfter,
          currency: json.currency,
          balance: json.balance,
        };
        setOffer(fresh);
        setNotice(null);
        // النيّة تُطبَّق على الأرقام الجديدة — والعميل يراها قبل أن يؤكد
        if (wanted) {
          onApplyRef.current({
            points: fresh.points,
            worth: fresh.worth,
            rideBefore: fresh.rideBefore,
            rideAfter: fresh.rideAfter,
            currency: fresh.currency,
          });
        }
      } catch {
        if (id !== runId.current) return;
        // إجهاض أو انقطاع شبكة — الصمت هو الجواب الصحيح هنا كذلك
        setOffer(null);
        setNotice(null);
        onApplyRef.current(null);
      } finally {
        if (id === runId.current) setPending(false);
      }
    })();

    return () => controller.abort();
    // `wanted` **خارج** التبعيات عمداً: تغييرها اختيارُ عرضٍ لا مُدخلُ تسعير،
    // وإدخالها هنا يُطلق نداءً جديداً على كل ضغطة مفتاح بلا سبب.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    originLat,
    originLng,
    destLat,
    destLng,
    passengers,
    roundTrip,
    waitingHours,
    luggage,
    classSlug,
    couponCode,
  ]);

  function toggle(next: boolean) {
    setWanted(next);
    if (!next) {
      onApply(null);
      return;
    }
    if (offer) {
      onApply({
        points: offer.points,
        worth: offer.worth,
        rideBefore: offer.rideBefore,
        rideAfter: offer.rideAfter,
        currency: offer.currency,
      });
    }
  }

  // لا عرض ولا رسالة ⇒ لا لوحة إطلاقاً. الصمت هو الحالة الافتراضية لهذه اللوحة:
  // من لا رصيد له، ومن لم يسجّل دخوله، ومن لم تصل قاعدتَه هجرةُ المحرّك بعد —
  // ثلاثتهم يرون مسار الحجز كما كان تماماً، بلا حرف زائد.
  if (!offer && !notice) return null;

  const boxClass = cn(
    "flex flex-col gap-2 rounded-2xl border px-4 py-3.5 transition-colors",
    compact ? "text-sm" : "",
    applied ? "border-primary/50 bg-primary/5 ring-1 ring-primary/20" : "border-border bg-muted/40"
  );

  /* ── لا عرض، لكن هناك ما يُقال (رصيدٌ دون الحد، أو تعذّر بعد الاختيار) ── */
  if (!offer) {
    return (
      <p className="flex items-start gap-2 rounded-2xl border border-border bg-muted/40 px-4 py-3 text-xs leading-6 text-muted-foreground">
        <Sparkles className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden="true" />
        {notice}
      </p>
    );
  }

  return (
    <div className={boxClass}>
      <label className="flex cursor-pointer items-start gap-2.5">
        <input
          type="checkbox"
          checked={applied !== null}
          disabled={disabled || pending}
          onChange={(event) => toggle(event.target.checked)}
          aria-describedby={`${uid}-redeem-help`}
          className="mt-1 size-4 shrink-0 rounded border-input accent-[var(--primary)] disabled:opacity-50"
        />
        <span className="flex min-w-0 flex-col gap-1">
          <span className="flex items-center gap-2 text-sm font-semibold">
            {/*
              الدوّار يظهر أثناء **إعادة** السؤال — وأكثر ما يقع بعد تطبيق
              كوبون، حين يُعاد حساب النقاط على السقف المشترك (‏§١). وبدونه
              يتغيّر الرقم تحت عين العميل بلا ما يفسّر التغيّر.
            */}
            {pending ? (
              <LoaderCircle className="size-4 shrink-0 animate-spin text-primary" aria-hidden="true" />
            ) : (
              <Coins className="size-4 shrink-0 text-primary" aria-hidden="true" />
            )}
            {t("field.use", "استخدم نقاطي في هذه الرحلة")}
          </span>
          {/*
            الجملة تحمل الرقمين اللذين يهمّانه: كم نقطة تُنفَق وكم يوفّر بالجنيه.
            وكلاهما من القاعدة — ولا ثالث يُشتقّ منهما هنا.
          */}
          <span id={`${uid}-redeem-help`} className="text-xs leading-6 text-muted-foreground">
            {t("field.summary", "استخدام {points} نقطة يوفّر لك {amount} من سعر الرحلة.", {
              points: fmt.number(offer.points),
              amount: fmt.money(offer.worth, offer.currency),
            })}
          </span>
          <span className="text-xs leading-6 text-muted-foreground">
            {t("field.balance", "رصيدك الحالي {points} نقطة.", {
              points: fmt.number(offer.balance),
            })}
          </span>
        </span>
      </label>

      {notice ? (
        <p className="flex items-start gap-1.5 text-xs leading-5 text-destructive">
          <TriangleAlert className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
          {notice}
        </p>
      ) : null}

      <span className="sr-only" role="status" aria-live="polite">
        {pending
          ? t("status.checking", "جارٍ حساب قيمة نقاطك")
          : applied
            ? t("status.applied", "طُبِّق خصم النقاط")
            : ""}
      </span>
    </div>
  );
}

/**
 * صفّا تفصيل السعر بعد النقاط — قيمة الخصم ثم سعر الرحلة بعده.
 *
 * يقعان **بعد** صفوف الكوبون وقبل الخدمات، وهو ترتيب §٢ في العقد الأم حرفياً:
 *
 *     سعر الرحلة − الكوبون − النقاط = سعر الرحلة بعد التنزيلات، ثم + الخدمات
 *
 * والترتيب ليس تنسيقاً: النقاط **مالٌ يملكه العميل سلفاً**، فتُستهلك على ما بقي
 * بعد تنزيلات المنصة لا قبلها — وإلا أنفق رصيده على مبلغٍ كان سيُحسم عنه مجاناً.
 * وعرضُها فوق الكوبون يوحي بالعكس ويجعل الصفوف تروي قصةً غير التي تنفّذها القاعدة.
 *
 * 🔒 ولا يُعرض `rideBefore` هنا: صفُّ «قبل» موجودٌ سلفاً في `DiscountRows` حين
 * يوجد كوبون، وسطرُ سعر الرحلة حين لا يوجد. وتكراره يُنتج **رقمين لنفس المعنى**
 * في قائمة واحدة، وهو أسرع طريق إلى قارئٍ يظن أن هناك خصمين.
 */
export function RedeemRows({
  redemption,
  t,
  fmt,
  scope = "total",
}: {
  redemption: AppliedRedemption;
  /** مترجم مساحة `loyalty` */
  t: Tx;
  fmt: LocaleFormatter;
  /** `ride` حين تُضاف خدمات بعد النقاط، و`total` حين لا شيء بعدها */
  scope?: "total" | "ride";
}) {
  const rideScope = scope === "ride";
  return (
    <>
      <div className="flex items-center justify-between gap-3">
        <dt className="flex items-center gap-1.5 text-primary">
          <Coins className="size-4 shrink-0" aria-hidden="true" />
          {t("rows.redeem", "خصم النقاط ({points} نقطة)", {
            points: fmt.number(redemption.points),
          })}
        </dt>
        <dd className="font-semibold text-primary">
          {t("rows.minus", "‑{amount}", {
            amount: fmt.money(redemption.worth, redemption.currency),
          })}
        </dd>
      </div>
      <div className="flex items-center justify-between gap-3 border-t border-border pt-2">
        <dt className="font-semibold">
          {rideScope
            ? t("rows.rideAfter", "سعر الرحلة بعد النقاط")
            : t("rows.after", "الإجمالي بعد النقاط")}
        </dt>
        <dd className="font-bold">{fmt.money(redemption.rideAfter, redemption.currency)}</dd>
      </div>
    </>
  );
}
