import type { ReactElement, SVGProps } from "react";
import { Share2 } from "lucide-react";

import { PRINT_HIDDEN_CLASS, type ShareChannel } from "@/lib/export-types";
import { DEFAULT_LOCALE } from "@/lib/i18n-types";
import { getT } from "@/lib/i18n/content";
import { localeUrl } from "@/lib/seo";
import { getEnabledLocales } from "@/i18n/locales";
import { cn } from "@/lib/utils";
import { waShareHref } from "@/components/site/links";
import { CopyButton } from "@/components/booking/checkout/copy-button";
import {
  FacebookIcon,
  TelegramIcon,
  WhatsAppIcon,
  XIcon,
} from "@/components/site/social-icons";

/**
 * شريط «شارك هذه الصفحة» — نصف الملاحظة ٦ الظاهر للعالم: **النشر العام**.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * 🔒 لماذا لا يوضع هذا المكوّن على `/booking/[token]` أبداً — ولا مرة واحدة
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * لأن **رابط صفحة الرحلة هو بيانات الاعتماد نفسها، لا عنوانَ صفحةٍ تحميها كلمة
 * سر**. `get_booking_by_token` دالة `security definer` تأذن بحيازة نصّ التوكن
 * وحده — بلا جلسة ولا كلمة سر — ومن فتح الرابط قرأ اسم العميل وهاتفه وواتسابه
 * وإحداثيات التقاطه ووصوله وملاحظاته وسجلّ إيصالاته. والصفحة نفسها تقول له في
 * سطرٍ فوق الأزرار: «هو مفتاحك الوحيد لهذه الصفحة».
 *
 * فزرُّ «انشر على فيسبوك» فوق ذلك السطر لا «يشارك صفحة»، بل **ينشر مفتاحاً
 * حيّاً**، وثلاثة مسارات تسرّبه بلا نقرةٍ إضافية واحدة:
 *
 *   ١ **فاحصة المعاينة** — كل منصة في هذا الملف تجلب الرابط من خادمها هي لتبني
 *     البطاقة، فتخزّن نسخةً من العنوان في سجلٍّ لا نملكه ولا نمحوه.
 *   ٢ **ترويسة `referer`** — تحمل العنوان كاملاً إلى أي موقع يزوره من نقر.
 *   ٣ **سجلّ مختصر الروابط** — كل منصة تلفّ الروابط بمختصرها وتحفظ الأصل.
 *
 * ولا يكفي «إخفاء الزر»: البطاقة نفسها ممنوعة. ولذلك `generateMetadata` في
 * `app/booking/[token]/page.tsx` **لا تمرّ بـ`buildPageMetadata`** عمداً، وتردّ
 * `index:false, follow:false, nocache:true` — فلا تُبنى للصفحة بطاقة مشاركة
 * أصلاً. وما تحتاجه تلك الصفحة موجود فيها بالفعل وبنيّةٍ أخرى: **طباعة**،
 * و**نسخ الرابط**، و**إرسال إلى واتساب بلا رقم مستقبِل** (`waShareHref`) فيختار
 * العميل وجهته بنفسه — نيّة خاصة يملك طرفيها، لا نشر عام. والفرق ليس تجميلياً:
 * الأولى تضع الرابط في محادثةٍ يملكها، والثانية تضعه في فهرس.
 *
 * القرار محسوم مع المالك (2026-08-14) ونصّه في `lib/export-types.ts` §٥، ومنه
 * `BOOKING_SHARE_CHANNELS` — وهي `["whatsapp", "copy"]` لا هذه القنوات الخمس.
 *
 * ⚠ ومن أراد يوماً «توحيد الشريطين في مكوّن واحد بخيار `channels`» فليقرأ هذا
 * أولاً: التوحيد يجعل نشر مفتاح الحجز على فيسبوك **قيمةَ خاصية خاطئة** بدل أن
 * يكون استيراداً مستحيلاً. الحاجز الحقيقي أن هذا الملف لا يُستورَد هناك.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * وما عدا ذلك: مكوّن **خادمي بالكامل**. نيّات المشاركة روابط `<a href>` عادية
 * لا تحتاج جافاسكربت — تعمل بالنقر الأوسط وبالحفظ وبمن أطفأ السكربتات — وجزيرة
 * العميل الوحيدة هي `CopyButton` القائمة (الحافظة وحدها تحتاج المتصفح).
 */

/** ترتيب الأزرار — الاتحاد من العقد، فلا قناة تُضاف هنا بلا مرورها عليه */
const CHANNEL_ORDER: readonly ShareChannel[] = [
  "facebook",
  "x",
  "whatsapp",
  "telegram",
  "copy",
];

/**
 * بناة النيّات — نقطة الحقيقة الوحيدة لشكل كل رابط.
 *
 * وثلاث ملاحظات تمنع «تحسيناً» يكسرها:
 *   • **فيسبوك يتجاهل أي نص** ولا يقرأ إلا `u`؛ نصُّ البطاقة عنده من وسوم
 *     Open Graph التي يبنيها `buildPageMetadata` — فتمرير `quote` أو `text`
 *     إليه زيادةٌ لا أثر لها منذ أن أوقف المنصةُ العمل بها.
 *   • **واتساب بلا معامل `url`**: `wa.me` يعرف حقل `text` وحده، فالعنوان يُدمج
 *     في النص. ولذلك وحده يجمع الاثنين، وبقيّتها تفصلهما.
 *   • **`encodeURIComponent` على كل قيمة**: عنوان الصفحة عربي وفيه مسافات
 *     وشرطات، ومسارُنا قد يحمل `?` أو `&` — وترك أيٍّ منهما خاماً يقصّ الرابط
 *     عند أول محرف فاصل فتصل المنصةَ صفحةٌ أخرى.
 */
const SHARE_INTENT: Record<
  Exclude<ShareChannel, "copy">,
  (url: string, text: string) => string
> = {
  facebook: (url) =>
    `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(url)}`,
  x: (url, text) =>
    `https://x.com/intent/post?url=${encodeURIComponent(url)}&text=${encodeURIComponent(text)}`,
  whatsapp: (url, text) => waShareHref(`${text}\n${url}`),
  telegram: (url, text) =>
    `https://t.me/share/url?url=${encodeURIComponent(url)}&text=${encodeURIComponent(text)}`,
};

/** أيقونة كل قناة — من `social-icons.tsx` المضمّنة بلا أي تبعية جديدة */
const CHANNEL_ICONS: Record<
  Exclude<ShareChannel, "copy">,
  (props: SVGProps<SVGSVGElement>) => ReactElement
> = {
  facebook: FacebookIcon,
  x: XIcon,
  whatsapp: WhatsAppIcon,
  telegram: TelegramIcon,
};

/** أسماء المنصات بالعربية — احتياطي `getT` لمساحة `site.share` */
const CHANNEL_LABELS: Record<Exclude<ShareChannel, "copy">, string> = {
  facebook: "فيسبوك",
  x: "إكس",
  whatsapp: "واتساب",
  telegram: "تليجرام",
};

export async function ShareBar({
  /** عنوان **هذه** الصفحة كما تعرضه — لا نصّ مكتوب هنا (D-04) */
  title,
  /** وصف الصفحة — احتياطي العنوان وحده، انظر `headline` أدناه */
  description,
  /** المسار العربي الأصيل بادئاً بشرطة مائلة: `/routes/x` — بلا بادئة لغة */
  path,
  /** لغة الطلب الجارية */
  locale,
  className,
}: {
  title: string;
  description?: string | null;
  path: string;
  locale: string;
  className?: string;
}) {
  /**
   * **الرابط المنشور = الرابط القانوني لهذه الصفحة بلغتها**، ويُبنى بـ`localeUrl`
   * من `lib/seo.ts` لا بتركيب نصّي هنا. وهي التي تمرّ بـ`localePath`، فالعربية
   * تخرج بلا بادئة حرفياً (`https://…/routes/x`) والإنجليزية بـ`/en` — القاعدة
   * D-24. ومنطقُ رابطٍ واحد في المستودع كله: نسخةٌ ثانية هنا كانت ستنحرف يوم
   * يتغيّر شكل البادئة، فيُنشَر عنوانٌ يردّ ٤٠٤ ولا يشكو منه شيء.
   *
   * ولغة أطفأها المالك تسقط إلى العربية — نفس ما يفعله `buildPageMetadata`
   * بالضبط في `alternates.canonical` (D-25). والسبب هنا عملي فوق كونه قاعدة:
   * الصفحة بتلك اللغة `noindex`، ونشرُ عنوانٍ لا يُفهرَس هو نشرُ رابطٍ يجلب
   * زائراً واحداً ولا يبني وزناً — وشريط المشاركة إنما وُضع للوزن.
   */
  const enabled = await getEnabledLocales();
  const isEnabled = enabled.some((entry) => entry.code === locale);
  const shareUrl = localeUrl(isEnabled ? locale : DEFAULT_LOCALE, path);

  const t = await getT("site.share", locale);

  /**
   * نصّ النيّة = عنوان الصفحة، والوصفُ احتياطيّه عند خلوّه.
   *
   * ولا يُلحَق الوصف بالعنوان عمداً: منشور إكس محدود الطول، وكل منصة في هذا
   * الملف تقرأ `og:description` من البطاقة التي بناها `buildPageMetadata` أصلاً
   * — فإلحاقُه يكتب الوصف مرتين، مرةً في متن المنشور ومرةً تحته في البطاقة.
   */
  const headline = title.trim() || (description ?? "").trim();

  return (
    <section
      aria-label={t("regionLabel", "مشاركة الصفحة")}
      className={cn(PRINT_HIDDEN_CLASS, "pb-16 md:pb-24", className)}
    >
      <div className="mx-auto w-full max-w-3xl px-4 sm:px-6">
        {/* عمود على الجوال وصفّ على الشاشة — بلا أي صنف اتجاهي (`ms/me/text-start`
            وحدها لو لزمت)، فالكتلة تنقلب مع `dir` تلقائياً في العربية والإنجليزية */}
        <div className="flex flex-col gap-3 rounded-2xl border border-border bg-muted/40 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
          <p className="flex items-center gap-2 text-sm font-semibold">
            <Share2 className="size-4 shrink-0 text-primary" aria-hidden="true" />
            {t("heading", "شارك هذه الصفحة")}
          </p>

          {/* `shrink-0` كي ينكسر العنوان لا الأزرار — نفس علاج لافتة صفحة الرحلة */}
          <div className="flex shrink-0 flex-wrap items-center gap-2">
            {CHANNEL_ORDER.map((channel) => {
              if (channel === "copy") {
                return (
                  <CopyButton
                    key={channel}
                    value={shareUrl}
                    label={t("copyLabel", "رابط هذه الصفحة")}
                    variant="inline"
                  />
                );
              }

              const Icon = CHANNEL_ICONS[channel];
              const name = t(`channel.${channel}`, CHANNEL_LABELS[channel]);

              return (
                <a
                  key={channel}
                  href={SHARE_INTENT[channel](shareUrl, headline)}
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label={t("channelAria", "مشاركة على {name}", { name })}
                  className="inline-flex h-9 shrink-0 items-center justify-center gap-1.5 rounded-xl border border-border bg-background px-3 text-sm font-medium transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
                >
                  <Icon className="size-4 shrink-0" />
                  <span>{name}</span>
                </a>
              );
            })}
          </div>
        </div>
      </div>
    </section>
  );
}
