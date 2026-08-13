import type { ReactNode } from "react";
import Link from "next/link";
import { Ban, Clock3, Database, ServerCog } from "lucide-react";

import { Card } from "@/components/ui/card";
import type { ContactSettings } from "@/lib/site-config";
import { ContactChannels } from "./portal-contact";
import { SubStatusBadge } from "./portal-ui";

/**
 * شاشات ما قبل الدخول إلى البورتال — تُعرض بلا قائمة تنقل إطلاقاً.
 *
 * القاعدة التي تحكمها: المتعهد غير المعتمد يجب ألا يرى واجهة عمل يظن أنها تعمل.
 * بدل تعطيل الأزرار داخل شاشات كاملة، نستبدل البورتال كله بصفحة واحدة تقول له
 * أين هو بالضبط، وماذا ينتظر، وبمن يتصل — والإجراء الوحيد المتاح هو الخروج.
 */

export type GateState = "env" | "schema" | "no-account" | "pending" | "suspended";

function GateCard({
  icon,
  title,
  badge,
  children,
}: {
  icon: ReactNode;
  title: string;
  badge?: ReactNode;
  children: ReactNode;
}) {
  return (
    <Card className="mx-auto w-full max-w-xl items-center gap-4 p-8 text-center">
      <span className="grid size-12 place-items-center rounded-full bg-muted text-muted-foreground">
        {icon}
      </span>
      <div className="space-y-2">
        <h2 className="font-heading text-lg font-bold">{title}</h2>
        {badge}
      </div>
      <div className="space-y-4 text-sm leading-relaxed text-muted-foreground">{children}</div>
    </Card>
  );
}

export function PortalGateScreen({
  state,
  companyName,
  contact,
}: {
  state: GateState;
  companyName: string | null;
  contact: ContactSettings;
}) {
  if (state === "env") {
    return (
      <GateCard icon={<Database className="size-6" />} title="البورتال غير مربوط بقاعدة البيانات">
        <p>
          هذه نسخة تطوير محلية بلا اتصال بقاعدة البيانات، فلا يمكن التحقق من حسابك ولا عرض
          بياناتك. يعمل البورتال بمجرد ضبط متغيرات البيئة وإعادة تشغيل الخادم.
        </p>
      </GateCard>
    );
  }

  if (state === "schema") {
    return (
      <GateCard icon={<ServerCog className="size-6" />} title="البورتال قيد التجهيز">
        <p>
          جداول المتعهدين لم تُنشأ على الخادم بعد. لا شيء مطلوب منك الآن — سيصلك إشعار من
          الإدارة فور جاهزية حسابك.
        </p>
        <ContactChannels contact={contact} />
      </GateCard>
    );
  }

  if (state === "suspended") {
    return (
      <GateCard
        icon={<Ban className="size-6" />}
        title="حسابك موقوف مؤقتاً"
        badge={<SubStatusBadge status="suspended" className="mx-auto" />}
      >
        <p>
          {companyName ? `حساب «${companyName}» ` : "حسابك "}
          موقوف حالياً من الإدارة، فلا تدخل أسعارك في تسعير الرحلات ولا تصلك طلبات جديدة.
          بياناتك وأسطولك وقوائم أسعارك محفوظة كما هي وتعود فور رفع الإيقاف.
        </p>
        <p className="font-medium text-foreground">
          للاستفسار عن سبب الإيقاف تواصل مع الإدارة مباشرة:
        </p>
        <ContactChannels contact={contact} />
      </GateCard>
    );
  }

  // pending و no-account يريان الشاشة نفسها: كلاهما «لم يُعتمد بعد» من منظور المتعهد
  return (
    <GateCard
      icon={<Clock3 className="size-6" />}
      title="حسابك قيد المراجعة"
      badge={<SubStatusBadge status="pending" className="mx-auto" />}
    >
      <p>
        {state === "no-account"
          ? "لا يوجد ملف متعهد مرتبط بحساب دخولك بعد. إن كنت قد تلقيت دعوة للانضمام كمتعهد فأبلغ الإدارة بالبريد الذي سجّلت به حتى تربط حسابك بملفك."
          : "استلمت الإدارة طلب انضمامك وهو الآن قيد المراجعة. فور اعتماد حسابك تُفتح لك شاشات الملف والأسطول وقوائم الأسعار في هذه الصفحة نفسها."}
      </p>
      <p>لن تفقد شيئاً بالانتظار — لا حاجة لإعادة التسجيل ولا لفتح حساب آخر.</p>
      <ContactChannels contact={contact} />
      <p className="text-xs">
        <Link href="/" className="underline underline-offset-4 hover:text-primary">
          العودة إلى الموقع
        </Link>
      </p>
    </GateCard>
  );
}
