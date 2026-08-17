"use client";

import * as React from "react";
import { CircleCheck, LoaderCircle, MapPin, MapPinned, MessageSquareText } from "lucide-react";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import type { GeoPlace } from "@/lib/pricing-types";
import type { Tx } from "@/components/site/i18n";
import {
  formatCoordsLabel,
  newSessionToken,
  SERVICE_BOUNDS,
  type PlaceProvider,
  type PlaceSearchSettings,
  type PlaceSuggestion,
  type ResolveResponse,
  type SuggestResponse,
} from "@/lib/place-search-types";
import { MapPicker } from "./map-picker";
import type { LocaleFormatter } from "./format";

/**
 * حقل مكان بإكمال تلقائي — الواجهة الأمامية للبحث رباعي الطبقات.
 *
 *     Google Places  →  Nominatim  →  «حدّد على الخريطة»  →  «اطلب عرض سعر»
 *
 * استُخرج من `search-widget.tsx` حين صار له أربع طبقات ومنتقي خريطة ودورةُ
 * رمز جلسة: مكوّنٌ داخليٌّ بهذا الحجم داخل ملفٍ من ١٧٠٠ سطر لا يُقرأ ولا يُختبر.
 *
 * 🔒 **وسلوك الحقل نفسه لم يتغيّر**: نفس نمط الـcombobox، ونفس التنقل بلوحة
 * المفاتيح، ونفس اشتقاق «جارٍ البحث» من `resultsQuery === query` بدل تخزينه،
 * ونفس الإلغاء عند كل ضغطة. المتغيّر هو **من يُسأل، وماذا يحدث حين لا يجد**.
 *
 * ══════════════════════════════════════════════════════════════════════════
 *  🔴 دورة رمز الجلسة — وهي سببُ أن تكون الفاتورة واحدة لا سبعاً
 * ══════════════════════════════════════════════════════════════════════════
 *
 * الرمز يُولَّد **مرةً لكل بحث** (لا لكل ضغطة مفتاح)، ويرافق كل نداء اقتراح،
 * ثم يرافق نداء التحويل الذي **يُنهي** الجلسة عند جوجل، ثم يُتلَف.
 *
 * وموضعه `useRef` لا `useState` بقصد: تغيّرُه لا يُرسم على الشاشة، وحالةٌ له
 * كانت ستُعيد التصيير على كل حرف بلا فائدة. والتفصيل الكامل — ومقياسُ الـ٤٠٠
 * الذي يقع على رمزٍ فاسد — في ترويسة `lib/place-search-types.ts`.
 *
 * ⚠ **والحدُّ الأدنى للحروف والتأجيل يصلان `props` من إعدادات اللوحة** ولم
 * يعودا ثابتين هنا: كلاهما ضابط تكلفة يملكه المالك (هجرة 0076).
 */

export type PlaceFieldProps = {
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
  /** إعدادات البحث من اللوحة — تصل من الصفحة الخادمية عبر الويدجت */
  settings: PlaceSearchSettings;
  /** لغة الزائر — تُمرَّر إلى المزوّد ليُجيب بها */
  locale: string;
  /**
   * رابط «اطلب عرض سعر» محمّلاً بما كتبه العميل — يبنيه الويدجت لأنه وحده
   * يعرف الحقلين معاً وعدد الركاب. غيابه = الطبقة الرابعة مطفأة.
   */
  buildQuoteHref?: (typed: string) => string;
};

export function PlaceField({
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
  settings,
  locale,
  buildQuoteHref,
}: PlaceFieldProps) {
  const [suggestions, setSuggestions] = React.useState<PlaceSuggestion[]>([]);
  /** النص الذي تخصّه النتائج الحالية — مصدر اشتقاق «جارٍ البحث» وحارس التكرار */
  const [resultsQuery, setResultsQuery] = React.useState<string | null>(null);
  /** من ردّ فعلاً — ومنه وحده يُقرَّر إظهار إسناد جوجل */
  const [provider, setProvider] = React.useState<PlaceProvider | null>(null);
  /** المزوّدون استُنفدوا: أظهر مخرجَي الطبقتين الثالثة والرابعة */
  const [exhausted, setExhausted] = React.useState(false);
  const [open, setOpen] = React.useState(false);
  const [activeIndex, setActiveIndex] = React.useState(-1);
  /** نداء التحويل جارٍ — الحقل يُقفل لحظتها فلا يُختار مكانان معاً */
  const [resolving, setResolving] = React.useState(false);
  const [mapOpen, setMapOpen] = React.useState(false);
  /** أسقط العميل دبوساً خارج منطقة الخدمة — يُقال له، ولا يُثبَّت */
  const [outOfArea, setOutOfArea] = React.useState(false);

  const inputRef = React.useRef<HTMLInputElement | null>(null);

  /* ---------------------------------------------------------------- */
  /* 🔴 رمز الجلسة                                                     */
  /* ---------------------------------------------------------------- */

  const sessionRef = React.useRef<string | null>(null);

  /** رمز الجلسة الجارية — يُولَّد عند أول نداء بعد كل اختيار */
  const currentSession = React.useCallback(() => {
    sessionRef.current ??= newSessionToken();
    return sessionRef.current;
  }, []);

  /** الجلسة انتهت عند جوجل بنداء التحويل — فيُتلَف الرمز ولا يُعاد استعماله */
  const endSession = React.useCallback(() => {
    sessionRef.current = null;
  }, []);

  const listboxId = `${id}-listbox`;
  const helperId = `${id}-helper`;
  const optionId = (index: number) => `${id}-option-${index}`;

  const query = value.trim();
  const tooShort = query.length < settings.minQueryChars;
  /** النتائج الحاضرة تخص النص الحالي فعلاً */
  const isFresh = resultsQuery === query;
  /** حالة الانتظار مشتقّة لا مخزَّنة: نص طويل كفايةً بلا نتائج تخصّه بعد */
  const loading = (!tooShort && !isFresh) || resolving;
  const hasSuggestions = !tooShort && suggestions.length > 0;
  const listOpen = open && hasSuggestions;
  /** لا نتائج، والمزوّدون قالوا كلمتهم — هنا تُعرض المخارج لا رسالة يأس */
  const showRescue = open && !tooShort && isFresh && suggestions.length === 0 && exhausted;
  /** إرشاد لطيف: كُتب نص لكن لم يُختر مكان من القائمة بعد */
  const needsPick = !place && !tooShort;

  const showMapEscape = showRescue && settings.mapPickerEnabled;
  const showQuoteEscape = showRescue && settings.quoteFallbackEnabled && Boolean(buildQuoteHref);

  // بحث مؤجل بمقدارٍ من اللوحة، مع إلغاء الطلب السابق عند كل ضغطة مفتاح.
  React.useEffect(() => {
    if (tooShort || isFresh) return;

    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      void (async () => {
        try {
          const res = await fetch("/api/geocode/suggest", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            // 🔴 نفس الرمز يرافق كل نداء في هذه الجلسة — وهو ما يجعل سبعة
            //    نداءات وحدةَ فوترةٍ واحدة عند جوجل.
            body: JSON.stringify({ q: query, sessionToken: currentSession(), locale }),
            signal: controller.signal,
          });
          const json = (await res.json()) as SuggestResponse;
          const next = json.ok ? json.suggestions : [];
          setSuggestions(next);
          setProvider(json.ok ? json.provider : null);
          setExhausted(json.ok ? json.exhausted : true);
          setResultsQuery(query);
          setActiveIndex(next.length > 0 ? 0 : -1);
          setOpen(true);
        } catch {
          // إلغاء أو فشل شبكة: لا اقتراحات، والزائر يكمل بلا رسالة خطأ مزعجة
          if (controller.signal.aborted) return;
          setSuggestions([]);
          setProvider(null);
          // ⚠ فشلُ شبكتنا نحن ⇒ المخارج تُعرض كذلك: العميل لا يعنيه أين وقع
          //   العطل، ويعنيه أن أمامه طريقاً يمشيه الآن.
          setExhausted(true);
          setResultsQuery(query);
          setActiveIndex(-1);
          setOpen(true);
        }
      })();
    }, settings.debounceMs);

    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [query, tooShort, isFresh, settings.debounceMs, locale, currentSession]);

  /** تثبيت مكانٍ محلول: نصُّه يصير «طازجاً» فلا يُطلق بحثاً عن اسمه */
  const commitPlace = React.useCallback(
    (selected: GeoPlace) => {
      onValueChange(selected.label);
      onPlaceChange(selected);
      setSuggestions([]);
      setResultsQuery(selected.label.trim());
      setActiveIndex(-1);
      setExhausted(false);
      setOpen(false);
      endSession();
    },
    [onValueChange, onPlaceChange, endSession]
  );

  async function selectSuggestion(selected: PlaceSuggestion) {
    // اقتراح Nominatim يحمل إحداثياته — اختياره لا يلمس الشبكة إطلاقاً
    if (selected.place) {
      commitPlace(selected.place);
      inputRef.current?.focus();
      return;
    }

    // 🔴 وهنا تُغلق جلسة جوجل: نداءٌ واحد بنفس الرمز، للمكان الذي اختاره
    //    العميل وحده — لا لكل سطرٍ رآه.
    setResolving(true);
    setOpen(false);
    try {
      const res = await fetch("/api/geocode/resolve", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ref: selected.ref,
          provider: selected.provider,
          sessionToken: sessionRef.current ?? undefined,
          locale,
        }),
      });
      const json = (await res.json()) as ResolveResponse;
      if (json.ok) {
        commitPlace(json.place);
      } else {
        // تعذّر التحويل ⇒ لا نُثبّت نصاً بلا إحداثيات (D-09)، ونفتح المخارج
        setSuggestions([]);
        setResultsQuery(query);
        setExhausted(true);
        setOpen(true);
      }
    } catch {
      setSuggestions([]);
      setResultsQuery(query);
      setExhausted(true);
      setOpen(true);
    } finally {
      setResolving(false);
      // الرمز أُنفق في نداء التحويل — نجح أو لم ينجح، الجلسة انتهت عند جوجل
      endSession();
      inputRef.current?.focus();
    }
  }

  /**
   * الدبوس ⇒ إحداثيات ⇒ وسمٌ للعرض. والإحداثيات هي ما يُسعَّر أياً كان الوسم.
   *
   * 🔴 **وفشلان لا فشلٌ واحد — وخلطُهما كان يبيع رحلةً لا يمكن تنفيذها.**
   *
   * كان كل ردٍّ غير `ok` يُعامَل معاملةَ «تعذّرت التسمية» فيُثبَّت الدبوس على
   * أي حال. والنتيجة أن زائراً يحرّك الخريطة إلى روما ويؤكّد: المسار يردّ
   * برفضٍ لأنه خارج منطقة الخدمة، **والواجهة تتجاهل الرفض وتُثبّت النقطة** —
   * ثم يُنفق محرّك المسافات نداءً مدفوعاً على القاهرة–روما ويُخزّنه، ويخرج
   * الزائر بسعرٍ حقيقيٍّ قابلٍ للحجز.
   *
   * فصارا رمزين:
   *   • `out-of-area` ⇒ **يُرفض الدبوس** ويُقال له لماذا.
   *   • أي فشلٍ آخر (شبكة · OSM لا يعرف الاسم) ⇒ يُقبل الدبوس بوسمٍ من
   *     إحداثياته. فمن حدّد موقعه **لا يُطرد لأن OSM لا يعرف اسم شارعه**.
   */
  async function pickFromMap(lat: number, lng: number) {
    setResolving(true);
    setOutOfArea(false);
    const coordsLabel = formatCoordsLabel(lat, lng);
    try {
      const res = await fetch("/api/geocode/reverse", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ lat, lng }),
      });
      const json = (await res.json()) as ResolveResponse;

      if (!json.ok && json.code === "out-of-area") {
        setOutOfArea(true);
        setOpen(true);
        return;
      }

      // 🔒 فشل التسمية لا يُسقط اختياراً صحيحاً: الإحداثيات معنا بالفعل
      commitPlace(json.ok ? json.place : { label: coordsLabel, lat, lng });
    } catch {
      commitPlace({ label: coordsLabel, lat, lng });
    } finally {
      setResolving(false);
    }
  }

  function handleKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      if (!hasSuggestions) return;
      event.preventDefault();
      setOpen(true);
      setActiveIndex((current) => {
        const step = event.key === "ArrowDown" ? 1 : -1;
        const next = current + step;
        if (next < 0) return suggestions.length - 1;
        if (next >= suggestions.length) return 0;
        return next;
      });
      return;
    }

    if (event.key === "Enter") {
      const highlighted = listOpen && activeIndex >= 0 ? suggestions[activeIndex] : undefined;
      if (highlighted) {
        // لا نرسل النموذج بينما القائمة مفتوحة — الإدخال هنا اختيارٌ لا إرسال
        event.preventDefault();
        void selectSuggestion(highlighted);
      }
      return;
    }

    if (event.key === "Escape") {
      setOpen(false);
      setActiveIndex(-1);
      return;
    }

    /**
     * 🔴 Tab يُغلق قائمة **الاقتراحات** ولا يُغلق لوحة **المخارج**.
     *
     * السطر كان `if (Tab) setOpen(false)` بإطلاق، وهو صحيحٌ للاقتراحات: عناصر
     * الـ`listbox` غير قابلة للتركيز أصلاً (نمط combobox يتنقّل فيها بالأسهم)،
     * فلا شيء خلفها يستحق البقاء.
     *
     * ⚠ لكن لوحة المخارج فيها **زرٌّ ورابطٌ حقيقيان**، وإغلاقُها على Tab كان
     * يُفكّكهما من الشجرة **قبل** أن يصلهما التركيز — فيقفز إلى حقل الوجهة.
     * مقيسٌ حياً: بعد Tab كان `activeElement` هو حقل «إلى أين» ولوحة المخارج
     * غير مُصيَّرة أصلاً. أي أن الطبقتين ٣ و٤ **لا يبلغهما مستخدم لوحة مفاتيح
     * إطلاقاً** (٢٫١٫١ A) — وهما مخرجُ من عجز البحث عنه، أي جوهر هذا العمل.
     *
     * والإغلاق لم يُفقد: `onBlur` على الغلاف أعلاه يتكفّل بمغادرة الحقل كلّه.
     */
    if (event.key === "Tab" && !showRescue) setOpen(false);
  }

  return (
    /**
     * 🔴 الإغلاق يقع على **مغادرة الحقل كلّه** لا على مغادرة صندوق الإدخال.
     *
     * وهو فرقٌ يصنع عطلين لو أُخذ على ظاهره:
     *
     * (أ) `onBlur` على `<input>` وحده كان **يقتل مخارج الطبقتين ٣ و٤ بلوحة
     *     المفاتيح**: من يضغط Tab ليبلغ «حدّد على الخريطة» يغادر الحقل، فيُغلق
     *     الصندوق ويختفي الزرّ قبل أن يصله التركيز — أي مخرجٌ يراه المبصر
     *     بالفأرة ولا يبلغه أحدٌ بلوحة المفاتيح (٢٫١٫١ A).
     *
     * (ب) وإعفاءُ حالة المخارج من الإغلاق أصلاً — وهو ما كان هنا — يترك
     *     الصندوق **مفتوحاً إلى الأبد** بعد أن ينصرف العميل إلى حقلٍ آخر،
     *     فيطبع لوحةً مطلقة الموضع فوق بقية النموذج.
     *
     * و`focusout` يصعد (بخلاف `blur`)، و`relatedTarget` هو ما استقبل التركيز:
     * فبقاؤه داخل هذه الشجرة يعني أن العميل ما زال في الحقل — والانتقالُ خارجَها
     * وحده هو المغادرة. و`null` (نقرةٌ على فراغ الصفحة) مغادرةٌ كذلك.
     */
    <div
      className="relative flex flex-col gap-1.5"
      onBlur={(event) => {
        const next = event.relatedTarget;
        if (next instanceof Node && event.currentTarget.contains(next)) return;
        setOpen(false);
      }}
    >
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
          aria-activedescendant={listOpen && activeIndex >= 0 ? optionId(activeIndex) : undefined}
          placeholder={placeholder}
          value={value}
          /**
           * ⚠ يُقفل أثناء التحويل — **وهذا ما يجعل التعليق أعلاه صادقاً.**
           * كان الحقل يبقى قابلاً للكتابة طوال رحلة الشبكة، فما يكتبه العميل
           * في تلك الثانية يمسحه `commitPlace` من تحت يده بلا أن يفهم لماذا.
           */
          disabled={resolving}
          onChange={(event) => {
            onValueChange(event.target.value);
            onPlaceChange(null);
            setOutOfArea(false);
          }}
          onKeyDown={handleKeyDown}
          onFocus={() => {
            if (hasSuggestions) setOpen(true);
          }}
          className={cn(
            "rounded-2xl bg-background ps-10 pe-10 text-base md:text-base",
            fieldHeight
          )}
        />

        <span className="pointer-events-none absolute end-3 top-1/2 -translate-y-1/2">
          {loading ? (
            <LoaderCircle
              className="size-4 animate-spin text-muted-foreground"
              aria-hidden="true"
            />
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
          {suggestions.map((suggestion, index) => (
            <li
              key={suggestion.ref}
              id={optionId(index)}
              role="option"
              aria-selected={index === activeIndex}
              // منع فقدان التركيز قبل النقر حتى لا تُغلق القائمة بالـ blur
              onMouseDown={(event) => event.preventDefault()}
              onMouseEnter={() => setActiveIndex(index)}
              onClick={() => void selectSuggestion(suggestion)}
              className={cn(
                "flex cursor-pointer items-center gap-2 rounded-xl px-3 py-2.5 text-sm leading-6 transition-colors",
                index === activeIndex ? "bg-muted text-foreground" : "text-foreground"
              )}
            >
              <MapPin className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
              <span className="min-w-0 flex-1">
                <span className="block truncate">{suggestion.label}</span>
                {suggestion.secondary ? (
                  <span className="block truncate text-xs text-muted-foreground">
                    {suggestion.secondary}
                  </span>
                ) : null}
              </span>
            </li>
          ))}

          {/*
            🔴 إسناد جوجل — **شرطُ ترخيصٍ لا لمسةُ تهذيب.**

            جوجل يشترط الإسناد **حيث تُعرض نتائجه**، ولذلك يقع داخل صندوق
            القائمة نفسه (نفس الحاوية البصرية) ويظهر **حين وحين فقط** يكون
            الرادُّ هو جوجل — لا حين يردّ Nominatim ولا حين لا يردّ أحد.

            ⚠ والنص `Google Maps` **بلا ترجمة وبلا تعديل وبلا كسر سطر** كما
            تنصّ سياسة العلامة حرفياً، ولذلك هو نصٌّ ثابت لا مفتاح رسائل —
            وهذا الاستثناء الوحيد المقصود من قاعدة «لا نص في JSX».
          */}
          {provider === "google" ? (
            <li
              className="mt-1 flex items-center justify-end gap-1.5 border-t border-border px-3 pb-1 pt-2 text-[11px] text-muted-foreground"
              aria-hidden="true"
            >
              <span dir="ltr" style={{ fontWeight: 400 }}>
                Google Maps
              </span>
            </li>
          ) : null}
        </ul>

        {/*
          ══════════════════════════════════════════════════════════════════
           لا نتائج — والطبقتان الثالثة والرابعة **بدل** رسالة اليأس القديمة
          ══════════════════════════════════════════════════════════════════

          كان هنا سطرٌ واحد: «لا نتائج مطابقة — جرّب اسماً أوضح». وهو صادقٌ
          ولا يفعل شيئاً: من لا يعرف اسماً أوضح **يغادر**. فصار المكان الذي
          كان ينتهي عنده العميلُ هو المكان الذي يختار فيه بين طريقين.
        */}
        {showRescue ? (
          <div className="absolute inset-x-0 top-[calc(100%+0.375rem)] z-50 flex flex-col gap-2 rounded-2xl border border-border bg-popover p-3 text-sm leading-6 shadow-xl">
            <p className="text-muted-foreground">
              {t("noResults", "لا نتائج مطابقة — جرّب اسماً أوضح مثل «مطار القاهرة الدولي».")}
            </p>

            {/*
              🔴 دبوسٌ خارج منطقة الخدمة — **يُقال ولا يُثبَّت**.
              والرسالة تقول ما يفعله الآن (يعود إلى الخريطة داخل مصر) لا
              «حدث خطأ»: نبرةُ الرسائل في هذا المستودع تشرح السبب والخطوة.
            */}
            {outOfArea ? (
              <p role="alert" className="text-destructive">
                {t(
                  "mapOutOfArea",
                  "هذا الموقع خارج نطاق خدمتنا — رحلاتنا داخل مصر. حرّك الخريطة إلى مكانك داخل مصر."
                )}
              </p>
            ) : null}

            {showMapEscape ? (
              <button
                type="button"
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => setMapOpen(true)}
                className="flex items-center gap-2 rounded-xl border border-border px-3 py-2.5 text-start text-sm font-medium text-foreground transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
              >
                <MapPinned className="size-4 shrink-0 text-primary" aria-hidden="true" />
                <span>{t("pickOnMap", "حدّد على الخريطة")}</span>
              </button>
            ) : null}

            {showQuoteEscape && buildQuoteHref ? (
              <a
                href={buildQuoteHref(query)}
                onMouseDown={(event) => event.preventDefault()}
                className="flex items-center gap-2 rounded-xl border border-border px-3 py-2.5 text-sm font-medium text-foreground transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
              >
                <MessageSquareText className="size-4 shrink-0 text-primary" aria-hidden="true" />
                <span>{t("askForQuote", "اطلب عرض سعر لهذا المكان")}</span>
              </a>
            ) : null}
          </div>
        ) : null}
      </div>

      {/* إرشاد لطيف: النص وحده لا يكفي، لا بد من اختيار مكان محدد */}
      <p
        id={helperId}
        className={cn("text-xs leading-5", needsPick ? "text-muted-foreground" : "sr-only")}
      >
        {/*
          ⚠ الحدّ الأدنى **رقمٌ يملكه المالك** (٢..٦ في 0076)، فلا يجوز أن يقول
          النص «حرفين» وهو مضبوطٌ على أربعة — يطلب من الزائر ما لا يكفي ثم يصمت.
          والعدّ يمرّ بمنسّق اللغة كأي رقم ظاهر في هذا الويدجت.
        */}
        {needsPick
          ? t("pickFromList", "اختر المكان من قائمة الاقتراحات لتحديد الموقع بدقة.")
          : t("typeMinChars", `اكتب ${fmt.number(settings.minQueryChars)} أحرف على الأقل ثم اختر المكان من قائمة الاقتراحات.`, {
              count: settings.minQueryChars,
            })}
      </p>

      <span className="sr-only" role="status" aria-live="polite">
        {listOpen
          ? t("suggestionsCount", `${fmt.number(suggestions.length)} اقتراحات متاحة`, {
              count: suggestions.length,
            })
          : ""}
      </span>

      <MapPicker
        open={mapOpen}
        onClose={() => setMapOpen(false)}
        onPick={(lat, lng) => void pickFromMap(lat, lng)}
        title={t("mapTitle", "حدّد الموقع على الخريطة")}
        // 🔒 نفس الثابت الذي يفرضه `/api/geocode/reverse` — مصدرٌ واحد، فلا
        //    تسمح الخريطة بما يرفضه المسار (انظر `SERVICE_BOUNDS` في العقد).
        bounds={SERVICE_BOUNDS}
        /*
          مرساة الفتح من اللوحة (هجرة 0080) — مطار القاهرة افتراضاً، وهو حيث
          يبدأ أكثر عمل المالك. ونسخةُ Whitelabel في مدينةٍ أخرى تُغيّرها من
          الإعدادات لا من الكود (D-01).

          ⚠ ولا تصير قيمةً: النافذة تفتح هناك، و`onPlaceChange` لا يُستدعى إلا
          من `pickFromMap` — أي من زرّ «تأكيد هذا الموقع» وحده.
        */
        center={settings.defaultCenter}
        labels={{
          hint: t("mapHint", "حرّك الخريطة حتى يقع الدبوس على مكانك بالضبط."),
          confirm: t("mapConfirm", "تأكيد هذا الموقع"),
          cancel: t("mapCancel", "إلغاء"),
          zoomIn: t("mapZoomIn", "تكبير"),
          zoomOut: t("mapZoomOut", "تصغير"),
          attribution: t("mapAttribution", "© مساهمو OpenStreetMap"),
        }}
      />
    </div>
  );
}
