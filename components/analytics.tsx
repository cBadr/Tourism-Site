import Script from "next/script";

/**
 * Google Analytics 4 — يُفعَّل تلقائياً عند ضبط NEXT_PUBLIC_GA_ID في البيئة
 * (معرّف بصيغة G-XXXXXXXXXX). بدونه لا يُحمَّل أي سكربت.
 * الربط الكامل متعدد الخدمات (GTM/Meta/Clarity) يأتي في المرحلة ١٠ من اللوحة.
 */
export function Analytics() {
  const gaId = process.env.NEXT_PUBLIC_GA_ID;
  if (!gaId) return null;

  return (
    <>
      <Script src={`https://www.googletagmanager.com/gtag/js?id=${gaId}`} strategy="afterInteractive" />
      <Script id="ga4-init" strategy="afterInteractive">
        {`window.dataLayer = window.dataLayer || [];
function gtag(){dataLayer.push(arguments);}
gtag('js', new Date());
gtag('config', '${gaId}');`}
      </Script>
    </>
  );
}
