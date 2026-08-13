import type { ReactNode } from "react";

import { StatCards } from "@/components/stats/stat-cards";
import { StatRangeFilter } from "@/components/stats/stat-range";
import { StatsHeader, StatsNotReady, StatsSectionNav } from "@/components/stats/stats-ui";
import type { LoadedStatCard } from "@/lib/stats/cards";
import type { StatsFailure } from "@/lib/stats/read";
import { type StatRange, statRangeQuery, statRangeSentence } from "@/lib/stats/range";
import { statSection, type StatSectionKey } from "@/lib/stats/sections";

/**
 * الهيكل الموحّد لشاشة إحصائيات قسم واحد.
 *
 * وجوده يمنع انحرافاً معروفاً: ست شاشات مكتوبة يدوياً تنتهي بستة منتقيات فترة
 * مختلفة قليلاً وستة نصوص «غير جاهزة» متفاوتة، ثم يُصلَح أحدها ولا تُصلَح
 * البقية. العنوان والتلميح يأتيان من سجل الأقسام (`lib/stats/sections.ts`)، فلا
 * يوجد اسم قسم مكتوب في أي صفحة.
 *
 * الشاشة **عرض محض**: كل قراءة تقع في الصفحة نفسها ثم تُمرَّر هنا جاهزة، حتى
 * تُطلق الصفحة استعلاماتها متوازية بدل أن تنتظر بعضها.
 */
export function StatsScreen({
  section,
  range,
  wired,
  cards,
  cardsFailure,
  cardsMissing,
  currency,
  children,
}: {
  section: StatSectionKey;
  range: StatRange;
  wired: boolean;
  cards: LoadedStatCard[];
  /** `null` يعني أن القراءة نجحت */
  cardsFailure: StatsFailure | null;
  cardsMissing: string | null;
  currency: string;
  /** كتل خاصة بالقسم: مخططات وجداول */
  children?: ReactNode;
}) {
  const meta = statSection(section);
  const comparison = statRangeSentence(range.prevFrom, range.prevTo);

  return (
    <div className="mx-auto max-w-6xl space-y-5">
      <StatsHeader
        title={`إحصائيات ${meta.label}`}
        description={meta.tagline}
        help={meta.help}
      />

      <StatsSectionNav current={section} rangeQuery={statRangeQuery(range)} />

      <StatRangeFilter basePath={meta.path} range={range} disabled={!wired} />

      {(!wired || cardsFailure !== null) && (
        <StatsNotReady
          wired={wired}
          missing={cardsMissing ?? "section_stats"}
          failure={cardsFailure}
        />
      )}

      <StatCards cards={cards} currency={currency} comparisonLabel={comparison} />

      {children}
    </div>
  );
}
