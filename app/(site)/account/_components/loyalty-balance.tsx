import { Coins, Link2, Sparkles } from "lucide-react";

import type { Tx } from "@/lib/i18n/content";
import type { LocaleFormatter } from "@/components/booking/format";
import type { MyLoyaltyState } from "../bookings/loyalty";

/**
 * بطاقة رصيد النقاط في «حجوزاتي» — الشاشة الثانية من المرحلة ١٢ب.
 *
 * العقد الملزم `lib/loyalty-types.ts`، والنوع المعروض `MyLoyaltyView` بحقوله
 * الأربعة. ومكوّن خادميّ بلا حالة عميل، كبقية هذا السطح.
 *
 * ── ولماذا هنا لا في صفحةٍ مستقلة ─────────────────────────────────────────
 * لأن العقد يسمّي هذا النوع «رصيد العميل كما يراه صاحبه **في حجوزاتي**». وهو
 * الموضع الصحيح عملياً: النقاط تُسكّ على الرحلات المكتملة (‏§٤)، فالقائمة التي
 * تحتها هي **بيان الرصيد** نفسه. وصفحةٌ مستقلة تعني رقماً بلا سياقٍ يفسّره.
 *
 * ══════════════════════════════════════════════════════════════════════════
 *  🔒 ثلاث حالاتٍ تُعرض، وأربعٌ تصمت — والصمت قرارٌ لا سهو
 * ══════════════════════════════════════════════════════════════════════════
 *
 * **تصمت**: `env` و`schema` و`failed` و`anonymous`.
 *
 * الرصيد سطحٌ **ثانوي** على شاشةٍ وظيفتها الحجوزات، وثلاثتها الأُوَل لا تعطي
 * العميل خطوةً يفعلها: بطاقةُ «تعذّر عرض رصيدك» بجوار قائمةٍ تعمل تُقلق بلا
 * فائدة، وتُوحي بخللٍ في حجوزاته وهي سليمة. و`anonymous` تصمت لأن الصفحة تقول
 * له سلفاً «سجّل دخولك» ببطاقتها الخاصة — وتكرارُها بلسانٍ ثانٍ ضجيج.
 *
 * ⚠ و`schema` ليست حالةً نظرية اليوم: **محرّك الولاء لم يُطبَّق على القاعدة
 * بعد** (قِيس حيّاً). فهذه البطاقة تُدمج وهي صامتة تماماً، ولا تنطق إلا يوم
 * تصل الهجرة. وهذا هو المقصود بالتدهور الصادق: لا وعدَ بميزةٍ قبل وجودها،
 * ولا انهيارَ صفحةٍ بسببها.
 *
 * **تُعرض** ثلاث حالات، وفصلُها هو نصّ العقد على `provenPhones`:
 *
 * | الحالة | ما تقوله |
 * |---|---|
 * | `provenPhones = null` | «لم نُثبت رقمك بعد» ← دعوةٌ للربط بالنموذج أسفل الصفحة |
 * | مُثبَت و`points = 0` | «رصيدك صفر» — رقمٌ صحيح لا مجهول (القاعدة ١٥) |
 * | مُثبَت و`points > 0` | الرصيد وما يساويه، ومتى يُستخدم |
 *
 * 🔴 **وخلطُ الأوليين هو العطب الذي تُكتب هذه البطاقة لمنعه**: صاحبُ عشرين رحلة
 * لم يربط حجزاً بمرجعه بعد **رصيده مجهول عندنا لا صفر**. وقول «رصيدك صفر» له
 * يخبره أن نظام الولاء لم يعطه شيئاً — فيصدّق، ولا يربط، فلا يرى نقاطه أبداً.
 * الجملتان مختلفتان لأن **الحالتين مختلفتان**، والفرق يعيده إلى نموذج الربط.
 */

/**
 * 🔒 ولا `phoneNorm` يُعرض ولا يُلمّح إليه — ولا حتى «هاتفك المنتهي بـ…».
 * العقد يمنع خروجه من القاعدة أصلاً (‏`LOYALTY_FORBIDDEN_COLUMNS`)، وعددُ
 * الهواتف المُثبَتة يُقرأ هنا **رايةً** («هل أثبت شيئاً؟») لا معلومةَ عرض.
 */
export function LoyaltyBalance({
  state,
  t,
  fmt,
}: {
  state: MyLoyaltyState;
  /** مترجم مساحة `pages.account` — نفس مترجم الصفحة، بلا مساحة ثانية تنحرف */
  t: Tx;
  fmt: LocaleFormatter;
}) {
  if (state.state !== "ready") return null;

  const { points, worth, currency, provenPhones } = state.view;
  const isProven = provenPhones !== null;

  /* ── (١) لا إثبات بعد — دعوةٌ للربط لا إعلانُ صفر ───────────────────── */
  if (!isProven) {
    return (
      <section
        aria-labelledby="loyalty-heading"
        className="flex flex-col gap-3 rounded-3xl border border-border bg-card p-5 text-card-foreground sm:p-6"
      >
        <h2
          id="loyalty-heading"
          className="flex items-center gap-2 text-base font-bold leading-snug"
        >
          <Sparkles className="size-5 shrink-0 text-primary" aria-hidden="true" />
          {t("loyalty.title", "نقاطك")}
        </h2>
        <p className="flex items-start gap-2 text-sm leading-7 text-muted-foreground">
          <Link2 className="mt-1 size-4 shrink-0" aria-hidden="true" />
          {t(
            "loyalty.unproven",
            "نجمع نقاطك على رقم هاتفك، ولم تُثبت رقمك عندنا بعد. أضِف أي حجز سابق برقمه ورقم هاتفك من النموذج أدناه — ويظهر رصيد كل رحلاتك بذلك الرقم دفعة واحدة."
          )}
        </p>
      </section>
    );
  }

  /* ── (٢) مُثبَت والرصيد صفر — صفرٌ صحيح يُقال كما هو ──────────────────── */
  if (points <= 0) {
    return (
      <section
        aria-labelledby="loyalty-heading"
        className="flex flex-col gap-3 rounded-3xl border border-border bg-card p-5 text-card-foreground sm:p-6"
      >
        <h2
          id="loyalty-heading"
          className="flex items-center gap-2 text-base font-bold leading-snug"
        >
          <Sparkles className="size-5 shrink-0 text-primary" aria-hidden="true" />
          {t("loyalty.title", "نقاطك")}
        </h2>
        <p className="text-sm leading-7 text-muted-foreground">
          {t(
            "loyalty.zero",
            "رصيدك صفر نقطة الآن. تُحتسب النقاط على الرحلات المنفَّذة، وتظهر هنا بعد تنفيذ رحلتك."
          )}
        </p>
      </section>
    );
  }

  /* ── (٣) رصيدٌ قائم — الرقم وما يساويه ─────────────────────────────── */
  return (
    <section
      aria-labelledby="loyalty-heading"
      className="flex flex-col gap-4 rounded-3xl border border-primary/30 bg-primary/5 p-5 text-card-foreground sm:p-6"
    >
      <h2 id="loyalty-heading" className="flex items-center gap-2 text-base font-bold leading-snug">
        <Sparkles className="size-5 shrink-0 text-primary" aria-hidden="true" />
        {t("loyalty.title", "نقاطك")}
      </h2>

      <dl className="flex flex-wrap items-end justify-between gap-x-6 gap-y-3">
        <div className="flex flex-col gap-0.5">
          <dt className="text-xs font-medium text-muted-foreground">
            {t("loyalty.pointsLabel", "الرصيد")}
          </dt>
          <dd className="flex items-baseline gap-1.5 text-2xl font-extrabold tracking-tight">
            <Coins className="size-5 shrink-0 text-primary" aria-hidden="true" />
            {t("loyalty.pointsValue", "{count} نقطة", { count: fmt.number(points) })}
          </dd>
        </div>

        {/*
          ما تساويه بالجنيه — **رقمٌ من القاعدة لا حاصلُ ضربٍ هنا** (D-05 ونصّ
          العقد على الحقل). ولذلك لا تعرف هذه الشاشة قيمة النقطة أصلاً، فلا
          موضع فيها ينحرف عن القاعدة يوم يغيّرها المالك.
        */}
        <div className="flex flex-col gap-0.5">
          <dt className="text-xs font-medium text-muted-foreground">
            {t("loyalty.worthLabel", "ما تساويه اليوم")}
          </dt>
          <dd className="text-lg font-bold text-primary">{fmt.money(worth, currency)}</dd>
        </div>
      </dl>

      {/*
        ⚠ «تُستخدم عند الحجز» وعدٌ مشروط، ويُكتب مشروطاً: السقف الحقيقي أرضيةُ
        الهامش والكوبونُ معاً (‏§١)، فقد لا تُستهلك النقاط كلها في رحلةٍ واحدة.
        «حتى» تقول ذلك بلا أن تشرح سبباً لا يخصّ العميل ولا يجوز أن يُعلَن.
      */}
      <p className="text-sm leading-7 text-muted-foreground">
        {t(
          "loyalty.spendNote",
          "تُستخدم نقاطك خصماً عند تأكيد حجزك القادم — نعرض لك قيمة الخصم قبل التأكيد."
        )}
      </p>
    </section>
  );
}
