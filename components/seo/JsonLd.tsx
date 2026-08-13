import { getSettings } from "@/lib/settings";
import { getBaseUrl } from "@/lib/seo";
import { SERVICES } from "@/lib/site-config";

/**
 * البيانات المنظمة (JSON-LD) — مكوّن خادمي يُدرج وسم <script> واحداً
 * يحوي @graph فيه: نشاط تجاري محلي (LocalBusiness) وقائمة الخدمات الست (ItemList).
 * لا يُدرج أي حقل تواصل أو رابط اجتماعي إلا إذا كانت قيمته موجودة فعلاً.
 */
export default async function JsonLd() {
  const settings = await getSettings();
  const baseUrl = getBaseUrl();
  const businessId = `${baseUrl}/#business`;

  const sameAs = Object.values(settings.socials).filter(
    (value): value is string => value !== null && value !== "",
  );

  const localBusiness: Record<string, unknown> = {
    "@type": "LocalBusiness",
    "@id": businessId,
    name: settings.brand.name,
    url: baseUrl,
    description: settings.seo.defaultDescription,
    areaServed: "EG",
    ...(settings.contact.phone !== null && settings.contact.phone !== ""
      ? { telephone: settings.contact.phone }
      : {}),
    ...(sameAs.length > 0 ? { sameAs } : {}),
  };

  const servicesList = {
    "@type": "ItemList",
    itemListElement: SERVICES.map((service, index) => ({
      "@type": "ListItem",
      position: index + 1,
      item: {
        "@type": "Service",
        name: service.title,
        description: service.short,
        provider: { "@id": businessId },
      },
    })),
  };

  const graph = {
    "@context": "https://schema.org",
    "@graph": [localBusiness, servicesList],
  };

  // استبدال "<" يمنع كسر وسم <script> لو تسللت القيمة من قاعدة البيانات
  const json = JSON.stringify(graph).replace(/</g, "\\u003c");

  return (
    <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: json }} />
  );
}
