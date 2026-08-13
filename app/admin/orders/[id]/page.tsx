import type { ReactNode } from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import {
  Ban,
  CheckCircle2,
  Coins,
  ExternalLink,
  FileText,
  MapPin,
  MessageCircle,
  Phone,
  ReceiptText,
  Wallet,
  XCircle,
} from "lucide-react";

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
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import type { TripSnapshot } from "@/lib/booking-types";
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
  isBookingStatus,
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
import { cancelBooking, changeStatus, verifyTransfer } from "./actions";

/**
 * تفاصيل الطلب — شاشة عمل التشغيل على حجز واحد:
 * لقطة الرحلة، تواصل العميل، تفصيل السعر، الإيصالات، سجل الحالة، ثم الإجراءات.
 *
 * أمن الإيصالات (قاعدة المرحلة ٤): مخزن `receipts` خاص ولا يُقرأ إلا بالخدمة —
 * لا يظهر مسار الملف في الصفحة إطلاقاً، بل رابط مُوقَّع عمره ٥ دقائق يُنشأ هنا في الخادم.
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
  amount: number | null;
  accountId: string | null;
  status: string | null;
  note: string | null;
  createdAt: string | null;
  receiptUrl: string | null;
  receiptIsImage: boolean;
  receiptMissing: boolean;
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

async function loadOrder(id: string): Promise<{
  ready: boolean;
  booking: Booking | null;
  payments: Payment[];
  paymentsFailed: boolean;
  events: EventRow[];
  eventsFailed: boolean;
  accounts: Map<string, Account>;
  subcontractorName: string | null;
  /** العرض `v_booking_profit` مقروء — أي أن هجرة المرحلة ٧ مطبَّقة */
  profitReady: boolean;
  profit: BookingProfit | null;
}> {
  const blank = {
    ready: false,
    booking: null,
    payments: [] as Payment[],
    paymentsFailed: false,
    events: [] as EventRow[],
    eventsFailed: false,
    accounts: new Map<string, Account>(),
    subcontractorName: null as string | null,
    profitReady: false,
    profit: null as BookingProfit | null,
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

  const [paymentsRes, eventsRes, accountsRes, subcontractorName, profitRes] = await Promise.all([
    supabase.from("payments").select("*").eq("booking_id", id),
    supabase.from("booking_events").select("*").eq("booking_id", id),
    supabase.from("payment_accounts").select("id, label, kind, handle"),
    resolveSubcontractorName(booking.subcontractorId),
    loadBookingProfit(supabase, id),
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

  const payments: Payment[] = await Promise.all(
    sortedPayments.map(async (p, index) => {
      const path = asText(pick(p, ["receipt_path", "receipt", "path", "file_path"]));
      const signed = path ? await signReceipt(path) : null;
      return {
        key: asText(p.id) ?? `payment-${index}`,
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

  return {
    ready: true,
    booking,
    payments,
    paymentsFailed: Boolean(paymentsRes.error),
    events,
    eventsFailed: Boolean(eventsRes.error),
    accounts,
    subcontractorName,
    profitReady: profitRes.viewReady,
    profit: profitRes.profit,
  };
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

/** رقم موبايل بصيغة رابط اتصال — الأرقام تُعرض ltr دائماً */
function ContactLinks({ phone, whatsapp }: { phone: string | null; whatsapp: string | null }) {
  const digits = (v: string) => v.replace(/[^\d+]/g, "");
  const waNumber = whatsapp ? digits(whatsapp).replace(/^\+/, "") : null;
  return (
    <span className="flex flex-wrap items-center gap-2">
      {phone && (
        <a
          href={`tel:${digits(phone)}`}
          className="inline-flex items-center gap-1 rounded-lg border border-border px-2 py-1 text-xs transition-colors hover:border-primary hover:text-primary"
        >
          <Phone className="size-3.5" />
          <span dir="ltr">{phone}</span>
        </a>
      )}
      {waNumber && (
        <a
          href={`https://wa.me/${waNumber}`}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1 rounded-lg border border-emerald-300 px-2 py-1 text-xs text-emerald-800 transition-colors hover:bg-emerald-50 dark:border-emerald-700 dark:text-emerald-200 dark:hover:bg-emerald-950"
        >
          <MessageCircle className="size-3.5" />
          واتساب
        </a>
      )}
      {!phone && !waNumber && <span className="text-sm text-muted-foreground">—</span>}
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
    events,
    eventsFailed,
    accounts,
    subcontractorName,
    profitReady,
    profit,
  } = await loadOrder(id);
  if (ready && !booking) notFound();

  const wired = hasSupabaseEnv();
  const savedCode = typeof sp.saved === "string" ? sp.saved : null;
  const error = typeof sp.error === "string" ? sp.error : null;
  const confirmingCancel = sp.confirm === "cancel";
  const confirmingAssign = sp.confirm === "assign";

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
  const cancelled = booking.status === "cancelled";
  // `verify_payment` ترفض أي حالة غير «قيد المراجعة» وترفض غياب إيصال pending —
  // فإظهار الزرين في «بانتظار الدفع» كان وعداً كاذباً ينتهي برسالة خطأ.
  const canVerify = booking.status === "under_review";

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      {/* الترويسة: الرقم المرجعي والحالة ورابط صفحة المتابعة التي يراها العميل */}
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="font-heading text-lg font-bold" dir="ltr">
          {booking.reference}
        </h2>
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
          <Row label="نوع الرحلة">{trip.roundTrip ? "ذهاب وعودة" : "اتجاه واحد"}</Row>
          <Row label="الانتظار">
            {typeof trip.waitingHours === "number" && trip.waitingHours > 0
              ? hoursText(trip.waitingHours)
              : "بدون انتظار"}
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
          */}
          <Card className="space-y-1 p-5">
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
        الحساب الفعلي — بعد بطاقة السعر مباشرة لأنه جوابها الواقعي: تلك تقول
        «كم طُلب»، وهذه تقول «كم دخل ومن يمسك الباقي».
      */}
      <BookingAccountingCard
        profit={profit}
        profitReady={profitReady}
        currency={booking.currency}
        subcontractorId={booking.subcontractorId}
      />

      {/* المدفوعات والإيصالات */}
      <Card className="space-y-4 p-5">
        <div>
          <h3 className="flex items-center gap-1.5 font-heading text-base font-bold">
            <FileText className="size-4 text-primary" />
            التحويلات والإيصالات
            <HelpTip>
              كل إيصال يرفعه العميل يظهر هنا. الصور محفوظة في مخزن خاص لا يُقرأ من الإنترنت:
              ما تراه رابط مؤقت صالح ٥ دقائق فقط يُنشأ عند فتح الصفحة، وينتهي بعدها تلقائياً.
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
            لم يرفع العميل أي إيصال بعد — الحجز ينتظر التحويل.
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
        currency={booking.currency}
        confirmingAssign={confirmingAssign}
      />

      {/* الإجراءات */}
      <Card className="space-y-4 p-5" id="actions">
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
      </Card>

      {/* سجل الحالة */}
      <Card className="space-y-4 p-5">
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
