import type { SectionContentMap } from "@/lib/content-types";

/**
 * قسم النص الحر: يقسم `body` على الأسطر الفارغة إلى فقرات <p>
 * بعرض قراءة مريح، مع عنوان اختياري فوقها.
 *
 * ── ما تغيّر في م‑١٠، ولماذا يخصّ هذا الملف بعينه ───────────────────────────
 *
 * هذه الكتلة هي **حاوية النثر الوحيدة في المنتج**، والصفحات الثابتة مبنيةٌ
 * منها متتاليةً (الشروط ١١ · الخصوصية ١٠ · الاسترداد ٩). وحاويتها كانت
 * `max-w-3xl` = ٧٦٨px، أي سطراً عربياً يقارب المئة محرف — والعين تفقد أول
 * السطر التالي عند هذا العرض، فتُقرأ الفقرة مرتين أو يُقفز سطر.
 *
 * فحلّ `prose-ar` محلّ العرض والإيقاع المكتوبين بالأدوات:
 *   `max-w-3xl` ⇐ عرض القراءة (‏`--measure-prose` ≈ ٦٨ محرفاً)
 *   `leading-8 sm:leading-9` ⇐ `--leading-arabic` (١٫٨٥ — رمز الثيم القائم)
 *   `gap-5` ⇐ إيقاع الفقرة (١٫١٥em)، فيتبع قياس الخطّ بدل أن يثبت على ٢٠px
 *
 * ⚠ **والقياسات صارت رموزاً**: `text-body` و`text-h3` من سلّم `@theme` لا
 * `sm:text-lg`/`text-2xl` — فقياسُ المتن يتبع سلّم التصميم في الصفحات كلها،
 * ونسخةٌ ثانية من العلامة تُطلق بتغيير سلّمٍ واحد لا بمطاردة أصنافٍ في ملفات.
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
    <section className="py-12 md:py-16">
      <div className="mx-auto w-full max-w-wrap px-gut">
        <div className="prose-ar">
          {content.title ? (
            <h2 className="text-balance text-h3 font-bold">{content.title}</h2>
          ) : null}
          {paragraphs.map((paragraph, index) => (
            <p key={index} className="text-body text-muted-foreground">
              {paragraph}
            </p>
          ))}
        </div>
      </div>
    </section>
  );
}
