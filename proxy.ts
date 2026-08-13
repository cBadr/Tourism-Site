import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import {
  fetchMaintenanceState,
  hasSupabaseSessionCookie,
  isMaintenanceBypassedPath,
  maintenanceResponse,
} from "@/lib/maintenance";
import {
  DEFAULT_LOCALE,
  LOCALE_HEADER,
  LOCALE_PATH_HEADER,
  canonicalLocalePath,
  isLocaleBypassedPath,
  splitLocale,
} from "@/i18n/config";
import {
  fetchRedirects,
  isRedirectBypassedPath,
  resolveRedirect,
} from "@/lib/seo/redirects";

/**
 * الوسيط — أربع مسؤوليات بترتيب لا يُبدَّل:
 *
 * (١) وضع الصيانة للزوار: يمر عليه كل طلب الآن (الـ matcher وُسّع)، فإن كان
 *     الوضع مفعّلاً رجع الزائر بصفحة ٥٠٣ من `lib/maintenance.ts` قبل أي تصيير.
 *     المسارات المستثناة يحددها `isMaintenanceBypassedPath` وحده (لوحة التحكم،
 *     بوابة المتعهدين، `/api`، الأصول الثابتة وملفات السيو) — كسرها يعني
 *     إقفال الباب على من يُفترض أن يُطفئ الوضع من الداخل. وحامل كوكي جلسة
 *     Supabase يتصفح الموقع العام عادياً ما دام `allowAdmin` مفعّلاً، فيرى
 *     الفريق أثر عمله أثناء الصيانة.
 *
 * (٢) التحويلات (المرحلة ١٠): جدول `redirects` يديره المالك من
 *     `/admin/seo/redirects`. موضعها هنا — **بعد الصيانة وقبل اللغة** — مقصود:
 *       • بعد الصيانة: أثناء الصيانة لا يُحوَّل أحد إلى صفحة سيراها ٥٠٣ أصلاً،
 *         ويبقى قرار «الموقع مغلق» أول قرار في السلسلة كما كان.
 *       • قبل `canonicalLocalePath`: تلك الدالة تُنهي الطلب بـ ٣٠٨. فلو جاءت
 *         التحويلات بعدها لأخذ رابط قديم بصيغة `/EN/old-page` قفزتين
 *         (٣٠٨ ثم ٣٠١). ودالة `resolveRedirect` تقشر البادئة بنفسها وتعيد
 *         تركيبها بالشكل القانوني عبر `localePath` — فالنتيجة قفزة واحدة إلى
 *         عنوان قانوني، والزائر لا يفقد لغته.
 *     ولا تلمس `/admin` ولا `/portal` ولا `/api` ولا `/_next` ولا الأصول
 *     (`isRedirectBypassedPath` داخل `lib/seo/redirects.ts`)، والقراءة مُذاكَرة
 *     داخل العملية بمهلة قصيرة — لا استعلام قاعدة على كل طلب — والفشل آمن:
 *     أي خطأ = لا تحويل.
 *
 * (٣) اللغة (المرحلة ٨): قشر بادئة اللغة وإعادة كتابة داخلية — تفصيلها أدناه.
 *     تقع **بعد** الصيانة كي لا يتسلل أحد من صفحة الصيانة ببادئة لغة، و**قبل**
 *     حارس اللوحة لأنها لا تلمس `/admin` أصلاً.
 *
 * (٤) حارس مسارات الإدارة `/admin/**` — سلوكه لم يتغيّر:
 *     - `/admin/login` و`/admin/set-password` مفتوحتان دائماً (صفحة الدخول
 *       نفسها، وزائر رابط الدعوة يصل بتوكن قبل أن تكون له جلسة كوكيز).
 *     - عند غياب متغيرات Supabase نسمح بالمرور (وضع التطوير قبل ربط القاعدة).
 *     - عند وجودها: تحقق عبر `getUser()` (نمط @supabase/ssr الرسمي مع
 *       getAll/setAll لتجديد الجلسة)، وغير المسجل يُعاد توجيهه للدخول.
 *     الفحص يقع على **المسار الأصلي** لا على ناتج إعادة الكتابة — وهذا شرط
 *     أمني: لولاه لصار `/en/admin` طريقاً حول الحارس.
 *
 * ما عدا ذلك يمر كما هو. وقراءتا الشبكة الوحيدتان على مسار الصفحة العامة —
 * حالة الصيانة وجدول التحويلات — كلتاهما REST مباشر بمفتاح anon ومُذاكَر داخل
 * العملية بمهلة قصيرة، فالطلب المعتاد لا ينتظر شبكة، وفشل أيّهما لا يوقف الموقع.
 * لا SDK لـ Supabase يُحمَّل هنا إلا في حارس اللوحة وحده.
 */
export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // ── (١) وضع الصيانة — قبل أي شيء آخر، وللمسارات العامة وحدها ─────────────
  if (!isMaintenanceBypassedPath(pathname)) {
    const state = await fetchMaintenanceState();

    if (state.maintenance.enabled) {
      // بوابة تجربة لا بوابة أمان: وجود كوكي الجلسة يكفي لتخطي صفحة الصيانة،
      // والتحقق الحقيقي من الدور يبقى في RLS وفي حارس /admin أدناه.
      const teamPreview =
        state.maintenance.allowAdmin &&
        hasSupabaseSessionCookie(request.cookies.getAll().map((cookie) => cookie.name));

      if (!teamPreview) return maintenanceResponse(state);
    }
  }

  // ── (٢) التحويلات — قبل تقنين اللغة كي تبقى القفزة واحدة ─────────────────
  // فحص الاستثناء **قبل** `fetchRedirects` لا بعده: مسارات `/api` و`/admin`
  // و`/portal` والأصول تمر كلها من هنا (الـ matcher واسع)، فلا يجوز أن ينتظر
  // نداء API قراءةَ جدول لا تعنيه أصلاً. و`resolveRedirect` تعيد الفحص داخلها
  // بوصفه حاجزاً ثانياً لا بديلاً عن هذا.
  if (!isRedirectBypassedPath(pathname)) {
    const hit = resolveRedirect(pathname, await fetchRedirects());
    if (hit) {
      // هدف خارج الموقع (`https://…`): يُبنى عنواناً كاملاً ولا يُوضع في
      // `nextUrl.pathname` أبداً — وضعُه هناك كان يُنتج `/https:/host/x` على
      // نطاقنا نفسه، أي ٤٠٤ دائمة بدل التحويل الذي يجيزه قيد الجدول صراحةً.
      if (hit.absoluteUrl !== null) {
        return NextResponse.redirect(new URL(hit.absoluteUrl), hit.status);
      }

      const target = request.nextUrl.clone();
      target.pathname = hit.pathname;
      // وجهة بسلسلة استعلام خاصة تُلغي سلسلة الزائر؛ وبدونها تُحمل كما هي
      if (hit.search !== "") target.search = hit.search;
      return NextResponse.redirect(target, hit.status);
    }
  }

  /* ── (٣) اللغة — بادئة «عند الحاجة» بلا مقطع [locale] في شجرة app ────────
   *
   * العربية بلا بادئة (القاعدة ١): `/services/x` تبقى حرفاً بحرف. الإنجليزية
   * على `/en/services/x` وتُعاد كتابتها داخلياً إلى `/services/x` — فالصفحة
   * الخادمية واحدة، واللغة تصل إليها في ترويسة `x-locale`. لا نسخة ثانية من
   * الشجرة، ولا رابط عربي واحد تغيّر.
   *
   * `/admin` و`/portal` و`/api` والأصول الثابتة خارج هذا كله (القاعدة ٢):
   * `isLocaleBypassedPath` يخرجها قبل أي فحص. وحين تكون البادئة صحيحة لكن
   * الباقي مسار محجوب — `/en/admin` — لا نقشر ولا نعيد الكتابة، فينتهي الطلب
   * إلى ٤٠٤ سليم بدل أن يتسلل إلى اللوحة من خلف الحارس.
   *
   * `/ar/...` تحويل دائم (٣٠٨) إلى الشكل الأصيل بلا بادئة: عنوان واحد لكل
   * صفحة عربية، فلا محتوى مكرر يقسم وزن الصفحة في نتائج البحث.
   */
  let locale = DEFAULT_LOCALE;
  let localePathname = pathname;
  let rewriteTo: URL | null = null;

  if (!isLocaleBypassedPath(pathname)) {
    // شكل واحد قانوني لكل عنوان: `/ar/x` و`/EN/x` و`/en/x/` كلها تُحوَّل ٣٠٨
    // إلى صورتها الوحيدة. بدونه يُخدَم المحتوى نفسه على عناوين متعددة فينقسم
    // وزن الصفحة في نتائج البحث — وهو ما تفاديناه أصلاً بإبقاء العربية بلا بادئة.
    const canonical = canonicalLocalePath(pathname);
    if (canonical) {
      const target = request.nextUrl.clone();
      target.pathname = canonical;
      return NextResponse.redirect(target, 308);
    }

    const split = splitLocale(pathname);

    if (
      split.prefix !== null &&
      split.prefix !== DEFAULT_LOCALE &&
      !isLocaleBypassedPath(split.pathname)
    ) {
      locale = split.prefix;
      localePathname = split.pathname;
      rewriteTo = request.nextUrl.clone();
      rewriteTo.pathname = split.pathname;
    }
  }

  // المسار يُمرَّر في ترويسة يقرؤها `app/admin/layout.tsx` كطبقة حراسة ثانية —
  // وهو **المسار الأصلي** دائماً، بلا أي أثر لقشر اللغة.
  const withPath = new Headers(request.headers);
  withPath.set("x-pathname", pathname);
  withPath.set(LOCALE_HEADER, locale);
  withPath.set(LOCALE_PATH_HEADER, `${localePathname}${request.nextUrl.search}`);

  const pass = () =>
    rewriteTo
      ? NextResponse.rewrite(rewriteTo, { request: { headers: withPath } })
      : NextResponse.next({ request: { headers: withPath } });

  // ── (٤) حارس اللوحة — كل ما دون /admin يمر بلا أي استدعاء ────────────────
  if (!pathname.startsWith("/admin")) {
    return pass();
  }

  if (
    pathname === "/admin/login" ||
    pathname.startsWith("/admin/login/") ||
    pathname === "/admin/set-password" ||
    pathname.startsWith("/admin/set-password/")
  ) {
    return pass();
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  // وضع التطوير: قاعدة البيانات غير مربوطة بعد — لا حماية حتى لا تُقفل اللوحة
  if (!url || !anonKey) {
    return pass();
  }

  let response = NextResponse.next({ request: { headers: withPath } });

  const supabase = createServerClient(url, anonKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
        response = NextResponse.next({ request: { headers: withPath } });
        cookiesToSet.forEach(({ name, value, options }) =>
          response.cookies.set(name, value, options)
        );
      },
    },
  });

  // لا تضع أي كود بين إنشاء العميل و getUser() — نمط Supabase الموثق لتجديد الجلسة
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    const loginUrl = request.nextUrl.clone();
    loginUrl.pathname = "/admin/login";
    loginUrl.search = "";
    return NextResponse.redirect(loginUrl);
  }

  // حارس الدور (المرحلة ٥): «وجود جلسة» لم يعد كافياً بعد ظهور حسابات
  // المتعهدين — المتعهد الذي يفتح /admin كان يرى شاشة الهامش وملفه الإداري
  // بملاحظات الإدارة الخاصة عنه. الدور يُقرأ من قاعدة البيانات لا من الكوكي.
  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .maybeSingle();

  if (profile?.role !== "admin" && profile?.role !== "ops") {
    const target = request.nextUrl.clone();
    target.pathname = profile?.role === "subcontractor" ? "/portal" : "/";
    target.search = "";
    return NextResponse.redirect(target);
  }

  return response;
}

/**
 * كل الطلبات تمر من هنا عدا أصول البناء والأيقونة — لأن وضع الصيانة يجب أن
 * يسبق تصيير أي صفحة عامة. استثناء `_next/static` و`_next/image` من الـ matcher
 * نفسه (لا من الدالة) يوفّر استدعاء وسيط على كل ملف JS/CSS/صورة.
 */
export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
