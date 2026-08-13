import type { ReactNode } from "react";

import { HelpTip } from "@/components/shared/HelpTip";
import { StatsEmpty } from "@/components/stats/stats-ui";
import type { StatBarItem } from "@/lib/stats/format";
import { cn } from "@/lib/utils";

/**
 * مقارنة فئوية أفقية — CSS خالص بلا مكتبة.
 *
 * لماذا أفقية لا رأسية؟ لأن التسميات هنا عربية كاملة («طلبات بانتظار الدفع»،
 * «شركة النيل للنقل السياحي»)، والعمود الرأسي يقصّها أو يقلبها. الشريط الأفقي
 * يمنح السطر كله للاسم، ويصطف مع اتجاه القراءة: يبدأ من اليمين ويمتد يساراً.
 *
 * **الأرقام كلها تصل جاهزة**؛ النسبة المستعملة هنا للعرض فقط (طول الشريط
 * نسبةً إلى أطول قيمة) ولا تُطبع رقماً في أي موضع.
 */

/** أقل عرض مرئي لشريط قيمته أكبر من صفر — كي لا تختفي قيمة صغيرة تماماً */
const MIN_BAR_PERCENT = 2.5;

export function StatBars({
  items,
  emptyMessage,
  tone = "bg-primary",
}: {
  items: StatBarItem[];
  emptyMessage?: ReactNode;
  /** لون الأشرطة — صنف Tailwind ثابت */
  tone?: string;
}) {
  const visible = items.filter((item) => item.value !== null);

  if (items.length === 0 || visible.length === 0) {
    return (
      <StatsEmpty title="لا بيانات للمقارنة">
        {emptyMessage ??
          "لم تُرجع قاعدة البيانات قيماً لهذه المقارنة في الفترة المختارة. الأشرطة لا تُرسم بقيم مخترعة."}
      </StatsEmpty>
    );
  }

  // أطول قيمة = مرجع الأطوال. هندسة عرض لا حساب: لا تُعرض ولا يُشتق منها رقم.
  const peak = visible.reduce((max, item) => Math.max(max, item.value ?? 0), 0);
  const widthPercent = (value: number | null): number => {
    if (value === null || value <= 0 || peak <= 0) return 0;
    return Math.max(MIN_BAR_PERCENT, Math.min(100, (value / peak) * 100));
  };

  return (
    <ul className="space-y-3">
      {items.map((item) => (
        <li key={item.key} className="space-y-1">
          <div className="flex items-baseline gap-2 text-sm">
            <span className="flex min-w-0 items-center gap-1.5">
              <span className="truncate">{item.label}</span>
              {item.hint ? <HelpTip>{item.hint}</HelpTip> : null}
            </span>
            <span dir="ltr" className="ms-auto shrink-0 font-medium whitespace-nowrap">
              {item.display}
            </span>
          </div>
          <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
            {/* الحاوية RTL فيبدأ الشريط من اليمين تلقائياً بلا تموضع صريح */}
            <div
              className={cn("h-full rounded-full transition-all", tone)}
              style={{ width: `${widthPercent(item.value)}%` }}
            />
          </div>
        </li>
      ))}
    </ul>
  );
}
