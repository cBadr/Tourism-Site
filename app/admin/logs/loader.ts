import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import {
  AUDITED_ENTITIES,
  type AuditAction,
  type AuditActorKind,
  type AuditAttempt,
  type AuditEntry,
} from "@/lib/audit-types";
import { addDays, parseIsoDate } from "@/lib/stats/range";
import {
  blankRead,
  classifyStatsError,
  hasSupabaseEnv,
  numberOf,
  rowsOf,
  textOf,
  type StatsFailure,
  type StatsRead,
} from "@/lib/stats/read";
import { createServerSupabase } from "@/lib/supabase/server";

import { cairoMidnightUtc } from "../finance/_components/range";

/**
 * قراءة شاشة السجلات (الملاحظة ١٥) — **قراءة محضة، صفر تجميع، صفر كتابة**.
 *
 * أربعة قرارات تحكم هذا الملف:
 *
 * (١) **عميل الجلسة لا عميل الخدمة.** `createServerSupabase()` يجعل كل قراءة
 *     تمرّ على RLS وعلى حارس `audit_admin_allowed()` داخل `audit_search`. ومفتاح
 *     الخدمة هنا كان سيكون أسوأ خطأ ممكن في المستودع كله: السجل يجمع في جدول
 *     واحد أثر كل جدول مالي وتشغيلي، فحارسٌ في الصفحة وحده يجعل ثغرةً واحدة في
 *     التوجيه تسريباً كاملاً لتاريخ المنصة.
 *
 * (٢) **لا صفر ولا قائمة فارغة تعني «مجهول».** نفس تمييز `lib/stats/read.ts`:
 *     جدول/دالة غير موجودة ⇒ `migration`، ورفض القاعدة ⇒ `forbidden`، وما عداه
 *     ⇒ `failed`. وهذا التمييز أهمّ هنا منه في أي شاشة أخرى: جدولٌ فارغ على شاشة
 *     تدقيق يقول «لم يقع شيء»، وهي أخطر جملة يمكن أن تكذب بها شاشة.
 *
 * (٣) **مصنّف الأخطاء مستورَد لا منسوخ.** الحارس `audit_admin_allowed()` في
 *     0036 **نسخة مطابقة** لـ`analytics_admin_allowed()` بنصّ الهجرة نفسها —
 *     فسلّم الصلاحية واحد، ومصنّفان لسلّم واحد ينحرفان (النمط ٤ في LESSONS.md).
 *     تُعاد تسميته محلياً (`AuditFailure`/`AuditRead`) كي يقرأ المستدعي مفرداته
 *     لا مفردات شاشة الإحصائيات.
 *
 * (٤) **فخّ الصفوف الصفرية في `audit_attempts`.** الجدول محروس بـRLS لا برمي
 *     استثناء: غيرُ المشرف يقرأه فيحصل على **صفر صفٍّ بلا خطأ** — أي شاشة تقول
 *     «لا محاولات مرفوضة» لمن هو نفسه ممنوع من رؤيتها. ولذلك تُقرأ المحاولات
 *     مع **مسبار صلاحية** (`audit_search` بحدٍّ واحد): الدالة ترمي لغير المشرف،
 *     فيُعرف الفرق بين «لا محاولات» و«لا صلاحية». والمسبار يستعمل نفس المحمول
 *     الذي تستعمله سياسة الجدول (`is_admin()` لجلسة المتصفح) فلا يفترقان.
 */

// ---------------------------------------------------------------------------
// الأنواع
// ---------------------------------------------------------------------------

export type AuditFailure = StatsFailure;
export type AuditRead<T> = StatsRead<T>;

/** أي الوجهين معروض: السجل المنفَّذ أم المحاولات المرفوضة */
export type AuditView = "log" | "attempts";

/** الترشيح كما وصل من الرابط — كل حقوله منظَّفة ومقبولة من القاعدة */
export type AuditFilters = {
  /** اسم جدول من `AUDITED_ENTITIES` حصراً، أو `null` لكل الجداول */
  entity: string | null;
  /** uuid فاعل، أو `null` لكل الفاعلين */
  actor: string | null;
  /** أول يوم (بتوقيت القاهرة) YYYY-MM-DD */
  from: string | null;
  to: string | null;
};

/** حساب في دليل الفاعلين — الاسم قد يكون `null` وعندها يُعرض المعرّف المختصر */
export type ActorProfile = { id: string; name: string | null; role: string | null };

export type ActorDirectory = {
  list: ActorProfile[];
  byId: Map<string, ActorProfile>;
  /** هل قُرئ الدليل فعلاً؟ `false` ⇒ الأسماء تُعرض معرّفاتٍ مختصرة، لا أسماء مخترعة */
  ready: boolean;
};

export type LogsLoad = {
  /** متغيرات البيئة مضبوطة؟ — يفرّق «غير مربوطة» عن «مربوطة وفشلت» */
  wired: boolean;
  actors: ActorDirectory;
} & (
  | { view: "log"; entries: AuditRead<AuditEntry[]> }
  | { view: "attempts"; attempts: AuditRead<AuditAttempt[]> }
);

// ---------------------------------------------------------------------------
// الحدود
// ---------------------------------------------------------------------------

/**
 * سقف الصفوف — و`audit_search` تقصّه بدورها عند ٥٠٠ داخل القاعدة. الرقم هنا
 * أقل من سقفها بقصد: الشاشة نافذةٌ على الأحدث لا أرشيفٌ يُنزَّل، والتضييق يقع
 * بالفترة والفاعل والجدول لا بتحميل كل شيء ثم البحث بالعين.
 *
 * ⚠ والمئة رقمٌ **مقيس لا مختار**: سطر الحذف يحمل لقطة الصف كاملة، وصفحةٌ فيها
 * ١٥٢ لقطة حجزٍ أنتجت على البيانات الحيّة ‏٢٫٣ ميغابايت من HTML. فالسقف هنا هو
 * نفسه سقف شاشة الطلبات (‏`MAX_ROWS = 100`) رغم أن الدالة تسمح بخمسمئة —
 * وسطرٌ لا يُعرض خيرٌ من شاشةٍ لا تُفتح.
 */
export const MAX_ROWS = 100;

/**
 * سقف دليل الفاعلين. والدليل مقصور على الأدوار العاملة (مشرف/تشغيل/متعهد):
 * لا حساب عميل في القاعدة اليوم بنصّ العقد، وإدراج جدول العملاء كاملاً يوم
 * يوجد كان سيزيح موظفي التشغيل خارج السقف بترتيب أبجدي. وفاعلٌ خارج الدليل
 * (حساب محذوف أو دورٌ آخر) يظهر بمعرّفه المختصر وصنفه — لا باسم مخترَع.
 */
const MAX_ACTORS = 200;

const ACTING_ROLES = ["admin", "ops", "subcontractor"];

/**
 * ⚠ لا قائمة أعمدة لـ`audit_search`: توقيعها `returns setof public.audit_log`،
 * فالأعمدة تصل كاملة بعقد الهجرة. وقائمةٌ صريحة هنا كانت ستصير عقداً ثانياً
 * ينحرف يوم يُضاف عمود ربطٍ ثالث إلى الجدول.
 */
const ATTEMPT_COLUMNS =
  "id, occurred_at, actor, actor_kind, operation, reason, entity, entity_id, detail";

// ---------------------------------------------------------------------------
// تنظيف مُدخلات الرابط
// ---------------------------------------------------------------------------

const firstParam = (value: string | string[] | undefined): string | undefined =>
  Array.isArray(value) ? value[0] : value;

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * اسم الجدول من الرابط — **لا يُمرَّر إلا ما في `AUDITED_ENTITIES`**.
 *
 * ليس دفاعاً عن حقن (المعامل مرتبط لا مُركَّب نصاً)، بل حفاظاً على عقد الرابط:
 * `?entity=whatever` يجب أن يعطي «كل الجداول» بتبويبٍ مضيءٍ صحيح، لا استعلاماً
 * يُرجع صفراً فيقرؤه المالك «لا أحداث في هذا الجدول».
 */
export function cleanEntity(raw: string | string[] | undefined): string | null {
  const value = firstParam(raw);
  if (typeof value !== "string") return null;
  return (AUDITED_ENTITIES as readonly string[]).includes(value) ? value : null;
}

/** uuid الفاعل — وما ليس uuid يُهمَل بدل أن يُرسَل فترمي القاعدة 22P02 */
export function cleanActor(raw: string | string[] | undefined): string | null {
  const value = firstParam(raw);
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return UUID_PATTERN.test(trimmed) ? trimmed.toLowerCase() : null;
}

export function readView(raw: string | string[] | undefined): AuditView {
  return firstParam(raw) === "attempts" ? "attempts" : "log";
}

/**
 * الفترة من الرابط — **بلا نافذة افتراضية**.
 *
 * شاشات الإحصائيات تفترض ٣٠ يوماً حين لا فترة، وهذه لا تفعل: نافذةٌ ضمنية على
 * شاشة سجلات تعني أن حدثاً قديماً غائبٌ عن الشاشة بلا أن يعرف قارئها لماذا.
 * فالافتراض هنا «كل التاريخ، أحدثه أولاً»، والتضييق قرارٌ يتخذه المالك ويُكتب
 * في الرابط. والتاريخان المقلوبان يُبدَّلان بدل رفض الطلب — نفس قاعدة
 * `resolveStatRange`: خطأ ترتيب لا خطأ نية.
 */
export function readFilters(
  params: Record<string, string | string[] | undefined>
): AuditFilters {
  let from = parseIsoDate(firstParam(params.from));
  let to = parseIsoDate(firstParam(params.to));
  if (from && to && from > to) [from, to] = [to, from];

  return {
    entity: cleanEntity(params.entity),
    actor: cleanActor(params.actor),
    from,
    to,
  };
}

/**
 * حدّا الترشيح على عمود `timestamptz` — [منتصف ليل القاهرة، منتصف ليل اليوم التالي).
 *
 * ⚠ ولماذا لا تُمرَّر `YYYY-MM-DD` مباشرة؟ لأن `audit_search` تقارن
 * `(occurred_at at time zone 'Africa/Cairo')::date`، بينما مقارنة `timestamptz`
 * عبر PostgREST تُفسَّر بمنطقة الجلسة (UTC). فبلا هذا التحويل يصير «يوم ١٢» في
 * تبويب المحاولات ممتداً من الثالثة صباحاً إلى الثالثة صباحاً — أي تبويبان على
 * الشاشة الواحدة يعنيان بـ«اليوم» شيئين. و`cairoMidnightUtc` مستوردة من نطاق
 * المالية لا منسوخة: هي الموضع الوحيد في المستودع الذي يقيس إزاحة القاهرة عند
 * التاريخ نفسه (فيصيب التوقيت الصيفي)، ونسخةٌ ثانية منها تنحرف بصمت.
 */
function instantBounds(filters: AuditFilters): { start: string | null; end: string | null } {
  return {
    start: filters.from ? cairoMidnightUtc(filters.from) : null,
    end: filters.to ? cairoMidnightUtc(addDays(filters.to, 1)) : null,
  };
}

// ---------------------------------------------------------------------------
// نتيجة قراءة
// ---------------------------------------------------------------------------

type PgErrorLike = { code?: string; hint?: string | null; message?: string } | null;

const ok = <T,>(data: T): AuditRead<T> => ({
  data,
  ready: true,
  failure: null,
  missing: null,
});

const failed = <T,>(data: T, missing: string, error: PgErrorLike): AuditRead<T> => ({
  data,
  ready: false,
  failure: classifyStatsError(error),
  missing,
});

// ---------------------------------------------------------------------------
// تحويل الصفوف — شكلٌ فقط، بلا اشتقاق قيمة
// ---------------------------------------------------------------------------

const asObject = (value: unknown): Record<string, unknown> | null =>
  value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;

const ACTOR_KINDS: AuditActorKind[] = [
  "admin",
  "ops",
  "partner",
  "customer",
  "guest",
  "system",
  "db",
];

/**
 * صنف الفاعل — و`audit_log_actor_kind_chk` في 0036 تجعل الفرع البديل **غير قابل
 * للوقوع**. وُضع كي لا تسقط شاشة على قيمة لا يعرفها العقد، و`system` أقلّ
 * الأصناف ادّعاءً: هو الوحيد الذي لا ينسب الفعل إلى إنسان بعينه.
 */
const asActorKind = (value: string | null): AuditActorKind =>
  value !== null && (ACTOR_KINDS as string[]).includes(value)
    ? (value as AuditActorKind)
    : "system";

const ACTIONS: AuditAction[] = ["insert", "update", "delete"];

/** الإجراء — محروس بـ`audit_log_action_chk` كذلك، والبديل تعديلٌ لا حذف: البديل الأقل ادّعاءً */
const asAction = (value: string | null): AuditAction =>
  value !== null && (ACTIONS as string[]).includes(value) ? (value as AuditAction) : "update";

function mapEntry(row: Record<string, unknown>): AuditEntry {
  return {
    id: numberOf(row, ["id"]) ?? 0,
    occurredAt: textOf(row, ["occurred_at"]) ?? "",
    actor: textOf(row, ["actor"]),
    actorKind: asActorKind(textOf(row, ["actor_kind"])),
    entity: textOf(row, ["entity"]) ?? "",
    entityId: textOf(row, ["entity_id"]),
    entityLabel: textOf(row, ["entity_label"]),
    action: asAction(textOf(row, ["action"])),
    changes: asObject(row.changes),
    snapshot: asObject(row.snapshot),
    note: textOf(row, ["note"]),
    bookingId: textOf(row, ["booking_id"]),
    subcontractorId: textOf(row, ["subcontractor_id"]),
  };
}

function mapAttempt(row: Record<string, unknown>): AuditAttempt {
  return {
    id: numberOf(row, ["id"]) ?? 0,
    occurredAt: textOf(row, ["occurred_at"]) ?? "",
    actor: textOf(row, ["actor"]),
    actorKind: asActorKind(textOf(row, ["actor_kind"])),
    operation: textOf(row, ["operation"]) ?? "unknown",
    reason: textOf(row, ["reason"]) ?? "unknown",
    entity: textOf(row, ["entity"]),
    entityId: textOf(row, ["entity_id"]),
    detail: textOf(row, ["detail"]),
  };
}

// ---------------------------------------------------------------------------
// القرّاء الثلاثة
// ---------------------------------------------------------------------------

/**
 * `audit_search(p_entity, p_actor, p_from, p_to, p_limit)` — سطح القراءة الوحيد
 * للسجل المنفَّذ. الدالة **ترمي** لغير المشرف (‏`hint = 'forbidden'`) ولا ترجع
 * صفراً، فقائمةٌ فارغة عائدة منها تعني «لا أحداث» بيقين لا «لا صلاحية».
 */
async function readEntries(
  supabase: SupabaseClient,
  filters: AuditFilters
): Promise<AuditRead<AuditEntry[]>> {
  const result = await supabase.rpc("audit_search", {
    p_entity: filters.entity,
    p_actor: filters.actor,
    p_from: filters.from,
    p_to: filters.to,
    p_limit: MAX_ROWS,
  });

  if (result.error) return failed<AuditEntry[]>([], "audit_search", result.error);
  return ok(rowsOf(result.data).map(mapEntry));
}

/**
 * `audit_attempts` — قراءة مباشرة محروسة بـRLS، **ومعها مسبار الصلاحية**.
 *
 * الترتيب بعمودين (‏`occurred_at` ثم `id`) لا بعمود واحد: طابعان زمنيان
 * متطابقان في المعاملة الواحدة يجعلان ترتيب الصفحة غير محدَّد، وسجلٌّ يعيد
 * ترتيب سطوره بين قراءتين يفقد أهم ما فيه.
 */
async function readAttempts(
  supabase: SupabaseClient,
  filters: AuditFilters
): Promise<AuditRead<AuditAttempt[]>> {
  const { start, end } = instantBounds(filters);

  let query = supabase
    .from("audit_attempts")
    .select(ATTEMPT_COLUMNS)
    .order("occurred_at", { ascending: false })
    .order("id", { ascending: false })
    .limit(MAX_ROWS);

  if (filters.entity) query = query.eq("entity", filters.entity);
  if (filters.actor) query = query.eq("actor", filters.actor);
  if (start) query = query.gte("occurred_at", start);
  if (end) query = query.lt("occurred_at", end);

  // المسبار يُطلق مع القائمة لا بعدها: نتيجته لا تغيّر الاستعلام، وانتظاره
  // بالتتابع كان سيضيف جولة كاملة إلى شاشة قراءة.
  const [listResult, probe] = await Promise.all([
    query,
    supabase.rpc("audit_search", { p_limit: 1 }),
  ]);

  if (listResult.error) return failed<AuditAttempt[]>([], "audit_attempts", listResult.error);
  // القائمة نجحت وهي فارغة أو غير فارغة — لا فرق: بلا مسبارٍ ناجح لا نعرف أن
  // الفراغ فراغٌ حقيقي، ونشرُ فراغٍ مجهول على شاشة تدقيق هو العطب نفسه.
  if (probe.error) return failed<AuditAttempt[]>([], "audit_attempts", probe.error);

  return ok(rowsOf(listResult.data).map(mapAttempt));
}

/**
 * دليل الفاعلين — `profiles` هو الموضع الوحيد الذي يربط uuid باسم.
 *
 * وفشل هذه القراءة **لا يُفشل الشاشة**: السجل يُقرأ بمعرّفات مختصرة وأصناف،
 * وهي معلومة ناقصة لا كاذبة. أما ربطُ اسمٍ بمعرّفٍ لم يصل فهو الكذب.
 */
async function readActors(supabase: SupabaseClient): Promise<ActorDirectory> {
  const result = await supabase
    .from("profiles")
    .select("id, role, full_name")
    .in("role", ACTING_ROLES)
    .order("role", { ascending: true })
    .order("full_name", { ascending: true })
    .limit(MAX_ACTORS);

  if (result.error) return { list: [], byId: new Map(), ready: false };

  const list: ActorProfile[] = rowsOf(result.data)
    .map((row) => ({
      id: textOf(row, ["id"]) ?? "",
      name: textOf(row, ["full_name"]),
      role: textOf(row, ["role"]),
    }))
    .filter((profile) => profile.id !== "");

  return { list, byId: new Map(list.map((profile) => [profile.id, profile])), ready: true };
}

// ---------------------------------------------------------------------------
// المدخل الوحيد للشاشة
// ---------------------------------------------------------------------------

const EMPTY_DIRECTORY: ActorDirectory = { list: [], byId: new Map(), ready: false };

/**
 * قراءة الشاشة كاملة — يُقرأ **وجهٌ واحد** لا الوجهان.
 *
 * الوجه غير المعروض لا يُقرأ عمداً: قراءته كانت ستضيف استعلامين لعرض عدّادٍ على
 * تبويبه، والعدّاد ممنوع في هذه المرحلة إلا محسوباً في القاعدة. والنوع اتحادٌ
 * مميَّز بـ`view` فلا يوجد حقلٌ «فارغ يعني لم يُطلب» يخطئ أحدٌ في قراءته.
 */
export async function loadLogs(view: AuditView, filters: AuditFilters): Promise<LogsLoad> {
  const wired = hasSupabaseEnv();
  const supabase = await createServerSupabase();

  // بيئة غير مربوطة: `failure = null` مع `ready = false` — أي «لم تُحاول القراءة»
  // لا «فشلت»، والشاشة تقرأ الفرق فتكتب السبب الصحيح
  if (!supabase) {
    return view === "attempts"
      ? {
          wired,
          view,
          actors: EMPTY_DIRECTORY,
          attempts: blankRead<AuditAttempt[]>([], "audit_attempts"),
        }
      : {
          wired,
          view,
          actors: EMPTY_DIRECTORY,
          entries: blankRead<AuditEntry[]>([], "audit_search"),
        };
  }

  if (view === "attempts") {
    const [attempts, actors] = await Promise.all([
      readAttempts(supabase, filters),
      readActors(supabase),
    ]);
    return { wired, view, attempts, actors };
  }

  const [entries, actors] = await Promise.all([
    readEntries(supabase, filters),
    readActors(supabase),
  ]);
  return { wired, view, entries, actors };
}
