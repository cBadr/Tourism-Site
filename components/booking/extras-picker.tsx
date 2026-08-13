"use client";

import * as React from "react";
import { Minus, Plus } from "lucide-react";
import { cn } from "@/lib/utils";
import type { Tx } from "@/components/site/i18n";
import type { LocaleFormatter } from "./format";
import type { PublicExtra } from "./extras";

/**
 * قائمة الخدمات الإضافية في ويدجت البحث — **بديل حقل ساعات الانتظار** الذي
 * حُذف في الدفعة ٣ (ملاحظة المالك ٧).
 *
 * ثلاث قواعد تحكم هذا المكوّن:
 *
 * (١) **ما يُرسَل رمزٌ وكمية فقط.** السعر المعروض هنا يأتي من `public_extras()`
 *     ولا يُعاد إرساله أبداً — `price_extras` في القاعدة تقرأ السعر بنفسها من
 *     الكتالوج (D-09 حرفياً). ولا ضرب ولا جمع في هذا الملف: لا يوجد فيه سطر
 *     يضرب سعراً في كمية، لأن `line_total` تحسبه SQL وتعيده مع عرض السعر.
 *
 * (٢) **`maxQty` مرآة لا حارس.** القصّ الحقيقي `least(qty, max_qty)` في
 *     `price_extras`؛ تعطيل زر «+» هنا راحةُ استعمال. من يتجاوزه بحمولة مصنوعة
 *     يدوياً تقصّه القاعدة ولا يدفع أقل.
 *
 * (٣) **الكتالوج الفارغ لا يعرض شيئاً.** لا عنوان، ولا صندوق، ولا سطر «لا توجد
 *     خدمات». المالك لم يُضف خدمات بعد (الجدول بلا بذرة بقرار) — وشاشةٌ تعلن عن
 *     ميزة فارغة أسوأ من غيابها.
 */

export type ExtrasPickerProps = {
  extras: PublicExtra[];
  /** الكميات المختارة بالرمز — الغائب يعني صفراً */
  quantities: Record<string, number>;
  onChange: (slug: string, qty: number) => void;
  idPrefix: string;
  t: Tx;
  fmt: LocaleFormatter;
  disabled?: boolean;
};

export function ExtrasPicker({
  extras,
  quantities,
  onChange,
  idPrefix,
  t,
  fmt,
  disabled = false,
}: ExtrasPickerProps) {
  if (extras.length === 0) return null;

  return (
    <ul className="flex flex-col gap-2.5">
      {extras.map((extra) => {
        const qty = quantities[extra.slug] ?? 0;
        const labelId = `${idPrefix}-${extra.slug}-label`;
        const selected = qty > 0;

        return (
          <li
            key={extra.slug}
            className={cn(
              "flex flex-wrap items-center justify-between gap-x-4 gap-y-2 rounded-2xl border px-3.5 py-3 transition-colors",
              selected ? "border-primary/45 bg-primary/5" : "border-input bg-background"
            )}
          >
            <div className="flex min-w-0 flex-1 flex-col gap-0.5">
              <span id={labelId} className="text-sm font-semibold leading-6">
                {extra.title}
              </span>
              {extra.description ? (
                <span className="text-xs leading-5 text-muted-foreground">
                  {extra.description}
                </span>
              ) : null}
              <span className="text-xs font-medium leading-5 text-primary">
                {t("services.unitPrice", "{price} للوحدة", {
                  price: fmt.money(extra.price, "EGP"),
                })}
              </span>
            </div>

            <div
              className="flex shrink-0 items-center gap-1 rounded-xl border border-input bg-background p-1"
              role="group"
              aria-labelledby={labelId}
            >
              <button
                type="button"
                onClick={() => onChange(extra.slug, Math.max(0, qty - 1))}
                disabled={disabled || qty <= 0}
                aria-label={t("services.decrease", "إنقاص كمية {title}", { title: extra.title })}
                className="grid size-8 place-items-center rounded-lg text-foreground transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50 disabled:pointer-events-none disabled:opacity-40"
              >
                <Minus className="size-4" aria-hidden="true" />
              </button>

              <span
                className="min-w-8 text-center text-base font-semibold tabular-nums"
                aria-live="polite"
              >
                {fmt.digits(qty)}
              </span>

              <button
                type="button"
                onClick={() => onChange(extra.slug, Math.min(extra.maxQty, qty + 1))}
                disabled={disabled || qty >= extra.maxQty}
                aria-label={t("services.increase", "زيادة كمية {title}", { title: extra.title })}
                className="grid size-8 place-items-center rounded-lg text-foreground transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50 disabled:pointer-events-none disabled:opacity-40"
              >
                <Plus className="size-4" aria-hidden="true" />
              </button>
            </div>

            {qty >= extra.maxQty ? (
              <p className="basis-full text-xs leading-5 text-muted-foreground">
                {t("services.maxReached", "أقصى كمية لهذه الخدمة في الحجز الواحد: {max}.", {
                  max: fmt.digits(extra.maxQty),
                })}
              </p>
            ) : null}
          </li>
        );
      })}
    </ul>
  );
}
