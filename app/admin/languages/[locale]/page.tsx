import Link from "next/link";
import { ArrowRight, Check, Filter, Send, Upload } from "lucide-react";

import { toArabicDigits } from "@/components/booking/format";
import { HelpTip } from "@/components/shared/HelpTip";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { isMissingFunction, isMissingTable } from "@/lib/dispatch/settings";
import type { LocaleProgress } from "@/lib/i18n-types";
import { DEFAULT_LOCALE } from "@/lib/i18n-types";
import { describeMtProvider } from "@/lib/i18n/mt";
import { createServerSupabase } from "@/lib/supabase/server";
import { cn } from "@/lib/utils";
import { controlClass } from "../../orders/_components/booking-ui";
import {
  type AdminLocale,
  filterQueue,
  hasSupabaseEnv,
  isMissingRow,
  isQueueFilter,
  LanguagesFeedback,
  LanguagesNotReady,
  MAX_QUEUE_ROWS,
  namespaceLabel,
  NAMESPACE_HINTS,
  NAMESPACES,
  numberText,
  ProgressBar,
  type QueueFilter,
  QUEUE_FILTER_LABELS,
  QUEUE_FILTERS,
  type QueueRow,
  readLocales,
  readProgress,
  readQueue,
  sortQueue,
  StaleBadge,
  StatusBadge,
  STATUS_HINTS,
} from "../_components/languages-ui";
import { TranslateButton } from "../_components/translate-button";
import { publishReviewed, saveTranslation } from "./actions";

/**
 * طابور مراجعة لغة واحدة — الشاشة التي يصير فيها النص الآلي نصاً منشوراً.
 *
 * الترتيب هو المنتج هنا: **القديمة أولاً** (ترجمة منشورة تغيّر أصلها العربي —
 * أي معلومة خاطئة يقرؤها الزائر الآن)، ثم الناقصة، ثم المسودات. المراجع الذي
 * يفتح الشاشة ويصلح أول عشرة صفوف يكون قد أصلح أخطرها فعلاً لا أولها أبجدياً.
 *
 * الأصل العربي معروض بجوار كل حقل عمداً: المراجعة بلا مصدر تخمين، والمترجم
 * الآلي يخطئ في المصطلح لا في القواعد غالباً — «رحلة» تصير trip حيناً و
 * journey حيناً، والقرار بينهما يحتاج رؤية الأصل.
 *
 * زر «اعتمد» يوقف الصف عند المراجَعة (لا يراه الزائر)، و«اعتمد وانشر» ينشره
 * فوراً. وزر «انشر كل المراجَع» ينشر ما اعتُمد دفعةً — وكلها تقع داخل دوال
 * Postgres لا هنا.
 */

export const metadata = { title: "مراجعة الترجمة" };

type Loaded = {
  locale: AdminLocale | null;
  localesReady: boolean;
  rows: QueueRow[];
  queueReady: boolean;
  /** قُرئ الفهرس الحي؟ بدونه لا تظهر المفاتيح الناقصة (وتظهر المكتوبة كاملة) */
  corpusReady: boolean;
  progress: LocaleProgress | null;
  missing: string | null;
};

const BLANK: Loaded = {
  locale: null,
  localesReady: false,
  rows: [],
  queueReady: false,
  corpusReady: false,
  progress: null,
  missing: "قاعدة البيانات",
};

async function loadScreen(locale: string, filter: QueueFilter): Promise<Loaded> {
  const supabase = await createServerSupabase();
  if (!supabase) return BLANK;

  const [localesResult, queueResult, progressResult] = await Promise.all([
    readLocales(supabase),
    readQueue(supabase, locale, filter),
    readProgress(supabase),
  ]);

  const missing =
    localesResult.error && isMissingTable(localesResult.error.code)
      ? "locales"
      : queueResult.error && isMissingFunction(queueResult.error.code)
        ? "translation_queue"
        : queueResult.error || localesResult.error
          ? "قراءة طابور الترجمة"
          : null;

  return {
    locale: localesResult.locales.find((row) => row.code === locale) ?? null,
    localesReady: !localesResult.error,
    rows: queueResult.rows,
    queueReady: !queueResult.error,
    corpusReady: queueResult.corpusReady,
    progress: progressResult.progress.get(locale) ?? null,
    missing,
  };
}

/** جملة النجاح المناسبة للعملية التي رجعت من الإجراء */
function savedSentence(params: Record<string, string | string[] | undefined>): string | null {
  if (typeof params.bulk === "string") {
    const count = /^\d+$/.test(params.bulk) ? toArabicDigits(params.bulk) : null;
    return count === null
      ? "نُشرت كل الترجمات المراجَعة في هذه اللغة — صارت تصل الزائر الآن."
      : `نُشرت ${count} ترجمة مراجَعة — صارت تصل الزائر الآن. المسودات غير المراجَعة لم تتأثر.`;
  }
  if (params.published === "1") {
    return "اعتُمدت الترجمة ونُشرت — يقرؤها زوار هذه اللغة فوراً.";
  }
  if (params.saved === "1") {
    return "اعتُمدت الترجمة وتنتظر النشر — لم يرها الزائر بعد. انشرها من صفها أو بزر «انشر كل المراجَع».";
  }
  return null;
}

export default async function LocaleReviewPage(props: PageProps<"/admin/languages/[locale]">) {
  const [routeParams, params] = await Promise.all([props.params, props.searchParams]);
  const locale = routeParams.locale.toLowerCase();

  // العربية أصل لا لغة ترجمة — لا طابور لها أصلاً، فلا نقرأ القاعدة أساساً
  if (locale === DEFAULT_LOCALE) {
    return (
      <div className="mx-auto max-w-3xl space-y-4">
        <Card className="space-y-2 p-5 text-sm leading-relaxed">
          <p className="font-heading text-base font-bold">العربية هي الأصل لا ترجمة</p>
          <p className="text-muted-foreground">
            نصوص العربية تُحرَّر من شاشتَي «المحتوى» و«الإعدادات» مباشرة، ومنها يُبنى طابور
            كل لغة أخرى.
          </p>
          <Link href="/admin/languages" className="text-primary hover:underline">
            العودة إلى مدير اللغات
          </Link>
        </Card>
      </div>
    );
  }

  const filter: QueueFilter = isQueueFilter(params.status) ? params.status : "all";
  const nsFilter =
    typeof params.ns === "string" && (NAMESPACES as string[]).includes(params.ns)
      ? params.ns
      : null;

  const loaded = await loadScreen(locale, filter);
  const { localesReady, rows, queueReady, corpusReady, progress, missing } = loaded;

  const wired = hasSupabaseEnv();
  const readOnly = !wired || !queueReady;
  const error = typeof params.error === "string" ? params.error : null;
  const saved = savedSentence(params);
  const provider = describeMtProvider();

  const path = `/admin/languages/${locale}`;
  const localeRow = loaded.locale;
  const title = localeRow?.name ?? locale;
  const dir = localeRow?.dir ?? "ltr";

  const filtered = sortQueue(
    filterQueue(rows, filter).filter((row) => nsFilter === null || row.namespace === nsFilter)
  );
  const shown = filtered.slice(0, MAX_QUEUE_ROWS);

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="flex items-center gap-2 font-heading text-lg font-bold">
          مراجعة الترجمة — {title}
          <code dir="ltr" className="text-sm font-normal text-muted-foreground">
            /{locale}
          </code>
        </h2>
        {localeRow && (
          <Badge
            variant="outline"
            className={cn(
              "font-normal",
              localeRow.enabled
                ? "border-emerald-300 text-emerald-900 dark:border-emerald-700 dark:text-emerald-100"
                : "border-border text-muted-foreground"
            )}
          >
            {localeRow.enabled ? "ظاهرة للزوار" : "مخفية عن الزوار"}
          </Badge>
        )}
        {localeRow?.autoPublish && (
          <Badge
            variant="outline"
            className="border-amber-300 bg-amber-100 font-normal text-amber-900 dark:border-amber-700 dark:bg-amber-950 dark:text-amber-100"
          >
            نشر تلقائي مفعَّل
          </Badge>
        )}
        <Link
          href="/admin/languages"
          className="ms-auto inline-flex items-center gap-1 text-sm text-primary hover:underline"
        >
          <ArrowRight className="size-3.5" />
          مدير اللغات
        </Link>
      </div>

      {(!wired || missing !== null) && (
        <LanguagesNotReady wired={wired} missing={missing ?? "دوال الترجمة"} />
      )}

      {localesReady && localeRow === null && (
        <Card className="p-4 text-sm leading-relaxed text-muted-foreground">
          الكود <code dir="ltr">{locale}</code> غير مسجَّل في جدول اللغات — أضفه من مدير
          اللغات أولاً، أو تأكد أنك فتحت الرابط الصحيح.
        </Card>
      )}

      <LanguagesFeedback saved={saved !== null} savedMessage={saved ?? ""} error={error} />

      {/* التقدم + الإجراءات الجماعية */}
      <Card className="space-y-4 p-5">
        <div className="flex flex-wrap items-center gap-2">
          <h3 className="font-heading text-base font-bold">حالة اللغة</h3>
          {progress && (
            <span className="flex items-center gap-2 text-xs text-muted-foreground">
              <span dir="ltr" className="font-medium text-foreground">
                {toArabicDigits(Math.round(progress.percent))}٪
              </span>
              منشور
            </span>
          )}
        </div>

        {progress === null ? (
          <p className="text-sm text-muted-foreground">
            لا أرقام تقدم لهذه اللغة بعد — اضغط «حدّث قائمة العمل» في مدير اللغات ليُبنى
            طابورها من محتوى الموقع الحالي.
          </p>
        ) : (
          <>
            <ProgressBar percent={progress.percent} />
            <dl className="grid grid-cols-2 gap-2 text-xs sm:grid-cols-3 lg:grid-cols-6">
              {[
                { label: "إجمالي المفاتيح", value: progress.total, tone: "" },
                {
                  label: "منشورة",
                  value: progress.published,
                  tone: "text-emerald-700 dark:text-emerald-300",
                },
                {
                  label: "مراجَعة",
                  value: progress.reviewed,
                  tone: "text-sky-700 dark:text-sky-300",
                },
                {
                  label: "مسودات",
                  value: progress.draft,
                  tone: "text-amber-700 dark:text-amber-300",
                },
                { label: "ناقصة", value: progress.missing, tone: "text-muted-foreground" },
                {
                  label: "الأصل تغيّر",
                  value: progress.stale,
                  tone: "text-red-700 dark:text-red-300",
                },
              ].map((cell) => (
                <div key={cell.label} className="rounded-lg bg-muted/50 p-2">
                  <dt className="text-[11px] leading-tight text-muted-foreground">{cell.label}</dt>
                  <dd dir="ltr" className={cn("text-base font-bold", cell.tone)}>
                    {numberText(cell.value)}
                  </dd>
                </div>
              ))}
            </dl>
          </>
        )}

        <div className="flex flex-wrap items-center gap-3">
          <TranslateButton
            locale={locale}
            limit={provider.maxTexts}
            disabled={readOnly || !provider.ready}
          />
          <HelpTip>
            يرسل دفعة من المفاتيح الناقصة والقديمة إلى {provider.label} ويكتب ناتجها{" "}
            <span className="font-semibold">مسودات</span> لا أكثر. السقف {" "}
            {toArabicDigits(provider.maxTexts)} نصاً في الضغطة الواحدة حتى لا تحرق ضغطة واحدة
            الحصة اليومية — كرّر الضغط حتى يفرغ الطابور. {provider.note}
          </HelpTip>

          <form action={publishReviewed} className="flex items-center gap-2">
            <input type="hidden" name="locale" value={locale} />
            <input type="hidden" name="return_ns" value={nsFilter ?? ""} />
            <input type="hidden" name="return_status" value={filter} />
            <Button
              type="submit"
              size="sm"
              variant="outline"
              disabled={readOnly || (progress?.reviewed ?? 0) === 0}
            >
              <Upload />
              انشر كل المراجَع
              {progress && progress.reviewed > 0 ? ` (${numberText(progress.reviewed)})` : ""}
            </Button>
          </form>
          <HelpTip>
            ينقل كل صف حالته «مراجَعة» إلى «منشورة» دفعةً واحدة عبر دالة{" "}
            <code dir="ltr">publish_locale</code>. المسودات التي لم يعتمدها بشر لا تتأثر
            إطلاقاً — وهذا هو الفرق بينه وبين النشر التلقائي.
          </HelpTip>
        </div>
      </Card>

      {/* الترشيح — نموذج GET حتى يبقى الرابط قابلاً للحفظ والمشاركة */}
      <form action={path} method="get">
        <Card className="gap-3 p-4">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="flex items-center gap-1.5 text-sm font-medium">
              <Filter className="size-4 text-primary" />
              الترشيح
              <HelpTip>
                ابدأ بـ «الأصل تغيّر»: ترجمات منشورة لم تعد تطابق النص العربي، أي معلومة
                خاطئة يقرؤها الزائر الآن. ثم «ناقصة»، ثم «مسودات».
              </HelpTip>
            </span>
          </div>

          <div className="flex flex-wrap items-end gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="ns" className="flex items-center gap-1.5 text-xs">
                المساحة
                <HelpTip>
                  المساحة تقول من أين جاء النص: واجهة ثابتة، أو عنوان صفحة وميتاداتاها، أو
                  محتوى قسم، أو الهوية، أو خدمة، أو فئة سيارة. راجع مساحةً كاملة في جلسة
                  واحدة — المصطلح يبقى متسقاً هكذا.
                </HelpTip>
              </Label>
              <select
                id="ns"
                name="ns"
                defaultValue={nsFilter ?? "all"}
                disabled={!wired}
                className={cn(controlClass, "w-44")}
              >
                <option value="all">كل المساحات</option>
                {NAMESPACES.map((ns) => (
                  <option key={ns} value={ns}>
                    {namespaceLabel(ns)}
                  </option>
                ))}
              </select>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="status" className="flex items-center gap-1.5 text-xs">
                الحالة
                <HelpTip>
                  مسودة = آلية لم يقرأها بشر · مراجَعة = اعتُمدت وتنتظر النشر · منشورة =
                  يقرؤها الزائر · ناقصة = بلا ترجمة (يظهر مكانها النص العربي) · الأصل تغيّر =
                  ترجمة قديمة لم تعد تطابق العربية.
                </HelpTip>
              </Label>
              <select
                id="status"
                name="status"
                defaultValue={filter}
                disabled={!wired}
                className={cn(controlClass, "w-40")}
              >
                {QUEUE_FILTERS.map((value) => (
                  <option key={value} value={value}>
                    {QUEUE_FILTER_LABELS[value]}
                  </option>
                ))}
              </select>
            </div>

            <Button type="submit" size="sm" disabled={!wired}>
              تطبيق
            </Button>
          </div>

          <p className="text-xs text-muted-foreground">
            المعروض {toArabicDigits(shown.length)} صفاً
            {filtered.length > shown.length
              ? ` من ${toArabicDigits(filtered.length)} مطابقاً (أول ${toArabicDigits(MAX_QUEUE_ROWS)} — عالِجها لتظهر البقية)`
              : ""}
            . الترتيب: القديمة أولاً ثم الناقصة ثم المسودات.
            {!corpusReady && (filter === "all" || filter === "missing")
              ? " تعذّرت قراءة الفهرس الحي، فالمفاتيح التي لم تُترجَم قط لا تظهر الآن — تظهر المكتوبة وحدها."
              : ""}
          </p>
        </Card>
      </form>

      {/* الصفوف */}
      {!queueReady ? (
        <Card className="p-5 text-sm text-muted-foreground">
          تعذّرت قراءة الطابور — تأكد أن دالة <code dir="ltr">translation_queue</code> منفَّذة
          في قاعدة البيانات (هجرة المرحلة ٨) وأن حسابك دوره <code dir="ltr">admin</code>.
        </Card>
      ) : shown.length === 0 ? (
        <Card className="p-5 text-sm text-muted-foreground">
          لا صفوف مطابقة لهذا الترشيح. إن كان الطابور فارغاً تماماً فاضغط «حدّث قائمة العمل»
          في مدير اللغات ليُبنى من محتوى الموقع الحالي.
        </Card>
      ) : (
        <div className="space-y-3">
          {shown.map((row) => {
            const rowKey = `${row.namespace}:${row.key}`;
            const fieldId = `value-${rowKey.replace(/[^a-zA-Z0-9_-]/g, "-")}`;
            const missingValue = isMissingRow(row);

            return (
              <Card key={rowKey} className="gap-3 p-4">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge variant="secondary" className="font-normal">
                    {namespaceLabel(row.namespace)}
                  </Badge>
                  <HelpTip>{NAMESPACE_HINTS[row.namespace] ?? "مصدر هذا النص في الموقع."}</HelpTip>
                  <code dir="ltr" className="truncate text-xs text-muted-foreground">
                    {row.key}
                  </code>
                  <span className="ms-auto flex flex-wrap items-center gap-1.5">
                    {row.stale && <StaleBadge />}
                    {missingValue ? (
                      <Badge variant="outline" className="font-normal text-muted-foreground">
                        ناقصة
                      </Badge>
                    ) : (
                      <StatusBadge status={row.status} />
                    )}
                    <HelpTip>
                      {missingValue
                        ? "لا ترجمة لهذا المفتاح بعد — يرى الزائر النص العربي مكانه، وهو تدهور مقبول لا صفحة مكسورة."
                        : (STATUS_HINTS[row.status] ?? "حالة هذا الصف في خط الترجمة.")}
                      {row.provider ? ` مصدر المسودة: ${row.provider}.` : ""}
                    </HelpTip>
                  </span>
                </div>

                <form action={readOnly ? undefined : saveTranslation} className="grid gap-3 lg:grid-cols-2">
                  <input type="hidden" name="locale" value={locale} />
                  <input type="hidden" name="namespace" value={row.namespace} />
                  <input type="hidden" name="key" value={row.key} />
                  <input type="hidden" name="source_text" value={row.sourceText} />
                  {row.id && <input type="hidden" name="id" value={row.id} />}
                  <input type="hidden" name="return_ns" value={nsFilter ?? ""} />
                  <input type="hidden" name="return_status" value={filter} />

                  <div className="space-y-1.5">
                    <span className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
                      الأصل العربي
                      {row.stale && (
                        <span className="text-red-700 dark:text-red-300">
                          — تغيّر بعد آخر ترجمة
                        </span>
                      )}
                    </span>
                    <div
                      dir="rtl"
                      className="min-h-24 rounded-lg bg-muted/50 p-2.5 text-sm leading-relaxed whitespace-pre-wrap"
                    >
                      {row.sourceText}
                    </div>
                  </div>

                  <div className="space-y-1.5">
                    <Label htmlFor={fieldId} className="text-xs">
                      الترجمة ({title})
                    </Label>
                    <textarea
                      id={fieldId}
                      name="value"
                      dir={dir}
                      rows={4}
                      maxLength={5000}
                      defaultValue={row.value ?? ""}
                      disabled={readOnly}
                      placeholder={
                        missingValue ? "اكتب الترجمة هنا، أو ولّد مسودة آلية أولاً" : undefined
                      }
                      className={cn(controlClass, "min-h-24 resize-y leading-relaxed")}
                    />
                    <div className="flex flex-wrap items-center justify-end gap-2">
                      <Button
                        type="submit"
                        name="publish"
                        value="0"
                        size="sm"
                        variant="outline"
                        disabled={readOnly}
                      >
                        <Check />
                        اعتمد
                      </Button>
                      <Button
                        type="submit"
                        name="publish"
                        value="1"
                        size="sm"
                        disabled={readOnly}
                      >
                        <Send />
                        اعتمد وانشر
                      </Button>
                    </div>
                  </div>
                </form>
              </Card>
            );
          })}
        </div>
      )}

      <p className="text-xs leading-relaxed text-muted-foreground">
        بعد نشر أول دفعة: فعّل اللغة من مدير اللغات، ثم تحقق من وسوم hreflang وخريطة الموقع
        كما في <code dir="ltr">docs/LANGUAGES.md</code>.
      </p>
    </div>
  );
}
