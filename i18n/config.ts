import { DEFAULT_LOCALE, localePath } from "@/lib/i18n-types";

/**
 * إعداد اللغات — الطبقة الصفرية: **بلا أي تبعية على الإطلاق**.
 *
 * لماذا صفر تبعيات؟ لأن `proxy.ts` يستورد هذا الملف، ويمر عليه كل طلب.
 * ما يُستورَد هنا يُسحب إلى الوسيط، ولذلك لا Supabase ولا `next/headers`
 * ولا قراءة قاعدة بيانات — أسماء اللغات واتجاهها بيانات ثابتة تكفي للتوجيه.
 * (نفس انضباط `lib/maintenance.ts`.)
 *
 * ── آلية التوجيه المعتمدة ───────────────────────────────────────────────────
 * بادئة في الرابط بنمط «عند الحاجة فقط» (`as-needed`):
 *   • العربية (اللغة الأساس) بلا بادئة:  `/` ، `/book` ، `/services/x`
 *   • غيرها ببادئة:                      `/en` ، `/en/book` ، `/en/services/x`
 * الوسيط يقشّر البادئة ويعيد كتابة الطلب داخلياً إلى المسار العربي نفسه، فتخدم
 * شجرة `app/` واحدة كل اللغات — ولا شيء اسمه `app/[locale]` هنا. هذا يحفظ
 * القاعدة (١): كل رابط عربي قائم يبقى حرفاً بحرف كما هو.
 *
 * ── لماذا القائمة ثابتة لا من قاعدة البيانات؟ ────────────────────────────────
 * التوجيه قرار يقع على كل طلب قبل أي تصيير؛ ربطه بجدول يعني نداء شبكة في
 * الوسيط لكل ملف وكل صفحة. فالمسار المسموح بلغاته يأتي من هنا (ومن متغير بيئة
 * لمن أراد التوسع بلا نشر جديد)، أما **تفعيل** اللغة وتقدّم ترجمتها فمن جدول
 * `locales` عبر `i18n/locales.ts` — الجدول يضيّق القائمة ولا يوسّعها.
 */

export type LocaleDir = "rtl" | "ltr";

export type LocaleDef = {
  /** ISO-639-1 */
  code: string;
  /** اسم اللغة بالعربية — للوحة وللقوائم العربية */
  name: string;
  /** كما يكتبها أهلها: English, Français */
  nativeName: string;
  dir: LocaleDir;
  /** قيمة سمة lang في HTML وقيمة hreflang */
  htmlLang: string;
  /** وسم Open Graph */
  ogLocale: string;
};

/** فهرس اللغات المعروفة — التوسّع بإضافة سطر هنا ثم ذكر الرمز في متغير البيئة */
export const LOCALE_CATALOG: Record<string, LocaleDef> = {
  ar: {
    code: "ar",
    name: "العربية",
    nativeName: "العربية",
    dir: "rtl",
    htmlLang: "ar",
    ogLocale: "ar_EG",
  },
  en: {
    code: "en",
    name: "الإنجليزية",
    nativeName: "English",
    dir: "ltr",
    htmlLang: "en",
    ogLocale: "en_US",
  },
  fr: {
    code: "fr",
    name: "الفرنسية",
    nativeName: "Français",
    dir: "ltr",
    htmlLang: "fr",
    ogLocale: "fr_FR",
  },
  de: {
    code: "de",
    name: "الألمانية",
    nativeName: "Deutsch",
    dir: "ltr",
    htmlLang: "de",
    ogLocale: "de_DE",
  },
  it: {
    code: "it",
    name: "الإيطالية",
    nativeName: "Italiano",
    dir: "ltr",
    htmlLang: "it",
    ogLocale: "it_IT",
  },
  es: {
    code: "es",
    name: "الإسبانية",
    nativeName: "Español",
    dir: "ltr",
    htmlLang: "es",
    ogLocale: "es_ES",
  },
  ru: {
    code: "ru",
    name: "الروسية",
    nativeName: "Русский",
    dir: "ltr",
    htmlLang: "ru",
    ogLocale: "ru_RU",
  },
};

/** اللغات المشحونة مع المستودع (ملفات رسائل حقيقية) */
const SHIPPED_LOCALES = ["ar", "en"] as const;

/**
 * يقرأ `NEXT_PUBLIC_SITE_LOCALES` (مثال: "ar,en,fr") ويصفّيها على الفهرس.
 * العربية أولاً دائماً ولو غابت عن المتغير — لا يُعطَّل الأساس أبداً.
 */
function resolveRoutingLocales(): string[] {
  const raw = process.env.NEXT_PUBLIC_SITE_LOCALES;
  const requested =
    typeof raw === "string" && raw.trim() !== ""
      ? raw.split(",").map((code) => code.trim().toLowerCase())
      : [...SHIPPED_LOCALES];

  const out: string[] = [DEFAULT_LOCALE];
  for (const code of requested) {
    if (code === DEFAULT_LOCALE) continue;
    if (!(code in LOCALE_CATALOG)) continue;
    if (out.includes(code)) continue;
    out.push(code);
  }
  return out;
}

/** اللغات التي يعرف الوسيط توجيهها — العربية أولاً */
export const ROUTING_LOCALES: string[] = resolveRoutingLocales();

export { DEFAULT_LOCALE, localePath };

/** تعريف لغة أو null لغير المعروف */
export function getLocaleDef(code: string): LocaleDef | null {
  return LOCALE_CATALOG[code] ?? null;
}

/** تعريف لغة مع السقوط على العربية — لا يُرجع null أبداً */
export function localeDef(code: string): LocaleDef {
  return LOCALE_CATALOG[code] ?? LOCALE_CATALOG[DEFAULT_LOCALE];
}

export function isRoutingLocale(code: string): boolean {
  return ROUTING_LOCALES.includes(code);
}

export function localeDir(code: string): LocaleDir {
  return localeDef(code).dir;
}

export function localeHtmlLang(code: string): string {
  return localeDef(code).htmlLang;
}

export function localeOg(code: string): string {
  return localeDef(code).ogLocale;
}

/* ------------------------------------------------------------------ */
/* الترويسات التي يمررها الوسيط إلى طبقة التصيير                        */
/* ------------------------------------------------------------------ */

/** اللغة الفعالة لهذا الطلب */
export const LOCALE_HEADER = "x-locale";

/**
 * المسار بعد قشر البادئة **مع** سلسلة الاستعلام — مثال: `/services/x?a=1`.
 * مصدره الوحيد الوسيط، ويستعمله مبدّل اللغة ليحافظ على مكان الزائر عند التبديل.
 */
export const LOCALE_PATH_HEADER = "x-locale-path";

/* ------------------------------------------------------------------ */
/* المسارات المستثناة من التوجيه اللغوي                                  */
/* ------------------------------------------------------------------ */

/**
 * لا لغة ولا بادئة ولا إعادة كتابة لهذه المسارات (القاعدة ٢):
 * لوحة التحكم وبوابة المتعهدين عربيتان فقط، والـ API والأصول الثابتة
 * وملفات السيو ليست صفحات أصلاً. مطابق لاستثناءات وضع الصيانة عن قصد.
 */
export const LOCALE_BYPASS_PREFIXES = [
  "/admin",
  "/portal",
  "/api",
  "/_next",
  "/brand",
  "/images",
] as const;

const LOCALE_BYPASS_EXACT = [
  "/favicon.ico",
  "/robots.txt",
  "/sitemap.xml",
  "/manifest.webmanifest",
] as const;

export function isLocaleBypassedPath(pathname: string): boolean {
  if (LOCALE_BYPASS_EXACT.some((path) => pathname === path)) return true;
  // أي مسار يحمل امتداد ملف ليس صفحة: لا نلمسه (opensearch.xml، ads.txt…)
  if (/\.[a-z0-9]{2,5}$/i.test(pathname)) return true;
  return LOCALE_BYPASS_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`)
  );
}

/** ناتج فحص البادئة اللغوية في المسار */
export type LocaleSplit = {
  /** الرمز المقروء من البادئة، أو null إن لم تكن هناك بادئة معروفة */
  prefix: string | null;
  /** المسار بعد القشر — يبدأ بشرطة مائلة دائماً */
  pathname: string;
};

/**
 * يفصل بادئة اللغة عن المسار: `/en/book` ← { prefix: "en", pathname: "/book" }.
 * البادئة تُقبل فقط إن كانت من `ROUTING_LOCALES` (بما فيها العربية، ليتمكن
 * الوسيط من إعادة توجيه `/ar/...` إلى الشكل الأصيل بلا بادئة).
 */
export function splitLocale(pathname: string): LocaleSplit {
  const segments = pathname.split("/");
  const first = segments[1]?.toLowerCase() ?? "";
  if (first === "" || !isRoutingLocale(first)) {
    return { prefix: null, pathname };
  }
  const rest = `/${segments.slice(2).join("/")}`;
  return { prefix: first, pathname: rest === "/" ? "/" : rest.replace(/\/+$/, "") || "/" };
}

/**
 * الشكل القانوني الوحيد لمسار يحمل بادئة لغة — أو `null` إن كان قانونياً أصلاً.
 *
 * لماذا؟ `splitLocale` تقبل البادئة بأي حالة أحرف وتتسامح مع الشرطة الأخيرة،
 * فـ `/EN/book` و`/en/book/` و`/en/book` تخدم الصفحة نفسها بثلاثة عناوين. هذا
 * محتوى مكرر يقسم وزن الصفحة، ولا يصلحه `canonical` وحده لأن الزاحف يظل يطلب
 * الثلاثة. العلاج تحويل ٣٠٨ إلى العنوان الواحد.
 *
 * تشمل الدالة أيضاً `/ar/...` ⇒ `/...` (القاعدة ١: العربية بلا بادئة أبداً)،
 * فيكفي الوسيطَ نداءٌ واحد لكل حالات التحويل:
 *
 *   const canonical = canonicalLocalePath(pathname);
 *   if (canonical) { target.pathname = canonical; return NextResponse.redirect(target, 308); }
 *
 * المسارات المستثناة (`/admin`، `/api`، الأصول) لا تُمس: تُرجع `null` دائماً.
 */
export function canonicalLocalePath(pathname: string): string | null {
  if (isLocaleBypassedPath(pathname)) return null;

  const first = pathname.split("/")[1]?.toLowerCase() ?? "";
  if (first === "" || !isRoutingLocale(first)) return null;

  const { pathname: rest } = splitLocale(pathname);
  // `/en/admin` ليس صفحة لغة: يبقى كما هو لينتهي إلى ٤٠٤ سليم لا إلى تحويل
  if (isLocaleBypassedPath(rest)) return null;

  const canonical = localePath(first, rest);
  return canonical === pathname ? null : canonical;
}
