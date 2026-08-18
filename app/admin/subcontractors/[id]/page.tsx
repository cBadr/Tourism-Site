import type { ReactNode } from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import {
  ArrowLeft,
  BadgeCheck,
  Ban,
  Car,
  CheckCircle2,
  ExternalLink,
  Globe,
  KeyRound,
  MapPin,
  MessageCircle,
  Phone,
  Radio,
  Scale,
  Send,
  UserCog,
} from "lucide-react";

import { formatMoney, toArabicDigits } from "@/components/booking/format";
import { HelpTip } from "@/components/shared/HelpTip";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { telLink, waLink } from "@/lib/phone";
import { createServerSupabase } from "@/lib/supabase/server";
import {
  readPartnerCredit,
  SETTLEMENT_PANEL_TONE,
  settlementWording,
} from "../../finance/_components/finance-ui";
import {
  asNumber,
  asText,
  Banners,
  dateTimeLabel,
  pick,
  relativeTime,
} from "../../orders/_components/booking-ui";
import { PriceListCard } from "../_components/price-list-card";
import { PriceSheetCard, type SheetHeader } from "../_components/price-sheet-card";
import {
  loadPartnerPresence,
  PresenceBadge,
  ReachBadge,
  ReachDetail,
  type PartnerPresence,
} from "../_components/presence-ui";
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
import {
  classPricesText,
  inviteCommand,
  isSubStatus,
  listsText,
  readPriceItem,
  readPriceList,
  readSubcontractor,
  readVehicle,
  routesText,
  SUB_STATUS_HINTS,
  SUBCONTRACTOR_ERRORS,
  SubStatusBadge,
  vehiclesText,
  type PriceItemView,
  type PriceListView,
  type SubcontractorView,
  type VehicleView,
} from "../_components/subcontractor-ui";
import { resendInvite, setSubcontractorStatus, unlinkPartnerTelegram } from "../actions";
import { DriverDocsCard } from "./_components/driver-docs-card";

/**
 * ملف المتعهد — كل ما يخص شريكاً واحداً في شاشة عمل واحدة:
 * بياناته، حالة حساب دخوله، أسطوله، قوائم أسعاره، وملخص تغطيته.
 *
 * قرار الاعتماد هنا ليس شكلياً: أسعار المتعهد المعتمد وحده تدخل `quote_price`،
 * وإيقافه يُخرجها فوراً بلا حذف صف واحد — لذلك لكل من الاعتماد والإيقاف خطوة تأكيد.
 * لا كلمة مرور تُعرض أو تُكتب في هذه الصفحة إطلاقاً؛ الدخول بدعوة بريدية فقط.
 */

export const metadata = { title: "ملف المتعهد" };

/**
 * سقف **قراءة** مسارات المتعهد. كان الاستعلام بلا سقفٍ إطلاقاً فيقع الاقتطاع
 * عند حدّ PostgREST الضمني — صامتاً وبلا رقم. صريحٌ الآن، و`count: exact` يجعل
 * الفارق مرئياً في الصفحة بدل أن يُخمَّن.
 */
const MAX_DETAIL_ROUTES = 500;

/**
 * بطاقاتٌ مفصّلة لمسارٍ واحد — سقفُ عرضٍ لا سقفَ قرار (كل بطاقة قرارها وحدها).
 *
 * ⚠ **ولم يعد يقع إلا على ما ينتظر قراراً.** كان يقع على المسارات كلها — بما
 *   فيها المعتمدة — فيولّد جداراً من جداول الأسعار على شاشةٍ لا يُطلب فيها
 *   قرارٌ أصلاً. المعتمدة والمرفوضة والمسودّات صارت كلها في جدولٍ مضغوطٍ
 *   قابلٍ للبحث أدناه، وتفصيلُ أيٍّ منها بطاقةٌ **واحدة** عند الطلب.
 */
const MAX_DETAIL_CARDS = 24;

const hasSupabaseEnv = () =>
  Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * ملخص مقاصة متعهد — من العرض `v_partner_settlements` (المرحلة ٧، ثم 0027).
 *
 * `netDue` هو الرقم الوحيد الذي يُدفع أو يُطالَب به، **وإشارته تنقلب**:
 * موجب = مستحق له علينا، وسالب = محصَّلٌ زائد عليه لنا. أي شاشة تفترض اتجاهاً
 * واحداً ستُخطئ في نصف الرحلات — لذلك الإشارة تُقرأ هنا ولا تُلغى بقيمة مطلقة.
 *
 * وصياغة الإشارة لا تُكتب في هذا الملف: `settlementWording` في شاشات المالية هي
 * مصدرها الوحيد لخمس شاشات، وهذه إحداها. كانت هنا نسخة يدوية منها (‏`-netDue`
 * وجملٌ مكرّرة) فحُذفت — نسختان تنحرفان أول ما تتغير واحدة.
 *
 * وهجرة 0029 جعلت المعادلة **رباعية**: `earned − collected − paid + received`.
 * فبلا قراءة `received` كانت هذه البطاقة تعرض ثلاثة أرقام وصافياً لا يساوي
 * طرحها — وهو ما يجعل المالك يشك في الصافي وهو سليم.
 */
type Settlement = {
  earned: number | null;
  collected: number | null;
  paid: number | null;
  /** `received` (0029) — ما سدّده لنا. null = العمود غائب أي الهجرة لم تُنفَّذ */
  received: number | null;
  netDue: number | null;
  /** `abs_net_due` (0017) — حجم الصافي بلا إشارة، محسوباً في القاعدة */
  absNetDue: number | null;
  tripsCount: number | null;
  /** `owed_to_us` (0027) — ما عليه لنا، وهو ما يُقارَن بسقف الديون */
  owedToUs: number | null;
  /**
   * `over_limit` (0027) — **بلوغ السقف وحده**: العرض لا يقرأ `block_dispatch`،
   * فالوسم يظهر ولو كان الحجب مطفأً. null = العمود غائب أي 0027 لم تُنفَّذ.
   */
  overLimit: boolean | null;
};

type Loaded = {
  ready: boolean;
  sub: SubcontractorView | null;
  vehicles: VehicleView[];
  vehiclesFailed: boolean;
  lists: PriceListView[];
  listsFailed: boolean;
  /**
   * 🔴 عدد مسارات هذا المتعهد **كلها** كما في القاعدة، لا كما وصل.
   * كان الاستعلام بلا `.limit()` إطلاقاً فيعتمد على سقف PostgREST الضمني —
   * اقتطاعٌ صامت بلا حتى تحذير «الأقدم أولاً». الآن السقف صريح والفارق مُعلَن.
   */
  listsTotal: number;
  /**
   * أسعارُ الفئات — **للمسارات المنتظرة قراراً وحدها**.
   *
   * 🔴 كانت تُقرأ لكل مسارات المتعهد (`in(price_list_id, كل المسارات)`) لأن كل
   * مسارٍ كان يُرسم ببطاقةٍ فيها جدولُ أسعاره. ومئةُ مسارٍ بأربع فئات = **٤٠٠
   * صف** تعبر الشبكة في كل فتحةٍ للصفحة، ثم تُرسم أربعمئة صفِّ جدول. الآن تُقرأ
   * لما يُرسم فقط، وخلاصةُ الباقي (عدد الفئات ومداها) محسوبةٌ في Postgres داخل
   * `admin_search_routes`.
   */
  itemsByList: Map<string, PriceItemView[]>;
  /** معرّف الكشف لكل مسار — `null` = مسار مستقل (النموذج القديم قبل 0102) */
  sheetOf: Map<string, string | null>;
  sheets: Map<string, { title: string; note: string | null }>;
  /**
   * عدد المسارات المنتظرة لكل كشف من `price_sheet_stats` — **مصدر مستقل** عن
   * صفوف هذه الصفحة، وهو نفسه الذي تعمل عليه `review_price_sheet`. اختلافه عمّا
   * رُسم يُلغي زرّ الاعتماد في البطاقة (0109).
   */
  pendingBySheet: Map<string, number>;
  pricing: PricingContext;
  /** دور حساب الدخول المرتبط كما هو في `profiles` — null إن لم يُقرأ */
  linkedRole: string | null;
  /** العرض `v_partner_settlements` مقروء — أي أن هجرة المرحلة ٧ مطبَّقة */
  settlementReady: boolean;
  /** null مع `settlementReady` = لا حركة مالية لهذا الشريك بعد */
  settlement: Settlement | null;
  /**
   * مفتاح «حجب العروض» من `partner_credit_settings` — لا من العرض. `null` = لم
   * يُقرأ الصف، فلا تُقال جملة عن توقّف الإسناد في أيٍّ من الاتجاهين.
   */
  blockDispatch: boolean | null;
  currency: string;
  /**
   * حالة ربط تليجرام كما تقولها القاعدة (`admin_partner_telegram`، 0057).
   * `null` = لم تُقرأ (قاعدة قبل الهجرة) — و«لم يُقرأ» ليس «غير مربوط»،
   * فلا يُعرض عندها سطرٌ يدّعي معرفةً (القاعدة ١٥).
   */
  telegram: { linked: boolean; conflict: string | null } | null;
  /** الظهور وقابلية الوصول — `null` = تعذّرت القراءة، وهي ليست «غير متصل» */
  presence: PartnerPresence | null;
  presenceReady: boolean;
  /**
   * عددُ أسعار الفئات داخل المسارات المعتمدة — `count: exact` بلا صفوف.
   * كان يُجمَع في TypeScript من صفوفٍ حُمِّلت كلها لهذا الغرض.
   */
  approvedPrices: number | null;
  /** نتيجةُ بحث مسارات هذا المتعهد — نفس دالة الشاشة الشاملة بمعرّفه */
  routes: { rows: RouteHit[]; total: number; ready: boolean };
  /** تفصيلُ مسارٍ واحد اختاره المشرف — لا مئةُ تفصيلٍ سلفاً */
  routeDetail: { hit: RouteHit; items: PriceItemView[] } | null;
};

/** قراءة مقاصة شريك واحد — كل رقم محسوب في Postgres، ولا جمع هنا */
async function loadSettlement(
  supabase: NonNullable<Awaited<ReturnType<typeof createServerSupabase>>>,
  subcontractorId: string
): Promise<{ ready: boolean; settlement: Settlement | null }> {
  const res = await supabase
    .from("v_partner_settlements")
    .select("*")
    .eq("subcontractor_id", subcontractorId)
    .maybeSingle();

  if (res.error) return { ready: false, settlement: null };
  if (!res.data) return { ready: true, settlement: null };

  const row = res.data as Record<string, unknown>;
  const overLimit = pick(row, ["over_limit", "overLimit"]);
  return {
    ready: true,
    settlement: {
      earned: asNumber(pick(row, ["earned"])),
      collected: asNumber(pick(row, ["collected"])),
      paid: asNumber(pick(row, ["paid"])),
      received: asNumber(pick(row, ["received"])),
      netDue: asNumber(pick(row, ["net_due", "netDue"])),
      absNetDue: asNumber(pick(row, ["abs_net_due", "absNetDue"])),
      tripsCount: asNumber(pick(row, ["trips_count", "tripsCount"])),
      owedToUs: asNumber(pick(row, ["owed_to_us", "owedToUs"])),
      overLimit: typeof overLimit === "boolean" ? overLimit : null,
    },
  };
}

async function loadSubcontractor(
  id: string,
  routeQuery: string,
  routeOffset: number,
  routeId: string | null
): Promise<Loaded> {
  const blank: Loaded = {
    ready: false,
    sub: null,
    vehicles: [],
    vehiclesFailed: false,
    lists: [],
    listsFailed: false,
    listsTotal: 0,
    itemsByList: new Map(),
    sheetOf: new Map(),
    sheets: new Map(),
    pendingBySheet: new Map(),
    pricing: EMPTY_PRICING_CONTEXT,
    linkedRole: null,
    settlementReady: false,
    settlement: null,
    blockDispatch: null,
    currency: "EGP",
    telegram: null,
    presence: null,
    presenceReady: false,
    approvedPrices: null,
    routes: { rows: [], total: 0, ready: false },
    routeDetail: null,
  };

  const supabase = await createServerSupabase();
  if (!supabase) return blank;

  const subRes = await supabase.from("subcontractors").select("*").eq("id", id).maybeSingle();
  if (subRes.error) return blank;
  if (!subRes.data) return { ...blank, ready: true };

  const sub = readSubcontractor(subRes.data as Record<string, unknown>);

  const [
    vehiclesRes,
    listsRes,
    pricing,
    profileRes,
    settlementRes,
    creditRes,
    currencyRes,
    telegramRes,
    statsRes,
    presenceRes,
    routesRes,
  ] = await Promise.all([
      supabase.from("subcontractor_vehicles").select("*").eq("subcontractor_id", id),
      // 🔴 سقفٌ صريح + `count: exact`: بلا الاثنين كان الاقتطاع يقع عند سقف
      // PostgREST الضمني بلا أثرٍ يُرى — لا رقمَ ولا تحذير. الآن يُقاس ويُقال.
      supabase
        .from("price_lists")
        .select("*", { count: "exact" })
        .eq("subcontractor_id", id)
        .order("created_at", { ascending: false })
        .limit(MAX_DETAIL_ROUTES),
      loadPricingContext(supabase),
      sub.profileId
        ? supabase.from("profiles").select("id, role").eq("id", sub.profileId).maybeSingle()
        : null,
      loadSettlement(supabase, id),
      // مفتاح «حجب العروض»: العرض لا يحمله، وبدونه لا يجوز قول «الإسناد متوقف»
      readPartnerCredit(supabase),
      // رمز العملة من قاعدة البيانات لا من الكود — نفس مصدر بقية أسعار الموقع
      supabase.from("pricing_settings").select("currency").limit(1).maybeSingle(),
      /**
       * حالة ربط تليجرام — **بدالة لا بقراءة العمود**. الصفّ مقروءٌ هنا أصلاً
       * بـ`select("*")`، لكن الحكم «هل يتصادم؟» يعيش في القاعدة مرةً واحدة
       * (`telegram_chat_conflict`) — ومقارنتُه ثانيةً في TypeScript تصنع مصدرَي
       * حقيقة يفترقان، وأولُ افتراقٍ بينهما يظهر بتسريب لا بخطأ بناء.
       * 🔒 ولا يخرج منها المعرّف نفسه: بوليان ورمزٌ فقط.
       */
      supabase.rpc("admin_partner_telegram", { p_subcontractor: id }),
      /**
       * عدّادات الكشوف — **التعريف الوحيد** لعدد المنتظر في كل كشف، وهو نفسه
       * الذي تقرؤه `review_price_sheet`. عدُّه هنا من صفوف الصفحة كان يصنع
       * مصدرَي حقيقة، وأولُ افتراقٍ بينهما يظهر باعتمادٍ أوسع من الشاشة لا بخطأ.
       */
      supabase.rpc("price_sheet_stats", { p_subcontractor_id: id }),
      /**
       * الظهور وقابلية الوصول — نداءٌ واحد يحمل الاثنين، وقابليةُ الوصول فيه
       * تصل من `admin_partner_availability` كما هي بلا تعريفٍ ثانٍ (0118).
       */
      loadPartnerPresence(supabase),
      /**
       * بحثُ مسارات هذا المتعهد — **نفس دالة الشاشة الشاملة** بمعرّفه، فلا
       * تنحرف نتيجةٌ عن نتيجة، والتطبيع العربي والاقتطاع والعدّ كلها في Postgres.
       */
      searchRoutes(supabase, {
        query: routeQuery,
        subcontractorId: id,
        limit: ROUTES_PAGE_SIZE,
        offset: routeOffset,
      }),
    ]);

  const vehicles = vehiclesRes.error
    ? []
    : ((vehiclesRes.data ?? []) as Record<string, unknown>[]).map(readVehicle);

  const rawLists = listsRes.error ? [] : ((listsRes.data ?? []) as Record<string, unknown>[]);
  const lists = rawLists.map(readPriceList);
  const listsTotal = typeof listsRes.count === "number" ? listsRes.count : lists.length;

  // عدّاد المنتظر لكل كشف — من الدالة لا من الصفوف
  const pendingBySheet = new Map<string, number>();
  if (!statsRes.error) {
    for (const row of (statsRes.data ?? []) as Record<string, unknown>[]) {
      const sheetId = asText(row.id);
      if (!sheetId) continue;
      const n = Number(row.pending_count);
      pendingBySheet.set(sheetId, Number.isFinite(n) ? Math.max(0, Math.trunc(n)) : 0);
    }
  }

  // الكشوف (0102) — تُقرأ دفاعياً فتبقى الشاشة عاملة على قاعدة قبل الهجرة
  const sheetOf = new Map<string, string | null>();
  for (const row of rawLists) {
    const sheetId = row.sheet_id;
    sheetOf.set(String(row.id), typeof sheetId === "string" && sheetId !== "" ? sheetId : null);
  }
  const sheets = new Map<string, { title: string; note: string | null }>();
  const sheetIds = [...new Set([...sheetOf.values()].filter((v): v is string => v !== null))];
  if (sheetIds.length > 0) {
    const sheetsRes = await supabase
      .from("price_sheets")
      .select("id, title, note")
      .in("id", sheetIds);
    if (!sheetsRes.error) {
      for (const row of (sheetsRes.data ?? []) as Record<string, unknown>[]) {
        sheets.set(String(row.id), {
          title: asText(row.title) ?? "كشف بلا اسم",
          note: asText(row.note),
        });
      }
    }
  }

  /*
    🔴 أسعارُ الفئات تُقرأ **لما يُرسم بطاقةً** وحده: المسارات المنتظرة قراراً.
    وكانت تُقرأ لكل مسارات المتعهد — وهو ما يجعل مئةَ مسارٍ أربعمئةَ صفٍّ تعبر
    الشبكة في كل فتحة صفحة، ثم أربعمئةَ صفِّ جدولٍ في المتصفّح.
  */
  const pendingIds = lists.filter((l) => l.status === "pending").map((l) => l.id);
  const approvedIds = lists.filter((l) => l.status === "approved").map((l) => l.id);

  const [itemsRes, approvedPricesRes] = await Promise.all([
    pendingIds.length > 0
      ? supabase.from("price_list_items").select("*").in("price_list_id", pendingIds)
      : null,
    // عددٌ واحد بلا صفوف — كان يُجمَع في TypeScript من صفوفٍ حُمِّلت لهذا الغرض
    approvedIds.length > 0
      ? supabase
          .from("price_list_items")
          .select("class_slug", { count: "exact", head: true })
          .in("price_list_id", approvedIds)
      : null,
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

  const approvedPrices =
    approvedIds.length === 0
      ? 0
      : approvedPricesRes && !approvedPricesRes.error
        ? (approvedPricesRes.count ?? 0)
        : null;

  // تفصيلُ مسارٍ واحد — ولا يُقرأ إلا بعد أن يطلبه المشرف صراحةً
  let routeDetail: Loaded["routeDetail"] = null;
  if (routeId) {
    const hit = routesRes.rows.find((r) => r.id === routeId) ?? null;
    if (hit) {
      const { items } = await loadRouteItems(supabase, routeId);
      routeDetail = { hit, items };
    }
  }

  return {
    ready: true,
    sub,
    vehicles,
    vehiclesFailed: Boolean(vehiclesRes.error),
    lists,
    listsFailed: Boolean(listsRes.error),
    listsTotal,
    itemsByList,
    sheetOf,
    sheets,
    pendingBySheet,
    pricing,
    linkedRole:
      profileRes && !profileRes.error
        ? asText((profileRes.data as Record<string, unknown> | null)?.role)
        : null,
    settlementReady: settlementRes.ready,
    settlement: settlementRes.settlement,
    // `loaded: false` تعني «لم يُقرأ الصف» — وهي ليست «الحجب مطفأ»
    blockDispatch: creditRes.loaded ? creditRes.settings.blockDispatch : null,
    currency: (!currencyRes.error && asText(currencyRes.data?.currency)) || blank.currency,
    telegram: readTelegramState(telegramRes),
    presence: presenceRes.byId.get(id) ?? null,
    presenceReady: presenceRes.ready,
    approvedPrices,
    routes: routesRes,
    routeDetail,
  };
}

/** صفُّ `admin_partner_telegram` ⇒ الشكل الذي تعرضه الشاشة، أو `null` إن تعذّرت قراءته */
function readTelegramState(
  res: { data: unknown; error: unknown } | null
): { linked: boolean; conflict: string | null } | null {
  if (!res || res.error) return null;
  const row = (Array.isArray(res.data) ? res.data[0] : res.data) as
    | Record<string, unknown>
    | undefined;
  if (!row) return null;
  const conflict = asText(row.conflict);
  return { linked: row.linked === true, conflict };
}

/** سطر «تسمية ← قيمة» داخل بطاقة — نفس سطر شاشة تفاصيل الطلب */
function Row({ label, help, children }: { label: string; help?: string; children: ReactNode }) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-1 border-b border-border py-2 last:border-0">
      <span className="flex items-center gap-1.5 text-sm text-muted-foreground">
        {label}
        {help ? <HelpTip>{help}</HelpTip> : null}
      </span>
      <span className="min-w-0 text-sm font-medium">{children}</span>
    </div>
  );
}

/**
 * روابط التواصل مع المتعهد — من `lib/phone.ts` وحدها.
 *
 * ⚠ والقاعدة الحية تبيّن لماذا لم يُكتشف العيب هنا بالعين: واتساب المتعهد مخزَّن
 * بالصيغة الدولية سلفاً في **٩ من ١١** صفاً (`201000111222`) لأن البذرة تكتبه
 * كذلك، فالنسخة المحلية كانت تُخرج رابطاً صحيحاً **بالصدفة**. لكن `phone` عنده
 * محليٌّ (١٠ من ١١)، وأول متعهد يُدخِل واتسابه كما يكتبه في هاتفه (`0101…`) كان
 * يقع في الخطأ نفسه. فالصحة هنا كانت خاصيةَ بيانات لا خاصيةَ كود.
 */
function ContactLinks({ phone, whatsapp }: { phone: string | null; whatsapp: string | null }) {
  const tel = telLink(phone);
  const wa = waLink(whatsapp);
  return (
    <span className="flex flex-wrap items-center gap-2">
      {phone &&
        (tel ? (
          <a
            href={tel}
            className="inline-flex items-center gap-1 rounded-lg border border-border px-2 py-1 text-xs transition-colors hover:border-primary hover:text-primary"
          >
            <Phone className="size-3.5" />
            <span dir="ltr">{phone}</span>
          </a>
        ) : (
          <span className="text-xs" dir="ltr">
            {phone}
          </span>
        ))}
      {wa && (
        <a
          href={wa}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1 rounded-lg border border-emerald-300 px-2 py-1 text-xs text-emerald-800 transition-colors hover:bg-emerald-50 dark:border-emerald-700 dark:text-emerald-200 dark:hover:bg-emerald-950"
        >
          <MessageCircle className="size-3.5" />
          واتساب
        </a>
      )}
      {!phone && !wa && <span className="text-sm text-muted-foreground">—</span>}
    </span>
  );
}

function SocialLinks({ socials }: { socials: SubcontractorView["socials"] }) {
  const entries: { key: string; href: string; icon: typeof Globe; label: string }[] = [];
  if (socials.website)
    entries.push({ key: "web", href: socials.website, icon: Globe, label: "الموقع" });
  if (socials.facebook)
    entries.push({ key: "fb", href: socials.facebook, icon: ExternalLink, label: "فيسبوك" });
  if (socials.instagram)
    entries.push({ key: "ig", href: socials.instagram, icon: ExternalLink, label: "انستغرام" });

  if (entries.length === 0) return <span className="text-sm text-muted-foreground">—</span>;
  return (
    <span className="flex flex-wrap items-center gap-2">
      {entries.map((entry) => {
        const Icon = entry.icon;
        return (
          <a
            key={entry.key}
            href={entry.href}
            target="_blank"
            rel="noopener noreferrer nofollow"
            className="inline-flex items-center gap-1 rounded-lg border border-border px-2 py-1 text-xs transition-colors hover:border-primary hover:text-primary"
          >
            <Icon className="size-3.5" />
            {entry.label}
          </a>
        );
      })}
    </span>
  );
}

/** خانة رقم واحدة داخل ملخص المقاصة */
function SettlementTile({
  title,
  value,
  currency,
  help,
}: {
  title: string;
  value: number | null;
  currency: string;
  help: string;
}) {
  return (
    <div className="rounded-lg border border-border p-3">
      <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
        {title}
        <HelpTip>{help}</HelpTip>
      </div>
      <span className="mt-1 block text-lg font-bold" dir="ltr">
        {value === null ? "—" : formatMoney(value, currency)}
      </span>
    </div>
  );
}

/**
 * ملخص المقاصة — الرقم الذي يُدفع أو يُطالَب به، بصياغة تحترم إشارته.
 *
 * المعادلة كلها في Postgres، و**بأربعة حدود** منذ 0029:
 * `net_due = مستحقاته − ما حصّله نقداً − ما دفعناه له + ما سدّده لنا`.
 * وهذه البطاقة **لا تقرأ الإشارة بنفسها**: `settlementWording` في شاشات المالية
 * تقرؤها لخمس شاشات، ومنها تصل النبرة والجملة وحجم الرقم ووسم سقف الدين. كانت
 * هنا نسخة يدوية (‏`-netDue` وثلاث جمل مكرّرة) — والنسختان تنحرفان أول تعديل.
 */
function SettlementCard({
  subcontractorId,
  companyName,
  settlement,
  ready,
  blockDispatch,
  currency,
}: {
  subcontractorId: string;
  companyName: string;
  settlement: Settlement | null;
  ready: boolean;
  /** «حجب العروض» مفعّل؟ — null = غير معروف، فلا تُقال جملة إنفاذ */
  blockDispatch: boolean | null;
  currency: string;
}) {
  const netDue = settlement?.netDue ?? null;
  const wording = settlementWording(netDue, settlement?.absNetDue ?? null, currency, {
    owedToUs: settlement?.owedToUs ?? null,
    overLimit: settlement?.overLimit ?? null,
    blockDispatch,
  });

  // الرقم الكبير يصل من `abs_net_due` في العرض — لا قيمة مطلقة تُحسب هنا
  const headline =
    wording.magnitude === null ? "—" : formatMoney(wording.magnitude, currency);

  return (
    <Card className="space-y-4 p-5">
      <div className="flex flex-wrap items-center gap-2">
        <h3 className="flex items-center gap-1.5 font-heading text-base font-bold">
          <Scale className="size-4 text-primary" />
          المقاصة
          <HelpTip>
            العميل يدفع لنا عرباناً ويسلّم الباقي <span className="font-semibold">نقداً
            للسائق</span>. فالمتعهد يخرج من الرحلة وقد قبض جزءاً من مالنا ونحن مدينون له
            بمستحقه كاملاً. لذلك: <span className="font-semibold">الصافي = مستحقاته − ما
            حصّله نقداً − ما سبق أن دفعناه له + ما سدّده لنا</span> — أربعة حدود منذ هجرة
            0029، والحدّ الرابع هو ما يستقبل سداد المتعهد فيخفض دينه بدل أن يعمّقه. وقد
            ينقلب الصافي سالباً فيصير هو المدين لنا.
          </HelpTip>
        </h3>
        <Link
          href={`/admin/finance/partners/${subcontractorId}`}
          className="ms-auto inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
        >
          كشف حساب «{companyName}»
          <ArrowLeft className="size-4" />
        </Link>
      </div>

      {!ready ? (
        <p className="text-sm leading-relaxed text-muted-foreground">
          دفتر المالية غير مفعَّل بعد — العرض <code dir="ltr">v_partner_settlements</code> غير
          موجود. نفِّذ هجرة المرحلة ٧ (<code dir="ltr">0015</code>) من{" "}
          <code dir="ltr">supabase/migrations</code> ثم أعد تحميل الصفحة. بقية الملف تعمل
          طبيعياً.
        </p>
      ) : settlement === null ? (
        <p className="text-sm leading-relaxed text-muted-foreground">
          لا حركة مالية لهذا الشريك بعد — لم تُنفَّذ له رحلة ولم تُسجَّل له دفعة. يظهر الملخص
          هنا فور اكتمال أول رحلة مُسندة إليه.
        </p>
      ) : (
        <>
          <div className={`rounded-lg border p-4 ${SETTLEMENT_PANEL_TONE[wording.tone]}`}>
            <p className="text-xs text-muted-foreground">صافي المقاصة الآن</p>
            <p className="mt-0.5 text-3xl font-bold" dir="ltr">
              {headline}
            </p>
            <p className="mt-1 text-sm font-medium">{wording.verdict}</p>
          </div>

          {/*
            وسم سقف الدين ونصّه يصلان من `settlementWording` حرفياً — لا صياغة
            جديدة هنا ولا شرط جديد، وإلا صار لكل شاشة سقفٌ خاص بها. والعنوان كان
            يقول «الإسناد إليه متوقف» بلا شرط، بينما الوسم يصل من عمود لا يقرأ
            مفتاح «حجب العروض» أصلاً — فصار العنوان نفسه من الصياغة.
          */}
          {wording.limitText !== null && (
            <div className="flex flex-row items-start gap-3 rounded-lg border border-red-300 bg-red-50 p-4 text-red-900 dark:border-red-700 dark:bg-red-950 dark:text-red-100">
              <Ban className="mt-0.5 size-5 shrink-0" />
              <div className="space-y-1 text-sm leading-relaxed">
                <p className="font-semibold">{wording.limitHeadline}</p>
                <p>{wording.limitHint}</p>
                <p>
                  السقف ومفتاح حجبه يُضبطان من{" "}
                  <Link href="/admin/finance/partners" className="underline">
                    بطاقة سقف الديون
                  </Link>{" "}
                  في شاشة المقاصة.
                  {wording.dispatchBlocked
                    ? " ولإسناد رحلة بعينها له رغم ذلك، استعمل الإسناد اليدوي من شاشة الطلب بسبب مكتوب."
                    : ""}
                </p>
              </div>
            </div>
          )}

          {/*
            خمس خانات: حدود المعادلة الأربعة بترتيبها، ثم الدين المرصود.

            وثلاثة أعمدة لا خمسة: العناوين جملٌ لا كلمات، وحاويتها `flex` فلا
            يلتف نصّها بل يفيض. قيس على العرض الفعلي داخل `max-w-4xl`: بخمسة
            أعمدة يفيض كل عنوان، وبأربعة كان أولان يفيضان **قبل هذه الإضافة** —
            عيبٌ قائم صُحّح معها. وثلاثة تسع الجميع بلا فيض.
          */}
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <SettlementTile
              title="مستحقاته عن الرحلات"
              value={settlement.earned}
              currency={currency}
              help="مجموع ما استحقه عن كل رحلة نفّذها فعلاً، بمبلغ الإسناد المثبَّت لكل رحلة. يزيد لحظة تسجيل الرحلة «منفذة» لا لحظة إسنادها."
            />
            <SettlementTile
              title="حصّله نقداً من العملاء"
              value={settlement.collected}
              currency={currency}
              help="ما قبضه السائق من عملائنا نقداً نيابةً عنا (الباقي بعد العربون). هو مالنا في يده، فيُخصم من مستحقاته — وهذا سبب أن الصافي أصغر من المستحقات دائماً."
            />
            <SettlementTile
              title="ما دفعناه له"
              value={settlement.paid}
              currency={currency}
              help="مجموع الدفعات النقدية المسجَّلة له في الدفتر حتى الآن. كل دفعة تُسجَّل من شاشة كشف الحساب فتُنقص الصافي فوراً."
            />
            <SettlementTile
              title="سدّده لنا"
              value={settlement.received}
              currency={currency}
              help="مجموع ما ردّه إلينا نقداً أو تحويلاً (received — هجرة 0029). دخل خزائننا فعلاً وأنقص ما عليه لنا بنفس المقدار، فهو الحدّ الرابع في المعادلة: الصافي = مستحقاته − ما حصّله نقداً − ما دفعناه له + ما سدّده لنا. و«—» هنا تعني أن هجرة 0029 لم تُنفَّذ على هذه القاعدة، لا أنه لم يسدّد شيئاً."
            />
            <SettlementTile
              title="عليه لنا"
              value={settlement.owedToUs}
              currency={currency}
              help="الدين المرصود عليه — صفر إن كنا نحن المدينين له. يُقارَن بسقف الديون لحجب العروض، ويُرفض به تسجيل أي دفعة له بمجرد أن يزيد على صفر: منع الدفع لا ينظر إلى السقف إطلاقاً، فيقع على جنيه واحد كما يقع على ألف. ويقيس الدين المُثبَت في الدفتر وحده: لا يُقيَّد على رحلة شيء قبل تسجيلها «منفَّذة»، فالرحلات الجارية الآن ليست فيه بعد."
            />
          </div>

          <p className="text-sm text-muted-foreground">
            عدد الرحلات المحتسَبة:{" "}
            <span className="font-medium text-foreground">
              {settlement.tripsCount === null ? "—" : toArabicDigits(settlement.tripsCount)}
            </span>{" "}
            · التفصيل سطراً سطراً وتسجيل الدفعات في{" "}
            <Link
              href={`/admin/finance/partners/${subcontractorId}`}
              className="text-primary hover:underline"
            >
              كشف الحساب
            </Link>
            .
          </p>
        </>
      )}
    </Card>
  );
}

/** بطاقة أمر الدعوة اليدوية — تظهر متى تعذّر الإرسال الآلي */
function ManualInviteCard({ sub, title }: { sub: SubcontractorView; title: string }) {
  return (
    <Card className="space-y-2 border-amber-300 bg-amber-50 p-4 text-amber-900 dark:border-amber-700 dark:bg-amber-950 dark:text-amber-100">
      <p className="text-sm font-semibold">{title}</p>
      <p className="text-sm leading-relaxed">
        حساب المتعهد محفوظ ولا شيء ضائع. شغّل هذا الأمر في جذر المشروع — يرسل رابط تعيين
        كلمة المرور، ويربط حساب الدخول، ويضبط دوره على{" "}
        <code dir="ltr">subcontractor</code>، ولا يمر بأي كلمة مرور:
      </p>
      <code
        dir="ltr"
        className="block overflow-x-auto rounded-lg bg-amber-100 p-2 text-xs dark:bg-amber-900"
      >
        {inviteCommand(sub.email, sub.companyName)}
      </code>
      <p className="text-xs leading-relaxed">
        الإرسال الآلي من هذه الشاشة يحتاج <code dir="ltr">SUPABASE_SERVICE_ROLE_KEY</code> في{" "}
        <code dir="ltr">.env.local</code> (ثم إعادة تشغيل الخادم).
      </p>
    </Card>
  );
}

export default async function SubcontractorProfilePage({
  params,
  searchParams,
}: PageProps<"/admin/subcontractors/[id]">) {
  const [{ id }, sp] = await Promise.all([params, searchParams]);
  if (!UUID.test(id)) notFound();

  // بحثُ المسارات داخل هذا المتعهد — يُمرَّر إلى Postgres كما هو
  const routeQuery =
    typeof sp.q === "string" ? sp.q.replace(/\s+/g, " ").trim().slice(0, 80) : "";
  const rawOffset = Number(typeof sp.offset === "string" ? sp.offset : 0);
  const routeOffset = Number.isFinite(rawOffset) && rawOffset > 0 ? Math.trunc(rawOffset) : 0;
  const openRoute = typeof sp.route === "string" && UUID.test(sp.route) ? sp.route : null;

  const {
    ready,
    sub,
    vehicles,
    vehiclesFailed,
    lists,
    listsFailed,
    listsTotal,
    itemsByList,
    sheetOf,
    sheets,
    pendingBySheet,
    pricing,
    linkedRole,
    settlementReady,
    settlement,
    blockDispatch,
    currency,
    telegram,
    presence,
    presenceReady,
    approvedPrices,
    routes,
    routeDetail,
  } = await loadSubcontractor(id, routeQuery, routeOffset, openRoute);
  if (ready && !sub) notFound();

  const wired = hasSupabaseEnv();
  const savedKey = typeof sp.saved === "string" ? sp.saved : null;
  const error = typeof sp.error === "string" ? sp.error : null;
  const confirming = typeof sp.confirm === "string" ? sp.confirm : null;

  const SAVED_MESSAGES: Record<string, string> = {
    approved:
      "اعتُمد المتعهد — أسعاره في القوائم المعتمدة تدخل تسعير الرحلات المغطاة فوراً.",
    suspended:
      "أُوقف المتعهد — خرجت أسعاره من التسعير فوراً وبقيت بياناته وقوائمه كما هي.",
    pending: "أُعيد المتعهد إلى «بانتظار الاعتماد» — أسعاره خارج التسعير حتى تعتمده.",
    invited:
      "أُرسل إلى بريد المتعهد رابط تعيين كلمة المرور — يحددها بنفسه ولا تصل إليك إطلاقاً.",
    manual: "حُفظ حساب المتعهد. لم يُرسل الرابط آلياً — أرسله بالأمر أدناه.",
    invitefail: "حُفظ حساب المتعهد وتعذّر إرسال البريد — أرسل الرابط بالأمر أدناه.",
    approvedlist:
      "اعتُمد المسار — أسعاره تدخل التسعير فوراً ما دام حساب المتعهد معتمداً.",
    rejectedlist: "رُفض المسار وعاد إلى المتعهد بملاحظتك.",
    approvedsheet:
      "اعتُمد الكشف كله — مساراته تدخل التسعير فوراً ما دام حساب المتعهد معتمداً.",
    rejectedsheet: "رُفض الكشف كله وعادت مساراته إلى المتعهد بملاحظتك.",
    tgunlinked:
      "فُصل ربط تليجرام عن هذا المتعهد — لن تصله عروض عليه حتى يربط حساباً مستقلاً من بوابته.",
  };

  if (!sub) {
    return (
      <div className="mx-auto max-w-3xl space-y-6">
        <Banners
          wired={wired}
          readOnly
          saved={false}
          error={null}
          errorMessages={SUBCONTRACTOR_ERRORS}
          readOnlyTitle="ملف المتعهد غير متاح"
          readOnlyBody={
            <p>
              قاعدة البيانات مربوطة لكن جدول <code dir="ltr">subcontractors</code> غير موجود —
              نفِّذ هجرة المرحلة ٥ من <code dir="ltr">supabase/migrations</code> ثم أعد تحميل
              الصفحة.
            </p>
          }
        />
        <Link href="/admin/subcontractors" className="text-sm text-primary hover:underline">
          العودة إلى المتعهدين
        </Link>
      </div>
    );
  }

  // ملخص التغطية — يُحسب من القوائم المعتمدة وحدها لأنها وحدها تدخل التسعير
  const approvedLists = lists.filter((l) => l.status === "approved");
  const pendingLists = lists.filter((l) => l.status === "pending");
  const activeVehicles = vehicles.filter((v) => v.active);

  /** رابطُ قسم المسارات مع حفظ ما لا يجوز أن يضيع (بحثٌ وصفحةٌ ومسارٌ مفتوح) */
  const routesHref = (patch: Record<string, string | null>) => {
    const qs = new URLSearchParams();
    const merged: Record<string, string | null> = {
      q: routeQuery || null,
      offset: routeOffset > 0 ? String(routeOffset) : null,
      route: openRoute,
      ...patch,
    };
    for (const [key, value] of Object.entries(merged)) if (value) qs.set(key, value);
    const s = qs.toString();
    return s
      ? `/admin/subcontractors/${id}?${s}#routes`
      : `/admin/subcontractors/${id}#routes`;
  };

  /**
   * التجميع بالكشف: ما ينتظر قراراً ويقع داخل كشف يُعرض بطاقةً واحدة بقرارٍ واحد
   * (وهذا نصّ ما طلبه المالك: ١٠٠ مسار ⇒ طلب اعتماد واحد). وما عداه يبقى ببطاقته
   * المفصّلة، **بسقفٍ** لأن متعهداً بمئة مسار كان سيولّد مئة بطاقة في صفحة واحدة.
   */
  const pendingSheets = new Map<string, PriceListView[]>();
  const singles: PriceListView[] = [];
  for (const list of pendingLists) {
    const sheetId = sheetOf.get(list.id) ?? null;
    if (sheetId && sheets.has(sheetId)) {
      const bucket = pendingSheets.get(sheetId);
      if (bucket) bucket.push(list);
      else pendingSheets.set(sheetId, [list]);
    } else {
      singles.push(list);
    }
  }
  const shownCards = singles.slice(0, MAX_DETAIL_CARDS);
  const hiddenCards = singles.length - shownCards.length;

  const isApproved = sub.status === "approved";
  const isSuspended = sub.status === "suspended";
  // الأمر اليدوي يصلح ثلاث حالات: غياب مفتاح الخدمة، تعثّر البريد، ودور حساب
  // مرتبط لم يُضبط (يقع حين تمنع الصلاحيات كتابة `profiles` من الخادم)
  const roleMismatch = linkedRole !== null && linkedRole !== "subcontractor";
  const showManualInvite =
    savedKey === "manual" ||
    savedKey === "invitefail" ||
    roleMismatch ||
    (!sub.profileId && ready);

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="font-heading text-lg font-bold">{sub.companyName}</h2>
        <SubStatusBadge status={sub.status} />
        <HelpTip>
          {isSubStatus(sub.status)
            ? SUB_STATUS_HINTS[sub.status]
            : "حالة غير معروفة — راجع قيم العمود في قاعدة البيانات."}
        </HelpTip>
        <span className="text-xs text-muted-foreground">
          أُضيف {relativeTime(sub.createdAt)} · {dateTimeLabel(sub.createdAt)}
        </span>
        <Link
          href="/admin/subcontractors"
          className="ms-auto text-sm text-muted-foreground transition-colors hover:text-primary hover:underline"
        >
          العودة إلى المتعهدين
        </Link>
      </div>

      <Banners
        wired={wired}
        readOnly={false}
        saved={savedKey !== null && savedKey in SAVED_MESSAGES}
        error={error}
        errorMessages={SUBCONTRACTOR_ERRORS}
        savedMessage={(savedKey && SAVED_MESSAGES[savedKey]) || "نُفذت العملية."}
        readOnlyTitle=""
        readOnlyBody={null}
      />

      {/* ملخص التغطية — الجملة التي تختصر قيمة هذا الشريك في التسعير */}
      <Card className="gap-1 p-5">
        <h3 className="flex items-center gap-1.5 font-heading text-base font-bold">
          <MapPin className="size-4 text-primary" />
          التغطية
          <HelpTip>
            المسارات المحسوبة هنا من القوائم المعتمدة وحدها، لأنها وحدها تشارك في التسعير.
            «أسعار الفئات» هي عدد أسعار الفئات داخل تلك القوائم — كلما زادت زادت الرحلات
            التي يُسعّرها هذا الشريك بدل تعريفة الكيلومتر.
          </HelpTip>
        </h3>
        <p className="text-lg font-bold">
          يغطي {routesText(approvedLists.length)} ·{" "}
          {approvedPrices === null ? "أسعار الفئات —" : classPricesText(approvedPrices)}
        </p>
        <p className="text-sm text-muted-foreground">
          {listsText(listsTotal)} إجمالاً
          {pendingLists.length > 0
            ? ` · ${toArabicDigits(pendingLists.length)} بانتظار مراجعتك`
            : ""}{" "}
          · الأسطول {vehiclesText(activeVehicles.length)} نشطة
        </p>
        {!isApproved && (
          <p className="text-sm text-amber-700 dark:text-amber-300">
            حساب هذا المتعهد ليس معتمداً — لا تشارك أسعاره في التسعير مهما اعتُمدت قوائمه.
          </p>
        )}
      </Card>

      {/*
        ── الظهور وقابلية الوصول ────────────────────────────────────────────
        موضعُها هنا لأنها أول ما يُسأل عنه قبل الاتصال: «هل هو موجود الآن، وإن
        لم يكن — هل يصله البلاغ أصلاً؟». وهما سؤالان لا سؤال: التفصيل في ترويسة
        `_components/presence-ui.tsx`.
      */}
      <Card className="gap-2 p-5">
        <h3 className="flex items-center gap-1.5 font-heading text-base font-bold">
          <Radio className="size-4 text-primary" />
          الظهور وقابلية الوصول
          <HelpTip>
            <span className="font-semibold">الظهور</span> يقول «هل هو داخل بوابته
            الآن؟» — نبضةٌ تُسجَّل مع كل طلبٍ من بوابته، مرةً كل دقيقة على الأكثر.
            و<span className="font-semibold">قابلية الوصول</span> تقول «هل يصله بلاغُ
            الرحلة وهل يقبله؟» وهي الشرط نفسه الذي تعمل عليه موجات البثّ. والاثنان
            معاً لأن <span className="font-semibold">غير المتصل قد يردّ على تليجرام
            خلال ثوانٍ</span>، والمتصلُ قد يكون أطفأ العروض.
          </HelpTip>
        </h3>
        <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
          <PresenceBadge presence={presence ?? undefined} ready={presenceReady} />
          <ReachBadge presence={presence ?? undefined} ready={presenceReady} />
        </div>
        {presence ? (
          <ReachDetail presence={presence} />
        ) : (
          <p className="text-xs text-muted-foreground">
            {presenceReady
              ? "لا صفَّ ظهورٍ لهذا الشريك بعد."
              : "تعذّرت قراءة الظهور — نفِّذ هجرة 0118. و«لا نعرف» ليست «غير متصل»."}
          </p>
        )}
      </Card>

      {/*
        المقاصة مباشرة بعد التغطية: التغطية تقول «ماذا يقدّم هذا الشريك»،
        والمقاصة تقول «وكم بيننا وبينه الآن» — وهو أول ما يُسأل عنه عند الاتصال به.
      */}
      <SettlementCard
        subcontractorId={sub.id}
        companyName={sub.companyName}
        settlement={settlement}
        ready={settlementReady}
        blockDispatch={blockDispatch}
        currency={currency}
      />

      <div className="grid gap-4 lg:grid-cols-2">
        {/* بيانات التواصل */}
        <Card className="space-y-1 p-5">
          <h3 className="flex items-center gap-1.5 font-heading text-base font-bold">
            <Phone className="size-4 text-primary" />
            بيانات المتعهد
            <HelpTip>
              يحرّرها المتعهد من بوابته؛ هذه الشاشة تعرضها للتشغيل. لا شيء منها يظهر للعميل —
              الموقع بعلامة واحدة هي علامتك.
            </HelpTip>
          </h3>
          <Row label="اسم الشركة">{sub.companyName}</Row>
          <Row label="مسؤول التواصل">{sub.contactName ?? "—"}</Row>
          <Row label="التواصل">
            <ContactLinks phone={sub.phone} whatsapp={sub.whatsapp} />
          </Row>
          <Row label="البريد الإلكتروني">
            <span dir="ltr">{sub.email ?? "—"}</span>
          </Row>
          <Row label="روابط">
            <SocialLinks socials={sub.socials} />
          </Row>
          {sub.notes ? (
            <Row label="ملاحظات">
              <span className="block max-w-md leading-relaxed">{sub.notes}</span>
            </Row>
          ) : null}
        </Card>

        {/* حساب الدخول */}
        <Card className="space-y-1 p-5">
          <h3 className="flex items-center gap-1.5 font-heading text-base font-bold">
            <KeyRound className="size-4 text-primary" />
            حساب الدخول
            <HelpTip>
              الدخول بدعوة بريدية فقط: يضع المتعهد كلمة مروره بنفسه من رابط الدعوة. لا تُنشئ
              له كلمة مرور ولا ترسلها في أي رسالة — النظام لا يعرضها ولا يخزّنها لك أصلاً.
            </HelpTip>
          </h3>
          <Row label="الحالة">
            {sub.profileId ? (
              <span className="inline-flex items-center gap-1.5">
                <BadgeCheck className="size-4 text-emerald-600" />
                مرتبط بحساب دخول
              </span>
            ) : (
              <span className="text-amber-700 dark:text-amber-300">
                لم يُربط بحساب دخول بعد
              </span>
            )}
          </Row>
          <Row
            label="دور الحساب"
            help="الدور هو ما يفتح للمتعهد بوابته ويمنعه من رؤية أي بيانات عميل. المتوقع دائماً subcontractor."
          >
            {linkedRole ? (
              <span className="inline-flex items-center gap-1.5">
                <code dir="ltr">{linkedRole}</code>
                {linkedRole !== "subcontractor" && (
                  <Badge variant="outline" className="border-amber-300 text-amber-700 dark:text-amber-300">
                    غير متوقع
                  </Badge>
                )}
              </span>
            ) : (
              "—"
            )}
          </Row>
          {/*
            ربط تليجرام — القناة **الوحيدة** التي تبلغ متعهداً اليوم، فحالتها
            معلومةٌ تشغيلية لا تفصيلاً: متعهدٌ غير مربوط يتخطّاه التوزيع بصمت.

            🔴 والتصادم يُعرض بحمرة ومعه مخرجُه: `telegram-is-ops` تعني أن هذه
            المحادثة هي وجهةُ إشعارات الإدارة نفسها — فتصل المتعهدَ رسائلُ فيها
            اسم العميل وهاتفه وسعره وهامشنا (نقض D-19). وحارسُ `0057` يمنع
            إنشاء مثله بعد اليوم ولا يزيل ما سبقه، فالمخرج زرٌّ هنا.
            و«لم يُقرأ» (‏`telegram === null`) لا يُعرض أصلاً — لا يُقال «غير
            مربوط» عمّا لم نقرأه (القاعدة ١٥).
          */}
          {telegram ? (
            <Row
              label="تليجرام"
              help="المتعهد يربط محادثته بنفسه من «قنوات التنبيه» في بوابته. المحادثة الواحدة تخصّ جهة واحدة — لا تُربط بمتعهدين ولا تكون وجهة إشعارات الإدارة في الوقت نفسه."
            >
              {telegram.conflict === "telegram-is-ops" ? (
                <span className="inline-flex flex-wrap items-center gap-2 text-red-700 dark:text-red-300">
                  <Ban className="size-4 shrink-0" aria-hidden="true" />
                  <span className="font-semibold">مربوط بمحادثة إشعارات الإدارة نفسها</span>
                </span>
              ) : telegram.conflict === "telegram-taken" ? (
                <span className="inline-flex flex-wrap items-center gap-2 text-red-700 dark:text-red-300">
                  <Ban className="size-4 shrink-0" aria-hidden="true" />
                  <span className="font-semibold">المحادثة نفسها مربوطة بمتعهد آخر</span>
                </span>
              ) : telegram.linked ? (
                <span className="inline-flex items-center gap-1.5">
                  <BadgeCheck className="size-4 text-emerald-600" />
                  مربوط — تصله عروض الرحلات
                </span>
              ) : (
                <span className="text-amber-700 dark:text-amber-300">
                  غير مربوط — لا تصله عروض على تليجرام
                </span>
              )}
            </Row>
          ) : null}

          {telegram?.conflict ? (
            <div className="rounded-lg border border-red-300 bg-red-50 p-3 text-sm leading-relaxed text-red-900 dark:border-red-800 dark:bg-red-950 dark:text-red-100">
              <p>
                {telegram.conflict === "telegram-is-ops"
                  ? "هذه المحادثة هي وجهة إشعارات الإدارة، ورسائلها تحمل اسم العميل ورقمه وسعره وهامشنا. فصلها من هنا، ثم اطلب من المتعهد الربط من حساب تليجرام مستقل."
                  : "المحادثة نفسها مسجَّلة لمتعهد آخر، فيقرأ كلٌّ منهما مستحق الآخر. افصلها من هنا ثم اطلب منه الربط من حسابه هو."}
              </p>
              <form action={unlinkPartnerTelegram.bind(null, sub.id)} className="mt-2">
                <Button type="submit" variant="outline" size="sm">
                  فصل تليجرام عن هذا المتعهد
                </Button>
              </form>
            </div>
          ) : null}

          <div className="pt-2">
            <form action={resendInvite.bind(null, sub.id)}>
              <Button type="submit" variant="outline" size="sm" disabled={!sub.email}>
                <Send />
                {sub.profileId ? "إعادة إرسال رابط الدخول" : "إرسال الدعوة"}
              </Button>
            </form>
            <p className="mt-1.5 text-xs text-muted-foreground">
              يرسل بريد دعوة رسمياً من Supabase إلى{" "}
              <span dir="ltr">{sub.email ?? "—"}</span>. الرابط يفتح صفحة تعيين كلمة المرور.
            </p>
          </div>
        </Card>
      </div>

      {showManualInvite && (
        <ManualInviteCard
          sub={sub}
          title={
            savedKey === "invitefail"
              ? "تعذّر إرسال بريد الدعوة"
              : roleMismatch
                ? "دور حساب الدخول ليس subcontractor"
                : sub.profileId
                  ? "إرسال رابط الدخول يدوياً"
                  : "هذا المتعهد لم يستلم دعوته بعد"
          }
        />
      )}

      {/* الأسطول */}
      <Card className="space-y-4 p-5">
        <div>
          <h3 className="flex items-center gap-1.5 font-heading text-base font-bold">
            <Car className="size-4 text-primary" />
            الأسطول
            <HelpTip>
              مركبات المتعهد وفئة كل منها. الفئة هي ما يربط المركبة بمحرك التسعير: سعر
              المتعهد لفئة ما لا يُستعمل إن لم يكن لديه مركبة فيها. بيانات المركبة داخلية
              ولا يراها العميل.
            </HelpTip>
          </h3>
          <p className="text-sm text-muted-foreground">
            يديرها المتعهد من بوابته — هذه الشاشة للاطلاع فقط.
          </p>
        </div>

        {vehiclesFailed ? (
          <p className="text-sm text-muted-foreground">
            تعذر قراءة الأسطول — تأكد أن جدول{" "}
            <code dir="ltr">subcontractor_vehicles</code> منفَّذ في قاعدة البيانات (هجرة
            المرحلة ٥).
          </p>
        ) : vehicles.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            لم يضف هذا المتعهد أي مركبة بعد.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[34rem] text-sm">
              <thead>
                <tr className="border-b border-border text-xs text-muted-foreground">
                  <th className="p-2 text-start font-medium">الفئة</th>
                  <th className="p-2 text-start font-medium">المركبة</th>
                  <th className="p-2 text-start font-medium">الموديل</th>
                  <th className="p-2 text-start font-medium">اللوحة</th>
                  <th className="p-2 text-start font-medium">المقاعد</th>
                  <th className="p-2 text-start font-medium">الحالة</th>
                </tr>
              </thead>
              <tbody>
                {vehicles.map((vehicle) => {
                  const info = vehicle.classSlug
                    ? pricing.byClass.get(vehicle.classSlug)
                    : undefined;
                  return (
                    <tr key={vehicle.id} className="border-b border-border last:border-0">
                      <td className="p-2 align-top">{info?.title ?? vehicle.classSlug ?? "—"}</td>
                      <td className="p-2 align-top">{vehicle.label}</td>
                      <td className="p-2 align-top" dir="ltr">
                        {vehicle.modelYear === null ? "—" : toArabicDigits(vehicle.modelYear)}
                      </td>
                      <td className="p-2 align-top" dir="ltr">
                        {vehicle.plate ?? "—"}
                      </td>
                      <td className="p-2 align-top">
                        {vehicle.seats === null ? "—" : toArabicDigits(vehicle.seats)}
                      </td>
                      <td className="p-2 align-top">
                        <Badge variant={vehicle.active ? "default" : "secondary"}>
                          {vehicle.active ? "نشطة" : "متوقفة"}
                        </Badge>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {/*
        ══════════════════════════════════════════════════════════════════════
         قوائم الأسعار — **قسمان لا قسم**، وهذا هو جوهر علاج شكوى المالك (١)
        ══════════════════════════════════════════════════════════════════════

        كان القسم واحداً: بطاقةٌ كاملة لكل مسار — معتمداً كان أو منتظراً — وفيها
        جدولُ أسعارٍ بسطرٍ لكل فئة. مقبولٌ على أربعة مسارات، و«كبيرٌ جداً يربك
        مدير الموقع» على مئة، وهي الحال التي يستعدّ لها المالك.

        فصار:
          (١) **ما ينتظر قرارك** — بطاقاتٌ كاملة، **غير مرشَّحة بالبحث أبداً**.
              و«غير مرشَّحة» شرطٌ لا ذوق: `review_price_sheet` تكتب على الدفعة
              كلها وتقارنها بـ`p_expected` (‏0109)، فترشيحُ ما يُعرض يجعل الزرّ
              يعد بغير ما يفعل — أو يُلغى في كل مرة.
          (٢) **كل المسارات** — جدولٌ مضغوطٌ قابلٌ للبحث، خلاصتُه محسوبةٌ في
              Postgres، وتفصيلُ **واحدٍ** منه عند الطلب.
      */}
      <div className="space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <h3 className="font-heading text-base font-bold">ما ينتظر قرارك</h3>
          <HelpTip>
            المسارات التي أرسلها المتعهد ولم تُبتّ بعد. تُعرض{" "}
            <span className="font-semibold">دفعةً كاملة كما أرسلها</span> ولا يمسّها بحثُ
            المسارات أدناه: الاعتماد يقع على الدفعة كلها، فلا يجوز أن يكون المعروض
            جزءاً منها. وبجوار كل تكلفة سعرُ العميل الناتج عنها بالهامش الحالي.
          </HelpTip>
          {pendingLists.length > 0 && (
            <Link
              href="/admin/subcontractors/reviews"
              className="ms-auto text-sm text-primary hover:underline"
            >
              طابور المراجعة الكامل
            </Link>
          )}
        </div>

        {listsFailed ? (
          <Card className="p-5 text-sm text-muted-foreground">
            تعذر قراءة قوائم الأسعار — تأكد أن جدول <code dir="ltr">price_lists</code> منفَّذ
            في قاعدة البيانات (هجرة المرحلة ٥).
          </Card>
        ) : pendingLists.length === 0 ? (
          <Card className="p-5 text-sm text-muted-foreground">
            {listsTotal === 0
              ? "لا توجد مسارات أسعار لهذا المتعهد بعد — يضيفها من بوابته ثم ترسل إليك للمراجعة. حتى ذلك الحين تُسعَّر رحلاته بتعريفة الكيلومتر."
              : "لا شيء ينتظر قرارك من هذا المتعهد الآن. ومساراته كلها في الجدول أدناه."}
          </Card>
        ) : (
          <>
            {listsTotal > lists.length && (
              <p className="rounded-lg border border-amber-400/60 bg-amber-50/60 p-3 text-xs leading-5 text-amber-800 dark:bg-amber-950/20 dark:text-amber-200">
                لهذا المتعهد {toArabicDigits(listsTotal)} مساراً، والمقروء في هذه الصفحة{" "}
                {toArabicDigits(lists.length)} (الأحدث أولاً). الطابور الكامل في{" "}
                <Link href="/admin/subcontractors/reviews" className="underline">
                  مراجعة الأسعار
                </Link>
                ، وهو يعرض كل كشفٍ كاملاً.
              </p>
            )}

            {/* الكشوف المنتظرة أولاً: قرارٌ واحد للدفعة كلها (0102) */}
            {[...pendingSheets.entries()].map(([sheetId, sheetLists]) => {
              const header = sheets.get(sheetId);
              const sheet: SheetHeader = {
                id: sheetId,
                title: header?.title ?? "كشف بلا اسم",
                note: header?.note ?? null,
                companyName: sub.companyName,
                companyId: null,
                companyApproved: sub.status === "approved",
                // العدّاد المستقل حين يُقرأ؛ وإن تعذّر فما رُسم — والحاجز الأخير
                // يبقى في القاعدة (0109) لا في هذا السطر
                pendingCount: pendingBySheet.get(sheetId) ?? sheetLists.length,
              };
              return (
                <PriceSheetCard
                  key={sheetId}
                  sheet={sheet}
                  lists={sheetLists}
                  itemsByList={itemsByList}
                  pricing={pricing}
                  returnTo={`/admin/subcontractors/${sub.id}`}
                  readOnly={!ready}
                />
              );
            })}

            {shownCards.map((list) => (
              <PriceListCard
                key={list.id}
                list={list}
                items={itemsByList.get(list.id) ?? []}
                pricing={pricing}
                returnTo={`/admin/subcontractors/${sub.id}`}
                readOnly={!ready}
              />
            ))}

            {hiddenCards > 0 && (
              <Card className="p-5 text-sm text-muted-foreground">
                و{toArabicDigits(hiddenCards)} مساراً مستقلاً آخر ينتظر قراراً كذلك — بُتّ في
                المعروض أعلاه ثم أعد تحميل الصفحة ليظهر التالي، أو افتح{" "}
                <Link href="/admin/subcontractors/reviews" className="underline">
                  طابور المراجعة
                </Link>
                .
              </Card>
            )}
          </>
        )}
      </div>

      {/*
        ── كل المسارات: جدولٌ مضغوطٌ قابلٌ للبحث ─────────────────────────────
        البحثُ يقع في Postgres (`admin_search_routes`, 0118) بتطبيع 0117 العربي،
        والاقتطاعُ و`total_count` معه. ولا شيء يُرشَّح هنا في TypeScript.
      */}
      <div className="space-y-3" id="routes">
        <div className="flex flex-wrap items-center gap-2">
          <h3 className="font-heading text-base font-bold">كل مسارات هذا المتعهد</h3>
          <HelpTip>
            كل مسار على صفٍّ واحد بخلاصة أسعاره (عدد الفئات ومدى التكلفة) — والخلاصة
            محسوبةٌ في قاعدة البيانات، فصفوفُ الأسعار لا تصل هذه الصفحة أصلاً. اضغط
            «تفصيل» لترى أسعار فئات مسارٍ واحد وسعرَ العميل المقابل لكل منها.
          </HelpTip>
          <Link
            href="/admin/subcontractors/routes"
            className="ms-auto text-sm text-primary hover:underline"
          >
            بحث في مسارات كل المتعهدين
          </Link>
        </div>

        <RouteSearchForm
          action={`/admin/subcontractors/${sub.id}`}
          query={routeQuery}
          clearHref={`/admin/subcontractors/${sub.id}#routes`}
          disabled={!routes.ready}
          label={`بحث في مسارات «${sub.companyName}»`}
        />

        {!routes.ready ? (
          <Card className="p-5 text-sm text-muted-foreground">
            بحثُ المسارات غير جاهز — الدالة <code dir="ltr">admin_search_routes</code> غير
            موجودة. نفِّذ هجرة <code dir="ltr">0118</code> ثم أعد تحميل الصفحة؛ وبقية
            الملف يعمل طبيعياً.
          </Card>
        ) : routes.rows.length === 0 ? (
          <Card className="p-5 text-sm text-muted-foreground">
            {routeQuery
              ? `لا مسار لهذا المتعهد يطابق «${routeQuery}» — جرّب جزءاً من اسم المدينة.`
              : "لا مسارات لهذا المتعهد بعد."}
          </Card>
        ) : (
          <>
            <RoutesTable
              rows={routes.rows}
              currency={currency}
              detailHref={(hit) => routesHref({ route: hit.id })}
              activeId={openRoute}
            />
            <RoutesCount shown={routes.rows.length} total={routes.total} query={routeQuery} />

            {(routeOffset > 0 || routes.total > routeOffset + routes.rows.length) && (
              <div className="flex flex-wrap items-center gap-3 text-sm">
                {routeOffset > 0 && (
                  <Link
                    href={routesHref({
                      offset: String(Math.max(0, routeOffset - ROUTES_PAGE_SIZE)),
                      route: null,
                    })}
                    className="text-primary hover:underline"
                  >
                    الصفحة السابقة
                  </Link>
                )}
                {routes.total > routeOffset + routes.rows.length && (
                  <Link
                    href={routesHref({
                      offset: String(routeOffset + ROUTES_PAGE_SIZE),
                      route: null,
                    })}
                    className="text-primary hover:underline"
                  >
                    الصفحة التالية
                  </Link>
                )}
              </div>
            )}

            {routeDetail && (
              <RouteDetailCard
                hit={routeDetail.hit}
                items={routeDetail.items}
                pricing={pricing}
                reviewHref="/admin/subcontractors/reviews"
              />
            )}
          </>
        )}
      </div>

      {/* مستندات السائقين (0120) — قراءةٌ وشهادةٌ لا إدارة سائقين، والصور
          بروابط موقَّعة تُولَّد بجلسة المشرف فالسياسة هي الحارس */}
      <DriverDocsCard subcontractorId={sub.id} />

      {/* الإجراءات — الاعتماد والإيقاف، كلاهما بخطوة تأكيد */}
      <Card className="space-y-4 p-5" id="actions">
        <div>
          <h3 className="flex items-center gap-1.5 font-heading text-base font-bold">
            <UserCog className="size-4 text-primary" />
            حالة الحساب
            <HelpTip>
              الاعتماد يفتح باب مشاركة أسعار هذا الشريك في التسعير، والإيقاف يغلقه فوراً بلا
              حذف شيء. لا تحذف متعهداً أبداً — الإيقاف يُبقي سجله وقوائمه سليمة لأي مراجعة
              مالية لاحقة.
            </HelpTip>
          </h3>
          <p className="text-sm text-muted-foreground">
            الحالة الحالية: {isSubStatus(sub.status) ? SUB_STATUS_HINTS[sub.status] : sub.status}
          </p>
        </div>

        {confirming === "approve" ? (
          <form
            action={setSubcontractorStatus.bind(null, sub.id, "approved")}
            className="space-y-3 rounded-lg border border-emerald-300 bg-emerald-50 p-4 dark:border-emerald-700 dark:bg-emerald-950"
          >
            <p className="text-sm font-semibold text-emerald-900 dark:text-emerald-100">
              تأكيد اعتماد «{sub.companyName}»
            </p>
            <p className="text-sm leading-relaxed text-emerald-900/90 dark:text-emerald-100/90">
              بعد الاعتماد تدخل أسعاره المعتمدة تسعير الرحلات المغطاة فوراً: أي رحلة تقع
              داخل نطاق إحدى قوائمه قد تُسعَّر بسعره + الهامش بدل تعريفة الكيلومتر. راجع
              قوائمه أعلاه قبل التأكيد.
            </p>
            <div className="flex flex-wrap items-center gap-3">
              <Button type="submit">
                <CheckCircle2 />
                تأكيد الاعتماد
              </Button>
              <Link
                href={`/admin/subcontractors/${sub.id}`}
                className="text-sm text-muted-foreground transition-colors hover:text-foreground hover:underline"
              >
                تراجع
              </Link>
            </div>
          </form>
        ) : confirming === "suspend" ? (
          <form
            action={setSubcontractorStatus.bind(null, sub.id, "suspended")}
            className="space-y-3 rounded-lg border border-red-300 bg-red-50 p-4 dark:border-red-700 dark:bg-red-950"
          >
            <p className="text-sm font-semibold text-red-900 dark:text-red-100">
              تأكيد إيقاف «{sub.companyName}»
            </p>
            <p className="text-sm leading-relaxed text-red-900/90 dark:text-red-100/90">
              الإيقاف يُخرج كل أسعاره من التسعير فوراً — الرحلات التي كان يغطيها ستعود إلى
              تعريفة الكيلومتر أو إلى متعهد آخر إن وُجد. بياناته وقوائمه تبقى كما هي، ويمكن
              إعادة اعتماده في أي وقت.
            </p>
            <div className="flex flex-wrap items-center gap-3">
              <Button type="submit" variant="destructive">
                <Ban />
                تأكيد الإيقاف
              </Button>
              <Link
                href={`/admin/subcontractors/${sub.id}`}
                className="text-sm text-muted-foreground transition-colors hover:text-foreground hover:underline"
              >
                تراجع
              </Link>
            </div>
          </form>
        ) : (
          <div className="flex flex-wrap items-center gap-3">
            {!isApproved && (
              <Link
                href={`/admin/subcontractors/${sub.id}?confirm=approve#actions`}
                className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
              >
                <CheckCircle2 className="size-4" />
                {isSuspended ? "إعادة الاعتماد" : "اعتماد المتعهد"}
              </Link>
            )}
            {!isSuspended && (
              <Link
                href={`/admin/subcontractors/${sub.id}?confirm=suspend#actions`}
                className="inline-flex items-center gap-1.5 rounded-lg border border-red-300 px-3 py-1.5 text-sm text-red-700 transition-colors hover:bg-red-50 dark:border-red-800 dark:text-red-300 dark:hover:bg-red-950"
              >
                <Ban className="size-4" />
                إيقاف المتعهد
              </Link>
            )}
            <HelpTip>
              خطوة تأكيد إجبارية قبل كل تغيير حالة — الاعتماد والإيقاف كلاهما يغيّر أسعاراً
              يراها العملاء في اللحظة نفسها.
            </HelpTip>
          </div>
        )}

        <Separator />

        <p className="text-xs text-muted-foreground">
          هذه الشاشة تُعرّف الشريك وتضبط مشاركته في التسعير وتعرض مقاصته. إسناد الرحلات
          (البث والقبول خلال مهلة) يُدار من شاشة «الإسناد»، وتفصيل حسابه سطراً سطراً وتسجيل
          دفعاته في «كشف الحساب».
        </p>
      </Card>
    </div>
  );
}
