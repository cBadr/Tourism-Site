import type { ReactNode } from "react";
import Link from "next/link";
import { AlertTriangle, CheckCircle2, XCircle, type LucideIcon } from "lucide-react";

import { formatMoney, toArabicDigits } from "@/components/booking/format";
import { HelpTip } from "@/components/shared/HelpTip";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { LedgerDirection, LedgerSource, TreasuryAccountKind } from "@/lib/finance-types";
import type { createServerSupabase } from "@/lib/supabase/server";
import { cn } from "@/lib/utils";
import {
  asNumber,
  asText,
  COMMON_BOOKING_ERRORS,
  controlClass,
  pick,
} from "../../orders/_components/booking-ui";
import {
  bucketLabel,
  type DateRange,
  GRANULARITIES,
  GRANULARITY_LABELS,
  type Granularity,
  QUICK_RANGES,
  RANGE_LABELS,
  rangeSentence,
} from "./range";

/**
 * لبنات شاشات المالية المشتركة (المرحلة ٧) — بنفس إيقاع لبنات الطلبات:
 * قراءة متسامحة للصفوف، بطاقات تنبيه عبر الـ query string، وتنسيق عرض فقط.
 *
 * **القاعدة الحاكمة للمرحلة كلها:** لا حساب مالي في TypeScript إطلاقاً. كل مبلغ
 * معروض هنا يُطبع كما وصل من دوال وعروض Postgres (`finance_kpis`، `cash_flow`،
 * `v_account_balances`، `v_partner_settlements`، `partner_statement`). الاستثناء
 * الوحيد المسموح — وهو ليس حساباً محاسبياً — هو **هندسة العرض**: ارتفاع عمود في
 * المخطط نسبةً إلى أطول عمود، والقيمة المطلقة لصياغة «له علينا / عليه لنا».
 * كلاهما لا يغيّر رقماً يُقرأ، بل يقرر بكسلات وكلمات.
 *
 * التدهور الرشيق مقصود: هجرة ٠٠١٥ قد لا تكون منفَّذة على القاعدة بعد، فكل قارئ
 * هنا يفرّق بين «الجدول/الدالة غير موجودة» (رسالة هجرة) و«رفض قراءة» (رسالة
 * صلاحيات) ولا يخترع صفراً محل «لا أعرف» — «—» تقول الحقيقة، و«٠» تكذب.
 */

export type Supabase = NonNullable<Awaited<ReturnType<typeof createServerSupabase>>>;

export const hasSupabaseEnv = () =>
  Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);

/** سقوف عرض عاقلة — شاشات تشغيل لا أرشيف */
export const MAX_LEDGER_ROWS = 200;
export const MAX_EXPENSE_ROWS = 200;
export const MAX_STATEMENT_ROWS = 500;

// ---------------------------------------------------------------------------
// قراءة متسامحة: أسماء أعمدة SQL (snake_case) أو أسماء العقد (camelCase)
// ---------------------------------------------------------------------------

/** رقم من صف مجهول البنية بأول اسم موجود — null تعني «غير معروف» لا صفراً */
export const numberOf = (row: Record<string, unknown> | null, names: string[]): number | null =>
  asNumber(pick(row, names));

/** نص من صف مجهول البنية بأول اسم موجود */
export const textOf = (row: Record<string, unknown> | null, names: string[]): string | null =>
  asText(pick(row, names));

/** صفوف نتيجة استعلام/دالة — الدوال الجدولية ترجع مصفوفة، والمركّبة صفاً واحداً */
export const rowsOf = (data: unknown): Record<string, unknown>[] =>
  Array.isArray(data) ? (data as Record<string, unknown>[]) : [];

export const firstRow = (data: unknown): Record<string, unknown> | null => {
  if (Array.isArray(data)) return (data[0] as Record<string, unknown>) ?? null;
  return data && typeof data === "object" ? (data as Record<string, unknown>) : null;
};

// ---------------------------------------------------------------------------
// المفردات المالية
// ---------------------------------------------------------------------------

export const ACCOUNT_KIND_LABELS: Record<string, string> = {
  wallet: "محفظة إلكترونية",
  instapay: "انستا باي",
  card: "بطاقة",
  cash: "نقدية",
  bank: "حساب بنكي",
};

export const accountKindLabel = (kind: string | null): string =>
  (kind && ACCOUNT_KIND_LABELS[kind]) || "حساب خزينة";

/** الأنواع التي تُعرض للعميل في صفحة التحويل — النقدية والبنك داخليان */
export const CUSTOMER_FACING_KINDS: TreasuryAccountKind[] = ["wallet", "instapay", "card"];

/**
 * أسماء مصادر القيود بالعربية.
 *
 * النوع مكتوب مرتين عمداً: `Record<string, string>` ليقبل مصدراً لا نعرفه بعد
 * (فتبقى الشاشة تعرضه كما هو بدل أن تنهار)، و`satisfies Record<LedgerSource,…>`
 * ليمنع النسيان في الاتجاه الآخر — إضافة مصدر إلى العقد بلا ترجمة هنا تُوقِف
 * الترجمة عند `tsc` لا عند المالك.
 */
export const SOURCE_LABELS: Record<string, string> = {
  payment: "تحصيل من عميل",
  expense: "مصروف",
  partner_payout: "دفعة لمتعهد",
  partner_collection: "تحصيل قبضه المتعهد",
  refund: "ردّ مبلغ لعميل",
  adjustment: "تسوية يدوية",
} satisfies Record<LedgerSource, string>;

export const SOURCE_HINTS: Record<string, string> = {
  payment: "إيصال تحويل اعتمده التشغيل — دخل المبلغ خزينة الحساب المحوَّل إليه.",
  expense: "مصروف تشغيلي سُجّل من شاشة المصروفات وخرج من حساب بعينه.",
  partner_payout: "دفعة نقدية سُدّدت لمتعهد ضمن المقاصة — خرجت من خزينتنا فعلاً.",
  partner_collection:
    "الباقي الذي قبضه المتعهد نقداً من العميل نيابة عنا. لم يدخل خزينتنا، لكنه يخصم من مستحقه لأنه صار في يده.",
  refund: "ردّ مبلغ لعميل بعد إلغاء أو تعديل — قيد عكسي ينظّف أثر الحجز الملغى.",
  adjustment: "تسوية يدوية بسبب مكتوب — فرق صرافة، عجز جرد، أو تصحيح خطأ إدخال.",
} satisfies Record<LedgerSource, string>;

export const sourceLabel = (source: string | null): string =>
  (source && SOURCE_LABELS[source]) || source || "—";

export const DIRECTION_LABELS: Record<LedgerDirection, string> = {
  in: "وارد",
  out: "منصرف",
};

/** لون الاتجاه: الداخل أخضر والخارج أحمر — ثابت في كل شاشات المالية */
export const directionTone = (direction: string | null): string =>
  direction === "in"
    ? "text-emerald-700 dark:text-emerald-300"
    : direction === "out"
      ? "text-red-700 dark:text-red-300"
      : "text-muted-foreground";

export function SourceBadge({ source }: { source: string | null }) {
  const known = source !== null && source in SOURCE_LABELS;
  return (
    <Badge variant={known ? "secondary" : "outline"} className="font-normal">
      {sourceLabel(source)}
    </Badge>
  );
}

/** مبلغ باتجاهه — «+ ١٬٢٠٠ ج.م» أو «− ٣٠٠ ج.م» بلا أي حساب: الإشارة من الاتجاه */
export function DirectedMoney({
  amount,
  direction,
  currency,
}: {
  amount: number | null;
  direction: string | null;
  currency: string;
}) {
  if (amount === null) return <span className="text-muted-foreground">—</span>;
  const sign = direction === "in" ? "+" : direction === "out" ? "−" : "";
  return (
    <span dir="ltr" className={cn("font-medium whitespace-nowrap", directionTone(direction))}>
      {sign} {formatMoney(amount, currency)}
    </span>
  );
}

/** مبلغ عادي — «—» حين يكون الرقم غير معروف (لا صفر مخترَع) */
export function Money({
  value,
  currency,
  className,
}: {
  value: number | null;
  currency: string;
  className?: string;
}) {
  if (value === null) return <span className="text-muted-foreground">—</span>;
  return (
    <span dir="ltr" className={cn("whitespace-nowrap", className)}>
      {formatMoney(value, currency)}
    </span>
  );
}

// ---------------------------------------------------------------------------
// الالتواء المحاسبي: صياغة المقاصة بإشارتيها
// ---------------------------------------------------------------------------

export type SettlementTone = "we-owe" | "they-owe" | "settled";

/**
 * صياغة صافي المقاصة بالعربية الصحيحة لكل إشارة.
 *
 * `netDue` موجب = نحن مدينون للمتعهد ⇒ «له علينا ٥٠٠ ج.م».
 * `netDue` سالب = المتعهد قبض أكثر من مستحقه ⇒ «عليه لنا ٢٠٠ ج.م».
 *
 * القيمة المطلقة تُقرأ من العرض إن وفّرها (`abs_net_due`)، وإلا تُشتق هنا —
 * وهي تطبيع عرض لا حساب: الرقم نفسه ومصدره لا يتغيّران، والإشارة وحدها تنتقل
 * من الرقم إلى الكلمات لأن «−٢٠٠ ج.م له علينا» جملة لا يفهمها محاسب.
 */
export function settlementWording(
  netDue: number | null,
  absNetDue: number | null,
  currency: string
): { tone: SettlementTone; text: string; hint: string } {
  if (netDue === null) {
    return { tone: "settled", text: "—", hint: "الرقم غير متاح — تعذّرت قراءة المقاصة." };
  }
  const magnitude = absNetDue ?? Math.abs(netDue);
  if (netDue > 0) {
    return {
      tone: "we-owe",
      text: `له علينا ${formatMoney(magnitude, currency)}`,
      hint: "مستحقاته عن الرحلات المنفَّذة تفوق ما قبضه نقداً من العملاء وما سبق أن دفعناه له — هذا ما ندفعه له في التسوية القادمة.",
    };
  }
  if (netDue < 0) {
    return {
      tone: "they-owe",
      text: `عليه لنا ${formatMoney(magnitude, currency)}`,
      hint: "قبض من العملاء نقداً أكثر من مستحقه، فالفرق مالنا في يده — يُحصَّل منه لا يُدفع له.",
    };
  }
  return {
    tone: "settled",
    text: "مقاصة صفرية",
    hint: "ما له وما عليه متساويان — لا دفعة مستحقة في الاتجاهين.",
  };
}

const SETTLEMENT_TONE_CLASS: Record<SettlementTone, string> = {
  "we-owe":
    "border-amber-300 bg-amber-100 text-amber-900 dark:border-amber-700 dark:bg-amber-950 dark:text-amber-100",
  "they-owe":
    "border-sky-300 bg-sky-100 text-sky-900 dark:border-sky-700 dark:bg-sky-950 dark:text-sky-100",
  settled: "border-border text-muted-foreground",
};

export function SettlementBadge({
  netDue,
  absNetDue,
  currency,
  withHint = true,
}: {
  netDue: number | null;
  absNetDue: number | null;
  currency: string;
  withHint?: boolean;
}) {
  const { tone, text, hint } = settlementWording(netDue, absNetDue, currency);
  return (
    <span className="inline-flex items-center gap-1.5">
      <Badge variant="outline" className={cn("font-medium", SETTLEMENT_TONE_CLASS[tone])}>
        <span dir="rtl">{text}</span>
      </Badge>
      {withHint ? <HelpTip>{hint}</HelpTip> : null}
    </span>
  );
}

// ---------------------------------------------------------------------------
// بطاقات ورسائل
// ---------------------------------------------------------------------------

export const FINANCE_ERRORS: Record<string, string> = {
  ...COMMON_BOOKING_ERRORS,
  notready:
    "جداول ودوال المالية غير موجودة في قاعدة البيانات — نفِّذ هجرة المرحلة ٧ (0015) ثم أعد المحاولة.",
  forbidden: "هذه العملية للمديرين فقط — سجّل الدخول بحساب دوره admin.",
  account: "اختر حساب خزينة — كل حركة نقدية تخرج من حساب أو تدخله.",
  amount: "المبلغ يجب أن يكون رقماً موجباً أكبر من صفر.",
  direction: "اختر اتجاه التسوية: وارد إلى الخزينة أو منصرف منها.",
  reason: "سبب التسوية إلزامي — قيد بلا سبب مكتوب يفقد قيمته بعد أسبوع.",
  date: "التاريخ غير صالح — اكتبه بصيغة يوم/شهر/سنة من حقل التاريخ.",
  future: "لا يمكن تسجيل حركة بتاريخ في المستقبل.",
  partner: "المتعهد غير معروف — أعد تحميل الصفحة واختر من القائمة.",
  category: "فئة المصروف غير معروفة — أعد تحميل الصفحة واختر من القائمة.",
  upload:
    "تعذّر رفع المرفق — الحد ٥ ميجابايت وبصيغة صورة أو PDF، ويحتاج الرفع مفتاح SUPABASE_SERVICE_ROLE_KEY في متغيرات البيئة.",
  balance: "رفضت قاعدة البيانات القيد — راجع الرصيد أو حدود الحساب ثم أعد المحاولة.",
};

/** بطاقة «المالية غير جاهزة» — تُعرض في كل شاشات المرحلة قبل تنفيذ الهجرة */
export function FinanceNotReady({
  wired,
  missing,
}: {
  wired: boolean;
  /** ما تعذّرت قراءته بالاسم — يظهر للمالك ليعرف أي هجرة ينفّذ */
  missing: string;
}) {
  return (
    <Card className="flex flex-row items-start gap-3 border-amber-300 bg-amber-50 p-4 text-amber-900 dark:border-amber-700 dark:bg-amber-950 dark:text-amber-100">
      <AlertTriangle className="mt-0.5 size-5 shrink-0" />
      <div className="text-sm leading-relaxed">
        <p className="font-semibold">شاشات المالية غير جاهزة بعد</p>
        {wired ? (
          <p>
            قاعدة البيانات مربوطة لكن <code dir="ltr">{missing}</code> غير متاح — نفِّذ هجرة
            المرحلة ٧ من <code dir="ltr">supabase/migrations</code> ثم أعد تحميل الصفحة. بقية
            اللوحة تعمل طبيعياً.
          </p>
        ) : (
          <p>
            قاعدة البيانات غير مربوطة بعد — تُفعَّل الشاشة بعد تنفيذ خطوات{" "}
            <code dir="ltr">supabase/README.md</code> وإعادة تشغيل الخادم.
          </p>
        )}
      </div>
    </Card>
  );
}

/**
 * بطاقتا نتيجة العملية — اتفاقية «إعادة التوجيه بعد العملية»: كل إجراء ينتهي
 * بـ redirect برمز في الرابط، والشاشة تترجم الرمز إلى جملة عربية مفهومة.
 */
export function FinanceFeedback({
  saved,
  savedMessage,
  error,
}: {
  saved: boolean;
  savedMessage: string;
  error: string | null;
}) {
  return (
    <>
      {saved && (
        <Card className="flex flex-row items-center gap-3 border-emerald-300 bg-emerald-50 p-4 text-emerald-900 dark:border-emerald-700 dark:bg-emerald-950 dark:text-emerald-100">
          <CheckCircle2 className="size-5 shrink-0" />
          <p className="text-sm font-medium">{savedMessage}</p>
        </Card>
      )}
      {error && (
        <Card className="flex flex-row items-center gap-3 border-red-300 bg-red-50 p-4 text-red-900 dark:border-red-700 dark:bg-red-950 dark:text-red-100">
          <XCircle className="size-5 shrink-0" />
          <p className="text-sm font-medium">
            {FINANCE_ERRORS[error] ?? "حدث خطأ غير متوقع."}
          </p>
        </Card>
      )}
    </>
  );
}

/** بطاقة مؤشر — الرقم يصل جاهزاً من SQL و«—» تعني «غير معروف» */
export function KpiCard({
  title,
  value,
  sub,
  icon: Icon,
  help,
  tone,
}: {
  title: string;
  value: ReactNode;
  sub: string;
  icon: LucideIcon;
  help: ReactNode;
  tone?: string;
}) {
  return (
    <Card className={cn("h-full gap-1 p-4", tone)}>
      <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
        <Icon className="size-3.5 shrink-0 text-primary" />
        <span className="truncate">{title}</span>
        <HelpTip>{help}</HelpTip>
      </div>
      <span className="block text-xl font-bold sm:text-2xl">{value}</span>
      <span className="block text-xs leading-relaxed text-muted-foreground">{sub}</span>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// فلتر الفترة — نموذج GET حتى يبقى الرابط قابلاً للمشاركة والحفظ في المفضلة
// ---------------------------------------------------------------------------

export function hrefWith(basePath: string, params: Record<string, string | undefined>): string {
  const qs = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== "") qs.set(key, value);
  }
  const s = qs.toString();
  return s ? `${basePath}?${s}` : basePath;
}

export function RangeFilter({
  basePath,
  range,
  keep = {},
  hidden,
  disabled,
  children,
  note,
}: {
  basePath: string;
  range: DateRange;
  /** معاملات أخرى تبقى كما هي في **روابط** النطاقات السريعة (الحساب، الفئة، الحبيبة) */
  keep?: Record<string, string | undefined>;
  /**
   * ما يُكتب حقولاً مخفية داخل النموذج. الافتراضي هو `keep` نفسه، ويُمرَّر
   * صراحةً `{}` حين يكون المعامل حقلاً ظاهراً بين `children`: حقل مخفي وحقل
   * ظاهر بالاسم نفسه يُرسلان قيمتين، ويفوز الأول — أي القيمة القديمة — فتبدو
   * القائمة وكأنها تتجاهل اختيار المستخدم.
   */
  hidden?: Record<string, string | undefined>;
  disabled?: boolean;
  /** حقول إضافية داخل النموذج نفسه */
  children?: ReactNode;
  note?: ReactNode;
}) {
  const kept = Object.entries(hidden ?? keep).filter(
    (entry): entry is [string, string] => typeof entry[1] === "string" && entry[1] !== ""
  );

  return (
    <form action={basePath} method="get">
      <Card className="gap-3 p-4">
        {kept.map(([name, value]) => (
          <input key={name} type="hidden" name={name} value={value} />
        ))}

        <div className="flex flex-wrap items-center gap-1.5">
          <span className="flex items-center gap-1.5 text-sm font-medium">
            الفترة
            <HelpTip>
              كل مؤشرات هذه الشاشة تُحسب داخل قاعدة البيانات على الفترة المختارة وحدها —
              عدا ما يُعلَّم صراحةً بأنه «لحظي» (رصيد الخزائن ومقاصة المتعهدين)، فهو صورة
              الآن لا مجموع فترة.
            </HelpTip>
          </span>
          {QUICK_RANGES.map((key) => {
            const active = range.key === key;
            return (
              <Link
                key={key}
                href={hrefWith(basePath, { ...keep, range: key })}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "rounded-lg px-2.5 py-1 text-xs transition-colors",
                  active
                    ? "bg-primary text-primary-foreground"
                    : "bg-muted text-muted-foreground hover:text-foreground"
                )}
              >
                {RANGE_LABELS[key]}
              </Link>
            );
          })}
        </div>

        <div className="flex flex-wrap items-end gap-3">
          <div className="space-y-1.5">
            <Label htmlFor="range-from" className="text-xs">
              من
            </Label>
            <Input
              id="range-from"
              name="from"
              type="date"
              dir="ltr"
              defaultValue={range.from}
              disabled={disabled}
              className="w-40"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="range-to" className="text-xs">
              إلى
            </Label>
            <Input
              id="range-to"
              name="to"
              type="date"
              dir="ltr"
              defaultValue={range.to}
              disabled={disabled}
              className="w-40"
            />
          </div>
          {children}
          <Button type="submit" size="sm" disabled={disabled}>
            تطبيق
          </Button>
        </div>

        <p className="text-xs text-muted-foreground">
          المعروض: {RANGE_LABELS[range.key]} · {rangeSentence(range)} (
          {toArabicDigits(range.days)} يوماً، بتوقيت القاهرة).
          {note ? <> {note}</> : null}
        </p>
      </Card>
    </form>
  );
}

/** منتقي حبيبة التدفق النقدي — حقل داخل نموذج الفترة نفسه */
export function GranularityField({
  value,
  disabled,
}: {
  value: Granularity;
  disabled?: boolean;
}) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor="granularity" className="flex items-center gap-1.5 text-xs">
        تجميع التدفق
        <HelpTip>
          طول العمود الواحد في مخطط التدفق: يوم أو أسبوع أو شهر. يُختار تلقائياً بما
          يناسب طول الفترة، وتستطيع فرض غيره — التجميع نفسه يقع في دالة{" "}
          <code dir="ltr">cash_flow</code> داخل القاعدة.
        </HelpTip>
      </Label>
      <select
        id="granularity"
        name="granularity"
        defaultValue={value}
        disabled={disabled}
        className={cn(controlClass, "w-32")}
      >
        {GRANULARITIES.map((g) => (
          <option key={g} value={g}>
            {GRANULARITY_LABELS[g]}
          </option>
        ))}
      </select>
    </div>
  );
}

// ---------------------------------------------------------------------------
// مخطط التدفق النقدي — CSS خالص بلا أي مكتبة رسم
// ---------------------------------------------------------------------------

export type FlowBucket = {
  bucket: string;
  inflow: number | null;
  outflow: number | null;
  net: number | null;
  runningBalance: number | null;
};

/** أقل ارتفاع مرئي لعمود قيمته أكبر من صفر — حتى لا يختفي مبلغ صغير تماماً */
const MIN_BAR_PERCENT = 3;

export function CashFlowChart({
  rows,
  currency,
  granularity,
}: {
  rows: FlowBucket[];
  currency: string;
  granularity: Granularity;
}) {
  if (rows.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        لا حركة نقدية في هذه الفترة — لا وارد ولا منصرف. جرّب فترة أوسع من الأزرار
        السريعة أعلاه.
      </p>
    );
  }

  /**
   * أطول عمود = مرجع الارتفاعات. هذه **هندسة عرض** لا محاسبة: لا مبلغ يُشتق منها
   * ولا يُعرض ناتجها كرقم — كل مبلغ مكتوب أدناه يُطبع كما وصل من `cash_flow`.
   */
  const peak = rows.reduce(
    (max, row) => Math.max(max, row.inflow ?? 0, row.outflow ?? 0),
    0
  );
  const heightPercent = (value: number | null): number => {
    if (value === null || value <= 0 || peak <= 0) return 0;
    return Math.max(MIN_BAR_PERCENT, Math.round((value / peak) * 100));
  };

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-4 text-xs text-muted-foreground">
        <span className="flex items-center gap-1.5">
          <span className="size-2.5 rounded-full bg-emerald-500" />
          الوارد
        </span>
        <span className="flex items-center gap-1.5">
          <span className="size-2.5 rounded-full bg-red-500" />
          المنصرف
        </span>
        <span className="flex items-center gap-1.5">
          الصافي أسفل كل عمود
          <HelpTip>
            الصافي = الوارد ناقص المنصرف في تلك الفترة الجزئية، محسوباً في دالة{" "}
            <code dir="ltr">cash_flow</code>. الصافي السالب ليس خطأً بالضرورة: شهر
            سُدّدت فيه مستحقات متعهدين عن رحلات شهور سابقة يخرج سالباً وهو سليم.
          </HelpTip>
        </span>
      </div>

      <div className="overflow-x-auto pb-1">
        <div className="flex min-w-max items-end gap-2">
          {rows.map((row) => {
            const inPercent = heightPercent(row.inflow);
            const outPercent = heightPercent(row.outflow);
            const negative = (row.net ?? 0) < 0;
            return (
              <div key={row.bucket} className="flex w-20 shrink-0 flex-col items-center gap-1">
                <div className="flex h-36 w-full items-end justify-center gap-1">
                  <div
                    className="w-4 rounded-t bg-emerald-500/90"
                    style={{ height: `${inPercent}%` }}
                    title={`وارد: ${row.inflow === null ? "—" : formatMoney(row.inflow, currency)}`}
                  />
                  <div
                    className="w-4 rounded-t bg-red-500/90"
                    style={{ height: `${outPercent}%` }}
                    title={`منصرف: ${row.outflow === null ? "—" : formatMoney(row.outflow, currency)}`}
                  />
                </div>
                <span className="w-full truncate text-center text-[10px] text-muted-foreground">
                  {bucketLabel(row.bucket, granularity)}
                </span>
                <span
                  dir="ltr"
                  className={cn(
                    "text-[11px] font-medium",
                    negative ? "text-red-700 dark:text-red-300" : "text-emerald-700 dark:text-emerald-300"
                  )}
                >
                  {row.net === null ? "—" : formatMoney(row.net, currency)}
                </span>
              </div>
            );
          })}
        </div>
      </div>

      {/* الأرقام كاملة لمن يريد قراءتها لا رؤيتها — الرصيد التراكمي يظهر هنا فقط */}
      <details className="text-sm">
        <summary className="w-fit cursor-pointer text-xs text-primary hover:underline">
          عرض أرقام التدفق في جدول
        </summary>
        <div className="mt-2 overflow-x-auto">
          <table className="w-full min-w-[36rem] text-sm">
            <thead>
              <tr className="border-b border-border text-xs text-muted-foreground">
                <th className="p-2 text-start font-medium">الفترة</th>
                <th className="p-2 text-start font-medium">الوارد</th>
                <th className="p-2 text-start font-medium">المنصرف</th>
                <th className="p-2 text-start font-medium">الصافي</th>
                <th className="p-2 text-start font-medium">الرصيد التراكمي</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.bucket} className="border-b border-border last:border-0">
                  <td className="p-2 whitespace-nowrap">{bucketLabel(row.bucket, granularity)}</td>
                  <td className="p-2">
                    <Money value={row.inflow} currency={currency} className="text-emerald-700 dark:text-emerald-300" />
                  </td>
                  <td className="p-2">
                    <Money value={row.outflow} currency={currency} className="text-red-700 dark:text-red-300" />
                  </td>
                  <td className="p-2 font-medium">
                    <Money value={row.net} currency={currency} />
                  </td>
                  <td className="p-2">
                    <Money value={row.runningBalance} currency={currency} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </div>
  );
}

// ---------------------------------------------------------------------------
// قرّاء مشتركون للشاشات
// ---------------------------------------------------------------------------

/** رمز العملة من قاعدة البيانات لا من الكود — نفس مصدر بقية أسعار الموقع */
export async function readCurrency(supabase: Supabase): Promise<string> {
  const res = await supabase.from("pricing_settings").select("currency").limit(1).maybeSingle();
  return (!res.error && asText(res.data?.currency)) || "EGP";
}

export type TreasuryAccount = {
  id: string;
  label: string;
  kind: string | null;
  active: boolean;
};

/**
 * حسابات الخزينة للنماذج — هي نفسها `payment_accounts` بعد توسيع أنواعها
 * بـ `cash` و`bank` (قرار العقد: لا جدول حسابات موازٍ). المتوقفة تبقى معروضة
 * في قوائم المالية لأنها قد تحمل أرصدة وحركات، وتُعلَّم بوسم «متوقف».
 */
export async function readAccounts(
  supabase: Supabase
): Promise<{ accounts: TreasuryAccount[]; ready: boolean }> {
  const res = await supabase
    .from("payment_accounts")
    .select("id, label, kind, active, sort")
    .order("sort", { ascending: true })
    .order("label", { ascending: true });

  if (res.error) return { accounts: [], ready: false };

  const accounts = rowsOf(res.data)
    .map((row) => ({
      id: String(row.id),
      label: textOf(row, ["label"]) ?? "حساب بلا اسم",
      kind: textOf(row, ["kind"]),
      active: row.active !== false,
    }))
    .filter((a) => a.id !== "undefined");

  return { accounts, ready: true };
}

/** منتقي حساب خزينة — يُستعمل في نماذج المصروف والدفعة والتسوية */
export function AccountField({
  id,
  name,
  accounts,
  defaultValue,
  disabled,
  label = "الحساب",
  help,
  required = true,
}: {
  id: string;
  name: string;
  accounts: TreasuryAccount[];
  defaultValue?: string;
  disabled?: boolean;
  label?: string;
  help?: ReactNode;
  required?: boolean;
}) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id} className="flex items-center gap-1.5">
        {label}
        {help ? <HelpTip>{help}</HelpTip> : null}
      </Label>
      <select
        id={id}
        name={name}
        defaultValue={defaultValue ?? ""}
        disabled={disabled || accounts.length === 0}
        required={required}
        className={controlClass}
      >
        <option value="" disabled>
          {accounts.length === 0 ? "لا حسابات خزينة بعد" : "اختر حساباً"}
        </option>
        {accounts.map((account) => (
          <option key={account.id} value={account.id}>
            {account.label} · {accountKindLabel(account.kind)}
            {account.active ? "" : " (متوقف)"}
          </option>
        ))}
      </select>
    </div>
  );
}

/** حقل تاريخ الحركة — الافتراضي اليوم، ولا يقبل المستقبل */
export function OccurredAtField({
  id,
  name = "occurred_at",
  today,
  disabled,
  label = "تاريخ الحركة",
  help,
}: {
  id: string;
  name?: string;
  today: string;
  disabled?: boolean;
  label?: string;
  help?: ReactNode;
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
        type="date"
        dir="ltr"
        max={today}
        defaultValue={today}
        disabled={disabled}
        required
      />
    </div>
  );
}

/** حقل مبلغ — الأرقام العربية مقبولة ويحوّلها الإجراء قبل التحقق */
export function AmountField({
  id,
  name = "amount",
  currency,
  disabled,
  label,
  help,
  defaultValue,
}: {
  id: string;
  name?: string;
  currency: string;
  disabled?: boolean;
  label?: string;
  help?: ReactNode;
  defaultValue?: string;
}) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id} className="flex items-center gap-1.5">
        {label ?? `المبلغ (${currency})`}
        {help ? <HelpTip>{help}</HelpTip> : null}
      </Label>
      <Input
        id={id}
        name={name}
        type="number"
        inputMode="decimal"
        dir="ltr"
        step="0.01"
        min={0.01}
        required
        disabled={disabled}
        defaultValue={defaultValue}
        placeholder="0.00"
      />
    </div>
  );
}
