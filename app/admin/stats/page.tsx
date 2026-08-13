import Link from "next/link";
import { ArrowLeft, BarChart3, Filter, LineChart } from "lucide-react";

import { StatChart } from "@/components/stats/stat-chart";
import { StatFunnel } from "@/components/stats/stat-funnel";
import { StatRangeFilter } from "@/components/stats/stat-range";
import {
  StatsHeader,
  StatsNotReady,
  StatsPanel,
  StatsSectionNav,
} from "@/components/stats/stats-ui";
import { Card } from "@/components/ui/card";
import type { StatSeries } from "@/lib/analytics-types";
import {
  FUNNEL_SCOPE_NOTE,
  type FunnelSummaryRow,
  hasFunnelValues,
  type LoadedStatCard,
  sideFromSummary,
  stagesFromCards,
  stagesFromSummary,
} from "@/lib/stats/cards";
import {
  blankRead,
  hasSupabaseEnv,
  pickSeries,
  readFunnelSeries,
  readFunnelSummary,
  readSectionCards,
  readStatsCurrency,
} from "@/lib/stats/read";
import { resolveStatRange, statRangeQuery } from "@/lib/stats/range";
import { STAT_SECTIONS } from "@/lib/stats/sections";
import { createServerSupabase } from "@/lib/supabase/server";

/**
 * الإحصائيات — النظرة العامة: القمع كاملاً ثم أبواب الأقسام الستة.
 *
 * سؤال هذه الشاشة واحد: **أين يتسرّب الزوار بين البحث والدفع؟** ولذلك لا تحمل
 * إلا القمع وشكله عبر الزمن؛ تفصيل كل قسم في شاشته.
 *
 * القمع يُحسب من بيانات المنصة نفسها لا من جوجل (قرار ٥ في موجز المرحلة ١٠):
 * مانع إعلانات واحد يُسقط وسم GA4 صامتاً، فتبقى أرقام المالك صحيحة بدونه.
 *
 * ومنذ هجرة 0023 مصدره **واحد** هو `public.funnel_events`: أربع مراحل متتالية
 * (بحث ← عرض سعر ← حجز ← دفع) وحدثان خارجها. فما يقيسه هو الرحلة على الموقع،
 * لا إجمالي أعمال الشركة — وهو ما تقوله نصوص المساعدة صراحةً.
 */

export const metadata = { title: "الإحصائيات" };

const PATH = "/admin/stats";

/** المراحل الأربع المعروضة من سلاسل `funnel_daily` الست */
const FUNNEL_SERIES_KEYS = [
  "search_performed",
  "quote_viewed",
  "booking_created",
  "booking_paid",
];

export default async function StatsOverviewPage({ searchParams }: PageProps<"/admin/stats">) {
  const params = await searchParams;
  const range = resolveStatRange(params);
  const wired = hasSupabaseEnv();
  const supabase = await createServerSupabase();

  const [currency, cardsRead, funnelRead, summaryRead] = supabase
    ? await Promise.all([
        readStatsCurrency(supabase),
        readSectionCards(supabase, "orders", range.from, range.to),
        readFunnelSeries(supabase, range.from, range.to),
        readFunnelSummary(supabase, range.from, range.to),
      ])
    : ([
        "EGP",
        blankRead<LoadedStatCard[]>([], "section_stats"),
        blankRead<StatSeries[]>([], "funnel_daily"),
        blankRead<FunnelSummaryRow[]>([], "funnel_summary"),
      ] as const);

  // مجاميع القمع من `funnel_summary`، وإن غابت فمن بطاقات القسم لو أُرجعت
  // بمفاتيح الأحداث يوماً ما. لا مسار ثالث يجمع في المتصفح.
  const summaryStages = stagesFromSummary(summaryRead.data);
  const stages = hasFunnelValues(summaryStages) ? summaryStages : stagesFromCards(cardsRead.data);
  const side = sideFromSummary(summaryRead.data);

  // فشل `funnel_summary` وحده لا يمنع الشاشة: المخطط اليومي مصدره مستقل، ولذلك
  // لا يدخل هذا الفشل بطاقة «غير جاهزة» بل يظهر في مكان الرسم نفسه.
  const blockingFailure = cardsRead.failure ?? funnelRead.failure;

  return (
    <div className="mx-auto max-w-6xl space-y-5">
      <StatsHeader
        title="الإحصائيات"
        description="قمع التحويل من البحث إلى الدفع، محسوباً من بيانات المنصة نفسها."
        help="كل رقم ورسم في هذه الشاشات يأتي من عرض أو دالة داخل قاعدة البيانات — لا تجميع في المتصفح. السبب أن نفس الأرقام تُقرأ في شاشة المالية وستُقرأ في تقارير لاحقة، وأي حساب يتكرر في الواجهة يصير مصدر حقيقة ثانياً ينحرف بصمت."
      />

      <StatsSectionNav current={null} rangeQuery={statRangeQuery(range)} />

      <StatRangeFilter basePath={PATH} range={range} disabled={!wired} />

      {(!wired || blockingFailure !== null) && (
        <StatsNotReady
          wired={wired}
          missing={cardsRead.missing ?? funnelRead.missing ?? "طبقة الإحصائيات"}
          failure={blockingFailure}
        />
      )}

      <StatsPanel
        title="قمع التحويل"
        icon={Filter}
        help={`أربع مراحل متتالية: بحث عن رحلة ← ظهور العروض ← إنشاء الحجز ← وصول التحصيل. كلها تُقرأ من جدول أحداث خفيف داخل قاعدتنا (بلا اسم عميل ولا رقم هاتف) — مصدر واحد لكل المراحل، فلا تختلط خطوةٌ بمصدرٍ آخر. ${FUNNEL_SCOPE_NOTE}`}
        description="اقرأ الرسم بحثاً عن أوسع هبوط بين مرحلتين — هو نقطة العمل التالية."
      >
        <StatFunnel stages={stages} side={side} />
      </StatsPanel>

      <StatsPanel
        title="القمع يومياً"
        icon={LineChart}
        help="نفس المراحل الأربع موزّعة على أيام الفترة، وكل يوم له نقطة حتى لو كانت صفراً. الزمن يجري من اليمين (الأقدم) إلى اليسار (الأحدث). مرّر المؤشر فوق أي يوم لقراءة أرقامه، أو افتح الجدول أسفل الرسم."
        description="شكل الحركة لا محصّلتها: أسبوع واحد يحمل كل الطلب يختلف عن طلب مستقر."
      >
        <StatChart
          series={pickSeries(funnelRead.data, FUNNEL_SERIES_KEYS)}
          granularity="day"
          currency={currency}
          title="مخطط مراحل القمع الأربع موزّعة على أيام الفترة"
          emptyMessage="لا نقطة واحدة في هذه الفترة. أحداث القمع تبدأ التسجيل بعد تنفيذ هجرة المرحلة ١٠، فالفترات الأقدم منها تظهر فارغة وهذا متوقع."
        />
      </StatsPanel>

      <section className="space-y-2">
        <h3 className="text-sm font-semibold">إحصائيات الأقسام</h3>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {STAT_SECTIONS.map((section) => (
            <Link key={section.key} href={`${section.path}?${statRangeQuery(range)}`}>
              <Card className="h-full gap-1 p-4 transition-colors hover:bg-muted/50">
                <span className="flex items-center gap-1.5 text-sm font-medium">
                  <BarChart3 className="size-3.5 shrink-0 text-primary" />
                  {section.label}
                  <ArrowLeft className="ms-auto size-3.5 shrink-0 text-muted-foreground" />
                </span>
                <span className="block text-xs leading-relaxed text-muted-foreground">
                  {section.tagline}
                </span>
              </Card>
            </Link>
          ))}
        </div>
      </section>
    </div>
  );
}
