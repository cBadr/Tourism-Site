"use client";

import * as React from "react";
import { useFormStatus } from "react-dom";
import { Loader2, UserCheck } from "lucide-react";

import { formatMoney } from "@/components/booking/format";
import { HelpTip } from "@/components/shared/HelpTip";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { controlClass } from "../../_components/booking-ui";

/**
 * بطاقة الإسناد اليدوي — تظهر بعد خطوة تأكيد صريحة (رابط ‎?confirm=assign‎)،
 * فلا يقع تجاوز البث الآلي بضغطة واحدة.
 *
 * مكوّن عميل لسبب واحد: **معاينة الهامش لحظة الكتابة**. المستحق الذي يكتبه
 * التشغيل هو ما سيدفعه الموقع للمتعهد، والفرق بينه وبين إجمالي الحجز هو ربح
 * الرحلة الحقيقي — ورؤيته *قبل* الضغط تمنع إسناداً خاسراً بدل أن تشرحه بعده.
 *
 * وهذه معاينة لا قرار: القرار الملزِم (رفض المستحق الذي يهبط بالهامش تحت
 * أرضيته) يقع داخل دالة `manual_assign` في قاعدة البيانات، ولو عُطِّل جافاسكربت
 * لعمل النموذج كما هو وبقيت الحراسة قائمة.
 *
 * لا يستورد شيئاً من طبقة الخادم: القائمة والأرقام والإجراء كلها props من
 * الصفحة الخادمية، ورابط التراجع يصل children جاهزاً (المسارات مُنمَّطة).
 */

export type PartnerOption = { id: string; label: string };

function SubmitButton({ disabled }: { disabled: boolean }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" variant="destructive" disabled={disabled || pending}>
      {pending ? <Loader2 className="animate-spin" /> : <UserCheck />}
      تأكيد الإسناد اليدوي
    </Button>
  );
}

export function ManualAssignForm({
  action,
  partners,
  bookingTotal,
  currency,
  marginFloor,
  disabled,
  children,
}: {
  action: (formData: FormData) => void | Promise<void>;
  partners: PartnerOption[];
  /** إجمالي الحجز كما خزّنته `create_booking` — لا يُحسب هنا ولا يُعدَّل */
  bookingTotal: number;
  currency: string;
  /** أرضية الهامش من إعدادات الإسناد — `null` قبل تنفيذ الهجرة */
  marginFloor: number | null;
  disabled: boolean;
  /** رابط التراجع — يُبنى في الصفحة الخادمية حفاظاً على تنميط المسارات */
  children?: React.ReactNode;
}) {
  const [payoutText, setPayoutText] = React.useState("");

  const payout = payoutText.trim() === "" ? null : Number(payoutText);
  const validPayout = payout !== null && Number.isFinite(payout) && payout >= 0;
  // طرح عرضٍ لا قرار — الحراسة الملزِمة في `manual_assign` داخل قاعدة البيانات
  const margin = validPayout ? bookingTotal - payout : null;
  const loss = margin !== null && margin < 0;
  const thin =
    margin !== null && !loss && marginFloor !== null && marginFloor > 0 && margin < marginFloor;

  return (
    <form
      action={action}
      className="space-y-4 rounded-lg border border-amber-300 bg-amber-50 p-4 dark:border-amber-700 dark:bg-amber-950"
    >
      <div className="space-y-1">
        <p className="font-heading text-sm font-bold text-amber-900 dark:text-amber-100">
          إسناد يدوي — تجاوز لدورة البث
        </p>
        <p className="text-sm leading-relaxed text-amber-900/90 dark:text-amber-100/90">
          يُغلق الطلب على المتعهد الذي تختاره فوراً، وتُلغى كل العروض المفتوحة عند غيره، وينتقل
          الحجز إلى «مُسند». استخدمه حين تستنفد الموجات أو حين تتفق هاتفياً مع شريك بعينه —
          وسجّل السبب دائماً.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="manual-partner" className="flex items-center gap-1.5">
            المتعهد المنفِّذ
            <HelpTip>
              القائمة تعرض المتعهدين <span className="font-semibold">المعتمدين</span> وحدهم — غير
              المعتمد لا تدخل أسعاره التسعير ولا يجوز أن تُسند له رحلة. اعتمد الشريك من ملفه أولاً
              إن لم تجده هنا.
            </HelpTip>
          </Label>
          <select
            id="manual-partner"
            name="manual.subcontractor_id"
            required
            disabled={disabled}
            defaultValue=""
            className={controlClass}
          >
            <option value="" disabled>
              — اختر متعهداً —
            </option>
            {partners.map((partner) => (
              <option key={partner.id} value={partner.id}>
                {partner.label}
              </option>
            ))}
          </select>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="manual-payout" className="flex items-center gap-1.5">
            مستحق المتعهد (بالجنيه)
            <HelpTip>
              ما سيقبضه المتعهد عن الرحلة — سعر شراء لا سعر بيع، ولا علاقة له بما دفعه العميل.
              في الإسناد الآلي يُؤخذ من قائمة أسعار المتعهد نفسه؛ وهنا تكتبه أنت لأنك أنت من
              اتفق عليه.
            </HelpTip>
          </Label>
          <Input
            id="manual-payout"
            name="manual.payout"
            type="number"
            inputMode="decimal"
            dir="ltr"
            step="1"
            min={0}
            required
            disabled={disabled}
            value={payoutText}
            onChange={(e) => setPayoutText(e.target.value)}
            placeholder="1800"
          />
        </div>
      </div>

      {/* معاينة الهامش — تتبع ما تكتبه قبل أي حفظ */}
      <div
        className={cn(
          "flex flex-wrap items-center gap-x-4 gap-y-1 rounded-lg border p-3 text-sm",
          loss
            ? "border-red-400 bg-red-100 text-red-950 dark:border-red-600 dark:bg-red-950/70 dark:text-red-50"
            : thin
              ? "border-amber-400 bg-amber-100 text-amber-950 dark:border-amber-600 dark:bg-amber-950/70 dark:text-amber-50"
              : "border-border bg-background"
        )}
      >
        <span className="text-muted-foreground">
          إجمالي الحجز:{" "}
          <span dir="ltr" className="font-medium text-foreground">
            {formatMoney(bookingTotal, currency)}
          </span>
        </span>
        <span className="flex items-center gap-1.5">
          الهامش الحقيقي:
          <span dir="ltr" className="font-bold">
            {margin === null ? "—" : formatMoney(margin, currency)}
          </span>
          <HelpTip>
            إجمالي الحجز ناقص مستحق المتعهد — ربح الموقع الفعلي من هذه الرحلة. معاينة إرشادية،
            والرفض النهائي عند نزوله تحت الأرضية يقع في قاعدة البيانات لا هنا.
          </HelpTip>
        </span>
        {loss && (
          <span className="font-semibold">
            تحذير: هذا المستحق يجعل الرحلة خسارة — الموقع سيدفع أكثر مما قبضه.
          </span>
        )}
        {thin && (
          <span className="font-semibold">
            الهامش دون الأرضية المضبوطة في إعدادات الإسناد ({formatMoney(marginFloor ?? 0, currency)}).
          </span>
        )}
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="manual-note" className="flex items-center gap-1.5">
          سبب الإسناد اليدوي
          <HelpTip>
            إلزامي: يُسجَّل في سجل الطلب ويبقى مرجعاً لأي مراجعة مالية لاحقة. مثال: «استُنفدت
            الموجتان، اتُّفق هاتفياً مع الشريك على ١٨٠٠».
          </HelpTip>
        </Label>
        <Input
          id="manual-note"
          name="manual.note"
          required
          disabled={disabled}
          placeholder="سبب التدخل اليدوي — إلزامي"
        />
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <SubmitButton disabled={disabled || partners.length === 0} />
        {children}
      </div>

      {partners.length === 0 && (
        <p className="text-sm text-amber-900 dark:text-amber-100">
          لا يوجد متعهد معتمد في السجل — اعتمد شريكاً واحداً على الأقل من شاشة المتعهدين قبل
          الإسناد اليدوي.
        </p>
      )}
    </form>
  );
}
