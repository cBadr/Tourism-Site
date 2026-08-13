import { Handshake, Radio } from "lucide-react";

import { toArabicDigits } from "@/components/booking/format";
import { StatBars } from "@/components/stats/stat-bars";
import { StatsScreen } from "@/components/stats/section-screen";
import { SnapshotBadge, StatsEmpty, StatsPanel } from "@/components/stats/stats-ui";
import { Badge } from "@/components/ui/badge";
import { formatStatPercent } from "@/lib/stats/format";
import {
  hasSupabaseEnv,
  type PartnerStatRow,
  readPartnerStats,
  readSectionCards,
  readStatsCurrency,
  type StatsFailure,
} from "@/lib/stats/read";
import { resolveStatRange } from "@/lib/stats/range";
import { createServerSupabase } from "@/lib/supabase/server";

/**
 * إحصائيات المتعهدين والأسطول — أداء البث ونشاط الشركاء.
 *
 * 🔒 **حدّ الخصوصية البنيوي:** لا عمود تكلفة ولا مستحق ولا هامش في هذه الشاشة.
 * ليس لأننا لن نطبعه، بل لأن `PartnerStatRow` في `lib/stats/read.ts` لا يحمل
 * هذه الحقول أصلاً — فما لا يوجد في النوع لا يصل إلى JSX مهما أرجع العرض من
 * أعمدة. (قاعدة المرحلة ٥: الأمان بنيوي لا انضباطي.) وأرقام المال تُقرأ من
 * شاشتَي «المالية» و«إحصائيات الخزينة» المحروستين بالدور نفسه.
 */

export const metadata = { title: "إحصائيات المتعهدين" };

const PARTNER_STATUS_LABELS: Record<string, string> = {
  pending: "قيد المراجعة",
  approved: "معتمد",
  suspended: "موقوف",
};

/** أعلى عدد شركاء يظهر في مقارنة الأشرطة — الجدول تحته يحمل الباقي */
const TOP_PARTNERS = 8;

export default async function PartnersStatsPage({
  searchParams,
}: PageProps<"/admin/stats/partners">) {
  const params = await searchParams;
  const range = resolveStatRange(params);
  const wired = hasSupabaseEnv();
  const supabase = await createServerSupabase();

  const [currency, cardsRead, partnersRead] = supabase
    ? await Promise.all([
        readStatsCurrency(supabase),
        readSectionCards(supabase, "partners", range.from, range.to),
        readPartnerStats(supabase),
      ])
    : [
        "EGP",
        { data: [], ready: false, failure: null as StatsFailure | null, missing: "section_stats" },
        {
          data: [] as PartnerStatRow[],
          ready: false,
          failure: null as StatsFailure | null,
          missing: "v_stats_partners",
        },
      ];

  const partners = partnersRead.data;
  const topBars = partners
    .filter((row) => row.tripsCount !== null && row.tripsCount > 0)
    .slice(0, TOP_PARTNERS)
    .map((row) => ({
      key: row.id,
      label: row.companyName,
      value: row.tripsCount,
      display: `${toArabicDigits(row.tripsCount ?? 0)} رحلة`,
    }));

  return (
    <StatsScreen
      section="partners"
      range={range}
      wired={wired}
      cards={cardsRead.data}
      cardsFailure={cardsRead.failure}
      cardsMissing={cardsRead.missing}
      currency={currency}
    >
      <StatsPanel
        title="أنشط الشركاء"
        icon={Handshake}
        action={<SnapshotBadge>تراكمي</SnapshotBadge>}
        help="عدد الرحلات المسندة لكل شريك كما يُرجعه العرض v_stats_partners. هذا العرض حالة تراكمية لا مجموع فترة، فلا يتغيّر بتغيير الفترة المختارة أعلاه — وسمناه بذلك بدل أن نوحي بغير ما يفعل."
        description="طول الشريط عرضٌ نسبي لأطول قيمة، والعدد نفسه هو ما يُطبع بجواره."
      >
        {partnersRead.failure !== null ? (
          <StatsEmpty title="تعذّرت قراءة نشاط الشركاء">
            العرض <code dir="ltr">v_stats_partners</code> غير متاح — نفِّذ هجرة المرحلة ١٠ أو
            سجّل الدخول بحساب مدير. بقية الشاشة تعمل بما توفّر.
          </StatsEmpty>
        ) : (
          <StatBars
            items={topBars}
            emptyMessage="لا رحلة مسندة لأي شريك بعد. يظهر الشركاء هنا بعد أول قبول عرض من بورتال المتعهدين."
          />
        )}
      </StatsPanel>

      <StatsPanel
        title="جدول الشركاء"
        icon={Radio}
        action={<SnapshotBadge>تراكمي</SnapshotBadge>}
        help="معدل القبول = العروض المقبولة إلى العروض المرسلة، محسوباً في قاعدة البيانات. انخفاضه لدى شريك بعينه يعني عروضاً تُرسل إليه ولا يستجيب لها — وهو ما يؤخر الإسناد على العميل."
        description="لا تظهر هنا تكلفة شريك ولا هامش الموقع: هذه الشاشة لا تطلب تلك الأعمدة أصلاً."
      >
        {partners.length === 0 ? (
          <StatsEmpty title="لا شركاء بعد">
            يظهر المتعهدون هنا بعد اعتمادهم من شاشة «المتعهدون» وإسناد أول رحلة إليهم.
          </StatsEmpty>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[38rem] text-sm">
              <thead>
                <tr className="border-b border-border text-xs text-muted-foreground">
                  <th className="p-2 text-start font-medium">الشريك</th>
                  <th className="p-2 text-start font-medium">الحالة</th>
                  <th className="p-2 text-start font-medium">الرحلات</th>
                  <th className="p-2 text-start font-medium">العروض المرسلة</th>
                  <th className="p-2 text-start font-medium">المقبولة</th>
                  <th className="p-2 text-start font-medium">معدل القبول</th>
                </tr>
              </thead>
              <tbody>
                {partners.map((row) => (
                  <tr key={row.id} className="border-b border-border last:border-0 hover:bg-muted/40">
                    <td className="p-2 font-medium">{row.companyName}</td>
                    <td className="p-2">
                      <Badge variant="outline" className="font-normal">
                        {(row.status && PARTNER_STATUS_LABELS[row.status]) || row.status || "—"}
                      </Badge>
                    </td>
                    <td className="p-2" dir="ltr">
                      {row.tripsCount === null ? "—" : toArabicDigits(row.tripsCount)}
                    </td>
                    <td className="p-2" dir="ltr">
                      {row.offersCount === null ? "—" : toArabicDigits(row.offersCount)}
                    </td>
                    <td className="p-2" dir="ltr">
                      {row.acceptedCount === null ? "—" : toArabicDigits(row.acceptedCount)}
                    </td>
                    <td className="p-2 font-medium" dir="ltr">
                      {row.acceptRate === null ? "—" : formatStatPercent(row.acceptRate)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </StatsPanel>
    </StatsScreen>
  );
}
