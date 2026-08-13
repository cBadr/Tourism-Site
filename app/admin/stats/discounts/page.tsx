import Link from "next/link";
import { Scissors, TicketPercent, Wallet } from "lucide-react";

import { formatAmount, formatMoney } from "@/components/booking/format";
import { StatChart } from "@/components/stats/stat-chart";
import { StatsScreen } from "@/components/stats/section-screen";
import {
  SnapshotBadge,
  StatsEmpty,
  StatsNotReady,
  StatsPanel,
} from "@/components/stats/stats-ui";
import { Badge } from "@/components/ui/badge";
import type { StatSeries } from "@/lib/analytics-types";
import { type LoadedStatCard } from "@/lib/stats/cards";
import {
  blankRead,
  hasSupabaseEnv,
  readSectionCards,
  readStatsCurrency,
} from "@/lib/stats/read";
import { resolveStatRange } from "@/lib/stats/range";
import { createServerSupabase } from "@/lib/supabase/server";
import { readDiscountSeries, readTopCoupons, type TopCouponRow } from "./loader";

/**
 * إحصائيات الخصومات — القسم السابع، موصول بمنظومة المرحلة ١٠ نفسها.
 *
 * ثلاثة أشياء تجيب عنها هذه الشاشة: كم كوبوناً استُخدم، وكم خصماً مُنح فعلاً،
 * وكم ابتلع ذلك من الهامش. وكلها تصل محسوبة من `section_stats('discounts')`
 * و`v_stats_discounts` — لا رقم يُشتق في هذا الملف.
 *
 * والمخطط الثاني يعرض ما قلّصته أرضية الهامش يوماً بيوم: فارقٌ بين «ما أعلنّاه»
 * و«ما وقع» يجب أن يكون **مرئياً**، لا مطموراً في فرق بين رقمين في تقريرين.
 */

export const metadata = { title: "إحصائيات الخصومات" };

function TopCouponsTable({ rows, currency }: { rows: TopCouponRow[]; currency: string }) {
  if (rows.length === 0) {
    return (
      <StatsEmpty title="لا كوبون مستخدَم بعد">
        يظهر هنا صف لكل كوبون بعدّاد استخدامه التراكمي. أنشئ كوبوناً من شاشة الخصومات وفعّله
        حين تبدأ الحملة.
      </StatsEmpty>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[34rem] text-sm">
        <thead>
          <tr className="border-b border-border text-xs text-muted-foreground">
            <th className="p-2 text-start font-medium">الرمز</th>
            <th className="p-2 text-start font-medium">قيمته</th>
            <th className="p-2 text-start font-medium">الاستخدام</th>
            <th className="p-2 text-start font-medium">السقف</th>
            <th className="p-2 text-start font-medium">الحالة</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.id} className="border-b border-border last:border-0 hover:bg-muted/40">
              <td className="p-2">
                <Link
                  href={`/admin/discounts/${row.id}`}
                  dir="ltr"
                  className="font-medium text-primary hover:underline"
                >
                  {row.code}
                </Link>
              </td>
              <td className="p-2" dir="ltr">
                {row.value === null
                  ? "—"
                  : row.kind === "percent"
                    ? `${formatAmount(row.value)}٪`
                    : formatMoney(row.value, currency)}
              </td>
              <td className="p-2 tabular-nums" dir="ltr">
                {row.usedCount === null ? "—" : formatAmount(row.usedCount)}
              </td>
              <td className="p-2 tabular-nums" dir="ltr">
                {row.maxUses === null ? "بلا سقف" : formatAmount(row.maxUses)}
              </td>
              <td className="p-2">
                <Badge variant={row.enabled ? "default" : "secondary"} className="font-normal">
                  {row.enabled ? "مفعَّل" : "معطَّل"}
                </Badge>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default async function DiscountsStatsPage({
  searchParams,
}: PageProps<"/admin/stats/discounts">) {
  const params = await searchParams;
  const range = resolveStatRange(params);
  const wired = hasSupabaseEnv();
  const supabase = await createServerSupabase();

  const [currency, cardsRead, seriesRead, topRead] = supabase
    ? await Promise.all([
        readStatsCurrency(supabase),
        readSectionCards(supabase, "discounts", range.from, range.to),
        readDiscountSeries(supabase, range.from, range.to),
        readTopCoupons(supabase),
      ])
    : ([
        "EGP",
        blankRead<LoadedStatCard[]>([], "section_stats"),
        { money: blankRead<StatSeries[]>([], "v_stats_discounts"), counts: [] as StatSeries[] },
        blankRead<TopCouponRow[]>([], "coupons"),
      ] as const);

  // قراءة فاشلة تُقال بسببها المسمّى: رسمٌ فارغ برسالة «لا خصم في هذه الفترة»
  // فوق عرضٍ غير موجود أصلاً يقول للمالك «الحملة لم تعمل» وهو كذب بالصمت.
  const seriesReady = seriesRead.money.ready;

  return (
    <StatsScreen
      section="discounts"
      range={range}
      wired={wired}
      cards={cardsRead.data}
      cardsFailure={cardsRead.failure}
      cardsMissing={cardsRead.missing}
      currency={currency}
    >
      <StatsPanel
        title="الخصم الممنوح يومياً"
        icon={TicketPercent}
        help="خطّان: ما خُصم فعلاً، وقيمة الحجوزات المخصومة بعد الخصم (وهي ما يدخل تقارير الهامش والخزينة). المصدر هو نفسه مصدر البطاقات أعلاه (v_stats_discounts)، فمجموع الرسم لا يخالف بطاقته."
        description="الخصم يُقتطع من هامش الموقع وحده — تكلفة المتعهد لا تتأثر بأي حملة."
      >
        {seriesReady ? (
          <StatChart
            series={seriesRead.money.data}
            granularity="day"
            format="money"
            currency={currency}
            title="مخطط الخصم الممنوح والقيمة الاسمية يوماً بيوم"
            emptyMessage="لا خصم في هذه الفترة. جرّب فترة أوسع، أو تأكد أن نظام الخصومات مفعَّل وأن كوبوناً واحداً على الأقل سارٍ."
          />
        ) : (
          <StatsNotReady
            wired={wired}
            missing={seriesRead.money.missing ?? "v_stats_discounts"}
            failure={seriesRead.money.failure}
          />
        )}
      </StatsPanel>

      <StatsPanel
        title="الاستخدامات وما قلّصته الأرضية"
        icon={Scissors}
        help="«مرات الاستخدام» عدد الحجوزات التي طُبِّق فيها كوبون (كوبون واحد لكل حجز فلا تراكم)، و«كوبونات مختلفة» كم كوبوناً استُخدم منها. و«ما قلّصته الأرضية» عدد الاستخدامات التي طُبِّقت بأقل من قيمة الكوبون المعلنة لأن الهامش المتبقي كان سينزل تحت حدّه — ارتفاعه ليس عطلاً بل صمام الأمان يعمل، لكن استمراره يعني حملة مُعلَنة غير التي تقع فعلاً."
        description="الأرقام الثلاثة من العرض نفسه الذي تُبنى منه البطاقات، لا من جدول آخر."
      >
        {seriesReady ? (
          <StatChart
            series={seriesRead.counts}
            granularity="day"
            currency={currency}
            title="مخطط عدد الاستخدامات وعدد المقلَّص منها يوماً بيوم"
            emptyMessage="لا استخدام لأي كوبون في هذه الفترة."
          />
        ) : (
          <StatsNotReady
            wired={wired}
            missing={seriesRead.money.missing ?? "v_stats_discounts"}
            failure={seriesRead.money.failure}
          />
        )}
      </StatsPanel>

      <StatsPanel
        title="أكثر الكوبونات استخداماً"
        icon={TicketPercent}
        action={<SnapshotBadge />}
        help="عدّاد كل كوبون تراكمي منذ إنشائه، ولا يتقيّد بالفترة المختارة أعلى الشاشة — لذلك قد يزيد عن رقم البطاقة، والفارق صحيح لا عطل. سقف الاستخدام يُفرض على هذا العدّاد التراكمي نفسه."
        description="اضغط الرمز لفتح شاشة الكوبون وسجل استخدامه بالقيمة الاسمية مقابل المطبَّقة."
      >
        {topRead.ready ? (
          <TopCouponsTable rows={topRead.data} currency={currency} />
        ) : (
          <StatsNotReady
            wired={wired}
            missing={topRead.missing ?? "coupons"}
            failure={topRead.failure}
          />
        )}
      </StatsPanel>

      <div className="flex items-start gap-2 rounded-lg border border-dashed border-border p-3 text-xs leading-relaxed text-muted-foreground">
        <Wallet className="mt-0.5 size-4 shrink-0 text-primary" />
        <p>
          لا يوجد قيد دفتري للخصم ولا حساب «خصومات ممنوحة» في الخزينة: إجمالي الحجز المحفوظ هو
          ما <strong>بعد</strong> الخصم، فتقارير هامش الرحلة والمالية تحتسبه تلقائياً. أي أن أثر
          الحملة على الربح يُقرأ من شاشة المالية كما يُقرأ أي انخفاض في السعر — لا من قيد منفصل.
        </p>
      </div>
    </StatsScreen>
  );
}
