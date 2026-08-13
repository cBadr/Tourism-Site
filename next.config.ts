import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";

/**
 * إضافة next-intl تربط `i18n/request.ts` بالإطار (المسار الافتراضي للإضافة).
 * وحدها الضرورة التي تستدعي لمس هذا الملف — لا توجيه لغوي هنا:
 * التوجيه كله في `proxy.ts` كي تبقى العربية بلا بادئة (القاعدة ١).
 */
const withNextIntl = createNextIntlPlugin();

const nextConfig: NextConfig = {
  /* config options here */
};

export default withNextIntl(nextConfig);
