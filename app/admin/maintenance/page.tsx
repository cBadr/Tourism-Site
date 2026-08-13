import { AlertTriangle, CheckCircle2, Info, XCircle } from "lucide-react";

import { HelpTip } from "@/components/shared/HelpTip";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { getSettings } from "@/lib/settings";
import {
  MAINTENANCE_BYPASS_PREFIXES,
  MAINTENANCE_CACHE_TTL_MS,
  MAINTENANCE_HEADING,
  MAINTENANCE_NOTE,
  MAX_MAINTENANCE_MESSAGE,
  fetchMaintenanceState,
  maintenanceContactLinks,
} from "@/lib/maintenance";
import { saveMaintenance } from "./actions";
import { MaintenanceForm } from "./_components/maintenance-form";

/**
 * شاشة وضع الصيانة — مفتاح واحد يقفل الموقع العام أمام الزوار ويترك
 * لوحة التحكم وبوابة المتعهدين مفتوحتين للفريق.
 * القراءة من `lib/maintenance.ts` (نفس المصدر الذي يقرأه الوسيط)، والكتابة
 * من `actions.ts` إلى مفتاح `maintenance` في `site_settings`.
 */

export const metadata = { title: "وضع الصيانة" };

const hasSupabaseEnv = () =>
  Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);

const ERROR_MESSAGES: Record<string, string> = {
  env: "قاعدة البيانات غير مربوطة — لا يمكن الحفظ بعد.",
  length: `الرسالة أطول من ${MAX_MAINTENANCE_MESSAGE} حرفاً — اختصرها قليلاً.`,
  save: "فشل الحفظ — تأكد أنك مسجل الدخول بحساب دوره admin (راجع supabase/README.md، فخ الصفوف الصفرية).",
};

export default async function MaintenancePage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const [state, settings, params] = await Promise.all([
    fetchMaintenanceState(true),
    getSettings(),
    searchParams,
  ]);

  const wired = hasSupabaseEnv();
  const saved = typeof params.saved === "string" ? params.saved : null;
  const error = typeof params.error === "string" ? params.error : null;
  const seeded = state.source === "db";
  const readOnly = !wired;

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      {!wired && (
        <Card className="flex items-start gap-3 border-amber-300 bg-amber-50 p-4 text-amber-900 dark:border-amber-700 dark:bg-amber-950 dark:text-amber-100">
          <AlertTriangle className="mt-0.5 size-5 shrink-0" />
          <div className="text-sm leading-relaxed">
            <p className="font-semibold">قاعدة البيانات غير مربوطة بعد</p>
            <p>
              الشاشة ظاهرة للمعاينة بقيمها الافتراضية، والحفظ معطّل حتى تُنفَّذ خطوات{" "}
              <code dir="ltr">supabase/README.md</code> ويُعاد تشغيل الخادم.
            </p>
          </div>
        </Card>
      )}

      {wired && !seeded && (
        <Card className="flex items-start gap-3 border-amber-300 bg-amber-50 p-4 text-amber-900 dark:border-amber-700 dark:bg-amber-950 dark:text-amber-100">
          <AlertTriangle className="mt-0.5 size-5 shrink-0" />
          <div className="text-sm leading-relaxed">
            <p className="font-semibold">مفتاح الصيانة غير موجود في قاعدة البيانات</p>
            <p>
              نفّذ هجرة <code dir="ltr">supabase/migrations/0008_trust_pages.sql</code> أولاً. يمكنك
              الحفظ من هنا وسيُنشأ المفتاح، لكن تنفيذ الهجرة يبقى الطريق الصحيح لأنها تحمل
              أيضاً صفحات الشروط والاسترداد والخصوصية.
            </p>
          </div>
        </Card>
      )}

      {saved === "on" && (
        <Card className="flex items-start gap-3 border-red-300 bg-red-50 p-4 text-red-900 dark:border-red-700 dark:bg-red-950 dark:text-red-100">
          <AlertTriangle className="mt-0.5 size-5 shrink-0" />
          <p className="text-sm font-medium leading-relaxed">
            وضع الصيانة مُفعَّل الآن — الموقع العام مغلق أمام الزوار. لا تنسَ إطفاءه بعد انتهاء
            العمل.
          </p>
        </Card>
      )}

      {saved === "off" && (
        <Card className="flex items-center gap-3 border-emerald-300 bg-emerald-50 p-4 text-emerald-900 dark:border-emerald-700 dark:bg-emerald-950 dark:text-emerald-100">
          <CheckCircle2 className="size-5 shrink-0" />
          <p className="text-sm font-medium">حُفظت الإعدادات — الموقع العام يعمل بشكل طبيعي.</p>
        </Card>
      )}

      {error && (
        <Card className="flex items-center gap-3 border-red-300 bg-red-50 p-4 text-red-900 dark:border-red-700 dark:bg-red-950 dark:text-red-100">
          <XCircle className="size-5 shrink-0" />
          <p className="text-sm font-medium">{ERROR_MESSAGES[error] ?? "حدث خطأ غير متوقع."}</p>
        </Card>
      )}

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="flex items-center gap-1.5 font-heading text-lg font-bold">
            وضع الصيانة
            <HelpTip>
              مفتاح طوارئ: يوقف استقبال الزوار والحجوزات الجديدة مؤقتاً أثناء تحديث كبير أو
              خلل تشغيلي، ويعرض لهم رسالة تكتبها أنت بدل صفحة معطوبة.
            </HelpTip>
          </h2>
          <p className="text-sm text-muted-foreground">
            الحالة تُقرأ من قاعدة البيانات — لا كود ولا إعادة نشر.
          </p>
        </div>
        <Badge
          variant={state.maintenance.enabled ? "destructive" : "secondary"}
          className="shrink-0"
        >
          {state.maintenance.enabled ? "الموقع مغلق للصيانة" : "الموقع يعمل"}
        </Badge>
      </div>

      <MaintenanceForm
        action={saveMaintenance}
        enabled={state.maintenance.enabled}
        message={state.maintenance.message}
        brandName={state.brandName || settings.brand.name}
        heading={MAINTENANCE_HEADING}
        note={MAINTENANCE_NOTE}
        contactLabels={maintenanceContactLinks(state).map((link) => link.label)}
        maxLength={MAX_MAINTENANCE_MESSAGE}
        disabled={readOnly}
      />

      <Card className="space-y-3 p-5">
        <div className="flex items-center gap-1.5">
          <Info className="size-4 text-primary" />
          <h2 className="font-heading text-base font-bold">ماذا يحدث بالضبط عند التفعيل؟</h2>
        </div>
        <ul className="list-disc space-y-2 ps-5 text-sm leading-relaxed text-muted-foreground">
          <li>
            كل صفحات الموقع العام ترد بصفحة صيانة ورمز حالة{" "}
            <code dir="ltr">503</code> مع <code dir="ltr">Retry-After</code> — وهي الطريقة التي
            توصي بها محركات البحث للتوقف المؤقت فلا يتأثر ترتيبك.
          </li>
          <li>
            تبقى هذه المسارات مفتوحة دائماً:{" "}
            <span dir="ltr">{MAINTENANCE_BYPASS_PREFIXES.join(" · ")}</span> — أي لوحة التحكم
            وبوابة المتعهدين ونداءات الـ API والأصول الثابتة.
          </li>
          <li>
            رقم الواتساب والهاتف يظهران للزائر كأزرار تواصل إن كانا معبأين في شاشة الإعدادات
            — فلا تفقد حجزاً عاجلاً أثناء الإغلاق.
          </li>
          <li>
            يسري التغيير خلال {Math.round(MAINTENANCE_CACHE_TTL_MS / 1000)} ثانية على الأكثر
            (ذاكرة قصيرة تمنع استعلاماً على كل طلب زائر).
          </li>
          <li>
            الحجوزات القائمة لا تتأثر: لا يُلغى شيء ولا يُحذف، والصيانة تمنع الطلبات الجديدة
            فقط.
          </li>
        </ul>
      </Card>
    </div>
  );
}
