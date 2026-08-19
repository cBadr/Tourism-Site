import "server-only";

import { cache } from "react";

import { siteTimeZone } from "@/lib/site-timezone";
import { addDays, isoOf, type StatRange } from "@/lib/stats/range";
import { portalAccess } from "../_lib/session";
import { loadTrips } from "../requests/data";

/**
 * قراءةُ «نبض عملك» في لوحة المتعهد — رحلاتُه وعروضُه على مدى فترةٍ يختارها.
 *
 * ── لماذا وُلد هذا الملف ──────────────────────────────────────────────────
 *
 * شكوى بدر بلفظها: «تلك الصفحة لا تحتوي على رسوم بيانية أو مؤشرات أو مرشحات
 * وغيرها، فجلّ ما أراه هو بطاقات ثابتة لا توحي لأي حيوية ولا تفاعلية». وكان
 * كلُّ رقمٍ في اللوحة **صورةَ لحظة**: أربع بطاقات لقوائم الأسعار وأربعة أرقام
 * حساب — ولا واحدٌ منها يقول للشريك «كيف كان شهرك».
 *
 * ── الحدود الأربعة التي يلتزمها هذا الملف حرفياً ─────────────────────────
 *
 * (١) 🔴 **لا مبلغَ يُجمع هنا ولا يُقسم ولا يُقرَّب** (D-05 و`CONVENTIONS §٢`).
 *     المال الوحيد في اللوحة يصل **جاهزاً بإشارته** من `portal_balance()`،
 *     وتعرضه بطاقة الحساب. وما يُجمَع في هذا الملف **عددُ صفوف** لا غير:
 *     رحلةٌ واحدة = ١، وعرضٌ واحد = ١. ولو أُريد يوماً «مستحقُّ هذه الفترة»
 *     فمكانُ جمعِه Postgres في دالةٍ جديدة (`portal_trip_stats`) لا هنا —
 *     مسجَّلٌ قراراً معلَّقاً لبدر، ولم يُبنَ بلا إذنه لأنه يستلزم هجرة.
 *
 * (٢) 🔴 **D-19: لا سعرَ عميل ولا هامش.** والمصدران بنيويّان لا انضباطيّان،
 *     مقيسان حيّاً بانتحال صفة الشريك (‏`set local role authenticated` +
 *     `request.jwt.claims`) داخل معاملةٍ مُلغاة:
 *       • `portal_trips()` تُرجع `payout` — مستحقَّه هو — ولا عمودَ سعرٍ فيها.
 *       • `trip_offers` أعمدتها عشرة، وليس فيها إلا `payout` كذلك.
 *       • و`public.bookings` يراها الشريك **صفر صف** (RLS) — فما لا يصل لا يُعرض.
 *
 * (٣) **حبيبةُ السلسلة «يوم» لأن البيانات يومية فعلاً** — لا وسمَ أسبوعٍ فوق
 *     نقطةِ يوم (التحذير المكتوب في `lib/stats/range.ts` عند `StatGranularity`).
 *     والتجميعُ بمنطقة الموقع لا بتوقيت الخادم، من نفس الإعداد الذي تقرؤه
 *     `cairoToday()` و`site_time_zone()` — فلا ينزاح يومٌ بين شاشةٍ وأخرى.
 *
 * (٤) **الصفرُ يُقال ولا يُخترع.** فشلُ القراءة ≠ «لا عروض»، و«لا عروض في هذه
 *     الفترة» ≠ «لم يصلك عرضٌ قط». الثلاثة حالاتٌ مسمّاة في النوع أدناه،
 *     وللمكوّن جملةٌ لكلٍّ منها.
 *
 * ── حدٌّ معلَن (القاعدة ١٩: الكاشف يكذب في الاتجاهين) ────────────────────
 *
 * قراءة `trip_offers` تمرّ بـRLS: السياسة `trip_offers_select_own_or_admin`
 * تسمح للشريك بصفوفه، والمنحة `select` قائمة لـ`authenticated` — **مقيسٌ حيّاً
 * 2026-08-19: ٣ `accepted` و٢ `expired` لشريكٍ حقيقيّ**. ولو ضُيّقت السياسة
 * غداً لعادت القراءة **صفر صفٍّ بلا خطأ**، فتقرأ الشاشة «لم يصلك عرض» بدل
 * «تعذّرت القراءة». وهذا هو فخُّ الصفوف الصفرية بعينه، ولا يُغلق من الواجهة:
 * إغلاقُه دالةٌ في القاعدة تُرجع العدَّ وتقول صراحةً إن كانت مسموحة — أي هجرة.
 */

/** حالات العرض كما يفرضها `trip_offers_status_check` في القاعدة الحيّة */
export type OfferStatus = "pending" | "accepted" | "rejected" | "expired" | "revoked";

const OFFER_STATUSES: OfferStatus[] = ["pending", "accepted", "rejected", "expired", "revoked"];

export type OfferTally = Record<OfferStatus, number> & {
  /** كل ما وصله في الفترة */
  total: number;
  /**
   * ما حُسم منها **بفعله أو بصمته**: مقبولٌ + مرفوضٌ + منتهي المهلة.
   *
   * ولماذا يخرج `revoked` و`pending`؟ لأن المسحوب سحبَته المنصة (لا قرار له
   * فيه) والمعلَّق لم يُطلب منه قرارٌ بعد — وإدخالُهما في المقام يجعل نسبته
   * تنخفض بأفعالٍ ليست أفعاله. والبسطُ والمقام كلاهما من `trip_offers` نفسه،
   * فلا يُقسَم جدولٌ مرجعيّ على سجلِّ أحداث (النمط ٨ في `LESSONS.md`).
   */
  decided: number;
};

export type PulsePoint = { bucket: string; trips: number; offers: number };

/** عددُ الرحلات لكل حالةِ حجزٍ **موجودةٍ فعلاً** — لا قائمةَ حالاتٍ مكتوبة بيد */
export type TripStatusCount = { status: string; count: number };

export type PortalPulse =
  | { state: "unavailable" }
  | {
      state: "ready";
      range: StatRange;
      /** رحلات **النافذة** كلها قبل مرشّح الحالة */
      tripsInRange: number;
      /** رحلات النافذة بعد المرشّح — وهي ما يرسمه المخطط، ومجموعُ خطِّه بالضبط */
      tripsShown: number;
      /** كل رحلاته على الإطلاق — تفرّق الشريك «الجديد» عن «الهادئ في هذه الفترة» */
      tripsEver: number;
      byStatus: TripStatusCount[];
      offers: OfferTally;
      /** `false` ⇒ ردّت القاعدة خطأً؛ لا يُقال حينها «صفر عروض» */
      offersRead: boolean;
      /** بلغت القراءة سقفها ⇒ الأرقام حدٌّ أدنى لا مجموع */
      offersTruncated: boolean;
      /**
       * هل وصله عرضٌ **قط**، داخل الفترة أو خارجها؟
       *
       * ⚠ ولماذا سؤالٌ مستقل بنداءٍ مستقل: «لم يصلك عرضٌ بعد» و«لا نشاط في هذه
       * الفترة» جملتان لا يجوز الخلط بينهما، والفرقُ بينهما **لا يُقرأ من عدّ
       * الفترة**. شريكٌ عملَ في يونيو ويقرأ آخرَ ثلاثين يوماً كان سيُقال له
       * «لم يصلك عرضٌ بعد» وهو كاذبٌ في وجهه.
       */
      offersEver: boolean;
      /**
       * قُصَّت النافذة عند `MAX_WINDOW_DAYS` لأن الرابط طلب أطولَ منها.
       * يُقال للشريك صراحةً — نافذةٌ أضيق مما طُلب بلا إخبارٍ رقمٌ ناقصٌ بلا سبب.
       */
      windowClamped: boolean;
      /** أول يومٍ في النافذة فعلاً — يساوي `range.from` ما لم تُقصَّ */
      windowFrom: string;
      points: PulsePoint[];
    };

/** سقفُ قراءةٍ واحدة — الفترة القصوى ٤٠٠ يوماً، فهذا فائضٌ لا حدٌّ عملي */
const OFFERS_LIMIT = 5000;

/**
 * مُنسّقُ اليوم بمنطقة الموقع. يُبنى مرّة لكل قراءة لا لكل صف — بناءُ
 * `Intl.DateTimeFormat` أغلى نداءٍ في هذا الملف، وتكراره لكل صفٍّ يجعل قراءةَ
 * ٩٠ يوماً تبني آلافَ المنسِّقات بلا فائدة.
 *
 * والسقوط إلى UTC عند غياب بيانات المناطق (بيئاتُ تشغيلٍ مقلَّمة) هو نفس ما
 * تفعله `cairoToday()` — انزياحُ ساعاتٍ أهون من انهيار الشاشة.
 */
function siteDayFormatter(): Intl.DateTimeFormat | null {
  try {
    return new Intl.DateTimeFormat("en-US", {
      timeZone: siteTimeZone(),
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    });
  } catch {
    return null;
  }
}

/** طابعٌ زمنيّ ⇒ يومُه بمنطقة الموقع (`YYYY-MM-DD`)، و`null` لما لا يُقرأ */
function siteDay(value: string | null | undefined, fmt: Intl.DateTimeFormat | null): string | null {
  if (!value) return null;
  const at = Date.parse(value);
  if (!Number.isFinite(at)) return null;
  const date = new Date(at);
  if (!fmt) {
    return isoOf(date.getUTCFullYear(), date.getUTCMonth() + 1, date.getUTCDate());
  }
  const parts = fmt.formatToParts(date);
  const read = (type: string) => Number(parts.find((p) => p.type === type)?.value ?? "0");
  return isoOf(read("year"), read("month"), read("day"));
}

/**
 * سقفُ النافذة بالأيام. و`resolveStatRange` **لا تقصر شيئاً**: تقبل أي
 * `?from=&to=` يكتبه الزائر في الرابط، والقصرُ في القاعدة (`section_stats`)
 * لا يمرّ بنا هنا. فبلا هذا السقف يطلب رابطٌ واحدٌ ثلاثةَ آلاف نقطة.
 */
const MAX_WINDOW_DAYS = 400;

/**
 * أيام النافذة بترتيبها — **مصدرُ الحقيقة الوحيد للعضوية والرسم معاً**.
 *
 * ⚠ ولماذا مجموعةٌ واحدة لا شرطان: لو رُسم المخطط على ٤٠٠ يومٍ بينما تُعدّ
 * البطاقةُ رحلاتِ الفترة كاملةً، لصار مجموعُ الخط أقلَّ من الرقم فوقه — رقمان
 * لشيءٍ واحد في شاشةٍ واحدة (النمط ٨ في `LESSONS.md`). فالعضوية `daySet.has`
 * والرسمُ من الترتيب نفسه، فلا ينفصلان بحال.
 *
 * والقصُّ **من الطرف الأقدم**: يُبقي الأحدثَ وهو ما يُنظر إليه.
 */
function windowDays(range: StatRange): { days: string[]; from: string; clamped: boolean } {
  const clamped = range.days > MAX_WINDOW_DAYS;
  const from = clamped ? addDays(range.to, -(MAX_WINDOW_DAYS - 1)) : range.from;
  const days: string[] = [];
  let cursor = from;
  for (let i = 0; i < MAX_WINDOW_DAYS && cursor <= range.to; i += 1) {
    days.push(cursor);
    cursor = addDays(cursor, 1);
  }
  return { days, from, clamped };
}

const asOfferStatus = (value: unknown): OfferStatus | null =>
  typeof value === "string" && (OFFER_STATUSES as string[]).includes(value)
    ? (value as OfferStatus)
    : null;

/**
 * نبضُ الفترة. **الحارس الضيّق `portalAccess()`** لا حارس التجهيز: هذه قراءةٌ
 * تشغيلية، والمدعوُّ الذي لم يُعتمد بعد لا رحلةَ له ولا عرض — فيقع `unavailable`
 * ويقرأ في المعالج ما ينقصه، لا رسماً فارغاً يوهمه بأن شيئاً تعطّل.
 */
export const loadPortalPulse = cache(async (
  range: StatRange,
  /**
   * مرشّحُ الحالة — `"all"` أو قيمةُ `bookings.status` كما وصلت من القاعدة.
   * ولا قائمةَ حالاتٍ مسموحة مكتوبة هنا: ما لا يطابق شيئاً يُخرج صفراً ظاهراً
   * في الشاشة مع رقائقَ تعرض الموجود فعلاً، وهو أوضح من رفضٍ صامت.
   */
  status: string = "all"
): Promise<PortalPulse> => {
  const access = await portalAccess();
  if (!access.ok) return { state: "unavailable" };

  const fmt = siteDayFormatter();
  const window = windowDays(range);
  const daySet = new Set(window.days);
  const inWindow = (day: string | null): day is string => day !== null && daySet.has(day);

  /* (١) الرحلات — من نفس الدالة المذاكَرة التي تخدم «رحلاتي» وصندوق الطلبات،
        فلا نداءَ ثانٍ ولا مصدرَ حقيقةٍ ثانٍ لعدد رحلاته. */
  const trips = await loadTrips();

  /* موعدُ الانطلاق هو تاريخُ الرحلة في ذهن الشريك؛ ولحظةُ الإسناد بديلٌ حين لا
     موعد — وهو ما يقع لحجزٍ لم يُحدَّد موعده بعد. والجملة مكتوبة في تلميح
     البطاقة كي لا يُفاجَأ أحد بأن رحلةً وقعت في يومٍ غير الذي يتذكّره. */
  const tripDays = trips.trips.map((trip) => ({
    day: siteDay(trip.pickupAt ?? trip.assignedAt, fmt),
    status: trip.status ?? "assigned",
  }));

  const withinTrips = tripDays.filter((row) => inWindow(row.day));

  const statusMap = new Map<string, number>();
  for (const row of withinTrips) statusMap.set(row.status, (statusMap.get(row.status) ?? 0) + 1);
  const byStatus = [...statusMap.entries()]
    .map(([status, count]) => ({ status, count }))
    .sort((a, b) => b.count - a.count || a.status.localeCompare(b.status));

  /* (٢) العروض — صفوفُه هو وحده بـRLS، وشرطُ `subcontractor_id` مكتوبٌ فوقها
        حزاماً ثانياً (نفس قاعدة `requests/data.ts`): الشرط يجعل النية مقروءة،
        وRLS تبقى ما لا يُتجاوَز. والنافذة أوسع بيومٍ من كل طرف لأن الحدَّ هنا
        بتوقيت UTC والتصنيفُ بمنطقة الموقع — والعضويةُ تُحسم بعد ذلك بالسلة. */
  const lower = `${addDays(window.from, -1)}T00:00:00.000Z`;
  const upper = `${addDays(range.to, 2)}T00:00:00.000Z`;

  const [offersRes, everRes] = await Promise.all([
    access.supabase
      .from("trip_offers")
      .select("status, created_at")
      .eq("subcontractor_id", access.sub.id)
      .gte("created_at", lower)
      .lt("created_at", upper)
      .limit(OFFERS_LIMIT),
    // صفٌّ واحد يكفي جواباً عن «هل وصلك عرضٌ قط؟» — بلا ترتيبٍ وبلا عدٍّ كامل
    access.supabase
      .from("trip_offers")
      .select("id")
      .eq("subcontractor_id", access.sub.id)
      .limit(1),
  ]);

  const offersRead = !offersRes.error;
  const offersEver = !everRes.error && Array.isArray(everRes.data) && everRes.data.length > 0;
  const offerRows = Array.isArray(offersRes.data) ? offersRes.data : [];
  const offersTruncated = offerRows.length >= OFFERS_LIMIT;

  const offers: OfferTally = {
    pending: 0,
    accepted: 0,
    rejected: 0,
    expired: 0,
    revoked: 0,
    total: 0,
    decided: 0,
  };

  const offerDays: string[] = [];
  for (const row of offerRows) {
    const day = siteDay(typeof row.created_at === "string" ? row.created_at : null, fmt);
    if (!inWindow(day)) continue;
    const status = asOfferStatus(row.status);
    if (!status) continue;
    offers[status] += 1;
    offers.total += 1;
    if (status !== "pending" && status !== "revoked") offers.decided += 1;
    offerDays.push(day);
  }

  /* (٣) السلاسل — يومٌ لكل يومٍ في الفترة، والخالي صفرٌ صريح لا فجوة.
        ومرشّحُ الحالة يقع على **خطّ الرحلات وحده**: العروض تصل قبل أن تكون
        للرحلة حالةٌ أصلاً، فتصفيتُها بحالة حجزٍ لاحقة تخلط زمنين. */
  const shown = status === "all" ? withinTrips : withinTrips.filter((row) => row.status === status);

  const tripPerDay = new Map<string, number>();
  for (const row of shown) {
    tripPerDay.set(row.day as string, (tripPerDay.get(row.day as string) ?? 0) + 1);
  }
  const offerPerDay = new Map<string, number>();
  for (const day of offerDays) offerPerDay.set(day, (offerPerDay.get(day) ?? 0) + 1);

  const points = window.days.map((bucket) => ({
    bucket,
    trips: tripPerDay.get(bucket) ?? 0,
    offers: offerPerDay.get(bucket) ?? 0,
  }));

  return {
    state: "ready",
    range,
    tripsInRange: withinTrips.length,
    tripsShown: shown.length,
    tripsEver: trips.trips.length,
    byStatus,
    offers,
    offersRead,
    offersTruncated,
    offersEver,
    windowClamped: window.clamped,
    windowFrom: window.from,
    points,
  };
});
