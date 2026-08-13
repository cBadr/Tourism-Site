"use client";

import * as React from "react";
import Link from "next/link";
import { Bell, BellOff, Loader2 } from "lucide-react";

import { toArabicDigits } from "@/components/booking/format";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { createBrowserSupabase } from "@/lib/supabase/client";
import {
  bookingPath,
  eventEmoji,
  eventTitle,
  notificationBrief,
  relativeTime,
  statusLabel,
} from "@/lib/notifications/render";
import { cn } from "@/lib/utils";

/**
 * جرس الإشعارات في شريط اللوحة العلوي.
 *
 * ثلاث حالات صريحة بلا تظاهر:
 * - **حيّ**: قاعدة البيانات مربوطة وجدول `notifications` يُقرأ ⇒ قائمة بآخر
 *   عشرة إشعارات، تحديث لحظي عبر Realtime، واستطلاع كل ٦٠ ثانية كشبكة أمان
 *   (Realtime يحتاج إضافة الجدول لـ publication، وقد لا تكون مفعّلة بعد).
 * - **غير متاح**: بيئة غير مضبوطة أو الهجرة غير منفَّذة ⇒ جرس ساكن بتلميح يشرح السبب.
 * - **بلا صلاحية**: RLS ترفض القراءة ⇒ نفس المعاملة (قائمة فارغة بتلميح).
 *
 * عدّاد «غير المقروء» علامة على هذا الجهاز فقط (localStorage): كل إشعار أحدث من
 * آخر فتحٍ للقائمة يُعدّ جديداً. اخترناه لأنه صادق وواضح — لا يدّعي مزامنة بين
 * أجهزة المستخدم ولا يعبث بعمود `delivered_at` الذي يخص الإرسال الخارجي لا القراءة.
 */

const SEEN_KEY = "tours01:notifications:seen-at";
const POLL_MS = 60_000;
const LIST_LIMIT = 10;

type Row = {
  id: string;
  event: string;
  payload: Record<string, unknown> | null;
  status: string;
  created_at: string | null;
};

type Phase = "loading" | "ready" | "unavailable";

function readSeenAt(): string | null {
  try {
    return window.localStorage.getItem(SEEN_KEY);
  } catch {
    return null; // متصفح يمنع التخزين المحلي — الجرس يبقى شغالاً بلا علامة
  }
}

function writeSeenAt(value: string) {
  try {
    window.localStorage.setItem(SEEN_KEY, value);
  } catch {
    /* تجاهُل مقصود */
  }
}

export function NotificationBell() {
  // العميل يُنشأ مرة واحدة: null يعني بيئة Supabase غير مضبوطة
  const supabase = React.useMemo(() => createBrowserSupabase(), []);

  const [rows, setRows] = React.useState<Row[]>([]);
  const [phase, setPhase] = React.useState<Phase>(supabase ? "loading" : "unavailable");
  const [open, setOpen] = React.useState(false);
  // تهيئة كسولة لا تأثير جانبي: على الخادم لا نافذة ⇒ null، وأول رسم في المتصفح
  // يقرأ العلامة مباشرة. القائمة فارغة في الرسمين معاً فلا اختلاف في الترطيب.
  const [seenAt, setSeenAt] = React.useState<string | null>(() =>
    typeof window === "undefined" ? null : readSeenAt()
  );
  const containerRef = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    if (!supabase) return;

    let alive = true;

    const refresh = async () => {
      // select("*") لا أعمدة مسمّاة: الجرس لا ينهار لو تغيّر المخطط قليلاً
      const { data, error } = await supabase
        .from("notifications")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(LIST_LIMIT);

      if (!alive) return;
      if (error) {
        setPhase("unavailable");
        return;
      }
      setRows((data ?? []) as Row[]);
      setPhase("ready");
    };

    void refresh();

    // تحديث لحظي — أي إدراج أو تعديل على الجدول يعيد جلب القائمة
    const channel = supabase
      .channel("admin-notifications-bell")
      .on("postgres_changes", { event: "*", schema: "public", table: "notifications" }, () => {
        void refresh();
      })
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
      alive = false;
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisible);
      void supabase.removeChannel(channel);
    };
  }, [supabase]);

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

  const unread = React.useMemo(() => {
    if (!seenAt) return rows.length;
    return rows.filter((row) => (row.created_at ?? "") > seenAt).length;
  }, [rows, seenAt]);

  const toggle = () => {
    setOpen((was) => {
      if (!was) {
        const now = new Date().toISOString();
        writeSeenAt(now);
        setSeenAt(now);
      }
      return !was;
    });
  };

  const unavailable = phase === "unavailable";

  return (
    <div ref={containerRef} className="relative">
      <Button
        variant="ghost"
        size="icon"
        aria-label={
          unavailable
            ? "الإشعارات غير متاحة"
            : unread > 0
              ? `الإشعارات — ${unread} جديد`
              : "الإشعارات"
        }
        aria-haspopup="menu"
        aria-expanded={open}
        title={
          unavailable
            ? "الإشعارات تعمل بعد ربط قاعدة البيانات وتنفيذ هجرة المرحلة ٤."
            : undefined
        }
        onClick={toggle}
        className="relative"
      >
        {unavailable ? <BellOff className="opacity-60" /> : <Bell />}
        {!unavailable && unread > 0 && (
          <span
            aria-hidden
            className="absolute -top-0.5 -end-0.5 flex size-4 items-center justify-center rounded-full bg-primary px-1 text-[10px] font-bold text-primary-foreground"
          >
            {unread > 9 ? "٩+" : toArabicDigits(unread)}
          </span>
        )}
      </Button>

      {open && (
        <div
          role="menu"
          aria-label="آخر الإشعارات"
          className="absolute end-0 top-full z-50 mt-2 w-80 overflow-hidden rounded-xl border border-border bg-popover text-popover-foreground shadow-lg"
        >
          <div className="flex items-center justify-between gap-2 px-3 py-2">
            <span className="text-sm font-semibold">آخر الإشعارات</span>
            {phase === "loading" && <Loader2 className="size-4 animate-spin text-muted-foreground" />}
          </div>
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
                {phase === "loading" ? "جارٍ التحميل…" : "لا إشعارات بعد — سيظهر هنا أول حجز أو طلب عرض سعر."}
              </p>
            ) : (
              <ul className="divide-y divide-border">
                {rows.map((row) => {
                  const href = bookingPath(row.payload);
                  const brief = notificationBrief(row.payload);
                  const isNew = seenAt ? (row.created_at ?? "") > seenAt : true;
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
                          {isNew && (
                            <span
                              aria-label="جديد"
                              className="size-1.5 shrink-0 rounded-full bg-primary"
                            />
                          )}
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
                    <li key={row.id}>
                      {href ? (
                        <Link
                          href={href}
                          onClick={() => setOpen(false)}
                          className={cn(
                            "block px-3 py-2.5 transition-colors hover:bg-muted",
                            isNew && "bg-primary/5"
                          )}
                        >
                          {body}
                        </Link>
                      ) : (
                        <div className={cn("px-3 py-2.5", isNew && "bg-primary/5")}>{body}</div>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
          </div>

          <Separator />
          <div className="flex items-center justify-between gap-2 px-3 py-2">
            <Link
              href="/admin/notifications"
              onClick={() => setOpen(false)}
              className="text-xs font-medium text-primary hover:underline"
            >
              مركز الإشعارات
            </Link>
            <span className="text-[10px] text-muted-foreground">
              علامة «مقروء» على هذا الجهاز فقط
            </span>
          </div>
        </div>
      )}
    </div>
  );
}
