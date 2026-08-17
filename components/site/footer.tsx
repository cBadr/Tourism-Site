import { Fragment } from "react";
import { ChevronDown } from "lucide-react";
import { Separator } from "@/components/ui/separator";
import { cn } from "@/lib/utils";
import type { SiteSettings } from "@/lib/site-config";
import { getPagesByKind } from "@/lib/content";
import { DEFAULT_LOCALE } from "@/lib/i18n-types";
import { getT } from "@/lib/i18n/content";
import { createFormatter } from "@/components/booking/format";
import { LocaleSwitcher } from "./locale-switcher";
import { FooterAccordionSync } from "./footer-accordion";
import {
  TRACK_LINK_KEY,
  accountLinks,
  externalLinkProps,
  localeHref,
  navLinks,
  socialEntries,
} from "./links";
import { SOCIAL_ICONS } from "./social-icons";

/**
 * صفحات الثقة — صفحات ثابتة (kind = static) مسارها العام `/<slug>` بحسب
 * publicPath() في لوحة المحتوى، وتُبذر في supabase/migrations/0008_trust_pages.sql.
 * الترتيب هنا هو ترتيب ظهورها في التذييل، ولا يظهر منها إلا المنشور فعلاً.
 * العنوان الظاهر يأتي من نظام المحتوى (وهو مترجم أصلاً)، وهذه أسماء احتياطية.
 */
const LEGAL_PAGES = [
  { slug: "terms", key: "legal.terms", label: "الشروط والأحكام" },
  { slug: "refund-policy", key: "legal.refundPolicy", label: "سياسة الاسترداد" },
  { slug: "privacy", key: "legal.privacy", label: "سياسة الخصوصية" },
] as const;

/** الصفحات الثابتة التي يملكها صفّ الحقوق أدناه — تُستبعَد من عمود الأقسام */
const LEGAL_SLUGS: ReadonlySet<string> = new Set(LEGAL_PAGES.map((page) => page.slug));

/**
 * عمود روابط موحّد في التذييل — **مطويّ على الجوال ومفتوحٌ على المكتب**.
 *
 * ── الشكوى المقيسة ─────────────────────────────────────────────────────────
 *
 * بدر، بعد أن فتح الموقع على هاتفه: «الفوتر… غير منظم و كبير جدااااا».
 * والسبب بنيويّ لا تجميليّ: التذييل **يُبنى من القاعدة** (كل صفحة منشورة +
 * روابط الحساب)، فطال بطول الموقع — ٢٨ رابطاً في عمودٍ واحد على شاشة الهاتف،
 * ‏١٣٦٢ بكسل مقيسة عند ٣٧٥ عرضاً.
 *
 * والعلاج ليس حذف روابط: كلٌّ منها أُضيف لسبب، وحذفُ رابطٍ من التذييل يقطع
 * طريقاً داخلياً إلى صفحةٍ منشورة (نفس عيب `/business` و`/contact` الموثّق
 * أسفل هذا الملف). فالعلاج **طيّ** — الروابط كلها في DOM ويصلها الزاحف، ولا
 * يفتحها الزائر إلا حين يريدها.
 *
 * 🔒 **و`<details>` بلا `open` في الماركب هو الشكل المرفوض**: بلا جافاسكربت
 * كان الزاحف والزائر يريان أربعة عناوين وصفر رابط. فالعمود يخرج من الخادم
 * **مفتوحاً**، و`FooterAccordionSync` يطويه على الجوال بعد الترطيب — فالفشل
 * يقع إلى «كما كان» لا إلى «محجوب».
 *
 * ⚠ و`keepOpen` لا يُطوى على أي عرض — وهو العمود الذي فيه «تابع حجزك».
 */
function FooterLinkColumn({
  title,
  links,
  keepOpen = false,
}: {
  title: string;
  links: { href: string; label: string }[];
  keepOpen?: boolean;
}) {
  if (links.length === 0) return null;
  return (
    <nav aria-label={title} className="border-t border-border/60 md:border-t-0">
      <details data-ftr-acc open {...(keepOpen ? { "data-ftr-keep": "" } : null)} className="group">
        <summary
          className={cn(
            "flex cursor-pointer list-none items-center justify-between gap-2 py-3 text-sm font-bold",
            /**
             * على المكتب: عنوانٌ ساكن لا زرّ — لا مؤشّر ولا نقر ولا سهم.
             * و`pointer-events-none` تمنع النقر بالفأرة، **والنقر بلوحة
             * المفاتيح يمنعه حارس `toggle` في `FooterAccordionSync`** — فعمودٌ
             * أُغلق على المكتب لا يجد ما يفتحه (الأسهم مخفية هناك).
             */
            "md:pointer-events-none md:cursor-default md:py-0 md:pb-3",
            "[&::-webkit-details-marker]:hidden",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60"
          )}
        >
          {title}
          <ChevronDown
            aria-hidden="true"
            className="size-4 shrink-0 text-muted-foreground transition-transform duration-300 group-open:-rotate-180 md:hidden"
          />
        </summary>
        <ul role="list" className="flex flex-col pb-3 md:pb-0">
          {links.map((link) => (
            <li key={link.href}>
              <a
                href={link.href}
                // ٤٤ بكسل حدّ لمسٍ مريح على الجوال، و«طبيعي» فوق `md`
                className="flex min-h-11 w-fit items-center rounded-md text-sm text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60 md:min-h-0 md:py-1"
              >
                {link.label}
              </a>
            </li>
          ))}
        </ul>
      </details>
    </nav>
  );
}

/**
 * تذييل الموقع: الهوية + روابط الأقسام + صفحات الخدمات والمسارات (من نظام
 * المحتوى — مكوّن خادمي يجلبها بنفسه بلغة الزائر) + الشبكات المتوفرة + الحقوق.
 */
export async function SiteFooter({
  settings,
  locale = DEFAULT_LOCALE,
}: {
  settings: SiteSettings;
  locale?: string;
}) {
  const [services, corridors, statics, landings, t, tNav, tSocial] = await Promise.all([
    getPagesByKind("service", locale),
    getPagesByKind("corridor", locale),
    getPagesByKind("static", locale),
    /**
     * 🔴 النوع الرابع `landing` (الفجوة ١٦ والفجوة ٢٣).
     *
     * `/business` صفحةُ هبوطٍ **منشورة وحيّة بخمسة أقسام، وبلا رابط واحد إليها
     * في الموقع كله**: ليست في `NAV_LINKS`، وكان هذا المُولّد يقرأ ثلاثة أنواع
     * فقط (`service` · `corridor` · `static`) — و`landing` خارجها. فصفحةٌ
     * مكتوبة ومنشورة لا يصلها أحد، ولا زاحفٌ يجد إليها طريقاً داخلياً.
     *
     * والإصلاح سطرٌ في **المُولّد** لا رابطٌ مكتوب باليد: أي صفحة هبوط ينشرها
     * المالك بعد اليوم تظهر وحدها، وإلغاء نشرها يُطفئ رابطها — وهو بالضبط ما
     * يُقصد بـ«التذييل يُبنى من القاعدة» في قرار الفجوة ٢٣.
     */
    getPagesByKind("landing", locale),
    getT("site.footer", locale),
    getT("site.nav", locale),
    getT("site.social", locale),
  ]);
  const socials = socialEntries(settings.socials, tSocial);
  const ownerName = settings.company.legalName ?? settings.brand.name;
  const fmt = createFormatter(locale);
  const year = fmt.digits(new Date().getFullYear());

  // NAV_LINKS مطلقة أصلاً («/#services») فتُستخدم كما هي — إضافة "/" هنا
  // كانت تنتج «//#services» وهو رابط بروتوكول-نسبي مكسور
  const nav = navLinks(tNav, locale);

  /**
   * 🔒 **العمود الذي لا يُطوى** — «تابع حجزك» ورابطا الحساب معاً.
   *
   * وثلاثتها تجيب سؤالاً واحداً («أين حجزي؟») فتقع طبيعياً في عمود، **وهو
   * بالضبط ما يجعل بقاءها مفتوحةً مبرَّراً**: لا تُطوى لأنها مهمة فحسب، بل
   * لأنها العمود الوحيد الذي يفتحه **عائدٌ** لا متصفّح — والعائد لا يمسح
   * التذييل بحثاً عن عنوانٍ يفتحه.
   */
  const bookingLinks = [
    ...nav.filter((link) => link.key === TRACK_LINK_KEY),
    ...accountLinks(tNav, locale),
  ];

  const sectionLinks = [
    ...nav.filter((link) => link.key !== TRACK_LINK_KEY),
    /**
     * 🔴 كل صفحة ثابتة منشورة — لا `/about` وحدها مكتوبةً باليد.
     *
     * **العيب المقيس الذي عالجه هذا السطر:** خريطة الموقع تُعلن `/contact`
     * و`/faq` للزاحف (وهما صفحتان منشورتان من نوع `static`)، **ولا رابط داخلي
     * واحد يقود إليهما في الموقع كله** — نفس صنف `/business` بالضبط. وصفحةٌ في
     * الخريطة بلا طريق داخلي صفحةٌ يتيمة: يعرفها الزاحف ولا يعرفها زائر، ولا
     * وزن داخلياً يصلها.
     *
     * وكان السطر السابق يكتب `/about` بيده — فحلّ العيبَ لصفحةٍ واحدة وأبقاه
     * لكل ما بعدها. والقراءة من القاعدة تجعله يشفى وحده: أي صفحة ثابتة ينشرها
     * المالك تظهر، وإلغاء نشرها يُطفئ رابطها. وهو بنصّه قرار الفجوة ٢٣.
     *
     * والصفحات القانونية الثلاث مستبعدة هنا لأن لها صفَّها المستقل أسفل التذييل
     * — وإلا ظهر كلٌّ منها مرتين في الصفحة نفسها.
     */
    ...statics
      .filter((page) => !LEGAL_SLUGS.has(page.slug))
      .map((page) => ({
        href: localeHref(`/${page.slug}`, locale),
        label: page.title,
      })),
    // صفحات الهبوط من القاعدة — عنوانها منها فيُحرَّر من اللوحة كأي صفحة
    ...landings.map((page) => ({
      href: localeHref(`/${page.slug}`, locale),
      label: page.title,
    })),
    /**
     * ⚠ **ورابطا الحساب غادرا هذا العمود إلى `bookingLinks` أعلاه** ولم
     * يُحذفا: هما **ثابتان بلا قراءة جلسة** كما كانا — وهذا شرطُ بقاء التذييل
     * خادمياً على كل صفحة (نفس مبرر جزيرة الترويسة، من الجهة الأخرى).
     *
     * وعرضُهما للجميع سليم: `/account/login` تُحوِّل صاحب الجلسة إلى «حجوزاتي»،
     * و«حجوزاتي» تلقى من لا جلسة له ببطاقة «سجّل دخولك» ومعها طريق `/track`.
     * فلا يقع أحدٌ على باب مغلق، **ومن عطّل JavaScript يجد الطريقين** في عمودٍ
     * لا يُطوى أصلاً بعد أن غابت عنه جزيرة الترويسة.
     */
  ];
  const serviceLinks = services.map((page) => ({
    href: localeHref(`/services/${page.slug}`, locale),
    label: page.title,
  }));
  const corridorLinks = corridors.map((page) => ({
    href: localeHref(`/routes/${page.slug}`, locale),
    label: page.title,
  }));

  // لا نعرض رابطاً لصفحة غير منشورة، والعنوان من نظام المحتوى إن عُدِّل من اللوحة
  const publishedStatics = new Map(statics.map((page) => [page.slug, page.title]));
  const legalLinks = LEGAL_PAGES.filter((page) => publishedStatics.has(page.slug)).map(
    (page) => ({
      href: localeHref(`/${page.slug}`, locale),
      label: publishedStatics.get(page.slug) || t(page.key, page.label),
    })
  );

  return (
    <footer className="border-t bg-muted/30">
      {/* يطوي الأعمدة على الجوال بعد الترطيب — والفشل يقع إلى «الكل مفتوح» */}
      <FooterAccordionSync />
      <div className="mx-auto w-full max-w-6xl px-4 py-8 sm:px-6 md:py-16">
        {/**
         * على الجوال: عمودٌ واحد بلا فجوة — الفصل يأتي من حدّ كل عمود
         * (`border-t` في `FooterLinkColumn`) فيمتد الخط عبر العرض كاملاً
         * ويُقرأ صفَّ أكورديون. وفوق `sm` تعود الفجوة والأعمدة.
         */}
        <div className="grid gap-0 sm:grid-cols-2 sm:gap-8 lg:grid-cols-[1.4fr_1fr_1fr_1fr_1fr] lg:gap-6">
          {/* الهوية */}
          <div className="flex max-w-sm flex-col gap-3 pb-6 sm:pb-0">
            <div className="flex items-center gap-3">
              {settings.brand.logoUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={settings.brand.logoUrl}
                  alt={settings.brand.name}
                  className="h-8 w-auto"
                />
              ) : (
                <>
                  <span
                    aria-hidden="true"
                    className="grid size-8 shrink-0 place-items-center rounded-lg bg-primary text-base font-bold text-primary-foreground"
                  >
                    {settings.brand.name.trim().charAt(0)}
                  </span>
                  <span className="text-base font-bold">{settings.brand.name}</span>
                </>
              )}
            </div>
            <p className="text-sm leading-6 text-muted-foreground">
              {settings.brand.tagline}
            </p>

            {/* الشبكات الاجتماعية المتوفرة فقط */}
            {socials.length > 0 ? (
              <ul className="mt-1 flex items-center gap-2">
                {socials.map((social) => {
                  const Icon = SOCIAL_ICONS[social.key];
                  return (
                    <li key={social.key}>
                      <a
                        href={social.href}
                        {...externalLinkProps(social.href)}
                        aria-label={social.label}
                        className="grid size-9 place-items-center rounded-lg text-muted-foreground ring-1 ring-border transition-colors hover:bg-primary hover:text-primary-foreground hover:ring-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60"
                      >
                        <Icon className="size-4" />
                      </a>
                    </li>
                  );
                })}
              </ul>
            ) : null}
          </div>

          {/* 🔒 أول الأعمدة ولا يُطوى: «تابع حجزك» ودخول العملاء و«حجوزاتي» */}
          <FooterLinkColumn
            title={t("booking", "حجزك وحسابك")}
            links={bookingLinks}
            keepOpen
          />
          <FooterLinkColumn title={t("sections", "أقسام الموقع")} links={sectionLinks} />
          <FooterLinkColumn title={t("services", "خدماتنا")} links={serviceLinks} />
          <FooterLinkColumn title={t("corridors", "مسارات شائعة")} links={corridorLinks} />
        </div>

        <Separator className="my-5 md:my-8" />

        {/* صف الصفحات القانونية — الشروط والاسترداد والخصوصية */}
        {legalLinks.length > 0 ? (
          <nav
            aria-label={t("legalNav", "الصفحات القانونية")}
            className="mb-4 flex flex-wrap items-center justify-center gap-x-2 gap-y-1 text-sm text-muted-foreground md:mb-6 md:justify-start"
          >
            {legalLinks.map((link, index) => (
              <Fragment key={link.href}>
                {/**
                 * الفاصل `aria-hidden` فلا يقع عليه شرط ١٫٤٫٣، **لكنه كان
                 * يفشل في غرضه هو**: `text-border` على أرضية التذييل الداكنة
                 * = ‏١٫٤:١ مقيسة — أي لا يراه المبصر أصلاً، فتلتصق الروابط
                 * الثلاثة بلا فاصل مرئي. و`/55` تعطي ‏٣٫٣٥:١: يُرى، ويبقى
                 * دون الروابط (‏٨٫٤٩:١) فلا يُقرأ كرابطٍ رابع.
                 */}
                {index > 0 ? (
                  <span aria-hidden="true" className="text-muted-foreground/55">
                    ·
                  </span>
                ) : null}
                <a
                  href={link.href}
                  className="rounded-md transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60"
                >
                  {link.label}
                </a>
              </Fragment>
            ))}
          </nav>
        ) : null}

        {/**
         * صفّ الذيل — كان **ثلاثة صفوف** على الجوال (`flex-col` + `gap-4`)
         * فأكل ~١٤٠ بكسل من ارتفاعٍ يشكو منه المالك. والمبدّل وخريطة الموقع
         * سطرٌ واحد الآن، وسطر الحقوق تحته.
         */}
        <div className="flex flex-col items-center gap-3 text-sm text-muted-foreground md:flex-row md:justify-between md:gap-4">
          <div className="flex flex-wrap items-center justify-center gap-x-3 gap-y-1 md:order-2">
            {/* صف اللغات مكشوفاً — من فاته المبدّل في الترويسة يجده هنا */}
            <LocaleSwitcher variant="inline" className="-mx-2" />
            <a
              href="/sitemap.xml"
              className="rounded-md transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60"
            >
              {t("sitemap", "خريطة الموقع")}
            </a>
          </div>
          <p className="text-center text-xs md:order-1 md:text-sm">
            {t("rights", "© {year} {owner} — جميع الحقوق محفوظة.", {
              year,
              owner: ownerName,
            })}
          </p>
        </div>
      </div>
    </footer>
  );
}
