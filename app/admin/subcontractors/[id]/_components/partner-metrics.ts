import type { SupabaseClient } from "@supabase/supabase-js";

import type { StatSeries } from "@/lib/analytics-types";
import { asNumber, asText, pick, zonedParts } from "../../../orders/_components/booking-ui";

/**
 * ══════════════════════════════════════════════════════════════════════════
 *  مؤشرات متعهد واحد — كل رقم فيها **يُحسب في Postgres**، ولا واحد في المتصفح
 * ══════════════════════════════════════════════════════════════════════════
 *
 * الشاشة تعرض هذه الأرقام في بطاقاتٍ ورسمٍ زمني، وهذا الملف هو المسؤول الوحيد عن
 * جلبها. وما يقع هنا ثلاثة أشياء لا رابع: **نداء** عرضٍ أو دالةٍ جاهزة،
 * و**عدُّ صفوفٍ بـ`count: exact, head: true`** (وهو عدٌّ في القاعدة لا في
 * الواجهة — لا صفَّ واحد يعبر الشبكة)، و**حدودُ تقويمٍ** للسلال الشهرية.
 * لا `reduce` ولا جمع ولا قسمة على أي قيمة تُعرض.
 *
 * ── (١) 🔴 مصدرٌ واحد لعدد الرحلات: `v_stats_partners` وحده ────────────────
 *
 * الإسناد إلى شريكٍ **ليس عمود `bookings.subcontractor_id`**: العرض
 * `v_booking_profit` يعرّفه `coalesce(dispatches.assigned_subcontractor_id,
 * bookings.subcontractor_id)`. وقيس على القاعدة الحيّة في 2026-08-18 أن
 * الفرق **قائمٌ فعلاً** لا نظري: الحجز `TR-QHE3SJ` مُسنَدٌ عبر `dispatches`
 * و`bookings.subcontractor_id` فيه `null`. فعدٌّ على `bookings` كان سيقول
 * ٣ رحلات بينما تقول شاشة الإحصائيات ٤ — **رقمان لشيء واحد** (النمط ٨ في
 * `LESSONS.md`). ولذلك **كل** عدٍّ هنا يقع على `v_booking_profit` أو على
 * `v_stats_partners` المبنيّ فوقه، ولا يقع على `bookings` أبداً.
 *
 * ── (٢) 🔒 D-19: لا تكلفة ولا هامش يخرجان من هنا ──────────────────────────
 *
 * `v_stats_partners` يحمل `revenue` و`partner_cost` و`gross_profit`، وهذا
 * القارئ **لا يقرؤها ولا يمرّرها**؛ الأعمدة مسمّاة في `select` واحداً واحداً
 * ونوعُ الإرجاع لا مكان فيها. نفس ما تفعله `readPartnerStats` في
 * `lib/stats/read.ts` ولنفس السبب: ما ليس في النوع لا مسار له إلى JSX.
 * والصافي المالي على هذه الشاشة يبقى مصدرُه `v_partner_settlements` وحده.
 *
 * ── (٣) «لا صفَّ» ليست «صفراً» ────────────────────────────────────────────
 *
 * `v_stats_partners` **لا صفَّ فيه لشريكٍ بلا رحلة واحدة** (بناؤه `join` على
 * تجميع `v_booking_profit`). فغيابُ الصف يعني «لم تُسنَد إليه رحلة بعد» —
 * وهو ما تقوله الشاشة نصاً، لا «٠» عارياً. وتعذُّرُ القراءة (`ready = false`)
 * شيءٌ ثالث يُقال بسببه ولا يُترجَم إلى أصفار.
 *
 * ── (٤) حدود الشهر بمنطقة الموقع لا بـ UTC ────────────────────────────────
 *
 * كلُّ تجميعٍ يوميٍّ في هذا المستودع يقع على منطقة الموقع
 * (`site_time_zone()`). ولو رُشِّحت السلال الشهرية بمنتصف ليل UTC لانزاحت
 * ساعتان أو ثلاث: حجزٌ أُنشئ الواحدة صباحاً بتوقيت القاهرة أول الشهر يُحسب
 * في الشهر السابق. فالحدود هنا **لحظاتُ منتصف ليلٍ محلّي** تُحسب بـ
 * `zonedParts` — نفس الدالة التي تعرض بها كل تواريخ اللوحة.
 */

// ---------------------------------------------------------------------------
// العقد
// ---------------------------------------------------------------------------

/** صفُّ الشريك في `v_stats_partners` — **بلا أي عمود مال** (D-19) */
export type PartnerTotals = {
  /** كل ما أُسند إليه بأي حالة */
  tripsCount: number | null;
  completedCount: number | null;
  offersCount: number | null;
  acceptedCount: number | null;
  /** بمقياس ٠–١٠٠ كما تحسبه القاعدة — `null` حين لا عرض واحد فلا نسبة */
  acceptRate: number | null;
  firstTripAt: string | null;
  lastTripAt: string | null;
};

export type PartnerMetrics = {
  /** هل قُرئ `v_stats_partners` أصلاً؟ `false` = سببٌ يُقال، لا أصفار */
  ready: boolean;
  /** `null` مع `ready` = لا رحلة لهذا الشريك بعد */
  totals: PartnerTotals | null;
  /** المُسنَد إليه ولم يُنفَّذ بعد (`assigned` + `confirmed`) */
  scheduled: number | null;
  cancelled: number | null;
  /** سلسلةٌ شهرية واحدة — `null` حين لا تُقرأ أو حين لا رحلة أصلاً */
  monthly: StatSeries | null;
  /** سلالٌ ناقصة ⇒ لا رسم: ثقبٌ في السلسلة يُقرأ صفراً وهو ليس صفراً */
  monthlyReady: boolean;
  /** حالة اتفاقية الشراكة كما تقولها `admin_agreement_partners()` */
  agreement: PartnerAgreementState | null;
};

export type PartnerAgreementState = {
  accepted: boolean;
  acceptedVersion: number | null;
  acceptedAt: string | null;
  deadline: string | null;
  inGrace: boolean;
  /** لا يمنعه شيء الآن (قَبِل، أو المهلة سارية، أو الحاجز مطفأ) */
  ok: boolean;
};

export const EMPTY_PARTNER_METRICS: PartnerMetrics = {
  ready: false,
  totals: null,
  scheduled: null,
  cancelled: null,
  monthly: null,
  monthlyReady: false,
  agreement: null,
};

// ---------------------------------------------------------------------------
// تقويم السلال الشهرية
// ---------------------------------------------------------------------------

/** أقصى مدى للرسم: سنة. وأدناه ثلاثة أشهر كي لا يصير الرسم نقطةً واحدة. */
const MAX_MONTHS = 12;
const MIN_MONTHS = 3;

const pad2 = (n: number) => (n < 10 ? `0${n}` : String(n));

/**
 * لحظةُ منتصف ليل أول الشهر **بمنطقة الموقع**.
 *
 * الخوارزمية تصحيحٌ تكراري: نبدأ من نفس الجدار الزمني على UTC، نقرأ ما تعنيه
 * تلك اللحظة في منطقة الموقع، ثم نزيح بالفارق. تكرارٌ واحد يكفي إلا حين تقع
 * نقلة توقيتٍ صيفي داخل الإزاحة نفسها — والثاني يغلقها.
 */
function zonedMonthStart(year: number, month: number): Date {
  const want = Date.UTC(year, month - 1, 1, 0, 0, 0);
  let ts = want;
  for (let i = 0; i < 3; i += 1) {
    const p = zonedParts(new Date(ts));
    const got = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
    if (got === want) break;
    ts += want - got;
  }
  return new Date(ts);
}

/** ‏(سنة، شهر) ← نفسها مُزاحةً بعدد أشهر، مُطبَّعة */
function shiftMonth(year: number, month: number, by: number): { year: number; month: number } {
  const zero = year * 12 + (month - 1) + by;
  return { year: Math.floor(zero / 12), month: (zero % 12) + 1 };
}

/**
 * سلالُ الرسم: تنتهي بالشهر الجاري، وتبدأ من شهر **أول رحلة** — بحدٍّ أدنى
 * ثلاثة أشهر وأقصى اثني عشر.
 *
 * ولماذا لا اثنا عشر دائماً؟ لأن كل سلة **نداءُ عدٍّ مستقل** (‏PostgREST هنا
 * بلا دوال تجميع — قيس حيّاً: `PGRST123 Use of aggregate functions is not
 * allowed`)، فشريكٌ انضم هذا الشهر كان سيكلّف اثني عشر نداءً ليُرسم أحدَ عشر
 * شهراً من الأصفار قبل وجوده أصلاً.
 */
function monthBuckets(firstTripAt: string | null): { year: number; month: number; iso: string }[] {
  const now = zonedParts(new Date());
  let span = MIN_MONTHS;

  const firstTs = firstTripAt ? Date.parse(firstTripAt) : Number.NaN;
  if (Number.isFinite(firstTs)) {
    const first = zonedParts(new Date(firstTs));
    span = (now.year - first.year) * 12 + (now.month - first.month) + 1;
  }
  span = Math.min(MAX_MONTHS, Math.max(MIN_MONTHS, span));

  const out: { year: number; month: number; iso: string }[] = [];
  for (let i = span - 1; i >= 0; i -= 1) {
    const { year, month } = shiftMonth(now.year, now.month, -i);
    out.push({ year, month, iso: `${year}-${pad2(month)}-01` });
  }
  return out;
}

// ---------------------------------------------------------------------------
// القراءة
// ---------------------------------------------------------------------------

/** الحالات التي تعني «مُسنَدٌ إليه ولم يُنفَّذ بعد» — كما في `bookings_status_check` */
const OPEN_STATUSES = ["assigned", "confirmed"];

/**
 * عدُّ صفوفٍ **في القاعدة** — `head: true` فلا يعبر صفٌّ واحد الشبكة، والرقم
 * يصل في ترويسة `Content-Range`. و`null` تعني «تعذّر العدّ» لا «صفر».
 */
async function countIn(
  query: PromiseLike<{ count: number | null; error: unknown }>
): Promise<number | null> {
  const res = await query;
  if (res.error) return null;
  return typeof res.count === "number" ? res.count : null;
}

function readTotals(row: Record<string, unknown>): PartnerTotals {
  return {
    tripsCount: asNumber(pick(row, ["trips_count", "tripsCount"])),
    completedCount: asNumber(pick(row, ["completed_count", "completedCount"])),
    offersCount: asNumber(pick(row, ["offers_count", "offersCount"])),
    acceptedCount: asNumber(pick(row, ["accepted_count", "acceptedCount"])),
    acceptRate: asNumber(pick(row, ["accept_rate", "acceptRate"])),
    firstTripAt: asText(pick(row, ["first_trip_at", "firstTripAt"])),
    lastTripAt: asText(pick(row, ["last_trip_at", "lastTripAt"])),
  };
}

/**
 * حالة الاتفاقية — من `admin_agreement_partners()` لا من `partner_agreement_status()`.
 *
 * والسبب صلاحية لا ذوق: الثانية `security definer` **غير ممنوحة لـ
 * `authenticated`** (قيس حيّاً على القاعدة: `proacl` فيها `postgres` و
 * `service_role` فقط)، فنداؤها بجلسة المشرف يُرفض. والأولى ممنوحة ومحروسة
 * بـ`is_admin()` في جسمها، وهي تفوّض إلى الثانية صفاً صفاً — فالحكم واحد
 * ومصدره واحد.
 */
function readAgreement(rows: Record<string, unknown>[], id: string): PartnerAgreementState | null {
  const row = rows.find((r) => asText(pick(r, ["subcontractor_id", "subcontractorId"])) === id);
  if (!row) return null;
  return {
    accepted: row.accepted === true,
    acceptedVersion: asNumber(pick(row, ["accepted_version", "acceptedVersion"])),
    acceptedAt: asText(pick(row, ["accepted_at", "acceptedAt"])),
    deadline: asText(row.deadline),
    inGrace: row.in_grace === true || row.inGrace === true,
    ok: row.ok === true,
  };
}

/**
 * مؤشرات شريكٍ واحد في مرحلتين.
 *
 * المرحلة الأولى تسأل «هل له رحلات أصلاً؟»، والثانية **لا تُنفَّذ إن لم يكن**:
 * لا سلالَ شهرية ولا عدَّ حالات لشريكٍ لم تُسنَد إليه رحلة — الشاشة ستقول
 * «لا رحلة بعد» فلا معنى لنداءاتٍ تُثبت الصفر.
 */
export async function loadPartnerMetrics(
  supabase: SupabaseClient,
  subcontractorId: string
): Promise<PartnerMetrics> {
  const [statsRes, agreementRes] = await Promise.all([
    supabase
      .from("v_stats_partners")
      // 🔒 أعمدةٌ مسمّاة لا `*`: العرض يحمل تكلفةً وهامشاً لا يخرجان من هنا
      .select(
        "trips_count, completed_count, offers_count, accepted_count, accept_rate, first_trip_at, last_trip_at"
      )
      .eq("subcontractor_id", subcontractorId)
      .maybeSingle(),
    supabase.rpc("admin_agreement_partners"),
  ]);

  const agreement = agreementRes.error
    ? null
    : readAgreement((agreementRes.data ?? []) as Record<string, unknown>[], subcontractorId);

  if (statsRes.error) {
    return { ...EMPTY_PARTNER_METRICS, agreement };
  }

  const row = (statsRes.data ?? null) as Record<string, unknown> | null;
  if (!row) {
    // لا صفَّ = لا رحلة واحدة بعد. لا مرحلةَ ثانية، ولا أصفارٌ مُخترعة.
    return { ...EMPTY_PARTNER_METRICS, ready: true, agreement };
  }

  const totals = readTotals(row);

  const [scheduled, cancelled, monthly] = await Promise.all([
    countIn(
      supabase
        .from("v_booking_profit")
        .select("booking_id", { count: "exact", head: true })
        .eq("subcontractor_id", subcontractorId)
        .in("status", OPEN_STATUSES)
    ),
    countIn(
      supabase
        .from("v_booking_profit")
        .select("booking_id", { count: "exact", head: true })
        .eq("subcontractor_id", subcontractorId)
        .eq("status", "cancelled")
    ),
    loadMonthly(supabase, subcontractorId, totals.firstTripAt),
  ]);

  return {
    ready: true,
    totals,
    scheduled,
    cancelled,
    ...monthly,
    agreement,
  };
}

/**
 * السلسلة الشهرية — سلةٌ لكل شهر، وكلُّ سلةٍ عدٌّ مستقل في القاعدة.
 *
 * 🔴 **وسلةٌ واحدة تسقط تُسقط الرسم كله** (`monthlyReady = false`): الثقب في
 * سلسلةٍ زمنية لا يُقرأ ثقباً بل **صفراً**، فيرى المالك شهراً بلا عمل حيث كان
 * عملٌ لم يُقرأ. وهذا بالضبط ما تحرّمه القاعدة ١٥ — «لا نعرف» ليست «صفر».
 */
async function loadMonthly(
  supabase: SupabaseClient,
  subcontractorId: string,
  firstTripAt: string | null
): Promise<{ monthly: StatSeries | null; monthlyReady: boolean }> {
  const buckets = monthBuckets(firstTripAt);

  const counts = await Promise.all(
    buckets.map((bucket) => {
      const next = shiftMonth(bucket.year, bucket.month, 1);
      return countIn(
        supabase
          .from("v_booking_profit")
          .select("booking_id", { count: "exact", head: true })
          .eq("subcontractor_id", subcontractorId)
          .gte("created_at", zonedMonthStart(bucket.year, bucket.month).toISOString())
          .lt("created_at", zonedMonthStart(next.year, next.month).toISOString())
      );
    })
  );

  if (counts.some((value) => value === null)) return { monthly: null, monthlyReady: false };

  return {
    monthly: {
      key: "partner_trips",
      label: "رحلات أُسندت إليه",
      points: buckets.map((bucket, index) => ({ bucket: bucket.iso, value: counts[index] ?? 0 })),
    },
    monthlyReady: true,
  };
}
