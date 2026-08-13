"use client";

import * as React from "react";
import { ChevronDown, ChevronUp, Plus, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "./fields";

/**
 * محرر عناصر متكررة (أسئلة شائعة q/a، مزايا title/text) — جزيرة عميل صغيرة:
 * يدير مصفوفة العناصر في حالة محلية ويُسلسلها JSON داخل حقل مخفي واحد،
 * فيقرأها إجراء الحفظ الخادمي مع بقية حقول النموذج الكبير.
 * كل الأزرار هنا type="button" حتى لا تُرسل نموذج الصفحة.
 */

export type ItemFieldDef = {
  key: string;
  label: string;
  multiline?: boolean;
  placeholder?: string;
};

export function ItemsEditor({
  name,
  fields,
  initialItems,
  itemLabel,
  addLabel,
  disabled,
}: {
  /** اسم الحقل المخفي الذي يحمل JSON — بنمط section-<id>-items */
  name: string;
  fields: ItemFieldDef[];
  initialItems: Record<string, string>[];
  /** تسمية العنصر الواحد للترقيم — مثل «سؤال» أو «ميزة» */
  itemLabel: string;
  addLabel: string;
  disabled?: boolean;
}) {
  const [items, setItems] = React.useState<Record<string, string>[]>(initialItems);
  const baseId = React.useId();

  const emptyItem = React.useCallback(() => {
    const out: Record<string, string> = {};
    for (const f of fields) out[f.key] = "";
    return out;
  }, [fields]);

  const update = (index: number, key: string, value: string) =>
    setItems((prev) => prev.map((it, i) => (i === index ? { ...it, [key]: value } : it)));

  const remove = (index: number) => setItems((prev) => prev.filter((_, i) => i !== index));

  const move = (index: number, dir: -1 | 1) =>
    setItems((prev) => {
      const target = index + dir;
      if (target < 0 || target >= prev.length) return prev;
      const next = [...prev];
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });

  return (
    <div className="space-y-3">
      <input type="hidden" name={name} value={JSON.stringify(items)} />

      {items.length === 0 && (
        <p className="text-sm text-muted-foreground">لا عناصر بعد — أضف أول عنصر.</p>
      )}

      {items.map((item, i) => (
        <div key={`${baseId}-${i}`} className="space-y-2.5 rounded-lg border border-border p-3">
          <div className="flex items-center gap-1">
            <span className="text-xs font-semibold text-muted-foreground">
              {itemLabel} {i + 1}
            </span>
            <span className="ms-auto inline-flex items-center gap-0.5">
              <Button
                type="button"
                variant="ghost"
                size="icon-xs"
                aria-label="تحريك لأعلى"
                disabled={disabled || i === 0}
                onClick={() => move(i, -1)}
              >
                <ChevronUp />
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="icon-xs"
                aria-label="تحريك لأسفل"
                disabled={disabled || i === items.length - 1}
                onClick={() => move(i, 1)}
              >
                <ChevronDown />
              </Button>
              <Button
                type="button"
                variant="destructive"
                size="icon-xs"
                aria-label="حذف العنصر"
                disabled={disabled}
                onClick={() => remove(i)}
              >
                <Trash2 />
              </Button>
            </span>
          </div>

          {fields.map((f) => {
            const controlId = `${baseId}-${i}-${f.key}`;
            return (
              <div key={f.key} className="space-y-1">
                <Label htmlFor={controlId} className="text-xs text-muted-foreground">
                  {f.label}
                </Label>
                {f.multiline ? (
                  <Textarea
                    id={controlId}
                    rows={2}
                    value={item[f.key] ?? ""}
                    placeholder={f.placeholder}
                    disabled={disabled}
                    onChange={(e) => update(i, f.key, e.target.value)}
                  />
                ) : (
                  <Input
                    id={controlId}
                    value={item[f.key] ?? ""}
                    placeholder={f.placeholder}
                    disabled={disabled}
                    onChange={(e) => update(i, f.key, e.target.value)}
                  />
                )}
              </div>
            );
          })}
        </div>
      ))}

      <Button
        type="button"
        variant="outline"
        size="sm"
        disabled={disabled}
        onClick={() => setItems((prev) => [...prev, emptyItem()])}
      >
        <Plus />
        {addLabel}
      </Button>
    </div>
  );
}
