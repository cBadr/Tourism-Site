import type { MetadataRoute } from "next";
import { getSettings } from "@/lib/settings";

/**
 * Web App Manifest — يعتمد على إعدادات العلامة (whitelabel).
 * ملاحظة: الألوان هنا قيم hex ثابتة معقولة لأن ملف manifest
 * لا يستطيع قراءة متغيرات CSS بصيغة oklch المحقونة في الجذر.
 */
export default async function manifest(): Promise<MetadataRoute.Manifest> {
  const settings = await getSettings();

  return {
    name: settings.brand.name,
    short_name: settings.brand.name,
    description: settings.seo.defaultDescription,
    lang: "ar",
    dir: "rtl",
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
