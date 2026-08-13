import { ChevronDown } from "lucide-react";
import { SectionHeading } from "@/components/site/section-heading";
import type { SectionContentMap } from "@/lib/content-types";
import { DEFAULT_LOCALE } from "@/lib/i18n-types";
import { getT } from "@/lib/i18n/content";

/**
 * قسم الأسئلة الشائعة: أكورديون details/summary يعمل بلا JavaScript
 * (مفتوح للوحة المفاتيح وقارئات الشاشة)، ويُصدر بيانات FAQPage
 * المنظمة (JSON-LD) من نفس العناصر لتغذية نتائج البحث.
 */
export async function FaqSection({
  content,
  locale = DEFAULT_LOCALE,
}: {
  content: SectionContentMap["faq"];
  locale?: string;
}) {
  const items = (content.items ?? []).filter((item) => item.q && item.a);
  if (items.length === 0) return null;

  const t = await getT("sections.faq", locale);

  const faqJsonLd = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: items.map((item) => ({
      "@type": "Question",
      name: item.q,
      acceptedAnswer: { "@type": "Answer", text: item.a },
    })),
  };
  // استبدال "<" يمنع كسر وسم <script> لو تسللت القيمة من قاعدة البيانات
  const json = JSON.stringify(faqJsonLd).replace(/</g, "\\u003c");

  return (
    <section className="py-16 md:py-24">
      <div className="mx-auto w-full max-w-3xl px-4 sm:px-6">
        <SectionHeading
          eyebrow={t("eyebrow", "أسئلة شائعة")}
          title={content.title ?? t("title", "إجابات عن أكثر ما يسأل عنه عملاؤنا")}
        />

        <div className="mt-8 flex flex-col gap-3 md:mt-10">
          {items.map((item) => (
            <details
              key={item.q}
              className="group rounded-2xl bg-card ring-1 ring-border transition-shadow open:shadow-lg open:shadow-primary/5 open:ring-primary/25"
            >
              <summary className="flex cursor-pointer list-none items-center justify-between gap-4 rounded-2xl px-5 py-4 text-start font-bold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60 [&::-webkit-details-marker]:hidden">
                <span>{item.q}</span>
                <ChevronDown
                  className="size-5 shrink-0 text-muted-foreground transition-transform duration-300 group-open:rotate-180"
                  aria-hidden="true"
                />
              </summary>
              <p className="px-5 pb-5 leading-8 text-muted-foreground">
                {item.a}
              </p>
            </details>
          ))}
        </div>

        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: json }} />
      </div>
    </section>
  );
}
