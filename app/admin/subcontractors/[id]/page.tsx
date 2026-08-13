import type { ReactNode } from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import {
  ArrowLeft,
  BadgeCheck,
  Ban,
  Car,
  CheckCircle2,
  ExternalLink,
  Globe,
  KeyRound,
  MapPin,
  MessageCircle,
  Phone,
  Scale,
  Send,
  UserCog,
} from "lucide-react";

import { formatMoney, toArabicDigits } from "@/components/booking/format";
import { HelpTip } from "@/components/shared/HelpTip";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { createServerSupabase } from "@/lib/supabase/server";
import {
  asNumber,
  asText,
  Banners,
  dateTimeLabel,
  pick,
  relativeTime,
} from "../../orders/_components/booking-ui";
import { PriceListCard } from "../_components/price-list-card";
import {
  EMPTY_PRICING_CONTEXT,
  loadPricingContext,
  type PricingContext,
} from "../_components/pricing-context";
import {
  classPricesText,
  inviteCommand,
  isSubStatus,
  listsText,
  readPriceItem,
  readPriceList,
  readSubcontractor,
  readVehicle,
  routesText,
  SUB_STATUS_HINTS,
  SUBCONTRACTOR_ERRORS,
  SubStatusBadge,
  vehiclesText,
  type PriceItemView,
  type PriceListView,
  type SubcontractorView,
  type VehicleView,
} from "../_components/subcontractor-ui";
import { resendInvite, setSubcontractorStatus } from "../actions";

/**
 * ملف المتعهد — كل ما يخص شريكاً واحداً في شاشة عمل واحدة:
 * بياناته، حالة حساب دخوله، أسطوله، قوائم أسعاره، وملخص تغطيته.
 *
 * قرار الاعتماد هنا ليس شكلياً: أسعار المتعهد المعتمد وحده تدخل `quote_price`،
 * وإيقافه يُخرجها فوراً بلا حذف صف واحد — لذلك لكل من الاعتماد والإيقاف خطوة تأكيد.
 * لا كلمة مرور تُعرض أو تُكتب في هذه الصفحة إطلاقاً؛ الدخول بدعوة بريدية فقط.
 */

export const metadata = { title: "ملف المتعهد" };

const hasSupabaseEnv = () =>
  Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * ملخص مقاصة متعهد — من العرض `v_partner_settlements` (المرحلة ٧).
 *
 * `netDue` هو الرقم الوحيد الذي يُدفع أو يُطالَب به، **وإشارته تنقلب**:
 * موجب = مستحق له علينا، وسالب = محصَّلٌ زائد عليه لنا. أي شاشة تفترض اتجاهاً
 * واحداً ستُخطئ في نصف الرحلات — لذلك الإشارة تُقرأ هنا ولا تُلغى بقيمة مطلقة.
 */
type Settlement = {
  earned: number | null;
  collected: number | null;
  paid: number | null;
  netDue: number | null;
  tripsCount: number | null;
};

type Loaded = {
  ready: boolean;
  sub: SubcontractorView | null;
  vehicles: VehicleView[];
  vehiclesFailed: boolean;
  lists: PriceListView[];
  listsFailed: boolean;
  itemsByList: Map<string, PriceItemView[]>;
  pricing: PricingContext;
  /** دور حساب الدخول المرتبط كما هو في `profiles` — null إن لم يُقرأ */
  linkedRole: string | null;
  /** العرض `v_partner_settlements` مقروء — أي أن هجرة المرحلة ٧ مطبَّقة */
  settlementReady: boolean;
  /** null مع `settlementReady` = لا حركة مالية لهذا الشريك بعد */
  settlement: Settlement | null;
  currency: string;
};

/** قراءة مقاصة شريك واحد — كل رقم محسوب في Postgres، ولا جمع هنا */
async function loadSettlement(
  supabase: NonNullable<Awaited<ReturnType<typeof createServerSupabase>>>,
  subcontractorId: string
): Promise<{ ready: boolean; settlement: Settlement | null }> {
  const res = await supabase
    .from("v_partner_settlements")
    .select("*")
    .eq("subcontractor_id", subcontractorId)
    .maybeSingle();

  if (res.error) return { ready: false, settlement: null };
  if (!res.data) return { ready: true, settlement: null };

  const row = res.data as Record<string, unknown>;
  return {
    ready: true,
    settlement: {
      earned: asNumber(pick(row, ["earned"])),
      collected: asNumber(pick(row, ["collected"])),
      paid: asNumber(pick(row, ["paid"])),
      netDue: asNumber(pick(row, ["net_due", "netDue"])),
      tripsCount: asNumber(pick(row, ["trips_count", "tripsCount"])),
    },
  };
}

async function loadSubcontractor(id: string): Promise<Loaded> {
  const blank: Loaded = {
    ready: false,
    sub: null,
    vehicles: [],
    vehiclesFailed: false,
    lists: [],
    listsFailed: false,
    itemsByList: new Map(),
    pricing: EMPTY_PRICING_CONTEXT,
    linkedRole: null,
    settlementReady: false,
    settlement: null,
    currency: "EGP",
  };

  const supabase = await createServerSupabase();
  if (!supabase) return blank;

  const subRes = await supabase.from("subcontractors").select("*").eq("id", id).maybeSingle();
  if (subRes.error) return blank;
  if (!subRes.data) return { ...blank, ready: true };

  const sub = readSubcontractor(subRes.data as Record<string, unknown>);

  const [vehiclesRes, listsRes, pricing, profileRes, settlementRes, currencyRes] =
    await Promise.all([
      supabase.from("subcontractor_vehicles").select("*").eq("subcontractor_id", id),
      supabase
        .from("price_lists")
        .select("*")
        .eq("subcontractor_id", id)
        .order("created_at", { ascending: false }),
      loadPricingContext(supabase),
      sub.profileId
        ? supabase.from("profiles").select("id, role").eq("id", sub.profileId).maybeSingle()
        : null,
      loadSettlement(supabase, id),
      // رمز العملة من قاعدة البيانات لا من الكود — نفس مصدر بقية أسعار الموقع
      supabase.from("pricing_settings").select("currency").limit(1).maybeSingle(),
    ]);

  const vehicles = vehiclesRes.error
    ? []
    : ((vehiclesRes.data ?? []) as Record<string, unknown>[]).map(readVehicle);

  const lists = listsRes.error
    ? []
    : ((listsRes.data ?? []) as Record<string, unknown>[]).map(readPriceList);

  const itemsByList = new Map<string, PriceItemView[]>();
  if (lists.length > 0) {
    const itemsRes = await supabase
      .from("price_list_items")
      .select("*")
      .in(
        "price_list_id",
        lists.map((l) => l.id)
      );
    if (!itemsRes.error) {
      for (const row of (itemsRes.data ?? []) as Record<string, unknown>[]) {
        const item = readPriceItem(row);
        if (!item) continue;
        const bucket = itemsByList.get(item.priceListId);
        if (bucket) bucket.push(item);
        else itemsByList.set(item.priceListId, [item]);
      }
    }
  }

  return {
    ready: true,
    sub,
    vehicles,
    vehiclesFailed: Boolean(vehiclesRes.error),
    lists,
    listsFailed: Boolean(listsRes.error),
    itemsByList,
    pricing,
    linkedRole:
      profileRes && !profileRes.error
        ? asText((profileRes.data as Record<string, unknown> | null)?.role)
        : null,
    settlementReady: settlementRes.ready,
    settlement: settlementRes.settlement,
    currency: (!currencyRes.error && asText(currencyRes.data?.currency)) || blank.currency,
  };
}

/** سطر «تسمية ← قيمة» داخل بطاقة — نفس سطر شاشة تفاصيل الطلب */
function Row({ label, help, children }: { label: string; help?: string; children: ReactNode }) {
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

function SocialLinks({ socials }: { socials: SubcontractorView["socials"] }) {
  const entries: { key: string; href: string; icon: typeof Globe; label: string }[] = [];
  if (socials.website)
    entries.push({ key: "web", href: socials.website, icon: Globe, label: "الموقع" });
  if (socials.facebook)
    entries.push({ key: "fb", href: socials.facebook, icon: ExternalLink, label: "فيسبوك" });
  if (socials.instagram)
    entries.push({ key: "ig", href: socials.instagram, icon: ExternalLink, label: "انستغرام" });

  if (entries.length === 0) return <span className="text-sm text-muted-foreground">—</span>;
  return (
    <span className="flex flex-wrap items-center gap-2">
      {entries.map((entry) => {
        const Icon = entry.icon;
        return (
          <a
            key={entry.key}
            href={entry.href}
            target="_blank"
            rel="noopener noreferrer nofollow"
            className="inline-flex items-center gap-1 rounded-lg border border-border px-2 py-1 text-xs transition-colors hover:border-primary hover:text-primary"
          >
            <Icon className="size-3.5" />
            {entry.label}
          </a>
        );
      })}
    </span>
  );
}

/** خانة رقم واحدة داخل ملخص المقاصة */
function SettlementTile({
  title,
  value,
  currency,
  help,
}: {
  title: string;
  value: number | null;
  currency: string;
  help: string;
}) {
  return (
    <div className="rounded-lg border border-border p-3">
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
 * ملخص المقاصة — الرقم الذي يُدفع أو يُطالَب به، بصياغة تحترم إشارته.
 *
 * المعادلة كلها في Postgres: `net_due = مستحقاته − ما حصّله نقداً − ما دفعناه`.
 * هنا لا يجري إلا **قراءة الإشارة** لاختيار العبارة العربية الصحيحة:
 *   موجب ⇒ «له علينا» (ندفع له) · سالب ⇒ «عليه لنا» (يردّ إلينا) · صفر ⇒ مصفّى.
 * وتُعرض القيمة المطلقة في السالب لأن «−٣٦٠ له علينا» جملة تُقرأ خطأً؛ الاتجاه
 * تحمله العبارة واللون لا علامة الناقص.
 */
function SettlementCard({
  subcontractorId,
  companyName,
  settlement,
  ready,
  currency,
}: {
  subcontractorId: string;
  companyName: string;
  settlement: Settlement | null;
  ready: boolean;
  currency: string;
}) {
  const netDue = settlement?.netDue ?? null;
  const owedToPartner = netDue !== null && netDue > 0;
  const owedToUs = netDue !== null && netDue < 0;

  const headline =
    netDue === null
      ? "—"
      : formatMoney(owedToUs ? -netDue : netDue, currency);

  const verdict = owedToPartner
    ? "له علينا — ندفع له هذا المبلغ"
    : owedToUs
      ? "عليه لنا — يردّ إلينا هذا المبلغ"
      : "الحساب مصفّى — لا مستحقات في الاتجاهين";

  const tone = owedToPartner
    ? "border-amber-300 bg-amber-50 dark:border-amber-700 dark:bg-amber-950/40"
    : owedToUs
      ? "border-sky-300 bg-sky-50 dark:border-sky-700 dark:bg-sky-950/40"
      : "border-emerald-300 bg-emerald-50 dark:border-emerald-700 dark:bg-emerald-950/40";

  return (
    <Card className="space-y-4 p-5">
      <div className="flex flex-wrap items-center gap-2">
        <h3 className="flex items-center gap-1.5 font-heading text-base font-bold">
          <Scale className="size-4 text-primary" />
          المقاصة
          <HelpTip>
            العميل يدفع لنا عرباناً ويسلّم الباقي <span className="font-semibold">نقداً
            للسائق</span>. فالمتعهد يخرج من الرحلة وقد قبض جزءاً من مالنا ونحن مدينون له
            بمستحقه كاملاً. لذلك: <span className="font-semibold">الصافي = مستحقاته − ما
            حصّله نقداً − ما سبق أن دفعناه له</span>، وقد ينقلب سالباً فيصير هو المدين لنا.
          </HelpTip>
        </h3>
        <Link
          href={`/admin/finance/partners/${subcontractorId}`}
          className="ms-auto inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
        >
          كشف حساب «{companyName}»
          <ArrowLeft className="size-4" />
        </Link>
      </div>

      {!ready ? (
        <p className="text-sm leading-relaxed text-muted-foreground">
          دفتر المالية غير مفعَّل بعد — العرض <code dir="ltr">v_partner_settlements</code> غير
          موجود. نفِّذ هجرة المرحلة ٧ (<code dir="ltr">0015</code>) من{" "}
          <code dir="ltr">supabase/migrations</code> ثم أعد تحميل الصفحة. بقية الملف تعمل
          طبيعياً.
        </p>
      ) : settlement === null ? (
        <p className="text-sm leading-relaxed text-muted-foreground">
          لا حركة مالية لهذا الشريك بعد — لم تُنفَّذ له رحلة ولم تُسجَّل له دفعة. يظهر الملخص
          هنا فور اكتمال أول رحلة مُسندة إليه.
        </p>
      ) : (
        <>
          <div className={`rounded-lg border p-4 ${tone}`}>
            <p className="text-xs text-muted-foreground">صافي المقاصة الآن</p>
            <p className="mt-0.5 text-3xl font-bold" dir="ltr">
              {headline}
            </p>
            <p className="mt-1 text-sm font-medium">{verdict}</p>
          </div>

          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <SettlementTile
              title="مستحقاته عن الرحلات"
              value={settlement.earned}
              currency={currency}
              help="مجموع ما استحقه عن كل رحلة نفّذها فعلاً، بمبلغ الإسناد المثبَّت لكل رحلة. يزيد لحظة تسجيل الرحلة «منفذة» لا لحظة إسنادها."
            />
            <SettlementTile
              title="حصّله نقداً من العملاء"
              value={settlement.collected}
              currency={currency}
              help="ما قبضه السائق من عملائنا نقداً نيابةً عنا (الباقي بعد العربون). هو مالنا في يده، فيُخصم من مستحقاته — وهذا سبب أن الصافي أصغر من المستحقات دائماً."
            />
            <SettlementTile
              title="ما دفعناه له"
              value={settlement.paid}
              currency={currency}
              help="مجموع الدفعات النقدية المسجَّلة له في الدفتر حتى الآن. كل دفعة تُسجَّل من شاشة كشف الحساب فتُنقص الصافي فوراً."
            />
          </div>

          <p className="text-sm text-muted-foreground">
            عدد الرحلات المحتسَبة:{" "}
            <span className="font-medium text-foreground">
              {settlement.tripsCount === null ? "—" : toArabicDigits(settlement.tripsCount)}
            </span>{" "}
            · التفصيل سطراً سطراً وتسجيل الدفعات في{" "}
            <Link
              href={`/admin/finance/partners/${subcontractorId}`}
              className="text-primary hover:underline"
            >
              كشف الحساب
            </Link>
            .
          </p>
        </>
      )}
    </Card>
  );
}

/** بطاقة أمر الدعوة اليدوية — تظهر متى تعذّر الإرسال الآلي */
function ManualInviteCard({ sub, title }: { sub: SubcontractorView; title: string }) {
  return (
    <Card className="space-y-2 border-amber-300 bg-amber-50 p-4 text-amber-900 dark:border-amber-700 dark:bg-amber-950 dark:text-amber-100">
      <p className="text-sm font-semibold">{title}</p>
      <p className="text-sm leading-relaxed">
        حساب المتعهد محفوظ ولا شيء ضائع. شغّل هذا الأمر في جذر المشروع — يرسل رابط تعيين
        كلمة المرور، ويربط حساب الدخول، ويضبط دوره على{" "}
        <code dir="ltr">subcontractor</code>، ولا يمر بأي كلمة مرور:
      </p>
      <code
        dir="ltr"
        className="block overflow-x-auto rounded-lg bg-amber-100 p-2 text-xs dark:bg-amber-900"
      >
        {inviteCommand(sub.email, sub.companyName)}
      </code>
      <p className="text-xs leading-relaxed">
        الإرسال الآلي من هذه الشاشة يحتاج <code dir="ltr">SUPABASE_SERVICE_ROLE_KEY</code> في{" "}
        <code dir="ltr">.env.local</code> (ثم إعادة تشغيل الخادم).
      </p>
    </Card>
  );
}

export default async function SubcontractorProfilePage({
  params,
  searchParams,
}: PageProps<"/admin/subcontractors/[id]">) {
  const [{ id }, sp] = await Promise.all([params, searchParams]);
  if (!UUID.test(id)) notFound();

  const {
    ready,
    sub,
    vehicles,
    vehiclesFailed,
    lists,
    listsFailed,
    itemsByList,
    pricing,
    linkedRole,
    settlementReady,
    settlement,
    currency,
  } = await loadSubcontractor(id);
  if (ready && !sub) notFound();

  const wired = hasSupabaseEnv();
  const savedKey = typeof sp.saved === "string" ? sp.saved : null;
  const error = typeof sp.error === "string" ? sp.error : null;
  const confirming = typeof sp.confirm === "string" ? sp.confirm : null;

  const SAVED_MESSAGES: Record<string, string> = {
    approved:
      "اعتُمد المتعهد — أسعاره في القوائم المعتمدة تدخل تسعير الرحلات المغطاة فوراً.",
    suspended:
      "أُوقف المتعهد — خرجت أسعاره من التسعير فوراً وبقيت بياناته وقوائمه كما هي.",
    pending: "أُعيد المتعهد إلى «بانتظار الاعتماد» — أسعاره خارج التسعير حتى تعتمده.",
    invited:
      "أُرسل إلى بريد المتعهد رابط تعيين كلمة المرور — يحددها بنفسه ولا تصل إليك إطلاقاً.",
    manual: "حُفظ حساب المتعهد. لم يُرسل الرابط آلياً — أرسله بالأمر أدناه.",
    invitefail: "حُفظ حساب المتعهد وتعذّر إرسال البريد — أرسل الرابط بالأمر أدناه.",
    approvedlist:
      "اعتُمدت القائمة — أسعارها تدخل التسعير فوراً ما دام حساب المتعهد معتمداً.",
    rejectedlist: "رُفضت القائمة وعادت إلى المتعهد بملاحظتك.",
  };

  if (!sub) {
    return (
      <div className="mx-auto max-w-3xl space-y-6">
        <Banners
          wired={wired}
          readOnly
          saved={false}
          error={null}
          errorMessages={SUBCONTRACTOR_ERRORS}
          readOnlyTitle="ملف المتعهد غير متاح"
          readOnlyBody={
            <p>
              قاعدة البيانات مربوطة لكن جدول <code dir="ltr">subcontractors</code> غير موجود —
              نفِّذ هجرة المرحلة ٥ من <code dir="ltr">supabase/migrations</code> ثم أعد تحميل
              الصفحة.
            </p>
          }
        />
        <Link href="/admin/subcontractors" className="text-sm text-primary hover:underline">
          العودة إلى المتعهدين
        </Link>
      </div>
    );
  }

  // ملخص التغطية — يُحسب من القوائم المعتمدة وحدها لأنها وحدها تدخل التسعير
  const approvedLists = lists.filter((l) => l.status === "approved");
  const approvedPrices = approvedLists.reduce(
    (sum, list) => sum + (itemsByList.get(list.id)?.length ?? 0),
    0
  );
  const pendingLists = lists.filter((l) => l.status === "pending");
  const activeVehicles = vehicles.filter((v) => v.active);

  const isApproved = sub.status === "approved";
  const isSuspended = sub.status === "suspended";
  // الأمر اليدوي يصلح ثلاث حالات: غياب مفتاح الخدمة، تعثّر البريد، ودور حساب
  // مرتبط لم يُضبط (يقع حين تمنع الصلاحيات كتابة `profiles` من الخادم)
  const roleMismatch = linkedRole !== null && linkedRole !== "subcontractor";
  const showManualInvite =
    savedKey === "manual" ||
    savedKey === "invitefail" ||
    roleMismatch ||
    (!sub.profileId && ready);

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="font-heading text-lg font-bold">{sub.companyName}</h2>
        <SubStatusBadge status={sub.status} />
        <HelpTip>
          {isSubStatus(sub.status)
            ? SUB_STATUS_HINTS[sub.status]
            : "حالة غير معروفة — راجع قيم العمود في قاعدة البيانات."}
        </HelpTip>
        <span className="text-xs text-muted-foreground">
          أُضيف {relativeTime(sub.createdAt)} · {dateTimeLabel(sub.createdAt)}
        </span>
        <Link
          href="/admin/subcontractors"
          className="ms-auto text-sm text-muted-foreground transition-colors hover:text-primary hover:underline"
        >
          العودة إلى المتعهدين
        </Link>
      </div>

      <Banners
        wired={wired}
        readOnly={false}
        saved={savedKey !== null && savedKey in SAVED_MESSAGES}
        error={error}
        errorMessages={SUBCONTRACTOR_ERRORS}
        savedMessage={(savedKey && SAVED_MESSAGES[savedKey]) || "نُفذت العملية."}
        readOnlyTitle=""
        readOnlyBody={null}
      />

      {/* ملخص التغطية — الجملة التي تختصر قيمة هذا الشريك في التسعير */}
      <Card className="gap-1 p-5">
        <h3 className="flex items-center gap-1.5 font-heading text-base font-bold">
          <MapPin className="size-4 text-primary" />
          التغطية
          <HelpTip>
            المسارات المحسوبة هنا من القوائم المعتمدة وحدها، لأنها وحدها تشارك في التسعير.
            «أسعار الفئات» هي عدد أسعار الفئات داخل تلك القوائم — كلما زادت زادت الرحلات
            التي يُسعّرها هذا الشريك بدل تعريفة الكيلومتر.
          </HelpTip>
        </h3>
        <p className="text-lg font-bold">
          يغطي {routesText(approvedLists.length)} · {classPricesText(approvedPrices)}
        </p>
        <p className="text-sm text-muted-foreground">
          {listsText(lists.length)} إجمالاً
          {pendingLists.length > 0
            ? ` · ${toArabicDigits(pendingLists.length)} بانتظار مراجعتك`
            : ""}{" "}
          · الأسطول {vehiclesText(activeVehicles.length)} نشطة
        </p>
        {!isApproved && (
          <p className="text-sm text-amber-700 dark:text-amber-300">
            حساب هذا المتعهد ليس معتمداً — لا تشارك أسعاره في التسعير مهما اعتُمدت قوائمه.
          </p>
        )}
      </Card>

      {/*
        المقاصة مباشرة بعد التغطية: التغطية تقول «ماذا يقدّم هذا الشريك»،
        والمقاصة تقول «وكم بيننا وبينه الآن» — وهو أول ما يُسأل عنه عند الاتصال به.
      */}
      <SettlementCard
        subcontractorId={sub.id}
        companyName={sub.companyName}
        settlement={settlement}
        ready={settlementReady}
        currency={currency}
      />

      <div className="grid gap-4 lg:grid-cols-2">
        {/* بيانات التواصل */}
        <Card className="space-y-1 p-5">
          <h3 className="flex items-center gap-1.5 font-heading text-base font-bold">
            <Phone className="size-4 text-primary" />
            بيانات المتعهد
            <HelpTip>
              يحرّرها المتعهد من بوابته؛ هذه الشاشة تعرضها للتشغيل. لا شيء منها يظهر للعميل —
              الموقع بعلامة واحدة هي علامتك.
            </HelpTip>
          </h3>
          <Row label="اسم الشركة">{sub.companyName}</Row>
          <Row label="مسؤول التواصل">{sub.contactName ?? "—"}</Row>
          <Row label="التواصل">
            <ContactLinks phone={sub.phone} whatsapp={sub.whatsapp} />
          </Row>
          <Row label="البريد الإلكتروني">
            <span dir="ltr">{sub.email ?? "—"}</span>
          </Row>
          <Row label="روابط">
            <SocialLinks socials={sub.socials} />
          </Row>
          {sub.notes ? (
            <Row label="ملاحظات">
              <span className="block max-w-md leading-relaxed">{sub.notes}</span>
            </Row>
          ) : null}
        </Card>

        {/* حساب الدخول */}
        <Card className="space-y-1 p-5">
          <h3 className="flex items-center gap-1.5 font-heading text-base font-bold">
            <KeyRound className="size-4 text-primary" />
            حساب الدخول
            <HelpTip>
              الدخول بدعوة بريدية فقط: يضع المتعهد كلمة مروره بنفسه من رابط الدعوة. لا تُنشئ
              له كلمة مرور ولا ترسلها في أي رسالة — النظام لا يعرضها ولا يخزّنها لك أصلاً.
            </HelpTip>
          </h3>
          <Row label="الحالة">
            {sub.profileId ? (
              <span className="inline-flex items-center gap-1.5">
                <BadgeCheck className="size-4 text-emerald-600" />
                مرتبط بحساب دخول
              </span>
            ) : (
              <span className="text-amber-700 dark:text-amber-300">
                لم يُربط بحساب دخول بعد
              </span>
            )}
          </Row>
          <Row
            label="دور الحساب"
            help="الدور هو ما يفتح للمتعهد بوابته ويمنعه من رؤية أي بيانات عميل. المتوقع دائماً subcontractor."
          >
            {linkedRole ? (
              <span className="inline-flex items-center gap-1.5">
                <code dir="ltr">{linkedRole}</code>
                {linkedRole !== "subcontractor" && (
                  <Badge variant="outline" className="border-amber-300 text-amber-700 dark:text-amber-300">
                    غير متوقع
                  </Badge>
                )}
              </span>
            ) : (
              "—"
            )}
          </Row>
          <div className="pt-2">
            <form action={resendInvite.bind(null, sub.id)}>
              <Button type="submit" variant="outline" size="sm" disabled={!sub.email}>
                <Send />
                {sub.profileId ? "إعادة إرسال رابط الدخول" : "إرسال الدعوة"}
              </Button>
            </form>
            <p className="mt-1.5 text-xs text-muted-foreground">
              يرسل بريد دعوة رسمياً من Supabase إلى{" "}
              <span dir="ltr">{sub.email ?? "—"}</span>. الرابط يفتح صفحة تعيين كلمة المرور.
            </p>
          </div>
        </Card>
      </div>

      {showManualInvite && (
        <ManualInviteCard
          sub={sub}
          title={
            savedKey === "invitefail"
              ? "تعذّر إرسال بريد الدعوة"
              : roleMismatch
                ? "دور حساب الدخول ليس subcontractor"
                : sub.profileId
                  ? "إرسال رابط الدخول يدوياً"
                  : "هذا المتعهد لم يستلم دعوته بعد"
          }
        />
      )}

      {/* الأسطول */}
      <Card className="space-y-4 p-5">
        <div>
          <h3 className="flex items-center gap-1.5 font-heading text-base font-bold">
            <Car className="size-4 text-primary" />
            الأسطول
            <HelpTip>
              مركبات المتعهد وفئة كل منها. الفئة هي ما يربط المركبة بمحرك التسعير: سعر
              المتعهد لفئة ما لا يُستعمل إن لم يكن لديه مركبة فيها. بيانات المركبة داخلية
              ولا يراها العميل.
            </HelpTip>
          </h3>
          <p className="text-sm text-muted-foreground">
            يديرها المتعهد من بوابته — هذه الشاشة للاطلاع فقط.
          </p>
        </div>

        {vehiclesFailed ? (
          <p className="text-sm text-muted-foreground">
            تعذر قراءة الأسطول — تأكد أن جدول{" "}
            <code dir="ltr">subcontractor_vehicles</code> منفَّذ في قاعدة البيانات (هجرة
            المرحلة ٥).
          </p>
        ) : vehicles.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            لم يضف هذا المتعهد أي مركبة بعد.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[34rem] text-sm">
              <thead>
                <tr className="border-b border-border text-xs text-muted-foreground">
                  <th className="p-2 text-start font-medium">الفئة</th>
                  <th className="p-2 text-start font-medium">المركبة</th>
                  <th className="p-2 text-start font-medium">الموديل</th>
                  <th className="p-2 text-start font-medium">اللوحة</th>
                  <th className="p-2 text-start font-medium">المقاعد</th>
                  <th className="p-2 text-start font-medium">الحالة</th>
                </tr>
              </thead>
              <tbody>
                {vehicles.map((vehicle) => {
                  const info = vehicle.classSlug
                    ? pricing.byClass.get(vehicle.classSlug)
                    : undefined;
                  return (
                    <tr key={vehicle.id} className="border-b border-border last:border-0">
                      <td className="p-2 align-top">{info?.title ?? vehicle.classSlug ?? "—"}</td>
                      <td className="p-2 align-top">{vehicle.label}</td>
                      <td className="p-2 align-top" dir="ltr">
                        {vehicle.modelYear === null ? "—" : toArabicDigits(vehicle.modelYear)}
                      </td>
                      <td className="p-2 align-top" dir="ltr">
                        {vehicle.plate ?? "—"}
                      </td>
                      <td className="p-2 align-top">
                        {vehicle.seats === null ? "—" : toArabicDigits(vehicle.seats)}
                      </td>
                      <td className="p-2 align-top">
                        <Badge variant={vehicle.active ? "default" : "secondary"}>
                          {vehicle.active ? "نشطة" : "متوقفة"}
                        </Badge>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {/* قوائم الأسعار — المنتظرة أولاً لأنها تنتظر قراراً */}
      <div className="space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <h3 className="font-heading text-base font-bold">قوائم الأسعار</h3>
          <HelpTip>
            كل قائمة ترسو على نقطتين ونطاق حول كل نقطة، وتحمل تكلفة المتعهد لكل فئة. بجوار
            كل تكلفة يظهر سعر العميل الناتج عنها بالهامش الحالي. المعتمدة وحدها تدخل
            التسعير، وأي تعديل يجريه المتعهد يعيد القائمة إلى المراجعة.
          </HelpTip>
          {pendingLists.length > 0 && (
            <Link
              href="/admin/subcontractors/reviews"
              className="ms-auto text-sm text-primary hover:underline"
            >
              طابور المراجعة الكامل
            </Link>
          )}
        </div>

        {listsFailed ? (
          <Card className="p-5 text-sm text-muted-foreground">
            تعذر قراءة قوائم الأسعار — تأكد أن جدول <code dir="ltr">price_lists</code> منفَّذ
            في قاعدة البيانات (هجرة المرحلة ٥).
          </Card>
        ) : lists.length === 0 ? (
          <Card className="p-5 text-sm text-muted-foreground">
            لا توجد قوائم أسعار لهذا المتعهد بعد — يضيفها من بوابته ثم ترسل إليك للمراجعة.
            حتى ذلك الحين تُسعَّر رحلاته بتعريفة الكيلومتر.
          </Card>
        ) : (
          [...pendingLists, ...lists.filter((l) => l.status !== "pending")].map((list) => (
            <PriceListCard
              key={list.id}
              list={list}
              items={itemsByList.get(list.id) ?? []}
              pricing={pricing}
              returnTo={`/admin/subcontractors/${sub.id}`}
              readOnly={!ready}
            />
          ))
        )}
      </div>

      {/* الإجراءات — الاعتماد والإيقاف، كلاهما بخطوة تأكيد */}
      <Card className="space-y-4 p-5" id="actions">
        <div>
          <h3 className="flex items-center gap-1.5 font-heading text-base font-bold">
            <UserCog className="size-4 text-primary" />
            حالة الحساب
            <HelpTip>
              الاعتماد يفتح باب مشاركة أسعار هذا الشريك في التسعير، والإيقاف يغلقه فوراً بلا
              حذف شيء. لا تحذف متعهداً أبداً — الإيقاف يُبقي سجله وقوائمه سليمة لأي مراجعة
              مالية لاحقة.
            </HelpTip>
          </h3>
          <p className="text-sm text-muted-foreground">
            الحالة الحالية: {isSubStatus(sub.status) ? SUB_STATUS_HINTS[sub.status] : sub.status}
          </p>
        </div>

        {confirming === "approve" ? (
          <form
            action={setSubcontractorStatus.bind(null, sub.id, "approved")}
            className="space-y-3 rounded-lg border border-emerald-300 bg-emerald-50 p-4 dark:border-emerald-700 dark:bg-emerald-950"
          >
            <p className="text-sm font-semibold text-emerald-900 dark:text-emerald-100">
              تأكيد اعتماد «{sub.companyName}»
            </p>
            <p className="text-sm leading-relaxed text-emerald-900/90 dark:text-emerald-100/90">
              بعد الاعتماد تدخل أسعاره المعتمدة تسعير الرحلات المغطاة فوراً: أي رحلة تقع
              داخل نطاق إحدى قوائمه قد تُسعَّر بسعره + الهامش بدل تعريفة الكيلومتر. راجع
              قوائمه أعلاه قبل التأكيد.
            </p>
            <div className="flex flex-wrap items-center gap-3">
              <Button type="submit">
                <CheckCircle2 />
                تأكيد الاعتماد
              </Button>
              <Link
                href={`/admin/subcontractors/${sub.id}`}
                className="text-sm text-muted-foreground transition-colors hover:text-foreground hover:underline"
              >
                تراجع
              </Link>
            </div>
          </form>
        ) : confirming === "suspend" ? (
          <form
            action={setSubcontractorStatus.bind(null, sub.id, "suspended")}
            className="space-y-3 rounded-lg border border-red-300 bg-red-50 p-4 dark:border-red-700 dark:bg-red-950"
          >
            <p className="text-sm font-semibold text-red-900 dark:text-red-100">
              تأكيد إيقاف «{sub.companyName}»
            </p>
            <p className="text-sm leading-relaxed text-red-900/90 dark:text-red-100/90">
              الإيقاف يُخرج كل أسعاره من التسعير فوراً — الرحلات التي كان يغطيها ستعود إلى
              تعريفة الكيلومتر أو إلى متعهد آخر إن وُجد. بياناته وقوائمه تبقى كما هي، ويمكن
              إعادة اعتماده في أي وقت.
            </p>
            <div className="flex flex-wrap items-center gap-3">
              <Button type="submit" variant="destructive">
                <Ban />
                تأكيد الإيقاف
              </Button>
              <Link
                href={`/admin/subcontractors/${sub.id}`}
                className="text-sm text-muted-foreground transition-colors hover:text-foreground hover:underline"
              >
                تراجع
              </Link>
            </div>
          </form>
        ) : (
          <div className="flex flex-wrap items-center gap-3">
            {!isApproved && (
              <Link
                href={`/admin/subcontractors/${sub.id}?confirm=approve#actions`}
                className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
              >
                <CheckCircle2 className="size-4" />
                {isSuspended ? "إعادة الاعتماد" : "اعتماد المتعهد"}
              </Link>
            )}
            {!isSuspended && (
              <Link
                href={`/admin/subcontractors/${sub.id}?confirm=suspend#actions`}
                className="inline-flex items-center gap-1.5 rounded-lg border border-red-300 px-3 py-1.5 text-sm text-red-700 transition-colors hover:bg-red-50 dark:border-red-800 dark:text-red-300 dark:hover:bg-red-950"
              >
                <Ban className="size-4" />
                إيقاف المتعهد
              </Link>
            )}
            <HelpTip>
              خطوة تأكيد إجبارية قبل كل تغيير حالة — الاعتماد والإيقاف كلاهما يغيّر أسعاراً
              يراها العملاء في اللحظة نفسها.
            </HelpTip>
          </div>
        )}

        <Separator />

        <p className="text-xs text-muted-foreground">
          هذه الشاشة تُعرّف الشريك وتضبط مشاركته في التسعير وتعرض مقاصته. إسناد الرحلات
          (البث والقبول خلال مهلة) يُدار من شاشة «الإسناد»، وتفصيل حسابه سطراً سطراً وتسجيل
          دفعاته في «كشف الحساب».
        </p>
      </Card>
    </div>
  );
}
