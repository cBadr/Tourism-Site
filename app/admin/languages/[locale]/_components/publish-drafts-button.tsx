"use client";

import { Upload } from "lucide-react";

import { SaveButton, type SaveMessages } from "@/components/admin/save-feedback";

/**
 * زرّ «انشر كل المسودات» — طلب المالك 2026-08-17.
 *
 * ── لماذا مكوّن عميل ولا يكفي `SaveButton` مباشرةً في الصفحة ────────────────
 *
 * نشرٌ جماعيٌّ بضغطةٍ واحدة **بلا تأكيد** فخّ: الصفوف تصير مقروءةً للزائر فوراً،
 * ولا زرَّ رجوع. والتأكيد يحتاج `onClick`، **والدوال لا تعبُر حدّ الخادم إلى
 * مكوّن عميل** (وهو بعينه العيب المشروح في ترويسة `save-feedback.tsx`: مُرِّر
 * مكوّنُ أيقونة فانفجرت الصفحة و`tsc` أخضر). فيُلفّ هنا: الصفحة تمرّر **نصاً**
 * وحده، والمعالج يسكن في العميل.
 *
 * ── وبجافاسكربت مطفأة ───────────────────────────────────────────────────────
 *
 * لا نافذةَ تأكيد، **والنموذج يعمل كما هو** — وهو المسار الذي تحفظه اتفاقيات §٤.
 * ولذلك **العدد مطبوعٌ على الزرّ نفسه من الخادم** ومعه بطاقةُ المستثنى بجواره:
 * فالمعلومة التي يحتاجها قبل الضغط موجودةٌ في الصفحة المُصيَّرة لا في النافذة،
 * والنافذة **تحصيلُ إقرارٍ** لا **إبلاغُ خبر**.
 */
export function PublishDraftsButton({
  label,
  confirmText,
  disabled,
  savedMessages,
  errorMessages,
}: {
  label: string;
  /** نصّ نافذة التأكيد — يصل جاهزاً بالأرقام العربية من الخادم */
  confirmText: string;
  disabled: boolean;
  savedMessages: SaveMessages;
  errorMessages: SaveMessages;
}) {
  return (
    <SaveButton
      label={label}
      icon={<Upload />}
      // نمط «تم + مصدر» (قاعدة بدر 2026-08-17): الفعل وقع فيُسمّى بما وقع
      savedLabel="تم النشر"
      pendingLabel="جارٍ النشر…"
      failedLabel="لم يُنشر"
      size="sm"
      disabled={disabled}
      savedMessages={savedMessages}
      errorMessages={errorMessages}
      fallbackErrorMessage="لم يُنشر شيء — راجع التنبيه أعلى الصفحة."
      onClick={(event) => {
        // إلغاءُ التأكيد ⇒ لا إرسال. و`SaveButton` تُرجع حالتها إلى الساكنة
        // وحدها بعد 500ms لأن `pending` لا تصعد إطلاقاً (مشروحٌ في ترويسته).
        if (!window.confirm(confirmText)) event.preventDefault();
      }}
    />
  );
}
