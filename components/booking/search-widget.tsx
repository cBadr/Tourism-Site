"use client";

import * as React from "react";
import {
  ChevronDown,
  CircleCheck,
  Flag,
  LoaderCircle,
  MapPin,
  Minus,
  Plus,
  Repeat,
  Search,
  TriangleAlert,
} from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import type {
  GeoPlace,
  QuoteError,
  QuoteRequest,
  QuoteResponse,
} from "@/lib/pricing-types";
import { DEFAULT_LOCALE } from "@/lib/i18n-types";
import { useT, type Tx } from "@/components/site/i18n";
import { createFormatter, type LocaleFormatter } from "./format";
import { Offers, type BookingContact, type TripSummary } from "./offers";

/**
 * ويدجت البحث عن سعر رحلة — قلب التحويل في الموقع.
 *
 * يجمع نقطتي الانطلاق والوصول (إكمال تلقائي من /api/geocode) وعدد الركاب ونوع
 * الرحلة وساعات الانتظار، ثم يستدعي /api/quote ويعرض بطاقات العروض أسفله مباشرة
 * في نفس الشجرة (بلا تنقل بين الصفحات — الزائر يرى السعر في مكانه).
 *
 * لا حساب سعر هنا إطلاقاً: الأرقام كلها تصل جاهزة من دالة SQL عبر الـ API.
 * كل نصوص العلامة والتواصل تصل عبر props من الخادم (انضباط الـ whitelabel).
 *
 * المرحلة ٨: اللغة تصل prop من الصفحة الخادمية (لا من سياق المتصفح) فيتطابق
 * التصيير على الطرفين؛ النصوص من مساحة `booking.search` بارتداد عربي، وكل رقم
 * ظاهر يمر بمُنسّق اللغة.
 */

const MIN_QUERY_LENGTH = 2;
const DEBOUNCE_MS = 350;
const MIN_PASSENGERS = 1;
const MAX_PASSENGERS = 60;
const MAX_WAITING_HOURS = 24;

const WAITING_OPTIONS = Array.from({ length: MAX_WAITING_HOURS + 1 }, (_, i) => i);

/** استجابة /api/geocode كما نتعامل معها في العميل */
type GeocodeResponse =
  | { ok: true; places: GeoPlace[] }
  | { ok: false; code: string; message: string };

export type SearchWidgetProps = {
  /** قنوات التواصل لأزرار الحجز المرحلية — من إعدادات الموقع */
  contact?: BookingContact;
  /** نسخة مضغوطة تُركَّب تحت أزرار قسم البطل */
  compact?: boolean;
  /** لغة الزائر — تصل من الصفحة الخادمية، وغيابها يعني العربية */
  locale?: string;
  className?: string;
};

/* ------------------------------------------------------------------ */
/* حقل مكان بإكمال تلقائي (نمط combobox)                                */
/* ------------------------------------------------------------------ */

type PlaceFieldProps = {
  id: string;
  label: string;
  placeholder: string;
  icon: React.ReactNode;
  value: string;
  place: GeoPlace | null;
  onValueChange: (value: string) => void;
  onPlaceChange: (place: GeoPlace | null) => void;
  fieldHeight: string;
  t: Tx;
  fmt: LocaleFormatter;
};

function PlaceField({
  id,
  label,
  placeholder,
  icon,
  value,
  place,
  onValueChange,
  onPlaceChange,
  fieldHeight,
  t,
  fmt,
}: PlaceFieldProps) {
  const [places, setPlaces] = React.useState<GeoPlace[]>([]);
  /** النص الذي تخصّه النتائج الحالية — مصدر اشتقاق «جارٍ البحث» وحارس التكرار */
  const [resultsQuery, setResultsQuery] = React.useState<string | null>(null);
  const [open, setOpen] = React.useState(false);
  const [activeIndex, setActiveIndex] = React.useState(-1);

  const inputRef = React.useRef<HTMLInputElement | null>(null);

  const listboxId = `${id}-listbox`;
  const helperId = `${id}-helper`;
  const optionId = (index: number) => `${id}-option-${index}`;

  const query = value.trim();
  const tooShort = query.length < MIN_QUERY_LENGTH;
  /** النتائج الحاضرة تخص النص الحالي فعلاً */
  const isFresh = resultsQuery === query;
  /** حالة الانتظار مشتقّة لا مخزَّنة: نص طويل كفايةً بلا نتائج تخصّه بعد */
  const loading = !tooShort && !isFresh;
  const hasSuggestions = !tooShort && places.length > 0;
  const listOpen = open && hasSuggestions;
  const showEmptyState = open && !tooShort && isFresh && places.length === 0;
  /** إرشاد لطيف: كُتب نص لكن لم يُختر مكان من القائمة بعد */
  const needsPick = !place && !tooShort;

  // بحث مؤجل ٣٥٠ مللي ثانية مع إلغاء الطلب السابق عند كل ضغطة مفتاح.
  // كل تغييرات الحالة داخل نداءات لاحقة (لا تحديث متزامن داخل التأثير).
  React.useEffect(() => {
    if (tooShort || isFresh) return;

    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      void (async () => {
        try {
          const res = await fetch(`/api/geocode?q=${encodeURIComponent(query)}`, {
            signal: controller.signal,
          });
          const json = (await res.json()) as GeocodeResponse;
          const next = json.ok ? json.places : [];
          setPlaces(next);
          setResultsQuery(query);
          setActiveIndex(next.length > 0 ? 0 : -1);
          setOpen(true);
        } catch {
          // إلغاء أو فشل شبكة: لا اقتراحات، والزائر يكمل بلا رسالة خطأ مزعجة
          if (controller.signal.aborted) return;
          setPlaces([]);
          setResultsQuery(query);
          setActiveIndex(-1);
          setOpen(true);
        }
      })();
    }, DEBOUNCE_MS);

    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [query, tooShort, isFresh]);

  function selectPlace(selected: GeoPlace) {
    onValueChange(selected.label);
    onPlaceChange(selected);
    setPlaces([]);
    // تثبيت النص المختار كنتيجة «طازجة» يمنع بحثاً جديداً عن الاسم نفسه
    setResultsQuery(selected.label.trim());
    setActiveIndex(-1);
    setOpen(false);
    inputRef.current?.focus();
  }

  function handleKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      if (!hasSuggestions) return;
      event.preventDefault();
      setOpen(true);
      setActiveIndex((current) => {
        const step = event.key === "ArrowDown" ? 1 : -1;
        const next = current + step;
        if (next < 0) return places.length - 1;
        if (next >= places.length) return 0;
        return next;
      });
      return;
    }

    if (event.key === "Enter") {
      const highlighted = listOpen && activeIndex >= 0 ? places[activeIndex] : undefined;
      if (highlighted) {
        // لا نرسل النموذج بينما القائمة مفتوحة — الإدخال هنا اختيارٌ لا إرسال
        event.preventDefault();
        selectPlace(highlighted);
      }
      return;
    }

    if (event.key === "Escape") {
      setOpen(false);
      setActiveIndex(-1);
      return;
    }

    if (event.key === "Tab") setOpen(false);
  }

  return (
    <div className="relative flex flex-col gap-1.5">
      <Label htmlFor={id} className="text-sm font-medium">
        {label}
      </Label>

      <div className="relative">
        <span
          className="pointer-events-none absolute start-3 top-1/2 -translate-y-1/2 text-muted-foreground"
          aria-hidden="true"
        >
          {icon}
        </span>

        <Input
          id={id}
          ref={inputRef}
          type="text"
          role="combobox"
          autoComplete="off"
          aria-expanded={listOpen}
          aria-controls={listboxId}
          aria-autocomplete="list"
          aria-describedby={helperId}
          aria-activedescendant={
            listOpen && activeIndex >= 0 ? optionId(activeIndex) : undefined
          }
          placeholder={placeholder}
          value={value}
          onChange={(event) => {
            onValueChange(event.target.value);
            onPlaceChange(null);
          }}
          onKeyDown={handleKeyDown}
          onFocus={() => {
            if (hasSuggestions) setOpen(true);
          }}
          onBlur={() => setOpen(false)}
          className={cn(
            "rounded-2xl bg-background ps-10 pe-10 text-base md:text-base",
            fieldHeight
          )}
        />

        <span className="pointer-events-none absolute end-3 top-1/2 -translate-y-1/2">
          {loading ? (
            <LoaderCircle className="size-4 animate-spin text-muted-foreground" aria-hidden="true" />
          ) : place ? (
            <CircleCheck className="size-4 text-primary" aria-hidden="true" />
          ) : null}
        </span>

        {/* قائمة الاقتراحات */}
        <ul
          id={listboxId}
          role="listbox"
          aria-label={t("suggestionsFor", "اقتراحات {field}", { field: label })}
          className={cn(
            "absolute inset-x-0 top-[calc(100%+0.375rem)] z-50 max-h-72 overflow-y-auto rounded-2xl border border-border bg-popover p-1.5 text-popover-foreground shadow-xl",
            listOpen ? "block" : "hidden"
          )}
        >
          {places.map((suggestion, index) => (
            <li
              key={`${suggestion.label}-${suggestion.lat}-${suggestion.lng}`}
              id={optionId(index)}
              role="option"
              aria-selected={index === activeIndex}
              // منع فقدان التركيز قبل النقر حتى لا تُغلق القائمة بالـ blur
              onMouseDown={(event) => event.preventDefault()}
              onMouseEnter={() => setActiveIndex(index)}
              onClick={() => selectPlace(suggestion)}
              className={cn(
                "flex cursor-pointer items-center gap-2 rounded-xl px-3 py-2.5 text-sm leading-6 transition-colors",
                index === activeIndex ? "bg-muted text-foreground" : "text-foreground"
              )}
            >
              <MapPin className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
              <span className="min-w-0 flex-1">{suggestion.label}</span>
            </li>
          ))}
        </ul>

        {/* لا نتائج */}
        {showEmptyState ? (
          <div className="absolute inset-x-0 top-[calc(100%+0.375rem)] z-50 rounded-2xl border border-border bg-popover px-3 py-2.5 text-sm leading-6 text-muted-foreground shadow-xl">
            {t("noResults", "لا نتائج مطابقة — جرّب اسماً أوضح مثل «مطار القاهرة الدولي».")}
          </div>
        ) : null}
      </div>

      {/* إرشاد لطيف: النص وحده لا يكفي، لا بد من اختيار مكان محدد */}
      <p
        id={helperId}
        className={cn("text-xs leading-5", needsPick ? "text-muted-foreground" : "sr-only")}
      >
        {needsPick
          ? t("pickFromList", "اختر المكان من قائمة الاقتراحات لتحديد الموقع بدقة.")
          : t("typeTwoLetters", "اكتب حرفين على الأقل ثم اختر المكان من قائمة الاقتراحات.")}
      </p>

      <span className="sr-only" role="status" aria-live="polite">
        {listOpen
          ? t("suggestionsCount", `${fmt.number(places.length)} اقتراحات متاحة`, {
              count: places.length,
            })
          : ""}
      </span>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* الويدجت                                                              */
/* ------------------------------------------------------------------ */

export function SearchWidget({
  contact,
  compact = false,
  locale = DEFAULT_LOCALE,
  className,
}: SearchWidgetProps) {
  const t = useT("booking.search");
  const fmt = React.useMemo(() => createFormatter(locale), [locale]);
  const uid = React.useId();
  const originId = `${uid}-origin`;
  const destinationId = `${uid}-destination`;
  const passengersId = `${uid}-passengers`;
  const passengersNoteId = `${uid}-passengers-note`;
  const waitingId = `${uid}-waiting`;
  const extrasId = `${uid}-extras`;

  const [originText, setOriginText] = React.useState("");
  const [origin, setOrigin] = React.useState<GeoPlace | null>(null);
  const [destinationText, setDestinationText] = React.useState("");
  const [destination, setDestination] = React.useState<GeoPlace | null>(null);
  const [passengers, setPassengers] = React.useState(2);
  const [roundTrip, setRoundTrip] = React.useState(false);
  const [waitingHours, setWaitingHours] = React.useState(0);
  const [extrasOpen, setExtrasOpen] = React.useState(false);

  const [pending, setPending] = React.useState(false);
  const [hint, setHint] = React.useState<string | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [result, setResult] = React.useState<QuoteResponse | null>(null);
  const [trip, setTrip] = React.useState<TripSummary | null>(null);

  const resultsRef = React.useRef<HTMLDivElement | null>(null);

  // ساعات الانتظار تظهر مع الذهاب والعودة أو عند فتح «خيارات إضافية»،
  // وتُصفَّر حسابياً حين تكون مخفية حتى لا تُحتسب قيمة لا يراها الزائر.
  const showWaiting = roundTrip || extrasOpen;
  const effectiveWaiting = showWaiting ? waitingHours : 0;

  const fieldHeight = compact ? "h-11" : "h-12";

  function updatePassengers(next: number) {
    if (!Number.isFinite(next)) return;
    const clamped = Math.min(MAX_PASSENGERS, Math.max(MIN_PASSENGERS, Math.round(next)));
    setPassengers(clamped);
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setHint(null);
    setError(null);

    if (!origin) {
      setHint(
        t(
          "hints.pickOrigin",
          "اختر نقطة الانطلاق من قائمة الاقتراحات — نحتاج موقعها بدقة لحساب المسافة."
        )
      );
      return;
    }
    if (!destination) {
      setHint(
        t(
          "hints.pickDestination",
          "اختر وجهة الوصول من قائمة الاقتراحات — نحتاج موقعها بدقة لحساب المسافة."
        )
      );
      return;
    }

    const payload: QuoteRequest = {
      origin,
      destination,
      passengers,
      roundTrip,
      waitingHours: effectiveWaiting,
    };

    setPending(true);
    try {
      const res = await fetch("/api/quote", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const json = (await res.json()) as QuoteResponse | QuoteError;

      if (!json.ok) {
        setResult(null);
        setTrip(null);
        setError(
          json.message ||
            t("errors.quoteFailed", "تعذر حساب السعر الآن. حاول مرة أخرى بعد قليل.")
        );
        return;
      }

      setResult(json);
      // الإحداثيات جزء أصيل من ملخص الرحلة: بدونها تعتبر بطاقةُ العرض الحجزَ
      // الإلكتروني غير متاح (toCheckoutTrip يُرجع null) فتسقط على قناة التواصل.
      setTrip({
        originLabel: origin.label || originText,
        originLat: origin.lat,
        originLng: origin.lng,
        destinationLabel: destination.label || destinationText,
        destLat: destination.lat,
        destLng: destination.lng,
        passengers,
        roundTrip,
        waitingHours: effectiveWaiting,
      });
    } catch {
      setResult(null);
      setTrip(null);
      setError(
        t("errors.network", "تعذر الاتصال بالخادم. تأكد من اتصالك بالإنترنت وحاول مرة أخرى.")
      );
    } finally {
      setPending(false);
    }
  }

  // إظهار النتائج للزائر فور وصولها — مهم خاصة في نسخة البطل المضغوطة
  React.useEffect(() => {
    if (!result || !resultsRef.current) return;
    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    resultsRef.current.scrollIntoView({
      behavior: reduceMotion ? "auto" : "smooth",
      block: "nearest",
    });
  }, [result]);

  return (
    <div
      className={cn(
        "flex flex-col gap-5 rounded-3xl border border-border bg-card/95 text-card-foreground shadow-xl shadow-primary/5 backdrop-blur",
        compact ? "p-4 sm:p-5" : "p-5 sm:p-7",
        className
      )}
    >
      {compact ? (
        <div className="flex items-center gap-2 text-sm font-semibold">
          <Search className="size-4 shrink-0 text-primary" aria-hidden="true" />
          {t("compactTitle", "احسب سعر رحلتك في ثوانٍ")}
        </div>
      ) : null}

      <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-4">
        {/* الانطلاق والوصول */}
        <div className="grid gap-4 md:grid-cols-2">
          <PlaceField
            id={originId}
            label={t("origin.label", "من أين")}
            placeholder={t("origin.placeholder", "مثل «مطار القاهرة»")}
            icon={<MapPin className="size-4" />}
            value={originText}
            place={origin}
            onValueChange={setOriginText}
            onPlaceChange={setOrigin}
            fieldHeight={fieldHeight}
            t={t}
            fmt={fmt}
          />
          <PlaceField
            id={destinationId}
            label={t("destination.label", "إلى أين")}
            placeholder={t("destination.placeholder", "مثل «فندقك في الغردقة»")}
            icon={<Flag className="size-4" />}
            value={destinationText}
            place={destination}
            onValueChange={setDestinationText}
            onPlaceChange={setDestination}
            fieldHeight={fieldHeight}
            t={t}
            fmt={fmt}
          />
        </div>

        {/* عدد الركاب + نوع الرحلة */}
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor={passengersId} className="text-sm font-medium">
              {t("passengers.label", "عدد الركاب")}
            </Label>
            <div
              className={cn(
                "flex items-center justify-between gap-2 rounded-2xl border border-input bg-background px-2",
                fieldHeight
              )}
            >
              <button
                type="button"
                onClick={() => updatePassengers(passengers - 1)}
                disabled={passengers <= MIN_PASSENGERS}
                aria-label={t("passengers.decrease", "إنقاص عدد الركاب")}
                className="grid size-9 shrink-0 place-items-center rounded-xl text-foreground transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50 disabled:pointer-events-none disabled:opacity-40"
              >
                <Minus className="size-4" aria-hidden="true" />
              </button>

              <input
                id={passengersId}
                type="number"
                inputMode="numeric"
                min={MIN_PASSENGERS}
                max={MAX_PASSENGERS}
                step={1}
                value={passengers}
                aria-describedby={passengersNoteId}
                onChange={(event) => {
                  const parsed = Number.parseInt(event.target.value, 10);
                  updatePassengers(Number.isNaN(parsed) ? MIN_PASSENGERS : parsed);
                }}
                className="w-full min-w-0 self-stretch border-0 bg-transparent text-center text-base font-semibold outline-none [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
              />

              <button
                type="button"
                onClick={() => updatePassengers(passengers + 1)}
                disabled={passengers >= MAX_PASSENGERS}
                aria-label={t("passengers.increase", "زيادة عدد الركاب")}
                className="grid size-9 shrink-0 place-items-center rounded-xl text-foreground transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50 disabled:pointer-events-none disabled:opacity-40"
              >
                <Plus className="size-4" aria-hidden="true" />
              </button>
            </div>
            <p id={passengersNoteId} className="text-xs leading-5 text-muted-foreground">
              {t("passengers.note", "الأطفال يُحسبون ضمن العدد — الحالي: {current}.", {
                current: fmt.passengers(passengers),
              })}
            </p>
          </div>

          <div className="flex flex-col gap-1.5">
            <span className="text-sm font-medium leading-none">
              {t("tripType.label", "نوع الرحلة")}
            </span>
            <label
              className={cn(
                "flex cursor-pointer items-center justify-between gap-3 rounded-2xl border border-input bg-background px-3",
                fieldHeight
              )}
            >
              <span className="flex items-center gap-2 text-sm font-medium">
                <Repeat className="size-4 shrink-0 text-primary" aria-hidden="true" />
                {t("tripType.roundTrip", "ذهاب وعودة")}
              </span>
              <span className="relative inline-flex shrink-0 items-center">
                <input
                  type="checkbox"
                  checked={roundTrip}
                  onChange={(event) => setRoundTrip(event.target.checked)}
                  className="peer sr-only"
                />
                <span
                  aria-hidden="true"
                  className="block h-6 w-11 rounded-full bg-muted transition-colors peer-checked:bg-primary peer-focus-visible:ring-3 peer-focus-visible:ring-ring/50"
                />
                <span
                  aria-hidden="true"
                  // في واجهة RTL يبدأ المقبض يميناً وينتقل يساراً عند التفعيل
                  className="pointer-events-none absolute start-0.5 top-0.5 size-5 rounded-full bg-background shadow transition-transform duration-200 peer-checked:-translate-x-5"
                />
              </span>
            </label>
            <p className="text-xs leading-5 text-muted-foreground">
              {roundTrip
                ? t("tripType.roundTripNote", "السعر يشمل رحلة العودة.")
                : t("tripType.oneWayNote", "رحلة باتجاه واحد.")}
            </p>
          </div>
        </div>

        {/* خيارات إضافية: ساعات الانتظار — تظهر تلقائياً مع الذهاب والعودة */}
        <div className="flex flex-col gap-3">
          {roundTrip ? null : (
            <button
              type="button"
              onClick={() => setExtrasOpen((current) => !current)}
              aria-expanded={extrasOpen}
              aria-controls={extrasId}
              className="-mx-2 inline-flex w-fit items-center gap-1.5 rounded-lg px-2 py-2 text-sm font-medium text-primary transition-colors hover:underline focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
            >
              <ChevronDown
                className={cn("size-4 transition-transform duration-200", extrasOpen && "rotate-180")}
                aria-hidden="true"
              />
              {t("extras.toggle", "خيارات إضافية")}
            </button>
          )}

          {showWaiting ? (
            <div id={extrasId} className="flex flex-col gap-1.5 sm:max-w-xs">
              <Label htmlFor={waitingId} className="text-sm font-medium">
                {t("extras.waitingLabel", "ساعات الانتظار")}
              </Label>
              <select
                id={waitingId}
                value={waitingHours}
                onChange={(event) => setWaitingHours(Number(event.target.value))}
                className={cn(
                  "w-full rounded-2xl border border-input bg-background px-3 text-base outline-none transition-colors focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50",
                  fieldHeight
                )}
              >
                {WAITING_OPTIONS.map((hours) => (
                  <option key={hours} value={hours}>
                    {fmt.waiting(hours)}
                  </option>
                ))}
              </select>
              <p className="text-xs leading-5 text-muted-foreground">
                {t(
                  "extras.waitingNote",
                  "انتظار السائق لك أثناء الرحلة — يُضاف بسعر ثابت لكل ساعة."
                )}
              </p>
            </div>
          ) : null}
        </div>

        {/* إرشاد لطيف عند الإرسال بلا اختيار من الاقتراحات */}
        {hint ? (
          <p className="flex items-start gap-2 rounded-2xl border border-amber-500/50 bg-amber-500/10 px-3 py-2.5 text-sm leading-6 text-amber-800 dark:text-amber-200">
            <TriangleAlert className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
            {hint}
          </p>
        ) : null}

        {/* خطأ من الخادم */}
        {error ? (
          <p className="flex items-start gap-2 rounded-2xl border border-destructive/40 bg-destructive/10 px-3 py-2.5 text-sm leading-6 text-destructive">
            <TriangleAlert className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
            {error}
          </p>
        ) : null}

        <button
          type="submit"
          disabled={pending}
          className={cn(
            "inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-primary text-base font-semibold text-primary-foreground shadow-lg shadow-primary/25 transition-all hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50 disabled:pointer-events-none disabled:opacity-60",
            compact ? "h-11" : "h-12"
          )}
        >
          {pending ? (
            <>
              <LoaderCircle className="size-5 animate-spin" aria-hidden="true" />
              {t("submitting", "جارٍ حساب السعر…")}
            </>
          ) : (
            <>
              <Search className="size-5" aria-hidden="true" />
              {t("submit", "احسب السعر")}
            </>
          )}
        </button>
      </form>

      {/* حالة مسموعة لقارئات الشاشة */}
      <span className="sr-only" role="status" aria-live="polite">
        {pending
          ? t("statusCalculating", "جارٍ حساب السعر")
          : error
            ? error
            : result
              ? t("statusOffers", "تم عرض {count} من عروض الأسعار", {
                  count: fmt.number(result.offers.length),
                })
              : ""}
      </span>

      {/* العروض — في نفس الشجرة أسفل النموذج مباشرة */}
      {result && trip ? (
        <div ref={resultsRef} className="border-t border-border pt-5">
          <Offers
            offers={result.offers}
            distanceKm={result.distanceKm}
            durationMin={result.durationMin}
            distanceSource={result.distanceSource}
            trip={trip}
            contact={contact}
            compact={compact}
            locale={locale}
          />
        </div>
      ) : null}
    </div>
  );
}
