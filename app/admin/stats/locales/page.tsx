import Link from "next/link";
import { ArrowLeft, Languages } from "lucide-react";

import { toArabicDigits } from "@/components/booking/format";
import { StatBars } from "@/components/stats/stat-bars";
import { StatsScreen } from "@/components/stats/section-screen";
import {
  SnapshotBadge,
  StatProgressBar,
  StatsEmpty,
  StatsPanel,
} from "@/components/stats/stats-ui";
import { Badge } from "@/components/ui/badge";
import { formatStatPercent } from "@/lib/stats/format";
import {
  hasSupabaseEnv,
  type LocaleStatRow,
  readLocaleStats,
  readSectionCards,
  readStatsCurrency,
  type StatsFailure,
} from "@/lib/stats/read";
import { resolveStatRange } from "@/lib/stats/range";
import { createServerSupabase } from "@/lib/supabase/server";
import { cn } from "@/lib/utils";

/**
 * إحصائيات اللغات — نسبة الاكتمال والقديم لكل لغة.
 *
 * هذا القسم الثاني الذي «يسقط دائماً» بحسب موجز المرحلة ١٠. وسقوطه مكلف:
 * **«الأصل تغيّر» أخطر من الترجمة الناقصة** — الناقصة تسقط إلى العربية فيقرأ
 * الزائر نصاً صحيحاً بلغة أخرى، أما القديمة فيقرأها بلغته وهي لم تعد تطابق
 * الأصل. ولذلك يظهر عمود «الأصل تغيّر» بلونه الأحمر بجوار نسبة الاكتمال، لا
 * في شاشة أخرى.
 *
 * الأرقام من العرض `v_stats_locales` — حالة اللحظة لا مجموع فترة، وموسومة بذلك.
 */

export const metadata = { title: "إحصائيات اللغات" };

export default async function LocalesStatsPage({
  searchParams,
}: PageProps<"/admin/stats/locales">) {
  const params = await searchParams;
  const range = resolveStatRange(params);
  const wired = hasSupabaseEnv();
  const supabase = await createServerSupabase();

  const [currency, cardsRead, localesRead] = supabase
    ? await Promise.all([
        readStatsCurrency(supabase),
        readSectionCards(supabase, "locales", range.from, range.to),
        readLocaleStats(supabase),
      ])
    : [
        "EGP",
        { data: [], ready: false, failure: null as StatsFailure | null, missing: "section_stats" },
        {
          data: [] as LocaleStatRow[],
          ready: false,
          failure: null as StatsFailure | null,
          missing: "v_stats_locales",
        },
      ];

  const locales = localesRead.data;
  const completionBars = locales
    .filter((row) => !row.isDefault && row.percent !== null)
    .map((row) => ({
      key: row.locale,
      label: `${row.name} (${row.locale})`,
      value: row.percent,
      display: formatStatPercent(row.percent ?? 0),
    }));

  return (
    <StatsScreen
      section="locales"
      range={range}
      wired={wired}
      cards={cardsRead.data}
      cardsFailure={cardsRead.failure}
      cardsMissing={cardsRead.missing}
      currency={currency}
    >
      {completionBars.length > 0 && (
        <StatsPanel
          title="نسبة الاكتمال المنشور"
          icon={Languages}
          action={<SnapshotBadge />}
          help="نسبة المفاتيح المنشورة إلى إجمالي المفاتيح القابلة للترجمة، محسوبة في قاعدة البيانات. العربية لغة الأصل فلا تُترجَم إلى نفسها ولا تظهر في هذه المقارنة."
        >
          <StatBars items={completionBars} />
        </StatsPanel>
      )}

      <StatsPanel
        title="تفصيل اللغات"
        icon={Languages}
        action={<SnapshotBadge />}
        help="لكل لغة: إجمالي المفاتيح، والمنشور والمراجَع والمسودة والناقص، وكم مفتاحاً تغيّر أصله العربي بعد ترجمته. الأرقام حالة اللحظة ولا تتقيّد بالفترة المختارة أعلاه."
        description="المفتاح الناقص يسقط إلى العربية فيراه الزائر صحيحاً بلغة أخرى؛ أما «الأصل تغيّر» فيراه بلغته وهو غير مطابق — ولذلك يُعالَج أولاً."
      >
        {localesRead.failure !== null ? (
          <StatsEmpty title="تعذّرت قراءة حالة اللغات">
            العرض <code dir="ltr">v_stats_locales</code> غير متاح — نفِّذ هجرة المرحلة ١٠
            (<code dir="ltr">0022_analytics.sql</code>) أو سجّل الدخول بحساب مدير. جدول
            الترجمات محجوب عن كل الأدوار عدا الإدارة منذ المرحلة ٨، وهذا مقصود.
          </StatsEmpty>
        ) : locales.length === 0 ? (
          <StatsEmpty title="لا لغات مسجَّلة">
            العربية لغة الأصل دائماً. أضف لغة ثانية من شاشة «اللغات» ليبدأ قياس اكتمالها.
          </StatsEmpty>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[46rem] text-sm">
              <thead>
                <tr className="border-b border-border text-xs text-muted-foreground">
                  <th className="p-2 text-start font-medium">اللغة</th>
                  <th className="p-2 text-start font-medium">الحالة</th>
                  <th className="p-2 text-start font-medium">الاكتمال</th>
                  <th className="p-2 text-start font-medium">المفاتيح</th>
                  <th className="p-2 text-start font-medium">منشورة</th>
                  <th className="p-2 text-start font-medium">مسودة</th>
                  <th className="p-2 text-start font-medium">ناقصة</th>
                  <th className="p-2 text-start font-medium">الأصل تغيّر</th>
                </tr>
              </thead>
              <tbody>
                {locales.map((row) => (
                  <tr
                    key={row.locale}
                    className="border-b border-border last:border-0 hover:bg-muted/40"
                  >
                    <td className="p-2">
                      <span className="block font-medium">{row.name}</span>
                      <span dir="ltr" className="block text-xs text-muted-foreground">
                        {row.locale}
                      </span>
                    </td>
                    <td className="p-2">
                      <Badge
                        variant="outline"
                        className={cn(
                          "font-normal",
                          row.isDefault
                            ? "border-sky-300 bg-sky-100 text-sky-900 dark:border-sky-700 dark:bg-sky-950 dark:text-sky-100"
                            : row.enabled
                              ? "border-emerald-300 bg-emerald-100 text-emerald-900 dark:border-emerald-700 dark:bg-emerald-950 dark:text-emerald-100"
                              : "border-border text-muted-foreground"
                        )}
                      >
                        {row.isDefault ? "لغة الأصل" : row.enabled ? "مفعّلة" : "معطّلة"}
                      </Badge>
                    </td>
                    <td className="p-2">
                      {row.isDefault ? (
                        <span className="text-xs text-muted-foreground">—</span>
                      ) : (
                        <div className="flex items-center gap-2">
                          <StatProgressBar
                            percent={row.percent}
                            label={`نسبة اكتمال ترجمة ${row.name}`}
                          />
                          <span dir="ltr" className="shrink-0 text-xs whitespace-nowrap">
                            {row.percent === null ? "—" : formatStatPercent(row.percent)}
                          </span>
                        </div>
                      )}
                    </td>
                    <td className="p-2" dir="ltr">
                      {row.total === null ? "—" : toArabicDigits(row.total)}
                    </td>
                    <td className="p-2 text-emerald-700 dark:text-emerald-300" dir="ltr">
                      {row.published === null ? "—" : toArabicDigits(row.published)}
                    </td>
                    <td className="p-2" dir="ltr">
                      {row.draft === null ? "—" : toArabicDigits(row.draft)}
                    </td>
                    <td className="p-2" dir="ltr">
                      {row.missing === null ? "—" : toArabicDigits(row.missing)}
                    </td>
                    <td
                      className={cn(
                        "p-2 font-medium",
                        (row.stale ?? 0) > 0 ? "text-red-700 dark:text-red-300" : ""
                      )}
                      dir="ltr"
                    >
                      {row.stale === null ? "—" : toArabicDigits(row.stale)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <p className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
          <Languages className="size-3.5 shrink-0" />
          تُراجَع الترجمات وتُنشر من شاشة اللغات.
          <Link
            href="/admin/languages"
            className="inline-flex items-center gap-1 text-primary hover:underline"
          >
            فتح شاشة اللغات
            <ArrowLeft className="size-3" />
          </Link>
        </p>
      </StatsPanel>
    </StatsScreen>
  );
}
