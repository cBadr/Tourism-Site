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
import {
  NoClassesRescue,
  Offers,
  type BookingContact,
  type NoClassesReason,
  type QuoteRequestPrefill,
  type TripSummary,
} from "./offers";
import { ExtrasPicker } from "./extras-picker";
import { todayInputValue, toIsoFromLocalInputs, minInputValues } from "./checkout/datetime";
import { previewLeadTime } from "./checkout/lead-time-action";
import type { LeadTime } from "./checkout/lead-time";
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
 *
 * ══════════════════════════════════════════════════════════════════════════
 *  الضغط البصري — **عرضٌ فقط، والحمولة لم تتغيّر بحرف**
 * ══════════════════════════════════════════════════════════════════════════
 *
 * النموذج كان يرصّ حقوله رأسياً فيطول على الجوال. وما تغيّر هنا **شكلُ الجمع
 * لا المجموع**: نفس المُدخلات بالضبط تصل `/api/quote` بنفس الأسماء والأنواع
 * (‏`payload` أدناه لم يُمسّ)، ونفس دوال التحويل تبنيها.
 *
 * (أ) **الركاب والحقائب في صفٍّ واحد**، وشرحُهما أسفل الصفّ بعرضه كاملاً بدل
 *     عمودين ضيّقين — النص نفسه حرفياً، ويبقى مربوطاً بـ`aria-describedby`.
 *
 * (ب) **الحقائب تتبع عدد الركاب حتى يلمسها العميل** — التعليل الكامل عند
 *     `luggageDefault` أدناه، وهو **قرار سلامة تشغيلية لا تفضيلاً بصرياً**.
 *
 * (ج) **قلبُ «عودة» يُعيد حساب السعر أمام العين** — التعليل عند
 *     `requoteAfterToggle`.
 *
 * (د) **التاريخ والساعة حقلٌ واحد لكل اتجاه** (`datetime-local`). ⚠ وهو **دمجٌ
 *     بصري لا استبدالُ منطق**: الحقل يُشطر إلى `date` و`time` ويُمرَّر إلى
 *     **`toIsoFromCairoInputs` نفسها** — فمسار التحويل إلى توقيت القاهرة يبقى
 *     واحداً كما تفرض ترويسة `checkout/datetime.ts`، وأرضيةُ المهلة تبقى
 *     مشتقّةً من `booking_min_pickup_at()` وحدها بلا معادلة ثانية.
 */

const MIN_QUERY_LENGTH = 2;
const DEBOUNCE_MS = 350;
const MIN_PASSENGERS = 1;
/** عدد الركاب المبدئي — ومنه تشتقّ الحقائب مبدئياً (انظر `luggageDefault`) */
const DEFAULT_PASSENGERS = 2;

/**
 * الحدّ الأعلى المطلق الذي يقبله `/api/quote` — **سقف ارتداد لا سقف أسطول**.
 *
 * كان هذا الرقم وحده سقفَ العدّاد، وأكبر فئة نشطة تتسع لـ٥٠ — فعشرة أرقام (٥١
 * إلى ٦٠) كانت **تضمن** رد «لا توجد فئة». صار السقف الفعلي `passengerCap`
 * المشتقّ من الأسطول، ولا يُستعمل هذا الثابت إلا حين تتعذّر قراءة الأسطول:
 * سلوكُ اليوم نفسه، لا انحدار ولا تشديد بالخطأ.
 */
const MAX_PASSENGERS = 60;

/**
 * رمز «لا فئة تتسع» ⇐ سببه. المسار يرسل رمزاً لا جملة (انظر ترويسة
 * `app/api/quote/route.ts`)، وهذا الجدول هو **الموضع الوحيد** الذي يترجم رمز
 * السلك إلى سبب تفهمه الواجهة — ومنه يختار `NoClassesRescue` نصّه المترجم.
 *
 * ورمزٌ جديدٌ لا يُذكر هنا يسقط إلى مسار الخطأ العام، وهو مسارٌ **مترجم** كذلك:
 * لا يمكن أن ينتج عن إغفالٍ هنا نصٌّ عربي على `/en`.
 */
const NO_CLASSES_REASONS: Record<string, NoClassesReason> = {
  "no-classes": "passengers",
  "no-classes-luggage": "luggage",
};

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
   * أكبر سعة حقائب في الأسطول النشط (‏`getFleetCaps`) — **سقف إدخال
   * لا قاعدة أهلية**. بدونه يصعد العدّاد إلى ٢٠ ثابتة فيعرض على العميل أرقاماً
   * تضمن «لا توجد فئة» قبل أن يضغط. و`null`/`undefined` = تعذّرت القراءة
   * (هجرة أو بيئة) فيبقى السقف الثابت كما كان — لا تشديد بالخطأ.
   */
  maxLuggage?: number | null;
  /**
   * أكبر سعة **ركاب** في الأسطول النشط — **سقف إدخال لا قاعدة أهلية** (D-12)،
   * بنفس منطق `maxLuggage` حرفياً ومن **القراءة نفسها** (`getFleetCaps`).
   *
   * كان الويدجت يقرأ هذا الرقم بنفسه من `GET /api/quote` لأن غلافيه الخادميَّين
   * كانا خارج نطاق العمل الذي وُلد فيه؛ فصار للجدول الواحد قارئان. والآن يصل
   * `prop` من الغلافين — وهما كلّ من يُركّب هذه الجزيرة — فحُذف المسار العام.
   * و`null`/`undefined` = تعذّرت القراءة فيبقى الثابت المطلق كما كان.
   */
  maxPassengers?: number | null;
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
/* شطر قيمة datetime-local إلى الحقلين اللذين يعرفهما مسار التحويل      */
/* ------------------------------------------------------------------ */

/**
 * `<input type="datetime-local">` يُخرج "YYYY-MM-DDTHH:mm" (وقد يُلحق ثوانيَ).
 *
 * 🔒 **ولا يُبنى منه تاريخٌ هنا إطلاقاً.** الشطر وحده، ثم يمضي الجزآن إلى
 * `toIsoFromCairoInputs` — الدالة الوحيدة المسموح لها بتفسير ما كتبه العميل على
 * ساعة القاهرة. وأي `new Date(value)` في هذا الملف كان سيفسّره **بمنطقة جهاز
 * الزائر**، وهو بعينه العطل الذي عولج في الدفعة م‑٢.
 */
function splitLocalDateTime(value: string): [string, string] {
  if (!value) return ["", ""];
  const [date = "", rest = ""] = value.split("T");
  // الثواني تُقصّ: مُحلِّل الوقت يقبل HH:mm، والحقل لا يعرض ثوانيَ أصلاً
  return [date, rest.slice(0, 5)];
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
    /**
     * 🔴 **حلقة التركيز على الغلاف لا على الحقل — وهي إصلاح غيابٍ مقيس.**
     *
     * الحقل الرقمي يحمل `outline-none` بحقّ: حلقةٌ داخل حبّة العدّاد تصطدم
     * بحدّها. **لكنها لم تُستبدل بشيء** — والقياس على الصفحة الحيّة بعد تركيزٍ
     * حقيقي من لوحة المفاتيح: `:focus-visible` يتطابق، و`outline-style: none`،
     * و`box-shadow: none`، والغلاف بلا `focus-within`. أي أن من يصل عدد
     * الركاب بالـTab **لا يرى شيئاً يقول أين هو** (‏٢٫٤٫٧ AA).
     *
     * و`has-[input:focus-visible]` هو النمط القائم في المستودع لهذه الحالة
     * بعينها (بطاقة الخدمة في `components/site/services.tsx`): الهدف الظاهر
     * للمستخدم هو الحبّة كاملة لا الرقم في وسطها، فالحلقة تحيط ما يراه.
     */
    <div
      className={cn(
        "flex items-center justify-between gap-2 rounded-2xl border border-input bg-background px-2",
        "has-[input:focus-visible]:ring-2 has-[input:focus-visible]:ring-ring/60",
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
  maxPassengers = null,
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
  const [passengers, setPassengers] = React.useState(DEFAULT_PASSENGERS);
  const [luggage, setLuggage] = React.useState(DEFAULT_PASSENGERS);
  /**
   * لمس العميل حقلَ الحقائب ⇒ الرقم صار ملكه ويتوقف عن تتبّع الركاب.
   * راية لا رقم: قيمةٌ تعود فتُصحّح ما ضبطه المستخدم أسوأ من افتراضٍ رديء.
   */
  const [luggageTouched, setLuggageTouched] = React.useState(false);
  const [roundTrip, setRoundTrip] = React.useState(false);
  /** قيمة `datetime-local` — "YYYY-MM-DDTHH:mm" — للذهاب وللعودة */
  const [pickupLocal, setPickupLocal] = React.useState("");
  const [returnLocal, setReturnLocal] = React.useState("");
  const [quantities, setQuantities] = React.useState<Record<string, number>>({});
  const [extrasOpen, setExtrasOpen] = React.useState(false);

  const [pending, setPending] = React.useState(false);
  const [hint, setHint] = React.useState<string | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [result, setResult] = React.useState<QuoteResponseWithExtras | null>(null);
  const [trip, setTrip] = React.useState<TripSummary | null>(null);
  /**
   * حالة «الحاسبة لا تغطي هذه الرحلة» — **ليست خطأً**.
   *
   * كان رمز `no-classes` يسقط مع كل رموز الخطأ في صندوق أحمر واحد، فيرى الوفدُ
   * والمجموعةُ والمؤتمر «لا توجد فئة» ثم يغادرون؛ وبطاقةُ المخرج المكتوبة في
   * `offers.tsx` **لم تكن تُصيَّر أبداً** لأن الويدجت يمسح النتيجة فلا يُركَّب
   * `Offers` أصلاً. فصارت حالةً مستقلة برسالة القاعدة وبما كتبه العميل.
   */
  const [rescue, setRescue] = React.useState<{
    reason: NoClassesReason;
    prefill: QuoteRequestPrefill;
  } | null>(null);

  const resultsRef = React.useRef<HTMLDivElement | null>(null);
  const todayValue = React.useMemo(() => todayInputValue(), []);

  /* ---------------------------------------------------------------- */
  /* أ‑٢ — أدنى مهلة قبل الانطلاق، لمنتقي الذهاب والعودة                */
  /* ---------------------------------------------------------------- */

  /**
   * موعدا الذهاب والعودة يُجمعان **هنا** حين تكون الرحلة ذهاباً وعودة (منذ
   * 0031: هما مُدخلان سعريان)، فأرضية المهلة يجب أن تقع هنا كذلك. ولولا ذلك
   * لسعّرنا للعميل رحلةً بموعدٍ **ترفضه القاعدة عند الحجز** — أي بطاقةُ سعرٍ
   * لطلبٍ لا يمكن أن يُنشأ، وهو أسوأ من رسالة خطأ مبكرة.
   *
   * 🔒 والحدّ من `booking_min_pickup_at()` وحدها — نفس الدالة التي يفرضها
   * `create_booking` — فلا معادلة ثانية في المتصفح.
   *
   * ⚠ ورحلة الاتجاه الواحد لا موعد لها هنا أصلاً: موعدها في مسار الحجز،
   * وأرضيته هناك (`checkout.tsx`). فالقراءة تقع على الحالتين معاً لأن العميل
   * قد يبدّل المفتاح بعد التحميل، والجواب واحد لا يُعاد سؤاله.
   */
  const [lead, setLead] = React.useState<LeadTime | null>(null);
  React.useEffect(() => {
    let alive = true;
    void previewLeadTime()
      .then((result) => {
        if (alive) setLead(result);
      })
      .catch(() => {
        // الصمت الآمن: تبقى الأرضية «اليوم» كما كانت، والقاعدة هي التي ترفض
      });
    return () => {
      alive = false;
    };
  }, []);

  const leadFloor = lead?.enabled ? minInputValues(lead.minPickupAt) : null;
  /**
   * أرضية حقل `datetime-local` — **لحظةٌ واحدة** بدل «تاريخٌ ثم ساعةٌ مشروطة».
   *
   * وهي المكسب الصامت للدمج: حقلا التاريخ والساعة المنفصلان كانا يفرضان الساعة
   * **في يوم الأرضية وحده** (‏`pickupDate === leadFloor.date`) لأن حقل الوقت لا
   * يعرف أي يومٍ اختير. أما الحقل الواحد فيقارن اللحظة باللحظة.
   *
   * 🔒 والمصدر واحدٌ كما كان: `minInputValues(lead.minPickupAt)` — أي
   * `booking_min_pickup_at()` نفسها التي يفرضها `create_booking`، مقرَّبةً لأعلى
   * إلى الدقيقة. **ولا معادلة مهلةٍ تُحسب في المتصفح** (النمط ٨ في `LESSONS.md`).
   */
  const pickupMin = leadFloor ? `${leadFloor.date}T${leadFloor.time}` : `${todayValue}T00:00`;

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

  /* ---------------------------------------------------------------- */
  /* 🔴 الحقائب تتبع الركاب حتى يلمسها العميل — سلامةٌ تشغيلية لا تجميل */
  /* ---------------------------------------------------------------- */

  /**
   * 🔴 **المبدئي حقيبةٌ لكل راكب، لا حقيبةٌ واحدة.** والسبب أن عدد الحقائب
   * **مُدخل أهلية**: `quote_price` تُسقط كل فئة لا تتسع له (D-12).
   *
   * والخطر ليس في المبالغة بل في **التقليل**: من يحجز لأربعة ويترك الرقم على
   * واحدة يرى السيدان، فيحجزها، ثم يصل ومعه أربع حقائب لا تتسع. **والعطل يقع
   * عند الاستلام لا في النموذج** — متعهدٌ بُثَّت له رحلةٌ بسعةٍ غير كافية، أي
   * رحلةٌ فاشلة بأثرٍ ماليٍّ حقيقي (تعويض، أو سيارةٌ ثانية، أو إلغاء).
   *
   * فالافتراض يميل إلى **السعة الأكبر**، والعميل يُنقصه بضغطةٍ واحدة.
   *
   * ⚠ **ويتوقف عن التتبّع فور أن يلمسه** (‏`luggageTouched`): قيمةٌ تعود فتغلب
   * ما ضبطه المستخدم أسوأ من افتراضٍ رديء — يكتب ٢ لأربعة ركاب فيقفز الرقم
   * إلى ٤ من تحت يده، فلا يفهم أنه يملك الحقل أصلاً.
   *
   * والضبط **أثناء التصيير** لا في تأثير: نمط «تعديل الحالة عند تغيّر المُدخل»
   * الموثّق في React والمستعمل في هذا الملف نفسه لسقف الركاب — بلا وميضٍ يرى
   * فيه العميل الرقم القديم لجزء من الثانية.
   */
  const luggageDefault = Math.min(passengers, luggageCap);
  if (!luggageTouched && luggage !== luggageDefault) setLuggage(luggageDefault);
  /** الحقائب ما زالت على المبدئي المشتقّ — عندها وحدها يُقال للعميل من أين جاء */
  const luggageFollowsPassengers = !luggageTouched;

  /** بلغ العميل سقف الأسطول فعلاً — عندها وحدها يُقال له ما البديل */
  const luggageAtCap = luggage >= luggageCap;
  /** والسقف معلوم من الأسطول لا مجرد ثابت واجهة — فلا نُعلن رقماً لا نعرفه */
  const luggageCapKnown = luggageCap < MAX_LUGGAGE;

  /* ---------------------------------------------------------------- */
  /* سقف عدّاد الركاب — نفس قاعدة الحقائب حرفياً ومن قراءتها نفسها      */
  /* ---------------------------------------------------------------- */

  /**
   * ⚠ **سقف إدخال لا ترشيح** (D-12 بلا مساس): أي فئة تُعرض أو تُخفى تُقرّره
   * `quote_price` وحدها. ما يمنعه هذا السقف أن يعرض العدّاد رقماً **لا يمكن أن
   * ينجح**: كان يصعد إلى ٦٠ وأكبر سيارة تتسع لـ٥٠، فيصل وفدٌ من ٥٥ إلى صندوق
   * أحمر بعد أن قدّمت له الشاشةُ الرقمَ المستحيل بنفسها.
   *
   * ولا ينزل عن `MIN_PASSENGERS` مهما كان المقروء: سقفٌ صفريٌّ من قراءة فاشلة
   * كان سيمنع كل عميل من طلب راكب واحد.
   */
  const passengerCap =
    typeof maxPassengers === "number" &&
    Number.isFinite(maxPassengers) &&
    maxPassengers >= MIN_PASSENGERS
      ? Math.min(Math.trunc(maxPassengers), MAX_PASSENGERS)
      : MAX_PASSENGERS;
  /**
   * وصل سقفٌ أقلّ ممّا اختاره العميل ⇒ ينزل العدّاد إليه **أثناء التصيير**.
   *
   * نمط «تعديل الحالة عند تغيّر المُدخل» الموثّق في React، وهو المستعمل في
   * `offers.tsx` نفسه: التعديل هنا يعيد التصيير فوراً قبل أي رسم — بلا وميض
   * وبلا تأثير جانبي، وبلا التصيير المتتالي الذي يمنعه `set-state-in-effect`.
   */
  const [lastPassengerCap, setLastPassengerCap] = React.useState(passengerCap);
  if (lastPassengerCap !== passengerCap) {
    setLastPassengerCap(passengerCap);
    if (passengers > passengerCap) setPassengers(passengerCap);
  }

  /** بلغ العميل سقف الأسطول فعلاً — عندها وحدها يُقال له ما البديل */
  const passengersAtCap = passengers >= passengerCap;
  /** والسقف معلوم من الأسطول لا مجرد ثابت واجهة — فلا نُعلن رقماً لا نعرفه */
  const passengerCapKnown = passengerCap < MAX_PASSENGERS;

  // مواعيد الرحلة تُجمع هنا **للذهاب والعودة وحدها** — لأنها وحدها تغيّر السعر
  // (منها تُشتق ساعات الانتظار). ورحلة الاتجاه الواحد تبقى كما كانت: موعدها
  // يُجمع في مسار الحجز.
  //
  // 🔒 والحقل الواحد يُشطر إلى ما كان يُكتب في حقلين، ثم يمرّ بـ
  // `toIsoFromCairoInputs` **نفسها**: التحويل إلى توقيت القاهرة يبقى في مسارٍ
  // واحد، فلا يتكرر عطل «ساعةٌ ناقصة عند من يحجز من الخليج».
  const [pickupDate, pickupTime] = splitLocalDateTime(pickupLocal);
  const [returnDate, returnTime] = splitLocalDateTime(returnLocal);
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
  /**
   * ⚠ و`!pending`: التحذير يقول «اضغط احسب السعر» — وهي نصيحةٌ خاطئة والزرّ
   * يعمل بالفعل. وقد صار يقع فعلاً بعد إعادة الحساب التلقائية أدناه: كان يومض
   * ثانيةً كاملة أثناء النداء الذي يُبطله.
   */
  const staleInputs =
    result !== null && quotedInputsKey !== null && quotedInputsKey !== inputsKey && !pending;

  /* ---------------------------------------------------------------- */
  /* ⚠ قلبُ «عودة» يحرّك السعر — فيجب أن يتحرك السعر أمام العين         */
  /* ---------------------------------------------------------------- */

  /**
   * ⚠ الذهاب والعودة يضرب الإجمالي بـ`round_trip_factor` (‏١٫٨ اليوم). ومن
   * يقلب المفتاح بلا أن ينتبه إلى أثر ذلك يكتشفه **في أسوأ لحظة**: عند الدفع.
   *
   * وكان السلوك القديم يقول له بشريطٍ أصفر «اضغط احسب السعر» — أي يترك على
   * الشاشة رقماً صار كاذباً وينتظر منه فعلاً. فصار قلبُ المفتاح **وحده** يُعيد
   * النداء تلقائياً فتتغيّر البطاقات أمامه.
   *
   * 🔒 وهو **مقصورٌ على هذا المفتاح** لا على كل مُدخل: تحذير «بيانات قديمة»
   * يبقى كما هو لبقية الحقول، فلا يتحول النموذج إلى بثٍّ متصل على `/api/quote`.
   * وشرطه أن يكون على الشاشة سعرٌ أصلاً (‏`result !== null`) — قبل أول حساب
   * لا شيء ليتحرك.
   *
   * ⚠ وقلبُه **تشغيلاً** يحتاج موعدَي الرحلة (وهما مُدخلان سعريان منذ 0031)،
   * فالنداء ينتظرهما ولا يسقط: الدَّين يبقى قائماً حتى يكتمل الموعدان ثم يُنفَّذ.
   * وحتى ذلك الحين يقول السطرُ أسفل المفتاح ما ينتظره — لا صمت.
   *
   * 🔧 و**مرجعٌ لا حالة**: هذا الدَّين لا يُرسم على الشاشة (ما يُرسم مشتقٌّ في
   * `awaitingSchedule` أدناه)، فحالةٌ له تعني تصييراً زائداً؛ والراية تُرفع في
   * **معالج الحدث** حيث ينتمي القرار، لا في تأثير.
   */
  const requoteOwed = React.useRef(false);

  /**
   * ما يُقال للعميل حين قلب المفتاح ولم يكتمل الموعدان — **مشتقٌّ لا مخزَّن**:
   * سعرٌ معروض + ذهابٌ وعودة + موعدٌ ناقص = الأسعار أعلاه لا تشمل العودة بعد.
   */
  const awaitingSchedule = roundTrip && result !== null && (pickupAt === null || returnAt === null);

  /**
   * أحدث نسخة من `runQuote` بمغلَّفها الطازج — تأثيرُ إعادة النداء لا يستطيع
   * أن يضعها في اعتمادياته (تُبنى في كل تصيير فتدور الحلقة). والتأثيران
   * معرَّفان **بعد** `runQuote` لأن قراءتها قبل تعريفها تُجمّد نسخةً واحدة.
   */
  const runQuoteRef = React.useRef<((o: { silent: boolean }) => Promise<void>) | null>(null);

  function updatePassengers(next: number) {
    if (!Number.isFinite(next)) return;
    const clamped = Math.min(passengerCap, Math.max(MIN_PASSENGERS, Math.round(next)));
    setPassengers(clamped);
  }

  function updateLuggage(next: number) {
    if (!Number.isFinite(next)) return;
    // ⚠ كل مسار تعديلٍ يمرّ من هنا (الزرّان والكتابة اليدوية معاً)، فاللمسة
    // تُسجَّل مرةً واحدة في موضعٍ واحد — ولا يبقى مسارٌ يغيّر الرقم بلا تسجيل.
    setLuggageTouched(true);
    setLuggage(Math.min(luggageCap, Math.max(0, Math.round(next))));
  }

  function updateQuantity(slug: string, qty: number) {
    setQuantities((current) => ({ ...current, [slug]: qty }));
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await runQuote({ silent: false });
  }

  /**
   * نداء التسعير — **جسمُ الإرسال كما كان حرفياً**، استُخرج من `handleSubmit`
   * ليناديه شيئان لا واحد: زرّ «احسب السعر»، وإعادةُ الحساب بعد قلب «عودة».
   *
   * و`silent` يخصّ **التحقق وحده**: النداء التلقائي لا يصرخ في وجه العميل
   * «حدد تاريخ الانطلاق» لحظةَ ما قلب المفتاح وهو لم يصل إلى الحقل بعد.
   * أما الخطأ الآتي من الخادم فيُعرض في الحالتين — إخفاؤه يترك على الشاشة
   * سعراً لا يخصّ ما هو مضبوطٌ الآن.
   */
  async function runQuote({ silent }: { silent: boolean }) {
    setHint(null);
    setError(null);
    setRescue(null);

    if (!origin) {
      if (silent) return;
      setHint(
        t(
          "hints.pickOrigin",
          "اختر نقطة الانطلاق من قائمة الاقتراحات — نحتاج موقعها بدقة لحساب المسافة."
        )
      );
      return;
    }
    if (!destination) {
      if (silent) return;
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
      if (silent) return;
      setHint(t("hints.pickPickup", "حدد تاريخ ووقت الانطلاق لنحسب رحلة العودة بدقة."));
      return;
    }
    if (roundTrip && !returnAt) {
      if (silent) return;
      setHint(t("hints.pickReturn", "حدد تاريخ ووقت العودة — أو اختر «ذهاب فقط»."));
      return;
    }
    if (returnBeforePickup) {
      if (silent) return;
      setHint(t("hints.returnOrder", "موعد العودة يجب أن يكون بعد موعد الانطلاق."));
      return;
    }
    /**
     * أ‑٢ — طبقةٌ ثانية خلف أرضية المنتقي: `min` تلميحٌ يتجاوزه من يكتب
     * التاريخ يدوياً، ومن يترك الصفحة مفتوحة حتى يزحف «الآن» على اختياره.
     * والحدّ هو **ما أرجعته القاعدة** لا حاصلَ ضربٍ يُحسب هنا.
     */
    if (pickupAt !== null && lead?.enabled && lead.minPickupAt !== null) {
      const floor = Date.parse(lead.minPickupAt);
      if (Number.isFinite(floor) && new Date(pickupAt).getTime() < floor) {
        setHint(
          t(
            "hints.pickupTooSoon",
            "نحتاج مهلة {minutes} دقيقة على الأقل لتجهيز رحلتك — اختر موعد انطلاق بعد {value}.",
            {
              minutes: fmt.digits(lead.leadMinutes),
              value: fmt.dateTime(lead.minPickupAt) ?? "",
            }
          )
        );
        return;
      }
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

        // 🔑 الفرق الذي يصنع الفارق كله: `no-classes*` **نتيجة بحث لا عطل**.
        // بقية الرموز تقول «حاول مرة أخرى» وهي نصيحة صحيحة لها؛ وهذان الرمزان
        // إعادةُ المحاولة فيهما بالأرقام نفسها **لا يمكن أن تنجح أبداً**،
        // فالمخرج الوحيد قناةٌ بشرية — تحمل معها ما كتبه العميل بالفعل.
        //
        // 🔒 ولا نقرأ `json.message` هنا إطلاقاً: النص يُختار من الرمز في
        // `NoClassesRescue` بلغة الزائر. قراءتُه كانت تطبع عربيةَ الخادم على
        // `/en` — وهي القاعدة العامة لا استثناءها.
        const reason = NO_CLASSES_REASONS[json.code];
        if (reason) {
          setRescue({
            reason,
            prefill: {
              passengers,
              // موعد الانطلاق موجود في الذهاب والعودة وحدها (الاتجاه الواحد
              // يُسأل عنه في مسار الحجز)، و`null` لا يُكتب في الرابط أصلاً.
              pickupAt,
              from: origin.label || originText,
              to: destination.label || destinationText,
              // 🔒 ولا اسم ولا هاتف — والويدجت لا يملكهما أصلاً في هذه المرحلة
            },
          });
          return;
        }

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
      setRescue(null);
      setError(
        t("errors.network", "تعذر الاتصال بالخادم. تأكد من اتصالك بالإنترنت وحاول مرة أخرى.")
      );
    } finally {
      setPending(false);
    }
  }

  // تحديث المرجع بعد كل تصيير — ويسبق تأثير إعادة النداء في الترتيب، فيقرأ
  // ذاك النسخة الطازجة في نفس الالتزام.
  React.useEffect(() => {
    runQuoteRef.current = runQuote;
  });

  /**
   * إعادة الحساب بعد قلب «عودة» — التعليل الكامل عند `requoteOwed`.
   *
   * والتأثير هنا في محلّه بالتعريف: **مزامنةٌ مع نظامٍ خارجي** (نداء التسعير)
   * لا اشتقاقُ حالةٍ من حالة. ولا `setState` في جسمه — الدَّين مرجعٌ، والحالة
   * التي تتغيّر تتغيّر داخل `runQuote` بعد أن يردّ الخادم.
   */
  React.useEffect(() => {
    if (!requoteOwed.current || pending) return;
    // ذهابٌ وعودة بلا موعدين (أو بترتيبٍ مقلوب): يبقى الدَّين حتى يكتملا
    if (roundTrip && (pickupAt === null || returnAt === null || returnBeforePickup)) return;
    requoteOwed.current = false;
    void runQuoteRef.current?.({ silent: true });
  }, [pending, roundTrip, pickupAt, returnAt, returnBeforePickup]);

  // إظهار النتائج للزائر فور وصولها — مهم خاصة في نسخة البطل المضغوطة.
  // وبطاقة الإنقاذ نتيجةٌ كالعروض: من لا يراها يظن أن الضغطة لم تفعل شيئاً.
  React.useEffect(() => {
    if ((!result && !rescue) || !resultsRef.current) return;
    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    resultsRef.current.scrollIntoView({
      behavior: reduceMotion ? "auto" : "smooth",
      block: "nearest",
    });
  }, [result, rescue]);

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

        {/*
          ══════════════════════════════════════════════════════════════════
           صفٌّ واحد: ركاب · حقائب · «عودة» — والشرح أسفله بعرض الصفّ كاملاً
          ══════════════════════════════════════════════════════════════════

          **لماذا عمودان على الجوال لا ثلاثة:** على ٣٧٥ بكسل يصير العمود الثالث
          ~١١٤ بكسل، والعدّاد فيه زرّان (٣٦ لكلٍّ) ورقمٌ بينهما — فيضيق هدف
          اللمس. **والحقائب بالذات لا يجوز أن تصير فيّاضة**: التقليل فيها عطلٌ
          يقع عند الاستلام (انظر `luggageDefault`)، فحقلٌ يصعب ضبطه يدفع العميل
          إلى تركه. فالعدّادان يقتسمان الصفّ، والمفتاح تحتهما بعرضٍ كامل — وعند
          `sm` فأعلى تتسع الثلاثة في صفٍّ واحد.

          **والشرح خرج من العمودين إلى أسفل الصفّ**: النص نفسه حرفياً، لكنه في
          عمودٍ ضيّق يصير أربعة أسطر بدل سطرين — أي أن التوزيع على عمودين كان
          سيُطيل النموذج لا يقصّره. وربطُه بالحقل يبقى بـ`aria-describedby`.
        */}
        <div className="grid gap-3 sm:grid-cols-3">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor={passengersId} className="text-sm font-medium">
              {t("passengers.label", "عدد الركاب")}
            </Label>
            <CounterField
              id={passengersId}
              value={passengers}
              min={MIN_PASSENGERS}
              max={passengerCap}
              onChange={updatePassengers}
              decreaseLabel={t("passengers.decrease", "إنقاص عدد الركاب")}
              increaseLabel={t("passengers.increase", "زيادة عدد الركاب")}
              describedBy={passengersNoteId}
              fieldHeight={fieldHeight}
            />
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
          </div>

          {/*
            «عودة» مفتاحٌ واحد لا خيارَين — والعنوان مُدمجٌ في نصّه، فسطرُ
            «نوع الرحلة» فوقه كان يشغل ارتفاعاً ليقول ما يقوله المفتاح نفسه.
            وعلى الجوال يأخذ الصفّ كاملاً (‏`col-span-2`) فيبقى هدفُ لمسٍ مريح.
          */}
          <div className="col-span-2 flex flex-col gap-1.5 sm:col-span-1">
            <span className="text-sm font-medium leading-none">
              {t("tripType.label", "نوع الرحلة")}
            </span>
            <label
              className={cn(
                "flex cursor-pointer items-center justify-between gap-2 rounded-2xl border border-input bg-background px-3",
                fieldHeight
              )}
            >
              <span className="flex min-w-0 items-center gap-2 text-sm font-medium">
                <Repeat className="size-4 shrink-0 text-primary" aria-hidden="true" />
                <span className="truncate">{t("tripType.roundTrip", "ذهاب وعودة")}</span>
              </span>
              <span className="relative inline-flex shrink-0 items-center">
                <input
                  type="checkbox"
                  checked={roundTrip}
                  onChange={(event) => {
                    setRoundTrip(event.target.checked);
                    // الدَّين يُرفع هنا — في معالج الحدث حيث وقع القرار — ولا
                    // يُرفع إلا وعلى الشاشة سعرٌ يمكن أن يتحرك أمام العين.
                    if (result !== null) requoteOwed.current = true;
                  }}
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
          </div>
        </div>

        {/*
          شرحُ العدّادين والمفتاح — بعرض الصفّ كاملاً، والنصوص كما كانت حرفياً.
          `role="status"` لأن سطر الحقائب يتغيّر تلقائياً مع عدد الركاب: تغيُّرٌ
          صامت في نصٍّ يشرح رقماً تحرّك من نفسه يترك قارئ الشاشة بلا خبر.
        */}
        <div className="-mt-1 flex flex-col gap-1 text-xs leading-5 text-muted-foreground">
          {/*
            شرحٌ دائم، ثم — عند السقف وحده — ما البديل. والبديل يُقال **قبل**
            الاصطدام لا بعده، ولا يُعلَن رقمٌ للأسطول ما لم يُقرأ فعلاً.
          */}
          <p id={passengersNoteId}>
            {t("passengers.note", "الأطفال يُحسبون ضمن العدد — الحالي: {current}.", {
              current: fmt.passengers(passengers),
            })}
            {passengerCapKnown ? (
              <>
                {" "}
                {passengersAtCap
                  ? t(
                      "passengers.atCap",
                      "وهذا أقصى ما تتسع له أكبر سيارة لدينا ({max}). لمجموعة أكبر نرتّب أكثر من سيارة — اطلب عرض سعر.",
                      { max: fmt.passengers(passengerCap) }
                    )
                  : t("passengers.capNote", "وأكبر سيارة لدينا تتسع لـ{max}.", {
                      max: fmt.passengers(passengerCap),
                    })}
              </>
            ) : null}
          </p>

          {/*
            شرحٌ لا ترشيح: الفئة التي لا تتسع للحقائب **لا تعود من القاعدة**
            أصلاً (D-12)، فلا نُخفي هنا فئةً ولا نُظهرها — نقول للعميل لماذا قد
            تختفي فئة كان يتوقعها. ويُضاف إليه — ما دام الرقم مشتقّاً لا مختاراً
            — من أين جاء، حتى لا يبدو أنه ظهر بلا سبب.
          */}
          <p id={luggageNoteId} role="status">
            {luggageFollowsPassengers
              ? t(
                  "luggage.followsPassengers",
                  "قدّرناها حقيبة لكل راكب حتى تعدّلها — والأوسع أأمن: فئة لا تتسع لحقائبك لا تُعرض عليك أصلاً."
                )
              : t(
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

          {/*
            ⚠ أثر المفتاح على السعر يُقال **عنده**، لا بعد ثلاث لفّات.
            وحين يكون على الشاشة سعرٌ سابق، السطر يقول ماذا يجري الآن:
            «يُعاد الحساب» أو «ينتظر الموعدين» — ثم تتغيّر البطاقات فعلاً.
          */}
          <p role="status" className={cn(awaitingSchedule && "font-medium text-primary")}>
            {roundTrip
              ? awaitingSchedule
                ? t(
                    "tripType.awaitingSchedule",
                    "السعر يشمل رحلة العودة — حدد موعدي الذهاب والعودة ليُعاد حساب الأسعار."
                  )
                : t("tripType.roundTripNote", "السعر يشمل رحلة العودة.")
              : t("tripType.oneWayNote", "رحلة باتجاه واحد.")}
          </p>
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

            {/*
              حقلٌ واحد لكل اتجاه بدل أربعة — **دمجٌ بصري لا تبديلُ منطق**:
              • التحويل: يُشطر ويمرّ بـ`toIsoFromCairoInputs` نفسها (أعلاه).
              • الأرضية: `pickupMin` من `booking_min_pickup_at()` وحدها.
              • الترتيب: أرضية العودة هي لحظةُ الذهاب نفسها، والحارس المنطقي
                (‏`returnBeforePickup`) باقٍ كما هو خلفها للمساواة تحديداً.
            */}
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor={`${uid}-pickup-at`} className="text-sm font-medium">
                  {t("schedule.pickupAt", "موعد الانطلاق")}
                </Label>
                <input
                  id={`${uid}-pickup-at`}
                  type="datetime-local"
                  min={pickupMin}
                  value={pickupLocal}
                  onChange={(event) => setPickupLocal(event.target.value)}
                  aria-describedby={scheduleNoteId}
                  className={cn(
                    "w-full rounded-2xl border border-input bg-background px-3 text-base outline-none transition-colors focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50",
                    fieldHeight
                  )}
                />
                {/*
                  🔴 صدى بأرقام اللغة — والحقل الأصلي **لا يضمنها**: منتقي
                  المتصفح يرسم بلغة الجهاز لا بلغة الصفحة، فيرى العميل العربي
                  «09/14/2026» في حقلٍ كل ما حوله بالعربية. فالصدى هو ما يُقرأ
                  فعلاً، وهو من `fmt.dateTime` — نفس مُنسّق بقية الشاشة، وبتوقيت
                  القاهرة، فيرى العميل اللحظة التي ستُحجز له لا التي كتبها جهازه.
                */}
                {pickupAt ? (
                  <p className="text-xs leading-5 text-primary">{fmt.dateTime(pickupAt)}</p>
                ) : null}
              </div>

              <div className="flex flex-col gap-1.5">
                <Label htmlFor={`${uid}-return-at`} className="text-sm font-medium">
                  {t("schedule.returnAt", "موعد العودة")}
                </Label>
                <input
                  id={`${uid}-return-at`}
                  type="datetime-local"
                  min={pickupLocal || pickupMin}
                  value={returnLocal}
                  onChange={(event) => setReturnLocal(event.target.value)}
                  aria-describedby={scheduleNoteId}
                  className={cn(
                    "w-full rounded-2xl border border-input bg-background px-3 text-base outline-none transition-colors focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50",
                    fieldHeight
                  )}
                />
                {returnAt ? (
                  <p
                    className={cn(
                      "text-xs leading-5",
                      returnBeforePickup ? "text-destructive" : "text-primary"
                    )}
                  >
                    {fmt.dateTime(returnAt)}
                  </p>
                ) : null}
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

            {/*
              أ‑٢ — «أقرب موعد متاح» يُقال قبل المحاولة. أرضية المنتقي تمنع
              الاختيار لكنها صامتة: من يضغط على يومٍ رمادي لا يعرف السبب.
              ولا تظهر حين تكون المهلة مطفأة — سطرٌ يعلن قيداً لا وجود له عيبٌ
              من صنف «شاشة تَعِد بما لا تفعله القاعدة».
            */}
            {leadFloor && lead?.enabled ? (
              <p className="flex items-start gap-2 text-xs leading-6 text-muted-foreground">
                <CalendarClock
                  className="mt-1 size-3.5 shrink-0 text-primary"
                  aria-hidden="true"
                />
                {t(
                  "schedule.leadNote",
                  "نحتاج مهلة {minutes} دقيقة على الأقل لتجهيز رحلتك — أقرب موعد متاح {value}.",
                  {
                    minutes: fmt.digits(lead.leadMinutes),
                    value: fmt.dateTime(lead.minPickupAt) ?? "",
                  }
                )}
              </p>
            ) : null}
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
            : rescue
              ? // نتيجةٌ تُنطق كالعروض: قارئ الشاشة يسمع سبب العجز والمخرج معاً.
                // والسبب يأتي رمزاً فيُنطق بلغة الزائر — لا بجملة الخادم.
                rescue.reason === "luggage"
                ? t(
                    "statusNoClassesLuggage",
                    "لا توجد فئة تتسع لعدد الركاب وعدد الحقائب معاً — يمكنك طلب عرض سعر مخصص."
                  )
                : t(
                    "statusNoClasses",
                    "لا توجد فئة تتسع لهذا العدد من الركاب — يمكنك طلب عرض سعر مخصص."
                  )
              : result
                ? t("statusOffers", "تم عرض {count} من عروض الأسعار", {
                    count: fmt.number(result.offers.length),
                  })
                : ""}
      </span>

      {/*
        بطاقة الإنقاذ — المخرج الوحيد الذي يمكن أن ينجح حين لا تتسع أي فئة.
        موضعها موضعُ العروض بالضبط (نفس المرساة ونفس الحدّ العلوي) لأنها **بديلٌ
        عنها لا خطأٌ فوق النموذج**: الزائر ينظر إلى حيث تظهر الأسعار عادةً.
      */}
      {rescue ? (
        <div ref={resultsRef} className="flex flex-col gap-4 border-t border-border pt-5">
          <NoClassesRescue reason={rescue.reason} prefill={rescue.prefill} locale={locale} />
        </div>
      ) : null}

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
