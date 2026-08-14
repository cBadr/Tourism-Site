import Link from "next/link";
import { CheckCircle2, ExternalLink, Save, ShieldAlert } from "lucide-react";

import { HelpTip } from "@/components/shared/HelpTip";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { getBaseUrl } from "@/lib/seo";
import { buildRobotsRules, renderRobotsTxt } from "@/lib/seo/robots";
import { getSettings } from "@/lib/settings";

import { COMMON_ERROR_MESSAGES, StatusBanners, fieldControlClass } from "../../content/_components/fields";
import { PathCode, SeoSwitch, SeoTabs } from "../_components/seo-ui";
import { saveSeoSettings } from "./actions";

export const metadata = { title: "إعدادات السيو العامة" };

const hasSupabaseEnv = () =>
  Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);

/**
 * الإعدادات العامة — التبويب الذي كان **غائباً كلياً** وهو أصل الملاحظة.
 *
 * شكوى المالك حرفياً: «إعدادات السيو فقيرة». والجرد أثبتها: مركز السيو لم يكن
 * يملك إعداد سيو واحداً — قالب العنوان والوصف الافتراضي كانا يُحرَّران في
 * `/admin/settings`، وكل ما عداهما محفوراً في الكود. هذه الشاشة تجمعهما إلى
 * صورة المشاركة وبطاقة إكس وكتلة `robots` في مكان واحد، و**سُحبا من شاشة
 * الإعدادات** كي لا تُحرَّر قيمة واحدة من شاشتين.
 */

const ERROR_MESSAGES: Record<string, string> = {
  ...COMMON_ERROR_MESSAGES,
  "template-empty": "قالب العنوان حقل إلزامي — بدونه لا عنوان لأي صفحة في نتائج البحث.",
  "template-long": "قالب العنوان أطول مما يقبله الحقل — اختصره.",
  "template-placeholder":
    "قالب العنوان لا يحتوي على %s — وبدونها تحمل كل صفحات الموقع العنوان نفسه في نتائج البحث.",
  "description-empty": "الوصف الافتراضي حقل إلزامي — تقع عليه كل صفحة بلا وصف خاص.",
  "description-long": "الوصف الافتراضي أطول مما يقبله الحقل — قصّره.",
  image:
    "رابط صورة المشاركة غير صالح — اكتب مساراً داخلياً يبدأ بشرطة مائلة (‏/brand/og.png) أو رابطاً كاملاً يبدأ بـ https://. المنصات تجلب الصورة من خوادمها فلا ينفع فيها مسار نسبي.",
  "image-long": "رابط صورة المشاركة أطول مما يقبله الحقل.",
  twitter:
    "حساب إكس غير صالح — حروف وأرقام وشرطة سفلية فقط، وطوله ١٥ خانة فأقل، بلا علامة @ وبلا رابط.",
  disallow:
    "أحد أسطر المنع ليس مساراً داخلياً — كل سطر يبدأ بشرطة مائلة واحدة (‏/search) بلا نطاق وبلا نقطتين.",
  "disallow-many": "أسطر المنع أكثر مما تحتاجه أي حالة حقيقية — راجع القائمة.",
};

/** الخدمتان اللتان يعرضهما هذا التبويب للقراءة فقط — مصدرهما شاشة الربط الخارجي */
const VERIFICATION_SERVICES = [
  {
    key: "gsc" as const,
    label: "أدوات مشرفي المواقع من جوجل",
    latin: "Google Search Console",
    tag: "google-site-verification",
  },
  {
    key: "bing" as const,
    label: "أدوات مشرفي المواقع من بينج",
    latin: "Bing Webmaster Tools",
    tag: "msvalidate.01",
  },
];

export default async function SeoSettingsPage({
  searchParams,
}: PageProps<"/admin/seo/settings">) {
  const [settings, params] = await Promise.all([getSettings(), searchParams]);

  const wired = hasSupabaseEnv();
  const saved = params.saved === "1";
  const error = typeof params.error === "string" ? params.error : null;

  /**
   * المعاينة تُبنى من **نفس الدالة** التي يبني بها `app/robots.ts` الملف، فما
   * يظهر هنا هو الملف الحقيقي لا وصفٌ له. وهي تعكس القيم **المحفوظة** لا ما في
   * الحقول الآن — ولذلك يقول السطر تحتها ذلك صراحةً بدل أن يوهم بمعاينة حية.
   */
  const robotsPreview = renderRobotsTxt(
    buildRobotsRules(settings.seo.robots),
    `${getBaseUrl()}/sitemap.xml`
  );

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="font-heading text-lg font-bold">إعدادات السيو العامة</h2>
        <HelpTip>
          ما ينطبق على الموقع كله: قالب عنوان كل صفحة، والوصف الذي يظهر للصفحات بلا وصف
          خاص، وصورة المشاركة في واتساب وفيسبوك وإكس، وأذونات الزحف في ملف robots.txt.
          التعديل يسري فور الحفظ، لكن نتائج البحث لا تتغيّر إلا بعد زيارة جوجل التالية.
        </HelpTip>
      </div>

      <SeoTabs active="/admin/seo/settings" />

      {/* بطاقة «غير مربوطة» مكتوبة هنا لا من `StatusBanners`: نصّ تلك البطاقة
          يتحدث عن جداول المحتوى وبذرتها، وهذه شاشة إعدادات لا محتوى. */}
      {!wired && (
        <Card className="flex flex-row items-start gap-3 border-amber-300 bg-amber-50 p-4 text-amber-900 dark:border-amber-700 dark:bg-amber-950 dark:text-amber-100">
          <ShieldAlert className="mt-0.5 size-5 shrink-0" aria-hidden="true" />
          <p className="text-sm leading-relaxed">
            قاعدة البيانات غير مربوطة — الحقول ظاهرة بقيمها الافتراضية والحفظ معطّل حتى
            تُنفَّذ خطوات <code dir="ltr">supabase/README.md</code> ويُعاد تشغيل الخادم.
          </p>
        </Card>
      )}

      <StatusBanners
        wired={wired}
        readOnly={false}
        saved={saved}
        error={error}
        errorMessages={ERROR_MESSAGES}
        savedMessage="حُفظت إعدادات السيو — الترويسة وملف robots.txt يعكسانها الآن."
      />

      <form action={saveSeoSettings} className="space-y-6">
        <Card className="space-y-4 p-5">
          <div>
            <h3 className="font-heading text-base font-bold">العنوان والوصف</h3>
            <p className="text-sm text-muted-foreground">
              أول سطرين يقرؤهما الباحث في نتيجة البحث قبل أن يقرر النقر.
            </p>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="titleTemplate" className="flex items-center gap-1.5">
              قالب العنوان
              <HelpTip>
                ‏%s موضع عنوان الصفحة نفسها. مثال: «‏%s | اسم علامتك» يجعل صفحة «استقبال
                المطارات» تظهر «استقبال المطارات | اسم علامتك». والصفحة الرئيسية وحدها تخرج
                باسم العلامة بلا قالب.
              </HelpTip>
            </Label>
            <Input
              id="titleTemplate"
              name="titleTemplate"
              dir="ltr"
              defaultValue={settings.seo.titleTemplate}
              disabled={!wired}
              required
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="defaultDescription" className="flex items-center gap-1.5">
              الوصف الافتراضي
              <HelpTip>
                يظهر في نتائج البحث لكل صفحة لا وصف خاصاً لها. اكتبه جملةً تُقنع الباحث، ثم
                خصّص أوصاف الصفحات المهمة من تبويب «الميتاداتا».
              </HelpTip>
            </Label>
            <textarea
              id="defaultDescription"
              name="defaultDescription"
              rows={3}
              defaultValue={settings.seo.defaultDescription}
              disabled={!wired}
              className={cn(fieldControlClass, "min-h-20 leading-relaxed")}
            />
          </div>
        </Card>

        <Card className="space-y-4 p-5">
          <div>
            <h3 className="font-heading text-base font-bold">بطاقة المشاركة</h3>
            <p className="text-sm text-muted-foreground">
              ما يظهر حين يُلصق رابط من موقعك في واتساب أو فيسبوك أو إكس.
            </p>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="ogImageUrl" className="flex items-center gap-1.5">
              صورة المشاركة الافتراضية
              <HelpTip>
                مقاسها ١٢٠٠×٦٣٠ بكسل. اتركها فارغة ليُستعمل شعار العلامة، وإن لم يكن مضبوطاً
                فصورة محايدة مرفقة بالمشروع. مسار داخلي يبدأ بشرطة مائلة أو رابط كامل يبدأ
                بـ https:// — والمنصات تجلبها من خوادمها فلا ينفع فيها مسار نسبي.
              </HelpTip>
            </Label>
            <Input
              id="ogImageUrl"
              name="ogImageUrl"
              dir="ltr"
              defaultValue={settings.seo.ogImageUrl ?? ""}
              placeholder="/brand/og-default.png أو https://..."
              disabled={!wired}
            />
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="twitterSite" className="flex items-center gap-1.5">
                حساب إكس للموقع
                <HelpTip>
                  اسم الحساب بلا علامة @ وبلا رابط — مثال: yourbrand. يظهر منسوباً إليك أسفل
                  البطاقة حين يُشارَك رابط من موقعك. اتركه فارغاً فلا يخرج الوسم أصلاً.
                </HelpTip>
              </Label>
              <Input
                id="twitterSite"
                name="twitterSite"
                dir="ltr"
                defaultValue={settings.seo.twitterSite ?? ""}
                placeholder="yourbrand"
                disabled={!wired}
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="twitterCard" className="flex items-center gap-1.5">
                نوع بطاقة إكس
                <HelpTip>
                  «صورة كبيرة» تعرض الصورة بعرض البطاقة كلها وهي الأعلى نقراً؛ و«مختصرة»
                  تعرض مربعاً صغيراً بجوار النص. اختر المختصرة إن لم تكن صور صفحاتك عريضة.
                </HelpTip>
              </Label>
              <select
                id="twitterCard"
                name="twitterCard"
                defaultValue={settings.seo.twitterCard}
                disabled={!wired}
                className={cn(fieldControlClass, "h-9")}
              >
                <option value="summary_large_image">صورة كبيرة (summary_large_image)</option>
                <option value="summary">مختصرة بصورة صغيرة (summary)</option>
              </select>
            </div>
          </div>
        </Card>

        <Card className="space-y-4 p-5">
          <div>
            <h3 className="flex items-center gap-1.5 font-heading text-base font-bold">
              الفهرسة وأذونات الزحف
              <HelpTip>
                ملف robots.txt يقول لمحركات البحث أين يُسمح لها بالدخول. وهو{" "}
                <strong className="font-semibold">طلب لا قفل</strong>: الزاحف المحترم يلتزم
                به، ومن لا يحترمه لا يمنعه هذا الملف — الحماية الحقيقية للمسارات الخاصة في
                حارس المسارات وسياسات قاعدة البيانات.
              </HelpTip>
            </h3>
          </div>

          <SeoSwitch
            name="noindexAll"
            title="امنع فهرسة الموقع كله"
            hint="للنسخة التجريبية قبل الإطلاق. فعّله وسيطلب الملف من كل محرك بحث ألا يزحف إلى شيء — واحرص على إطفائه يوم الإطلاق، فموقعٌ محجوب صامتاً لا يلاحظه أحد لأسابيع."
            defaultChecked={!settings.seo.robots.indexable}
            disabled={!wired}
          />

          <SeoSwitch
            name="blockAiCrawlers"
            title="احجب زواحف الذكاء الاصطناعي"
            hint="يمنع GPTBot وCCBot وGoogle-Extended وأمثالها من قراءة محتواك للتدريب. القرار يخصّك وحدك: نفس المحتوى الذي يبني ترتيبك هو ما تتدرّب عليه هذه النماذج."
            defaultChecked={settings.seo.robots.blockAiCrawlers}
            disabled={!wired}
          />

          <div className="space-y-1.5">
            <Label htmlFor="disallow" className="flex items-center gap-1.5">
              مسارات ممنوعة إضافية
              <HelpTip>
                مسار في كل سطر، يبدأ بشرطة مائلة. لوحة التحكم وبوابة المتعهدين ومسارات
                ‏/api ممنوعة دائماً ولا تحتاج كتابتها — هذه إضافة فوقها لا بديل عنها.
              </HelpTip>
            </Label>
            <textarea
              id="disallow"
              name="disallow"
              dir="ltr"
              rows={4}
              defaultValue={settings.seo.robots.disallow.join("\n")}
              placeholder={"/search\n/thank-you"}
              disabled={!wired}
              className={cn(fieldControlClass, "min-h-20 font-mono leading-relaxed")}
            />
          </div>

          {/* المعاينة — من نفس الدالة التي تبني الملف الحقيقي، لا وصفٌ لها */}
          <div className="space-y-2 rounded-xl border border-border bg-muted/40 p-4">
            <div className="flex flex-wrap items-center gap-2">
              <h4 className="text-sm font-semibold">الملف الناتج الآن</h4>
              <PathCode>/robots.txt</PathCode>
              <a
                href="/robots.txt"
                target="_blank"
                rel="noreferrer"
                className={cn(buttonVariants({ variant: "ghost", size: "xs" }), "ms-auto")}
              >
                <ExternalLink />
                افتح الملف الحقيقي
              </a>
            </div>
            <pre
              dir="ltr"
              className="overflow-x-auto rounded-lg bg-background p-3 text-xs leading-relaxed"
            >
              {robotsPreview}
            </pre>
            <p className="text-xs leading-relaxed text-muted-foreground">
              هذه القيم <strong>المحفوظة</strong> لا ما في الحقول أعلاه — احفظ لترى أثر
              تعديلك. وهي مبنية بنفس دالة الملف الحقيقي، فلا تفترق عنه.
            </p>
          </div>
        </Card>

        <div className="sticky bottom-0 flex items-center justify-end gap-3 border-t border-border bg-background/95 py-3 backdrop-blur">
          <Button type="submit" disabled={!wired}>
            <Save />
            حفظ إعدادات السيو
          </Button>
        </div>
      </form>

      {/*
        وسما التحقق **للقراءة فقط هنا وبقرار**: القاعدة ١ في `lib/analytics-types.ts`
        تجمع كل معرّفات الخدمات في مفتاح `integrations` واحد، وتقسيمه بين شاشتين
        يصنع مصدرين لقيمة واحدة. فيُعرض الحال هنا — وهو ما يسأل عنه المالك وهو في
        مركز السيو — ويُحرَّر هناك.
      */}
      <Card className="space-y-3 p-5">
        <div>
          <h3 className="flex items-center gap-1.5 font-heading text-base font-bold">
            إثبات ملكية الموقع
            <HelpTip>
              وسم صغير في ترويسة كل صفحة يثبت لجوجل وبينج أن الموقع لك، فتفتح لك تقارير
              كلمات البحث والصفحات المفهرسة. لا يقيس شيئاً ولا يؤثر في الترتيب.
            </HelpTip>
          </h3>
          <p className="text-sm text-muted-foreground">
            معروض هنا للاطلاع، ويُحرَّر في شاشة الربط الخارجي مع بقية معرّفات الخدمات.
          </p>
        </div>

        <ul className="space-y-2 text-sm">
          {VERIFICATION_SERVICES.map((service) => {
            const config = settings.integrations[service.key];
            const active = config.enabled && (config.id ?? "").trim() !== "";
            return (
              <li key={service.key} className="flex flex-wrap items-center gap-2">
                {active ? (
                  <CheckCircle2
                    className="size-4 shrink-0 text-emerald-600 dark:text-emerald-400"
                    aria-hidden="true"
                  />
                ) : (
                  <ShieldAlert
                    className="size-4 shrink-0 text-amber-600 dark:text-amber-400"
                    aria-hidden="true"
                  />
                )}
                <span className="font-medium">{service.label}</span>
                <code dir="ltr" className="text-xs text-muted-foreground">
                  {service.tag}
                </code>
                {active ? (
                  <Badge variant="secondary">الوسم يخرج في الترويسة</Badge>
                ) : (
                  <Badge variant="outline">
                    {config.enabled ? "مفعّل بلا وسم" : "غير مضبوط"}
                  </Badge>
                )}
              </li>
            );
          })}
        </ul>

        <Link
          href="/admin/integrations"
          className={cn(buttonVariants({ variant: "outline", size: "sm" }), "w-fit")}
        >
          <ExternalLink />
          تحرير وسوم التحقق
        </Link>
      </Card>

      <p className="pb-8 text-xs leading-relaxed text-muted-foreground">
        قالب العنوان والوصف الافتراضي كانا يُحرَّران في شاشة الإعدادات، ونُقلا إلى هنا كي
        لا تُحرَّر قيمة واحدة من شاشتين — وهي بالضبط الحالة التي تجعل نصفَ الفريق يعدّل في
        مكان لا يقرؤه أحد.
      </p>
    </div>
  );
}
