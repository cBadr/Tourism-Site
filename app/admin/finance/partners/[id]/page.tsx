import Link from "next/link";
import { ArrowLeft, ScrollText } from "lucide-react";

import { toArabicDigits } from "@/components/booking/format";
import { HelpTip } from "@/components/shared/HelpTip";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { isMissingFunction } from "@/lib/dispatch/settings";
import { getSettings } from "@/lib/settings";
import { createServerSupabase } from "@/lib/supabase/server";
import { cn } from "@/lib/utils";
import { dateTimeLabel } from "../../../orders/_components/booking-ui";
import {
  FinanceNotReady,
  firstRow,
  hasSupabaseEnv,
  MAX_STATEMENT_ROWS,
  Money,
  numberOf,
  RangeFilter,
  readCurrency,
  rowsOf,
  SettlementBadge,
  settlementWording,
  type Supabase,
  textOf,
} from "../../_components/finance-ui";
import { PrintButton } from "../../_components/print-button";
import { type DateRange, rangeSentence, resolveRange } from "../../_components/range";

/**
 * كشف حساب متعهد — الورقة التي تُطبع وتُسلَّم للشريك عند التسوية.
 *
 * ثلاثة قرارات تحكم الشاشة:
 *
 * (١) **الترتيب زمني تصاعدي** لا تنازلي كبقية الجداول. الكشف يُقرأ من البداية:
 *     كل سطر يبني الرصيد الذي بعده، وقلبه يجعل عمود «الرصيد» لغزاً.
 *
 * (٢) **الرصيد لا يُجمع هنا.** عمود الرصيد التراكمي يصل محسوباً من دالة
 *     `partner_statement`؛ جمعه في الواجهة كان سيعطي رقماً يختلف عن رقم شاشة
 *     المقاصة أول ما يتجاوز الكشف سقف الصفوف أو يتغيّر ترتيب سطرين بنفس اللحظة.
 *
 * (٣) **يُطبع أبيض على أسود بلا شريط جانبي.** قواعد `@media print` أدناه تخفي
 *     تنقّل اللوحة والفلاتر وتفكّ ألوان البطاقات، فتخرج ورقة تُسلَّم لطرف ثانٍ
 *     لا لقطة شاشة من لوحة تحكم.
 */

export const metadata = { title: "كشف حساب متعهد" };

type StatementLine = {
  key: string;
  occurredAt: string | null;
  kind: string | null;
  reference: string | null;
  debit: number | null;
  credit: number | null;
  balance: number | null;
  note: string | null;
};

type Summary = {
  companyName: string | null;
  earned: number | null;
  collected: number | null;
  paid: number | null;
  netDue: number | null;
  absNetDue: number | null;
  tripsCount: number | null;
};

type Loaded = {
  currency: string;
  lines: StatementLine[];
  linesReady: boolean;
  summary: Summary | null;
  missing: string | null;
};

const KIND_LABELS: Record<string, string> = {
  trip: "رحلة منفَّذة",
  collection: "تحصيل نقدي قبضه",
  payout: "دفعة سُدّدت له",
  adjustment: "تسوية",
};

const KIND_HINTS: Record<string, string> = {
  trip: "رحلة نفّذها الشريك فاستحق عنها المبلغ المتفق عليه لحظة الإسناد.",
  collection: "باقي الأجرة الذي قبضه نقداً من العميل نيابةً عنا — مالنا في يده.",
  payout: "دفعة سلّمناها له من إحدى خزائننا.",
  adjustment: "تسوية يدوية بسبب مكتوب — خصم اتفاقي، غرامة، أو تصحيح إدخال.",
};

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * استدعاء `partner_statement`.
 *
 * الاسم مُتحقَّق من كتالوج قاعدة البيانات: `p_subcontractor_id`. كان هنا احتياط
 * يجرّب `p_sub` أولاً ثم يعيد المحاولة، فكان **كل** تحميل للصفحة يحرق نداءً
 * فاشلاً قبل الصحيح. حُذف بعد حسم الاسم في `lib/finance-types.ts`.
 */
async function callStatement(supabase: Supabase, id: string, range: DateRange) {
  return supabase.rpc("partner_statement", {
    p_subcontractor_id: id,
    p_from: range.from,
    p_to: range.to,
  });
}

/** اسم الشركة من سجل المتعهدين — احتياط حين لا صف مقاصة له بعد */
async function fallbackName(supabase: Supabase, id: string): Promise<string | null> {
  try {
    const res = await supabase.from("subcontractors").select("*").eq("id", id).maybeSingle();
    if (res.error || !res.data) return null;
    return textOf(res.data as Record<string, unknown>, ["company_name", "name", "title"]);
  } catch {
    return null;
  }
}

async function loadStatement(id: string, range: DateRange): Promise<Loaded> {
  const blank: Loaded = {
    currency: "EGP",
    lines: [],
    linesReady: false,
    summary: null,
    missing: "قاعدة البيانات",
  };

  const supabase = await createServerSupabase();
  if (!supabase) return blank;

  const [currency, statementRes, settlementRes] = await Promise.all([
    readCurrency(supabase),
    callStatement(supabase, id, range),
    supabase.from("v_partner_settlements").select("*").eq("subcontractor_id", id).maybeSingle(),
  ]);

  const lines: StatementLine[] = statementRes.error
    ? []
    : rowsOf(statementRes.data)
        .slice(0, MAX_STATEMENT_ROWS)
        .map((row, index) => ({
          key: `${textOf(row, ["occurred_at", "occurredAt"]) ?? index}-${index}`,
          occurredAt: textOf(row, ["occurred_at", "occurredAt"]),
          kind: textOf(row, ["kind", "type"]),
          reference: textOf(row, ["reference", "ref"]),
          debit: numberOf(row, ["debit"]),
          credit: numberOf(row, ["credit"]),
          balance: numberOf(row, ["balance", "running_balance"]),
          note: textOf(row, ["note", "memo"]),
        }));

  const settlementRow = settlementRes.error ? null : firstRow(settlementRes.data);
  const summary: Summary | null = settlementRow
    ? {
        companyName: textOf(settlementRow, ["company_name", "companyName", "name"]),
        earned: numberOf(settlementRow, ["earned"]),
        collected: numberOf(settlementRow, ["collected"]),
        paid: numberOf(settlementRow, ["paid"]),
        netDue: numberOf(settlementRow, ["net_due", "netDue"]),
        absNetDue: numberOf(settlementRow, ["abs_net_due", "absNetDue"]),
        tripsCount: numberOf(settlementRow, ["trips_count", "tripsCount"]),
      }
    : null;

  const companyName = summary?.companyName ?? (await fallbackName(supabase, id));

  const missing =
    statementRes.error && isMissingFunction(statementRes.error.code)
      ? "partner_statement"
      : statementRes.error
        ? "قراءة كشف الحساب"
        : null;

  return {
    currency,
    lines,
    linesReady: !statementRes.error,
    summary: summary ? { ...summary, companyName } : companyName ? {
      companyName,
      earned: null,
      collected: null,
      paid: null,
      netDue: null,
      absNetDue: null,
      tripsCount: null,
    } : null,
    missing,
  };
}

/**
 * قواعد الطباعة — تُحقن مع هذه الصفحة وحدها.
 *
 * الشريط الجانبي والشريط العلوي عنصرا `aside` و`header` في هيكل اللوحة، وهذه
 * الصفحة لا تستعمل الوسمين، فإخفاؤهما هنا آمن. وما عداهما: خلفيات شفافة وخط
 * أسود وحدود رمادية — حبر أقل وورقة تُقرأ.
 */
const PRINT_CSS = `
@media print {
  aside, header, .no-print { display: none !important; }
  main { padding: 0 !important; }
  html, body { background: #fff !important; color: #000 !important; }
  .statement-sheet, .statement-sheet * {
    background: transparent !important;
    color: #000 !important;
    box-shadow: none !important;
    --tw-ring-shadow: 0 0 #0000 !important;
  }
  .statement-sheet { max-width: none !important; }
  .statement-sheet table { border-collapse: collapse !important; width: 100% !important; }
  .statement-sheet th, .statement-sheet td {
    border-bottom: 1px solid #999 !important;
    padding: 4px 6px !important;
  }
  .statement-sheet thead { display: table-header-group; }
  .statement-sheet tr { break-inside: avoid; }
  .statement-sheet .print-box { border: 1px solid #999 !important; }
  @page { margin: 14mm; }
}
`;

export default async function PartnerStatementPage({
  params,
  searchParams,
}: PageProps<"/admin/finance/partners/[id]">) {
  const [{ id }, query, settings] = await Promise.all([params, searchParams, getSettings()]);
  const range = resolveRange(query);
  const valid = UUID_PATTERN.test(id);

  const loaded = valid
    ? await loadStatement(id, range)
    : {
        currency: "EGP",
        lines: [],
        linesReady: false,
        summary: null,
        missing: "معرّف المتعهد",
      };
  const { currency, lines, linesReady, summary, missing } = loaded;

  const wired = hasSupabaseEnv();
  const partnerName = summary?.companyName ?? "متعهد";
  const closing = lines.length > 0 ? lines[lines.length - 1].balance : null;

  return (
    <div className="statement-sheet mx-auto max-w-5xl space-y-5">
      <style>{PRINT_CSS}</style>

      <div className="flex flex-wrap items-center gap-2 no-print">
        <h2 className="flex items-center gap-2 font-heading text-lg font-bold">
          <ScrollText className="size-5 text-primary" />
          كشف حساب متعهد
        </h2>
        <HelpTip>
          سجل زمني لكل ما بيننا وبين الشريك: ما استحقه عن رحلاته، وما قبضه نقداً من
          عملائنا، وما سلّمناه له. عمود الرصيد يتراكم سطراً بسطر، وآخر سطر فيه هو الرقم
          الذي تُبنى عليه التسوية.
        </HelpTip>
        <div className="ms-auto flex flex-wrap items-center gap-2">
          <PrintButton />
          {/* نموذج التسديد يعيش في شاشة المقاصات؛ بدون هذا الرابط كان الكشف
              طريقاً مسدوداً: يقول «سجّل الدفعة» ولا سبيل إليها من هنا. */}
          <Link
            href={`/admin/finance/partners?pay=${id}`}
            className="no-print inline-flex items-center gap-1 rounded-lg bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            سجّل دفعة
          </Link>
          <Link
            href="/admin/finance/partners"
            className="inline-flex items-center gap-1 text-sm text-primary hover:underline"
          >
            كل المقاصات
            <ArrowLeft className="size-3.5" />
          </Link>
        </div>
      </div>

      {(!wired || missing !== null) && (
        <div className="no-print">
          <FinanceNotReady wired={wired} missing={missing ?? "دالة كشف الحساب"} />
        </div>
      )}

      {/* ترويسة الكشف — هي وحدها ما يظهر أعلى الورقة المطبوعة */}
      <Card className="print-box gap-3 p-5">
        <div className="flex flex-wrap items-baseline gap-2">
          <span className="font-heading text-base font-bold">{settings.brand.name}</span>
          <span className="text-sm text-muted-foreground">— كشف حساب متعهد</span>
        </div>
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
          <span>
            <span className="text-muted-foreground">المتعهد: </span>
            <span className="font-semibold">{partnerName}</span>
          </span>
          <span>
            <span className="text-muted-foreground">الفترة: </span>
            {rangeSentence(range)}
          </span>
          <span>
            <span className="text-muted-foreground">العملة: </span>
            {currency}
          </span>
          {summary?.tripsCount !== null && summary?.tripsCount !== undefined && (
            <span>
              <span className="text-muted-foreground">رحلات منفَّذة: </span>
              {toArabicDigits(summary.tripsCount)}
            </span>
          )}
        </div>

        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <div>
            <span className="flex items-center gap-1 text-xs text-muted-foreground">
              استحقّ عن رحلاته
              <HelpTip>
                مجموع مستحقاته عن كل الرحلات المنفَّذة — بالمبلغ المتفق عليه لحظة الإسناد
                لا بتقدير لاحق.
              </HelpTip>
            </span>
            <Money value={summary?.earned ?? null} currency={currency} className="font-semibold" />
          </div>
          <div>
            <span className="flex items-center gap-1 text-xs text-muted-foreground">
              حصّل نقداً من العملاء
              <HelpTip>
                باقي الأجرة الذي سلّمه العملاء للسائق مباشرة. لم يدخل خزائننا، ويُخصم من
                مستحقه لأنه صار في يده.
              </HelpTip>
            </span>
            <Money
              value={summary?.collected ?? null}
              currency={currency}
              className="font-semibold"
            />
          </div>
          <div>
            <span className="flex items-center gap-1 text-xs text-muted-foreground">
              سُدّد له
              <HelpTip>مجموع الدفعات التي خرجت من خزائننا إليه.</HelpTip>
            </span>
            <Money value={summary?.paid ?? null} currency={currency} className="font-semibold" />
          </div>
          <div>
            <span className="flex items-center gap-1 text-xs text-muted-foreground">
              الصافي الآن
              <HelpTip>
                محصّلة الحساب كله لا الفترة المعروضة وحدها. موجب = ندفع له، سالب = نُحصّل
                منه — والصياغة تقول الاتجاه بالكلمات.
              </HelpTip>
            </span>
            <SettlementBadge
              netDue={summary?.netDue ?? null}
              absNetDue={summary?.absNetDue ?? null}
              currency={currency}
              withHint={false}
            />
          </div>
        </div>

        {summary?.netDue !== null && summary?.netDue !== undefined && (
          <p className="text-xs leading-relaxed text-muted-foreground">
            {settlementWording(summary.netDue, summary.absNetDue, currency).hint}
          </p>
        )}
      </Card>

      <div className="no-print">
        <RangeFilter
          basePath={`/admin/finance/partners/${id}`}
          range={range}
          disabled={!wired}
          note="الفترة تخص سطور الكشف أدناه؛ بطاقات الترويسة تعرض الحساب كاملاً."
        />
      </div>

      <Card className="print-box space-y-4 p-5">
        <div className="flex flex-wrap items-center gap-2">
          <h3 className="font-heading text-base font-bold">حركة الحساب</h3>
          <span className="text-xs text-muted-foreground">
            مرتّبة زمنياً من الأقدم إلى الأحدث — الرصيد يتراكم سطراً بسطر.
          </span>
          {closing !== null && (
            <Badge variant="secondary" className="ms-auto">
              رصيد آخر سطر: <Money value={closing} currency={currency} />
            </Badge>
          )}
        </div>

        {!linesReady ? (
          <p className="text-sm text-muted-foreground">
            تعذّرت قراءة الكشف — تأكد أن دالة <code dir="ltr">partner_statement</code>{" "}
            منفَّذة في قاعدة البيانات (هجرة المرحلة ٧).
          </p>
        ) : lines.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            لا حركة على حساب هذا الشريك في الفترة المختارة — وسّع الفترة من الأزرار
            السريعة أعلاه.
          </p>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[46rem] text-sm">
                <thead>
                  <tr className="border-b border-border text-xs text-muted-foreground">
                    <th className="p-2 text-start font-medium">التاريخ</th>
                    <th className="p-2 text-start font-medium">البيان</th>
                    <th className="p-2 text-start font-medium">المرجع</th>
                    <th className="p-2 text-start font-medium">
                      <span className="inline-flex items-center gap-1">
                        له علينا (دائن)
                        <HelpTip>
                          ما يزيد التزامنا تجاهه: مستحق رحلة نفّذها. يرفع رصيده في صالحه.
                        </HelpTip>
                      </span>
                    </th>
                    <th className="p-2 text-start font-medium">
                      <span className="inline-flex items-center gap-1">
                        عليه لنا (مدين)
                        <HelpTip>
                          ما ينقص التزامنا تجاهه: نقد قبضه من عملائنا، أو دفعة سلّمناها
                          له.
                        </HelpTip>
                      </span>
                    </th>
                    <th className="p-2 text-start font-medium">الرصيد بعد السطر</th>
                    <th className="p-2 text-start font-medium">ملاحظة</th>
                  </tr>
                </thead>
                <tbody>
                  {lines.map((line) => (
                    <tr key={line.key} className="border-b border-border align-top last:border-0">
                      <td className="p-2 text-xs whitespace-nowrap text-muted-foreground">
                        {dateTimeLabel(line.occurredAt)}
                      </td>
                      <td className="p-2 whitespace-nowrap">
                        <span className="inline-flex items-center gap-1">
                          {(line.kind && KIND_LABELS[line.kind]) ?? line.kind ?? "—"}
                          {line.kind && KIND_HINTS[line.kind] ? (
                            <HelpTip>{KIND_HINTS[line.kind]}</HelpTip>
                          ) : null}
                        </span>
                      </td>
                      <td className="p-2 text-xs" dir="ltr">
                        {line.reference ?? <span className="text-muted-foreground">—</span>}
                      </td>
                      <td className="p-2 text-emerald-700 dark:text-emerald-300">
                        {line.credit ? <Money value={line.credit} currency={currency} /> : "—"}
                      </td>
                      <td className="p-2 text-sky-700 dark:text-sky-300">
                        {line.debit ? <Money value={line.debit} currency={currency} /> : "—"}
                      </td>
                      <td
                        className={cn(
                          "p-2 font-medium",
                          (line.balance ?? 0) < 0 && "text-sky-700 dark:text-sky-300"
                        )}
                      >
                        <Money value={line.balance} currency={currency} />
                      </td>
                      <td className="max-w-[14rem] p-2 text-xs leading-relaxed">
                        {line.note ?? <span className="text-muted-foreground">—</span>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <p className="text-xs leading-relaxed text-muted-foreground">
              {toArabicDigits(lines.length)} سطراً
              {lines.length === MAX_STATEMENT_ROWS
                ? ` (أول ${toArabicDigits(MAX_STATEMENT_ROWS)} في الفترة — ضيّق الفترة لرؤية البقية)`
                : ""}
              . الرصيد الموجب يعني أن له علينا، والسالب أن عليه لنا. كل مبلغ في هذا الكشف
              محسوب في قاعدة البيانات.
            </p>
          </>
        )}
      </Card>

      <p className="text-xs text-muted-foreground no-print">
        للطباعة أو الحفظ كـ PDF استخدم زر «طباعة الكشف» أعلاه — تُطبع الورقة بلا قوائم
        اللوحة وبالأسود على الأبيض.
      </p>
    </div>
  );
}
