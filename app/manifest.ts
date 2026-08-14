import type { MetadataRoute } from "next";
import { getSettings } from "@/lib/settings";
import { getActiveLocaleDef } from "@/i18n/server";

/**
 * Web App Manifest — يعتمد على إعدادات العلامة (whitelabel).
 * ملاحظة: الألوان هنا قيم hex ثابتة معقولة لأن ملف manifest
 * لا يستطيع قراءة متغيرات CSS بصيغة oklch المحقونة في الجذر.
 *
 * ── اللغة والاتجاه: من اللغة الفعالة لا من حرفٍ مكتوب ───────────────────────
 * كانا `"ar"` و`"rtl"` محفورين، وهو إعلان كاذب لحظة تثبيت زائر إنجليزي التطبيق:
 * يُثبَّت باسم عربي واتجاه معكوس. المصدر الآن هو `getActiveLocaleDef()` نفسه
 * الذي يبني به `app/layout.tsx` سمتَي `<html lang dir>` — مصدر واحد لا اثنان.
 *
 * ⚠ ويبقى نصف الإصلاح خارج هذا الملف: `/manifest.webmanifest` مذكور في
 * `LOCALE_BYPASS_EXACT` فلا يقشر له الوسيط بادئة لغة، ويصله `x-locale` بالعربية
 * دائماً. فالملف اليوم عربي كما كان حرفاً بحرف، ويتبع اللغة لحظة تُخدَم نسخة
 * لكل لغة (رابط manifest مخصوص في الترويسة) — ولا يحتاج حينها تعديلاً هنا.
 */
export default async function manifest(): Promise<MetadataRoute.Manifest> {
  const [settings, locale] = await Promise.all([getSettings(), getActiveLocaleDef()]);

  return {
    name: settings.brand.name,
    short_name: settings.brand.name,
    description: settings.seo.defaultDescription,
    lang: locale.htmlLang,
    dir: locale.dir,
    start_url: "/",
    display: "standalone",
    background_color: "#ffffff",
    theme_color: "#1e40af",
    icons: [
      {
        src: "/favicon.ico",
        sizes: "any",
        type: "image/x-icon",
      },
    ],
  };
}
