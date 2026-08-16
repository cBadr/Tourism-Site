import { BookmarkPlus, LogIn } from "lucide-react";

import { PRINT_HIDDEN_CLASS } from "@/lib/export-types";
import { localePath } from "@/lib/i18n-types";

import { linkBookingByToken } from "../actions";
import { ACCOUNT_HOME_PATH, ACCOUNT_LOGIN_PATH, readAccountGate } from "../_lib/session";

/**
 * «أضِف هذا الحجز إلى حسابي» — بطاقة صغيرة في صفحة `/booking/[token]`.
 *
 * ── لماذا هنا، وليس في منطقة الحساب ───────────────────────────────────────
 *
 * لأن هذا هو **المدخل الثاني** للربط في العقد (§٥): الأول يكتبه العميل بمرجعه
 * وهاتفه من شاشة حجوزاته، والثاني — هذا — **حيازةُ التوكن إثباتاً** بعد إتمام
 * حجزٍ جديد. وصفحةُ التوكن هي المكان الوحيد الذي يملك فيه الخادم التوكن أصلاً.
 *
 * وبلا هذه البطاقة يكون `link_booking_by_token` في القاعدة و`linkBookingByToken`
 * في الخادم **بلا منادٍ واحد** — أي ميزةٌ غير موجودة من وجهة نظر مالكها مهما
 * كانت خضراء في الاختبارات (القاعدة ١٧ في `handover/INDEX.md`).
 *
 * ── وثلاثة قرارات صغيرة ───────────────────────────────────────────────────
 *
 * (١) **لا تظهر إلا لمن له جلسة، أو دعوةً للدخول لمن لا جلسة له.** ولا تظهر
 *     إطلاقاً حين تكون البيئة غير مضبوطة أو الهجرة غائبة: بطاقةٌ تَعِد بميزة
 *     لا تعمل أسوأ من غيابها، والصفحة نفسها تبقى عاملة كما كانت في الحالتين.
 *
 * (٢) **التوكن وسيطٌ مربوط (bound) لا حقل نموذج.** فلا يظهر في HTML الصفحة
 *     مرةً ثانية، ولا يستطيع أحدٌ استبداله بتوكنٍ آخر من أدوات المطوّر.
 *     (والحارس الحقيقي في القاعدة على أي حال: الحساب من `auth.uid()` لا من وسيط.)
 *
 * (٣) **مخفيّة في الطباعة**: زرٌّ تفاعليّ على ورقةٍ مطبوعة ضجيج — نفس معاملة
 *     أزرار المشاركة والدفع في هذه الصفحة.
 *
 * ⚠ والزائر بلا جلسة يُدعى إلى الدخول **ولا يُطالَب به**: «رحلة العميل مرسومة
 * كاملةً بلا حساب» (الرؤية)، وصفحة التوكن هي المرجع كما كانت. الحساب طبقةُ
 * راحة فوقها لا بوابةٌ دونها — ونصّ البطاقة يقول ذلك.
 */

type LinkThisBookingProps = {
  token: string;
  locale: string;
  /** نص مترجَم إن وُجد — والاحتياطي العربي هو المعروض اليوم */
  t?: (key: string, fallback: string) => string;
};

const cardClass =
  "flex flex-col gap-3 rounded-2xl border border-border bg-card p-4 text-card-foreground sm:flex-row sm:items-center";

export async function LinkThisBooking({ token, locale, t }: LinkThisBookingProps) {
  const gate = await readAccountGate();

  // فشلٌ صامت مقصود: لا بطاقة تَعِد بما لا يعمل (بيئة ناقصة أو هجرة 0044 غائبة)
  if (gate.state === "env" || gate.state === "schema") return null;

  const say = (key: string, fallback: string) => (t ? t(key, fallback) : fallback);

  if (gate.state === "anonymous") {
    const href = `${localePath(locale, ACCOUNT_LOGIN_PATH)}?next=${encodeURIComponent(ACCOUNT_HOME_PATH)}`;
    return (
      <div className={`${cardClass} ${PRINT_HIDDEN_CLASS}`}>
        <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary">
          <LogIn className="size-5" aria-hidden="true" />
        </span>
        <p className="flex-1 text-sm leading-7 text-muted-foreground">
          {say(
            "account.anonymousHint",
            "لديك حساب عندنا؟ سجّل دخولك لتجتمع رحلاتك في قائمة واحدة — وهذه الصفحة تبقى طريقك إلى حجزك على أي حال."
          )}
        </p>
        <a
          href={href}
          className="inline-flex h-11 shrink-0 items-center justify-center gap-2 rounded-2xl border border-border bg-background px-4 text-sm font-semibold transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
        >
          {say("account.loginCta", "تسجيل الدخول")}
        </a>
      </div>
    );
  }

  return (
    <form action={linkBookingByToken.bind(null, token)} className={`${cardClass} ${PRINT_HIDDEN_CLASS}`}>
      <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary">
        <BookmarkPlus className="size-5" aria-hidden="true" />
      </span>
      <p className="flex-1 text-sm leading-7 text-muted-foreground">
        {say(
          "account.linkHint",
          "أضِف هذه الرحلة إلى حسابك لتجدها في «حجوزاتي» بلا حاجة إلى هذا الرابط."
        )}
      </p>
      <button
        type="submit"
        className="inline-flex h-11 shrink-0 items-center justify-center gap-2 rounded-2xl border border-border bg-background px-4 text-sm font-semibold transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
      >
        {say("account.linkCta", "أضِفها إلى حسابي")}
      </button>
    </form>
  );
}
