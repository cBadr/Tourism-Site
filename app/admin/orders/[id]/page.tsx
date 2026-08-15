import type { ReactNode } from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import {
  AlertTriangle,
  Ban,
  CarFront,
  CheckCircle2,
  Coins,
  ConciergeBell,
  ExternalLink,
  Eye,
  EyeOff,
  FileText,
  MapPin,
  MessageCircle,
  Phone,
  ReceiptText,
  Upload,
  UserCheck,
  Wallet,
  XCircle,
} from "lucide-react";

import { PrintButton } from "@/components/admin/print-button";
import { PrintHeader } from "@/components/admin/print-header";
import {
  durationLabel,
  formatDistance,
  formatMoney,
  hoursText,
  passengersLabel,
  toArabicDigits,
} from "@/components/booking/format";
import { HelpTip } from "@/components/shared/HelpTip";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import type { TripSnapshot } from "@/lib/booking-types";
import { telLink, waLink } from "@/lib/phone";
import type { PriceSource } from "@/lib/subcontractor-types";
import { createServiceSupabase } from "@/lib/supabase/admin";
import { createServerSupabase } from "@/lib/supabase/server";
import { cn } from "@/lib/utils";
import {
  asNumber,
  asText,
  Banners,
  BOOKING_STATUSES,
  COMMON_BOOKING_ERRORS,
  controlClass,
  dateTimeLabel,
  eventLabel,
  FAILURE_ACTION_HINTS,
  FAILURE_ACTION_LABELS,
  isBookingStatus,
  LEDGER_EFFECT_LABELS,
  PAYMENT_KIND_LABELS,
  pick,
  PLAN_LABELS,
  relativeTime,
  StatusBadge,
  STATUS_HINTS,
  STATUS_LABELS,
} from "../_components/booking-ui";
import { DISPATCH_ERRORS } from "../../dispatch/_components/dispatch-ui";
import { DispatchPanel } from "./_components/dispatch-panel";
import {
  cancelBooking,
  changeStatus,
  markBookingFailed,
  setReceiptVisibility,
  setTripCrewByAdmin,
  uploadAdminReceipt,
  verifyTransfer,
} from "./actions";

/**
 * تفاصيل الطلب — شاشة عمل التشغيل على حجز واحد:
 * لقطة الرحلة، تواصل العميل، تفصيل السعر، الإيصالات، سجل الحالة، ثم الإجراءات.
 *
 * أمن الإيصالات (قاعدة المرحلة ٤): مخزن `receipts` خاص ولا يُقرأ إلا بالخدمة —
 * لا يظهر مسار الملف في الصفحة إطلاقاً، بل رابط مُوقَّع عمره ٥ دقائق يُنشأ هنا في الخادم.
 *
 * ── الدفعة ٤ — الملاحظة ٦: **ورقة تشغيل الرحلة** ─────────────────────────────
 *
 * نفس الشاشة تُطبع ورقةً واحدة تُحمل إلى الميدان، والسؤال الذي يفرز محتواها
 * واحد: **هل يفيد من يمسك الورقة؟** فيبقى ما يُنفَّذ به: من العميل وكيف يُتصل به،
 * ومن أين إلى أين ومتى، وبأي فئة، وكم يُحصَّل منه نقداً، وما الخدمات الإضافية
 * الملتزم بها، ومن ينفّذ وبكم اتُّفق معه.
 *
 * ويسقط ما يُقرَّر به على الشاشة: كل نموذج وزر ولوح إجراءات، وسجل البث، وسجل
 * الحجز، وبطاقتا الربحية — لأن الورقة لا تُنقر، ولأن **الهامش لا يُطبع**.
 *
 * 🔒 **وهي مع ذلك ورقة داخلية بحكم تكوينها:** تحمل هاتف العميل وسعره النهائي
 * ومستحق المنفِّذ في صفحة واحدة، فمن يجمع الأخيرَين يعرف هامشنا بلا أن نطبعه.
 * ولذلك تقول ترويستها ذلك نصّاً — والمتعهد يقرأ رحلته في بورتاله بسعره هو،
 * وللعميل صفحة متابعته: لا أحد منهما يحتاج هذه الورقة أصلاً.
 */

export const metadata = { title: "تفاصيل الطلب" };

const hasSupabaseEnv = () =>
  Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);

/** عمر الرابط المُوقَّع للإيصال بالثواني — قصير عمداً */
const RECEIPT_URL_TTL = 300;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const IMAGE_EXT = /\.(png|jpe?g|webp|gif|avif|heic|heif)$/i;

type Payment = {
  key: string;
  /** معرّف صف التحصيل — null يعني صفاً بلا معرّف فلا زر تبديل رؤية له */
  id: string | null;
  amount: number | null;
  accountId: string | null;
  status: string | null;
  note: string | null;
  createdAt: string | null;
  receiptUrl: string | null;
  receiptIsImage: boolean;
  receiptMissing: boolean;
  /**
   * يسافر صف الإيصال في حمولة `get_booking_by_token`؟ العمود يصل مع هجرة 0027
   * وافتراضيه `true`، فقبلها — ومع أي صف قديم — القيمة `true` وهي الحقيقة: كل
   * الإيصالات كانت في الحمولة. و`false` تعني أن الصف **يُسقط من الحمولة نفسها**
   * فلا يبلغ متصفح العميل بحال، لا أنه يُخفى في طبقة العرض.
   */
  visibleToCustomer: boolean;
  /** رفعه فريق التشغيل نيابة عن العميل (واتساب أو هاتفياً) لا العميل بنفسه */
  uploadedByAdmin: boolean;
};

/**
 * سطر خدمة إضافية على هذا الحجز — صف في `booking_extras` (هجرة `0031`).
 *
 * 🔒 **لقطة مجمَّدة لا مرجع حي**: الاسم وسعر الوحدة والإجمالي كلها مخزَّنة لحظة
 * الحجز، فتعديل سعر الخدمة في `/admin/extras` غداً لا يعيد كتابة حجز الأمس (نفس
 * مبرر D-10 ولقطة الكوبون). ولا حساب هنا: `line_total` يُقرأ ولا يُضرب.
 */
type BookingExtra = {
  key: string;
  title: string;
  qty: number | null;
  unitPrice: number | null;
  lineTotal: number | null;
};

type EventRow = {
  key: string;
  label: string;
  note: string | null;
  /** اسم المنفِّذ جاهزاً للعرض — بريد المشرف أو «من اللوحة»، ولا معرّف خام أبداً */
  actorLabel: string | null;
  createdAt: string | null;
};

type Account = { label: string; kind: string | null; handle: string | null };

/**
 * صفّ الفشل — لقطة مجمَّدة لرحلةٍ خابت (‏`booking_failures` · هجرة `0051`).
 *
 * 🔒 **لقطة لا مرجع حي**: التسمية والإجراء الافتراضي مخزَّنان في الصفّ نفسه لحظة
 * الوقوع، فإعادة تسمية سببٍ في `/admin/failure-reasons` غداً لا تُعيد كتابة ما
 * قيل اليوم (نفس مبرر لقطة السعر في `create_booking` ولقطة عنوان الخدمة).
 * والجدول **مُلحَقٌ فقط**: مُشغّل يرفض أي `update` أو `delete` عليه، فما يُعرض
 * هنا هو ما وقع — لا ما يُظنّ أنه وقع.
 */
type FailureRecord = {
  reasonSlug: string;
  reasonLabel: string;
  defaultAction: string;
  actionTaken: string;
  deductAmount: number | null;
  overrideNote: string | null;
  fromStatus: string | null;
  payoutSnapshot: number | null;
  /** رمزُ ما وقع في الدفتر — **رمز لا جملة**، يُترجَم في `LEDGER_EFFECT_LABELS` */
  ledgerEffect: string;
  failedAt: string | null;
};

/** سببٌ مفعَّل من الكتالوج كما هو **الآن** — يُقرأ لحظة العرض لا يُخزَّن */
type FailureReasonOption = { slug: string; label: string; defaultAction: string };

/**
 * الحساب الفعلي للرحلة — من العرض `v_booking_profit` (المرحلة ٧).
 *
 * الفرق بينه وبين بطاقة «ربحية الرحلة» جوهري: تلك **لقطة نيّة** مثبَّتة لحظة
 * الحجز، وهذا **واقع مقيَّد في الدفتر**: ما وصل خزينتنا فعلاً، وما قبضه المتعهد
 * نقداً نيابةً عنا، ومستحقه الحقيقي بعد الإسناد (قد يخالف تكلفة التسعير حين
 * يُسنَد الطلب يدوياً بمبلغ متفق عليه).
 */
type BookingProfit = {
  revenue: number | null;
  partnerCost: number | null;
  grossProfit: number | null;
  collectedByUs: number | null;
  collectedByPartner: number | null;
};

type Booking = {
  id: string;
  reference: string;
  publicToken: string | null;
  status: string;
  classSlug: string | null;
  classTitle: string | null;
  total: number;
  currency: string;
  plan: string | null;
  amountDue: number;
  amountRemaining: number;
  customerName: string | null;
  customerPhone: string | null;
  customerWhatsapp: string | null;
  trip: Partial<TripSnapshot>;
  createdAt: string | null;
  /**
   * لقطة مصدر السعر (المرحلة ٥) — تكتبها `create_booking` لحظة الحجز.
   * `null` في الحجوزات التي سبقت الهجرة، ولا تتغير أبداً بعد الكتابة: هذه هي
   * المادة الخام لتقارير الربحية في المرحلة ٧.
   */
  priceSource: PriceSource | null;
  subcontractorId: string | null;
  subcontractorCost: number | null;
  marginAmount: number | null;
};

const numberOf = (v: unknown): number => asNumber(v) ?? 0;

/** صيغة الجمع العربية للحقائب — عرضٌ محض على غرار `hoursText` في وحدة التنسيق */
function luggageText(count: number): string {
  const n = Math.max(0, Math.round(count));
  if (n === 0) return "بلا حقائب";
  if (n === 1) return "حقيبة واحدة";
  if (n === 2) return "حقيبتان";
  if (n <= 10) return `${toArabicDigits(n)} حقائب`;
  return `${toArabicDigits(n)} حقيبة`;
}

/**
 * رسائل النجاح بحسب الإجراء المنفَّذ — كل إجراء يعيد رمزه في `saved` بدل «1»
 * العامة، فيقرأ المشغّل ماذا وقع بالضبط لا مجرد «تم». إجراءات المرحلة ٤ تُبقي
 * الرمز «1» فلا تتغيّر رسالتها.
 */
const SAVED_MESSAGES: Record<string, string> = {
  "1": "نُفذ الإجراء وحُدِّثت حالة الحجز — العميل يرى الحالة الجديدة في صفحة متابعته فوراً.",
  broadcast:
    "بدأت الموجة الأولى — وصل العرض للمتعهدين المغطّين للمسار، وسيظهر ردّ كل واحد في سجل العروض أدناه.",
  rebroadcast:
    "فُتحت موجة جديدة الآن — أُغلقت عروض الموجة السابقة وبُثَّ الطلب بسقف تكلفة أوسع.",
  manual:
    "أُسند الطلب يدوياً وأُغلقت بقية العروض — الحجز الآن «مُسند»، والسبب مسجَّل في سجل الطلب.",
  override:
    "أُسند الطلب فوق سقف الدين وأُغلقت بقية العروض — الحجز الآن «مُسند». السبب الذي كتبته محفوظ في سجل الطلب وفي سجل العروض، وهو الأثر الدائم الوحيد لهذا التجاوز. والسقف نفسه لم يتغيّر: لا يصل هذا المتعهد عرضٌ جديد، وكل إسناد تالٍ له يحتاج التجاوز الصريح نفسه حتى ينزل ما عليه تحت السقف.",
  receipt:
    "سُجِّل الإيصال نيابةً عن العميل والحجز الآن «قيد المراجعة» — راجع المبلغ ثم اعتمده أو ارفضه من قسم الإجراءات.",
  shown:
    "صار صف هذا الإيصال ضمن حمولة صفحة متابعة العميل — تعرضه الصفحة حيث تسرد إيصالات الحجز، ومنه تقرأ سبب الرفض إن كان مرفوضاً.",
  hidden:
    "أُسقط صف الإيصال من حمولة صفحة العميل نفسها لا من عرضها فقط، فلا يصل متصفحه إطلاقاً — ومعه يسقط سبب رفضه إن كان مرفوضاً. ويبقى هنا كاملاً ويبقى أثره المحاسبي كما هو.",
  failed:
    "سُجِّلت الرحلة فاشلة بسببها وإجرائها المالي، وحالتها الآن «فاشلة» — وهي نهائية لا تعود إلى الطابور. راجع بطاقة «رحلة فاشلة» أعلى الصفحة: فيها ما وقع في الدفتر بالضبط. وردّ مال العميل إجراء مالي مستقل يُنفَّذ من شاشة المالية — لا يقع بتغيير الحالة.",
  crew:
    "سُجِّل طاقم الرحلة موسوماً «أدخلته الإدارة» — ويظهر للعميل في صفحة متابعته فوراً: المركبة ولونها ولوحتها واسم السائق. أما هاتف السائق فتكشفه له قاعدة البيانات وحدها قبل موعد الانطلاق بالمدة المضبوطة في «إعدادات الرحلات»، لا قبلها ولا بقرار من هذه الشاشة.",
};

/**
 * أسماء أنواع حسابات الخزينة — أنواع المرحلة ٧ (نقدية/بنك/بطاقة) فوق أنواع
 * المرحلة ٤، حتى لا يظهر رمز إنجليزي خام على إيصال حُوِّل إلى حساب داخلي.
 */
const ACCOUNT_KIND_LABELS: Record<string, string> = {
  ...PAYMENT_KIND_LABELS,
  card: "بطاقة / بوابة دفع",
  cash: "نقدية",
  bank: "حساب بنكي",
};

function isPriceSource(value: unknown): value is PriceSource {
  return value === "subcontractor" || value === "tariff";
}

const PRICE_SOURCE_LABELS: Record<PriceSource, string> = {
  subcontractor: "سعر متعهد",
  tariff: "تعريفة كيلومتر",
};

/**
 * فاصل زمني من PostgREST إلى ميلي ثانية — «48:00:00» أو «2 days 12:00:00».
 *
 * ولمَ يُقرأ من القاعدة أصلاً بدل كتابة «٤٨ ساعة»؟ لأن `failed_reclass_window()`
 * **مصدرٌ واحد يقرؤه الحارس والشاشة معاً** بنصّ الهجرة، ورقمٌ مكتوب هنا يصير
 * الرقم الثاني الذي ينحرف يوم يتغيّر ذاك. وتعذّر التحويل يعيد `null` فلا يُعرض
 * موعدٌ مخترع — والقاعدة تبقى الحَكَم في الحالتين.
 */
function intervalToMs(raw: unknown): number | null {
  const s = asText(raw);
  if (!s) return null;
  let ms = 0;
  let matched = false;
  const days = /(\d+)\s+days?/.exec(s);
  if (days) {
    ms += Number(days[1]) * 86_400_000;
    matched = true;
  }
  const clock = /(\d+):(\d{2}):(\d{2}(?:\.\d+)?)/.exec(s);
  if (clock) {
    ms += (Number(clock[1]) * 3600 + Number(clock[2]) * 60 + Number(clock[3])) * 1000;
    matched = true;
  }
  return matched && ms > 0 ? ms : null;
}

/**
 * اسم شركة المتعهد للعرض في اللوحة — قراءة متسامحة تماماً.
 *
 * جدول `subcontractors` يملكه وكيل SQL وقد لا يكون منفَّذاً بعد على هذه القاعدة،
 * فأي خطأ يسقط بهدوء إلى null ولا يُسقط الصفحة. ولا يُعرض معرّف خام أبداً:
 * القيمة إما اسم شركة حقيقي أو نص محايد (نفس قاعدة أسماء المنفّذين في السجل).
 */
async function resolveSubcontractorName(id: string | null): Promise<string | null> {
  if (!id || !UUID.test(id)) return null;
  const supabase = await createServerSupabase();
  if (!supabase) return null;
  try {
    const res = await supabase.from("subcontractors").select("*").eq("id", id).maybeSingle();
    if (res.error || !res.data) return null;
    return asText(pick(res.data as Record<string, unknown>, ["company_name", "name", "title"]));
  } catch {
    return null;
  }
}

/** رابط مُوقَّع قصير العمر للإيصال — بمفتاح الخدمة، والمسار لا يغادر الخادم أبداً */
async function signReceipt(path: string): Promise<string | null> {
  const service = createServiceSupabase();
  if (!service) return null;
  const { data, error } = await service.storage
    .from("receipts")
    .createSignedUrl(path, RECEIPT_URL_TTL);
  return error || !data?.signedUrl ? null : data.signedUrl;
}

/**
 * أسماء منفّذي الإجراءات — `booking_events.actor` معرّف مستخدم (uuid) لا اسم،
 * وقراءة جدول المستخدمين محصورة بمفتاح الخدمة. نحوّله إلى بريد المشرف متى أمكن،
 * وإن غاب مفتاح الخدمة نعرض «من اللوحة» — معرّف خام لا يقول شيئاً لمن يقرأ السجل.
 */
async function resolveActors(ids: string[]): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  if (ids.length === 0) return out;
  const service = createServiceSupabase();
  if (!service) return out;

  await Promise.all(
    ids.map(async (id) => {
      try {
        const { data, error } = await service.auth.admin.getUserById(id);
        const email = asText(data?.user?.email);
        if (!error && email) out.set(id, email);
      } catch {
        // تعذّر الاستعلام — يسقط على «من اللوحة» بلا ضجيج
      }
    })
  );
  return out;
}

/**
 * قراءة ربحية الحجز من `v_booking_profit` — كل رقم محسوب في Postgres.
 *
 * ثلاث حالات مختلفة لا تُخلط: العرض غير موجود (هجرة ٠٠١٥ لم تُطبَّق)، أو موجود
 * بلا صف لهذا الحجز (لم يُنفَّذ بعد فلا قيود له)، أو موجود بصف. لكلٍّ نصّه في
 * الشاشة — «٠ ج.م» في الحالتين الأوليين ادعاء معرفة كاذبة.
 */
async function loadBookingProfit(
  supabase: NonNullable<Awaited<ReturnType<typeof createServerSupabase>>>,
  bookingId: string
): Promise<{ viewReady: boolean; profit: BookingProfit | null }> {
  const res = await supabase
    .from("v_booking_profit")
    .select("*")
    .eq("booking_id", bookingId)
    .maybeSingle();

  if (res.error) return { viewReady: false, profit: null };
  if (!res.data) return { viewReady: true, profit: null };

  const row = res.data as Record<string, unknown>;
  return {
    viewReady: true,
    profit: {
      revenue: asNumber(pick(row, ["revenue"])),
      partnerCost: asNumber(pick(row, ["partner_cost", "partnerCost"])),
      grossProfit: asNumber(pick(row, ["gross_profit", "grossProfit"])),
      collectedByUs: asNumber(pick(row, ["collected_by_us", "collectedByUs"])),
      collectedByPartner: asNumber(
        pick(row, ["collected_by_partner", "collectedByPartner"])
      ),
    },
  };
}

/* ══════════════════════════════════════════════════════════════════════════
 * طاقم الرحلة — المركبة والسائق بعد الإسناد (الدفعة ٥، هجرة `0040`)
 *
 * يكتبه **المتعهد المُسنَد إليه** من بورتاله عبر `set_trip_crew`، ويقرؤه العميل
 * في صفحة متابعته. وما هنا شقّان: عرضُه للمالك، وتجاوزٌ إداري يسجّله عن الشريك
 * الذي أملاه هاتفياً.
 *
 * ⚠ **والسجلّ ملك المتعهد لا المنصة** (قرار بدر 2026-08-11: لا إدارة سائقين
 * مباشرين إطلاقاً). فهذه الشاشة **تقرأ سجلّه وتختار منه** ولا تنشئ فيه صفاً،
 * ولا شاشة «سائقون» في `/admin` — الإدارة تعرض ما أعلنه الشريك ولا تدير من
 * ينفّذ.
 * ══════════════════════════════════════════════════════════════════════════ */

/** سقف عاقل: أسطول شريك واحد وسجلّ سائقيه، لا أرشيف المنصة */
const MAX_CREW_ROWS = 200;

type CrewOption = { id: string; label: string };

type CrewLoaded = {
  /**
   * صفُّ `dispatches` موجود ومقروء. **وهو غير `ready` تماماً**: «لا دورة إسناد
   * لهذا الحجز» و«الهجرة غير منفَّذة» جوابان مختلفان، وخلطهما يجعل البطاقة تطالب
   * بهجرةٍ منفَّذة أصلاً على كل حجزٍ لم يُبثّ بعد (الفرق بين «لا ينطبق» و«لا
   * نعرف» — القاعدة ١٥ في `handover/INDEX.md`).
   */
  dispatchFound: boolean;
  /** أعمدة `0040` مقروءة على `dispatches` — أي أن الهجرة منفَّذة */
  ready: boolean;
  /** المتعهد المُسنَد إليه — بدونه لا طاقم أصلاً، وترفض القاعدة أي تجاوز */
  partnerId: string | null;
  vehicleId: string | null;
  driverId: string | null;
  vehicleLabel: string | null;
  vehicleColor: string | null;
  vehiclePlate: string | null;
  vehicleYear: number | null;
  driverName: string | null;
  driverPhone: string | null;
  /** أدخلته الإدارة نيابةً عن الشريك — يُوسم ولا يُخفى */
  byAdmin: boolean;
  crewAt: string | null;
  vehicleOptions: CrewOption[];
  driverOptions: CrewOption[];
};

const EMPTY_CREW: CrewLoaded = {
  dispatchFound: false,
  ready: false,
  partnerId: null,
  vehicleId: null,
  driverId: null,
  vehicleLabel: null,
  vehicleColor: null,
  vehiclePlate: null,
  vehicleYear: null,
  driverName: null,
  driverPhone: null,
  byAdmin: false,
  crewAt: null,
  vehicleOptions: [],
  driverOptions: [],
};

/** «كورولا · ٢٠٢٣ · فضي · أ ب ج ١٢٣» — وصفٌ يميّز صفاً عن صف في قائمة اختيار */
function vehicleOptionLabel(row: Record<string, unknown>): string {
  const parts = [
    asText(pick(row, ["label"])),
    asNumber(pick(row, ["model_year", "modelYear"]))?.toString() ?? null,
    asText(pick(row, ["color"])),
    asText(pick(row, ["plate"])),
  ].filter((part): part is string => part !== null && part.length > 0);
  const label = parts.length > 0 ? parts.join(" · ") : "مركبة بلا وصف";
  // الصف المعطّل يبقى في القائمة **موسوماً**: الرحلة الجارية قد تكون عليه فعلاً،
  // وإخفاؤه كان سيجعل حفظ الطاقم يمسحه بصمت.
  return pick(row, ["active"]) === false ? `${label} — غير مفعّلة` : label;
}

function driverOptionLabel(row: Record<string, unknown>): string {
  const name = asText(pick(row, ["name"])) ?? "سائق بلا اسم";
  const phone = asText(pick(row, ["phone"]));
  const label = phone ? `${name} · ${phone}` : name;
  return pick(row, ["active"]) === false ? `${label} — غير مفعّل` : label;
}

/**
 * قراءة الطاقم وسجلّ الشريك الذي يُختار منه.
 *
 * القراءة متسامحة كبقية الشاشة: قبل الهجرة يعود صف `dispatches` بلا أعمدة
 * `0040` فتبقى `ready = false` وتقول البطاقة ذلك بدل أن تدّعي «لا طاقم». وحجزٌ
 * بلا صف إسناد أصلاً يعود بالفراغ نفسه — وهو الصحيح: لا طاقم قبل الإسناد.
 *
 * والاستدلال على جاهزية الهجرة من **الصف المقروء نفسه** لا باستعلام مخطط ثانٍ
 * (نفس نمط `receiptFlagsReady` أعلاه، وبنفس المقايضة المقبولة).
 *
 * والسجلّان يُقرآن بصلاحية المشرف المسجَّل دخوله: سياسة
 * `*_select_own_or_admin` على الجدولين تفتحهما لـ`is_admin()`، فلا حاجة لمفتاح
 * خدمة — وطلبُه هنا كان سيوسّع سطح التجاوز بلا مقابل.
 */
async function loadCrew(
  supabase: NonNullable<Awaited<ReturnType<typeof createServerSupabase>>>,
  bookingId: string
): Promise<CrewLoaded> {
  const res = await supabase
    .from("dispatches")
    .select("*")
    .eq("booking_id", bookingId)
    .maybeSingle();

  if (res.error || !res.data) return EMPTY_CREW;

  const row = res.data as Record<string, unknown>;
  const ready = "crew_by_admin" in row;
  const partnerId = asText(pick(row, ["assigned_subcontractor_id", "subcontractor_id"]));

  if (!ready || !partnerId) {
    return { ...EMPTY_CREW, dispatchFound: true, ready, partnerId };
  }

  const vehicleId = asText(pick(row, ["assigned_vehicle_id"]));
  const driverId = asText(pick(row, ["assigned_driver_id"]));

  const [vehiclesRes, driversRes] = await Promise.all([
    supabase
      .from("subcontractor_vehicles")
      .select("*")
      .eq("subcontractor_id", partnerId)
      .order("label", { ascending: true })
      .limit(MAX_CREW_ROWS),
    supabase
      .from("subcontractor_drivers")
      .select("*")
      .eq("subcontractor_id", partnerId)
      .order("name", { ascending: true })
      .limit(MAX_CREW_ROWS),
  ]);

  const vehicleRows = vehiclesRes.error
    ? []
    : ((vehiclesRes.data ?? []) as Record<string, unknown>[]);
  const driverRows = driversRes.error
    ? []
    : ((driversRes.data ?? []) as Record<string, unknown>[]);

  // الصف المُسنَد يُلتقط من القائمة نفسها لا باستعلامين إضافيين: القاعدة تضمن
  // أنه من سجلّ هذا الشريك (حارس الملكية داخل `set_trip_crew`)، فهو فيها حتماً.
  const vehicleRow = vehicleRows.find((v) => asText(v.id) === vehicleId) ?? null;
  const driverRow = driverRows.find((d) => asText(d.id) === driverId) ?? null;

  return {
    dispatchFound: true,
    ready: true,
    partnerId,
    vehicleId,
    driverId,
    vehicleLabel: vehicleRow ? asText(pick(vehicleRow, ["label"])) : null,
    vehicleColor: vehicleRow ? asText(pick(vehicleRow, ["color"])) : null,
    vehiclePlate: vehicleRow ? asText(pick(vehicleRow, ["plate"])) : null,
    vehicleYear: vehicleRow ? asNumber(pick(vehicleRow, ["model_year", "modelYear"])) : null,
    driverName: driverRow ? asText(pick(driverRow, ["name"])) : null,
    driverPhone: driverRow ? asText(pick(driverRow, ["phone"])) : null,
    byAdmin: pick(row, ["crew_by_admin"]) === true,
    crewAt: asText(pick(row, ["crew_at"])),
    vehicleOptions: vehicleRows
      .map((v) => ({ id: asText(v.id) ?? "", label: vehicleOptionLabel(v) }))
      .filter((option) => option.id !== ""),
    driverOptions: driverRows
      .map((d) => ({ id: asText(d.id) ?? "", label: driverOptionLabel(d) }))
      .filter((option) => option.id !== ""),
  };
}

async function loadOrder(id: string): Promise<{
  ready: boolean;
  booking: Booking | null;
  payments: Payment[];
  paymentsFailed: boolean;
  /** عمودا 0027 (`visible_to_customer` و`uploaded_by_admin`) موجودان فعلاً */
  receiptFlagsReady: boolean;
  events: EventRow[];
  eventsFailed: boolean;
  accounts: Map<string, Account>;
  subcontractorName: string | null;
  /** العرض `v_booking_profit` مقروء — أي أن هجرة المرحلة ٧ مطبَّقة */
  profitReady: boolean;
  profit: BookingProfit | null;
  /** الرمز الذي يراه المتعهد لهذه الرحلة (0028) — `null` قبل تنفيذ الهجرة */
  partnerCode: string | null;
  extras: BookingExtra[];
  /** جدول `booking_extras` مقروء — أي أن هجرة `0031` مطبَّقة */
  extrasReady: boolean;
  /** المركبة والسائق بعد الإسناد (هجرة `0040`) */
  crew: CrewLoaded;
  /* ── الرحلة الفاشلة (هجرة `0051`) ───────────────────────────────────────── */
  /** جدولا `0051` مقروءان — أي أن الهجرة مطبَّقة على هذه القاعدة */
  failureReady: boolean;
  /** صفّ الفشل إن كانت الرحلة فاشلة فعلاً، وإلا `null` */
  failure: FailureRecord | null;
  /** أسباب الكتالوج **المفعَّلة** وحدها — المعطَّل مرجعٌ لصفوفٍ قديمة ولا يُختار */
  reasons: FailureReasonOption[];
  /** مستحق الإسناد من `dispatches` — بلا حساب: يُقرأ ليُقرأ */
  assignedPayout: number | null;
  /** لحظة بلوغ الحجز `completed` من سجل الأحداث — أساس نافذة إعادة التصنيف */
  completedAt: string | null;
  /**
   * لحظة إغلاق نافذة إعادة التصنيف = زمن الاكتمال + `failed_reclass_window()`.
   * `null` = لا اكتمال في السجل أو تعذّر قراءة النافذة ⇒ لا موعد يُعرض.
   */
  reclassDeadline: string | null;
  /** أُغلقت النافذة وقت تحميل الصفحة — والقاعدة هي التي تفرضها وقت الضغط */
  reclassClosed: boolean;
}> {
  const blank = {
    ready: false,
    booking: null,
    payments: [] as Payment[],
    paymentsFailed: false,
    receiptFlagsReady: false,
    events: [] as EventRow[],
    eventsFailed: false,
    accounts: new Map<string, Account>(),
    subcontractorName: null as string | null,
    profitReady: false,
    profit: null as BookingProfit | null,
    partnerCode: null as string | null,
    extras: [] as BookingExtra[],
    extrasReady: false,
    crew: EMPTY_CREW,
    failureReady: false,
    failure: null as FailureRecord | null,
    reasons: [] as FailureReasonOption[],
    assignedPayout: null as number | null,
    completedAt: null as string | null,
    reclassDeadline: null as string | null,
    reclassClosed: false,
  };

  const supabase = await createServerSupabase();
  if (!supabase) return blank;

  const bookingRes = await supabase.from("bookings").select("*").eq("id", id).maybeSingle();
  if (bookingRes.error) return blank;
  if (!bookingRes.data) return { ...blank, ready: true };

  const row = bookingRes.data as Record<string, unknown>;
  const booking: Booking = {
    id: String(row.id),
    reference: asText(row.reference) ?? "—",
    publicToken: asText(row.public_token),
    status: asText(row.status) ?? "",
    classSlug: asText(row.class_slug),
    classTitle: asText(row.class_title),
    total: numberOf(row.total),
    currency: asText(row.currency) ?? "EGP",
    plan: asText(row.plan),
    amountDue: numberOf(row.amount_due),
    amountRemaining: numberOf(row.amount_remaining),
    customerName: asText(row.customer_name),
    customerPhone: asText(row.customer_phone),
    customerWhatsapp: asText(row.customer_whatsapp),
    trip:
      row.trip && typeof row.trip === "object" && !Array.isArray(row.trip)
        ? (row.trip as Partial<TripSnapshot>)
        : {},
    createdAt: asText(row.created_at),
    // الأعمدة الأربعة تغيب تماماً قبل هجرة المرحلة ٥ — القراءة متسامحة بالبناء
    priceSource: isPriceSource(row.price_source) ? row.price_source : null,
    subcontractorId: asText(row.subcontractor_id),
    subcontractorCost: asNumber(row.subcontractor_cost),
    marginAmount: asNumber(row.margin_amount),
  };

  const [
    paymentsRes,
    eventsRes,
    accountsRes,
    subcontractorName,
    profitRes,
    partnerCodeRes,
    extrasRes,
    crew,
    failureRes,
    reasonsRes,
    dispatchRes,
    windowRes,
  ] = await Promise.all([
    supabase.from("payments").select("*").eq("booking_id", id),
    supabase.from("booking_events").select("*").eq("booking_id", id),
    supabase.from("payment_accounts").select("id, label, kind, handle"),
    resolveSubcontractorName(booking.subcontractorId),
    loadBookingProfit(supabase, id),
    // الرمز الذي يراه المتعهد — **يُقرأ من القاعدة ولا يُشتق هنا**: اشتقاقه في
    // TypeScript يعني صيغتين لقيمة واحدة تنحرفان بلا صوت (النمط ٨ في LESSONS).
    // وقبل 0028 لا وجود للدالة فيبقى `null` ولا يُعرض شيء.
    supabase.rpc("partner_trip_code", { p_booking_id: id }),
    // لقطة الخدمات الإضافية (0031). القراءة متسامحة: قبل الهجرة يعود خطأ «لا
    // جدول» فتبقى القائمة فارغة ولا تسقط الشاشة، كما تفعل بقية جداول اللوحة.
    supabase.from("booking_extras").select("*").eq("booking_id", id),
    // طاقم الرحلة وسجلّ الشريك (0040) — القارئ نفسه يتدهور بهدوء قبل الهجرة
    loadCrew(supabase, id),
    // ── الرحلة الفاشلة (0051). القراءة متسامحة كبقية جداول اللوحة: قبل الهجرة
    //    يعود خطأ «لا جدول» فتبقى اللوحة معطَّلة برسالتها ولا تسقط الشاشة.
    supabase.from("booking_failures").select("*").eq("booking_id", id).maybeSingle(),
    supabase
      .from("failure_reasons")
      .select("slug, label, default_action")
      .eq("active", true)
      .order("sort", { ascending: true })
      .order("label", { ascending: true }),
    // مستحق الإسناد — **من `dispatches` لا من `bookings.subcontractor_cost`**:
    // ذاك لقطةُ من سُعِّر على أساسه، وهذا ما اتُّفق عليه مع من نفّذ فعلاً. وهو
    // نفس التمييز الذي تفرضه `mark_booking_failed` حين تختار مَن يُدفع له.
    supabase
      .from("dispatches")
      .select("assigned_payout")
      .eq("booking_id", id)
      .maybeSingle(),
    // طول نافذة إعادة التصنيف من مصدرها الوحيد — لا رقم مكتوب في الواجهة
    supabase.rpc("failed_reclass_window"),
  ]);

  const accounts = new Map<string, Account>();
  for (const acc of (accountsRes.data ?? []) as Record<string, unknown>[]) {
    accounts.set(String(acc.id), {
      label: asText(acc.label) ?? "—",
      kind: asText(acc.kind),
      handle: asText(acc.handle),
    });
  }

  // الجدولان يملكهما وكيل SQL: نقرأ بأسماء الأعمدة المحتملة بدل افتراض واحدة
  const rawPayments = paymentsRes.error
    ? []
    : ((paymentsRes.data ?? []) as Record<string, unknown>[]);
  const sortedPayments = [...rawPayments].sort(
    (a, b) =>
      Date.parse(asText(pick(b, ["created_at"])) ?? "") -
      Date.parse(asText(pick(a, ["created_at"])) ?? "")
  );

  /**
   * هل عمودا 0027 موجودان؟ الفرق جوهري: غيابهما يعني «الهجرة لم تُنفَّذ» فلا
   * زرّ تبديل رؤية يُعرض (زرٌّ يفشل دائماً)، لا «كل الإيصالات مخفية».
   *
   * والاستدلال من **الصفوف المقروءة نفسها**: حجزٌ بلا إيصالات يُنتج `false` هنا
   * — وهو مقبول لا سهو، لأن مستهلكَي هذه الراية كليهما (الوسم وزر التبديل)
   * يعيشان داخل حلقة قائمة الإيصالات، فبلا صف واحد لا يُعرض أيٌّ منهما أصلاً
   * ولا يُقرأ منها شيء. استعلام مخطط إضافي كان سيسأل سؤالاً لا مستهلك لجوابه.
   */
  const receiptFlagsReady = rawPayments.some((row) => "visible_to_customer" in row);

  const payments: Payment[] = await Promise.all(
    sortedPayments.map(async (p, index) => {
      const path = asText(pick(p, ["receipt_path", "receipt", "path", "file_path"]));
      const signed = path ? await signReceipt(path) : null;
      return {
        key: asText(p.id) ?? `payment-${index}`,
        id: asText(p.id),
        // العمود الغائب (قبل 0027) يعني «ظاهر» — وهو السلوك القائم فعلاً
        visibleToCustomer: pick(p, ["visible_to_customer"]) !== false,
        uploadedByAdmin: pick(p, ["uploaded_by_admin"]) === true,
        amount: asNumber(pick(p, ["amount", "value"])),
        // لا حقل `kind` في جدول `payments` — الوسيلة صفة الحساب المستقبِل نفسه
        accountId: asText(pick(p, ["account_id", "payment_account_id"])),
        status: asText(pick(p, ["status", "state"])),
        note: asText(pick(p, ["note", "reason", "admin_note"])),
        createdAt: asText(pick(p, ["created_at"])),
        receiptUrl: signed,
        receiptIsImage: Boolean(path && IMAGE_EXT.test(path)),
        receiptMissing: Boolean(path) && signed === null,
      };
    })
  );

  const rawEvents = eventsRes.error ? [] : ((eventsRes.data ?? []) as Record<string, unknown>[]);
  const sortedEvents = [...rawEvents].sort(
    (a, b) =>
      Date.parse(asText(pick(a, ["created_at"])) ?? "") -
      Date.parse(asText(pick(b, ["created_at"])) ?? "")
  );

  const rawActors = sortedEvents.map((e) =>
    asText(pick(e, ["actor", "actor_email", "created_by", "by"]))
  );
  const actorEmails = await resolveActors([
    ...new Set(rawActors.filter((a): a is string => a !== null && UUID.test(a))),
  ]);

  const events: EventRow[] = sortedEvents.map((e, index) => {
    const actor = rawActors[index];
    return {
      key: asText(e.id) ?? `event-${index}`,
      label: eventLabel(asText(pick(e, ["status", "to_status", "event", "kind", "type"]))),
      note: asText(pick(e, ["note", "reason", "detail", "message"])),
      // معرّف خام لا يُعرض إطلاقاً: إما بريد المشرف أو «من اللوحة»
      actorLabel: !actor ? null : UUID.test(actor) ? (actorEmails.get(actor) ?? "من اللوحة") : actor,
      createdAt: asText(pick(e, ["created_at"])),
    };
  });

  /**
   * ترتيب العرض بالاسم — `booking_extras` بلا عمود ترتيب (مفتاحه مركّب)،
   * وترتيبٌ ثابت أهون من ترتيب يتبدّل بين تحميلين. وهذا **عرضٌ لا حساب**:
   * لا يُجمع مبلغ ولا يُعاد ضربُ كمية في هذا الملف.
   */
  const extras: BookingExtra[] = (
    extrasRes.error ? [] : ((extrasRes.data ?? []) as Record<string, unknown>[])
  )
    .map((row, index) => ({
      key: asText(pick(row, ["extra_id"])) ?? `extra-${index}`,
      title: asText(pick(row, ["title_snapshot", "titleSnapshot", "title"])) ?? "خدمة إضافية",
      qty: asNumber(pick(row, ["qty", "quantity"])),
      unitPrice: asNumber(pick(row, ["unit_price", "unitPrice"])),
      lineTotal: asNumber(pick(row, ["line_total", "lineTotal"])),
    }))
    .sort((a, b) => a.title.localeCompare(b.title, "ar"));

  /**
   * لحظة بلوغ الحجز `completed` **من سجل الأحداث** لا من `updated_at`.
   *
   * ونفس مصدر `booking_completed_at()` التي يقرؤها الحارس حرفاً بحرف — تلك دالة
   * `definer` بلا منحٍ لأي دور متصفح فلا تُنادى من هنا، والصفوف نفسها مقروءة
   * أعلاه على أي حال. والسجل مرتَّب تصاعدياً فآخر تطابقٍ هو الأحدث.
   */
  const completedAt = sortedEvents.reduce<string | null>((latest, e) => {
    const to = asText(pick(e, ["to_status"]));
    const at = asText(pick(e, ["created_at"]));
    return to === "completed" && at ? at : latest;
  }, null);

  const failureRow = failureRes.error ? null : (failureRes.data as Record<string, unknown> | null);

  /**
   * موعد إغلاق نافذة إعادة التصنيف — يُحسب **هنا لا في التصيير**: قراءة الساعة
   * أثناء التصيير نتيجةٌ غير مستقرة تتبدّل مع كل إعادة رسم (‏`react-hooks/purity`).
   * وهو **إعلانُ نيّةٍ لا حُكم** على أي حال: `guard_booking_failed` تفرض النافذة
   * لحظة الضغط بساعة القاعدة، فسطرٌ متأخر ثانيةً هنا لا يفتح ما أُغلق هناك.
   */
  const reclassWindowMs = windowRes.error ? null : intervalToMs(windowRes.data);
  const reclassDeadline =
    completedAt !== null && reclassWindowMs !== null
      ? new Date(Date.parse(completedAt) + reclassWindowMs).toISOString()
      : null;

  return {
    ready: true,
    booking,
    payments,
    paymentsFailed: Boolean(paymentsRes.error),
    receiptFlagsReady,
    events,
    eventsFailed: Boolean(eventsRes.error),
    accounts,
    subcontractorName,
    profitReady: profitRes.viewReady,
    profit: profitRes.profit,
    // الدالة تُرجع نصاً مفرداً؛ وقبل 0028 يعود خطأ «لا دالة» فيبقى null بهدوء
    partnerCode: partnerCodeRes.error ? null : (asText(partnerCodeRes.data) ?? null),
    extras,
    extrasReady: !extrasRes.error,
    crew,
    // جاهزية الهجرة تُقاس بالكتالوج لا بصفّ الفشل: `maybeSingle()` تعيد `null`
    // بلا خطأ لحجزٍ سليم لم يفشل، فهي لا تفرّق «لا هجرة» من «لا فشل».
    failureReady: !reasonsRes.error,
    failure: !failureRow
      ? null
      : {
          reasonSlug: asText(pick(failureRow, ["reason_slug"])) ?? "",
          reasonLabel: asText(pick(failureRow, ["reason_label"])) ?? "—",
          defaultAction: asText(pick(failureRow, ["default_action"])) ?? "",
          actionTaken: asText(pick(failureRow, ["action_taken"])) ?? "",
          deductAmount: asNumber(pick(failureRow, ["deduct_amount"])),
          overrideNote: asText(pick(failureRow, ["override_note"])),
          fromStatus: asText(pick(failureRow, ["from_status"])),
          payoutSnapshot: asNumber(pick(failureRow, ["payout_snapshot"])),
          ledgerEffect: asText(pick(failureRow, ["ledger_effect"])) ?? "none",
          failedAt: asText(pick(failureRow, ["failed_at"])),
        },
    reasons: (reasonsRes.error ? [] : ((reasonsRes.data ?? []) as Record<string, unknown>[]))
      .map((row) => ({
        slug: asText(pick(row, ["slug"])) ?? "",
        label: asText(pick(row, ["label"])) ?? "",
        defaultAction: asText(pick(row, ["default_action"])) ?? "none",
      }))
      .filter((r) => r.slug !== "" && r.label !== ""),
    assignedPayout: dispatchRes.error
      ? null
      : asNumber(pick(dispatchRes.data as Record<string, unknown> | null, ["assigned_payout"])),
    completedAt,
    reclassDeadline,
    reclassClosed: reclassDeadline !== null && Date.now() > Date.parse(reclassDeadline),
  };
}

/**
 * بطاقة «رحلة فاشلة» — تقرأ صفّ `booking_failures` ولا تُعيد تفسيره.
 *
 * موضعها أعلى الشاشة لا في لوح الإجراءات: هذه **نتيجة** لا قرار، وهي أهم ما
 * يُقرأ عن هذا الحجز. ولا تُطبع: ورقة التشغيل تُحمل إلى الميدان، ورحلةٌ فشلت لا
 * تُنفَّذ — والحالة «فاشلة» في ترويسة الورقة كافية لمن يمسك ورقةً قديمة.
 *
 * 🔒 **ما تعرضه لقطةٌ لا كتالوج**: التسمية والإجراء الافتراضي كما كانا لحظة
 * الوقوع، فإعادة تسمية السبب اليوم لا تغيّر سطراً هنا.
 */
function FailureCard({
  failure,
  currency,
}: {
  failure: FailureRecord;
  currency: string;
}) {
  const overridden = failure.actionTaken !== failure.defaultAction;

  return (
    <Card className="no-print space-y-3 border-red-300 bg-red-50 p-5 text-red-950 dark:border-red-800 dark:bg-red-950/60 dark:text-red-50">
      <div className="flex flex-wrap items-center gap-2">
        <h3 className="flex items-center gap-1.5 font-heading text-base font-bold">
          <AlertTriangle className="size-4" />
          رحلة فاشلة
        </h3>
        <HelpTip>
          سجلٌّ مُلحَقٌ فقط: لا يُعدَّل ولا يُحذف. وتصحيح أثره المالي يقع على الدفتر نفسه
          (عكس قيد أو تسوية من شاشة مقاصة المتعهدين) لا بتعديل هذا السطر — فالسجل يقول ما
          وقع يومها لا ما نتمنى أنه وقع.
        </HelpTip>
        <span className="ms-auto text-xs">
          {dateTimeLabel(failure.failedAt)} · {relativeTime(failure.failedAt)}
        </span>
      </div>

      <div className="grid gap-x-6 gap-y-1 text-sm sm:grid-cols-2">
        <p>
          <span className="opacity-70">السبب:</span>{" "}
          <span className="font-semibold">{failure.reasonLabel}</span>
        </p>
        <p>
          <span className="opacity-70">حالتها قبل الفشل:</span>{" "}
          {failure.fromStatus && isBookingStatus(failure.fromStatus)
            ? STATUS_LABELS[failure.fromStatus]
            : (failure.fromStatus ?? "—")}
        </p>
        <p>
          <span className="opacity-70">الإجراء المنفَّذ:</span>{" "}
          <span className="font-semibold">
            {FAILURE_ACTION_LABELS[failure.actionTaken] ?? failure.actionTaken}
          </span>
          {failure.deductAmount !== null ? (
            <span dir="ltr"> · {formatMoney(failure.deductAmount, currency)}</span>
          ) : null}
        </p>
        <p>
          <span className="opacity-70">المقترح وقتها:</span>{" "}
          {FAILURE_ACTION_LABELS[failure.defaultAction] ?? failure.defaultAction}
          {overridden ? (
            <Badge variant="outline" className="ms-2 border-current">
              تجاوزٌ بمبرر
            </Badge>
          ) : null}
        </p>
        <p className="sm:col-span-2">
          <span className="opacity-70">ما وقع في الدفتر:</span>{" "}
          {LEDGER_EFFECT_LABELS[failure.ledgerEffect] ?? failure.ledgerEffect}
          {failure.payoutSnapshot !== null ? (
            <>
              {" · "}
              <span className="opacity-70">مستحق الإسناد وقتها:</span>{" "}
              <span dir="ltr">{formatMoney(failure.payoutSnapshot, currency)}</span>
            </>
          ) : null}
        </p>
      </div>

      {failure.overrideNote ? (
        <p className="rounded-lg border border-red-300 bg-red-100/70 p-3 text-sm leading-relaxed dark:border-red-800 dark:bg-red-900/40">
          <span className="font-semibold">مبرر التجاوز:</span> {failure.overrideNote}
        </p>
      ) : null}

      <p className="text-xs leading-relaxed opacity-80">
        الحالة نهائية: الرحلة لا تعود إلى طابور الإسناد، والعميل يحجز من جديد.
        <span className="font-semibold"> وردّ ماله إجراء مالي مستقل</span> يُسجَّل في شاشة
        المالية — لم يقع بتعليم الرحلة فاشلة، ولا يقع بتغيير حالة.
      </p>
    </Card>
  );
}

/** سطر «تسمية ← قيمة» داخل بطاقة */
function Row({
  label,
  help,
  children,
}: {
  label: string;
  help?: string;
  children: ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-1 border-b border-border py-2 last:border-0">
      <span className="flex items-center gap-1.5 text-sm text-muted-foreground">
        {label}
        {help ? <HelpTip>{help}</HelpTip> : null}
      </span>
      <span className="min-w-0 text-sm font-medium">{children}</span>
    </div>
  );
}

/** وسم مصدر السعر — نفس ألوان ووسوم صندوق الاختبار في شاشة التسعير */
function SourceBadge({ source }: { source: PriceSource }) {
  return (
    <Badge
      variant="outline"
      className={
        source === "subcontractor"
          ? "border-violet-300 bg-violet-100 text-violet-900 dark:border-violet-700 dark:bg-violet-950 dark:text-violet-100"
          : "border-sky-300 bg-sky-100 text-sky-900 dark:border-sky-700 dark:bg-sky-950 dark:text-sky-100"
      }
    >
      {PRICE_SOURCE_LABELS[source]}
    </Badge>
  );
}

/** خانة رقم واحدة داخل بطاقة الحساب الفعلي */
function MoneyTile({
  title,
  value,
  currency,
  help,
  tone,
}: {
  title: string;
  value: number | null;
  currency: string;
  help: string;
  tone?: string;
}) {
  return (
    <div className={cn("rounded-lg border border-border p-3", tone)}>
      <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
        {title}
        <HelpTip>{help}</HelpTip>
      </div>
      <span className="mt-1 block text-lg font-bold" dir="ltr">
        {value === null ? "—" : formatMoney(value, currency)}
      </span>
    </div>
  );
}

/**
 * الحساب الفعلي للرحلة — البطاقة التي تجيب «كم دخل جيبنا من هذا الحجز فعلاً؟».
 *
 * كل رقم فيها قادم من `v_booking_profit` مباشرة: لا جمع ولا طرح في هذا الملف.
 * ونقطة الالتباس الوحيدة مشروحة في سطر تحت الأرقام — «حصّلناه نحن» أقل من
 * الإيراد ليس نقصاً بل مالٌ في يد السائق يُخصم لاحقاً من مستحق المتعهد.
 */
function BookingAccountingCard({
  profit,
  profitReady,
  currency,
  subcontractorId,
}: {
  profit: BookingProfit | null;
  profitReady: boolean;
  currency: string;
  subcontractorId: string | null;
}) {
  return (
    <Card className="space-y-4 p-5">
      <div>
        <h3 className="flex items-center gap-1.5 font-heading text-base font-bold">
          <Coins className="size-4 text-primary" />
          الحساب الفعلي للرحلة
          <HelpTip>
            أرقام محسوبة في قاعدة البيانات من دفتر القيود نفسه (
            <code dir="ltr">v_booking_profit</code>) لا من لقطة التسعير: ما اعتُمد من إيصالات،
            وما قبضه المتعهد نقداً، ومستحقه بعد الإسناد. لذلك قد تختلف عن بطاقة «ربحية الرحلة»
            أعلاه — تلك نيّة وقت الحجز، وهذه ما وقع فعلاً.
          </HelpTip>
        </h3>
        <p className="text-sm text-muted-foreground">
          أرقام داخلية للتشغيل والمحاسبة — لا يراها العميل ولا المتعهد في أي شاشة.
        </p>
      </div>

      {!profitReady ? (
        <p className="text-sm leading-relaxed text-muted-foreground">
          دفتر المالية غير مفعَّل بعد — العرض <code dir="ltr">v_booking_profit</code> غير موجود.
          نفِّذ هجرة المرحلة ٧ (<code dir="ltr">0015</code>) من{" "}
          <code dir="ltr">supabase/migrations</code> ثم أعد تحميل الصفحة. بقية الشاشة تعمل
          طبيعياً.
        </p>
      ) : profit === null ? (
        <p className="text-sm leading-relaxed text-muted-foreground">
          لا قيود على هذا الحجز بعد — لم يُعتمد له إيصال ولم يُنفَّذ. تظهر أرقامه هنا لحظة
          اعتماد أول تحويل، وتكتمل حين تُسجَّل الرحلة «منفذة».
        </p>
      ) : (
        <>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
            <MoneyTile
              title="الإيراد"
              value={profit.revenue}
              currency={currency}
              help="سعر الرحلة الذي التزم به العميل — الرقم نفسه الذي يراه في صفحة متابعته. هو أصل الحساب كله ولا يتغير بعد الحجز."
            />
            <MoneyTile
              title="حصّلناه نحن"
              value={profit.collectedByUs}
              currency={currency}
              help="مجموع الإيصالات المعتمدة على هذا الحجز — أي المال الذي دخل حسابات الخزينة فعلاً. الإيصال المعلّق أو المرفوض لا يُحتسب هنا إطلاقاً."
            />
            <MoneyTile
              title="حصّله المتعهد نقداً"
              value={profit.collectedByPartner}
              currency={currency}
              help="ما قبضه السائق من العميل نقداً نيابةً عنا عند التنفيذ (المتبقي بعد العربون). هو مالنا وهو في يده، فيُخصم من مستحقه في المقاصة."
              tone="border-amber-300 bg-amber-50 dark:border-amber-800 dark:bg-amber-950/40"
            />
            <MoneyTile
              title="تكلفة المتعهد"
              value={profit.partnerCost}
              currency={currency}
              help="مستحق المتعهد عن الرحلة كما ثبت لحظة الإسناد (لا كما قُدِّر لحظة التسعير) — الإسناد اليدوي قد يغيّره بالاتفاق."
            />
            <MoneyTile
              title="الربح الإجمالي"
              value={profit.grossProfit}
              currency={currency}
              help="الإيراد ناقص تكلفة المتعهد. ربح هذه الرحلة وحدها قبل المصروفات العامة — وهو مستقل تماماً عمّن قبض النقد، فتوزيع التحصيل لا يغيّره."
              tone="border-emerald-300 bg-emerald-50 dark:border-emerald-800 dark:bg-emerald-950/40"
            />
          </div>

          <p className="text-sm leading-relaxed text-muted-foreground">
            «حصّلناه نحن» أقل من الإيراد؟ هذا هو الوضع الطبيعي في العربون:{" "}
            <span className="font-medium text-foreground">
              الباقي قبضه السائق نقداً من العميل نيابةً عنا
            </span>{" "}
            — فهو دَينٌ لنا عليه يُخصم من مستحقه عند المقاصة، لا مالٌ ضائع.
            {subcontractorId ? (
              <>
                {" "}
                <Link
                  href={`/admin/finance/partners/${subcontractorId}`}
                  className="text-primary hover:underline"
                >
                  افتح كشف حساب هذا المتعهد
                </Link>{" "}
                لترى الرقم داخل مقاصته.
              </>
            ) : null}
          </p>
        </>
      )}
    </Card>
  );
}

/**
 * الخدمات الإضافية على هذا الحجز — ما اشتراه العميل فوق الرحلة.
 *
 * كل رقم هنا **مقروء من لقطة `booking_extras`** لا محسوباً: الكمية وسعر الوحدة
 * وإجمالي السطر خزّنتها `create_booking` لحظة الحجز، والمجموع يُقرأ من
 * `trip.extrasTotal` — فلا جمع ولا ضرب في هذا الملف (قرار معماري ٤).
 *
 * ⚠ **وهذه البطاقة لا نظير لها في بورتال المتعهد ولا في حمولة الإسناد** — قرار
 * بدر الثالث: المتعهد لا ينفّذ هذه الخدمات في هذه الدفعة، فرؤيتها تُوهمه بعملٍ
 * ليس عليه وبمالٍ ليس له.
 */
function BookingExtrasCard({
  extras,
  extrasReady,
  extrasTotal,
  currency,
}: {
  extras: BookingExtra[];
  extrasReady: boolean;
  extrasTotal: number | null;
  currency: string;
}) {
  return (
    <Card className="space-y-4 p-5">
      <div>
        <h3 className="flex items-center gap-1.5 font-heading text-base font-bold">
          <ConciergeBell className="size-4 text-primary" />
          الخدمات الإضافية
          <HelpTip>
            ما اشتراه العميل فوق الرحلة بأسعار لحظة الحجز. الأسماء والأسعار هنا{" "}
            <span className="font-semibold">نسخة مجمَّدة</span>: تعديل الكتالوج في شاشة
            «الخدمات الإضافية» لا يغيّر حرفاً في هذا الحجز. وقيمتها تُضاف إلى الإجمالي{" "}
            <span className="font-semibold">بعد</span> الذروة والخصم معاً — فلا الذروة زادتها
            ولا الكوبون خصمها، ولا تدخل حساب الهامش ولا سقف موجة البث.
          </HelpTip>
        </h3>
        <p className="text-sm text-muted-foreground">
          هذه الخدمات ننفّذها نحن — لا تظهر للمتعهد في بورتاله ولا في عرض الإسناد.
        </p>
      </div>

      {extras.length > 0 ? (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-xs text-muted-foreground">
                <th className="py-2 text-start font-medium">الخدمة</th>
                <th className="py-2 text-start font-medium">الكمية</th>
                <th className="py-2 text-start font-medium">سعر الوحدة</th>
                <th className="py-2 text-start font-medium">إجمالي السطر</th>
              </tr>
            </thead>
            <tbody>
              {extras.map((extra) => (
                <tr key={extra.key} className="border-b border-border last:border-0">
                  <td className="py-2 pe-3 font-medium">{extra.title}</td>
                  <td className="py-2 pe-3" dir="ltr">
                    {extra.qty === null ? "—" : `× ${toArabicDigits(extra.qty)}`}
                  </td>
                  <td className="py-2 pe-3" dir="ltr">
                    {extra.unitPrice === null ? "—" : formatMoney(extra.unitPrice, currency)}
                  </td>
                  <td className="py-2 font-bold" dir="ltr">
                    {extra.lineTotal === null ? "—" : formatMoney(extra.lineTotal, currency)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : extrasReady ? (
        <p className="text-sm leading-relaxed text-muted-foreground">
          الإجمالي يحمل قيمة خدمات لكن لا صفوف تفصيلية لها في{" "}
          <code dir="ltr">booking_extras</code> — حجزٌ سبق الهجرة، أو صفوفٌ حُذفت. الرقم أدناه
          هو ما دفعه العميل فعلاً.
        </p>
      ) : (
        <p className="text-sm leading-relaxed text-muted-foreground">
          تعذّرت قراءة تفصيل الخدمات — تأكد أن جدول <code dir="ltr">booking_extras</code>{" "}
          منفَّذ (هجرة <code dir="ltr">0031</code>). المبلغ أدناه من لقطة الحجز نفسها.
        </p>
      )}

      {extrasTotal !== null && (
        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border pt-3">
          <span className="flex items-center gap-1.5 text-sm text-muted-foreground">
            إجمالي الخدمات
            <HelpTip>
              مقروء من لقطة الحجز (<code dir="ltr">trip.extrasTotal</code>) لا مجموعاً في هذه
              الشاشة — فهو الرقم نفسه الذي أضافته قاعدة البيانات إلى إجمالي الحجز.
            </HelpTip>
          </span>
          <span dir="ltr" className="text-base font-bold">
            {formatMoney(extrasTotal, currency)}
          </span>
        </div>
      )}
    </Card>
  );
}

/**
 * المركبة والسائق بعد الإسناد (الدفعة ٥ — الملاحظة ٥، هجرة `0040`).
 *
 * البطاقة **تُطبع**: من يمسك ورقة التشغيل يسأل أولاً «أي سيارة ومع من؟»،
 * وسطرٌ واحد هنا يوفّر مكالمة. أما نموذج التجاوز فيسقط بالطباعة — الورقة
 * تُنفَّذ ولا تُقرَّر بها.
 *
 * ⚠ **ولا يُبنى منها بابٌ خلفي لإدارة السائقين**: السجلّ ملك المتعهد (قرار بدر
 * 2026-08-11 — لا إدارة سائقين مباشرين إطلاقاً)، والنموذج **يختار من سجلّه**
 * ولا يُنشئ فيه صفاً ولا يعدّله. من احتاج إضافة سائق فمكانها بورتال الشريك.
 *
 * 🔒 ولا صورة: عمودا `photo_path` في القاعدة والرفعُ مؤجَّل بقرار مكتوب في
 * ترويسة الهجرة — دلو `media` عام، وصورةُ سائق فيه بيانات شخصية لطرفٍ ثالث
 * يقرؤها أي أحد بالمسار.
 */
function TripCrewCard({
  bookingId,
  crew,
  vehicleLine,
  hasCrew,
}: {
  bookingId: string;
  crew: CrewLoaded;
  /** وصف المركبة وسنتها مبنيّاً في الصفحة — عرضٌ لا حساب */
  vehicleLine: string;
  /** أُسنِد للرحلة مركبةٌ أو سائق فعلاً (بالمعرّف لا بالاسم) */
  hasCrew: boolean;
}) {
  return (
    <Card className="space-y-4 p-5" id="crew">
      <div>
        <h3 className="flex items-center gap-1.5 font-heading text-base font-bold">
          <CarFront className="size-4 text-primary" />
          المركبة والسائق
          <HelpTip>
            يكتبها <span className="font-semibold">المتعهد المُسنَد إليه من بورتاله</span> —
            المنصة لا تملك سائقاً ولا تديره، وهذا سجلّ الشريك تعرضه ولا تحلّ محله. والعميل
            يرى الشيء نفسه في صفحة متابعته تحت «مركبتك وسائقك»:{" "}
            <span className="font-semibold">المركبة ولونها ولوحتها واسم السائق فور التسجيل</span>،
            أما <span className="font-semibold">هاتف السائق فتحجبه قاعدة البيانات عنه</span>{" "}
            حتى تحلّ نافذته قبل موعد الانطلاق (المدة في «إعدادات الرحلات»). ولا صورة في هذه
            الدفعة: الأعمدة موجودة والرفع مؤجَّل حتى يُنشأ دلو خاص، فصورة السائق بيانات شخصية
            لا تُوضع في دلو عام.
          </HelpTip>
        </h3>
        <p className="text-sm text-muted-foreground">
          جواب سؤال العميل «ما الذي سيأتيني؟» — ومنه يتعرّف على سيارته عند الموعد.
        </p>
      </div>

      {!crew.ready ? (
        <p className="text-sm leading-relaxed text-muted-foreground">
          تسجيل المركبة والسائق يحتاج هجرة <code dir="ltr">0040</code> — نفِّذها من{" "}
          <code dir="ltr">supabase/migrations</code> ثم أعد تحميل الصفحة. بقية الشاشة تعمل
          طبيعياً، وصفحة العميل لا تعرض بطاقة «مركبتك وسائقك» قبلها.
        </p>
      ) : crew.partnerId === null ? (
        <p className="text-sm leading-relaxed text-muted-foreground">
          لا طاقم قبل الإسناد — تُسجَّل المركبة والسائق بعد أن يُعرف المنفِّذ فعلاً. أسنِد
          الطلب من لوحة الإسناد أعلاه، ثم يسجّلهما المتعهد من بورتاله أو تسجّلهما أنت عنه.
        </p>
      ) : (
        <>
          {!hasCrew ? (
            <p className="text-sm leading-relaxed text-muted-foreground">
              أُسند الطلب ولم يسجّل المتعهد مركبةً ولا سائقاً بعد — وصفحة العميل لا تعرض
              بطاقة «مركبتك وسائقك» حتى يفعل. إن أملاهما عليك هاتفياً فسجّلهما من النموذج
              أدناه.
            </p>
          ) : (
            <div className="space-y-1">
              <Row
                label="المركبة"
                help="وصف المركبة وسنتها كما أعلنهما المتعهد في أسطوله. القيمة تُقرأ من سجلّه لحظة فتح الصفحة لا لقطةً مجمَّدة — فتصحيحه في بورتاله يصل العميل فوراً."
              >
                {vehicleLine.length > 0
                  ? vehicleLine
                  : crew.vehicleId
                    ? "مركبة لم تعد في سجلّ المتعهد"
                    : "—"}
              </Row>
              <Row label="اللون">{crew.vehicleColor ?? "—"}</Row>
              <Row
                label="رقم اللوحة"
                help="أبرز ما يعرضه العميل على صفحته — هو ما يبحث عنه بعينه عند الموعد. لوحةٌ خاطئة تعني عميلاً يقف بجوار سيارته ولا يركبها."
              >
                {crew.vehiclePlate ? (
                  <span dir="ltr" className="font-mono font-bold">
                    {crew.vehiclePlate}
                  </span>
                ) : (
                  "—"
                )}
              </Row>
              <Row label="السائق">
                {crew.driverName ??
                  (crew.driverId ? "سائق لم يعد في سجلّ المتعهد" : "—")}
              </Row>
              {/*
                🔒 هاتف السائق يظهر هنا **بلا قيد زمني، وهذا مقصود**: الحجب
                الزمني داخل `get_booking_by_token` يحرس سطح **العميل** وحده —
                عميلٌ يملك الرقم مبكراً يستطيع الاتفاق مع السائق مباشرةً في
                المرة القادمة، أي أن كل رقم يُسلَّم مبكراً نافذة تخطٍّ للمنصة.
                أما من يدير الرحلة فيحتاج الرقم لحظة سؤاله عنه. فلا «يُصلَح»
                هذا السطر بإضافة نافذة زمنية: إضافتها تعطّل التشغيل ولا تحمي
                شيئاً.
              */}
              <Row
                label="هاتف السائق"
                help="يظهر لك كاملاً في كل وقت — النافذة الزمنية تحرس صفحة العميل وحدها (كي لا يتفق معه مباشرةً في رحلة قادمة) لا شاشة التشغيل. لا تضف قيداً زمنياً هنا."
              >
                <ContactLinks phone={crew.driverPhone} whatsapp={null} />
              </Row>
              <Row
                label="سُجِّل في"
                help="متى أُقرّت هذه البيانات آخر مرة — لا متى تغيّرت: إعادة الحفظ بالقيم نفسها تجدّد الطابع، وهو المطلوب («راجعناها اليوم»)."
              >
                <span className="flex flex-wrap items-center gap-2">
                  <span>
                    {crew.crewAt ? dateTimeLabel(crew.crewAt) : "—"}
                    {crew.crewAt ? ` · ${relativeTime(crew.crewAt)}` : ""}
                  </span>
                  {/* الوسم على سابقة «رفعه التشغيل»: التجاوز يُعلن ولا يُخفى */}
                  {crew.byAdmin && (
                    <Badge
                      variant="outline"
                      className="border-violet-300 bg-violet-100 text-violet-900 dark:border-violet-700 dark:bg-violet-950 dark:text-violet-100"
                    >
                      أدخلته الإدارة
                    </Badge>
                  )}
                </span>
              </Row>
            </div>
          )}

          {/*
            التجاوز الإداري — سطحُ قرار لا يُطبع (وكتلة الطباعة تُسقط النماذج
            أصلاً، والصنف الصريح هنا كي يذهب عنوانه معه لا يبقى معلّقاً).

            ووجوده ليس رفاهية: المتعهد يملي المركبة والسائق **هاتفياً** ولا
            يفتح بورتاله، فبلا هذا النموذج تبقى صفحة العميل خالية من الجواب
            الذي بُنيت الملاحظة كلها لأجله — لا لأن البيانات مجهولة، بل لأن من
            يعرفها لم يكتبها في نموذج.
          */}
          <div className="no-print space-y-3 border-t border-border pt-4">
            <h4 className="flex items-center gap-1.5 text-sm font-bold">
              <UserCheck className="size-4 text-primary" />
              سجّل الطاقم نيابةً عن المتعهد
              <HelpTip>
                القائمتان من <span className="font-semibold">سجلّ هذا المتعهد وحده</span>، وقاعدة
                البيانات ترفض أي مركبة أو سائق من خارجه — فلا تُعلَن على صفحة العميل مركبةُ
                شريك آخر. والحفظ يسم الصف «أدخلته الإدارة» ويبقى الوسم ظاهراً هنا: تجاوزٌ
                معلن لا التفاف صامت. وخيار «— بلا —» يمسح الحقل عن صفحة العميل فوراً، وهو
                المخرج حين تُملى عليك لوحة خاطئة.
              </HelpTip>
            </h4>

            {crew.vehicleOptions.length === 0 && crew.driverOptions.length === 0 ? (
              <p className="text-sm leading-relaxed text-muted-foreground">
                سجلّ هذا المتعهد فارغ — لا مركبات ولا سائقين مسجَّلين له. يضيفهم هو من
                بورتاله (المنصة لا تدير سائقين ولا تُنشئ لهم صفوفاً)، ثم تختار منهما هنا.
              </p>
            ) : (
              <form action={setTripCrewByAdmin.bind(null, bookingId)} className="space-y-3">
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-1.5">
                    <Label htmlFor="crew_vehicle_id">المركبة</Label>
                    <select
                      id="crew_vehicle_id"
                      name="crew_vehicle_id"
                      defaultValue={crew.vehicleId ?? ""}
                      className={controlClass}
                    >
                      <option value="">— بلا مركبة —</option>
                      {crew.vehicleOptions.map((option) => (
                        <option key={option.id} value={option.id}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="space-y-1.5">
                    <Label htmlFor="crew_driver_id">السائق</Label>
                    <select
                      id="crew_driver_id"
                      name="crew_driver_id"
                      defaultValue={crew.driverId ?? ""}
                      className={controlClass}
                    >
                      <option value="">— بلا سائق —</option>
                      {crew.driverOptions.map((option) => (
                        <option key={option.id} value={option.id}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                <div className="flex justify-end">
                  <Button type="submit" variant="outline">
                    <UserCheck />
                    حفظ الطاقم بوسم «أدخلته الإدارة»
                  </Button>
                </div>
              </form>
            )}
          </div>
        </>
      )}
    </Card>
  );
}

/**
 * رقم موبايل بصيغة رابط اتصال — الأرقام تُعرض ltr دائماً.
 *
 * ⚠ الروابط من `lib/phone.ts` لا من نزع رموزٍ محلي. كانت هنا نسخةٌ ثالثة من
 * العيب الأصلي: هاتف العميل يصل بصفرٍ بادئ في ٣٣٧ من ٣٤١ حجزاً حياً، فيخرج
 * `wa.me/01188511418` ويردّه واتساب «غير صالح» — والإدارة تفتح هذه الشاشة
 * تحديداً حين تحتاج أن تصل بالعميل الآن.
 *
 * والزر يغيب حين لا يُبنى رقم صالح: مرساةٌ تفتح خطأً أسوأ من غيابها، والرقم
 * يبقى معروضاً نصّاً على أي حال.
 */
function ContactLinks({ phone, whatsapp }: { phone: string | null; whatsapp: string | null }) {
  const tel = telLink(phone);
  const wa = waLink(whatsapp);
  return (
    <span className="flex flex-wrap items-center gap-2">
      {phone &&
        (tel ? (
          <a
            href={tel}
            className="inline-flex items-center gap-1 rounded-lg border border-border px-2 py-1 text-xs transition-colors hover:border-primary hover:text-primary"
          >
            <Phone className="size-3.5" />
            <span dir="ltr">{phone}</span>
          </a>
        ) : (
          <span className="text-xs" dir="ltr">
            {phone}
          </span>
        ))}
      {wa && (
        <a
          href={wa}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1 rounded-lg border border-emerald-300 px-2 py-1 text-xs text-emerald-800 transition-colors hover:bg-emerald-50 dark:border-emerald-700 dark:text-emerald-200 dark:hover:bg-emerald-950"
        >
          <MessageCircle className="size-3.5" />
          واتساب
        </a>
      )}
      {!phone && !wa && <span className="text-sm text-muted-foreground">—</span>}
    </span>
  );
}

export default async function OrderDetailPage({
  params,
  searchParams,
}: PageProps<"/admin/orders/[id]">) {
  const [{ id }, sp] = await Promise.all([params, searchParams]);
  if (!UUID.test(id)) notFound();

  const {
    ready,
    booking,
    payments,
    paymentsFailed,
    receiptFlagsReady,
    events,
    eventsFailed,
    accounts,
    subcontractorName,
    profitReady,
    profit,
    partnerCode,
    extras,
    extrasReady,
    crew,
    failureReady,
    failure,
    reasons,
    assignedPayout,
    completedAt,
    reclassDeadline,
    reclassClosed,
  } = await loadOrder(id);
  if (ready && !booking) notFound();

  const wired = hasSupabaseEnv();
  const savedCode = typeof sp.saved === "string" ? sp.saved : null;
  const error = typeof sp.error === "string" ? sp.error : null;
  const confirmingCancel = sp.confirm === "cancel";
  const confirmingFailed = sp.confirm === "failed";
  const confirmingAssign = sp.confirm === "assign";
  // خطوة التأكيد الثانية للإسناد فوق سقف دين المتعهد — نفس نمط ‎?confirm=cancel‎:
  // الحالة في الرابط وحده، فلا حالة على العميل والصفحة قابلة للمشاركة والتحديث.
  const confirmingOverride = sp.confirm === "override";

  // رسائل مطابقة لرموز `hint` التي ترفعها دوال المرحلة ٤ — كل حالة برسالتها،
  // فلا يُتهم نقص الصلاحيات في خطأ سببه الحالة أو غياب الإيصال.
  const errorMessages: Record<string, string> = {
    ...COMMON_BOOKING_ERRORS,
    // رسائل المرحلة ٦ (البث والإسناد) — ثم تفوق عليها رسائل هذه الشاشة الخاصة
    ...DISPATCH_ERRORS,
    status:
      "الانتقال إلى هذه الحالة غير مسموح من الحالة الحالية — آلة الحالات محروسة في قاعدة البيانات، راجع الحالة الحالية أولاً.",
    forbidden:
      "لا تملك صلاحية تنفيذ هذا الإجراء — يتطلب حساباً دوره admin. سجّل الدخول بحساب مشرف ثم أعد المحاولة.",
    vstatus:
      "الاعتماد أو الرفض متاح والحجز «قيد المراجعة» فقط — يبدو أن الحالة تغيّرت بعد فتح الصفحة، أعد تحميلها لترى الحالة الحقيقية.",
    noreceipt:
      "لا يوجد إيصال بانتظار التحقق في هذا الحجز — إما أن العميل لم يرفع إيصالاً بعد، أو أن آخر إيصال سبق البتّ فيه.",
    input: "بيانات الإجراء ناقصة أو غير صالحة — راجع الحقول ثم أعد المحاولة.",
    // ── رفع الإيصال نيابة عن العميل وإظهاره/إخفاؤه (هجرة 0027)
    pending:
      "يوجد إيصال معلّق على هذا الحجز — اعتمده أو ارفضه أولاً ثم ارفع الإيصال الجديد. (الاعتماد يعالج الإيصال المعلّق الأحدث وحده، فصفٌّ ثانٍ كان سيترك الأول معلّقاً بلا زر يغلقه.)",
    amount:
      "اكتب مبلغ التحويل كما وصل فعلاً — رقم أكبر من صفر. المبلغ إقرار منك بما دخل الحساب، ولا يُشتق من قيمة الحجز.",
    nofile: "أرفق صورة إيصال التحويل أو ملف PDF قبل الحفظ.",
    filetype: "نوع الملف غير مدعوم — أرفق صورة (JPG أو PNG أو WebP) أو ملف PDF.",
    filesize: "حجم الملف أكبر من ٥ ميجابايت — أرسل صورة أصغر.",
    upload:
      "تعذّر رفع الملف إلى المخزن — تأكد من ضبط SUPABASE_SERVICE_ROLE_KEY ومن وجود مخزن receipts، ثم أعد المحاولة. لم يُسجَّل أي إيصال.",
    nokey:
      "رفع الإيصال من اللوحة يحتاج SUPABASE_SERVICE_ROLE_KEY في متغيرات البيئة — سياسات مخزن الإيصالات مكتوبة للعميل لا للإدارة. لم يُسجَّل أي إيصال.",
    norow: "لم يعد هذا الإيصال موجوداً — أعد تحميل الصفحة لترى القائمة الحقيقية.",
    filemissing:
      "رُفع الملف ظاهرياً لكن قاعدة البيانات لم تجده في مخزن receipts، فرُفض تسجيل الإيصال ولم يُنشأ أي صف تحصيل. أعد المحاولة — وإن تكرر فراجع أن مخزن receipts موجود وأن SUPABASE_SERVICE_ROLE_KEY يخص هذا المشروع نفسه.",
    notready:
      "هذه الميزة تحتاج هجرة 0027 — نفِّذها من supabase/migrations ثم أعد المحاولة. لم يُسجَّل أي إيصال ولم تتغيّر رؤية أي إيصال.",
    // ── سقف ديون المتعهدين (0027) — رمزان لا يجوز أن يسقطا على رسالة الصلاحيات
    debtlimit:
      "هذا المتعهد بلغ سقف الدين المسموح، وقاعدة البيانات ترفض إسناد أي رحلة إليه — والرفض عن دَين لا عن صلاحية. حصّل منه المبلغ وسجّله تسويةً، أو ارفع السقف من بطاقة سقف الديون في شاشة المقاصة، أو أسنِد هذه الرحلة وحدها من زر «إسناد فوق سقف الدين» في لوحة الإسناد بسبب مكتوب.",
    nolimitfn:
      "الإسناد فوق سقف الدين يحتاج دالة manual_assign_over_limit من هجرة 0027 — نفِّذها من supabase/migrations ثم أعد المحاولة. لم يتغيّر شيء في هذا الطلب.",
    // ── طاقم الرحلة (0040) — ثلاثة رموز، ولا واحد منها نقصُ صلاحية
    notassigned:
      "هذا الحجز غير مُسنَد لمتعهد بعد، ولا طاقم رحلة قبل الإسناد — القاعدة ترفض تسجيل مركبة أو سائق على رحلة بلا منفِّذ. أسنِد الطلب أولاً من لوحة الإسناد أعلاه ثم سجّل الطاقم.",
    crewowner:
      "المركبة أو السائق المختار ليس من سجلّ المتعهد المُسنَد إليه هذه الرحلة، والقاعدة ترفض إعلان مركبة شريكٍ آخر على صفحة العميل. أعد تحميل الصفحة لترى سجلّ المنفِّذ الحالي — غالباً تغيّر الإسناد بعد فتحك الصفحة، أو حُذف الصف من بورتال الشريك.",
    crewnotready:
      "تسجيل طاقم الرحلة يحتاج هجرة 0040 — نفِّذها من supabase/migrations ثم أعد المحاولة. لم يتغيّر شيء في هذا الطلب ولا في صفحة العميل.",
    /* ── تعليم الرحلة فاشلة (0051) — رمزٌ لكل سبب رفضٍ ترفعه `mark_booking_failed`
     *    أو الدالتان الماليتان اللتان تناديهما. ولا واحد منها نقصُ صلاحية، ولا
     *    واحد منها يترك أثراً: كل نداء معاملةٌ واحدة (D-48) فالرفض يُرجعها كاملة.
     */
    failstatus:
      "الفشل يُعلَّم على رحلة «مُسندة» أو «منفذة» وحدهما — رحلةٌ لم تُسنَد بعد لا يوجد من خابت عنده، والملغاة أُغلقت بمسارها. يبدو أن الحالة تغيّرت بعد فتح الصفحة، أعد تحميلها لترى الحقيقة.",
    failwindow:
      "انقضت نافذة إعادة تصنيف هذه الرحلة المكتملة — القاعدة تسمح بها خلال المدة المضبوطة من لحظة الاكتمال وحدها، وقد مضت. لم يتغيّر شيء: لا حالة الحجز ولا الدفتر. وأي تسويةٍ بعد ذلك تُكتب على الدفتر مباشرةً من شاشة مقاصة المتعهدين بقرار مالي صريح.",
    failnotime:
      "لا يوجد في سجل الحجز حدثٌ يثبت لحظة اكتمال هذه الرحلة، والقاعدة ترفض إعادة تصنيف اكتمالٍ لا تعرف زمنه — والاتجاه الآمن أن نعجز، لا أن نفتح رحلةً عمرها سنة. لم يتغيّر شيء.",
    failnoreason:
      "سبب الفشل غير موجود في الكتالوج — اختر سبباً من القائمة. وإن كانت القائمة فارغة فأضف الأسباب أولاً من شاشة «أسباب فشل الرحلة».",
    failinactive:
      "هذا السبب معطَّل في الكتالوج فلا يُختار من جديد — يبقى مرجعاً للرحلات التي وقعت عليه من قبل. اختر سبباً مفعَّلاً، أو أعد تفعيله من شاشة «أسباب فشل الرحلة».",
    failaction:
      "الإجراء المالي غير معروف — لا شيء، أو دفع كامل المستحق، أو خصم. أعد تحميل الصفحة واختر من القائمة.",
    failnote:
      "اخترت إجراءً يخالف المقترح في الكتالوج، والمبرر المكتوب إلزامي عندها — القيد في قاعدة البيانات نفسها لا في هذه الشاشة، فالسجل لا يحمل تجاوزاً بلا سبب. اكتب المبرر ثم أعد المحاولة.",
    faildeduct:
      "الخصم يستلزم مبلغاً موجباً — اكتب المبلغ الذي يُقيَّد على المتعهد. (وإن كنت تريد ألّا يأخذ شيئاً بلا خصمٍ عليه فالإجراء هو «لا شيء» لا خصمُ صفر.)",
    faildeductunused:
      "كتبت مبلغ خصم مع إجراء ليس خصماً — القاعدة ترفض مبلغاً بلا معنى في السجل. امسح المبلغ، أو اختر «خصم» إن كان هذا قصدك.",
    failnopartner:
      "لا متعهد مُسنَد لهذا الحجز، فلا طرف يُدفع له ولا يُخصم منه. «لا شيء» هو الإجراء الوحيد الممكن هنا.",
    failnopayout:
      "مستحق الإسناد صفر أو مفقود على هذه الرحلة، فلا مبلغ يُدفع. راجع لوحة الإسناد أعلاه — وإن كان الاتفاق على مبلغ فسجّله تسويةً من شاشة مقاصة المتعهدين بقرار مالي صريح.",
    failalready:
      "هذه الرحلة معلَّمة فاشلة سلفاً — والسجل مُلحَقٌ فقط فلا يُكتب مرتين. أعد تحميل الصفحة لترى صفّ الفشل المسجَّل، وتصحيحُ أثره المالي يقع على الدفتر لا على هذا السجل.",
    failguard:
      "رفضت قاعدة البيانات تعليم الرحلة فاشلة بلا صفّ سببٍ مسجَّل — وهو حارسٌ يعني أن الحالة حاولت التغيّر من خارج المسار الوحيد. لم يتغيّر شيء؛ أعد تحميل الصفحة واستعمل نموذج الفشل أدناه.",
    failamountsign:
      "رفضت قاعدة البيانات مبلغاً غير موجب في القيد المالي — الخصم يُكتب موجباً على دوره الصحيح. لم يُقيَّد شيء ولم تتغيّر حالة الحجز.",
    failledgernote:
      "رفض الدفتر قيداً بلا ملاحظة — وهذا انحرافُ واجهةٍ عن عقد القاعدة لا خطأ منك. لم يتغيّر شيء؛ أبلغ عن الحالة قبل إعادة المحاولة.",
    failledgermissing:
      "لم يجد الدفتر الطرف الذي يُقيَّد عليه هذا الإجراء (المتعهد أو القيد المقابل). لم يُقيَّد شيء ولم تتغيّر حالة الحجز — راجع لوحة الإسناد أعلاه ثم أعد المحاولة.",
    failnotready:
      "تعليم الرحلات فاشلة يحتاج هجرة 0051 — نفِّذها من supabase/migrations ثم أعد المحاولة. لم يتغيّر شيء في هذا الطلب ولا في الدفتر.",
  };

  if (!booking) {
    return (
      <div className="mx-auto max-w-3xl space-y-6">
        <Banners
          wired={wired}
          readOnly
          saved={false}
          error={null}
          errorMessages={errorMessages}
          readOnlyTitle="تفاصيل الطلب غير متاحة"
          readOnlyBody={
            <p>
              قاعدة البيانات مربوطة لكن جدول <code dir="ltr">bookings</code> غير موجود — نفِّذ
              هجرة المرحلة ٤ من <code dir="ltr">supabase/migrations</code> ثم أعد تحميل الصفحة.
            </p>
          }
        />
        <Link href="/admin/orders" className="text-sm text-primary hover:underline">
          العودة إلى الطلبات
        </Link>
      </div>
    );
  }

  const trip = booking.trip;
  /**
   * مفاتيح لقطة الرحلة التي تضيفها هجرة `0031` (‏`returnAt` · `luggage` ·
   * `waitingDerived` · `extrasTotal`). تُقرأ من الكائن الخام لا من `TripSnapshot`
   * لأن ملف العقد `lib/booking-types.ts` لا يملكه هذا الوكيل — والقراءة متسامحة
   * فحجزٌ سبق الهجرة لا يحمل أياً منها ولا يظهر له صفٌّ فارغ.
   */
  const tripRaw = booking.trip as Record<string, unknown>;
  const returnAt = asText(pick(tripRaw, ["returnAt", "return_at"]));
  const luggage = asNumber(pick(tripRaw, ["luggage"]));
  const waitingDerived = pick(tripRaw, ["waitingDerived", "waiting_derived"]) === true;
  const extrasTotal = asNumber(pick(tripRaw, ["extrasTotal", "extras_total"]));
  const hasExtras = extras.length > 0 || (extrasTotal ?? 0) > 0;

  /**
   * سطر المركبة: وصفها وسنتها معاً — والسنة تمرّ بـ`toArabicDigits` وحدها لا
   * بمنسّق أرقام، وإلا فصل الألوفَ فصارت ٢٠٢٣ تُقرأ «٢٬٠٢٣».
   */
  const crewVehicleLine = [
    crew.vehicleLabel,
    crew.vehicleYear === null ? null : toArabicDigits(crew.vehicleYear),
  ]
    .filter((part): part is string => part !== null && part.length > 0)
    .join(" ");
  // المعرّفان لا الأسماء: صفٌّ حُذف من سجلّ الشريك يترك المعرّف معلَّقاً بلا اسم،
  // وهي حالةٌ تستحق أن تُقال («مركبة لم تعد في السجلّ») لا أن تُقرأ «بلا طاقم».
  const hasCrew = crew.vehicleId !== null || crew.driverId !== null;

  const cancelled = booking.status === "cancelled";
  // `verify_payment` ترفض أي حالة غير «قيد المراجعة» وترفض غياب إيصال pending —
  // فإظهار الزرين في «بانتظار الدفع» كان وعداً كاذباً ينتهي برسالة خطأ.
  const canVerify = booking.status === "under_review";

  // نفس المبدأ لرفع الإيصال: `admin_attach_receipt` تقبل الحالتين أدناه وحدهما،
  // وترفض بوجود إيصال معلّق. الشاشة تقول ذلك قبل الضغط لا بعده.
  const canAttachReceipt =
    booking.status === "pending_payment" || booking.status === "under_review";
  const hasPendingReceipt = payments.some((payment) => payment.status === "pending");

  /* ── الرحلة الفاشلة (0051) — الشاشة تقول قبل الضغط ما تقوله القاعدة بعده ────
   *
   * `mark_booking_failed` تقبل «مُسندة» و«منفذة» وحدهما، وتفرض على الثانية نافذة
   * إعادة تصنيف من لحظة الاكتمال. فالشرط أدناه **إعلانُ نيّةٍ لا حُكم**: الحارس
   * في القاعدة يفرض الشرطين على أي حال، وهذا يمنع زرّاً ينتهي برسالة رفض.
   */
  const isFailed = booking.status === "failed";
  // اكتمالٌ بلا حدثٍ يثبته: القاعدة ترفض إعادة التصنيف صراحةً، فلا يُعرض نموذج
  // مصيرُه الرفض. (وهو فرعٌ لا يُبلَغ اليوم — صفرُ حجزٍ مكتمل بلا صفّ حدث.)
  const completionUnknown = booking.status === "completed" && completedAt === null;
  const canMarkFailed =
    failureReady &&
    !isFailed &&
    (booking.status === "assigned" ||
      (booking.status === "completed" && !reclassClosed && !completionUnknown));

  return (
    <div className="print-sheet mx-auto max-w-4xl space-y-6">
      {/*
        الترويسة: الرقم المرجعي والحالة ورابط صفحة المتابعة التي يراها العميل.
        `no-print` كاملة — كل ما فيها إما تلميح أو رابط، وما يعرّف الحجز منها
        (المرجع ورمز المتعهد والحالة) يعيده `PrintHeader` أدناه بلا زخرفة.
      */}
      <div className="no-print flex flex-wrap items-center gap-2">
        <h2 className="font-heading text-lg font-bold" dir="ltr">
          {booking.reference}
        </h2>
        {/*
          رمز المتعهد (هجرة 0028): المتعهد لا يرى مرجع العميل — لأنه يرى هاتفه
          بحكم التنفيذ، فلو رأى المرجع أيضاً لاجتمع لديه عاملا «تابع حجزك» فحصل
          على توكن الحجز ومنه على سعر العميل، أي على هامشنا. ويُعرض هنا كي يبقى
          التشغيل والمتعهد على أرض واحدة حين يتحدثان عن رحلة بعينها.
        */}
        {partnerCode && (
          <>
            <span
              dir="ltr"
              className="rounded-md bg-muted px-2 py-0.5 font-mono text-xs text-muted-foreground"
            >
              {partnerCode}
            </span>
            <HelpTip>
              الرمز الذي يراه المتعهد لهذه الرحلة في بورتاله بدل رقم الحجز — اذكره له
              حين تتحدثان عن هذه الرحلة. والمتعهد لا يرى «{booking.reference}» إطلاقاً:
              هو ورقمُ هاتف العميل معاً يفتحان صفحة الحجز من نموذج «تابع حجزك»، وفيها
              سعر العميل — أي هامشنا.
            </HelpTip>
          </>
        )}
        <StatusBadge status={booking.status} />
        <HelpTip>
          {isBookingStatus(booking.status)
            ? STATUS_HINTS[booking.status]
            : "حالة غير معروفة — راجع آلة الحالات في قاعدة البيانات."}
        </HelpTip>
        <span className="text-xs text-muted-foreground">
          أُنشئ {relativeTime(booking.createdAt)} · {dateTimeLabel(booking.createdAt)}
        </span>
        <span className="ms-auto flex flex-wrap items-center gap-3">
          <PrintButton label="طباعة ورقة الرحلة" />
          <HelpTip>
            تطبع ورقة تشغيل واحدة: الرحلة والعميل والسعر والخدمات والمنفِّذ ومستحقه.
            وتسقط منها لوحات الإجراءات وسجل البث وسجل الحجز وبطاقتا الربحية — الورقة
            تُنفَّذ ولا تُقرَّر بها. <span className="font-semibold">وهي داخلية</span>:
            فيها هاتف العميل وسعره ومستحق المنفِّذ معاً، فلا تُسلَّم للمتعهد — له بورتاله
            بسعره هو.
          </HelpTip>
          {booking.publicToken && (
            <Link
              href={`/booking/${booking.publicToken}`}
              target="_blank"
              className="flex items-center gap-1 text-sm text-muted-foreground transition-colors hover:text-primary hover:underline"
            >
              <ExternalLink className="size-3.5" />
              صفحة متابعة العميل
            </Link>
          )}
          <Link
            href="/admin/orders"
            className="text-sm text-muted-foreground transition-colors hover:text-primary hover:underline"
          >
            العودة إلى الطلبات
          </Link>
        </span>
      </div>

      {/*
        ترويسة الورقة. الحالة فيها ليست زينة: «بانتظار الدفع» على ورقة تشغيل تعني
        أن السائق لا ينطلق بعد، و«مؤكد» تعني أن المتبقي وحده يُحصَّل في الطريق.
      */}
      <PrintHeader
        title="ورقة تشغيل رحلة"
        meta={[
          { label: "المرجع", value: booking.reference, dir: "ltr" },
          partnerCode ? { label: "رمز المتعهد", value: partnerCode, dir: "ltr" } : null,
          {
            label: "الحالة",
            value: isBookingStatus(booking.status)
              ? STATUS_LABELS[booking.status]
              : booking.status,
          },
          { label: "أُنشئ", value: dateTimeLabel(booking.createdAt) },
        ]}
        note="ورقة داخلية: تحمل هاتف العميل وسعره النهائي ومستحق المنفِّذ معاً — لا تُسلَّم للمتعهد ولا للعميل."
      />

      <div className="no-print">
        <Banners
          wired={wired}
          readOnly={false}
          saved={savedCode !== null}
          error={error}
          errorMessages={errorMessages}
          savedMessage={SAVED_MESSAGES[savedCode ?? "1"] ?? SAVED_MESSAGES["1"]}
          readOnlyTitle=""
          readOnlyBody={null}
        />
      </div>

      {/*
        رحلة فاشلة — أول ما يُقرأ عن هذا الحجز إن كان قد خاب. والشرط على **الصفّ**
        لا على الحالة وحدها: صفٌّ بلا حالة يعني قاعدةً في وضع لا يجوز، وحالةٌ بلا
        صفٍّ مستحيلةٌ بحارس القاعدة — فعرضُ ما وُجد أصدق من افتراض تطابقهما.
      */}
      {failure && <FailureCard failure={failure} currency={booking.currency} />}

      <div className="grid gap-4 lg:grid-cols-2">
        {/* لقطة الرحلة — مخزّنة مع الحجز فلا تتغير بتغير التعريفات لاحقاً */}
        <Card className="space-y-1 p-5">
          <h3 className="flex items-center gap-1.5 font-heading text-base font-bold">
            <MapPin className="size-4 text-primary" />
            الرحلة
            <HelpTip>
              هذه لقطة محفوظة لحظة الحجز: نقطتا الانطلاق والوصول والمسافة والركاب كما اختارها
              العميل. تعديل التعريفة أو الفئات لاحقاً لا يغيّر شيئاً في هذا الحجز.
            </HelpTip>
          </h3>
          <Row label="من">{trip.originLabel ?? "—"}</Row>
          <Row label="إلى">{trip.destLabel ?? "—"}</Row>
          <Row
            label="المسافة"
            help="مسافة الاتجاه الواحد من محرك المسافات لحظة التسعير. «تقديرية» تعني أن مزود الخرائط لم يستجب واستُخدم التقدير الهوائي."
          >
            {typeof trip.distanceKm === "number" ? formatDistance(trip.distanceKm) : "—"}
            {trip.distanceSource === "estimate" ? (
              <Badge variant="outline" className="ms-2">
                تقديرية
              </Badge>
            ) : null}
          </Row>
          <Row label="المدة المقدَّرة">
            {typeof trip.durationMin === "number" ? durationLabel(trip.durationMin) : "—"}
          </Row>
          <Row label="الركاب">
            {typeof trip.passengers === "number" ? passengersLabel(trip.passengers) : "—"}
          </Row>
          {/*
            الحقائب (0031): تُعرض متى وُجدت في اللقطة — والصفر يُعرض أيضاً لأنه
            إقرار العميل بأنه بلا حقائب، لا غياب بيانات. وهي شرط أهلية حقيقي:
            الفئة المعروضة هنا اتسعت لهذا العدد وقت التسعير.
          */}
          {luggage !== null ? (
            <Row
              label="الحقائب"
              help="عدد الحقائب الذي اختاره العميل. الفئة المحجوزة اتسعت له وقت التسعير — الأهلية تفحص الركاب والحقائب معاً داخل قاعدة البيانات، فلا تُعرض فئة أصغر من حاجته أصلاً."
            >
              {luggageText(luggage)}
            </Row>
          ) : null}
          <Row label="نوع الرحلة">{trip.roundTrip ? "ذهاب وعودة" : "اتجاه واحد"}</Row>
          {returnAt ? (
            <Row
              label="موعد العودة"
              help="الموعد الذي طلبه العميل للعودة. عودةٌ في اليوم نفسه تعني أن السائق ينتظر، فتُشتق منها ساعات الانتظار تلقائياً؛ وعودةٌ في يوم آخر تعني أنه ينصرف ويعود، فلا انتظار ويسعّرها معامل الذهاب والعودة وحده."
            >
              {dateTimeLabel(returnAt)}
            </Row>
          ) : null}
          <Row
            label="الانتظار"
            help={
              waitingDerived
                ? "ساعات الانتظار هنا مشتقة تلقائياً من موعد العودة في اليوم نفسه (بتقريب الساعة المبدوءة إلى ساعة كاملة). وإن كان العميل قد طلب انتظاراً أطول فالمحفوظ هو الأكبر منهما."
                : "ساعات الانتظار كما طلبها العميل. سعر الساعة ثابت لكل فئة ويُضاف بعد معامل الذهاب والعودة وقبل عمولة الذروة."
            }
          >
            {typeof trip.waitingHours === "number" && trip.waitingHours > 0
              ? hoursText(trip.waitingHours)
              : "بدون انتظار"}
            {waitingDerived ? (
              <Badge variant="outline" className="ms-2">
                محسوبة من موعد العودة
              </Badge>
            ) : null}
          </Row>
          <Row label="موعد الانطلاق">{dateTimeLabel(trip.pickupAt ?? null)}</Row>
          <Row label="الفئة">{booking.classTitle ?? booking.classSlug ?? "—"}</Row>
          {trip.notes ? (
            <Row label="ملاحظات العميل">
              <span className="block max-w-md leading-relaxed">{trip.notes}</span>
            </Row>
          ) : null}
        </Card>

        <div className="space-y-4">
          {/* العميل — أزرار اتصال وواتساب مباشرة */}
          <Card className="space-y-1 p-5">
            <h3 className="flex items-center gap-1.5 font-heading text-base font-bold">
              <Phone className="size-4 text-primary" />
              العميل
              <HelpTip>
                الحجز كضيف بلا حساب: الاسم والموبايل هما كل ما نملك للتواصل. اضغط الرقم للاتصال
                من الموبايل مباشرة، أو زر واتساب لفتح المحادثة.
              </HelpTip>
            </h3>
            <Row label="الاسم">{booking.customerName ?? "—"}</Row>
            <Row label="التواصل">
              <ContactLinks phone={booking.customerPhone} whatsapp={booking.customerWhatsapp} />
            </Row>
          </Card>

          {/* تفصيل السعر — أرقام مخزّنة، لا حساب في الواجهة */}
          <Card className="space-y-1 p-5">
            <h3 className="flex items-center gap-1.5 font-heading text-base font-bold">
              <ReceiptText className="size-4 text-primary" />
              السعر
              <HelpTip>
                هذه الأرقام حسبتها دالة <code dir="ltr">create_booking</code> في قاعدة البيانات
                لحظة الحجز عبر <code dir="ltr">quote_price</code> — أي سعر يصل من المتصفح
                يُتجاهَل. لا تُعدَّل هنا.
              </HelpTip>
            </h3>
            <Row label="الإجمالي">
              <span dir="ltr">{formatMoney(booking.total, booking.currency)}</span>
            </Row>
            {/*
              تركيبة الإجمالي حين توجد خدمات: الرقم أعلاه يشمل ثمنها، وسطرٌ واحد
              يقول كم منه — والتفصيل في بطاقة الخدمات أدناه. قيمة مقروءة من
              اللقطة لا مطروحة هنا.
            */}
            {extrasTotal !== null && extrasTotal > 0 ? (
              <Row
                label="منها خدمات إضافية"
                help="قيمة ما اشتراه العميل فوق الرحلة (كرسي أطفال، واي فاي…). تُضاف بعد الذروة وبعد الخصم معاً — فالكوبون خصم سعر الرحلة وحده، والباقي هو ثمن الخدمات كما هو."
              >
                <span dir="ltr">{formatMoney(extrasTotal, booking.currency)}</span>
              </Row>
            ) : null}
            <Row
              label="خطة الدفع"
              help="«كامل المبلغ» يعني تحويل الإجمالي مقدماً، و«عربون» يعني تحويل نسبة منه والباقي تحصيل مع السائق. النسب تُضبط من إعدادات الدفع."
            >
              {booking.plan ? (PLAN_LABELS[booking.plan] ?? booking.plan) : "—"}
            </Row>
            <Row label="المطلوب تحويله">
              <span dir="ltr" className="font-bold">
                {formatMoney(booking.amountDue, booking.currency)}
              </span>
            </Row>
            <Row label="المتبقي مع السائق">
              <span dir="ltr">{formatMoney(booking.amountRemaining, booking.currency)}</span>
            </Row>
          </Card>

          {/*
            ربحية الرحلة — لقطة داخلية بحتة، أول عائد ملموس لتسجيل مصدر السعر.
            لا يراها العميل في أي شاشة: صفحة المتابعة العامة تعرض الإجمالي وحده.
            ولا تُطبع: هامشُ لقطةِ التسعير رقمٌ لا ينفّذ به أحدٌ شيئاً في الميدان،
            وطباعته تضع سعرَ شرائنا وسعرَ بيعنا على ورقة تُترك على مكتب.
          */}
          <Card className="no-print space-y-1 p-5">
            <h3 className="flex items-center gap-1.5 font-heading text-base font-bold">
              <Wallet className="size-4 text-primary" />
              ربحية الرحلة
              <HelpTip>
                أرقام داخلية للتشغيل فقط — لا تظهر للعميل في صفحة متابعة حجزه ولا في أي عرض
                سعر. هي لقطة مثبَّتة لحظة الحجز: تغيير الهامش أو أسعار المتعهدين لاحقاً لا
                يمسّ هذا الحجز، وعليها تُبنى تقارير المالية.
              </HelpTip>
            </h3>

            {booking.priceSource === null ? (
              <p className="pt-1 text-sm leading-relaxed text-muted-foreground">
                لا لقطة مصدر سعر لهذا الحجز — أُنشئ قبل تفعيل نظام المتعهدين، أو أن هجرة
                المرحلة ٥ لم تُطبَّق على قاعدة البيانات بعد. الحجوزات الجديدة تسجّلها تلقائياً.
              </p>
            ) : (
              <>
                <Row
                  label="مصدر السعر"
                  help="«سعر متعهد» يعني أن متعهداً معتمداً كان يغطي هذا المسار فأُخذ أرخص سعر وأُضيف الهامش. «تعريفة كيلومتر» يعني أن لا تغطية، فحُسب السعر بتعريفة الفئة."
                >
                  <SourceBadge source={booking.priceSource} />
                </Row>

                {booking.priceSource === "subcontractor" ? (
                  <>
                    <Row
                      label="المتعهد"
                      help="من كان أرخص تكلفةً لحظة التسعير. إسناد الرحلة فعلياً إجراء منفصل — قد ينفّذها متعهد آخر."
                    >
                      {subcontractorName ?? (booking.subcontractorId ? "متعهد مسجَّل" : "—")}
                    </Row>
                    <Row
                      label="تكلفة المتعهد"
                      help="ما يستحقه المتعهد عن الرحلة بحسب قائمة أسعاره المعتمدة وقتها — سعر شراء لا سعر بيع."
                    >
                      <span dir="ltr">
                        {booking.subcontractorCost === null
                          ? "—"
                          : formatMoney(booking.subcontractorCost, booking.currency)}
                      </span>
                    </Row>
                    <Row
                      label="هامش الموقع"
                      help="ربح الموقع فوق تكلفة المتعهد كما حسبته إعدادات الهامش لحظة الحجز. عمولة الذروة — إن كانت مفعّلة — تُضاف فوق الناتج وتظهر ضمن الإجمالي."
                    >
                      <span dir="ltr" className="font-bold">
                        {booking.marginAmount === null
                          ? "—"
                          : formatMoney(booking.marginAmount, booking.currency)}
                      </span>
                    </Row>
                    <Row label="سعر العميل">
                      <span dir="ltr">{formatMoney(booking.total, booking.currency)}</span>
                    </Row>
                  </>
                ) : (
                  <p className="pt-1 text-sm leading-relaxed text-muted-foreground">
                    لا تكلفة متعهد على هذه الرحلة: سُعِّرت بتعريفة الكيلومتر، وربح الموقع فيها
                    داخل التعريفة نفسها — لذلك لا يُضاف هامش فوقها (منعاً للاحتساب المزدوج).
                  </p>
                )}
              </>
            )}
          </Card>
        </div>
      </div>

      {/*
        الخدمات الإضافية — بعد بطاقة السعر مباشرة لأنها تفسّر جزءاً من إجمالها،
        وبعرض كامل لا داخل العمود الضيق لأن سطرها أربعة أعمدة. ولا تُصيَّر أصلاً
        لحجز بلا خدمات (وهو الغالب)، فلا تُثقل شاشة التشغيل ببطاقة فارغة.
      */}
      {hasExtras && (
        <BookingExtrasCard
          extras={extras}
          extrasReady={extrasReady}
          extrasTotal={extrasTotal}
          currency={booking.currency}
        />
      )}

      {/*
        الحساب الفعلي — بعد بطاقة السعر مباشرة لأنه جوابها الواقعي: تلك تقول
        «كم طُلب»، وهذه تقول «كم دخل ومن يمسك الباقي».
        ولا يُطبع: مراجعةٌ محاسبية تُقرأ على الشاشة بجوار الدفتر، وفيها الربح
        الإجمالي صريحاً. وما يحتاجه الميدان منها — «المتبقي مع السائق» — مكتوب
        في بطاقة السعر المطبوعة أعلاه.
      */}
      <div className="no-print">
        <BookingAccountingCard
          profit={profit}
          profitReady={profitReady}
          currency={booking.currency}
          subcontractorId={booking.subcontractorId}
        />
      </div>

      {/*
        المدفوعات والإيصالات — لا تُطبع كاملةً: نموذج الرفع وأزرار تبديل الرؤية
        أدوات قرار، وصور الإيصالات تلتهم الحبر وتحمل روابط موقّعة تنتهي بعد خمس
        دقائق فتصير على الورق سطوراً ميتة. والسؤال الوحيد الذي يعني الميدان — «هل
        دُفع؟» — تجيبه الحالة في ترويسة الورقة و«المتبقي مع السائق» في بطاقة السعر.
      */}
      <Card className="no-print space-y-4 p-5" id="receipts">
        <div>
          <h3 className="flex items-center gap-1.5 font-heading text-base font-bold">
            <FileText className="size-4 text-primary" />
            التحويلات والإيصالات
            <HelpTip>
              هنا كل إيصال على هذا الحجز: ما رفعه العميل من صفحة متابعته، وما رفعه فريق
              التشغيل نيابةً عنه من النموذج أسفل القائمة. والإيصال المحجوب يظهر لك هنا كاملاً
              ولا يدخل حمولة صفحة العميل أصلاً — تُسقطه القاعدة من الحمولة قبل إرسالها، فلا
              يبلغ متصفحه بأي حال. الصور محفوظة في مخزن خاص لا يُقرأ من الإنترنت: ما تراه
              رابط مؤقت صالح ٥ دقائق فقط يُنشأ عند فتح الصفحة، وينتهي بعدها تلقائياً.
            </HelpTip>
          </h3>
          <p className="text-sm text-muted-foreground">
            طابق المبلغ والتاريخ مع كشف حساب المحفظة قبل الاعتماد.
          </p>
        </div>

        {paymentsFailed ? (
          <p className="text-sm text-muted-foreground">
            تعذر قراءة التحويلات — تأكد أن جدول <code dir="ltr">payments</code> منفَّذ في قاعدة
            البيانات (هجرة المرحلة ٤).
          </p>
        ) : payments.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            لا إيصال على هذا الحجز بعد — لا من العميل ولا من فريق التشغيل.
          </p>
        ) : (
          <div className="space-y-3">
            {payments.map((payment) => {
              const account = payment.accountId ? accounts.get(payment.accountId) : undefined;
              return (
                <div
                  key={payment.key}
                  className="flex flex-wrap items-start gap-4 rounded-lg border border-border p-3"
                >
                  <div className="min-w-48 flex-1 space-y-1 text-sm">
                    <div className="flex flex-wrap items-center gap-2">
                      <span dir="ltr" className="font-bold">
                        {payment.amount === null
                          ? "—"
                          : formatMoney(payment.amount, booking.currency)}
                      </span>
                      {/* الوسيلة تُقرأ من الحساب المستقبِل — لا حقل وسيلة في صف الدفع */}
                      {account?.kind && (
                        <Badge variant="secondary">
                          {ACCOUNT_KIND_LABELS[account.kind] ?? account.kind}
                        </Badge>
                      )}
                      {payment.status && <Badge variant="outline">{payment.status}</Badge>}
                      {payment.uploadedByAdmin && (
                        <Badge
                          variant="outline"
                          className="border-violet-300 bg-violet-100 text-violet-900 dark:border-violet-700 dark:bg-violet-950 dark:text-violet-100"
                        >
                          رفعه التشغيل
                        </Badge>
                      )}
                      {/*
                        الوسم لا يُعرض قبل 0027: العمود غير موجود فلا ادعاء عن رؤية أحد.
                        ونصّه يصف **الحمولة** لا الشاشة: ما يقرره العمود هو دخول الصف في
                        رد `get_booking_by_token` أو إسقاطه منه — أما ترتيب عرضه في صفحة
                        المتابعة فشأن تلك الصفحة، ولا يجوز أن تَعِد به هذه الشاشة.
                      */}
                      {receiptFlagsReady &&
                        (payment.visibleToCustomer ? (
                          <Badge
                            variant="outline"
                            className="border-emerald-300 bg-emerald-100 text-emerald-900 dark:border-emerald-700 dark:bg-emerald-950 dark:text-emerald-100"
                          >
                            <Eye className="size-3.5" />
                            يصل صفحة العميل
                          </Badge>
                        ) : (
                          <Badge variant="outline" className="text-muted-foreground">
                            <EyeOff className="size-3.5" />
                            محجوب عن صفحة العميل
                          </Badge>
                        ))}
                    </div>
                    {account && (
                      <p className="text-xs text-muted-foreground">
                        حُوِّل إلى {account.label}
                        {account.handle ? (
                          <span dir="ltr" className="ms-1">
                            ({account.handle})
                          </span>
                        ) : null}
                      </p>
                    )}
                    <p className="text-xs text-muted-foreground">
                      {dateTimeLabel(payment.createdAt)} · {relativeTime(payment.createdAt)}
                    </p>
                    {payment.note && <p className="text-xs leading-relaxed">{payment.note}</p>}

                    {/*
                      تبديل الرؤية: الحجب يقع في القاعدة (تُسقط `get_booking_by_token`
                      الصف من حمولة صفحة المتابعة) لا في العرض — فحاملُ التوكن يقرأ
                      الحمولة الخام، وإخفاءٌ في JSX ليس إخفاءً.
                    */}
                    {receiptFlagsReady && payment.id ? (
                      <form
                        action={setReceiptVisibility.bind(
                          null,
                          booking.id,
                          payment.id,
                          !payment.visibleToCustomer
                        )}
                        className="flex flex-wrap items-center gap-1.5 pt-1"
                      >
                        <Button type="submit" variant="outline" size="sm">
                          {payment.visibleToCustomer ? <EyeOff /> : <Eye />}
                          {payment.visibleToCustomer ? "احجبه عن صفحة العميل" : "أدخِله في صفحة العميل"}
                        </Button>
                        <HelpTip>
                          الحجب يُسقط صف الإيصال كاملاً من حمولة صفحة المتابعة — لا يصل
                          متصفح العميل، ولا يصله معه مبلغُه ولا ملاحظتُه. وإن كان الإيصال
                          مرفوضاً فسبب الرفض يختفي عنه أيضاً، وهو النص الذي يقرؤه اليوم ليعرف
                          ما ينقص تحويله. والحجب لا أثر له محاسبياً: الإيصال المحجوب إن
                          اعتُمد يُقيَّد في الدفتر كأي إيصال.
                        </HelpTip>
                      </form>
                    ) : null}
                  </div>

                  <div className="shrink-0">
                    {payment.receiptUrl ? (
                      <a
                        href={payment.receiptUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="block"
                        title="فتح الإيصال بحجمه الكامل (رابط مؤقت)"
                      >
                        {payment.receiptIsImage ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={payment.receiptUrl}
                            alt="إيصال التحويل"
                            className="h-28 w-auto rounded-lg border border-border object-cover"
                          />
                        ) : (
                          <span className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-2 text-xs transition-colors hover:border-primary hover:text-primary">
                            <FileText className="size-4" />
                            فتح الإيصال
                          </span>
                        )}
                      </a>
                    ) : payment.receiptMissing ? (
                      <span className="text-xs text-amber-700 dark:text-amber-300">
                        تعذر إنشاء رابط الإيصال — تأكد من ضبط{" "}
                        <code dir="ltr">SUPABASE_SERVICE_ROLE_KEY</code> ووجود مخزن{" "}
                        <code dir="ltr">receipts</code>.
                      </span>
                    ) : (
                      <span className="text-xs text-muted-foreground">بلا إيصال مرفق</span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        <Separator />

        {/*
          رفع إيصال نيابة عن العميل — الحالة الشائعة: يصل التحويل على واتساب أو
          هاتفياً فيبقى الحجز «بانتظار الدفع» والمال قد وصل. لا اعتماد تلقائي
          هنا: الرفع ينقل الحجز إلى «قيد المراجعة» ويمر بعدها بنفس زرَّي الاعتماد
          والرفض المعتادين، فيبقى قرار المال بيد إنسان.
        */}
        <div className="space-y-3">
          <h4 className="flex items-center gap-1.5 text-sm font-bold">
            <Upload className="size-4 text-primary" />
            رفع إيصال نيابة عن العميل
            <HelpTip>
              يُنشئ إيصالاً على هذا الحجز وينقله إلى «قيد المراجعة»، ثم تعتمده أو ترفضه من
              قسم الإجراءات كأي إيصال. ولا يصل فريق التشغيل تنبيه «رفع العميل إيصالاً» في
              هذه الحالة: نصّه يقول إن العميل رفعه، وأنت من رفعه — وتنبيهك بفعلك ضجيج.
            </HelpTip>
          </h4>

          {!canAttachReceipt ? (
            <p className="text-sm leading-relaxed text-muted-foreground">
              الرفع متاح والحجز «بانتظار الدفع» أو «قيد المراجعة» فقط — وهو نفس ما تفرضه
              قاعدة البيانات. الحالة الحالية «
              {isBookingStatus(booking.status) ? STATUS_LABELS[booking.status] : booking.status}
              ».
            </p>
          ) : hasPendingReceipt ? (
            <p className="text-sm leading-relaxed text-muted-foreground">
              يوجد إيصال معلّق على هذا الحجز — اعتمده أو ارفضه أولاً ثم ارفع الإيصال الجديد.
              الاعتماد يعالج الإيصال المعلّق الأحدث وحده، فصفٌّ ثانٍ كان سيترك الأول معلّقاً
              بلا زر يغلقه.
            </p>
          ) : (
            <form action={uploadAdminReceipt.bind(null, booking.id)} className="space-y-3">
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label htmlFor="receipt_file" className="flex items-center gap-1.5">
                    صورة الإيصال
                    <HelpTip>
                      صورة (JPG أو PNG أو WebP) أو ملف PDF بحد ٥ ميجابايت — نفس ما يقبله
                      المخزن نفسه. يُحفظ في مخزن خاص لا يُقرأ إلا بروابط موقّعة قصيرة العمر
                      من هذه الشاشة.
                    </HelpTip>
                  </Label>
                  <Input
                    id="receipt_file"
                    name="receipt_file"
                    type="file"
                    accept="image/jpeg,image/png,image/webp,application/pdf"
                    required
                    className="file:me-2 file:text-xs"
                  />
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="receipt_amount" className="flex items-center gap-1.5">
                    المبلغ الواصل
                    <HelpTip>
                      اكتب ما وصل فعلاً كما في كشف الحساب — لا قيمة الحجز. قد يقلّ عن
                      المطلوب أو يزيد، والدفتر يستوعب الحالتين. ويُثبَّت حساب الاستقبال عند
                      الاعتماد لا عند الرفع.
                    </HelpTip>
                  </Label>
                  <Input
                    id="receipt_amount"
                    name="receipt_amount"
                    type="number"
                    inputMode="decimal"
                    dir="ltr"
                    step="0.01"
                    min="0"
                    required
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="receipt_note" className="flex items-center gap-1.5">
                  ملاحظة
                  <HelpTip>
                    من أين وصل الإيصال ومن استلمه: «وصلت الصورة على واتساب من رقم العميل» أو
                    «رقم عملية أملاه العميل هاتفياً». تُحفظ مع الإيصال، وتسافر معه في حمولة
                    صفحة العميل إن أدخلته فيها — فاكتبها بما يصلح أن يقرأه العميل.
                  </HelpTip>
                </Label>
                <textarea
                  id="receipt_note"
                  name="receipt_note"
                  rows={2}
                  maxLength={500}
                  className={cn(controlClass, "resize-y leading-relaxed")}
                  placeholder="مثال: وصلت صورة التحويل على واتساب من رقم العميل"
                />
              </div>

              <Label className="flex cursor-pointer items-center justify-between gap-3 rounded-lg border border-input p-3 text-sm font-normal">
                <span className="leading-relaxed">
                  <span className="font-medium">أدخِل هذا الإيصال في صفحة العميل</span>
                  <span className="block text-muted-foreground">
                    الافتراضي محجوب: الإيصال الذي يرفعه التشغيل داخليٌّ بطبعه، وإدخاله في
                    حمولة صفحة المتابعة قرار صريح — وبدونه تُسقط القاعدة صفّه من الحمولة فلا
                    يبلغ متصفح العميل. يمكنك تبديله في أي وقت من زر بطاقة الإيصال أعلى هذا
                    النموذج.
                  </span>
                </span>
                <input
                  type="checkbox"
                  name="receipt_visible"
                  className="size-5 shrink-0 accent-primary"
                />
              </Label>

              <div className="flex justify-end">
                <Button type="submit">
                  <Upload />
                  حفظ الإيصال ونقل الحجز للمراجعة
                </Button>
              </div>
            </form>
          )}
        </div>
      </Card>

      {/*
        الإسناد — سجل البث الكامل وأزرار التدخل البشري.
        مكوّن خادمي مستقل يقرأ جداول المرحلة ٦ بنفسه ويتدهور بهدوء قبل تنفيذ
        هجرتها، فلا يتعلق باقي الشاشة بجاهزيتها.
      */}
      <DispatchPanel
        bookingId={booking.id}
        bookingStatus={booking.status}
        bookingTotal={booking.total}
        // إيراد الخدمات يُطرح قبل قياس الهامش الحقيقي: `total` يحمله منذ 0031،
        // وهو ثمن شيء ننفّذه نحن ولا يراه المتعهد — فعدُّه هامشاً يطلي صفقةً
        // تحت الأرضية بالأخضر. نفس ما تفعله القاعدة في 0032 و0033.
        extrasTotal={extrasTotal}
        currency={booking.currency}
        confirmingAssign={confirmingAssign}
        confirmingOverride={confirmingOverride}
      />

      {/*
        المركبة والسائق — تحت لوحة الإسناد مباشرةً لأنها تكملتها: تلك تجيب
        «من ينفّذ؟» وهذه «بأي سيارة ومع من؟».

        ولا تُصيَّر أصلاً لحجزٍ **بلا دورة إسناد** (وهو حال كل حجز قبل التأكيد):
        لوحةُ الإسناد فوقها تقول ذلك بنفسها، وبطاقةٌ ثانية تكرّره تُثقل شاشة
        التشغيل ببطاقة فارغة على كل طلب — نفس حكم بطاقة الخدمات أعلاه.
      */}
      {crew.dispatchFound && (
        <TripCrewCard
          bookingId={booking.id}
          crew={crew}
          vehicleLine={crewVehicleLine}
          hasCrew={hasCrew}
        />
      )}

      {/* الإجراءات — لوح قرار بحت، لا يُطبع منه شيء */}
      <Card className="no-print space-y-4 p-5" id="actions">
        <div>
          <h3 className="flex items-center gap-1.5 font-heading text-base font-bold">
            الإجراءات
            <HelpTip>
              الانتقالات بين الحالات محروسة داخل قاعدة البيانات: أي انتقال غير مسموح يُرفض
              برسالة، فلا يمكن مثلاً تنفيذ حجز لم يُؤكد. كل إجراء يُسجَّل في سجل الحالة أسفل
              الصفحة ويُطلق إشعاراً للتشغيل.
            </HelpTip>
          </h3>
          <p className="text-sm text-muted-foreground">
            اعتماد التحويل هو الخطوة التي تحوّل الحجز إلى «مؤكد» أمام العميل.
          </p>
        </div>

        {canVerify ? (
          <div className="grid gap-4 md:grid-cols-2">
            <form action={verifyTransfer.bind(null, booking.id, true)} className="space-y-2">
              <Label htmlFor="approve_note" className="flex items-center gap-1.5">
                اعتماد التحويل
                <HelpTip>
                  اضغط بعد التأكد من وصول المبلغ فعلياً إلى الحساب. الحجز يصبح «مؤكد» ويصل
                  العميل إشعار التأكيد. الملاحظة اختيارية (مثال: رقم عملية التحويل).
                </HelpTip>
              </Label>
              <input
                id="approve_note"
                name="approve_note"
                className={controlClass}
                placeholder="ملاحظة اختيارية — رقم العملية مثلاً"
              />
              <Button type="submit" className="w-full">
                <CheckCircle2 />
                اعتماد التحويل وتأكيد الحجز
              </Button>
            </form>

            <form action={verifyTransfer.bind(null, booking.id, false)} className="space-y-2">
              <Label htmlFor="reject_note" className="flex items-center gap-1.5">
                رفض التحويل
                <HelpTip>
                  يعيد الحجز إلى «بانتظار الدفع» ليرفع العميل إيصالاً صحيحاً. السبب إلزامي لأن
                  العميل يقرأه في صفحة متابعة حجزه.
                </HelpTip>
              </Label>
              <input
                id="reject_note"
                name="reject_note"
                className={controlClass}
                placeholder="سبب الرفض — إلزامي"
                required
              />
              <Button type="submit" variant="destructive" className="w-full">
                <XCircle />
                رفض التحويل
              </Button>
            </form>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">
            اعتماد التحويل أو رفضه متاح في حالة «قيد المراجعة» فقط — أي بعد أن يرفع العميل
            إيصال تحويل ينتظر البتّ فيه. الحالة الحالية{" "}
            «{isBookingStatus(booking.status) ? STATUS_LABELS[booking.status] : booking.status}».
          </p>
        )}

        <Separator />

        <form action={changeStatus.bind(null, booking.id)} className="space-y-2">
          <Label htmlFor="status" className="flex items-center gap-1.5">
            تغيير الحالة يدوياً
            <HelpTip>
              للحالات التي لا تأتي من مسار الدفع: «منفذ» بعد انتهاء الرحلة، و«مُسند» يُدار
              آلياً من المرحلة ٦. الانتقال غير المسموح يُرفض من قاعدة البيانات. الإلغاء ليس في
              هذه القائمة عمداً — له زر مستقل بخطوة تأكيد أسفل الصفحة.
            </HelpTip>
          </Label>
          <div className="grid gap-2 sm:grid-cols-[12rem_1fr_auto]">
            <select
              id="status"
              name="status"
              defaultValue={booking.status === "cancelled" ? "pending_payment" : booking.status}
              className={cn(controlClass, "sm:w-48")}
            >
              {BOOKING_STATUSES.filter((s) => s !== "cancelled").map((s) => (
                <option key={s} value={s}>
                  {STATUS_LABELS[s]}
                </option>
              ))}
            </select>
            <input
              name="status_note"
              className={controlClass}
              placeholder="ملاحظة تُسجَّل في سجل الحالة (اختيارية)"
            />
            <Button type="submit" variant="outline">
              تحديث الحالة
            </Button>
          </div>
        </form>

        <Separator />

        {cancelled ? (
          <p className="text-sm text-muted-foreground">
            هذا الحجز ملغى بالفعل — الإلغاء حالة نهائية.
          </p>
        ) : confirmingCancel ? (
          <form
            action={cancelBooking.bind(null, booking.id)}
            className="space-y-3 rounded-lg border border-red-300 bg-red-50 p-4 dark:border-red-700 dark:bg-red-950"
          >
            <p className="text-sm font-semibold text-red-900 dark:text-red-100">
              تأكيد إلغاء الحجز {booking.reference}
            </p>
            <p className="text-sm leading-relaxed text-red-900/90 dark:text-red-100/90">
              الإلغاء حالة نهائية: يختفي الحجز من طابور التنفيذ ويظهر للعميل ملغى مع سببه. إن
              كان العميل قد حوّل مبلغاً فاسترداده إجراء مالي منفصل خارج النظام حالياً.
            </p>
            <input
              name="cancel_note"
              className={controlClass}
              placeholder="سبب الإلغاء — إلزامي ويراه العميل"
              required
            />
            <div className="flex flex-wrap items-center gap-3">
              <Button type="submit" variant="destructive">
                <Ban />
                تأكيد الإلغاء
              </Button>
              <Link
                href={`/admin/orders/${booking.id}`}
                className="text-sm text-muted-foreground transition-colors hover:text-foreground hover:underline"
              >
                تراجع
              </Link>
            </div>
          </form>
        ) : (
          <div className="flex flex-wrap items-center gap-2">
            <Link
              href={`/admin/orders/${booking.id}?confirm=cancel#actions`}
              className="inline-flex items-center gap-1.5 rounded-lg border border-red-300 px-3 py-1.5 text-sm text-red-700 transition-colors hover:bg-red-50 dark:border-red-800 dark:text-red-300 dark:hover:bg-red-950"
            >
              <Ban className="size-4" />
              إلغاء الحجز
            </Link>
            <HelpTip>
              خطوة تأكيد إجبارية تسبق الإلغاء — لا يقع الإلغاء بضغطة واحدة على حجز مدفوع.
            </HelpTip>
          </div>
        )}

        <Separator />

        {/*
          ── تعليم الرحلة فاشلة (0051) ─────────────────────────────────────────
          «فشل» لا «إلغاء»: الإلغاء يقع قبل التنفيذ، والفشل بعد أن صار للرحلة
          منفِّذ — فلكلٍّ أثرٌ مالي مختلف على المتعهد، ولذلك زرّان لا زر.
          والقرار قرار المدير: الكتالوج **يقترح** والمدير ينفّذ أو يتجاوز بمبرر،
          والمنفَّذ وحده هو ما يُخزَّن.
        */}
        {!failureReady ? (
          <p className="text-sm text-muted-foreground">
            تعليم الرحلات فاشلة يحتاج هجرة <code dir="ltr">0051</code> — نفِّذها من{" "}
            <code dir="ltr">supabase/migrations</code> ثم أعد تحميل الصفحة.
          </p>
        ) : isFailed ? (
          <p className="text-sm text-muted-foreground">
            هذه الرحلة معلَّمة فاشلة، والحالة نهائية — لا تعود إلى الطابور ولا تُعلَّم مرتين.
            تفصيل السبب وأثره المالي في بطاقة «رحلة فاشلة» أعلى الصفحة.
          </p>
        ) : !canMarkFailed ? (
          <p className="text-sm text-muted-foreground">
            {completionUnknown
              ? "لا يوجد في سجل هذا الحجز حدثٌ يثبت لحظة اكتماله، والقاعدة ترفض إعادة تصنيف اكتمالٍ لا تعرف زمنه — فلا نموذج هنا."
              : reclassClosed
                ? `انقضت نافذة إعادة تصنيف هذه الرحلة المكتملة — أُغلقت في ${dateTimeLabel(reclassDeadline)}. وأي تسوية بعدها تُكتب على الدفتر مباشرةً من شاشة مقاصة المتعهدين.`
                : `تعليم الرحلة فاشلة متاح في حالتَي «مُسند» و«منفذ» وحدهما — قبل الإسناد لا يوجد من خابت عنده. الحالة الحالية «${isBookingStatus(booking.status) ? STATUS_LABELS[booking.status] : booking.status}».`}
          </p>
        ) : reasons.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            كتالوج أسباب الفشل فارغ — ولا فشلَ بلا سبب مصنَّف. أضف الأسباب أولاً من{" "}
            <Link href="/admin/failure-reasons" className="text-primary hover:underline">
              شاشة أسباب فشل الرحلة
            </Link>
            .
          </p>
        ) : confirmingFailed ? (
          <form
            action={markBookingFailed.bind(null, booking.id)}
            className="space-y-4 rounded-lg border border-red-300 bg-red-50 p-4 dark:border-red-700 dark:bg-red-950"
          >
            <div className="space-y-1">
              <p className="text-sm font-semibold text-red-900 dark:text-red-100">
                تعليم الرحلة {booking.reference} فاشلة
              </p>
              <p className="text-sm leading-relaxed text-red-900/90 dark:text-red-100/90">
                حالة نهائية: الرحلة لا تعود إلى طابور الإسناد، والعميل يحجز من جديد.{" "}
                <span className="font-semibold">وردّ ماله إجراء مالي مستقل</span> من شاشة
                المالية — لا يقع بهذا النموذج. أما ما يقع به فهو الأثر على{" "}
                <span className="font-semibold">المتعهد</span> أدناه.
                {booking.status === "completed" && reclassDeadline ? (
                  <>
                    {" "}
                    وهذه رحلة مكتملة، فالنافذة مفتوحة حتى{" "}
                    <span className="font-semibold">{dateTimeLabel(reclassDeadline)}</span> —
                    بعدها ترفضها القاعدة.
                  </>
                ) : null}
              </p>
            </div>

            <fieldset className="space-y-2">
              <legend className="flex items-center gap-1.5 text-sm font-medium">
                سبب الفشل
                <HelpTip>
                  الأسباب كتالوج تحرّره بنفسك من شاشة «أسباب فشل الرحلة»، ولكل سبب{" "}
                  <span className="font-semibold">إجراء مالي مقترح</span> يظهر بجواره.
                  والمقترح اقتراحُ لحظةٍ لا حكمٌ دائم: تغييره في الكتالوج غداً لا يمسّ ما
                  سُجِّل اليوم، لأن التسمية والإجراء يُلقَطان في صفّ هذه الرحلة نفسه.
                </HelpTip>
              </legend>
              <div className="grid gap-1.5 sm:grid-cols-2">
                {reasons.map((reason) => (
                  <label
                    key={reason.slug}
                    className="flex cursor-pointer items-center gap-2 rounded-lg border border-red-200 bg-background/60 px-2.5 py-2 text-sm dark:border-red-900"
                  >
                    <input
                      type="radio"
                      name="reason"
                      value={reason.slug}
                      required
                      className="size-4 shrink-0 accent-primary"
                    />
                    <span className="min-w-0 flex-1 truncate">{reason.label}</span>
                    <Badge variant="outline" className="shrink-0 text-xs">
                      المقترح: {FAILURE_ACTION_LABELS[reason.defaultAction] ?? reason.defaultAction}
                    </Badge>
                  </label>
                ))}
              </div>
            </fieldset>

            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="failure_action" className="flex items-center gap-1.5">
                  الإجراء المالي مع المتعهد
                  <HelpTip>
                    <span className="font-semibold">لا شيء:</span>{" "}
                    {FAILURE_ACTION_HINTS.none}
                    <br />
                    <span className="font-semibold">دفع كامل المستحق:</span>{" "}
                    {FAILURE_ACTION_HINTS.pay}
                    <br />
                    <span className="font-semibold">خصم:</span> {FAILURE_ACTION_HINTS.deduct}
                  </HelpTip>
                </Label>
                <select
                  id="failure_action"
                  name="action"
                  defaultValue=""
                  className={controlClass}
                >
                  <option value="">اتّبع الإجراء المقترح للسبب المختار</option>
                  <option value="none">{FAILURE_ACTION_LABELS.none}</option>
                  <option value="pay">{FAILURE_ACTION_LABELS.pay}</option>
                  <option value="deduct">{FAILURE_ACTION_LABELS.deduct}</option>
                </select>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="failure_deduct" className="flex items-center gap-1.5">
                  مبلغ الخصم ({booking.currency})
                  <HelpTip>
                    مع إجراء «خصم» وحده — ومعه إلزامي وموجب. ومع أي إجراء آخر تركه فارغاً
                    شرطٌ ترفض القاعدة خرقه، فلا يبقى في السجل مبلغٌ بلا معنى.
                    {assignedPayout !== null ? (
                      <>
                        {" "}
                        ومستحق الإسناد على هذه الرحلة{" "}
                        <span dir="ltr" className="font-semibold">
                          {formatMoney(assignedPayout, booking.currency)}
                        </span>{" "}
                        — والخصم رقمٌ تقرّره أنت، لا نسبة تُشتق منه.
                      </>
                    ) : null}
                  </HelpTip>
                </Label>
                <input
                  id="failure_deduct"
                  name="deduct_amount"
                  type="number"
                  inputMode="decimal"
                  dir="ltr"
                  step="0.01"
                  min="0"
                  placeholder="مع «خصم» فقط"
                  className={controlClass}
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="failure_note" className="flex items-center gap-1.5">
                المبرر
                <HelpTip>
                  إلزامي متى خالف اختيارك المقترحَ — والقيد في قاعدة البيانات نفسها لا في
                  هذه الشاشة: السجل لا يقبل تجاوزاً بلا سبب مكتوب. ويُسجَّل كذلك في سجل
                  الحجز أسفل الصفحة فيقرؤه من يراجع لاحقاً.
                </HelpTip>
              </Label>
              <input
                id="failure_note"
                name="failure_note"
                className={controlClass}
                placeholder="سبب مخالفة المقترح — إلزامي عند التجاوز"
              />
            </div>

            <div className="flex flex-wrap items-center gap-3">
              <Button type="submit" variant="destructive">
                <AlertTriangle />
                تأكيد: الرحلة فاشلة
              </Button>
              <Link
                href={`/admin/orders/${booking.id}#actions`}
                className="text-sm text-muted-foreground transition-colors hover:text-foreground hover:underline"
              >
                تراجع
              </Link>
            </div>
          </form>
        ) : (
          <div className="flex flex-wrap items-center gap-2">
            <Link
              href={`/admin/orders/${booking.id}?confirm=failed#actions`}
              className="inline-flex items-center gap-1.5 rounded-lg border border-red-300 px-3 py-1.5 text-sm text-red-700 transition-colors hover:bg-red-50 dark:border-red-800 dark:text-red-300 dark:hover:bg-red-950"
            >
              <AlertTriangle className="size-4" />
              تعليم الرحلة فاشلة
            </Link>
            <HelpTip>
              للرحلة التي لم تُنفَّذ: السائق لم يحضر، أو تعطّلت السيارة، أو لم يحضر العميل.
              وهي <span className="font-semibold">ليست إلغاءً</span> — الإلغاء يقع قبل
              التنفيذ، والفشل بعد أن صار للرحلة منفِّذ، فلكلٍّ أثرٌ مالي مختلف عليه.
              {booking.status === "completed" && reclassDeadline ? (
                <>
                  {" "}
                  وهذه رحلة مكتملة: النافذة مفتوحة حتى{" "}
                  <span className="font-semibold">{dateTimeLabel(reclassDeadline)}</span>.
                </>
              ) : null}
            </HelpTip>
          </div>
        )}
      </Card>

      {/*
        سجل الحالة — تاريخ الحجز على الشاشة لا على الورق: من يمسك ورقة التشغيل
        يريد ما ينفّذه الآن، ومن يحقق في حادثة يفتح الشاشة أو `/admin/logs`.
      */}
      <Card className="no-print space-y-4 p-5">
        <h3 className="flex items-center gap-1.5 font-heading text-base font-bold">
          سجل الحجز
          <HelpTip>
            كل تغيير حالة يُسجَّل هنا بوقته وسببه — مرجعك عند أي خلاف مع عميل أو مراجعة مالية.
            السجل يُكتب داخل قاعدة البيانات مع التغيير نفسه فلا يمكن أن يتناقض معه.
          </HelpTip>
        </h3>

        {eventsFailed ? (
          <p className="text-sm text-muted-foreground">
            تعذر قراءة السجل — تأكد أن جدول <code dir="ltr">booking_events</code> منفَّذ في قاعدة
            البيانات (هجرة المرحلة ٤).
          </p>
        ) : events.length === 0 ? (
          <p className="text-sm text-muted-foreground">لا توجد أحداث مسجّلة لهذا الحجز بعد.</p>
        ) : (
          <ol className="relative space-y-4 border-s border-border ps-5">
            {events.map((event) => (
              <li key={event.key} className="relative">
                <span className="absolute -start-[1.6rem] top-1.5 size-2.5 rounded-full bg-primary" />
                <p className="text-sm font-medium">{event.label}</p>
                <p className="text-xs text-muted-foreground">
                  {dateTimeLabel(event.createdAt)} · {relativeTime(event.createdAt)}
                  {event.actorLabel ? ` · ${event.actorLabel}` : ""}
                </p>
                {event.note && (
                  <p className="mt-0.5 text-sm leading-relaxed text-muted-foreground">
                    {event.note}
                  </p>
                )}
              </li>
            ))}
          </ol>
        )}
        <p className="text-xs text-muted-foreground">
          عدد الأحداث: {toArabicDigits(events.length)}
        </p>
      </Card>
    </div>
  );
}
