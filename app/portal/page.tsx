import Link from "next/link";
import {
  ArrowLeft,
  CarFront,
  CheckCircle2,
  Circle,
  Coins,
  ReceiptText,
  ShieldCheck,
  UserRound,
} from "lucide-react";

import {
  countLabel,
  dateLabel,
  LIST_STATUS_HINTS,
  LIST_STATUS_LABELS,
  NotReadyNotice,
  Notice,
  PageHeading,
  SubStatusBadge,
} from "@/components/portal/portal-ui";
import { buttonVariants } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { getSettings } from "@/lib/settings";
import type { PriceListStatus } from "@/lib/subcontractor-types";
import { cn } from "@/lib/utils";
import { PortalBalanceCard } from "./_components/balance-card";
import { loadPortalBalance } from "./_lib/balance";
import { isPriceListStatus, loadCurrency } from "./_lib/data";
import { isSchemaMissing, portalAccess } from "./_lib/session";

/**
 * لوحة المتعهد — أول ما يراه الشريك بعد الدخول.
 *
 * غرضها سؤالان بترتيبهما: **«ما حالة حسابي الآن؟»** ثم «ما الذي يمنع أسعاري من
 * العمل؟». فبطاقة الحساب تتصدّر — وهي وحدها ما يشرح للمتعهد المحجوب لماذا توقفت
 * الرحلات وبكم تعود — تليها قائمة تحقق قصيرة ينتهي كل بند فيها برابط إلى الشاشة
 * التي تُنجزه، ثم شرح صريح لآلية التسعير: فالمتعهد الذي يفهم أن سعره تكلفة لا
 * سعر بيع يُسعّر بدقة، والذي لا يفهمها يضخّم أرقامه فيخسر العروض بلا أن يدري.
 *
 * لا حساب مالي هنا: الأعداد عدّ صفوف، وكل أرقام الحساب تصل جاهزة بإشارتها من
 * `portal_balance()`، والهامش والسعر النهائي يقعان في Postgres.
 */

export const metadata = { title: "لوحة المتعهد" };

const EMPTY_COUNTS: Record<PriceListStatus, number> = {
  draft: 0,
  pending: 0,
  approved: 0,
  rejected: 0,
};

const STATUS_ORDER: PriceListStatus[] = ["draft", "pending", "approved", "rejected"];

function ChecklistRow({
  done,
  title,
  children,
  href,
  cta,
}: {
  done: boolean;
  title: string;
  children: React.ReactNode;
  href: "/portal/profile" | "/portal/fleet" | "/portal/prices";
  cta: string;
}) {
  return (
    <li className="flex flex-wrap items-start gap-3 border-t border-border py-3.5 first:border-t-0 first:pt-0">
      {done ? (
        <CheckCircle2 className="mt-0.5 size-5 shrink-0 text-emerald-600 dark:text-emerald-400" />
      ) : (
        <Circle className="mt-0.5 size-5 shrink-0 text-muted-foreground/60" />
      )}
      <div className="min-w-0 flex-1">
        <p className={cn("text-sm font-semibold", done && "text-muted-foreground line-through")}>
          {title}
        </p>
        <p className="mt-0.5 text-sm leading-relaxed text-muted-foreground">{children}</p>
      </div>
      <Link
        href={href}
        className={cn(buttonVariants({ variant: done ? "ghost" : "outline", size: "sm" }))}
      >
        {done ? "مراجعة" : cta}
        <ArrowLeft aria-hidden="true" />
      </Link>
    </li>
  );
}

export default async function PortalDashboardPage() {
  const access = await portalAccess();
  // الغلاف يعرض شاشة الحالة المناسبة؛ الصفحة لا تُصيَّر أصلاً في تلك الحالات
  if (!access.ok) return null;

  const { supabase, sub } = access;

  const [vehiclesRes, listsRes, balance, currency, settings] = await Promise.all([
    supabase
      .from("subcontractor_vehicles")
      .select("id", { count: "exact", head: true })
      .eq("subcontractor_id", sub.id),
    supabase.from("price_lists").select("status").eq("subcontractor_id", sub.id),
    // بلا وسيط إطلاقاً: نطاق الدالة مثبَّت داخلها على صاحب الجلسة (`_lib/balance.ts`)
    loadPortalBalance(),
    loadCurrency(supabase),
    // قنوات تواصل الإدارة لشريط الحجب — من الإعدادات لا من الكود، والنداء مُذاكَر مع الغلاف
    getSettings(),
  ]);

  const fleetReady = !vehiclesRes.error || !isSchemaMissing(vehiclesRes.error);
  const pricesReady = !listsRes.error || !isSchemaMissing(listsRes.error);

  const vehicleCount = vehiclesRes.error ? 0 : (vehiclesRes.count ?? 0);

  const counts = { ...EMPTY_COUNTS };
  for (const row of listsRes.data ?? []) {
    const status = (row as Record<string, unknown>).status;
    if (isPriceListStatus(status)) counts[status] += 1;
  }
  const totalLists = STATUS_ORDER.reduce((sum, status) => sum + counts[status], 0);

  // اكتمال الملف: اسم الشركة والهاتف إلزاميان، وقناة تواصل ثانية تضمن وصول الإدارة إليك
  const hasSecondChannel = Boolean(sub.whatsapp || sub.email);
  const profileDone = Boolean(sub.companyName && sub.phone) && hasSecondChannel;
  const fleetDone = vehicleCount > 0;
  const pricesDone = counts.approved > 0;
  const remaining = [profileDone, fleetDone, pricesDone].filter((done) => !done).length;

  return (
    <div className="space-y-6">
      <PageHeading title={`مرحباً، ${sub.companyName || "شريكنا"}`}>
        هذه صفحتك التشغيلية: منها تُكمل بياناتك وأسطولك وقوائم أسعارك، ومنها تتابع ما اعتمدته
        الإدارة وما ينتظر المراجعة.
      </PageHeading>

      {/*
        الحساب يتصدّر: المتعهد المحجوب عن الرحلات يجب أن يقرأ سبب توقفها والمبلغ
        الذي يعيدها قبل أي شيء آخر في الصفحة — لا تحت قائمة تحقق ولا في شاشة ثانية.
      */}
      <PortalBalanceCard result={balance} currency={currency} contact={settings.contact} />

      <Card className="gap-3 p-5">
        <div className="flex flex-wrap items-center gap-2">
          <ShieldCheck className="size-5 shrink-0 text-emerald-600 dark:text-emerald-400" />
          <span className="font-heading text-base font-bold">حالة الحساب</span>
          <SubStatusBadge status={sub.status} />
          {sub.createdAt ? (
            <span className="ms-auto text-xs text-muted-foreground">
              شريك منذ {dateLabel(sub.createdAt)}
            </span>
          ) : null}
        </div>
        <p className="text-sm leading-relaxed text-muted-foreground">
          حسابك معتمد: قوائم أسعارك المعتمدة تدخل تسعير الرحلات التي تغطيها، وتصلك عروض تلك
          الرحلات في صندوق الطلبات. أبقِ بياناتك وأسعارك محدّثة ليبقى وصول العروض متصلاً.
        </p>
      </Card>

      <Card className="gap-0 p-5">
        <div className="flex flex-wrap items-baseline justify-between gap-2 pb-3">
          <h3 className="font-heading text-base font-bold">اكتمال ملفك</h3>
          <span className="text-xs text-muted-foreground">
            {remaining === 0
              ? "اكتملت كل الخطوات."
              : `بقيت ${countLabel(remaining)} من ${countLabel(3)} خطوات.`}
          </span>
        </div>
        <ul>
          <ChecklistRow
            done={profileDone}
            title="بيانات الملف"
            href="/portal/profile"
            cta="أكمل البيانات"
          >
            {profileDone
              ? "اسم الشركة ووسائل التواصل مسجّلة — راجعها كلما تغيّر رقم أو حساب."
              : !sub.companyName || !sub.phone
                ? "اسم الشركة ورقم الهاتف حقلان إلزاميان لتتمكن الإدارة من الوصول إليك."
                : "أضف رقم واتساب أو بريداً إلكترونياً كقناة تواصل ثانية."}
          </ChecklistRow>

          <ChecklistRow
            done={fleetDone}
            title="مركبة واحدة على الأقل"
            href="/portal/fleet"
            cta="أضف مركبة"
          >
            {fleetDone
              ? `لديك ${countLabel(vehicleCount)} من المركبات المسجّلة.`
              : "فئات مركباتك هي ما يحدد فئات الأسعار المطلوبة منك — بلا مركبة واحدة لا يعرف النظام ما الذي تستطيع تنفيذه."}
          </ChecklistRow>

          <ChecklistRow
            done={pricesDone}
            title="قائمة أسعار معتمدة"
            href="/portal/prices"
            cta="أنشئ قائمة"
          >
            {pricesDone
              ? `لديك ${countLabel(counts.approved)} من القوائم المعتمدة التي تدخل التسعير.`
              : counts.pending > 0
                ? "قائمتك وصلت الإدارة وتنتظر الاعتماد — لا إجراء مطلوب منك الآن."
                : "القوائم المعتمدة وحدها تدخل التسعير؛ المسودة لا تُحتسب مهما كانت دقيقة."}
          </ChecklistRow>
        </ul>
      </Card>

      {!fleetReady || !pricesReady ? <NotReadyNotice what="بيانات الأسطول والأسعار" /> : null}

      <div>
        <h3 className="pb-3 font-heading text-base font-bold">قوائم أسعارك</h3>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {STATUS_ORDER.map((status) => (
            <Card key={status} className="gap-1 p-4" size="sm">
              <span className="text-sm text-muted-foreground">{LIST_STATUS_LABELS[status]}</span>
              <span className="font-heading text-2xl font-bold tabular-nums">
                {countLabel(counts[status])}
              </span>
              <span className="text-xs leading-5 text-muted-foreground">
                {LIST_STATUS_HINTS[status]}
              </span>
            </Card>
          ))}
        </div>
        {totalLists === 0 && pricesReady ? (
          <p className="pt-3 text-sm text-muted-foreground">
            لم تنشئ أي قائمة أسعار بعد.{" "}
            <Link href="/portal/prices" className="text-primary underline underline-offset-4">
              ابدأ بأول مسار تعمل عليه
            </Link>
            .
          </p>
        ) : null}
      </div>

      <Notice tone="info" icon={<Coins className="size-5 shrink-0" />}>
        <p className="mb-2 font-semibold">كيف يتحوّل سعرك إلى عرض يراه العميل؟</p>
        <ul className="space-y-2">
          <li>
            <span className="font-medium">سعرك هو تكلفتك.</span> الرقم الذي تكتبه في قائمة الأسعار
            هو ما تتقاضاه أنت عن الرحلة في الاتجاه الواحد — ليس ما يدفعه العميل.
          </li>
          <li>
            <span className="font-medium">المنصة تضيف هامشها فوق تكلفتك</span> وتعرض السعر النهائي
            وحده على العميل. لا يرى العميل تكلفتك ولا تفاصيل الهامش.
          </li>
          <li>
            <span className="font-medium">أرخص متعهد مغطٍّ هو من يُحتسب عليه العرض.</span> إن غطّى
            المسارَ أكثر من متعهد أُخذ أقلهم تكلفة لتلك الفئة — فالسعر المضخّم يُخرجك من العرض بلا
            إشعار.
          </li>
          <li>
            <span className="font-medium">المعتمد وحده يُحتسب.</span> إن لم يغطِّ أحد المسار سعّرته
            المنصة بتعريفة الكيلومتر، وأي تعديل على قائمة معتمدة يعيدها للمراجعة قبل أن تعمل من
            جديد.
          </li>
        </ul>
      </Notice>

      <div className="grid gap-3 sm:grid-cols-3">
        {[
          { href: "/portal/profile" as const, icon: UserRound, label: "تحديث ملفي" },
          { href: "/portal/fleet" as const, icon: CarFront, label: "إدارة أسطولي" },
          { href: "/portal/prices" as const, icon: ReceiptText, label: "قوائم أسعاري" },
        ].map((shortcut) => {
          const Icon = shortcut.icon;
          return (
            <Link
              key={shortcut.href}
              href={shortcut.href}
              className="flex items-center gap-3 rounded-xl bg-card p-4 text-sm font-medium ring-1 ring-foreground/10 transition-colors hover:bg-muted"
            >
              <Icon className="size-5 shrink-0 text-primary" aria-hidden="true" />
              {shortcut.label}
              <ArrowLeft className="ms-auto size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
            </Link>
          );
        })}
      </div>
    </div>
  );
}
