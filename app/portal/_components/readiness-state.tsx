import Link from "next/link";
import { ArrowLeft, BellOff, ShieldCheck } from "lucide-react";

import { dateLabel, SubStatusBadge } from "@/components/portal/portal-ui";
import { buttonVariants } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import type { OnboardingReadiness } from "../_lib/onboarding";

/**
 * بطاقة «حالة الحساب» للشريك المعتمَد — **والموضع الوحيد** الذي يقول له إن كان
 * يستقبل عروضاً الآن أم لا.
 *
 * ── لماذا وُجدت أصلاً ───────────────────────────────────────────────────────
 *
 * لأن معالج التجهيز صار يُخفى عند الاكتمال (شكوى المالك: «جاهزيتك لاستقبال
 * العروض» تبقى بعد إكمال المتطلبات)، والفراغ ليس جواباً: منصةٌ لا حجوزات فيها بعد
 * + غيابُ أي حالة = شريكٌ يظنّ أن شيئاً معطوب. فالإخفاء **استبدالٌ لا حذف**:
 * قائمةُ الصحّ المشطوبة تذهب، ويبقى سطرٌ واحد هادئ يقول ما وقع.
 *
 * ── ولماذا هي هذه البطاقة نفسها لا بطاقةٌ جديدة إلى جانبها ──────────────────
 *
 * كانت البطاقة موجودة أصلاً بجملةٍ **غير مقيسة**: «قوائم أسعارك المعتمدة تدخل
 * تسعير الرحلات… وتصلك عروض تلك الرحلات في صندوق الطلبات» — تُطبع لكل معتمَد،
 * حتى من لا مركبةَ نشطة له ولا قناةَ تبلغه. أي أنها كانت تعِد بأثرٍ لا يقع (النمط
 * ٢ في `LESSONS.md`)، وكانت تعِد به **تحت** معالجٍ يقول العكس في نفس الصفحة.
 *
 * فبطاقةٌ ثانيةٌ خضراء إلى جانبها كانت ستُنتج ثلاث جهاتٍ تتحدث عن حالةٍ واحدة.
 * والحلّ: جهةٌ واحدة، جملتُها **مقيسة** من نفس `readyToReceive`.
 *
 * ── الحالات الثلاث، وكلها من `OnboardingReadiness` بلا اشتقاق ───────────────
 *
 * | الحالة | ما يُقال | ولماذا لا يُقال غيره |
 * |---|---|---|
 * | `ready` | تم التجهيز، وأنت مستقبِل | ولا قائمةَ تحقّق: لا شيء يُطالَب به |
 * | `paused` | أوقفتَ الاستقبال بنفسك | ليس نقصاً فلا إنذار، وليس اكتمالاً فلا «مستقبِل» |
 * | ناقص | ما يمنع الوصول معروضٌ في المعالج أعلاه | ولا وعدَ وصولٍ هنا — المعالج هو صاحب التفصيل |
 *
 * والنصوص تتبع نمط المالك الدائم (2026-08-17): ما وقع ⇒ «تم + مصدر» (تم
 * التجهيز · تم الاعتماد)، وما أوقفه هو ⇒ فعلُه بلفظه كما في شاشة القنوات
 * («أوقفتَ استقبال الطلبات») — لا صفةٌ ولا اسمٌ مفرد.
 *
 * ولا نصَّ من ملفَّي الترجمة هنا ولا مفتاحَ جديداً فيهما: بورتال المتعهدين عربيٌّ
 * مثبَّت في الشِّفرة (لا `portal` في `messages/*.json` — مقيسٌ)، فما يُكتب هنا لا
 * يمسّ حصيلة الترجمة بحرف.
 */
export function ReadinessStateCard({
  data,
  debtBlocked,
}: {
  data: OnboardingReadiness;
  /** من `portal_balance().blocked` — شرطٌ ماليٌّ خارج قياس التجهيز */
  debtBlocked: boolean;
}) {
  const { sub } = data;
  const ready = data.readyToReceive && !debtBlocked;
  const paused = data.pausedByChoice && !debtBlocked;

  return (
    <Card className="gap-3 p-5">
      <div className="flex flex-wrap items-center gap-2">
        {paused ? (
          <BellOff className="size-5 shrink-0 text-amber-600 dark:text-amber-400" aria-hidden="true" />
        ) : (
          <ShieldCheck
            className="size-5 shrink-0 text-emerald-600 dark:text-emerald-400"
            aria-hidden="true"
          />
        )}
        <span className="font-heading text-base font-bold">حالة الحساب</span>
        <SubStatusBadge status={sub.status} />
        {sub.createdAt ? (
          <span className="ms-auto text-xs text-muted-foreground">
            شريك منذ {dateLabel(sub.createdAt)}
          </span>
        ) : null}
      </div>

      <p className="text-sm leading-relaxed text-muted-foreground">
        {ready ? (
          <>
            تم تجهيز حسابك، وأنت مستقبِلٌ لعروض الرحلات: قوائمك المعتمَدة تدخل تسعير المسارات التي
            تغطيها، ولديك مركبة نشطة في كل فئة سعّرتها، وقناةُ تنبيهك تعمل. أبقِ بياناتك محدّثة
            ليبقى الوصول متصلاً.
          </>
        ) : paused ? (
          <>
            تم تجهيز حسابك، لكنك أوقفتَ استقبال الطلبات بنفسك — فلا يصلك عرض جديد. أعد العلامة في
            «أستقبل طلبات الرحلات» ليعود الوصول فوراً.
          </>
        ) : (
          <>
            حسابك معتمد. وما يمنع وصول العروض إليك الآن معروضٌ في «جاهزيتك لاستقبال العروض» أعلى
            الصفحة — ولا يبدأ الوصول قبل أن يُعالَج.
          </>
        )}
      </p>

      {/*
        زرٌّ واحد بحسب الحالة، ولا زرَّ في الحالة الناقصة: أزرار الإصلاح كلها في
        المعالج أعلاه بأسمائها، وزرٌّ عامٌّ هنا كان سيُنافسها بلا أن يقول ماذا يفعل.
      */}
      {ready ? (
        <div>
          <Link href="/portal/requests" className={cn(buttonVariants())}>
            افتح صندوق الطلبات
            <ArrowLeft aria-hidden="true" />
          </Link>
        </div>
      ) : paused ? (
        <div>
          <Link
            href="/portal/profile#channels"
            className={cn(buttonVariants({ variant: "outline", size: "sm" }))}
          >
            أعد استقبال الطلبات
            <ArrowLeft aria-hidden="true" />
          </Link>
        </div>
      ) : null}
    </Card>
  );
}
