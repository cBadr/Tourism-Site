"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Timer } from "lucide-react";

import { isArabicLocale, toLocaleDigits } from "@/components/booking/format";
import { useT } from "@/components/site/i18n";

/**
 * انتقال مؤجَّل من صفحة عودة الدفع إلى صفحة الحجز — **تنقّلٌ محض**.
 *
 * لا يقرأ حالةً ولا يكتب حرفاً ولا يلمس منطق الدفع: يعدّ ثوانيَ معلومةً ثم
 * ينادي `router.replace`. مصدر الحقيقة يبقى الـ webhook كما هو مكتوب في ترويسة
 * الصفحة، وهذا المكوّن لا يعرف عنه شيئاً.
 *
 * ── خمسة قرارات، كلٌّ منها يعالج طريقةً يفشل بها العدّاد التلقائي ──────────
 *
 * (١) **لا شيء يُصيَّر على الخادم** (`useIsClient` أدناه). مكوّنات
 *     العميل في Next تُصيَّر في HTML أيضاً — فلولا هذا الحرس لرأى زائرٌ عطّل
 *     الجافاسكربت جملةَ «ننقلك خلال ٥ ثوانٍ» **ولا انتقال يقع**، وزرَّ إيقافٍ
 *     لا يستجيب. وعده كاذب وزرٌّ ميت أسوأ من صمت. وبلا جافاسكربت يبقى زر
 *     «متابعة حجزي» في الصفحة نفسها — رابطٌ عادي، فلا طريق مسدود.
 *
 * (٢) **`replace` لا `push`.** لو دُفعت صفحة الحجز فوق صفحة النتيجة لصار زر
 *     «رجوع» في المتصفح فخاً: يعيده إلى صفحة النتيجة، فيبدأ العدّاد من جديد،
 *     فيُقذف إلى الأمام ثانيةً. صفحة النتيجة عابرة بطبعها فتُستبدل.
 *
 * (٣) **العدّاد يقف حين يغيب التبويب.** العميل الذي يضغط «تواصل عبر واتساب»
 *     يفتح تبويباً آخر ويعود بعد دقيقة — فلو مضى العدّاد في غيابه لعاد إلى
 *     صفحة غير التي تركها، ولضاع عليه سبب الرفض الذي خرج ليسأل عنه.
 *
 * (٤) **زر «البقاء في هذه الصفحة» يوقفه نهائياً**، ويترك مكانه سطراً يؤكد
 *     التوقف. من يقرأ سبب رفضٍ ببطء يجب أن يملك إيقافه، لا أن يسابقه.
 *
 * (٥) **العدد المتغيّر `aria-hidden` والإعلان مرة واحدة.** رقمٌ ينطق كل ثانية
 *     في قارئ الشاشة يطمس ما قبله؛ فالإعلان جملةٌ واحدة عند الظهور تذكر المدة
 *     وسبيل الإيقاف، والعدّاد المرئي صامتٌ للقارئ.
 */

/**
 * تمييز الثواني عربياً — نفس قاعدة `hoursText` و`passengersLabel`:
 * ٣–١٠ جمعُ قِلّة مجرور، وما فوقها تمييزٌ مفرد.
 *
 * ⚠ **والمثنّى «ثانيتين» لا «ثانيتان»** — وهو الفارق الوحيد عن `hoursText`:
 * تلك تُركَّب مرفوعةً في سياقاتها (‏«مدة الرحلة ساعتان»)، وهذه تقع بعد حرف
 * جرّ دائماً في هذه الصفحة («خلال …» و«بعد …») فتُنصب بالياء. و«خلال ثانيتان»
 * خطأٌ يقرؤه كل عميل عربي في اللحظة التي يفترض أن تطمئنه.
 *
 * ونسخةٌ محلية لا إضافة إلى `components/booking/format.ts` لأن هذه الجلسة لا
 * تملك ذلك الملف؛ ومن يوحّدها لاحقاً فليحمل معها قيد الجرّ هذا.
 */
function secondsText(count: number, locale: string): string {
  const n = Math.max(0, Math.round(count));
  if (!isArabicLocale(locale)) return `${n} ${n === 1 ? "second" : "seconds"}`;
  if (n === 1) return "ثانية واحدة";
  if (n === 2) return "ثانيتين";
  if (n <= 10) return `${toLocaleDigits(n, locale)} ثوانٍ`;
  return `${toLocaleDigits(n, locale)} ثانية`;
}

/**
 * «نحن في المتصفح الآن؟» بلا `setState` داخل أثر.
 *
 * لقطة الخادم `false` ولقطة العميل `true`، فالتصيير الخادمي وأول تصييرٍ للترطيب
 * متطابقان (لا تحذير hydration) ثم يعيد React التصيير على العميل. وهو النمط
 * الذي توصي به React لهذا الغرض بالضبط، وبديلُ `useState`+`useEffect` الذي
 * يرفضه `react-hooks/set-state-in-effect` في هذا المستودع.
 */
const subscribeToNothing = () => () => {};

function useIsClient(): boolean {
  return React.useSyncExternalStore(
    subscribeToNothing,
    () => true,
    () => false
  );
}

export function RedirectCountdown({
  href,
  seconds,
  locale,
}: {
  /** وجهة الانتقال — رابط متابعة الحجز نفسه الذي يظهر في الزر أسفل الصفحة */
  href: string;
  seconds: number;
  locale: string;
}) {
  const router = useRouter();
  const t = useT("payment");

  const isClient = useIsClient();
  const [remaining, setRemaining] = React.useState(seconds);
  const [cancelled, setCancelled] = React.useState(false);

  // نبضة كل ثانية، وتتوقف عن العدّ ما دام التبويب مخفياً (القرار ٣)
  React.useEffect(() => {
    if (cancelled) return;
    const id = window.setInterval(() => {
      if (document.hidden) return;
      setRemaining((n) => (n > 0 ? n - 1 : 0));
    }, 1000);
    return () => window.clearInterval(id);
  }, [cancelled]);

  // بلوغُ الصفر هو الحدث الوحيد الذي ينقل — في أثرٍ مستقل حتى لا يقع تنقّلٌ
  // داخل نبضة المؤقّت
  React.useEffect(() => {
    if (cancelled || remaining > 0) return;
    router.replace(href);
  }, [cancelled, remaining, href, router]);

  if (!isClient) return null;

  if (cancelled) {
    return (
      <p className="rounded-2xl border border-border bg-muted/40 px-4 py-3 text-sm leading-7 text-muted-foreground">
        {t(
          "return.redirect.stopped",
          "أوقفنا الانتقال التلقائي. افتح صفحة حجزك من الزر أدناه متى شئت."
        )}
      </p>
    );
  }

  const elapsed = Math.min(Math.max(seconds - remaining, 0), seconds);
  const percent = seconds > 0 ? Math.round((elapsed / seconds) * 100) : 100;

  return (
    <div className="flex flex-col gap-2 rounded-2xl border border-border bg-muted/40 px-4 py-3">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 text-sm leading-7">
        <Timer className="size-4 shrink-0 text-primary" aria-hidden="true" />

        {/* يُعلَن مرة واحدة عند الظهور — لا مع كل ثانية */}
        <span className="sr-only" role="status">
          {t(
            "return.redirect.announce",
            "ننقلك إلى صفحة حجزك تلقائياً بعد {duration}. للبقاء هنا اضغط زر «البقاء في هذه الصفحة».",
            { duration: secondsText(seconds, locale) }
          )}
        </span>

        {/*
          الصفر ليس عدداً يُعرض: بين بلوغه وبين تمام التنقّل جزءٌ من ثانية يراه
          العميل، و«خلال ٠ ثوانٍ» جملةٌ لا معنى لها. فالسطر ينقلب إلى خبرٍ عمّا
          يجري الآن.
        */}
        <span aria-hidden="true">
          {remaining > 0
            ? t("return.redirect.notice", "ننقلك إلى صفحة حجزك خلال {duration}", {
                duration: secondsText(remaining, locale),
              })
            : t("return.redirect.going", "جارٍ نقلك إلى صفحة حجزك…")}
        </span>

        <button
          type="button"
          onClick={() => setCancelled(true)}
          className="ms-auto rounded-lg px-2 py-1 text-xs font-semibold text-muted-foreground underline underline-offset-4 transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
        >
          {t("return.redirect.stay", "البقاء في هذه الصفحة")}
        </button>
      </div>

      {/* شريط التقدّم مرآةٌ للعدّاد لا معلومة ثانية ⇒ مخفيٌّ عن قارئ الشاشة */}
      <div
        className="h-1 w-full overflow-hidden rounded-full bg-border"
        aria-hidden="true"
      >
        <div
          className="h-full rounded-full bg-primary motion-safe:transition-[width] motion-safe:duration-1000 motion-safe:ease-linear"
          style={{ width: `${percent}%` }}
        />
      </div>
    </div>
  );
}
