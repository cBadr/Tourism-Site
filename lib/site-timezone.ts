/**
 * المنطقة الزمنية للموقع — **المصدر الوحيد في TypeScript**.
 *
 * ══════════════════════════════════════════════════════════════════════════
 *  ما يحكمه هذا الإعداد، وما لا يحكمه أبداً
 * ══════════════════════════════════════════════════════════════════════════
 *
 * التخزين **UTC صحيحٌ سلفاً** ولا يمسّه هذا الملف: ‏`2026-09-14T10:00` بتوقيت
 * القاهرة يُخزَّن `2026-09-14T07:00:00.000Z`. فالمنطقة تحكم شيئين لا ثالث لهما:
 *
 *   ① **تفسير المُدخل** — ساعة الحائط التي يكتبها العميل في حقلَي التاريخ
 *      والوقت (`checkout/datetime.ts` ← `toIsoFromCairoInputs`).
 *   ② **تنسيق المُخرَج** — ساعة الحائط التي يقرؤها في كل تاريخٍ معروض.
 *
 * 🔴 **وتغييرها لا يعيد تفسير الماضي.** حجزٌ قائم لحظةٌ مطلقة مجمَّدة؛ فنقل
 * الإعداد من القاهرة إلى الرياض يعرضه بساعةٍ أخرى ولا يزحزحه. وكلّ مسارٍ يفشل
 * في ذلك كان يقرأ المنطقة حيث كان يجب أن يقرأ اللحظة المخزَّنة.
 *
 * ══════════════════════════════════════════════════════════════════════════
 *  لماذا قيمة على مستوى الوحدة، ولماذا هي **ليست** حالة لكل طلب
 * ══════════════════════════════════════════════════════════════════════════
 *
 * المصدر النهائي عمودُ `trip_settings.time_zone` في القاعدة، والدالة
 * `public.site_time_zone()` تقرؤه لكل دالة وكل عرض في Postgres. أما هنا فالقيمة
 * **إعدادُ نشرةٍ واحدة** لا حالةُ مستخدم: D-01 يفرض نسخةً كاملة مستقلة لكل
 * علامة (مشروع Supabase + دومين مستقل)، فليس في العملية الواحدة قيمتان أبداً.
 *
 * ⚠ **ولذلك لا يُوضع في هذه الوحدة شيءٌ يخصّ طلباً بعينه** — لا لغة ولا هوية
 * ولا أي قيمة تختلف بين زائرين. ذلك يصير تسريباً بين الطلبات على الخادم.
 *
 * ومن يكتب القيمة ثلاثة، وكلهم يكتبون **نفس** المصدر:
 *   • الخادم: `lib/site-timezone.server.ts` ← `getSiteTimeZone()` (قراءة القاعدة
 *     مذاكَرةً لكل طلب) — ينادَى من `i18n/request.ts` ومن مسارات `/api`.
 *   • المتصفح: `components/shared/site-time-zone-sync.tsx` — يعكس `useTimeZone()`
 *     من next-intl، أي **نفس** القيمة التي حملها `i18n/request.ts` إلى العميل.
 *   • وما عدا ذلك: الافتراضي أدناه.
 *
 * فالطريق واحد: القاعدة ← `i18n/request.ts` ← إعداد next-intl ← (الخادم مباشرةً
 * · والعميل عبر `NextIntlClientProvider`) ← هذه الوحدة ← الدوال الصرفة.
 */

/**
 * الافتراضي — **fallback دائم لا مصدر** (D-04، نفس حكم `lib/site-config.ts`).
 * يطابق افتراضي العمود في هجرة 0075 حرفاً بحرف، فلا ينحرف الطرفان.
 */
export const DEFAULT_SITE_TIME_ZONE = "Africa/Cairo";

/**
 * قائمة المناطق التي **يعرفها زمن التشغيل نفسه** — لا مصفوفة مكتوبة بيد.
 * `Intl.supportedValuesOf` تُرجع الأسماء القانونية وحدها (٤١٧ اسماً على ICU
 * الحالي)، وقائمة IANA تتغيّر — ومصر نفسها أعادت التوقيت الصيفي في 2023.
 *
 * `null` = زمن تشغيلٍ لا يدعم الدالة؛ عندها نسقط إلى فحصٍ بالتجربة أدناه.
 */
let supportedCache: ReadonlySet<string> | null | undefined;

function supportedZones(): ReadonlySet<string> | null {
  if (supportedCache === undefined) {
    try {
      const list = (
        Intl as unknown as { supportedValuesOf?: (k: string) => string[] }
      ).supportedValuesOf?.("timeZone");
      supportedCache = Array.isArray(list) && list.length > 0 ? new Set(list) : null;
    } catch {
      supportedCache = null;
    }
  }
  return supportedCache;
}

/** قائمة المناطق مرتَّبة — تملأ منتقي الإعدادات، وفارغةٌ حين لا يدعمها التشغيل */
export function listSupportedTimeZones(): readonly string[] {
  const set = supportedZones();
  return set === null ? [] : [...set].sort((a, b) => a.localeCompare(b, "en"));
}

/**
 * هل يعرف زمن التشغيل هذه المنطقة؟
 *
 * الفحص الأول بالقائمة القانونية، والثاني بالتجربة: `Intl.DateTimeFormat` ترمي
 * `RangeError` لاسمٍ لا تعرفه. والثاني وحده هو ما يعمل على زمن تشغيلٍ لا يدعم
 * `supportedValuesOf` — وبه يبقى الفحص **من قاعدة المناطق الحيّة** في الحالتين.
 */
export function isSupportedTimeZone(value: unknown): value is string {
  if (typeof value !== "string") return false;
  const zone = value.trim();
  if (zone === "") return false;

  const set = supportedZones();
  if (set !== null && set.has(zone)) return true;

  try {
    new Intl.DateTimeFormat("en-US", { timeZone: zone }).format(new Date());
    return true;
  } catch {
    return false;
  }
}

/** المنطقة إن كانت معروفة، وإلا الافتراضي — لا استثناء ولا تاريخٌ بساعةٍ خطأ */
export function resolveSiteTimeZone(value: unknown): string {
  return isSupportedTimeZone(value) ? value.trim() : DEFAULT_SITE_TIME_ZONE;
}

/** القيمة السارية في هذه العملية — انظر الترويسة: إعدادُ نشرة لا حالةُ طلب */
let current: string = DEFAULT_SITE_TIME_ZONE;

/**
 * يضبط القيمة السارية ويرجعها. متسامحٌ عمداً: قيمةٌ غير معروفة تسقط إلى
 * الافتراضي بدل أن ترمي — لأن المنادي إما تصييرٌ جارٍ أو عاملٌ خلفي، وانهيار
 * الصفحة لأجل اسم منطقةٍ أسوأ من عرضها بساعة الافتراضي.
 */
export function setSiteTimeZone(value: unknown): string {
  current = resolveSiteTimeZone(value);
  return current;
}

/**
 * المنطقة السارية — **تُنادى عند الاستعمال لا عند تحميل الوحدة**.
 *
 * ⚠ `const TZ = siteTimeZone()` في نطاق وحدةٍ يجمّد القيمة عند أول استيراد،
 * فيصير الإعداد كذبةً بعد أول تغيير. الاستعمال دائماً داخل الدالة.
 */
export function siteTimeZone(): string {
  return current;
}

/**
 * اسمٌ بشريّ للمنطقة بلغة العرض — **من ICU لا من جدولٍ مكتوب**.
 *
 * الترتيب: `shortGeneric` أولاً («توقيت مصر» · «توقيت المملكة العربية السعودية»)،
 * فإن أخرج اختصاراً أو إزاحة (‏`GST` · `GMT+03:00`) — وهو ما يقع لبعض المناطق —
 * جُرِّب `longGeneric` («توقيت الخليج»)، ثم آخر الأمر مقطعُ المدينة من اسم IANA.
 * فلا مصفوفة أسماء تُكتب بيدٍ وتتقادم، ولا اسمٌ تقنيّ يُعرض للعميل.
 */
export function timeZoneLabel(zone: string, locale: string): string {
  const cityFallback = () => {
    const parts = zone.split("/");
    return (parts[parts.length - 1] ?? zone).replace(/_/g, " ");
  };

  // اختصارٌ لاتيني (GST) أو إزاحة (GMT+03:00) — تقنيٌّ لا يُعرض لعميل
  const technical = (text: string) =>
    /^[A-Z]{2,6}$/.test(text) || /^(GMT|UTC)?\s*[+\-−]?\d/i.test(text);

  for (const style of ["shortGeneric", "longGeneric"] as const) {
    try {
      const parts = new Intl.DateTimeFormat(locale, {
        timeZone: zone,
        timeZoneName: style,
      }).formatToParts(new Date());
      const name = parts.find((part) => part.type === "timeZoneName")?.value?.trim();
      if (name && !technical(name)) return name;
    } catch {
      return cityFallback();
    }
  }
  return cityFallback();
}
