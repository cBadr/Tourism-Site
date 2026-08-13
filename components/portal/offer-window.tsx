"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { AlarmClock, RotateCw, TimerOff } from "lucide-react";

import { toArabicDigits } from "@/components/booking/format";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";

/**
 * غلاف العرض ذو المهلة — الجزيرة العميلة الوحيدة في صندوق الطلبات.
 *
 * لماذا جزيرة أصلاً؟ لأن المهلة هي المعلومة الوحيدة في البطاقة التي تتغير بلا
 * تفاعل: بقيتها (المسار، الفئة، المستحق) نص خادمي ثابت يُمرَّر إلى `children`
 * فيبقى خارج حزمة المتصفح. العدّاد وحده يعيش هنا.
 *
 * ثلاث قواعد بنتها التجربة:
 * (١) **لا اختلاف ترطيب**: التصيير الأول — على الخادم وفي المتصفح — يستخدم
 *     `initialRemainingMs` المحسوب على الخادم، ثم يتولى `useEffect` النبض من
 *     ساعة المتصفح. لو حسبنا من `Date.now()` مباشرةً لاختلف الرقمان بمللي ثانية
 *     فأسقط React الترطيب.
 * (٢) **الانتهاء عرضٌ لا حكم**: تصفير العدّاد يُطفئ البطاقة ويرفع الأزرار، لكن
 *     الحكم الحقيقي في `accept_offer` — ساعة المتصفح قد تتأخر أو تُزوَّر، فلا
 *     يُبنى عليها منع ولا سماح.
 * (٣) **العدّاد لا يُقرأ صوتياً كل ثانية**: `aria-live="off"` على العدّاد،
 *     وإعلان واحد عند الانتهاء عبر `role="status"`.
 */

const pad2 = (n: number) => (n < 10 ? `0${n}` : String(n));

/** مهلة مقروءة: «٠٩:٤٧» تحت الساعة، و«١:٢٤:٠٣» فوقها */
function remainingLabel(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const seconds = total % 60;
  const core =
    hours > 0
      ? `${hours}:${pad2(minutes)}:${pad2(seconds)}`
      : `${pad2(minutes)}:${pad2(seconds)}`;
  return toArabicDigits(core);
}

const URGENT_MS = 60_000;
const SOON_MS = 5 * 60_000;

export function OfferWindow({
  expiresAt,
  initialRemainingMs,
  actions,
  children,
}: {
  /** لحظة انتهاء المهلة بصيغة ISO — null يعني عرضاً بلا مهلة (احتياط) */
  expiresAt: string | null;
  /** المتبقي بالمللي ثانية لحظة التصيير على الخادم */
  initialRemainingMs: number;
  /** أزرار القبول والرفض — تُرفع من البطاقة فور انتهاء المهلة */
  actions: React.ReactNode;
  children: React.ReactNode;
}) {
  const router = useRouter();
  const [remaining, setRemaining] = React.useState(initialRemainingMs);

  React.useEffect(() => {
    if (!expiresAt) return;
    const deadline = Date.parse(expiresAt);
    if (!Number.isFinite(deadline)) return;

    const tick = () => setRemaining(deadline - Date.now());
    tick();
    const id = window.setInterval(tick, 1000);
    return () => window.clearInterval(id);
  }, [expiresAt]);

  const timed = Boolean(expiresAt);
  const expired = timed && remaining <= 0;
  const urgent = timed && !expired && remaining <= URGENT_MS;
  const soon = timed && !expired && !urgent && remaining <= SOON_MS;

  return (
    <Card className={cn("gap-4 p-5", expired && "bg-muted/40 ring-border")}>
      {timed ? (
        <div className="flex flex-wrap items-center gap-2">
          {expired ? (
            <span
              role="status"
              className="inline-flex items-center gap-1.5 rounded-full bg-muted px-3 py-1 text-sm font-medium text-muted-foreground"
            >
              <TimerOff className="size-4 shrink-0" aria-hidden="true" />
              انتهت المهلة
            </span>
          ) : (
            <span
              role="timer"
              aria-live="off"
              className={cn(
                "inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-sm font-medium",
                urgent
                  ? "bg-red-100 text-red-900 dark:bg-red-950 dark:text-red-100"
                  : soon
                    ? "bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-100"
                    : "bg-emerald-100 text-emerald-900 dark:bg-emerald-950 dark:text-emerald-100"
              )}
            >
              <AlarmClock className="size-4 shrink-0" aria-hidden="true" />
              <span>يتبقى</span>
              <span dir="ltr" className="tabular-nums">
                {remainingLabel(remaining)}
              </span>
              <span className="sr-only">من مهلة الرد على هذا العرض</span>
            </span>
          )}
        </div>
      ) : null}

      <div className={cn(expired && "opacity-60")}>{children}</div>

      {expired ? (
        <div className="flex flex-wrap items-center gap-3 rounded-xl bg-background p-3 ring-1 ring-border">
          <p className="min-w-0 flex-1 text-xs leading-5 text-muted-foreground">
            انتهت مهلة الرد على هذا العرض فلم يعد قابلاً للقبول. حدّث الصندوق لترى ما هو مفتوح
            الآن — قد يكون العرض نفسه قد أُعيد بثه بمهلة جديدة.
          </p>
          <Button type="button" variant="outline" size="sm" onClick={() => router.refresh()}>
            <RotateCw aria-hidden="true" />
            تحديث الصندوق
          </Button>
        </div>
      ) : (
        actions
      )}
    </Card>
  );
}
