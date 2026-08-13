"use client";

import * as React from "react";
import { CircleCheck, LoaderCircle, MapPin } from "lucide-react";

import { HelpTip } from "@/components/shared/HelpTip";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { GeoPlace } from "@/lib/pricing-types";
import { cn } from "@/lib/utils";

/**
 * منتقي مكان مستقل للبورتال — يكتب اختياره في حقول مخفية داخل النموذج المحيط،
 * فيُرسَل مع بقية الحقول إلى server action عادي بلا حالة عميل مشتركة.
 *
 * يتبع نفس عقد ويدجت البحث في الموقع العام (`components/booking/search-widget.tsx`):
 * نداء `/api/geocode` مؤجَّل ٣٥٠ مللي ثانية، إلغاء الطلب السابق عند كل ضغطة مفتاح،
 * وحالة الانتظار **مشتقّة** لا مخزَّنة. الفارق أن نتيجته إحداثيات محفوظة لا استعلام
 * سعر: النقطة هنا مرساة تغطية دائمة، ولذلك تُعرض إحداثياتها للمتعهد ليتحقق منها.
 *
 * الحقول المرسلة: `${name}_label` و`${name}_lat` و`${name}_lng`.
 */

const MIN_QUERY_LENGTH = 2;
const DEBOUNCE_MS = 350;

type GeocodeResponse =
  | { ok: true; places: GeoPlace[] }
  | { ok: false; code: string; message: string };

export type PickedPlace = { label: string; lat: number; lng: number };

export function PlacePicker({
  id,
  name,
  label,
  placeholder,
  help,
  defaultPlace = null,
  disabled = false,
}: {
  id: string;
  /** بادئة أسماء الحقول المخفية */
  name: string;
  label: string;
  placeholder?: string;
  help?: React.ReactNode;
  defaultPlace?: PickedPlace | null;
  disabled?: boolean;
}) {
  const [value, setValue] = React.useState(defaultPlace?.label ?? "");
  const [place, setPlace] = React.useState<PickedPlace | null>(defaultPlace);
  const [places, setPlaces] = React.useState<GeoPlace[]>([]);
  /** النص الذي تخصّه النتائج الحالية — مصدر اشتقاق «جارٍ البحث» وحارس التكرار */
  const [resultsQuery, setResultsQuery] = React.useState<string | null>(
    defaultPlace?.label.trim() ?? null
  );
  const [open, setOpen] = React.useState(false);
  const [activeIndex, setActiveIndex] = React.useState(-1);

  const inputRef = React.useRef<HTMLInputElement | null>(null);

  const listboxId = `${id}-listbox`;
  const helperId = `${id}-helper`;
  const optionId = (index: number) => `${id}-option-${index}`;

  const query = value.trim();
  const tooShort = query.length < MIN_QUERY_LENGTH;
  const isFresh = resultsQuery === query;
  const loading = !disabled && !tooShort && !isFresh;
  const hasSuggestions = !tooShort && places.length > 0;
  const listOpen = open && hasSuggestions;
  const showEmptyState = open && !tooShort && isFresh && places.length === 0;

  React.useEffect(() => {
    if (disabled || tooShort || isFresh) return;

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
  }, [query, tooShort, isFresh, disabled]);

  function selectPlace(selected: GeoPlace) {
    setValue(selected.label);
    setPlace({ label: selected.label, lat: selected.lat, lng: selected.lng });
    setPlaces([]);
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
        // القائمة مفتوحة: الإدخال هنا اختيارٌ لا إرسالٌ للنموذج
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
    <div className="space-y-1.5">
      <Label htmlFor={id} className="flex items-center gap-1.5">
        {label}
        {help ? <HelpTip>{help}</HelpTip> : null}
      </Label>

      <div className="relative">
        <span
          className="pointer-events-none absolute start-3 top-1/2 -translate-y-1/2 text-muted-foreground"
          aria-hidden="true"
        >
          <MapPin className="size-4" />
        </span>

        <Input
          id={id}
          ref={inputRef}
          type="text"
          role="combobox"
          autoComplete="off"
          required
          disabled={disabled}
          aria-expanded={listOpen}
          aria-controls={listboxId}
          aria-autocomplete="list"
          aria-describedby={helperId}
          aria-activedescendant={listOpen && activeIndex >= 0 ? optionId(activeIndex) : undefined}
          placeholder={placeholder}
          value={value}
          onChange={(event) => {
            setValue(event.target.value);
            // أي تعديل يدوي يُبطل الإحداثيات: النص وحده لا يحدد نقطة على الخريطة
            setPlace(null);
          }}
          onKeyDown={handleKeyDown}
          onFocus={() => {
            if (hasSuggestions) setOpen(true);
          }}
          onBlur={() => setOpen(false)}
          className="ps-9 pe-9"
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

        <ul
          id={listboxId}
          role="listbox"
          aria-label={`اقتراحات ${label}`}
          className={cn(
            "absolute inset-x-0 top-[calc(100%+0.25rem)] z-50 max-h-64 overflow-y-auto rounded-xl bg-popover p-1.5 text-popover-foreground shadow-xl ring-1 ring-foreground/10",
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
                "flex cursor-pointer items-center gap-2 rounded-lg px-3 py-2 text-sm leading-6 transition-colors",
                index === activeIndex ? "bg-muted text-foreground" : "text-foreground"
              )}
            >
              <MapPin className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
              <span className="min-w-0 flex-1">{suggestion.label}</span>
            </li>
          ))}
        </ul>

        {showEmptyState ? (
          <div className="absolute inset-x-0 top-[calc(100%+0.25rem)] z-50 rounded-xl bg-popover px-3 py-2.5 text-sm leading-6 text-muted-foreground shadow-xl ring-1 ring-foreground/10">
            لا نتائج مطابقة — جرّب اسماً أوضح مثل «مطار القاهرة الدولي».
          </div>
        ) : null}
      </div>

      {/* القيم المرسلة فعلاً — تبقى فارغة ما لم يُختر مكان من القائمة */}
      <input type="hidden" name={`${name}_label`} value={place?.label ?? ""} />
      <input type="hidden" name={`${name}_lat`} value={place ? String(place.lat) : ""} />
      <input type="hidden" name={`${name}_lng`} value={place ? String(place.lng) : ""} />

      <p
        id={helperId}
        className={cn("text-xs leading-5", place ? "text-muted-foreground" : "text-amber-700 dark:text-amber-300")}
      >
        {place ? (
          <span dir="ltr" className="tabular-nums">
            {place.lat.toFixed(5)}, {place.lng.toFixed(5)}
          </span>
        ) : (
          "اكتب حرفين على الأقل ثم اختر المكان من قائمة الاقتراحات — الاسم وحده لا يحدد نقطة على الخريطة."
        )}
      </p>
    </div>
  );
}
