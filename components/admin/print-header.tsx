import type { ReactNode } from "react";

import { formatDateTimeLabel } from "@/components/booking/format";
import { getSettings } from "@/lib/settings";

/**
 * ترويسة الورقة المطبوعة — تظهر عند الطباعة وحدها (`hidden print:block`).
 *
 * ثلاثة قرارات فيها:
 *
 * (١) **اسم العلامة يُقرأ من الإعدادات لا يُكتب في الكود** (‏D-04). ورقةٌ تخرج من
 *     المكتب باسم مكتوب في ملف `.tsx` هي بالضبط ما يمنعه انضباط الـ whitelabel:
 *     أول نسخة ثانية من المنتج تطبع اسم الأولى. و`getSettings` مغلَّفة بـ
 *     `cache` من React، فنداؤها في كل شاشة استعلامٌ واحد للطلب كله لا خمسة.
 *
 * (٢) **لا تظهر على الشاشة إطلاقاً.** الشاشة تحمل عنوانها في شريط اللوحة العلوي
 *     وفي أول سطر منها؛ وترويسة ثانية بنفس المعنى فوقها ضريبةٌ يدفعها من يعمل
 *     يومياً لأجل من يطبع أحياناً. أما الورقة فتخرج بلا سياق أصلاً — لا شريط
 *     جانبي ولا عنوان صفحة — فترويستها هي كل ما يعرّفها.
 *
 * (٣) **«صدرت في» لا «طُبعت في».** الوقت المكتوب هو لحظة توليد الصفحة على
 *     الخادم لا لحظة الضغط على «طباعة»، وقد يفصل بينهما دقائق. والصياغة تقول ما
 *     يقع فعلاً: تاريخٌ يدّعي دقّةً لا يملكها أسوأ من تاريخ صريح.
 *
 * ولا رقم عملٍ واحد يُحسب هنا (‏D-05): كل ما يمرّ من `meta` نصٌّ وصل جاهزاً.
 */

export type PrintMetaItem = {
  label: string;
  value: ReactNode;
  /** `ltr` للمراجع والأرقام اللاتينية حتى لا تنقلب في سياق عربي */
  dir?: "ltr" | "rtl";
};

export async function PrintHeader({
  title,
  meta = [],
  note,
}: {
  /** ماذا تكون هذه الورقة — «ورقة تشغيل رحلة»، «تقرير المصروفات»… */
  title: string;
  /** أسطر التعريف: الفترة، المرجع، الحساب، العملة. `null` يُسقط البند بهدوء */
  meta?: (PrintMetaItem | null)[];
  /** سطر أخير يشرح حدود الورقة — من يقرؤها وما لا يجوز تسليمه معها */
  note?: ReactNode;
}) {
  const settings = await getSettings();
  const items = meta.filter((item): item is PrintMetaItem => item !== null);
  // `formatDateTimeLabel` بتوقيت القاهرة — نفس المنطقة التي يقيس بها المشروع كل يوم
  const issuedAt = formatDateTimeLabel(new Date().toISOString());

  return (
    <div className="print-only print-box hidden space-y-2 p-4">
      <div className="flex flex-wrap items-baseline gap-2">
        <span className="font-heading text-base font-bold">{settings.brand.name}</span>
        <span className="text-sm">— {title}</span>
        {issuedAt ? <span className="ms-auto text-xs">صدرت في {issuedAt}</span> : null}
      </div>

      {items.length > 0 && (
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
          {items.map((item) => (
            <span key={item.label}>
              <span>{item.label}: </span>
              <span className="font-semibold" dir={item.dir}>
                {item.value}
              </span>
            </span>
          ))}
        </div>
      )}

      {note ? <p className="text-xs leading-relaxed">{note}</p> : null}
    </div>
  );
}
