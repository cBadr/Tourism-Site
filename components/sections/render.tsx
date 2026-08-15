import type { ReactNode } from "react";
import type {
  Section,
  SectionContentMap,
  SectionType,
} from "@/lib/content-types";
import type { SiteSettings } from "@/lib/site-config";
import { DEFAULT_LOCALE } from "@/lib/i18n-types";
import {
  ITEMS_FIELD,
  STYLE_FIELD,
  blockRenders,
} from "@/lib/page-builder-types";
import { HeroSection } from "./hero";
import { PageHeroSection } from "./page-hero";
import { ServicesGridSection } from "./services-grid";
import { FleetSection } from "./fleet";
import { WhyUsSection } from "./why-us";
import { FeaturesSection } from "./features";
import { RichTextSection } from "./rich-text";
import { FaqSection } from "./faq";
import { CtaBandSection } from "./cta-band";
import { ContactSection } from "./contact";
import { ColumnsSection } from "./columns";
import { ImageSection } from "./image";
import { BlockStyleWrapper, readBlockStyle } from "./block-style";

/**
 * سجل الأقسام الأوحد: كل نوع في `SectionType` يقابله مكوّن واحد هنا.
 * الواجهة العامة كلها ترسم أقسامها عبر <RenderSections> — لا استدعاء مباشر
 * لمكوّنات الأقسام من الصفحات. النوع غير المعروف يُتجاهل بأمان.
 *
 * المرحلة ٨: اللغة تمر من الصفحة إلى كل قسم. محتوى القسم نفسه يصل مترجماً من
 * `lib/content.ts`، واللغة هنا لنصوص الواجهة الثابتة داخل الأقسام (الشارات
 * والأزرار) ولبيانات النظام (الخدمات وفئات السيارات) ولتنسيق الأرقام.
 *
 * ── المرحلة ١٣: هذا الملف صار **الحدّ الذي يمنع كتلةً نصفَ مضبوطة من إسقاط
 *    صفحةٍ عامة** ───────────────────────────────────────────────────────────
 *
 * ثلاث طبقات بترتيبها، ولا واحدة منها تغني عن أختها:
 *
 *  (١) **التطهير** — `content` عمود `jsonb`، ولا شيء في القاعدة يمنع أن يحمل
 *      `title` كائناً أو `items` نصاً. و«كائنٌ ابنٌ لـReact» ليس تدهوراً بل
 *      **استثناءٌ يُسقط الصفحة كلها**، و`"abc".filter` كذلك. فما لا تستطيع
 *      قواعد العنونة في العقد §٤ أن تعنونه — أي ما ليس نصاً أعلى ولا نصاً داخل
 *      عنصرٍ من `items` — **يُسقَط قبل أن يبلغ العارضة**.
 *
 *  (٢) **البوابة** — `blockRenders` من `lib/page-builder-types.ts` **بعينها**،
 *      وهي مرآةُ `public.block_renders(text, jsonb)` في `0058`. فحكمُ العارضة
 *      هو حكمُ بوابة النشر حرفياً: ما ترفض القاعدةُ نشرَه لا تُصيّره الصفحة،
 *      وما تُصيّره الصفحة لا ترفض القاعدةُ نشرَه. نسختان تنحرفان يوم تُضاف كتلة.
 *
 *  (٣) **العارضة نفسها** تُسقط الحقل الغائب سطراً سطراً كما كانت تفعل.
 *
 * 🔒 **وأثر الطبقتين الجديدتين على المحتوى القائم مقيس لا مقدَّر:** صفر من ٩٣
 *    قسماً على صفحةٍ منشورة تسقط بالبوابة (نداءٌ حيّ لـ`block_renders` على كل
 *    صفٍّ، 2026-08-15). فالتغيير يمنع العطب الجديد ولا يمسّ صفحةً قائمة.
 */

type SectionProps<T extends SectionType> = {
  content: SectionContentMap[T];
  settings: SiteSettings;
  locale: string;
};

/**
 * الكتل ذات المحتوى — `columns` خارجها بقصد: هي **تخطيط** تأخذ أبناءً مُصيَّرين
 * لا `content`، فتوقيعها مختلف ولا يصح حشره في هذا السجل بـ`as`.
 */
const CONTENT_REGISTRY: {
  [T in Exclude<SectionType, "columns">]: (props: SectionProps<T>) => ReactNode;
} = {
  hero: HeroSection,
  "page-hero": PageHeroSection,
  "services-grid": ServicesGridSection,
  fleet: FleetSection,
  "why-us": WhyUsSection,
  features: FeaturesSection,
  "rich-text": RichTextSection,
  faq: FaqSection,
  "cta-band": CtaBandSection,
  contact: ContactSection,
  image: ImageSection,
};

/* ------------------------------------------------------------------ */
/* (١) التطهير — ما لا يُعنوَن لا يُصيَّر                                  */
/* ------------------------------------------------------------------ */

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * عنصرُ قائمة: كائنٌ **مسطّح من نصوص** لا غير (وهو الشكل المقيس في القاعدة:
 * `q`/`a` و`title`/`text`، و`_k` بعد المرحلة ١٣). أي قيمة غير نصية داخله تسقط،
 * والعنصر الذي لا يبقى فيه حقلٌ واحد يسقط كله — لأن بطاقةً فارغة في شبكة أسوأ
 * من غيابها.
 */
function sanitizeItem(value: unknown): Record<string, string> | null {
  if (!isPlainObject(value)) return null;
  const out: Record<string, string> = {};
  for (const [key, entry] of Object.entries(value)) {
    if (typeof entry === "string") out[key] = entry;
  }
  return Object.keys(out).length > 0 ? out : null;
}

/**
 * محتوى الكتلة كما تراه العارضة: نصوصٌ عليا + قائمة `items` واحدة من عناصر
 * مسطّحة. و`style` **لا يمرّ** — يُقرأ في الغلاف ولا يصل مكوّن القسم، فلا يمكن
 * أن يُصيَّر نصاً بالخطأ.
 */
function sanitizeContent(raw: unknown): Record<string, unknown> {
  if (!isPlainObject(raw)) return {};
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(raw)) {
    if (key === STYLE_FIELD) continue;
    if (key === ITEMS_FIELD) {
      if (!Array.isArray(value)) continue;
      const items = value.map(sanitizeItem).filter((item) => item !== null);
      if (items.length > 0) out[ITEMS_FIELD] = items;
      continue;
    }
    if (typeof value === "string") out[key] = value;
  }
  return out;
}

/* ------------------------------------------------------------------ */
/* (٢) الشجرة — مستوىً واحد، والابن اليتيم يختفي                          */
/* ------------------------------------------------------------------ */

/**
 * يبني كتلةً واحدة مع غلاف تنسيقها. يرجع `null` حين لا تُصيَّر —
 * **لا نصَّ نائب ولا صندوق «اضبطني» ولا انهيار** (العقد §١٠).
 */
function renderBlock(
  section: Section,
  children: Section[],
  settings: SiteSettings,
  locale: string
): ReactNode {
  const content = sanitizeContent(section.content);

  // البوابة: نوعٌ غير مسجَّل أو معطَّل، أو حقلٌ إلزامي ناقص ⇒ لا شيء
  if (!blockRenders(section.type, content)) {
    if (process.env.NODE_ENV !== "production") {
      console.warn(
        `[sections] كتلة لا تُصيَّر (نوع غير مسجَّل أو حقل إلزامي ناقص): ` +
          `type="${section.type}" id=${section.id}`
      );
    }
    return null;
  }

  const style = readBlockStyle(section.content);

  if (section.type === "columns") {
    /**
     * ⚠ **لا نزول ثانٍ**: العمق مستوىً واحد (`MAX_BLOCK_DEPTH`)، فأبناء الابن
     * — إن وُجدوا يوماً من إدراجٍ مباشر يتخطى مُشغّل `sections_guard_depth` —
     * لا يُبحث عنهم أصلاً. النزول الحر هنا كان يفتح دورةً لا نهائية على
     * `parent_id` دائري.
     */
    const rendered = children
      .map((child) => renderBlock(child, [], settings, locale))
      .filter((node) => node !== null);
    if (rendered.length === 0) return null;
    return (
      <BlockStyleWrapper key={section.id} style={style}>
        <ColumnsSection>{rendered}</ColumnsSection>
      </BlockStyleWrapper>
    );
  }

  const Component = CONTENT_REGISTRY[section.type] as (props: {
    content: Record<string, unknown>;
    settings: SiteSettings;
    locale: string;
  }) => ReactNode;

  return (
    <BlockStyleWrapper key={section.id} style={style}>
      <Component content={content} settings={settings} locale={locale} />
    </BlockStyleWrapper>
  );
}

/** يرسم الأقسام المرئية بترتيبها عبر السجل — الكتلة التي لا تُصيَّر تُرسم null */
export function RenderSections({
  sections,
  settings,
  locale = DEFAULT_LOCALE,
}: {
  sections: Section[];
  settings: SiteSettings;
  locale?: string;
}) {
  const visible = sections.filter((section) => section.visible);
  const byId = new Set(visible.map((section) => section.id));

  /**
   * الأبناء مفهرسون بأبيهم ومرتّبون بـ`sort` — نفس الترتيب الذي يعرضه المنشئ.
   *
   * 🔒 **والابن الذي غاب أبوه لا يصعد جذراً**: يبقى في هذه الخريطة ولا يُقرأ.
   * ولولا ذلك لكان «إخفاء كتلة الأعمدة» يزيد ما يُعرض بدل أن ينقصه — أعمدتها
   * الأربعة تنفرط على الصفحة أقساماً مستقلة. (القاعدة نفسها مفروضة في القاعدة
   * عبر `section_parent_visible` في `0058` §١٢؛ وهذه الطبقة الثانية لأن
   * `lib/default-content.ts` و`page_revisions` لا تمرّان على RLS أصلاً.)
   */
  const childrenOf = new Map<string, Section[]>();
  for (const section of visible) {
    const parentId = section.parentId ?? null;
    if (parentId === null) continue;
    if (!byId.has(parentId)) continue;
    const list = childrenOf.get(parentId);
    if (list) list.push(section);
    else childrenOf.set(parentId, [section]);
  }
  for (const list of childrenOf.values()) list.sort((a, b) => a.sort - b.sort);

  const roots = visible
    .filter((section) => (section.parentId ?? null) === null)
    .sort((a, b) => a.sort - b.sort);

  return (
    <>
      {roots.map((section) =>
        renderBlock(section, childrenOf.get(section.id) ?? [], settings, locale)
      )}
    </>
  );
}
