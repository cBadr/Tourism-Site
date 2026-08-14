import type { ReactNode } from "react";
import Link from "next/link";
import { CarFront, Clock, UserRound } from "lucide-react";

import { dateTimeLabel } from "@/components/portal/offer-parts";
import { Notice, SelectField } from "@/components/portal/portal-ui";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { setTripCrew } from "./actions";
import {
  loadCrewRoster,
  type CrewDriver,
  type CrewRoster,
  type CrewVehicle,
  type PortalTrip,
  type TripCrewRef,
} from "./data";

/**
 * «مركبة الرحلة وسائقها» — لبنة تُركَّب على بطاقة الرحلة **المُسندة** وحدها.
 *
 * تجيب نصّ المالك (ملحق ٢، الملاحظة ٥): «العميل لا يعرف ما سيأتيه — لا نوع
 * السيارة ولا شكلها ولا رقمها ولا لونها، ولا السائق». والجواب لا يمكن أن يأتي
 * من المنصة: **لا إدارة سائقين هنا** (قرار بدر 2026-08-11)، فالمنفّذ وحده يعرف
 * من سيقود ماذا — ولذلك يُسأل هو، من سجلّه هو، بنقرتين لا بكتابة.
 *
 * ثلاثة قيود تحكم كل ما تحته:
 *
 * (١) **بعد الإسناد لا قبله.** العرض المبثوث على عدة متعهدين لا طاقم له بعد،
 *     ولو عرضنا النموذج عليه لطلبنا من الجميع تجهيز سيارة لرحلة يأخذها واحد.
 *     ولذلك تُركَّب هذه اللبنة على بطاقة «رحلاتي» لا على بطاقة العرض، والقاعدة
 *     ترفض النداء أصلاً بـ`hint = 'forbidden'` لمن ليست الرحلة له.
 *
 * (٢) **معرِّفان لا لقطة.** لا نجمّد اسم السائق ولوحته وقت الحفظ: يبقيان
 *     معرِّفين يُقرآن لحظة قراءتهما، فتصحيحُ لوحةٍ كُتبت خطأً يصل صفحة العميل
 *     فوراً بدل أن يبقى الخطأ مجمَّداً أمامه (`lib/crew-types.ts`).
 *
 * (٣) **الهاتف موقوت، والحجب في القاعدة.** الاسم والمركبة يظهران فور الحفظ،
 *     والهاتف قبل الموعد بمدة تضبطها الإدارة — وتقولها الشاشة صراحةً للمتعهد،
 *     وإلا فسّر شكوى العميل «لا أرى رقماً» عطلاً وراسل الإدارة في كل رحلة.
 */

/* ------------------------------------------------------------------ */
/* رسائل الشاشة — تُدمَج في `ERROR_MESSAGES` عند موضع التركيب              */
/* ------------------------------------------------------------------ */

/**
 * رمزٌ من الرابط ⇒ جملة عربية. الرموز تصنعها `setTripCrew` من `hint` القاعدة،
 * فلا تصل رسالة Postgres خاماً إلى شريك (اسم جدول أو دالة في وجه المستخدم عيبٌ
 * في العرض وتسريبٌ في البنية معاً).
 */
export const CREW_ERROR_MESSAGES: Record<string, string> = {
  crew_input:
    "اختر المركبة والسائق معاً قبل الحفظ — نصف طاقم يترك العميل يسأل «ومن سيأتي؟».",
  /**
   * حارس الحالة الذي أضافته 0043: الرحلة خرجت من يده — أُعيد إسنادها أو رجعت
   * الدورة إلى الطابور. وجملتها منفصلة عن `crew_forbidden` لأن المطلوب مختلف:
   * هنا **لا شيء مطلوب منه**، وهناك يُعيد الاختيار من سجلّه. والجملة تقول له
   * كذلك أن ما سجّله أُزيل من صفحة العميل — يفعله مُشغّل 0043 عند تغيّر
   * `assigned_subcontractor_id` — كي لا يظن أن لوحته ما زالت معروضة على عميل
   * صارت رحلته لغيره.
   */
  crew_stale:
    "لم تعد هذه الرحلة مُسنَدة إليك — أُعيد إسنادها إلى متعهد آخر أو رجعت إلى الطابور. وما كنت سجّلته من مركبة وسائق أُزيل من صفحة العميل تلقائياً، فلا شيء مطلوب منك. حدّث الصفحة وستختفي من قائمتك.",
  crew_forbidden:
    "تعذّر التسجيل: المركبة أو السائق ليسا من سجلّك — أو تغيّر شيء في هذه الرحلة بعد فتحك الصفحة. حدّث الصفحة ثم أعد الاختيار.",
  crew_missing:
    "لم نجد دورة إسناد لهذه الرحلة على الخادم — راسل الإدارة ولا تكرر المحاولة.",
  crew_save: "تعذّر تسجيل المركبة والسائق — أعد المحاولة، وإن تكرر الأمر راسل الإدارة.",
};

/** رسالة النجاح — تشرح ما وصل العميل فوراً وما لم يصله بعد */
export const CREW_SAVED_MESSAGE =
  "سجّلنا مركبة الرحلة وسائقها. يراهما العميل الآن على صفحة متابعته، ويصله هاتف السائق قبل موعد الالتقاء بالمدة التي تحددها الإدارة.";

/* ------------------------------------------------------------------ */
/* عرض السجلّ                                                           */
/* ------------------------------------------------------------------ */

/**
 * وصف المركبة كما يميّزها صاحبها: الاسم واللون واللوحة معاً — فمتعهدٌ بثلاث
 * «إلنترا» لا يميّزها بالاسم وحده، وخطأ الاختيار هنا يصل صفحة العميل مباشرة.
 */
const vehicleText = (vehicle: CrewVehicle) =>
  [vehicle.label || "مركبة بلا اسم", vehicle.color, vehicle.plate].filter(Boolean).join(" · ");

const driverText = (driver: CrewDriver) => driver.name || "سائق بلا اسم";

/**
 * الخيارات المعروضة: العامل وحده — **إلا** المسجَّل حالياً فيبقى ظاهراً ولو
 * أُوقف. وإلا لاستبدله المتصفح صامتاً بأول خيار في القائمة عند أول حفظ، فتتبدل
 * لوحةٌ على صفحة العميل بلا أن يقصد أحد. (نفس علاج `optionsFor` في شاشة الأسطول.)
 */
function toOptions<T extends { id: string; active: boolean }>(
  rows: T[],
  selectedId: string | null,
  label: (row: T) => string,
  stoppedSuffix: string
) {
  return rows
    .filter((row) => row.active || row.id === selectedId)
    .map((row) => ({
      value: row.id,
      label: row.active ? label(row) : `${label(row)} (${stoppedSuffix})`,
    }));
}

/** ما هو مسجَّل الآن بالاسم لا بالمعرّف — و`null` حين لا شيء مسجَّل أو لا نعرف */
function currentLabel(crew: TripCrewRef | null, roster: CrewRoster): string | null {
  if (!crew || (!crew.vehicleId && !crew.driverId)) return null;

  const vehicle = roster.vehicles.find((row) => row.id === crew.vehicleId) ?? null;
  const driver = roster.drivers.find((row) => row.id === crew.driverId) ?? null;

  // معرّف لا نجد صاحبه = صفٌّ حُذف من السجلّ بعد التسجيل: نقولها ولا نعرض فراغاً
  const parts = [
    crew.vehicleId ? (vehicle ? vehicleText(vehicle) : "مركبة محذوفة من سجلّك") : null,
    crew.driverId ? (driver ? driverText(driver) : "سائق محذوف من سجلّك") : null,
  ].filter(Boolean);

  return parts.length > 0 ? parts.join(" — ") : null;
}

/**
 * سجلٌّ لا يصلح للاختيار — يُقال ويُدلّ على مكان علاجه.
 * القائمة الفارغة أسوأ من الرسالة: من يفتحها يظن العطل عندنا، ومن يحفظ بها يُرفض.
 */
function RosterGap({
  text,
  href,
  label,
  icon,
}: {
  text: string;
  href: string;
  label: string;
  icon: ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg bg-background p-3 ring-1 ring-border">
      <p className="min-w-0 flex-1 text-xs leading-5 text-muted-foreground">{text}</p>
      <Link href={href} className={cn(buttonVariants({ variant: "outline", size: "sm" }))}>
        {icon}
        {label}
      </Link>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* اللبنة                                                              */
/* ------------------------------------------------------------------ */

/**
 * `past` تعني رحلة مضت: تُعرض قراءةً لا نموذجاً. تصحيح لوحةٍ بعد تنفيذ الرحلة
 * لا يفيد أحداً، والنموذج المفتوح على الماضي يدعو إلى كتابة بلا معنى.
 *
 * والسجلّ يُقرأ داخل اللبنة نفسها لا يُمرَّر إليها: `loadCrewRoster` مُذاكَرة
 * لكل طلب، فعشر بطاقات في الصفحة = استعلامان لا عشرون، ويبقى التركيب سطراً واحداً.
 */
export async function TripCrewPanel({ trip, past }: { trip: PortalTrip; past?: boolean }) {
  const bookingId = trip.bookingId;

  // بلا معرّف حجز لا عنوان للنداء (رحلة قديمة وصلت بمرجعها وحده) — ولا رحلة ملغاة
  if (!bookingId || trip.status === "cancelled") return null;

  const roster = await loadCrewRoster();
  const crew = trip.crew;
  const current = currentLabel(crew, roster);
  const readOnly = past === true || trip.status === "completed";

  if (readOnly) {
    if (!current) return null;
    return (
      <p className="text-xs leading-5 text-muted-foreground">
        نُفِّذت بـ<span className="font-medium">{current}</span>
        {crew?.at ? ` — سُجّل في ${dateTimeLabel(crew.at)}` : ""}.
      </p>
    );
  }

  const vehicleOptions = toOptions(
    roster.vehicles,
    crew?.vehicleId ?? null,
    vehicleText,
    "متوقفة"
  );
  const driverOptions = toOptions(roster.drivers, crew?.driverId ?? null, driverText, "متوقف");

  const field = (name: string) => `crew-${bookingId}-${name}`;

  return (
    <section className="space-y-3 rounded-xl bg-muted/40 p-4">
      <div className="flex flex-wrap items-center gap-2">
        <CarFront className="size-4 shrink-0 text-primary" aria-hidden="true" />
        <h4 className="font-heading text-sm font-bold">مركبة الرحلة وسائقها</h4>
        {crew?.byAdmin ? (
          <Badge variant="outline">سجّلته الإدارة نيابةً عنك</Badge>
        ) : null}
      </div>

      {/* 🔒 الجملة التي تمنع عشر مراسلات: العميل يرى المركبة والاسم فوراً، والرقم
          قبل الموعد بمهلة تضبطها الإدارة — وغيابه قبلها ليس عطلاً. والمدة نفسها
          لا تُكتب هنا: مقبضٌ في اللوحة، وذكر رقم ثابت يجعل الشاشة تكذب بعد أول تعديل.

          ⚠ وأُضيف **طرف النافذة الثاني** بعد 0043: كانت الجملة تذكر الفتح وتسكت عن
          الإغلاق، فتصير نصف حقيقة — والمتعهد الذي يسأل «لماذا اختفى الرقم من صفحة
          العميل بعد الرحلة؟» لا يجد جواباً في الشاشة التي كتبته. والاثنتا عشرة ساعة
          مكتوبة في القاعدة نصّاً لا في مقبض، فذكرها هنا لا يجعل الشاشة تكذب. */}
      <p className="text-xs leading-5 text-muted-foreground">
        يرى العميل نوع المركبة ولونها ولوحتها واسم السائق <span className="font-medium">فور
        حفظك</span>، أما <span className="font-medium">هاتف السائق</span> فلا يظهر له إلا قبل
        موعد الالتقاء بمدة تحددها الإدارة — فإن قال إنه لا يجد رقماً قبلها فليس عطلاً —
        <span className="font-medium"> ويختفي مرة أخرى بعد الموعد باثنتي عشرة ساعة</span>، فلا
        يبقى رقم سائقك معروضاً على حجزٍ انتهى. ولا تُعرض صور بعد.
      </p>

      {!roster.vehiclesReady || !roster.driversReady ? (
        <Notice tone="warning">
          <p>
            سجلّ السائقين والمركبات غير مكتمل على الخادم بعد، فلا يمكن تسجيل طاقم هذه الرحلة
            الآن. لا شيء مطلوب منك — راجع الإدارة إن تكرر ظهور هذه الرسالة.
          </p>
        </Notice>
      ) : driverOptions.length === 0 ? (
        /* ⚠ الفحص على **الخيارات** لا على طول السجلّ: من كل سائقيه موقوفون سجلُّه
           غير فارغ وقائمته فارغة، وهي الحالة التي تُنتج القائمة الميتة فعلاً. */
        <RosterGap
          icon={<UserRound aria-hidden="true" />}
          href="/portal/drivers"
          label={roster.drivers.length === 0 ? "أضف سائقيك" : "افتح سجل السائقين"}
          text={
            roster.drivers.length === 0
              ? "لم تسجّل أي سائق بعد، ولا يمكن إعلان من سيقود هذه الرحلة قبل ذلك. سجّل سائقيك مرة واحدة، ثم يصير إعلانهم في كل رحلة نقرتين."
              : "كل من في سجلّ سائقيك موقوف الآن، فلا أحد يصلح لهذه الرحلة. أعد تشغيل من سيقودها."
          }
        />
      ) : vehicleOptions.length === 0 ? (
        <RosterGap
          icon={<CarFront aria-hidden="true" />}
          href="/portal/fleet"
          label="افتح أسطولي"
          text={
            roster.vehicles.length === 0
              ? "لم تسجّل أي مركبة بعد، فلا مركبة تُعلن للعميل على هذه الرحلة."
              : "كل مركباتك متوقفة الآن، فلا مركبة تصلح لهذه الرحلة. أعد تشغيل التي ستنفّذها."
          }
        />
      ) : (
        <form action={setTripCrew.bind(null, bookingId)} className="space-y-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <SelectField
              id={field("vehicle")}
              label="المركبة"
              name="vehicle_id"
              defaultValue={crew?.vehicleId ?? ""}
              options={vehicleOptions}
              placeholder="اختر مركبة من أسطولك"
              required
              help="ما يظهر للعميل هو نوعها ولونها ولوحتها — فاختر المركبة التي ستأتي فعلاً."
            />
            <SelectField
              id={field("driver")}
              label="السائق"
              name="driver_id"
              defaultValue={crew?.driverId ?? ""}
              options={driverOptions}
              placeholder="اختر سائقاً من سجلّك"
              required
              help="يظهر اسمه للعميل، ورقم رخصته لا يظهر له إطلاقاً."
            />
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3">
            {/*
              ثلاث جمل لثلاث حالات مختلفة، ولا يجوز خلطها:
              — `crew === null`: لم تُرجع لنا القاعدة الطاقم أصلاً، فلا نزعم علماً.
              — مسجَّل: نقوله بالاسم كي يراجعه صاحبه ويصححه.
              — فارغ ونحن نعلم: نقول «لم تسجّل بعد» صراحةً لأنها حالة تحتاج فعلاً.
            */}
            {current ? (
              <p className="min-w-0 flex-1 text-xs leading-5 text-muted-foreground">
                <Clock className="me-1 inline size-3.5 align-[-2px]" aria-hidden="true" />
                المسجَّل الآن: <span className="font-medium text-foreground">{current}</span>
                {crew?.at ? ` (${dateTimeLabel(crew.at)})` : ""} — عدّله متى شئت ويصل التعديل
                العميل فوراً.
              </p>
            ) : crew ? (
              <p className="min-w-0 flex-1 text-xs leading-5 text-muted-foreground">
                لم تسجّل مركبة ولا سائقاً لهذه الرحلة بعد، والعميل يرى مكانهما فارغاً.
              </p>
            ) : (
              <p className="min-w-0 flex-1 text-xs leading-5 text-muted-foreground">
                اختر المركبة والسائق ثم احفظ — ويمكنك تعديل الاختيار في أي وقت.
              </p>
            )}

            <Button type="submit" size="sm">
              حفظ المركبة والسائق
            </Button>
          </div>
        </form>
      )}
    </section>
  );
}
