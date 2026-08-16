import type { SectionContentMap } from "@/lib/content-types";
import type { FleetBrand, SiteSettings } from "@/lib/site-config";
import { DEFAULT_LOCALE } from "@/lib/i18n-types";
import { getT } from "@/lib/i18n/content";

/**
 * شريط شعارات ماركات الأسطول — نقلٌ لقسم `.brands` في التصميم.
 *
 * ── أربعة قرارات تحكم هذا الملف ─────────────────────────────────────────────
 *
 * (١) **الشعارات بيانات نظام لا `items`** (قرار بدر ٤): تُقرأ من
 *     `settings.fleetBrands` أي من صفٍّ في `site_settings`، والكتلة تحمل
 *     عنوانها وتنويهها وحدهما.
 *
 *     🔴 **وتصحيحٌ على المبرر — 2026-08-16 (م‑٧):** كان مكتوباً هنا أن السبب
 *     بنيوي: «`src` داخل عنصر قائمة شكلٌ لم يُقنَّن في عقد المنشئ، وفتحُه بابٌ
 *     لكل كتلة لاحقة». **والباب فُتح بأمر بدر**: «ضيف الأعمدة المطلوبة بحيث
 *     يمكن التحكم في كل شيء من خلال لوحة التحكم بما فيها الصور والأيكونات».
 *     والشكل مقنَّنٌ اليوم في `lib/item-fields-types.ts` والهجرة `0065`،
 *     و`route-rail` و`services-grid` تحملان صور عناصرهما فعلاً.
 *
 *     فالسبب الباقي هنا **نطاقٌ لا بنية**: قائمة الماركات واحدةٌ للموقع كله،
 *     ووضعُها في `items` يجعل ماركةً تُضاف في صفحةٍ وتغيب في أخرى. ونقضُه
 *     حقلان في `block_registry` لا مرحلةٌ جديدة.
 *
 * (٢) **التنويه شرط الاستعمال لا زخرف** (الاتفاق §٤): الشعارات وصفٌ للمركبات
 *     العاملة لا ادّعاءُ شراكة ولا اعتماد — ونصُّه من القاعدة كغيره.
 *
 *     🔴 **وهذا البند كان مكتوباً هنا ومنقوضاً على الصفحة الحيّة.** التنويه
 *     كان يسكن حقل `note` نفسه، فكُتب فوقه نثرٌ تسويقي («نقوم بتوفير كافة
 *     الموديلات…») واختفى شرط الاستعمال من الرئيسية **بلا خطأ ولا سجلّ ولا
 *     فحصٍ يمسكه**: الحقل ممتلئ، والكتلة تُصيَّر، والبوابة خضراء.
 *
 *     فصارتا خانتين (‏`0072`)، والفرق بينهما في **معنى الفراغ** لا في الموضع:
 *
 *       `note`       نثرٌ تحريري — `?? ` واحتياطيّه لا شيء، فالفارغ يُخفيه.
 *       `disclaimer` شرطُ استعمال — `||` واحتياطيّه النصّ الكامل، **فالفارغ
 *                    يعيد الافتراضي**. والمالك يملك الصياغة ولا يملك الحذف،
 *                    وهو بعينه معنى «شرطٌ لا زخرف».
 *
 *     ⚠ ولا يكفي أن يُملأ الحقل في القاعدة: خانةٌ فارغةٌ في المنشئ تُحفَظ
 *     `""`، و`??` لا تسقط على السلسلة الفارغة — فالتنويه كان سيضيع بضغطة
 *     حفظٍ لا علاقة لها به. `||` هي الفرق بين «افتراضيٍّ عند الغياب» و«شرطٍ
 *     لا يُفرَّغ».
 *
 * (٣) **النسختان المكرّرتان `aria-hidden` بالكامل**: الأولى وحدها مقروءة،
 *     وإلا قرأ قارئ الشاشة «مرسيدس» ثلاث مرات. وثلاث نسخ لا اثنتان لأن الشاشة
 *     العريضة يجب أن تبقى ممتلئة طوال الدورة، وإلا عبَرها فراغٌ كل لفّة.
 *
 * (٤) **اتجاه اللفّ يتبع اتجاه الصفحة**: الشريط في RTL يزحف يميناً وفي LTR
 *     يساراً — و`transform` لا يعرف الاتجاه، فالإشارة تأتي من متغيّر يُضبط
 *     بـ`[dir]`. ولولا ذلك لزحف الشريط إلى فراغٍ في إحدى اللغتين.
 *
 * ⚠ **والحركة تتوقف كلياً عند `prefers-reduced-motion`** — شرط إتاحة يفرضه
 *   التصميم على نفسه، والشريط يبقى مقروءاً ساكناً.
 *
 * ⚠ والشعار SVG مسطّح: `<img>` عادية لا `next/image` — المُحسِّن لا يلمس SVG
 *   ويحتاج `dangerouslyAllowSVG`، ووزن العشرة مجتمعةً ٤١ ك.ب.
 */

/**
 * ثلاث نسخ ⇒ إزاحة ثُلث المسار تساوي عرض نسخةٍ كاملة، فتُغلق الدورة بلا قفزة.
 *
 * ⚠ **وشرطُ ألا يعبر الشريطَ فراغٌ مقيسٌ لا مقدَّر:** ما يُرى في أي لحظة يجب
 * ألا يتجاوز `(عدد النسخ − ١) × عرض النسخة`. والعشرة شعارات مجتمعةً ٦٤٠ بكسل
 * فقط — فبثلاث نسخ ينكسر الشريط على أي شاشة أعرض من ١٢٨٠، وهي شاشة الأغلبية.
 * ولذلك تحمل كل نسخة `min-w-[100vw]`: تصير النسخة بعرض الشاشة مهما كبرت،
 * فيصير الشرط `عرض الشاشة ≤ ضعفه` — أي محقَّقاً دائماً بلا رقمٍ مضبوط بالتجربة.
 */
const MARQUEE_CSS = `
.brandmq{--brandmq-end:-33.3333%}
[dir="rtl"] .brandmq{--brandmq-end:33.3333%}
.brandmq{animation:brandmq 46s linear infinite}
@keyframes brandmq{from{transform:translateX(0)}to{transform:translateX(var(--brandmq-end))}}
@media (prefers-reduced-motion:reduce){.brandmq{animation:none}}
`;

/**
 * 🔴 **الشعارات أحادية اللون على الداكن — وإلا اختفت كلها.**
 *
 * الشعارات العشرة ملفات SVG بألوانها الأصلية، وأكثرها **أسود**: تويوتا وهوندا
 * وكيا وهيونداي. و`grayscale` وحدها تُبقي الأسود أسودَ — فلمّا لبس الموقع
 * القشرة الداكنة صار شريط الماركات فراغاً مقيساً: عنوانٌ ثم مسافة فارغة ثم
 * ملاحظة. وهو عيبٌ لا يظهر في اللوحة الفاتحة إطلاقاً، ولذلك لم يُلحظ قبلاً.
 *
 * والعلاج هو علاج التصميم نفسه (‏`style.css:1086`): «كل بكسل غير شفاف يصير
 * أبيض» — `brightness(0) invert(1)`. وهي تعمل على **أي** شعار مهما كان لونه،
 * فلا تحتاج قائمة استثناءات لكل ماركة تُضاف لاحقاً.
 *
 * وتُقيَّد بـ`dark:` فقط: على الأرضية الفاتحة (‏`/admin` ومعاينة المنشئ) تبقى
 * الشعارات رماديةً كما كانت — أبيضُ على أبيض هو العيب نفسه مقلوباً.
 */
const LOGO_CLASS =
  "h-7 w-auto max-w-28 object-contain opacity-60 grayscale transition duration-300 sm:h-8 " +
  "dark:opacity-55 dark:grayscale-0 dark:[filter:brightness(0)_invert(1)]";

function BrandSet({ brands, decorative }: { brands: FleetBrand[]; decorative: boolean }) {
  return (
    <ul
      role="list"
      aria-hidden={decorative || undefined}
      className="flex min-w-[100vw] shrink-0 items-center justify-around gap-x-10 px-5 sm:gap-x-14 sm:px-7"
    >
      {brands.map((brand) => (
        <li key={brand.slug} className="shrink-0">
          {brand.logoUrl ? (
            /* eslint-disable-next-line @next/next/no-img-element */
            <img
              src={brand.logoUrl}
              /* النسخة الزخرفية بلا نصٍّ بديل — الاسم مقروء مرة واحدة */
              alt={decorative ? "" : brand.name}
              loading="lazy"
              decoding="async"
              className={
                decorative
                  ? LOGO_CLASS
                  : `${LOGO_CLASS} hover:opacity-100 hover:grayscale-0 dark:hover:opacity-100`
              }
            />
          ) : (
            /* بلا شعار يُعرض الاسم — الماركة معلومة، والصورة وسيلتها */
            <span className="text-sm font-semibold text-muted-foreground">{brand.name}</span>
          )}
        </li>
      ))}
    </ul>
  );
}

export async function LogoStripSection({
  content,
  settings,
  locale = DEFAULT_LOCALE,
}: {
  content: SectionContentMap["logo-strip"];
  settings: SiteSettings;
  locale?: string;
}) {
  const brands = (settings.fleetBrands ?? []).filter((brand) => brand?.name);
  // قائمة فارغة ⇒ لا شريط. إطارٌ بلا شعار أسوأ من غيابه (القاعدة الذهبية ١٥)
  if (brands.length === 0) return null;

  const t = await getT("sections.logoStrip", locale);
  const title = content.title ?? t("title", "الفئات المتاحة في أسطولنا");
  /* نثرٌ تحريري: الغياب والفراغ كلاهما يعني «لا تعرضه» */
  const note = content.note ?? "";
  /* شرط استعمال: الفراغ يعني «أعد الافتراضي» — الشرح في البند (٢) أعلاه */
  const disclaimer =
    (content.disclaimer ?? "").trim() ||
    t(
      "disclaimer",
      "الشعارات معروضة لبيان طرازات المركبات المتاحة عبر متعهدينا فقط، ولا تعني رعايةً ولا اعتماداً ولا علاقة تجارية مع الشركات المصنّعة."
    );

  return (
    <section className="overflow-hidden border-y border-border/60 bg-muted/30 py-10 md:py-14">
      {/**
       * 🔴 **لماذا CSS هنا لا في `app/globals.css`؟** ملف الرموز يملكه م‑١
       * وهذه المرحلة لا تلمسه. و`href`+`precedence` هما آلية React 19: تُرفع
       * القاعدة إلى `<head>` **وتُوحَّد** فلا تتكرر لو تكررت الكتلة، وتختفي
       * حين تختفي — فلا يبقى في الثيم أثرٌ لكتلةٍ حُذفت.
       */}
      <style href="brand-marquee" precedence="default">
        {MARQUEE_CSS}
      </style>

      {title ? (
        <div className="mx-auto w-full max-w-6xl px-4 sm:px-6">
          <h2 className="text-center text-sm font-semibold tracking-wide text-muted-foreground">
            {title}
          </h2>
        </div>
      ) : null}

      <div className="relative mt-7 flex w-full overflow-hidden [mask-image:linear-gradient(to_left,transparent,black_10%,black_90%,transparent)]">
        <div className="brandmq flex w-max shrink-0">
          <BrandSet brands={brands} decorative={false} />
          <BrandSet brands={brands} decorative />
          <BrandSet brands={brands} decorative />
        </div>
      </div>

      {/**
       * ⚠ **والشفافية `/80` رُفعت عن النصّين** — لا تجميلاً بل بقياس: على
       * أرضية `bg-muted/30` فوق `--ink` يخرج `--on-ink-mut` عند ٨٠٪ بنسبة
       * ‏٥٫٨:١، وبلا شفافية ‏٨٫٥:١. الأولى تعبر AA والثانية تعبر AAA، والفرق
       * سطرٌ من الأصناف. وأصغر نصٍّ في القسم لا يُترك على أضيق هامش.
       */}
      <div className="mx-auto mt-8 w-full max-w-3xl space-y-2 px-4 sm:px-6">
        {note ? (
          <p className="text-center text-sm leading-6 text-muted-foreground">{note}</p>
        ) : null}
        <p className="text-center text-xs leading-6 text-muted-foreground">{disclaimer}</p>
      </div>
    </section>
  );
}
