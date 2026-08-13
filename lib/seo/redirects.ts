/**
 * التحويلات (redirects) — الطبقة الصفرية التي يقرؤها `proxy.ts`.
 *
 * لماذا هذا الملف بهذا الانضباط؟ لأن `proxy.ts` يستورده، ويمر عليه **كل طلب**.
 * ما يُستورَد هنا يُسحب إلى حزمة الوسيط، ولذلك — بالضبط كما في
 * `lib/maintenance.ts` و`i18n/config.ts`:
 *   • لا SDK لـ Supabase ولا `lib/settings.ts` ولا `next/headers`.
 *   • القراءة عبر REST مباشرة بمفتاح anon (سياسة الجدول تسمح لـ anon بقراءة
 *     الصفوف المفعّلة وحدها) مع ذاكرة قصيرة داخل العملية ومهلة قصوى.
 *   • **الفشل الآمن مطلق**: أي خطأ — جدول غير موجود، شبكة، مهلة، JSON تالف —
 *     يعني «لا تحويلات». الموقع لا يُكسَر أبداً بسبب تعذّر قراءة جدول تحويلات.
 * الاستيراد الوحيد المسموح هو `@/i18n/config` لأنه أصلاً في حزمة الوسيط وبلا
 * تبعيات — وبه نحفظ لغة الزائر عبر التحويل.
 *
 * الجدول يملكه بانِي الهجرة (0022): `public.redirects`
 *   from_path (فريد) · to_path · status_code · enabled · note · created_at/updated_at
 *
 * ⚠ حدود معروفة ومقصودة (مذكورة في الشاشة للمالك بنصّها):
 *  ١) الذاكرة القصيرة **داخل العملية**. حفظ من اللوحة يستدعي
 *     `clearRedirectsCache()` لكن الوسيط في الإنتاج قد يعمل في عملية أخرى —
 *     فالضمان الحقيقي هو انتهاء المهلة (`REDIRECTS_CACHE_TTL_MS`) لا الإبطال.
 *  ٢) المطابقة على **المسار وحده** بلا سلسلة استعلام: `/old?a=1` يطابق `/old`،
 *     وسلسلة استعلام الزائر تُحمل كما هي إلى الوجهة (ما لم تحمل الوجهة سلسلتها).
 *  ٣) الهدف قد يكون **عنوان `https://` مطلقاً** — يجيزه قيد الجدول صراحةً
 *     (نقل علامة إلى نطاق آخر، أو صفٌّ مستورد من نسخة whitelabel أخرى).
 *     يُعاد في `absoluteUrl` كما هو، ولا تُركَّب عليه بادئة لغة ولا تُحمل إليه
 *     سلسلة استعلام الزائر. وشاشة اللوحة تبقى أضيق: `lib/seo/validate.ts` لا
 *     تقبل من المالك إلا مساراً داخلياً، فالمطلق لا يدخل إلا من SQL أو استيراد.
 */

import {
  DEFAULT_LOCALE,
  isLocaleBypassedPath,
  localePath,
  splitLocale,
} from "@/i18n/config";

/** رموز الحالة المسموح بها — مطابقة لقيد check في الجدول */
export const REDIRECT_STATUS_CODES = [301, 302, 307, 308] as const;
export type RedirectStatus = (typeof REDIRECT_STATUS_CODES)[number];

export type RedirectRule = {
  fromPath: string;
  toPath: string;
  statusCode: RedirectStatus;
};

/** فهرس جاهز للبحث: المفتاح = المسار المطبَّع بحروف صغيرة */
export type RedirectIndex = Map<string, RedirectRule>;

export const EMPTY_REDIRECT_INDEX: RedirectIndex = new Map();

/** مدة الذاكرة القصيرة — نصف دقيقة: قصيرة بما يكفي ليظهر الحفظ، طويلة بما يكفي ألا نستعلم على كل طلب */
export const REDIRECTS_CACHE_TTL_MS = 30_000;

/** سقف الصفوف المقروءة — حاجز أمان لا حد منتَج؛ تجاوزه يعني حاجة لطبقة أخرى */
export const REDIRECTS_FETCH_LIMIT = 1000;

/** أقصى عدد قفزات نطويها داخلياً (أ ⇒ ب ⇒ ج تصير تحويلاً واحداً إلى ج) */
export const REDIRECT_MAX_HOPS = 5;

/**
 * المسارات التي لا تُطبَّق عليها التحويلات إطلاقاً: اللوحة والبورتال والـ API
 * والأصول وملفات السيو. القائمة مطابقة عمداً لاستثناءات الصيانة واللغة.
 *
 * فرق مقصود عن `isLocaleBypassedPath`: هذه لا تستثني المسارات ذات الامتداد.
 * سبب وجود مدير التحويلات أصلاً هو هجرة موقع قديم، وروابطه القديمة هي
 * `/old-page.html` و`/index.php` — استثناؤها يفرّغ الميزة من غرضها.
 */
const REDIRECT_BYPASS_PREFIXES = [
  "/admin",
  "/portal",
  "/api",
  "/_next",
  "/brand",
  "/images",
] as const;

const REDIRECT_BYPASS_EXACT = [
  "/favicon.ico",
  "/robots.txt",
  "/sitemap.xml",
  "/manifest.webmanifest",
] as const;

export function isRedirectBypassedPath(pathname: string): boolean {
  if (REDIRECT_BYPASS_EXACT.some((p) => pathname === p)) return true;
  return REDIRECT_BYPASS_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`)
  );
}

/**
 * فك ترميز النسبة المئوية بأمان. الزائر يصل بـ `/%D8%AE...` بينما المالك يكتب
 * المسار بالعربية في اللوحة — بلا فك ترميز لا يتطابقان أبداً. والفك قد يرمي
 * على تسلسل تالف، فنُبقي الأصل حينها.
 */
function safeDecode(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

/**
 * الشكل المطبَّع لمسار تحويل: شرطة مائلة بادئة، بلا شرطة نهائية (عدا الجذر)،
 * ومفكوك الترميز. لا يمس حالة الأحرف — المفتاح وحده يُصغَّر عند الفهرسة.
 */
export function normalizeRedirectPath(value: string): string {
  const trimmed = safeDecode(String(value ?? "").trim());
  if (trimmed === "") return "";
  const withSlash = trimmed.startsWith("/") ? trimmed : `/${trimmed}`;
  const cleaned = withSlash.replace(/\/+$/, "");
  return cleaned === "" ? "/" : cleaned;
}

/** مفتاح البحث: المسار المطبَّع بحروف صغيرة (الروابط القديمة كثيراً ما تختلف في حالة الأحرف) */
export function redirectKey(value: string): string {
  return normalizeRedirectPath(value).toLowerCase();
}

/**
 * هدف مطلق: `https://host/...` وحده — لا `http://` ولا `//host` ولا
 * `javascript:`. النمط مطابق عمداً لقيد `redirects_to_path_chk` في هجرة 0022،
 * فما تقبله القاعدة هو بالضبط ما ينفّذه الوسيط.
 *
 * ولماذا يُدعم أصلاً؟ لأن القيد يجيزه صراحةً ويوثّق سببه: نقل علامة إلى نطاق
 * آخر، أو صفٌّ مستورد من نسخة whitelabel أخرى. وبلا هذا الدعم كان
 * `normalizeRedirectPath` يُقحم شرطة بادئة فيصير الهدف `/https:/old.com/x`
 * على نطاق بدر نفسه ⇒ ٤٠٤ دائمة بلا رسالة ولا سطر سجل.
 */
export function isAbsoluteTarget(value: string): boolean {
  return /^https:\/\/[A-Za-z0-9._-]+/i.test(String(value ?? "").trim());
}

/**
 * العنوان المطلق بعد تحققٍ فعلي بمحلّل العناوين — أو `null`.
 *
 * النمط وحده لا يكفي: صفٌّ كُتب بيد قد يمرّ القيد ويظل عنواناً لا يُحلَّل، و
 * `new URL()` ترمي. ورميةٌ داخل الوسيط تُسقط **كل** طلبات الموقع لا هذا الطلب،
 * فالتحقق يقع هنا مرة واحدة ويصل الوسيط عنوانٌ مضمون البناء (قاعدة «الفشل
 * الآمن مطلق» في رأس هذا الملف).
 */
function absoluteTarget(value: string): string | null {
  const raw = String(value ?? "").trim();
  if (!isAbsoluteTarget(raw)) return null;
  try {
    const url = new URL(raw);
    return url.protocol === "https:" ? url.toString() : null;
  } catch {
    return null;
  }
}

/**
 * فصل المسار عن سلسلة الاستعلام في الوجهة — `/new?x=1` ⇒ ("/new", "?x=1").
 * الهدف المطلق يُعاد كما هو في `absolute` ولا يمر على التطبيع إطلاقاً.
 */
export function splitTarget(toPath: string): {
  pathname: string;
  search: string;
  absolute: string | null;
} {
  const raw = String(toPath ?? "").trim();

  if (isAbsoluteTarget(raw)) {
    // العنوان الكامل بسلسلته وشظيته كما كتبها المالك — لا تطبيع ولا قشر لغة.
    // وإن تعذّر تحليله فـ `absolute = null` و`pathname = ""` معاً ⇒ لا تحويل
    // إطلاقاً؛ لا يجوز أن يسقط إلى التطبيع فيصير `/https:/host/x` على نطاقنا.
    return { pathname: "", search: "", absolute: absoluteTarget(raw) };
  }

  const hashless = raw.split("#")[0] ?? "";
  const qi = hashless.indexOf("?");
  if (qi === -1) {
    return { pathname: normalizeRedirectPath(hashless), search: "", absolute: null };
  }
  return {
    pathname: normalizeRedirectPath(hashless.slice(0, qi)),
    search: hashless.slice(qi),
    absolute: null,
  };
}

/** بناء الفهرس من صفوف خام (تُستعمل في القراءة REST وفي شاشة اللوحة معاً) */
export function buildRedirectIndex(
  rows: { from_path?: unknown; to_path?: unknown; status_code?: unknown }[]
): RedirectIndex {
  const index: RedirectIndex = new Map();
  for (const row of rows) {
    const fromPath = typeof row.from_path === "string" ? normalizeRedirectPath(row.from_path) : "";
    const toPath = typeof row.to_path === "string" ? String(row.to_path).trim() : "";
    if (fromPath === "" || toPath === "") continue;

    const rawStatus = Number(row.status_code);
    const statusCode = (REDIRECT_STATUS_CODES as readonly number[]).includes(rawStatus)
      ? (rawStatus as RedirectStatus)
      : 301;

    index.set(fromPath.toLowerCase(), { fromPath, toPath, statusCode });
  }
  return index;
}

let memo: { at: number; index: RedirectIndex } | null = null;

/**
 * إسقاط الذاكرة القصيرة بعد تعديل من اللوحة — **داخل هذه العملية فقط**.
 * في الإنتاج قد يعمل الوسيط في عملية/بيئة تشغيل أخرى، فالضمان المعلن للمالك
 * هو انتهاء المهلة لا هذا الاستدعاء.
 */
export function clearRedirectsCache(): void {
  memo = null;
}

/**
 * قراءة التحويلات المفعّلة عبر REST بمفتاح anon.
 * `fresh=true` يتخطى الذاكرة القصيرة (تستعمله شاشة اللوحة لترى أثر الحفظ فوراً).
 */
export async function fetchRedirects(fresh = false): Promise<RedirectIndex> {
  if (!fresh && memo && Date.now() - memo.at < REDIRECTS_CACHE_TTL_MS) {
    return memo.index;
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anonKey) return EMPTY_REDIRECT_INDEX;

  try {
    const endpoint =
      `${url.replace(/\/+$/, "")}/rest/v1/redirects` +
      `?select=from_path,to_path,status_code&enabled=is.true&limit=${REDIRECTS_FETCH_LIMIT}`;

    const res = await fetch(endpoint, {
      headers: {
        apikey: anonKey,
        Authorization: `Bearer ${anonKey}`,
        Accept: "application/json",
      },
      cache: "no-store",
      signal: AbortSignal.timeout(2500),
    });

    // الجدول غير موجود بعد (الهجرة لم تُنفَّذ) = لا تحويلات، ونُذاكر الفراغ
    // حتى لا نعيد المحاولة على كل طلب.
    if (!res.ok) {
      memo = { at: Date.now(), index: EMPTY_REDIRECT_INDEX };
      return EMPTY_REDIRECT_INDEX;
    }

    const rows = (await res.json()) as unknown;
    if (!Array.isArray(rows)) return EMPTY_REDIRECT_INDEX;

    const index = buildRedirectIndex(rows as Record<string, unknown>[]);
    memo = { at: Date.now(), index };
    return index;
  } catch {
    return EMPTY_REDIRECT_INDEX;
  }
}

/**
 * «الجدول غير موجود» بلغة Postgres و PostgREST — تُميّز «الهجرة لم تُنفَّذ بعد»
 * عن «فشل الحفظ». مكتوبة هنا لا مستوردة من `lib/dispatch/settings.ts` كي تبقى
 * شاشات السيو بلا تبعية على طبقة البث.
 */
export function isMissingRelation(code: string | undefined | null): boolean {
  return code === "42P01" || code === "PGRST205";
}

/** نتيجة مطابقة تحويل — جاهزة لتركيبها على `request.nextUrl` */
export type RedirectHit = {
  /** المسار الهدف بعد إعادة تركيب بادئة اللغة — مفكوك الترميز. `""` مع هدف مطلق */
  pathname: string;
  /** سلسلة استعلام الوجهة إن كانت مكتوبة في `to_path`، وإلا "" (تبقى سلسلة الزائر) */
  search: string;
  /**
   * عنوان `https://…` كاملاً حين يكون الهدف خارج الموقع — و`null` للهدف
   * الداخلي. الوسيط يبني منه `NextResponse.redirect` مباشرة بلا لمس
   * `nextUrl.pathname` (وضعُه في المسار كان يصنع تحويلاً مكسوراً على نطاقنا).
   */
  absoluteUrl: string | null;
  status: RedirectStatus;
};

/**
 * يحلّ التحويل لمسار طلب واحد، أو `null` إن لم يكن ثمة تحويل.
 *
 * ماذا يفعل بالضبط:
 *  ١) يستثني اللوحة والـ API والأصول (`isRedirectBypassedPath`).
 *  ٢) يقشر بادئة اللغة قبل المطابقة ويعيد تركيبها على الوجهة — فالمالك يكتب
 *     قاعدة واحدة بالعربية (`/old` ⇒ `/new`) وتعمل على `/en/old` أيضاً بلا
 *     أن يفقد الزائر لغته. و`/en/admin` لا يُمس (`isLocaleBypassedPath` عليه).
 *  ٣) يطوي السلسلة داخلياً: أ ⇒ ب ⇒ ج تصير تحويلاً **واحداً** إلى ج. سلاسل
 *     التحويل تُضعف السيو وتُبطئ الزائر، ورمز الحالة يبقى رمز القاعدة الأولى.
 *  ٤) **يفشل مغلقاً أمام الحلقات**: أي حلقة أو تجاوز لسقف القفزات ⇒ لا تحويل
 *     إطلاقاً. التحقق في اللوحة يمنع الحلقة عند الحفظ، وهذا حاجز ثانٍ يحمي من
 *     صف كُتب مباشرة في القاعدة (قاعدة «حارسان مستقلان لكل قدرة خطرة»).
 */
export function resolveRedirect(pathname: string, index: RedirectIndex): RedirectHit | null {
  if (index.size === 0) return null;
  if (isRedirectBypassedPath(pathname)) return null;

  const decoded = safeDecode(pathname);
  const split = splitLocale(decoded);
  const prefix = split.prefix ?? DEFAULT_LOCALE;
  const basePath = split.prefix === null ? decoded : split.pathname;

  // `/en/admin` وأخواته: بادئة لغة فوق مسار محجوب — لا تُلمس
  if (split.prefix !== null && isLocaleBypassedPath(split.pathname)) return null;

  let key = redirectKey(basePath);
  if (key === "") return null;

  const first = index.get(key);
  if (!first) return null;

  const visited = new Set<string>([key]);
  let rule = first;
  let search = "";
  let hops = 0;

  for (;;) {
    const target = splitTarget(rule.toPath);

    // هدف خارج الموقع: نهاية السلسلة حتماً — لا مسار داخلي يُطابَق بعده، ولا
    // بادئة لغة تُركَّب عليه، وسلسلة استعلام الزائر لا تُحمل إلى نطاق آخر.
    if (target.absolute !== null) {
      return {
        pathname: "",
        search: "",
        absoluteUrl: target.absolute,
        status: first.statusCode,
      };
    }

    if (target.pathname === "") return null;
    search = target.search;

    const nextKey = target.pathname.toLowerCase();
    if (visited.has(nextKey)) return null; // حلقة — لا تحويل
    visited.add(nextKey);

    const next = index.get(nextKey);
    if (!next) {
      const finalPath = localePath(prefix, target.pathname);
      // لا نحوّل مساراً إلى نفسه — حارس أخير ضد حلقة لا نهائية في المتصفح
      if (finalPath === decoded && search === "") return null;
      return { pathname: finalPath, search, absoluteUrl: null, status: first.statusCode };
    }

    hops += 1;
    if (hops >= REDIRECT_MAX_HOPS) return null; // سلسلة أطول مما نطويه — لا تحويل
    rule = next;
    key = nextKey;
  }
}
