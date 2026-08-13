import type { SupabaseClient } from "@supabase/supabase-js";

import { isMissingFunction, isMissingTable } from "@/lib/dispatch/settings";
import { DEFAULT_LOCALE, type TranslateBatchResult } from "@/lib/i18n-types";
import { describeMtProvider, MT_MAX_TEXTS, resolveMtProvider } from "@/lib/i18n/mt";
import { SERVICES, VEHICLE_CLASSES } from "@/lib/site-config";
import { createServerSupabase } from "@/lib/supabase/server";

/**
 * ‏POST /api/i18n/translate — توليد مسودات الترجمة الآلية لدفعة من الطابور.
 *
 * الحماية **جلسة مدير حقيقية** لا مفتاح مشترك: هذا المسار يكتب في محتوى
 * الموقع، وسرٌّ في متغير بيئة يُسرَّب مرة واحدة يكفي لإغراق كل اللغات بنصوص
 * آلية. لذلك: `getUser()` ثم `is_admin()` في قاعدة البيانات — نفس الحارس الذي
 * يحمي شاشات `/admin` (المرحلة ٥). RLS تمنع الكتابة على أي حال، لكن الرفض هنا
 * أوضح للمالك من خطأ صلاحيات غامض قادم من Postgres.
 *
 * ثلاثة قيود تحكم السلوك:
 *  (١) **مسودة فقط.** كل صف يُكتب بحالة `draft` مع اسم المزوّد، ولا شيء هنا
 *      ينشر — النشر قرار بشري في شاشة المراجعة (القرار الثالث في العقد).
 *  (٢) **ميزانية زمن.** الرد لا يتجاوز ~٢٥ ثانية مهما كبر الطابور: نترجم شريحة
 *      حتى نفاد الميزانية ثم نُرجع ما تم ونقول كم بقي. البديل — طلب يعمل
 *      دقيقتين — يقتله أي بروكسي (ومنه Vercel) فيضيع ما تُرجم أصلاً.
 *  (٣) **سقف صلب لكل ضغطة** (`MT_MAX_TEXTS`) حتى لا تحرق ضغطة واحدة الحصة
 *      اليومية للمزوّد المجاني.
 *
 * الترتيب داخل الطابور مقصود: **القديمة (stale) أولاً** ثم الناقصة. الناقصة
 * يراها الزائر بالعربية (تدهور رشيق مقبول)، أما القديمة فيرى مكانها ترجمة
 * منشورة لم تعد تطابق الأصل — أي معلومة خاطئة، وهي أسوأ من غياب الترجمة.
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const NO_STORE = { "Cache-Control": "no-store" } as const;

/**
 * ميزانية بدء شرائح جديدة. السقف المُعلَن ~٢٥ ثانية، والميزانية أقل منه بفارق
 * كبير عمداً: فحص الساعة يقع **بين** الشرائح لا داخلها، فالشريحة التي تبدأ عند
 * الحد قد تضيف بضع ثوانٍ قبل أن تنتهي. المزوّد المجاني يرسل نصاً واحداً لكل
 * طلب بفاصل مؤدب بينها، فشريحة من خمسة نصوص تكلّف ثوانٍ لا أجزاء ثانية.
 */
const BUDGET_MS = 14_000;

/** عدد النصوص في نداء واحد للمزوّد — شرائح صغيرة تسمح بفحص الساعة بينها */
const SLICE = 5;

// ---------------------------------------------------------------------------
// قراءة متسامحة لصفوف الطابور (الجداول والدوال يملكها وكيل SQL)
// ---------------------------------------------------------------------------

type QueueRow = {
  id: string | null;
  namespace: string;
  key: string;
  /** **الأصل الحي**: النص العربي كما هو الآن — وهو ما يُرسَل للمزوّد */
  sourceText: string;
  value: string | null;
  status: string;
  stale: boolean;
};

const rowsOf = (data: unknown): Record<string, unknown>[] =>
  Array.isArray(data) ? (data as Record<string, unknown>[]) : [];

function textOf(row: Record<string, unknown>, names: string[]): string | null {
  for (const name of names) {
    const value = row[name];
    if (typeof value === "string" && value !== "") return value;
    if (typeof value === "number") return String(value);
  }
  return null;
}

function boolOf(row: Record<string, unknown>, names: string[]): boolean {
  for (const name of names) {
    const value = row[name];
    if (typeof value === "boolean") return value;
    if (typeof value === "string") {
      const s = value.trim().toLowerCase();
      if (s === "true" || s === "t") return true;
      if (s === "false" || s === "f") return false;
    }
  }
  return false;
}

function readQueueRow(row: Record<string, unknown>): QueueRow {
  return {
    id: textOf(row, ["id", "translation_id", "translationId"]),
    namespace: textOf(row, ["namespace", "ns"]) ?? "ui",
    key: textOf(row, ["key", "translation_key", "translationKey"]) ?? "",
    sourceText: textOf(row, ["source_text", "sourceText", "source"]) ?? "",
    value: textOf(row, ["value", "translation", "target_text"]),
    status: textOf(row, ["status"]) ?? "draft",
    stale: boolOf(row, ["stale", "is_stale", "isStale", "outdated"]),
  };
}

/**
 * نداء `translation_queue` بتسامح في التوقيع: نجرّب بالحالة ثم بدونها.
 * سبب التسامح أن التوقيع يملكه وكيل SQL، و«الدالة غير موجودة» (PGRST202) يشمل
 * عند PostgREST «لا دالة بهذه المعاملات» — فالمحاولة الثانية ليست عبثاً.
 */
async function readQueue(
  supabase: SupabaseClient,
  locale: string
): Promise<{ rows: QueueRow[]; error: { code?: string; message?: string } | null }> {
  const attempts: Record<string, unknown>[] = [
    { p_locale: locale, p_status: null },
    { p_locale: locale },
  ];

  let lastError: { code?: string; message?: string } | null = null;

  for (const args of attempts) {
    const result = await supabase.rpc("translation_queue", args);
    if (!result.error) return { rows: rowsOf(result.data).map(readQueueRow), error: null };
    lastError = result.error;
    if (!isMissingFunction(result.error.code)) break;
  }

  return { rows: [], error: lastError };
}

/**
 * الفهرس الحي — كل نص عربي قابل للترجمة الآن.
 *
 * ضروري هنا لا تحسيني: `translation_queue` لا تعرف إلا الصفوف **المكتوبة**،
 * والمفتاح الذي لم يُترجَم قط لا صف له أصلاً. بلا هذه القراءة لن يترجم الزر
 * شيئاً على لغة جديدة — لأن طابورها فارغ حرفياً.
 */
async function readCorpus(
  supabase: SupabaseClient
): Promise<{ rows: QueueRow[]; error: { code?: string } | null }> {
  const result = await supabase.rpc("translation_corpus");
  if (result.error) return { rows: [], error: result.error };

  const rows = rowsOf(result.data)
    .map((row) => ({
      id: null,
      namespace: textOf(row, ["namespace", "ns"]) ?? "",
      key: textOf(row, ["key", "k"]) ?? "",
      sourceText: textOf(row, ["source_text", "sourceText", "src"]) ?? "",
      value: null,
      status: "draft",
      stale: false,
    }))
    .filter((row) => row.namespace !== "" && row.key !== "" && row.sourceText.trim() !== "");

  return { rows: [...rows, ...repoCorpusRows()], error: null };
}

/**
 * نصوص يملكها المستودع لا قاعدة البيانات، فلا تراها `translation_corpus()`:
 * وصف بطاقة كل خدمة (`SERVICES[].short`) وسطر سعة كل فئة (`VEHICLE_CLASSES[].seats`).
 * بدون ضمّها هنا كانت هذه المفاتيح **غير قابلة للترجمة إطلاقاً**: لا تظهر في
 * الطابور ولا تصل المترجم، فتبقى عربية على الصفحة الإنجليزية إلى الأبد.
 * شكل الصف مطابق تماماً لصفوف القاعدة، فلا مسار خاص لها في بقية المسار.
 */
function repoCorpusRows(): QueueRow[] {
  const rows: QueueRow[] = [];
  const push = (namespace: string, key: string, sourceText: string) => {
    if (sourceText.trim() === "") return;
    rows.push({ id: null, namespace, key, sourceText, value: null, status: "draft", stale: false });
  };

  for (const service of SERVICES) push("service", `${service.slug}.short`, service.short);
  for (const vehicle of VEHICLE_CLASSES) {
    push("vehicle", `${vehicle.slug}.seats`, vehicle.seats);
    push("vehicle", `${vehicle.slug}.short`, vehicle.short);
  }

  return rows;
}

// ---------------------------------------------------------------------------
// حارس المدير
// ---------------------------------------------------------------------------

type Denial = { status: number; message: string };

async function adminDenial(supabase: SupabaseClient): Promise<Denial | null> {
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { status: 401, message: "هذا المسار للمديرين — سجّل الدخول من /admin ثم أعد المحاولة." };
  }

  const { data, error } = await supabase.rpc("is_admin");
  if (!error) {
    return data === true
      ? null
      : { status: 403, message: "حسابك ليس مديراً — الترجمة الآلية تكتب في محتوى الموقع." };
  }

  // الدالة غير موجودة (قاعدة قديمة) ⇒ نسقط إلى قراءة الدور مباشرة
  const profile = await supabase.from("profiles").select("role").eq("id", user.id).maybeSingle();
  if (profile.error || profile.data?.role !== "admin") {
    return { status: 403, message: "تعذّر التحقق من صلاحيتك كمدير — سجّل الدخول بحساب دوره admin." };
  }
  return null;
}

// ---------------------------------------------------------------------------
// المسار
// ---------------------------------------------------------------------------

/** نفس قيد `locales.code` في هجرة ٠٠١٨ حرفياً */
const LOCALE_PATTERN = /^[a-z]{2}(-[a-z]{2})?$/i;

async function readBody(request: Request): Promise<Record<string, unknown>> {
  try {
    const body = (await request.json()) as unknown;
    return body && typeof body === "object" && !Array.isArray(body)
      ? (body as Record<string, unknown>)
      : {};
  } catch {
    return {};
  }
}

function normalizeLimit(value: unknown): number {
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(n) || n <= 0) return MT_MAX_TEXTS;
  return Math.min(Math.floor(n), MT_MAX_TEXTS);
}

export async function POST(request: Request): Promise<Response> {
  const body = await readBody(request);
  const rawLocale = typeof body.locale === "string" ? body.locale.trim().toLowerCase() : "";
  const locale = LOCALE_PATTERN.test(rawLocale) ? rawLocale : "";
  const limit = normalizeLimit(body.limit);

  const info = describeMtProvider();
  const reply = (
    status: number,
    result: Partial<TranslateBatchResult> & Pick<TranslateBatchResult, "ok">
  ): Response =>
    Response.json(
      {
        locale,
        requested: 0,
        translated: 0,
        skipped: 0,
        failed: 0,
        provider: info.id,
        ...result,
      } satisfies TranslateBatchResult,
      { status, headers: NO_STORE }
    );

  if (locale === "") {
    return reply(400, { ok: false, message: "كود اللغة غير صالح — مثال: en أو fr." });
  }
  if (locale === DEFAULT_LOCALE) {
    return reply(400, {
      ok: false,
      message: "العربية هي لغة الأصل ولا تُترجَم — اختر لغة هدف أخرى.",
    });
  }

  const supabase = await createServerSupabase();
  if (!supabase) {
    return reply(503, {
      ok: false,
      message: "قاعدة البيانات غير مربوطة — اضبط متغيرات Supabase ثم أعد المحاولة.",
    });
  }

  const denial = await adminDenial(supabase);
  if (denial) return reply(denial.status, { ok: false, message: denial.message });

  if (!info.ready) {
    return reply(503, { ok: false, message: info.note });
  }

  // ── الطابور ───────────────────────────────────────────────────────────────
  const queue = await readQueue(supabase, locale);
  if (queue.error) {
    const missing = isMissingFunction(queue.error.code) || isMissingTable(queue.error.code);
    return reply(missing ? 503 : 500, {
      ok: false,
      message: missing
        ? "دوال الترجمة غير موجودة في قاعدة البيانات — نفِّذ هجرة المرحلة ٨ (0018) ثم أعد المحاولة."
        : "تعذّرت قراءة طابور الترجمة — راجع سجل الخادم لرسالة قاعدة البيانات.",
    });
  }

  // الفهرس الحي: مفاتيح لم يُكتب لها صف بعد. فشل قراءته لا يوقف الدفعة —
  // نترجم الصفوف المكتوبة على الأقل، ولا ندّعي أن الطابور فرغ.
  const corpus = await readCorpus(supabase);
  const written = new Set(queue.rows.map((row) => `${row.namespace} ${row.key}`));
  const untouched = corpus.rows.filter((row) => !written.has(`${row.namespace} ${row.key}`));

  const pending = [...queue.rows, ...untouched]
    .filter((row) => row.key !== "" && row.sourceText.trim() !== "")
    .filter((row) => row.stale || row.value === null || row.value.trim() === "")
    // القديمة أولاً: الزائر يقرأ الآن ترجمة لم تعد تطابق الأصل
    .sort((a, b) => Number(b.stale) - Number(a.stale));

  if (pending.length === 0) {
    return reply(200, {
      ok: true,
      message: "لا شيء ينتظر الترجمة الآلية في هذه اللغة — كل المفاتيح لها قيمة محدَّثة.",
    });
  }

  /**
   * مفتاح النشر التلقائي لهذه اللغة — يُقرأ **للرسالة وحدها**.
   *
   * القرار نفسه ليس هنا: `upsert_translations` تقرأ المفتاح من جدول اللغات
   * وتكتب `draft` أو `published` بناءً عليه. نقرؤه لنقول للمالك بصدق أين ذهب
   * ما كُتب — لا لنقرّر مصيره في مكانين.
   */
  const localeRow = await supabase
    .from("locales")
    .select("*")
    .eq("code", locale)
    .limit(1)
    .maybeSingle();

  const autoPublish =
    !localeRow.error && localeRow.data
      ? boolOf(localeRow.data as Record<string, unknown>, ["auto_publish", "autoPublish"])
      : false;

  const targets = pending.slice(0, limit);
  const provider = resolveMtProvider();
  const startedAt = Date.now();

  /**
   * شكل العنصر هو ما تقرؤه `upsert_translations` حرفياً:
   * `{locale, namespace, key, sourceText, value, provider}`.
   * **الحالة ليست من شأننا**: القاعدة هي من يقرر `draft` أو `published` من
   * مفتاح `auto_publish` للغة، وهي أيضاً من يحسب بصمة الأصل ويحمي ما راجعه
   * إنسان من أن تدهسه مسودة آلية.
   */
  const drafts: {
    locale: string;
    namespace: string;
    key: string;
    sourceText: string;
    value: string;
    provider: string;
  }[] = [];

  let attempted = 0;

  for (let index = 0; index < targets.length; index += SLICE) {
    if (Date.now() - startedAt > BUDGET_MS) break; // نفدت الميزانية — الباقي لضغطة تالية

    const slice = targets.slice(index, index + SLICE);
    const values = await provider.translate(
      slice.map((row) => row.sourceText),
      locale
    );
    attempted += slice.length;

    for (let i = 0; i < slice.length; i += 1) {
      const value = values[i];
      if (typeof value !== "string" || value.trim() === "") continue;
      const row = slice[i];
      drafts.push({
        locale,
        namespace: row.namespace,
        key: row.key,
        sourceText: row.sourceText,
        value: value.trim(),
        provider: provider.id,
      });
    }
  }

  // ── الكتابة: دفعة واحدة بحالة واحدة قرّرها مفتاح اللغة أعلاه ─────────────
  if (drafts.length > 0) {
    const { error } = await supabase.rpc("upsert_translations", { p_rows: drafts });
    if (error) {
      const missing = isMissingFunction(error.code) || isMissingTable(error.code);
      return reply(missing ? 503 : 500, {
        ok: false,
        requested: targets.length,
        skipped: targets.length,
        provider: provider.id,
        message: missing
          ? "دالة upsert_translations غير موجودة — نفِّذ هجرة المرحلة ٨ (0018)."
          : error.code === "42501"
            ? "رفضت قاعدة البيانات الكتابة (صلاحيات) — تأكد أن حسابك دوره admin."
            : "تعذّر حفظ المسودات — راجع سجل الخادم لرسالة قاعدة البيانات.",
      });
    }
  }

  const translated = drafts.length;
  const failed = Math.max(0, attempted - translated);
  const skipped = Math.max(0, targets.length - attempted);
  const remaining = Math.max(0, pending.length - translated);

  const parts: string[] = [];
  if (skipped > 0) parts.push("توقّفنا عند حد الوقت الآمن للطلب");
  if (failed > 0) parts.push(`${failed} نصاً لم يُرجعه المزوّد (حصة يومية أو نص طويل)`);
  if (remaining > 0) parts.push(`بقي ${remaining} مفتاحاً في الطابور — اضغط الزر مرة أخرى`);
  if (parts.length === 0) parts.push("انتهى طابور الترجمة الآلية لهذه اللغة");

  const fate = autoPublish
    ? "النشر التلقائي مفعَّل لهذه اللغة، فما كُتب وصل الزائر بلا مراجعة — راجعه من الطابور."
    : "كل ما كُتب مسودة تنتظر مراجعتك — لا شيء يُنشر تلقائياً.";

  return reply(200, {
    ok: true,
    requested: targets.length,
    translated,
    skipped,
    failed,
    provider: provider.id,
    message: `${parts.join(" · ")}. ${fate}`,
  });
}
