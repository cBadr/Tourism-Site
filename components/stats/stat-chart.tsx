import type { ReactNode } from "react";

import type { StatSeries } from "@/lib/analytics-types";
import { formatStatValue, type StatFormat } from "@/lib/stats/format";
import { statBucketLabel, type StatGranularity } from "@/lib/stats/range";
import { StatsEmpty } from "@/components/stats/stats-ui";
import { cn } from "@/lib/utils";

/**
 * مخطط السلسلة الزمنية — **SVG مكتوب باليد، بلا أي مكتبة رسم** (قرار ٤ في موجز
 * المرحلة ١٠: لا تبعية جديدة لأجل أربعة أشكال).
 *
 * أربعة قرارات تصميم تستحق الشرح:
 *
 * (١) **الزمن يجري من اليمين إلى اليسار.** الواجهة عربية، فالأقدم على اليمين
 *     والأحدث على اليسار. SVG لا يعرف الاتجاه: الإحداثيات تُحسب معكوسة صراحةً
 *     في `x()` أدناه. (وضع الرسم في حاوية RTL لا يقلبه — يقلب موضع الحاوية فقط.)
 *
 * (٢) **لا رقم مشتق على أي محور.** محور القيمة يحمل علامتين فقط: الصفر وأعلى
 *     قيمة **موجودة في البيانات**. لا «متوسط» ولا علامات عند ثلث المدى ولا
 *     تقريب لأقرب مئة — كلها أرقام لا تُرجعها القاعدة، ووجودها على محور يوحي
 *     بأنها من البيانات. الخطوط الرمادية الوسيطة بلا عناوين لهذا السبب.
 *
 * (٣) **التلميح بـ CSS لا بجافاسكربت.** لكل سلة مستطيل شفاف يلتقط التحويم،
 *     ومجموعة التلميح تظهر بـ `group-hover`. النتيجة: صفر جافاسكربت للمخطط،
 *     ويعمل داخل مكوّن خادمي كما هو.
 *
 * (٤) **جدول الأرقام كاملة أسفله** داخل `<details>`: من يريد قراءة الرقم لا
 *     رؤيته، ومن يتصفح بقارئ شاشة أو بلا فأرة، يجدهما هناك. نفس ما فعله مخطط
 *     التدفق النقدي في المرحلة ٧.
 *
 * القيم كلها تصل جاهزة من `funnel_daily` أو `cash_flow`؛ ما يقع هنا هندسة عرض
 * محضة (ارتفاع نقطة نسبةً إلى أعلى قيمة) لا يُعرض ناتجها كرقم أبداً.
 */

/** ألوان السلاسل من رموز التصميم نفسها — أصناف ثابتة كي يلتقطها Tailwind */
const SERIES_TONES = [
  { stroke: "stroke-chart-1", fill: "fill-chart-1", chip: "bg-chart-1" },
  { stroke: "stroke-chart-2", fill: "fill-chart-2", chip: "bg-chart-2" },
  { stroke: "stroke-chart-3", fill: "fill-chart-3", chip: "bg-chart-3" },
  { stroke: "stroke-chart-4", fill: "fill-chart-4", chip: "bg-chart-4" },
  { stroke: "stroke-chart-5", fill: "fill-chart-5", chip: "bg-chart-5" },
];

const tone = (index: number) => SERIES_TONES[index % SERIES_TONES.length];

// أبعاد لوحة الرسم — منطقية لا بكسلية: الـ SVG يتمدد بعرض حاويته
const VIEW_W = 720;
const VIEW_H = 280;
const PAD_TOP = 20;
const PAD_RIGHT = 74; // محور القيمة على اليمين (RTL)
const PAD_BOTTOM = 40;
const PAD_LEFT = 16;

const PLOT_LEFT = PAD_LEFT;
const PLOT_RIGHT = VIEW_W - PAD_RIGHT;
const PLOT_TOP = PAD_TOP;
const PLOT_BOTTOM = VIEW_H - PAD_BOTTOM;
const PLOT_W = PLOT_RIGHT - PLOT_LEFT;
const PLOT_H = PLOT_BOTTOM - PLOT_TOP;

/** عرض صندوق التلميح ومقاساته الداخلية */
const TIP_W = 184;
const TIP_ROW_H = 15;

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

export function StatChart({
  series,
  granularity,
  format = "number",
  currency,
  title,
  emptyMessage,
}: {
  series: StatSeries[];
  granularity: StatGranularity;
  format?: StatFormat;
  currency: string;
  /** عنوان بديل لقارئ الشاشة يصف ما يعرضه المخطط */
  title: string;
  emptyMessage?: ReactNode;
}) {
  // محور الزمن: اتحاد سلال كل السلاسل مرتّبة تصاعدياً (الأقدم أولاً)
  const bucketSet = new Set<string>();
  for (const one of series) {
    for (const point of one.points) bucketSet.add(point.bucket);
  }
  const buckets = [...bucketSet].sort((a, b) => a.localeCompare(b));

  if (buckets.length === 0 || series.length === 0) {
    return (
      <StatsEmpty>
        {emptyMessage ??
          "لا نقطة واحدة في هذه الفترة. جرّب فترة أوسع من الأزرار أعلاه — والمخطط لا يُرسم بمحاور فارغة عمداً."}
      </StatsEmpty>
    );
  }

  const lookup = series.map((one) => {
    const map = new Map<string, number>();
    for (const point of one.points) map.set(point.bucket, point.value);
    return map;
  });

  /**
   * أعلى قيمة في البيانات = مرجع الارتفاعات. **هندسة عرض لا حساب**: لا يُعرض
   * ناتجها كرقم إلا كعلامة المحور العليا، وهي قيمة موجودة في البيانات نفسها.
   */
  let peak = 0;
  for (const map of lookup) {
    for (const value of map.values()) {
      if (Number.isFinite(value) && value > peak) peak = value;
    }
  }

  const n = buckets.length;
  const band = PLOT_W / n;
  // i = ٠ هو الأقدم ⇒ أقصى اليمين. عكس المحور صريح هنا لا بخاصية CSS.
  const x = (i: number) => PLOT_RIGHT - (i + 0.5) * band;
  // القسمة محروسة: `peak = 0` (فترة بلا نشاط) تضع كل النقاط على خط الأساس
  const y = (value: number) => (peak > 0 ? PLOT_BOTTOM - (value / peak) * PLOT_H : PLOT_BOTTOM);

  const labelStep = Math.max(1, Math.ceil(n / 7));
  const showDots = n <= 14;
  const tipH = 20 + series.length * TIP_ROW_H + 6;
  const display = (value: number) => formatStatValue(value, format, currency);

  return (
    <div className="space-y-3">
      {/* المفتاح */}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs text-muted-foreground">
        {series.map((one, index) => (
          <span key={one.key} className="flex items-center gap-1.5">
            <span className={cn("size-2.5 shrink-0 rounded-full", tone(index).chip)} />
            {one.label}
          </span>
        ))}
      </div>

      <div className="overflow-x-auto pb-1">
        <svg
          viewBox={`0 0 ${VIEW_W} ${VIEW_H}`}
          role="img"
          aria-label={title}
          className="h-auto w-full min-w-[32rem]"
        >
          {/* خطوط الشبكة — بلا عناوين عدا الطرفين، فلا رقم مشتق على المحور */}
          {[0, 0.25, 0.5, 0.75, 1].map((fraction) => {
            const lineY = PLOT_BOTTOM - fraction * PLOT_H;
            return (
              <line
                key={fraction}
                x1={PLOT_LEFT}
                y1={lineY}
                x2={PLOT_RIGHT}
                y2={lineY}
                className="stroke-border"
                strokeWidth={fraction === 0 ? 1.2 : 0.7}
                strokeDasharray={fraction === 0 ? undefined : "4 4"}
              />
            );
          })}

          {/* محور القيمة على اليمين (اتجاه الواجهة) — علامتان من البيانات فقط */}
          <line
            x1={PLOT_RIGHT}
            y1={PLOT_TOP}
            x2={PLOT_RIGHT}
            y2={PLOT_BOTTOM}
            className="stroke-border"
            strokeWidth={1.2}
          />
          <text
            x={PLOT_RIGHT + 8}
            y={PLOT_TOP + 4}
            className="fill-muted-foreground text-[11px]"
            textAnchor="start"
          >
            {display(peak)}
          </text>
          <text
            x={PLOT_RIGHT + 8}
            y={PLOT_BOTTOM + 4}
            className="fill-muted-foreground text-[11px]"
            textAnchor="start"
          >
            {display(0)}
          </text>

          {/* الخطوط */}
          {series.map((one, index) => {
            const points = buckets
              .map((bucket, i) => {
                const value = lookup[index].get(bucket);
                return value === undefined ? null : `${x(i)},${y(value)}`;
              })
              .filter((p): p is string => p !== null)
              .join(" ");
            if (points === "") return null;
            return (
              <polyline
                key={one.key}
                points={points}
                fill="none"
                strokeWidth={2}
                strokeLinejoin="round"
                strokeLinecap="round"
                className={tone(index).stroke}
              />
            );
          })}

          {/* النقاط — تُرسم دائماً حين تكون السلال قليلة، وإلا فعند التحويم فقط */}
          {showDots &&
            series.map((one, index) =>
              buckets.map((bucket, i) => {
                const value = lookup[index].get(bucket);
                if (value === undefined) return null;
                return (
                  <circle
                    key={`${one.key}-${bucket}`}
                    cx={x(i)}
                    cy={y(value)}
                    r={2.6}
                    className={tone(index).fill}
                  />
                );
              })
            )}

          {/* عناوين محور الزمن — من الأحدث للأقدم كي تُعنوَن آخر سلة دائماً */}
          {buckets.map((bucket, i) =>
            (n - 1 - i) % labelStep === 0 ? (
              <text
                key={bucket}
                x={x(i)}
                y={PLOT_BOTTOM + 18}
                textAnchor="middle"
                className="fill-muted-foreground text-[10px]"
              >
                {statBucketLabel(bucket, granularity)}
              </text>
            ) : null
          )}

          {/*
            طبقة التحويم — آخر ما يُرسم كي تلتقط المؤشر فوق الخطوط.
            `fill="transparent"` لا `none`: الأخير لا يلتقط مؤشراً.
          */}
          {buckets.map((bucket, i) => {
            const tipX = clamp(x(i) - TIP_W / 2, PLOT_LEFT, PLOT_RIGHT - TIP_W);
            const tipY = PLOT_TOP + 4;
            return (
              <g key={`hover-${bucket}`} className="group/bucket">
                <rect
                  x={x(i) - band / 2}
                  y={PLOT_TOP}
                  width={band}
                  height={PLOT_H}
                  fill="transparent"
                />
                <line
                  x1={x(i)}
                  y1={PLOT_TOP}
                  x2={x(i)}
                  y2={PLOT_BOTTOM}
                  strokeDasharray="3 3"
                  className="stroke-foreground/30 opacity-0 transition-opacity group-hover/bucket:opacity-100"
                />
                {series.map((one, index) => {
                  const value = lookup[index].get(bucket);
                  if (value === undefined) return null;
                  return (
                    <circle
                      key={`h-${one.key}`}
                      cx={x(i)}
                      cy={y(value)}
                      r={4}
                      className={cn(
                        "opacity-0 transition-opacity group-hover/bucket:opacity-100",
                        tone(index).fill
                      )}
                    />
                  );
                })}

                <g className="pointer-events-none opacity-0 transition-opacity group-hover/bucket:opacity-100">
                  <rect
                    x={tipX}
                    y={tipY}
                    width={TIP_W}
                    height={tipH}
                    rx={8}
                    className="fill-foreground"
                  />
                  <text
                    x={tipX + TIP_W / 2}
                    y={tipY + 14}
                    textAnchor="middle"
                    className="fill-background text-[10px] font-medium"
                  >
                    {statBucketLabel(bucket, granularity)}
                  </text>
                  {series.map((one, index) => {
                    const value = lookup[index].get(bucket);
                    const rowY = tipY + 20 + TIP_ROW_H * (index + 1) - 4;
                    return (
                      <g key={`tip-${one.key}`}>
                        <circle
                          cx={tipX + TIP_W - 10}
                          cy={rowY - 3.5}
                          r={3}
                          className={tone(index).fill}
                        />
                        {/* الاسم عند الحافة اليمنى والقيمة عند اليسرى: فصل صريح
                            يتجنّب خلط اتجاه النص العربي بالأرقام داخل SVG */}
                        <text
                          x={tipX + TIP_W - 19}
                          y={rowY}
                          textAnchor="end"
                          className="fill-background text-[10px]"
                        >
                          {one.label}
                        </text>
                        <text
                          x={tipX + 9}
                          y={rowY}
                          textAnchor="start"
                          className="fill-background text-[10px] font-medium"
                        >
                          {value === undefined ? "—" : display(value)}
                        </text>
                      </g>
                    );
                  })}
                </g>
              </g>
            );
          })}
        </svg>
      </div>

      {/* الأرقام كاملة لمن يقرأ لا يرى — والمسار الوحيد المتاح بلا فأرة */}
      <details className="text-sm">
        <summary className="w-fit cursor-pointer text-xs text-primary hover:underline">
          عرض الأرقام في جدول
        </summary>
        <div className="mt-2 overflow-x-auto">
          <table className="w-full min-w-[28rem] text-sm">
            <thead>
              <tr className="border-b border-border text-xs text-muted-foreground">
                <th className="p-2 text-start font-medium">الفترة</th>
                {series.map((one) => (
                  <th key={one.key} className="p-2 text-start font-medium">
                    {one.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {[...buckets].reverse().map((bucket) => (
                <tr key={bucket} className="border-b border-border last:border-0">
                  <td className="p-2 whitespace-nowrap">
                    {statBucketLabel(bucket, granularity)}
                  </td>
                  {series.map((one, index) => {
                    const value = lookup[index].get(bucket);
                    return (
                      <td key={one.key} className="p-2" dir="ltr">
                        {value === undefined ? "—" : display(value)}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </div>
  );
}
