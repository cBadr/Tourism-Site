"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { LoaderCircle } from "lucide-react";

/**
 * تحديث ذاتي محدود لصفحة عودة الدفع.
 *
 * لماذا محدود؟ لأن التأكيد يأتي بالـ webhook من المزوّد وقد يتأخر ثوانيَ، وقد
 * لا يصل إطلاقاً (عملية فاشلة أو شبكة متعثرة). فحلقة تحديث أبدية تُنهك الخادم
 * وتُوهم العميل أن شيئاً يجري. المحاولات معدودة، وبعد آخرها يبقى النص واضحاً:
 * التأكيد يصل من البنك لا من هذه الصفحة، ورابط الحجز هو المرجع.
 *
 * `router.refresh()` يعيد تصيير الصفحة الخادمية فتُقرأ الحالة من قاعدة البيانات
 * من جديد — لا حالة تُستنتج في المتصفح ولا معامل رابط يُصدَّق.
 */
export function AutoRefresh({
  intervalMs = 5000,
  maxTries = 6,
  label,
}: {
  intervalMs?: number;
  maxTries?: number;
  label: string;
}) {
  const router = useRouter();
  const [done, setDone] = React.useState(false);

  React.useEffect(() => {
    let tries = 0;
    const id = window.setInterval(() => {
      tries += 1;
      if (tries > maxTries) {
        window.clearInterval(id);
        setDone(true);
        return;
      }
      router.refresh();
    }, intervalMs);

    return () => window.clearInterval(id);
  }, [intervalMs, maxTries, router]);

  if (done) return null;

  return (
    <p className="flex items-center gap-2 text-xs leading-6 text-muted-foreground">
      <LoaderCircle className="size-4 shrink-0 animate-spin" aria-hidden="true" />
      <span role="status" aria-live="polite">
        {label}
      </span>
    </p>
  );
}
