"use client";

import * as React from "react";
import { ChevronDown, LogOut, TicketCheck, UserRound } from "lucide-react";

import { signOutAccount } from "@/app/(site)/account/actions";
import { cn } from "@/lib/utils";
import { useT } from "./i18n";
import { localeHref, TAP_TARGET_ROW } from "./links";

/**
 * ╔══════════════════════════════════════════════════════════════════════════╗
 * ║  مدخل حساب العميل في قشرة الموقع — جزيرةٌ صغيرة تقرأ الجلسة عندها وحدها  ║
 * ╚══════════════════════════════════════════════════════════════════════════╝
 *
 * ── لماذا وُجد هذا الملف (الفجوة ١٢) ────────────────────────────────────────
 *
 * `app/account/login` صفحةٌ مبنيّة وحيّة، و`grep` على `account/login` في الكود
 * المصدري كله **خارج** `app/account/` كان يرجع **صفر نتيجة**: لا زرّ ولا رابط
 * ولا سطر واحد يقود إليها من أي صفحة. أي أن الميزة — بلغة القاعدة الذهبية ١٧ —
 * **غير مبنيّة من وجهة نظر مالكها**. وهذا الملف هو المنادي الذي كان ناقصاً.
 *
 * ── 🔴 والقيد البنيوي الذي يفسّر شكله: جزيرة، لا ترويسة ديناميكية ──────────
 *
 * قراءة الجلسة في **الترويسة** تعني قراءتها في **كل صفحة من الموقع**، والترويسة
 * اليوم ثابتة تماماً وتُخبَّأ بالكامل. فلو قرأ `SiteHeader` الجلسة (‏`cookies()`
 * أو `auth.getUser()`) لصارت **كل** صفحة عامة ديناميكية — الرئيسية وصفحات
 * الخدمات والمسارات — وهي صفحات السيو نفسها التي بُني عليها المنتج.
 *
 * فالحلّ المكتوب في جدول الفجوات: **جزيرة عميل صغيرة تقرأ الجلسة عندها وحدها**.
 * الترويسة تبقى مكوّناً خادمياً ثابتاً، وهذه الجزيرة تُصيَّر معها بحالتها
 * الافتراضية ثم تصحّح نفسها في المتصفح.
 *
 * ── والحالة الافتراضية «بلا جلسة» عمداً، لا «لا نعرف» ──────────────────────
 *
 * التصيير الأول (خادماً، وقبل ترطيب الجزيرة) يعرض **رابط الدخول**. والسبب
 * ثلاثي:
 *   ١ الأغلبية الساحقة من الزوار بلا جلسة أصلاً، فلا وميض لهم.
 *   ٢ الرابط يعمل **بلا JavaScript إطلاقاً** — كقائمة الجوال (‏`details`)
 *     ومبدّل اللغة، وهو عُرف هذه القشرة كلها.
 *   ٣ وهو **ليس خطأً أبداً** لمن له جلسة: `/account/login` تُحوِّل صاحب الجلسة
 *     فوراً إلى «حجوزاتي» (‏`app/account/login/page.tsx` قرار ٣). فأسوأ ما يقع
 *     لمن عطّل JavaScript هو نقرةٌ تصل به إلى الوجهة الصحيحة.
 *
 * وهيكل «هيكل عظمي» ينتظر الجواب كان سيعطي الجميع فراغاً، ويكسر السطر الثاني.
 *
 * ── 🔒 وهذه واجهةٌ لا حارس ──────────────────────────────────────────────────
 *
 * ما يُقرأ هنا يقرّر **أي نصٍّ يُعرض** ولا يفتح بياناً واحداً. الحارس الحقيقي
 * ثلاث طبقات لا تمرّ بهذا الملف: `readAccountGate` في غلاف `/account`، و
 * `accountAccess` في مطلع كل إجراء، و`auth.uid()` **داخل** دوال `0044`. فمن
 * زوّر حالةً هنا لا يكسب إلا زرّاً يقوده إلى صفحةٍ ترفضه.
 *
 * ولذلك `getSession()` لا `getUser()`: الثانية تُصادق التوكن مع خادم المصادقة
 * — نداء شبكة على **كل صفحة** — ولا تشتري شيئاً لقرارٍ نصّيّ محض. والأولى تقرأ
 * الكوكي كما هو، وهو ما يكفي لسؤال «أيُعرض «حسابي» أم «دخول العملاء»؟».
 */

/**
 * ── 🔴 ولوحُ المظهر يسكن هنا منذ ٢٠٢٦‑٠٨‑١٨ (قرار بدر: الفصل بالوظيفة) ─────
 *
 * كتلة اليمين كانت **ستة أهداف** بعرض ٤٤٧ بكسل عند ‏١٢٨٠ لأن مبدّل المظهر ليس
 * زرّاً بل **ثلاث خانات**. وقراره: اللغة تبقى ظاهرة في الشريط (قرارُ محتوى
 * يُتّخذ في أول ثوانٍ)، والمظهر ينتقل إلى هذه القائمة (تفضيلٌ شخصي يُضبط مرة).
 *
 * والتمرير **عبر `prop` من الترويسة** لا باستيرادٍ هنا، ولا خيار في ذلك:
 * `ThemeToggle` مكوّنٌ خادميّ `async` يقرأ الكوكي، وهذا الملف `"use client"` —
 * فاستيراده هنا يحوّله إلى مكوّن عميل ويكسر «بلا جافاسكربت». أما تمريره
 * مُصيَّراً من مكوّنٍ خادميّ فيمرّ في حمولة RSC سليماً، وهو النمط الوحيد الصحيح.
 *
 * ── وثمنُ القرار، مذكوراً لا مخفياً ─────────────────────────────────────────
 *
 * ⚠ **مدخل الشريط كان رابطاً مباشراً لمن لا جلسة له، وصار قائمةً.** والسبب أن
 * الحالة المجهولة هي حالُ الأغلبية الساحقة من الزوار: لو بقيت رابطاً لَما وجد
 * أيُّ زائرٍ مجهول لوحَ المظهر عند `xl` فصاعداً إطلاقاً — الشريط لا يحمله،
 * والدرج مخفيٌّ فوق `xl`. أي أن الميزة تختفي عمّن يمثّل ٩٩٪ من الزيارات.
 *
 * والثمن: «دخول العملاء» صار نقرتين عند `xl` فصاعداً. وهو محتمَل لأنه **ليس
 * نداء المنتج الأول** (‏«احجز الآن» هو، وهو باقٍ نقرةً واحدة)، ولأن الرابط يبقى
 * **نقرةً واحدة** في درج الجوال وفي التذييل — أي أن الطريق القصير لم يُغلق، بل
 * انتقل إلى العروض التي يكثر فيها.
 *
 * أين تُركَّب الجزيرة:
 * - `bar`   شريط الإجراءات في الترويسة (زرّ مضغوط بجوار «احجز الآن»)
 * - `drawer` درج الجوال (صفوف كاملة العرض مثل بقية روابط الدرج)
 */
type AccountMenuVariant = "bar" | "drawer";

type AccountMenuProps = {
  variant?: AccountMenuVariant;
  locale?: string;
  className?: string;
  /**
   * لوحُ المظهر مُصيَّراً من الترويسة (مكوّن خادميّ) — يُعرض أسفل القائمة في
   * صيغة `bar` وحدها. وحضورُه هو ما يحوّل الحالة المجهولة من رابطٍ إلى قائمة،
   * فبقاؤها رابطاً مع وجوده يعني لوحاً لا يبلغه أحد.
   */
  theme?: React.ReactNode;
};

/** حالة الجلسة كما تراها الجزيرة — ولا حرف زيادة (لا بريد ولا معرّف) */
type SessionState = "anonymous" | "signed-in";

export function AccountMenu({ variant = "bar", locale, className, theme }: AccountMenuProps) {
  const t = useT("site.header");
  const [state, setState] = React.useState<SessionState>("anonymous");

  React.useEffect(() => {
    let active = true;
    let unsubscribe: (() => void) | undefined;

    // الاستيراد داخل التأثير: عميل Supabase لا يدخل حزمة أول تصيير للصفحات
    // العامة، وهي المسار الحرج الذي تُقاس عليه سرعة الموقع.
    void import("@/lib/supabase/client")
      .then(({ createBrowserSupabase }) => {
        const supabase = createBrowserSupabase();
        // بلا متغيّرات بيئة لا جلسة أصلاً — يبقى رابط الدخول كما هو
        if (!supabase || !active) return;

        // `onAuthStateChange` تُطلق `INITIAL_SESSION` فور الاشتراك، فتغني عن
        // نداء `getSession()` منفصل، وتلتقط الدخول والخروج من تبويب آخر كذلك.
        const { data } = supabase.auth.onAuthStateChange((_event, session) => {
          if (active) setState(session ? "signed-in" : "anonymous");
        });
        unsubscribe = () => data.subscription.unsubscribe();
      })
      .catch(() => {
        // فشل تحميل العميل أو الشبكة — الحالة الافتراضية هي الجواب الصحيح
      });

    return () => {
      active = false;
      unsubscribe?.();
    };
  }, []);

  const loginHref = localeHref("/account/login", locale);
  const bookingsHref = localeHref("/account/bookings", locale);

  const signInLabel = t("signIn", "دخول العملاء");
  const accountLabel = t("account", "حسابي");
  const bookingsLabel = t("myBookings", "حجوزاتي");
  const signOutLabel = t("signOut", "خروج");

  /** صفٌّ كامل العرض — واحدٌ للدرج ولقائمة الشريط، فلا يفترق إيقاعُ الصفوف */
  /* `py-3` ⇒ ١٢+١٢+٢٠ = **٤٤ حقيقية** بدل ٤٠ المقيسة. والصفوف رأسيةٌ في
     لوحٍ وفي درج، فالحشو الحقيقي هو الصواب لا الهالة (`links.ts`: «هالةٌ حيث
     الضيق، وحشوٌ حيث السعة»). */
  const rowClass =
    "flex items-center gap-2 rounded-xl px-3 py-3 text-sm font-medium transition-colors hover:bg-muted";

  /* ───────────────────────── درج الجوال ───────────────────────── */
  if (variant === "drawer") {
    if (state === "anonymous") {
      return (
        <a href={loginHref} className={cn(rowClass, "text-foreground", className)}>
          <UserRound className="size-4 shrink-0" aria-hidden="true" />
          {signInLabel}
        </a>
      );
    }

    return (
      <div className={cn("flex flex-col gap-1", className)}>
        <a href={bookingsHref} className={cn(rowClass, "text-foreground")}>
          <TicketCheck className="size-4 shrink-0" aria-hidden="true" />
          {bookingsLabel}
        </a>
        <form action={signOutAccount}>
          <button type="submit" className={cn(rowClass, "w-full text-muted-foreground")}>
            <LogOut className="size-4 shrink-0" aria-hidden="true" />
            {signOutLabel}
          </button>
        </form>
      </div>
    );
  }

  /* ─────────────────── شريط الإجراءات في الترويسة ─────────────────── */

  /* `border-input` لا `border-border`: هذا حدُّ **عنصر تحكّم** يُنقر، و
     `WCAG 1.4.11` يطلب له ٣:١. و`--border` رمزُ هويةٍ قياسه ١.٢٩/١.٤٣ — راسبٌ
     لهذا الغرض، ناجحٌ لخطّ البطاقة الذي وُجد له (‏`globals.css` §(ز)). */
  /* ١١٢٫٥×٣٨ مقيسة ⇒ الهالة تبلغ بها ٤٤ لمساً والصندوق لا يتحرّك، فتبقى
     أرقام كتلة اليمين في `header.tsx` (٢٩٥ · ٣١٥) صحيحةً بعد التغيير. */
  const barClass = cn(
    "inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-input px-3 py-2 text-sm font-medium whitespace-nowrap text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60",
    TAP_TARGET_ROW
  );

  /* بلا لوح مظهرٍ مُمرَّر تبقى الحالة القديمة حرفاً: رابطٌ مباشر بنقرة واحدة.
     ومع اللوح تصير قائمةً في الحالتين — وإلا لم يبلغ اللوحَ زائرٌ مجهول عند
     `xl` فصاعداً أبداً (الشريط لا يحمله، والدرج مخفيّ فوق `xl`). */
  if (state === "anonymous" && !theme) {
    return (
      <a href={loginHref} className={cn(barClass, className)}>
        <UserRound className="size-4 shrink-0" aria-hidden="true" />
        {signInLabel}
      </a>
    );
  }

  /*
   * قائمة `details/summary` الأصلية — نفس نمط قائمة الجوال ومبدّل اللغة: تفتح
   * بالكيبورد وبقارئ الشاشة بلا سطر JavaScript إضافي، ولا تحتاج مكتبة. ونموذج
   * المظهر يعمل داخلها كما يعمل نموذج الخروج — `details` لا يمنع `form`.
   */
  const menuLabel = t("accountMenu", "قائمة الحساب");

  return (
    <details className={cn("group relative", className)}>
      <summary
        aria-label={menuLabel}
        className={cn(barClass, "cursor-pointer list-none [&::-webkit-details-marker]:hidden")}
      >
        <UserRound className="size-4 shrink-0" aria-hidden="true" />
        {/* «حسابي» في الحالتين لا «دخول العملاء»: هذا فاتحُ قائمةٍ لا فعلُ دخول،
            وتسميتُه باسم الفعل تَعِد بما لا تفي به الضغطة. والفعل نفسه أول صفٍّ
            في الداخل بنصّه الصريح. ولا مفتاح رسائل جديداً: `account` قائم. */}
        {accountLabel}
        <ChevronDown
          className="size-3.5 shrink-0 transition-transform group-open:rotate-180"
          aria-hidden="true"
        />
      </summary>

      {/* `end-0` و`top-11` مطابقتان لقائمة الجوال ومبدّل اللغة حرفاً — ثلاث
          قوائم في شريط واحد يجب أن تنسدل من الموضع نفسه، و`end` منطقية فتنقلب
          وحدها في LTR بعد تفعيل الإنجليزية (اتفاقيات §١).
          و`div` تغلّف `nav`: لوحُ المظهر **ليس تنقّلاً**، فوضعُه داخل معْلَمِ
          تنقّلٍ يكذب على قارئ الشاشة. */}
      <div className="absolute end-0 top-11 z-50 flex w-48 flex-col gap-1 rounded-2xl border border-border bg-background p-2 shadow-xl">
        <nav aria-label={menuLabel} className="flex flex-col gap-1">
          {state === "anonymous" ? (
            <a href={loginHref} className={cn(rowClass, "text-foreground")}>
              <UserRound className="size-4 shrink-0" aria-hidden="true" />
              {signInLabel}
            </a>
          ) : (
            <>
              {/* «حجوزاتي» (الفجوة ١٣) — موضعها الطبيعي تحت زرّ الحساب لا في
                  شريط الروابط، فمن لا حساب له لا يعنيه مدخلٌ إلى قائمةٍ فارغة. */}
              <a href={bookingsHref} className={cn(rowClass, "text-foreground")}>
                <TicketCheck className="size-4 shrink-0" aria-hidden="true" />
                {bookingsLabel}
              </a>

              {/*
                نموذج `POST` لا رابط — نفس قرار شريط `/account`: الخروج يغيّر
                حالة الخادم، ورابطُ GET يستهلكه سابقُ الجلب في المتصفح فيَخرج
                المستخدم بلا أن يضغط شيئاً. وهو هنا لأن زرّ الخروج كان محبوساً في
                صفحات `/account` وحدها: من دخل ثم تصفّح الموقع لم يجد طريقاً
                للخروج.
              */}
              <form action={signOutAccount}>
                <button
                  type="submit"
                  className={cn(rowClass, "w-full text-muted-foreground hover:text-foreground")}
                >
                  <LogOut className="size-4 shrink-0" aria-hidden="true" />
                  {signOutLabel}
                </button>
              </form>
            </>
          )}
        </nav>

        {theme ? (
          <>
            <span aria-hidden="true" className="my-1 h-px bg-border" />
            {theme}
          </>
        ) : null}
      </div>
    </details>
  );
}

export default AccountMenu;
