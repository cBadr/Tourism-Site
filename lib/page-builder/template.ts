/**
 * تصدير القالب واستيراده — «احفظ كقالب» بمعناه الحرفي: **القالب لقطة**.
 *
 * معرض القوالب مؤجَّل بسببٍ مكتوب (العقد §١٢ بند ٢)، أما التصدير والاستيراد
 * فمشحونان لأنهما القدرة نفسها، والمعرض واجهةٌ فوقها.
 *
 * 🔴 **وأخطر ما في الاستيراد ليس الشكل بل المفاتيح:** القالب المصدَّر يحمل
 * `_k` عناصر صفحته الأصلية و`id` كتلها. فلصقُه كما هو على صفحةٍ جديدة يُسند
 * ترجمات الصفحة الأولى إلى الثانية — عطبٌ حقيقي مذكورٌ بالاسم في موجز المرحلة
 * (الثمن ٢). ولذلك الاستيراد **يعيد سكّ كل معرّف وكل مفتاح**، بلا استثناء وبلا
 * خيارٍ للمستخدم.
 */

import type { BuilderBlock, BuilderBlockType } from "@/lib/page-builder-types";
import { ITEMS_FIELD, blockDef } from "@/lib/page-builder-types";
import { remintItemKeys, isItemArray } from "./item-keys";
import { newBlockId, UUID_PATTERN } from "./snapshot";

/** صيغة الملف المصدَّر — مختومة بإصدارها كي يُرفض ما لا يُفهم بدل تخمينه */
export type PageTemplateFile = {
  format: "tours-page-template";
  version: 1;
  exportedAt: string;
  /** عنوان الصفحة المصدَّرة — للتعرّف عليها في قائمة ملفات، لا يُستورد */
  sourceTitle: string;
  blocks: TemplateBlock[];
};

type TemplateBlock = {
  type: string;
  content: Record<string, unknown>;
  visible: boolean;
  children: TemplateBlock[];
};

export const TEMPLATE_FORMAT = "tours-page-template" as const;
export const TEMPLATE_VERSION = 1 as const;

function toTemplateBlock(block: BuilderBlock): TemplateBlock {
  return {
    type: block.type,
    content: block.content ?? {},
    visible: block.visible,
    children: (block.children ?? []).map(toTemplateBlock),
  };
}

/**
 * القالب **بلا معرّفات**: لا `id` ولا `page_id`. حذفُها ليس تنظيفاً — هو ما
 * يجعل إعادة السكّ عند الاستيراد إلزاماً بنيوياً لا انضباطاً.
 */
export function exportTemplate(title: string, blocks: readonly BuilderBlock[]): PageTemplateFile {
  return {
    format: TEMPLATE_FORMAT,
    version: TEMPLATE_VERSION,
    exportedAt: new Date().toISOString(),
    sourceTitle: title,
    blocks: blocks.map(toTemplateBlock),
  };
}

export type ImportResult =
  | { ok: true; blocks: BuilderBlock[] }
  | { ok: false; code: "template-shape" | "block-unknown" | "block-placement" };

/**
 * استيراد قالب على صفحةٍ بعينها. كل كتلة تأخذ `id` جديداً، وكل عنصر `items`
 * يأخذ `_k` جديداً — فلا يرث القالبُ عنوانَ ترجمةٍ من مصدره.
 */
export function importTemplate(raw: unknown, pageId: string): ImportResult {
  if (typeof raw !== "object" || raw === null) return { ok: false, code: "template-shape" };
  const file = raw as Partial<PageTemplateFile>;
  if (file.format !== TEMPLATE_FORMAT || file.version !== TEMPLATE_VERSION)
    return { ok: false, code: "template-shape" };
  if (!Array.isArray(file.blocks)) return { ok: false, code: "template-shape" };

  let bad: ImportResult | null = null;

  const convert = (entry: unknown, depth: number): BuilderBlock | null => {
    if (typeof entry !== "object" || entry === null) {
      bad = { ok: false, code: "template-shape" };
      return null;
    }
    const row = entry as Partial<TemplateBlock>;
    if (typeof row.type !== "string") {
      bad = { ok: false, code: "template-shape" };
      return null;
    }
    const def = blockDef(row.type);
    if (!def) {
      bad = { ok: false, code: "block-unknown" };
      return null;
    }
    if (depth > 1) {
      // حفيدٌ في القالب — يُرفض ولا يُسطَّح بالتخمين (العقد §١٢ بند ٣)
      bad = { ok: false, code: "block-placement" };
      return null;
    }

    const content: Record<string, unknown> =
      typeof row.content === "object" && row.content !== null
        ? { ...(row.content as Record<string, unknown>) }
        : {};

    // 🔴 إعادة السكّ — القلب كله
    if (content[ITEMS_FIELD] !== undefined) {
      if (!isItemArray(content[ITEMS_FIELD])) {
        bad = { ok: false, code: "template-shape" };
        return null;
      }
      content[ITEMS_FIELD] = remintItemKeys(content[ITEMS_FIELD]);
    }

    const childrenRaw = Array.isArray(row.children) ? row.children : [];
    if (childrenRaw.length > 0 && !def.acceptsChildren) {
      bad = { ok: false, code: "template-shape" };
      return null;
    }
    if (def.maxChildren != null && childrenRaw.length > def.maxChildren) {
      bad = { ok: false, code: "template-shape" };
      return null;
    }

    const id = newBlockId();
    const children: BuilderBlock[] = [];
    for (const child of childrenRaw) {
      const converted = convert(child, depth + 1);
      if (!converted) return null;
      converted.parentId = id;
      children.push(converted);
    }

    return {
      id,
      pageId,
      parentId: null,
      type: row.type as BuilderBlockType,
      content,
      sort: 0,
      visible: row.visible !== false,
      children,
    };
  };

  const blocks: BuilderBlock[] = [];
  for (const entry of file.blocks) {
    const block = convert(entry, 0);
    if (!block) return bad ?? { ok: false, code: "template-shape" };
    blocks.push(block);
  }

  // فحصٌ أخير على المعرّفات المُنتَجة — لو أخفق مولّد الـuuid لانهار **أساس**
  // النشر (المطابقة بالمعرّف)، وهو ما لا يُكتشف إلا بعد ضياع ترجماتٍ فعلاً.
  const ids = new Set<string>();
  const check = (list: BuilderBlock[]): boolean =>
    list.every((b) => {
      if (!UUID_PATTERN.test(b.id) || ids.has(b.id)) return false;
      ids.add(b.id);
      return check(b.children ?? []);
    });
  if (!check(blocks)) return { ok: false, code: "template-shape" };

  return { ok: true, blocks };
}
