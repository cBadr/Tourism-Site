import { Link2 } from "lucide-react";

import type { SectionContentMap } from "@/lib/content-types";
import { DEFAULT_LOCALE } from "@/lib/i18n-types";
import { getT } from "@/lib/i18n/content";
import { resolveAnchor } from "@/lib/item-fields-types";

/**
 * بندٌ مرقَّم بمرساة ثابتة — الوحدة التي تُبنى منها صفحةُ سياساتٍ تُقرأ.
 *
 * ── لماذا وُجدت هذه الكتلة ──────────────────────────────────────────────────
 *
 * صفحات الشروط والخصوصية والاسترداد مبنيةٌ اليوم من `rich-text` متتالية وحدها
 * (‏١١ · ١٠ · ٩ كتلة). والنصّ القانوني **يُمسح بالعين ولا يُقرأ سطراً سطراً**،
 * ووثيقةٌ من أحد عشر بنداً بلا خريطة ولا مراسٍ غير قابلة للاستعمال: لا يستطيع
 * المالك أن يرسل «§٤» لعميل، ولا يستطيع فريقه أن يشير إلى بندٍ بعينه.
 *
 * ── ثلاثة قرارات مكتوبة في هذا الملف ───────────────────────────────────────
 *
 * (١) 🔴 **المرساة تُسَكّ ولا تُشتقّ** (`resolveAnchor` — العقد
 *     `lib/item-fields-types.ts` §١٠). ولو اشتُقّت من العنوان العربي لأبطل
 *     **تصحيحُ حرفٍ واحد** كل رابطٍ أُرسل، **بلا ٤٠٤ ولا خطأ**: المتصفح يفتح
 *     الصفحة من أولها، فيقرأ العميل المقدمة ويظن أن البند غير موجود.
 *
 * (٢) **الرقم `<span>` داخل العنوان لا `::before` في CSS.** الترقيم محتوىً
 *     يكتبه المالك ويُترجَم («٤» ⇐ «4»)، وترقيمٌ من CSS لا يُنسخ مع النصّ ولا
 *     يسمعه قارئ الشاشة — والبند الذي لا يُنطق رقمه لا يمكن الإحالة إليه صوتاً.
 *
 * (٣) **زرّ الرابط ظاهرٌ دائماً وخافت، لا يظهر بالمرور.** `hover` غير موجود على
 *     الهاتف أصلاً، ومقبضٌ لا يراه إلا مستخدم الفأرة يعني أن نصف من يحتاج
 *     الرابط لا يعلم بوجوده.
 */
export async function ClauseSection({
  content,
  sectionId,
  locale = DEFAULT_LOCALE,
}: {
  content: SectionContentMap["clause"];
  /** معرّف الصفّ — مصدر المرساة الاحتياطية، فلا بندَ بلا مرساة إطلاقاً */
  sectionId: string;
  locale?: string;
}) {
  const title = (content.title ?? "").trim();
  if (title === "") return null;

  const t = await getT("sections.clause", locale);
  const anchor = resolveAnchor(sectionId, content.anchor);
  const num = (content.num ?? "").trim();

  // نفس قاعدة `rich-text`: سطرٌ فارغ = فقرة جديدة. مصدرٌ واحد للعُرف عبر الكتل.
  const paragraphs = (content.body ?? "")
    .split(/\r?\n\s*\r?\n/)
    .map((paragraph) => paragraph.trim())
    .filter(Boolean);

  return (
    <section id={anchor} className="scroll-mt-(--hdr-h) py-7 md:py-9">
      <div className="mx-auto w-full max-w-wrap px-gut">
        <div className="prose-ar">
          <h2 className="flex items-baseline gap-2.5 text-h3 font-bold">
            {num ? (
              /**
               * `aria-hidden` ممنوع هنا: الرقم **هو** ما يُحال إليه («البند
               * الرابع»)، فإخفاؤه عن قارئ الشاشة يجعل الوثيقة غير قابلة
               * للإحالة صوتاً — وهو عيبٌ لا يظهر لمن يرى.
               */
              <span className="shrink-0 tabular-nums text-primary">{num}</span>
            ) : null}
            {/*
              الرابط **ملاصقٌ للعنوان لا مطرودٌ إلى طرف السطر**: مقبضٌ في أقصى
              الجهة الأخرى يبدو زرَّ قسمٍ لا رابطَ بند، والمسافة بينه وبين ما
              يشير إليه هي ما يجعل القارئ لا يربط بينهما.
            */}
            <span className="min-w-0 text-balance">
              {title}
              <a
                href={`#${anchor}`}
                aria-label={t("anchorLabel", "رابط مباشر لهذا البند")}
                className="ms-2 inline-flex translate-y-0.5 rounded-md p-0.5 align-baseline text-muted-foreground/50 transition-colors hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60"
              >
                <Link2 className="size-4" aria-hidden="true" />
              </a>
            </span>
          </h2>

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
