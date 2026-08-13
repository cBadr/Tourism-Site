import Link from "next/link";
import {
  AlertTriangle,
  ArrowLeft,
  CheckCircle2,
  Megaphone,
  PlayCircle,
  Radio,
  UserCheck,
  XCircle,
} from "lucide-react";

import { formatMoney, toArabicDigits } from "@/components/booking/format";
import { HelpTip } from "@/components/shared/HelpTip";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { KpiCard } from "@/components/ui/kpi-card";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import type { TripSnapshot } from "@/lib/booking-types";
import { readDispatchSettings } from "@/lib/dispatch/settings";
import { DEFAULT_DISPATCH, type DispatchSettings } from "@/lib/dispatch-types";
import { createServerSupabase } from "@/lib/supabase/server";
import { asNumber, asText, dateTimeLabel, relativeTime } from "../orders/_components/booking-ui";
import {
  DISPATCH_ERRORS,
  DISPATCH_STATUS_HINTS,
  DispatchBadge,
  readDispatch,
} from "./_components/dispatch-ui";
import { runDispatchTick, saveDispatchSettings } from "./actions";

/**
 * شاشة الإسناد — نصفان لا ثالث لهما:
 *
 * (١) **إعدادات البث**: مهلة الموجة وعدد الموجات والبدء التلقائي وأرضية الهامش.
 *     هذه هي المقابض التي تحكم أخطر حلقة في النظام، ومكانها الإعدادات لا الكود
 *     (قرار الرؤية: المهلة وعدد إعادات البث يُضبطان من اللوحة).
 *
 * (٢) **الطابور اليدوي**: الطلبات التي استنفدت موجاتها بلا قبول. كل صف هنا رحلة
 *     مدفوعة بلا منفّذ — لذلك يُرتَّب الأقدم أولاً، وهو ترتيب إلحاح لا ترتيب
 *     عرض. تجاهله يعني عميلاً ينتظر.
 *
 * كل عدّ وترشيح يقع في Postgres (`count: exact` وشروط في الاستعلام)، ولا حساب
 * مالي في هذا الملف — الأرقام تصل جاهزة من لقطات الحجوزات وصفوف البث.
 */

export const metadata = { title: "الإسناد" };

const hasSupabaseEnv = () =>
  Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);

/** سقف الطابور المعروض — طابور تشغيل لا أرشيف */
const MAX_QUEUE = 50;

/** أعمدة الحجز التي يحتاجها صف الطابور وحدها (عقد المرحلة ٤) — لا `select *` */
const BOOKING_COLUMNS = "id, reference, total, currency, trip";

type QueueRow = {
  bookingId: string;
  reference: string;
  total: number | null;
  currency: string;
  originLabel: string | null;
  destLabel: string | null;
  pickupAt: string | null;
  /** آخر موجة بُثَّت قبل استنفاد المحاولات */
  round: number | null;
  lastBroadcastAt: string | null;
  /** لحظة فتح دورة البث — منها يُحتسب طول الانتظار */
  createdAt: string | null;
};

type Counts = { broadcasting: number | null; assigned: number | null; manual: number | null };

type Loaded = {
  /** جداول المرحلة ٦ موجودة وقابلة للقراءة */
  ready: boolean;
  /**
   * الإعدادات السارية — تُقرأ بـ `readDispatchSettings` نفسها التي يقرأ بها عامل
   * البث، فلا يمكن أن تعرض الشاشة قيمة ويشتغل المحرّك بغيرها.
   */
  settings: DispatchSettings;
  /** جدول الإعدادات موجود (وإن كان بلا صف) */
  settingsReady: boolean;
  /** الجدول موجود لكنه بلا صف إعدادات بعد — أول حفظ يُنشئه */
  settingsEmpty: boolean;
  counts: Counts;
  queue: QueueRow[];
  queueFailed: boolean;
};

const EMPTY: Loaded = {
  ready: false,
  settings: DEFAULT_DISPATCH,
  settingsReady: false,
  settingsEmpty: false,
  counts: { broadcasting: null, assigned: null, manual: null },
  queue: [],
  queueFailed: false,
};

async function loadScreen(): Promise<Loaded> {
  const supabase = await createServerSupabase();
  if (!supabase) return EMPTY;

  /**
   * العدّ داخل Postgres — لا نقل صفوف إلى الخادم لمجرد عدّها.
   *
   * فخّ مقيس على هذه القاعدة: استعلام العدّ بـ `head: true` على جدول **غير
   * موجود** يرجع بلا خطأ و`count = null`. لذلك نُرجع `null` كما هي بدل
   * `count ?? 0` — «—» تقول «لا أعرف»، أما «٠» فتدّعي معرفة كاذبة.
   */
  const countOf = async (status: string): Promise<number | null> => {
    const { count, error } = await supabase
      .from("dispatches")
      .select("*", { count: "exact", head: true })
      .eq("status", status);
    return error ? null : count;
  };

  const [settingsResult, queueRes, broadcasting, assigned, manual] = await Promise.all([
    readDispatchSettings(supabase),
    supabase
      .from("dispatches")
      .select("*")
      .eq("status", "manual")
      .order("created_at", { ascending: true })
      .limit(MAX_QUEUE),
    countOf("broadcasting"),
    countOf("assigned"),
    countOf("manual"),
  ]);

  // خطأ استعلام الطابور = جدول `dispatches` غير منفَّذ (هجرة المرحلة ٦)
  const ready = !queueRes.error;

  const dispatches = queueRes.error
    ? []
    : ((queueRes.data ?? []) as Record<string, unknown>[]).map(readDispatch);

  const bookingIds = dispatches
    .map((d) => d.bookingId)
    .filter((v): v is string => v !== null);

  const bookings = new Map<string, Record<string, unknown>>();
  if (bookingIds.length > 0) {
    const res = await supabase.from("bookings").select(BOOKING_COLUMNS).in("id", bookingIds);
    if (!res.error) {
      for (const row of (res.data ?? []) as Record<string, unknown>[]) {
        const id = asText(row.id);
        if (id) bookings.set(id, row);
      }
    }
  }

  const queue: QueueRow[] = [];
  for (const d of dispatches) {
    if (d.bookingId === null) continue;
    const booking = bookings.get(d.bookingId) ?? null;
    const trip =
      booking && booking.trip && typeof booking.trip === "object" && !Array.isArray(booking.trip)
        ? (booking.trip as Partial<TripSnapshot>)
        : {};
    queue.push({
      bookingId: d.bookingId,
      reference: asText(booking?.reference) ?? "—",
      total: asNumber(booking?.total),
      currency: asText(booking?.currency) ?? "EGP",
      originLabel: asText(trip.originLabel),
      destLabel: asText(trip.destLabel),
      pickupAt: asText(trip.pickupAt),
      round: d.round,
      lastBroadcastAt: d.lastBroadcastAt,
      createdAt: d.createdAt,
    });
  }

  return {
    ready,
    settings: settingsResult.settings,
    // `empty` = الجدول موجود وفارغ؛ `no-table` وحدها تعني هجرة غير منفَّذة
    settingsReady: settingsResult.loaded || settingsResult.reason === "empty",
    settingsEmpty: settingsResult.reason === "empty",
    counts: { broadcasting, assigned, manual },
    queue,
    queueFailed: Boolean(queueRes.error),
  };
}

const numberText = (v: number | null) => (v === null ? "—" : toArabicDigits(v));

/** رقم قادم من الرابط — يُطبَّع قبل العرض (قد يصل كمصفوفة أو غائباً) */
const qsNum = (v: string | string[] | undefined) =>
  toArabicDigits(typeof v === "string" && /^\d+$/.test(v) ? v : "0");

/**
 * أسباب عدم تنفيذ الدورة كما يرجعها عامل البث (`DispatchTickReason`) — تُعرض
 * كما هي للمالك بدل رمز إنجليزي لا يقول شيئاً.
 */
const TICK_REASONS: Record<string, string> = {
  "already-running": "دورة بث أخرى تعمل الآن — انتظر ثوانٍ ثم أعد المحاولة.",
  "no-service-client":
    "الدورة تحتاج SUPABASE_SERVICE_ROLE_KEY في ‎.env.local‎ (وفي متغيرات بيئة Vercel عند النشر) — بدونه لا تستطيع قراءة الطابور ولا فتح موجة.",
  "no-function":
    "دالة dispatch_tick غير موجودة في قاعدة البيانات — نفِّذ هجرة المرحلة ٦ ثم أعد المحاولة.",
  "no-table": "جداول البث غير موجودة — نفِّذ هجرة المرحلة ٦ ثم أعد المحاولة.",
  "rpc-failed": "الدالة موجودة لكنها فشلت — راجع سجل الخادم لرسالة قاعدة البيانات.",
  "worker-error": "خلل غير متوقع أثناء تشغيل الدورة — راجع سجل الخادم.",
};

export default async function DispatchPage({ searchParams }: PageProps<"/admin/dispatch">) {
  const [params, loaded] = await Promise.all([searchParams, loadScreen()]);
  const { ready, settings, settingsReady, settingsEmpty, counts, queue, queueFailed } = loaded;

  const wired = hasSupabaseEnv();
  const saved = params.saved === "1";
  const ran = params.ran === "1";
  const reason = typeof params.reason === "string" ? params.reason : null;
  const error = typeof params.error === "string" ? params.error : null;
  const editable = ready && settingsReady;

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="flex items-center gap-2 font-heading text-lg font-bold">
          <Radio className="size-5 text-primary" />
          الإسناد
        </h2>
        <HelpTip>
          حين يُؤكَّد حجز يُعرض على المتعهدين المغطّين لمساره على{" "}
          <span className="font-semibold">موجات</span> متتابعة، وأول من يقبل يفوز ويُغلق الطلب أمام
          الباقين. هذه الشاشة تضبط قواعد اللعبة، وتعرض ما سقط منها إلى التدخل البشري.
        </HelpTip>
        <form action={runDispatchTick} className="ms-auto">
          <Button type="submit" size="sm" disabled={!ready}>
            <PlayCircle />
            تشغيل دورة الإسناد الآن
          </Button>
        </form>
        <HelpTip>
          الدورة هي ما يُنهي المهل المنتهية ويفتح الموجة التالية أو يُصعّد الطلب للطابور اليدوي.
          تعمل تلقائياً على المهمة المجدولة، وهذا الزر يشغّلها فوراً — مفيد للاختبار أو حين تشك
          أن الجدولة متوقفة.
        </HelpTip>
      </div>

      {!wired && (
        <Card className="flex flex-row items-start gap-3 border-amber-300 bg-amber-50 p-4 text-amber-900 dark:border-amber-700 dark:bg-amber-950 dark:text-amber-100">
          <AlertTriangle className="mt-0.5 size-5 shrink-0" />
          <p className="text-sm leading-relaxed">
            قاعدة البيانات غير مربوطة بعد — الحفظ والتشغيل يُفعَّلان بعد تنفيذ خطوات{" "}
            <code dir="ltr">supabase/README.md</code> وإعادة تشغيل الخادم.
          </p>
        </Card>
      )}

      {wired && !ready && (
        <Card className="flex flex-row items-start gap-3 border-amber-300 bg-amber-50 p-4 text-amber-900 dark:border-amber-700 dark:bg-amber-950 dark:text-amber-100">
          <AlertTriangle className="mt-0.5 size-5 shrink-0" />
          <div className="text-sm leading-relaxed">
            <p className="font-semibold">جداول البث والإسناد غير جاهزة بعد</p>
            <p>
              قاعدة البيانات مربوطة لكن جداول <code dir="ltr">dispatches</code> و
              <code dir="ltr">trip_offers</code> و<code dir="ltr">dispatch_settings</code> غير
              موجودة — نفِّذ هجرة المرحلة ٦ من <code dir="ltr">supabase/migrations</code> ثم أعد
              تحميل الصفحة. بقية اللوحة تعمل طبيعياً.
            </p>
          </div>
        </Card>
      )}

      {saved && (
        <Card className="flex flex-row items-center gap-3 border-emerald-300 bg-emerald-50 p-4 text-emerald-900 dark:border-emerald-700 dark:bg-emerald-950 dark:text-emerald-100">
          <CheckCircle2 className="size-5 shrink-0" />
          <p className="text-sm font-medium">
            حُفظت إعدادات الإسناد — تسري على الموجة التالية فوراً بلا إعادة نشر.
          </p>
        </Card>
      )}

      {ran && (
        <Card className="flex flex-row items-start gap-3 border-emerald-300 bg-emerald-50 p-4 text-emerald-900 dark:border-emerald-700 dark:bg-emerald-950 dark:text-emerald-100">
          <CheckCircle2 className="mt-0.5 size-5 shrink-0" />
          <div className="text-sm leading-relaxed">
            <p className="font-semibold">
              انتهت دورة الإسناد — عولج {qsNum(params.processed)} حجزاً:{" "}
              {qsNum(params.expired)} عرضاً انتهت مهلته · {qsNum(params.rounds)} موجة جديدة ·{" "}
              {qsNum(params.offers)} عرضاً بُثَّ · {qsNum(params.escalated)} حجزاً نزل للطابور
              اليدوي.
            </p>
            {reason && <p>{TICK_REASONS[reason] ?? reason}</p>}
          </div>
        </Card>
      )}

      {error && (
        <Card className="flex flex-row items-center gap-3 border-red-300 bg-red-50 p-4 text-red-900 dark:border-red-700 dark:bg-red-950 dark:text-red-100">
          <XCircle className="size-5 shrink-0" />
          <p className="text-sm font-medium">
            {DISPATCH_ERRORS[error] ?? "حدث خطأ غير متوقع."}
          </p>
        </Card>
      )}

      {/* المؤشرات — كل رقم COUNT من قاعدة البيانات */}
      <div className="grid gap-3 sm:grid-cols-3">
        <KpiCard
          title="بثّ جارٍ"
          value={numberText(counts.broadcasting)}
          sub="موجات مفتوحة تنتظر رد المتعهدين"
          icon={Megaphone}
          help={DISPATCH_STATUS_HINTS.broadcasting}
          valueDir="ltr"
        />
        <KpiCard
          title="مُسند"
          value={numberText(counts.assigned)}
          sub="طلبات وجدت منفّذها"
          icon={UserCheck}
          help={DISPATCH_STATUS_HINTS.assigned}
          valueDir="ltr"
        />
        <KpiCard
          title="طابور يدوي"
          value={numberText(counts.manual)}
          sub="استنفدت موجاتها وتنتظرك"
          icon={AlertTriangle}
          help={DISPATCH_STATUS_HINTS.manual}
          /* كل رقم فوق الصفر هنا رحلة مدفوعة بلا منفّذ — إلحاح لا إحصاء */
          variant={(counts.manual ?? 0) > 0 ? "warning" : "default"}
          valueDir="ltr"
        />
      </div>

      {/* الطابور اليدوي — الأقدم أولاً لأن الترتيب ترتيب إلحاح */}
      <Card className="space-y-4 p-5">
        <div>
          <h3 className="flex items-center gap-1.5 font-heading text-base font-bold">
            <AlertTriangle className="size-4 text-primary" />
            طابور الإسناد اليدوي
            <HelpTip>
              طلبات عُرضت على المتعهدين في كل الموجات المسموح بها فلم يقبلها أحد. النظام لا يملك
              ما يفعله أكثر — القرار الآن بشري: اتصل بشريك واتفق معه ثم أسنِد الطلب يدوياً بمستحقه
              المتفق عليه.
            </HelpTip>
          </h3>
          <p className="text-sm text-muted-foreground">
            الأقدم أولاً: كل صف هنا رحلة مدفوعة بلا منفّذ، وعميلها ينتظر.
          </p>
        </div>

        {!ready || queueFailed ? (
          <p className="text-sm text-muted-foreground">
            تعذّرت قراءة الطابور — تأكد أن جدول <code dir="ltr">dispatches</code> منفَّذ في قاعدة
            البيانات (هجرة المرحلة ٦).
          </p>
        ) : queue.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            الطابور فارغ — لا طلب استنفد موجاته بلا قبول. هذا هو الوضع الصحي.
          </p>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[52rem] text-sm">
                <thead>
                  <tr className="border-b border-border text-xs text-muted-foreground">
                    <th className="p-2 text-start font-medium">الطلب</th>
                    <th className="p-2 text-start font-medium">المسار</th>
                    <th className="p-2 text-start font-medium">موعد الانطلاق</th>
                    <th className="p-2 text-start font-medium">إجمالي الحجز</th>
                    <th className="p-2 text-start font-medium">الموجات</th>
                    <th className="p-2 text-start font-medium">آخر بث</th>
                    <th className="p-2 text-start font-medium">ينتظر منذ</th>
                    <th className="p-2 text-start font-medium" />
                  </tr>
                </thead>
                <tbody>
                  {queue.map((row) => (
                    <tr key={row.bookingId} className="border-b border-border align-top last:border-0">
                      <td className="p-2">
                        <Link
                          href={`/admin/orders/${row.bookingId}#dispatch`}
                          dir="ltr"
                          className="font-medium transition-colors hover:text-primary hover:underline"
                        >
                          {row.reference}
                        </Link>
                        <span className="mt-0.5 block">
                          <DispatchBadge status="manual" />
                        </span>
                      </td>
                      <td className="p-2 text-xs leading-relaxed">
                        {row.originLabel ?? "—"}
                        <span className="text-muted-foreground"> ← </span>
                        {row.destLabel ?? "—"}
                      </td>
                      <td className="p-2 text-xs whitespace-nowrap text-muted-foreground">
                        {dateTimeLabel(row.pickupAt)}
                      </td>
                      <td className="p-2" dir="ltr">
                        {row.total === null ? "—" : formatMoney(row.total, row.currency)}
                      </td>
                      <td className="p-2" dir="ltr">
                        {numberText(row.round)}
                      </td>
                      <td className="p-2 text-xs whitespace-nowrap text-muted-foreground">
                        {row.lastBroadcastAt ? relativeTime(row.lastBroadcastAt) : "—"}
                      </td>
                      <td className="p-2 text-xs whitespace-nowrap">
                        <Badge
                          variant="outline"
                          className="border-amber-300 bg-amber-100 text-amber-900 dark:border-amber-700 dark:bg-amber-950 dark:text-amber-100"
                        >
                          {relativeTime(row.createdAt)}
                        </Badge>
                      </td>
                      <td className="p-2">
                        <Link
                          href={`/admin/orders/${row.bookingId}?confirm=assign#dispatch`}
                          className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
                        >
                          أسنِد يدوياً
                          <ArrowLeft className="size-3" />
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="text-xs text-muted-foreground">
              المعروض {toArabicDigits(queue.length)} من الطابور
              {queue.length === MAX_QUEUE
                ? ` (أقدم ${toArabicDigits(MAX_QUEUE)} — عالِجها لتظهر البقية)`
                : ""}
              . «أسنِد يدوياً» يفتح الطلب على بطاقة الإسناد مباشرة.
            </p>
          </>
        )}
      </Card>

      {/* الإعدادات */}
      <form action={editable ? saveDispatchSettings : undefined}>
        <Card className="space-y-4 p-5">
          <div>
            <h3 className="flex items-center gap-1.5 font-heading text-base font-bold">
              إعدادات البث
              <HelpTip>
                هذه المقابض تحكم توازناً واحداً: سرعة إسناد الرحلة مقابل حماية هامش الربح. تسري
                على الموجة التالية فوراً بلا إعادة نشر ولا كود.
              </HelpTip>
            </h3>
            <p className="text-sm text-muted-foreground">
              المهلة وعدد الموجات من الإعدادات — لا من الكود (قرار الرؤية).
            </p>
          </div>

          {ready && !settingsReady && (
            <Card className="flex flex-row items-start gap-3 border-amber-300 bg-amber-50 p-4 text-amber-900 ring-0 dark:border-amber-700 dark:bg-amber-950 dark:text-amber-100">
              <AlertTriangle className="mt-0.5 size-5 shrink-0" />
              <p className="text-sm leading-relaxed">
                تعذّرت قراءة <code dir="ltr">dispatch_settings</code> بحسابك — الحقول تعرض القيم
                الافتراضية والتحرير معطَّل. تأكد أن الجدول منفَّذ وأن لحسابك (دوره{" "}
                <code dir="ltr">admin</code>) سياسة قراءة عليه.
              </p>
            </Card>
          )}

          {settingsEmpty && (
            <Card className="flex flex-row items-start gap-3 border-sky-300 bg-sky-50 p-4 text-sky-900 ring-0 dark:border-sky-700 dark:bg-sky-950 dark:text-sky-100">
              <AlertTriangle className="mt-0.5 size-5 shrink-0" />
              <p className="text-sm leading-relaxed">
                لا صف إعدادات في <code dir="ltr">dispatch_settings</code> بعد — الحقول تعرض القيم
                الافتراضية من العقد، وأول حفظ يُنشئ الصف.
              </p>
            </Card>
          )}

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="window_minutes" className="flex items-center gap-1.5">
                مهلة الموجة (بالدقائق)
                <HelpTip>
                  كم يبقى العرض مفتوحاً أمام متعهدي الموجة قبل أن يُحسب تجاهلاً. المهلة القصيرة
                  تُسرِّع الإسناد وتضيّق فرصة الشريك على الرد، والطويلة تفعل العكس وتُبقي العميل
                  بلا تأكيد منفّذ. ٣٠ دقيقة نقطة بداية معقولة، وقلّلها كثيراً لرحلات اليوم نفسه.
                </HelpTip>
              </Label>
              <Input
                id="window_minutes"
                name="window_minutes"
                type="number"
                inputMode="numeric"
                dir="ltr"
                step="5"
                min={1}
                max={1440}
                required
                disabled={!editable}
                defaultValue={settings.windowMinutes}
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="max_rounds" className="flex items-center gap-1.5">
                عدد الموجات قبل التحويل اليدوي
                <HelpTip>
                  كم موجة يجرّبها النظام قبل أن يرفع يده. الموجة الأولى تُعرض على من تكلفته لا
                  تتجاوز التكلفة التي سُعِّر بها الطلب — أي بهامشك كاملاً. والثانية توسّع السقف
                  ليشمل من تكلفته حتى «التكلفة + الهامش» — أي بلا ربح ولا خسارة. باستنفادها ينزل
                  الطلب للطابور اليدوي. اثنتان هي الافتراضي.
                </HelpTip>
              </Label>
              <Input
                id="max_rounds"
                name="max_rounds"
                type="number"
                inputMode="numeric"
                dir="ltr"
                step="1"
                min={1}
                max={5}
                required
                disabled={!editable}
                defaultValue={settings.maxRounds}
              />
            </div>
          </div>

          <Label className="flex cursor-pointer items-center justify-between gap-3 rounded-lg border border-input p-3 text-sm font-normal">
            <span className="leading-relaxed">
              <span className="font-medium">بدء البث تلقائياً فور تأكيد الدفع</span>
              <span className="block text-muted-foreground">
                عند التفعيل تبدأ الموجة الأولى لحظة اعتماد التحويل بلا تدخل. عند الإطفاء يبقى كل
                حجز مؤكد في الطابور حتى يضغط التشغيل «ابدأ البث» من صفحة الطلب — أبطأ، لكنه مفيد
                في أيام الاختبار أو حين تريد مراجعة كل طلب بعينك.
              </span>
            </span>
            <input
              type="checkbox"
              name="auto_start"
              defaultChecked={settings.autoStart}
              disabled={!editable}
              className="size-5 shrink-0 accent-primary"
            />
          </Label>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="min_margin_amount" className="flex items-center gap-1.5">
                أرضية الهامش (بالجنيه)
                <HelpTip>
                  أقل ربح تقبله على رحلة مُسندة. الصفر يعني: امنع الخسارة فقط. تُستخدم عند تقييم
                  الموجة الأخيرة وعند الإسناد اليدوي، والرفض يقع في قاعدة البيانات لا في الشاشة —
                  فلا يمكن تجاوزها بضغطة.
                </HelpTip>
              </Label>
              <Input
                id="min_margin_amount"
                name="min_margin_amount"
                type="number"
                inputMode="decimal"
                dir="ltr"
                step="10"
                min={0}
                disabled={!editable}
                defaultValue={settings.minMarginAmount}
              />
            </div>
          </div>

          <Card className="gap-2 bg-muted/40 p-4 text-sm leading-relaxed ring-0">
            <p className="font-medium">لماذا الموجات أصلاً؟</p>
            <p className="text-muted-foreground">
              سعر العميل حُسب على <span className="font-medium">أرخص</span> متعهد يغطي المسار. لو
              فُتح الطلب على الجميع دفعة واحدة لأمكن أن يقبله متعهد أغلى، فيتآكل الهامش أو ينقلب
              خسارة — والموقع ملتزم بالسعر الذي دفعه العميل بالفعل.
            </p>
            <p className="text-muted-foreground">
              لذلك يُفتح الطلب على مراحل بسقف تكلفة يتسع: الموجة ١ بهامشك كاملاً، الموجة ٢ عند
              التعادل، ثم قرار بشري. أنت تختار كم تنتظر في كل موجة وكم موجة تحتمل — والباقي يتولاه
              النظام.
            </p>
            <p className="text-muted-foreground">
              وفي كل الأحوال يرى المتعهد <span className="font-medium">مستحقه هو فقط</span>: لا سعر
              العميل، ولا اسمه ولا رقمه ولا عنوانه الدقيق قبل أن يقبل الرحلة.
            </p>
          </Card>

          <Separator />
          <div className="flex justify-end">
            <Button type="submit" disabled={!editable}>
              حفظ إعدادات الإسناد
            </Button>
          </div>
        </Card>
      </form>
    </div>
  );
}
