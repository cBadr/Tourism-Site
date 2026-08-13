import { headers } from "next/headers";
import Script from "next/script";

import { splitLocale } from "@/i18n/config";
import { normalizeIntegrations, resolveIntegration } from "@/lib/analytics/services";
import { getSettings } from "@/lib/settings";

/**
 * حقن وسوم القياس في الصفحة العامة — مكوّن خادمي يُركَّب مرة في `app/layout.tsx`.
 *
 * ── القرار ٧ في موجز المرحلة، حرفياً ────────────────────────────────────────
 * **لا وسم يُحقن إن كانت الخدمة `enabled: false` أو `id: null`.** والنتيجة
 * العملية: موقع لم يُربط بأي خدمة يخرج من هنا بصفر سكربت وصفر طلب لجهة خارجية
 * — لا «سكربت فارغ» ولا `<script>` بلا معرّف. المكوّن يرجع `null` كاملاً.
 *
 * ── لماذا يُعاد التحقق من الصيغة هنا ───────────────────────────────────────
 * `saveIntegrations` ترفض المعرّف الخاطئ قبل الحفظ، لكن مفتاح `integrations`
 * صفٌّ في `site_settings` قد يُحرَّر من SQL Editor أو يُستورد من نسخة whitelabel
 * أخرى. `resolveIntegration` تفحص النمط مرة ثانية قبل الحقن، وكل الأنماط
 * المقبولة محصورة في حروف وأرقام وشرطات — فلا اقتباس ولا `<` يبلغ سكربتاً
 * سطرياً أصلاً. و`js()` أدناه طبقة ثالثة على نمط `components/seo/JsonLd.tsx`.
 *
 * ── 🔒 الموقع العام وحده — ولا سطر قياس في اللوحة ولا في البورتال ──────────
 * `app/layout.tsx` هو **الجذر الوحيد** في المشروع: لا `<html>` في
 * `app/admin/layout.tsx` ولا في `app/portal/layout.tsx`، فكل شاشة إدارية أو
 * بورتالية تُصيَّر داخله. وحقنُ الوسوم بلا فحص مسار كان يعني أن فتح
 * `/admin/orders/<id>` يرفع إلى مايكروسوفت **إعادة تشغيل جلسة** فيها اسم
 * العميل ورقمه وعنوان الالتقاط وتكلفة المتعهد وهامش الموقع، ويرسل عنوان
 * الصفحة (وفيه معرّف الحجز) إلى جوجل وميتا. هذا نقض حرفي للقاعدة الثالثة في
 * `lib/analytics-types.ts` وللقرار ٦ في موجز المرحلة.
 *
 * فالمكوّن يقرأ `x-pathname` (يضبطها `proxy.ts` لكل طلب بالمسار **الأصلي**)
 * و**يفشل مغلقاً**: لا ترويسة ⇒ لا وسم. الأمان قبل القياس، وغياب الترويسة لا
 * يقع أصلاً لأن الـ matcher في `proxy.ts` يشمل كل طلب صفحة.
 * وبادئة اللغة تُقشر قبل الفحص كي لا يصير `/en/admin` ثغرة في الحارس.
 *
 * ── ما لا يفعله هذا الملف ──────────────────────────────────────────────────
 * وسما التحقق (Search Console وBing) **ليسا هنا**: مكانهما `<head>` عبر
 * `metadata.verification` في `app/layout.tsx` — واجهة Next الرسمية، ولا يوجد
 * في هذا المشروع وسم `<head>` مكتوب بيد.
 *
 * ⚠ الحقن ≠ العمل: مانع الإعلانات في متصفح الزائر يُسقط `googletagmanager.com`
 * و`connect.facebook.net` صامتاً والصفحة تُصيَّر سليمة. لذلك أرقام اللوحة تُبنى
 * على جدول `funnel_events` من قاعدتنا لا على هذه الوسوم (القرار ٥).
 */

/** حصانة الحقن — نفس أسلوب `components/seo/JsonLd.tsx` */
const js = (value: string) => JSON.stringify(value).replace(/</g, "\\u003c");

/**
 * الأسطح التي **لا** يُقاس فيها شيء أبداً: اللوحة والبورتال وواجهات الـ API.
 * القائمة مطابقة عمداً لاستثناءات `isLocaleBypassedPath` و`isRedirectBypassedPath`.
 */
const UNMEASURED_PREFIXES = ["/admin", "/portal", "/api"] as const;

/** هل هذا المسار صفحة عامة يجوز قياسها؟ **يفشل مغلقاً** أمام أي مُدخل مشبوه */
export function isMeasurableSurface(pathname: string | null | undefined): boolean {
  if (typeof pathname !== "string") return false;
  const raw = pathname.trim();
  if (!raw.startsWith("/")) return false;

  // بادئة اللغة تُقشر أولاً: `/en/admin` سطح إداري مهما كانت بادئته
  const split = splitLocale(raw);
  const base = split.prefix === null ? raw : split.pathname;

  return !UNMEASURED_PREFIXES.some(
    (prefix) => base === prefix || base.startsWith(`${prefix}/`)
  );
}

export async function AnalyticsTags() {
  // 🔒 الحارس قبل أي قراءة إعدادات: سطح غير عام ⇒ صفر سكربت وصفر طلب خارجي
  const headerList = await headers();
  if (!isMeasurableSurface(headerList.get("x-pathname"))) return null;

  const settings = await getSettings();
  const integrations = normalizeIntegrations(settings.integrations);

  const ga4 = resolveIntegration("ga4", integrations.ga4).id;
  const gtm = resolveIntegration("gtm", integrations.gtm).id;
  const pixel = resolveIntegration("metaPixel", integrations.metaPixel).id;
  const clarity = resolveIntegration("clarity", integrations.clarity).id;

  // صفحة نظيفة بالكامل حين لا خدمة مضبوطة ومفعّلة
  if (!ga4 && !gtm && !pixel && !clarity) return null;

  return (
    <>
      {gtm ? (
        <>
          <Script id="gtm-loader" strategy="afterInteractive">
            {`(function(w,d,s,l,i){w[l]=w[l]||[];w[l].push({'gtm.start':new Date().getTime(),event:'gtm.js'});var f=d.getElementsByTagName(s)[0],j=d.createElement(s),dl=l!='dataLayer'?'&l='+l:'';j.async=true;j.src='https://www.googletagmanager.com/gtm.js?id='+i+dl;f.parentNode.insertBefore(j,f);})(window,document,'script','dataLayer',${js(gtm)});`}
          </Script>
          {/* الاحتياطي لمن عطّل الجافاسكربت — لا يُطلب إطلاقاً والجافاسكربت يعمل */}
          <noscript>
            <iframe
              src={`https://www.googletagmanager.com/ns.html?id=${encodeURIComponent(gtm)}`}
              height="0"
              width="0"
              style={{ display: "none", visibility: "hidden" }}
              title="Google Tag Manager"
            />
          </noscript>
        </>
      ) : null}

      {ga4 ? (
        <>
          <Script
            id="ga4-loader"
            src={`https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(ga4)}`}
            strategy="afterInteractive"
          />
          <Script id="ga4-init" strategy="afterInteractive">
            {`window.dataLayer = window.dataLayer || [];
function gtag(){dataLayer.push(arguments);}
gtag('js', new Date());
gtag('config', ${js(ga4)});`}
          </Script>
        </>
      ) : null}

      {pixel ? (
        <>
          <Script id="meta-pixel" strategy="afterInteractive">
            {`!function(f,b,e,v,n,t,s){if(f.fbq)return;n=f.fbq=function(){n.callMethod?n.callMethod.apply(n,arguments):n.queue.push(arguments)};if(!f._fbq)f._fbq=n;n.push=n;n.loaded=!0;n.version='2.0';n.queue=[];t=b.createElement(e);t.async=!0;t.src=v;s=b.getElementsByTagName(e)[0];s.parentNode.insertBefore(t,s)}(window,document,'script','https://connect.facebook.net/en_US/fbevents.js');
fbq('init', ${js(pixel)});
fbq('track', 'PageView');`}
          </Script>
          <noscript>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              height="1"
              width="1"
              style={{ display: "none" }}
              alt=""
              src={`https://www.facebook.com/tr?id=${encodeURIComponent(pixel)}&ev=PageView&noscript=1`}
            />
          </noscript>
        </>
      ) : null}

      {clarity ? (
        <Script id="ms-clarity" strategy="afterInteractive">
          {`(function(c,l,a,r,i,t,y){c[a]=c[a]||function(){(c[a].q=c[a].q||[]).push(arguments)};t=l.createElement(r);t.async=1;t.src="https://www.clarity.ms/tag/"+i;y=l.getElementsByTagName(r)[0];y.parentNode.insertBefore(t,y);})(window,document,"clarity","script",${js(clarity)});`}
        </Script>
      ) : null}
    </>
  );
}
