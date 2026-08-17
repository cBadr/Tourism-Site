import type { Metadata } from "next";
import { getSettings } from "@/lib/settings";
import { getPageBySlug } from "@/lib/content";
import { buildPageMetadata } from "@/lib/seo";
import { resolveLocale } from "@/lib/i18n/content";
import { SiteHeader } from "@/components/site/header";
import { SiteFooter } from "@/components/site/footer";
import { WhatsAppFab } from "@/components/site/whatsapp-fab";
import { SiteCtaBar } from "@/components/site/cta-bar";
import { RenderSections } from "@/components/sections/render";
import { ShareBar } from "@/components/site/share-bar";
import { PromoBanners } from "@/components/booking/promo-banner";
import { getPromoBanners } from "@/lib/discounts/banners";
import JsonLd from "@/components/seo/JsonLd";

/**
 * الصفحة الرئيسية العامة — أقسامها من نظام المحتوى (صفحة slug = home)
 * عبر سجل الأقسام الموحد. الصفحة موجودة دائماً بفضل المحتوى الافتراضي،
 * لذلك لا notFound() هنا أبداً.
 *
 * المرحلة ٨: اللغة تُقرأ من ترويسة الوسيط (`resolveLocale`) وتُمرَّر إلى طبقة
 * المحتوى والإعدادات والأقسام — المسار نفسه يخدم `/` و`/en`.
 */

export async function generateMetadata(): Promise<Metadata> {
  const locale = await resolveLocale();
  const page = await getPageBySlug("home", locale);
  // بلا title — الصفحة الرئيسية تأخذ الاسم الافتراضي من قالب الجذر
  return buildPageMetadata({
    description: page?.meta.description ?? undefined,
    path: "/",
    locale,
    // خيارات سيو الصفحة الواحدة (منع الفهرسة، صورة المشاركة، المسار القانوني)
    meta: page?.meta,
  });
}

export default async function Home() {
  const locale = await resolveLocale();
  const [settings, page, homeBanners] = await Promise.all([
    getSettings(locale),
    getPageBySlug("home", locale),
    getPromoBanners("home"),
  ]);

  return (
    /*
      القشرة الداكنة (القرار ٢٦) **لم تعد هنا** — صعدت إلى `app/(site)/layout.tsx`
      في م‑٨ فصارت تلبسها كل صفحة عامة لا الرئيسية وحدها. ولا يُعاد كتابتها في
      صفحة: صنفان متداخلان `.dark` داخل `.dark` بلا أثر اليوم، ويوم يأتي مبدّل
      م‑٩ يصير الداخليُّ منهما عتمةً لا يفكّها المفتاح.
    */
    <>
      <JsonLd />
      <SiteHeader settings={settings} locale={locale} />
      <main id="main" className="flex-1">
        {/*
          بانر موضع «الرئيسية» — شريط فوق أقسام الصفحة، نصّ تحفيزي بلا أثر على
          أي سعر (نصّ العقد). غيابه (لا بانر نشط) لا يترك فراغاً: المكوّن يُرجع
          null فلا يُصيَّر الحاوي بمحتوى فارغ.
        */}
        {homeBanners.length > 0 ? (
          <div className="mx-auto w-full max-w-6xl px-4 pt-4 sm:px-6">
            <PromoBanners banners={homeBanners} />
          </div>
        ) : null}

        <RenderSections
          sections={page?.sections ?? []}
          settings={settings}
          locale={locale}
        />

        {/* المشاركة العامة — والرئيسية إحدى صفحات التسويق الثلاث في عقد
            `lib/export-types.ts` §٥ («المسارات والخدمات والرئيسية»): رابطها `/`
            عام مفهرَس بلا سرّ فيه، بخلاف `/booking/[token]` الذي رابطه بيانات
            الاعتماد نفسها (الشرح كاملاً في رأس `share-bar.tsx`). وهي أكثر
            الثلاث قصداً لمن أراد أن يمرّر **الموقع كله** لا صفحةً منه.

            والعنوان المُمرَّر هو عنوان سيو الصفحة لا نصّاً مكتوباً هنا (D-04).
            و`generateMetadata` أعلاه تُسقط `title` عمداً كي يأخذ التبويب اسم
            العلامة من قالب الجذر — وذاك اسم نافذة، أما نصّ المنشور فوصفُ صفحةٍ،
            ومصدره `meta.title` كما في الصفحات الثلاث الأخرى حرفياً. وسقوطه
            ينتهي إلى اسم العلامة من الإعدادات (لا إلى حرفٍ مكتوب) فلا يُنشر
            رابطٌ بلا عنوان يوم تغيب قاعدة المحتوى. */}
        <ShareBar
          title={page?.meta.title ?? page?.title ?? settings.brand.name}
          description={page?.meta.description}
          path="/"
          locale={locale}
        />
      </main>
      <SiteFooter settings={settings} locale={locale} />
      {/* الزرّ العائم يُخفى على الجوال — واتساب إجراءٌ داخل الشريط السفلي هناك */}
      <WhatsAppFab settings={settings} locale={locale} hiddenOnMobile />
      <SiteCtaBar settings={settings} locale={locale} />
    </>
  );
}
