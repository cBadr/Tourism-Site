import type { ReactNode } from "react";
import Link from "next/link";
import { Ban, Clock3, Database, ServerCog } from "lucide-react";

import type { PortalGate } from "@/app/portal/_lib/session";
import { Card } from "@/components/ui/card";
import type { ContactSettings } from "@/lib/site-config";
import { ContactChannels } from "./portal-contact";
import { SubStatusBadge } from "./portal-ui";

/**
 * شاشات ما قبل الدخول إلى البورتال — تُعرض بلا قائمة تنقل إطلاقاً.
 *
 * القاعدة التي تحكمها: المتعهد الذي لا سطح عمل له يجب ألا يرى واجهة عمل يظن
 * أنها تعمل. بدل تعطيل الأزرار داخل شاشات كاملة، نستبدل البورتال كله بصفحة
 * واحدة تقول له أين هو بالضبط، وماذا ينتظر، وبمن يتصل — والإجراء الوحيد المتاح
 * هو الخروج.
 */

/**
 * حالات الشاشة الساكنة — **مشتقّةٌ طرحاً** من `PortalGate` في `_lib/session`،
 * وهو مصدر الحقيقة الوحيد لحالات البوابة.
 *
 * والطرح مقصود بذاته: الثلاث المطروحة ليست شاشة ساكنة، وكلٌّ لسببٍ مختلف —
 * `anonymous` يعيد الغلاف توجيهها إلى الدخول قبل أن تصل هنا، و`active`
 * و`onboarding` يركّبان `children` (البورتال الكامل، وسطح التجهيز).
 *
 * ⚠ **ولماذا اشتقاقاً لا اتحاداً مكتوباً باليد؟** لأن النسخة اليدوية انحرفت
 * فعلاً: بقيت تُعلن `"pending"` بعد أن حلّت `onboarding` محلّها في `PortalGate`،
 * فصار في العقد حالةٌ لا تُرسَل ولا تُصيَّر — ولم يُخفق بناءٌ واحد بسببها. الاشتقاق
 * يجعل أي حالةٍ تُضاف أو تُحذف غداً تكسر `npx tsc` هنا **قبل** أن تنحرف صامتة.
 */
export type GateState = Exclude<PortalGate["state"], "anonymous" | "active" | "onboarding">;

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

  /*
    لم يبقَ إلا `no-account` — و`env` و`schema` و`suspended` رجعت أعلاه.

    وكان هنا فرعٌ ثانٍ لـ`pending`، سقط مع سقوط الحالة نفسها: مَن صفُّه `pending`
    صار `onboarding` ولم يعد يمرّ بهذه الشاشة أصلاً، بل يُركَّب له سطح التجهيز.
    وقد بقي الفرع مكتوباً بعد ذلك بلا طريقٍ يصله — وهو ما يمنعه الاشتقاق أعلاه
    من التكرار: حذفُ حالةٍ من `PortalGate` يكسر `Exclude` فوراً.
  */
  return (
    <GateCard
      icon={<Clock3 className="size-6" />}
      title="حسابك قيد المراجعة"
      badge={<SubStatusBadge status="pending" className="mx-auto" />}
    >
      <p>
        لا يوجد ملف متعهد مرتبط بحساب دخولك بعد. إن كنت قد تلقيت دعوة للانضمام كمتعهد فأبلغ
        الإدارة بالبريد الذي سجّلت به حتى تربط حسابك بملفك.
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
