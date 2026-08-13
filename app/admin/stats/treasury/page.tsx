import Link from "next/link";
import { ArrowLeft, Banknote } from "lucide-react";

import { StatChart } from "@/components/stats/stat-chart";
import { StatsScreen } from "@/components/stats/section-screen";
import { StatsEmpty, StatsPanel } from "@/components/stats/stats-ui";
import type { StatSeries } from "@/lib/analytics-types";
import type { LoadedStatCard } from "@/lib/stats/cards";
import {
  blankRead,
  hasSupabaseEnv,
  readSectionCards,
  readStatsCurrency,
  readTreasurySeries,
} from "@/lib/stats/read";
import { resolveStatRange } from "@/lib/stats/range";
import { createServerSupabase } from "@/lib/supabase/server";

/**
 * إحصائيات الخزينة — شكل حركة المال عبر الفترة.
 *
 * **لا اشتقاق مالي جديد هنا إطلاقاً.** المخطط والبطاقات يقرآن من نفس المحرّك:
 * العرض `v_stats_treasury` الذي تُجمَّع منه بطاقات `section_stats('treasury')`
 * أيضاً — فلا رقمان لشيء واحد على الشاشة الواحدة. والعرض يطبّق قاعدة
 * `cash_flow()` من المرحلة ٧ حرفياً (القيود ذات الحساب وحدها: مستحق المتعهد
 * ليس نقداً خرج، وما حصّله نقداً ليس نقداً دخل خزينتنا).
 *
 * فرق هذه الشاشة عن شاشة المالية أنها تسأل «كيف تحرّك المال عبر الزمن؟» لا
 * «كم في الخزينة الآن؟» — والثانية تبقى في مكانها.
 */

export const metadata = { title: "إحصائيات الخزينة" };

export default async function TreasuryStatsPage({
  searchParams,
}: PageProps<"/admin/stats/treasury">) {
  const params = await searchParams;
  const range = resolveStatRange(params);
  const wired = hasSupabaseEnv();
  const supabase = await createServerSupabase();

  const [currency, cardsRead, flowRead] = supabase
    ? await Promise.all([
        readStatsCurrency(supabase),
        readSectionCards(supabase, "treasury", range.from, range.to),
        readTreasurySeries(supabase, range.from, range.to),
      ])
    : ([
        "EGP",
        blankRead<LoadedStatCard[]>([], "section_stats"),
        blankRead<StatSeries[]>([], "v_stats_treasury"),
      ] as const);

  return (
    <StatsScreen
      section="treasury"
      range={range}
      wired={wired}
      cards={cardsRead.data}
      cardsFailure={cardsRead.failure}
      cardsMissing={cardsRead.missing}
      currency={currency}
    >
      <StatsPanel
        title="التدفق النقدي عبر الفترة"
        icon={Banknote}
        help="الوارد والمنصرف الفعليان من حسابات الخزينة، مجمَّعان يوماً بيوم داخل قاعدة البيانات. نقد داخل وخارج فعلاً لا استحقاقات: مستحق متعهد لم يُدفع بعد لا يظهر هنا، ويظهر في «مقاصة المتعهدين» بشاشة المالية."
        description="اليوم الذي لا حركة فيه لا نقطة له في المخطط — «لا حركة» و«صفر» ليسا الشيء نفسه، ولا نُدرج أصفاراً من عندنا."
        action={
          <Link
            href="/admin/finance"
            className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
          >
            شاشة المالية وكشوف الحساب
            <ArrowLeft className="size-3" />
          </Link>
        }
      >
        {flowRead.failure !== null ? (
          <StatsEmpty title="تعذّرت قراءة التدفق النقدي">
            العرض <code dir="ltr">v_stats_treasury</code> غير متاح — نفِّذ هجرة المرحلة ١٠
            (<code dir="ltr">0022_analytics.sql</code>)، وتأكد أنك مسجَّل بحساب مدير.
          </StatsEmpty>
        ) : (
          <StatChart
            series={flowRead.data}
            granularity="day"
            format="money"
            currency={currency}
            title="مخطط الوارد والمنصرف من حسابات الخزينة خلال الفترة"
            emptyMessage="لا حركة نقدية في هذه الفترة — لا وارد ولا منصرف. جرّب فترة أوسع من الأزرار أعلاه."
          />
        )}
      </StatsPanel>
    </StatsScreen>
  );
}
