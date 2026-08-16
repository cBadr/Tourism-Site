"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Clock } from "lucide-react";

import { useT } from "@/components/site/i18n";
import { DEFAULT_LOCALE } from "@/lib/i18n-types";
import { createFormatter } from "../format";

/**
 * عدّاد مهلة الدفع — ن‑٩ (ج).
 *
 * ══════════════════════════════════════════════════════════════════════════
 *  🔴 الشرط الذي يفصل عدّاداً نافعاً عن عدّادٍ يكذب
 * ══════════════════════════════════════════════════════════════════════════
 *
 * **الموعد يصل من القاعدة ولا يُحسب هنا أبداً.** المصدر `booking_hold_until`
 * (‏`0052`) — وهي **الدالة نفسها** التي يسألها `cancel_stale_bookings` في شرطه
 * وفي ترتيبه. فلا معادلة ثانية في المتصفح، ولا `unpaid_timeout_minutes` يُقرأ
 * هنا، ولا جمعَ دقائق على `created_at`.
 *
 * ولو حُسب هنا لانحرف عن الكنس بحتمية: `booking_hold_until` تأخذ **الأبعد** من
 * (الإنشاء + المهلة) و(الموعد − المهلة)، والمالك يغيّر المهلة من اللوحة متى
 * شاء. فيرى العميل «باقٍ ٢٠ دقيقة» وحجزه ملغىً منذ ساعة — **وعدّادٌ يكذب أسوأ
 * من لا عدّاد لأنه يُطمئن**.
 *
 * ⚠ **وعند الصفر لا يُلغى شيء في المتصفح.** الكنس وحده يلغي، وشرطُه أوسع مما
 *   يعرفه هذا الملف (‏`0028` يستثني كل حجزٍ عليه نشاط إيصالٍ حديث، فمن رُفض
 *   إيصاله اليوم تمتدّ مهلته أبعد من هذا التاريخ). فالصفر يعني **أعد السؤال**:
 *   `router.refresh()` مرةً واحدة، والخادم يقول الحالة كما هي في القاعدة.
 *
 * ── ولماذا لا يُصيَّر شيءٌ قبل التركيب ──────────────────────────────────────
 *
 * الخادم لا يعرف لحظة قراءة المتصفح، فأي «باقٍ …» يُصيَّر خادمياً يختلف عن أول
 * حسابٍ بعد الترابط ⇒ تحذير hydration على عنصرٍ يتغيّر كل ثانية. فالمكوّن يعود
 * `null` حتى أول `useEffect`، **والجملة الخادمية التي فوقه هي الاحتياطي**:
 * «حجزك محفوظ حتى …» بالتاريخ الكامل بتوقيت القاهرة، وهي وحدها ما يراه من
 * تعطّل عنده السكربت. أي أن العدّاد **يضيف ولا يستبدل**.
 */

/** ساعة/دقيقة/ثانية من فارقٍ بالمللي ثانية — عرضٌ لا حسابُ موعد */
function split(ms: number): { d: number; h: number; m: number; s: number } {
  const total = Math.max(0, Math.floor(ms / 1000));
  return {
    d: Math.floor(total / 86400),
    h: Math.floor((total % 86400) / 3600),
    m: Math.floor((total % 3600) / 60),
    s: total % 60,
  };
}

const pad = (n: number) => String(n).padStart(2, "0");

export function HoldCountdown({
  /** ISO من `booking_hold_until` — **المصدر الوحيد**، ولا يُشتق منه غيرُه */
  holdUntil,
  locale = DEFAULT_LOCALE,
}: {
  holdUntil: string;
  locale?: string;
}) {
  const router = useRouter();
  const t = useT("pages.bookingStatus");
  const fmt = React.useMemo(() => createFormatter(locale), [locale]);

  const deadline = React.useMemo(() => Date.parse(holdUntil), [holdUntil]);
  const [remaining, setRemaining] = React.useState<number | null>(null);
  // إعادة السؤال تقع **مرة واحدة**: بلا هذا يعيد كل تكّةٍ بعد الصفر تحميلَ
  // الصفحة، فتصير الشاشة في دورة تحديثٍ لا تنتهي على حجزٍ لم يُلغَ بعد.
  const askedRef = React.useRef(false);

  React.useEffect(() => {
    if (!Number.isFinite(deadline)) return;

    function tick() {
      const left = deadline - Date.now();
      setRemaining(left);
      if (left <= 0 && !askedRef.current) {
        askedRef.current = true;
        // لا إلغاء هنا — سؤالٌ للخادم عن الحالة كما تراها القاعدة
        router.refresh();
      }
    }

    tick();
    const id = window.setInterval(tick, 1000);
    return () => window.clearInterval(id);
  }, [deadline, router]);

  if (remaining === null) return null;

  const done = remaining <= 0;
  const { d, h, m, s } = split(remaining);

  /**
   * الأيام تُعرض حين توجد، وتُسقَط الثواني معها: «باقٍ يومان و٣ ساعات» أنفع من
   * عدّادٍ ثانويّ لا أحد ينتظره. وتحت اليوم يظهر العدّاد الكامل — هناك تبدأ
   * الثانية تعني شيئاً.
   */
  const clock = d > 0 ? `${d}:${pad(h)}:${pad(m)}` : `${pad(h)}:${pad(m)}:${pad(s)}`;

  return (
    <span
      className="inline-flex items-center gap-2 rounded-xl bg-primary/10 px-2.5 py-1 text-primary"
      // ⚠ الإعلان **مهذّب لا لحوح**: `off` كي لا يقرأ قارئ الشاشة رقماً جديداً
      //   كل ثانية — ضجيجٌ يمنع قراءة بقية الصفحة. والنصّ الكامل بالتاريخ
      //   موجودٌ في الجملة التي فوق هذا العنصر، وهي ما يُقرأ.
      aria-live="off"
    >
      <Clock className="size-4 shrink-0" aria-hidden="true" />
      {done ? (
        <span className="text-sm font-semibold">
          {t("pay.holdCountdownDone", "انقضت المهلة — نراجع الحالة الآن…")}
        </span>
      ) : (
        <>
          <span className="text-xs font-medium">
            {d > 0
              ? t("pay.holdCountdownDays", "الباقي (يوم:ساعة:دقيقة)")
              : t("pay.holdCountdownLabel", "الباقي")}
          </span>
          <span dir="ltr" className="font-mono text-sm font-bold tabular-nums">
            {fmt.digits(clock)}
          </span>
        </>
      )}
    </span>
  );
}
