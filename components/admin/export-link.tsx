import type { ReactNode } from "react";
import { Download } from "lucide-react";

import { HelpTip } from "@/components/shared/HelpTip";
import { buttonVariants } from "@/components/ui/button";
import { type ExportKind, PRINT_HIDDEN_CLASS } from "@/lib/export-types";
import { cn } from "@/lib/utils";

/**
 * رابط تنزيل ملف تصدير — المنادي الذي كان غائباً عن سطح التصدير كله.
 *
 * المسار `/api/admin/export/[kind]` مبنيّ ومحروس ومختبَر، ولم يكن يناديه شيء في
 * المستودع: أربعة ملفات لا يخرج منها المالك واحداً إلا بكتابة الرابط بيده. وهذا
 * النمط ٣ في `handover/LESSONS.md` حرفياً — «الصفحة بلا مسار = لم تُبنَ»، ويسري
 * على المسار بلا زر كما يسري على الصفحة بلا رابط.
 *
 * ── لماذا رابط عارٍ لا زر ولا جزيرة عميلة ────────────────────────────────────
 * التنزيل فعل المتصفح لا فعلنا: الردّ يحمل `Content-Disposition: attachment`
 * واسمَي ملف (لاتيني وعربي)، فـ`<a href download>` يكفي وحده ويعمل بلا جافاسكربت
 * كما يعمل زر الطباعة بلا جافاسكربت. وأي `onClick` هنا كان سيضيف جزيرة عميلة
 * ثانية إلى واجهةٍ عهدُها أن تكون خادمية (‏`CONVENTIONS.md` ٩) مقابل صفر فائدة.
 *
 * ── لماذا نوع مُميَّز لا `Record<string, string>` ───────────────────────────
 * أسماء الوسائط عقدٌ مع `app/api/admin/export/[kind]/route.ts` حرفاً بحرف،
 * **وخطأ الاسم فيها لا يُسقط الملف بل يُسقط الترشيح صامتاً**: `acount` بدل
 * `account` تُخرج دفتر كل الحسابات في ملفٍ يظنه المالك كشف الحساب المعروض على
 * شاشته. وهذا بعينه صنف العيب الذي تحذّر منه القاعدة ١٣ في `handover/INDEX.md`
 * (خريطة أسماء تُكتب من الذاكرة ثم تفشل صامتة). فالنوع أدناه يجعل الاسم الخاطئ
 * — والوسيط الذي لا يقبله نوعه — يسقط عند `npx tsc` لا عند فتح ملفٍ مضلِّل.
 *
 * ⚠ **ومكانه هنا لا في `lib/export-types.ts`** — العقد ملفٌ مقفول في هذه المهمة،
 * ونقلُ هذا النوع إليه ليضمّ العقد وسائطه كما يضمّ أعمدته الممنوعة **بندٌ مُدرَج
 * في تقرير المهمة** لا تعديلٌ يُدسّ في نطاق غيره.
 *
 * ── والفترة تُمرَّر صريحة دائماً ─────────────────────────────────────────────
 * الشاشات تختصر النطاق بمفتاح (`?range=month`) والمسار **لا يقبله** بنصّ ترويسته:
 * الملف يُفتح بعد شهر و«هذا الشهر» يكون حينها شهراً آخر. فكل منادٍ يمرّر
 * `range.from` و`range.to` اللتين حسبتهما `resolveRange` للشاشة نفسها — مصدرٌ
 * واحد للفترة، فلا يختلف الملف عن الورقة المطبوعة بجواره.
 */

type Target<K extends ExportKind, P> = { kind: K } & P;

/**
 * وجهة تصدير واحدة — الوسائط بأسمائها كما يقرؤها المسار بالضبط.
 *
 * و`null` مقبولة في الاختياري عمداً: الشاشات تحمل «لا ترشيح» بـ`null` لا
 * بـ`undefined` (‏`categoryFilter` و`accountId` و`tab.status`)، وإلزامها
 * بالتحويل عند كل نداء يزرع `?? undefined` في أربعة مواضع بلا فائدة.
 */
export type ExportTarget =
  /** كشف حساب متعهد — معرّف المتعهد **إلزامي** ويرفض المسار غير UUID بـ٤٠٠ */
  | Target<"partner-statement", { subcontractor: string; from?: string; to?: string }>
  /** قيود الدفتر — `account` فارغاً تعني كل الحسابات */
  | Target<"ledger", { from?: string; to?: string; account?: string | null }>
  /** المصروفات — `category` تقبل UUID أو «none» للمصروفات بلا فئة */
  | Target<"expenses", { from?: string; to?: string; category?: string | null }>
  /** الحجوزات — `status` إحدى حالات الحجز، وفارغةً تعني كل الحالات */
  | Target<"bookings", { from?: string; to?: string; status?: string | null }>;

/**
 * الرابط من الوجهة. الخانة الفارغة **تُحذف ولا تُكتب فارغة**: المسار يعامل
 * `?account=` معاملة الغياب فعلاً، لكن رابطاً يحمل وسائط فارغة يُنسخ ويُلصق
 * ويُقرأ لاحقاً على أنه ترشيح وقع.
 */
function exportHref(target: ExportTarget): string {
  const { kind, ...rest } = target;
  const qs = new URLSearchParams();
  for (const [name, value] of Object.entries(rest)) {
    if (typeof value === "string" && value.trim() !== "") qs.set(name, value.trim());
  }
  const query = qs.toString();
  return `/api/admin/export/${kind}${query ? `?${query}` : ""}`;
}

export function ExportLink({
  target,
  label,
  help,
}: {
  target: ExportTarget;
  /** ماذا يخرج بالضبط — «تصدير كشف الحساب (CSV)» لا «تصدير» */
  label: string;
  /**
   * حدود الملف مقابل الشاشة: ما لا يتبع مرشِّحها، وما لا يخرج فيه أصلاً.
   *
   * وهو **الحقل الأهم في هذا المكوّن**: الملف يسافر ويُفتح بعد شهر بلا الشاشة
   * التي أنتجته، فما لم يُقل هنا لن يُقال في أي مكان يقرؤه المالك قبل أن يبني
   * على الملف قراراً. والذيل داخل الملف يقول الشيء نفسه لمن يفتحه لاحقاً.
   */
  help?: ReactNode;
}) {
  return (
    // `PRINT_HIDDEN_CLASS` على الغلاف وحده: يحجب الرابط وأيقونة «؟» معاً، وصنفٌ
    // ثانٍ على الرابط بنفس المعنى هو الازدواج الذي يجعل أحدهما يُنسى يوماً.
    // والعقد يسمّي هذا الصنف صراحةً — فيُقرأ من هناك لا يُكتب نصاً هنا (‏D-04
    // في روحه: قيمة متعاقد عليها لها مصدر واحد).
    <span className={cn(PRINT_HIDDEN_CLASS, "inline-flex items-center gap-1.5")}>
      <a
        href={exportHref(target)}
        /*
          `download` بلا قيمة: الاسم يأتي من `Content-Disposition` الذي يكتبه
          المسار (لاتيني آمن + عربي بترميز RFC 5987)، وكتابة اسم هنا كانت
          ستتفوّق عليه فيضيع اسم الفترة والمتعهد من الملف المحفوظ.
        */
        download
        className={buttonVariants({ variant: "outline", size: "sm" })}
      >
        <Download />
        {label}
      </a>
      {help ? <HelpTip>{help}</HelpTip> : null}
    </span>
  );
}
