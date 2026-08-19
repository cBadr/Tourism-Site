"use client";

import type { ReactNode } from "react";
import { useActionState, useState } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  Lock,
  Map as MapIcon,
  Pencil,
  Save,
  Send,
  X,
} from "lucide-react";

import { toArabicDigits } from "@/components/booking/format";
import { Button } from "@/components/ui/button";
import type { RowEditState } from "../actions";

/**
 * صفُّ مسارٍ في جدول الكشف — **قابلٌ للتحرير في مكانه**.
 *
 * ملاحظة بدر (2026-08-19) بنصّها: «أرى مسارات الكشف وتفتقد إلى عمود السعر …
 * وكذلك الحال إمكانية التعديل الذكي عليهم بمجرد الضغط على المسار يمكن تعديل أي
 * جزء فيه ومن ثم يتم حفظها بشكل فوري ويظهر بعدها زر الإرسال للاعتماد».
 *
 * فالصفّ ثلاثةُ أوضاع لا وضعان:
 *
 * | الوضع | ما يُرى | لماذا |
 * |---|---|---|
 * | مطويّ | سعرُ كل فئة بالنظر | العمود الذي طلبه المالك — بلا فتح أي شيء |
 * | مفتوح (مسودة/مرفوضة) | حقلٌ لكل فئة + «حفظ» | الرقم لا يُسعَّر به أحد الآن، فالتحرير حرّ |
 * | 🔒 مقفول (معتمدة/قيد المراجعة) | سببُ القفل ورابطُ المحرّر الكامل | رقمُ المعتمَدة هو ما يُسعَّر به عميلٌ **الآن** |
 *
 * 🔴 **والقفل عرضٌ لا حارس.** الحارسُ في `import_price_sheet_rows` داخل Postgres،
 * ومقيسٌ بنداءٍ حيٍّ بهوية متعهدٍ اصطناعيّ في `portal_price_edit_tests.sql`
 * (‏قسم هـ): نفسُ الحمولة تُرفض على `approved` وتمرّ على `draft`. فلو زُوّر هذا
 * المكوّن في المتصفح لَما تغيّر شيء.
 *
 * ⚠ **ولا حسابَ ماليّاً هنا**: لا جمع ولا ضرب ولا تقريب — عرضٌ وتنسيقٌ فقط،
 *   والرقمُ يذهب نصّاً إلى القاعدة وتحكم عليه هي.
 *
 * وزرّ «إرسال الكشف للاعتماد» يظهر **بعد** حفظٍ ناجح لأن الحفظ يعيد المسار
 * مسودةً فيصير في الكشف ما يُرسَل — وهو ما يقيسه القسم (ح) في المجموعة:
 * `draft_count` يزيد بعد التحرير.
 */

export type EditableClass = {
  slug: string;
  title: string;
  capacity: number | null;
};

export type PricedClass = {
  slug: string;
  title: string;
  cost: number;
};

export function RouteRow({
  title,
  originLabel,
  destLabel,
  reviewNote,
  statusBadge,
  mapHref,
  editable,
  lockedNote,
  classes,
  priced,
  droppedOnSave,
  currency,
  action,
  sendAction,
}: {
  title: string;
  originLabel: string;
  destLabel: string;
  reviewNote: string | null;
  /** شارة الحالة مصيَّرةً على الخادم — مصدرٌ واحد لألوان الحالة ونصوصها */
  statusBadge: ReactNode;
  mapHref: string;
  editable: boolean;
  /** سببُ منع التحرير بنصّه — يُقال ولا يُترك الزرّ صامتاً */
  lockedNote: string | null;
  classes: EditableClass[];
  priced: PricedClass[];
  /** فئاتٌ مُسعَّرة لم يعد أسطولك يغطّيها — الحفظ لا يُبقيها، فتُقال قبل الحفظ */
  droppedOnSave: PricedClass[];
  currency: string | null;
  action: (prev: RowEditState, formData: FormData) => Promise<RowEditState>;
  sendAction: () => Promise<void>;
}) {
  const [open, setOpen] = useState(false);
  const [state, formAction, pending] = useActionState<RowEditState, FormData>(action, {
    status: "idle",
  });

  const current = new Map(priced.map((p) => [p.slug, p.cost]));

  return (
    <>
      <tr className="border-b border-border last:border-0">
        <td className="p-2 align-top">
          {editable ? (
            <button
              type="button"
              onClick={() => setOpen((v) => !v)}
              aria-expanded={open}
              className="text-start font-medium transition-colors hover:text-primary hover:underline"
            >
              {title || "مسار بلا عنوان"}
            </button>
          ) : (
            <span className="font-medium">{title || "مسار بلا عنوان"}</span>
          )}
          {reviewNote ? (
            <p className="mt-0.5 text-xs leading-5 text-amber-700 dark:text-amber-300">
              {reviewNote}
            </p>
          ) : null}
        </td>

        <td className="p-2 align-top text-muted-foreground">
          {originLabel} ← {destLabel}
        </td>

        <td className="p-2 align-top">
          {/*
           * 🔴 «لا سعر» تُقال ولا تُترك خانةً فارغة: مسارٌ بلا سعرٍ لا يدخل
           * التسعير أصلاً، فسكوتُ الجدول عنه يخفي عن المتعهد أهمَّ ما يحتاج أن يراه.
           */}
          {priced.length === 0 ? (
            <span className="text-xs text-amber-700 dark:text-amber-300">بلا سعر بعد</span>
          ) : (
            <ul className="space-y-0.5">
              {priced.map((p) => (
                <li key={p.slug} className="flex gap-1.5 whitespace-nowrap">
                  <span className="text-muted-foreground">{p.title}</span>
                  <span className="font-medium tabular-nums">{toArabicDigits(p.cost)}</span>
                </li>
              ))}
            </ul>
          )}
        </td>

        <td className="p-2 align-top">{statusBadge}</td>

        <td className="p-2 align-top">
          <div className="flex flex-wrap items-center gap-1.5">
            {editable ? (
              <Button
                type="button"
                size="sm"
                variant={open ? "secondary" : "outline"}
                onClick={() => setOpen((v) => !v)}
                aria-expanded={open}
              >
                {open ? <X aria-hidden="true" /> : <Pencil aria-hidden="true" />}
                {open ? "إغلاق" : "تعديل الأسعار"}
              </Button>
            ) : (
              <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                <Lock className="size-3" aria-hidden="true" />
                غير قابل للتعديل
              </span>
            )}
            <a
              href={mapHref}
              className="inline-flex items-center gap-1 text-xs text-primary underline-offset-4 hover:underline"
            >
              <MapIcon className="size-3" aria-hidden="true" />
              النقاط والخريطة
            </a>
          </div>
          {!editable && lockedNote ? (
            <p className="mt-1 max-w-56 text-xs leading-5 text-muted-foreground">{lockedNote}</p>
          ) : null}
        </td>
      </tr>

      {open && editable ? (
        <tr className="border-b border-border bg-muted/40 last:border-0">
          <td colSpan={5} className="p-3">
            <form action={formAction} className="space-y-3">
              <div className="flex flex-wrap items-baseline gap-2">
                <h4 className="text-sm font-semibold">تكلفتك في «{title}»</h4>
                <span className="text-xs text-muted-foreground">
                  للاتجاه الواحد{currency ? ` · بعملة ${currency}` : ""} — والمنصة تضيف هامشها
                  فوقها. الفراغ يعني «لا أغطي هذه الفئة» ولا يعني صفراً.
                </span>
              </div>

              {classes.length === 0 ? (
                <p className="text-xs leading-5 text-amber-700 dark:text-amber-300">
                  لا فئة يمكنك تسعيرها — سجّل مركبةً واحدة في الخدمة من شاشة «أسطولي» أولاً.
                </p>
              ) : (
                <div className="flex flex-wrap gap-3">
                  {classes.map((cls) => {
                    const fieldId = `cost-${title}-${cls.slug}`;
                    return (
                      <div key={cls.slug} className="min-w-36">
                        <label
                          htmlFor={fieldId}
                          className="mb-1 block text-xs leading-5 text-muted-foreground"
                        >
                          {cls.title}
                          {cls.capacity
                            ? ` · حتى ${toArabicDigits(cls.capacity)} ركاب`
                            : ""}
                        </label>
                        <input
                          id={fieldId}
                          name={`cost.${cls.slug}`}
                          type="text"
                          inputMode="decimal"
                          dir="ltr"
                          autoComplete="off"
                          defaultValue={current.get(cls.slug) ?? ""}
                          placeholder="لا أغطي"
                          disabled={pending}
                          className="w-36 rounded-lg border border-input bg-background px-2.5 py-1.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:opacity-50"
                        />
                      </div>
                    );
                  })}
                </div>
              )}

              {droppedOnSave.length > 0 ? (
                <p className="flex items-start gap-2 text-xs leading-5 text-amber-700 dark:text-amber-300">
                  <AlertTriangle className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
                  لم يعد أسطولك يغطّي:{" "}
                  {droppedOnSave.map((p) => `${p.title} (${toArabicDigits(p.cost)})`).join(" · ")} —
                  وأسعارها لا تبقى بعد الحفظ. سجّل مركبةً من الفئة أولاً إن كنت ما زلت تنفّذها.
                </p>
              ) : null}

              <div className="flex flex-wrap items-center gap-2">
                <Button type="submit" size="sm" disabled={pending || classes.length === 0}>
                  <Save aria-hidden="true" />
                  {pending ? "يُحفظ…" : "حفظ فوري"}
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  onClick={() => setOpen(false)}
                  disabled={pending}
                >
                  إغلاق بلا حفظ
                </Button>
                <span className="text-xs text-muted-foreground">
                  الحفظ لا يُرسل شيئاً للإدارة — يبقى المسار مسودةً حتى ترسل الكشف.
                </span>
              </div>
            </form>

            {state.status === "error" ? (
              <p className="mt-3 rounded-lg border border-destructive/40 bg-destructive/10 p-3 text-sm leading-relaxed">
                {state.message}
              </p>
            ) : null}

            {state.status === "saved" ? (
              <div className="mt-3 space-y-2 rounded-lg border border-emerald-300/60 bg-emerald-50/70 p-3 dark:border-emerald-800/60 dark:bg-emerald-950/30">
                <p className="flex items-center gap-2 text-sm">
                  <CheckCircle2 className="size-4 shrink-0 text-emerald-600" aria-hidden="true" />
                  حُفظ فوراً — {toArabicDigits(state.classesSaved)} فئة مُسعَّرة. المسار الآن
                  مسودة عندك ولم يصل الإدارة بعد.
                </p>
                {state.note ? (
                  <p className="text-xs leading-5 text-amber-700 dark:text-amber-300">
                    {state.note}
                  </p>
                ) : null}
                {/* 🔴 هنا وحده يظهر زرّ الإرسال — بعد حفظٍ وقع فعلاً، لا قبله */}
                <form action={sendAction}>
                  <Button type="submit" size="sm">
                    <Send aria-hidden="true" />
                    إرسال الكشف للاعتماد
                  </Button>
                </form>
                <p className="text-xs leading-5 text-muted-foreground">
                  يُرسل كل مسارات الكشف الجاهزة في طلبٍ واحد — والمعتمدة تبقى تعمل كما هي.
                </p>
              </div>
            ) : null}
          </td>
        </tr>
      ) : null}
    </>
  );
}
