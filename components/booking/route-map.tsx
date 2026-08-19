import { ExternalLink, Info, Route as RouteIcon, Wallet } from "lucide-react";

import { PRINT_HIDDEN_CLASS } from "@/lib/export-types";
import type { Tx } from "@/lib/i18n/content";
import type { RouteGeometrySource } from "@/lib/maps/static-map";

/**
 * ══════════════════════════════════════════════════════════════════════════════
 *  خريطة المسار على صفحة متابعة الحجز — حالتان لمكانٍ واحد
 * ══════════════════════════════════════════════════════════════════════════════
 *
 * | حالة الحجز | ما يُصيَّر هنا |
 * |---|---|
 * | قبل التأكيد | `RoutePendingPanel` — يقول لماذا لا خريطة بعد، ويدلّ على الدفع |
 * | بعد التأكيد | `RouteMapFigure` — صورةٌ ثابتة مخزَّنة، بنصٍّ بديلٍ عربي |
 *
 * 🔴 **والزناد هو التأكيد لا «المدفوع بالكامل».** العربون يؤكّد الحجز ويُطلق
 * البثّ، ويبقى `amount_remaining > 0` عليه (المتبقي نقداً مع السائق). فلوحةُ
 * «غير مدفوع» على حجزٍ بعربونٍ مدفوع كانت ستنتج مكالمةً هاتفية لا دفعة. القرار
 * ومصدره في `lib/maps/route-map.ts` وفي ترويسة الهجرة `0078`.
 *
 * ── ⚠ صدق الرسالة قبل أثرها ─────────────────────────────────────────────────
 *
 * الجملة صادقة لأن الواقع كذلك: `start_dispatch` ترفض كل حالةٍ غير `confirmed`
 * نصّاً، فالرحلة **فعلاً** لا تُرسَل إلى التنفيذ قبل التأكيد. ولذلك:
 *
 *   • **لا عدّاد هنا ولا ندرة ولا «باقٍ ٣ أماكن»** — ولا أي ادّعاء لا تفرضه
 *     القاعدة. (وعدّاد المهلة القائم في بطاقة الدفع شيءٌ آخر: مصدره
 *     `booking_hold_until` وهو موعد كنسٍ حقيقي.)
 *   • **ولا وعدَ زمنٍ**: لا «خلال دقائق» ولا «فوراً» — التأكيد يمرّ بمراجعة
 *     بشرية في مسار التحويل اليدوي، ونحن لا نضمن مدّتها.
 *
 * ── والحركة: لمسةٌ واحدة تقف ─────────────────────────────────────────────────
 *
 * الصفحة تُفتح مراراً على الهاتف من شخصٍ يتابع حجزه، والحركة الدائمة هناك
 * إزعاجٌ لا حياة. فالخط يُرسم **مرةً** ثم يسكن، وكل تعريفٍ داخل
 * `prefers-reduced-motion: no-preference` — فمن طلب تقليل الحركة **لا يصله
 * تعريفٌ أصلاً** (نفس بنية `MOTION_CSS` في الصفحة). وحالته الصامدة هي نهاية
 * الحركة نفسها: خطٌّ مرسومٌ كامل — **لا رسالةٌ محذوفة ولا عنصرٌ عالقٌ خفيّاً**.
 *
 * ── والفعل زرٌّ لا إيماءة ────────────────────────────────────────────────────
 *
 * الرابط ينزل إلى بطاقة الدفع في الصفحة نفسها (`#pay`)، ويعمل بلا JavaScript
 * وبلوحة المفاتيح. وهو **مقصورٌ على «بانتظار الدفع»**: على حجزٍ قيد المراجعة
 * لا شيء يُدفع، فزرُّ دفعٍ هناك يطلب من العميل أن يدفع مرتين.
 */

/** مرساة بطاقة الدفع في `app/(site)/booking/[token]/page.tsx` — تُكتب مرة */
export const PAY_SECTION_ANCHOR = "pay";

const MOTION_CSS = `
@media (prefers-reduced-motion: no-preference) {
  /* رسمُ الخط مرةً واحدة ثم سكون. و\`both\` تُثبّت النهاية: خطٌّ كامل —
     وهي نفسها الحالة التي يراها من لا حركة عنده، ومن عطّل CSS أصلاً. */
  @keyframes bk-map-draw {
    from { stroke-dashoffset: 220; }
    to   { stroke-dashoffset: 0; }
  }
  .bk-map-line { animation: bk-map-draw 1100ms cubic-bezier(0.3, 0.7, 0.4, 1) both; }
}
`;

/**
 * رسمٌ تخطيطي — **ليس خريطة ولا يدّعي أنها**: نقطتان وخطٌّ بينهما بلون العلامة.
 * `aria-hidden` لأن الخبر كلّه في النصّ المجاور، وقارئ الشاشة لا يستفيد من زخرفة.
 */
function RouteSketch() {
  return (
    <svg
      viewBox="0 0 240 72"
      aria-hidden="true"
      className="h-16 w-full text-primary/70"
      preserveAspectRatio="xMidYMid meet"
    >
      <path
        d="M28 52 C 88 8, 152 8, 212 52"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeDasharray="6 7"
        className="bk-map-line"
        pathLength={220}
      />
      <circle cx="28" cy="52" r="6.5" fill="currentColor" />
      <circle cx="212" cy="52" r="6.5" fill="none" stroke="currentColor" strokeWidth="2.5" />
    </svg>
  );
}

export function RoutePendingPanel({
  awaitingPayment,
  t,
}: {
  /** `true` عند «بانتظار الدفع» وحدها — لا عند «قيد المراجعة» */
  awaitingPayment: boolean;
  t: Tx;
}) {
  return (
    <section
      aria-label={t("trip.map.pendingLabel", "مسار الرحلة")}
      className="flex flex-col gap-4 rounded-2xl border border-primary/25 bg-primary/5 px-4 py-4 sm:px-5"
    >
      <style>{MOTION_CSS}</style>

      <RouteSketch />

      <div className="flex flex-col gap-1.5">
        <h3 className="flex items-center gap-2 text-sm font-bold">
          <RouteIcon className="size-4 shrink-0 text-primary" aria-hidden="true" />
          {t("trip.map.pendingTitle", "مسارك يُرسم بعد تأكيد الحجز")}
        </h3>
        <p className="text-sm leading-7 text-muted-foreground">
          {awaitingPayment
            ? t(
                "trip.map.pendingText",
                "لا نبدأ تجهيز رحلتك ولا نرسلها للتنفيذ قبل تأكيد الحجز — والتأكيد يقع بوصول دفعتك، كاملةً كانت أم عربوناً. وعندها تجد خريطة مسارك هنا."
              )
            : t(
                "trip.map.reviewText",
                "وصلنا إيصالك ويراجعه فريق التشغيل الآن. فور اعتماده يتأكد حجزك ويبدأ تجهيز رحلتك، وتجد خريطة مسارك هنا — لا خطوة مطلوبة منك."
              )}
        </p>
      </div>

      {awaitingPayment ? (
        <a
          href={`#${PAY_SECTION_ANCHOR}`}
          className={`${PRINT_HIDDEN_CLASS} inline-flex h-11 w-fit items-center justify-center gap-2 rounded-2xl bg-primary px-5 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50`}
        >
          <Wallet className="size-4 shrink-0" aria-hidden="true" />
          {t("trip.map.payCta", "أكمل الدفع الآن")}
        </a>
      ) : null}
    </section>
  );
}

/**
 * الصورة المخزَّنة.
 *
 * ⚠ **`<img>` عاري لا `next/image`**: المصدر نقطةُ نهايةٍ خاصةٌ بتوكن، ومحسّن
 * الصور كان سيضعها في كاشٍ مشترك على القرص بمفتاحٍ مشتقّ من العنوان — أي نسخةً
 * ثانية من صورةٍ خاصة خارج الدلو الخاص. والصورة مقاسها معروفٌ ولا تحتاج تحجيماً.
 *
 * ⚠ **و`loading="lazy"` عمداً**: الخريطة أسفل الصفحة، والصفحة تُفتح على شبكة
 * الهاتف — فلا تُحمَّل قبل أن تُرى.
 *
 * ══ 🔴 والنصُّ يتبع الصورة، لا العكس ═══════════════════════════════════════
 *
 * `geometrySource` مقروءٌ من الصفّ (‏0079): الخط إمّا **مسار قيادة حقيقي**
 * وإمّا **مستقيمٌ بين نقطتين** حين يسقط مزوّد الهندسة. ونصٌّ واحد للحالتين
 * يكذب في إحداهما — ومستقيمٌ يعبر النيل أو الصحراء **يوحي بمسافة لم نُسعّرها**،
 * وهي ملاحظة المالك (2026-08-17) بعينها.
 *
 * ══ ولا حرفا A و B ═════════════════════════════════════════════════════════
 *
 * وسمُ العلامة في واجهة الخرائط الثابتة **محرفٌ لاتينيٌّ واحد** — لا يقبل
 * «نقطة الانطلاق» بحال. فالتفريق على الصورة باللون، والأسماء العربية في
 * **مفتاحٍ تحتها** حيث تُقرأ فعلاً وتصل قارئ الشاشة. وحرفٌ أعجميٌّ على خريطةٍ
 * يقرؤها عميلٌ عربي لا يقول له شيئاً (ملاحظة المالك ١).
 *
 * ══ ورابط خرائط جوجل — مجاناً وبلا API ══════════════════════════════════════
 *
 * عنوانٌ عام موثَّق بلا مفتاح وبلا فاتورة، يفتح تطبيق الخرائط على جهاز العميل
 * بالمرور الحيّ والاتجاهات — وهي أشياء لا تعطيها صورةٌ ثابتة. وبالإحداثيات لا
 * بأسماء الأماكن، فلا ينزلق الرابط إلى مكانٍ آخر يحمل الاسم نفسه.
 * وهو `no-print`: رابطٌ لا يُضغط على ورق.
 *
 * ══ 🔴 والمحطات الوسطى: الصورةُ لا تمرّ بها، **فلا تُصوَّر كأنها تمرّ** ══════
 *
 * الصورة المخزَّنة تُولَّد من **نقطتين** (‏`lib/maps/route-map.ts`)، ولم تُوسَّع
 * بعد لتمرّ بالمحطات. وحين تحمل الرحلة محطاتٍ يصير الخط المرسوم **أقصر من
 * الطريق المُسعَّر** — والعميل يقارن ما يراه بما دفعه.
 *
 * فالجواب هنا **قولُ الحقيقة لا إخفاء الصورة**: الصورة تبقى (فيها موقعاه
 * ونطاقُ رحلته، وهي أنفع من فراغ)، **وتحتها حاشيةٌ تقول إنها لا تمرّ بالمحطات
 * وإن المسافة المحسوبة تشملها**. والنصُّ البديل يُصحَّح معها — قارئُ الشاشة
 * كان سيسمع «مسار القيادة بينهما» عن صورةٍ تصف نصف الرحلة.
 *
 * ⚠ **ولا يُدَّعى مسارٌ لم يُحسب**: لا خطَّ مكسورٌ يُرسم في المتصفح فوق الصورة،
 * ولا نداءَ مزوّدٍ من هذه الصفحة. رسمُ مسارٍ يمرّ بالمحطات عملُ من يملك
 * `lib/maps/**`، وهو **بندٌ مفتوحٌ معلَنٌ في تقرير هذه الدفعة** لا فراغٌ صامت.
 */
export function RouteMapFigure({
  src,
  originLabel,
  destLabel,
  geometrySource,
  directionsUrl,
  hasStops = false,
  t,
}: {
  src: string;
  originLabel: string;
  destLabel: string;
  geometrySource: RouteGeometrySource;
  /** رابط خرائط جوجل العادي — `null` حين لا إحداثيات صالحة في اللقطة */
  directionsUrl: string | null;
  /**
   * للرحلة محطاتٌ وسطى — والصورةُ المخزَّنة لا تمرّ بها. غيابُه `false`، أي
   * سلوكُ اليوم حرفياً لكل حجزٍ بنقطتين.
   */
  hasStops?: boolean;
  t: Tx;
}) {
  const road = geometrySource !== "straight";

  /**
   * 🔴 **والمحطات تسبق `road` في اختيار النصّ البديل.**
   *
   * ⚠ وهذا النصّ **انقلب معناه** في 2026-08-20: كان يقول «ولا تُظهر محطات
   * الطريق» لأن طبقة الخرائط كانت تجهلها، فصار كذباً حين صارت الصورة ترسم
   * المسار عبرها وتضع لكلٍّ علامةً مرقَّمة. والدرس أن **نصّاً بديلاً يصف نقصاً
   * يجب أن يُراجَع يومَ يُسدّ النقص** — وإلا وصف لمن لا يرى الصورة صورةً أخرى.
   */
  const alt =
    originLabel && destLabel
      ? hasStops
        ? t(
            "trip.map.altStops",
            "خريطة تُظهر مسار القيادة من نقطة الانطلاق ({origin}) إلى نقطة الوصول ({dest}) مروراً بمحطات الطريق، وعلى كل محطة رقمُها في ترتيب الرحلة.",
            { origin: originLabel, dest: destLabel }
          )
        : t(
            road ? "trip.map.altRoad" : "trip.map.altStraight",
            road
              ? "خريطة تُظهر نقطة الانطلاق ({origin}) ونقطة الوصول ({dest}) ومسار القيادة بينهما."
              : "خريطة تُظهر نقطة الانطلاق ({origin}) ونقطة الوصول ({dest}) وخطاً تقريبياً بينهما.",
            { origin: originLabel, dest: destLabel }
          )
      : t("trip.map.altPlain", "خريطة تُظهر نقطة الانطلاق ونقطة الوصول والمسار بينهما.");

  return (
    <figure className="flex flex-col gap-2.5 print:break-inside-avoid">
      <div className="overflow-hidden rounded-2xl border border-border bg-muted/40">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={src}
          alt={alt}
          width={1280}
          height={720}
          loading="lazy"
          decoding="async"
          className="block h-auto w-full"
        />
      </div>

      {/* مفتاح الخريطة — الأسماء بالعربية حيث تُقرأ، لا حرفاً على الصورة */}
      <ul className="flex flex-wrap items-center gap-x-5 gap-y-1.5 text-xs">
        <li className="flex items-center gap-1.5">
          <span
            aria-hidden="true"
            className="size-2.5 shrink-0 rounded-full bg-[#2563eb] ring-2 ring-[#2563eb]/25"
          />
          <span className="font-medium">{t("trip.map.legendOrigin", "نقطة الانطلاق")}</span>
        </li>
        <li className="flex items-center gap-1.5">
          <span
            aria-hidden="true"
            className="size-2.5 shrink-0 rounded-full bg-[#16a34a] ring-2 ring-[#16a34a]/25"
          />
          <span className="font-medium">{t("trip.map.legendDest", "نقطة الوصول")}</span>
        </li>
        {/*
         * المحطاتُ بندٌ ثالثٌ **مشروط**: مفتاحٌ يذكر لوناً لا وجودَ له على الصورة
         * يجعل القارئ يبحث عمّا ليس هناك. ونصُّه يقول **الترقيم** لا اللون وحده،
         * فالعلامةُ الكهرمانية تحمل رقمَ المحطة وقارئُ الشاشة لا يبلغه من الصورة.
         */}
        {hasStops ? (
          <li className="flex items-center gap-1.5">
            <span
              aria-hidden="true"
              className="size-2.5 shrink-0 rounded-full bg-[#d97706] ring-2 ring-[#d97706]/25"
            />
            <span className="font-medium">
              {t("trip.map.legendStops", "محطات الطريق — مرقَّمة بترتيب الرحلة")}
            </span>
          </li>
        ) : null}
      </ul>

      {directionsUrl ? (
        <a
          href={directionsUrl}
          target="_blank"
          rel="noopener noreferrer"
          className={`${PRINT_HIDDEN_CLASS} inline-flex h-10 w-fit items-center justify-center gap-2 rounded-2xl border border-border bg-background px-4 text-sm font-medium transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50`}
        >
          <ExternalLink className="size-4 shrink-0" aria-hidden="true" />
          {t("trip.map.openInMaps", "افتح المسار في خرائط جوجل")}
        </a>
      ) : null}

      {/*
        🔴 لا تُكتب هذه الجملة إلا حين يكون الخط مستقيماً فعلاً. وحين يكون
        مسارَ قيادةٍ حقيقياً لا حاشية أصلاً: الصورة تقول نفسها، وحاشيةٌ تعتذر
        عمّا لم يقع تُضعف الثقة بلا سبب.

        🔴 **وحاشيةُ المحطات تسبقهما وتُغنيهما**: حين تكون للرحلة محطات فالنقص
        الذي يجب أن يُقال ليس «مستقيمٌ أم طريق» بل **«لا تمرّ بمحطاتك»** —
        وهو أكبر، ويشمل الحالتين. وحاشيتان معاً تُشوّشان بدل أن تُوضّحا.
      */}
      {hasStops ? (
        <figcaption className="flex items-start gap-2 text-xs leading-6 text-muted-foreground">
          <Info className="mt-1 size-3.5 shrink-0 text-primary" aria-hidden="true" />
          <span>
            {t(
              "trip.map.captionStops",
              "الخريطة أعلاه ترسم نقطة الانطلاق ونقطة الوصول فقط ولا تمرّ بمحطات الطريق — أما المسافة والسعر في تفاصيل رحلتك فمحسوبان على الطريق كاملاً مروراً بالمحطات."
            )}
          </span>
        </figcaption>
      ) : road ? null : (
        <figcaption className="flex items-start gap-2 text-xs leading-6 text-muted-foreground">
          <Info className="mt-1 size-3.5 shrink-0 text-primary" aria-hidden="true" />
          <span>
            {t(
              "trip.map.captionStraight",
              "تعذّر رسم مسار القيادة الآن، فالخط تقريبي بين النقطتين — والمسافة المحسوبة في تفاصيل رحلتك مسافة طريق لا خط مستقيم."
            )}
          </span>
        </figcaption>
      )}
    </figure>
  );
}
