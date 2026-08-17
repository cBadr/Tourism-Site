import { DEFAULT_LOCALE } from "@/lib/i18n-types";
import { siteTimeZone } from "@/lib/site-timezone";

/**
 * وحدة التنسيق الموحّدة للواجهة العامة: أرقام ومبالغ ومسافات وتواريخ وصيغ جمع —
 * **بحسب اللغة** (المرحلة ٨).
 *
 * لا حساب مالي هنا إطلاقاً — كل الأرقام تصل جاهزة من `/api/quote` ومن دوال
 * Postgres. ما يجري هنا تنسيق عرض فقط.
 *
 * ثلاثة قرارات تحكم هذا الملف:
 *
 * (١) **التحويل يدوي لا عبر Intl.NumberFormat** — نتيجته يجب أن تكون متطابقة
 *     حرفياً بين الخادم والمتصفح (تفادي اختلاف ICU بين بيئات التشغيل)، وإلا
 *     ظهر تحذير hydration على كل سعر في الصفحة.
 *
 * (٢) **الجنيه يبقى عملة المعاملة في كل اللغات** (قاعدة المرحلة ٨ رقم ٥):
 *     العربية تعرضه «ج.م» والإنجليزية «EGP» — الرمز يُترجم، لا العملة.
 *
 * (٣) **العربية تحتفظ بالأرقام العربية الهندية** (٠١٢٣) والإنجليزية باللاتينية،
 *     ومعها فواصل الآلاف والعلامة العشرية الخاصة بكل نظام.
 *
 * كل دالة هنا تقبل `locale` **اختيارياً** بقيمة افتراضية «ar»، فكل مستدعٍ قديم
 * (لوحة التحكم وبوابة المتعهدين — عربيتان بالتعريف) يبقى يعمل بلا تعديل.
 */

const ARABIC_DIGITS = ["٠", "١", "٢", "٣", "٤", "٥", "٦", "٧", "٨", "٩"] as const;

/** فاصل الآلاف العربي U+066C */
const ARABIC_GROUP_SEPARATOR = "٬";
/** الفاصلة العشرية العربية U+066B */
const ARABIC_DECIMAL_SEPARATOR = "٫";

/** رموز العملات المعروضة — العقد يثبّت الجنيه، وأي رمز آخر يُعرض كما هو */
const CURRENCY_LABELS: Record<string, Record<string, string>> = {
  ar: { EGP: "ج.م" },
  en: { EGP: "EGP" },
};

/** اللغة الحالية عربية؟ (يقبل ar و ar-EG وما شابه) */
export function isArabicLocale(locale: string = DEFAULT_LOCALE): boolean {
  return (locale || DEFAULT_LOCALE).toLowerCase().startsWith("ar");
}

/** المفتاح المختصر للغة — ar / en / fr … */
function baseLocale(locale: string = DEFAULT_LOCALE): string {
  return (locale || DEFAULT_LOCALE).toLowerCase().split("-")[0] ?? DEFAULT_LOCALE;
}

/** يحوّل كل خانة لاتينية في النص إلى ما يقابلها عربياً هندياً */
export function toArabicDigits(value: string | number): string {
  return String(value).replace(/[0-9]/g, (d) => ARABIC_DIGITS[Number(d)]);
}

/** خانات بلغة العرض: العربية هندية، وما عداها لاتينية كما هي */
export function toLocaleDigits(value: string | number, locale: string = DEFAULT_LOCALE): string {
  return isArabicLocale(locale) ? toArabicDigits(value) : String(value);
}

/** يضيف فواصل الآلاف إلى سلسلة خانات لاتينية */
function groupInteger(digits: string, separator: string): string {
  let out = "";
  for (let i = 0; i < digits.length; i += 1) {
    if (i > 0 && (digits.length - i) % 3 === 0) out += separator;
    out += digits[i];
  }
  return out;
}

/** رقم صحيح مُجمَّع بخانات اللغة — ٤٬٦٥٠ بالعربية و4,650 بالإنجليزية */
export function formatAmount(value: number, locale: string = DEFAULT_LOCALE): string {
  const safe = Number.isFinite(value) ? Math.round(value) : 0;
  const sign = safe < 0 ? "−" : "";
  const digits = String(Math.abs(safe));
  return isArabicLocale(locale)
    ? sign + toArabicDigits(groupInteger(digits, ARABIC_GROUP_SEPARATOR))
    : sign + groupInteger(digits, ",");
}

/** مرادف صريح للأرقام غير المالية (عدد نتائج، عدد عروض…) */
export function formatNumber(value: number, locale: string = DEFAULT_LOCALE): string {
  return formatAmount(value, locale);
}

/** مبلغ بعملته — ٤٬٦٥٠ ج.م بالعربية و4,650 EGP بالإنجليزية */
export function formatMoney(
  value: number,
  currency: string,
  locale: string = DEFAULT_LOCALE
): string {
  const labels = CURRENCY_LABELS[baseLocale(locale)] ?? CURRENCY_LABELS.en;
  const symbol = labels?.[currency] ?? currency;
  return `${formatAmount(value, locale)} ${symbol}`;
}

/** رقم عشري بخانة واحدة بلغة العرض */
function formatOneDecimal(value: number, locale: string): string {
  const [intPart = "0", fracPart = "0"] = value.toFixed(1).split(".");
  return isArabicLocale(locale)
    ? `${toArabicDigits(intPart)}${ARABIC_DECIMAL_SEPARATOR}${toArabicDigits(fracPart)}`
    : `${intPart}.${fracPart}`;
}

/** مسافة بالكيلومترات — عشرية واحدة تحت ١٠ كم، وصحيحة فوقها */
export function formatDistance(km: number, locale: string = DEFAULT_LOCALE): string {
  const unit = isArabicLocale(locale) ? "كم" : "km";
  if (!Number.isFinite(km) || km <= 0) return `${formatAmount(0, locale)} ${unit}`;
  if (km >= 10) return `${formatAmount(km, locale)} ${unit}`;
  return `${formatOneDecimal(km, locale)} ${unit}`;
}

/** صيغة الجمع للركاب: راكب واحد / راكبان / ٣ ركاب — أو 1 passenger / 3 passengers */
export function passengersLabel(count: number, locale: string = DEFAULT_LOCALE): string {
  const n = Math.max(0, Math.round(count));
  if (!isArabicLocale(locale)) {
    return `${formatAmount(n, locale)} ${n === 1 ? "passenger" : "passengers"}`;
  }
  if (n === 1) return "راكب واحد";
  if (n === 2) return "راكبان";
  if (n <= 10) return `${toArabicDigits(n)} ركاب`;
  return `${toArabicDigits(n)} راكباً`;
}

/**
 * صيغة الجمع للحقائب: حقيبة واحدة / حقيبتان / ٦ حقائب / ٢٠ حقيبة.
 *
 * وليست ترفاً لغوياً: سقف عدّاد الحقائب يُقرأ من الأسطول (‏`fleet-luggage.ts`)
 * فيتغير رقمه بتغير سيارات المالك، ونصٌّ يُلصق «حقيبة» بأي عدد يُنتج «٦ حقيبة».
 * نفس قاعدة `passengersLabel` و`hoursText` حرفياً: ٣–١٠ جمعُ قلة، وما فوقها
 * تمييزٌ مفرد.
 */
export function bagsLabel(count: number, locale: string = DEFAULT_LOCALE): string {
  const n = Math.max(0, Math.round(count));
  if (!isArabicLocale(locale)) {
    return `${formatAmount(n, locale)} ${n === 1 ? "bag" : "bags"}`;
  }
  if (n === 1) return "حقيبة واحدة";
  if (n === 2) return "حقيبتان";
  if (n <= 10) return `${toArabicDigits(n)} حقائب`;
  return `${toArabicDigits(n)} حقيبة`;
}

/** صيغة الجمع للساعات: ساعة واحدة / ساعتان / ٣ ساعات — أو 1 hour / 3 hours */
export function hoursText(count: number, locale: string = DEFAULT_LOCALE): string {
  const n = Math.max(0, Math.round(count));
  if (!isArabicLocale(locale)) {
    return `${formatAmount(n, locale)} ${n === 1 ? "hour" : "hours"}`;
  }
  if (n === 1) return "ساعة واحدة";
  if (n === 2) return "ساعتان";
  if (n <= 10) return `${toArabicDigits(n)} ساعات`;
  return `${toArabicDigits(n)} ساعة`;
}

/** صيغة الجمع للدقائق */
function minutesText(count: number, locale: string = DEFAULT_LOCALE): string {
  const n = Math.max(0, Math.round(count));
  if (!isArabicLocale(locale)) {
    return `${formatAmount(n, locale)} ${n === 1 ? "minute" : "minutes"}`;
  }
  if (n === 1) return "دقيقة واحدة";
  if (n === 2) return "دقيقتان";
  if (n <= 10) return `${toArabicDigits(n)} دقائق`;
  return `${toArabicDigits(n)} دقيقة`;
}

/** خيار ساعات الانتظار في القائمة — الصفر له نص خاص */
export function waitingLabel(count: number, locale: string = DEFAULT_LOCALE): string {
  if (count > 0) return hoursText(count, locale);
  return isArabicLocale(locale) ? "بدون انتظار" : "No waiting";
}

/** مدة الرحلة المقدَّرة — ساعتان و٢٠ دقيقة / 2 hours and 20 minutes */
export function durationLabel(minutes: number, locale: string = DEFAULT_LOCALE): string {
  const total = Math.max(0, Math.round(minutes));
  const hours = Math.floor(total / 60);
  const rest = total % 60;
  if (hours === 0) return minutesText(rest, locale);
  if (rest === 0) return hoursText(hours, locale);
  return isArabicLocale(locale)
    ? `${hoursText(hours, locale)} و${minutesText(rest, locale)}`
    : `${hoursText(hours, locale)} and ${minutesText(rest, locale)}`;
}

/* ------------------------------------------------------------------ */
/* التواريخ — بمنطقة الموقع دائماً (لا منطقة الجهاز)                     */
/* ------------------------------------------------------------------ */

/**
 * لماذا منطقةٌ مصرَّحٌ بها لا منطقة الجهاز؟ صفحات المتابعة تُعرض من الخادم
 * (‏UTC على المنصات السحابية) بينما العميل في بلد التشغيل — فبلا تثبيتها يظهر
 * موعد الانطلاق بساعة مختلفة. نستخرج المكوّنات عبر Intl بمنطقة الموقع (تراعي
 * التوقيت الصيفي) ثم نركّب النص يدوياً فتتطابق الصيغة في كل بيئة.
 *
 * والمنطقة **إعداد مالك** منذ هجرة 0075 (`siteTimeZone()`)، تُقرأ عند كل نداء
 * لا عند تحميل الوحدة — وإلا تجمّدت عند أول استيراد فصار الإعداد كذبة.
 */

const MONTHS: Record<string, readonly string[]> = {
  ar: [
    "يناير",
    "فبراير",
    "مارس",
    "أبريل",
    "مايو",
    "يونيو",
    "يوليو",
    "أغسطس",
    "سبتمبر",
    "أكتوبر",
    "نوفمبر",
    "ديسمبر",
  ],
  en: [
    "January",
    "February",
    "March",
    "April",
    "May",
    "June",
    "July",
    "August",
    "September",
    "October",
    "November",
    "December",
  ],
};

const WEEKDAY_KEYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"] as const;

const WEEKDAYS: Record<string, Record<string, string>> = {
  ar: {
    Sun: "الأحد",
    Mon: "الاثنين",
    Tue: "الثلاثاء",
    Wed: "الأربعاء",
    Thu: "الخميس",
    Fri: "الجمعة",
    Sat: "السبت",
  },
  en: {
    Sun: "Sunday",
    Mon: "Monday",
    Tue: "Tuesday",
    Wed: "Wednesday",
    Thu: "Thursday",
    Fri: "Friday",
    Sat: "Saturday",
  },
};

type ZonedParts = {
  weekday: string;
  day: number;
  month: number;
  year: number;
  hour: number;
  minute: number;
};

/** مكوّنات التاريخ في منطقة الموقع — ترجع null لأي تاريخ غير صالح */
function zonedParts(value: string): ZonedParts | null {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;

  try {
    const parts = new Intl.DateTimeFormat("en-US", {
      timeZone: siteTimeZone(),
      weekday: "short",
      year: "numeric",
      month: "numeric",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    }).formatToParts(date);

    const read = (type: string) => parts.find((part) => part.type === type)?.value ?? "";
    return {
      weekday: read("weekday"),
      day: Number(read("day")),
      month: Number(read("month")),
      year: Number(read("year")),
      hour: Number(read("hour")),
      minute: Number(read("minute")),
    };
  } catch {
    // بيئة بلا بيانات مناطق زمنية كاملة — نرجع لـ UTC بدل الانهيار
    return {
      weekday: WEEKDAY_KEYS[date.getUTCDay()] ?? "",
      day: date.getUTCDate(),
      month: date.getUTCMonth() + 1,
      year: date.getUTCFullYear(),
      hour: date.getUTCHours(),
      minute: date.getUTCMinutes(),
    };
  }
}

/** ساعة بصيغة ١٢ مع ص/م — مثال: ٣:٣٠ م أو 3:30 PM */
function clockLabel(hour: number, minute: number, locale: string): string {
  const arabic = isArabicLocale(locale);
  const suffix = hour < 12 ? (arabic ? "ص" : "AM") : arabic ? "م" : "PM";
  const twelve = hour % 12 === 0 ? 12 : hour % 12;
  const minutes = String(minute).padStart(2, "0");
  return `${toLocaleDigits(twelve, locale)}:${toLocaleDigits(minutes, locale)} ${suffix}`;
}

/** تاريخ كامل بلغة العرض — الأحد ١٤ سبتمبر ٢٠٢٦ / Sunday 14 September 2026 */
export function formatDateLabel(
  value: string | null | undefined,
  locale: string = DEFAULT_LOCALE
): string | null {
  if (!value) return null;
  const parts = zonedParts(value);
  if (!parts) return null;
  const key = baseLocale(locale);
  const months = MONTHS[key] ?? MONTHS.en ?? [];
  const weekdays = WEEKDAYS[key] ?? WEEKDAYS.en ?? {};
  const month = months[parts.month - 1] ?? "";
  const weekday = weekdays[parts.weekday] ?? "";
  return `${weekday} ${toLocaleDigits(parts.day, locale)} ${month} ${toLocaleDigits(parts.year, locale)}`.trim();
}

/** تاريخ ووقت — الأحد ١٤ سبتمبر ٢٠٢٦ — ٣:٣٠ م */
export function formatDateTimeLabel(
  value: string | null | undefined,
  locale: string = DEFAULT_LOCALE
): string | null {
  if (!value) return null;
  const parts = zonedParts(value);
  if (!parts) return null;
  const date = formatDateLabel(value, locale);
  if (!date) return null;
  return `${date} — ${clockLabel(parts.hour, parts.minute, locale)}`;
}

/* ------------------------------------------------------------------ */
/* مُنسّق مربوط بلغة واحدة                                               */
/* ------------------------------------------------------------------ */

export type LocaleFormatter = {
  locale: string;
  isRtl: boolean;
  digits: (value: string | number) => string;
  number: (value: number) => string;
  amount: (value: number) => string;
  money: (value: number, currency: string) => string;
  distance: (km: number) => string;
  passengers: (count: number) => string;
  bags: (count: number) => string;
  hours: (count: number) => string;
  waiting: (count: number) => string;
  duration: (minutes: number) => string;
  date: (value: string | null | undefined) => string | null;
  dateTime: (value: string | null | undefined) => string | null;
};

/**
 * مُنسّق جاهز للغة واحدة — يُبنى مرة في الصفحة الخادمية أو أعلى جزيرة العميل
 * فلا تتكرر تمريرة اللغة في كل استدعاء.
 */
export function createFormatter(locale: string = DEFAULT_LOCALE): LocaleFormatter {
  const resolved = locale || DEFAULT_LOCALE;
  return {
    locale: resolved,
    isRtl: isArabicLocale(resolved),
    digits: (value) => toLocaleDigits(value, resolved),
    number: (value) => formatNumber(value, resolved),
    amount: (value) => formatAmount(value, resolved),
    money: (value, currency) => formatMoney(value, currency, resolved),
    distance: (km) => formatDistance(km, resolved),
    passengers: (count) => passengersLabel(count, resolved),
    bags: (count) => bagsLabel(count, resolved),
    hours: (count) => hoursText(count, resolved),
    waiting: (count) => waitingLabel(count, resolved),
    duration: (minutes) => durationLabel(minutes, resolved),
    date: (value) => formatDateLabel(value, resolved),
    dateTime: (value) => formatDateTimeLabel(value, resolved),
  };
}
