import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { signDriverDocs } from "@/lib/drivers/documents";
import { isUpcoming, loadTrips } from "../requests/data";
import { isSchemaMissing } from "../_lib/session";

/**
 * قراءة سجلّ سائقي المتعهد — العقدان الملزمان `lib/crew-types.ts` (الطاقم)
 * و`lib/driver-docs-types.ts` (الصورة والرخصة).
 *
 * ⚠ السجلّ **ملك الشريك لا المنصة**: «قسم السائقين أُلغي بقرار بدر (2026-08-11)
 * — لا إدارة سائقين مباشرين إطلاقاً». فما هنا نظير `loadVehicles` حرفاً بحرف —
 * صفوف المتعهد وحده، مقيَّدة بـ`subcontractor_id` صراحةً فوق RLS (حزامان لا
 * حزام واحد).
 *
 * ── 🔒 وما تغيّر مع 0120: الصورة والرخصة صارتا تُقرآن — ومساراهما لا تخرجان ──
 *
 * كان `photo_path` **لا يُقرأ عمداً** لأن الرفع كان مؤجَّلاً بقرارٍ مكتوب في
 * ترويسة `0040` (دلو `media` عام، وصورة السائق بيانات طرفٍ ثالث). وقد شُحن الدلو
 * الخاص، فصار يُقرأ — **لكن المسار الخام لا يصل المتصفح**: تُحوَّل المسارات هنا
 * إلى **روابط موقَّعة عمرها دقيقة**، والمسار نفسه يبقى على الخادم.
 *
 * 🔒 **والتوقيع بجلسة الشريك نفسها لا بمفتاح الخدمة**: السياسة
 * `driver_docs_select_own_or_admin` هي التي تسمح، فلو نادى شريكٌ هذه الشاشة على
 * سائق غيره لَما وقّعت القاعدة له رابطاً. ولو وقّعنا بمفتاح الخدمة لصار الحارس
 * شرطَ `.eq()` في هذا الملف — وهو ما لا يشهد عليه اختبار.
 *
 * `ready = false` تعني «هجرة 0040 غير منفَّذة» لا «فشل» — والفرق يُقرأ على الشاشة.
 */

export type PortalDriver = {
  id: string;
  name: string;
  phone: string;
  /** رقم الرخصة — سجلّ دائم بين الشريك والإدارة، ولا يصل العميل إطلاقاً */
  licenseNo: string | null;
  /** تاريخ انتهاء الرخصة — سجلّ دائم كذلك، ولا يُحذف مع الصورة */
  licenseExpiry: string | null;
  /** وثّقتها الإدارة في هذا التاريخ — `null` تعني «لم تُراجَع» لا «مرفوضة» */
  licenseVerifiedAt: string | null;
  /** متى حُذفت الصور بانقضاء المدة — يُعرض كي لا يُقرأ غيابها عطلاً */
  docsPurgedAt: string | null;
  /** رابطٌ موقَّت لصورة السائق — `null` = لا صورة، أو تعذّر التوقيع */
  photoUrl: string | null;
  /** رابطٌ موقَّت لصورة الرخصة */
  licenseUrl: string | null;
  /** هل يوجد ملفٌّ مرفوع أصلاً؟ يفصل «لا صورة» عن «صورةٌ تعذّر توقيعها» */
  hasPhoto: boolean;
  hasLicensePhoto: boolean;
  active: boolean;
};

export const DRIVER_COLUMNS =
  "id, name, phone, license_no, license_expiry, license_verified_at, docs_purged_at, photo_path, license_photo_path, active";

const asText = (v: unknown): string | null =>
  typeof v === "string" && v.trim() !== "" ? v.trim() : null;

export async function loadDrivers(
  supabase: SupabaseClient,
  subcontractorId: string
): Promise<{ drivers: PortalDriver[]; ready: boolean }> {
  const res = await supabase
    .from("subcontractor_drivers")
    .select(DRIVER_COLUMNS)
    .eq("subcontractor_id", subcontractorId)
    // العاملون أولاً: من يُسنَد إليه اليوم يتصدّر، والموقوف يبقى مقروءاً أسفله
    .order("active", { ascending: false })
    .order("name", { ascending: true });

  if (res.error) return { drivers: [], ready: !isSchemaMissing(res.error) };

  const rows = (res.data ?? []).map((row) => row as Record<string, unknown>);

  // توقيعٌ واحد لكل المسارات — البديل نداء لكل صورة، وشريكٌ بعشرين سائقاً
  // يدفع أربعين رحلة شبكة في كل فتحة للصفحة.
  const links = await signDriverDocs(
    supabase,
    rows.flatMap((r) => [asText(r.photo_path), asText(r.license_photo_path)])
  );

  const drivers = rows.map((r) => {
    const photoPath = asText(r.photo_path);
    const licensePath = asText(r.license_photo_path);
    return {
      id: String(r.id),
      name: asText(r.name) ?? "",
      phone: asText(r.phone) ?? "",
      licenseNo: asText(r.license_no),
      licenseExpiry: asText(r.license_expiry),
      licenseVerifiedAt: asText(r.license_verified_at),
      docsPurgedAt: asText(r.docs_purged_at),
      photoUrl: photoPath ? (links.get(photoPath) ?? null) : null,
      licenseUrl: licensePath ? (links.get(licensePath) ?? null) : null,
      hasPhoto: Boolean(photoPath),
      hasLicensePhoto: Boolean(licensePath),
      active: r.active === true,
    };
  });

  return { drivers, ready: true };
}

/* ------------------------------------------------------------------ */
/* تقارير رحلات السائقين — جردٌ لما هو موجودٌ فعلاً، لا ما نتمنّاه         */
/* ------------------------------------------------------------------ */

/**
 * ملاحظة بدر: «تبدأ الصفحة بعرض السائقين **وتقارير الرحلات لكل سائق**».
 *
 * ══════════════════════════════════════════════════════════════════════════
 *  🔴 جردُ ما يربط رحلةً بسائق — قبل أن نَعِد بشيء
 * ══════════════════════════════════════════════════════════════════════════
 *
 * الربطُ في القاعدة **عمودٌ واحد لا غير**: `dispatches.assigned_driver_id`
 * (‏يكتبه `set_trip_crew` حين يسجّل الشريك طاقم الرحلة، أو `admin_set_trip_crew`
 * نيابةً عنه). ولا عمود سائقٍ في `bookings` إطلاقاً — قِيس بالكتالوج لا بالظنّ:
 * كل أعمدة `public` التي تحمل «driver» هي هذا العمود و`trip_settings.driver_phone_lead_minutes`.
 *
 * فالتقرير الممكن **بلا هجرة** هو: رحلاتُ الشريك المُسنَدة إليه، مقسومةً على من
 * سجّله سائقاً لها. وما لا يوجد لا يُختلق:
 *
 * | ليس عندنا | فلا نَعِد به |
 * |---|---|
 * | زمنُ بدءٍ أو انتهاءٍ فعليّ للرحلة | لا «ساعات قيادة» ولا «التزامٌ بالمواعيد» |
 * | تقييمٌ للسائق من العميل | لا نجوم ولا معدّلات |
 * | مسافةٌ نفّذها السائق | `distanceKm` تقديرُ المسار لا عدّادُ السيارة |
 *
 * ⚠ **ولا مبلغَ في هذا التقرير**: `portal_trips()` تحمل `payout` وهو مستحقُّ
 *   الشريك لا مستحقُّ السائق، وجمعُه «لكل سائق» يخترع رقماً ماليّاً لا مصدر له
 *   (‏والجمع المالي في TypeScript ممنوع أصلاً). فالعدُّ عدُّ رحلاتٍ لا مال.
 *
 * 🔒 والمصدر `portal_trips()` وحدها — دالةٌ `security definer` تفرض
 * `assigned_subcontractor_id = current_subcontractor_id()` بنفسها، فلا يبلغ
 * شريكٌ رحلةَ غيره ولو مرّر معرّفاً.
 */
export type DriverTripStats = {
  total: number;
  upcoming: number;
  completed: number;
  /** ملغاة أو متعثّرة — تُعرض مجموعةً لأنهما «لم تُنفَّذ» عند الشريك */
  troubled: number;
  last: {
    reference: string;
    originLabel: string;
    destLabel: string;
    pickupAt: string | null;
  } | null;
};

export type DriverTripsReport = {
  byDriver: Map<string, DriverTripStats>;
  /** رحلاتٌ مُسنَدة إليك ولم تُسجّل لها سائقاً — تُقال ولا تُخفى */
  withoutDriver: number;
  /**
   * هل يصل ربطُ السائق من الخادم أصلاً؟ `crew = null` في العقد تعني **«لا نعرف»**
   * لا «لم يُسجَّل» — والفرق هو الفرق بين «لا رحلات لهذا السائق» و«الربط غير
   * مقروء»، وكلتاهما جملة تُقال في موضعها وحدها.
   */
  linkReadable: boolean;
  /** الدالة غير منشورة على الخادم بعد */
  ready: boolean;
  /** الدالة موجودة والنداء فشل — لا تُعرض «لا رحلات» أبداً في هذه الحالة */
  failed: boolean;
};

const EMPTY_STATS = (): DriverTripStats => ({
  total: 0,
  upcoming: 0,
  completed: 0,
  troubled: 0,
  last: null,
});

const at = (value: string | null): number => {
  if (!value) return 0;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

export async function loadDriverTripsReport(): Promise<DriverTripsReport> {
  // 🔴 نفس القارئ الذي تستعمله شاشة الرحلات (‏القاعدة ١٢) — لا نداءَ ثانٍ
  // لـ`portal_trips` ولا تعريفَ ثانٍ لـ«رحلةٌ قادمة».
  const { trips, ready, failed, now } = await loadTrips();

  const byDriver = new Map<string, DriverTripStats>();
  let withoutDriver = 0;
  let known = 0;

  for (const trip of trips) {
    if (trip.crew !== null) known += 1;
    const driverId = trip.crew?.driverId ?? null;
    if (!driverId) {
      withoutDriver += 1;
      continue;
    }

    const stats = byDriver.get(driverId) ?? EMPTY_STATS();
    stats.total += 1;
    if (trip.status === "completed") stats.completed += 1;
    else if (trip.status === "cancelled" || trip.status === "failed") stats.troubled += 1;
    else if (isUpcoming(trip, now)) stats.upcoming += 1;

    if (stats.last === null || at(trip.pickupAt) > at(stats.last.pickupAt)) {
      stats.last = {
        reference: trip.reference,
        originLabel: trip.originLabel,
        destLabel: trip.destLabel,
        pickupAt: trip.pickupAt,
      };
    }
    byDriver.set(driverId, stats);
  }

  return {
    byDriver,
    withoutDriver,
    // لا رحلات أصلاً ⇒ لا شيء يكذب: الربط «مقروء» حتى يثبت العكس بصفٍّ واحد
    linkReadable: trips.length === 0 || known > 0,
    ready,
    failed,
  };
}
