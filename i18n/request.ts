import { getRequestConfig } from "next-intl/server";
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
 * المنطقة الزمنية مثبّتة على القاهرة مثل `components/booking/checkout/datetime.ts`:
 * الخادم يعمل بـ UTC والعميل في مصر، فبلا تثبيتها يظهر موعد الانطلاق بساعة أخرى.
 */

export const TIME_ZONE = "Africa/Cairo";

export default getRequestConfig(async ({ locale: requested }) => {
  const candidate = requested ?? (await getActiveLocale());
  const locale = isRoutingLocale(candidate) ? candidate : DEFAULT_LOCALE;

  return {
    locale,
    timeZone: TIME_ZONE,
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
