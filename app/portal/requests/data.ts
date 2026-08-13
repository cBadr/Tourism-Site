import "server-only";

import { cache } from "react";

import { isSchemaMissing, portalAccess } from "../_lib/session";

/**
 * قراءات البث في البورتال — المصدر الوحيد لصندوق «طلبات واردة» ولشاشة «رحلاتي»
 * ولشارة العدّاد في التنقل.
 *
 * لماذا دالتا Postgres حصراً (`portal_offers` و`portal_trips`) ولا استعلام جدول؟
 * لأن حدّ الخصوصية في هذه المرحلة **بنيوي لا انضباطي**: العرض قبل القبول لا يحمل
 * اسم العميل ولا رقمه ولا عنوانه الدقيق، والمستحق المعروض مستحق هذا المتعهد وحده
 * دون سعر العميل ودون تكلفة منافسيه. الدالتان تُرجعان هذا القدر فقط، فتسريب ما
 * وراءه مستحيل من هنا مهما أخطأت الواجهة.
 *
 * شارة العدّاد تُشتق من نفس نتيجة `portal_offers()` المذاكَرة بـ `cache()`: نداء
 * واحد لكل طلب يخدم الغلاف والصفحة معاً. وتعمّدنا ترك عدّ `head` على `trip_offers`
 * لأن الجدول قد لا يمنح المتعهد `select` أصلاً، فيعود العدّ صفراً **بلا خطأ** —
 * وهو فخ الصفوف الصفرية نفسه في ثوب عدّاد.
 *
 * `ready = false` تعني «هجرة 0013 غير منفَّذة بعد» لا «فشل»: الشاشة تشرح حينها
 * الخطوة الناقصة بدل صندوق فارغ يوهم المتعهد بأن لا عروض له.
 */

/** ما يراه المتعهد قبل القبول — مطابق لـ `OfferPreview` في lib/dispatch-types.ts */
export type PortalOffer = {
  offerId: string;
  reference: string;
  originLabel: string;
  destLabel: string;
  distanceKm: number;
  passengers: number;
  roundTrip: boolean;
  waitingHours: number;
  classTitle: string;
  pickupAt: string | null;
  /** مستحق هذا المتعهد — لا سعر العميل ولا هامش المنصة */
  payout: number;
  /** العملة من لقطة الحجز؛ null ⇒ يُعرض الرقم مجرداً بلا وحدة مكتوبة في الكود */
  currency: string | null;
  expiresAt: string | null;
  notes: string | null;
};

/** ما يُضاف بعد الإسناد — بيانات التنفيذ (`AssignedTripDetails`) */
export type PortalTrip = PortalOffer & {
  customerName: string | null;
  customerPhone: string | null;
  customerWhatsapp: string | null;
  /** حالة الحجز كما تعيدها الدالة إن أعادتها — الغياب يعني «مُسندة» ضمناً */
  status: string | null;
  assignedAt: string | null;
};

/**
 * `ready = false` ⇒ الهجرة غير منفَّذة (حالة عرض تشرح الخطوة الناقصة).
 * `failed = true` ⇒ الدالة موجودة لكن النداء فشل (صلاحية أو عطل) — وهذه **لا**
 * تُعرض قائمةً فارغة أبداً: «لا عروض لك» و«تعذر قراءة عروضك» جملتان لا يجوز
 * الخلط بينهما على شاشة يعيش صاحبها من هذه العروض.
 * `now` = قراءة ساعة الخادم لحظة القراءة، تُعاد مع البيانات ولا تُقرأ في التصيير:
 * `Date.now()` داخل مكوّن يجعل ناتجه متغيراً بين تصييرين متطابقين، فيُمرَّر الزمن
 * مُدخلاً كبقية البيانات.
 */
export type OffersResult = {
  offers: PortalOffer[];
  ready: boolean;
  failed: boolean;
  now: number;
};

export type TripsResult = {
  trips: PortalTrip[];
  ready: boolean;
  failed: boolean;
  now: number;
};

/* ------------------------------------------------------------------ */
/* قراءة صفوف مجهولة البنية                                             */
/* ------------------------------------------------------------------ */

/**
 * الجداول والدوال يملكها وكيل SQL، وقد يعيد PostgREST الأسماء بصيغة snake_case
 * أو camelCase حسب توقيع الدالة — فنقرأ بأول اسم موجود بدل التعلق باسم واحد.
 */
function pick(row: Record<string, unknown>, names: string[]): unknown {
  for (const name of names) {
    const value = row[name];
    if (value !== undefined && value !== null) return value;
  }
  return undefined;
}

const asText = (v: unknown): string | null =>
  typeof v === "string" && v.trim() !== "" ? v.trim() : null;

/** numeric في Postgres يصل نصاً عبر PostgREST — التحويل هنا عرضٌ لا حساب */
function asNumber(v: unknown): number {
  const n = typeof v === "number" ? v : typeof v === "string" ? Number(v) : NaN;
  return Number.isFinite(n) ? n : 0;
}

function asBool(v: unknown): boolean {
  if (typeof v === "boolean") return v;
  if (typeof v === "string") return v === "true" || v === "t" || v === "1";
  return v === 1;
}

function toOffer(row: Record<string, unknown>): PortalOffer | null {
  const offerId = asText(pick(row, ["offer_id", "offerId", "id"]));
  if (!offerId) return null;

  return {
    offerId,
    reference: asText(pick(row, ["reference", "booking_reference", "bookingReference"])) ?? "",
    originLabel: asText(pick(row, ["origin_label", "originLabel"])) ?? "",
    destLabel: asText(pick(row, ["dest_label", "destLabel", "destination_label"])) ?? "",
    distanceKm: asNumber(pick(row, ["distance_km", "distanceKm"])),
    passengers: Math.max(0, Math.round(asNumber(pick(row, ["passengers"])))),
    roundTrip: asBool(pick(row, ["round_trip", "roundTrip"])),
    waitingHours: asNumber(pick(row, ["waiting_hours", "waitingHours"])),
    classTitle: asText(pick(row, ["class_title", "classTitle", "class_slug"])) ?? "",
    pickupAt: asText(pick(row, ["pickup_at", "pickupAt"])),
    payout: asNumber(pick(row, ["payout", "payout_amount", "payoutAmount"])),
    currency: asText(pick(row, ["currency"])),
    expiresAt: asText(pick(row, ["expires_at", "expiresAt"])),
    notes: asText(pick(row, ["notes", "note"])),
  };
}

function toTrip(row: Record<string, unknown>): PortalTrip | null {
  const base = toOffer(row);
  if (!base) {
    // الرحلة المُسندة قد لا تحمل معرّف عرض أصلاً (إسناد يدوي) — المرجع يكفي مفتاحاً
    const reference = asText(pick(row, ["reference", "booking_reference"]));
    const fallbackId = asText(pick(row, ["booking_id", "bookingId", "trip_id", "id"]));
    if (!reference && !fallbackId) return null;

    const patched = toOffer({ ...row, offer_id: fallbackId ?? `ref:${reference}` });
    if (!patched) return null;
    return withContact(patched, row);
  }
  return withContact(base, row);
}

function withContact(base: PortalOffer, row: Record<string, unknown>): PortalTrip {
  return {
    ...base,
    customerName: asText(pick(row, ["customer_name", "customerName"])),
    customerPhone: asText(pick(row, ["customer_phone", "customerPhone"])),
    customerWhatsapp: asText(pick(row, ["customer_whatsapp", "customerWhatsapp"])),
    status: asText(pick(row, ["status", "booking_status", "bookingStatus", "trip_status"])),
    assignedAt: asText(pick(row, ["assigned_at", "assignedAt"])),
  };
}

const rowsOf = (data: unknown): Record<string, unknown>[] => {
  const list = Array.isArray(data) ? data : data ? [data] : [];
  return list.filter((row): row is Record<string, unknown> => typeof row === "object" && row !== null);
};

/* ------------------------------------------------------------------ */
/* القراءات                                                            */
/* ------------------------------------------------------------------ */

/**
 * المهلة سارية: بلا تاريخ انتهاء (احتياط) أو لم تنتهِ بعد بتوقيت الخادم.
 * `at` إلزامية — الزمن يُمرَّر ولا يُقرأ ضمناً حتى تبقى الدالة نقية.
 */
export function isLiveOffer(offer: PortalOffer, at: number): boolean {
  if (!offer.expiresAt) return true;
  const deadline = Date.parse(offer.expiresAt);
  return !Number.isFinite(deadline) || deadline > at;
}

/**
 * عروض المتعهد الحالي. مُذاكَرة لكل طلب: الغلاف (الشارة) والصفحة يتشاركان النداء.
 * الترتيب بأقرب مهلة أولاً — الأعجل قراراً يتصدر الصندوق.
 */
export const loadOffers = cache(async (): Promise<OffersResult> => {
  const now = Date.now();
  const access = await portalAccess();
  if (!access.ok) {
    return { offers: [], ready: access.code !== "schema", failed: false, now };
  }

  const res = await access.supabase.rpc("portal_offers");
  if (res.error) {
    const missing = isSchemaMissing(res.error);
    return { offers: [], ready: !missing, failed: !missing, now };
  }

  const offers = rowsOf(res.data)
    .map(toOffer)
    .filter((offer): offer is PortalOffer => offer !== null)
    .sort((a, b) => {
      const left = a.expiresAt ? Date.parse(a.expiresAt) : Number.MAX_SAFE_INTEGER;
      const right = b.expiresAt ? Date.parse(b.expiresAt) : Number.MAX_SAFE_INTEGER;
      return left - right;
    });

  return { offers, ready: true, failed: false, now };
});

/** عدّاد الشارة — العروض المفتوحة التي لم تنتهِ مهلتها بعد */
export const countLiveOffers = cache(async (): Promise<number> => {
  const { offers, now } = await loadOffers();
  return offers.filter((offer) => isLiveOffer(offer, now)).length;
});

/** الرحلات المُسندة إلى المتعهد الحالي — القادم أولاً ثم المنفَّذ من الأحدث */
export const loadTrips = cache(async (): Promise<TripsResult> => {
  const now = Date.now();
  const access = await portalAccess();
  if (!access.ok) {
    return { trips: [], ready: access.code !== "schema", failed: false, now };
  }

  const res = await access.supabase.rpc("portal_trips");
  if (res.error) {
    const missing = isSchemaMissing(res.error);
    return { trips: [], ready: !missing, failed: !missing, now };
  }

  const trips = rowsOf(res.data)
    .map(toTrip)
    .filter((trip): trip is PortalTrip => trip !== null);

  return { trips, ready: true, failed: false, now };
});

/** رحلة «قادمة» ما لم يمضِ موعد انطلاقها؛ وبلا موعد تبقى قادمة لأنها تنتظر ترتيباً */
export function isUpcoming(trip: PortalTrip, at: number): boolean {
  if (trip.status === "completed" || trip.status === "cancelled") return false;
  if (!trip.pickupAt) return true;
  const pickup = Date.parse(trip.pickupAt);
  return !Number.isFinite(pickup) || pickup >= at;
}

/** فصل الرحلات إلى قادمة (بالأقرب موعداً) وسابقة (بالأحدث) */
export function splitTrips(trips: PortalTrip[], at: number) {
  const upcoming: PortalTrip[] = [];
  const past: PortalTrip[] = [];
  for (const trip of trips) (isUpcoming(trip, at) ? upcoming : past).push(trip);

  const time = (value: string | null, fallback: number) => {
    if (!value) return fallback;
    const parsed = Date.parse(value);
    return Number.isFinite(parsed) ? parsed : fallback;
  };

  upcoming.sort(
    (a, b) => time(a.pickupAt, Number.MAX_SAFE_INTEGER) - time(b.pickupAt, Number.MAX_SAFE_INTEGER)
  );
  past.sort((a, b) => time(b.pickupAt, 0) - time(a.pickupAt, 0));

  return { upcoming, past };
}
