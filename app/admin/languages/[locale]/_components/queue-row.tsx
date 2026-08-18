import { Check, Send } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { controlClass } from "../../../orders/_components/booking-ui";
import { isMissingRow, type QueueRow, StaleBadge, StatusBadge } from "../../_components/languages-ui";
import { saveTranslation } from "../actions";

/**
 * صفٌّ واحد في طابور المراجعة — أُخرج من `page.tsx` ليُوزن ويُقاس وحده.
 *
 * ══════════════════════════════════════════════════════════════════════════
 *  🔴 ما حُذف من هذا الصف، ولماذا كان حذفه هو الإصلاح
 * ══════════════════════════════════════════════════════════════════════════
 *
 * شكا المالك (2026-08-18) أن الصفحة **ثقيلة وبطيئة التحميل**. والمقيس أن
 * السبب في الصف نفسه لا في عددها وحده:
 *
 * (١) **`<input type="hidden" name="source_text">`** — كان الأصلُ العربي يُرسَل
 *     **مرتين في كل صف**: مرةً ظاهرةً ليقرأها المراجع، ومرةً مخفيةً لتعود إلى
 *     الخادم. وأطول أصلٍ في الفهرس ١٣٦٥ محرفاً.
 *
 *     🔴 **وهو ليس ثقلاً فحسب، بل سطحُ عبثٍ**: `review_translation` **تقرأ
 *     الأصل الحيّ بنفسها** — قُرئ جسمها من `pg_get_functiondef` لا من ملف هجرة
 *     (‏D-58):
 *
 *         select c.src into v_live from public.i18n_corpus_rows() c
 *          where c.ns = v_row.namespace and c.k = v_row.key;
 *         update public.translations
 *            set source_text = coalesce(v_live, tr.source_text), ...
 *
 *     أي أن الحقل المخفي **لم يكن يُقرأ أصلاً** في مسار الاعتماد. وكان يُقرأ في
 *     مسارٍ واحد فقط: صفٌّ **ناقص** بلا معرّف، حيث تُكتب مسودته بـ
 *     `upsert_translations` (وهي تتطلّب `sourceText` وترفض الصفَّ بدونه —
 *     `v_skip`). وهناك بالضبط كان الخطر: نصٌّ يصل من المتصفح يُكتب في
 *     `source_text` **وتُحسب منه البصمة**، فترجمةٌ تبدو مطابقةً لأصلٍ لم تُترجَم
 *     عنه قط، ووسم «الأصل تغيّر» لا يشتعل. ⇒ صار المصدرُ يُقرأ في الخادم من
 *     `translation_corpus()` (‏`app/admin/languages/[locale]/actions.ts`).
 *
 * (٢) **تلميحان (`HelpTip`) في كل صف**: تلميحُ المساحة وتلميحُ الحالة، وكلاهما
 *     نصٌّ ثابتٌ من ١٠٠ إلى ٢٠٠ محرف **يتكرّر حرفياً مع كل صف**. صارا تلميحاً
 *     واحداً لكلٍّ فوق القائمة: نفس المعلومة، ومرةً واحدة.
 *
 * ⇒ فما بقي في الصف: **أربعة حقول مخفية** (اللغة والمساحة والمفتاح والمعرّف)
 *   و**حقلُ عودةٍ واحد** يحمل الترشيح والبحث ورقم الصفحة مضغوطةً في سلسلةٍ
 *   واحدة بدل حقلٍ لكلٍّ.
 *
 * ══════════════════════════════════════════════════════════════════════════
 *  🔴 «اعتمد وانشر» ليس زرَّ حفظ
 * ══════════════════════════════════════════════════════════════════════════
 *
 * الإنجليزية **حيّة**: ‏`locales.en.enabled = true` و٨٧١ صفاً منشوراً. فضغطةٌ
 * واحدة هنا **تُظهر هذا النص لزائرٍ حقيقي على `/en` فوراً** — لا مراجعةَ بعدها
 * ولا زرَّ رجوع. ولذلك يقول الزرُّ ذلك بنصّه، ويتبع **حالة اللغة الحيّة** لا
 * افتراضاً: لغةٌ مخفية ⇒ «لن يراه أحد»، وظاهرة ⇒ «يقرؤه الزائر فوراً».
 *
 * والقدرة نفسها **قائمةٌ سلفاً** ولم تُبنَ هنا من جديد (القاعدة الذهبية ١٢):
 * `review_translation(p_id, p_value, p_publish)` تأخذ علَم النشر، وهذان الزرّان
 * يمرّران `publish=0` و`publish=1` إلى نفس الإجراء. لا مسارَ ثانٍ ولا دالةَ
 * ثانية.
 */
export function QueueRowCard({
  row,
  locale,
  localeName,
  dir,
  spot,
  back,
  readOnly,
  localeEnabled,
}: {
  row: QueueRow;
  locale: string;
  /** اسم اللغة بالعربية — يظهر في تسمية حقل الترجمة */
  localeName: string;
  dir: "rtl" | "ltr";
  /** موضع النص داخل صفحته: «شبكة الخدمات»، «عنوان السيو»… */
  spot: string;
  /** حالة الشاشة مضغوطةً (ترشيح وبحث وصفحة) لتعود كما تركها بعد الحفظ */
  back: string;
  readOnly: boolean;
  /** اللغة ظاهرة للزوّار؟ — يغيّر **نصّ** زر النشر لا سلوكه */
  localeEnabled: boolean;
}) {
  const fieldId = `value-${`${row.namespace}:${row.key}`.replace(/[^a-zA-Z0-9_-]/g, "-")}`;
  const missingValue = isMissingRow(row);

  return (
    <Card className="gap-3 p-4">
      <div className="flex flex-wrap items-center gap-2">
        {spot !== "" && (
          <Badge variant="secondary" className="font-normal">
            {spot}
          </Badge>
        )}
        <code dir="ltr" className="truncate text-xs text-muted-foreground">
          {row.key}
        </code>
        <span className="ms-auto flex flex-wrap items-center gap-1.5">
          {row.stale && <StaleBadge />}
          {missingValue ? (
            <Badge variant="outline" className="font-normal text-muted-foreground">
              ناقصة
            </Badge>
          ) : (
            <StatusBadge status={row.status} />
          )}
        </span>
      </div>

      <form
        action={readOnly ? undefined : saveTranslation}
        className="grid gap-3 lg:grid-cols-2"
      >
        <input type="hidden" name="locale" value={locale} />
        <input type="hidden" name="namespace" value={row.namespace} />
        <input type="hidden" name="key" value={row.key} />
        {row.id && <input type="hidden" name="id" value={row.id} />}
        <input type="hidden" name="back" value={back} />

        <div className="space-y-1.5">
          <span className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
            الأصل العربي
            {row.stale && (
              <span className="text-red-700 dark:text-red-300">— تغيّر بعد آخر ترجمة</span>
            )}
          </span>
          <div
            dir="rtl"
            className="min-h-24 rounded-lg bg-muted/50 p-2.5 text-sm leading-relaxed whitespace-pre-wrap"
          >
            {row.sourceText}
          </div>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor={fieldId} className="text-xs">
            الترجمة ({localeName})
          </Label>
          <textarea
            id={fieldId}
            name="value"
            dir={dir}
            rows={4}
            maxLength={5000}
            defaultValue={row.value ?? ""}
            disabled={readOnly}
            placeholder={missingValue ? "اكتب الترجمة هنا، أو ولّد مسودة آلية أولاً" : undefined}
            className={cn(controlClass, "min-h-24 resize-y leading-relaxed")}
          />
          <div className="flex flex-wrap items-center justify-end gap-2">
            <Button
              type="submit"
              name="publish"
              value="0"
              size="sm"
              variant="outline"
              disabled={readOnly}
            >
              <Check />
              اعتمد بلا نشر
            </Button>
            <Button type="submit" name="publish" value="1" size="sm" disabled={readOnly}>
              <Send />
              {localeEnabled ? "اعتمد وانشر للزوّار" : "اعتمد وانشر (اللغة مخفية)"}
            </Button>
          </div>
        </div>
      </form>
    </Card>
  );
}
