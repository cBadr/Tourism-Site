import { getRequestConfig } from "next-intl/server";
import { getSiteTimeZone } from "@/lib/site-timezone.server";
import { DEFAULT_SITE_TIME_ZONE } from "@/lib/site-timezone";
import { DEFAULT_LOCALE, isRoutingLocale } from "./config";
import { BASE_CATALOG, getMessages, readMessage } from "./messages";
import { getActiveLocale } from "./server";

/**
 * إعداد next-intl لكل طلب — يجده الإطار عبر إضافة `createNextIntlPlugin`
 * في `next.config.ts` (المسار الافتراضي `./i18n/request.ts`).
 *
 * اللغة تأتي من ترويسة الوسيط لا من مقطع مسار: لا وجود لـ `app/[locale]` هنا
 * (العربية بلا بادئة — القاعدة ١). و`requestLocale` يبقى محترماً لأن الدوال
 * الخادمية قد تُمرَّر لغة صريحة: `getTranslations({ locale: "en" })`.
 *
 * ── المنطقة الزمنية: **إعداد مالكٍ يُقرأ هنا مرةً واحدة** (هجرة 0075) ────────
 *
 * كانت مثبّتة على القاهرة، وصارت عمود `trip_settings.time_zone` يقرؤه
 * `public.site_time_zone()` في القاعدة و`getSiteTimeZone()` هنا. **وهذا الملف
 * هو معبرها الوحيد إلى الواجهة**: القيمة تدخل إعداد next-intl، فتصل تلقائياً
 * إلى كل `useFormatter` وكل `useTimeZone()` على الخادم وفي المتصفح معاً عبر
 * `NextIntlClientProvider` (بلا وسائط) في `app/layout.tsx`.
 *
 * ⚠ **ولا يُثبَّت اسمُ منطقةٍ في أي ملفّ آخر.** الافتراضي المستورد أدناه
 * fallback للحظة التي تتعذّر فيها القراءة، لا مصدرٌ ثانٍ.
 */

/** @deprecated الاسم القديم — يبقى للتوافق. المصدر `lib/site-timezone.ts` */
export const TIME_ZONE = DEFAULT_SITE_TIME_ZONE;

export default getRequestConfig(async ({ locale: requested }) => {
  const candidate = requested ?? (await getActiveLocale());
  const locale = isRoutingLocale(candidate) ? candidate : DEFAULT_LOCALE;

  return {
    locale,
    // القراءة مذاكَرة لكل طلب، وتضبط الوحدة المشتركة للدوال الصرفة معها
    timeZone: await getSiteTimeZone(),
    messages: getMessages(locale),

    /**
     * شبكة الأمان الأخيرة (القاعدة ٤): الرسائل مدموجة فوق العربية أصلاً في
     * `getMessages`، فلا يُفترض أن نصل إلى هنا. وإن وصلنا — مفتاح ألّفه مكوّن
     * ولا وجود له في أي كتالوج — نعيد النص العربي إن وُجد، ثم فراغاً في
     * الإنتاج. لا يُعرض مفتاح خام للزائر أبداً؛ وفي التطوير نُظهره ليُصلَح.
     */
    getMessageFallback({ namespace, key }) {
      const path = namespace ? `${namespace}.${key}` : key;
      const arabic = readMessage(BASE_CATALOG, path);
      if (arabic !== null) return arabic;
      return process.env.NODE_ENV === "production" ? "" : path;
    },

    /** مفتاح ناقص ليس عطلاً يستحق ضجيجاً في الإنتاج — السقوط أعلاه يعالجه */
    onError(error) {
      if (process.env.NODE_ENV !== "production") console.error(error);
    },
  };
});
