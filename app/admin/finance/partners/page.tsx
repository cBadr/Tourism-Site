import { Fragment } from "react";
import Link from "next/link";
import { ArrowLeft, HandCoins, Handshake, Scale, X } from "lucide-react";

import { toArabicDigits } from "@/components/booking/format";
import { HelpTip } from "@/components/shared/HelpTip";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { isMissingTable } from "@/lib/dispatch/settings";
import { createServerSupabase } from "@/lib/supabase/server";
import { cn } from "@/lib/utils";
import { controlClass } from "../../orders/_components/booking-ui";
import {
  AccountField,
  AmountField,
  FinanceFeedback,
  FinanceNotReady,
  hasSupabaseEnv,
  hrefWith,
  Money,
  numberOf,
  OccurredAtField,
  readAccounts,
  readCurrency,
  rowsOf,
  SettlementBadge,
  settlementWording,
  textOf,
  type TreasuryAccount,
} from "../_components/finance-ui";
import { cairoToday } from "../_components/range";
import { recordPartnerPayout } from "./actions";

/**
 * مقاصة المتعهدين — الشاشة التي يعيش فيها التواء هذا النشاط المحاسبي.
 *
 * العميل يدفع لنا عرباناً ويسلّم الباقي **نقداً للسائق**. فالمتعهد يغادر الرحلة
 * وقد قبض جزءاً من مالنا، ونحن مدينون له بمستحقه كاملاً:
 *
 *     الصافي = ما استحقّه − ما حصّله نقداً من العملاء − ما سبق أن دفعناه له
 *
 * والنتيجة **قد تكون سالبة** فينقلب الشريك مديناً لنا. أي شاشة تفترض اتجاهاً
 * واحداً ستخطئ في نصف الرحلات، لذلك لا يُعرض الرقم عارياً هنا أبداً بل بصيغته:
 * «له علينا ٥٠٠ ج.م» أو «عليه لنا ٢٠٠ ج.م».
 *
 * الترتيب بالقيمة المطلقة لا بالإشارة: أكبر التزام وأكبر مبلغ عالق عندنا كلاهما
 * يستحق النظر أولاً — وفرزهما بالإشارة يدفن نصف المشكلة في آخر الجدول.
 */

export const metadata = { title: "مقاصة المتعهدين" };

const PATH = "/admin/finance/partners";

type Settlement = {
  subcontractorId: string;
  companyName: string;
  earned: number | null;
  collected: number | null;
  paid: number | null;
  netDue: number | null;
  absNetDue: number | null;
  tripsCount: number | null;
};

type Loaded = {
  currency: string;
  rows: Settlement[];
  ready: boolean;
  accounts: TreasuryAccount[];
  missing: string | null;
};

async function loadScreen(): Promise<Loaded> {
  const supabase = await createServerSupabase();
  if (!supabase) {
    return { currency: "EGP", rows: [], ready: false, accounts: [], missing: "قاعدة البيانات" };
  }

  const [currency, accountsRes, res] = await Promise.all([
    readCurrency(supabase),
    readAccounts(supabase),
    supabase.from("v_partner_settlements").select("*"),
  ]);

  if (res.error) {
    return {
      currency,
      rows: [],
      ready: false,
      accounts: accountsRes.accounts,
      missing: isMissingTable(res.error.code) ? "v_partner_settlements" : "قراءة المقاصة",
    };
  }

  const rows: Settlement[] = rowsOf(res.data)
    .map((row) => {
      const netDue = numberOf(row, ["net_due", "netDue"]);
      return {
        subcontractorId: textOf(row, ["subcontractor_id", "subcontractorId", "id"]) ?? "",
        companyName: textOf(row, ["company_name", "companyName", "name"]) ?? "متعهد بلا اسم",
        earned: numberOf(row, ["earned"]),
        collected: numberOf(row, ["collected"]),
        paid: numberOf(row, ["paid"]),
        netDue,
        // القيمة المطلقة من العرض إن وفّرها؛ وإلا تُشتق للترتيب والصياغة فقط
        absNetDue: numberOf(row, ["abs_net_due", "absNetDue"]),
        tripsCount: numberOf(row, ["trips_count", "tripsCount"]),
      };
    })
    .filter((row) => row.subcontractorId !== "");

  /**
   * الترتيب بحجم المبلغ لا بإشارته — ترتيب عرض لا حساب: لا رقم يُشتق منه ولا
   * يُعرض ناتجه، وكل مبلغ في الجدول يُطبع كما وصل من العرض.
   */
  rows.sort(
    (a, b) =>
      (b.absNetDue ?? Math.abs(b.netDue ?? 0)) - (a.absNetDue ?? Math.abs(a.netDue ?? 0))
  );

  return { currency, rows, ready: true, accounts: accountsRes.accounts, missing: null };
}

/** نموذج دفعة لمتعهد واحد — يظهر مكانه في الجدول عند اختيار «سجّل دفعة» */
function PayoutForm({
  partner,
  accounts,
  currency,
  today,
  readOnly,
}: {
  partner: Settlement;
  accounts: TreasuryAccount[];
  currency: string;
  today: string;
  readOnly: boolean;
}) {
  const { tone, text } = settlementWording(partner.netDue, partner.absNetDue, currency);
  const f = (name: string) => `pay-${partner.subcontractorId}-${name}`;

  return (
    <form action={readOnly ? undefined : recordPartnerPayout}>
      <input type="hidden" name="subcontractor" value={partner.subcontractorId} />
      <Card className="gap-4 border-primary/40 bg-primary/5 p-4 ring-0">
        <div className="flex flex-wrap items-center gap-2">
          <HandCoins className="size-4 text-primary" />
          <h4 className="font-heading text-sm font-bold">
            تسجيل دفعة لـ «{partner.companyName}»
          </h4>
          <span className="text-xs text-muted-foreground">الوضع الحالي: {text}</span>
          <Link
            href={PATH}
            className="ms-auto inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
          >
            <X className="size-3" />
            إغلاق
          </Link>
        </div>

        {tone === "they-owe" && (
          <p className="rounded-lg bg-amber-100 p-2 text-xs leading-relaxed text-amber-900 dark:bg-amber-950 dark:text-amber-100">
            انتبه: هذا الشريك <span className="font-semibold">مدين لنا</span> حالياً لأنه
            قبض من العملاء أكثر من مستحقه. تسجيل دفعة له الآن سيزيد ما لنا عنده — وهو
            تصرف صحيح فقط إن كنت تدفع مقدماً عن رحلات قادمة.
          </p>
        )}

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <AccountField
            id={f("account")}
            name="account"
            accounts={accounts}
            disabled={readOnly}
            label="الحساب المنصرف منه"
            help="الحساب الذي خرج منه المال فعلاً — درج الكاش عادةً في التسويات النقدية."
          />
          <AmountField
            id={f("amount")}
            currency={currency}
            disabled={readOnly}
            label={`المبلغ المدفوع (${currency})`}
            help="الدفعة الجزئية مسموحة: سجّل ما دفعته فعلاً، ويبقى الباقي ظاهراً في الصافي. لا تُقرَّب الأرقام لتُغلق الحساب."
          />
          <OccurredAtField
            id={f("date")}
            today={today}
            disabled={readOnly}
            label="تاريخ الدفع"
            help="اليوم الذي سلّمت فيه المبلغ فعلاً — عليه يقع القيد في الدفتر."
          />
          <div className="space-y-1.5">
            <Label htmlFor={f("note")} className="flex items-center gap-1.5">
              ملاحظة
              <HelpTip>
                اختيارية لكنها مفيدة: «تسوية رحلات أغسطس» أو «سُلّمت نقداً بمقر الشركة».
                تظهر في كشف حساب المتعهد وفي دفتر الخزينة.
              </HelpTip>
            </Label>
            <input
              id={f("note")}
              name="note"
              maxLength={500}
              disabled={readOnly}
              className={controlClass}
            />
          </div>
        </div>

        <div className="flex justify-end">
          <Button type="submit" size="sm" disabled={readOnly}>
            تسجيل الدفعة
          </Button>
        </div>
      </Card>
    </form>
  );
}

export default async function PartnersSettlementsPage({
  searchParams,
}: PageProps<"/admin/finance/partners">) {
  const [params, loaded] = await Promise.all([searchParams, loadScreen()]);
  const { currency, rows, ready, accounts, missing } = loaded;

  const wired = hasSupabaseEnv();
  const saved = params.saved === "1";
  const error = typeof params.error === "string" ? params.error : null;
  const paying = typeof params.pay === "string" ? params.pay : null;
  const readOnly = !wired || !ready;
  const today = cairoToday();

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="flex items-center gap-2 font-heading text-lg font-bold">
          <Scale className="size-5 text-primary" />
          مقاصة المتعهدين
        </h2>
        <HelpTip>
          لأن العميل يسلّم باقي الأجرة نقداً للسائق، فالحساب مع كل شريك ذو اتجاهين:
          مستحقاته عندنا، وما قبضه من عملائنا في يده. المقاصة تطرح الثاني من الأول —
          وقد يخرج الناتج في صالحه أو في صالحنا.
        </HelpTip>
        <Link
          href="/admin/finance"
          className="ms-auto inline-flex items-center gap-1 text-sm text-primary hover:underline"
        >
          نظرة المالية العامة
          <ArrowLeft className="size-3.5" />
        </Link>
      </div>

      {(!wired || missing !== null) && (
        <FinanceNotReady wired={wired} missing={missing ?? "عرض المقاصة"} />
      )}

      <FinanceFeedback
        saved={saved}
        savedMessage="سُجّلت الدفعة وانعكست على المقاصة ورصيد الحساب فوراً."
        error={error}
      />

      <Card className="gap-2 bg-muted/40 p-4 text-sm leading-relaxed ring-0">
        <p className="font-medium">كيف يُقرأ الصافي؟</p>
        <p className="text-muted-foreground">
          <span className="font-semibold text-foreground">له علينا</span> = مستحقاته تفوق
          ما قبضه ⇒ ندفع له الفرق.{" "}
          <span className="font-semibold text-foreground">عليه لنا</span> = قبض من
          العملاء أكثر من مستحقه ⇒ نُحصّل منه الفرق. الطرح كله يقع في العرض{" "}
          <code dir="ltr">v_partner_settlements</code> داخل قاعدة البيانات.
        </p>
      </Card>

      {ready && rows.length === 0 && (
        <Card className="p-5 text-sm text-muted-foreground">
          لا مقاصة مفتوحة مع أي متعهد — لم تُنفَّذ رحلات مُسندة بعد، أو أن كل الحسابات
          مسوّاة بالكامل.
        </Card>
      )}

      {rows.length > 0 && (
        <>
          {/* شاشات كبيرة: جدول */}
          <Card className="hidden p-0 md:block">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[54rem] text-sm">
                <thead>
                  <tr className="border-b border-border text-xs text-muted-foreground">
                    <th className="p-2 text-start font-medium">المتعهد</th>
                    <th className="p-2 text-start font-medium">الرحلات</th>
                    <th className="p-2 text-start font-medium">
                      <span className="inline-flex items-center gap-1">
                        استحقّ
                        <HelpTip>
                          مجموع مستحقاته عن الرحلات التي نفّذها — بالمبلغ المتفق عليه لحظة
                          الإسناد.
                        </HelpTip>
                      </span>
                    </th>
                    <th className="p-2 text-start font-medium">
                      <span className="inline-flex items-center gap-1">
                        حصّل نقداً
                        <HelpTip>
                          ما قبضه من العملاء مباشرة نيابةً عنا (باقي الأجرة مع السائق). لم
                          يدخل خزينتنا، ويُخصم من مستحقه لأنه صار في يده.
                        </HelpTip>
                      </span>
                    </th>
                    <th className="p-2 text-start font-medium">
                      <span className="inline-flex items-center gap-1">
                        سُدّد له
                        <HelpTip>مجموع الدفعات التي سلّمناها له من خزائننا.</HelpTip>
                      </span>
                    </th>
                    <th className="p-2 text-start font-medium">الصافي</th>
                    <th className="p-2 text-start font-medium" />
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row) => {
                    const open = paying === row.subcontractorId;
                    return (
                      <Fragment key={row.subcontractorId}>
                        <tr
                          className={cn(
                            "border-b border-border last:border-0",
                            open && "bg-primary/5"
                          )}
                        >
                          <td className="p-2">
                            <Link
                              href={`/admin/finance/partners/${row.subcontractorId}`}
                              className="font-medium transition-colors hover:text-primary hover:underline"
                            >
                              {row.companyName}
                            </Link>
                          </td>
                          <td className="p-2" dir="ltr">
                            {row.tripsCount === null ? "—" : toArabicDigits(row.tripsCount)}
                          </td>
                          <td className="p-2">
                            <Money value={row.earned} currency={currency} />
                          </td>
                          <td className="p-2">
                            <Money value={row.collected} currency={currency} />
                          </td>
                          <td className="p-2">
                            <Money value={row.paid} currency={currency} />
                          </td>
                          <td className="p-2">
                            <SettlementBadge
                              netDue={row.netDue}
                              absNetDue={row.absNetDue}
                              currency={currency}
                            />
                          </td>
                          <td className="p-2 text-xs whitespace-nowrap">
                            <Link
                              href={
                                open ? PATH : hrefWith(PATH, { pay: row.subcontractorId })
                              }
                              className="text-primary hover:underline"
                            >
                              {open ? "إغلاق" : "سجّل دفعة"}
                            </Link>
                            <span className="mx-1 text-muted-foreground">·</span>
                            <Link
                              href={`/admin/finance/partners/${row.subcontractorId}`}
                              className="text-primary hover:underline"
                            >
                              كشف الحساب
                            </Link>
                          </td>
                        </tr>
                        {open && (
                          <tr className="border-b border-border">
                            <td colSpan={7} className="p-2">
                              <PayoutForm
                                partner={row}
                                accounts={accounts}
                                currency={currency}
                                today={today}
                                readOnly={readOnly}
                              />
                            </td>
                          </tr>
                        )}
                      </Fragment>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </Card>

          {/* الموبايل: بطاقات */}
          <div className="space-y-3 md:hidden">
            {rows.map((row) => {
              const open = paying === row.subcontractorId;
              return (
                <Card key={row.subcontractorId} className="gap-2 p-4">
                  <div className="flex flex-wrap items-center gap-2">
                    <Handshake className="size-4 text-primary" />
                    <Link
                      href={`/admin/finance/partners/${row.subcontractorId}`}
                      className="font-medium transition-colors hover:text-primary hover:underline"
                    >
                      {row.companyName}
                    </Link>
                    <span className="ms-auto text-xs text-muted-foreground">
                      {row.tripsCount === null
                        ? "—"
                        : `${toArabicDigits(row.tripsCount)} رحلة`}
                    </span>
                  </div>
                  <div className="grid grid-cols-3 gap-2 text-xs">
                    <span>
                      <span className="block text-muted-foreground">استحقّ</span>
                      <Money value={row.earned} currency={currency} />
                    </span>
                    <span>
                      <span className="block text-muted-foreground">حصّل نقداً</span>
                      <Money value={row.collected} currency={currency} />
                    </span>
                    <span>
                      <span className="block text-muted-foreground">سُدّد له</span>
                      <Money value={row.paid} currency={currency} />
                    </span>
                  </div>
                  <SettlementBadge
                    netDue={row.netDue}
                    absNetDue={row.absNetDue}
                    currency={currency}
                  />
                  <div className="flex flex-wrap items-center gap-3 text-xs">
                    <Link
                      href={open ? PATH : hrefWith(PATH, { pay: row.subcontractorId })}
                      className="text-primary hover:underline"
                    >
                      {open ? "إغلاق نموذج الدفع" : "سجّل دفعة"}
                    </Link>
                    <Link
                      href={`/admin/finance/partners/${row.subcontractorId}`}
                      className="inline-flex items-center gap-1 text-primary hover:underline"
                    >
                      كشف الحساب
                      <ArrowLeft className="size-3" />
                    </Link>
                  </div>
                  {open && (
                    <PayoutForm
                      partner={row}
                      accounts={accounts}
                      currency={currency}
                      today={today}
                      readOnly={readOnly}
                    />
                  )}
                </Card>
              );
            })}
          </div>

          <p className="text-xs text-muted-foreground">
            {toArabicDigits(rows.length)} متعهد، مرتّبون بحجم الصافي لا بإشارته — فأكبر
            التزام علينا وأكبر مبلغ عالق عندهم كلاهما في الأعلى.
          </p>
        </>
      )}
    </div>
  );
}
