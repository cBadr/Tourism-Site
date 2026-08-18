import Link from "next/link";
import { AlertTriangle, ClipboardCheck, Percent } from "lucide-react";

import { toArabicDigits } from "@/components/booking/format";
import { HelpTip } from "@/components/shared/HelpTip";
import { Card } from "@/components/ui/card";
import { createServerSupabase } from "@/lib/supabase/server";
import { asText, Banners } from "../../orders/_components/booking-ui";
import { PriceListCard } from "../_components/price-list-card";
import { PriceSheetCard, type SheetHeader } from "../_components/price-sheet-card";
import {
  EMPTY_PRICING_CONTEXT,
  loadPricingContext,
  type PricingContext,
} from "../_components/pricing-context";
import {
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
 * طابور مراجعة الأسعار — كل المسارات «بانتظار المراجعة» عبر كل المتعهدين،
 * الأقدم أولاً لأن المسار المنتظر يعني رحلات تُسعَّر بتعريفة الكيلومتر بلا داعٍ.
 *
 * 🔑 بعد 0102 يُعرض الطابور **مُجمَّعاً بالكشف**: المتعهد الذي يُدخل ~١٠٠ مسار
 * يصل هنا في بطاقةٍ واحدة بقرارٍ واحد، لا في ١٠٠ بطاقة بـ١٠٠ قرار — وهذا نصّ
 * ما طلبه المالك. والمسارات المستقلة (النموذج القديم، `sheet_id = null`) تبقى
 * ببطاقاتها كما هي بلا أي تغيير في سلوكها.
 *
 * 🔴 ولماذا أُعيدت بنية القراءة في 0109: كان الطابور يقرأ `price_lists` بسقفٍ
 * **عالميّ** (`order by created_at limit 100`) ثم يعنون زرَّ الاعتماد بعدد ما
 * وصل — بينما `review_price_sheet` تكتب على **كل** مسارٍ منتظر في الكشف. فكشفٌ
 * بـ١٢٠ مساراً كان يُعرض منه ١٠٠ **وتُعتمد ١٢٠** (‏مقيسٌ حيّاً 2026-08-18)،
 * وتدخل عشرون تكلفةً لم يرها أحد إلى `coverage_matches` فتُسعّر عروضاً حقيقية.
 * والسقف عالميّ ⇒ ثلاثون مساراً تكفي لو سبقتها ثمانون من متعهدٍ آخر.
 *
 * والعلاج ثلاثيّ، ولا واحد منه وحده كافٍ:
 *   (١) **الترقيم صار بالكشوف لا بالمسارات**: نبدأ من `price_sheet_stats` —
 *       عدّاد `pending_count` نفسه الذي تعمل عليه الدالة — ثم نسحب مسارات كل
 *       كشفٍ نعرضه **كاملةً**. فما يُعرض هو ما سيُكتب، بحكم البناء.
 *   (٢) **البطاقة تقارن قبل أن ترسم زرّاً**: `lists.length` مقابل `pendingCount`
 *       الآتي من مصدرٍ مستقل؛ اختلافُهما يُلغي القرار ويطبع الرقمين.
 *   (٣) **والقاعدة ترفض الانحراف** (0109): `p_expected` إلزاميّ، وأي اختلاف
 *       يوقف الكتابة كلها. فحتى لو أخطأ هذا الملف يوماً، لا يتسع الاعتماد.
 *
 * الفكرة الأساسية باقية: بجوار كل تكلفة يظهر **سعر العميل** الناتج عنها بالهامش
 * الحالي، فيعتمد المدير وهو يرى أثر اعتماده على السعر المعروض لا على التكلفة.
 * الاعتماد والرفض يقعان في Postgres (`review_price_sheet` / `review_price_list`).
 */

export const metadata = { title: "مراجعة الأسعار" };

const hasSupabaseEnv = () =>
  Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);

/**
 * سقف **الصفوف المرسومة** في الصفحة. لا يقتطع كشفاً أبداً: نضمّ الكشوف الأقدم
 * فالأقدم حتى يمتلئ، وأول كشفٍ لا يسع يُترك للتحميل التالي كاملاً. وكشفٌ واحد
 * أكبر من السقف يُعرض كاملاً رغم ذلك — لأن «اعرض كل ما ستعتمده» أهم من عدد
 * صفوف الجدول، والحدّ الأعلى الحقيقي عليه هو حدّ الاستيراد نفسه (٥٠٠/ملف).
 */
const MAX_QUEUE_ROUTES = 1500;

/** بطاقاتٌ لكشوف الصفحة الواحدة — سقفٌ على العرض لا على قرار */
const MAX_SHEET_CARDS = 25;

/**
 * المسارات المستقلة: بطاقةٌ لكل مسار وقرارٌ لكل بطاقة (`review_price_list`)،
 * فالسقف هنا **لا يوسّع قراراً** إطلاقاً — يؤجّل عرض بطاقاتٍ لا أكثر.
 */
const MAX_LOOSE = 100;

const RETURN_TO = "/admin/subcontractors/reviews";

type SheetStat = {
  id: string;
  subcontractorId: string | null;
  companyName: string;
  title: string;
  note: string | null;
  pendingCount: number;
  createdAt: string | null;
};

type Loaded = {
  /** الكشوف المعروضة، الأقدم أولاً */
  sheets: SheetStat[];
  /** مسارات الكشوف المعروضة، مفهرسة بالكشف */
  listsBySheet: Map<string, PriceListView[]>;
  /** المسارات المستقلة المعروضة (بطاقة لكل مسار) */
  loose: PriceListView[];
  itemsByList: Map<string, PriceItemView[]>;
  subs: Map<string, SubcontractorView>;
  pricing: PricingContext;
  /** إجماليات صادقة **غير مقتطعة**: من العدّادات لا من الصفوف المرسومة */
  totalPendingInSheets: number;
  totalSheetsPending: number;
  totalLoose: number;
  ready: boolean;
};

const EMPTY: Loaded = {
  sheets: [],
  listsBySheet: new Map(),
  loose: [],
  itemsByList: new Map(),
  subs: new Map(),
  pricing: EMPTY_PRICING_CONTEXT,
  totalPendingInSheets: 0,
  totalSheetsPending: 0,
  totalLoose: 0,
  ready: false,
};

const intOf = (v: unknown): number => {
  const n = typeof v === "number" ? v : typeof v === "string" ? Number(v) : NaN;
  return Number.isFinite(n) ? Math.max(0, Math.trunc(n)) : 0;
};

async function loadQueue(): Promise<Loaded> {
  const supabase = await createServerSupabase();
  if (!supabase) return EMPTY;

  // العدّادات أولاً: هي مصدر الحقيقة الذي تعمل عليه `review_price_sheet` نفسها.
  // خطؤها لا يعني فشلاً بل «قاعدة قبل 0102» — عندها يعود كل مسارٍ إلى بطاقته.
  const [statsRes, pricing] = await Promise.all([
    supabase.rpc("price_sheet_stats", { p_subcontractor_id: null }),
    loadPricingContext(supabase),
  ]);
  const sheetsReady = !statsRes.error;

  const allPendingSheets: SheetStat[] = sheetsReady
    ? ((statsRes.data ?? []) as Record<string, unknown>[])
        .map((row) => ({
          id: String(row.id),
          subcontractorId: asText(row.subcontractor_id),
          companyName: asText(row.company_name) ?? "متعهد غير معروف",
          title: asText(row.title) ?? "كشف بلا اسم",
          note: asText(row.note),
          pendingCount: intOf(row.pending_count),
          createdAt: asText(row.created_at),
        }))
        .filter((s) => s.pendingCount > 0)
        // طابور عمل لا سجل تصفّح: الأقدم أولاً
        .sort((a, b) => (a.createdAt ?? "").localeCompare(b.createdAt ?? ""))
    : [];

  const totalPendingInSheets = allPendingSheets.reduce((n, s) => n + s.pendingCount, 0);

  // ضمُّ الكشوف حتى امتلاء السقف — **بلا اقتطاع كشفٍ أبداً**
  const shownSheets: SheetStat[] = [];
  let budget = 0;
  for (const sheet of allPendingSheets) {
    if (shownSheets.length >= MAX_SHEET_CARDS) break;
    if (shownSheets.length > 0 && budget + sheet.pendingCount > MAX_QUEUE_ROUTES) break;
    shownSheets.push(sheet);
    budget += sheet.pendingCount;
  }

  const sheetIds = shownSheets.map((s) => s.id);

  const [sheetListsRes, looseRes] = await Promise.all([
    sheetIds.length > 0
      ? supabase
          .from("price_lists")
          .select("*")
          .eq("status", "pending")
          .in("sheet_id", sheetIds)
          // +1 ليست تجميلاً: لو عاد أكثر مما حسبناه فالعدّاد والصفوف افترقا،
          // وتلتقطه المقارنة داخل البطاقة بدل أن يمرّ
          .limit(budget + 1)
      : null,
    sheetsReady
      ? supabase
          .from("price_lists")
          .select("*", { count: "exact" })
          .eq("status", "pending")
          .is("sheet_id", null)
          .order("created_at", { ascending: true })
          .limit(MAX_LOOSE)
      : // قاعدة قبل 0102: لا كشوف — كل منتظرٍ بطاقةٌ وقرارٌ مستقل، كما كان
        supabase
          .from("price_lists")
          .select("*", { count: "exact" })
          .eq("status", "pending")
          .order("created_at", { ascending: true })
          .limit(MAX_LOOSE),
  ]);

  // فشل قراءة `price_lists` = جداول المرحلة ٥ غير منفَّذة بعد
  if (looseRes.error) return { ...EMPTY, pricing };

  const listsBySheet = new Map<string, PriceListView[]>();
  const sheetRows =
    sheetListsRes && !sheetListsRes.error
      ? ((sheetListsRes.data ?? []) as Record<string, unknown>[])
      : [];
  for (const row of sheetRows) {
    const sheetId = asText(row.sheet_id);
    if (!sheetId) continue;
    const view = readPriceList(row);
    const bucket = listsBySheet.get(sheetId);
    if (bucket) bucket.push(view);
    else listsBySheet.set(sheetId, [view]);
  }
  for (const bucket of listsBySheet.values()) {
    bucket.sort((a, b) => (a.createdAt ?? "").localeCompare(b.createdAt ?? ""));
  }

  const loose = ((looseRes.data ?? []) as Record<string, unknown>[]).map(readPriceList);
  const totalLoose = typeof looseRes.count === "number" ? looseRes.count : loose.length;

  const allLists = [...loose, ...[...listsBySheet.values()].flat()];
  const listIds = allLists.map((l) => l.id);
  const subIds = [
    ...new Set(
      [
        ...allLists.map((l) => l.subcontractorId),
        ...shownSheets.map((s) => s.subcontractorId),
      ].filter((v): v is string => v !== null)
    ),
  ];

  const [itemsRes, subsRes] = await Promise.all([
    listIds.length > 0
      ? supabase.from("price_list_items").select("*").in("price_list_id", listIds)
      : null,
    subIds.length > 0 ? supabase.from("subcontractors").select("*").in("id", subIds) : null,
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

  return {
    sheets: shownSheets,
    listsBySheet,
    loose,
    itemsByList,
    subs,
    pricing,
    totalPendingInSheets,
    totalSheetsPending: allPendingSheets.length,
    totalLoose,
    ready: true,
  };
}

export default async function PriceReviewsPage({
  searchParams,
}: PageProps<"/admin/subcontractors/reviews">) {
  const [params, queue] = await Promise.all([searchParams, loadQueue()]);
  const {
    sheets,
    listsBySheet,
    loose,
    itemsByList,
    subs,
    pricing,
    totalPendingInSheets,
    totalSheetsPending,
    totalLoose,
    ready,
  } = queue;

  const wired = hasSupabaseEnv();
  const savedKey = typeof params.saved === "string" ? params.saved : null;
  const error = typeof params.error === "string" ? params.error : null;

  /**
   * رمزٌ مستقل لكل نتيجة: «الكشف كله» و«المُعلَّم منه» و«خانةٌ حُفظت» ثلاثةُ
   * أشياء مختلفة، ورسالةٌ واحدة تجمعها تُخفي عن المشرف ما وقع فعلاً.
   */
  const SAVED_MESSAGES: Record<string, string> = {
    approvedlist: "اعتُمد المسار — أسعاره تدخل التسعير فوراً ما دام حساب المتعهد معتمداً.",
    rejectedlist: "رُفض المسار وعاد إلى المتعهد بملاحظتك.",
    approvedsheet:
      "اعتُمد الكشف كله — مساراته تدخل التسعير فوراً ما دام حساب المتعهد معتمداً.",
    rejectedsheet: "رُفض الكشف كله وعادت مساراته إلى المتعهد بملاحظتك.",
    approvedsome:
      "اعتُمد ما علّمتَ عليه وحده — وبقية مسارات الكشف ما زالت في الطابور بانتظار قرارك.",
    rejectedsome:
      "رُفض ما علّمتَ عليه وحده وعاد إلى المتعهد بملاحظتك — وما اعتُمد من الكشف لم يُمَسّ.",
    costlive:
      "حُفظت التكلفة على قائمةٍ معتمدة — تدخل التسعير فوراً، وكُتب سطر تدقيق باسمك وأُشعِر المتعهد بالتعديل.",
    costsaved:
      "حُفظت التكلفة. القائمة ليست معتمدة فلا يُسعَّر بها أحد بعد، وكُتب سطر تدقيق باسمك.",
    costsame: "الرقم كما هو — لم يُكتب شيء ولم يُرسل إشعار.",
  };

  const totalPending = totalPendingInSheets + totalLoose;
  const shownRoutes =
    [...listsBySheet.values()].reduce((n, rows) => n + rows.length, 0) + loose.length;
  const hiddenSheets = totalSheetsPending - sheets.length;
  const hiddenLoose = totalLoose - loose.length;

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
        saved={savedKey !== null && savedKey in SAVED_MESSAGES}
        error={error}
        errorMessages={SUBCONTRACTOR_ERRORS}
        savedMessage={savedKey ? (SAVED_MESSAGES[savedKey] ?? "") : ""}
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

      {ready && totalPending === 0 && (
        <Card className="p-5 text-sm text-muted-foreground">
          لا توجد مسارات بانتظار المراجعة — الطابور فارغ. أي كشف يرسله متعهد سيظهر هنا
          فوراً.
        </Card>
      )}

      {ready && totalPending > 0 && (
        <p className="text-sm text-muted-foreground">
          في الطابور {toArabicDigits(totalPending)} مسار بانتظار المراجعة
          {totalSheetsPending > 0
            ? ` — منها ${toArabicDigits(totalPendingInSheets)} في ${toArabicDigits(totalSheetsPending)} كشف`
            : ""}
          {totalLoose > 0
            ? `${totalSheetsPending > 0 ? " و" : " — "}${toArabicDigits(totalLoose)} مسار مستقل`
            : ""}
          ، الأقدم أولاً. والمعروض الآن {toArabicDigits(shownRoutes)}.
        </p>
      )}

      {ready && (hiddenSheets > 0 || hiddenLoose > 0) && (
        <p className="flex items-start gap-2 rounded-lg border border-amber-400/60 bg-amber-50/60 p-3 text-xs leading-5 text-amber-800 dark:bg-amber-950/20 dark:text-amber-200">
          <AlertTriangle className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
          <span>
            هذه أقدم دفعةٍ في الطابور، وبقي خلفها
            {hiddenSheets > 0 ? ` ${toArabicDigits(hiddenSheets)} كشف` : ""}
            {hiddenSheets > 0 && hiddenLoose > 0 ? " و" : ""}
            {hiddenLoose > 0 ? ` ${toArabicDigits(hiddenLoose)} مسار مستقل` : ""} — راجع
            المعروض ثم أعد التحميل ليظهر التالي.{" "}
            <strong>ولا يُقتطع كشفٌ أبداً</strong>: ما يُعرض من أي كشف هو كل ما يُعتمد به.
          </span>
        </p>
      )}

      {sheets.map((stat) => {
        const sheetLists = listsBySheet.get(stat.id) ?? [];
        const sub = stat.subcontractorId ? subs.get(stat.subcontractorId) : undefined;
        const sheet: SheetHeader = {
          id: stat.id,
          title: stat.title,
          note: stat.note,
          companyName: sub?.companyName ?? stat.companyName,
          companyId: sub?.id ?? stat.subcontractorId,
          companyApproved: sub?.status === "approved",
          pendingCount: stat.pendingCount,
        };
        return (
          <PriceSheetCard
            key={stat.id}
            sheet={sheet}
            lists={sheetLists}
            itemsByList={itemsByList}
            pricing={pricing}
            returnTo={RETURN_TO}
            readOnly={!ready}
          />
        );
      })}

      {loose.map((list) => {
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
              canEditCosts={ready}
              companyName={sub?.companyName ?? "متعهد غير معروف"}
              companyHref={sub ? `/admin/subcontractors/${sub.id}` : undefined}
            />
          </div>
        );
      })}

      {ready && shownRoutes > 0 && (
        <p className="text-xs text-muted-foreground">
          عدد المسارات المعروضة: {toArabicDigits(shownRoutes)}. الأسعار المعروضة للاتجاه
          الواحد قبل معاملات الرحلة.
        </p>
      )}
    </div>
  );
}
