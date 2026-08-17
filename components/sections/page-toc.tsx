import type { SectionContentMap } from "@/lib/content-types";
import { DEFAULT_LOCALE } from "@/lib/i18n-types";
import { getT } from "@/lib/i18n/content";

/**
 * فهرس الصفحة — خريطةُ وثيقةٍ من أحد عشر بنداً.
 *
 * ── القرار المحوري: القائمة تُبنى من الصفحة، ولا يكتبها المالك ──────────────
 *
 * لا `items` في هذه الكتلة بقصد. الفهرس يُجمَع في `RenderSections` من كتل
 * `clause` **الظاهرة على الصفحة نفسها وبترتيبها**، فيبقى مصدرُ عنوان البند
 * واحداً: البند.
 *
 * 🔴 **وعاقبة النقض مكتوبة لأنها لا تُرى:** فهرسٌ من `items` يعني نسخةً ثانية
 * من كل عنوان. والمالك يصحّح عنوان البند في مكانه — ولا يخطر له أن في الصفحة
 * نسخةً أخرى منه؛ ويعيد ترتيب البنود بالسحب — فيبقى الفهرس على ترتيبٍ لم يعد
 * قائماً. والنتيجة **فهرسٌ يعد بما لا تفي به الصفحة، ولا شاشة تقول ذلك**
 * (النمط ٤ في `LESSONS.md`).
 *
 * ⚠ **وثمنه مكتوب:** لا يستطيع المالك استثناء بندٍ من الفهرس ولا تسميتَه فيه
 * باسمٍ أقصر. ونقضُه حقلان في السجل يوم يُطلب.
 *
 * ── والعنصر `<nav>` لا `<div>` ─────────────────────────────────────────────
 *
 * هذه أداةُ تنقّل داخل المستند، وقارئ الشاشة يعرض معالم الصفحة بأسمائها:
 * `<nav>` باسمٍ صريح يجعل الفهرس **قابلاً للقفز إليه** بدل أن يُقرأ بالتتابع.
 * وهو أيضاً ما يجعل `@media print` في `globals.css` يُسقطه من الورق — قائمةُ
 * روابطٍ لا تُنقر على ورقة.
 */

/** بندٌ كما يراه الفهرس — يبنيه `RenderSections` ولا يقرأ هذا المكوّن الصفحة */
export type ClauseLink = {
  /** المرساة كما تُصيَّر فعلاً — من `resolveAnchor`، ومصدرها واحد للطرفين */
  anchor: string;
  num: string;
  title: string;
};

export async function PageTocSection({
  content,
  clauses,
  locale = DEFAULT_LOCALE,
}: {
  content: SectionContentMap["page-toc"];
  clauses: readonly ClauseLink[];
  locale?: string;
}) {
  /**
   * صفر بند ⇒ لا شيء. **وهذا هو الموضع الصحيح لهذا الحكم لا السجل**: البوابة
   * `blockRenders` تحكم على محتوى الكتلة وحدها، وشرطُ هذه الكتلة يقع **خارجها**
   * — في كتلٍ أخرى على الصفحة. فصندوق فهرسٍ بلا سطر واحد أسوأ من غيابه.
   */
  if (clauses.length === 0) return null;

  const t = await getT("sections.page-toc", locale);

  return (
    <nav
      aria-label={t("navLabel", "محتويات الصفحة")}
      className="py-6 md:py-8"
    >
      <div className="mx-auto w-full max-w-wrap px-gut">
        <div className="prose-measure rounded-2xl bg-card p-5 ring-1 ring-border sm:p-6">
          <h2 className="text-h3 font-bold">
            {content.title ?? t("title", "محتويات هذه الصفحة")}
          </h2>

          {/*
            `<ol>` لا `<ul>`: بنود الوثيقة **مرتّبة**، والترتيب معنى لا عرض.
            والترقيم من المحتوى (`num`) لا من المتصفح، فيبقى مطابقاً لما هو
            مكتوب في البند نفسه مهما اختلفت اللغة.

            وعمودٌ واحد لا عمودان: الفهرس يقف على **نفس محور** البنود التي
            يشير إليها، فيقرأ الزائر عموداً واحداً من أول الصفحة إلى آخرها.
            وعمودان بعرض سطر القراءة نفسه يعطيان سطرين مبتورين لا وفراً.
          */}
          <ol className="mt-4 flex flex-col">
            {clauses.map((clause) => (
              <li key={clause.anchor}>
                <a
                  href={`#${clause.anchor}`}
                  className="flex items-baseline gap-2 rounded-md py-1.5 text-body text-muted-foreground transition-colors hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60"
                >
                  {clause.num ? (
                    /* 🔴 كان `text-primary/80` — والشفافية هنا كانت تخفيتاً
                       زخرفياً ثمنه قابلية القراءة. المقيس على `/terms` حياً في
                       المظهر الفاتح: 3.86:1 (الحد 4.5)، لأن الـ٨٠٪ تخلط لون
                       الفعل بأرضيته فتأكل الفارق. واللون كامل الإعتام 6.37:1،
                       والرقم لا يحتاج تخفيتاً أصلاً: قياسه أصغر من العنوان
                       وموضعه يميّزه. */
                    <span className="shrink-0 tabular-nums text-primary">
                      {clause.num}
                    </span>
                  ) : null}
                  <span className="min-w-0">{clause.title}</span>
                </a>
              </li>
            ))}
          </ol>
        </div>
      </div>
    </nav>
  );
}
