import Link from "next/link";
import {
  ArrowLeft,
  BadgeCheck,
  Bot,
  Globe,
  Languages,
  ListChecks,
  Plus,
  RefreshCw,
  ShieldAlert,
  ToggleLeft,
} from "lucide-react";

import { toArabicDigits } from "@/components/booking/format";
import { HelpTip } from "@/components/shared/HelpTip";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { ROUTING_LOCALES } from "@/i18n/config";
import { isMissingFunction, isMissingTable } from "@/lib/dispatch/settings";
import type { LocaleProgress } from "@/lib/i18n-types";
import { DEFAULT_LOCALE } from "@/lib/i18n-types";
import { describeMtProvider } from "@/lib/i18n/mt";
import { createServerSupabase } from "@/lib/supabase/server";
import { cn } from "@/lib/utils";
import { controlClass } from "../orders/_components/booking-ui";
import {
  type AdminLocale,
  hasSupabaseEnv,
  KpiCard,
  LanguagesFeedback,
  LanguagesNotReady,
  numberText,
  ProgressBar,
  readLocales,
  readProgress,
} from "./_components/languages-ui";
import { addLocale, refreshCorpus, setLocaleAutoPublish, setLocaleEnabled } from "./actions";

/**
 * مدير اللغات — الشاشة الأم للمرحلة ٨.
 *
 * ثلاث طبقات: أي لغات عندنا وما حالها (الجدول)، وكم أُنجز من كل لغة
 * (`translation_progress`)، وكيف نضيف لغة جديدة (النموذج).
 *
 * **العربية ليست لغة في هذه القائمة بالمعنى العادي — هي الأصل.** لا تُترجَم
 * ولا تُعطَّل ولا تُحذف، ورابطها بلا بادئة (`/` لا `/ar/`) لأن تغيير روابط
 * الموقع العربي يهدم عمر صفحاته في نتائج البحث، وهو الأصل الوحيد الذي لا
 * يُشترى. اللغات الأخرى تعيش تحت بادئتها: ‎/en/…‎.
 *
 * **النشر التلقائي مطفأ افتراضياً وهذا قرار سيو لا تحفّظ تقني**: جوجل يعامل
 * الترجمة الآلية غير المراجَعة كمحتوى ضعيف، والعقوبة تصيب النطاق كله لا
 * الصفحة المترجمة وحدها. المسودة تُراجَع ثم تُنشر.
 */

export const metadata = { title: "اللغات" };

type Loaded = {
  locales: AdminLocale[];
  localesReady: boolean;
  progress: Map<string, LocaleProgress>;
  progressReady: boolean;
  /** أول ما تعذّرت قراءته بالاسم — يظهر في بطاقة «غير جاهزة» */
  missing: string | null;
};

const BLANK: Loaded = {
  locales: [],
  localesReady: false,
  progress: new Map(),
  progressReady: false,
  missing: "قاعدة البيانات",
};

async function loadScreen(): Promise<Loaded> {
  const supabase = await createServerSupabase();
  if (!supabase) return BLANK;

  const [localesResult, progressResult] = await Promise.all([
    readLocales(supabase),
    readProgress(supabase),
  ]);

  const missing =
    localesResult.error && isMissingTable(localesResult.error.code)
      ? "locales"
      : progressResult.error && isMissingFunction(progressResult.error.code)
        ? "translation_progress"
        : localesResult.error || progressResult.error
          ? "قراءة بيانات اللغات"
          : null;

  return {
    locales: localesResult.locales,
    localesReady: !localesResult.error,
    progress: progressResult.progress,
    progressReady: !progressResult.error,
    missing,
  };
}

/** جملة النجاح المناسبة للعملية التي رجعت من الإجراء */
function savedSentence(params: Record<string, string | string[] | undefined>): string | null {
  const one = (key: string): string | null =>
    typeof params[key] === "string" ? (params[key] as string) : null;

  const added = one("added");
  if (added) {
    return `أُضيفت اللغة «${added}» مخفية عن الزوار عمداً، وطابورها جاهز فوراً من محتوى الموقع. الخطوة التالية: ترجمة آلية ثم مراجعة ثم نشر، وبعدها إظهارها.`;
  }
  const enabled = one("enabled");
  if (enabled) return `فُعِّلت «${enabled}» — صارت تظهر في مبدّل اللغة وفي خريطة الموقع.`;

  const disabled = one("disabled");
  if (disabled)
    return `عُطِّلت «${disabled}» — اختفت من مبدّل اللغة، وترجماتها محفوظة كما هي بلا فقد.`;

  const auto = one("auto");
  if (auto)
    return `فُعِّل النشر التلقائي للغة «${auto}» — كل مسودة آلية جديدة ستصل الزائر بلا مراجعة. راقب جودتها.`;

  const manual = one("manual");
  if (manual) return `أُطفئ النشر التلقائي للغة «${manual}» — عاد النشر قراراً بشرياً.`;

  const refreshed = one("refreshed");
  if (refreshed !== null) {
    return `قُرئت قائمة العمل من المحتوى الحالي: ${toArabicDigits(refreshed)} نصاً عربياً قابلاً للترجمة، وأُعيد حساب التقدم وكشف الترجمات التي تغيّر أصلها.`;
  }
  return null;
}

export default async function LanguagesPage({ searchParams }: PageProps<"/admin/languages">) {
  const [params, loaded] = await Promise.all([searchParams, loadScreen()]);
  const { locales, localesReady, progress, progressReady, missing } = loaded;

  const wired = hasSupabaseEnv();
  const readOnly = !wired || !localesReady;
  const error = typeof params.error === "string" ? params.error : null;
  const saved = savedSentence(params);
  const provider = describeMtProvider();

  const foreign = locales.filter((locale) => !locale.isDefault);
  const enabledCount = foreign.filter((locale) => locale.enabled).length;
  const autoCount = foreign.filter((locale) => locale.autoPublish).length;
  const nextSort = foreign.length + 1;

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="flex items-center gap-2 font-heading text-lg font-bold">
          <Languages className="size-5 text-primary" />
          اللغات
        </h2>
        <HelpTip>
          العربية أصل الموقع وروابطها بلا بادئة. كل لغة أخرى تعيش تحت بادئتها (‎/en/…‎)
          وتُبنى على أربع خطوات: قائمة عمل ← ترجمة آلية (مسودات) ← مراجعة ← نشر. لا شيء
          يصل الزائر قبل الخطوة الرابعة.
        </HelpTip>

        <form action={refreshCorpus} className="ms-auto">
          <Button type="submit" size="sm" variant="outline" disabled={readOnly}>
            <RefreshCw />
            حدّث قائمة العمل
          </Button>
        </form>
        <HelpTip>
          قائمة العمل تُقرأ من المحتوى نفسه لحظياً (الصفحات والأقسام والخدمات وفئات
          السيارات والهوية) — لا تُخزَّن ولا تحتاج توليداً، فالقسم الجديد يظهر في طوابير
          اللغات فور حفظه. هذا الزر يقرؤها الآن ويقول لك كم فيها من نص، ويعيد حساب التقدم
          وكشف الترجمات التي تغيّر أصلها العربي بعد تعديلك للمحتوى.
        </HelpTip>
      </div>

      {(!wired || missing !== null) && (
        <LanguagesNotReady wired={wired} missing={missing ?? "جداول اللغات"} />
      )}

      <LanguagesFeedback
        saved={saved !== null}
        savedMessage={saved ?? ""}
        error={error}
      />

      {/* المؤشرات */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <KpiCard
          title="لغات مسجَّلة"
          value={numberText(locales.length)}
          sub="العربية أصلاً + لغات الترجمة"
          icon={Globe}
          help="كل صف في جدول اللغات، مفعَّلاً كان أو معطَّلاً. تسجيل لغة لا يعني ظهورها للزوار."
        />
        <KpiCard
          title="ظاهرة للزوار"
          value={numberText(enabledCount)}
          sub="لغات مفعَّلة في مبدّل اللغة"
          icon={BadgeCheck}
          help="اللغات المفعَّلة وحدها تظهر في مبدّل اللغة وفي خريطة الموقع وفي وسوم hreflang. عطّل أي لغة لم تكتمل مراجعتها."
        />
        <KpiCard
          title="مزوّد الترجمة الآلية"
          value={<span className="text-base sm:text-lg">{provider.label}</span>}
          sub={provider.keyless ? "يعمل بلا مفتاح مدفوع" : "يعمل بمفتاح من متغيرات البيئة"}
          icon={Bot}
          help={provider.note}
          /* مزوّد غير جاهز = زر «ترجم» لن يعمل؛ تنبيه لا خطر */
          variant={provider.ready ? "default" : "warning"}
        />
        <KpiCard
          title="نشر تلقائي مفعَّل"
          value={numberText(autoCount)}
          sub="لغات تنشر المسودة الآلية بلا مراجعة"
          icon={ShieldAlert}
          help="الوضع الصحي هنا صفر. النشر التلقائي مخصص للغات الذيل الطويل التي لا تجد من يراجعها، وثمنه مخاطرة سيو حقيقية."
          /* الوضع الصحي صفر — أي رقم فوقه ترجمة خام تصل للزوار (اعتبار ٨) */
          variant={autoCount > 0 ? "warning" : "default"}
        />
      </div>

      {/* جدول اللغات */}
      <Card className="space-y-4 p-5">
        <div className="flex flex-wrap items-center gap-2">
          <h3 className="flex items-center gap-1.5 font-heading text-base font-bold">
            <ToggleLeft className="size-4 text-primary" />
            اللغات المسجَّلة
            <HelpTip>
              التفعيل يخص الظهور للزوار فقط: تعطيل لغة لا يحذف حرفاً من ترجماتها، ويعيدها
              التفعيل كما كانت. أما العربية فبند ثابت لا يُعطَّل — الموقع كله مبني عليها.
            </HelpTip>
          </h3>
        </div>

        {!localesReady ? (
          <p className="text-sm text-muted-foreground">
            تعذّرت قراءة جدول <code dir="ltr">locales</code> — تأكد أنه منفَّذ في قاعدة
            البيانات (هجرة المرحلة ٨) وأن لحسابك صلاحية قراءته.
          </p>
        ) : locales.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            لا لغات مسجَّلة بعد — تُزرع العربية مع هجرة المرحلة ٨، وتُضاف الإنجليزية من
            النموذج أدناه.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[52rem] text-sm">
              <thead>
                <tr className="border-b border-border text-xs text-muted-foreground">
                  <th className="p-2 text-start font-medium">اللغة</th>
                  <th className="p-2 text-start font-medium">الكود</th>
                  <th className="p-2 text-start font-medium">الاتجاه</th>
                  <th className="p-2 text-start font-medium">الظهور للزوار</th>
                  <th className="p-2 text-start font-medium">النشر التلقائي</th>
                  <th className="p-2 text-start font-medium">المنشور</th>
                  <th className="p-2 text-start font-medium" />
                </tr>
              </thead>
              <tbody>
                {locales.map((locale) => {
                  const row = progress.get(locale.code) ?? null;
                  return (
                    <tr
                      key={locale.code}
                      className="border-b border-border align-middle last:border-0"
                    >
                      <td className="p-2">
                        <span className="font-medium">{locale.name}</span>
                        <span className="block text-xs text-muted-foreground" dir="ltr">
                          {locale.nativeName}
                        </span>
                      </td>
                      <td className="p-2" dir="ltr">
                        <code className="text-xs">{locale.code}</code>
                        {locale.isDefault && (
                          <Badge variant="secondary" className="ms-1.5 font-normal">
                            الأصل
                          </Badge>
                        )}
                      </td>
                      <td className="p-2 text-xs text-muted-foreground">
                        {locale.dir === "rtl" ? "يمين ← يسار" : "يسار ← يمين"}
                      </td>
                      <td className="p-2">
                        {locale.isDefault ? (
                          <span className="text-xs text-muted-foreground">دائمة</span>
                        ) : (
                          <form action={setLocaleEnabled} className="flex items-center gap-2">
                            <input type="hidden" name="code" value={locale.code} />
                            <input
                              type="hidden"
                              name="enabled"
                              value={locale.enabled ? "0" : "1"}
                            />
                            <Badge
                              variant="outline"
                              className={cn(
                                "font-normal",
                                locale.enabled
                                  ? "border-emerald-300 bg-emerald-100 text-emerald-900 dark:border-emerald-700 dark:bg-emerald-950 dark:text-emerald-100"
                                  : "border-border text-muted-foreground"
                              )}
                            >
                              {locale.enabled ? "ظاهرة" : "مخفية"}
                            </Badge>
                            <Button type="submit" size="xs" variant="outline" disabled={readOnly}>
                              {locale.enabled ? "إخفاء" : "إظهار"}
                            </Button>
                          </form>
                        )}
                      </td>
                      <td className="p-2">
                        {locale.isDefault ? (
                          <span className="text-xs text-muted-foreground">—</span>
                        ) : (
                          <form
                            action={setLocaleAutoPublish}
                            className="flex items-center gap-2"
                          >
                            <input type="hidden" name="code" value={locale.code} />
                            <input
                              type="hidden"
                              name="auto_publish"
                              value={locale.autoPublish ? "0" : "1"}
                            />
                            <Badge
                              variant="outline"
                              className={cn(
                                "font-normal",
                                locale.autoPublish
                                  ? "border-amber-300 bg-amber-100 text-amber-900 dark:border-amber-700 dark:bg-amber-950 dark:text-amber-100"
                                  : "border-border text-muted-foreground"
                              )}
                            >
                              {locale.autoPublish ? "تلقائي" : "بمراجعة"}
                            </Badge>
                            <Button type="submit" size="xs" variant="outline" disabled={readOnly}>
                              {locale.autoPublish ? "أوقفه" : "فعّله"}
                            </Button>
                            <HelpTip>
                              تفعيله يعني أن نصاً لم يقرأه بشر سيصل الزائر ومحرّكات البحث
                              مباشرة. جوجل يصنّف الترجمة الآلية غير المراجَعة محتوى ضعيفاً
                              وقد يخفض ترتيب النطاق كله — لا الصفحة وحدها. لا تفعّله إلا للغة
                              لن تجد من يراجعها أصلاً، والوجود بترجمة ركيكة عندك خير من
                              الغياب.
                            </HelpTip>
                          </form>
                        )}
                      </td>
                      <td className="p-2">
                        {locale.isDefault ? (
                          <span className="text-xs text-muted-foreground">النص الأصلي</span>
                        ) : row === null ? (
                          <span className="text-xs text-muted-foreground">—</span>
                        ) : (
                          <span className="flex items-center gap-2">
                            <span dir="ltr" className="text-xs font-medium">
                              {toArabicDigits(Math.round(row.percent))}٪
                            </span>
                            <span className="w-20">
                              <ProgressBar percent={row.percent} />
                            </span>
                          </span>
                        )}
                      </td>
                      <td className="p-2">
                        {locale.isDefault ? null : (
                          <Link
                            href={`/admin/languages/${locale.code}`}
                            className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
                          >
                            طابور المراجعة
                            <ArrowLeft className="size-3" />
                          </Link>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {/* تقدم كل لغة */}
      <section className="space-y-2">
        <h3 className="flex items-center gap-1.5 text-sm font-semibold">
          <ListChecks className="size-4 text-primary" />
          تقدم الترجمة
          <HelpTip>
            كل رقم هنا يصل محسوباً من دالة <code dir="ltr">translation_progress</code> في
            قاعدة البيانات — لا جمع ولا نسبة تُحسب في المتصفح. النسبة تقيس{" "}
            <span className="font-semibold">المنشور غير القديم</span> وحده: المسودة والمراجَعة
            لا يراهما الزائر، والمنشور الذي تغيّر أصله عملٌ باقٍ لا منجَز.
          </HelpTip>
        </h3>

        {!progressReady ? (
          <p className="text-sm text-muted-foreground">
            تعذّرت قراءة التقدم — تأكد أن دالة <code dir="ltr">translation_progress</code>{" "}
            منفَّذة في قاعدة البيانات (هجرة المرحلة ٨).
          </p>
        ) : foreign.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            لا لغة ترجمة بعد — أضف الإنجليزية من النموذج أدناه ليبدأ العدّ.
          </p>
        ) : (
          <div className="grid gap-3 md:grid-cols-2">
            {foreign.map((locale) => {
              const row = progress.get(locale.code) ?? null;
              return (
                <Card key={locale.code} className="gap-3 p-4">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-heading text-base font-bold">{locale.name}</span>
                    <code dir="ltr" className="text-xs text-muted-foreground">
                      /{locale.code}
                    </code>
                    <Badge
                      variant="outline"
                      className={cn(
                        "ms-auto font-normal",
                        locale.enabled
                          ? "border-emerald-300 text-emerald-900 dark:border-emerald-700 dark:text-emerald-100"
                          : "border-border text-muted-foreground"
                      )}
                    >
                      {locale.enabled ? "ظاهرة للزوار" : "مخفية"}
                    </Badge>
                  </div>

                  {row === null ? (
                    <p className="text-sm text-muted-foreground">
                      لا صفوف لهذه اللغة بعد — اضغط «حدّث قائمة العمل» أعلى الصفحة ليُبنى
                      طابورها من محتوى الموقع الحالي.
                    </p>
                  ) : (
                    <>
                      <div className="space-y-1.5">
                        <div className="flex items-center justify-between text-xs">
                          <span className="text-muted-foreground">نسبة المنشور</span>
                          <span dir="ltr" className="font-medium">
                            {toArabicDigits(Math.round(row.percent))}٪
                          </span>
                        </div>
                        <ProgressBar percent={row.percent} />
                      </div>

                      <dl className="grid grid-cols-3 gap-2 text-xs">
                        {[
                          { label: "إجمالي المفاتيح", value: row.total, tone: "" },
                          {
                            label: "منشورة",
                            value: row.published,
                            tone: "text-emerald-700 dark:text-emerald-300",
                          },
                          {
                            label: "مراجَعة تنتظر النشر",
                            value: row.reviewed,
                            tone: "text-sky-700 dark:text-sky-300",
                          },
                          {
                            label: "مسودات",
                            value: row.draft,
                            tone: "text-amber-700 dark:text-amber-300",
                          },
                          { label: "ناقصة", value: row.missing, tone: "text-muted-foreground" },
                          {
                            label: "الأصل تغيّر",
                            value: row.stale,
                            tone: "text-red-700 dark:text-red-300",
                          },
                        ].map((cell) => (
                          <div key={cell.label} className="rounded-lg bg-muted/50 p-2">
                            <dt className="text-[11px] leading-tight text-muted-foreground">
                              {cell.label}
                            </dt>
                            <dd dir="ltr" className={cn("text-base font-bold", cell.tone)}>
                              {numberText(cell.value)}
                            </dd>
                          </div>
                        ))}
                      </dl>

                      <div className="flex flex-wrap items-center gap-3">
                        <Link
                          href={`/admin/languages/${locale.code}`}
                          className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
                        >
                          افتح طابور المراجعة
                          <ArrowLeft className="size-3" />
                        </Link>
                        {row.stale > 0 && (
                          <span className="text-xs text-red-700 dark:text-red-300">
                            {numberText(row.stale)} ترجمة منشورة لم تعد تطابق أصلها العربي —
                            راجعها أولاً.
                          </span>
                        )}
                      </div>
                    </>
                  )}
                </Card>
              );
            })}
          </div>
        )}
      </section>

      {/* إضافة لغة */}
      <form action={readOnly ? undefined : addLocale}>
        <Card className="space-y-4 p-5">
          <div>
            <h3 className="flex items-center gap-1.5 font-heading text-base font-bold">
              <Plus className="size-4 text-primary" />
              إضافة لغة
              <HelpTip>
                اللغة الجديدة تُسجَّل <span className="font-semibold">مخفية</span> عمداً،
                وتُبنى قائمة عملها فوراً. رتّبها هكذا: ترجمة آلية ← مراجعة ← نشر ← إظهار
                للزوار. إظهار لغة نصفها عربي يضر السيو أكثر مما ينفع.
              </HelpTip>
            </h3>
            <p className="text-sm text-muted-foreground">
              الترجمة والمراجعة والنشر كلها من هنا بلا كود. الاستثناء الوحيد أن{" "}
              <span className="font-medium text-foreground">
                رمز اللغة يجب أن يكون مسجَّلاً في متغير البيئة{" "}
                <code dir="ltr">NEXT_PUBLIC_SITE_LOCALES</code> قبل أن يعمل رابطها
              </span>{" "}
              — وإلا أُضيفت اللغة وتُرجمت ونُشرت ثم أعطى رابطها ٤٠٤.
            </p>
            <p className="mt-2 text-sm text-muted-foreground">
              الرموز التي يعرف الموقع توجيهها الآن:{" "}
              {ROUTING_LOCALES.map((code, index) => (
                <span key={code}>
                  {index > 0 ? "، " : ""}
                  <code dir="ltr">{code}</code>
                </span>
              ))}
              . أي رمز خارج هذه القائمة يحتاج إضافته إلى المتغير محلياً وفي
              Environment Variables على Vercel ثم إعادة نشر. الخطوات بالتفصيل:{" "}
              <code dir="ltr">docs/LANGUAGES.md</code> القسم ٥-١.
            </p>
          </div>

          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <div className="space-y-1.5">
              <Label htmlFor="locale-code" className="flex items-center gap-1.5">
                كود اللغة
                <HelpTip>
                  رمز ISO-639-1 بحرفين: <code dir="ltr">en</code> للإنجليزية،{" "}
                  <code dir="ltr">fr</code> للفرنسية، <code dir="ltr">de</code> للألمانية،
                  ولهجة اختيارية بحرفين بعد شرطة (<code dir="ltr">pt-br</code>). هو ما يظهر في
                  الرابط (‎/en/services/…‎) وفي وسم hreflang، ولا يُغيَّر بعد النشر.
                </HelpTip>
              </Label>
              <Input
                id="locale-code"
                name="code"
                dir="ltr"
                required
                maxLength={12}
                placeholder="en"
                disabled={readOnly}
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="locale-name" className="flex items-center gap-1.5">
                الاسم بالعربية
                <HelpTip>اسم اللغة كما تراه أنت في هذه اللوحة: «الإنجليزية»، «الفرنسية».</HelpTip>
              </Label>
              <Input
                id="locale-name"
                name="name"
                required
                maxLength={60}
                placeholder="الإنجليزية"
                disabled={readOnly}
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="locale-native" className="flex items-center gap-1.5">
                الاسم الأصلي
                <HelpTip>
                  كما يكتبها أهلها: <span dir="ltr">English</span>، <span dir="ltr">Français</span>.
                  هذا ما يراه الزائر في مبدّل اللغة — ولا يُكتب مترجَماً إلى العربية أبداً.
                </HelpTip>
              </Label>
              <Input
                id="locale-native"
                name="native_name"
                dir="ltr"
                required
                maxLength={60}
                placeholder="English"
                disabled={readOnly}
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="locale-dir" className="flex items-center gap-1.5">
                اتجاه الكتابة
                <HelpTip>
                  العربية والعبرية والفارسية والأردية من اليمين لليسار، وأغلب اللغات
                  الأوروبية من اليسار لليمين. الاتجاه يقلب تخطيط الصفحة كله لزائر تلك اللغة.
                </HelpTip>
              </Label>
              <select
                id="locale-dir"
                name="dir"
                defaultValue="ltr"
                disabled={readOnly}
                className={controlClass}
              >
                <option value="ltr">من اليسار لليمين (LTR)</option>
                <option value="rtl">من اليمين لليسار (RTL)</option>
              </select>
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <div className="space-y-1.5">
              <Label htmlFor="locale-sort" className="flex items-center gap-1.5">
                الترتيب في المبدّل
                <HelpTip>
                  الأصغر يظهر أولاً في مبدّل اللغة. العربية أولاً دائماً بحكم كونها الأصل.
                </HelpTip>
              </Label>
              <Input
                id="locale-sort"
                name="sort"
                type="number"
                inputMode="numeric"
                dir="ltr"
                min={1}
                max={999}
                defaultValue={nextSort}
                disabled={readOnly}
              />
            </div>
          </div>

          <Card className="gap-2 bg-muted/40 p-4 text-sm leading-relaxed ring-0">
            <p className="font-medium">لماذا لا يُنشر شيء تلقائياً؟</p>
            <p className="text-muted-foreground">
              الترجمة الآلية تكفي لتوصيل المعنى، ولا تكفي لتمثيل شركة أمام سائح يقارن بينك
              وبين غيرك. وجوجل يصنّف الترجمة الآلية غير المراجَعة محتوًى ضعيفاً، وعقوبته
              تصيب النطاق كله — أي تصيب موقعك العربي الذي بنيت عمره بالسنوات.
            </p>
            <p className="text-muted-foreground">
              لذلك المسار: مسودة آلية ← عين بشرية تصلح ما ركّ ← نشر. مراجعة عشرين مفتاحاً في
              اليوم تنهي لغة كاملة في أسبوعين، وتصنع فرقاً يقرؤه الزائر في أول سطر.
            </p>
            <p className="text-muted-foreground">
              الجنيه المصري يبقى عملة التنفيذ في كل اللغات — ما يُترجَم هو الكلام لا السعر.
              العملة تُنسَّق بصيغة لغة الزائر فقط.
            </p>
          </Card>

          <Separator />
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="text-xs text-muted-foreground">
              العربية (<code dir="ltr">{DEFAULT_LOCALE}</code>) هي الأصل: لا تُضاف ولا
              تُعطَّل، وروابطها تبقى بلا بادئة إلى الأبد.
            </span>
            <Button type="submit" disabled={readOnly}>
              <Plus />
              أضف اللغة
            </Button>
          </div>
        </Card>
      </form>

      <p className="text-xs leading-relaxed text-muted-foreground">
        الدليل الكامل خطوة بخطوة: <code dir="ltr">docs/LANGUAGES.md</code> — كيف يعمل الخط،
        وكيف تبدّل مزوّد الترجمة، وكيف تتحقق من وسوم hreflang بعد النشر.
      </p>
    </div>
  );
}
