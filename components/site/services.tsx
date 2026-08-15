import { Fragment } from "react";
import {
  Building2,
  Landmark,
  MicVocal,
  PartyPopper,
  Plane,
  Route,
} from "lucide-react";
import {
  Card,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import type { ServiceDef } from "@/lib/site-config";
import { getPagesByKind } from "@/lib/content";
import { pagePublicPath } from "@/lib/seo/site-paths";
import { DEFAULT_LOCALE } from "@/lib/i18n-types";
import { getLocalizedServices, getT } from "@/lib/i18n/content";
import { localeHref } from "./links";
import { SectionHeading } from "./section-heading";

/** ربط حقل icon في بيانات الخدمات بأيقونات lucide المناسبة */
const SERVICE_ICONS: Record<ServiceDef["icon"], typeof Plane> = {
  plane: Plane,
  building: Building2,
  route: Route,
  landmark: Landmark,
  party: PartyPopper,
  mic: MicVocal,
};

/**
 * قسم الخدمات الست — بطاقات ترتفع بلطف عند التحويم.
 * `content` اختياري من نظام الأقسام — عند غيابه تُستخدم نصوص `site.services`.
 *
 * المرحلة ٨: أسماء الخدمات ووصفها من مساحة `service` في جدول الترجمات
 * (`getLocalizedServices`)، والحقل غير المترجم يبقى عربياً.
 *
 * ── والبطاقات تنقل الآن، ولم تكن ───────────────────────────────────────────
 * كانت الشبكة ست بطاقات **بلا عنصر رابط واحد** بينما صفحات الخدمات الست منشورة
 * بأقسامها، وزرُّ البطل «استكشف خدماتنا» يقود إلى `/#services` — أي إلى هذه
 * الشبكة الميتة بالضبط. والتذييل وحده كان يعرف الطريق إليها.
 *
 * 🔒 **والوجهة تُشتق من المنشور لا من `SERVICES`:** الثابت في `lib/site-config.ts`
 * قائمة عرضٍ (أيقونة ووصف)، وليس تعهّداً بأن للـ slug صفحةً حية. فلو اشتُقّ منه
 * الرابط لصارت البطاقة تشير إلى 404 لحظةَ يُلغي المالك نشر صفحة من اللوحة —
 * ولا خطأ يُنبّهه، فالبطاقة تبدو سليمة تماماً. فنقرأ `getPagesByKind("service")`
 * (وهي المنشور وحده — انظر `lib/content.ts`) ونربط بالـ slug: ما له صفحة يصير
 * رابطاً، وما لا صفحةَ له يبقى بطاقةً صامتة كما كانت. **إلغاء النشر يُطفئ الرابط
 * ولا يكسره.**
 *
 * وشكل المسار من `pagePublicPath` لا بقالب مكتوب هنا — هو المصدر الذي تقرؤه
 * خريطة الموقع وتحقّق مدير التحويلات معاً (`lib/seo/site-paths.ts`)، ونسخةٌ
 * ثانية منه تنحرف يوم يتغيّر شكل المسار.
 *
 * ⚠ وتبقى الشبكة محكومة بـ`SERVICES`: صفحة خدمة سابعة يُنشئها المالك لا تظهر
 * هنا لأن الأيقونة لا مصدر لها في `pages`. التذييل يعرضها، وهذا القسم لا.
 */
export async function ServicesSection({
  content,
  locale = DEFAULT_LOCALE,
}: {
  content?: { title?: string; sub?: string };
  locale?: string;
} = {}) {
  const [t, services, servicePages] = await Promise.all([
    getT("site.services", locale),
    getLocalizedServices(locale),
    getPagesByKind("service", locale),
  ]);

  /** slug ⇐ مسار الصفحة المنشورة — المفتاح الوحيد الذي يقرّر: أيربط أم لا */
  const publishedPaths = new Map(
    servicePages.map((page) => [page.slug, localeHref(pagePublicPath(page.kind, page.slug), locale)])
  );

  return (
    <section id="services" className="scroll-mt-24 py-20 md:py-28">
      <div className="mx-auto w-full max-w-6xl px-4 sm:px-6">
        <SectionHeading
          eyebrow={t("eyebrow", "خدماتنا")}
          title={content?.title ?? t("title", "ستة حلول نقل تغطي رحلتك من أولها لآخرها")}
          description={
            content?.sub ??
            t(
              "description",
              "من باب المطار إلى أبعد مزار — اختر الخدمة التي تناسبك، ودع الطريق علينا."
            )
          }
        />

        <div className="mt-12 grid gap-5 sm:grid-cols-2 lg:grid-cols-3 md:mt-16">
          {services.map((service) => {
            const Icon = SERVICE_ICONS[service.icon];
            const href = publishedPaths.get(service.slug);
            const card = (
              /*
               * `h-full` شرطٌ للرابط لا تجميل: البطاقة كانت عنصر شبكة مباشراً
               * فتمدّدها الشبكة إلى ارتفاع الصف (`stretch`). وبإدخال الرابط
               * بينهما صار المتمدّد هو الرابط، فتعود البطاقات إلى ارتفاعاتٍ
               * متفاوتة بحسب طول الوصف — انحدار بصري يصنعه الربط نفسه.
               */
              <Card className="h-full rounded-2xl ring-border transition-all duration-300 hover:-translate-y-1.5 hover:shadow-xl hover:shadow-primary/10 hover:ring-primary/30 [--card-spacing:--spacing(6)]">
                <CardHeader>
                  <div className="mb-3 grid size-12 place-items-center rounded-xl bg-primary/10 text-primary transition-colors duration-300 group-hover/card:bg-primary group-hover/card:text-primary-foreground">
                    <Icon className="size-6" aria-hidden="true" />
                  </div>
                  <CardTitle className="text-lg font-bold transition-colors duration-300 group-hover/card:text-primary">
                    {service.title}
                  </CardTitle>
                  <CardDescription className="leading-7">
                    {service.short}
                  </CardDescription>
                </CardHeader>
              </Card>
            );

            /*
             * البطاقة بلا صفحة منشورة تُعاد بـ`Fragment` لا بـ`div`: الغلاف
             * الإضافي يصير هو عنصر الشبكة فتفقد البطاقة تمدّدها — أي العيب نفسه
             * الذي عالجه `h-full` أعلاه، عائداً من الباب الآخر. و`Fragment` بلا
             * عقدة DOM فتبقى البطاقة عنصر الشبكة كما كانت حرفياً.
             */
            if (!href) return <Fragment key={service.slug}>{card}</Fragment>;
            /*
             * والرابط يلفّ البطاقة كلها لا كلمة داخلها: هدف نقر بحجم البطاقة على
             * الجوال، وحلقةُ تركيز واحدة لمن يتنقّل بلوحة المفاتيح. و`<a>` عادية
             * كما في الترويسة والتذييل والبطل — أسطح الموقع العام كلها كذلك.
             *
             * ولا نصّ «اعرف المزيد» عمداً: كل نص جديد يحتاج مفتاحاً في
             * `messages/*.json`، والمفتاح المفقود يسقط إلى نصّه العربي الاحتياطي
             * فيظهر عربياً على `/en`. فالإشارة بصرية بحتة — ارتفاع البطاقة
             * وتلوّن عنوانها — ولا حرف يحتاج ترجمة.
             */
            return (
              <a
                key={service.slug}
                href={href}
                className="block rounded-2xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60"
              >
                {card}
              </a>
            );
          })}
        </div>
      </div>
    </section>
  );
}
