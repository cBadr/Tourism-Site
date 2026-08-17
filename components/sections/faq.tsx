import { ChevronDown } from "lucide-react";
import { SectionHeading } from "@/components/site/section-heading";
import type { SectionContentMap } from "@/lib/content-types";
import { ITEM_KEY_PATTERN } from "@/lib/page-builder-types";
import { DEFAULT_LOCALE } from "@/lib/i18n-types";
import { getT } from "@/lib/i18n/content";
import { JsonLdScript } from "@/components/seo/JsonLd";
import { SingleOpenAccordion } from "@/components/site/single-open-accordion";

/**
 * قسم الأسئلة الشائعة: أكورديون details/summary يعمل بلا JavaScript
 * (مفتوح للوحة المفاتيح وقارئات الشاشة)، ويُصدر بيانات FAQPage
 * المنظمة (JSON-LD) من نفس العناصر لتغذية نتائج البحث.
 *
 * ── 🆕 «واحدٌ مفتوح لا أكثر» — بأمر بدر (2026-08-17) ────────────────────────
 *
 * > «المستخدم حالياً يقدر يفتح كل الأسئلة وتظهر كلها مع بعض… وإن قام المستخدم
 * >  بالضغط على سؤال آخر يتم طي كافة الأسئلة ويتم عرض إجابة السؤال الأخير فقط.»
 *
 * 🔒 **والماركب لم يتغيّر بحرف: `<details>` بلا `open` كما كان.** «الكل مطويّ
 * افتراضياً» **كان قائماً سلفاً** — مقيسٌ على الصفحة الحيّة قبل أي تعديل: عشر
 * كتل `<details>` في الرئيسية، **الخمس التي للأسئلة بلا `open`**، والأربع
 * المفتوحة أعمدةُ التذييل. فالمطلوب فعلاً هو **الأحادية وحدها**.
 *
 * وهذا يجعل سؤال السيو هنا **مختلفاً عن التذييل ولا يُقاس عليه**: هناك كانت
 * الأعمدة تُصيَّر مفتوحةً من الخادم لأن طيّها في الـHTML يحجب ثلاثين رابطاً عن
 * الزاحف. وهنا **لا شيء يُصيَّر مفتوحاً أصلاً ولا شيء يتغيّر**: نصّ كل إجابة
 * موجودٌ في الـHTML سواءٌ فُتحت اللوحة أم لا (‏`<details>` لا يُزيل أبناءه من
 * الشجرة، والمتصفح يُخفيها عرضاً لا وجوداً)، و`FAQPage` تُبنى على الخادم من
 * `items` قبل أي تفاعل. **والتحقق مقيس لا مفترض** — انظر التقرير المرافق.
 *
 * ⚠ **والأحادية سارية في كل عرض، لا على الجوال وحده** (بخلاف التذييل):
 * القسم عمودٌ واحد بعرض `max-w-3xl` على كل الشاشات، فتخطيطه على المكتب هو
 * تخطيطه على الهاتف. وقائمةُ إجاباتٍ مفتوحةٍ كلها جدارُ نصٍّ على أي عرض.
 */
/**
 * 🔗 مرساة السؤال الواحد — **مسكوكةٌ لا مشتقّةٌ من نصّه**.
 *
 * ── الطريق الذي لم يُؤخذ، وهو نفسه الذي رفضته م‑١٠ لكتلة `clause` ──────────
 *
 * `slugify(item.q)` أجملُ ما يُكتب وأخطرُ ما يُشحن: المالك **يصحّح صياغة
 * الأسئلة — هذا عمله**، وأولُ تصحيحٍ إملائي يُبطل كل رابطٍ أُرسل. والكسر
 * **صامتٌ تماماً**: `#السعر` الذي لم يعد موجوداً لا يُخرج ٤٠٤ ولا خطأً — تُفتح
 * الصفحة من أولها، فيقرأ العميل المقدمة ويظن أن السؤال غير موجود، ولا سطر في
 * أي سجل. وينكسر مرةً ثانية باللغة: المشتقُّ من العربية يختلف عن المشتقّ من
 * الإنجليزية، فالرابط الواحد لا يصلح لـ`/faq` و`/en/faq` معاً.
 *
 * ── والمصدر المأخوذ: `_k` — مفتاح العنصر المستقر ─────────────────────────
 *
 * ست خانات `[a-z0-9]` **تُسَكّ عند إنشاء العنصر ولا تتغير أبداً ولا يُعاد
 * استعمالها** (العقد §٤)، **وهي محجوزةٌ من فهرس الترجمة** (`i18n_reserved_
 * content_key`) — فالمرساة واحدةٌ في العربية والإنجليزية، ولا يمسّها إعادةُ
 * ترتيبٍ ولا إعادةُ صياغة. وهي بعينها الخاصية التي وُلد `_k` لأجلها: «العنوان
 * يجب أن يصف **العنصر** لا **موضعه**».
 *
 * ⚠ **وبلا `_k` لا مرساة — ولا يُختلق بديل.** ثمانيةٌ من ٧٢ سؤالاً حيّاً لا
 * تحمله (عناصر لم يلمسها المنشئ بعد، والعقد يُبقي الصيغة الترتيبية عاملة).
 * ومرساةٌ من الترتيب (`q-3`) كانت ستنكسر بأول سحبةٍ في المنشئ — وهو نفس
 * الكسر الصامت أعلاه بثوبٍ آخر. فالسؤال بلا مرساة **لا يُصيَّر له `id`**،
 * ويكتسبها وحده أول مرة يُحرَّر قسمُه.
 */
function questionAnchor(item: object): string | undefined {
  /* `_k` يمرّ من `sanitizeContent` (نصٌّ مسطّح) ولا يُعلَن في `itemFields` —
     فهو محجوزٌ لا حقلٌ للمالك. والقراءة بالتحويل كما في بقية العارضات. */
  const key = (item as { _k?: string })._k;
  return typeof key === "string" && ITEM_KEY_PATTERN.test(key) ? `q-${key}` : undefined;
}

export async function FaqSection({
  content,
  locale = DEFAULT_LOCALE,
  sectionId,
}: {
  content: SectionContentMap["faq"];
  locale?: string;
  /** معرّف الصفّ — نطاق مجموعة الأكورديون، فقسمان في صفحة يعملان مستقلَّين */
  sectionId?: string;
}) {
  const items = (content.items ?? []).filter((item) => item.q && item.a);
  if (items.length === 0) return null;

  const t = await getT("sections.faq", locale);

  /**
   * نطاق المجموعة — مشتقٌّ من معرّف الصفّ لا ثابتاً: صفحةٌ فيها قسما أسئلة
   * (وهو مسموحٌ به: `placement: "any"`) تعمل مجموعتين مستقلتين، فلا يُغلق
   * سؤالٌ في قسمٍ لأن زائراً فتح سؤالاً في الآخر.
   *
   * والسقوط إلى ثابتٍ عند غياب المعرّف سليم: `sectionId` يصل دائماً من
   * `render.tsx`، والغياب لا يقع إلا في استدعاءٍ مباشر — وهناك القسم واحد.
   */
  const scopeId = `faq-${sectionId ?? "section"}`;

  /**
   * `FAQPage` عقدة قائمة بذاتها لا عضو في رسم الموقع: القسم قد يتكرر في الصفحة
   * الواحدة، وكل نسخة تصف أسئلتها هي. أما التسلسل وترميز `<` فمن `JsonLdScript`
   * وحده — مُسلسِل واحد في المستودع كله، لا نسخة منه في كل مكوّن يُخرج JSON-LD.
   */
  const faqJsonLd = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: items.map((item) => ({
      "@type": "Question",
      name: item.q,
      acceptedAnswer: { "@type": "Answer", text: item.a },
    })),
  };

  return (
    <section className="py-16 md:py-24">
      <div className="mx-auto w-full max-w-3xl px-4 sm:px-6">
        <SectionHeading
          eyebrow={t("eyebrow", "أسئلة شائعة")}
          title={content.title ?? t("title", "إجابات عن أكثر ما يسأل عنه عملاؤنا")}
        />

        <div id={scopeId} className="mt-8 flex flex-col gap-3 md:mt-10">
          {items.map((item) => (
            <details
              key={item.q}
              /* علامة العضوية في المجموعة — يقرؤها `SingleOpenAccordion` وحده */
              data-acc
              id={questionAnchor(item)}
              className="group scroll-mt-24 rounded-2xl bg-card ring-1 ring-border transition-shadow open:shadow-lg open:shadow-primary/5 open:ring-primary/25"
            >
              <summary className="flex cursor-pointer list-none items-center justify-between gap-4 rounded-2xl px-5 py-4 text-start font-bold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60 [&::-webkit-details-marker]:hidden">
                <span>{item.q}</span>
                {/*
                  الدوران حالةٌ لا حركة — فيبقى لمن طلب تقليل الحركة، ويسقط
                  **الانتقالُ** وحده عبر `motion-safe`. وقلبُ سهمٍ بلا تدرّج
                  يقول ما يقوله بتدرّج، أما سهمٌ لا يدور فيكذّب حالة اللوحة.
                */}
                <ChevronDown
                  className="size-5 shrink-0 text-muted-foreground group-open:rotate-180 motion-safe:transition-transform motion-safe:duration-300"
                  aria-hidden="true"
                />
              </summary>
              <p className="px-5 pb-5 leading-8 text-muted-foreground">
                {item.a}
              </p>
            </details>
          ))}
        </div>

        {/*
          بلا `defaultAttr` (الكل مطويّ) وبلا `openAllAbove` (الأحادية في كل
          عرض) — وهما كل الفرق عن استعمال التذييل للمكوّن نفسه.
        */}
        <SingleOpenAccordion scopeId={scopeId} />

        <JsonLdScript data={faqJsonLd} />
      </div>
    </section>
  );
}
