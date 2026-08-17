import Link from "next/link";
import { ArrowLeft, Layers, Paperclip, Plus, Receipt } from "lucide-react";

import { ExportLink } from "@/components/admin/export-link";
import { PrintButton } from "@/components/admin/print-button";
import { PrintHeader } from "@/components/admin/print-header";
import { toArabicDigits } from "@/components/booking/format";
import { SaveButton } from "@/components/admin/save-feedback";
import { HelpTip } from "@/components/shared/HelpTip";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { isMissingTable } from "@/lib/dispatch/settings";
import { createServiceSupabase } from "@/lib/supabase/admin";
import { createServerSupabase } from "@/lib/supabase/server";
import { cn } from "@/lib/utils";
import { controlClass, dateTimeLabel } from "../../orders/_components/booking-ui";
import {
  AccountField,
  AmountField,
  FinanceFeedback,
  FinanceNotReady,
  hasSupabaseEnv,
  hrefWith,
  MAX_EXPENSE_ROWS,
  Money,
  numberOf,
  OccurredAtField,
  RangeFilter,
  readAccounts,
  readCurrency,
  rowsOf,
  type Supabase,
  textOf,
} from "../_components/finance-ui";
import {
  cairoToday,
  type DateRange,
  rangeInstants,
  rangeParams,
  rangeSentence,
  resolveRange,
} from "../_components/range";
import { recordExpense } from "./actions";

/**
 * المصروفات — كل جنيه خرج من الخزينة لغير المتعهدين.
 *
 * التفريق الذي تقوم عليه الشاشة: مستحق المتعهد **تكلفة بيع** لا مصروف، ومكانه
 * شاشة المقاصة. أما الوقود والصيانة والرواتب والإيجار والرسوم فمصروفات تشغيل،
 * وخلطها بالأول يجعل «صافي الربح» رقماً لا يقارن بشيء.
 *
 * المجاميع لكل فئة تُحسب بدوال التجميع داخل Postgres عبر PostgREST — لا تُنقل
 * صفوف المصروفات إلى الخادم لتُجمع هناك. المرفقات تُخزَّن في دلو `receipts`
 * الخاص تحت بادئة `expenses/`، ولا تُقرأ إلا بروابط موقّعة قصيرة العمر.
 */

export const metadata = { title: "المصروفات" };

const PATH = "/admin/finance/expenses";

/** عمر الرابط الموقّع للمرفق — نفس مدة روابط الإيصالات في شاشة الطلب */
const ATTACHMENT_URL_TTL = 300;

const BUCKET = "receipts";

type Category = { id: string; name: string; active: boolean };

type ExpenseRow = {
  id: string;
  categoryId: string | null;
  accountId: string | null;
  amount: number | null;
  occurredAt: string | null;
  note: string | null;
  attachmentPath: string | null;
};

type CategoryTotal = { categoryId: string | null; total: number | null; count: number | null };

type Loaded = {
  currency: string;
  categories: Category[];
  categoriesReady: boolean;
  accounts: { id: string; label: string; kind: string | null; active: boolean }[];
  expenses: ExpenseRow[];
  expensesReady: boolean;
  totals: CategoryTotal[];
  totalsReady: boolean;
  grandTotal: number | null;
  grandCount: number | null;
  signed: Map<string, string>;
  missing: string | null;
};

const BLANK: Loaded = {
  currency: "EGP",
  categories: [],
  categoriesReady: false,
  accounts: [],
  expenses: [],
  expensesReady: false,
  totals: [],
  totalsReady: false,
  grandTotal: null,
  grandCount: null,
  signed: new Map(),
  missing: "قاعدة البيانات",
};

/**
 * روابط موقّعة لكل المرفقات دفعةً واحدة.
 *
 * `createSignedUrls` (بصيغة الجمع) توقّع كل المسارات في طلب واحد — البديل كان
 * طلباً لكل صف، أي مئتَي رحلة شبكة لصفحة واحدة. وبمفتاح الخدمة لأن الدلو خاص
 * ولا سياسة قراءة عليه للمستخدمين، ومسار الملف لا يغادر الخادم أصلاً.
 */
async function signAttachments(paths: string[]): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  if (paths.length === 0) return out;
  const service = createServiceSupabase();
  if (!service) return out;

  try {
    const { data, error } = await service.storage
      .from(BUCKET)
      .createSignedUrls(paths, ATTACHMENT_URL_TTL);
    if (error || !Array.isArray(data)) return out;
    for (const row of data) {
      if (row.path && row.signedUrl) out.set(row.path, row.signedUrl);
    }
  } catch {
    // تعذّر التوقيع — تظهر الأيقونة بلا رابط بدل أن تسقط الصفحة
  }
  return out;
}

async function loadScreen(
  range: DateRange,
  categoryFilter: string | null
): Promise<Loaded> {
  const supabase = await createServerSupabase();
  if (!supabase) return BLANK;

  const { start, end } = rangeInstants(range);

  const [currency, accountsRes, categoriesRes, totalsRes, grandRes, listRes] = await Promise.all([
    readCurrency(supabase),
    readAccounts(supabase),
    supabase
      .from("expense_categories")
      .select("*")
      .order("sort", { ascending: true })
      .order("name", { ascending: true }),
    // التجميع في Postgres: مجموع وعدد لكل فئة داخل الفترة (بلا ترشيح الفئة —
    // الجدول تفصيل الفترة كاملاً، والترشيح يخص القائمة أدناه وحدها)
    supabase
      .from("expenses")
      .select("category_id, total:amount.sum(), n:id.count()")
      .gte("occurred_at", start)
      .lt("occurred_at", end),
    supabase
      .from("expenses")
      .select("total:amount.sum(), n:id.count()")
      .gte("occurred_at", start)
      .lt("occurred_at", end),
    listExpenses(supabase, start, end, categoryFilter),
  ]);

  const categories: Category[] = categoriesRes.error
    ? []
    : rowsOf(categoriesRes.data).map((row) => ({
        id: String(row.id),
        name: textOf(row, ["name", "label", "title"]) ?? "فئة بلا اسم",
        active: row.active !== false,
      }));

  const totals: CategoryTotal[] = totalsRes.error
    ? []
    : rowsOf(totalsRes.data).map((row) => ({
        categoryId: textOf(row, ["category_id", "categoryId"]),
        total: numberOf(row, ["total", "sum"]),
        count: numberOf(row, ["n", "count"]),
      }));

  const grandRow = grandRes.error ? null : rowsOf(grandRes.data)[0] ?? null;

  const expenses = listRes.rows;
  const signed = await signAttachments(
    expenses
      .map((e) => e.attachmentPath)
      .filter((p): p is string => typeof p === "string" && p !== "")
  );

  const missing =
    listRes.error && isMissingTable(listRes.error.code)
      ? "expenses"
      : categoriesRes.error && isMissingTable(categoriesRes.error.code)
        ? "expense_categories"
        : listRes.error || categoriesRes.error
          ? "قراءة المصروفات"
          : null;

  return {
    currency,
    categories,
    categoriesReady: !categoriesRes.error,
    accounts: accountsRes.accounts,
    expenses,
    expensesReady: !listRes.error,
    totals,
    totalsReady: !totalsRes.error,
    grandTotal: numberOf(grandRow, ["total", "sum"]),
    grandCount: numberOf(grandRow, ["n", "count"]),
    signed,
    missing,
  };
}

async function listExpenses(
  supabase: Supabase,
  start: string,
  end: string,
  categoryFilter: string | null
): Promise<{ rows: ExpenseRow[]; error: { code?: string } | null }> {
  let query = supabase
    .from("expenses")
    .select("*")
    .gte("occurred_at", start)
    .lt("occurred_at", end)
    .order("occurred_at", { ascending: false })
    .limit(MAX_EXPENSE_ROWS);

  if (categoryFilter === "none") query = query.is("category_id", null);
  else if (categoryFilter) query = query.eq("category_id", categoryFilter);

  const res = await query;
  if (res.error) return { rows: [], error: res.error };

  return {
    error: null,
    rows: rowsOf(res.data).map((row) => ({
      id: String(row.id),
      categoryId: textOf(row, ["category_id", "categoryId"]),
      accountId: textOf(row, ["account_id", "accountId"]),
      amount: numberOf(row, ["amount"]),
      occurredAt: textOf(row, ["occurred_at", "occurredAt", "created_at"]),
      note: textOf(row, ["note", "memo"]),
      attachmentPath: textOf(row, ["attachment_path", "attachmentPath", "path"]),
    })),
  };
}

export default async function ExpensesPage({
  searchParams,
}: PageProps<"/admin/finance/expenses">) {
  const params = await searchParams;
  const range = resolveRange(params);
  const rawCategory = typeof params.category === "string" ? params.category : null;
  const categoryFilter = rawCategory && rawCategory !== "all" ? rawCategory : null;

  const loaded = await loadScreen(range, categoryFilter);
  const {
    currency,
    categories,
    accounts,
    expenses,
    expensesReady,
    totals,
    totalsReady,
    grandTotal,
    grandCount,
    signed,
    missing,
  } = loaded;

  const wired = hasSupabaseEnv();
  const saved = params.saved === "1";
  const error = typeof params.error === "string" ? params.error : null;
  const readOnly = !wired || !expensesReady;
  const today = cairoToday();

  const categoryName = new Map(categories.map((c) => [c.id, c.name] as const));
  const accountName = new Map(accounts.map((a) => [a.id, a.label] as const));
  const keep = { category: categoryFilter ?? undefined };

  /** مجاميع الفئات مرتّبة بترتيب الفئات نفسه، ثم «بلا فئة» أخيراً */
  const orderedTotals = [
    ...categories.map((c) => ({
      id: c.id,
      name: c.name,
      row: totals.find((t) => t.categoryId === c.id) ?? null,
    })),
    {
      id: "none",
      name: "بلا فئة",
      row: totals.find((t) => t.categoryId === null) ?? null,
    },
  ].filter((entry) => entry.row !== null || entry.id !== "none");

  return (
    <div className="print-sheet mx-auto max-w-5xl space-y-6">
      <div className="no-print flex flex-wrap items-center gap-2">
        <h2 className="flex items-center gap-2 font-heading text-lg font-bold">
          <Receipt className="size-5 text-primary" />
          المصروفات
        </h2>
        <HelpTip>
          المصروفات التشغيلية وحدها: وقود، صيانة، رواتب، إيجار، رسوم تحويل، إعلانات.
          مستحقات المتعهدين ليست مصروفاً بل تكلفة بيع، ومكانها شاشة المقاصة — والفصل
          بينهما هو ما يجعل «صافي الربح» رقماً ذا معنى.
        </HelpTip>
        <div className="ms-auto flex flex-wrap items-center gap-3">
          <PrintButton label="طباعة التقرير" />
          {/*
            الترشيح يسافر مع الملف كما يسافر مع الورقة: `categoryFilter` هو نفسه
            الذي يُرشِّح القائمة أدناه ويُكتب بنداً في `PrintHeader`. وتمريرُ
            «كل الفئات» بينما الشاشة مرشَّحة — أو العكس — يُخرج ملفاً يخالف ما
            طُبع بجواره، وهو خلافٌ لا يظهر إلا حين يُجمع العمودان فيختلفان.
          */}
          {expensesReady && (
            <ExportLink
              target={{
                kind: "expenses",
                from: range.from,
                to: range.to,
                category: categoryFilter,
              }}
              label="تصدير المصروفات (CSV)"
              help={
                <>
                  ملف جدولي بمصروفات الفترة بنفس ترشيح الفئة الجاري — لا بجدول «المجاميع
                  لكل فئة» فوقه، فهو تفصيل الفترة كلها. ومستحقات المتعهدين ليست فيه لأنها
                  تكلفة بيع لا مصروف، ومسار المرفق لا يُصدَّر بنصّ عقد التصدير. وسقف
                  صفوفه معلَن في آخر سطر من الملف.
                </>
              }
            />
          )}
          <Link
            href={hrefWith("/admin/finance", rangeParams(range))}
            className="inline-flex items-center gap-1 text-sm text-primary hover:underline"
          >
            نظرة المالية العامة
            <ArrowLeft className="size-3.5" />
          </Link>
        </div>
      </div>

      {/*
        الفئة المرشَّحة بند في الترويسة لا زينة: القائمة أدناه مرشَّحة بها بينما
        جدول المجاميع فوقها شاملٌ للفترة كلها — وورقةٌ لا تقول ذلك تُقرأ على أنها
        كل مصروفات الفترة، فيبدو مجموعُها مخالفاً لصفوفها بلا سبب ظاهر.
      */}
      <PrintHeader
        title="تقرير المصروفات"
        meta={[
          { label: "الفترة", value: rangeSentence(range) },
          { label: "العملة", value: currency },
          categoryFilter
            ? {
                label: "القائمة مرشَّحة بفئة",
                value:
                  categoryFilter === "none"
                    ? "بلا فئة"
                    : (categoryName.get(categoryFilter) ?? "—"),
              }
            : null,
        ]}
        note="جدول «المجاميع لكل فئة» يشمل الفترة كلها مهما كان الترشيح؛ والقائمة تحته سقفها معلَن في ذيلها."
      />

      {(!wired || missing !== null) && (
        <FinanceNotReady wired={wired} missing={missing ?? "جداول المصروفات"} />
      )}

      <FinanceFeedback
        saved={saved}
        savedMessage="سُجّل المصروف وخرج المبلغ من الحساب المختار فوراً."
        error={error}
      />

      {/* الفترة + الفئة في نموذج واحد — `hidden={{}}` لأن الفئة حقل ظاهر لا مخفي */}
      <RangeFilter basePath={PATH} range={range} keep={keep} hidden={{}} disabled={!wired}>
        <div className="space-y-1.5">
          <Label htmlFor="category" className="flex items-center gap-1.5 text-xs">
            الفئة
            <HelpTip>
              ترشيح القائمة أدناه بفئة واحدة. جدول «المجاميع لكل فئة» يبقى شاملاً كل
              الفئات في الفترة مهما اخترت هنا — لأنه تفصيل الفترة لا نتيجة الترشيح.
            </HelpTip>
          </Label>
          <select
            id="category"
            name="category"
            defaultValue={categoryFilter ?? "all"}
            disabled={!wired}
            className={cn(controlClass, "w-44")}
          >
            <option value="all">كل الفئات</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
                {c.active ? "" : " (متوقفة)"}
              </option>
            ))}
            <option value="none">بلا فئة</option>
          </select>
        </div>
      </RangeFilter>

      {/* المجاميع لكل فئة — كل رقم دالة تجميع في Postgres */}
      <Card className="space-y-4 p-5">
        <div className="flex flex-wrap items-center gap-2">
          <h3 className="flex items-center gap-1.5 font-heading text-base font-bold">
            <Layers className="size-4 text-primary" />
            المجاميع لكل فئة
            <HelpTip>
              مجموع وعدد مصروفات كل فئة داخل الفترة المختارة، محسوبَين بدالتَي{" "}
              <code dir="ltr">sum</code> و<code dir="ltr">count</code> في قاعدة البيانات.
              الفئة التي لا مصروف لها في الفترة تظهر بصفر صريح — وهذا صفر معلوم لا
              مخترَع.
            </HelpTip>
          </h3>
          {grandTotal !== null && (
            <Badge variant="secondary" className="ms-auto">
              إجمالي الفترة: <Money value={grandTotal} currency={currency} />
            </Badge>
          )}
        </div>

        {!totalsReady ? (
          <p className="text-sm text-muted-foreground">
            تعذّر حساب المجاميع — تأكد أن جدول <code dir="ltr">expenses</code> منفَّذ في
            قاعدة البيانات (هجرة المرحلة ٧).
          </p>
        ) : orderedTotals.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            لا فئات مصروفات بعد — تُزرع الفئات الأولى مع هجرة المرحلة ٧، ويمكن تسجيل
            مصروف بلا فئة حتى ذلك الحين.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[32rem] text-sm">
              <thead>
                <tr className="border-b border-border text-xs text-muted-foreground">
                  <th className="p-2 text-start font-medium">الفئة</th>
                  <th className="p-2 text-start font-medium">عدد المصروفات</th>
                  <th className="p-2 text-start font-medium">المجموع</th>
                  {/* عمود الروابط يُخفى برأسه وخانته معاً — خانةٌ بلا رأس تزيح الصف */}
                  <th className="no-print p-2 text-start font-medium" />
                </tr>
              </thead>
              <tbody>
                {orderedTotals.map((entry) => (
                  <tr key={entry.id} className="border-b border-border last:border-0">
                    <td className="p-2 font-medium">{entry.name}</td>
                    <td className="p-2" dir="ltr">
                      {entry.row?.count === null || entry.row?.count === undefined
                        ? "٠"
                        : toArabicDigits(entry.row.count)}
                    </td>
                    <td className="p-2">
                      <Money value={entry.row?.total ?? 0} currency={currency} />
                    </td>
                    <td className="no-print p-2">
                      <Link
                        href={hrefWith(PATH, { ...rangeParams(range), category: entry.id })}
                        className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
                      >
                        عرض مصروفاتها
                        <ArrowLeft className="size-3" />
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {/* القائمة */}
      <Card className="space-y-4 p-5">
        <div>
          <h3 className="font-heading text-base font-bold">
            المصروفات المسجَّلة
            {categoryFilter && (
              <span className="ms-2 text-sm font-normal text-muted-foreground">
                (مرشَّحة بفئة{" "}
                {categoryFilter === "none" ? "«بلا فئة»" : `«${categoryName.get(categoryFilter) ?? "—"}»`})
              </span>
            )}
          </h3>
          <p className="text-sm text-muted-foreground">الأحدث أولاً، ضمن الفترة المختارة.</p>
        </div>

        {!expensesReady ? (
          <p className="text-sm text-muted-foreground">
            تعذّرت قراءة المصروفات — تأكد أن جدول <code dir="ltr">expenses</code> منفَّذ في
            قاعدة البيانات (هجرة المرحلة ٧).
          </p>
        ) : expenses.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            لا مصروفات في هذه الفترة{categoryFilter ? " ضمن الفئة المختارة" : ""} — سجّل
            أول مصروف من النموذج أدناه.
          </p>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[46rem] text-sm">
                <thead>
                  <tr className="border-b border-border text-xs text-muted-foreground">
                    <th className="p-2 text-start font-medium">التاريخ</th>
                    <th className="p-2 text-start font-medium">الفئة</th>
                    <th className="p-2 text-start font-medium">الحساب</th>
                    <th className="p-2 text-start font-medium">المبلغ</th>
                    <th className="p-2 text-start font-medium">الملاحظة</th>
                    <th className="p-2 text-start font-medium">المرفق</th>
                  </tr>
                </thead>
                <tbody>
                  {expenses.map((row) => {
                    const url = row.attachmentPath ? signed.get(row.attachmentPath) : undefined;
                    return (
                      <tr key={row.id} className="border-b border-border align-top last:border-0">
                        <td className="p-2 text-xs whitespace-nowrap text-muted-foreground">
                          {dateTimeLabel(row.occurredAt)}
                        </td>
                        <td className="p-2">
                          {row.categoryId ? (
                            (categoryName.get(row.categoryId) ?? "—")
                          ) : (
                            <span className="text-muted-foreground">بلا فئة</span>
                          )}
                        </td>
                        <td className="p-2 text-xs">
                          {row.accountId ? (
                            (accountName.get(row.accountId) ?? "—")
                          ) : (
                            <span className="text-muted-foreground">—</span>
                          )}
                        </td>
                        <td className="p-2 font-medium text-red-700 dark:text-red-300">
                          <Money value={row.amount} currency={currency} />
                        </td>
                        <td className="max-w-[16rem] p-2 text-xs leading-relaxed">
                          {row.note ?? <span className="text-muted-foreground">—</span>}
                        </td>
                        <td className="p-2 text-xs whitespace-nowrap">
                          {!row.attachmentPath ? (
                            <span className="text-muted-foreground">—</span>
                          ) : url ? (
                            <a
                              href={url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="inline-flex items-center gap-1 text-primary hover:underline"
                            >
                              <Paperclip className="size-3" />
                              فتح
                            </a>
                          ) : (
                            <span
                              className="inline-flex items-center gap-1 text-muted-foreground"
                              title="المرفق موجود لكن توقيع رابطه يحتاج SUPABASE_SERVICE_ROLE_KEY في متغيرات البيئة"
                            >
                              <Paperclip className="size-3" />
                              مرفق
                            </span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <p className="text-xs text-muted-foreground">
              المعروض {toArabicDigits(expenses.length)} مصروفاً
              {expenses.length === MAX_EXPENSE_ROWS
                ? ` (أحدث ${toArabicDigits(MAX_EXPENSE_ROWS)} في الفترة — ضيّق الفترة أو رشّح بفئة)`
                : ""}
              {grandCount !== null ? ` من ${toArabicDigits(grandCount)} في الفترة كلها` : ""}.
              روابط المرفقات موقّعة وتنتهي صلاحيتها بعد خمس دقائق.
            </p>
          </>
        )}
      </Card>

      {/* تسجيل مصروف */}
      <form action={readOnly ? undefined : recordExpense}>
        <Card className="space-y-4 p-5">
          <div>
            <h3 className="flex items-center gap-1.5 font-heading text-base font-bold">
              <Plus className="size-4 text-primary" />
              تسجيل مصروف
              <HelpTip>
                تسجيل المصروف يكتب قيداً منصرفاً على الحساب المختار فوراً — أي أن رصيد
                ذلك الحساب ينقص بالمبلغ نفسه في اللحظة نفسها. اختر الحساب الذي خرج منه
                المال فعلاً لا الحساب «الأقرب».
              </HelpTip>
            </h3>
            <p className="text-sm text-muted-foreground">
              المرفق اختياري لكنه ما يحوّل الرقم إلى مستند: صورة الفاتورة أو الإيصال.
            </p>
          </div>

          {Object.entries(rangeParams(range)).map(([name, value]) => (
            <input key={name} type="hidden" name={`return_${name}`} value={value} />
          ))}
          {categoryFilter && (
            <input type="hidden" name="return_category" value={categoryFilter} />
          )}

          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <div className="space-y-1.5">
              <Label htmlFor="expense-category" className="flex items-center gap-1.5">
                الفئة
                <HelpTip>
                  الفئة هي ما يجعل المصروفات قابلة للقراءة بعد شهر: «وقود» و«صيانة»
                  و«رواتب» بدل قائمة أرقام. اتركها «بلا فئة» عند الشك ثم صنّفها لاحقاً.
                </HelpTip>
              </Label>
              <select
                id="expense-category"
                name="category"
                defaultValue={categoryFilter && categoryFilter !== "none" ? categoryFilter : ""}
                disabled={readOnly}
                className={controlClass}
              >
                <option value="">بلا فئة</option>
                {categories
                  .filter((c) => c.active)
                  .map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
              </select>
            </div>

            <AccountField
              id="expense-account"
              name="account"
              accounts={accounts}
              disabled={readOnly}
              label="الحساب المنصرف منه"
              help="الحساب الذي خرج منه المال فعلاً: درج الكاش، محفظة، أو حساب بنكي."
            />

            <AmountField id="expense-amount" currency={currency} disabled={readOnly} />

            <OccurredAtField
              id="expense-date"
              today={today}
              disabled={readOnly}
              label="تاريخ المصروف"
              help="اليوم الذي وقع فيه المصروف فعلاً لا يوم إدخاله — عليه يُبنى تقرير الفترة."
            />
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="expense-note" className="flex items-center gap-1.5">
                الملاحظة
                <HelpTip>
                  سطر واحد يشرح المصروف: «بنزين رحلة القاهرة–الغردقة» أو «صيانة دورية
                  هيونداي ٣٤٥». يظهر في الجدول أعلاه وفي كشف الحساب.
                </HelpTip>
              </Label>
              <textarea
                id="expense-note"
                name="note"
                rows={2}
                maxLength={500}
                disabled={readOnly}
                className={cn(controlClass, "resize-y leading-relaxed")}
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="expense-file" className="flex items-center gap-1.5">
                المرفق (اختياري)
                <HelpTip>
                  صورة أو PDF بحد ٥ ميجابايت. يُخزَّن في مخزن خاص لا يُقرأ إلا بروابط
                  موقّعة قصيرة العمر من هذه الشاشة — لا رابط عام له إطلاقاً.
                </HelpTip>
              </Label>
              <Input
                id="expense-file"
                name="attachment"
                type="file"
                accept="image/jpeg,image/png,image/webp,application/pdf"
                disabled={readOnly}
                className="file:me-2 file:text-xs"
              />
            </div>
          </div>

          <Separator />
          <div className="flex justify-end">
            <SaveButton
              label="تسجيل المصروف"
              icon={<Plus />}
              savedLabel="تم التسجيل"
              pendingLabel="جارٍ التسجيل…"
              failedLabel="لم يُسجَّل"
              disabled={readOnly}
            />
          </div>
        </Card>
      </form>
    </div>
  );
}
