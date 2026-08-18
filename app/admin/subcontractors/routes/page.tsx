import Link from "next/link";
import { ClipboardCheck, MapPin } from "lucide-react";

import { toArabicDigits } from "@/components/booking/format";
import { HelpTip } from "@/components/shared/HelpTip";
import { Card } from "@/components/ui/card";
import { createServerSupabase } from "@/lib/supabase/server";
import { cn } from "@/lib/utils";
import { Banners } from "../../orders/_components/booking-ui";
import {
  EMPTY_PRICING_CONTEXT,
  loadPricingContext,
  type PricingContext,
} from "../_components/pricing-context";
import {
  loadRouteItems,
  ROUTES_PAGE_SIZE,
  RouteDetailCard,
  RoutesCount,
  RouteSearchForm,
  RoutesTable,
  searchRoutes,
  type RouteHit,
} from "../_components/routes-search";
import { SUBCONTRACTOR_ERRORS, type PriceItemView } from "../_components/subcontractor-ui";

/**
 * بحثُ المسارات عبر **كل** المتعهدين — الشقُّ الأول من شكوى المالك (٢):
 * «لا توجد خيارات بحث في المسارات سواءً في كل المتعهدين أو لمتعهد معين».
 *
 * ══════════════════════════════════════════════════════════════════════════
 *  لماذا شاشةٌ مستقلة ولا تُحشر في قائمة المتعهدين
 * ══════════════════════════════════════════════════════════════════════════
 *
 * السؤالان مختلفا الوحدة: قائمةُ المتعهدين تجيب «مَن شركائي؟» بصفٍّ لكل **شريك**،
 * وهذه تجيب «مَن يغطّي هذا المسار؟» بصفٍّ لكل **مسار**. وحشرُهما في شاشةٍ واحدة
 * يُنتج جدولاً لا يُقرأ على أيٍّ من السؤالين — وهو بعينه ما شكا منه المالك.
 *
 * ولا ترشيحَ ولا عدَّ في هذا الملف: `admin_search_routes` (0118) تفعل التطبيع
 * العربي والمطابقة والاقتطاع و`total_count` كلها في Postgres، ثم تُرجع صفوفاً
 * جاهزة. وشاشةُ ملف المتعهد تنادي **الدالة نفسها** بمعرّفه — فلا تنحرف نتيجةٌ
 * عن نتيجة.
 *
 * ⚠ **ولا قرارَ اعتمادٍ هنا بقصد** — التفصيل في ترويسة `RouteDetailCard`:
 *   الاعتماد بعد `0109` يقع على دفعةٍ كاملة، لا على صفٍّ خرج من بحثٍ مرشَّح.
 */

export const metadata = { title: "بحث المسارات" };

const hasSupabaseEnv = () =>
  Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);

const STATUS_TABS: { key: string; label: string; status: string | null }[] = [
  { key: "all", label: "كل الحالات", status: null },
  { key: "approved", label: "معتمدة", status: "approved" },
  { key: "pending", label: "بانتظار المراجعة", status: "pending" },
  { key: "draft", label: "مسودّات المتعهدين", status: "draft" },
  { key: "rejected", label: "مرفوضة", status: "rejected" },
];

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** نصُّ البحث كما وصل — التطبيع كلُّه في Postgres، وهذا تقليمُ طولٍ لا تنقية */
const cleanQuery = (raw: unknown): string =>
  typeof raw === "string" ? raw.replace(/\s+/g, " ").trim().slice(0, 80) : "";

type Loaded = {
  rows: RouteHit[];
  total: number;
  ready: boolean;
  pricing: PricingContext;
  detail: { hit: RouteHit; items: PriceItemView[] } | null;
};

async function load(
  query: string,
  status: string | null,
  offset: number,
  routeId: string | null
): Promise<Loaded> {
  const blank: Loaded = {
    rows: [],
    total: 0,
    ready: false,
    pricing: EMPTY_PRICING_CONTEXT,
    detail: null,
  };

  const supabase = await createServerSupabase();
  if (!supabase) return blank;

  const [result, pricing] = await Promise.all([
    searchRoutes(supabase, { query, status, limit: ROUTES_PAGE_SIZE, offset }),
    loadPricingContext(supabase),
  ]);

  // التفصيل يُقرأ لمسارٍ واحدٍ فقط، وبعد أن يطلبه المشرف صراحةً
  let detail: Loaded["detail"] = null;
  if (routeId) {
    const hit = result.rows.find((r) => r.id === routeId) ?? null;
    if (hit) {
      const { items } = await loadRouteItems(supabase, routeId);
      detail = { hit, items };
    }
  }

  return { rows: result.rows, total: result.total, ready: result.ready, pricing, detail };
}

export default async function RoutesSearchPage({
  searchParams,
}: PageProps<"/admin/subcontractors/routes">) {
  const params = await searchParams;
  const wired = hasSupabaseEnv();

  const query = cleanQuery(params.q);
  const rawTab = typeof params.status === "string" ? params.status : "all";
  const tab = STATUS_TABS.find((t) => t.key === rawTab) ?? STATUS_TABS[0];
  const rawOffset = Number(typeof params.offset === "string" ? params.offset : 0);
  const offset = Number.isFinite(rawOffset) && rawOffset > 0 ? Math.trunc(rawOffset) : 0;
  const routeId = typeof params.route === "string" && UUID.test(params.route) ? params.route : null;

  const { rows, total, ready, pricing, detail } = await load(query, tab.status, offset, routeId);

  const href = (patch: Record<string, string | null>) => {
    const qs = new URLSearchParams();
    const merged: Record<string, string | null> = {
      q: query || null,
      status: tab.key === "all" ? null : tab.key,
      offset: offset > 0 ? String(offset) : null,
      route: routeId,
      ...patch,
    };
    for (const [key, value] of Object.entries(merged)) if (value) qs.set(key, value);
    const s = qs.toString();
    return s ? `/admin/subcontractors/routes?${s}` : "/admin/subcontractors/routes";
  };

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="flex items-center gap-1.5 font-heading text-lg font-bold">
          <MapPin className="size-5 text-primary" />
          بحث المسارات
        </h2>
        <HelpTip>
          كل مسارات كل المتعهدين في مكانٍ واحد، بحثاً وترشيحاً بالحالة. المسار المعتمد
          لمتعهدٍ معتمد هو وحده الذي يدخل التسعير — وما عداه معروضٌ هنا لتعرف أين
          الفجوة.
        </HelpTip>
        <Link
          href="/admin/subcontractors/reviews"
          className="ms-auto inline-flex items-center gap-1.5 text-sm text-primary transition-colors hover:underline"
        >
          <ClipboardCheck className="size-4" />
          مراجعة الأسعار
        </Link>
        <Link
          href="/admin/subcontractors"
          className="text-sm text-muted-foreground transition-colors hover:text-primary hover:underline"
        >
          المتعهدون
        </Link>
      </div>

      <Banners
        wired={wired}
        readOnly={!ready}
        saved={false}
        error={null}
        errorMessages={SUBCONTRACTOR_ERRORS}
        readOnlyTitle="بحث المسارات غير جاهز بعد"
        readOnlyBody={
          <p>
            الدالة <code dir="ltr">admin_search_routes</code> غير موجودة — نفِّذ هجرة{" "}
            <code dir="ltr">0118</code> من <code dir="ltr">supabase/migrations</code> ثم أعد
            تحميل الصفحة. وقائمة المتعهدين وطابور المراجعة يعملان طبيعياً حتى ذلك الحين.
          </p>
        }
      />

      <RouteSearchForm
        action="/admin/subcontractors/routes"
        query={query}
        hidden={tab.key === "all" ? {} : { status: tab.key }}
        clearHref={href({ q: null, offset: null, route: null })}
        disabled={!ready}
        label="بحث في مسارات كل المتعهدين"
      />

      <nav aria-label="ترشيح المسارات بالحالة" className="flex flex-wrap gap-2">
        {STATUS_TABS.map((item) => (
          <Link
            key={item.key}
            href={href({
              status: item.key === "all" ? null : item.key,
              offset: null,
              route: null,
            })}
            aria-current={item.key === tab.key ? "page" : undefined}
            className={cn(
              "rounded-lg px-3 py-1.5 text-sm ring-1 transition-colors",
              item.key === tab.key
                ? "bg-primary/10 ring-2 ring-primary"
                : "bg-card ring-foreground/10 hover:bg-muted"
            )}
          >
            {item.label}
          </Link>
        ))}
      </nav>

      {ready && rows.length === 0 && (
        <Card className="p-5 text-sm text-muted-foreground">
          {query
            ? `لا مسار يطابق «${query}»${tab.status ? ` في حالة «${tab.label}»` : ""} — جرّب جزءاً من اسم المدينة أو اسم المتعهد.`
            : tab.status
              ? `لا مسار في حالة «${tab.label}» حالياً.`
              : "لا مسارات بعد — يضيفها المتعهدون من بواباتهم ثم تصل إلى طابور المراجعة."}
        </Card>
      )}

      {rows.length > 0 && (
        <>
          <RoutesTable
            rows={rows}
            currency={pricing.currency}
            showCompany
            detailHref={(hit) => `${href({ route: hit.id })}#route-detail`}
            activeId={routeId}
          />
          <RoutesCount shown={rows.length} total={total} query={query} />

          {(offset > 0 || total > offset + rows.length) && (
            <div className="flex flex-wrap items-center gap-3 text-sm">
              {offset > 0 && (
                <Link
                  href={href({
                    offset: String(Math.max(0, offset - ROUTES_PAGE_SIZE)),
                    route: null,
                  })}
                  className="text-primary hover:underline"
                >
                  الصفحة السابقة
                </Link>
              )}
              {total > offset + rows.length && (
                <Link
                  href={href({ offset: String(offset + ROUTES_PAGE_SIZE), route: null })}
                  className="text-primary hover:underline"
                >
                  الصفحة التالية
                </Link>
              )}
              <span className="text-xs text-muted-foreground">
                من {toArabicDigits(offset + 1)} إلى {toArabicDigits(offset + rows.length)}
              </span>
            </div>
          )}
        </>
      )}

      {detail && (
        <RouteDetailCard
          hit={detail.hit}
          items={detail.items}
          pricing={pricing}
          reviewHref="/admin/subcontractors/reviews"
        />
      )}
    </div>
  );
}
