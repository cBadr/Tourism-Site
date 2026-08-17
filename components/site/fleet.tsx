import Image from "next/image";
import { Bus, BusFront, Car, CarFront, Users } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { DEFAULT_LOCALE } from "@/lib/i18n-types";
import { getLocalizedVehicleClasses, getT } from "@/lib/i18n/content";
import { safeMediaSrc } from "@/components/sections/image";
import { RAIL_GRID_4, Rail, RailItem } from "@/components/sections/rail";
import type { IconComponent } from "@/components/sections/icons";
import { SectionHeading } from "./section-heading";

/**
 * أيقونة احتياطية لكل فئة — تظهر حين **لا صورة** للفئة وحدها.
 *
 * ⚠ ومفاتيحها `string` لا اتحادٌ من أربعة: `/admin/fleet` يسمح بإنشاء فئة
 * خامسة بأي slug، وخريطةٌ مقفلة كانت ستجعل الفئة الجديدة `undefined` عنصراً في
 * JSX ⇒ **صفحة عامة ساقطة**. فالمجهول يأخذ `Car` ولا يُسقط شيئاً.
 */
const FLEET_ICONS: Record<string, IconComponent> = {
  sedan: CarFront,
  suv: Car,
  minibus: Bus,
  bus: BusFront,
};

/**
 * قسم الأسطول: فئات السيارات مع شارة عدد الركاب وصورة الفئة.
 * `content` اختياري من نظام الأقسام — عند غيابه تُستخدم نصوص `site.fleet`.
 *
 * المرحلة ٨: أسماء الفئات وسعتها ووصفها تصل مترجمة من مساحة `vehicle`.
 *
 * ── م‑٧: المصدر صار **الجدول**، والصورة صارت تُقرأ ────────────────────────────
 *
 * 🔴 كان `getLocalizedVehicleClasses` يقرأ ثابت `VEHICLE_CLASSES` من
 * `lib/site-config.ts` — أي أن شاشة `/admin/fleet` تكتب في `vehicle_classes`
 * والموقع يعرض أرقاماً أخرى **مكتوبةً في الكود**. والفارق ليس تجميلياً:
 * الأهلية تُحسم في SQL بأرقام الجدول (D-12). فصار المصدر واحداً.
 *
 * والعمود `image_url` كان موجوداً منذ `0005`، و`null` في الصفوف الأربع، **ولا
 * شاشة تكتبه ولا عارضة تقرؤه**. الثلاثة عولجت: الهجرة `0065` تملؤه، وهذا
 * الملف يقرؤه، و`/admin/fleet` يحمل حقله.
 *
 * وبلا صورة تعود البطاقة إلى شكلها السابق **حرفاً**: أيقونة في مربّع بلون
 * العلامة، وعنوان، وشارة سعة، ووصف.
 */
export async function FleetSection({
  content,
  locale = DEFAULT_LOCALE,
}: {
  content?: { title?: string; sub?: string };
  locale?: string;
} = {}) {
  const [t, vehicles] = await Promise.all([
    getT("site.fleet", locale),
    getLocalizedVehicleClasses(locale),
  ]);

  return (
    <section id="fleet" className="scroll-mt-24 bg-muted/40 py-20 md:py-28">
      <div className="mx-auto w-full max-w-6xl px-4 sm:px-6">
        <SectionHeading
          eyebrow={t("eyebrow", "الأسطول")}
          title={content?.title ?? t("title", "فئة مناسبة لكل حجم رحلة")}
          description={
            content?.sub ??
            t(
              "description",
              "حدد عدد الركاب، ونرشح لك الفئة الأنسب — من رحلة فردية خفيفة إلى فوج كامل."
            )
          }
        />

        {/**
         * 🆕 **سكةٌ أفقية على الجوال — بأمر بدر بعد أن فتح الموقع على هاتفه:**
         * «تظهر السيارات تحت بعضها، وأري أنه من الأفضل أن تكون متجانبة مع خيار
         * تمرير مناسب **كما هو الحال في المسارات**».
         *
         * والآلية **مستوردة لا مكتوبة**: نفس `Rail` التي تحمل سكة المسارات
         * (‏القاعدة الذهبية ١٢). فحافةُ البطاقة الناقصة والاستقرارُ على بطاقةٍ
         * كاملة والتمريرُ بلوحة المفاتيح ونقاطُ المؤشّر — كلها تصل هنا بلا سطرٍ
         * واحد يُنسخ، ولا يمكن أن تنحرف إحدى السكتين عن أختها.
         *
         * والفرق الوحيد عن سكة المسارات سطرٌ في شبكة الديسكتوب: **أربعة أعمدة**
         * لا ثلاثة، لأن الفئات أربع فتقع كلها في صفٍّ واحد على الشاشة الواسعة —
         * وهو تخطيطها القائم حرفاً قبل هذا التغيير.
         */}
        <Rail
          id="fleetRail"
          label={t("railLabel", "فئات الأسطول")}
          gridClassName={RAIL_GRID_4}
          className="mt-12 md:mt-16"
        >
          {vehicles.map((vehicle) => {
            const Icon = FLEET_ICONS[vehicle.slug] ?? Car;
            /**
             * الصورة تمرّ من `safeMediaSrc` كأي مسارٍ من القاعدة: مسارٌ داخلي
             * أو أصل مضيف الوسائط وحده — فصفٌّ يكتبه مشرف لا يجلب طلباً من
             * نطاق غريب إلى صفحةٍ عامة.
             */
            const src = safeMediaSrc(vehicle.imageUrl);

            return (
              <RailItem key={vehicle.slug}>
              <Card
                className={cn(
                  "h-full overflow-hidden rounded-2xl ring-border transition-all duration-300 hover:-translate-y-1.5 hover:shadow-xl hover:shadow-primary/10 hover:ring-primary/30 [--card-spacing:--spacing(6)]",
                  src === null && "items-center text-center"
                )}
              >
                {src !== null ? (
                  /**
                   * نسبةٌ ثابتة (١٦:١٠) كي تبقى البطاقات متساوية مهما اختلفت
                   * أبعاد الملف الذي يرفعه المالك — وهو أول ما يلفت النظر لو
                   * تُرك للصورة أن تفرض ارتفاعها.
                   *
                   * و`alt=""`: اسم الفئة مكتوبٌ تحتها مباشرةً، فالصورة **زخرفة
                   * معلنة** لا صورةٌ صمّاء. ولا حقل نصٍّ بديل في `vehicle_classes`
                   * أصلاً — وإضافةُ عمودٍ له بندٌ لشاشة الأسطول لا لهذه المرحلة.
                   */
                  <div className="relative -m-[--card-spacing] mb-0 aspect-[16/10] w-[calc(100%+2*var(--card-spacing))]">
                    <Image
                      src={src}
                      alt=""
                      fill
                      /* مقيسٌ على السكة لا على الشبكة القديمة: البطاقة ٢٥٦ بكسل
                         على الجوال (`w-64`)، لا `100vw`. ورقمٌ خاطئ هنا يطلب
                         نسخةً أعرض بلا بكسل مرئي إضافي. */
                      sizes="(max-width: 767px) 256px, (max-width: 1023px) 50vw, 288px"
                      quality={55}
                      className="object-cover"
                    />
                  </div>
                ) : null}

                <CardHeader className={cn("w-full", src === null && "justify-items-center")}>
                  {src === null ? (
                    <div className="mb-3 grid size-14 place-items-center rounded-2xl bg-primary/10 text-primary transition-colors duration-300 group-hover/card:bg-primary group-hover/card:text-primary-foreground">
                      <Icon className="size-7" aria-hidden="true" />
                    </div>
                  ) : null}
                  <CardTitle className="text-lg font-bold">
                    {vehicle.title}
                  </CardTitle>
                  {vehicle.seats ? (
                    <Badge
                      variant="secondary"
                      className={cn(
                        "mt-1 h-6 gap-1.5 bg-primary/10 px-3 text-primary",
                        src === null && "mx-auto"
                      )}
                    >
                      <Users className="size-3.5" aria-hidden="true" />
                      {vehicle.seats}
                    </Badge>
                  ) : null}
                  {vehicle.short ? (
                    <CardDescription className="mt-2 leading-7">
                      {vehicle.short}
                    </CardDescription>
                  ) : null}
                </CardHeader>
              </Card>
              </RailItem>
            );
          })}
        </Rail>
      </div>
    </section>
  );
}
