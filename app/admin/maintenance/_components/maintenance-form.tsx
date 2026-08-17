"use client";

import * as React from "react";
import { AlertTriangle, Eye, Power, Wrench } from "lucide-react";

import { SaveButton, type SaveMessages } from "@/components/admin/save-feedback";
import { Card } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { cn } from "@/lib/utils";

/**
 * نموذج وضع الصيانة + معاينة حيّة لما يراه الزائر.
 * مكوّن عميل لأن المعاينة تتبع ما تكتبه لحظة بلحظة، لكنه لا يستورد شيئاً من
 * طبقة الخادم: كل النصوص الثابتة وقنوات التواصل تصله props من الصفحة الخادمية،
 * فيبقى انضباط الـ Whitelabel كما هو (لا اسم علامة ولا رقم داخل الكود).
 */

export type MaintenanceFormProps = {
  action: (formData: FormData) => void | Promise<void>;
  enabled: boolean;
  message: string;
  brandName: string;
  heading: string;
  note: string;
  contactLabels: string[];
  maxLength: number;
  disabled: boolean;
  /** رموز أخطاء الشاشة — تُعرض في الشريط الزاويّ بنفس نصّها أعلى الصفحة */
  errorMessages: SaveMessages;
};

export function MaintenanceForm({
  action,
  enabled: initialEnabled,
  message: initialMessage,
  brandName,
  heading,
  note,
  contactLabels,
  maxLength,
  disabled,
  errorMessages,
}: MaintenanceFormProps) {
  const [enabled, setEnabled] = React.useState(initialEnabled);
  const [message, setMessage] = React.useState(initialMessage);

  const paragraphs = message
    .split(/\r?\n\s*\r?\n/)
    .map((p) => p.trim())
    .filter(Boolean);

  const remaining = maxLength - message.length;

  return (
    <form action={action} className="space-y-6">
      {/* بطاقة التحذير الكبرى — تتغير لحظة تغيير المفتاح، قبل الحفظ */}
      <Card
        className={cn(
          "gap-3 border-2 p-5 transition-colors",
          enabled
            ? "border-red-400 bg-red-50 text-red-950 dark:border-red-600 dark:bg-red-950/50 dark:text-red-50"
            : "border-emerald-300 bg-emerald-50 text-emerald-950 dark:border-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-50"
        )}
      >
        <div className="flex items-start gap-3">
          {enabled ? (
            <AlertTriangle className="mt-0.5 size-6 shrink-0" />
          ) : (
            <Wrench className="mt-0.5 size-6 shrink-0" />
          )}
          <div className="space-y-1">
            <p className="font-heading text-base font-bold">
              {enabled
                ? "الموقع العام سيُغلق أمام الزوار"
                : "الموقع العام مفتوح ويستقبل الحجوزات"}
            </p>
            <p className="text-sm leading-relaxed">
              {enabled
                ? "كل صفحات الموقع العام — الرئيسية والخدمات والمسارات وصفحة الحجز — سيراها الزائر كصفحة صيانة برمز 503، ولن يستطيع إرسال أي طلب حجز جديد. لوحة التحكم وبوابة المتعهدين تبقيان مفتوحتين لك."
                : "كل شيء يعمل بشكل طبيعي. فعّل الصيانة فقط أثناء تحديث كبير أو خلل يمنع تنفيذ الحجوزات، فكل دقيقة إغلاق تعني حجوزات ضائعة."}
            </p>
          </div>
        </div>
      </Card>

      <Card className="space-y-4 p-5">
        <Label className="flex cursor-pointer items-center justify-between gap-3 rounded-lg border border-input p-3 text-sm font-normal">
          <span className="leading-relaxed">
            <span className="font-medium">تفعيل وضع الصيانة الآن</span>
            <span className="block text-muted-foreground">
              يسري فور الحفظ (خلال ثوانٍ معدودة على أبعد تقدير) بلا إعادة نشر ولا كود.
            </span>
          </span>
          <input
            type="checkbox"
            name="enabled"
            checked={enabled}
            onChange={(e) => setEnabled(e.target.checked)}
            disabled={disabled}
            className="size-5 shrink-0 accent-primary"
          />
        </Label>

        <div className="space-y-1.5">
          <Label htmlFor="maintenance-message">الرسالة المعروضة للزائر</Label>
          <textarea
            id="maintenance-message"
            name="message"
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            disabled={disabled}
            maxLength={maxLength}
            rows={5}
            className="w-full min-w-0 rounded-lg border border-input bg-transparent px-2.5 py-1.5 text-base leading-relaxed transition-colors outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:pointer-events-none disabled:cursor-not-allowed disabled:bg-input/50 disabled:opacity-50 md:text-sm dark:bg-input/30 dark:disabled:bg-input/80"
          />
          <p className="flex items-center justify-between text-xs text-muted-foreground">
            <span>اترك سطراً فارغاً بين الفقرات. اتركها فارغة لاستخدام النص الافتراضي.</span>
            <span className={cn(remaining < 0 && "text-destructive")} dir="ltr">
              {message.length} / {maxLength}
            </span>
          </p>
        </div>

        <Separator />
        <div className="flex justify-end">
          {/* 🔴 نصّ الشريط يتبع المفتاح لا الحالة المحفوظة: تفعيل الصيانة يُغلق
              الموقع العام — وهذا أثرٌ لا يحمله وميضُ زرّ. */}
          <SaveButton
            label={
              enabled ? "تشغيل وضع الصيانة وحفظ الرسالة" : "حفظ وإبقاء الموقع مفتوحاً"
            }
            icon={<Power />}
            variant={enabled ? "destructive" : "default"}
            disabled={disabled}
            errorMessages={errorMessages}
            savedMessages={{
              on: "وضع الصيانة مُفعَّل الآن — الموقع العام مغلق أمام الزوار. لا تنسَ إطفاءه بعد انتهاء العمل.",
              off: "حُفظت الإعدادات — الموقع العام يعمل بشكل طبيعي.",
            }}
          />
        </div>
      </Card>

      {/* المعاينة — نفس ترتيب صفحة الزائر: العلامة، العنوان، الرسالة، التواصل، التذييل */}
      <Card className="space-y-3 p-5">
        <div className="flex items-center gap-1.5">
          <Eye className="size-4 text-primary" />
          <h2 className="font-heading text-base font-bold">ما الذي سيراه الزائر</h2>
        </div>
        <p className="text-sm text-muted-foreground">
          معاينة حيّة تتبع ما تكتبه أعلاه — الصفحة الحقيقية تُعرض بنفس هذا الترتيب وبرمز
          حالة 503 الذي يخبر محركات البحث بأن التوقف مؤقت.
        </p>

        <div className="rounded-xl border border-dashed border-border bg-muted/40 p-4 sm:p-6">
          <div className="mx-auto max-w-lg rounded-2xl border border-border bg-background p-6 text-center shadow-sm">
            <p className="text-sm font-bold text-muted-foreground">{brandName}</p>
            <p aria-hidden="true" className="mt-3 text-3xl">
              🛠️
            </p>
            <h3 className="mt-2 font-heading text-xl font-bold">{heading}</h3>
            <div className="mt-3 space-y-2">
              {paragraphs.length > 0 ? (
                paragraphs.map((p, i) => (
                  <p key={i} className="text-sm leading-8 text-muted-foreground">
                    {p}
                  </p>
                ))
              ) : (
                <p className="text-sm leading-8 text-muted-foreground">
                  (ستظهر هنا الرسالة الافتراضية لأن الحقل فارغ)
                </p>
              )}
            </div>
            {contactLabels.length > 0 ? (
              <div className="mt-5 flex flex-wrap justify-center gap-2">
                {contactLabels.map((label) => (
                  <span
                    key={label}
                    className="rounded-xl bg-foreground px-4 py-2 text-sm font-semibold text-background"
                  >
                    {label}
                  </span>
                ))}
              </div>
            ) : (
              <p className="mt-5 text-xs text-muted-foreground">
                لا تظهر أزرار تواصل لأن الهاتف والواتساب فارغان في الإعدادات — أضفهما من
                شاشة الإعدادات ليجد الزائر طريقاً إليك أثناء الصيانة.
              </p>
            )}
            <p className="mt-5 text-xs text-muted-foreground">{note}</p>
          </div>
        </div>
      </Card>
    </form>
  );
}
