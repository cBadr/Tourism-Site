"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  BellRing,
  CarFront,
  IdCard,
  LayoutDashboard,
  ReceiptText,
  UserRound,
  type LucideIcon,
} from "lucide-react";

import { cn } from "@/lib/utils";

/**
 * تنقل البورتال — بنود الإعداد الذي يُنجَز مرة، بلا شريط جانبي وبلا بنود «قريباً».
 * المتعهد شريك يفتح أداته لينجز مهمة بعينها، لا مدير يستعرض نظاماً كاملاً؛
 * لذلك التنقل صف أفقي هادئ يعمل بنفس الشكل على الهاتف (تمرير أفقي عند الضيق).
 *
 * و«سائقيّ» يقع بعد «أسطولي» مباشرةً لأنهما وجها سجلٍّ واحد: المركبة ومن يقودها،
 * وهما معاً ما يُسنَد للرحلة وما يقرؤه العميل بعد الإسناد.
 *
 * و«قنوات التنبيه» تلي «ملفي» مباشرةً: الملف من أنت، والقنوات كيف نبلغك — وهي
 * أول ما يجب أن يجده الشريك الجديد. **وبلا هذا البند لا وجود للشاشة أصلاً** من
 * وجهة نظر من لا يعرف رابطها (القاعدة الذهبية ١٧: ابحث عن المنادي قبل الإعلان).
 */

type PortalNavItem = {
  href:
    | "/portal"
    | "/portal/profile"
    | "/portal/notifications"
    | "/portal/fleet"
    | "/portal/drivers"
    | "/portal/prices";
  label: string;
  icon: LucideIcon;
};

const ITEMS: PortalNavItem[] = [
  { href: "/portal", label: "لوحة المتعهد", icon: LayoutDashboard },
  { href: "/portal/profile", label: "ملفي", icon: UserRound },
  { href: "/portal/notifications", label: "قنوات التنبيه", icon: BellRing },
  { href: "/portal/fleet", label: "أسطولي", icon: CarFront },
  { href: "/portal/drivers", label: "سائقيّ", icon: IdCard },
  { href: "/portal/prices", label: "قوائم أسعاري", icon: ReceiptText },
];

export function PortalNav() {
  const pathname = usePathname();

  return (
    <nav
      aria-label="تنقل بورتال المتعهدين"
      className="-mx-1 flex gap-1 overflow-x-auto px-1 pb-0.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
    >
      {ITEMS.map((item) => {
        const Icon = item.icon;
        // المسارات الفرعية (محرر قائمة الأسعار مثلاً) تُبقي بند القائمة الأم فعالاً
        const active =
          pathname === item.href ||
          (item.href !== "/portal" && pathname.startsWith(`${item.href}/`));

        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={active ? "page" : undefined}
            className={cn(
              "inline-flex shrink-0 items-center gap-2 rounded-full px-3.5 py-2 text-sm font-medium transition-colors",
              active
                ? "bg-primary text-primary-foreground"
                : "text-muted-foreground hover:bg-muted hover:text-foreground"
            )}
          >
            <Icon className="size-4 shrink-0" aria-hidden="true" />
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}
