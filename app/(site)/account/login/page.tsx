import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { KeyRound, LifeBuoy, Search } from "lucide-react";

import { SiteFooter } from "@/components/site/footer";
import { SiteHeader } from "@/components/site/header";
import { WhatsAppFab } from "@/components/site/whatsapp-fab";
import { contactHref, localeHref } from "@/components/site/links";
import { getT, resolveLocale } from "@/lib/i18n/content";
import { localePath } from "@/lib/i18n-types";
import { getSettings } from "@/lib/settings";

import { ACCOUNT_HOME_PATH, readAccountGate, safeNextPath } from "../_lib/session";
import { AccountAuthForm } from "./_components/account-auth-form";
import { AccountLoginNotice } from "./_components/login-notice";

/**
 * ╔══════════════════════════════════════════════════════════════════════════╗
 * ║  دخول العميل وإنشاء حسابه — `/account/login`                            ║
 * ╚══════════════════════════════════════════════════════════════════════════╝
 *
 * ── ثلاثة قرارات في هذه الصفحة ─────────────────────────────────────────────
 *
 * (١) **صفحة مستقلة عن `/admin/login`، وليست توسيعاً لها.** تلك بابُ فريقٍ
 *     بلا هوية موقع، وتوجّه بعد الدخول إلى `/admin` أو `/portal` بحسب الدور —
 *     فعميلٌ يدخل منها يُقذف إلى الصفحة الرئيسية بلا تفسير. وهذه صفحة **عامة**
 *     بترويسة الموقع وتذييله ولغته، لأن الحساب امتدادٌ لرحلة الحجز لا بابٌ
 *     خلفيّ. ونظامُ المصادقة **واحد** رغم الصفحتين: Supabase Auth نفسها، والدور
 *     من `profiles` كما هو.
 *
 * (٢) **مفهرَسة عمداً — بخلاف `/account/bookings`.** «تسجيل الدخول» صفحةُ وصولٍ
 *     يبحث عنها الناس بالاسم، وليس فيها حرفٌ خاص بأحد. أما القائمة نفسها فخاصة
 *     بصاحبها ⇒ `noindex` (ويملكها غلاف السطح، لا هذه الصفحة).
 *
 * (٣) **من له جلسة لا يرى النموذج**: يُحوَّل فوراً إلى وجهته. صفحةُ دخولٍ تظهر
 *     لمن هو داخلٌ أصلاً تُقرأ «جلستي انتهت» فيعيد إدخال كلمته بلا سبب.
 *
 * والرسالة بعد كل إجراء تُقرأ من الرابط بـ`AccountLoginNotice` — لا حالة في الذاكرة،
 * والرمز الذي لا رسالة له **لا يُبنى** (الخريطة مُفهرسة بنوع الاتحاد).
 */

export async function generateMetadata(): Promise<Metadata> {
  const locale = await resolveLocale();
  const t = await getT("pages.account", locale);
  return {
    title: t("login.metaTitle", "تسجيل الدخول إلى حسابك"),
    description: t(
      "login.metaDescription",
      "ادخل إلى حسابك لتجد حجوزاتك السابقة في مكان واحد، أو أنشئ حساباً جديداً في دقيقة."
    ),
  };
}

export default async function AccountLoginPage({
  searchParams,
}: PageProps<"/account/login">) {
  const [locale, params, gate] = await Promise.all([
    resolveLocale(),
    searchParams,
    readAccountGate(),
  ]);

  // 🔒 الوجهة تمرّ بالمصفاة **هنا** قبل أن تصل المتصفح: `?next=https://evil…`
  //    على صفحة دخولٍ يصنع تحويلاً مفتوحاً يوقّعه نطاقنا.
  const next = localePath(locale, safeNextPath(params.next, ACCOUNT_HOME_PATH));

  // من له جلسة لا يرى نموذج دخول. و`env` لا تُحوِّل: بيئةٌ غير مضبوطة تعرض
  // النموذج معطَّلاً برسالته بدل حلقة تحويل لا تنتهي.
  if (gate.state === "active") redirect(next);

  const [settings, t] = await Promise.all([getSettings(locale), getT("pages.account", locale)]);
  const contact = contactHref(settings, locale);

  return (
    <>
      <SiteHeader settings={settings} locale={locale} />

      <main id="main" className="flex-1">
        <section className="site-hero-bg relative overflow-hidden">
          <div aria-hidden="true" className="pointer-events-none absolute inset-0">
            <div className="site-dots absolute inset-0 opacity-60 [mask-image:radial-gradient(ellipse_70%_90%_at_50%_0%,black,transparent)]" />
            <div className="absolute inset-x-0 bottom-0 h-px bg-gradient-to-l from-transparent via-border to-transparent" />
          </div>

          <div className="relative mx-auto flex w-full max-w-3xl flex-col items-center gap-4 px-4 pb-12 pt-12 text-center sm:px-6 md:pb-16 md:pt-16">
            <span className="grid size-12 place-items-center rounded-2xl bg-primary/10 text-primary">
              <KeyRound className="size-6" aria-hidden="true" />
            </span>
            <h1 className="text-balance text-3xl font-extrabold leading-[1.3] tracking-tight sm:text-4xl">
              {t("login.title", "حسابك")}
            </h1>
            <p className="max-w-2xl text-pretty leading-8 text-muted-foreground sm:text-lg sm:leading-9">
              {t(
                "login.lead",
                "سجّل دخولك لتجد حجوزاتك السابقة في مكان واحد، وتحجز من جديد بلا إعادة إدخال بياناتك."
              )}
            </p>
          </div>
        </section>

        <section className="py-10 md:py-14">
          <div className="mx-auto w-full max-w-md px-4 sm:px-6">
            <AccountLoginNotice params={params} locale={locale} />

            <AccountAuthForm
              next={next}
              checkEmailPath={localePath(locale, "/account/login")}
            />

            {/*
              الحساب طبقةُ راحة لا بوابة (العقد §٥): من لا يريد حساباً يتابع حجزه
              من `/track` كما كان، ورحلةُ الحجز مرسومة كاملةً بلا تسجيل. وهذا
              السطر يقول ذلك صراحةً كي لا يظنّ زائرٌ أن الحجز صار يستلزم حساباً.
            */}
            <div className="mt-6 flex flex-col gap-3 rounded-2xl border border-border bg-muted/40 p-4 text-sm leading-7 text-muted-foreground">
              <p className="flex items-start gap-2">
                <Search className="mt-1 size-4 shrink-0" aria-hidden="true" />
                <span>
                  {t(
                    "login.noAccountNeeded",
                    "لا يلزمك حساب لمتابعة حجز: اكتب رقم الحجز ورقم هاتفك في صفحة متابعة الحجز."
                  )}{" "}
                  <a
                    href={localeHref("/track", locale)}
                    className="font-medium text-primary underline-offset-4 hover:underline"
                  >
                    {t("login.trackLink", "تابع حجزك")}
                  </a>
                </span>
              </p>
              <p className="flex items-start gap-2">
                <LifeBuoy className="mt-1 size-4 shrink-0" aria-hidden="true" />
                <span>
                  {t("login.helpText", "واجهت مشكلة في الدخول؟")}{" "}
                  <a
                    href={contact}
                    className="font-medium text-primary underline-offset-4 hover:underline"
                  >
                    {t("login.helpLink", "تواصل معنا")}
                  </a>
                </span>
              </p>
            </div>
          </div>
        </section>
      </main>

      <SiteFooter settings={settings} locale={locale} />
      <WhatsAppFab settings={settings} locale={locale} />
    </>
  );
}
