import { useTranslations } from "next-intl";

/**
 * جسر الترجمة لجزر العميل (المرحلة ٨).
 *
 * القاعدة الرابعة في عقد المرحلة: **الترجمة الغائبة تعني النص العربي، لا مفتاحاً
 * خاماً ولا فراغاً**. سلوك next-intl الافتراضي عند غياب المفتاح هو إظهار المفتاح
 * نفسه — وهو ما لا يجوز أن يراه زائر. لذلك لا يُستدعى المترجم مباشرة في أي مكوّن،
 * بل من خلال `tx(t, key, fallback)` التي تُرجع النص العربي الأصلي عند أي غياب.
 *
 * وهذا يعطي أثراً جانبياً مقصوداً: الموقع يظل يعمل بالعربية كاملةً حتى قبل أن
 * تصل ملفات الرسائل ومزوّد `NextIntlClientProvider` من نصف المرحلة الآخر.
 *
 * أسماء المساحات = اسم ملف المكوّن: `site.header`، `site.footer`، `booking.widget` …
 */

/**
 * مترجم بأي شكل — `useTranslations` أو `getTranslations`.
 * المفاتيح هنا `string` عمداً: حين يُولّد نصف المرحلة الآخر أنواع الرسائل
 * (`AppConfig.Messages`) تصبح مفاتيح next-intl اتحاداً حرفياً، وتوسيع المعامل
 * إلى `string` يبقي هذا الجسر صالحاً بلا كسر في الطرفين.
 */
export type Translator = {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (key: any, ...args: any[]): string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  has(key: any): boolean;
};

/** قيم تُحقن في نص الرسالة — نفس أسماء المتغيرات في ملف الرسائل */
export type TxValues = Record<string, string | number>;

/** دالة ترجمة آمنة: مفتاح + نص عربي احتياطي + قيم اختيارية */
export type Tx = (key: string, fallback: string, values?: TxValues) => string;

/** يحقن `{name}` في النص الاحتياطي — نفس صيغة ICU البسيطة التي تستعملها الرسائل */
function interpolate(text: string, values?: TxValues): string {
  if (!values) return text;
  return text.replace(/\{(\w+)\}/g, (match, name: string) =>
    name in values ? String(values[name]) : match
  );
}

/** يقرأ مفتاحاً من مترجم قد يكون غائباً — والنتيجة الفارغة تعني الاحتياطي */
export function tx(
  t: Translator | null | undefined,
  key: string,
  fallback: string,
  values?: TxValues
): string {
  if (!t) return interpolate(fallback, values);
  try {
    if (!t.has(key)) return interpolate(fallback, values);
    const value = values ? t(key, values) : t(key);
    return typeof value === "string" && value.trim().length > 0
      ? value
      : interpolate(fallback, values);
  } catch {
    return interpolate(fallback, values);
  }
}

/** يبني دالة ترجمة آمنة فوق مترجم جاهز */
export function txFor(t: Translator | null | undefined): Tx {
  return (key, fallback, values) => tx(t, key, fallback, values);
}

/**
 * نسخة جزر العميل — تُستدعى في مكوّنات "use client" وحدها.
 * `NextIntlClientProvider` مركَّب في `app/layout.tsx` فوق الشجرة كلها.
 */
export function useT(namespace: string): Tx {
  const translator = useTranslations(namespace) as unknown as Translator;
  return (key, fallback, values) => tx(translator, key, fallback, values);
}
