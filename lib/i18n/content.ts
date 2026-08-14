import { cache } from "react";
import { DEFAULT_LOCALE } from "@/lib/i18n-types";
import { isRoutingLocale } from "@/i18n/config";
import { mergeLocalized } from "@/lib/content";
import { SERVICES, VEHICLE_CLASSES, type ServiceDef, type VehicleClassDef } from "@/lib/site-config";
import { txFor, type Translator, type Tx } from "@/components/site/i18n";
import { createFormatter, type LocaleFormatter } from "@/components/booking/format";
import { rethrowControlFlow } from "@/lib/next-control-flow";

/**
 * أدوات اللغة للصفحات العامة (المرحلة ٨) — الوجه الخادمي.
 *
 * ثلاث مسؤوليات لا رابعة:
 *   ١ `resolveLocale(params)` — لغة الطلب من مقطع المسار أو من next-intl، وإلا العربية.
 *   ٢ قراءات مترجمة لبيانات النظام (`SERVICES` و`VEHICLE_CLASSES`) عبر مساحتَي
 *     `service` و`vehicle` في جدول الترجمات.
 *   ٣ `getT(namespace)` — مترجم نصوص الواجهة الثابتة بنفس ضمانة الاحتياطي العربي.
 *
 * قاعدتان تحكمان كل شيء هنا: **العربية بلا بادئة في الرابط** (فاللغة الفارغة
 * تعني ar لا خطأً)، و**الغياب يعني العربية** (فلا مفتاح خام ولا عقدة فارغة).
 *
 * ملاحظة استيراد: هذا الملف خادمي بحت (يلمس Supabase وnext-intl/server). جزر
 * العميل تستورد `useT` من `components/site/i18n.ts` و`createFormatter` من
 * `components/booking/format.ts` — كلاهما نقيّ وصالح للمتصفح.
 */

export { createFormatter, type LocaleFormatter };
export type { Tx };

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * يُطبّع رمز اللغة — غير المعروف للتوجيه يعني لغة الأساس.
 * المرجع الوحيد لما هو «معروف» هو `i18n/config.ts` (نفس ما يقشره الوسيط).
 */
export function normalizeLocale(locale?: string | null): string {
  const value = (locale ?? "").trim().toLowerCase();
  return value && isRoutingLocale(value) ? value : DEFAULT_LOCALE;
}

/** اللغة هي لغة الأساس (العربية)؟ */
export function isDefaultLocale(locale?: string | null): boolean {
  return normalizeLocale(locale) === DEFAULT_LOCALE;
}

/**
 * لغة الطلب الجاري — ما تستدعيه كل صفحة عامة في أول سطر.
 *
 * آلية التوجيه المعتمدة (انظر `i18n/config.ts`): الوسيط يقشر بادئة `/en` ويعيد
 * الكتابة داخلياً إلى المسار العربي نفسه، فلا مقطع `[locale]` في شجرة `app/`
 * ولا `params.locale` في ٩٩٪ من الطلبات — اللغة تصل في ترويسة `x-locale`.
 *
 * ومع ذلك تقبل الدالة `params` أيضاً: لو أضيف يوماً مقطع لغة لمسار بعينه عمل
 * بلا لمس أي صفحة. الترتيب: مقطع المسار ← ترويسة الوسيط ← next-intl ← العربية.
 * لا ترمي أبداً: صفحة عربية أفضل من صفحة لا تُعرض.
 */
export async function resolveLocale(params?: unknown): Promise<string> {
  if (params !== undefined) {
    try {
      const awaited = await Promise.resolve(params as Record<string, unknown> | undefined);
      if (isPlainObject(awaited) && typeof awaited.locale === "string") {
        const fromPath = normalizeLocale(awaited.locale);
        if (fromPath !== DEFAULT_LOCALE) return fromPath;
      }
    } catch {
      // params غير قابلة للانتظار — نكمل إلى المصدر التالي
    }
  }

  try {
    const { getActiveLocale } = await import("@/i18n/server");
    return normalizeLocale(await getActiveLocale());
  } catch (error) {
    // ⚠ الإشارة تمرّ والعطل يُبتلع. `getActiveLocale` تقرأ ترويسة الطلب، وقراءتها
    //   داخل تصيير ثابت **إشارةُ تحكّم** من Next لا خطأ: «صنّف هذه الصفحة
    //   ديناميكية». ابتلاعُها كان يجعل `/services/[slug]` و`/routes/[slug]`
    //   تُصنَّفان ثابتتين ثم تسقطان بـ ٥٠٠ عند أول طلب إنتاجي حقيقي.
    rethrowControlFlow(error);
    // لا ترويسة أصلاً (تصيير ثابت مشروع) — نجرّب next-intl ثم العربية
  }

  try {
    const mod = (await import("next-intl/server")) as unknown as {
      getLocale?: () => Promise<string>;
    };
    if (typeof mod.getLocale === "function") {
      return normalizeLocale(await mod.getLocale());
    }
  } catch (error) {
    rethrowControlFlow(error);
    // لا إعداد next-intl بعد — العربية هي الجواب الصحيح
  }

  return DEFAULT_LOCALE;
}

/**
 * مترجم نصوص الواجهة الثابتة لمساحة واحدة.
 * اسم المساحة = اسم ملف المكوّن (`site.header`، `booking.widget` …).
 * غياب الإعداد أو الملف أو المفتاح ⇒ النص العربي الاحتياطي الممرَّر عند الاستدعاء.
 */
export async function getT(namespace: string, locale?: string): Promise<Tx> {
  const resolved = normalizeLocale(locale);
  try {
    const mod = (await import("next-intl/server")) as unknown as {
      getTranslations?: (opts: {
        locale: string;
        namespace?: string;
      }) => Promise<Translator>;
    };
    if (typeof mod.getTranslations !== "function") return txFor(null);
    const translator = await mod.getTranslations({ locale: resolved, namespace });
    return txFor(translator);
  } catch {
    return txFor(null);
  }
}

/* ------------------------------------------------------------------ */
/* بيانات النظام المترجمة: الخدمات وفئات السيارات                        */
/* ------------------------------------------------------------------ */

/**
 * ذاكرة قصيرة داخل العملية لخرائط المساحات — نفس نمط `i18n/locales.ts`.
 *
 * لماذا؟ جدول `translations` مغلق أمام anon (هجرة ٠٠١٨: القراءة للمشرف وحده)،
 * فالمسار العام هو `t(p_locale, p_ns, p_key)` مفتاحاً مفتاحاً — أربعة وعشرون
 * نداءً لو قرأناها على كل طلب. بذاكرة دقيقة واحدة تصير النداءات مرة في الدقيقة
 * لكل لغة، وتأخير ظهور ترجمة منشورة حديثاً لا يتجاوز دقيقة.
 */
const NAMESPACE_TTL_MS = 60_000;
const namespaceMemo = new Map<string, { at: number; values: Map<string, string> }>();

/**
 * إسقاط ذاكرة المساحات بعد نشر ترجمة من اللوحة — نفس مبرر `clearContentCache`
 * في `lib/content.ts`: النص المنشور يجب أن يظهر في التصيير التالي لا بعد دقيقة.
 * محلي للعملية الجارية، والـ TTL يبقى شبكة الأمان لما عداها.
 */
export function clearTranslationsCache(): void {
  namespaceMemo.clear();
}

/**
 * هل يستطيع هذا العميل قراءة جدول `translations` مباشرة؟
 * null = لم نجرّب بعد. المشرف المتصفح للموقع يقرأ الجدول بنداء واحد، والزائر
 * المجهول يُمنع فنسجّل ذلك ولا نكرر المحاولة الفاشلة في هذه العملية.
 */
let tableReadable: boolean | null = null;

/** يقرأ مفاتيح مساحة واحدة بلغة واحدة — بنداء جدول واحد أو بـ `t()` لكل مفتاح */
async function fetchNamespace(
  locale: string,
  namespace: string,
  keys: string[]
): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  if (keys.length === 0) return out;
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) {
    return out;
  }

  try {
    const { createServerSupabase } = await import("@/lib/supabase/server");
    const supabase = await createServerSupabase();
    if (!supabase) return out;

    if (tableReadable !== false) {
      const { data, error } = await supabase
        .from("translations")
        .select("key, value")
        .eq("locale", locale)
        .eq("namespace", namespace)
        .eq("status", "published")
        .in("key", keys);

      if (!error && Array.isArray(data)) {
        tableReadable = true;
        for (const row of data as { key?: unknown; value?: unknown }[]) {
          if (typeof row.key === "string" && typeof row.value === "string" && row.value.trim()) {
            out.set(row.key, row.value);
          }
        }
        return out;
      }
      tableReadable = false;
    }

    // الجدول محجوب عن الزائر ⇒ الدالة العامة `t()` مفتاحاً مفتاحاً
    const rows = await Promise.all(
      keys.map(async (key) => {
        const { data: value, error: rpcError } = await supabase.rpc("t", {
          p_locale: locale,
          p_ns: namespace,
          p_key: key,
        });
        return rpcError ? null : ([key, value] as const);
      })
    );
    for (const row of rows) {
      if (row && typeof row[1] === "string" && row[1].trim()) out.set(row[0], row[1]);
    }
  } catch {
    // نرجع بما جمعناه — والباقي عربي
  }

  return out;
}

/** نفس القراءة مع الذاكرة القصيرة */
async function readNamespace(
  locale: string,
  namespace: string,
  keys: string[]
): Promise<Map<string, string>> {
  const memoKey = `${locale}:${namespace}`;
  const cached = namespaceMemo.get(memoKey);
  if (cached && Date.now() - cached.at < NAMESPACE_TTL_MS) return cached.values;

  const values = await fetchNamespace(locale, namespace, keys);
  namespaceMemo.set(memoKey, { at: Date.now(), values });
  return values;
}

/** الخدمات الست بلغة الزائر — الحقل غير المترجم يبقى عربياً */
export const getLocalizedServices = cache(async (locale?: string): Promise<ServiceDef[]> => {
  const resolved = normalizeLocale(locale);
  if (resolved === DEFAULT_LOCALE) return SERVICES;

  const keys = SERVICES.flatMap((service) => [`${service.slug}.title`, `${service.slug}.short`]);
  const values = await readNamespace(resolved, "service", keys);
  if (values.size === 0) return SERVICES;

  return SERVICES.map((service) => ({
    ...service,
    title: mergeLocalized(service.title, values.get(`${service.slug}.title`)),
    short: mergeLocalized(service.short, values.get(`${service.slug}.short`)),
  }));
});

/** فئات السيارات الأربع بلغة الزائر — الحقل غير المترجم يبقى عربياً */
export const getLocalizedVehicleClasses = cache(
  async (locale?: string): Promise<VehicleClassDef[]> => {
    const resolved = normalizeLocale(locale);
    if (resolved === DEFAULT_LOCALE) return VEHICLE_CLASSES;

    const keys = VEHICLE_CLASSES.flatMap((vehicle) => [
      `${vehicle.slug}.title`,
      `${vehicle.slug}.seats`,
      `${vehicle.slug}.short`,
    ]);
    const values = await readNamespace(resolved, "vehicle", keys);
    if (values.size === 0) return VEHICLE_CLASSES;

    return VEHICLE_CLASSES.map((vehicle) => ({
      ...vehicle,
      title: mergeLocalized(vehicle.title, values.get(`${vehicle.slug}.title`)),
      seats: mergeLocalized(vehicle.seats, values.get(`${vehicle.slug}.seats`)),
      short: mergeLocalized(vehicle.short, values.get(`${vehicle.slug}.short`)),
    }));
  }
);
