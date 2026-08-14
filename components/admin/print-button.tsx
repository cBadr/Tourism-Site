"use client";

import { Printer } from "lucide-react";

import { Button } from "@/components/ui/button";

/**
 * زر الطباعة — الجزيرة العميلة الوحيدة في أسطح الطباعة كلها.
 *
 * الطباعة نفسها لا تحتاج جافاسكربت: قواعد `@media print` في `app/globals.css`
 * تكفي، والمالك يستطيع الطباعة من قائمة المتصفح. هذا الزر **اختصار لا شرط**،
 * ولذلك يختفي من الورقة ولا يعطّل شيئاً إن لم يعمل — وهو مبرِّر `"use client"`
 * الوحيد في هذا العمل كله.
 *
 * ── لماذا انتقل من `app/admin/finance/_components/` إلى هنا ───────────────────
 * كان يخدم كشف حساب المتعهد وحده. وصار يخدم خمس شاشات في قسمين مختلفين
 * (المالية والطلبات)، واستيراده من شاشة الطلب عبر `../../finance/_components`
 * يجعل قسماً يعتمد على تفاصيل قسم آخر. نفس ما وقع لـ`KpiCard` حين تكرّر في خمسة
 * مواضع فانتقل إلى `components/ui/kpi-card.tsx`.
 *
 * والصنف `no-print` لا `print:hidden`: العقد في `lib/export-types.ts` يسمّي صنفاً
 * واحداً لكل ما لا يُطبع، وصنفان بمعنى واحد يعنيان أن أحدهما سيُنسى.
 */
export function PrintButton({ label = "طباعة" }: { label?: string }) {
  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      className="no-print"
      onClick={() => window.print()}
    >
      <Printer />
      {label}
    </Button>
  );
}
