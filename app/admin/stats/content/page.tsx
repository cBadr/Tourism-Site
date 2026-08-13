import Link from "next/link";
import { ArrowLeft, FileText, Search } from "lucide-react";

import { toArabicDigits } from "@/components/booking/format";
import { StatBars } from "@/components/stats/stat-bars";
import { StatsScreen } from "@/components/stats/section-screen";
import { SnapshotBadge, StatsEmpty, StatsPanel } from "@/components/stats/stats-ui";
import type { LoadedStatCard } from "@/lib/stats/cards";
import type { StatBarItem } from "@/lib/stats/format";
import {
  blankRead,
  type ContentSnapshot,
  hasSupabaseEnv,
  readContentSnapshot,
  readSectionCards,
  readStatsCurrency,
} from "@/lib/stats/read";
import { resolveStatRange } from "@/lib/stats/range";
import { createServerSupabase } from "@/lib/supabase/server";

/**
 * إحصائيات المحتوى والسيو.
 *
 * هذا أحد القسمين اللذين «يسقطان دائماً» بحسب موجز المرحلة ١٠ — ووجوده ليس
 * تكملة عدد: المحتوى هو ما يجلب الزائر الذي يملأ قمع الطلبات، وصفحة بلا وصف
 * ميتا تظهر في نتائج البحث بمقتطف يختاره جوجل من متنها.
 *
 * **لا جدول صفحات هنا عمداً.** `v_stats_content` لقطة مجمَّعة (صف واحد)، وقائمة
 * الصفحات الناقصة بعينها مكانها مركز السيو الذي يملك تحريرها — وتكرارها في
 * شاشتين يصنع شاشتين تختلفان بمرور الوقت. هذه الشاشة تجيب «كم؟» وتحيل على «أيّ».
 */

export const metadata = { title: "إحصائيات المحتوى والسيو" };

const num = (value: number | null): string => (value === null ? "—" : toArabicDigits(value));

/** يبني صفوف مقارنة من اللقطة — قيم كما وصلت، لا اشتقاق */
function snapshotBars(snapshot: ContentSnapshot): StatBarItem[] {
  const rows: { key: string; label: string; value: number | null; hint: string }[] = [
    {
      key: "pages_published",
      label: "صفحات منشورة",
      value: snapshot.pagesPublished,
      hint: "الصفحات التي يراها الزائر الآن.",
    },
    {
      key: "pages_draft",
      label: "صفحات غير منشورة",
      value: snapshot.pagesDraft,
      hint: "موجودة في المحرر ومحجوبة عن الزائر.",
    },
    {
      key: "meta_complete",
      label: "ميتاداتا مكتملة",
      value: snapshot.metaComplete,
      hint: "لها عنوان سيو ووصف سيو معاً، وكلاهما غير فارغ بعد إزالة المسافات.",
    },
    {
      key: "meta_missing",
      label: "ميتاداتا ناقصة",
      value: snapshot.metaMissing,
      hint: "ينقصها العنوان أو الوصف أو كلاهما — هذه قائمة عمل مركز السيو.",
    },
    {
      key: "faq_pages",
      label: "صفحات ببيانات مهيكلة",
      value: snapshot.faqPages,
      hint: "الصفحات التي فيها قسم أسئلة شائعة ظاهر وفيه عنصر مكتمل (سؤال وجواب معاً) — وهو بالضبط شرط تصدير JSON-LD في المكوّن، فقسم أسئلة فارغ لا يُعدّ هنا ولا يُصدِّر شيئاً. الصفحة الرئيسية لها بياناتها المهيكلة من الكود ولا تُعدّ هنا. نفس تعريف /admin/seo/audit حرفاً بحرف.",
    },
  ];

  return rows
    .filter((row) => row.value !== null)
    .map((row) => ({
      key: row.key,
      label: row.label,
      value: row.value,
      display: `${num(row.value)} صفحة`,
      hint: row.hint,
    }));
}

export default async function ContentStatsPage({
  searchParams,
}: PageProps<"/admin/stats/content">) {
  const params = await searchParams;
  const range = resolveStatRange(params);
  const wired = hasSupabaseEnv();
  const supabase = await createServerSupabase();

  const [currency, cardsRead, snapshotRead] = supabase
    ? await Promise.all([
        readStatsCurrency(supabase),
        readSectionCards(supabase, "content", range.from, range.to),
        readContentSnapshot(supabase),
      ])
    : ([
        "EGP",
        blankRead<LoadedStatCard[]>([], "section_stats"),
        blankRead<ContentSnapshot | null>(null, "v_stats_content"),
      ] as const);

  const snapshot = snapshotRead.data;
  const bars = snapshot ? snapshotBars(snapshot) : [];

  return (
    <StatsScreen
      section="content"
      range={range}
      wired={wired}
      cards={cardsRead.data}
      cardsFailure={cardsRead.failure}
      cardsMissing={cardsRead.missing}
      currency={currency}
    >
      <StatsPanel
        title="حالة المحتوى والميتاداتا"
        icon={Search}
        action={<SnapshotBadge />}
        help="هذه لقطة اللحظة لا مجموع فترة، فلا تتغيّر بتغيير الفترة المختارة أعلاه — عدا بطاقة «صفحات عُدِّلت» وحدها. «مكتمل» يعني أن حقلَي عنوان ووصف السيو غير فارغين في قاعدة البيانات، لا حكماً على جودة النص."
        description="طول الشريط عرضٌ نسبي لأكبر قيمة، والعدد نفسه هو ما يُطبع بجواره."
      >
        {snapshotRead.failure !== null || snapshot === null ? (
          <StatsEmpty title="تعذّرت قراءة لقطة المحتوى">
            العرض <code dir="ltr">v_stats_content</code> غير متاح — نفِّذ هجرة المرحلة ١٠
            (<code dir="ltr">0022_analytics.sql</code>)، وتأكد أنك مسجَّل بحساب مدير: الدالة
            خلفه تفشل مغلقة بصفر صف لغير الإدارة، لأن جدولَي الصفحات والأقسام مقروءان لكل
            مستخدم مسجَّل.
          </StatsEmpty>
        ) : (
          <>
            <StatBars items={bars} />
            <dl className="grid gap-x-6 gap-y-1 text-xs text-muted-foreground sm:grid-cols-2">
              <div className="flex items-baseline justify-between gap-2 border-b border-border py-1">
                <dt>إجمالي الصفحات</dt>
                <dd dir="ltr" className="font-medium text-foreground">
                  {num(snapshot.pagesTotal)}
                </dd>
              </div>
              <div className="flex items-baseline justify-between gap-2 border-b border-border py-1">
                <dt>صفحات لها عنوان سيو</dt>
                <dd dir="ltr" className="font-medium text-foreground">
                  {num(snapshot.metaTitleCount)}
                </dd>
              </div>
              <div className="flex items-baseline justify-between gap-2 border-b border-border py-1">
                <dt>صفحات لها وصف سيو</dt>
                <dd dir="ltr" className="font-medium text-foreground">
                  {num(snapshot.metaDescCount)}
                </dd>
              </div>
              <div className="flex items-baseline justify-between gap-2 border-b border-border py-1">
                <dt>أقسام المحتوى (الظاهر منها)</dt>
                <dd dir="ltr" className="font-medium text-foreground">
                  {num(snapshot.sectionsVisible)} / {num(snapshot.sectionsTotal)}
                </dd>
              </div>
            </dl>
          </>
        )}

        <p className="flex flex-wrap items-center gap-x-3 gap-y-1.5 text-xs text-muted-foreground">
          <span className="flex items-center gap-1.5">
            <FileText className="size-3.5 shrink-0" />
            أيّ صفحة بعينها ينقصها ماذا؟ ذلك في مركز السيو ومحرر المحتوى.
          </span>
          <Link
            href="/admin/seo"
            className="inline-flex items-center gap-1 text-primary hover:underline"
          >
            مركز السيو
            <ArrowLeft className="size-3" />
          </Link>
          <Link
            href="/admin/content"
            className="inline-flex items-center gap-1 text-primary hover:underline"
          >
            محرر المحتوى
            <ArrowLeft className="size-3" />
          </Link>
        </p>
      </StatsPanel>
    </StatsScreen>
  );
}
