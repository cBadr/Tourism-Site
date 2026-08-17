/**
 * شكل اللقطة — الطبقة المشتركة بين المُحمِّل (خادم) والمحرر (متصفح) وإجراء الحفظ.
 *
 * اللقطة كائنٌ واحد في `page_revisions.snapshot`:
 *
 *     { page: {...}, sections: [ …بمفاتيح القاعدة… ], rev: <عدّاد> }
 *
 * ومفاتيح عناصر `sections` **بصيغة القاعدة** (`parent_id` · `block_key`) لا
 * بصيغة الواجهة (`parentId`) — لأن `publish_page_revision` و`page_revision_diff`
 * و`page_publish_blockers` تقرأ اللقطة مباشرةً بهذه الأسماء. تسميةٌ مختلفة هنا
 * تعطي نشراً «ناجحاً» يفكّ كل الأنساب صامتاً.
 *
 * ── `rev`: عدّاد التزامن، وسببُ وجوده ──────────────────────────────────────
 *
 * المسودة **صفٌّ واحد** لكل صفحة، والحفظ يستبدل لقطتها كاملةً. فتبويبان مفتوحان
 * على الصفحة نفسها: الأول يعيد الترتيب ويحفظ، ثم الثاني يحفظ ما بيده — فيمحو
 * ترتيب الأول **بلا أي خطأ**. والعمود `created_at` لا يتغيّر بالتحديث، وجدول
 * اللقطات سبعة أعمدة بالضبط بحكم العقد §٧ (والاختبار يعدّها)، فلا مكان لعمود
 * `updated_at`. فالعدّاد يعيش **داخل** اللقطة، والحفظ يشترطه في `where`:
 *
 *     update page_revisions set snapshot = … where id = … and snapshot->>rev = <المقروء>
 *
 * صفر صفوف ⇒ سبقك أحد ⇒ `stale-revision` (وهو رمزٌ في العقد §١١ سلفاً، أي أن
 * هذه الحالة كانت متوقَّعة في التصميم لا مخترَعة هنا).
 */

import {
  BUILDER_CONTENT_VERSION,
  ITEMS_FIELD,
  STYLE_FIELD,
  blockDef,
  type BuilderBlock,
  type BuilderBlockType,
  type BuilderErrorCode,
} from "@/lib/page-builder-types";
import { isItemArray, itemsAreKeyed } from "./item-keys";

/** صفُّ قسمٍ داخل اللقطة — بأسماء أعمدة القاعدة حرفياً */
export type SnapshotSection = {
  id: string;
  page_id: string;
  parent_id: string | null;
  type: string;
  content: Record<string, unknown>;
  sort: number;
  visible: boolean;
  block_key: string | null;
};

export type BuilderSnapshot = {
  page: Record<string, unknown>;
  sections: SnapshotSection[];
  rev: number;
};

export const UUID_PATTERN =
  /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;

/** معرّف كتلةٍ جديدة — يُسَكّ في المحرر ويصير `sections.id` الدائم عند النشر */
export function newBlockId(): string {
  if (typeof globalThis.crypto?.randomUUID === "function") return globalThis.crypto.randomUUID();
  // بديلٌ لبيئةٍ بلا randomUUID — الشكل نفسه، ولا يُستعمل عملياً في Node 18+
  const hex = "0123456789abcdef";
  let out = "";
  for (let i = 0; i < 36; i++) {
    if (i === 8 || i === 13 || i === 18 || i === 23) out += "-";
    else if (i === 14) out += "4";
    else if (i === 19) out += hex[(Math.floor(Math.random() * 16) & 0x3) | 0x8];
    else out += hex[Math.floor(Math.random() * 16)];
  }
  return out;
}

// ---------------------------------------------------------------------------
// صفوف ⇄ شجرة
// ---------------------------------------------------------------------------

/**
 * صفوف اللقطة (أو صفوف `sections` الحيّة) ⇐ شجرة `BuilderBlock` مرتّبة.
 * الجذور بترتيب `sort`، وأبناء كل كتلة أعمدة بترتيب `sort` داخلها.
 *
 * ⚠ الابن الذي فُقد أبوه (‏`orphan-child`) **يُرفع جذراً ولا يُسقط**: إسقاطه من
 * الشاشة يعني أن المالك لا يرى ما يمنع نشره، فيبقى الزر معطَّلاً بلا سبب مرئي.
 */
export function sectionsToBlocks(rows: readonly SnapshotSection[]): BuilderBlock[] {
  const byId = new Map<string, SnapshotSection>();
  for (const row of rows) byId.set(row.id, row);

  const toBlock = (row: SnapshotSection, parentId: string | null): BuilderBlock => ({
    id: row.id,
    pageId: row.page_id,
    parentId,
    type: row.type as BuilderBlockType,
    content: row.content ?? {},
    sort: row.sort,
    visible: row.visible,
    children: [],
  });

  const roots: BuilderBlock[] = [];
  const nodes = new Map<string, BuilderBlock>();

  const sorted = [...rows].sort((a, b) => a.sort - b.sort);
  for (const row of sorted) {
    const hasParent = row.parent_id != null && byId.has(row.parent_id);
    const block = toBlock(row, hasParent ? row.parent_id : null);
    nodes.set(row.id, block);
    if (!hasParent) roots.push(block);
  }
  for (const row of sorted) {
    if (row.parent_id == null || !byId.has(row.parent_id)) continue;
    const parent = nodes.get(row.parent_id);
    const child = nodes.get(row.id);
    if (parent && child) parent.children.push(child);
  }
  return roots;
}

/**
 * شجرة ⇐ صفوف. الترتيب يُعاد ترقيمه تسلسلياً هنا (‏٠..ن للجذور، و٠..م داخل كل
 * أب) فلا تتراكم فجوات ولا تساوٍ في `sort` — وهو ما كان يجعل «أعلى/أسفل» في
 * المحرر القديم يحتاج إعادة ترقيمٍ كاملة في كل نقرة.
 */
export function blocksToSections(blocks: readonly BuilderBlock[], pageId: string): SnapshotSection[] {
  const out: SnapshotSection[] = [];
  blocks.forEach((root, rootIndex) => {
    out.push({
      id: root.id,
      page_id: pageId,
      parent_id: null,
      type: root.type,
      content: root.content ?? {},
      sort: rootIndex,
      visible: root.visible,
      block_key: null,
    });
    (root.children ?? []).forEach((child, childIndex) => {
      out.push({
        id: child.id,
        page_id: pageId,
        parent_id: root.id,
        type: child.type,
        content: child.content ?? {},
        sort: childIndex,
        visible: child.visible,
        block_key: null,
      });
    });
  });
  return out;
}

// ---------------------------------------------------------------------------
// قراءة/كتابة اللقطة
// ---------------------------------------------------------------------------

export function buildSnapshot(
  page: Record<string, unknown>,
  blocks: readonly BuilderBlock[],
  pageId: string,
  rev: number
): BuilderSnapshot {
  return { page, sections: blocksToSections(blocks, pageId), rev };
}

/** قراءة لقطةٍ قادمة من القاعدة بتسامحٍ — لقطةٌ قديمة أو ناقصة لا تنهار الشاشة */
export function readSnapshot(raw: unknown, pageId: string): { sections: SnapshotSection[]; rev: number } {
  const obj = (typeof raw === "object" && raw !== null ? raw : {}) as Record<string, unknown>;
  const revRaw = obj.rev;
  const rev = typeof revRaw === "number" && Number.isFinite(revRaw) ? Math.trunc(revRaw) : 0;
  const list = Array.isArray(obj.sections) ? obj.sections : [];
  const sections: SnapshotSection[] = [];
  for (const entry of list) {
    if (typeof entry !== "object" || entry === null) continue;
    const row = entry as Record<string, unknown>;
    const id = typeof row.id === "string" ? row.id : null;
    const type = typeof row.type === "string" ? row.type : null;
    if (!id || !type) continue;
    sections.push({
      id,
      page_id: pageId,
      parent_id: typeof row.parent_id === "string" && row.parent_id !== "" ? row.parent_id : null,
      type,
      content:
        typeof row.content === "object" && row.content !== null
          ? (row.content as Record<string, unknown>)
          : {},
      sort: typeof row.sort === "number" ? row.sort : 0,
      visible: row.visible !== false,
      block_key: typeof row.block_key === "string" && row.block_key !== "" ? row.block_key : null,
    });
  }
  return { sections, rev };
}

// ---------------------------------------------------------------------------
// التحقق قبل الكتابة — رمزٌ لا جملة
// ---------------------------------------------------------------------------

/**
 * فحص شكل الكتل قبل الحفظ. يرجع **رمز** خطأ من `BUILDER_ERROR_CODES` أو `null`.
 *
 * ⚠ وهو **لا يغني عن حرّاس القاعدة**: `sections_guard_depth` و
 * `page_publish_blockers` هما الحدّ، وهذا يمنع كتابة مسودةٍ يستحيل نشرها بدل
 * أن يكتشفها المالك بعد عشرين دقيقة عمل.
 */
export function validateBlocks(blocks: readonly BuilderBlock[]): BuilderErrorCode | null {
  const seenIds = new Set<string>();
  const walk = (block: BuilderBlock, depth: number): BuilderErrorCode | null => {
    if (!UUID_PATTERN.test(block.id)) return "template-shape";
    if (seenIds.has(block.id)) return "template-shape";
    seenIds.add(block.id);

    const def = blockDef(block.type);
    if (!def) return "block-unknown";

    // العمق مستوى واحد: أبٌ وأبناؤه ولا حفيد (العقد §٣)
    if (depth > 1) return "block-placement";
    if (depth === 1 && (block.children ?? []).length > 0) return "block-placement";
    if (depth === 0 && (block.children ?? []).length > 0 && !def.acceptsChildren)
      return "block-placement";
    if (def.maxChildren != null && (block.children ?? []).length > def.maxChildren)
      return "block-placement";

    const content = block.content ?? {};
    const items = content[ITEMS_FIELD];
    if (items !== undefined) {
      if (!isItemArray(items)) return "template-shape";
      // قائمةٌ فارغة مسموحة (كتلة قيد البناء)، والمفتاح يُشترط متى وُجد عنصر
      if (items.length > 0 && !itemsAreKeyed(items)) return "item-key";
    }
    const style = content[STYLE_FIELD];
    if (style !== undefined && (typeof style !== "object" || style === null || Array.isArray(style)))
      return "template-shape";

    for (const child of block.children ?? []) {
      const bad = walk(child, depth + 1);
      if (bad) return bad;
    }
    return null;
  };

  for (const root of blocks) {
    const bad = walk(root, 0);
    if (bad) return bad;
  }
  return null;
}

/**
 * 🔴 **أيُّ كتلةٍ بالضبط أسقطت الحفظ بـ`item-key`؟** — يرجع نوعها أو `null`.
 *
 * ── لماذا وُجدت هذه الدالة (عطبٌ مقيس، 2026-08-17) ────────────────────────
 *
 * `validateBlocks` تحكم على **الصفحة** وتُرجع رمزاً واحداً بلا عنوان. والمالك
 * كان يحرّر جُمل البطل المتناوبة — وكتلة البطل مفاتيحها سليمة — فيصطدم برسالةٍ
 * عن «مفاتيح العناصر» لا يرى لها أثراً في الحقل الذي يكتب فيه، والسبب كتلتان
 * أخريان أسفل الصفحة لم يفتحهما. رسالةٌ صحيحةٌ في مضمونها **تصف مكاناً آخر**
 * أسوأ من رسالةٍ عامة، لأنها ترسله يبحث حيث لا شيء.
 *
 * والنوع **رمزٌ لا جملة** (اتفاقية المشروع): يسافر في الـ query string
 * وتترجمه `blockLabel` في الشاشة.
 */
export function findInvalidItemBlock(blocks: readonly BuilderBlock[]): string | null {
  for (const block of blocks) {
    const items = (block.content ?? {})[ITEMS_FIELD];
    if (items !== undefined && isItemArray(items) && items.length > 0 && !itemsAreKeyed(items))
      return block.type;
    const child = findInvalidItemBlock(block.children ?? []);
    if (child) return child;
  }
  return null;
}

/** فحص المواضع على مستوى الصفحة (‏`once-per-page` و`home-only`) */
export function validatePlacement(
  blocks: readonly BuilderBlock[],
  pageKind: string
): BuilderErrorCode | null {
  const counts = new Map<string, number>();
  const count = (list: readonly BuilderBlock[]) => {
    for (const b of list) {
      counts.set(b.type, (counts.get(b.type) ?? 0) + 1);
      count(b.children ?? []);
    }
  };
  count(blocks);

  for (const [type, n] of counts) {
    const def = blockDef(type);
    if (!def) continue;
    if ((def.placement === "once-per-page" || def.placement === "home-only") && n > 1)
      return "block-placement";
    if (def.placement === "home-only" && pageKind !== "home") return "block-placement";
  }
  return null;
}

/** ختم إصدار الشكل — يُكتب في `style._v` عند أول كتابة من المنشئ (العقد §٥) */
export function stampContentVersion(content: Record<string, unknown>): Record<string, unknown> {
  const style = (
    typeof content[STYLE_FIELD] === "object" && content[STYLE_FIELD] !== null
      ? { ...(content[STYLE_FIELD] as Record<string, unknown>) }
      : {}
  ) as Record<string, unknown>;
  if (style._v === BUILDER_CONTENT_VERSION && content[STYLE_FIELD] !== undefined) return content;
  style._v = BUILDER_CONTENT_VERSION;
  return { ...content, [STYLE_FIELD]: style };
}
