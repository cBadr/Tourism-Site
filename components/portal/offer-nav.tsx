"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Inbox, Route as RouteIcon, type LucideIcon } from "lucide-react";

import { toArabicDigits } from "@/components/booking/format";
import { cn } from "@/lib/utils";

/**
 * صف تنقل العمل اليومي — «طلبات واردة» و«رحلاتي».
 *
 * لماذا صف مستقل فوق تنقل البورتال لا بند خامس داخله؟ لأن البندين الجديدين من
 * طبيعة أخرى: بقية القائمة إعداد يُنجَز مرة (الملف، الأسطول، الأسعار)، وهذان
 * تشغيل يومي يتغير محتواه في كل ساعة. تصدُّرهما يجعل أول ما تقع عليه العين هو
 * ما ينتظر قراراً، والشارة تقول عدده قبل أن يفتح المتعهد شيئاً.
 *
 * العدّ يصل محسوباً من الخادم (`countLiveOffers`)؛ لا نداء ولا مؤقّت هنا —
 * "use client" لأجل `usePathname` وحدها.
 */

type DispatchNavItem = {
  href: "/portal/requests" | "/portal/trips";
  label: string;
  icon: LucideIcon;
};

const ITEMS: DispatchNavItem[] = [
  { href: "/portal/requests", label: "طلبات واردة", icon: Inbox },
  { href: "/portal/trips", label: "رحلاتي", icon: RouteIcon },
];

export function DispatchNav({ pendingCount = 0 }: { pendingCount?: number }) {
  const pathname = usePathname();
  const count = Math.max(0, Math.round(pendingCount));

  return (
    <nav
      aria-label="طلبات المتعهد ورحلاته"
      className="-mx-1 flex gap-1 overflow-x-auto px-1 pb-0.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
    >
      {ITEMS.map((item) => {
        const Icon = item.icon;
        const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
        const showBadge = item.href === "/portal/requests" && count > 0;

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
            {showBadge ? (
              <>
                <span
                  aria-hidden="true"
                  className={cn(
                    "inline-flex min-w-5 items-center justify-center rounded-full px-1.5 py-0.5 text-xs font-bold tabular-nums",
                    active
                      ? "bg-primary-foreground/20 text-primary-foreground"
                      : "bg-amber-500 text-white"
                  )}
                >
                  {toArabicDigits(count)}
                </span>
                <span className="sr-only">
                  {count === 1
                    ? "عرض واحد بانتظار ردك"
                    : count === 2
                      ? "عرضان بانتظار ردك"
                      : `${toArabicDigits(count)} عروض بانتظار ردك`}
                </span>
              </>
            ) : null}
          </Link>
        );
      })}
    </nav>
  );
}
