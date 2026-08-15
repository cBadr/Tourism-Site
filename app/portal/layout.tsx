import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Globe, LogOut } from "lucide-react";

import { DispatchNav } from "@/components/portal/offer-nav";
import { ContactLine } from "@/components/portal/portal-contact";
import { PortalGateScreen } from "@/components/portal/portal-gate";
import { PortalNav } from "@/components/portal/portal-nav";
import { Button } from "@/components/ui/button";
import { getSettings } from "@/lib/settings";
import { countLiveOffers } from "./requests/data";
import { PORTAL_LOGIN_URL, readPortalGate } from "./_lib/session";
import { signOutPortal } from "./actions";

/**
 * غلاف بورتال المتعهدين — الواجهة الثالثة إلى جانب الموقع العام ولوحة التحكم.
 *
 * الغلاف هو الحارس: يحلّ صف المتعهد من الجلسة على الخادم قبل تصيير أي صفحة،
 * ويصرف كل حالة إلى شكلها الثلاثي:
 *
 * | الحالة | ما يُركَّب |
 * |---|---|
 * | `active` | البورتال كامل — صفّا تنقل: تشغيلٌ يومي فوق إعدادٍ يُنجَز مرة |
 * | `onboarding` | **صف الإعداد وحده** + شريط يشرح المرحلة، و`children` تُركَّب |
 * | ما عداهما | `PortalGateScreen` بلا تنقل، و`children` **لا تُركَّب** |
 *
 * ولماذا `onboarding` تركّب `children` أصلاً؟ لأن RLS تسمح بعمل التجهيز كله منذ
 * `0011` بلا شرط حالة (متحقَّقٌ حياً — انظر ترويسة `PortalGate` في `_lib/session`)،
 * فإبقاء المدعوّ على شاشة انتظارٍ صامتة يعطّل عملاً تسمح به القاعدة، ويجعله يصل
 * يوم اعتماده إلى بورتالٍ فارغ يبدأ منه من الصفر.
 *
 * 🔒 **والقاعدة التي تمنع أخطر ما في هذه التوسعة: الشاشة تتبع الحارس لا العكس.**
 * `DispatchNav` (طلبات ورحلات) لا تظهر إلا لـ`active` لأن حارس أفعالها
 * (`portalAccess`) لم يُوسَّع؛ وصفحتاهما تُعلنان القفل صراحةً بدل أن تُصيَّرا
 * فارغتين. أما أسطح التجهيز فحارسها `portalSetupAccess` وقد وُسِّع معها في نفس
 * الحركة — صفحاتٍ وأفعالاً، لا صفحاتٍ وحدها.
 *
 * اسم العلامة وقنوات التواصل من `getSettings()` وحدها — لا نص علامة في الكود.
 */

export const metadata: Metadata = {
  title: "بورتال المتعهدين",
};

export default async function PortalLayout({ children }: LayoutProps<"/portal">) {
  const [settings, gate] = await Promise.all([getSettings(), readPortalGate()]);

  // بلا جلسة: إلى صفحة الدخول المشتركة، ومعها وجهة العودة إلى البورتال
  if (gate.state === "anonymous") redirect(PORTAL_LOGIN_URL);

  const sub = "sub" in gate ? gate.sub : null;
  const active = gate.state === "active";
  // الشاشات الداخلية تُركَّب للمعتمد وللمدعوّ في مرحلة التجهيز — وللأخير حارسه الخاص
  const onboarding = gate.state === "onboarding";
  // «env» وحدها بلا جلسة مؤكدة — بقية الحالات لصاحب جلسة قائمة، فيظهر له الخروج
  const signedIn = gate.state !== "env";

  // شارة «طلبات واردة»: عدّ العروض المفتوحة التي لم تنتهِ مهلتها. النداء مُذاكَر
  // لكل طلب فيتشاركه الغلاف مع صفحة الصندوق، ويعود صفراً بلا ضجيج قبل تنفيذ هجرة
  // البث — فلا يظهر عدّاد كاذب على شاشة متعهد.
  const pendingOffers = active ? await countLiveOffers() : 0;

  return (
    <div className="flex min-h-dvh flex-col bg-muted/30">
      <header className="border-b border-border bg-background">
        <div className="mx-auto w-full max-w-5xl px-4">
          <div className="flex h-14 items-center justify-between gap-3">
            <Link href="/portal" className="flex min-w-0 flex-col leading-tight">
              <span className="truncate font-heading text-base font-bold text-primary">
                {settings.brand.name}
              </span>
              <span className="text-[11px] text-muted-foreground">بورتال المتعهدين</span>
            </Link>

            <div className="flex shrink-0 items-center gap-1.5">
              {sub?.companyName ? (
                <span className="hidden max-w-48 truncate text-sm text-muted-foreground sm:inline">
                  {sub.companyName}
                </span>
              ) : null}
              <Link
                href="/"
                className="hidden items-center gap-1.5 rounded-lg px-2 py-1.5 text-sm text-muted-foreground transition-colors hover:text-primary sm:inline-flex"
              >
                <Globe className="size-4" aria-hidden="true" />
                الموقع
              </Link>
              {signedIn ? (
                <form action={signOutPortal}>
                  <Button type="submit" variant="ghost" size="sm">
                    <LogOut aria-hidden="true" />
                    خروج
                  </Button>
                </form>
              ) : null}
            </div>
          </div>

          {/*
            صفّان لا صف واحد: الأعلى تشغيل يومي يتغير محتواه كل ساعة (طلبات ورحلات)،
            والأدنى إعداد يُنجَز مرة (ملف وأسطول وأسعار). تصدُّر التشغيل يجعل أول ما
            تقع عليه العين هو ما ينتظر قراراً.
          */}
          {active ? (
            <div className="space-y-1 pb-2">
              <DispatchNav pendingCount={pendingOffers} />
              <PortalNav />
            </div>
          ) : onboarding ? (
            // صفٌّ واحد: الإعداد وحده. و`DispatchNav` غائبة لأن حارس أفعالها لم
            // يُوسَّع — رابطٌ إلى شاشة تقول «مقفل» أسوأ من غياب الرابط.
            <div className="space-y-1 pb-2">
              <PortalNav />
            </div>
          ) : null}
        </div>
      </header>

      {/*
        شريط المرحلة — يرافق **كل** صفحة تجهيز لا لوحة البداية وحدها: الشريك الذي
        يفتح «قوائم أسعاري» مباشرةً يستحق أن يعرف، وهو يكتب سعره، أن القائمة لن
        تدخل تسعيراً قبل اعتماد حسابه. وغيابه عن الشاشات الداخلية كان سيُنتج وعداً
        ضمنياً بأثرٍ لا يقع (النمط ٢ في `LESSONS.md`).
      */}
      {onboarding ? (
        <div className="border-b border-amber-300 bg-amber-100 dark:border-amber-800 dark:bg-amber-950">
          <p className="mx-auto w-full max-w-5xl px-4 py-2.5 text-xs leading-5 text-amber-900 dark:text-amber-100">
            <span className="font-semibold">حسابك قيد المراجعة.</span> جهّز ملفك وأسطولك وسائقيك
            وأسعارك من الآن — كل ما تحفظه محفوظ ويبدأ العمل لحظة الاعتماد. وحتى ذلك الحين لا
            تدخل قوائمك التسعير ولا تصلك عروض رحلات.
          </p>
        </div>
      ) : null}

      <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-6">
        {/* الشرط مكتوب على `gate.state` لا على متغيّر منطقي كي يُضيّق TypeScript
            الاتحاد فعلاً: `PortalGateScreen` لا تقبل إلا حالات الشاشة الساكنة. */}
        {gate.state === "active" || gate.state === "onboarding" ? (
          children
        ) : (
          <PortalGateScreen
            state={gate.state}
            companyName={sub?.companyName ?? null}
            contact={settings.contact}
          />
        )}
      </main>

      <footer className="border-t border-border bg-background">
        <div className="mx-auto flex w-full max-w-5xl flex-wrap items-center justify-between gap-x-4 gap-y-2 px-4 py-4 text-xs text-muted-foreground">
          <span>
            بورتال شركاء {settings.brand.name} — بياناتك وأسعارك مرئية لك وللإدارة وحدكما.
          </span>
          <ContactLine contact={settings.contact} />
        </div>
      </footer>
    </div>
  );
}
