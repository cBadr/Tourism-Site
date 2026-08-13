import Link from "next/link";
import { CheckCircle2, Inbox, ShieldCheck, Ticket, X } from "lucide-react";

import {
  amountLabel,
  dateTimeLabel,
  PayoutBlock,
  TripFacts,
  TripNotes,
  TripRoute,
} from "@/components/portal/offer-parts";
import { OfferWindow } from "@/components/portal/offer-window";
import {
  Banners,
  controlClass,
  EmptyState,
  NotReadyNotice,
  Notice,
  PageHeading,
} from "@/components/portal/portal-ui";
import { Button, buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { portalAccess } from "../_lib/session";
import { acceptOffer, rejectOffer } from "./actions";
import { loadOffers, type PortalOffer } from "./data";
import { REJECT_REASONS } from "./reasons";

/**
 * صندوق الطلبات الواردة — الشاشة التي يكسب فيها المتعهد أو يخسر.
 *
 * ثلاثة قرارات تصميمية تحكم كل ما تحته:
 * (١) **المستحق يتصدر البطاقة.** هو الرقم الذي يُبنى عليه القرار، وما دونه سياق.
 * (٢) **المهلة تُعدّ أمام عينه.** «تنتهي بعد ٣٠ دقيقة» جملة تُنسى، والعدّاد النابض
 *     يقول الحقيقة لحظة بلحظة — وحين يبلغ الصفر تُطفأ البطاقة وتُرفع أزرارها بدل
 *     أن تبقى تغري بضغطة يرفضها الخادم.
 * (٣) **لا بيانات عميل هنا إطلاقاً.** لا اسم ولا رقم ولا عنوان دقيق — لا لأن
 *     الواجهة تُخفيها، بل لأن `portal_offers()` لا تُرجعها أصلاً. القبول وحده
 *     يفتح بيانات التنفيذ في «رحلاتي».
 *
 * والخسارة ليست عطلاً: من يصل ثانياً يقرأ «سبقك متعهد آخر» بنبرة الخبر، فهذه هي
 * قاعدة اللعبة المعلنة لا خلل فيها.
 */

export const metadata = { title: "طلبات واردة" };

const ERROR_MESSAGES: Record<string, string> = {
  save: "تعذر تسجيل ردك على العرض — أعد المحاولة، وإن تكرر الأمر راسل الإدارة فوراً فالمهلة تجري.",
  schema: "خدمة بث الطلبات غير مُركَّبة على الخادم بعد — لا إجراء مطلوب منك، والإدارة على علم.",
};

/** نتائج طبيعية لا أخطاء — لذلك تُعرض بنبرة الخبر لا بنبرة الفشل */
const OUTCOMES: Record<string, { tone: "info" | "warning"; title: string; body: string }> = {
  already_assigned: {
    tone: "info",
    title: "سبقك متعهد آخر إلى هذه الرحلة",
    body: "الرحلة تُسند لأول متعهد يقبلها، وقد أُغلقت قبل وصول ردك. لا شيء عليك — العروض التالية تصلك بنفس الطريقة، والسرعة وحدها هي الفارق.",
  },
  expired: {
    tone: "warning",
    title: "انتهت مهلة هذا العرض",
    body: "مهلة الرد انقضت قبل وصول قبولك فأُغلق العرض. إن تكرر الأمر فراجع وصول تنبيهاتك حتى تصلك العروض لحظة بثها.",
  },
  not_pending: {
    tone: "info",
    title: "لم يعد هذا العرض مفتوحاً للرد",
    body: "ربما رددت عليه من جهاز آخر، أو أُلغي الحجز، أو سحبته الإدارة إلى الإسناد اليدوي.",
  },
  gone: {
    tone: "info",
    title: "لم نعد نجد هذا العرض",
    body: "أُغلق العرض وأُزيل من صندوقك. حدّث الصفحة لترى ما هو مفتوح الآن.",
  },
};

/* ------------------------------------------------------------------ */
/* الإجراءات داخل البطاقة                                               */
/* ------------------------------------------------------------------ */

/**
 * خطوة تأكيد صريحة قبل القبول. ليست احتياطاً من الضغط الخاطئ فحسب: القبول التزام
 * تشغيلي أمام عميل دفع فعلاً، فيُقرأ نصه قبل تثبيته — الموعد والفئة والمستحق
 * وأثر الاعتذار، كلها مكتوبة في مكان القرار لا في صفحة شروط.
 */
function OfferActions({ offer }: { offer: PortalOffer }) {
  return (
    <div className="grid gap-2 sm:grid-cols-2 sm:items-start">
      <details className="min-w-0">
        <summary
          className={cn(
            buttonVariants({ size: "lg" }),
            "w-full cursor-pointer list-none justify-center [&::-webkit-details-marker]:hidden"
          )}
        >
          <CheckCircle2 aria-hidden="true" />
          قبول الرحلة
        </summary>

        <div className="mt-2 space-y-3 rounded-xl bg-emerald-50 p-3 text-sm leading-relaxed ring-1 ring-emerald-200 dark:bg-emerald-950/50 dark:ring-emerald-800">
          <p className="font-semibold">بتأكيد القبول تلتزم بالآتي:</p>
          <ul className="list-disc space-y-1 ps-4">
            <li>
              تنفيذ الرحلة في موعدها ({dateTimeLabel(offer.pickupAt)}) بمركبة من فئة{" "}
              <span className="font-medium">{offer.classTitle || "المطلوبة"}</span>.
            </li>
            <li>
              تُغلق الرحلة أمام باقي المتعهدين فور قبولك، وتظهر لك بيانات تواصل العميل في «رحلاتي»
              لتنسيق الاستلام.
            </li>
            <li>
              مستحقك{" "}
              <span className="font-semibold">{amountLabel(offer.payout, offer.currency)}</span>{" "}
              مثبت بهذا القبول ولا يتغير بعده.
            </li>
            <li>
              الاعتذار بعد القبول يُربك عميلاً دفع بالفعل ويُسجَّل في ملفك — لا تقبل إلا وأنت قادر
              على التنفيذ.
            </li>
          </ul>
          <form action={acceptOffer.bind(null, offer.offerId)}>
            <Button type="submit" size="lg">
              <CheckCircle2 aria-hidden="true" />
              تأكيد القبول
            </Button>
          </form>
        </div>
      </details>

      <details className="min-w-0">
        <summary
          className={cn(
            buttonVariants({ variant: "outline", size: "lg" }),
            "w-full cursor-pointer list-none justify-center [&::-webkit-details-marker]:hidden"
          )}
        >
          <X aria-hidden="true" />
          رفض
        </summary>

        <form
          action={rejectOffer.bind(null, offer.offerId)}
          className="mt-2 space-y-3 rounded-xl bg-muted/60 p-3"
        >
          <p className="text-xs leading-5 text-muted-foreground">
            الرفض السريع أنفع للجميع من ترك العرض حتى تنتهي مهلته: الرحلة تنتقل إلى متعهد آخر فوراً.
            السبب اختياري ولا يُعرض على العميل.
          </p>

          <div className="space-y-1.5">
            <label htmlFor={`reason-${offer.offerId}`} className="text-sm font-medium">
              سبب الاعتذار (اختياري)
            </label>
            <select
              id={`reason-${offer.offerId}`}
              name="reason"
              defaultValue=""
              className={controlClass}
            >
              <option value="">بلا سبب محدد</option>
              {REJECT_REASONS.map((reason) => (
                <option key={reason.value} value={reason.value}>
                  {reason.label}
                </option>
              ))}
            </select>
          </div>

          <div className="space-y-1.5">
            <label htmlFor={`note-${offer.offerId}`} className="text-sm font-medium">
              تفصيل إضافي (اختياري)
            </label>
            <textarea
              id={`note-${offer.offerId}`}
              name="note"
              rows={2}
              maxLength={300}
              placeholder="سطر واحد يشرح الموقف — يقرؤه فريق التشغيل وحده."
              className={controlClass}
            />
          </div>

          <Button type="submit" variant="destructive" size="sm">
            <X aria-hidden="true" />
            تأكيد الرفض
          </Button>
        </form>
      </details>
    </div>
  );
}

/** `now` قراءة ساعة الخادم من `loadOffers` — لا يُقرأ الوقت داخل التصيير */
function OfferCard({ offer, now }: { offer: PortalOffer; now: number }) {
  const remaining = offer.expiresAt ? Date.parse(offer.expiresAt) - now : 0;

  return (
    <OfferWindow
      expiresAt={offer.expiresAt}
      initialRemainingMs={Number.isFinite(remaining) ? remaining : 0}
      actions={<OfferActions offer={offer} />}
    >
      <div className="space-y-4">
        <div className="flex flex-wrap items-center gap-2">
          <Ticket className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
          <span className="text-xs text-muted-foreground">رقم الطلب</span>
          <span dir="ltr" className="font-medium tabular-nums">
            {offer.reference || "—"}
          </span>
        </div>

        <PayoutBlock payout={offer.payout} currency={offer.currency} roundTrip={offer.roundTrip} />
        <TripRoute
          originLabel={offer.originLabel}
          destLabel={offer.destLabel}
          roundTrip={offer.roundTrip}
        />
        <TripFacts trip={offer} />
        <TripNotes notes={offer.notes} />
      </div>
    </OfferWindow>
  );
}

/* ------------------------------------------------------------------ */
/* الصفحة                                                              */
/* ------------------------------------------------------------------ */

export default async function PortalRequestsPage({ searchParams }: PageProps<"/portal/requests">) {
  const [params, access] = await Promise.all([searchParams, portalAccess()]);
  // الغلاف يعرض شاشة الحالة المناسبة؛ الصفحة لا تُصيَّر أصلاً في تلك الحالات
  if (!access.ok) return null;

  const { offers, ready, failed, now } = await loadOffers();

  const rejected = params.rejected === "1";
  const error = typeof params.error === "string" ? params.error : null;
  const outcomeKey = typeof params.outcome === "string" ? params.outcome : null;
  const outcome = outcomeKey ? OUTCOMES[outcomeKey] : undefined;

  return (
    <div className="space-y-6">
      <PageHeading
        title="طلبات واردة"
        help="العروض تصلك بعد أن يدفع العميل ويؤكد التشغيل الحجز — لا نبثّ طلباً غير مدفوع."
      >
        كل بطاقة هنا رحلة تغطيها قائمة أسعارك، ومعها مستحقك ومهلة للرد. أول من يقبل تُسند إليه
        الرحلة ويُغلق العرض أمام الباقين.
      </PageHeading>

      <Banners
        saved={rejected}
        error={error}
        errorMessages={ERROR_MESSAGES}
        savedMessage="سجّلنا اعتذارك عن الرحلة، وانتقلت إلى متعهد آخر. لن تظهر لك مرة أخرى."
      />

      {outcome ? (
        <Notice tone={outcome.tone}>
          <p className="font-semibold">{outcome.title}</p>
          <p>{outcome.body}</p>
        </Notice>
      ) : null}

      {!ready ? <NotReadyNotice what="صندوق الطلبات" /> : null}

      {/* فشل القراءة ≠ صندوق فارغ — لا يُقال للمتعهد «لا عروض» ونحن لا نعلم */}
      {failed ? (
        <Notice tone="danger">
          <p className="font-semibold">تعذر تحميل صندوق الطلبات</p>
          <p>
            لم نتمكن من قراءة عروضك الآن، وقد تكون هناك عروض مفتوحة لا تظهر هنا. حدّث الصفحة، وإن
            تكرر الأمر راسل الإدارة فوراً — المهلة تجري ولا تنتظر.
          </p>
        </Notice>
      ) : null}

      {ready && !failed && offers.length === 0 ? (
        <EmptyState
          icon={<Inbox className="size-5" aria-hidden="true" />}
          title="لا عروض بانتظار ردك الآن"
          action={
            <Link href="/portal/prices" className={cn(buttonVariants({ variant: "outline" }))}>
              راجع قوائم أسعاري
            </Link>
          }
        >
          يصلك عرض هنا حين يدفع عميل ثمن رحلة تقع بدايتها ونهايتها داخل نطاق إحدى قوائم أسعارك
          المعتمدة، وتكون الفئة المطلوبة مُسعَّرة فيها. كلما اتسعت تغطيتك المعتمدة زادت العروض التي
          تصلك.
        </EmptyState>
      ) : null}

      {offers.map((offer) => (
        <OfferCard key={offer.offerId} offer={offer} now={now} />
      ))}

      {ready && offers.length > 0 ? (
        <Notice tone="info" icon={<ShieldCheck className="size-5 shrink-0" aria-hidden="true" />}>
          <p className="mb-2 font-semibold">كيف يعمل الصندوق؟</p>
          <ul className="space-y-1.5">
            <li>
              <span className="font-medium">أول قابل يفوز.</span> لحظة قبول أحد المتعهدين تُغلق
              الرحلة ويختفي العرض من صناديق الباقين.
            </li>
            <li>
              <span className="font-medium">المهلة تُضبط من الإدارة.</span> بانقضائها بلا رد يُعاد
              بث الطلب أو يتحول إلى فريق التشغيل — والتجاهل المتكرر يقلل ما يصلك.
            </li>
            <li>
              <span className="font-medium">بيانات العميل بعد القبول.</span> الاسم والرقم لا يظهران
              قبل الإسناد، صوناً لبيانات العميل ولحدود العلاقة.
            </li>
          </ul>
        </Notice>
      ) : null}
    </div>
  );
}
