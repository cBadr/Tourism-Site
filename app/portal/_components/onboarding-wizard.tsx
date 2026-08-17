import Link from "next/link";
import {
  AlertTriangle,
  ArrowLeft,
  CheckCircle2,
  Circle,
  Clock3,
  HelpCircle,
  Sparkles,
} from "lucide-react";

import { countLabel, Notice, SubStatusBadge } from "@/components/portal/portal-ui";
import { buttonVariants } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import type { OnboardingReadiness } from "../_lib/onboarding";
/**
 * 🔒 من الوحدة المحيّدة لا من وحدة القياس: `isPromptWeight` **قيمة** يقرؤها هذا
 * المكوّن وعدّادُ «ما ينقصك» معاً، و`onboarding.ts` عليه `server-only`. والقاعدة
 * المدفوعة اليوم: ما يقرؤه أكثر من موضع يعيش في وحدةٍ لا `"use client"` عليها ولا
 * `server-only` — فلا يُقطع طريقُه إلى أيٍّ من الجهتين.
 */
import { isPromptWeight, type OnboardingStep, type StepWeight } from "../_lib/readiness-settle";

/**
 * معالج التجهيز — الشاشة الوحيدة التي تجيب سؤال الشريك الأول: **«ما الذي يمنع
 * وصول الرحلات إليّ الآن؟»**
 *
 * ثلاثة قرارات تحكم شكله:
 *
 * (١) **البند يقول أثره لا ترتيبه.** «الخطوة ٢ من ٥» لا تخبر أحداً بشيء؛
 *     «بدونها لا يصلك عرضٌ واحد» تخبره بكل شيء. لذلك الوسم على الأثر:
 *     *يمنع البثّ* · *يوقفك بعد القبول* · *دخلٌ متروك* · *ينتظر الإدارة*.
 *
 * (٢) **ما ينتظر الإدارة ليس نقصاً في الشريك.** يُعرض بنبرة الخبر ولا رابط له
 *     ولا يُعدّ في «ما ينقصك» — والخلط بينهما يجعل الشريك يبحث عن زرٍّ لا وجود
 *     له. (وهذا هو التمييز بين «لا نعرف» و«صفر» و«لا ينطبق» في قواعد `INDEX`.)
 *
 * (٣) **لا شريط تقدّم بنسبة مئوية.** النسبة تُغري بالاكتمال الشكلي، والمقياس
 *     الحقيقي ثنائي: إما أن كل ما يمنع البثّ أُنجز أو لا.
 *
 * (٤) 🔴 **وهذا المعالج مُطالَبةٌ لا لافتة: لا يُركَّب إذا لم يبقَ ما يُطالَب به.**
 *     كان يبقى على شريكٍ تامّ التجهيز فيصير قائمةَ صحٍّ مشطوبةً بستة أسطر — ضجيجاً
 *     يجعل الشريك يشكّ أصلاً في أنه يستقبل عروضاً (شكوى المالك، ملاحظة ٢). فالقرار
 *     في `page.tsx`: تامٌّ ⇒ سطرُ حالةٍ هادئ (‏`ReadinessStateCard`)، وناقصٌ ⇒ هذا
 *     المعالج. **وشرط الاكتمال واحدٌ مقيسٌ في `_lib/onboarding.ts`** ولا يُشتقّ
 *     هنا ولا هناك — تعريفان لـ«مكتمل» يفترقان، فيُخفى الشريط عن ناقص.
 *
 * ولا حساب هنا إطلاقاً: كل ما يُعرض محسوبٌ في `_lib/onboarding.ts` من صفوف
 * القاعدة، وهذه الشاشة تنسّق وتعرض (D-05 بروحه: المنطق ليس في الواجهة).
 */

/**
 * نصّ الوسم — أربعة أوزان وأربع جمل، وكلٌّ منها **يقول لحظته**: قبل العرض، أو بعد
 * الإسناد، أو بعد القبول، أو لا شيء. وسمٌ يبالغ في لحظته كذبةٌ صغيرة تُرسل الشريك
 * يطارد ما ليس هو العائق — وهو بعينه ما أُصلح في بند الملف.
 */
const WEIGHT_LABEL: Record<StepWeight, string> = {
  blocking: "يمنع وصول العروض",
  // ولا تقول «يمنع»: `dispatch_pool` تُقدّم البالغين وتعود إليه إن لم يكن فيهم
  // أحد (الاحتياطي المقروء في ترويسة `_lib/onboarding.ts`)
  reach: "يتخطّاك التوزيع إلى غيرك",
  contact: "تحتاجه الإدارة لتبلغك بعد الإسناد",
  later: "يوقفك بعد قبول أول رحلة",
  optional: "دخلٌ متروك",
};

/**
 * والنبرة تتبع اللحظة أيضاً: الكهرمانيّ لما يقف بين الشريك وعملٍ يصله كي يبقى
 * مسموعاً، والسماويّ لما يقع بعد القبول، والبنفسجيّ الهادئ لتنبيهٍ لا رفض فيه،
 * والرماديّ لما يحسّن.
 */
const WEIGHT_TONE: Record<StepWeight, string> = {
  blocking:
    "border-amber-300 bg-amber-100 text-amber-900 dark:border-amber-700 dark:bg-amber-950 dark:text-amber-100",
  reach:
    "border-amber-300 bg-amber-100 text-amber-900 dark:border-amber-700 dark:bg-amber-950 dark:text-amber-100",
  contact:
    "border-violet-300 bg-violet-100 text-violet-900 dark:border-violet-800 dark:bg-violet-950 dark:text-violet-100",
  later:
    "border-sky-300 bg-sky-100 text-sky-900 dark:border-sky-700 dark:bg-sky-950 dark:text-sky-100",
  optional: "border-border bg-muted text-muted-foreground",
};

/** أيقونة الحالة — أربع حالات وأربع أيقونات، فلا تُقرأ حالتان بشكل واحد */
function StepIcon({ step }: { step: OnboardingStep }) {
  if (step.state === "done") {
    return (
      <CheckCircle2
        className="mt-0.5 size-5 shrink-0 text-emerald-600 dark:text-emerald-400"
        aria-hidden="true"
      />
    );
  }
  if (step.state === "waiting") {
    return (
      <Clock3
        className="mt-0.5 size-5 shrink-0 text-sky-600 dark:text-sky-400"
        aria-hidden="true"
      />
    );
  }
  if (step.state === "unknown") {
    return (
      <HelpCircle className="mt-0.5 size-5 shrink-0 text-muted-foreground" aria-hidden="true" />
    );
  }
  // 🔒 مثلث الإنذار لما يقف بين الشريك وعملٍ يصله **قبل** أن يقبل شيئاً، وهما
  //    اثنان لا واحد: `blocking` يمنع، و`reach` يُقدّم غيره عليه. و`contact`
  //    و`later` و`optional` تأخذ الدائرة الهادئة عمداً: إنذارٌ يعلو على كل بندٍ
  //    ناقص لا يعود إنذاراً.
  if (isPromptWeight(step.weight)) {
    return (
      <AlertTriangle
        className="mt-0.5 size-5 shrink-0 text-amber-600 dark:text-amber-400"
        aria-hidden="true"
      />
    );
  }
  return <Circle className="mt-0.5 size-5 shrink-0 text-muted-foreground/60" aria-hidden="true" />;
}

function StepRow({ step }: { step: OnboardingStep }) {
  // الوسم يُعرض على ما لم يتمّ وحده: وسمٌ على بندٍ منجَز ضجيجٌ يُبلِّد الوسوم كلها
  const showWeight = step.state === "todo";

  return (
    <li className="flex flex-wrap items-start gap-3 border-t border-border py-3.5 first:border-t-0 first:pt-0">
      <StepIcon step={step} />

      <div className="min-w-0 flex-1 space-y-1">
        <div className="flex flex-wrap items-center gap-2">
          <p
            className={cn(
              "text-sm font-semibold",
              step.state === "done" && "text-muted-foreground line-through"
            )}
          >
            {step.title}
          </p>
          {showWeight ? (
            <span
              className={cn(
                "rounded-full border px-2 py-0.5 text-[11px] font-medium",
                WEIGHT_TONE[step.weight]
              )}
            >
              {WEIGHT_LABEL[step.weight]}
            </span>
          ) : null}
          {step.state === "waiting" ? (
            <span className="rounded-full border border-sky-300 bg-sky-100 px-2 py-0.5 text-[11px] font-medium text-sky-900 dark:border-sky-700 dark:bg-sky-950 dark:text-sky-100">
              ينتظر الإدارة
            </span>
          ) : null}
        </div>
        <p className="text-sm leading-relaxed text-muted-foreground">{step.body}</p>
      </div>

      {step.href ? (
        <Link
          href={step.href}
          className={cn(
            buttonVariants({ variant: step.state === "done" ? "ghost" : "outline", size: "sm" })
          )}
        >
          {step.state === "done" ? "مراجعة" : (step.cta ?? "افتح")}
          <ArrowLeft aria-hidden="true" />
        </Link>
      ) : null}
    </li>
  );
}

/**
 * ترويسة المعالج — الجملة الواحدة التي تلخّص الحالة.
 *
 * ⚠ ونصّها يتبع **المرحلة** لا الحالة الظاهرة: المدعوّ الذي أنهى كل شيء لا يُقال
 * له «أسعارك تدخل التسعير الآن» لأنها لا تدخل حتى يُعتمد. الوعد بأثرٍ لم يقع
 * بعدُ هو النمط ٢ في `LESSONS.md` حرفياً.
 */
function WizardHeadline({ data, debtBlocked }: { data: OnboardingReadiness; debtBlocked: boolean }) {
  const { stage, promptLeft, waitingOnAdmin, degraded } = data;
  const readyToReceive = data.readyToReceive && !debtBlocked;

  /*
    🔴 «تعذّرت القراءة» **قبل كل شيء آخر، ولا تُترجَم إلى عدد.**

    وسببه مقيسٌ في المتصفح لا مستنتَج: بمعطياتِ `degraded` طبعت هذه الترويسة
    حرفياً «حسابك معتمد، لكن ٠ من البنود ما زالت تمنع وصول العروض إليك» — لأن
    الفرع الأخير يعدّ `todo` وحدها، وبندُ «لا نعرف» ليس `todo`. والعطل قديمٌ
    مستقلٌّ عن هذا التغيير (كان يقع بـ`blockingLeft` كذلك)، لكنه صار أقرب للوقوع
    حين دخلت قراءةُ القنوات في `degraded` — فأُصلح هنا.

    ويشمل الفرع المرحلتين قصداً: المدعوُّ كان يقرأ «أنهيت كل ما عليك» على قياسٍ
    ناقص، وهو وعدٌ أسوأ من العدد.
  */
  if (degraded && promptLeft === 0) {
    return (
      <p className="text-sm leading-relaxed text-muted-foreground">
        لم يبقَ عليك بندٌ <span className="font-semibold text-foreground">نعرفه</span>، لكن قراءةً
        واحدة على الأقل تعذّرت — فلا نؤكّد لك جاهزيتك على قياسٍ ناقص. البنود التي تحتها علامة
        استفهام أدناه هي ما لم نستطع الحكم عليه.
      </p>
    );
  }

  if (stage === "onboarding") {
    return promptLeft > 0 ? (
      <p className="text-sm leading-relaxed text-muted-foreground">
        حسابك قيد المراجعة، ولا داعي للانتظار بلا عمل: جهّز ملفك وأسطولك وسائقيك وأسعارك الآن،
        وكل ما تحفظه محفوظ ويبدأ العمل فور الاعتماد. بقي عليك{" "}
        <span className="font-semibold text-foreground">{countLabel(promptLeft)}</span> من البنود
        التي تمنع وصول العروض.
      </p>
    ) : (
      <p className="text-sm leading-relaxed text-muted-foreground">
        أنهيت كل ما عليك — لم يبقَ إلا اعتماد الإدارة لحسابك. لا شيء مطلوب منك الآن، ولن تفقد شيئاً
        بالانتظار: بياناتك وأسعارك تعمل من لحظة الاعتماد بلا إعادة إدخال.
      </p>
    );
  }

  /*
    🔒 شبكةُ أمان لا فرعٌ يُرى في الطريق العادي: الصفحة **لا تركّب هذا المعالج
    أصلاً** حين يكتمل التجهيز، بل تعرض بطاقة الحالة الهادئة (‏`ReadinessStateCard`).
    ويبقى الفرع مكتوباً كي لا يقع سطحٌ جديدٌ غداً على «بقي عليك ٠ من البنود».
  */
  if (readyToReceive) {
    return (
      <p className="text-sm leading-relaxed text-muted-foreground">
        حسابك جاهز لاستقبال العروض: قوائمك المعتمَدة تدخل تسعير المسارات التي تغطيها، ولديك مركبة
        نشطة في كل فئة سعّرتها. أبقِ بياناتك محدّثة ليبقى الوصول متصلاً.
      </p>
    );
  }

  /*
    الحجب بسقف الدين شرطٌ رابع لا يقيسه هذا المعالج ولا يجوز أن يتجاهله:
    `portal_offers` تُسقط عروض من بلغ سقفه، فالجملة «حسابك جاهز» أمام شريك محجوب
    وعدٌ بأثرٍ لا يقع — والتفصيل والمبلغ في بطاقة الحساب فوقها، فلا يُكرَّر هنا.
  */
  if (debtBlocked && promptLeft === 0) {
    return (
      <p className="text-sm leading-relaxed text-muted-foreground">
        تجهيزك مكتمل من طرفك، لكن العروض متوقفة عنك الآن بسبب رصيدك مع المنصة — التفصيل والمبلغ
        الذي يعيدها في بطاقة «حسابك مع المنصة» أعلى الصفحة.
      </p>
    );
  }

  if (waitingOnAdmin) {
    return (
      <p className="text-sm leading-relaxed text-muted-foreground">
        أنهيت كل ما عليك وبقي ما ينتظر مراجعة الإدارة. لا إجراء مطلوب منك الآن.
      </p>
    );
  }

  /*
    🔒 آخرُ شبكةِ أمان قبل الفرع العدديّ: كل مسارٍ يصل هنا بـ`promptLeft = 0`
    يطبع «٠ من البنود». والمسار الوحيد الممكن اليوم هو `pausedByChoice` مع حجبٍ
    بالدين — يمسكه فرع الدين أعلاه — لكن الشرط يبقى مكتوباً لأن كلفةَ خطئه جملةٌ
    عبثية على شاشةٍ تشرح للشريك سبب انقطاع عمله.
  */
  if (promptLeft === 0) {
    return (
      <p className="text-sm leading-relaxed text-muted-foreground">
        حسابك معتمد ولا بندَ ناقصاً من طرفك. وحالتك الكاملة في بطاقة «حالة الحساب» أسفل الصفحة.
      </p>
    );
  }

  return (
    <p className="text-sm leading-relaxed text-muted-foreground">
      حسابك معتمد، لكن{" "}
      <span className="font-semibold text-foreground">{countLabel(promptLeft)}</span> من البنود ما
      زالت تمنع وصول العروض إليك. عالجها بالترتيب أدناه — كل واحد منها شرطٌ في القاعدة لا توصية.
    </p>
  );
}

export function OnboardingWizard({
  data,
  debtBlocked = false,
}: {
  data: OnboardingReadiness;
  /** من `portal_balance().blocked` — شرطٌ رابع خارج قياس التجهيز، انظر `WizardHeadline` */
  debtBlocked?: boolean;
}) {
  const { stage, sub, steps, promptLeft, degraded } = data;
  const readyToReceive = data.readyToReceive && !debtBlocked;

  return (
    <Card className="gap-0 p-5">
      <div className="flex flex-wrap items-center gap-2 pb-1">
        <Sparkles className="size-5 shrink-0 text-primary" aria-hidden="true" />
        <h3 className="font-heading text-base font-bold">
          {stage === "onboarding" ? "تجهيز حسابك" : "جاهزيتك لاستقبال العروض"}
        </h3>
        <SubStatusBadge status={sub.status} />
        {promptLeft === 0 && !degraded && !debtBlocked ? (
          <span className="ms-auto text-xs text-emerald-700 dark:text-emerald-400">
            لا شيء يمنع البثّ من طرفك
          </span>
        ) : null}
      </div>

      <div className="pb-3">
        <WizardHeadline data={data} debtBlocked={debtBlocked} />
      </div>

      {/*
        «تعذّرت القراءة» يُقال مرة واحدة أعلى القائمة لا في كل بند: البنود المتأثرة
        تحمل أيقونة «لا نعرف» بنفسها، والشريط يشرح السبب المشترك.
      */}
      {degraded ? (
        <div className="pb-3">
          <Notice tone="warning">
            <p>
              تعذّرت قراءة بعض بياناتك الآن، فبنودٌ في القائمة تحتها علامة «لا نعرف» بدل حكمٍ قد
              يكون خاطئاً. حدّث الصفحة، وإن تكرر الأمر راسل الإدارة.
            </p>
          </Notice>
        </div>
      ) : null}

      <ul>
        {steps.map((step) => (
          <StepRow key={step.key} step={step} />
        ))}
      </ul>

      {readyToReceive ? (
        <div className="pt-4">
          <Link href="/portal/requests" className={cn(buttonVariants())}>
            افتح صندوق الطلبات
            <ArrowLeft aria-hidden="true" />
          </Link>
        </div>
      ) : null}
    </Card>
  );
}
