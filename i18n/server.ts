import { headers } from "next/headers";
import {
  DEFAULT_LOCALE,
  LOCALE_HEADER,
  LOCALE_PATH_HEADER,
  isRoutingLocale,
  localeDef,
  localePath,
  type LocaleDef,
} from "./config";

/**
 * قراءة اللغة الفعالة للطلب الجاري — المصدر الوحيد: ترويسة يضبطها `proxy.ts`.
 *
 * لماذا ترويسة لا مقطع `[locale]` في المسار؟ لأن العربية بلا بادئة (القاعدة ١)،
 * فلا يوجد مقطع تقرأ منه في ٩٥٪ من الطلبات. الوسيط يقشر البادئة ويمررها في
 * `x-locale`، فتبقى شجرة `app/` واحدة تخدم كل اللغات بلا تكرار صفحة واحدة.
 *
 * غياب الترويسة (تصيير ثابت وقت البناء، أو استدعاء خارج سياق طلب) = العربية.
 * لا رمي استثناء هنا أبداً: صفحة تعرض بالعربية أفضل من صفحة لا تُعرض.
 */

async function readHeader(name: string): Promise<string | null> {
  try {
    const list = await headers();
    return list.get(name);
  } catch {
    return null;
  }
}

/** اللغة الفعالة لهذا الطلب — العربية عند أي شك */
export async function getActiveLocale(): Promise<string> {
  const value = (await readHeader(LOCALE_HEADER))?.toLowerCase();
  return value && isRoutingLocale(value) ? value : DEFAULT_LOCALE;
}

/** تعريف اللغة الفعالة (الاتجاه والاسم ووسم lang) */
export async function getActiveLocaleDef(): Promise<LocaleDef> {
  return localeDef(await getActiveLocale());
}

/**
 * المسار الحالي بعد قشر بادئة اللغة ومعه سلسلة الاستعلام — مثال:
 * الزائر على `/en/services/x?a=1` ⇒ `/services/x?a=1`.
 * هذا ما يبني عليه مبدّل اللغة روابطه فيبقى الزائر مكانه بعد التبديل.
 */
export async function getActivePath(): Promise<string> {
  const value = await readHeader(LOCALE_PATH_HEADER);
  if (!value || !value.startsWith("/")) return "/";
  return value;
}

/** يبني رابط نفس المسار بلغة أخرى — يحافظ على سلسلة الاستعلام */
export function hrefForLocale(locale: string, pathWithQuery: string): string {
  const [path, query] = pathWithQuery.split("?");
  const base = localePath(locale, path && path !== "" ? path : "/");
  return query ? `${base}?${query}` : base;
}
