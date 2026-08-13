import Link from "next/link";
import { AlertTriangle, CheckCircle2, XCircle } from "lucide-react";
import { getSettings } from "@/lib/settings";
import { saveSettings } from "./actions";
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
          قيمة لون CSS — يُفضَّل صيغة oklch مثل oklch(0.45 0.15 250)، وتُقبل hex مثل ‎#1e40af. تظهر
          المعاينة بجوار الاسم بعد الحفظ.
        </HelpTip>
      </Label>
      <Input id={name} name={name} dir="ltr" defaultValue={defaultValue} disabled={disabled} />
    </div>
  );
}

export default async function SettingsPage({ searchParams }: PageProps<"/admin/settings">) {
  const [settings, params] = await Promise.all([getSettings(), searchParams]);
  const wired = hasSupabaseEnv();
  const saved = params.saved === "1";
  const error = typeof params.error === "string" ? params.error : null;

  const errorMessages: Record<string, string> = {
    env: "قاعدة البيانات غير مربوطة — لا يمكن الحفظ بعد.",
    name: "اسم العلامة التجارية حقل إلزامي.",
    save: "فشل الحفظ — تأكد أنك مسجل الدخول بحساب دوره admin (راجع supabase/README.md، فخ الصفوف الصفرية).",
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
          <p className="text-sm font-medium">
            حُفظت الإعدادات وانعكست على الموقع فوراً — افتح الموقع العام للتأكد.
          </p>
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
          <div className="grid gap-4 sm:grid-cols-3">
            <ColorField
              label="اللون الأساسي"
              name="brand.colors.primary"
              defaultValue={settings.brand.colors.primary}
              disabled={!wired}
            />
            <ColorField
              label="نص اللون الأساسي"
              name="brand.colors.primaryForeground"
              defaultValue={settings.brand.colors.primaryForeground}
              disabled={!wired}
            />
            <ColorField
              label="لون التمييز"
              name="brand.colors.accent"
              defaultValue={settings.brand.colors.accent}
              disabled={!wired}
            />
          </div>
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
            <p className="text-sm text-muted-foreground">روابط كاملة — الفارغ لا يظهر في الموقع.</p>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="فيسبوك" name="socials.facebook" defaultValue={settings.socials.facebook} dir="ltr" disabled={!wired} />
            <Field label="إكس (تويتر)" name="socials.x" defaultValue={settings.socials.x} dir="ltr" disabled={!wired} />
            <Field label="لينكد إن" name="socials.linkedin" defaultValue={settings.socials.linkedin} dir="ltr" disabled={!wired} />
            <Field label="إنستجرام" name="socials.instagram" defaultValue={settings.socials.instagram} dir="ltr" disabled={!wired} />
            <Field label="GitHub" name="socials.github" defaultValue={settings.socials.github} dir="ltr" disabled={!wired} />
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

        <Card className="space-y-4 p-5">
          <div>
            <h2 className="flex items-center gap-1.5 font-heading text-base font-bold">
              السيو الافتراضي
              <HelpTip>
                قالب العنوان يستخدم %s مكان اسم الصفحة (مثال: ‎%s | اسم علامتك). الوصف الافتراضي
                يظهر في نتائج البحث للصفحات التي لا وصف مخصصاً لها. تحكم أدق لكل صفحة يأتي في
                المرحلة ٢.
              </HelpTip>
            </h2>
          </div>
          <Field
            label="قالب العنوان"
            name="seo.titleTemplate"
            defaultValue={settings.seo.titleTemplate}
            dir="ltr"
            disabled={!wired}
          />
          <Field
            label="الوصف الافتراضي"
            name="seo.defaultDescription"
            defaultValue={settings.seo.defaultDescription}
            disabled={!wired}
          />
        </Card>

        <Separator />
        <div className="flex items-center justify-end gap-3 pb-8">
          <Button type="submit" disabled={!wired}>
            حفظ الإعدادات
          </Button>
        </div>
      </form>
    </div>
  );
}
