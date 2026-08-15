"use client";

import * as React from "react";
import {
  CalendarClock,
  ChevronDown,
  CircleCheck,
  Flag,
  LoaderCircle,
  Luggage,
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
import type { GeoPlace, QuoteError } from "@/lib/pricing-types";
import { DEFAULT_LOCALE } from "@/lib/i18n-types";
import { useT, type Tx } from "@/components/site/i18n";
import { trackBrowserFunnel } from "@/lib/analytics/browser";
import type { PromoBanner } from "@/lib/discount-types";
import { createFormatter, type LocaleFormatter } from "./format";
import { Offers, type BookingContact, type TripSummary } from "./offers";
import { ExtrasPicker } from "./extras-picker";
import { todayInputValue, toIsoFromLocalInputs } from "./checkout/datetime";
import {
  MAX_LUGGAGE,
  estimateWaitingHours,
  isReturnAnotherDay,
  toSelection,
  type PublicExtra,
  type QuoteRequestWithExtras,
  type QuoteResponseWithExtras,
} from "./extras";

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
 *
 * ══════════════════════════════════════════════════════════════════════════
 *  الدفعة ٣ — ما تغيّر في هذه الشاشة ولماذا
 * ══════════════════════════════════════════════════════════════════════════
 *
 * (١) **حقل «ساعات الانتظار» حُذف** ومكانه **قائمة الخدمات الإضافية** من
 *     `public_extras()`. الحقل المحذوف كان يسأل العميل عن رقم لا يعرفه؛ وما
 *     يعرفه فعلاً هو **متى يعود**.
 *
 * (٢) **موعد الانطلاق والعودة يُسألان هنا لا في مسار الحجز — حين تكون الرحلة
 *     ذهاباً وعودة.** والسبب قاعدة قائمة في هذا المستودع: كل مُدخل يغيّر السعر
 *     يُجمع **قبل** عرض السعر. فبعد 0031 صار موعدا الرحلة مُدخلين سعريّين
 *     (‏`derive_waiting_hours` تشتق منهما ساعات الانتظار)، وجمعُهما بعد عرض
 *     السعر يعني بطاقةً بسعر ثم حجزاً بسعر أعلى — وهو العيب الذي يمسكه المالك
 *     بيده. أما رحلة الاتجاه الواحد فموعدها لا يمسّ السعر، فيبقى في مسار الحجز
 *     كما كان حرفياً.
 *
 * (٣) **الأهلية لا تُرشَّح هنا أبداً** (D-12). عدّاد الحقائب يُرسَل إلى القاعدة،
 *     وهي وحدها تُسقط الفئة التي لا تتسع. الشاشة تشرح ولا تُخفي.
 *
 * (٤) **ولا سعر يُحسب هنا.** الرقم الوحيد الذي يولد في هذا الملف هو تقدير ساعات
 *     الانتظار للعرض (‏`estimateWaitingHours`) — ساعات لا مال، ولا يُرسَل، ويُستبدل
 *     برقم القاعدة فور وصول العرض.
 */

const MIN_QUERY_LENGTH = 2;
const DEBOUNCE_MS = 350;
const MIN_PASSENGERS = 1;
const MAX_PASSENGERS = 60;

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
  /**
   * نظام الخصومات مفعَّل (المرحلة ١٢أ) — يصل من الصفحة الخادمية التي وحدها
   * تقرأ `site_settings`. غيابه يعني **مطفأ**: لا يظهر حقل كوبون في مسار الحجز.
   */
  discountEnabled?: boolean;
  /**
   * نظام الولاء مفعَّل (المرحلة ١٢ب) — رايةٌ لا رقم، تصل من الصفحة الخادمية
   * كأختها أعلاه. غيابها يعني **مطفأ**، فلا تظهر لوحة النقاط ولا يُسأل الخادم.
   */
  loyaltyEnabled?: boolean;
  /** بانرات موضع «شاشة العروض» و«صفحة الحجز» — عرض فقط، بلا أثر على أي سعر */
  offerBanners?: PromoBanner[];
  checkoutBanners?: PromoBanner[];
  /**
   * كتالوج الخدمات الإضافية من `public_extras()` — يقرؤه الغلاف الخادمي
   * (`booking-widget.tsx` أو صفحة `/book`) ويمرّره props.
   * **الفارغ يعني ألّا يظهر شيء إطلاقاً**: لا عنوان ولا صندوق ولا زر — والمالك
   * لم يُضف خدمات بعد (الجدول بلا بذرة بقرار).
   */
  extras?: PublicExtra[];
  /**
   * أكبر سعة حقائب في الأسطول النشط (‏`getMaxLuggageCapacity`) — **سقف إدخال
   * لا قاعدة أهلية**. بدونه يصعد العدّاد إلى ٢٠ ثابتة فيعرض على العميل أرقاماً
   * تضمن «لا توجد فئة» قبل أن يضغط. و`null`/`undefined` = تعذّرت القراءة
   * (هجرة أو بيئة) فيبقى السقف الثابت كما كان — لا تشديد بالخطأ.
   */
  maxLuggage?: number | null;
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
/* عدّاد رقمي (ركاب · حقائب)                                            */
/* ------------------------------------------------------------------ */

/**
 * عدّاد بزرَّي زيادة ونقصان وحقل رقمي — الشكل نفسه الذي كان لعدد الركاب،
 * مستخرَجاً حين وُلد عدّاد الحقائب بجواره: صيغتان لعدّاد واحد تنحرفان بأول تعديل.
 */
function CounterField({
  id,
  value,
  min,
  max,
  onChange,
  decreaseLabel,
  increaseLabel,
  describedBy,
  fieldHeight,
}: {
  id: string;
  value: number;
  min: number;
  max: number;
  onChange: (next: number) => void;
  decreaseLabel: string;
  increaseLabel: string;
  describedBy?: string;
  fieldHeight: string;
}) {
  return (
    <div
      className={cn(
        "flex items-center justify-between gap-2 rounded-2xl border border-input bg-background px-2",
        fieldHeight
      )}
    >
      <button
        type="button"
        onClick={() => onChange(value - 1)}
        disabled={value <= min}
        aria-label={decreaseLabel}
        className="grid size-9 shrink-0 place-items-center rounded-xl text-foreground transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50 disabled:pointer-events-none disabled:opacity-40"
      >
        <Minus className="size-4" aria-hidden="true" />
      </button>

      <input
        id={id}
        type="number"
        inputMode="numeric"
        min={min}
        max={max}
        step={1}
        value={value}
        aria-describedby={describedBy}
        onChange={(event) => {
          const parsed = Number.parseInt(event.target.value, 10);
          onChange(Number.isNaN(parsed) ? min : parsed);
        }}
        className="w-full min-w-0 self-stretch border-0 bg-transparent text-center text-base font-semibold outline-none [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
      />

      <button
        type="button"
        onClick={() => onChange(value + 1)}
        disabled={value >= max}
        aria-label={increaseLabel}
        className="grid size-9 shrink-0 place-items-center rounded-xl text-foreground transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50 disabled:pointer-events-none disabled:opacity-40"
      >
        <Plus className="size-4" aria-hidden="true" />
      </button>
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
  discountEnabled = false,
  loyaltyEnabled = false,
  offerBanners = [],
  checkoutBanners = [],
  extras = [],
  maxLuggage = null,
}: SearchWidgetProps) {
  const t = useT("booking.search");
  const fmt = React.useMemo(() => createFormatter(locale), [locale]);
  const uid = React.useId();
  const originId = `${uid}-origin`;
  const destinationId = `${uid}-destination`;
  const passengersId = `${uid}-passengers`;
  const passengersNoteId = `${uid}-passengers-note`;
  const luggageId = `${uid}-luggage`;
  const luggageNoteId = `${uid}-luggage-note`;
  const extrasId = `${uid}-extras`;
  const scheduleNoteId = `${uid}-schedule-note`;

  const [originText, setOriginText] = React.useState("");
  const [origin, setOrigin] = React.useState<GeoPlace | null>(null);
  const [destinationText, setDestinationText] = React.useState("");
  const [destination, setDestination] = React.useState<GeoPlace | null>(null);
  const [passengers, setPassengers] = React.useState(2);
  const [luggage, setLuggage] = React.useState(0);
  const [roundTrip, setRoundTrip] = React.useState(false);
  const [pickupDate, setPickupDate] = React.useState("");
  const [pickupTime, setPickupTime] = React.useState("");
  const [returnDate, setReturnDate] = React.useState("");
  const [returnTime, setReturnTime] = React.useState("");
  const [quantities, setQuantities] = React.useState<Record<string, number>>({});
  const [extrasOpen, setExtrasOpen] = React.useState(false);

  const [pending, setPending] = React.useState(false);
  const [hint, setHint] = React.useState<string | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [result, setResult] = React.useState<QuoteResponseWithExtras | null>(null);
  const [trip, setTrip] = React.useState<TripSummary | null>(null);

  const resultsRef = React.useRef<HTMLDivElement | null>(null);
  const minDate = React.useMemo(() => todayInputValue(), []);

  const fieldHeight = compact ? "h-11" : "h-12";
  const hasExtras = extras.length > 0;

  /**
   * سقف عدّاد الحقائب = أصغر الرقمين: أكبرُ سعة في الأسطول، والحدُّ الذي يقبله
   * المسار (`MAX_LUGGAGE`، وهو نفسه حدّ مُحلِّل `/api/quote`).
   *
   * ⚠ **سقف إدخال لا ترشيح** (D-12 بلا مساس): أي فئة تُعرض أو تُخفى تُقرّره
   * `quote_price` وحدها. ما يمنعه هذا السقف أن تعرض الشاشة رقماً **لا يمكن أن
   * ينجح**: العدّاد كان يصعد إلى ٢٠ ولو كان أكبر ما في الأسطول ستّ حقائب، فيصل
   * العميل إلى «لا توجد فئة» بعد أن قدّمت له الشاشةُ الرقمَ المستحيل بنفسها.
   * وتعذُّر القراءة يُبقيه على الثابت — لا يُشدَّد بالخطأ.
   */
  const luggageCap =
    typeof maxLuggage === "number" && Number.isFinite(maxLuggage) && maxLuggage >= 1
      ? Math.min(Math.trunc(maxLuggage), MAX_LUGGAGE)
      : MAX_LUGGAGE;
  /** بلغ العميل سقف الأسطول فعلاً — عندها وحدها يُقال له ما البديل */
  const luggageAtCap = luggage >= luggageCap;
  /** والسقف معلوم من الأسطول لا مجرد ثابت واجهة — فلا نُعلن رقماً لا نعرفه */
  const luggageCapKnown = luggageCap < MAX_LUGGAGE;

  // مواعيد الرحلة تُجمع هنا **للذهاب والعودة وحدها** — لأنها وحدها تغيّر السعر
  // (منها تُشتق ساعات الانتظار). ورحلة الاتجاه الواحد تبقى كما كانت: موعدها
  // يُجمع في مسار الحجز.
  const pickupAt = roundTrip ? toIsoFromLocalInputs(pickupDate, pickupTime) : null;
  const returnAt = roundTrip ? toIsoFromLocalInputs(returnDate, returnTime) : null;

  /**
   * تقدير الانتظار **للعرض قبل وصول العرض السعري**، وهو موسوم «تقديري» في النص.
   * وبعد وصول عرض يخصّ **هذين الموعدين بعينهما** نعرض رقم القاعدة بدله — فلا
   * يبقى على الشاشة رقم لم تنتجه Postgres.
   */
  const scheduleKey = `${pickupAt ?? ""}|${returnAt ?? ""}`;
  const [quotedSchedule, setQuotedSchedule] = React.useState<{
    key: string;
    waitingHours: number;
  } | null>(null);
  const serverWaiting =
    quotedSchedule && quotedSchedule.key === scheduleKey ? quotedSchedule.waitingHours : null;
  const estimatedWaiting = estimateWaitingHours(pickupAt, returnAt);
  const shownWaiting = serverWaiting ?? estimatedWaiting;
  const returnAnotherDay = isReturnAnotherDay(pickupAt, returnAt);
  const returnBeforePickup =
    pickupAt !== null && returnAt !== null && new Date(returnAt) <= new Date(pickupAt);

  const selection = React.useMemo(() => toSelection(quantities), [quantities]);

  /**
   * بصمة كل مُدخل يغيّر السعر. بعد وصول عرض، أي تعديل عليها يجعل البطاقات
   * المعروضة **قديمة** — والزائر يظن أنها تتبعه (خاصة مع الخدمات: يزيد كرسي
   * أطفال والسعر لا يتحرك). فنقولها له صراحةً بدل أن يحجز رحلة غير التي عدّلها.
   */
  const inputsKey = [
    origin?.lat ?? "",
    origin?.lng ?? "",
    destination?.lat ?? "",
    destination?.lng ?? "",
    passengers,
    luggage,
    roundTrip,
    pickupAt ?? "",
    returnAt ?? "",
    selection.map((item) => `${item.slug}:${item.qty}`).join(","),
  ].join("|");
  const [quotedInputsKey, setQuotedInputsKey] = React.useState<string | null>(null);
  const staleInputs = result !== null && quotedInputsKey !== null && quotedInputsKey !== inputsKey;

  function updatePassengers(next: number) {
    if (!Number.isFinite(next)) return;
    const clamped = Math.min(MAX_PASSENGERS, Math.max(MIN_PASSENGERS, Math.round(next)));
    setPassengers(clamped);
  }

  function updateLuggage(next: number) {
    if (!Number.isFinite(next)) return;
    setLuggage(Math.min(luggageCap, Math.max(0, Math.round(next))));
  }

  function updateQuantity(slug: string, qty: number) {
    setQuantities((current) => ({ ...current, [slug]: qty }));
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

    // مواعيد الذهاب والعودة شرط لعرض سعر صادق: بدونها لا تعرف القاعدة إن كان
    // انتظارٌ يُحتسب، فيظهر سعر أقل مما سيُثبَّت عند الحجز.
    if (roundTrip && !pickupAt) {
      setHint(t("hints.pickPickup", "حدد تاريخ ووقت الانطلاق لنحسب رحلة العودة بدقة."));
      return;
    }
    if (roundTrip && !returnAt) {
      setHint(t("hints.pickReturn", "حدد تاريخ ووقت العودة — أو اختر «ذهاب فقط»."));
      return;
    }
    if (returnBeforePickup) {
      setHint(t("hints.returnOrder", "موعد العودة يجب أن يكون بعد موعد الانطلاق."));
      return;
    }

    const payload: QuoteRequestWithExtras = {
      origin,
      destination,
      passengers,
      roundTrip,
      // 🔒 صفر دائماً: الساعات لم تعد اختياراً في الشاشة، والخادم يشتقّها من
      // الموعدين عبر `derive_waiting_hours`. إرسال تقدير المتصفح هنا يجعل
      // للرقم مصدرين (النمط ٨ في `LESSONS.md`) — ولا يقع أبداً.
      waitingHours: 0,
      pickupAt,
      returnAt,
      luggage,
      // رموز وكميات فقط — ولا سعر ولا إجمالي (D-09)
      extras: selection,
    };

    setPending(true);
    try {
      const res = await fetch("/api/quote", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const json = (await res.json()) as QuoteResponseWithExtras | QuoteError;

      if (!json.ok) {
        setResult(null);
        setTrip(null);
        setQuotedSchedule(null);
        setError(
          json.message ||
            t("errors.quoteFailed", "تعذر حساب السعر الآن. حاول مرة أخرى بعد قليل.")
        );
        return;
      }

      setResult(json);
      // ساعات الانتظار كما اشتقّتها القاعدة — تحل محل التقدير في النص الإرشادي،
      // وتمضي في ملخص الرحلة إلى معاينة الكوبون وإلى الحجز بلا اشتقاق ثانٍ.
      const quotedWaiting = Number.isFinite(json.waitingHours) ? json.waitingHours : 0;
      setQuotedSchedule({ key: scheduleKey, waitingHours: quotedWaiting });
      setQuotedInputsKey(inputsKey);

      // القمع في المتصفح (المرحلة ١٠): نظير الحدثين اللذين يكتبهما `/api/quote`
      // في قاعدتنا — هنا لجوجل وميتا وحدهما. بلا مرجع ولا قيمة: انتقاء «أرخص
      // عرض» حسابٌ في المتصفح، وقيمة القمع الحقيقية تُقاس عند الحجز لا عند
      // العرض (نفس تعليل الخادم حرفياً). ولا عنوان انطلاق ولا وجهة إطلاقاً.
      trackBrowserFunnel("search_performed");
      trackBrowserFunnel("quote_viewed");

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
        waitingHours: quotedWaiting,
        luggage,
        pickupAt,
        returnAt,
        extras: selection,
      });
    } catch {
      setResult(null);
      setTrip(null);
      setQuotedSchedule(null);
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

        {/* عدد الركاب + عدد الحقائب */}
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor={passengersId} className="text-sm font-medium">
              {t("passengers.label", "عدد الركاب")}
            </Label>
            <CounterField
              id={passengersId}
              value={passengers}
              min={MIN_PASSENGERS}
              max={MAX_PASSENGERS}
              onChange={updatePassengers}
              decreaseLabel={t("passengers.decrease", "إنقاص عدد الركاب")}
              increaseLabel={t("passengers.increase", "زيادة عدد الركاب")}
              describedBy={passengersNoteId}
              fieldHeight={fieldHeight}
            />
            <p id={passengersNoteId} className="text-xs leading-5 text-muted-foreground">
              {t("passengers.note", "الأطفال يُحسبون ضمن العدد — الحالي: {current}.", {
                current: fmt.passengers(passengers),
              })}
            </p>
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor={luggageId} className="flex items-center gap-1.5 text-sm font-medium">
              <Luggage className="size-4 shrink-0 text-primary" aria-hidden="true" />
              {t("luggage.label", "عدد الحقائب")}
            </Label>
            <CounterField
              id={luggageId}
              value={luggage}
              min={0}
              max={luggageCap}
              onChange={updateLuggage}
              decreaseLabel={t("luggage.decrease", "إنقاص عدد الحقائب")}
              increaseLabel={t("luggage.increase", "زيادة عدد الحقائب")}
              describedBy={luggageNoteId}
              fieldHeight={fieldHeight}
            />
            {/*
              شرحٌ لا ترشيح: الفئة التي لا تتسع للحقائب **لا تعود من القاعدة**
              أصلاً (D-12)، فلا نُخفي هنا فئةً ولا نُظهرها — نقول للعميل لماذا
              قد تختفي فئة كان يتوقعها.

              والسطر الثاني يقول ما يحدث عند السقف **قبل** أن يصطدم به: العدّاد
              يقف عند أكبر ما يحمله الأسطول، وما فوقه لا تُنتج له الحاسبة عرضاً
              أصلاً — فالبديل قناةٌ بشرية لا محاولة ثانية بالرقم نفسه.
            */}
            <p id={luggageNoteId} className="text-xs leading-5 text-muted-foreground">
              {t(
                "luggage.note",
                "نعرض الفئات التي تتسع لركابك وحقائبك معاً — زيادة الحقائب قد تُخفي فئة أصغر."
              )}
              {luggageCapKnown ? (
                <>
                  {" "}
                  {luggageAtCap
                    ? t(
                        "luggage.atCap",
                        "وهذا أقصى ما تحمله أكبر سيارة لدينا ({max}). لحقائب أكثر نرتّب لك أكثر من سيارة — تواصل معنا أو اطلب عرض سعر.",
                        { max: fmt.bags(luggageCap) }
                      )
                    : t("luggage.capNote", "وأكبر سيارة لدينا تتسع لـ{max}.", {
                        max: fmt.bags(luggageCap),
                      })}
                </>
              ) : null}
            </p>
          </div>
        </div>

        {/* نوع الرحلة */}
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="flex flex-col gap-1.5 sm:col-span-1">
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

        {/*
          مواعيد الذهاب والعودة — تظهر مع «ذهاب وعودة» وحدها.
          موضعها هنا لا في مسار الحجز لأنها **مُدخل سعري** منذ 0031: منها تشتق
          `derive_waiting_hours` ساعات انتظار السائق. وجمعها بعد عرض السعر يعني
          بطاقةً بسعر ثم حجزاً أغلى.
        */}
        {roundTrip ? (
          <div className="flex flex-col gap-3 rounded-2xl border border-border bg-muted/30 px-3.5 py-3.5">
            <p className="flex items-center gap-2 text-sm font-semibold">
              <CalendarClock className="size-4 shrink-0 text-primary" aria-hidden="true" />
              {t("schedule.heading", "موعد الذهاب والعودة")}
            </p>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor={`${uid}-pickup-date`} className="text-sm font-medium">
                  {t("schedule.pickupDate", "تاريخ الانطلاق")}
                </Label>
                <input
                  id={`${uid}-pickup-date`}
                  type="date"
                  min={minDate}
                  value={pickupDate}
                  onChange={(event) => setPickupDate(event.target.value)}
                  aria-describedby={scheduleNoteId}
                  className={cn(
                    "w-full rounded-2xl border border-input bg-background px-3 text-base outline-none transition-colors focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50",
                    fieldHeight
                  )}
                />
              </div>

              <div className="flex flex-col gap-1.5">
                <Label htmlFor={`${uid}-pickup-time`} className="text-sm font-medium">
                  {t("schedule.pickupTime", "ساعة الانطلاق")}
                </Label>
                <input
                  id={`${uid}-pickup-time`}
                  type="time"
                  value={pickupTime}
                  onChange={(event) => setPickupTime(event.target.value)}
                  aria-describedby={scheduleNoteId}
                  className={cn(
                    "w-full rounded-2xl border border-input bg-background px-3 text-base outline-none transition-colors focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50",
                    fieldHeight
                  )}
                />
              </div>

              <div className="flex flex-col gap-1.5">
                <Label htmlFor={`${uid}-return-date`} className="text-sm font-medium">
                  {t("schedule.returnDate", "تاريخ العودة")}
                </Label>
                <input
                  id={`${uid}-return-date`}
                  type="date"
                  min={pickupDate || minDate}
                  value={returnDate}
                  onChange={(event) => setReturnDate(event.target.value)}
                  aria-describedby={scheduleNoteId}
                  className={cn(
                    "w-full rounded-2xl border border-input bg-background px-3 text-base outline-none transition-colors focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50",
                    fieldHeight
                  )}
                />
              </div>

              <div className="flex flex-col gap-1.5">
                <Label htmlFor={`${uid}-return-time`} className="text-sm font-medium">
                  {t("schedule.returnTime", "ساعة العودة")}
                </Label>
                <input
                  id={`${uid}-return-time`}
                  type="time"
                  value={returnTime}
                  onChange={(event) => setReturnTime(event.target.value)}
                  aria-describedby={scheduleNoteId}
                  className={cn(
                    "w-full rounded-2xl border border-input bg-background px-3 text-base outline-none transition-colors focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50",
                    fieldHeight
                  )}
                />
              </div>
            </div>

            {/*
              السطر الصادق: يقول ما ستفعله القاعدة بالضبط بما اختاره العميل.
              • عودة ≤ الانطلاق ⇒ تحذير (وترفضه القاعدة أيضاً عند الحجز).
              • يوم آخر ⇒ لا انتظار، ومعامل الذهاب والعودة وحده يسعّر العودة.
              • نفس اليوم ⇒ الساعات ورسمها. والرقم موسوم **«تقديري»** ما دام من
                المتصفح، ويصير رقم القاعدة نصاً بلا وسم فور وصول العرض.
            */}
            <p id={scheduleNoteId} className="text-xs leading-6 text-muted-foreground">
              {returnBeforePickup
                ? t("schedule.orderNote", "موعد العودة يجب أن يكون بعد موعد الانطلاق.")
                : returnAt === null
                  ? t(
                      "schedule.emptyNote",
                      "حدد موعد العودة: إن كانت في اليوم نفسه يبقى السائق في انتظارك ويُحتسب الانتظار بسعر الساعة لفئتك، وإن كانت في يوم آخر فلا انتظار — معامل الذهاب والعودة وحده يسعّر العودة."
                    )
                  : returnAnotherDay
                    ? t(
                        "schedule.otherDayNote",
                        "العودة في يوم آخر — لا ساعات انتظار، ومعامل الذهاب والعودة وحده يسعّر رحلة العودة."
                      )
                    : shownWaiting !== null && shownWaiting > 0
                      ? serverWaiting !== null
                        ? t(
                            "schedule.sameDayNote",
                            "العودة في نفس اليوم — انتظار {hours} محتسب بسعر الساعة لفئتك ضمن الأسعار أدناه.",
                            { hours: fmt.hours(shownWaiting) }
                          )
                        : t(
                            "schedule.sameDayEstimate",
                            "العودة في نفس اليوم — انتظار تقديري {hours} يُحتسب بسعر الساعة لفئتك. الرقم النهائي يظهر مع الأسعار.",
                            { hours: fmt.hours(shownWaiting) }
                          )
                      : t(
                          "schedule.sameDayZero",
                          "العودة في نفس اليوم — تُحتسب ساعات انتظار السائق بسعر الساعة لفئتك."
                        )}
            </p>
          </div>
        ) : null}

        {/*
          خيارات إضافية: **الخدمات** لا ساعات الانتظار (حُذف حقلها في الدفعة ٣).
          والكتالوج الفارغ لا يعرض شيئاً إطلاقاً — لا زرّ ولا صندوق.
        */}
        {hasExtras ? (
          <div className="flex flex-col gap-3">
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
              {t("extras.toggle", "خدمات إضافية")}
              {selection.length > 0 ? (
                <span className="rounded-full bg-primary/10 px-2 py-0.5 text-xs font-semibold">
                  {fmt.number(selection.length)}
                </span>
              ) : null}
            </button>

            {extrasOpen ? (
              <div id={extrasId} className="flex flex-col gap-2">
                <ExtrasPicker
                  extras={extras}
                  quantities={quantities}
                  onChange={updateQuantity}
                  idPrefix={extrasId}
                  t={t}
                  fmt={fmt}
                  disabled={pending}
                />
                <p className="text-xs leading-5 text-muted-foreground">
                  {t(
                    "services.note",
                    "تُضاف الخدمات إلى إجمالي الحجز كبند مستقل بعد سعر الرحلة، ولا يشملها رمز الخصم."
                  )}
                </p>
              </div>
            ) : null}
          </div>
        ) : null}

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
        <div ref={resultsRef} className="flex flex-col gap-4 border-t border-border pt-5">
          {/*
            بطاقات لمدخلات قديمة: تبقى معروضة (السعر الذي فيها هو ما سيُحجز به
            فعلاً لأن مسار الحجز يحمل مدخلات لحظة التسعير) — لكن يُقال للزائر
            صراحةً إنها لا تشمل تعديله الأخير.
          */}
          {staleInputs ? (
            <p
              role="status"
              className="flex items-start gap-2 rounded-2xl border border-amber-500/50 bg-amber-500/10 px-3 py-2.5 text-sm leading-6 text-amber-800 dark:text-amber-200"
            >
              <TriangleAlert className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
              {t(
                "staleResults",
                "عدّلت بيانات الرحلة بعد عرض الأسعار — اضغط «احسب السعر» لتحديثها قبل الحجز."
              )}
            </p>
          ) : null}
          <Offers
            offers={result.offers}
            distanceKm={result.distanceKm}
            durationMin={result.durationMin}
            distanceSource={result.distanceSource}
            trip={trip}
            contact={contact}
            compact={compact}
            locale={locale}
            discountEnabled={discountEnabled}
            loyaltyEnabled={loyaltyEnabled}
            offerBanners={offerBanners}
            checkoutBanners={checkoutBanners}
          />
        </div>
      ) : null}
    </div>
  );
}
