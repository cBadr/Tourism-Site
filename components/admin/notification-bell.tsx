"use client";

import * as React from "react";
import Link from "next/link";
import { Bell, BellOff, Check, CheckCheck, Eraser, Loader2, VolumeX, X } from "lucide-react";

import { SoundGate, SoundToggle, useNotificationSound } from "@/components/admin/notification-sound";
import { toArabicDigits } from "@/components/booking/format";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { createBrowserSupabase } from "@/lib/supabase/client";
import {
  audienceLink,
  eventEmoji,
  eventTitle,
  notificationBrief,
  relativeTime,
  statusLabel,
} from "@/lib/notifications/render";

/**
 * جرس الإشعارات في شريط اللوحة العلوي.
 *
 * ── السؤال الذي يجيب عنه هذا الملف — وهو **سؤالٌ واحد** ─────────────────────
 *
 * الجرس يجيب: **«ما الجديد الذي يستحق التفاتي الآن؟»** ولا يجيب غيره.
 * والسجلُّ الكامل — ماذا أُرسل، ولمن، وعلى أي قناة، وهل وصل — سؤالٌ آخر تجيبه
 * `/admin/notifications` وحدها. وخلطُ السؤالين هو بعينه ما شكا منه المالك
 * (2026-08-16): «الإشعارات تظل موجودة حتى بعد عرضها وهو أمر قد يربك مدير
 * النظام». فالقائمة هنا **تفرغ** كلما عولجت، والسجل هناك **لا يفرغ أبداً**.
 *
 * ── 🔴 ما تغيّر في 0077، ولماذا كان لازماً ──────────────────────────────────
 *
 * كانت علامةُ «مقروء» **`localStorage` على هذا الجهاز**، ومجرّدُ فتح القائمة
 * يكتب `seenAt = now()` — أي أن **النظر إلى الجرس يُصفِّر العدّاد كلَّه** ولو
 * لم يُقرأ صفٌّ واحد، والصفوف تبقى في القائمة إلى الأبد. ومن جهازين: عدّادان
 * مختلفان لا يعرف أحدهما الآخر.
 *
 * فصارت العلامة في القاعدة (`read_at` · `dismissed_at`)، وصار الجرس يعرض
 * **المفتوح وحده**: لا مقروءاً ولا مكنوساً. و«مقروء» لا تُكتب إلا بفعلٍ صريح —
 * زرُّ الصف، أو «تعليم الكل»، أو **النقر على الإشعار نفسه** (من فتح الطلب فقد
 * قرأ الإشعار، وبدون هذا الباب لا تفرغ القائمة أبداً بالاستعمال العادي).
 *
 * ⚠ و«مسح الكل» **ليس `delete`**: يكتب `dismissed_at` ويترك الصف كاملاً في
 * السجل — ومن صفوف هذا الجدول شُخِّص عيبٌ حقيقي (‏`trip_offered` لا يبلغ
 * أحداً). وحذفُ صفٍّ اليوم يعني أن عطل التسليم القادم لا يُشخَّص أصلاً.
 *
 * ── ثلاث حالات صريحة بلا تظاهر ──────────────────────────────────────────────
 * - **حيّ**: القاعدة مربوطة والجدول يُقرأ ⇒ عشرة مفتوحة، تحديث لحظي عبر
 *   Realtime واستطلاع كل ٦٠ ثانية شبكةَ أمان.
 * - **غير متاح**: بيئة غير مضبوطة أو الهجرة غير منفَّذة ⇒ جرس ساكن بتلميح.
 * - **بلا صلاحية**: RLS ترفض القراءة ⇒ نفس المعاملة.
 *
 * ── 🔔 الصوت — و**لماذا لم يمسّه هذا التغيير بحرف** ──────────────────────────
 *
 * الصوت يركب على ما هو قائم ولا يضيف نداءً واحداً: الجرس مشترِكٌ أصلاً في
 * `postgres_changes` ويستطلع كل ٦٠ ثانية. وشرطُ «جديد» **خطُّ أساسٍ** لا
 * مقارنةُ قراءة: أول قراءة ناجحة تسجّل أحدث `created_at` **بلا رنين**، وما
 * بعدها أي صفٍّ أحدث منه ⇒ رنّة واحدة.
 *
 * 🔒 **والمَعلَم يُقاس من أحدث صفِّ تشغيلٍ في الجدول — لا من القائمة المعروضة.**
 * وهذا القرار هو ما يجعل ميزة «تعليم الكل كمقروء» غير قادرة على إحداث رنّة
 * كاذبة: لو قُرئ المَعلَم من القائمة لأفرغها «تعليم الكل» فهبط أحدثُها إلى
 * صفر، ثم أعاد أولُ إشعارٍ لاحقٍ رفعَه ⇒ رنّة صحيحة، لكن **الترتيب المعكوس**
 * (استعادةُ صفٍّ قديم بـ`ops_notifications_restore`) كان سيرنّ لصفٍّ عمره
 * يومان. فالمَعلَم يقرأ الجدول لا العرض، فلا تحرّكه أي حالةِ عرض إطلاقاً.
 *
 * ولم تُضَف مقارنةٌ بساعة المتصفح عمداً: علامة القراءة تُختم بساعة المتصفح
 * والصفوف بساعة الخادم، فجهازٌ متقدّمٌ دقيقتين كان سيبتلع كل رنّة في تلك
 * الدقيقتين صمتاً. وخط الأساس يعطي الضمانة نفسها بلا هذا الخطر.
 *
 * ── ولماذا لا تظهر صفوف المتعهدين هنا ───────────────────────────────────────
 * منذ `0054` يحمل `notifications` صفوفاً موجَّهة إلى **متعهد بعينه**، وموجةُ
 * بثٍّ واحدة تُدرج صفّاً لكل متعهد في المعاملة نفسها. فبلا الاستبعاد يبتلع بثٌّ
 * واحد قائمةَ الجرس ويرفع العدّاد بما لا يخصّ الإدارة. والاستبعاد مكتوب
 * بالنفي (`!= partner`) لا بالإثبات (`= ops`): جمهورٌ ثالث يُضاف غداً يظهر في
 * الجرس بدل أن يختفي بصمت.
 *
 * 🔒 وعلامةُ القراءة على صفّ متعهد **ليست ملكَ المالك**: هي علامةُ قراءته هو في
 * صندوق البورتال. ولذلك الدوالّ الثلاث في `0077` تشترط `recipient_kind = 'ops'`
 * **داخل القاعدة** — لا في هذا الملف، فالواجهة تنسى والدالة لا تنسى.
 */

const POLL_MS = 60_000;
/** كبحٌ زائل لرشقات Realtime — دورةُ العامل تكتب حتى ٥٠ تحديثاً في لحظة واحدة */
const BURST_MS = 400;
const LIST_LIMIT = 10;
/** سقفُ العرض في الشارة — وما فوقه «٩+» */
const BADGE_MAX = 9;

type Row = {
  id: string;
  event: string;
  payload: Record<string, unknown> | null;
  status: string;
  created_at: string | null;
  /** أضافته 0054 — وغيابه على خادمٍ أقدم يُقرأ «تشغيل» ضمناً */
  recipient_kind?: string | null;
  /** 0054 للمتعهد · 0077 للتشغيل */
  read_at?: string | null;
  /** 0077 */
  dismissed_at?: string | null;
};

type Phase = "loading" | "ready" | "unavailable";

/** رمزُ تعذّر إجراء — **رمزٌ لا جملة**، والواجهة وحدها تؤلّف العربية */
type ActionFailure = "forbidden" | "failed";

const ACTION_FAILURE_TEXT: Record<ActionFailure, string> = {
  forbidden: "هذا الإجراء متاح لحساب دوره admin فقط.",
  failed: "تعذّر تنفيذ الإجراء — تحقق من الاتصال ثم أعد المحاولة.",
};

/** الزمن رقماً لا نصّاً: PostgREST يعيد `+00:00` والمتصفح يكتب `Z`، والمقارنة النصية بينهما كاذبة */
function timeOf(value: string | null | undefined): number {
  if (!value) return 0;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

/**
 * صفٌّ «مفتوح» = لا مقروء ولا مكنوس.
 *
 * ⚠ و`undefined` تُقرأ «مفتوح» عمداً: على خادمٍ بلا العمودين (مسار التراجع
 * أدناه) يجب أن يظهر كل شيء لا أن يختفي كل شيء. والاختفاء الصامت أسوأ عطبٍ
 * ممكن في جرس إنذار.
 */
function isOpen(row: Row): boolean {
  return !row.read_at && !row.dismissed_at;
}

export function NotificationBell() {
  // العميل يُنشأ مرة واحدة: null يعني بيئة Supabase غير مضبوطة
  const supabase = React.useMemo(() => createBrowserSupabase(), []);

  const [rows, setRows] = React.useState<Row[]>([]);
  /** العدد الحقيقي للمفتوح — من القاعدة لا من طول القائمة (انظر `refresh`) */
  const [openCount, setOpenCount] = React.useState(0);
  const [phase, setPhase] = React.useState<Phase>(supabase ? "loading" : "unavailable");
  const [open, setOpen] = React.useState(false);
  const [busy, setBusy] = React.useState(false);
  const [actionFailure, setActionFailure] = React.useState<ActionFailure | null>(null);
  const containerRef = React.useRef<HTMLDivElement>(null);

  const sound = useNotificationSound();
  /**
   * الرنّة عبر مرجع لا عبر تبعية: `useNotificationSound()` تُعيد كائناً جديداً
   * كل تصيير، وإدراجه في تبعيات التأثير أدناه كان سيفكّ اشتراك Realtime ويعيد
   * بناءه مع كل تحديث حالة — أي انقطاعٌ دوري في القناة التي عليها يقوم الصوت.
   */
  const ringRef = React.useRef(sound.ring);
  React.useEffect(() => {
    ringRef.current = sound.ring;
  }, [sound.ring]);

  /**
   * أحدث `created_at` رأيناه في **الجدول** (لا في القائمة) — `null` تعني «لم
   * نقرأ بعد». أول قراءة تضبطه بلا رنين؛ وهو الفرق بين «وصل جديد» و«أُعيد
   * تحميل الصفحة». ولا تحرّكه أي حالة عرض (انظر ترويسة الملف).
   */
  const newestRef = React.useRef<number | null>(null);

  /** يمنع تصييراً على مكوّن منصرف بعد انتهاء نداءٍ متأخر */
  const aliveRef = React.useRef(true);

  /**
   * رقمُ تسلسلٍ للنداءات — **حارسُ سباقٍ لا زينة**.
   *
   * ثلاثة أبواب تُطلق `refresh()` معاً: Realtime، والاستطلاع كل ٦٠ ثانية،
   * وعودةُ الصفحة إلى الظهور. فنداءان في الجو معاً، وأيُّهما رجع أخيراً كتب
   * الحالة — ولو كان الأقدم. والنتيجة **قائمةٌ تعود إلى الوراء** بعد إخفاءٍ
   * أو تعليمِ قراءة: يضغط المالك «مسح الكل» فتفرغ القائمة ثم تعود مليئةً
   * لأن ردّاً أقدم وصل بعده. ولا يكفي علمُ الانصراف (`aliveRef`) — هو يغطي
   * تفكيك المكوّن لا ترتيبَ الردود.
   */
  const seqRef = React.useRef(0);

  const refresh = React.useCallback(async () => {
    if (!supabase) return;
    const seq = ++seqRef.current;
    /** أحدثُ نداءٍ وحده يكتب الحالة */
    const stale = () => !aliveRef.current || seq !== seqRef.current;

    /**
     * المَعلَم أولاً ومن **الجدول كله**: أحدث صفِّ تشغيل مهما كانت حالة عرضه.
     * سطرٌ واحد وعمودٌ واحد — أرخص استعلام في هذا الملف، وهو الذي يحمي الصوت
     * من كل ما تفعله أزرار القراءة والمسح.
     */
    const marker = await supabase
      .from("notifications")
      .select("created_at")
      .neq("recipient_kind", "partner")
      .order("created_at", { ascending: false })
      .limit(1);

    /**
     * ثم المفتوح وحده — **مُرشَّحاً في القاعدة لا في المتصفح**.
     *
     * ⚠ ولماذا تغيّر هذا عن الترشيح في المتصفح؟ لأن الترشيح على صفحةٍ أولى من
     * ٥٠ صفاً كان يعمي الجرس عن المفتوح الأقدم منها: يقرأ المالك الأحدث فيبقى
     * صفٌّ مفتوحٌ في الموضع ٥١ **لا يظهر أبداً ولا يُعدّ**. والعدّ `exact` هنا
     * هو ما يجعل «غير المقروء» تعني غير المقروء فعلاً لا «غير المقروء ضمن آخر
     * خمسين». والاستعلام يهبط على الفهرس الجزئي `notifications_ops_open_idx`.
     */
    const list = await supabase
      .from("notifications")
      .select("id,event,payload,status,created_at,recipient_kind,read_at,dismissed_at", {
        count: "exact",
      })
      .neq("recipient_kind", "partner")
      .is("read_at", null)
      .is("dismissed_at", null)
      .order("created_at", { ascending: false })
      .limit(LIST_LIMIT);

    if (stale()) return;

    if (!marker.error && !list.error) {
      const newest = timeOf(marker.data?.[0]?.created_at);
      if (newestRef.current === null) {
        newestRef.current = newest; // خط الأساس — صمتٌ مقصود عند أول قراءة
      } else if (newest > newestRef.current) {
        newestRef.current = newest;
        ringRef.current(); // ⬅ الرنّة الوحيدة في هذا الملف
      }

      setRows((list.data ?? []) as Row[]);
      setOpenCount(list.count ?? (list.data?.length ?? 0));
      setPhase("ready");
      return;
    }

    /**
     * مسار التراجع — خادمٌ لم تُنفَّذ عليه `0077` (لا `dismissed_at`).
     *
     * 🔒 وهو **قرارٌ محفوظ من قبل هذا التغيير**: الجرس لا ينهار لأن المخطط تغيّر
     * قليلاً. `select("*")` بلا أعمدة مسمّاة، والترشيح في المتصفح — وحينها
     * يسقط العدّ الدقيق إلى طول الصفحة الأولى، وهو أفضل ما يمكن قوله بصدق.
     */
    const legacy = await supabase
      .from("notifications")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(50);

    if (stale()) return;
    if (legacy.error) {
      setPhase("unavailable");
      return;
    }

    const ops = ((legacy.data ?? []) as Row[]).filter((row) => row.recipient_kind !== "partner");
    const newest = ops.reduce((max, row) => Math.max(max, timeOf(row.created_at)), 0);
    if (newestRef.current === null) {
      newestRef.current = newest;
    } else if (newest > newestRef.current) {
      newestRef.current = newest;
      ringRef.current();
    }

    const openRows = ops.filter(isOpen);
    setRows(openRows.slice(0, LIST_LIMIT));
    setOpenCount(openRows.length);
    setPhase("ready");
  }, [supabase]);

  React.useEffect(() => {
    if (!supabase) return;
    aliveRef.current = true;

    /**
     * النداء الأول مؤجَّلٌ بدورةِ حدثٍ واحدة لا مُنادىً في جسم التأثير.
     *
     * السبب قاعدةُ مصرِّف React («لا `setState` متزامنٌ داخل تأثير»): `refresh`
     * دالةٌ لا متزامنة ولا تكتب حالةً قبل أول `await` — لكن المصرِّف لا يستطيع
     * إثبات ذلك عبر حدود `useCallback`، فيقرأها كتابةً متزامنة. والتأجيل صفرَ
     * ميلي ثانية يجعل الصحّةَ مقروءةً من الكود بدل أن تُشرح في تعليق، ولا
     * يؤخّر أول جلبٍ بشيء محسوس.
     */
    const first = window.setTimeout(() => void refresh(), 0);

    /**
     * كبحُ الرشقة — **مقيسٌ لا احترازي**.
     *
     * دورةُ العامل تعالج حتى ٥٠ صفاً وتكتب `update` لكل صفٍّ منها، والمهمة
     * المجدولة تعمل **كل دقيقة**. فبلا كبحٍ: خمسون حدثاً لحظياً ⇒ خمسون
     * إعادةَ جلبٍ متزامنة في الثانية الواحدة، لكل تبويب لوحةٍ مفتوح. والكبح
     * **زائل** (trailing) لا مانع: آخرُ حدثٍ في الرشقة هو الذي يُجلَب بعده،
     * فلا يضيع تحديث.
     */
    let burst: number | undefined;
    const nudge = () => {
      window.clearTimeout(burst);
      burst = window.setTimeout(() => void refresh(), BURST_MS);
    };

    /**
     * تحديث لحظي — **مُرشَّحٌ على الخادم**.
     *
     * موجةُ بثٍّ واحدة تُدرج صفّاً لكل متعهد مؤهَّل (و`dispatch_pool` بلا سقف)،
     * وكلُّها كانت تُوقظ جرس الإدارة لتُرمى بعد الجلب. والترشيح هنا بالنفي لا
     * بالإثبات — **الاتفاقية نفسها المكتوبة في ترويسة الملف**: جمهورٌ ثالث
     * يُضاف غداً يوقظ الجرس بدل أن يختفي بصمت.
     */
    const channel = supabase
      .channel("admin-notifications-bell")
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "notifications",
          filter: "recipient_kind=neq.partner",
        },
        nudge
      )
      .subscribe();

    // شبكة الأمان: استطلاع دوري حين تكون الصفحة ظاهرة (يغطي غياب Realtime)
    const timer = window.setInterval(() => {
      if (document.visibilityState === "visible") void refresh();
    }, POLL_MS);

    const onVisible = () => {
      if (document.visibilityState === "visible") void refresh();
    };
    document.addEventListener("visibilitychange", onVisible);

    return () => {
      aliveRef.current = false;
      window.clearTimeout(first);
      window.clearTimeout(burst);
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisible);
      void supabase.removeChannel(channel);
    };
  }, [supabase, refresh]);

  // إغلاق القائمة بالنقر خارجها أو بمفتاح Escape
  React.useEffect(() => {
    if (!open) return;
    const onPointerDown = (e: MouseEvent) => {
      if (!containerRef.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  /**
   * نداءُ إجراءٍ واحد على القاعدة.
   *
   * 🔒 والحارسان في القاعدة لا هنا: `is_admin()` ثم `recipient_kind = 'ops'`
   * داخل الدالة نفسها. فما يُمرَّر من هنا هو **المعرّف وحده** — ولا يوجد في هذا
   * الملف مسارٌ يستطيع أن يمسّ صفَّ متعهد مهما أُخطئ في كتابته.
   */
  const call = React.useCallback(
    async (fn: "mark_read" | "dismiss", id: string | null) => {
      if (!supabase || busy) return;
      setBusy(true);
      setActionFailure(null);

      const { error } = await supabase.rpc(`ops_notifications_${fn}`, { p_id: id });

      if (!aliveRef.current) return;
      if (error) {
        // رمزُ الرفض من `hint` لا من نصّ الرسالة (قاعدة المشروع: الكاشف الذي
        // يقرأ النصّ يكذب في الاتجاهين عند أول تحسينٍ للصياغة)
        setActionFailure(error.hint === "forbidden" ? "forbidden" : "failed");
        setBusy(false);
        return;
      }

      await refresh();
      if (aliveRef.current) setBusy(false);
    },
    [supabase, busy, refresh]
  );

  const unavailable = phase === "unavailable";
  const unread = unavailable ? 0 : openCount;
  /**
   * تنبيهٌ وصل ولم يُسمَع صوته. علامته على **زرّ الجرس نفسه** لا داخل القائمة
   * وحدها: من لا يفتح القائمة لن يعرف أبداً أن الصوت لا يعمل — وهذا هو الفشل
   * الصامت الذي يمنعه الطلب صراحةً.
   */
  const soundMissed = !unavailable && sound.unheard > 0;
  /** ما لم تسعه العشرة المعروضة — يُقال بصراحة بدل أن يُبتلع */
  const hiddenCount = Math.max(0, openCount - rows.length);

  return (
    <div ref={containerRef} className="relative">
      <Button
        variant="ghost"
        size="icon"
        aria-label={
          unavailable
            ? "الإشعارات غير متاحة"
            : unread > 0
              ? `الإشعارات — ${unread} غير مقروء${soundMissed ? " · الصوت لم يعمل" : ""}`
              : soundMissed
                ? "الإشعارات — الصوت لم يعمل"
                : "الإشعارات"
        }
        aria-haspopup="menu"
        aria-expanded={open}
        title={
          unavailable
            ? "الإشعارات تعمل بعد ربط قاعدة البيانات وتنفيذ هجرة المرحلة ٤."
            : soundMissed
              ? "وصل تنبيه ولم يُسمَع صوته — افتح القائمة وفعّل الصوت."
              : undefined
        }
        onClick={() => setOpen((was) => !was)}
        className="relative"
      >
        {unavailable ? <BellOff className="opacity-60" /> : <Bell />}
        {soundMissed && (
          <span
            aria-hidden
            className="absolute -bottom-0.5 -start-0.5 grid size-3.5 place-items-center rounded-full bg-amber-500 text-white"
          >
            <VolumeX className="size-2.5" />
          </span>
        )}
        {!unavailable && unread > 0 && (
          <span
            aria-hidden
            className="absolute -top-0.5 -end-0.5 flex size-4 items-center justify-center rounded-full bg-primary px-1 text-[10px] font-bold text-primary-foreground"
          >
            {unread > BADGE_MAX ? "٩+" : toArabicDigits(unread)}
          </span>
        )}
      </Button>

      {open && (
        <div
          role="menu"
          aria-label="الإشعارات غير المقروءة"
          className="absolute end-0 top-full z-50 mt-2 w-96 max-w-[calc(100vw-1.5rem)] overflow-hidden rounded-xl border border-border bg-popover text-popover-foreground shadow-lg"
        >
          <div className="flex items-center justify-between gap-2 px-3 py-2">
            <span className="flex items-center gap-1.5 text-sm font-semibold">
              غير المقروء
              {!unavailable && unread > 0 && (
                <Badge variant="secondary" className="h-4 px-1.5 text-[10px]">
                  {toArabicDigits(unread)}
                </Badge>
              )}
            </span>
            {(phase === "loading" || busy) && (
              <Loader2 className="size-4 animate-spin text-muted-foreground" />
            )}
          </div>

          {/* سطر الصوت أعلى القائمة لا في ذيلها: حين يظهر يكون هو الخبر */}
          {!unavailable ? <SoundGate sound={sound} /> : null}

          {actionFailure && (
            <p className="bg-red-100 px-3 py-2 text-[11px] leading-relaxed text-red-900 dark:bg-red-950 dark:text-red-100">
              {ACTION_FAILURE_TEXT[actionFailure]}
            </p>
          )}
          <Separator />

          <div className="max-h-96 overflow-y-auto">
            {unavailable ? (
              <p className="p-3 text-xs leading-relaxed text-muted-foreground">
                الإشعارات غير متاحة الآن: إما أن قاعدة البيانات غير مربوطة، أو أن هجرة المرحلة ٤
                (جدول <code dir="ltr">notifications</code>) لم تُنفَّذ بعد، أو أن حسابك بلا صلاحية
                قراءتها.
              </p>
            ) : rows.length === 0 ? (
              <p className="p-3 text-xs leading-relaxed text-muted-foreground">
                {phase === "loading"
                  ? "جارٍ التحميل…"
                  : "لا جديد — كل الإشعارات مقروءة. والسجل الكامل محفوظ في مركز الإشعارات."}
              </p>
            ) : (
              <ul className="divide-y divide-border">
                {rows.map((row) => {
                  /**
                   * 🔒 وجهةُ **الإدارة** لا وجهةُ العميل — وهي بلاغ المالك
                   * نفسه: كان هنا `bookingPath(row.payload)` فينقر المالك
                   * إشعاراً في لوحته فيهبط على `/booking/<token>` — الصفحةُ
                   * المصمَّمة لتُخفي عنه التكلفة والهامش والمتعهد والأزرار.
                   *
                   * و`ops` ثابتةٌ لا مقروءةٌ من الصف بحقّ: القائمة **مُرشَّحة
                   * أصلاً** على `recipient_kind !== "partner"` (انظر ترويسة
                   * الملف)، فما يصل هنا إداريٌّ بالبناء.
                   *
                   * وبلا أصلٍ (‏`baseUrl` غائب) يخرج مساراً نسبياً — وهو ما
                   * يحتاجه `next/link` داخل اللوحة.
                   */
                  const href = audienceLink(row.payload, "ops")?.href ?? null;
                  const brief = notificationBrief(row.payload);
                  const body = (
                    <span className="flex items-start gap-2">
                      <span aria-hidden className="mt-0.5 text-base leading-none">
                        {eventEmoji(row.event)}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="flex items-center gap-1.5">
                          <span className="truncate text-sm font-medium">
                            {eventTitle(row.event)}
                          </span>
                        </span>
                        {brief && (
                          <span className="block truncate text-xs text-muted-foreground">
                            {brief}
                          </span>
                        )}
                        <span className="mt-0.5 flex items-center gap-1.5 text-[11px] text-muted-foreground">
                          <span>{relativeTime(row.created_at)}</span>
                          {row.status && row.status !== "sent" && (
                            <Badge variant="outline" className="h-4 px-1 text-[10px]">
                              {statusLabel(row.status)}
                            </Badge>
                          )}
                        </span>
                      </span>
                    </span>
                  );

                  return (
                    <li key={row.id} className="flex items-start gap-1 bg-primary/5 pe-1.5">
                      {href ? (
                        <Link
                          href={href}
                          /**
                           * فتحُ الطلب قراءةٌ للإشعار — وبلا هذا الباب لا تفرغ
                           * القائمة بالاستعمال العادي أبداً، فيعود بالضبط ما
                           * شكا منه المالك.
                           */
                          onClick={() => {
                            setOpen(false);
                            void call("mark_read", row.id);
                          }}
                          className="block min-w-0 flex-1 px-3 py-2.5 transition-colors hover:bg-muted"
                        >
                          {body}
                        </Link>
                      ) : (
                        <div className="min-w-0 flex-1 px-3 py-2.5">{body}</div>
                      )}

                      <span className="flex shrink-0 flex-col gap-0.5 py-2.5">
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() => void call("mark_read", row.id)}
                          title="تعليم كمقروء"
                          aria-label="تعليم كمقروء"
                          className="rounded-md p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-primary disabled:opacity-50"
                        >
                          <Check className="size-3.5" aria-hidden="true" />
                        </button>
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() => void call("dismiss", row.id)}
                          title="إخفاء من الجرس — يبقى في السجل"
                          aria-label="إخفاء من الجرس"
                          className="rounded-md p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:opacity-50"
                        >
                          <X className="size-3.5" aria-hidden="true" />
                        </button>
                      </span>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>

          {!unavailable && hiddenCount > 0 && (
            <p className="bg-muted/50 px-3 py-1.5 text-[11px] text-muted-foreground">
              و{toArabicDigits(hiddenCount)} غير مقروء لا يتسع لها العرض — «تعليم الكل» يشملها.
            </p>
          )}

          {/* الإجراءان الجماعيان — ظاهران فقط حين يوجد ما يُعالَج */}
          {!unavailable && rows.length > 0 && (
            <>
              <Separator />
              <div className="flex items-center gap-2 px-3 py-2">
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void call("mark_read", null)}
                  className="inline-flex items-center gap-1.5 rounded-lg px-2 py-1 text-[11px] font-medium text-primary transition-colors hover:bg-primary/10 disabled:opacity-50"
                >
                  <CheckCheck className="size-3.5 shrink-0" aria-hidden="true" />
                  تعليم الكل كمقروء
                </button>
                {/*
                  «مسح الكل» الذي طلبه المالك — ويكتب `dismissed_at` ولا يحذف
                  صفاً واحداً. والنصّ يقول ذلك صراحةً كي لا يُفهم حذفاً.
                */}
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void call("dismiss", null)}
                  title="يُخفيها من الجرس ويُبقيها كاملةً في مركز الإشعارات"
                  className="inline-flex items-center gap-1.5 rounded-lg px-2 py-1 text-[11px] font-medium text-muted-foreground transition-colors hover:bg-muted disabled:opacity-50"
                >
                  <Eraser className="size-3.5 shrink-0" aria-hidden="true" />
                  مسح الكل
                </button>
              </div>
            </>
          )}

          <Separator />
          <div className="flex items-center justify-between gap-2 px-3 py-2">
            <Link
              href="/admin/notifications"
              onClick={() => setOpen(false)}
              className="text-xs font-medium text-primary hover:underline"
            >
              مركز الإشعارات
            </Link>
            {/* مفتاح الكتم إلزامي: صوتٌ لا يُطفأ يُغلق اللوحة في وجه صاحبها */}
            {!unavailable ? <SoundToggle sound={sound} /> : null}
          </div>
          <div className="px-3 pb-2 text-[10px] leading-relaxed text-muted-foreground">
            الجرس يعرض غير المقروء فقط. و«مسح الكل» يُخفي ولا يحذف — كل ما أُرسل يبقى بسجلّه
            الكامل وحصيلة كل قناة في{" "}
            <Link
              href="/admin/notifications"
              onClick={() => setOpen(false)}
              className="underline hover:text-primary"
            >
              مركز الإشعارات
            </Link>
            . وقرار الصوت وحده محفوظ على هذا الجهاز.
          </div>
        </div>
      )}
    </div>
  );
}
