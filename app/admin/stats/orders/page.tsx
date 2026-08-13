import { Filter, LineChart, ListChecks } from "lucide-react";

import { StatBars } from "@/components/stats/stat-bars";
import { StatChart } from "@/components/stats/stat-chart";
import { StatFunnel } from "@/components/stats/stat-funnel";
import { StatsScreen } from "@/components/stats/section-screen";
import { StatsPanel } from "@/components/stats/stats-ui";
import type { StatSeries } from "@/lib/analytics-types";
import {
  cardsByKeys,
  cardsWithoutFunnel,
  FUNNEL_SCOPE_NOTE,
  type FunnelSummaryRow,
  hasFunnelValues,
  type LoadedStatCard,
  sideFromSummary,
  stagesFromCards,
  stagesFromSummary,
} from "@/lib/stats/cards";
import { cardsToBars } from "@/lib/stats/format";
import {
  blankRead,
  hasSupabaseEnv,
  pickSeries,
  readFunnelSeries,
  readFunnelSummary,
  readSectionCards,
  readStatsCurrency,
} from "@/lib/stats/read";
import { resolveStatRange } from "@/lib/stats/range";
import { createServerSupabase } from "@/lib/supabase/server";

/**
 * إحصائيات الطلبات — القمع وحالات الطلبات وقيمتها.
 *
 * البطاقات كلها من `section_stats('orders')` وتظهر في الشبكة تلقائياً: إضافة
 * مؤشر جديد للقسم يجب أن تكون هجرةً لا هجرة + نشراً. والمفاتيح الثلاثة أدناه
 * تُعاد قراءتها لمقارنة أفقية لأنها **متداخلة**: كل طلب مؤكد هو طلب، وكل رحلة
 * مكتملة هي طلب مؤكد — فالمقارنة بينها تحكي مسار الطلب لا فئات منفصلة.
 */

export const metadata = { title: "إحصائيات الطلبات" };

/** مراحل السلسلة الأربع من سلاسل `funnel_daily` الست */
const FUNNEL_SERIES_KEYS = [
  "search_performed",
  "quote_viewed",
  "booking_created",
  "booking_paid",
];

/** السلسلتان الباقيتان — خارج السلسلة: مسار دخول موازٍ وفرع البوابة الإلكترونية */
const SIDE_SERIES_KEYS = ["quote_requested", "booking_started"];

/** مسار الطلب داخلياً — مفاتيح من `section_stats('orders')` حرفياً */
const PIPELINE_KEYS = ["orders_count", "confirmed_count", "completed_count"];

export default async function OrdersStatsPage({
  searchParams,
}: PageProps<"/admin/stats/orders">) {
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

  const summaryStages = stagesFromSummary(summaryRead.data);
  const stages = hasFunnelValues(summaryStages) ? summaryStages : stagesFromCards(cardsRead.data);
  const side = sideFromSummary(summaryRead.data);
  const pipeline = cardsByKeys(cardsRead.data, PIPELINE_KEYS);

  return (
    <StatsScreen
      section="orders"
      range={range}
      wired={wired}
      cards={cardsWithoutFunnel(cardsRead.data)}
      cardsFailure={cardsRead.failure}
      cardsMissing={cardsRead.missing}
      currency={currency}
    >
      <StatsPanel
        title="قمع التحويل"
        icon={Filter}
        help={`بحث ← ظهور العروض ← إنشاء الحجز ← وصول التحصيل، كلها من مصدر واحد هو سجل أحداث القمع. أوسع هبوط بين مرحلتين هو نقطة العمل التالية: هبوط بين البحث والعروض يعني تغطية ناقصة أو تسعيراً فاشلاً، وهبوط بين الحجز والدفع يعني مشكلة في وسائل الدفع أو في مهلة الانتظار. ${FUNNEL_SCOPE_NOTE}`}
      >
        <StatFunnel stages={stages} side={side} />
      </StatsPanel>

      <StatsPanel
        title="القمع يومياً"
        icon={LineChart}
        help="نفس المراحل موزّعة على أيام الفترة، وكل يوم له نقطة حتى لو كانت صفراً. الزمن من اليمين (الأقدم) إلى اليسار (الأحدث)، ومرّر المؤشر فوق أي يوم لقراءة أرقامه."
      >
        <StatChart
          series={pickSeries(funnelRead.data, FUNNEL_SERIES_KEYS)}
          granularity="day"
          currency={currency}
          title="مخطط مراحل القمع الأربع موزّعة على أيام الفترة"
          emptyMessage="لا حركة في هذه الفترة. أحداث القمع تبدأ التسجيل بعد تنفيذ هجرة المرحلة ١٠، فالفترات الأقدم منها تظهر فارغة وهذا متوقع."
        />
      </StatsPanel>

      {/* الحدثان خارج السلسلة، موزّعين على الأيام. عدّاداهما المجمَّعان يظهران
          داخل لوحة القمع نفسها، وهذه اللوحة تعطي شكل حركتهما عبر الزمن. وهما
          خارج السلسلة عمداً: الأول مسار دخول موازٍ والثاني فرع البوابة
          الإلكترونية، فإقحام أيٍّ منهما بين مرحلتين يجعل «التحول» بلا معنى. */}
      <StatsPanel
        title="أحداث خارج السلسلة"
        icon={LineChart}
        help="«طلب عرض سعر يدوي» مسار دخول موازٍ للحاسبة الفورية (الجولات والمناسبات). و«اختار وسيلة دفع إلكترونية» فرعٌ داخل الحجز يُسجَّل عند فتح صفحة البوابة وحدها — فالحجز المدفوع بتحويل بنكي لا يمر به، وصفرٌ هنا لا يعني «لا أحد يدفع». كلاهما يُقاس ويُعرض بعدّاده وحده، ولا معدل تحول له لأنه لا يقع بين مرحلتين."
        description="ارتفاع الأول مع ثبات الحجوزات يعني أن الحاسبة الفورية لا تغطي ما يطلبه الزوار."
      >
        <StatChart
          series={pickSeries(funnelRead.data, SIDE_SERIES_KEYS)}
          granularity="day"
          currency={currency}
          title="مخطط طلبات الأسعار اليدوية واختيار الدفع الإلكتروني يوماً بيوم"
          emptyMessage="لا طلب سعر يدوي ولا دفعة إلكترونية بدأت في هذه الفترة."
        />
      </StatsPanel>

      {pipeline.length > 0 && (
        <StatsPanel
          title="مسار الطلب داخل الفترة"
          icon={ListChecks}
          help="ثلاثة أعداد متداخلة لا فئات منفصلة: كل طلب مؤكد هو طلب، وكل رحلة مكتملة هي طلب مؤكد. الفارق بين الشريطين المتجاورين هو ما توقّف عند تلك الخطوة. الأعداد تُحسب في قاعدة البيانات وطول الشريط عرضٌ نسبي لا رقم."
          description="الفجوة بين «عدد الطلبات» و«طلبات مؤكدة» هي الحجوزات التي لم يصل تحصيلها — أسرع مكان لاستعادة إيراد ضائع."
        >
          <StatBars items={cardsToBars(pipeline, currency)} />
        </StatsPanel>
      )}
    </StatsScreen>
  );
}
