import { Check, ChevronDown, Monitor, Moon, Sun } from "lucide-react";
import { cn } from "@/lib/utils";
import { getActiveLocale } from "@/i18n/server";
import { getT } from "@/lib/i18n/content";
import { getThemeChoice, THEME_CHOICES, type ThemeChoice } from "@/lib/theme";
import { setThemeChoice } from "@/app/(site)/theme-actions";
import { TAP_TARGET_SQUARE } from "./links";

/**
 * مبدّل الثيم — مكوّن خادمي بلا أي JavaScript على العميل، كمبدّل اللغة تماماً.
 *
 * ── ثلاثة خيارات لا خياران، ولا زرٌّ يدور ───────────────────────────────────
 *
 * الحالات ثلاث حقيقةً (`lib/theme.ts`)، فتُعرض ثلاثاً:
 *
 * • **زرّان فقط** يعني أن «اتبع نظامي» تُفقد بأول ضغطة ولا تعود. ومن فتح الموقع
 *   من هاتفٍ يقلب ثيمه بالغروب يفقد ذلك للأبد لأنه جرّب المبدّل مرةً.
 * • **زرٌّ يدور** على ثلاث حالات يخفي الحالة الحالية عن العين حتى تُقرأ
 *   الأيقونة، ولا يعطي وصولاً مباشراً للثالثة — ضغطتان لبلوغ حالة.
 *
 * والشكل مجموعةُ خيارات (`role="group"` مع `aria-pressed`)، فيقرؤها قارئ الشاشة
 * «مضغوط/غير مضغوط» ويعرف أيّها النشط بلا لون — و«صحّ» بجانب النشط تقول ذلك
 * للعين، كما في مبدّل اللغة حرفاً.
 *
 * ── 🔴 ولماذا صار **صفوفاً** بعد أن كان شريطاً مقسّماً (٢٠٢٦‑٠٨‑١٨) ─────────
 *
 * الشكل السابق كان `variant="menu"` (ثلاث خانات أيقونية في الترويسة) و
 * `variant="inline"` (ثلاث خانات بنصوصها في الدرج). وكلاهما سقط بقياسٍ حيّ:
 *
 * (١) **في الترويسة**: ثلاث خانات = **ثلاثة أهداف** في كتلة اليمين، فصارت
 *     الكتلة **ستة أهداف** بعرض ٤٤٧ بكسل عند ‏١٢٨٠ — وهي الزحمة التي شكا منها
 *     بدر. وقراره: اللغة تبقى ظاهرة (قرار محتوى يُتّخذ في أول ثوانٍ) والمظهر
 *     ينتقل إلى قائمة الحساب (تفضيلٌ شخصي يُضبط مرة).
 *
 * (٢) **في الدرج**: الشريط المقسّم **كان مكسوراً أصلاً عند ٣٧٥** — قياسٌ حيّ لا
 *     تقدير: الخانات الثلاث تطلب ‏٨٠+٧٠+٧٠ = ‏٢٢٠ بكسل داخل مجموعةٍ عرضها
 *     ‏١٨٢، فيلتفّ نصُّ «حسب النظام» سطرين (ارتفاع ٥٢ مقابل ٣٢ لأختيه) ويفيض
 *     الدرج ‏٣٣ بكسل أفقياً خارج حدّه. صفٌّ لكل خيار يزيل الفيض بنيوياً: لا
 *     ثلاثة نصوص تتقاسم ‏١٨٢ بكسل، بل واحدٌ يأخذ السطر كاملاً.
 *
 * ولذلك **لا `variant` هنا بعد اليوم**: شكلٌ واحد يظهر في موضعَيه (درج الجوال
 * وقائمة الحساب) بالهيئة نفسها. وهذا ليس تبسيطاً تجميلياً — إبقاءُ الشريط
 * المقسّم في الملف يعني أن أول من يريد «مبدّلاً مضغوطاً في الشريط» يجده جاهزاً
 * فيعيد العيب نفسه بسطرٍ واحد.
 *
 * ── ولا تلميح تحويم (`title`) ───────────────────────────────────────────────
 *
 * النصّ ظاهرٌ دائماً الآن، فلا حاجة إليه. وقد رُفض التلميح صراحةً كعلاجٍ للزحمة:
 * **لا تحويم على اللمس** — أي أنه يغيب في الضيق ويحضر في السعة، عكس المطلوب.
 *
 * ── ولا حالةَ تُحسب هنا ─────────────────────────────────────────────────────
 *
 * المكوّن يقرأ الاختيار ولا يقرّر شيئاً: القرار في CSS (‏`globals.css` §١ب)
 * وفي الغلاف. فلو حُذف هذا الملف كلّه بقي الموقع يتبع نظام الزائر بلا عطب —
 * وهو **الاختبار الصحيح** لمبدّلٍ غير محشور في المسار الحرج.
 *
 * ⚠ **وثلاثة أزرارٍ في نموذجٍ واحد** لا ثلاثة نماذج: النموذج واحد و`value` على
 * كل زرّ. وهذا ما يجعله يعمل بلا جافاسكربت — الزرّ المضغوط وحده يُرسل قيمته.
 */

const ICONS: Record<ThemeChoice, typeof Sun> = {
  system: Monitor,
  light: Sun,
  dark: Moon,
};

/** النصّ الافتراضي حين يغيب المفتاح — القاعدة الرابعة: عربيةٌ لا مفتاحٌ خام */
const FALLBACK: Record<ThemeChoice, string> = {
  system: "حسب النظام",
  light: "فاتح",
  dark: "داكن",
};

type ThemeToggleProps = {
  className?: string;
};

export async function ThemeToggle({ className }: ThemeToggleProps) {
  const locale = await getActiveLocale();
  const [current, t] = await Promise.all([getThemeChoice(), getT("site.themeToggle", locale)]);

  const groupLabel = t("groupLabel", "مظهر الموقع");

  return (
    <form action={setThemeChoice} className={cn("w-full", className)}>
      <div
        role="group"
        aria-label={groupLabel}
        className="flex w-full flex-col gap-0.5"
      >
        {/* عنوانٌ مرئيّ للعين وحدها: `role="group"` يحمل الاسم لقارئ الشاشة
            سلفاً، فإعلانه مرتين ضجيج. وبلا عنوانٍ تقرأ الصفوفُ الثلاثة كأنها
            مزيدٌ من روابط الحساب. */}
        <span
          aria-hidden="true"
          className="px-3 pt-1 pb-0.5 text-xs font-semibold text-muted-foreground"
        >
          {groupLabel}
        </span>

        {THEME_CHOICES.map((choice) => {
          const Icon = ICONS[choice];
          const label = t(choice, FALLBACK[choice]);
          const isActive = choice === current;

          return (
            <button
              key={choice}
              type="submit"
              name="theme"
              value={choice}
              aria-pressed={isActive}
              /* الاسم المقروء جملةٌ كاملة لأن «فاتح» وحدها لا تقول ماذا يحدث
                 عند الضغط — والنصّ المرئي يبقى الكلمة القصيرة */
              aria-label={t("switchTo", "عرض الموقع بمظهر {mode}", { mode: label })}
              className={cn(
                /* `py-3` ⇒ ١٢+١٢+٢٠ = **٤٤ حقيقية**، لا ٤٠ كما قِيست في
                   الدرج وفي لوح الحساب معاً. وهي صفوفٌ رأسية في حاويةٍ ذات
                   سعة، فالحشو الحقيقي أصحُّ من هالةٍ تتداخل مع جارتها. */
                "flex w-full cursor-pointer items-center gap-2 rounded-xl px-3 py-3 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60",
                isActive
                  ? "bg-muted text-foreground"
                  : "text-muted-foreground hover:bg-muted/60 hover:text-foreground"
              )}
            >
              <Icon className="size-4 shrink-0" aria-hidden="true" />
              <span className="flex-1 text-start">{label}</span>
              {isActive ? (
                <Check className="size-4 shrink-0 text-primary" aria-hidden="true" />
              ) : null}
            </button>
          );
        })}
      </div>
    </form>
  );
}

/**
 * ╔══════════════════════════════════════════════════════════════════════════╗
 * ║  م‑٩ب — نفس اللوح، داخل قرصٍ مطويّ: مدخلُ المظهر في اللوحة والبورتال      ║
 * ╚══════════════════════════════════════════════════════════════════════════╝
 *
 * ── لماذا قرصٌ مطويّ لا ثلاثة أزرارٍ في الشريط ───────────────────────────────
 *
 * قرار بدر 2026‑08‑18 في الموقع العام كان: «الفصل بالوظيفة — اللغةُ تبقى في
 * الشريط (قرارُ محتوى يُتّخذ في أول ثوانٍ)، والمظهرُ ينزوي (تفضيلٌ شخصيّ يُضبط
 * مرة)». والسبب المقيس أن المبدّل **ثلاثُ خانات لا زرّ**، فوضعُه عارياً في
 * الشريط أضاف ثلاثةَ أهداف إلى كتلةٍ فيها ستة سلفاً.
 *
 * وشريطُ اللوحة (`admin-shell`) وشريطُ البورتال (`portal-nav` وترويسته) لهما
 * الضيقُ نفسه: خمسةُ بنودٍ في البورتال، و٢٣ وجهةً في اللوحة موزّعةً على خمس
 * مجموعات. فالشكل الذي يوافق ذلك القرار **هدفٌ واحد يفتح لوحاً**، لا خانات.
 *
 * ⚠ **ولا `variant` ثانٍ للوح نفسه.** المفتوح هو `ThemeToggle` كما هو حرفاً —
 * صفوفٌ كاملةُ العرض بحشوٍ حقيقيّ ٤٤. وقد سقط الشريط المقسّم بقياسٍ حيّ عند
 * ٣٧٥ (التفصيل في ترويسة المكوّن أعلاه)، وإحياؤه هنا يعيد العيب نفسه.
 *
 * ── و`details` لا زرٌّ بحالة ────────────────────────────────────────────────
 *
 * نفس بدائيّة قائمة الحساب وقائمة الجوال ومبدّل اللغة: تفتح بالكيبورد وبقارئ
 * الشاشة **بلا سطر جافاسكربت**، فيبقى المبدّل عاملاً بلا JS من طرفيه — الفتحُ
 * والإرسال معاً. ولو كان زرّاً بحالة `useState` لصار الغلافُ عميلاً، وسقط
 * التعهّد الذي بُني عليه المبدّل كلّه.
 *
 * ⚠ **والهدف ٤٤×٤٤ بهالةٍ لا بحشو**: الشريط ضيّقٌ أفقياً وجاره على بُعد ٤ بكسل
 * (‏`TAP_TARGET_SQUARE` — القاعدة في `links.ts`: «هالةٌ حيث الضيق، وحشوٌ حيث
 * السعة»). والصفوفُ داخل اللوح تأخذ الحشو الحقيقي لأن السعة هناك رأسية.
 */
export async function ThemeToggleMenu({ className }: ThemeToggleProps) {
  const locale = await getActiveLocale();
  const [current, t] = await Promise.all([getThemeChoice(), getT("site.themeToggle", locale)]);

  const groupLabel = t("groupLabel", "مظهر الموقع");
  const currentLabel = t(current, FALLBACK[current]);
  const Icon = ICONS[current];

  return (
    <details className={cn("group relative", className)}>
      {/* الاسمُ المقروء يحمل **الحالة الحالية** لأن الأيقونة وحدها لا تُقرأ:
          «مظهر الموقع: داكن». ولا مفتاح رسائل جديداً — الاثنان قائمان. */}
      <summary
        aria-label={`${groupLabel}: ${currentLabel}`}
        className={cn(
          "flex size-9 cursor-pointer list-none items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60 [&::-webkit-details-marker]:hidden",
          TAP_TARGET_SQUARE
        )}
      >
        <Icon className="size-4 shrink-0" aria-hidden="true" />
        <ChevronDown
          className="size-3 shrink-0 transition-transform group-open:rotate-180"
          aria-hidden="true"
        />
      </summary>

      {/* `end-0` و`top-11` كقائمة الحساب حرفاً — و`end` منطقية فتنقلب وحدها
          في LTR بعد تفعيل الإنجليزية (اتفاقيات §١). */}
      <div className="absolute end-0 top-11 z-50 w-48 rounded-2xl border border-border bg-background p-2 shadow-xl">
        <ThemeToggle />
      </div>
    </details>
  );
}

export default ThemeToggle;
