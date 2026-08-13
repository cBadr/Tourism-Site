import "server-only";

import type { StatSeries } from "@/lib/analytics-types";
import { classifyStatsError, numberOf, rowsOf, type StatsRead, textOf } from "@/lib/stats/read";
import type { createServerSupabase } from "@/lib/supabase/server";

/**
 * قرّاء شاشة إحصائيات الخصومات (القسم السابع).
 *
 * **مصدر واحد للرقم الواحد.** بطاقات هذه الشاشة تُجمَّع داخل
 * `section_stats('discounts')` من `v_stats_discounts`، والمخططان يقرآن العرض
 * نفسه — فمجموع الرسم لا يخالف بطاقته بالبناء. قراءة المخطط من جدول
 * `coupon_redemptions` مباشرةً كانت ستضع رقمين لشيء واحد على الشاشة الواحدة،
 * وهو النمط ٨ في `handover/LESSONS.md` (وقع مرتين وكلّف تصحيحاً في كل مرة).
 *
 * ولا تجميع في TypeScript: ما يقع هنا ترتيب صفوف وتحويل شكل، لا جمع ولا قسمة.
 */

type Supabase = NonNullable<Awaited<ReturnType<typeof createServerSupabase>>>;

/** نفس تصنيف بقية شاشات الإحصائيات — «الهجرة غير منفَّذة» تُقال بالاسم */
const failed = <T,>(
  data: T,
  name: string,
  error: { code?: string; hint?: string | null; message?: string } | null
): StatsRead<T> => ({
  data,
  ready: false,
  failure: classifyStatsError(error),
  missing: name,
});

const ok = <T,>(data: T): StatsRead<T> => ({ data, ready: true, failure: null, missing: null });

/**
 * `v_stats_discounts` ← أربع سلاسل يومية.
 *
 * ⚠ الأيام بلا استخدام لا صف لها في العرض، فلا نقطة لها في المخطط. لا نُدرج
 * أصفاراً من عندنا: «لا صف» و«صفر» ليسا الشيء نفسه (نفس قاعدة مخطط الخزينة).
 */
export async function readDiscountSeries(
  supabase: Supabase,
  from: string,
  to: string
): Promise<{
  money: StatsRead<StatSeries[]>;
  counts: StatSeries[];
}> {
  const result = await supabase
    .from("v_stats_discounts")
    .select("*")
    .gte("day", from)
    .lte("day", to);

  if (result.error) {
    return { money: failed<StatSeries[]>([], "v_stats_discounts", result.error), counts: [] };
  }

  const rows = rowsOf(result.data)
    .map((row) => ({ day: textOf(row, ["day", "bucket", "date"]), row }))
    .filter((entry): entry is { day: string; row: Record<string, unknown> } => entry.day !== null)
    .sort((a, b) => a.day.localeCompare(b.day));

  const series = (
    key: string,
    label: string,
    names: string[]
  ): StatSeries => ({
    key,
    label,
    points: rows.map((entry) => ({
      bucket: entry.day,
      value: numberOf(entry.row, names) ?? 0,
    })),
  });

  // الأسماء أدناه هي أعمدة `v_stats_discounts` في 0024 حرفاً بحرف. ولا سلسلة
  // «قيمة اسمية» هنا: العرض لا يحمل عموداً كهذا، ورسم خطٍّ على الصفر بعنوان
  // «القيمة الاسمية» كان سيقول للمالك إن كل الخصومات طُبِّقت كاملة — بينما ما
  // يخبره بالحقيقة هو خط «المقلَّص» في المخطط الثاني.
  return {
    money: ok([
      series("discount_amount", "الخصم الممنوح فعلاً", ["discount_amount", "discount_total"]),
      series("discounted_orders_value", "قيمة الطلبات المخصومة (بعد الخصم)", [
        "discounted_orders_value",
        "orders_value",
      ]),
    ]),
    counts: [
      series("redemptions_count", "مرات الاستخدام", ["redemptions_count", "redemptions", "uses"]),
      series("coupons_used", "كوبونات مختلفة", ["coupons_used", "distinct_coupons"]),
      series("clamped_count", "منها ما قلّصته الأرضية", ["clamped_count", "clamped"]),
    ],
  };
}

/** صف كوبون في جدول «الأكثر استخداماً» — لقطة تراكمية لا مقطّعة بفترة */
export type TopCouponRow = {
  id: string;
  code: string;
  kind: "percent" | "amount";
  value: number | null;
  usedCount: number | null;
  maxUses: number | null;
  enabled: boolean;
};

/**
 * أكثر الكوبونات استخداماً — من جدول `coupons` نفسه.
 *
 * **عدّاده تراكمي منذ إنشاء الكوبون ولا يتقيّد بالفترة المختارة أعلى الشاشة**،
 * ولذلك يحمل وسم «صورة الآن» ونصّاً يشرح لماذا قد يختلف عن بطاقة الفترة. جعلُ
 * الرقمين متساويين قسراً كذبة؛ والفارق المشروح ليس عطلاً (النمط ٨، البند ٤).
 */
export async function readTopCoupons(supabase: Supabase): Promise<StatsRead<TopCouponRow[]>> {
  const result = await supabase
    .from("coupons")
    .select("id, code, kind, value, used_count, max_uses, enabled")
    .order("used_count", { ascending: false })
    .limit(10);

  if (result.error) return failed<TopCouponRow[]>([], "coupons", result.error);

  const rows: TopCouponRow[] = rowsOf(result.data)
    .map((row) => ({
      id: textOf(row, ["id"]) ?? "",
      code: textOf(row, ["code"]) ?? "",
      kind: textOf(row, ["kind"]) === "amount" ? ("amount" as const) : ("percent" as const),
      value: numberOf(row, ["value"]),
      usedCount: numberOf(row, ["used_count"]),
      maxUses: numberOf(row, ["max_uses"]),
      enabled: row.enabled === true,
    }))
    .filter((row) => row.id !== "" && row.code !== "");

  return ok(rows);
}
