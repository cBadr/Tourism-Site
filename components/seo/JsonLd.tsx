import { getSettings } from "@/lib/settings";
import { socialHrefs } from "@/lib/site-config";
import { absoluteImageUrl, getBaseUrl, localeUrl } from "@/lib/seo";
import { getLocalizedServices, getT, resolveLocale } from "@/lib/i18n/content";
import { localeDef } from "@/i18n/config";
import type { PublicPage } from "@/lib/content-types";
import { pagePublicPath } from "@/lib/seo/site-paths";
import {
  breadcrumbNode,
  jsonLdGraph,
  jsonLdText,
  localBusinessNode,
  logoNode,
  organizationNode,
  serviceNode,
  servicesItemListNode,
  siteNodeIds,
  webSiteNode,
} from "@/lib/seo/jsonld";

/**
 * البيانات المنظمة (JSON-LD) — الطبقة الخادمية التي تصل بين الإعدادات والرسم.
 *
 * هذا الملف **لا يبني عقدةً واحدة بنفسه**: كل أشكال schema.org في
 * `lib/seo/jsonld.ts` وحدها (دوالّ نقية بلا تبعية)، وهنا تُقرأ الإعدادات واللغة
 * ويُركَّب الرسم ويُطبَع. والفصل مقصود: شاشة الفحص في اللوحة تستورد **نفس**
 * الدوالّ فتقول للمالك ما يخرج فعلاً بدل أن تعيد تخمينه (النمط ٢ في
 * `LESSONS.md`: الواجهة تَعِد بما لا تنفّذه الطبقة تحتها).
 *
 * ── اللغة (إصلاح المرحلة ١٠، ويبقى قائماً) ──────────────────────────────────
 * كان الملف ينادي `getSettings()` بلا وسيط ويستورد `SERVICES` مباشرة، فيصل جوجل
 * **اسم النشاط ووصفه وأسماء الخدمات الست بالعربية على الصفحة الإنجليزية** مهما
 * نُشرت ترجمات. اللغة تُحسم أولاً وتمر إلى الإعدادات وإلى `getLocalizedServices`
 * — نفس المصدر الذي تقرأ منه شبكة الخدمات — فالبيانات المهيكلة تطابق ما يراه
 * الزائر على الصفحة نفسها.
 */

/**
 * المُسلسِل الوحيد في المستودع — كل من يُخرج JSON-LD يمرّ من هنا.
 *
 * وليس تجميلاً: نسخةٌ ثانية من هذا السطر تعني نسخةً ثانية من ترميز `<`، وأول
 * موضع يُنسى فيه الترميز يفتح حقن نصّ في الصفحة عبر حقلٍ يملؤه المحرِّر.
 */
export function JsonLdScript({ data }: { data: unknown }) {
  return (
    <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLdText(data) }} />
  );
}

/**
 * رسم الموقع — يُصيَّر في الصفحة الرئيسية وحدها.
 *
 * أربع عقد مترابطة بـ`@id` لا أربع نسخ من البيانات نفسها:
 *   • `Organization` — الكيان الناشر: الاسم والاسم القانوني والشعار.
 *   • `WebSite`      — هذا الموقع، وناشره المؤسسة أعلاه.
 *   • `LocalBusiness`— بطاقة النشاط المكانية: العنوان والإحداثيات والساعات
 *     ونطاق السعر والمناطق المخدومة، وأبوها المؤسسة.
 *   • `ImageObject`  — الشعار **مرة واحدة**، تشير إليه المؤسسة والنشاط معاً.
 * ثم `ItemList` بالخدمات الست، كلٌّ منها يشير إلى مقدّمه بالمعرّف لا بنسخة.
 *
 * وكل حقل من بطاقة النشاط يخرج **حين يُضبط فقط**: الموقع الذي لم يفتح مالكه
 * الشاشة الجديدة يُصدِّر ما كان يُصدّره تماماً، عدا `areaServed` المشروح في
 * `localBusinessNode`.
 */
export default async function JsonLd({ locale }: { locale?: string } = {}) {
  const activeLocale = locale ?? (await resolveLocale());
  const [settings, services] = await Promise.all([
    getSettings(activeLocale),
    getLocalizedServices(activeLocale),
  ]);

  const baseUrl = getBaseUrl();
  const ids = siteNodeIds(baseUrl);
  const inLanguage = localeDef(activeLocale).htmlLang;

  // الشعار يمرّ بنفس شرط صور المشاركة: الرابط النسبي لا يجلبه زاحف ولا منصة
  const logo = logoNode(ids, absoluteImageUrl(settings.brand.logoUrl));

  /**
   * ⚠ **مطبَّعة لا خام.** كانت هنا `Object.values(...)` بمرشّح «غير فارغ»، فتصل
   * `sameAs` معرّفاتُ حسابات لا روابط — و`sameAsList` ترفض غير المطلق فيخرج
   * الحقل فارغاً دائماً. فكان الموقع يعلن **صفر حساب** لجوجل بينما التذييل يعرض
   * خمسة، وشاشة فحص السيو تقول للمالك «لا حسابات» وهو يراها أمامه: رقمٌ واحد
   * بثلاثة مصادر. والآن مصدرٌ واحد (`socialHrefs`)، و`sameAsList` تبقى الحارس
   * الأخير — لا الحارس الوحيد.
   */
  const sameAs = socialHrefs(settings.socials);

  return (
    <JsonLdScript
      data={jsonLdGraph([
        organizationNode({
          ids,
          baseUrl,
          name: settings.brand.name,
          legalName: settings.company.legalName,
          hasLogo: logo !== null,
        }),
        webSiteNode({ ids, baseUrl, name: settings.brand.name, inLanguage }),
        localBusinessNode({
          ids,
          baseUrl,
          name: settings.brand.name,
          description: settings.seo.defaultDescription,
          inLanguage,
          telephone: settings.contact.phone,
          sameAs,
          business: settings.business,
          hasLogo: logo !== null,
        }),
        logo,
        servicesItemListNode({ providerId: ids.business, services }),
      ])}
    />
  );
}

/**
 * رسم صفحة محتوى — لصفحتَي الخدمة والمسار، وهما الصفحتان المبنيّتان للفوز في
 * البحث ولم تكن عليهما بيانات مهيكلة **إطلاقاً** قبل هذه الملاحظة.
 *
 *   • صفحة خدمة  ⇒ `Service` + `BreadcrumbList`
 *   • صفحة مسار  ⇒ `BreadcrumbList`
 *
 * ولماذا لا `Service` لصفحة المسار؟ لأن «القاهرة–الإسكندرية» ليست خدمةً معروضة
 * بذاتها بل صفحة استهداف لعبارة بحث؛ ووسمها خدمةً يجعل ستّ خدمات حقيقية تنافس
 * عشرات المسارات على التصنيف نفسه. أما مسار التنقّل فصحيح للاثنين.
 *
 * وأي نوع صفحة آخر يُرجع `null` — الصفحة الرئيسية لها رسمها أعلاه، والصفحة
 * الثابتة لا يوصف محتواها الحرّ بنوع schema.org بلا اختراع.
 */
export async function PageJsonLd({
  page,
  locale,
}: {
  page: PublicPage;
  locale?: string;
}) {
  if (page.kind !== "service" && page.kind !== "corridor") return null;

  const activeLocale = locale ?? (await resolveLocale());
  const [settings, t] = await Promise.all([
    getSettings(activeLocale),
    getT("site.nav", activeLocale),
  ]);

  const ids = siteNodeIds(getBaseUrl());
  /**
   * المسار العام يُشتق من `pagePublicPath` لا يُكتب هنا — هي نفس الدالة التي
   * تبني بها خريطة الموقع وقائمة اللوحة مساراتها، فلا يوجد مسارٌ في البيانات
   * المهيكلة يخالف المسار في الخريطة.
   */
  const path = pagePublicPath(page.kind, page.slug);
  const url = localeUrl(activeLocale, path);

  return (
    <JsonLdScript
      data={jsonLdGraph([
        page.kind === "service"
          ? serviceNode({
              url,
              name: page.title,
              description: page.meta.description,
              providerId: ids.business,
              areaServed: settings.business.areaServed,
            })
          : null,
        breadcrumbNode({
          id: `${url}#breadcrumb`,
          entries: [
            { name: t("home", "الرئيسية"), url: localeUrl(activeLocale, "/") },
            { name: page.title, url },
          ],
        }),
      ])}
    />
  );
}
