import { AlertTriangle, CheckCircle2, Clock, Scale, X } from "lucide-react";

import { dateTimeLabel } from "@/components/portal/offer-parts";
import { Button, buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { controlClass } from "@/components/portal/portal-ui";
import {
  fileTripGrievance,
  requestTripCompletion,
  withdrawFromTrip,
} from "../requests/actions";
import type { ApologyOptions, PortalTrip } from "../requests/data";

/**
 * إغلاق الرحلة من جهة الشريك — ثلاثة أبواب في مكانٍ واحد: **يطلب الإتمام**، أو
 * **يعتذر**، أو **يتظلّم** (هجرتا `0119` و`0121`).
 *
 * ══════════════════════════════════════════════════════════════════════════
 *  🔴 لماذا الزرّ اسمه «أعلن إتمام الرحلة» ولا «تمّت الرحلة»
 * ══════════════════════════════════════════════════════════════════════════
 *
 * لأن الضغطة **لا تُتمّ شيئاً**: الاكتمال يحرّك دفتر المالك ويسكّ نقاط العميل في
 * اللحظة نفسها، فوُضعت بينهما بوابة — تعتمد الإدارة، أو يمضي أجلٌ من اللوحة.
 * وزرٌّ يقول «تمّت» يجعل الشريك ينتظر مستحقاً ظنّ أنه استحقّ، فيقرأ التأخير
 * مماطلةً. فالنصّ هنا يقول ما يحدث فعلاً، ويقول **متى** يقع الاعتماد التلقائي
 * بتاريخه لا بعبارة «قريباً».
 *
 * وهذا تطبيقٌ مباشر للنمط ٢ في `handover/LESSONS.md`: كل جملةٍ على شاشةٍ تدّعي
 * إنفاذاً هي ادعاءٌ يُتحقق منه — وهذه تدّعي أن المال لا يتحرك، وهو **مقيسٌ**
 * في `completion_apology_tests.sql` قسم (ج).
 *
 * ══════════════════════════════════════════════════════════════════════════
 *  الاعتذار: ماذا يُعرض وماذا يُحجَب — وكلاهما بقصد (‏`0145`)
 * ══════════════════════════════════════════════════════════════════════════
 *
 * 🔒 **لا مبلغَ خصمٍ بجوار السبب.** الحجبُ بنيويّ لا انضباطيّ:
 *    `portal_apology_reasons()` لا تحمل `default_deduct_amount` في نوع إرجاعها
 *    أصلاً. والمبلغ اقتراحٌ مسقوفٌ بمستحق الرحلة لا يُنفَّذ إلا بقرارٍ إداريٍّ
 *    بمبرَّرٍ مكتوب — فرقمٌ هنا يَعِد بما لا تنفّذه القاعدة (النمط ٢).
 *
 * 🔴 **لكنّ وجودَ الأثر يُعرض** — وسم «قد يترتب عليه خصم» على السبب الذي يحمله.
 *    والسببُ التزامٌ تعاقديّ لا تفضيلٌ تصميميّ: البند ٥ يقول «ولكل سبب أثرٌ مالي
 *    **معلوم مسبقاً**»، ويُفصح بنفسه عن أحدها («والانسحاب لظرف قاهر لا يترتب عليه
 *    خصم»). واختيارٌ أعمى بين سببٍ بثمنٍ وسببٍ بلا ثمن ليس اختياراً. والوسمُ
 *    مشتقٌّ من مفتاح اللوحة الحيّ، فما دام الخصمُ على الاعتذار مطفأً فلا وسمَ
 *    على شيء — ولا تحذيرَ من عقوبةٍ لا تقع.
 *
 * 🔒 **ولا رقمَ تكلفةٍ ولا هامشٍ ولا مرجعِ عميل** — لا وجود لها في `portal_trips()`.
 *
 * ⚠ **والتأكيدُ قبل الضغط تأكيدُ واجهةٍ لا حارس**: الحارسُ الحقيقيّ في
 *    `withdraw_from_trip` (الإسنادُ لك، والحالةُ تقبل، والسببُ من الكتالوج).
 *    وخانةُ التأكيد تمنع الضغطةَ الشاردة ولا تُستبدَل بها القاعدة.
 */

/** ما يُعرض للشريك عن وجهة رحلته بعد الاعتذار — نصٌّ لا رقم سياسة */
function routeHint(hours: number | null, threshold: number | null): string {
  if (threshold === null || hours === null) {
    return "سنراجع الرحلة يدوياً ونعيد ترتيبها — وقد نتواصل معك للتأكد.";
  }
  return hours >= threshold
    ? "الوقت المتبقي يتّسع لموجة عرضٍ جديدة، فتنتقل الرحلة إلى متعهدٍ آخر تلقائياً."
    : "الموعد قريب، فتذهب الرحلة إلى الإسناد اليدوي وينبَّه فريق التشغيل فوراً.";
}

/** الساعات المتبقية على الانطلاق — عرضٌ محض، والقرار تتخذه القاعدة وحدها */
function hoursToPickup(pickupAt: string | null, now: number): number | null {
  if (!pickupAt) return null;
  const at = Date.parse(pickupAt);
  if (!Number.isFinite(at)) return null;
  return (at - now) / 3_600_000;
}

function CompletionState({ trip }: { trip: PortalTrip }) {
  const completion = trip.completion;
  if (!completion || completion.status !== "pending") return null;

  return (
    <div className="space-y-2 rounded-xl bg-amber-50 p-3 text-sm leading-relaxed ring-1 ring-amber-200 dark:bg-amber-950/50 dark:ring-amber-800">
      <p className="flex items-center gap-1.5 font-semibold">
        <Clock className="size-4 shrink-0" aria-hidden="true" />
        أعلنتَ إتمام هذه الرحلة — بانتظار اعتماد الإدارة
      </p>
      <p>
        مستحقك يُقيَّد في حسابك لحظة الاعتماد لا قبله.
        {completion.autoApproveAt ? (
          <>
            {" "}
            وإن لم تصدر الإدارة قراراً حتى{" "}
            <span className="font-semibold">{dateTimeLabel(completion.autoApproveAt)}</span> فيُعتمد
            تلقائياً.
          </>
        ) : null}
      </p>
    </div>
  );
}

function RejectedState({ trip }: { trip: PortalTrip }) {
  const completion = trip.completion;
  if (!completion || completion.status !== "rejected") return null;

  return (
    <div className="space-y-2 rounded-xl bg-red-50 p-3 text-sm leading-relaxed ring-1 ring-red-200 dark:bg-red-950/50 dark:ring-red-800">
      <p className="flex items-center gap-1.5 font-semibold">
        <AlertTriangle className="size-4 shrink-0" aria-hidden="true" />
        لم تُعتمد هذه الرحلة مكتملة
      </p>
      {completion.note ? <p>سبب الإدارة: {completion.note}</p> : null}
      <p>راجع الملاحظة أعلاه، وإن كنت ترى القرار غير صحيح فافتح تظلّماً من الأسفل.</p>
    </div>
  );
}

/**
 * لوحةُ الإغلاق كاملةً — وتُرسم على **الرحلة المُسنَدة الجارية وحدها**.
 *
 * والرحلةُ التي مضت (`past`) تُعرض بلا أزرار كما تفعل لوحةُ الطاقم حرفاً بحرف:
 * إعلانُ إتمامٍ بعد أن أُغلقت الرحلة لا يفيد أحداً، ويترك زرّاً يضغطه الشريك
 * فيقرأ رفضاً — وزرٌّ يُرفض دائماً أسوأ من زرٍّ غائب.
 */
export function TripClosurePanel({
  trip,
  apology,
  now,
  past,
}: {
  trip: PortalTrip;
  apology: ApologyOptions;
  now: number;
  past?: boolean;
}) {
  const bookingId = trip.bookingId;
  if (!bookingId) return null;

  const assigned = trip.status === "assigned" || trip.status === null;
  const pending = trip.completion?.status === "pending";
  const hours = hoursToPickup(trip.pickupAt, now);

  // الرحلة انتهت أو خرجت من يده: سطرُ تظلّمٍ وحده — البابُ يبقى مفتوحاً بعد القرار
  if (past || !assigned) {
    if (trip.status !== "failed" && trip.status !== "completed") return null;
    return <GrievanceForm bookingId={bookingId} kind="failure" />;
  }

  return (
    <div className="space-y-3">
      <CompletionState trip={trip} />
      <RejectedState trip={trip} />

      {!pending ? (
        <div className="grid gap-2 sm:grid-cols-2 sm:items-start">
          {/* ── الباب الأول: إعلان الإتمام ─────────────────────────────── */}
          <details className="min-w-0">
            <summary
              className={cn(
                buttonVariants({ size: "lg" }),
                // ‏٤٤ بكسل هدفَ لمسٍ — والبابان متجاوران فيتساويان
                "min-h-11 w-full cursor-pointer list-none justify-center [&::-webkit-details-marker]:hidden"
              )}
            >
              <CheckCircle2 aria-hidden="true" />
              أعلن إتمام الرحلة
            </summary>

            <div className="mt-2 space-y-3 rounded-xl bg-emerald-50 p-3 text-sm leading-relaxed ring-1 ring-emerald-200 dark:bg-emerald-950/50 dark:ring-emerald-800">
              <p className="font-semibold">ماذا يحدث بالضبط؟</p>
              <ul className="list-disc space-y-1 ps-4">
                <li>
                  يصل إعلانك إلى الإدارة، و<span className="font-semibold">لا يُقيَّد مستحقك بعد</span> —
                  الرحلة تبقى «مُسندة» حتى يُعتمد الإعلان.
                </li>
                <li>
                  تعتمده الإدارة، أو يُعتمد تلقائياً بعد المهلة المعلنة إن لم يصدر قرار — وعندها
                  وحدها يُقيَّد المستحق.
                </li>
                <li>وإن رأت الإدارة خلاف ذلك فسترى سببها هنا، ولك أن تتظلّم.</li>
              </ul>
              <form action={requestTripCompletion.bind(null, bookingId)}>
                <Button type="submit" size="lg" className="min-h-11 px-4">
                  <CheckCircle2 aria-hidden="true" />
                  تأكيد الإعلان
                </Button>
              </form>
            </div>
          </details>

          {/* ── الباب الثاني: الاعتذار ─────────────────────────────────── */}
          {apology.ready ? (
            <details className="min-w-0">
              <summary
                className={cn(
                  buttonVariants({ variant: "outline", size: "lg" }),
                  "min-h-11 w-full cursor-pointer list-none justify-center [&::-webkit-details-marker]:hidden"
                )}
              >
                <X aria-hidden="true" />
                اعتذر عن الرحلة
              </summary>

              <form
                action={withdrawFromTrip.bind(null, bookingId)}
                className="mt-2 space-y-3 rounded-xl bg-muted/60 p-3"
              >
                <p className="text-xs leading-5 text-muted-foreground">
                  الاعتذار مبكراً أنفع للجميع من رحلةٍ تفشل في موعدها:{" "}
                  {routeHint(hours, apology.thresholdHours)} والاعتذار يُسجَّل في ملفك، والسبب
                  الصادق أنفع لك من الأقرب — به تُقاس الحالات ويُنصَف من له عذر.
                </p>

                <div className="space-y-1.5">
                  <label htmlFor={`wreason-${bookingId}`} className="text-sm font-medium">
                    سبب الاعتذار
                  </label>
                  <select
                    id={`wreason-${bookingId}`}
                    name="reason"
                    required
                    defaultValue=""
                    className={cn(controlClass, "min-h-11")}
                  >
                    <option value="" disabled>
                      اختر السبب
                    </option>
                    {apology.reasons.map((reason) => (
                      /*
                        الوسمُ في نصّ الخيار نفسه لا في شارةٍ بجواره: `<option>`
                        لا يقبل تنسيقاً، وقارئُ الشاشة ينطق النصّ كاملاً — فيصل
                        الإفصاحُ بالسمع كما يصل بالنظر.
                      */
                      <option key={reason.slug} value={reason.slug}>
                        {reason.mayDeduct ? `${reason.label} — قد يترتب عليه خصم` : reason.label}
                      </option>
                    ))}
                  </select>
                  {apology.reasons.some((reason) => reason.mayDeduct) ? (
                    <p className="text-xs leading-5 text-muted-foreground">
                      وما وُسم بـ«قد يترتب عليه خصم» فالقرارُ فيه إداريٌّ لا آليّ: لا يقع بلا
                      مبرَّرٍ مكتوب يصلك في «خصومات على حسابك»، ولا يتجاوز مستحقَّ الرحلة، ولك
                      الاعتراض عليه من بطاقتها.
                    </p>
                  ) : null}
                </div>

                <div className="space-y-1.5">
                  <label htmlFor={`wnote-${bookingId}`} className="text-sm font-medium">
                    تفصيل إضافي (اختياري)
                  </label>
                  <textarea
                    id={`wnote-${bookingId}`}
                    name="note"
                    rows={2}
                    maxLength={500}
                    placeholder="سطر واحد يشرح الموقف — يقرؤه فريق التشغيل وحده."
                    className={controlClass}
                  />
                </div>

                {/*
                  خانةُ تأكيدٍ **إلزامية** قبل فعلٍ لا رجعةَ فيه من هنا: الرحلة
                  تُسحب من جدولك وتعود إلى الدورة، ولا زرَّ يُعيدها. و`required`
                  يعمل بلا جافاسكربت وبلوحة المفاتيح — ولا يُغني عن حارس القاعدة.
                */}
                <label
                  htmlFor={`wconfirm-${bookingId}`}
                  className="flex min-h-11 items-start gap-2 py-1 text-sm leading-relaxed"
                >
                  <input
                    id={`wconfirm-${bookingId}`}
                    type="checkbox"
                    name="confirm"
                    required
                    className="mt-1 size-5 shrink-0 accent-destructive"
                  />
                  <span>
                    أؤكد أنني لن أنفّذ هذه الرحلة، وأنها تُسحب من جدولي فور التأكيد ولا تعود
                    إليّ إلا بعرضٍ جديد.
                  </span>
                </label>

                <Button type="submit" variant="destructive" size="lg" className="min-h-11 px-4">
                  <X aria-hidden="true" />
                  تأكيد الاعتذار
                </Button>
              </form>
            </details>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

/**
 * التظلّم — بابٌ يُطرَق بعد القرار لا قبله.
 *
 * وهو **قرار المالك مقروناً بالخصم**: عقوبةٌ بلا مراجعة تُفقد الثقة أكثر مما
 * تحمي. ولا يبتّ فيه صاحبه، وقبولُه لا يردّ مالاً من تلقائه — ردُّ الخصم حركةٌ
 * مسمّاة في الدفتر يجريها المشرف بيده.
 */
function GrievanceForm({ bookingId, kind }: { bookingId: string; kind: "failure" | "apology" }) {
  return (
    <details className="min-w-0">
      <summary
        className={cn(
          buttonVariants({ variant: "ghost", size: "sm" }),
          "w-fit cursor-pointer list-none [&::-webkit-details-marker]:hidden"
        )}
      >
        <Scale aria-hidden="true" />
        لديّ اعتراض على قرار هذه الرحلة
      </summary>

      <form
        action={fileTripGrievance.bind(null, bookingId)}
        className="mt-2 space-y-3 rounded-xl bg-muted/60 p-3"
      >
        <input type="hidden" name="kind" value={kind} />
        <p className="text-xs leading-5 text-muted-foreground">
          اشرح ما حدث من وجهة نظرك. يصل اعتراضك إلى الإدارة بنصّه، وتردّ عليك بقرارٍ مكتوب —
          ولك تظلّمٌ واحد مفتوح على كل رحلة.
        </p>
        <textarea
          name="body"
          rows={3}
          required
          minLength={10}
          maxLength={2000}
          placeholder="ما الذي جرى فعلاً؟ عشرة أحرف على الأقل."
          className={controlClass}
        />
        <Button type="submit" variant="outline" size="sm">
          <Scale aria-hidden="true" />
          أرسل الاعتراض
        </Button>
      </form>
    </details>
  );
}
