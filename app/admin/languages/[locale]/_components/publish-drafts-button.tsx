"use client";

import { Upload } from "lucide-react";

import { SaveButton, type SaveMessages } from "@/components/admin/save-feedback";

/**
 * زرُّ نشرٍ جماعيٍّ بتأكيد — «انشر كل المسودات» (2026-08-17) و«انشر ما كُتب بيدٍ
 * في الهجرات» (‏`0146`) معاً.
 *
 * ⚠ **مكوّنٌ واحدٌ لزرَّين** (القاعدة ١٢: لا يُستنسخ القائم). والفرقُ بينهما
 *   **بيانات**: نصُّ الزرّ ونصُّ التأكيد ورسائلُ الحصيلة ونبرةُ اللون — كلُّها
 *   تصل من الخادم. ولو نُسخ الملفُّ لصار لسلوك التأكيد نسختان، فأُصلح عيبٌ في
 *   إحداهما وبقي في الأخرى.
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
  variant,
  savedMessages,
  errorMessages,
}: {
  label: string;
  /** نصّ نافذة التأكيد — يصل جاهزاً بالأرقام العربية من الخادم */
  confirmText: string;
  disabled: boolean;
  /** نبرةُ الزرّ — يتمايز بها الزرّان في صفٍّ واحد بلا نصٍّ إضافي */
  variant?: "default" | "secondary" | "outline";
  savedMessages: SaveMessages;
  errorMessages: SaveMessages;
}) {
  return (
    <SaveButton
      label={label}
      icon={<Upload />}
      variant={variant}
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
