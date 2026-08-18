import Link from "next/link";
import type { SupabaseClient } from "@supabase/supabase-js";
import { ArrowLeftRight } from "lucide-react";

import { formatMoney, toArabicDigits } from "@/components/booking/format";
import { HelpTip } from "@/components/shared/HelpTip";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { asNumber, asText, pick } from "../../orders/_components/booking-ui";
import type { PricingContext } from "./pricing-context";
import {
  customerPrice,
  EditableCost,
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
  /**
   * 🔎 **نصُّ البحث الخام لهذا الصف** — وهو حرفياً ما تبنيه `admin_search_routes`
   * في `concat_ws(' ', pl.title, pl.origin_label, pl.dest_label, s.company_name,
   * sh.title)`: نفس الحقول، نفس الترتيب، والفارغُ يُسقَط كما يُسقطه `concat_ws`.
   *
   * يُكتب سمةً على الصف (`data-route-hay`) فيرشّح `RouteSearchForm` عليه في
   * المتصفح مع كل حرف بلا نداء. **ويُبنى من الصف الخام قبل قيم العرض
   * الافتراضية** («مسار بلا عنوان» · «—») — وإلا لطابق البحثُ كلمةً لا وجود لها
   * في القاعدة، فاختلفت مسطرةُ الكتابة عن مسطرة الزرّ.
   */
  hay: string;
};

export type RouteSearchResult = {
  rows: RouteHit[];
  /** المطابق **كلُّه** قبل الاقتطاع — من نافذةٍ في Postgres لا من عدٍّ هنا */
  total: number;
  ready: boolean;
};

const EMPTY: RouteSearchResult = { rows: [], total: 0, ready: false };

/**
 * سقفُ صفوف الصفحة الواحدة — و`admin_search_routes` تقصّه إلى ٢٠٠ مهما مُرِّر.
 *
 * ── لماذا صار ٢٠٠ بعد أن كان ٤٠ (2026-08-18) ──────────────────────────────
 *
 * الترشيح الحيّ في `RouteSearchForm` لا يقع محلياً إلا حين تكون **النافذة
 * المحمَّلة هي المجموعة كلَّها** — وإلا رشّح على نصفٍ فأخفى مسارات موجودة. وعدد
 * مسارات المالك اليوم **١٠٠** (مقيسٌ على القاعدة الحيّة)، فأربعون تعني ثلاث
 * صفحاتٍ وترشيحاً يسقط إلى نداءٍ خادميّ في كل واحدة منها.
 *
 * و٢٠٠ هو **سقف الدالة نفسها** لا رقمٌ مختار: لا فائدة من طلب أكثر مما تعطي.
 * والصفُّ هنا مضغوطٌ سلفاً (صفٌّ واحد لا بطاقة، والأسعارُ خلاصةٌ محسوبةٌ في
 * Postgres) — فمئتا صفٍّ جدولٌ طويل لا جدارٌ من الجداول.
 */
export const ROUTES_PAGE_SIZE = 200;

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
    // `concat_ws` نفسه: الترتيب ملزم، والقيمة غير النصّية تُسقَط لا تُستبدل
    hay: [
      row.title,
      pick(row, ["origin_label", "originLabel"]),
      pick(row, ["dest_label", "destLabel"]),
      pick(row, ["company_name", "companyName"]),
      pick(row, ["sheet_title", "sheetTitle"]),
    ]
      .filter((value): value is string => typeof value === "string")
      .join(" "),
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
 * نموذج البحث — **جزيرةُ عميلٍ ترشّح مع كل حرف**، وموضعُها `routes-live-filter.tsx`.
 *
 * ولم ينتقل ليصير عميلاً «لأن التفاعل أجمل»: شكوى المالك (2026-08-18) أن البحث
 * بزرٍّ لا يناسبه. والنموذج ما زال `GET` بحقوله المخفية وزرِّ إرساله كما كان —
 * فالضغط على «بحث» يثبّت البحث في العنوان (رابطٌ يُشارَك ويُحدَّث)، والكتابة
 * وحدها ترشّح المحمَّل بلا نداء. ويعمل بلا جافاسكربت كما كان بالضبط.
 *
 * 🔴 **وقواعدُ المطابقة هناك ميناءٌ حرفيّ لـ`admin_search_routes`** — مسطرةٌ
 * واحدة للكتابة وللزرّ. التفصيل والقياس في ترويسة ذلك الملف.
 *
 * ⚠ **وما يُصدَّر من وحدة `"use client"` لا يُقرأ في الخادم إلا مكوّناً**
 * (‏`handover/LESSONS.md` §٥): فلا تُسحب من هناك قيمةٌ ولا دالّة تطبيع إلى هذا
 * الملف الخادميّ — ولذلك تعبر السمات بينهما نصّاً في الـDOM لا استيراداً.
 */
export { RouteSearchForm } from "./routes-live-filter";

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
      {/*
        🔎 السمات `data-route-*` و`data-routes-table` **عقدٌ مع جزيرة البحث**
        (`routes-live-filter.tsx`): هي التي تقرأها لترشّح الصفوف في المتصفح مع
        كل حرف بلا نداء. وتغييرُ اسمٍ منها هنا يجب أن يتبعه هناك — وإن نُسي
        فالجزيرة **تسقط إلى النداء الخادميّ المخنوق** ولا تكسر بحثاً.
      */}
      <Card className="hidden p-0 md:block" data-routes-table="">
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
                  data-route-id={hit.id}
                  data-route-hay={hit.hay}
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

      <div className="space-y-2 md:hidden" data-routes-table="">
        {rows.map((hit) => (
          <Card key={hit.id} className="gap-1 p-3" data-route-id={hit.id} data-route-hay={hit.hay}>
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
 * بطاقةُ تفصيل مسارٍ واحد — **بلا زرِّ قرارٍ بقصد، ومعها تحريرُ الخانة بقصد**.
 *
 * 🔴 لا زرَّ اعتماد: قرارُ الاعتماد بعد `0109` يقع على **دفعةٍ كاملة**
 * (`review_price_sheet` مع `p_expected`)، وأيُّ زرٍّ يظهر بجوار صفٍّ خرج من بحثٍ
 * مرشَّح يفتح بابَ اعتمادٍ لا يطابق ما عُرض. فمن أراد أن يقرّر فمن طابور
 * المراجعة أو من ملف المتعهد، حيث تُعرض الدفعة كاملةً غير مرشَّحة.
 * والرابط إلى هناك مكتوبٌ في البطاقة نفسها كي لا يبحث عنه أحد.
 *
 * ✏️ **ونعم للتحرير في مكانه** (0135) — والفارقُ بينهما ليس ذوقاً:
 *   • **الاعتماد** يغيّر حالةَ **دفعة**، فسياقُه الدفعةُ كاملةً لا صفٌّ مرشَّح.
 *   • **تصحيحُ رقم** يغيّر **خانةً واحدة بعينها**، وسياقُه هو هذه الخانة نفسها.
 *     ولا شيء في تصحيحها يتّسع إلى غيرها، ولا يعتمد على ما عُرض حولها.
 * وهنا بالذات موضعُه الأنفع: هذه الشاشة هي التي يفتحها المدير حين يبحث عن مسارٍ
 * **معتمد** ليصحّح سعره — والقاعدة تكتب حينها سطرَ تدقيقٍ وتُشعر المتعهد.
 */
export function RouteDetailCard({
  hit,
  items,
  pricing,
  reviewHref,
  canEditCosts = false,
  returnTo,
}: {
  hit: RouteHit;
  items: PriceItemView[];
  pricing: PricingContext;
  reviewHref: string | null;
  /** تحرير الخانات في مكانها — تُطفئه شاشةٌ لم تُقرأ لها القاعدة */
  canEditCosts?: boolean;
  /** وجهةُ العودة بعد الحفظ — تحمل البحث والصفحة فلا يضيعان بعد كل تعديل */
  returnTo?: string;
}) {
  const editable = canEditCosts && typeof returnTo === "string" && returnTo !== "";

  const priced = items
    .map((item) => ({ item, info: pricing.byClass.get(item.classSlug) ?? null }))
    .sort((a, b) => (a.info?.sort ?? 999) - (b.info?.sort ?? 999));

  // الفئاتُ بلا سعر تظهر بخانةٍ فارغة حين يكون التحرير مفتوحاً — إضافةُ سعرٍ
  // بنقرةٍ في مكانها بدل جملةٍ تقول «ناقص» وتترك المدير يبحث عن بابها.
  const pricedSlugs = new Set(items.map((i) => i.classSlug));
  const rows = editable
    ? [
        ...priced,
        ...pricing.classes
          .filter((c) => c.active && !pricedSlugs.has(c.slug))
          .map((info) => ({
            item: { priceListId: hit.id, classSlug: info.slug, cost: null } as PriceItemView,
            info,
          })),
      ]
    : priced;

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

      {rows.length === 0 ? (
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
                <th className="p-2 text-start font-medium">
                  <span className="inline-flex items-center gap-1.5">
                    تكلفة المتعهد
                    {editable && (
                      <HelpTip>
                        اكتب في الخانة واضغط Enter أو زرّ القلم — يُحفظ فوراً. وعلى
                        مسارٍ معتمد يُكتب سطر تدقيق باسمك ويصل المتعهد إشعارٌ بالتعديل،
                        لأن الرقم حينها هو ما يُسعَّر به عميلٌ الآن.
                      </HelpTip>
                    )}
                  </span>
                </th>
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
              {rows.map(({ item, info }) => {
                const preview =
                  item.cost === null
                    ? null
                    : customerPrice(item.cost, pricing.margin, info?.minPrice ?? null);
                return (
                  <tr key={item.classSlug} className="border-b border-border last:border-0">
                    <td className="p-2 align-top">{info?.title ?? item.classSlug}</td>
                    <td className="p-2 align-top">
                      <EditableCost
                        listId={hit.id}
                        classSlug={item.classSlug}
                        className={info?.title ?? item.classSlug}
                        cost={item.cost}
                        currency={pricing.currency}
                        status={hit.status}
                        canEdit={editable}
                        returnTo={returnTo ?? ""}
                      />
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

/**
 * سطرُ الحصيلة — يقول ما لم يُعرَض بدل أن يتركه يُخمَّن.
 *
 * 🔎 **وهو أيضاً العتبةُ التي تقرؤها جزيرةُ البحث**: `data-routes-shown` و
 * `data-routes-total` هما ما يجعل الترشيح المحليّ يقع أو يسقط إلى الدالة —
 * فالعتبة مقروءةٌ من الصفحة لا رقمٌ مكتوبٌ بالحدس في مكانين. وحين يرشّح البحث
 * محلياً يُخفي هذا السطر ويكتب حصيلةً حيّةً بدله.
 */
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
    <p
      className="text-xs text-muted-foreground"
      data-routes-window=""
      data-routes-shown={shown}
      data-routes-total={total}
    >
      المعروض {toArabicDigits(shown)} من {toArabicDigits(total)} مسار
      {query ? ` مطابق لـ«${query}»` : ""}
      {total > shown ? " — ضيّق البحث أو انتقل إلى الصفحة التالية." : "."}
    </p>
  );
}
