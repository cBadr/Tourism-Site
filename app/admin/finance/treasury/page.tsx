import Link from "next/link";
import {
  ArrowDownLeft,
  ArrowLeft,
  ArrowUpRight,
  Landmark,
  Scale,
  Wallet,
} from "lucide-react";

import { toArabicDigits } from "@/components/booking/format";
import { HelpTip } from "@/components/shared/HelpTip";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { isMissingTable } from "@/lib/dispatch/settings";
import { createServerSupabase } from "@/lib/supabase/server";
import { cn } from "@/lib/utils";
import { controlClass, dateTimeLabel } from "../../orders/_components/booking-ui";
import {
  AccountField,
  accountKindLabel,
  AmountField,
  DirectedMoney,
  FinanceFeedback,
  FinanceNotReady,
  hasSupabaseEnv,
  hrefWith,
  KpiCard,
  MAX_LEDGER_ROWS,
  Money,
  numberOf,
  OccurredAtField,
  RangeFilter,
  readCurrency,
  rowsOf,
  SOURCE_HINTS,
  SourceBadge,
  textOf,
} from "../_components/finance-ui";
import { cairoToday, rangeInstants, rangeParams, resolveRange } from "../_components/range";
import { recordAdjustment } from "./actions";

/**
 * الخزينة — كشف حساب واحد من حسابات الخزينة.
 *
 * الشاشة تجيب ثلاثة أسئلة بالترتيب: كم في هذا الحساب الآن؟ من أين جاء وإلى أين
 * ذهب؟ وكيف أصحّح فرقاً لا يفسّره أي قيد؟
 *
 * الرصيد يأتي من العرض `v_account_balances` لا من جمع صفوف الدفتر في الشاشة —
 * ولو جمعناها هنا لاختلف الرقم عن رصيد الصفحة الرئيسية أول ما يتجاوز الدفتر سقف
 * العرض (٢٠٠ صف)، وهو أسوأ أنواع الخطأ: رقمان صحيحان ظاهرياً ومختلفان.
 *
 * قيود بلا حساب: مستحق المتعهد يُقيَّد بحساب فارغ (NULL) لأنه التزام لا نقد،
 * فلا يظهر في كشف أي خزينة — يظهر في مقاصة المتعهدين. هذا مقصود، وشرحه في
 * تلميح الجدول حتى لا يبحث المالك عن مال لم يتحرك.
 */

export const metadata = { title: "الخزينة" };

const PATH = "/admin/finance/treasury";

type BalanceRow = {
  accountId: string;
  label: string;
  kind: string | null;
  openingBalance: number | null;
  totalIn: number | null;
  totalOut: number | null;
  balance: number | null;
};

type LedgerRow = {
  id: string;
  occurredAt: string | null;
  sourceType: string | null;
  sourceId: string | null;
  bookingId: string | null;
  subcontractorId: string | null;
  direction: string | null;
  amount: number | null;
  note: string | null;
};

type Loaded = {
  currency: string;
  balances: BalanceRow[];
  balancesReady: boolean;
  entries: LedgerRow[];
  entriesReady: boolean;
  missing: string | null;
};

/** رابط السجل الأصلي لكل نوع قيد — «من أين جاء هذا المبلغ؟» بضغطة واحدة */
function originHref(row: LedgerRow): { href: string; label: string } | null {
  if (row.bookingId) return { href: `/admin/orders/${row.bookingId}`, label: "الطلب" };
  if (row.subcontractorId) {
    return { href: `/admin/finance/partners/${row.subcontractorId}`, label: "كشف المتعهد" };
  }
  if (row.sourceType === "expense") {
    return { href: "/admin/finance/expenses", label: "المصروفات" };
  }
  return null;
}

async function loadScreen(
  accountId: string | null,
  start: string,
  end: string
): Promise<Loaded> {
  const blank: Loaded = {
    currency: "EGP",
    balances: [],
    balancesReady: false,
    entries: [],
    entriesReady: false,
    missing: "قاعدة البيانات",
  };

  const supabase = await createServerSupabase();
  if (!supabase) return blank;

  const [currency, balancesRes] = await Promise.all([
    readCurrency(supabase),
    supabase.from("v_account_balances").select("*"),
  ]);

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

  // الحساب المطلوب أو أوّل حساب — الشاشة لا تُفتح فارغة ما دام هناك حساب واحد
  const selected =
    (accountId && balances.some((b) => b.accountId === accountId) ? accountId : null) ??
    balances[0]?.accountId ??
    null;

  let entries: LedgerRow[] = [];
  let entriesReady = false;
  let entriesError: { code?: string } | null = null;

  if (selected) {
    // `select("*")` مقصود: الجدول يملكه وكيل SQL، والقراءة متسامحة مع أسماء
    // الأعمدة عبر `textOf`/`numberOf` بدل كسر الشاشة على عمود واحد مختلف.
    const res = await supabase
      .from("ledger_entries")
      .select("*")
      .eq("account_id", selected)
      .gte("occurred_at", start)
      .lt("occurred_at", end)
      .order("occurred_at", { ascending: false })
      .limit(MAX_LEDGER_ROWS);

    entriesReady = !res.error;
    entriesError = res.error;
    entries = res.error
      ? []
      : rowsOf(res.data).map((row) => ({
          id: String(row.id ?? crypto.randomUUID()),
          occurredAt: textOf(row, ["occurred_at", "occurredAt", "created_at"]),
          sourceType: textOf(row, ["source_type", "sourceType", "source"]),
          sourceId: textOf(row, ["source_id", "sourceId"]),
          bookingId: textOf(row, ["booking_id", "bookingId"]),
          subcontractorId: textOf(row, ["subcontractor_id", "subcontractorId"]),
          direction: textOf(row, ["direction"]),
          amount: numberOf(row, ["amount"]),
          note: textOf(row, ["note", "memo"]),
        }));
  }

  const missing =
    balancesRes.error && isMissingTable(balancesRes.error.code)
      ? "v_account_balances"
      : entriesError && isMissingTable(entriesError.code)
        ? "ledger_entries"
        : balancesRes.error || entriesError
          ? "قراءة دفتر الخزينة"
          : null;

  return { currency, balances, balancesReady: !balancesRes.error, entries, entriesReady, missing };
}

export default async function TreasuryPage({
  searchParams,
}: PageProps<"/admin/finance/treasury">) {
  const params = await searchParams;
  const range = resolveRange(params);
  const { start, end } = rangeInstants(range);
  const requested = typeof params.account === "string" ? params.account : null;

  const { currency, balances, balancesReady, entries, entriesReady, missing } = await loadScreen(
    requested,
    start,
    end
  );

  const wired = hasSupabaseEnv();
  const saved = params.saved === "1";
  const error = typeof params.error === "string" ? params.error : null;

  const account =
    balances.find((b) => b.accountId === requested) ?? balances[0] ?? null;
  const accountId = account?.accountId ?? null;
  const readOnly = !wired || !balancesReady || accountId === null;
  const today = cairoToday();

  const keep = accountId ? { account: accountId } : {};
  /**
   * حسابات نموذج التسوية = نفس حسابات العرض لا استعلام ثانٍ، فلا يمكن أن تعرض
   * البطاقات حساباً لا تجده في القائمة. الحساب المتوقف يقبل التسوية عمداً: إيقافه
   * يخفيه عن العملاء ولا يجمّد رصيده — و`active` هنا شأن العرض لا الدفتر.
   */
  const formAccounts = balances.map((b) => ({
    id: b.accountId,
    label: b.label,
    kind: b.kind,
    active: true,
  }));

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="flex items-center gap-2 font-heading text-lg font-bold">
          <Landmark className="size-5 text-primary" />
          الخزينة
        </h2>
        <HelpTip>
          كشف حركة حساب واحد: كل صف قيد كتبته قاعدة البيانات لحظة وقوع حدث حقيقي —
          اعتماد إيصال، تسجيل مصروف، دفعة لمتعهد، أو تسوية يدوية بسبب مكتوب. الأرصدة
          مشتقة من هذه القيود وحدها.
        </HelpTip>
        <Link
          href={hrefWith("/admin/finance", rangeParams(range))}
          className="ms-auto inline-flex items-center gap-1 text-sm text-primary hover:underline"
        >
          نظرة المالية العامة
          <ArrowLeft className="size-3.5" />
        </Link>
      </div>

      {(!wired || missing !== null) && (
        <FinanceNotReady wired={wired} missing={missing ?? "دفتر الخزينة"} />
      )}

      <FinanceFeedback
        saved={saved}
        savedMessage="سُجّلت التسوية وانعكست على رصيد الحساب فوراً."
        error={error}
      />

      {/* منتقي الحساب — نموذج GET يحافظ على الفترة المختارة */}
      {balancesReady && balances.length > 0 && (
        <form action={PATH} method="get">
          <Card className="flex flex-row flex-wrap items-end gap-3 p-4">
            {Object.entries(rangeParams(range)).map(([name, value]) => (
              <input key={name} type="hidden" name={name} value={value} />
            ))}
            <div className="min-w-56 flex-1 space-y-1.5">
              <Label htmlFor="account" className="flex items-center gap-1.5">
                حساب الخزينة
                <HelpTip>
                  المحافظ وحسابات انستا باي التي يحوّل إليها العملاء، مع الحسابات
                  الداخلية (نقدية وبنك). كلها حسابات خزينة واحدة النوع في الدفتر، وما
                  يميّز بعضها أنه يُعرض على العميل في صفحة التحويل.
                </HelpTip>
              </Label>
              <select
                id="account"
                name="account"
                defaultValue={accountId ?? ""}
                className={controlClass}
              >
                {balances.map((b) => (
                  <option key={b.accountId} value={b.accountId}>
                    {b.label} · {accountKindLabel(b.kind)}
                  </option>
                ))}
              </select>
            </div>
            <Button type="submit" size="sm">
              عرض
            </Button>
          </Card>
        </form>
      )}

      {balancesReady && balances.length === 0 && (
        <Card className="p-5 text-sm text-muted-foreground">
          لا حسابات خزينة بعد — أضف أول حساب من{" "}
          <Link href="/admin/payment-accounts" className="text-primary hover:underline">
            شاشة حسابات الدفع
          </Link>
          . أضف كذلك حساباً من نوع «نقدية» ليصير لدرج الكاش مكان في الدفتر.
        </Card>
      )}

      {account && (
        <>
          {/* الرصيد — أرقام العرض كما هي، لا مجموع صفوف الجدول أدناه */}
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <KpiCard
              title="الرصيد الحالي"
              value={<Money value={account.balance} currency={currency} />}
              sub={`${account.label} · ${accountKindLabel(account.kind)}`}
              icon={Wallet}
              tone={
                (account.balance ?? 0) < 0
                  ? "border-red-300 bg-red-50 dark:border-red-800 dark:bg-red-950/40"
                  : undefined
              }
              help="الرصيد الافتتاحي زائد كل الوارد ناقص كل المنصرف، محسوباً في العرض v_account_balances. لا يتقيّد بفترة الشاشة — هو رصيد الآن."
            />
            <KpiCard
              title="الرصيد الافتتاحي"
              value={<Money value={account.openingBalance} currency={currency} />}
              sub="رصيد الحساب لحظة إضافته للنظام"
              icon={Scale}
              help="نقطة البداية التي أدخلتها عند إنشاء الحساب. يدخل في الرصيد لكنه ليس قيداً في الدفتر، فلا تجده صفاً في الجدول أدناه."
            />
            <KpiCard
              title="إجمالي الوارد"
              value={<Money value={account.totalIn} currency={currency} />}
              sub="كل ما دخل هذا الحساب منذ إنشائه"
              icon={ArrowDownLeft}
              help="مجموع القيود ذات الاتجاه «وارد» على هذا الحساب: تحصيلات العملاء المعتمدة وتسويات الإدخال."
            />
            <KpiCard
              title="إجمالي المنصرف"
              value={<Money value={account.totalOut} currency={currency} />}
              sub="كل ما خرج من هذا الحساب منذ إنشائه"
              icon={ArrowUpRight}
              help="مجموع القيود ذات الاتجاه «منصرف»: المصروفات، دفعات المتعهدين، الردود للعملاء، وتسويات الإخراج."
            />
          </div>

          <RangeFilter
            basePath={PATH}
            range={range}
            keep={keep}
            disabled={!wired}
            note="الفترة تخص جدول الحركات أدناه فقط — بطاقات الرصيد لحظية."
          />

          {/* دفتر الحركة */}
          <Card className="space-y-4 p-5">
            <div>
              <h3 className="flex items-center gap-1.5 font-heading text-base font-bold">
                حركة الحساب
                <HelpTip>
                  كل صف قيد واحد في دفتر واحد. القيود التي لا حساب لها — مستحق المتعهد
                  لحظة تنفيذ الرحلة — لا تظهر هنا لأنها التزام لا نقد، ومكانها شاشة مقاصة
                  المتعهدين. ما تراه هنا مال تحرّك فعلاً.
                </HelpTip>
              </h3>
              <p className="text-sm text-muted-foreground">
                الأحدث أولاً، ضمن الفترة المختارة.
              </p>
            </div>

            {!entriesReady ? (
              <p className="text-sm text-muted-foreground">
                تعذّرت قراءة الدفتر — تأكد أن جدول <code dir="ltr">ledger_entries</code>{" "}
                منفَّذ في قاعدة البيانات (هجرة المرحلة ٧).
              </p>
            ) : entries.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                لا حركة على هذا الحساب في الفترة المختارة — وسّع الفترة من الأزرار
                السريعة أعلاه.
              </p>
            ) : (
              <>
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[48rem] text-sm">
                    <thead>
                      <tr className="border-b border-border text-xs text-muted-foreground">
                        <th className="p-2 text-start font-medium">التاريخ</th>
                        <th className="p-2 text-start font-medium">المصدر</th>
                        <th className="p-2 text-start font-medium">الاتجاه</th>
                        <th className="p-2 text-start font-medium">المبلغ</th>
                        <th className="p-2 text-start font-medium">الملاحظة</th>
                        <th className="p-2 text-start font-medium">السجل الأصلي</th>
                      </tr>
                    </thead>
                    <tbody>
                      {entries.map((row) => {
                        const origin = originHref(row);
                        return (
                          <tr
                            key={row.id}
                            className="border-b border-border align-top last:border-0"
                          >
                            <td className="p-2 text-xs whitespace-nowrap text-muted-foreground">
                              {dateTimeLabel(row.occurredAt)}
                            </td>
                            <td className="p-2">
                              <span className="inline-flex items-center gap-1.5">
                                <SourceBadge source={row.sourceType} />
                                {row.sourceType && SOURCE_HINTS[row.sourceType] ? (
                                  <HelpTip>{SOURCE_HINTS[row.sourceType]}</HelpTip>
                                ) : null}
                              </span>
                            </td>
                            <td className="p-2 text-xs">
                              <Badge
                                variant="outline"
                                className={cn(
                                  "font-normal",
                                  row.direction === "in"
                                    ? "border-emerald-300 text-emerald-800 dark:border-emerald-700 dark:text-emerald-200"
                                    : "border-red-300 text-red-800 dark:border-red-800 dark:text-red-200"
                                )}
                              >
                                {row.direction === "in" ? "وارد" : "منصرف"}
                              </Badge>
                            </td>
                            <td className="p-2">
                              <DirectedMoney
                                amount={row.amount}
                                direction={row.direction}
                                currency={currency}
                              />
                            </td>
                            <td className="max-w-[16rem] p-2 text-xs leading-relaxed">
                              {row.note ?? <span className="text-muted-foreground">—</span>}
                            </td>
                            <td className="p-2 text-xs whitespace-nowrap">
                              {origin ? (
                                <Link
                                  href={origin.href}
                                  className="inline-flex items-center gap-1 text-primary hover:underline"
                                >
                                  {origin.label}
                                  <ArrowLeft className="size-3" />
                                </Link>
                              ) : (
                                <span className="text-muted-foreground">—</span>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
                <p className="text-xs text-muted-foreground">
                  المعروض {toArabicDigits(entries.length)} قيداً
                  {entries.length === MAX_LEDGER_ROWS
                    ? ` (أحدث ${toArabicDigits(MAX_LEDGER_ROWS)} في الفترة — ضيّق الفترة للوصول للأقدم)`
                    : ""}
                  .
                </p>
              </>
            )}
          </Card>

          {/* التسوية اليدوية */}
          <form action={readOnly ? undefined : recordAdjustment}>
            <Card className="space-y-4 p-5">
              <div>
                <h3 className="flex items-center gap-1.5 font-heading text-base font-bold">
                  تسوية يدوية
                  <HelpTip>
                    قيد تكتبه بيدك حين يختلف الرصيد الفعلي عن رصيد النظام بسبب لا يمثّله
                    أي حدث في المنصة: عجز جرد، رسوم تحويل خصمها المزوّد، فرق تقريب، أو
                    تصحيح مبلغ أُدخل خطأً. التسوية لا تحذف قيداً سابقاً بل تضيف قيداً
                    مقابلاً — والدفتر يبقى كاملاً قابلاً للمراجعة.
                  </HelpTip>
                </h3>
                <p className="text-sm text-muted-foreground">
                  استخدمها آخر ما تستخدم: إن كان للفرق سبب في المنصة فسجّله من شاشته
                  (مصروف أو دفعة متعهد) ليبقى مرتبطاً بسجله.
                </p>
              </div>

              <input type="hidden" name="return_account" value={accountId ?? ""} />
              {Object.entries(rangeParams(range)).map(([name, value]) => (
                <input key={name} type="hidden" name={`return_${name}`} value={value} />
              ))}

              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                <AccountField
                  id="adjust-account"
                  name="account"
                  accounts={formAccounts}
                  defaultValue={accountId ?? undefined}
                  disabled={readOnly}
                  help="الحساب الذي يقع عليه أثر التسوية. الافتراضي هو الحساب المعروض."
                />
                <div className="space-y-1.5">
                  <Label htmlFor="adjust-direction" className="flex items-center gap-1.5">
                    الاتجاه
                    <HelpTip>
                      «وارد» يزيد الرصيد (وجدت مالاً لا يفسّره قيد)، و«منصرف» ينقصه (نقص
                      مال بلا مصروف مسجَّل).
                    </HelpTip>
                  </Label>
                  <select
                    id="adjust-direction"
                    name="direction"
                    defaultValue="in"
                    disabled={readOnly}
                    className={controlClass}
                  >
                    <option value="in">وارد — زيادة الرصيد</option>
                    <option value="out">منصرف — نقص الرصيد</option>
                  </select>
                </div>
                <AmountField
                  id="adjust-amount"
                  currency={currency}
                  disabled={readOnly}
                  help="قيمة الفرق موجبةً دائماً — الاتجاه هو ما يحدد أثرها على الرصيد."
                />
                <OccurredAtField id="adjust-date" today={today} disabled={readOnly} />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="adjust-note" className="flex items-center gap-1.5">
                  سبب التسوية (إلزامي)
                  <HelpTip>
                    اكتب سبباً يفهمه غيرك بعد ستة أشهر: «رسوم تحويل انستا باي ١٥ ج.م على
                    عملية ٣٠٠٠» لا «تسوية». هذا الحقل هو الفرق بين دفتر يُراجَع ودفتر
                    يُصدَّق على عواهنه.
                  </HelpTip>
                </Label>
                <textarea
                  id="adjust-note"
                  name="note"
                  rows={2}
                  required
                  minLength={4}
                  maxLength={500}
                  disabled={readOnly}
                  placeholder="مثال: عجز جرد درج الكاش بعد وردية ١٢ أغسطس"
                  className={cn(controlClass, "resize-y leading-relaxed")}
                />
              </div>

              <Separator />
              <div className="flex justify-end">
                <Button type="submit" disabled={readOnly}>
                  تسجيل التسوية
                </Button>
              </div>
            </Card>
          </form>
        </>
      )}
    </div>
  );
}
