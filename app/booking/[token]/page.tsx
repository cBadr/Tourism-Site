import type { Metadata } from "next";
import { notFound } from "next/navigation";
import {
  BadgeCheck,
  Ban,
  CalendarClock,
  CircleCheck,
  Clock,
  Hourglass,
  Info,
  Landmark,
  Link2,
  MessageCircle,
  Phone,
  ReceiptText,
  Route as RouteIcon,
  ShieldCheck,
  TriangleAlert,
  Wallet,
} from "lucide-react";
import { getSettings } from "@/lib/settings";
import { getBaseUrl } from "@/lib/seo";
import { createServerSupabase } from "@/lib/supabase/server";
import { localePath } from "@/lib/i18n-types";
import { createFormatter, getT, resolveLocale, type Tx } from "@/lib/i18n/content";
import type { LocaleFormatter } from "@/components/booking/format";
import { telHref, waHref } from "@/components/site/links";
import { SiteHeader } from "@/components/site/header";
import { SiteFooter } from "@/components/site/footer";
import { WhatsAppFab } from "@/components/site/whatsapp-fab";
import { readPaymentSettings } from "@/components/booking/checkout/payment";
import { CopyButton } from "@/components/booking/checkout/copy-button";
import { readEnabledGateways } from "@/components/booking/checkout/gateways";
import {
  PaymentMethodChoice,
  type GatewayChoice,
} from "@/components/booking/checkout/payment-method";
import {
  ReceiptUpload,
  type ReceiptAccountOption,
} from "@/components/booking/checkout/receipt-upload";
import type { BookingStatus, ReceiptStatus } from "@/lib/booking-types";

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

const STATUS_VALUES: BookingStatus[] = [
  "pending_payment",
  "under_review",
  "confirmed",
  "assigned",
  "completed",
  "cancelled",
];

function readStatus(row: UnknownRow): BookingStatus {
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
  { key: "confirmed", label: "مؤكد", icon: BadgeCheck },
  { key: "completed", label: "منفذ", icon: CircleCheck },
] as const;

/** موضع كل حالة على المؤشر — «مُسند» يبقى ضمن مرحلة «مؤكد» في نظر العميل */
const STATUS_POSITION: Record<BookingStatus, number> = {
  pending_payment: 0,
  under_review: 1,
  confirmed: 2,
  assigned: 2,
  completed: 3,
  cancelled: -1,
};

function StatusStepper({ status, t }: { status: BookingStatus; t: Tx }) {
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

type PaymentAccountView = {
  id: string;
  kind: string;
  label: string;
  handle: string;
  holderName: string | null;
};

function AccountCard({ account, t }: { account: PaymentAccountView; t: Tx }) {
  const Icon = account.kind === "instapay" ? Landmark : Wallet;

  return (
    <li className="flex flex-col gap-3 rounded-2xl border border-border bg-card p-4 text-card-foreground">
      <div className="flex items-center gap-2.5">
        <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary">
          <Icon className="size-5" aria-hidden="true" />
        </span>
        <span className="text-sm font-bold">{account.label}</span>
      </div>

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
    </li>
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
    label: "اعتُمد",
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
/* الصفحة                                                               */
/* ------------------------------------------------------------------ */

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
  const discountCode = readText(discount, "code");
  const hasDiscount =
    discountAmount !== null && discountAmount > 0 && discountTotalBefore !== null;

  const originLabel = readText(trip, "originLabel", "origin_label") ?? "";
  const destLabel = readText(trip, "destLabel", "dest_label", "destinationLabel") ?? "";
  const distanceKm = readNumber(trip, "distanceKm", "distance_km");
  const passengers = readNumber(trip, "passengers") ?? 1;
  const roundTrip = readBoolean(trip, "roundTrip", "round_trip");
  const waitingHours = readNumber(trip, "waitingHours", "waiting_hours") ?? 0;
  const pickupAt = readText(trip, "pickupAt", "pickup_at");
  const notes = readText(trip, "notes");

  const pickupLabel = fmt.dateTime(pickupAt);
  const createdLabel = fmt.dateTime(createdAt);
  const payment = readPaymentSettings(settings);
  // الرابط الذي يحفظه العميل هو رابط لغته — العربية بلا بادئة والإنجليزية تحت /en
  const bookingUrl = `${getBaseUrl()}${localePath(locale, `/booking/${token}`)}`;

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
        label: readText(row, "label") ?? t("pay.accountFallbackLabel", "حساب تحويل"),
        handle: readText(row, "handle") ?? "",
        holderName: readText(row, "holder_name", "holderName"),
      }))
      .filter((account) => account.id.length > 0 && account.handle.length > 0);
  }

  const receiptAccounts: ReceiptAccountOption[] = accounts.map((account) => ({
    id: account.id,
    label: account.label,
    handle: account.handle,
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
          <ul className="grid gap-3 sm:grid-cols-2">
            {accounts.map((account) => (
              <AccountCard key={account.id} account={account} t={t} />
            ))}
          </ul>
        ) : (
          <p className="flex items-start gap-2 rounded-2xl border border-border bg-muted/40 px-4 py-3 text-sm leading-7">
            <Info className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden="true" />
            {t("pay.noAccounts", "سنتواصل معك لتأكيد وسيلة الدفع — حجزك محفوظ برقمه أعلاه.")}
          </p>
        )}

        {accounts.length > 0 ? (
          <div className="flex flex-col gap-3 border-t border-border pt-5">
            <h3 className="text-sm font-bold">
              {t("pay.uploadHeading", "بعد التحويل: ارفع الإيصال")}
            </h3>
            <ReceiptUpload
              token={token}
              amountDue={amountDue}
              currency={currency}
              accounts={receiptAccounts}
              locale={locale}
            />
          </div>
        ) : null}
      </>
    ) : null;

  const whatsapp = settings.contact.whatsapp;
  const phone = settings.contact.phone;

  return (
    <>
      <SiteHeader settings={settings} locale={locale} />

      <main id="main" className="flex-1">
        {/* الترويسة: رقم الحجز بارزاً */}
        <section className="site-hero-bg relative overflow-hidden">
          <div aria-hidden="true" className="pointer-events-none absolute inset-0">
            <div className="site-dots absolute inset-0 opacity-60 [mask-image:radial-gradient(ellipse_70%_90%_at_50%_0%,black,transparent)]" />
            <div className="absolute inset-x-0 bottom-0 h-px bg-gradient-to-l from-transparent via-border to-transparent" />
          </div>

          <div className="relative mx-auto flex w-full max-w-3xl flex-col items-center gap-4 px-4 pb-10 pt-10 text-center sm:px-6 md:pb-12 md:pt-14">
            <h1 className="text-2xl font-extrabold tracking-tight sm:text-3xl">
              {status === "cancelled"
                ? t("titleCancelled", "حجز ملغي")
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

        <div className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-4 py-10 sm:px-6 md:py-14">
          {/* تنبيه حفظ الرابط */}
          <div className="flex flex-col gap-3 rounded-2xl border border-border bg-muted/40 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
            <p className="flex items-start gap-2 text-sm leading-6">
              <Link2 className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden="true" />
              {t("saveLink", "احفظ هذا الرابط لمتابعة حجزك — هو مفتاحك الوحيد لهذه الصفحة.")}
            </p>
            <CopyButton
              value={bookingUrl}
              label={t("saveLinkCopyLabel", "رابط متابعة الحجز")}
              variant="inline"
              className="self-start sm:self-auto"
            />
          </div>

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
          ) : (
            <section
              aria-label={t("stepsLabel", "مراحل الحجز")}
              className="rounded-3xl border border-border bg-card p-5 text-card-foreground sm:p-6"
            >
              <StatusStepper status={status} t={t} />
            </section>
          )}

          {/* المبالغ */}
          <section
            aria-label={t("amounts.sectionLabel", "مبالغ الحجز")}
            className="flex flex-col gap-3 rounded-3xl border border-border bg-card p-5 text-card-foreground sm:p-6"
          >
            <h2 className="text-base font-bold">{t("amounts.heading", "المبالغ")}</h2>
            <dl className="flex flex-col gap-2.5 text-sm">
              {hasDiscount ? (
                <>
                  <div className="flex items-center justify-between gap-3">
                    <dt className="text-muted-foreground">
                      {t("amounts.totalBeforeDiscount", "الإجمالي قبل الخصم")}
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
                </>
              ) : null}
              <div className="flex items-center justify-between gap-3">
                <dt className="text-muted-foreground">
                  {hasDiscount
                    ? t("amounts.totalAfterDiscount", "الإجمالي بعد الخصم")
                    : t("amounts.total", "إجمالي الرحلة")}
                </dt>
                <dd className="font-medium">{fmt.money(total, currency)}</dd>
              </div>
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
            </dl>
            {amountRemaining > 0 ? (
              <p className="text-xs leading-6 text-muted-foreground">
                {t("amounts.remainingNote", "المتبقي يُحصَّل نقداً مع السائق يوم الرحلة.")}
              </p>
            ) : null}
          </section>

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
              aria-label={t("pay.sectionLabel", "إتمام الدفع")}
              className="flex flex-col gap-5 rounded-3xl border border-primary/30 bg-card p-5 text-card-foreground shadow-sm shadow-primary/5 sm:p-6"
            >
              <div className="flex flex-col gap-2">
                <h2 className="flex items-center gap-2 text-base font-bold">
                  <Wallet className="size-5 shrink-0 text-primary" aria-hidden="true" />
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
                    "وصلنا إيصال التحويل ويراجعه فريق التشغيل الآن. ما إن يُعتمد حتى تتحول حالة حجزك إلى «مؤكد» في هذه الصفحة نفسها — لا حاجة لأي خطوة منك."
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
                <span className="grid size-10 shrink-0 place-items-center rounded-full bg-primary text-primary-foreground">
                  <ShieldCheck className="size-5" aria-hidden="true" />
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

              {whatsapp || phone ? (
                <div className="flex flex-wrap gap-2">
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

            <dl className="grid gap-3 text-sm sm:grid-cols-2">
              <div className="flex items-center justify-between gap-3 rounded-2xl bg-muted/40 px-3 py-2.5">
                <dt className="text-muted-foreground">{t("trip.vehicleClass", "الفئة")}</dt>
                <dd className="font-medium">{classTitle}</dd>
              </div>
              <div className="flex items-center justify-between gap-3 rounded-2xl bg-muted/40 px-3 py-2.5">
                <dt className="text-muted-foreground">{t("trip.passengers", "عدد الركاب")}</dt>
                <dd className="font-medium">{fmt.passengers(passengers)}</dd>
              </div>
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
                <div className="flex items-center justify-between gap-3 rounded-2xl bg-muted/40 px-3 py-2.5">
                  <dt className="flex items-center gap-1.5 text-muted-foreground">
                    <Clock className="size-3.5 shrink-0" aria-hidden="true" />
                    {t("trip.waitingHours", "ساعات الانتظار")}
                  </dt>
                  <dd className="font-medium">{fmt.hours(waitingHours)}</dd>
                </div>
              ) : null}
              {pickupLabel ? (
                <div className="flex items-center justify-between gap-3 rounded-2xl bg-muted/40 px-3 py-2.5 sm:col-span-2">
                  <dt className="flex items-center gap-1.5 text-muted-foreground">
                    <CalendarClock className="size-3.5 shrink-0" aria-hidden="true" />
                    {t("trip.pickupAt", "موعد الانطلاق")}
                  </dt>
                  <dd className="font-medium">{pickupLabel}</dd>
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

          {/* تذييل مساعد */}
          <p className="text-center text-xs leading-6 text-muted-foreground">
            {footerBefore}
            <span dir="ltr" className="font-mono font-medium text-foreground">
              {reference}
            </span>
            {footerAfter}
          </p>
        </div>
      </main>

      <SiteFooter settings={settings} locale={locale} />
      <WhatsAppFab settings={settings} locale={locale} />
    </>
  );
}
