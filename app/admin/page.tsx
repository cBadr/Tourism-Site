import type { ReactNode } from "react";
import Link from "next/link";
import {
  AlertTriangle,
  ArrowLeft,
  Banknote,
  ClipboardList,
  Coins,
  CreditCard,
  Database,
  Handshake,
  HandCoins,
  Radio,
  Receipt,
  Scale,
  TrendingUp,
  TriangleAlert,
  Wallet,
} from "lucide-react";

import { formatMoney, toArabicDigits } from "@/components/booking/format";
import { HelpTip } from "@/components/shared/HelpTip";
import { Badge } from "@/components/ui/badge";
import { Card, type CardVariant } from "@/components/ui/card";
import { KpiCard } from "@/components/ui/kpi-card";
import { createServerSupabase } from "@/lib/supabase/server";
import { getSettings } from "@/lib/settings";
import { cn } from "@/lib/utils";
import {
  asNumber,
  asText,
  BOOKING_STATUSES,
  pick,
  STATUS_HINTS,
  STATUS_LABELS,
  zonedParts,
} from "./orders/_components/booking-ui";

/**
 * لوحة المعلومات — الشاشة الأولى التي تُفتح كل صباح.
 *
 * تجيب أربعة أسئلة بالترتيب الذي يُسأل به فعلاً:
 *   ١) كم دخل وكم خرج؟ (اليوم ثم الشهر — من `finance_kpis`)
 *   ٢) أين المال الآن؟ (رصيد الخزينة، ما لم يُحصَّل، وما بيننا وبين الشركاء)
 *   ٣) ماذا ينتظر قراري؟ (الحجوزات بحالاتها وطابور الإسناد اليدوي)
 *   ٤) إلى أين أذهب؟ (روابط سريعة)
 *
 * **لا رقم واحد يُحسب في هذا الملف.** كل مبلغ يصل جاهزاً من `finance_kpis`، وكل
 * عدد من `count: exact` داخل Postgres. ما يجري هنا اختيار عبارة وتنسيق عرض فقط.
 *
 * تدهور رشيق بثلاث درجات، ولكلٍّ نصّه: لا بيئة Supabase أصلاً / مربوطة وجداول
 * المرحلة ٤ غائبة / مربوطة ودفتر المرحلة ٧ غائب. «٠ ج.م» في أيٍّ منها ادعاء
 * معرفة كاذبة، فالمعروض «—».
 */

export const metadata = { title: "لوحة المعلومات" };

const hasSupabaseEnv = () =>
  Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);

/** مؤشرات فترة — من `finance_kpis(p_from, p_to)`؛ null = غير معروف لا صفر */
type Kpis = {
  revenue: number | null;
  partnerCosts: number | null;
  expenses: number | null;
  netProfit: number | null;
  cashOnHand: number | null;
  receivables: number | null;
  partnerNetDue: number | null;
};

type Loaded = {
  /** جداول المرحلة ٤ مقروءة */
  bookingsReady: boolean;
  /** دالة `finance_kpis` موجودة — أي أن هجرة المرحلة ٧ مطبَّقة */
  financeReady: boolean;
  today: Kpis | null;
  month: Kpis | null;
  bookingCounts: Map<string, number | null>;
  dispatch: { broadcasting: number | null; manual: number | null };
  /** قوائم أسعار بانتظار مراجعة — عمل يوميّ آخر ينتظر قراراً */
  pendingLists: number | null;
  currency: string;
};

const EMPTY: Loaded = {
  bookingsReady: false,
  financeReady: false,
  today: null,
  month: null,
  bookingCounts: new Map(),
  dispatch: { broadcasting: null, manual: null },
  pendingLists: null,
  currency: "EGP",
};

const pad2 = (n: number) => (n < 10 ? `0${n}` : String(n));

/**
 * حدود اليوم والشهر **بتوقيت القاهرة** كتواريخ `YYYY-MM-DD`.
 *
 * ليست حساباً مالياً بل تحديد نافذة: لو أُخذت من UTC لانقلب «اليوم» الساعة
 * الثانية فجراً بتوقيت التشغيل فاختلفت أرقام اللوحة عن الحساب اليدوي — وهي
 * نفس القاعدة التي تلتزمها `available_payment_accounts` في SQL.
 */
function cairoWindow(): { today: string; monthStart: string } {
  const p = zonedParts(new Date());
  return {
    today: `${p.year}-${pad2(p.month)}-${pad2(p.day)}`,
    monthStart: `${p.year}-${pad2(p.month)}-01`,
  };
}

/** قراءة صف المؤشرات مهما كان شكل الإرجاع (صف مفرد أو جدول بصف واحد) */
function readKpis(data: unknown): Kpis | null {
  const row = Array.isArray(data) ? data[0] : data;
  if (!row || typeof row !== "object") return null;
  const r = row as Record<string, unknown>;
  return {
    revenue: asNumber(pick(r, ["revenue"])),
    partnerCosts: asNumber(pick(r, ["partner_costs", "partnerCosts"])),
    expenses: asNumber(pick(r, ["expenses"])),
    netProfit: asNumber(pick(r, ["net_profit", "netProfit"])),
    cashOnHand: asNumber(pick(r, ["cash_on_hand", "cashOnHand"])),
    receivables: asNumber(pick(r, ["receivables"])),
    partnerNetDue: asNumber(pick(r, ["partner_net_due", "partnerNetDue"])),
  };
}

async function loadDashboard(): Promise<Loaded> {
  const supabase = await createServerSupabase();
  if (!supabase) return EMPTY;

  const { today, monthStart } = cairoWindow();

  /**
   * العدّ داخل Postgres — لا تُنقل صفوف إلى الخادم لمجرد عدّها.
   *
   * فخّ مقيس على هذه القاعدة: `head: true` على جدول **غير موجود** يرجع بلا خطأ
   * و`count = null`. لذلك تُعاد `null` كما هي بدل `count ?? 0`.
   */
  const countBookings = async (status: string): Promise<number | null> => {
    const { count, error } = await supabase
      .from("bookings")
      .select("id", { count: "exact", head: true })
      .eq("status", status);
    return error ? null : count;
  };

  const countDispatches = async (status: string): Promise<number | null> => {
    // مفتاح `dispatches` هو booking_id ولا يوجد عمود `id` — اختياره كان يجعل
    // العدّاد يفشل بصمت ويعرض «—» دائماً.
    const { count, error } = await supabase
      .from("dispatches")
      .select("*", { count: "exact", head: true })
      .eq("status", status);
    return error ? null : count;
  };

  const [
    todayRes,
    monthRes,
    bookingCountList,
    broadcasting,
    manual,
    pendingListsRes,
    currencyRes,
  ] = await Promise.all([
    supabase.rpc("finance_kpis", { p_from: today, p_to: today }),
    supabase.rpc("finance_kpis", { p_from: monthStart, p_to: today }),
    Promise.all(BOOKING_STATUSES.map((s) => countBookings(s))),
    countDispatches("broadcasting"),
    countDispatches("manual"),
    supabase
      .from("price_lists")
      .select("id", { count: "exact", head: true })
      .eq("status", "pending"),
    supabase.from("pricing_settings").select("currency").limit(1).maybeSingle(),
  ]);

  const bookingCounts = new Map<string, number | null>();
  BOOKING_STATUSES.forEach((status, index) => {
    bookingCounts.set(status, bookingCountList[index] ?? null);
  });

  // خطأ الدالة = هجرة المرحلة ٧ غير مطبَّقة؛ نجاحها بلا صف = فترة بلا حركة
  const financeReady = !todayRes.error && !monthRes.error;

  return {
    // نجاح عدّ واحد على الأقل يعني أن جدول الحجوزات مقروء
    bookingsReady: bookingCountList.some((c) => c !== null),
    financeReady,
    today: financeReady ? readKpis(todayRes.data) : null,
    month: financeReady ? readKpis(monthRes.data) : null,
    bookingCounts,
    dispatch: { broadcasting, manual },
    pendingLists: pendingListsRes.error ? null : (pendingListsRes.count ?? null),
    currency: (!currencyRes.error && asText(currencyRes.data?.currency)) || EMPTY.currency,
  };
}

// ---------------------------------------------------------------------------
// لبنات العرض
// ---------------------------------------------------------------------------

/** مبلغ جاهز للعرض — «—» حين لا يكون الرقم معروفاً (لا «٠») */
const money = (value: number | null, currency: string) =>
  value === null ? "—" : formatMoney(value, currency);

const countText = (value: number | null) => (value === null ? "—" : toArabicDigits(value));

/**
 * مؤشر مالي في الشاشة الأولى — غلاف رفيع فوق `KpiCard` المشتركة.
 * ما يخصّه وحده شيئان: تنسيق المبلغ بعملة الإعدادات، وتكبير بطاقة واحدة
 * (`emphasis`) لأن «صافي الربح» هو الرقم الذي تُقرأ الثلاثة الأخرى لأجله.
 */
function MoneyStat({
  title,
  value,
  currency,
  help,
  icon: Icon,
  variant,
  emphasis,
}: {
  title: string;
  value: number | null;
  currency: string;
  help: string;
  icon: typeof Wallet;
  variant?: CardVariant;
  emphasis?: boolean;
}) {
  return (
    <KpiCard
      title={title}
      value={money(value, currency)}
      valueDir="ltr"
      icon={Icon}
      help={help}
      variant={variant}
      valueClassName={emphasis ? undefined : "sm:text-xl"}
    />
  );
}

/** مجموعة مؤشرات فترة واحدة (اليوم أو الشهر) */
function PeriodKpis({
  kpis,
  currency,
  scope,
}: {
  kpis: Kpis | null;
  currency: string;
  scope: "اليوم" | "هذا الشهر";
}) {
  const profit = kpis?.netProfit ?? null;
  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
      <MoneyStat
        title={`الإيراد · ${scope}`}
        value={kpis?.revenue ?? null}
        currency={currency}
        icon={TrendingUp}
        help="مجموع أسعار الرحلات المحتسَبة في هذه الفترة — سعر العميل كاملاً بصرف النظر عمّن قبض النقد (نحن أم السائق)."
      />
      <MoneyStat
        title={`تكلفة المتعهدين · ${scope}`}
        value={kpis?.partnerCosts ?? null}
        currency={currency}
        icon={Handshake}
        help="مجموع مستحقات الشركاء عن رحلات هذه الفترة، بمبلغ الإسناد المثبَّت لكل رحلة. تُحتسب عند تنفيذ الرحلة سواء دُفعت لهم بعد أم لا."
      />
      <MoneyStat
        title={`المصروفات · ${scope}`}
        value={kpis?.expenses ?? null}
        currency={currency}
        icon={Receipt}
        help="المصروفات التشغيلية المسجَّلة في الفترة (وقود، صيانة، رواتب، إعلانات…) بحسب فئاتها في شاشة المصروفات."
      />
      <MoneyStat
        title={`صافي الربح · ${scope}`}
        value={profit}
        currency={currency}
        icon={Coins}
        emphasis
        help="الإيراد ناقص تكلفة المتعهدين ناقص المصروفات. رقم ربح لا رقم سيولة: قد يكون موجباً وخزينتك شبه فارغة لأن النقد ما زال مع السائقين."
        /*
          الخسارة وحدها تُلوَّن. كان الربح الموجب يُصبغ بالأخضر دائماً — ولأن
          الوضع الطبيعي أن يكون موجباً كانت البطاقة خضراء كل يوم، فلم يعد
          الأخضر يعني شيئاً وصار الأحمر أصعب التقاطاً بين لونين لا لون واحد.
        */
        variant={profit !== null && profit < 0 ? "danger" : "default"}
      />
    </div>
  );
}

/** بطاقة رابط سريع */
function QuickLink({
  href,
  title,
  description,
  icon: Icon,
  badge,
}: {
  href: string;
  title: string;
  description: string;
  icon: typeof Wallet;
  badge?: ReactNode;
}) {
  return (
    <Link href={href} className="group block">
      <Card className="h-full gap-1 p-4 transition-colors group-hover:border-primary">
        <div className="flex items-center gap-2">
          <Icon className="size-4 shrink-0 text-primary" />
          <span className="font-medium">{title}</span>
          {badge}
          <ArrowLeft className="ms-auto size-4 shrink-0 text-muted-foreground transition-colors group-hover:text-primary" />
        </div>
        <p className="text-xs leading-relaxed text-muted-foreground">{description}</p>
      </Card>
    </Link>
  );
}

export default async function AdminHomePage() {
  const [settings, data] = await Promise.all([getSettings(), loadDashboard()]);
  const dbConnected = hasSupabaseEnv();
  const {
    bookingsReady,
    financeReady,
    today,
    month,
    bookingCounts,
    dispatch,
    pendingLists,
    currency,
  } = data;

  const netDue = month?.partnerNetDue ?? null;
  const awaitingReview = bookingCounts.get("under_review") ?? null;
  const manualQueue = dispatch.manual ?? null;

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-6">
      {/* الترويسة */}
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="font-heading text-lg font-bold">لوحة {settings.brand.name}</h2>
        <HelpTip>
          كل رقم في هذه الصفحة محسوب داخل قاعدة البيانات ومقروء لحظة فتحها — لا تخزين ولا
          تقريب. «—» تعني «لا أعرف» (جدول أو دالة غير جاهزة) وليست صفراً.
        </HelpTip>
        <Link
          href="/admin/finance"
          className="ms-auto text-sm text-primary transition-colors hover:underline"
        >
          الصفحة المالية الكاملة
        </Link>
      </div>

      {/* الدرجة الأولى من التدهور: لا بيئة Supabase أصلاً */}
      {!dbConnected ? (
        <div
          role="alert"
          className="flex items-start gap-3 rounded-xl border border-amber-500/50 bg-amber-500/10 p-4 text-sm text-amber-800 dark:text-amber-200"
        >
          <TriangleAlert className="mt-0.5 size-5 shrink-0" />
          <div>
            <p className="font-semibold">قاعدة البيانات غير مربوطة بعد</p>
            <p className="mt-1 leading-relaxed">
              اتبع خطوات{" "}
              <code
                dir="ltr"
                className="rounded bg-amber-500/15 px-1 py-0.5 font-mono text-xs"
              >
                supabase/README.md
              </code>{" "}
              لإنشاء مشروع Supabase وضبط متغيرات البيئة، ثم أعد تشغيل الخادم. حتى ذلك الحين
              تعمل الشاشات بالقيم الافتراضية وكل الأرقام هنا «—».
            </p>
          </div>
        </div>
      ) : (
        <div className="flex items-center gap-2 rounded-xl border border-border bg-card p-3 text-sm text-muted-foreground">
          <Database className="size-4 shrink-0 text-primary" />
          <span>قاعدة البيانات مربوطة — كل الأرقام أدناه مقروءة منها الآن.</span>
        </div>
      )}

      {/* الدرجة الثالثة: مربوطة لكن دفتر المرحلة ٧ غائب */}
      {dbConnected && !financeReady && (
        <Card className="flex flex-row items-start gap-3 border-amber-300 bg-amber-50 p-4 text-amber-900 dark:border-amber-700 dark:bg-amber-950 dark:text-amber-100">
          <AlertTriangle className="mt-0.5 size-5 shrink-0" />
          <div className="text-sm leading-relaxed">
            <p className="font-semibold">المؤشرات المالية غير متاحة</p>
            <p>
              تعذّر تنفيذ دالة <code dir="ltr">finance_kpis</code>: إما أنها غير موجودة —
              فنفِّذ هجرة المرحلة ٧ (<code dir="ltr">0015</code>) من{" "}
              <code dir="ltr">supabase/migrations</code> — أو أن حسابك لا يملك صلاحية
              تنفيذها (يتطلب دور <code dir="ltr">admin</code>). مؤشرات الطلبات والإسناد أدناه
              تعمل طبيعياً.
            </p>
          </div>
        </Card>
      )}

      {/* ١) المال — اليوم ثم الشهر */}
      <section className="space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <h3 className="flex items-center gap-1.5 font-heading text-base font-bold">
            <Wallet className="size-4 text-primary" />
            حركة اليوم
          </h3>
          <HelpTip>
            من منتصف ليلة اليوم بتوقيت القاهرة حتى الآن — نفس النافذة التي تحسب بها القاعدة
            حدود المحافظ، حتى لا تختلف أرقام اللوحة عن حسابك اليدوي.
          </HelpTip>
        </div>
        <PeriodKpis kpis={today} currency={currency} scope="اليوم" />

        <div className="flex flex-wrap items-center gap-2 pt-2">
          <h3 className="flex items-center gap-1.5 font-heading text-base font-bold">
            <Coins className="size-4 text-primary" />
            حركة الشهر
          </h3>
          <HelpTip>
            من أول يوم في الشهر الجاري حتى اليوم. هذه هي الأرقام التي تُقارَن بإقفال الشهر
            الماضي، وتفصيلها بالفترات في التدفق النقدي داخل الصفحة المالية.
          </HelpTip>
        </div>
        <PeriodKpis kpis={month} currency={currency} scope="هذا الشهر" />
      </section>

      {/* ٢) أين المال الآن — لقطة لحظية لا فترة */}
      <section className="space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <h3 className="flex items-center gap-1.5 font-heading text-base font-bold">
            <Banknote className="size-4 text-primary" />
            أين المال الآن
          </h3>
          <HelpTip>
            لقطة لحظية لا فترة: هذه الأرقام لا تخص اليوم ولا الشهر بل الوضع الآن. الربح شيء
            والسيولة شيء آخر — قد تربح شهراً وتبقى خزينتك خفيفة لأن النقد ما زال في يد
            السائقين أو لم يُحصَّل بعد.
          </HelpTip>
        </div>
        <div className="grid gap-3 sm:grid-cols-3">
          <MoneyStat
            title="رصيد الخزينة"
            value={month?.cashOnHand ?? null}
            currency={currency}
            icon={Wallet}
            emphasis
            help="مجموع أرصدة كل حسابات الخزينة الآن (الرصيد الافتتاحي + كل القيود): المحافظ وانستا باي والنقدية والبنك معاً. هذا هو المال الذي تملك التصرف فيه اليوم."
          />
          <MoneyStat
            title="لم يُحصَّل بعد"
            value={month?.receivables ?? null}
            currency={currency}
            icon={CreditCard}
            help="ما تبقّى على العملاء من حجوزات قائمة لم يصل إلينا ولم يقبضه سائق بعد. كلما كبر الرقم كبرت فجوة التحصيل — راجعه مع طابور «قيد المراجعة»."
          />
          <MoneyStat
            title={
              netDue === null
                ? "صافي حساب المتعهدين"
                : netDue > 0
                  ? "مستحق للمتعهدين علينا"
                  : netDue < 0
                    ? "مستحق لنا على المتعهدين"
                    : "حساب المتعهدين مصفّى"
            }
            value={netDue === null ? null : netDue < 0 ? -netDue : netDue}
            currency={currency}
            icon={Scale}
            help="صافي المقاصة مع كل الشركاء مجتمعين: مستحقاتهم ناقص ما حصّلوه نقداً من عملائنا ناقص ما دفعناه لهم. موجب = ندفع، وسالب = نستردّ — والاتجاه مكتوب في العنوان فلا تقرأ الرقم مجرَّداً."
            /*
              الاتجاهان ليسا درجتَي خطورة لشيء واحد بل حالتان مختلفتان:
              «علينا» دفعة قادمة تخرج من الخزينة (كهرماني)، و«لنا» مال في يد
              الشركاء يُحصَّل (أزرق). المقاصة الصفرية لا تُلوَّن.
            */
            variant={
              netDue === null || netDue === 0 ? "default" : netDue > 0 ? "warning" : "info"
            }
          />
        </div>
      </section>

      {/* ٣) ماذا ينتظر قراري */}
      <section className="grid gap-4 lg:grid-cols-2">
        <Card className="space-y-3 p-5">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="flex items-center gap-1.5 font-heading text-base font-bold">
              <ClipboardList className="size-4 text-primary" />
              الحجوزات بحالاتها
            </h3>
            <HelpTip>
              العدد الكلي لكل حالة في النظام (لا في فترة). ابدأ يومك من «قيد المراجعة» — هذه
              حجوزات رفع أصحابها إيصالات تنتظر اعتمادك، وكل ساعة تأخير عميلٌ ينتظر تأكيداً.
            </HelpTip>
            <Link
              href="/admin/orders"
              className="ms-auto text-sm text-primary transition-colors hover:underline"
            >
              كل الطلبات
            </Link>
          </div>

          {!bookingsReady ? (
            <p className="text-sm leading-relaxed text-muted-foreground">
              تعذّرت قراءة الحجوزات — تأكد أن جدول <code dir="ltr">bookings</code> منفَّذ في
              قاعدة البيانات (هجرة المرحلة ٤).
            </p>
          ) : (
            <ul className="space-y-1">
              {BOOKING_STATUSES.map((status) => {
                const value = bookingCounts.get(status) ?? null;
                const urgent = status === "under_review" && (value ?? 0) > 0;
                return (
                  <li key={status}>
                    <Link
                      href={`/admin/orders?status=${status}`}
                      className={cn(
                        "flex items-center gap-2 rounded-lg border border-transparent px-2 py-1.5 text-sm transition-colors hover:border-border hover:bg-muted/50",
                        urgent && "border-amber-300 bg-amber-50 dark:border-amber-800 dark:bg-amber-950/40"
                      )}
                    >
                      <span className="font-medium">{STATUS_LABELS[status]}</span>
                      <HelpTip>{STATUS_HINTS[status]}</HelpTip>
                      <span className="ms-auto text-lg font-bold" dir="ltr">
                        {countText(value)}
                      </span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}

          {(awaitingReview ?? 0) > 0 && (
            <p className="text-sm font-medium text-amber-700 dark:text-amber-300">
              {toArabicDigits(awaitingReview ?? 0)} إيصال ينتظر اعتمادك — الحجز لا يتحول إلى
              «مؤكد» ولا يبدأ بثه قبل ذلك.
            </p>
          )}
        </Card>

        <Card className="space-y-3 p-5">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="flex items-center gap-1.5 font-heading text-base font-bold">
              <Radio className="size-4 text-primary" />
              حالة الإسناد
            </h3>
            <HelpTip>
              بعد تأكيد الدفع يُعرض الطلب على المتعهدين المغطّين لمساره على موجات، وأول من
              يقبل يفوز. ما يستنفد موجاته بلا قبول ينزل إلى الطابور اليدوي وينتظر تدخلك أنت.
            </HelpTip>
            <Link
              href="/admin/dispatch"
              className="ms-auto text-sm text-primary transition-colors hover:underline"
            >
              شاشة الإسناد
            </Link>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="rounded-lg border border-border p-3">
              <p className="text-xs text-muted-foreground">بثّ جارٍ</p>
              <p className="mt-0.5 text-2xl font-bold" dir="ltr">
                {countText(dispatch.broadcasting)}
              </p>
              <p className="text-xs text-muted-foreground">
                موجات مفتوحة تنتظر ردّ المتعهدين
              </p>
            </div>
            <div
              className={cn(
                "rounded-lg border border-border p-3",
                (manualQueue ?? 0) > 0 &&
                  "border-amber-300 bg-amber-50 dark:border-amber-800 dark:bg-amber-950/40"
              )}
            >
              <p className="text-xs text-muted-foreground">طابور يدوي</p>
              <p className="mt-0.5 text-2xl font-bold" dir="ltr">
                {countText(manualQueue)}
              </p>
              <p className="text-xs text-muted-foreground">
                {(manualQueue ?? 0) > 0
                  ? "رحلات مدفوعة بلا منفّذ — عملاؤها ينتظرون"
                  : "لا طلب استنفد موجاته — الوضع الصحي"}
              </p>
            </div>
          </div>

          {dispatch.broadcasting === null && dispatch.manual === null && (
            <p className="text-sm leading-relaxed text-muted-foreground">
              تعذّرت قراءة جدول <code dir="ltr">dispatches</code> — نفِّذ هجرة المرحلة ٦ ثم
              أعد تحميل الصفحة.
            </p>
          )}

          {(pendingLists ?? 0) > 0 && (
            <p className="text-sm">
              <Link
                href="/admin/subcontractors/reviews"
                className="font-medium text-primary hover:underline"
              >
                {toArabicDigits(pendingLists ?? 0)} قائمة أسعار بانتظار مراجعتك
              </Link>{" "}
              <span className="text-muted-foreground">
                — لا تدخل التسعير قبل اعتمادها.
              </span>
            </p>
          )}
        </Card>
      </section>

      {/* ٤) روابط سريعة */}
      <section className="space-y-3">
        <h3 className="font-heading text-base font-bold">اذهب مباشرةً إلى</h3>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <QuickLink
            href="/admin/orders?status=under_review"
            title="اعتماد التحويلات"
            description="الحجوزات التي رُفعت لها إيصالات وتنتظر تحققك من وصول المبلغ."
            icon={ClipboardList}
            badge={
              (awaitingReview ?? 0) > 0 ? (
                <Badge className="bg-amber-500 text-white">
                  {toArabicDigits(awaitingReview ?? 0)}
                </Badge>
              ) : undefined
            }
          />
          <QuickLink
            href="/admin/dispatch"
            title="طابور الإسناد اليدوي"
            description="رحلات لم يقبلها أحد بعد كل الموجات — القرار فيها بشري."
            icon={Radio}
            badge={
              (manualQueue ?? 0) > 0 ? (
                <Badge className="bg-amber-500 text-white">
                  {toArabicDigits(manualQueue ?? 0)}
                </Badge>
              ) : undefined
            }
          />
          <QuickLink
            href="/admin/finance/partners"
            title="مقاصة المتعهدين"
            description="من له علينا ومن عليه لنا، وكشف حساب كل شريك بالتفصيل."
            icon={HandCoins}
          />
          <QuickLink
            href="/admin/finance/treasury"
            title="الخزينة"
            description="أرصدة كل الحسابات وحركاتها — المحافظ والنقدية والبنك."
            icon={Wallet}
          />
          <QuickLink
            href="/admin/finance/expenses"
            title="المصروفات"
            description="تسجيل مصروف بفئته ومرفقه، ومراجعة مصروفات الفترة."
            icon={Receipt}
          />
          <QuickLink
            href="/admin/payment-accounts"
            title="حسابات الدفع"
            description="أرقام التحويل وحدودها اليومية والشهرية، وحسابات الخزينة الداخلية."
            icon={CreditCard}
          />
        </div>
      </section>
    </div>
  );
}
