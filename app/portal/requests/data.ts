import "server-only";

import { cache } from "react";

import { MAX_PLACE_LABEL_LENGTH, MAX_TRIP_STOPS, sanitizeLine } from "@/lib/booking-types";
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
  /**
   * ══════════════════════════════════════════════════════════════════════════
   *  المحطات الوسطى — **وسومٌ بالترتيب، ولا إحداثيَّ واحد** (هجرة `0140`)
   * ══════════════════════════════════════════════════════════════════════════
   *
   * 🔴 **ولماذا `string[]` لا `TripStop[]`؟** لأن `portal_offers()` تُرجع
   * `[{"label": …}]` **بلا `lat` ولا `lng` في الكائن أصلاً** — مقيسٌ حيّاً
   * بـ`pg_get_functiondef(public.trip_stops_public)`: الدالة تبني الكائن
   * بـ`jsonb_build_object('label', …)` وحده. فنوعٌ يحمل إحداثيات هنا يَعِد
   * الواجهةَ بما لا يصلها، ويفتح البابَ لأن يُملأ الفراغُ يوماً من مكانٍ آخر —
   * وهو نقضُ **D-19** في صورةِ نوع. الاسمُ نفسه يقول الحدَّ فلا يُنسى.
   *
   * 🔴 **وغيابُ الوسم لا يُسقط المحطة.** `dispatch_public_label` قد تُرجع `null`
   * لوسمٍ كلُّ مقاطعه مرقَّمة، وحينها يبقى في المصفوفة نصٌّ فارغ تعرضه الشاشة
   * «محطة بلا اسم» — لأن **المحطة موجودةٌ في الطريق حتى لو غاب اسمها**، وحذفُها
   * يُري المتعهدَ مساراً أقصر مما سيقوده. (نفس حكم `readTripStops` حرفاً.)
   *
   * ⚠ **ولماذا حقلٌ واحد للعرضين؟** `portal_trips()` تُرجع `trip_stops_full`
   * بإحداثياتها بعد الإسناد، لكن الشاشة لا ترسم بها شيئاً: الخريطةُ والملاحةُ
   * تُبنيان في الخادم من `bookingId` بعد حارسٍ مستقل (`TripMap`). فنقلُ
   * الإحداثيات إلى حمولة الصفحة كان توسيعاً بلا مستهلك — وهو ما ترفضه القاعدة
   * الأم في §د من `DECISIONS.md`.
   */
  stopLabels: string[];
  /** مستحق هذا المتعهد — لا سعر العميل ولا هامش المنصة */
  payout: number;
  /** العملة من لقطة الحجز؛ null ⇒ يُعرض الرقم مجرداً بلا وحدة مكتوبة في الكود */
  currency: string | null;
  expiresAt: string | null;
  notes: string | null;
};

/**
 * ما سجّله المتعهد من طاقم لرحلته — **معرِّفان لا لقطة**، والعقد يشرح لماذا
 * (`lib/crew-types.ts`): السعر حقٌّ مالي يُجمَّد، أما لوحة المركبة واسم السائق
 * فواقعٌ تشغيلي يُقرأ لحظة قراءته، فتصحيحُ لوحةٍ كُتبت خطأً يصل العميل فوراً.
 */
export type TripCrewRef = {
  vehicleId: string | null;
  driverId: string | null;
  /** أدخلته الإدارة نيابةً عن الشريك — يُوسم ولا يُخفى */
  byAdmin: boolean;
  at: string | null;
};

/** ما يُضاف بعد الإسناد — بيانات التنفيذ (`AssignedTripDetails`) */
export type PortalTrip = PortalOffer & {
  customerName: string | null;
  customerPhone: string | null;
  customerWhatsapp: string | null;
  /** حالة الحجز كما تعيدها الدالة إن أعادتها — الغياب يعني «مُسندة» ضمناً */
  status: string | null;
  assignedAt: string | null;
  /**
   * معرّف الحجز — عنوان النداء في `set_trip_crew`. وهو **ليس مفتاح وصول** في أي
   * مسار (الوصول بالتوكن وحده)، ولذلك اشتُقّ منه رمز المتعهد في 0028 أصلاً.
   */
  bookingId: string | null;
  /**
   * رقم الرحلة الجوية (هجرة `0067`) — كان يصل داخل `notes` النصّية.
   *
   * ⚠ و**غيابه لا يعني «رحلة ليست مطارية»**: قد يكون العميل لم يكتبه، وقد
   * تكون القاعدة لم تصلها الهجرة. فالشاشة تعرضه حين وُجد ولا تنفيه حين غاب.
   */
  flightNumber: string | null;
  /**
   * الطاقم المسجَّل — و`null` تعني **«لا نعرف»** لا «لم يُسجَّل».
   * والفرق ليس تدقيقاً لغوياً: عليه تُبنى الجملة التي تُقال للمتعهد، فلا نقول له
   * «لم تسجّل مركبة» ونحن لم نسأل أصلاً. (انظر `toCrew` أدناه.)
   */
  crew: TripCrewRef | null;
  /**
   * طلبُ إتمام هذه الرحلة (هجرة `0119`) — و`null` تعني **«لم يُطلب»** لا «لا نعرف»:
   * `portal_trips()` تضمّ الطلب بـ`left join lateral` فتُرجع الأعمدة دائماً، غايةُ
   * ما هنالك أنها فارغة. وخادمٌ لم تصله الهجرة لا يُرجع الأعمدة أصلاً — وهو نفس
   * أثر «لم يُطلب» في الشاشة، وهذا مقبول: الزرّ يظهر، والقاعدة ترفض، والرسالة
   * تقول «الخدمة غير مُركَّبة».
   */
  completion: TripCompletion | null;
};

/** حالةُ طلب الإتمام كما يراها صاحبها */
export type TripCompletion = {
  /** `pending` · `approved` · `rejected` */
  status: string;
  requestedAt: string | null;
  /** لحظة الاعتماد التلقائي **المجمَّدة عند الطلب** — لا المحسوبة الآن */
  autoApproveAt: string | null;
  /** سببُ الرفض حين رُفض، أو ملاحظة الاعتماد */
  note: string | null;
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

/**
 * ══════════════════════════════════════════════════════════════════════════════
 *  تسميةُ مكانٍ تُعرض للمتعهد — **مفوَّضةٌ إلى مُنقّي عقد الحجز، ولا ثالثَ له**
 * ══════════════════════════════════════════════════════════════════════════════
 *
 * `sanitizeLine` في `lib/booking-types.ts` هو المُنقّي الوحيد في المستودع لهذا
 * الصنف من النصّ: يقرؤه `/api/quote` و`/api/booking` عند **الكتابة**، ويقرؤه هذا
 * السطر عند **القراءة** (القاعدة ١٢: يُفوَّض ولا يُستنسخ).
 *
 * ── 🔴 ولماذا يُعاد تشغيله هنا وقد جرى عند الكتابة؟ ثلاثةُ أسبابٍ **مقيسة** ──
 *
 * ١) **القاعدة لا تُنقّي.** جسمُ `public.dispatch_public_label` — المقروء حيّاً
 *    بـ`pg_get_functiondef` — يشطر على الفواصل ويُسقط المقاطع المرقَّمة **ولا
 *    يمسّ محرفاً غير مرئيّ واحد**. فما دخل القاعدة خرج منها كما هو.
 *
 * ٢) **وفي القاعدة الحيّة اليوم مُدخَلٌ يُثبت ذلك.** وسمُ منطلقِ الحجز
 *    `15ddd191` ينتهي بـ**U+202C** — قِيس بقراءةِ نقاط ترميزه واحدةً واحدة —
 *    وهو صفٌّ سبق التنقية، يصل شاشةَ المتعهد اليوم عبر `origin_label`.
 *
 * ٣) **وسطحُ الكتابة ليس مغلقاً إلى الأبد.** استيرادٌ أو تحويلُ طلبٍ أو تصحيحٌ
 *    إداريّ يكتب `bookings.trip` بلا المرور بمسارَي الـAPI ⇒ وسمٌ خام. وحارسٌ
 *    عند العرض يقع على المسارات كلها دفعةً واحدة.
 *
 * وما تُسقطه: فئةُ `Cf` كلَّها — ومنها **U+202E (RLO)** الذي يقلب اتجاه كلِّ ما
 * بعده على الشاشة، و**U+200B/U+061C** اللذان يشطران وسماً يبدو متطابقاً. وما
 * يبقى: التشكيلُ والتطويل وZWNJ/ZWJ والأرقامُ العربية الهندية — مبرَّراً بنداً
 * بنداً في ترويسة `sanitizeLine` نفسها.
 */
const placeLabel = (value: unknown): string => sanitizeLine(value, MAX_PLACE_LABEL_LENGTH);

/**
 * وسومُ المحطات بترتيب القيادة — من عمود `stops jsonb` في `portal_offers()`
 * و`portal_trips()` معاً.
 *
 * 🔴 **وترتيبُ المصفوفة هو ترتيبُ القيادة**: `trip_stops_public` تُجمّع
 * بـ`order by e.ord`، و`create_booking` تُخزّن باللقطة بالترتيب نفسه. فلا
 * فرزَ هنا ولا إعادةَ ترتيب — أيُّ لمسٍ للترتيب يُري المتعهدَ طريقاً غير طريقه.
 *
 * والسقف `MAX_TRIP_STOPS` من العقد لا رقماً هنا: لقطةٌ فيها أكثر بيانةٌ لا
 * نثق بها، فلا تُمدَّد بلا حدٍّ على شاشةٍ يُبنى عليها قرار.
 */
function toStopLabels(row: Record<string, unknown>): string[] {
  const raw = row.stops ?? row.tripStops ?? row.trip_stops;
  if (!Array.isArray(raw)) return [];

  const labels: string[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object" || Array.isArray(item)) continue;
    const entry = item as Record<string, unknown>;
    // الوسمُ وحده يُقرأ — ولا `lat` ولا `lng` حتى لو أرسلتهما الدالة بعد الإسناد
    labels.push(placeLabel(entry.label ?? entry.stopLabel ?? entry.stop_label));
    if (labels.length >= MAX_TRIP_STOPS) break;
  }
  return labels;
}

function toOffer(row: Record<string, unknown>): PortalOffer | null {
  const offerId = asText(pick(row, ["offer_id", "offerId", "id"]));
  if (!offerId) return null;

  return {
    offerId,
    reference: asText(pick(row, ["reference", "booking_reference", "bookingReference"])) ?? "",
    originLabel: placeLabel(pick(row, ["origin_label", "originLabel"])),
    destLabel: placeLabel(pick(row, ["dest_label", "destLabel", "destination_label"])),
    distanceKm: asNumber(pick(row, ["distance_km", "distanceKm"])),
    stopLabels: toStopLabels(row),
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

/**
 * طاقم الرحلة من صف `portal_trips()` — والقراءة هنا **بوجود المفتاح لا بقيمته**.
 *
 * لماذا وجود المفتاح؟ لأن `null` وحدها لا تفرّق بين «الدالة لا تعرض هذه الأعمدة»
 * و«الشريك لم يسجّل بعد» — فتقول الشاشة «لم تسجّل مركبة» لمن سجّلها البارحة، وهي
 * أسوأ من الصمت. فمفتاحٌ غائب ⇒ `null` (لا نعرف)، ومفتاحٌ حاضر ولو فارغاً ⇒ كائن
 * بمعرِّفين فارغين (نعرف أنه لم يسجّل). والتمييز يبقى نافعاً بعد 0042: خادمٌ عليه
 * 0040 وحدها — أي الأعمدة في `dispatches` والدالة قبل توسيعها — يقع في الحالة
 * الأولى بالضبط، و`dispatches` نفسها محجوبة عن المتعهد بـRLS منذ 0013.
 *
 * ⚠ **وأسماء الأعمدة مقروءة من الكتالوج الحيّ لا من ملف الهجرة** (القاعدة ١٤ في
 * `INDEX.md`، و**D-58**): توقيع `portal_trips()` كما يعيده `pg_get_function_result`
 * ينتهي بـ`crew_vehicle_id, crew_driver_id, crew_by_admin, crew_at` — أي أن الدالة
 * تعيد **تسمية** عمودَي `dispatches` (`assigned_vehicle_id`/`assigned_driver_id`)
 * ببادئة `crew_` كي لا يشتبها بـ`assigned_at` المجاور. وكان هذا المُحوِّل يستفهم
 * عن الاسمين الأصليين، فلا يجدهما، فيعود `null` **دائماً** — كل حفظ يبدو ضائعاً.
 * أي تغيير هنا يُقاس على التوقيع الحيّ قبل كتابته.
 *
 * ونقبل الشكلين معاً — أعمدة مسطّحة أو كائن `crew` متداخل — كبقية قراءات هذا الملف.
 */
function toCrew(row: Record<string, unknown>): TripCrewRef | null {
  const nested =
    typeof row.crew === "object" && row.crew !== null
      ? (row.crew as Record<string, unknown>)
      : null;

  const flat =
    "crew_vehicle_id" in row ||
    "crewVehicleId" in row ||
    "crew_driver_id" in row ||
    "crewDriverId" in row;

  if (!nested && !flat) return null;

  const source = nested ?? row;
  return {
    vehicleId: asText(pick(source, ["crew_vehicle_id", "crewVehicleId", "vehicleId"])),
    driverId: asText(pick(source, ["crew_driver_id", "crewDriverId", "driverId"])),
    byAdmin: asBool(pick(source, ["crew_by_admin", "crewByAdmin", "byAdmin"])),
    // ⚠ `assignedAt` تُقرأ من الكائن المتداخل وحده: على الصف المسطّح هي وقت
    //    **الإسناد** لا وقت تسجيل الطاقم، والخلط بينهما يعرض تاريخاً كاذباً.
    at: nested
      ? asText(pick(nested, ["crew_at", "crewAt", "assignedAt"]))
      : asText(pick(row, ["crew_at", "crewAt"])),
  };
}

function withContact(base: PortalOffer, row: Record<string, unknown>): PortalTrip {
  return {
    ...base,
    customerName: asText(pick(row, ["customer_name", "customerName"])),
    customerPhone: asText(pick(row, ["customer_phone", "customerPhone"])),
    customerWhatsapp: asText(pick(row, ["customer_whatsapp", "customerWhatsapp"])),
    status: asText(pick(row, ["status", "booking_status", "bookingStatus", "trip_status"])),
    assignedAt: asText(pick(row, ["assigned_at", "assignedAt"])),
    bookingId: asText(pick(row, ["booking_id", "bookingId"])),
    // 0067 — قاعدةٌ لم تصلها الهجرة لا تُرجع العمود، فيعود `null` بلا كسر
    flightNumber: asText(pick(row, ["flight_number", "flightNumber"])),
    crew: toCrew(row),
    completion: toCompletion(row),
  };
}

/**
 * طلبُ الإتمام من صفّ `portal_trips()` — والقراءة **بالحالة لا بوجود المفتاح**،
 * بخلاف `toCrew` أعلاه. ولماذا الفرق؟ لأن الغموض هناك كان مكلفاً: «لم تسجّل
 * مركبة» تُقال لمن سجّلها. وهنا لا غموض — غيابُ الحالة يعني «لا طلب»، وهي
 * بالضبط الجملة التي تُعرض: زرُّ «أعلن إتمام الرحلة» ظاهرٌ ينتظر ضغطة.
 */
function toCompletion(row: Record<string, unknown>): TripCompletion | null {
  const status = asText(pick(row, ["completion_status", "completionStatus"]));
  if (!status) return null;
  return {
    status,
    requestedAt: asText(pick(row, ["completion_requested_at", "completionRequestedAt"])),
    autoApproveAt: asText(pick(row, ["completion_auto_at", "completionAutoAt"])),
    note: asText(pick(row, ["completion_note", "completionNote"])),
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

/* ------------------------------------------------------------------ */
/* سجلّ الشريك — مركباته وسائقوه (مصدر قائمتَي طاقم الرحلة)              */
/* ------------------------------------------------------------------ */

/**
 * القراءة من الجدولين مباشرة لا من دالة: كلاهما **ملك الشريك** وسياساته الأربع
 * (`*_own_or_admin`) تعزل صفوفه بنفسها، فلا سرّ في القائمة يستدعي دالة تحجب.
 * ومع ذلك يبقى الشرط على `subcontractor_id` مكتوباً — حزامان لا حزام (نفس قاعدة
 * `app/portal/_lib/data.ts`): الشرط يجعل النية مقروءة، وRLS تبقى ما لا يُتجاوَز.
 *
 * ولماذا سجلّ لا حقول تُكتب لكل رحلة؟ العقد يجيب: متعهد بعشر رحلات يومياً يعيد
 * كتابة اسم السائق خمسين مرة أسبوعياً، ومن يفعل ذلك أسبوعاً يتوقف — فتبقى الميزة
 * مبنيّة ولا تُستعمل. النقرتان هما الفرق بين ميزةٍ تعمل وميزةٍ تُتجاهَل.
 */
export type CrewVehicle = {
  id: string;
  label: string;
  plate: string | null;
  /** أضافته 0040 — «شكلها ولونها» في نصّ الملاحظة */
  color: string | null;
  modelYear: number | null;
  active: boolean;
};

export type CrewDriver = {
  id: string;
  name: string;
  active: boolean;
};

/**
 * `*Ready = false` ⇒ الجدول أو العمود غير منشور بعد (هجرة 0040) — لا «سجل فارغ».
 * الفرق هو الفرق بين «أضف سائقك الأول» و«الشاشة غير جاهزة»، وكلتاهما جملة تُقال
 * في موضعها وحده.
 */
export type CrewRoster = {
  vehicles: CrewVehicle[];
  drivers: CrewDriver[];
  vehiclesReady: boolean;
  driversReady: boolean;
};

const EMPTY_ROSTER: CrewRoster = {
  vehicles: [],
  drivers: [],
  vehiclesReady: false,
  driversReady: false,
};

/**
 * سجلّا المتعهد معاً في نداء واحد مُذاكَر: بطاقة كل رحلة تحتاج نفس القائمتين،
 * فعشر بطاقات = استعلامان لا عشرون. والترتيب: العامل قبل المتوقف ثم أبجدياً —
 * فأول ما تقع عليه العين هو ما يُختار فعلاً.
 */
export const loadCrewRoster = cache(async (): Promise<CrewRoster> => {
  const access = await portalAccess();
  if (!access.ok) return EMPTY_ROSTER;
  const { supabase, sub } = access;

  const [vehicleRes, driverRes] = await Promise.all([
    supabase
      .from("subcontractor_vehicles")
      .select("id, label, plate, color, model_year, active")
      .eq("subcontractor_id", sub.id)
      .order("active", { ascending: false })
      .order("label", { ascending: true }),
    supabase
      .from("subcontractor_drivers")
      .select("id, name, active")
      .eq("subcontractor_id", sub.id)
      .order("active", { ascending: false })
      .order("name", { ascending: true }),
  ]);

  const vehicles = rowsOf(vehicleRes.data).map((row) => ({
    id: String(row.id),
    label: asText(row.label) ?? "",
    plate: asText(row.plate),
    color: asText(row.color),
    modelYear: typeof row.model_year === "number" ? row.model_year : null,
    active: row.active === true,
  }));

  const drivers = rowsOf(driverRes.data).map((row) => ({
    id: String(row.id),
    name: asText(row.name) ?? "",
    active: row.active === true,
  }));

  return {
    vehicles,
    drivers,
    vehiclesReady: !isSchemaMissing(vehicleRes.error),
    driversReady: !isSchemaMissing(driverRes.error),
  };
});

/* ------------------------------------------------------------------ */
/* الاعتذار بعد الإسناد — أسبابُه وعتبتُه (هجرتا 0119 و0121)             */
/* ------------------------------------------------------------------ */

/**
 * سببُ اعتذارٍ كما يراه الشريك — **بلا مبلغ، ومعه اتجاهُ الأثر وحده**.
 *
 * 🔒 **المبلغ محجوبٌ بنيوياً**: `portal_apology_reasons()` لا تحمله في نوع
 * إرجاعها أصلاً (‏`0145`). وهو اقتراحٌ مسقوفٌ بمستحق الرحلة لا يُنفَّذ إلا
 * بقرارٍ إداريٍّ بمبرَّرٍ مكتوب (‏`0130`)، فعرضُه رقماً يَعِد بما لا تنفّذه
 * القاعدة.
 *
 * 🔴 **وأما وجودُ الأثر فيُعرض — وهذا نقضٌ صريح لما كان مكتوباً هنا.** كانت
 * الحجّة أن «من يرى (هذا السبب إجراؤه خصم) يختار الأرخص لا الأصدق»، وهي حجّةٌ
 * صحيحة في نفسها. **لكن البند ٥ من اتفاقية المتعهدين يقول نصّاً**: «ولكل سبب
 * أثرٌ مالي **معلوم مسبقاً**» — فالإفصاحُ التزامٌ وقّع عليه الطرفان لا خيارٌ
 * تصميميّ، واختيارٌ أعمى بين سببٍ بثمنٍ وسببٍ بلا ثمن ليس اختياراً. والتوفيق:
 * يُعرض **الاتجاه** ولا يُعرض **المبلغ**، فيبقى الفارقُ الكمّي خفياً؛
 * و`mayDeduct` مشتقٌّ من مفتاح اللوحة الحيّ — فما دام الخصمُ على الاعتذار
 * مطفأً (وهو مطفأٌ اليوم) فلا سببَ موسومٌ به، ولا تحذيرَ من عقوبةٍ لا تقع.
 */
export type ApologyReason = {
  slug: string;
  label: string;
  /** قد يترتب على هذا السبب خصم — اتجاهٌ لا مبلغ، ومن الحالة الحيّة لا من ثابت */
  mayDeduct: boolean;
};

export type ApologyOptions = {
  reasons: ApologyReason[];
  /** عتبةُ تفرّع الوجهة بالساعات — من `trip_closure_config()` لا من ثابتٍ هنا */
  thresholdHours: number | null;
  /** الجدول أو الهجرة غير منشورين ⇒ لا تُعرض شاشةُ الاعتذار أصلاً */
  ready: boolean;
};

const NO_APOLOGY: ApologyOptions = { reasons: [], thresholdHours: null, ready: false };

/**
 * أسبابُ الاعتذار المتاحة للشريك + عتبة اللوحة، في نداءٍ واحد مُذاكَر.
 *
 * 🔴 **ولماذا دالةٌ لا قراءةٌ من الجدول؟** هذا بعينه ما كان معطوباً: سياساتُ
 * `SELECT` على `failure_reasons` كلُّها `is_admin()`، وهذه القراءة تجري **بجلسة
 * المتعهد** — فكانت ترجع **صفرَ صفوف دائماً**، فتُخفي الشاشةُ زرَّ «اعتذر عن
 * الرحلة» إخفاءً كاملاً. حقٌّ في البند ٥ من الاتفاقية بلا سبيلٍ إليه، وبديلُه
 * الوحيد أن يترك المتعهد الرحلة تفشل — **وهو المسارُ الذي يُخصم فيه**.
 *
 * والعلاجُ `portal_apology_reasons()` (‏`0145`): دالةُ قراءةٍ `security definer`
 * حارسُها `current_subcontractor_id()` في جسمها (‏D-20) — **لا فتحُ RLS على
 * جدولٍ يحمل `default_action` و`default_deduct_amount` وتصنيفاً تشغيلياً**.
 *
 * والتصفيةُ صارت **داخل القاعدة**: مفعَّل، ونطاقه `apology` أو `both`، ومُبادِرُه
 * ليس `platform` — وهي مرآةُ ما تفرضه `withdraw_from_trip` حرفاً بحرف. ولو انحرف
 * الطرفان لظهر للشريك خيارٌ ترفضه القاعدة عند الضغط (النمط ٢ في `LESSONS`)، وهو
 * ما يقيسه القسم (ع) في `completion_apology_tests.sql` نداءً حياً لكل سبب.
 */
export const loadApologyOptions = cache(async (): Promise<ApologyOptions> => {
  const access = await portalAccess();
  if (!access.ok) return NO_APOLOGY;

  const [reasonsRes, cfgRes] = await Promise.all([
    access.supabase.rpc("portal_apology_reasons"),
    access.supabase.rpc("trip_closure_config"),
  ]);

  if (reasonsRes.error) return NO_APOLOGY;

  const reasons = rowsOf(reasonsRes.data)
    .map((row) => ({
      slug: asText(pick(row, ["slug"])) ?? "",
      label: asText(pick(row, ["label"])) ?? "",
      mayDeduct: pick(row, ["may_deduct", "mayDeduct"]) === true,
    }))
    .filter((reason) => reason.slug !== "" && reason.label !== "");

  const cfgRow = rowsOf(cfgRes.data)[0];
  const hours = cfgRow ? asNumber(pick(cfgRow, ["apology_manual_hours", "apologyManualHours"])) : null;

  return { reasons, thresholdHours: hours, ready: reasons.length > 0 };
});
