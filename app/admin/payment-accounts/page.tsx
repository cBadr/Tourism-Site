import Link from "next/link";
import {
  Banknote,
  Building2,
  CreditCard,
  EyeOff,
  Percent,
  Plus,
  Power,
  PowerOff,
  Trash2,
  Wallet,
} from "lucide-react";

import { formatMoney, toArabicDigits } from "@/components/booking/format";
import { HelpTip } from "@/components/shared/HelpTip";
import { PagePulse } from "@/components/stats/page-pulse";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import type { PaymentSettings } from "@/lib/booking-types";
import type { TreasuryAccountKind } from "@/lib/finance-types";
import {
  PAYMENT_FEE_MAX_FIXED,
  PAYMENT_FEE_MAX_PERCENT,
  type PaymentFeeKind,
} from "@/lib/payment-fee-types";
import { getSettings } from "@/lib/settings";
import { readPagePulse } from "@/lib/stats/pulse";
import { createServerSupabase } from "@/lib/supabase/server";
import { cn } from "@/lib/utils";
import {
  asNumber,
  asText,
  Banners,
  COMMON_BOOKING_ERRORS,
  controlClass,
  pick,
  zonedParts,
} from "../orders/_components/booking-ui";
import {
  createAccount,
  deleteAccount,
  saveAccount,
  savePaymentSettings,
  toggleAccountActive,
} from "./actions";

/**
 * حسابات الخزينة — كل وعاء مال في المنصة صفٌّ واحد هنا: المحافظ وانستا باي
 * والحسابات البنكية التي يُحوِّل إليها العملاء، **وكذلك** النقدية وحساب تسوية
 * البوابات اللذان يحملان رصيداً بلا أن يكونا وجهةَ تحويل (المرحلة ٧).
 *
 * قاعدتان تحكمان الشاشة:
 * ١) **الحدود تُفرض في قاعدة البيانات لا هنا**: دالة `available_payment_accounts`
 *    هي التي تقرر أي حساب يظهر للعميل، والحساب الذي بلغ حده يختفي من صفحة
 *    التحويل تلقائياً. هذه الشاشة تعرض نفس أرقام القاعدة (المتبقي من الحد).
 * ٢) **الظهور للعميل مفتاح مستقل عن النوع تماماً**: `customer_facing` وحده هو ما
 *    ترشِّح به `payment_accounts_within_caps` — لا قائمةَ أنواع مسموحة في أي طبقة.
 *    فأيّ وعاء يختاره بدر يظهر، وأيّ وعاء يطفئه يختفي، ورصيده وقيوده تبقى في
 *    الخزينة وكشف التدفق النقدي كما هي في الحالين.
 *
 * والاستثناءان الوحيدان، وكلاهما مُعلَن لا صامت:
 * - **النقدية**: تُسلَّم يداً بيد فلا معنى لها وجهةَ تحويل — الخانة **معطّلة**
 *   في الشاشة والقيمة محسومة على الخادم (`actions.ts`)، والنصفان معاً.
 * - **حساب تسوية بوابات الدفع**: محجوب **بنيوياً في القاعدة** (مُشغّل الهجرة
 *   `0060`)، ومقبضه معرّف داخلي لا رقم يُحوَّل إليه.
 *
 * ٣) **عمولة التحويل طبقةٌ على الفاتورة لا على السعر** (ن‑١، الهجرة `0066`):
 *    مبلغٌ ثابت أو نسبة تُضاف إلى ما يحوّله العميل، **ولا تدخل `bookings.total`
 *    بحرف** — فمستحق المتعهد وهامش الصفقة وسقف موجات البث وكسب نقاط الولاء لا
 *    يتحرك منها شيء، لا بانضباطٍ في أربعة مواضع بل لأن العمولة ليست هناك أصلاً.
 *    وتُجمَّد مع الحجز، ومداها قيدٌ في الجدول. العقد: `lib/payment-fee-types.ts`.
 *
 * لا مبلغ واحد يُحسب في هذا الملف — كل رقم يصل جاهزاً من Postgres.
 */

export const metadata = { title: "حسابات الدفع" };

const hasSupabaseEnv = () =>
  Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);

/** أنواع حسابات الخزينة كما في عقد `lib/finance-types.ts` — لا تُشتق محلياً */
const KIND_LABELS: Record<TreasuryAccountKind, string> = {
  wallet: "محفظة إلكترونية",
  instapay: "انستا باي",
  card: "بطاقة / بوابة دفع",
  cash: "نقدية",
  bank: "حساب بنكي",
};

const KIND_HANDLE_HINT: Record<TreasuryAccountKind, string> = {
  wallet: "رقم المحفظة كما يكتبه العميل في تطبيق التحويل (مثال: 01xxxxxxxxx).",
  instapay: "عنوان انستا باي المستقبل (مثال: name@instapay).",
  card: "معرّف حساب البوابة أو آخر أرقام البطاقة — للتمييز الداخلي بين أكثر من حساب.",
  cash: "اسم مميّز للدرج النقدي (مثال: خزنة المكتب) — لا يراه عميل، فاكتب ما يفيدك أنت.",
  bank: "رقم الحساب أو الآيبان — يُعرض للعميل حرفياً إن فعّلت «يظهر للعملاء» على هذا الحساب.",
};

/**
 * الأنواع التي تصلح وجهةَ تحويل يحوّل إليها العميل من تطبيقه — والنقدية وحدها
 * خارجها لأنها تُسلَّم يداً بيد. **وهذه ليست قائمة ترشيح للعميل**: الترشيح
 * `customer_facing` وحده في SQL، وهذه تحكم تعطيل الخانة في هذه الشاشة فقط.
 */
const TRANSFERABLE_KINDS: TreasuryAccountKind[] = ["wallet", "instapay", "card", "bank"];

/** ترتيب عرض الأنواع في القائمة */
const KIND_ORDER: TreasuryAccountKind[] = ["wallet", "instapay", "card", "bank", "cash"];

const KIND_ICON: Record<TreasuryAccountKind, typeof Wallet> = {
  wallet: Wallet,
  instapay: CreditCard,
  card: CreditCard,
  cash: Banknote,
  bank: Building2,
};

/** نسبة الاقتراب التي تُظهر التحذير */
const WARN_AT = 80;

type AccountRow = {
  id: string;
  kind: TreasuryAccountKind;
  label: string;
  handle: string;
  holderName: string | null;
  openingBalance: number;
  dailyCap: number | null;
  monthlyCap: number | null;
  active: boolean;
  sort: number;
  /** يظهر للعميل في صفحة التحويل — المفتاح الذي تقرأه `available_payment_accounts` */
  customerFacing: boolean;
  /** عمولة التحويل (الهجرة `0066`) — تُضاف لفاتورة العميل ولا تمسّ سعر الرحلة */
  feeKind: PaymentFeeKind;
  feeValue: number;
  /**
   * مرتبطٌ بمزوّد دفع (‏`payment_providers.account_id`) — وعاءُ تسويةٍ لا وجهةُ
   * تحويل. يُقرأ من الجدول لا من مقبض محفور، كحارسَي `0060` و`0066` تماماً.
   */
  gatewayPot: boolean;
};

type Usage = { day: number | null; month: number | null };

const isKind = (v: unknown): v is TreasuryAccountKind =>
  typeof v === "string" && (KIND_ORDER as string[]).includes(v);

/** بداية اليوم وبداية الشهر بتوقيت القاهرة كسلسلتَي ISO — نافذة الاحتياط فقط */
function cairoWindows(): { dayStart: string; monthStart: string } {
  const now = new Date();
  const p = zonedParts(now);
  // إزاحة القاهرة عن UTC لحظة الآن = (الساعة المحلية معبَّراً عنها كـ UTC) − اللحظة الفعلية
  const asUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
  const offset = asUtc - Math.floor(now.getTime() / 1000) * 1000;
  const dayStart = new Date(Date.UTC(p.year, p.month - 1, p.day) - offset);
  const monthStart = new Date(Date.UTC(p.year, p.month - 1, 1) - offset);
  return { dayStart: dayStart.toISOString(), monthStart: monthStart.toISOString() };
}

/**
 * المستلَم لكل حساب — كل الأرقام تأتي محسوبة من Postgres:
 *  ١) المصدر المعتمد: `available_payment_accounts(0)` وهي نفس الدالة التي تحكم ظهور
 *     الحساب للعميل، فترجع المتبقي من كل حد بنافذته الحقيقية المعرَّفة في SQL.
 *  ٢) الاحتياط عند غياب الدالة أو للحسابات بلا حد: تجميع `sum()` في القاعدة عبر PostgREST.
 * لا يُجمع أي مبلغ في TypeScript.
 */
async function loadUsage(
  supabase: NonNullable<Awaited<ReturnType<typeof createServerSupabase>>>,
  accounts: AccountRow[]
): Promise<{ usage: Map<string, Usage>; source: "sql" | "none" }> {
  const usage = new Map<string, Usage>();
  const { dayStart, monthStart } = cairoWindows();

  // `.eq("status","approved")` ليس تفصيلاً: `available_payment_accounts` تحسب
  // الحد من المدفوعات المعتمدة وحدها، فاحتياطٌ يجمع المعلّقة والمرفوضة معها
  // كان يعرض على المدير رقماً أعلى من الرقم الذي يخفي الحساب فعلاً.
  const [rpcRes, dayRes, monthRes] = await Promise.all([
    supabase.rpc("available_payment_accounts", { p_amount: 0 }),
    supabase
      .from("payments")
      .select("account_id, received:amount.sum()")
      .eq("status", "approved")
      .gte("created_at", dayStart),
    supabase
      .from("payments")
      .select("account_id, received:amount.sum()")
      .eq("status", "approved")
      .gte("created_at", monthStart),
  ]);

  const sums = (res: { data: unknown; error: unknown }): Map<string, number> | null => {
    if (res.error || !Array.isArray(res.data)) return null;
    const out = new Map<string, number>();
    for (const row of res.data as Record<string, unknown>[]) {
      const id = asText(row.account_id);
      const value = asNumber(row.received);
      if (id && value !== null) out.set(id, value);
    }
    return out;
  };

  // null = التجميع غير متاح (الجدول غائب أو دوال التجميع مغلقة)؛ Map فارغة = صفر فعلي
  const daySums = sums(dayRes);
  const monthSums = sums(monthRes);

  const headroom = new Map<string, { day: number | null; month: number | null }>();
  if (!rpcRes.error && Array.isArray(rpcRes.data)) {
    for (const row of rpcRes.data as Record<string, unknown>[]) {
      const id = asText(row.id);
      if (!id) continue;
      headroom.set(id, {
        day: asNumber(pick(row, ["daily_headroom", "dailyHeadroom"])),
        month: asNumber(pick(row, ["monthly_headroom", "monthlyHeadroom"])),
      });
    }
  }

  const anySql = headroom.size > 0 || daySums !== null || monthSums !== null;

  /** المستلَم = الحد ناقص المتبقي الذي أعادته الدالة (كلاهما رقم من القاعدة) */
  const fromHeadroom = (cap: number | null, remaining: number | null | undefined) =>
    cap !== null && remaining !== null && remaining !== undefined ? cap - remaining : null;

  /** غياب الحساب من نتيجة التجميع يعني صفراً — الصف لم يُنشأ لأن لا مدفوعات في النافذة */
  const fromSums = (sums: Map<string, number> | null, id: string) =>
    sums === null ? null : (sums.get(id) ?? 0);

  for (const account of accounts) {
    const hr = headroom.get(account.id);
    usage.set(account.id, {
      day: fromHeadroom(account.dailyCap, hr?.day) ?? fromSums(daySums, account.id),
      month: fromHeadroom(account.monthlyCap, hr?.month) ?? fromSums(monthSums, account.id),
    });
  }

  return { usage, source: anySql ? "sql" : "none" };
}

/** الأعمدة المشتركة قبل المرحلة ٧ وبعدها */
const LEGACY_COLUMNS =
  "id, kind, label, handle, holder_name, opening_balance, daily_cap, monthly_cap, active, sort";
/** نفسها + مفتاح الظهور للعميل الذي تضيفه هجرة المرحلة ٧ */
const TREASURY_COLUMNS = `${LEGACY_COLUMNS}, customer_facing`;
/** ونفسها + عمودا العمولة اللذان تضيفهما هجرة `0066` */
const FEE_COLUMNS = `${TREASURY_COLUMNS}, fee_kind, fee_value`;

const isFeeKind = (v: unknown): v is PaymentFeeKind =>
  v === "none" || v === "fixed" || v === "percent";

async function loadAccounts(): Promise<{
  accounts: AccountRow[];
  usage: Map<string, Usage>;
  usageReady: boolean;
  currency: string;
  ready: boolean;
  /** عمود `customer_facing` موجود — أي أن هجرة الخزينة (المرحلة ٧) مطبَّقة */
  treasuryReady: boolean;
  /** عمودا العمولة موجودان — أي أن هجرة `0066` مطبَّقة */
  feeReady: boolean;
}> {
  const blank = {
    accounts: [] as AccountRow[],
    usage: new Map<string, Usage>(),
    usageReady: false,
    currency: "EGP",
    ready: false,
    treasuryReady: false,
    feeReady: false,
  };

  const supabase = await createServerSupabase();
  if (!supabase) return blank;

  const order = (q: ReturnType<ReturnType<typeof supabase.from>["select"]>) =>
    q.order("sort", { ascending: true }).order("label", { ascending: true });

  // رمز العملة من قاعدة البيانات لا من الكود — نفس مصدر بقية أسعار الموقع.
  // وحسابات تسوية المزوّدين تُقرأ من `payment_providers` لا من مقبض محفور:
  // بها تُعطَّل خانة العمولة على الوعاء الذي يرفضها المُشغّل أصلاً، فلا يقع
  // المالك على رفضٍ لم تحذّره منه الشاشة.
  const [feeRes, currencyRes, providerRes] = await Promise.all([
    order(supabase.from("payment_accounts").select(FEE_COLUMNS)),
    supabase.from("pricing_settings").select("currency").limit(1).maybeSingle(),
    supabase.from("payment_providers").select("account_id"),
  ]);

  const currency =
    (!currencyRes.error && asText(currencyRes.data?.currency)) || blank.currency;

  const gatewayPots = new Set<string>();
  if (!providerRes.error && Array.isArray(providerRes.data)) {
    for (const row of providerRes.data as Record<string, unknown>[]) {
      const id = asText(row.account_id);
      if (id) gatewayPots.add(id);
    }
  }

  /**
   * تدهور رشيق حول هجرتين (‏`0015` ثم `0066`): طلب عمود غير موجود يُفشل
   * الاستعلام كله، فتصير الشاشة للقراءة فقط بلا سبب. نتراجع من الأحدث إلى
   * الأقدم ونطفئ ما يخصّ كل هجرة وحدها.
   */
  const feeReady = !feeRes.error;
  const treasuryRes = feeReady
    ? feeRes
    : await order(supabase.from("payment_accounts").select(TREASURY_COLUMNS));
  const treasuryReady = !treasuryRes.error;
  const res = treasuryReady
    ? treasuryRes
    : await order(supabase.from("payment_accounts").select(LEGACY_COLUMNS));

  if (res.error) return { ...blank, currency };

  const accounts = ((res.data ?? []) as Record<string, unknown>[]).map((row) => {
    const kind: TreasuryAccountKind = isKind(row.kind) ? row.kind : "wallet";
    const flag = pick(row, ["customer_facing", "customerFacing"]);
    const feeKind = pick(row, ["fee_kind", "feeKind"]);
    const id = String(row.id);
    return {
      id,
      kind,
      label: asText(row.label) ?? "—",
      handle: asText(row.handle) ?? "",
      holderName: asText(row.holder_name),
      openingBalance: asNumber(row.opening_balance) ?? 0,
      dailyCap: asNumber(row.daily_cap),
      monthlyCap: asNumber(row.monthly_cap),
      active: row.active === true,
      sort: asNumber(row.sort) ?? 0,
      // قبل هجرة `0015` لا عمود ولا دالةَ ترشيح به، وقيدُ `kind` يومها لا يقبل
      // إلا `wallet`/`instapay` — أي أن كل صف قائم كان معروضاً للعميل فعلاً.
      // فالاحتياطي `true` وصفٌ لتلك القاعدة لا حكمٌ بالنوع، ولا يُنفَّذ على قاعدة
      // فيها العمود (وهي كل قاعدة منذ المرحلة ٧).
      customerFacing: typeof flag === "boolean" ? flag : true,
      // واحتياطي العمولة `none` لأن القاعدة بلا العمود قاعدةٌ **بلا عمولات**
      // أصلاً — لا حساب يحملها ولا لقطةَ حجز تعرفها
      feeKind: isFeeKind(feeKind) ? feeKind : ("none" as PaymentFeeKind),
      feeValue: asNumber(pick(row, ["fee_value", "feeValue"])) ?? 0,
      gatewayPot: gatewayPots.has(id),
    };
  });

  const { usage, source } = await loadUsage(supabase, accounts);
  return {
    accounts,
    usage,
    usageReady: source === "sql",
    currency,
    ready: true,
    treasuryReady,
    feeReady,
  };
}

const ERROR_MESSAGES: Record<string, string> = {
  ...COMMON_BOOKING_ERRORS,
  kind: "نوع الحساب غير معروف — اختر نوعاً من القائمة.",
  label: "اسم الحساب حقل إلزامي.",
  handle: "الرقم أو العنوان أو البيان المميّز حقل إلزامي.",
  amount: "المبالغ والحدود يجب أن تكون أرقاماً غير سالبة.",
  sort: "ترتيب العرض يجب أن يكون عدداً صحيحاً غير سالب.",
  exists: "يوجد حساب آخر بنفس النوع ونفس الرقم/العنوان — الرقم الواحد لا يتكرر داخل النوع نفسه.",
  inuse: "لا يمكن حذف حساب استُقبلت عليه مدفوعات — أوقفه بدل حذفه حتى يبقى سجله المالي سليماً.",
  kindnew:
    "نوعا «نقدية» و«حساب بنكي» (و«بطاقة») يحتاجان هجرة المرحلة ٧ — نفِّذ 0015 من supabase/migrations ثم أعد المحاولة. الحساب لم يُحفظ ولم يتغير شيء.",
  gateway:
    "حساب تسوية بوابات الدفع لا يُعرض على العملاء: مقبضه معرّف داخلي لا رقم يُحوَّل إليه، وكل المزوّدين مرتبطون به. لعرض وجهة تحويل جديدة أضف حساباً مستقلاً — محفظة أو انستا باي أو حساب بنكي — وفعّل «يظهر للعملاء» عليه. لم يتغير شيء.",
  feekind: "نوع العمولة غير معروف — اختر «بلا عمولة» أو «مبلغ ثابت» أو «نسبة».",
  feevalue: `قيمة العمولة يجب أن تكون رقماً غير سالب، والمبلغ الثابت لا يتجاوز ${PAYMENT_FEE_MAX_FIXED}.`,
  feepercent: `نسبة العمولة لا تتجاوز ${PAYMENT_FEE_MAX_PERCENT}٪ — النسبة تُحسب من إجمالي الرحلة.`,
  feebound:
    "قاعدة البيانات رفضت قيمة العمولة: النسبة بين صفر ومئة، والمبلغ الثابت غير سالب، و«بلا عمولة» قيمتها صفر. لم يتغير شيء.",
  feedead:
    "لا تُضبط عمولة على هذا الحساب: النقدية تُسلَّم يداً بيد، وحساب تسوية بوابات الدفع مقبضه معرّف داخلي — وكلاهما لا يظهر للعميل في صفحة التحويل، فالعمولة عليه لن تصل أحداً. اضبطها على حساب يظهر للعملاء. لم يتغير شيء.",
};

/** شريط استهلاك حد واحد — الأرقام تصل محسوبة من القاعدة والعرض فقط هنا */
function CapMeter({
  title,
  received,
  cap,
  currency,
  help,
}: {
  title: string;
  received: number | null;
  cap: number | null;
  currency: string;
  help: string;
}) {
  if (cap === null) {
    return (
      <div className="space-y-1">
        <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
          {title}
          <HelpTip>{help}</HelpTip>
          <Badge variant="outline" className="ms-auto">
            بلا حد
          </Badge>
        </div>
        <p className="text-sm">
          المستلَم:{" "}
          <span dir="ltr" className="font-medium">
            {received === null ? "—" : formatMoney(received, currency)}
          </span>
        </p>
      </div>
    );
  }

  const percent =
    received !== null && cap > 0 ? Math.min(100, Math.round((received / cap) * 100)) : 0;
  const saturated = received !== null && received >= cap;
  const warning = received !== null && percent >= WARN_AT;

  return (
    <div className="space-y-1">
      <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
        {title}
        <HelpTip>{help}</HelpTip>
        <span className="ms-auto" dir="ltr">
          {received === null ? "—" : `${toArabicDigits(percent)}٪`}
        </span>
      </div>
      <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
        <div
          className={cn(
            "h-full rounded-full transition-all",
            saturated ? "bg-red-500" : warning ? "bg-amber-500" : "bg-primary"
          )}
          style={{ width: `${percent}%` }}
        />
      </div>
      <p className="text-sm">
        <span dir="ltr" className="font-medium">
          {received === null ? "—" : formatMoney(received, currency)}
        </span>{" "}
        <span className="text-muted-foreground">من</span>{" "}
        <span dir="ltr">{formatMoney(cap, currency)}</span>
      </p>
      {saturated ? (
        <p className="text-xs font-medium text-red-700 dark:text-red-300">
          بلغ الحد — هذا الحساب مخفي عن العملاء الآن تلقائياً.
        </p>
      ) : warning ? (
        <p className="text-xs font-medium text-amber-700 dark:text-amber-300">
          اقترب من الحد — جهّز حساباً بديلاً قبل أن يختفي من خيارات العميل.
        </p>
      ) : null}
    </div>
  );
}

function NumberField({
  id,
  label,
  name,
  defaultValue,
  help,
  disabled,
  placeholder,
  step = "1",
  min = 0,
}: {
  id: string;
  label: string;
  name: string;
  defaultValue?: number | null;
  help?: string;
  disabled?: boolean;
  placeholder?: string;
  step?: string;
  min?: number;
}) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id} className="flex items-center gap-1.5">
        {label}
        {help ? <HelpTip>{help}</HelpTip> : null}
      </Label>
      <Input
        id={id}
        name={name}
        type="number"
        inputMode="decimal"
        dir="ltr"
        step={step}
        min={min}
        placeholder={placeholder}
        defaultValue={defaultValue ?? ""}
        disabled={disabled}
      />
    </div>
  );
}

function TextField({
  id,
  label,
  name,
  defaultValue,
  placeholder,
  help,
  dir = "rtl",
  disabled,
  required,
}: {
  id: string;
  label: string;
  name: string;
  defaultValue?: string | null;
  placeholder?: string;
  help?: string;
  dir?: "rtl" | "ltr";
  disabled?: boolean;
  required?: boolean;
}) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id} className="flex items-center gap-1.5">
        {label}
        {help ? <HelpTip>{help}</HelpTip> : null}
      </Label>
      <Input
        id={id}
        name={name}
        dir={dir}
        defaultValue={defaultValue ?? ""}
        placeholder={placeholder}
        disabled={disabled}
        required={required}
      />
    </div>
  );
}

function KindField({
  id,
  name,
  defaultValue,
  disabled,
  treasuryReady,
}: {
  id: string;
  name: string;
  defaultValue?: TreasuryAccountKind;
  disabled?: boolean;
  /** قبل هجرة المرحلة ٧ لا تقبل القاعدة الأنواع الداخلية — فلا تُعرض خياراً كاذباً */
  treasuryReady: boolean;
}) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id} className="flex items-center gap-1.5">
        نوع الحساب
        <HelpTip>
          النوع يصف <span className="font-semibold">الوعاء</span> ويحدد التعليمات التي يقرأها
          العميل عند التحويل: المحفظة برقم موبايل، وانستا باي بعنوان حساب، والحساب البنكي
          برقم حساب أو آيبان، والبطاقة عبر بوابة. أما{" "}
          <span className="font-semibold">ظهوره أمام العميل فيقرره مفتاح «يظهر للعملاء» أدناه لا النوع</span>
          . والنقدية وحدها خارج ذلك: تُسلَّم يداً بيد فلا تصلح وجهةَ تحويل، وتبقى مع ذلك
          حساباً كامل الأثر في الخزينة.
        </HelpTip>
      </Label>
      <select
        id={id}
        name={name}
        defaultValue={defaultValue ?? "wallet"}
        disabled={disabled}
        className={controlClass}
      >
        <optgroup label="يصلح وجهةَ تحويل — تقرر ظهوره بالمفتاح أدناه">
          {KIND_ORDER.filter((k) => TRANSFERABLE_KINDS.includes(k)).map((k) => (
            <option key={k} value={k} disabled={!treasuryReady && k !== "wallet" && k !== "instapay"}>
              {KIND_LABELS[k]}
            </option>
          ))}
        </optgroup>
        <optgroup
          label={treasuryReady ? "نقدية — لا تُعرض على عميل" : "نقدية (تحتاج هجرة المرحلة ٧)"}
        >
          {KIND_ORDER.filter((k) => !TRANSFERABLE_KINDS.includes(k)).map((k) => (
            <option key={k} value={k} disabled={!treasuryReady}>
              {KIND_LABELS[k]}
            </option>
          ))}
        </optgroup>
      </select>
    </div>
  );
}

/**
 * مفتاح «يظهر للعملاء» — الحقل الوحيد في الشاشة الذي يقرأه العميل غير مباشرة،
 * و**هو وحده** ما ترشّح به `payment_accounts_within_caps` في القاعدة. لا قائمة
 * أنواع مسموحة في أي طبقة: محفظةً كان الحساب أو انستا باي أو بنكاً، تشغيلُ
 * المفتاح يُظهره في صفحة التحويل وإطفاؤه يخفيه — والرصيد والقيود والكشوف كما
 * هي في الحالين. ولا علاقة له بـ«نشط»: المتوقف خارج الخدمة كلها.
 *
 * والنقدية وحدها تصل بخانة **معطّلة** — لأن المال النقدي يُسلَّم يداً بيد فلا
 * يُحوَّل إليه من تطبيق. والتعطيل هنا نصفٌ، ونصفه الثاني في `actions.ts`؛
 * ⚠ **لا يُنقض أحد النصفين وحده**: خانةٌ يقبلها المتصفح ويقسرها الخادم بصمت
 * هي بعينها العيب الذي صار الحساب البنكي ضحيته حتى 2026-08-16.
 */
function CustomerFacingField({
  id,
  name,
  defaultChecked,
  disabled,
  treasuryReady,
  /** نوع الحساب — النقدية وحدها تُعطَّل، وغيابه يعني نموذج «إضافة حساب» (يبدأ محفظةً) */
  kind = "wallet",
}: {
  id: string;
  name: string;
  defaultChecked: boolean;
  disabled?: boolean;
  treasuryReady: boolean;
  kind?: TreasuryAccountKind;
}) {
  const cashOnly = !TRANSFERABLE_KINDS.includes(kind);

  return (
    <div className="space-y-1">
      <Label
        htmlFor={id}
        className={cn(
          "flex w-fit items-center gap-2 text-sm font-normal",
          cashOnly ? "cursor-not-allowed opacity-60" : "cursor-pointer"
        )}
      >
        <input
          id={id}
          type="checkbox"
          name={name}
          // ⚠ يُعرض **الواقع** لا ما نتمناه: صفُّ نقدية بمفتاح مشغَّل (لا يصنعه
          // هذا النموذج، لكن SQL مباشرة تصنعه) **يظهر للعميل فعلاً** لأن الترشيح
          // في القاعدة لا يعرف النوع. فإخفاؤه هنا كذبةٌ في الاتجاه الخطر، وحفظُ
          // البطاقة هو ما يصحّحه.
          defaultChecked={defaultChecked}
          disabled={disabled || !treasuryReady || cashOnly}
          className="size-4 accent-primary"
        />
        يظهر للعملاء في صفحة التحويل
        <HelpTip>
          هذا المفتاح — <span className="font-semibold">لا نوع الحساب</span> — هو ما يقرر ظهور
          الحساب في صفحة التحويل أمام العميل. فعّله على أي حساب تريد أن يحوّل إليه العملاء:
          محفظة أو انستا باي أو{" "}
          <span className="font-semibold">حساب بنكي</span>. وأطفئه على ما تريد إخفاءه مع إبقاء
          حركته المالية مسجَّلة: تُقيَّد عليه المصروفات ودفعات المتعهدين والتسويات، ويدخل في
          التدفق النقدي وكشف الخزينة كأي حساب آخر.
        </HelpTip>
      </Label>
      {cashOnly && (
        <p className="text-xs text-muted-foreground">
          النقدية تُسلَّم يداً بيد فلا تصلح وجهةَ تحويل — ورصيدها وحركاتها تعمل بالكامل في
          شاشة الخزينة.
        </p>
      )}
      {!treasuryReady && (
        <p className="text-xs text-muted-foreground">
          يُفعَّل بعد تنفيذ هجرة المرحلة ٧ (<code dir="ltr">0015</code>) التي تضيف عمود{" "}
          <code dir="ltr">customer_facing</code>.
        </p>
      )}
    </div>
  );
}

/**
 * عمولة التحويل على هذا الحساب (ن‑١، الهجرة `0066`) — **الحقل الثاني في هذه
 * الشاشة الذي يصل جيب العميل**، وأول ما يجب أن يُفهم عنه أنه **ليس سعراً**:
 *
 * - العمولة **تُضاف إلى فاتورة العميل** ولا تدخل `bookings.total` بحرف. فسعر
 *   الرحلة الذي يراه في نتائج البحث، ومستحق المتعهد، وسقف موجة البث، وهامش
 *   الصفقة، وكسب نقاط الولاء — **كلها لا تتحرك** مهما بلغت العمولة.
 * - وتُجمَّد مع الحجز: رفعُها غداً لا يغيّر ما رآه عميلٌ حجز اليوم ولم يدفع بعد.
 * - والحساب في Postgres لا هنا (**D-05**): هذه الشاشة تكتب النوع والقيمة فقط.
 *
 * والحدّ الحقيقي قيدٌ في الجدول لا تحقق نموذج: نسبةٌ فوق المئة أو مبلغٌ سالب
 * **مستحيلان** على مستوى الصف، ومن يكتب من محرر SQL يقع على القيد نفسه.
 *
 * ⚠ والنقدية ووعاء تسوية البوابات يصلان **معطَّلَين مع سطر يقول لماذا** —
 * والقاعدة ترفضهما برمز `TR002` لو التفّ عليهما نموذجٌ مُلفَّق. النصفان معاً،
 * كخانة «يظهر للعملاء» حرفياً: خانةٌ يقبلها المتصفح ويقسرها الخادم بصمت هي
 * العيب الذي عاش عليه الحساب البنكي حتى 2026-08-16.
 */
function FeeField({
  idBase,
  namePrefix,
  kind,
  value,
  currency,
  disabled,
  feeReady,
  accountKind = "wallet",
  gatewayPot = false,
}: {
  idBase: string;
  namePrefix: string;
  kind: PaymentFeeKind;
  value: number;
  currency: string;
  disabled?: boolean;
  /** هجرة `0066` مطبَّقة — وإلا فالحقلان معطَّلان مع سبب مكتوب */
  feeReady: boolean;
  accountKind?: TreasuryAccountKind;
  gatewayPot?: boolean;
}) {
  const dead = accountKind === "cash" || gatewayPot;
  const off = disabled || !feeReady || dead;

  return (
    <div className="flex flex-col gap-2 rounded-lg border border-border/70 bg-muted/30 p-3">
      <p className="flex items-center gap-1.5 text-sm font-medium">
        <Percent className="size-4 text-primary" />
        عمولة التحويل على هذا الحساب
        <HelpTip>
          مبلغ ثابت أو نسبة من إجمالي الرحلة،{" "}
          <span className="font-semibold">تُضاف إلى ما يحوّله العميل</span> ويراها سطراً مستقلاً
          في صفحة حجزه قبل أن يدفع. مثال: فودافون كاش <span dir="ltr">+١</span> وانستا باي{" "}
          <span dir="ltr">+٢٠</span>.
          <br />
          <span className="font-semibold">ولا تمسّ سعر الرحلة</span>: مستحق المتعهد وهامش الصفقة
          وسقف عروض البث ونقاط الولاء تبقى كما هي بالضبط — العمولة على الفاتورة لا على السعر.
          <br />
          وتُجمَّد مع الحجز: تعديلها اليوم لا يغيّر حجزاً قائماً لم يُدفع بعد.
        </HelpTip>
      </p>

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor={`${idBase}-fee-kind`}>نوع العمولة</Label>
          <select
            id={`${idBase}-fee-kind`}
            name={`${namePrefix}fee_kind`}
            defaultValue={kind}
            disabled={off}
            className={controlClass}
          >
            <option value="none">بلا عمولة</option>
            <option value="fixed">مبلغ ثابت ({currency})</option>
            <option value="percent">نسبة من إجمالي الرحلة (٪)</option>
          </select>
        </div>
        <NumberField
          id={`${idBase}-fee-value`}
          label="القيمة"
          name={`${namePrefix}fee_value`}
          defaultValue={value}
          disabled={off}
          step="0.01"
          placeholder="0"
          help={`مع «مبلغ ثابت» اكتبها بالـ${currency}، ومع «نسبة» اكتبها رقماً مئوياً (٢ تعني ٢٪، وأقصاها ${PAYMENT_FEE_MAX_PERCENT}). ومع «بلا عمولة» تُحفظ صفراً مهما كتبت.`}
        />
      </div>

      {dead && feeReady && (
        <p className="text-xs leading-5 text-muted-foreground">
          {accountKind === "cash"
            ? "النقدية لا تظهر في صفحة التحويل، فعمولتها لن تصل عميلاً — والقاعدة ترفضها."
            : "هذا حساب تسوية بوابات الدفع: العميل لا يحوّل إليه ولا يراه، فعمولته لن تصل أحداً — والقاعدة ترفضها."}
        </p>
      )}
      {!feeReady && (
        <p className="text-xs leading-5 text-muted-foreground">
          يُفعَّل بعد تنفيذ هجرة <code dir="ltr">0066</code> التي تضيف عمودَي{" "}
          <code dir="ltr">fee_kind</code> و<code dir="ltr">fee_value</code>.
        </p>
      )}
    </div>
  );
}

/**
 * بطاقة إعدادات الدفع — مفتاح `payment` في `site_settings`.
 * القيم هنا تحكم رقمين يراهما العميل مباشرة: «المطلوب تحويله الآن» و«المتبقي مع
 * السائق». الحساب نفسه يجري في Postgres داخل `create_booking`، وهذه الشاشة تضبط
 * المدخلات فقط — فلا رقم مالي واحد يُحسب في هذه الصفحة.
 */
function PaymentSettingsCard({
  settings,
  currency,
  readOnly,
}: {
  settings: PaymentSettings;
  currency: string;
  readOnly: boolean;
}) {
  return (
    <form action={readOnly ? undefined : savePaymentSettings}>
      <Card className="space-y-4 p-5">
        <div>
          <h3 className="flex items-center gap-1.5 font-heading text-base font-bold">
            <Percent className="size-4 text-primary" />
            العربون وتعليمات التحويل
            <HelpTip>
              في خطوة الدفع يختار العميل بين «كامل المبلغ» و«عربون». عند اختيار العربون
              يطلب منه النظام{" "}
              <span className="font-semibold">
                النسبة المئوية أدناه أو الحد الأدنى، أيهما أكبر
              </span>
              ، وبحد أقصى إجمالي الرحلة (لا عربون يفوق السعر). الباقي يظهر له «يُحصَّل مع
              السائق». هذه القاعدة منفَّذة داخل قاعدة البيانات لحظة الحجز.
            </HelpTip>
          </h3>
          <p className="text-sm text-muted-foreground">
            تسري على الحجوزات الجديدة فقط — الحجوزات القائمة تحتفظ بالمبالغ المحسوبة لحظة
            إنشائها.
          </p>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <NumberField
            id="payment-deposit-percent"
            label="نسبة العربون (٪)"
            name="payment.depositPercent"
            defaultValue={settings.depositPercent}
            disabled={readOnly}
            step="1"
            help="نسبة مئوية من إجمالي الرحلة. القيم خارج المجال ٠–١٠٠ تُحصر داخله قبل الحفظ. الصفر يعني أن العربون هو الحد الأدنى وحده."
          />
          <NumberField
            id="payment-deposit-min"
            label={`الحد الأدنى للعربون (${currency})`}
            name="payment.depositMinAmount"
            defaultValue={settings.depositMinAmount}
            disabled={readOnly}
            step="0.01"
            help="أقل مبلغ يُقبل كعربون مهما صغرت الرحلة — يمنع أن يتحول العربون إلى مبلغ رمزي لا يغطي شيئاً. إن كان أكبر من إجمالي الرحلة طُلب الإجمالي كاملاً."
          />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="payment-instructions" className="flex items-center gap-1.5">
            تعليمات التحويل
            <HelpTip>
              فقرة قصيرة يقرأها العميل فوق أرقام الحسابات في صفحة متابعة حجزه. اكتبها بلغة
              مطمئنة تشرح الخطوة التالية ومدة المراجعة. اتركها فارغة ليعود النص الافتراضي.
            </HelpTip>
          </Label>
          <textarea
            id="payment-instructions"
            name="payment.transferInstructions"
            rows={3}
            disabled={readOnly}
            defaultValue={settings.transferInstructions}
            className={cn(controlClass, "resize-y leading-relaxed")}
          />
        </div>

        <div className="flex justify-end">
          <Button type="submit" disabled={readOnly}>
            حفظ إعدادات الدفع
          </Button>
        </div>
      </Card>
    </form>
  );
}

function AccountCard({
  account,
  usage,
  usageReady,
  currency,
  readOnly,
  confirmingDelete,
  treasuryReady,
  feeReady,
}: {
  account: AccountRow;
  usage: Usage | undefined;
  usageReady: boolean;
  currency: string;
  readOnly: boolean;
  confirmingDelete: boolean;
  treasuryReady: boolean;
  feeReady: boolean;
}) {
  const f = (field: string) => `acc-${account.id}-${field}`;
  const KindIcon = KIND_ICON[account.kind];

  return (
    <Card className="space-y-4 p-5">
      <div className="flex flex-wrap items-center gap-2">
        <KindIcon className="size-4 text-primary" />
        <h3 className="font-heading text-base font-bold">{account.label}</h3>
        <code dir="ltr" className="text-xs text-muted-foreground">
          {account.handle}
        </code>
        <Badge variant="secondary">{KIND_LABELS[account.kind]}</Badge>
        <Badge variant={account.active ? "default" : "secondary"}>
          {account.active ? "نشط" : "متوقف"}
        </Badge>
        {!account.customerFacing && (
          <Badge
            variant="outline"
            className="gap-1 border-slate-300 bg-slate-100 text-slate-900 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-100"
          >
            <EyeOff className="size-3" />
            لا يظهر للعملاء
          </Badge>
        )}
        <form action={readOnly ? undefined : toggleAccountActive.bind(null, account.id)} className="ms-auto">
          <Button
            type="submit"
            variant="ghost"
            size="sm"
            disabled={readOnly}
            title={
              account.active
                ? "إيقاف الحساب: يختفي من خيارات التحويل أمام العملاء فوراً"
                : "تفعيل الحساب: يعود للظهور أمام العملاء ما لم يكن قد بلغ حده"
            }
          >
            {account.active ? <PowerOff /> : <Power />}
            {account.active ? "إيقاف" : "تفعيل"}
          </Button>
        </form>
      </div>

      {/* استهلاك الحدود — أرقام قادمة من قاعدة البيانات */}
      {!account.customerFacing && (
        <p className="text-xs leading-relaxed text-muted-foreground">
          هذا الحساب لا يظهر للعملاء، فالحدود أدناه لا أثر لها عليه — وظيفتها إخفاؤه من صفحة
          التحويل عند بلوغها وهو مخفيٌّ أصلاً. رصيده وحركاته تظهر كاملة في شاشة الخزينة.
        </p>
      )}
      <div className="grid gap-4 sm:grid-cols-2">
        <CapMeter
          title="اليوم"
          received={usageReady ? (usage?.day ?? null) : null}
          cap={account.dailyCap}
          currency={currency}
          help="مجموع ما استُقبل على هذا الحساب منذ بداية اليوم بتوقيت القاهرة، مقابل الحد اليومي. عند بلوغ الحد يختفي الحساب من صفحة التحويل تلقائياً."
        />
        <CapMeter
          title="هذا الشهر"
          received={usageReady ? (usage?.month ?? null) : null}
          cap={account.monthlyCap}
          currency={currency}
          help="مجموع ما استُقبل على هذا الحساب منذ بداية الشهر، مقابل الحد الشهري. الحدان يعملان معاً: بلوغ أيهما يكفي لإخفاء الحساب."
        />
      </div>

      <Separator />

      <form action={readOnly ? undefined : saveAccount.bind(null, account.id)} className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <KindField
            id={f("kind")}
            name="kind"
            defaultValue={account.kind}
            disabled={readOnly}
            treasuryReady={treasuryReady}
          />
          <TextField
            id={f("label")}
            label="اسم الحساب"
            name="label"
            defaultValue={account.label}
            disabled={readOnly}
            required
            help="ما يقرأه العميل في صفحة التحويل — مثال «فودافون كاش» أو «انستا باي البنك الأهلي». في الحسابات الداخلية اسمٌ يفيدك أنت مثل «خزنة المكتب»."
          />
          <TextField
            id={f("handle")}
            label="الرقم / العنوان"
            name="handle"
            defaultValue={account.handle}
            dir="ltr"
            disabled={readOnly}
            required
            help={KIND_HANDLE_HINT[account.kind]}
          />
          <TextField
            id={f("holder_name")}
            label="اسم صاحب الحساب"
            name="holder_name"
            defaultValue={account.holderName}
            disabled={readOnly}
            help="يظهر للعميل ليطمئن أن التحويل وصل للجهة الصحيحة — اتركه فارغاً ليختفي."
          />
          <NumberField
            id={f("opening_balance")}
            label="الرصيد الافتتاحي"
            name="opening_balance"
            defaultValue={account.openingBalance}
            disabled={readOnly}
            step="0.01"
            help="رصيد الحساب لحظة إضافته للنظام. لا يؤثر على الحدود، وليس قيداً في الدفتر — بل نقطة البداية التي تُضاف إليها كل القيود لينتج الرصيد الحالي في شاشة الخزينة."
          />
          <NumberField
            id={f("sort")}
            label="ترتيب العرض"
            name="sort"
            defaultValue={account.sort}
            disabled={readOnly}
            help="ترتيب ظهور الحساب أمام العميل بين الحسابات المتاحة — الأصغر أولاً."
          />
          <NumberField
            id={f("daily_cap")}
            label="الحد اليومي"
            name="daily_cap"
            defaultValue={account.dailyCap}
            disabled={readOnly}
            step="0.01"
            placeholder="بلا حد"
            help="أقصى مبلغ يُستقبل على هذا الحساب في اليوم. اتركه فارغاً ليعمل بلا حد. الصفر يعني حساباً مشبعاً دائماً فلا تكتبه إلا عمداً."
          />
          <NumberField
            id={f("monthly_cap")}
            label="الحد الشهري"
            name="monthly_cap"
            defaultValue={account.monthlyCap}
            disabled={readOnly}
            step="0.01"
            placeholder="بلا حد"
            help="أقصى مبلغ يُستقبل على هذا الحساب في الشهر. اتركه فارغاً ليعمل بلا حد."
          />
        </div>

        <div className="flex flex-col gap-2">
          <Label className="flex w-fit cursor-pointer items-center gap-2 text-sm font-normal">
            <input
              type="checkbox"
              name="active"
              defaultChecked={account.active}
              disabled={readOnly}
              className="size-4 accent-primary"
            />
            الحساب نشط
            <HelpTip>
              الحساب المتوقف يبقى ببياناته وسجله لكنه لا يُعرض على العملاء إطلاقاً — استخدم
              الإيقاف بدل الحذف دائماً.
            </HelpTip>
          </Label>
          <CustomerFacingField
            id={f("customer_facing")}
            name="customer_facing"
            defaultChecked={account.customerFacing}
            disabled={readOnly}
            treasuryReady={treasuryReady}
            kind={account.kind}
          />
        </div>

        <FeeField
          idBase={`acc-${account.id}`}
          namePrefix=""
          kind={account.feeKind}
          value={account.feeValue}
          currency={currency}
          disabled={readOnly}
          feeReady={feeReady}
          accountKind={account.kind}
          gatewayPot={account.gatewayPot}
        />

        <div className="flex flex-wrap items-center justify-end gap-3">
          {confirmingDelete ? null : (
            <Link
              href={`/admin/payment-accounts?remove=${account.id}`}
              className={cn(
                "inline-flex items-center gap-1.5 rounded-lg border border-red-300 px-3 py-1.5 text-sm text-red-700 transition-colors hover:bg-red-50 dark:border-red-800 dark:text-red-300 dark:hover:bg-red-950",
                readOnly && "pointer-events-none opacity-50"
              )}
            >
              <Trash2 className="size-4" />
              حذف
            </Link>
          )}
          <Button type="submit" disabled={readOnly}>
            حفظ الحساب
          </Button>
        </div>
      </form>

      {confirmingDelete && (
        <form
          action={readOnly ? undefined : deleteAccount.bind(null, account.id)}
          className="space-y-3 rounded-lg border border-red-300 bg-red-50 p-4 dark:border-red-700 dark:bg-red-950"
        >
          <p className="text-sm font-semibold text-red-900 dark:text-red-100">
            تأكيد حذف «{account.label}»
          </p>
          <p className="text-sm leading-relaxed text-red-900/90 dark:text-red-100/90">
            الحذف نهائي ولا رجعة فيه. قبل التنفيذ يعدّ النظام مدفوعات هذا الحساب: إن وُجد
            مدفوع واحد رُفض الحذف وبقي الحساب كما هو — عندها الإيقاف هو الخيار الصحيح، فهو
            يخفيه عن العملاء ويُبقي سجله المالي متصلاً به.
          </p>
          <div className="flex flex-wrap items-center gap-3">
            <Button type="submit" variant="destructive" disabled={readOnly}>
              <Trash2 />
              تأكيد الحذف
            </Button>
            <Link
              href="/admin/payment-accounts"
              className="text-sm text-muted-foreground transition-colors hover:text-foreground hover:underline"
            >
              تراجع
            </Link>
          </div>
        </form>
      )}
    </Card>
  );
}

export default async function PaymentAccountsPage({
  searchParams,
}: PageProps<"/admin/payment-accounts">) {
  const [
    params,
    { accounts, usage, usageReady, currency, ready, treasuryReady, feeReady },
    settings,
    pulse,
  ] = await Promise.all([
    searchParams,
    loadAccounts(),
    getSettings(),
    // نبض الشاشة (الملاحظة ١٢): قراءة موازية، وكل رقم فيها محسوب في Postgres.
    // تعذّرها لا يُسقط الشاشة — `PagePulse` يقول السبب سطراً واحداً.
    createServerSupabase().then((client) => readPagePulse(client, "/admin/payment-accounts")),
  ]);

  const wired = hasSupabaseEnv();
  // نجاحان مختلفان في نفس الشاشة: حفظ حساب (saved=1) وحفظ إعدادات الدفع (saved=payment)
  const savedPayment = params.saved === "payment";
  const saved = params.saved === "1" || savedPayment;
  const error = typeof params.error === "string" ? params.error : null;
  const removing = typeof params.remove === "string" ? params.remove : null;
  const readOnly = !ready;

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="font-heading text-lg font-bold">حسابات الدفع والخزينة</h2>
        <HelpTip>
          كل صف هنا وعاء مال، و<span className="font-semibold">أنت من يحدد ما يظهر منه في صفحة
          التحويل</span> بمفتاح «يظهر للعملاء» — محافظَ كانت أو حسابات بنوك، لا فرق في النوع.
          والنظام يعرض على العميل المتاح منها فقط: المتوقف أو الذي بلغ حده اليومي أو الشهري{" "}
          <span className="font-semibold">يختفي من صفحة التحويل تلقائياً</span> بلا تدخل منك،
          فوزّع الحدود على أكثر من حساب حتى لا تتوقف الحجوزات. وما تطفئ مفتاحه يبقى بأرصدته
          وقيوده كاملةً في الخزينة.
        </HelpTip>
        <Link
          href="/admin/finance/treasury"
          className="ms-auto text-sm text-primary transition-colors hover:underline"
        >
          أرصدة الخزينة وحركاتها
        </Link>
      </div>

      <Banners
        wired={wired}
        readOnly={readOnly}
        saved={saved}
        error={error}
        errorMessages={ERROR_MESSAGES}
        savedMessage={
          savedPayment
            ? "حُفظت إعدادات الدفع — تسري على الحجوزات الجديدة فوراً."
            : "حُفظ الحساب وانعكس على خيارات التحويل أمام العملاء فوراً."
        }
        readOnlyTitle="حسابات الدفع غير جاهزة بعد"
        readOnlyBody={
          <p>
            قاعدة البيانات مربوطة لكن جدول <code dir="ltr">payment_accounts</code> غير موجود —
            نفِّذ هجرة المرحلة ٤ من <code dir="ltr">supabase/migrations</code> ثم أعد تحميل
            الصفحة.
          </p>
        }
      />

      <PagePulse data={pulse} />

      {/* القاعدة العامة أولاً (كم يدفع العميل الآن)، ثم الحسابات التي يحوّل إليها */}
      <PaymentSettingsCard
        settings={settings.payment}
        currency={currency}
        readOnly={!wired}
      />

      {ready && !treasuryReady && (
        <Card className="p-4 text-sm leading-relaxed text-muted-foreground">
          امتداد الخزينة (المرحلة ٧) غير مطبَّق بعد: عمود{" "}
          <code dir="ltr">customer_facing</code> غير موجود، فأنواع «نقدية» و«حساب بنكي» ومفتاح
          «يظهر للعملاء» معطَّلة. نفِّذ هجرة <code dir="ltr">0015</code> من{" "}
          <code dir="ltr">supabase/migrations</code> ثم أعد تحميل الصفحة — بقية الشاشة تعمل
          طبيعياً وحسابات العملاء الحالية لا تتأثر.
        </Card>
      )}

      {ready && !usageReady && (
        <Card className="p-4 text-sm text-muted-foreground">
          أرقام الاستهلاك غير متاحة بعد — دالة{" "}
          <code dir="ltr">available_payment_accounts</code> أو جدول{" "}
          <code dir="ltr">payments</code> غير جاهزين. البيانات والحدود تُحفظ بشكل طبيعي، وتظهر
          الأشرطة فور اكتمال هجرة المرحلة ٤.
        </Card>
      )}

      {ready && accounts.length === 0 && (
        <Card className="p-5 text-sm text-muted-foreground">
          لا توجد حسابات دفع بعد — أضف أول حساب من النموذج أدناه. قبل إضافة حساب واحد على
          الأقل لن يستطيع العميل إتمام أي تحويل.
        </Card>
      )}

      {accounts.map((account) => (
        <AccountCard
          key={account.id}
          account={account}
          usage={usage.get(account.id)}
          usageReady={usageReady}
          currency={currency}
          readOnly={readOnly}
          confirmingDelete={removing === account.id}
          treasuryReady={treasuryReady}
          feeReady={feeReady}
        />
      ))}

      <form action={readOnly ? undefined : createAccount}>
        <Card className="space-y-4 p-5">
          <div>
            <h3 className="flex items-center gap-1.5 font-heading text-base font-bold">
              <Plus className="size-4 text-primary" />
              إضافة حساب
              <HelpTip>
                أضف أكثر من حساب ووزّع الحدود بينها: عندما يشبع أحدها ينتقل العملاء إلى
                التالي تلقائياً، فلا تتوقف الحجوزات ولا تحتاج للتدخل ليلاً. وللخزينة أضف حساب
                نقدية واحداً على الأقل تُقيَّد عليه المصروفات ودفعات المتعهدين — وهو الوحيد
                الذي لا يصلح وجهةَ تحويل.
              </HelpTip>
            </h3>
            <p className="text-sm text-muted-foreground">
              الحساب الجديد يظهر للعملاء فور حفظه إن كان نشطاً و«يظهر للعملاء» مفعَّلاً ولم يبلغ
              حده.
            </p>
          </div>

          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <KindField
              id="new-kind"
              name="new.kind"
              disabled={readOnly}
              treasuryReady={treasuryReady}
            />
            <TextField
              id="new-label"
              label="اسم الحساب"
              name="new.label"
              placeholder="فودافون كاش"
              disabled={readOnly}
              required
            />
            <TextField
              id="new-handle"
              label="الرقم / العنوان"
              name="new.handle"
              dir="ltr"
              placeholder="01xxxxxxxxx"
              disabled={readOnly}
              required
              help="رقم المحفظة أو عنوان انستا باي الذي يحوّل إليه العميل — يُعرض له حرفياً كما تكتبه هنا. في الحساب الداخلي بيانٌ مميّز لك وحدك."
            />
            <TextField
              id="new-holder"
              label="اسم صاحب الحساب"
              name="new.holder_name"
              disabled={readOnly}
            />
            <NumberField
              id="new-opening"
              label="الرصيد الافتتاحي"
              name="new.opening_balance"
              disabled={readOnly}
              step="0.01"
              placeholder="0"
            />
            <NumberField
              id="new-sort"
              label="ترتيب العرض"
              name="new.sort"
              disabled={readOnly}
              placeholder="0"
            />
            <NumberField
              id="new-daily"
              label="الحد اليومي"
              name="new.daily_cap"
              disabled={readOnly}
              step="0.01"
              placeholder="بلا حد"
              help="اتركه فارغاً ليعمل الحساب بلا حد يومي."
            />
            <NumberField
              id="new-monthly"
              label="الحد الشهري"
              name="new.monthly_cap"
              disabled={readOnly}
              step="0.01"
              placeholder="بلا حد"
              help="اتركه فارغاً ليعمل الحساب بلا حد شهري."
            />
          </div>

          <div className="flex flex-col gap-2">
            <Label className="flex w-fit cursor-pointer items-center gap-2 text-sm font-normal">
              <input
                type="checkbox"
                name="new.active"
                defaultChecked
                disabled={readOnly}
                className="size-4 accent-primary"
              />
              تفعيل الحساب فور إضافته
            </Label>
            <CustomerFacingField
              id="new-customer-facing"
              name="new.customer_facing"
              defaultChecked
              disabled={readOnly}
              treasuryReady={treasuryReady}
            />
          </div>

          <FeeField
            idBase="new"
            namePrefix="new."
            kind="none"
            value={0}
            currency={currency}
            disabled={readOnly}
            feeReady={feeReady}
          />

          <div className="flex justify-end">
            <Button type="submit" disabled={readOnly}>
              <Plus />
              إضافة الحساب
            </Button>
          </div>
        </Card>
      </form>
    </div>
  );
}
