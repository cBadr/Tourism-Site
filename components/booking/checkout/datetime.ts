import { DEFAULT_LOCALE } from "@/lib/i18n-types";
import { DEFAULT_SITE_TIME_ZONE, siteTimeZone } from "@/lib/site-timezone";
import { formatDateLabel, formatDateTimeLabel } from "../format";

/**
 * تواريخ الحجز: بناء ISO من حقلي التاريخ والوقت، وعرضه بمنطقة الموقع.
 *
 * منذ المرحلة ٨ صار **بناء نص التاريخ** في `components/booking/format.ts` مع بقية
 * التنسيق (أرقام، مبالغ، مسافات) حتى تخرج كل الأرقام المرئية من مُنسّق واحد
 * يعرف لغة الزائر. ما بقي هنا: تحويل حقول النموذج، ومرادفان عربيان يحفظان
 * توافق المستدعين القدامى (صفحة متابعة الحجز ولوحة التحكم — عربيتان بالتعريف).
 *
 * ══════════════════════════════════════════════════════════════════════════
 *  🔴 الوقت الذي يكتبه العميل **وقتُ الموقع**، لا وقتُ جهازه
 * ══════════════════════════════════════════════════════════════════════════
 *
 * كان هذا الملف يبني `new Date(\`${date}T${time}\`)` — وهذه الصيغة يفسّرها
 * المتصفح **بالمنطقة الزمنية للجهاز** — ثم يستدعي `toISOString()`. وكل عرضٍ
 * في المنتج (‏`format.ts` · `i18n/request.ts`) بمنطقة الموقع. فمن
 * يحجز من الخليج ويكتب ١٠:٠٠ كنّا نخزّن له لحظةً تُقرأ في القاهرة ٠٩:٠٠،
 * ويصل السائق إلى مطار القاهرة بساعة خطأ. وهو عطل تشغيلي لا تجميلي.
 *
 * والعلاج **مسار تحويل واحد**: هذه الدالة وحدها تحوّل مُدخل النموذج، وكل من
 * يبني موعداً من حقلَي `date`/`time` يمرّ بها. ومسارا تحويلٍ لقيمةٍ واحدة هو
 * صنف العيب الذي يتكرر في هذا المشروع، فلا يُفتح ثانٍ.
 *
 * ⚠ **ولا يجوز إزاحة ثابتة `+02:00`**: مصر أعادت التوقيت الصيفي في 2023، فهي
 * ‏`+03:00` من آخر جمعة في أبريل إلى آخر خميس في أكتوبر. الاشتقاق هنا من
 * `Intl` بمنطقة الموقع — أي من قاعدة بيانات المناطق الحيّة — لا من رقم مكتوب.
 *
 * ⚠ **وما هو مخزَّن لا يُمسّ**: هذا الملف يغيّر **كيف يُحوَّل مُدخل جديد** فقط.
 * قراءة الطوابع المخزّنة وعرضها لم تتغير بحرف — تبقى في `format.ts`.
 *
 * ── المنطقة صارت إعداد مالك (هجرة 0075) ─────────────────────────────────────
 *
 * كانت مثبّتة على القاهرة، وصارت تُقرأ من `siteTimeZone()` — والقراءة **عند
 * النداء لا عند تحميل الوحدة**، وإلا تجمّدت القيمة عند أول استيراد فصار
 * الإعداد كذبةً. والمسار الواحد بقي واحداً: هذه الدوال وحدها تحوّل المُدخل،
 * وكل ما تغيّر أن المنطقة تأتي من الإعداد بدل نصٍّ في السطر.
 */

/**
 * ⚠ **الافتراضي وحده — لا القيمة السارية.** يبقى لتوافق المستوردين، ومن يريد
 * المنطقة الفعلية ينادي `siteTimeZone()`: هذه القيمة لا تتغيّر بتغيّر الإعداد.
 *
 * @deprecated استعمل `siteTimeZone()` من `@/lib/site-timezone`
 */
export const BOOKING_TIME_ZONE = DEFAULT_SITE_TIME_ZONE;

/** تاريخ كامل بلغة العرض — الأحد ١٤ سبتمبر ٢٠٢٦ */
export function formatDate(
  value: string | null | undefined,
  locale: string = DEFAULT_LOCALE
): string | null {
  return formatDateLabel(value, locale);
}

/** تاريخ ووقت بلغة العرض — الأحد ١٤ سبتمبر ٢٠٢٦ — ٣:٣٠ م */
export function formatDateTime(
  value: string | null | undefined,
  locale: string = DEFAULT_LOCALE
): string | null {
  return formatDateTimeLabel(value, locale);
}

/** مرادف عربي صريح — يبقى لتوافق المستدعين القدامى */
export function formatArabicDate(value: string | null | undefined): string | null {
  return formatDateLabel(value, "ar");
}

/** مرادف عربي صريح — يبقى لتوافق المستدعين القدامى */
export function formatArabicDateTime(value: string | null | undefined): string | null {
  return formatDateTimeLabel(value, "ar");
}

/* ------------------------------------------------------------------ */
/* التحويل — من ساعة الموقع إلى اللحظة المطلقة                            */
/* ------------------------------------------------------------------ */

/**
 * مكوّنات لحظةٍ مطلقة كما تُقرأ **على ساعة الموقع**، معادةً كطابعٍ رقمي
 * «كأنها UTC». الفرق بينها وبين اللحظة الأصلية هو إزاحة المنطقة في تلك اللحظة
 * بالضبط (للقاهرة: ‏`+02:00` شتاءً و`+03:00` صيفاً) — فلا رقم إزاحةٍ في الكود.
 */
function siteWallClockAsUtc(instantMs: number): number | null {
  try {
    const parts = new Intl.DateTimeFormat("en-US", {
      timeZone: siteTimeZone(),
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hourCycle: "h23",
    }).formatToParts(new Date(instantMs));

    const read = (type: string) => Number(parts.find((part) => part.type === type)?.value);
    const year = read("year");
    const month = read("month");
    const day = read("day");
    const hour = read("hour");
    const minute = read("minute");
    const second = read("second");
    if ([year, month, day, hour, minute, second].some((n) => !Number.isFinite(n))) return null;

    return Date.UTC(year, month - 1, day, hour, minute, second);
  } catch {
    // بيئة بلا بيانات مناطق زمنية كاملة
    return null;
  }
}

/**
 * إزاحة منطقة الموقع (بالميلي ثانية) عند لحظةٍ بعينها.
 *
 * وحين تتعذّر قراءتها نُرجع صفراً عمداً — أي نعامل المُدخل كأنه UTC. وهو
 * **نفس ما تفعله `format.ts`** حين يسقط `Intl` عندها (تعرض بـ UTC)، فيبقى ما
 * كتبه العميل مطابقاً لما يُعرض له. أي أن الطرفين يسقطان معاً على نفس المرجع،
 * ولا ينشأ فرقُ ساعةٍ صامت بين الإدخال والعرض في تلك البيئة النادرة.
 */
function siteOffsetMs(instantMs: number): number {
  const wall = siteWallClockAsUtc(instantMs);
  return wall === null ? 0 : wall - instantMs;
}

/** yyyy-mm-dd كما يخرجها `<input type="date">` */
const DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;
/** HH:mm أو HH:mm:ss كما يخرجها `<input type="time">` */
const TIME_PATTERN = /^(\d{2}):(\d{2})(?::(\d{2}))?$/;

/**
 * يبني ISO من حقلي `<input type="date">` و`<input type="time">`، **مفسِّراً ما
 * كتبه العميل على ساعة الموقع** (`siteTimeZone()`) أياً كانت منطقة جهازه.
 *
 * ⚠ الاسم تاريخيّ: كانت المنطقة مثبّتة على القاهرة قبل هجرة 0075، وصارت إعداد
 * مالكٍ يُقرأ عند كل نداء. ولم يُغيَّر لأن `search-widget.tsx` يستورد مرادفه
 * (‏`toIsoFromLocalInputs`) وهو ملفٌّ يعمل عليه وكيلٌ آخر الآن — واسمٌ ثالث
 * لدالةٍ واحدة أسوأ من اسمٍ تاريخيٍّ موثَّق.
 *
 * يرجع null إن كان أحد الحقلين ناقصاً أو التاريخ غير صالح.
 *
 * الخوارزمية: نبني الطابع «الساذج» (‏`Date.UTC` للمكوّنات كما كُتبت)، ثم نطرح
 * إزاحة منطقة الموقع. والطرح يُعاد مرةً ثانية بالإزاحة المقيسة عند النتيجة نفسها،
 * لأن الإزاحة قد تختلف بين الطابع الساذج واللحظة الحقيقية في **ليلتَي تغيير
 * التوقيت وحدهما** — وبهذه التمريرة الثانية تستقر النتيجة.
 *
 * وحالتان في السنة كلها تخرجان عن «المكتوب = المعروض»، وكلتاهما بحكم التقويم
 * لا بخلل في الحساب (مقيستان على سنة ٢٠٢٦ كاملة: ٢٬١٩٠ موعداً، لا ثالثة لهما):
 *
 * • **الساعة المعدومة** — ليلة بدء التوقيت الصيفي تقفز ساعة القاهرة من ٠٠:٠٠
 *   إلى ٠١:٠٠، فالساعة الأولى من ذلك اليوم لا وجود لها. ومن كتبها تُدفع إلى
 *   أول لحظة قائمة بعدها (‏٠٠:٣٠ ⇐ ٠١:٣٠) — وهو السلوك الصحيح: لا يجوز أن
 *   يُرفض الحجز، ولا أن تُنتَج لحظةٌ في اليوم السابق.
 * • **الساعة المكرّرة** — ليلة نهاية التوقيت الصيفي تقع ٢٣:٠٠–٢٣:٥٩ مرتين،
 *   فنختار **الثانية** (بعد التحويل). فرق الاختيار ساعة واحدة في ليلةٍ واحدة،
 *   والمعروض للعميل يطابق ما كتبه في الحالتين.
 */
export function toIsoFromCairoInputs(date: string, time: string): string | null {
  if (!date || !time) return null;

  const dateMatch = DATE_PATTERN.exec(date);
  const timeMatch = TIME_PATTERN.exec(time);
  if (!dateMatch || !timeMatch) return null;

  const year = Number(dateMatch[1]);
  const month = Number(dateMatch[2]);
  const day = Number(dateMatch[3]);
  const hour = Number(timeMatch[1]);
  const minute = Number(timeMatch[2]);
  const second = Number(timeMatch[3] ?? "0");

  if (hour > 23 || minute > 59 || second > 59) return null;

  const naive = Date.UTC(year, month - 1, day, hour, minute, second);
  if (Number.isNaN(naive)) return null;
  // يرفض ما لا وجود له في التقويم (‏٣٠ فبراير) — `Date.UTC` تُدوِّره بصمت
  const naiveDate = new Date(naive);
  if (
    naiveDate.getUTCFullYear() !== year ||
    naiveDate.getUTCMonth() !== month - 1 ||
    naiveDate.getUTCDate() !== day
  ) {
    return null;
  }

  const first = naive - siteOffsetMs(naive);
  const settled = naive - siteOffsetMs(first);
  return new Date(settled).toISOString();
}

/**
 * ⚠ الاسم القديم — يبقى **مرادفاً للدالة نفسها** لا مساراً ثانياً.
 *
 * سببه أن `components/booking/search-widget.tsx` يستورده بهذا الاسم، وهو ملف
 * خارج نطاق هذه الموجة فلا يُلمَس. وهو يكسب التصحيح كاملاً لأن الجسم واحد.
 * ومتى نُقل ذلك المستدعي إلى الاسم الصريح، حُذف هذا السطر.
 *
 * @deprecated استعمل `toIsoFromCairoInputs` — «Local» هنا تعني القاهرة لا الجهاز.
 */
export const toIsoFromLocalInputs = toIsoFromCairoInputs;

/* ------------------------------------------------------------------ */
/* شطر قيمة `datetime-local` إلى الحقلين اللذين يعرفهما مسار التحويل    */
/* ------------------------------------------------------------------ */

/**
 * `<input type="datetime-local">` يُخرج "YYYY-MM-DDTHH:mm" (وقد يُلحق ثوانيَ).
 *
 * 🔒 **ولا يُبنى منه تاريخٌ هنا إطلاقاً.** الشطر وحده، ثم يمضي الجزآن إلى
 * `toIsoFromCairoInputs` أعلاه — الدالة الوحيدة المسموح لها بتفسير ما كتبه
 * العميل على ساعة الموقع. وأي `new Date(value)` كان سيفسّره **بمنطقة جهاز
 * الزائر**، وهو بعينه العطل الذي عولج في الدفعة م‑٢.
 *
 * ومقرُّها هنا لا في مكوّن: **حقلٌ واحد للتاريخ والساعة صار شكل النموذجين
 * معاً** — منتقي الحاسبة (ذهاب وعودة) ومنتقي مسار الحجز (الاتجاه الواحد) —
 * ونسختان من الشطر تنحرفان بأول تعديل. وهي مجاورةٌ لمسار التحويل الذي تغذّيه،
 * وللاتجاه المعاكس (`minInputValues`) الذي يبني أرضيتها.
 */
export function splitLocalDateTime(value: string): [string, string] {
  if (!value) return ["", ""];
  const [date = "", rest = ""] = value.split("T");
  // الثواني تُقصّ: مُحلِّل الوقت يقبل HH:mm، والحقل لا يعرض ثوانيَ أصلاً
  return [date, rest.slice(0, 5)];
}

/**
 * أرضية منتقي التاريخ والوقت من **لحظةٍ مطلقة**، مقروءةً على ساعة القاهرة.
 *
 * ── لماذا تعيش هنا ────────────────────────────────────────────────────────
 * هذا الملف هو **مسار التحويل الوحيد** بين حقلَي النموذج واللحظة المطلقة
 * (انظر الترويسة: «ومسارا تحويلٍ لقيمةٍ واحدة هو صنف العيب الذي يتكرر في هذا
 * المشروع، فلا يُفتح ثانٍ»). وأرضيةُ المنتقي هي **الاتجاه المعاكس** للتحويل
 * نفسه، فمكانها بجواره لا في مكوّن.
 *
 * ── 🔴 والتقريب **لأعلى** شرطُ صحة لا تجميل ───────────────────────────────
 * الحدّ الذي تُنتجه `booking_min_pickup_at()` لحظةٌ بالثواني (‏١١:٤٢:٠٣)،
 * ومنتقي الوقت لا يعرض إلا الدقائق. فتقريبٌ لأسفل (‏١١:٤٢) يعرض على العميل
 * موعداً **يرفضه الحارس** لأنه أسبق من الحدّ بثلاث ثوانٍ — أي شاشةٌ تقدّم
 * الرقم المستحيل بنفسها، وهو نمطٌ موثَّق في هذا المستودع (سقف عدّاد الركاب).
 * فالثواني تُطوى إلى الدقيقة **التالية** دائماً.
 *
 * @returns `{ date, time }` بصيغتَي حقلَي `date` و`time`، أو `null` لِما ليس
 *   طابعاً زمنياً — والمنادي يُبقي أرضيته السابقة بلا تشديد مخترَع.
 */
export function minInputValues(iso: string | null | undefined): {
  date: string;
  time: string;
} | null {
  if (typeof iso !== "string" || iso.trim() === "") return null;
  const ms = Date.parse(iso);
  if (!Number.isFinite(ms)) return null;

  // إلى الدقيقة التالية ما لم تكن اللحظة على رأس الدقيقة تماماً
  const ceiled = Math.ceil(ms / 60_000) * 60_000;

  const wall = siteWallClockAsUtc(ceiled);
  // بيئة بلا بيانات مناطق زمنية: لا أرضية مخترَعة (نفس سقوط `todayInputValue`)
  if (wall === null) return null;

  const at = new Date(wall);
  const pad = (n: number) => String(n).padStart(2, "0");
  return {
    date: `${at.getUTCFullYear()}-${pad(at.getUTCMonth() + 1)}-${pad(at.getUTCDate())}`,
    time: `${pad(at.getUTCHours())}:${pad(at.getUTCMinutes())}`,
  };
}

/**
 * تاريخ اليوم بصيغة yyyy-mm-dd **بتوقيت الموقع** — لخاصية `min` في حقل التاريخ.
 *
 * وليس بتوقيت الجهاز: من يحجز من نيويورك مساءً يكون في منطقة الموقع قد دخل
 * اليوم التالي، فأرضيةٌ محسوبة على جهازه تسمح باختيار يومٍ **مضى** هناك. والحقل
 * صار يعني «تاريخ الموقع» بعد التصحيح أعلاه، فأرضيته تُقاس بنفس الساعة.
 */
export function todayInputValue(): string {
  const now = new Date();
  try {
    // en-CA تُخرج yyyy-mm-dd مباشرةً — نفس صيغة `<input type="date">`
    return new Intl.DateTimeFormat("en-CA", {
      timeZone: siteTimeZone(),
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(now);
  } catch {
    // نفس منطق السقوط أعلاه: UTC مرجعاً مشتركاً بدل توقيت الجهاز
    const month = String(now.getUTCMonth() + 1).padStart(2, "0");
    const day = String(now.getUTCDate()).padStart(2, "0");
    return `${now.getUTCFullYear()}-${month}-${day}`;
  }
}
