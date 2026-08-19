import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";

/**
 * إضافة next-intl تربط `i18n/request.ts` بالإطار (المسار الافتراضي للإضافة).
 * وحدها الضرورة التي تستدعي لمس هذا الملف — لا توجيه لغوي هنا:
 * التوجيه كله في `proxy.ts` كي تبقى العربية بلا بادئة (القاعدة ١).
 */
const withNextIntl = createNextIntlPlugin();

/**
 * ── مفتاحان للاستضافة الذاتية (cPanel وأمثاله) — **خاملان افتراضياً** ────────
 *
 * كلاهما مطفأ ما لم يُضبط متغيّره في البيئة، فلا يتغير شيء في التطوير ولا على
 * Vercel. الدليل الكامل: `docs/CPANEL.md`.
 *
 * (١) `BUILD_STANDALONE=1` ⇒ ‏`output: "standalone"`: يُخرج Next خادمه الإنتاجي
 *     المصغّر في `.next/standalone/server.js` ومعه ما يلزمه من `node_modules`.
 *     وهو المطلوب حين يشغّل المستضيف **ملفاً** لا أمراً (‏Passenger في cPanel)،
 *     وهو خادم Next نفسه — فيعمل `proxy.ts` بلا أي إعداد، بخلاف الخادم المخصّص.
 *
 * (٢) `SERVER_ACTION_ORIGINS` ⇒ ‏`serverActions.allowedOrigins`: خلف وكيل عكسي
 *     قد تختلف ترويسة `Origin` عن `Host`، وServer Actions تقارنهما وتُجهض الطلب
 *     عند الاختلاف (حماية CSRF مقصودة). هذا المتغيّر يعلن النطاق الآمن —
 *     ولا يُضبط إلا عند ظهور «Invalid Server Actions request» فعلاً.
 */
const standalone = process.env.BUILD_STANDALONE === "1";

const actionOrigins = (process.env.SERVER_ACTION_ORIGINS ?? "")
  .split(",")
  .map((origin) => origin.trim())
  .filter((origin) => origin.length > 0);

/**
 * ── مضيف التخزين البعيد — مشتقٌّ من البيئة لا مكتوباً ────────────────────────
 *
 * صور اللوحة تُرفع إلى دلو `media` في Supabase وتُقدَّم من مضيف المشروع.
 * و`next/image` يرفض أي مصدر بعيد غير معلَن بـ400، فالإعلان ضرورة لا احتياط.
 *
 * ولماذا من `NEXT_PUBLIC_SUPABASE_URL` لا نصّاً: القاعدة الخامسة في «ما يجب ألا
 * تكسره» — لا هوية محفورة. النسخة الثانية من الـwhite-label لها مشروعٌ آخر،
 * ومضيفٌ مكتوب هنا كان سيجعل صورها كلها ٤٠٠ بلا رسالة مفهومة.
 * وهو **أضيق** من `**.supabase.co`: مشروع هذا التثبيت وحده، ومسار الملفات
 * العامة وحده — فلا يصير محسّن الصور وكيلاً لأي مشروع Supabase في العالم.
 */
function storageHost(): string | null {
  const raw = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  if (!raw) return null;
  try {
    return new URL(raw).hostname;
  } catch {
    return null;
  }
}

const mediaHost = storageHost();

/**
 * ── ترويسات الأمن — مقيسٌ غيابُها على الإنتاج 2026-08-19 ────────────────────
 *
 * `curl -D -` على `https://rentlimousine.duckdns.org/` أعاد `Server: nginx/1.24.0`
 * و`X-Powered-By: Next.js` **ولا ترويسةَ أمنٍ واحدة**. وأثقلُ ما يفتحه ذلك اثنان:
 *
 * 🔴 **`Referrer-Policy`**: صفحةُ متابعة الحجز مسارُها يحمل `public_token`، وهو
 *    سرُّ الوصول إليها. وبلا سياسةٍ يرسل المتصفح المسار كاملاً في `Referer` إلى
 *    كل مضيفٍ خارجيّ تُفتح رابطُه من الصفحة — فيتسرّب التوكن إلى سجلّ طرفٍ ثالث.
 *    و`strict-origin-when-cross-origin` تُرسل الأصل وحده عبر النطاقات.
 *
 * 🔴 **`X-Frame-Options`**: صفحةُ الحجز تُدخل فيها بيانات، وقابليةُ تأطيرها في
 *    موقعٍ خبيث هي clickjacking بعينه. و`frame-ancestors 'none'` أحدثُ منها لكن
 *    الترويسةَ القديمة ما زالت تُحترم في متصفحاتٍ لا تقرأ CSP كاملاً، فتُكتبان معاً.
 *
 * و`HSTS` بسنةٍ وشمولِ النطاقات الفرعية: أولُ طلبٍ على شبكةٍ عامة بعد زيارةٍ واحدة
 * لا يقبل التنزيل إلى HTTP. **ولا `preload`** — إدراجُ النطاق في قائمة المتصفحات
 * قرارٌ لا رجعةَ فيه عملياً، وهو قرارُ المالك لا قرارُ ملفِّ إعداد.
 *
 * ⚠ ولا `Content-Security-Policy` هنا: النصوصُ السطرية التي يولّدها Next تحتاج
 *    `nonce` يُمرَّر من الوسيط، وسياسةٌ مكتوبةٌ على عجل تكسر الصفحة أو تُكتب
 *    `unsafe-inline` فتصير زينة. تُبنى في مرحلتها بقياسٍ لا بحدس.
 */
const SECURITY_HEADERS = [
  { key: "Strict-Transport-Security", value: "max-age=31536000; includeSubDomains" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Content-Security-Policy", value: "frame-ancestors 'none'" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(self), payment=()" },
];

const nextConfig: NextConfig = {
  ...(standalone ? { output: "standalone" as const } : {}),

  /** بصمةٌ مجانية للماسحات، ولا تفيد أحداً — تُطفأ */
  poweredByHeader: false,

  async headers() {
    return [{ source: "/:path*", headers: SECURITY_HEADERS }];
  },
  ...(actionOrigins.length > 0
    ? { experimental: { serverActions: { allowedOrigins: actionOrigins } } }
    : {}),

  /**
   * ── الصور (م‑٣) ────────────────────────────────────────────────────────────
   *
   * أصول التصميم مخزَّنة AVIF في `public/img/` بمقاساتٍ حقيقية (٤٫٤٣ م.ب ⇐
   * ‏٧٦٧ ك.ب)، و`next/image` يعيد تحجيمها لكل شاشة عند الطلب.
   */
  images: {
    /**
     * AVIF أولاً وWebP احتياطاً. الترتيب هو الأفضلية: أول تطابق مع ترويسة
     * `Accept` يفوز. ومن لا يدعم AVIF يأخذ WebP — فسلسلة الاحتياط سليمة رغم
     * أن **الأصل** المخزَّن نفسه AVIF (‏sharp يفكّه ويعيد ترميزه).
     */
    formats: ["image/avif", "image/webp"],

    /**
     * ⚠ حقلٌ **إلزامي** في Next 16: ما ليس في القائمة يُرفض بـ400.
     * ٧٥ هو الافتراضي حين لا تمرّر العارضة `quality`، والباقي للأصول التي
     * سبق ضغطها في المصدر فلا تحتاج إعادة ترميزٍ سخيّة.
     */
    qualities: [45, 55, 65, 75],

    /**
     * أعرض أصلٍ مخزَّن ١٦٠٠ بكسل (صورة البطل)، فطلب ٢٠٤٨ أو ٣٨٤٠ يُنتج نسخةً
     * مطابقة للأصل بالضبط — كلفة ترميزٍ وتخزينٍ بلا بكسل واحد إضافي. القائمة
     * تقف عند ١٩٢٠ لهذا السبب لا تقشّفاً.
     */
    deviceSizes: [640, 750, 828, 1080, 1200, 1920],

    /**
     * لا `minimumCacheTTL` مرتفع بقصد: لا آلية إبطال للذاكرة المخبّأة في
     * Next، ومكتبة الوسائط (القرار ٢٤) تتيح للمالك استبدال صورةٍ **بنفس
     * الاسم** — فعمرٌ طويل كان سيعني صورةً قديمة تُقدَّم شهراً بعد تبديلها.
     * والافتراضي (٤ ساعات) مع القرص المخبّأ كافٍ.
     */

    ...(mediaHost
      ? {
          remotePatterns: [
            {
              protocol: "https" as const,
              hostname: mediaHost,
              pathname: "/storage/v1/object/public/**",
              search: "",
            },
          ],
        }
      : {}),
  },
};

export default withNextIntl(nextConfig);
