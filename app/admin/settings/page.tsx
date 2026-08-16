import Link from "next/link";
import { AlertTriangle, CheckCircle2, Sparkles, XCircle } from "lucide-react";
import { toArabicDigits } from "@/components/booking/format";
import { getSettings } from "@/lib/settings";
import type { BrandPalette } from "@/lib/site-config";
import { saveSettings } from "./actions";
import { TripSettingsSection } from "./_components/trip-settings-section";
import { HelpTip } from "@/components/shared/HelpTip";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";

export const metadata = { title: "الإعدادات" };

const hasSupabaseEnv = () =>
  Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);

function Field({
  label,
  name,
  defaultValue,
  placeholder,
  help,
  dir = "rtl",
  disabled,
  required,
}: {
  label: string;
  name: string;
  defaultValue?: string | null;
  placeholder?: string;
  help?: string;
  dir?: "rtl" | "ltr";
  disabled?: boolean;
  required?: boolean;
}) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={name} className="flex items-center gap-1.5">
        {label}
        {help ? <HelpTip>{help}</HelpTip> : null}
      </Label>
      <Input
        id={name}
        name={name}
        dir={dir}
        defaultValue={defaultValue ?? ""}
        placeholder={placeholder}
        disabled={disabled}
        required={required}
      />
    </div>
  );
}

function ColorField({
  label,
  name,
  defaultValue,
  disabled,
}: {
  label: string;
  name: string;
  defaultValue: string;
  disabled?: boolean;
}) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={name} className="flex items-center gap-1.5">
        {label}
        <span
          aria-hidden
          className="inline-block size-3.5 rounded-full border border-border"
          style={{ backgroundColor: defaultValue }}
        />
        <HelpTip>
          قيمة لون CSS — hex مثل ‎#D89A3E أو oklch مثل oklch(0.45 0.15 250) أو أي دالّة ألوان.
          والحقل المتروك فارغاً يعود إلى قيمة التصميم الأصلية، فهو طريقة التراجع عن تجربة لون.
          تظهر المعاينة بجوار الاسم بعد الحفظ.
        </HelpTip>
      </Label>
      <Input id={name} name={name} dir="ltr" defaultValue={defaultValue} disabled={disabled} />
    </div>
  );
}

/**
 * حقول اللوحة السبعة عشر — **وهذه القائمة تسميات لا مفاتيح**.
 *
 * المفاتيح مصدرها `PALETTE_CSS_VARS` في `lib/site-config.ts`: منها يبني
 * `app/layout.tsx` السمة السطرية، ومنها يبني `saveSettings` صفَّ العلامة. وما
 * يخصّ هذه الشاشة وحدها هو **ما يُكتب للمالك بالعربية** — فيعيش هنا ولا يُصدَّر،
 * لأن الإجراء لا يحتاج تسميةً واحدة منه ولا يستوردها.
 *
 * ⚠ **والتسمية بالدور لا باللون** — «الأرضية الداكنة الأساسية» لا «الأخضر
 * الفحمي». فهذه الشاشة هي واجهة نسخة الـwhite-label أيضاً، ونسخةٌ أخرى تُصبغ
 * بأزرق وبيضاء تجعل كل اسم لونٍ مكتوبٍ هنا كذباً على المالك، بينما يبقى الدور
 * صادقاً مهما بُدِّلت اللوحة.
 *
 * والتجميع لأجل العين لا لأجل البيانات: سبعة عشر حقلاً في شبكة واحدة كتلةٌ لا
 * تُقرأ، وأربع رتب من الأرضية الداكنة متجاورةً تُفهم ترتيباً من الأعمق إلى ما
 * فوقها.
 */
const COLOR_GROUPS: ReadonlyArray<{
  title: string;
  hint: string;
  fields: ReadonlyArray<readonly [keyof BrandPalette, string]>;
}> = [
  {
    title: "الإشارتان",
    hint: "لون الفعل (الأزرار والأسعار وحلقة التركيز) ولون المعلومة (الشارات والأيقونات) ودرجاتهما.",
    fields: [
      ["primary", "لون الفعل الأساسي"],
      ["primaryForeground", "النص فوق لون الفعل"],
      ["primaryHi", "درجة الفعل الأفتح (تمرير وتركيز)"],
      ["accent", "لون المعلومة"],
      ["accentSoft", "أرضية شارة المعلومة على الداكن"],
    ],
  },
  {
    title: "الأرضيات الداكنة",
    hint: "أربع رتب بالترتيب من أعمق خلفية إلى البطاقة التي تعلوها، ثم الحدّ الفاصل بينها.",
    fields: [
      ["ink", "الأرضية الداكنة الأساسية"],
      ["ink1", "الأرضية الداكنة — الرتبة الثانية"],
      ["ink2", "أرضية البطاقات على الداكن"],
      ["inkLine", "الحدود على الأرضية الداكنة"],
    ],
  },
  {
    title: "الأرضيات الفاتحة",
    hint: "خلفية الأقسام الفاتحة، والبطاقات التي تعلوها، والحدّ الفاصل بينها.",
    fields: [
      ["sand", "الأرضية الفاتحة الأساسية"],
      ["sand2", "أرضية البطاقات على الفاتح"],
      ["sandLine", "الحدود على الأرضية الفاتحة"],
    ],
  },
  {
    title: "النصوص",
    hint: "رتبتان — أساسي وثانوي — فوق كل أرضية. هنا تُحسم قابلية القراءة: نصٌّ يقارب درجةَ أرضيته يختفي على الشاشات الساطعة قبل أن يختفي على شاشتك.",
    fields: [
      ["onInk", "نص أساسي على الداكن"],
      ["onInkMut", "نص ثانوي على الداكن"],
      ["onSand", "نص أساسي على الفاتح"],
      ["onSandMut", "نص ثانوي على الفاتح"],
    ],
  },
  {
    title: "الخطر",
    hint: "رسائل الخطأ والإلغاء — وليس خياراً هوياتياً: ضبطه على لون العلامة يجعل التحذير يبدو كبقية الموقع، فلا يُقرأ تحذيراً.",
    fields: [["danger", "لون الخطر والإلغاء"]],
  },
];

/**
 * رسالة النجاح بحسب النموذج المحفوظ — إعدادات الموقع لها زرها، وإعدادات الرحلات
 * لها إجراؤها المستقل. رسالة واحدة عامة كانت ستقول «حُفظ» لنموذج لم يُمَس.
 */
const SAVED_MESSAGES: Record<string, string> = {
  "1": "حُفظت الإعدادات وانعكست على الموقع فوراً — افتح الموقع العام للتأكد.",
  trip: "حُفظت إعدادات الرحلات — المهلة الجديدة سارية من الكنس التالي (المجدول أو اليدوي).",
};

/** عدّاد وصل في الرابط: أرقام فقط، وما عداها شرطة لا نص خام */
const counterText = (value: string | string[] | undefined): string =>
  typeof value === "string" && /^\d{1,9}$/.test(value) ? toArabicDigits(value) : "—";

export default async function SettingsPage({ searchParams }: PageProps<"/admin/settings">) {
  const [settings, params] = await Promise.all([getSettings(), searchParams]);
  const wired = hasSupabaseEnv();
  const savedCode = typeof params.saved === "string" ? params.saved : null;
  const saved = savedCode !== null && SAVED_MESSAGES[savedCode] !== undefined;
  const swept = params.swept === "1";
  const error = typeof params.error === "string" ? params.error : null;

  const errorMessages: Record<string, string> = {
    env: "قاعدة البيانات غير مربوطة — لا يمكن الحفظ بعد.",
    name: "اسم العلامة التجارية حقل إلزامي.",
    save: "فشل الحفظ — تأكد أنك مسجل الدخول بحساب دوره admin (راجع supabase/README.md، فخ الصفوف الصفرية).",
    // ── إعدادات الرحلات (هجرة 0027): رمز مستقل لكل سبب، فلا تُتَّهم الصلاحيات في خطأ إدخال
    timeout:
      "المهلة يجب أن تكون عدداً صحيحاً من الدقائق بين ١٥ و٤٣٢٠٠ (ثلاثين يوماً) — وهو نفس المدى المفروض في قاعدة البيانات.",
    lead:
      "أدنى مهلة قبل الانطلاق يجب أن تكون عدداً صحيحاً من الدقائق بين ٠ (مطفأة) و١٠٠٨٠ (سبعة أيام) — وهو نفس المدى المفروض في قاعدة البيانات.",
    tripnotready:
      "إعدادات الرحلات غير جاهزة على هذه القاعدة — نفِّذ هجرة 0027 من supabase/migrations ثم أعد المحاولة.",
    tripsave:
      "فشل حفظ إعدادات الرحلات — تأكد أنك مسجل الدخول بحساب دوره admin (راجع supabase/README.md، فخ الصفوف الصفرية).",
    forbidden:
      "لا تملك صلاحية تشغيل الكنس — يتطلب حساباً دوره admin. سجّل الدخول بحساب مشرف ثم أعد المحاولة.",
    sweep:
      "تعذّر تشغيل الكنس — رفضته قاعدة البيانات أو انقطع الاتصال. لم يُلغَ أي حجز، وأعد المحاولة أو راجع سجل الخادم.",
  };

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      {!wired && (
        <Card className="flex items-start gap-3 border-amber-300 bg-amber-50 p-4 text-amber-900 dark:border-amber-700 dark:bg-amber-950 dark:text-amber-100">
          <AlertTriangle className="mt-0.5 size-5 shrink-0" />
          <div className="text-sm leading-relaxed">
            <p className="font-semibold">قاعدة البيانات غير مربوطة بعد</p>
            <p>
              الحقول ظاهرة للمعاينة بقيمها الافتراضية، والحفظ معطّل حتى تُنفَّذ خطوات{" "}
              <code dir="ltr">supabase/README.md</code> ويُعاد تشغيل الخادم.
            </p>
          </div>
        </Card>
      )}

      {saved && (
        <Card className="flex items-center gap-3 border-emerald-300 bg-emerald-50 p-4 text-emerald-900 dark:border-emerald-700 dark:bg-emerald-950 dark:text-emerald-100">
          <CheckCircle2 className="size-5 shrink-0" />
          <p className="text-sm font-medium">{SAVED_MESSAGES[savedCode ?? "1"]}</p>
        </Card>
      )}

      {swept && (
        <Card className="flex items-start gap-3 border-sky-300 bg-sky-50 p-4 text-sky-900 dark:border-sky-700 dark:bg-sky-950 dark:text-sky-100">
          <Sparkles className="mt-0.5 size-5 shrink-0" />
          <div className="text-sm leading-relaxed">
            <p className="font-medium">
              نُفِّذ كنس الطلبات غير المدفوعة — فُحص {counterText(params.scanned)} · أُلغي{" "}
              {counterText(params.cancelled)} · تعذّر {counterText(params.failed)}.
            </p>
            <p>
              الأصفار نتيجة سليمة: المفتاح مطفأ، أو لا حجز تجاوز مهلته، أو كنسٌ آخر يعمل في
              هذه اللحظة. وكل إلغاء وقع مسجَّل في سجل الحجز نفسه.
            </p>
            {typeof params.failed === "string" && /^\d{1,9}$/.test(params.failed) && Number(params.failed) > 0 && (
              <p className="font-medium">
                ورقم «تعذّر» فوق الصفر يعني حجوزاً رفضت قاعدةُ البيانات إلغاءها — سببها في
                سجل الخادم، وبقية الحجوزات أُلغيت كالمعتاد.
              </p>
            )}
          </div>
        </Card>
      )}

      {error && (
        <Card className="flex items-center gap-3 border-red-300 bg-red-50 p-4 text-red-900 dark:border-red-700 dark:bg-red-950 dark:text-red-100">
          <XCircle className="size-5 shrink-0" />
          <p className="text-sm font-medium">{errorMessages[error] ?? "حدث خطأ غير متوقع."}</p>
        </Card>
      )}

      <form action={saveSettings} className="space-y-6">
        <Card className="space-y-4 p-5">
          <div>
            <h2 className="flex items-center gap-1.5 font-heading text-base font-bold">
              الهوية والعلامة التجارية
              <HelpTip>
                هذه القيم تُطبَّق على الموقع كله فوراً بعد الحفظ (الاسم في الترويسة والتذييل
                والعناوين، والألوان على الأزرار والخلفيات) — هذا هو أساس نظام الـ Whitelabel.
              </HelpTip>
            </h2>
            <p className="text-sm text-muted-foreground">اسم العلامة وألوانها وشعارها.</p>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field
              label="اسم العلامة التجارية"
              name="brand.name"
              defaultValue={settings.brand.name}
              disabled={!wired}
              required
            />
            <Field
              label="الشعار النصي (Tagline)"
              name="brand.tagline"
              defaultValue={settings.brand.tagline}
              disabled={!wired}
            />
          </div>
          <Field
            label="رابط اللوجو"
            name="brand.logoUrl"
            defaultValue={settings.brand.logoUrl}
            placeholder="/brand/logo.svg أو https://..."
            help="اتركه فارغاً لعرض حرف العلامة بتصميم أنيق بدل الصورة."
            dir="ltr"
            disabled={!wired}
          />
          <Separator />

          <div>
            <h3 className="flex items-center gap-1.5 font-heading text-sm font-bold">
              لوحة الألوان
              <HelpTip>
                اللوحة كلها تُحقن متغيّراتِ CSS على جذر الصفحة، فتتبعها كل شاشة في الموقع وفي
                هذه اللوحة معاً بلا استثناء. وتغييرُ رتبةٍ واحدة يظهر في كل موضع تستعملها فيه
                — لذلك جرّب على الموقع العام بعد الحفظ قبل أن تعتمد لوحةً كاملة.
              </HelpTip>
            </h3>
            <p className="text-sm text-muted-foreground">
              سبعة عشر لوناً هي هوية الموقع البصرية كاملةً — لا لونَ محفورٌ في الكود خارجها.
            </p>
          </div>

          {COLOR_GROUPS.map((group) => (
            <div key={group.title} className="space-y-3">
              <div>
                <p className="text-sm font-medium">{group.title}</p>
                <p className="text-xs leading-relaxed text-muted-foreground">{group.hint}</p>
              </div>
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {group.fields.map(([key, label]) => (
                  <ColorField
                    key={key}
                    label={label}
                    name={`brand.colors.${key}`}
                    defaultValue={settings.brand.colors[key]}
                    disabled={!wired}
                  />
                ))}
              </div>
            </div>
          ))}
        </Card>

        <Card className="space-y-4 p-5">
          <div>
            <h2 className="flex items-center gap-1.5 font-heading text-base font-bold">
              قنوات التواصل
              <HelpTip>
                أي حقل يُترك فارغاً يختفي من الموقع تلقائياً — لا تظهر أيقونات بلا روابط. رقم
                الواتساب بصيغة دولية بدون + (مثال: 2010XXXXXXXX) لأنه يُستخدم في رابط wa.me.
              </HelpTip>
            </h2>
            <p className="text-sm text-muted-foreground">تظهر في قسم التواصل وزر الحجز العائم.</p>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="رقم الهاتف" name="contact.phone" defaultValue={settings.contact.phone} dir="ltr" disabled={!wired} />
            <Field label="واتساب" name="contact.whatsapp" defaultValue={settings.contact.whatsapp} dir="ltr" disabled={!wired} />
            <Field label="تليجرام" name="contact.telegram" defaultValue={settings.contact.telegram} placeholder="username بدون @" dir="ltr" disabled={!wired} />
            <Field label="البريد الإلكتروني" name="contact.email" defaultValue={settings.contact.email} dir="ltr" disabled={!wired} />
          </div>
        </Card>

        <Card className="space-y-4 p-5">
          <div>
            <h2 className="font-heading text-base font-bold">حسابات التواصل الاجتماعي</h2>
            {/*
              كان النص «روابط كاملة» — وصفٌ لا يفرض شيئاً، والقاعدة الحية أثبتت
              أنه لم يُتَّبع: الحقول الخمسة كلها اسم حساب مجرّد. فصار الاسم
              المجرّد مقبولاً ويُبنى عنوانه، والنص يقول ما يحدث فعلاً.
            */}
            <p className="text-sm text-muted-foreground">
              اكتب اسم الحساب وحده أو الصق العنوان الكامل — الاسم يتحوّل إلى عنوانه تلقائياً.
              والفارغ لا يظهر في الموقع.
            </p>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="فيسبوك" name="socials.facebook" defaultValue={settings.socials.facebook} placeholder="اسم الحساب أو facebook.com/…" dir="ltr" disabled={!wired} />
            <Field label="إكس (تويتر)" name="socials.x" defaultValue={settings.socials.x} placeholder="اسم الحساب بلا @" dir="ltr" disabled={!wired} />
            {/* لينكد إن وحدها: المجرّد يُحمل على صفحة شركة — والحساب الشخصي يلزمه العنوان الكامل */}
            <Field label="لينكد إن" name="socials.linkedin" defaultValue={settings.socials.linkedin} placeholder="اسم صفحة الشركة، أو العنوان الكامل للحساب الشخصي" dir="ltr" disabled={!wired} />
            <Field label="إنستجرام" name="socials.instagram" defaultValue={settings.socials.instagram} placeholder="اسم الحساب بلا @" dir="ltr" disabled={!wired} />
            <Field label="GitHub" name="socials.github" defaultValue={settings.socials.github} placeholder="اسم الحساب أو المنظمة" dir="ltr" disabled={!wired} />
          </div>
        </Card>

        <Card className="space-y-4 p-5">
          <div>
            <h2 className="font-heading text-base font-bold">معلومات الشركة</h2>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="الاسم القانوني" name="company.legalName" defaultValue={settings.company.legalName} disabled={!wired} />
            <Field label="نشاط الشركة" name="company.activity" defaultValue={settings.company.activity} disabled={!wired} />
          </div>
        </Card>

        <Card id="notifications" className="space-y-4 p-5">
          <div>
            <h2 className="flex items-center gap-1.5 font-heading text-base font-bold">
              الإشعارات
              <HelpTip>
                هنا تُحدَّد <span className="font-medium">وجهة</span> التنبيهات فقط. المفاتيح
                السرّية (توكن بوت تليجرام ومفتاح مزوّد البريد) مكانها ملف ‎.env.local ولا تُخزَّن
                في قاعدة البيانات أبداً. الشرح خطوة بخطوة في docs/NOTIFICATIONS.md.
              </HelpTip>
            </h2>
            <p className="text-sm text-muted-foreground">
              إلى أين يصل تنبيه كل حجز جديد وإيصال تحويل وطلب عرض سعر. جرس اللوحة يعمل دائماً بلا
              أي إعداد — هذه القنوات إضافية فوقه.
            </p>
          </div>

          <Label className="flex cursor-pointer items-center justify-between gap-3 rounded-lg border border-input p-3 text-sm font-normal">
            <span className="leading-relaxed">
              <span className="font-medium">تنبيهات تليجرام</span>
              <span className="block text-muted-foreground">
                أسرع قناة للتشغيل: التنبيه يصل مجموعة العمل خلال ثوانٍ من الحجز.
              </span>
            </span>
            <input
              type="checkbox"
              name="notifications.telegramEnabled"
              defaultChecked={settings.notifications.telegramEnabled}
              disabled={!wired}
              className="size-5 shrink-0 accent-primary"
            />
          </Label>
          <Field
            label="معرّف محادثة تليجرام (chat id)"
            name="notifications.telegramChatId"
            defaultValue={settings.notifications.telegramChatId}
            placeholder="123456789 — أو ‎-1001234567890 للمجموعات"
            help="رقم المحادثة أو المجموعة التي يرسل إليها البوت. طريقة استخراجه بالتفصيل في docs/NOTIFICATIONS.md. لا يُرسل شيء قبل ضبط TELEGRAM_BOT_TOKEN في البيئة."
            dir="ltr"
            disabled={!wired}
          />

          <Label className="flex cursor-pointer items-center justify-between gap-3 rounded-lg border border-input p-3 text-sm font-normal">
            <span className="leading-relaxed">
              <span className="font-medium">تنبيهات البريد الإلكتروني</span>
              <span className="block text-muted-foreground">
                نسخة مكتوبة تبقى في الأرشيف — مفيدة للمراجعة والمحاسبة لاحقاً.
              </span>
            </span>
            <input
              type="checkbox"
              name="notifications.emailEnabled"
              defaultChecked={settings.notifications.emailEnabled}
              disabled={!wired}
              className="size-5 shrink-0 accent-primary"
            />
          </Label>
          <Field
            label="بريد استقبال التنبيهات"
            name="notifications.emailTo"
            defaultValue={settings.notifications.emailTo}
            placeholder="ops@example.com"
            help="يمكن وضع أكثر من بريد مفصولة بفاصلة. يحتاج RESEND_API_KEY في البيئة حتى يعمل الإرسال."
            dir="ltr"
            disabled={!wired}
          />

          <Card className="gap-2 bg-muted/40 p-4 text-sm leading-relaxed ring-0">
            <p className="font-medium">كيف تتأكد أن التنبيهات تعمل؟</p>
            <p className="text-muted-foreground">
              افتح{" "}
              <Link href="/admin/notifications" className="text-primary hover:underline">
                مركز الإشعارات
              </Link>{" "}
              — يعرض حالة كل قناة وما ينقصها بالضبط، وسجل كل إشعار: ما وصل وما تجاوزه النظام
              لغياب بيانات الاعتماد وما فشل، مع زر لإعادة المحاولة وآخر لتشغيل الإرسال فوراً.
            </p>
          </Card>
        </Card>

        {/*
          ⚠ **بطاقة «السيو الافتراضي» حُذفت من هنا بقرار، لا سهواً.**

          كانت تحرّر `seo.titleTemplate` و`seo.defaultDescription` — وهما حقلان من
          ستة في مفتاح `seo`. ولأن `site_settings.value` عمود `jsonb` **يُستبدل
          كاملاً لا يُدمج**، فحفظ هذه الشاشة كان سيمحو صورة المشاركة وحساب إكس ونوع
          البطاقة وكتلة `robots` كلها عند أول ضغطة على «حفظ الإعدادات» — بنجاحٍ
          ظاهر وبلا رسالة واحدة. ولذلك حُذف مفتاح `seo` من `saveSettings` أيضاً:
          شاشة واحدة تملك المفتاح لا شاشتان.

          والرابط يبقى: شاشةٌ اختفت بلا مدخل إليها هي بالضبط ما يجعل المالك يظن أن
          الإعداد اختفى (النمط ٣ في `handover/LESSONS.md`).
        */}
        <Card className="gap-2 bg-muted/40 p-4 text-sm leading-relaxed ring-0">
          <p className="font-medium">إعدادات السيو انتقلت إلى مركز السيو</p>
          <p className="text-muted-foreground">
            قالب العنوان والوصف الافتراضي وصورة المشاركة وبطاقة إكس وأذونات الزحف كلها في{" "}
            <Link href="/admin/seo/settings" className="text-primary hover:underline">
              مركز السيو ← الإعدادات العامة
            </Link>{" "}
            — في مكان واحد بدل حقلين هنا وبقيةٍ محفورة في الكود.
          </p>
        </Card>

        <Separator />
        <div className="flex items-center justify-end gap-3">
          <Button type="submit" disabled={!wired}>
            حفظ الإعدادات
          </Button>
        </div>
      </form>

      {/*
        قسم الرحلات **خارج** نموذج الإعدادات أعلاه لا داخله: نموذج داخل نموذج
        HTML غير صالح، ولأن مفتاحَي الرحلات يُحفظان بإجراء مستقل يكتب في جدول
        آخر — فحفظهما مع بقية الإعدادات كان سيوهم بأن الزر الأعلى يحفظهما.
      */}
      <div className="pb-8">
        <TripSettingsSection wired={wired} />
      </div>
    </div>
  );
}
