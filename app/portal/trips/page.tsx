import Link from "next/link";
import { CalendarCheck, History, Inbox, Lock, Ticket } from "lucide-react";

import {
  CustomerContact,
  PayoutBlock,
  TripFacts,
  TripNotes,
  TripRoute,
  TripStatusChip,
  dateTimeLabel,
} from "@/components/portal/offer-parts";
import {
  Banners,
  EmptyState,
  NotReadyNotice,
  Notice,
  PageHeading,
} from "@/components/portal/portal-ui";
import { buttonVariants } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { portalAccess } from "../_lib/session";
import { loadTrips, splitTrips, type PortalTrip } from "../requests/data";

/**
 * رحلاتي — ما بعد القبول.
 *
 * الفرق الجوهري بين هذه الشاشة وصندوق الطلبات ليس في الشكل بل في **ما تحمله
 * البيانات**: هنا وحدها يظهر اسم العميل ورقمه، لأن `portal_trips()` لا تُرجع
 * بيانات التواصل إلا لمن أُسندت إليه الرحلة فعلاً. لذلك تُشرح القاعدة في الشاشة
 * صراحةً: ما كان محجوباً قبل القبول لم يكن عيباً في العرض، بل حدّاً يحمي العميل
 * ويحمي حدود العلاقة — ويسقط في اللحظة التي تصير فيها مسؤولاً عن التنفيذ.
 *
 * القادم أولاً لأن الشاشة أداة تنفيذ لا سجل أرشيف: ما يحتاج ترتيباً اليوم يتصدر،
 * والمنفَّذ يبقى مرجعاً في الأسفل.
 */

export const metadata = { title: "رحلاتي" };

const ERROR_MESSAGES: Record<string, string> = {
  save: "تعذر تنفيذ العملية — أعد المحاولة.",
  schema: "خدمة بث الطلبات غير مُركَّبة على الخادم بعد — لا إجراء مطلوب منك.",
};

function TripCard({ trip, past }: { trip: PortalTrip; past?: boolean }) {
  return (
    <Card className={cn("gap-4 p-5", past && "bg-muted/30")}>
      <div className="flex flex-wrap items-center gap-2">
        <TripStatusChip status={trip.status} />
        <Ticket className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
        <span dir="ltr" className="font-medium tabular-nums">
          {trip.reference || "—"}
        </span>
        <span className="ms-auto text-xs text-muted-foreground">
          الانطلاق: {dateTimeLabel(trip.pickupAt)}
        </span>
      </div>

      <TripRoute
        originLabel={trip.originLabel}
        destLabel={trip.destLabel}
        roundTrip={trip.roundTrip}
      />

      <div className="grid gap-3 lg:grid-cols-2">
        <PayoutBlock
          payout={trip.payout}
          currency={trip.currency}
          roundTrip={trip.roundTrip}
          hint={
            past
              ? "المستحق المثبت لهذه الرحلة — تسويته تجري مع الإدارة حسب دورة التحصيل."
              : undefined
          }
        />
        <CustomerContact
          name={trip.customerName}
          phone={trip.customerPhone}
          whatsapp={trip.customerWhatsapp}
        />
      </div>

      <TripFacts trip={trip} />
      <TripNotes notes={trip.notes} />

      {trip.assignedAt ? (
        <p className="text-xs text-muted-foreground">أُسندت إليك في {dateTimeLabel(trip.assignedAt)}.</p>
      ) : null}
    </Card>
  );
}

export default async function PortalTripsPage({ searchParams }: PageProps<"/portal/trips">) {
  const [params, access] = await Promise.all([searchParams, portalAccess()]);
  if (!access.ok) return null;

  // `now` من القراءة نفسها لا من التصيير — فصل «القادم» عن «السابق» قرار زمني
  // يجب أن يبقى ثابتاً بين تصييرين متطابقين
  const { trips, ready, failed, now } = await loadTrips();
  const { upcoming, past } = splitTrips(trips, now);

  const accepted = params.accepted === "1";
  const error = typeof params.error === "string" ? params.error : null;

  return (
    <div className="space-y-6">
      <PageHeading
        title="رحلاتي"
        help="تظهر هنا الرحلات التي قبلتها أنت وأُغلقت أمام باقي المتعهدين — بترتيب الأقرب موعداً."
      >
        كل رحلة قبلتها مع موعدها ومسارها ومستحقك عنها، ومعها وسيلة التواصل مع العميل لتنسيق
        الاستلام.
      </PageHeading>

      <Banners
        saved={accepted}
        error={error}
        errorMessages={ERROR_MESSAGES}
        savedMessage="قبلت الرحلة وأصبحت مُسندة إليك وحدك — بيانات تواصل العميل ظاهرة لك الآن في بطاقتها."
      />

      {!ready ? <NotReadyNotice what="الرحلات المُسندة" /> : null}

      {/* عطل قراءة لا قائمة فارغة: رحلة مُسندة لا تظهر لصاحبها خطأ تشغيلي لا تفصيل شكلي */}
      {failed ? (
        <Notice tone="danger">
          <p className="font-semibold">تعذر تحميل رحلاتك</p>
          <p>
            لم نتمكن من قراءة الرحلات المُسندة إليك الآن. حدّث الصفحة، وإن تكرر الأمر راسل الإدارة —
            التزامك برحلة قبلتها قائم سواء ظهرت هنا أم لا.
          </p>
        </Notice>
      ) : null}

      <Notice tone="info" icon={<Lock className="size-5 shrink-0" aria-hidden="true" />}>
        <p>
          <span className="font-semibold">لماذا لم تظهر بيانات العميل قبل القبول؟</span> لأن العرض
          قبل الإسناد يُبَث على أكثر من متعهد، فلا يُعرض فيه اسم العميل ولا رقمه ولا عنوانه الدقيق.
          بقبولك تصير مسؤولاً عن التنفيذ، فتُفتح لك بيانات التواصل اللازمة له وحده.
        </p>
      </Notice>

      {ready && !failed && trips.length === 0 ? (
        <EmptyState
          icon={<CalendarCheck className="size-5" aria-hidden="true" />}
          title="لا رحلات مُسندة إليك بعد"
          action={
            <Link href="/portal/requests" className={cn(buttonVariants())}>
              <Inbox aria-hidden="true" />
              افتح صندوق الطلبات
            </Link>
          }
        >
          فور قبولك أول عرض من صندوق الطلبات ستجد رحلته هنا ببيانات تواصل العميل وموعد الانطلاق.
        </EmptyState>
      ) : null}

      {upcoming.length > 0 ? (
        <section className="space-y-3">
          <h3 className="flex items-center gap-2 font-heading text-base font-bold">
            <CalendarCheck className="size-4 text-primary" aria-hidden="true" />
            رحلات قادمة
          </h3>
          {upcoming.map((trip) => (
            <TripCard key={trip.offerId} trip={trip} />
          ))}
        </section>
      ) : null}

      {past.length > 0 ? (
        <section className="space-y-3">
          <h3 className="flex items-center gap-2 font-heading text-base font-bold">
            <History className="size-4 text-muted-foreground" aria-hidden="true" />
            رحلات سابقة
          </h3>
          {past.map((trip) => (
            <TripCard key={trip.offerId} trip={trip} past />
          ))}
        </section>
      ) : null}
    </div>
  );
}
