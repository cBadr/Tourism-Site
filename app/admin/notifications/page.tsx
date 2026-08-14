import Link from "next/link";
import {
  AlertTriangle,
  BellRing,
  CheckCircle2,
  CircleSlash,
  KeyRound,
  RefreshCw,
  Send,
  XCircle,
} from "lucide-react";

import { toArabicDigits } from "@/components/booking/format";
import { HelpTip } from "@/components/shared/HelpTip";
import { PagePulse } from "@/components/stats/page-pulse";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { channelReadiness } from "@/lib/notifications/dispatch";
import { emailFrom } from "@/lib/notifications/email";
import {
  channelLabel,
  eventEmoji,
  eventTitle,
  formatDateTime,
  notificationBrief,
  statusLabel,
} from "@/lib/notifications/render";
import { getSettings } from "@/lib/settings";
import { readPagePulse } from "@/lib/stats/pulse";
import { createServerSupabase } from "@/lib/supabase/server";
import { retryNotification, runDispatch } from "./actions";

/**
 * مركز الإشعارات — الشاشة التي يرى فيها المالك أنبوب الإشعارات كله:
 * ما وصل، وما تجاوزه النظام ولماذا، وما فشل ويستحق إعادة محاولة.
 *
 * فلسفة الشاشة: **لا سحر ولا صمت**. القناة التي تنقصها بيانات اعتماد تُقال
 * صراحة مع مكان إضافتها بالضبط، لأن أسوأ ما يصيب أنبوب إشعارات أن يبدو شغالاً
 * وهو صامت. الجرس في الشريط العلوي يعمل دائماً — القنوات الخارجية وحدها هي
 * التي تنتظر بيانات الاعتماد.
 */

export const metadata = { title: "الإشعارات" };

const LIST_LIMIT = 50;

type Row = {
  id: string;
  event: string;
  payload: Record<string, unknown> | null;
  channels: string[] | null;
  status: string;
  attempts: number | null;
  error: string | null;
  created_at: string | null;
  delivered_at: string | null;
};

const FILTERS = [
  { key: "all", label: "الكل" },
  { key: "queued", label: "في الطابور" },
  { key: "sent", label: "أُرسل" },
  { key: "skipped", label: "متجاوَز" },
  { key: "failed", label: "فشل" },
] as const;

const ERROR_MESSAGES: Record<string, string> = {
  id: "لم يصل معرّف الإشعار.",
  forbidden:
    "هذا الإجراء متاح لحساب دوره admin فقط — وقاعدة البيانات يجب أن تكون مربوطة (راجع supabase/README.md).",
  retry: "تعذّرت إعادة الجدولة — تأكد أنك مسجل الدخول بحساب admin وأن الإشعار ما زال موجوداً.",
};

const REASON_MESSAGES: Record<string, string> = {
  "no-service-client":
    "عامل الإرسال يحتاج SUPABASE_SERVICE_ROLE_KEY في ‎.env.local — بدونه لا يستطيع قراءة الطابور.",
  "no-table": "جدول notifications غير موجود — نفِّذ هجرة المرحلة ٤ ثم أعد المحاولة.",
  "read-failed": "تعذّرت قراءة طابور الإشعارات من قاعدة البيانات.",
  "empty-queue": "لا شيء في الطابور — كل الإشعارات مُعالَجة.",
  "already-running": "دورة إرسال أخرى تعمل الآن — انتظر ثوانٍ ثم أعد المحاولة.",
  "write-failed":
    "تعذّر تسجيل نتيجة الإرسال على بعض الصفوف، وستُعاد محاولتها في الدورة القادمة — تأكد أن حالات جدول notifications تقبل sent/skipped/failed وأن مفتاح الخدمة صالح.",
};

const STATUS_STYLES: Record<string, string> = {
  sent: "border-emerald-300 bg-emerald-50 text-emerald-900 dark:border-emerald-700 dark:bg-emerald-950 dark:text-emerald-100",
  queued: "border-amber-300 bg-amber-50 text-amber-900 dark:border-amber-700 dark:bg-amber-950 dark:text-amber-100",
  skipped: "border-border bg-muted text-muted-foreground",
  failed:
    "border-red-300 bg-red-50 text-red-900 dark:border-red-700 dark:bg-red-950 dark:text-red-100",
};

const num = (v: number | null | undefined) => toArabicDigits(v ?? 0);

/** رقم قادم من الرابط — يُطبَّع قبل العرض (قد يصل كمصفوفة أو غائباً) */
const qsNum = (v: string | string[] | undefined) =>
  toArabicDigits(typeof v === "string" && /^\d+$/.test(v) ? v : "0");

async function loadRows(status: string): Promise<{ rows: Row[]; ready: boolean }> {
  const supabase = await createServerSupabase();
  if (!supabase) return { rows: [], ready: false };

  let query = supabase
    .from("notifications")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(LIST_LIMIT);
  if (status !== "all") query = query.eq("status", status);

  const { data, error } = await query;
  if (error) return { rows: [], ready: false };
  return { rows: (data ?? []) as Row[], ready: true };
}

/** عدّاد لكل حالة — بنفس عميل الجلسة حتى تعكس الأرقام ما يراه المستخدم فعلاً */
async function loadCounts(): Promise<Record<string, number> | null> {
  const supabase = await createServerSupabase();
  if (!supabase) return null;

  const keys = ["queued", "sent", "skipped", "failed"] as const;
  const results = await Promise.all(
    keys.map((key) =>
      supabase.from("notifications").select("id", { count: "exact", head: true }).eq("status", key)
    )
  );
  if (results.some((r) => r.error)) return null;

  const counts: Record<string, number> = {};
  keys.forEach((key, i) => {
    counts[key] = results[i].count ?? 0;
  });
  counts.all = keys.reduce((sum, key) => sum + (counts[key] ?? 0), 0);
  return counts;
}

export default async function NotificationsPage({
  searchParams,
}: PageProps<"/admin/notifications">) {
  const params = await searchParams;
  const status = typeof params.status === "string" ? params.status : "all";
  const filter = FILTERS.some((f) => f.key === status) ? status : "all";

  const [settings, { rows, ready }, counts, pulse] = await Promise.all([
    getSettings(),
    loadRows(filter),
    loadCounts(),
    // نبض الشاشة (الملاحظة ١٢): نافذة ثابتة ٣٠ يوماً لا تُبدّل عدّادات المرشّح
    // أدناه — تلك تعدّ الطابور كله الآن، وهذه تقيس آخر شهر. وكل رقم من Postgres.
    createServerSupabase().then((client) => readPagePulse(client, "/admin/notifications")),
  ]);

  const readiness = channelReadiness(settings.notifications);
  const hasServiceKey = Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY);
  const hasDispatchKey = Boolean(process.env.NOTIFY_DISPATCH_KEY);

  const error = typeof params.error === "string" ? params.error : null;
  const ran = params.ran === "1";
  const reason = typeof params.reason === "string" ? params.reason : null;
  const queuedOk = params.queued === "1";

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="flex items-center gap-2 font-heading text-lg font-bold">
          <BellRing className="size-5 text-primary" />
          مركز الإشعارات
        </h2>
        <HelpTip>
          كل تغيّر في حالة حجز أو طلب عرض سعر يكتب صفاً في طابور الإشعارات داخل نفس عملية
          التغيير، ثم يوزّعه عامل الإرسال على القنوات المفعّلة. لا إشعار يضيع: ما يفشل يبقى
          مسجّلاً هنا بسببه ويمكن إعادة محاولته.
        </HelpTip>
        <form action={runDispatch} className="ms-auto">
          <input type="hidden" name="filter" value={filter} />
          <Button type="submit" size="sm">
            <Send />
            تشغيل الإرسال الآن
          </Button>
        </form>
      </div>

      <PagePulse data={pulse} />

      {ran && (
        <Card className="flex flex-row items-start gap-3 border-emerald-300 bg-emerald-50 p-4 text-emerald-900 dark:border-emerald-700 dark:bg-emerald-950 dark:text-emerald-100">
          <CheckCircle2 className="mt-0.5 size-5 shrink-0" />
          <div className="text-sm leading-relaxed">
            <p className="font-semibold">
              انتهت دورة الإرسال — عولج {qsNum(params.processed)} إشعاراً: {qsNum(params.sent)}{" "}
              أُرسل · {qsNum(params.skipped)} متجاوَز · {qsNum(params.failed)} فشل.
            </p>
            {reason && <p>{REASON_MESSAGES[reason] ?? reason}</p>}
          </div>
        </Card>
      )}

      {queuedOk && (
        <Card className="flex flex-row items-center gap-3 border-emerald-300 bg-emerald-50 p-4 text-emerald-900 dark:border-emerald-700 dark:bg-emerald-950 dark:text-emerald-100">
          <CheckCircle2 className="size-5 shrink-0" />
          <p className="text-sm font-medium">
            أُعيد الإشعار إلى الطابور — اضغط «تشغيل الإرسال الآن» أو انتظر المهمة المجدولة.
          </p>
        </Card>
      )}

      {error && (
        <Card className="flex flex-row items-center gap-3 border-red-300 bg-red-50 p-4 text-red-900 dark:border-red-700 dark:bg-red-950 dark:text-red-100">
          <XCircle className="size-5 shrink-0" />
          <p className="text-sm font-medium">{ERROR_MESSAGES[error] ?? "حدث خطأ غير متوقع."}</p>
        </Card>
      )}

      {/* بطاقة بيانات الاعتماد — أهم بطاقة في الشاشة: تقول بالضبط ما ينقص وأين يُضاف */}
      <Card className="space-y-4 p-5">
        <div>
          <h3 className="flex items-center gap-1.5 font-heading text-base font-bold">
            <KeyRound className="size-4 text-primary" />
            حالة قنوات الإشعار
          </h3>
          <p className="text-sm text-muted-foreground">
            جرس اللوحة يعمل دائماً. القنوات الخارجية تحتاج مفتاحاً في البيئة ووجهة في الإعدادات —
            وحتى ذلك الحين تُسجَّل رسائلها «متجاوَزة» بسبب واضح ولا تضيع.
          </p>
        </div>

        <div className="grid gap-3 sm:grid-cols-3">
          {readiness.map((channel) => (
            <div
              key={channel.channel}
              className={`rounded-lg border p-3 text-sm ${
                channel.ready
                  ? "border-emerald-300 bg-emerald-50 dark:border-emerald-800 dark:bg-emerald-950/40"
                  : "border-border bg-muted/40"
              }`}
            >
              <p className="flex items-center gap-1.5 font-medium">
                {channel.ready ? (
                  <CheckCircle2 className="size-4 text-emerald-600 dark:text-emerald-400" />
                ) : (
                  <CircleSlash className="size-4 text-muted-foreground" />
                )}
                {channel.label}
              </p>
              {channel.ready ? (
                <p className="mt-1 text-xs text-emerald-700 dark:text-emerald-300">جاهزة للإرسال</p>
              ) : (
                <ul className="mt-1 space-y-0.5 text-xs text-muted-foreground">
                  {channel.missing.map((item) => (
                    <li key={item}>ينقص: {item}</li>
                  ))}
                </ul>
              )}
            </div>
          ))}
        </div>

        <Card className="gap-2 bg-muted/40 p-4 text-sm leading-relaxed ring-0">
          <p className="font-medium">أين تُضاف كل قيمة؟</p>
          <ul className="space-y-1 text-muted-foreground">
            <li>
              <code dir="ltr">TELEGRAM_BOT_TOKEN</code> و<code dir="ltr">RESEND_API_KEY</code> و
              <code dir="ltr">NOTIFY_EMAIL_FROM</code>: ملف <code dir="ltr">.env.local</code> على
              جهازك (وفي متغيرات بيئة Vercel عند النشر) ثم أعد تشغيل الخادم.
            </li>
            <li>
              معرّف محادثة تليجرام وبريد الاستقبال ومفتاحا التشغيل/الإطفاء: تبويب «الإشعارات» في{" "}
              <Link href="/admin/settings#notifications" className="text-primary hover:underline">
                شاشة الإعدادات
              </Link>
              .
            </li>
            <li>
              الشرح خطوة بخطوة (إنشاء البوت، استخراج معرّف المحادثة، حساب Resend، جدولة العامل):
              ملف <code dir="ltr">docs/NOTIFICATIONS.md</code>.
            </li>
            <li>
              المُرسِل الحالي للبريد: <code dir="ltr">{emailFrom()}</code> — النطاق التجريبي يصلح
              للتجربة فقط، والإنتاج يحتاج نطاقاً موثّقاً في Resend.
            </li>
            <li>
              عامل الإرسال:{" "}
              <code dir="ltr">
                {hasServiceKey ? "SUPABASE_SERVICE_ROLE_KEY ✓" : "SUPABASE_SERVICE_ROLE_KEY ✗"}
              </code>{" "}
              ·{" "}
              <code dir="ltr">
                {hasDispatchKey ? "NOTIFY_DISPATCH_KEY ✓" : "NOTIFY_DISPATCH_KEY ✗"}
              </code>{" "}
              — الأول لازم لتشغيل الطابور، والثاني لحماية المسار حين تجدوله لاحقاً.
            </li>
          </ul>
        </Card>
      </Card>

      {/* مرشّح الحالة */}
      <div className="flex flex-wrap items-center gap-2">
        {FILTERS.map((item) => {
          const active = item.key === filter;
          const count = counts?.[item.key];
          return (
            <Link
              key={item.key}
              href={item.key === "all" ? "/admin/notifications" : `/admin/notifications?status=${item.key}`}
              className={`rounded-lg border px-3 py-1.5 text-sm transition-colors ${
                active
                  ? "border-primary bg-primary text-primary-foreground"
                  : "border-border hover:bg-muted"
              }`}
            >
              {item.label}
              {typeof count === "number" && (
                <span className="ms-1.5 text-xs opacity-80">{num(count)}</span>
              )}
            </Link>
          );
        })}
      </div>

      {!ready ? (
        <Card className="flex flex-row items-start gap-3 border-amber-300 bg-amber-50 p-4 text-amber-900 dark:border-amber-700 dark:bg-amber-950 dark:text-amber-100">
          <AlertTriangle className="mt-0.5 size-5 shrink-0" />
          <div className="text-sm leading-relaxed">
            <p className="font-semibold">لا يمكن قراءة طابور الإشعارات بعد</p>
            <p>
              إما أن قاعدة البيانات غير مربوطة (خطوات <code dir="ltr">supabase/README.md</code>)،
              أو أن هجرة المرحلة ٤ التي تُنشئ جدول <code dir="ltr">notifications</code> لم تُنفَّذ،
              أو أن حسابك بلا صلاحية قراءتها. الجرس وبقية اللوحة تعمل طبيعياً.
            </p>
          </div>
        </Card>
      ) : rows.length === 0 ? (
        <Card className="p-5 text-sm text-muted-foreground">
          لا إشعارات في هذا التصنيف بعد.
        </Card>
      ) : (
        <Card className="space-y-3 p-5">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[52rem] text-sm">
              <thead>
                <tr className="border-b border-border text-xs text-muted-foreground">
                  <th className="p-2 text-start font-medium">الحدث</th>
                  <th className="p-2 text-start font-medium">القنوات</th>
                  <th className="p-2 text-start font-medium">الحالة</th>
                  <th className="p-2 text-start font-medium">المحاولات</th>
                  <th className="p-2 text-start font-medium">التفاصيل</th>
                  <th className="p-2 text-start font-medium">أُنشئ</th>
                  <th className="p-2 text-start font-medium">سُلّم</th>
                  <th className="p-2 text-start font-medium">إجراء</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => {
                  const brief = notificationBrief(row.payload);
                  const retryable = row.status === "failed" || row.status === "skipped";
                  return (
                    <tr key={row.id} className="border-b border-border align-top last:border-0">
                      <td className="p-2">
                        <span className="font-medium">
                          {eventEmoji(row.event)} {eventTitle(row.event)}
                        </span>
                        {brief && (
                          <span className="block text-xs text-muted-foreground">{brief}</span>
                        )}
                      </td>
                      <td className="p-2">
                        <span className="flex flex-wrap gap-1">
                          {(row.channels ?? []).map((channel) => (
                            <Badge key={channel} variant="outline" className="whitespace-nowrap">
                              {channelLabel(channel)}
                            </Badge>
                          ))}
                        </span>
                      </td>
                      <td className="p-2">
                        <span
                          className={`inline-flex rounded-md border px-2 py-0.5 text-xs font-medium whitespace-nowrap ${
                            STATUS_STYLES[row.status] ?? "border-border"
                          }`}
                        >
                          {statusLabel(row.status)}
                        </span>
                      </td>
                      <td className="p-2" dir="ltr">
                        {num(row.attempts)}
                      </td>
                      <td className="p-2 text-xs leading-relaxed text-muted-foreground">
                        {row.error ?? "—"}
                      </td>
                      <td className="p-2 text-xs whitespace-nowrap text-muted-foreground">
                        {formatDateTime(row.created_at) ?? "—"}
                      </td>
                      <td className="p-2 text-xs whitespace-nowrap text-muted-foreground">
                        {formatDateTime(row.delivered_at) ?? "—"}
                      </td>
                      <td className="p-2">
                        {retryable ? (
                          <form action={retryNotification}>
                            <input type="hidden" name="id" value={row.id} />
                            <input type="hidden" name="filter" value={filter} />
                            <Button type="submit" variant="outline" size="sm">
                              <RefreshCw />
                              إعادة المحاولة
                            </Button>
                          </form>
                        ) : (
                          <span className="text-xs text-muted-foreground">—</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <Separator />
          <p className="text-xs leading-relaxed text-muted-foreground">
            تُعرض آخر {toArabicDigits(LIST_LIMIT)} إشعاراً. «إعادة المحاولة» تعيد الصف إلى الطابور
            وتُرسله كاملاً لكل قنواته في الدورة التالية — فإن كانت قناة قد نجحت من قبل فقد تصل
            رسالتها مرتين، وهذا مقصود: تكرار رسالة أهون من ضياع حجز.
          </p>
        </Card>
      )}
    </div>
  );
}
