"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import {
  ArrowRight,
  BadgeCheck,
  CalendarClock,
  Check,
  ChevronLeft,
  ChevronRight,
  LoaderCircle,
  Route,
  TriangleAlert,
  User,
  Wallet,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { ExtraSelection } from "@/lib/extras-types";
import {
  DEFAULT_PAYMENT_SETTINGS,
  type BookingError,
  type CreateBookingResponse,
  type PaymentPlan,
  type PaymentSettings,
} from "@/lib/booking-types";
import { DEFAULT_LOCALE, localePath } from "@/lib/i18n-types";
import { useT, type Tx } from "@/components/site/i18n";
import { trackBrowserFunnel } from "@/lib/analytics/browser";
import type { PromoBanner } from "@/lib/discount-types";
import type { AppliedDiscount } from "@/lib/discounts/types";
import { createFormatter, type LocaleFormatter } from "../format";
import { CouponField, DiscountRows } from "../coupon-field";
import { PromoBanners } from "../promo-banner";
import type { CreateBookingRequestWithExtras, OfferWithExtras } from "../extras";
import { readPaymentSettings, splitAmounts } from "./payment";
import { todayInputValue, toIsoFromLocalInputs } from "./datetime";

/**
 * مسار إتمام الحجز — ثلاث خطوات داخل نفس الصفحة (بلا تنقل حتى الإرسال):
 *   ١ بيانات الرحلة (موعد الانطلاق + ملاحظات)
 *   ٢ بياناتك (الاسم + الهاتف + واتساب)
 *   ٣ الدفع (كامل المبلغ أو عربون)
 * ثم POST /api/booking ← توجيه إلى /booking/[token].
 *
 * لا حساب مالي مُلزِم هنا: السعر المعروض وصل من /api/quote (دالة SQL)، ومعاينة
 * العربون في الخطوة ٣ عرضٌ تقديري بقواعد الإعدادات، والمبالغ النهائية تعود من
 * `create_booking` في قاعدة البيانات — لا يُرسل أي مبلغ من المتصفح إطلاقاً.
 *
 * المرحلة ١٢أ — الخصم: حقل الكوبون في الخطوة ٣ (قبل اختيار خطة الدفع، لأن
 * العربون نسبة من الإجمالي). كل رقم فيه من `apply_discount` عبر
 * `/api/discount/verify`، وما يُرسل عند التأكيد هو **الرمز وحده**: القاعدة تعيد
 * الحساب وتُجمّد الخصم في لقطة الحجز. والمعروض هنا معاينة لا التزام — فإن نفد
 * سقف الكوبون بين المعاينة والتأكيد أنشأت القاعدة الحجز بالسعر الكامل، والمبالغ
 * النهائية تظهر في صفحة متابعة الحجز (وهي مصدرها الوحيد).
 */

/** الرحلة كما تصل من الحاسبة — بإحداثيات النقطتين (شرط بدء الحجز) */
export type CheckoutTrip = {
  originLabel: string;
  originLat: number;
  originLng: number;
  destinationLabel: string;
  destLat: number;
  destLng: number;
  passengers: number;
  roundTrip: boolean;
  /** كما اشتقّتها القاعدة من الموعدين — لا كما قدّرها متصفح */
  waitingHours: number;
  luggage?: number;
  /**
   * موعد الانطلاق حين تكون الرحلة ذهاباً وعودة: تجمعه الحاسبة لأنه **مُدخل
   * سعري** هناك. وحين يصل غير فارغ **تُعرض الخطوة ١ للقراءة لا للتعديل**:
   * تعديل موعدٍ يغيّر السعر بعد عرض السعر هو بالضبط «الشاشة تَعِد بغير ما تفعله
   * القاعدة». وللاتجاه الواحد يصل `null` فيبقى الحقل قابلاً للكتابة كما كان.
   */
  pickupAt?: string | null;
  returnAt?: string | null;
  /** رموز وكميات فقط — ولا سعر (D-09) */
  extras?: ExtraSelection[];
};

export type CheckoutProps = {
  offer: OfferWithExtras;
  trip: CheckoutTrip;
  /** العودة إلى بطاقات العروض */
  onBack: () => void;
  /** نسخة مضغوطة (ويدجت البطل) */
  compact?: boolean;
  /** لغة الزائر — تصل من الصفحة الخادمية، وغيابها يعني العربية */
  locale?: string;
  /**
   * نظام الخصومات مفعَّل — يصل من الصفحة الخادمية عبر ويدجت البحث.
   * غيابه يعني **مطفأ**: الافتراضي الآمن هو ألّا يظهر حقل الكوبون أصلاً
   * (القرار ١٠: النظام مطفأ في البذرة، والافتراضي هو ما سيعمل في الإنتاج).
   */
  discountEnabled?: boolean;
  /** بانرات موضع «الحجز» — عرض فقط، بلا أثر على أي سعر */
  banners?: PromoBanner[];
};

type Step = 1 | 2 | 3;

type FieldKey = "pickup" | "name" | "phone" | "whatsapp";
type FieldErrors = Partial<Record<FieldKey, string>>;

const STEPS: { index: Step; key: string; title: string }[] = [
  { index: 1, key: "steps.trip", title: "بيانات الرحلة" },
  { index: 2, key: "steps.customer", title: "بياناتك" },
  { index: 3, key: "steps.payment", title: "الدفع" },
];

/** نفس تحقق الخادم شكلياً — رسالة فورية بلا رحلة شبكة */
const PHONE_PATTERN = /^[+\d\s()-]{8,20}$/;

function isPhoneValid(value: string): boolean {
  const trimmed = value.trim();
  if (!PHONE_PATTERN.test(trimmed)) return false;
  const digits = trimmed.replace(/\D/g, "");
  return digits.length >= 8 && digits.length <= 15;
}

/* ------------------------------------------------------------------ */
/* أجزاء العرض                                                          */
/* ------------------------------------------------------------------ */

function StepsBar({ current, t, fmt }: { current: Step; t: Tx; fmt: LocaleFormatter }) {
  return (
    <ol className="flex items-center gap-2" aria-label={t("stepsLabel", "خطوات الحجز")}>
      {STEPS.map((step, index) => {
        const done = step.index < current;
        const active = step.index === current;
        return (
          <li key={step.index} className="flex flex-1 items-center gap-2">
            <span
              aria-current={active ? "step" : undefined}
              className={cn(
                "grid size-8 shrink-0 place-items-center rounded-full text-sm font-bold transition-colors",
                done
                  ? "bg-primary/15 text-primary"
                  : active
                    ? "bg-primary text-primary-foreground shadow-sm shadow-primary/30"
                    : "bg-muted text-muted-foreground"
              )}
            >
              {done ? (
                <Check className="size-4" aria-hidden="true" />
              ) : (
                fmt.digits(step.index)
              )}
            </span>
            <span
              className={cn(
                "min-w-0 flex-1 truncate text-xs font-medium sm:text-sm",
                active ? "text-foreground" : "text-muted-foreground"
              )}
            >
              {t(step.key, step.title)}
            </span>
            {index < STEPS.length - 1 ? (
              <span
                aria-hidden="true"
                className={cn(
                  "hidden h-px flex-1 sm:block",
                  done ? "bg-primary/40" : "bg-border"
                )}
              />
            ) : null}
          </li>
        );
      })}
    </ol>
  );
}

/** بطاقة الملخص الثابتة: المسار والفئة والسعر — حاضرة في الخطوات الثلاث */
function SummaryCard({
  offer,
  trip,
  total,
  originalTotal,
  t,
  fmt,
}: {
  offer: OfferWithExtras;
  trip: CheckoutTrip;
  /** الإجمالي المعروض — بعد الخصم إن طُبِّق */
  total: number;
  /** الإجمالي قبل الخصم — null حين لا خصم، فلا يظهر سعر مشطوب بلا سبب */
  originalTotal: number | null;
  /** مترجم مساحة `booking.offers.summary` — نفس نص ملخص الرحلة في البطاقات */
  t: Tx;
  fmt: LocaleFormatter;
}) {
  return (
    <div className="flex flex-col gap-2 rounded-2xl border border-border bg-muted/40 px-4 py-3">
      <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm font-medium">
        <Route className="size-4 shrink-0 text-primary" aria-hidden="true" />
        <span>{trip.originLabel}</span>
        <span className="text-muted-foreground" aria-hidden="true">
          ←
        </span>
        <span>{trip.destinationLabel}</span>
      </p>
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1">
        <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
          <span className="font-medium text-foreground">{offer.classTitle}</span>
          <span>{fmt.passengers(trip.passengers)}</span>
          {(trip.luggage ?? 0) > 0 ? (
            <span>{t("luggage", "الحقائب: {value}", { value: fmt.digits(trip.luggage ?? 0) })}</span>
          ) : null}
          <span>{trip.roundTrip ? t("roundTrip", "ذهاب وعودة") : t("oneWay", "ذهاب فقط")}</span>
          {trip.waitingHours > 0 ? (
            <span>
              {t("waiting", "انتظار: {value}", { value: fmt.hours(trip.waitingHours) })}
            </span>
          ) : null}
        </p>
        <p className="flex items-baseline gap-2">
          {originalTotal !== null ? (
            <span className="text-sm font-medium text-muted-foreground line-through">
              {fmt.money(originalTotal, offer.currency)}
            </span>
          ) : null}
          <span className="text-base font-extrabold tracking-tight">
            {fmt.money(total, offer.currency)}
          </span>
        </p>
      </div>
    </div>
  );
}

function FieldError({ id, message }: { id: string; message?: string }) {
  if (!message) return null;
  return (
    <p id={id} className="flex items-start gap-1.5 text-xs leading-5 text-destructive">
      <TriangleAlert className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
      {message}
    </p>
  );
}

/* ------------------------------------------------------------------ */
/* المسار                                                               */
/* ------------------------------------------------------------------ */

export function Checkout({
  offer,
  trip,
  onBack,
  compact = false,
  locale = DEFAULT_LOCALE,
  discountEnabled = false,
  banners = [],
}: CheckoutProps) {
  const router = useRouter();
  const t = useT("booking.checkout");
  const tCommon = useT("common");
  const tSummary = useT("booking.offers.summary");
  const tDiscount = useT("discount");
  const fmt = React.useMemo(() => createFormatter(locale), [locale]);
  const uid = React.useId();

  const [step, setStep] = React.useState<Step>(1);

  const [pickupDate, setPickupDate] = React.useState("");
  const [pickupTime, setPickupTime] = React.useState("");
  const [notes, setNotes] = React.useState("");

  const [name, setName] = React.useState("");
  const [phone, setPhone] = React.useState("");
  const [sameWhatsapp, setSameWhatsapp] = React.useState(true);
  const [whatsapp, setWhatsapp] = React.useState("");

  const [plan, setPlan] = React.useState<PaymentPlan>("deposit");
  const [payment, setPayment] = React.useState<PaymentSettings>(DEFAULT_PAYMENT_SETTINGS);
  const [discount, setDiscount] = React.useState<AppliedDiscount | null>(null);

  const [errors, setErrors] = React.useState<FieldErrors>({});
  const [submitError, setSubmitError] = React.useState<string | null>(null);
  const [submitting, setSubmitting] = React.useState(false);

  const topRef = React.useRef<HTMLDivElement | null>(null);
  const minDate = React.useMemo(() => todayInputValue(), []);

  const fieldHeight = compact ? "h-11" : "h-12";
  const fieldClass = cn(
    "w-full rounded-2xl border border-input bg-background px-3 text-base outline-none transition-colors focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50",
    fieldHeight
  );

  // قواعد الدفع من الإعدادات (نسبة العربون وحده الأدنى ونص التعليمات) —
  // عند تعذّر القراءة نُبقي الافتراضيات فلا تتعطل الخطوة الثالثة أبداً.
  React.useEffect(() => {
    const controller = new AbortController();
    void (async () => {
      try {
        const res = await fetch("/api/booking/settings", { signal: controller.signal });
        const json: unknown = await res.json();
        if (json && typeof json === "object" && (json as { ok?: unknown }).ok === true) {
          setPayment(readPaymentSettings({ payment: json }));
        }
      } catch {
        // تبقى الافتراضيات
      }
    })();
    return () => controller.abort();
  }, []);

  // كل انتقال خطوة يعيد الزائر إلى رأس النموذج (مهم على الجوال)
  React.useEffect(() => {
    if (!topRef.current) return;
    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    topRef.current.scrollIntoView({
      behavior: reduceMotion ? "auto" : "smooth",
      block: "nearest",
    });
  }, [step]);

  /** موعد الانطلاق: من الحاسبة حين جمعته (ذهاب وعودة)، وإلا من حقلَي هذه الخطوة */
  const scheduledPickup = trip.pickupAt ?? null;
  const pickupIso = scheduledPickup ?? toIsoFromLocalInputs(pickupDate, pickupTime);
  const hasExtras = offer.extras.length > 0;

  // ── الإجمالي الذي تُبنى عليه معاينة العربون ────────────────────────────────
  //
  // بلا خصم: **الرقم كما جاء من `quote_public` حرفياً** (وهو أصلاً
  // `ride_total + extras_total` محسوبين في SQL) — لا جمع هنا.
  //
  // ومع خصم: `discount.totalAfter` هو **سعر الرحلة بعد الخصم** لا الإجمالي، لأن
  // `/api/discount/verify` يستدعي `quote_public` بلا خدمات، والكوبون يخصم
  // الرحلة وحدها بقرار المالك (ب). فالجمع الوحيد في هذا الملف هو ضمّ
  // `extrasTotal` إليه، وهو **معاينة** كما `splitAmounts` تماماً: الرقم المُلزِم
  // يعود من `create_booking` (‏`total = ride_total − discount + extras_total`)
  // ويظهر في صفحة متابعة الحجز وهي مصدره الوحيد.
  const effectiveTotal = discount ? discount.totalAfter + offer.extrasTotal : offer.total;
  const amounts = splitAmounts(effectiveTotal, plan, payment);
  const depositPreview = splitAmounts(effectiveTotal, "deposit", payment);

  function validateStepOne(): FieldErrors {
    const next: FieldErrors = {};
    // الموعد المُثبَّت في الحاسبة تحقّقت منه هناك، وهو معروض هنا للقراءة فقط
    if (scheduledPickup) return next;

    const iso = toIsoFromLocalInputs(pickupDate, pickupTime);
    if (!iso) {
      next.pickup = t("errors.pickupRequired", "حدد تاريخ ووقت الانطلاق.");
    } else if (new Date(iso).getTime() < Date.now()) {
      next.pickup = t("errors.pickupPast", "موعد الانطلاق يجب أن يكون في المستقبل.");
    }
    return next;
  }

  function validateStepTwo(): FieldErrors {
    const next: FieldErrors = {};
    if (name.trim().length < 3) {
      next.name = t("errors.nameTooShort", "اكتب اسمك كاملاً (٣ أحرف على الأقل).");
    }
    if (!isPhoneValid(phone)) {
      next.phone = t("errors.phoneInvalid", "اكتب رقم هاتف صحيح للتواصل معك بشأن الرحلة.");
    }
    if (!sameWhatsapp && whatsapp.trim().length > 0 && !isPhoneValid(whatsapp)) {
      next.whatsapp = t("errors.whatsappInvalid", "رقم الواتساب غير صحيح.");
    }
    return next;
  }

  function goNext() {
    const found = step === 1 ? validateStepOne() : step === 2 ? validateStepTwo() : {};
    setErrors(found);
    if (Object.keys(found).length > 0) return;
    setStep((current) => (current === 1 ? 2 : 3));
  }

  function goPrevious() {
    setErrors({});
    setSubmitError(null);
    setStep((current) => (current === 3 ? 2 : 1));
  }

  async function submit() {
    const found = { ...validateStepOne(), ...validateStepTwo() };
    setErrors(found);
    if (Object.keys(found).length > 0) {
      setStep(found.pickup ? 1 : 2);
      return;
    }

    const trimmedPhone = phone.trim();
    const secondary = sameWhatsapp ? trimmedPhone : whatsapp.trim();

    const payload: CreateBookingRequestWithExtras = {
      origin: { label: trip.originLabel, lat: trip.originLat, lng: trip.originLng },
      destination: { label: trip.destinationLabel, lat: trip.destLat, lng: trip.destLng },
      passengers: trip.passengers,
      roundTrip: trip.roundTrip,
      // الرقم الذي اشتقّته القاعدة وعُرض في السعر — و`create_booking` تشتقّه
      // ثانيةً من الموعدين وتأخذ **الأكبر**، فيتطابق المعروض والمُثبَّت.
      waitingHours: trip.waitingHours,
      classSlug: offer.classSlug,
      plan,
      customerName: name.trim(),
      customerPhone: trimmedPhone,
      customerWhatsapp: secondary.length > 0 ? secondary : null,
      pickupAt: pickupIso,
      notes: notes.trim().length > 0 ? notes.trim() : null,
      // 🔒 الرمز وحده — ولا `amount` ولا `totalAfter` ولا أي رقم من المعاينة.
      // `create_booking` تعيد الحساب بنفسها وتُجمّده في اللقطة.
      couponCode: discount ? discount.code : null,
      // 🔒 وكذلك الخدمات: **رموز وكميات فقط**، والأسعار من الكتالوج في القاعدة.
      returnAt: trip.returnAt ?? null,
      luggage: trip.luggage ?? 0,
      extras: trip.extras ?? [],
    };

    setSubmitting(true);
    setSubmitError(null);
    try {
      const res = await fetch("/api/booking", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const json = (await res.json()) as CreateBookingResponse | BookingError;

      if (!json.ok) {
        // 🔒 رفض الكوبون لحظة الحجز (نفد سقفه بين المعاينة والتأكيد، أو بلغ هذا
        // العميل سقفه الشخصي وهو ما لا تراه المعاينة لأنها بلا هاتف): نُسقط
        // الكوبون هنا وإلا أُعيد إرساله في كل محاولة تالية ففشلت جميعها حتماً.
        // إسقاطه يجعل التفصيل يعرض السعر الكامل وزرَّ التأكيد قابلاً للنجاح.
        if (json.code === "coupon-rejected") setDiscount(null);
        setSubmitError(
          json.message || t("errors.createFailed", "تعذّر إنشاء الحجز الآن. حاول مرة أخرى.")
        );
        setSubmitting(false);
        return;
      }

      // القمع في المتصفح (المرحلة ١٠): نظير `trackFunnel("booking_created")`
      // في `/api/booking`. الأرقام من رد الخادم لا من حساب هنا، و`publicToken`
      // **لا يخرج**: هو مفتاح وصول للحجز لا معرّف قياس.
      trackBrowserFunnel("booking_created", {
        reference: json.reference,
        value: json.total,
        currency: json.currency,
        classSlug: offer.classSlug,
      });

      // نُبقي حالة الإرسال قائمة أثناء التوجيه حتى لا يُرسل الطلب مرتين
      router.push(localePath(locale, `/booking/${json.publicToken}`));
    } catch {
      setSubmitError(
        t("errors.network", "تعذّر الاتصال بالخادم. تأكد من اتصالك بالإنترنت وحاول مرة أخرى.")
      );
      setSubmitting(false);
    }
  }

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting) return;
    if (step < 3) {
      goNext();
      return;
    }
    void submit();
  }

  return (
    <div ref={topRef} className="flex flex-col gap-5">
      {/* الترويسة: رجوع + عنوان */}
      <div className="flex items-center justify-between gap-3">
        <h3 className="text-lg font-bold leading-tight">{t("title", "إتمام الحجز")}</h3>
        <button
          type="button"
          onClick={onBack}
          disabled={submitting}
          className="inline-flex items-center gap-1.5 rounded-xl px-2 py-1.5 text-sm font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50 disabled:opacity-50"
        >
          <ArrowRight className="size-4" aria-hidden="true" />
          {t("backToOffers", "رجوع إلى العروض")}
        </button>
      </div>

      <StepsBar current={step} t={t} fmt={fmt} />

      {/* بانرات موضع «الحجز» — تحفيز بلا أثر على السعر */}
      <PromoBanners banners={banners} compact={compact} />

      <SummaryCard
        offer={offer}
        trip={trip}
        total={effectiveTotal}
        // السعر المشطوب هو إجمالي العرض كما جاء من `quote_public` (بلا كوبون
        // أصلاً) — لا `discount.totalBefore` الذي يخصّ الرحلة وحدها، وإلا شُطب
        // رقمٌ أقلّ من الرقم الجديد حين توجد خدمات.
        originalTotal={discount ? offer.total : null}
        t={tSummary}
        fmt={fmt}
      />

      <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-5">
        {/* ------------------------- الخطوة ١ ------------------------- */}
        {step === 1 ? (
          <div className="flex flex-col gap-4">
            <p className="flex items-center gap-2 text-sm font-semibold">
              <CalendarClock className="size-4 shrink-0 text-primary" aria-hidden="true" />
              {t("trip.heading", "موعد الانطلاق")}
            </p>

            {/*
              الموعد المُثبَّت في الحاسبة يُعرض للقراءة لا للتعديل: هو مُدخل سعري
              (منه تُشتق ساعات الانتظار)، وتعديله هنا يعني حجزاً بسعر غير الذي
              رآه العميل في البطاقة. التعديل ممكن — بالرجوع إلى العروض.
            */}
            {scheduledPickup ? (
              <dl className="flex flex-col gap-2 rounded-2xl border border-border bg-muted/40 px-4 py-3 text-sm">
                <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
                  <dt className="text-muted-foreground">{t("trip.pickupAt", "الانطلاق")}</dt>
                  <dd className="font-medium">{fmt.dateTime(scheduledPickup)}</dd>
                </div>
                {trip.returnAt ? (
                  <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
                    <dt className="text-muted-foreground">{t("trip.returnAt", "العودة")}</dt>
                    <dd className="font-medium">{fmt.dateTime(trip.returnAt)}</dd>
                  </div>
                ) : null}
                <p className="text-xs leading-6 text-muted-foreground">
                  {trip.waitingHours > 0
                    ? t(
                        "trip.scheduleNoteWaiting",
                        "العودة في نفس اليوم — انتظار {hours} محتسب في السعر أعلاه. لتعديل الموعدين ارجع إلى العروض.",
                        { hours: fmt.hours(trip.waitingHours) }
                      )
                    : t(
                        "trip.scheduleNote",
                        "الموعدان مثبَّتان في السعر أعلاه. لتعديلهما ارجع إلى العروض."
                      )}
                </p>
              </dl>
            ) : (
              <>
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="flex flex-col gap-1.5">
                    <label htmlFor={`${uid}-date`} className="text-sm font-medium">
                      {t("trip.date", "التاريخ")}
                    </label>
                    <input
                      id={`${uid}-date`}
                      type="date"
                      min={minDate}
                      value={pickupDate}
                      onChange={(event) => setPickupDate(event.target.value)}
                      aria-invalid={errors.pickup ? true : undefined}
                      aria-describedby={errors.pickup ? `${uid}-pickup-error` : undefined}
                      className={fieldClass}
                    />
                  </div>

                  <div className="flex flex-col gap-1.5">
                    <label htmlFor={`${uid}-time`} className="text-sm font-medium">
                      {t("trip.time", "الساعة")}
                    </label>
                    <input
                      id={`${uid}-time`}
                      type="time"
                      value={pickupTime}
                      onChange={(event) => setPickupTime(event.target.value)}
                      aria-invalid={errors.pickup ? true : undefined}
                      aria-describedby={errors.pickup ? `${uid}-pickup-error` : undefined}
                      className={fieldClass}
                    />
                  </div>
                </div>

                <FieldError id={`${uid}-pickup-error`} message={errors.pickup} />
              </>
            )}

            {/* الخدمات التي اختارها العميل — بأسمائها وأسعارها كما سعّرتها القاعدة */}
            {hasExtras ? (
              <ul className="flex flex-col gap-1.5 rounded-2xl border border-border bg-muted/40 px-4 py-3 text-sm">
                <li className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  {t("trip.extrasHeading", "الخدمات المختارة")}
                </li>
                {offer.extras.map((line) => (
                  <li key={line.slug} className="flex items-center justify-between gap-3">
                    <span className="text-muted-foreground">
                      {line.qty > 1 ? `${line.title} × ${fmt.digits(line.qty)}` : line.title}
                    </span>
                    <span className="font-medium">{fmt.money(line.lineTotal, offer.currency)}</span>
                  </li>
                ))}
              </ul>
            ) : null}

            <div className="flex flex-col gap-1.5">
              <label htmlFor={`${uid}-notes`} className="text-sm font-medium">
                {t("trip.notes", "ملاحظات")}{" "}
                <span className="font-normal text-muted-foreground">
                  ({tCommon("optional", "اختياري")})
                </span>
              </label>
              <textarea
                id={`${uid}-notes`}
                value={notes}
                onChange={(event) => setNotes(event.target.value)}
                rows={3}
                maxLength={1000}
                placeholder={t(
                  // الحقائب صارت حقلاً، وكرسي الأطفال صار خدمة تُسعَّر — فذكرهما
                  // هنا يدعو العميل لطلب ما لم يُحتسب في سعره.
                  "trip.notesPlaceholder",
                  "رقم الرحلة، اسم الفندق، أو أي طلب خاص…"
                )}
                className="w-full rounded-2xl border border-input bg-background px-3 py-2.5 text-base leading-7 outline-none transition-colors focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
              />
              <p className="text-xs leading-5 text-muted-foreground">
                {t("trip.notesHelp", "كل ما تكتبه هنا يصل لفريق التشغيل مع حجزك.")}
              </p>
            </div>
          </div>
        ) : null}

        {/* ------------------------- الخطوة ٢ ------------------------- */}
        {step === 2 ? (
          <div className="flex flex-col gap-4">
            <p className="flex items-center gap-2 text-sm font-semibold">
              <User className="size-4 shrink-0 text-primary" aria-hidden="true" />
              {t("customer.heading", "بيانات التواصل")}
            </p>

            <div className="flex flex-col gap-1.5">
              <label htmlFor={`${uid}-name`} className="text-sm font-medium">
                {t("customer.name", "الاسم")}
              </label>
              <input
                id={`${uid}-name`}
                type="text"
                autoComplete="name"
                value={name}
                onChange={(event) => setName(event.target.value)}
                placeholder={t("customer.namePlaceholder", "الاسم كما تحب أن يناديك به السائق")}
                aria-invalid={errors.name ? true : undefined}
                aria-describedby={errors.name ? `${uid}-name-error` : undefined}
                className={fieldClass}
              />
              <FieldError id={`${uid}-name-error`} message={errors.name} />
            </div>

            <div className="flex flex-col gap-1.5">
              <label htmlFor={`${uid}-phone`} className="text-sm font-medium">
                {t("customer.phone", "رقم الهاتف")}
              </label>
              <input
                id={`${uid}-phone`}
                type="tel"
                inputMode="tel"
                dir="ltr"
                autoComplete="tel"
                value={phone}
                onChange={(event) => setPhone(event.target.value)}
                placeholder="01xxxxxxxxx"
                aria-invalid={errors.phone ? true : undefined}
                aria-describedby={errors.phone ? `${uid}-phone-error` : undefined}
                className={cn(fieldClass, "text-start")}
              />
              <FieldError id={`${uid}-phone-error`} message={errors.phone} />
            </div>

            <div className="flex flex-col gap-2">
              <label className="flex w-fit cursor-pointer items-center gap-2 text-sm font-medium">
                <input
                  type="checkbox"
                  checked={sameWhatsapp}
                  onChange={(event) => setSameWhatsapp(event.target.checked)}
                  className="size-4 rounded border-input accent-[var(--primary)]"
                />
                {t("customer.sameWhatsapp", "رقم الواتساب نفس رقم الهاتف")}
              </label>

              {!sameWhatsapp ? (
                <div className="flex flex-col gap-1.5">
                  <label htmlFor={`${uid}-whatsapp`} className="text-sm font-medium">
                    {t("customer.whatsapp", "رقم الواتساب")}{" "}
                    <span className="font-normal text-muted-foreground">
                      ({tCommon("optional", "اختياري")})
                    </span>
                  </label>
                  <input
                    id={`${uid}-whatsapp`}
                    type="tel"
                    inputMode="tel"
                    dir="ltr"
                    value={whatsapp}
                    onChange={(event) => setWhatsapp(event.target.value)}
                    placeholder="01xxxxxxxxx"
                    aria-invalid={errors.whatsapp ? true : undefined}
                    aria-describedby={errors.whatsapp ? `${uid}-whatsapp-error` : undefined}
                    className={cn(fieldClass, "text-start")}
                  />
                  <FieldError id={`${uid}-whatsapp-error`} message={errors.whatsapp} />
                </div>
              ) : null}
            </div>
          </div>
        ) : null}

        {/* ------------------------- الخطوة ٣ ------------------------- */}
        {step === 3 ? (
          <div className="flex flex-col gap-4">
            {/*
              حقل الكوبون قبل اختيار خطة الدفع عمداً: العربون نسبة من الإجمالي،
              فتطبيق الخصم بعد اختيار الخطة يغيّر الرقم تحت يد الزائر.
              ولا يظهر الحقل أصلاً حين يكون نظام الخصومات مطفأ — لا حقلاً معطَّلاً
              يعلن عن ميزة لا تعمل.
            */}
            {discountEnabled ? (
              <CouponField
                trip={trip}
                classSlug={offer.classSlug}
                applied={discount}
                onApply={setDiscount}
                suggestedCode={banners.find((banner) => banner.couponCode)?.couponCode ?? null}
                disabled={submitting}
                compact={compact}
                locale={locale}
              />
            ) : null}

            <p className="flex items-center gap-2 text-sm font-semibold">
              <Wallet className="size-4 shrink-0 text-primary" aria-hidden="true" />
              {t("payment.heading", "كم تدفع الآن؟")}
            </p>

            <div
              role="radiogroup"
              aria-label={t("payment.groupLabel", "طريقة الدفع")}
              className="grid gap-3"
            >
              <label
                className={cn(
                  "flex cursor-pointer flex-col gap-1.5 rounded-2xl border px-4 py-3.5 transition-colors",
                  plan === "deposit"
                    ? "border-primary/50 bg-primary/5 ring-1 ring-primary/20"
                    : "border-input bg-background hover:bg-muted/50"
                )}
              >
                <span className="flex items-center justify-between gap-3">
                  <span className="flex items-center gap-2 text-sm font-semibold">
                    <input
                      type="radio"
                      name={`${uid}-plan`}
                      value="deposit"
                      checked={plan === "deposit"}
                      onChange={() => setPlan("deposit")}
                      className="size-4 accent-[var(--primary)]"
                    />
                    {t("payment.depositOption", "عربون الآن والباقي مع السائق")}
                  </span>
                  <span className="shrink-0 text-base font-extrabold">
                    {fmt.money(depositPreview.amountDue, offer.currency)}
                  </span>
                </span>
                <span className="ps-6 text-xs leading-6 text-muted-foreground">
                  {t(
                    "payment.depositNote",
                    "عربون {percent}٪ من الإجمالي (بحد أدنى {minimum}) — {remaining} تُحصَّل مع السائق.",
                    {
                      percent: fmt.digits(payment.depositPercent),
                      minimum: fmt.money(payment.depositMinAmount, offer.currency),
                      remaining: fmt.money(depositPreview.amountRemaining, offer.currency),
                    }
                  )}
                </span>
              </label>

              <label
                className={cn(
                  "flex cursor-pointer flex-col gap-1.5 rounded-2xl border px-4 py-3.5 transition-colors",
                  plan === "full"
                    ? "border-primary/50 bg-primary/5 ring-1 ring-primary/20"
                    : "border-input bg-background hover:bg-muted/50"
                )}
              >
                <span className="flex items-center justify-between gap-3">
                  <span className="flex items-center gap-2 text-sm font-semibold">
                    <input
                      type="radio"
                      name={`${uid}-plan`}
                      value="full"
                      checked={plan === "full"}
                      onChange={() => setPlan("full")}
                      className="size-4 accent-[var(--primary)]"
                    />
                    {t("payment.fullOption", "كامل المبلغ الآن")}
                  </span>
                  <span className="shrink-0 text-base font-extrabold">
                    {fmt.money(effectiveTotal, offer.currency)}
                  </span>
                </span>
                <span className="ps-6 text-xs leading-6 text-muted-foreground">
                  {t(
                    "payment.fullNote",
                    "لا يتبقى شيء يوم الرحلة — يصلك تأكيد الحجز فور مراجعة التحويل."
                  )}
                </span>
              </label>
            </div>

            {/* خلاصة المبالغ حسب الاختيار */}
            <dl className="flex flex-col gap-2 rounded-2xl border border-border bg-muted/40 px-4 py-3 text-sm">
              {/*
                تفصيل السعر بالخصم: الإجمالي قبل ← قيمة الخصم ← الإجمالي بعد.
                ثلاثتها من `apply_discount`. وحين لا خصم يبقى الصف الواحد كما كان
                حرفياً — لا صفوف صفرية تشوّش القراءة.
              */}
              {discount ? (
                <DiscountRows
                  discount={discount}
                  t={tDiscount}
                  fmt={fmt}
                  scope={hasExtras ? "ride" : "total"}
                />
              ) : (
                <div className="flex items-center justify-between gap-3">
                  <dt className="text-muted-foreground">
                    {hasExtras
                      ? t("payment.rideTotal", "سعر الرحلة")
                      : t("payment.total", "إجمالي الرحلة")}
                  </dt>
                  <dd className="font-medium">
                    {fmt.money(hasExtras ? offer.rideTotal : offer.total, offer.currency)}
                  </dd>
                </div>
              )}

              {/*
                الخدمات سطراً سطراً ثم الإجمالي — الترتيب نفسه الذي تنفّذه
                القاعدة: خصمٌ على الرحلة، ثم خدمات فوقه. عرضها داخل الخصم يوحي
                بأن الكوبون يشملها وهو لا يشملها.
              */}
              {hasExtras ? (
                <>
                  {offer.extras.map((line) => (
                    <div key={line.slug} className="flex items-center justify-between gap-3">
                      <dt className="text-muted-foreground">
                        {line.qty > 1 ? `${line.title} × ${fmt.digits(line.qty)}` : line.title}
                      </dt>
                      <dd className="font-medium">
                        {fmt.money(line.lineTotal, offer.currency)}
                      </dd>
                    </div>
                  ))}
                  <div className="flex items-center justify-between gap-3 border-t border-border pt-2">
                    <dt className="font-semibold">
                      {t("payment.grandTotal", "الإجمالي بعد الخدمات")}
                    </dt>
                    <dd className="font-bold">{fmt.money(effectiveTotal, offer.currency)}</dd>
                  </div>
                </>
              ) : null}

              <div className="flex items-center justify-between gap-3">
                <dt className="text-muted-foreground">
                  {t("payment.dueNow", "المطلوب تحويله الآن")}
                </dt>
                <dd className="font-bold">{fmt.money(amounts.amountDue, offer.currency)}</dd>
              </div>
              {amounts.amountRemaining > 0 ? (
                <div className="flex items-center justify-between gap-3">
                  <dt className="text-muted-foreground">{t("payment.remaining", "المتبقي")}</dt>
                  <dd className="font-medium">
                    {fmt.money(amounts.amountRemaining, offer.currency)}{" "}
                    <span className="text-xs font-normal text-muted-foreground">
                      {t("payment.remainingWithDriver", "تُحصَّل مع السائق")}
                    </span>
                  </dd>
                </div>
              ) : null}
            </dl>

            <p className="flex items-start gap-2 rounded-2xl border border-border bg-background px-3 py-2.5 text-xs leading-6 text-muted-foreground">
              <BadgeCheck className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden="true" />
              {t(
                "payment.afterConfirm",
                "بعد التأكيد تفتح لك صفحة الحجز بحسابات التحويل المتاحة، وترفع صورة الإيصال ليراجعه فريقنا. المبالغ النهائية تُثبَّت في تلك الصفحة."
              )}
            </p>
          </div>
        ) : null}

        {/* خطأ الإرسال */}
        {submitError ? (
          <p
            role="alert"
            className="flex items-start gap-2 rounded-2xl border border-destructive/40 bg-destructive/10 px-3 py-2.5 text-sm leading-6 text-destructive"
          >
            <TriangleAlert className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
            {submitError}
          </p>
        ) : null}

        {/* أزرار التنقل */}
        <div className="flex flex-col-reverse gap-3 sm:flex-row sm:items-center sm:justify-between">
          {step > 1 ? (
            <button
              type="button"
              onClick={goPrevious}
              disabled={submitting}
              className={cn(
                "inline-flex items-center justify-center gap-1.5 rounded-2xl border border-border bg-background px-5 text-sm font-semibold transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50 disabled:opacity-50",
                fieldHeight
              )}
            >
              <ChevronRight className="size-4" aria-hidden="true" />
              {t("actions.previous", "الخطوة السابقة")}
            </button>
          ) : (
            <span className="hidden sm:block" />
          )}

          <button
            type="submit"
            disabled={submitting}
            className={cn(
              "inline-flex flex-1 items-center justify-center gap-2 rounded-2xl bg-primary px-6 text-base font-semibold text-primary-foreground shadow-lg shadow-primary/25 transition-all hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50 disabled:pointer-events-none disabled:opacity-60 sm:flex-none",
              fieldHeight
            )}
          >
            {submitting ? (
              <>
                <LoaderCircle className="size-5 animate-spin" aria-hidden="true" />
                {t("actions.confirming", "جارٍ تأكيد الحجز…")}
              </>
            ) : step < 3 ? (
              <>
                {t("actions.next", "التالي")}
                <ChevronLeft className="size-4" aria-hidden="true" />
              </>
            ) : (
              <>
                <BadgeCheck className="size-5" aria-hidden="true" />
                {t("actions.confirm", "تأكيد الحجز")}
              </>
            )}
          </button>
        </div>
      </form>

      <span className="sr-only" role="status" aria-live="polite">
        {submitting
          ? t("actions.confirmingStatus", "جارٍ تأكيد الحجز")
          : submitError
            ? submitError
            : t("stepStatus", "الخطوة {index}", { index: fmt.digits(step) })}
      </span>
    </div>
  );
}
