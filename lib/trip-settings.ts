import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { DEFAULT_TRIP_SETTINGS, type TripSettings } from "@/lib/booking-types";
import { isMissingFunction, isMissingTable } from "@/lib/dispatch/settings";

/**
 * إعدادات الرحلات وكنس الطلبات غير المدفوعة — طبقة الخادم لهجرة 0027.
 *
 * ملفان لا ثالث لهما يقرآن من هنا: قسم «إعدادات الرحلات» في `/admin/settings`
 * (الزر اليدوي بجلسة المشرف)، ومسار الدورة المجدولة `/api/dispatch/tick`
 * (بمفتاح الخدمة). ووجودهما معاً هو سبب هذا الملف: نسختان من نداء الكنس كانتا
 * ستفترقان في تطبيع العدّادات وفي معنى «لم تُنفَّذ الدورة».
 *
 * ثلاث قواعد تحكم الملف:
 *
 * (١) **لا قرار هنا ولا حساب.** المهلة ومن يستحق الإلغاء وترتيب الإلغاء كلها
 *     داخل `cancel_stale_bookings` في Postgres؛ وهذه الطبقة تنادي وتُطبّع الرد.
 *
 * (٢) **لا استثناء يخرج من `runStaleSweep` أبداً** — نفس عقد `lib/dispatch/tick.ts`:
 *     مستدعيها إما مهمة مجدولة أو زر في اللوحة، وانهيارها الصامت أسوأ من فشل
 *     مُبلَّغ عنه. والفشل يعود في `reason` لا في throw.
 *
 * (٣) **تطبيع متسامح لشكل الرد** (نفس أسلوب `dispatch_tick`): الدالة تُرجع
 *     `returns table` فيصل صفٌّ داخل مصفوفة، وقد تصل الأرقام نصوصاً من
 *     PostgREST. نقرأ الأسماء المحتملة كلها ونحتفظ بالخام في `raw`.
 *
 * ⚠ الكنس **لا يُنفَّذ بمفتاح الخدمة وحده**: حارس الدالة `dispatch_ops_allowed()`
 * يقبل المشرف كما يقبل عميل الخدمة (‏`0025:305`)، ولذلك مُنحت لـ `authenticated`
 * أيضاً — الزر اليدوي يعمل بجلسة المشرف ولا يحتاج `SUPABASE_SERVICE_ROLE_KEY`.
 */

/** اسم جدول الصف الوحيد — يُكتب مرة واحدة فلا ينحرف بين القارئ والكاتب */
export const TRIP_SETTINGS_TABLE = "trip_settings";

/**
 * أسماء الأعمدة كما في هجرة 0027 حرفياً. الكتابة تمر بهذه الثوابت (نفس نمط
 * `SETTINGS_COLUMNS` في شاشة الإسناد): عمود باسم مختلف يُنتج تحديثاً ينجح
 * ظاهرياً ولا يغيّر شيئاً، وهو أسوأ من خطأ صريح.
 */
export const TRIP_SETTINGS_COLUMNS = {
  unpaidCancelEnabled: "unpaid_cancel_enabled",
  unpaidTimeoutMinutes: "unpaid_timeout_minutes",
  minLeadMinutes: "min_lead_minutes",
} as const;

/**
 * حدّا المهلة — **مرآة لقيد `check` في 0027 لا اجتهاد**:
 * `check (unpaid_timeout_minutes between 15 and 43200)`.
 * الواجهة ترفض خارج المدى برسالة مفهومة بدل أن ترتد من القاعدة بخطأ خام.
 */
export const MIN_UNPAID_TIMEOUT_MINUTES = 15;
export const MAX_UNPAID_TIMEOUT_MINUTES = 43_200;

/**
 * حدّا أدنى مهلة قبل الانطلاق — **مرآة لقيد `check` في 0067**:
 * `check (min_lead_minutes between 0 and 10080)`.
 *
 * الصفر مقبول ومعناه **مطفأة**؛ والسقف أسبوعٌ صمّامَ أمان لا خياراً — مهلةٌ
 * أطول منه ترفض كل حجزٍ عملي، ورقمٌ كهذا في الحقل خطأٌ مطبعي لا سياسة.
 */
export const MIN_LEAD_MINUTES_FLOOR = 0;
export const MAX_LEAD_MINUTES = 10_080;

export type TripSettingsResult = {
  settings: TripSettings;
  /** هل قُرئ الصف فعلاً؟ `false` يعني أن المعروض افتراضي العقد لا محفوظ */
  loaded: boolean;
  /** no-function | no-table | read-failed | empty — يُملأ حين نرجع للافتراضيات */
  reason?: string;
};

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

/** أول عدّاد موجود من عدة أسماء — أعمدة `integer` قد تصل نصوصاً عبر PostgREST */
function counter(row: Record<string, unknown> | null, names: string[]): number | null {
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

function flag(row: Record<string, unknown> | null, names: string[], fallback: boolean): boolean {
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

function fallbackResult(reason: string): TripSettingsResult {
  return { settings: DEFAULT_TRIP_SETTINGS, loaded: false, reason };
}

/**
 * قراءة إعدادات الرحلات **من الجدول مباشرةً** بجلسة المشرف.
 *
 * ولماذا لا `trip_config()`؟ لأنها غير ممنوحة لأي دور مستخدم — عمداً، على سابقة
 * `dispatch_config()`: كل متعهد مستخدم `authenticated`، ومنحُها تعني أن يقرأ
 * سياسة تشغيلنا الداخلية بلا حاجة. الدالة للاستدعاء الداخلي من `cancel_stale_bookings`
 * بهوية مالكها، والمشرف يقرأ الصف نفسه عبر RLS (`trip_settings_select_admin`).
 *
 * و`loaded: false` يعني «لم نقرأ شيئاً»: هجرة غير مطبَّقة أو صف محذوف أو سياسة
 * رافضة — والشاشة تقول ذلك بالاسم بدل أن تعرض رقماً لم يصل. ⚠ وRLS الرافضة
 * تُرجع **صفر صفوف بلا خطأ**، فالتمييز بين `empty` و«ممنوع» غير ممكن هنا؛
 * كلاهما `loaded: false` وهو ما تعرضه الشاشة.
 */
export async function readTripSettings(supabase: SupabaseClient): Promise<TripSettingsResult> {
  try {
    const { data, error } = await supabase
      .from(TRIP_SETTINGS_TABLE)
      .select("*")
      .limit(1)
      .maybeSingle();

    if (error) {
      return fallbackResult(
        isMissingFunction(error.code)
          ? "no-function"
          : isMissingTable(error.code)
            ? "no-table"
            : "read-failed"
      );
    }

    const row = asRecord(data);
    if (!row) return fallbackResult("empty");

    const minutes = counter(row, ["unpaid_timeout_minutes", "unpaidTimeoutMinutes"]);
    // 0067 — عمودٌ قد لا يكون موجوداً على قاعدةٍ لم تصلها الهجرة بعد، فغيابه
    // يسقط إلى افتراضي العقد (صفر = مطفأة) لا إلى رقمٍ يُخترع.
    const lead = counter(row, ["min_lead_minutes", "minLeadMinutes"]);

    return {
      loaded: true,
      settings: {
        unpaidCancelEnabled: flag(
          row,
          ["unpaid_cancel_enabled", "unpaidCancelEnabled"],
          DEFAULT_TRIP_SETTINGS.unpaidCancelEnabled
        ),
        unpaidTimeoutMinutes:
          minutes === null
            ? DEFAULT_TRIP_SETTINGS.unpaidTimeoutMinutes
            : Math.max(MIN_UNPAID_TIMEOUT_MINUTES, Math.round(minutes)),
        minLeadMinutes:
          lead === null
            ? DEFAULT_TRIP_SETTINGS.minLeadMinutes
            : Math.min(MAX_LEAD_MINUTES, Math.max(MIN_LEAD_MINUTES_FLOOR, Math.round(lead))),
      },
    };
  } catch {
    return fallbackResult("read-failed");
  }
}

export type StaleSweepResult = {
  /** نُفِّذ الكنس فعلاً (ولو ألغى صفراً) */
  ok: boolean;
  ranAt: string;
  /** عدد الحجوزات التي فحصها هذا النداء */
  scanned: number;
  /** عدد ما أُلغي فعلاً */
  cancelled: number;
  /**
   * صفوف تعذّر إلغاؤها — كل صف في كتلة استثناء مستقلة داخل الدالة، فلا يُسقط
   * صفٌّ سام الدورةَ كلها. أي رقم فوق الصفر هنا **عطبٌ يستحق النظر** لا ضجيج:
   * تفصيله في سجل الخادم بـ `raise warning`.
   */
  failed: number;
  /** no-client | no-function | no-table | forbidden | rpc-failed | worker-error */
  reason?: string;
  raw: unknown;
};

function zeroSweep(reason: string, raw: unknown = null): StaleSweepResult {
  return {
    ok: false,
    ranAt: new Date().toISOString(),
    scanned: 0,
    cancelled: 0,
    failed: 0,
    reason,
    raw,
  };
}

/**
 * تشغيل كنس واحد للطلبات غير المدفوعة — الغلاف حول `cancel_stale_bookings()`.
 *
 * ترجع الملخّص دائماً، و`reason` مملوء حين لم يُنفَّذ الكنس أصلاً. ولاحظ أن
 * `ok: true` مع `cancelled = 0` **حالة سليمة تماماً** ولها ثلاثة أسباب مشروعة:
 * المفتاح مطفأ في `trip_settings`، أو لا حجز تجاوز مهلته، أو كنسٌ آخر يعمل
 * الآن فأمسك القفل الاستشاري. الشاشة تشرح الثلاثة ولا تسمّيها فشلاً.
 *
 * القفل الاستشاري داخل الدالة (‏`pg_try_advisory_xact_lock`) هو الحماية الحقيقية
 * من التزامن — فلا قفل داخل العملية هنا: قفلٌ في الذاكرة كان سيجعل زر المشرف
 * يعود بلا أثر بصمت لمجرد أن الدورة المجدولة تعمل في نفس اللحظة.
 */
export async function runStaleSweep(client: SupabaseClient | null): Promise<StaleSweepResult> {
  if (!client) return zeroSweep("no-client");

  try {
    const { data, error } = await client.rpc("cancel_stale_bookings");

    if (error) {
      const hint = typeof error.hint === "string" ? error.hint.trim() : "";
      const reason = isMissingFunction(error.code)
        ? "no-function"
        : isMissingTable(error.code)
          ? "no-table"
          : hint === "forbidden" || error.code === "42501"
            ? "forbidden"
            : "rpc-failed";
      return zeroSweep(reason, { message: error.message, code: error.code, hint: error.hint });
    }

    const row = asRecord(Array.isArray(data) ? data[0] : data);

    return {
      ok: true,
      ranAt: new Date().toISOString(),
      scanned: counter(row, ["scanned", "scanned_count", "scannedCount"]) ?? 0,
      cancelled: counter(row, ["cancelled", "canceled", "cancelled_count", "cancelledCount"]) ?? 0,
      failed: counter(row, ["failed", "failed_count", "failedCount"]) ?? 0,
      raw: data ?? null,
    };
  } catch (err) {
    // العقد: لا استثناء يخرج من هذه الدالة إطلاقاً
    return zeroSweep("worker-error", err instanceof Error ? err.message : "خطأ غير متوقع");
  }
}
