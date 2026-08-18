import Link from "next/link";
import type { SupabaseClient } from "@supabase/supabase-js";
import { ArrowLeftRight, Search } from "lucide-react";

import { formatMoney, toArabicDigits } from "@/components/booking/format";
import { HelpTip } from "@/components/shared/HelpTip";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { asNumber, asText, pick } from "../../orders/_components/booking-ui";
import type { PricingContext } from "./pricing-context";
import {
  customerPrice,
  ListStatusBadge,
  readPriceItem,
  type PriceItemView,
} from "./subcontractor-ui";

/**
 * بحثُ المسارات وعرضُها المضغوط — لبنةٌ واحدة لشاشتين.
 *
 * ══════════════════════════════════════════════════════════════════════════
 *  🔴 الشكوى التي وُلدت منها، بنصّ المالك (2026-08-18)
 * ══════════════════════════════════════════════════════════════════════════
 *
 *   «قوائم الأسعار تُعرض بشكل كبير جداً مما يربك مدير الموقع»
 *   «لا توجد خيارات بحث في المسارات سواءً في كل المتعهدين أو لمتعهد معين»
 *
 * ══════════════════════════════════════════════════════════════════════════
 *  القرار: **صفٌّ يلخّص، وبطاقةٌ واحدة تفصّل عند الطلب**
 * ══════════════════════════════════════════════════════════════════════════
 *
 * ما كان: بطاقةٌ كاملة لكل مسار، وفيها **جدولُ أسعارٍ بأربعة أعمدة وسطرٍ لكل
 * فئة**، وبطاقتا نقطتين بإحداثياتهما، وأربع أيقونات إرشاد. مقبولٌ على أربعة
 * مسارات، و**مئةُ مسارٍ تعني مئةَ بطاقة** — وهي بالضبط الحال التي يستعدّ لها
 * المالك.
 *
 * ما صار: صفُّ جدولٍ واحد لكل مسار يحمل **خلاصة** الأسعار لا أسعارها
 * («٤ فئات · من ٧٢٠ إلى ١٬٥٠٠»)، والخلاصة **محسوبةٌ في Postgres**
 * (`admin_search_routes`) — فصفوفُ `price_list_items` **لا تصل الخادمَ أصلاً**.
 * أي أن الوفر في ثلاث طبقات لا في الشكل: استعلامٌ أخفّ، وحمولةٌ أصغر، وشجرةُ
 * DOM أقصر.
 *
 * ══════════════════════════════════════════════════════════════════════════
 *  ⚠ وما **لا** يُضغط، وهو الأهم
 * ══════════════════════════════════════════════════════════════════════════
 *
 * **ما ينتظر قراراً يبقى ببطاقته الكاملة وخارجَ هذا البحث تماماً.** والسبب ليس
 * ذوقاً: `0109` جعلت زرَّ اعتماد الكشف يُلغى إن اختلف المعروض عن `pending_count`
 * الآتي من `price_sheet_stats`، و`review_price_sheet` ترفض أي انحرافٍ في العدد.
 * فلو رشّح البحثُ بطاقاتِ القرار لصار المعروض جزءاً من الدفعة **بينما الاعتماد
 * يكتب على الدفعة كلها** — وهو العيب الذي أُغلق قبل يومٍ بثلاث طبقات.
 *
 * ⇒ **البحث يرشّح متصفَّحاً للقراءة، والقرار يبقى على دفعةٍ كاملة غير مرشَّحة.**
 */

export type RouteHit = {
  id: string;
  subcontractorId: string | null;
  companyName: string;
  companyStatus: string;
  sheetId: string | null;
  sheetTitle: string | null;
  title: string;
  originLabel: string;
  destLabel: string;
  bidirectional: boolean;
  status: string;
  /** عدد الفئات المُسعَّرة — محسوبٌ في Postgres، وصفرٌ يعني «لا تغطّي شيئاً» */
  classesPriced: number;
  minCost: number | null;
  maxCost: number | null;
  createdAt: string | null;
};

export type RouteSearchResult = {
  rows: RouteHit[];
  /** المطابق **كلُّه** قبل الاقتطاع — من نافذةٍ في Postgres لا من عدٍّ هنا */
  total: number;
  ready: boolean;
};

const EMPTY: RouteSearchResult = { rows: [], total: 0, ready: false };

/** سقفُ صفوف الصفحة الواحدة — والدالة تقصّه إلى ٢٠٠ مهما مُرِّر */
export const ROUTES_PAGE_SIZE = 40;

function readHit(row: Record<string, unknown>): RouteHit | null {
  const id = asText(row.id);
  if (!id) return null;
  return {
    id,
    subcontractorId: asText(pick(row, ["subcontractor_id", "subcontractorId"])),
    companyName: asText(pick(row, ["company_name", "companyName"])) ?? "—",
    companyStatus: asText(pick(row, ["company_status", "companyStatus"])) ?? "",
    sheetId: asText(pick(row, ["sheet_id", "sheetId"])),
    sheetTitle: asText(pick(row, ["sheet_title", "sheetTitle"])),
    title: asText(row.title) ?? "مسار بلا عنوان",
    originLabel: asText(pick(row, ["origin_label", "originLabel"])) ?? "—",
    destLabel: asText(pick(row, ["dest_label", "destLabel"])) ?? "—",
    bidirectional: row.bidirectional === true,
    status: asText(row.status) ?? "",
    classesPriced: asNumber(pick(row, ["classes_priced", "classesPriced"])) ?? 0,
    minCost: asNumber(pick(row, ["min_cost", "minCost"])),
    maxCost: asNumber(pick(row, ["max_cost", "maxCost"])),
    createdAt: asText(pick(row, ["created_at", "createdAt"])),
  };
}

/**
 * نداءُ البحث — **دالةٌ واحدة لشاشتين**: تمريرُ `subcontractorId` يحصرها في
 * متعهد، وتركُه فارغاً يجعلها شاملة. ولا ترشيحَ في TypeScript إطلاقاً: التطبيع
 * العربي والمطابقة والاقتطاع والعدّ كلها في `admin_search_routes` (0118).
 *
 * ⚠ `ready = false` تعني «تعذّر النداء» — غالباً هجرةٌ لم تُنفَّذ — لا «لا نتائج».
 */
export async function searchRoutes(
  supabase: SupabaseClient,
  options: {
    query?: string;
    subcontractorId?: string | null;
    status?: string | null;
    limit?: number;
    offset?: number;
  } = {}
): Promise<RouteSearchResult> {
  const res = await supabase.rpc("admin_search_routes", {
    p_query: options.query ?? "",
    p_subcontractor: options.subcontractorId ?? null,
    p_status: options.status ?? null,
    p_limit: options.limit ?? ROUTES_PAGE_SIZE,
    p_offset: options.offset ?? 0,
  });
  if (res.error) return EMPTY;

  const raw = (res.data ?? []) as Record<string, unknown>[];
  const rows = raw.map(readHit).filter((r): r is RouteHit => r !== null);
  // `total_count` نافذةٌ على المطابق كله؛ وبلا صفوفٍ لا وجود لها ⇒ صفر
  const total = raw.length > 0 ? (asNumber(pick(raw[0], ["total_count", "totalCount"])) ?? rows.length) : 0;
  return { rows, total, ready: true };
}

/** «٤ فئات · من ٧٢٠ إلى ١٬٥٠٠» — أو جملةٌ صريحة حين لا سعر */
function PriceSummary({ hit, currency }: { hit: RouteHit; currency: string }) {
  if (hit.classesPriced === 0) {
    return (
      <span className="text-amber-700 dark:text-amber-300">
        بلا سعر
        <HelpTip>
          مسارٌ بلا سعر فئةٍ واحدة لا يغطي أي رحلة مهما اعتُمد — تُسعَّر رحلاته
          بتعريفة الكيلومتر.
        </HelpTip>
      </span>
    );
  }
  const range =
    hit.minCost === null || hit.maxCost === null
      ? "—"
      : hit.minCost === hit.maxCost
        ? formatMoney(hit.minCost, currency)
        : `${toArabicDigits(hit.minCost)} – ${formatMoney(hit.maxCost, currency)}`;
  return (
    <span className="whitespace-nowrap">
      <span className="font-medium" dir="rtl">
        {toArabicDigits(hit.classesPriced)} فئة
      </span>
      <span className="text-muted-foreground"> · </span>
      <span dir="ltr">{range}</span>
    </span>
  );
}

/**
 * نموذج البحث — `GET` كي يبقى الرابط قابلاً للمشاركة (نفس اتفاقية بقية اللوحة).
 *
 * `hidden` تحمل ما يجب ألا يضيع عند البحث (التبويب، المتعهد المفتوح)، و«مسح
 * البحث» رابطٌ لا زر: لا حالةَ عميلٍ في هذه الشاشة إطلاقاً.
 */
export function RouteSearchForm({
  action,
  query,
  hidden = {},
  clearHref,
  disabled = false,
  label = "بحث في المسارات",
}: {
  action: string;
  query: string;
  hidden?: Record<string, string>;
  clearHref: string;
  disabled?: boolean;
  label?: string;
}) {
  return (
    <form action={action} method="get">
      <Card className="flex flex-row flex-wrap items-end gap-3 p-4">
        {Object.entries(hidden).map(([name, value]) => (
          <input key={name} type="hidden" name={name} value={value} />
        ))}
        <div className="min-w-52 flex-1 space-y-1.5">
          <label
            htmlFor="routes-q"
            className="flex items-center gap-1.5 text-sm font-medium leading-none"
          >
            {label}
            <HelpTip>
              ابحث باسم المسار أو بنقطة البداية أو النهاية أو باسم المتعهد — جزءٌ من
              الاسم يكفي.{" "}
              <span className="font-semibold">
                الهمزات والتاء المربوطة والتشكيل كلها سواء
              </span>
              : «الاسكندريه» تجد «الإسكندرية»، و«انستاباي» تجد «انستا باي». والأرقام
              العربية مقبولة.
            </HelpTip>
          </label>
          <Input
            id="routes-q"
            name="q"
            defaultValue={query}
            placeholder="مثال: الاسكندريه · مطار · اسم المتعهد"
            disabled={disabled}
          />
        </div>
        <Button type="submit" disabled={disabled}>
          <Search />
          بحث
        </Button>
        {query && (
          <Link
            href={clearHref}
            className="pb-1.5 text-sm text-muted-foreground transition-colors hover:text-primary hover:underline"
          >
            مسح البحث
          </Link>
        )}
      </Card>
    </form>
  );
}

/**
 * جدولُ المسارات المضغوط — صفٌّ لكل مسار، وبطاقةٌ لكل مسار على الموبايل.
 *
 * `detailHref` يبني رابط «تفصيل»: الشاشة تفتح **بطاقةً واحدة** أسفل الجدول بدل
 * أن ترسم مئةً سلفاً. وحين لا يُمرَّر، يظهر الصف بلا رابطٍ (شاشةٌ للاطلاع فقط).
 */
export function RoutesTable({
  rows,
  currency,
  showCompany = false,
  detailHref,
  activeId = null,
}: {
  rows: RouteHit[];
  currency: string;
  showCompany?: boolean;
  detailHref?: (hit: RouteHit) => string;
  activeId?: string | null;
}) {
  return (
    <>
      <Card className="hidden p-0 md:block">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[42rem] text-sm">
            <thead>
              <tr className="border-b border-border text-xs text-muted-foreground">
                <th className="p-2 text-start font-medium">المسار</th>
                {showCompany && <th className="p-2 text-start font-medium">المتعهد</th>}
                <th className="p-2 text-start font-medium">من ← إلى</th>
                <th className="p-2 text-start font-medium">
                  <span className="inline-flex items-center gap-1.5">
                    الأسعار
                    <HelpTip>
                      عددُ الفئات المُسعَّرة في هذا المسار ومدى تكلفتها للمتعهد.
                      الخلاصة محسوبةٌ في قاعدة البيانات — وتفصيلُ كل فئة وسعرِ
                      العميل المقابل له يظهر بالضغط على «تفصيل».
                    </HelpTip>
                  </span>
                </th>
                <th className="p-2 text-start font-medium">الحالة</th>
                {detailHref && <th className="p-2 text-start font-medium" />}
              </tr>
            </thead>
            <tbody>
              {rows.map((hit) => (
                <tr
                  key={hit.id}
                  className={
                    hit.id === activeId
                      ? "border-b border-border bg-primary/10 last:border-0"
                      : "border-b border-border last:border-0 hover:bg-muted/40"
                  }
                >
                  <td className="p-2 align-top">
                    <span className="font-medium">{hit.title}</span>
                    {hit.bidirectional && (
                      <ArrowLeftRight
                        className="ms-1.5 inline size-3 text-muted-foreground"
                        aria-label="ثنائية الاتجاه"
                      />
                    )}
                    {hit.sheetTitle && (
                      <span className="mt-0.5 block text-xs text-muted-foreground">
                        كشف: {hit.sheetTitle}
                      </span>
                    )}
                  </td>
                  {showCompany && (
                    <td className="p-2 align-top text-xs">
                      {hit.subcontractorId ? (
                        <Link
                          href={`/admin/subcontractors/${hit.subcontractorId}`}
                          className="transition-colors hover:text-primary hover:underline"
                        >
                          {hit.companyName}
                        </Link>
                      ) : (
                        hit.companyName
                      )}
                      {hit.companyStatus !== "approved" && (
                        <Badge variant="outline" className="ms-1.5 text-[10px]">
                          غير معتمد
                        </Badge>
                      )}
                    </td>
                  )}
                  <td className="p-2 align-top text-xs">
                    {hit.originLabel}
                    <span className="text-muted-foreground"> ← </span>
                    {hit.destLabel}
                  </td>
                  <td className="p-2 align-top text-xs">
                    <PriceSummary hit={hit} currency={currency} />
                  </td>
                  <td className="p-2 align-top">
                    <ListStatusBadge status={hit.status} />
                  </td>
                  {detailHref && (
                    <td className="p-2 align-top">
                      <Link
                        href={detailHref(hit)}
                        className="text-xs text-primary hover:underline"
                      >
                        {hit.id === activeId ? "معروض" : "تفصيل"}
                      </Link>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      <div className="space-y-2 md:hidden">
        {rows.map((hit) => (
          <Card key={hit.id} className="gap-1 p-3">
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-medium">{hit.title}</span>
              <ListStatusBadge status={hit.status} />
            </div>
            <p className="text-xs text-muted-foreground">
              {hit.originLabel} ← {hit.destLabel}
            </p>
            <p className="text-xs">
              <PriceSummary hit={hit} currency={currency} />
            </p>
            {showCompany && hit.subcontractorId && (
              <Link
                href={`/admin/subcontractors/${hit.subcontractorId}`}
                className="text-xs text-primary hover:underline"
              >
                {hit.companyName}
              </Link>
            )}
            {detailHref && (
              <Link href={detailHref(hit)} className="text-xs text-primary hover:underline">
                {hit.id === activeId ? "معروض أدناه" : "تفصيل الأسعار"}
              </Link>
            )}
          </Card>
        ))}
      </div>
    </>
  );
}

/**
 * أسعارُ مسارٍ واحد — تُقرأ **عند الطلب** لا مع كل الجدول.
 *
 * هذا هو نصفُ العلاج الآخر: الجدول لا يحمل صفَّ سعرٍ واحداً، وهذه القراءة تقع
 * لمسارٍ واحدٍ اختاره المشرف بنفسه. فمئةُ مسارٍ = مئةُ صف + جدولُ أسعارٍ واحد،
 * لا مئةُ جدول.
 */
export async function loadRouteItems(
  supabase: SupabaseClient,
  routeId: string
): Promise<{ items: PriceItemView[]; ready: boolean }> {
  const res = await supabase
    .from("price_list_items")
    .select("*")
    .eq("price_list_id", routeId);
  if (res.error) return { items: [], ready: false };
  const items = ((res.data ?? []) as Record<string, unknown>[])
    .map(readPriceItem)
    .filter((i): i is PriceItemView => i !== null);
  return { items, ready: true };
}

/**
 * بطاقةُ تفصيل مسارٍ واحد — **بلا زرِّ قرار بقصد**.
 *
 * 🔴 والسبب بنيويّ لا تجميلي: قرارُ الاعتماد بعد `0109` يقع على **دفعةٍ كاملة**
 * (`review_price_sheet` مع `p_expected`)، وأيُّ زرٍّ يظهر بجوار صفٍّ خرج من بحثٍ
 * مرشَّح يفتح بابَ اعتمادٍ لا يطابق ما عُرض. فمن أراد أن يقرّر فمن طابور
 * المراجعة أو من ملف المتعهد، حيث تُعرض الدفعة كاملةً غير مرشَّحة.
 * والرابط إلى هناك مكتوبٌ في البطاقة نفسها كي لا يبحث عنه أحد.
 */
export function RouteDetailCard({
  hit,
  items,
  pricing,
  reviewHref,
}: {
  hit: RouteHit;
  items: PriceItemView[];
  pricing: PricingContext;
  reviewHref: string | null;
}) {
  const priced = items
    .map((item) => ({ item, info: pricing.byClass.get(item.classSlug) ?? null }))
    .sort((a, b) => (a.info?.sort ?? 999) - (b.info?.sort ?? 999));

  return (
    <Card className="space-y-3 p-5" id="route-detail">
      <div className="flex flex-wrap items-center gap-2">
        <h3 className="font-heading text-base font-bold">{hit.title}</h3>
        <ListStatusBadge status={hit.status} />
        {hit.bidirectional && (
          <Badge variant="secondary" className="gap-1">
            <ArrowLeftRight className="size-3" />
            ثنائية الاتجاه
          </Badge>
        )}
        {hit.subcontractorId && (
          <Link
            href={`/admin/subcontractors/${hit.subcontractorId}`}
            className="ms-auto text-xs text-primary hover:underline"
          >
            ملف {hit.companyName}
          </Link>
        )}
      </div>

      <p className="text-sm text-muted-foreground">
        {hit.originLabel} <span aria-hidden="true">←</span> {hit.destLabel}
        {hit.sheetTitle ? ` · كشف: ${hit.sheetTitle}` : ""}
      </p>

      {priced.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          لا توجد أسعار فئات في هذا المسار — لا يغطي أي رحلة حتى يضيف المتعهد سعراً
          واحداً على الأقل.
        </p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[28rem] text-sm">
            <thead>
              <tr className="border-b border-border text-xs text-muted-foreground">
                <th className="p-2 text-start font-medium">الفئة</th>
                <th className="p-2 text-start font-medium">تكلفة المتعهد</th>
                <th className="p-2 text-start font-medium">
                  <span className="inline-flex items-center gap-1.5">
                    سعر العميل
                    <HelpTip>
                      السعر الذي سيراه العميل للاتجاه الواحد إن كان هذا المتعهد أرخص
                      تغطيةً للمسار، بالهامش الحالي وأرضية سعر الفئة. الرقم الملزم
                      يحسبه <code dir="ltr">quote_price</code> لحظة التسعير.
                    </HelpTip>
                  </span>
                </th>
              </tr>
            </thead>
            <tbody>
              {priced.map(({ item, info }) => {
                const preview =
                  item.cost === null
                    ? null
                    : customerPrice(item.cost, pricing.margin, info?.minPrice ?? null);
                return (
                  <tr key={item.classSlug} className="border-b border-border last:border-0">
                    <td className="p-2 align-top">{info?.title ?? item.classSlug}</td>
                    <td className="p-2 align-top" dir="ltr">
                      {item.cost === null ? "—" : formatMoney(item.cost, pricing.currency)}
                    </td>
                    <td className="p-2 align-top font-bold" dir="ltr">
                      {preview === null ? "—" : formatMoney(preview.price, pricing.currency)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {hit.status === "pending" && reviewHref && (
        <p className="rounded-lg border border-sky-300 bg-sky-50 p-3 text-xs leading-5 text-sky-900 dark:border-sky-800 dark:bg-sky-950 dark:text-sky-100">
          هذا المسار ينتظر قرارك — <strong>ولا يُعتمد من هنا بقصد</strong>: الاعتماد يقع
          على الدفعة كاملةً كما أرسلها المتعهد، لا على صفٍّ خرج من بحثٍ مرشَّح. افتحه من{" "}
          <Link href={reviewHref} className="underline">
            طابور مراجعة الأسعار
          </Link>{" "}
          حيث تُعرض الدفعة كلها ثم تقرّر.
        </p>
      )}
    </Card>
  );
}

/** سطرُ الحصيلة — يقول ما لم يُعرَض بدل أن يتركه يُخمَّن */
export function RoutesCount({
  shown,
  total,
  query,
}: {
  shown: number;
  total: number;
  query: string;
}) {
  return (
    <p className="text-xs text-muted-foreground">
      المعروض {toArabicDigits(shown)} من {toArabicDigits(total)} مسار
      {query ? ` مطابق لـ«${query}»` : ""}
      {total > shown ? " — ضيّق البحث أو انتقل إلى الصفحة التالية." : "."}
    </p>
  );
}
