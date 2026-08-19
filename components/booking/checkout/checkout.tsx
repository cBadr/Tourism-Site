"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { useTimeZone } from "next-intl";
import {
  ArrowRight,
  BadgeCheck,
  CalendarClock,
  Check,
  ChevronLeft,
  ChevronRight,
  Clock,
  LoaderCircle,
  PhoneCall,
  Plane,
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
import { DEFAULT_SITE_TIME_ZONE, timeZoneLabel } from "@/lib/site-timezone";
import { trackBrowserFunnel } from "@/lib/analytics/browser";
import type { PromoBanner } from "@/lib/discount-types";
import type { AppliedDiscount } from "@/lib/discounts/types";
import type { AppliedRedemption } from "@/lib/loyalty/types";
import { createFormatter, type LocaleFormatter } from "../format";
import { CouponField, DiscountRows } from "../coupon-field";
import { RedeemField, RedeemRows } from "../redeem-field";
import { PromoBanners } from "../promo-banner";
import type { CreateBookingRequestWithExtras, OfferWithExtras } from "../extras";
import { isAirportTrip } from "../airport";
import { RouteLine } from "../route-line";
import type { TripStop } from "../stops";
import { readPaymentSettings, splitAmounts } from "./payment";
import {
  todayInputValue,
  toIsoFromCairoInputs,
  minInputValues,
  splitLocalDateTime,
} from "./datetime";
import { previewPaymentHold } from "./hold-action";
import { previewLeadTime, previewPhoneEcho } from "./lead-time-action";
import type { LeadTime } from "./lead-time";
import type { PhoneEcho } from "./phone-echo";
import type { PaymentHold } from "./hold";

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
 *
 * ══════════════════════════════════════════════════════════════════════════
 *  المرحلة ١٢ب — النقاط: طبقةٌ **ثالثة** تحت الكوبون، بترتيبٍ لا يُقلَب
 * ══════════════════════════════════════════════════════════════════════════
 *
 * §٢ في `lib/loyalty-types.ts`:
 *
 *     سعر الرحلة − الكوبون − النقاط = سعر الرحلة بعد التنزيلات، ثم + الخدمات
 *
 * وثلاثة أشياء في هذا الملف تتبع ذلك الترتيب حرفياً: موضع اللوحة تحت حقل
 * الكوبون، وترتيب الصفوف في تفصيل السعر، و**إسقاط الاستبدال كلما تغيّر الكوبون**.
 *
 * 🔴 والأخير هو الحارس الحقيقي: **السقف واحدٌ للطبقتين مجتمعتين، لا سقفان
 * يُجمعان** (‏§١). فرقمُ نقاطٍ حُسب قبل الكوبون يصير — لحظةَ تطبيق الكوبون —
 * وعداً بخصمٍ لم تعد له مساحة. وإبقاؤه معروضاً يعني إمّا تخييب العميل عند
 * التأكيد، وإمّا (وهو الأسوأ) إجمالاً يظنّه صحيحاً وهو تحت أرضية المتعهد. ولذلك
 * يُسقَط الرقم **فوراً وفي نفس الضغطة** التي تُغيّر الكوبون، ثم تُعاد المعاينة.
 * ونيّةُ العميل («استخدم نقاطي») تنجو وتُطبَّق على الرقم الجديد — انظر
 * `../redeem-field.tsx`.
 *
 * ولا يُرسَل عند التأكيد عددُ نقاطٍ ولا مبلغ: **رايةٌ منطقية واحدة**، والقاعدة
 * تقرّر (‏**D-05**). وصاحبُ الرصيد يُشتقّ من الجلسة على الخادم لا من الجسم.
 */

/** الرحلة كما تصل من الحاسبة — بإحداثيات النقطتين (شرط بدء الحجز) */
export type CheckoutTrip = {
  originLabel: string;
  originLat: number;
  originLng: number;
  destinationLabel: string;
  destLat: number;
  destLng: number;
  /**
   * المحطات الوسطى بترتيبها — **بإحداثيات دائماً** بحكم نوع `TripStop`، فهي
   * تمرّ إلى `/api/booking` كما مرّت إلى `/api/quote` بلا فحصٍ ثانٍ. والفارغة
   * (أو الغياب) رحلةٌ بنقطتين — سلوكُ اليوم حرفياً.
   */
  stops?: TripStop[];
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
  /**
   * نظام الولاء مفعَّل — يصل من الصفحة الخادمية كنظيره أعلاه، وغيابه يعني
   * **مطفأ** فلا تُسأل خدمة المعاينة أصلاً. وهو **راية عرضٍ لا حارس**: الحارس
   * في القاعدة (‏`preview_redeem_points` و`create_booking`)، ووظيفة الراية أن
   * تمنع نداءً لا جواب له على كل فتحة للخطوة الثالثة.
   */
  loyaltyEnabled?: boolean;
  /** بانرات موضع «الحجز» — عرض فقط، بلا أثر على أي سعر */
  banners?: PromoBanner[];
};

type Step = 1 | 2 | 3;

type FieldKey = "pickup" | "name" | "phone" | "phoneConfirm" | "whatsapp";
type FieldErrors = Partial<Record<FieldKey, string>>;

const STEPS: { index: Step; key: string; title: string }[] = [
  { index: 1, key: "steps.trip", title: "بيانات الرحلة" },
  { index: 2, key: "steps.customer", title: "بياناتك" },
  { index: 3, key: "steps.payment", title: "الدفع" },
];

/**
 * أقصى ما يُعرض من الملاحظات في سطر الملخّص المطويّ.
 *
 * حقل الملاحظات يقبل ألف حرف؛ ونصٌّ بهذا الطول في سطرٍ «مطويّ» يُبطل الطيّ
 * نفسه — أي يعيد الشاشة الطويلة التي أُنشئ الطيّ ليقصّرها. والنصّ كاملاً على
 * بعد نقرة «تعديل» واحدة، ولا يُمسّ ما يُرسَل بحرف.
 */
const NOTES_PREVIEW_LENGTH = 32;

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

/**
 * ╔══════════════════════════════════════════════════════════════════════════╗
 * ║  شريطُ خطواتٍ قابل للنقر — **عنصرٌ واحد يؤدي الدورين** (ملاحظة المالك ٥)   ║
 * ╚══════════════════════════════════════════════════════════════════════════╝
 *
 * ── ما كان، ولماذا اعترض عليه المالك ───────────────────────────────────────
 *
 * كان في الشاشة **شيئان يقولان الموضع**: سطرُ تقدّمٍ («الخطوة ٢ من ٣» ومسطرةٌ
 * من ثلاث قطع)، وتحته **الخطوات المطويّة مرصوفةً تحت بعضها** — صندوقٌ مؤطَّر
 * لكل خطوة بعنوانها وقيمها وزرِّ «تعديل». ونصُّ المالك:
 *
 * > «الخطوات المطويّة تحت بعضها ⇒ شريط خطواتٍ قابل للنقر، يحلّ محلّ شريط
 * >  التقدّم. عنصرٌ واحد يؤدي الدورين، ويعيدني إلى أي مرحلة بنقرة.»
 *
 * **وهو الأصحّ**: الرصفُ كان يدفع ثمن الطيّ مرتين — ارتفاعَ صندوقٍ مؤطَّر لكل
 * خطوة، وارتفاعَ سطرِ تقدّمٍ يقول ما تقوله الصناديق. فصار **صندوقٌ واحد** فيه
 * ثلاث خلايا: الخلية تُظهر الحالة (فهي المؤشّر)، وتُظهر القيم (فهي السطر
 * المطويّ)، ويُنقر عليها (فهي التنقّل).
 *
 * ── 🔒 وثلاثة مكاسبَ من مرور الطيّ **لا تُنقَض** ───────────────────────────
 *
 * (١) **القيم في السطر لا «مكتملة»**: الخلية المطويّة تعرض ما أدخله العميل
 *     (`٢٠ سبتمبر ١٠:٠٠` · `أحمد · +20 10 …`) — وهو الدرس المدفوع في
 *     `../collapsed-step.tsx`: سطرٌ يقول «مكتملة» يُجبر على الفتح ليرى.
 * (٢) **التركيز ينتقل إلى ما فُتح**: المستدعي ينقله (‏`openedByEdit`) لأن الزرّ
 *     المضغوط لا يختفي هنا — الخلية تبقى — لكن اللوحة التي تُفتح يجب أن تُعلن
 *     نفسها لقارئ الشاشة، وهي أسفل الشريط لا عنده.
 * (٣) **الخطوات التالية لا تُهدَر**: `reached` لا يتراجع، وخليةُ خطوةٍ بُلغت
 *     تبقى قابلةً للنقر بقيمها.
 *
 * ── 🔴 والصدق في الملء كما كان حرفاً ──────────────────────────────────────
 *
 * تُملأ خليةُ ما **اكتمل** وحده (`index < current`)، والخطوةُ التي أنت فيها
 * غيرُ ممتلئة. فلا يبلغ الشريط تمامَه داخل النموذج إطلاقاً — وهو المطلوب: عند
 * الخطوة ٣ ما زال أمام العميل خطةُ الدفع، ثم **صفحة الحجز** حيث يحوّل ويرفع
 * الإيصال. وشريطٌ ممتلئ هناك يَعِد بانتهاءٍ لم يقع.
 *
 * ── والنقر مقيَّدٌ بما بُلغ ─────────────────────────────────────────────────
 *
 * خليةُ خطوةٍ لم تُبلغ **زرٌّ معطَّل**: القفز إليها كان سيتخطّى `validateStepOne`
 * و`validateStepTwo` — أي يبلغ الدفعَ بلا موعد ولا هاتف. والتقدّم يبقى بـ«التالي»
 * وحده، والشريط للرجوع والمراجعة.
 *
 * ⚠ **ولا `aria-controls`**: اللوحة المفتوحة ليست ابنةَ الخلية ولا معرّفها
 *   ثابت، ومرجعٌ إلى معرّفٍ غير موجود أسوأ من غيابه (نفس قرار `CollapsedStep`).
 *   والحالة تُنطق بـ`aria-current="step"` وبنصٍّ `sr-only` في كل خلية.
 */
function StepsBar({
  current,
  reached,
  summaries,
  onJump,
  disabled,
  t,
  fmt,
}: {
  current: Step;
  /** أبعد خطوة بلغها العميل — وما فوقها غير قابل للنقر */
  reached: Step;
  /** قيم كل خطوة بترتيب `STEPS` — تُعرض للمطويّة وحدها */
  summaries: React.ReactNode[][];
  onJump: (target: Step) => void;
  disabled: boolean;
  t: Tx;
  fmt: LocaleFormatter;
}) {
  const editLabel = t("editStep", "تعديل");

  return (
    <nav aria-label={t("stepsLabel", "خطوات الحجز")}>
      <ol className="grid overflow-hidden rounded-2xl border border-border bg-muted/30 sm:grid-cols-3">
        {STEPS.map((step, index) => {
          const isCurrent = step.index === current;
          /** اكتمل فعلاً — والحالية ليست مكتملة (انظر «الصدق في الملء») */
          const isDone = step.index < current;
          const isReached = step.index <= reached;
          const interactive = isReached && !isCurrent && !disabled;
          /**
           * القيم للمطويّة **التي بُلغت** وحدها. والشرط `isReached` ليس زينة:
           * ملخّصُ الدفع مبنيٌّ من الخطة المبدئية (`عربون` ومبلغها) فهو غير فارغ
           * أبداً — وعرضُه لخطوةٍ لم يفتحها العميل قطّ يقرأ **قراراً اتخذه** وهو
           * لم يره. والخطوة غير المبلوغة تبقى عنواناً ورقماً بلا وعد.
           */
          const parts = isCurrent || !isReached ? [] : summaries[index] ?? [];

          return (
            <li
              key={step.index}
              className={cn(
                // الفاصل منطقيٌّ لا فيزيائي: `border-s` تنقلب مع RTL وحدها
                index > 0 && "border-t border-border sm:border-t-0 sm:border-s",
                isCurrent && "bg-primary/5"
              )}
            >
              <button
                type="button"
                onClick={() => onJump(step.index)}
                disabled={!interactive}
                aria-current={isCurrent ? "step" : undefined}
                className={cn(
                  "flex h-full w-full items-start gap-2.5 px-3.5 py-3 text-start transition-colors",
                  "focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-inset focus-visible:ring-ring/50",
                  interactive
                    ? "cursor-pointer hover:bg-muted"
                    : "cursor-default disabled:pointer-events-none",
                  !isReached && "opacity-60"
                )}
              >
                <span
                  aria-hidden="true"
                  className={cn(
                    "mt-0.5 grid size-5 shrink-0 place-items-center rounded-full text-[0.7rem] font-bold leading-none",
                    isDone
                      ? "bg-primary text-primary-foreground"
                      : isCurrent
                        ? "border border-primary bg-primary/10 text-primary"
                        : "bg-border text-muted-foreground"
                  )}
                >
                  {isDone ? <Check className="size-3" /> : fmt.digits(step.index)}
                </span>

                <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                  <span className="flex items-baseline justify-between gap-2 text-xs font-medium">
                    <span
                      className={cn(
                        "min-w-0 truncate",
                        isCurrent ? "text-primary" : "text-muted-foreground"
                      )}
                    >
                      {t(step.key, step.title)}
                      {/*
                        🔴 المنطوق يتبع **المرسوم** لا الوصول — وإلا كذب أحدهما.

                        ثلاث حالات لا اثنتان: خطوةٌ **قبل** موضعك اكتملت فعلاً،
                        وخطوةٌ **بعده** بلغها العميل ثم رجع **أُدخلت ولم تكتمل**.
                        والفرق ليس تدقيقاً لغوياً: من فتح «الدفع» ثم رجع إلى
                        «بيانات الرحلة» كان قارئ الشاشة سيسمع «الدفع — مكتملة»
                        **ولم يُدفع شيء**، وهي بعينها الكذبة التي تمنعها قاعدة
                        الملء (‏`isDone`) في الرسم. فالنصّ يُقاس بمقياسها.
                      */}
                      <span className="sr-only">
                        {" — "}
                        {isCurrent
                          ? t("stepCurrent", "الخطوة الحالية")
                          : isDone
                            ? t("stepDone", "مكتملة")
                            : isReached
                              ? t("stepFilled", "سبق إدخالها")
                              : t("stepPending", "لم تصل إليها بعد")}
                      </span>
                    </span>
                    {interactive ? (
                      <span className="shrink-0 text-xs font-semibold text-primary">
                        {editLabel}
                      </span>
                    ) : null}
                  </span>

                  {/*
                    سطران على الأكثر — **حدُّ ارتفاعٍ لا حذفُ قيمة** (نفس تعليل
                    `CollapsedStep`): القيمة كاملةً على بعد نقرةٍ واحدة، وبطاقةُ
                    الملخّص أعلاه تحمل المسار كاملاً.
                  */}
                  {parts.length > 0 ? (
                    <span className="line-clamp-2 text-sm font-medium leading-6 text-foreground">
                      {parts.map((part, partIndex) => (
                        <React.Fragment key={partIndex}>
                          {partIndex > 0 ? (
                            <span className="text-muted-foreground"> · </span>
                          ) : null}
                          {part}
                        </React.Fragment>
                      ))}
                    </span>
                  ) : null}
                </span>
              </button>
            </li>
          );
        })}
      </ol>
    </nav>
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
      {/*
        🔴 **المسارُ كاملاً بمحطاته في آخر شاشةٍ قبل الدفع.** بطاقةُ الملخّص هذه
        هي ما يراه العميل وهو يكتب اسمه ورقمه — وهي البديل الوحيد عن سطرِ
        «تعديل» الذي أُسقط فوق هذا المسار بقصد. فإن غابت منها المحطات صار آخرُ
        ما يقرؤه قبل أن يدفع **وصفاً لرحلةٍ أقصر من التي سيحصل عليها**.
      */}
      <RouteLine
        className="text-sm font-medium"
        icon={<Route className="size-4 shrink-0 text-primary" aria-hidden="true" />}
        originLabel={trip.originLabel}
        destLabel={trip.destinationLabel}
        stops={trip.stops ?? []}
      />
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
  loyaltyEnabled = false,
  banners = [],
}: CheckoutProps) {
  const router = useRouter();
  const t = useT("booking.checkout");
  const tCommon = useT("common");
  const tSummary = useT("booking.offers.summary");
  const tDiscount = useT("discount");
  const tLoyalty = useT("loyalty");
  const fmt = React.useMemo(() => createFormatter(locale), [locale]);
  /**
   * منطقة الموقع من next-intl — **نفس القيمة** التي قرأها `i18n/request.ts`
   * من `public.site_time_zone()`، لا مسارٌ ثانٍ. الدوال الصرفة في `datetime.ts`
   * تقرأ الوحدة المشتركة التي يملؤها `SiteTimeZoneSync` من هنا نفسه.
   */
  const activeTimeZone = useTimeZone() ?? DEFAULT_SITE_TIME_ZONE;
  const uid = React.useId();

  const [step, setStep] = React.useState<Step>(1);
  /**
   * أبعد خطوة بلغها العميل — و**كل خطوة حتى هذه تبقى على الشاشة**: المفتوحة
   * هي `step`، وما عداها سطرُ ملخّصٍ قابلٌ للنقر.
   *
   * 🔴 ولولاها لكان «تعديل» على الخطوة الأولى **يمحو الخطوتين بعدها من الشاشة**
   * (المؤشّر الواحد لا يعرف إلا موضعه)، فيظنّ العميل أن ما ملأه ضاع. والقيم
   * نفسها لم تكن لتضيع — حالتها في هذا المكوّن لا في الشجرة — لكن **الاختفاء
   * وحده يقرأه العميل ضياعاً**، فيعيد إدخال ما لم يُفقد.
   */
  const [reached, setReached] = React.useState<Step>(1);

  /**
   * 🔴 موعد الانطلاق **حقلٌ واحد** (`datetime-local`) — ملاحظة المالك ٢.
   *
   * كان حقلَين («التاريخ» و«الساعة»)، ودُمجا في الحاسبة وحدها فبقي مسارُ الحجز
   * — وهو الفرع الذي يراه صاحبُ الرحلة باتجاه واحد — على أربع لمسات لموعدٍ واحد.
   * والمالك رآه على الحاسوب فسأل عن التفاوت، **وهو تفاوتٌ لا قرار**.
   *
   * 🔒 **وهو دمجٌ بصري لا تبديلُ منطق** — والأربعة التي فرضها الدمج الأول تبقى:
   *   • **منطقة الموقع**: القيمة تُشطر بـ`splitLocalDateTime` وتمضي إلى
   *     `toIsoFromCairoInputs` **نفسها** — لا `new Date(value)` هنا بحال، وهي
   *     التي تقرأ `siteTimeZone()` (‏D-59) لا القاهرة محفورةً.
   *   • **أرضية المهلة**: `pickupMin` من `booking_min_pickup_at()` وحدها.
   *   • **الأرقام العربية**: سطرُ الصدى أسفل الحقل من `fmt.dateTime` — ومنتقي
   *     المتصفح يرسم بلغة الجهاز، فالصدى هو ما يُقرأ فعلاً.
   *   • **العودة بعد الذهاب**: لا موعد عودة في هذا الفرع أصلاً (الاتجاه الواحد)،
   *     وحارسُ الترتيب في الحاسبة حيث يُجمع الموعدان — لم يُمسّ.
   */
  const [pickupLocal, setPickupLocal] = React.useState("");
  const [notes, setNotes] = React.useState("");

  const [name, setName] = React.useState("");
  const [phone, setPhone] = React.useState("");
  /**
   * 🔴 ملاحظة المالك ٤ — **رقم الواتساب يخالف الهاتف**، رايةٌ يرفعها العميل
   * بإزالة علامة الصندوق الواحد. وكانت `sameWhatsapp` مبدوءةً بـ`true`، وهذه
   * مبدوءةٌ بـ`false` — **نفس المعنى بالنفي**، فالحمولة لا تتغيّر بحرف
   * (‏`secondary` أدناه).
   */
  const [whatsappSeparate, setWhatsappSeparate] = React.useState(false);
  const [whatsapp, setWhatsapp] = React.useState("");
  /** ج‑٣ — رقم الرحلة الجوية، ولا يُجمع إلا في الرحلة المطارية */
  const [flightNumber, setFlightNumber] = React.useState("");

  /**
   * أ‑١ — الرقم كما فهمه النظام، والشكل المعياري الذي أقرّه العميل.
   *
   * 🔒 **حالتان لا واحدة، والفصل بينهما هو الميزة كلها.** `echo` هو ما تقوله
   * القاعدة عن النص المكتوب الآن؛ و`ackedNormalized` هو الشكل المعياري الذي
   * ضغط العميل على إقراره. وما دام الإقرار مخزَّناً **بقيمة الرقم لا برايةٍ
   * منطقية**، فأي تعديل يغيّر الرقم يُسقطه بنيوياً — بلا `useEffect` يتذكّر أن
   * يُصفّره، وبلا احتمال أن ينجو إقرارٌ لرقمٍ لم يعد مكتوباً.
   *
   * ⚠ وتعديلٌ لا يغيّر الشكل المعياري (‏`0101 000 0506` ⇐ `+20 101 000 0506`)
   * **لا يُسقط الإقرار** — وهو الصواب: العميل أقرّ الرقم لا نصّه.
   */
  const [echoState, setEchoState] = React.useState<(PhoneEcho & { forPhone: string }) | null>(
    null
  );
  const [ackedNormalized, setAckedNormalized] = React.useState<string | null>(null);

  const [plan, setPlan] = React.useState<PaymentPlan>("deposit");
  const [payment, setPayment] = React.useState<PaymentSettings>(DEFAULT_PAYMENT_SETTINGS);
  const [discount, setDiscount] = React.useState<AppliedDiscount | null>(null);
  const [redemption, setRedemption] = React.useState<AppliedRedemption | null>(null);

  const [errors, setErrors] = React.useState<FieldErrors>({});
  const [submitError, setSubmitError] = React.useState<string | null>(null);
  const [submitting, setSubmitting] = React.useState(false);
  const [hold, setHold] = React.useState<PaymentHold | null>(null);
  const [lead, setLead] = React.useState<LeadTime | null>(null);

  const topRef = React.useRef<HTMLDivElement | null>(null);
  /** اللوحة المفتوحة الآن — مرجعٌ واحد لأن واحدةً فقط تُصيَّر في كل لحظة */
  const stepPanelRef = React.useRef<HTMLDivElement | null>(null);
  /**
   * «هذا الانتقال جاء من زرّ تعديل» — رايةٌ تعيش لحظةً واحدة بين معالج الحدث
   * وأثر التمرير. ومرجعٌ لا حالة: لا تُرسم على الشاشة، فحالةٌ لها تصييرٌ زائد.
   */
  const openedByEdit = React.useRef(false);
  const todayValue = React.useMemo(() => todayInputValue(), []);

  /**
   * أ‑٢ — أرضية المنتقي من `booking_min_pickup_at()` وحدها، وبلا معادلة هنا.
   *
   * تُقرأ عند تركيب المسار (والموعد يُختار في الخطوة الأولى، فهي أبكر لحظة
   * ينفع فيها الجواب)، وتُقرأ ثانيةً كلما عاد العميل إلى الخطوة الأولى — لأن
   * «الآن» يزحف: من يفتح النموذج ثم يتركه نصف ساعة كانت أرضيته القديمة تسمح
   * بموعدٍ صار محظوراً.
   *
   * 🔒 والفشل يعيد `null` فتبقى الأرضية كما كانت (اليوم فقط) — والحارس في
   * القاعدة هو الذي يمنع، لا هذه القراءة.
   */
  React.useEffect(() => {
    if (step !== 1) return;
    let alive = true;
    void previewLeadTime()
      .then((result) => {
        if (alive) setLead(result);
      })
      .catch(() => {
        // الصمت الآمن: تبقى الأرضية بلا تشديد، والقاعدة ترفض ما لا يجوز
      });
    return () => {
      alive = false;
    };
  }, [step]);

  const leadFloor = lead?.enabled ? minInputValues(lead.minPickupAt) : null;
  /**
   * أرضية الحقل الواحد — **لحظةٌ واحدة** بدل «تاريخٌ ثم ساعةٌ مشروطة بيومه».
   *
   * وهي المكسب الصامت للدمج، ونصُّه في `search-widget.tsx` حرفياً: الحقلان
   * المنفصلان كانا يفرضان الساعة **في يوم الأرضية وحده** (‏`pickupDate ===
   * leadFloor.date`) لأن `<input type="time">` لا يعرف أي يومٍ اختير — فمن
   * اختار الغد كان منتقي الساعة عنده بلا حدٍّ أصلاً. أما الحقل الواحد فيقارن
   * اللحظة باللحظة.
   *
   * 🔒 والمصدر واحدٌ كما كان: `minInputValues(lead.minPickupAt)` — أي
   * `booking_min_pickup_at()` نفسها التي يفرضها `create_booking`، مقرَّبةً
   * لأعلى إلى الدقيقة. **ولا معادلة مهلةٍ تُحسب في المتصفح** (النمط ٨).
   */
  const pickupMin = leadFloor
    ? `${leadFloor.date}T${leadFloor.time}`
    : `${todayValue}T00:00`;

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

  /**
   * التمرير بعد تبدّل الخطوة — **وجهتان لا واحدة**.
   *
   * (أ) «التالي» و«السابق»: رأس النموذج، كما كان (مهم على الجوال).
   *
   * (ب) 🔴 **«تعديل»: اللوحة نفسها، حيث كان العميل ينظر.** أمرُ المالك حرفياً:
   *     «تعيده إلى حيث كان، لا إلى رأس النموذج». ومن ضغط «تعديل» على سطرٍ في
   *     منتصف الشاشة ثم قفزت به الصفحة إلى أعلاها يفقد موضعه مرتين: مرةً حين
   *     يبحث عن الحقل، ومرةً حين يعود.
   *
   * 🔒 **والتركيز قبل التمرير وبـ`preventScroll`.** الزرّ الذي ضُغط اختفى من
   *    الشجرة (‏صار لوحةً)، فبلا نقلٍ صريح يقذف المتصفح التركيز إلى `<body>`
   *    ويستأنف صاحب لوحة المفاتيح من أول الصفحة — وهو **بعينه** العطل الموثّق
   *    في `footer-accordion.tsx`. و`preventScroll` كي لا يتنازع تمريران.
   */
  React.useEffect(() => {
    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const behavior: ScrollBehavior = reduceMotion ? "auto" : "smooth";

    if (openedByEdit.current) {
      openedByEdit.current = false;
      const panel = stepPanelRef.current;
      if (!panel) return;
      panel.focus({ preventScroll: true });
      panel.scrollIntoView({ behavior, block: "nearest" });
      return;
    }

    if (!topRef.current) return;
    topRef.current.scrollIntoView({ behavior, block: "nearest" });
  }, [step]);

  /**
   * موعد الانطلاق: من الحاسبة حين جمعته (ذهاب وعودة)، وإلا من حقل هذه الخطوة.
   *
   * 🔒 والشطر ثم `toIsoFromCairoInputs` — **نفس المسار ونفس المُدخلين** اللذين
   * كان يتلقّاهما من الحقلين المنفصلين، فالناتج ISO لا يتغيّر بحرف.
   */
  const scheduledPickup = trip.pickupAt ?? null;
  const [pickupDate, pickupTime] = splitLocalDateTime(pickupLocal);
  const pickupIso = scheduledPickup ?? toIsoFromCairoInputs(pickupDate, pickupTime);
  const hasExtras = offer.extras.length > 0;

  /**
   * مهلة حفظ الحجز — تُقرأ **على الخادم** حين تُفتح خطوة الدفع، لا قبلها.
   *
   * ولماذا هنا لا في أعلى الحاسبة: المعادلة تعتمد على **موعد الانطلاق**
   * (‏`booking_hold_until` تأخذ الأبعد من «الآن + المهلة» و«الموعد − المهلة»)،
   * والموعد لا يستقرّ إلا بعد اجتياز الخطوة الأولى. وسؤالُ الخادم قبل ذلك يعني
   * جواباً عن موعدٍ لم يُختر بعد.
   *
   * 🔒 ولا حساب في المتصفح: النتيجة **تاريخٌ جاهز** من الدالة نفسها التي ينادي
   * بها الكنس. وتعذّر القراءة يعني `null` ⇒ لا سطر — لا تاريخاً مخمَّناً.
   */
  React.useEffect(() => {
    if (step !== 3 || !pickupIso) return;

    let alive = true;
    void previewPaymentHold(pickupIso)
      .then((result) => {
        if (alive) setHold(result);
      })
      .catch(() => {
        // الصمت الآمن: تبقى الخطوة كما كانت بلا سطر مهلة
      });

    return () => {
      alive = false;
    };
  }, [step, pickupIso]);

  const holdUntilLabel = hold?.enabled ? fmt.dateTime(hold.holdUntil) : null;

  /* ---------------------------------------------------------------- */
  /* أ‑١ — الهاتف كما فهمه النظام                                       */
  /* ---------------------------------------------------------------- */

  /**
   * يُسأل الخادم عن الشكل المعياري بعد أن يهدأ الكتابة (‏٤٠٠ ملّي ثانية).
   *
   * ── لماذا الخادم أصلاً ───────────────────────────────────────────────────
   * لأن المرجع الوحيد للتطبيع دالةُ `normalize_phone` في القاعدة (‏`0026`)،
   * وعليها يُبنى `bookings.phone_norm` المولَّد وكل مطابقة عميل. وتطبيعٌ
   * «مكافئ» في المتصفح يعني رقماً بمصدرين ينحرفان (النمط ٨) — أي أن نعرض على
   * العميل رقماً غير الذي ستخزّنه القاعدة، فتصير شاشةُ التأكيد نفسها كذبة.
   * والدالة **غير ممنوحة لـ`anon`** بقرارٍ محروسٍ بفحصٍ في `0026`، فالمسار
   * إجراءٌ خادمي بمفتاح الخدمة (`./phone-echo.ts`).
   *
   * ── والاحتكاك مقيس ──────────────────────────────────────────────────────
   * لا يُسأل الخادم عن كل ضغطة زر: `isPhoneValid` تحرس أولاً فلا يخرج نداء
   * لنصٍّ ناقص، والتهدئة تجعل الكتابة المتصلة نداءً واحداً. ونداءٌ لا يعود
   * (شبكة · بيئة غير مهيّأة) يترك `echo` فارغاً — وحينها **لا يُطلب إقرار
   * أصلاً**: لا نمنع حجزاً لأن قراءةً تعذّرت.
   */
  const trimmedPhoneValue = phone.trim();

  React.useEffect(() => {
    const value = phone.trim();
    if (step !== 2 || !isPhoneValid(value)) return;

    let alive = true;
    const timer = window.setTimeout(() => {
      void previewPhoneEcho(value)
        .then((result) => {
          // 🔒 يُخزَّن **موسوماً بالنصّ الذي يصفه**، ولا يُمسح شيء هنا: المسح
          //    داخل التأثير كان يُطلق تصييراً متتالياً (‏`set-state-in-effect`)،
          //    والوسم يجعل قِدَم الجواب حالةً **مستحيلة العرض** لا حالةً
          //    تحتاج من يتذكّر تنظيفها. وهو نمط `quotedInputsKey` نفسه في
          //    `search-widget.tsx`.
          //
          // 🔴 **والجواب الفارغ يُخزَّن كذلك** — ولم يكن (ملاحظة المالك ٤).
          //    كان الشرط `result.display !== null` يُهمل «لا صدى»، فلا تعرف
          //    الشاشة الفرقَ بين «الجواب في الطريق» و«لا جواب لهذا الرقم». وقد
          //    صار الفرق لازماً: صندوق التأكيد يحمل الآن **مفتاح الواتساب**
          //    معه، ومفتاحٌ يظهر مؤشَّراً ثم يقلب نفسه حين يصل الصدى **يبدّل
          //    قراراً تحت يد العميل**. فالصندوق لا يُصيَّر إلا وقد استقرّ
          //    الجواب — إيجاباً أو نفياً — و`display === null` تبقى تعني
          //    «لا رقم يُعرض ولا إقرار يُطلب» كما كانت حرفياً.
          if (alive) setEchoState({ ...result, forPhone: value });
        })
        .catch(() => {
          // تعذّر النداء = لا صدى لهذا الرقم بعينه. ويُوسم كذلك حتى لا يبقى
          // الصندوق منتظراً جواباً لن يأتي فيُحتجَز مفتاح الواتساب معه.
          if (alive) setEchoState({ normalized: null, display: null, forPhone: value });
        });
    }, 400);

    return () => {
      alive = false;
      window.clearTimeout(timer);
    };
  }, [phone, step]);

  /**
   * الجواب الذي يصف **الرقم المكتوب الآن** وحده. وأي جوابٍ لرقمٍ سابق يسقط
   * بالمقارنة لا بمسحٍ مؤجَّل — فلا توجد تصييرة يظهر فيها رقمٌ لا يطابق الحقل.
   */
  const echo = echoState !== null && echoState.forPhone === trimmedPhoneValue ? echoState : null;

  /** استقرّ جوابٌ لهذا الرقم — إيجاباً أو نفياً. وشرطُ تصيير الصندوق. */
  const echoSettled = echo !== null;
  /** ثمة رقمٌ مفهوم يُعرض ⇒ ثمة ما يُقرّ به */
  const echoReady = echoSettled && echo.display !== null && echo.normalized !== null;
  /**
   * 🔒 المقارنة بالشكل **المعياري** لا بنصّ الحقل: العميل أقرّ رقماً لا كتابةً.
   * فمن أقرّ `01010000506` ثم أعاد كتابته `+20 101 000 0506` لا يُسأل ثانيةً،
   * ومن قلب خانةً واحدة يُسأل — وهو بالضبط الحدث الذي وُجدت الميزة لأجله.
   */
  const phoneAcked = echoReady && ackedNormalized === echo?.normalized;

  /* ---------------------------------------------------------------- */
  /* 🔴 ملاحظة المالك ٤ — صندوقٌ واحد لمعنيَين، بلا قدرةٍ تُفقد          */
  /* ---------------------------------------------------------------- */

  /**
   * كان في الشاشة **تأكيدان لشيءٍ واحد** متجاورَين:
   *   «نعم، هذا رقمي وأستقبل عليه المكالمات والرسائل» (أضافته أ‑١)
   *   «رقم الواتساب نفس رقم الهاتف»                    (كان قائماً قبلها)
   *
   * ⚠ **والقديم لم يكن تأكيداً فقط بل يضبط رقم الواتساب** — فحذفُه ساذجاً إمّا
   * يجعل الواتساب = الهاتف دائماً (فيفقد من له رقمٌ آخر ذكرَه) أو يُظهر حقلاً
   * دائماً (عكس المطلوب). **وقرار المالك: يُدمجان في صندوقٍ واحد**، وإزالةُ
   * علامته تُظهر حقل الواتساب. نقرةٌ للأغلبية، وحقلٌ لمن يحتاجه.
   *
   * ── الحالات الثلاث، ولماذا ليست حالتين ─────────────────────────────────
   * | الصندوق | `whatsappSeparate` | الحقل | المعنى |
   * |---|---|---|---|
   * | لم يُلمس | `false` | مخفي | لم يُقرّ بعد — والحقل **لا يظهر** |
   * | مؤشَّر | `false` | مخفي | أقرّ، والواتساب على الهاتف نفسه |
   * | أُزيلت علامته | `true` | ظاهر | واتسابه رقمٌ آخر يكتبه |
   *
   * فالراية هي التي تفرّق «لم يُجب» من «قال لا» — ولولاها لظهر الحقل من أول
   * تصييرة، وهو بالضبط ما رفضه المالك.
   *
   * ── 🔒 والإقرار يُستوفى بأحد فعلَين، لا بواحد ───────────────────────────
   * من أزال العلامة **لا يمكن أن يؤشّرها** ليقرّ (فهي نفسها مفتاح الحقل)، فلو
   * بقي الإقرار مشروطاً بالتأشير وحده صار طريقاً مسدوداً: يرى الخطأ ولا يجد
   * فعلاً يرفعه. **فكتابةُ رقم واتسابٍ صحيح إقرارٌ كذلك** — ومبرَّرة: من أزال
   * العلامة قرأ الرقم المعروض أمامه ثم قال «واتسابي غيره»، وهو نظرٌ في الرقم
   * لا تمريرٌ عليه، وهو غرض أ‑١ كلّه.
   */
  const phoneConfirmed =
    !echoReady || phoneAcked || (whatsappSeparate && isPhoneValid(whatsapp));

  /* ---------------------------------------------------------------- */
  /* ج‑٣ — رحلة مطار؟                                                   */
  /* ---------------------------------------------------------------- */

  /**
   * مشتقٌّ من **وسمَي المكانين** — الإشارة الوحيدة القائمة في البيانات (لا
   * جدول خدمات في هذا المنتج، وتصنيف Nominatim غير ملتقَط). التفصيل الكامل
   * وما لم يُفعل عن قصد في ترويسة `../airport.ts`.
   */
  const airportTrip = isAirportTrip(trip.originLabel, trip.destinationLabel);

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
  //
  // ومع نقاط: `redemption.rideAfter` هو سعر الرحلة **بعد الكوبون وبعد النقاط
  // معاً** — تحسبه القاعدة في نداءٍ واحد يعرف الرمز المطبَّق (‏§١: سقفٌ واحد
  // للطبقتين). فلا يُطرح هنا `worth` من `totalAfter`: طرحٌ في المتصفح يعني
  // رقماً ثانياً لسعر الرحلة لا يطابق ما تُثبّته `create_booking`.
  const rideAfterAll = redemption
    ? redemption.rideAfter
    : discount
      ? discount.totalAfter
      : null;
  const effectiveTotal =
    rideAfterAll !== null ? rideAfterAll + offer.extrasTotal : offer.total;
  const discounted = discount !== null || redemption !== null;
  const amounts = splitAmounts(effectiveTotal, plan, payment);
  const depositPreview = splitAmounts(effectiveTotal, "deposit", payment);

  /**
   * 🔒 تغيّر الكوبون ⇒ **يسقط رقم النقاط في الحال**.
   *
   * السقف مشترك (‏§١)، فرقمٌ حُسب على سقفٍ قبل الكوبون يصير كذبةً في اللحظة التي
   * يُطبَّق فيها الكوبون — لا بعد المعاينة التالية. وإسقاطه هنا لا هناك يعني أنه
   * لا توجد **أي** تصييرة يظهر فيها إجماليٌّ مبنيّ على طبقتين حُسبتا على سقفين.
   * واللوحة تُعيد السؤال فوراً وتُطبّق نيّة العميل على الجواب الجديد.
   */
  function applyDiscount(next: AppliedDiscount | null) {
    setDiscount(next);
    setRedemption(null);
  }

  function validateStepOne(): FieldErrors {
    const next: FieldErrors = {};

    /**
     * ⚠ الموعد المُثبَّت في الحاسبة (ذهاب وعودة) **لا يُعفى من فحص المهلة**.
     *
     * كان هذا الفرع يخرج فوراً لأن الحاسبة تحقّقت من الموعد هناك — وهو صحيح
     * لكل ما لا يتحرّك. أما أدنى المهلة فأرضيتها **تزحف مع الساعة**: من طلب
     * السعر لرحلة بعد ساعتين ثم تمهّل في ملء النموذج يعبر إلى الدفع بموعدٍ
     * صار محظوراً، فيرتدّ من القاعدة بعد أن ملأ كل شيء. فالفحص يقع هنا كذلك،
     * ورسالته تدلّه على الطريق الوحيد المفتوح له: الرجوع إلى العروض — لأن
     * الموعد **مُدخل سعري** لا يجوز تعديله بعد عرض السعر.
     */
    if (scheduledPickup) {
      if (lead?.enabled && lead.minPickupAt !== null) {
        const floor = Date.parse(lead.minPickupAt);
        if (
          Number.isFinite(floor) &&
          new Date(scheduledPickup).getTime() < floor
        ) {
          next.pickup = t(
            "errors.scheduledTooSoon",
            "موعد الانطلاق الذي اخترته صار أقرب من مهلة التجهيز ({minutes} دقيقة). ارجع إلى العروض واختر موعداً بعد {value}.",
            {
              minutes: fmt.digits(lead.leadMinutes),
              value: fmt.dateTime(lead.minPickupAt) ?? "",
            }
          );
        }
      }
      return next;
    }

    const iso = toIsoFromCairoInputs(pickupDate, pickupTime);
    if (!iso) {
      next.pickup = t("errors.pickupRequired", "حدد تاريخ ووقت الانطلاق.");
      // مقارنة **لحظتين مطلقتين** لا ساعتَي حائط: `iso` صار موعد القاهرة
      // محوَّلاً إلى UTC، و`Date.now()` لحظة مطلقة أصلاً — فالمقارنة صحيحة
      // أياً كانت منطقة الجهاز، ولا يجوز إقحام أي تحويل ثانٍ عليها.
    } else if (new Date(iso).getTime() < Date.now()) {
      next.pickup = t("errors.pickupPast", "موعد الانطلاق يجب أن يكون في المستقبل.");
      /**
       * أ‑٢ — أدنى مهلة. الحدّ المقارَن به هو **ما أرجعته القاعدة**
       * (`booking_min_pickup_at()`) لا حاصلَ ضربٍ يُحسب هنا، فلا يفترق ما
       * تمنعه الشاشة عمّا يرفضه `create_booking`.
       *
       * ⚠ وهذه **طبقةٌ ثانية لا الحارس**: منتقيا التاريخ والساعة يمنعان
       * الاختيار أصلاً، لكن `min` في المتصفح تلميحٌ يُتجاوَز بالكتابة اليدوية
       * وبمن يترك النموذج مفتوحاً حتى يزحف «الآن» على اختياره. والحارس
       * الحقيقي في SQL (`hint='lead-time'`)، وما هنا يوفّر رحلةَ شبكة.
       */
    } else if (lead?.enabled && lead.minPickupAt !== null) {
      const floor = Date.parse(lead.minPickupAt);
      if (Number.isFinite(floor) && new Date(iso).getTime() < floor) {
        next.pickup = t(
          "errors.pickupTooSoon",
          "نحتاج مهلة {minutes} دقيقة على الأقل قبل الانطلاق — أقرب موعد متاح {value}.",
          { minutes: fmt.digits(lead.leadMinutes), value: fmt.dateTime(lead.minPickupAt) ?? "" }
        );
      }
    }
    return next;
  }

  function validateStepTwo(): FieldErrors {
    const next: FieldErrors = {};
    if (name.trim().length < 3) {
      next.name = t("errors.nameTooShort", "اكتب اسمك كاملاً (٣ أحرف على الأقل).");
    }
    /**
     * رقم واتسابٍ مكتوبٌ خطأً — و**خطؤه وحده يُعرض**، لا هو وطلبُ الإقرار معه:
     * كتابةُ رقمٍ صحيح هي الإقرار في هذا الفرع (‏`phoneConfirmed`)، فرقمٌ فاسد
     * يُنتج رسالتين لعطلٍ واحد وحقلين مُحمَّرَين وعلاجٌ واحد.
     */
    const whatsappTyped = whatsappSeparate && whatsapp.trim().length > 0;
    if (whatsappTyped && !isPhoneValid(whatsapp)) {
      next.whatsapp = t("errors.whatsappInvalid", "رقم الواتساب غير صحيح.");
    }

    if (!isPhoneValid(phone)) {
      next.phone = t("errors.phoneInvalid", "اكتب رقم هاتف صحيح للتواصل معك بشأن الرحلة.");
    } else if (!phoneConfirmed && !whatsappTyped) {
      /**
       * 🔒 أ‑١ — الإقرار **لا يُطلب إلا حين يوجد ما يُقرّ به**.
       *
       * `echoReady` شرطُ المطالبة (وهو داخل `phoneConfirmed`): بلا جوابٍ من
       * الخادم (شبكة · بيئة غير مهيّأة · هجرة ناقصة) لا يُعرض رقم ولا يُطلب
       * إقرار — فلا يُحبس عميلٌ خلف قراءةٍ تعذّرت. أما حين يُعرض الرقم فالإقرار
       * **إلزامي**: أن يُعرض ثم يُمرَّر بلا نظر يعيدنا إلى ما قبل الميزة بالضبط.
       *
       * ⚠ والرسالة تسمّي **المخرجَين** بعد الدمج (ملاحظة ٤): التأشير، أو كتابةُ
       * رقم واتسابٍ صحيح. ورسالةٌ تطلب تأشيراً وحده تصير نصيحةً مسدودة لمن
       * أزال العلامة عن قصد.
       */
      next.phoneConfirm = t(
        "errors.phoneUnconfirmed",
        "أكّد أن رقم هاتفك مكتوب صحيحاً — أو أزل العلامة واكتب رقم الواتساب."
      );
    }
    return next;
  }

  /* ---------------------------------------------------------------- */
  /* 🔴 ملاحظة المالك ٣ — الخطأ يزول بأول لمسةٍ للحقل، لا عند الإرسال   */
  /* ---------------------------------------------------------------- */

  /**
   * > «رسالة الخطأ لا تختفي عند إعادة الإدخال.»
   *
   * وكان محلّها الوحيد `setErrors(found)` في `goNext` و`submit` — أي أن العميل
   * يُصحّح الحقل ثم **يبقى الخطأ الأحمر تحته** حتى يضغط «التالي» ثانيةً. فيقرأ
   * أن تصحيحه لم يُقبل، وأكثرُ ما يفعله عندها أن يعيد الكتابة مرةً ثالثة.
   *
   * 🔧 **ويُرجَع نفسُ الكائن حين لا شيء يُمحى** — وهو ليس تحسيناً بل شرطُ صحة:
   * هذه الدالة تُنادى في `onChange` أي **مع كل ضغطة مفتاح**، وكائنٌ جديد في كل
   * مرة يُعيد تصيير الشجرة كلها بلا تغيّر ظاهر. و`===` يجعل React تتخطّاه.
   *
   * ⚠ ولا يُمحى الخطأ في التصيير ولا في تأثير: **معالج الحدث** هو موضع القرار،
   *   ومسحٌ في تأثيرٍ يعتمد على القيمة كان سيمحو خطأً وُلد لتوّه من `submit`.
   */
  function clearFieldError(...keys: FieldKey[]) {
    setErrors((current) => {
      if (keys.every((key) => current[key] === undefined)) return current;
      const next = { ...current };
      for (const key of keys) delete next[key];
      return next;
    });
  }

  function goNext() {
    const found = step === 1 ? validateStepOne() : step === 2 ? validateStepTwo() : {};
    setErrors(found);
    if (Object.keys(found).length > 0) return;
    const next: Step = step === 1 ? 2 : 3;
    setStep(next);
    // أبعدُ ما بُلغ لا يتراجع — سطور الملخّص أسفلَه تبقى معروضة عند العودة
    setReached((current) => (next > current ? next : current));
  }

  function goPrevious() {
    setErrors({});
    setSubmitError(null);
    setStep((current) => (current === 3 ? 2 : 1));
  }

  /**
   * فتح خطوةٍ مطويّة من سطر ملخّصها.
   *
   * ⚠ **ولا يُمسّ `reached`:** ما بعدها يبقى معروضاً مطويّاً بقيمه — فمن عاد من
   * الدفع إلى «بياناتك» يرى خطة دفعه ما زالت مختارة أسفل الشاشة، ويعود إليها
   * بنقرةٍ واحدة. والقيم كلها في حالة هذا المكوّن أصلاً، فلا يُفقد شيء بحال.
   */
  function editStep(target: Step) {
    if (target === step) return;
    setErrors({});
    setSubmitError(null);
    openedByEdit.current = true;
    setStep(target);
  }

  async function submit() {
    const found = { ...validateStepOne(), ...validateStepTwo() };
    setErrors(found);
    if (Object.keys(found).length > 0) {
      setStep(found.pickup ? 1 : 2);
      return;
    }

    const trimmedPhone = phone.trim();
    // 🔒 نفس التعبير بالنفي: `sameWhatsapp` كانت `!whatsappSeparate` بالمعنى
    //    وبالقيمة المبدئية معاً — فالحمولة لا تتغيّر بحرف (ملاحظة ٤).
    const secondary = whatsappSeparate ? whatsapp.trim() : trimmedPhone;

    const payload: CreateBookingRequestWithExtras = {
      origin: { label: trip.originLabel, lat: trip.originLat, lng: trip.originLng },
      destination: { label: trip.destinationLabel, lat: trip.destLat, lng: trip.destLng },
      /**
       * 🔴 **نفس المحطات وبنفس الترتيب الذي سُعِّر به** — لا من حقلٍ يُقرأ الآن.
       * `trip` هنا هو ما سُعِّرت عليه البطاقة التي ضغط عليها العميل، وأي مصدرٍ
       * آخر كان سيجعل الحجز على مسارٍ غير الذي عُرض سعرُه.
       */
      stops: trip.stops ?? [],
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
      // 🔒 وللنقاط **رايةٌ منطقية** لا رقم: لا عدد نقاط ولا مبلغ ولا معرّف حساب.
      // الخادم يشتقّ صاحب الرصيد من الجلسة، والقاعدة تقرّر كم يُنفَق (D-05).
      redeemPoints: redemption !== null,
      // 🔒 وكذلك الخدمات: **رموز وكميات فقط**، والأسعار من الكتالوج في القاعدة.
      returnAt: trip.returnAt ?? null,
      luggage: trip.luggage ?? 0,
      extras: trip.extras ?? [],
      /**
       * ج‑٣ — رقم الرحلة الجوية. يُرسَل **كما كتبه العميل**، والقاعدة تُطبّعه
       * (`normalize_flight_number`) ولا ترفضه بحال. وشرطُ الرحلة المطارية هنا
       * ليس حراسةً بل نظافة: من عدّل وجهته بعد أن كتب رقماً لا يُرسل رقم رحلةٍ
       * لا علاقة له بحجزه.
       */
      flightNumber:
        airportTrip && flightNumber.trim().length > 0 ? flightNumber.trim() : null,
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
        /**
         * 🔒 ونظيرها للنقاط: أنفق العميل رصيده في تبويب آخر بين المعاينة
         * والتأكيد، أو ضاقت المساحة، أو انتهت جلسته فلم يعد للخادم من يشتقّ
         * منه صاحب الرصيد. القاعدة **ترفض ولا تُنشئ الحجز بالسعر الأعلى**، وهنا
         * تُسقَط الراية — وإلا أُعيد إرسالها في كل محاولة تالية ففشلت جميعها
         * حتماً، والعميل لا يعرف أن إلغاء الاستخدام يحلّ المشكلة.
         *
         * ⚠ ولا يُلمَس `discount` هنا ولا العكس: رمزان مستقلان لسببين مستقلين،
         * وإسقاط الاثنين معاً يحرم العميل من خصمٍ ما زال صالحاً.
         */
        if (json.code === "redeem-rejected") setRedemption(null);
        /**
         * 🔒 أ‑٢ — رفضُ المهلة: العلاج **تغييرُ موعد**، لا مراجعةُ حقل.
         *
         * يقع حين يزحف «الآن» على موعدٍ اختاره العميل قبل دقائق — وهي الحالة
         * الوحيدة التي لا يمسكها منتقٍ حُسبت أرضيته مرة واحدة. فنُعيده إلى
         * الخطوة الأولى **ونُحدّث الأرضية من الخادم في الحال**، وإلا رأى
         * الشاشة نفسها بأرضيتها القديمة تسمح بما رُفض لتوّه.
         */
        if (json.code === "lead-time") {
          setStep(1);
          void previewLeadTime()
            .then(setLead)
            .catch(() => {});
        }
        /**
         * 🔒 0081 — «لا حجز بلا موعد» (قرار المالك 2026-08-17).
         *
         * ولا يقع هذا الفرع من هذه الشاشة: `validateStepOne` تمنع الإرسال بلا
         * موعد أصلاً، ويُستدعى ثانيةً في `submit` قبل بناء الحمولة. **وبقاؤه
         * هو المقصود**: الحارس المُلزِم في القاعدة (`pickup-required`)، وشاشةٌ
         * لا تعرف كيف تتصرّف حين ينطق الحارس تعرض «تعذّر إنشاء الحجز» على عطلٍ
         * علاجه نقرةٌ واحدة. فيعود العميل إلى الخطوة الأولى **وعلى حقل الموعد
         * خطؤه** — لا إلى رأس النموذج بلا دلالة.
         */
        if (json.code === "pickup-required") {
          setErrors((current) => ({
            ...current,
            pickup: json.message || t("errors.pickupRequired", "حدد تاريخ ووقت الانطلاق."),
          }));
          setStep(1);
        }
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

  /* ---------------------------------------------------------------- */
  /* سطور الملخّص — **من نفس الحالة التي تملأ الحقول**، لا نسخةٌ عنها   */
  /* ---------------------------------------------------------------- */

  const pickupLabel = fmt.dateTime(pickupIso);
  const returnLabel = trip.returnAt ? fmt.dateTime(trip.returnAt) : null;
  const notesTrimmed = notes.trim();
  const flightTrimmed = flightNumber.trim();
  const nameTrimmed = name.trim();
  const whatsappTrimmed = whatsapp.trim();

  /** الخطوة ١: الموعد أولاً — هو أهمّ ما يريد العميل التأكد منه بلا فتح */
  const tripSummary: React.ReactNode[] = [];
  if (pickupLabel) {
    // الوسم يلزم حين يوجد موعدان: تاريخان متجاوران بلا وسمٍ لغزٌ لا ملخّص
    tripSummary.push(
      returnLabel ? `${t("trip.pickupAt", "الانطلاق")}: ${pickupLabel}` : pickupLabel
    );
  }
  if (returnLabel) tripSummary.push(`${t("trip.returnAt", "العودة")}: ${returnLabel}`);
  if (airportTrip && flightTrimmed.length > 0) {
    tripSummary.push(
      <bdi key="flight" dir="ltr" className="font-mono uppercase">
        {flightTrimmed}
      </bdi>
    );
  }
  if (notesTrimmed.length > 0) {
    tripSummary.push(
      notesTrimmed.length > NOTES_PREVIEW_LENGTH
        ? `${notesTrimmed.slice(0, NOTES_PREVIEW_LENGTH)}…`
        : notesTrimmed
    );
  }

  /**
   * الخطوة ٢: الاسم ثم الرقم — و**الرقم بالشكل الذي أقرّه العميل** (‏`echo`)
   * لا بنصّه الخام حين يتوفر: هو نفسه المعروض في بطاقة الإقرار أعلاه، فلا
   * يقرأ العميل رقمه بصيغتين في شاشةٍ واحدة.
   */
  const customerSummary: React.ReactNode[] = [];
  if (nameTrimmed.length > 0) customerSummary.push(nameTrimmed);
  const phoneShown = echo?.display ?? trimmedPhoneValue;
  if (phoneShown.length > 0) {
    customerSummary.push(
      <bdi key="phone" dir="ltr">
        {phoneShown}
      </bdi>
    );
  }
  if (whatsappSeparate && whatsappTrimmed.length > 0) {
    customerSummary.push(
      <span key="whatsapp">
        {t("customer.whatsapp", "رقم الواتساب")}: <bdi dir="ltr">{whatsappTrimmed}</bdi>
      </span>
    );
  }

  /** الخطوة ٣: الخطة ومبلغها — والمبلغ من `splitAmounts` نفسها التي تعرضه أعلاه */
  const paymentSummary: React.ReactNode[] = [
    plan === "deposit"
      ? t("summary.planDeposit", "عربون")
      : t("summary.planFull", "كامل المبلغ"),
    fmt.money(amounts.amountDue, offer.currency),
  ];

  /**
   * 🔴 زوج أزرار التنقل — **قاعدةٌ واحدة، والفرق سطحٌ لا مقاس**.
   *
   * شكوى المالك: الزرّان مختلفان بما يكفي ليُقرأ عطلاً. وكان الفرق حقيقياً ولا
   * يخدم شيئاً: `text-sm` مقابل `text-base`، و`px-5` مقابل `px-6`، و`flex-1`
   * على أحدهما وحده، و`opacity` مختلفة عند التعطيل.
   *
   * والشكل المتَّبع في هذا المستودع أصلاً موجودٌ في `../offers.tsx` (زرّ الحجز
   * الأول مقابل بقية البطاقات): **سلسلة أصنافٍ واحدة حرفاً**، ثم `bg-primary`
   * أو `border … bg-background` وحدها تفرّق الأولوية. فلا صنف ثالث يُخترع هنا.
   *
   * ولوحة الألوان: `primary` و`border` و`background` و`muted` من الرموز الـ١٧
   * وحدها — ولا لون مكتوب.
   */
  const navButtonBase = cn(
    "inline-flex items-center justify-center gap-2 rounded-2xl px-5 text-base font-semibold transition-all focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50 disabled:pointer-events-none disabled:opacity-60",
    fieldHeight
  );

  /**
   * 🔒 لوحةٌ تُفتح تستقبل التركيز — `tabIndex={-1}` يجعلها هدفاً برمجياً بلا
   * أن تدخل ترتيب `Tab`؛ و`outline-none` لأن التركيز هنا **إعلانٌ لقارئ الشاشة
   * لا تنقّلٌ بصري**، والحقل الذي سينتقل إليه العميل يحمل حلقته الخاصة.
   */
  const stepPanelProps = {
    ref: stepPanelRef,
    tabIndex: -1,
    className: "flex flex-col gap-4 outline-none",
  } as const;

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

      {/*
        شريطُ الخطوات — **مؤشّرُ التقدّم وسطورُ الطيّ والتنقّل في عنصرٍ واحد**
        (ملاحظة المالك ٥). و`summaries` بترتيب `STEPS` حرفياً.
      */}
      <StepsBar
        current={step}
        reached={reached}
        summaries={[tripSummary, customerSummary, paymentSummary]}
        onJump={editStep}
        disabled={submitting}
        t={t}
        fmt={fmt}
      />

      {/* بانرات موضع «الحجز» — تحفيز بلا أثر على السعر */}
      <PromoBanners banners={banners} compact={compact} />

      <SummaryCard
        offer={offer}
        trip={trip}
        total={effectiveTotal}
        // السعر المشطوب هو إجمالي العرض كما جاء من `quote_public` (بلا كوبون
        // أصلاً) — لا `discount.totalBefore` الذي يخصّ الرحلة وحدها، وإلا شُطب
        // رقمٌ أقلّ من الرقم الجديد حين توجد خدمات. والنقاط تنزيلٌ مثله تماماً،
        // فالشرط يشمل الطبقتين ولا يُشطب شيء حين لا تنزيل أصلاً.
        originalTotal={discounted ? offer.total : null}
        t={tSummary}
        fmt={fmt}
      />

      {/*
        ══════════════════════════════════════════════════════════════════════
         الخطوات: **لوحةٌ واحدة مفتوحة**، وكل ما عداها في شريط الخطوات أعلاه
        ══════════════════════════════════════════════════════════════════════

        `step` هي المفتوحة، و`reached` أبعدُ ما بُلغ — وكلاهما يُقرأ في `StepsBar`
        الذي يحمل القيم والحالة والتنقّل معاً (ملاحظة المالك ٥). فما بقي هنا
        لوحةُ الخطوة الحالية وحدها، ولا صناديق طيٍّ مرصوفة بينها.
      */}
      <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-5">
        {/* ------------------------- الخطوة ١ ------------------------- */}
        {step === 1 ? (
          <div {...stepPanelProps}>
            {/*
              عنوان الخطوة — و**هو نفسه اسمُ الحقل** في الفرع القابل للكتابة.

              بعد دمج التاريخ والساعة في حقلٍ واحد (ملاحظة ٢) صار للخطوة مُدخلٌ
              واحد اسمُه اسمُ الخطوة. فعنوانٌ فوقه ثم اسمٌ له سطران يقولان
              «موعد الانطلاق» مرتين على شاشةٍ نقصّرها. و`<label>` لا `<p>`: نقرةٌ
              على الاسم تفتح المنتقي، وهو ما لا يعطيه `aria-labelledby`.
            */}
            {scheduledPickup ? (
              <p className="flex items-center gap-2 text-sm font-semibold">
                <CalendarClock className="size-4 shrink-0 text-primary" aria-hidden="true" />
                {t("trip.heading", "موعد الانطلاق")}
              </p>
            ) : (
              <label
                htmlFor={`${uid}-pickup-at`}
                className="flex w-fit items-center gap-2 text-sm font-semibold"
              >
                <CalendarClock className="size-4 shrink-0 text-primary" aria-hidden="true" />
                {t("trip.heading", "موعد الانطلاق")}
              </label>
            )}

            {/*
              🔴 وسم التوقيت — يظهر في الفرعين معاً (المُثبَّت والقابل للكتابة).

              كل موعد في هذا المنتج **بمنطقة الموقع**: المكتوب هنا يُفسَّر بها
              (‏`toIsoFromCairoInputs`)، والمعروض أعلاه وفي صفحة المتابعة يُعرض
              بها (‏`format.ts`). ومن يحجز من الخليج أو أوروبا لا يعرف ذلك من
              تلقاء نفسه — وحقلا التاريخ والوقت في المتصفح لا يقولان منطقةً
              بحال. فالسطر ليس تزييناً: هو الفرق بين «كتبتُ ١٠:٠٠ بتوقيت بلدي»
              و«كتبتُ ١٠:٠٠ بتوقيت الموقع»، وثمن الالتباس سائقٌ يصل بساعة خطأ.

              ⚠ **واسم المنطقة لم يعد مكتوباً في نصّ الرسالة** (هجرة 0075):
              كان «القاهرة (مصر)» محفوراً في `messages/*.json`، فلو بدّل مالكُ
              نسخةٍ منطقتَه إلى الرياض لبقي السطر يقول «مصر» — إعدادٌ يعمل
              وسطرٌ يكذّبه. والاسم الآن من ICU بلغة الزائر (`timeZoneLabel`).
            */}
            <p className="flex items-start gap-2 rounded-2xl border border-border bg-muted/40 px-3 py-2 text-xs leading-6 text-muted-foreground">
              <Clock className="mt-1 size-3.5 shrink-0 text-primary" aria-hidden="true" />
              {t(
                "trip.timeZoneNote",
                "المواعيد كلها على {zone} — اكتب موعد الانطلاق كما هو هناك لا بتوقيت بلدك.",
                { zone: timeZoneLabel(activeTimeZone, locale) }
              )}
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
                {/* والموعد المثبَّت قد يصير أقرب من المهلة بمرور الوقت — انظر `validateStepOne` */}
                <FieldError id={`${uid}-pickup-error`} message={errors.pickup} />
              </dl>
            ) : (
              <>
                {/*
                  🔴 حقلٌ واحد للتاريخ والساعة — ملاحظة المالك ٢، والدمج نفسه
                  الذي نزل في الحاسبة فبقي هذا الفرع خارجه.

                  ولا `sm:grid-cols-2` بعده: العمودان كانا وعاءَ حقلَين، وحقلٌ
                  واحد في عمودٍ واحد بعرضٍ كامل هو الشكل نفسه على ٣٧٥ وعلى
                  ١٢٨٠ — فالتفاوت بين الجوال والحاسوب زال من أصله لا بشرطٍ
                  جديد.
                */}
                <div className="flex flex-col gap-1.5">
                  <input
                    id={`${uid}-pickup-at`}
                    type="datetime-local"
                    min={pickupMin}
                    value={pickupLocal}
                    onChange={(event) => {
                      setPickupLocal(event.target.value);
                      // ملاحظة ٣: الخطأ يزول بأول لمسة، لا عند «التالي»
                      clearFieldError("pickup");
                    }}
                    aria-invalid={errors.pickup ? true : undefined}
                    aria-describedby={
                      errors.pickup
                        ? `${uid}-pickup-error`
                        : leadFloor
                          ? `${uid}-lead-note`
                          : undefined
                    }
                    className={fieldClass}
                  />

                  {/*
                    🔴 صدى بأرقام لغة الزائر — والحقل الأصلي **لا يضمنها**:
                    منتقي المتصفح يرسم بلغة الجهاز لا بلغة الصفحة، فيرى العميل
                    العربي «09/14/2026» في حقلٍ كل ما حوله بالعربية. فالصدى هو
                    ما يُقرأ فعلاً، وهو من `fmt.dateTime` — نفس مُنسّق بقية
                    الشاشة، وبمنطقة الموقع، فيرى اللحظة التي ستُحجز له لا التي
                    كتبها جهازه. **وهو أحد الأربعة التي فرضها الدمج الأول.**
                  */}
                  {pickupIso ? (
                    <p className="text-xs leading-5 text-primary">{fmt.dateTime(pickupIso)}</p>
                  ) : null}
                </div>

                {/*
                  🔒 أ‑٢ — «أقرب موعد متاح» يُقال **قبل** المحاولة لا بعدها.

                  والأرضية معروضةٌ نصّاً بجوار المنتقي عمداً: `min` في حقلَي
                  التاريخ والوقت يمنع الاختيار، لكنه صامت — من يضغط على يومٍ
                  رمادي لا يعرف لماذا رُفض، والمنتقي على الجوال قد لا يُظهر
                  الحدّ أصلاً. فالجملة هي التي تحوّل المنع إلى تفسير.

                  ولا تظهر حين تكون المهلة مطفأة: سطرٌ يعلن قيداً لا وجود له
                  هو «شاشة تَعِد بغير ما تفعله القاعدة» مقلوبةً.
                */}
                {leadFloor && lead?.enabled ? (
                  <p
                    id={`${uid}-lead-note`}
                    className="flex items-start gap-2 text-xs leading-6 text-muted-foreground"
                  >
                    <Clock className="mt-1 size-3.5 shrink-0 text-primary" aria-hidden="true" />
                    {t(
                      "trip.leadNote",
                      "نحتاج مهلة {minutes} دقيقة على الأقل لتجهيز رحلتك — أقرب موعد متاح {value}.",
                      {
                        minutes: fmt.digits(lead.leadMinutes),
                        value: fmt.dateTime(lead.minPickupAt) ?? "",
                      }
                    )}
                  </p>
                ) : null}

                <FieldError id={`${uid}-pickup-error`} message={errors.pickup} />
              </>
            )}

            {/*
              ج‑٣ — رقم الرحلة الجوية، **ولا يظهر إلا في الرحلة المطارية**.

              حقلٌ يسأل كل عميل عن رقم رحلةٍ لا يملكها احتكاكٌ خالص؛ والاشتقاق
              من وسمَي المكانين هو الإشارة الوحيدة القائمة في بيانات هذا
              المنتج (لا جدول خدمات، وتصنيف Nominatim غير ملتقَط — التفصيل في
              ترويسة `../airport.ts`).

              🔒 **واختياري بنصّه**: رقمٌ خاطئ معلومةٌ ناقصة للمتعهد، ورفضُ
              الحجز بسببه خسارةُ العميل كله. فلا `required` ولا تحقّق يمنع،
              والقاعدة تخزّن ما وصل بعد تطبيعه.
            */}
            {airportTrip ? (
              <div className="flex flex-col gap-1.5">
                <label
                  htmlFor={`${uid}-flight`}
                  className="flex items-center gap-2 text-sm font-medium"
                >
                  <Plane className="size-4 shrink-0 text-primary" aria-hidden="true" />
                  {t("trip.flightNumber", "رقم الرحلة الجوية")}{" "}
                  <span className="font-normal text-muted-foreground">
                    ({tCommon("optional", "اختياري")})
                  </span>
                </label>
                <input
                  id={`${uid}-flight`}
                  type="text"
                  dir="ltr"
                  inputMode="text"
                  autoComplete="off"
                  autoCapitalize="characters"
                  maxLength={12}
                  value={flightNumber}
                  onChange={(event) => setFlightNumber(event.target.value)}
                  placeholder="MS736"
                  aria-describedby={`${uid}-flight-help`}
                  className={cn(fieldClass, "text-start uppercase")}
                />
                <p id={`${uid}-flight-help`} className="text-xs leading-5 text-muted-foreground">
                  {t(
                    "trip.flightNumberHelp",
                    "يصل رقم رحلتك إلى السائق مع بيانات الحجز، فيعرف موعد هبوطك الفعلي. مثال: MS736."
                  )}
                </p>
                {/*
                  ⚠ تحقّق الشكل **تلميحٌ لا حاجز** (رمز شركة حرفان أو ثلاثة ثم
                  أرقام). يظهر ولا يمنع — والزر يبقى فعّالاً، والقاعدة تقبل.
                */}
                {flightNumber.trim().length > 0 &&
                !/^[A-Za-z]{2}[A-Za-z]?\s*\d{1,4}[A-Za-z]?$/.test(flightNumber.trim()) ? (
                  <p className="flex items-start gap-1.5 text-xs leading-5 text-amber-700 dark:text-amber-400">
                    <TriangleAlert className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
                    {t(
                      "trip.flightNumberHint",
                      "لا يبدو رقم رحلة معتاداً (حرفان ثم أرقام) — راجعه إن أمكن، ولن يمنع حجزك."
                    )}
                  </p>
                ) : null}
              </div>
            ) : null}

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
          <div {...stepPanelProps}>
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
                onChange={(event) => {
                  setName(event.target.value);
                  // ملاحظة ٣
                  clearFieldError("name");
                }}
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
                onChange={(event) => {
                  setPhone(event.target.value);
                  /**
                   * ملاحظة ٣ — و**الخطآن معاً**: «أكّد رقمك» خطأٌ على هذا الحقل
                   * بعينه، فإبقاؤه بعد أن يعدّل العميل الرقم يطالبه بإقرار رقمٍ
                   * لم يعد مكتوباً. والإقرار نفسه يسقط بنيوياً بتغيّر الشكل
                   * المعياري (‏`ackedNormalized`)، فالمطالبة تُعاد عند «التالي»
                   * إن لزمت — ولا تبقى معلَّقة أثناء الكتابة.
                   */
                  clearFieldError("phone", "phoneConfirm");
                }}
                placeholder="01xxxxxxxxx"
                aria-invalid={errors.phone ? true : undefined}
                aria-describedby={errors.phone ? `${uid}-phone-error` : undefined}
                className={cn(fieldClass, "text-start")}
              />
              <FieldError id={`${uid}-phone-error`} message={errors.phone} />

              {/*
                ══════════════════════════════════════════════════════════════
                 🔴 أ‑١ — الرقم كما فهمه النظام، وإقرارٌ صريح عليه
                ══════════════════════════════════════════════════════════════

                العميل يحجز ضيفاً بلا حساب وبلا بريدٍ إلزامي، **فالهاتف هو
                القناة الوحيدة**. والتطبيع يمنع رقماً *فاسداً* ولا يمنع رقماً
                *خاطئاً*: خانةٌ مقلوبة تُنتج رقماً سليم الشكل يقبله كل شيء —
                والنتيجة عميلٌ لا يُبلَّغ ⇒ رحلة فاشلة بأثرٍ مالي حقيقي.

                ── ولماذا هذا الشكل بالذات، وما رُفض قبله ──────────────────
                • **لا خطوةٌ رابعة ولا نافذة تعترض الجميع**: خطوةٌ يضغطها كل
                  عميل مرتين كلفةُ تحويلٍ مقابل عيبٍ نادر — والبطاقة هنا داخل
                  الخطوة الثانية نفسها، بلا انتقال وبلا حجب.
                • **ولا زرّ «التالي» أُعيدت تسميته**: ذاك يُضغط انعكاساً فلا
                  يكسر الغفلة، وهو بالضبط ما نحتاج كسره. فالإقرار **فعلٌ
                  مستقل صغير** — مربّعٌ واحد، مرةً واحدة، بجوار الرقم مباشرة.

                ── والرقم يُعرض **بشكلٍ غير الذي كُتب** بقصد ────────────────
                `+20 10 1000 0506` بدل `01010000506`: النصّ المطابق لِما كتبه
                العميل تقفز عليه العين، والتجميع الدولي يجعل الخانة المقلوبة
                مرئية. والشكل من `formatNormalizedPhone` فوق ناتج
                `normalize_phone` في القاعدة — لا تطبيع ثانٍ في المتصفح.

                🔒 و`ackedNormalized` يخزّن **الرقم المُقَرّ به لا رايةً**، فأي
                تعديل يغيّر الشكل المعياري يُسقط الإقرار بنيوياً — لا بمُتذكِّرٍ
                قد يُنسى.
              */}
              {/*
                ══════════════════════════════════════════════════════════════
                 🔴 صندوقٌ **واحد** لتأكيدٍ واحد — ملاحظة المالك ٤
                ══════════════════════════════════════════════════════════════

                التعليل الكامل (الحالات الثلاث، ولماذا الإقرار يُستوفى بفعلَين)
                عند `phoneConfirmed` أعلاه. وما هنا شكلُه:

                • يُصيَّر حين **يستقرّ** جواب الصدى (‏`echoSettled`) أو حين تكون
                  رايةُ الواتساب مرفوعةً بالفعل — فلا يومض المفتاح ولا يقلب
                  نفسه، ولا يختفي حقلُ الواتساب من تحت من يكتب فيه لأن الصدى
                  يُعاد سؤاله.
                • سطرُ الرقم يظهر حين يوجد رقمٌ يُعرض (‏`echoReady`) وحده —
                  و`display === null` تبقى تعني «لا رقم يُعرض ولا إقرار يُطلب»
                  حرفياً كما كانت (شبكة · بيئة غير مهيّأة · هجرة ناقصة).
                • وحين لا صدى، المفتاح **مؤشَّرٌ مبدئياً** ومعناه معنى
                  «الواتساب نفس الهاتف» القديم بالضبط — فلا يُحبس عميلٌ خلف
                  قراءةٍ تعذّرت، ولا تُفقد قدرةُ من واتسابه رقمٌ آخر.
              */}
              {echoSettled || whatsappSeparate ? (
                <div
                  className={cn(
                    "flex flex-col gap-2 rounded-2xl border px-3.5 py-3 transition-colors",
                    errors.phoneConfirm
                      ? "border-destructive/50 bg-destructive/5"
                      : phoneAcked
                        ? "border-primary/40 bg-primary/5"
                        : "border-border bg-muted/40"
                  )}
                >
                  {echoReady ? (
                    <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm leading-7">
                      <PhoneCall className="size-4 shrink-0 text-primary" aria-hidden="true" />
                      <span className="text-muted-foreground">
                        {t("customer.echoLead", "سنراسلك ونتصل بك على")}
                      </span>
                      <bdi
                        dir="ltr"
                        className="font-mono text-base font-bold tracking-wider text-foreground"
                      >
                        {echo?.display}
                      </bdi>
                    </p>
                  ) : null}

                  {echoSettled ? (
                    <label className="flex w-fit cursor-pointer items-start gap-2 text-sm font-medium">
                      <input
                        type="checkbox"
                        /**
                         * 🔒 مؤشَّرٌ = «أقرَرتُ **وواتسابي هو هذا**». وبلا صدى
                         * لا إقرار يُطلب، فيبقى المعنى الثاني وحده — ومبدأه
                         * `true` كما كانت `sameWhatsapp` حرفاً.
                         */
                        checked={!whatsappSeparate && (echoReady ? phoneAcked : true)}
                        onChange={(event) => {
                          if (event.target.checked) {
                            setWhatsappSeparate(false);
                            setAckedNormalized(echo?.normalized ?? null);
                            // الإقرار يرفع خطأه فوراً — لا ينتظر «التالي»
                            clearFieldError("phoneConfirm");
                          } else {
                            // إزالةُ العلامة = «واتسابي رقمٌ آخر» ⇒ يظهر حقله
                            setWhatsappSeparate(true);
                            setAckedNormalized(null);
                          }
                        }}
                        aria-invalid={errors.phoneConfirm ? true : undefined}
                        /**
                         * ⚠ ولا يشير إلى معرّفٍ غير مُصيَّر: سطرُ التلميح يظهر
                         * حين تكون العلامة قائمة وحدها، فإشارةٌ إليه بعد إزالتها
                         * كانت ستكون مرجعاً معلّقاً — أسوأ من غياب الوصف
                         * (نفس قرار `aria-controls` في `CollapsedStep`).
                         */
                        aria-describedby={
                          errors.phoneConfirm
                            ? `${uid}-phone-confirm-error`
                            : whatsappSeparate
                              ? undefined
                              : `${uid}-whatsapp-hint`
                        }
                        className="mt-0.5 size-4 shrink-0 rounded border-input accent-[var(--primary)]"
                      />
                      <span className="leading-6">
                        {t(
                          "customer.echoConfirm",
                          "نعم، هذا رقمي وأستقبل عليه واتساب أيضاً."
                        )}
                      </span>
                    </label>
                  ) : null}

                  {/*
                    السطر الذي يجعل المفتاح مفهوماً **قبل** أن يُزال: بلا هذه
                    الجملة لا يعرف صاحبُ الرقم الآخر أن إزالة العلامة هي بابُه،
                    فيؤشّر ثم يفقد رقمه — وهي القدرة التي أمر المالك بحفظها.
                  */}
                  {!whatsappSeparate ? (
                    <p
                      id={`${uid}-whatsapp-hint`}
                      className="text-xs leading-5 text-muted-foreground"
                    >
                      {t(
                        "customer.whatsappHint",
                        "واتسابك على رقمٍ آخر؟ أزل العلامة ليظهر حقلٌ تكتبه فيه."
                      )}
                    </p>
                  ) : null}

                  <FieldError
                    id={`${uid}-phone-confirm-error`}
                    message={errors.phoneConfirm}
                  />

                  {whatsappSeparate ? (
                    <div className="flex flex-col gap-1.5">
                      <label htmlFor={`${uid}-whatsapp`} className="text-sm font-medium">
                        {t("customer.whatsapp", "رقم الواتساب")}
                      </label>
                      <input
                        id={`${uid}-whatsapp`}
                        type="tel"
                        inputMode="tel"
                        dir="ltr"
                        autoComplete="tel"
                        value={whatsapp}
                        onChange={(event) => {
                          setWhatsapp(event.target.value);
                          /**
                           * ملاحظة ٣ — و`phoneConfirm` معه: كتابةُ رقمٍ صحيح
                           * **هي** الإقرار في هذا الفرع (انظر `phoneConfirmed`)،
                           * فإبقاء الخطأ يطالب بفعلٍ يفعله العميل الآن.
                           */
                          clearFieldError("whatsapp", "phoneConfirm");
                        }}
                        placeholder="01xxxxxxxxx"
                        aria-invalid={errors.whatsapp ? true : undefined}
                        aria-describedby={errors.whatsapp ? `${uid}-whatsapp-error` : undefined}
                        className={cn(fieldClass, "text-start")}
                      />
                      <FieldError id={`${uid}-whatsapp-error`} message={errors.whatsapp} />
                    </div>
                  ) : null}
                </div>
              ) : null}
            </div>
          </div>
        ) : null}

        {/* ------------------------- الخطوة ٣ ------------------------- */}
        {step === 3 ? (
          <div {...stepPanelProps}>
            {/*
              ══════════════════════════════════════════════════════════════════
               🔴 تفصيل السعر **أولاً**، ورمز الخصم تحته — ملاحظة المالك ٧
              ══════════════════════════════════════════════════════════════════

              > «رمز الخصم أعلى الإجمالي ⇒ يُنقل أسفله.»

              وهو ترتيب القراءة الطبيعي: **هذا سعرك، ألديك رمز؟** — لا العكس.
              حقلٌ يسأل عن رمزٍ قبل أن يعرف العميل على أي رقمٍ سيقع خصمُه يطلب
              منه قراراً بلا مرجع.

              🔒 **والقيد الذي فرض الترتيب القديم لم يُنقض**: العربون **نسبةٌ من
              الإجمالي**، فتطبيقُ الخصم بعد اختيار الخطة يغيّر الرقم تحت يد
              الزائر. ولذلك نُقل الحقل إلى ما **بين** التفصيل وخطة الدفع — أسفل
              الإجمالي كما أمر المالك، وقبل الخطة كما يفرض الحساب. ولا موضع
              ثالث يفي بالاثنين.

              ⚠ وصفوفُ الخصم والنقاط تبقى **حيث تُحسب**: داخل هذا التفصيل بترتيب
                §٢ (الرحلة ← الكوبون ← النقاط ← الخدمات)، لا عند الحقل — فالحقل
                مُدخَل، والصفوف نتيجة.
            */}
            <dl className="flex flex-col gap-2 rounded-2xl border border-border bg-muted/40 px-4 py-3 text-sm">
              {/*
                تفصيل السعر بالخصم: الإجمالي قبل ← قيمة الخصم ← الإجمالي بعد.
                ثلاثتها من `apply_discount`. وحين لا خصم يبقى الصف الواحد كما كان
                حرفياً — لا صفوف صفرية تشوّش القراءة.
              */}
              {/*
                ⚠ «الإجمالي» تصير كلمةً كاذبة كلما تلاها سطرٌ يطرح: خدماتٌ
                تُضاف، أو نقاطٌ تُخصم. فالمدى `ride` يُحسب من **الاثنين معاً** لا
                من الخدمات وحدها كما كان، وإلا قرأ صاحبُ الكوبون والنقاط
                «الإجمالي بعد الخصم» ثم رأى تحته خصماً ثانياً.
              */}
              {discount ? (
                <DiscountRows
                  discount={discount}
                  t={tDiscount}
                  fmt={fmt}
                  scope={hasExtras || redemption ? "ride" : "total"}
                />
              ) : (
                <div className="flex items-center justify-between gap-3">
                  <dt className="text-muted-foreground">
                    {hasExtras || redemption
                      ? t("payment.rideTotal", "سعر الرحلة")
                      : t("payment.total", "إجمالي الرحلة")}
                  </dt>
                  <dd className="font-medium">
                    {fmt.money(hasExtras ? offer.rideTotal : offer.total, offer.currency)}
                  </dd>
                </div>
              )}

              {/*
                النقاط **بعد** الكوبون وقبل الخدمات — ترتيب §٢ حرفياً. وموضع
                هذه الصفوف في الشاشة هو نفسه موضع الطبقة في القاعدة، فما يقرؤه
                العميل هو ما يجري فعلاً لا ترتيبٌ اختير للجمال.
              */}
              {redemption ? (
                <RedeemRows
                  redemption={redemption}
                  t={tLoyalty}
                  fmt={fmt}
                  scope={hasExtras ? "ride" : "total"}
                />
              ) : null}

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
            </dl>

            {/*
              ولا يظهر الحقل أصلاً حين يكون نظام الخصومات مطفأ — لا حقلاً معطَّلاً
              يعلن عن ميزة لا تعمل.
            */}
            {discountEnabled ? (
              <CouponField
                trip={trip}
                classSlug={offer.classSlug}
                applied={discount}
                onApply={applyDiscount}
                suggestedCode={banners.find((banner) => banner.couponCode)?.couponCode ?? null}
                disabled={submitting}
                compact={compact}
                locale={locale}
              />
            ) : null}

            {/*
              لوحة النقاط **تحت** حقل الكوبون: هو الترتيب الذي تنفّذه القاعدة
              (‏§٢)، والصفوف أسفل الشاشة تحكي القصة نفسها. وهي لا تظهر إلا حين
              يكون هناك رصيدٌ يُنفَق فعلاً — فمن لا حساب له، ومن لا رصيد له، ومن
              لم تصل قاعدتَه هجرةُ المحرّك، ثلاثتهم يرون هذه الخطوة كما كانت.
              و`couponCode` يُمرَّر كي يُحسب الرقمان على **سقفٍ واحد** لا سقفين.
            */}
            {loyaltyEnabled ? (
              <RedeemField
                trip={trip}
                classSlug={offer.classSlug}
                couponCode={discount?.code ?? null}
                applied={redemption}
                onApply={setRedemption}
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

            {/*
              ما يُدفع الآن وما يتبقى — والتفصيل انتقل **أعلى حقل الخصم**
              (ملاحظة ٧). وهذان الصفّان يخصّان **الخطة المختارة**، فموضعهما تحت
              الخطة لا فوقها: يتغيّران بضغطة الزرّ الذي أعلاهما مباشرة.
            */}
            <dl className="flex flex-col gap-2 rounded-2xl border border-border bg-muted/40 px-4 py-3 text-sm">
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

            {/*
              ══════════════════════════════════════════════════════════════════
               🔴 صندوقُ تنبيهٍ **واحد** يحمل المعنيَين — ملاحظة المالك ٨
              ══════════════════════════════════════════════════════════════════

              كانا صندوقين مؤطَّرين متجاورين بنفس الحجم ونفس اللون: أحدهما «ماذا
              يحدث بعد التأكيد»، والآخر «إلى متى يبقى حجزك». وإطارٌ ثانٍ ملاصقٌ
              لإطارٍ أول يُقرأ **قسمين مختلفين** فتُقرأ الجملة الثانية على أنها
              موضوعٌ جديد — وهما جملتان عن الشيء نفسه: ما بين التأكيد والتحويل.

              فصارا صندوقاً واحداً بسطرين: الأول أيقونتُه ✅ (ما ستفعله)، والثاني
              أيقونتُه ⏱ (المهلة التي تفعله فيها). **ولا نصَّ تغيّر بحرف** —
              المفتاحان كما هما، فلا ترجمةٌ تُعاد ولا معنى يسقط.

              🔒 و«محفوظ حتى» لا «يُلغى في»: التاريخ أرضيةٌ آمنة لا موعد إعدام —
              الكنس يستثني من عليه نشاط إيصالٍ حديث، فالمهلة تمتدّ ولا تقصر.

              وسطر المهلة **معاينة** كمعاينة العربون: يُحسب من لحظة العرض، والرقم
              المُلزِم يُثبَّت في صفحة المتابعة وهي مصدره الوحيد. ولذلك لا يظهر
              إلا بتاريخٍ وصل فعلاً — وغيابه يترك الصندوق بسطره الأول وحده، بلا
              فراغٍ ولا وعد.
            */}
            <div className="flex flex-col gap-2 rounded-2xl border border-border bg-background px-3 py-2.5 text-xs leading-6 text-muted-foreground">
              <p className="flex items-start gap-2">
                <BadgeCheck className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden="true" />
                {t(
                  "payment.afterConfirm",
                  "بعد التأكيد تفتح لك صفحة الحجز بحسابات التحويل المتاحة، وترفع صورة الإيصال ليراجعه فريقنا. المبالغ النهائية تُثبَّت في تلك الصفحة."
                )}
              </p>

              {holdUntilLabel ? (
                <p className="flex items-start gap-2 border-t border-border pt-2">
                  <Clock className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden="true" />
                  {t(
                    "payment.holdUntil",
                    "ويبقى حجزك محفوظاً لك حتى {value} لإتمام التحويل — وبعدها قد يُلغى تلقائياً ويعود موعده متاحاً لغيرك.",
                    { value: holdUntilLabel }
                  )}
                </p>
              ) : null}
            </div>
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

        {/*
          أزرار التنقل — زوجٌ واحد: نفس الارتفاع ونفس الحواف ونفس المقاس
          ونفس حلقة التركيز، و`navButtonBase` أعلاه هو المصدر الوحيد لكلّ ذلك.
          والمكتب يفرّقهما بالموضع (رجوعٌ في المبدأ وتقدّمٌ في المنتهى)،
          والجوال بالترتيب: الرئيسي فوق (‏`flex-col-reverse`) لأنه ما يُضغط.
        */}
        <div className="flex flex-col-reverse gap-3 sm:flex-row sm:items-center sm:justify-between">
          {step > 1 ? (
            <button
              type="button"
              onClick={goPrevious}
              disabled={submitting}
              className={cn(navButtonBase, "border border-border bg-background hover:bg-muted")}
            >
              <ChevronRight className="size-5" aria-hidden="true" />
              {t("actions.previous", "الخطوة السابقة")}
            </button>
          ) : (
            <span className="hidden sm:block" />
          )}

          <button
            type="submit"
            disabled={submitting}
            className={cn(
              navButtonBase,
              "bg-primary text-primary-foreground shadow-lg shadow-primary/25 hover:bg-primary/90"
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
                <ChevronLeft className="size-5" aria-hidden="true" />
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
            : t("stepStatus", "الخطوة {index} من {total}", {
                index: fmt.digits(step),
                total: fmt.digits(STEPS.length),
              })}
      </span>
    </div>
  );
}
