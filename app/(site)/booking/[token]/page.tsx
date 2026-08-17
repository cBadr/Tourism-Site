import type { Metadata } from "next";
import Link from "next/link";
import { cookies } from "next/headers";
import { notFound } from "next/navigation";
import {
  BadgeCheck,
  Ban,
  Banknote,
  Building2,
  CircleSlash,
  CalendarClock,
  CarFront,
  CircleCheck,
  Clock,
  ConciergeBell,
  CreditCard,
  Hourglass,
  Info,
  Link2,
  Luggage,
  MessageCircle,
  Phone,
  ReceiptText,
  Route as RouteIcon,
  ShieldCheck,
  TriangleAlert,
  UserRound,
  Wallet,
} from "lucide-react";
import { getSettings } from "@/lib/settings";
import { getBaseUrl } from "@/lib/seo";
import { cn } from "@/lib/utils";
import { createServerSupabase } from "@/lib/supabase/server";
import { createServiceSupabase } from "@/lib/supabase/admin";
import { localePath } from "@/lib/i18n-types";
import { createFormatter, getT, resolveLocale, type Tx } from "@/lib/i18n/content";
import type { LocaleFormatter } from "@/components/booking/format";
import { telHref, waHref, waShareHref } from "@/components/site/links";
import { SiteHeader } from "@/components/site/header";
import { SiteFooter } from "@/components/site/footer";
import { WhatsAppFab } from "@/components/site/whatsapp-fab";
import { readPaymentSettings } from "@/components/booking/checkout/payment";
import { readPaymentHold } from "@/components/booking/checkout/hold";
import { HoldCountdown } from "@/components/booking/checkout/hold-countdown";
import { RememberTransferAccount } from "@/components/booking/checkout/remember-account";
import { TripShare } from "@/components/booking/checkout/trip-share";
import {
  TRANSFER_ACCOUNT_COOKIE,
  TRANSFER_GROUP,
  preferredAccountId,
} from "@/components/booking/checkout/transfer-preference";
import { CopyButton } from "@/components/booking/checkout/copy-button";
import { safeMediaSrc } from "@/components/sections/image";
import {
  PAY_SECTION_ANCHOR,
  RouteMapFigure,
  RoutePendingPanel,
} from "@/components/booking/route-map";
import {
  ensureBookingRouteMap,
  routeMapEnabled,
  routeMapStatusReady,
  withinServiceArea,
} from "@/lib/maps/route-map";
import { tripDirectionsUrl } from "@/lib/maps/directions";
import { isDrawablePoint } from "@/lib/maps/static-map";
import { PrintButton } from "@/components/booking/print-button";
import { PRINT_HIDDEN_CLASS } from "@/lib/export-types";
import { readEnabledGateways } from "@/components/booking/checkout/gateways";
import { LinkThisBooking } from "@/app/(site)/account/_components/link-this-booking";
import {
  PaymentMethodChoice,
  type GatewayChoice,
} from "@/components/booking/checkout/payment-method";
import {
  ReceiptUpload,
  type ReceiptAccountOption,
} from "@/components/booking/checkout/receipt-upload";
import type { BookingStatus, BookingTokenCrew, ReceiptStatus } from "@/lib/booking-types";
import type { PaymentAccountChoice } from "@/lib/payment-fee-types";

/**
 * صفحة متابعة الحجز /booking/[token] — الصفحة الوحيدة التي يملكها العميل الضيف.
 *
 * الوصول بتوكن غير قابل للتخمين فقط: نقرأ عبر دالة `get_booking_by_token`
 * (security definer) لأن الزائر لا يملك SELECT على جدول الحجوزات إطلاقاً.
 * الصفحة **خاصة** ⇒ noindex/nofollow، ولا تدخل خريطة الموقع.
 *
 * كل الأرقام هنا مقروءة من قاعدة البيانات كما خزّنتها `create_booking` — لا حساب
 * مالي في هذه الصفحة إطلاقاً (قرار معماري ٤).
 *
 * المرحلة ٨: النصوص من مساحة `pages.bookingStatus`، وكل رقم ومبلغ وتاريخ يمر
 * بـ `createFormatter(locale)` — فالعميل الإنجليزي الذي وصل من `/en/book` يجد
 * صفحته بلغته. أما الخصوصية فلا تتغير: noindex/nofollow في كل اللغات.
 */

type PageParams = { params: Promise<{ token: string }> };

export async function generateMetadata(): Promise<Metadata> {
  const locale = await resolveLocale();
  const t = await getT("pages.bookingStatus", locale);

  return {
    title: t("metaTitle", "متابعة حجزك"),
    description: t("metaDescription", "حالة حجزك وبيانات التحويل ورفع الإيصال."),
    // الصفحة خاصة بتوكن العميل — لا فهرسة ولا تتبّع روابط بأي لغة
    robots: {
      index: false,
      follow: false,
      nocache: true,
      googleBot: { index: false, follow: false },
    },
  };
}

/* ------------------------------------------------------------------ */
/* قراءة دفاعية لصف الحجز                                               */
/* ------------------------------------------------------------------ */

type UnknownRow = Record<string, unknown>;

function isRecord(value: unknown): value is UnknownRow {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** أول مفتاح موجود بقيمة نصية — نقبل snake_case وcamelCase معاً */
function readText(row: UnknownRow, ...keys: string[]): string | null {
  for (const key of keys) {
    const value = row[key];
    if (typeof value === "string" && value.trim().length > 0) return value.trim();
    if (typeof value === "number" && Number.isFinite(value)) return String(value);
  }
  return null;
}

function readNumber(row: UnknownRow, ...keys: string[]): number | null {
  for (const key of keys) {
    const value = row[key];
    const parsed = typeof value === "number" ? value : Number(value);
    if (value !== null && value !== undefined && value !== "" && Number.isFinite(parsed)) {
      return parsed;
    }
  }
  return null;
}

function readBoolean(row: UnknownRow, ...keys: string[]): boolean {
  for (const key of keys) {
    const value = row[key];
    if (typeof value === "boolean") return value;
    if (value === "true") return true;
    if (value === "false") return false;
  }
  return false;
}

/**
 * موضع متغيّر داخل رسالة مترجمة حين يحتاج المتغيّر عنصراً خاصاً به
 * (رقم الحجز بخط أحادي واتجاه ltr). نحقن علامة غير مرئية ثم نقصّ عليها،
 * فتبقى الرسالة سطراً واحداً في ملف اللغة ويبقى الترميز كما هو في الصفحة.
 */
const SLOT = "\uE000";

function splitAroundSlot(text: string): [string, string] {
  const index = text.indexOf(SLOT);
  if (index < 0) return [text, ""];
  return [text.slice(0, index), text.slice(index + SLOT.length)];
}

/**
 * حالة الحجز كما تصل هذه الصفحة — **سبعٌ لا ست**.
 *
 * ⚠ و`failed` ليست في `BookingStatus` بعد: العقد `lib/booking-types.ts` يعدّها
 * ستاً، وقيد القاعدة `bookings_status_check` صار سبعاً في `0051` (مقروءاً من
 * `pg_get_constraintdef`). فحتى يُضاف الحرف إلى العقد يعيش الاتحاد هنا، ويوم
 * يُضاف يذوب هذا السطر بلا تغيير في سطرٍ آخر.
 *
 * 🔴 **وهذا ليس تجميلاً بل إغلاق ثغرة قائمة:** `readStatus` ترتدّ إلى
 * `pending_payment` عند حالةٍ لا تعرفها، فرحلةٌ فاشلة كانت تُصيَّر **صفحةَ
 * دفع**: «حوّل ١٬٢٠٠ ج لتأكيد الحجز» وأرقامَ المحافظ ونموذجَ رفع الإيصال —
 * أي دعوةً لدفع ثمن رحلةٍ لن تقع، على حجزٍ حالته النهائية ردُّ المال.
 */
type TrackedStatus = BookingStatus | "failed";

const STATUS_VALUES: TrackedStatus[] = [
  "pending_payment",
  "under_review",
  "confirmed",
  "assigned",
  "completed",
  "cancelled",
  "failed",
];

function readStatus(row: UnknownRow): TrackedStatus {
  const raw = readText(row, "status", "booking_status");
  const found = STATUS_VALUES.find((value) => value === raw);
  return found ?? "pending_payment";
}

/**
 * صف تحصيل كما تصل به `get_booking_by_token` — **ستة مفاتيح لا سابع**.
 *
 * الدالة تبني الحمولة بـ `jsonb_build_object` على هذه المفاتيح وحدها، وتُسقط
 * عمداً `receipt_path` و`account_id` و`verified_by` (‏`booking_tests.sql` يؤكد
 * غيابها). ولا صورة إيصال هنا بحال: دلو `receipts` خاص ولا سياسة قراءة للعميل
 * عليه أصلاً، فأي محاولة عرض للصورة رابط مكسور لا ميزة.
 *
 * والمصفوفة الواصلة **مُصفّاة في القاعدة** بشرط `visible_to_customer` (هجرة
 * 0027): ما وصل إلى هنا مرئيٌّ بقرار المشرف، وما أُخفي أُسقط صفّاً كاملاً قبل
 * أن يغادر Postgres. فلا إخفاء في هذه الطبقة ولا حاجة إليه.
 */
type ReceiptView = {
  id: string;
  amount: number | null;
  status: ReceiptStatus;
  note: string | null;
  createdAt: string | null;
  verifiedAt: string | null;
};

const RECEIPT_STATUS_VALUES: ReceiptStatus[] = ["pending", "approved", "rejected"];

/**
 * قراءة دفاعية لمصفوفة `payments` — مرة واحدة، ومنها يقرأ كل مستهلك في الصفحة
 * (تنبيه الرفض وسجل الإيصالات معاً) فلا تتعدد نسخ القراءة ولا تنحرف.
 *
 * الترتيب يبقى كما جاء من القاعدة (‏`order by p.created_at` داخل `jsonb_agg`):
 * الأقدم أولاً. لا نعيد ترتيبه هنا كي يبقى للسجل مصدر ترتيب واحد.
 *
 * وصفٌّ بحالة لا نعرفها يُسقَط: `payments.status` مقيَّد بـ
 * `check (status in ('pending','approved','rejected'))` في 0007، فالحالة الرابعة
 * غير ممكنة بنيوياً — ولو وُلدت يوماً فعرضُها بوصف مخترَع أسوأ من إغفالها.
 */
function readReceipts(row: UnknownRow): ReceiptView[] {
  const list = row["payments"];
  if (!Array.isArray(list)) return [];

  const receipts: ReceiptView[] = [];
  for (const item of list) {
    if (!isRecord(item)) continue;
    const raw = readText(item, "status");
    const status = RECEIPT_STATUS_VALUES.find((value) => value === raw);
    if (!status) continue;

    receipts.push({
      id: readText(item, "id") ?? "",
      amount: readNumber(item, "amount"),
      status,
      note: readText(item, "note"),
      createdAt: readText(item, "createdAt", "created_at"),
      verifiedAt: readText(item, "verifiedAt", "verified_at"),
    });
  }
  return receipts;
}

/**
 * طاقم الرحلة — عمود `crew` في حمولة `get_booking_by_token`
 * (هجرة `0040`، مصلَّحةً بـ`0043`).
 *
 * القراءة دفاعية كبقية الصفحة: حجزٌ سبق الهجرة، أو قاعدةٌ لم تُنفَّذ عليها، لا
 * يحمل المفتاح أصلاً فتغيب البطاقة بلا خطأ ولا فراغ.
 *
 * 🔒 **ولا قرار حجب هنا.** `driverPhone` يصل `null` خارج نافذته لأن القاعدة
 * حجبته داخل الدالة نفسها — والدالة ممنوحة لـ`anon` وتُنادى مباشرةً من
 * PostgREST، فحاجبٌ في هذا الملف كان يُتخطّى بنداء واحد (نفس درس إيصالات
 * الأدمن في الدفعة ٢). هذه الدالة **تقرأ ما وصل** ولا تقرر من يستحق رؤيته.
 *
 * 🔒 **وسبعة مفاتيح لا ثامن:** أسقطت 0043 `byAdmin` و`assignedAt` من
 * `jsonb_build_object` نفسها، فلا قراءة لهما هنا ولا حاجة. وكانت الصفحة تقرؤهما
 * ولا تعرضهما — أي حجبٌ في العرض، وهو ما يرفضه عقد المجال: ما لا يجب أن يصل لا
 * يخرج من الدالة أصلاً. ومن أعادهما إلى القراءة أعاد المسار الذي يصل الشاشة.
 *
 * والكائن كله `null` في ثلاث حالات تُقرأ واحدة هنا — **بلا بطاقة**: لا مركبة
 * ولا سائق مسجَّلان، أو عادت الدورة إلى الطابور، أو أُلغي الحجز (حارس الحالة في
 * 0043: `dispatches.status = 'assigned'` و`bookings.status in
 * ('assigned','completed')`). القاعدة لا تُخرج غلافاً فارغاً في أيٍّ منها.
 * والشرط الأخير أدناه احتياطٌ لنفس المعنى — بطاقةٌ بترويسة فوق ثلاثة شُرَط أسوأ
 * من غياب البطاقة.
 */
function readCrew(row: UnknownRow): BookingTokenCrew | null {
  const raw = row["crew"];
  if (!isRecord(raw)) return null;

  const crew: BookingTokenCrew = {
    vehicleLabel: readText(raw, "vehicleLabel", "vehicle_label"),
    vehicleColor: readText(raw, "vehicleColor", "vehicle_color"),
    vehiclePlate: readText(raw, "vehiclePlate", "vehicle_plate"),
    vehicleYear: readNumber(raw, "vehicleYear", "vehicle_year"),
    driverName: readText(raw, "driverName", "driver_name"),
    driverPhone: readText(raw, "driverPhone", "driver_phone"),
    phoneVisibleAt: readText(raw, "phoneVisibleAt", "phone_visible_at"),
  };

  const hasSubstance =
    crew.vehicleLabel !== null || crew.vehiclePlate !== null || crew.driverName !== null;
  return hasSubstance ? crew : null;
}

/**
 * هل **انقضت** نافذة هاتف السائق؟
 *
 * صارت النافذة بطرفين في 0043: تُفتح قبل الالتقاء بمهلة اللوحة و**تُغلق بعده
 * باثنتي عشرة ساعة**. فغياب الرقم صار له سببان متعاكسان، ولا تصلح لهما جملة:
 *
 *   • `phoneVisibleAt` في **المستقبل** ⇒ الموعد لم يحن بعد، والرقم **سيظهر**.
 *   • `phoneVisibleAt` في **الماضي** والرقم `null` ⇒ النافذة فُتحت ثم أُغلقت،
 *     فلن يعود. ولا حالة ثالثة بينهما: داخل النافذة يصل الرقم نفسه غير محجوب،
 *     فوجودُ الطابع في الماضي مع رقم فارغ لا يعني إلا الانقضاء.
 *
 * والاستنتاج سليم لأن القاعدة تُخرج `phoneVisibleAt` فارغاً حين لا نافذة أصلاً
 * (‏لقطة رحلة بلا `pickupAt`، أو سائق بلا هاتف) — فالطابع الموجود يعني نافذةً
 * محسوبة لا أكثر، وغيابه يردّنا إلى الجملة العامة لا إلى ادّعاء انقضاء.
 *
 * 🔒 وهذا **إخبارٌ بما فعلته القاعدة لا قرارُ حجبٍ يُتخذ هنا**: الرقم محجوب في
 * `get_booking_by_token` نفسها، وكل ما تفعله هذه المقارنة أن تختار الجملة
 * الصادقة بدل جملةٍ تَعِد بعودةٍ لن تقع.
 *
 * ودالةٌ في جذر الملف لا سطرٌ داخل الصفحة: قراءة الساعة أثر جانبي لا يُكتب في
 * جسم مكوّن (‏`react-hooks/purity`)، وهنا تُقرأ مرة واحدة عند التصيير — والصفحة
 * ديناميكية بالضرورة (توكن + كوكيز) فلا لقطة محفوظة تتجمّد عليها.
 */
/**
 * هل انقضت أرضية مهلة الحفظ؟
 *
 * دالةٌ في جذر الملف لا سطرٌ داخل الصفحة — **لنفس سبب `phoneWindowClosed` أدناه
 * حرفياً**: قراءة الساعة أثرٌ جانبي لا يُكتب في جسم مكوّن (‏`react-hooks/purity`).
 * وتُقرأ مرة واحدة عند التصيير، والصفحة ديناميكية بالضرورة (توكن + كوكيز) فلا
 * لقطة محفوظة تتجمّد عليها.
 */
function holdWindowPassed(holdUntil: string | null): boolean {
  if (holdUntil === null) return false;
  const at = Date.parse(holdUntil);
  return Number.isFinite(at) && at <= new Date().getTime();
}

function phoneWindowClosed(crew: BookingTokenCrew | null): boolean {
  if (crew === null || crew.driverPhone !== null || crew.phoneVisibleAt === null) return false;
  const opensAt = Date.parse(crew.phoneVisibleAt);
  return Number.isFinite(opensAt) && opensAt <= new Date().getTime();
}

/**
 * سطر خدمة إضافية اشتراها العميل مع الحجز (هجرة `0031`).
 *
 * 🔒 **الأرقام تصل جاهزة ولا تُحسب هنا**: `qty × unitPrice` جرى في Postgres
 * وخُزِّن في `line_total` لحظة الحجز، ومجموعها في `trip.extrasTotal`. هذه الصفحة
 * تعرض ولا تجمع ولا تطرح (قرار معماري ٤ — ولو طرحنا «الإجمالي ناقص الخدمات»
 * لصار للرقم مصدران ينحرفان).
 */
type ExtraLine = {
  title: string;
  qty: number;
  unitPrice: number | null;
  lineTotal: number | null;
};

/**
 * قراءة الخدمات من حمولة `get_booking_by_token` — إن حملتها يوماً.
 *
 * نوع إرجاع الدالة اليوم **سبعة عشر عموداً لا ثامن عشر**، ولقطة `trip` تحمل
 * `extrasTotal` وحده (‏`0031:1156-1178`) — فهذا المصدر **فارغ اليوم بالضرورة**،
 * ويبقى مكتوباً لأن توسيع نوع الإرجاع لاحقاً يجعله المصدر الأولى بلا تغيير في
 * هذه الصفحة. والمصدر الحقيقي الآن هو `loadBookingExtras` أدناه.
 *
 * ⚠ ولا معرّف خدمة يُقرأ هنا ولا يُعرض: اللقطة تخرج كاملة إلى حامل التوكن
 * (‏`0024:1089-1095`)، فما لا يحتاجه العميل لا مكان له في هذه الصفحة.
 */
function readExtras(row: UnknownRow, trip: UnknownRow): ExtraLine[] {
  const source = Array.isArray(row["extras"])
    ? row["extras"]
    : Array.isArray(trip["extras"])
      ? trip["extras"]
      : [];

  const lines: ExtraLine[] = [];
  for (const item of source) {
    if (!isRecord(item)) continue;
    const title = readText(item, "title", "titleSnapshot", "title_snapshot");
    const qty = readNumber(item, "qty", "quantity");
    if (!title || qty === null || qty <= 0) continue;
    lines.push({
      title,
      qty,
      unitPrice: readNumber(item, "unitPrice", "unit_price"),
      lineTotal: readNumber(item, "lineTotal", "line_total"),
    });
  }
  return lines;
}

/**
 * تفصيل الخدمات من **لقطة `booking_extras` المجمَّدة** — المصدر الفعلي.
 *
 * ── لماذا عميل الخدمة، وهو استثناء يحتاج مبرراً ───────────────────────────
 * `booking_extras` محجوب عن `anon` كلياً (‏`revoke all` في 0031 §٣)، وسياسته
 * الوحيدة للقراءة `is_admin()`. فالزائر لا يصل إليه لا بالجدول ولا بدالة —
 * و`get_booking_by_token` لا تُخرجه. وبدون هذه القراءة يبقى الحال الذي أمسكته
 * المراجعة: **عميلٌ دفع ثمن كرسيَّي أطفال يرى إجمالاً أكبر من سعر رحلته بلا سطر
 * واحد يفسّر الفرق** — بطاقةُ الخدمات مكتوبة في هذا الملف ولا تُصيَّر أبداً.
 *
 * والصلاحية لا تُوسَّع بها رؤية: التوكن هو ما فتح الحجز أصلاً في السطر السابق،
 * والقراءة **مقيَّدة بمعرّف ذلك الحجز وحده** وبأربعة أعمدة تخصّ العميل — ولا
 * `extra_id` ولا `created_at`، فالكائن يُبنى حقلاً حقلاً لا بالنسخ (نفس مبدأ
 * `redactPricing` في `/api/quote`).
 *
 * ── والفشل يقع فارغاً ─────────────────────────────────────────────────────
 * بلا `SUPABASE_SERVICE_ROLE_KEY`، أو قبل هجرة 0031، أو عند أي خطأ: قائمة
 * فارغة ⇒ تُخفى بطاقة التفصيل ويبقى مجموع الخدمات في بطاقة المبالغ من اللقطة.
 * الصفحة تفقد تفصيلاً ولا تعرض رقماً مخترعاً — ولا تسقط.
 *
 * 🔒 ولا حساب هنا: `qty × unitPrice` جرى في Postgres وخُزِّن في `line_total`.
 */
async function loadBookingExtras(bookingId: string): Promise<ExtraLine[]> {
  if (bookingId.length === 0) return [];

  const service = createServiceSupabase();
  if (!service) return [];

  const { data, error } = await service
    .from("booking_extras")
    .select("title_snapshot, qty, unit_price, line_total")
    .eq("booking_id", bookingId)
    // ترتيبٌ ثابت لا عشوائي: الصفوف تُدرَج في عبارة واحدة فتتساوى طوابعها،
    // والاسم يفصل التعادل حتى لا يتغير ترتيب العرض بين تحميل وآخر.
    .order("created_at", { ascending: true })
    .order("title_snapshot", { ascending: true })
    .limit(50);

  if (error || !Array.isArray(data)) return [];

  const lines: ExtraLine[] = [];
  for (const item of data as UnknownRow[]) {
    const title = readText(item, "title_snapshot");
    const qty = readNumber(item, "qty");
    if (!title || qty === null || qty <= 0) continue;
    lines.push({
      title,
      qty,
      unitPrice: readNumber(item, "unit_price"),
      lineTotal: readNumber(item, "line_total"),
    });
  }
  return lines;
}

/**
 * آخر إيصال مرفوض. سبب الرفض إلزامي على المشرف، وهو الفائدة الوحيدة من إظهاره
 * للعميل: يعرف ما ينقص تحويله بدل أن يعيد الرفع بالخطأ نفسه.
 */
function latestRejection(receipts: ReceiptView[]): ReceiptView | null {
  let latest: ReceiptView | null = null;
  let latestAt = Number.NEGATIVE_INFINITY;

  for (const receipt of receipts) {
    if (receipt.status !== "rejected") continue;

    const at = receipt.verifiedAt ?? receipt.createdAt;
    const parsed = at ? Date.parse(at) : Number.NaN;
    const key = Number.isFinite(parsed) ? parsed : Number.NEGATIVE_INFINITY;

    // «>=» لأن المصفوفة مرتبة تصاعدياً أصلاً: التعادل يرجّح الأحدث ترتيباً
    if (latest === null || key >= latestAt) {
      latest = receipt;
      latestAt = key;
    }
  }

  return latest;
}

/* ------------------------------------------------------------------ */
/* مؤشر الحالة                                                          */
/* ------------------------------------------------------------------ */

const STATUS_STEPS = [
  { key: "pendingPayment", label: "بانتظار الدفع", icon: Wallet },
  { key: "underReview", label: "قيد المراجعة", icon: Hourglass },
  { key: "confirmed", label: "تم التأكيد", icon: BadgeCheck },
  { key: "completed", label: "تم التنفيذ", icon: CircleCheck },
] as const;

/**
 * موضع كل حالة على المؤشر — «مُسند» يبقى ضمن مرحلة «مؤكد» في نظر العميل.
 *
 * و`failed` خارج المؤشر (‏`-1`) كـ`cancelled` تماماً، **ولنفس السبب لا مجاملةً**:
 * المؤشر خطٌّ يتقدّم، والحالتان انقطاعٌ لا تقدّم. ووضعُ «فشلت» عند الخطوة الرابعة
 * كان سيقول للعميل إن رحلته نُفِّذت.
 */
const STATUS_POSITION: Record<TrackedStatus, number> = {
  pending_payment: 0,
  under_review: 1,
  confirmed: 2,
  assigned: 2,
  completed: 3,
  cancelled: -1,
  failed: -1,
};

function StatusStepper({ status, t }: { status: TrackedStatus; t: Tx }) {
  const current = STATUS_POSITION[status];

  return (
    <ol className="grid grid-cols-4 gap-2" aria-label={t("stepsLabel", "مراحل الحجز")}>
      {STATUS_STEPS.map((step, index) => {
        const done = current > index;
        const active = current === index;
        const Icon = step.icon;
        return (
          <li key={step.key} className="flex flex-col items-center gap-2 text-center">
            <span
              aria-current={active ? "step" : undefined}
              className={
                done
                  ? "grid size-10 place-items-center rounded-full bg-primary/15 text-primary"
                  : active
                    ? "grid size-10 place-items-center rounded-full bg-primary text-primary-foreground shadow-sm shadow-primary/30"
                    : "grid size-10 place-items-center rounded-full bg-muted text-muted-foreground"
              }
            >
              <Icon className="size-5" aria-hidden="true" />
            </span>
            <span
              className={
                active
                  ? "text-xs font-semibold leading-5 text-foreground sm:text-sm"
                  : "text-xs leading-5 text-muted-foreground sm:text-sm"
              }
            >
              {t(`steps.${step.key}`, step.label)}
            </span>
          </li>
        );
      })}
    </ol>
  );
}

/* ------------------------------------------------------------------ */
/* بطاقة حساب استقبال المدفوعات                                          */
/* ------------------------------------------------------------------ */

/**
 * صفٌّ واحد كما ترجعه `available_payment_accounts(text, numeric)` — **والعقد هو
 * النوع**، لا نسخة منه هنا تنحرف عنه بعد أول توسيع (`lib/payment-fee-types.ts`).
 */
type PaymentAccountView = PaymentAccountChoice;

/**
 * ══════════════════════════════════════════════════════════════════════════════
 *  البند ١١ — «تصنيفات طرق الدفع خاطئة». ما قِيس، وما كان العطل فعلاً
 * ══════════════════════════════════════════════════════════════════════════════
 *
 * **الفرضية في الموجز كانت أن التصنيف قائمةٌ محفورة هنا. والقياس أسقطها:**
 * العائلة تُشتقّ في SQL بـ`payment_account_family(kind)` (‏`0070`) وهي **صحيحة**،
 * مقيسةً على القاعدة الحيّة: `instapay` و`wallet` ⇒ `wallet` · `bank` ⇒ `bank` ·
 * `card` ⇒ `card`. والجدولان أدناه احتياطيُّ ترجمةٍ لا قائمةُ سماح.
 *
 * **والعطل كان في العرض، وقِيس على الشاشة نفسها** (‏TR-MECP6W، أربعة حسابات
 * معروضة). المصيَّر فعلاً:
 *
 *     انستا باي            ← الاسم
 *     انستا باي            ← «النوع» — الكلمة نفسها حرفياً، مرتين
 *     ▸ طرق دفع أخرى (٣)
 *         محافظ إلكترونية  → فودافون كاش      ← عنوانٌ فوق **واحدةٍ من محفظتين**
 *         حسابات بنكية     → البنك العربي الإفريقي · بنك الكويت الوطني
 *
 * **ثلاثة عيوب متمايزة، وكلٌّ منها مقيس:**
 *
 *  (١) 🔴 **التصنيف يُقال مرتين لكل صف، ويتناقض مع نفسه.** السطر الثاني كان
 *      `ACCOUNT_KIND_FALLBACK[kind]` — أي تصنيفٌ بالـ`kind`، والعنوان فوقه
 *      تصنيفٌ بالـ`family`. فداخل «محافظ إلكترونية» يقول كل صفٍّ «محفظة
 *      إلكترونية» (تكرارٌ للعنوان)، **و`instapay` يقول «انستا باي» — اسمَ الحساب
 *      نفسه**. تصنيفان لفكرةٍ واحدة، أحدهما يعيد العنوان والآخر يعيد الاسم.
 *
 *  (٢) 🔴 **والأيقونة كانت تكذّب المجموعة.** `instapay: Landmark` — و`Landmark`
 *      هو رمز **البنك** (مبنى بأعمدة)، بينما `bank: Building2` مبنى مكاتب. أي
 *      أن الحساب الواقع تحت «محافظ إلكترونية» يلبس رمز بنك، والبنوك تلبس رمزاً
 *      عاماً. **فأُسندت الأيقونة إلى `family`** — نفس المصدر الذي يُسمّي
 *      المجموعة، فلا يمكن للرمز أن يخالف العنوان فوقه بنيوياً.
 *
 *  (٣) **والعنوان كان يصف نصف عائلته.** التجميع يقع على `rest` (ما بعد إبراز
 *      الخيار المفضَّل)، فـ«محافظ إلكترونية» تغطي فودافون كاش وحدها وانستا باي
 *      محفظةٌ كذلك لكنها فوق الكشف. **والعلاج ليس نقل التجميع** — الإبراز قرارٌ
 *      معتمد (ن‑٩ ب-١) وإلغاؤه نقضٌ له — بل **أن يُقال التصنيف مرةً واحدة في
 *      الموضع الذي لا عنوانَ فيه**: البطاقةُ المُبرَزة تحمل عائلتها نصّاً، ومن
 *      تحت عنوانٍ يذكرها لا يعيدها. فلا صفَّ بلا تصنيف، ولا صفَّ بتصنيفين.
 *
 * ⚠ **ولا قائمة أنواع تحكم الظهور في أي طبقة** — لا هنا ولا في SQL. الحكم
 *   `active AND customer_facing` وحدهما عبر `payment_account_customer_visible`.
 *   ونوعٌ يضيفه بدر غداً بلا مدخلٍ في الجدولين يظهر بمفتاح عائلته وبأيقونةٍ
 *   افتراضية — **لأن حساباً لا يُعرض مالٌ لا يصل**.
 */
const FAMILY_ICON: Record<string, typeof Wallet> = {
  wallet: Wallet,
  bank: Building2,
  card: CreditCard,
  cash: Banknote,
};

/**
 * اسم العائلة — **احتياطيُّ ترجمةٍ لا قائمةُ سماح.** الفرق جوهري: العائلة نفسها
 * تصل من القاعدة (`payment_account_family` في `0070`)، وعائلةٌ لا مدخل لها هنا
 * تُعرض بمفتاحها كما وصل ولا تسقط — لأن حساباً لا يُعرض **مالٌ لا يصل**.
 */
const ACCOUNT_FAMILY_FALLBACK: Record<string, string> = {
  wallet: "محافظ إلكترونية",
  bank: "حسابات بنكية",
  card: "بطاقات",
  cash: "نقداً",
  other: "طرق أخرى",
};

/** اسم العائلة مفرداً — لبطاقةٍ واحدة لا لعنوان مجموعة */
const ACCOUNT_FAMILY_ONE_FALLBACK: Record<string, string> = {
  wallet: "محفظة إلكترونية",
  bank: "حساب بنكي",
  card: "بطاقة",
  cash: "نقداً",
  other: "طريقة أخرى",
};

/**
 * علامة الوسيلة (البند ١٢) — «الصورة أبلغ وأسرع في توصيل المعلومة من النص».
 *
 * وهو محقّ لسببٍ أدقّ من الجمال: العميل **يتعرّف** على علامة فودافون كاش ولا
 * **يقرأ** اسمها، وصفحةٌ كل غرضها أن يدفع لا تملك ثانيةً تُهدر في قراءة.
 *
 * 🔒 **والمسار يمرّ بـ`safeMediaSrc` — الحارس نفسه الذي يحرس كل صورة في الموقع**
 * (الذهبية ١٢: فوِّض ولا تستنسخ). وهي الطبقة الثانية لا الأولى: القيد
 * `payment_accounts_image_internal_chk` في `0093` يمنع تخزين غير المسار الداخلي
 * أصلاً، فالموقع يبقى بصفر طلبات خارجية حتى لو كتب أحدٌ في الجدول من تحت اللوحة.
 *
 * **و`alt=""` مقصود لا سهو:** الاسم مكتوبٌ بجانب العلامة مباشرةً، فنصٌّ بديل
 * يعيده يجعل قارئ الشاشة ينطق «فودافون كاش فودافون كاش». الصورة هنا **تعزيزٌ
 * بصري** لنصٍّ حاضر — وهو تعريف الصورة الزخرفية.
 *
 * و`object-contain`: الشعارات مستطيلةٌ ومربّعةٌ ومختلفة النسب، و`cover` كان
 * سيقصّ حرفاً من علامةٍ ويشوّه أخرى.
 */
function AccountMark({ account }: { account: PaymentAccountView }) {
  const src = safeMediaSrc(account.imageUrl);
  if (src !== null) {
    return (
      <span className="grid size-9 shrink-0 place-items-center overflow-hidden rounded-xl bg-muted">
        {/* eslint-disable-next-line @next/next/no-img-element -- لا remotePatterns للتخزين (نفس حجّة components/sections/image.tsx) */}
        <img src={src} alt="" loading="lazy" decoding="async" className="size-full object-contain" />
      </span>
    );
  }
  // بلا علامة: أيقونة العائلة — **من `family` لا من `kind`**، فلا تخالف عنوان
  // المجموعة فوقها (العيب ٢ أعلاه). والمجهول يأخذ المحفظة افتراضاً ولا يسقط.
  const Icon = FAMILY_ICON[account.family] ?? Wallet;
  return (
    <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary">
      <Icon className="size-5" aria-hidden="true" />
    </span>
  );
}

type AccountGroup = { family: string; accounts: PaymentAccountView[] };

/**
 * تجميعٌ بالعائلة **بترتيب الوصول** — ن‑٩ (ب-٢).
 *
 * والقاعدة رتّبت القائمة بالأرخص أولاً (`0070`)، فأول ظهورٍ لعائلةٍ يحدّد موضعها:
 * المجموعة التي فيها أرخص خيار تأتي أولاً. أي أن الترتيب **يبقى مقارنةً** بعد
 * التجميع ولا ينقلب إلى تصنيفٍ أبجدي يخفي الثمن.
 */
function groupByFamily(accounts: PaymentAccountView[]): AccountGroup[] {
  const groups: AccountGroup[] = [];
  for (const account of accounts) {
    const family = account.family || account.kind || "other";
    const found = groups.find((group) => group.family === family);
    if (found) found.accounts.push(account);
    else groups.push({ family, accounts: [account] });
  }
  return groups;
}

/**
 * اختيار حساب التحويل — **خيارٌ واحد ببياناته، لا كل الأرقام دفعةً واحدة.**
 *
 * قرار بدر (2026-08-16): «عرض الحسابات على شكل خيارات يقوم العميل باختيار
 * الحساب المطلوب لعرض بياناته». والسبب تشغيلي لا جمالي: صفٌّ من ستة أرقام
 * متجاورة يُنتج تحويلاتٍ إلى الرقم الخطأ، وكل تحويل خاطئ مكالمةُ دعم ومالٌ
 * معلّق. فيُعرض رقمٌ واحد في كل لحظة: الذي اختاره العميل بنفسه.
 *
 * **وبلا جافاسكربت**: الكشف بـ`peer-checked` على مدخل راديو حقيقي، فالصفحة
 * تعمل كاملةً لو تعطّل السكربت — والاسم الموحّد `transfer-account` يجعل
 * المتصفح نفسه يضمن أن واحداً فقط مختار.
 *
 * والترتيب `sort` من القاعدة (‏`payment_accounts_within_caps`)، فالحساب الأول
 * هو ما رتّبه بدر أولاً — وهو المختار افتراضياً كي لا تبدأ الصفحة فارغة، وكي
 * تحمل الورقةُ المطبوعة رقماً واحداً صالحاً.
 *
 * ── وعمولة التحويل (ن‑١) تعيش هنا لا في بطاقة المبالغ ─────────────────────
 *
 * العمولة **تختلف باختلاف الحساب**، فرقمٌ واحد فوق الصفحة يكذب على من يختار
 * غيره. ولذلك تُصيَّر داخل لوحة الحساب المكشوفة نفسها: من اختار فودافون كاش رأى
 * عمولتها ومطلوبَها، ومن بدّل إلى انستا باي **تبدّل الرقمان أمامه** — وكل ذلك
 * بـCSS وحدها (`peer-checked`) بلا سطر جافاسكربت، كبقية هذا المنتقي.
 *
 * 🔒 **وتُعرض سطراً مستقلاً دائماً، لا مدسوسةً في الإجمالي.** هذا شرط بدر نصاً،
 * وهو ما يفرّق «رسمٌ معلَن قبل الدفع» عن «مبلغٌ اكتشفه العميل بعد التحويل» —
 * وثانيهما هو الشكوى التي وُجدت هذه المنصة لتتجنّبها.
 */
/** بطاقة خيارٍ واحد — يستعملها المُبرَز والمجموعات معاً، فلا نسختان تنحرفان */
function AccountOption({
  account,
  checked,
  cheapest,
  showAmount,
  showFamily,
  currency,
  fmt,
  t,
}: {
  account: PaymentAccountView;
  checked: boolean;
  /** أرخص خيارٍ في القائمة — ولا يُمرَّر `true` إلا حين تختلف العمولات فعلاً */
  cheapest: boolean;
  /** يُظهر المطلوب على السطر نفسه — لا يُطلب إلا حين تختلف الأرقام (ن‑٩ ب-٤) */
  showAmount: boolean;
  /**
   * أيُذكر التصنيف على هذه البطاقة؟ — **البند ١١، العيبان (١) و(٣).**
   *
   * `true` للبطاقة المُبرَزة وحدها: هي الوحيدة التي لا عنوانَ مجموعةٍ فوقها،
   * فبلا هذا السطر لا يعرف العميل أن انستا باي محفظةٌ كذلك. و`false` لما تحت
   * عنوانٍ يذكر العائلة — **فلا يُقال التصنيف مرتين لصفٍّ واحد**.
   */
  showFamily: boolean;
  currency: string;
  fmt: LocaleFormatter;
  t: Tx;
}) {
  const inputId = `transfer-account-${account.id}`;
  // 🔒 المفتاح `family` لا `kind`: هو ما يُسمّي المجموعة، فلا ينطق الصفُّ تصنيفاً
  //    يخالف عنوانه — ولا يعيد اسم الحساب حرفياً كما كان يفعل `instapay`.
  const familyLabel = showFamily
    ? t(
        `pay.accountFamilyOne.${account.family}`,
        ACCOUNT_FAMILY_ONE_FALLBACK[account.family] ?? ""
      )
    : "";

  return (
    <li
      className={cn(
        "relative flex flex-col rounded-2xl border border-border bg-card text-card-foreground",
        /**
         * ⚠ **بلا `transition-colors` هنا — مقيسٌ لا مفترَض.**
         * مع الانتقال يترك كروم البطاقةَ المتروكة **عالقةً ملوّنة**:
         * تبديل الاختيار يُبطل مطابقة `:has(:checked)` في منتصف الانتقال
         * فتتجمّد القيمة المُستوفاة (‏`oklab(0.65 …)` = اللون الأساسي) على
         * عنصرٍ لم يعد مختاراً — فيظهر خياران مُحدَّدان في عين العميل وهو
         * يحوّل مالاً. قيس حياً: بحذف الصنف وحده تبع التلوينُ الاختيارَ
         * ذهاباً وإياباً. والكشف فوريّ أصلاً فلا شيء يُفقد.
         */
        "has-[:checked]:border-primary has-[:checked]:bg-primary/5 has-[:checked]:shadow-sm has-[:checked]:shadow-primary/10",
        // 🖨 الورقة تحمل الحساب المختار وحده — بقية الخيارات أسماءٌ بلا
        // أرقام على الورق، وحضورها يشوّش على من يحوّل من الورقة.
        "print:hidden has-[:checked]:print:flex"
      )}
    >
      <input
        id={inputId}
        type="radio"
        name={TRANSFER_GROUP}
        // ⚠ القيمة ليست زينة: `RememberTransferAccount` يقرؤها ليكتب التفضيل
        value={account.id}
        defaultChecked={checked}
        className="peer absolute top-5 start-4 size-4 shrink-0 accent-primary"
      />
      <label
        htmlFor={inputId}
        className="flex cursor-pointer items-center gap-2.5 p-4 ps-11"
      >
        <AccountMark account={account} />
        <span className="flex min-w-0 flex-1 flex-col">
          <span className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm font-bold">
            {account.label}
            {cheapest ? (
              <span className="rounded-full bg-primary/15 px-2 py-0.5 text-[11px] font-semibold text-primary">
                {t("pay.cheapest", "الأوفر")}
              </span>
            ) : null}
          </span>
          {familyLabel ? (
            <span className="text-xs leading-5 text-muted-foreground">{familyLabel}</span>
          ) : null}
        </span>

        {/*
          🔴 **الرقم على السطر نفسه — وهو ما يقلب الشاشة من قائمة إلى مقارنة.**
          ولا يُصيَّر إلا حين تختلف الأرقام فعلاً: ثلاثة أسطر تحمل الرقم نفسه
          ليست مقارنة بل ضجيج، والرقم حينها مكتوبٌ في عنوان القسم أصلاً.
        */}
        {showAmount ? (
          <span className="flex shrink-0 flex-col items-end">
            <span className="text-sm font-extrabold">
              {fmt.money(account.dueWithFee, currency)}
            </span>
            <span className="text-[11px] leading-4 text-muted-foreground">
              {account.fee > 0
                ? t("pay.feePlus", "+{amount}", { amount: fmt.money(account.fee, currency) })
                : t("pay.feeNone", "بلا عمولة")}
            </span>
          </span>
        ) : null}
      </label>

      {/* البيانات لا تُصيَّر إلا للمختار — والكشف بـCSS وحدها */}
      <div className="hidden flex-col gap-3 px-4 pb-4 ps-11 peer-checked:flex">
        <div className="flex items-center gap-2">
          <span
            dir="ltr"
            className="min-w-0 flex-1 truncate rounded-xl bg-muted px-3 py-2 text-start font-mono text-sm"
          >
            {account.handle}
          </span>
          <CopyButton
            value={account.handle}
            label={t("pay.accountCopyLabel", "رقم {label}", { label: account.label })}
          />
        </div>

        {account.holderName ? (
          <p className="text-xs leading-5 text-muted-foreground">
            {t("pay.accountHolder", "باسم:")}{" "}
            <span className="font-medium text-foreground">{account.holderName}</span>
          </p>
        ) : null}

        {/*
          المبلغ الذي يحوّله العميل إلى **هذا** الحساب. وسطر العمولة لا
          يُصيَّر إلا حين توجد فعلاً: «عمولة التحويل ٠» على حسابٍ بلا
          عمولة سؤالٌ لا معلومة، ويجعل العميل يبحث عن رسمٍ لا وجود له.
        */}
        <dl className="flex flex-col gap-1.5 border-t border-border/70 pt-3 text-sm">
          {account.fee > 0 ? (
            <>
              <div className="flex items-center justify-between gap-3">
                <dt className="text-muted-foreground">
                  {t("pay.feeBase", "المطلوب للرحلة")}
                </dt>
                <dd>{fmt.money(account.dueWithFee - account.fee, currency)}</dd>
              </div>
              <div className="flex items-center justify-between gap-3">
                <dt className="text-muted-foreground">{t("pay.fee", "عمولة التحويل")}</dt>
                <dd className="font-medium">
                  {t("pay.feePlus", "+{amount}", {
                    amount: fmt.money(account.fee, currency),
                  })}
                </dd>
              </div>
            </>
          ) : null}
          <div className="flex items-center justify-between gap-3">
            <dt className="font-semibold">{t("pay.dueOnAccount", "المطلوب تحويله الآن")}</dt>
            <dd className="text-base font-extrabold">
              {fmt.money(account.dueWithFee, currency)}
            </dd>
          </div>
        </dl>

        {account.fee > 0 ? (
          <p className="text-xs leading-5 text-muted-foreground">
            {t(
              "pay.feeNote",
              "عمولة هذا الحساب وحده، وهي ثابتة على حجزك مهما تغيّرت لاحقاً."
            )}
          </p>
        ) : null}
      </div>
    </li>
  );
}

function AccountChooser({
  accounts,
  preferredId,
  anyFee,
  currency,
  fmt,
  t,
}: {
  accounts: PaymentAccountView[];
  /** الخيار الذي يبدأ مختاراً — المتذكَّر إن بقي معروضاً، وإلا الأرخص */
  preferredId: string | null;
  /** تختلف العمولات فعلاً؟ يحكم ظهور الأرقام على السطور ووسم «الأوفر» */
  anyFee: boolean;
  currency: string;
  fmt: LocaleFormatter;
  t: Tx;
}) {
  // ⚠ حارس فراغٍ صريح: `strict` هنا بلا `noUncheckedIndexedAccess`، فـ`accounts[0]`
  //   يُكتب كأنه موجود دائماً ولا يُنبّه المترجمُ على قائمةٍ فارغة. والمنادي يحرس
  //   بـ`accounts.length > 0` اليوم — وهذا السطر يبقى صحيحاً لو تغيّر ذلك غداً.
  const primary = accounts.find((account) => account.id === preferredId) ?? accounts[0];
  if (!primary) return null;

  const single = accounts.length === 1;
  const rest = accounts.filter((account) => account.id !== primary.id);
  const groups = groupByFamily(rest);

  // «الأوفر» لا يُقال إلا حين يعني شيئاً: بلا عمولاتٍ مضبوطة كل الخيارات سواء،
  // ووسمُ أحدها «الأوفر» حينئذٍ ادّعاءُ فرقٍ لا وجود له (القاعدة ١٥).
  const cheapestId = anyFee ? (accounts[0]?.id ?? null) : null;
  const cheapestRest = anyFee && rest.length > 0 ? rest[0] : null;

  return (
    <fieldset className="flex flex-col gap-2.5">
      <legend className="mb-2.5 text-sm font-bold">
        {single
          ? t("pay.accountsLegendOne", "حوّل إلى هذا الحساب")
          : t("pay.accountsLegend", "اختر الحساب الذي ستحوّل إليه")}
      </legend>

      {/*
        ── تدرّجٌ لا مساواة (ن‑٩ ب-١) ────────────────────────────────────────
        شكوى بدر: «أشعر بالزحام… رغم أن الهدف من تعدد الخيارات هو التسهيل».
        والوسيلة كانت تعمل ضد الهدف: في الدفع **كل خيارٍ إضافي قرارٌ يُلقى على
        العميل وهو ممسكٌ بمحفظته**. فواحدٌ مُبرَز — المتذكَّر أو الأوفر — والباقي
        خلف كشفٍ يفتحه من أراد المقارنة.

        و`<details>` وسمٌ أصلي: يعمل بلا جافاسكربت، ويعلن حالته لقارئ الشاشة،
        ولا يحتاج `aria-expanded` نكتبه بأيدينا فينحرف عن الحقيقة.
      */}
      <ul className="flex flex-col gap-2.5">
        <AccountOption
          account={primary}
          checked
          cheapest={primary.id === cheapestId}
          showAmount={anyFee}
          // 🔒 هنا وحدها — لا عنوانَ مجموعةٍ فوق المُبرَزة (البند ١١)
          showFamily
          currency={currency}
          fmt={fmt}
          t={t}
        />
      </ul>

      {rest.length > 0 ? (
        <details className="pay-more group rounded-2xl border border-dashed border-border">
          <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-3 text-sm font-medium marker:content-none hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50">
            <span className="flex items-center gap-2">
              <Wallet className="size-4 shrink-0 text-primary" aria-hidden="true" />
              {t("pay.moreMethods", "طرق دفع أخرى ({count})", {
                count: fmt.digits(rest.length),
              })}
            </span>
            {/* الأرخص خلف الكشف يُعلَن على غلافه — وإلا صار الإخفاء إخفاءَ ثمن */}
            {cheapestRest ? (
              <span className="text-xs font-semibold text-primary">
                {t("pay.moreFrom", "من {amount}", {
                  amount: fmt.money(cheapestRest.dueWithFee, currency),
                })}
              </span>
            ) : null}
          </summary>

          <div className="flex flex-col gap-4 border-t border-border px-3 pb-3 pt-3">
            {groups.map((group) => (
              <div key={group.family} className="flex flex-col gap-2">
                {/*
                  عنوان العائلة (ن‑٩ ب-٢) — والمفتاح يأتي من القاعدة، فعائلةٌ
                  جديدة تظهر بمجموعتها بلا نشرة. والاحتياطي اسمُها كما وصل.

                  ⚠ **و`h3` لا `h4` — رتبةٌ مقيسة لا مختارة.** الكتلة كلها تحت
                  «ادفع … لتأكيد الحجز» وهي `h2`، فـ`h4` كانت تقفز رتبةً
                  (٢→٤): من يتنقّل بالعناوين في قارئ الشاشة يسمع «عنوان مستوى
                  ٤» فيظنّ أنه فوّت قسماً بينهما. والرتبة الصحيحة هي رتبة
                  «بعد التحويل: ارفع الإيصال» نفسها — كلاهما قسمٌ من الدفع.
                  والشكل من الأصناف لا من الوسم، فلا يتغيّر بكسل.
                */}
                <h3 className="px-1 text-xs font-semibold text-muted-foreground">
                  {t(
                    `pay.accountFamily.${group.family}`,
                    ACCOUNT_FAMILY_FALLBACK[group.family] ?? group.family
                  )}
                </h3>
                <ul className="flex flex-col gap-2.5">
                  {group.accounts.map((account) => (
                    <AccountOption
                      key={account.id}
                      account={account}
                      checked={false}
                      cheapest={account.id === cheapestId}
                      showAmount={anyFee}
                      // العنوان فوقها يقول العائلة — فلا تُقال ثانيةً في الصف
                      showFamily={false}
                      currency={currency}
                      fmt={fmt}
                      t={t}
                    />
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </details>
      ) : null}

      {/* يكتب التفضيل ولا يُصيَّر شيئاً — المنتقي يبقى خادمياً بالكامل */}
      <RememberTransferAccount groupName={TRANSFER_GROUP} />
    </fieldset>
  );
}

/* ------------------------------------------------------------------ */
/* بطاقة إيصال تحويل                                                     */
/* ------------------------------------------------------------------ */

/**
 * وصف كل حالة بلسان العميل لا بلسان الدفتر: «pending» عنده انتظارُ فريقنا لا
 * حالةُ صفٍّ في جدول، و«rejected» لا يُقال «مرفوض» بل «لم يُعتمد» ومعه السبب.
 */
const RECEIPT_STATUS_META: Record<
  ReceiptStatus,
  { key: string; label: string; badge: string; icon: typeof Hourglass }
> = {
  pending: {
    key: "receipts.status.pending",
    label: "قيد المراجعة من فريقنا",
    badge: "bg-muted text-muted-foreground",
    icon: Hourglass,
  },
  approved: {
    key: "receipts.status.approved",
    label: "تم الاعتماد",
    badge: "bg-primary/10 text-primary",
    icon: BadgeCheck,
  },
  rejected: {
    key: "receipts.status.rejected",
    label: "لم يُعتمد",
    badge: "bg-amber-500/10 text-amber-900 dark:text-amber-200",
    icon: TriangleAlert,
  },
};

function ReceiptCard({
  receipt,
  currency,
  fmt,
  t,
}: {
  receipt: ReceiptView;
  currency: string;
  fmt: LocaleFormatter;
  t: Tx;
}) {
  const meta = RECEIPT_STATUS_META[receipt.status];
  const Icon = meta.icon;
  const createdLabel = fmt.dateTime(receipt.createdAt);
  const verifiedLabel = fmt.dateTime(receipt.verifiedAt);

  return (
    <li className="flex flex-col gap-2.5 rounded-2xl border border-border px-4 py-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        {receipt.amount !== null ? (
          <span className="text-sm font-bold">{fmt.money(receipt.amount, currency)}</span>
        ) : (
          <span aria-hidden="true" />
        )}
        <span
          className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold ${meta.badge}`}
        >
          <Icon className="size-3.5 shrink-0" aria-hidden="true" />
          {t(meta.key, meta.label)}
        </span>
      </div>

      {/* الملاحظة يكتبها فريق التشغيل (‏`verify_payment` أو رفع اللوحة) — ورفع
          الضيف يصل بلا ملاحظة، فالسطر يغيب بلا فراغ */}
      {receipt.note ? (
        <div className="flex flex-col gap-0.5">
          <p className="text-xs font-medium text-muted-foreground">
            {receipt.status === "rejected"
              ? t("receipts.reasonLabel", "سبب عدم الاعتماد")
              : t("receipts.noteLabel", "ملاحظة من فريقنا")}
          </p>
          <p className="whitespace-pre-line text-sm leading-7">{receipt.note}</p>
        </div>
      ) : null}

      {createdLabel || verifiedLabel ? (
        <div className="flex flex-col gap-1 text-xs leading-6 text-muted-foreground">
          {createdLabel ? (
            <p>{t("receipts.receivedAt", "وصلنا في {value}", { value: createdLabel })}</p>
          ) : null}
          {verifiedLabel ? (
            <p>{t("receipts.reviewedAt", "روجع في {value}", { value: verifiedLabel })}</p>
          ) : null}
        </div>
      ) : null}
    </li>
  );
}

/* ------------------------------------------------------------------ */
/* ورقة الرحلة المطبوعة                                                  */
/* ------------------------------------------------------------------ */

/**
 * ورقة الرحلة — **إضافةٌ فوق نظام الطباعة المشترك لا نسخة ثانية منه.**
 *
 * الطباعة في هذا المشروع `window.print()` + `@media print` بلا مكتبة ولا PDF
 * مولَّد في الخادم (عقد `lib/export-types.ts` §٤): المتصفح يرسم العربية من اليمين
 * لليسار بدقة لا يبلغها خادم يرسم، ومجاناً.
 *
 * وجسمُ القواعد يعيش في كتلة الطباعة في `app/globals.css`، ومنها تصل هذه الصفحة
 * مجاناً: إخفاء `header`، وفكّ الألوان إلى أسود على أبيض تحت `.print-sheet`،
 * وإسقاط كل أداة تفاعل داخلها (`form` و`button` و`input` و`select` و`textarea`)،
 * وصنف `.no-print` المتعاقد عليه، وهامش `@page`. فتلبس `<main>` هنا `print-sheet`
 * كما تلبسها كل شاشة تُطبع، **ولا تُنسخ قاعدة واحدة منها إلى هنا**: خمس نسخ من
 * كتلة واحدة تنحرف بصمت (النمط ٨ في `handover/LESSONS.md`)، والصفحة العامة سادسة.
 *
 * وما تحت هذا السطر هو ما لا تملكه الكتلة المشتركة وحدها:
 *
 *   • **`footer`** — تذييل الموقع العام. اللوحة لا تملك تذييلاً فليس في القواعد
 *     العامة، وهو هنا صفحتان من روابط وشبكات اجتماعية على ورقة رحلة. (وقاعدته
 *     مكانها الطبيعي تلك الكتلة يوم يلتقي البناءان.)
 *   • **منتقي وسيلة الدفع** (`PaymentMethodChoice`) — تسمياتٌ بلا مدخلات على
 *     الورق (القاعدة المشتركة تُسقط `input`)، فيذهب كاملاً بصنف `no-print`.
 *
 *     🔴 **وكانت القاعدة `fieldset` عارياً — فكانت تبتلع منتقي الحسابات معه.**
 *     `AccountChooser` وسمُه `fieldset` كذلك، فكل أرقام التحويل كانت تسقط من
 *     الورقة رغم أن التعليق أدناه يَعِد بطبعها، ورغم `has-[:checked]:print:flex`
 *     على البطاقة المختارة: أصلٌ بـ`display:none !important` لا يُنقَض من ذرّيته.
 *     أي أن من يطبع صفحته ليحوّل من الورقة كان يخرج بورقةٍ **بلا رقمٍ واحد** —
 *     وهو نقيض `lib/export-types.ts` §٤ نصّاً. فصار الحجب على المنتقي وحده.
 *   • **مقاسات هذه الورقة وحدها** — بطنُ الصفحة وبطاقاتها وترويستها.
 *   • **تعويض ما يذهب مع اللون**: مؤشّر الحالة أربع دوائر يفرّق بينها اللون وحده،
 *     فيُحاط الحالي بإطار، ويُكشف معه سطر `print-only` يقول الحالة بالكلمات.
 *     ونفس المبدأ لاسم العلامة وهاتفها: يظهران على الورقة وحدها لأن الترويسة
 *     وأزرار التواصل ذهبتا.
 *
 * وأرقام حسابات التحويل **تُطبع عمداً**: من يطبع ورقته وهو بانتظار الدفع يحتاجها
 * في يده، وهي نصّ لا أداة تفاعل.
 */
const PRINT_CSS = `
@media print {
  footer { display: none !important; }
  /* كشف «طرق دفع أخرى» يُفتح على الورق: البطاقة المختارة قد تكون داخله،
     وقاعدة \`has-[:checked]:print:flex\` لا تنفع داخل كشفٍ مطويّ. والغلاف
     نفسه يذهب — لا معنى لزرّ فتحٍ على ورقة. */
  .print-sheet details.pay-more { border: 0 !important; }
  .print-sheet details.pay-more > summary { display: none !important; }
  .print-sheet details.pay-more::details-content {
    content-visibility: visible !important;
    block-size: auto !important;
  }
  /* 🖨 وطيّةُ الحساب تُفتح كذلك (٩): الورقة تحمل الحساب كاملاً — طيٌّ يصلح
     لشاشةٍ تُنقر لا لورقةٍ لا يُنقر فيها شيء. ونفس القاعدة الثلاثية التي تفتح
     «طرق دفع أخرى» أعلاه، لأن \`::details-content\` هو ما يحجب فعلاً.
     ⚠ والغلاف يبقى ظاهراً هنا خلافاً لذاك: هو سطرُ «تفصيل الحساب» والإجمالي،
     أي عنوانُ القسم على الورق — لا زرَّ فتحٍ يذهب معه. */
  .print-sheet details.sheet-fold { border: 0 !important; }
  .print-sheet details.sheet-fold > summary { list-style: none !important; }
  /* والحشو الداخلي يُصفَّر: الإطار أعلاه يحمل حشو البطاقة، وإبقاء \`p-5\` معه
     يُخرج الطيّة بضعف هامش أخواتها على الورق */
  .print-sheet details.sheet-fold > summary,
  .print-sheet details.sheet-fold > div { padding: 0 !important; }
  .print-sheet details.sheet-fold > div { gap: 8px !important; }
  .print-sheet details.sheet-fold::details-content {
    content-visibility: visible !important;
    block-size: auto !important;
  }
  .print-sheet .print-only { display: block !important; }
  .print-sheet [aria-current="step"] { outline: 1px solid #000 !important; }
  .print-sheet .sheet-hero { padding-top: 0 !important; padding-bottom: 8px !important; }
  .print-sheet .sheet-body { gap: 10px !important; padding: 0 !important; }
  /* ⚠ و\`details.sheet-fold\` معها: طيّة الحساب **أختُ البطاقات لا حاشية**، وبلا
     ذكرها هنا تخرج على الورق بلا إطارٍ ولا هامش بين إخوةٍ كلُّهم مُحاطون —
     فتُقرأ زائدةً على الورقة وهي أهمُّ ما فيها بعد أرقام التحويل. */
  .print-sheet .sheet-body > section,
  .print-sheet .sheet-body > details.sheet-fold {
    border: 1px solid #999 !important;
    padding: 10px 12px !important;
    break-inside: avoid;
  }
  .print-sheet .sheet-body dl > div { padding: 2px 0 !important; }
}
`;

/* ------------------------------------------------------------------ */
/* حياةٌ في بطاقة الحالة — ن‑٩ (د)                                       */
/* ------------------------------------------------------------------ */

/**
 * حركتان مختلفتان لأن الحالتين مختلفتان — قرار بدر بعد عرض السبب:
 *
 * | الحالة | المعالجة | لماذا |
 * |---|---|---|
 * | **بانتظار الدفع** | نبضٌ مستمر | هنا الإلحاح الحقيقي، ومعه العدّاد |
 * | **مؤكَّد** | حركةٌ واحدة عند الوصول ثم سكون | علامةُ ثقةٍ لا تنبيه |
 *
 * **الحركة الدائمة تقول «انتبه»**، ووضعُها على حجزٍ مؤكَّد تصرخ حيث لا شيء
 * يستدعي — ويقرأ قارئُ الشاشة اضطرابها بلا خبر. **وسكونُ المؤكَّد يقرأ «راقٍ»
 * لا «ناقص»**، وهو أقرب إلى واجهة الشركات الكبرى التي طلبها.
 *
 * ── وثلاثة قيود بنيوية، لا انضباطية ───────────────────────────────────────
 *
 * ١. **كل شيء داخل `prefers-reduced-motion: no-preference`.** والإطارات نفسها
 *    مُعرَّفة داخله، فمن طلب تقليل الحركة **لا يصله تعريفٌ أصلاً** — لا حركة
 *    تُلغى بقاعدةٍ ثانية قد تُنسى.
 * ٢. **والبديل لونٌ وأيقونة لا حذف.** الحالة الصامدة هي الحالة النهائية للحركة
 *    (ظهورٌ كامل)، فغياب الحركة يترك البطاقة كما هي بأيقونتها ولونها — لا
 *    فراغاً ولا عنصراً عالقاً على `opacity: 0`.
 * ٣. **ولا لونٍ واحد هنا.** الإطارات تحرّك `transform` و`opacity` وحدهما،
 *    واللونُ يأتي من صنف Tailwind على العنصر نفسه (`bg-primary/…`) — أي من
 *    رموز اللوحة. فتغييرُ بدر لألوانه يتبعه النبض بلا لمس هذا الملف.
 */
const MOTION_CSS = `
@media (prefers-reduced-motion: no-preference) {
  @keyframes bk-pulse-ring {
    0%   { transform: scale(0.9); opacity: 0.55; }
    70%  { transform: scale(1.75); opacity: 0; }
    100% { transform: scale(1.75); opacity: 0; }
  }
  .bk-pulse-ring { animation: bk-pulse-ring 2.4s cubic-bezier(0.24, 0.6, 0.3, 1) infinite; }

  /* ⚠ بلا opacity في هذا الإطار — مقيسٌ لا مفترَض.
     كان يبدأ من opacity:0 مع fill-mode:both، فالعنصر معدومٌ قبل أن تبدأ
     الحركة: قِيس حياً opacity = 0 على الدرع لحظة أول تصيير. وأي سببٍ يمنع
     الإطار من العمل — امتدادٌ يحقن CSS، أو خطأ تصييرٍ في وسم النمط — يترك
     بطاقة «حجزك مؤكد» بلا علامتها، وهو بعينه ما نُهي عنه: البديل لونٌ
     وأيقونة، لا حذفٌ للحالة. فالمقياس وحده يتحرك هنا، والتلاشي تحمله الحلقة
     — وهي زخرفةٌ غيابُها لا ينقص خبراً. */
  @keyframes bk-arrive-mark {
    0%   { transform: scale(0.62); }
    55%  { transform: scale(1.08); }
    100% { transform: scale(1); }
  }
  .bk-arrive { animation: bk-arrive-mark 620ms cubic-bezier(0.2, 0.9, 0.3, 1) both; }

  @keyframes bk-arrive-ring {
    0%   { transform: scale(0.85); opacity: 0.5; }
    100% { transform: scale(1.95); opacity: 0; }
  }
  .bk-arrive-ring { animation: bk-arrive-ring 900ms ease-out 120ms both; }
}
`;

/* ------------------------------------------------------------------ */
/* الصفحة                                                               */
/* ------------------------------------------------------------------ */

/**
 * نافذة العدّاد — ن‑٩ (ج): «ولا يظهر إلا حيث يعمل الكنس فعلاً».
 *
 * `booking_hold_until` تأخذ الأبعد من (الإنشاء + المهلة) و(الموعد − المهلة)،
 * فحجزُ رحلةٍ بعد شهرٍ محفوظٌ قرابة الشهر. وعدّادٌ يقول «باقٍ ٢٩ يوماً» ليس
 * كذباً لكنه **تهديدٌ بلا سبب** على من لا يقترب موعده — وهو ما نُهي عنه نصاً.
 * فدون هذه النافذة تبقى الجملة بالتاريخ وحدها، وداخلها يظهر العدّاد.
 */
const COUNTDOWN_WINDOW_MS = 24 * 60 * 60 * 1000;

/**
 * هل يقع موعد الكنس داخل نافذة العدّاد؟
 *
 * ⚠ **ودالةٌ في جذر الملف لا سطرٌ داخل الصفحة — بنفس حجّة `holdWindowPassed`
 * و`phoneWindowClosed` حرفاً بحرف**: قراءة الساعة أثرٌ جانبي لا يُكتب في جسم
 * مكوّن (‏`react-hooks/purity`). وكان السطر `holdUntilMs - Date.now()` مكتوباً
 * في جسم الصفحة فأسقطته القاعدة، **وهو الموضع الذي يستضيف عدّاد مهلة الدفع
 * بعينه** — والقاعدة أولى بالطاعة حيث يقظتها في محلّها.
 *
 * ── وما يقوله القياس بدقّة، كي لا يُصلَح غيرُ العطل ────────────────────────
 * هذه الصفحة **مكوّن خادمي** (`async` · `await params` · `cookies()`): لا
 * تُصيَّر في المتصفح أصلاً فلا تعارض ترطيبٍ فيها. والعدّاد نفسه
 * (`HoldCountdown`) جزيرةٌ عميلة تأخذ `holdUntil` **لحظةً مطلقة من القاعدة**
 * وتحسب الباقي عندها وحدها، ولا تُصيَّر شيئاً قبل أول `useEffect` — فرقمٌ
 * يقفز مستحيلٌ بنيويّاً هنا. فما أُصلح **خرقُ قاعدة نقاء التصيير** لا عدّادٌ
 * يكذب؛ وتوحيدُ قراءة الساعة في دوالّ الجذر يُبقيها كذلك.
 *
 * ولا يُؤخذ الوقت من حمولة الخادم بديلاً: `readPaymentHold` تُرجع
 * `{ enabled, holdUntil }` وحدهما، وإضافةُ «الآن» إليها تصنع **مصدراً ثانياً
 * للزمن** في ملفٍّ كل قراره مبنيٌّ على لحظةٍ واحدة — وهو النمط ٨ بعينه.
 */
function withinCountdownWindow(holdUntil: string | null): boolean {
  if (holdUntil === null) return false;
  const at = Date.parse(holdUntil);
  return Number.isFinite(at) && at - new Date().getTime() <= COUNTDOWN_WINDOW_MS;
}

export default async function BookingStatusPage({ params }: PageParams) {
  const { token } = await params;

  const locale = await resolveLocale();
  // مساحة `payment` للمرحلة ٩ (خيارات الدفع وأسماء البوابات)، ومساحة الصفحة لبقية النصوص
  const [settings, t, tPay] = await Promise.all([
    getSettings(locale),
    getT("pages.bookingStatus", locale),
    getT("payment", locale),
  ]);
  const fmt: LocaleFormatter = createFormatter(locale);

  const supabase = await createServerSupabase();
  if (!supabase) notFound();

  const { data, error } = await supabase.rpc("get_booking_by_token", { p_token: token });
  if (error) notFound();

  const raw = Array.isArray(data) ? data[0] : data;
  if (!isRecord(raw)) notFound();

  const status = readStatus(raw);
  const bookingId = readText(raw, "id") ?? "";
  const reference = readText(raw, "reference") ?? "";
  const currency = readText(raw, "currency") ?? "EGP";
  const total = readNumber(raw, "total") ?? 0;
  const amountDue = readNumber(raw, "amount_due", "amountDue") ?? 0;
  const amountRemaining = readNumber(raw, "amount_remaining", "amountRemaining") ?? 0;
  const classTitle = readText(raw, "class_title", "classTitle") ?? "";
  const createdAt = readText(raw, "created_at", "createdAt");

  const tripRaw = raw["trip"];
  const trip: UnknownRow = isRecord(tripRaw) ? tripRaw : {};

  // الخصم المُجمَّد في **لقطة الرحلة** (`trip -> 'discount'`، هجرة 0024) لا في
  // عمود مستقل. يُقرأ دفاعياً: حجزٌ أُنشئ قبل الهجرة، أو حجز بلا كوبون، لا يحمل
  // المفتاح أصلاً فتغيب صفوف الخصم بلا خطأ ولا فراغ.
  //
  // و`total` أعلاه هو الإجمالي **بعد** الخصم (القاعدة ٥ في عقد الخصومات)، فهذه
  // الصفوف تكشف الأصل ولا تعيد حسابه: لا طرح ولا جمع في هذه الصفحة.
  //
  // 🔒 لا `clamped` في اللقطة أصلاً — والحجب في القاعدة لا هنا: `get_booking_by_token`
  // تُرجع `trip` كاملاً وهي ممنوحة لـ anon، فحاملُ التوكن كان سيقرأ الراية مباشرةً
  // بلا المرور بهذه الصفحة، ومنها يستنتج «التكلفة + الأرضية» من `totalBefore − amount`.
  // فأُسقطت من `create_booking` في 0024، ومكانها `coupon_redemptions.clamped`
  // المحجوب عن غير المشرف (نفس قرار حجبها عن `/api/discount/verify`).
  const discountRaw = trip["discount"];
  const discount: UnknownRow = isRecord(discountRaw) ? discountRaw : {};
  const discountAmount = readNumber(discount, "amount");
  const discountTotalBefore = readNumber(discount, "totalBefore", "total_before");
  // ثمنُ الرحلة بعد الخصم وقبل الخدمات — **مخزَّن** في اللقطة (‏`totalAfter` في
  // `v_disc_json`)، فلا يُشتق هنا بطرح. وهو ما يجعل السطور الأربعة تُقرأ بترتيب
  // المعادلة نفسه بدل أن تقفز من الخصم إلى الإجمالي فوق فجوة الخدمات.
  const discountTotalAfter = readNumber(discount, "totalAfter", "total_after");
  const discountCode = readText(discount, "code");
  const hasDiscount =
    discountAmount !== null && discountAmount > 0 && discountTotalBefore !== null;

  /**
   * الخدمات الإضافية (هجرة `0031`): المجموع من اللقطة، والتفصيل من لقطة
   * `booking_extras` المجمَّدة. و`total` أعلاه **يشمل** ثمنها بالفعل — فالمعادلة
   * تضيفها آخر شيء، بعد الذروة وبعد الخصم:
   *     `total = (ride_total − discount) + extras_total`
   * ولهذا لا يُطرح هنا شيء ولا يُجمع: تُعرض الحدود كما خزّنتها القاعدة.
   *
   * والحمولة أولاً ثم الجدول: يوم يوسّع نوعُ إرجاع الدالة ليحمل `extras` يصير
   * هو المصدر بلا تعديل هنا، ويسقط نداء عميل الخدمة من نفسه.
   */
  const extrasTotal = readNumber(trip, "extrasTotal", "extras_total");
  const hasExtras = extrasTotal !== null && extrasTotal > 0;
  const payloadExtras = readExtras(raw, trip);
  const extras =
    payloadExtras.length > 0 || !hasExtras
      ? payloadExtras
      : await loadBookingExtras(bookingId);

  const originLabel = readText(trip, "originLabel", "origin_label") ?? "";
  const destLabel = readText(trip, "destLabel", "dest_label", "destinationLabel") ?? "";
  const distanceKm = readNumber(trip, "distanceKm", "distance_km");
  const passengers = readNumber(trip, "passengers") ?? 1;
  const luggage = readNumber(trip, "luggage");
  const roundTrip = readBoolean(trip, "roundTrip", "round_trip");
  const waitingHours = readNumber(trip, "waitingHours", "waiting_hours") ?? 0;
  // راية تشرح للعميل **من أين جاءت** ساعات الانتظار: عودةٌ في اليوم نفسه تعني
  // أن السائق ينتظره، فالساعات مشتقة من الموعدين لا مطلوبة صراحةً.
  const waitingDerived = readBoolean(trip, "waitingDerived", "waiting_derived");
  const pickupAt = readText(trip, "pickupAt", "pickup_at");
  const returnAt = readText(trip, "returnAt", "return_at");
  const notes = readText(trip, "notes");

  const pickupLabel = fmt.dateTime(pickupAt);
  const returnLabel = fmt.dateTime(returnAt);
  const createdLabel = fmt.dateTime(createdAt);
  const payment = readPaymentSettings(settings);
  // الرابط الذي يحفظه العميل هو رابط لغته — العربية بلا بادئة والإنجليزية تحت /en
  const bookingUrl = `${getBaseUrl()}${localePath(locale, `/booking/${token}`)}`;

  /**
   * نصّ نيّة واتساب: سطر يعرّف الرحلة ثم الرابط في سطر مستقل — واتساب لا يجعل
   * الرابط قابلاً للنقر إن التصق بنصّ بعده. ويمر بـ`t` كبقية نصوص الصفحة فيصل
   * العميلَ الإنجليزيَّ بلغته.
   */
  const shareText = t(
    "share.whatsappText",
    "تفاصيل رحلتي مع {brand} — رقم الحجز {reference}\n{url}",
    { brand: settings.brand.name, reference, url: bookingUrl }
  );

  /**
   * نصّ ن‑٧ — «أرسل تفاصيل رحلتك» على بطاقة التأكيد وحدها.
   *
   * وهو غير نصّ المشاركة أعلاه بقصد: ذاك يقول «هذه صفحتي» لمن يحفظها لنفسه،
   * وهذا يقول **ما يحتاجه الغريب**: متى، ومن أين إلى أين، وبأي رقم يسأل عنها.
   *
   * 🔒 **وما ليس فيه هو نصف تصميمه:**
   *   • **لا مبلغ ولا عمولة** — من يستقبل الضيف لا شأن له بما دفعه، وثمنُ
   *     الرحلة في يد طرفٍ ثالث بابُ سؤالٍ لا نفتحه (**D-19**).
   *   • **ولا هاتف** — ولا يحتاج حذفاً: `0049` قنّعت `customer_phone` و
   *     `customer_whatsapp` داخل `get_booking_by_token`، فالصفحة لا تملكهما.
   *
   * والحقول الغائبة تسقط بسطورها: حجزٌ بلا موعد لا يُنتج سطر «الموعد: —».
   */
  const tripShareLines = [
    t("confirmed.shareLineTrip", "رحلة {origin} ← {dest}", {
      origin: originLabel,
      dest: destLabel,
    }),
    pickupLabel ? t("confirmed.shareLineWhen", "الموعد: {value}", { value: pickupLabel }) : null,
    t("confirmed.shareLineRef", "رقم الحجز: {value}", { value: reference }),
    bookingUrl,
  ].filter((line): line is string => typeof line === "string" && line.trim().length > 0);
  const tripShareText = tripShareLines.join("\n");

  /**
   * الخطوة الحالية على المؤشر بالكلمات — للورقة المطبوعة وحدها. المصدر هو
   * `STATUS_POSITION` و`STATUS_STEPS` نفساهما اللذان يرسمان المؤشر على الشاشة،
   * فلا تنحرف الورقة عنه بجدول تسميات ثانٍ. و«ملغي» (‏موضعه -1) لا يدخل هنا
   * لأن بطاقة الإلغاء تقول ذلك صراحةً بلا لون.
   */
  const currentStep = STATUS_STEPS[STATUS_POSITION[status]] ?? null;

  /**
   * طاقم الرحلة (هجرة `0040`، مصلَّحةً بـ`0043`) — جواب «العميل لا يعرف ما
   * سيأتيه».
   *
   * سطر المركبة يجمع وصفها **وسنتها** بمسافة واحدة: «هيونداي إلنترا ٢٠٢٣». وهي
   * نصف ما يميّز سيارةً عن أختها في عين من يقف على الرصيف، فمكانها سطر التعريف
   * لا سطرٌ ثالث يزاحمه. والسنة تمرّ بـ`digits` لا بـ`number`: الأخيرة تفصل
   * الألوف فتصير ٢٠٢٣ «٢٬٠٢٣» — سنةٌ لا تُقرأ سنةً.
   */
  const crew = readCrew(raw);
  const crewVehicleLine = crew
    ? [crew.vehicleLabel, crew.vehicleYear === null ? null : fmt.digits(crew.vehicleYear)]
        .filter((part): part is string => part !== null && part.length > 0)
        .join(" ")
    : "";
  const crewPhoneAtLabel = fmt.dateTime(crew?.phoneVisibleAt ?? null);
  const crewPhoneWindowClosed = phoneWindowClosed(crew);

  // مصفوفة الإيصالات تُقرأ مرة واحدة ويقرأ منها المستهلكان معاً
  const receipts = readReceipts(raw);

  // سبب رفض آخر إيصال — يُعرض فوق بطاقة التحويل ما دام الحجز بانتظار الدفع
  const rejection = status === "pending_payment" ? latestRejection(receipts) : null;
  const rejectionLabel = fmt.dateTime(rejection?.verifiedAt ?? rejection?.createdAt ?? null);

  // سجل الإيصالات يُظهر ما وصلنا **في كل حالة** لا في «بانتظار الدفع» وحدها:
  // العميل المؤكَّد يريد أن يرى أن تحويله اعتُمد، والملغى يريد أثر ما أرسله.
  //
  // ويُستثنى منه الإيصال الذي يعرضه تنبيه الرفض أعلاه (بالهوية لا بالمعرّف، فلا
  // يعتمد الاستثناء على مفتاح قد يغيب): التنبيه هو عرضه العملي المصحوب بخطوة
  // «أعد الرفع»، وتكراره هنا بأسلوب ثانٍ يجعل الشيء الواحد شيئين في عين العميل.
  const listedReceipts = rejection
    ? receipts.filter((receipt) => receipt !== rejection)
    : receipts;

  // نص التذييل يحمل رقم الحجز داخل عنصر أحادي الخط باتجاه ltr — نقصّ الرسالة حوله
  const [footerBefore, footerAfter] = splitAroundSlot(
    t("footerNote", "رقم حجزك {reference} — اذكره في أي تواصل معنا بشأن هذه الرحلة.", {
      reference: SLOT,
    })
  );

  /**
   * مهلة حفظ الحجز (م‑٥) — **الجواب على «حجزي اختفى ولم يقل لي أحد شيئاً».**
   *
   * رفع بدر المهلة إلى ٣٦٠ دقيقة من اللوحة، ولا حرف في هذه الصفحة يذكرها. ومن
   * لم يُتمّ التحويل يجد حجزه ملغىً بلا إنذار — وهو أسوأ ما يمكن أن تفعله صفحةٌ
   * كل وظيفتها أن تقول للعميل أين وصل.
   *
   * ⚠ **ولا تُكتب الجملة من رأسك:** «ست ساعات من الآن» صارت **خطأً** بعد `0052`.
   * التاريخ يأتي من `booking_hold_until` — الدالة التي يسألها الكنس بعينها —
   * وهي تأخذ الأبعد من (الإنشاء + المهلة) و(الموعد − المهلة). فحجزُ رحلةٍ بعد
   * شهرٍ محفوظٌ قرابة الشهر لا ست ساعات. التفصيل في `checkout/hold.ts`.
   *
   * ولا يُسأل عنها إلا في `pending_payment`: الكنس لا يمسّ غيرها، فسطرُ مهلةٍ
   * على حجزٍ مؤكد تهديدٌ بلا سبب.
   */
  const hold =
    status === "pending_payment"
      ? await readPaymentHold(createdAt, pickupAt)
      : { enabled: false, holdUntil: null };
  const holdUntilLabel = hold.enabled ? fmt.dateTime(hold.holdUntil) : null;
  /**
   * انقضت الأرضية؟ عندها **لا تصلح جملة «محفوظ حتى»** — تصير وعداً بماضٍ.
   * والحجز ما زال قائماً وقد يمتدّ (نشاط إيصالٍ حديث يستثنيه)، فالصادق أن
   * نقول: انقضت المهلة وقد يُلغى في أي وقت — لا «أُلغي» ولا «محفوظ».
   */
  const holdPassed = holdWindowPassed(hold.holdUntil);

  /**
   * أيُعرض العدّاد؟ — يُقرَّر على الخادم بموعدٍ **من القاعدة** لا بحسابٍ موازٍ.
   * والشرط شرطان: مهلةٌ لم تنقضِ بعد، وموعد الكنس داخل النافذة أعلاه.
   */
  const showCountdown = hold.enabled && !holdPassed && withinCountdownWindow(hold.holdUntil);

  // حسابات الاستقبال المتاحة للمبلغ المطلوب — تُفلترها SQL بحدودها اليومية/الشهرية.
  // التوكن جزء من النداء: الصيغة المقصورة على التوكن هي وحدها الممنوحة للزائر،
  // فلا تُعدّ أرقام المحافظ من متصفح بلا حجز قائم بانتظار الدفع.
  let accounts: PaymentAccountView[] = [];
  if (status === "pending_payment") {
    const { data: accountRows } = await supabase.rpc("available_payment_accounts", {
      p_token: token,
      p_amount: amountDue,
    });
    accounts = (Array.isArray(accountRows) ? accountRows : [])
      .filter(isRecord)
      .map((row) => ({
        id: readText(row, "id") ?? "",
        kind: readText(row, "kind") ?? "wallet",
        // العائلة تُشتقّ في القاعدة (`0070`)، والسقوط على `kind` ليس تجميلاً:
        // قاعدةٌ بلا الهجرة لا تُرجع العمود، فيصير كل نوعٍ مجموعتَه — وهو
        // بالضبط السلوك الآمن (لا حساب يسقط من الشاشة).
        family: readText(row, "family") ?? readText(row, "kind") ?? "other",
        label: readText(row, "label") ?? t("pay.accountFallbackLabel", "حساب تحويل"),
        handle: readText(row, "handle") ?? "",
        holderName: readText(row, "holder_name", "holderName"),
        // علامة الوسيلة (البند ١٢، الهجرة `0093`). والغياب هو الحال الافتراضي —
        // قاعدةٌ بلا الهجرة، أو حسابٌ لم يضبط بدر صورته: تعود البطاقة إلى أيقونة
        // عائلتها ولا يسقط الحساب.
        imageUrl: readText(row, "image_url", "imageUrl"),
        // العمولة والإجماليان يصلان **محسوبَين** من الدالة (ن‑١). والسقوط على
        // `amountDue`/`total` ليس تجميلاً: قاعدةٌ بلا هجرة `0066` لا تُرجع
        // الأعمدة الثلاثة، والصفحة يجب أن تعرض أرقامها الصحيحة لا فراغاً.
        fee: readNumber(row, "fee") ?? 0,
        dueWithFee: readNumber(row, "amount_due_with_fee", "amountDueWithFee") ?? amountDue,
        totalWithFee: readNumber(row, "total_with_fee", "totalWithFee") ?? total,
      }))
      .filter((account) => account.id.length > 0 && account.handle.length > 0);
  }

  /**
   * هل يحمل أيٌّ من الحسابات المتاحة عمولة؟ يحكم سطراً واحداً في بطاقة المبالغ:
   * «المطلوب الآن» فيها رقمٌ **قبل** العمولة، وتركُه بلا تنبيه يجعل الصفحة
   * تعرض رقمين مختلفين للشيء نفسه بلا شرح — وهو ما ينهي ثقة القارئ في كليهما.
   */
  const anyFee = accounts.some((account) => account.fee > 0);

  /**
   * الخيار الذي يبدأ مختاراً — ن‑٩ (ب-٣): «العائد لا يُعيد القرار».
   *
   * 🔒 والكوكي **مرشَّحة بالقائمة لا مصدَّقة**: `preferredAccountId` لا تقبل إلا
   * معرّفاً موجوداً في ما أرجعته `available_payment_accounts` بالفعل. فحسابٌ
   * أطفأه بدر بعد آخر زيارة — أو قيمةٌ ملفَّقة — تسقط بلا أثر ويعود الاختيار
   * إلى الأول (وهو الأرخص بعد `0070`).
   */
  const remembered = (await cookies()).get(TRANSFER_ACCOUNT_COOKIE)?.value ?? null;
  const preferredId = preferredAccountId(
    accounts.map((account) => account.id),
    remembered
  );

  const receiptAccounts: ReceiptAccountOption[] = accounts.map((account) => ({
    id: account.id,
    label: account.label,
    handle: account.handle,
    due: account.dueWithFee,
  }));

  /**
   * بوابات الدفع الإلكتروني المفعّلة (المرحلة ٩) — **خيار إضافي لا بديل**.
   * صفر بوابات (وهو الحال قبل هجرة ٠٠٢٠ وقبل فتح أي حساب لدى مزوّد) يعني أن
   * هذا القسم يُصيَّر حرفاً بحرف كما كان: تعليمات التحويل ثم أرقام الحسابات ثم
   * رفع الإيصال. اسم البوابة يُترجم عبر مساحة `payment` واحتياطيه اسم اللوحة.
   */
  let gateways: GatewayChoice[] = [];
  if (status === "pending_payment") {
    gateways = (await readEnabledGateways()).map((row) => ({
      provider: row.provider,
      label: tPay(`provider.${row.provider}`, row.label),
      sandbox: row.sandbox,
    }));
  }

  /**
   * لوحة التحويل اليدوي — تُبنى مرة وتُعرض إما مباشرةً (بلا بوابات) أو داخل
   * منتقي الوسيلة وهي خياره الافتراضي. تعليمات التحويل تنتقل إلى داخل اللوحة
   * حين توجد بوابات، لأنها تصف التحويل اليدوي وحده لا الدفع عامةً.
   */
  const manualPanel =
    status === "pending_payment" ? (
      <>
        {gateways.length > 0 ? (
          <p className="text-sm leading-7 text-muted-foreground">
            {payment.transferInstructions}
          </p>
        ) : null}

        {accounts.length > 0 ? (
          <AccountChooser
            accounts={accounts}
            preferredId={preferredId}
            anyFee={anyFee}
            currency={currency}
            fmt={fmt}
            t={t}
          />
        ) : (
          <p className="flex items-start gap-2 rounded-2xl border border-border bg-muted/40 px-4 py-3 text-sm leading-7">
            <Info className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden="true" />
            {t("pay.noAccounts", "سنتواصل معك لتأكيد وسيلة الدفع — حجزك محفوظ برقمه أعلاه.")}
          </p>
        )}

        {/* رفع الإيصال لا يُطبع: عنوانه ونموذجه معاً سطحُ تفاعل لا يفعل شيئاً على
            ورقة — والصنف على الحاوية كي يذهب العنوان مع النموذج لا وحده بعده */}
        {accounts.length > 0 ? (
          <div className={`${PRINT_HIDDEN_CLASS} flex flex-col gap-3 border-t border-border pt-5`}>
            <h3 className="text-sm font-bold">
              {t("pay.uploadHeading", "بعد التحويل: ارفع الإيصال")}
            </h3>
            <ReceiptUpload
              token={token}
              amountDue={amountDue}
              currency={currency}
              accounts={receiptAccounts}
              defaultAccountId={preferredId}
              locale={locale}
            />
          </div>
        ) : null}
      </>
    ) : null;

  /**
   * ══════════════════════════════════════════════════════════════════════════
   *  خريطة المسار (م‑١١) — موضعٌ واحد في «تفاصيل الرحلة»، وحالتان تملآنه
   * ══════════════════════════════════════════════════════════════════════════
   *
   * 🔴 **الزناد `routeMapStatusReady` لا `amountRemaining === 0`.** الحالات
   * الثلاث فيه (`confirmed`/`assigned`/`completed`) هي بعينها ما تشترطه
   * `start_dispatch` ومن بعدها الإسناد — أي **اللحظة التي تبدأ عندها الرحلة
   * تُجهَّز فعلاً**. وحجزٌ بعربونٍ مدفوع مؤكَّدٌ ويُبَثّ وعليه متبقٍّ يُحصَّل
   * نقداً مع السائق (D-36)، فربطُ الخريطة بالسداد الكامل كان سيعرض «غير مدفوع»
   * لمن دفع بالفعل.
   *
   * ── والترتيب هنا مقصود لا تجميلياً ──────────────────────────────────────────
   *
   * الحالة أولاً — وهي أرخص فحصٍ وأكثرها رفضاً — فحجزٌ بانتظار الدفع **لا
   * يقرأ إعدادات الرحلات أصلاً** ولا يلمس جدولاً ثانياً. ثم مفتاح الإطفاء، ثم
   * الضمان (الذي يُنهي نفسه فوراً على صفٍّ موجود بلا أي نداءٍ خارجي).
   *
   * والملغى والفاشل خارج الحالتين معاً: لا خريطةَ رحلةٍ لن تقع، ولا دعوةَ دفعٍ
   * على حجزٍ أُغلق — وهي نفس القاعدة التي أسقطت «المطلوب الآن» عن الفاشل.
   */
  const routeMapView =
    routeMapStatusReady(status) && (await routeMapEnabled())
      ? await ensureBookingRouteMap(bookingId)
      : null;
  // العنوان بلا بادئة لغة: الصورة لا لغة لها، والشكل العربي هو الوحيد الذي لا
  // يمرّ بتحويل ٣٠٨ في `proxy.ts` (D-24).
  const routeMapSrc = routeMapView ? `/booking/${token}/map` : null;
  const showRoutePending = status === "pending_payment" || status === "under_review";

  /**
   * رابط خرائط جوجل العادي (قرار المالك 2026-08-17) — **بلا API وبلا مفتاح
   * وبلا فاتورة**، يفتح تطبيق الخرائط على جهاز العميل بالمرور الحيّ.
   *
   * ⚠ **بالإحداثيات المجمَّدة في لقطة الحجز لا بأسماء الأماكن**: الاسم نصٌّ
   * يُفسَّر ببحثٍ عند جوجل فقد يهبط على مكانٍ آخر يحمله — أي مساراً غير الذي
   * سُعِّرت به الرحلة. وهاتان النقطتان بعينهما ما حُسبت عليه المسافة والسعر.
   *
   * 🔴 **وخارج نطاق التشغيل لا رابط**: `withinServiceArea` هي نفسها التي يرفض
   * بها `/api/geocode/reverse` ويقصّ إليها منتقي الخريطة — حدٌّ واحد لا ثانٍ له.
   *
   * ويتبع بوابة الخريطة نفسها (بعد التأكيد): قبله الرسالة أن التجهيز لم يبدأ،
   * ورابطُ مسارٍ عندها يناقضها.
   */
  const originPoint = { lat: readNumber(trip, "originLat", "origin_lat"), lng: readNumber(trip, "originLng", "origin_lng") };
  const destPoint = { lat: readNumber(trip, "destLat", "dest_lat"), lng: readNumber(trip, "destLng", "dest_lng") };
  const directionsUrl =
    routeMapStatusReady(status) &&
    isDrawablePoint(originPoint) &&
    isDrawablePoint(destPoint) &&
    withinServiceArea(originPoint) &&
    withinServiceArea(destPoint)
      ? tripDirectionsUrl(originPoint, destPoint)
      : null;

  const whatsapp = settings.contact.whatsapp;
  const phone = settings.contact.phone;

  /**
   * ══════════════════════════════════════════════════════════════════════════
   *  البندان ٩ و١٣ — الترتيب يتبع الهدف، والهدف يختلف باختلاف الحالة
   * ══════════════════════════════════════════════════════════════════════════
   *
   * **إطار بدر، وهو ما يحكم كل قرار أدناه:** «الهدف الرئيسي في صفحات الحجوزات
   * غير المدفوعة أن نحث العميل على دفع المبلغ لتأكيد الحجز». فعلى حجزٍ لم يُدفع،
   * **كل ما لا يخدم الدفع ضجيج** — يُنقل أو يُطوى أو يُحذف.
   *
   * ── ما كان يراه العميل فعلاً (مقيسٌ على TR-MECP6W قبل هذا التغيير) ────────
   *
   *   رقم الحجز → «احفظ هذا الرابط» + ثلاثة أزرار → مؤشر الحالة →
   *   **بطاقة المبالغ** (سبعة صفوف حسابية) → **تفصيل الخدمات** →
   *   ⟶ **الدفع** ⟵ ← الغرض، رابعَ بطاقةٍ في الصفحة
   *   → سجل الإيصالات → تفاصيل الرحلة والخريطة
   *
   * أي أن من فتح الصفحة ليدفع كان يمرّ على **جدولَي محاسبة** قبل أن يبلغ زرّ
   * الدفع. والجدولان ليسا قراراً بل **مراجعة** — ومن يراجع حسابه يفعل ذلك بعد
   * أن يعرف كم يدفع وكيف، لا قبله.
   *
   * ── والترتيب الجديد يتبع سؤال العميل لا بنية البيانات ────────────────────
   *
   * | # | البطاقة | السؤال الذي تجيبه |
   * |---|---|---|
   * | ١ | رقم الحجز | «أي حجزٍ هذا؟» |
   * | ٢ | مؤشر الحالة | «أين وصلتُ؟» — أربع دوائر، وهو ما يجعل الدعوة مفهومة |
   * | ٣ | رفض إيصالٍ سابق | «لماذا رُفض؟» — **قبل** أن يعيد الرفع، وإلا أعاد الخطأ |
   * | ٤ | **الدفع** | «كيف أدفع؟» — الغرض، بلا شيءٍ يسبقه إلا ما يشرحه |
   * | ٥ | تفاصيل الرحلة | «على ماذا أدفع؟» — تحقّقٌ **بعد** الدعوة لا قبلها |
   * | ٦ | الحساب (مطويّاً) | «كيف تكوّن المبلغ؟» — سؤالُ قلّةٍ، فلا يزاحم الأغلبية |
   * | ٧ | سجل الإيصالات | «هل وصلكم ما أرسلت؟» |
   * | ٨ | «احفظ هذا الرابط» | «كيف أعود؟» — حاجةُ **ما بعد** الزيارة لا أثناءها |
   *
   * ⚠ **وهذا الترتيب للحجز غير المدفوع وحده.** على حجزٍ مؤكَّد الهدف **خبرٌ لا
   *   فعل**: صاحبه يفتح الصفحة ليعرف ما يأتيه ومتى، فيبقى الترتيب المشحون كما
   *   هو (احفظ الرابط → الحالة → المركبة والسائق → الحساب → التأكيد → الرحلة).
   *   ولذلك تُعرَّف الكتل **مرةً واحدة** وتُصيَّر في موضعين — لا نسختان تنحرفان
   *   عند أول تعديل (النمط ٨ في `handover/LESSONS.md`).
   */
  const awaitingPayment = status === "pending_payment";

  /** «احفظ هذا الرابط» وأدوات المشاركة — أعلى الصفحة إلا على حجزٍ ينتظر الدفع */
  const saveLinkBar = (
    <>
      {/*
        تنبيه حفظ الرابط، ومعه أدوات المشاركة الثلاث.

        🔒 **ولا زر فيسبوك هنا، ولا إكس، ولا تليجرام، ولا بطاقة Open Graph.**
        من قرأ هذه الأزرار فرآها «ناقصة» فليقرأ هذا أولاً: **الرابط نفسه هو
        بيانات الاعتماد**. `get_booking_by_token` دالة `security definer`
        تأذن بحيازة نصّ التوكن وحده — لا كلمة سر ولا جلسة — ومن فتحه قرأ اسم
        العميل وهاتفه وواتسابه وإحداثيات التقاطه ووصوله وملاحظاته وسجل
        إيصالاته. ونشرُ هذا الرابط على سطح عام لا «يشارك صفحة»، بل **ينشر
        مفتاحاً حيّاً**: فاحصة المعاينة تجلبه فتخزّنه، وترويسة `referer`
        تحمله إلى الموقع التالي، وسجلّ مختصر الروابط يحفظه. والسطر الذي فوق
        هذه الأزرار مباشرةً يقول للعميل إنه «مفتاحك الوحيد لهذه الصفحة» —
        فزرُّ نشرٍ بجواره يناقض الصفحة نفسها.

        ولذلك: النشر العام لصفحات التسويق وحدها (المسارات والخدمات
        والرئيسية) — عامة مفهرَسة بلا سرّ وبُنيت لتُشارَك. وهنا **ثلاث نيّات
        خاصة**: طباعة، ونسخ الرابط، وإرسال إلى واتساب **بلا رقم مستقبِل**
        فيختار العميل وجهته بنفسه (نفسه غالباً). ولنفس السبب لا تُغيَّر
        `generateMetadata` أعلاه: `index:false` و`follow:false` و`nocache:true`،
        ولا تمرّ بـ`buildPageMetadata` عمداً فلا تُبنى لهذه الصفحة بطاقة
        مشاركة إطلاقاً. القرار محسوم مع المالك في `lib/export-types.ts` §٥.
      */}
      <div
        className={`${PRINT_HIDDEN_CLASS} flex flex-col gap-3 rounded-2xl border border-border bg-muted/40 px-4 py-3 sm:flex-row sm:items-center sm:justify-between`}
      >
        <p className="flex items-start gap-2 text-sm leading-6">
          <Link2 className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden="true" />
          {t("saveLink", "احفظ هذا الرابط لمتابعة حجزك — هو مفتاحك الوحيد لهذه الصفحة.")}
        </p>
        {/* `shrink-0` كي تنكسر الجملة لا الأزرار: بلا هذا القيد يتقاسم النصّ
            والأزرارُ العرضَ بالتساوي فتنزل «طباعة» سطراً وحدها على الشاشات
            المتوسطة — والجملة نثرٌ يُعاد لفّه بلا ثمن */}
        <div className="flex shrink-0 flex-wrap items-center gap-2 self-start sm:self-auto">
          <CopyButton
            value={bookingUrl}
            label={t("saveLinkCopyLabel", "رابط متابعة الحجز")}
            variant="inline"
          />
          <a
            href={waShareHref(shareText)}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex h-9 shrink-0 items-center justify-center gap-1.5 rounded-xl border border-border bg-background px-3 text-sm font-medium transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
          >
            <MessageCircle className="size-4 shrink-0" aria-hidden="true" />
            {t("share.whatsapp", "إرسال إلى واتساب")}
          </a>
          <PrintButton label={t("share.print", "طباعة")} />
        </div>
      </div>
    </>
  );

  /** بطاقة المبالغ وتفصيل الخدمات — وحدةٌ واحدة: الثانية شرحُ سطرٍ في الأولى */
  const financials = (
    <>
      {/* المبالغ */}
      <section
        aria-label={t("amounts.sectionLabel", "مبالغ الحجز")}
        className="flex flex-col gap-3 rounded-3xl border border-border bg-card p-5 text-card-foreground sm:p-6"
      >
        <h2 className="text-base font-bold">{t("amounts.heading", "المبالغ")}</h2>
        <dl className="flex flex-col gap-2.5 text-sm">
          {/*
            🔒 تسمية ما يخصمه الكوبون **فعلاً**: منذ الدفعة ٣ صار يخصم
            `ride_total` وحده، والخدمات تُجمع فوق الناتج. فكلمة «الإجمالي قبل
            الخصم» تصير كاذبة بوجود خدمات — الرقم المشطوب سعرُ رحلة لا إجمالٌ
            — وهي بعينها «الشاشة تَعِد بما لا تفعله القاعدة». والسطور تُسمّى
            بحسب وجود الخدمات لا بنص واحد يصلح للحالتين.
          */}
          {hasDiscount ? (
            <>
              <div className="flex items-center justify-between gap-3">
                <dt className="text-muted-foreground">
                  {hasExtras
                    ? t("amounts.rideBeforeDiscount", "سعر الرحلة قبل الخصم")
                    : t("amounts.totalBeforeDiscount", "الإجمالي قبل الخصم")}
                </dt>
                <dd className="font-medium line-through decoration-muted-foreground/60">
                  {fmt.money(discountTotalBefore as number, currency)}
                </dd>
              </div>
              <div className="flex items-center justify-between gap-3">
                <dt className="text-primary">
                  {discountCode
                    ? t("amounts.discountWithCode", "الخصم ({code})", { code: discountCode })
                    : t("amounts.discount", "الخصم")}
                </dt>
                <dd className="font-semibold text-primary">
                  {t("amounts.discountMinus", "‑{amount}", {
                    amount: fmt.money(discountAmount as number, currency),
                  })}
                </dd>
              </div>
              {/* الحلقة الوسطى — تظهر حين تكون هناك خدمات فوقها فقط، وإلا
                  كررت سطر «الإجمالي بعد الخصم» أدناه بالرقم نفسه */}
              {hasExtras && discountTotalAfter !== null ? (
                <div className="flex items-center justify-between gap-3">
                  <dt className="text-muted-foreground">
                    {t("amounts.rideAfterDiscount", "سعر الرحلة بعد الخصم")}
                  </dt>
                  <dd className="font-medium">
                    {fmt.money(discountTotalAfter, currency)}
                  </dd>
                </div>
              ) : null}
            </>
          ) : null}
          {/*
            الخدمات سطرٌ مستقل **قبل** الإجمالي لا بعده: التسلسل الذي يقرؤه
            العميل هو تسلسل المعادلة نفسه — سعر الرحلة، ثم ناقص الخصم، ثم
            زائد الخدمات، ثم الإجمالي. ولو كتبناها «منها كذا» بعد الإجمالي
            لبدت خصماً منه لا إضافةً إليه.
          */}
          {hasExtras ? (
            <div className="flex items-center justify-between gap-3">
              <dt className="text-muted-foreground">
                {t("amounts.extras", "الخدمات الإضافية")}
              </dt>
              <dd className="font-medium">
                {t("amounts.extrasPlus", "+{amount}", {
                  amount: fmt.money(extrasTotal as number, currency),
                })}
              </dd>
            </div>
          ) : null}
          <div className="flex items-center justify-between gap-3">
            <dt className="text-muted-foreground">
              {hasExtras
                ? t("amounts.totalWithExtras", "الإجمالي شاملاً الخدمات")
                : hasDiscount
                  ? t("amounts.totalAfterDiscount", "الإجمالي بعد الخصم")
                  : t("amounts.total", "إجمالي الرحلة")}
            </dt>
            <dd className="font-medium">{fmt.money(total, currency)}</dd>
          </div>
          {/*
            🔒 صفّا «المطلوب الآن» و«المتبقي مع السائق» يصفان **التزاماً
            حيّاً**، ولا التزام على رحلةٍ لم تُنفَّذ: لا مبلغ يُطلب، ولا سائق
            يُحصِّل، والمسار المعلن فوقهما ردٌّ لا تحصيل. وإبقاؤهما كان
            يجعل الصفحة تناقض نفسها في شاشةٍ واحدة.

            ويبقى «الإجمالي» فوقهما: هو **ما كانت تساويه الرحلة**، وسجلُّه
            حقُّ العميل ومرجعه حين يسأل عن الردّ.

            ⚠ و`cancelled` تُترك كما شُحنت — ليست من عهدة هذه الموجة، والملاحظة
            مرفوعة لمالك ذلك السطح لا مُصلَحة بالمرور.
          */}
          {status === "failed" ? null : (
            <>
              <div className="flex items-center justify-between gap-3 border-t border-border pt-2.5">
                <dt className="font-semibold">{t("amounts.dueNow", "المطلوب الآن")}</dt>
                <dd className="text-lg font-extrabold">{fmt.money(amountDue, currency)}</dd>
              </div>
              <div className="flex items-center justify-between gap-3">
                <dt className="text-muted-foreground">
                  {t("amounts.remaining", "المتبقي مع السائق")}
                </dt>
                <dd className="font-medium">{fmt.money(amountRemaining, currency)}</dd>
              </div>
            </>
          )}
        </dl>
        {status !== "failed" && amountRemaining > 0 ? (
          <p className="text-xs leading-6 text-muted-foreground">
            {t("amounts.remainingNote", "المتبقي يُحصَّل نقداً مع السائق يوم الرحلة.")}
          </p>
        ) : null}
        {/*
          🔒 عمولة التحويل (ن‑١) لا تُجمع في «المطلوب الآن» أعلاه لأنها
          **تختلف باختلاف الحساب** — ورقمٌ واحد هنا يكذب على من يختار غيره.
          لكن السكوت عنها يجعل الصفحة تعرض رقمين للشيء نفسه بلا شرح، فيُقال
          صراحةً أين يُقرأ الرقم النهائي. ولا يظهر السطر إلا حين توجد عمولة
          فعلاً على حسابٍ **متاح الآن** — لا على حساب مخفيّ أو بلغ حدّه.
        */}
        {status === "pending_payment" && anyFee ? (
          <p className="text-xs leading-6 text-muted-foreground">
            {t(
              // ⚠ بلا «أدناه» ولا «أعلاه»: هذه البطاقة تنتقل بحسب الحالة (٩ + ١٣)،
              //   وكلمةُ اتجاهٍ فيها تصير كذباً بأول إعادة ترتيب.
              "amounts.feeNote",
              "بعض حسابات التحويل عليها عمولة تُضاف إلى المبلغ — تظهر مع كل حساب في خطوة الدفع، فاختر ما يناسبك."
            )}
          </p>
        ) : null}
      </section>

      {/*
        تفصيل الخدمات — يلي بطاقة المبالغ مباشرةً لأنه شرحُ سطرٍ فيها.
        كل رقم هنا مقروء من لقطة الحجز: الكمية وسعر الوحدة وإجمالي السطر
        خزّنتها قاعدة البيانات لحظة الحجز، فتغيير سعر الخدمة غداً لا يغيّر
        ما دفعه العميل اليوم. وبلا تفصيل واصل تُخفى البطاقة كلها ويبقى
        المجموع في المبالغ — لا نخترع سطوراً لا نملكها.
      */}
      {extras.length > 0 ? (
        <section
          aria-label={t("extras.sectionLabel", "الخدمات الإضافية")}
          className="flex flex-col gap-4 rounded-3xl border border-border bg-card p-5 text-card-foreground sm:p-6"
        >
          <div className="flex flex-col gap-1.5">
            <h2 className="flex items-center gap-2 text-base font-bold">
              <ConciergeBell className="size-5 shrink-0 text-primary" aria-hidden="true" />
              {t("extras.heading", "الخدمات الإضافية")}
            </h2>
            <p className="text-sm leading-7 text-muted-foreground">
              {t("extras.lead", "ما اخترته مع الرحلة، بسعر لحظة الحجز.")}
            </p>
          </div>

          <ul className="flex flex-col gap-2.5 text-sm">
            {extras.map((extra, index) => (
              <li
                key={`${extra.title}#${index}`}
                className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1 border-b border-border pb-2.5 last:border-0 last:pb-0"
              >
                <span className="font-medium">
                  {extra.title}
                  <span className="ms-1.5 text-muted-foreground">
                    {t("extras.quantity", "× {qty}", { qty: fmt.number(extra.qty) })}
                  </span>
                </span>
                <span className="flex items-baseline gap-2">
                  {extra.unitPrice !== null ? (
                    <span className="text-xs text-muted-foreground">
                      {t("extras.unitPrice", "{amount} للوحدة", {
                        amount: fmt.money(extra.unitPrice, currency),
                      })}
                    </span>
                  ) : null}
                  {extra.lineTotal !== null ? (
                    <span className="font-semibold">
                      {fmt.money(extra.lineTotal, currency)}
                    </span>
                  ) : null}
                </span>
              </li>
            ))}
          </ul>

          {hasDiscount ? (
            <p className="text-xs leading-6 text-muted-foreground">
              {t(
                "extras.discountNote",
                "الخصم يسري على سعر الرحلة وحده؛ الخدمات الإضافية تُضاف بسعرها كاملاً بعده."
              )}
            </p>
          ) : null}
        </section>
      ) : null}
    </>
  );

  /**
   * والحساب مطويّاً على حجزٍ ينتظر الدفع — **طيٌّ لا حذف** (البند ٩).
   *
   * المبلغ المطلوب مكتوبٌ في عنوان بطاقة الدفع نفسها («ادفع ١٬١٥٤ ج.م لتأكيد
   * الحجز»)، فما يبقى هنا هو **كيف تكوّن** ذلك المبلغ: سعرٌ قبل الخصم، وخصم،
   * وخدمات، ومتبقٍّ مع السائق. وهو حقُّ العميل ولا يُحذف — لكنه سؤالُ قلّةٍ
   * تراجع، لا سؤالُ من جاء ليدفع.
   *
   * و`<details>` وسمٌ أصلي: يعمل بلا جافاسكربت، ويعلن حالته لقارئ الشاشة.
   * 🖨 **ويُفتح على الورق** بقاعدةٍ في `PRINT_CSS` — ورقةُ الرحلة تحمل الحساب
   *    كاملاً، فطيٌّ يصلح لشاشةٍ لا يصلح لورقةٍ لا يُنقر فيها شيء.
   */
  const financialsFolded = (
    <details className="sheet-fold rounded-3xl border border-border bg-card text-card-foreground">
      <summary className="flex cursor-pointer list-none items-center justify-between gap-3 p-5 text-sm font-bold marker:content-none hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50 sm:p-6">
        <span className="flex items-center gap-2">
          <ReceiptText className="size-4 shrink-0 text-primary" aria-hidden="true" />
          {t("amounts.foldSummary", "تفصيل الحساب")}
        </span>
        {/* الإجمالي على الغلاف — وإلا صار الطيّ إخفاءَ رقمٍ لا تأجيلَ تفصيل */}
        <span className="text-sm font-extrabold">{fmt.money(total, currency)}</span>
      </summary>
      <div className="flex flex-col gap-6 border-t border-border p-5 sm:p-6">{financials}</div>
    </details>
  );

  /** تفاصيل الرحلة والخريطة — «على ماذا أدفع؟» */
  const tripCard = (
    <>
      {/* تفاصيل الرحلة */}
      <section
        aria-label={t("trip.sectionLabel", "تفاصيل الرحلة")}
        className="flex flex-col gap-4 rounded-3xl border border-border bg-card p-5 text-card-foreground sm:p-6"
      >
        <h2 className="text-base font-bold">{t("trip.heading", "تفاصيل الرحلة")}</h2>

        <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm font-medium">
          <RouteIcon className="size-4 shrink-0 text-primary" aria-hidden="true" />
          <span>{originLabel}</span>
          <span className="text-muted-foreground" aria-hidden="true">
            ←
          </span>
          <span>{destLabel}</span>
        </p>

        {/*
          موضع الخريطة — تحت سطر «من ← إلى» مباشرةً لأنها صورتُه، وفوق
          الحقائق لأن العين تقرأ الشكل قبل الجدول. والحالتان تتقاسمان
          الموضع نفسه فلا يقفز التخطيط حين يتحول الحجز من «بانتظار الدفع»
          إلى «تم التأكيد» بين فتحتين.
        */}
        {routeMapSrc && routeMapView ? (
          <RouteMapFigure
            src={routeMapSrc}
            originLabel={originLabel}
            destLabel={destLabel}
            geometrySource={routeMapView.geometrySource}
            directionsUrl={directionsUrl}
            t={t}
          />
        ) : showRoutePending ? (
          <RoutePendingPanel awaitingPayment={status === "pending_payment"} t={t} />
        ) : null}

        <dl className="grid gap-3 text-sm sm:grid-cols-2">
          <div className="flex items-center justify-between gap-3 rounded-2xl bg-muted/40 px-3 py-2.5">
            <dt className="text-muted-foreground">{t("trip.vehicleClass", "الفئة")}</dt>
            <dd className="font-medium">{classTitle}</dd>
          </div>
          <div className="flex items-center justify-between gap-3 rounded-2xl bg-muted/40 px-3 py-2.5">
            <dt className="text-muted-foreground">{t("trip.passengers", "عدد الركاب")}</dt>
            <dd className="font-medium">{fmt.passengers(passengers)}</dd>
          </div>
          {/* الحقائب (0031) — يُعرض الصفر أيضاً لأنه اختيار العميل لا غياب بيانات */}
          {luggage !== null ? (
            <div className="flex items-center justify-between gap-3 rounded-2xl bg-muted/40 px-3 py-2.5">
              <dt className="flex items-center gap-1.5 text-muted-foreground">
                <Luggage className="size-3.5 shrink-0" aria-hidden="true" />
                {t("trip.luggage", "عدد الحقائب")}
              </dt>
              <dd className="font-medium">{fmt.number(luggage)}</dd>
            </div>
          ) : null}
          <div className="flex items-center justify-between gap-3 rounded-2xl bg-muted/40 px-3 py-2.5">
            <dt className="text-muted-foreground">{t("trip.tripType", "نوع الرحلة")}</dt>
            <dd className="font-medium">
              {roundTrip
                ? t("trip.roundTrip", "ذهاب وعودة")
                : t("trip.oneWay", "ذهاب فقط")}
            </dd>
          </div>
          {distanceKm !== null ? (
            <div className="flex items-center justify-between gap-3 rounded-2xl bg-muted/40 px-3 py-2.5">
              <dt className="text-muted-foreground">{t("trip.distance", "المسافة")}</dt>
              <dd className="font-medium">{fmt.distance(distanceKm)}</dd>
            </div>
          ) : null}
          {waitingHours > 0 ? (
            <div className="flex flex-col gap-1 rounded-2xl bg-muted/40 px-3 py-2.5">
              <div className="flex items-center justify-between gap-3">
                <dt className="flex items-center gap-1.5 text-muted-foreground">
                  <Clock className="size-3.5 shrink-0" aria-hidden="true" />
                  {t("trip.waitingHours", "ساعات الانتظار")}
                </dt>
                <dd className="font-medium">{fmt.hours(waitingHours)}</dd>
              </div>
              {/*
                من أين جاء الرقم — السؤال الذي يطرحه العميل حين يرى ساعات
                انتظار لم يطلبها صراحةً: عودتُه في اليوم نفسه تعني أن السائق
                ينتظره بينهما.
              */}
              {waitingDerived ? (
                <p className="text-xs leading-6 text-muted-foreground">
                  {t(
                    "trip.waitingDerivedNote",
                    "محسوبة تلقائياً من موعد عودتك في اليوم نفسه — السائق ينتظرك بينهما."
                  )}
                </p>
              ) : null}
            </div>
          ) : null}
          {pickupLabel ? (
            <div
              className={`flex items-center justify-between gap-3 rounded-2xl bg-muted/40 px-3 py-2.5 ${
                returnLabel ? "" : "sm:col-span-2"
              }`}
            >
              <dt className="flex items-center gap-1.5 text-muted-foreground">
                <CalendarClock className="size-3.5 shrink-0" aria-hidden="true" />
                {t("trip.pickupAt", "موعد الانطلاق")}
              </dt>
              <dd className="font-medium">{pickupLabel}</dd>
            </div>
          ) : null}
          {returnLabel ? (
            <div className="flex items-center justify-between gap-3 rounded-2xl bg-muted/40 px-3 py-2.5">
              <dt className="flex items-center gap-1.5 text-muted-foreground">
                <CalendarClock className="size-3.5 shrink-0" aria-hidden="true" />
                {t("trip.returnAt", "موعد العودة")}
              </dt>
              <dd className="font-medium">{returnLabel}</dd>
            </div>
          ) : null}
        </dl>

        {notes ? (
          <div className="flex flex-col gap-1.5 rounded-2xl border border-border px-3 py-2.5">
            <p className="text-xs font-medium text-muted-foreground">
              {t("trip.notes", "ملاحظاتك")}
            </p>
            <p className="whitespace-pre-line text-sm leading-7">{notes}</p>
          </div>
        ) : null}
      </section>
    </>
  );

  return (
    <>
      <SiteHeader settings={settings} locale={locale} />

      {/* `print-sheet` هو الصنف المتعاقد عليه لجذر كل شاشة تُطبع (كتلة الطباعة في
          `app/globals.css`) — بلا أثر على الشاشة، وبه وحده تصل الصفحة كل القواعد
          المشتركة قبل إضافات `PRINT_CSS` أعلاه */}
      <main id="main" className="print-sheet flex-1">
        <style>{PRINT_CSS}</style>
        <style>{MOTION_CSS}</style>

        {/* الترويسة: رقم الحجز بارزاً */}
        <section className="site-hero-bg relative overflow-hidden">
          <div aria-hidden="true" className="pointer-events-none absolute inset-0">
            <div className="site-dots absolute inset-0 opacity-60 [mask-image:radial-gradient(ellipse_70%_90%_at_50%_0%,black,transparent)]" />
            <div className="absolute inset-x-0 bottom-0 h-px bg-gradient-to-l from-transparent via-border to-transparent" />
          </div>

          <div className="sheet-hero relative mx-auto flex w-full max-w-3xl flex-col items-center gap-4 px-4 pb-10 pt-10 text-center sm:px-6 md:pb-12 md:pt-14">
            {/* ترويسة الورقة: اسم العلامة — تعويض ترويسة الموقع المخفيّة بالطباعة
                (‏عقد التصدير §٤: «ترويسة تحمل اسم العلامة والتاريخ»، والتاريخ هو
                سطر «أُنشئ في …» أسفل رقم الحجز) */}
            <p className="print-only hidden text-sm font-bold">{settings.brand.name}</p>

            {/*
              العنوان يقول الحالة الاستثنائية ولا يخبّئها خلف «تفاصيل حجزك».
              و«لم تُنفَّذ» غير «ملغي» بقرار المالك (§١-ب): الإلغاء قرارٌ سبق
              الرحلة، وهذه رحلةٌ حان موعدها ولم تقع — والفرق يهمّ من يقرأ.
            */}
            <h1 className="text-2xl font-extrabold tracking-tight sm:text-3xl">
              {status === "cancelled"
                ? t("titleCancelled", "حجز ملغي")
                : status === "failed"
                  ? t("titleFailed", "رحلة لم تُنفَّذ")
                  : t("title", "تفاصيل حجزك")}
            </h1>

            <div className="flex flex-col items-center gap-2">
              <p className="text-sm text-muted-foreground">{t("reference", "رقم الحجز")}</p>
              <div className="flex items-center gap-2">
                <span
                  dir="ltr"
                  className="rounded-2xl border border-primary/30 bg-primary/5 px-4 py-2 font-mono text-xl font-bold tracking-widest sm:text-2xl"
                >
                  {reference}
                </span>
                <CopyButton
                  value={reference}
                  label={t("referenceCopyLabel", "رقم الحجز")}
                />
              </div>
              {createdLabel ? (
                <p className="text-xs text-muted-foreground">
                  {t("createdAt", "أُنشئ في {value}", { value: createdLabel })}
                </p>
              ) : null}
            </div>
          </div>
        </section>

        <div className="sheet-body mx-auto flex w-full max-w-3xl flex-col gap-6 px-4 py-10 sm:px-6 md:py-14">
          {/* «احفظ هذا الرابط» ينزل أسفل الصفحة على حجزٍ ينتظر الدفع — حاجةُ ما بعد الزيارة */}
          {awaitingPayment ? null : saveLinkBar}

          {/* مؤشر الحالة */}
          {status === "cancelled" ? (
            <div className="flex items-start gap-3 rounded-2xl border border-destructive/40 bg-destructive/10 px-4 py-4 text-destructive">
              <Ban className="mt-0.5 size-5 shrink-0" aria-hidden="true" />
              <div className="flex flex-col gap-1">
                <p className="text-sm font-bold">{t("cancelled.title", "هذا الحجز ملغي")}</p>
                <p className="text-sm leading-7">
                  {t(
                    "cancelled.text",
                    "إن كان الإلغاء غير مقصود تواصل معنا وسنعيد ترتيب رحلتك."
                  )}
                </p>
              </div>
            </div>
          ) : status === "failed" ? (
            /*
              ══════════════════════════════════════════════════════════════
               الرحلة الفاشلة كما يراها العميل (‏موجز الرحلات الفاشلة §١-ب/ج)
              ══════════════════════════════════════════════════════════════

              حالةٌ **نهائية** بقرار المالك: لا تعود إلى الطابور، ولا تُبثّ من
              جديد، ولا يُعاد فتح هذا الحجز. والمسار المتفق عليه سطران لا ثالث:
              **ردُّ المال + حجزٌ جديد**. فالبطاقة تقولهما بهذا الترتيب.

              ── وثلاثة أشياء لا تُقال هنا، وكلٌّ بسببه ────────────────────

              ١. 🔒 **مَن أخفق** — قاعدة `D-19`/white-label: العميل لا يعرف أن
                 وراء رحلته متعهداً أصلاً. وذكرُ «المتعهد» ولو بلا اسم يهدم
                 النموذج كلَّه ويفتح باب «أعطوني رقمه».

              ٢. 🔒 **السبب كما سجّله الأدمن** — وله سببان مستقلان، كلٌّ منهما
                 كافٍ وحده. الأول: تصنيفٌ تشغيليٌّ داخلي وُضع **ليقرّر أثراً
                 مالياً على المتعهد** (خصم · دفع · لا شيء)، لا ليُقرأ اعتذاراً؛
                 و«السائق لم يحضر» في عين العميل اتهامٌ لنا يُدار بإنسان لا
                 بسطرٍ في صفحة. والثاني بنيوي: `failure_reasons.label` نصٌّ
                 **حرٌّ يحرّره المالك من `/admin`** — فعرضُه يعني جملةً عربية
                 يؤلّفها الخادم تظهر كما هي على `/en`، وهو بعينه الدرس المعمَّم
                 من الموجة الأولى («ما يعبر من الخادم إلى الواجهة رمزٌ لا جملة»).

              ٣. 🔒 **رقمُ ردٍّ ولا تاريخه** — الردّ يُسجَّل قيداً في
                 `ledger_entries` بيد المشرف (‏`record_refund`)، و
                 `get_booking_by_token` لا تُخرج منه حرفاً. وقراءتُه بعميل
                 الخدمة كانت ممكنة تقنياً و**رُفضت**: دلالةُ القيد ليست ملكاً
                 لهذه الصفحة (ردٌّ جزئي؟ قيدٌ عُكس بـ`reverses_entry_id`؟
                 جمعُ قيدين؟ — والجمع نفسه حسابُ مالٍ في TypeScript، وهو ممنوع
                 بـ`D-05`). فالصفحة تقول **السياسة** التي حسمها المالك، ولا
                 تدّعي **حالةً** لا تملك مصدرها. ويوم تُخرج القاعدة «المردود»
                 حقلاً مُشتقاً، يصير هذا السطر رقماً بلا تغيير في نبرة البطاقة.

              وطاقمُ الرحلة يغيب من نفسه: حارس `get_booking_by_token` يشترط
              `b.status in ('assigned','completed')` — فلا لوحةَ سيارةٍ ولا اسمَ
              سائقٍ على رحلةٍ لم تقع، بلا سطر حجبٍ واحد في هذا الملف.
            */
            <section
              aria-label={t("failed.sectionLabel", "رحلة لم تُنفَّذ")}
              className="flex flex-col gap-5 rounded-3xl border border-destructive/40 bg-destructive/5 p-5 sm:p-6"
            >
              <div className="flex items-start gap-3">
                <span className="grid size-10 shrink-0 place-items-center rounded-full bg-destructive/15 text-destructive">
                  <CircleSlash className="size-5" aria-hidden="true" />
                </span>
                <div className="flex flex-col gap-1.5">
                  <h2 className="text-base font-bold">
                    {t("failed.title", "نعتذر — هذه الرحلة لم تُنفَّذ")}
                  </h2>
                  <p className="text-sm leading-7 text-muted-foreground">
                    {t(
                      "failed.text",
                      "لم تتم رحلتك كما ينبغي، وهذا الحجز أُغلق نهائياً فلا يُستأنف ولا يُعاد جدولته. وفيما يلي ما يخصّك: مالك، ثم رحلتك إن كنت ما تزال تحتاجها."
                    )}
                  </p>
                </div>
              </div>

              <div className="flex flex-col gap-3">
                {/* المال أولاً — هو أول ما يسأل عنه من قرأ «لم تُنفَّذ» */}
                <div className="flex items-start gap-3 rounded-2xl border border-border bg-card px-4 py-3.5 text-card-foreground">
                  <Wallet className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden="true" />
                  <div className="flex flex-col gap-1">
                    <p className="text-sm font-bold">
                      {t("failed.refundTitle", "ما دفعته يعود إليك")}
                    </p>
                    <p className="text-sm leading-7 text-muted-foreground">
                      {t(
                        "failed.refundText",
                        "لا نأخذ مقابلاً عن رحلة لم تقع. فريقنا يرتّب ردّ ما دفعته ويتواصل معك بشأنه — ولأي استفسار عنه راسلنا بذكر رقم حجزك أعلاه."
                      )}
                    </p>
                  </div>
                </div>

                {/* ثم الرحلة — والزر يفتح حجزاً جديداً لا يستأنف هذا */}
                <div className="flex flex-col gap-3 rounded-2xl border border-border bg-card px-4 py-3.5 text-card-foreground">
                  <div className="flex items-start gap-3">
                    <RouteIcon
                      className="mt-0.5 size-4 shrink-0 text-primary"
                      aria-hidden="true"
                    />
                    <div className="flex flex-col gap-1">
                      <p className="text-sm font-bold">
                        {t("failed.rebookTitle", "وإن كنت ما تزال تحتاج الرحلة")}
                      </p>
                      <p className="text-sm leading-7 text-muted-foreground">
                        {t(
                          "failed.rebookText",
                          "احجزها من جديد ويصلك رقم حجز جديد. ولأننا نبدأ من الصفر، تأكد من الموعد والوجهة قبل التأكيد — فسعر اليوم قد يختلف عن سعر حجزك السابق."
                        )}
                      </p>
                    </div>
                  </div>
                  {/* أداةُ تفاعل: تذهب مع الطباعة كبقية الأزرار في هذه الصفحة */}
                  <Link
                    href={localePath(locale, "/book")}
                    className={`${PRINT_HIDDEN_CLASS} inline-flex h-11 w-fit items-center justify-center gap-2 rounded-2xl bg-primary px-5 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50`}
                  >
                    <RouteIcon className="size-4 shrink-0" aria-hidden="true" />
                    {t("failed.rebookCta", "احجز رحلة جديدة")}
                  </Link>
                </div>
              </div>

              {/*
                وبابُ الإنسان — لا يُستغنى عنه هنا بحال: كل ما لا تقوله هذه
                البطاقة (ماذا جرى بالضبط، ومتى يصل الردّ) جوابه محادثةٌ لا سطر،
                والمنصة وحدها تعرف من نفّذ الرحلة وتصل إليه.
              */}
              {whatsapp || phone ? (
                <div className={`${PRINT_HIDDEN_CLASS} flex flex-wrap gap-2`}>
                  {whatsapp ? (
                    <a
                      href={waHref(whatsapp)}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex h-11 items-center justify-center gap-2 rounded-2xl border border-border bg-background px-5 text-sm font-medium transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
                    >
                      <MessageCircle className="size-4 shrink-0" aria-hidden="true" />
                      {t("failed.whatsapp", "تواصل عبر واتساب")}
                    </a>
                  ) : null}
                  {phone ? (
                    <a
                      href={telHref(phone)}
                      className="inline-flex h-11 items-center justify-center gap-2 rounded-2xl border border-border bg-background px-5 text-sm font-medium transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
                    >
                      <Phone className="size-4 shrink-0" aria-hidden="true" />
                      {t("failed.phone", "اتصل بنا")}
                    </a>
                  ) : null}
                </div>
              ) : null}
            </section>
          ) : (
            <section
              aria-label={t("stepsLabel", "مراحل الحجز")}
              className="rounded-3xl border border-border bg-card p-5 text-card-foreground sm:p-6"
            >
              <StatusStepper status={status} t={t} />
              {/* الحالة بالكلمات — على الورقة وحدها: الطباعة تفكّ ألوان المؤشر
                  فتصير خطواته الأربع متشابهة، والإطار حول الخطوة الحالية وحده
                  إشارة لا تُقرأ بصوت عالٍ */}
              {currentStep ? (
                <p className="print-only mt-4 hidden text-sm font-semibold">
                  {t("share.statusNow", "الحالة الآن: {value}", {
                    value: t(`steps.${currentStep.key}`, currentStep.label),
                  })}
                </p>
              ) : null}
            </section>
          )}

          {/*
            مركبتك وسائقك — جواب الملاحظة ٥ في ملحق الرؤية ٢: «العميل لا يعرف ما
            سيأتيه — لا نوع السيارة ولا شكلها ولا رقمها ولا لونها، ولا السائق».

            **موضعها فوق المبالغ لا تحتها**: من يفتح صفحته بعد الإسناد يفتحها
            ليعرف ما يأتيه لا ليراجع حسابه — والحساب صار مغلقاً في هذه المرحلة.

            **واللوحة أبرز عنصر فيها** لأنها وحدها ما يُبحث عنه فعلاً: الواقف
            على الرصيف لا يقارن أسماء موديلات، بل يقرأ أرقام لوحات.

            **وتُطبع كاملةً** — ولا صنف `no-print` عليها ولا زرّ ولا نموذج
            داخلها يُسقطه محرّك الطباعة: ورقةُ الرحلة التي يحملها العميل معه هي
            هذه البطاقة بعينها، وهي أكثر ما يستحق أن يكون على ورق.

            🔒 **ولا صورة هنا ولا مكان لها:** عمودا `photo_path` موجودان في
            القاعدة والرفعُ **مؤجَّل بقرار** (ترويسة الهجرة `0040`) — دلو `media`
            عام، وصورةُ السائق بيانات شخصية لطرفٍ ثالث يقرؤها أي أحد بالمسار،
            فمكانها دلو خاص برابط موقَّع كالإيصالات. ولا حقل صورة في الحمولة
            أصلاً، فمن يضيف `<img>` هنا يضيف رابطاً مكسوراً لا ميزة.

            🔒 **ولا `byAdmin` ولا `assignedAt` يصلان هذه الصفحة أصلاً** — أسقطتهما
            0043 من حمولة الدالة. «من سجّل البيانات ومتى» شأنٌ تشغيلي مكانه شاشة
            المالك `/admin/orders/[id]`، وكان يصل إلى هنا فلا يُعرض — أي حجباً في
            العرض، وهو ما ترفضه قاعدة هذا المجال. فمن أراد إعادتهما فليعلم أنه
            يبني السطر الذي أُغلق.
          */}
          {crew ? (
            <section
              aria-label={t("crew.sectionLabel", "مركبتك وسائقك")}
              className="flex flex-col gap-4 rounded-3xl border border-primary/30 bg-card p-5 text-card-foreground sm:p-6"
            >
              <div className="flex flex-col gap-1.5">
                <h2 className="flex items-center gap-2 text-base font-bold">
                  <CarFront className="size-5 shrink-0 text-primary" aria-hidden="true" />
                  {t("crew.heading", "مركبتك وسائقك")}
                </h2>
                <p className="text-sm leading-7 text-muted-foreground">
                  {t("crew.lead", "هذه هي السيارة التي ستصلك ومن يقودها.")}
                </p>
              </div>

              {/* اللوحة: العنصر الذي يُبحث عنه بالعين، فيأخذ حجم ما يُبحث عنه */}
              {crew.vehiclePlate ? (
                <div className="flex flex-col items-center gap-1.5 rounded-2xl border border-primary/30 bg-primary/5 px-4 py-4 text-center">
                  <p className="text-xs font-medium text-muted-foreground">
                    {t("crew.plate", "رقم اللوحة")}
                  </p>
                  <p
                    dir="ltr"
                    className="font-mono text-2xl font-extrabold tracking-widest sm:text-3xl"
                  >
                    {crew.vehiclePlate}
                  </p>
                </div>
              ) : null}

              <dl className="grid gap-3 text-sm sm:grid-cols-2">
                {crewVehicleLine.length > 0 ? (
                  <div className="flex items-center justify-between gap-3 rounded-2xl bg-muted/40 px-3 py-2.5">
                    <dt className="flex items-center gap-1.5 text-muted-foreground">
                      <CarFront className="size-3.5 shrink-0" aria-hidden="true" />
                      {t("crew.vehicle", "المركبة")}
                    </dt>
                    <dd className="font-medium">{crewVehicleLine}</dd>
                  </div>
                ) : null}
                {crew.vehicleColor ? (
                  <div className="flex items-center justify-between gap-3 rounded-2xl bg-muted/40 px-3 py-2.5">
                    <dt className="text-muted-foreground">{t("crew.color", "اللون")}</dt>
                    <dd className="font-medium">{crew.vehicleColor}</dd>
                  </div>
                ) : null}
                {crew.driverName ? (
                  <div className="flex items-center justify-between gap-3 rounded-2xl bg-muted/40 px-3 py-2.5">
                    <dt className="flex items-center gap-1.5 text-muted-foreground">
                      <UserRound className="size-3.5 shrink-0" aria-hidden="true" />
                      {t("crew.driver", "السائق")}
                    </dt>
                    <dd className="font-medium">{crew.driverName}</dd>
                  </div>
                ) : null}
                {/* الرقم رابط اتصال على الموبايل، ونصٌّ مقروء على الورقة */}
                {crew.driverPhone ? (
                  <div className="flex items-center justify-between gap-3 rounded-2xl bg-muted/40 px-3 py-2.5">
                    <dt className="flex items-center gap-1.5 text-muted-foreground">
                      <Phone className="size-3.5 shrink-0" aria-hidden="true" />
                      {t("crew.driverPhone", "هاتف السائق")}
                    </dt>
                    <dd>
                      <a
                        href={telHref(crew.driverPhone)}
                        dir="ltr"
                        className="font-mono font-semibold text-primary hover:underline"
                      >
                        {crew.driverPhone}
                      </a>
                    </dd>
                  </div>
                ) : null}
              </dl>

              {/*
                الرقم غائب — **والجملة إلزامية لا تحسينية**: رقمٌ غائب بلا تفسير
                يُقرأ صفحةً معطوبة لا سياسةً. والحجب نفسه وقع في القاعدة، وهذا
                إخبارٌ به لا تنفيذٌ له.

                ⚠ **وللغياب سببان متعاكسان منذ 0043، ولا تصلح لهما جملة واحدة:**
                قبل النافذة الرقم **سيظهر**، وبعدها **لن يعود** — والنافذة تُغلق
                بعد الالتقاء باثنتي عشرة ساعة. فقولُ «سيظهر قبل موعد انطلاقك»
                لعميلٍ انتهت رحلته أمسِ وعدٌ بما لا تفعله القاعدة، ويُبقيه يفتح
                الصفحة انتظاراً لشيء لا يأتي. وبعد انقضائها يبقى بابٌ واحد وهو
                الصحيح تجارياً وتشغيلياً معاً: التواصل عبر المنصة نفسها، فهي وحدها
                تعرف من نفّذ الرحلة وتصل إليه (والعميل لا يعرفه — قاعدة
                white-label).
              */}
              {crew.driverName && !crew.driverPhone ? (
                <p className="flex items-start gap-2 rounded-2xl border border-border bg-muted/40 px-4 py-3 text-sm leading-7">
                  {crewPhoneWindowClosed ? (
                    <Info className="mt-1 size-4 shrink-0 text-primary" aria-hidden="true" />
                  ) : (
                    <Clock className="mt-1 size-4 shrink-0 text-primary" aria-hidden="true" />
                  )}
                  <span>
                    {crewPhoneWindowClosed
                      ? t(
                          "crew.phoneWindowClosed",
                          "انتهت مدة عرض رقم السائق مع انتهاء موعد هذه الرحلة، فلن يظهر مرة أخرى. لأي استفسار بشأنها تواصل معنا مباشرةً بذكر رقم حجزك."
                        )
                      : crewPhoneAtLabel
                        ? t(
                            "crew.phoneLaterAt",
                            "رقم السائق يظهر لك في هذه الصفحة قبل موعد انطلاقك — في {value}. لا خطوة مطلوبة منك: افتحها حينها وستجده.",
                            { value: crewPhoneAtLabel }
                          )
                        : t(
                            "crew.phoneLater",
                            "رقم السائق يظهر لك في هذه الصفحة قبل موعد انطلاقك — افتحها حينها وستجده."
                          )}
                  </span>
                </p>
              ) : null}
            </section>
          ) : null}

          {/* الحساب فوق الدفع للمؤكَّد، ومطويّاً تحته لمن لم يدفع (٩ + ١٣) */}
          {awaitingPayment ? null : financials}

          {/* رفض إيصال سابق — يسبق بطاقة التحويل ليقرأه العميل قبل أن يعيد الرفع */}
          {rejection ? (
            <section
              aria-label={t("rejection.sectionLabel", "سبب رفض الإيصال السابق")}
              className="flex items-start gap-3 rounded-2xl border border-amber-500/50 bg-amber-500/10 px-4 py-4 text-amber-900 dark:text-amber-200"
            >
              <TriangleAlert className="mt-0.5 size-5 shrink-0" aria-hidden="true" />
              <div className="flex flex-col gap-1.5">
                <p className="text-sm font-bold">
                  {t("rejection.title", "لم يُعتمد إيصالك السابق")}
                </p>
                <p className="whitespace-pre-line text-sm leading-7">
                  {rejection.note ??
                    t("rejection.fallback", "راجع بيانات التحويل أدناه ثم أعد رفع الإيصال.")}
                </p>
                {rejectionLabel ? (
                  <p className="text-xs leading-6 opacity-80">{rejectionLabel}</p>
                ) : null}
              </div>
            </section>
          ) : null}

          {/* قسم الحالة: الدفع / المراجعة / التأكيد */}
          {status === "pending_payment" ? (
            <section
              // مرساة زرّ «أكمل الدفع الآن» في لوحة ما قبل التأكيد (م‑١١).
              // المعرّف ثابتٌ مشترك (`PAY_SECTION_ANCHOR`) فلا ينحرف عن الرابط
              // الذي يقصده، ولا يعمل بجافاسكربت أصلاً — نزولٌ داخل الصفحة.
              id={PAY_SECTION_ANCHOR}
              aria-label={t("pay.sectionLabel", "إتمام الدفع")}
              className="flex flex-col gap-5 scroll-mt-6 rounded-3xl border border-primary/30 bg-card p-5 text-card-foreground shadow-sm shadow-primary/5 sm:p-6"
            >
              <div className="flex flex-col gap-2">
                <h2 className="flex items-center gap-2 text-base font-bold">
                  {/*
                    ن‑٩ (د): **النبض هنا وحده** — «بانتظار الدفع» هي الحالة التي
                    فيها إلحاحٌ حقيقي، والحلقة تنبض ما دام المال لم يصل. وهي
                    `aria-hidden` لأنها لا تحمل خبراً: الخبر في العنوان وفي
                    جملة المهلة تحته.
                  */}
                  <span className="relative grid size-5 shrink-0 place-items-center">
                    <span
                      aria-hidden="true"
                      className="bk-pulse-ring absolute inset-0 rounded-full bg-primary/40"
                    />
                    <Wallet className="relative size-5 text-primary" aria-hidden="true" />
                  </span>
                  {gateways.length > 0
                    ? tPay("heading", "ادفع {amount} لتأكيد الحجز", {
                        amount: fmt.money(amountDue, currency),
                      })
                    : t("pay.heading", "حوّل {amount} لتأكيد الحجز", {
                        amount: fmt.money(amountDue, currency),
                      })}
                </h2>
                <p className="text-sm leading-7 text-muted-foreground">
                  {gateways.length > 0
                    ? tPay(
                        "chooseMethod",
                        "اختر الوسيلة الأنسب لك — كل الوسائل تؤكد الحجز بالمبلغ نفسه."
                      )
                    : payment.transferInstructions}
                </p>

                {/*
                  مهلة الحفظ — تحت العنوان مباشرةً لأنها **شرط** إتمام ما تحته،
                  لا حاشية. وتُطبع مع الورقة: من يطبع صفحته وهو بانتظار الدفع
                  يحمل معه أرقام الحسابات، فليحمل معها الموعد.

                  🔒 وصياغتان لا واحدة، لأن الحقيقتين مختلفتان:
                    • قبل الأرضية ⇒ «محفوظ حتى» — وعدٌ نستطيع الوفاء به: الكنس
                      لا يلمسه قبلها، وقد يتأخر عنها (نشاط إيصالٍ حديث يستثنيه)
                      فالامتداد لا يكذّب الجملة والتقصير مستحيل.
                    • بعدها ⇒ «انقضت وقد يُلغى في أي وقت» — لا «أُلغي» فالحجز
                      قائم أمامه، ولا «محفوظ حتى» فذلك وعدٌ بماضٍ.
                */}
                {holdUntilLabel ? (
                  <div className="flex flex-col gap-2 rounded-2xl border border-primary/30 bg-primary/5 px-4 py-3">
                    <p className="flex items-start gap-2 text-sm leading-7">
                      <Clock className="mt-1 size-4 shrink-0 text-primary" aria-hidden="true" />
                      <span>
                        {holdPassed
                          ? t(
                              "pay.holdPassed",
                              "انقضت مهلة حفظ هذا الحجز، وقد يُلغى تلقائياً في أي وقت. إن كنت قد حوّلت فارفع الإيصال الآن، وإلا فتواصل معنا بذكر رقم حجزك."
                            )
                          : t(
                              "pay.holdUntil",
                              "حجزك محفوظ لك حتى {value} — أتمّ التحويل وارفع الإيصال قبله، فبعده قد يُلغى تلقائياً ويعود موعده متاحاً لغيرك.",
                              { value: holdUntilLabel }
                            )}
                      </span>
                    </p>

                    {/*
                      ن‑٩ (ج): العدّاد **إضافةٌ على الجملة لا بديلٌ عنها**.
                      الجملة بالتاريخ الكامل بتوقيت القاهرة هي ما يصل من لا
                      سكربت عنده وما يُطبع على الورقة؛ والعدّاد يعيش في المتصفح
                      وحده ويذهب مع الطباعة (`PRINT_HIDDEN_CLASS`) — رقمٌ يتغيّر
                      كل ثانية لا معنى له على ورق.
                    */}
                    {showCountdown && hold.holdUntil ? (
                      <div className={`${PRINT_HIDDEN_CLASS} ps-6`}>
                        <HoldCountdown holdUntil={hold.holdUntil} locale={locale} />
                      </div>
                    ) : null}
                  </div>
                ) : null}
              </div>

              {gateways.length > 0 ? (
                <PaymentMethodChoice token={token} gateways={gateways}>
                  {manualPanel}
                </PaymentMethodChoice>
              ) : (
                manualPanel
              )}
            </section>
          ) : null}

          {status === "under_review" ? (
            <section
              aria-label={t("review.sectionLabel", "حالة المراجعة")}
              className="flex items-start gap-3 rounded-3xl border border-border bg-card p-5 text-card-foreground sm:p-6"
            >
              <span className="grid size-10 shrink-0 place-items-center rounded-full bg-primary/10 text-primary">
                <Hourglass className="size-5" aria-hidden="true" />
              </span>
              <div className="flex flex-col gap-1.5">
                <h2 className="text-base font-bold">
                  {t("review.title", "إيصالك تحت المراجعة")}
                </h2>
                <p className="text-sm leading-7 text-muted-foreground">
                  {t(
                    "review.text",
                    "وصلنا إيصال التحويل ويراجعه فريق التشغيل الآن. ما إن يُعتمد حتى تتحول حالة حجزك إلى «تم التأكيد» في هذه الصفحة نفسها — لا حاجة لأي خطوة منك."
                  )}
                </p>
              </div>
            </section>
          ) : null}

          {status === "confirmed" || status === "assigned" || status === "completed" ? (
            <section
              aria-label={t("confirmed.sectionLabel", "حجز مؤكد")}
              className="flex flex-col gap-4 rounded-3xl border border-primary/30 bg-primary/5 p-5 sm:p-6"
            >
              <div className="flex items-start gap-3">
                {/*
                  ن‑٩ (د): **حركةٌ واحدة عند الوصول ثم سكون** — علامةُ ثقةٍ لا
                  تنبيه. والحلقة تتلاشى مرةً ولا تتكرر، والدرع يستقر ولا يتحرك
                  بعدها. وما يبقى بعد الحركة (وبلا حركةٍ أصلاً) هو نفسه: درعٌ
                  على لون العلامة.
                */}
                <span className="relative grid size-10 shrink-0 place-items-center">
                  <span
                    aria-hidden="true"
                    className="bk-arrive-ring absolute inset-0 rounded-full bg-primary/40"
                  />
                  <span className="bk-arrive relative grid size-10 place-items-center rounded-full bg-primary text-primary-foreground">
                    <ShieldCheck className="size-5" aria-hidden="true" />
                  </span>
                </span>
                <div className="flex flex-col gap-1.5">
                  <h2 className="text-base font-bold">
                    {status === "completed"
                      ? t("confirmed.completedTitle", "تمت رحلتك — شكراً لثقتك")
                      : t("confirmed.title", "حجزك مؤكد")}
                  </h2>
                  <p className="text-sm leading-7 text-muted-foreground">
                    {status === "completed"
                      ? t("confirmed.completedText", "نسعد بخدمتك في رحلتك القادمة.")
                      : t(
                          "confirmed.text",
                          "تم اعتماد تحويلك. نتواصل معك قبل الموعد بتفاصيل السيارة والسائق."
                        )}
                  </p>
                </div>
              </div>

              {/*
                ══════════════════════════════════════════════════════════════
                 ن‑٧ — «أرسل تفاصيل رحلتك»، **هنا وحدها**
                ══════════════════════════════════════════════════════════════

                قرار بدر: لا زرّ مشاركةٍ عائم في كل صفحة، بل في **لحظة المشاركة
                الحقيقية** — حجزٌ تأكّد، وصاحبه يريد أن يخبر من ينتظره أو من
                يستقبله. وقبل التأكيد لا شيء يُرسَل: من يشارك حجزاً لم يُدفع
                يشارك مهمّةً معلّقة لا خبراً.

                ولا يُصيَّر بعد انتهاء الرحلة كذلك: تفاصيل رحلةٍ تمّت خبرٌ فات.

                🔒 **والفرق عن شريط «احفظ هذا الرابط» أعلى الصفحة مقصود:** ذاك
                يقول للعميل «هذا مفتاحك فاحفظه»، وهذا يقول «أرسله لمن يحتاجه» —
                ولذلك يحمل معه **تنبيهاً صريحاً** بأن من يفتحه يرى الصفحة.
                المشاركة قرارُ العميل، ووظيفتنا أن يكون مطّلعاً حين يتخذه.
              */}
              {status !== "completed" ? (
                <div
                  className={`${PRINT_HIDDEN_CLASS} flex flex-col gap-2 rounded-2xl border border-border bg-card px-4 py-3.5 text-card-foreground`}
                >
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <p className="text-sm font-bold">
                      {t("confirmed.shareTitle", "أرسل تفاصيل رحلتك")}
                    </p>
                    <div className="flex shrink-0 flex-wrap items-center gap-2">
                      <TripShare
                        text={tripShareText}
                        url={bookingUrl}
                        title={t("confirmed.shareCardTitle", "تفاصيل رحلة {reference}", {
                          reference,
                        })}
                        fallbackHref={waShareHref(tripShareText)}
                        label={t("confirmed.shareCta", "مشاركة")}
                        className="inline-flex h-9 items-center justify-center gap-1.5 rounded-xl border border-border bg-background px-3 text-sm font-medium transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
                      />
                      <CopyButton
                        value={tripShareText}
                        label={t("confirmed.shareCopyLabel", "تفاصيل الرحلة")}
                        variant="inline"
                      />
                    </div>
                  </div>
                  <p className="text-xs leading-6 text-muted-foreground">
                    {t(
                      "confirmed.shareNote",
                      "الموعد والمسار ورقم الحجز — بلا أي مبلغ. ومعها رابط المتابعة، ومن يفتحه يرى هذه الصفحة، فأرسله لمن تثق به وحده."
                    )}
                  </p>
                </div>
              ) : null}

              {/* زرّا التواصل أداتان لا معلومة — يذهبان بالطباعة، ويقوم مقامهما
                  سطر التذييل المطبوع أسفل الورقة وفيه الهاتف مكتوباً */}
              {whatsapp || phone ? (
                <div className={`${PRINT_HIDDEN_CLASS} flex flex-wrap gap-2`}>
                  {whatsapp ? (
                    <a
                      href={waHref(whatsapp)}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex h-11 items-center justify-center gap-2 rounded-2xl bg-primary px-5 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
                    >
                      <MessageCircle className="size-4 shrink-0" aria-hidden="true" />
                      {t("confirmed.whatsapp", "تواصل عبر واتساب")}
                    </a>
                  ) : null}
                  {phone ? (
                    <a
                      href={telHref(phone)}
                      className="inline-flex h-11 items-center justify-center gap-2 rounded-2xl border border-border bg-background px-5 text-sm font-medium transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
                    >
                      <Phone className="size-4 shrink-0" aria-hidden="true" />
                      {t("confirmed.phone", "اتصل بنا")}
                    </a>
                  ) : null}
                </div>
              ) : null}
            </section>
          ) : null}

          {/* ثم «على ماذا أدفع؟» ثم «كيف تكوّن المبلغ؟» — بعد الدعوة لا قبلها */}
          {awaitingPayment ? tripCard : null}
          {awaitingPayment ? financialsFolded : null}

          {/* سجل الإيصالات — ما وصلنا وحالته. القائمة الفارغة لا تصيّر شيئاً */}
          {listedReceipts.length > 0 ? (
            <section
              aria-label={t("receipts.sectionLabel", "إيصالات التحويل")}
              className="flex flex-col gap-4 rounded-3xl border border-border bg-card p-5 text-card-foreground sm:p-6"
            >
              <div className="flex flex-col gap-1.5">
                <h2 className="flex items-center gap-2 text-base font-bold">
                  <ReceiptText className="size-5 shrink-0 text-primary" aria-hidden="true" />
                  {t("receipts.heading", "إيصالات التحويل")}
                </h2>
                <p className="text-sm leading-7 text-muted-foreground">
                  {t("receipts.lead", "ما وصلنا من إيصالات هذا الحجز وحالة كل منها.")}
                </p>
              </div>

              <ul className="flex flex-col gap-3">
                {listedReceipts.map((receipt, index) => (
                  <ReceiptCard
                    key={receipt.id || `${receipt.createdAt ?? ""}#${index}`}
                    receipt={receipt}
                    currency={currency}
                    fmt={fmt}
                    t={t}
                  />
                ))}
              </ul>
            </section>
          ) : null}

          {awaitingPayment ? null : tripCard}

          {/*
            🔴 **وهنا موضعها على حجزٍ ينتظر الدفع — لا تُحذف.**

            «هو مفتاحك الوحيد لهذه الصفحة» جملةٌ حرفية: `get_booking_by_token`
            تأذن بحيازة التوكن وحده، فمن فقد الرابط فقد حجزه. وإسقاطُها كان
            سيكون أسوأ من تشتّتٍ في الترتيب.

            وإنما نزلت لأن حاجتها **بعد** الزيارة لا أثناءها: من فتح الصفحة الآن
            لا يحتاج رابطاً إليها، ويحتاجه غداً. فتبقى كاملةً بأزرارها الثلاث
            (نسخ · واتساب · طباعة) في آخر ما يقرؤه، بعد أن يكون قد دفع.
          */}
          {awaitingPayment ? saveLinkBar : null}

          {/* «أضِف هذا الحجز إلى حسابي» — المدخل الثاني للربط في العقد §٥،
              وحيازةُ التوكن هي الإثبات. تظهر لصاحب الجلسة، وتدعو غيره إلى
              الدخول بلا أن تشترطه: الحساب طبقةُ راحة لا بوابة. */}
          <LinkThisBooking token={token} locale={locale} t={t} />

          {/* تذييل مساعد */}
          <p className="text-center text-xs leading-6 text-muted-foreground">
            {footerBefore}
            <span dir="ltr" className="font-mono font-medium text-foreground">
              {reference}
            </span>
            {footerAfter}
          </p>

          {/* تذييل الورقة: باسم من صدرت وبأي رقم يُسأل عنها — تعويض تذييل الموقع
              وأزرار التواصل المخفيَّين بالطباعة. وبلا هاتف مضبوط في الإعدادات
              يبقى اسم العلامة وحده، فلا يُطبع سطر يَعِد برقم لا وجود له */}
          <p className="print-only hidden text-center text-xs leading-6">
            {t("share.printContact", "للاستفسار عن هذه الرحلة: {brand}", {
              brand: settings.brand.name,
            })}
            {phone ? (
              <span dir="ltr" className="ms-2 font-mono font-medium">
                {phone}
              </span>
            ) : null}
          </p>
        </div>
      </main>

      <SiteFooter settings={settings} locale={locale} />
      {/* الزر العائم أداة تفاعل ثابتة الموضع — بلا هذا الغلاف يطبع نفسه فوق
          الورقة الأولى، ولا سبيل لتعليمه من هنا لأنه مشترك بين كل الصفحات */}
      <div className={PRINT_HIDDEN_CLASS}>
        <WhatsAppFab settings={settings} locale={locale} />
      </div>
    </>
  );
}
