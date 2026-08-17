import { Badge } from "@/components/ui/badge";
import { formatMoney } from "@/components/booking/format";
import type { PaymentIntentStatus } from "@/lib/payments-types";
import { cn } from "@/lib/utils";

/**
 * لبنات شاشة بوابات الدفع (المرحلة ٩) — بنفس إيقاع لبنات الطلبات والمالية:
 * مفردات عربية ثابتة، وسوم حالة ملوّنة، وقراءة متسامحة لصفوف يملكها وكيل SQL.
 *
 * قاعدتان تحكمان الشاشة كلها:
 * ١) **لا سرّ يُطبع إطلاقاً.** قائمة التحقق تعرض *اسم* متغير البيئة وحالته
 *    (موجود / ناقص) ولا تلمس قيمته ولا تمرّرها إلى الواجهة — لا في نص ولا في
 *    سمة ولا في تلميح.
 * ٢) **لا حساب مالي في TypeScript.** المبلغ يُطبع كما يصل من القاعدة؛ والوحيد
 *    المسموح تحويل *وحدة عرض* (قرش ← جنيه) حين لا توفّر القاعدة عموداً بالوحدة
 *    الكبرى — وهو تحويل وحدة لا عملية محاسبية (انظر `intentAmountMajor`).
 */

/* ------------------------------------------------------------------ */
/* حالات جلسات الدفع                                                    */
/* ------------------------------------------------------------------ */

export const INTENT_STATUSES: PaymentIntentStatus[] = [
  "created",
  "pending",
  "succeeded",
  "failed",
  "cancelled",
  "expired",
];

export const INTENT_STATUS_LABELS: Record<PaymentIntentStatus, string> = {
  created: "تم الإنشاء",
  pending: "عند المزوّد",
  succeeded: "تم الدفع",
  failed: "لم يتم الدفع",
  cancelled: "تم الإلغاء",
  expired: "انتهت المهلة",
};

export const INTENT_STATUS_HINTS: Record<PaymentIntentStatus, string> = {
  created: "أُنشئت الجلسة في قاعدتنا ولم يصل العميل إلى صفحة المزوّد بعد.",
  pending: "العميل عند المزوّد الآن. لا شيء مؤكد حتى يصل الـ webhook الموقّع.",
  succeeded:
    "وصل تأكيد موقّع من المزوّد: أُنشئ مدفوع معتمد فقُيِّد في الدفتر تلقائياً وانتقل الحجز إلى «تم التأكيد» وبدأ البث.",
  failed:
    "رفض المزوّد العملية (رصيد أو بطاقة أو تحقق ثلاثي الأبعاد) — الحجز باقٍ بانتظار الدفع ويستطيع العميل إعادة المحاولة.",
  cancelled: "أغلق العميل صفحة الدفع أو تراجع قبل إتمامها.",
  expired: "انقضت مهلة جلسة الدفع لدى المزوّد قبل إتمامها.",
};

const INTENT_STATUS_TONE: Record<PaymentIntentStatus, string> = {
  created:
    "border-slate-300 bg-slate-100 text-slate-900 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-100",
  pending:
    "border-amber-300 bg-amber-100 text-amber-900 dark:border-amber-700 dark:bg-amber-950 dark:text-amber-100",
  succeeded:
    "border-emerald-300 bg-emerald-100 text-emerald-900 dark:border-emerald-700 dark:bg-emerald-950 dark:text-emerald-100",
  failed:
    "border-red-300 bg-red-100 text-red-900 dark:border-red-700 dark:bg-red-950 dark:text-red-100",
  cancelled:
    "border-slate-300 bg-slate-100 text-slate-900 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-100",
  expired:
    "border-slate-300 bg-slate-100 text-slate-900 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-100",
};

export const isIntentStatus = (value: unknown): value is PaymentIntentStatus =>
  typeof value === "string" && (INTENT_STATUSES as string[]).includes(value);

export function IntentStatusBadge({ status }: { status: string | null }) {
  const known = isIntentStatus(status);
  return (
    <Badge
      variant="outline"
      className={cn(
        known ? INTENT_STATUS_TONE[status] : "border-border text-muted-foreground",
        "font-medium"
      )}
      title={known ? INTENT_STATUS_HINTS[status] : undefined}
    >
      {known ? INTENT_STATUS_LABELS[status] : (status ?? "—")}
    </Badge>
  );
}

/* ------------------------------------------------------------------ */
/* المبلغ                                                               */
/* ------------------------------------------------------------------ */

/**
 * مبلغ الجلسة بالوحدة الكبرى للعرض.
 *
 * الجلسة تخزّن **وحدات صغرى** (قروش) أعداداً صحيحة تفادياً لانحراف الكسور
 * (قرار العقد). فإن أتاحت القاعدة عموداً بالوحدة الكبرى (`amount` أو
 * `amount_major`) قُرئ كما هو ولم يُلمس. وإلا فالقسمة على مئة هنا **تحويل وحدة
 * عرض** لا عملية محاسبية: لا مبلغ يُشتق ولا يُخزَّن ولا يُقارن، والمعروض هو
 * القيمة المخزَّنة نفسها بوحدة أخرى.
 */
export function intentAmountMajor(row: Record<string, unknown>): number | null {
  for (const key of ["amount", "amount_major", "amountMajor"]) {
    const value = row[key];
    const parsed = typeof value === "number" ? value : Number(value);
    if (value !== null && value !== undefined && value !== "" && Number.isFinite(parsed)) {
      return parsed;
    }
  }
  for (const key of ["amount_minor", "amountMinor"]) {
    const value = row[key];
    const parsed = typeof value === "number" ? value : Number(value);
    if (value !== null && value !== undefined && value !== "" && Number.isFinite(parsed)) {
      return parsed / 100;
    }
  }
  return null;
}

/** مبلغ معروض أو «—» — لا صفر مخترَع محلّ «لا أعرف» */
export function IntentMoney({ value, currency }: { value: number | null; currency: string }) {
  if (value === null) return <span className="text-muted-foreground">—</span>;
  return (
    <span dir="ltr" className="font-medium whitespace-nowrap">
      {formatMoney(value, currency)}
    </span>
  );
}
