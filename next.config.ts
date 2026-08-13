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

const nextConfig: NextConfig = {
  ...(standalone ? { output: "standalone" as const } : {}),
  ...(actionOrigins.length > 0
    ? { experimental: { serverActions: { allowedOrigins: actionOrigins } } }
    : {}),
};

export default withNextIntl(nextConfig);
