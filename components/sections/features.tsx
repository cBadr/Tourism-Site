import { CircleCheck } from "lucide-react";
import {
  Card,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { SectionHeading } from "@/components/site/section-heading";
import { iconFor } from "@/components/sections/icons";
import { cn } from "@/lib/utils";
import type { SectionContentMap } from "@/lib/content-types";
import { DEFAULT_LOCALE } from "@/lib/i18n-types";
import { getT } from "@/lib/i18n/content";

/**
 * قسم المزايا: شبكة بطاقات (عنوان + نص + أيقونة) بنفس لغة بطاقات الخدمات —
 * ارتفاع لطيف عند التحويم وأيقونة بلون العلامة.
 *
 * 🆕 **م‑٧ — الأيقونة صارت للمالك.** كانت `CircleCheck` محفورةً لكل عنصر، وهو
 * قسمٌ يحمل اليوم «كيف نعمل» و«الضمانات الست» معاً (١٩ صفاً حيّاً) — والتصميم
 * يعطي لكل بطاقة رمزها. و`icon` اسمٌ من قائمة مغلقة (`ITEM_ICON_NAMES`) لا
 * حقل نصّ حرّ، **ولا يدخل فهرس الترجمة** (اسمُ مكوّن لا جملة).
 *
 * والغياب يرجع إلى `CircleCheck` حرفاً، فالصفحات القائمة لا تتغيّر ببايت.
 */
export async function FeaturesSection({
  content,
  locale = DEFAULT_LOCALE,
}: {
  content: SectionContentMap["features"];
  locale?: string;
}) {
  const items = (content.items ?? []).filter((item) => item.title);
  if (items.length === 0) return null;

  const t = await getT("sections.features", locale);

  return (
    <section className="bg-muted/40 py-16 md:py-24">
      <div className="mx-auto w-full max-w-6xl px-4 sm:px-6">
        {content.title ? (
          <SectionHeading
            eyebrow={t("eyebrow", "المزايا")}
            title={content.title}
            description={content.sub}
          />
        ) : null}

        <div
          className={cn(
            "grid gap-5 sm:grid-cols-2 lg:grid-cols-3",
            content.title && "mt-10 md:mt-14"
          )}
        >
          {items.map((item) => {
            /* المجهول يغيب ولا ينهار — والافتراضي هو الرمز الذي كان محفوراً */
            const Icon = iconFor(item.icon, CircleCheck);
            return (
            <Card
              key={item.title}
              className="rounded-2xl ring-border transition-all duration-300 hover:-translate-y-1.5 hover:shadow-xl hover:shadow-primary/10 hover:ring-primary/30 [--card-spacing:--spacing(6)]"
            >
              <CardHeader>
                <div className="mb-3 grid size-11 place-items-center rounded-xl bg-primary/10 text-primary">
                  {Icon ? <Icon className="size-6" aria-hidden="true" /> : null}
                </div>
                <CardTitle className="text-lg font-bold">{item.title}</CardTitle>
                {item.text ? (
                  <CardDescription className="leading-7">
                    {item.text}
                  </CardDescription>
                ) : null}
              </CardHeader>
            </Card>
            );
          })}
        </div>
      </div>
    </section>
  );
}
