"use client";

import { Printer } from "lucide-react";

import { Button } from "@/components/ui/button";

/**
 * زر الطباعة — المكوّن العميل الوحيد في شاشات المالية.
 *
 * الطباعة نفسها لا تحتاج جافاسكربت: قواعد `@media print` في صفحة الكشف تكفي،
 * والمالك يستطيع الطباعة من قائمة المتصفح. هذا الزر اختصار لا شرط، ولذلك يختفي
 * من الورقة المطبوعة (`print:hidden`) ولا يعطّل شيئاً إن لم يعمل.
 */
export function PrintButton({ label = "طباعة الكشف" }: { label?: string }) {
  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      className="print:hidden"
      onClick={() => window.print()}
    >
      <Printer />
      {label}
    </Button>
  );
}
