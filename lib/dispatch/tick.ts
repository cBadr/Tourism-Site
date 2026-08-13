import "server-only";

import type { DispatchStatus, TripOfferStatus } from "@/lib/dispatch-types";
import { createServiceSupabase } from "@/lib/supabase/admin";
import { isMissingFunction, isMissingTable, readDispatchSettings } from "@/lib/dispatch/settings";
import { DEFAULT_DISPATCH } from "@/lib/dispatch-types";
import type { DispatchQueueStats, DispatchTickSummary } from "@/lib/dispatch/types";

/**
 * دورة البث — الغلاف حول `dispatch_tick()` في Postgres.
 *
 * كل القرار في SQL: أي عرض انتهت مهلته، وأي حجز يستحق موجة تالية، وأيّها
 * استُنفدت موجاته فيُصعَّد للطابور اليدوي. هذه الدالة تنادي الدالة بعميل الخدمة
 * وتُطبّع ردّها، **ولا ترمي استثناءً أبداً** — لأن مستدعيها إما مهمة مجدولة أو
 * زر في اللوحة، وانهيارها الصامت أسوأ من فشل مُبلَّغ عنه (نفس عقد المرحلة ٤).
 *
 * لماذا تطبيع متسامح لشكل الرد؟ لأن الدالة قد تُرجع `jsonb` أو صفاً واحداً من
 * `returns table`، وقد تسمّي عدّاداتها بأي من الصيغتين. نقرأ الأسماء المحتملة
 * كلها، ونحتفظ بالرد الخام في `raw` فلا يضيع شيء مهما اختلف الشكل.
 *
 * قفل داخل العملية يمنع تداخل دورتين (زر اللوحة + المهمة المجدولة معاً): البث
 * عملية كتابة على طابور، وتشغيلها مرتين في اللحظة نفسها يضاعف العروض المبثوثة.
 * القفل داخلي فقط — الحماية الحقيقية من التزامن قفوف الصفوف داخل SQL.
 */

let running = false;

const DISPATCH_STATUSES: DispatchStatus[] = [
  "queued",
  "broadcasting",
  "assigned",
  "manual",
  "cancelled",
];

const OFFER_STATUSES: TripOfferStatus[] = [
  "pending",
  "accepted",
  "rejected",
  "expired",
  "revoked",
];

function zeroSummary(reason: string, raw: unknown = null, ok = false): DispatchTickSummary {
  return {
    ok,
    ranAt: new Date().toISOString(),
    expiredOffers: 0,
    newRounds: 0,
    newOffers: 0,
    escalated: 0,
    processed: 0,
    reason,
    raw,
  };
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

/** أول عدّاد موجود من عدة أسماء محتملة — الأرقام قد تصل نصوصاً من `numeric` */
function counter(row: Record<string, unknown> | null, names: string[]): number | null {
  if (!row) return null;
  for (const name of names) {
    const v = row[name];
    if (typeof v === "number" && Number.isFinite(v)) return v;
    if (typeof v === "string" && v.trim() !== "") {
      const n = Number(v);
      if (Number.isFinite(n)) return n;
    }
  }
  return null;
}

/**
 * تطبيع رد `dispatch_tick()`:
 *   - كائن jsonb واحد        ← يُقرأ مباشرة
 *   - مصفوفة صف واحد          ← يُقرأ أول صف
 *   - مصفوفة صفوف (صف لكل حجز) ← العدّادات من أول صف إن وُجدت، و`processed` طولها
 */
function normalize(data: unknown): Omit<DispatchTickSummary, "ok" | "ranAt" | "reason" | "raw"> {
  const rows = Array.isArray(data) ? data : [];
  const row = asRecord(Array.isArray(data) ? data[0] : data);

  const expiredOffers =
    counter(row, ["expiredOffers", "expired_offers", "expired", "offersExpired", "offers_expired"]) ?? 0;
  const newRounds =
    counter(row, [
      "newRounds",
      "new_rounds",
      "roundsStarted",
      "rounds_started",
      "rounds",
      "broadcasts",
      "broadcast",
      "rebroadcasts",
    ]) ?? 0;
  const newOffers =
    counter(row, ["newOffers", "new_offers", "offersCreated", "offers_created", "offersSent", "offers_sent", "offers"]) ??
    0;
  const escalated =
    counter(row, ["escalated", "exhausted", "toManual", "to_manual", "manual", "escalations"]) ?? 0;

  const processed =
    counter(row, ["processed", "bookings", "touched", "count"]) ??
    (rows.length > 1 ? rows.length : newRounds + escalated);

  return { expiredOffers, newRounds, newOffers, escalated, processed };
}

/**
 * تشغيل دورة بث واحدة. ترجع الملخّص دائماً — و`reason` مملوء حين لم تُنفَّذ
 * الدورة أصلاً (بيئة ناقصة أو هجرة غير مطبَّقة).
 */
export async function runDispatchTick(): Promise<DispatchTickSummary> {
  if (running) return zeroSummary("already-running");
  running = true;

  try {
    const supabase = createServiceSupabase();
    if (!supabase) return zeroSummary("no-service-client");

    const { data, error } = await supabase.rpc("dispatch_tick");

    if (error) {
      const reason = isMissingFunction(error.code)
        ? "no-function"
        : isMissingTable(error.code)
          ? "no-table"
          : "rpc-failed";
      return zeroSummary(reason, { message: error.message, code: error.code, hint: error.hint });
    }

    return {
      ok: true,
      ranAt: new Date().toISOString(),
      ...normalize(data),
      raw: data ?? null,
    };
  } catch (err) {
    // العقد: لا استثناء يخرج من هذه الدالة إطلاقاً
    return zeroSummary("worker-error", err instanceof Error ? err.message : "خطأ غير متوقع");
  } finally {
    running = false;
  }
}

/**
 * إحصاء طابور البث — يخدم GET على `/api/dispatch/tick` وبطاقة الحالة في اللوحة.
 * لا يكتب شيئاً، ويرجع أصفاراً مع سبب واضح حين تغيب الجداول.
 */
export async function getDispatchStats(): Promise<DispatchQueueStats> {
  const emptyDispatches = Object.fromEntries(
    DISPATCH_STATUSES.map((s) => [s, 0])
  ) as Record<DispatchStatus, number>;
  const emptyOffers = Object.fromEntries(
    OFFER_STATUSES.map((s) => [s, 0])
  ) as Record<TripOfferStatus, number>;

  const empty: DispatchQueueStats = {
    ok: false,
    ranAt: new Date().toISOString(),
    dispatches: emptyDispatches,
    offers: emptyOffers,
    overdueOffers: 0,
    settings: DEFAULT_DISPATCH,
    settingsLoaded: false,
  };

  try {
    const supabase = createServiceSupabase();
    if (!supabase) return { ...empty, reason: "no-service-client" };

    const nowIso = new Date().toISOString();

    /**
     * فخّ مقيس على هذه القاعدة: استعلام العدّ بـ `head: true` على جدول **غير
     * موجود** يرجع بلا خطأ إطلاقاً و`count = null`. أي أن الاعتماد على `error`
     * وحده يعطي «صفر صفوف، كل شيء سليم» بينما الهجرة لم تُطبَّق أصلاً — وهو
     * نفس فخّ الصفوف الصفرية الصامتة المعروف في هذا المشروع.
     *
     * الحارس: استطلاع عادي (select … limit 1) لكل جدول قبل قراءة العدّادات.
     * الاستطلاع العادي يرجع PGRST205 حين يغيب الجدول، فيتحول الرد إلى
     * `ok: false` مع سبب صريح، وترفع المهمة المجدولة ٥٠٣ بدل تقرير كاذب.
     */
    const [settingsResult, dispatchProbe, offerProbe, dispatchCounts, offerCounts, overdue] =
      await Promise.all([
        readDispatchSettings(supabase),
        supabase.from("dispatches").select("*").limit(1),
        supabase.from("trip_offers").select("*").limit(1),
        Promise.all(
          DISPATCH_STATUSES.map((status) =>
            supabase.from("dispatches").select("*", { count: "exact", head: true }).eq("status", status)
          )
        ),
        Promise.all(
          OFFER_STATUSES.map((status) =>
            supabase.from("trip_offers").select("*", { count: "exact", head: true }).eq("status", status)
          )
        ),
        supabase
          .from("trip_offers")
          .select("*", { count: "exact", head: true })
          .eq("status", "pending")
          .lt("expires_at", nowIso),
      ]);

    const failed = [dispatchProbe, offerProbe, ...dispatchCounts, ...offerCounts, overdue].find(
      (res) => res.error
    );
    if (failed?.error) {
      return {
        ...empty,
        settings: settingsResult.settings,
        settingsLoaded: settingsResult.loaded,
        reason: isMissingTable(failed.error.code) ? "no-table" : "read-failed",
      };
    }

    const dispatches = { ...emptyDispatches };
    DISPATCH_STATUSES.forEach((status, i) => {
      dispatches[status] = dispatchCounts[i].count ?? 0;
    });

    const offers = { ...emptyOffers };
    OFFER_STATUSES.forEach((status, i) => {
      offers[status] = offerCounts[i].count ?? 0;
    });

    return {
      ok: true,
      ranAt: nowIso,
      dispatches,
      offers,
      overdueOffers: overdue.count ?? 0,
      settings: settingsResult.settings,
      settingsLoaded: settingsResult.loaded,
    };
  } catch {
    return { ...empty, reason: "read-failed" };
  }
}
