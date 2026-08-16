import { ArrowLeft } from "lucide-react";
import type { SiteSettings } from "@/lib/site-config";
import { DEFAULT_LOCALE } from "@/lib/i18n-types";
import { getT } from "@/lib/i18n/content";
import { bookingHref, externalLinkProps } from "./links";

/**
 * شريط الدعوة للحجز: خلفية داكنة بلون العلامة مع توهج خفيف.
 * منذ المرحلتين ٣ و٤ الحجز الفوري يعمل فعلاً، فالزر يقود إلى صفحة الحجز دائماً.
 * `content` اختياري من نظام الأقسام — عند غيابه تُستخدم نصوص `site.cta`.
 */
export async function CtaBand({
  settings,
  content,
  locale = DEFAULT_LOCALE,
}: {
  settings: SiteSettings;
  content?: { title?: string; note?: string };
  locale?: string;
}) {
  const t = await getT("site.cta", locale);
  const booking = bookingHref(settings, locale);
  const label = t("action", "احسب سعرك واحجز الآن");

  return (
    <section className="py-6 md:py-10">
      <div className="mx-auto w-full max-w-6xl px-4 sm:px-6">
        <div className="site-cta-bg relative overflow-hidden rounded-3xl px-6 py-14 text-center text-primary-foreground sm:px-12 md:py-20">
          {/* زخرفة: نقاط خافتة وتوهج علوي */}
          <div aria-hidden="true" className="pointer-events-none absolute inset-0">
            <div className="site-dots absolute inset-0 opacity-20 [mask-image:radial-gradient(ellipse_70%_70%_at_50%_0%,black,transparent)]" />
            <div className="absolute -top-24 left-1/2 h-48 w-96 -translate-x-1/2 rounded-full bg-[color-mix(in_oklab,var(--primary-foreground)_14%,transparent)] blur-3xl" />
          </div>

          <div className="relative mx-auto flex max-w-2xl flex-col items-center gap-5">
            <h2 className="text-balance text-3xl font-extrabold leading-snug tracking-tight sm:text-4xl">
              {content?.title ?? t("title", "جاهز للانطلاق؟ سعرك أمامك في ثوانٍ")}
            </h2>
            {/**
             * 🔴 **بلا `/80` — والسبب قياسٌ على الشريط الحيّ لا ذوق.**
             *
             * أرضية الشريط تدرّجٌ لا لونٌ واحد، وأدكن توقّفٍ فيه
             * (‏`color-mix(--primary 78%, --ink)` = ‏`rgb(165,121,54)`) هو الذي
             * يحكم على النصّ فوقه. والنسب مقيسة عليه:
             *
             *     شفافية ١٠٠٪ ⇒ ٤٫٧٦:١   ← تعبر AA (المطلوب ٤٫٥ لنصّ عادي)
             *     شفافية  ٩٥٪ ⇒ ٤٫٥٢:١
             *     شفافية  ٨٠٪ ⇒ ٣٫٧٢:١   ← **كانت هنا، وتسقط دون AA**
             *
             * فالتدرّج البصري بين العنوان وهذه الفقرة يحمله **الحجم والوزن**
             * (‏٣٦px/٨٠٠ مقابل ١٨px/٤٠٠) لا خفضُ التباين — وهو تدرّجٌ يراه من
             * لا يميّز الدرجات أصلاً.
             *
             * ⚠ والهامش ٠٫٢٦ فقط: يوم تُضاف لوحةٌ ثانية (م‑٩) بلون علامةٍ أدكن
             *   يسقط هذا السطر بلا أن يمسّه أحد. القياس يُعاد عند تبديل اللوحة.
             */}
            <p className="text-pretty leading-8 sm:text-lg">
              {content?.note ??
                t(
                  "note",
                  "حدد نقطة الانطلاق والوصول وعدد الركاب، واختر السيارة المناسبة بسعر واضح — ثم أكّد حجزك مباشرة."
                )}
            </p>
            <a
              href={booking}
              {...externalLinkProps(booking)}
              className="mt-2 inline-flex h-12 items-center justify-center gap-2 rounded-2xl bg-primary-foreground px-8 text-base font-semibold text-primary shadow-lg transition-all hover:-translate-y-0.5 hover:shadow-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-foreground/60 focus-visible:ring-offset-2 focus-visible:ring-offset-transparent"
            >
              {label}
              <ArrowLeft className="size-5" aria-hidden="true" />
            </a>
          </div>
        </div>
      </div>
    </section>
  );
}
