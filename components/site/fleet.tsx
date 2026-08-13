import { Bus, BusFront, Car, CarFront, Users } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import type { VehicleClassDef } from "@/lib/site-config";
import { DEFAULT_LOCALE } from "@/lib/i18n-types";
import { getLocalizedVehicleClasses, getT } from "@/lib/i18n/content";
import { SectionHeading } from "./section-heading";

/** أيقونة مناسبة لكل فئة سيارات */
const FLEET_ICONS: Record<VehicleClassDef["slug"], typeof Car> = {
  sedan: CarFront,
  suv: Car,
  minibus: Bus,
  bus: BusFront,
};

/**
 * قسم الأسطول: فئات السيارات الأربع مع شارة عدد الركاب.
 * `content` اختياري من نظام الأقسام — عند غيابه تُستخدم نصوص `site.fleet`.
 *
 * المرحلة ٨: أسماء الفئات وسعتها ووصفها تأتي من مساحة `vehicle` في جدول
 * الترجمات (`getLocalizedVehicleClasses`)، والحقل غير المترجم يبقى عربياً.
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

        <div className="mt-12 grid gap-5 sm:grid-cols-2 lg:grid-cols-4 md:mt-16">
          {vehicles.map((vehicle) => {
            const Icon = FLEET_ICONS[vehicle.slug];
            return (
              <Card
                key={vehicle.slug}
                className="items-center rounded-2xl text-center ring-border transition-all duration-300 hover:-translate-y-1.5 hover:shadow-xl hover:shadow-primary/10 hover:ring-primary/30 [--card-spacing:--spacing(6)]"
              >
                <CardHeader className="w-full justify-items-center">
                  <div className="mb-3 grid size-14 place-items-center rounded-2xl bg-primary/10 text-primary transition-colors duration-300 group-hover/card:bg-primary group-hover/card:text-primary-foreground">
                    <Icon className="size-7" aria-hidden="true" />
                  </div>
                  <CardTitle className="text-lg font-bold">
                    {vehicle.title}
                  </CardTitle>
                  <Badge
                    variant="secondary"
                    className="mx-auto mt-1 h-6 gap-1.5 bg-primary/10 px-3 text-primary"
                  >
                    <Users className="size-3.5" aria-hidden="true" />
                    {vehicle.seats}
                  </Badge>
                  <CardDescription className="mt-2 leading-7">
                    {vehicle.short}
                  </CardDescription>
                </CardHeader>
              </Card>
            );
          })}
        </div>
      </div>
    </section>
  );
}
