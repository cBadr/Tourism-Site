"use client";

import * as React from "react";
import {
  ChevronDown,
  ChevronUp,
  Eye,
  EyeOff,
  GripVertical,
  Plus,
  Trash2,
  TriangleAlert,
} from "lucide-react";

import { HelpTip } from "@/components/shared/HelpTip";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { fieldControlClass } from "@/app/admin/content/_components/fields";
import { cn } from "@/lib/utils";
import {
  BLOCK_CATALOGUE,
  blockDef,
  blockLabel,
  fieldLabel,
  placementBlockReason,
} from "@/lib/page-builder/registry";
import { blockRenders, type BuilderBlock, type BuilderBlockType } from "@/lib/page-builder-types";
import { BlockFields } from "./block-fields";

/**
 * بطاقة كتلةٍ واحدة. الكتلة التخطيطية `columns` تعرض أبناءها بداخلها — وهو
 * «التداخل» كما شُحن: عمقٌ في **صفوف** الجدول لا في `jsonb` (العقد §٣).
 */

export type BlockCardProps = {
  block: BuilderBlock;
  index: number;
  siblings: number;
  depth: 0 | 1;
  disabled: boolean;
  pageKind: string;
  /** أنواع كل كتل الصفحة — لفحص المواضع قبل عرض خيارٍ سيُرفض */
  pageTypes: readonly string[];
  onPatch: (id: string, patch: Partial<BuilderBlock>) => void;
  onRemove: (id: string) => void;
  onMove: (id: string, dir: -1 | 1) => void;
  onAddChild?: (parentId: string, type: BuilderBlockType) => void;
  dragProps?: React.HTMLAttributes<HTMLDivElement> & { draggable?: boolean };
  dragging?: boolean;
};

export function BlockCard({
  block,
  index,
  siblings,
  depth,
  disabled,
  pageKind,
  pageTypes,
  onPatch,
  onRemove,
  onMove,
  onAddChild,
  dragProps,
  dragging,
}: BlockCardProps) {
  const [open, setOpen] = React.useState(false);
  const def = blockDef(block.type);
  const label = blockLabel(block.type);
  const renders = blockRenders(block.type, block.content ?? {});
  const children = block.children ?? [];

  return (
    <Card
      {...dragProps}
      className={cn(
        "space-y-3 p-4",
        depth === 1 && "border-dashed bg-muted/30",
        dragging && "opacity-50"
      )}
    >
      <div className="flex flex-wrap items-center gap-2">
        {depth === 0 && dragProps?.draggable && (
          <GripVertical className="size-4 shrink-0 cursor-grab text-muted-foreground" aria-hidden />
        )}
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="flex min-w-0 items-center gap-1.5 text-start"
        >
          <span className="font-heading text-sm font-bold">{label.label}</span>
          {open ? (
            <ChevronUp className="size-3.5 text-muted-foreground" />
          ) : (
            <ChevronDown className="size-3.5 text-muted-foreground" />
          )}
        </button>
        <HelpTip>{label.hint}</HelpTip>

        {!def && (
          <Badge variant="destructive" className="gap-1">
            <TriangleAlert className="size-3" />
            نوع غير مسجَّل
          </Badge>
        )}
        {!block.visible && <Badge variant="secondary">مخفية</Badge>}
        {def && block.visible && !renders && (
          <Badge variant="destructive" className="gap-1">
            <TriangleAlert className="size-3" />
            ينقصها حقل إلزامي
          </Badge>
        )}

        <span className="ms-auto flex items-center gap-0.5">
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            aria-label={block.visible ? "إخفاء الكتلة" : "إظهار الكتلة"}
            title={block.visible ? "إخفاء من الصفحة" : "إظهار في الصفحة"}
            disabled={disabled}
            onClick={() => onPatch(block.id, { visible: !block.visible })}
          >
            {block.visible ? <Eye /> : <EyeOff />}
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            aria-label="تحريك الكتلة لأعلى"
            disabled={disabled || index === 0}
            onClick={() => onMove(block.id, -1)}
          >
            <ChevronUp />
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            aria-label="تحريك الكتلة لأسفل"
            disabled={disabled || index === siblings - 1}
            onClick={() => onMove(block.id, 1)}
          >
            <ChevronDown />
          </Button>
          <Button
            type="button"
            variant="destructive"
            size="icon-sm"
            aria-label="حذف الكتلة"
            title="حذف الكتلة من المسودة"
            disabled={disabled}
            onClick={() => onRemove(block.id)}
          >
            <Trash2 />
          </Button>
        </span>
      </div>

      {/* الكتلة الناقصة لا تُصيَّر إطلاقاً — والقاعدة نفسها تمنع نشرها.
          قولها هنا صراحةً أهون من صفحةٍ تُنشر ناقصةً بلا سبب مفهوم. */}
      {def && block.visible && !renders && (
        <p className="text-xs leading-relaxed text-muted-foreground">
          هذه الكتلة لن تظهر على الصفحة إطلاقاً ما دام حقلها الإلزامي فارغاً (
          {def.requiredFields
            .map((f) => (f === "items" ? "عنصر واحد على الأقل" : fieldLabel(f).label))
            .join(" · ")}
          ) —
          ولن تُنشر الصفحة قبل ملئه أو إخفاء الكتلة.
        </p>
      )}

      {open && def && (
        <BlockFields
          def={def}
          content={block.content ?? {}}
          disabled={disabled}
          idPrefix={`b-${block.id}`}
          onChange={(next) => onPatch(block.id, { content: next })}
        />
      )}

      {open && !def && (
        <p className="text-sm text-muted-foreground">
          هذا النوع غير مسجَّل في كتالوج الكتل، فلا يعرف المنشئ حقوله ولا يحرّرها. احذفها أو
          سجّل نوعها في الكتالوج بهجرة.
        </p>
      )}

      {/* الأبناء — لكتلة التخطيط وحدها */}
      {def?.acceptsChildren && (
        <div className="space-y-3 rounded-lg border border-border/70 bg-background/60 p-3">
          <div className="flex items-center gap-1.5">
            <span className="text-sm font-medium">الأعمدة</span>
            <HelpTip>
              كل عمود كتلةٌ مستقلة لها حقولها — وهذا ما يجعل نصوصه مفهرسة للترجمة تلقائياً.
              الحد {def.maxChildren ?? "بلا حد"} أعمدة.
            </HelpTip>
            <span className="ms-auto text-xs text-muted-foreground">{children.length} عموداً</span>
          </div>

          {children.length === 0 && (
            <p className="text-sm text-muted-foreground">لا أعمدة بعد — أضف أول عمود.</p>
          )}

          {children.map((child, childIndex) => (
            <BlockCard
              key={child.id}
              block={child}
              index={childIndex}
              siblings={children.length}
              depth={1}
              disabled={disabled}
              pageKind={pageKind}
              pageTypes={pageTypes}
              onPatch={onPatch}
              onRemove={onRemove}
              onMove={onMove}
            />
          ))}

          {onAddChild && (!def.maxChildren || children.length < def.maxChildren) && (
            <AddChildPicker
              parentId={block.id}
              disabled={disabled}
              pageKind={pageKind}
              pageTypes={pageTypes}
              onAdd={onAddChild}
            />
          )}
        </div>
      )}
    </Card>
  );
}

/** منتقي نوع العمود — الكتل التخطيطية مستبعدة (لا حفيد، العقد §٣) */
function AddChildPicker({
  parentId,
  disabled,
  pageKind,
  pageTypes,
  onAdd,
}: {
  parentId: string;
  disabled: boolean;
  pageKind: string;
  pageTypes: readonly string[];
  onAdd: (parentId: string, type: BuilderBlockType) => void;
}) {
  const [type, setType] = React.useState<BuilderBlockType>("rich-text");
  const options = BLOCK_CATALOGUE.filter((def) => !def.acceptsChildren);
  const reason = placementBlockReason(type, pageKind, pageTypes);

  return (
    <div className="flex flex-wrap items-end gap-2">
      <div className="min-w-44 flex-1 space-y-1">
        <Label htmlFor={`add-child-${parentId}`} className="text-xs text-muted-foreground">
          نوع العمود
        </Label>
        <select
          id={`add-child-${parentId}`}
          className={fieldControlClass}
          value={type}
          disabled={disabled}
          onChange={(e) => setType(e.target.value as BuilderBlockType)}
        >
          {options.map((def) => (
            <option key={def.type} value={def.type}>
              {blockLabel(def.type).label}
            </option>
          ))}
        </select>
      </div>
      <Button
        type="button"
        variant="outline"
        size="sm"
        disabled={disabled || reason !== null}
        title={reason ?? undefined}
        onClick={() => onAdd(parentId, type)}
      >
        <Plus />
        إضافة عمود
      </Button>
      {reason && <p className="w-full text-xs text-muted-foreground">{reason}</p>}
    </div>
  );
}
