import type { ReactNode } from "react";
import Link from "next/link";
import {
  BellRing,
  BookOpen,
  CarFront,
  CheckCircle2,
  Clock,
  Coins,
  FileText,
  IdCard,
  Inbox,
  LifeBuoy,
  Lock,
  ReceiptText,
  Route,
  Scale,
  ShieldCheck,
  TriangleAlert,
  Wallet,
} from "lucide-react";

import { ContactChannels } from "@/components/portal/portal-contact";
import { countLabel, dateLabel, Notice, PageHeading } from "@/components/portal/portal-ui";
import { HelpTip } from "@/components/shared/HelpTip";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { getSettings } from "@/lib/settings";
import { cn } from "@/lib/utils";
import { loadPortalAgreement } from "../_lib/agreement";
import { portalSetupAccess } from "../_lib/session";
import { loadApologyOptions } from "../requests/data";
import { loadGuideClosureConfig } from "./data";

/**
 * دليل استخدام بوابة المتعهد — الصفحة التي تُجيب «ماذا يحدث لو…؟».
 *
 * ══════════════════════════════════════════════════════════════════════════
 *  🔴 القاعدة الحاكمة: **كلُّ جملةٍ هنا سلوكٌ مقيس، وكلُّ رقمٍ قراءةٌ حيّة**
 * ══════════════════════════════════════════════════════════════════════════
 *
 * الدليلُ أخطرُ من الشاشة: الشاشةُ تُقرأ بجوار الزرّ فيصحّحها الواقع في ثانية،
 * والدليلُ يُقرأ مرةً ويُبنى عليه قرارٌ بعد شهر. فبندٌ يَعِد بحمايةٍ غير قائمة
 * **أضرُّ من بندٍ غائب** — وهو النمط ٢ في `handover/LESSONS.md` في أسوأ صوره.
 *
 * ولذلك ثلاثة قيود على كل حرفٍ في هذا الملف:
 *
 * (١) **لا رقمَ محفور.** مهلةُ الاعتماد وعتبةُ الاعتذار ومفتاحُ الخصم ومهلةُ
 *     الاتفاقية كلُّها تصل من `data.ts` و`loadPortalAgreement()` — أي من نفس
 *     الدوالّ التي تقرؤها القاعدة حين تُنفّذ. ومقبضٌ يغيّره المالك من لوحته
 *     يغيّر هذه الصفحة في نفس اللحظة، بلا نشرةٍ ولا تحرير.
 *
 * (٢) **وما لا يُقرأ يُقال إنه لا يُقرأ.** `dispatch_config()` مرفوضةٌ لجلسة
 *     المتعهد (قِيس: `permission denied`)، فمهلةُ الردّ على العرض وعددُ الموجات
 *     **لا رقمَ لهما هنا** — والإحالة على العدّاد المكتوب على بطاقة العرض. طبعُ
 *     رقمٍ منقولٍ عن ملف هجرة كان سيكون حفراً بثوب قياس (D-58).
 *
 * (٣) **وما تراه الشاشةُ فعلاً يُقاس لا يُفترض.** زرُّ «اعتذر عن الرحلة» لا
 *     يُرسَم إلا حين تعود `loadApologyOptions().ready` صادقة، فالدليل يقرؤها
 *     بنفسه ويقول للشريك ما هو **قائمٌ الآن** لا ما ينبغي أن يكون. ووعدُ زرٍّ
 *     لا يظهر يجعل الشريك يبحث عنه في لحظةٍ حرجة بدل أن يراسل الإدارة.
 *
 * ── ولماذا حارسُه الموسَّع (`portalSetupAccess`) ───────────────────────────
 * لأن المدعوَّ الذي يجهّز نفسه أحوجُ الناس إليه: يقرأ قواعد اللعبة **قبل** أن
 * يلتزم برحلة عميلٍ دفع، لا بعدها. ولا فعلَ في هذه الصفحة ولا كتابةَ حرف —
 * قراءةٌ محضة، فلا حارسَ تشغيليّ يلزمها.
 *
 * ── وما ليس فيها بقصد ─────────────────────────────────────────────────────
 * 🔒 لا سقفَ دَينٍ برقمه (أسقطته `0030` من `portal_balance` عمداً)، ولا هامشَ
 *    المنصة، ولا سعرَ العميل، ولا تكلفةَ منافس، ولا مبلغَ خصمٍ افتراضيّ بجوار
 *    سببه — كلُّها ممنوعةٌ بنيوياً في البورتال، وذكرُها في دليلٍ يفتحُ من الشرح
 *    ما أغلقته البنية.
 */

export const metadata = { title: "دليل الاستخدام" };

/* ------------------------------------------------------------------ */
/* لبنات العرض — محلّية لهذه الصفحة                                     */
/* ------------------------------------------------------------------ */

/**
 * حالةٌ عمليّة — سؤالٌ بلغة الشريك، وجوابٌ مطويّ تحته.
 *
 * ولماذا `<details>` بلا جافاسكربت؟ لأن الدليل صفحةٌ طويلة بطبعها، والمطويّ
 * يجعل السؤال نفسه فهرساً: العين تمسح الأسئلة وتفتح ما يخصّها. وهو نفس النمط
 * المستعمل في `OfferActions` و`TripClosurePanel` — بلا حالة عميل ولا مكتبة.
 */
function Scenario({
  question,
  tone = "neutral",
  children,
}: {
  question: string;
  /** `warn` لما يترتب عليه أثرٌ في ملف الشريك أو في ماله */
  tone?: "neutral" | "warn";
  children: ReactNode;
}) {
  return (
    <details className="group rounded-xl border border-border bg-card">
      <summary className="flex cursor-pointer list-none items-start gap-2 p-4 font-medium [&::-webkit-details-marker]:hidden">
        <span
          aria-hidden="true"
          className={cn(
            "mt-0.5 grid size-5 shrink-0 place-items-center rounded-full text-[11px] font-bold",
            tone === "warn"
              ? "bg-amber-100 text-amber-900 dark:bg-amber-900 dark:text-amber-100"
              : "bg-muted text-muted-foreground"
          )}
        >
          ؟
        </span>
        <span className="min-w-0">{question}</span>
      </summary>
      <div className="space-y-3 border-t border-border px-4 py-4 text-sm leading-relaxed text-muted-foreground">
        {children}
      </div>
    </details>
  );
}

/** عنوان قسم — أيقونةٌ ونصّ، بإيقاع عناوين بقية البورتال */
function Section({
  icon,
  title,
  children,
}: {
  icon: ReactNode;
  title: string;
  children: ReactNode;
}) {
  return (
    <section className="space-y-3">
      <h3 className="flex items-center gap-2 font-heading text-base font-bold">
        <span className="text-primary" aria-hidden="true">
          {icon}
        </span>
        {title}
      </h3>
      {children}
    </section>
  );
}

/** خطوةٌ في مسار الرحلة — الرقم يسار العنوان في RTL بخصائص منطقية */
function Step({
  index,
  title,
  children,
}: {
  index: number;
  title: string;
  children: ReactNode;
}) {
  return (
    <li className="flex gap-3">
      <span
        aria-hidden="true"
        className="grid size-7 shrink-0 place-items-center rounded-full bg-primary/10 font-heading text-xs font-bold text-primary tabular-nums"
      >
        {countLabel(index)}
      </span>
      <div className="min-w-0 space-y-1">
        <p className="font-medium text-foreground">{title}</p>
        <p className="text-sm leading-relaxed text-muted-foreground">{children}</p>
      </div>
    </li>
  );
}

/** صفٌّ في جدول المهل: البند · القيمة الآن · من أين قُرئت */
function FactRow({
  label,
  value,
  source,
}: {
  label: string;
  value: ReactNode;
  source: string;
}) {
  return (
    <tr className="border-b border-border last:border-0 align-top">
      <th scope="row" className="py-2.5 pe-3 text-start font-medium">
        {label}
      </th>
      <td className="py-2.5 pe-3 font-semibold text-foreground">{value}</td>
      <td className="py-2.5 text-xs leading-5 text-muted-foreground">{source}</td>
    </tr>
  );
}

/** «لم تصل القيمة» تُكتب ولا تُستبدل بصفر (القاعدة ١٥) */
const hoursLabel = (value: number | null): ReactNode =>
  value === null ? (
    <span className="text-muted-foreground">تعذّرت قراءتها</span>
  ) : (
    <>{countLabel(value)} ساعة</>
  );

/* ------------------------------------------------------------------ */
/* الصفحة                                                              */
/* ------------------------------------------------------------------ */

export default async function PortalGuidePage() {
  const access = await portalSetupAccess();
  // الغلاف يعرض شاشة الحالة المناسبة؛ الصفحة لا تُصيَّر أصلاً في تلك الحالات
  if (!access.ok) return null;

  const [closure, agreement, apology, settings] = await Promise.all([
    loadGuideClosureConfig(),
    // 🔒 الاتفاقية من قارئها الوحيد المُذاكَر — لا تُستنسخ حالتُها هنا (القاعدة ١٢)
    loadPortalAgreement(),
    // وكذلك أسبابُ الاعتذار وتوفّرُ زرّه: نقرأ ما تقرؤه بطاقةُ الرحلة نفسها
    loadApologyOptions(),
    getSettings(),
  ]);

  const cfg = closure.state === "ready" ? closure.config : null;
  const doc = agreement.state === "ready" ? agreement.agreement : null;
  const onboarding = access.stage === "onboarding";

  /**
   * هل زرُّ الاعتذار مرسومٌ فعلاً على بطاقات الرحلات؟
   *
   * `TripClosurePanel` يشترط `apology.ready` حرفياً، و`loadApologyOptions`
   * تعيدها `false` حين لا يصلها سببٌ واحد. فالسؤال يُقاس ولا يُفترض — ولا
   * يُطرح أصلاً على المدعوّ: حارسُ تلك القراءة ضيّق (`portalAccess`) فيردّه،
   * وقولُ «الزرّ غائب» له خبرٌ صحيحٌ في غير موضعه.
   */
  const apologyButtonLive = !onboarding && apology.ready;

  return (
    <div className="space-y-8">
      <PageHeading
        title="دليل استخدام البوابة"
        help="كل رقمٍ في هذه الصفحة يُقرأ من إعدادات المنصة لحظة فتحها — فما تراه هنا هو المعمول به الآن، لا نصّاً كُتب يوماً ما."
      >
        كيف تصلك الرحلة، وماذا يحدث في كل حالة قد تمرّ بها: عرضٌ لم تردّ عليه، ظرفٌ طرأ بعد
        القبول، خصمٌ لا تعرف سببه، سعرٌ تريد تعديله. اقرأه مرة، وعُد إليه عند أول موقف.
      </PageHeading>

      {onboarding ? (
        <Notice tone="info">
          <p>
            حسابك قيد المراجعة، فلا تصلك عروض بعد — وهذا أفضل وقتٍ لقراءة هذا الدليل: تعرف
            قواعد اللعبة قبل أن تلتزم بأول رحلة، لا بعدها.
          </p>
        </Notice>
      ) : null}

      {/* ============================================================ */}
      {/* ١) الطريق كاملاً                                              */}
      {/* ============================================================ */}
      <Section icon={<Route className="size-4" />} title="الطريق كاملاً: من سعرك إلى مالك">
        <Card className="p-5">
          <ol className="space-y-4">
            <Step index={1} title="تكتب تكلفتك في قائمة أسعار">
              الرقم الذي تكتبه هو <span className="font-medium">ما تتقاضاه أنت</span> عن
              الاتجاه الواحد، لا ما يدفعه العميل. والمنصة تضيف هامشها فوقه وتعرض السعر
              النهائي وحده على العميل.
            </Step>
            <Step index={2} title="ترسلها للاعتماد">
              المسودة محفوظة عندك ولا تدخل التسعير مهما كانت دقيقة. الإرسال هو ما يُوصلها
              إلى الإدارة.
            </Step>
            <Step index={3} title="تعتمدها الإدارة">
              عندها فقط تدخل قائمتك تغطيةَ المسارات. وأي تعديل على قائمة معتمَدة يعيدها إلى
              المراجعة قبل أن تعمل من جديد.
            </Step>
            <Step index={4} title="يصير حجز العميل «مؤكَّداً»">
              البثّ لا يبدأ قبل ذلك، ويتوقف عن الحجز في اللحظة التي يخرج فيها من هذه الحالة
              (‏أُلغي أو اكتمل أو فشل) فتُسحب عروضه المفتوحة.
            </Step>
            <Step index={5} title="يصلك العرض — إن توفّرت الشروط كلها">
              حسابك معتمَد · قائمتك المعتمَدة تغطّي المسار وفيها سعرٌ لفئة الحجز ·{" "}
              <span className="font-medium">ولك مركبة نشطة من تلك الفئة بعينها</span> ·
              ومستحقك في حدود سقف الرحلة · ولم تبلغ حدّ المديونية · وقبِلتَ الاتفاقية
              السارية. سقوطُ واحدٍ منها يعني ألّا يصلك شيء — بلا رسالة.
            </Step>
            <Step index={6} title="تقبل — وأول قابل يفوز">
              لحظة قبول أحد المتعهدين تُغلق الرحلة ويختفي العرض من صناديق الباقين. وبقبولك
              تظهر لك بيانات تواصل العميل في «رحلاتي»، ويثبت مستحقك فلا يتغير بعدها.
            </Step>
            <Step index={7} title="تسجّل مركبة الرحلة وسائقها">
              من سجلّك أنت، على بطاقة الرحلة. ويراهما العميل على صفحة متابعته فور حفظك.
            </Step>
            <Step index={8} title="تنفّذ الرحلة ثم تُعلن إتمامها">
              الزرّ اسمه «أعلن إتمام الرحلة» لا «تمّت» — لأنه{" "}
              <span className="font-medium">طلبٌ لا إتمام</span>.
            </Step>
            <Step index={9} title="يُعتمد الإعلان — وعندها وحدها يُقيَّد مستحقك">
              تعتمده الإدارة، أو يُعتمد تلقائياً بمضيّ المهلة. ولا يُقيَّد لك مليم قبل
              الاعتماد، ولو مضى الموعد وانتهت الرحلة فعلاً.
            </Step>
          </ol>
        </Card>
      </Section>

      {/* ============================================================ */}
      {/* ٢) الحالات العملية                                            */}
      {/* ============================================================ */}
      <Section icon={<LifeBuoy className="size-4" />} title="حالات عملية — «ماذا يحدث لو…؟»">
        <div className="space-y-2.5">
          {/* ─ العروض ─────────────────────────────────────────────── */}
          <Scenario question="وصلني عرضٌ وأنا مشغول ولم أردّ عليه — ماذا يحدث؟">
            <p>
              <span className="font-medium text-foreground">لا شيء عليك.</span> ترْكُ العرض
              حتى تنتهي مهلته لا يرتّب عليك التزاماً ولا خصماً — الالتزام ينشأ بالقبول وحده.
              وبانتهاء المهلة يُغلق عرضك، وتنتقل الرحلة إلى موجة عرضٍ تالية، فإن نفدت
              الموجات ذهبت إلى فريق التشغيل ليُسندها يدوياً.
            </p>
            <p className="rounded-lg bg-amber-50 p-3 text-amber-900 dark:bg-amber-950/60 dark:text-amber-100">
              <span className="font-semibold">وفرقٌ عمليٌّ يستحق أن تعرفه:</span> الرفض
              الصريح يستثنيك من <span className="font-medium">كل موجة تالية</span> على هذه
              الرحلة — النظام لا يعرض عليك ما سبق أن رفضته. أما تركُ العرض حتى تنتهي مهلته
              فلا يستثنيك، فقد يعود إليك في الموجة التالية. ⇐ فإن كنت غير قادرٍ الآن وقد تقدر
              بعد قليل، <span className="font-medium">اترك العرض</span>؛ وإن كنت متأكداً أنك
              لن تنفّذها، <span className="font-medium">ارفضها فوراً</span> فتنتقل إلى غيرك
              أسرع.
            </p>
            <p>
              وكم مدة المهلة؟ <span className="font-medium text-foreground">مكتوبةٌ على
              بطاقة العرض نفسها</span> بعدّادٍ يعدّ أمامك حتى الصفر — وهي المصدر الوحيد،
              لأنها تُضبط من لوحة الإدارة وقد تتغير. ولذلك لا نطبع لها رقماً هنا.
            </p>
          </Scenario>

          <Scenario question="فتحت العرض فوجدت «سبقك متعهد آخر» — هل أخطأت في شيء؟">
            <p>
              لا. الرحلة تُسند لأول من يقبلها، والنظام يفحص ذلك{" "}
              <span className="font-medium text-foreground">بعد إغلاق الصف</span> فلا يمكن أن
              يفوز اثنان بها. من يصل ثانياً يقرأ هذه الجملة، ولا يُسجَّل عليه شيء ولا ينقص من
              حظّه في العروض التالية.
            </p>
            <p>
              وإن تكرر ذلك كثيراً فالسبب غالباً أن العرض لا يبلغك بسرعة: راجع{" "}
              <Link href="/portal/profile#channels" className="text-primary underline underline-offset-4">
                قنوات التنبيه
              </Link>{" "}
              — صندوق البوابة وحده لا يكفي لأنه يستلزم أن تفتحه.
            </p>
          </Scenario>

          {/* ─ الاعتذار ───────────────────────────────────────────── */}
          <Scenario tone="warn" question="قبلتُ رحلة ثم طرأ ظرف — كيف أعتذر، وما ثمنُه؟">
            {apologyButtonLive ? (
              <p>
                من بطاقة الرحلة في «رحلاتي»، زرّ{" "}
                <span className="font-medium text-foreground">«اعتذر عن الرحلة»</span>: تختار
                سبباً من القائمة وتكتب سطراً يشرح الموقف.
              </p>
            ) : onboarding ? (
              <p>
                يظهر لك على بطاقة الرحلة بعد اعتماد حسابك وقبولك أول رحلة، وفيه قائمةُ أسباب
                تختار منها.
              </p>
            ) : (
              <p className="rounded-lg bg-red-50 p-3 text-red-900 dark:bg-red-950/60 dark:text-red-100">
                <span className="font-semibold">تنبيه صادق:</span> زرّ الاعتذار{" "}
                <span className="font-medium">لا يظهر لك على بطاقات رحلاتك الآن</span> — قائمة
                الأسباب لا تصل حسابك. فإن اضطررت إلى الاعتذار عن رحلة قبلتَها{" "}
                <span className="font-medium">راسل الإدارة فوراً</span> على القنوات أسفل هذه
                الصفحة، وبأطول مهلة ممكنة قبل الموعد. ولا تصمت: الرحلة تبقى باسمك حتى تفشل.
              </p>
            )}
            <ul className="list-disc space-y-1.5 ps-5">
              <li>
                <span className="font-medium text-foreground">وجهة الرحلة بعدك تتفرّع
                بالوقت المتبقي:</span>{" "}
                {cfg?.apologyManualHours === null || cfg === null ? (
                  <>
                    تُراجَع يدوياً أو تُبَثّ من جديد بحسب عتبةٍ تضبطها الإدارة — وتعذّرت قراءة
                    قيمتها الآن.
                  </>
                ) : (
                  <>
                    إن بقي على الانطلاق{" "}
                    <span className="font-semibold text-foreground">
                      {countLabel(cfg.apologyManualHours)} ساعة
                    </span>{" "}
                    أو أكثر انطلقت موجة عرضٍ جديدة على متعهدين آخرين تلقائياً؛ وإن قلّ عن ذلك
                    ذهبت إلى الإسناد اليدوي ونُبِّه فريق التشغيل فوراً.
                  </>
                )}
              </li>
              <li>
                <span className="font-medium text-foreground">يُسجَّل الاعتذار في ملفك</span>{" "}
                بسببه ونصّك وموعد وقوعه، ولن تُعرض عليك هذه الرحلة مرة أخرى.
              </li>
              <li>
                <span className="font-medium text-foreground">
                  لا يُقبل الاعتذار وأنت معلَّقٌ على إعلان إتمام
                </span>{" "}
                لنفس الرحلة — اسحب الإعلان بمراسلة الإدارة أولاً.
              </li>
              <li>
                <span className="font-medium text-foreground">والسبب الصادق أنفع لك من
                الأقرب:</span> الأسباب مصنَّفة، ولكلٍّ أثرٌ معلوم مسبقاً — منها ما لا أثر له
                إطلاقاً (كعطل المركبة والظرف القاهر). ولذلك لا يُعرض بجوار أي سبب مبلغٌ ولا
                إجراء: من يختار الأرخص لا الأصدق يُفسد البيانات التي تُنصفه لاحقاً.
              </li>
            </ul>
            {cfg?.apologyDeductionEnabled === false ? (
              <p className="rounded-lg bg-emerald-50 p-3 text-emerald-900 dark:bg-emerald-950/60 dark:text-emerald-100">
                <span className="font-semibold">وحالة الخصم الآن:</span> خصمُ الاعتذار{" "}
                <span className="font-medium">مُطفأٌ على مستوى المنصة</span> في هذه اللحظة،
                فلا يقع خصمٌ آليّ على اعتذارك. وهذا مفتاحٌ تملكه الإدارة وقد تشعله، فتتغير هذه
                الجملة معه.
              </p>
            ) : cfg?.apologyDeductionEnabled === true ? (
              <p className="rounded-lg bg-amber-50 p-3 text-amber-900 dark:bg-amber-950/60 dark:text-amber-100">
                <span className="font-semibold">وحالة الخصم الآن:</span> خصمُ الاعتذار{" "}
                <span className="font-medium">مُشتعل</span>. ومع ذلك فالاعتذار نفسه لا يخصم
                شيئاً في اللحظة: يُحسب مبلغٌ مقترح{" "}
                <span className="font-medium">لا يتجاوز مستحق الرحلة نفسها بحال</span>، ولا
                يُقيَّد إلا بقرارٍ إداري — ولك أن تعترض عليه.
              </p>
            ) : (
              <p>
                وحالة مفتاح الخصم لم تصلنا الآن، فلا نحكم عليها — راجع بطاقة «خصومات على
                حسابك» في «رحلاتي»، فما وقع عليك فعلاً مكتوبٌ فيها بمبرَّره.
              </p>
            )}
          </Scenario>

          {/* ─ الإتمام ────────────────────────────────────────────── */}
          <Scenario question="انتهت الرحلة — ماذا أفعل بالضبط، ومتى يدخل المال؟">
            <p>
              اضغط <span className="font-medium text-foreground">«أعلن إتمام الرحلة»</span> على
              بطاقتها. وانتبه إلى أن الضغطة{" "}
              <span className="font-medium text-foreground">لا تُتمّ شيئاً</span>: تبقى الرحلة
              «مُسندة»، ولا يُقيَّد مستحقك، حتى يُعتمد الإعلان.
            </p>
            <ul className="list-disc space-y-1.5 ps-5">
              <li>
                لا يُقبل الإعلان{" "}
                <span className="font-medium text-foreground">قبل حلول موعد الانطلاق</span> —
                فلا تُعلن إتمام رحلةٍ لم تبدأ.
              </li>
              <li>
                إعلانٌ واحد لكل رحلة. وإن أعلنتَ مرتين قرأت «أعلنتَ إتمام هذه الرحلة بالفعل».
              </li>
              <li>
                {cfg?.completionApproveHours === null || cfg === null ? (
                  <>
                    ويُعتمد تلقائياً بمضيّ مهلةٍ تضبطها الإدارة إن لم يصدر قرار — وتعذّرت قراءة
                    قيمتها الآن؛ وموعدُ الاعتماد التلقائي لرحلتك أنت مكتوبٌ بتاريخه على بطاقتها.
                  </>
                ) : (
                  <>
                    ويُعتمد تلقائياً إن مضت{" "}
                    <span className="font-semibold text-foreground">
                      {countLabel(cfg.completionApproveHours)} ساعة
                    </span>{" "}
                    على إعلانك بلا قرارٍ من الإدارة. والمهلة{" "}
                    <span className="font-medium text-foreground">تُجمَّد لحظة إعلانك</span>،
                    فتغييرُها من اللوحة بعد ذلك لا يمسّ رحلتك — وموعدُها بتاريخه مكتوبٌ على
                    بطاقة رحلتك نفسها.
                  </>
                )}
              </li>
              <li>
                الاعتماد التلقائي{" "}
                <span className="font-medium text-foreground">يقع في أول دورة آلية بعد
                استحقاقه</span> لا في الثانية نفسها، فتأخّرُ دقائق ليس عطلاً.
              </li>
              <li>
                <span className="font-medium text-foreground">وحالتان يتجمّد فيهما</span>{" "}
                وينتظر قراراً بشرياً: أن يكون لك تظلّمٌ مفتوح على هذه الرحلة، أو أن يكون قد سبق
                رفضُ إعلانٍ عليها بقرار إداري. وحينها الصمتُ لا يعتمد شيئاً.
              </li>
            </ul>
          </Scenario>

          <Scenario tone="warn" question="رفضت الإدارة إعلان الإتمام — ما خطوتي؟">
            <p>
              تجد سبب الإدارة مكتوباً على بطاقة الرحلة نفسها تحت عنوان «لم تُعتمد هذه الرحلة
              مكتملة». اقرأه أولاً: كثيرٌ من الرفض سببه معلومةٌ ناقصة تُحلّ برسالة.
            </p>
            <p>
              وإن رأيت القرار غير صحيح فلك{" "}
              <span className="font-medium text-foreground">اعتراضٌ مكتوب</span> من نفس
              البطاقة. اشرح ما جرى بوضوح — الاعتراض المبهم لا يمكن بحثه، والنظام يرفض ما يقلّ
              عن {countLabel(10)} أحرف.
            </p>
          </Scenario>

          {/* ─ الخصم والتظلّم ──────────────────────────────────────── */}
          <Scenario tone="warn" question="نقص من رصيدي مبلغ ولا أعرف عن أي رحلة ولا لماذا">
            <p>
              افتح{" "}
              <Link href="/portal/trips" className="text-primary underline underline-offset-4">
                رحلاتي
              </Link>{" "}
              وانزل إلى بطاقة{" "}
              <span className="font-medium text-foreground">«خصومات على حسابك»</span>: تجد كل
              خصمٍ قُيِّد عليك برمز رحلته ومبلغه وسببه و
              <span className="font-medium text-foreground">مبرَّره المكتوب كاملاً</span> كما
              ثُبِّت في السجل — بلا اختصار ولا «اقرأ المزيد». والبطاقة لا تظهر أصلاً حين لا خصم
              عليك.
            </p>
            <p>
              <span className="font-medium text-foreground">وسقفُ الخصم عن أي رحلة هو مستحقُّ
              تلك الرحلة نفسها</span> ولا يتجاوزه — فلا يترتب على خصمٍ رصيدٌ سالبٌ في ذمتك ولا
              مطالبةٌ بما يزيد على ما كنت تستحقه عنها. (البند ٨ من الاتفاقية.)
            </p>
            <p className="rounded-lg bg-muted/60 p-3">
              <span className="font-semibold text-foreground">والتظلّم — ما هو مكتوبٌ في
              الاتفاقية وما يفرضه النظام:</span>
            </p>
            <ul className="list-disc space-y-1.5 ps-5">
              <li>
                <span className="font-medium text-foreground">الاتفاقية</span> تعطيك{" "}
                {countLabel(14)} يوماً من قيد الخصم لتعترض، وتُلزم المنصة بالرد خلال{" "}
                {countLabel(7)} أيام عمل بقرارٍ مسبَّب.
              </li>
              <li>
                <span className="font-medium text-foreground">والنظام</span> لا يغلق زرّ
                الاعتراض بتاريخ: ما يفرضه فعلاً هو أن تكون الرحلة من سجلّك، وأن يكون شرحك{" "}
                {countLabel(10)} أحرف فأكثر، وألّا يكون لك اعتراضٌ{" "}
                <span className="font-medium">مفتوح</span> على نفس الرحلة — فإذا بُتَّ في
                اعتراضك جاز لك فتح غيره.
              </li>
              <li>
                ولا يبتّ في اعتراضك أحدٌ غير الإدارة، ويصلك قرارها{" "}
                <span className="font-medium text-foreground">مكتوباً</span> على قناتك ويُحفظ
                في صندوق تنبيهاتك.
              </li>
              <li>
                <span className="font-medium text-foreground">وقبولُ الاعتراض لا يردّ المال
                من تلقائه:</span> ردُّ الخصم حركةٌ مسمّاة في كشف حسابك يجريها المشرف بيده،
                فتراها بندًا صريحاً لا تعديلاً صامتاً على رقم.
              </li>
            </ul>
          </Scenario>

          {/* ─ الأسعار ────────────────────────────────────────────── */}
          <Scenario question="رفعتُ سعراً وأريد تعديله — هل أستطيع؟">
            <ul className="list-disc space-y-1.5 ps-5">
              <li>
                <span className="font-medium text-foreground">مسودة:</span> عدّلها واحذفها كما
                شئت — لا تدخل التسعير أصلاً، ولا تراها الإدارة.
              </li>
              <li>
                <span className="font-medium text-foreground">قيد المراجعة:</span> وصلت
                الإدارة، فلا تُحذف من عندك حتى لا تختفي تغطيةٌ من تحت مراجعةٍ جارية. راسل
                الإدارة لسحبها إن كان التعديل ضرورياً.
              </li>
              <li>
                <span className="font-medium text-foreground">معتمَدة:</span> تعدّلها متى شئت،
                لكن التعديل{" "}
                <span className="font-medium">يعيدها إلى المراجعة تلقائياً</span> ولا تعمل حتى
                تُعتمد من جديد. فراجعها دفعةً واحدة بدل تعديلاتٍ متفرقة، وكل واحدة تُعيدها إلى
                الطابور.
              </li>
              <li>
                <span className="font-medium text-foreground">أُعيدت بملاحظة:</span> اقرأ
                ملاحظة الإدارة على بطاقة المسار، عالجها، ثم أرسلها من جديد.
              </li>
            </ul>
            <p>
              والكشف وعاءٌ لمسارات كثيرة تُرسَل{" "}
              <span className="font-medium text-foreground">بطلب اعتماد واحد</span> — استعمله
              بدل مسارٍ مستقلٍّ لكل خط، فمئةُ مسارٍ مستقلّ تعني مئة طلب.
            </p>
          </Scenario>

          <Scenario tone="warn" question="سعّرتُ المسار ومع ذلك لا تصلني عروض عليه">
            <p>سبعة أسباب، مرتَّبةً من الأكثر وقوعاً — افحصها بهذا الترتيب:</p>
            <ol className="list-decimal space-y-1.5 ps-5">
              <li>
                <span className="font-medium text-foreground">لا مركبة نشطة لديك من فئة
                الحجز.</span> هذا الفخّ أصمتُها كلها: قائمةٌ معتمَدة تُسعّر فئةً لا مركبة نشطة
                لك فيها <span className="font-medium">لا تُنتج عرضاً واحداً أبداً</span> — البثّ
                يشترط الاثنين معاً. والمركبة الموقوفة موجودةٌ في سجلّك ولا تُحتسب.
              </li>
              <li>
                <span className="font-medium text-foreground">القائمة لم تُعتمد بعد</span> —
                مسودةً كانت أو قيد مراجعة أو أُعيدت بملاحظة.
              </li>
              <li>
                <span className="font-medium text-foreground">اتفاقية المتعهد.</span> بانقضاء
                مهلة قبولها تتوقف العروض عنك تماماً.
              </li>
              <li>
                <span className="font-medium text-foreground">مستحقك أعلى من سقف تلك
                الرحلة.</span> لكل رحلة سقفٌ لا يتجاوزه مستحق المتعهد، ويتّسع قليلاً في الموجة
                التالية — فالسعر المضخَّم يُخرجك من العرض بلا إشعار.
              </li>
              <li>
                <span className="font-medium text-foreground">غطّى المسارَ غيرُك بسعرٍ
                أقل.</span> إن غطّاه أكثر من متعهد أُخذ أقلهم تكلفةً في تلك الفئة.
              </li>
              <li>
                <span className="font-medium text-foreground">حدّ المديونية.</span> من بلغه
                توقفت عنه العروض حتى يسدّد — وبطاقة حسابك تقول ذلك ومعها المبلغ الذي يرفع
                الحجب.
              </li>
              <li>
                <span className="font-medium text-foreground">لا قناة تبلغك.</span> هذه لا
                تمنع العرض لكنها تؤخّرك: التوزيع{" "}
                <span className="font-medium">يقدّم عليك كل من يمكن بلوغه</span>، ولا يصلك شيء
                إلا حين لا يوجد بالغٌ واحد.
              </li>
            </ol>
            <p className="rounded-lg bg-muted/60 p-3">
              <span className="font-semibold text-foreground">ونقطةٌ يخطئ فيها الكثير:</span>{" "}
              حين تكون لك أكثر من قائمة تغطّي نفس المسار، فالقائمة التي تُحتسب عليك هي{" "}
              <span className="font-medium">الأقربُ مركزاً لنقطة انطلاق الرحلة</span> — لا
              أرخصُ قوائمك. فسعّر كل منطقة بقائمتها الخاصة، ولا تعتمد على قائمةٍ بعيدة لتغطية
              رحلةٍ قريبة.
            </p>
            <p>
              وقائمة الفحص هذه مقيسةٌ على حسابك أنت في{" "}
              <Link href="/portal" className="text-primary underline underline-offset-4">
                لوحة المتعهد
              </Link>{" "}
              — تقول لك أي بندٍ ناقصٌ عندك بالتحديد بدل أن تخمّن.
            </p>
          </Scenario>

          {/* ─ التنفيذ ────────────────────────────────────────────── */}
          <Scenario question="العميل يقول إنه لا يجد رقم السائق — هل هناك عطل؟">
            <p>لا. للرقم نافذةٌ مقصودة:</p>
            <ul className="list-disc space-y-1.5 ps-5">
              <li>
                <span className="font-medium text-foreground">نوع المركبة ولونها ولوحتها واسم
                السائق:</span> يراها العميل <span className="font-medium">فور حفظك</span>.
              </li>
              <li>
                <span className="font-medium text-foreground">هاتف السائق:</span> يظهر له{" "}
                <span className="font-medium">قبل موعد الالتقاء بمدة تحددها الإدارة</span> —
                فغيابه قبلها ليس عطلاً؛ ثم{" "}
                <span className="font-medium">يختفي بعد الموعد باثنتي عشرة ساعة</span> فلا يبقى
                رقم سائقك معروضاً على حجزٍ انتهى.
              </li>
              <li>
                <span className="font-medium text-foreground">رقم الرخصة وصورها ومستندات
                السائق:</span> لا تصل العميل إطلاقاً — تراها أنت والإدارة وحدكما.
              </li>
            </ul>
            <p>
              وتعديلُ اختيارك يصل صفحة العميل فوراً: نحن نحفظ{" "}
              <span className="font-medium text-foreground">من اخترتَه</span> لا صورةً مجمّدة
              من بياناته، فتصحيحُ لوحةٍ كُتبت خطأً يظهر له في الحال.
            </p>
          </Scenario>

          {/* ─ الحجب والإيقاف ─────────────────────────────────────── */}
          <Scenario tone="warn" question="توقفت العروض عني فجأة — لماذا؟">
            <p>أربعة أسباب، ولكلٍّ منها علامةٌ ظاهرة في البوابة:</p>
            <ul className="list-disc space-y-1.5 ps-5">
              <li>
                <span className="font-medium text-foreground">انقضت مهلة قبول الاتفاقية</span>{" "}
                — تقرأ ذلك في{" "}
                <Link href="/portal/agreement" className="text-primary underline underline-offset-4">
                  صفحة الاتفاقية
                </Link>
                ، وتعود العروض <span className="font-medium">فور قبولك</span>. ورحلاتك السابقة
                ومستحقاتك عنها لا يمسّها هذا إطلاقاً.
              </li>
              <li>
                <span className="font-medium text-foreground">بلغتَ حدّ المديونية</span> —
                بطاقة حسابك في لوحة المتعهد تقول ذلك، ومعها المبلغ الذي يكفي سداده لرفع الحجب.
              </li>
              <li>
                <span className="font-medium text-foreground">أوقفتَ الاستقبال بنفسك</span> —
                مفتاح «أستقبل طلبات الرحلات» في قنوات التنبيه.
              </li>
              <li>
                <span className="font-medium text-foreground">أُوقف حسابك</span> — تقرأ ذلك على
                شاشة مستقلّة عند الدخول، ورحلاتك المقبولة سابقاً ورصيدك يبقيان مرئيّين لك.
              </li>
            </ul>
          </Scenario>

          <Scenario question="أريد التوقف مؤقتاً عن استقبال الطلبات (سفر · صيانة)">
            <p>
              استعمل مفتاح{" "}
              <span className="font-medium text-foreground">«أستقبل طلبات الرحلات»</span> في{" "}
              <Link href="/portal/profile#channels" className="text-primary underline underline-offset-4">
                قنوات التنبيه
              </Link>
              ، ولا تُطفئ قنواتك.
            </p>
            <p>
              الفرق مهم: إطفاء المفتاح إعلانٌ صريح بأنك متوقف، وتُعيده بضغطة فيعود الوصول
              فوراً. أما إطفاء القنوات فيجعلك{" "}
              <span className="font-medium text-foreground">«غير متصل»</span> — يتخطّاك
              التوزيع بصمت، ولن ينفعك فتحُ صندوق التنبيهات كل ساعة لأنه سجلٌّ لا قناة.
            </p>
          </Scenario>

          <Scenario question="نُشرت نسخة جديدة من الاتفاقية — هل يتوقف عملي؟">
            <p>
              لا فوراً. يُخطَرك النظام في بوابتك وتُعطى{" "}
              <span className="font-medium text-foreground">مهلةً معلنة بتاريخها</span> تقرأ
              فيها النسخة وتقبلها، والعروض تصلك كالمعتاد خلالها. وبانقضائها بلا قبول تتوقف
              العروض حتى تقبل — ولا يُعدّ ذلك إنهاءً للاتفاقية.
            </p>
            {doc ? (
              <p className="rounded-lg bg-muted/60 p-3 text-foreground">
                <span className="font-semibold">وحالتك أنت الآن:</span>{" "}
                {doc.accepted ? (
                  <>
                    قَبِلت الإصدار {countLabel(doc.acceptedVersion ?? doc.version)} في{" "}
                    {dateLabel(doc.acceptedAt)} — لا شيء مطلوب منك.
                  </>
                ) : !doc.required ? (
                  <>
                    الإصدار {countLabel(doc.version)} منشور ولم يُفعَّل اشتراطه بعد — اقرأه
                    الآن، فقبولُه سيصير شرطاً.
                  </>
                ) : doc.inGrace ? (
                  <>
                    لم تقبل الإصدار {countLabel(doc.version)} بعد، ومهلتك تنتهي في{" "}
                    <span className="font-semibold">{dateLabel(doc.deadline)}</span>.
                  </>
                ) : (
                  <>
                    انقضت مهلة قبولك للإصدار {countLabel(doc.version)}، والعروض متوقفة عنك
                    الآن — وتعود فور قبولك.
                  </>
                )}{" "}
                <Link href="/portal/agreement" className="text-primary underline underline-offset-4">
                  افتح الاتفاقية
                </Link>
                .
              </p>
            ) : null}
            <p>
              وكلُّ نسخةٍ قَبِلتها تبقى محفوظةً بنصّها، والاحتجاج عليك يكون{" "}
              <span className="font-medium text-foreground">بالنسخة التي كانت مقبولةً منك وقت
              الواقعة</span> لا بنسخةٍ لاحقة.
            </p>
          </Scenario>
        </div>
      </Section>

      {/* ============================================================ */}
      {/* ٣) جدول المهل — كل رقم بمصدره                                 */}
      {/* ============================================================ */}
      <Section icon={<Clock className="size-4" />} title="المهل والأرقام — كما هي الآن">
        <Card className="p-5">
          <p className="pb-3 text-sm leading-relaxed text-muted-foreground">
            هذه القيم <span className="font-medium text-foreground">تُقرأ لحظة فتحك
            الصفحة</span> من إعدادات المنصة نفسها، لا من نصٍّ مكتوب. فإن غيّرتها الإدارة تغيّر
            هذا الجدول معها.
          </p>

          {closure.state === "failed" ? (
            <Notice tone="warning" className="mb-3">
              <p>
                تعذّرت قراءة إعدادات إغلاق الرحلة الآن، فلا نعرض قيماً قد تكون قديمة. حدّث
                الصفحة.
              </p>
            </Notice>
          ) : null}

          <div className="overflow-x-auto">
            <table className="w-full min-w-md border-collapse text-sm">
              <thead>
                <tr className="border-b border-border text-xs text-muted-foreground">
                  <th scope="col" className="pb-2 pe-3 text-start font-medium">
                    البند
                  </th>
                  <th scope="col" className="pb-2 pe-3 text-start font-medium">
                    القيمة الآن
                  </th>
                  <th scope="col" className="pb-2 text-start font-medium">
                    من أين تُقرأ
                  </th>
                </tr>
              </thead>
              <tbody>
                <FactRow
                  label="مهلة الردّ على العرض"
                  value={<span className="text-muted-foreground">على بطاقة العرض</span>}
                  source="عدّادٌ يعدّ حتى الصفر على كل عرض — وهو المصدر الوحيد، فلا يُطبع لها رقمٌ ثابت هنا."
                />
                <FactRow
                  label="مهلة الاعتماد التلقائي لإعلان الإتمام"
                  value={hoursLabel(cfg?.completionApproveHours ?? null)}
                  source="إعدادات إغلاق الرحلة — وتُجمَّد في طلبك لحظة تقديمه، فتغييرها لا يمسّ ما سبق."
                />
                <FactRow
                  label="عتبة إعادة البثّ بعد الاعتذار"
                  value={hoursLabel(cfg?.apologyManualHours ?? null)}
                  source="إعدادات إغلاق الرحلة — بقيَ هذا القدر أو أكثر ⇐ موجة جديدة، وأقلُّ منه ⇐ إسناد يدوي."
                />
                <FactRow
                  label="خصم الاعتذار على مستوى المنصة"
                  value={
                    cfg?.apologyDeductionEnabled === true ? (
                      "مُشتعل"
                    ) : cfg?.apologyDeductionEnabled === false ? (
                      "مُطفأ"
                    ) : (
                      <span className="text-muted-foreground">تعذّرت قراءته</span>
                    )
                  }
                  source="إعدادات إغلاق الرحلة — ومع اشتعاله يبقى المبلغ مقترحاً لا يُقيَّد إلا بقرار إداري."
                />
                <FactRow
                  label="الحد الأدنى لنصّ الاعتراض"
                  value={<>{countLabel(10)} أحرف</>}
                  source="مفروضٌ في القاعدة نفسها — الاعتراض المبهم لا يمكن بحثه."
                />
                <FactRow
                  label="اعتراضاتك المفتوحة على الرحلة الواحدة"
                  value={<>{countLabel(1)}</>}
                  source="مفروضٌ في القاعدة — ويجوز فتح غيره بعد أن يُبتّ في الأول."
                />
                <FactRow
                  label="مهلة التظلّم على خصم"
                  value={<>{countLabel(14)} يوماً</>}
                  source="البند ٨ من الاتفاقية — التزامٌ تعاقديّ، والنظام لا يغلق زرّ الاعتراض بتاريخ."
                />
                <FactRow
                  label="ردّ المنصة على التظلّم"
                  value={<>{countLabel(7)} أيام عمل</>}
                  source="البند ٨ من الاتفاقية — التزامٌ تعاقديّ يُتابَع بالمراسلة."
                />
                <FactRow
                  label="مهلة قبول اتفاقيتك"
                  value={
                    doc === null ? (
                      <span className="text-muted-foreground">لا اتفاقية سارية</span>
                    ) : doc.accepted ? (
                      "قَبِلتها"
                    ) : doc.deadline ? (
                      dateLabel(doc.deadline)
                    ) : (
                      <span className="text-muted-foreground">لا مهلة تُقاس</span>
                    )
                  }
                  source="تاريخٌ محسوبٌ لحسابك أنت من لحظة نشر الإصدار أو إنشاء حسابك، أيّهما أحدث."
                />
                <FactRow
                  label="ظهور هاتف السائق للعميل"
                  value={<span className="text-muted-foreground">مدةٌ تحددها الإدارة</span>}
                  source="قبل موعد الالتقاء بمدة تضبطها الإدارة، ويختفي بعد الموعد باثنتي عشرة ساعة."
                />
              </tbody>
            </table>
          </div>
        </Card>
      </Section>

      {/* ============================================================ */}
      {/* ٤) حدود ما يُرى                                               */}
      {/* ============================================================ */}
      <Section icon={<Lock className="size-4" />} title="ما لا تراه أنت، وما لا يراه العميل">
        <div className="grid gap-3 lg:grid-cols-2">
          <Card className="gap-3 p-5">
            <div className="flex flex-wrap items-center gap-2">
              <ShieldCheck className="size-4 shrink-0 text-primary" aria-hidden="true" />
              <h4 className="font-heading text-sm font-bold">ما لا يصل بوابتك</h4>
              <Badge variant="outline" className="text-[11px] font-normal">
                محجوبٌ بالبنية لا بالعرض
              </Badge>
            </div>
            <ul className="list-disc space-y-1.5 ps-5 text-sm leading-relaxed text-muted-foreground">
              <li>السعر الذي دفعه العميل، وهامش المنصة عن رحلتك.</li>
              <li>تكلفة أي متعهد آخر أو قوائم أسعاره أو مناطق تغطيته.</li>
              <li>رقم حدّ المديونية — يصلك ما يعنيك: المبلغ الذي يرفع الحجب عنك.</li>
              <li>
                بيانات العميل <span className="font-medium">قبل</span> القبول: لا اسم ولا رقم
                ولا عنوان دقيق. وبعده يصلك ما يلزم للتنفيذ وحده.
              </li>
            </ul>
            <p className="text-xs leading-5 text-muted-foreground">
              وهذا ليس إخفاءً في الشاشة: هذه البيانات{" "}
              <span className="font-medium">لا تخرج إلى بوابتك أصلاً</span>، فلا تصلك بخطأٍ ولا
              بحيلة.
            </p>
          </Card>

          <Card className="gap-3 p-5">
            <div className="flex flex-wrap items-center gap-2">
              <Wallet className="size-4 shrink-0 text-primary" aria-hidden="true" />
              <h4 className="font-heading text-sm font-bold">ما لا يصل العميل عنك</h4>
            </div>
            <ul className="list-disc space-y-1.5 ps-5 text-sm leading-relaxed text-muted-foreground">
              <li>اسم شركتك، ومستحقك عن الرحلة.</li>
              <li>رقم رخصة سائقك وصورته وصورة رخصته ومستنداته.</li>
              <li>
                قبل الإسناد: لا يعرف من سينفّذ الرحلة أصلاً. وبعده يرى نوع المركبة ولونها
                ولوحتها واسم السائق — أي ما يلزمه ليعرف ما سيأتيه.
              </li>
            </ul>
            <p className="text-xs leading-5 text-muted-foreground">
              ولذلك اكتب اسم المركبة ولونها ولوحتها{" "}
              <span className="font-medium">كما يقرؤها راكبٌ واقفٌ في الشارع</span> — هي ما
              يميّز سيارتك من بعيد.
            </p>
          </Card>
        </div>
      </Section>

      {/* ============================================================ */}
      {/* ٥) اختصارات الشاشات                                           */}
      {/* ============================================================ */}
      <Section icon={<BookOpen className="size-4" />} title="أين تفعل ماذا">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {[
            {
              href: "/portal" as const,
              icon: Coins,
              title: "لوحة المتعهد",
              body: "حسابك، وما ينقص تجهيزك مقيساً على بياناتك أنت.",
            },
            {
              href: "/portal/requests" as const,
              icon: Inbox,
              title: "طلبات واردة",
              body: "العروض المفتوحة بمهلها ومستحقك عن كل منها.",
            },
            {
              href: "/portal/trips" as const,
              icon: CheckCircle2,
              title: "رحلاتي",
              body: "الطاقم، إعلان الإتمام، الاعتذار، الاعتراض، والخصومات.",
            },
            {
              href: "/portal/prices" as const,
              icon: ReceiptText,
              title: "قوائم أسعاري",
              body: "الكشوف والمسارات وحالة كلٍّ منها عند الإدارة.",
            },
            {
              href: "/portal/fleet" as const,
              icon: CarFront,
              title: "أسطولي",
              body: "المركبات وفئاتها — والفئة النشطة شرطُ وصول رحلتها.",
            },
            {
              href: "/portal/drivers" as const,
              icon: IdCard,
              title: "سائقيّ",
              body: "سجلّك أنت؛ منه تختار سائق كل رحلة بنقرتين.",
            },
            {
              href: "/portal/profile#channels" as const,
              icon: BellRing,
              title: "قنوات التنبيه",
              body: "أين يصلك العرض، ومفتاح إيقاف الاستقبال مؤقتاً — قسمٌ في «حسابي».",
            },
            {
              href: "/portal/inbox" as const,
              icon: Scale,
              title: "صندوق التنبيهات",
              body: "سجلُّ ما أُرسل إليك — مرجعٌ عند الخلاف، لا قناة تنبيه.",
            },
            {
              href: "/portal/agreement" as const,
              icon: FileText,
              title: "اتفاقية المتعهد",
              body: "النسخة السارية بنصّها، وحالتك أمامها.",
            },
          ].map((item) => {
            const Icon = item.icon;
            return (
              <Link
                key={item.href}
                href={item.href}
                className="flex gap-3 rounded-xl bg-card p-4 ring-1 ring-foreground/10 transition-colors hover:bg-muted"
              >
                <Icon className="size-5 shrink-0 text-primary" aria-hidden="true" />
                <span className="min-w-0">
                  <span className="block text-sm font-medium">{item.title}</span>
                  <span className="block pt-0.5 text-xs leading-5 text-muted-foreground">
                    {item.body}
                  </span>
                </span>
              </Link>
            );
          })}
        </div>
      </Section>

      {/* ============================================================ */}
      {/* ٦) حين تحتاج إنساناً                                          */}
      {/* ============================================================ */}
      <Section icon={<TriangleAlert className="size-4" />} title="متى تراسل الإدارة فوراً">
        <Card className="gap-4 p-5">
          <ul className="list-disc space-y-1.5 ps-5 text-sm leading-relaxed text-muted-foreground">
            <li>
              اضطررتَ للاعتذار عن رحلة قبلتَها ولم تجد زرّ الاعتذار — أو بقي على موعدها وقتٌ
              قصير.
            </li>
            <li>طرأ أثناء التنفيذ ما يمنع إتمام الرحلة أو يؤخّرها تأخّراً مؤثراً.</li>
            <li>أردتَ سحب إعلان إتمامٍ أرسلته، أو سحب قائمة أسعارٍ قيد المراجعة.</li>
            <li>
              وصلك ما ليس من حقّك أن تراه (سعر عميل · بيانات متعهد آخر) — أبلغ ولا تستعمله.
            </li>
            <li>تكرّرت رسالة عطلٍ في البوابة — انقلها كما تظهر لك بنصّها.</li>
          </ul>
          <div className="space-y-2">
            <p className="flex items-center gap-1.5 text-sm font-medium">
              قنوات التواصل
              <HelpTip>
                هذه القنوات تُضبط من لوحة الإدارة، فما تراه هنا هو المعتمَد الآن — ولا تراسل
                عليها إلا في شأن العمل.
              </HelpTip>
            </p>
            <ContactChannels
              contact={settings.contact}
              empty="لم تُضبط قنوات تواصل الإدارة بعد — راسلها على القناة التي وصلتك منها الدعوة."
            />
          </div>
        </Card>
      </Section>

      <p className="text-xs leading-5 text-muted-foreground">
        وما لم تجد جوابه هنا فاسأل الإدارة عنه — والسؤال الذي يتكرر يُضاف إلى هذه الصفحة.
      </p>

      <div className="flex flex-wrap gap-2">
        <Link href="/portal" className={cn(buttonVariants({ variant: "outline" }))}>
          العودة إلى لوحة المتعهد
        </Link>
      </div>
    </div>
  );
}
