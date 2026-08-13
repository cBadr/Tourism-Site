import { AlertTriangle, CheckCircle2, XCircle } from "lucide-react";

import { toArabicDigits } from "@/components/booking/format";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import type {
  LocaleProgress,
  TranslationNamespace,
  TranslationStatus,
} from "@/lib/i18n-types";
import { DEFAULT_LOCALE } from "@/lib/i18n-types";
import type { createServerSupabase } from "@/lib/supabase/server";
import { cn } from "@/lib/utils";

/**
 * لبنات شاشتَي اللغات (المرحلة ٨) — بنفس إيقاع لبنات المالية والإسناد:
 * قراءة متسامحة لأسماء الأعمدة، بطاقات تنبيه عبر الـ query string، وتنسيق عرض
 * لا حساب.
 *
 * القاعدة الحاكمة هنا: **الأرقام تصل محسوبة من `translation_progress()`** —
 * لا مجموع ولا نسبة مئوية تُحسب في هذا الملف. الاستثناء الوحيد هندسة عرض:
 * عرض شريط التقدم بالنسبة القادمة من القاعدة، وعدّ صفوف قائمة معروضة.
 *
 * التدهور الرشيق مقصود: هجرة ٠٠١٨ قد لا تكون منفَّذة بعد، فكل قارئ يفرّق بين
 * «الجدول/الدالة غير موجودة» (رسالة هجرة) و«رفض قراءة» (رسالة صلاحيات)، ولا
 * يخترع صفراً محل «لا أعرف».
 */

export type Supabase = NonNullable<Awaited<ReturnType<typeof createServerSupabase>>>;

export const hasSupabaseEnv = () =>
  Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);

/** سقف صفوف طابور المراجعة المعروضة — شاشة عمل لا أرشيف */
export const MAX_QUEUE_ROWS = 150;

// ---------------------------------------------------------------------------
// قراءة متسامحة (الجداول والدوال يملكها وكيل SQL: snake_case أو أسماء العقد)
// ---------------------------------------------------------------------------

export const rowsOf = (data: unknown): Record<string, unknown>[] =>
  Array.isArray(data) ? (data as Record<string, unknown>[]) : [];

export function textOf(row: Record<string, unknown> | null, names: string[]): string | null {
  if (!row) return null;
  for (const name of names) {
    const value = row[name];
    if (typeof value === "string" && value !== "") return value;
    if (typeof value === "number") return String(value);
  }
  return null;
}

export function numberOf(row: Record<string, unknown> | null, names: string[]): number | null {
  if (!row) return null;
  for (const name of names) {
    const value = row[name];
    if (typeof value === "number" && Number.isFinite(value)) return value;
    if (typeof value === "string" && value.trim() !== "") {
      const n = Number(value);
      if (Number.isFinite(n)) return n;
    }
  }
  return null;
}

export function boolOf(
  row: Record<string, unknown> | null,
  names: string[],
  fallback = false
): boolean {
  if (!row) return fallback;
  for (const name of names) {
    const value = row[name];
    if (typeof value === "boolean") return value;
    if (typeof value === "string") {
      const s = value.trim().toLowerCase();
      if (s === "true" || s === "t" || s === "1") return true;
      if (s === "false" || s === "f" || s === "0") return false;
    }
  }
  return fallback;
}

// ---------------------------------------------------------------------------
// المفردات
// ---------------------------------------------------------------------------

export const NAMESPACES: TranslationNamespace[] = [
  "ui",
  "page",
  "section",
  "settings",
  "service",
  "vehicle",
];

export const NAMESPACE_LABELS: Record<string, string> = {
  ui: "واجهة",
  page: "صفحة",
  section: "قسم",
  settings: "الهوية",
  service: "خدمة",
  vehicle: "فئة سيارة",
} satisfies Record<TranslationNamespace, string>;

export const NAMESPACE_HINTS: Record<string, string> = {
  ui: "نصوص الواجهة الثابتة: أزرار، عناوين حقول، رسائل تحقق. مصدرها ملفات الرسائل في المستودع لا قاعدة البيانات.",
  page: "عنوان الصفحة وميتاداتاها (عنوان السيو ووصفه) — أثرها في نتائج البحث مباشر.",
  section: "محتوى أقسام الصفحات: العناوين والفقرات وعناصر القوائم. أضخم مساحة وأهمها للزائر.",
  settings: "هوية العلامة وبيانات الشركة ونصوص السيو العامة — تظهر في كل صفحة.",
  service: "أسماء الخدمات ووصفها المختصر كما تظهر في الشبكة وصفحة الخدمة.",
  vehicle: "فئات السيارات: الاسم وعدد المقاعد والوصف المختصر في شبكة الأسطول.",
};

export const namespaceLabel = (ns: string | null): string =>
  (ns && NAMESPACE_LABELS[ns]) || ns || "—";

export const STATUS_LABELS: Record<string, string> = {
  draft: "مسودة",
  reviewed: "مراجَعة",
  published: "منشورة",
} satisfies Record<TranslationStatus, string>;

const STATUS_TONE: Record<string, string> = {
  draft:
    "border-amber-300 bg-amber-100 text-amber-900 dark:border-amber-700 dark:bg-amber-950 dark:text-amber-100",
  reviewed:
    "border-sky-300 bg-sky-100 text-sky-900 dark:border-sky-700 dark:bg-sky-950 dark:text-sky-100",
  published:
    "border-emerald-300 bg-emerald-100 text-emerald-900 dark:border-emerald-700 dark:bg-emerald-950 dark:text-emerald-100",
};

export const STATUS_HINTS: Record<string, string> = {
  draft: "نصٌّ ولّدته الترجمة الآلية ولم يقرأه بشر بعد — لا يراه الزائر إطلاقاً.",
  reviewed: "قرأه بشر واعتمده، وينتظر النشر (زر «انشر كل المراجَع» أو النشر الفوري من صفه).",
  published: "منشور ويقرأه زوار هذه اللغة الآن.",
};

export function StatusBadge({ status }: { status: string }) {
  const known = status in STATUS_LABELS;
  return (
    <Badge
      variant="outline"
      className={cn("font-normal", known ? STATUS_TONE[status] : "border-border text-muted-foreground")}
    >
      {known ? STATUS_LABELS[status] : status}
    </Badge>
  );
}

/** وسم «قديمة»: منشورة أو مراجَعة تغيّر أصلها العربي بعد ترجمتها */
export function StaleBadge() {
  return (
    <Badge
      variant="outline"
      className="border-red-300 bg-red-100 font-normal text-red-900 dark:border-red-700 dark:bg-red-950 dark:text-red-100"
    >
      الأصل تغيّر
    </Badge>
  );
}

// ---------------------------------------------------------------------------
// بطاقات ورسائل
// ---------------------------------------------------------------------------

export const LANGUAGE_ERRORS: Record<string, string> = {
  env: "قاعدة البيانات غير مربوطة — اضبط متغيرات Supabase في ‎.env.local‎ ثم أعد تشغيل الخادم.",
  notready:
    "جداول ودوال اللغات غير موجودة في قاعدة البيانات — نفِّذ هجرة المرحلة ٨ (0018) ثم أعد المحاولة.",
  forbidden: "هذه العملية للمديرين فقط — سجّل الدخول بحساب دوره admin.",
  code: "كود اللغة غير صالح — حرفان بالإنجليزية (en، fr، de) مع لهجة اختيارية بحرفين بعد شرطة (pt-br).",
  name: "اسم اللغة بالعربية إلزامي — هو ما تراه أنت في هذه اللوحة.",
  native: "الاسم الأصلي إلزامي — هو ما يراه الزائر في مبدّل اللغة (English، Français…).",
  dir: "اتجاه الكتابة غير معروف — اختر من اليمين لليسار أو من اليسار لليمين.",
  exists: "هذه اللغة مسجَّلة بالفعل — عدّلها من الجدول بدل إضافتها مرة أخرى.",
  base: "العربية لغة الأصل: لا تُضاف ولا تُعطَّل ولا تُترجَم إلى نفسها.",
  locale: "اللغة غير معروفة — أعد تحميل الصفحة واختر من الجدول.",
  value: "النص المترجم فارغ — اكتب الترجمة قبل الاعتماد، أو اتركه بلا اعتماد ليبقى في الطابور.",
  row: "تعذّر تحديد صف الترجمة — حدّث قائمة العمل ثم أعد المحاولة.",
  save: "تعذّر الحفظ — راجع سجل الخادم لرسالة قاعدة البيانات.",
};

/** بطاقة «اللغات غير جاهزة» — تُعرض قبل تنفيذ هجرة المرحلة ٨ */
export function LanguagesNotReady({ wired, missing }: { wired: boolean; missing: string }) {
  return (
    <Card className="flex flex-row items-start gap-3 border-amber-300 bg-amber-50 p-4 text-amber-900 dark:border-amber-700 dark:bg-amber-950 dark:text-amber-100">
      <AlertTriangle className="mt-0.5 size-5 shrink-0" />
      <div className="text-sm leading-relaxed">
        <p className="font-semibold">شاشات اللغات غير جاهزة بعد</p>
        {wired ? (
          <p>
            قاعدة البيانات مربوطة لكن <code dir="ltr">{missing}</code> غير متاح — نفِّذ هجرة
            المرحلة ٨ من <code dir="ltr">supabase/migrations</code> ثم أعد تحميل الصفحة. بقية
            اللوحة تعمل طبيعياً، والموقع يظل عربياً كما هو.
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

/** بطاقتا نتيجة العملية — اتفاقية «إعادة التوجيه بعد العملية» نفسها */
export function LanguagesFeedback({
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
          <p className="text-sm font-medium">{LANGUAGE_ERRORS[error] ?? "حدث خطأ غير متوقع."}</p>
        </Card>
      )}
    </>
  );
}

/**
 * بطاقة مؤشر — الرقم يصل جاهزاً و«—» تعني «غير معروف».
 *
 * كانت نسخة رابعة مطابقة حرفاً بحرف لنسخة `finance-ui.tsx`؛ صارت المكوّن
 * المشترك `components/ui/kpi-card.tsx` وبقي التصدير من هنا حتى لا تتغيّر
 * استيرادات شاشة اللغات. النبرة تُمرَّر بـ `variant` لا بسلسلة أصناف.
 */
export { KpiCard } from "@/components/ui/kpi-card";

export const numberText = (value: number | null): string =>
  value === null ? "—" : toArabicDigits(value);

/**
 * شريط التقدم — النسبة تصل من `translation_progress()` ولا تُحسب هنا.
 * العرض بالنسبة نفسها مقصوص بين ٠ و١٠٠ حتى لا يكسر التخطيط رقمٌ شاذ.
 */
export function ProgressBar({ percent }: { percent: number | null }) {
  const width = percent === null ? 0 : Math.max(0, Math.min(100, percent));
  return (
    <div
      className="h-2 w-full overflow-hidden rounded-full bg-muted"
      role="progressbar"
      aria-valuenow={width}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-label="نسبة اكتمال الترجمة المنشورة"
    >
      <div className="h-full rounded-full bg-primary transition-all" style={{ width: `${width}%` }} />
    </div>
  );
}

export function hrefWith(basePath: string, params: Record<string, string | undefined>): string {
  const qs = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== "") qs.set(key, value);
  }
  const s = qs.toString();
  return s ? `${basePath}?${s}` : basePath;
}

// ---------------------------------------------------------------------------
// قرّاء البيانات
// ---------------------------------------------------------------------------

export type AdminLocale = {
  code: string;
  name: string;
  nativeName: string;
  dir: "rtl" | "ltr";
  isDefault: boolean;
  enabled: boolean;
  autoPublish: boolean;
  sort: number | null;
};

export function readLocaleRow(row: Record<string, unknown>): AdminLocale {
  const code = (textOf(row, ["code", "locale"]) ?? "").toLowerCase();
  const dir = textOf(row, ["dir", "direction"]);
  return {
    code,
    name: textOf(row, ["name", "label", "name_ar"]) ?? code,
    nativeName: textOf(row, ["native_name", "nativeName", "endonym"]) ?? code,
    dir: dir === "rtl" ? "rtl" : "ltr",
    isDefault: boolOf(row, ["is_default", "isDefault", "default"], code === DEFAULT_LOCALE),
    enabled: boolOf(row, ["enabled", "active", "is_enabled"], false),
    autoPublish: boolOf(row, ["auto_publish", "autoPublish"], false),
    sort: numberOf(row, ["sort", "position", "order"]),
  };
}

export async function readLocales(
  supabase: Supabase
): Promise<{ locales: AdminLocale[]; error: { code?: string } | null }> {
  const result = await supabase.from("locales").select("*");
  if (result.error) return { locales: [], error: result.error };

  const locales = rowsOf(result.data)
    .map(readLocaleRow)
    .filter((locale) => locale.code !== "")
    // الترتيب في الواجهة لا في الاستعلام: عمود `sort` قد لا يوجد أصلاً
    .sort((a, b) => {
      if (a.isDefault !== b.isDefault) return a.isDefault ? -1 : 1;
      const sortDiff = (a.sort ?? 999) - (b.sort ?? 999);
      return sortDiff !== 0 ? sortDiff : a.code.localeCompare(b.code);
    });

  return { locales, error: null };
}

export async function readProgress(
  supabase: Supabase
): Promise<{ progress: Map<string, LocaleProgress>; error: { code?: string } | null }> {
  const result = await supabase.rpc("translation_progress");
  if (result.error) return { progress: new Map(), error: result.error };

  const progress = new Map<string, LocaleProgress>();
  for (const row of rowsOf(result.data)) {
    const locale = (textOf(row, ["locale", "code"]) ?? "").toLowerCase();
    if (locale === "") continue;
    progress.set(locale, {
      locale,
      total: numberOf(row, ["total", "total_keys"]) ?? 0,
      published: numberOf(row, ["published"]) ?? 0,
      reviewed: numberOf(row, ["reviewed"]) ?? 0,
      draft: numberOf(row, ["draft", "drafts"]) ?? 0,
      missing: numberOf(row, ["missing"]) ?? 0,
      stale: numberOf(row, ["stale", "outdated"]) ?? 0,
      percent: numberOf(row, ["percent", "percentage", "pct"]) ?? 0,
    });
  }
  return { progress, error: null };
}

// ---------------------------------------------------------------------------
// طابور المراجعة
// ---------------------------------------------------------------------------

export type QueueRow = {
  /** null = مفتاح في الفهرس الحي بلا صف ترجمة بعد (ناقص) */
  id: string | null;
  locale: string;
  namespace: string;
  key: string;
  /** **الأصل الحي**: النص العربي كما هو الآن — وهو ما يجب أن يُترجَم */
  sourceText: string;
  value: string | null;
  status: string;
  provider: string | null;
  stale: boolean;
  updatedAt: string | null;
};

export function readQueueRow(row: Record<string, unknown>): QueueRow {
  return {
    id: textOf(row, ["id", "translation_id", "translationId"]),
    locale: (textOf(row, ["locale"]) ?? "").toLowerCase(),
    namespace: textOf(row, ["namespace", "ns"]) ?? "ui",
    key: textOf(row, ["key", "translation_key", "translationKey"]) ?? "",
    sourceText: textOf(row, ["source_text", "sourceText", "source"]) ?? "",
    value: textOf(row, ["value", "translation", "target_text"]),
    status: textOf(row, ["status"]) ?? "draft",
    provider: textOf(row, ["provider", "mt_provider"]),
    stale: boolOf(row, ["stale", "is_stale", "isStale", "outdated"]),
    updatedAt: textOf(row, ["updated_at", "updatedAt"]),
  };
}

/** صف من الفهرس الحي (`translation_corpus`) — مساحة ومفتاح ونص عربي */
export type CorpusRow = { namespace: string; key: string; sourceText: string };

/**
 * الفهرس الحي: كل نص عربي قابل للترجمة **مستخرجاً من المحتوى الآن**.
 *
 * هذه هي «قائمة العمل»: لا تُخزَّن ولا تحتاج توليداً، بل تُحسب لحظة الطلب من
 * الصفحات والأقسام والإعدادات والخدمات وفئات السيارات. ومعناها العملي أن
 * إضافة قسم جديد بالعربية تظهر في الطابور فوراً بلا أي خطوة وسيطة.
 */
export async function readCorpus(
  supabase: Supabase
): Promise<{ rows: CorpusRow[]; error: { code?: string } | null }> {
  const result = await supabase.rpc("translation_corpus");
  if (result.error) return { rows: [], error: result.error };

  const rows = rowsOf(result.data)
    .map((row) => ({
      namespace: textOf(row, ["namespace", "ns"]) ?? "",
      key: textOf(row, ["key", "k"]) ?? "",
      sourceText: textOf(row, ["source_text", "sourceText", "src"]) ?? "",
    }))
    .filter((row) => row.namespace !== "" && row.key !== "" && row.sourceText.trim() !== "");

  return { rows, error: null };
}

/** مفتاح الهوية داخل لغة واحدة: المساحة ثم المفتاح */
export const rowIdentity = (namespace: string, key: string): string => `${namespace} ${key}`;

/** صف «ناقص» مصنوع من الفهرس: لا معرّف له لأنه لم يُكتب في الجدول بعد */
export function missingRowFrom(locale: string, row: CorpusRow): QueueRow {
  return {
    id: null,
    locale,
    namespace: row.namespace,
    key: row.key,
    sourceText: row.sourceText,
    value: null,
    status: "draft",
    provider: null,
    stale: false,
    updatedAt: null,
  };
}

export const QUEUE_FILTERS = ["all", "missing", "stale", "draft", "reviewed", "published"] as const;
export type QueueFilter = (typeof QUEUE_FILTERS)[number];

export const QUEUE_FILTER_LABELS: Record<QueueFilter, string> = {
  all: "الكل",
  missing: "ناقصة",
  stale: "الأصل تغيّر",
  draft: "مسودات",
  reviewed: "مراجَعة",
  published: "منشورة",
};

export const isQueueFilter = (value: unknown): value is QueueFilter =>
  typeof value === "string" && (QUEUE_FILTERS as readonly string[]).includes(value);

/** صف ناقص: لا قيمة له بعد — الزائر يرى العربية مكانه */
export const isMissingRow = (row: QueueRow): boolean =>
  row.value === null || row.value.trim() === "";

/**
 * الطابور الكامل للغة = **الصفوف المكتوبة + المفاتيح الناقصة**.
 *
 * `translation_queue` لا تعرف إلا ما كُتب في جدول الترجمات؛ أما المفتاح الذي
 * لم يُترجَم قط فلا صف له أصلاً — ووجوده معلوم من الفهرس الحي وحده. لذلك
 * تُقرأ الدالتان معاً هنا ويُدمَجان: كل مفتاح في الفهرس بلا صف يصير صفاً
 * «ناقصاً» بلا معرّف، يراه المراجع ويكتب ترجمته مباشرة.
 *
 * الفهرس لا يُقرأ إلا حين يكون له معنى: ترشيح «مسودات» أو «مراجَعة» أو
 * «منشورة» أو «الأصل تغيّر» يخص صفوفاً مكتوبة، والناقص ليس منها.
 */
export async function readQueue(
  supabase: Supabase,
  locale: string,
  filter: QueueFilter
): Promise<{ rows: QueueRow[]; error: { code?: string } | null; corpusReady: boolean }> {
  const status =
    filter === "draft" ||
    filter === "reviewed" ||
    filter === "published" ||
    filter === "stale"
      ? filter
      : null;

  const attempts: Record<string, unknown>[] = [
    { p_locale: locale, p_status: status },
    { p_locale: locale },
  ];

  let lastError: { code?: string } | null = null;
  let written: QueueRow[] | null = null;

  for (const args of attempts) {
    const result = await supabase.rpc("translation_queue", args);
    if (!result.error) {
      written = rowsOf(result.data)
        .map(readQueueRow)
        .filter((row) => row.key !== "")
        .map((row) => ({ ...row, locale: row.locale === "" ? locale : row.locale }));
      break;
    }
    lastError = result.error;
    // 42883/PGRST202 تشمل «لا دالة بهذه المعاملات» ⇒ تستحق محاولة بتوقيع أقصر
    if (result.error.code !== "42883" && result.error.code !== "PGRST202") break;
  }

  if (written === null) return { rows: [], error: lastError, corpusReady: false };

  const wantsMissing = filter === "all" || filter === "missing";
  if (!wantsMissing) return { rows: written, error: null, corpusReady: true };

  const corpus = await readCorpus(supabase);
  if (corpus.error) return { rows: written, error: null, corpusReady: false };

  const seen = new Set(written.map((row) => rowIdentity(row.namespace, row.key)));
  const missing = corpus.rows
    .filter((row) => !seen.has(rowIdentity(row.namespace, row.key)))
    .map((row) => missingRowFrom(locale, row));

  return { rows: [...written, ...missing], error: null, corpusReady: true };
}

/** ترشيح الواجهة — شبكة أمان فوق ترشيح القاعدة */
export function filterQueue(rows: QueueRow[], filter: QueueFilter): QueueRow[] {
  if (filter === "all") return rows;
  if (filter === "missing") return rows.filter(isMissingRow);
  if (filter === "stale") return rows.filter((row) => row.stale);
  return rows.filter((row) => row.status === filter && !isMissingRow(row));
}

/**
 * ترتيب الطابور: **القديمة أولاً** لأن الزائر يقرأ الآن ترجمة لم تعد تطابق
 * الأصل — خطأ معروض أسوأ من فراغ يسقط للعربية. ثم الناقصة، ثم المسودات،
 * ثم الباقي بالمساحة فالمفتاح ليجد المراجع صفوف الصفحة الواحدة متجاورة.
 */
const rank = (row: QueueRow): number => {
  if (row.stale) return 0;
  if (isMissingRow(row)) return 1;
  if (row.status === "draft") return 2;
  if (row.status === "reviewed") return 3;
  return 4;
};

export function sortQueue(rows: QueueRow[]): QueueRow[] {
  return [...rows].sort((a, b) => {
    const diff = rank(a) - rank(b);
    if (diff !== 0) return diff;
    const ns = a.namespace.localeCompare(b.namespace);
    return ns !== 0 ? ns : a.key.localeCompare(b.key);
  });
}
