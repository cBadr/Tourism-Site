import Link from "next/link";
import { ArrowLeft, Search } from "lucide-react";

import { ExportLink } from "@/components/admin/export-link";
import { formatMoney, toArabicDigits } from "@/components/booking/format";
import { readTripStops } from "@/components/booking/stops";
import { HelpTip } from "@/components/shared/HelpTip";
import { PagePulse } from "@/components/stats/page-pulse";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import type { TripSnapshot } from "@/lib/booking-types";
import { readPagePulse, type PagePulseData } from "@/lib/stats/pulse";
import { createServerSupabase } from "@/lib/supabase/server";
import { cn } from "@/lib/utils";
import {
  type AdminBookingStatus,
  Banners,
  COMMON_BOOKING_ERRORS,
  PLAN_LABELS,
  relativeTime,
  StatusBadge,
  STATUS_HINTS,
  STATUS_LABELS,
  toLatinDigits,
} from "./_components/booking-ui";

/**
 * قائمة الطلبات — طابور تشغيل الحجوزات.
 *
 * كل الترشيح والعدّ يقع في Postgres: الحالة والبحث شرطان في الاستعلام،
 * والأعداد تأتي من `count: exact` (دالة COUNT في القاعدة) لا من عدّ مصفوفة في المتصفح.
 * لا حساب مالي هنا — المبالغ تُقرأ من لقطة الحجز كما خزّنتها `create_booking`.
 */

export const metadata = { title: "الطلبات" };

const hasSupabaseEnv = () =>
  Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);

/** أعمدة الحجز كما في عقد lib/booking-types.ts (snake_case) */
const LIST_COLUMNS =
  "id, reference, status, class_slug, class_title, total, currency, plan, amount_due, amount_remaining, customer_name, customer_phone, created_at, trip";

/**
 * تبويبات الترشيح — «مُسند» يظهر ضمن «الكل» ويأخذ تبويبه في المرحلة ٦ مع الإسناد.
 *
 * و«لم يتم التنفيذ» (‏0051) لها تبويبها من اليوم: هي **مقياسُ جودة تشغيل** لا حالةً
 * عابرة — «كم رحلة خابت هذا الشهر؟» سؤالٌ يُسأل، وتركُها مبعثرةً في «الكل» يجعله
 * سؤالاً بلا شاشة. وموضعها بعد «تم الإلغاء» لأن كليهما نهاية طريق.
 *
 * 🔒 **والتسمية تُقرأ من `STATUS_LABELS` ولا تُكتب هنا**: نسخةٌ ثانيةٌ من نفس
 * القاموس هي ما جعل `failed` تتخلّف عن أخواتها الست حين طُبِّق نمط «تم + مصدر»
 * (‏قرار المالك 2026-08-17) — أُصلح موضعٌ وبقي الآخر «فاشلة». و`key` يبقى
 * **المعرِّف الإنجليزي المخزَّن** لأنه يسافر في `?status=` ويصل الاستعلام كما هو.
 */
const TABS: { key: string; label: string; status: AdminBookingStatus | null }[] = [
  { key: "all", label: "الكل", status: null },
  { key: "pending_payment", label: STATUS_LABELS.pending_payment, status: "pending_payment" },
  { key: "under_review", label: STATUS_LABELS.under_review, status: "under_review" },
  { key: "confirmed", label: STATUS_LABELS.confirmed, status: "confirmed" },
  { key: "completed", label: STATUS_LABELS.completed, status: "completed" },
  { key: "cancelled", label: STATUS_LABELS.cancelled, status: "cancelled" },
  { key: "failed", label: STATUS_LABELS.failed, status: "failed" },
];

const MAX_ROWS = 100;

type OrderRow = {
  id: string;
  reference: string;
  status: string;
  classTitle: string | null;
  classSlug: string | null;
  total: number;
  currency: string;
  plan: string | null;
  amountDue: number;
  amountRemaining: number;
  customerName: string | null;
  customerPhone: string | null;
  createdAt: string | null;
  trip: Partial<TripSnapshot>;
};

/**
 * تنظيف نص البحث: الأرقام العربية تُحوَّل، والمحارف التي يفسّرها PostgREST
 * داخل `or(...)` (فاصلة/أقواس/اقتباس/نسبة) تُزال حتى لا يُكسر الفلتر أو يُوسَّع.
 */
function cleanQuery(raw: unknown): string {
  if (typeof raw !== "string") return "";
  return toLatinDigits(raw)
    .replace(/[,()"'\\%*.]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 60);
}

const searchFilter = (q: string) =>
  `reference.ilike.%${q}%,customer_phone.ilike.%${q}%,customer_whatsapp.ilike.%${q}%`;

const asTrip = (raw: unknown): Partial<TripSnapshot> =>
  raw && typeof raw === "object" && !Array.isArray(raw) ? (raw as Partial<TripSnapshot>) : {};

const numberOf = (v: unknown): number => {
  const n = typeof v === "number" ? v : typeof v === "string" ? Number(v) : NaN;
  return Number.isFinite(n) ? n : 0;
};

async function loadOrders(
  status: AdminBookingStatus | null,
  query: string
): Promise<{
  orders: OrderRow[];
  counts: Record<string, number | null>;
  ready: boolean;
  pulse: PagePulseData | null;
}> {
  const empty = { orders: [] as OrderRow[], counts: {}, ready: false, pulse: null };

  const supabase = await createServerSupabase();
  if (!supabase) return empty;

  // عدّ كل تبويب داخل Postgres (COUNT) مع نفس شرط البحث الجاري — لا عدّ في الواجهة
  const countOf = async (tabStatus: AdminBookingStatus | null) => {
    let q = supabase.from("bookings").select("id", { count: "exact", head: true });
    if (tabStatus) q = q.eq("status", tabStatus);
    if (query) q = q.or(searchFilter(query));
    const { count, error } = await q;
    return error ? null : (count ?? 0);
  };

  let listQuery = supabase
    .from("bookings")
    .select(LIST_COLUMNS)
    .order("created_at", { ascending: false })
    .limit(MAX_ROWS);
  if (status) listQuery = listQuery.eq("status", status);
  if (query) listQuery = listQuery.or(searchFilter(query));

  // نبض الشاشة يُقرأ مع الجدول والأعداد في نفس الجولة — لا انتظار متتابعاً
  const [listRes, countsRes, pulse] = await Promise.all([
    listQuery,
    Promise.all(TABS.map((tab) => countOf(tab.status))),
    readPagePulse(supabase, "/admin/orders"),
  ]);

  // خطأ الاستعلام الرئيسي = جدول الحجوزات غير جاهز (هجرة المرحلة ٤ لم تُنفَّذ بعد)
  if (listRes.error) return empty;

  const counts: Record<string, number | null> = {};
  TABS.forEach((tab, i) => {
    counts[tab.key] = countsRes[i] ?? null;
  });

  const orders = ((listRes.data ?? []) as Record<string, unknown>[]).map((row) => ({
    id: String(row.id),
    reference: typeof row.reference === "string" ? row.reference : "—",
    status: typeof row.status === "string" ? row.status : "",
    classTitle: typeof row.class_title === "string" ? row.class_title : null,
    classSlug: typeof row.class_slug === "string" ? row.class_slug : null,
    total: numberOf(row.total),
    currency: typeof row.currency === "string" ? row.currency : "EGP",
    plan: typeof row.plan === "string" ? row.plan : null,
    amountDue: numberOf(row.amount_due),
    amountRemaining: numberOf(row.amount_remaining),
    customerName: typeof row.customer_name === "string" ? row.customer_name : null,
    customerPhone: typeof row.customer_phone === "string" ? row.customer_phone : null,
    createdAt: typeof row.created_at === "string" ? row.created_at : null,
    trip: asTrip(row.trip),
  }));

  return { orders, counts, ready: true, pulse };
}

/**
 * ملخص المسار في سطر واحد — من لقطة الرحلة المخزّنة مع الحجز.
 *
 * 🔴 **والمحطات تُذكر عدداً هنا لا أسماءً**: العمود بعرض `18rem` في جدولٍ
 * صفوفُه طابورُ تشغيل، وثلاثةُ أسماءٍ فيه تدفع بقيةَ الأعمدة خارج الشاشة.
 * ومن يحتاج الأسماء يفتح الطلب — وهناك تُعرض كاملةً بترتيبها.
 *
 * ⚠ **والسكوت عنها ليس خياراً**: من يفتح هذا الطابور ليُسند يدوياً يحتاج أن
 * يعرف أن هذه الرحلة **ليست مساراً مباشراً** قبل أن يقرّر — الطولُ يختلف
 * والمستحقُّ يختلف.
 */
function RouteSummary({ trip }: { trip: Partial<TripSnapshot> }) {
  const origin = trip.originLabel ?? "—";
  const dest = trip.destLabel ?? "—";
  const stopsCount = readTripStops(trip).length;
  return (
    <span className="block leading-relaxed">
      <span className="text-muted-foreground">من</span> {origin}{" "}
      <span className="text-muted-foreground">إلى</span> {dest}
      {stopsCount > 0 ? (
        <span className="text-muted-foreground">
          {" "}
          · عبر {toArabicDigits(stopsCount)} محطة
        </span>
      ) : null}
      {trip.roundTrip ? <span className="text-muted-foreground"> · ذهاب وعودة</span> : null}
    </span>
  );
}

function OrderTableRow({ order }: { order: OrderRow }) {
  return (
    <tr className="border-b border-border last:border-0 hover:bg-muted/40">
      <td className="p-2 align-top">
        <Link
          href={`/admin/orders/${order.id}`}
          className="font-medium transition-colors hover:text-primary hover:underline"
          dir="ltr"
        >
          {order.reference}
        </Link>
        <span className="mt-0.5 block text-xs text-muted-foreground">
          {relativeTime(order.createdAt)}
        </span>
      </td>
      <td className="p-2 align-top">
        <span className="block font-medium">{order.customerName ?? "—"}</span>
        <span dir="ltr" className="block text-xs text-muted-foreground">
          {order.customerPhone ?? "—"}
        </span>
      </td>
      <td className="max-w-[18rem] p-2 align-top text-xs">
        <RouteSummary trip={order.trip} />
      </td>
      <td className="p-2 align-top">{order.classTitle ?? order.classSlug ?? "—"}</td>
      <td className="p-2 align-top font-medium" dir="ltr">
        {formatMoney(order.total, order.currency)}
      </td>
      <td className="p-2 align-top" dir="ltr">
        {formatMoney(order.amountDue, order.currency)}
      </td>
      <td className="p-2 align-top">
        <StatusBadge status={order.status} />
      </td>
      <td className="p-2 align-top">
        <Link
          href={`/admin/orders/${order.id}`}
          className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
        >
          التفاصيل
          <ArrowLeft className="size-3" />
        </Link>
      </td>
    </tr>
  );
}

function OrderCard({ order }: { order: OrderRow }) {
  return (
    <Card className="gap-2 p-4">
      <div className="flex flex-wrap items-center gap-2">
        <Link
          href={`/admin/orders/${order.id}`}
          dir="ltr"
          className="font-medium transition-colors hover:text-primary hover:underline"
        >
          {order.reference}
        </Link>
        <StatusBadge status={order.status} />
        <span className="ms-auto text-xs text-muted-foreground">
          {relativeTime(order.createdAt)}
        </span>
      </div>
      <div className="text-sm">
        <span className="font-medium">{order.customerName ?? "—"}</span>
        <span dir="ltr" className="ms-2 text-xs text-muted-foreground">
          {order.customerPhone ?? "—"}
        </span>
      </div>
      <div className="text-xs text-muted-foreground">
        <RouteSummary trip={order.trip} />
      </div>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
        <span>{order.classTitle ?? order.classSlug ?? "—"}</span>
        <span className="text-muted-foreground">·</span>
        <span dir="ltr" className="font-medium">
          {formatMoney(order.total, order.currency)}
        </span>
        <span className="text-muted-foreground">·</span>
        <span className="text-xs text-muted-foreground">
          المطلوب الآن <span dir="ltr">{formatMoney(order.amountDue, order.currency)}</span>
        </span>
      </div>
      <Link
        href={`/admin/orders/${order.id}`}
        className="mt-1 inline-flex items-center gap-1 text-xs text-primary hover:underline"
      >
        فتح التفاصيل
        <ArrowLeft className="size-3" />
      </Link>
    </Card>
  );
}

export default async function OrdersPage({ searchParams }: PageProps<"/admin/orders">) {
  const params = await searchParams;
  const wired = hasSupabaseEnv();

  const rawTab = typeof params.status === "string" ? params.status : "all";
  const tab = TABS.find((t) => t.key === rawTab) ?? TABS[0];
  const query = cleanQuery(params.q);

  const { orders, counts, ready, pulse } = await loadOrders(tab.status, query);
  const saved = params.saved === "1";
  const error = typeof params.error === "string" ? params.error : null;

  const tabHref = (key: string, keepQuery = true) => {
    const qs = new URLSearchParams();
    if (key !== "all") qs.set("status", key);
    if (keepQuery && query) qs.set("q", query);
    const s = qs.toString();
    return s ? `/admin/orders?${s}` : "/admin/orders";
  };

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="font-heading text-lg font-bold">الطلبات</h2>
        <HelpTip>
          طابور تشغيل الحجوزات: كل حجز يصل من الموقع يظهر هنا بحالته الحالية. ابدأ يومك من
          تبويب «قيد المراجعة» — هذه الحجوزات رفع أصحابها إيصالات تحويل تنتظر اعتمادك.
        </HelpTip>
        {/*
          ⚠ **بلا فترة عمداً، ولا يتبع صندوق البحث** — والسببان مختلفان:

          الفترة: هذه الشاشة **لا تملك منتقي فترة أصلاً** (بعكس شاشات المالية).
          فاختراع فترة هنا يخلق مصدراً ثانياً للفترة لا يراه المالك على شاشته،
          والملف يخرج بمدى لم يطلبه أحد. وغيابها يعني «كامل السجل» ويكتبها الملف
          في ذيله بهذا النصّ حرفياً.

          والبحث: شرطه يطابق `customer_phone` و`customer_whatsapp` — العمودين
          اللذين يمنع عقد التصدير خروجهما — وترشيحُ ملفٍ بعمود ممنوع يجعل الملف
          يشهد بوجود صاحب رقم بعينه ولو لم يطبعه. والفرق مكتوب في التلميح لأن
          ملفاً يخالف الشاشة بصمت أسوأ من ملف لا يوجد.
        */}
        {/* ولا يظهر قبل أن يُقرأ الجدول: رابطٌ يقود إلى خطأ JSON يبدو ميزةً معطوبة */}
        {ready && (
          <div className="ms-auto">
            <ExportLink
              target={{ kind: "bookings", status: tab.status }}
              label="تصدير الحجوزات (CSV)"
              help={
                <>
                  ملف جدولي بحجوزات تبويب «{tab.label}» — بلا فترة لأن هذه الشاشة لا تملك
                  منتقي فترة، وبلا حدٍّ بالمئة المعروضة (سقفه معلَن في آخر سطر منه).
                  <span className="font-semibold"> ولا يتبع صندوق البحث</span>: شرطه يطابق
                  هاتف العميل، والهاتف ورابط المتابعة لا يخرجان في أي تصدير. والملف يحمل
                  تكلفة المتعهد وهامشنا — للمالك وحده، ولا يُرسَل إلى متعهد.
                </>
              }
            />
          </div>
        )}
      </div>

      <Banners
        wired={wired}
        readOnly={!ready}
        saved={saved}
        error={error}
        errorMessages={COMMON_BOOKING_ERRORS}
        savedMessage="حُدِّثت حالة الطلب."
        readOnlyTitle="قائمة الطلبات غير جاهزة بعد"
        readOnlyBody={
          <p>
            قاعدة البيانات مربوطة لكن جدول <code dir="ltr">bookings</code> غير موجود — نفِّذ هجرة
            المرحلة ٤ من <code dir="ltr">supabase/migrations</code> ثم أعد تحميل الصفحة.
          </p>
        }
      />

      <PagePulse data={pulse} />

      {/* التبويبات وبطاقات الأعداد شيء واحد: كل بطاقة تعرض عدد حالتها من Postgres وتُرشِّح عند الضغط */}
      <nav
        aria-label="ترشيح الطلبات بالحالة"
        className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-7"
      >
        {TABS.map((item) => {
          const active = item.key === tab.key;
          const count = counts[item.key];
          return (
            <Link
              key={item.key}
              href={tabHref(item.key)}
              aria-current={active ? "page" : undefined}
              title={item.status ? STATUS_HINTS[item.status] : "كل الطلبات بلا ترشيح بالحالة"}
              className={cn(
                "rounded-xl bg-card p-3 text-center ring-1 transition-colors",
                active
                  ? "bg-primary/10 ring-2 ring-primary"
                  : "ring-foreground/10 hover:bg-muted"
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

      {/* البحث نموذج GET حتى يبقى الرابط قابلاً للمشاركة وتُحفظ نتيجته في المفضلة */}
      <form action="/admin/orders" method="get">
        <Card className="flex flex-row flex-wrap items-end gap-3 p-4">
          {tab.key !== "all" && <input type="hidden" name="status" value={tab.key} />}
          <div className="min-w-52 flex-1 space-y-1.5">
            <label
              htmlFor="orders-q"
              className="flex items-center gap-1.5 text-sm font-medium leading-none"
            >
              بحث
              <HelpTip>
                ابحث بالرقم المرجعي للحجز (مثال TR-8F3K2Q) أو برقم موبايل العميل أو واتسابه —
                جزء من الرقم يكفي. الأرقام العربية مقبولة وتُحوَّل تلقائياً.
              </HelpTip>
            </label>
            <Input
              id="orders-q"
              name="q"
              defaultValue={query}
              placeholder="رقم مرجعي أو رقم موبايل"
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

      {ready && orders.length === 0 && (
        <Card className="p-5 text-sm text-muted-foreground">
          {query
            ? "لا توجد طلبات مطابقة لبحثك — جرّب رقماً مرجعياً كاملاً أو رقم موبايل آخر."
            : tab.status
              ? `لا توجد طلبات في حالة «${tab.label}» حالياً.`
              : "لا توجد طلبات بعد — أول حجز يصل من الموقع العام سيظهر هنا فوراً."}
        </Card>
      )}

      {orders.length > 0 && (
        <>
          {/* شاشات كبيرة: جدول كامل */}
          <Card className="hidden p-0 md:block">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[52rem] text-sm">
                <thead>
                  <tr className="border-b border-border text-xs text-muted-foreground">
                    <th className="p-2 text-start font-medium">الرقم المرجعي</th>
                    <th className="p-2 text-start font-medium">العميل</th>
                    <th className="p-2 text-start font-medium">المسار</th>
                    <th className="p-2 text-start font-medium">الفئة</th>
                    <th className="p-2 text-start font-medium">الإجمالي</th>
                    <th className="p-2 text-start font-medium">المطلوب الآن</th>
                    <th className="p-2 text-start font-medium">الحالة</th>
                    <th className="p-2 text-start font-medium" />
                  </tr>
                </thead>
                <tbody>
                  {orders.map((order) => (
                    <OrderTableRow key={order.id} order={order} />
                  ))}
                </tbody>
              </table>
            </div>
          </Card>

          {/* الموبايل: بطاقات */}
          <div className="space-y-3 md:hidden">
            {orders.map((order) => (
              <OrderCard key={order.id} order={order} />
            ))}
          </div>

          <p className="text-xs text-muted-foreground">
            المعروض {toArabicDigits(orders.length)} من الطلبات
            {orders.length === MAX_ROWS
              ? ` (أحدث ${toArabicDigits(MAX_ROWS)} — ضيّق البحث للوصول للأقدم)`
              : ""}
            . «المطلوب الآن» هو ما طُلب من العميل تحويله بحسب خطة الدفع (
            {PLAN_LABELS.full} أو {PLAN_LABELS.deposit})، والباقي يُحصَّل مع السائق.
          </p>
        </>
      )}
    </div>
  );
}
