import { MAX_DERIVED_WAITING_HOURS, type ExtraSelection } from "@/lib/extras-types";
import type { ExtraServiceRow } from "@/lib/extras-types";
import type { CreateBookingRequest } from "@/lib/booking-types";
import type { VerifyCouponRequest } from "@/lib/discounts/types";
import type { Offer, QuoteRequest, QuoteResponse } from "@/lib/pricing-types";

/**
 * أنواع سطح الحجز العام بعد الدفعة ٣ (الهجرة `0031`) — الخدمات والحقائب وتاريخ
 * العودة، ومُساعدات **عرض** لا تحسب مالاً.
 *
 * ── لماذا هذا الملف موجود أصلاً ────────────────────────────────────────────
 * العقد الملزم هو `lib/extras-types.ts` وأسماؤه هي المرجع، **ولا يُعدَّل**
 * (ولا يُعدَّل معه `lib/pricing-types.ts` ولا `lib/booking-types.ts` في هذه
 * الدفعة). فالحقول الجديدة التي يحملها الطلب والرد تُوصَّف هنا **توسعةً** فوق
 * أنواع العقد لا بديلاً عنها: كل نوع أدناه مبنيّ بـ`&` أو `Pick` من نوع العقد،
 * فأي تغيير هناك يكسر البناء هنا فوراً بدل أن ينحرف الاثنان بصمت (النمط ٤ في
 * `handover/LESSONS.md`).
 * ⚠ **بند تسليم:** حين تُضمّ هذه الحقول إلى `lib/pricing-types.ts` و
 * `lib/booking-types.ts` رسمياً، تُحذف التوسعات من هنا ويبقى `PublicExtra`
 * و`ExtraLine` وحدهما.
 *
 * ── والقاعدة التي تحكم الملف كله ───────────────────────────────────────────
 * **لا جنيه يُحسب هنا.** أسعار الخدمات تصل من `public_extras()`، وسطورها
 * المسعَّرة من `price_extras()` داخل `quote_public`، والإجمالي من `quote_public`
 * وحدها. الدالة الوحيدة التي تُنتج رقماً في هذا الملف هي
 * `estimateWaitingHours` — وهي **ساعات لا مال**، و**للعرض قبل وصول الرد فقط**،
 * ولا تُرسَل إلى الخادم أبداً (انظر ترويستها).
 */

/* ------------------------------------------------------------------ */
/* الكتالوج العام                                                       */
/* ------------------------------------------------------------------ */

/**
 * خدمة كما تخرج من `public_extras()` — **بلا أي عمود داخلي**.
 *
 * مشتقّة بـ`Pick` من صف العقد لا مكتوبة من جديد: `id` و`active` و`sort`
 * و`created_at` لا مكان لها في نوع الإرجاع العام (نفس مبدأ `quote_public`)،
 * وحذفها هنا يجعل تسريبها إلى المتصفح خطأ بناء لا سهواً.
 */
export type PublicExtra = Pick<
  ExtraServiceRow,
  "slug" | "title" | "description" | "price" | "maxQty"
>;

/**
 * سطر خدمة مسعَّر كما يعود من `price_extras()` داخل `quote_public`.
 * الأرقام الثلاثة (`unitPrice` و`qty` و`lineTotal`) كلها من القاعدة —
 * و`lineTotal` **لا يُشتق هنا بالضرب** حتى لو بدا بديهياً.
 */
export type ExtraLine = {
  slug: string;
  title: string;
  qty: number;
  unitPrice: number;
  lineTotal: number;
};

/* ------------------------------------------------------------------ */
/* توسعات الطلب والرد                                                   */
/* ------------------------------------------------------------------ */

/**
 * عرض سعر واحد بعد الدفعة ٣.
 *
 * `rideTotal` **ليس** `total`: الأول سعر الرحلة بعد الخصم وقبل الخدمات، والثاني
 * ما يدفعه العميل فعلاً (`rideTotal + extrasTotal`). فصلهما هو ما يسمح للشاشة أن
 * تعرض ما تفعله القاعدة حرفياً — الكوبون على الرحلة والخدمات فوقها (القرار ب في
 * `lib/extras-types.ts`).
 */
export type OfferWithExtras = Offer & {
  rideTotal: number;
  extrasTotal: number;
  extras: ExtraLine[];
};

/** جسم طلب `/api/quote` بعد الدفعة ٣ — رموز وكميات وتواريخ، **ولا سعر** (D-09) */
export type QuoteRequestWithExtras = QuoteRequest & {
  /** موعد الانطلاق — يُرسَل ليشتق الخادمُ ساعات الانتظار، لا ليُسعِّر بنفسه */
  pickupAt?: string | null;
  /** موعد العودة — مصدر اشتقاق الانتظار في `derive_waiting_hours` */
  returnAt?: string | null;
  luggage?: number;
  extras?: ExtraSelection[];
};

/**
 * رد `/api/quote` بعد الدفعة ٣.
 *
 * `waitingHours` **رقم من القاعدة** (‏`derive_waiting_hours`) يعود إلى المتصفح
 * ليحمله إلى بقية المسار (معاينة الكوبون ثم الحجز) — فيبقى للرقم مصدر واحد
 * مهما تعدد مستهلكوه (النمط ٨ في `LESSONS.md`).
 */
export type QuoteResponseWithExtras = Omit<QuoteResponse, "offers"> & {
  offers: OfferWithExtras[];
  waitingHours: number;
};

/** جسم طلب `/api/booking` بعد الدفعة ٣ */
export type CreateBookingRequestWithExtras = CreateBookingRequest & {
  returnAt?: string | null;
  luggage?: number;
  extras?: ExtraSelection[];
};

/**
 * جسم طلب `/api/discount/verify` بعد الدفعة ٣ — **بالحقائب**.
 *
 * ── ولماذا الحقائب هنا شرطُ صحة لا زينة ───────────────────────────────────
 * `quote_price` تختار الفئتين بـ`order by capacity asc limit 2` **بعد** شرطَي
 * الأهلية، فالحقائب **تُزيح** المجموعة ولا تضيّقها: راكبان وست حقائب يُنتجان
 * «ميني باص وباص» لا «سيدان وسوّار». فمعاينةُ كوبونٍ تنادي `quote_public` بلا
 * حقائب تستقبل فئتين غير اللتين رآهما العميل، فلا تجد فئته وترد ٤٠٩ «الفئة لم
 * تعد متاحة — أعد حساب السعر»: نصيحةٌ **لا يمكن أن تنجح أبداً**، لأن إعادة
 * الحساب تُنتج الفئة نفسها التي لا يراها مسار الكوبون. حلقةٌ مغلقة برسالة كاذبة.
 *
 * ⚠ **ولا `extras` هنا — بقرار المالك (ب) في `lib/extras-types.ts`.** الكوبون
 * يخصم سعر الرحلة وحده، والمعاينة تعرض أثره على الرحلة؛ ومسار الحجز يجمع
 * الخدمات فوق الرحلة المخصومة (`checkout.tsx` ← `totalAfter + extrasTotal`).
 * فتمرير الخدمات إلى المعاينة يجعل هذا المسار يُرجع إجمالاً ثالثاً لا تحسبه أي
 * جهة أخرى، ويوحي للعميل بأن الكوبون مسّ كرسي الأطفال وهو لم يمسّه.
 */
export type VerifyCouponRequestWithLuggage = VerifyCouponRequest & {
  luggage?: number;
};

/* ------------------------------------------------------------------ */
/* حدود الواجهة                                                         */
/* ------------------------------------------------------------------ */

/**
 * سقف عدّاد الحقائب في الواجهة — **راحة إدخال لا قاعدة أهلية**.
 * الأهلية كلها في `quote_price` (‏`luggage_capacity >= p_luggage`، D-12)، وفئة
 * لا تتسع لا تعود في العروض أصلاً. رفع هذا الرقم لا يفتح شيئاً في القاعدة.
 */
export const MAX_LUGGAGE = 20;

/** أقصى كمية يقبلها المسار قبل أن تقصّها القاعدة على `max_qty` */
const MAX_SELECTION_QTY = 99;

/** نفس تعبير `slug` في جدول `extra_services` — مرآة لا حارس (الحارس في SQL) */
const SLUG_PATTERN = /^[a-z0-9-]{2,40}$/;

/* ------------------------------------------------------------------ */
/* قراءة وتنقية — بلا حساب                                              */
/* ------------------------------------------------------------------ */

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function finiteNumber(value: unknown): number {
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

/**
 * يقرأ مصفوفة `extras` القادمة من `quote_public` (‏jsonb) إلى سطور عرض.
 * أي شكل غير متوقع ⇒ مصفوفة فارغة: الشاشة تفقد تفصيلاً ولا تعرض رقماً مخترعاً.
 */
export function readExtraLines(value: unknown): ExtraLine[] {
  if (!Array.isArray(value)) return [];
  const lines: ExtraLine[] = [];
  for (const entry of value) {
    if (!isRecord(entry)) continue;
    const slug = typeof entry.slug === "string" ? entry.slug : "";
    const title = typeof entry.title === "string" ? entry.title : "";
    if (slug.length === 0 || title.length === 0) continue;
    lines.push({
      slug,
      title,
      qty: Math.trunc(finiteNumber(entry.qty)),
      unitPrice: finiteNumber(entry.unitPrice),
      lineTotal: finiteNumber(entry.lineTotal),
    });
  }
  return lines;
}

/**
 * يتحقق من اختيار الخدمات الوارد من المتصفح: **رموز وكميات فقط**.
 *
 * لا سعر ولا إجمالي ولا عنوان — أي مفتاح آخر في الحمولة يُهمَل بالبناء لأن
 * الكائن يُبنى حقلاً حقلاً. والقصّ على `max_qty` وتجاهل المُطفأ والمكرَّر كلها
 * داخل `price_extras` في القاعدة، لا هنا.
 *
 * يرجع `null` عند أي شكل غير صالح ليردّ المسار ٤٠٠ بدل أن يبلع الخطأ بصمت.
 */
export function parseExtrasSelection(value: unknown): ExtraSelection[] | null {
  if (value === undefined || value === null) return [];
  if (!Array.isArray(value)) return null;
  if (value.length > 50) return null;

  const out: ExtraSelection[] = [];
  for (const entry of value) {
    if (!isRecord(entry)) return null;
    const slug = typeof entry.slug === "string" ? entry.slug.trim().toLowerCase() : "";
    if (!SLUG_PATTERN.test(slug)) return null;
    const qty = entry.qty;
    if (typeof qty !== "number" || !Number.isInteger(qty)) return null;
    if (qty < 0 || qty > MAX_SELECTION_QTY) return null;
    if (qty === 0) continue;
    out.push({ slug, qty });
  }
  return out;
}

/** عدد حقائب مقبول: صحيح بين صفر والسقف — وأي شيء آخر `null` (رفض صريح) */
export function parseLuggage(value: unknown): number | null {
  if (value === undefined || value === null) return 0;
  if (typeof value !== "number" || !Number.isInteger(value)) return null;
  if (value < 0 || value > MAX_LUGGAGE) return null;
  return value;
}

/** يحوّل خريطة الكميات في الواجهة إلى ما يُرسَل — بلا أصفار وبلا أسعار */
export function toSelection(quantities: Record<string, number>): ExtraSelection[] {
  return Object.entries(quantities)
    .filter(([, qty]) => Number.isInteger(qty) && qty > 0)
    .map(([slug, qty]) => ({ slug, qty }));
}

/* ------------------------------------------------------------------ */
/* تقدير ساعات الانتظار — للعرض وحده                                     */
/* ------------------------------------------------------------------ */

/** مكوّنات اليوم بتوقيت القاهرة — نفس منطقة `derive_waiting_hours` حرفياً */
function cairoDayKey(date: Date): string {
  try {
    const parts = new Intl.DateTimeFormat("en-US", {
      timeZone: "Africa/Cairo",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).formatToParts(date);
    const read = (type: string) => parts.find((part) => part.type === type)?.value ?? "";
    return `${read("year")}-${read("month")}-${read("day")}`;
  } catch {
    // بيئة بلا بيانات مناطق زمنية — UTC بدل الانهيار (نفس احتياط `format.ts`)
    return date.toISOString().slice(0, 10);
  }
}

/**
 * ⚠ **تقدير للعرض فقط، ولا يُرسَل إلى الخادم إطلاقاً.**
 *
 * القاعدة صاحبة الاشتقاق هي `derive_waiting_hours(p_pickup_at, p_return_at)`،
 * وهي التي تُسعّر في `quote_public` وتُثبِّت في `create_booking`. وهذه الدالة
 * مرآتها في المتصفح لغرض واحد: أن يقرأ العميل معنى اختياره **قبل** أن يعود عرض
 * السعر، والرقم يُعرض حينها موسوماً «تقديري» ويُستبدل بالرقم الخادمي فور وصوله.
 *
 * ولماذا يجوز أن يوجد رقمان لشيء واحد هنا وقد نهى `LESSONS.md` عن ذلك؟ لأن
 * أحدهما **لا يدخل أي حساب ولا يُخزَّن ولا يُرسَل**: هو نصٌّ إرشادي. اللحظة التي
 * يُرسَل فيها هذا الرقم إلى مسار خادمي هي اللحظة التي يصير فيها العيب حقيقياً.
 *
 * والقاعدة المُطبَّقة هنا نسخة حرفية من ق٤ في المواصفة:
 *   لا عودة أو عودة ≤ الانطلاق ⇒ صفر · يوم آخر بتوقيت القاهرة ⇒ صفر
 *   وإلا ⇒ least(ceil(الفارق بالساعات), MAX_DERIVED_WAITING_HOURS)
 *
 * @returns عدد الساعات، أو `null` حين لا يمكن التقدير أصلاً (تاريخ ناقص/فاسد)
 */
export function estimateWaitingHours(
  pickupIso: string | null,
  returnIso: string | null
): number | null {
  if (!pickupIso || !returnIso) return null;
  const pickup = new Date(pickupIso);
  const back = new Date(returnIso);
  if (Number.isNaN(pickup.getTime()) || Number.isNaN(back.getTime())) return null;
  if (back.getTime() <= pickup.getTime()) return 0;
  if (cairoDayKey(pickup) !== cairoDayKey(back)) return 0;
  const hours = Math.ceil((back.getTime() - pickup.getTime()) / 3_600_000);
  return Math.min(hours, MAX_DERIVED_WAITING_HOURS);
}

/** العودة في يوم غير يوم الانطلاق (بتوقيت القاهرة) — لاختيار نص الشرح وحده */
export function isReturnAnotherDay(pickupIso: string | null, returnIso: string | null): boolean {
  if (!pickupIso || !returnIso) return false;
  const pickup = new Date(pickupIso);
  const back = new Date(returnIso);
  if (Number.isNaN(pickup.getTime()) || Number.isNaN(back.getTime())) return false;
  return cairoDayKey(pickup) !== cairoDayKey(back);
}
