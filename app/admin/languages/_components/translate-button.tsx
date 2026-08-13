"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Bot, Loader2 } from "lucide-react";

import { toArabicDigits } from "@/components/booking/format";
import { Button } from "@/components/ui/button";
import type { TranslateBatchResult } from "@/lib/i18n-types";
import { cn } from "@/lib/utils";

/**
 * زر «ترجم الباقي آلياً» — الواجهة الوحيدة لمسار `POST /api/i18n/translate`.
 *
 * لماذا مسار HTTP لا Server Action؟ لأن الترجمة عملية طويلة تُستدعى أيضاً من
 * خارج الشاشة (مهمة مجدولة أو سكربت تجهيز نسخة جديدة)، وواجهة واحدة لها أوضح
 * من منطق مكرَّر في مكانين. والمسار محروس بجلسة المدير نفسها التي تفتح هذه
 * الشاشة، فلا مفتاح إضافي يُضبط ولا سرّ جديد يُسرَّب.
 *
 * الزر لا يُترجم كل شيء بضغطة: المسار يقف عند سقف ثابت وعند ميزانية زمن،
 * ويقول في رسالته كم بقي. ضغطة أخرى تكمل — وهذا مقصود حتى لا تحرق ضغطة واحدة
 * الحصة اليومية للمزوّد المجاني.
 */

export function TranslateButton({
  locale,
  limit,
  disabled,
  label = "ترجم الباقي آلياً",
}: {
  locale: string;
  /** سقف هذه الضغطة — المسار يقصّه على سقفه الصلب على أي حال */
  limit: number;
  disabled?: boolean;
  label?: string;
}) {
  const router = useRouter();
  const [busy, setBusy] = React.useState(false);
  const [note, setNote] = React.useState<string | null>(null);
  const [failed, setFailed] = React.useState(false);

  const run = async () => {
    setBusy(true);
    setNote(null);
    setFailed(false);

    try {
      const response = await fetch("/api/i18n/translate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ locale, limit }),
      });

      const data = (await response.json()) as Partial<TranslateBatchResult>;
      const translated = typeof data.translated === "number" ? data.translated : 0;
      const message = typeof data.message === "string" ? data.message : "";

      if (data.ok === true) {
        setNote(
          translated > 0
            ? `كُتبت ${toArabicDigits(translated)} مسودة جديدة. ${message}`
            : message || "لم يُترجم شيء في هذه الضغطة."
        );
        setFailed(false);
        // المسودات الجديدة لا تظهر إلا بإعادة قراءة الطابور من الخادم
        if (translated > 0) router.refresh();
      } else {
        setNote(message || "تعذّرت الترجمة الآلية — راجع سجل الخادم.");
        setFailed(true);
      }
    } catch {
      setNote("تعذّر الاتصال بالخادم — تحقق من اتصالك ثم أعد المحاولة.");
      setFailed(true);
    } finally {
      setBusy(false);
    }
  };

  return (
    <span className="flex flex-wrap items-center gap-2">
      <Button type="button" size="sm" onClick={run} disabled={disabled || busy}>
        {busy ? <Loader2 className="animate-spin" /> : <Bot />}
        {busy ? "جارٍ الترجمة…" : label}
      </Button>
      {note && (
        <span
          role="status"
          className={cn(
            "text-xs leading-relaxed",
            failed ? "text-red-700 dark:text-red-300" : "text-muted-foreground"
          )}
        >
          {note}
        </span>
      )}
    </span>
  );
}
