import { ChevronDown, GitBranch } from "lucide-react";

import { formatAmount } from "@/components/booking/format";
import { HelpTip } from "@/components/shared/HelpTip";
import { StatsEmpty } from "@/components/stats/stats-ui";
import { FUNNEL_SCOPE_NOTE, type FunnelSideView, type FunnelStageView } from "@/lib/stats/cards";
import { formatStatPercent } from "@/lib/stats/format";
import { cn } from "@/lib/utils";

/**
 * رسم القمع: **سلسلة من أربع مراحل** ومعدلات التحول بينها، ثم — منفصلين تحتها —
 * الحدثان اللذان يُقاسان ولا ينتميان إلى السلسلة.
 *
 * ── لماذا السلسلة أربع مراحل ومصدرها واحد ───────────────────────────────────
 * كل مرحلة تُعدّ من `public.funnel_events` وحده (هجرة 0023). قبلها كان القاع
 * يُعدّ من `bookings`/`payments` والرأس من سجل الأحداث، فكان كل حجز أُنشئ قبل
 * تشغيل القياس — وكل حجز يُدخله التشغيل هاتفياً — يدخل القاع بلا رأس، وتخرج
 * نسبةٌ تتجاوز ١٠٠٪. النتيجة العملية أن هذه الأرقام تقيس **الرحلة على الموقع**
 * لا إجمالي أعمال الشركة، وهذا مكتوب للمالك في `FUNNEL_SCOPE_NOTE`.
 *
 * ── لماذا الحدثان تحت السلسلة لا بينها ──────────────────────────────────────
 * `quote_requested` مسار دخول موازٍ (طلب سعر يدوي)، و`booking_started` فرع
 * البوابة الإلكترونية لا يمر به الحجز المدفوع بتحويل بنكي. وضعُ أيٍّ منهما بين
 * مرحلتين يجعل «التحول» رقماً بلا معنى — فيظهران بعدّادهما وحده، بلا نسبة، تحت
 * عنوان يقول صراحةً إنهما خارج السلسلة.
 *
 * ── ولماذا لا تُقسَم نسبة واحدة هنا ─────────────────────────────────────────
 *  ١) قاعدة المرحلة: كل رقم من Postgres. قسمة في المتصفح تصنع رقماً ثانياً
 *     ينحرف عن أي تقرير آخر عند أول اختلاف في التقريب أو في تعريف البسط.
 *  ٢) المقام قد يكون صفراً (فترة بلا بحث واحد) ⇒ `NaN` أو `Infinity` على شاشة
 *     المالك. هنا لا مقام أصلاً: غياب النسبة يُطبع «—» ويشرح نفسه.
 *
 * عرض الشريط نسبةً إلى أوسع مرحلة **هندسة عرض** لا رقم معروض.
 */

/** ألوان المراحل: تتدرّج مع ضيق القمع */
const STAGE_TONES = ["bg-chart-1", "bg-chart-2", "bg-chart-3", "bg-chart-4"];

/** أقل عرض مرئي لمرحلة قيمتها أكبر من صفر */
const MIN_STAGE_PERCENT = 6;

export function StatFunnel({
  stages,
  side = [],
}: {
  stages: FunnelStageView[];
  /** الحدثان خارج السلسلة — يُعرضان بعدّادهما وحده */
  side?: FunnelSideView[];
}) {
  const known = stages.filter((stage) => stage.value !== null);
  const knownSide = side.filter((one) => one.value !== null);

  if (known.length === 0) {
    return (
      <StatsEmpty title="مجاميع القمع غير متاحة">
        تعذّرت قراءة الدالة <code dir="ltr">funnel_summary(p_from, p_to)</code> من قاعدة
        البيانات — غالباً لأن هجرة القمع لم تُنفَّذ على هذه القاعدة بعد. المخطط اليومي
        أدناه مصدره مستقل فيبقى صحيحاً ومكتملاً. ولا تُجمع نقاطه ولا تُقسَم في المتصفح
        عمداً: قسمةٌ هنا تعني رقماً يخالف بقية التقارير، و«لا شيء» في فترة بلا بحث.
      </StatsEmpty>
    );
  }

  // أوسع مرحلة = مرجع العرض. لا يُشتق منها رقم معروض.
  const peak = known.reduce((max, stage) => Math.max(max, stage.value ?? 0), 0);
  const widthPercent = (value: number | null): number => {
    if (value === null || value <= 0 || peak <= 0) return 0;
    return Math.max(MIN_STAGE_PERCENT, Math.min(100, (value / peak) * 100));
  };

  return (
    <div className="space-y-4">
      <ol className="space-y-1">
        {stages.map((stage, index) => (
          <li key={stage.event}>
            {index > 0 ? (
              <div className="flex items-center gap-2 ps-2 text-xs text-muted-foreground">
                <ChevronDown className="size-3.5 shrink-0" />
                {stage.ratePercent === null ? (
                  <span className="flex items-center gap-1.5">
                    <span>معدل التحول: —</span>
                    <HelpTip>
                      لا مقارنة ممكنة: المرحلة السابقة صفر في هذه الفترة. النسبة تُحسب داخل
                      قاعدة البيانات ولا تُشتق في المتصفح، فلا يُعرض هنا رقم مخترع.
                      {stage.rateHelp ? <> {stage.rateHelp}</> : null}
                    </HelpTip>
                  </span>
                ) : (
                  <span className="flex items-center gap-1.5">
                    <span>
                      معدل التحول: <span dir="ltr">{formatStatPercent(stage.ratePercent)}</span>
                    </span>
                    <HelpTip>
                      {stage.rateHelp ??
                        "نسبة من بلغ هذه المرحلة إلى من بلغ سابقتها داخل السلسلة، محسوبةً في قاعدة البيانات."}
                    </HelpTip>
                  </span>
                )}
              </div>
            ) : null}

            <div className="space-y-1 py-1">
              <div className="flex items-baseline gap-2 text-sm">
                <span className="flex min-w-0 items-center gap-1.5">
                  <span className="truncate font-medium">{stage.label}</span>
                  {stage.help ? <HelpTip>{stage.help}</HelpTip> : null}
                </span>
                <span dir="ltr" className="ms-auto shrink-0 font-bold whitespace-nowrap">
                  {stage.value === null ? "—" : formatAmount(stage.value)}
                </span>
              </div>
              <div className="h-6 w-full overflow-hidden rounded-lg bg-muted">
                <div
                  className={cn(
                    "h-full rounded-lg transition-all",
                    STAGE_TONES[index % STAGE_TONES.length]
                  )}
                  style={{ width: `${widthPercent(stage.value)}%` }}
                />
              </div>
            </div>
          </li>
        ))}
      </ol>

      {knownSide.length > 0 && (
        <section className="space-y-2 rounded-lg border border-dashed p-3">
          <h4 className="flex items-center gap-1.5 text-xs font-semibold text-muted-foreground">
            <GitBranch className="size-3.5 shrink-0" />
            أحداث خارج السلسلة — بلا معدل تحول
            <HelpTip>
              هذان الحدثان يُقاسان ويُعرضان، ولا يقعان بين مرحلتين من القمع: الأول مسار دخول
              موازٍ للحاسبة الفورية، والثاني فرعٌ لا يمر به إلا من اختار بوابة إلكترونية. نسبةُ
              أيٍّ منهما إلى مرحلة قبله كانت ستكون رقماً بلا معنى، فلا تُعرض.
            </HelpTip>
          </h4>

          <ul className="grid gap-2 sm:grid-cols-2">
            {side.map((one) => (
              <li
                key={one.event}
                className="flex items-baseline gap-2 rounded-md bg-muted/50 px-3 py-2 text-sm"
              >
                <span className="flex min-w-0 items-center gap-1.5">
                  <span className="truncate">{one.label}</span>
                  <HelpTip>{one.help}</HelpTip>
                </span>
                <span dir="ltr" className="ms-auto shrink-0 font-bold whitespace-nowrap">
                  {one.value === null ? "—" : formatAmount(one.value)}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}

      <p className="text-xs leading-relaxed text-muted-foreground">{FUNNEL_SCOPE_NOTE}</p>
    </div>
  );
}
