"use client";

import * as React from "react";
import Link from "next/link";
import {
  CheckCircle2,
  Download,
  ExternalLink,
  Eye,
  Plus,
  Rocket,
  Save,
  TriangleAlert,
  Undo2,
  Upload,
  XCircle,
} from "lucide-react";

import { HelpTip } from "@/components/shared/HelpTip";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Textarea, fieldControlClass } from "@/app/admin/content/_components/fields";
import { cn } from "@/lib/utils";
import type { BuilderAccess, BuilderBlock, BuilderBlockType } from "@/lib/page-builder-types";
import {
  BLOCK_CATALOGUE,
  blockLabel,
  builderErrorMessage,
  placementBlockReason,
  publishBlockerMessage,
} from "@/lib/page-builder/registry";
import { defaultContentFor } from "@/lib/page-builder/registry";
import { newBlockId } from "@/lib/page-builder/snapshot";
import { exportTemplate } from "@/lib/page-builder/template";
import { BlockCard } from "./block-card";

/**
 * جزيرة المنشئ — كل التحرير هنا في الذاكرة، والكتابة **حفظةٌ واحدة**.
 *
 * ثلاثة قرارات تحكم هذا الملف:
 *
 * (١) 🔒 **الحفظ نداءٌ واحد** (‏**D-48**): الشجرة كلها تُسلسَل في حقلٍ مخفي واحد
 *     ويكتبها الإجراء في عمود `jsonb` واحد. فلا وجود لحالةٍ «نصف محفوظة»:
 *     ترتيبٌ جديد وثلاثة نصوص وحذفُ كتلة إما وصلت كلها أو لم تصل.
 *
 * (٢) 🔒 **زر النشر معطَّل ما دام هناك تعديل غير محفوظ**، لأن ما يُنشر هو
 *     **اللقطة المحفوظة** لا ما على الشاشة. ولولا ذلك لضغط المالك «نشر» بعد
 *     تعديلٍ لم يُحفظ فرأى صفحته تُنشر بلا تعديله — بلا خطأ واحد يفسّر.
 *
 * (٣) ⚠ **العمل غير المحفوظ لا يضيع صامتاً**: حارسان — `beforeunload` لإغلاق
 *     التبويب وإعادة التحميل، واعتراضُ نقرات الروابط الداخلية لأن التنقل داخل
 *     التطبيق لا يمرّ على `beforeunload` إطلاقاً (وهو المسار الأرجح: زر
 *     «معاينة» أو بند في القائمة الجانبية).
 */

type Props = {
  pageId: string;
  pageKind: string;
  pageTitle: string;
  publicPath: string | null;
  access: BuilderAccess;
  initialBlocks: BuilderBlock[];
  revisionId: string | null;
  rev: number;
  hasUnpublishedChanges: boolean;
  blockers: string[];
  status: {
    saved: boolean;
    published: string | null;
    discarded: boolean;
    imported: boolean;
    error: string | null;
    /** نوع الكتلة التي أسقطت الحفظ — رمزٌ تترجمه الشاشة، و`null` حين لا يُعرف */
    errorBlock: string | null;
  };
  saveAction: (formData: FormData) => void | Promise<void>;
  publishAction: (formData: FormData) => void | Promise<void>;
  discardAction: (formData: FormData) => void | Promise<void>;
  importAction: (formData: FormData) => void | Promise<void>;
};

export function BuilderEditor({
  pageId,
  pageKind,
  pageTitle,
  publicPath,
  access,
  initialBlocks,
  revisionId,
  rev,
  hasUnpublishedChanges,
  blockers,
  status,
  saveAction,
  publishAction,
  discardAction,
  importAction,
}: Props) {
  const readOnly = access !== "edit";
  const [dragFrom, setDragFrom] = React.useState<number | null>(null);

  /**
   * اللقطة على الخادم لها مفتاحٌ واحد يميّزها: `<معرّف اللقطة>:<العدّاد>`. وكل
   * حفظٍ أو نشرٍ أو إسقاطٍ أو استيراد يغيّره، فتُعاد مزامنة المحرر وتسقط علامة
   * «غير محفوظ». والمزامنة **أثناء التصيير لا في `useEffect`**: التأثير كان
   * يترك إطاراً واحداً تُعرض فيه لقطةٌ قديمة على أنها الحالية — وهو بالضبط
   * الإطار الذي قد يضغط فيه المالك «نشر».
   */
  const snapshotKey = `${revisionId ?? "none"}:${rev}`;
  const [syncedKey, setSyncedKey] = React.useState(snapshotKey);
  const [blocks, setBlocks] = React.useState<BuilderBlock[]>(initialBlocks);
  const [baseline, setBaseline] = React.useState(() => JSON.stringify(initialBlocks));

  if (syncedKey !== snapshotKey) {
    setSyncedKey(snapshotKey);
    setBlocks(initialBlocks);
    setBaseline(JSON.stringify(initialBlocks));
  }

  const serialized = JSON.stringify(blocks);
  const dirty = serialized !== baseline;

  // ── حارسا العمل غير المحفوظ ────────────────────────────────────────────
  React.useEffect(() => {
    if (!dirty || readOnly) return;

    const onBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    const onClickCapture = (event: MouseEvent) => {
      if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey) return;
      const target = event.target as HTMLElement | null;
      const anchor = target?.closest?.("a[href]") as HTMLAnchorElement | null;
      if (!anchor) return;
      const href = anchor.getAttribute("href") ?? "";
      if (!href.startsWith("/") || anchor.target === "_blank") return;
      const go = window.confirm(
        "في هذه الصفحة تعديلات لم تُحفظ بعد — الانتقال الآن يفقدها. هل تريد المغادرة؟"
      );
      if (!go) {
        event.preventDefault();
        event.stopPropagation();
      }
    };

    window.addEventListener("beforeunload", onBeforeUnload);
    document.addEventListener("click", onClickCapture, true);
    return () => {
      window.removeEventListener("beforeunload", onBeforeUnload);
      document.removeEventListener("click", onClickCapture, true);
    };
  }, [dirty, readOnly]);

  // ── عمليات الشجرة ──────────────────────────────────────────────────────
  const allTypes = React.useMemo(() => {
    const out: string[] = [];
    const walk = (list: BuilderBlock[]) => {
      for (const b of list) {
        out.push(b.type);
        walk(b.children ?? []);
      }
    };
    walk(blocks);
    return out;
  }, [blocks]);

  const patchBlock = (id: string, patch: Partial<BuilderBlock>) =>
    setBlocks((prev) =>
      prev.map((root) =>
        root.id === id
          ? { ...root, ...patch }
          : {
              ...root,
              children: (root.children ?? []).map((child) =>
                child.id === id ? { ...child, ...patch } : child
              ),
            }
      )
    );

  const removeBlock = (id: string) =>
    setBlocks((prev) =>
      prev
        .filter((root) => root.id !== id)
        .map((root) => ({
          ...root,
          children: (root.children ?? []).filter((child) => child.id !== id),
        }))
    );

  const moveInList = <T,>(list: T[], from: number, to: number): T[] => {
    if (to < 0 || to >= list.length || from === to) return list;
    const next = [...list];
    const [moved] = next.splice(from, 1);
    next.splice(to, 0, moved);
    return next;
  };

  const moveBlock = (id: string, dir: -1 | 1) =>
    setBlocks((prev) => {
      const rootIndex = prev.findIndex((b) => b.id === id);
      if (rootIndex !== -1) return moveInList(prev, rootIndex, rootIndex + dir);
      return prev.map((root) => {
        const children = root.children ?? [];
        const childIndex = children.findIndex((c) => c.id === id);
        if (childIndex === -1) return root;
        return { ...root, children: moveInList(children, childIndex, childIndex + dir) };
      });
    });

  const moveRootTo = (from: number, to: number) => setBlocks((prev) => moveInList(prev, from, to));

  const makeBlock = (type: BuilderBlockType, parentId: string | null): BuilderBlock => ({
    id: newBlockId(),
    pageId,
    parentId,
    type,
    content: defaultContentFor(type),
    sort: 0,
    visible: true,
    children: [],
  });

  const addRoot = (type: BuilderBlockType) =>
    setBlocks((prev) => [...prev, makeBlock(type, null)]);

  const addChild = (parentId: string, type: BuilderBlockType) =>
    setBlocks((prev) =>
      prev.map((root) =>
        root.id === parentId
          ? { ...root, children: [...(root.children ?? []), makeBlock(type, parentId)] }
          : root
      )
    );

  // ── تصدير القالب: يُبنى في المتصفح من الحالة المعروضة ─────────────────
  const downloadTemplate = () => {
    const file = exportTemplate(pageTitle, blocks);
    const blob = new Blob([JSON.stringify(file, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `page-template-${pageId.slice(0, 8)}.json`;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(url);
  };

  const publishDisabled = readOnly || dirty || !revisionId || blockers.length > 0;
  const publishHint = readOnly
    ? "النشر لحساب دوره admin وحده."
    : dirty
      ? "احفظ المسودة أولاً — النشر ينشر آخر لقطة محفوظة لا ما على الشاشة."
      : !revisionId
        ? "لا مسودة لنشرها — عدّل شيئاً ثم احفظ."
        : blockers.length > 0
          ? "عالج موانع النشر أولاً."
          : undefined;

  return (
    <div className="space-y-5">
      <StatusRow status={status} />

      {/* ── شريط الأدوات ─────────────────────────────────────────────── */}
      <Card className="sticky top-16 z-20 space-y-3 p-4">
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant={revisionId ? "default" : "outline"}>
            {revisionId ? "مسودة مفتوحة" : "لا مسودة — المعروض هو المنشور"}
          </Badge>
          {hasUnpublishedChanges && <Badge variant="secondary">تغييرات لم تُنشر</Badge>}
          {dirty && (
            <Badge variant="destructive" className="gap-1">
              <TriangleAlert className="size-3" />
              تعديلات لم تُحفظ
            </Badge>
          )}
          <span className="text-xs text-muted-foreground">
            {blocks.length} كتلة · نسخة المسودة {rev}
          </span>

          <span className="ms-auto flex flex-wrap items-center gap-2">
            <form action={saveAction} className="contents">
              <input type="hidden" name="blocks" value={serialized} />
              <input type="hidden" name="rev" value={String(rev)} />
              <input type="hidden" name="revisionId" value={revisionId ?? ""} />
              <Button type="submit" size="sm" disabled={readOnly || !dirty}>
                <Save />
                حفظ المسودة
              </Button>
            </form>

            <Link
              href={`/admin/content/${pageId}/preview`}
              className={cn(
                "inline-flex h-8 items-center gap-1.5 rounded-lg border border-input px-3 text-sm font-medium transition-colors hover:bg-muted"
              )}
            >
              <Eye className="size-4" />
              معاينة
            </Link>

            <form action={publishAction} className="contents">
              <input type="hidden" name="revisionId" value={revisionId ?? ""} />
              <Button type="submit" size="sm" variant="default" disabled={publishDisabled} title={publishHint}>
                <Rocket />
                نشر
              </Button>
            </form>

            {revisionId && (
              <form action={discardAction} className="contents">
                <input type="hidden" name="revisionId" value={revisionId} />
                <Button type="submit" size="sm" variant="outline" disabled={readOnly}>
                  <Undo2 />
                  إسقاط المسودة
                </Button>
              </form>
            )}
          </span>
        </div>

        {publishHint && <p className="text-xs text-muted-foreground">{publishHint}</p>}

        {publicPath && (
          <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
            الرابط العام:
            <Link href={publicPath} target="_blank" className="inline-flex items-center gap-1 hover:text-primary hover:underline">
              <span dir="ltr">{publicPath}</span>
              <ExternalLink className="size-3" />
            </Link>
          </p>
        )}
      </Card>

      {/* ── موانع النشر — رموزٌ من القاعدة تُترجَم هنا ────────────────── */}
      {blockers.length > 0 && (
        <Card className="space-y-2 border-amber-300 bg-amber-50 p-4 text-amber-900 dark:border-amber-700 dark:bg-amber-950 dark:text-amber-100">
          <p className="flex items-center gap-2 font-semibold">
            <TriangleAlert className="size-4" />
            قبل النشر — {blockers.length === 1 ? "ملاحظة واحدة" : `${blockers.length} ملاحظات`}
          </p>
          <ul className="list-inside list-disc space-y-1 text-sm leading-relaxed">
            {blockers.map((code) => (
              <li key={code}>{publishBlockerMessage(code)}</li>
            ))}
          </ul>
          <p className="text-xs">
            هذه القائمة تأتي من قاعدة البيانات نفسها لا من فحصٍ في المتصفح — فما تراه هنا هو ما
            سيرفضه النشر بالضبط.
          </p>
        </Card>
      )}

      {/* ── الكتل ─────────────────────────────────────────────────────── */}
      <div className="flex items-center gap-1.5">
        <h3 className="font-heading text-base font-bold">كتل الصفحة</h3>
        <HelpTip>
          تُعرض في الموقع بهذا الترتيب من الأعلى للأسفل. اسحب البطاقة أو استعمل السهمين، ثم احفظ
          المسودة — لا شيء يصل الموقع العام قبل النشر.
        </HelpTip>
      </div>

      {blocks.length === 0 && (
        <Card className="p-5 text-sm text-muted-foreground">
          لا كتل في هذه الصفحة بعد — أضف أول كتلة من البطاقة أدناه.
        </Card>
      )}

      <div className="space-y-3">
        {blocks.map((block, index) => (
          <BlockCard
            key={block.id}
            block={block}
            index={index}
            siblings={blocks.length}
            depth={0}
            disabled={readOnly}
            pageKind={pageKind}
            pageTypes={allTypes}
            onPatch={patchBlock}
            onRemove={removeBlock}
            onMove={moveBlock}
            onAddChild={addChild}
            dragging={dragFrom === index}
            dragProps={{
              draggable: !readOnly,
              onDragStart: () => setDragFrom(index),
              onDragOver: (event) => {
                if (dragFrom !== null) event.preventDefault();
              },
              onDrop: (event) => {
                event.preventDefault();
                if (dragFrom !== null) moveRootTo(dragFrom, index);
                setDragFrom(null);
              },
              onDragEnd: () => setDragFrom(null),
            }}
          />
        ))}
      </div>

      <AddBlockCard pageKind={pageKind} pageTypes={allTypes} disabled={readOnly} onAdd={addRoot} />

      {/* ── القالب: تصديرٌ واستيراد بلا معرض (العقد §١٢) ───────────────── */}
      <Card className="space-y-3 p-4">
        <div className="flex items-center gap-1.5">
          <h3 className="font-heading text-base font-bold">القالب</h3>
          <HelpTip>
            القالب هو لقطة الصفحة نفسها ملفَ JSON. والاستيراد يعيد سكّ كل مفتاح — وإلا لصق
            القالب ترجمات صفحته الأصلية على صفحتك الجديدة.
          </HelpTip>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button type="button" variant="outline" size="sm" onClick={downloadTemplate}>
            <Download />
            تصدير الكتل المعروضة
          </Button>
        </div>
        <details className="text-sm">
          <summary className="cursor-pointer text-muted-foreground">استيراد قالب</summary>
          <form action={importAction} className="mt-3 space-y-2">
            <Label htmlFor="template-json" className="text-xs text-muted-foreground">
              الصق محتوى ملف القالب
            </Label>
            <Textarea id="template-json" name="template" rows={5} dir="ltr" disabled={readOnly} />
            <p className="text-xs text-muted-foreground">
              الاستيراد يستبدل مسودة هذه الصفحة بالكامل، ولا يمسّ المنشور قبل أن تضغط «نشر».
            </p>
            <Button type="submit" variant="outline" size="sm" disabled={readOnly}>
              <Upload />
              استيراد واستبدال المسودة
            </Button>
          </form>
        </details>
      </Card>

      <div className="pb-10" />
    </div>
  );
}

// ---------------------------------------------------------------------------

function AddBlockCard({
  pageKind,
  pageTypes,
  disabled,
  onAdd,
}: {
  pageKind: string;
  pageTypes: readonly string[];
  disabled: boolean;
  onAdd: (type: BuilderBlockType) => void;
}) {
  const [type, setType] = React.useState<BuilderBlockType>("rich-text");
  const reason = placementBlockReason(type, pageKind, pageTypes);

  return (
    <Card className="space-y-3 p-4">
      <div className="flex items-center gap-1.5">
        <h3 className="font-heading text-base font-bold">إضافة كتلة</h3>
        <HelpTip>
          تُضاف في آخر الصفحة بمحتوى فارغ. الكتلة التي ينقصها حقلٌ إلزامي لا تظهر على الموقع
          إطلاقاً — ولا تُنشر الصفحة قبل ملئه.
        </HelpTip>
      </div>
      <div className="flex flex-wrap items-end gap-3">
        <div className="min-w-52 flex-1 space-y-1.5">
          <Label htmlFor="add-block-type">نوع الكتلة</Label>
          <select
            id="add-block-type"
            className={fieldControlClass}
            value={type}
            disabled={disabled}
            onChange={(event) => setType(event.target.value as BuilderBlockType)}
          >
            {BLOCK_CATALOGUE.map((def) => (
              <option key={def.type} value={def.type}>
                {blockLabel(def.type).label}
              </option>
            ))}
          </select>
        </div>
        <Button
          type="button"
          variant="outline"
          disabled={disabled || reason !== null}
          title={reason ?? undefined}
          onClick={() => onAdd(type)}
        >
          <Plus />
          إضافة كتلة
        </Button>
      </div>
      <p className="text-xs leading-relaxed text-muted-foreground">
        {reason ?? blockLabel(type).hint}
      </p>
      <Separator />
      <p className="text-xs text-muted-foreground">
        الإضافة والحذف والترتيب كلها في المسودة — لا شيء يصل الموقع العام قبل «نشر».
      </p>
    </Card>
  );
}

function StatusRow({ status }: { status: Props["status"] }) {
  const errorMessage = builderErrorMessage(status.error, status.errorBlock);
  return (
    <>
      {status.saved && (
        <Card className="flex flex-row items-center gap-3 border-emerald-300 bg-emerald-50 p-4 text-emerald-900 dark:border-emerald-700 dark:bg-emerald-950 dark:text-emerald-100">
          <CheckCircle2 className="size-5 shrink-0" />
          <p className="text-sm font-medium">
            حُفظت المسودة. لم يتغيّر شيء في الموقع العام بعد — الظهور يبدأ من زر «نشر».
          </p>
        </Card>
      )}
      {status.published && (
        <Card className="flex flex-row items-center gap-3 border-emerald-300 bg-emerald-50 p-4 text-emerald-900 dark:border-emerald-700 dark:bg-emerald-950 dark:text-emerald-100">
          <CheckCircle2 className="size-5 shrink-0" />
          <p className="text-sm font-medium">نُشرت الصفحة — {status.published}.</p>
        </Card>
      )}
      {status.discarded && (
        <Card className="flex flex-row items-center gap-3 border-amber-300 bg-amber-50 p-4 text-amber-900 dark:border-amber-700 dark:bg-amber-950 dark:text-amber-100">
          <TriangleAlert className="size-5 shrink-0" />
          <p className="text-sm font-medium">
            أُسقطت المسودة — المعروض الآن هو النسخة المنشورة على الموقع.
          </p>
        </Card>
      )}
      {status.imported && (
        <Card className="flex flex-row items-center gap-3 border-emerald-300 bg-emerald-50 p-4 text-emerald-900 dark:border-emerald-700 dark:bg-emerald-950 dark:text-emerald-100">
          <CheckCircle2 className="size-5 shrink-0" />
          <p className="text-sm font-medium">
            استُورد القالب في المسودة بمفاتيح جديدة — راجعه ثم انشر.
          </p>
        </Card>
      )}
      {errorMessage && (
        <Card className="flex flex-row items-start gap-3 border-red-300 bg-red-50 p-4 text-red-900 dark:border-red-700 dark:bg-red-950 dark:text-red-100">
          <XCircle className="mt-0.5 size-5 shrink-0" />
          <p className="text-sm leading-relaxed font-medium">{errorMessage}</p>
        </Card>
      )}
    </>
  );
}
