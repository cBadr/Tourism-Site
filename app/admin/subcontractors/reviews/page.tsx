import Link from "next/link";
import { ClipboardCheck, Percent } from "lucide-react";

import { toArabicDigits } from "@/components/booking/format";
import { HelpTip } from "@/components/shared/HelpTip";
import { Card } from "@/components/ui/card";
import { createServerSupabase } from "@/lib/supabase/server";
import { asText, Banners } from "../../orders/_components/booking-ui";
import { PriceListCard } from "../_components/price-list-card";
import {
  EMPTY_PRICING_CONTEXT,
  loadPricingContext,
  type PricingContext,
} from "../_components/pricing-context";
import {
  listsText,
  marginLabel,
  readPriceItem,
  readPriceList,
  readSubcontractor,
  SUBCONTRACTOR_ERRORS,
  SubStatusBadge,
  type PriceItemView,
  type PriceListView,
  type SubcontractorView,
} from "../_components/subcontractor-ui";

/**
 * طابور مراجعة الأسعار — كل قوائم الأسعار «بانتظار المراجعة» عبر كل المتعهدين،
 * الأقدم أولاً لأن القائمة المنتظرة تعني رحلات تُسعَّر بتعريفة الكيلومتر بلا داعٍ.
 *
 * الفكرة الأساسية: بجوار كل تكلفة يظهر **سعر العميل** الناتج عنها بالهامش الحالي،
 * فيعتمد المدير وهو يرى أثر اعتماده على السعر المعروض لا على التكلفة وحدها.
 * الاعتماد والرفض يقعان داخل `review_price_list` في Postgres — الواجهة تنادي فقط.
 */

export const metadata = { title: "مراجعة الأسعار" };

const hasSupabaseEnv = () =>
  Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);

const MAX_LISTS = 100;

const RETURN_TO = "/admin/subcontractors/reviews";

type Loaded = {
  lists: PriceListView[];
  itemsByList: Map<string, PriceItemView[]>;
  subs: Map<string, SubcontractorView>;
  pricing: PricingContext;
  ready: boolean;
};

async function loadQueue(): Promise<Loaded> {
  const empty: Loaded = {
    lists: [],
    itemsByList: new Map(),
    subs: new Map(),
    pricing: EMPTY_PRICING_CONTEXT,
    ready: false,
  };

  const supabase = await createServerSupabase();
  if (!supabase) return empty;

  // الأقدم أولاً: هذا طابور عمل لا سجل تصفّح
  const listsRes = await supabase
    .from("price_lists")
    .select("*")
    .eq("status", "pending")
    .order("created_at", { ascending: true })
    .limit(MAX_LISTS);

  // خطأ الاستعلام الرئيسي = جداول المرحلة ٥ غير منفَّذة بعد
  if (listsRes.error) return empty;

  const lists = ((listsRes.data ?? []) as Record<string, unknown>[]).map(readPriceList);
  const listIds = lists.map((l) => l.id);
  const subIds = [
    ...new Set(lists.map((l) => l.subcontractorId).filter((v): v is string => v !== null)),
  ];

  const [itemsRes, subsRes, pricing] = await Promise.all([
    listIds.length > 0
      ? supabase.from("price_list_items").select("*").in("price_list_id", listIds)
      : null,
    subIds.length > 0 ? supabase.from("subcontractors").select("*").in("id", subIds) : null,
    loadPricingContext(supabase),
  ]);

  const itemsByList = new Map<string, PriceItemView[]>();
  if (itemsRes && !itemsRes.error) {
    for (const row of (itemsRes.data ?? []) as Record<string, unknown>[]) {
      const item = readPriceItem(row);
      if (!item) continue;
      const bucket = itemsByList.get(item.priceListId);
      if (bucket) bucket.push(item);
      else itemsByList.set(item.priceListId, [item]);
    }
  }

  const subs = new Map<string, SubcontractorView>();
  if (subsRes && !subsRes.error) {
    for (const row of (subsRes.data ?? []) as Record<string, unknown>[]) {
      if (!asText(row.id)) continue;
      const sub = readSubcontractor(row);
      subs.set(sub.id, sub);
    }
  }

  return { lists, itemsByList, subs, pricing, ready: true };
}

export default async function PriceReviewsPage({
  searchParams,
}: PageProps<"/admin/subcontractors/reviews">) {
  const [params, { lists, itemsByList, subs, pricing, ready }] = await Promise.all([
    searchParams,
    loadQueue(),
  ]);

  const wired = hasSupabaseEnv();
  const savedKey = typeof params.saved === "string" ? params.saved : null;
  const error = typeof params.error === "string" ? params.error : null;

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="flex items-center gap-1.5 font-heading text-lg font-bold">
          <ClipboardCheck className="size-5 text-primary" />
          مراجعة الأسعار
        </h2>
        <HelpTip>
          كل قائمة أسعار يرسلها متعهد تنتظر هنا. اعتمادها يُدخل أسعارها محرك التسعير فوراً،
          ورفضها يعيدها إليه بملاحظتك. القائمة المعتمدة التي يعدّلها المتعهد لاحقاً تعود
          إلى هذا الطابور تلقائياً — فلا تتغير تكلفة تحت عروض سعر حية.
        </HelpTip>
        <Link
          href="/admin/subcontractors"
          className="ms-auto text-sm text-muted-foreground transition-colors hover:text-primary hover:underline"
        >
          العودة إلى المتعهدين
        </Link>
      </div>

      <Banners
        wired={wired}
        readOnly={!ready}
        saved={savedKey === "approvedlist" || savedKey === "rejectedlist"}
        error={error}
        errorMessages={SUBCONTRACTOR_ERRORS}
        savedMessage={
          savedKey === "rejectedlist"
            ? "رُفضت القائمة وعادت إلى المتعهد بملاحظتك."
            : "اعتُمدت القائمة — أسعارها تدخل التسعير فوراً ما دام حساب المتعهد معتمداً."
        }
        readOnlyTitle="طابور المراجعة غير جاهز بعد"
        readOnlyBody={
          <p>
            قاعدة البيانات مربوطة لكن جدول <code dir="ltr">price_lists</code> غير موجود —
            نفِّذ هجرة المرحلة ٥ من <code dir="ltr">supabase/migrations</code> ثم أعد تحميل
            الصفحة.
          </p>
        }
      />

      {/* قاعدة الهامش المعمول بها الآن — هي التي تحوّل التكلفة إلى سعر العميل أدناه */}
      <Card className="gap-1 p-4">
        <h3 className="flex items-center gap-1.5 text-sm font-medium">
          <Percent className="size-4 text-primary" />
          الهامش المطبَّق الآن: {marginLabel(pricing.margin, pricing.currency)}
          <HelpTip>
            سعر العميل = تكلفة المتعهد + الهامش، ثم أرضية سعر الفئة إن كان الناتج أقل منها.
            وعند تسعير رحلة بعينها تُضاف فوق ذلك معاملات الذهاب والعودة وساعات الانتظار
            وعمولة الذروة. الحساب الملزم يقع داخل قاعدة البيانات لحظة التسعير.
          </HelpTip>
        </h3>
        {!pricing.margin.fromDatabase && (
          <p className="text-xs text-amber-700 dark:text-amber-300">
            إعدادات الهامش غير محفوظة في قاعدة البيانات بعد — المعروض هنا القيم الافتراضية
            من العقد (<code dir="ltr">DEFAULT_MARGIN</code>)، وتُثبَّت بتنفيذ هجرة المرحلة ٥.
          </p>
        )}
        {!pricing.ready && (
          <p className="text-xs text-muted-foreground">
            تعذّر قراءة فئات السيارات — أسماء الفئات وأرضيات أسعارها ستظهر ناقصة حتى تُنفَّذ
            هجرة المرحلة ٣.
          </p>
        )}
      </Card>

      {ready && lists.length === 0 && (
        <Card className="p-5 text-sm text-muted-foreground">
          لا توجد قوائم بانتظار المراجعة — الطابور فارغ. أي قائمة يرسلها متعهد ستظهر هنا
          فوراً.
        </Card>
      )}

      {lists.length > 0 && (
        <p className="text-sm text-muted-foreground">
          في الطابور {listsText(lists.length)}
          {lists.length === MAX_LISTS ? " (أقدم ما وصل — راجع دفعة ثم أعد التحميل)" : ""}،
          الأقدم أولاً.
        </p>
      )}

      {lists.map((list) => {
        const sub = list.subcontractorId ? subs.get(list.subcontractorId) : undefined;
        return (
          <div key={list.id} className="space-y-1">
            {sub && sub.status !== "approved" && (
              <p className="flex flex-wrap items-center gap-1.5 text-xs text-amber-700 dark:text-amber-300">
                <SubStatusBadge status={sub.status} />
                حساب هذا المتعهد ليس معتمداً — اعتماد القائمة وحده لا يُدخل أسعارها التسعير
                حتى يُعتمد حسابه من ملفه.
              </p>
            )}
            <PriceListCard
              list={list}
              items={itemsByList.get(list.id) ?? []}
              pricing={pricing}
              returnTo={RETURN_TO}
              readOnly={!ready}
              companyName={sub?.companyName ?? "متعهد غير معروف"}
              companyHref={sub ? `/admin/subcontractors/${sub.id}` : undefined}
            />
          </div>
        );
      })}

      {lists.length > 0 && (
        <p className="text-xs text-muted-foreground">
          عدد القوائم المعروضة: {toArabicDigits(lists.length)}. الأسعار المعروضة للاتجاه
          الواحد قبل معاملات الرحلة.
        </p>
      )}
    </div>
  );
}
