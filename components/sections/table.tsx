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
 *     ⚠ **وهذا صوابٌ لأربعة أعمدة، وكان عطلاً لعمودين.** المراجعة البصرية
 *     (2026-08-16) قاست على ٣٧٥px: الجداول الثلاثة عشر كلها بعمودين، وعمودُ
 *     **الجواب** — «كم أخسر» — يقع خارج الشاشة خلف سحبة. والجدول بُني ليُقرأ
 *     الجواب في ثانيتين، فحلٌّ يخفيه ينقض غرضه. فصار الفرز بعدد الأعمدة:
 *     **عمودان ⇐ بطاقاتٌ رأسية تحت `md`** (الاسم فوق والقيمة تحته، ولا سحب)،
 *     **وثلاثة فأكثر ⇐ التمرير الأفقي كما هو** — فهناك لا «جواب» واحد بل
 *     مصفوفةُ مقارنةٍ تفقد معناها إن فُكّت.
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

/**
 * حدّ التكديس: عمودان فأقل يتحوّلان بطاقاتٍ على الجوال، وثلاثة فأكثر يمرَّرون.
 *
 * والفرق ليس في العدد بل في **ما يفعله العمود الثاني**: في جدولٍ بعمودين هو
 * الجواب نفسه، فإخفاؤه إخفاءُ الجدول. وفي جدولٍ بأربعة هو أحد أوجه المقارنة،
 * وفكُّ الصفّ إلى بطاقةٍ يُلغي المقارنة التي بُني الجدول لأجلها.
 */
const STACK_MAX_COLUMNS = 2;

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

  /**
   * نقطة الكسر `md` (‏768px) — **مقيسةٌ من المحتوى القائم لا مقدَّرة.**
   *
   * الثلاثة عشر جدولاً كلها بعمودين، وقياسُ أطول خليتين فيها: العمود الأول
   * يبلغ ٥٩ محرفاً («أقل من ٤ ساعات، أو بعد تحرّك السائق فعلاً…») والثاني
   * **٢٤٨ محرفاً** من نثرٍ متصل (بند «بيانات تقنية» في الخصوصية). فالعمود
   * الثاني هنا **فقرةٌ لا رقم**، ويحتاج ٤٥ محرفاً في السطر كي يبقى نثراً،
   * والأول نحو ٢٠ — أي ≈٧٠٠px للجدول بعد حشو الخلايا. وحاويةُ الصفحة
   * (`max-w-wrap-narrow` ناقص `--gut`) لا تبلغ ذلك إلا عند إطار ٧٦٨px:
   * ٧٦٨ − ٢×٢٥ ≈ ٧١٨px. وتحتها يضمر عمود الجواب شريطاً، وعلى ٣٧٥px يخرج
   * من الشاشة أصلاً.
   *
   * ⚠ و`sm` (‏640px) كانت ستُبقيه داخل الشاشة (٥٩٥px متاحة > `min-w-[34rem]`)
   * **لكنها تقيس الظهور لا القراءة**: ٣٤٠px لفقرة ٢٤٨ محرفاً = سبعة أسطر
   * بأربعين محرفاً — تقنياً ظاهر، وعملياً عمودٌ مضغوط. فاخترنا الحدّ الذي
   * يجعل العمودين **يُقرآن** لا الذي يجعلهما يظهران.
   */
  const stacked = columnCount <= STACK_MAX_COLUMNS;

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
          {/*
            ── البطاقات: **تصييرٌ ثانٍ لا حيلةُ CSS على الجدول نفسه** ───────────
            النمط الشائع يكدّس الجدول بتغيير `display` على `tr`/`td`، وهو يمسح
            دلالة الجدول من شجرة الإتاحة (الأدوار تتبع نوع العرض) فتُعاد بيد
            بـ`role="row"` و`role="cell"` و`::before` بالعنوان — أي دلالةٌ
            مُرمَّمة وعنوانٌ من محتوًى مولَّد يقرؤه بعض القرّاء ولا يقرؤه بعض.
            وبنيتان مستقلّتان تُخفى إحداهما بـ`display:none` **تخرج من شجرة
            الإتاحة كلياً**، فيرى كلُّ إطارٍ بنيةً صحيحةً واحدة: قائمةُ أسماء
            وقيم على الجوال، وجدولٌ كامل الدلالة فوقها. والثمن تكرارُ النص في
            الـHTML — وهو رخيصٌ هنا: أطول جدول عشرة صفوف بعمودين.
          */}
          {stacked ? (
            <div className="md:hidden">
              {/*
                هنا `<h3>` لا `<caption>`: البطاقات ليست جدولاً، والقرار (٣)
                يخصّ الجدول. والمستوى ثالثٌ لأن عنوان البند فوقه `<h2>`
                (‏`components/sections/clause.tsx`) — فلا قفزة في الترتيب.
              */}
              {title ? <h3 className="text-h3 font-bold">{title}</h3> : null}

              <ul className={`flex flex-col gap-3${title ? " mt-4" : ""}`}>
                {rows.map((row, rowIndex) => {
                  const head = cellOf(row, 1);
                  /** أعمدة القيمة = ما بعد الأول، والخلية الفارغة تُسقط لا تُعرض فارغة */
                  const pairs = columns
                    .filter((index) => index !== 1)
                    .map((index) => ({
                      index,
                      label: headers[index - 1],
                      value: cellOf(row, index),
                    }))
                    .filter((pair) => pair.value !== "");
                  /**
                   * `<dl>` **حين يكون لكل قيمةٍ اسمٌ فعلاً**. و`<dd>` بلا `<dt>`
                   * ترميزٌ باطل، فجدولٌ بلا صفّ ترويسة يسقط إلى فقراتٍ عادية
                   * بدل أن يدّعي دلالةَ اسمٍ وقيمة لا وجود لها.
                   */
                  const named = pairs.length > 0 && pairs.every((pair) => pair.label !== "");

                  return (
                    <li
                      // نفس مفتاح الصفّ في الجدول (العقد §٤) — إعادةُ الترتيب
                      // لا تُعيد بناء البطاقة
                      key={(row as { _k?: string })._k ?? `card-${rowIndex}`}
                      className="rounded-2xl p-4 ring-1 ring-border"
                    >
                      {head ? (
                        <p className="font-semibold break-words">{head}</p>
                      ) : null}

                      {named ? (
                        <dl className={`flex flex-col gap-1${head ? " mt-2" : ""}`}>
                          {pairs.map((pair) => (
                            /*
                              `flex-wrap` لا سطرٌ مفروض لكلٍّ منهما — **والمحتوى
                              القائم هو من فرضه**: قيمُ العمود الثاني تتراوح بين
                              «نعم» و**٢٤٨ محرفاً** من نثر. فسطرٌ مستقلٌّ لكل قيمة
                              يجعل عشرة صفوفٍ من «نعم/لا» (شروط §١) عشر بطاقاتٍ
                              بثلاثة أسطر لأجل كلمة، وسطرٌ واحدٌ مشترك يبتر الفقرة.
                              واللفّ يحسمها لكلٍّ بحسب طولها: الاسم والقيمة في سطر
                              حين يتّسعان، وتنزل القيمة سطراً كاملاً حين لا تتّسع.
                            */
                            <div
                              key={pair.index}
                              className="flex flex-wrap items-baseline gap-x-2"
                            >
                              <dt className="shrink-0 text-sm text-muted-foreground">
                                {pair.label}
                              </dt>
                              <dd className="min-w-0 break-words">{pair.value}</dd>
                            </div>
                          ))}
                        </dl>
                      ) : (
                        pairs.map((pair) => (
                          <p
                            key={pair.index}
                            className={`break-words text-muted-foreground${head ? " mt-2" : ""}`}
                          >
                            {pair.value}
                          </p>
                        ))
                      )}
                    </li>
                  );
                })}
              </ul>
            </div>
          ) : null}

          {/*
            ⚠ **الحاوية الممرِّرة تبقى كما هي حرفاً** — `role="region"` واسمُها
            و`tabIndex=0` وحلقةُ التركيز — **حيث يبقى التمرير**. وتحت `md` في
            حالة العمودين تختفي بـ`display:none`، فلا يبقى موضعُ تركيزٍ لا
            يمرّر شيئاً ولا اسمٌ يَعِد بتمريرٍ غير موجود.
          */}
          <div
            role="region"
            aria-label={title || t("regionLabel", "جدول قابل للتمرير أفقياً")}
            tabIndex={0}
            className={`overflow-x-auto rounded-2xl ring-1 ring-border focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60${
              stacked ? " hidden md:block" : ""
            }`}
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
