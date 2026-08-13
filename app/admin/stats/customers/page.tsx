import { ShieldCheck, Users } from "lucide-react";

import { StatBars } from "@/components/stats/stat-bars";
import { StatChart } from "@/components/stats/stat-chart";
import { StatsScreen } from "@/components/stats/section-screen";
import { StatsPanel } from "@/components/stats/stats-ui";
import type { StatSeries } from "@/lib/analytics-types";
import { cardsByKeys, FUNNEL_SCOPE_NOTE, type LoadedStatCard } from "@/lib/stats/cards";
import { cardsToBars } from "@/lib/stats/format";
import {
  blankRead,
  hasSupabaseEnv,
  pickSeries,
  readFunnelSeries,
  readSectionCards,
  readStatsCurrency,
} from "@/lib/stats/read";
import { resolveStatRange } from "@/lib/stats/range";
import { createServerSupabase } from "@/lib/supabase/server";

/**
 * إحصائيات العملاء — جدد وعائدون ومتوسط قيمة الحجز.
 *
 * **لا جدول عملاء في المنصة.** هذه الأرقام تُشتق داخل قاعدة البيانات بالتجميع
 * على رقم هاتف الحجز (عميل عائد = له حجز أقدم من الفترة)، و**الرقم لا يخرج من
 * القاعدة**: نوع إرجاع العرض أعدادٌ ونسب لا هويات، ولا يوجد في هذا الملف ولا في
 * `lib/stats/read.ts` حقل واحد يحمل اسماً أو هاتفاً. نفس القاعدة الثالثة في
 * `lib/analytics-types.ts` المطبَّقة على ما يخرج لجوجل وميتا، مطبَّقةً هنا على ما
 * يخرج إلى الشاشة.
 */

export const metadata = { title: "إحصائيات العملاء" };

/** شريحتا العميل — مفاتيح من `section_stats('customers')` حرفياً */
const SEGMENT_KEYS = ["new_customers", "returning_customers"];

/** الحجز والتحصيل من سلاسل `funnel_daily` */
const BOOKING_SERIES_KEYS = ["booking_created", "booking_paid"];

export default async function CustomersStatsPage({
  searchParams,
}: PageProps<"/admin/stats/customers">) {
  const params = await searchParams;
  const range = resolveStatRange(params);
  const wired = hasSupabaseEnv();
  const supabase = await createServerSupabase();

  const [currency, cardsRead, funnelRead] = supabase
    ? await Promise.all([
        readStatsCurrency(supabase),
        readSectionCards(supabase, "customers", range.from, range.to),
        readFunnelSeries(supabase, range.from, range.to),
      ])
    : ([
        "EGP",
        blankRead<LoadedStatCard[]>([], "section_stats"),
        blankRead<StatSeries[]>([], "funnel_daily"),
      ] as const);

  const segments = cardsByKeys(cardsRead.data, SEGMENT_KEYS);

  return (
    <StatsScreen
      section="customers"
      range={range}
      wired={wired}
      cards={cardsRead.data}
      cardsFailure={cardsRead.failure}
      cardsMissing={cardsRead.missing}
      currency={currency}
    >
      {segments.length > 0 && (
        <StatsPanel
          title="جدد مقابل عائدين"
          icon={Users}
          help="«جديد» يعني أن أول حجز له على الإطلاق وقع داخل هذه الفترة — لا أول حجز داخلها فقط، وإلا صار كل عميل قديم «جديداً» كلما ضاقت الفترة. التجميع كله في قاعدة البيانات، والهاتف الذي يعرّف العميل لا يخرج منها."
          description="ارتفاع نصيب العائدين أرخص طريق لنمو الإيراد: لا تكلفة تسويق لعميل يعرفك."
        >
          <StatBars items={cardsToBars(segments, currency)} />
        </StatsPanel>
      )}

      <StatsPanel
        title="الحجوزات والتحصيل يومياً — من الموقع"
        icon={Users}
        help={`عدد الحجوزات المُنشأة وعدد التي وصل تحصيلها، يوماً بيوم من دالة funnel_daily. الفجوة بين الخطين هي الحجوزات المتروكة بلا دفع. ${FUNNEL_SCOPE_NOTE}`}
      >
        <StatChart
          series={pickSeries(funnelRead.data, BOOKING_SERIES_KEYS)}
          granularity="day"
          currency={currency}
          title="مخطط الحجوزات المُنشأة والمدفوعة يوماً بيوم"
          emptyMessage="لا حجز في هذه الفترة. جرّب فترة أوسع من الأزرار أعلاه."
        />

        {/* ───────────────────────────────────────────────────────────────────
            نصٌّ **ظاهر** لا داخل HelpTip، ونظيره حرفياً في
            `components/stats/stat-funnel.tsx`.

            السبب: البطاقات فوق هذا المخطط تأتي من `section_stats('customers')`
            ← `v_stats_customers` ← جدول `bookings` **كاملاً**، بينما المخطط
            يقرأ `booking_created`/`booking_paid` من `funnel_daily` أي من
            `public.funnel_events` وحده (هجرة 0023). فالمالك قد يرى «طلبات
            الفترة: ٥» وتحتها مباشرة خطاً على الصفر لنفس الفترة — لأن تلك
            الحجوزات أُنشئت قبل تشغيل القياس أو أدخلها التشغيل هاتفياً.
            و`StatChart` لا يعرض رسالة الفراغ هنا أصلاً: `funnel_daily` تملأ كل
            يوم بنقطة قيمتها صفر، فلا `buckets.length = 0` ولا نص يفسّر الصفر.
            إخفاء هذا التفسير في تلميحة يعني تركَ الفارق يُقرأ عطلاً.
            ─────────────────────────────────────────────────────────────────── */}
        <p className="text-xs leading-relaxed text-muted-foreground">{FUNNEL_SCOPE_NOTE}</p>
      </StatsPanel>

      <div className="flex items-start gap-2 rounded-lg border border-dashed border-border p-3 text-xs leading-relaxed text-muted-foreground">
        <ShieldCheck className="mt-0.5 size-4 shrink-0 text-primary" />
        <p>
          لا تعرض هذه الشاشة اسم عميل ولا رقمه ولا أي بيان يعرّفه — أعداد ونسب فقط. بيانات
          التواصل تُقرأ من شاشة «الطلبات» عند الحاجة إليها في التشغيل، ولا تُصدَّر إلى أي
          خدمة قياس خارجية.
        </p>
      </div>
    </StatsScreen>
  );
}
