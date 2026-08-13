"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Banknote,
  Bell,
  Car,
  ClipboardList,
  Coins,
  CreditCard,
  FileText,
  Globe,
  Handshake,
  Languages,
  LayoutDashboard,
  Menu,
  MessageSquareQuote,
  Radio,
  Settings,
  Wallet,
  Wrench,
  X,
  type LucideIcon,
} from "lucide-react";

import { NotificationBell } from "@/components/admin/notification-bell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { cn } from "@/lib/utils";

/**
 * هيكل لوحة التحكم — RTL: الشريط الجانبي على اليمين (أول عنصر في الـ flex).
 * العناصر المؤجلة معطلة مع شارة «قريباً» ورقم مرحلتها من docs/ROADMAP.md.
 * اسم العلامة يصل prop من الـ layout الخادمي (انضباط الـ Whitelabel).
 */

type NavItem = {
  label: string;
  icon: LucideIcon;
  /** المسار — للعناصر الفعالة فقط */
  href?:
    | "/admin"
    | "/admin/content"
    | "/admin/dispatch"
    | "/admin/finance"
    | "/admin/fleet"
    | "/admin/languages"
    | "/admin/maintenance"
    | "/admin/notifications"
    | "/admin/orders"
    | "/admin/payment-accounts"
    | "/admin/payments"
    | "/admin/pricing"
    | "/admin/quote-requests"
    | "/admin/settings"
    | "/admin/subcontractors";
  /** رقم المرحلة في خارطة الطريق — للعناصر المؤجلة فقط */
  phase?: string;
};

const NAV_ITEMS: NavItem[] = [
  { label: "لوحة المعلومات", icon: LayoutDashboard, href: "/admin" },
  { label: "الطلبات", icon: ClipboardList, href: "/admin/orders" },
  { label: "طلبات الأسعار", icon: MessageSquareQuote, href: "/admin/quote-requests" },
  { label: "المحتوى", icon: FileText, href: "/admin/content" },
  // «اللغات» بعد «المحتوى» مباشرة: الترجمة تعيش على المحتوى نفسه — كل مفتاح في
  // طابورها أصله نص عربي حُرِّر في الشاشة السابقة.
  { label: "اللغات", icon: Languages, href: "/admin/languages" },
  { label: "الأسطول", icon: Car, href: "/admin/fleet" },
  { label: "التسعير", icon: Coins, href: "/admin/pricing" },
  { label: "حسابات الدفع", icon: CreditCard, href: "/admin/payment-accounts" },
  // «المدفوعات» بعد «حسابات الدفع» مباشرة: الشاشتان وجها تحصيل واحد — الحسابات
  // للتحويل اليدوي، وهذه للبوابات الإلكترونية ومطابقة جلساتها (المرحلة ٩).
  { label: "المدفوعات", icon: Banknote, href: "/admin/payments" },
  { label: "الإشعارات", icon: Bell, href: "/admin/notifications" },
  { label: "المتعهدون", icon: Handshake, href: "/admin/subcontractors" },
  // «الإسناد» بعد «المتعهدون» مباشرة: الشاشتان وجهان لعلاقة واحدة — من الشركاء،
  // ثم كيف تصل إليهم الرحلة.
  { label: "الإسناد", icon: Radio, href: "/admin/dispatch" },
  // «المالية» فُعِّلت في المرحلة ٧: الخزينة والمصروفات ومقاصة المتعهدين وكشوف
  // الحساب. البند يبقى فعالاً على مساراتها الفرعية كلها (فحص startsWith أدناه).
  { label: "المالية", icon: Wallet, href: "/admin/finance" },
  { label: "وضع الصيانة", icon: Wrench, href: "/admin/maintenance" },
  { label: "الإعدادات", icon: Settings, href: "/admin/settings" },
];

const PAGE_TITLES: Record<string, string> = {
  "/admin": "لوحة المعلومات",
  "/admin/content": "المحتوى",
  "/admin/content/new": "صفحة جديدة",
  "/admin/dispatch": "الإسناد",
  "/admin/finance": "المالية",
  "/admin/finance/expenses": "المصروفات",
  "/admin/finance/partners": "مقاصة المتعهدين",
  "/admin/finance/treasury": "الخزينة",
  "/admin/fleet": "الأسطول والتعريفة",
  "/admin/languages": "اللغات",
  "/admin/maintenance": "وضع الصيانة",
  "/admin/notifications": "الإشعارات",
  "/admin/orders": "الطلبات",
  "/admin/payment-accounts": "حسابات الدفع",
  "/admin/payments": "بوابات الدفع",
  "/admin/pricing": "التسعير",
  "/admin/quote-requests": "طلبات الأسعار",
  "/admin/settings": "الإعدادات",
  "/admin/subcontractors": "المتعهدون",
  "/admin/subcontractors/reviews": "مراجعة الأسعار",
};

function SidebarContent({
  brandName,
  pathname,
  onNavigate,
}: {
  brandName: string;
  pathname: string;
  onNavigate?: () => void;
}) {
  return (
    <>
      <div className="flex h-14 shrink-0 items-center px-4">
        <Link href="/admin" onClick={onNavigate} className="flex flex-col leading-tight">
          <span className="font-heading text-base font-bold text-primary">{brandName}</span>
          <span className="text-[11px] text-muted-foreground">لوحة التحكم</span>
        </Link>
      </div>
      <Separator />
      <nav aria-label="التنقل الرئيسي" className="flex-1 space-y-1 overflow-y-auto p-3">
        {NAV_ITEMS.map((item) => {
          const Icon = item.icon;
          if (item.href) {
            // المسارات الفرعية (محرر المحتوى مثلاً) تُبقي بند القائمة الأم فعالاً
            const active =
              pathname === item.href ||
              (item.href !== "/admin" && pathname.startsWith(`${item.href}/`));
            return (
              <Link
                key={item.label}
                href={item.href}
                onClick={onNavigate}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
                  active
                    ? "bg-primary text-primary-foreground"
                    : "text-sidebar-foreground hover:bg-muted"
                )}
              >
                <Icon className="size-4 shrink-0" />
                <span className="truncate">{item.label}</span>
              </Link>
            );
          }
          return (
            <div
              key={item.label}
              aria-disabled="true"
              title={`يُفعَّل في المرحلة ${item.phase} من خارطة الطريق`}
              className="flex cursor-not-allowed items-center gap-2.5 rounded-lg px-3 py-2 text-sm text-muted-foreground/70 select-none"
            >
              <Icon className="size-4 shrink-0 opacity-60" />
              <span className="truncate">{item.label}</span>
              <Badge
                variant="outline"
                className="ms-auto shrink-0 px-1.5 text-[10px] text-muted-foreground"
              >
                قريباً · م{item.phase}
              </Badge>
            </div>
          );
        })}
      </nav>
      <Separator />
      <div className="shrink-0 p-3">
        <Link
          href="/"
          onClick={onNavigate}
          className="flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
        >
          <Globe className="size-4 shrink-0" />
          <span>عرض الموقع العام</span>
        </Link>
      </div>
    </>
  );
}

export function AdminShell({
  brandName,
  children,
}: {
  brandName: string;
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const [open, setOpen] = React.useState(false);

  React.useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  const isLogin =
    pathname === "/admin/login" ||
    pathname.startsWith("/admin/login/") ||
    pathname === "/admin/set-password" ||
    pathname.startsWith("/admin/set-password/");

  // شاشات المصادقة (الدخول/تعيين كلمة المرور): بلا شريط جانبي — غلاف مُوسَّط بهوية العلامة فقط
  if (isLogin) {
    return (
      <div className="flex min-h-dvh flex-col items-center justify-center gap-6 bg-muted/30 px-4 py-10">
        <div className="text-center leading-tight">
          <div className="font-heading text-xl font-bold text-primary">{brandName}</div>
          <div className="mt-1 text-sm text-muted-foreground">لوحة التحكم</div>
        </div>
        {children}
        <Link
          href="/"
          className="text-sm text-muted-foreground transition-colors hover:text-primary hover:underline"
        >
          العودة إلى الموقع العام
        </Link>
      </div>
    );
  }

  // المسارات الديناميكية: محرر المحتوى وتفاصيل الطلب وملف المتعهد لها عنوان ثابت
  // مهما كان المعرّف. المسارات الثابتة تحت نفس البادئة (مثل «مراجعة الأسعار»)
  // تُلتقط قبل ذلك من PAGE_TITLES، فلا يبتلعها العنوان الديناميكي.
  const dynamicTitle = (path: string): string | null => {
    if (path.startsWith("/admin/content/")) return "محرر المحتوى";
    if (path.startsWith("/admin/finance/partners/")) return "كشف حساب متعهد";
    // /admin/languages/<code> — طابور مراجعة لغة بعينها
    if (path.startsWith("/admin/languages/")) return "مراجعة الترجمة";
    if (path.startsWith("/admin/orders/")) return "تفاصيل الطلب";
    if (path.startsWith("/admin/subcontractors/")) return "ملف المتعهد";
    return null;
  };

  const title = PAGE_TITLES[pathname] ?? dynamicTitle(pathname) ?? "لوحة التحكم";

  return (
    <div className="flex min-h-dvh bg-muted/30">
      {/* الشريط الجانبي الثابت — يمين الشاشة في RTL (أول عنصر) */}
      <aside className="sticky top-0 hidden h-dvh w-60 shrink-0 flex-col border-e border-border bg-sidebar text-sidebar-foreground lg:flex">
        <SidebarContent brandName={brandName} pathname={pathname} />
      </aside>

      {/* درج الموبايل */}
      {open && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <button
            type="button"
            aria-label="إغلاق القائمة"
            onClick={() => setOpen(false)}
            className="absolute inset-0 bg-foreground/40"
          />
          <aside className="absolute inset-y-0 start-0 flex w-64 flex-col border-e border-border bg-sidebar text-sidebar-foreground shadow-xl">
            <div className="absolute end-2 top-3">
              <Button
                variant="ghost"
                size="icon-sm"
                aria-label="إغلاق القائمة"
                onClick={() => setOpen(false)}
              >
                <X />
              </Button>
            </div>
            <SidebarContent
              brandName={brandName}
              pathname={pathname}
              onNavigate={() => setOpen(false)}
            />
          </aside>
        </div>
      )}

      <div className="flex min-w-0 flex-1 flex-col">
        {/* الشريط العلوي: زر القائمة (موبايل) + عنوان الصفحة + رابط الموقع العام */}
        <header className="sticky top-0 z-30 flex h-14 shrink-0 items-center gap-3 border-b border-border bg-background/80 px-4 backdrop-blur">
          <Button
            variant="ghost"
            size="icon"
            className="lg:hidden"
            aria-label="فتح القائمة"
            onClick={() => setOpen(true)}
          >
            <Menu />
          </Button>
          <h1 className="truncate text-sm font-semibold">{title}</h1>
          {/* جرس الإشعارات — يعمل بالبيانات الحية متى كانت قاعدة البيانات مربوطة،
              ويتحول لجرس ساكن بتلميح شارح متى لم تكن (تدهور رشيق) */}
          <div className="ms-auto flex shrink-0 items-center gap-1">
            <NotificationBell />
            <Link
              href="/"
              className="flex shrink-0 items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-primary"
            >
              <Globe className="size-4" />
              <span className="hidden sm:inline">الموقع العام</span>
            </Link>
          </div>
        </header>
        <main className="flex-1 p-4 md:p-6">{children}</main>
      </div>
    </div>
  );
}
