import Link from "next/link";

import { toArabicDigits } from "@/components/booking/format";
import { HelpTip } from "@/components/shared/HelpTip";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  STAT_QUICK_RANGES,
  STAT_RANGE_LABELS,
  type StatRange,
  statHref,
  statRangeSentence,
} from "@/lib/stats/range";
import { cn } from "@/lib/utils";

/**
 * منتقي الفترة الموحّد لكل شاشات الإحصائيات: ٧ / ٣٠ / ٩٠ يوماً.
 *
 * قراران:
 *
 * (١) **الحالة في الرابط لا في الذاكرة.** الأزرار روابط ونطاق التخصيص نموذج
 *     `method="get"` — فيبقى الرابط قابلاً للمشاركة والحفظ في المفضلة ويعمل
 *     بجافاسكربت معطّل، ولا يحتاج المكوّن `"use client"` أصلاً. نفس اتفاقية
 *     شاشات المالية منذ المرحلة ٧.
 *
 * (٢) **المقارنة تُذكر بتاريخها لا بكلمة «الفترة السابقة».** «−١٢٪» بلا ذكر ما
 *     قُورِن به ادعاء لا معلومة؛ والفترة السابقة هنا معرَّفة بدقة: نفس عدد
 *     الأيام، تنتهي في اليوم السابق مباشرةً لبداية الفترة المعروضة.
 */
export function StatRangeFilter({
  basePath,
  range,
  disabled,
}: {
  basePath: string;
  range: StatRange;
  disabled?: boolean;
}) {
  return (
    <form action={basePath} method="get">
      <Card className="gap-3 p-4">
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="flex items-center gap-1.5 text-sm font-medium">
            الفترة
            <HelpTip>
              كل مؤشرات هذه الشاشة تُحسب داخل قاعدة البيانات على الفترة المختارة وحدها،
              بتوقيت القاهرة — عدا ما يُعلَّم صراحةً بوسم «صورة الآن»، فهو حالة اللحظة لا
              مجموع فترة.
            </HelpTip>
          </span>
          {STAT_QUICK_RANGES.map((key) => {
            const active = range.key === key;
            return (
              <Link
                key={key}
                href={statHref(basePath, { range: key })}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "rounded-lg px-2.5 py-1 text-xs transition-colors",
                  active
                    ? "bg-primary text-primary-foreground"
                    : "bg-muted text-muted-foreground hover:text-foreground"
                )}
              >
                آخر {STAT_RANGE_LABELS[key]}
              </Link>
            );
          })}
        </div>

        <div className="flex flex-wrap items-end gap-3">
          <div className="space-y-1.5">
            <Label htmlFor="stats-from" className="text-xs">
              من
            </Label>
            <Input
              id="stats-from"
              name="from"
              type="date"
              dir="ltr"
              defaultValue={range.from}
              disabled={disabled}
              className="w-40"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="stats-to" className="text-xs">
              إلى
            </Label>
            <Input
              id="stats-to"
              name="to"
              type="date"
              dir="ltr"
              defaultValue={range.to}
              disabled={disabled}
              className="w-40"
            />
          </div>
          <Button type="submit" size="sm" disabled={disabled}>
            تطبيق
          </Button>
        </div>

        <p className="text-xs leading-relaxed text-muted-foreground">
          المعروض: {statRangeSentence(range.from, range.to)} ({toArabicDigits(range.days)} يوماً).
          <br />
          المقارنة: {statRangeSentence(range.prevFrom, range.prevTo)} — نفس الطول، تنتهي قبل بداية
          الفترة المعروضة بيوم. سهم التغيّر في كل بطاقة يقيس هذا الفرق، ويُحسب داخل قاعدة
          البيانات لا هنا.
        </p>
      </Card>
    </form>
  );
}
