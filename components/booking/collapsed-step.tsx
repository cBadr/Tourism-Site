"use client";

import * as React from "react";
import { Check } from "lucide-react";

/**
 * ╔══════════════════════════════════════════════════════════════════════════╗
 * ║  الخطوة المنتهية سطرٌ واحد — **بقيمها الفعلية لا بعلامة صح**             ║
 * ╚══════════════════════════════════════════════════════════════════════════╝
 *
 * ── الشكوى المقيسة (المالك على الجوال، 2026-08-17) ─────────────────────────
 *
 * > «الخطوات المكتملة تبقى مفتوحة، فالنموذج يصير هائلاً في آخره.»
 *
 * واختار العلاج بنفسه: **طيّ كل خطوة منتهية إلى سطر ملخّص**.
 *
 * ── 🔴 والتفصيل الذي يقرّر نجاح الفكرة كلها ────────────────────────────────
 *
 * السطر يعرض **ما أدخله العميل**، لا «الخطوة ١ ✓». ونصُّ المالك حرفياً: سطرٌ
 * يقول «مكتملة» يُجبر العميل على فتح الخطوة ليرى ما كتبه — أي دفعنا ثمن الطيّ
 * ولم نقبض مقابله. وسطرٌ يقول «مطار القاهرة ← الغردقة · ٤ ركاب · حقيبتان»
 * يُغني عن الفتح أصلاً.
 *
 * ── الوصول: كيف يفرّق قارئ الشاشة مطويّاً من مفتوح ─────────────────────────
 *
 * الصفّ **زرٌّ واحد** يحمل `aria-expanded={false}`، والقيم داخل اسمه المنطوق
 * عمداً — فيسمعها من لا يراها. والخطوة المفتوحة عنوانٌ ساكن تليه حقولها، فلا
 * التباس بين الحالتين.
 *
 * ⚠ **ولا `aria-controls`:** اللوحة لا توجد في DOM حين تكون الخطوة مطويّة،
 *   ومرجعٌ إلى معرّفٍ غير موجود أسوأ من غيابه.
 *
 * 🔒 **والتركيز لا يُترك في لوحةٍ تُطوى** — وهو الدرس المدفوع في أكورديون
 *   التذييل: من ضغط «تعديل» يختفي زرّه من الشجرة، فيقذف المتصفح التركيز إلى
 *   `<body>` ويستأنف صاحبُ لوحة المفاتيح من أول الصفحة. **والمعالجة على
 *   المستدعي**: ينقل التركيز صراحةً إلى ما فتحه (‏`checkout.tsx` و
 *   `search-widget.tsx` كلاهما يفعل ذلك بعد تغيير الحالة).
 *
 * ── ومستهلكه صار واحداً (2026-08-17، ملاحظة المالك ٥) ─────────────────────
 *
 * كان مشتركاً بين سطحين: خطوة بيانات الرحلة في الحاسبة، وخطوات إتمام الحجز.
 * ثم أمر المالك أن تصير خطوات الإتمام **شريطاً واحداً قابلاً للنقر** (‏`StepsBar`
 * في `checkout/checkout.tsx`) لأنها كانت **ثلاثة صناديق مرصوفة**، فبقي هذا
 * المكوّن لصاحبه الأول: `search-widget.tsx`.
 *
 * ⚠ **وليس هذا شكلين لشيء واحد**، وهو ما كان يخشاه التعليق القديم: سطر الحاسبة
 *   **يغيب** لحظة يُفتح مسار الحجز (‏`tripCollapsed && !checkoutOpen` هناك)،
 *   فالشكلان لا يجتمعان في شاشةٍ واحدة أبداً. والفرق مبرَّر: هنا خطوةٌ واحدة
 *   منتهية، وهناك ثلاثٌ يجب أن يُقرأ ترتيبها وموضعُ العميل فيها.
 */
export function CollapsedStep({
  title,
  parts,
  editLabel,
  doneLabel,
  onEdit,
  disabled = false,
}: {
  /** اسم الخطوة — «بيانات الرحلة» · «بياناتك» · «الدفع» */
  title: string;
  /** القيم كما أدخلها العميل — عقدةٌ لكل قيمة (الهاتف يحتاج `bdi`) */
  parts: React.ReactNode[];
  editLabel: string;
  /** يُنطق لقارئ الشاشة وحده — البصر يقرأ العلامة */
  doneLabel: string;
  onEdit: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onEdit}
      disabled={disabled}
      aria-expanded={false}
      className="flex w-full items-start gap-3 rounded-2xl border border-border bg-muted/40 px-4 py-3 text-start transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50 disabled:pointer-events-none disabled:opacity-60"
    >
      <span className="mt-0.5 grid size-5 shrink-0 place-items-center rounded-full bg-primary/15 text-primary">
        <Check className="size-3.5" aria-hidden="true" />
      </span>

      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
        {/*
          «تعديل» في صفّ العنوان لا في صفّ القيم — **وهو قرار عرضٍ مقيس**:
          وضعُه بجوار القيم يقتطع من عرضها نحو ٧٠ بكسل على ٣٧٥، فتُقصّ الحقائب
          ونوع الرحلة عند حدّ السطرين. والعنوان سطرٌ قصير يتسع له بلا ثمن.
        */}
        <span className="flex items-baseline justify-between gap-3 text-xs font-medium text-muted-foreground">
          <span className="min-w-0 truncate">
            {title}
            <span className="sr-only"> — {doneLabel}</span>
          </span>
          <span className="shrink-0 text-sm font-semibold text-primary">{editLabel}</span>
        </span>
        {/*
          سطران على الأكثر — **حدُّ ارتفاعٍ لا حذفُ قيمة**.

          وسببه مقيس: وسمُ Nominatim لنقطة الانطلاق يبلغ خمسين حرفاً («مطار
          القاهرة الدولى، شارع محمود عصمت حمدى، بلوك 1228»)، فيلتفّ الصفّ إلى
          أربعة أسطر على ٣٧٥ بكسل — أي ١٤٠ بكسل لسطرٍ وُلد ليختصر الارتفاع.
          والقيمة كاملةً على بعد نقرة «تعديل»، وبطاقة الملخّص تحته تحمل المسار
          كاملاً على الشاشتين اللتين يظهر فيهما.
        */}
        <span className="line-clamp-2 text-sm font-medium leading-6 text-foreground">
          {parts.map((part, index) => (
            <React.Fragment key={index}>
              {index > 0 ? <span className="text-muted-foreground"> · </span> : null}
              {part}
            </React.Fragment>
          ))}
        </span>
      </span>
    </button>
  );
}
