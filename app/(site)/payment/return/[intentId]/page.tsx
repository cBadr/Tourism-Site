import type { Metadata } from "next";
import Link from "next/link";
import {
  Ban,
  CircleCheck,
  Hourglass,
  Landmark,
  Link2,
  MessageCircle,
  Phone,
  TriangleAlert,
} from "lucide-react";

import { SiteFooter } from "@/components/site/footer";
import { SiteHeader } from "@/components/site/header";
import { telHref, waHref } from "@/components/site/links";
import { getT, resolveLocale, type Tx } from "@/lib/i18n/content";
import { localePath } from "@/lib/i18n-types";
import { getSettings } from "@/lib/settings";
import { createServerSupabase } from "@/lib/supabase/server";
import { AutoRefresh } from "./auto-refresh";
import { RedirectCountdown } from "./redirect-countdown";
import { readIntentStatus, type IntentView } from "../../read-intent";

/**
 * صفحة عودة الدفع `/payment/return/[intentId]` — شاشة **عرض** لا شاشة قرار.
 *
 * القاعدة الثانية في عقد المرحلة ٩ بحرفها: **الـ webhook هو مصدر الحقيقة، لا
 * صفحة العودة.** العميل قد يغلق المتصفح قبل أن يعود، وقد يفتح رابطاً ملفّقاً فيه
 * `?success=true`. لذلك:
 *
 *   • لا يُقرأ معامل واحد من الرابط هنا — لا `success` ولا `status` ولا غيرهما.
 *     الصفحة لا تستقبل `searchParams` أصلاً، فلا يوجد ما يُغرى بقراءته. الحالة
 *     تُقرأ من قاعدة البيانات وحدها عبر `get_payment_intent_status`.
 *   • ولا تكتب هذه الصفحة حرفاً: لا تؤكد حجزاً ولا تنشئ تحصيلاً ولا تقيّد في
 *     الدفتر. كل ذلك وقع — أو لم يقع — في `settle_payment_intent` حين وصل الحدث
 *     الموقّع.
 *   • وحين لا يكون التأكيد قد وصل بعد نقولها للعميل صراحةً، ونحدّث الصفحة مرات
 *     معدودة، ثم نتركه على رابط حجزه وهو مرجعه الدائم.
 *
 * الصفحة خاصة بجلسة دفع بعينها ⇒ noindex/nofollow، ولا تدخل خريطة الموقع.
 */

export async function generateMetadata(): Promise<Metadata> {
  const locale = await resolveLocale();
  const t = await getT("payment", locale);

  return {
    title: t("return.metaTitle", "حالة الدفع"),
    description: t("return.metaDescription", "نتيجة عملية الدفع الإلكتروني لحجزك."),
    robots: {
      index: false,
      follow: false,
      nocache: true,
      googleBot: { index: false, follow: false },
    },
  };
}

/** أربع حالات عرض لا خامسة — وكلها مشتقة من حالة الجلسة في القاعدة */
type Outcome = "succeeded" | "waiting" | "failed" | "unknown";

function outcomeOf(intent: IntentView | null): Outcome {
  if (!intent || intent.status === null) return "unknown";
  if (intent.status === "succeeded") return "succeeded";
  if (intent.status === "created" || intent.status === "pending") return "waiting";
  return "failed";
}

const OUTCOME_STYLE: Record<Outcome, { box: string; icon: string }> = {
  succeeded: { box: "border-primary/30 bg-primary/5", icon: "bg-primary text-primary-foreground" },
  waiting: { box: "border-amber-500/40 bg-amber-500/10", icon: "bg-amber-500 text-white" },
  failed: {
    box: "border-destructive/40 bg-destructive/10",
    /*
      🔴 **صار `text-destructive-foreground` — وهذا الموضع هو من كان يعتمد على
      غيابه، فيُحدَّث معه.** التعليق السابق هنا كان صحيحاً يوم كُتب ولم يبقَ:

      (١) كان الرمز **بلا قيمة** و`--color-destructive-foreground` **غير مسجَّل**
          في كتلة `@theme`، فالصنف لا يولّد قاعدةً أصلاً والأيقونة ترث
          `--foreground`. **وأُصلح الأمران معاً** في `app/globals.css`: قيمةٌ في
          الكتل الأربع، ومدخلٌ في `@theme` — فالصنف حيٌّ الآن لا ميّتاً يبدو حيّاً.

      (٢) والملاحظة الجوهرية باقيةٌ ومحفوظة: `--destructive` **يُشتقّ لقراءة النصّ
          لا للملء**، فينقلب مع الأرضية (‏`--danger-on-sand` أحمرُ غامق ·
          `--danger-on-ink` أحمرُ فاتح). ولهذا `--destructive-foreground` نفسه
          يُسنَد في كل كتلةٍ إلى ورقة عائلتها — لا إلى لونٍ واحد ثابت، وإلا سقط
          الأبيضُ على الأحمر الفاتح إلى **2.84**.

      والمقيس بعد النقل: **6.66** فوق الأحمر الفاتح (‏كان `text-background` يعطي
      6.62) و**6.57** فوق الأحمر الغامق (‏كان 4.69 — أي أن الرمز الصحيح **أعلى**
      من الحلّ البديل في العائلتين، ولا يعتمد على مصادفةِ أن `--background`
      ينقلب في الاتجاه نفسه).
    */
    icon: "bg-destructive text-destructive-foreground",
  },
  unknown: { box: "border-border bg-card", icon: "bg-muted text-muted-foreground" },
};

const OUTCOME_ICON = {
  succeeded: CircleCheck,
  waiting: Hourglass,
  failed: Ban,
  unknown: TriangleAlert,
} as const;

/** نص كل حالة — كله في مساحة `payment` باحتياطي عربي سطرياً */
function outcomeText(outcome: Outcome, t: Tx): { title: string; body: string } {
  switch (outcome) {
    case "succeeded":
      return {
        title: t("return.succeeded.title", "تم الدفع — حجزك مؤكد"),
        body: t(
          "return.succeeded.body",
          "وصلنا تأكيد البنك واعتُمد المبلغ، وانتقل حجزك إلى «تم التأكيد». نتواصل معك قبل الموعد بتفاصيل السيارة والسائق."
        ),
      };
    case "waiting":
      return {
        title: t("return.waiting.title", "بانتظار تأكيد البنك"),
        body: t(
          "return.waiting.body",
          "استلمنا عودتك من صفحة الدفع، ولم يصلنا تأكيد البنك بعد. هذا طبيعي وقد يستغرق دقيقة أو دقيقتين — أبقِ هذه الصفحة مفتوحة فهي تتحدث تلقائياً."
        ),
      };
    case "failed":
      return {
        title: t("return.failed.title", "لم تتم عملية الدفع"),
        body: t(
          "return.failed.body",
          "لم يكتمل الدفع، ولم يُخصم منك شيء. حجزك ما زال محفوظاً — عد إلى صفحة حجزك وجرّب وسيلة أخرى أو حوّل يدوياً."
        ),
      };
    default:
      return {
        title: t("return.unknown.title", "تعذّر عرض حالة الدفع"),
        body: t(
          "return.unknown.body",
          "لم نتمكن من قراءة حالة هذه العملية الآن، وهذا لا يعني نجاحها ولا فشلها. افتح رابط متابعة حجزك — فهو يعرض الحالة الصحيحة دائماً."
        ),
      };
  }
}

const linkClass =
  "inline-flex h-11 items-center justify-center gap-2 rounded-2xl border border-border bg-background px-5 text-sm font-medium transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50";

/**
 * ── الانتقال التلقائي إلى صفحة الحجز — ثوانٍ لكل حالة، والفارق مقصود ───────
 *
 * طلبُ المالك: «عند التأكيد أو الرفض… مهلة ثوانٍ معدودة ثم انتقالٌ إلى صفحة
 * الحجز نفسها». وحالتان فقط تُنهيان الجلسة فتستحقان الانتقال:
 *
 *   • **`succeeded` — خمس ثوانٍ.** لا شيء هنا يُقرأ ويُفقد: صفحة الحجز تعيد
 *     الخبر نفسه أوسع (الحالة والمبلغ والإيصالات)، فالبقاء تأخيرٌ بلا فائدة.
 *
 *   • **`failed` — عشرون.** الرفض هو الحالة التي **يُقرأ فيها النص**: «لم
 *     يُخصم منك شيء» و«حجزك ما زال محفوظاً» وسطرُ الخطوة التالية. صفحةٌ تقفز
 *     بعد خمسٍ تُنتج مكالمة دعمٍ عن مبلغٍ يظنه العميل مخصوماً. وعشرون ثانية
 *     تكفي لقراءة ثلاثة أسطر عربية على مهل، **ومعها زرُّ إيقافٍ صريح** لمن
 *     يحتاج أطول، **ومعها زرُّ «متابعة حجزي»** حاضرٌ دائماً لمن لا يريد
 *     الانتظار — فلا العدّاد يسبق القارئ ولا القارئ ينتظر العدّاد.
 *
 * أما `waiting` فلا انتقال لها: الصفحة تحدّث نفسها بانتظار الـ webhook،
 * ونقلُها يقطع الانتظار قبل أن يصل الجواب. وأما `unknown` فبطبيعتها بلا توكن
 * حجزٍ غالباً، ولا وجهةَ نقلٍ بلا توكن.
 */
const REDIRECT_SECONDS: Partial<Record<Outcome, number>> = {
  succeeded: 5,
  failed: 20,
};

export default async function PaymentReturnPage({
  params,
}: {
  params: Promise<{ intentId: string }>;
}) {
  const { intentId } = await params;

  const locale = await resolveLocale();
  const [settings, t] = await Promise.all([getSettings(locale), getT("payment", locale)]);

  const supabase = await createServerSupabase();
  const intent = supabase ? await readIntentStatus(supabase, intentId) : null;

  const outcome = outcomeOf(intent);
  const { title, body } = outcomeText(outcome, t);
  const Icon = OUTCOME_ICON[outcome];
  const style = OUTCOME_STYLE[outcome];

  const bookingHref = intent?.bookingToken
    ? localePath(locale, `/booking/${intent.bookingToken}`)
    : null;

  const whatsapp = settings.contact.whatsapp;
  const phone = settings.contact.phone;

  // بلا توكن حجز لا وجهةَ انتقال — والصفحة تبقى كما كانت تماماً
  const redirectSeconds = bookingHref ? (REDIRECT_SECONDS[outcome] ?? null) : null;

  return (
    <>
      <SiteHeader settings={settings} locale={locale} />

      <main id="main" className="flex-1">
        <div className="mx-auto flex w-full max-w-2xl flex-col gap-6 px-4 py-10 sm:px-6 md:py-14">
          <section
            aria-label={title}
            className={`flex flex-col gap-4 rounded-3xl border p-5 sm:p-6 ${style.box}`}
          >
            <div className="flex items-start gap-3">
              <span
                className={`grid size-11 shrink-0 place-items-center rounded-full ${style.icon}`}
              >
                <Icon className="size-5" aria-hidden="true" />
              </span>
              <div className="flex flex-col gap-1.5">
                <h1 className="text-lg font-extrabold sm:text-xl">{title}</h1>
                <p className="text-sm leading-7 text-muted-foreground">{body}</p>
              </div>
            </div>

            {outcome === "waiting" ? (
              <AutoRefresh
                label={t("return.waiting.refreshing", "نتحقق من حالة العملية تلقائياً…")}
              />
            ) : null}
          </section>

          {/* القاعدة التي تحكم الصفحة كلها — يقرؤها العميل لا الكود وحده */}
          <p className="flex items-start gap-2 rounded-2xl border border-border bg-muted/40 px-4 py-3 text-sm leading-7">
            <Landmark className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden="true" />
            {t(
              "return.sourceOfTruth",
              "تأكيد الدفع يصلنا من البنك مباشرةً لا من هذه الصفحة. فإن أُغلقت أو انقطع اتصالك فلا شيء يضيع: حالة حجزك تتحدث وحدها في صفحة المتابعة."
            )}
          </p>

          {/*
            العدّاد فوق الأزرار مباشرةً لا داخل صندوق النتيجة: الجملة تقول «ننقلك»
            والزر الذي ينقل الآن تحتها بسطر — فيقرأ العميل الوعد وبديله معاً.
            ولا يُصيَّر منه شيء على الخادم، فبلا جافاسكربت لا يظهر العدّاد أصلاً
            ويبقى زر «متابعة حجزي» وحده — رابطٌ عادي لا طريق مسدود.
          */}
          {bookingHref && redirectSeconds !== null ? (
            <RedirectCountdown href={bookingHref} seconds={redirectSeconds} locale={locale} />
          ) : null}

          <div className="flex flex-wrap gap-2">
            {bookingHref ? (
              <Link
                href={bookingHref}
                className="inline-flex h-11 items-center justify-center gap-2 rounded-2xl bg-primary px-5 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
              >
                <Link2 className="size-4 shrink-0" aria-hidden="true" />
                {t("return.openBooking", "متابعة حجزي")}
              </Link>
            ) : (
              <Link href={localePath(locale, "/")} className={linkClass}>
                {t("return.home", "العودة للصفحة الرئيسية")}
              </Link>
            )}

            {whatsapp ? (
              <a
                href={waHref(whatsapp)}
                target="_blank"
                rel="noopener noreferrer"
                className={linkClass}
              >
                <MessageCircle className="size-4 shrink-0" aria-hidden="true" />
                {t("return.whatsapp", "تواصل عبر واتساب")}
              </a>
            ) : null}

            {phone ? (
              <a href={telHref(phone)} className={linkClass}>
                <Phone className="size-4 shrink-0" aria-hidden="true" />
                {t("return.phone", "اتصل بنا")}
              </a>
            ) : null}
          </div>

          {!bookingHref ? (
            <p className="text-center text-xs leading-6 text-muted-foreground">
              {t(
                "return.noBookingLink",
                "افتح رابط متابعة الحجز الذي حفظته عند إنشاء الحجز — هو مفتاحك إلى صفحتك."
              )}
            </p>
          ) : null}
        </div>
      </main>

      <SiteFooter settings={settings} locale={locale} />
    </>
  );
}
