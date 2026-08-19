"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
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
 * ── 🔴 ما تغيّر في 2026-08-19: سبعةُ بنود صارت خمسة ─────────────────────────
 *
 * ملاحظة المالك: «ليس لدينا user profile مناسب للمتعهد مع إمكانية إدارة حسابه من
 * خلاله … تكون إعدادات قنوات التنبيه داخل إعدادات حساب المتعهد … وأيضاً الاتفاقية
 * تكون في ملف المستخدم … بدلاً من أن تكون في الواجهة».
 *
 * وكان الشريطُ يحمل **ثلاثة** بنودٍ لإعدادات حسابٍ تُلمس مراتٍ معدودة — «ملفي»
 * و«قنوات التنبيه» و«الاتفاقية» — تزاحم الأسطولَ والسائقين والأسعار، وهي عملُ
 * الشريك اليومي. فصارت بنداً واحداً «حسابي»، وأقساماً في `/portal/profile`.
 *
 * ⚠ **ولم يُكسر رابطٌ واحد.** المسارات الثلاثة كلها ما زالت تعمل:
 *
 *   | المسار | ماذا يفعل الآن |
 *   |---|---|
 *   | `/portal/profile`      | الصفحة نفسها، بأقسامها الثلاثة |
 *   | `/portal/agreement`    | **تحويلٌ** إلى `/portal/profile#agreement` |
 *   | `/portal/notifications`| **تحويلٌ** إلى `/portal/profile#channels` (منذ 2026-08-19) |
 *
 * 🔴 و`/portal/notifications` كانت أول الأمر **باقيةً بمحرِّرها**، فصار للشيء
 * الواحد بابان — وهو ما أمر المالك بإنهائه. فانتقل المحرِّر كاملاً إلى قسم
 * `#channels` في «حسابي» (نسخةً واحدة: نفس المكوّنات ونفس الأفعال)، وبقي المسار
 * القديم **تحويلاً لا حذفاً** كي لا يموت رابطٌ محفوظٌ عند شريك.
 *
 * والقاعدة الذهبية ١٧ («ابحث عن المنادي قبل الإعلان») مصونةٌ في الاتجاهين:
 * القسمان المنزوعان من الشريط يُصيَّران بنصّهما **داخل** «حسابي» ولهما مرساتان
 * في شريط أقسامها (`#channels` · `#agreement`)، فلم يصيرا مجهولين لمن لا يعرف
 * رابطهما القديم.
 *
 * و«سائقيّ» يقع بعد «أسطولي» مباشرةً لأنهما وجها سجلٍّ واحد: المركبة ومن يقودها،
 * وهما معاً ما يُسنَد للرحلة وما يقرؤه العميل بعد الإسناد.
 */

type PortalNavItem = {
  href: "/portal" | "/portal/profile" | "/portal/fleet" | "/portal/drivers" | "/portal/prices";
  label: string;
  icon: LucideIcon;
  /**
   * مساراتٌ يُبقيها البندُ فعّالاً وهي ليست تحته في شجرة العناوين.
   *
   * 🔒 وهذا ليس تجميلاً: `/portal/notifications` **قسمٌ في «حسابي»** من وجهة نظر
   * الشريك، فلو أُطفئ البند وهو فيها لقرأ أنه خرج من حسابه — وهو أوّلُ ما يربك
   * في شريطٍ لا يحمل غير خمسة بنود.
   *
   * ⚠ **ويبقى المسارانِ هنا بعد أن صارا تحويلاً**: التحويل يقع على الخادم، وبين
   * الطلب واستجابته لحظةٌ يقرأ فيها الشريطُ المسارَ القديم. وحذفُهما يومَض
   * إطفاءةً بلا سبب، وإبقاؤهما لا يكلّف شيئاً.
   */
  alsoActive?: readonly string[];
};

const ITEMS: PortalNavItem[] = [
  { href: "/portal", label: "لوحة المتعهد", icon: LayoutDashboard },
  {
    href: "/portal/profile",
    label: "حسابي",
    icon: UserRound,
    alsoActive: ["/portal/notifications", "/portal/agreement"],
  },
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
        const onSelf =
          pathname === item.href ||
          (item.href !== "/portal" && pathname.startsWith(`${item.href}/`));
        const onSibling = (item.alsoActive ?? []).some(
          (route) => pathname === route || pathname.startsWith(`${route}/`)
        );
        const active = onSelf || onSibling;

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
