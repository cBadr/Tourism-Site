import type { ReactNode } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import {
  ArrowLeftRight,
  BadgeCheck,
  Ban,
  CalendarClock,
  CarFront,
  CircleCheck,
  Hash,
  Hourglass,
  Info,
  LifeBuoy,
  LogIn,
  Luggage,
  Phone,
  PlusCircle,
  ReceiptText,
  TriangleAlert,
  UserRound,
  Wallet,
} from "lucide-react";

import { getSettings } from "@/lib/settings";
import { createFormatter, getT, resolveLocale, type Tx } from "@/lib/i18n/content";
import { SiteHeader } from "@/components/site/header";
import { SiteFooter } from "@/components/site/footer";
import { WhatsAppFab } from "@/components/site/whatsapp-fab";
import { contactHref, localeHref } from "@/components/site/links";
import { HelpTip } from "@/components/shared/HelpTip";
import type { LocaleFormatter } from "@/components/booking/format";
import type { MyBookingRow } from "@/lib/customer-types";
import { ACCOUNT_HOME_PATH, ACCOUNT_LOGIN_PATH } from "../_lib/session";
import { loadMyBookings } from "./data";
import { linkBooking, openBooking, type AccountErrorCode, type AccountNoticeCode } from "./actions";

/**
 * «حجوزاتي» (‏`/account/bookings`) — الشاشة الأولى من المرحلة ١٢ب.
 *
 * العقد الملزم `lib/customer-types.ts`، والقاعدة الحيّة `0044`. وهذه الصفحة لا
 * تقرأ حرفاً من `bookings` ولا من `customer_bookings`: كل ما تعرضه يأتي من
 * `my_bookings()` عبر `./data.ts` — وهو **الإسقاط الآمن** بلا متعهد ولا تكلفة
 * ولا هامش ولا توكن (‏§١ في العقد).
 *
 * ── أربعة قرارات في هذه الصفحة ─────────────────────────────────────────────
 *
 * (١) **مكوّن خادمي ونماذج `<form action={…}>` عارية — بلا حالة عميل.** تعمل
 *     وJavaScript معطّل، والحالة تسافر رمزاً في query string فتترجمه الصفحة إلى
 *     عربية (اتفاقية ٤ حرفياً: لا `useState` لرسالة خطأ). نفس بنية `/track`.
 *
 * (٢) **`noindex/nofollow`** كصفحة `/booking/[token]`: سطحٌ خاص بصاحب حسابه.
 *     ولا `Disallow` في `robots.txt` — والفرق مقصود ومكتوب في `app/sitemap.ts`:
 *     منعُ الزحف يمنع الزاحف من **رؤية** توجيه المنع، فيبقى ما فُهرس بلا سحب.
 *     الوسم يكفي، والمسار خارج الخريطة أصلاً لأنه ليس في `APP_OWNED_PATHS`.
 *
 * (٣) **الحالة الفارغة ليست جدولاً فارغاً.** حسابٌ جديد صفره صحيح لا مجهول
 *     (القاعدة ١٥)، والشاشة الصادقة تقول له كيف يضيف حجزاً — فالنموذج يصير هو
 *     المتن حين لا قائمة، ويهبط تحتها حين توجد.
 *
 * (٤) **لا رقم حجز في أي رابط.** الأزرار نماذج `POST`، للسبب المكتوب في
 *     `app/track/page.tsx`: المرجع يتسرّب في سجلات الخادم وفي ترويسة المُحيل
 *     إلى كل وسم قياس مركَّب في `app/layout.tsx`. والقائمة لا تحمل توكناً أصلاً
 *     (نصّ العقد) — الخادم يُصدره للصفحة المطلوبة وحدها في `openBooking`.
 */

export async function generateMetadata(): Promise<Metadata> {
  const locale = await resolveLocale();
  const t = await getT("pages.account", locale);

  return {
    title: t("metaTitle", "حجوزاتي"),
    description: t("metaDescription", "كل حجوزاتك في مكان واحد، وإضافة حجز سابق إلى حسابك."),
    // صفحة خاصة بصاحب الحساب — لا فهرسة ولا تتبّع روابط بأي لغة
    robots: {
      index: false,
      follow: false,
      nocache: true,
      googleBot: { index: false, follow: false },
    },
  };
}

/* ------------------------------------------------------------------ */
/* رموز الرابط ← جُمَل عربية                                             */
/* ------------------------------------------------------------------ */

/**
 * رسالة لكل رمز خطأ **يستطيع الإجراء إصداره** — والنوع هو ما يفرض الاكتمال.
 *
 * `Record<AccountErrorCode, …>` يعني أن رمزاً يُضاف في `actions.ts` بلا جملة هنا
 * **لا يبني**. وهذا علاجٌ بنيوي لعيبٍ تكرّر في هذا المستودع: رمزٌ يُشحن بلا
 * رسالة فيرى المستخدم شاشةً بلا سبب. وكل جملة تقول **ماذا يفعل الآن** لا ماذا
 * حدث عندنا (اتفاقية ١).
 */
const ERROR_TEXT: Record<AccountErrorCode, { key: string; fallback: string }> = {
  env: {
    key: "errors.env",
    fallback: "الخدمة غير متاحة الآن لسبب تقني عندنا. أعد المحاولة بعد قليل، أو تواصل معنا مباشرة.",
  },
  auth: {
    key: "errors.auth",
    fallback: "انتهت جلستك. سجّل دخولك من جديد ثم أعد المحاولة.",
  },
  schema: {
    key: "errors.schema",
    fallback: "ميزة الحساب غير مكتملة التجهيز على هذا الخادم بعد. تواصل معنا وسنفتح لك حجزك بأنفسنا.",
  },
  "invalid-input": {
    key: "errors.invalidInput",
    fallback: "اكتب رقم الحجز ورقم الهاتف معاً، كما سجّلتهما وقت الحجز.",
  },
  "rate-limited": {
    key: "errors.rateLimited",
    fallback: "محاولات كثيرة في وقت قصير. انتظر قليلاً ثم أعد المحاولة، أو تواصل معنا مباشرة.",
  },
  "not-found": {
    key: "errors.notFound",
    fallback:
      "لم نعثر على حجز بهذه البيانات. راجع رقم الحجز ورقم الهاتف كما سجّلتهما وقت الحجز، أو تواصل معنا وسنجده لك.",
  },
  save: {
    key: "errors.save",
    fallback: "تعذّرت العملية الآن لسبب تقني عندنا. أعد المحاولة بعد قليل، أو تواصل معنا مباشرة.",
  },
  "open-denied": {
    key: "errors.openDenied",
    fallback: "هذا الحجز لم يعد ضمن حجوزات حسابك. حدّث الصفحة، فإن بقي فتواصل معنا.",
  },
  "open-missing": {
    key: "errors.openMissing",
    fallback: "تعذّر فتح صفحة هذا الحجز الآن. أعد المحاولة بعد قليل، أو تواصل معنا مباشرة.",
  },
};

/** رسائل النجاح — بنبرة الخبر لا بنبرة الخطأ */
const NOTICE_TEXT: Record<AccountNoticeCode, { key: string; fallback: string }> = {
  linked: {
    key: "notices.linked",
    fallback: "أضفنا الحجز إلى حسابك — تجده في القائمة أدناه.",
  },
  /**
   * «مربوطٌ سلفاً» **نجاحٌ في نظر العميل لا خطأ** (نصّ العقد في `LinkRefusal`):
   * هو أراد أن يجده في حسابه، وهو فيه. فتُعرض كنتيجة مطمئنة لا كتحذير.
   */
  "already-linked": {
    key: "notices.alreadyLinked",
    fallback: "هذا الحجز مضاف إلى حسابك سلفاً — تجده في القائمة أدناه.",
  },
  /**
   * يصل من `../callback/route.ts` بعد تبديل رمز رابط البريد بجلسة — أي أن
   * صاحبه وصل هنا لأول مرة بحسابٍ صار مفعّلاً لتوّه. ونبرتها ترحيبٌ لا تقريرٌ
   * تقني: العميل لا يعنيه أن «الرمز بُدِّل»، يعنيه أن حسابه يعمل.
   */
  confirmed: {
    /**
     * ⚠ **مفتاحٌ خاص بهذه الشاشة لا `notices.confirmed`**: ذاك مملوكٌ لخريطة
     * شاشة الدخول في `_lib/messages.ts` ومنشورٌ في `messages/*.json`، فلو
     * تشاركتاه لَغلبت ترجمتُه احتياطيَّنا هنا **بصمت** — فتُعرض جملةُ شاشةٍ على
     * شاشةٍ أخرى، ولانحرفت الشاشتان يوم يُحرَّر أحدهما. مفتاحان لسطحين.
     */
    key: "notices.emailConfirmed",
    fallback: "تم تأكيد بريدك وتفعيل حسابك — أهلاً بك. هذه قائمة حجوزاتك.",
  },
};

/** رمز من الرابط — وما ليس رمزاً معروفاً لا يُعرض إطلاقاً */
function readError(value: unknown): AccountErrorCode | null {
  return typeof value === "string" && value in ERROR_TEXT ? (value as AccountErrorCode) : null;
}

function readNotice(value: unknown): AccountNoticeCode | null {
  return typeof value === "string" && value in NOTICE_TEXT ? (value as AccountNoticeCode) : null;
}

/* ------------------------------------------------------------------ */
/* حالة الحجز بلسان صاحبه                                              */
/* ------------------------------------------------------------------ */

/**
 * الحالات الست ← خمس جُمَل.
 *
 * 🔒 **`assigned` تُقرأ «مؤكد» ولا تُقال «مُسنَد»**: الإسناد حدثٌ في تشغيلنا،
 * والعميل لا يعرف أن هناك منفّذاً أصلاً (‏white-label). ومؤشر الحالات في
 * `app/booking/[token]/page.tsx` يضع `assigned` في موضع `confirmed` نفسه منذ
 * المرحلة ٨ — فالقائمة تقول ما تقوله الصفحة حرفاً بحرف، ولا يتعلّم العميل من
 * اختلاف الجملتين شيئاً عن ترتيباتنا.
 */
const STATUS_META: Record<
  string,
  { key: string; label: string; badge: string; icon: typeof Hourglass }
> = {
  pending_payment: {
    key: "status.pendingPayment",
    label: "بانتظار الدفع",
    badge: "bg-amber-500/10 text-amber-900 dark:text-amber-200",
    icon: Wallet,
  },
  under_review: {
    key: "status.underReview",
    label: "قيد المراجعة",
    badge: "bg-muted text-muted-foreground",
    icon: Hourglass,
  },
  confirmed: {
    key: "status.confirmed",
    label: "مؤكد",
    badge: "bg-primary/10 text-primary",
    icon: BadgeCheck,
  },
  assigned: {
    key: "status.confirmed",
    label: "مؤكد",
    badge: "bg-primary/10 text-primary",
    icon: BadgeCheck,
  },
  completed: {
    key: "status.completed",
    label: "منفذ",
    badge: "bg-emerald-500/10 text-emerald-900 dark:text-emerald-200",
    icon: CircleCheck,
  },
  cancelled: {
    key: "status.cancelled",
    label: "ملغي",
    badge: "bg-destructive/10 text-destructive",
    icon: Ban,
  },
};

/**
 * حالةٌ لا نعرفها لا تُخترع لها جملة: تُعرض كما جاءت من القاعدة بنبرة محايدة.
 * (القاعدة ١٥: «لا نعرف» شيء، و«صفر» شيء آخر — واختراعُ وصفٍ أسوأ من كليهما.)
 */
function statusMeta(status: string) {
  return (
    STATUS_META[status] ?? {
      key: `status.${status}`,
      label: status,
      badge: "bg-muted text-muted-foreground",
      icon: Info,
    }
  );
}

/* ------------------------------------------------------------------ */
/* أنماط مشتركة                                                        */
/* ------------------------------------------------------------------ */

const fieldClass =
  "h-12 w-full rounded-2xl border border-input bg-background px-3 text-base outline-none transition-colors focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50";

const primaryButtonClass =
  "inline-flex h-12 w-full items-center justify-center gap-2 rounded-2xl bg-primary text-base font-semibold text-primary-foreground shadow-lg shadow-primary/25 transition-all hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50";

const secondaryButtonClass =
  "inline-flex h-11 shrink-0 items-center justify-center gap-2 rounded-2xl border border-border bg-background px-4 text-sm font-semibold transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50";

/* ------------------------------------------------------------------ */
/* بطاقة حجز واحدة                                                     */
/* ------------------------------------------------------------------ */

/**
 * سطر القائمة — بطاقة لا صفَّ جدول.
 *
 * الجدول يفترض شاشةً عريضة ويكسر على الجوال، وأكثر من يفتح «حجوزاتي» يفتحها من
 * هاتفه. والبطاقة تحمل ما يعرّف الرحلة (المسار والموعد) وما يعني صاحبها (المبلغ
 * والمتبقي) — وما عداه في صفحة الحجز نفسها، فالبطاقة **مدخلٌ لها لا بديلٌ عنها**.
 */
function BookingCard({
  row,
  fmt,
  t,
}: {
  row: MyBookingRow;
  fmt: LocaleFormatter;
  t: Tx;
}) {
  const meta = statusMeta(row.status);
  const StatusIcon = meta.icon;
  const pickupLabel = fmt.dateTime(row.pickupAt);
  const createdLabel = fmt.date(row.createdAt);
  const isCancelled = row.status === "cancelled";

  return (
    <li className="flex flex-col gap-4 rounded-3xl border border-border bg-card p-5 text-card-foreground">
      {/* المرجع والحالة */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="inline-flex items-center gap-2 text-sm font-medium text-muted-foreground">
          <Hash className="size-4 shrink-0" aria-hidden="true" />
          <span dir="ltr" className="font-mono text-base font-bold tracking-wide text-foreground">
            {row.reference}
          </span>
        </span>
        <span
          className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold ${meta.badge}`}
        >
          <StatusIcon className="size-3.5 shrink-0" aria-hidden="true" />
          {t(meta.key, meta.label)}
        </span>
      </div>

      {/* المسار — والغياب لا يُملأ بشرطة صامتة، فالسطر يغيب كاملاً */}
      {row.originLabel || row.destLabel ? (
        <p className="flex items-start gap-2 text-sm leading-7">
          <ArrowLeftRight
            className="mt-1 size-4 shrink-0 text-muted-foreground"
            aria-hidden="true"
          />
          <span className="font-medium">
            {row.originLabel ?? t("row.unknownOrigin", "نقطة الانطلاق")}
            {" — "}
            {row.destLabel ?? t("row.unknownDest", "نقطة الوصول")}
          </span>
        </p>
      ) : null}

      {/* تفاصيل سريعة */}
      <dl className="flex flex-col gap-2 text-sm leading-6">
        {pickupLabel ? (
          <div className="flex items-start gap-2">
            <CalendarClock
              className="mt-0.5 size-4 shrink-0 text-muted-foreground"
              aria-hidden="true"
            />
            <dt className="sr-only">{t("row.pickup", "موعد الانطلاق")}</dt>
            <dd>{pickupLabel}</dd>
          </div>
        ) : null}

        <div className="flex items-start gap-2">
          <UserRound className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
          <dt className="sr-only">{t("row.passengers", "الركاب")}</dt>
          <dd>{fmt.passengers(row.passengers)}</dd>
        </div>

        {row.classTitle ? (
          <div className="flex items-start gap-2">
            <CarFront className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
            <dt className="sr-only">{t("row.class", "فئة السيارة")}</dt>
            <dd>{row.classTitle}</dd>
          </div>
        ) : null}

        {createdLabel ? (
          <div className="flex items-start gap-2">
            <ReceiptText
              className="mt-0.5 size-4 shrink-0 text-muted-foreground"
              aria-hidden="true"
            />
            <dt className="sr-only">{t("row.createdAt", "تاريخ الحجز")}</dt>
            <dd className="text-muted-foreground">
              {t("row.bookedOn", "حُجزت في {value}", { value: createdLabel })}
            </dd>
          </div>
        ) : null}
      </dl>

      {/* المبالغ — الإجمالي رقم العميل الوحيد، والمتبقي يُذكر حين يوجد فعلاً */}
      <div className="flex flex-wrap items-end justify-between gap-3 border-t border-border pt-4">
        <div className="flex flex-col gap-0.5">
          <span className="text-xs font-medium text-muted-foreground">
            {t("row.total", "إجمالي الرحلة")}
          </span>
          <span className="text-lg font-bold">{fmt.money(row.total, row.currency)}</span>
        </div>

        {/* ملغي ⇒ لا مطالبة بمتبقٍّ: رقمٌ صحيح في الدفتر ورسالةٌ خاطئة على الشاشة */}
        {!isCancelled && row.amountRemaining > 0 ? (
          <p className="text-sm font-medium text-muted-foreground">
            {t("row.remaining", "المتبقي نقداً: {value}", {
              value: fmt.money(row.amountRemaining, row.currency),
            })}
          </p>
        ) : null}
      </div>

      {/*
        زر النموذج لا رابط: القائمة لا تحمل توكناً (نصّ العقد)، والمرجع يُرسَل في
        جسم `POST` فلا يدخل رابطاً ولا سجلَّ خادم ولا ترويسة مُحيل. والخادم يثبت
        الملكية من `my_bookings()` ثم يُصدر توكن الصفحة المطلوبة وحدها.
      */}
      <form action={openBooking}>
        <input type="hidden" name="reference" value={row.reference} />
        <button type="submit" className={primaryButtonClass}>
          {t("row.open", "افتح صفحة الحجز")}
        </button>
      </form>
    </li>
  );
}

/* ------------------------------------------------------------------ */
/* نموذج «أضِف حجزاً سابقاً»                                             */
/* ------------------------------------------------------------------ */

/**
 * نفس الزوج الذي تطلبه `/track` بالضبط — ومَن يملك **رقم الحجز وهاتفه معاً** هو
 * صاحبه. والربط يفوّض إلى `find_booking_by_reference` المُصلَّبة ولا يستنسخها،
 * فتسقط تبعية مزوّد رسائل غير مضبوط ويسقط معها خطر §٢ في العقد: لا يُقرأ
 * `profiles.phone` — وهو حقلٌ يكتبه المسجِّل بنفسه — في المطابقة أصلاً.
 */
function LinkForm({ t, heading }: { t: Tx; heading: string }) {
  return (
    <form
      action={linkBooking}
      aria-label={t("form.ariaLabel", "نموذج إضافة حجز سابق")}
      className="flex flex-col gap-5 rounded-3xl border border-border bg-card p-5 text-card-foreground sm:p-6"
    >
      <div className="flex flex-col gap-1.5">
        <h2 className="flex items-center gap-2 text-base font-bold leading-snug">
          <PlusCircle className="size-5 text-primary" aria-hidden="true" />
          {heading}
        </h2>
        <p className="text-sm leading-7 text-muted-foreground">
          {t(
            "form.lead",
            "حجزت قبل أن تنشئ حسابك؟ اكتب رقم الحجز ورقم الهاتف الذي سجّلته، ونضيفه إلى حجوزاتك."
          )}
        </p>
      </div>

      {/* رقم الحجز */}
      <div className="flex flex-col gap-1.5">
        <label htmlFor="link-reference" className="flex items-center gap-2 text-sm font-medium">
          <Hash className="size-4 text-muted-foreground" aria-hidden="true" />
          {t("form.reference", "رقم الحجز")}
          <HelpTip>
            {t(
              "form.referenceTip",
              "رقم يبدأ بـ TR- ويظهر أعلى صفحة حجزك وفي رسالة التأكيد. إن لم تعد تملكه، تواصل معنا وسنجد حجزك برقم هاتفك."
            )}
          </HelpTip>
        </label>
        <input
          id="link-reference"
          name="reference"
          type="text"
          required
          dir="ltr"
          autoComplete="off"
          spellCheck={false}
          maxLength={32}
          placeholder={t("form.referencePlaceholder", "TR-XXXXXX")}
          aria-describedby="link-reference-help"
          className={`${fieldClass} text-start`}
        />
        <p id="link-reference-help" className="text-xs leading-5 text-muted-foreground">
          {t("form.referenceHelp", "اكتبه كما هو — الحروف الكبيرة والصغيرة سواء.")}
        </p>
      </div>

      {/* رقم الهاتف */}
      <div className="flex flex-col gap-1.5">
        <label htmlFor="link-phone" className="flex items-center gap-2 text-sm font-medium">
          <Phone className="size-4 text-muted-foreground" aria-hidden="true" />
          {t("form.phone", "رقم الهاتف")}
        </label>
        <input
          id="link-phone"
          name="phone"
          type="tel"
          required
          inputMode="tel"
          dir="ltr"
          autoComplete="tel"
          maxLength={32}
          placeholder={t("form.phonePlaceholder", "01xxxxxxxxx")}
          aria-describedby="link-phone-help"
          className={`${fieldClass} text-start`}
        />
        <p id="link-phone-help" className="text-xs leading-5 text-muted-foreground">
          {t("form.phoneHelp", "نفس الرقم الذي سجّلته وقت الحجز — بأي صيغة كتبته.")}
        </p>
      </div>

      <button type="submit" className={primaryButtonClass}>
        <PlusCircle className="size-5" aria-hidden="true" />
        {t("form.submit", "أضِف الحجز إلى حسابي")}
      </button>

      <p className="text-xs leading-6 text-muted-foreground">
        {t("form.privacyNote", "نطلب الرقمين معاً حمايةً لحجزك: أحدهما وحده لا يضيف شيئاً.")}
      </p>
    </form>
  );
}

/* ------------------------------------------------------------------ */
/* بطاقة حالة (بلا جلسة / بيئة / مخطط / عطل)                            */
/* ------------------------------------------------------------------ */

function StateCard({
  icon: Icon,
  title,
  text,
  action,
}: {
  icon: typeof Info;
  title: string;
  text: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-start gap-4 rounded-3xl border border-border bg-card p-6 text-card-foreground">
      <span className="grid size-11 shrink-0 place-items-center rounded-2xl bg-primary/10 text-primary">
        <Icon className="size-5" aria-hidden="true" />
      </span>
      <div className="flex flex-col gap-1.5">
        <h2 className="text-base font-bold leading-snug">{title}</h2>
        <p className="text-sm leading-7 text-muted-foreground">{text}</p>
      </div>
      {action}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* الصفحة                                                              */
/* ------------------------------------------------------------------ */

type AccountPageProps = {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
};

export default async function MyBookingsPage({ searchParams }: AccountPageProps) {
  const locale = await resolveLocale();
  const [settings, t, params, result] = await Promise.all([
    getSettings(locale),
    getT("pages.account", locale),
    searchParams,
    loadMyBookings(),
  ]);

  const fmt = createFormatter(locale);
  const error = readError(params.error);
  const notice = readNotice(params.notice);
  const contact = contactHref(settings, locale);
  const trackHref = localeHref("/track", locale);
  const bookHref = localeHref("/book", locale);

  const rows = result.state === "ready" ? result.rows : [];
  const isEmpty = result.state === "ready" && rows.length === 0;

  return (
    <>
      <SiteHeader settings={settings} locale={locale} />

      <main id="main" className="flex-1">
        {/* ترويسة الصفحة */}
        <section className="site-hero-bg relative overflow-hidden">
          <div aria-hidden="true" className="pointer-events-none absolute inset-0">
            <div className="site-dots absolute inset-0 opacity-60 [mask-image:radial-gradient(ellipse_70%_90%_at_50%_0%,black,transparent)]" />
            <div className="absolute -top-24 left-1/2 h-44 w-[24rem] -translate-x-1/2 rounded-full bg-[color-mix(in_oklab,var(--primary)_14%,transparent)] blur-3xl" />
            <div className="absolute inset-x-0 bottom-0 h-px bg-gradient-to-l from-transparent via-border to-transparent" />
          </div>

          <div className="relative mx-auto flex w-full max-w-3xl flex-col items-center gap-4 px-4 pb-12 pt-12 text-center sm:px-6 md:pb-16 md:pt-16">
            <h1 className="text-balance text-3xl font-extrabold leading-[1.3] tracking-tight sm:text-4xl">
              {t("title", "حجوزاتي")}
            </h1>
            <p className="max-w-2xl text-pretty leading-8 text-muted-foreground sm:text-lg sm:leading-9">
              {t(
                "lead",
                "كل رحلاتك في مكان واحد: حالتها ومواعيدها ومبالغها، وصفحة كل حجز على بعد نقرة."
              )}
            </p>
          </div>
        </section>

        <section className="py-10 md:py-14">
          <div className="mx-auto flex w-full max-w-2xl flex-col gap-6 px-4 sm:px-6">
            {/* الخطأ والخبر — أحدهما فقط يظهر في أي لحظة */}
            {error ? (
              <p
                role="alert"
                className="flex items-start gap-2 rounded-2xl border border-destructive/40 bg-destructive/10 px-3 py-2.5 text-sm leading-6 text-destructive"
              >
                <TriangleAlert className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
                {t(ERROR_TEXT[error].key, ERROR_TEXT[error].fallback)}
              </p>
            ) : notice ? (
              <p
                role="status"
                className="flex items-start gap-2 rounded-2xl border border-primary/40 bg-primary/10 px-3 py-2.5 text-sm leading-6 text-primary"
              >
                <CircleCheck className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
                {t(NOTICE_TEXT[notice].key, NOTICE_TEXT[notice].fallback)}
              </p>
            ) : null}

            {/* ── بلا جلسة ─────────────────────────────────────────────── */}
            {result.state === "anonymous" ? (
              <StateCard
                icon={LogIn}
                title={t("anonymous.title", "سجّل دخولك لترى حجوزاتك")}
                text={t(
                  "anonymous.text",
                  "الحساب طبقةُ راحة لا بوابة: تستطيع الحجز ومتابعته بلا حساب في أي وقت. وبالحساب تجتمع رحلاتك في قائمة واحدة بلا بحث عن رابط."
                )}
                action={
                  <div className="flex flex-wrap gap-3">
                    {/*
                      وجهة الدخول من ثابت البوابة لا من نصٍّ مكتوب هنا: يومَ
                      يتغيّر مسار الدخول يتغيّر معه كل مُحيلٍ إليه في السطح.
                      و`next` يُعيده إلى هذه الصفحة بعد الدخول — والبوابة تفحصه
                      بـ`safeNextPath` فلا يصير مَعلماً لتحويلٍ مفتوح.
                    */}
                    <Link
                      href={localeHref(`${ACCOUNT_LOGIN_PATH}?next=${encodeURIComponent(ACCOUNT_HOME_PATH)}`, locale)}
                      className={secondaryButtonClass}
                    >
                      <LogIn className="size-4" aria-hidden="true" />
                      {t("anonymous.login", "تسجيل الدخول")}
                    </Link>
                    <a href={trackHref} className={secondaryButtonClass}>
                      {t("anonymous.track", "تابع حجزاً برقمه")}
                    </a>
                  </div>
                }
              />
            ) : null}

            {/* ── البيئة غير مضبوطة ────────────────────────────────────── */}
            {result.state === "env" ? (
              <StateCard
                icon={Info}
                title={t("env.title", "الخدمة غير متاحة الآن")}
                text={t(
                  "env.text",
                  "تعذّر الاتصال بحسابك لسبب تقني عندنا. أعد المحاولة بعد قليل، أو افتح حجزك برقمه من صفحة متابعة الحجز."
                )}
                action={
                  <a href={trackHref} className={secondaryButtonClass}>
                    {t("anonymous.track", "تابع حجزاً برقمه")}
                  </a>
                }
              />
            ) : null}

            {/* ── الميزة غير مجهَّزة على هذا الخادم ─────────────────────── */}
            {result.state === "schema" ? (
              <StateCard
                icon={Info}
                title={t("schema.title", "ميزة الحساب قيد التجهيز")}
                text={t(
                  "schema.text",
                  "قائمة الحجوزات غير مفعّلة على هذا الخادم بعد. تستطيع فتح أي حجز برقمه وهاتفك من صفحة متابعة الحجز."
                )}
                action={
                  <a href={trackHref} className={secondaryButtonClass}>
                    {t("anonymous.track", "تابع حجزاً برقمه")}
                  </a>
                }
              />
            ) : null}

            {/* ── تعذّرت القراءة ───────────────────────────────────────── */}
            {result.state === "failed" ? (
              <StateCard
                icon={TriangleAlert}
                title={t("failed.title", "تعذّر عرض حجوزاتك الآن")}
                text={t(
                  "failed.text",
                  "لم نستطع قراءة قائمتك لسبب تقني عندنا — وحجوزاتك سليمة كما هي. أعد تحميل الصفحة بعد قليل، أو افتح حجزك برقمه."
                )}
                action={
                  <a href={trackHref} className={secondaryButtonClass}>
                    {t("anonymous.track", "تابع حجزاً برقمه")}
                  </a>
                }
              />
            ) : null}

            {/*
              ── الحالة الفارغة ──────────────────────────────────────────
              حسابٌ جديد صفرُه **صحيح** لا مجهول (القاعدة ١٥)، فلا جدول فارغ ولا
              «لا توجد نتائج». الشاشة تقول ما الذي يملأ القائمة: إضافة حجزٍ سابق
              (والنموذج تحتها مباشرةً هو المتن)، أو حجزٌ جديد.
            */}
            {isEmpty ? (
              <StateCard
                icon={Luggage}
                title={t("empty.title", "لا حجوزات في حسابك بعد")}
                text={t(
                  "empty.text",
                  "حسابك جاهز والقائمة تبدأ من أول حجز. إن كنت حجزت قبل إنشاء الحساب فأضِف الحجز بالنموذج أدناه، وإن لم تحجز بعد فاحسب سعر رحلتك في دقيقة."
                )}
                action={
                  <a href={bookHref} className={secondaryButtonClass}>
                    {t("empty.book", "احسب سعر رحلتك واحجزها")}
                  </a>
                }
              />
            ) : null}

            {/* ── القائمة ──────────────────────────────────────────────── */}
            {rows.length > 0 ? (
              <>
                <h2 className="text-sm font-semibold text-muted-foreground">
                  {t("list.heading", "رحلاتك ({count})", { count: fmt.number(rows.length) })}
                </h2>
                <ul className="flex flex-col gap-4">
                  {rows.map((row) => (
                    <BookingCard key={row.reference} row={row} fmt={fmt} t={t} />
                  ))}
                </ul>
              </>
            ) : null}

            {/*
              النموذج يظهر لصاحب جلسة **فقط**: الدالة تشتق الهوية من `auth.uid()`
              وترفض بلا جلسة، فنموذجٌ يُعرض للزائر المجهول وعدٌ لا يُوفى.
            */}
            {result.state === "ready" ? (
              <LinkForm
                t={t}
                heading={
                  isEmpty
                    ? t("form.headingFirst", "أضِف حجزاً سابقاً")
                    : t("form.heading", "أضِف حجزاً آخر")
                }
              />
            ) : null}
          </div>
        </section>

        {/* لمن لا يجد حجزه */}
        <section className="bg-muted/40 py-14 md:py-20">
          <div className="mx-auto w-full max-w-3xl px-4 sm:px-6">
            <div className="flex flex-col items-start gap-4 rounded-2xl border border-border bg-card p-5 text-card-foreground sm:flex-row sm:items-center sm:p-6">
              <span className="grid size-11 shrink-0 place-items-center rounded-2xl bg-primary/10 text-primary">
                <LifeBuoy className="size-5" aria-hidden="true" />
              </span>
              <div className="flex flex-col gap-1.5">
                <h2 className="text-base font-bold leading-snug">
                  {t("help.title", "لا تجد حجزاً تعرف أنك حجزته؟")}
                </h2>
                <p className="text-sm leading-7 text-muted-foreground">
                  {t(
                    "help.text",
                    "الحجوزات لا تُضاف تلقائياً إلى الحساب — أضِفها برقمها وهاتفها، أو تواصل معنا وسنفعلها بأنفسنا."
                  )}
                </p>
              </div>
              <a href={contact} className={`${secondaryButtonClass} sm:ms-auto`}>
                {t("help.contact", "تواصل معنا")}
              </a>
            </div>
          </div>
        </section>
      </main>

      <SiteFooter settings={settings} locale={locale} />
      <WhatsAppFab settings={settings} locale={locale} />
    </>
  );
}
