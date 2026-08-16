import type { SectionContentMap } from "@/lib/content-types";
import { DEFAULT_LOCALE } from "@/lib/i18n-types";
import { getT } from "@/lib/i18n/content";

/**
 * جدول — **أعلى الكتل الأربع قيمةً**، وسببه مقيسٌ في المحتوى القائم لا مقدَّر.
 *
 * صفحة الاسترداد تحمل اليوم نوافذ إلغاء (٢٤ · ٤٨ · ٧٢ ساعة) وخصومات (٢٥٪ ·
 * ٥٠٪) وانتظاراً مجانياً (١٥ · ٣٠ · ٦٠ دقيقة) — **كلها مدفونة في نثر**، موزّعةً
 * على ثلاث فقرات. وسؤال الزائر واحد: «كم أخسر لو ألغيت غداً؟». الجواب يجب أن
 * يُقرأ في ثانيتين، **وذاك جدولٌ لا فقرة**.
 *
 * ── ثلاثة قرارات ────────────────────────────────────────────────────────────
 *
 * (١) 🔴 **التمرير الأفقي داخل حاويته، والصفحة لا تتزحزح أبداً.** الجدول
 *     `min-w-*` داخل `overflow-x-auto`: يحتفظ بعرضٍ يُقرأ ويمرّر نفسه، ولا
 *     يدفع `<body>` إلى تمريرٍ جانبي — وتمريرٌ جانبي على مستند كامل يكسر
 *     الصفحة كلها لا الجدول وحده.
 *
 * (٢) **والحاوية الممرِّرة `role="region"` و`tabIndex=0` باسمٍ صريح.** منطقةٌ
 *     تمرَّر بالفأرة ولا تُبلغ لوحة المفاتيح جدولٌ لا يصله مستخدم كيبورد ولا
 *     قارئ شاشة. وهذا هو الشرط الذي يجعل «التمرير الأفقي» حلاً لا حيلة.
 *
 * (٣) **العنوان `<caption>` لا `<h3>` سابح.** الوسم يربط الاسم بالجدول نفسه،
 *     فينطقه قارئ الشاشة عند دخوله؛ وعنوانٌ منفصل فوقه يترك الجدول بلا اسم
 *     لمن يتنقل بين الجداول.
 *
 * ⚠ **وصفر لونٍ مكتوب**: الترويسة `bg-muted` والحدود `border-border` — رموزٌ
 * تنقلب مع الأرضية وحدها، فيوم يأتي مبدّل م‑٩ لا يحتاج هذا الملف سطراً.
 */

/** أربعة أعمدة سقفاً — والسقف قرارُ عنونةٍ لا حدُّ شاشة (‏`lib/content-types.ts`) */
const COLUMNS = [1, 2, 3, 4] as const;

type Row = SectionContentMap["table"]["items"][number];

const cellOf = (row: Row, index: number): string =>
  ((row as Record<string, unknown>)[`c${index}`] as string | undefined)?.trim() ?? "";

export async function TableSection({
  content,
  locale = DEFAULT_LOCALE,
}: {
  content: SectionContentMap["table"];
  locale?: string;
}) {
  const headers = COLUMNS.map(
    (index) => ((content as Record<string, unknown>)[`h${index}`] as string | undefined)?.trim() ?? ""
  );

  // الصفّ الفارغ تماماً يُسقَط — سطرٌ من شرطات أسوأ من سطرٍ غائب
  const rows = (content.items ?? []).filter((row) =>
    COLUMNS.some((index) => cellOf(row, index) !== "")
  );
  if (rows.length === 0) return null;

  /**
   * عدد الأعمدة **يُقاس من المحتوى ولا يُضبط بمقبض**: آخر عمودٍ فيه ترويسة أو
   * خلية. فحذفُ عمودٍ من الجدول = تفريغ حقوله، لا مقبضٌ ثانٍ قد يخالف ما هو
   * مكتوب فيه (وعمودٌ «معلن» بخلايا مملوءة كان سيخفي بياناتٍ صامتاً).
   */
  const columnCount = COLUMNS.reduce(
    (count, index) =>
      headers[index - 1] !== "" || rows.some((row) => cellOf(row, index) !== "")
        ? index
        : count,
    0
  );
  if (columnCount === 0) return null;

  const columns = COLUMNS.slice(0, columnCount);
  const hasHeader = columns.some((index) => headers[index - 1] !== "");
  const t = await getT("sections.table", locale);
  const title = (content.title ?? "").trim();
  const note = (content.note ?? "").trim();

  return (
    <section className="py-7 md:py-9">
      <div className="mx-auto w-full max-w-wrap px-gut">
        {/*
          ⚠ **الجدول لا يلبس عرض القراءة (‏`prose-measure`) بقصد.** حدّ الـ٦٥–٧٥
          محرفاً قاعدةُ **نثرٍ متصل** يتتبعه العين سطراً بعد سطر؛ وأربعة أعمدة
          داخل ٣٤em تصير خلايا بكلمةٍ في السطر — أي أن القاعدة نفسها التي تجعل
          الفقرة مقروءة تجعل الجدول غير مقروء. فيأخذ عمودَه الأوسع (٨٤٠px)،
          وهو **نفس الاستثناء** الذي منع فرض العرض عالمياً على الويدجت والجداول.
        */}
        <div className="mx-auto w-full max-w-wrap-narrow">
          <div
            role="region"
            aria-label={title || t("regionLabel", "جدول قابل للتمرير أفقياً")}
            tabIndex={0}
            className="overflow-x-auto rounded-2xl ring-1 ring-border focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60"
          >
            {/*
              `min-w-[34rem]` هي التي تجعل التمرير تمريراً: بدونها ينضغط الجدول
              على الهاتف حتى تصير كل خليةٍ كلمةً في سطر — وهو «يعمل» بصرياً
              ويُتلف المقارنة التي بُني الجدول لأجلها.
            */}
            <table className="w-full min-w-[34rem] border-collapse text-start text-body">
              {title ? (
                <caption className="px-4 pb-3 pt-4 text-start text-h3 font-bold">
                  {title}
                </caption>
              ) : null}

              {hasHeader ? (
                <thead>
                  <tr className="bg-muted">
                    {columns.map((index) => (
                      <th
                        key={index}
                        scope="col"
                        className="border-b border-border px-4 py-3 text-start font-bold"
                      >
                        {headers[index - 1]}
                      </th>
                    ))}
                  </tr>
                </thead>
              ) : null}

              <tbody>
                {rows.map((row, rowIndex) => (
                  <tr
                    // `_k` مفتاح العنصر الثابت — ومفتاح React معه، فلا يُعاد
                    // بناء الصفّ عند إعادة الترتيب (العقد §٤)
                    key={(row as { _k?: string })._k ?? `row-${rowIndex}`}
                    className="border-b border-border/60 last:border-b-0"
                  >
                    {columns.map((index) =>
                      /**
                       * الخلية الأولى **ترويسةُ صفٍّ** حين يوجد رأسٌ للأعمدة:
                       * «٢٤ ساعة» تصف صفَّها كما يصف «الرسوم» عمودَه، وبلا
                       * `scope="row"` يقرأ قارئ الشاشة الأرقام بلا ما تنتمي
                       * إليه — أي جدولٌ يُنطق بلا معنى.
                       */
                      hasHeader && index === 1 ? (
                        <th
                          key={index}
                          scope="row"
                          className="px-4 py-3 text-start font-semibold"
                        >
                          {cellOf(row, index)}
                        </th>
                      ) : (
                        <td key={index} className="px-4 py-3 text-start text-muted-foreground">
                          {cellOf(row, index)}
                        </td>
                      )
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {note ? (
            <p className="mt-3 text-sm leading-relaxed text-muted-foreground">{note}</p>
          ) : null}
        </div>
      </div>
    </section>
  );
}
