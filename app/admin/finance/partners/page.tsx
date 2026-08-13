import { Fragment } from "react";
import Link from "next/link";
import { ArrowLeft, Handshake, Scale } from "lucide-react";

import { toArabicDigits } from "@/components/booking/format";
import { HelpTip } from "@/components/shared/HelpTip";
import { Card } from "@/components/ui/card";
import { isMissingTable } from "@/lib/dispatch/settings";
import { DEFAULT_PARTNER_CREDIT } from "@/lib/finance-types";
import { createServerSupabase } from "@/lib/supabase/server";
import { cn } from "@/lib/utils";
import {
  FinanceFeedback,
  FinanceNotReady,
  hasSupabaseEnv,
  hrefWith,
  Money,
  numberOf,
  type PartnerCreditState,
  readAccounts,
  readCurrency,
  readPartnerCredit,
  rowsOf,
  SettlementBadge,
  settlementDirection,
  type SettlementDirection,
  textOf,
  type TreasuryAccount,
} from "../_components/finance-ui";
import { cairoToday } from "../_components/range";
import { PartnerCreditCard } from "./_components/credit-card";
import {
  AdvancePayoutForm,
  type CarriedValues,
  PayoutForm,
  type Settlement,
} from "./_components/payout-forms";
import {
  CollectionForm,
  SettlementReceipt,
  UnknownDirectionCard,
} from "./_components/settlement-forms";

/**
 * مقاصة المتعهدين — الشاشة التي يعيش فيها التواء هذا النشاط المحاسبي.
 *
 * العميل يدفع لنا عرباناً ويسلّم الباقي **نقداً للسائق**. فالمتعهد يغادر الرحلة
 * وقد قبض جزءاً من مالنا، ونحن مدينون له بمستحقه كاملاً:
 *
 *     الصافي = ما استحقّه − ما حصّله نقداً من العملاء − ما دفعناه له + ما سدّده لنا
 *
 * والنتيجة **قد تكون سالبة** فينقلب الشريك مديناً لنا. أي شاشة تفترض اتجاهاً
 * واحداً ستخطئ في نصف الرحلات، لذلك لا يُعرض الرقم عارياً هنا أبداً بل بصيغته:
 * «له علينا ٥٠٠ ج.م» أو «عليه لنا ٢٠٠ ج.م».
 *
 * ── هجرة 0029: التسوية الموحّدة والحدّ الرابع ────────────────────────────────
 * صارت المعادلة رباعية: `earned − collected − paid + received`، فللنظام أخيراً
 * مكانٌ يستقبل ما سدّده المتعهد. وأثر ذلك في هذه الشاشة أمران:
 *
 * (١) **مدخل واحد لكل متعهد** — «تسوية مع المتعهد» — يقرأ `net_due` ويفتح فرع
 *     التحصيل أو فرع الدفع بنفسه. اختيار الاتجاه باليد صنفٌ كامل من خطأ
 *     المشغّل لا حالة نادرة، والاشتقاق كله في `settlementDirection` على إشارة
 *     عمود واحد يصل محسوباً من القاعدة.
 * (٢) **عمود «حصّلنا منه»** بجوار الثلاثة القدامى. بدونه يعرض الجدول ثلاثة
 *     أرقام وصافياً لا يساوي طرحها — فيظن المالك أن الصافي مكسور وهو سليم.
 *
 * الترتيب بالقيمة المطلقة لا بالإشارة: أكبر التزام وأكبر مبلغ عالق عندنا كلاهما
 * يستحق النظر أولاً — وفرزهما بالإشارة يدفن نصف المشكلة في آخر الجدول.
 *
 * ── الملاحظة ١٧ (هجرة 0027): سقف الديون ─────────────────────────────────────
 * الشاشة صارت مكان ضبط السقف أيضاً، وعمودا `owed_to_us` و`over_limit` يصلان من
 * العرض نفسه. عمود «عليه لنا» ليس تكراراً للصافي السالب: هو **الرقم الذي تقارنه
 * القاعدة بالسقف حرفياً** (‏`partner_debt()`)، فوضعه مستقلاً يجعل قرار المنع
 * مقروءاً بدل أن يُستنتج من إشارة.
 *
 * و`over_limit` يقيس **بلوغ السقف وحده** ولا يقرأ مفتاح «حجب العروض» — فالوسم
 * يظهر ولو كان الحجب مطفأً (قرار الهجرة: فقدان رؤية المتجاوزين أسوأ من عدم
 * حجبهم). ولذلك يُقرأ المفتاح من `partner_credit_settings` ويُمرَّر إلى الصياغة
 * كي تُقال جملة «الإسناد متوقف» حين تكون صحيحة وحدها.
 */

export const metadata = { title: "مقاصة المتعهدين" };

const PATH = "/admin/finance/partners";

type Loaded = {
  currency: string;
  rows: Settlement[];
  ready: boolean;
  accounts: TreasuryAccount[];
  credit: PartnerCreditState;
  missing: string | null;
};

async function loadScreen(): Promise<Loaded> {
  const supabase = await createServerSupabase();
  if (!supabase) {
    return {
      currency: "EGP",
      rows: [],
      ready: false,
      accounts: [],
      // الافتراضيات من العقد لا من أرقام مكتوبة هنا
      credit: { settings: DEFAULT_PARTNER_CREDIT, loaded: false, missing: false },
      missing: "قاعدة البيانات",
    };
  }

  const [currency, accountsRes, credit, res] = await Promise.all([
    readCurrency(supabase),
    readAccounts(supabase),
    readPartnerCredit(supabase),
    supabase.from("v_partner_settlements").select("*"),
  ]);

  if (res.error) {
    return {
      currency,
      rows: [],
      ready: false,
      accounts: accountsRes.accounts,
      credit,
      missing: isMissingTable(res.error.code) ? "v_partner_settlements" : "قراءة المقاصة",
    };
  }

  const rows: Settlement[] = rowsOf(res.data)
    .map((row) => {
      const overLimit = row.over_limit ?? row.overLimit;
      return {
        subcontractorId: textOf(row, ["subcontractor_id", "subcontractorId", "id"]) ?? "",
        companyName: textOf(row, ["company_name", "companyName", "name"]) ?? "متعهد بلا اسم",
        earned: numberOf(row, ["earned"]),
        collected: numberOf(row, ["collected"]),
        paid: numberOf(row, ["paid"]),
        // عمود 0029 — غيابه يعني «القاعدة لم تُهاجر» لا «لم يسدّد شيئاً»
        received: numberOf(row, ["received"]),
        netDue: numberOf(row, ["net_due", "netDue"]),
        // القيمة المطلقة من العرض إن وفّرها؛ وإلا تُشتق للترتيب والصياغة فقط
        absNetDue: numberOf(row, ["abs_net_due", "absNetDue"]),
        tripsCount: numberOf(row, ["trips_count", "tripsCount"]),
        // عمودا 0027 — غيابهما (قاعدة لم تُهاجر) يعني «غير معروف» لا «صفر/لا»
        owedToUs: numberOf(row, ["owed_to_us", "owedToUs"]),
        overLimit: typeof overLimit === "boolean" ? overLimit : null,
      };
    })
    .filter((row) => row.subcontractorId !== "");

  /**
   * الترتيب بحجم المبلغ لا بإشارته — ترتيب عرض لا حساب: لا رقم يُشتق منه ولا
   * يُعرض ناتجه، وكل مبلغ في الجدول يُطبع كما وصل من العرض. ومن بلغ السقف يقفز
   * إلى الأعلى مهما صغر مبلغه: هو الصف الذي يحتاج قراراً اليوم.
   */
  rows.sort((a, b) => {
    const blocked = Number(b.overLimit === true) - Number(a.overLimit === true);
    if (blocked !== 0) return blocked;
    return (b.absNetDue ?? Math.abs(b.netDue ?? 0)) - (a.absNetDue ?? Math.abs(a.netDue ?? 0));
  });

  return { currency, rows, ready: true, accounts: accountsRes.accounts, credit, missing: null };
}

/**
 * رصيد حساب خزينة واحد — قراءة حيّة من `v_account_balances` لإيصال ما بعد التحصيل.
 *
 * كان هذا الرقم يصل في الرابط (‏`?bal=`) من إرجاع `record_partner_settlement`،
 * فيستقر رصيد الخزينة كاملاً في تاريخ المتصفح وسجلات الخادم وترويسة `Referer`.
 * وقراءته هنا تُلغي ذلك بلا خسارة: العرض هو مصدره الأصلي، والقراءة تقع بعد
 * `revalidatePath` فتعطي **أحدث** رقم لا صورةً من لحظة الحفظ.
 *
 * والنداء لا يقع إلا حين يُعرض الإيصال فعلاً — لا استعلام في التحميل العادي.
 */
async function readAccountBalance(accountId: string): Promise<number | null> {
  const supabase = await createServerSupabase();
  if (!supabase) return null;

  const res = await supabase
    .from("v_account_balances")
    .select("*")
    .eq("account_id", accountId)
    .maybeSingle();

  // تعذّرت القراءة ⇒ «—» في البطاقة، لا صفرٌ يوهم بخزينة فارغة
  if (res.error || !res.data) return null;
  return numberOf(res.data as Record<string, unknown>, ["balance"]);
}

const SAVED_MESSAGES: Record<string, string> = {
  "1": "سُجّلت الدفعة وانعكست على المقاصة ورصيد الحساب فوراً.",
  settlement:
    "سُجّل التحصيل: دخل المبلغ حساب الخزينة المختار وانخفض ما على المتعهد لنا بنفس المقدار — قيدٌ واحد بدور «سدّده لنا»، ويظهر في كشف حسابه فوراً.",
  advance:
    "سُجّل المقدَّم وقُيّد في الدفتر كأي دفعة — زاد ما لنا عند هذا الشريك بمقداره، وسببه المكتوب يظهر في كشف حسابه.",
  credit:
    "حُفظ سقف الديون — يسري فوراً على بثّ العروض وعلى قبولها وعلى تسجيل الدفعات، بلا إعادة نشر.",
};

const one = (v: string | string[] | undefined): string | undefined =>
  Array.isArray(v) ? v[0] : v;

/**
 * لوح التسوية الموحّد — **الموضع الوحيد الذي يُختار فيه الاتجاه**، ومنه ينسخه
 * الجدول والبطاقات معاً فلا تنحرف نسختان.
 *
 * خمسة فروع بترتيب مقصود:
 *
 * (١) `advancing` أولاً: المقدَّم الصريح تجاوزٌ بشري مكتوب في الرابط
 *     (‏`?confirm=advance`) ولا يجوز أن يبتلعه الاشتقاق. وهو المخرج الوحيد لمن
 *     أراد الدفع لمتعهد مدين لنا بعد أن صار فرعه الافتراضي **تحصيلاً**، ورابطه
 *     داخل نموذج التحصيل نفسه — وإلا لصار مساراً مسدوداً (النمط ٣ في LESSONS).
 * (٢) `unknown`: صافٍ غير مقروء ⇒ لا اتجاه ولا نموذج. لا تخمين. وموضعه **قبل**
 *     تجاوز التحصيل عمداً: رقمٌ مجهول لا يفتح نموذجاً ولو كُتب التجاوز باليد في
 *     الرابط، فالاتجاه لا يُخترع في هذه الشاشة بحال.
 * (٣) `collect` **أو** `collecting`: عليه لنا ⇒ `record_partner_settlement`.
 *     و`collecting` هو التجاوز الصريح المقابل للمقدَّم (‏`?confirm=collect`):
 *     المتعهد الدائن قد يردّ إلينا مالاً — يصحّح فاتورة، أو يعيد زيادة قبضها —
 *     وبلا هذا الفرع لم يكن للنظام سبيل إلى تسجيلها إطلاقاً، فيلجأ المشرف إلى
 *     تسوية يدوية غامضة أو إلى مبلغ سالب ترفضه القاعدة منذ 0029.
 * (٤) `payout` و`settled`: الدفع كما هو بلا تغيير. والصفر يذهب إلى الدفع لأن
 *     `partner_debt` عنده صفر فلا يقع عليه منع الدفع أصلاً.
 */
function SettlementPanel({
  partner,
  direction,
  advancing,
  collecting,
  accounts,
  currency,
  today,
  readOnly,
  blockPayout,
  carried,
}: {
  partner: Settlement;
  direction: SettlementDirection;
  advancing: boolean;
  /** تجاوز صريح: تحصيل من متعهد ليس مديناً لنا (‏`?confirm=collect`) */
  collecting: boolean;
  accounts: TreasuryAccount[];
  currency: string;
  today: string;
  readOnly: boolean;
  blockPayout: boolean;
  carried: CarriedValues;
}) {
  if (advancing) {
    return (
      <AdvancePayoutForm
        partner={partner}
        accounts={accounts}
        currency={currency}
        today={today}
        readOnly={readOnly}
        carried={carried}
      />
    );
  }

  if (direction === "unknown") return <UnknownDirectionCard partner={partner} />;

  if (direction === "collect" || collecting) {
    return (
      <CollectionForm
        partner={partner}
        accounts={accounts}
        currency={currency}
        today={today}
        readOnly={readOnly}
        carried={carried}
      />
    );
  }

  return (
    <PayoutForm
      partner={partner}
      accounts={accounts}
      currency={currency}
      today={today}
      readOnly={readOnly}
      blockPayout={blockPayout}
      carried={carried}
    />
  );
}

export default async function PartnersSettlementsPage({
  searchParams,
}: PageProps<"/admin/finance/partners">) {
  const [params, loaded] = await Promise.all([searchParams, loadScreen()]);
  const { currency, rows, ready, accounts, credit, missing } = loaded;

  const wired = hasSupabaseEnv();
  const savedKey = one(params.saved) ?? null;
  const error = one(params.error) ?? null;
  const paying = one(params.pay) ?? null;
  const confirming = one(params.confirm) ?? null;
  const readOnly = !wired || !ready;
  const today = cairoToday();

  /**
   * «منع الدفع لمدين» **مفروضٌ فعلاً**؟
   *
   * غياب الجدول يعني أن هجرة 0027 لم تُنفَّذ، فتصل القيم افتراضياتِ العقد
   * (‏`blockPayout: true`) لا صفّاً مقروءاً — ولو صدّقناها لحذّر النموذج من رفضٍ
   * لا يقع، وهذا بعينه نمط «الواجهة تَعِد بما لا تنفّذه القاعدة» معكوساً.
   */
  const blockPayout = !credit.missing && credit.settings.blockPayout;

  /**
   * «حجب العروض» مفعّل؟ — `null` تعني **لا نعرف** لا «مطفأ».
   *
   * الوسم «بلغ سقف الدين» يصل من العرض ولا يقرأ هذا المفتاح إطلاقاً (نصّ 0027
   * عند تعريف `over_limit`)، وهذا المفتاح وحده هو ما يجيز قول «الإسناد إليه
   * متوقف». فإن لم يُقرأ الصف فعلاً لا تُقال الجملة في أي اتجاه: الوسم يظهر،
   * والشرح يقول إن حالة المفتاح غير معروفة.
   */
  const blockDispatch = credit.loaded ? credit.settings.blockDispatch : null;

  /** قيم النموذج المُعادة في الرابط بعد رفض — لا حالة عميل ولا إعادة كتابة */
  const carried: CarriedValues = {
    account: one(params.account),
    amount: one(params.amount),
    at: one(params.at),
    reference: one(params.reference),
  };

  /**
   * إيصال ما بعد التحصيل — لا يُعرض إلا مع `saved=settlement`.
   *
   * **مصدر كل رقم فيه:** المبلغ من الرابط (‏`amt`) لأنه ما كتبه المشرف للتوّ ولا
   * مصدر ثانياً له، والصافي من صف العرض المحمَّل أعلاه، ورصيد الحساب من
   * `v_account_balances` بنداء لا يقع إلا هنا. ولا يُحسب أيٌّ منها في هذا الملف.
   *
   * وكان الصافي والرصيد يسافران في الرابط أيضاً — فحُذفا: رصيد خزينة الشركة لا
   * مكان له في تاريخ متصفح ولا في سجل خادم ولا في ترويسة `Referer`.
   */
  const receiptOf = savedKey === "settlement" ? one(params.who) ?? null : null;
  const receiptRow = receiptOf
    ? (rows.find((row) => row.subcontractorId === receiptOf) ?? null)
    : null;
  const receiptAccount = receiptOf ? (one(params.acc) ?? null) : null;
  const receiptBalance = receiptAccount ? await readAccountBalance(receiptAccount) : null;

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="flex items-center gap-2 font-heading text-lg font-bold">
          <Scale className="size-5 text-primary" />
          مقاصة المتعهدين
        </h2>
        <HelpTip>
          لأن العميل يسلّم باقي الأجرة نقداً للسائق، فالحساب مع كل شريك ذو اتجاهين:
          مستحقاته عندنا، وما قبضه من عملائنا في يده. والمقاصة تجمع الحدود الأربعة —
          مستحقاته، ناقص ما قبضه نقداً، ناقص ما دفعناه له، زائد ما سدّده لنا — وقد يخرج
          الناتج في صالحه أو في صالحنا.
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
        saved={savedKey !== null && savedKey in SAVED_MESSAGES}
        savedMessage={(savedKey && SAVED_MESSAGES[savedKey]) || "نُفذت العملية."}
        error={error}
      />

      {receiptOf !== null && (
        <SettlementReceipt
          partnerName={receiptRow?.companyName ?? null}
          accountLabel={
            accounts.find((account) => account.id === receiptAccount)?.label ?? null
          }
          amount={one(params.amt)}
          netDue={receiptRow?.netDue ?? null}
          absNetDue={receiptRow?.absNetDue ?? null}
          balance={receiptBalance}
          currency={currency}
        />
      )}

      <Card className="gap-2 bg-muted/40 p-4 text-sm leading-relaxed ring-0">
        <p className="font-medium">كيف يُقرأ الصافي؟</p>
        <p className="text-muted-foreground">
          <span className="font-semibold text-foreground">له علينا</span> = مستحقاته وما
          سدّده يفوقان ما قبضه وما دفعناه ⇒ ندفع له الفرق.{" "}
          <span className="font-semibold text-foreground">عليه لنا</span> = قبض من
          العملاء أكثر من ذلك ⇒ نُحصّل منه الفرق. والمعادلة كاملة{" "}
          <code dir="ltr">earned − collected − paid + received</code>، وتقع كلها في العرض{" "}
          <code dir="ltr">v_partner_settlements</code> داخل قاعدة البيانات — والشاشة تختار
          اتجاه التسوية من إشارة ناتجها لا من اختيارك.
        </p>
      </Card>

      <PartnerCreditCard state={credit} currency={currency} wired={wired} />

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
              <table className="w-full min-w-[70rem] text-sm">
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
                    <th className="p-2 text-start font-medium">
                      <span className="inline-flex items-center gap-1">
                        حصّلنا منه
                        <HelpTip>
                          مجموع ما ردّه إلينا نقداً أو تحويلاً (‏<code dir="ltr">received</code>{" "}
                          — هجرة 0029). دخل خزينتنا فعلاً وأنقص ما عليه لنا بنفس المقدار،
                          فهو الحدّ الرابع في المعادلة:{" "}
                          <code dir="ltr">earned − collected − paid + received</code>. و«—»
                          هنا تعني أن الهجرة لم تُنفَّذ بعد، لا أنه لم يسدّد شيئاً.
                        </HelpTip>
                      </span>
                    </th>
                    <th className="p-2 text-start font-medium">
                      <span className="inline-flex items-center gap-1">
                        عليه لنا
                        <HelpTip>
                          الدين المرصود عليه (‏<code dir="ltr">owed_to_us</code>) — صفر إن
                          كنا نحن المدينين له، وهو الرقم الذي تبني عليه القاعدة قرارين
                          مختلفين: تقارنه بالسقف لحجب العروض، وترفض به تسجيل أي دفعة له
                          <span className="font-semibold"> بمجرد أن يزيد على صفر</span> —
                          فمنع الدفع لا ينظر إلى السقف إطلاقاً، ويقع على جنيه واحد كما
                          يقع على ألف. ويقيس الدين المُثبَت في الدفتر وحده: لا يُقيَّد على
                          رحلة شيء قبل تسجيلها «منفَّذة»، فالرحلات الجارية الآن ليست فيه
                          بعد.
                        </HelpTip>
                      </span>
                    </th>
                    <th className="p-2 text-start font-medium">الصافي</th>
                    <th className="p-2 text-start font-medium" />
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row) => {
                    const open = paying === row.subcontractorId;
                    const advancing = open && confirming === "advance";
                    const collecting = open && confirming === "collect";
                    /**
                     * الاتجاه من `net_due` وحده — لا من `owed_to_us` ولا من طرح
                     * هنا. و«تسوية» اسم الإجراء في الاتجاهين معاً: المشرف يفتح
                     * الحساب، والشاشة تقرر أيدفع أم يُحصّل.
                     */
                    const direction = settlementDirection(row.netDue);
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
                            <Money
                              value={row.received}
                              currency={currency}
                              className={cn(
                                (row.received ?? 0) > 0 &&
                                  "font-medium text-emerald-700 dark:text-emerald-300"
                              )}
                            />
                          </td>
                          <td className="p-2">
                            <Money
                              value={row.owedToUs}
                              currency={currency}
                              className={cn(
                                (row.owedToUs ?? 0) > 0 && "font-medium text-sky-700 dark:text-sky-300"
                              )}
                            />
                          </td>
                          <td className="p-2">
                            <SettlementBadge
                              netDue={row.netDue}
                              absNetDue={row.absNetDue}
                              currency={currency}
                              credit={{
                                owedToUs: row.owedToUs,
                                overLimit: row.overLimit,
                                blockDispatch,
                              }}
                            />
                          </td>
                          <td className="p-2 text-xs whitespace-nowrap">
                            <Link
                              href={
                                open ? PATH : hrefWith(PATH, { pay: row.subcontractorId })
                              }
                              className="text-primary hover:underline"
                            >
                              {open ? "إغلاق" : "تسوية مع المتعهد"}
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
                            <td colSpan={9} className="p-2">
                              <SettlementPanel
                                partner={row}
                                direction={direction}
                                advancing={advancing}
                                collecting={collecting}
                                accounts={accounts}
                                currency={currency}
                                today={today}
                                readOnly={readOnly}
                                blockPayout={blockPayout}
                                carried={carried}
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
              const advancing = open && confirming === "advance";
              const collecting = open && confirming === "collect";
              const direction = settlementDirection(row.netDue);
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
                  <div className="grid grid-cols-2 gap-2 text-xs">
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
                    <span>
                      <span className="block text-muted-foreground">حصّلنا منه</span>
                      <Money
                        value={row.received}
                        currency={currency}
                        className={cn(
                          (row.received ?? 0) > 0 &&
                            "font-medium text-emerald-700 dark:text-emerald-300"
                        )}
                      />
                    </span>
                    <span>
                      <span className="block text-muted-foreground">عليه لنا</span>
                      <Money
                        value={row.owedToUs}
                        currency={currency}
                        className={cn(
                          (row.owedToUs ?? 0) > 0 && "font-medium text-sky-700 dark:text-sky-300"
                        )}
                      />
                    </span>
                  </div>
                  <SettlementBadge
                    netDue={row.netDue}
                    absNetDue={row.absNetDue}
                    currency={currency}
                    credit={{
                      owedToUs: row.owedToUs,
                      overLimit: row.overLimit,
                      blockDispatch,
                    }}
                  />
                  <div className="flex flex-wrap items-center gap-3 text-xs">
                    <Link
                      href={open ? PATH : hrefWith(PATH, { pay: row.subcontractorId })}
                      className="text-primary hover:underline"
                    >
                      {open ? "إغلاق لوح التسوية" : "تسوية مع المتعهد"}
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
                    <SettlementPanel
                      partner={row}
                      direction={direction}
                      advancing={advancing}
                      collecting={collecting}
                      accounts={accounts}
                      currency={currency}
                      today={today}
                      readOnly={readOnly}
                      blockPayout={blockPayout}
                      carried={carried}
                    />
                  )}
                </Card>
              );
            })}
          </div>

          <p className="text-xs text-muted-foreground">
            {toArabicDigits(rows.length)} متعهد، مرتّبون بحجم الصافي لا بإشارته — فأكبر
            التزام علينا وأكبر مبلغ عالق عندهم كلاهما في الأعلى، ومن بلغ سقف الدين قبلهما.
          </p>
        </>
      )}
    </div>
  );
}
