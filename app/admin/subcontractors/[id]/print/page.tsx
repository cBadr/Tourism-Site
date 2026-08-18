import Link from "next/link";
import { ArrowRight } from "lucide-react";

import { PrintButton } from "@/components/admin/print-button";
import { SubcontractorPrintSheet } from "../_components/subcontractor-print-sheet";

/**
 * ملفُّ المتعهد للطباعة — **الورقة، لا الشاشة**.
 *
 * ══════════════════════════════════════════════════════════════════════════
 *  لماذا مسارٌ ثانٍ بدل «طباعة نفس الصفحة»
 * ══════════════════════════════════════════════════════════════════════════
 *
 * عهدُ الطباعة في هذا المستودع (الملاحظة ٦): **الشاشةُ تلبس `print-sheet` على
 * جذرها**، وقواعدُ `@media print` في `app/globals.css` هي التي تفكّ الألوان
 * وتُلغي عرضَ الجداول الأدنى وتكرّر ترويستها وتُخفي كل أداة تفاعل. وهذه الصفحة
 * تلبسه — **فلا سطرَ CSS جديد ولا `<style>` محلّي**، وهو بعينه ما تمنعه ترويسة
 * تلك الكتلة (خمسُ نسخٍ من قواعد الطباعة تنحرف بصمت).
 *
 * أما شاشةُ `[id]/page.tsx` فليست ورقة: فيها أزرارُ اعتمادٍ وإيقافٍ وتحريرُ
 * خاناتِ تكلفةٍ في مكانها وبطاقةُ مستنداتِ سائقين **بصور**. وإلباسُها ثوبَ
 * الورق كان يعني وسمَ عشرات العناصر بيدٍ داخل ملفٍّ من ١٦٠٠ سطر، **وطباعةَ صورِ
 * الرخص** ما لم يُوسَم كلُّ واحدٍ منها — وهو ما مُنع صراحةً.
 *
 * ⇒ صفحةٌ واحدة، محتواها كلُّه محتوى، وزرُّ الطباعة فيها `no-print` وحده.
 *
 * 🔒 **والحراسة مُورَثة لا مُعادة**: المسار تحت `/admin`، فيمرّ على حارس الدور في
 * `proxy.ts` وعلى `app/admin/layout.tsx` — ولا حارسَ ثانٍ يُكتب هنا كي لا يصير
 * للصلاحية تعريفان.
 */

export const metadata = { title: "ملف المتعهد للطباعة" };

export default async function SubcontractorPrintPage({
  params,
}: PageProps<"/admin/subcontractors/[id]/print">) {
  const { id } = await params;

  return (
    <div className="print-sheet mx-auto max-w-4xl space-y-4">
      <div className="no-print flex flex-wrap items-center gap-2">
        <Link
          href={`/admin/subcontractors/${id}`}
          className="flex items-center gap-1.5 text-sm font-medium transition-colors hover:text-primary"
        >
          <ArrowRight className="size-4" />
          العودة إلى ملف المتعهد
        </Link>
        <span className="ms-auto">
          <PrintButton label="طباعة الملف" />
        </span>
      </div>

      <SubcontractorPrintSheet id={id} />
    </div>
  );
}
