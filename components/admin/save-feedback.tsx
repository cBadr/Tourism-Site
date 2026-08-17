"use client";

import * as React from "react";
import { createPortal, useFormStatus } from "react-dom";
import { Check, Loader2, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/**
 * ╔══════════════════════════════════════════════════════════════════════════╗
 * ║  تأكيد الحفظ **بجوار الزرّ** — مكوّن واحد تستعمله كل شاشات `/admin`        ║
 * ╚══════════════════════════════════════════════════════════════════════════╝
 *
 * ── شكوى المالك (2026-08-17) ────────────────────────────────────────────────
 *
 * يعدّل حقلاً في اللوحة ويحفظ، **فيظهر التأكيد في أعلى الصفحة وعينه على الزرّ**
 * — فينتظر ولا يدري: هل حُفظ؟ وعلى شاشةٍ طويلة (الإعدادات · المحتوى) قد يكون
 * الشريط خارج الشاشة كلياً.
 *
 * ⚠ **وأول خاطرٍ له كان أن يُقذف المستخدم إلى أعلى الصفحة، فاعترضتُ ووافق**:
 * هو ينظر إلى الحقل الذي عدّله لحظتها، ونقلُه إلى الأعلى **يُفقده موضعه** فيبحث
 * عنه بعد كل حفظ. **فالصواب أن يأتي التأكيد إليه لا أن يذهب هو إليه**، والعيب
 * الأول أن التأكيد بعيد.
 *
 * ⚠ وقيل حينها إن «الصفحة لا تتحرك أصلاً». **والقياس الحيّ صحّح ذلك**: تتحرك حين
 * يتغيّر رمز الرابط (التفصيل في الكتلة الحمراء أدناه) — فصار حفظُ الموضع من عمل
 * هذا المكوّن أيضاً، لا مجرّد إحضار التأكيد.
 *
 * ── طبقتان، كلتاهما بموافقته ────────────────────────────────────────────────
 *
 * (١) **الزرّ نفسه يصير «تم الحفظ ✓»** لحظةً ثم يعود. عينه عليه سلفاً: لا تمرير،
 *     ولا بحث، ولا انتظار. وهذه تكفي **الأغلبية الساحقة** من الحفظ.
 *
 * (٢) **شريط ثابت في زاوية الشاشة** لما لا تحمله الأولى: **خطأٌ** برسالته
 *     الكاملة، أو **حفظٌ يغيّر أشياء أخرى** (كنسٌ، إبطال كاش، أثرٌ على الموقع
 *     العام). مرئيٌّ أياً كان موضع التمرير، فلا يُشترط أن يصل إلى الأعلى.
 *
 * ── (٣) وسببٌ ثالث ليس عن الرؤية أصلاً ───────────────────────────────────────
 *
 * شريطٌ أعلى الصفحة **يفشل مع قارئ الشاشة** أيضاً: من لا يراه لا يُقال له شيء،
 * لأن حقنَ عقدةٍ بعيدةٍ في الـDOM بلا `aria-live` لا يُعلن. فالتأكيد هنا يُعلن
 * فوراً من منطقة `role="status"` **ملتصقةٍ بالزرّ** — مبنيّةٌ في الأصل لا
 * مركّبةٌ فوقه. والخطأ يُعلن من الشريط بـ`role="alert"`.
 *
 * ⚠ **وإعلانٌ واحد لكل نتيجة لا اثنان**: الاسم المتاح للزرّ **ثابت** دائماً
 * (‏`aria-label`)، وتبديل نصّه المرئي `aria-hidden`. فلو تُرك الاسم يتبدّل
 * لأعلنه بعض القارئات مع منطقة الحالة — إعلانان لخبرٍ واحد. وثبات الاسم يفيد
 * أيضاً من يتنقّل بأسماء العناصر: الزرّ يبقى «حفظ الإعدادات» ولا يصير «تم الحفظ».
 *
 * ── كيف يعرف الزرّ نتيجة الحفظ؟ ─────────────────────────────────────────────
 *
 * كل إجراءات اللوحة تنتهي بـ`redirect()` برمزٍ في الـquery string (اتفاقيات §٤:
 * `?saved=1` · `?error=percent`). **والرمز في الرابط هو النتيجة** — فالزرّ:
 *
 *   ١) يرى `pending` من `useFormStatus()` — نموذجه هو الذي يُرسل.
 *   ٢) يقرأ رموز الرابط **متى وصلت النتيجة**، وذلك في موضعين لا واحد (اقرأ
 *      الكتلة الحمراء أدناه: الشجرة قد تُفكَّك، فلا يُعتمد على بقاء الحالة).
 *   ٣) خطأ ⇒ «لم يُحفظ» + شريط. نجاح ⇒ «تم الحفظ ✓» لحظتين.
 *
 * ⚠ **ولا تُحذف شرائط أعلى الصفحات**: هي النصّ الخادميّ الكامل، **وهي المسار
 * الوحيد بجافاسكربت مطفأة** — وهو مسارٌ تحفظه اتفاقيات §٤ صراحةً. هذه الطبقة
 * **تضاف** ولا تُبدِل.
 *
 * ⚠ **واحتمالٌ باقٍ بقصد**: لو رمى الإجراء استثناءً بلا `redirect` (وهو ما
 * تمنعه §٤) لبقي الرابط كما هو فقرأه الزرّ «نجاحاً». ولهذا **تُقرأ النتيجة
 * مرّتين**: قراءةٌ فورية للوميض، وأخرى بعد 90ms **لا تَخفض نجاحاً إلى خطأ
 * إلا صعوداً** — فالخطأ الواصل متأخراً يُلحق، والنجاح لا يُلغى بلا سبب.
 *
 * ╔══════════════════════════════════════════════════════════════════════════╗
 * ║  🔴 ولماذا **لا يُعتمد على بقاء حالة المكوّن** — عيبٌ قِيس حياً لا احتياط   ║
 * ╚══════════════════════════════════════════════════════════════════════════╝
 *
 * البناء الأول اعتمد أن `redirect` تنقّلٌ عميلٌ فتبقى الحالة. **وقياسٌ حيّ على
 * `/admin/pricing` أسقط ذلك**: حُفظ بقيمةٍ مرفوضة فوصلت `?error=percent`، ثم
 * **لم يظهر شيء** — لا «لم يُحفظ» ولا شريط، والزرّ عاد `idle`.
 *
 * والسبب بنيويٌّ في شكل هذه الشاشات لا في المكوّن: الصفحة تكتب شرائطها أشقّاءَ
 * شرطيّين بلا مفاتيح —
 *
 *     {readOnly && <Card/>}   {saved && <Card/>}   {error && <Card/>}   <form>
 *
 * فظهور شريط الخطأ **يُزيح موضع `<form>` بين أشقّائه**، و React تُطابق بالموضع
 * ⇒ تُفكِّك شجرة النموذج القديمة وتُركّب أخرى. **فحالةُ كل مكوّن عميل داخل
 * النموذج تُمحى**، ومعها الوميضُ الذي بُني ليُرى.
 *
 * ⇒ **فالنتيجة تُنقل في `sessionStorage` لا في الذاكرة**: النقرة تكتب أثراً
 * (تسمية الزرّ + اللحظة + موضع التمرير)، والمكوّن يقرؤه **عند التركيب أيضاً** لا
 * عند هبوط `pending` وحده. فيصحّ الطرفان: بقيت الشجرة أو تفكّكت. وعمرُ الأثر
 * ٣٠ ثانية فلا يومض تحميلٌ لاحق، **ومسحُه مؤجَّل** (الشرح عند `peekFlashMark`).
 *
 * ── وثمرةٌ ثانية للأثر: **موضع التمرير** ────────────────────────────────────
 *
 * القياس نفسه كشف أن الصفحة **قفزت إلى أعلاها** (`scrollY` من ٧٩٤ إلى صفر): رمزٌ
 * جديد في الرابط = تنقّلٌ جديد عند Next، والتنقّل يصفّر التمرير. أي أن ما قاله
 * المالك — «الصفحة لا تتحرك» — صحيحٌ حين يتكرّر الرمز نفسه، **وخاطئٌ عند أول
 * خطأ**. ولا مِقبضَ في `redirect()` لإلغائه.
 *
 * فالموضع يُحفظ في الأثر ويُعاد **بشرطين معاً**: أن تكون الصفحة الآن في أعلاها
 * وأن يكون المحفوظ أبعد من `MIN_RESTORE_PX`. أي أنه **لا يُحرّك** من كان فوق أصلاً، ولا
 * يقاوم تمريراً بدأه المالك بنفسه — يُعيد ما أخذه التنقّل لا أكثر. وهو عين ما
 * وافق عليه المالك: **الفكرة تأتي إليه، ومكانه لا يُفقد.**
 */

/* ══════════════════════════════════════════════════════════════════════════
   (أ) نبرة الحالة — بصيغةٍ واحدة تصحّ في الثيمين معاً

   🔴 **الرموز `--tone-*` وحدها، ولا لونٍ مكتوب هنا** (اتفاقيات §٣، ونفس مصدر
   `components/ui/card.tsx`). ونصّ النجاح **لا يكون `--tone-success` عارياً**:
   قِيس فوجد **3.25:1** فوق الرمل — دون AA. فالصيغة تمزجه بـ`--foreground`،
   وهي تُغمِق في الفاتح وتُفتِح في الداكن **بلا فرعٍ لكل ثيم**:

   | المقيس (نصّ / أرضيته)              | فاتح   | داكن   |
   |------------------------------------|--------|--------|
   | نجاح: tone 66% + foreground        | 5.50:1 | 8.80:1 |
   | نجاح فوق الرمل/الحبر العاري        | 5.71:1 | 11.97:1|
   | خطر: `--destructive` (مقيسٌ سلفاً) | 4.63:1 | 5.41:1 |
   | حدّ النجاح (‏tone خالص، غير نصّ)     | 3.13:1 | —      |

   والخطر يعيد استعمال `--destructive` القائم ولا يضيف لوناً خامساً.
   ══════════════════════════════════════════════════════════════════════════ */

const TONE_SAVED =
  "[--fb-tone:var(--tone-success)] " +
  "bg-[color:color-mix(in_oklab,var(--fb-tone)_14%,var(--card))] " +
  "text-[color:color-mix(in_oklab,var(--fb-tone)_66%,var(--foreground))] " +
  "border-[color:var(--fb-tone)]";

const TONE_FAILED =
  "[--fb-tone:var(--destructive)] " +
  "bg-[color:color-mix(in_oklab,var(--fb-tone)_10%,var(--card))] " +
  "text-[color:var(--fb-tone)] " +
  "border-[color:var(--fb-tone)]";

/* ══════════════════════════════════════════════════════════════════════════
   (ب) متجر الشريط — رسالةٌ واحدة نشطة في اللوحة كلها

   ولا مزوّد (`Provider`) ولا تركيبٌ في الغلاف: كل زرٍّ يبثّ شريطه في بوّابةٍ
   إلى `document.body`، **والمتجر يضمن أن الظاهر واحد** — فنشرُ رسالةٍ جديدة
   يُسقط السابقة. وثمرته أن المكوّن **يعمل بمجرّد استيراده**: لا شاشةٌ تفقد
   شريطها لأن أحداً نسي سطر التركيب، وهو بالضبط العيب الذي اختار المالك مكوّناً
   مشتركاً لتفاديه.
   ══════════════════════════════════════════════════════════════════════════ */

type StripMessage = {
  /** معرّف الزرّ المالك — لا يرسم الشريط إلا هو، فلا شريطان */
  owner: string;
  kind: "saved" | "failed";
  text: string;
  /** الرقم يجبر إعادة الإعلان حين تتكرر نفس الرسالة نصّاً */
  seq: number;
};

let stripState: StripMessage | null = null;
let stripSeq = 0;
const stripListeners = new Set<() => void>();

function emitStrip() {
  for (const listener of stripListeners) listener();
}

function publishStrip(owner: string, kind: StripMessage["kind"], text: string) {
  stripSeq += 1;
  stripState = { owner, kind, text, seq: stripSeq };
  emitStrip();
}

function clearStrip(owner: string) {
  if (stripState?.owner === owner) {
    stripState = null;
    emitStrip();
  }
}

function subscribeStrip(listener: () => void) {
  stripListeners.add(listener);
  return () => stripListeners.delete(listener);
}

const readStrip = () => stripState;
/** الخادم لا يرسم الشريط أصلاً — لا حالة قبل الترطيب */
const readStripServer = () => null;

/* ══════════════════════════════════════════════════════════════════════════
   (ج) قراءة نتيجة الحفظ من رموز الرابط
   ══════════════════════════════════════════════════════════════════════════ */

/** رمز ⇒ نصٌّ عربي. الصفحة تملك القاموس لأنها تملك رموز إجرائها (اتفاقيات §٤) */
export type SaveMessages = Readonly<Record<string, string>>;

export type SaveOutcome =
  | { kind: "saved"; code: string }
  | { kind: "failed"; code: string };

/**
 * أسماء المعاملات المستعملة في اللوحة كلها. `error` يغلب دائماً: إجراءٌ يوجّه
 * إلى `?error=x` لم يحفظ شيئاً، ولو حمل الرابط `saved` من حفظٍ سابق.
 */
function readOutcome(): SaveOutcome {
  const params = new URLSearchParams(window.location.search);
  const error = params.get("error");
  if (error) return { kind: "failed", code: error };
  return { kind: "saved", code: params.get("saved") ?? "1" };
}

/* ── أثر النقرة: يعبُر تفكيك الشجرة، بخلاف حالة المكوّن ─────────────────────
   المفتاح واحد للوحة كلها لأن الحفظ فعلٌ واحد في كل لحظة، والتسمية داخله هي
   الهوية — فزرٌّ آخر لا يستهلك أثر غيره. و`sessionStorage` لا `localStorage`:
   نتيجةُ لحظةٍ في تبويبٍ واحد، لا تفضيلٌ يُحفظ للغد ولا يُشارَك بين تبويبين. */
const FLASH_KEY = "admin.save.flash";
/** عمرُ الأثر — أطول من أبطأ حفظٍ رأيناه، وأقصر من أن يومض تحميلٌ لاحق */
const FLASH_TTL_MS = 30_000;

type FlashMark = { label: string; index: number; at: number; scrollY: number };

/**
 * ترتيب هذا الزرّ بين أشباهه في الصفحة — **الشقّ الثاني من الهوية**.
 *
 * 🔴 **ولماذا لا تكفي التسمية**: قِيس على `/admin/fleet` أن الشاشة تحمل **أربعة**
 * أزرار «حفظ الفئة» (زرٌّ لكل فئة مركبات). فبالتسمية وحدها هويةً، يقرأ الأربعةُ
 * أثرَ واحدٍ منها ⇒ **تومض كلها على حفظِ فئةٍ واحدة** — وهو نفس العيب الذي
 * تفادته نقرةُ الزرّ داخل النموذج، عائداً من باب `sessionStorage`.
 *
 * والترتيب مقروءٌ من الـDOM لا مُمرَّرٌ prop: فلا تُكلَّف أربعون شاشة بمفتاحٍ
 * يدويٍّ يُنسى في الحادية والأربعين. وهو ثابتٌ بين التفكيك والتركيب لأن القائمة
 * تُصيَّر من نفس البيانات بنفس الترتيب.
 */
function sameLabelIndex(node: HTMLButtonElement | null, label: string): number {
  if (!node) return -1;
  const peers = [...document.querySelectorAll<HTMLButtonElement>("button[data-save-state]")].filter(
    (b) => b.getAttribute("aria-label") === label
  );
  return peers.indexOf(node);
}

function writeFlashMark(label: string, index: number) {
  try {
    const mark: FlashMark = {
      label,
      index,
      at: Date.now(),
      scrollY: Math.round(window.scrollY),
    };
    sessionStorage.setItem(FLASH_KEY, JSON.stringify(mark));
  } catch {
    // تبويبٌ يمنع التخزين (خاصّ/مقفل) — تبقى الطبقة الأولى تعمل عبر `pending`
  }
}

function clearFlashMark() {
  try {
    sessionStorage.removeItem(FLASH_KEY);
  } catch {
    /* لا شيء يُفعل */
  }
}

/**
 * يقرأ الأثر **ولا يستهلكه**؛ يُرجع `null` إن لم يكن لنا أو انتهى عمره.
 *
 * 🔴 **والفرق بين «يقرأ» و«يستهلك» عيبٌ قِيس حياً**: أول بناءٍ استهلك الأثر عند
 * هبوط `pending`، ثم **فُكِّكت الشجرة قبل أن يُطبَّق** فأُلغي مؤقّته مع التفكيك
 * — فمات المستهلِك حاملاً الخبر، ومُنعت النسخة الجديدة من قراءته. والنتيجة على
 * الشاشة: خطأٌ حقيقي في الرابط ولا شيء يُرى.
 *
 * ⇒ فالمسح **مؤجَّلٌ 400ms بعد التطبيق** ويسكن في `timers` — فإن عاشت النسخة
 * مسحته، وإن ماتت أُلغي المسح فبقي الأثر للنسخة التالية. وتكرار التطبيق على
 * نسختين لا يضرّ: نفس النتيجة ونفس النصّ.
 */
function peekFlashMark(label: string, index: number): FlashMark | null {
  try {
    const raw = sessionStorage.getItem(FLASH_KEY);
    if (!raw) return null;
    const mark = JSON.parse(raw) as Partial<FlashMark>;
    if (mark.label !== label || mark.index !== index || typeof mark.at !== "number") return null;
    if (Date.now() - mark.at > FLASH_TTL_MS) {
      clearFlashMark();
      return null;
    }
    return {
      label,
      index,
      at: mark.at,
      scrollY: typeof mark.scrollY === "number" ? mark.scrollY : 0,
    };
  } catch {
    return null;
  }
}

/**
 * إعادة ما أخذه التنقّل من موضع التمرير — **بشرطين، وبلا حركة**.
 *
 * ⚠ لا يُنفَّذ إلا إذا كانت الصفحة الآن في أعلاها فعلاً (‏`< 8px`) وكان المحفوظ
 * أبعد من `MIN_RESTORE_PX`. فمن حفظ وهو في الأعلى لا يُحرَّك، ومن بدأ تمريراً
 * بنفسه لا يُقاوَم. و`instant` لأن هذا **تصحيحُ موضعٍ لا انتقالٌ يُشاهَد**.
 *
 * ⚠ **والعتبة رقمٌ ثابت لا `innerHeight`**: قِيس أن زرّ الحفظ على `/admin/pricing`
 * كان عند ‎744‏ ونافذةُ القياس ‎800‏، فمنعت عتبةُ «ملء شاشة» الإعادةَ — والزرّ بعد
 * التصفير صار عند ‎1078‏، أي خارج الشاشة تماماً. فالمقصود «هل كان يرى موضعاً
 * غير الأعلى؟» لا «هل تجاوز شاشةً كاملة؟».
 */
const MIN_RESTORE_PX = 200;

function restoreScroll(y: number) {
  if (y < MIN_RESTORE_PX || window.scrollY > 8) return;
  window.scrollTo({ top: y, behavior: "instant" });
}

/* ══════════════════════════════════════════════════════════════════════════
   (د) الزرّ
   ══════════════════════════════════════════════════════════════════════════ */

/** مدّة بقاء «تم الحفظ ✓» — لحظةٌ تُرى ولا تُنتظر */
const SAVED_FLASH_MS = 2600;

/**
 * الشريط ينسحب وحده في النجاح فقط. **والخطأ يبقى حتى يُغلقه المالك أو يعيد
 * الحفظ** — رسالةُ فشلٍ تختفي بنفسها تعني عملاً ضائعاً لا يعرف صاحبه أنه ضاع.
 */
const SAVED_STRIP_MS = 7000;

export type SaveButtonProps = Omit<
  React.ComponentProps<typeof Button>,
  "type" | "children" | "aria-label"
> & {
    /** نصّ الزرّ الساكن — وهو **الاسم المتاح الثابت** أيضاً */
    label: string;
    /**
     * أيقونة الحالة الساكنة — **عنصرٌ مُصيَّر** (`icon={<Save />}`) لا مكوّن.
     *
     * 🔴 **والفرق ليس ذوقاً بل عيبٌ قِيس حياً.** كان النوع `LucideIcon` وكانت
     * الشاشات تكتب `icon={Save}`، فمرّ `tsc` و`eslint` خضراوين **وانفجرت الصفحة
     * في المتصفح**:
     *
     *     Error: Functions cannot be passed directly to Client Components
     *     {$$typeof: ..., render: function Save}
     *
     * لأن الصفحة **مكوّن خادمي** وهذا **مكوّن عميل**: ما يعبُر الحدّ بيانات
     * قابلة للتسلسل، والدالة ليست منها. والعنصر المُصيَّر يعبُر (وهو بالضبط ما
     * يعبُر في `children` كل يوم). **ولا يُعاد النوع إلى `LucideIcon` أبداً.**
     */
    icon?: React.ReactNode;
    /** نصّ النجاح — والافتراضي يتبع نمط «تم + مصدر» (قاعدة بدر 2026-08-17) */
    savedLabel?: string;
    /** نصّ الإرسال الجاري */
    pendingLabel?: string;
    /** نصّ الفشل على الزرّ — والتفصيل في الشريط */
    failedLabel?: string;
    /**
     * رموز الأخطاء ⇒ نصوصها العربية، كما تكتبها الصفحة سلفاً لشريطها العلوي.
     * تُمرَّر فيظهر **نفس النص** في الزاوية بلا أن يمرّر المالك إلى الأعلى.
     */
    errorMessages?: SaveMessages;
    /**
     * رموز `saved` التي **تغيّر أشياء أخرى** ⇒ نصّها في الشريط. الحفظ العادي
     * لا يُدرج هنا: وميض الزرّ يكفيه، والشريط لكل حفظٍ يصير ضجيجاً يُتجاهل.
     */
    savedMessages?: SaveMessages;
    /** نصّ الخطأ حين لا يوجد رمزه في القاموس */
    fallbackErrorMessage?: string;
  };

export function SaveButton({
  label,
  icon,
  savedLabel = "تم الحفظ",
  pendingLabel = "جارٍ الحفظ…",
  failedLabel = "لم يُحفظ",
  errorMessages,
  savedMessages,
  fallbackErrorMessage = "لم يُحفظ — راجع التنبيه أعلى الصفحة.",
  className,
  variant,
  size,
  disabled,
  onClick,
  ...rest
}: SaveButtonProps) {
  const { pending } = useFormStatus();
  const id = React.useId();

  /**
   * حالة الزرّ الظاهرة. و`submitting` تُضبَط **في مُعالج النقر** لا في تأثير:
   *
   * 🔴 **لأن `useFormStatus` تخصّ النموذج لا الزرّ.** شاشةٌ مثل `content/[id]`
   * فيها نموذجٌ واحد وأزرارُ `formAction` عدّة، وبلا هذا التمييز يومض **كل**
   * أزرار النموذج على حفظٍ واحد. والنقرة هي الخبر الوحيد الذي يقول «أنا من أرسل».
   *
   * ⚠ **ولا تُقرأ `ref` في التصيير** لتحديد ذلك (قاعدة `react-hooks/refs`):
   * الحالة حالةٌ، والمراجع أدناه لا تُلمس إلا داخل التأثيرات والمؤقّتات.
   */
  const [phase, setPhase] = React.useState<"idle" | "submitting" | "saved" | "failed">("idle");
  /** نصّ منطقة `role="status"` — النجاح وحده يُعلن منها (الخطأ يُعلن من الشريط) */
  const [announcement, setAnnouncement] = React.useState("");

  /** هل بدأ إرسالٌ ننسبه إلى هذا الزرّ فعلاً؟ (يُضبَط عند صعود `pending`) */
  const armed = React.useRef(false);
  const wasPending = React.useRef(false);
  const timers = React.useRef<ReturnType<typeof setTimeout>[]>([]);
  /** عقدة الزرّ — تُقرأ لحساب ترتيبه بين أشباهه (انظر `sameLabelIndex`) */
  const node = React.useRef<HTMLButtonElement | null>(null);

  const clearTimers = React.useCallback(() => {
    for (const t of timers.current) clearTimeout(t);
    timers.current = [];
  }, []);

  React.useEffect(() => clearTimers, [clearTimers]);

  const applyOutcome = React.useCallback(
    (outcome: SaveOutcome, restoreTo?: number) => {
      if (restoreTo !== undefined) restoreScroll(restoreTo);
      if (outcome.kind === "failed") {
        setPhase("failed");
        setAnnouncement("");
        publishStrip(id, "failed", errorMessages?.[outcome.code] ?? fallbackErrorMessage);
        return;
      }
      setPhase("saved");
      setAnnouncement(savedLabel);
      const note = savedMessages?.[outcome.code];
      if (note) {
        publishStrip(id, "saved", note);
        timers.current.push(setTimeout(() => clearStrip(id), SAVED_STRIP_MS));
      } else {
        clearStrip(id);
      }
      // الرجوع إلى الحالة الساكنة — والإعلان يُمحى معه فلا يُعاد قراءته
      timers.current.push(
        setTimeout(() => {
          setPhase("idle");
          setAnnouncement("");
        }, SAVED_FLASH_MS)
      );
    },
    [errorMessages, fallbackErrorMessage, id, savedLabel, savedMessages]
  );

  /** نتيجةٌ وصلت ⇒ تُطبَّق، ثم يُمسح الأثر متأخراً (الشرح عند `peekFlashMark`) */
  const consume = React.useCallback(() => {
    const mark = peekFlashMark(label, sameLabelIndex(node.current, label));
    if (!mark) return;
    timers.current.push(
      setTimeout(() => {
        const first = readOutcome();
        applyOutcome(first, mark.scrollY);
        timers.current.push(setTimeout(clearFlashMark, 400));
        // قراءةٌ ثانية تُلحق خطأً وصل متأخراً، ولا تنقض نجاحاً بلا سبب
        if (first.kind === "saved") {
          timers.current.push(
            setTimeout(() => {
              const second = readOutcome();
              if (second.kind === "failed") applyOutcome(second);
            }, 90)
          );
        }
      }, 0)
    );
  }, [applyOutcome, label]);

  // 🔴 **المسار الذي يعمل حين تُفكَّك الشجرة**: نسخةٌ جديدة تُركّب على الرابط
  // الجديد، فتقرأ الأثر وتعلن. وعلى تحميلٍ عاديٍّ لا أثرَ فلا وميض.
  React.useEffect(() => {
    consume();
  }, [consume]);

  // والمسار الذي يعمل حين تبقى الشجرة: هبوط `pending` **بعد دورةٍ** لا في جسم
  // التأثير — فتلحق ملاحةُ `redirect` موضعها، ولا `setState` متزامنٌ في تأثير.
  React.useEffect(() => {
    // ⚠ بلا شرطِ حافّةٍ على `pending`: ترتيب دفعتَي التصيير (نقرتُنا وصعودُ
    // `pending`) غير مضمون، وشرطُ الحافّة كان يسقط لو سبقت `pending` الحالة.
    if (pending && phase === "submitting") armed.current = true;
    if (!pending && wasPending.current && armed.current) {
      armed.current = false;
      consume();
    }
    wasPending.current = pending;
  }, [pending, phase, consume]);

  /** نوع المُعالج يأتي من الزرّ نفسه: base-ui يوسّع الحدث بـ`preventBaseUIHandler` */
  const handleClick: NonNullable<React.ComponentProps<typeof Button>["onClick"]> = (event) => {
    clearTimers();
    clearStrip(id);
    setAnnouncement("");
    setPhase("submitting");
    // الأثر يُكتب **قبل** أن يبدأ الإرسال، لأن الشجرة قد تُفكَّك بعده
    writeFlashMark(label, sameLabelIndex(node.current, label));
    // نقرةٌ منعها تحقّق المتصفح (`required`) لا يتبعها `pending` إطلاقاً — فتُنسى
    // بعد لحظة (**والأثر معها**، وإلا أومض تحميلٌ لاحق بنتيجةٍ لم تحدث).
    timers.current.push(
      setTimeout(() => {
        if (!armed.current) {
          setPhase("idle");
          clearFlashMark();
        }
      }, 500)
    );
    onClick?.(event);
  };

  // ⚠ **الزرّ لا يُعطَّل من `phase`** بل من `pending` وحده — والفرق ليس أناقة:
  // `phase` تُضبَط في النقرة، أي **قبل** أن يبدأ المتصفح إرسال النموذج، وتعطيلُ
  // زرٍّ في أثناء تفعيله قد يُسقط الإرسال نفسه. و`pending` تأتي بعد بدئه.
  const showPending = pending && phase === "submitting";
  const visual = showPending ? "pending" : phase === "submitting" ? "idle" : phase;

  const visibleLabel =
    visual === "pending"
      ? pendingLabel
      : visual === "saved"
        ? savedLabel
        : visual === "failed"
          ? failedLabel
          : label;

  return (
    <span className="inline-flex items-center gap-2">
      <Button
        ref={node}
        type="submit"
        variant={variant}
        size={size}
        disabled={disabled || pending}
        onClick={handleClick}
        // الاسم المتاح **ثابت** — الشرح في ترويسة الملف (إعلانٌ واحد لا اثنان)
        aria-label={label}
        data-save-state={visual}
        className={cn(
          // الحركة `motion-safe` فقط: تبدّل الحالة **معلومة**، فيجب أن تُرى
          // كاملةً (لونٌ وأيقونةٌ ونصّ) عند من طلب تقليل الحركة، بلا انتقال.
          "motion-safe:transition-colors",
          visual === "saved" && TONE_SAVED,
          visual === "failed" && TONE_FAILED,
          className
        )}
        {...rest}
      >
        <span aria-hidden="true" className="inline-flex items-center gap-1.5">
          {visual === "pending" ? (
            <Loader2 className="motion-safe:animate-spin" />
          ) : visual === "saved" ? (
            <Check />
          ) : visual === "failed" ? (
            <X />
          ) : (
            icon
          )}
          {visibleLabel}
        </span>
      </Button>

      {/*
        منطقة الإعلان — ملتصقةٌ بالزرّ في الـDOM فيقرؤها القارئ في سياقه.

        ⚠ **و`sr-only` دائماً، لا تُرى قط.** جُرِّبت مرئيّةً فظهرت «تم الحفظ»
        نصّاً بجوار زرٍّ يقول «تم الحفظ ✓» — تكرارٌ لا يضيف للعين شيئاً. فالبصر
        يأخذ خبره من الزرّ نفسه، **والسمع يأخذه من هنا**، ولا يُقال لأحدهما
        الشيء مرتين.
      */}
      <span role="status" aria-live="polite" className="sr-only">
        {announcement}
      </span>

      <SaveFeedbackStrip owner={id} />
    </span>
  );
}

/* ══════════════════════════════════════════════════════════════════════════
   (هـ) الشريط الثابت في الزاوية

   الموضع: أسفل **جهة النهاية** — أي يسار الشاشة عربياً، بعيداً عن الشريط
   الجانبي (الذي يقع يميناً في RTL) وبعيداً عن أزرار الحفظ التي تصطفّ يميناً.
   وعرضه محدودٌ بالنافذة على الجوال وبـ`max-w-sm` فوقها، فلا يغطّي الشاشة.
   ══════════════════════════════════════════════════════════════════════════ */

function SaveFeedbackStrip({ owner }: { owner: string }) {
  const message = React.useSyncExternalStore(subscribeStrip, readStrip, readStripServer);

  // ولا حارس `mounted` بحالة: `readStripServer` تُرجع `null` فلا شريط في تصيير
  // الخادم، ولا شريط في أول تصييرٍ عميل أيضاً — لأن المتجر لا يُكتب إلا بنقرةٍ
  // بعد الترطيب. فالحارس الوحيد المطلوب هو وجود `document` أصلاً.
  if (typeof document === "undefined") return null;
  if (!message || message.owner !== owner) return null;

  const failed = message.kind === "failed";

  return createPortal(
    <div
      // `key` على الرقم المتسلسل: نفس النص مرّتين يُعاد إعلانه لأن العقدة جديدة
      key={message.seq}
      className={cn(
        // ⚠ **جهة النهاية وحدها، ولا `inset-x-*` معها**: `inset-x-auto`
        // و`end-4` تكتبان نفس الخاصية المختصرة (`inset-inline`) فيغلب المتأخّر
        // في الورقة المولَّدة لا المتأخّر في السطر — أي أن موضع الشريط يصير
        // رهن ترتيبٍ لا نتحكم فيه. والعرض يُحَدّ بالنافذة بدل ذلك.
        "fixed bottom-4 end-4 z-[60] max-w-[calc(100vw-2rem)] sm:max-w-sm",
        "flex items-start gap-2.5 rounded-xl border px-3.5 py-3 shadow-lg",
        "text-sm leading-relaxed",
        failed ? TONE_FAILED : TONE_SAVED,
        // ظهورٌ خفيف لمن يقبل الحركة؛ ومن رفضها يراه حاضراً بلا انتقال
        "motion-safe:animate-in motion-safe:fade-in motion-safe:slide-in-from-bottom-2"
      )}
      // الخطأ يُعلن فوراً (`alert`)، والنجاح بلا مقاطعة (`status`)
      role={failed ? "alert" : "status"}
      aria-live={failed ? "assertive" : "polite"}
    >
      {failed ? (
        <X aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
      ) : (
        <Check aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
      )}
      <p className="min-w-0 flex-1">{message.text}</p>
      <button
        type="button"
        onClick={() => clearStrip(owner)}
        aria-label="إغلاق التنبيه"
        className="-me-1 -mt-1 shrink-0 rounded-md p-1 opacity-70 transition-opacity hover:opacity-100 focus-visible:ring-2 focus-visible:ring-current focus-visible:outline-none"
      >
        <X aria-hidden="true" className="size-3.5" />
      </button>
    </div>,
    document.body
  );
}
