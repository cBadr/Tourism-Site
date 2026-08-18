import Link from "next/link";
import { AlertTriangle, CheckCircle2, Layers, XCircle } from "lucide-react";

import { formatMoney, toArabicDigits } from "@/components/booking/format";
import { HelpTip } from "@/components/shared/HelpTip";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { controlClass } from "../../orders/_components/booking-ui";
import { reviewPriceSheet } from "../actions";
import type { PricingContext } from "./pricing-context";
import { customerPrice, radiusText, type PriceItemView, type PriceListView } from "./subcontractor-ui";

/**
 * بطاقة **كشف أسعار** — الدفعة كلها في مكان واحد وقرارٌ واحد لها.
 *
 * لماذا جدول لا بطاقة لكل مسار: الكشف قد يحمل مئة مسار، وطابورٌ من مئة بطاقة
 * ليس مراجعةً بل إرهاق. الجدول يعرض لكل مسار طرفيه وتكلفته وسعر العميل الناتج
 * عنها بالهامش الحالي — وهو العمود الذي بدونه يعتمد المدير رقماً لا يعرف أثره.
 *
 * والأرقام هنا **معاينة عرض**؛ الرقم الملزم يحسبه `quote_price` في Postgres.
 *
 * 🔴 والعدد على الزرّ ليس `lists.length`: هو `sheet.pendingCount` الآتي من
 * `price_sheet_stats` — **العدّاد الذي تقرؤه الدالة نفسها**. والبطاقة تقارن
 * الاثنين قبل أن ترسم زرّاً: اختلافُهما يعني أن الشاشة لا تعرض كل ما ستكتبه،
 * فلا يُعرض قرارٌ أصلاً. وفوق ذلك ترفض 0109 في القاعدة أي نداءٍ عدده لا يطابق
 * ما تُمسكه `for update` — طبقتان، وواحدةٌ منهما لا تعتمد على هذا الملف.
 */

export type SheetHeader = {
  id: string;
  title: string;
  note: string | null;
  companyName: string;
  companyId: string | null;
  companyApproved: boolean;
  /**
   * عدد المسارات المنتظرة في هذا الكشف **من مصدر مستقل عن استعلام الصفحة**
   * (`price_sheet_stats.pending_count`). استقلاله هو كل قيمته: لو اقتُطع
   * استعلام العرض ظهر الاقتطاع فرقاً هنا بدل أن يمرّ صامتاً.
   */
  pendingCount: number;
};

export function PriceSheetCard({
  sheet,
  lists,
  itemsByList,
  pricing,
  returnTo,
  readOnly,
}: {
  sheet: SheetHeader;
  /** مسارات هذا الكشف المنتظرة للمراجعة — الأقدم أولاً */
  lists: PriceListView[];
  itemsByList: Map<string, PriceItemView[]>;
  pricing: PricingContext;
  returnTo: string;
  readOnly: boolean;
}) {
  const shown = lists.length;
  const truncated = shown !== sheet.pendingCount;
  const decidable = !readOnly && !truncated && shown > 0;

  return (
    <Card className="space-y-4 p-5">
      <div className="flex flex-wrap items-center gap-2">
        <Layers className="size-4 shrink-0 text-primary" aria-hidden="true" />
        <h3 className="font-heading text-base font-bold">{sheet.title}</h3>
        <Badge variant="secondary">
          {toArabicDigits(sheet.pendingCount)} مسار بانتظار المراجعة
        </Badge>
        <HelpTip>
          الكشف يُعتمد أو يُرفض دفعةً واحدة. الاعتماد يُدخل كل مسارات الدفعة محرك
          التسعير فوراً (ما دام حساب المتعهد معتمداً)، والرفض يعيدها كلها إلى المتعهد
          بملاحظتك نفسها.
        </HelpTip>
        <span className="text-sm">
          {sheet.companyId ? (
            <Link
              href={`/admin/subcontractors/${sheet.companyId}`}
              className="font-medium transition-colors hover:text-primary hover:underline"
            >
              {sheet.companyName}
            </Link>
          ) : (
            <span className="font-medium">{sheet.companyName}</span>
          )}
        </span>
      </div>

      {!sheet.companyApproved && (
        <p className="text-xs leading-5 text-amber-700 dark:text-amber-300">
          حساب هذا المتعهد ليس معتمداً — اعتماد الكشف وحده لا يُدخل أسعاره التسعير حتى
          يُعتمد حسابه من ملفه.
        </p>
      )}

      {truncated && (
        <p className="flex items-start gap-2 rounded-lg border border-destructive/40 bg-destructive/10 p-3 text-sm leading-6 text-destructive">
          <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
          <span>
            هذا الكشف يحمل <strong>{toArabicDigits(sheet.pendingCount)}</strong> مساراً
            بانتظار المراجعة، والمعروض منها هنا{" "}
            <strong>{toArabicDigits(shown)}</strong> فقط. القرار على دفعةٍ لا تراها كاملةً
            ممنوع، فلا زرّ اعتماد ولا رفض على هذه البطاقة — أعد تحميل الصفحة، وإن تكرّر
            فالكشف أكبر مما تعرضه شاشة واحدة وتُراجَع مساراته من ملف المتعهد.
          </span>
        </p>
      )}

      {sheet.note && (
        <p className="rounded-lg border border-border bg-muted/40 p-3 text-sm leading-relaxed">
          <span className="font-medium">ملاحظة المتعهد:</span> {sheet.note}
        </p>
      )}

      <div className="overflow-x-auto">
        <table className="w-full min-w-[40rem] text-sm">
          <thead>
            <tr className="border-b border-border text-xs text-muted-foreground">
              <th className="p-2 text-start font-medium">المسار</th>
              <th className="p-2 text-start font-medium">التغطية</th>
              <th className="p-2 text-start font-medium">الفئة</th>
              <th className="p-2 text-start font-medium">تكلفة المتعهد</th>
              <th className="p-2 text-start font-medium">
                <span className="inline-flex items-center gap-1.5">
                  سعر العميل
                  <HelpTip>
                    السعر للاتجاه الواحد إن كان هذا المتعهد أرخص تغطية للمسار. تُضاف عليه
                    لاحقاً معاملات الذهاب والعودة وساعات الانتظار وعمولة الذروة.
                  </HelpTip>
                </span>
              </th>
            </tr>
          </thead>
          <tbody>
            {lists.map((list) => {
              const items = (itemsByList.get(list.id) ?? [])
                .map((item) => ({ item, info: pricing.byClass.get(item.classSlug) ?? null }))
                .sort((a, b) => (a.info?.sort ?? 999) - (b.info?.sort ?? 999));

              if (items.length === 0) {
                return (
                  <tr key={list.id} className="border-b border-border last:border-0">
                    <td className="p-2 align-top font-medium">{list.title}</td>
                    <td className="p-2 align-top text-muted-foreground">
                      {list.originLabel} ← {list.destLabel}
                    </td>
                    <td className="p-2 align-top text-amber-700 dark:text-amber-300" colSpan={3}>
                      بلا أسعار — لا يغطي شيئاً حتى لو اعتُمد
                    </td>
                  </tr>
                );
              }

              return items.map(({ item, info }, idx) => {
                const preview =
                  item.cost === null
                    ? null
                    : customerPrice(item.cost, pricing.margin, info?.minPrice ?? null);
                return (
                  <tr
                    key={`${list.id}-${item.classSlug}`}
                    className="border-b border-border last:border-0"
                  >
                    {idx === 0 ? (
                      <>
                        <td className="p-2 align-top font-medium" rowSpan={items.length}>
                          {list.title}
                          {list.bidirectional && (
                            <Badge variant="outline" className="ms-1.5 text-[10px]">
                              الاتجاهان
                            </Badge>
                          )}
                        </td>
                        <td
                          className="p-2 align-top text-xs leading-5 text-muted-foreground"
                          rowSpan={items.length}
                        >
                          {list.originLabel} ({radiusText(list.originRadiusKm)})
                          <br />←{" "}
                          {list.destLabel} ({radiusText(list.destRadiusKm)})
                        </td>
                      </>
                    ) : null}
                    <td className="p-2 align-top">{info?.title ?? item.classSlug}</td>
                    <td className="p-2 align-top" dir="ltr">
                      {item.cost === null ? "—" : formatMoney(item.cost, pricing.currency)}
                    </td>
                    <td className="p-2 align-top">
                      <span dir="ltr" className="font-bold">
                        {preview === null ? "—" : formatMoney(preview.price, pricing.currency)}
                      </span>
                      {preview?.minApplied && (
                        <Badge variant="outline" className="ms-2">
                          أرضية الفئة
                        </Badge>
                      )}
                    </td>
                  </tr>
                );
              });
            })}
          </tbody>
        </table>
      </div>

      <Separator />

      {decidable ? (
        <div className="grid gap-4 md:grid-cols-2">
          <form
            action={reviewPriceSheet.bind(null, sheet.id, true, returnTo, shown)}
            className="space-y-2"
          >
            <Label htmlFor={`approve-sheet-${sheet.id}`} className="flex items-center gap-1.5">
              اعتماد الكشف كله
              <HelpTip>
                قرارٌ واحد يعتمد كل مسارات الدفعة المنتظرة — وهي بالضبط المعروضة في الجدول
                أعلاه، لا أكثر. الملاحظة اختيارية ويقرأها المتعهد على كل مسار.
              </HelpTip>
            </Label>
            <input
              id={`approve-sheet-${sheet.id}`}
              name="approve_note"
              className={controlClass}
              placeholder="ملاحظة اختيارية يقرأها المتعهد"
            />
            <Button type="submit" className="w-full">
              <CheckCircle2 />
              اعتماد {toArabicDigits(shown)} مسار
            </Button>
          </form>

          <form
            action={reviewPriceSheet.bind(null, sheet.id, false, returnTo, shown)}
            className="space-y-2"
          >
            <Label htmlFor={`reject-sheet-${sheet.id}`} className="flex items-center gap-1.5">
              رفض الكشف كله
              <HelpTip>
                الرفض يعيد كل مسارات الدفعة إلى المتعهد ليصحّحها ويرسلها من جديد. السبب
                إلزامي لأنه كل ما يملكه ليعرف المطلوب.
              </HelpTip>
            </Label>
            <input
              id={`reject-sheet-${sheet.id}`}
              name="reject_note"
              className={controlClass}
              placeholder="سبب الرفض — إلزامي"
              required
            />
            <Button type="submit" variant="destructive" className="w-full">
              <XCircle />
              رفض {toArabicDigits(shown)} مسار
            </Button>
          </form>
        </div>
      ) : (
        <p className="text-sm text-muted-foreground">
          {readOnly
            ? "الطابور للقراءة فقط حتى تُنفَّذ هجرات كشوف الأسعار."
            : "لا قرار على هذه البطاقة — راجع التنبيه أعلاه."}
        </p>
      )}
    </Card>
  );
}
