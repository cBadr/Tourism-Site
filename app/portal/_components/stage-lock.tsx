import Link from "next/link";
import { Lock } from "lucide-react";

import { Card } from "@/components/ui/card";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/**
 * قفل الأسطح التشغيلية في مرحلة التجهيز.
 *
 * الحاجة: فتحُ الغلاف للمدعوّ يجعل `/portal/requests` و`/portal/trips` قابلتين
 * للبلوغ بالرابط المباشر ولو غاب زرّهما من التنقل. وحارسهما (`portalAccess`)
 * يرفض — فتُصيَّر الصفحة **فارغة تماماً** (`return null`)، وهي أسوأ رسالة ممكنة:
 * الشريك يقرأ الفراغ عطلاً في المنصة ويراسل الإدارة في أمرٍ لا عطل فيه.
 *
 * فالقفل يُقال صراحةً: أين هو، ولماذا، ومتى يُفتح، وما الذي ينفعه أن يفعله الآن.
 * (وهذا هو الشقّ الثاني من قاعدة «الشاشة تتبع الحارس»: ما لم يُفتح للحارس **يُعلَن
 * مقفلاً**، ولا يُترك صامتاً.)
 */
export function StageLock({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <Card className="mx-auto w-full max-w-xl items-center gap-4 p-8 text-center">
      <span className="grid size-12 place-items-center rounded-full bg-muted text-muted-foreground">
        <Lock className="size-6" aria-hidden="true" />
      </span>
      <h2 className="font-heading text-lg font-bold">{title}</h2>
      <div className="space-y-3 text-sm leading-relaxed text-muted-foreground">{children}</div>
      <Link href="/portal" className={cn(buttonVariants({ variant: "outline" }))}>
        عُد إلى تجهيز حسابك
      </Link>
    </Card>
  );
}
