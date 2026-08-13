import Link from "next/link";
import { ArrowLeft, ClipboardCheck, Handshake, Layers, Search, UserPlus } from "lucide-react";

import { toArabicDigits } from "@/components/booking/format";
import { HelpTip } from "@/components/shared/HelpTip";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { SubcontractorStatus } from "@/lib/subcontractor-types";
import { createServerSupabase } from "@/lib/supabase/server";
import { cn } from "@/lib/utils";
import {
  asText,
  Banners,
  relativeTime,
  toLatinDigits,
} from "../orders/_components/booking-ui";
import {
  readSubcontractor,
  SUB_STATUS_HINTS,
  SUBCONTRACTOR_ERRORS,
  SubStatusBadge,
  type SubcontractorView,
} from "./_components/subcontractor-ui";
import { inviteSubcontractor } from "./actions";

/**
 * قائمة المتعهدين — سجل الشركاء المنفّذين للرحلات.
 *
 * كل عدّ وترشيح يقع في Postgres: التبويبات والبحث شرطان في الاستعلام، والأعداد
 * تأتي من `count: exact` ومن دوال التجميع في القاعدة — لا عدّ مصفوفات في الواجهة.
 * لا حساب مالي هنا إطلاقاً: هذه الشاشة تعرّف الشركاء فقط، وأسعارهم تُراجع في
 * طابور المراجعة وتُحسب داخل `quote_price`.
 *
 * الدعوة بلا كلمة مرور: المدير يُدخل الشركة والبريد والموبايل، والنظام يُنشئ صف
 * المتعهد ويرسل بريد دعوة رسمياً من Supabase ليحدد الشريك كلمة مروره بنفسه.
 */

export const metadata = { title: "المتعهدون" };

const hasSupabaseEnv = () =>
  Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);

const TABS: { key: string; label: string; status: SubcontractorStatus | null }[] = [
  { key: "all", label: "الكل", status: null },
  { key: "pending", label: "بانتظار الاعتماد", status: "pending" },
  { key: "approved", label: "معتمد", status: "approved" },
  { key: "suspended", label: "موقوف", status: "suspended" },
];

const MAX_ROWS = 100;
/** سقوف عاقلة للاستعلامات المساعدة — لوحة شركاء لا سجل ضخم */
const MAX_IDS = 1000;
const MAX_LIST_IDS = 2000;

/**
 * تنظيف نص البحث: الأرقام العربية تُحوَّل، والمحارف التي يفسّرها PostgREST داخل
 * `or(...)` تُزال حتى لا يُكسر الفلتر أو يُوسَّع (نفس معالجة شاشة الطلبات).
 */
function cleanQuery(raw: unknown): string {
  if (typeof raw !== "string") return "";
  return toLatinDigits(raw)
    .replace(/[,()"'\\%*.]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 60);
}

const searchFilter = (q: string) => `company_name.ilike.%${q}%,phone.ilike.%${q}%`;

type Counts = { approved: number | null; pending: number | null };

type Kpis = {
  /** إجمالي المتعهدين بلا أي ترشيح */
  total: number | null;
  /** قوائم الأسعار المنتظرة للمراجعة عبر كل المتعهدين */
  pendingLists: number | null;
  /** الفئات التي يغطيها متعهد معتمد واحد على الأقل، من أصل الفئات النشطة */
  coveredClasses: number | null;
  totalClasses: number | null;
};

type Loaded = {
  rows: SubcontractorView[];
  counts: Record<string, number | null>;
  lists: Map<string, Counts>;
  listsReady: boolean;
  kpis: Kpis;
  ready: boolean;
};

type Supabase = NonNullable<Awaited<ReturnType<typeof createServerSupabase>>>;

const idsOf = (rows: unknown, limit: number): string[] =>
  Array.isArray(rows)
    ? (rows as Record<string, unknown>[])
        .map((r) => asText(r.id))
        .filter((v): v is string => v !== null)
        .slice(0, limit)
    : [];

/**
 * عدد قوائم الأسعار لكل متعهد — التجميع يقع في Postgres عبر دوال التجميع في
 * PostgREST (نفس أسلوب أرقام الاستهلاك في شاشة حسابات الدفع)، فلا تُنقل صفوف
 * القوائم إلى الخادم لمجرد عدّها. تعذّر التجميع = «—» لا رقم مخترع.
 */
async function loadListCounts(
  supabase: Supabase,
  ids: string[]
): Promise<{ lists: Map<string, Counts>; ready: boolean }> {
  const lists = new Map<string, Counts>();
  if (ids.length === 0) return { lists, ready: true };

  const countBy = async (status: string) =>
    supabase
      .from("price_lists")
      .select("subcontractor_id, n:id.count()")
      .eq("status", status)
      .in("subcontractor_id", ids);

  const [approvedRes, pendingRes] = await Promise.all([countBy("approved"), countBy("pending")]);
  if (approvedRes.error || pendingRes.error) return { lists, ready: false };

  const fold = (res: { data: unknown }, key: keyof Counts) => {
    for (const row of (res.data ?? []) as Record<string, unknown>[]) {
      const id = asText(row.subcontractor_id);
      if (!id) continue;
      const current = lists.get(id) ?? { approved: 0, pending: 0 };
      const n = typeof row.n === "number" ? row.n : Number(row.n);
      lists.set(id, { ...current, [key]: Number.isFinite(n) ? n : 0 });
    }
  };
  fold(approvedRes, "approved");
  fold(pendingRes, "pending");

  return { lists, ready: true };
}

/**
 * الفئات المغطاة — فئة «مغطاة» حين يوجد لها سعر داخل قائمة معتمدة لمتعهد معتمد،
 * وهو بالضبط شرط دخول السعر في `quote_price`. كل رقم هنا COUNT من القاعدة،
 * وTypeScript لا تفعل سوى المقارنة بالصفر.
 */
async function loadCoverage(
  supabase: Supabase
): Promise<{ covered: number | null; totalClasses: number | null }> {
  const classesRes = await supabase.from("vehicle_classes").select("slug").eq("active", true);
  if (classesRes.error) return { covered: null, totalClasses: null };

  const slugs = ((classesRes.data ?? []) as Record<string, unknown>[])
    .map((r) => asText(r.slug))
    .filter((v): v is string => v !== null);
  const totalClasses = slugs.length;
  if (totalClasses === 0) return { covered: 0, totalClasses };

  const subsRes = await supabase
    .from("subcontractors")
    .select("id")
    .eq("status", "approved")
    .limit(MAX_IDS);
  if (subsRes.error) return { covered: null, totalClasses };
  const subIds = idsOf(subsRes.data, MAX_IDS);
  if (subIds.length === 0) return { covered: 0, totalClasses };

  const listsRes = await supabase
    .from("price_lists")
    .select("id")
    .eq("status", "approved")
    .in("subcontractor_id", subIds)
    .limit(MAX_LIST_IDS);
  if (listsRes.error) return { covered: null, totalClasses };
  const listIds = idsOf(listsRes.data, MAX_LIST_IDS);
  if (listIds.length === 0) return { covered: 0, totalClasses };

  const counts = await Promise.all(
    slugs.map(async (slug) => {
      const { count, error } = await supabase
        .from("price_list_items")
        .select("class_slug", { count: "exact", head: true })
        .eq("class_slug", slug)
        .in("price_list_id", listIds);
      return error ? null : (count ?? 0);
    })
  );
  if (counts.some((c) => c === null)) return { covered: null, totalClasses };

  return { covered: counts.filter((c) => (c ?? 0) > 0).length, totalClasses };
}

async function loadSubcontractors(
  status: SubcontractorStatus | null,
  query: string
): Promise<Loaded> {
  const empty: Loaded = {
    rows: [],
    counts: {},
    lists: new Map(),
    listsReady: false,
    kpis: { total: null, pendingLists: null, coveredClasses: null, totalClasses: null },
    ready: false,
  };

  const supabase = await createServerSupabase();
  if (!supabase) return empty;

  // عدّ كل تبويب داخل Postgres مع نفس شرط البحث الجاري
  const countOf = async (tabStatus: SubcontractorStatus | null) => {
    let q = supabase.from("subcontractors").select("id", { count: "exact", head: true });
    if (tabStatus) q = q.eq("status", tabStatus);
    if (query) q = q.or(searchFilter(query));
    const { count, error } = await q;
    return error ? null : (count ?? 0);
  };

  // `select("*")` لا أعمدة مسمّاة: الجدول يملكه وكيل SQL، وعمود واحد بغير الاسم
  // المتوقع كان سيُسقط الشاشة كلها إلى «غير جاهزة»
  let listQuery = supabase
    .from("subcontractors")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(MAX_ROWS);
  if (status) listQuery = listQuery.eq("status", status);
  if (query) listQuery = listQuery.or(searchFilter(query));

  const [listRes, countsRes, totalRes, pendingListsRes, coverage] = await Promise.all([
    listQuery,
    Promise.all(TABS.map((tab) => countOf(tab.status))),
    supabase.from("subcontractors").select("id", { count: "exact", head: true }),
    supabase.from("price_lists").select("id", { count: "exact", head: true }).eq("status", "pending"),
    loadCoverage(supabase),
  ]);

  // خطأ الاستعلام الرئيسي = جداول المرحلة ٥ غير منفَّذة بعد
  if (listRes.error) return empty;

  const counts: Record<string, number | null> = {};
  TABS.forEach((tab, i) => {
    counts[tab.key] = countsRes[i] ?? null;
  });

  const rows = ((listRes.data ?? []) as Record<string, unknown>[]).map(readSubcontractor);
  const { lists, ready: listsReady } = await loadListCounts(
    supabase,
    rows.map((r) => r.id)
  );

  return {
    rows,
    counts,
    lists,
    listsReady,
    kpis: {
      total: totalRes.error ? null : (totalRes.count ?? 0),
      pendingLists: pendingListsRes.error ? null : (pendingListsRes.count ?? 0),
      coveredClasses: coverage.covered,
      totalClasses: coverage.totalClasses,
    },
    ready: true,
  };
}

const numberText = (v: number | null) => (v === null ? "—" : toArabicDigits(v));

function KpiCard({
  title,
  value,
  sub,
  icon: Icon,
  help,
  href,
}: {
  title: string;
  value: string;
  sub: string;
  icon: typeof Handshake;
  help: string;
  href?: string;
}) {
  const body = (
    <Card
      className={cn(
        "h-full gap-1 p-4",
        href && "transition-colors hover:bg-muted"
      )}
    >
      <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
        <Icon className="size-3.5 text-primary" />
        {title}
        <HelpTip>{help}</HelpTip>
      </div>
      <span className="block text-2xl font-bold" dir="ltr">
        {value}
      </span>
      <span className="block text-xs text-muted-foreground">{sub}</span>
    </Card>
  );
  return href ? (
    <Link href={href} className="block">
      {body}
    </Link>
  ) : (
    body
  );
}

function ListsCell({ counts, ready }: { counts: Counts | undefined; ready: boolean }) {
  if (!ready) return <span className="text-muted-foreground">—</span>;
  const approved = counts?.approved ?? 0;
  const pending = counts?.pending ?? 0;
  return (
    <span className="flex flex-wrap items-center gap-1.5">
      <span>
        {toArabicDigits(approved)} <span className="text-muted-foreground">معتمدة</span>
      </span>
      {pending > 0 && (
        <Badge
          variant="outline"
          className="border-sky-300 bg-sky-100 text-sky-900 dark:border-sky-700 dark:bg-sky-950 dark:text-sky-100"
        >
          {toArabicDigits(pending)} بانتظار المراجعة
        </Badge>
      )}
    </span>
  );
}

function SubRow({
  sub,
  counts,
  listsReady,
}: {
  sub: SubcontractorView;
  counts: Counts | undefined;
  listsReady: boolean;
}) {
  return (
    <tr className="border-b border-border last:border-0 hover:bg-muted/40">
      <td className="p-2 align-top">
        <Link
          href={`/admin/subcontractors/${sub.id}`}
          className="font-medium transition-colors hover:text-primary hover:underline"
        >
          {sub.companyName}
        </Link>
        <span className="mt-0.5 block text-xs text-muted-foreground">
          أُضيف {relativeTime(sub.createdAt)}
        </span>
      </td>
      <td className="p-2 align-top">
        <span dir="ltr" className="block">
          {sub.phone ?? "—"}
        </span>
        <span dir="ltr" className="block text-xs text-muted-foreground">
          {sub.email ?? "—"}
        </span>
      </td>
      <td className="p-2 align-top">
        <SubStatusBadge status={sub.status} />
      </td>
      <td className="p-2 align-top text-xs">
        <ListsCell counts={counts} ready={listsReady} />
      </td>
      <td className="p-2 align-top text-xs">
        {sub.profileId ? (
          <span className="text-muted-foreground">مرتبط</span>
        ) : (
          <span className="text-amber-700 dark:text-amber-300">بانتظار قبول الدعوة</span>
        )}
      </td>
      <td className="p-2 align-top">
        <Link
          href={`/admin/subcontractors/${sub.id}`}
          className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
        >
          الملف
          <ArrowLeft className="size-3" />
        </Link>
      </td>
    </tr>
  );
}

function SubCard({
  sub,
  counts,
  listsReady,
}: {
  sub: SubcontractorView;
  counts: Counts | undefined;
  listsReady: boolean;
}) {
  return (
    <Card className="gap-2 p-4">
      <div className="flex flex-wrap items-center gap-2">
        <Link
          href={`/admin/subcontractors/${sub.id}`}
          className="font-medium transition-colors hover:text-primary hover:underline"
        >
          {sub.companyName}
        </Link>
        <SubStatusBadge status={sub.status} />
        <span className="ms-auto text-xs text-muted-foreground">
          {relativeTime(sub.createdAt)}
        </span>
      </div>
      <div className="text-sm" dir="ltr">
        {sub.phone ?? "—"}
      </div>
      <div className="text-xs text-muted-foreground" dir="ltr">
        {sub.email ?? "—"}
      </div>
      <div className="text-xs">
        <ListsCell counts={counts} ready={listsReady} />
      </div>
      <Link
        href={`/admin/subcontractors/${sub.id}`}
        className="mt-1 inline-flex items-center gap-1 text-xs text-primary hover:underline"
      >
        فتح الملف
        <ArrowLeft className="size-3" />
      </Link>
    </Card>
  );
}

export default async function SubcontractorsPage({
  searchParams,
}: PageProps<"/admin/subcontractors">) {
  const params = await searchParams;
  const wired = hasSupabaseEnv();

  const rawTab = typeof params.status === "string" ? params.status : "all";
  const tab = TABS.find((t) => t.key === rawTab) ?? TABS[0];
  const query = cleanQuery(params.q);

  const { rows, counts, lists, listsReady, kpis, ready } = await loadSubcontractors(
    tab.status,
    query
  );
  const saved = params.saved === "1";
  const error = typeof params.error === "string" ? params.error : null;

  const tabHref = (key: string, keepQuery = true) => {
    const qs = new URLSearchParams();
    if (key !== "all") qs.set("status", key);
    if (keepQuery && query) qs.set("q", query);
    const s = qs.toString();
    return s ? `/admin/subcontractors?${s}` : "/admin/subcontractors";
  };

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="font-heading text-lg font-bold">المتعهدون</h2>
        <HelpTip>
          المتعهدون هم المنفّذون الفعليون للرحلات. لكل متعهد أسطوله وقوائم أسعاره،
          وأسعاره <span className="font-semibold">لا تدخل التسعير إلا وهو معتمد وقائمته معتمدة</span>
          . ابدأ من تبويب «بانتظار الاعتماد» ومن طابور مراجعة الأسعار.
        </HelpTip>
        <Link
          href="/admin/subcontractors/reviews"
          className="ms-auto inline-flex items-center gap-1.5 text-sm text-primary transition-colors hover:underline"
        >
          <ClipboardCheck className="size-4" />
          مراجعة الأسعار
          {kpis.pendingLists ? (
            <Badge variant="secondary">{toArabicDigits(kpis.pendingLists)}</Badge>
          ) : null}
        </Link>
      </div>

      <Banners
        wired={wired}
        readOnly={!ready}
        saved={saved}
        error={error}
        errorMessages={SUBCONTRACTOR_ERRORS}
        savedMessage="نُفذت العملية."
        readOnlyTitle="سجل المتعهدين غير جاهز بعد"
        readOnlyBody={
          <p>
            قاعدة البيانات مربوطة لكن جدول <code dir="ltr">subcontractors</code> غير موجود —
            نفِّذ هجرة المرحلة ٥ من <code dir="ltr">supabase/migrations</code> ثم أعد تحميل
            الصفحة.
          </p>
        }
      />

      {/* بطاقات المؤشرات — كل رقم فيها محسوب داخل Postgres */}
      <div className="grid gap-3 sm:grid-cols-3">
        <KpiCard
          title="عدد المتعهدين"
          value={numberText(kpis.total)}
          sub="كل الشركاء المسجَّلين بأي حالة"
          icon={Handshake}
          help="إجمالي المتعهدين في السجل بلا ترشيح — بمن فيهم المنتظرون والموقوفون. استخدم التبويبات أدناه لترى كل حالة على حدة."
        />
        <KpiCard
          title="قوائم بانتظار المراجعة"
          value={numberText(kpis.pendingLists)}
          sub="أرسلها المتعهدون وتنتظر بتّك"
          icon={ClipboardCheck}
          href="/admin/subcontractors/reviews"
          help="قوائم الأسعار التي أرسلها المتعهدون ولم تُعتمد بعد. لا تدخل التسعير قبل اعتمادها، فكل يوم تأخير يعني رحلات تُسعَّر بتعريفة الكيلومتر بدل سعر الشريك."
        />
        <KpiCard
          title="الفئات المغطاة"
          value={
            kpis.coveredClasses === null
              ? "—"
              : `${toArabicDigits(kpis.coveredClasses)}${kpis.totalClasses === null ? "" : ` / ${toArabicDigits(kpis.totalClasses)}`}`
          }
          sub="فئات لها سعر معتمد من متعهد معتمد"
          icon={Layers}
          help="كم فئة سيارة يوجد لها سعر داخل قائمة معتمدة لمتعهد معتمد، من أصل الفئات النشطة. الفئة غير المغطاة تُسعَّر دائماً بتعريفة الكيلومتر."
        />
      </div>

      {/* التبويبات وبطاقات الأعداد شيء واحد: كل بطاقة تعرض عدد حالتها وتُرشِّح عند الضغط */}
      <nav
        aria-label="ترشيح المتعهدين بالحالة"
        className="grid grid-cols-2 gap-2 sm:grid-cols-4"
      >
        {TABS.map((item) => {
          const active = item.key === tab.key;
          const count = counts[item.key];
          return (
            <Link
              key={item.key}
              href={tabHref(item.key)}
              aria-current={active ? "page" : undefined}
              title={item.status ? SUB_STATUS_HINTS[item.status] : "كل المتعهدين بلا ترشيح بالحالة"}
              className={cn(
                "rounded-xl bg-card p-3 text-center ring-1 transition-colors",
                active ? "bg-primary/10 ring-2 ring-primary" : "ring-foreground/10 hover:bg-muted"
              )}
            >
              <span className="block text-xl font-bold" dir="ltr">
                {count === null ? "—" : toArabicDigits(count)}
              </span>
              <span className="block text-xs text-muted-foreground">{item.label}</span>
            </Link>
          );
        })}
      </nav>

      {/* البحث نموذج GET حتى يبقى الرابط قابلاً للمشاركة */}
      <form action="/admin/subcontractors" method="get">
        <Card className="flex flex-row flex-wrap items-end gap-3 p-4">
          {tab.key !== "all" && <input type="hidden" name="status" value={tab.key} />}
          <div className="min-w-52 flex-1 space-y-1.5">
            <label
              htmlFor="subs-q"
              className="flex items-center gap-1.5 text-sm font-medium leading-none"
            >
              بحث
              <HelpTip>
                ابحث باسم الشركة أو برقم الموبايل — جزء من الاسم أو الرقم يكفي. الأرقام
                العربية مقبولة وتُحوَّل تلقائياً.
              </HelpTip>
            </label>
            <Input
              id="subs-q"
              name="q"
              defaultValue={query}
              placeholder="اسم الشركة أو رقم الموبايل"
              disabled={!ready}
            />
          </div>
          <Button type="submit" disabled={!ready}>
            <Search />
            بحث
          </Button>
          {query && (
            <Link
              href={tabHref(tab.key, false)}
              className="pb-1.5 text-sm text-muted-foreground transition-colors hover:text-primary hover:underline"
            >
              مسح البحث
            </Link>
          )}
        </Card>
      </form>

      {ready && rows.length === 0 && (
        <Card className="p-5 text-sm text-muted-foreground">
          {query
            ? "لا يوجد متعهد مطابق لبحثك — جرّب جزءاً من اسم الشركة أو رقماً آخر."
            : tab.status
              ? `لا يوجد متعهد في حالة «${tab.label}» حالياً.`
              : "لا يوجد متعهدون بعد — ادعُ أول شريك من النموذج أسفل الصفحة. قبل اعتماد متعهد واحد على الأقل تُسعَّر كل الرحلات بتعريفة الكيلومتر."}
        </Card>
      )}

      {rows.length > 0 && (
        <>
          <Card className="hidden p-0 md:block">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[48rem] text-sm">
                <thead>
                  <tr className="border-b border-border text-xs text-muted-foreground">
                    <th className="p-2 text-start font-medium">الشركة</th>
                    <th className="p-2 text-start font-medium">التواصل</th>
                    <th className="p-2 text-start font-medium">الحالة</th>
                    <th className="p-2 text-start font-medium">قوائم الأسعار</th>
                    <th className="p-2 text-start font-medium">حساب الدخول</th>
                    <th className="p-2 text-start font-medium" />
                  </tr>
                </thead>
                <tbody>
                  {rows.map((sub) => (
                    <SubRow
                      key={sub.id}
                      sub={sub}
                      counts={lists.get(sub.id)}
                      listsReady={listsReady}
                    />
                  ))}
                </tbody>
              </table>
            </div>
          </Card>

          <div className="space-y-3 md:hidden">
            {rows.map((sub) => (
              <SubCard
                key={sub.id}
                sub={sub}
                counts={lists.get(sub.id)}
                listsReady={listsReady}
              />
            ))}
          </div>

          <p className="text-xs text-muted-foreground">
            المعروض {toArabicDigits(rows.length)} من المتعهدين
            {rows.length === MAX_ROWS
              ? ` (أحدث ${toArabicDigits(MAX_ROWS)} — ضيّق البحث للوصول للأقدم)`
              : ""}
            .{" "}
            {listsReady
              ? "«قوائم الأسعار» تعرض المعتمدة والمنتظرة لكل شريك."
              : "تعذّر عدّ قوائم الأسعار — الأعمدة تظهر «—» حتى تكتمل هجرة المرحلة ٥."}
          </p>
        </>
      )}

      {/* الدعوة — لا كلمة مرور تُكتب ولا تُعرض هنا إطلاقاً */}
      <form action={ready ? inviteSubcontractor : undefined}>
        <Card className="space-y-4 p-5">
          <div>
            <h3 className="flex items-center gap-1.5 font-heading text-base font-bold">
              <UserPlus className="size-4 text-primary" />
              دعوة متعهد جديد
              <HelpTip>
                يُنشأ للمتعهد سجل بحالة «بانتظار الاعتماد» ويصله بريد دعوة رسمي{" "}
                <span className="font-semibold">يحدد منه كلمة مروره بنفسه</span> — لا تكتب له
                كلمة مرور ولا ترسلها في أي رسالة. بعد دخوله يكمل بياناته وأسطوله وقوائم
                أسعاره، ثم تعتمده أنت من ملفه.
              </HelpTip>
            </h3>
            <p className="text-sm text-muted-foreground">
              الاعتماد خطوة مستقلة بعد الدعوة: الشريك المدعو لا تدخل أسعاره التسعير حتى
              تعتمده.
            </p>
          </div>

          <div className="grid gap-4 sm:grid-cols-3">
            <div className="space-y-1.5">
              <Label htmlFor="new-company" className="flex items-center gap-1.5">
                اسم الشركة
                <HelpTip>
                  الاسم الذي يظهر لك في القوائم وطابور المراجعة — للاستخدام الداخلي فقط ولا
                  يراه العميل إطلاقاً.
                </HelpTip>
              </Label>
              <Input
                id="new-company"
                name="new.company_name"
                required
                disabled={!ready}
                placeholder="شركة النقل السياحي"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="new-email" className="flex items-center gap-1.5">
                البريد الإلكتروني
                <HelpTip>
                  إليه يصل رابط الدعوة، وبه يسجّل المتعهد دخوله لاحقاً. تأكد من صحته قبل
                  الإرسال — الرابط لا يصل إلى بريد خاطئ.
                </HelpTip>
              </Label>
              <Input
                id="new-email"
                name="new.email"
                type="email"
                dir="ltr"
                required
                disabled={!ready}
                placeholder="partner@example.com"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="new-phone" className="flex items-center gap-1.5">
                رقم الموبايل
                <HelpTip>
                  رقم تواصل التشغيل مع المتعهد. الأرقام العربية مقبولة وتُحوَّل تلقائياً.
                </HelpTip>
              </Label>
              <Input
                id="new-phone"
                name="new.phone"
                dir="ltr"
                required
                disabled={!ready}
                placeholder="01xxxxxxxxx"
              />
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-end gap-3">
            <span className="me-auto text-xs text-muted-foreground">
              بعد الحفظ تُفتح صفحة ملف المتعهد لتتابع حالة دعوته.
            </span>
            <Button type="submit" disabled={!ready}>
              <UserPlus />
              إنشاء الحساب وإرسال الدعوة
            </Button>
          </div>
        </Card>
      </form>
    </div>
  );
}
