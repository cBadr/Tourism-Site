import "server-only";

import { cache } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";

import { toArabicDigits } from "@/components/booking/format";
import { dateLabel } from "@/components/portal/portal-ui";
import type { PriceListStatus } from "@/lib/subcontractor-types";
/**
 * 🔒 **الإتاحة تُقرأ ولا تُشتقّ من جديد.** `loadPartnerAlerts` هي القارئ الوحيد
 * لـ`portal_alert_prefs()`، وتلك تعيد `reachable/willing` من **نفس**
 * `partner_availability()` التي يقرؤها `dispatch_pool` عبر `partner_available()`.
 * فاستيرادها هنا — بدل إعادة عدّ القنوات — هو ما يمنع مصدرَي حقيقة يفترقان يوم
 * تتغيّر إحداهما (النمط ٢ في `LESSONS.md`: شاشةٌ تقول «مستقبِل» وحوضٌ يتخطّاه).
 * والملف مُذاكَر بـ`cache()`، فقراءته من هنا ومن شاشة القنوات نداءٌ واحد للطلب.
 */
import { loadPartnerAlerts } from "../notifications/data";
/**
 * 🔒 حالةُ الاتفاقية تصل **محسوبةً** من `partner_agreement_status()` عبر
 * `portal_agreement()` — وهي نفسُ الدالة التي تقرؤها `dispatch_pool` و
 * `portal_offers` و`accept_offer`. فلا تُشتقّ هنا مهلةٌ ولا «هل قَبِل»: تعريفان
 * يفترقان يوماً، فيقرأ الشريك «لا شيء عليك» بينما الحوض يُسقطه.
 */
import { loadPortalAgreement } from "./agreement";
import { isPriceListStatus } from "./data";
import { portalSetupAccess, type PortalStage, type PortalSub } from "./session";

/** عدد بالأرقام العربية الهندية — نفس ما تفعله `countLabel` في لبنات البورتال */
const n = (value: number) => toArabicDigits(Math.max(0, Math.round(value)));

/**
 * قياس جاهزية الشريك — مصدر الحقيقة الوحيد لمعالج التجهيز.
 *
 * هذا الملف **يقيس ولا يزيّن**. كل بند فيه سؤالٌ له جواب في القاعدة، وكل جواب
 * مقترنٌ بأثره الحقيقي على البثّ كما تقرؤه `dispatch_pool` — لا بترتيبٍ شكليّ
 * لخطوات. والفرق ليس تجميلاً: قائمةٌ تقول «اكتملت كل الخطوات» لشريكٍ لا يصله
 * عرضٌ واحد هي بالضبط النمط ٢ في `LESSONS.md` (الواجهة تَعِد بما لا تنفّذه
 * القاعدة)، وهو ما وقع فعلاً — قِيس حياً في هذه الجلسة.
 *
 * ### ما تشترطه القاعدة فعلاً كي يصل عرضٌ واحد
 * قُرئت الشروط من التعريف الحيّ (`pg_get_functiondef`) لا من ملف هجرة (D-58):
 *
 * | الشرط | أين يقع |
 * |---|---|
 * | `subcontractors.status = 'approved'` | `coverage_matches` **و** `dispatch_pool` |
 * | `price_lists.status = 'approved'` | `coverage_matches` |
 * | بندُ سعرٍ لفئة الحجز في تلك القائمة | `dispatch_pool` (‏`join price_list_items`) |
 * | **مركبة نشطة من نفس الفئة** | `dispatch_pool` (‏`exists … and v.active`) |
 * | ألا يكون فوق سقف الدين | `portal_offers` |
 * | **قناةٌ تبلغه** (‏`partner_available`) | `dispatch_pool` — **ترجيحٌ لا منعٌ**، انظر أدناه |
 *
 * والشرط الرابع هو الفخّ الصامت: قائمةٌ معتمَدة لفئةٍ لا مركبة نشطة فيها **لا
 * تُنتج عرضاً واحداً أبداً**، ولا شيء في الشاشة كان يقول ذلك. المقيس حياً لحظة
 * الكتابة: شريكٌ معتمَد بقائمتين معتمدتين تسعّران `sedan` و`suv` و**صفر مركبات**
 * — أي حسابٌ مكتملٌ في الظاهر لا يمكن أن يصله شيء.
 *
 * ### والقناة شرطٌ سادس بوزنٍ **مختلف** — قرأناه بحرفه فلم نبالغ فيه
 * آخر سطرين في `dispatch_pool` (‏`pg_get_functiondef`، 2026-08-17):
 *
 *     where r.avail
 *        or not exists (select 1 from ranked r2 where r2.avail)   -- ← الاحتياطي
 *
 * فمن لا قناةَ له **لا يُمنع** بل يُؤخَّر: يُقدَّم عليه كل من يمكن بلوغه، ولا يصله
 * شيء إلا إذا لم يكن في الحوض بالغٌ واحد. ولذلك وزنه `reach` لا `blocking` —
 * ووسمُه `blocking` كان سيكون كذبةً قابلة للقياس اليوم بالذات: القاعدة فيها
 * **شريكٌ واحد**، فالاحتياطي يعمل له دائماً.
 *
 * ⚠ ومع ذلك يمنع «الاكتمال»: شريكٌ فصل تليجرامه يقرأ «أنت مستقبِلٌ للعروض» وهو
 * يُتخطَّى — وهو بعينه العطل الذي أُصلح، مقلوباً.
 *
 * ### والسائقون ليسوا شرطاً للعرض — وهذا بالضبط سبب إفرادهم ببندٍ من طبقة أخرى
 * لا تذكرهم `dispatch_pool` إطلاقاً، فهم لا يمنعون بثاً؛ لكن `set_trip_crew`
 * تشترط سائقاً **من سجلّ الشريك نفسه**، فالسجلّ الفارغ يوقفه بعد أن يكون قد
 * التزم برحلة عميلٍ دفع. لذلك بندهم `later` لا `blocking`: إنذارٌ يرنّ في وقته.
 *
 * ### وكذلك الملف: قناة التواصل الثانية **ليست** شرط بثّ — وقد كُذب بها مرة
 * كان بند الملف موسوماً `blocking`، أي «بدونه لا يصلك عرضٌ واحد». وهذا غير صحيح:
 * أُعيدت قراءة `dispatch_pool` و`coverage_matches` حيّتين من `pg_get_functiondef`
 * (D-58) فلم يظهر في واحدةٍ منهما ذكرٌ لـ`whatsapp` ولا `email` ولا `contact_name`
 * — الجدول أعلاه هو كامل ما تشترطانه. و`company_name` و`phone` عمودان
 * `not null` بقيدَي طول (`…_company_name_chk` / `…_phone_chk`)، فلا يوجد أصلاً
 * صفُّ شريكٍ بلا اسمٍ ولا هاتف كي يمنع بثّاً.
 *
 * والوسم الكاذب ليس تفصيلاً تجميلياً: هو بعينه ما أُصلح في شاشة التسعير قبل
 * أيام — إرسالُ الشريك يطارد ما ليس هو العائق، فيضيف بريداً وينتظر عرضاً لا
 * يأتي لأن العائق الحقيقي مركبةٌ متوقفة أو قائمةٌ لم تُعتمد. ولذلك طبقةٌ ثالثة
 * (`contact`) صادقةٌ في وقتها: **مطلوبٌ بعد الإسناد لا قبله**، لأن الإدارة تبلغ
 * الشريك من `phone` و`whatsapp` (‏`ContactLinks` في صفحة المتعهد الإدارية)،
 * والقناة الواحدة التي لا تُجيب توقف تنسيق رحلةٍ التزم بها.
 *
 * ولا حساب مالي هنا ولا قرار أهلية: عدُّ صفوفٍ ومقارنةُ مجموعات فحسب (D-05/D-12).
 */

/* ------------------------------------------------------------------ */
/* الأنواع                                                             */
/* ------------------------------------------------------------------ */

/**
 * الأنواع تُعاد من الوحدة المحيّدة `readiness-settle.ts` — و**إعادةُ تصدير نوعٍ
 * آمنة**: النوع يُمحى في الترجمة فلا يعبر حداً أصلاً. المحظور إعادةُ تصدير
 * **قيمة** من ملفٍّ عميل، وهو ما لا يقع هنا: `readiness-settle` محيّدة وهذا الملف
 * خادميّ. والفائدة أن أربعة مواضع استيراد قائمة لم تتغيّر بحرف.
 */
export type { OnboardingStep, StepHref, StepState, StepWeight } from "./readiness-settle";
// وسطران لا سطر: الأعلى للمستوردين من خارج الملف، وهذا لما يُستعمل داخله وحده
import type { OnboardingStep, StepState, StepWeight } from "./readiness-settle";
import { settleReadiness } from "./readiness-settle";

/**
 * وزن البند — **متى** يعضّ تركُه؟ لا كم هو مهم.
 *
 * والترتيب زمنيّ لا تفضيليّ، وكل درجة مشدودة إلى موضعٍ في القاعدة يمكن قراءته:
 * - `blocking`: بدونه **لا يصل عرضٌ واحد** — شرطٌ في `dispatch_pool` أو فيما
 *   تستدعيه (`coverage_matches`).
 * - `reach`: العرض **يُنشأ** له وقد لا يبلغه: `dispatch_pool` تقرأ
 *   `partner_available` وتقدّم عليه كل بالغٍ، ولا تصل إليه إلا حين لا يوجد بالغٌ
 *   واحد (الاحتياطي في ترويسة الملف). فالكلفة حقيقية والمنع ليس مطلقاً.
 * - `contact`: لا يمنع عرضاً ولا يرفض إجراءً، لكنه يُطلب **بعد الإسناد**: به
 *   تبلغك الإدارة حين تُسنَد إليك رحلة. لا تعرفه القاعدة شرطاً، ولذلك لا يُعدّ
 *   في «ما ينقصك» — ووسمُه بغير ذلك هو الكذبة التي أُصلحت (انظر ترويسة الملف).
 * - `later`: لا يمنع العرض، ويقف في وجهه **بعد** القبول رفضاً صريحاً من القاعدة
 *   (`set_trip_crew` ترفع استثناءً بلا سائقٍ من سجلّ الشريك).
 * - `optional`: يحسّن ولا يمنع.
 *
 * ⚠ والفارق بين `contact` و`later` ليس ترفاً: الأول تنبيهٌ لا رفض فيه، والثاني
 * بابٌ يُغلق في وجه الشريك بعد أن يكون قد التزم برحلة عميلٍ دفع. ضمُّهما تحت وسمٍ
 * واحد كان سيُنقص صدق أحدهما لا محالة.
 *
 * و`blocking` و`reach` وحدهما يُعدّان في «ما ينقصك» (‏`promptLeft`)، لأنهما وحدهما
 * ما يقف بين الشريك وعملٍ يصله **قبل** أن يقبل شيئاً. والقرار نفسه (‏`isPromptWeight`)
 * في الوحدة المحيّدة كي يقرأه العدّاد والمعالج من نسخةٍ واحدة.
 *
 * والتعريفات الحرفية لـ`StepWeight` و`StepState` و`StepHref` و`OnboardingStep`
 * في `readiness-settle.ts`، وهذا الملف يعيد تصديرها أعلاه.
 */

export type OnboardingReadiness = {
  stage: PortalStage;
  sub: PortalSub;
  steps: OnboardingStep[];
  /**
   * بنود `blocking` و`reach` التي ما زالت على الشريك — عدّاد «ما ينقصك».
   *
   * ⚠ كان اسمه `blockingLeft` ويعدّ `blocking` وحدها. وتوحيدُه عدّاداً واحداً
   * مقصود: عدّادان على شاشةٍ واحدة يجعلان «بقي عليك ٠ من البنود» تُطبع فوق قائمةٍ
   * فيها بندٌ أحمر — وهو ما كان يقع حرفياً لو بقي `reach` خارج العدّ.
   */
  promptLeft: number;
  /**
   * **الشرط الوحيد لإخفاء شريط الجاهزية**: معتمَدٌ، ولا شيء ناقصاً منه، ولا شيء
   * عند الإدارة، ولا قراءةٌ تعذّرت، **و**قناةٌ تبلغه، **و**لم يوقف الاستقبال بنفسه.
   *
   * 🔒 ولا يُعاد اشتقاق شيء من هذا في الواجهة: تعريفان لـ«مكتمل» يفترقان يوماً،
   * فيُخفى الشريط عن شريكٍ ناقص أو يبقى على شريكٍ تامّ — وهو العطل نفسه بوجهيه.
   */
  readyToReceive: boolean;
  /**
   * تامُّ التجهيز **وأوقف الاستقبال بإرادته** (`accepting_offers = false`).
   *
   * وهذه ليست حالةَ نقصٍ فلا تُعرض قائمةَ تحقّق: لا شيء ينقصه ولا زرَّ إصلاح —
   * لكنها ليست حالةَ اكتمالٍ أيضاً، فقولُ «أنت مستقبِلٌ للعروض» لمن أوقفها بنفسه
   * كذبٌ صريح. ولذلك سطرٌ ثالثٌ هادئ يسمّي ما فعله ويدلّه على عكسه.
   */
  pausedByChoice: boolean;
  /** أُنجز كل ما عليه ولم يبقَ إلا اعتماد الإدارة */
  waitingOnAdmin: boolean;
  /** تعذّرت قراءة جدولٍ أو أكثر — الشاشة تقول ذلك بدل أن تعدّه صفراً */
  degraded: boolean;
  counts: {
    activeVehicles: number;
    totalVehicles: number;
    activeDrivers: number;
    totalDrivers: number;
    lists: Record<PriceListStatus, number>;
  };
  /** فئات مُسعَّرة في قائمة معتمَدة بلا مركبة نشطة فيها — الفخّ الصامت */
  pricedWithoutVehicle: string[];
  /** فئات فيها مركبة نشطة ولا سعر لها في أي قائمة معتمَدة — دخلٌ متروك */
  vehicleWithoutPrice: string[];
};

/* ------------------------------------------------------------------ */
/* القراءة                                                             */
/* ------------------------------------------------------------------ */

type ClassTitles = Map<string, string>;

/** عناوين الفئات العربية — الشريك يقرأ «ميني باص» لا `minibus` */
async function loadClassTitles(supabase: SupabaseClient): Promise<ClassTitles> {
  const titles: ClassTitles = new Map();
  const res = await supabase.from("vehicle_classes").select("slug, title");
  if (res.error) return titles;
  for (const row of res.data ?? []) {
    const r = row as Record<string, unknown>;
    if (typeof r.slug === "string") {
      titles.set(r.slug, typeof r.title === "string" && r.title.trim() !== "" ? r.title : r.slug);
    }
  }
  return titles;
}

const EMPTY_LISTS: Record<PriceListStatus, number> = {
  draft: 0,
  pending: 0,
  approved: 0,
  rejected: 0,
};

/**
 * القياس الكامل. مُذاكَر لكل طلب: الغلاف يقرؤه للشريط، واللوحة تقرؤه للمعالج،
 * فاستعلامٌ واحد لا اثنان.
 */
export const loadOnboarding = cache(async (): Promise<OnboardingReadiness | null> => {
  const access = await portalSetupAccess();
  if (!access.ok) return null;
  const { supabase, sub, stage } = access;

  const [vehiclesRes, driversRes, listsRes, classTitles, alerts, agreement] = await Promise.all([
    supabase
      .from("subcontractor_vehicles")
      .select("class_slug, active")
      .eq("subcontractor_id", sub.id),
    supabase.from("subcontractor_drivers").select("active").eq("subcontractor_id", sub.id),
    supabase.from("price_lists").select("id, status").eq("subcontractor_id", sub.id),
    loadClassTitles(supabase),
    // الإتاحة من قارئها الوحيد — انظر تعليق الاستيراد أعلى الملف
    loadPartnerAlerts(),
    // والاتفاقية كذلك: قارئٌ واحد مُذاكَر يخدم هذا الملف وصفحة الاتفاقية معاً
    loadPortalAgreement(),
  ]);

  // «لا نعرف» ≠ «صفر»: أي فشل قراءة يُعلَّم ويُقال، ولا يُترجَم إلى بندٍ ناقص
  const vehiclesKnown = !vehiclesRes.error;
  const driversKnown = !driversRes.error;
  const listsKnown = !listsRes.error;
  /**
   * `hidden` (قاعدةٌ قبل 0054) و`failed` (خطأ نداء) كلتاهما «لا نعرف» لا «غير
   * متصل»: وسمُ شريكٍ بالانقطاع بسبب نداءٍ فشل يرسله يطارد قناةً تعمل أصلاً.
   */
  const reachKnown = alerts.state === "ready";
  const reachable = reachKnown ? alerts.view.reachable : null;
  // الافتراض `true` هو افتراض القاعدة نفسها (`coalesce(pr.accepting_offers, true)`)،
  // فلا يُقال «أوقفتَ الاستقبال» لمن لا صفَّ تفضيلات له بعد — وهي حالة كل شريك جديد
  const willing = reachKnown ? alerts.view.willing : true;

  let activeVehicles = 0;
  let totalVehicles = 0;
  const activeVehicleClasses = new Set<string>();
  for (const row of vehiclesRes.data ?? []) {
    const r = row as Record<string, unknown>;
    totalVehicles += 1;
    if (r.active === true) {
      activeVehicles += 1;
      if (typeof r.class_slug === "string") activeVehicleClasses.add(r.class_slug);
    }
  }

  let activeDrivers = 0;
  let totalDrivers = 0;
  for (const row of driversRes.data ?? []) {
    totalDrivers += 1;
    if ((row as Record<string, unknown>).active === true) activeDrivers += 1;
  }

  const lists = { ...EMPTY_LISTS };
  const approvedListIds: string[] = [];
  for (const row of listsRes.data ?? []) {
    const r = row as Record<string, unknown>;
    const status = isPriceListStatus(r.status) ? r.status : "draft";
    lists[status] += 1;
    if (status === "approved") approvedListIds.push(String(r.id));
  }

  // الفئات المُسعَّرة في القوائم **المعتمَدة** وحدها: غيرها لا يدخل `coverage_matches`
  const pricedClasses = new Set<string>();
  let itemsKnown = true;
  if (approvedListIds.length > 0) {
    const itemsRes = await supabase
      .from("price_list_items")
      .select("class_slug")
      .in("price_list_id", approvedListIds);
    itemsKnown = !itemsRes.error;
    for (const row of itemsRes.data ?? []) {
      const slug = (row as Record<string, unknown>).class_slug;
      if (typeof slug === "string") pricedClasses.add(slug);
    }
  }

  const label = (slug: string) => classTitles.get(slug) ?? slug;
  const matchKnown = vehiclesKnown && listsKnown && itemsKnown;

  const pricedWithoutVehicle = matchKnown
    ? [...pricedClasses].filter((slug) => !activeVehicleClasses.has(slug)).map(label).sort()
    : [];
  // ⚠ يُقاس على من **يعمل فعلاً** وحده: لمن لا قائمة معتمَدة له أصلاً تكون كل فئة
  // «بلا سعر» بداهةً، فتتحول البطاقة إلى تكرارٍ لبند الأسعار بصياغة تُقلق بلا فائدة
  // — وهي حالةُ شريكٍ حيٍّ اليوم (قائمته مُرسَلة تنتظر المراجعة).
  const vehicleWithoutPrice =
    matchKnown && approvedListIds.length > 0
      ? [...activeVehicleClasses].filter((slug) => !pricedClasses.has(slug)).map(label).sort()
      : [];

  /**
   * `hidden` هنا ليست عطلاً: هي «لا إصدارَ منشور» أو «قاعدةٌ قبل 0113» ⇒ لا بندَ
   * أصلاً ولا نقصَ يُعدّ. و`failed` وحدها «لا نعرف» — فتدخل `degraded` ولا
   * تُترجَم إلى «لم يقبل».
   */
  const agreementKnown = agreement.state !== "failed";

  const degraded =
    !vehiclesKnown || !driversKnown || !listsKnown || !itemsKnown || !reachKnown || !agreementKnown;

  /* -------------------------------------------------------------- */
  /* البنود                                                          */
  /* -------------------------------------------------------------- */

  const steps: OnboardingStep[] = [];

  /*
    (٠) اتفاقية المتعهد — تتصدّر القائمة لأنها **شرطُ الأهلية نفسه** لا خطوةَ
        تجهيز: `dispatch_pool` تسقط من لم يمرّ منها (هجرة 0113)، فلا معنى لأن
        يضيف مركبةً ويسعّر مساراً وهو خارج الحوض على أي حال.

    والوزن يتبع اللحظة لا الأهمية (قاعدةُ هذا الملف):
      • قَبِل، أو الحاجزُ مطفأ من اللوحة        ⇒ `done`، ولا وسم.
      • لم يقبل وما زال في مهلته                ⇒ `deadline` بتاريخه المكتوب.
      • لم يقبل وانقضت مهلته                    ⇒ `blocking` — والعروض متوقفة فعلاً.
      • تعذّرت القراءة                          ⇒ `unknown`، ولا يُقال «لم يقبل».

    ⚠ ولا يُشتقّ شيءٌ من ذلك هنا: `ok` و`accepted` و`inGrace` تصل من
      `partner_agreement_status()` — نفسِ الدالة التي يقرؤها الحوض.
  */
  if (agreement.state !== "hidden") {
    const doc = agreement.state === "ready" ? agreement.agreement : null;
    const settled = doc?.accepted === true || (doc !== null && !doc.required);
    const state: StepState = agreement.state === "failed" ? "unknown" : settled ? "done" : "todo";
    // في المهلة ⇒ `deadline` (يعضّ بتاريخ)، وبعدها ⇒ `blocking` (يعضّ الآن)
    const weight: StepWeight = doc?.inGrace ? "deadline" : "blocking";
    const isUpdate = doc !== null && !doc.accepted && (doc.acceptedVersion ?? 0) > 0;

    steps.push({
      key: "agreement",
      title: doc ? `${doc.title} — الإصدار ${n(doc.version)}` : "اتفاقية المتعهد",
      weight,
      state,
      href: "/portal/agreement",
      cta: state === "done" ? "اقرأ الاتفاقية" : isUpdate ? "اقرأ التعديل واقبله" : "اقرأ واقبل",
      body:
        agreement.state === "failed"
          ? "تعذّرت قراءة حالة اتفاقيتك الآن، فلا نستطيع الحكم على هذا البند — حدّث الصفحة."
          : !doc
            ? "لا اتفاقية سارية الآن."
            : doc.accepted
              ? `قَبِلت الإصدار ${n(doc.acceptedVersion ?? doc.version)} في ${dateLabel(doc.acceptedAt)}. والنسخة التي قَبِلتها محفوظة بنصّها في «حسابي»، ومعها نسخةٌ تنزّلها متى شئت.`
              : !doc.required
                ? "الاتفاقية منشورة ولم يُفعَّل اشتراطها بعد — اقرأها الآن، فقبولُها سيصير شرطاً لوصول العروض."
                : doc.inGrace
                  ? `${isUpdate ? "نُشرت نسخةٌ جديدة من الاتفاقية، وقبولك السابق لا يسري عليها." : "لم تقبل اتفاقية المتعهد بعد."} عروضك تصلك كالمعتاد حتى ${dateLabel(doc.deadline)}، وبعد هذا التاريخ تتوقف حتى تقبل. اقرأها الآن ولا تتركها لآخر يوم.`
                  : "انقضت مهلة قبول الاتفاقية، والعروض متوقفة عنك الآن — لا شيء آخر يمنعك، وتعود فور قبولك. ورحلاتك المقبولة سابقاً ومستحقاتك عنها لا يمسّها هذا.",
    });
  }

  // (١) الملف — `contact` لا `blocking`: لا تذكره `dispatch_pool` بحرف، وأثره
  //     الحقيقي يقع بعد الإسناد حين تحتاج الإدارة بلوغك (ترويسة الملف)
  const hasSecondChannel = Boolean(sub.whatsapp || sub.email);
  // عمودان `not null` بقيدَي طول في القاعدة، فهذا الفرع دفاعيّ لا واقعيّ: لا يقع
  // إلا لو صار الصف فارغاً بطريقٍ لا نعرفه — ونقوله حينها بدل أن نصمت
  const hasCore = Boolean(sub.companyName && sub.phone);
  steps.push({
    key: "profile",
    title: "بيانات شركتك ووسائل التواصل",
    weight: "contact",
    state: hasCore && hasSecondChannel ? "done" : "todo",
    href: "/portal/profile",
    cta: hasCore ? "أضف قناة تواصل" : "أكمل البيانات",
    body: !hasCore
      ? "اسم الشركة ورقم الهاتف حقلان إلزاميان في «حسابي» — أكملهما كي تصل إليك الإدارة عند إسناد رحلة."
      : !hasSecondChannel
        ? "قناة واحدة تكفي لوصول العروض إليك، فلا شيء متوقف الآن بسببها. لكن أضف واتساب أو بريداً إلكترونياً كقناة ثانية: التنسيق بعد الإسناد عاجل، ولا ينتظر رداً على رقمٍ واحد لا يُجيب."
        : "مكتملة — راجعها كلما تغيّر رقم أو حساب.",
  });

  // (٢) الأسطول — و«نشطة» لا «مسجَّلة»: `dispatch_pool` تشترط `v.active` صراحةً
  steps.push({
    key: "fleet",
    title: "مركبة نشطة واحدة على الأقل",
    weight: "blocking",
    state: !vehiclesKnown ? "unknown" : activeVehicles > 0 ? "done" : "todo",
    href: "/portal/fleet",
    cta: totalVehicles > 0 ? "فعّل مركبة" : "أضف مركبة",
    body: !vehiclesKnown
      ? "تعذّرت قراءة أسطولك الآن، فلا نستطيع الحكم على هذا البند — حدّث الصفحة."
      : activeVehicles > 0
        ? `لديك ${n(activeVehicles)} مركبة نشطة. فئاتها هي التي تحدد الأسعار المطلوبة منك في القائمة.`
        : totalVehicles > 0
          ? "كل مركباتك متوقفة. المركبة المتوقفة موجودة في سجلّك ولا تُحتسب في البث — فعّل واحدة على الأقل."
          : "ابدأ بفئة المركبة التي تعمل عليها فعلاً؛ فئات أسطولك هي ما يحدد الرحلات التي تصلك.",
  });

  // (٣) قائمة أسعار — التمييز الثلاثي هنا هو كل الفائدة: مسودة ≠ مُرسَلة ≠ معتمَدة
  const listState: StepState = !listsKnown
    ? "unknown"
    : lists.approved > 0
      ? "done"
      : lists.pending > 0
        ? "waiting"
        : "todo";
  steps.push({
    key: "prices",
    title: "قائمة أسعار معتمَدة",
    weight: "blocking",
    state: listState,
    href: listState === "waiting" ? null : "/portal/prices",
    cta:
      listState === "waiting"
        ? null
        : lists.rejected > 0
          ? "عالج الملاحظة"
          : lists.draft > 0
            ? "أرسل مسودتك"
            : "أنشئ قائمة",
    body: !listsKnown
      ? "تعذّرت قراءة قوائمك الآن، فلا نستطيع الحكم على هذا البند — حدّث الصفحة."
      : lists.approved > 0
        ? `لديك ${n(lists.approved)} قائمة معتمَدة تدخل تسعير المسارات التي تغطيها.`
        : lists.pending > 0
          ? "قائمتك وصلت الإدارة وتنتظر الاعتماد — لا إجراء مطلوب منك الآن."
          : lists.rejected > 0
            ? "أُعيدت قائمتك بملاحظة من الإدارة؛ عالجها ثم أرسلها من جديد."
            : lists.draft > 0
              ? "مسودتك محفوظة عندك ولم تصل الإدارة بعد — المسودة لا تُحتسب مهما كانت دقيقة."
              : "أنشئ أول قائمة للمسار الذي تعمل عليه فعلاً. والرقم الذي تكتبه هو تكلفتك أنت للاتجاه الواحد لا سعر العميل — المنصة تضيف هامشها فوقه.",
  });

  // (٤) الفخّ الصامت — بندٌ لا يظهر إلا حين يوجد فعلاً، فالإنذار الدائم لا يُسمع
  if (pricedWithoutVehicle.length > 0) {
    steps.push({
      key: "class-gap",
      title: "فئات مُسعَّرة بلا مركبة نشطة",
      weight: "blocking",
      state: "todo",
      href: "/portal/fleet",
      cta: "أضف مركبة للفئة",
      body: `سعّرت ${pricedWithoutVehicle.join(" و")} في قائمة معتمَدة ولا مركبة نشطة لديك في هذه الفئة، والبث يشترط الاثنين معاً — فلن يصلك عرضٌ واحد عليها مهما كان سعرك مناسباً.`,
    });
  }

  /*
    (٥) القناة التي تبلغه — البند الذي يجعل الإخفاء صادقاً.

    ولماذا هو هنا لا في شاشة القنوات وحدها؟ لأن الشريط يُخفى عند الاكتمال، ومن
    فصل تليجرامه بعد أن اكتمل سيقرأ سطراً هادئاً يقول «أنت مستقبِل» ولا شيء غيره
    — والقاعدة تكون قد بدأت تقدّم غيره عليه. فالبند هو ما يُعيد الشريط.

    ولا يُذكر «صندوق البورتال» قناةً: `partner_availability` تحصر البالغ في
    (telegram · webpush · email) وتستثني `inbox` صراحةً — قُرئت حيّةً.
  */
  steps.push({
    key: "reach",
    title: "قناة تنبيه واحدة على الأقل",
    weight: "reach",
    state: !reachKnown ? "unknown" : reachable ? "done" : "todo",
    href: "/portal/notifications",
    cta: "اربط قناة",
    body: !reachKnown
      ? "تعذّرت قراءة قنواتك الآن، فلا نستطيع الحكم على هذا البند — حدّث الصفحة."
      : reachable
        ? "قناةٌ واحدة على الأقل تبلغك بالعرض، وهي التي يقرؤها التوزيع نفسه."
        : "لا قناة واحدة تستطيع أن تبلغك بعرض رحلة، فالتوزيع يقدّم عليك من يمكن بلوغه. وصندوق البورتال وحده لا يُحسب: يُسجّل ولا ينبّه، وللعرض مهلة تنتهي قبل أن تنظر.",
  });

  // (٦) السائقون — طبقةٌ ثانية: لا تمنع العرض، وتوقفك بعد أن تكون قد قبلته
  steps.push({
    key: "drivers",
    title: "سائق نشط واحد على الأقل",
    weight: "later",
    state: !driversKnown ? "unknown" : activeDrivers > 0 ? "done" : "todo",
    href: "/portal/drivers",
    cta: totalDrivers > 0 ? "فعّل سائقاً" : "أضف سائقاً",
    body: !driversKnown
      ? "تعذّرت قراءة سجلّ سائقيك الآن — حدّث الصفحة."
      : activeDrivers > 0
        ? `لديك ${n(activeDrivers)} سائق نشط، فنموذج «مركبة الرحلة وسائقها» جاهز عند أول إسناد.`
        : totalDrivers > 0
          ? "كل سائقيك متوقفون؛ نموذج تسجيل طاقم الرحلة لا يقبل إلا سائقاً نشطاً."
          : "لا يمنعك فراغ السجلّ من استقبال العروض، لكنك بعد قبول أول رحلة ستُطالَب بتسجيل سائقها ولن تجد من تختار — والدقائق حينها ثمينة.",
  });

  // (٧) دخلٌ متروك — تحسينٌ لا نقص، ولذلك `optional` ولا يدخل عدّاد «ما ينقصك»
  if (vehicleWithoutPrice.length > 0) {
    steps.push({
      key: "unpriced-classes",
      title: "فئات لديك مركباتها ولا سعر لها",
      weight: "optional",
      state: "todo",
      href: "/portal/prices",
      cta: "سعّر الفئة",
      body: `تملك مركبات نشطة من ${vehicleWithoutPrice.join(" و")} ولا سعر لها في أي قائمة معتمَدة، فرحلات هذه الفئات تمرّ بجوارك ولا تصلك.`,
    });
  }

  // (٨) اعتماد الحساب — بندٌ للمدعوّ وحده، ويقع أخيراً لأنه آخر ما يقع زمنياً
  if (stage === "onboarding") {
    steps.push({
      key: "approval",
      title: "اعتماد حسابك من الإدارة",
      weight: "blocking",
      state: "waiting",
      href: null,
      cta: null,
      body: "بيدك أن تُنهي تجهيزك الآن؛ والاعتماد قرارُ الإدارة وحدها. كلما وجدك المراجع مكتملاً كان قراره أسرع.",
    });
  }

  /**
   * الحسم في الوحدة المحيّدة لا هنا — وهو ما جعل شرطَ الإخفاء **قابلاً للقياس**
   * بلا جلسة شريك: نفس الدالة تُستدعى من `node` على أرقامٍ مقروءةٍ من القاعدة.
   * (‏`readiness-settle.ts` — والسبب الثاني: `isPromptWeight` يقرؤها المعالج أيضاً.)
   */
  const settled = settleReadiness({ stage, steps, degraded, willing });

  return {
    stage,
    sub,
    steps,
    promptLeft: settled.promptLeft,
    readyToReceive: settled.readyToReceive,
    pausedByChoice: settled.pausedByChoice,
    waitingOnAdmin: settled.waitingOnAdmin,
    degraded,
    counts: {
      activeVehicles,
      totalVehicles,
      activeDrivers,
      totalDrivers,
      lists,
    },
    pricedWithoutVehicle,
    vehicleWithoutPrice,
  };
});
