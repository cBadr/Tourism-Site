import Link from "next/link";
import { MessageCircle, MessageSquareQuote, Phone } from "lucide-react";

import { toArabicDigits } from "@/components/booking/format";
import { HelpTip } from "@/components/shared/HelpTip";
import { PagePulse } from "@/components/stats/page-pulse";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import type { QuoteRequestRow } from "@/lib/booking-types";
import { SERVICES } from "@/lib/site-config";
import { readPagePulse, type PagePulseData } from "@/lib/stats/pulse";
import { createServerSupabase } from "@/lib/supabase/server";
import { cn } from "@/lib/utils";
import {
  asText,
  Banners,
  COMMON_BOOKING_ERRORS,
  controlClass,
  dateTimeLabel,
  relativeTime,
} from "../orders/_components/booking-ui";
import { setQuoteStatus } from "./actions";

/**
 * طلبات الأسعار — نموذج «اطلب عرض سعر» للجولات والمناسبات وما هو خارج التسعير الفوري.
 * كل طلب يُتابَع بحالة بسيطة: جديد ← تم التواصل ← تحوّل لحجز / مغلق.
 * الترشيح والعدّ داخل Postgres (شرط + COUNT) لا في الواجهة.
 */

export const metadata = { title: "طلبات الأسعار" };

const hasSupabaseEnv = () =>
  Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);

type QuoteStatus = QuoteRequestRow["status"];

const STATUS_LABELS: Record<QuoteStatus, string> = {
  new: "جديد",
  contacted: "تم التواصل",
  converted: "تحوّل لحجز",
  closed: "مغلق",
};

const STATUS_TONE: Record<QuoteStatus, string> = {
  new: "border-amber-300 bg-amber-100 text-amber-900 dark:border-amber-700 dark:bg-amber-950 dark:text-amber-100",
  contacted:
    "border-sky-300 bg-sky-100 text-sky-900 dark:border-sky-700 dark:bg-sky-950 dark:text-sky-100",
  converted:
    "border-emerald-300 bg-emerald-100 text-emerald-900 dark:border-emerald-700 dark:bg-emerald-950 dark:text-emerald-100",
  closed:
    "border-border bg-muted text-muted-foreground dark:border-border dark:bg-muted dark:text-muted-foreground",
};

const TABS: { key: string; label: string; status: QuoteStatus | null }[] = [
  { key: "all", label: "الكل", status: null },
  { key: "new", label: STATUS_LABELS.new, status: "new" },
  { key: "contacted", label: STATUS_LABELS.contacted, status: "contacted" },
  { key: "converted", label: STATUS_LABELS.converted, status: "converted" },
  { key: "closed", label: STATUS_LABELS.closed, status: "closed" },
];

const MAX_ROWS = 200;

/** أسماء الخدمات للعرض — الطلب يحمل slug الخدمة التي جاء منها */
const SERVICE_TITLES = new Map(SERVICES.map((s) => [s.slug, s.title]));

type QuoteRow = {
  id: string;
  reference: string;
  serviceSlug: string | null;
  customerName: string | null;
  customerPhone: string | null;
  details: string | null;
  status: QuoteStatus | null;
  createdAt: string | null;
};

const isStatus = (v: unknown): v is QuoteStatus =>
  v === "new" || v === "contacted" || v === "converted" || v === "closed";

async function loadRequests(status: QuoteStatus | null): Promise<{
  requests: QuoteRow[];
  counts: Record<string, number | null>;
  ready: boolean;
  pulse: PagePulseData | null;
}> {
  const blank = { requests: [] as QuoteRow[], counts: {}, ready: false, pulse: null };

  const supabase = await createServerSupabase();
  if (!supabase) return blank;

  // العدّ داخل Postgres عبر COUNT — لا عدّ لمصفوفات في الواجهة
  const countOf = async (tabStatus: QuoteStatus | null) => {
    let q = supabase.from("quote_requests").select("id", { count: "exact", head: true });
    if (tabStatus) q = q.eq("status", tabStatus);
    const { count, error } = await q;
    return error ? null : (count ?? 0);
  };

  let listQuery = supabase
    .from("quote_requests")
    .select("id, reference, service_slug, customer_name, customer_phone, details, status, created_at")
    .order("created_at", { ascending: false })
    .limit(MAX_ROWS);
  if (status) listQuery = listQuery.eq("status", status);

  // نبض الشاشة يُقرأ مع الجدول والأعداد في نفس الجولة — لا انتظار متتابعاً
  const [listRes, countsRes, pulse] = await Promise.all([
    listQuery,
    Promise.all(TABS.map((tab) => countOf(tab.status))),
    readPagePulse(supabase, "/admin/quote-requests"),
  ]);

  if (listRes.error) return blank;

  const counts: Record<string, number | null> = {};
  TABS.forEach((tab, i) => {
    counts[tab.key] = countsRes[i] ?? null;
  });

  const requests = ((listRes.data ?? []) as Record<string, unknown>[]).map((row) => ({
    id: String(row.id),
    reference: asText(row.reference) ?? "—",
    serviceSlug: asText(row.service_slug),
    customerName: asText(row.customer_name),
    customerPhone: asText(row.customer_phone),
    details: asText(row.details),
    status: isStatus(row.status) ? row.status : null,
    createdAt: asText(row.created_at),
  }));

  return { requests, counts, ready: true, pulse };
}

const ERROR_MESSAGES: Record<string, string> = {
  ...COMMON_BOOKING_ERRORS,
  status: "حالة غير معروفة — اختر واحدة من حالات المتابعة الأربع.",
};

function ContactLinks({ phone }: { phone: string | null }) {
  if (!phone) return <span className="text-xs text-muted-foreground">بلا رقم</span>;
  const digits = phone.replace(/[^\d+]/g, "");
  return (
    <span className="flex flex-wrap items-center gap-2">
      <a
        href={`tel:${digits}`}
        className="inline-flex items-center gap-1 rounded-lg border border-border px-2 py-1 text-xs transition-colors hover:border-primary hover:text-primary"
      >
        <Phone className="size-3.5" />
        <span dir="ltr">{phone}</span>
      </a>
      <a
        href={`https://wa.me/${digits.replace(/^\+/, "")}`}
        target="_blank"
        rel="noopener noreferrer"
        className="inline-flex items-center gap-1 rounded-lg border border-emerald-300 px-2 py-1 text-xs text-emerald-800 transition-colors hover:bg-emerald-50 dark:border-emerald-700 dark:text-emerald-200 dark:hover:bg-emerald-950"
      >
        <MessageCircle className="size-3.5" />
        واتساب
      </a>
    </span>
  );
}

function RequestCard({
  request,
  tabKey,
  readOnly,
}: {
  request: QuoteRow;
  tabKey: string;
  readOnly: boolean;
}) {
  return (
    <Card className="space-y-3 p-5">
      <div className="flex flex-wrap items-center gap-2">
        <span dir="ltr" className="font-medium">
          {request.reference}
        </span>
        {request.status && (
          <Badge variant="outline" className={STATUS_TONE[request.status]}>
            {STATUS_LABELS[request.status]}
          </Badge>
        )}
        {request.serviceSlug && (
          <Badge variant="secondary">
            {SERVICE_TITLES.get(request.serviceSlug) ?? request.serviceSlug}
          </Badge>
        )}
        <span className="ms-auto text-xs text-muted-foreground">
          {relativeTime(request.createdAt)} · {dateTimeLabel(request.createdAt)}
        </span>
      </div>

      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <span className="font-medium">{request.customerName ?? "—"}</span>
        <ContactLinks phone={request.customerPhone} />
      </div>

      {request.details && (
        <p className="rounded-lg bg-muted/40 p-3 text-sm leading-relaxed whitespace-pre-line">
          {request.details}
        </p>
      )}

      <form
        action={readOnly ? undefined : setQuoteStatus.bind(null, request.id)}
        className="flex flex-wrap items-end gap-2"
      >
        <input type="hidden" name="tab" value={tabKey === "all" ? "" : tabKey} />
        <div className="min-w-40 flex-1 space-y-1.5">
          <label
            htmlFor={`status-${request.id}`}
            className="flex items-center gap-1.5 text-sm font-medium leading-none"
          >
            حالة المتابعة
            <HelpTip>
              «جديد» يعني لم يتواصل أحد بعد. حدّثها فور الاتصال بالعميل حتى لا يتصل به زميل
              مرة ثانية، و«تحوّل لحجز» عند إتمام الحجز فعلياً — منها يُقاس معدل التحويل لاحقاً.
            </HelpTip>
          </label>
          <select
            id={`status-${request.id}`}
            name="status"
            defaultValue={request.status ?? "new"}
            disabled={readOnly}
            className={cn(controlClass, "sm:w-56")}
          >
            {(Object.keys(STATUS_LABELS) as QuoteStatus[]).map((s) => (
              <option key={s} value={s}>
                {STATUS_LABELS[s]}
              </option>
            ))}
          </select>
        </div>
        <Button type="submit" variant="outline" disabled={readOnly}>
          تحديث الحالة
        </Button>
      </form>
    </Card>
  );
}

export default async function QuoteRequestsPage({
  searchParams,
}: PageProps<"/admin/quote-requests">) {
  const params = await searchParams;
  const rawTab = typeof params.status === "string" ? params.status : "all";
  const tab = TABS.find((t) => t.key === rawTab) ?? TABS[0];

  const { requests, counts, ready, pulse } = await loadRequests(tab.status);

  const wired = hasSupabaseEnv();
  const saved = params.saved === "1";
  const error = typeof params.error === "string" ? params.error : null;

  const tabHref = (key: string) =>
    key === "all" ? "/admin/quote-requests" : `/admin/quote-requests?status=${key}`;

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div className="flex flex-wrap items-center gap-2">
        <MessageSquareQuote className="size-5 text-primary" />
        <h2 className="font-heading text-lg font-bold">طلبات الأسعار</h2>
        <HelpTip>
          هذه طلبات لا يغطيها التسعير الفوري: جولات ومناسبات وأفواج وطلبات خاصة. العميل يترك
          تفاصيله ورقمه، وأنتم تتصلون به بعرض سعر مخصص. سرعة الرد هنا هي الفارق بينكم وبين
          المنافس.
        </HelpTip>
      </div>

      <Banners
        wired={wired}
        readOnly={!ready}
        saved={saved}
        error={error}
        errorMessages={ERROR_MESSAGES}
        savedMessage="حُدِّثت حالة الطلب."
        readOnlyTitle="طلبات الأسعار غير جاهزة بعد"
        readOnlyBody={
          <p>
            قاعدة البيانات مربوطة لكن جدول <code dir="ltr">quote_requests</code> غير موجود —
            نفِّذ هجرة المرحلة ٤ من <code dir="ltr">supabase/migrations</code> ثم أعد تحميل
            الصفحة.
          </p>
        }
      />

      <PagePulse data={pulse} />

      <nav
        aria-label="ترشيح طلبات الأسعار بالحالة"
        className="grid grid-cols-2 gap-2 sm:grid-cols-5"
      >
        {TABS.map((item) => {
          const active = item.key === tab.key;
          const count = counts[item.key];
          return (
            <Link
              key={item.key}
              href={tabHref(item.key)}
              aria-current={active ? "page" : undefined}
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

      {ready && requests.length === 0 && (
        <Card className="p-5 text-sm text-muted-foreground">
          {tab.status
            ? `لا توجد طلبات في حالة «${tab.label}» حالياً.`
            : "لا توجد طلبات أسعار بعد — أول طلب يصل من صفحة «اطلب عرض سعر» سيظهر هنا."}
        </Card>
      )}

      {requests.map((request) => (
        <RequestCard key={request.id} request={request} tabKey={tab.key} readOnly={!ready} />
      ))}

      {requests.length > 0 && (
        <p className="text-xs text-muted-foreground">
          المعروض {toArabicDigits(requests.length)} من الطلبات
          {requests.length === MAX_ROWS ? ` (أحدث ${toArabicDigits(MAX_ROWS)})` : ""}.
        </p>
      )}
    </div>
  );
}
