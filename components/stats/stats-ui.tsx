import type { ReactNode } from "react";
import Link from "next/link";
import { AlertTriangle, BarChart3, type LucideIcon } from "lucide-react";

import { HelpTip } from "@/components/shared/HelpTip";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import type { StatsFailure } from "@/lib/stats/read";
import { STAT_SECTIONS, STATS_BASE_PATH, type StatSectionKey } from "@/lib/stats/sections";
import { cn } from "@/lib/utils";

/**
 * لبنات شاشات الإحصائيات المشتركة (المرحلة ١٠).
 *
 * كلها مكوّنات **خادمية** بلا `"use client"` وبلا أي حالة: التفاعل الوحيد في
 * هذه الشاشات (اختيار الفترة) يمر بالرابط، والتلميحات تعمل بـ CSS وحده. النتيجة
 * أن الشاشة تُصيَّر كاملة على الخادم، وتعمل بـ JavaScript معطّل، ولا ترسل
 * جافاسكربت لرسم أي مخطط.
 */

// ---------------------------------------------------------------------------
// حالات «غير جاهزة»
// ---------------------------------------------------------------------------

const FAILURE_TITLES: Record<StatsFailure, string> = {
  migration: "طبقة الإحصائيات غير منفَّذة في قاعدة البيانات",
  forbidden: "هذه الأرقام للمديرين فقط",
  input: "رفضت قاعدة البيانات مُدخلات هذه القراءة",
  failed: "تعذّرت قراءة الإحصائيات",
};

/**
 * بطاقة «غير جاهزة» بسبب مسمّى.
 *
 * التفريق بين «الهجرة لم تُنفَّذ» و«حسابك ليس admin» و«فشل قراءة» ليس ترفاً:
 * الأولى يحلّها المالك بأمر واحد، والثانية بتسجيل دخول آخر، والثالثة تحتاج
 * سجل الخادم. رسالة «حدث خطأ» واحدة تُرجع المالك إلى الصفر في الحالات الثلاث.
 */
export function StatsNotReady({
  wired,
  missing,
  failure,
}: {
  wired: boolean;
  missing: string;
  failure: StatsFailure | null;
}) {
  const kind: StatsFailure = failure ?? "failed";
  return (
    <Card className="flex flex-row items-start gap-3 border-amber-300 bg-amber-50 p-4 text-amber-900 dark:border-amber-700 dark:bg-amber-950 dark:text-amber-100">
      <AlertTriangle className="mt-0.5 size-5 shrink-0" />
      <div className="space-y-1 text-sm leading-relaxed">
        <p className="font-semibold">{wired ? FAILURE_TITLES[kind] : "قاعدة البيانات غير مربوطة بعد"}</p>
        {!wired ? (
          <p>
            تُفعَّل شاشات الإحصائيات بعد تنفيذ خطوات <code dir="ltr">supabase/README.md</code> وإعادة
            تشغيل الخادم. بقية اللوحة تعمل طبيعياً.
          </p>
        ) : kind === "migration" ? (
          <p>
            قاعدة البيانات مربوطة لكن <code dir="ltr">{missing}</code> غير موجود — نفِّذ هجرة
            المرحلة ١٠ (<code dir="ltr">0022_analytics.sql</code>) بأمر{" "}
            <code dir="ltr">pnpm db:migrate</code> ثم أعد تحميل الصفحة.
          </p>
        ) : kind === "forbidden" ? (
          <p>
            رفضت قاعدة البيانات قراءة <code dir="ltr">{missing}</code> — الإحصائيات محروسة بحساب
            دوره <code dir="ltr">admin</code>. سجّل الدخول بحساب مدير؛ حسابات المتعهدين لا تصل إلى
            هذه الأرقام إطلاقاً.
          </p>
        ) : kind === "input" ? (
          <p>
            رفضت <code dir="ltr">{missing}</code> المُدخلات: إمّا اسم قسم لا تعرفه (أسماء
            الأقسام في <code dir="ltr">lib/stats/sections.ts</code> هي نفسها المعامل{" "}
            <code dir="ltr">p_section</code> في الهجرة)، وإمّا فترة معكوسة أو أطول من ٤٠٠ يوم.
            اختر فترة من الأزرار السريعة أعلاه.
          </p>
        ) : (
          <p>
            تعذّرت قراءة <code dir="ltr">{missing}</code>. راجع سجل الخادم لرسالة قاعدة البيانات؛
            بقية أجزاء الشاشة تُعرض بما توفّر منها.
          </p>
        )}
      </div>
    </Card>
  );
}

/**
 * حالة الفراغ — نص عربي يشرح **لماذا** الشاشة فارغة وماذا يفعل المالك الآن.
 *
 * لا رسم مكسور ولا محاور بلا نقاط: المكوّنات الراسمة كلها تُخرج هذه البطاقة
 * حين لا نقطة واحدة، فلا تصل قسمة على صفر ولا `NaN` إلى الشاشة أصلاً.
 */
export function StatsEmpty({ title, children }: { title?: string; children: ReactNode }) {
  return (
    <div className="rounded-lg border border-dashed border-border bg-muted/30 p-5 text-center">
      <p className="text-sm font-medium">{title ?? "لا بيانات في هذه الفترة"}</p>
      <p className="mx-auto mt-1 max-w-md text-xs leading-relaxed text-muted-foreground">{children}</p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// لوحة عرض
// ---------------------------------------------------------------------------

/** وسم «صورة الآن» — لكل كتلة لا تتقيّد بالفترة المختارة */
export function SnapshotBadge({ children }: { children?: ReactNode }) {
  return (
    <Badge variant="outline" className="shrink-0 text-[10px] font-normal">
      {children ?? "صورة الآن"}
    </Badge>
  );
}

/**
 * شريط نسبة — النسبة تصل محسوبة من القاعدة (مقياس ٠–١٠٠) ولا تُشتق هنا.
 * القص بين ٠ و١٠٠ **حماية تخطيط** لا تصحيح رقم: الرقم المعروض بجواره يُطبع
 * كما وصل، والقص يمنع رقماً شاذاً من كسر الصف.
 */
export function StatProgressBar({
  percent,
  label,
}: {
  percent: number | null;
  label: string;
}) {
  const width = percent === null ? 0 : Math.max(0, Math.min(100, percent));
  return (
    <div
      className="h-2 w-full min-w-24 overflow-hidden rounded-full bg-muted"
      role="progressbar"
      aria-valuenow={width}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-label={label}
    >
      <div className="h-full rounded-full bg-primary transition-all" style={{ width: `${width}%` }} />
    </div>
  );
}

/** بطاقة قسم داخل الشاشة: عنوان + تلميح + وصف + محتوى */
export function StatsPanel({
  title,
  icon: Icon,
  help,
  description,
  action,
  children,
}: {
  title: string;
  icon?: LucideIcon;
  help?: ReactNode;
  description?: ReactNode;
  action?: ReactNode;
  children: ReactNode;
}) {
  return (
    <Card className="space-y-4 p-5">
      <div className="flex flex-wrap items-start gap-2">
        <div className="min-w-0 flex-1">
          <h3 className="flex flex-wrap items-center gap-1.5 font-heading text-base font-bold">
            {Icon ? <Icon className="size-4 shrink-0 text-primary" /> : null}
            {title}
            {help ? <HelpTip>{help}</HelpTip> : null}
          </h3>
          {description ? (
            <p className="mt-0.5 text-sm leading-relaxed text-muted-foreground">{description}</p>
          ) : null}
        </div>
        {action ? <div className="shrink-0">{action}</div> : null}
      </div>
      {children}
    </Card>
  );
}

// ---------------------------------------------------------------------------
// التنقل بين الأقسام الستة
// ---------------------------------------------------------------------------

/**
 * شريط الأقسام — روابط لا حالة عميل، فيبقى رابط كل قسم قابلاً للمشاركة
 * والحفظ، وتنتقل الفترة المختارة معه بدل أن تُعاد كتابتها في كل شاشة.
 *
 * البنود تُبنى من `STAT_SECTIONS` لا من قائمة مكتوبة هنا: القسمان اللذان
 * «يسقطان دائماً» (المحتوى/السيو واللغات) لا يمكن أن يسقطا من شريط يُولَّد من
 * السجل نفسه الذي تُولَّد منه الصفحات.
 */
export function StatsSectionNav({
  current,
  rangeQuery,
}: {
  /** القسم الحالي — `null` في شاشة النظرة العامة */
  current: StatSectionKey | null;
  /** معاملات الفترة كما تُكتب في الرابط (`?range=last30` مثلاً) */
  rangeQuery: string;
}) {
  const suffix = rangeQuery ? `?${rangeQuery}` : "";
  const items: { key: StatSectionKey | null; label: string; path: string }[] = [
    { key: null, label: "نظرة عامة", path: STATS_BASE_PATH },
    ...STAT_SECTIONS.map((section) => ({
      key: section.key as StatSectionKey | null,
      label: section.label,
      path: section.path,
    })),
  ];

  return (
    <nav
      aria-label="أقسام الإحصائيات"
      className="flex flex-wrap items-center gap-1.5 rounded-xl bg-card p-1.5 ring-1 ring-foreground/10"
    >
      {items.map((item) => {
        const active = item.key === current;
        return (
          <Link
            key={item.label}
            href={`${item.path}${suffix}`}
            aria-current={active ? "page" : undefined}
            className={cn(
              "rounded-lg px-2.5 py-1.5 text-xs font-medium transition-colors",
              active
                ? "bg-primary text-primary-foreground"
                : "text-muted-foreground hover:bg-muted hover:text-foreground"
            )}
          >
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}

/** ترويسة موحّدة لكل شاشة إحصائيات */
export function StatsHeader({
  title,
  help,
  description,
  icon: Icon = BarChart3,
}: {
  title: string;
  help: ReactNode;
  description?: ReactNode;
  icon?: LucideIcon;
}) {
  return (
    <div>
      <h2 className="flex flex-wrap items-center gap-2 font-heading text-lg font-bold">
        <Icon className="size-5 shrink-0 text-primary" />
        {title}
        <HelpTip>{help}</HelpTip>
      </h2>
      {description ? (
        <p className="mt-1 text-sm leading-relaxed text-muted-foreground">{description}</p>
      ) : null}
    </div>
  );
}
