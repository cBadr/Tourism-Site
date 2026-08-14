import Link from "next/link";
import {
  ArrowLeft,
  Banknote,
  Handshake,
  Hourglass,
  Landmark,
  PiggyBank,
  Receipt,
  Scale,
  TrendingUp,
  Wallet,
} from "lucide-react";

import { PrintButton } from "@/components/admin/print-button";
import { PrintHeader } from "@/components/admin/print-header";
import { toArabicDigits } from "@/components/booking/format";
import { HelpTip } from "@/components/shared/HelpTip";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { isMissingFunction, isMissingTable } from "@/lib/dispatch/settings";
import { createServerSupabase } from "@/lib/supabase/server";
import {
  accountKindLabel,
  CashFlowChart,
  FinanceNotReady,
  type FlowBucket,
  firstRow,
  GranularityField,
  hasSupabaseEnv,
  hrefWith,
  KpiCard,
  Money,
  numberOf,
  RangeFilter,
  readCurrency,
  rowsOf,
  SettlementBadge,
  textOf,
} from "./_components/finance-ui";
import {
  GRANULARITY_LABELS,
  type Granularity,
  rangeParams,
  rangeSentence,
  resolveGranularity,
  resolveRange,
} from "./_components/range";

/**
 * المالية — الصفحة الأولى: صورة المال في فترة واحدة.
 *
 * ثلاث طبقات لا رابعة: مؤشرات الفترة (`finance_kpis`)، ثم شكل الحركة عبر
 * الزمن (`cash_flow`)، ثم أين يقف المال الآن (`v_account_balances`).
 *
 * **كل رقم هنا يأتي من Postgres محسوباً.** لا جمع ولا طرح ولا نسبة مئوية تُحسب
 * في هذا الملف؛ TypeScript ينسّق الخانات ويختار الكلمات فقط. سبب القاعدة ليس
 * أناقة معمارية: نفس الأرقام يقرؤها المتعهد في بورتاله وسيقرؤها الوكيل لاحقاً،
 * وأي حساب يُكرَّر في الواجهة يصير مصدر حقيقة ثانياً ينحرف عن الأول بصمت.
 *
 * تفريق مقصود بين نوعين من المؤشرات:
 *  - **مؤشرات فترة** (الإيراد، تكلفة المتعهدين، المصروفات، صافي الربح): مجموع ما
 *    وقع بين تاريخين.
 *  - **مؤشرات لحظية** (النقدية بالخزائن، تحصيلات معلقة، صافي مستحقات المتعهدين):
 *    صورة الآن، لا تتغيّر بتغيير الفترة. خلطهما هو الخطأ الذي يجعل مالكاً يظن
 *    أن خزينته فرغت لأنه اختار «اليوم».
 */

export const metadata = { title: "المالية" };

const PATH = "/admin/finance";

type Kpis = {
  revenue: number | null;
  partnerCosts: number | null;
  expenses: number | null;
  netProfit: number | null;
  cashOnHand: number | null;
  receivables: number | null;
  partnerNetDue: number | null;
};

const EMPTY_KPIS: Kpis = {
  revenue: null,
  partnerCosts: null,
  expenses: null,
  netProfit: null,
  cashOnHand: null,
  receivables: null,
  partnerNetDue: null,
};

type BalanceRow = {
  accountId: string;
  label: string;
  kind: string | null;
  openingBalance: number | null;
  totalIn: number | null;
  totalOut: number | null;
  balance: number | null;
};

type Loaded = {
  currency: string;
  kpis: Kpis;
  kpisReady: boolean;
  flow: FlowBucket[];
  flowReady: boolean;
  balances: BalanceRow[];
  balancesReady: boolean;
  /** أول ما تعذّر قراءته بالاسم — يظهر في بطاقة «غير جاهزة» */
  missing: string | null;
};

const BLANK: Loaded = {
  currency: "EGP",
  kpis: EMPTY_KPIS,
  kpisReady: false,
  flow: [],
  flowReady: false,
  balances: [],
  balancesReady: false,
  missing: null,
};

async function loadScreen(
  from: string,
  to: string,
  granularity: Granularity
): Promise<Loaded> {
  const supabase = await createServerSupabase();
  if (!supabase) return { ...BLANK, missing: "قاعدة البيانات" };

  const [currency, kpisRes, flowRes, balancesRes] = await Promise.all([
    readCurrency(supabase),
    supabase.rpc("finance_kpis", { p_from: from, p_to: to }),
    supabase.rpc("cash_flow", { p_from: from, p_to: to, p_granularity: granularity }),
    supabase.from("v_account_balances").select("*"),
  ]);

  const kpiRow = kpisRes.error ? null : firstRow(kpisRes.data);
  const kpis: Kpis = kpiRow
    ? {
        revenue: numberOf(kpiRow, ["revenue"]),
        partnerCosts: numberOf(kpiRow, ["partner_costs", "partnerCosts"]),
        expenses: numberOf(kpiRow, ["expenses"]),
        netProfit: numberOf(kpiRow, ["net_profit", "netProfit"]),
        cashOnHand: numberOf(kpiRow, ["cash_on_hand", "cashOnHand"]),
        receivables: numberOf(kpiRow, ["receivables"]),
        partnerNetDue: numberOf(kpiRow, ["partner_net_due", "partnerNetDue"]),
      }
    : EMPTY_KPIS;

  const flow: FlowBucket[] = flowRes.error
    ? []
    : rowsOf(flowRes.data).map((row) => ({
        bucket: textOf(row, ["bucket", "period", "day"]) ?? "—",
        inflow: numberOf(row, ["inflow", "in_total", "total_in"]),
        outflow: numberOf(row, ["outflow", "out_total", "total_out"]),
        net: numberOf(row, ["net", "net_flow"]),
        runningBalance: numberOf(row, ["running_balance", "runningBalance"]),
      }));

  const balances: BalanceRow[] = balancesRes.error
    ? []
    : rowsOf(balancesRes.data)
        .map((row) => ({
          accountId: textOf(row, ["account_id", "accountId", "id"]) ?? "",
          label: textOf(row, ["label", "name"]) ?? "حساب بلا اسم",
          kind: textOf(row, ["kind"]),
          openingBalance: numberOf(row, ["opening_balance", "openingBalance"]),
          totalIn: numberOf(row, ["total_in", "totalIn"]),
          totalOut: numberOf(row, ["total_out", "totalOut"]),
          balance: numberOf(row, ["balance"]),
        }))
        .filter((row) => row.accountId !== "");

  // اسم أول غائب — الرسالة تقول للمالك ما ينقص بالضبط بدل «حدث خطأ»
  const missing =
    balancesRes.error && isMissingTable(balancesRes.error.code)
      ? "v_account_balances"
      : kpisRes.error && isMissingFunction(kpisRes.error.code)
        ? "finance_kpis"
        : flowRes.error && isMissingFunction(flowRes.error.code)
          ? "cash_flow"
          : kpisRes.error || flowRes.error || balancesRes.error
            ? "قراءة بيانات المالية"
            : null;

  return {
    currency,
    kpis,
    kpisReady: !kpisRes.error && kpiRow !== null,
    flow,
    flowReady: !flowRes.error,
    balances,
    balancesReady: !balancesRes.error,
    missing,
  };
}

export default async function FinancePage({ searchParams }: PageProps<"/admin/finance">) {
  const params = await searchParams;
  const range = resolveRange(params);
  const granularity = resolveGranularity(params.granularity, range.days);
  const loaded = await loadScreen(range.from, range.to, granularity);
  const { currency, kpis, kpisReady, flow, flowReady, balances, balancesReady } = loaded;

  const wired = hasSupabaseEnv();
  const keep = { granularity };
  const money = (value: number | null) => <Money value={value} currency={currency} />;

  return (
    <div className="print-sheet mx-auto max-w-6xl space-y-6">
      {/*
        ترويسة الشاشة كلها `no-print`: عنوانها وتلميحه وروابط أقسامها أدوات
        تصفّح، وبديلها على الورق ترويسة الطباعة أسفلها — تحمل اسم العلامة
        والفترة والعملة، وهي ما يعرّف الورقة حين تُقرأ بعد شهر بلا شاشة حولها.
      */}
      <div className="no-print flex flex-wrap items-center gap-2">
        <h2 className="flex items-center gap-2 font-heading text-lg font-bold">
          <Wallet className="size-5 text-primary" />
          المالية
        </h2>
        <HelpTip>
          كل حركة مال في المنصة — تحصيل عميل، مستحق متعهد، مصروف، تسوية — تُقيَّد صفاً
          واحداً في دفتر واحد داخل قاعدة البيانات، ومنه تُشتق هذه الشاشة وكشوف الحساب
          والتدفق النقدي جميعاً. لا رقم هنا محسوب في المتصفح.
        </HelpTip>
        <div className="ms-auto flex flex-wrap items-center gap-2">
          <PrintButton label="طباعة التقرير" />
          <nav className="flex flex-wrap items-center gap-2 text-sm">
            <Link href="/admin/finance/treasury" className="text-primary hover:underline">
              الخزينة
            </Link>
            <span className="text-muted-foreground">·</span>
            <Link href="/admin/finance/expenses" className="text-primary hover:underline">
              المصروفات
            </Link>
            <span className="text-muted-foreground">·</span>
            <Link href="/admin/finance/partners" className="text-primary hover:underline">
              مقاصة المتعهدين
            </Link>
          </nav>
        </div>
      </div>

      <PrintHeader
        title="تقرير المالية — نتيجة الفترة والتدفق النقدي"
        meta={[
          { label: "الفترة", value: rangeSentence(range) },
          { label: "العملة", value: currency },
          { label: "تجميع التدفق", value: GRANULARITY_LABELS[granularity] },
        ]}
        note="بطاقات «صورة الآن» — النقدية بالخزائن والتحصيلات المعلقة وصافي مستحقات المتعهدين وأرصدة الحسابات — لحظية لا تخص الفترة أعلاه: هي صورة لحظة إصدار الورقة."
      />

      {(!wired || loaded.missing !== null) && (
        <FinanceNotReady wired={wired} missing={loaded.missing ?? "دوال المالية"} />
      )}

      {/* `hidden={{}}` لأن الحبيبة حقل ظاهر في النموذج — لا يُكرَّر مخفياً */}
      <RangeFilter basePath={PATH} range={range} keep={keep} hidden={{}} disabled={!wired}>
        <GranularityField value={granularity} disabled={!wired} />
      </RangeFilter>

      {/* مؤشرات الفترة — أربعة أرقام تحكي قصة الربح */}
      <section className="space-y-2">
        <h3 className="flex items-center gap-1.5 text-sm font-semibold">
          نتيجة الفترة
          <HelpTip>
            الأربعة أدناه تخص الفترة المختارة وحدها: ماذا استحققنا، وكم كلّفنا تنفيذه،
            وكم أنفقنا خارجه، وما بقي. تغيير الفترة يغيّرها كلها.
          </HelpTip>
        </h3>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <KpiCard
            title="الإيراد"
            value={kpisReady ? money(kpis.revenue) : "—"}
            sub="قيمة الرحلات المنفَّذة في الفترة"
            icon={TrendingUp}
            help={
              <>
                مجموع أسعار الرحلات التي بلغت حالة «منفذ» داخل الفترة، بسعر العميل
                المحفوظ لحظة الحجز. <span className="font-semibold">استحقاق لا تحصيل</span>:
                الرحلة تُحتسب إيراداً يوم نُفّذت حتى لو كان جزء من مالها ما زال مع السائق.
              </>
            }
          />
          <KpiCard
            title="تكلفة المتعهدين"
            value={kpisReady ? money(kpis.partnerCosts) : "—"}
            sub="مستحقات الشركاء عن رحلات الفترة"
            icon={Handshake}
            help={
              <>
                مجموع ما استحقّه المتعهدون عن رحلات الفترة — المبلغ المتفق عليه لحظة
                الإسناد (<code dir="ltr">assigned_payout</code>) لا تقدير لاحق. هذه تكلفة
                البيع المباشرة، وتُحتسب سواء سُدّدت للشريك أم لا.
              </>
            }
          />
          <KpiCard
            title="المصروفات"
            value={kpisReady ? money(kpis.expenses) : "—"}
            sub="مصروفات تشغيلية مسجَّلة في الفترة"
            icon={Receipt}
            help="مجموع المصروفات المسجَّلة من شاشة المصروفات بتاريخ داخل الفترة (وقود، صيانة، رواتب، إيجار...). لا تشمل مستحقات المتعهدين — تلك تكلفة بيع لا مصروف إداري."
          />
          <KpiCard
            title="صافي الربح"
            value={kpisReady ? money(kpis.netProfit) : "—"}
            sub="الإيراد − تكلفة المتعهدين − المصروفات"
            icon={PiggyBank}
            /* الخسارة وحدها تُلوَّن — الربح الموجب هو الوضع المتوقَّع ولا خبر فيه */
            variant={kpisReady && (kpis.netProfit ?? 0) < 0 ? "danger" : "default"}
            help={
              <>
                الطرح يقع داخل <code dir="ltr">finance_kpis</code> في قاعدة البيانات لا
                هنا. <span className="font-semibold">ربح لا سيولة</span>: قد يكون موجباً
                وخزينتك شبه فارغة لأن مالك ما زال مع السائقين أو لم يُحصَّل بعد — لذلك
                تُقرأ مع بطاقات «الآن» أدناه.
              </>
            }
          />
        </div>
      </section>

      {/* مؤشرات لحظية — لا علاقة لها بالفترة، وهذا مكتوب في متنها لا في تلميحها فقط */}
      <section className="space-y-2">
        <h3 className="flex items-center gap-1.5 text-sm font-semibold">
          صورة الآن
          <HelpTip>
            الثلاثة أدناه لقطة للحظة الحالية ولا تتأثر بالفترة المختارة إطلاقاً: أين
            المال الآن، وكم منه لم يصلنا بعد، وكم لنا وعلينا مع الشركاء.
          </HelpTip>
          <Badge variant="outline" className="text-[10px] font-normal">
            لحظي
          </Badge>
        </h3>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <KpiCard
            title="النقدية بالخزائن"
            value={kpisReady ? money(kpis.cashOnHand) : "—"}
            sub="رصيد كل حسابات الخزينة الآن"
            icon={Landmark}
            help="مجموع أرصدة حسابات الخزينة كلها (محافظ + انستا باي + نقدية + بنك) = الرصيد الافتتاحي لكل حساب زائد كل حركاته. هذا المال الموجود فعلاً تحت يدك الآن."
          />
          <KpiCard
            title="تحصيلات معلقة"
            value={kpisReady ? money(kpis.receivables) : "—"}
            sub="مال مستحق لنا لم يدخل خزائننا بعد"
            icon={Hourglass}
            help={
              <>
                باقي قيمة الحجوزات المؤكدة والمُسندة التي لم تُنفَّذ بعد — لم تصل خزينتنا
                ولم يقبضها سائق. أما ما قبضه المتعهدون نقداً من العملاء فيظهر في بطاقة
                «صافي مستحقات المتعهدين» بجوارها، لا هنا.
              </>
            }
          />
          <KpiCard
            title="صافي مستحقات المتعهدين"
            value={
              kpisReady ? (
                <SettlementBadge
                  netDue={kpis.partnerNetDue}
                  absNetDue={null}
                  currency={currency}
                  withHint={false}
                />
              ) : (
                "—"
              )
            }
            sub="محصّلة المقاصة مع كل الشركاء"
            icon={Scale}
            /*
              الإشارة تغيّر معنى البطاقة لا حجمها فقط: موجب = علينا دفعة قادمة
              (كهرماني ينتظر فعلاً منك)، سالب = مالنا في يد الشركاء ويُحصَّل
              (أزرق للعلم لا للإنذار). الصفر لا يُلوَّن — لا شيء يُفعل.
            */
            variant={
              !kpisReady || kpis.partnerNetDue === null || kpis.partnerNetDue === 0
                ? "default"
                : kpis.partnerNetDue > 0
                  ? "warning"
                  : "info"
            }
            help={
              <>
                مجموع صوافي المقاصة: مستحقاتهم عن الرحلات ناقص ما قبضوه نقداً من العملاء
                ناقص ما دفعناه لهم. <span className="font-semibold">قد يكون سالباً</span>{" "}
                فيصير الشركاء مدينين لنا — وهو وضع شائع هنا لأن السائق يقبض باقي الأجرة
                من العميل مباشرة.
              </>
            }
          />
        </div>
      </section>

      {/* التدفق النقدي — شكل الحركة لا مجرد محصّلتها */}
      <Card className="space-y-4 p-5">
        <div>
          <h3 className="flex items-center gap-1.5 font-heading text-base font-bold">
            <Banknote className="size-4 text-primary" />
            التدفق النقدي
            <HelpTip>
              الوارد والمنصرف الفعليان من الخزائن خلال الفترة، موزّعين على أعمدة. المخطط
              يجيب سؤالاً لا تجيبه بطاقة واحدة: هل الحركة مستقرة أم أن شهراً واحداً يحمل
              كل شيء؟ التجميع كله في دالة <code dir="ltr">cash_flow</code>.
            </HelpTip>
          </h3>
          <p className="text-sm text-muted-foreground">
            نقد داخل وخارج فعلاً — لا استحقاقات. مستحق متعهد لم يُدفع بعد لا يظهر هنا،
            ويظهر في «صافي مستحقات المتعهدين».
          </p>
        </div>

        {!flowReady ? (
          <p className="text-sm text-muted-foreground">
            تعذّرت قراءة التدفق النقدي — تأكد أن دالة <code dir="ltr">cash_flow</code>{" "}
            منفَّذة في قاعدة البيانات (هجرة المرحلة ٧).
          </p>
        ) : (
          <CashFlowChart rows={flow} currency={currency} granularity={granularity} />
        )}
      </Card>

      {/* أين يقف المال الآن */}
      <Card className="space-y-4 p-5">
        <div className="flex flex-wrap items-center gap-2">
          <h3 className="flex items-center gap-1.5 font-heading text-base font-bold">
            <Landmark className="size-4 text-primary" />
            أرصدة حسابات الخزينة
            <HelpTip>
              كل محفظة وحساب انستا باي ونقدية وبنك = حساب خزينة واحد. الرصيد = الافتتاحي +
              الوارد − المنصرف، محسوباً في العرض <code dir="ltr">v_account_balances</code>.
              الأرقام هنا لحظية ولا تتقيّد بفترة الشاشة.
            </HelpTip>
          </h3>
          <Link
            href="/admin/payment-accounts"
            className="no-print ms-auto inline-flex items-center gap-1 text-xs text-primary hover:underline"
          >
            إدارة الحسابات والحدود
            <ArrowLeft className="size-3" />
          </Link>
        </div>

        {!balancesReady ? (
          <p className="text-sm text-muted-foreground">
            تعذّرت قراءة الأرصدة — تأكد أن العرض <code dir="ltr">v_account_balances</code>{" "}
            منفَّذ في قاعدة البيانات (هجرة المرحلة ٧).
          </p>
        ) : balances.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            لا حسابات خزينة بعد — أضف أول حساب من شاشة «حسابات الدفع»، وأضف حسابات نقدية
            وبنكية لتتبع مالك خارج المحافظ.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[44rem] text-sm">
              <thead>
                <tr className="border-b border-border text-xs text-muted-foreground">
                  <th className="p-2 text-start font-medium">الحساب</th>
                  <th className="p-2 text-start font-medium">النوع</th>
                  <th className="p-2 text-start font-medium">الرصيد الافتتاحي</th>
                  <th className="p-2 text-start font-medium">الوارد</th>
                  <th className="p-2 text-start font-medium">المنصرف</th>
                  <th className="p-2 text-start font-medium">الرصيد الحالي</th>
                  {/* عمود الروابط يُخفى برأسه وخانته معاً — خانةٌ بلا رأس تزيح الصف */}
                  <th className="no-print p-2 text-start font-medium" />
                </tr>
              </thead>
              <tbody>
                {balances.map((row) => (
                  <tr key={row.accountId} className="border-b border-border last:border-0">
                    <td className="p-2 font-medium">{row.label}</td>
                    <td className="p-2 text-xs text-muted-foreground">
                      {accountKindLabel(row.kind)}
                    </td>
                    <td className="p-2">{money(row.openingBalance)}</td>
                    <td className="p-2 text-emerald-700 dark:text-emerald-300">
                      {money(row.totalIn)}
                    </td>
                    <td className="p-2 text-red-700 dark:text-red-300">
                      {money(row.totalOut)}
                    </td>
                    <td className="p-2 font-bold">{money(row.balance)}</td>
                    <td className="no-print p-2">
                      <Link
                        href={hrefWith("/admin/finance/treasury", {
                          account: row.accountId,
                          ...rangeParams(range),
                        })}
                        className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
                      >
                        كشف الحساب
                        <ArrowLeft className="size-3" />
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {balancesReady && balances.length > 0 && (
          <p className="text-xs text-muted-foreground">
            {toArabicDigits(balances.length)} حساب خزينة. الرصيد السالب في حساب نقدية يعني
            غالباً مصروفاً سُجّل على الحساب الخطأ — راجعه من كشف الحساب.
          </p>
        )}
      </Card>
    </div>
  );
}
