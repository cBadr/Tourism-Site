import { Activity, TriangleAlert } from "lucide-react";

import { StatCardTile } from "@/components/stats/stat-cards";
import { HelpTip } from "@/components/shared/HelpTip";
import { Card } from "@/components/ui/card";
import type { StatSeries } from "@/lib/analytics-types";
import type { PagePulseData } from "@/lib/stats/pulse";
import { formatStatValue, type StatFormat } from "@/lib/stats/format";
import { statShortDateLabel } from "@/lib/stats/range";
import type { StatsFailure } from "@/lib/stats/read";
import { cn } from "@/lib/utils";

/**
 * شريط «نبض الصفحة» (الدفعة ٤ — الملاحظة ١٢) — العقد في `lib/pulse-types.ts`.
 *
 * يعلو شاشة العمل نفسها فيرى المدير مؤشرات مجالها **قبل أن يعمل فيه**، بلا
 * انتقال إلى قسم منفصل. ومكوّناته كلها **خادمية**: لا `"use client"`، ولا
 * مكتبة رسم، ولا سطر جافاسكربت واحد يصل المتصفح — وهو شرطٌ لا تفضيل، فكل هذا
 * يقع تحت `/admin` حيث **D-44** يمنع أي وسم قياس خارجي.
 *
 * ثلاثة سلوكيات تستحق الذكر:
 *
 * (١) **لا شريط بلا بطاقة.** قسمٌ لم يُرجع بطاقة واحدة لا يترك إطاراً فارغاً
 *     على الشاشة — يختفي الشريط كلياً. الفراغ المؤطَّر يوحي بعطل حيث لا عطل.
 *
 * (٢) **الفشل سطرٌ لا لوحة.** شاشات `/admin/stats` تعرض `StatsNotReady` بحجمها
 *     الكامل لأن الأرقام هي موضوعها. أما هنا فالموضوع جدولُ عملٍ تحته، فرسالةٌ
 *     بحجم البطاقات تصادر الشاشة لأجل زينتها. السبب يُذكر في سطر واحد بنبرة
 *     تنبيه، والعمل يكمل.
 *
 * (٣) **الشرارة تُقرأ رقماً كما تُرى شكلاً.** آخر قيمة مكتوبة بجوارها وقمّتها في
 *     وصفها، فمن لا يميّز الأشكال ومن يتصفح بقارئ شاشة لا يخسر المعلومة.
 *
 * (٤) **ولا يُطبع** (الدفعة ٤ — الملاحظة ٦): الشريط سياقٌ يسبق العمل لا محتوى
 *     الشاشة، وشرارته مساحةٌ ملوّنة تخرج بيضاء على الورق أصلاً لأن الطابعة لا
 *     تطبع الخلفيات. والصنف `no-print` مكتوب **هنا** لا في مُحدِّد هشّ من نوع
 *     `section[aria-label="مؤشرات هذه الشاشة"]`: تسميةٌ عربية للوصول لا يجوز أن
 *     تصير عقداً بين ملفين — تُحرَّر يوماً فيعود الشريط إلى الورق بلا أن ينتبه
 *     أحد. والصنف على **كلا** المخرجين، فرسالة تعذّر القراءة لا تُطبع كذلك.
 */

// ---------------------------------------------------------------------------
// الشرارة — SVG مصغّر بلا محاور ولا مكتبة
// ---------------------------------------------------------------------------

const SPARK_W = 240;
const SPARK_H = 44;
const SPARK_PAD = 4;

/**
 * خط صغير يصف **شكل** الحركة لا مقدارها.
 *
 * الزمن يجري من اليمين إلى اليسار كما في `StatChart`: الواجهة عربية، وSVG لا
 * يعرف الاتجاه — فالعكس صريح في `x()` أدناه لا بخاصية CSS.
 *
 * ولا علامة على أي محور: الشرارة تُقرأ مع الرقم المكتوب بجوارها، ومحورٌ بأرقام
 * مشتقّة داخل ٤٤ بكسل يكذب أكثر مما يفيد.
 */
function PulseSpark({
  series,
  format,
  currency,
  title,
}: {
  series: StatSeries;
  format: StatFormat;
  currency: string;
  title: string;
}) {
  const points = series.points;
  if (points.length < 2) return null;

  let peak = 0;
  for (const p of points) if (Number.isFinite(p.value) && p.value > peak) peak = p.value;

  const n = points.length;
  const band = (SPARK_W - SPARK_PAD * 2) / n;
  const x = (i: number) => SPARK_W - SPARK_PAD - (i + 0.5) * band;
  // القسمة محروسة: فترة بلا نشاط (`peak = 0`) تضع كل النقاط على خط الأساس
  const y = (v: number) =>
    peak > 0
      ? SPARK_H - SPARK_PAD - (v / peak) * (SPARK_H - SPARK_PAD * 2)
      : SPARK_H - SPARK_PAD;

  const line = points.map((p, i) => `${x(i)},${y(p.value)}`).join(" ");
  const area = `${x(0)},${SPARK_H - SPARK_PAD} ${line} ${x(n - 1)},${SPARK_H - SPARK_PAD}`;

  const last = points[n - 1];
  const first = points[0];

  return (
    <svg
      viewBox={`0 0 ${SPARK_W} ${SPARK_H}`}
      role="img"
      aria-label={`${title} — من ${statShortDateLabel(first.bucket)} إلى ${statShortDateLabel(
        last.bucket
      )}، أعلى قيمة ${formatStatValue(peak, format, currency)}، وآخر يوم ${formatStatValue(
        last.value,
        format,
        currency
      )}`}
      className="h-11 w-full max-w-60"
      preserveAspectRatio="none"
    >
      <polygon points={area} className="fill-primary/10" />
      <polyline
        points={line}
        fill="none"
        strokeWidth={1.75}
        strokeLinejoin="round"
        strokeLinecap="round"
        className="stroke-primary"
        vectorEffect="non-scaling-stroke"
      />
      {/* آخر يوم مُعلَّم: العين تبحث عن «أين نحن الآن» لا عن كل النقاط */}
      <circle cx={x(n - 1)} cy={y(last.value)} r={2.6} className="fill-primary" />
    </svg>
  );
}

// ---------------------------------------------------------------------------
// تعذّر القراءة — سطر واحد لا لوحة
// ---------------------------------------------------------------------------

const FAILURE_LINES: Record<StatsFailure, string> = {
  migration:
    "طبقة النبض غير منفَّذة في قاعدة البيانات — نفِّذ 0034_page_pulse.sql بأمر pnpm db:migrate.",
  forbidden: "مؤشرات هذه الشاشة للمديرين فقط — حسابك الحالي لا يقرؤها.",
  input: "رفضت قاعدة البيانات مُدخلات هذه القراءة (قسم مجهول أو فترة غير صالحة).",
  failed: "تعذّرت قراءة مؤشرات هذه الشاشة — راجع سجل الخادم؛ بقية الصفحة تعمل طبيعياً.",
};

function PulseNotice({ failure, wired }: { failure: StatsFailure | null; wired: boolean }) {
  return (
    <p className="flex items-start gap-2 rounded-lg border border-dashed border-border bg-muted/30 px-3 py-2 text-xs leading-relaxed text-muted-foreground">
      <TriangleAlert className="mt-0.5 size-3.5 shrink-0" />
      <span>
        {wired
          ? FAILURE_LINES[failure ?? "failed"]
          : "قاعدة البيانات غير مربوطة — مؤشرات هذه الشاشة تظهر بعد ضبط متغيرات البيئة."}
      </span>
    </p>
  );
}

// ---------------------------------------------------------------------------
// الشريط
// ---------------------------------------------------------------------------

export function PagePulse({
  data,
  className,
}: {
  /** نتيجة `readPagePulse` — و`null` تعني «هذه الشاشة بلا نبض بقرار» */
  data: PagePulseData | null;
  className?: string;
}) {
  if (!data) return null;

  const { cards, series, currency, seriesTitle, seriesFormat, rangeLabel } = data;

  // لم تصل البطاقات: سطر يسمّي السبب، ولا شبكة فارغة ولا أصفار مخترعة
  if (!cards.ready && cards.data.length === 0) {
    return (
      <div className={cn("no-print", className)}>
        <PulseNotice failure={cards.failure} wired={cards.failure !== null} />
      </div>
    );
  }

  if (cards.data.length === 0) return null;

  const spark = series.ready ? (series.data[0] ?? null) : null;
  const sparkFormat: StatFormat = seriesFormat;
  const last = spark && spark.points.length ? spark.points[spark.points.length - 1] : null;

  return (
    <section className={cn("space-y-3 no-print", className)} aria-label="مؤشرات هذه الشاشة">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {cards.data.map((card) => (
          <StatCardTile key={card.key} card={card} currency={currency} dense />
        ))}
      </div>

      {spark && seriesTitle && spark.points.length > 1 ? (
        <Card className="flex flex-wrap items-center gap-x-4 gap-y-2 p-3">
          <div className="flex min-w-0 items-center gap-1.5 text-xs text-muted-foreground">
            <Activity aria-hidden className="size-3.5 shrink-0 text-primary" />
            <span className="truncate font-medium">{spark.label}</span>
            <HelpTip>
              {seriesTitle}. كل يوم نقطة حتى لو كان صفراً — رسمٌ يقفز فوق الأيام الفارغة
              يجعل أسبوعاً بلا عمل يبدو خطاً متصلاً. والزمن يجري من اليمين (الأقدم) إلى
              اليسار (اليوم).
            </HelpTip>
          </div>
          <PulseSpark
            series={spark}
            format={sparkFormat}
            currency={currency}
            title={seriesTitle}
          />
          {last ? (
            <span className="text-xs text-muted-foreground">
              آخر يوم:{" "}
              <span dir="ltr" className="font-bold text-foreground">
                {formatStatValue(last.value, sparkFormat, currency)}
              </span>
            </span>
          ) : null}
        </Card>
      ) : null}

      <p className="text-[11px] text-muted-foreground">
        البطاقات تقيس {rangeLabel} ومقارنتها بالفترة السابقة المكافئة — كل رقم محسوب في
        قاعدة البيانات. التحليل الكامل بفترة تختارها في{" "}
        <span className="font-medium">الإحصائيات</span>.
      </p>
    </section>
  );
}
