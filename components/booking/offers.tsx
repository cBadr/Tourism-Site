"use client";

import * as React from "react";
import {
  Bus,
  BusFront,
  Car,
  CarFront,
  ChevronDown,
  CircleCheck,
  Clock,
  FileText,
  MessageCircle,
  Route,
  Sparkles,
  TriangleAlert,
  Users,
} from "lucide-react";
import { localeHref, telHref, waHref } from "@/components/site/links";
import { cn } from "@/lib/utils";
import type { DistanceSource, Offer } from "@/lib/pricing-types";
import { DEFAULT_LOCALE, localePath } from "@/lib/i18n-types";
import { useT, type Tx } from "@/components/site/i18n";
import { createFormatter, type LocaleFormatter } from "./format";
import { Checkout, type CheckoutTrip } from "./checkout/checkout";

/**
 * بطاقات عروض الأسعار — تعرض ناتج /api/quote كما هو دون أي حساب.
 *
 * ترتيب العروض من الخادم: الأصغر الكافية أولاً (توسم «الأنسب لك») ثم التي تليها
 * تحفيزاً (توسم «راحة أكثر») — قاعدة الأهلية كلها في دالة SQL.
 *
 * زر «احجز هذه السيارة» يفتح مسار الحجز (Checkout) في مكانه دون أي تنقل بين
 * الصفحات؛ والتنقل الوحيد يقع بعد الإرسال إلى صفحة متابعة الحجز /booking/[token].
 * يبقى «استفسر عبر واتساب» قناة ثانوية لمن يفضّل الكلام قبل الحجز.
 */

/** قنوات التواصل المطلوبة لزر الحجز — تُمرَّر من إعدادات الموقع (whitelabel) */
export type BookingContact = {
  whatsapp: string | null;
  phone: string | null;
};

/**
 * ملخص الرحلة المستخدَم في رسالة الواتساب وفي ترويسة النتائج.
 *
 * الإحداثيات اختيارية في النوع (حفاظاً على توافق كل مستدعٍ حالي) لكنها **شرط
 * بدء الحجز**: بدونها لا يستطيع /api/booking إعادة حساب المسافة، فيسقط الزر
 * تلقائياً إلى قناة الواتساب بدل أن ينكسر المسار.
 */
export type TripSummary = {
  originLabel: string;
  destinationLabel: string;
  passengers: number;
  roundTrip: boolean;
  waitingHours: number;
  originLat?: number | null;
  originLng?: number | null;
  destLat?: number | null;
  destLng?: number | null;
};

/** رابط صفحة طلب عرض سعر — لما هو خارج الحاسبة (جولات، مناسبات، إيجار يومي) */
const QUOTE_REQUEST_PATH = "/quote-request";

/** يحوّل ملخص الرحلة إلى مدخلات الحجز — null إن غابت الإحداثيات */
function toCheckoutTrip(trip: TripSummary): CheckoutTrip | null {
  const { originLat, originLng, destLat, destLng } = trip;
  if (
    typeof originLat !== "number" ||
    typeof originLng !== "number" ||
    typeof destLat !== "number" ||
    typeof destLng !== "number" ||
    !Number.isFinite(originLat) ||
    !Number.isFinite(originLng) ||
    !Number.isFinite(destLat) ||
    !Number.isFinite(destLng)
  ) {
    return null;
  }
  return {
    originLabel: trip.originLabel,
    originLat,
    originLng,
    destinationLabel: trip.destinationLabel,
    destLat,
    destLng,
    passengers: trip.passengers,
    roundTrip: trip.roundTrip,
    waitingHours: trip.waitingHours,
  };
}

export type OffersProps = {
  offers: Offer[];
  distanceKm: number;
  durationMin: number | null;
  distanceSource: DistanceSource;
  trip: TripSummary;
  contact?: BookingContact;
  /** نسخة مضغوطة (ويدجت البطل) — إيقاع أصغر بنفس المحتوى */
  compact?: boolean;
  /** لغة الزائر — تصل من الصفحة الخادمية، وغيابها يعني العربية */
  locale?: string;
};

/** أيقونة لكل فئة — بديل محايد لأي فئة يضيفها المالك لاحقاً من اللوحة */
const CLASS_ICONS: Record<string, typeof Car> = {
  sedan: CarFront,
  suv: Car,
  minibus: Bus,
  bus: BusFront,
};

/** وسم توصية لكل موضع: الأصغر الكافية ثم الترقية */
const RECOMMENDATIONS = [
  { key: "recommendation.best", label: "الأنسب لك", tone: "primary" as const },
  { key: "recommendation.comfort", label: "راحة أكثر", tone: "accent" as const },
];

/** رسالة واتساب الجاهزة بلغة الزائر — المسار والفئة والسعر لمن يفضّل الاستفسار أولاً */
function inquiryMessage(
  offer: Offer,
  trip: TripSummary,
  t: Tx,
  fmt: LocaleFormatter
): string {
  const lines = [
    t("inquiry.intro", "مرحباً، أستفسر عن رحلة حسبتها على الموقع:"),
    t("inquiry.from", "من: {value}", { value: trip.originLabel }),
    t("inquiry.to", "إلى: {value}", { value: trip.destinationLabel }),
    t("inquiry.tripType", "نوع الرحلة: {value}", {
      value: trip.roundTrip
        ? t("summary.roundTrip", "ذهاب وعودة")
        : t("summary.oneWay", "ذهاب فقط"),
    }),
    t("inquiry.passengers", "عدد الركاب: {value}", {
      value: fmt.passengers(trip.passengers),
    }),
  ];
  if (trip.waitingHours > 0) {
    lines.push(
      t("inquiry.waiting", "ساعات الانتظار: {value}", {
        value: fmt.hours(trip.waitingHours),
      })
    );
  }
  lines.push(t("inquiry.vehicleClass", "الفئة: {value}", { value: offer.classTitle }));
  lines.push(
    t("inquiry.price", "السعر المعروض: {value}", {
      value: fmt.money(offer.total, offer.currency),
    })
  );
  return lines.join("\n");
}

/**
 * وجهة قناة التواصل المباشر: واتساب برسالة جاهزة ← الهاتف ← قسم التواصل.
 * (المسار المطلق «/#contact» لأن الويدجت يعمل خارج الصفحة الرئيسية أيضاً.)
 */
function inquiryHref(
  offer: Offer,
  trip: TripSummary,
  t: Tx,
  fmt: LocaleFormatter,
  contact?: BookingContact,
  locale: string = DEFAULT_LOCALE
): string {
  if (contact?.whatsapp) {
    const text = encodeURIComponent(inquiryMessage(offer, trip, t, fmt));
    return `${waHref(contact.whatsapp)}?text=${text}`;
  }
  if (contact?.phone) return telHref(contact.phone);
  return localeHref("/#contact", locale);
}

/** بنود تفصيل السعر المطبَّقة فقط — بلا صفوف صفرية تشوّش القراءة */
function breakdownRows(
  offer: Offer,
  t: Tx,
  fmt: LocaleFormatter
): { label: string; value: string }[] {
  const { breakdown: b, currency } = offer;
  const rows: { label: string; value: string }[] = [];
  if (b.baseFee > 0) {
    rows.push({
      label: t("details.baseFee", "المصروف الأساسي"),
      value: fmt.money(b.baseFee, currency),
    });
  }
  if (b.distanceCost > 0) {
    rows.push({
      label: t("details.distanceCost", "تكلفة المسافة"),
      value: fmt.money(b.distanceCost, currency),
    });
  }
  if (b.waitingCost > 0) {
    rows.push({
      label: t("details.waitingCost", "ساعات الانتظار"),
      value: fmt.money(b.waitingCost, currency),
    });
  }
  if (b.roundTripApplied) {
    rows.push({
      label: t("details.roundTrip", "ذهاب وعودة"),
      value: t("details.roundTripApplied", "مُحتسب"),
    });
  }
  if (b.peakApplied) {
    rows.push({
      label: t("details.peak", "موسم الذروة"),
      value: t("details.peakApplied", "مُضاف"),
    });
  }
  if (b.minApplied) {
    rows.push({
      label: t("details.minimum", "الحد الأدنى للفئة"),
      value: t("details.minimumApplied", "مُطبَّق"),
    });
  }
  return rows;
}

/** شارة «سعر استرشادي» — تظهر حين تعذّر توجيه حقيقي ووقع الحساب على تقدير */
function EstimateBadge({ t }: { t: Tx }) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full border border-amber-500/50 bg-amber-500/10 px-2.5 py-1 text-xs font-medium text-amber-800 dark:text-amber-200">
      <TriangleAlert className="size-3.5 shrink-0" aria-hidden="true" />
      {t("estimateBadge", "سعر استرشادي — يُؤكد قبل الحجز")}
    </span>
  );
}

function OfferCard({
  offer,
  rank,
  isEstimate,
  trip,
  contact,
  compact,
  canBook,
  onBook,
  t,
  fmt,
  locale,
}: {
  offer: Offer;
  rank: number;
  isEstimate: boolean;
  trip: TripSummary;
  contact?: BookingContact;
  compact?: boolean;
  /** الحجز الإلكتروني متاح (الإحداثيات حاضرة) */
  canBook: boolean;
  onBook: (offer: Offer) => void;
  t: Tx;
  fmt: LocaleFormatter;
  locale: string;
}) {
  const Icon = CLASS_ICONS[offer.classSlug] ?? Car;
  const recommendation = RECOMMENDATIONS[rank];
  const rows = breakdownRows(offer, t, fmt);
  const href = inquiryHref(offer, trip, t, fmt, contact, locale);
  const isExternal = href.startsWith("http");
  const detailsId = `offer-${offer.classSlug}-breakdown`;
  const priceLabel = fmt.money(offer.total, offer.currency);

  return (
    <div
      className={cn(
        "relative flex w-full flex-col gap-4 rounded-3xl border bg-card text-card-foreground shadow-sm transition-shadow duration-300 hover:shadow-lg",
        compact ? "p-4" : "p-5 sm:p-6",
        rank === 0
          ? "border-primary/40 shadow-primary/10 ring-1 ring-primary/20"
          : "border-border"
      )}
    >
      {/* الترويسة: أيقونة الفئة + العنوان + سعة الركاب + وسم التوصية */}
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <span
            className={cn(
              "grid size-12 shrink-0 place-items-center rounded-2xl",
              rank === 0 ? "bg-primary text-primary-foreground" : "bg-primary/10 text-primary"
            )}
          >
            <Icon className="size-6" aria-hidden="true" />
          </span>
          <div className="flex flex-col gap-1.5">
            <h3 className="text-lg font-bold leading-tight">{offer.classTitle}</h3>
            <span className="inline-flex w-fit items-center gap-1.5 rounded-full bg-muted px-2.5 py-0.5 text-xs font-medium text-muted-foreground">
              <Users className="size-3.5 shrink-0" aria-hidden="true" />
              {t("capacity", "حتى {value}", { value: fmt.passengers(offer.capacity) })}
            </span>
          </div>
        </div>

        {recommendation ? (
          <span
            className={cn(
              "inline-flex shrink-0 items-center gap-1 rounded-full px-2.5 py-1 text-xs font-semibold",
              recommendation.tone === "primary"
                ? "bg-primary/10 text-primary"
                : "border border-[color-mix(in_oklab,var(--brand-accent)_45%,transparent)] bg-[color-mix(in_oklab,var(--brand-accent)_14%,transparent)] text-foreground"
            )}
          >
            <Sparkles className="size-3.5 shrink-0" aria-hidden="true" />
            {t(recommendation.key, recommendation.label)}
          </span>
        ) : null}
      </div>

      {/* السعر */}
      <div className="flex flex-col gap-2">
        <div className="flex items-baseline gap-2">
          <span
            className={cn(
              "font-extrabold tracking-tight",
              compact ? "text-3xl" : "text-4xl"
            )}
          >
            {priceLabel}
          </span>
          <span className="text-sm text-muted-foreground">
            {trip.roundTrip
              ? t("priceFor.roundTrip", "للرحلة ذهاباً وعودة")
              : t("priceFor.oneWay", "للرحلة كاملة")}
          </span>
        </div>
        {isEstimate ? <EstimateBadge t={t} /> : null}
      </div>

      {/* تفصيل السعر — عنصر details أصلي: يعمل بلا JavaScript وبحالة معلن عنها */}
      <details className="group/details rounded-2xl border border-border bg-muted/40">
        <summary className="flex cursor-pointer list-none items-center justify-between gap-2 rounded-2xl px-3 py-2.5 text-sm font-medium outline-none focus-visible:ring-3 focus-visible:ring-ring/50 [&::-webkit-details-marker]:hidden">
          {t("details.toggle", "تفاصيل السعر")}
          <ChevronDown
            className="size-4 shrink-0 text-muted-foreground transition-transform duration-200 group-open/details:rotate-180"
            aria-hidden="true"
          />
        </summary>
        <div id={detailsId} className="flex flex-col gap-2 px-3 pb-3 pt-1 text-sm">
          <ul className="flex flex-col gap-1.5">
            {rows.map((row) => (
              <li key={row.label} className="flex items-center justify-between gap-3">
                <span className="text-muted-foreground">{row.label}</span>
                <span className="font-medium">{row.value}</span>
              </li>
            ))}
          </ul>
          <div className="mt-1 flex items-center justify-between gap-3 border-t border-border pt-2">
            <span className="font-semibold">{t("details.total", "الإجمالي")}</span>
            <span className="font-bold">{priceLabel}</span>
          </div>
          <p className="text-xs leading-6 text-muted-foreground">
            {t(
              "details.note",
              "البنود أعلاه مكوّنات السعر، والإجمالي هو الناتج النهائي بعد تطبيقها."
            )}
          </p>
        </div>
      </details>

      {/* الدعوة للحجز: الحجز الإلكتروني أولاً، والواتساب قناة ثانوية للاستفسار */}
      <div className="mt-auto flex flex-col gap-2">
        {canBook ? (
          <button
            type="button"
            onClick={() => onBook(offer)}
            aria-label={t("bookAria", "احجز {vehicle} بسعر {price}", {
              vehicle: offer.classTitle,
              price: priceLabel,
            })}
            className={cn(
              "inline-flex h-12 items-center justify-center gap-2 rounded-2xl px-5 text-base font-semibold transition-all focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50",
              rank === 0
                ? "bg-primary text-primary-foreground shadow-lg shadow-primary/25 hover:bg-primary/90"
                : "border border-border bg-background hover:bg-muted"
            )}
          >
            <CircleCheck className="size-5 shrink-0" aria-hidden="true" />
            {t("book", "احجز هذه السيارة")}
          </button>
        ) : (
          // بلا إحداثيات لا يمكن إعادة حساب المسافة على الخادم ⇒ نبقي القناة المباشرة
          <a
            href={href}
            {...(isExternal ? { target: "_blank", rel: "noopener noreferrer" } : {})}
            aria-label={t(
              "bookViaContactAria",
              "احجز {vehicle} بسعر {price} عبر التواصل المباشر",
              { vehicle: offer.classTitle, price: priceLabel }
            )}
            className={cn(
              "inline-flex h-12 items-center justify-center gap-2 rounded-2xl px-5 text-base font-semibold transition-all focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50",
              rank === 0
                ? "bg-primary text-primary-foreground shadow-lg shadow-primary/25 hover:bg-primary/90"
                : "border border-border bg-background hover:bg-muted"
            )}
          >
            <MessageCircle className="size-5 shrink-0" aria-hidden="true" />
            {t("book", "احجز هذه السيارة")}
          </a>
        )}

        {canBook && contact?.whatsapp ? (
          <a
            href={href}
            target="_blank"
            rel="noopener noreferrer"
            aria-label={t("inquireWhatsappAria", "استفسر عبر واتساب عن {vehicle}", {
              vehicle: offer.classTitle,
            })}
            className="inline-flex h-10 items-center justify-center gap-2 rounded-2xl border border-border bg-background px-4 text-sm font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
          >
            <MessageCircle className="size-4 shrink-0" aria-hidden="true" />
            {t("inquireWhatsapp", "استفسر عبر واتساب")}
          </a>
        ) : null}
      </div>
    </div>
  );
}

/** دعوة لطلب عرض سعر — لما هو خارج الحاسبة أو حين لا تتسع الفئات للمجموعة */
function QuoteRequestNote({
  standalone = false,
  t,
  locale,
}: {
  standalone?: boolean;
  t: Tx;
  locale: string;
}) {
  const href = localePath(locale, QUOTE_REQUEST_PATH);
  if (standalone) {
    return (
      <div className="flex flex-col items-start gap-3 rounded-2xl border border-border bg-muted/40 px-4 py-4">
        <p className="text-sm font-medium leading-7">
          {t(
            "quoteRequest.standalone",
            "لا توجد فئة تتسع لهذه الرحلة عبر الحاسبة — نرتّبها لك يدوياً بأكثر من سيارة."
          )}
        </p>
        <a
          href={href}
          className="inline-flex h-11 items-center justify-center gap-2 rounded-2xl bg-primary px-5 text-sm font-semibold text-primary-foreground shadow-lg shadow-primary/25 transition-all hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
        >
          <FileText className="size-4 shrink-0" aria-hidden="true" />
          {t("quoteRequest.cta", "اطلب عرض سعر")}
        </a>
      </div>
    );
  }

  return (
    <p className="text-xs leading-6 text-muted-foreground">
      {t("quoteRequest.inlinePrefix", "رحلتك خارج الحاسبة (جولة، مناسبة، إيجار يومي)؟")}{" "}
      <a
        href={href}
        className="font-medium text-primary underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
      >
        {t("quoteRequest.cta", "اطلب عرض سعر")}
      </a>{" "}
      {t("quoteRequest.inlineSuffix", "ونرد عليك بعرض مخصص.")}
    </p>
  );
}

/** قائمة العروض مع ترويسة تلخّص المسار والمسافة والمدة */
export function Offers({
  offers,
  distanceKm,
  durationMin,
  distanceSource,
  trip,
  contact,
  compact = false,
  locale = DEFAULT_LOCALE,
}: OffersProps) {
  const t = useT("booking.offers");
  const fmt = React.useMemo(() => createFormatter(locale), [locale]);
  const [bookingOffer, setBookingOffer] = React.useState<Offer | null>(null);

  const checkoutTrip = toCheckoutTrip(trip);
  const canBook = checkoutTrip !== null;

  // تغيّر الرحلة (بحث جديد) يُلغي أي مسار حجز مفتوح على عرض قديم.
  // نمط «تعديل الحالة عند تغيّر الخصائص» الموثّق في React: تعديل أثناء العرض
  // يعيد التصيير فوراً قبل أي رسم — لا وميض ولا تأثير جانبي.
  const tripKey = `${trip.originLabel}|${trip.destinationLabel}|${trip.passengers}|${trip.roundTrip}|${trip.waitingHours}`;
  const [lastTripKey, setLastTripKey] = React.useState(tripKey);
  if (lastTripKey !== tripKey) {
    setLastTripKey(tripKey);
    if (bookingOffer) setBookingOffer(null);
  }

  if (offers.length === 0) return <QuoteRequestNote standalone t={t} locale={locale} />;

  const isEstimate = distanceSource === "estimate";

  // مسار الحجز يحل محل البطاقات في نفس المكان — بلا تنقل بين الصفحات
  if (bookingOffer && checkoutTrip) {
    return (
      <Checkout
        offer={bookingOffer}
        trip={checkoutTrip}
        compact={compact}
        locale={locale}
        onBack={() => setBookingOffer(null)}
      />
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {/* ملخص الرحلة */}
      <div className="flex flex-col gap-2 rounded-2xl border border-border bg-muted/40 px-4 py-3">
        <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm font-medium">
          <Route className="size-4 shrink-0 text-primary" aria-hidden="true" />
          <span>{trip.originLabel}</span>
          <span className="text-muted-foreground" aria-hidden="true">
            ←
          </span>
          <span>{trip.destinationLabel}</span>
        </p>
        <p className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
          <span>
            {t("summary.distance", "المسافة: {value}", { value: fmt.distance(distanceKm) })}
          </span>
          {durationMin !== null ? (
            <span className="inline-flex items-center gap-1">
              <Clock className="size-3.5 shrink-0" aria-hidden="true" />
              {t("summary.duration", "نحو {value}", { value: fmt.duration(durationMin) })}
            </span>
          ) : null}
          <span>{fmt.passengers(trip.passengers)}</span>
          <span>
            {trip.roundTrip
              ? t("summary.roundTrip", "ذهاب وعودة")
              : t("summary.oneWay", "ذهاب فقط")}
          </span>
          {trip.waitingHours > 0 ? (
            <span>
              {t("summary.waiting", "انتظار: {value}", {
                value: fmt.hours(trip.waitingHours),
              })}
            </span>
          ) : null}
        </p>
      </div>

      <ul
        className={cn(
          "grid gap-4",
          offers.length > 1 && !compact ? "sm:grid-cols-2" : "grid-cols-1"
        )}
      >
        {offers.map((offer, index) => (
          <li key={offer.classSlug} className="flex">
            <OfferCard
              offer={offer}
              rank={index}
              isEstimate={isEstimate}
              trip={trip}
              contact={contact}
              compact={compact}
              canBook={canBook}
              onBook={setBookingOffer}
              t={t}
              fmt={fmt}
              locale={locale}
            />
          </li>
        ))}
      </ul>

      <p className="text-xs leading-6 text-muted-foreground">
        {t(
          "priceNote",
          "السعر يُحتسب آلياً حسب المسافة وعدد الركاب وخيارات رحلتك، ويُثبَّت عند تأكيد الحجز. تدفع كامل المبلغ أو عربوناً والباقي مع السائق."
        )}
      </p>

      <QuoteRequestNote t={t} locale={locale} />
    </div>
  );
}
