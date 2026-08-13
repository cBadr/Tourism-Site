import type { ReactNode } from "react";
import Link from "next/link";
import type { LucideIcon } from "lucide-react";

import { HelpTip } from "@/components/shared/HelpTip";
import { Card, CardToneIcon, type CardVariant } from "@/components/ui/card";
import { cn } from "@/lib/utils";

/**
 * بطاقة المؤشر الموحّدة — مكوّن واحد لكل أرقام اللوحة الكبيرة.
 *
 * **لماذا وُلد:** كان الشكل نفسه مكتوباً خمس مرات — `KpiCard` في
 * `app/admin/finance/_components/finance-ui.tsx` و`app/admin/dispatch/page.tsx`
 * و`app/admin/subcontractors/page.tsx`، و`MoneyStat` في `app/admin/page.tsx`،
 * و`StatCardTile` في `components/stats/stat-cards.tsx`. خمس نسخ انحرفت فعلاً:
 * ثلاث منها تكبّر الرقم على الجوال وواحدة لا، وثلاث تقصّ العنوان الطويل
 * وواحدة تكسر به الصف. النسخ الخمس الآن تستهلك هذا المكوّن.
 *
 * **ما لا يفعله:** لا يحسب شيئاً ولا ينسّق رقماً. `value` تصل جاهزة من مُنسّق
 * المستدعي (‏`formatMoney` · `toArabicDigits` · `formatStatValue`) — أي أن قاعدة
 * «كل حساب مالي في Postgres» لا تمرّ من هنا أصلاً.
 *
 * **النبرة اختيارية وتبقى `default`** ما لم يحمل اللون معنى تشغيلياً: رقم سالب
 * حيث يُتوقع موجب، طابور ينتظر تدخّلاً، إعداد خطر مفعَّل. الحالة الطبيعية لا
 * تُلوَّن — تلوينها يستهلك انتباه المدير في إخباره بأن كل شيء كما ينبغي.
 */
export function KpiCard({
  title,
  value,
  sub,
  icon: Icon,
  help,
  variant = "default",
  href,
  valueDir,
  className,
  valueClassName,
  subClassName,
}: {
  /** عنوان قصير — يُقصّ إن طال حتى لا يكسر صف الشبكة */
  title: string;
  /** الرقم كما يُعرض؛ «—» تعني «غير معروف» ولا تُستبدل بصفر أبداً */
  value: ReactNode;
  /** سطر الشرح تحت الرقم */
  sub?: ReactNode;
  icon?: LucideIcon;
  /** نص أيقونة «؟» — اعتبار ٧ في الرؤية */
  help?: ReactNode;
  variant?: CardVariant;
  /** حين تُمرَّر يصير كامل البطاقة رابطاً */
  href?: string;
  /** `ltr` للأرقام اللاتينية والمبالغ حتى لا تنقلب علاماتها في سياق RTL */
  valueDir?: "ltr" | "rtl";
  className?: string;
  valueClassName?: string;
  subClassName?: string;
}) {
  const body = (
    <Card
      variant={variant}
      className={cn(
        "card-enter h-full gap-1 p-4",
        href && "transition-colors hover:bg-muted",
        className
      )}
    >
      <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
        {Icon ? <Icon aria-hidden className="size-3.5 shrink-0 text-primary" /> : null}
        <span className="truncate">{title}</span>
        {help ? <HelpTip>{help}</HelpTip> : null}
        {/* الأيقونة في طرف السطر: الحالة مقروءة لمن لا يميّز الألوان */}
        <CardToneIcon variant={variant} className="ms-auto" />
      </div>
      <span
        dir={valueDir}
        className={cn("block text-start text-xl font-bold sm:text-2xl", valueClassName)}
      >
        {value}
      </span>
      {sub ? (
        <span className={cn("block text-xs leading-relaxed text-muted-foreground", subClassName)}>
          {sub}
        </span>
      ) : null}
    </Card>
  );

  return href ? (
    <Link href={href} className="block">
      {body}
    </Link>
  ) : (
    body
  );
}
