import type * as React from "react";
import Link from "next/link";
import { AlertTriangle, CheckCircle2, Info, XCircle } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import type { IssueSeverity } from "@/lib/seo/audit";

/**
 * لبنات مشتركة لشاشات مركز السيو الثلاث — كلها مكوّنات خادمية الصلاحية
 * (بلا "use client") بنفس إيقاع `app/admin/content/_components/fields.tsx`
 * وألوان الحالة المعتمدة عبر اللوحة: أخضر سليم · كهرماني ناقص · أحمر معطوب.
 */

/* ------------------------------------------------------------------ */
/* التبويبات — روابط لا حالة عميل، فيبقى الرابط قابلاً للمشاركة         */
/* ------------------------------------------------------------------ */

/**
 * التبويبات الخمسة.
 *
 * الترتيب يتبع نطاق الأثر من الأعم إلى الأخص: **الموقع كله** (الإعدادات العامة
 * وبطاقة النشاط) ثم **الصفحة الواحدة** (الميتاداتا) ثم **الروابط القديمة**
 * (التحويلات) ثم **تقرير القراءة** (البيانات المهيكلة). ومع ذلك يبقى مدخل القسم
 * من الشريط الجانبي على `/admin/seo` — الميتاداتا — لأنها الشاشة التي تُفتح
 * أسبوعياً بينما الإعدادات العامة تُضبط مرة وتُنسى.
 */
export const SEO_TABS = [
  { href: "/admin/seo/settings", label: "الإعدادات العامة" },
  { href: "/admin/seo/business", label: "بطاقة النشاط" },
  { href: "/admin/seo", label: "الميتاداتا" },
  { href: "/admin/seo/redirects", label: "التحويلات" },
  { href: "/admin/seo/audit", label: "البيانات المهيكلة" },
] as const;

export function SeoTabs({ active }: { active: (typeof SEO_TABS)[number]["href"] }) {
  return (
    <nav
      aria-label="أقسام مركز السيو"
      className="flex flex-wrap gap-2 border-b border-border pb-3"
    >
      {SEO_TABS.map((tab) => {
        const isActive = tab.href === active;
        return (
          <Link
            key={tab.href}
            href={tab.href}
            aria-current={isActive ? "page" : undefined}
            className={cn(
              "rounded-lg px-3 py-1.5 text-sm font-medium transition-colors",
              isActive
                ? "bg-primary/10 text-primary ring-1 ring-primary/40"
                : "text-muted-foreground hover:bg-muted hover:text-foreground"
            )}
          >
            {tab.label}
          </Link>
        );
      })}
    </nav>
  );
}

/* ------------------------------------------------------------------ */
/* عرض المسارات — لاتينية دائماً بـ dir=ltr                             */
/* ------------------------------------------------------------------ */

export function PathCode({ children, className }: { children: string; className?: string }) {
  return (
    <code
      dir="ltr"
      className={cn(
        "inline-block max-w-full truncate rounded bg-muted px-1.5 py-0.5 text-xs",
        className
      )}
    >
      {children}
    </code>
  );
}

/* ------------------------------------------------------------------ */
/* مفتاح تشغيل بعنوان وشرح — بنفس شكل مفاتيح شاشة الإعدادات              */
/* ------------------------------------------------------------------ */

/**
 * مربع اختيار في بطاقة بعنوان وسطر شرح.
 *
 * ⚠ **مربع الاختيار غير المؤشَّر لا يُرسل مع النموذج أصلاً** — فالغياب يعني
 * «مطفأ» في كل إجراء يقرؤه، وهذا هو سبب وجود `name` واحد بلا حقل مرافق.
 */
export function SeoSwitch({
  name,
  title,
  hint,
  defaultChecked,
  disabled,
}: {
  name: string;
  title: string;
  hint: React.ReactNode;
  defaultChecked: boolean;
  disabled?: boolean;
}) {
  return (
    <Label className="flex cursor-pointer items-center justify-between gap-3 rounded-lg border border-input p-3 text-sm font-normal">
      <span className="leading-relaxed">
        <span className="font-medium">{title}</span>
        <span className="block text-muted-foreground">{hint}</span>
      </span>
      <input
        type="checkbox"
        name={name}
        defaultChecked={defaultChecked}
        disabled={disabled}
        className="size-5 shrink-0 accent-primary"
      />
    </Label>
  );
}

/* ------------------------------------------------------------------ */
/* شارات الخطورة                                                       */
/* ------------------------------------------------------------------ */

export const SEVERITY_STYLES: Record<IssueSeverity, string> = {
  error:
    "border-red-300 bg-red-50 text-red-900 dark:border-red-700 dark:bg-red-950 dark:text-red-100",
  warn: "border-amber-300 bg-amber-50 text-amber-900 dark:border-amber-700 dark:bg-amber-950 dark:text-amber-100",
  info: "border-sky-300 bg-sky-50 text-sky-900 dark:border-sky-700 dark:bg-sky-950 dark:text-sky-100",
};

export const SEVERITY_LABELS: Record<IssueSeverity, string> = {
  error: "لا يُصدَّر",
  warn: "ناقص",
  info: "تحسين",
};

export function SeverityIcon({
  severity,
  className,
}: {
  severity: IssueSeverity;
  className?: string;
}) {
  const Icon = severity === "error" ? XCircle : severity === "warn" ? AlertTriangle : Info;
  return <Icon className={cn("size-4 shrink-0", className)} aria-hidden="true" />;
}

export function OkBadge({ children }: { children: React.ReactNode }) {
  return (
    <Badge className="border-emerald-300 bg-emerald-50 text-emerald-900 dark:border-emerald-700 dark:bg-emerald-950 dark:text-emerald-100">
      <CheckCircle2 className="size-3.5" aria-hidden="true" />
      {children}
    </Badge>
  );
}

/* ------------------------------------------------------------------ */
/* بطاقة «الجدول غير موجود بعد»                                        */
/* ------------------------------------------------------------------ */

export function MissingTableNotice({ table, phase }: { table: string; phase: string }) {
  return (
    <div className="flex items-start gap-3 rounded-xl border border-amber-300 bg-amber-50 p-4 text-amber-900 dark:border-amber-700 dark:bg-amber-950 dark:text-amber-100">
      <AlertTriangle className="mt-0.5 size-5 shrink-0" aria-hidden="true" />
      <div className="text-sm leading-relaxed">
        <p className="font-semibold">
          جدول <code dir="ltr">{table}</code> غير موجود في قاعدة البيانات بعد
        </p>
        <p>
          هذه الشاشة جاهزة، لكن جدولها يأتي مع هجرة {phase}. نفّذ{" "}
          <code dir="ltr">pnpm db:migrate</code> ثم أعد تحميل الصفحة. حتى ذلك الحين لا يطبّق
          الموقع أي تحويل — لا شيء معطّل، فقط غير موجود.
        </p>
      </div>
    </div>
  );
}
