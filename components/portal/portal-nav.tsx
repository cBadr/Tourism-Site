"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { CarFront, LayoutDashboard, ReceiptText, UserRound, type LucideIcon } from "lucide-react";

import { cn } from "@/lib/utils";

/**
 * تنقل البورتال — أربعة بنود فقط، بلا شريط جانبي وبلا بنود «قريباً».
 * المتعهد شريك يفتح أداته لينجز مهمة بعينها، لا مدير يستعرض نظاماً كاملاً؛
 * لذلك التنقل صف أفقي هادئ يعمل بنفس الشكل على الهاتف (تمرير أفقي عند الضيق).
 */

type PortalNavItem = {
  href: "/portal" | "/portal/profile" | "/portal/fleet" | "/portal/prices";
  label: string;
  icon: LucideIcon;
};

const ITEMS: PortalNavItem[] = [
  { href: "/portal", label: "لوحة المتعهد", icon: LayoutDashboard },
  { href: "/portal/profile", label: "ملفي", icon: UserRound },
  { href: "/portal/fleet", label: "أسطولي", icon: CarFront },
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
