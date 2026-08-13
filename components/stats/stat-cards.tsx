import type { ReactNode } from "react";
import { ArrowDownRight, ArrowUpRight, Minus } from "lucide-react";

import { HelpTip } from "@/components/shared/HelpTip";
import { Card } from "@/components/ui/card";
import type { LoadedStatCard } from "@/lib/stats/cards";
import {
  deltaDirection,
  deltaIsGood,
  formatDelta,
  formatStatValue,
  type StatDurationUnit,
} from "@/lib/stats/format";
import { StatsEmpty } from "@/components/stats/stats-ui";
import { cn } from "@/lib/utils";

/**
 * شبكة بطاقات المؤشرات — تستهلك `StatCard` من `lib/analytics-types.ts` حرفياً.
 *
 * **البطاقة لا تحسب شيئاً.** القيمة و`deltaPercent` يصلان محسوبين من
 * `section_stats`؛ ما تفعله هذه المكوّنات ثلاثة: تنسيق الخانات بحسب
 * `card.format`، واختيار سهم ولون التغيّر، وطباعة `card.help` في أيقونة «؟».
 *
 * `deltaPercent = null` تعني **«لا مقارنة»** ولا تُترجَم إلى صفر ولا إلى «٠٪»:
 * تُكتب «بلا مقارنة» صراحةً، لأن الفترة السابقة الصفرية تجعل النسبة غير معرَّفة
 * رياضياً — واختراع رقم مكانها هو أول خطوة نحو لوحة لا تُصدَّق.
 */

const isDurationUnit = (value: string | null): value is StatDurationUnit =>
  value === "seconds" || value === "minutes" || value === "hours";

/** شارة التغيّر عن الفترة السابقة */
function DeltaChip({
  cardKey,
  deltaPercent,
  inverted,
}: {
  cardKey: string;
  deltaPercent: number | null;
  inverted?: boolean;
}) {
  const direction = deltaDirection(deltaPercent);
  const text = formatDelta(deltaPercent);

  if (direction === null || text === null) {
    return (
      <span className="inline-flex items-center gap-1 text-[11px] text-muted-foreground">
        <Minus className="size-3 shrink-0" />
        بلا مقارنة
      </span>
    );
  }

  if (direction === "flat") {
    return (
      <span className="inline-flex items-center gap-1 text-[11px] text-muted-foreground">
        <Minus className="size-3 shrink-0" />
        {text}
      </span>
    );
  }

  const good = deltaIsGood(cardKey, deltaPercent, inverted);
  const Icon = direction === "up" ? ArrowUpRight : ArrowDownRight;

  return (
    <span
      dir="ltr"
      className={cn(
        "inline-flex items-center gap-0.5 rounded-md px-1.5 py-0.5 text-[11px] font-medium",
        good === true
          ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200"
          : good === false
            ? "bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-200"
            : "bg-muted text-muted-foreground"
      )}
    >
      <Icon className="size-3 shrink-0" />
      {text}
    </span>
  );
}

export function StatCardTile({
  card,
  currency,
  comparisonLabel,
  inverted,
}: {
  card: LoadedStatCard;
  currency: string;
  /** وصف الفترة السابقة — «مقارنةً بـ ١ – ٧ أغسطس» */
  comparisonLabel?: string;
  inverted?: boolean;
}) {
  const unit = isDurationUnit(card.unit) ? card.unit : "minutes";
  const value = formatStatValue(card.value, card.format, currency, unit);
  const hasComparison = deltaDirection(card.deltaPercent) !== null;

  return (
    <Card className="h-full gap-1 p-4">
      <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
        <span className="truncate">{card.label}</span>
        {card.help ? <HelpTip>{card.help}</HelpTip> : null}
      </div>
      <span dir="ltr" className="block text-start text-xl font-bold sm:text-2xl">
        {value}
      </span>
      <span className="flex flex-wrap items-center gap-1.5 text-[11px] leading-relaxed text-muted-foreground">
        <DeltaChip cardKey={card.key} deltaPercent={card.deltaPercent} inverted={inverted} />
        {hasComparison && comparisonLabel ? <span>مقارنةً بـ {comparisonLabel}</span> : null}
      </span>
    </Card>
  );
}

export function StatCards({
  cards,
  currency,
  comparisonLabel,
  emptyMessage,
}: {
  cards: LoadedStatCard[];
  currency: string;
  comparisonLabel?: string;
  emptyMessage?: ReactNode;
}) {
  if (cards.length === 0) {
    return (
      <StatsEmpty title="لا مؤشرات لهذا القسم">
        {emptyMessage ??
          "لم تُرجع دالة section_stats أي بطاقة لهذا القسم في الفترة المختارة. جرّب فترة أوسع، أو تأكد أن هجرة المرحلة ١٠ منفَّذة."}
      </StatsEmpty>
    );
  }

  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
      {cards.map((card) => (
        <StatCardTile
          key={card.key}
          card={card}
          currency={currency}
          comparisonLabel={comparisonLabel}
        />
      ))}
    </div>
  );
}
