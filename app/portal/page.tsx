import Link from "next/link";
import { ArrowLeft, CarFront, Coins, IdCard, ReceiptText, UserRound } from "lucide-react";

import {
  countLabel,
  LIST_STATUS_HINTS,
  LIST_STATUS_LABELS,
  NotReadyNotice,
  Notice,
  PageHeading, PartnerStateBadge,
} from "@/components/portal/portal-ui";
import { Card } from "@/components/ui/card";
import { getSettings } from "@/lib/settings";
import type { PriceListStatus } from "@/lib/subcontractor-types";
import { PortalBalanceCard } from "./_components/balance-card";
import { OnboardingWizard } from "./_components/onboarding-wizard";
import { ReadinessStateCard } from "./_components/readiness-state";
import { loadPortalBalance } from "./_lib/balance";
import { loadCurrency } from "./_lib/data";
import { loadOnboarding } from "./_lib/onboarding";
import { portalSetupAccess } from "./_lib/session";

/**
 * لوحة المتعهد — أول ما يراه الشريك بعد الدخول، معتمَداً كان أو مدعوّاً يجهّز نفسه.
 *
 * غرضها سؤالان بترتيبهما: **«ما حالة حسابي الآن؟»** ثم «ما الذي يمنع الرحلات من
 * الوصول إليّ؟». فبطاقة الحساب تتصدّر — وهي وحدها ما يشرح للمتعهد المحجوب لماذا
 * توقفت الرحلات وبكم تعود — يليها **معالج التجهيز** المقيس من القاعدة، ثم شرح
 * صريح لآلية التسعير: فالمتعهد الذي يفهم أن سعره تكلفة لا سعر بيع يُسعّر بدقة،
 * والذي لا يفهمها يضخّم أرقامه فيخسر العروض بلا أن يدري.
 *
 * ⚠ **والمعالج مُطالَبةٌ تزول بزوال سببها.** كان يبقى معروضاً بعد اكتمال كل شيء،
 * فيقرأ الشريك التامّ ستة أسطر مشطوبة ولا يقرأ جملةً واحدة تقول له إنه يستقبل
 * عروضاً — شكوى المالك بلفظها. فالقرار هنا سطرٌ واحد: تامٌّ ⇒ `ReadinessStateCard`
 * وحدها، وناقصٌ ⇒ المعالج فوقها. **والشرط `readyToReceive` مقيسٌ في
 * `_lib/onboarding.ts`** ولا يُشتقّ في هذه الصفحة بحرف — والفرق ليس تجميلاً:
 * شرطُ إخفاءٍ يُكتب في التصيير ينحرف عن شرط القياس، فيُخفى الشريط عن شريكٍ ناقص.
 *
 * ⚠ **وقائمة التحقق لم تعد تُكتب هنا.** كانت ثلاثة بنود مكتوبة في التصيير
 * (ملف · مركبة · قائمة معتمَدة)، وكانت تعلن «اكتملت كل الخطوات» لشريكٍ لا يمكن
 * أن يصله عرضٌ واحد: `dispatch_pool` تشترط **مركبة نشطة من فئة الحجز** بجوار
 * سعرها، وشريكٌ في قاعدة بدر اليوم بقائمتين معتمدتين وصفر مركبات كان يقرأ
 * اكتمالاً كاذباً. القياس كله انتقل إلى `_lib/onboarding.ts` بشروطه المقروءة من
 * التعريف الحيّ للدوال.
 *
 * ولا حساب مالي هنا: الأعداد عدّ صفوف، وكل أرقام الحساب تصل جاهزة بإشارتها من
 * `portal_balance()`، والهامش والسعر النهائي يقعان في Postgres.
 */

export const metadata = { title: "لوحة المتعهد" };

const STATUS_ORDER: PriceListStatus[] = ["draft", "pending", "approved", "rejected"];

export default async function PortalDashboardPage() {
  const access = await portalSetupAccess();
  // الغلاف يعرض شاشة الحالة المناسبة؛ الصفحة لا تُصيَّر أصلاً في تلك الحالات
  if (!access.ok) return null;

  const { supabase, sub, stage } = access;
  const onboarding = stage === "onboarding";

  const [readiness, balance, currency, settings] = await Promise.all([
    // القياس مُذاكَر: البنود والعدّادات وفجوات الفئات من نداءٍ واحد
    loadOnboarding(),
    // بلا وسيط إطلاقاً: نطاق الدالة مثبَّت داخلها على صاحب الجلسة (`_lib/balance.ts`)
    // — وهي تعود `hidden` للمدعوّ لأن حارسها الضيّق يرفضه، وهذا صحيح: لا حساب
    //   مفتوحاً مع شريك لم ينفّذ رحلة بعد، وبطاقةُ أصفارٍ ضجيجٌ لا معلومة.
    loadPortalBalance(),
    loadCurrency(supabase),
    // قنوات تواصل الإدارة لشريط الحجب — من الإعدادات لا من الكود، والنداء مُذاكَر مع الغلاف
    getSettings(),
  ]);

  const counts = readiness?.counts.lists ?? { draft: 0, pending: 0, approved: 0, rejected: 0 };
  const totalLists = STATUS_ORDER.reduce((sum, status) => sum + counts[status], 0);

  /*
    الحجب بسقف الدين لا يُقاس في المعالج ولا يُتجاهَل: يصل من `portal_balance()`
    كي لا تُقال «حسابك جاهز» لشريكٍ تُسقِط عنه `portal_offers` كل عرض.
  */
  const debtBlocked = balance.state === "ready" && balance.balance.blocked;

  /**
   * 🔒 **شرط إخفاء المعالج — قراءةٌ واحدة بلا اشتقاق.**
   *
   * `readyToReceive` و`pausedByChoice` محسوبتان في `_lib/onboarding.ts` من
   * `settledBase` نفسه (لا نقصَ منه · لا انتظارَ إدارة · لا قراءةَ تعذّرت · قناةٌ
   * تبلغه)، ويفرّقهما مفتاحُ «أستقبل الطلبات» وحده. وسقفُ الدين يُضرب فيهما هنا
   * لأنه وحده يصل من نداءٍ مالي لا تقرؤه تلك الوحدة (D-05).
   *
   * وحالتان هادئتان لا واحدة: التامُّ المستقبِل، والتامُّ الذي أوقف الاستقبال
   * بنفسه. وكلتاهما «لا شيء يُطالَب به» ⇒ لا قائمةَ تحقّق. أما الناقص والمحجوب
   * بالدين والمدعوُّ فالمعالج لهم.
   */
  const settled = Boolean(
    readiness && !debtBlocked && (readiness.readyToReceive || readiness.pausedByChoice)
  );

  return (
    <div className="space-y-6">
      <PageHeading
        title={`مرحباً، ${sub.companyName || "شريكنا"}`}
        action={
          readiness ? (
            <PartnerStateBadge
              status={sub.status}
              ready={settled && !readiness.pausedByChoice}
              paused={Boolean(readiness.pausedByChoice) && !debtBlocked}
              debtBlocked={debtBlocked}
            />
          ) : null
        }
      >
        {onboarding
          ? "هذه صفحتك التشغيلية، وهي مفتوحة لك من الآن: أكمل بياناتك وأسطولك وسائقيك وقوائم أسعارك حتى يجدك المراجع جاهزاً."
          : "هذه صفحتك التشغيلية: منها تُكمل بياناتك وأسطولك وقوائم أسعارك، ومنها تتابع ما اعتمدته الإدارة وما ينتظر المراجعة."}
      </PageHeading>

      {/*
        الحساب يتصدّر: المتعهد المحجوب عن الرحلات يجب أن يقرأ سبب توقفها والمبلغ
        الذي يعيدها قبل أي شيء آخر في الصفحة — لا تحت قائمة تحقق ولا في شاشة ثانية.
      */}
      <PortalBalanceCard result={balance} currency={currency} contact={settings.contact} />

      {readiness ? (
        settled ? null : <OnboardingWizard data={readiness} debtBlocked={debtBlocked} />
      ) : (
        <NotReadyNotice what="بيانات جاهزيتك" />
      )}

      {/*
        بطاقة الحالة تبقى للمعتمَد وحده: المدعوّ يقرأ حالته في المعالج وفي الشريط.
        وجملتُها مقيسة لا ثابتة — انظر ترويسة `readiness-state.tsx`.
      */}
      {/*
        🔴 والبطاقةُ الكبيرة لم تُحذف — صار ظهورُها مشروطاً.
        المعتمَدُ الجاهز يقرأ حالته من الوسم بجوار اسمه، فتُوفَّر الطيّةُ لما يعمل به.
        ومَن أوقف الاستقبال بنفسه أو لم يكتمل تجهيزه أو حُجب بدَين **يقرأ البطاقة
        كاملةً** — لأن الرمز يكفي مَن لا يحتاج شرحاً، ولا يكفي من يحتاج إجراءً.
      */}
      {!onboarding && readiness && !(settled && !readiness.pausedByChoice) ? (
        <ReadinessStateCard data={readiness} debtBlocked={debtBlocked} />
      ) : null}

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
        {totalLists === 0 && readiness ? (
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

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {[
          { href: "/portal/profile" as const, icon: UserRound, label: "تحديث ملفي" },
          { href: "/portal/fleet" as const, icon: CarFront, label: "إدارة أسطولي" },
          { href: "/portal/drivers" as const, icon: IdCard, label: "سائقيّ" },
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
