"use client";

import * as React from "react";
import { createPortal } from "react-dom";
import { Minus, Plus, X } from "lucide-react";

import { Button } from "@/components/ui/button";

/**
 * منتقي الموقع على الخريطة — الطبقة الثالثة في محرك البحث عن الأماكن.
 *
 * حين يعجز الإكمال التلقائي (جوجل ثم Nominatim) عن إيجاد مكان العميل — وهو حال
 * كثير من القرى والفنادق الصغيرة والعناوين الوصفية في مصر — يبقى للعميل مخرجٌ
 * واحد قبل «اطلب عرض سعر»: أن يشير بإصبعه إلى مكانه على الخريطة.
 *
 * ⚠ **بلا أي مكتبة خرائط.** لا Leaflet ولا Mapbox ولا SDK جوجل: الخريطة هنا
 * شبكة صور `<img>` من بلاطات OpenStreetMap الخام، مرتّبة بحساب ميركاتور أدناه.
 * السبب قرارٌ لا كسل: البدائل تعني مفتاحاً أو اشتراكاً أو ٤٠+ ك.ب في الحزمة
 * مقابل ما لا نحتاجه (طبقات، أشكال، تجميع علامات). المطلوب إحداثيّان اثنان.
 *
 * وسياسة استعمال بلاطات OSM تشترط الإسناد الظاهر — ولذلك «© مساهمو
 * OpenStreetMap» مثبّتة فوق الخريطة دائماً ولا تخضع لـ`labels` (شرط ترخيص لا
 * نصّ واجهة).
 *
 * ولا نصّ عربياً ثابتاً هنا سواها: كل ما يقرؤه العميل يصل عبر `labels` من
 * المستدعي كي يبقى قابلاً للترجمة (اتفاقية اللغة، البند ١).
 */

/* ------------------------------------------------------------------ */
/* ثوابت الخريطة                                                        */
/* ------------------------------------------------------------------ */

/** حجم بلاطة OSM القياسية بالبكسل */
const TILE_SIZE = 256;

const MIN_ZOOM = 5;
const MAX_ZOOM = 18;
const DEFAULT_ZOOM = 13;

/** صفٌّ وعمودٌ إضافيان خارج الإطار: يمنعان ظهور فراغ أبيض أثناء السحب */
const TILE_BUFFER = 1;

/**
 * أقصى خط عرض يمثّله إسقاط ميركاتور المربّع (‏Web Mercator).
 * بعده يتمدد الإسقاط إلى ما لا نهاية، فتصير خريطة العالم مربّعاً غير مكتمل.
 */
const MAX_LATITUDE = 85.05112878;

/** ما يُعدّ عنصراً قابلاً للتركيز داخل النافذة — أساس حبس التركيز */
const FOCUSABLE_SELECTOR =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

/* ------------------------------------------------------------------ */
/* إسقاط ميركاتور المربّع — تحويل بين (خط طول/عرض) وبكسل العالم         */
/* ------------------------------------------------------------------ */

/**
 * العالم كله عند تكبير `z` مربّعٌ ضلعه `256 × 2^z` بكسل، مقسّمٌ إلى `2^z × 2^z`
 * بلاطة. والمعادلات هي ما يستعمله كل مزوّد بلاطات (‏slippy map):
 *
 *   x = (lng + 180) / 360 × side
 *   y = (1 − ln(tan φ + sec φ) / π) / 2 × side      حيث φ خط العرض بالراديان
 *
 * والعكس:
 *
 *   lng = x / side × 360 − 180
 *   lat = atan(sinh(π × (1 − 2y / side))) بالدرجات
 *
 * لماذا `ln(tan φ + sec φ)` وليس ضرباً بسيطاً: ميركاتور يحفظ الزوايا لا
 * المساحات، فيتمدد المقياس كلما ابتعدنا عن خط الاستواء — وهذا التمدد بالذات هو
 * ما يجعل بلاطةً مربّعة واحدة تصلح لكل خطوط العرض.
 */

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

/** ضلع مربّع العالم بالبكسل عند تكبير ما */
function worldSize(zoom: number): number {
  return TILE_SIZE * 2 ** zoom;
}

function lngToWorldX(lng: number, zoom: number): number {
  return ((lng + 180) / 360) * worldSize(zoom);
}

function latToWorldY(lat: number, zoom: number): number {
  const phi = (clamp(lat, -MAX_LATITUDE, MAX_LATITUDE) * Math.PI) / 180;
  const mercator = Math.log(Math.tan(phi) + 1 / Math.cos(phi));
  return ((1 - mercator / Math.PI) / 2) * worldSize(zoom);
}

function worldXToLng(x: number, zoom: number): number {
  return (x / worldSize(zoom)) * 360 - 180;
}

function worldYToLat(y: number, zoom: number): number {
  const t = Math.PI * (1 - (2 * y) / worldSize(zoom));
  return (Math.atan(Math.sinh(t)) * 180) / Math.PI;
}

/** يعيد خط الطول إلى المدى [−180، 180) بعد لفٍّ حول الكرة */
function normalizeLng(lng: number): number {
  return ((((lng + 180) % 360) + 360) % 360) - 180;
}

/** ست خانات عشرية ≈ ١١ سم على الأرض — دقّة تفوق أي دبوس يضعه إصبع */
function round6(value: number): number {
  return Math.round(value * 1e6) / 1e6;
}

type MapView = { lat: number; lng: number; zoom: number };

/**
 * تحريك المركز بمقدار إزاحة بالبكسل (‏dx يميناً موجب، dy أسفل موجب).
 *
 * السحب يحرّك الخريطة تحت الدبوس الثابت، فالمركز يتحرك **عكس** الإصبع.
 * وخط العرض يُقصّ داخل مربّع العالم كي لا يتجاوز السحب القطبين إلى العدم.
 */
function panView(
  view: MapView,
  dx: number,
  dy: number,
  bounds?: MapPickerProps["bounds"]
): MapView {
  const side = worldSize(view.zoom);
  const x = lngToWorldX(view.lng, view.zoom) - dx;
  const y = clamp(latToWorldY(view.lat, view.zoom) - dy, 0, side);

  let lat = worldYToLat(y, view.zoom);
  let lng = normalizeLng(worldXToLng(x, view.zoom));

  /**
   * 🔴 القصّ إلى منطقة الخدمة — **بعد** إسقاط مركاتور لا قبله.
   *
   * والقصّ لا المنع: الخريطة تتوقف عند الحافة بدل أن تتجمّد فجأةً في منتصف
   * السحب، فيفهم العميل أن هناك حدّاً بلا رسالة خطأ. والدبوس ثابت في المركز،
   * فقصُّ المركز هو **بعينه** قصُّ ما سيُرسَل عند التأكيد.
   */
  if (bounds) {
    lat = clamp(lat, bounds.minLat, bounds.maxLat);
    lng = clamp(lng, bounds.minLng, bounds.maxLng);
  }

  return { lat, lng, zoom: view.zoom };
}

/* ------------------------------------------------------------------ */
/* العقد                                                                */
/* ------------------------------------------------------------------ */

export type MapPickerProps = {
  open: boolean;
  onClose: () => void;
  /** يُستدعى بالإحداثيات التي أسقط عليها العميل الدبوس */
  onPick: (lat: number, lng: number) => void;
  /** نص العنوان في رأس النافذة */
  title: string;
  /**
   * 🔴 **مرساة الفتح — إعدادُ مالكٍ إلزاميّ، لا ثابتٌ في هذا الملف.**
   *
   * كان هنا `CAIRO_CENTER = { 30.0444, 31.2357 }` — ميدان التحرير، مكتوباً في
   * مكوّن واجهة. وقرار المالك (2026-08-17) نقله إلى الإعدادات ومطارَ القاهرة
   * افتراضاً: `place_search_settings.default_center_*` (هجرة 0080)، ويصل هنا
   * عبر `settings.defaultCenter` من الصفحة الخادمية.
   *
   * ⚠ **وإلزاميّ لا اختياريّ بقصد**: `center?` مع ارتدادٍ محليّ كان يعني أن
   * مستدعياً ينسى تمريره يحصل على مركزٍ محفورٍ صامت — وهو بعينه ما نُقل من
   * هنا. فمن لا يملك الإعداد يمرّر `PLACE_SEARCH_DEFAULTS.defaultCenter`
   * صراحةً، فيُقرأ القرار في موضع النداء.
   *
   * ⚠ **ومرساةُ فتحٍ ليست قيمة**: لا شيء يُكتب في الحقل حتى يضغط العميل
   * «تأكيد هذا الموقع» — `onPick` لا تُستدعى من أي مسارٍ آخر في هذا الملف.
   */
  center: { lat: number; lng: number };
  /** نصوص مترجمة تصل من المستدعي (لا تكتب نصاً عربياً ثابتاً في المكوّن) */
  labels: {
    hint: string; // «حرّك الخريطة حتى يقع الدبوس على مكانك بالضبط»
    confirm: string; // «تأكيد هذا الموقع»
    cancel: string; // «إلغاء»
    zoomIn: string;
    zoomOut: string;
    /**
     * ⚠ إسناد OpenStreetMap — **مترجَمٌ بخلاف إسناد جوجل**.
     *
     * شرطُ ترخيص OSM هو **الحضور والوضوح**، لا لغةٌ بعينها؛ والإسناد المترجَم
     * مقبولٌ صراحةً. وكان النص عربياً ثابتاً في المكوّن، فيرى زائر `/en`
     * سطراً عربياً وحيداً داخل نافذةٍ مترجَمة بالكامل. أما `Google Maps` في
     * `place-field.tsx` فسياسةُ علامته تمنع ترجمته — ولذلك هو الاستثناء
     * **الوحيد** المقصود.
     */
    attribution: string;
  };
  /**
   * حدود منطقة الخدمة — **يُقصّ إليها المركز فلا يخرج الدبوس أصلاً**.
   *
   * 🔴 وليست تجميلاً: بلا قصٍّ يستطيع الزائر أن يحرّك الخريطة إلى روما ويؤكّد،
   * فيُنفق محرّك المسافات نداءً مدفوعاً على مسارٍ لا يمكن أن ننفّذه ويُخزّنه في
   * `distance_cache` دائماً، ويخرج بسعرٍ حقيقيٍّ قابلٍ للحجز. والمسار يرفض
   * كذلك (‏`out-of-area`) — وهذه الطبقة تمنع الاصطدام قبل أن يقع.
   */
  bounds?: { minLat: number; maxLat: number; minLng: number; maxLng: number };
};

export function MapPicker({
  open,
  onClose,
  onPick,
  title,
  center,
  labels,
  bounds,
}: MapPickerProps): React.JSX.Element | null {
  const centerLat = center.lat;
  const centerLng = center.lng;

  const hintId = React.useId();
  const panelRef = React.useRef<HTMLDivElement | null>(null);
  const surfaceRef = React.useRef<HTMLDivElement | null>(null);
  /** المؤشر الممسوك حالياً وآخر موضع له — في ref لأن السحب لا يُعاد تصييره */
  const dragRef = React.useRef<{ pointerId: number; x: number; y: number } | null>(null);

  /** مقاس سطح الخريطة بالبكسل — يُقاس في تأثير (لا `window` أثناء التصيير) */
  const [size, setSize] = React.useState({ width: 0, height: 0 });
  const [view, setView] = React.useState<MapView>(() => ({
    lat: centerLat,
    lng: centerLng,
    zoom: DEFAULT_ZOOM,
  }));

  /**
   * إعادة الخريطة إلى نقطة البداية عند كل فتحٍ جديد أو تغيّر مركز.
   *
   * ضبطُ الحالة أثناء التصيير — لا في تأثير — عمداً: التأثير كان سيعرض إطاراً
   * واحداً بمدينة الفتحة السابقة قبل أن يصحّحه، وهو وميضٌ مرئي فعلاً.
   */
  const sessionKey = open ? `${centerLat}:${centerLng}` : "closed";
  const [lastSession, setLastSession] = React.useState(sessionKey);
  if (lastSession !== sessionKey) {
    setLastSession(sessionKey);
    setView({ lat: centerLat, lng: centerLng, zoom: DEFAULT_ZOOM });
  }

  // قياس سطح الخريطة ومتابعة تغيّره (دوران الجهاز، تغيّر حجم النافذة).
  React.useEffect(() => {
    if (!open) return;
    const element = surfaceRef.current;
    if (!element) return;

    const measure = () =>
      setSize({ width: element.clientWidth, height: element.clientHeight });
    measure();

    if (typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => observer.disconnect();
  }, [open]);

  // فتح النافذة: التركيز ينتقل إليها، وتمرير الصفحة خلفها يتوقف، ثم يعود
  // التركيز إلى العنصر الذي جاء منه العميل عند الإغلاق.
  React.useEffect(() => {
    if (!open) return;
    const previouslyFocused = document.activeElement as HTMLElement | null;
    const previousOverflow = document.body.style.overflow;

    // إغلاقٌ وسط سحبة يترك المؤشر ممسوكاً بلا `pointerup` — التصفير هنا يمنع
    // فتحةً تالية لا تستجيب للسحب إطلاقاً
    dragRef.current = null;
    panelRef.current?.focus();
    document.body.style.overflow = "hidden";

    return () => {
      document.body.style.overflow = previousOverflow;
      previouslyFocused?.focus?.();
    };
  }, [open]);

  // Escape يُغلق — على مستوى النافذة لا اللوحة، فيعمل مهما كان موضع التركيز.
  React.useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open, onClose]);

  /**
   * شبكة البلاطات الظاهرة.
   *
   * المفتاح `zoom/i/j` بإحداثي البلاطة **قبل** اللفّ حول الكرة: يبقى ثابتاً ما
   * دامت البلاطة على الشاشة، فتُحرَّك الصورة الموجودة بدل إعادة تحميلها.
   */
  const tiles = React.useMemo(() => {
    if (size.width === 0 || size.height === 0) return [];

    const { zoom } = view;
    const count = 2 ** zoom;
    const centerTileX = lngToWorldX(view.lng, zoom) / TILE_SIZE;
    const centerTileY = latToWorldY(view.lat, zoom) / TILE_SIZE;
    const halfCols = size.width / 2 / TILE_SIZE;
    const halfRows = size.height / 2 / TILE_SIZE;

    const firstCol = Math.floor(centerTileX - halfCols) - TILE_BUFFER;
    const lastCol = Math.floor(centerTileX + halfCols) + TILE_BUFFER;
    const firstRow = Math.floor(centerTileY - halfRows) - TILE_BUFFER;
    const lastRow = Math.floor(centerTileY + halfRows) + TILE_BUFFER;

    const grid: { key: string; url: string; x: number; y: number }[] = [];
    for (let j = firstRow; j <= lastRow; j += 1) {
      // فوق القطب الشمالي أو تحت الجنوبي لا توجد بلاطات — يُترك الفراغ
      if (j < 0 || j >= count) continue;
      for (let i = firstCol; i <= lastCol; i += 1) {
        const wrappedX = ((i % count) + count) % count;
        grid.push({
          key: `${zoom}/${i}/${j}`,
          url: `https://tile.openstreetmap.org/${zoom}/${wrappedX}/${j}.png`,
          x: size.width / 2 + (i - centerTileX) * TILE_SIZE,
          y: size.height / 2 + (j - centerTileY) * TILE_SIZE,
        });
      }
    }
    return grid;
  }, [size.width, size.height, view]);

  /* ---------------- السحب: مؤشر واحد يعمل بالفأرة واللمس معاً ---------------- */

  function handlePointerDown(event: React.PointerEvent<HTMLDivElement>) {
    // إصبعٌ ثانٍ أثناء سحبٍ جارٍ يُتجاهل (لا تكبير بإصبعين في هذه النسخة)
    if (dragRef.current) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    dragRef.current = { pointerId: event.pointerId, x: event.clientX, y: event.clientY };
  }

  function handlePointerMove(event: React.PointerEvent<HTMLDivElement>) {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;

    const dx = event.clientX - drag.x;
    const dy = event.clientY - drag.y;
    if (dx === 0 && dy === 0) return;

    drag.x = event.clientX;
    drag.y = event.clientY;
    setView((current) => panView(current, dx, dy, bounds));
  }

  function handlePointerEnd(event: React.PointerEvent<HTMLDivElement>) {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    dragRef.current = null;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  }

  /** التكبير حول المركز: الإحداثيّان لا يتغيران، فالدبوس يبقى على مكانه */
  function zoomBy(step: number) {
    setView((current) => ({
      ...current,
      zoom: clamp(current.zoom + step, MIN_ZOOM, MAX_ZOOM),
    }));
  }

  function handlePanelKeyDown(event: React.KeyboardEvent<HTMLDivElement>) {
    if (event.key !== "Tab") return;
    const panel = panelRef.current;
    if (!panel) return;

    // حبس التركيز داخل النافذة: بدونه يخرج Tab إلى صفحة الحجز خلف الحاجب
    const focusables = Array.from(
      panel.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)
    ).filter((element) => element.offsetParent !== null);
    if (focusables.length === 0) return;

    const first = focusables[0];
    const last = focusables[focusables.length - 1];
    const active = document.activeElement;

    if (event.shiftKey && (active === first || active === panel)) {
      event.preventDefault();
      last.focus();
      return;
    }
    if (!event.shiftKey && active === last) {
      event.preventDefault();
      first.focus();
    }
  }

  function handleConfirm() {
    onPick(round6(view.lat), round6(view.lng));
    onClose();
  }

  // بعد كل الخطّافات — قاعدة الخطّافات تمنع الخروج المبكر قبلها
  if (!open) return null;

  const atMinZoom = view.zoom <= MIN_ZOOM;
  const atMaxZoom = view.zoom >= MAX_ZOOM;

  /**
   * 🔴 **بوّابة إلى `document.body` — إصلاح عطلٍ مقيس لا احتياط نظري.**
   *
   * `position: fixed` **لا يُقاس من إطار العرض** إن حمل أيُّ سلف
   * `transform` أو `filter` أو `backdrop-filter` أو `perspective`: أوّلُ سلفٍ
   * كهذا يصير «الكتلة الحاوية» فيحبس الطبقة داخله.
   *
   * وهذا وقع فعلاً: بطاقة ويدجت الحجز تحمل `backdrop-blur`، فقيس على الصفحة
   * الحيّة أن الحاجب صار **846×390 عند (52، 377)** بدل **950×910 عند (0، 0)** —
   * أي أن النافذة (٥٨٠ بكسل ارتفاعاً) تفيض من حابسها (٣٩٠) فيُقصّ رأسها
   * وذيلها، ويبقى نصفُ الصفحة خلف الحاجب قابلاً للنقر.
   *
   * والبوّابة تُخرج الشجرة إلى `body` فلا يبقى بينها وبين الجذر سلفٌ يحبسها،
   * **مهما تغيّر تصميم البطاقة لاحقاً** — وهو ما يجعله إصلاحاً لا التفافاً:
   * البديل (نزع `backdrop-blur` من البطاقة) يعالج هذا المُركِّب وحده ويعود
   * العطل مع أول بطاقةٍ أخرى تُركّب الحقل.
   *
   * ⚠ و`document.body` تُقرأ في التصيير — وهو آمنٌ هنا وحده لأن هذا السطر
   * لا يُبلَغ إلا بعد `if (!open) return null`، و`open` لا تكون `true` إلا
   * بفعل مستخدمٍ على العميل. فلا تصيير خادمي يمرّ من هنا.
   */
  return createPortal(
    <div
      className="fixed inset-0 z-100 flex items-center justify-center bg-black/60 p-3 backdrop-blur-sm sm:p-6"
      // النقر على الحاجب نفسه يُغلق — لا على ما بداخله
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        aria-describedby={hintId}
        tabIndex={-1}
        onKeyDown={handlePanelKeyDown}
        className="flex max-h-[92vh] w-full max-w-2xl flex-col overflow-hidden rounded-2xl border border-border bg-popover text-popover-foreground shadow-2xl outline-none"
      >
        <div className="flex items-start justify-between gap-3 px-4 py-3">
          <div className="min-w-0">
            <h2 className="truncate text-base font-semibold leading-6">{title}</h2>
            <p id={hintId} className="mt-0.5 text-xs leading-5 text-muted-foreground">
              {labels.hint}
            </p>
          </div>
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            aria-label={labels.cancel}
            onClick={onClose}
            className="shrink-0 rounded-xl"
          >
            <X className="size-4" aria-hidden="true" />
          </Button>
        </div>

        {/* ------------------------- الخريطة ------------------------- */}
        <div className="relative h-[clamp(16rem,52vh,28rem)] w-full border-y border-border bg-muted">
          <div
            ref={surfaceRef}
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerEnd}
            onPointerCancel={handlePointerEnd}
            // touch-none يمنع المتصفح من ابتلاع السحب بوصفه تمريراً للصفحة
            className="absolute inset-0 touch-none cursor-grab overflow-hidden active:cursor-grabbing"
          >
            {/*
              طبقة البلاطات بـ`dir="ltr"` صراحةً: مواضعها حسابٌ جغرافي يزيد
              شرقاً، فلا يجوز أن ينعكس مع اتجاه الصفحة. وما عداها في هذا المكوّن
              يستعمل الخصائص المنطقية ويتبع اتجاه الواجهة.
            */}
            <div dir="ltr" aria-hidden="true" className="absolute inset-0">
              {tiles.map((tile) => (
                /* eslint-disable-next-line @next/next/no-img-element -- بلاطة خارجية تتغيّر مع كل حركة سحب: تمريرها على محسّن next/image يعيد ترميز آلاف الصور بلا فائدة، والبلاطة أصلاً ٢٥٦×٢٥٦ مضغوطة */
                <img
                  key={tile.key}
                  src={tile.url}
                  alt=""
                  draggable={false}
                  loading="eager"
                  decoding="async"
                  width={TILE_SIZE}
                  height={TILE_SIZE}
                  style={{
                    width: TILE_SIZE,
                    height: TILE_SIZE,
                    transform: `translate3d(${tile.x}px, ${tile.y}px, 0)`,
                  }}
                  className="absolute top-0 start-0 max-w-none select-none"
                />
              ))}
            </div>
          </div>

          {/*
            الدبوس ثابتٌ في مركز الإطار والخريطة تتحرك تحته — أدقّ بكثير من جرّ
            علامة بالإصبع، ويضمن أن المُعاد هو مركز الإطار بالضبط.
            والتمركز بالـflex وحده: لا خاصية أفقية، فلا فرق بين RTL وLTR.
          */}
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
            <svg
              viewBox="0 0 48 48"
              className="size-12 text-primary"
              aria-hidden="true"
              focusable="false"
            >
              {/* هالة فاتحة تحت العلامة: تبقيها مقروءة فوق أي لون بلاطة */}
              <g
                fill="none"
                stroke="var(--color-background)"
                strokeWidth="5"
                strokeLinecap="round"
                opacity="0.9"
              >
                <circle cx="24" cy="24" r="12" />
                <path d="M24 5v6M24 37v6M5 24h6M37 24h6" />
              </g>
              <g fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                <circle cx="24" cy="24" r="12" />
                <path d="M24 5v6M24 37v6M5 24h6M37 24h6" />
              </g>
              <circle cx="24" cy="24" r="3" fill="currentColor" />
            </svg>
          </div>

          {/* أزرار التكبير — خارج سطح السحب فلا يبتلع ضغطاتها الإمساك بالمؤشر */}
          <div className="absolute top-3 end-3 flex flex-col gap-1">
            <Button
              type="button"
              variant="outline"
              size="icon-sm"
              aria-label={labels.zoomIn}
              disabled={atMaxZoom}
              onClick={() => zoomBy(1)}
              className="rounded-xl shadow-md"
            >
              <Plus className="size-4" aria-hidden="true" />
            </Button>
            <Button
              type="button"
              variant="outline"
              size="icon-sm"
              aria-label={labels.zoomOut}
              disabled={atMinZoom}
              onClick={() => zoomBy(-1)}
              className="rounded-xl shadow-md"
            >
              <Minus className="size-4" aria-hidden="true" />
            </Button>
          </div>

          {/* إسنادٌ إلزامي بسياسة بلاطات OSM — ظاهرٌ دائماً فوق الخريطة */}
          <div className="absolute bottom-0 end-0 rounded-ss-lg bg-background/85 px-2 py-1 text-[11px] leading-4 text-muted-foreground">
            <a
              href="https://www.openstreetmap.org/copyright"
              target="_blank"
              rel="noopener noreferrer"
              className="hover:text-foreground hover:underline"
            >
              {labels.attribution}
            </a>
          </div>
        </div>

        {/* ------------------------- التذييل ------------------------- */}
        <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
          {/* الإحداثيّان المعادان — قيمة تقنية تُقرأ يساراً دائماً */}
          <span
            dir="ltr"
            className="font-mono text-xs tabular-nums text-muted-foreground"
          >
            {view.lat.toFixed(5)}, {view.lng.toFixed(5)}
          </span>

          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant="outline"
              size="lg"
              onClick={onClose}
              className="rounded-xl px-4"
            >
              {labels.cancel}
            </Button>
            <Button
              type="button"
              size="lg"
              onClick={handleConfirm}
              className="rounded-xl px-4"
            >
              {labels.confirm}
            </Button>
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
}
