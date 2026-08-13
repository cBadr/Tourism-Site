import Link from "next/link";
import { ArrowLeft, Ban, ScrollText } from "lucide-react";

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
  readPartnerCredit,
  rowsOf,
  type SettlementCredit,
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
 *
 * ── هجرة 0029: الحدّ الرابع في ورقة تُسلَّم بيد صاحبها ────────────────────────
 * صارت المعادلة `earned − collected − paid + received`، ولهذه الصفحة تحديداً أثرٌ
 * أخطر من غيرها: **مستند يخرج من المكتب**. فلزم أمران معاً — بطاقة «سدّده لنا»
 * أعلى الورقة كي تُطابِق أرقامُ الترويسة الصافيَ المطبوع تحتها، وتسمية عربية
 * للنوع `settlement` في `KIND_LABELS` كي لا يُطبع رمزٌ لاتيني على السطر الذي
 * يوثّق سداد الشريك نفسه. وكلاهما وقع فعلاً قبل الإصلاح.
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
  /**
   * `received` — ما سدّده لنا (هجرة 0029)، الحدّ الرابع في المعادلة.
   *
   * بدونه كانت الورقة المطبوعة تعرض ثلاثة أرقام وصافياً **لا يساوي طرحها**:
   * شريكٌ سدّد ١٬٠٠٠ يستلم مستنداً لا يقفل حسابه بيده. و`null` تعني «العمود
   * غير موجود» أي قاعدة قبل 0029 — لا «لم يسدّد شيئاً».
   */
  received: number | null;
  netDue: number | null;
  absNetDue: number | null;
  tripsCount: number | null;
  /** `owed_to_us` من العرض (0027) — الرقم الذي تقارنه القاعدة بالسقف حرفياً */
  owedToUs: number | null;
  /**
   * `over_limit` من العرض (0027) — **بلوغ السقف وحده**، لا يقرأ «حجب العروض».
   * null = عمود غائب أي قاعدة لم تُهاجر بعد.
   */
  overLimit: boolean | null;
};

/** ملخص فارغ لشريك لا صفّ مقاصة له بعد — «غير معروف» لا صفر */
const BLANK_SUMMARY: Omit<Summary, "companyName"> = {
  earned: null,
  collected: null,
  paid: null,
  received: null,
  netDue: null,
  absNetDue: null,
  tripsCount: null,
  owedToUs: null,
  overLimit: null,
};

type Loaded = {
  currency: string;
  lines: StatementLine[];
  linesReady: boolean;
  summary: Summary | null;
  /**
   * `block_dispatch` من جدول الإعدادات — **لا من العرض**. `null` = لم يُقرأ
   * الصف، فلا تُقال جملة عن توقّف الإسناد في أيٍّ من الاتجاهين.
   */
  blockDispatch: boolean | null;
  missing: string | null;
};

/**
 * تسميات أنواع السطور — **خمسة لا أربعة** منذ 0029.
 *
 * `settlement` هو الدور الرابع (`received`) كما تسمّيه `partner_statement`.
 * وغيابه من هذا الجدول كان يُسقط السطر على الاحتياط فيُطبع الرمز اللاتيني
 * `settlement` عارياً وسط ورقة عربية بالكامل — وعلى السطر الذي يوثّق **سداد
 * الشريك نفسه** في مستند يُسلَّم له بيده. أي نوع جديد في الدالة يُضاف هنا معه.
 */
const KIND_LABELS: Record<string, string> = {
  trip: "رحلة منفَّذة",
  collection: "تحصيل نقدي قبضه",
  payout: "دفعة سُدّدت له",
  settlement: "سدّده لنا",
  adjustment: "تسوية",
};

const KIND_HINTS: Record<string, string> = {
  trip: "رحلة نفّذها الشريك فاستحق عنها المبلغ المتفق عليه لحظة الإسناد.",
  collection: "باقي الأجرة الذي قبضه نقداً من العميل نيابةً عنا — مالنا في يده.",
  payout: "دفعة سلّمناها له من إحدى خزائننا.",
  settlement:
    "مبلغ ردّه الشريك إلينا نقداً أو تحويلاً فدخل إحدى خزائننا — قيدٌ واحد رفع رصيد الحساب وأنقص ما عليه لنا معاً. ومرجع التحويل في عمود «المرجع» بجواره.",
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
    blockDispatch: null,
    missing: "قاعدة البيانات",
  };

  const supabase = await createServerSupabase();
  if (!supabase) return blank;

  const [currency, statementRes, settlementRes, credit] = await Promise.all([
    readCurrency(supabase),
    callStatement(supabase, id, range),
    supabase.from("v_partner_settlements").select("*").eq("subcontractor_id", id).maybeSingle(),
    // مفتاح «حجب العروض» لا يعيش في العرض — وبدونه لا يجوز قول «الإسناد متوقف»
    readPartnerCredit(supabase),
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
  const rawOverLimit = settlementRow?.over_limit ?? settlementRow?.overLimit;
  const summary: Summary | null = settlementRow
    ? {
        companyName: textOf(settlementRow, ["company_name", "companyName", "name"]),
        earned: numberOf(settlementRow, ["earned"]),
        collected: numberOf(settlementRow, ["collected"]),
        paid: numberOf(settlementRow, ["paid"]),
        // عمود 0029 — `null` يعني «القاعدة لم تُهاجر» فتظهر «—» لا صفراً كاذباً
        received: numberOf(settlementRow, ["received"]),
        netDue: numberOf(settlementRow, ["net_due", "netDue"]),
        absNetDue: numberOf(settlementRow, ["abs_net_due", "absNetDue"]),
        tripsCount: numberOf(settlementRow, ["trips_count", "tripsCount"]),
        owedToUs: numberOf(settlementRow, ["owed_to_us", "owedToUs"]),
        overLimit: typeof rawOverLimit === "boolean" ? rawOverLimit : null,
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
    summary: summary
      ? { ...summary, companyName }
      : companyName
        ? { companyName, ...BLANK_SUMMARY }
        : null,
    // `loaded: false` تعني «لم يُقرأ الصف» — وهي ليست «الحجب مطفأ»
    blockDispatch: credit.loaded ? credit.settings.blockDispatch : null,
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
        blockDispatch: null,
        missing: "معرّف المتعهد",
      };
  const { currency, lines, linesReady, summary, blockDispatch, missing } = loaded;

  const wired = hasSupabaseEnv();
  const partnerName = summary?.companyName ?? "متعهد";
  const closing = lines.length > 0 ? lines[lines.length - 1].balance : null;

  /**
   * صياغة واحدة للشاشة كلها: الوسم في الترويسة، وجملة الإشارة تحتها، وبطاقة
   * السقف — كلها من `settlementWording` لا من نصوص مكرّرة هنا.
   */
  const credit: SettlementCredit = {
    owedToUs: summary?.owedToUs ?? null,
    overLimit: summary?.overLimit ?? null,
    blockDispatch,
  };
  const wording = settlementWording(
    summary?.netDue ?? null,
    summary?.absNetDue ?? null,
    currency,
    credit
  );

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
          عملائنا، وما سلّمناه له، وما سدّده لنا. عمود الرصيد يتراكم سطراً بسطر، وآخر سطر
          فيه هو الرقم الذي تُبنى عليه التسوية.
        </HelpTip>
        <div className="ms-auto flex flex-wrap items-center gap-2">
          <PrintButton />
          {/* لوح التسوية يعيش في شاشة المقاصات؛ بدون هذا الرابط كان الكشف طريقاً
              مسدوداً: يقول «سجّل الدفعة» ولا سبيل إليها من هنا. والاسم «تسوية» لا
              «دفعة» منذ 0029: اللوح يقرأ `net_due` ويفتح فرع الدفع أو فرع التحصيل
              بنفسه، فوعدُ زرٍّ بالدفع وحده يكذب على نصف المتعهدين. */}
          <Link
            href={`/admin/finance/partners?pay=${id}`}
            className="no-print inline-flex items-center gap-1 rounded-lg bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            تسوية مع المتعهد
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

        {/*
          ست بطاقات: حدود المعادلة الأربعة بترتيبها، ثم الدين، ثم الصافي.
          والرابع (‏«سدّده لنا») ليس زينة: بدونه تُطبع ثلاثة أرقام وصافٍ لا
          يساوي طرحها، فيخرج الشريك بورقة لا تقفل بيده — وأول من يشك فيها هو
          من سدّد للتوّ ألفاً لا يجدها مكتوبة في أي خانة.

          و**ثلاثة أعمدة في صفّين لا ستة في صفّ**: العناوين هنا جملٌ لا كلمات
          («حصّل نقداً من العملاء» يحتاج ٢٣١px)، وحاويتها `flex` فلا يلتف نصّها
          بل يفيض. قيس ذلك على العرض الفعلي: بستة أعمدة يفيض كل عنوان، وبخمسة
          كان اثنان يفيضان **قبل هذه الإضافة** — عيبٌ قائم صُحّح هنا معها. وثلاثة
          تسع الجميع بلا فيض، وتُقسم المعادلة قسمةً تُقرأ: الحدود القديمة الثلاثة
          في صف، والحدّ الجديد والدين والصافي في الذي تحته.
        */}
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
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
              سدّده لنا
              <HelpTip>
                مجموع ما ردّه إلينا نقداً أو تحويلاً (‏<code dir="ltr">received</code> — هجرة
                0029)، وكلٌّ منه سطرٌ في الكشف أدناه. دخل خزائننا فعلاً وأنقص ما عليه لنا
                بنفس المقدار، فهو الحدّ الرابع في المعادلة:{" "}
                <code dir="ltr">earned − collected − paid + received</code>. و«—» هنا تعني
                أن هجرة 0029 لم تُنفَّذ على هذه القاعدة، لا أنه لم يسدّد شيئاً.
              </HelpTip>
            </span>
            <Money
              value={summary?.received ?? null}
              currency={currency}
              className={cn(
                "font-semibold",
                (summary?.received ?? 0) > 0 && "text-emerald-700 dark:text-emerald-300"
              )}
            />
          </div>
          <div>
            <span className="flex items-center gap-1 text-xs text-muted-foreground">
              عليه لنا
              <HelpTip>
                الدين المرصود عليه (‏<code dir="ltr">owed_to_us</code>) — صفر إن كنا نحن
                المدينين له. تقارنه القاعدة بسقف الديون لحجب العروض، وترفض به تسجيل أي
                دفعة له <span className="font-semibold">بمجرد أن يزيد على صفر</span>:
                منع الدفع لا ينظر إلى السقف إطلاقاً. ويقيس الدين المُثبَت في الدفتر وحده:
                لا يُقيَّد على رحلة شيء قبل تسجيلها «منفَّذة»، فالرحلات الجارية الآن ليست
                فيه بعد.
              </HelpTip>
            </span>
            <Money
              value={summary?.owedToUs ?? null}
              currency={currency}
              className={cn(
                "font-semibold",
                (summary?.owedToUs ?? 0) > 0 && "text-sky-700 dark:text-sky-300"
              )}
            />
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
              credit={credit}
            />
          </div>
        </div>

        {summary?.netDue !== null && summary?.netDue !== undefined && (
          <p className="text-xs leading-relaxed text-muted-foreground">{wording.hint}</p>
        )}
      </Card>

      {/*
        شرح السقف لا يُطبع: الورقة المطبوعة مستند محاسبي يُسلَّم للشريك، وحال
        الائتمان معه — أنُسند إليه أم لا — شأن تشغيلي داخلي يُقال له مشافهةً لا
        يُدسّ في كشف حساب.
        أما الوسم داخل الترويسة فيبقى — لأن إخفاءه كان يعني تفريع صياغة الإشارة
        عن مصدرها الوحيد في `settlementWording`.
      */}
      {wording.limitText !== null && (
        <Card className="no-print flex flex-row items-start gap-3 border-red-300 bg-red-50 p-4 text-red-900 dark:border-red-700 dark:bg-red-950 dark:text-red-100">
          <Ban className="mt-0.5 size-5 shrink-0" />
          <div className="space-y-1 text-sm leading-relaxed">
            {/*
              العنوان والأثر من `settlementWording` وحدها: البطاقة كانت تقول
              «الإسناد إليه متوقف» بلا شرط، والوسم يصل من عمود لا يقرأ مفتاح
              «حجب العروض» أصلاً — فكانت الجملة تدّعي إنفاذاً قد لا يقع.
            */}
            <p className="font-semibold">هذا الشريك {wording.limitHeadline}</p>
            <p>{wording.limitConsequence}</p>
            <p>
              السقف ومفتاح حجبه يُضبطان من{" "}
              <Link href="/admin/finance/partners" className="underline">
                بطاقة سقف الديون
              </Link>{" "}
              في شاشة المقاصة.
              {wording.dispatchBlocked
                ? " ولاستئناف الإسناد إليه: حصّل منه المبلغ وسجّله تسويةً، أو ارفع السقف، أو أسند له رحلة بعينها يدوياً من شاشة الطلب بسبب مكتوب."
                : ""}
            </p>
            <p>
              والسقف يقيس الدين المُثبَت في الدفتر وحده: الرحلات الجارية التي لم تُسجَّل
              «منفَّذة» بعد ليست في هذا الرقم، فقد يكون الواقع أكبر مما تراه هنا.
            </p>
          </div>
        </Card>
      )}

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
                    <th className="p-2 text-start font-medium">
                      <span className="inline-flex items-center gap-1">
                        المرجع
                        <HelpTip>
                          مرجع الحجز في سطور الرحلات والتحصيل، ومرجع التحويل في سطور
                          «سدّده لنا» (هجرة 0030) — رقم العملية كما كُتب لحظة تسجيلها،
                          وبه وحده يُطابَق السطر مع كشف الحساب البنكي. والنقدية بلا مرجع
                          لأنها لا تُنتج رقماً.
                        </HelpTip>
                      </span>
                    </th>
                    <th className="p-2 text-start font-medium">
                      <span className="inline-flex items-center gap-1">
                        له علينا (دائن)
                        <HelpTip>
                          ما يزيد التزامنا تجاهه، وهما أمران لا أمر واحد: مستحق رحلة
                          نفّذها، <span className="font-semibold">وما سدّده لنا</span> —
                          فسداده يُنقص دينه أي يرفع رصيده في صالحه، ولذلك يقع في هذا
                          العمود لا في المقابل.
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
