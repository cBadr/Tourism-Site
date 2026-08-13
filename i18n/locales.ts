import {
  DEFAULT_LOCALE,
  isRoutingLocale,
  localeDef,
  type LocaleDef,
  type LocaleDir,
} from "./config";

/**
 * اللغات المفعَّلة فعلاً — تقاطع ما يعرف الوسيط توجيهه (`ROUTING_LOCALES`)
 * مع ما فعّله المالك في جدول `locales` **وفيه محتوى منشور بالفعل**.
 *
 * ── المصدر: دالة لا جدول ────────────────────────────────────────────────────
 * هجرة ٠٠١٨ تمنع anon من جدول `locales` منعاً باتاً، فقراءته المباشرة كانت
 * تفشل على كل طلب وتسقط على قائمة ثابتة في الكود — أي أن مفتاح «إظهار/إخفاء»
 * في اللوحة كان بلا أثر، والإنجليزية المعطَّلة تُعلَن في hreflang وخريطة الموقع.
 * لذلك المصدر الآن `public.enabled_locales()` من هجرة ٠٠١٩: دالة
 * security-definer ممنوحة لـ anon تُرجع اللغات المفعّلة ومعها `published_count`.
 *
 * ── ثلاث قواعد ──────────────────────────────────────────────────────────────
 * (١) **الجدول يضيّق ولا يوسّع**: لغة مفعّلة في القاعدة بلا رمز معروف في
 *     `i18n/config.ts` لا رابط لها أصلاً، فعرضها في المبدّل يقود إلى ٤٠٤.
 * (٢) **لا لغة فارغة تصل العالم**: لغة بلا نص منشور واحد تُحذف من القائمة، فلا
 *     تظهر في hreflang ولا في خريطة الموقع ولا في المبدّل — وإلا رأى جوجل نسخة
 *     «إنجليزية» محتواها عربي بالكامل. العربية مستثناة لأنها الأصل لا ترجمة.
 * (٣) **الفشل يُضيّق ولا يوسّع**: أي خطأ — شبكة أو صلاحية أو دالة غير منفَّذة —
 *     يرجع بالعربية وحدها. الإعلان عن لغة لم نستطع التحقق منها هو نفسه العطب
 *     الذي وُجدت هذه الدالة لإصلاحه.
 *
 * القراءة عبر REST مباشرة بمفتاح anon (لا `next/headers` ولا كوكيز): تُستدعى من
 * `app/sitemap.ts` و`generateMetadata` معاً، وتبقى الصفحة قابلة للتصيير الثابت.
 */

const CACHE_TTL_MS = 60_000;

/** سقف انتظار الدالة — صفحة تتأخر ثانيتين ونصف أسوأ من صفحة بلغة واحدة */
const RPC_TIMEOUT_MS = 2500;

/** الجواب الآمن عند أي شك: العربية وحدها، لا القائمة الثابتة */
function defaultOnly(): LocaleDef[] {
  return [localeDef(DEFAULT_LOCALE)];
}

let memo: { at: number; locales: LocaleDef[] } | null = null;

/** إسقاط الذاكرة القصيرة بعد تعديل اللغات من اللوحة (نفس العملية فقط) */
export function clearLocalesCache(): void {
  memo = null;
}

type UnknownRow = Record<string, unknown>;

function readText(row: UnknownRow, ...keys: string[]): string | null {
  for (const key of keys) {
    const value = row[key];
    if (typeof value === "string" && value.trim() !== "") return value.trim();
  }
  return null;
}

function readNumber(row: UnknownRow, ...keys: string[]): number | null {
  for (const key of keys) {
    const value = row[key];
    const parsed = typeof value === "number" ? value : Number(value);
    if (value !== null && value !== undefined && value !== "" && Number.isFinite(parsed)) {
      return parsed;
    }
  }
  return null;
}

/** يرتّب القائمة ويضمن حضور العربية في المقدمة مهما قالت القاعدة */
function normalize(list: { def: LocaleDef; sort: number }[]): LocaleDef[] {
  const byCode = new Map<string, { def: LocaleDef; sort: number }>();
  for (const entry of list) byCode.set(entry.def.code, entry);

  if (!byCode.has(DEFAULT_LOCALE)) {
    byCode.set(DEFAULT_LOCALE, { def: localeDef(DEFAULT_LOCALE), sort: -1 });
  }

  return [...byCode.values()]
    .sort((a, b) => {
      if (a.def.code === DEFAULT_LOCALE) return -1;
      if (b.def.code === DEFAULT_LOCALE) return 1;
      if (a.sort !== b.sort) return a.sort - b.sort;
      return a.def.code.localeCompare(b.def.code);
    })
    .map((entry) => entry.def);
}

export async function getEnabledLocales(): Promise<LocaleDef[]> {
  if (memo && Date.now() - memo.at < CACHE_TTL_MS) return memo.locales;

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anonKey) return defaultOnly();

  try {
    const endpoint = `${url.replace(/\/+$/, "")}/rest/v1/rpc/enabled_locales`;

    const res = await fetch(endpoint, {
      method: "POST",
      headers: {
        apikey: anonKey,
        Authorization: `Bearer ${anonKey}`,
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: "{}",
      cache: "no-store",
      signal: AbortSignal.timeout(RPC_TIMEOUT_MS),
    });
    // الدالة غير منفَّذة بعد أو الصلاحية مسحوبة ⇒ العربية وحدها
    if (!res.ok) return defaultOnly();

    const rows: unknown = await res.json();
    if (!Array.isArray(rows)) return defaultOnly();

    const collected: { def: LocaleDef; sort: number }[] = [];
    for (const row of rows) {
      if (typeof row !== "object" || row === null) continue;
      const record = row as UnknownRow;

      // القاعدة (١): ما لا يعرف الوسيط توجيهه لا رابط له
      const code = readText(record, "code")?.toLowerCase();
      if (!code || !isRoutingLocale(code)) continue;

      // القاعدة (٢): لغة بلا نص منشور واحد لا تُعلَن للعالم — إلا الأصل
      const published = readNumber(record, "published_count", "publishedCount") ?? 0;
      if (code !== DEFAULT_LOCALE && published <= 0) continue;

      const base = localeDef(code);
      const dir = readText(record, "dir");
      const nativeName = readText(record, "native_name", "nativeName");
      const name = readText(record, "name");

      collected.push({
        def: {
          ...base,
          ...(name ? { name } : {}),
          ...(nativeName ? { nativeName } : {}),
          ...(dir === "rtl" || dir === "ltr" ? { dir: dir as LocaleDir } : {}),
        },
        sort: readNumber(record, "sort") ?? 0,
      });
    }

    // `normalize` يضمن العربية في المقدمة، فالقائمة الفارغة تعني العربية وحدها
    const locales = normalize(collected);
    memo = { at: Date.now(), locales };
    return locales;
  } catch {
    return defaultOnly();
  }
}

/** رموز اللغات المفعّلة فقط */
export async function getEnabledLocaleCodes(): Promise<string[]> {
  return (await getEnabledLocales()).map((locale) => locale.code);
}
