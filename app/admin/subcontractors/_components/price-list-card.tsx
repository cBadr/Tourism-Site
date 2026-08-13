import Link from "next/link";
import { ArrowLeftRight, CheckCircle2, MapPin, XCircle } from "lucide-react";

import { formatMoney, toArabicDigits } from "@/components/booking/format";
import { HelpTip } from "@/components/shared/HelpTip";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { controlClass, dateTimeLabel, relativeTime } from "../../orders/_components/booking-ui";
import { reviewPriceList } from "../actions";
import type { PricingContext } from "./pricing-context";
import {
  customerPrice,
  ListStatusBadge,
  LIST_STATUS_HINTS,
  isListStatus,
  radiusText,
  type PriceItemView,
  type PriceListView,
} from "./subcontractor-ui";

/**
 * بطاقة قائمة أسعار — تُستعمل في طابور المراجعة وفي ملف المتعهد بلا اختلاف،
 * حتى يرى المدير الشيء نفسه من أي باب دخل.
 *
 * جوهر البطاقة: بجوار **تكلفة المتعهد** يظهر **سعر العميل** الناتج عنها بالهامش
 * الحالي. بدون هذا العمود يعتمد المدير رقماً لا يعرف أثره على السعر المعروض.
 * الأرقام معاينة عرض؛ الرقم الملزم يحسبه `quote_price` في Postgres لحظة التسعير.
 */

function Coordinates({ lat, lng }: { lat: number | null; lng: number | null }) {
  if (lat === null || lng === null) return null;
  return (
    <span dir="ltr" className="text-[11px] text-muted-foreground">
      {lat.toFixed(4)}, {lng.toFixed(4)}
    </span>
  );
}

function Endpoint({
  role,
  label,
  lat,
  lng,
  radiusKm,
}: {
  role: string;
  label: string;
  lat: number | null;
  lng: number | null;
  radiusKm: number | null;
}) {
  return (
    <div className="min-w-40 flex-1 space-y-0.5">
      <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
        <MapPin className="size-3.5 text-primary" />
        {role}
      </div>
      <p className="text-sm font-medium">{label}</p>
      <p className="text-xs text-muted-foreground">النطاق: {radiusText(radiusKm)}</p>
      <Coordinates lat={lat} lng={lng} />
    </div>
  );
}

export function PriceListCard({
  list,
  items,
  pricing,
  returnTo,
  readOnly,
  companyName,
  companyHref,
}: {
  list: PriceListView;
  items: PriceItemView[];
  pricing: PricingContext;
  /** وجهة العودة بعد المراجعة — تُمرَّر مربوطة من الخادم وتُنقّى داخل الإجراء */
  returnTo: string;
  readOnly: boolean;
  companyName?: string;
  companyHref?: string;
}) {
  const priced = items
    .map((item) => ({ item, info: pricing.byClass.get(item.classSlug) ?? null }))
    .sort((a, b) => (a.info?.sort ?? 999) - (b.info?.sort ?? 999));

  const pricedSlugs = new Set(items.map((i) => i.classSlug));
  const missing = pricing.classes.filter((c) => c.active && !pricedSlugs.has(c.slug));

  const reviewable = list.status === "pending";

  return (
    <Card className="space-y-4 p-5">
      <div className="flex flex-wrap items-center gap-2">
        <h3 className="font-heading text-base font-bold">{list.title}</h3>
        <ListStatusBadge status={list.status} />
        {isListStatus(list.status) ? <HelpTip>{LIST_STATUS_HINTS[list.status]}</HelpTip> : null}
        {list.bidirectional && (
          <Badge variant="secondary" className="gap-1">
            <ArrowLeftRight className="size-3" />
            ثنائية الاتجاه
          </Badge>
        )}
        {companyName && (
          <span className="text-sm">
            {companyHref ? (
              <Link
                href={companyHref}
                className="font-medium transition-colors hover:text-primary hover:underline"
              >
                {companyName}
              </Link>
            ) : (
              <span className="font-medium">{companyName}</span>
            )}
          </span>
        )}
        <span className="ms-auto text-xs text-muted-foreground">
          {relativeTime(list.createdAt)} · {dateTimeLabel(list.createdAt)}
        </span>
      </div>

      {/* التغطية الجغرافية — نقطتان ولكل نقطة نطاق «في كافة الاتجاهات» */}
      <div className="flex flex-wrap items-start gap-4 rounded-lg border border-border p-3">
        <Endpoint
          role="نقطة البداية"
          label={list.originLabel}
          lat={list.originLat}
          lng={list.originLng}
          radiusKm={list.originRadiusKm}
        />
        <div className="flex items-center gap-1.5 self-center text-xs text-muted-foreground">
          {list.bidirectional ? <ArrowLeftRight className="size-4" /> : <span>←</span>}
          <HelpTip>
            الرحلة مغطاة بهذه القائمة حين تقع نقطة انطلاقها داخل نطاق البداية ونقطة وصولها
            داخل نطاق النهاية. القائمة ثنائية الاتجاه تغطي الاتجاه المعاكس أيضاً.
          </HelpTip>
        </div>
        <Endpoint
          role="نقطة النهاية"
          label={list.destLabel}
          lat={list.destLat}
          lng={list.destLng}
          radiusKm={list.destRadiusKm}
        />
      </div>

      {/* التكلفة مقابل سعر العميل — عمود السعر هو سبب وجود هذه الشاشة */}
      {priced.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          لا توجد أسعار فئات في هذه القائمة بعد — لا تغطي أي رحلة حتى يضيف المتعهد سعراً
          واحداً على الأقل.
        </p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[34rem] text-sm">
            <thead>
              <tr className="border-b border-border text-xs text-muted-foreground">
                <th className="p-2 text-start font-medium">الفئة</th>
                <th className="p-2 text-start font-medium">تكلفة المتعهد</th>
                <th className="p-2 text-start font-medium">
                  <span className="inline-flex items-center gap-1.5">
                    الهامش
                    <HelpTip>
                      الفرق بين ما تدفعه للمتعهد وما يدفعه العميل، بحسب إعدادات الهامش
                      الحالية. تغيير الإعدادات يغيّر هذا العمود لكل القوائم فوراً.
                    </HelpTip>
                  </span>
                </th>
                <th className="p-2 text-start font-medium">
                  <span className="inline-flex items-center gap-1.5">
                    سعر العميل
                    <HelpTip>
                      السعر الذي سيراه العميل للاتجاه الواحد إن كان هذا المتعهد هو الأرخص
                      تغطيةً للمسار. تُضاف عليه لاحقاً — عند تسعير رحلة بعينها — معاملات
                      الذهاب والعودة وساعات الانتظار وعمولة الذروة.
                    </HelpTip>
                  </span>
                </th>
              </tr>
            </thead>
            <tbody>
              {priced.map(({ item, info }) => {
                const cost = item.cost;
                const preview =
                  cost === null
                    ? null
                    : customerPrice(cost, pricing.margin, info?.minPrice ?? null);
                return (
                  <tr
                    key={item.classSlug}
                    className="border-b border-border last:border-0"
                  >
                    <td className="p-2 align-top">
                      <span className="font-medium">{info?.title ?? item.classSlug}</span>
                      {info && info.capacity !== null && (
                        <span className="ms-1.5 text-xs text-muted-foreground">
                          حتى {toArabicDigits(info.capacity)} ركاب
                        </span>
                      )}
                      {!info && (
                        <span className="ms-1.5 text-xs text-amber-700 dark:text-amber-300">
                          فئة غير معروفة
                        </span>
                      )}
                    </td>
                    <td className="p-2 align-top" dir="ltr">
                      {cost === null ? "—" : formatMoney(cost, pricing.currency)}
                    </td>
                    <td className="p-2 align-top text-muted-foreground" dir="ltr">
                      {preview === null ? "—" : formatMoney(preview.marginAmount, pricing.currency)}
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
              })}
            </tbody>
          </table>
        </div>
      )}

      {missing.length > 0 && (
        <p className="text-xs text-muted-foreground">
          بلا سعر في هذه القائمة: {missing.map((c) => c.title).join(" · ")} — الرحلات التي
          تحتاج هذه الفئات تُسعَّر بتعريفة الكيلومتر حتى لو كان المسار مغطى.
        </p>
      )}

      {list.reviewNote && (
        <p className="rounded-lg border border-border bg-muted/40 p-3 text-sm leading-relaxed">
          <span className="font-medium">ملاحظة المراجعة:</span> {list.reviewNote}
        </p>
      )}

      {reviewable && (
        <>
          <Separator />
          <div className="grid gap-4 md:grid-cols-2">
            <form
              action={readOnly ? undefined : reviewPriceList.bind(null, list.id, true, returnTo)}
              className="space-y-2"
            >
              <Label htmlFor={`approve-${list.id}`} className="flex items-center gap-1.5">
                اعتماد القائمة
                <HelpTip>
                  بالاعتماد تدخل هذه الأسعار محرك التسعير فوراً (ما دام حساب المتعهد
                  معتمداً). الملاحظة اختيارية ويقرأها المتعهد.
                </HelpTip>
              </Label>
              <input
                id={`approve-${list.id}`}
                name="approve_note"
                className={controlClass}
                placeholder="ملاحظة اختيارية يقرأها المتعهد"
                disabled={readOnly}
              />
              <Button type="submit" className="w-full" disabled={readOnly}>
                <CheckCircle2 />
                اعتماد القائمة
              </Button>
            </form>

            <form
              action={readOnly ? undefined : reviewPriceList.bind(null, list.id, false, returnTo)}
              className="space-y-2"
            >
              <Label htmlFor={`reject-${list.id}`} className="flex items-center gap-1.5">
                رفض القائمة
                <HelpTip>
                  الرفض يعيدها إلى المتعهد ليعدّلها ويرسلها من جديد. السبب إلزامي لأنه كل ما
                  يملكه المتعهد ليعرف ما المطلوب تصحيحه.
                </HelpTip>
              </Label>
              <input
                id={`reject-${list.id}`}
                name="reject_note"
                className={controlClass}
                placeholder="سبب الرفض — إلزامي"
                required
                disabled={readOnly}
              />
              <Button type="submit" variant="destructive" className="w-full" disabled={readOnly}>
                <XCircle />
                رفض القائمة
              </Button>
            </form>
          </div>
        </>
      )}
    </Card>
  );
}
