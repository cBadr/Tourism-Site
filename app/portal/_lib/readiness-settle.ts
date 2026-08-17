/**
 * حسمُ الجاهزية — **وحدةٌ محيّدة ودالةٌ نقية**: بلا `"use client"` وبلا
 * `server-only` وبلا نداءٍ لقاعدةٍ ولا لـ`react`.
 *
 * ── لماذا انتُزعت من `onboarding.ts` أصلاً؟ لسببين، كلاهما مقيس ────────────────
 *
 * (١) **الوسمان اللذان يستحقان الإنذار قيمةٌ يقرؤها موضعان**: هذه الوحدة (لتعدّ
 *     «ما ينقصك») و`_components/onboarding-wizard.tsx` (ليختار مثلث الإنذار).
 *     وقاعدة اليوم صريحة: ما يقرؤه أكثر من طبقة يعيش في وحدةٍ محيّدة — لا في
 *     ملفٍّ يبدأ بـ`"use client"` (فقيمته لا تعبر إلى الخادم: تصير مرجع عميل
 *     وكل خاصية `undefined`، وهو ما بيّض `/portal/notifications` اليوم)، ولا في
 *     ملفٍّ عليه `server-only` (فلا يعبر إلى العميل إن احتاجه نموذجٌ غداً).
 *     ولا يُعاد تصديرها من ملفٍّ عميل أبداً — إعادةُ التصدير تُبقي البابَ مفتوحاً.
 *
 * (٢) **القرار صار قابلاً للتشغيل خارج Next.** شرطُ إخفاء الشريط لا يُقاس من
 *     لقطة شاشة: `node --experimental-strip-types` يستدعي `settleReadiness` نفسها
 *     التي يستدعيها الخادم، على أرقامٍ مقروءةٍ حيّاً من القاعدة. فبرهانُ الاتجاهين
 *     (تامٌّ ⇒ يُخفى · شرطٌ سقط ⇒ يعود) صار قياساً لا استنتاجاً.
 *
 * ولا حساب مالي هنا ولا قرار أهلية: عدُّ بنودٍ ومنطقٌ بولياني (D-05).
 */

/* ------------------------------------------------------------------ */
/* الأنواع المشتركة                                                    */
/* ------------------------------------------------------------------ */

/**
 * وزن البند — **متى** يعضّ تركُه؟ والشرح الكامل لكل درجة، بموضعها في القاعدة،
 * في ترويسة `onboarding.ts` حيث تُبنى البنود.
 */
export type StepWeight = "blocking" | "reach" | "contact" | "later" | "optional";

/** حالة البند — `done` · `todo` (عليه) · `waiting` (على الإدارة) · `unknown` (لا نعرف) */
export type StepState = "done" | "todo" | "waiting" | "unknown";

/** وجهات المعالج — اتحادٌ حرفيّ كي يقبله `Link` في Next 16 بلا `as` */
export type StepHref =
  | "/portal/profile"
  | "/portal/fleet"
  | "/portal/drivers"
  | "/portal/prices"
  | "/portal/notifications";

export type OnboardingStep = {
  key: string;
  title: string;
  /** جملة واحدة تقول ماذا يفعل الآن، أو لماذا لا شيء مطلوب منه */
  body: string;
  weight: StepWeight;
  state: StepState;
  href: StepHref | null;
  cta: string | null;
};

/* ------------------------------------------------------------------ */
/* الحسم                                                              */
/* ------------------------------------------------------------------ */

/**
 * الوزنان اللذان يقفان بين الشريك وعملٍ يصله **قبل** أن يقبل شيئاً:
 * `blocking` يمنع العرض من أن يُنشأ له، و`reach` يُنشئه ولا يبلغه فيقدّم التوزيع
 * غيره عليه. وهذان وحدهما يُعدّان في «ما ينقصك» ويأخذان مثلث الإنذار.
 *
 * أما `contact` (تبلغك الإدارة بعد الإسناد) و`later` (يوقفك بعد القبول) و
 * `optional` (دخلٌ متروك) فكلها بعد العرض أو حوله — وإنذارٌ يعلو على كل بندٍ ناقص
 * لا يعود إنذاراً.
 */
export function isPromptWeight(weight: StepWeight): boolean {
  return weight === "blocking" || weight === "reach";
}

export type SettleInput = {
  /** `active` وحدها تُخفي الشريط: المدعوّ شريطُه «تجهيز حسابك» وله معناه */
  stage: "active" | "onboarding";
  steps: readonly Pick<OnboardingStep, "weight" | "state">[];
  /** تعذّرت قراءةٌ واحدة على الأقل ⇒ لا يُخفى شيء: «لا نعرف» ليست «تمّ» */
  degraded: boolean;
  /** `accepting_offers` كما تقرؤها `partner_availability` — لا كما تُشتقّ من قناة */
  willing: boolean;
};

export type SettleResult = {
  /** بنود `blocking`/`reach` التي ما زالت على الشريك — عدّاد «ما ينقصك» */
  promptLeft: number;
  /** بنود `blocking` التي أنجزها وتنتظر الإدارة — لا تُعدّ نقصاً ولا تُعدّ اكتمالاً */
  blockingWaiting: number;
  readyToReceive: boolean;
  pausedByChoice: boolean;
  waitingOnAdmin: boolean;
};

/**
 * ⚠ **سقفُ الدين ليس هنا وليس منسيّاً.** يصل من `portal_balance()` وحدها، ولا
 * تقرؤه هذه الدالة ولا وحدةُ القياس — الصفحة تضربه في النتيجة. وإدخالُه هنا كان
 * يستلزم نداءً مالياً في دالةٍ تعدّ بنوداً، وهو الخلط الذي يمنعه D-05.
 */
export function settleReadiness(input: SettleInput): SettleResult {
  const { stage, steps, degraded, willing } = input;

  const promptLeft = steps.filter(
    (step) => isPromptWeight(step.weight) && step.state === "todo"
  ).length;
  const blockingWaiting = steps.filter(
    (step) => step.weight === "blocking" && step.state === "waiting"
  ).length;

  // الأساس المشترك للحالتين الهادئتين؛ ويفرّقهما مفتاحُ «أستقبل الطلبات» وحده
  const settledBase = stage === "active" && promptLeft === 0 && blockingWaiting === 0 && !degraded;

  return {
    promptLeft,
    blockingWaiting,
    readyToReceive: settledBase && willing,
    pausedByChoice: settledBase && !willing,
    waitingOnAdmin: promptLeft === 0 && blockingWaiting > 0,
  };
}
