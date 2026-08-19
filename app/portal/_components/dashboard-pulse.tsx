import type { ReactNode } from "react";
import Link from "next/link";
import { Activity, Inbox, Route, ThumbsUp, Wallet } from "lucide-react";

import { countLabel } from "@/components/portal/portal-ui";
import { StatChart } from "@/components/stats/stat-chart";
import { StatRangeFilter } from "@/components/stats/stat-range";
import { SnapshotBadge, StatsEmpty, StatsPanel } from "@/components/stats/stats-ui";
import { Card } from "@/components/ui/card";
import { KpiCard } from "@/components/ui/kpi-card";
import type { StatSeries } from "@/lib/analytics-types";
import { formatStatValue } from "@/lib/stats/format";
import { statDateLabel, statHref, statRangeParams, type StatRange } from "@/lib/stats/range";
import { cn } from "@/lib/utils";
import type { BalanceResult } from "../_lib/balance";
import { netWording } from "./balance-card";
import type { PortalPulse } from "./dashboard-pulse-data";

/**
 * «نبض عملك» — المؤشرات والمخطط والمرشّحات في لوحة المتعهد.
 *
 * ── شكوى بدر التي وُلد منها هذا المكوّن ───────────────────────────────────
 *
 * «تلك الصفحة لا تحتوي على رسوم بيانية أو مؤشرات أو مرشحات وغيرها، فجلّ ما
 * أراه هو بطاقات ثابتة لا توحي لأي حيوية ولا تفاعلية».
 *
 * وكان القياس يصدّقه: ثماني بطاقةِ رقمٍ ساكنة (أربع لقوائم الأسعار وأربع
 * لأرقام الحساب)، **صفر مخطط، صفر مرشّح، صفر مؤشرٍ يقارن فترةً بفترة**.
 *
 * ── ولماذا بمنظومة الرسوم القائمة لا بثانية (القاعدة ١٢) ─────────────────
 *
 * `StatChart` و`StatsPanel` و`StatsEmpty` و`SnapshotBadge` و`StatRangeFilter`
 * و`KpiCard` كلُّها موجودة وتخدم شاشات `/admin/stats` منذ المرحلة ١٠، وكلُّها
 * **مكوّنات خادمية بلا جافاسكربت**: المخطط SVG مكتوبٌ بيد، والتلميح بـCSS،
 * والفترة تسافر في الرابط لا في الذاكرة. فبناءُ مخططٍ ثانٍ للبورتال كان سيشتري
 * الشكلَ نفسه بتبعيةٍ جديدة وسلوكٍ ينحرف — ومنظومةُ الرسوم واحدةٌ في هذا
 * المستودع بقرار.
 *
 * وما لم يُستورَد عمداً: `StatsSectionNav` (تنقّلُ أقسام اللوحة، لا شأن للشريك
 * به) و`StatsNotReady` (نصوصُها تخاطب المالك: «نفِّذ هجرة» و«سجّل بحساب مدير»
 * — وهي جملٌ لا تُقال لشريكٍ خارجيّ).
 *
 * ── 🔴 D-19 — ما لا يظهر في هذا الملف بحال ───────────────────────────────
 *
 * لا سعرَ عميل ولا هامشَ منصة ولا رقمَ متعهدٍ آخر. الرقم المالي الوحيد هنا هو
 * **صافي حساب صاحب الشاشة**، ويصل جاهزاً بإشارته من `portal_balance()` عبر
 * `netWording` المشتركة مع بطاقة الحساب — لا يُحسب هنا ولا يُقرَّب ولا تُقلب
 * إشارته (D-05).
 *
 * ── والصفرُ يُقال ───────────────────────────────────────────────────────
 *
 * ثلاث حالاتِ فراغٍ لا واحدة، ولكلٍّ جملتُها:
 *   • شريكٌ بلا رحلةٍ قط ⇒ لوحةُ نبضٍ لا تُعرض أصلاً، وتحلّ محلَّها جملةٌ تشرح
 *     متى يبدأ العدّ. رسمٌ بمحاور فارغة لشريكٍ جديد إهانةٌ لا معلومة.
 *   • له تاريخٌ ولا نشاطَ في هذه الفترة ⇒ يُقال ذلك ويُقترح توسيعُها.
 *   • تعذّرت قراءةُ سجلّ العروض ⇒ «—» لا «٠٪». والفرق أن الثانية اتهامٌ كاذب.
 */

/**
 * أسماءُ حالات الحجز في **رقائق المرشّح** — أقصر من شارات صفحة «رحلاتي»
 * (‏`TRIP_STATUS_LABELS` في `components/portal/offer-parts.tsx`) لأن الرقاقة سطرٌ
 * في صفٍّ لا شارةٌ داخل بطاقة: «تم الإسناد إليك» يكسر صفَّ خمس رقائق.
 *
 * ⚠ **والقائمة لا تحكم ما يُعرض.** الرقائق تُبنى من الحالات **الموجودة فعلاً**
 * في رحلات الفترة، وما لا اسمَ له هنا يُعرض بقيمته الخام — فحالةٌ جديدة في
 * القاعدة تظهر ناقصةَ الترجمة، ولا تختفي من الشاشة بصمت.
 *
 * 📌 وتوصيةٌ مسجَّلة لبدر (خارج ملفّاتي فلم تُنفَّذ): تصدير `TRIP_STATUS_LABELS`
 * من `offer-parts.tsx` واستهلاكُه هنا بصيغةٍ قصيرة يُنهي الجدولين معاً.
 */
const FILTER_STATUS_LABELS: Record<string, string> = {
  assigned: "مُسندة",
  completed: "منفَّذة",
  cancelled: "ملغاة",
  failed: "متعثّرة",
  confirmed: "بانتظار الإسناد",
};

const statusLabel = (status: string) => FILTER_STATUS_LABELS[status] ?? status;

/** رقاقةُ مرشّح — رابطٌ يحمل الفترة معه، فلا يُعاد اختيارها عند كل تصفية */
function FilterChip({
  href,
  active,
  children,
}: {
  href: string;
  active: boolean;
  children: ReactNode;
}) {
  return (
    <Link
      href={href}
      aria-current={active ? "true" : undefined}
      className={cn(
        "rounded-lg px-2.5 py-1 text-xs transition-colors",
        active
          ? "bg-primary text-primary-foreground"
          : "bg-muted text-muted-foreground hover:text-foreground"
      )}
    >
      {children}
    </Link>
  );
}

export function PortalDashboardPulse({
  pulse,
  balance,
  currency,
  range,
  status,
  openOffers,
}: {
  pulse: PortalPulse;
  /** نتيجة `portal_balance()` كما وصلت — لا يُشتق منها رقمٌ هنا */
  balance: BalanceResult;
  currency: string | null;
  range: StatRange;
  /** مرشّح الحالة الساري كما وصل من الرابط */
  status: string;
  /** العروض المفتوحة الآن — `null` حين تعذّرت قراءتها */
  openOffers: number | null;
}) {
  // المدعوُّ والمحروم: لا لوحةَ نبضٍ لهما — المعالج أعلى الصفحة هو موضعُ خطابهما
  if (pulse.state !== "ready") return null;

  const { offers, points, byStatus } = pulse;

  /*
    شريكٌ لم تُسند إليه رحلةٌ قط ولم يصله عرضٌ قط: جملةٌ تشرح، لا رسمٌ فارغ.
    والشرطان كلاهما **على كل تاريخه** لا على الفترة: من عمل في يونيو ويقرأ
    آخر ثلاثين يوماً ليس «جديداً»، وقولُها له كذبٌ في وجهه.
  */
  const brandNew = pulse.tripsEver === 0 && !pulse.offersEver && pulse.offersRead;
  if (brandNew) {
    return (
      <Card className="gap-2 p-5">
        <div className="flex flex-wrap items-center gap-2">
          <Activity className="size-5 shrink-0 text-primary" aria-hidden="true" />
          <span className="font-heading text-base font-bold">نبض عملك</span>
        </div>
        <p className="text-sm leading-relaxed text-muted-foreground">
          لم تصلك رحلةٌ ولا عرضٌ بعد، فلا شيء نرسمه لك اليوم. تبدأ هذه اللوحة بالامتلاء من أول عرضٍ
          يصلك: عددُ رحلاتك يوماً بيوم، ونسبةُ ما تقبله منها، وصافي حسابك معنا. وحتى ذلك الحين،
          اكتمالُ تجهيزك هو ما يفتح الطريق — وتفصيلُه فيما تقرأه أعلى هذه الصفحة.
        </p>
      </Card>
    );
  }

  /**
   * نسبةُ القبول. بسطُها ومقامها من `trip_offers` نفسه، و`accepted ⊆ decided`
   * بنيوياً — فالحدُّ ٠–١٠٠ **حقيقةٌ لا قصٌّ دفاعي** (النمط ٩ في `LESSONS.md`).
   * وحين لا عرضَ محسوماً لا تُخترع صفراً: `null` تُطبع «—».
   */
  const acceptRate = offers.decided > 0 ? (offers.accepted / offers.decided) * 100 : null;

  const net =
    balance.state === "ready" ? netWording(balance.balance, currency) : null;

  const series: StatSeries[] = [
    {
      key: "trips",
      label: status === "all" ? "رحلاتك" : `رحلاتك (${statusLabel(status)})`,
      points: points.map((p) => ({ bucket: p.bucket, value: p.trips })),
    },
    {
      key: "offers",
      label: "عروضٌ وصلتك",
      points: points.map((p) => ({ bucket: p.bucket, value: p.offers })),
    },
  ];

  const silentPeriod = points.every((p) => p.trips === 0 && p.offers === 0);

  const rangeParams = statRangeParams(range);
  const chipHref = (value: string) =>
    statHref("/portal", { ...rangeParams, status: value === "all" ? undefined : value });

  return (
    <div className="space-y-4">
      {/*
        مرشّح المدة — المكوّن القائم نفسه الذي تستعمله شاشات `/admin/stats`،
        بمساره `/portal`. وحالتُه في الرابط لا في الذاكرة، فيبقى الرابط قابلاً
        للمشاركة ويعمل بجافاسكربت معطّل.

        ⚠ **وأثرٌ معلوم**: نموذجُه `method="get"` يرسل `from` و`to` وحدهما، فتطبيقُ
        نطاقٍ مخصّص **يعيد مرشّح الحالة إلى «الكل»**. وهو مقبولٌ ومقصود — النطاقُ
        الجديد نظرةٌ جديدة — وإصلاحُه يستلزم حقلاً خفياً في `stat-range.tsx`
        وهو ملفٌّ خارج نطاق هذه الجبهة، فسُجّل توصيةً ولم يُحرَّر. أما رقائقُ
        الحالة فتحمل الفترة معها دائماً (‏`chipHref` أدناه).
      */}
      <StatRangeFilter basePath="/portal" range={range} />

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <KpiCard
          title="رحلاتك في الفترة"
          icon={Route}
          value={countLabel(pulse.tripsShown)}
          valueDir="rtl"
          help={
            <>
              الرحلات المُسندة إليك التي يقع <strong>موعد انطلاقها</strong> داخل الفترة
              المختارة، بتوقيت المنصة. وما لم يُحدَّد موعده بعد يُحسب بيوم إسناده إليك. والرقم
              عدُّ رحلاتٍ لا مبلغاً — أرقام المال كلها في بطاقة «حسابك مع المنصة».
            </>
          }
          sub={
            status === "all"
              ? pulse.tripsInRange === 0
                ? "لا رحلة في هذه الفترة."
                : byStatus.map((row) => `${statusLabel(row.status)}: ${countLabel(row.count)}`).join(" · ")
              : `من ${countLabel(pulse.tripsInRange)} رحلة في الفترة كلها.`
          }
        />

        <KpiCard
          title="قبولك للعروض"
          icon={ThumbsUp}
          value={
            !pulse.offersRead ? "—" : formatStatValue(acceptRate, "percent", currency ?? "")
          }
          valueDir="ltr"
          help={
            <>
              نسبةُ ما قبلتَه من العروض التي <strong>حُسمت</strong>: المقبول ÷ (المقبول +
              المرفوض + منتهي المهلة). والمسحوب من المنصة والمعلَّق الذي لم تُسأل فيه بعد خارج الحساب، فلا
              تنخفض نسبتُك بأفعالٍ ليست أفعالك. والعدّان كلاهما من سجلّ عروضك وحده.
            </>
          }
          sub={
            !pulse.offersRead ? (
              "تعذّرت قراءة سجلّ عروضك الآن — حدّث الصفحة، وإن تكرر الأمر راسل الإدارة."
            ) : offers.total === 0 ? (
              "لم يصلك عرضٌ في هذه الفترة."
            ) : (
              <>
                {/*
                  عرضٌ وصل ولم يُحسم بعد ⇒ لا نسبةَ له. و«قبلتَ ٠ من ٠» جملةٌ
                  تُقرأ اتهاماً وهي وصفُ فراغ — فتُقال الحقيقةُ بلفظها.
                */}
                {offers.decided === 0
                  ? "لم يُحسم من عروض هذه الفترة شيءٌ بعد"
                  : `قبلتَ ${countLabel(offers.accepted)} من ${countLabel(offers.decided)} عرضاً حُسم`}
                {offers.expired > 0 ? ` · انتهت مهلة ${countLabel(offers.expired)}` : ""}
                {offers.rejected > 0 ? ` · رفضتَ ${countLabel(offers.rejected)}` : ""}
                {offers.pending > 0 ? ` · ${countLabel(offers.pending)} ما زال مفتوحاً` : ""}
                {offers.revoked > 0 ? ` · سحبت المنصة ${countLabel(offers.revoked)}` : ""}
                {pulse.offersTruncated ? " — والعدّ حدٌّ أدنى: بلغت القراءة سقفها." : "."}
              </>
            )
          }
        />

        <KpiCard
          title="صافي حسابك"
          icon={Wallet}
          value={net ? net.headline : "—"}
          valueDir="rtl"
          valueClassName="text-base sm:text-lg"
          help={
            <>
              الرقم كما تعيده قاعدة البيانات بإشارته، وهو نفسه المعروض في بطاقة «حسابك مع
              المنصة» أسفل الصفحة بتفصيله الكامل. <strong>ولا يتقيّد بالفترة المختارة</strong>:
              حسابٌ جارٍ لا مجموعُ أيام.
            </>
          }
          sub={
            <>
              <SnapshotBadge /> {net ? net.hint : "لم نتمكن من قراءة رصيدك في هذه اللحظة."}
            </>
          }
          subClassName="flex flex-wrap items-center gap-1.5"
        />

        <KpiCard
          title="عروضٌ مفتوحة الآن"
          icon={Inbox}
          href="/portal/requests"
          value={openOffers === null ? "—" : countLabel(openOffers)}
          valueDir="rtl"
          help={
            <>
              العروض التي لم تنتهِ مهلتُها بعد وتنتظر قرارك في صندوق الطلبات.{" "}
              <strong>لا تتقيّد بالفترة المختارة</strong> — هي حالةُ اللحظة، والمهلةُ تمضي سواء
              فُتحت الشاشة أم لا.
            </>
          }
          sub={
            <>
              <SnapshotBadge />{" "}
              {openOffers === null
                ? "تعذّرت قراءة صندوق طلباتك الآن."
                : openOffers === 0
                  ? "لا عرض ينتظر قرارك الآن."
                  : "افتح صندوق الطلبات قبل انتهاء المهلة."}
            </>
          }
          subClassName="flex flex-wrap items-center gap-1.5"
        />
      </div>

      <StatsPanel
        title="رحلاتك والعروض التي وصلتك"
        icon={Activity}
        description="خطّان يومَ بيوم داخل الفترة المختارة: ما وصلك من عروض، وما صار رحلةً مُسندة إليك."
        help={
          <>
            كلُّ نقطةٍ عددُ صفوفٍ في يومٍ واحد بتوقيت المنصة — لا مبلغ ولا متوسط. والعروض
            تُنسب إلى <strong>يوم وصولها إليك</strong>، والرحلات إلى{" "}
            <strong>يوم انطلاقها</strong>؛ ولذلك قد يسبق الخطُّ الأول الثاني بأيام، وهو فارقٌ
            حقيقيّ لا خلل.
          </>
        }
      >
        {pulse.windowClamped ? (
          <p className="text-xs leading-relaxed text-amber-700 dark:text-amber-300">
            النطاق المطلوب أطول مما تعرضه هذه اللوحة، فالمعروض آخر{" "}
            {countLabel(pulse.points.length)} يوماً منه — من{" "}
            {statDateLabel(pulse.windowFrom)}. والأرقام أعلاه لهذه النافذة نفسها لا لما طُلب.
          </p>
        ) : null}

        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-xs text-muted-foreground">حالة الرحلة</span>
          <FilterChip href={chipHref("all")} active={status === "all"}>
            الكل ({countLabel(pulse.tripsInRange)})
          </FilterChip>
          {byStatus.map((row) => (
            <FilterChip key={row.status} href={chipHref(row.status)} active={status === row.status}>
              {statusLabel(row.status)} ({countLabel(row.count)})
            </FilterChip>
          ))}
        </div>

        {silentPeriod ? (
          <StatsEmpty title="لا نشاط في هذه الفترة">
            لم تصلك عروضٌ ولم تنطلق لك رحلةٌ بين التاريخين المختارين — ولك نشاطٌ خارجهما. جرّب
            فترةً أوسع من الأزرار أعلاه، أو أزل مرشّح الحالة.
          </StatsEmpty>
        ) : (
          <StatChart
            series={series}
            granularity="day"
            format="number"
            currency={currency ?? ""}
            title="عدد العروض التي وصلتك وعدد رحلاتك المُسندة، يوماً بيوم"
          />
        )}
      </StatsPanel>
    </div>
  );
}
