import Link from "next/link";
import {
  CalendarClock,
  ExternalLink,
  Luggage,
  MapPin,
  MessageCircle,
  MessageSquareQuote,
  Phone,
  Ticket,
  Users,
} from "lucide-react";

import { toArabicDigits } from "@/components/booking/format";
import { HelpTip } from "@/components/shared/HelpTip";
import { PagePulse } from "@/components/stats/page-pulse";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { QUOTE_STATUS_TRANSITIONS, type QuoteRequestStatus } from "@/lib/booking-types";
import { telLink, waLink } from "@/lib/phone";
import { SERVICES } from "@/lib/site-config";
import { readPagePulse, type PagePulseData } from "@/lib/stats/pulse";
import { createServerSupabase } from "@/lib/supabase/server";
import { cn } from "@/lib/utils";
import {
  asText,
  Banners,
  COMMON_BOOKING_ERRORS,
  controlClass,
  dateTimeLabel,
  relativeTime,
} from "../orders/_components/booking-ui";
import { convertQuoteRequest, setQuoteStatus } from "./actions";

/**
 * طلبات الأسعار — نموذج «اطلب عرض سعر» للجولات والمناسبات وما هو خارج التسعير الفوري.
 *
 * ══════════════════════════════════════════════════════════════════════════
 *  ب‑٣ — «حوّله إلى حجز» صار يُنشئ حجزاً، وكان يُلصق وسماً
 * ══════════════════════════════════════════════════════════════════════════
 *
 * حتى 0084 كان الزرّ ينادي `set_quote_request_status(id,'converted')`: نصٌّ
 * يتبدّل في عمود، ولا حجز في أي مكان — فالمالك يُعيد إدخال الرحلة يدوياً في
 * `/book`، أو لا يُدخلها فيبقى مالٌ متّفقٌ عليه بلا صفٍّ يحمله. والآن ينادي
 * `convert_quote_request` (هجرة 0088) فيُنشئ الحجز ويربط الصفّين في معاملةٍ
 * واحدة، ويعطي العميل **رابط دفعٍ هو صفحة حجزه نفسها** (‏`public_token`) لا
 * سطحَ مصادقةٍ ثانياً.
 *
 * 🔴 **والحقول الثلاثة في النموذج ليست بيروقراطية** — كلٌّ منها يسدّ ثغرة:
 *   · **فئة السيارة** — الحجز صفٌّ بفئةٍ واحدة، ومنها تُقرأ سعتها وتعريفتها.
 *   · **أساس التكلفة** — بلا رقمٍ يُطرح من السعر لا يوجد هامشٌ تقيسه الأرضية،
 *     والقاعدة **ترفض** الفراغ ولا تخترع رقماً (لو اشتقّته من السعر لصار
 *     الحاجز يقيس الرقم بنفسه فلا يكشف خسارةً أبداً).
 *   · **الوجهة** — صفحة الحجز تطبع «من ← إلى»، وسطرٌ نصفه فارغ عطلٌ يراه العميل.
 *
 * ⚠ ولا حساب مالٍ في هذا الملف: أرضية الهامش تُفحص في `convert_quote_request`
 * وحدها (D-05 · D-16)، والشاشة تعرض الرفض ورقمَه ولا تعيد حسابه.
 *
 * ══════════════════════════════════════════════════════════════════════════
 *  ما تغيّر في ب‑١: الشاشة تعرض **رحلةً** لا فقرةً
 * ══════════════════════════════════════════════════════════════════════════
 *
 * كان الصف يحمل اسماً ورقماً وفقرةً حرّة، فيقرأ الموظف نصّاً ويعيد سؤال العميل
 * عمّا كتبه. صار يحمل نقطتين وموعداً وعدداً — أي ما يكفي لتسعير المكالمة قبل
 * إجرائها. والملاحظات الحرّة بقيت **مكمّلاً** لا مصدراً.
 *
 * ودورة الحياة صارت آلةً تحرسها القاعدة بمُشغّل (هجرة 0084):
 *
 *     جديد ──► مسعَّر ──► محوَّل        (نهائية: الحجز أُنشئ)
 *       │        │
 *       └────────┴──► مرفوض ──► جديد   (إعادة فتح)
 *
 * 🔒 والشاشة تعرض **المسموح من الحالة الراهنة وحده** — لا قائمةً بأربع حالات
 * ثلاثٌ منها تُرفض عند الحفظ. وهو نمطٌ مدفوع الثمن في هذا المستودع: شاشةٌ تقدّم
 * الخيار المستحيل بنفسها ثم تلوم المستخدم عليه. والقاعدة تبقى الحارس على أي حال.
 *
 * الترشيح والعدّ داخل Postgres (شرط + COUNT) لا في الواجهة.
 */

export const metadata = { title: "طلبات الأسعار" };

const hasSupabaseEnv = () =>
  Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);

const STATUS_LABELS: Record<QuoteRequestStatus, string> = {
  new: "جديد",
  quoted: "مسعَّر",
  converted: "محوَّل",
  rejected: "مرفوض",
};

/** فعلُ الانتقال كما يقرؤه المالك على الزر — لا اسم الحالة مجرَّداً */
const TRANSITION_LABELS: Record<QuoteRequestStatus, string> = {
  new: "أعِد فتحه",
  quoted: "سجّل التسعيرة",
  converted: "حوّله إلى حجز",
  rejected: "ارفضه",
};

const STATUS_TONE: Record<QuoteRequestStatus, string> = {
  new: "border-amber-300 bg-amber-100 text-amber-900 dark:border-amber-700 dark:bg-amber-950 dark:text-amber-100",
  quoted:
    "border-sky-300 bg-sky-100 text-sky-900 dark:border-sky-700 dark:bg-sky-950 dark:text-sky-100",
  converted:
    "border-emerald-300 bg-emerald-100 text-emerald-900 dark:border-emerald-700 dark:bg-emerald-950 dark:text-emerald-100",
  rejected:
    "border-border bg-muted text-muted-foreground dark:border-border dark:bg-muted dark:text-muted-foreground",
};

const TABS: { key: string; label: string; status: QuoteRequestStatus | null }[] = [
  { key: "all", label: "الكل", status: null },
  { key: "new", label: STATUS_LABELS.new, status: "new" },
  { key: "quoted", label: STATUS_LABELS.quoted, status: "quoted" },
  { key: "converted", label: STATUS_LABELS.converted, status: "converted" },
  { key: "rejected", label: STATUS_LABELS.rejected, status: "rejected" },
];

const MAX_ROWS = 200;

/** أسماء الخدمات للعرض — الطلب يحمل slug الخدمة التي جاء منها */
const SERVICE_TITLES = new Map(SERVICES.map((s) => [s.slug, s.title]));

type QuoteRow = {
  id: string;
  reference: string;
  serviceSlug: string | null;
  customerName: string | null;
  customerPhone: string | null;
  details: string | null;
  status: QuoteRequestStatus | null;
  createdAt: string | null;
  originLabel: string | null;
  destLabel: string | null;
  pickupAt: string | null;
  passengers: number | null;
  luggage: number | null;
  quotedAmount: number | null;
  adminNote: string | null;
  /** ب‑٣ — الحجز الذي نشأ من الطلب (‏`quote_requests.booking_id`، هجرة 0088) */
  bookingId: string | null;
};

/** فئة سيارة كما تصل النموذج — السعتان تُعرضان لأن القاعدة ترفض ما لا يتسع */
type ClassOption = {
  slug: string;
  title: string;
  capacity: number;
  luggageCapacity: number;
};

/** متعهد لاختيارٍ اختياري: «مَن بُني عليه أساس التكلفة» لا «مَن أُسند إليه» */
type PartnerOption = { id: string; name: string };

/** الحجز المرتبط — مرجعه وحالته ورابط متابعة العميل (وهو رابط الدفع نفسه) */
type BookingLink = {
  id: string;
  reference: string | null;
  publicToken: string | null;
  status: string | null;
  total: number | null;
};

const isStatus = (v: unknown): v is QuoteRequestStatus =>
  v === "new" || v === "quoted" || v === "converted" || v === "rejected";

const asNumber = (v: unknown): number | null => {
  if (v === null || v === undefined) return null;
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : null;
};

async function loadRequests(status: QuoteRequestStatus | null): Promise<{
  requests: QuoteRow[];
  counts: Record<string, number | null>;
  ready: boolean;
  pulse: PagePulseData | null;
  classes: ClassOption[];
  partners: PartnerOption[];
  bookings: Map<string, BookingLink>;
}> {
  const blank = {
    requests: [] as QuoteRow[],
    counts: {},
    ready: false,
    pulse: null,
    classes: [] as ClassOption[],
    partners: [] as PartnerOption[],
    bookings: new Map<string, BookingLink>(),
  };

  const supabase = await createServerSupabase();
  if (!supabase) return blank;

  // العدّ داخل Postgres عبر COUNT — لا عدّ لمصفوفات في الواجهة
  const countOf = async (tabStatus: QuoteRequestStatus | null) => {
    let q = supabase.from("quote_requests").select("id", { count: "exact", head: true });
    if (tabStatus) q = q.eq("status", tabStatus);
    const { count, error } = await q;
    return error ? null : (count ?? 0);
  };

  let listQuery = supabase
    .from("quote_requests")
    // ⚠ سلسلة نصّية **واحدة** لا مجموعة مقاطع: `supabase-js` يُعرب هذا النص على
    //   مستوى الأنواع، ووصلُ مقطعين بـ`+` يُفقده الحرفية فيسقط الاستدلال كله.
    .select(
      "id, reference, service_slug, customer_name, customer_phone, details, status, created_at, origin_label, dest_label, pickup_at, passengers, luggage, quoted_amount, admin_note, booking_id"
    )
    .order("created_at", { ascending: false })
    .limit(MAX_ROWS);
  if (status) listQuery = listQuery.eq("status", status);

  // نبض الشاشة والفئات والمتعهدون يُقرأون مع الجدول في نفس الجولة — لا انتظار متتابعاً
  //
  // ⚠ والفئات تُقرأ من القاعدة لا من ثابتٍ في الكود: هي مصدر السعة التي ترفض
  //   بها `convert_quote_request`، فقائمةٌ ثانية في الواجهة تعني خياراً يُعرض
  //   ثم يُرفض عند الحفظ.
  const [listRes, countsRes, pulse, classesRes, partnersRes] = await Promise.all([
    listQuery,
    Promise.all(TABS.map((tab) => countOf(tab.status))),
    readPagePulse(supabase, "/admin/quote-requests"),
    supabase
      .from("vehicle_classes")
      .select("slug, title, capacity, luggage_capacity")
      .eq("active", true)
      .order("capacity", { ascending: true }),
    supabase
      .from("subcontractors")
      .select("id, company_name")
      .eq("status", "approved")
      .order("company_name", { ascending: true }),
  ]);

  if (listRes.error) return blank;

  const counts: Record<string, number | null> = {};
  TABS.forEach((tab, i) => {
    counts[tab.key] = countsRes[i] ?? null;
  });

  const requests = ((listRes.data ?? []) as Record<string, unknown>[]).map((row) => ({
    id: String(row.id),
    reference: asText(row.reference) ?? "—",
    serviceSlug: asText(row.service_slug),
    customerName: asText(row.customer_name),
    customerPhone: asText(row.customer_phone),
    details: asText(row.details),
    status: isStatus(row.status) ? row.status : null,
    createdAt: asText(row.created_at),
    originLabel: asText(row.origin_label),
    destLabel: asText(row.dest_label),
    pickupAt: asText(row.pickup_at),
    passengers: asNumber(row.passengers),
    luggage: asNumber(row.luggage),
    quotedAmount: asNumber(row.quoted_amount),
    adminNote: asText(row.admin_note),
    bookingId: asText(row.booking_id),
  }));

  const classes: ClassOption[] = ((classesRes.data ?? []) as Record<string, unknown>[]).map(
    (row) => ({
      slug: String(row.slug),
      title: asText(row.title) ?? String(row.slug),
      capacity: asNumber(row.capacity) ?? 0,
      luggageCapacity: asNumber(row.luggage_capacity) ?? 0,
    })
  );

  const partners: PartnerOption[] = ((partnersRes.data ?? []) as Record<string, unknown>[]).map(
    (row) => ({ id: String(row.id), name: asText(row.company_name) ?? "—" })
  );

  // الحجوزات المرتبطة — استعلامٌ مستقل لا embed: الاعتماد على اسم العلاقة في
  // PostgREST يجعل الشاشة كلها تسقط لو تعدّدت المفاتيح الأجنبية يوماً.
  const bookings = new Map<string, BookingLink>();
  const linkedIds = requests.map((r) => r.bookingId).filter((id): id is string => Boolean(id));
  if (linkedIds.length > 0) {
    const { data } = await supabase
      .from("bookings")
      .select("id, reference, public_token, status, total")
      .in("id", linkedIds);
    for (const row of (data ?? []) as Record<string, unknown>[]) {
      bookings.set(String(row.id), {
        id: String(row.id),
        reference: asText(row.reference),
        publicToken: asText(row.public_token),
        status: asText(row.status),
        total: asNumber(row.total),
      });
    }
  }

  return { requests, counts, ready: true, pulse, classes, partners, bookings };
}

/**
 * رمز الرابط ← جملةٌ عربية. والنصوص تعيش **هنا وحدها**: الخادم يرسل رمزاً لا
 * جملة، ورقمُ الأرضية وحده يسافر بياناً في `min` فتُبنى حوله الجملة.
 */
function errorMessages(floorMin: string | null): Record<string, string> {
  return {
    ...COMMON_BOOKING_ERRORS,
    status: "حالة غير معروفة — اختر واحدة من حالات المتابعة الأربع.",
    transition:
      "هذا الانتقال غير مسموح من الحالة الحالية. حدّث الصفحة — الأرجح أن زميلاً غيّر الحالة قبلك.",
    amount: "التسعير يحتاج مبلغاً موجباً — اكتب السعر الذي عرضته على العميل.",
    missing: "الطلب لم يعد موجوداً.",
    nochange: "الطلب في هذه الحالة بالفعل.",
    forbidden: "هذه العملية للمشرف وحده.",
    useconvert: "التحويل إلى حجز يمرّ بنموذج «حوّله إلى حجز» — حدّث الصفحة وأعِد المحاولة.",

    // ب‑٣ — رفض التحويل
    notquoted: "التحويل يبدأ من حالة «مسعَّر» وحدها. حدّث الصفحة — الأرجح أن الحالة تغيّرت.",
    already: "هذا الطلب محوَّلٌ سلفاً وله حجزٌ قائم — لا يُحوَّل مرتين.",
    noorigin:
      "هذا طلبٌ قديم بلا نقطة انطلاق محدَّدة بإحداثياتها، ولا يُنشأ منه حجز. اطلب من العميل إرسال طلبٍ جديد من الصفحة.",
    nopickup: "الطلب بلا موعد — ولا يُنشأ حجزٌ بلا موعد.",
    pastpickup: "موعد الرحلة مضى. لا يُحوَّل طلبٌ انطلاقه في الماضي.",
    classunknown: "اختر فئة سيارة مفعَّلة.",
    classsmall: "الفئة المختارة لا تتسع لعدد ركاب الطلب أو حقائبه — اختر فئةً أكبر.",
    costrequired:
      "أساس التكلفة مطلوب: اكتب ما ستدفعه للمنفِّذ. بدونه لا يوجد هامشٌ يُقاس، ولا تستطيع القاعدة أن تكشف بيعاً بخسارة.",
    costnegative: "أساس التكلفة لا يكون سالباً.",
    costrange: "أساس التكلفة أكبر من أن يكون رقماً حقيقياً — راجع ما كتبته.",
    floor: floorMin
      ? `🔴 السعر المعروض دون أرضية الهامش على التكلفة التي أدخلتها. أدنى إجمالٍ مقبول ${toArabicDigits(floorMin)} ج.م — ارفع السعر أو راجع التكلفة.`
      : "🔴 السعر المعروض دون أرضية الهامش على التكلفة التي أدخلتها — ارفع السعر أو راجع التكلفة.",
    nopartner: "المتعهد المختار لم يعد موجوداً — حدّث الصفحة.",
    nodest: "اكتب وجهة الرحلة كما اتُّفق عليه — صفحة الحجز تطبع «من ← إلى».",
  };
}

/**
 * رقم صاحب طلب عرض السعر — أسوأ النسخ الأربع أثراً، وهنا سبب ذلك.
 *
 * ⚠ هذه الشاشة **بلا شرط على الواتساب أصلاً**: الحقل واحد (`customer_phone`)
 * وكان الزران يُبنيان منه معاً، فرابط واتساب يخرج **لكل صف بلا استثناء**. والقاعدة
 * الحية: ٣٠ من ٣٠ طلباً بصفرٍ بادئ ⇒ `wa.me/01229674663` في كل واحد منها، أي
 * أن **الشاشة كلها** كانت أزرارَ خطأ. وهي شاشة طلبات لم تُسعَّر بعد — أي أن كل
 * زرٍّ منها مبيعٌ محتمل يسقط عند أول نقرة.
 *
 * والرقم يبقى معروضاً حتى لو تعذّر بناء أيٍّ من الرابطين — الموظف يقرؤه ويطلبه
 * بيده، وهذا خيرٌ من زرٍّ يَعِد ولا يفي.
 */
function ContactLinks({ phone }: { phone: string | null }) {
  if (!phone) return <span className="text-xs text-muted-foreground">بلا رقم</span>;
  const tel = telLink(phone);
  const wa = waLink(phone);
  return (
    <span className="flex flex-wrap items-center gap-2">
      {tel ? (
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
      )}
      {wa ? (
        <a
          href={wa}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1 rounded-lg border border-emerald-300 px-2 py-1 text-xs text-emerald-800 transition-colors hover:bg-emerald-50 dark:border-emerald-700 dark:text-emerald-200 dark:hover:bg-emerald-950"
        >
          <MessageCircle className="size-3.5" />
          واتساب
        </a>
      ) : null}
    </span>
  );
}

/** سطر من الرحلة — أيقونة وقيمة، ويغيب كاملاً إن غابت قيمته */
function TripFact({
  icon: Icon,
  label,
  value,
}: {
  icon: typeof MapPin;
  label: string;
  value: string | null;
}) {
  if (!value) return null;
  return (
    <span className="inline-flex items-center gap-1.5 text-sm">
      <Icon className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
      <span className="text-muted-foreground">{label}:</span>
      <span className="font-medium">{value}</span>
    </span>
  );
}

/**
 * الحجز الذي نشأ من الطلب — مرجعُه ورابطان.
 *
 * 🔒 **ورابط الدفع هو صفحة متابعة العميل نفسها** (`/booking/<token>`)، لا سطحٌ
 * ثانٍ: التوكن ١٩٢ بتاً، و`get_booking_by_token` **تُقنِّع الهاتف والواتساب**
 * منذ 0049 لأن هذه الروابط تُعاد إرسالها إلى زوجٍ أو سائق أو مجموعة عمل.
 */
function BookingLinkPanel({ booking }: { booking: BookingLink }) {
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-2 rounded-lg border border-emerald-300 bg-emerald-50/60 p-3 text-sm dark:border-emerald-800 dark:bg-emerald-950/40">
      <span className="inline-flex items-center gap-1.5 font-medium">
        <Ticket className="size-4 shrink-0 text-emerald-700 dark:text-emerald-300" />
        الحجز
        <span dir="ltr">{booking.reference ?? "—"}</span>
      </span>
      {booking.total !== null && (
        <span className="text-muted-foreground">{toArabicDigits(booking.total)} ج.م</span>
      )}
      <Link
        href={`/admin/orders/${booking.id}`}
        className="inline-flex items-center gap-1 transition-colors hover:text-primary hover:underline"
      >
        <ExternalLink className="size-3.5" />
        افتح الطلب في اللوحة
      </Link>
      {booking.publicToken && (
        <Link
          href={`/booking/${booking.publicToken}`}
          target="_blank"
          className="inline-flex items-center gap-1 transition-colors hover:text-primary hover:underline"
        >
          <ExternalLink className="size-3.5" />
          رابط الدفع للعميل
        </Link>
      )}
      <HelpTip>
        رابط الدفع هو صفحة متابعة الحجز نفسها — أرسله للعميل واتساباً. وهو{" "}
        <span className="font-semibold">قابلٌ للتحويل</span>: من يحمله يرى الرحلة والمبلغ،
        ورقمُ الهاتف فيه مقنَّع، ولا يظهر فيه أي رقم داخلي (تكلفة أو هامش).
      </HelpTip>
    </div>
  );
}

/**
 * نموذج التحويل — ثلاثة حقول مطلوبة ورابعٌ اختياري.
 *
 * ⚠ ولا حساب هنا: الأرضية والأهلية والموعد كلها في `convert_quote_request`.
 * والقائمة تُبنى من `vehicle_classes` نفسها التي ترفض بها القاعدة، فلا يُعرض
 * خيارٌ سيُرفض عند الحفظ — والفئة التي لا تتسع **معطَّلةٌ بسبب مكتوب** لا مخفيّة،
 * فيعرف المالك لماذا لا تصلح بدل أن يبحث عنها.
 */
function ConvertForm({
  request,
  tabKey,
  readOnly,
  classes,
  partners,
}: {
  request: QuoteRow;
  tabKey: string;
  readOnly: boolean;
  classes: ClassOption[];
  partners: PartnerOption[];
}) {
  const pax = Math.max(request.passengers ?? 1, 1);
  const bags = Math.max(request.luggage ?? 0, 0);
  const fits = (option: ClassOption) => option.capacity >= pax && option.luggageCapacity >= bags;
  const smallestFitting = classes.find(fits) ?? null;
  const anyFits = smallestFitting !== null;

  return (
    <form
      action={readOnly ? undefined : convertQuoteRequest.bind(null, request.id)}
      className="space-y-3 rounded-lg border border-primary/40 bg-primary/5 p-4"
    >
      <input type="hidden" name="tab" value={tabKey === "all" ? "" : tabKey} />

      <p className="flex items-center gap-1.5 text-sm font-semibold">
        حوّله إلى حجز
        <HelpTip>
          يُنشئ حجزاً حقيقياً بالسعر الذي عرضته، ويعطيك رابط دفعٍ ترسله للعميل. لا يعيد
          العميل إدخال شيء. والحجز يُكنس تلقائياً إن لم يُدفع، كأي حجزٍ آخر.
        </HelpTip>
      </p>

      {!anyFits && (
        <p className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm leading-relaxed text-amber-900 dark:border-amber-700 dark:bg-amber-950 dark:text-amber-100">
          لا فئة واحدة تتسع لـ{toArabicDigits(pax)} راكباً و{toArabicDigits(bags)} حقيبة.
          الحجز صفٌّ بفئةٍ واحدة، فرحلةٌ تحتاج سيارتين تُقسَّم إلى حجزين — أو تُضاف فئةٌ أكبر
          من <span dir="ltr">/admin/pricing</span>.
        </p>
      )}

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1.5">
          <label
            htmlFor={`class-${request.id}`}
            className="flex items-center gap-1.5 text-sm font-medium leading-none"
          >
            فئة السيارة
            <HelpTip>
              منها تُقرأ سعة الركاب والحقائب وأرضية سعر الفئة. والقاعدة ترفض فئةً لا تتسع
              للطلب — نفس الشرط الذي يفرضه محرّك التسعير على الحجز العادي.
            </HelpTip>
          </label>
          <select
            id={`class-${request.id}`}
            name="classSlug"
            required
            defaultValue={smallestFitting?.slug ?? ""}
            disabled={readOnly || !anyFits}
            className={cn(controlClass, "w-full")}
          >
            <option value="" disabled>
              اختر فئة…
            </option>
            {classes.map((option) => (
              <option key={option.slug} value={option.slug} disabled={!fits(option)}>
                {option.title} — {toArabicDigits(option.capacity)} راكباً ·{" "}
                {toArabicDigits(option.luggageCapacity)} حقيبة
                {fits(option) ? "" : " (لا تتسع)"}
              </option>
            ))}
          </select>
        </div>

        <div className="space-y-1.5">
          <label
            htmlFor={`cost-${request.id}`}
            className="flex items-center gap-1.5 text-sm font-medium leading-none"
          >
            أساس التكلفة (ما تدفعه للمنفِّذ)
            <HelpTip>
              🔴 <span className="font-semibold">مطلوب.</span> هذا الرقم هو ما يُطرح من
              السعر ليظهر الهامش، وبه وحده تعرف القاعدة أن السعر ليس بيعاً بخسارة. ولو
              تُرك فارغاً لاشتقّت القاعدة تكلفةً <span className="font-semibold">من السعر
              نفسه</span> — فيصير الحاجز يقيس الرقم بنفسه ولا يكشف شيئاً. وهو أيضاً سقفُ
              الموجة الأولى في البثّ: لا يصل العرضُ متعهّداً أغلى منه.
            </HelpTip>
          </label>
          <input
            id={`cost-${request.id}`}
            name="partnerCost"
            type="number"
            inputMode="decimal"
            min={0}
            step="0.01"
            required
            disabled={readOnly || !anyFits}
            className={cn(controlClass, "w-full")}
          />
        </div>

        <div className="space-y-1.5 sm:col-span-2">
          <label
            htmlFor={`dest-${request.id}`}
            className="flex items-center gap-1.5 text-sm font-medium leading-none"
          >
            وجهة الرحلة
            <HelpTip>
              صفحة الحجز تطبع «من ← إلى»، فالوجهة نصٌّ مطلوب. وللجولة اكتب آخر محطة أو
              نقطة العودة.
              {request.destLabel ? null : (
                <>
                  {" "}
                  ⚠ وهذا الطلب وصل <span className="font-semibold">بلا وجهة بإحداثياتها</span>،
                  فالبثّ الآلي لن يجد مساراً يقارنه بقوائم أسعار المتعهدين ويمضي الحجز إلى
                  الإسناد اليدوي — وهو الصواب لا نقص.
                </>
              )}
            </HelpTip>
          </label>
          <input
            id={`dest-${request.id}`}
            name="destLabel"
            type="text"
            maxLength={200}
            required
            defaultValue={request.destLabel ?? ""}
            disabled={readOnly || !anyFits}
            className={cn(controlClass, "w-full")}
          />
        </div>

        {partners.length > 0 && (
          <div className="space-y-1.5">
            <label
              htmlFor={`partner-${request.id}`}
              className="flex items-center gap-1.5 text-sm font-medium leading-none"
            >
              المنفِّذ الذي بنيت عليه التكلفة (اختياري)
              <HelpTip>
                يسجّل <span className="font-semibold">مَن سُعِّر على أساسه</span> لا مَن
                أُسند إليه — الإسناد يبقى للبثّ أو للإسناد اليدوي بعد الدفع.
              </HelpTip>
            </label>
            <select
              id={`partner-${request.id}`}
              name="subcontractorId"
              defaultValue=""
              disabled={readOnly || !anyFits}
              className={cn(controlClass, "w-full")}
            >
              <option value="">— بلا تحديد —</option>
              {partners.map((partner) => (
                <option key={partner.id} value={partner.id}>
                  {partner.name}
                </option>
              ))}
            </select>
          </div>
        )}

        <div className="space-y-1.5">
          <label
            htmlFor={`convert-note-${request.id}`}
            className="flex items-center gap-1.5 text-sm font-medium leading-none"
          >
            ملاحظة داخلية (اختياري)
            <HelpTip>لا يراها العميل أبداً — ولا تدخل لقطة الحجز التي يقرؤها.</HelpTip>
          </label>
          <input
            id={`convert-note-${request.id}`}
            name="note"
            type="text"
            maxLength={2000}
            disabled={readOnly || !anyFits}
            className={cn(controlClass, "w-full")}
          />
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" disabled={readOnly || !anyFits}>
          أنشئ الحجز بسعر {request.quotedAmount === null ? "—" : toArabicDigits(request.quotedAmount)} ج.م
        </Button>
        <span className="text-xs text-muted-foreground">
          يُنشأ بدفعٍ كامل، ولا رجعة عن التحويل.
        </span>
      </div>
    </form>
  );
}

function RequestCard({
  request,
  tabKey,
  readOnly,
  classes,
  partners,
  booking,
}: {
  request: QuoteRow;
  tabKey: string;
  readOnly: boolean;
  classes: ClassOption[];
  partners: PartnerOption[];
  booking: BookingLink | null;
}) {
  const current = request.status ?? "new";

  /**
   * 🔒 المسموح من هنا وحده — لا قائمةٌ تعرض ما سترفضه القاعدة.
   *
   * ⚠ و**إعادة التسعير ليست انتقالاً**: الحالة تبقى «مسعَّر» ويتغيّر المبلغ، فلا
   * تظهر في جدول الانتقالات (ولا يستيقظ لها حارسُ الانتقال، بل فرعُ المبلغ في
   * المُشغّل الذي يُجدِّد `quoted_at`). ولولا هذا السطر لكان السعر يُكتب مرةً
   * واحدة بلا رجعة — والتفاوض على العرض هو الحالة الشائعة لا النادرة.
   */
  /**
   * 🔴 و**«محوَّل» خرجت من هذه القائمة** في ب‑٣: لم تبقَ نقلةَ حالة بل عملية
   * تُنشئ حجزاً، ولها نموذجها بحقوله. و`set_quote_request_status` تردّها برمز
   * `use-convert` — فزرٌّ لها هنا كان سيَعِد بما لا يفعل.
   */
  const actions: { status: QuoteRequestStatus; label: string; key: string }[] = [
    ...(current === "quoted"
      ? [{ status: "quoted" as QuoteRequestStatus, label: "عدّل التسعيرة", key: "requote" }]
      : []),
    ...(QUOTE_STATUS_TRANSITIONS[current] ?? [])
      .filter((next) => next !== "converted")
      .map((next) => ({
        status: next,
        label: TRANSITION_LABELS[next],
        key: next,
      })),
  ];
  const canConvert = current === "quoted";
  const terminal = actions.length === 0 && !canConvert;

  const route = request.originLabel
    ? request.destLabel
      ? `${request.originLabel} ← ${request.destLabel}`
      : `${request.originLabel} (بلا وجهة محددة)`
    : null;

  return (
    <Card className="space-y-3 p-5">
      <div className="flex flex-wrap items-center gap-2">
        <span dir="ltr" className="font-medium">
          {request.reference}
        </span>
        {request.status && (
          <Badge variant="outline" className={STATUS_TONE[request.status]}>
            {STATUS_LABELS[request.status]}
          </Badge>
        )}
        {request.serviceSlug && (
          <Badge variant="secondary">
            {SERVICE_TITLES.get(request.serviceSlug) ?? request.serviceSlug}
          </Badge>
        )}
        {request.quotedAmount !== null && (
          <Badge variant="outline" className="border-primary/40 text-primary">
            {toArabicDigits(request.quotedAmount)} ج.م
          </Badge>
        )}
        <span className="ms-auto text-xs text-muted-foreground">
          {relativeTime(request.createdAt)} · {dateTimeLabel(request.createdAt)}
        </span>
      </div>

      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <span className="font-medium">{request.customerName ?? "—"}</span>
        <ContactLinks phone={request.customerPhone} />
      </div>

      {/* الرحلة — ما يُسعَّر منه، قبل أي نصٍّ حر */}
      <div className="flex flex-wrap items-center gap-x-5 gap-y-2 rounded-lg bg-muted/40 p-3">
        <TripFact icon={MapPin} label="المسار" value={route} />
        <TripFact icon={CalendarClock} label="الموعد" value={dateTimeLabel(request.pickupAt)} />
        <TripFact
          icon={Users}
          label="الركاب"
          value={request.passengers === null ? null : toArabicDigits(request.passengers)}
        />
        <TripFact
          icon={Luggage}
          label="الحقائب"
          value={request.luggage === null ? null : toArabicDigits(request.luggage)}
        />
        {!route && !request.pickupAt && request.passengers === null ? (
          <span className="text-xs text-muted-foreground">
            طلب قديم بلا بيانات رحلة مُهيكلة — وصل قبل تحديث النموذج.
          </span>
        ) : null}
      </div>

      {request.details && (
        <p className="rounded-lg border border-border/60 p-3 text-sm leading-relaxed whitespace-pre-line">
          {request.details}
        </p>
      )}

      {request.adminNote && (
        <p className="rounded-lg border border-dashed border-border p-3 text-sm leading-relaxed text-muted-foreground whitespace-pre-line">
          <span className="font-medium">ملاحظة داخلية:</span> {request.adminNote}
        </p>
      )}

      {/* الحجز الذي نشأ من الطلب — قبل الإجراءات، فهو نتيجتها لا أحدها */}
      {booking && <BookingLinkPanel booking={booking} />}

      {current === "converted" && !booking && (
        <p className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900 dark:border-amber-700 dark:bg-amber-950 dark:text-amber-100">
          الطلب محوَّل ولم أستطع قراءة حجزه — حدّث الصفحة، فإن بقي فهو عطلٌ يستحق فحصاً.
        </p>
      )}

      {canConvert && (
        <div className="border-t border-border pt-3">
          <ConvertForm
            request={request}
            tabKey={tabKey}
            readOnly={readOnly}
            classes={classes}
            partners={partners}
          />
        </div>
      )}

      {terminal ? (
        <p className="text-xs text-muted-foreground">
          {current === "converted"
            ? "هذا الطلب تحوّل إلى حجز — وهي حالة نهائية لا رجعة منها. وإن لم يدفع العميل فالحجز يُلغى بالكنس، ولا يعود الطلب."
            : "لا انتقالات متاحة من هذه الحالة."}
        </p>
      ) : (
        <div className="flex flex-col gap-3 border-t border-border pt-3">
          {actions.map((action) => (
            <form
              key={action.key}
              action={readOnly ? undefined : setQuoteStatus.bind(null, request.id)}
              className="flex flex-wrap items-end gap-2"
            >
              <input type="hidden" name="tab" value={tabKey === "all" ? "" : tabKey} />
              <input type="hidden" name="status" value={action.status} />

              {action.status === "quoted" && (
                <div className="min-w-36 space-y-1.5">
                  <label
                    htmlFor={`amount-${request.id}-${action.key}`}
                    className="flex items-center gap-1.5 text-sm font-medium leading-none"
                  >
                    السعر المعروض
                    <HelpTip>
                      المبلغ الذي عرضته على العميل بالجنيه. بدونه لا تقوم حالة «مسعَّر» —
                      لأن طلباً بلا سعر يُحسب في معدل التحويل وهو لم يُعرض عليه شيء.
                    </HelpTip>
                  </label>
                  <input
                    id={`amount-${request.id}-${action.key}`}
                    name="amount"
                    type="number"
                    inputMode="decimal"
                    min={1}
                    step="0.01"
                    required
                    defaultValue={request.quotedAmount ?? ""}
                    disabled={readOnly}
                    className={cn(controlClass, "sm:w-40")}
                  />
                </div>
              )}

              <div className="min-w-40 flex-1 space-y-1.5">
                <label
                  htmlFor={`note-${request.id}-${action.key}`}
                  className="flex items-center gap-1.5 text-sm font-medium leading-none"
                >
                  ملاحظة داخلية (اختياري)
                  <HelpTip>
                    لا يراها العميل أبداً. اكتب فيها ما يحتاجه زميلك: سبب الرفض، أو ما اتُّفق
                    عليه في المكالمة.
                  </HelpTip>
                </label>
                <input
                  id={`note-${request.id}-${action.key}`}
                  name="note"
                  type="text"
                  maxLength={2000}
                  disabled={readOnly}
                  className={cn(controlClass, "w-full")}
                />
              </div>

              <Button
                type="submit"
                variant={action.status === "converted" ? "default" : "outline"}
                disabled={readOnly}
              >
                {action.label}
              </Button>
            </form>
          ))}
        </div>
      )}
    </Card>
  );
}

export default async function QuoteRequestsPage({
  searchParams,
}: PageProps<"/admin/quote-requests">) {
  const params = await searchParams;
  const rawTab = typeof params.status === "string" ? params.status : "all";
  const tab = TABS.find((t) => t.key === rawTab) ?? TABS[0];

  const { requests, counts, ready, pulse, classes, partners, bookings } = await loadRequests(
    tab.status
  );

  const wired = hasSupabaseEnv();
  const converted = params.converted === "1";
  const saved = params.saved === "1" || converted;
  const error = typeof params.error === "string" ? params.error : null;
  // رقمُ أرضية الهامش يصل بياناً في الرابط، والشاشة تبني الجملة حوله
  const floorMin =
    typeof params.min === "string" && /^\d{1,12}$/.test(params.min) ? params.min : null;

  const tabHref = (key: string) =>
    key === "all" ? "/admin/quote-requests" : `/admin/quote-requests?status=${key}`;

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div className="flex flex-wrap items-center gap-2">
        <MessageSquareQuote className="size-5 text-primary" />
        <h2 className="font-heading text-lg font-bold">طلبات الأسعار</h2>
        <HelpTip>
          هذه طلبات لا يغطيها التسعير الفوري: جولات ومناسبات وأفواج وطلبات خاصة. كل طلب يصل
          الآن بمساره وموعده وعدد ركابه — أي بما يكفي لتسعيره قبل الاتصال. سرعة الرد هنا هي
          الفارق بينكم وبين المنافس.
        </HelpTip>
      </div>

      <Banners
        wired={wired}
        readOnly={!ready}
        saved={saved}
        error={error}
        errorMessages={errorMessages(floorMin)}
        savedMessage={
          converted
            ? "أُنشئ الحجز. افتحه من بطاقة الطلب وأرسل رابط الدفع للعميل."
            : "حُدِّثت حالة الطلب."
        }
        readOnlyTitle="طلبات الأسعار غير جاهزة بعد"
        readOnlyBody={
          <p>
            قاعدة البيانات مربوطة لكن جدول <code dir="ltr">quote_requests</code> غير موجود —
            نفِّذ الهجرات من <code dir="ltr">supabase/migrations</code> ثم أعد تحميل الصفحة.
          </p>
        }
      />

      <PagePulse data={pulse} />

      <nav
        aria-label="ترشيح طلبات الأسعار بالحالة"
        className="grid grid-cols-2 gap-2 sm:grid-cols-5"
      >
        {TABS.map((item) => {
          const active = item.key === tab.key;
          const count = counts[item.key];
          return (
            <Link
              key={item.key}
              href={tabHref(item.key)}
              aria-current={active ? "page" : undefined}
              className={cn(
                "rounded-xl bg-card p-3 text-center ring-1 transition-colors",
                active ? "bg-primary/10 ring-2 ring-primary" : "ring-foreground/10 hover:bg-muted"
              )}
            >
              <span className="block text-xl font-bold" dir="ltr">
                {count === null ? "—" : toArabicDigits(count)}
              </span>
              <span className="block text-xs text-muted-foreground">{item.label}</span>
            </Link>
          );
        })}
      </nav>

      {ready && requests.length === 0 && (
        <Card className="p-5 text-sm text-muted-foreground">
          {tab.status
            ? `لا توجد طلبات في حالة «${tab.label}» حالياً.`
            : "لا توجد طلبات أسعار بعد — أول طلب يصل من صفحة «اطلب عرض سعر» سيظهر هنا."}
        </Card>
      )}

      {requests.map((request) => (
        <RequestCard
          key={request.id}
          request={request}
          tabKey={tab.key}
          readOnly={!ready}
          classes={classes}
          partners={partners}
          booking={request.bookingId ? (bookings.get(request.bookingId) ?? null) : null}
        />
      ))}

      {requests.length > 0 && (
        <p className="text-xs text-muted-foreground">
          المعروض {toArabicDigits(requests.length)} من الطلبات
          {requests.length === MAX_ROWS ? ` (أحدث ${toArabicDigits(MAX_ROWS)})` : ""}.
        </p>
      )}
    </div>
  );
}
