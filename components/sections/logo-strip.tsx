import type { SectionContentMap } from "@/lib/content-types";
import type { FleetBrand, SiteSettings } from "@/lib/site-config";
import type { BlockStyle } from "@/lib/page-builder-types";
import { DEFAULT_LOCALE } from "@/lib/i18n-types";
import { getT } from "@/lib/i18n/content";
import { Marquee } from "@/components/motion";
import { internalPath, localeHref } from "@/components/site/links";
import { safeMediaSrc } from "@/components/sections/image";

/**
 * شريط شعارات ماركات الأسطول — نقلٌ لقسم `.brands` في التصميم.
 *
 * ── ما تغيّر في ن‑٩ (2026-08-17)، وكلُّه بأمر المالك ────────────────────────
 *
 * (١) 🔴 **الشعارات صارت `items` عادية، وقرار بدر ٤ انتهى لأن مبرره انتهى.**
 *
 *     كان مكتوباً هنا أن السبب بنيوي: «`src` داخل عنصر قائمة شكلٌ لم يُقنَّن في
 *     عقد المنشئ». **وم‑٧ قنّنته بعينه** — `NON_TEXT_FIELD_NAMES` تحجب `src`
 *     بالاسم على مستوى العنصر (`0065`)، و`route-rail` و`services-grid` تحملان
 *     صور عناصرهما فعلاً. فالقيد زال والقرار يزول معه؛ ومبررُ م‑٧ الثاني
 *     («النطاق: قائمةٌ واحدة للموقع كله») يُعالَج **بالاحتياط لا بالمنع**:
 *
 *       `content.items` تتجاوز  ⇐  `settings.fleetBrands` تحتيها
 *
 *     وهو مذهب `services-grid` مع `SERVICES` و`hero.items` مع نقاط الثقة حرفاً.
 *     فصفحةٌ لم تُحرَّر ترى القائمة الواحدة كما كانت، وصفحةٌ حُرِّرت ترى ما كُتب.
 *
 *     ⚠ **وثمنُه بلا تجميل:** من حذف **كل** العناصر تعود إليه قائمة الإعدادات.
 *     وهو ثمن `services-grid` المشحون نفسه، ونصُّ المساعدة في اللوحة يقوله.
 *
 * (٢) 🔴 **حقل `disclaimer` حُذف كاملاً — قرارُ المالك، 2026-08-17.**
 *
 *     أضافته `0072` خانةً ثانية أسفل الشريط: `note` نثرٌ تحريري يختفي بالفراغ،
 *     و`disclaimer` شرطُ استعمالٍ **يعيد افتراضيَّه عند الفراغ** (`||` لا `??`)
 *     فيملك المالك الصياغة ولا يملك الحذف. وعُرض عليه الأمر بمخاطره فقرّر:
 *     **خانةٌ واحدة، ويُحذف الثاني.** وهو قرار منتجٍ لا هندسة، فنُفِّذ بلا
 *     تحوّطٍ في الواجهة وبلا نصٍّ بديل يُلمّح إليه.
 *
 *     ونصُّ التنويه المحذوف محفوظٌ **مرةً واحدة** في
 *     `docs/phase-briefs/OWNER-NOTES-2026-08-16.md` كي لا يُعاد اختراعه إن
 *     طلبه يوماً — **ولا نسخة منه في الكود ولا في ملفات الرسائل** بطلبه.
 *     و`note` — نثرُ المالك — **لم يُمسّ**.
 *
 * (٣) **الحركة صارت `Marquee` من م‑٥ ولم تبقَ حلقةً ثانية في هذا الملف.**
 *     كان هنا `MARQUEE_CSS` مستقلٌّ بثلاث نسخ، و`Marquee` مبنيٌّ منذ م‑٥ **وبلا
 *     مستهلك واحد** (مقيس: صفر استيراد). فحلقتان تنحرفان، والقائمة تكسب منه
 *     ثلاثة أشياء لم تكن هنا:
 *       • **التوقّف خارج الشاشة وفي التبويب الخلفي** — حركةٌ تدور طوال عمر
 *         الصفحة كانت تدور وهي غير مرئية.
 *       • **التوقّف عند تركيز لوحة المفاتيح** — شرط إتاحة: من يتنقّل بالـTab لا
 *         يستطيع ملاحقة رابطٍ يهرب منه (ويصير له معنىً حقيقي مع `logoLink`).
 *       • 🔴 **وتقليل الحركة يُوقف الشريط ولا يُخفيه.** `MARQUEE_CSS` القديم كان
 *         `animation:none` وحدها داخل حاويةٍ `overflow:hidden` ⇒ **أكثر من نصف
 *         الشعارات مقصوصٌ بلا طريقة لرؤيته** لمن طلب تقليل الحركة. و`Marquee`
 *         يفكّ الحاوية ويُخفي النسخ المكرّرة فتلتفّ العشرة شبكةً مرتّبة.
 *         والشعارات **محتوى** لا زخرفة، فإيقافها ليس إخفاءها.
 *
 * (٤) **خمسة مقابض في `content.style` وحده** (سرعة · اتجاه · توقّف بالتحويم ·
 *     أثر الصورة · فعل النقر) — رموزٌ من قوائم مغلقة، والمجهول ينحدر إلى
 *     الافتراضي في `readBlockStyle`. والمبرر مكتوب في العقد §٥ ولا يُعاد.
 *
 * ── وقرارٌ من م‑٢ باقٍ كما هو ────────────────────────────────────────────────
 *
 * **اتجاه اللفّ يتبع اتجاه الصفحة**: الشريط في RTL يزحف يميناً وفي LTR يساراً —
 * و`transform` لا يعرف الاتجاه. ولذلك مقبض الاتجاه **نسبيّ** («مع القراءة» /
 * «عكسها») لا مطلق: مقبضٌ يقول «يمين» كان يعني شيئين في لغتين.
 *
 * ⚠ والشعار SVG مسطّح: `<img>` عادية لا `next/image` — المُحسِّن لا يلمس SVG
 *   ويحتاج `dangerouslyAllowSVG`، ووزن العشرة مجتمعةً ٤١ ك.ب.
 */

/** مدّة دورة النسخة الواحدة بالثواني — الوسط هو رقم التصميم (`TIMING.marqueeSec`) */
const SPEED_SEC = { slow: 64, normal: 40, fast: 24 } as const;

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
 * 🔒 **ولذلك يبقى `dark:` في الرموز الثلاثة كلها بلا استثناء** — بما فيها
 * `color`. ورمزٌ يعِد بالألوان على الداكن كان يعِد باختفاء أربعة شعارات، وهو
 * مقبضٌ يُشحن معطوباً خلف خيار (النمط ٣ في `LESSONS.md`). فالوعد مقصورٌ على
 * الأرضية الفاتحة، ونصُّ المساعدة في اللوحة يقول ذلك حرفاً.
 */
const LOGO_BASE = "h-7 w-auto max-w-28 object-contain transition duration-300 sm:h-8";
const DARK_MONO = "dark:opacity-55 dark:grayscale-0 dark:[filter:brightness(0)_invert(1)]";

const LOGO_EFFECT_CLASS = {
  /** الافتراضي وسلوك اليوم: رمادية، وتتلوّن لمن يحوّم أو يركّز */
  mono: `${LOGO_BASE} opacity-60 grayscale ${DARK_MONO}`,
  monoStill: `${LOGO_BASE} opacity-60 grayscale ${DARK_MONO}`,
  /** بألوانها على الفاتح — وأحاديةً على الداكن، والسبب في التعليق أعلاه */
  color: `${LOGO_BASE} opacity-90 ${DARK_MONO}`,
} as const;

/**
 * الكشف عند التحويم **وعند التركيز معاً**: `hover:` وحدها تعطي أثراً لا يبلغه
 * من يتنقّل بلوحة المفاتيح، والشعار قد يكون رابطاً (`logoLink`) فيصير قابلاً
 * للتركيز فعلاً.
 */
const REVEAL_CLASS =
  "group-hover:opacity-100 group-hover:grayscale-0 group-focus-visible:opacity-100 " +
  "group-focus-visible:grayscale-0 dark:group-hover:opacity-100 dark:group-focus-visible:opacity-100";

/** ماركةٌ جاهزة للتصيير — بعد الحرّاس، فلا تُنادى دالةُ حارسٍ في JSX */
type Logo = { key: string; name: string; src: string | null; alt: string; href: string | null };

/**
 * العناصر أولاً، والإعدادات احتياطاً. **والحرّاس تُنادى هنا مرةً واحدة** لا في
 * الحلقة: الشريط يُصيَّر أربع مرات (نسخةٌ مقروءة وثلاث زخرفية)، فحارسٌ داخل JSX
 * يعمل أربعين مرة على عشرة شعارات بلا مقابل.
 */
function readLogos(
  items: SectionContentMap["logo-strip"]["items"],
  fallback: FleetBrand[],
  locale: string,
  linkable: boolean
): Logo[] {
  const source = Array.isArray(items) && items.length > 0 ? items : null;

  if (source === null) {
    return fallback
      .filter((brand) => typeof brand?.name === "string" && brand.name.trim() !== "")
      .map((brand) => ({
        key: brand.slug,
        name: brand.name.trim(),
        src: safeMediaSrc(brand.logoUrl),
        /** الاحتياط بلا حقل نصٍّ بديل — واسمُ الماركة هو وصفُها الصحيح */
        alt: brand.name.trim(),
        href: null,
      }));
  }

  const logos: Logo[] = [];
  source.forEach((item, index) => {
    const name = typeof item?.name === "string" ? item.name.trim() : "";
    if (name === "") return; // عنصرٌ بلا اسم لا يُصيَّر: لا شعار ولا نصّ بديل له
    const raw = typeof item?.href === "string" ? internalPath(item.href) : null;
    logos.push({
      key: typeof item?._k === "string" && item._k !== "" ? item._k : `i${index}`,
      name,
      src: safeMediaSrc(item?.src),
      /**
       * 🔴 **الفارغ يعود إلى الاسم، ولا يعني «زخرفة» — وهذا خروجٌ مقصود عن
       * قاعدة م‑٧ العامة، ومبرره في الشاشة لا في العقد:**
       *
       * قاعدة م‑٧ («الفارغ = `alt=""`») مبنيةٌ على أن **عنوان البطاقة مرئيٌّ
       * بجوار الصورة**، فالصورة تكرار له. وهنا لا شيء مرئيٌّ إلى جوار الشعار
       * إطلاقاً: الاسم لا يُعرض إلا حين تغيب الصورة. فـ`alt=""` كان يعني أن
       * قارئ الشاشة يمرّ على عشرة شعارات **فلا يسمع اسم ماركةٍ واحدة** — أي
       * قسمٌ كامل يختفي عن قارئه بلا خطأ ولا فحصٍ يمسكه.
       *
       * والحقل يبقى معروضاً لأن الحارس البنيوي يشترطه مع `src` (‏القاعدة ٤ في
       * `block_registry_check`)، **ولأنه يُترجَم**: من أراد وصفاً أدقّ من الاسم
       * كتبه، ومن تركه فارغاً سُمع الاسم.
       */
      alt: (typeof item?.alt === "string" && item.alt.trim() !== "" ? item.alt : name).trim(),
      href: linkable && raw !== null ? localeHref(raw, locale) : null,
    });
  });
  return logos;
}

export async function LogoStripSection({
  content,
  settings,
  locale = DEFAULT_LOCALE,
  style,
}: {
  content: SectionContentMap["logo-strip"];
  settings: SiteSettings;
  locale?: string;
  style?: BlockStyle | null;
}) {
  const linkable = style?.logoLink === "item";
  const logos = readLogos(content.items, settings.fleetBrands ?? [], locale, linkable);
  // قائمة فارغة ⇒ لا شريط. إطارٌ بلا شعار أسوأ من غيابه (القاعدة الذهبية ١٥)
  if (logos.length === 0) return null;

  const t = await getT("sections.logoStrip", locale);
  const title = content.title ?? t("title", "ماركات تجدها في الفئات المتاحة");
  /* نثرٌ تحريري: الغياب والفراغ كلاهما يعني «لا تعرضه» */
  const note = content.note ?? "";
  /**
   * 🔴 **تسمية القائمة صارت من `content` (‏`0101`) — وكانت محفورةً هنا وحدها.**
   *
   * كان السطر `label={t("listLabel", "ماركات الأسطول")}` **بلا `content.` قبله
   * إطلاقاً**: أي أن `aria-label` المصيَّر على الموقع الحيّ لا يُغيَّر من اللوحة
   * ولا من القاعدة — نقضٌ لشرط المالك «التحكم في كل شيء من لوحة التحكم»،
   * **وحمولةُ الصياغة التي كُتبت `0095` لإزالتها**: النشاط وسيطٌ لا يملك مركبةً
   * ولا يوظّف سائقاً، فالأسطول بضمير الملك ادّعاءُ ما لا يُملَك. و`0095` أصلحت
   * المحتوى في القاعدة ولم تجد لهذه التسمية صفّاً تُصلحه، لأنها لم تكن فيها.
   *
   * ⚠ **والفراغ يعيد الافتراضي — لا كـ`title` أعلاه.** `title` الفارغ يعني «لا
   * عنوان» ويسقط `<h2>` كله، وذاك اختيارٌ مرئيٌّ يراه صاحبه. وهذه **اسمٌ لا
   * يُرى**: و`Marquee` تُسقط `aria-label` كاملاً عند الفراغ (لا تكتبه فارغاً)،
   * فيمرّ قارئ الشاشة على عشرة شعارات بلا ما يقول له ما هذه القائمة — انحدارٌ
   * لا يظهر لمن سبّبه لأن الحقل غير مرئيٍّ أصلاً. **ونصُّ المساعدة في اللوحة
   * يقول هذا السلوك حرفاً**، وهو الفرق عن `disclaimer` المحذوف: عِلّةُ ذاك كانت
   * الصمت لا `||`.
   */
  const listLabel = (content.listLabel ?? "").trim() || t("listLabel", "ماركات السيارات");

  const effect = style?.logoEffect ?? "mono";
  const logoClass = LOGO_EFFECT_CLASS[effect];
  /** الكشف عند التحويم لرمزَي «mono» و«color»، ولا يكشف `monoStill` بقصد */
  const reveal = effect === "monoStill" ? "" : REVEAL_CLASS;

  return (
    <section className="overflow-hidden border-y border-border/60 bg-muted/30 py-10 md:py-14">
      {title ? (
        <div className="mx-auto w-full max-w-6xl px-4 sm:px-6">
          <h2 className="text-center text-sm font-semibold tracking-wide text-muted-foreground">
            {title}
          </h2>
        </div>
      ) : null}

      {/**
       * ⚠ **`min-w-[100vw]` على النسخة شرطُ صحةٍ لا تنسيق:** ما يُرى في أي لحظة
       * يجب ألا يتجاوز `(عدد النسخ − ١) × عرض النسخة`، وإلا عبَر الشريطَ فراغٌ
       * كل لفّة. والعشرة شعارات مجتمعةً ٦٤٠ بكسل فقط — **والمالك يستطيع اليوم
       * أن يحذف حتى يبقى شعارٌ واحد**، فرقمٌ مضبوط بالتجربة كان سيكسر أول حذف.
       * وبنسخةٍ بعرض الشاشة يصير الشرط «عرض الشاشة ≤ ثلاثة أضعافه» — محقَّقاً
       * دائماً بلا رقم.
       *
       * وفي تقليل الحركة تُلغى هذه القيود في `motion.module.css` نفسه (النسخة
       * تلتفّ وتنحسر) — لا هنا، فلا تُكتب القاعدة في مكانين.
       */}
      <Marquee
        className="relative mt-7 w-full"
        setClassName="flex min-w-[100vw] shrink-0 items-center justify-around gap-x-10 px-5 sm:gap-x-14 sm:px-7"
        durationSec={SPEED_SEC[style?.marqueeSpeed ?? "normal"]}
        reverse={style?.marqueeDirection === "reverse"}
        pauseOnHover={style?.marqueePause !== false}
        label={listLabel}
      >
        {logos.map((logo) => {
          /**
           * الشعار نفسه — والنسخ الزخرفية يحجبها `Marquee` بـ`aria-hidden` على
           * الـ`<ul>` كله، فلا حاجة إلى نسختين من هذا الجسم كما كان هنا سابقاً.
           */
          const media = logo.src ? (
            /* eslint-disable-next-line @next/next/no-img-element */
            <img
              src={logo.src}
              alt={logo.alt}
              loading="lazy"
              decoding="async"
              className={`${logoClass} ${reveal}`}
            />
          ) : (
            /* بلا شعار يُعرض الاسم — الماركة معلومة، والصورة وسيلتها */
            <span className="text-sm font-semibold text-muted-foreground">{logo.name}</span>
          );

          return (
            <li key={logo.key} className="group shrink-0">
              {logo.href ? (
                /**
                 * ⚠ **الرابط يحمل `aria-label` باسم الماركة**: نصُّه الظاهر
                 * صورةٌ نصُّها البديل قد يكون وصفاً لا اسماً، ورابطٌ بلا اسم
                 * مقروء يُنطق «رابط» عشر مرات. و`rounded`+`focus-visible` كي
                 * يُرى مسار لوحة المفاتيح على شعارٍ بلا حدود.
                 */
                <a
                  href={logo.href}
                  aria-label={logo.name}
                  className="inline-flex rounded-sm outline-offset-4 focus-visible:outline-2 focus-visible:outline-ring"
                >
                  {media}
                </a>
              ) : (
                media
              )}
            </li>
          );
        })}
      </Marquee>

      {/**
       * ⚠ **والشفافية `/80` رُفعت عن النصّ** — لا تجميلاً بل بقياس: على أرضية
       * `bg-muted/30` فوق `--ink` يخرج `--on-ink-mut` عند ٨٠٪ بنسبة ‏٥٫٨:١،
       * وبلا شفافية ‏٨٫٥:١. الأولى تعبر AA والثانية تعبر AAA، والفرق سطرٌ من
       * الأصناف. وأصغر نصٍّ في القسم لا يُترك على أضيق هامش.
       */}
      {note ? (
        <div className="mx-auto mt-8 w-full max-w-3xl px-4 sm:px-6">
          <p className="text-center text-sm leading-6 text-muted-foreground">{note}</p>
        </div>
      ) : null}
    </section>
  );
}
