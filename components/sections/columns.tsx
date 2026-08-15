import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/**
 * كتلة «أعمدة» — جواب «التداخل» في الخارطة، وهي **تخطيطٌ لا محتوى**:
 * لا نصَّ لها إطلاقاً (`textFields: []` في `BLOCK_CATALOGUE`)، وأبناؤها صفوفٌ
 * مستقلة في `sections` يربطها `parent_id` لا مفاتيح داخل `jsonb`.
 *
 * **لماذا صفوفٌ لا حقول؟** (العقد §٣) لأن طبقة الترجمة تفهرس مستويين من جذر
 * القسم، والعمق الزائد داخل `content` **لا ينفجر بل يختفي**: نصٌّ عربي يُخدَم
 * على `/en` بلا أن يظهر في الطابور ولا في `translation_progress`. أما الكتلة
 * الابنة فقسمٌ له `id` خاص، فنصوصها مفهرسة تلقائياً بلا سطرٍ جديد في الفهرس.
 *
 * ⚠ **والعمق مستوىً واحد** (‏`MAX_BLOCK_DEPTH = 1`): لا حفيد. يفرضه مُشغّل
 * `sections_guard_depth` في القاعدة، وتفرضه هذه العارضة بألا تعاود النزول.
 */
export function ColumnsSection({ children }: { children: ReactNode[] }) {
  /**
   * كتلة تخطيط بلا عمودٍ واحد يُصيَّر = **لا شيء**، لا إطارٌ فارغ.
   *
   * والحالة ليست نظرية: يكفي أن يكون العمود الوحيد صورةً بلا `src` أو نصّاً بلا
   * `body` — فتسقط الكتلة الابنة بقاعدة «الحقل الناقص ⇒ null»، ويبقى الأب
   * شبكةً بحشوٍ رأسي حول فراغ.
   */
  if (children.length === 0) return null;

  /**
   * الشبكة **صريحة لكل عدد** لا مبنيّةً بسلسلة (`grid-cols-${n}`): Tailwind
   * يمسح المصدر بحثاً عن أصناف كاملة، والصنف المركَّب وقت التشغيل لا يُولَّد
   * أصلاً — فينهار العمودان إلى واحد بلا رسالة خطأ واحدة.
   *
   * والسقف أربعة يفرضه `max_children` في `block_registry` ومُشغّلُ القاعدة معاً؛
   * وما زاد على ذلك — إن وصل يوماً من إدراجٍ مباشر — يلتفّ ولا يكسر التخطيط.
   */
  const columns = Math.min(children.length, 4);
  const gridClass =
    columns === 1
      ? "grid-cols-1"
      : columns === 2
        ? "grid-cols-1 md:grid-cols-2"
        : columns === 3
          ? "grid-cols-1 md:grid-cols-3"
          : "grid-cols-1 sm:grid-cols-2 lg:grid-cols-4";

  return (
    <section className="py-10 md:py-14">
      <div className="mx-auto w-full max-w-6xl px-4 sm:px-6">
        <div className={cn("grid items-start gap-6 md:gap-8", gridClass)}>
          {/**
           * الابن قسمٌ كامل بحشوه الرأسي الخاص — وداخل عمودٍ يصير ذلك فراغاً
           * مضاعفاً. فيُصفَّر حشو القسم المباشر وحده، ويبقى كل ما عداه كما كتبه
           * مؤلّفه (لا نسخة ثانية من العارضة، ولا تفريعٌ لها — القاعدة الملزمة
           * في نصّ المرحلة: «العارضات القائمة تُعاد ولا تُفرَّع»).
           */}
          {children.map((child, index) => (
            <div key={index} className="[&>section]:py-0!">
              {child}
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
