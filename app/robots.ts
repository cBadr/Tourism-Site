import type { MetadataRoute } from "next";
import { getBaseUrl } from "@/lib/seo";

/** robots.txt — نسمح بالزحف للموقع العام ونحجب لوحات الإدارة وبوابة المقاولين */
export default function robots(): MetadataRoute.Robots {
  const baseUrl = getBaseUrl();

  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        disallow: ["/admin", "/portal"],
      },
    ],
    sitemap: `${baseUrl}/sitemap.xml`,
  };
}
