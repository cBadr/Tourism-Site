import { AlertTriangle, CheckCircle2, PowerOff, XCircle } from "lucide-react";

import { HelpTip } from "@/components/shared/HelpTip";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { IntegrationConfig } from "@/lib/analytics-types";
import {
  STATUS_LABELS,
  resolveIntegration,
  type IntegrationService,
  type IntegrationStatus,
} from "@/lib/analytics/services";
import { cn } from "@/lib/utils";

/**
 * مكوّنات شاشة الربط الخارجي.
 *
 * ⚠ **القاعدة الحاكمة لكل نص في هذا الملف:** المؤشر يصف **الإعداد** لا الاتصال.
 * «مضبوط ومفعّل» تعني حرفياً: المعرّف موجود وصيغته سليمة والمفتاح مفعّل، فالوسم
 * سيُحقن في صفحات الموقع. لا تعني أن جوجل أو ميتا استقبلت شيئاً: مانع الإعلانات
 * في متصفح الزائر يُسقط `googletagmanager.com` و`connect.facebook.net` صامتاً
 * والصفحة تُصيَّر سليمة تماماً. مؤشر يدّعي فحصاً حياً وهو يقرأ صفاً في القاعدة
 * أسوأ من غياب المؤشر (نمط «الواجهة تَعِد بما لا تنفّذه» في LESSONS.md).
 */

const STATUS_STYLE: Record<IntegrationStatus, string> = {
  ready:
    "border-emerald-300 bg-emerald-50 text-emerald-900 dark:border-emerald-700 dark:bg-emerald-950 dark:text-emerald-100",
  off: "border-border bg-muted text-muted-foreground",
  "no-id":
    "border-amber-300 bg-amber-50 text-amber-900 dark:border-amber-700 dark:bg-amber-950 dark:text-amber-100",
  "bad-id":
    "border-red-300 bg-red-50 text-red-900 dark:border-red-700 dark:bg-red-950 dark:text-red-100",
};

function StatusIcon({ status }: { status: IntegrationStatus }) {
  const className = "size-4 shrink-0";
  if (status === "ready") return <CheckCircle2 className={className} />;
  if (status === "off") return <PowerOff className={className} />;
  if (status === "no-id") return <AlertTriangle className={className} />;
  return <XCircle className={className} />;
}

/** شارة «حالة الإعداد» — التسمية نفسها جزء من الحماية من اللبس */
export function StatusPill({ status }: { status: IntegrationStatus }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium",
        STATUS_STYLE[status]
      )}
    >
      <StatusIcon status={status} />
      {STATUS_LABELS[status]}
    </span>
  );
}

const CHANNEL_LABEL: Record<IntegrationService["channel"], string> = {
  browser: "سكربت في متصفح الزائر",
  verification: "وسم تحقق في الترويسة",
  server: "نداء من خادمنا مباشرة",
};

/**
 * بطاقة خدمة واحدة: مفتاح تفعيل + حقل معرّف + حالة الإعداد + سطر «من أين تجلبه».
 * أسماء الحقول منقوطة تعكس مسار المفتاح في القاعدة (`integrations.ga4.id`)
 * تماماً كنموذج الإعدادات — فيصير الإجراء قارئاً واحداً لكل الخدمات.
 */
export function ServiceCard({
  service,
  config,
  disabled,
  invalid,
  extra,
}: {
  service: IntegrationService;
  config: IntegrationConfig;
  disabled: boolean;
  /** هذه الخدمة هي سبب رفض آخر حفظ — نبرزها بدل ترك المالك يبحث */
  invalid: boolean;
  /** محتوى إضافي أسفل الحقل (حالة توكن CAPI مثلاً) */
  extra?: React.ReactNode;
}) {
  const resolved = resolveIntegration(service.key, config);
  const idName = `integrations.${service.key}.id`;
  const enabledName = `integrations.${service.key}.enabled`;

  return (
    <Card
      className={cn(
        "space-y-4 p-5",
        invalid && "border-red-300 dark:border-red-700"
      )}
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="flex flex-wrap items-center gap-1.5 font-heading text-base font-bold">
            {service.label}
            <span dir="ltr" className="text-xs font-normal text-muted-foreground">
              {service.latinLabel}
            </span>
            <HelpTip>{service.effect}</HelpTip>
          </h2>
          <p className="text-sm text-muted-foreground">{CHANNEL_LABEL[service.channel]}</p>
        </div>
        <StatusPill status={resolved.status} />
      </div>

      <Label className="flex cursor-pointer items-center justify-between gap-3 rounded-lg border border-input p-3 text-sm font-normal">
        <span className="leading-relaxed">
          <span className="font-medium">تفعيل هذه الخدمة</span>
          <span className="block text-muted-foreground">{service.effect}</span>
        </span>
        <input
          type="checkbox"
          name={enabledName}
          defaultChecked={config.enabled}
          disabled={disabled}
          className="size-5 shrink-0 accent-primary"
        />
      </Label>

      <div className="space-y-1.5">
        <Label htmlFor={idName} className="flex items-center gap-1.5">
          المعرّف
          <HelpTip>
            الصيغة المقبولة: {service.shape}. يمكنك لصق السكربت أو وسم الـ HTML كاملاً وسنستخرج
            المعرّف منه.
          </HelpTip>
        </Label>
        <Input
          id={idName}
          name={idName}
          dir="ltr"
          defaultValue={config.id ?? ""}
          placeholder={service.placeholder}
          disabled={disabled}
          aria-invalid={invalid || resolved.status === "bad-id" || undefined}
        />
        <p className="text-xs leading-relaxed text-muted-foreground">
          <span className="font-medium text-foreground">من أين تجلبه: </span>
          {service.where}
        </p>
        {resolved.status === "bad-id" ? (
          <p className="text-xs font-medium text-red-700 dark:text-red-300">
            المعرّف المحفوظ لا يطابق صيغة المزوّد ({service.shape}) — لا يُحقن أي وسم حتى يُصحَّح.
          </p>
        ) : null}
      </div>

      {extra}
    </Card>
  );
}

/** سطر حالة متغيّر بيئة — يعرض الاسم والوجود فقط، ولا يعرض القيمة ولا جزءاً منها */
export function EnvKeyRow({
  name,
  present,
  note,
}: {
  name: string;
  present: boolean;
  note: string;
}) {
  return (
    <li
      className={cn(
        "flex flex-wrap items-center gap-2 rounded-lg border px-3 py-2 text-sm",
        present
          ? "border-emerald-300 bg-emerald-50 text-emerald-900 dark:border-emerald-700 dark:bg-emerald-950 dark:text-emerald-100"
          : "border-amber-300 bg-amber-50 text-amber-900 dark:border-amber-700 dark:bg-amber-950 dark:text-amber-100"
      )}
    >
      {present ? (
        <CheckCircle2 className="size-4 shrink-0" />
      ) : (
        <AlertTriangle className="size-4 shrink-0" />
      )}
      <code dir="ltr" className="font-mono text-xs">
        {name}
      </code>
      <span className="text-xs">{present ? "مضبوط في بيئة الخادم" : "غير مضبوط"}</span>
      <span className="w-full text-xs leading-relaxed opacity-90">{note}</span>
    </li>
  );
}
