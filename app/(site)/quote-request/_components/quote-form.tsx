"use client";

import * as React from "react";
import Link from "next/link";
import { useTimeZone } from "next-intl";
import {
  CalendarClock,
  CircleCheck,
  Clock,
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
import { DEFAULT_SITE_TIME_ZONE, timeZoneLabel } from "@/lib/site-timezone";
import { useT } from "@/components/site/i18n";
import { trackBrowserFunnel } from "@/lib/analytics/browser";
import { createFormatter } from "@/components/booking/format";
import { PlaceField } from "@/components/booking/place-field";
import {
  minInputValues,
  splitLocalDateTime,
  todayInputValue,
  toIsoFromCairoInputs,
} from "@/components/booking/checkout/datetime";
import { previewLeadTime } from "@/components/booking/checkout/lead-time-action";
import type { LeadTime } from "@/components/booking/checkout/lead-time";
import {
  hasRequestSource,
  splitReferrer,
  type RequestSource,
} from "@/lib/request-source-types";
import type { QuoteTripPrefill } from "../_lib/prefill";
import { EMPTY_CAMPAIGN_TAGS, type CampaignTags } from "../_lib/source";

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
 * ══════════════════════════════════════════════════════════════════════════
 *  🔴 موعد الانطلاق **حقلٌ واحد** (`datetime-local`) — شكوى المالك بعينها
 * ══════════════════════════════════════════════════════════════════════════
 *
 * كان حقلَين («تاريخ الرحلة» و«وقت الرحلة») في شبكةٍ من عمودين. ونزل الدمج في
 * الحاسبة (`search-widget.tsx`) ثم في مسار الحجز (`checkout/checkout.tsx`)
 * فبقيت هذه الصفحة وحدها على الشكل القديم — **مفهومٌ واحد بشكلين**، وهو التفاوت
 * الذي سأل عنه المالك. والدالة المشتركة `splitLocalDateTime` كانت قد نُقلت إلى
 * `checkout/datetime.ts` ووُصفت «مصدراً واحداً للنموذجين»: صحيحٌ **للدالة**،
 * وهذا الملف يستوردها — لكن **الواجهة** كانت ما زالت مفترقة.
 *
 * 🔒 **وهو دمجٌ بصريّ لا تبديلُ منطق** — والأربعة التي فرضها الدمج في `checkout`
 *    تنزل هنا بحرفها، من نفس الملفات لا من نظائر:
 *   • **منطقة الموقع**: القيمة تُشطر بـ`splitLocalDateTime` ثم تمضي إلى
 *     `toIsoFromCairoInputs` **نفسها** — ولا `new Date(value)` بحال، فتلك
 *     تفسّره بمنطقة **جهاز الزائر**.
 *   • **أرضية المهلة**: `min` من `booking_min_pickup_at()` عبر `previewLeadTime`
 *     — لا معادلةَ مهلةٍ تُحسب هنا. وحقلٌ واحد يقارن **لحظةً بلحظة**، بينما
 *     الحقلان المنفصلان كانا لا يستطيعان تقييد الساعة إلا في يوم الأرضية.
 *   • **الأرقام العربية**: سطرُ صدىً أسفل الحقل من `fmt.dateTime` — منتقي
 *     المتصفح يرسم بلغة **الجهاز**، فالصدى هو ما يُقرأ فعلاً.
 *   • **وسم التوقيت**: من `timeZoneLabel(useTimeZone())` لا «القاهرة» محفورة
 *     (‏D-59 — المنطقة إعداد مالك).
 *
 * 🔴 **وخاصية `min` تلميحٌ لا حارس.** الحاجز في `create_quote_request` (هجرة
 *    0098) — الدالة ممنوحة لـ`anon` فلا يكفي حارسٌ في `/api/quote-request`، وذاك
 *    المسار يرفض مبكراً برسالةٍ تسمّي أقرب موعد متاح.
 *
 * ── والموعد يمرّ بمسار التحويل الواحد ─────────────────────────────────────
 * `toIsoFromCairoInputs` هي الدالة نفسها التي يحوّل بها الحجز موعده — فما يكتبه
 * العميل **وقتُ الموقع** لا وقتُ جهازه. ومسارا تحويلٍ لقيمةٍ واحدة هو صنف العيب
 * الذي يتكرر في هذا المستودع، فلا يُفتح ثانٍ.
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
  campaign = EMPTY_CAMPAIGN_TAGS,
  services,
  placeSearch,
  locale = DEFAULT_LOCALE,
}: {
  defaultService?: string;
  /** ما حملته بطاقة الإنقاذ في الرابط — **منقّى** في `_lib/prefill.ts` */
  tripPrefill?: QuoteTripPrefill;
  /** وسوم الحملة من الرابط — **منقّاة** في `_lib/source.ts`، وتصل من الخادم */
  campaign?: CampaignTags;
  /** الخدمات بلغة الزائر — تصل من الصفحة الخادمية */
  services: ServiceDef[];
  /** إعدادات بحث الأماكن من اللوحة — ضابط تكلفة يملكه المالك (هجرة 0076) */
  placeSearch: PlaceSearchSettings;
  /** لغة الزائر — تصل من الصفحة الخادمية، وغيابها يعني العربية */
  locale?: string;
}) {
  const t = useT("pages.quoteRequest.form");
  const fmt = React.useMemo(() => createFormatter(locale), [locale]);
  /**
   * منطقة الموقع من next-intl — **نفس القيمة** التي قرأها `i18n/request.ts` من
   * `public.site_time_zone()`، لا مسارٌ ثانٍ. والدوال الصرفة في `datetime.ts`
   * تقرأ الوحدة المشتركة التي يملؤها `SiteTimeZoneSync` من الجذر نفسه.
   * (نظير `checkout.tsx` حرفاً بحرف — D-59: المنطقة إعداد مالك لا «القاهرة».)
   */
  const activeTimeZone = useTimeZone() ?? DEFAULT_SITE_TIME_ZONE;
  const uid = React.useId();

  const [serviceSlug, setServiceSlug] = React.useState(defaultService ?? "");

  // المكان: نصٌّ يكتبه العميل + نقطةٌ محلولة. والثاني وحده يُرسَل.
  const [originText, setOriginText] = React.useState(tripPrefill?.from ?? "");
  const [origin, setOrigin] = React.useState<GeoPlace | null>(null);
  const [destText, setDestText] = React.useState(tripPrefill?.to ?? "");
  const [destination, setDestination] = React.useState<GeoPlace | null>(null);

  /**
   * الموعد: **حقلٌ واحد** يقرؤه العميل (`datetime-local`)، وتحويلٌ واحد إلى لحظةٍ
   * مطلقة عند الإرسال. والاتجاه المعاكس (لحظة ⇐ قيمة الحقل) بـ`minInputValues` —
   * تقرأ بمنطقة الموقع لا بمنطقة الجهاز، وهي جارة `toIsoFromCairoInputs`
   * و`splitLocalDateTime` في نفس الملف بقصد: مسار تحويلٍ واحد للاتجاهين.
   *
   * والحساب في **مُهيّئٍ كسول** لا في `useMemo`: القيمة تُقرأ مرةً واحدة عند
   * التركيب، وبعدها الحقل ملك العميل. و`useMemo` هنا كان يَعِد بتحديثٍ لا يقع.
   *
   * 🔒 وحمولة بطاقة الإنقاذ تنجو بحرفها: نفس `minInputValues` التي كانت تملأ
   * الحقلين تملأ الحقل الواحد — تُضمّ نتيجتاها بـ`T` وهي بعينها الصيغة التي
   * يشطرها `splitLocalDateTime` عند الإرسال، فلا تحويلَ ثالثاً بينهما.
   */
  const [pickupLocal, setPickupLocal] = React.useState(() => {
    if (!tripPrefill?.pickupAt) return "";
    const parts = minInputValues(tripPrefill.pickupAt);
    return parts ? `${parts.date}T${parts.time}` : "";
  });

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
  const [lead, setLead] = React.useState<LeadTime | null>(null);

  /**
   * 🔴 **مصدر الطلب** (0127) — يُقرأ **عند الإرسال** لا عند التركيب.
   *
   * ولماذا لا `useEffect` ولا حالة: `document.referrer` **ثابتٌ طوال عمر
   * المستند**، فقراءتُه لحظةَ الإرسال تُعطي عين ما كانت ستُعطيه لحظةَ التركيب —
   * بلا تصييرٍ إضافي، وبلا `setState` داخل أثرٍ (وهي قاعدة eslint في هذا
   * المستودع: `react-hooks/set-state-in-effect`). والدالة تُنادى مرةً واحدة في
   * المتصفح بعد ضغطة العميل، فلا وجود لمسألة الترطيب أصلاً.
   *
   * وضفّتاه تُقسمان **بالأصل لا بالنصّ** (`splitReferrer`): مُحيلٌ من موقعنا
   * يُسجَّل **مساراً** تُطابقه القاعدة بقائمة صفحاتها، ومن أي أصلٍ آخر يُسجَّل
   * **مضيفاً وحده** — لا عنواناً كاملاً، لأن سلسلة استعلامه قد تحمل بريد زائرٍ
   * أو معرّف جلسته وليس لنا أن نخزّنها.
   *
   * ⚠ **وحدٌّ مُعلَن**: `document.referrer` مرجعُ المستند المُحمَّل لا آخرُ مسارٍ
   *   في تنقّلٍ ليّن. وكل روابط `/quote-request` اليوم `<a href>` (شبكة الخدمات
   *   وبطاقة الإنقاذ وحقلا البحث) فتصل صحيحة؛ ورابطٌ يُضاف غداً بـ`<Link>`
   *   يُسجَّل بمرجع الصفحة التي حُمِّلت أصلاً. **والغياب يعني «لا أعرف» لا
   *   «مباشر»** — ولذلك يُخزَّن `null` ولا يُخترع له اسم.
   */
  function readSource(): RequestSource {
    const split = splitReferrer(document.referrer, window.location.origin);
    return {
      page: split.page,
      referrer: split.referrer,
      utmSource: campaign.utmSource,
      utmMedium: campaign.utmMedium,
      utmCampaign: campaign.utmCampaign,
    };
  }

  const fieldHeight = "h-12";
  const fieldClass =
    "h-12 w-full rounded-2xl border border-input bg-background px-3 text-base outline-none transition-colors focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50";

  /** أرضية اليوم بتوقيت الموقع — لا بتوقيت جهاز الزائر. سقوطُ `pickupMin` أدناه. */
  const todayValue = React.useMemo(() => todayInputValue(), []);

  /**
   * أرضية المنتقي من `booking_min_pickup_at()` وحدها، وبلا معادلة هنا.
   *
   * تُقرأ عند تركيب النموذج، وهي أبكر لحظةٍ ينفع فيها الجواب. **ولا تُعاد
   * القراءة بمؤقّت**: «الآن» يزحف فمن يترك الصفحة مفتوحة نصف ساعة قد تسمح له
   * أرضيته القديمة بموعدٍ صار محظوراً — و**من يمنعه حينها القاعدة** بحارس 0098
   * برسالةٍ صريحة، لا شاشةٌ تتحرك تحت يده. (وفي `checkout` تُعاد القراءة لأن
   * العميل يعود إلى الخطوة الأولى، ولا خطوات هنا.)
   *
   * 🔒 والفشل يعيد `enabled: false` فتبقى الأرضية اليوم وحده — والحارس في
   * القاعدة هو الذي يمنع، لا هذه القراءة.
   */
  React.useEffect(() => {
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
  }, []);

  const leadFloor = lead?.enabled ? minInputValues(lead.minPickupAt) : null;
  /**
   * أرضية الحقل الواحد — **لحظةٌ واحدة** بدل «تاريخٌ ثم ساعةٌ مشروطة بيومه».
   *
   * وهي المكسب الصامت للدمج: الحقلان المنفصلان كانا لا يستطيعان تقييد الساعة
   * إلا في يوم الأرضية (‏`<input type="time">` لا يعرف أي يومٍ اختير)، فمن اختار
   * الغد كان منتقي الساعة عنده بلا حدٍّ أصلاً — وهنا تُقارن اللحظة باللحظة.
   */
  const pickupMin = leadFloor ? `${leadFloor.date}T${leadFloor.time}` : `${todayValue}T00:00`;

  /**
   * الشطر ثم `toIsoFromCairoInputs` — **نفس المسار ونفس المُدخلين** اللذين كان
   * يتلقّاهما من الحقلين المنفصلين، فالناتج ISO لا يتغيّر بحرف.
   *
   * ⚠ **و`useMemo` هنا شرطُ لِنت لا تحسينُ أداء**، وهو مقيسٌ لا مُخمَّن: نداءٌ
   *   صريحٌ لـ`toIsoFromCairoInputs` في نطاق التصيير يجعل مُحلِّل
   *   `react-hooks/purity` يَعُدّ المكوِّن كلَّه مُنفَّذاً في التصيير، فيرفض قراءة
   *   الساعة (`Date.now()`) **داخل معالج الإرسال** — وهي قراءةٌ صحيحة لا تقع في
   *   تصييرٍ أبداً. جرّبتُ البديلين: إخراج التحقق إلى دالةٍ مستقلة **لا يُسكته**،
   *   و`useMemo` يُسكته. والقيمة لا تتقادم: `SiteTimeZoneSync` يضبط المنطقة
   *   **أثناء التصيير** كأول ابنٍ في المزوّد (لا في `useEffect`)، فهي مستقرّةٌ
   *   قبل أن يُصيَّر هذا الحقل — والتابعان الوحيدان هما ما يكتبه العميل.
   */
  const [pickupDate, pickupTime] = splitLocalDateTime(pickupLocal);
  const pickupIso = React.useMemo(
    () => toIsoFromCairoInputs(pickupDate, pickupTime),
    [pickupDate, pickupTime]
  );

  function isPhoneValid(value: string): boolean {
    const trimmed = value.trim();
    if (!PHONE_PATTERN.test(trimmed)) return false;
    const digits = trimmed.replace(/\D/g, "");
    return digits.length >= 8 && digits.length <= 15;
  }

  /**
   * الخطأ يزول بأول لمسةٍ للحقل، لا عند الإرسال — نظير `clearFieldError` في
   * `checkout.tsx` (ملاحظة المالك ٣). ويُرجَع **نفسُ الكائن** حين لا شيء يُمحى:
   * الدالة تُنادى مع كل تغيير، وكائنٌ جديد في كل مرة يُعيد تصيير الشجرة بلا
   * تغيّرٍ ظاهر.
   *
   * ⚠ ومحصورةٌ الآن على حقل الموعد — وهو الحقل الذي مسّته هذه الدفعة. وبقية
   *   الحقول تُنظَّف عند الإرسال كما كانت؛ توسيعُها تغييرٌ في سلوكٍ لم يُطلَب.
   */
  function clearFieldError(...keys: (keyof FieldErrors)[]) {
    setErrors((current) => {
      if (keys.every((key) => current[key] === undefined)) return current;
      const next = { ...current };
      for (const key of keys) delete next[key];
      return next;
    });
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

    /**
     * 🔒 **نفس اللحظة التي يعرضها الصدى تحت الحقل** — لا نداءُ تحويلٍ ثانٍ.
     *
     * والصدى هو ما رآه العميل وأقرّه بضغطة الإرسال، فالتحقق والإرسال يجب أن
     * يقعا على **عين ما رآه**. ولو أُعيد النداء هنا لصار للقيمة موضعا حسابٍ —
     * وهو صنف العيب الذي يتكرر في هذا المستودع (النمط ٨) حتى لو تطابق الناتج
     * اليوم.
     */
    const iso = pickupIso;
    if (!iso) {
      found.pickup = t("errors.pickupRequired", "حدّد تاريخ الرحلة ووقتها.");
    } else if (Date.parse(iso) <= Date.now()) {
      found.pickup = t("errors.pickupPast", "موعد الرحلة يجب أن يكون في المستقبل.");
      /**
       * 🔒 أدنى المهلة — **طبقةٌ ثانية لا الحارس.** الحدّ المقارَن به هو ما
       * أرجعته القاعدة (`booking_min_pickup_at()`) لا حاصلَ ضربٍ يُحسب هنا،
       * فلا يفترق ما تمنعه الشاشة عمّا ترفضه `create_quote_request` (‏0098).
       * وما هنا يوفّر رحلةَ شبكة، وخاصية `min` تُتجاوَز بالكتابة اليدوية.
       */
    } else if (lead?.enabled && lead.minPickupAt !== null) {
      const floor = Date.parse(lead.minPickupAt);
      if (Number.isFinite(floor) && Date.parse(iso) < floor) {
        found.pickup = t(
          "errors.pickupTooSoon",
          "نحتاج مهلة {minutes} دقيقة على الأقل قبل الانطلاق — أقرب موعد متاح {value}.",
          { minutes: fmt.digits(lead.leadMinutes), value: fmt.dateTime(lead.minPickupAt) ?? "" }
        );
      }
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

    const requestSource = readSource();

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
          // اللحظة التي اجتازت التحقق أعلاه بعينها — ISO بلاحقة `Z` دائماً،
          // والمسار الخادميّ يرفض ما وصل بلا منطقة زمنية صريحة
          pickupAt: iso,
          passengers: paxNumber,
          luggage:
            luggageNumber !== null && Number.isInteger(luggageNumber) && luggageNumber >= 0
              ? luggageNumber
              : null,
          // 0127 — المصدر: يُرسَل حين يكون فيه ما يُقال، ويغيب حين لا شيء
          // يُعرف. و`null` في القاعدة تعني «غير معروف» لا «مباشر».
          ...(hasRequestSource(requestSource) ? { source: requestSource } : {}),
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

        {/*
          🔴 موعد الانطلاق **حقلٌ واحد** — شكوى المالك، والدمج نفسه الذي نزل في
          الحاسبة ومسار الحجز فبقيت هذه الصفحة خارجه.

          و`<label>` لا `<span>`: نقرةٌ على الاسم تفتح المنتقي، وهو ما لا يعطيه
          نصٌّ مجاور. ولا `sm:grid-cols-2` بعده — العمودان كانا وعاءَ حقلَين،
          وحقلٌ واحد بعرضٍ كامل هو الشكل نفسه على ٣٧٥ وعلى ١٢٨٠، فالتفاوت بين
          الجوال والحاسوب زال من أصله لا بشرطٍ جديد.
        */}
        <div className="flex flex-col gap-1.5">
          <label
            htmlFor={`${uid}-pickup-at`}
            className="flex w-fit items-center gap-1.5 text-sm font-medium"
          >
            <CalendarClock className="size-4 text-muted-foreground" aria-hidden="true" />
            {t("pickup", "موعد الانطلاق")}
          </label>

          {/*
            🔴 وسم التوقيت — من يحجز من الخليج أو أوروبا لا يعرف من تلقاء نفسه
            أن المكتوب يُفسَّر بتوقيت الموقع، والمنتقي في المتصفح لا يقول منطقةً
            بحال. وثمن الالتباس سائقٌ يصل بساعة خطأ. واسم المنطقة من ICU بلغة
            الزائر (‏`timeZoneLabel`) لا «مصر» محفورةً — فمالكُ نسخةٍ يبدّل
            منطقته لا يبقى السطر يكذّب إعداده (D-59).
          */}
          <p className="flex items-start gap-2 rounded-2xl border border-border bg-muted/40 px-3 py-2 text-xs leading-6 text-muted-foreground">
            <Clock className="mt-1 size-3.5 shrink-0 text-primary" aria-hidden="true" />
            {t(
              "timeZoneNote",
              "المواعيد كلها على {zone} — اكتب موعد الانطلاق كما هو هناك لا بتوقيت بلدك.",
              { zone: timeZoneLabel(activeTimeZone, locale) }
            )}
          </p>

          <input
            id={`${uid}-pickup-at`}
            type="datetime-local"
            min={pickupMin}
            value={pickupLocal}
            onChange={(event) => {
              setPickupLocal(event.target.value);
              // الخطأ يزول بأول لمسة، لا عند الإرسال
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
            🔴 صدى بأرقام لغة الزائر — والحقل الأصلي **لا يضمنها**: منتقي المتصفح
            يرسم بلغة الجهاز لا بلغة الصفحة، فيرى العميل العربي «09/14/2026» في
            حقلٍ كل ما حوله بالعربية. والصدى من `fmt.dateTime` — نفس مُنسّق بقية
            الشاشة، وبمنطقة الموقع، فيرى اللحظة التي سنقرأها له لا التي كتبها
            جهازه.
          */}
          {pickupIso ? (
            <p className="text-xs leading-5 text-primary">{fmt.dateTime(pickupIso)}</p>
          ) : null}

          {/*
            🔒 «أقرب موعد متاح» يُقال **قبل** المحاولة لا بعدها: `min` يمنع
            الاختيار لكنه صامت — من يضغط على يومٍ رمادي لا يعرف لماذا رُفض،
            والمنتقي على الجوال قد لا يُظهر الحدّ أصلاً. ولا يظهر السطر حين تكون
            المهلة مطفأة: إعلانُ قيدٍ لا وجود له هو «شاشةٌ تَعِد بغير ما تفعله
            القاعدة» مقلوبةً.
          */}
          {leadFloor && lead?.enabled ? (
            <p
              id={`${uid}-lead-note`}
              className="flex items-start gap-2 text-xs leading-6 text-muted-foreground"
            >
              <Clock className="mt-1 size-3.5 shrink-0 text-primary" aria-hidden="true" />
              {t(
                "leadNote",
                "نحتاج مهلة {minutes} دقيقة على الأقل لتجهيز رحلتك — أقرب موعد متاح {value}.",
                {
                  minutes: fmt.digits(lead.leadMinutes),
                  value: fmt.dateTime(lead.minPickupAt) ?? "",
                }
              )}
            </p>
          ) : null}

          {errors.pickup ? (
            <p
              id={`${uid}-pickup-error`}
              className="flex items-start gap-1.5 text-xs leading-5 text-destructive"
            >
              <TriangleAlert className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
              {errors.pickup}
            </p>
          ) : null}
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
