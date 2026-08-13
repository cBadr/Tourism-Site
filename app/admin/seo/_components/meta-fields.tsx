"use client";

import * as React from "react";

import { toArabicDigits } from "@/components/booking/format";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import {
  META_LIMITS,
  metaFieldState,
  metaStateLabel,
  type MetaField,
  type MetaFieldState,
} from "@/lib/seo/meta";
import { fieldControlClass } from "../../content/_components/fields";

/**
 * حقل ميتاداتا بعدّاد أحرف حي — جزيرة العميل الوحيدة في مركز السيو.
 *
 * لماذا عميل أصلاً؟ لأن العدّاد يجب أن يتحرك **أثناء الكتابة**: قيمة العدّاد
 * بعد الحفظ فقط لا تمنع أحداً من كتابة عنوان يُقصّ في نتيجة البحث.
 *
 * والتدهور رشيق: بلا JavaScript يبقى الحقل حقلاً عادياً باسمه وقيمته الأولية،
 * ويظهر العدّاد بقيمته الأولى المُصيَّرة على الخادم. لا شيء يتعطّل — يتوقف
 * التحديث الحي وحده.
 *
 * التلوين اتفاقية اللوحة: كهرماني «ناقص أو خارج الحد»، ورمادي «سليم».
 * الحد **توصية لا منع**: الحفظ لا يُرفض لعنوان طويل، بل يُقال ما سيحدث له.
 */

const STATE_TONE: Record<MetaFieldState, string> = {
  empty: "text-amber-700 dark:text-amber-300",
  short: "text-amber-700 dark:text-amber-300",
  long: "text-amber-700 dark:text-amber-300",
  ok: "text-muted-foreground",
};

export function MetaCounterField({
  id,
  name,
  field,
  label,
  defaultValue,
  placeholder,
  disabled,
}: {
  id: string;
  name: string;
  field: MetaField;
  label: string;
  defaultValue: string | null;
  placeholder?: string;
  disabled?: boolean;
}) {
  const [value, setValue] = React.useState(defaultValue ?? "");
  const state = metaFieldState(value, field);
  const { max } = META_LIMITS[field];
  const length = value.trim().length;

  const counterId = `${id}-counter`;

  return (
    <div className="space-y-1.5">
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <Label htmlFor={id} className="text-xs text-muted-foreground">
          {label}
        </Label>
        <span
          id={counterId}
          dir="ltr"
          aria-live="polite"
          className={cn("text-xs tabular-nums", STATE_TONE[state])}
        >
          {toArabicDigits(length)} / {toArabicDigits(max)}
        </span>
      </div>

      {field === "title" ? (
        <Input
          id={id}
          name={name}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder={placeholder}
          disabled={disabled}
          aria-describedby={counterId}
          className={state === "ok" ? undefined : "border-amber-400 dark:border-amber-600"}
        />
      ) : (
        <textarea
          id={id}
          name={name}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder={placeholder}
          disabled={disabled}
          rows={2}
          aria-describedby={counterId}
          className={cn(
            fieldControlClass,
            "min-h-16 leading-relaxed",
            state === "ok" ? undefined : "border-amber-400 dark:border-amber-600"
          )}
        />
      )}

      <p className={cn("text-xs leading-relaxed", STATE_TONE[state])}>
        {metaStateLabel(state, field)}
      </p>
    </div>
  );
}
