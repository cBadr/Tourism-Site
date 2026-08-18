import type { ReactNode } from "react";
import Link from "next/link";
import { AlertTriangle, Info, Plus, Power, PowerOff, Timer, Trash2 } from "lucide-react";

import { toArabicDigits } from "@/components/booking/format";
import { SaveButton } from "@/components/admin/save-feedback";
import { HelpTip } from "@/components/shared/HelpTip";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { createServerSupabase } from "@/lib/supabase/server";
import { cn } from "@/lib/utils";
import {
  asNumber,
  asText,
  Banners,
  controlClass,
  FAILURE_ACTION_HINTS,
  FAILURE_ACTION_LABELS,
  pick,
} from "../orders/_components/booking-ui";
import {
  createReason,
  deleteReason,
  saveClosureSettings,
  saveReason,
  toggleReasonActive,
} from "./actions";

/**
 * أسباب فشل الرحلة — كتالوج ما يُختار حين لا تُنفَّذ رحلة (هجرة `0051`).
 *
 * **قرار المالك، لا اقتراح جلسة:** رحلةٌ خابت ليست «ملغاة» بل **«فاشلة»** —
 * حالةٌ سابعة **نهائية** لا تعود إلى طابور الإسناد؛ العميل يُردّ إليه ماله ويحجز
 * من جديد. ولكل سببٍ هنا **إجراءٌ مالي مقترح** مع المتعهد، والمدير يقبله أو
 * يتجاوزه بمبرر مكتوب من شاشة الطلب — **والمنفَّذ وحده هو ما يُخزَّن**.
 *
 * وثلاث حقائق تحكم كل نص في هذه الشاشة:
 *
 *  (أ) **التسمية والإجراء يُلقَطان في صفّ الرحلة الفاشلة لحظة وقوعها.** فإعادة
 *      التسمية هنا آمنة تماماً ولا تُعيد كتابة تقارير العام الماضي — نفس انضباط
 *      لقطة السعر في `create_booking` ولقطة عنوان الخدمة في `booking_extras`.
 *  (ب) **لا حذف لسببٍ استُعمل**: مفتاح `booking_failures.reason_id` أجنبي
 *      `on delete restrict`، فالقاعدة ترفض الحذف بنيوياً. والتعطيل هو المسار:
 *      يختفي السبب من نموذج الفشل ويبقى مرجعاً لما وقع عليه.
 *  (ج) **لا حساب مالي في هذا الملف**: الإجراء المقترح رمزٌ يُكتب ويُقرأ، ومن
 *      ينفّذه `mark_booking_failed` على `record_partner_adjustment` و
 *      `reverse_ledger_entry` في Postgres وحدها (‏D-05).
 *
 * والجدول **يخرج مبذوراً** بخلاف كتالوج الخدمات الإضافية: الستة المتفق عليها مع
 * المالك نصّاً، ومنها «العميل لم يحضر ⇒ دفع كامل» لأن المتعهد أدّى ما عليه. فلا
 * رقم مخترع هنا ولا سعرٌ يُخمَّن — قائمةُ حالاتٍ متفق عليها.
 *
 * ⚠ **وبلا شريط نبض عمداً**: سجل `PAGE_PULSE` وأقسام `pulse_stats` (‏0034/0035)
 * سبقت هجرة الفشل (‏0051) فلا قسم فيها للرحلات الفاشلة أصلاً — وهو **بند مؤجَّل
 * بوعي كـ`/admin/loyalty` و`/admin/logs` لا استثناء بقرار**، ومُحفِّزه أول هجرة
 * تضيف قسماً إحصائياً. ولا يُقاس هنا في TypeScript بحال.
 */

export const metadata = { title: "أسباب فشل الرحلة" };

const hasSupabaseEnv = () =>
  Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);

/** سقف عاقل: عدّادُ استعمالٍ لكتالوج من عشرات الصفوف، لا أرشيف المنصة */
const MAX_FAILURE_ROWS = 5000;

type FailureReason = {
  id: string;
  slug: string;
  label: string;
  defaultAction: string;
  active: boolean;
  sort: number;
  /** 0119 — نطاق السبب: `failure` · `apology` · `both` */
  appliesTo: string;
  /** ومن بادر: `platform` · `partner` · `any` */
  initiator: string;
  /** المبلغ المقترح للخصم — **مسقوفٌ دائماً بمستحق تلك الرحلة** عند التنفيذ */
  defaultDeduct: number | null;
};

/** مقابض الإغلاق — صفٌّ واحد في `trip_closure_settings` */
type ClosureSettings = {
  approveHours: number;
  manualHours: number;
  deductionEnabled: boolean;
  ready: boolean;
};

const CLOSURE_FALLBACK: ClosureSettings = {
  approveHours: 24,
  manualHours: 6,
  deductionEnabled: false,
  ready: false,
};

/** نطاقُ السبب كما يُقرأ ويُختار */
const SCOPE_LABELS: Record<string, string> = {
  failure: "فشل رحلة",
  apology: "اعتذار متعهد",
  both: "كلاهما",
};

const INITIATOR_LABELS: Record<string, string> = {
  platform: "المنصة أو العميل",
  partner: "المتعهد",
  any: "غير محدَّد",
};

/* ------------------------------------------------------------------ */
/* الخصم يدويٌّ بقرارٍ — لا فجوةٌ تُسدّ  (هجرة 0130)                    */
/* ------------------------------------------------------------------ */

/**
 * سببٌ إجراؤه **خصم** ولا `default_deduct_amount` له.
 *
 * ── ولماذا لم يعد هذا تحذيراً ────────────────────────────────────────────
 *
 * كانت هذه الشاشة تحذّر من «سببٍ يخصم بلا مبلغ» بوصفه فجوةً تُسدّ. **وقرّر بدر
 * (2026-08-18)**: «اتركها بلا مبلغ ويكون الخصم يدوياً في كل مرة» — فالفراغُ
 * صار **قراراً منفَّذاً** لا نقصاً، وتحذيرٌ عليه يرنّ في كل بطاقةٍ ودائماً هو
 * بالضبط الإنذار الذي لا يُسمع (‏`LESSONS` §١-٣).
 *
 * وهجرة `0130` جعلت القرار قابلاً للتنفيذ بدل أن يبقى عُرفاً:
 *
 * | ما يقع اليوم | أين يُفرض |
 * |---|---|
 * | لا خصمَ بلا **مبلغٍ صريحٍ موجب** يكتبه المدير في كل واقعة | `mark_booking_failed` · `apply_withdrawal_deduction` |
 * | ولا خصمَ بلا **مبرَّرٍ مكتوب** يبلغ عشرة أحرف بعد طيّ المسافات | الدالتان **ومُشغّلا الصفَّين** — حارسان مستقلان |
 * | والمبرَّرُ يُخزَّن في صفّ الواقعة، ويدخل سجلَّ التدقيق، **ويظهر للمتعهد في بوابته** | `portal_deductions()` |
 *
 * وسنَدُه البند ٨ من اتفاقية المتعهد المنشورة: «ولا تُقبل المخالفة إلا بمبرر
 * مكتوب يُثبَّت في السجل ويُتاح للمتعهد» — وبلا قيمةٍ افتراضية **كلُّ خصمٍ
 * مخالفة**، فالمبرر واجبٌ في كل مرة.
 *
 * ⚠ **ولا رقم يُبذَر هنا ولا يُخترع**: القيمة قرارُ المالك وحده — وله أن يكتب
 * مبلغاً افتراضياً لسببٍ بعينه متى شاء، فيصير اقتراحاً يُملأ به الحقل، ويبقى
 * المبرَّرُ المكتوب واجباً على أي حال.
 */
function deductWithoutAmount(reason: FailureReason): boolean {
  return (
    reason.defaultAction === "deduct" &&
    (reason.defaultDeduct === null || reason.defaultDeduct <= 0)
  );
}

/** هل يقع هذا السبب في مسار اعتذار المتعهد؟ */
const inApologyPath = (reason: FailureReason) =>
  reason.appliesTo === "apology" || reason.appliesTo === "both";

/**
 * بيانُ السياسة في بطاقة السبب — **خبرٌ لا إنذار**، ولذلك بلونٍ محايد لا كهرماني.
 *
 * وظيفتُه أن يقول لمن يفتح البطاقة ويرى حقلاً فارغاً: هذا مقصود، وهذا ما يقع
 * بالضبط عند الخصم. وكلُّ جملةٍ فيه ادعاءُ إنفاذٍ **قابلٌ للفتح والتحقق** —
 * فلا تَعِد الشاشةُ بما لا تنفّذه القاعدة (النمط ٢ في `LESSONS`).
 */
function ManualDeductNotice({ reason }: { reason: FailureReason }) {
  return (
    <div className="flex items-start gap-2 rounded-lg border border-border bg-muted/40 p-3 text-sm leading-relaxed text-muted-foreground">
      <Info className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
      <div className="space-y-1.5">
        <p>
          <span className="font-semibold text-foreground">
            بلا مبلغ افتراضي — والخصم يدويٌّ في كل واقعة.
          </span>{" "}
          هذا قرارٌ لا نقص: لا يُقترح رقمٌ سلفاً، ويكتب المدير المبلغ بيده وقت الواقعة.
        </p>
        <p>
          <span className="font-semibold text-foreground">ومعه مبرَّرٌ مكتوب إلزامي</span> لا
          يقلّ عن عشرة أحرف — قاعدة البيانات ترفض الخصم بدونه، ويُخزَّن في سجل الواقعة،{" "}
          <span className="font-semibold text-foreground">ويظهر للمتعهد في بوابته</span> كما
          يشترط البند ٨ من اتفاقيته.
        </p>
        {inApologyPath(reason) && (
          <p>
            وفي اعتذار المتعهد لا يُقترح خصمٌ ولا يقع تلقائياً: يُسجَّل الاعتذار، وتنفيذُ
            الخصم قرارٌ إداريّ لاحق خلف مفتاحٍ مطفأ اليوم.
          </p>
        )}
      </div>
    </div>
  );
}

/**
 * قراءة الكتالوج + عدّاد استعمال كل سبب.
 *
 * `ready` تعني: البيئة مضبوطة والجدول موجود فعلاً (هجرة `0051` منفَّذة). وقبلها
 * تُعرض الشاشة للمعاينة معطَّلة بالكامل — لا نموذج يُرسَل إلى جدول غير موجود.
 *
 * والعدّاد **يفسّر ولا يقرّر**: يقول للمالك قبل الضغط لماذا سيُرفض الحذف، ثم
 * القاعدة هي التي ترفضه (‏`23503`). ولذلك `usageReady` منفصلة: تعذُّر قراءته
 * يُبقي زرّ الحذف كما هو ويترك الحكم لمن يملكه.
 */
async function loadReasons(): Promise<{
  reasons: FailureReason[];
  usage: Map<string, number>;
  ready: boolean;
  usageReady: boolean;
}> {
  const blank = {
    reasons: [] as FailureReason[],
    usage: new Map<string, number>(),
    ready: false,
    usageReady: false,
  };

  const supabase = await createServerSupabase();
  if (!supabase) return blank;

  const [reasonsRes, usageRes] = await Promise.all([
    supabase
      .from("failure_reasons")
      .select("*")
      .order("sort", { ascending: true })
      .order("label", { ascending: true }),
    // عدٌّ لا تجميع: صفٌّ واحد لكل رحلة فاشلة، والمعرّف وحده يُقرأ. ولا استعلام
    // `group by` في PostgREST بلا عرضٍ أو دالة — وهذا الملف لا يملك SQL.
    supabase.from("booking_failures").select("reason_id").limit(MAX_FAILURE_ROWS),
  ]);

  if (reasonsRes.error) return blank;

  const reasons = ((reasonsRes.data ?? []) as Record<string, unknown>[]).map((row, index) => ({
    id: asText(row.id) ?? `reason-${index}`,
    slug: asText(row.slug) ?? "",
    label: asText(row.label) ?? "",
    defaultAction: asText(pick(row, ["default_action", "defaultAction"])) ?? "none",
    active: row.active === true,
    sort: asNumber(pick(row, ["sort"])) ?? 0,
    // قاعدةٌ لم تصلها 0119 لا تُرجع الأعمدة ⇒ الافتراض «فشل · غير محدَّد»،
    // وهو بعينه ما بذرته الهجرة للصفوف الستّ القديمة، فلا تقفز الشاشة
    appliesTo: asText(pick(row, ["applies_to", "appliesTo"])) ?? "failure",
    initiator: asText(pick(row, ["initiator"])) ?? "any",
    defaultDeduct: asNumber(pick(row, ["default_deduct_amount", "defaultDeductAmount"])),
  }));

  const usage = new Map<string, number>();
  if (!usageRes.error) {
    for (const row of (usageRes.data ?? []) as Record<string, unknown>[]) {
      const id = asText(pick(row, ["reason_id"]));
      if (id) usage.set(id, (usage.get(id) ?? 0) + 1);
    }
  }

  return { reasons, usage, ready: true, usageReady: !usageRes.error };
}

/**
 * مقابض الإغلاق. و`ready = false` تعني «هجرة 0119 لم تصل» لا «القيم صفر»: الشاشة
 * تعرض حينها الافتراضات معطَّلةً وتقول أي هجرة ينقصها — لا حقولاً تُحفظ في العدم.
 */
async function loadClosure(): Promise<ClosureSettings> {
  const supabase = await createServerSupabase();
  if (!supabase) return CLOSURE_FALLBACK;

  const res = await supabase
    .from("trip_closure_settings")
    .select("completion_approve_hours, apology_manual_hours, apology_deduction_enabled")
    .limit(1)
    .maybeSingle();

  if (res.error || !res.data) return CLOSURE_FALLBACK;
  const row = res.data as Record<string, unknown>;
  return {
    approveHours: asNumber(pick(row, ["completion_approve_hours"])) ?? 24,
    manualHours: asNumber(pick(row, ["apology_manual_hours"])) ?? 6,
    deductionEnabled: pick(row, ["apology_deduction_enabled"]) === true,
    ready: true,
  };
}

const ERROR_MESSAGES: Record<string, string> = {
  env: "قاعدة البيانات غير مربوطة — لا يمكن الحفظ بعد.",
  notready:
    "جدول أسباب الفشل غير موجود — نفِّذ هجرة 0051 من supabase/migrations ثم أعد تحميل الصفحة. لم يُحفظ شيء.",
  label:
    "تسمية السبب حقل إلزامي بين حرفين و١٦٠ حرفاً — وهي ما يقرؤه المدير في نموذج الفشل وما يُلقَط في سجل كل رحلة تفشل بهذا السبب.",
  slug: "المعرّف غير صالح — حروف لاتينية صغيرة وأرقام تفصلها شرطات، وطوله بين حرفين و٦٤ (مثال: driver-no-show).",
  action:
    "اختر الإجراء المالي المقترح — لا شيء، أو دفع كامل المستحق، أو خصم. وسببٌ بلا إجراء ترفضه قاعدة البيانات نفسها.",
  sort: "ترتيب العرض يجب أن يكون عدداً صحيحاً غير سالب.",
  scope:
    "اختر نطاق السبب — هل يصلح لتعليم رحلة فاشلة، أم لاعتذار متعهد عن رحلة قبِلها، أم لكليهما؟ والقائمة واحدة بنطاق لا قائمتان.",
  initiator: "اختر من بادر — المنصة أو العميل، أم المتعهد، أم غير محدَّد.",
  payinitiator:
    "«دفع كامل المستحق» لا معنى له حين يكون المبادِر هو المتعهد نفسه: من انسحب بإرادته لا يُدفع له كاملاً. وقاعدة البيانات ترفض هذا الجمع بقيدٍ في الجدول لا بشرطٍ في هذه الشاشة. غيِّر الإجراء، أو غيِّر المبادِر.",
  deductunused:
    "كتبت مبلغاً مقترحاً مع إجراء ليس خصماً — رقمٌ لا يقرؤه أحد. امسح المبلغ، أو اجعل الإجراء «خصم».",
  deductrange:
    "المبلغ المقترح يجب أن يكون موجباً وفي حدود المليون. (والسقف الحقيقي عند التنفيذ هو مستحق تلك الرحلة نفسها لا هذا الرقم.)",
  approvehours:
    "مهلة الاعتماد التلقائي بالساعات بين ١ و٣٣٦ (أسبوعان). وهي المدة التي يُعتمد بعدها إعلانُ المتعهد تلقائياً إن لم تصدر الإدارة قراراً.",
  manualhours:
    "عتبة الاعتذار بالساعات بين ٠ و١٦٨. والصفر يعني «ابثَّ الرحلة دائماً مهما قرب الموعد».",
  exists: "يوجد سبب بهذا المعرّف بالفعل — اختر معرّفاً آخر.",
  inuse:
    "لا يمكن حذف سببٍ وقعت عليه رحلة فاشلة — قاعدة البيانات رفضت الحذف حمايةً لتقارير الماضي: سجلّ تلك الرحلات يشير إلى هذا الصف. عطّله بدل حذفه: يختفي من نموذج الفشل فوراً ويبقى سجلّ ما وقع عليه سليماً.",
  limits:
    "رفضت قاعدة البيانات القيمة — الإجراء واحد من ثلاثة (none · pay · deduct) والتسمية بين حرفين و١٦٠. لم يُحفظ شيء.",
  missing: "لم يعد هذا السبب موجوداً — أعد تحميل الصفحة لترى القائمة الحقيقية.",
  save: "فشلت العملية — تأكد أنك مسجل الدخول بحساب دوره admin (راجع supabase/README.md، فخ الصفوف الصفرية).",
};

/**
 * مجموعتا العرض. و«كلاهما» يظهر في الاثنتين عمداً — لأنه كذلك في القاعدة،
 * وإخفاؤه من إحداهما يجعل المالك يظن المجموعة ناقصة فيضيف نظيراً مكرراً.
 */
const SCOPE_GROUPS = [
  {
    key: "failure",
    title: "أسباب فشل الرحلة",
    hint: "يختارها المدير من شاشة الطلب حين لا تُنفَّذ رحلة — بعد أن صار لها منفِّذ.",
  },
  {
    key: "apology",
    title: "أسباب اعتذار المتعهد",
    hint: "يختارها الشريك من بورتاله حين يعتذر عن رحلة قَبِلها. وما مُبادِرُه «المنصة» لا يظهر له.",
  },
] as const;

/** نص «؟» المعرّف — مكتوب مرة ويُقرأ في بطاقة السبب وفي نموذج الإضافة معاً */
const SLUG_HELP = (
  <>
    المعرّف الثابت الذي ترسله شاشة الطلب إلى قاعدة البيانات لتعرف أي سبب اخترت.
    <strong className="font-semibold">
      {" "}
      تغيير التسمية آمن تماماً، وتغيير المعرّف ليس كذلك:
    </strong>{" "}
    كل رحلة فاشلة تحتفظ بنسخة المعرّف والتسمية لحظة وقوعها. لذلك لا يمكن تعديله بعد
    الإنشاء — من احتاج معرّفاً آخر فليعطّل السبب ويُنشئ غيره.
  </>
);

const ACTION_HELP = (
  <>
    ما <span className="font-semibold">يُقترح</span> على المدير حين يختار هذا السبب — لا ما
    يُنفَّذ حتماً: يقبله بضغطة أو يتجاوزه إلى غيره{" "}
    <span className="font-semibold">بمبرر مكتوب</span>، والمنفَّذ وحده هو ما يُخزَّن في
    سجل تلك الرحلة.
    <br />
    <span className="font-semibold">{FAILURE_ACTION_LABELS.none}:</span>{" "}
    {FAILURE_ACTION_HINTS.none}
    <br />
    <span className="font-semibold">{FAILURE_ACTION_LABELS.pay}:</span>{" "}
    {FAILURE_ACTION_HINTS.pay}
    <br />
    <span className="font-semibold">{FAILURE_ACTION_LABELS.deduct}:</span>{" "}
    {FAILURE_ACTION_HINTS.deduct}
    <br />
    <span className="font-semibold">وتغييره لا يمسّ الماضي:</span> الرحلات التي فشلت بهذا
    السبب تحتفظ بالإجراء الذي كان مقترحاً يومها وبالذي نُفِّذ فعلاً.
  </>
);


/**
 * نطاقُ السبب ومُبادِرُه — **قائمةٌ واحدة بنطاق لا قائمتان** (قرار المالك).
 *
 * ولماذا حقلان لا حقل؟ لأنهما سؤالان مختلفان: «أين يُعرض هذا السبب؟» و«من
 * تسبَّب؟». والثاني هو ما يجعل «ادفع كاملاً» مقبولةً أو مرفوضة — فمن انسحب
 * بإرادته لا يُدفع له كاملاً، وقاعدة البيانات ترفض الجمع بقيدِ جدول
 * (`failure_reasons_pay_initiator_chk`) لا بشرطٍ في هذه الشاشة.
 */
const SCOPE_HELP = (
  <>
    أين يظهر هذا السبب؟
    <br />
    <span className="font-semibold">فشل رحلة:</span> في نموذج تعليم الرحلة فاشلة على شاشة الطلب
    — لرحلةٍ لم تُنفَّذ.
    <br />
    <span className="font-semibold">اعتذار متعهد:</span> في بورتال المتعهد حين يعتذر عن رحلةٍ
    قَبِلها ثم تعذّر عليه تنفيذها.
    <br />
    <span className="font-semibold">كلاهما:</span> يظهر في الموضعين — كعطل المركبة، فهو قبل
    الموعد اعتذار وبعده فشل.
  </>
);

const INITIATOR_HELP = (
  <>
    من تسبَّب في ألّا تُنفَّذ الرحلة؟ وهو ما يجعل الإجراء المالي منطقياً أو متناقضاً.
    <br />
    <span className="font-semibold">المتعهد:</span> عندها لا يظهر السبب لغيره، و«دفع كامل
    المستحق» <span className="font-semibold">ترفضه قاعدة البيانات</span> — من انسحب بإرادته لا
    يُدفع له كاملاً.
    <br />
    <span className="font-semibold">المنصة أو العميل:</span> السبب من جهتنا (سحبُ إسناد، أو
    عميل لم يحضر)، فالدفع الكامل مشروع — و
    <span className="font-semibold">لا يختاره المتعهد من بورتاله</span>.
    <br />
    <span className="font-semibold">غير محدَّد:</span> لا ذنبَ لطرف (ظرف قاهر) — والصفر هنا هو
    الصواب، وإلا كذب المتعهدون في السبب ففقدت البيانات معناها.
  </>
);

const DEDUCT_HELP = (
  <>
    مبلغٌ <span className="font-semibold">مقترح</span> يُملأ به حقل الخصم تلقائياً — لا مبلغٌ
    يُخصم من تلقائه.
    <br />
    🔒 <span className="font-semibold">ومسقوفٌ دائماً بمستحق تلك الرحلة نفسها:</span> إن كان
    مستحق الرحلة أقل من هذا الرقم فالمنفَّذ هو المستحق. وقرار المالك صريح — لا يصير المتعهد
    مديناً بمالٍ لم يقبضه، ولا تُلاحَق عنده ديون.
    <br />
    <span className="font-semibold">وتركُه فارغاً هو الوضع المقرَّر اليوم:</span> عندها لا
    يُقترح رقم، ويكتب المدير المبلغ بيده في كل واقعة — وقاعدة البيانات ترفض الخصم بلا مبلغٍ
    صريحٍ موجب. أي أن الفراغ <span className="font-semibold">لا يعني خصمَ صفر</span>، بل يعني
    «اسألني في كل مرة».
    <br />
    🔴 <span className="font-semibold">وفي كل الأحوال: مبرَّرٌ مكتوب إلزامي</span> لا يقلّ عن
    عشرة أحرف مع أي خصم — يُخزَّن في سجل الواقعة، ويدخل سجل التدقيق،{" "}
    <span className="font-semibold">ويظهر للمتعهد في بوابته</span>. وسندُه البند ٨ من اتفاقيته:
    الخصمُ الذي يخالف قيمةً افتراضية لا يُقبل بلا مبرر مكتوب — وبلا قيمةٍ افتراضية فكلُّ خصمٍ
    مخالفة.
  </>
);

function ScopeFields({
  idPrefix,
  namePrefix,
  scope,
  initiator,
  deduct,
  disabled,
}: {
  idPrefix: string;
  namePrefix: string;
  scope: string;
  initiator: string;
  deduct: number | null;
  disabled?: boolean;
}) {
  return (
    <div className="grid gap-4 sm:grid-cols-3">
      <div className="space-y-1.5">
        <Label htmlFor={`${idPrefix}-scope`} className="flex items-center gap-1.5">
          نطاق السبب
          <HelpTip>{SCOPE_HELP}</HelpTip>
        </Label>
        <select
          id={`${idPrefix}-scope`}
          name={`${namePrefix}applies_to`}
          defaultValue={scope}
          disabled={disabled}
          className={controlClass}
        >
          <option value="failure">{SCOPE_LABELS.failure}</option>
          <option value="apology">{SCOPE_LABELS.apology}</option>
          <option value="both">{SCOPE_LABELS.both}</option>
        </select>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor={`${idPrefix}-initiator`} className="flex items-center gap-1.5">
          من بادر
          <HelpTip>{INITIATOR_HELP}</HelpTip>
        </Label>
        <select
          id={`${idPrefix}-initiator`}
          name={`${namePrefix}initiator`}
          defaultValue={initiator}
          disabled={disabled}
          className={controlClass}
        >
          <option value="any">{INITIATOR_LABELS.any}</option>
          <option value="partner">{INITIATOR_LABELS.partner}</option>
          <option value="platform">{INITIATOR_LABELS.platform}</option>
        </select>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor={`${idPrefix}-deduct`} className="flex items-center gap-1.5">
          الخصم المقترح
          <HelpTip>{DEDUCT_HELP}</HelpTip>
        </Label>
        <Input
          id={`${idPrefix}-deduct`}
          name={`${namePrefix}default_deduct_amount`}
          type="number"
          inputMode="decimal"
          dir="ltr"
          step="1"
          min={0}
          placeholder="اتركه فارغاً"
          defaultValue={deduct !== null && deduct > 0 ? deduct : ""}
          disabled={disabled}
        />
      </div>
    </div>
  );
}


/* ------------------------------------------------------------------ */
/* مقابض الإغلاق — ثلاثة أرقامٍ تحكم متى يتحرك المال (0119)             */
/* ------------------------------------------------------------------ */

/**
 * لماذا هذه البطاقة **على رأس هذه الشاشة** لا في «إعدادات الرحلات»؟
 *
 * لأن قارئها واحد: من يضبط أسباب الاعتذار هو من يقرّر متى يُعتمد الإتمام تلقائياً
 * ومتى يذهب الاعتذارُ إلى الإسناد اليدوي. وثلاثةُ أرقامٍ في شاشةٍ أخرى تعني أن
 * يقرأ المالك نصفَ السياسة هنا ونصفَها هناك، فلا يرى أثر تغييره على ما أمامه.
 */
function ClosureCard({
  closure,
  readOnly,
}: {
  closure: ClosureSettings;
  readOnly: boolean;
}) {
  return (
    <form action={readOnly ? undefined : saveClosureSettings}>
      <Card className="space-y-4 p-5">
        <div>
          <h3 className="flex items-center gap-1.5 font-heading text-base font-bold">
            <Timer className="size-4 text-primary" />
            متى تُغلَق الرحلة، ومتى يتحرك المال
            <HelpTip>
              الاكتمال يحرّك دفترك في اللحظة نفسها: يُقيَّد مستحق المتعهد وتُسكّ نقاط
              العميل. لذلك لا يُتمّ المتعهد رحلته بنفسه — <span className="font-semibold">يُعلن</span>{" "}
              فتعتمد الإدارة، أو يُعتمد تلقائياً بعد المهلة أدناه ويُسجَّل الفاعل «النظام» في
              السجل لا فراغاً.
            </HelpTip>
          </h3>
          <p className="text-sm text-muted-foreground">
            ثلاثة مقابض تقرأها قاعدة البيانات مباشرة — لا أرقام مكتوبة في الكود.
          </p>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="approve-hours" className="flex items-center gap-1.5">
              مهلة الاعتماد التلقائي (بالساعات)
              <HelpTip>
                إن لم تصدر الإدارة قراراً على إعلان المتعهد خلال هذه المدة، يُعتمد الإتمام
                تلقائياً ويتحرك الدفتر. والمهلة{" "}
                <span className="font-semibold">تُجمَّد لحظة وصول كل إعلان</span>: تغييرك لها
                اليوم يسري على القادم وحده، ولا يُقدّم اعتماد إعلانٍ قائم ولا يؤخّره.
              </HelpTip>
            </Label>
            <Input
              id="approve-hours"
              name="completion_approve_hours"
              type="number"
              inputMode="numeric"
              dir="ltr"
              step="1"
              min={1}
              max={336}
              defaultValue={closure.approveHours}
              disabled={readOnly}
              required
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="manual-hours" className="flex items-center gap-1.5">
              عتبة الاعتذار (بالساعات قبل الانطلاق)
              <HelpTip>
                حين يعتذر متعهد عن رحلة قَبِلها: إن بقي على الانطلاق{" "}
                <span className="font-semibold">هذا القدر أو أكثر</span> تنطلق موجة عرضٍ جديدة
                تلقائياً على متعهدين آخرين؛ وإن كان أقل ذهبت الرحلة إلى الإسناد اليدوي ونُبِّه
                فريق التشغيل. والافتراض ست ساعات — ثلاثة أضعاف أقل مهلة حجز، فتتّسع لموجة
                كاملة، وقصيرة بما يكفي ألّا تستيقظ على رحلة بلا منفِّذ.
              </HelpTip>
            </Label>
            <Input
              id="manual-hours"
              name="apology_manual_hours"
              type="number"
              inputMode="numeric"
              dir="ltr"
              step="1"
              min={0}
              max={168}
              defaultValue={closure.manualHours}
              disabled={readOnly}
              required
            />
          </div>
        </div>

        <Label className="flex w-fit cursor-pointer items-start gap-2 text-sm font-normal">
          <input
            type="checkbox"
            name="apology_deduction_enabled"
            defaultChecked={closure.deductionEnabled}
            disabled={readOnly}
            className="mt-1 size-4 accent-primary"
          />
          <span>
            السماح بتنفيذ خصمٍ على الاعتذار
            <HelpTip>
              🔴 <span className="font-semibold">مطفأ بقرارك حتى الآن.</span> والاعتذار يعمل
              كاملاً وهو مطفأ: يُسجَّل السبب، ويُحسب المبلغ المقترح مسقوفاً بمستحق الرحلة،
              ويظهر لك في بطاقة الطلب — <span className="font-semibold">ولا يُكتب قيدٌ واحد
              في الدفتر</span>. وإشعاله وحده يفتح زرّ التنفيذ، ويبقى الخصم عندها قراراً
              إدارياً لكل واقعة بسبب مكتوب، وللمتعهد أن يتظلّم عليه. لا تشعله قبل أن يكون
              للخصم أساس في اتفاقية المتعهدين.
            </HelpTip>
          </span>
        </Label>

        <div className="flex justify-end">
          <SaveButton label="حفظ المقابض" disabled={readOnly} errorMessages={ERROR_MESSAGES} />
        </div>
      </Card>
    </form>
  );
}

function ActionSelect({
  id,
  name,
  defaultValue,
  disabled,
}: {
  id: string;
  name: string;
  defaultValue: string;
  disabled?: boolean;
}) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id} className="flex items-center gap-1.5">
        الإجراء المالي المقترح
        <HelpTip>{ACTION_HELP}</HelpTip>
      </Label>
      <select
        id={id}
        name={name}
        defaultValue={defaultValue}
        disabled={disabled}
        className={controlClass}
      >
        <option value="none">{FAILURE_ACTION_LABELS.none}</option>
        <option value="pay">{FAILURE_ACTION_LABELS.pay}</option>
        <option value="deduct">{FAILURE_ACTION_LABELS.deduct}</option>
      </select>
    </div>
  );
}

function TextField({
  id,
  label,
  name,
  defaultValue,
  placeholder,
  help,
  dir = "rtl",
  disabled,
  required,
  pattern,
  maxLength,
}: {
  id: string;
  label: string;
  name: string;
  defaultValue?: string | null;
  placeholder?: string;
  help?: ReactNode;
  dir?: "rtl" | "ltr";
  disabled?: boolean;
  required?: boolean;
  pattern?: string;
  maxLength?: number;
}) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id} className="flex items-center gap-1.5">
        {label}
        {help ? <HelpTip>{help}</HelpTip> : null}
      </Label>
      <Input
        id={id}
        name={name}
        dir={dir}
        defaultValue={defaultValue ?? ""}
        placeholder={placeholder}
        disabled={disabled}
        required={required}
        pattern={pattern}
        maxLength={maxLength}
      />
    </div>
  );
}

function ReasonCard({
  reason,
  usedCount,
  usageReady,
  readOnly,
  confirmingDelete,
}: {
  reason: FailureReason;
  usedCount: number;
  usageReady: boolean;
  readOnly: boolean;
  confirmingDelete: boolean;
}) {
  const f = (field: string) => `${reason.id}-${field}`;
  // «مستعمَل» بيقينٍ لا بظن: تعذُّر قراءة العدّاد ليس دليل عدم استعمال، فيُترك
  // الحذف معروضاً وتتولى القاعدة الرفض — لا تُحجب قدرةٌ بناءً على جهل.
  const inUse = usageReady && usedCount > 0;

  return (
    <Card className="space-y-4 p-5">
      <div className="flex flex-wrap items-center gap-2">
        <h3 className="font-heading text-base font-bold">{reason.label || "—"}</h3>
        <code dir="ltr" className="text-xs text-muted-foreground">
          {reason.slug}
        </code>
        <Badge variant={reason.active ? "default" : "secondary"}>
          {reason.active ? "مفعَّل" : "معطَّل"}
        </Badge>
        <Badge variant="outline" className="text-muted-foreground">
          {SCOPE_LABELS[reason.appliesTo] ?? reason.appliesTo}
        </Badge>
        {/*
          الشارة تحمل الخبر بلا لونِ إنذار: «يدويّ» وصفُ سياسةٍ قائمة لا نقصٌ
          يُسدّ — والكهرمانُ هنا كان يرنّ على عشرة أسبابٍ من عشرة، أي دائماً.
        */}
        <Badge variant="outline" className="text-muted-foreground">
          المقترح: {FAILURE_ACTION_LABELS[reason.defaultAction] ?? reason.defaultAction}
          {reason.defaultDeduct !== null && reason.defaultDeduct > 0
            ? ` ${toArabicDigits(reason.defaultDeduct)}`
            : deductWithoutAmount(reason)
              ? " — يدويّ بمبرَّر"
              : ""}
        </Badge>
        {reason.initiator !== "any" ? (
          <Badge variant="outline" className="text-muted-foreground">
            بمبادرة: {INITIATOR_LABELS[reason.initiator] ?? reason.initiator}
          </Badge>
        ) : null}
        {usageReady && (
          <span className="text-xs text-muted-foreground">
            {usedCount === 0
              ? "لم تفشل به رحلة بعد"
              : `وقعت عليه ${toArabicDigits(usedCount)} رحلة`}
          </span>
        )}
        <form
          action={readOnly ? undefined : toggleReasonActive.bind(null, reason.id)}
          className="ms-auto"
        >
          <Button
            type="submit"
            variant="ghost"
            size="sm"
            disabled={readOnly}
            title={
              reason.active
                ? "تعطيل السبب: يختفي من نموذج تعليم الرحلة فاشلة فوراً، والرحلات التي وقعت عليه تحتفظ به وبإجرائه"
                : "تفعيل السبب: يعود للظهور في نموذج تعليم الرحلة فاشلة"
            }
          >
            {reason.active ? <PowerOff /> : <Power />}
            {reason.active ? "تعطيل" : "تفعيل"}
          </Button>
        </form>
      </div>

      <form action={readOnly ? undefined : saveReason.bind(null, reason.id)} className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <TextField
            id={f("label")}
            label="التسمية"
            name="label"
            defaultValue={reason.label}
            disabled={readOnly}
            required
            maxLength={160}
            help="التسمية كما يقرؤها المدير في نموذج الفشل. تغييرها لا يمسّ الرحلات السابقة إطلاقاً: كل رحلة فاشلة تحتفظ بنسخة التسمية لحظة وقوعها، فتقارير الماضي لا تُعاد كتابتها بإعادة تسمية."
          />
          <div className="space-y-1.5">
            <Label className="flex items-center gap-1.5">
              المعرّف (Slug)
              <HelpTip>{SLUG_HELP}</HelpTip>
            </Label>
            <p
              dir="ltr"
              className="rounded-lg border border-dashed border-input bg-muted/40 px-2.5 py-1.5 font-mono text-sm text-muted-foreground"
            >
              {reason.slug}
            </p>
          </div>
        </div>

        <ScopeFields
          idPrefix={reason.id}
          namePrefix=""
          scope={reason.appliesTo}
          initiator={reason.initiator}
          deduct={reason.defaultDeduct}
          disabled={readOnly}
        />

        {deductWithoutAmount(reason) && <ManualDeductNotice reason={reason} />}

        <div className="grid gap-4 sm:grid-cols-2">
          <ActionSelect
            id={f("action")}
            name="default_action"
            defaultValue={reason.defaultAction}
            disabled={readOnly}
          />
          <div className="space-y-1.5">
            <Label htmlFor={f("sort")} className="flex items-center gap-1.5">
              ترتيب العرض
              <HelpTip>
                ترتيب ظهور السبب في نموذج الفشل — الأصغر أولاً، والمتساويان يُرتَّبان
                بالتسمية. اجعل الأشيع أولاً كي يقلّ البحث في لحظة تشغيل مزدحمة.
              </HelpTip>
            </Label>
            <Input
              id={f("sort")}
              name="sort"
              type="number"
              inputMode="numeric"
              dir="ltr"
              step="1"
              min={0}
              defaultValue={reason.sort}
              disabled={readOnly}
            />
          </div>
        </div>

        <Label className="flex w-fit cursor-pointer items-center gap-2 text-sm font-normal">
          <input
            type="checkbox"
            name="active"
            defaultChecked={reason.active}
            disabled={readOnly}
            className="size-4 accent-primary"
          />
          السبب معروض في نموذج الفشل
          <HelpTip>
            السبب المعطَّل يبقى ببياناته ويختفي من قائمة الأسباب، وقاعدة البيانات ترفض
            اختياره لرحلة جديدة. والرحلات التي وقعت عليه من قبل لا تتأثر إطلاقاً — لكلٍّ
            منها نسخته المجمَّدة من التسمية والإجراء.
          </HelpTip>
        </Label>

        <div className="flex flex-wrap items-center justify-end gap-3">
          {confirmingDelete ? null : inUse ? (
            <span className="text-xs text-muted-foreground">
              لا يُحذف: وقعت عليه {toArabicDigits(usedCount)} رحلة فاشلة — والتعطيل هو
              المسار.
            </span>
          ) : (
            <Link
              href={`/admin/failure-reasons?remove=${reason.id}`}
              className={cn(
                "inline-flex items-center gap-1.5 rounded-lg border border-red-300 px-3 py-1.5 text-sm text-red-700 transition-colors hover:bg-red-50 dark:border-red-800 dark:text-red-300 dark:hover:bg-red-950",
                readOnly && "pointer-events-none opacity-50"
              )}
            >
              <Trash2 className="size-4" />
              حذف
            </Link>
          )}
          <SaveButton label="حفظ السبب" disabled={readOnly} errorMessages={ERROR_MESSAGES} />
        </div>
      </form>

      {confirmingDelete && (
        <form
          action={readOnly ? undefined : deleteReason.bind(null, reason.id)}
          className="space-y-3 rounded-lg border border-red-300 bg-red-50 p-4 dark:border-red-700 dark:bg-red-950"
        >
          <p className="text-sm font-semibold text-red-900 dark:text-red-100">
            تأكيد حذف «{reason.label || reason.slug}»
          </p>
          <p className="text-sm leading-relaxed text-red-900/90 dark:text-red-100/90">
            الحذف نهائي ولا رجعة فيه. وإن كانت رحلةٌ واحدة قد فشلت بهذا السبب فقاعدة
            البيانات ترفض حذفه ويبقى كما هو — عندها{" "}
            <span className="font-semibold">التعطيل هو الخيار الصحيح</span>: يخفيه عن نموذج
            الفشل فوراً ويُبقي سجلّ تلك الرحلات مفهوماً.
          </p>
          <div className="flex flex-wrap items-center gap-3">
            <SaveButton
              label="تأكيد الحذف"
              icon={<Trash2 />}
              variant="destructive"
              savedLabel="تم الحذف"
              pendingLabel="جارٍ الحذف…"
              failedLabel="لم يُحذف"
              disabled={readOnly}
              errorMessages={ERROR_MESSAGES}
            />
            <Link
              href="/admin/failure-reasons"
              className="text-sm text-muted-foreground transition-colors hover:text-foreground hover:underline"
            >
              تراجع
            </Link>
          </div>
        </form>
      )}
    </Card>
  );
}

/**
 * الحالة الفارغة — **إنذارٌ لا ترحيب.**
 *
 * الهجرة تبذر ستة أسباب، فالقائمة الفارغة تعني أن المالك عطّلها أو حذفها كلها.
 * وأثرها تشغيلي فوري: `mark_booking_failed` ترفض الفشل بلا سبب من الكتالوج، أي
 * أن **لا رحلة تُعلَّم فاشلة** حتى يعود سببٌ مفعَّل.
 */
function EmptyState({ hasInactive }: { hasInactive: boolean }) {
  return (
    <Card className="space-y-3 border-amber-300 bg-amber-50 p-5 text-amber-900 dark:border-amber-700 dark:bg-amber-950 dark:text-amber-100">
      <h3 className="flex items-center gap-1.5 font-heading text-base font-bold">
        <AlertTriangle className="size-4" />
        {hasInactive ? "لا سبب مفعَّل في الكتالوج" : "الكتالوج فارغ"}
      </h3>
      <p className="text-sm leading-relaxed">
        ولا فشلَ بلا سبب مصنَّف: قاعدة البيانات ترفض تعليم أي رحلة فاشلة ما دام لا سبب
        مفعَّل يُختار.{" "}
        {hasInactive
          ? "أعد تفعيل ما يناسبك من الأسباب المعطَّلة أعلاه، أو أضف سبباً جديداً من النموذج أدناه."
          : "أضف أول سبب من النموذج أدناه."}
      </p>
    </Card>
  );
}

export default async function FailureReasonsPage({
  searchParams,
}: PageProps<"/admin/failure-reasons">) {
  const [params, { reasons, usage, ready, usageReady }, closure] = await Promise.all([
    searchParams,
    loadReasons(),
    loadClosure(),
  ]);

  const wired = hasSupabaseEnv();
  const savedCode = typeof params.saved === "string" ? params.saved : null;
  const error = typeof params.error === "string" ? params.error : null;
  const removing = typeof params.remove === "string" ? params.remove : null;
  const readOnly = !ready;
  const activeCount = reasons.filter((reason) => reason.active).length;

  // الأسبابُ المفعَّلة التي يقع خصمُها يدوياً — تُعدّ لبيان السياسة أعلى الشاشة،
  // لا لتحذيرٍ يُسدّ. والمعطَّلُ خارجها لأنه لا يُختار أصلاً.
  const manualDeductReasons = reasons.filter(
    (reason) => reason.active && deductWithoutAmount(reason)
  );

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="font-heading text-lg font-bold">أسباب فشل الرحلة</h2>
        <HelpTip>
          كل صف هنا سببٌ يختاره المدير حين <span className="font-semibold">لا تُنفَّذ</span>{" "}
          رحلة — وهي حالة <span className="font-semibold">«لم يتم التنفيذ» لا «تم الإلغاء»</span>: الإلغاء
          يقع قبل التنفيذ، والفشل بعد أن صار للرحلة منفِّذ. ولكل سبب إجراءٌ مالي مقترح مع
          المتعهد يقبله المدير أو يتجاوزه بمبرر. ووجود قائمة مصنَّفة — لا نصٍّ حر — هو ما
          يجعل سؤال «كم رحلة فشلت بذنب هذا المتعهد؟» سؤالاً له جواب.
        </HelpTip>
        <Link
          href="/admin/orders?status=failed"
          className="ms-auto text-sm text-primary transition-colors hover:underline"
        >
          الرحلات الفاشلة
        </Link>
      </div>

      <Banners
        wired={wired}
        readOnly={readOnly}
        saved={savedCode !== null}
        error={error}
        errorMessages={ERROR_MESSAGES}
        savedMessage={
          savedCode === "deleted"
            ? "حُذف السبب من الكتالوج — لم تقع عليه رحلة فاشلة واحدة، وإلا لرفضت قاعدة البيانات حذفه."
            : savedCode === "closure"
              ? "حُفظت مقابض الإغلاق. المهلة الجديدة تسري على الإعلانات القادمة وحدها — الإعلانُ القائم يحمل مهلته المجمَّدة لحظة وصوله، فلا يُقدَّم اعتمادُه ولا يؤخَّر."
              : "حُفظ السبب وانعكس على نموذجَي الفشل والاعتذار فوراً. والرحلات السابقة لم تتأثر: لكلٍّ منها نسختها المجمَّدة."
        }
        readOnlyTitle="كتالوج أسباب الفشل غير جاهز بعد"
        readOnlyBody={
          <p>
            قاعدة البيانات مربوطة لكن جدول <code dir="ltr">failure_reasons</code> غير موجود —
            نفِّذ هجرة <code dir="ltr">0051</code> من{" "}
            <code dir="ltr">supabase/migrations</code> ثم أعد تحميل الصفحة. المعروض الآن هيكل
            الشاشة معطَّلاً بالكامل.
          </p>
        }
      />

      {/*
        بيانُ السياسة — **أعلى الشاشة قبل أي بطاقة**، وبلونٍ محايد.

        كان هنا تحذيرٌ كهرمانيّ يعدّ «الأسباب التي تخصم بلا مبلغ». وقرّر بدر
        (2026-08-18) أن الفراغ مقصود والخصمُ يدويٌّ في كل مرة — فصار العدّادُ
        إنذاراً يرنّ على عشرةٍ من عشرة، أي دائماً، أي لا يُسمع (`LESSONS` §١-٣).
        وهذا البيان يقول ما يقع فعلاً، وكلُّ جملةٍ فيه تنفّذها هجرة `0130`.
      */}
      {ready && manualDeductReasons.length > 0 && (
        <Card className="space-y-2 p-5">
          <h3 className="flex items-center gap-1.5 font-heading text-base font-bold">
            <Info className="size-4 text-primary" aria-hidden="true" />
            الخصم يدويٌّ في كل واقعة — بمبلغٍ يُكتب بيدك ومبرَّرٍ مكتوب
          </h3>
          <p className="text-sm leading-relaxed text-muted-foreground">
            <span className="font-semibold text-foreground">
              {toArabicDigits(manualDeductReasons.length)}
            </span>{" "}
            من الأسباب المفعَّلة إجراؤها «خصم» بلا مبلغ افتراضي، وهذا{" "}
            <span className="font-semibold text-foreground">قرارٌ لا نقص</span>: لا رقمَ
            يُقترَح سلفاً، وقاعدة البيانات ترفض أي خصمٍ بلا{" "}
            <span className="font-semibold text-foreground">مبلغٍ صريحٍ موجب</span> تكتبه أنت
            وقت الواقعة.
          </p>
          <p className="text-sm leading-relaxed text-muted-foreground">
            🔴 <span className="font-semibold text-foreground">ومعه مبرَّرٌ مكتوب إلزامي</span>{" "}
            لا يقلّ عن عشرة أحرف — يُثبَّت في سجل الواقعة، ويدخل سجل التدقيق،{" "}
            <span className="font-semibold text-foreground">ويظهر للمتعهد في بوابته</span>. وهذا
            نصُّ البند ٨ من اتفاقية المتعهد المقبولة: لا تُقبل مخالفة القيمة الافتراضية إلا
            بمبرر مكتوب — وبلا قيمةٍ افتراضية فكلُّ خصمٍ مخالفة.
          </p>
          <p className="text-sm leading-relaxed text-muted-foreground">
            الأسباب:{" "}
            <span className="font-semibold text-foreground">
              {manualDeductReasons.map((reason) => reason.label || reason.slug).join(" · ")}
            </span>
            . ولك أن تكتب مبلغاً افتراضياً لأيٍّ منها متى شئت — يصير عندها اقتراحاً يُملأ به
            الحقل، ويبقى المبرَّرُ المكتوب واجباً على أي حال.
          </p>
        </Card>
      )}

      <ClosureCard closure={closure} readOnly={readOnly || !closure.ready} />

      {ready && activeCount === 0 && <EmptyState hasInactive={reasons.length > 0} />}

      {/*
        مجموعتان بعنوانٍ لكلٍّ منهما، لا قائمةٌ واحدة من عشر بطاقاتٍ متشابهة.
        والسبب عمليّ: من يفتح هذه الشاشة يفتحها لغرضٍ واحد — إمّا يضبط ما يختاره
        المدير عند الفشل، وإمّا ما يختاره الشريك عند الاعتذار. و«كلاهما» يظهر في
        المجموعتين لأنه كذلك فعلاً في القاعدة، ولا يُخفى من إحداهما فيُظنّ ناقصاً.
      */}
      {SCOPE_GROUPS.map((group) => {
        const rows = reasons.filter(
          (reason) => reason.appliesTo === group.key || reason.appliesTo === "both"
        );
        if (rows.length === 0) return null;
        return (
          <section key={group.key} className="space-y-3">
            <div>
              <h3 className="font-heading text-base font-bold">{group.title}</h3>
              <p className="text-sm text-muted-foreground">{group.hint}</p>
            </div>
            {rows.map((reason) => (
              <ReasonCard
                key={`${group.key}-${reason.id}`}
                reason={reason}
                usedCount={usage.get(reason.id) ?? 0}
                usageReady={usageReady}
                readOnly={readOnly}
                confirmingDelete={removing === reason.id}
              />
            ))}
          </section>
        );
      })}

      {ready && reasons.length > 0 && (
        <p className="text-xs text-muted-foreground">
          عدد الأسباب: {toArabicDigits(reasons.length)} · المفعَّلة:{" "}
          {toArabicDigits(activeCount)}
          {usageReady
            ? ""
            : " · تعذّر قراءة عدّاد الاستعمال، فالحذف معروضٌ على الجميع وقاعدة البيانات هي التي ترفضه لسببٍ مستعمَل."}
        </p>
      )}

      <form action={readOnly ? undefined : createReason}>
        <Card className="space-y-4 p-5">
          <div>
            <h3 className="flex items-center gap-1.5 font-heading text-base font-bold">
              <Plus className="size-4 text-primary" />
              إضافة سبب
              <HelpTip>
                يُضاف السبب مفعَّلاً مباشرةً لأن التسمية والإجراء المقترح إلزاميان في هذا
                النموذج — فلا شيء ناقص بعد الحفظ. وإن أردت تجهيزه قبل عرضه فألغِ مفتاح
                «معروض في نموذج الفشل» أدناه ثم فعّله من بطاقته حين يجهز.
              </HelpTip>
            </h3>
            <p className="text-sm text-muted-foreground">
              تسمية يقرؤها المدير، ومعرّف ثابت لا يتغير، وإجراء مالي مقترح.
            </p>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <TextField
              id="new-label"
              label="التسمية"
              name="new.label"
              placeholder="السائق تاه في الطريق"
              maxLength={160}
              disabled={readOnly}
              required
            />
            <TextField
              id="new-slug"
              label="المعرّف (Slug)"
              name="new.slug"
              dir="ltr"
              placeholder="driver-lost"
              pattern="[a-z0-9]+(-[a-z0-9]+)*"
              maxLength={64}
              disabled={readOnly}
              required
              help={SLUG_HELP}
            />
          </div>

          <ScopeFields
            idPrefix="new"
            namePrefix="new."
            scope="failure"
            initiator="any"
            deduct={null}
            disabled={readOnly}
          />

          <div className="grid gap-4 sm:grid-cols-2">
            <ActionSelect
              id="new-action"
              name="new.default_action"
              defaultValue="none"
              disabled={readOnly}
            />
          </div>

          <Label className="flex w-fit cursor-pointer items-center gap-2 text-sm font-normal">
            <input
              type="checkbox"
              name="new.active"
              defaultChecked
              disabled={readOnly}
              className="size-4 accent-primary"
            />
            معروض في نموذج الفشل فور الإضافة
          </Label>

          <div className="flex justify-end">
            <SaveButton
              label="إضافة السبب"
              icon={<Plus />}
              savedLabel="تمت الإضافة"
              pendingLabel="جارٍ الإضافة…"
              failedLabel="لم يُضَف"
              disabled={readOnly}
              errorMessages={ERROR_MESSAGES}
            />
          </div>
        </Card>
      </form>
    </div>
  );
}
