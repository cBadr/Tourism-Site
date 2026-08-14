"use client";

import { Printer } from "lucide-react";

import { cn } from "@/lib/utils";

/**
 * زر طباعة ورقة الرحلة — جزيرة العميل الوحيدة التي تضيفها الملاحظة ٦ إلى
 * الواجهة العامة.
 *
 * ── لماذا نسخة ثانية بجوار `components/admin/print-button.tsx` ────────────────
 * ذاك زرّ اللوحة: يُبنى على `Button` بمقاس `sm` ونبرة `outline`، أي بلغة تصميم
 * اللوحة وحدها. وهذا الزر يقف **في صفّ واحد مع `CopyButton`** في لافتة الرابط
 * أعلى صفحة الرحلة، ولغة ذلك الصفّ مختلفة: `h-9` و`rounded-xl` وحدود
 * `border-border`. فاستعمال زرّ اللوحة هنا يعني زرّاً بمقاس آخر وحواف أخرى وسط
 * صفٍّ من ثلاثة — أو تمرير `className` يبطل نصف ما يعرّفه.
 *
 * والأهم أنه فرقُ ملكية لا فرقُ ذوق: `components/admin/**` تخدم أسطحاً محروسة
 * بجلسة مشرف، واستيرادها من صفحة عامة يفتح طريقاً بين طبقتين لا يجوز أن يوجد.
 * والمشترك بين الزرّين ليس الشكل بل القاعدة، وهي في `lib/export-types.ts` §٤
 * وكتلة الطباعة في `app/globals.css`: كلاهما `window.print()` ولا شيء غيره.
 *
 * والطباعة نفسها لا تحتاج جافاسكربت: قواعد `@media print` هي التي تصنع الورقة،
 * ومن أطفأ الجافاسكربت يطبع من قائمة المتصفح فيحصل على الورقة نفسها. فهذا الزر
 * **اختصار لا شرط** — ولذلك يختفي من الورقة مع بقية الأدوات (‏صنف `no-print`
 * على الحاوية، وقاعدة `.print-sheet button` في الكتلة المشتركة فوقه).
 *
 * والنصّ يصل مترجَماً من الخادم في `label` كما يفعل زر المالية: الجزيرة تبقى
 * بلا حالة ولا ترجمة ولا معرفة بما حولها.
 */
export function PrintButton({
  /** نصّ الزر مترجَماً — يبنيه الخادم من مساحة الصفحة */
  label,
  className,
}: {
  label: string;
  className?: string;
}) {
  return (
    <button
      type="button"
      onClick={() => window.print()}
      className={cn(
        "inline-flex h-9 shrink-0 items-center justify-center gap-1.5 rounded-xl border border-border bg-background px-3 text-sm font-medium transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50",
        className
      )}
    >
      <Printer className="size-4" aria-hidden="true" />
      <span>{label}</span>
    </button>
  );
}
