"use client";

import * as React from "react";
import Link from "next/link";
import {
  CalendarClock,
  CircleCheck,
  LoaderCircle,
  Luggage,
  MapPin,
  MapPinned,
  Send,
  TriangleAlert,
  Users,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { DEFAULT_LOCALE, localePath } from "@/lib/i18n-types";
import type { ServiceDef } from "@/lib/site-config";
import type { GeoPlace } from "@/lib/pricing-types";
import type { PlaceSearchSettings } from "@/lib/place-search-types";
import { useT } from "@/components/site/i18n";
import { trackBrowserFunnel } from "@/lib/analytics/browser";
import { createFormatter } from "@/components/booking/format";
import { PlaceField } from "@/components/booking/place-field";
import {
  minInputValues,
  todayInputValue,
  toIsoFromCairoInputs,
} from "@/components/booking/checkout/datetime";
import type { QuoteTripPrefill } from "../_lib/prefill";

/**
 * نموذج «اطلب عرض سعر» — لما هو خارج الحاسبة الفورية: الجولات والمناسبات
 * والإيجار اليومي والمجموعات الكبيرة.
 *
 * ══════════════════════════════════════════════════════════════════════════
 *  🔴 ما تغيّر في ب‑١: الطلب صار **بياناً يُسعَّر** لا فقرةً تُقرأ
 * ══════════════════════════════════════════════════════════════════════════
 *
 * كان النموذج ثلاثة حقول (اسم · هاتف · فقرة حرّة)، فيصل الإدارة نصٌّ لا يُقاس
 * عليه شيء: لا مسافة، ولا موعد يدخل التقويم، ولا عدد يحدّد الأسطول. صار يحمل
 * **نقطتين بإحداثياتهما وموعداً وعدد ركاب وحقائب**.
 *
 * 🔒 وحقلا المكان هما `PlaceField` **نفسه** الذي يستعمله ويدجت الحجز — لا نسخةٌ
 * ثانية (القاعدة ١٢). يعني ذلك أن الطلب يرث البحث الرباعي كاملاً بلا سطرٍ
 * مكرَّر: جوجل ← Nominatim ← «حدّد على الخريطة» ← الطبقة الرابعة؛ ودورة رمز
 * الجلسة التي تجعل الفاتورة واحدة لا سبعاً؛ ورفضَ ما خرج عن نطاق التشغيل.
 *
 * ⚠ **ولا يُسعَّر نصٌّ لم يُحلّ إلى نقطة** (D-09): زرّ الإرسال لا يقبل انطلاقاً
 * كتبه العميل بيده ولم يختره من النتائج — لأن سعراً مبنيّاً على «فندق في
 * الزمالك» سعرٌ نلتزم به ولا نعرف مسافته. والوجهة **اختيارية** لأن الجولة
 * والإيجار اليومي بلا وجهةٍ واحدة، لكنها إن ذُكرت فبالشرط نفسه.
 *
 * ── والموعد يمرّ بمسار التحويل الواحد ─────────────────────────────────────
 * `toIsoFromCairoInputs` هي الدالة نفسها التي يحوّل بها الحجز حقلَي التاريخ
 * والوقت — فما يكتبه العميل **وقتُ الموقع** لا وقتُ جهازه. ومسارا تحويلٍ لقيمةٍ
 * واحدة هو صنف العيب الذي يتكرر في هذا المستودع، فلا يُفتح ثانٍ.
 *
 * ── حمولة بطاقة الإنقاذ ────────────────────────────────────────────────────
 * ما يصل من الرابط **اقتراحُ تعبئة لا واقعة**: الاسم يملأ نصّ الحقل، ويبقى على
 * العميل أن يختاره من النتائج ليصير نقطةً محلولة. وذاك صوابٌ لا نقص — تسميةٌ
 * في رابطٍ يُلصَق ويُصنَع باليد ليست إحداثيات.
 */

type QuoteRequestResponse =
  | { ok: true; reference: string | null }
  | { ok: false; code: string; message: string };

const PHONE_PATTERN = /^[+\d\s()-]{8,20}$/;

/** الحد الأدنى لطول الاسم — نفس ما تقوله رسالة الخطأ */
const NAME_MIN_LENGTH = 3;

/**
 * سقف الركاب هنا **٢٠٠ لا ٦٠**: سقف الويدجت يخصّ رحلةً تُسعَّر فوراً بسيارة
 * واحدة، وهذه الصفحة وُجدت للوفود التي تتجاوز ذلك — وهو نفس مدى القاعدة (0084).
 */
const MAX_PASSENGERS = 200;
const MAX_LUGGAGE = 400;

type FieldErrors = Partial<
  Record<"origin" | "destination" | "pickup" | "passengers" | "name" | "phone", string>
>;

export function QuoteRequestForm({
  defaultService,
  tripPrefill,
  services,
  placeSearch,
  locale = DEFAULT_LOCALE,
}: {
  defaultService?: string;
  /** ما حملته بطاقة الإنقاذ في الرابط — **منقّى** في `_lib/prefill.ts` */
  tripPrefill?: QuoteTripPrefill;
  /** الخدمات بلغة الزائر — تصل من الصفحة الخادمية */
  services: ServiceDef[];
  /** إعدادات بحث الأماكن من اللوحة — ضابط تكلفة يملكه المالك (هجرة 0076) */
  placeSearch: PlaceSearchSettings;
  /** لغة الزائر — تصل من الصفحة الخادمية، وغيابها يعني العربية */
  locale?: string;
}) {
  const t = useT("pages.quoteRequest.form");
  const fmt = React.useMemo(() => createFormatter(locale), [locale]);
  const uid = React.useId();

  const [serviceSlug, setServiceSlug] = React.useState(defaultService ?? "");

  // المكان: نصٌّ يكتبه العميل + نقطةٌ محلولة. والثاني وحده يُرسَل.
  const [originText, setOriginText] = React.useState(tripPrefill?.from ?? "");
  const [origin, setOrigin] = React.useState<GeoPlace | null>(null);
  const [destText, setDestText] = React.useState(tripPrefill?.to ?? "");
  const [destination, setDestination] = React.useState<GeoPlace | null>(null);

  // الموعد: حقلان يقرؤهما العميل، وتحويلٌ واحد إلى لحظةٍ مطلقة عند الإرسال.
  // والاتجاه المعاكس (لحظة ⇐ حقلين) له دالته الجاهزة `minInputValues` — تقرأ
  // بمنطقة الموقع لا بمنطقة الجهاز، وهي جارة `toIsoFromCairoInputs` في نفس
  // الملف بقصد: مسار تحويلٍ واحد للاتجاهين (القاعدة ١٢).
  //
  // والحساب في **مُهيّئٍ كسول** لا في `useMemo`: القيمة تُقرأ مرةً واحدة عند
  // التركيب، وبعدها الحقل ملك العميل. و`useMemo` هنا كان يَعِد بتحديثٍ لا يقع.
  const [pickupDate, setPickupDate] = React.useState(
    () => (tripPrefill?.pickupAt ? (minInputValues(tripPrefill.pickupAt)?.date ?? "") : "")
  );
  const [pickupTime, setPickupTime] = React.useState(
    () => (tripPrefill?.pickupAt ? (minInputValues(tripPrefill.pickupAt)?.time ?? "") : "")
  );

  const [passengers, setPassengers] = React.useState(
    tripPrefill?.passengers ? String(tripPrefill.passengers) : "1"
  );
  const [luggage, setLuggage] = React.useState("");

  const [name, setName] = React.useState("");
  const [phone, setPhone] = React.useState("");
  const [details, setDetails] = React.useState("");

  const [errors, setErrors] = React.useState<FieldErrors>({});
  const [submitError, setSubmitError] = React.useState<string | null>(null);
  const [submitting, setSubmitting] = React.useState(false);
  const [reference, setReference] = React.useState<string | null>(null);
  const [done, setDone] = React.useState(false);

  const fieldHeight = "h-12";
  const fieldClass =
    "h-12 w-full rounded-2xl border border-input bg-background px-3 text-base outline-none transition-colors focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50";

  /** أرضية حقل التاريخ بتوقيت الموقع — لا بتوقيت جهاز الزائر */
  const minDate = React.useMemo(() => todayInputValue(), []);

  function isPhoneValid(value: string): boolean {
    const trimmed = value.trim();
    if (!PHONE_PATTERN.test(trimmed)) return false;
    const digits = trimmed.replace(/\D/g, "");
    return digits.length >= 8 && digits.length <= 15;
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting) return;

    const found: FieldErrors = {};

    // 🔴 نقطةٌ محلولة أو لا إرسال — والنصّ المكتوب وحده ليس نقطة
    if (!origin) {
      found.origin = originText.trim()
        ? t("errors.originUnresolved", "اختر نقطة الانطلاق من نتائج البحث حتى نعرف مكانها بالضبط.")
        : t("errors.originRequired", "حدّد نقطة الانطلاق.");
    }
    if (!destination && destText.trim()) {
      found.destination = t(
        "errors.destinationUnresolved",
        "اختر الوجهة من نتائج البحث، أو امسح الحقل إن كانت الرحلة بلا وجهة واحدة."
      );
    }

    const pickupIso = toIsoFromCairoInputs(pickupDate, pickupTime);
    if (!pickupIso) {
      found.pickup = t("errors.pickupRequired", "حدّد تاريخ الرحلة ووقتها.");
    } else if (Date.parse(pickupIso) <= Date.now()) {
      found.pickup = t("errors.pickupPast", "موعد الرحلة يجب أن يكون في المستقبل.");
    }

    const paxNumber = Number(passengers);
    if (!Number.isInteger(paxNumber) || paxNumber < 1 || paxNumber > MAX_PASSENGERS) {
      found.passengers = t("errors.passengersInvalid", "اكتب عدد الركاب (واحد على الأقل).");
    }

    if (name.trim().length < NAME_MIN_LENGTH) {
      found.name = t("errors.nameTooShort", "اكتب اسمك كاملاً (٣ أحرف على الأقل).", {
        min: fmt.digits(NAME_MIN_LENGTH),
      });
    }
    if (!isPhoneValid(phone)) {
      found.phone = t("errors.phoneInvalid", "اكتب رقم هاتف صحيح للتواصل معك.");
    }

    setErrors(found);
    if (Object.keys(found).length > 0) return;

    const luggageNumber = luggage.trim() === "" ? null : Number(luggage);

    setSubmitting(true);
    setSubmitError(null);
    try {
      const res = await fetch("/api/quote-request", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          serviceSlug: serviceSlug || null,
          customerName: name.trim(),
          customerPhone: phone.trim(),
          details: details.trim(),
          // الثلاثي كما حلّه مكوّن البحث — لا نصّ الحقل
          origin: origin ? { label: origin.label, lat: origin.lat, lng: origin.lng } : null,
          destination: destination
            ? { label: destination.label, lat: destination.lat, lng: destination.lng }
            : null,
          pickupAt: pickupIso,
          passengers: paxNumber,
          luggage:
            luggageNumber !== null && Number.isInteger(luggageNumber) && luggageNumber >= 0
              ? luggageNumber
              : null,
        }),
      });
      const json = (await res.json()) as QuoteRequestResponse;

      if (!json.ok) {
        setSubmitError(
          json.message || t("errors.sendFailed", "تعذّر إرسال طلبك الآن. حاول مرة أخرى.")
        );
        setSubmitting(false);
        return;
      }

      // القمع في المتصفح: نظير `trackFunnel("quote_requested")` في المسار.
      // 🔒 الرقم المرجعي وحده — لا اسم ولا هاتف ولا مكان.
      trackBrowserFunnel("quote_requested", {
        ...(json.reference ? { reference: json.reference } : {}),
      });

      setReference(json.reference);
      setDone(true);
      setSubmitting(false);
    } catch {
      setSubmitError(
        t("errors.network", "تعذّر الاتصال بالخادم. تأكد من اتصالك بالإنترنت وحاول مرة أخرى.")
      );
      setSubmitting(false);
    }
  }

  if (done) {
    return (
      <div className="flex flex-col items-center gap-4 rounded-3xl border border-primary/30 bg-primary/5 p-6 text-center sm:p-8">
        <span className="grid size-14 place-items-center rounded-full bg-primary text-primary-foreground">
          <CircleCheck className="size-7" aria-hidden="true" />
        </span>
        <h2 className="text-xl font-bold">{t("done.title", "وصلنا طلبك")}</h2>
        <p className="max-w-md text-sm leading-7 text-muted-foreground">
          {t(
            "done.text",
            "سيراجع فريقنا تفاصيل رحلتك ويتواصل معك بعرض سعر مخصص على الرقم الذي كتبته."
          )}
        </p>
        {reference ? (
          <div className="flex flex-col items-center gap-1.5">
            <span className="text-xs text-muted-foreground">{t("done.reference", "رقم الطلب")}</span>
            <span
              dir="ltr"
              className="rounded-2xl border border-primary/30 bg-background px-4 py-2 font-mono text-lg font-bold tracking-widest"
            >
              {reference}
            </span>
          </div>
        ) : null}
        <Link
          href={localePath(locale, "/")}
          className="inline-flex h-11 items-center justify-center rounded-2xl border border-border bg-background px-5 text-sm font-medium transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
        >
          {t("done.backHome", "العودة إلى الرئيسية")}
        </Link>
      </div>
    );
  }

  const fieldError = (message: string | undefined) =>
    message ? (
      <p className="flex items-start gap-1.5 text-xs leading-5 text-destructive">
        <TriangleAlert className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
        {message}
      </p>
    ) : null;

  return (
    <form
      onSubmit={handleSubmit}
      noValidate
      className="flex flex-col gap-5 rounded-3xl border border-border bg-card p-5 text-card-foreground shadow-xl shadow-primary/5 sm:p-7"
    >
      {/* ── الرحلة ─────────────────────────────────────────────────── */}
      <div className="flex flex-col gap-4">
        <div className="flex flex-col gap-1.5">
          <PlaceField
            id={`${uid}-origin`}
            label={t("origin", "من أين تبدأ الرحلة")}
            placeholder={t("originPlaceholder", "مثل «مطار القاهرة الدولي»")}
            icon={<MapPin className="size-4" />}
            value={originText}
            place={origin}
            onValueChange={setOriginText}
            onPlaceChange={setOrigin}
            fieldHeight={fieldHeight}
            t={t}
            fmt={fmt}
            settings={placeSearch}
            locale={locale}
          />
          {fieldError(errors.origin)}
        </div>

        <div className="flex flex-col gap-1.5">
          <PlaceField
            id={`${uid}-destination`}
            label={t("destination", "إلى أين (اختياري)")}
            placeholder={t("destinationPlaceholder", "اتركه فارغاً للجولات والإيجار اليومي")}
            icon={<MapPinned className="size-4" />}
            value={destText}
            place={destination}
            onValueChange={setDestText}
            onPlaceChange={setDestination}
            fieldHeight={fieldHeight}
            t={t}
            fmt={fmt}
            settings={placeSearch}
            locale={locale}
          />
          {fieldError(errors.destination) ?? (
            <p className="text-xs leading-5 text-muted-foreground">
              {t("destinationHelp", "برنامج بعدة محطات؟ اتركه فارغاً واكتب المحطات في الملاحظات.")}
            </p>
          )}
        </div>

        <div className="flex flex-col gap-1.5">
          <span className="flex items-center gap-1.5 text-sm font-medium">
            <CalendarClock className="size-4 text-muted-foreground" aria-hidden="true" />
            {t("pickup", "موعد الانطلاق")}
          </span>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            <input
              id={`${uid}-date`}
              type="date"
              min={minDate}
              value={pickupDate}
              onChange={(event) => setPickupDate(event.target.value)}
              aria-invalid={errors.pickup ? true : undefined}
              aria-label={t("pickupDate", "تاريخ الرحلة")}
              className={fieldClass}
            />
            <input
              id={`${uid}-time`}
              type="time"
              value={pickupTime}
              onChange={(event) => setPickupTime(event.target.value)}
              aria-invalid={errors.pickup ? true : undefined}
              aria-label={t("pickupTime", "وقت الرحلة")}
              className={fieldClass}
            />
          </div>
          {fieldError(errors.pickup)}
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="flex flex-col gap-1.5">
            <label
              htmlFor={`${uid}-passengers`}
              className="flex items-center gap-1.5 text-sm font-medium"
            >
              <Users className="size-4 text-muted-foreground" aria-hidden="true" />
              {t("passengers", "عدد الركاب")}
            </label>
            <input
              id={`${uid}-passengers`}
              type="number"
              inputMode="numeric"
              min={1}
              max={MAX_PASSENGERS}
              step={1}
              value={passengers}
              onChange={(event) => setPassengers(event.target.value)}
              aria-invalid={errors.passengers ? true : undefined}
              className={fieldClass}
            />
            {fieldError(errors.passengers)}
          </div>

          <div className="flex flex-col gap-1.5">
            <label
              htmlFor={`${uid}-luggage`}
              className="flex items-center gap-1.5 text-sm font-medium"
            >
              <Luggage className="size-4 text-muted-foreground" aria-hidden="true" />
              {t("luggage", "عدد الحقائب (اختياري)")}
            </label>
            <input
              id={`${uid}-luggage`}
              type="number"
              inputMode="numeric"
              min={0}
              max={MAX_LUGGAGE}
              step={1}
              value={luggage}
              onChange={(event) => setLuggage(event.target.value)}
              className={fieldClass}
            />
          </div>
        </div>
      </div>

      <hr className="border-border" />

      {/* ── الخدمة والتواصل ────────────────────────────────────────── */}
      <div className="flex flex-col gap-1.5">
        <label htmlFor={`${uid}-service`} className="text-sm font-medium">
          {t("service", "نوع الخدمة")}
        </label>
        <select
          id={`${uid}-service`}
          value={serviceSlug}
          onChange={(event) => setServiceSlug(event.target.value)}
          className={fieldClass}
        >
          <option value="">{t("servicePlaceholder", "اختر الخدمة (اختياري)")}</option>
          {services.map((service) => (
            <option key={service.slug} value={service.slug}>
              {service.title}
            </option>
          ))}
        </select>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="flex flex-col gap-1.5">
          <label htmlFor={`${uid}-name`} className="text-sm font-medium">
            {t("name", "الاسم")}
          </label>
          <input
            id={`${uid}-name`}
            type="text"
            autoComplete="name"
            value={name}
            onChange={(event) => setName(event.target.value)}
            aria-invalid={errors.name ? true : undefined}
            className={fieldClass}
          />
          {fieldError(errors.name)}
        </div>

        <div className="flex flex-col gap-1.5">
          <label htmlFor={`${uid}-phone`} className="text-sm font-medium">
            {t("phone", "رقم الهاتف")}
          </label>
          <input
            id={`${uid}-phone`}
            type="tel"
            inputMode="tel"
            dir="ltr"
            autoComplete="tel"
            placeholder={t("phonePlaceholder", "01xxxxxxxxx")}
            value={phone}
            onChange={(event) => setPhone(event.target.value)}
            aria-invalid={errors.phone ? true : undefined}
            className={cn(fieldClass, "text-start")}
          />
          {fieldError(errors.phone)}
        </div>
      </div>

      <div className="flex flex-col gap-1.5">
        <label htmlFor={`${uid}-details`} className="text-sm font-medium">
          {t("details", "ملاحظات إضافية (اختياري)")}
        </label>
        <textarea
          id={`${uid}-details`}
          rows={4}
          maxLength={2000}
          value={details}
          onChange={(event) => setDetails(event.target.value)}
          placeholder={t(
            "detailsPlaceholder",
            "مثال: نريد المرور على المتحف المصري وخان الخليلي، ومندوب يتحدث الإنجليزية."
          )}
          className="w-full rounded-2xl border border-input bg-background px-3 py-2.5 text-base leading-7 outline-none transition-colors focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
        />
        <p className="text-xs leading-5 text-muted-foreground">
          {t("detailsHelp", "المحطات الإضافية، أو عدد الأيام، أو أي طلب خاص.")}
        </p>
      </div>

      {submitError ? (
        <p
          role="alert"
          className="flex items-start gap-2 rounded-2xl border border-destructive/40 bg-destructive/10 px-3 py-2.5 text-sm leading-6 text-destructive"
        >
          <TriangleAlert className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
          {submitError}
        </p>
      ) : null}

      <button
        type="submit"
        disabled={submitting}
        className="inline-flex h-12 w-full items-center justify-center gap-2 rounded-2xl bg-primary text-base font-semibold text-primary-foreground shadow-lg shadow-primary/25 transition-all hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50 disabled:pointer-events-none disabled:opacity-60"
      >
        {submitting ? (
          <>
            <LoaderCircle className="size-5 animate-spin" aria-hidden="true" />
            {t("submitting", "جارٍ إرسال الطلب…")}
          </>
        ) : (
          <>
            <Send className="size-5" aria-hidden="true" />
            {t("submit", "أرسل الطلب")}
          </>
        )}
      </button>

      <span className="sr-only" role="status" aria-live="polite">
        {submitting ? t("submittingStatus", "جارٍ إرسال الطلب") : submitError ? submitError : ""}
      </span>
    </form>
  );
}
