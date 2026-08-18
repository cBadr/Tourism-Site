import Link from "next/link";
import { ArrowRight, Bot, Filter, MapPin, Search, Upload } from "lucide-react";

import { SaveButton } from "@/components/admin/save-feedback";
import { toArabicDigits } from "@/components/booking/format";
import { HelpTip } from "@/components/shared/HelpTip";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { SECTION_TYPE_LABELS } from "@/lib/content-types";
import { isMissingFunction, isMissingTable } from "@/lib/dispatch/settings";
import type { LocaleProgress } from "@/lib/i18n-types";
import { DEFAULT_LOCALE } from "@/lib/i18n-types";
import { describeMtProvider } from "@/lib/i18n/mt";
import { createServerSupabase } from "@/lib/supabase/server";
import { cn } from "@/lib/utils";
import { controlClass } from "../../orders/_components/booking-ui";
import { haystackOf, matchesTerms, queryTerms } from "../_components/arabic-search";
import {
  type AdminLocale,
  DEFAULT_QUEUE_FILTER,
  filterQueue,
  hasSupabaseEnv,
  hrefWith,
  isQueueFilter,
  LANGUAGE_ERRORS,
  LanguagesFeedback,
  LanguagesNotReady,
  namespaceLabel,
  NAMESPACES,
  needsWork,
  NO_PLACES,
  numberOf,
  numberText,
  PAGE_SIZE,
  pageNumber,
  pageWindow,
  type PlacedRow,
  type PlaceIndex,
  ProgressBar,
  type QueueFilter,
  QUEUE_FILTER_LABELS,
  QUEUE_FILTERS,
  type QueueRow,
  readLocales,
  readPlaces,
  readProgress,
  readQueue,
  sortByPlace,
} from "../_components/languages-ui";
import { TranslateButton } from "../_components/translate-button";
import { publishDrafts, publishReviewed } from "./actions";
import { PublishDraftsButton } from "./_components/publish-drafts-button";
import { QueueRowCard } from "./_components/queue-row";

/**
 * طابور مراجعة لغة واحدة — الشاشة التي يصير فيها النص الآلي نصاً منشوراً.
 *
 * ══════════════════════════════════════════════════════════════════════════
 *  شكوى المالك 2026-08-18، وما وجده القياس خلفها
 * ══════════════════════════════════════════════════════════════════════════
 *
 * قال: الصفحة كبيرة جداً، تحمل أكثر مما ينبغي، وثقيلة التحميل — **ولا بحث فيها
 * عن عبارة**. والمقيس:
 *
 *   • الفهرس **٨٩٧ صفاً · ٧٧ كيلوبايت** نصَّ مصدر، منها `section` وحدها
 *     **٨٠٨ صفوف (٩٠٪)**. والترشيح الافتراضي كان `all` — أي أن الشاشة تفتح على
 *     الأرشيف لا على العمل.
 *   • السقف كان **١٥٠ صفاً** مع جملة «أول ١٥٠ — عالِجها لتظهر البقية»: **حصارٌ
 *     لا ترقيم**، الوصول إلى الصف ٢٠٠ يمرّ بإصلاح ١٥٠ قبله.
 *   • كل صفٍّ **`<form>` كامل بسبعة حقول مخفية وحقل نص**، والأصل العربي
 *     **يُرسَل مرتين** فيه (ظاهراً ومخفياً)، وأطول أصلٍ ١٣٦٥ محرفاً.
 *
 * ── وما صار ────────────────────────────────────────────────────────────────
 *
 *  (١) **ترقيمٌ حقيقي**: ٢٥ صفاً في الصفحة، والتنقّل حرٌّ في الاتجاهين بلا شرط.
 *  (٢) **الحقل المخفي `source_text` سقط** — `review_translation` تقرأ الأصل
 *      الحيّ بنفسها، والصفُّ الناقص يقرؤه الخادم من `translation_corpus()`.
 *      (التفصيل في ترويسة `_components/queue-row.tsx`.)
 *  (٣) **الافتراضي «يحتاج عملاً»** لا «الكل».
 *  (٤) **بحثٌ يعمل بالعربية**: تطبيعٌ يجعل «الاسكندرية» تجد «الإسكندرية»
 *      و«انستاباي» تجد «انستا باي» (‏`_components/arabic-search.ts` وهجرة
 *      `0117`).
 *  (٥) **تجميعٌ بموضع النص في الموقع**: صفحة ← قسم، **من البيانات القائمة**
 *      (`sections.page_id`) لا بتصنيفٍ مخترع.
 *  (٦) **التعديل والنشر من الصف نفسه** — وهي قدرةٌ **كانت قائمة**:
 *      `review_translation(p_id, p_value, p_publish)` تأخذ علَم النشر. فلم
 *      يُبنَ مسارٌ ثانٍ، بل صار الزرُّ يقول ما يفعله.
 *
 * ── ما لم يتغيّر ───────────────────────────────────────────────────────────
 *
 * الأصل العربي معروض بجوار كل حقل عمداً: المراجعة بلا مصدر تخمين، والمترجم
 * الآلي يخطئ في المصطلح لا في القواعد غالباً — «رحلة» تصير trip حيناً و
 * journey حيناً، والقرار بينهما يحتاج رؤية الأصل.
 *
 * زر «اعتمد» يوقف الصف عند المراجَعة (لا يراه الزائر)، و«اعتمد وانشر» ينشره
 * فوراً. وزر «انشر كل المراجَع» ينشر ما اعتُمد دفعةً — وكلها تقع داخل دوال
 * Postgres لا هنا.
 *
 * و**«انشر كل المسودات»** (طلب المالك 2026-08-17) بجواره: يعتمد كل مسودةٍ
 * بشريةٍ مطابقةٍ لأصلها باسمه ثم ينشرها. وثلاثةٌ في تصميمه ليست زينة:
 *
 *  (١) **العدد مطبوعٌ قبل الضغط** ويأتي من `draft_publish_preview` — أي من
 *      **نفس مصنِّف** الدالة التي ستنفّذ، فلا يختلف الوعد عن الفعل.
 *  (٢) **الحصيلة تقول ما لم يحدث**: المستثنى آلياً وقديماً وفارغاً، كلٌّ برقمه.
 *  (٣) **الصفوف الآلية معروضةٌ بنصّها** في بطاقةٍ دائمة — قرار المالك كان
 *      «استثنِها وسجّل ملاحظة»، والملاحظة النافعة أن يراها فيقرّرها بيده.
 */

export const metadata = { title: "مراجعة الترجمة" };

/** صفٌّ آليٌّ يستثنيه زرّ المسودات — يُعرض بنصّه ليقرّره المالك بيده */
type MachineRow = { id: string; namespace: string; key: string; value: string };

/**
 * حصيلة `draft_publish_preview(locale)` — **ما سيفعله الزرّ لو ضُغط الآن**.
 *
 * ⚠ ولا يُحسب أيٌّ من هذه الأرقام هنا. `translation_progress().draft` قريبٌ منها
 * وليس هو: **يعدّ الآلية معها** (٨٧٦ مقابل ٨٧٠ مؤهَّلاً في `en` عند القياس)،
 * فطبعُه على الزرّ كان يَعِد بستّةٍ لا تُنشر. والرقم يأتي من مصنِّف الدالة نفسه.
 */
type DraftPlan = {
  ready: boolean;
  /** كل المسودات = eligible + الثلاثة المستثنَاة */
  drafts: number;
  /** ما سيُعتمد ويُنشر فعلاً */
  eligible: number;
  skippedMachine: number;
  skippedBlank: number;
  skippedStale: number;
  /** مراجَعٌ سلفاً — تنشره `publish_locale` مع دفعتنا */
  alreadyReviewed: number;
  /** مراجَعٌ سلفاً **وأصله تغيّر** — عيبٌ في زرّ «المراجَع» القائم، يُعلَن لا يُخفى */
  staleReviewed: number;
  machineRows: MachineRow[];
};

const NO_PLAN: DraftPlan = {
  ready: false,
  drafts: 0,
  eligible: 0,
  skippedMachine: 0,
  skippedBlank: 0,
  skippedStale: 0,
  alreadyReviewed: 0,
  staleReviewed: 0,
  machineRows: [],
};

function readMachineRows(value: unknown): MachineRow[] {
  if (!Array.isArray(value)) return [];
  const out: MachineRow[] = [];
  for (const entry of value) {
    if (entry === null || typeof entry !== "object") continue;
    const row = entry as Record<string, unknown>;
    const key = typeof row.key === "string" ? row.key : "";
    if (key === "") continue;
    out.push({
      id: typeof row.id === "string" ? row.id : key,
      namespace: typeof row.namespace === "string" ? row.namespace : "",
      key,
      value: typeof row.value === "string" ? row.value : "",
    });
  }
  return out;
}

/**
 * قراءةٌ محضة: `draft_publish_preview` معلَّمة `stable` **بلا DML** بقصد — فتصييرُ
 * الصفحة لا يستطيع أن ينشر شيئاً حتى لو أخطأ أحدٌ في استدعائها (الشرح في `0100`).
 */
async function readDraftPlan(
  supabase: NonNullable<Awaited<ReturnType<typeof createServerSupabase>>>,
  locale: string
): Promise<DraftPlan> {
  const result = await supabase.rpc("draft_publish_preview", { p_locale: locale });
  if (result.error || result.data === null || typeof result.data !== "object") return NO_PLAN;

  const data = result.data as Record<string, unknown>;
  const at = (name: string) => numberOf(data, [name]) ?? 0;
  return {
    ready: true,
    drafts: at("drafts"),
    eligible: at("eligible"),
    skippedMachine: at("skippedMachine"),
    skippedBlank: at("skippedBlank"),
    skippedStale: at("skippedStale"),
    alreadyReviewed: at("alreadyReviewed"),
    staleReviewed: at("staleReviewed"),
    machineRows: readMachineRows(data.machineRows),
  };
}

type Loaded = {
  locale: AdminLocale | null;
  localesReady: boolean;
  rows: QueueRow[];
  queueReady: boolean;
  /** قُرئ الفهرس الحي؟ بدونه لا تظهر المفاتيح الناقصة (وتظهر المكتوبة كاملة) */
  corpusReady: boolean;
  progress: LocaleProgress | null;
  plan: DraftPlan;
  /** «أين يظهر هذا النص» — من `pages` و`sections`، أو فارغٌ إن تعذّرت قراءتهما */
  places: PlaceIndex;
  missing: string | null;
};

const BLANK: Loaded = {
  locale: null,
  localesReady: false,
  rows: [],
  queueReady: false,
  corpusReady: false,
  progress: null,
  plan: NO_PLAN,
  places: NO_PLACES,
  missing: "قاعدة البيانات",
};

/** تسمية نوع القسم بالعربية — من قاموس شاشة المحتوى نفسه، لا قاموسٍ ثانٍ */
const sectionTypeLabel = (type: string): string =>
  SECTION_TYPE_LABELS[type as keyof typeof SECTION_TYPE_LABELS]?.label ?? type ?? "";

async function loadScreen(locale: string, filter: QueueFilter): Promise<Loaded> {
  const supabase = await createServerSupabase();
  if (!supabase) return BLANK;

  const [localesResult, queueResult, progressResult, plan, places] = await Promise.all([
    readLocales(supabase),
    readQueue(supabase, locale, filter),
    readProgress(supabase),
    readDraftPlan(supabase, locale),
    readPlaces(supabase, sectionTypeLabel),
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
    plan,
    places,
    missing,
  };
}

/** رقمٌ من الرابط — وما ليس رقماً صحيحاً يصير صفراً، فلا يظهر `NaN` في جملة */
function paramCount(params: Record<string, string | string[] | undefined>, name: string): number {
  const raw = params[name];
  return typeof raw === "string" && /^\d+$/.test(raw) ? Number(raw) : 0;
}

/**
 * جملة حصيلة «انشر كل المسودات» — **تُسمّي ما لم يحدث ولماذا**.
 *
 * وهذا شرطُ المالك لا تزويقٌ: زرٌّ جماعيٌّ يقول «تم» وقد تخطّى صفوفاً صامتاً
 * يترك في القاعدة نصاً يظنّه منشوراً وهو ليس كذلك. فكل مستثنًى يُذكر برقمه
 * وسببه، **والقديم أوّلها** لأنه الوحيد الذي يعني «ترجمةٌ لم تعد تطابق أصلها».
 */
function draftsSentence(params: Record<string, string | string[] | undefined>): string {
  const approved = paramCount(params, "ap");
  const published = paramCount(params, "pb");
  const machine = paramCount(params, "mt");
  const stale = paramCount(params, "st");
  const blank = paramCount(params, "bl");
  const staleReviewed = paramCount(params, "sr");

  const head =
    approved === 0
      ? "لم تُعتمد مسودةٌ واحدة"
      : `اعتُمدت ${toArabicDigits(approved)} مسودة باسمك ونُشرت`;
  const total =
    published > approved
      ? ` — المنشور في هذه الجولة ${toArabicDigits(published)} صفاً بحساب ما كان مراجَعاً سلفاً`
      : "";

  const skipped: string[] = [];
  if (stale > 0) {
    skipped.push(
      `${toArabicDigits(stale)} تغيّر أصلها العربي بعد ترجمتها فبقيت مسودةً — راجعها بترشيح «الأصل تغيّر»`
    );
  }
  if (machine > 0) {
    skipped.push(`${toArabicDigits(machine)} آلية استُثنيت بقرارك — قرّرها صفاً صفاً`);
  }
  if (blank > 0) skipped.push(`${toArabicDigits(blank)} بلا نص`);
  if (staleReviewed > 0) {
    skipped.push(
      `⚠ و${toArabicDigits(staleReviewed)} صفاً كان مراجَعاً سلفاً وأصله تغيّر — نشرته دالة «انشر كل المراجَع» معنا، فافحصه`
    );
  }

  return skipped.length === 0
    ? `${head}${total}. لا صفَّ استُثني.`
    : `${head}${total}. ولم يُنشر: ${skipped.join(" · ")}.`;
}

/** جملة النجاح المناسبة للعملية التي رجعت من الإجراء */
function savedSentence(params: Record<string, string | string[] | undefined>): string | null {
  if (params.saved === "bulkall" || params.saved === "bulkpart") {
    return draftsSentence(params);
  }
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

  const filter: QueueFilter = isQueueFilter(params.status) ? params.status : DEFAULT_QUEUE_FILTER;
  const nsFilter =
    typeof params.ns === "string" && (NAMESPACES as string[]).includes(params.ns)
      ? params.ns
      : null;
  const groupFilter = typeof params.g === "string" && params.g !== "" ? params.g : null;
  // سقفٌ للبحث: حقلٌ نصيٌّ يصل من الرابط، ولا معنى لعبارةٍ أطول من سطر
  const query = typeof params.q === "string" ? params.q.trim().slice(0, 120) : "";

  const loaded = await loadScreen(locale, filter);
  const { localesReady, rows, queueReady, corpusReady, progress, plan, places, missing } = loaded;

  const wired = hasSupabaseEnv();
  const readOnly = !wired || !queueReady;
  const error = typeof params.error === "string" ? params.error : null;
  const saved = savedSentence(params);
  const provider = describeMtProvider();

  const path = `/admin/languages/${locale}`;
  const localeRow = loaded.locale;
  const title = localeRow?.name ?? locale;
  const dir = localeRow?.dir ?? "ltr";

  /*
   * نافذة التأكيد — تُبنى على الخادم لأن العميل لا يملك الأرقام ولا حالة اللغة.
   *
   * ⚠ **وسطر «اللغة ظاهرة للزوار» ليس حشواً**: النشر يصل القارئ **فوراً** إن كانت
   * اللغة مفعَّلة، **ولا يصله أحدٌ** إن كانت مخفية (`enabled_locales()` ترشِّح
   * بـ`enabled` وحده — والنشر لا يُظهر لغة). فالفرق بين الحالتين هو كل الفرق بين
   * «نصٌّ صار عاماً» و«نصٌّ جُهِّز في الدرج»، ولا يصحّ أن يضغط وهو لا يعرف أيهما.
   */
  const skippedParts = [
    plan.skippedStale > 0 ? `${toArabicDigits(plan.skippedStale)} تغيّر أصلها` : null,
    plan.skippedMachine > 0 ? `${toArabicDigits(plan.skippedMachine)} آلية` : null,
    plan.skippedBlank > 0 ? `${toArabicDigits(plan.skippedBlank)} بلا نص` : null,
  ].filter((part): part is string => part !== null);

  const confirmText = [
    `اعتماد ${toArabicDigits(plan.eligible)} مسودة باسمك ونشرها في «${title}».`,
    skippedParts.length > 0 ? `يُستثنى: ${skippedParts.join(" · ")}.` : "لا صفَّ يُستثنى.",
    localeRow?.enabled
      ? "واللغة ظاهرة للزوار الآن ⇒ يقرؤه الزائر فور النشر."
      : "واللغة مخفية عن الزوار ⇒ لن يراه أحدٌ حتى تفعّلها من مدير اللغات.",
    "متابعة؟",
  ].join("\n");

  const draftsDisabled = readOnly || !plan.ready || plan.eligible === 0;

  /*
   * عدد المراجَع على زرّه: من المعاينة إن قُرئت، ومن `translation_progress` إن لم
   * تُقرأ. **والفرق مقصود لا احتياط**: المعاينة تستثني المراجَع **الفارغ** —
   * و`publish_locale` لا تنشره أصلاً (شرط `btrim(value) <> ''`) — فرقمها هو ما
   * سيُنشر فعلاً. والسقوط إلى `progress` يمنع أن يتعطّل زرٌّ قائم على قاعدةٍ لم
   * تُطبَّق عليها هجرة `0100` بعد.
   */
  const reviewedCount = plan.ready ? plan.alreadyReviewed : (progress?.reviewed ?? 0);

  /*
   * ── خطُّ الترشيح، بالترتيب الذي يجعل كل خطوةٍ أرخص من التي قبلها ────────────
   *
   * الحالة ← المساحة ← البحث ← الموضع. والبحث قبل الموضع عمداً: قائمةُ المواضع
   * المعروضة في القائمة المنسدلة تُبنى من **نتيجة البحث**، فيرى المالك أين وقعت
   * كلمته في الموقع بعدد صفوفها — لا قائمةً ثابتةً أكثرها أصفار.
   *
   * ⚠ والمطابقة تقع على **مفتاح بحثٍ مطبَّع** (`arabic-search.ts`) لا على النص
   *   الخام: بلا ذلك «الاسكندرية» لا تجد «الإسكندرية» وتُقرأ النتيجة الفارغة
   *   على أنها «غير موجود».
   */
  const terms = queryTerms(query);
  const matched = filterQueue(rows, filter)
    .filter((row) => nsFilter === null || row.namespace === nsFilter)
    .filter(
      (row) =>
        terms.length === 0 ||
        matchesTerms(haystackOf(row.sourceText, row.value, row.key), terms)
    );

  // مواضع النتيجة الحالية بعددها — لقائمة «أين يظهر»
  const groupCounts = new Map<string, number>();
  for (const row of matched) {
    const id = places.placeOf(row).groupId;
    groupCounts.set(id, (groupCounts.get(id) ?? 0) + 1);
  }
  const groupOptions = places.groups.filter(
    (group) => (groupCounts.get(group.id) ?? 0) > 0 || group.id === groupFilter
  );

  const placed: PlacedRow[] = sortByPlace(
    groupFilter === null
      ? matched
      : matched.filter((row) => places.placeOf(row).groupId === groupFilter),
    places
  );

  const pageCount = Math.max(1, Math.ceil(placed.length / PAGE_SIZE));
  const page = pageNumber(params.p, pageCount);
  const from = (page - 1) * PAGE_SIZE;
  const shown = placed.slice(from, from + PAGE_SIZE);
  const workLeft = placed.filter((entry) => needsWork(entry.row)).length;

  /*
   * حالة الشاشة مضغوطةً في سلسلةٍ واحدة: تُوضع في حقلٍ مخفيٍّ واحد بكل صفٍّ
   * وبكل زرٍّ جماعي، فيعود المراجع بعد الحفظ إلى **نفس الموضع والترشيح والبحث
   * والصفحة**. (كانت حقلين مخفيين في كل صف، وكانت ستصير خمسة.)
   */
  const backState = new URLSearchParams();
  if (groupFilter !== null) backState.set("g", groupFilter);
  if (nsFilter !== null) backState.set("ns", nsFilter);
  backState.set("status", filter);
  if (query !== "") backState.set("q", query);
  if (page > 1) backState.set("p", String(page));
  const back = backState.toString();

  /** رابطٌ يبقي كل شيء كما هو ويغيّر الصفحة وحدها */
  const pageHref = (target: number) =>
    hrefWith(path, {
      g: groupFilter ?? undefined,
      ns: nsFilter ?? undefined,
      status: filter,
      q: query === "" ? undefined : query,
      p: target === 1 ? undefined : String(target),
    });

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
          {/*
            🔴 **النصّ يتبع الإعداد الحيّ لا الافتراض** (اتفاقيات §٥: «النص يصف ما
            يحدث فعلاً»). كان مكتوباً «يكتب ناتجها مسودات لا أكثر» على كل حال —
            **وهو كذبٌ حين يكون «النشر التلقائي» مفعَّلاً**: `upsert_translations`
            هي من تقرّر الحالة من `locales.auto_publish` (والمسار في
            `app/api/i18n/translate/route.ts:326` يقرؤه ليخبر لا ليقرّر)، فتُكتب
            المخرجات الآلية **`published`** فوراً. وقِيس على القاعدة الحيّة أن
            `en.auto_publish = true` — فالنصّ القديم كان يَعِد بحاجزٍ غير قائم.
          */}
          <HelpTip>
            يرسل دفعة من المفاتيح الناقصة والقديمة إلى {provider.label} ويكتب ناتجها{" "}
            {localeRow?.autoPublish ? (
              <>
                <span className="font-semibold">منشوراً مباشرة</span> لأن «النشر التلقائي»
                مفعَّل لهذه اللغة — أي يقرؤه الزائر بلا أن يمرّ على بشر. أطفئه من مدير اللغات
                إن أردته مسودات تُراجَع أولاً.
              </>
            ) : (
              <>
                <span className="font-semibold">مسودات</span> لا أكثر.
              </>
            )}{" "}
            السقف {toArabicDigits(provider.maxTexts)} نصاً في الضغطة الواحدة حتى لا تحرق ضغطة
            واحدة الحصة اليومية — كرّر الضغط حتى يفرغ الطابور. {provider.note}
          </HelpTip>

          <form action={publishReviewed} className="flex items-center gap-2">
            <input type="hidden" name="locale" value={locale} />
            <input type="hidden" name="back" value={back} />
            <SaveButton
              label={`انشر كل المراجَع${
                reviewedCount > 0 ? ` (${numberText(reviewedCount)})` : ""
              }`}
              icon={<Upload />}
              savedLabel="تم النشر"
              pendingLabel="جارٍ النشر…"
              failedLabel="لم يُنشر"
              size="sm"
              variant="outline"
              disabled={readOnly || reviewedCount === 0}
              errorMessages={LANGUAGE_ERRORS}
            />
          </form>
          <HelpTip>
            ينقل كل صف حالته «مراجَعة» إلى «منشورة» دفعةً واحدة عبر دالة{" "}
            <code dir="ltr">publish_locale</code>. المسودات التي لم يعتمدها بشر لا تتأثر
            إطلاقاً — وهذا هو الفرق بينه وبين النشر التلقائي.
          </HelpTip>

          <form action={publishDrafts} className="flex items-center gap-2">
            <input type="hidden" name="locale" value={locale} />
            <input type="hidden" name="back" value={back} />
            <PublishDraftsButton
              label={`انشر كل المسودات${
                plan.eligible > 0 ? ` (${numberText(plan.eligible)})` : ""
              }`}
              confirmText={confirmText}
              disabled={draftsDisabled}
              savedMessages={{
                bulkall: "تم النشر — ولا صفَّ استُثني.",
                bulkpart: "تم النشر، وبعض الصفوف استُثنيت — التفصيل في الشريط أعلى الصفحة.",
              }}
              errorMessages={LANGUAGE_ERRORS}
            />
          </form>
          <HelpTip>
            يعتمد كل مسودة <span className="font-semibold">باسمك</span> ثم ينشرها بنفس دالة{" "}
            <code dir="ltr">publish_locale</code> — فلا يُكتب في الجدول نصٌّ لم يمرّ
            بالاعتماد. ويستثني ثلاثة: ما{" "}
            <span className="font-semibold">تغيّر أصله العربي</span> بعد ترجمته (ترجمةٌ لم
            تعد تطابق أصلها فتبقى مسودةً)، والنصوص الآلية بقرارك، والفارغ. والعدد على الزرّ
            هو ما سيُنشر فعلاً لا عدد المسودات كلها
            {plan.ready && plan.drafts !== plan.eligible
              ? ` (${numberText(plan.drafts)} مسودة، منها ${numberText(plan.eligible)} مؤهَّلة)`
              : ""}
            .
          </HelpTip>
        </div>

        {/*
          الصفوف الآلية — بطاقةٌ **دائمة** لا رسالةُ ما بعد الضغط.

          قرار المالك 2026-08-17: «استثنِها حالياً وسجّل ملاحظة». والاستثناء وحده
          يجعلها تختفي من نظره إلى الأبد؛ فالملاحظة هي أن يراها بنصّها ويقرّر كلَّ
          صفٍّ بيده. وفي `en` عند القياس ستّةٌ كلها روابط (`href`) — أي أن دورة
          الترجمة الآلية أرسلت **عناوين مسارات** إلى مترجم، فعاد أحدها ناقص حرف.
        */}
        {plan.machineRows.length > 0 && (
          <details className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm dark:border-amber-700 dark:bg-amber-950">
            <summary className="flex cursor-pointer items-center gap-2 font-medium text-amber-900 dark:text-amber-100">
              <Bot className="size-4 shrink-0" />
              {numberText(plan.machineRows.length)} مسودة آلية لا يشملها الزرّ — قرّرها بيدك
            </summary>
            <p className="mt-2 leading-relaxed text-amber-900 dark:text-amber-100">
              هذه من مزوّد ترجمة آلي، وقرارك أن تُستثنى حتى تقرأها. راجع كلاً منها من صفّها
              في الطابور أدناه (اضغط «اعتمد» أو «اعتمد وانشر» بعد تصحيحها) — أو اتركها
              فتبقى مخفيةً عن الزائر.
            </p>
            <ul className="mt-2 space-y-1">
              {plan.machineRows.map((row) => (
                <li key={row.id} className="flex flex-wrap items-baseline gap-2">
                  <code dir="ltr" className="text-xs text-muted-foreground">
                    {row.key}
                  </code>
                  <span dir="ltr" className="font-medium">
                    {row.value}
                  </span>
                </li>
              ))}
            </ul>
          </details>
        )}
      </Card>

      {/* الترشيح والبحث — نموذج GET حتى يبقى الرابط قابلاً للحفظ والمشاركة */}
      <form action={path} method="get">
        <Card className="gap-3 p-4">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="flex items-center gap-1.5 text-sm font-medium">
              <Filter className="size-4 text-primary" />
              اعثر على العبارة
              <HelpTip>
                ابدأ بـ «الأصل تغيّر»: ترجمات منشورة لم تعد تطابق النص العربي، أي معلومة
                خاطئة يقرؤها الزائر الآن. ثم «ناقصة»، ثم «مسودات». وأي تغيير هنا يعيدك إلى
                الصفحة الأولى من النتيجة.
              </HelpTip>
            </span>
          </div>

          <div className="flex flex-wrap items-end gap-3">
            <div className="min-w-56 flex-1 space-y-1.5">
              <Label htmlFor="q" className="flex items-center gap-1.5 text-xs">
                <Search className="size-3.5 text-primary" />
                بحث في العبارات
                <HelpTip>
                  يبحث في النص العربي وفي ترجمته وفي مفتاحه معاً. والبحث يتجاهل الهمزات
                  والتشكيل والتطويل: «الاسكندرية» تجد «الإسكندرية»، و«انستاباي» تجد «انستا
                  باي»، و«القاهرة» تجد «بالقاهرة». وكلمتان معاً تضيّقان النتيجة لا توسّعانها.
                </HelpTip>
              </Label>
              <input
                id="q"
                name="q"
                type="search"
                defaultValue={query}
                disabled={!wired}
                placeholder="اكتب كلمةً من النص العربي أو من ترجمته"
                className={cn(controlClass, "w-full")}
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="g" className="flex items-center gap-1.5 text-xs">
                <MapPin className="size-3.5 text-primary" />
                أين يظهر
                <HelpTip>
                  موضع النص في الموقع: صفحته ثم القسم داخلها — مقروءاً من ربط الأقسام
                  بصفحاتها في قاعدة البيانات لا من تصنيف يدوي. راجع صفحةً كاملة في جلسة
                  واحدة ليبقى المصطلح متسقاً فيها. والعدد بجوار كل موضع هو ما يطابق ترشيحك
                  الحالي.
                </HelpTip>
              </Label>
              <select
                id="g"
                name="g"
                defaultValue={groupFilter ?? ""}
                disabled={!wired || !places.ready}
                className={cn(controlClass, "w-52")}
              >
                <option value="">كل المواضع</option>
                {groupOptions.map((group) => (
                  <option key={group.id} value={group.id}>
                    {group.label} ({toArabicDigits(groupCounts.get(group.id) ?? 0)})
                  </option>
                ))}
              </select>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="status" className="flex items-center gap-1.5 text-xs">
                الحالة
                <HelpTip>
                  يحتاج عملاً = ما تغيّر أصله أو ينقص أو لم يقرأه بشر — وهو الافتراضي ·
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

            <div className="space-y-1.5">
              <Label htmlFor="ns" className="flex items-center gap-1.5 text-xs">
                المساحة
                <HelpTip>
                  المساحة تقول نوع النص لا موضعه: واجهة ثابتة، أو عنوان صفحة وميتاداتاها، أو
                  محتوى قسم، أو الهوية، أو خدمة، أو فئة سيارة. استعملها حين تريد مراجعة
                  عناوين السيو وحدها مثلاً.
                </HelpTip>
              </Label>
              <select
                id="ns"
                name="ns"
                defaultValue={nsFilter ?? "all"}
                disabled={!wired}
                className={cn(controlClass, "w-36")}
              >
                <option value="all">كل المساحات</option>
                {NAMESPACES.map((ns) => (
                  <option key={ns} value={ns}>
                    {namespaceLabel(ns)}
                  </option>
                ))}
              </select>
            </div>

            <Button type="submit" size="sm" disabled={!wired}>
              تطبيق
            </Button>
          </div>

          <p className="text-xs leading-relaxed text-muted-foreground">
            {placed.length === 0
              ? "لا صفَّ مطابق."
              : `المعروض ${toArabicDigits(from + 1)}–${toArabicDigits(from + shown.length)} من ${toArabicDigits(placed.length)} · صفحة ${toArabicDigits(page)} من ${toArabicDigits(pageCount)}`}
            {placed.length > 0 && workLeft > 0
              ? ` · منها ${toArabicDigits(workLeft)} تحتاج عملاً`
              : ""}
            . الترتيب: الصفحة كما تظهر في الموقع، ثم الأقسام بترتيبها، والأعجل داخل كل قسم.
            {query !== "" && terms.length > 0
              ? ` البحث عن «${query}» — امسح الحقل لتعود القائمة كاملة.`
              : ""}
            {/* ترقيمٌ أو رموزٌ وحدها لا تُنتج كلمةً — يُقال ذلك بدل نتيجةٍ تبدو كاملة */}
            {query !== "" && terms.length === 0
              ? ` «${query}» لا كلمةَ فيه للبحث (رموزٌ أو ترقيمٌ وحده) — فالقائمة كاملة كما هي.`
              : ""}
            {!places.ready
              ? " تعذّرت قراءة صفحات الموقع وأقسامه، فالتجميع بالموضع معطَّل الآن والترشيح الباقي يعمل."
              : ""}
            {!corpusReady && (filter === "all" || filter === "missing" || filter === "todo")
              ? " تعذّرت قراءة الفهرس الحي، فالمفاتيح التي لم تُترجَم قط لا تظهر الآن — تظهر المكتوبة وحدها."
              : ""}
          </p>
        </Card>
      </form>

      {/*
        الصفوف — مُجمَّعةً بموضعها، وعنوانُ المجموعة يُعاد في أول كل صفحة.

        ⚠ **وسطر «اللغة ظاهرة للزوّار» فوق القائمة ليس حشواً**: كل زرِّ «اعتمد
        وانشر» في صفٍّ أدناه يجعل ذلك النص مقروءاً على `/{locale}` **فوراً** إن
        كانت اللغة مفعَّلة. والإنجليزية مفعَّلةٌ اليوم بـ٨٧١ صفاً منشوراً.
      */}
      {!queueReady ? (
        <Card className="p-5 text-sm text-muted-foreground">
          تعذّرت قراءة الطابور — تأكد أن دالة <code dir="ltr">translation_queue</code> منفَّذة
          في قاعدة البيانات (هجرة المرحلة ٨) وأن حسابك دوره <code dir="ltr">admin</code>.
        </Card>
      ) : shown.length === 0 ? (
        <Card className="p-5 text-sm leading-relaxed text-muted-foreground">
          {query !== ""
            ? `لا عبارة تطابق «${query}» في هذا الترشيح. جرّب كلمةً واحدة، أو وسّع الحالة إلى «الكل».`
            : "لا صفوف مطابقة لهذا الترشيح. إن كان الطابور فارغاً تماماً فاضغط «حدّث قائمة العمل» في مدير اللغات ليُبنى من محتوى الموقع الحالي."}
        </Card>
      ) : (
        <div className="space-y-3">
          <p
            className={cn(
              "rounded-lg border px-3 py-2 text-xs leading-relaxed",
              localeRow?.enabled
                ? "border-amber-300 bg-amber-50 text-amber-900 dark:border-amber-700 dark:bg-amber-950 dark:text-amber-100"
                : "border-border text-muted-foreground"
            )}
          >
            {localeRow?.enabled ? (
              <>
                <span className="font-semibold">هذه اللغة ظاهرة للزوّار الآن.</span> كل ضغطة
                على «اعتمد وانشر للزوّار» في صفٍّ أدناه تجعل نصَّه مقروءاً على{" "}
                <code dir="ltr">/{locale}</code> فوراً — بلا مراجعةٍ بعدها. و«اعتمد بلا نشر»
                يحفظه للمراجعة ولا يراه أحد.
              </>
            ) : (
              <>
                هذه اللغة <span className="font-semibold">مخفية عن الزوّار</span> — فالنشر من
                أي صفٍّ يجهّز النص ولا يراه أحد حتى تفعّلها من مدير اللغات.
              </>
            )}
          </p>

          {shown.map((entry, index) => {
            const previous = index === 0 ? null : shown[index - 1];
            // عنوانٌ عند تغيّر المجموعة، **وفي أول كل صفحة** — فمن فتح الصفحة
            // الخامسة يعرف أين هو. ولا عنوان حين يتعذّر معرفة الموضع أصلاً.
            const newGroup =
              entry.place.group !== "" &&
              (previous === null || previous.place.groupId !== entry.place.groupId);

            return (
              <div key={`${entry.row.namespace}:${entry.row.key}`} className="space-y-3">
                {newGroup && (
                  <h3 className="flex flex-wrap items-baseline gap-2 pt-2 font-heading text-sm font-bold">
                    <MapPin className="size-4 shrink-0 text-primary" />
                    {entry.place.group}
                    <span className="text-xs font-normal text-muted-foreground">
                      {toArabicDigits(groupCounts.get(entry.place.groupId) ?? 0)} عبارة في هذا
                      الترشيح
                    </span>
                  </h3>
                )}
                <QueueRowCard
                  row={entry.row}
                  locale={locale}
                  localeName={title}
                  dir={dir}
                  spot={entry.place.spot}
                  back={back}
                  readOnly={readOnly}
                  localeEnabled={localeRow?.enabled ?? false}
                />
              </div>
            );
          })}

          {/*
            التنقّل — روابط `<a>` لا أزرار: تُفتح في تبويبٍ جديد، وتُحفظ، وتعمل
            بلا جافاسكربت. وكلٌّ منها يحمل الترشيح والبحث والموضع كما هي.
          */}
          {pageCount > 1 && (
            <nav
              aria-label="صفحات الطابور"
              className="flex flex-wrap items-center justify-center gap-1.5 pt-2"
            >
              {page > 1 && (
                <Link
                  href={pageHref(page - 1)}
                  className="rounded-lg border border-border px-3 py-1.5 text-sm hover:border-primary hover:text-primary"
                >
                  السابقة
                </Link>
              )}
              {pageWindow(page, pageCount).map((target, index) =>
                target === null ? (
                  <span key={`gap-${index}`} className="px-1 text-sm text-muted-foreground">
                    …
                  </span>
                ) : target === page ? (
                  <span
                    key={target}
                    aria-current="page"
                    className="rounded-lg border border-primary bg-primary px-3 py-1.5 text-sm font-bold text-primary-foreground"
                  >
                    {toArabicDigits(target)}
                  </span>
                ) : (
                  <Link
                    key={target}
                    href={pageHref(target)}
                    className="rounded-lg border border-border px-3 py-1.5 text-sm hover:border-primary hover:text-primary"
                  >
                    {toArabicDigits(target)}
                  </Link>
                )
              )}
              {page < pageCount && (
                <Link
                  href={pageHref(page + 1)}
                  className="rounded-lg border border-border px-3 py-1.5 text-sm hover:border-primary hover:text-primary"
                >
                  التالية
                </Link>
              )}
            </nav>
          )}
        </div>
      )}

      <p className="text-xs leading-relaxed text-muted-foreground">
        بعد نشر أول دفعة: فعّل اللغة من مدير اللغات، ثم تحقق من وسوم hreflang وخريطة الموقع
        كما في <code dir="ltr">docs/LANGUAGES.md</code>.
      </p>
    </div>
  );
}
