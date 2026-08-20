"use client";

import * as React from "react";
import { Check, Minus, Plus } from "lucide-react";
import { cn } from "@/lib/utils";
import { HelpTip } from "@/components/shared/HelpTip";
import type { Tx } from "@/components/site/i18n";
import type { LocaleFormatter } from "./format";
import type { PublicExtra } from "./extras";

/**
 * الخدمات الإضافية في ويدجت البحث — **مربّعاتٌ قابلة للنقر** لا بطاقاتٌ مرصوفة.
 *
 * ══════════════════════════════════════════════════════════════════════════
 *  🔴 شكوى المالك المقيسة (2026-08-17) — والحجمُ هو العطل لا الغياب
 * ══════════════════════════════════════════════════════════════════════════
 *
 * > «الخدمات الإضافية موجودة، لكنها تُعرض بحجمٍ كبير فتخنق المكان ولا تتّسع
 * >  لمزيد. المطلوب: مربّعاتٌ قابلة للنقر تُضاف وتُلغى بلمسة، تتوسّع بعدد
 * >  الخدمات، وظهورها خفيف لا يُثقل الإدخال ولا يعطّل رحلة العميل.»
 *
 * **والقياس على الصفحة الحيّة قبل التغيير:** بطاقةُ خدمةٍ **واحدة** ‏٧٩٠×١٢٢
 * بكسل، وكتلةُ الخدمات كلها (الزرّ + اللوحة + سطر الشرح) ‏١٩٨ بكسل — **لخدمةٍ
 * واحدة**. وعشرُ خدماتٍ غداً تعني ١٢٠٠ بكسل من نموذجٍ نحاول تقصيره، أي أن
 * الشكل القديم **لا يتوسّع**: هو يتكاثر رأسياً.
 *
 * ── ولماذا الشكل مربّعاتٌ بالذات ────────────────────────────────────────────
 * الخدمة الإضافية **قرارٌ ثانوي**: من يريدها ينقر، ومن لا يريدها لا يجوز أن
 * يقرأها عبئاً. والمربّع يعطي الثلاثة معاً — **لمسةٌ واحدة** للإضافة والإلغاء،
 * و**التفافٌ أفقي** (`flex-wrap`) ينمو في العرض قبل الطول فيتوسّع بعدد الخدمات،
 * و**سطرٌ أو سطران** بدل بطاقةٍ لكل خدمة.
 *
 * ── والوصفُ لم يُحذف بل انتقل إلى «؟» ───────────────────────────────────────
 * اتفاقية ٥ في `CONVENTIONS.md`: أيقونة «؟» بجوار كل خيار لا يشرح نفسه. وهي
 * الموضع الطبيعي لوصفٍ يُقرأ **مرةً عند القرار** لا في كل تصييرة — ونسخةٌ
 * واحدة لا نسختان (التعليل عند موضعها أدناه).
 *
 * ── ثلاث قواعد لم تتغيّر بحرف ───────────────────────────────────────────────
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
 *
 * ⚠ **وسطرُ «أقصى كمية» المستقل زال، ولم تزل معلومته:** كان يُصيَّر بعرض
 *   البطاقة كاملاً فيضيف سطراً رابعاً لخدمةٍ واحدة. وصار الحدُّ مكتوباً **داخل**
 *   العدّاد (`٣/٣`) وزرُّ «+» معطَّلاً عنده — أي المعلومة نفسها في موضع القرار
 *   بلا سطر. ولا يظهر العدّاد أصلاً لخدمةٍ `maxQty = 1` (وهي حال كل خدمةٍ حيّة
 *   اليوم): المربّع وحده يُضيف ويُلغي.
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
    <ul className="flex flex-wrap gap-2">
      {extras.map((extra) => {
        const qty = quantities[extra.slug] ?? 0;
        const selected = qty > 0;
        /** عدّادٌ داخل المربّع **حين تسمح الخدمة بأكثر من واحدة وحدها** */
        const stepped = selected && extra.maxQty > 1;
        const hasHelp = Boolean(extra.description);
        const labelId = `${idPrefix}-${extra.slug}-label`;

        return (
          <li
            key={extra.slug}
            className={cn(
              "inline-flex items-center rounded-full border transition-colors",
              selected
                ? "border-primary/60 bg-primary/10"
                : "border-input bg-background hover:bg-muted/60"
            )}
          >
            {/*
              المربّع نفسه **مفتاحُ ضغطٍ واحد**: `aria-pressed` يجعل حالتَي
              «مضاف» و«غير مضاف» مسموعتين بلا نصَّين مختلفين للزر — والاسم
              المنطوق هو ما يقرؤه المبصر حرفياً (الخدمة وسعرها).

              ⚠ ولا زرَّ داخل زرّ: الغلاف `<li>` هو ما يحمل شكل المربّع،
              فيبقى العدّاد أخاً للمفتاح لا ابناً له (تعشيقُ الأزرار HTML غير
              صالح، والمتصفح يفكّه فيضيع النقر).
            */}
            <button
              type="button"
              onClick={() => onChange(extra.slug, selected ? 0 : 1)}
              disabled={disabled}
              aria-pressed={selected}
              className={cn(
                // 🔴 `min-h-11` لا `min-h-10`: أربعون بكسلاً دون معيار الأربعة
                //    والأربعين، وقد رسب هذا المفتاح بعينه في PageSpeed 2026-08-20.
                //    والزيادةُ أربعةُ بكسلات لا تُغيّر تخطيطاً — المربّعُ يحمل
                //    ارتفاعَه من محتواه، والرقاقةُ كانت تكفي ٤٠ بمحض المصادفة.
                "inline-flex min-h-11 items-center gap-2 rounded-full ps-3 text-sm transition-colors",
                "focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50",
                "disabled:pointer-events-none disabled:opacity-50",
                // ما يلي المفتاح داخل المربّع يحمل تباعدَه، فلا يُضاعَف الهامش
                hasHelp || stepped ? "pe-2" : "pe-3.5"
              )}
            >
              {selected ? (
                <Check className="size-4 shrink-0 text-primary" aria-hidden="true" />
              ) : (
                <Plus className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
              )}
              <span id={labelId} className="font-medium leading-none">
                {extra.title}
              </span>
              <span
                className={cn(
                  "text-xs leading-none",
                  selected ? "text-primary" : "text-muted-foreground"
                )}
              >
                {fmt.money(extra.price, "EGP")}
              </span>
            </button>

            {hasHelp ? (
              /*
                الوصف في «؟» وحدها — اتفاقية ٥، و**نسخةٌ واحدة لا نسختان**.
                كانت هنا نسخةٌ `sr-only` مربوطةٌ بالمفتاح بـ`aria-describedby`،
                فكان قارئ الشاشة يسمع الوصف على المربّع **ثم يسمعه ثانيةً** على
                زرّ المساعدة بعده — نصٌّ واحد مرّتين لا معلومةٌ إضافية. والتلميح
                يظهر بالتحويم **وبتركيز لوحة المفاتيح** (`group-focus-within`)،
                فهو مبلوغٌ بالـTab لا بالفأرة وحدها.
              */
              <span className={cn("shrink-0", stepped ? "me-1" : "me-3")}>
                <HelpTip>{extra.description}</HelpTip>
              </span>
            ) : null}

            {stepped ? (
              /*
                عدّادٌ مضغوط داخل المربّع — **ولا يظهر إلا لخدمةٍ سقفُها أكبر من
                واحدة وقد أُضيفت فعلاً**. فمن أضاف واحدةً ثم أراد إلغاءها ينقر
                المربّع (لمسةٌ واحدة كما طلب المالك)، ومن أراد اثنتين يجد «+».
              */
              <span
                role="group"
                aria-labelledby={labelId}
                className="me-1 flex shrink-0 items-center gap-0.5 rounded-full bg-background/70 p-0.5"
              >
                <button
                  type="button"
                  onClick={() => onChange(extra.slug, Math.max(0, qty - 1))}
                  disabled={disabled}
                  aria-label={t("services.decrease", "إنقاص كمية {title}", {
                    title: extra.title,
                  })}
                  className="grid size-7 place-items-center rounded-full text-foreground transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50 disabled:pointer-events-none disabled:opacity-40"
                >
                  <Minus className="size-3.5" aria-hidden="true" />
                </button>

                <span
                  className="min-w-5 text-center text-sm font-semibold tabular-nums"
                  aria-live="polite"
                >
                  {fmt.digits(qty)}
                  {/* الحدُّ يُقال عند القرار لا في سطرٍ مستقل — انظر الترويسة */}
                  {qty >= extra.maxQty ? (
                    <span className="text-xs font-normal text-muted-foreground">
                      {`/${fmt.digits(extra.maxQty)}`}
                    </span>
                  ) : null}
                </span>

                <button
                  type="button"
                  onClick={() => onChange(extra.slug, Math.min(extra.maxQty, qty + 1))}
                  disabled={disabled || qty >= extra.maxQty}
                  aria-label={t("services.increase", "زيادة كمية {title}", {
                    title: extra.title,
                  })}
                  className="grid size-7 place-items-center rounded-full text-foreground transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50 disabled:pointer-events-none disabled:opacity-40"
                >
                  <Plus className="size-3.5" aria-hidden="true" />
                </button>
              </span>
            ) : null}
          </li>
        );
      })}
    </ul>
  );
}
