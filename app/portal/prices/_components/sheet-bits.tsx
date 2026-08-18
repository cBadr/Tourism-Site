import { Badge } from "@/components/ui/badge";
import { countLabel } from "@/components/portal/portal-ui";
import type { PriceSheetRow } from "@/lib/subcontractor-types";

/**
 * لبنات عرض الكشف — مكوّنات خادمية (بلا `"use client"`) فتُستعمل داخل الصفحات
 * مباشرة، ولا تعبر قيمة من وحدة عميل إلى وحدة خادم (العيب الذي بيّض البورتال).
 */

/**
 * شريط حالات الكشف. الكشف **لا يحمل حالة** في القاعدة — ما تراه هنا عدّاداتٌ
 * مشتقّة من حالات مساراته، وهي نفس العمود الذي يقرؤه محرّك التسعير. فما يظهر
 * «معتمد» هنا معتمدٌ فعلاً في التسعير، ولا حالة ثانية تنحرف عنه.
 */
export function SheetCounts({ sheet }: { sheet: PriceSheetRow }) {
  const parts: { label: string; count: number; tone: string }[] = [
    {
      label: "معتمد",
      count: sheet.approvedCount,
      tone: "border-emerald-300 bg-emerald-100 text-emerald-900 dark:border-emerald-700 dark:bg-emerald-950 dark:text-emerald-100",
    },
    {
      label: "قيد الاعتماد",
      count: sheet.pendingCount,
      tone: "border-amber-300 bg-amber-100 text-amber-900 dark:border-amber-700 dark:bg-amber-950 dark:text-amber-100",
    },
    { label: "مسودة", count: sheet.draftCount, tone: "border-border text-muted-foreground" },
    {
      label: "مرفوض",
      count: sheet.rejectedCount,
      tone: "border-red-300 bg-red-100 text-red-900 dark:border-red-700 dark:bg-red-950 dark:text-red-100",
    },
  ];

  const shown = parts.filter((p) => p.count > 0);
  if (shown.length === 0) {
    return <Badge variant="outline">لا مسارات بعد</Badge>;
  }

  return (
    <>
      {shown.map((p) => (
        <Badge key={p.label} variant="outline" className={p.tone}>
          {p.label} {countLabel(p.count)}
        </Badge>
      ))}
    </>
  );
}

/** «٣ مسارات» بصيغة عربية صحيحة */
export function routesText(count: number): string {
  if (count === 0) return "بلا مسارات";
  if (count === 1) return "مسار واحد";
  if (count === 2) return "مساران";
  if (count <= 10) return `${countLabel(count)} مسارات`;
  return `${countLabel(count)} مساراً`;
}
