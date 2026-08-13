import type { SectionContentMap } from "@/lib/content-types";

/**
 * قسم النص الحر: يقسم `body` على الأسطر الفارغة إلى فقرات <p>
 * بعرض قراءة مريح، مع عنوان اختياري فوقها.
 */
export function RichTextSection({
  content,
}: {
  content: SectionContentMap["rich-text"];
}) {
  const paragraphs = (content.body ?? "")
    .split(/\r?\n\s*\r?\n/)
    .map((paragraph) => paragraph.trim())
    .filter(Boolean);

  if (paragraphs.length === 0 && !content.title) return null;

  return (
    <section className="py-16 md:py-20">
      <div className="mx-auto w-full max-w-3xl px-4 sm:px-6">
        {content.title ? (
          <h2 className="mb-6 text-balance text-2xl font-bold leading-snug tracking-tight sm:text-3xl">
            {content.title}
          </h2>
        ) : null}
        <div className="flex flex-col gap-5">
          {paragraphs.map((paragraph, index) => (
            <p
              key={index}
              className="text-pretty leading-8 text-muted-foreground sm:text-lg sm:leading-9"
            >
              {paragraph}
            </p>
          ))}
        </div>
      </div>
    </section>
  );
}
