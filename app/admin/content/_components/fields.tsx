import * as React from "react";
import { AlertTriangle, CheckCircle2, XCircle } from "lucide-react";

import { HelpTip } from "@/components/shared/HelpTip";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import type { Page, PageKind } from "@/lib/content-types";

/**
 * لبنات مشتركة لشاشات المحتوى — بنفس إيقاع صفحة الإعدادات (المرحلة ١):
 * حقول بعناوين و«؟» إرشادية، وبطاقات تنبيه كهرمانية/خضراء/حمراء عبر الـ query string.
 * كلها مكوّنات خادمية الصلاحية (بلا "use client") لتُستخدم في الخادم والعميل معاً.
 */

/** نفس مظهر Input لعناصر textarea وselect الأصلية (لا مكوّن جاهز لهما في ui/) */
export const fieldControlClass =
  "w-full min-w-0 rounded-lg border border-input bg-transparent px-2.5 py-1.5 text-base transition-colors outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:pointer-events-none disabled:cursor-not-allowed disabled:bg-input/50 disabled:opacity-50 md:text-sm dark:bg-input/30 dark:disabled:bg-input/80";

export function Textarea({ className, ...props }: React.ComponentProps<"textarea">) {
  return <textarea className={cn(fieldControlClass, "min-h-20 leading-relaxed", className)} {...props} />;
}

export function Field({
  label,
  name,
  defaultValue,
  placeholder,
  help,
  dir = "rtl",
  disabled,
  required,
  pattern,
}: {
  label: string;
  name: string;
  defaultValue?: string | null;
  placeholder?: string;
  help?: string;
  dir?: "rtl" | "ltr";
  disabled?: boolean;
  required?: boolean;
  pattern?: string;
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
        pattern={pattern}
      />
    </div>
  );
}

export function TextareaField({
  label,
  name,
  defaultValue,
  placeholder,
  help,
  rows,
  disabled,
}: {
  label: string;
  name: string;
  defaultValue?: string | null;
  placeholder?: string;
  help?: string;
  rows?: number;
  disabled?: boolean;
}) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={name} className="flex items-center gap-1.5">
        {label}
        {help ? <HelpTip>{help}</HelpTip> : null}
      </Label>
      <Textarea
        id={name}
        name={name}
        defaultValue={defaultValue ?? ""}
        placeholder={placeholder}
        rows={rows}
        disabled={disabled}
      />
    </div>
  );
}

/** بطاقات الحالة الثلاث: قراءة فقط (كهرماني) / حُفظ (أخضر) / خطأ (أحمر) */
export function StatusBanners({
  wired,
  readOnly,
  saved,
  error,
  errorMessages,
  savedMessage = "حُفظ التغيير وانعكس على الموقع العام فوراً.",
}: {
  wired: boolean;
  readOnly: boolean;
  saved: boolean;
  error: string | null;
  errorMessages: Record<string, string>;
  savedMessage?: string;
}) {
  return (
    <>
      {readOnly && (
        <Card className="flex flex-row items-start gap-3 border-amber-300 bg-amber-50 p-4 text-amber-900 dark:border-amber-700 dark:bg-amber-950 dark:text-amber-100">
          <AlertTriangle className="mt-0.5 size-5 shrink-0" />
          <div className="text-sm leading-relaxed">
            <p className="font-semibold">المحتوى معروض للقراءة فقط حالياً</p>
            {wired ? (
              <p>
                قاعدة البيانات مربوطة لكن جداول المحتوى فارغة — نفِّذ migration وبذرة المرحلة ٢ من{" "}
                <code dir="ltr">supabase/migrations</code> ثم أعد تحميل الصفحة. المعروض الآن هو
                المحتوى الافتراضي المدمج.
              </p>
            ) : (
              <p>
                قاعدة البيانات غير مربوطة بعد — المعروض هو المحتوى الافتراضي للمعاينة، والتحرير
                يُفعَّل بعد تنفيذ خطوات <code dir="ltr">supabase/README.md</code> وإعادة تشغيل
                الخادم.
              </p>
            )}
          </div>
        </Card>
      )}

      {saved && (
        <Card className="flex flex-row items-center gap-3 border-emerald-300 bg-emerald-50 p-4 text-emerald-900 dark:border-emerald-700 dark:bg-emerald-950 dark:text-emerald-100">
          <CheckCircle2 className="size-5 shrink-0" />
          <p className="text-sm font-medium">{savedMessage}</p>
        </Card>
      )}

      {error && (
        <Card className="flex flex-row items-center gap-3 border-red-300 bg-red-50 p-4 text-red-900 dark:border-red-700 dark:bg-red-950 dark:text-red-100">
          <XCircle className="size-5 shrink-0" />
          <p className="text-sm font-medium">{errorMessages[error] ?? "حدث خطأ غير متوقع."}</p>
        </Card>
      )}
    </>
  );
}

/** رسالتا الخطأ المشتركتان بين كل شاشات المحتوى */
export const COMMON_ERROR_MESSAGES: Record<string, string> = {
  env: "قاعدة البيانات غير مربوطة — لا يمكن الحفظ بعد.",
  save: "فشل الحفظ — تأكد أنك مسجل الدخول بحساب دوره admin (راجع supabase/README.md، فخ الصفوف الصفرية).",
};

/** تسميات أنواع الصفحات وترتيب عرضها في القائمة */
export const KIND_ORDER: PageKind[] = ["home", "service", "corridor", "static", "landing"];
export const KIND_LABELS: Record<PageKind, string> = {
  home: "الرئيسية",
  service: "الخدمات",
  corridor: "المسارات",
  static: "صفحات ثابتة",
  landing: "صفحات الهبوط",
};

/** المسار العام للصفحة بحسب خطة التوجيه (المرحلة ٢) */
export function publicPath(page: Pick<Page, "kind" | "slug">): string {
  switch (page.kind) {
    case "home":
      return "/";
    case "service":
      return `/services/${page.slug}`;
    case "corridor":
      return `/routes/${page.slug}`;
    case "static":
    // صفحة الهبوط تُصيَّر من `app/[slug]` نفسه على `/{slug}` بلا بادئة لغة (D-24)
    case "landing":
      return `/${page.slug}`;
  }
}

/** صيغة عدد الأقسام بالفصحى */
export function sectionCountLabel(n: number): string {
  if (n === 0) return "بلا أقسام";
  if (n === 1) return "قسم واحد";
  if (n === 2) return "قسمان";
  if (n <= 10) return `${n} أقسام`;
  return `${n} قسماً`;
}
