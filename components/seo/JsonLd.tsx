import { getSettings } from "@/lib/settings";
import { getBaseUrl } from "@/lib/seo";
import { getLocalizedServices, resolveLocale } from "@/lib/i18n/content";
import { localeDef } from "@/i18n/config";

/**
 * البيانات المنظمة (JSON-LD) — مكوّن خادمي يُدرج وسم <script> واحداً
 * يحوي @graph فيه: نشاط تجاري محلي (LocalBusiness) وقائمة الخدمات الست (ItemList).
 * لا يُدرج أي حقل تواصل أو رابط اجتماعي إلا إذا كانت قيمته موجودة فعلاً.
 *
 * ── اللغة (إصلاح المرحلة ١٠) ────────────────────────────────────────────────
 * كان الملف ينادي `getSettings()` بلا وسيط ويستورد `SERVICES` من
 * `lib/site-config.ts` مباشرة، فيصل جوجل **اسم النشاط ووصفه وأسماء الخدمات
 * الست بالعربية على الصفحة الإنجليزية** مهما نُشرت ترجمات — والملف لم يكن يظهر
 * في أي طابور ترجمة فيُكتشف العطب. الآن اللغة تُحسم أولاً وتمر إلى الإعدادات
 * وإلى `getLocalizedServices` (نفس المصدر الذي تقرأ منه شبكة الخدمات وصفحة
 * طلب عرض السعر) — فالبيانات المهيكلة تطابق ما يراه الزائر على الصفحة نفسها.
 *
 * الوسيط `locale` اختياري: الصفحة التي حسمت لغتها أصلاً تمرّرها فتوفّر قراءة،
 * ومن يكتب `<JsonLd />` يحصل على لغة الطلب من الترويسة نفسها.
 */
export default async function JsonLd({ locale }: { locale?: string } = {}) {
  const activeLocale = locale ?? (await resolveLocale());
  const [settings, services] = await Promise.all([
    getSettings(activeLocale),
    getLocalizedServices(activeLocale),
  ]);

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
    // لغة هذه النسخة من البطاقة — يفصل النسخة الإنجليزية عن العربية في نظر جوجل
    inLanguage: localeDef(activeLocale).htmlLang,
    ...(settings.contact.phone !== null && settings.contact.phone !== ""
      ? { telephone: settings.contact.phone }
      : {}),
    ...(sameAs.length > 0 ? { sameAs } : {}),
  };

  const servicesList = {
    "@type": "ItemList",
    itemListElement: services.map((service, index) => ({
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
