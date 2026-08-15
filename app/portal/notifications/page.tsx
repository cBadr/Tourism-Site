import { BellRing, BellOff, PlugZap } from "lucide-react";

import {
  Banners,
  NotReadyNotice,
  Notice,
  PageHeading,
} from "@/components/portal/portal-ui";
import { Card } from "@/components/ui/card";
import { REACHING_CHANNELS, type PartnerChannel } from "@/lib/partner-alerts-types";
import { PushSetup } from "../_components/push-setup";
import { portalSetupAccess } from "../_lib/session";
import { CHANNEL_META, ChannelsForm } from "./channels-form";
import { loadPartnerAlerts, type PartnerAlertsView } from "./data";
import { TelegramCard } from "./telegram-card";

/**
 * «قنوات التنبيه» — أين تصلك عروض الرحلات، ومتى تتوقف.
 *
 * ── لماذا هذه الشاشة موجودة أصلاً ───────────────────────────────────────────
 *
 * لأن **لا قناة كانت تبلغ متعهداً**: تليجرام وجهته محادثة المالك، والبريد بلا
 * مزوّد. فالعرض يمرّ في الطابور ثم لا يصل أحداً، وتنتهي مهلة الجولة، وتعود
 * الرحلة إلى الطابور بلا أن يعرف أحد لماذا. والمقيس على قاعدة بدر لحظة كتابة هذه
 * الشاشة: **صفر متعهدين** لهم معرّف تليجرام — أي أن كل شريك في المنصة «غير
 * متصل» بمقياس `partner_availability()`.
 *
 * ── والقرار الذي تحمله الشاشة على وجهها ─────────────────────────────────────
 *
 * 🔒 **إطفاء كل القنوات = «غير متصل»، لا «متصلٌ بلا إشعارات»** (القرار ١-و).
 * وهذا قرار مالكٍ لا اجتهاد شاشة، وله ثمنٌ يقع على المتعهد مباشرةً: التوزيع
 * **يتخطّى** من لا يمكن بلوغه. فيجب ألّا يكتشفه بفقد عمل — يُقال له في ثلاثة
 * مواضع: بطاقة الحالة أعلى الشاشة، ووسمُ كل قناة، وتنبيهٌ حيٌّ **قبل** الحفظ.
 *
 * ولا يعاد اشتقاق الحالة هنا: `reachable/willing/available` تصل من الدالة نفسها
 * التي يقرؤها حوض البث (`partner_availability`) — انظر ترويسة `data.ts`.
 */

export const metadata = { title: "قنوات التنبيه" };

const ERROR_MESSAGES: Record<string, string> = {
  // رموز الربط — من `PAIRING_ISSUES`
  "no-credentials": "قناة تليجرام متوقفة عند المنصة الآن، فتعذّر الربط. لا شيء مطلوب منك.",
  "bot-unreachable": "تعذّر الوصول إلى تليجرام في هذه اللحظة — أعد المحاولة بعد قليل.",
  "webhook-set":
    "ربط تليجرام متوقف لسبب فني عند المنصة. أبلغ الإدارة بهذه الرسالة كما تظهر لك.",
  "no-match":
    "لم نجد ضغطتك على «ابدأ». افتح الرابط، واضغط الزر داخل محادثة البوت، ثم عُد واضغط «تحققتُ».",
  expired: "انتهت صلاحية الرابط. حدّث الصفحة، ثم افتح الرابط الجديد واضغط «ابدأ».",
  "not-private":
    "ضغطتَ «ابدأ» داخل مجموعة. افتح محادثة خاصة مع البوت — عروض رحلاتك لا تُرسل إلى مجموعة يقرؤها غيرك.",
  taken:
    "حساب تليجرام هذا مربوط بمتعهد آخر. لكل شريك حسابه — استخدم حسابك أنت ثم أعد المحاولة.",
  proof:
    "تم الربط، لكن رسالة التأكيد لم تصل. افتح المحادثة وتأكد أنك لم تحظر البوت، ثم جرّب «أرسل رسالة تجربة».",
  "test-failed":
    "لم تصل رسالة التجربة — الغالب أنك حظرت البوت أو حذفت المحادثة. افتحها من جديد واضغط «ابدأ»، ثم أعد الربط.",
};

/* ------------------------------------------------------------------ */
/* بطاقة الحالة — أول ما تقع عليه العين                                 */
/* ------------------------------------------------------------------ */

/**
 * ما ينقص بالضبط ليصير المتعهد بالغاً — سطرٌ لكل قناةٍ ينفع فيها فعل.
 * ⚠ والقنوات المعطّلة عند المنصة **لا تُذكر هنا كمطلوب**: مطالبةُ الشريك بما لا
 * يملكه هي بعينها الشكوى التي أُصلحت في معالج التجهيز (يطارد ما ليس هو العائق).
 */
function missingSteps(view: PartnerAlertsView): string[] {
  const steps: string[] = [];
  for (const channel of REACHING_CHANNELS) {
    const state = view.channels[channel];
    if (state === "needs-link") {
      steps.push(
        channel === "telegram"
          ? "اربط تليجرام من البطاقة أدناه — دقيقة واحدة وخطوتان."
          : channel === "email"
            ? "أضف بريدك في «ملفي» ليصلك العرض عليه."
            : "سجّل جهازاً لإشعارات المتصفح."
      );
    }
    if (state === "off") {
      steps.push(`فعّل قناة «${CHANNEL_META[channel].label}» في التفضيلات أدناه.`);
    }
  }
  return steps;
}

function AvailabilityCard({ view }: { view: PartnerAlertsView }) {
  if (!view.reachable) {
    const steps = missingSteps(view);
    return (
      <Card className="gap-3 border border-red-300 bg-red-50 p-5 text-red-900 dark:border-red-800 dark:bg-red-950 dark:text-red-100">
        <div className="flex flex-wrap items-center gap-2">
          <BellOff className="size-5 shrink-0" aria-hidden="true" />
          <span className="font-heading text-base font-bold">أنت غير متصل</span>
        </div>
        <p className="text-sm leading-relaxed">
          لا قناة واحدة تستطيع أن تبلغك بعرض رحلة، فتوزيع الرحلات <b>يتخطّاك</b>. ولا يظهر
          لك شيء حين يقع ذلك — لا رسالة ولا صفر: العروض تذهب إلى غيرك بصمت.
        </p>
        {steps.length > 0 ? (
          <ul className="list-disc space-y-1 ps-5 text-sm leading-relaxed">
            {steps.map((step) => (
              <li key={step}>{step}</li>
            ))}
          </ul>
        ) : null}
      </Card>
    );
  }

  if (!view.willing) {
    return (
      <Card className="gap-3 border border-amber-300 bg-amber-50 p-5 text-amber-900 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-100">
        <div className="flex flex-wrap items-center gap-2">
          <PlugZap className="size-5 shrink-0" aria-hidden="true" />
          <span className="font-heading text-base font-bold">أوقفتَ استقبال الطلبات</span>
        </div>
        <p className="text-sm leading-relaxed">
          قنواتك تعمل، لكنك أوقفتَ الاستقبال بنفسك — فلا يصلك عرض جديد. أعد العلامة في
          «أستقبل طلبات الرحلات» أدناه ليعود الوصول فوراً.
        </p>
      </Card>
    );
  }

  const reaching = view.reachingChannels as PartnerChannel[];
  return (
    <Card className="gap-3 border border-emerald-300 bg-emerald-50 p-5 text-emerald-900 dark:border-emerald-800 dark:bg-emerald-950 dark:text-emerald-100">
      <div className="flex flex-wrap items-center gap-2">
        <BellRing className="size-5 shrink-0" aria-hidden="true" />
        <span className="font-heading text-base font-bold">أنت متاح لاستقبال الرحلات</span>
      </div>
      <p className="text-sm leading-relaxed">
        تصلك عروض الرحلات على:{" "}
        <b>{reaching.map((channel) => CHANNEL_META[channel].label).join(" · ")}</b>.
      </p>
    </Card>
  );
}

/* ------------------------------------------------------------------ */
/* الصفحة                                                              */
/* ------------------------------------------------------------------ */

export default async function PortalNotificationsPage({
  searchParams,
}: PageProps<"/portal/notifications">) {
  const [params, access] = await Promise.all([searchParams, portalSetupAccess()]);
  // الغلاف يعرض شاشة الحالة المناسبة؛ الصفحة لا تُصيَّر أصلاً في تلك الحالات
  if (!access.ok) return null;

  const result = await loadPartnerAlerts();
  const onboarding = access.stage === "onboarding";

  const saved = params.saved === "1";
  const linked = params.linked === "1";
  const unlinked = params.unlinked === "1";
  const tested = params.tested === "1";
  const error = typeof params.error === "string" ? params.error : null;

  return (
    <div className="space-y-6">
      <PageHeading title="قنوات التنبيه">
        من هنا تختار أين يصلك عرض الرحلة، ومتى توقف استقبال الطلبات. وعرض الرحلة له مهلة
        تنتهي — فالقناة التي تصلك فوراً هي ما يجعلك تلحق به.
      </PageHeading>

      <Banners
        saved={saved || linked || unlinked || tested}
        error={error}
        errorMessages={ERROR_MESSAGES}
        savedMessage={
          linked
            ? "تم ربط تليجرام — أرسلنا رسالة تأكيد إلى محادثتك."
            : unlinked
              ? "فُصل تليجرام. لن تصلك عروض عليه بعد الآن."
              : tested
                ? "أُرسلت رسالة التجربة — افتح تليجرام وتأكد من وصولها."
                : "حُفظت تفضيلاتك."
        }
      />

      {onboarding ? (
        <Notice tone="info">
          <p>
            حسابك قيد المراجعة، فلا تصلك عروض بعد. لكن ربط قنواتك الآن يعني أن أول عرض بعد
            اعتمادك يجدك <b>متصلاً</b> — لا أن تكتشف يومها أن شيئاً لم يصلك.
          </p>
        </Notice>
      ) : null}

      {result.state === "hidden" ? (
        <NotReadyNotice what="قنوات التنبيه" />
      ) : result.state === "failed" ? (
        <Notice tone="warning">
          <p className="font-semibold">تعذّر قراءة حالة قنواتك</p>
          <p>حدّث الصفحة. إن تكرّر الأمر فراسل الإدارة — ولا تعتمد على وصول العروض حتى تتأكد.</p>
        </Notice>
      ) : (
        <>
          <AvailabilityCard view={result.view} />

          <TelegramCard view={result.view} subcontractorId={access.sub.id} />

          {/*
            تدفّق دفع الويب (ج٢) — والشاشة هي بيته المنصوص عليه في القرار ١-ز:
            «شاشة قنوات التنبيه ← شرح **لماذا** ← زرٌّ صريح ← ثم يظهر طلب المتصفح».
            والمكوّن يقرأ حالته بنفسه من `/api/push/*` ولا يحتاج منّا وسيطاً.

            ⚠ **وللمعتمَد وحده**: مسارات `/api/push` على الحارس **الضيّق**
            (`portalAccess` — مكتوبٌ في `app/api/push/_shared.ts`)، فتركيبه للمدعوّ
            كان سيُنتج زرّاً يردّ `auth` — وهو أسوأ من غيابه («الشاشة تتبع الحارس»).
            وربطُ تليجرام أعلاه مفتوحٌ له لأن دواله على الحارس الموسَّع فعلاً.
          */}
          {onboarding ? null : <PushSetup />}

          <div className="space-y-3">
            <h3 className="font-heading text-base font-bold">قنواتك</h3>
            <ChannelsForm view={result.view} />
          </div>

          {/*
            الحقيقة التي تجعل الشاشة كلها مفهومة، ومكانها آخر الصفحة لا أولها:
            من قرأ ما فوقه يعرف الآن **لماذا** لا يكفي الصندوق وحده.
          */}
          <Notice tone="info">
            <p className="font-semibold">لماذا لا يكفي صندوق البورتال وحده؟</p>
            <p className="mt-1">
              لأنه سجلٌّ يستلزم أن تفتحه، وعرض الرحلة له مهلة تنتهي قبل أن تنظر. ولذلك لا
              يُحسب قناةً «تبلغك» في حالة الإتاحة: من ليس له إلا الصندوق يُعدّ{" "}
              <b>غير متصل</b>، ويتخطّاه التوزيع.
            </p>
          </Notice>
        </>
      )}
    </div>
  );
}
