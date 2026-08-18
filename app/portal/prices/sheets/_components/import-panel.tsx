"use client";

import { useActionState } from "react";
import { AlertTriangle, CheckCircle2, FileSearch, Upload } from "lucide-react";

import { toArabicDigits } from "@/components/booking/format";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import type { ImportState } from "../actions";

/**
 * لوحة الاستيراد — الزرّان يرسلان الملف نفسه:
 *   «فحص الملف»  ⇒ الحكم كاملاً بلا كتابة حرف.
 *   «استيراد»    ⇒ يكتب المقبول ويترك المرفوض، ويعرض التقرير نفسه.
 *
 * 🔴 التقرير يُعرض صفّاً صفّاً بسببه — لا شريط «تم الاستيراد» ولا عدّاد وحده.
 * استيرادٌ جزئي صامت أسوأ من رفضٍ صريح: المتعهد يظن أن المئة دخلت وقد دخل ٩٤.
 *
 * مكوّن عميل لأن التقرير قد يبلغ مئات الأسطر ولا يسع query string، ولأن الملف
 * يُرفع ويُقرأ في نداء واحد بلا تحويل يفقده.
 */

const ACTION_LABELS: Record<string, string> = {
  created: "أُضيف",
  updated: "حُدِّث",
  "created-preview": "سيُضاف",
  "updated-preview": "سيُحدَّث",
  rejected: "مرفوض",
};

export function ImportPanel({
  action,
  templateHref,
  disabled,
}: {
  action: (prev: ImportState, formData: FormData) => Promise<ImportState>;
  templateHref: string;
  disabled: boolean;
}) {
  const [state, formAction, pending] = useActionState<ImportState, FormData>(action, {
    status: "idle",
  });

  return (
    <Card className="gap-4 p-5">
      <div className="flex flex-wrap items-center gap-2">
        <Upload className="size-4 shrink-0 text-primary" aria-hidden="true" />
        <h3 className="font-heading text-base font-bold">استيراد مسارات من ملف</h3>
        <a
          href={templateHref}
          className="ms-auto text-sm text-primary underline-offset-4 hover:underline"
        >
          نزّل قالب CSV
        </a>
      </div>

      <p className="text-sm leading-relaxed text-muted-foreground">
        القالب فيه أعمدة فئاتك أنت وحدها. اكتب إحداثيات كل مكان <strong>مرة واحدة</strong>؛
        وفي الصفوف التالية يكفي اسم المكان نفسه حرفياً وتُؤخذ إحداثياته تلقائياً.
        الاستيراد يكتب في المسودات فقط — ولا يمسّ مساراً معتمداً أو قيد المراجعة.
      </p>

      <form action={formAction} className="flex flex-wrap items-center gap-3">
        <input
          type="file"
          name="file"
          accept=".csv,text/csv"
          required
          disabled={disabled || pending}
          className="min-w-0 flex-1 rounded-lg border border-input bg-background px-3 py-2 text-sm file:me-3 file:rounded-md file:border-0 file:bg-secondary file:px-3 file:py-1.5 file:text-sm file:text-secondary-foreground"
        />
        <Button
          type="submit"
          name="intent"
          value="check"
          variant="outline"
          disabled={disabled || pending}
        >
          <FileSearch aria-hidden="true" />
          فحص الملف
        </Button>
        <Button type="submit" name="intent" value="commit" disabled={disabled || pending}>
          <Upload aria-hidden="true" />
          استيراد
        </Button>
      </form>

      {state.status === "error" && (
        <p className="rounded-lg border border-destructive/40 bg-destructive/10 p-3 text-sm leading-relaxed">
          {state.message}
        </p>
      )}

      {state.status === "done" && (
        <div className="space-y-3">
          <div className="flex flex-wrap items-center gap-2 text-sm">
            {state.committed ? (
              <CheckCircle2 className="size-4 text-emerald-600" aria-hidden="true" />
            ) : (
              <FileSearch className="size-4 text-primary" aria-hidden="true" />
            )}
            <span className="font-medium">
              {state.committed ? "نتيجة الاستيراد" : "نتيجة الفحص (لم يُكتب شيء)"}
            </span>
            <Badge variant="secondary">مقبول {toArabicDigits(state.accepted)}</Badge>
            {state.rejected > 0 && (
              <Badge variant="outline" className="border-amber-400 text-amber-700 dark:text-amber-300">
                مرفوض {toArabicDigits(state.rejected)}
              </Badge>
            )}
          </div>

          {state.unknownHeaders.length > 0 && (
            <p className="flex items-start gap-2 text-xs leading-5 text-muted-foreground">
              <AlertTriangle className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
              أعمدة لا تطابق فئةً تغطّيها ولا عموداً معروفاً: {state.unknownHeaders.join(" · ")}
              — الصفوف التي فيها قيمة في هذه الأعمدة مرفوضة، وسببها مذكور أدناه.
            </p>
          )}

          <div className="overflow-x-auto">
            <table className="w-full min-w-[36rem] text-sm">
              <thead>
                <tr className="border-b border-border text-xs text-muted-foreground">
                  <th className="p-2 text-start font-medium">الصف</th>
                  <th className="p-2 text-start font-medium">المسار</th>
                  <th className="p-2 text-start font-medium">الحالة</th>
                  <th className="p-2 text-start font-medium">فئات</th>
                  <th className="p-2 text-start font-medium">السبب</th>
                </tr>
              </thead>
              <tbody>
                {state.rows.map((row) => (
                  <tr
                    key={row.rowNo}
                    className={
                      row.accepted
                        ? "border-b border-border last:border-0"
                        : "border-b border-border bg-amber-50/60 last:border-0 dark:bg-amber-950/20"
                    }
                  >
                    <td className="p-2 align-top">{toArabicDigits(row.rowNo)}</td>
                    <td className="p-2 align-top">{row.routeTitle ?? "—"}</td>
                    <td className="p-2 align-top whitespace-nowrap">
                      {ACTION_LABELS[row.action] ?? row.action}
                    </td>
                    <td className="p-2 align-top">
                      {row.accepted ? toArabicDigits(row.classesSaved) : "—"}
                    </td>
                    <td className="p-2 align-top leading-5">{row.reason ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {!state.committed && state.accepted > 0 && (
            <p className="text-xs leading-5 text-muted-foreground">
              لم يُكتب شيء بعد. اضغط «استيراد» بنفس الملف لتثبيت الصفوف المقبولة.
            </p>
          )}
        </div>
      )}
    </Card>
  );
}
