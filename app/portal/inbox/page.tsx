import { Fragment } from "react";
import Link from "next/link";
import { Archive, BellRing, CheckCheck, Inbox, MailOpen } from "lucide-react";

import { formatDistance, passengersLabel, waitingLabel } from "@/components/booking/format";
import { amountLabel, dateTimeLabel } from "@/components/portal/offer-parts";
import {
  Banners,
  EmptyState,
  NotReadyNotice,
  Notice,
  PageHeading,
  countLabel,
} from "@/components/portal/portal-ui";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { eventEmoji, eventTitle } from "@/lib/notifications/render";
import type { PortalInboxItem } from "@/lib/partner-alerts-types";
import { cn } from "@/lib/utils";
import { StageLock } from "../_components/stage-lock";
import { portalAccess, readPortalGate } from "../_lib/session";
import { markInboxAllRead, markInboxItemRead } from "./actions";
import { loadInbox, summaryBool, summaryNumber, summaryStops, summaryText } from "./data";

/**
 * صندوق التنبيهات في البورتال — ج٣ من
 * `docs/phase-briefs/FAILED-TRIPS-AND-PARTNER-ALERTS.md`.
 *
 * ⚠ **وأهم سطر في هذه الشاشة ليس كوداً بل نصّاً**: الصندوق **سجلٌّ لا قناة**.
 * تصميمُ نظام التنبيهات كله يقوم على تمييزٍ واحد — «مطلوبة» ≠ «بالغة» — و`inbox`
 * خارج `REACHING_CHANNELS` **بقرار**: قناةٌ تستلزم أن ينظر صاحبها ليست بلوغاً،
 * واعتبارها كذلك يُسكت الاحتياطي في الحالة التي وُجد لها بالضبط. فمتعهدٌ يظن
 * هذه الشاشة «مكان وصول العروض» سيغلق قنواته الحقيقية ويفوته كل شيء، ثم يقول
 * «لم يصلني عرض» — وهو محقّ. لذلك تقول الشاشة ذلك بنصّها ثلاث مرات: في وصف
 * العنوان، وفي بطاقة صريحة أعلى القائمة، وفي الحالة الفارغة.
 *
 * وماذا يفيد إذن؟ ثلاثة أشياء لا تفيدها القنوات البالغة:
 * ١) **ما وصل ومتى** — مرجعٌ عند الخلاف على «هل عُرضت عليّ هذه الرحلة؟».
 * ٢) **ما لم يُقرأ** — من فتح تليجرام ولم ينتبه يجد الأثر هنا.
 * ٣) **ماذا كان الإشعار** — الملخّص العام للرحلة، بلا أي بيانات عميل.
 *
 * 🔒 وما لا يظهر هنا أبداً: اسم العميل ورقمه وإجمالي حجزه — لا لأن الشاشة
 * تُخفيها بل لأن `portal_inbox()` لا تُرجعها أصلاً (قائمة بيضاء من المفاتيح).
 */

export const metadata = { title: "صندوق التنبيهات" };

const ERROR_MESSAGES: Record<string, string> = {
  save: "تعذر تعليم التنبيهات مقروءة — أعد المحاولة.",
  schema: "خدمة التنبيهات غير مُركَّبة على الخادم بعد — لا إجراء مطلوب منك.",
  notfound: "لم نعثر على هذا التنبيه — ربما عُلّم مقروءاً من جهاز آخر.",
};

/* ------------------------------------------------------------------ */
/* بطاقة التنبيه                                                        */
/* ------------------------------------------------------------------ */

/**
 * سطر حقيقة واحد. و**الغياب حذفٌ لا صفر**: `summary` مبنيّ بـ`jsonb_strip_nulls`،
 * فإشعارُ إلغاءٍ لا يحمل مستحقاً ولا مسافة. كتابة «٠ كم» عمّا لم يصل أسوأ من
 * صمتٍ عنه (القاعدة ١٥ في `handover/INDEX.md`: «لا نعرف» و«صفر» شيئان).
 */
function Fact({ label, value }: { label: string; value: string | null }) {
  if (!value) return null;
  return (
    <div className="min-w-0 rounded-lg bg-muted/60 px-2.5 py-1.5">
      <dt className="text-[11px] text-muted-foreground">{label}</dt>
      <dd className="mt-0.5 truncate text-sm font-medium">{value}</dd>
    </div>
  );
}

function InboxCard({ item }: { item: PortalInboxItem }) {
  const unread = item.readAt === null;
  const s = item.summary;

  const origin = summaryText(s, "originLabel");
  const dest = summaryText(s, "destLabel");
  const payout = summaryNumber(s, "payout");
  const distance = summaryNumber(s, "distanceKm");
  const passengers = summaryNumber(s, "passengers");
  const waiting = summaryNumber(s, "waitingHours");
  const round = summaryNumber(s, "round");
  const pickupAt = summaryText(s, "pickupAt");
  const classTitle = summaryText(s, "classTitle");
  const stops = summaryStops(s);
  const hasRoute = Boolean(origin || dest);

  return (
    <Card className={cn("gap-3 p-4", unread ? "border-primary/40 bg-primary/5" : "bg-muted/20")}>
      <div className="flex flex-wrap items-center gap-2">
        <span aria-hidden="true" className="text-base leading-none">
          {eventEmoji(item.event)}
        </span>
        <span className="font-medium">{eventTitle(item.event)}</span>
        {unread ? (
          <Badge className="h-5 px-1.5 text-[10px]">جديد</Badge>
        ) : (
          <span className="sr-only">مقروء</span>
        )}
        {item.bookingReference ? (
          <span dir="ltr" className="text-xs tabular-nums text-muted-foreground">
            {item.bookingReference}
          </span>
        ) : null}
        <span className="ms-auto text-xs text-muted-foreground">
          {dateTimeLabel(item.createdAt)}
        </span>
      </div>

      {/*
        🔴 المحطاتُ **داخل سطر المسار** لا في بطاقةِ حقيقةٍ منفصلة أسفله.
        فالمسارُ يُقرأ نظرةً واحدة، ومحطةٌ في صندوقٍ جانبيٍّ تحت «الركاب» تقول
        للقارئ إنها تفصيلٌ ثانويّ — وهي التي تجعل الرحلة أطول. وترتيبُها هو
        ترتيبُ القيادة، فلا يُعرض مرتَّباً هجائياً ولا مطوياً خلف «المزيد».
      */}
      {hasRoute ? (
        <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm">
          <span className="font-medium">{origin ?? "—"}</span>
          {stops.map((label, index) => (
            <Fragment key={`${index}-${label}`}>
              <span aria-hidden="true" className="text-muted-foreground">
                ←
              </span>
              <span className="font-medium text-amber-700 dark:text-amber-500">
                {label}
                <span className="sr-only"> (محطة في الطريق)</span>
              </span>
            </Fragment>
          ))}
          <span aria-hidden="true" className="text-muted-foreground">
            ←
          </span>
          <span className="font-medium">{dest ?? "—"}</span>
          {summaryBool(s, "roundTrip") ? (
            <Badge variant="outline" className="ms-1">
              ذهاب وعودة
            </Badge>
          ) : null}
        </p>
      ) : null}

      <dl className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
        <Fact
          label="مستحقك"
          value={payout === null ? null : amountLabel(payout, summaryText(s, "currency"))}
        />
        <Fact label="موعد الانطلاق" value={pickupAt ? dateTimeLabel(pickupAt) : null} />
        <Fact label="الفئة المطلوبة" value={classTitle} />
        <Fact label="الركاب" value={passengers === null ? null : passengersLabel(passengers)} />
        {/*
          الوسمُ يتبع الرقم: `distanceKm` مجموعُ الأرجل، و«المسافة (اتجاه واحد)»
          تُقرأ «من المنطلق إلى الوجهة» فتجعل المتعهد يظنّ الرقم أكبرَ ممّا يبرّره
          طرفاه. رقمٌ صادقٌ بوسمٍ كاذب أسوأ من غيابه.
        */}
        <Fact
          label={stops.length > 0 ? "إجمالي المسافة عبر المحطات" : "المسافة (اتجاه واحد)"}
          value={distance === null ? null : formatDistance(distance)}
        />
        <Fact label="الانتظار" value={waiting === null ? null : waitingLabel(waiting)} />
        <Fact label="موجة البث" value={round === null ? null : `الموجة ${countLabel(round)}`} />
      </dl>

      {/*
        زرّ «مقروء» على السطر الواحد — نموذج خادمي بلا حالة عميل: القرار يُكتب في
        القاعدة ثم تُعاد قراءة الشاشة، فلا علامة محلية تدّعي ما لم يُحفَظ.
        و**لا زرّ «افتح العرض» هنا بقصد**: هذا سجلٌّ، والعرض قد تكون مهلته انتهت
        منذ ساعات — رابطٌ يَعِد بقرارٍ لم يعد قائماً أسوأ من غيابه.
      */}
      {unread ? (
        <form action={markInboxItemRead} className="flex justify-end">
          <input type="hidden" name="id" value={item.id} />
          <Button type="submit" variant="outline" size="sm">
            <MailOpen aria-hidden="true" />
            علّم مقروءاً
          </Button>
        </form>
      ) : null}
    </Card>
  );
}

/* ------------------------------------------------------------------ */
/* الشاشة                                                              */
/* ------------------------------------------------------------------ */

export default async function PortalInboxPage({ searchParams }: PageProps<"/portal/inbox">) {
  const [params, access, gate] = await Promise.all([
    searchParams,
    portalAccess(),
    readPortalGate(),
  ]);

  if (!access.ok) {
    // نظير `requests` و`trips`: القفل يُعلَن ولا يُصمَت عنه في مرحلة التجهيز
    if (gate.state === "onboarding") {
      return (
        <StageLock title="لا تنبيهات قبل اعتماد حسابك">
          <p>
            هنا يُحفظ سجلّ كل ما أُرسل إليك: عروض الرحلات وإسنادها ومواعيدها. ولا يُرسَل إليك
            شيء قبل اعتماد حسابك، فالسجل فارغ بطبيعته الآن.
          </p>
          <p>
            وحين يُعتمد حسابك، تذكّر أن هذه الشاشة <span className="font-semibold">سجلٌّ</span> لا
            وسيلة تنبيه: ما يصلك فعلاً يصل على قنواتك (تليجرام أو إشعار الجهاز أو البريد)،
            وهذه الصفحة أثره المحفوظ.
          </p>
        </StageLock>
      );
    }
    return null;
  }

  const { items, unread, ready, failed } = await loadInbox();

  const onlyUnread = params.filter === "unread";
  const shown = onlyUnread ? items.filter((item) => item.readAt === null) : items;

  // `read=N` عدد ما عُلّم فعلاً — و«صفر» خبرٌ صحيح: سبقك جهازٌ آخر إليه
  const readParam = typeof params.read === "string" ? Number(params.read) : NaN;
  const marked = Number.isFinite(readParam) ? Math.max(0, Math.trunc(readParam)) : null;
  const error = typeof params.error === "string" ? params.error : null;

  return (
    <div className="space-y-6">
      <PageHeading
        title="صندوق التنبيهات"
        help="سجلٌّ لما أُرسل إليك: ماذا ومتى، وما قرأته وما لم تقرأه. وهو أثرُ التنبيه لا التنبيه نفسه."
        action={
          unread > 0 ? (
            <form action={markInboxAllRead}>
              <Button type="submit" variant="outline" size="sm">
                <CheckCheck aria-hidden="true" />
                علّم الكل مقروءاً
              </Button>
            </form>
          ) : null
        }
      >
        كل ما أرسلناه إليك محفوظ هنا بترتيب الأحدث، ومعه ملخّص الرحلة التي كان عنها — لتعرف
        ماذا فاتك ومتى، ولتعود إليه عند أي التباس.
      </PageHeading>

      <Banners
        saved={marked !== null}
        error={error}
        errorMessages={ERROR_MESSAGES}
        savedMessage={
          marked === 0
            ? "لم يتبقَّ تنبيه غير مقروء — ربما عُلّم من جهاز آخر."
            : marked === 1
              ? "عُلّم تنبيه واحد مقروءاً."
              : `عُلّم ${countLabel(marked ?? 0)} تنبيهاً مقروءاً.`
        }
      />

      {!ready ? <NotReadyNotice what="صندوق التنبيهات" /> : null}

      {/* عطل قراءة لا صندوق فارغ: «لم يصلك شيء» و«تعذّرت القراءة» خبران متعاكسان */}
      {failed ? (
        <Notice tone="danger">
          <p className="font-semibold">تعذر تحميل صندوقك</p>
          <p>
            لم نتمكن من قراءة تنبيهاتك الآن. حدّث الصفحة، وإن تكرر الأمر راسل الإدارة — وما
            وصلك على قنواتك يبقى صالحاً سواء ظهر هنا أم لا.
          </p>
        </Notice>
      ) : null}

      {/*
        البطاقة الأصرح في الشاشة، وموضعها فوق القائمة لا تحتها: من يقرأ «صندوق»
        يفترض أنه المكان الذي «تصل» إليه الرسائل. تصحيح هذا الافتراض هو الفرق بين
        متعهد يُبقي قناةً بالغة مفتوحة وآخر يطفئ كل شيء ثم يفوته العمل.

        📌 وقد شُحنت: صارت قنوات التنبيه **قسماً في «حسابي»** (2026-08-19)، فصار
        النصّ رابطاً إلى مرساتها بدل وصفها بالاسم — وهو ما نصّت عليه ملاحظة
        التكامل التي كانت هنا.
      */}
      <Notice tone="warning" icon={<BellRing className="size-5 shrink-0" aria-hidden="true" />}>
        <p>
          <span className="font-semibold">هذه الصفحة لا تنبّهك — هي سجلّ ما نُبِّهت به.</span>{" "}
          وصولُ العرض إليك يكون على قنواتك التي تستقبل بلا أن تفتح شيئاً: تليجرام، أو إشعار
          الجهاز، أو البريد. فأبقِ واحدة منها مفعَّلة على الأقل من{" "}
          <Link
            href="/portal/profile#channels"
            className="font-medium underline underline-offset-4"
          >
            «قنوات التنبيه» في حسابي
          </Link>
          ؛ ومن
          يطفئها كلها يُحسَب <span className="font-semibold">غير متصل</span> فلا يصله بثّ أصلاً،
          ولن ينفعه فتحُ هذا الصندوق كل ساعة.
        </p>
      </Notice>

      {/* الترشيح روابط لا حالة عميل: النتيجة عنوان قابل للمشاركة والتحديث */}
      {ready && !failed && items.length > 0 ? (
        <div className="flex flex-wrap items-center gap-2">
          <Link
            href="/portal/inbox"
            aria-current={onlyUnread ? undefined : "page"}
            className={cn(
              buttonVariants({ variant: onlyUnread ? "outline" : "default", size: "sm" })
            )}
          >
            <Archive aria-hidden="true" />
            الكل ({countLabel(items.length)})
          </Link>
          <Link
            href="/portal/inbox?filter=unread"
            aria-current={onlyUnread ? "page" : undefined}
            className={cn(
              buttonVariants({ variant: onlyUnread ? "default" : "outline", size: "sm" })
            )}
          >
            <Inbox aria-hidden="true" />
            غير المقروء ({countLabel(unread)})
          </Link>
        </div>
      ) : null}

      {ready && !failed && items.length === 0 ? (
        <EmptyState icon={<Inbox className="size-5" aria-hidden="true" />} title="لا تنبيهات بعد">
          لم يُرسَل إليك شيء حتى الآن. وحين يُبَث أول عرض رحلة يصلك على قنواتك المفعَّلة،
          ويُحفَظ أثره هنا لتعود إليه متى شئت.
        </EmptyState>
      ) : null}

      {ready && !failed && items.length > 0 && shown.length === 0 ? (
        <EmptyState
          icon={<CheckCheck className="size-5" aria-hidden="true" />}
          title="لا شيء غير مقروء"
          action={
            <Link href="/portal/inbox" className={cn(buttonVariants({ variant: "outline" }))}>
              اعرض السجل كاملاً
            </Link>
          }
        >
          قرأت كل ما وصلك. والسجل الكامل يبقى محفوظاً للرجوع إليه.
        </EmptyState>
      ) : null}

      {shown.length > 0 ? (
        <section className="space-y-3">
          {shown.map((item) => (
            <InboxCard key={item.id} item={item} />
          ))}
        </section>
      ) : null}
    </div>
  );
}
