import { Monitor, Moon, Sun } from "lucide-react";
import { cn } from "@/lib/utils";
import { getActiveLocale } from "@/i18n/server";
import { getT } from "@/lib/i18n/content";
import { getThemeChoice, THEME_CHOICES, type ThemeChoice } from "@/lib/theme";
import { setThemeChoice } from "@/app/(site)/theme-actions";

/**
 * مبدّل الثيم — مكوّن خادمي بلا أي JavaScript على العميل، كمبدّل اللغة تماماً.
 *
 * ── ثلاثة أزرار لا زرّان، ولا زرٌّ يدور ───────────────────────────────────────
 *
 * الحالات ثلاث حقيقةً (`lib/theme.ts`)، فتُعرض ثلاثاً:
 *
 * • **زرّان فقط** يعني أن «اتبع نظامي» تُفقد بأول ضغطة ولا تعود. ومن فتح الموقع
 *   من هاتفٍ يقلب ثيمه بالغروب يفقد ذلك للأبد لأنه جرّب المبدّل مرةً.
 * • **زرٌّ يدور** على ثلاث حالات يخفي الحالة الحالية عن العين حتى تُقرأ
 *   الأيقونة، ولا يعطي وصولاً مباشراً للثالثة — ضغطتان لبلوغ حالة.
 *
 * والشكل مجموعةُ خيارات (`radiogroup` دلالياً عبر `aria-pressed`)، فيقرؤها قارئ
 * الشاشة «مضغوط/غير مضغوط» ويعرف أيّها النشط بلا لون.
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
  /** "menu" للترويسة (مضغوط)، "inline" لدرج الجوال والتذييل */
  variant?: "menu" | "inline";
};

export async function ThemeToggle({ className, variant = "menu" }: ThemeToggleProps) {
  const locale = await getActiveLocale();
  const [current, t] = await Promise.all([getThemeChoice(), getT("site.themeToggle", locale)]);

  const groupLabel = t("groupLabel", "مظهر الموقع");
  const inline = variant === "inline";

  return (
    <form action={setThemeChoice} className={cn("shrink-0", className)}>
      <div
        role="group"
        aria-label={groupLabel}
        className={cn(
          "inline-flex items-center gap-0.5 rounded-xl border border-border p-0.5",
          inline && "w-full justify-between"
        )}
      >
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
              /* الاسم المقروء كاملٌ في `title`/`aria-label` لأن الأيقونة وحدها
                 لا تقول «حسب النظام» لأحد — لا لقارئ شاشةٍ ولا لعينٍ مترددة */
              aria-label={t("switchTo", "عرض الموقع بمظهر {mode}", { mode: label })}
              title={label}
              className={cn(
                "inline-flex cursor-pointer items-center justify-center gap-1.5 rounded-lg px-2.5 py-1.5 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60",
                inline && "flex-1",
                isActive
                  ? "bg-muted text-foreground"
                  : "text-muted-foreground hover:bg-muted/60 hover:text-foreground"
              )}
            >
              <Icon className="size-4 shrink-0" aria-hidden="true" />
              {inline ? <span>{label}</span> : null}
            </button>
          );
        })}
      </div>
    </form>
  );
}

export default ThemeToggle;
