import Link from "next/link";
import { CalendarCheck, History, Inbox, Lock, Scale, Ticket } from "lucide-react";

import {
  CustomerContact,
  PayoutBlock,
  TripFacts,
  TripFlight,
  TripMap,
  TripNotes,
  TripRoute,
  TripStatusChip,
  amountLabel,
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
import { StageLock } from "../_components/stage-lock";
import { portalAccess, readPortalGate } from "../_lib/session";
import {
  CREW_ERROR_MESSAGES,
  CREW_SAVED_MESSAGE,
  TripCrewPanel,
} from "../requests/crew-panel";
import { routeMapAvailability } from "@/lib/maps/route-map";
import {
  loadApologyOptions,
  loadTrips,
  splitTrips,
  type ApologyOptions,
  type PortalTrip,
} from "../requests/data";
import { TripClosurePanel } from "./closure-panel";
import { loadDeductions, type DeductionsResult } from "./deductions";

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

/**
 * رموز هذه الشاشة كلها في مكان واحد: رموز القبول (`acceptOffer`) ورموز تسجيل
 * الطاقم (`setTripCrew`) معاً — والأخيرة تُستورد ولا تُنسخ، فالجملة تعيش بجوار
 * اللبنة التي تصنع رمزها.
 *
 * ⚠ ورمزٌ بلا جملة **صمتٌ لا خطأ**: `Banners` يقع على الجملة الجامعة «حدث خطأ
 * غير متوقع»، فيقرأ الشريك رفضاً مفهوماً في القاعدة كعطل مجهول عندنا. فكل رمز
 * تُنتجه `actions.ts` لهذه الوجهة يجب أن يكون له مفتاح هنا.
 */
const ERROR_MESSAGES: Record<string, string> = {
  save: "تعذر تنفيذ العملية — أعد المحاولة.",
  schema: "خدمة بث الطلبات غير مُركَّبة على الخادم بعد — لا إجراء مطلوب منك.",
  ...CREW_ERROR_MESSAGES,
  // ── رموز إغلاق الرحلة (0119/0121) — لكل رمزٍ جملته، ولا رمزَ بلا جملة ──
  closure_forbidden:
    "هذه الرحلة لم تعد مُسنَدة إليك، فلا إجراء مطلوب منك عليها. حدّث الصفحة لترى قائمتك الحالية.",
  closure_status:
    "حالة هذه الرحلة تغيّرت ولم تعد تقبل هذا الإجراء — حدّث الصفحة لترى وضعها الآن.",
  closure_early:
    "موعد هذه الرحلة لم يحِن بعد، فلا يُعلَن إتمامها قبل تنفيذها. أعلِنه بعد انتهاء الرحلة فعلاً.",
  closure_duplicate: "أعلنتَ إتمام هذه الرحلة بالفعل، وهي بانتظار اعتماد الإدارة.",
  closure_pending:
    "لك إعلانُ إتمامٍ معلّق على هذه الرحلة — لا يُعتذر عنها وهو قائم. انتظر قرار الإدارة، أو راسلها لسحب الإعلان.",
  closure_reason: "اختر سبباً من القائمة — الأسباب المعروضة هي المقبولة للاعتذار.",
  closure_gone: "لم نعد نجد هذه الرحلة — حدّث الصفحة.",
  closure_save: "تعذر تنفيذ العملية — أعد المحاولة، وإن تكرر الأمر راسل الإدارة.",
  grievance_duplicate: "لك اعتراضٌ مفتوحٌ على هذه الرحلة بالفعل — الإدارة تراجعه الآن.",
  grievance_short: "اكتب شرحاً لا يقلّ عن عشرة أحرف — الاعتراض المبهم لا يمكن بحثه.",
};

/** نجاح القبول — الجملة التي تشرح لماذا ظهرت بيانات العميل فجأة */
const ACCEPTED_MESSAGE =
  "قبلت الرحلة وأصبحت مُسندة إليك وحدك — بيانات تواصل العميل ظاهرة لك الآن في بطاقتها.";

/**
 * نجاح إعلان الإتمام — والجملة **تنفي** ما قد يُفهم ضمناً.
 *
 * «تم» وحدها تُقرأ «قُيِّد مستحقي»، فينتظر الشريك مالاً لم يُقيَّد ويقرأ التأخير
 * مماطلة. فالنصّ يقول صراحةً أين وقفت العملية، وموعدُ الاعتماد التلقائي معروضٌ
 * بتاريخه على البطاقة نفسها لا هنا — كي يبقى الرقم في مكانٍ واحد لا مكانين.
 */
const COMPLETION_MESSAGE =
  "وصل إعلانك إلى الإدارة. المستحق لا يُقيَّد في حسابك إلا بعد الاعتماد — وموعد الاعتماد التلقائي مكتوب على بطاقة الرحلة.";

const GRIEVANCE_MESSAGE =
  "وصل اعتراضك إلى الإدارة وستردّ عليك بقرارٍ مكتوب. ولك اعتراضٌ واحد مفتوح على كل رحلة.";

/** والوجهة كما قرّرتها القاعدة — تُنقل ولا تُعاد حسابها هنا */
const withdrawnMessage = (routed: string) =>
  routed === "manual"
    ? "سجّلنا اعتذارك وأُخرجت الرحلة من يدك. الموعد قريب فانتقلت إلى الإسناد اليدوي، وفريق التشغيل نُبِّه فوراً."
    : "سجّلنا اعتذارك وأُخرجت الرحلة من يدك، وانطلقت موجة عرضٍ جديدة على متعهدين آخرين. ولن تُعرض عليك هذه الرحلة مرة أخرى.";

/**
 * 🔴 «ويُتاح للمتعهد» — البند ٨ من اتفاقيته، منفَّذاً لا موعوداً (هجرة `0130`).
 *
 * البند يقول إن مبرِّر الخصم المكتوب «يُثبَّت في السجل **ويُتاح للمتعهد**»، وإن
 * له أن يتظلّم عليه خلال أربعة عشر يوماً من قيده. وبلا هذه البطاقة كان الرصيد
 * ينقص ولا سبيل لصاحبه أن يعرف عن أي رحلة ولا لماذا — أي حقُّ تظلّمٍ بلا ما
 * يُتظلَّم عليه.
 *
 * ولا رقم يُحسب هنا: المبالغ تصل جاهزة من `portal_deductions()` (‏**D-05**).
 * وسببُ ظهورها في «رحلاتي» لا في شاشةٍ مستقلة: الخصمُ يقع **على رحلة**، وبابُ
 * الاعتراض عليها في بطاقتها — فلا يُنشأ نموذجُ تظلّمٍ ثانٍ (القاعدة ١٢).
 */
function DeductionsCard({ result }: { result: DeductionsResult }) {
  if (!result.ready || result.rows.length === 0) return null;

  return (
    <section className="space-y-3">
      <h3 className="flex items-center gap-2 font-heading text-base font-bold">
        <Scale className="size-4 text-muted-foreground" aria-hidden="true" />
        خصومات على حسابك
      </h3>
      <Card className="space-y-4 p-4">
        <p className="text-sm leading-relaxed text-muted-foreground">
          كل خصمٍ قُيِّد على حسابك، ومعه <span className="font-semibold">مبرَّره المكتوب</span>{" "}
          كما ثُبِّت في السجل. ولك أن تعترض على أيٍّ منها خلال أربعة عشر يوماً من قيده — زرُّ
          الاعتراض في بطاقة الرحلة نفسها أعلاه.
        </p>
        <ul className="space-y-3">
          {result.rows.map((row, index) => (
            <li
              key={`${row.bookingId ?? "x"}-${row.kind}-${index}`}
              className="space-y-1.5 rounded-lg border border-border bg-muted/30 p-3"
            >
              <div className="flex flex-wrap items-center gap-2 text-sm">
                <span dir="ltr" className="font-mono text-xs text-muted-foreground">
                  {row.tripCode ?? "—"}
                </span>
                <span className="font-semibold">
                  {row.amount === null ? "—" : amountLabel(row.amount, row.currency)}
                </span>
                <span className="text-muted-foreground">
                  {row.kind === "apology" ? "خصم على اعتذار بعد القبول" : "خصم على رحلة فاشلة"}
                </span>
                {row.reasonLabel ? (
                  <span className="text-muted-foreground">· {row.reasonLabel}</span>
                ) : null}
                <span className="ms-auto text-xs text-muted-foreground">
                  {dateTimeLabel(row.appliedAt)}
                </span>
              </div>
              {/*
                والمبرَّر لا يُخفى خلف «اقرأ المزيد» ولا يُختصر: هو محلُّ التظلّم،
                ونصُّه هو ما التزمت المنصة بإتاحته كاملاً.
              */}
              <p className="text-sm leading-relaxed">
                {row.writtenReason ?? "لم يُسجَّل مبرَّر — راسل الإدارة."}
              </p>
            </li>
          ))}
        </ul>
      </Card>
    </section>
  );
}

function TripCard({
  trip,
  past,
  hasMap,
  mapApproximate,
  apology,
  now,
}: {
  trip: PortalTrip;
  past?: boolean;
  /** أسبابُ الاعتذار وعتبتُه — تُقرأ مرةً للصفحة كلها لا لكل بطاقة */
  apology: ApologyOptions;
  /** ساعةُ الخادم من `loadTrips` — لا يُقرأ الوقت داخل التصيير */
  now: number;
  /** له صورةٌ مخزَّنة الآن؟ — بلا صفٍّ لا تُرسم `<img>` تنتهي بـ٤٠٤ مكسورة */
  hasMap?: boolean;
  /** ورُسمت بخطٍّ مستقيم لا بمسار قيادة (0079) — يُقال ولا يُترك للتخمين */
  mapApproximate?: boolean;
}) {
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

      {/*
        خريطة المسار (م‑١١) — **هنا وحدها**: بطاقة رحلةٍ مُسنَدة. ولا نظير لها
        في `OfferCard` قبل القبول، وحارسُ نقطة الصورة نفسه يرفض من ليس مُسنَداً
        إليه (‏`partner_route_map_visible` في 0078).
      */}
      {hasMap ? <TripMap bookingId={trip.bookingId} approximate={mapApproximate} /> : null}

      <TripFacts trip={trip} />
      {/*
        ج‑٣ — رقم الرحلة الجوية **فوق** الملاحظات لا داخلها: هو ما يحدّد متى
        يقف السائق فعلاً في نقل المطار (الرحلة تتأخر فيصير الموعد المكتوب
        خطأً). وكان يصل مدسوساً في نصّ الملاحظات فيُقرأ أو لا يُقرأ.
      */}
      <TripFlight flightNumber={trip.flightNumber} />
      <TripNotes notes={trip.notes} />

      {/*
        موضع تركيب «مركبة الرحلة وسائقها» — وهو **داخل بطاقة الرحلة** لا في شاشة
        مستقلة: الشريك يعلن من سيأتي وهو ينظر إلى موعد الرحلة ومسارها واسم عميلها،
        فالقرار والسياق في مكان واحد. وعلى بطاقة «رحلاتي» وحدها لا على بطاقة العرض،
        لأن العرض المبثوث على عدة متعهدين لا طاقم له بعد (القيد الأول في اللبنة).

        و`past` تمرّ كما هي: اللبنة تقلب نفسها إلى سطر قراءة للرحلة التي مضت —
        تصحيحُ لوحةٍ بعد التنفيذ لا يفيد أحداً — وتعود `null` للملغاة ولمن لا
        معرّف حجز لها. فالنموذج لا يظهر إلا على رحلة مُسنَدة جارية.
      */}
      <TripCrewPanel trip={trip} past={past} />

      {/*
        إغلاق الرحلة (0119/0121) — **تحت لوحة الطاقم**: الترتيب على البطاقة هو
        ترتيب الزمن نفسه. من يسجّل مركبته وسائقه يفعل ذلك قبل الرحلة، ومن يُعلن
        إتمامها أو يعتذر عنها يفعل ذلك بعدها. فالعين تنزل مع مجرى اليوم.
      */}
      <TripClosurePanel trip={trip} apology={apology} now={now} past={past} />

      {trip.assignedAt ? (
        <p className="text-xs text-muted-foreground">أُسندت إليك في {dateTimeLabel(trip.assignedAt)}.</p>
      ) : null}
    </Card>
  );
}

export default async function PortalTripsPage({ searchParams }: PageProps<"/portal/trips">) {
  const [params, access, gate] = await Promise.all([
    searchParams,
    portalAccess(),
    readPortalGate(),
  ]);

  if (!access.ok) {
    // نظير `requests/page.tsx`: القفل يُعلَن ولا يُصمَت عنه في مرحلة التجهيز
    if (gate.state === "onboarding") {
      return (
        <StageLock title="لا رحلات قبل اعتماد حسابك">
          <p>
            هنا تظهر الرحلات التي تقبلها من صندوق الطلبات ببيانات تواصل عملائها. والصندوق نفسه
            لا يستقبل شيئاً قبل الاعتماد، فلا رحلة تصل هذه الشاشة بعد.
          </p>
          <p>
            وحين تصل أولى الرحلات ستُطالَب بتسجيل مركبتها وسائقها من سجلّك — فسجِّل سائقاً واحداً
            على الأقل الآن حتى لا تقف عند تلك اللحظة.
          </p>
        </StageLock>
      );
    }
    return null;
  }

  // `now` من القراءة نفسها لا من التصيير — فصل «القادم» عن «السابق» قرار زمني
  // يجب أن يبقى ثابتاً بين تصييرين متطابقين
  const [{ trips, ready, failed, now }, apology, deductions] = await Promise.all([
    loadTrips(),
    loadApologyOptions(),
    // بلا وسيط إطلاقاً: نطاق الدالة مثبَّت داخلها على صاحب الجلسة (`deductions.ts`)
    loadDeductions(),
  ]);
  const { upcoming, past } = splitTrips(trips, now);

  // استعلامٌ واحد لكل البطاقات لا صفٌّ لكل بطاقة — و`Set` فارغة حين يُطفئ
  // المالك المفتاح، فتختفي الخرائط من البورتال كما تختفي من صفحة العميل.
  const mapsReady = await routeMapAvailability(trips.map((trip) => trip.bookingId ?? ""));

  // وجهةٌ واحدة لإجراءين، فعَلَما النجاح منفصلان ولا يجتمعان: كل إعادة توجيه
  // تحمل واحداً منهما. والجملة تتبع العلم لأن «قبلت الرحلة» و«سجّلنا الطاقم»
  // خبران مختلفان، وشريطُ نجاحٍ يقول الخبر الخطأ أسوأ من غيابه.
  const accepted = params.accepted === "1";
  const crewSaved = params.crew === "1";
  const completionSent = params.completion === "1";
  const grievanceSent = params.grievance === "1";
  const withdrawn = typeof params.withdrawn === "string" ? params.withdrawn : null;
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

      {/*
        عَلَمُ نجاحٍ واحدٌ لكل إجراء، ولا يجتمعان: كل إعادة توجيه تحمل واحداً.
        والجملة تتبع العلم لأن «قبلت الرحلة» و«أعلنت إتمامها» و«اعتذرت عنها»
        أخبارٌ مختلفة — وشريطُ نجاحٍ يقول الخبر الخطأ أسوأ من غيابه.
      */}
      <Banners
        saved={accepted || crewSaved || completionSent || grievanceSent || withdrawn !== null}
        error={error}
        errorMessages={ERROR_MESSAGES}
        savedMessage={
          completionSent
            ? COMPLETION_MESSAGE
            : grievanceSent
              ? GRIEVANCE_MESSAGE
              : withdrawn !== null
                ? withdrawnMessage(withdrawn)
                : crewSaved
                  ? CREW_SAVED_MESSAGE
                  : ACCEPTED_MESSAGE
        }
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
            <TripCard
              key={trip.offerId}
              trip={trip}
              apology={apology}
              now={now}
              hasMap={trip.bookingId !== null && mapsReady.has(trip.bookingId)}
              mapApproximate={
                trip.bookingId !== null &&
                mapsReady.get(trip.bookingId)?.geometrySource === "straight"
              }
            />
          ))}
        </section>
      ) : null}

      {/*
        الخصومات بعد «القادمة» وقبل «السابقة»: ما يحتاج قراراً منك أولاً، ثم ما
        وقع على حسابك، ثم الأرشيف. وتختفي البطاقة كلها حين لا خصمَ عليك — لا
        عنوانٌ فارغ يوحي بأن ثمة شيئاً.
      */}
      <DeductionsCard result={deductions} />

      {past.length > 0 ? (
        <section className="space-y-3">
          <h3 className="flex items-center gap-2 font-heading text-base font-bold">
            <History className="size-4 text-muted-foreground" aria-hidden="true" />
            رحلات سابقة
          </h3>
          {past.map((trip) => (
            <TripCard
              key={trip.offerId}
              trip={trip}
              past
              apology={apology}
              now={now}
              hasMap={trip.bookingId !== null && mapsReady.has(trip.bookingId)}
              mapApproximate={
                trip.bookingId !== null &&
                mapsReady.get(trip.bookingId)?.geometrySource === "straight"
              }
            />
          ))}
        </section>
      ) : null}
    </div>
  );
}
