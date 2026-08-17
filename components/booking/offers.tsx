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
import type { DistanceSource } from "@/lib/pricing-types";
import type { ExtraSelection } from "@/lib/extras-types";
import { DEFAULT_LOCALE, localePath } from "@/lib/i18n-types";
import { useT, type Tx } from "@/components/site/i18n";
import type { PromoBanner } from "@/lib/discount-types";
import { createFormatter, type LocaleFormatter } from "./format";
import { PromoBanners } from "./promo-banner";
import { Checkout, type CheckoutTrip } from "./checkout/checkout";
import type { OfferWithExtras } from "./extras";

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
  /**
   * ساعات الانتظار **كما اشتقّتها القاعدة** من موعدَي الذهاب والعودة
   * (‏`derive_waiting_hours` عبر `/api/quote`) — لا كما قدّرها المتصفح.
   */
  waitingHours: number;
  originLat?: number | null;
  originLng?: number | null;
  destLat?: number | null;
  destLng?: number | null;
  /** الدفعة ٣ — تُمرَّر كما هي إلى مسار الحجز، ولا يُحسب منها شيء هنا */
  luggage?: number;
  pickupAt?: string | null;
  returnAt?: string | null;
  /** اختيار الخدمات: رموز وكميات فقط، ولا سعر (D-09) */
  extras?: ExtraSelection[];
};

/** رابط صفحة طلب عرض سعر — لما هو خارج الحاسبة (جولات، مناسبات، إيجار يومي) */
const QUOTE_REQUEST_PATH = "/quote-request";

/**
 * ما يُحمَل معه العميل إلى `/quote-request` حين تعجز الحاسبة عن رحلته.
 *
 * ── لماذا يُحمَل شيء أصلاً ──────────────────────────────────────────────────
 * العميل كتب المسار والعدد والموعد مرةً بالفعل. وبطاقةُ مخرجٍ تُلقيه على نموذج
 * فارغ تطلب منه كتابة كل شيء من جديد هي **مخرجٌ يزيد الكلفة لا يقلّلها** — وهو
 * بالضبط الجمهور الذي يُفترض أن ننقذه: المجموعة والوفد والمؤتمر.
 *
 * ── 🔒 وما لا يُحمَل أبداً ─────────────────────────────────────────────────
 * **لا اسم ولا هاتف في الرابط.** الرابط يُشارَك ويُلصَق ويبقى في تاريخ المتصفح
 * وفي سجلات أي وسيط، ونموذجُ `/quote-request` يسأل عنهما بنفسه بعد سطرين. وما
 * يُحمل هنا (أسماء أماكن اختارها العميل من الاقتراحات + عدد + موعد) هو نصُّ
 * الرحلة لا هوية صاحبها.
 *
 * ⚠ **والحقول أسماءٌ متفق عليها مع الصفحة المستقبِلة**: `service` وحده تقرؤه
 * `app/quote-request/page.tsx` اليوم؛ والأربعة الباقية تُحمَل ولا تُقرأ بعد،
 * وقراءتها عملُ من يملك تلك الصفحة (انظر التقرير المرفق بهذا العمل).
 */
export type QuoteRequestPrefill = {
  /** رمز الخدمة كما في `SERVICES` — يُقرأ اليوم في `?service=` */
  service?: string | null;
  passengers?: number | null;
  /** موعد الانطلاق ISO — موجود في الذهاب والعودة وحدها (الاتجاه الواحد لا يسأله) */
  pickupAt?: string | null;
  from?: string | null;
  to?: string | null;
};

/**
 * أقصى طول لاسم مكان داخل الرابط. الإكمال التلقائي (Nominatim) يُنتج عناوين
 * مُسهبة، وثلاثة منها في رابط واحد تتجاوز حدود بعض الوسطاء — والقصّ يفقد ذيل
 * العنوان لا معناه، والعميل يراه في الحقل ويكمله.
 */
const MAX_PREFILL_LABEL = 120;

/** نصٌّ صالح للرابط، أو `null` — الفارغ لا يُكتب مفتاحاً فارغاً */
function prefillText(value: string | null | undefined): string | null {
  const trimmed = (value ?? "").trim();
  return trimmed.length === 0 ? null : trimmed.slice(0, MAX_PREFILL_LABEL);
}

/**
 * يبني رابط `/quote-request` محمّلاً بما كتبه العميل.
 *
 * `URLSearchParams` تتكفّل بالترميز — والعناوين العربية تمرّ عليها كما هي فلا
 * يُبنى الرابط بلصق نصوص (وهو مصدر «//#services» في `LESSONS.md` القسم ٣).
 * وبلا حمولة يعود المسار وحده بلا `?` معلّقة.
 */
export function buildQuoteRequestHref(locale: string, prefill?: QuoteRequestPrefill): string {
  const base = localePath(locale, QUOTE_REQUEST_PATH);
  if (!prefill) return base;

  const params = new URLSearchParams();

  const service = prefillText(prefill.service);
  if (service) params.set("service", service);

  const { passengers } = prefill;
  if (typeof passengers === "number" && Number.isFinite(passengers) && passengers > 0) {
    params.set("passengers", String(Math.trunc(passengers)));
  }

  const pickup = prefillText(prefill.pickupAt);
  if (pickup) params.set("pickup", pickup);

  const from = prefillText(prefill.from);
  if (from) params.set("from", from);

  const to = prefillText(prefill.to);
  if (to) params.set("to", to);

  // `+` بدل المسافة صحيحٌ في `URLSearchParams` وملتبسٌ عند أي قارئ آخر (وسيط،
  // سجل، لصقٌ يدوي). و`%20` يقرأه الاثنان قراءةً واحدة — فلا يصل «مطار+القاهرة»
  // إلى حقلٍ في النموذج.
  const query = params.toString().replace(/\+/g, "%20");
  return query.length === 0 ? base : `${base}?${query}`;
}

/** ملخص الرحلة ⇐ حمولة الرابط — بلا اسم ولا هاتف (ولا يملكهما هذا النوع أصلاً) */
export function prefillFromTrip(trip: TripSummary): QuoteRequestPrefill {
  return {
    passengers: trip.passengers,
    pickupAt: trip.pickupAt ?? null,
    from: trip.originLabel,
    to: trip.destinationLabel,
  };
}

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
    luggage: trip.luggage ?? 0,
    pickupAt: trip.pickupAt ?? null,
    returnAt: trip.returnAt ?? null,
    extras: trip.extras ?? [],
  };
}

export type OffersProps = {
  offers: OfferWithExtras[];
  distanceKm: number;
  durationMin: number | null;
  distanceSource: DistanceSource;
  trip: TripSummary;
  contact?: BookingContact;
  /** نسخة مضغوطة (ويدجت البطل) — إيقاع أصغر بنفس المحتوى */
  compact?: boolean;
  /** لغة الزائر — تصل من الصفحة الخادمية، وغيابها يعني العربية */
  locale?: string;
  /** نظام الخصومات مفعَّل — غيابه يعني مطفأ (الافتراضي الآمن) */
  discountEnabled?: boolean;
  /**
   * نظام الولاء مفعَّل (المرحلة ١٢ب) — رايةٌ لا رقم، بنفس منطق أختها أعلاه.
   * غيابها يعني **مطفأ**: لا تُسأل خدمة معاينة النقاط أصلاً في مسار الحجز.
   */
  loyaltyEnabled?: boolean;
  /** بانرات موضع «شاشة العروض» — عرض فقط */
  offerBanners?: PromoBanner[];
  /** بانرات موضع «صفحة الحجز» — تمرّ إلى مسار الحجز */
  checkoutBanners?: PromoBanner[];
  /**
   * 🔴 «مسار إتمام الحجز مفتوح الآن» — يُبلَّغ به الويدجت فوقنا.
   *
   * ولماذا يحتاجه: الويدجت يطوي نموذج بيانات الرحلة إلى **سطرٍ فيه «تعديل»**
   * بعد وصول الأسعار. وذلك السطر صحيحٌ فوق البطاقات، **وخطرٌ فوق مسار الحجز**
   * لسببين:
   *
   * ١ **تكرار**: بطاقة الملخّص أعلى المسار تقول الشيء نفسه حرفاً (المسار
   *   والركاب والحقائب ونوع الرحلة) — فسطرٌ ثانٍ ارتفاعٌ بلا معلومة، على
   *   شاشةٍ نقصّرها.
   *
   * ٢ 🔒 **وفقدُ بيانات**: تعديلُ أي مُدخل سعري يغيّر `tripKey` أدناه فيسقط
   *   `bookingOffer`، **ويُفكَّك مسار الحجز بما فيه** — الاسم والهاتف
   *   والملاحظات. وهو سلوكٌ صحيح (سعرٌ قديم لا يُحجَز به)، لكن وضعَ زرّ
   *   «تعديل» فوق النموذج مباشرةً دعوةٌ إليه. والطريق الصحيح للرجوع معلَنٌ
   *   داخل المسار نفسه: «رجوع إلى العروض».
   */
  onCheckoutOpenChange?: (open: boolean) => void;
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
  offer: OfferWithExtras,
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
  if ((trip.luggage ?? 0) > 0) {
    lines.push(
      t("inquiry.luggage", "عدد الحقائب: {value}", { value: fmt.digits(trip.luggage ?? 0) })
    );
  }
  if (trip.returnAt) {
    lines.push(
      t("inquiry.returnAt", "موعد العودة: {value}", { value: fmt.dateTime(trip.returnAt) ?? "" })
    );
  }
  if (trip.waitingHours > 0) {
    lines.push(
      t("inquiry.waiting", "ساعات الانتظار: {value}", {
        value: fmt.hours(trip.waitingHours),
      })
    );
  }
  // الخدمات بأسمائها كما سعّرتها القاعدة — رسالةٌ تُغفلها تجعل القناة المباشرة
  // تُسعّر رحلة أخرى غير التي رآها العميل.
  for (const line of offer.extras) {
    lines.push(
      t("inquiry.extra", "خدمة: {title} × {qty}", {
        title: line.title,
        qty: fmt.digits(line.qty),
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
  offer: OfferWithExtras,
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
  offer: OfferWithExtras,
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
  offer: OfferWithExtras;
  rank: number;
  isEstimate: boolean;
  trip: TripSummary;
  contact?: BookingContact;
  compact?: boolean;
  /** الحجز الإلكتروني متاح (الإحداثيات حاضرة) */
  canBook: boolean;
  onBook: (offer: OfferWithExtras) => void;
  t: Tx;
  fmt: LocaleFormatter;
  locale: string;
}) {
  const Icon = CLASS_ICONS[offer.classSlug] ?? Car;
  const recommendation = RECOMMENDATIONS[rank];
  const rows = breakdownRows(offer, t, fmt);
  /** الخدمات موجودة فعلاً في هذا العرض — لا نستنتجها من `extrasTotal` وحده */
  const hasExtras = offer.extras.length > 0;
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

          {/*
            الخدمات بند مستقل بعد سعر الرحلة — كما تفعل القاعدة حرفياً:
            `total = ride_total + extras_total` والخصم يقع على الرحلة وحدها.
            سطرا «إجمالي الرحلة» و«الخدمات» لا يظهران حين لا خدمات، فلا صف صفري.
          */}
          {hasExtras ? (
            <>
              <div className="mt-1 flex items-center justify-between gap-3 border-t border-border pt-2">
                <span className="font-medium">{t("details.rideTotal", "إجمالي الرحلة")}</span>
                <span className="font-semibold">{fmt.money(offer.rideTotal, offer.currency)}</span>
              </div>
              <ul className="flex flex-col gap-1.5">
                {offer.extras.map((line) => (
                  <li key={line.slug} className="flex items-center justify-between gap-3">
                    <span className="text-muted-foreground">
                      {line.qty > 1
                        ? t("details.extraLine", "{title} × {qty}", {
                            title: line.title,
                            qty: fmt.digits(line.qty),
                          })
                        : line.title}
                    </span>
                    <span className="font-medium">{fmt.money(line.lineTotal, offer.currency)}</span>
                  </li>
                ))}
              </ul>
              <div className="flex items-center justify-between gap-3">
                <span className="text-muted-foreground">
                  {t("details.extrasTotal", "الخدمات الإضافية")}
                </span>
                <span className="font-medium">
                  {fmt.money(offer.extrasTotal, offer.currency)}
                </span>
              </div>
            </>
          ) : null}

          <div className="mt-1 flex items-center justify-between gap-3 border-t border-border pt-2">
            <span className="font-semibold">{t("details.total", "الإجمالي")}</span>
            <span className="font-bold">{priceLabel}</span>
          </div>
          <p className="text-xs leading-6 text-muted-foreground">
            {hasExtras
              ? t(
                  "details.noteWithExtras",
                  "البنود أعلاه مكوّنات سعر الرحلة، والخدمات تُضاف إليه كبند مستقل — وأي رمز خصم يخصم سعر الرحلة وحده."
                )
              : t(
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

/**
 * سبب عجز الحاسبة كما فرّقه `/api/quote` **برمزه لا بجملته**.
 *
 * الخادم يعرف أي الشرطين سقط (ركاب وحدهم أم ركاب وحقائب معاً) ولا يعرفه هذا
 * المكوّن؛ لكن **النصّ يُختار هنا** من `messages/*.json` لا هناك — وإلا وصلت
 * جملةٌ عربية مؤلَّفة في الخادم إلى زائر `/en` فغلبت ترجمته.
 * و`undefined` تعني «سببٌ غير معروف» فيبقى النص العام صحيحاً في الحالتين.
 */
export type NoClassesReason = "passengers" | "luggage";

/** دعوة لطلب عرض سعر — لما هو خارج الحاسبة أو حين لا تتسع الفئات للمجموعة */
function QuoteRequestNote({
  standalone = false,
  reason,
  prefill,
  t,
  locale,
}: {
  standalone?: boolean;
  reason?: NoClassesReason;
  prefill?: QuoteRequestPrefill;
  t: Tx;
  locale: string;
}) {
  const href = buildQuoteRequestHref(locale, prefill);
  if (standalone) {
    return (
      <div className="flex flex-col items-start gap-3 rounded-2xl border border-border bg-muted/40 px-4 py-4">
        {/*
          نصٌّ لكل سبب — ونصيحة «جرّب حقائب أقل» لا تُقال لمن لم يُعلن حقيبة
          أصلاً: كانت الجملتان تفرّقان ذلك في الخادم، والفرق محفوظ هنا بالرمز.
        */}
        <p className="text-sm font-medium leading-7">
          {reason === "luggage"
            ? t(
                "quoteRequest.standaloneLuggage",
                "لا توجد فئة سيارات تتسع لعدد الركاب وعدد الحقائب معاً — جرّب حقائب أقل، أو اطلب عرض سعر مخصص ونرتّب لك أكثر من سيارة."
              )
            : reason === "passengers"
              ? t(
                  "quoteRequest.standalonePassengers",
                  "لا توجد فئة سيارات واحدة تتسع لهذا العدد من الركاب — نرتّب لك أكثر من سيارة بعرض سعر مخصص."
                )
              : t(
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
        {/* لا نَعِد بحفظ ما لم نحمله: النص يقول ما ينتقل معه بالضبط */}
        <p className="text-xs leading-6 text-muted-foreground">
          {t(
            "quoteRequest.carried",
            "ننقل معك تفاصيل رحلتك إلى النموذج — يبقى اسمك ورقمك لتكتبهما هناك."
          )}
        </p>
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

/**
 * بطاقة الإنقاذ حين ترد `/api/quote` بـ`no-classes` — **خارج شجرة `Offers`**.
 *
 * ── لماذا وُلدت هذه الصادرة ────────────────────────────────────────────────
 * النسخة القائمة داخل `Offers` (‏`offers.length === 0`) كانت **كوداً ميتاً**:
 * المسار لا يُرجع مصفوفة عروض فارغة أبداً — يُرجع `ok:false, code:"no-classes"`،
 * فيمسح الويدجت النتيجة و`Offers` لا يُصيَّر أصلاً. أي أن الطريق كُتب ثم دُفن،
 * والعميل يرى صندوقاً أحمر ويغادر (النمط ٣ في `handover/LESSONS.md`).
 * فصار المخرجُ مكوّناً يناديه الويدجت مباشرةً عند ذلك الرمز بعينه.
 *
 * ويملك ترجمته بنفسه (`booking.offers`) لأن مُناديه يعيش في مساحة أخرى
 * (`booking.search`) — فلا يُمرَّر `t` من نطاق لا تخصّه نصوصه.
 *
 * 🔒 **ويأخذ `reason` رمزاً لا `message` جملةً**: كان الويدجت يمرّر إليه الجملة
 * التي ألّفها `/api/quote` بالعربية فتُطبع كما هي، وتغلب نصَّ `messages/en.json`
 * على `/en`. الآن يصل السبب رمزاً ويُختار النص من ملفَّي الرسائل.
 */
export function NoClassesRescue({
  reason,
  prefill,
  locale = DEFAULT_LOCALE,
}: {
  reason?: NoClassesReason;
  prefill?: QuoteRequestPrefill;
  locale?: string;
}) {
  const t = useT("booking.offers");
  return <QuoteRequestNote standalone reason={reason} prefill={prefill} t={t} locale={locale} />;
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
  discountEnabled = false,
  loyaltyEnabled = false,
  offerBanners = [],
  checkoutBanners = [],
  onCheckoutOpenChange,
}: OffersProps) {
  const t = useT("booking.offers");
  const fmt = React.useMemo(() => createFormatter(locale), [locale]);
  const [bookingOffer, setBookingOffer] = React.useState<OfferWithExtras | null>(null);

  /**
   * إبلاغ الأب بحالة المسار — **في أثر لا أثناء التصيير**: تعديلُ حالة مكوّنٍ
   * آخر أثناء تصيير هذا يرفضه React. والأثر يشمل الإسقاط التلقائي أدناه
   * (بحثٌ جديد يُلغي مساراً مفتوحاً) فلا يبقى الأب على خبرٍ قديم.
   */
  React.useEffect(() => {
    onCheckoutOpenChange?.(bookingOffer !== null);
  }, [bookingOffer, onCheckoutOpenChange]);

  const checkoutTrip = toCheckoutTrip(trip);
  const canBook = checkoutTrip !== null;

  // تغيّر الرحلة (بحث جديد) يُلغي أي مسار حجز مفتوح على عرض قديم.
  // نمط «تعديل الحالة عند تغيّر الخصائص» الموثّق في React: تعديل أثناء العرض
  // يعيد التصيير فوراً قبل أي رسم — لا وميض ولا تأثير جانبي.
  // كل مُدخل يغيّر السعر داخل المفتاح — وإلا بقي مسار الحجز مفتوحاً على عرض
  // قديم بعد تغيير الحقائب أو الخدمات أو موعد العودة.
  const tripKey = [
    trip.originLabel,
    trip.destinationLabel,
    trip.passengers,
    trip.roundTrip,
    trip.waitingHours,
    trip.luggage ?? 0,
    trip.pickupAt ?? "",
    trip.returnAt ?? "",
    (trip.extras ?? []).map((item) => `${item.slug}:${item.qty}`).join(","),
  ].join("|");
  const [lastTripKey, setLastTripKey] = React.useState(tripKey);
  if (lastTripKey !== tripKey) {
    setLastTripKey(tripKey);
    if (bookingOffer) setBookingOffer(null);
  }

  // احتياطٌ لا مسارٌ حيّ: `/api/quote` يردّ `no-classes` قبل أن تصل مصفوفة فارغة
  // إلى هنا، والمخرج الحيّ هو `NoClassesRescue` في الويدجت. يبقى هذا الفرع لأن
  // `Offers` مكوّن عام قد يناديه مستدعٍ آخر بمصفوفة فارغة — وحينها ينبغي أن يجد
  // الزائر مخرجاً لا فراغاً.
  if (offers.length === 0) {
    return <QuoteRequestNote standalone t={t} locale={locale} prefill={prefillFromTrip(trip)} />;
  }

  const isEstimate = distanceSource === "estimate";

  // مسار الحجز يحل محل البطاقات في نفس المكان — بلا تنقل بين الصفحات
  if (bookingOffer && checkoutTrip) {
    return (
      <Checkout
        offer={bookingOffer}
        trip={checkoutTrip}
        compact={compact}
        locale={locale}
        discountEnabled={discountEnabled}
        loyaltyEnabled={loyaltyEnabled}
        banners={checkoutBanners}
        onBack={() => setBookingOffer(null)}
      />
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {/* بانرات موضع «شاشة العروض» — فوق البطاقات، بلا أثر على أي سعر معروض */}
      <PromoBanners banners={offerBanners} compact={compact} />

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
          {(trip.luggage ?? 0) > 0 ? (
            <span>
              {t("summary.luggage", "الحقائب: {value}", {
                value: fmt.digits(trip.luggage ?? 0),
              })}
            </span>
          ) : null}
          <span>
            {trip.roundTrip
              ? t("summary.roundTrip", "ذهاب وعودة")
              : t("summary.oneWay", "ذهاب فقط")}
          </span>
          {trip.returnAt ? (
            <span>
              {t("summary.returnAt", "العودة: {value}", {
                value: fmt.dateTime(trip.returnAt) ?? "",
              })}
            </span>
          ) : null}
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

      {/* السطر الأخير تحت البطاقات: الرحلة معروضة، لكن قد تكون جولةً لا نقلة —
          وهو يحمل ما كتبه العميل كما تحمله بطاقة الإنقاذ حرفياً. */}
      <QuoteRequestNote t={t} locale={locale} prefill={prefillFromTrip(trip)} />
    </div>
  );
}
