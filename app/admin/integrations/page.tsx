import { AlertTriangle, CheckCircle2, Info, ShieldCheck, XCircle } from "lucide-react";

import { HelpTip } from "@/components/shared/HelpTip";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import type { FunnelEvent } from "@/lib/analytics-types";
import { PROVIDER_EVENT_NAMES } from "@/lib/analytics/events";
import {
  META_CAPI_TEST_CODE_ENV,
  META_CAPI_TOKEN_ENV,
  metaCapiTokenPresent,
} from "@/lib/analytics/meta-capi";
import {
  INTEGRATION_SERVICES,
  normalizeIntegrations,
  resolveIntegration,
} from "@/lib/analytics/services";
import { getSettings } from "@/lib/settings";
import { FUNNEL_ORDER, FUNNEL_SIDE } from "@/lib/stats/cards";

import { saveIntegrations } from "./actions";
import { EnvKeyRow, ServiceCard } from "./_components/integrations-ui";

export const metadata = { title: "الربط الخارجي" };

const hasSupabaseEnv = () =>
  Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);

/**
 * أسماء الأحداث وترتيبها **مستوردة** من `lib/stats/cards.ts` لا مكتوبة هنا.
 *
 * جدولُ عناوين ثانٍ كان يعني أن المالك يقرأ في `/admin/stats` اسماً وفي هذه
 * الشاشة اسماً آخر لنفس الحدث. والأهم أن الترتيب المحلي كان يضع
 * `quote_requested` و`booking_started` **داخل** السلسلة تحت عمود اسمه «الخطوة»
 * — أي النموذج الذي ألغته هجرة 0023 بالضبط. هنا: السلسلة أولاً، ثم الحدثان
 * خارجها تحت عنوان صريح، والعمود اسمه «الحدث» لا «الخطوة».
 */
const CHAIN_STEPS = FUNNEL_ORDER;
const SIDE_STEPS = FUNNEL_SIDE;

/**
 * من أين يُرسل كل حدث فعلاً — عمود صدقٍ لا زينة.
 *
 * الجدول كان يطبع اسم الحدث في GA4 لكل خطوة وكأنها كلها تصل، فيبحث المالك
 * أسبوعاً عن سبب خلوّ تقارير التحويل عنده (النمط ٢ في `handover/LESSONS.md`).
 * الحقيقة: الخمسة الأولى تُطلق من متصفح الزائر (`lib/analytics/browser.ts`)،
 * أما الشراء فمن الخادم إلى ميتا وحدها عبر واجهة التحويلات — ولا يُطلق من
 * المتصفح عمداً لأن المسار الافتراضي (تحويل بنكي يعتمده التشغيل) لا لحظةَ
 * متصفحٍ فيه أصلاً، ولأن صفحة العودة من البوابة تُفتح مراراً فيتضاعف الشراء.
 */
const CHANNEL_NOTES: Record<FunnelEvent, { channel: string; ga4: string | null }> = {
  search_performed: { channel: "متصفح الزائر", ga4: PROVIDER_EVENT_NAMES.search_performed.ga4 },
  quote_viewed: { channel: "متصفح الزائر", ga4: PROVIDER_EVENT_NAMES.quote_viewed.ga4 },
  quote_requested: { channel: "متصفح الزائر", ga4: PROVIDER_EVENT_NAMES.quote_requested.ga4 },
  booking_created: { channel: "متصفح الزائر", ga4: PROVIDER_EVENT_NAMES.booking_created.ga4 },
  booking_started: { channel: "متصفح الزائر", ga4: PROVIDER_EVENT_NAMES.booking_started.ga4 },
  booking_paid: { channel: "خادمنا ← ميتا وحدها", ga4: null },
};

/** صف واحد في جدول الأحداث — نفس الأعمدة داخل السلسلة وخارجها */
function FunnelRow({ event, label }: { event: FunnelEvent; label: string }) {
  const note = CHANNEL_NOTES[event];

  return (
    <tr className="border-b border-border last:border-0">
      <td className="p-2 align-top">{label}</td>
      <td className="p-2 align-top" dir="ltr">
        <code className="font-mono text-xs">{event}</code>
      </td>
      <td className="p-2 align-top" dir="ltr">
        {note.ga4 ? (
          <code className="font-mono text-xs">{note.ga4}</code>
        ) : (
          <span dir="rtl" className="text-xs text-muted-foreground">
            لا يُرسل اليوم
          </span>
        )}
      </td>
      <td className="p-2 align-top" dir="ltr">
        <code className="font-mono text-xs">{PROVIDER_EVENT_NAMES[event].meta}</code>
      </td>
      <td className="p-2 align-top text-xs text-muted-foreground">{note.channel}</td>
    </tr>
  );
}

export default async function IntegrationsPage({
  searchParams,
}: PageProps<"/admin/integrations">) {
  const [settings, params] = await Promise.all([getSettings(), searchParams]);

  const wired = hasSupabaseEnv();
  const saved = params.saved === "1";
  const error = typeof params.error === "string" ? params.error : null;

  const integrations = normalizeIntegrations(settings.integrations);

  // رسالة رفض مستقلة لكل خدمة — «صيغة خاطئة» بلا تسمية الحقل تُبقي المالك يبحث
  const errorMessages: Record<string, string> = {
    env: "قاعدة البيانات غير مربوطة — لا يمكن الحفظ بعد.",
    save: "فشل الحفظ — تأكد أنك مسجل الدخول بحساب دوره admin (فخ الصفوف الصفرية في supabase/README.md).",
  };
  for (const service of INTEGRATION_SERVICES) {
    errorMessages[`id-${service.key}`] =
      `معرّف «${service.label}» غير صحيح. الصيغة المقبولة: ${service.shape}. لم يُحفظ شيء من النموذج.`;
  }

  const invalidKey =
    error && error.startsWith("id-") ? error.slice("id-".length) : null;

  const ga4Live = resolveIntegration("ga4", integrations.ga4).status === "ready";
  const gtmLive = resolveIntegration("gtm", integrations.gtm).status === "ready";
  const capiEnabled = integrations.metaCapi.enabled;
  const tokenPresent = metaCapiTokenPresent();
  const testCodePresent =
    typeof process.env.META_CAPI_TEST_EVENT_CODE === "string" &&
    process.env.META_CAPI_TEST_EVENT_CODE.trim() !== "";

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      {!wired && (
        <Card className="flex items-start gap-3 border-amber-300 bg-amber-50 p-4 text-amber-900 dark:border-amber-700 dark:bg-amber-950 dark:text-amber-100">
          <AlertTriangle className="mt-0.5 size-5 shrink-0" />
          <div className="text-sm leading-relaxed">
            <p className="font-semibold">قاعدة البيانات غير مربوطة بعد</p>
            <p>
              الحقول ظاهرة للمعاينة، والحفظ معطّل حتى تُنفَّذ خطوات{" "}
              <code dir="ltr">supabase/README.md</code> ويُعاد تشغيل الخادم.
            </p>
          </div>
        </Card>
      )}

      {saved && (
        <Card className="flex items-center gap-3 border-emerald-300 bg-emerald-50 p-4 text-emerald-900 dark:border-emerald-700 dark:bg-emerald-950 dark:text-emerald-100">
          <CheckCircle2 className="size-5 shrink-0" />
          <p className="text-sm font-medium">
            حُفظت المعرّفات وانعكست على الموقع فوراً — افتح الموقع العام واعرض مصدر الصفحة للتأكد
            من ظهور الوسم.
          </p>
        </Card>
      )}

      {error && (
        <Card className="flex items-center gap-3 border-red-300 bg-red-50 p-4 text-red-900 dark:border-red-700 dark:bg-red-950 dark:text-red-100">
          <XCircle className="size-5 shrink-0" />
          <p className="text-sm font-medium">{errorMessages[error] ?? "حدث خطأ غير متوقع."}</p>
        </Card>
      )}

      {/* ───────────────────────────────────────────────────────────────────
          البطاقة الأهم في الشاشة: ما الذي يعنيه المؤشر بالضبط.
          مانع الإعلانات يُسقط سكربتات جوجل وميتا صامتاً، فلو فُهم المؤشر
          «فحصاً حياً» لصار أخطر من غيابه.
          ─────────────────────────────────────────────────────────────────── */}
      <Card className="flex items-start gap-3 border-sky-300 bg-sky-50 p-4 text-sky-900 dark:border-sky-700 dark:bg-sky-950 dark:text-sky-100">
        <Info className="mt-0.5 size-5 shrink-0" />
        <div className="space-y-2 text-sm leading-relaxed">
          <p className="font-semibold">اقرأ هذا قبل أن تثق بالمؤشرات أدناه</p>
          <p>
            كل مؤشر في هذه الشاشة يقرأ <span className="font-medium">إعدادك أنت</span> فقط:
            «مضبوط ومفعّل» تعني أن المعرّف صالح والمفتاح مفعّل، فالوسم{" "}
            <span className="font-medium">سيُحقن</span> في صفحات الموقع. وهي{" "}
            <span className="font-medium">لا تعني</span> أن جوجل أو ميتا استقبلت بياناتك.
          </p>
          <p>
            السبب: مانع الإعلانات في متصفح الزائر يحجب سكربتات جوجل وميتا{" "}
            <span className="font-medium">صامتاً</span> والصفحة تعمل بشكل طبيعي تماماً — فلا
            توجد إشارة يمكن لخادمنا قراءتها. التأكد الحقيقي من لوحة الخدمة نفسها: تقرير «الوقت
            الفعلي» في إحصاءات جوجل، أو أداة «Test Events» في مدير أحداث ميتا، أو «إعادة
            التشغيل» في كلاريتي.
          </p>
          <p>
            ولهذا بالذات لا تعتمد أرقام لوحة التحكم على هذه الخدمات إطلاقاً: قمع الحجز يُحسب من
            جدول <code dir="ltr">funnel_events</code> في قاعدتنا، فيبقى صحيحاً ولو كانت الخدمات
            السبع مطفأة أو محجوبة.
          </p>
        </div>
      </Card>

      {ga4Live && gtmLive && (
        <Card className="flex items-start gap-3 border-amber-300 bg-amber-50 p-4 text-amber-900 dark:border-amber-700 dark:bg-amber-950 dark:text-amber-100">
          <AlertTriangle className="mt-0.5 size-5 shrink-0" />
          <div className="text-sm leading-relaxed">
            <p className="font-semibold">إحصاءات جوجل ومدير الوسوم مفعّلان معاً</p>
            <p>
              هذا صحيح تقنياً، لكن إن كنت تنشر GA4 من داخل مدير الوسوم أيضاً فستُحسب كل زيارة
              مرتين. اختر واحداً: إما GA4 مباشرة من هنا، وإما مدير الوسوم وحده وتضبط GA4 من
              داخله.
            </p>
          </div>
        </Card>
      )}

      <form action={saveIntegrations} className="space-y-6">
        {INTEGRATION_SERVICES.map((service) => (
          <ServiceCard
            key={service.key}
            service={service}
            config={integrations[service.key]}
            disabled={!wired}
            invalid={invalidKey === service.key}
            extra={
              service.key === "metaCapi" ? (
                <div className="space-y-2">
                  <p className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
                    <ShieldCheck className="size-3.5 shrink-0" />
                    التوكن السرّي (متغيّر بيئة الخادم)
                    <HelpTip>
                      التوكن <span className="font-semibold">لا يُخزَّن في قاعدة البيانات ولا
                      يُدخل من هذه الشاشة</span> — جدول الإعدادات مقروء علناً، ووضع التوكن فيه
                      يعني تسليمه لأي زائر. مكانه متغيّرات بيئة الخادم (على Vercel: Settings ←
                      Environment Variables، أو ملف <code dir="ltr">.env.local</code> محلياً) ثم
                      إعادة تشغيل الخادم. هذه القائمة تخبرك بوجود المتغيّر من عدمه فقط، ولا تعرض
                      قيمته ولا طولها ولا جزءاً منها.
                    </HelpTip>
                  </p>
                  <ul className="space-y-1.5">
                    <EnvKeyRow
                      name={META_CAPI_TOKEN_ENV}
                      present={tokenPresent}
                      note="بدونه تُتخطّى واجهة التحويلات بصمت ولا يتعطل شيء آخر — الحجز يكتمل والحدث يُسجَّل في قاعدتنا كالمعتاد."
                    />
                    <EnvKeyRow
                      name={META_CAPI_TEST_CODE_ENV}
                      present={testCodePresent}
                      note="اختياري وللتجربة وحدها: انسخه من «Test Events» في مدير أحداث ميتا ليظهر حجزك التجريبي هناك فوراً، ثم احذفه قبل الإطلاق."
                    />
                  </ul>
                  {capiEnabled && !tokenPresent ? (
                    <p className="text-xs font-medium text-amber-700 dark:text-amber-300">
                      الخدمة مفعّلة والتوكن غائب ⇒ لا يُرسَل شيء إلى ميتا من الخادم.
                    </p>
                  ) : null}
                </div>
              ) : undefined
            }
          />
        ))}

        <Separator />
        <div className="flex items-center justify-end gap-3">
          <Button type="submit" disabled={!wired}>
            حفظ معرّفات الربط
          </Button>
        </div>
      </form>

      {/* ───────────────────────────────────────────────────────────────────
          شفافية ما يُرسل: أي حدث، وباسم أي، وما الذي لا يُرسل أبداً.
          ─────────────────────────────────────────────────────────────────── */}
      <Card className="space-y-4 p-5">
        <div>
          <h2 className="flex items-center gap-1.5 font-heading text-base font-bold">
            أحداث التحويل — ما الذي يُسجَّل وباسم أي
            <HelpTip>
              الاسم الموحّد في قاعدتنا يُترجَم إلى اسم كل مزوّد داخل محوّل واحد
              (<code dir="ltr">lib/analytics/events.ts</code>) — فلا ينحرف اسم حدث الشراء بين
              المتصفح والخادم فتُحسب عملية واحدة مرتين.
            </HelpTip>
          </h2>
          <p className="text-sm text-muted-foreground">
            كل حدث يُكتب صفاً في قاعدتنا أولاً ودائماً — وهذا وحده ما تُبنى عليه أرقام
            الإحصائيات. الخمسة الأولى تُطلق إضافةً من متصفح الزائر إلى الخدمة المفعّلة
            (فيُسقطها مانع الإعلانات إن وُجد)، وحدث الشراء يُرسل من خادمنا إلى ميتا عبر واجهة
            التحويلات فلا يُسقطه شيء.
          </p>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full min-w-[40rem] text-sm">
            <thead>
              <tr className="border-b border-border text-xs text-muted-foreground">
                <th className="p-2 text-start font-medium">الحدث</th>
                <th className="p-2 text-start font-medium">الاسم في قاعدتنا</th>
                <th className="p-2 text-start font-medium">في إحصاءات جوجل</th>
                <th className="p-2 text-start font-medium">في ميتا</th>
                <th className="p-2 text-start font-medium">من أين يُرسل</th>
              </tr>
            </thead>
            <tbody>
              {CHAIN_STEPS.map((step) => (
                <FunnelRow key={step.event} event={step.event} label={step.label} />
              ))}

              {/* فاصل صريح: ما تحته ليس خطوةً تالية في السلسلة */}
              <tr className="border-b border-border bg-muted/40">
                <td colSpan={5} className="p-2 text-xs font-semibold text-muted-foreground">
                  خارج السلسلة — يُقاسان ويُعرضان، ولا يقعان بين مرحلتين (لا معدل تحول لهما)
                </td>
              </tr>

              {SIDE_STEPS.map((step) => (
                <FunnelRow key={step.event} event={step.event} label={step.label} />
              ))}
            </tbody>
          </table>
        </div>

        <Card className="gap-2 border-amber-300 bg-amber-50/60 p-4 text-sm leading-relaxed ring-0 dark:border-amber-800 dark:bg-amber-950/20">
          <p className="font-medium">لماذا لا يصل «الشراء» إلى إحصاءات جوجل</p>
          <p className="text-muted-foreground">
            لأن المسار الافتراضي هنا تحويل بنكي يعتمده فريق التشغيل من اللوحة — والعميل غير
            موجود في متصفحه لحظتها، فلا يمكن إطلاق الحدث من عنده. وإطلاقه من صفحة العودة من
            بوابة الدفع كان سيتضاعف مع كل تحديث للصفحة ويغطي الدفع الإلكتروني وحده. النتيجة:
            إيرادك الحقيقي تقرؤه من <span className="font-medium">إحصائيات اللوحة</span> ومن
            ميتا، لا من إحصاءات جوجل. (مسجَّل في <code dir="ltr">handover/OPEN_TASKS.md</code>.)
          </p>
        </Card>

        <Card className="gap-2 bg-muted/40 p-4 text-sm leading-relaxed ring-0">
          <p className="font-medium">ما الذي لا يخرج من الموقع أبداً</p>
          <p className="text-muted-foreground">
            لا اسم عميل ولا رقم هاتف ولا واتساب، ولا رابط متابعة الحجز، ولا هوية المتعهد المنفّذ
            ولا تكلفته ولا هامش الموقع. ما يخرج: رقم الحجز المرجعي، وقيمته وعملته، وفئة السيارة.
            هذا مفروض في بناء الكود نفسه (تُبنى الحمولة حقلاً حقلاً) لا في مراجعة بشرية.
          </p>
        </Card>
      </Card>
    </div>
  );
}
