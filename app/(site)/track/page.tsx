import type { Metadata } from "next";
import { Hash, LifeBuoy, Phone, Search, TriangleAlert } from "lucide-react";
import { getSettings } from "@/lib/settings";
import { buildPageMetadata } from "@/lib/seo";
import { getT, resolveLocale } from "@/lib/i18n/content";
import { SiteHeader } from "@/components/site/header";
import { SiteFooter } from "@/components/site/footer";
import { WhatsAppFab } from "@/components/site/whatsapp-fab";
import { contactHref, localeHref } from "@/components/site/links";
import { HelpTip } from "@/components/shared/HelpTip";
import type { BookingLookupErrorCode } from "@/lib/booking-types";
import { findBooking } from "./actions";

/**
 * صفحة «تابع حجزك» (/track) — الملاحظة ١ في ملحق ٢ من الرؤية بصياغة بدر:
 * «العميل لا يصل صفحة حجزه إلا بالرابط المباشر الذي وصله؛ فإن أغلق التبويب فقد
 * الطريق. المطلوب مدخل ظاهر في الموقع، ونموذج تابع حجزك».
 *
 * ── ثلاثة قرارات في هذه الصفحة ─────────────────────────────────────────────
 *
 * (١) **مسارها الجذر `/track` لا `/booking/track`.** بادئة `/booking` محجوزة
 *     بالكامل في `lib/seo/site-paths.ts`، وصفحة حية تحتها تناقض ذلك الملف.
 *
 * (٢) **مكوّن خادمي ونموذج `<form action={…}>` عارٍ — بلا حالة عميل.** يعمل
 *     وJavaScript معطّل (التحسين التدريجي مضمون في هذه النسخة من Next لنماذج
 *     الإجراءات الخادمية)، والخطأ يسافر رمزاً في query string فتترجمه الصفحة
 *     إلى عربية — اتفاقية ٤ حرفياً: لا `useState` لرسالة خطأ.
 *
 * (٣) **مفهرَسة عمداً، بخلاف `/booking/[token]`.** تلك خاصة بتوكن العميل
 *     (‏noindex/nofollow)، وهذه سطح وصول: من أغلق التبويب يبحث في جوجل عن
 *     «متابعة حجز» قبل أن يبحث في الموقع. فلها canonical وhreflang من
 *     `buildPageMetadata` كأي صفحة عامة.
 *
 * ولا يُعاد أي حقل مكتوب في رابط الخطأ: رقم الهاتف بيانٌ شخصي لا يوضع في
 * query string، ورقم الحجز يتسرب في سجلات الخادم وفي ترويسة المُحيل إلى كل
 * وسم قياس مركَّب في `app/layout.tsx`. الثمن أن يعيد الزائر الكتابة — مقبول.
 */

type TrackPageProps = {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
};

export async function generateMetadata(): Promise<Metadata> {
  const locale = await resolveLocale();
  const t = await getT("pages.track", locale);
  return buildPageMetadata({
    title: t("metaTitle", "تابع حجزك"),
    description: t(
      "metaDescription",
      "أغلقت صفحة حجزك؟ اكتب رقم الحجز ورقم الهاتف الذي سجّلته، ونفتح لك صفحة المتابعة بحالة الحجز وبيانات التحويل."
    ),
    path: "/track",
    locale,
  });
}

/**
 * رموز الخطأ ← مفتاح الترجمة ونصه العربي الاحتياطي.
 *
 * `notFound` **لا يذكر أي الحقلين أخطأ**: من عرف أن الهاتف صحيح والمرجع خطأ
 * يملك نصف الجواب، ويصير الباقي تعداداً على فضاء المرجع وحده. رسالة واحدة
 * للحالتين، وكل رسالة تقول للزائر ما يفعله الآن لا ما حدث عندنا.
 */
const ERROR_TEXT: Record<BookingLookupErrorCode, { key: string; fallback: string }> = {
  "invalid-input": {
    key: "errors.invalidInput",
    fallback: "اكتب رقم الحجز ورقم الهاتف معاً، كما سجّلتهما وقت الحجز.",
  },
  "not-found": {
    key: "errors.notFound",
    fallback:
      "لم نعثر على حجز بهذه البيانات. راجع رقم الحجز ورقم الهاتف كما سجّلتهما وقت الحجز، أو تواصل معنا وسنجده لك.",
  },
  "rate-limited": {
    key: "errors.rateLimited",
    fallback: "محاولات كثيرة في وقت قصير. انتظر قليلاً ثم أعد المحاولة، أو تواصل معنا مباشرة.",
  },
  "db-unavailable": {
    key: "errors.dbUnavailable",
    fallback: "تعذّر البحث الآن لسبب تقني عندنا. أعد المحاولة بعد قليل، أو تواصل معنا مباشرة.",
  },
};

/** رمز الخطأ من الرابط — وما ليس رمزاً معروفاً لا يُعرض إطلاقاً */
function readError(value: unknown): BookingLookupErrorCode | null {
  return typeof value === "string" && value in ERROR_TEXT
    ? (value as BookingLookupErrorCode)
    : null;
}

const fieldClass =
  "h-12 w-full rounded-2xl border border-input bg-background px-3 text-base outline-none transition-colors focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50";

export default async function TrackPage({ searchParams }: TrackPageProps) {
  const locale = await resolveLocale();
  const [settings, t, params] = await Promise.all([
    getSettings(locale),
    getT("pages.track", locale),
    searchParams,
  ]);

  const error = readError(params.error);
  const contact = contactHref(settings, locale);

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
              {t("title", "تابع حجزك")}
            </h1>
            <p className="max-w-2xl text-pretty leading-8 text-muted-foreground sm:text-lg sm:leading-9">
              {t(
                "lead",
                "أغلقت الصفحة أو فقدت الرابط؟ اكتب رقم الحجز ورقم الهاتف الذي سجّلته، ونفتح لك صفحة حجزك بحالتها وبيانات التحويل ورفع الإيصال."
              )}
            </p>
          </div>
        </section>

        {/* النموذج */}
        <section className="py-10 md:py-14">
          <div className="mx-auto w-full max-w-2xl px-4 sm:px-6">
            {error ? (
              <p
                role="alert"
                className="mb-6 flex items-start gap-2 rounded-2xl border border-destructive/40 bg-destructive/10 px-3 py-2.5 text-sm leading-6 text-destructive"
              >
                <TriangleAlert className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
                {t(ERROR_TEXT[error].key, ERROR_TEXT[error].fallback)}
              </p>
            ) : null}

            <form
              action={findBooking}
              aria-label={t("form.ariaLabel", "نموذج متابعة الحجز")}
              className="flex flex-col gap-5 rounded-3xl border border-border bg-card p-5 text-card-foreground sm:p-6"
            >
              {/* رقم الحجز */}
              <div className="flex flex-col gap-1.5">
                <label
                  htmlFor="track-reference"
                  className="flex items-center gap-2 text-sm font-medium"
                >
                  <Hash className="size-4 text-muted-foreground" aria-hidden="true" />
                  {t("form.reference", "رقم الحجز")}
                  <HelpTip>
                    {t(
                      "form.referenceTip",
                      "رقم يبدأ بـ TR- ويظهر أعلى صفحة حجزك. إن لم تعد تملكه، تواصل معنا وسنجد حجزك برقم هاتفك."
                    )}
                  </HelpTip>
                </label>
                <input
                  id="track-reference"
                  name="reference"
                  type="text"
                  required
                  dir="ltr"
                  autoComplete="off"
                  spellCheck={false}
                  maxLength={32}
                  placeholder={t("form.referencePlaceholder", "TR-XXXXXX")}
                  aria-describedby="track-reference-help"
                  className={`${fieldClass} text-start`}
                />
                <p id="track-reference-help" className="text-xs leading-5 text-muted-foreground">
                  {t("form.referenceHelp", "اكتبه كما هو — الحروف الكبيرة والصغيرة سواء.")}
                </p>
              </div>

              {/* رقم الهاتف */}
              <div className="flex flex-col gap-1.5">
                <label
                  htmlFor="track-phone"
                  className="flex items-center gap-2 text-sm font-medium"
                >
                  <Phone className="size-4 text-muted-foreground" aria-hidden="true" />
                  {t("form.phone", "رقم الهاتف")}
                </label>
                <input
                  id="track-phone"
                  name="phone"
                  type="tel"
                  required
                  inputMode="tel"
                  dir="ltr"
                  autoComplete="tel"
                  maxLength={32}
                  placeholder={t("form.phonePlaceholder", "01xxxxxxxxx")}
                  aria-describedby="track-phone-help"
                  className={`${fieldClass} text-start`}
                />
                <p id="track-phone-help" className="text-xs leading-5 text-muted-foreground">
                  {t("form.phoneHelp", "نفس الرقم الذي سجّلته وقت الحجز — بأي صيغة كتبته.")}
                </p>
              </div>

              <button
                type="submit"
                className="inline-flex h-12 w-full items-center justify-center gap-2 rounded-2xl bg-primary text-base font-semibold text-primary-foreground shadow-lg shadow-primary/25 transition-all hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
              >
                <Search className="size-5" aria-hidden="true" />
                {t("form.submit", "افتح صفحة حجزي")}
              </button>

              <p className="text-xs leading-6 text-muted-foreground">
                {t(
                  "form.privacyNote",
                  "نطلب الرقمين معاً حمايةً لحجزك: أحدهما وحده لا يفتح شيئاً."
                )}
              </p>
            </form>
          </div>
        </section>

        {/* لمن فقد رقم حجزه */}
        <section className="bg-muted/40 py-14 md:py-20">
          <div className="mx-auto w-full max-w-3xl px-4 sm:px-6">
            <div className="flex flex-col items-start gap-4 rounded-2xl border border-border bg-card p-5 text-card-foreground sm:flex-row sm:items-center sm:p-6">
              <span className="grid size-11 shrink-0 place-items-center rounded-2xl bg-primary/10 text-primary">
                <LifeBuoy className="size-5" aria-hidden="true" />
              </span>
              <div className="flex flex-col gap-1.5">
                <h2 className="text-base font-bold leading-snug">
                  {t("help.title", "لا تعرف رقم حجزك؟")}
                </h2>
                <p className="text-sm leading-7 text-muted-foreground">
                  {t(
                    "help.text",
                    "تواصل معنا برقم الهاتف الذي حجزت به وسنفتح لك حجزك بأنفسنا — ولا داعي لإعادة الحجز من جديد."
                  )}
                </p>
              </div>
              <a
                href={contact}
                className="inline-flex h-11 shrink-0 items-center justify-center gap-2 rounded-2xl border border-border bg-background px-4 text-sm font-semibold transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50 sm:ms-auto"
              >
                {t("help.contact", "تواصل معنا")}
              </a>
            </div>

            <p className="mt-6 text-center text-sm text-muted-foreground">
              {t("help.notBookedYet", "لم تحجز بعد؟")}{" "}
              <a
                href={localeHref("/book", locale)}
                className="font-medium text-primary underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
              >
                {t("help.bookLink", "احسب سعر رحلتك واحجزها الآن")}
              </a>
            </p>
          </div>
        </section>
      </main>

      <SiteFooter settings={settings} locale={locale} />
      <WhatsAppFab settings={settings} locale={locale} />
    </>
  );
}
