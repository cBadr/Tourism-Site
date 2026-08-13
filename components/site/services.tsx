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
import { DEFAULT_LOCALE } from "@/lib/i18n-types";
import { getLocalizedServices, getT } from "@/lib/i18n/content";
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
 */
export async function ServicesSection({
  content,
  locale = DEFAULT_LOCALE,
}: {
  content?: { title?: string; sub?: string };
  locale?: string;
} = {}) {
  const [t, services] = await Promise.all([
    getT("site.services", locale),
    getLocalizedServices(locale),
  ]);

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
            return (
              <Card
                key={service.slug}
                className="rounded-2xl ring-border transition-all duration-300 hover:-translate-y-1.5 hover:shadow-xl hover:shadow-primary/10 hover:ring-primary/30 [--card-spacing:--spacing(6)]"
              >
                <CardHeader>
                  <div className="mb-3 grid size-12 place-items-center rounded-xl bg-primary/10 text-primary transition-colors duration-300 group-hover/card:bg-primary group-hover/card:text-primary-foreground">
                    <Icon className="size-6" aria-hidden="true" />
                  </div>
                  <CardTitle className="text-lg font-bold">
                    {service.title}
                  </CardTitle>
                  <CardDescription className="leading-7">
                    {service.short}
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
