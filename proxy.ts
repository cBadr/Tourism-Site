import { createServerClient, type CookieOptions } from "@supabase/ssr";
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
 *     إقفال الباب على من يُفترض أن يُطفئ الوضع من الداخل. و**من كان دوره في
 *     `profiles` من الفريق** يتصفح الموقع العام عادياً ما دام `allowAdmin`
 *     مفعّلاً، فيرى أثر عمله أثناء الصيانة. وكان الشرط قبل المرحلة ١٢ب مجرّد
 *     وجود كوكي باسم جلسة Supabase — فسقط يوم صار كل عميل `authenticated`
 *     (وكان يسقط قبلها بكوكي ملفَّق أصلاً؛ التفصيل عند الفحص نفسه أدناه).
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
/** الأدوار التي تعني «من الفريق» في سياق معاينة الصيانة — ولا رابع لها */
const TEAM_ROLES: ReadonlySet<string> = new Set(["admin", "ops", "subcontractor"]);

/**
 * هل صاحب هذا الطلب من الفريق فعلاً؟ — **جلسة مُتحقَّق منها ودورٌ من القاعدة**.
 *
 * لا يُقرأ الدور من الكوكي بحال: حمولة JWT تقول `role: authenticated` لكل
 * مستخدم — للعميل والمتعهد والمشرف سواء — فالدور الحقيقي في `profiles` وحده،
 * وهو نفس مصدرِ حارس `/admin` أسفل هذا الملف.
 *
 * **ويفشل مغلقاً**: بلا متغيرات بيئة، أو بجلسة لا تُقرأ، أو بخطأ شبكة ⇒ «ليس من
 * الفريق» ⇒ صفحة الصيانة. وهذا الاتجاه الصحيح للفشل هنا تحديداً: من يُفترض أن
 * يُطفئ الوضع يدخل من `/admin` وهو **مستثنى** من الصيانة أصلاً، فلا يُقفل أحد
 * على نفسه بهذا التشدّد.
 */
async function isTeamSession(
  request: NextRequest,
  sink: { name: string; value: string; options: CookieOptions }[]
): Promise<boolean> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anonKey) return false;

  try {
    const supabase = createServerClient(url, anonKey, {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          // التوكن المُجدَّد يُجمَع هنا ويُكتب على الاستجابة أياً كانت — إسقاطه
          // يترك المتصفح بتوكنٍ مُبطَل، أي خروجاً مفاجئاً بعد انتهاء الصيانة.
          for (const cookie of cookiesToSet) {
            request.cookies.set(cookie.name, cookie.value);
            sink.push(cookie);
          }
        },
      },
    });

    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return false;

    const { data: profile } = await supabase
      .from("profiles")
      .select("role")
      .eq("id", user.id)
      .maybeSingle();

    return typeof profile?.role === "string" && TEAM_ROLES.has(profile.role);
  } catch {
    return false;
  }
}

/** يحمل كوكيز التجديد على استجابة جاهزة (٥٠٣ الصيانة) بلا لمس جسمها ولا حالتها */
function withCookies(
  response: Response,
  cookies: { name: string; value: string; options: CookieOptions }[]
): Response {
  if (cookies.length === 0) return response;
  const carried = new NextResponse(response.body, response);
  for (const { name, value, options } of cookies) carried.cookies.set(name, value, options);
  return carried;
}

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  /**
   * كوكيز تجديد الجلسة التي قد يكتبها فحص المعاينة أدناه — تُحمل على أي استجابة
   * نُرجعها. وبدون حملها يُسقَط التوكن المُجدَّد، فيبقى لدى المتصفح توكنٌ مُبطَل
   * ⇒ خروجٌ مفاجئ لمن تصفّح أثناء الصيانة. وهي فارغة في كل طلب لا يمرّ بالفحص.
   */
  const sessionRefresh: { name: string; value: string; options: CookieOptions }[] = [];

  // ── (١) وضع الصيانة — قبل أي شيء آخر، وللمسارات العامة وحدها ─────────────
  if (!isMaintenanceBypassedPath(pathname)) {
    const state = await fetchMaintenanceState();

    if (state.maintenance.enabled) {
      /**
       * 🔒 **تصحيح المرحلة ١٢ب — وقد قِيس حياً قبل كتابته وبعده.**
       *
       * كان الفحص هنا **وجودَ كوكي باسمٍ يطابق النمط** لا أكثر، بحجّة أنها
       * «بوابة تجربة لا بوابة أمان». وكان ذلك محتملاً ما دام كل صاحب جلسة في
       * النظام موظفاً أو متعهداً (**D-20**). و١٢ب تنقض هذه المقدّمة نصّاً: كل
       * زائر يملأ نموذج تسجيل يصير `authenticated` — أي أن **كل عميل** يتخطّى
       * صفحة الصيانة، وهي الشاشة التي يُفترض أنها تحجب الزوار وحدهم.
       *
       * والقياس أظهر ما هو أوسع: طلبٌ يحمل
       * `sb-abcdefghijklmnop-auth-token=fake-value-not-a-real-jwt` — قيمةٌ
       * ملفَّقة بالكامل — رجع **٢٠٠** بينما رجع الزائر بلا كوكي **٥٠٣**. أي أن
       * التخطّي لم يكن يحتاج حساباً أصلاً، بل سطراً واحداً في أدوات المطوّر.
       *
       * فالفحص الآن على **الدور المقروء من القاعدة** بجلسةٍ مُتحقَّق منها، وهو
       * ما يجعل «الفريق» تعني الفريق. والترتيب يحفظ الكلفة: النمط الرخيص أولاً،
       * فلا يدفع زائرُ الصيانة العادي أي نداء شبكة، والنداء لا يقع إلا حين يكون
       * وضع الصيانة **مفعّلاً** ومع الطلب كوكي — وهي حالة نادرة بطبيعتها.
       */
      const teamPreview =
        state.maintenance.allowAdmin &&
        hasSupabaseSessionCookie(request.cookies.getAll().map((cookie) => cookie.name)) &&
        (await isTeamSession(request, sessionRefresh));

      if (!teamPreview) return withCookies(maintenanceResponse(state), sessionRefresh);
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

  const pass = () => {
    const response = rewriteTo
      ? NextResponse.rewrite(rewriteTo, { request: { headers: withPath } })
      : NextResponse.next({ request: { headers: withPath } });
    // فارغة في كل طلب لم يمرّ بفحص معاينة الصيانة — أي في كل طلب تقريباً
    for (const { name, value, options } of sessionRefresh) {
      response.cookies.set(name, value, options);
    }
    return response;
  };

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
