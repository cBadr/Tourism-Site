"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  AlertTriangle,
  Banknote,
  BarChart3,
  Bell,
  Car,
  ChevronDown,
  ClipboardList,
  Coins,
  ConciergeBell,
  CreditCard,
  FileText,
  Globe,
  Handshake,
  Languages,
  LayoutDashboard,
  MapPin,
  Menu,
  MessageSquareQuote,
  Plug,
  Radio,
  FileSignature,
  ScrollText,
  Search,
  Settings,
  Sparkles,
  TicketPercent,
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
 *
 * ── تجميع القائمة (قرار بدر 2026-08-17) ────────────────────────────────────
 * ٢٣ بنداً مسطّحاً صارت بندين متصدّرين + خمس مجموعات قابلة للطيّ. وثلاث قواعد
 * تحكم السلوك، وكسر أيٍّ منها يجعل التجميع أسوأ من القائمة المسطّحة التي حلّ محلها:
 *
 * (١) **الافتراضي: الكل مفتوح.** شريطٌ يخفي نصف بنوده عند أول فتح يُخفي شاشات
 *     لا يعرف المالك أنها موجودة أصلاً.
 * (٢) **الطيّ يُحفظ على الجهاز** (`localStorage`) — تفضيل عرضٍ لا بيانات، فلا
 *     يستحق عموداً في القاعدة ولا يُزامَن بين الأجهزة.
 * (٣) **المجموعة التي تحوي الصفحة الحالية تُفتح تلقائياً** ولو طواها المالك.
 *
 * ── تمييز العنوان عن الوجهة (ملاحظة بدر بعد أول نظرة) ──────────────────────
 * البنية كانت صحيحة والعين تقرأ ٢٣ سطراً لا خمسة أقسام. والعلاج **بلا زخرفة
 * ولا خطوط فاصلة** — أربعة فروق تتراكم:
 *
 * (أ) **الوجهات تُزاح للداخل والعناوين تبقى خارجها** (`ps-3` على كل حاوية
 *     روابط). الإزاحة أقوى إشارة احتواءٍ في الواجهات، وكلفتها صفر.
 * (ب) **فراغ فوق العنوان أكبر بخمسة أضعاف من الفراغ بين روابطه** (`mt-5`
 *     مقابل `space-y-1`) — التقارب يجمع أكثر مما يجمع أي إطار.
 * (ج) **حجمٌ ولونٌ أخفت**: ١١px بلون `muted-foreground` مقابل ١٤px بلون النص
 *     الكامل، وبلا أيقونة تتصدّره — فليس له عمود الأيقونات الذي للوجهات.
 * (د) **لا حبّة تمرير للعنوان**: الرابط يُضاء بخلفيةٍ كاملة لأنه يذهب بك إلى
 *     مكان، والعنوان يغيّر لونه فقط — لأنه لا يذهب بك إلى شيء.
 *
 * ⚠ ولا تباعد حروف ولا «uppercase» على العربية: تباعد الحروف يفكّ اتصال
 * الكلمة الموصولة، والعربية بلا حالة أحرف أصلاً.
 */

type NavItem = {
  label: string;
  icon: LucideIcon;
  /** المسار — للعناصر الفعالة فقط */
  href?:
    | "/admin"
    | "/admin/content"
    | "/admin/discounts"
    | "/admin/dispatch"
    | "/admin/extras"
    | "/admin/failure-reasons"
    | "/admin/finance"
    | "/admin/fleet"
    | "/admin/integrations"
    | "/admin/languages"
    | "/admin/logs"
    | "/admin/loyalty"
    | "/admin/maintenance"
    | "/admin/notifications"
    | "/admin/partner-agreement"
    | "/admin/orders"
    | "/admin/payment-accounts"
    | "/admin/payments"
    | "/admin/place-search"
    | "/admin/pricing"
    | "/admin/quote-requests"
    | "/admin/seo"
    | "/admin/settings"
    | "/admin/stats"
    | "/admin/subcontractors";
  /** رقم المرحلة في خارطة الطريق — للعناصر المؤجلة فقط */
  phase?: string;
};

/**
 * مجموعة قابلة للطيّ في القائمة الجانبية.
 *
 * `id` **إنجليزي وثابت** لأنه مفتاح الحفظ في `localStorage`: تغيير العنوان
 * العربي غداً يجب ألا يُفقد المالك حالة الطيّ التي ضبطها على جهازه.
 */
type NavGroup = {
  id: string;
  label: string;
  items: NavItem[];
};

/**
 * بندان بلا مجموعة يتصدّران القائمة: هما ما يُفتح كل صباح، فوضعهما خلف عنوانٍ
 * قابل للطيّ يضع نقرةً زائدة أمام أكثر شاشتين استعمالاً في اللوحة.
 */
const TOP_ITEMS: NavItem[] = [
  { label: "لوحة المعلومات", icon: LayoutDashboard, href: "/admin" },
  // «الإحصائيات» بعد «لوحة المعلومات» مباشرة: لوحة المعلومات صورة اليوم، وهذه
  // اتجاه الفترة وتفصيلها لكل قسم من الأقسام الستة (المرحلة ١٠). البند يبقى
  // فعالاً على مساراتها الفرعية كلها (isItemActive أدناه).
  { label: "الإحصائيات", icon: BarChart3, href: "/admin/stats" },
];

/**
 * المجموعات الخمس وترتيب بنودها — **أقرّهما بدر نصّاً في 2026-08-17**.
 *
 * ⚠ والتعليقات أدناه تشرح الترتيب القائم لا ترتيباً أفضل مقترحاً: بعض البنود
 * غيّرت جيرانها بالتجميع (الأسطول انتقل من جوار «التسعير» إلى «المتعهدون»،
 * و«الإسناد» من جوار «المتعهدون» إلى «التشغيل»)، وذلك **قرار مالكٍ لا سهو**،
 * فلا يُعاد إلى ما كان باجتهاد جلسةٍ لاحقة تقرأ التعليق القديم.
 */
const NAV_GROUPS: NavGroup[] = [
  {
    id: "ops",
    label: "التشغيل",
    // طابور العمل اليومي: ما يصل من العميل، ثم كيف يُسنَد، ثم ما أُبلِغ عنه.
    items: [
      { label: "الطلبات", icon: ClipboardList, href: "/admin/orders" },
      { label: "طلبات الأسعار", icon: MessageSquareQuote, href: "/admin/quote-requests" },
      // «الإسناد» هنا لا مع «المتعهدون»: الشاشة **فعلٌ يومي على رحلةٍ بعينها**
      // لا إدارةٌ لعلاقة الشريك — فموضعها مع الطابور الذي تخدمه.
      { label: "الإسناد", icon: Radio, href: "/admin/dispatch" },
      { label: "الإشعارات", icon: Bell, href: "/admin/notifications" },
    ],
  },
  {
    id: "partners",
    label: "المتعهدون",
    items: [
      { label: "المتعهدون", icon: Handshake, href: "/admin/subcontractors" },
      // «الأسطول» مع الشركاء لا مع «التسعير»: المركبات تُدار مع مَن يقودها.
      { label: "الأسطول", icon: Car, href: "/admin/fleet" },
      // «أسباب فشل الرحلة» كتالوج يُقرأ في اللحظة التي تلي الإسناد — رحلةٌ
      // أُسندت ثم لم تُنفَّذ — **وأثره مالي على المتعهد** (لا شيء · دفع كامل ·
      // خصم). وهو شاشة إعدادٍ تُفتح مرات معدودة في العمر، فذيل المجموعة موضعه.
      { label: "أسباب فشل الرحلة", icon: AlertTriangle, href: "/admin/failure-reasons" },
      // «اتفاقية المتعهد» في ذيل المجموعة نفسها: وثيقةٌ تُحرَّر مرات معدودة في
      // العمر، **وهي شرطُ الأهلية نفسه** — من لم يقبل نسختها السارية بعد انقضاء
      // مهلته يسقط من حوض البثّ (0113). وموضعها بجوار «أسباب فشل الرحلة» مقصود:
      // هذه تُعرِّف الخصم وتلك تُنفّذه، ولا يُدافَع عن خصمٍ بلا قبولٍ مسجَّل.
      { label: "اتفاقية المتعهد", icon: FileSignature, href: "/admin/partner-agreement" },
    ],
  },
  {
    id: "money",
    label: "المال",
    items: [
      // «المالية» فُعِّلت في المرحلة ٧: الخزينة والمصروفات وتسويات المتعهدين
      // وكشوف الحساب. تتصدّر المجموعة لأنها حصيلة ما تحتها. والبند يبقى فعالاً
      // على مساراتها الفرعية كلها (isItemActive أدناه).
      { label: "المالية", icon: Wallet, href: "/admin/finance" },
      // «المدفوعات» و«حسابات الدفع» متلاصقتان: وجها تحصيلٍ واحد — الأولى
      // للبوابات الإلكترونية ومطابقة جلساتها (المرحلة ٩)، والثانية للتحويل اليدوي.
      { label: "المدفوعات", icon: Banknote, href: "/admin/payments" },
      { label: "حسابات الدفع", icon: CreditCard, href: "/admin/payment-accounts" },
      { label: "التسعير", icon: Coins, href: "/admin/pricing" },
      // «الخصومات» بعد «التسعير» مباشرة: الرؤية تصنّف الخصومات والتحفيز
      // **مكمّلات للتسعير** لا قسماً مستقلاً (VISION.md:76 داخل قسم «آلية
      // التسعير»). والخصم نفسه طبقة تقع بعد بناء السعر، فموضعه في القائمة يتبع
      // موضعه في المعادلة. والبند يبقى فعالاً على مساراته الفرعية (شاشة الكوبون
      // والبانرات).
      { label: "الخصومات", icon: TicketPercent, href: "/admin/discounts" },
      // «الولاء» ملاصقة لـ«الخصومات» لأنهما التوأم الذي تصنّفه الرؤية مكمّلات
      // للتسعير، ولأنهما في المعادلة **طبقتان متتاليتان تقتسمان أرضية هامشٍ
      // واحدة**: الكوبون ثم النقاط، بسقفٍ واحد لا سقفين يُجمعان. فمن يضبط
      // إحداهما يحتاج أن يرى الأخرى على بُعد سطر.
      { label: "الولاء والنقاط", icon: Sparkles, href: "/admin/loyalty" },
      // «الخدمات الإضافية» في ذيل «المال» وهي مع ذلك **مكوّن من مكوّنات السعر
      // لا طبقة تسويق** — كرسي الأطفال والواي فاي بندٌ يشتريه العميل ويُقيَّد
      // على حجزه. وموضعها هنا يوافق موضعها في المعادلة نفسها:
      // `total = ride_total − discount + extras` — آخر حدٍّ يُضاف.
      { label: "الخدمات الإضافية", icon: ConciergeBell, href: "/admin/extras" },
    ],
  },
  {
    id: "content",
    label: "المحتوى",
    items: [
      { label: "المحتوى", icon: FileText, href: "/admin/content" },
      // «اللغات» بعد «المحتوى» مباشرة: الترجمة تعيش على المحتوى نفسه — كل مفتاح
      // في طابورها أصله نص عربي حُرِّر في الشاشة السابقة.
      { label: "اللغات", icon: Languages, href: "/admin/languages" },
      { label: "مركز السيو", icon: Search, href: "/admin/seo" },
    ],
  },
  {
    id: "system",
    label: "الإعدادات",
    items: [
      { label: "الإعدادات", icon: Settings, href: "/admin/settings" },
      // «السجلات» شاشة **قراءة محضة** لتاريخ المنصة — من فعل وماذا ومتى — لا
      // طابور عملٍ يُفتح كل صباح: أول ما يُفتح عند التحقيق في حادثة، وآخر ما
      // يُفتح في يوم عادي.
      { label: "السجلات", icon: ScrollText, href: "/admin/logs" },
      { label: "وضع الصيانة", icon: Wrench, href: "/admin/maintenance" },
      { label: "الربط الخارجي", icon: Plug, href: "/admin/integrations" },
      // «بحث الأماكن» ملاصقة لـ«الربط الخارجي» لا لـ«التسعير»: ما تضبطه هو
      // **مزوّدٌ خارجي وتكلفته** (تفعيل جوجل · ترتيب المزوّدَين · ضابطا عدد
      // النداءات) لا سعرٌ يراه العميل. ومفتاح جوجل نفسه في البيئة، فالشاشة
      // جارةُ الشاشة التي يفتحها المالك حين يفكّر في خدمةٍ خارجية أصلاً.
      { label: "بحث الأماكن", icon: MapPin, href: "/admin/place-search" },
    ],
  },
];

/** المسارات الفرعية (محرر المحتوى مثلاً) تُبقي بند القائمة الأم فعالاً */
function isItemActive(item: NavItem, pathname: string): boolean {
  if (!item.href) return false;
  return (
    pathname === item.href || (item.href !== "/admin" && pathname.startsWith(`${item.href}/`))
  );
}

/** تفضيل عرضٍ على هذا الجهاز لا بيانات — فـ localStorage محلّه، لا عمود في القاعدة */
const NAV_COLLAPSED_KEY = "tours01:admin:nav-collapsed";

/** مرجع ثابت لـ«لا مجموعة مطويّة» — يمنع دورة تصيير في useSyncExternalStore */
const NONE_COLLAPSED: readonly string[] = [];

/**
 * ── مخزن حالة الطيّ: خارج React عمداً ──────────────────────────────────────
 *
 * `localStorage` نظامٌ خارجي، فالقراءة منه `useSyncExternalStore` لا
 * `useState` + `useEffect`. وثلاث فوائد ملموسة لا تفضيلُ أسلوب:
 *
 * (١) **لا خطأ ترطيب**: الخادم يرى `getServerSnapshot` (لا شيء مطويّ) وهو
 *     نفسه ما يرسمه أول رسمٍ في المتصفح، ثم يُصحَّح بعد الترطيب.
 * (٢) **نسختا الشريط** (الثابت ودرج الموبايل) تقرآن مصدراً واحداً، فلا تنحرفان.
 * (٣) **تبويبٌ ثانٍ للوحة** يطوي مجموعةً ⇒ حدث `storage` يحدّث هذا التبويب.
 */
let collapsedSnapshot: readonly string[] | null = null;
const collapsedListeners = new Set<() => void>();

function parseCollapsed(raw: string | null): readonly string[] {
  if (!raw) return NONE_COLLAPSED;
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return NONE_COLLAPSED;
    // ترشيح المعرّفات المجهولة: مجموعةٌ حُذفت أو أُعيدت تسميتها لا تُبقي حالةً معلّقة
    const known = new Set(NAV_GROUPS.map((group) => group.id));
    const ids = parsed.filter((id): id is string => typeof id === "string" && known.has(id));
    return ids.length > 0 ? ids : NONE_COLLAPSED;
  } catch {
    return NONE_COLLAPSED; // قيمة تالفة — القائمة تفتح كاملة، وهو الافتراضي الآمن
  }
}

/** اللقطة تُحفظ بمرجعها: `useSyncExternalStore` يقارن بالمرجع لا بالمحتوى */
function getCollapsedSnapshot(): readonly string[] {
  if (collapsedSnapshot === null) {
    try {
      collapsedSnapshot = parseCollapsed(window.localStorage.getItem(NAV_COLLAPSED_KEY));
    } catch {
      collapsedSnapshot = NONE_COLLAPSED; // متصفح يمنع التخزين — القائمة تعمل بلا حفظ
    }
  }
  return collapsedSnapshot;
}

function getCollapsedServerSnapshot(): readonly string[] {
  return NONE_COLLAPSED;
}

function commitCollapsed(next: readonly string[]) {
  collapsedSnapshot = next;
  try {
    window.localStorage.setItem(NAV_COLLAPSED_KEY, JSON.stringify(next));
  } catch {
    /* تجاهُل مقصود: الطيّ يعمل في الجلسة الحالية ولا يُحفظ — ولا شيء ينكسر */
  }
  for (const listener of collapsedListeners) listener();
}

/** حدث `storage` يصل من **تبويب آخر** فقط — التبويب الكاتب لا يستقبله بنفسه */
function onCollapsedStorage(event: StorageEvent) {
  if (event.key !== NAV_COLLAPSED_KEY) return;
  collapsedSnapshot = null; // تُعاد القراءة عند أول getSnapshot بعدها
  for (const listener of collapsedListeners) listener();
}

function subscribeCollapsed(listener: () => void): () => void {
  // مستمع نافذةٍ واحد مهما تعدّد المشتركون (نسختا الشريط): مستمعٌ لكل مشترك
  // يُطلق موجة إشعارات مكرّرة على كل حدث
  if (collapsedListeners.size === 0) window.addEventListener("storage", onCollapsedStorage);
  collapsedListeners.add(listener);
  return () => {
    collapsedListeners.delete(listener);
    if (collapsedListeners.size === 0) window.removeEventListener("storage", onCollapsedStorage);
  };
}

function toggleCollapsedGroup(groupId: string) {
  const current = getCollapsedSnapshot();
  commitCollapsed(
    current.includes(groupId)
      ? current.filter((id) => id !== groupId)
      : [...current, groupId]
  );
}

/** فتح مجموعةٍ بعينها — بلا إشعارٍ إن كانت مفتوحة أصلاً، فلا تصيير بلا سبب */
function expandCollapsedGroup(groupId: string) {
  const current = getCollapsedSnapshot();
  if (!current.includes(groupId)) return;
  commitCollapsed(current.filter((id) => id !== groupId));
}

const PAGE_TITLES: Record<string, string> = {
  "/admin": "لوحة المعلومات",
  "/admin/content": "المحتوى",
  "/admin/content/new": "صفحة جديدة",
  // شاشات المرحلة ١٢أ — «البانرات» مسار ثابت فيُلتقط هنا قبل العنوان الديناميكي
  // لشاشة الكوبون (‏/admin/discounts/<id>) فلا يبتلعه.
  "/admin/discounts": "الخصومات",
  "/admin/discounts/banners": "بانرات العروض",
  "/admin/dispatch": "الإسناد",
  "/admin/extras": "الخدمات الإضافية",
  // بنفس نصّ `export const metadata` في الشاشة، وإلا قرأ المالك عنوانين مختلفين
  // في الترويسة وتبويب المتصفح
  "/admin/failure-reasons": "أسباب فشل الرحلة",
  "/admin/finance": "المالية",
  "/admin/finance/expenses": "المصروفات",
  "/admin/finance/partners": "تسويات المتعهدين",
  "/admin/finance/treasury": "الخزينة",
  "/admin/fleet": "الأسطول والتعريفة",
  "/admin/integrations": "الربط الخارجي",
  "/admin/languages": "اللغات",
  // بنفس نصّ `export const metadata` في الشاشة، وإلا قرأ المالك عنوانين مختلفين
  // في الترويسة وتبويب المتصفح فظنّ أنه غادر القسم
  "/admin/logs": "السجلات",
  // بنفس نصّ `export const metadata` في الشاشة، وإلا قرأ المالك عنوانين مختلفين
  // في الترويسة وتبويب المتصفح
  "/admin/loyalty": "الولاء",
  "/admin/maintenance": "وضع الصيانة",
  "/admin/notifications": "الإشعارات",
  // بنفس نصّ `export const metadata` في الشاشة
  "/admin/partner-agreement": "اتفاقية المتعهد",
  "/admin/orders": "الطلبات",
  "/admin/payment-accounts": "حسابات الدفع",
  "/admin/payments": "بوابات الدفع",
  // بنفس نصّ `export const metadata` في الشاشة، وإلا قرأ المالك عنوانين مختلفين
  // في الترويسة وتبويب المتصفح
  "/admin/place-search": "بحث الأماكن",
  "/admin/pricing": "التسعير",
  "/admin/quote-requests": "طلبات الأسعار",
  "/admin/seo": "مركز السيو",
  // تبويبات مركز السيو الأربعة — بنفس نصّ `export const metadata` في كل شاشة،
  // وإلا قرأ المالك «لوحة التحكم» في الترويسة و«تحويلات الروابط» في تبويب
  // المتصفح فظنّ أنه غادر القسم. ⚠ **وكل تبويب جديد يُضاف إلى `SEO_TABS` يحتاج
  // سطره هنا**: غيابه لا يكسر شيئاً — وهذا بالضبط ما يجعله يُنسى.
  "/admin/seo/audit": "فحص البيانات المهيكلة",
  "/admin/seo/business": "بطاقة النشاط",
  "/admin/seo/redirects": "تحويلات الروابط",
  "/admin/seo/settings": "إعدادات السيو العامة",
  "/admin/settings": "الإعدادات",
  // شاشات الإحصائيات الست + نظرتها العامة (المرحلة ١٠). مسارات ثابتة كلها،
  // فتُلتقط من هنا ولا يحتاج أيٌّ منها عنواناً ديناميكياً.
  "/admin/stats": "الإحصائيات",
  "/admin/stats/content": "إحصائيات المحتوى والسيو",
  "/admin/stats/customers": "إحصائيات العملاء",
  "/admin/stats/discounts": "إحصائيات الخصومات",
  "/admin/stats/locales": "إحصائيات اللغات",
  "/admin/stats/orders": "إحصائيات الطلبات",
  "/admin/stats/partners": "إحصائيات المتعهدين",
  "/admin/stats/treasury": "إحصائيات الخزينة",
  "/admin/subcontractors": "المتعهدون",
  "/admin/subcontractors/reviews": "مراجعة الأسعار",
};

function SidebarContent({
  brandName,
  pathname,
  collapsedGroups,
  onToggleGroup,
  onNavigate,
}: {
  brandName: string;
  pathname: string;
  collapsedGroups: readonly string[];
  onToggleGroup: (groupId: string) => void;
  onNavigate?: () => void;
}) {
  const renderItem = (item: NavItem) => {
    const Icon = item.icon;
    if (item.href) {
      const active = isItemActive(item, pathname);
      return (
        <Link
          key={item.label}
          href={item.href}
          onClick={onNavigate}
          aria-current={active ? "page" : undefined}
          className={cn(
            "flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
            active ? "bg-primary text-primary-foreground" : "text-sidebar-foreground hover:bg-muted"
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
  };

  return (
    <>
      <div className="flex h-14 shrink-0 items-center px-4">
        <Link href="/admin" onClick={onNavigate} className="flex flex-col leading-tight">
          <span className="font-heading text-base font-bold text-primary">{brandName}</span>
          <span className="text-[11px] text-muted-foreground">لوحة التحكم</span>
        </Link>
      </div>
      <Separator />
      <nav aria-label="التنقل الرئيسي" className="flex-1 overflow-y-auto p-3">
        {/* البندان المتصدّران يأخذان **إزاحة الوجهات نفسها** رغم أنهما بلا
            مجموعة: القاعدة التي تقرأها العين هي «كل ما يُنقَر للانتقال على خطٍّ
            واحد، والعناوين وحدها خارجه». ولو تُركا على خط العناوين لصار
            «لوحة المعلومات» و«التشغيل» في مرتبةٍ واحدة وهما ليسا كذلك. */}
        <div className="space-y-1 ps-3">{TOP_ITEMS.map(renderItem)}</div>

        {NAV_GROUPS.map((group) => {
          const expanded = !collapsedGroups.includes(group.id);
          const hasActive = group.items.some((item) => isItemActive(item, pathname));
          const panelId = `admin-nav-${group.id}`;
          // mt-5 فوق كل مجموعة مقابل space-y-1 بين روابطها: الفجوة قبل العنوان
          // خمسة أضعاف الفجوة داخله، فتقرأ العين «قسم جديد» قبل أن تقرأ الكلمة
          return (
            <div key={group.id} className="mt-5">
              {/* عنوان المجموعة زرٌّ حقيقي لا <div> بمستمع نقر: يصله Tab، ويعمل
                  بالمسافة وEnter، ويُعلن حالته بـ aria-expanded. وحلقة التركيز
                  بـ ring-offset-sidebar كي تبقى مرئية على أرضية الشريط نفسها.
                  **أخفتُ شكلاً وأقوى دلالةً** — لا العكس. */}
              <button
                type="button"
                onClick={() => onToggleGroup(group.id)}
                aria-expanded={expanded}
                aria-controls={panelId}
                // (١) بلا `rounded`+`hover:bg`: الحبّة الكاملة عند التمرير وعدٌ
                //     بالانتقال، وهذا الزر لا ينقل. يبقى `rounded-sm` لشكل حلقة
                //     التركيز وحدها.
                // (٢) بلا tracking: تباعد الحروف عادةٌ لاتينية، وفي العربية
                //     يباعد حروفَ الكلمة الموصولة فيُضعف قراءتها.
                className="flex w-full items-center gap-1.5 rounded-sm px-3 py-1 text-[11px] font-semibold text-muted-foreground transition-colors hover:text-sidebar-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sidebar-ring focus-visible:ring-offset-2 focus-visible:ring-offset-sidebar"
              >
                {/* الكلمة أولاً والسهم في الطرف — لا العكس: بهذا يبدأ العنوان
                    من **حافة أبعد للخارج من عمود أيقونات الوجهات**، فيختلف
                    ظلّ السطر كله لا حجم خطّه وحده. وسهمٌ متصدّر كان سيدفع
                    الكلمة إلى داخل العمود فيضيع أثر الإزاحة. */}
                <span className="truncate">{group.label}</span>
                {/* نقطة على العنوان حين تُطوى مجموعةٌ فيها الصفحة الحالية. لا يصل
                    إلى هذه الحالة إلا الطيّ اليدوي بعد الوصول (الفتح التلقائي
                    يمنع ما عداه)، ومن يصل إليها يحتاج أثراً يقول: قسمك هنا. */}
                {hasActive && !expanded && (
                  <span aria-hidden className="size-1.5 shrink-0 rounded-full bg-primary" />
                )}
                <ChevronDown
                  aria-hidden
                  className={cn(
                    "ms-auto size-3.5 shrink-0 transition-transform duration-150",
                    // مفتوحة: السهم لأسفل. مطويّة: يستدير ليشير في اتجاه
                    // القراءة — يساراً في RTL ويميناً في LTR. ودورانان لا
                    // واحد لأن الاصطلاح نفسه **ينعكس** بانعكاس الاتجاه.
                    !expanded && "ltr:-rotate-90 rtl:rotate-90"
                  )}
                />
              </button>
              {/* hidden لا إزالة من الشجرة: يبقى العنصر الذي يشير إليه
                  aria-controls موجوداً، ولا تُفقد الروابط من الـ DOM.
                  و`ps-3` هي الإزاحة التي تجعل الاحتواء مرئياً — منطقية لا
                  يسارية، فتنقلب مع الاتجاه بلا سطر ثانٍ. */}
              <div id={panelId} hidden={!expanded} className="mt-1 space-y-1 ps-3">
                {group.items.map(renderItem)}
              </div>
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

  // ── حالة طيّ مجموعات القائمة ───────────────────────────────────────────────
  // تُقرأ هنا لا داخل SidebarContent: المكوّن يُصيَّر **مرتين** (الشريط الثابت
  // ودرج الموبايل)، والاشتراك في مكان واحد يبقيهما على قيمة واحدة.
  const collapsedGroups = React.useSyncExternalStore(
    subscribeCollapsed,
    getCollapsedSnapshot,
    getCollapsedServerSnapshot
  );

  const activeGroupId = React.useMemo(
    () =>
      NAV_GROUPS.find((group) => group.items.some((item) => isItemActive(item, pathname)))?.id ??
      null,
    [pathname]
  );

  // المجموعة التي تحوي الصفحة الحالية تُفتح ولو طواها المالك — فلا يضيع أحد داخل
  // قسمٍ لا يراه. والفتح **يُكتب في التخزين** لا يُفرض عند العرض فقط: لو فُرض
  // عرضاً لبقي زر العنوان لا يستجيب للنقر ما دام المستخدم داخل القسم، وهو عطبٌ
  // ظاهر. وبعد الفتح التلقائي يستطيع طيّه بيده، ويبقى مطويّاً حتى يعود إليه.
  React.useEffect(() => {
    if (activeGroupId) expandCollapsedGroup(activeGroupId);
  }, [activeGroupId]);

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

  // معاينة الصفحة في منشئ الصفحات: **الحارس بلا القشرة** (عقد المرحلة ١٣ §٧).
  // تبقى تحت `/admin` فتحتفظ بحارس الدور وبحجب `robots` وبانعدام وسوم القياس،
  // وتُصيَّر بعرضٍ كامل — فمعاينةٌ داخل عمودٍ أضيق ٢٤٠ بكسل تكذب على من ينظر إليها.
  const isBarePreview = pathname.startsWith("/admin/content/") && pathname.endsWith("/preview");
  if (isBarePreview) return <>{children}</>;

  // المسارات الديناميكية: محرر المحتوى وتفاصيل الطلب وملف المتعهد لها عنوان ثابت
  // مهما كان المعرّف. المسارات الثابتة تحت نفس البادئة (مثل «مراجعة الأسعار»)
  // تُلتقط قبل ذلك من PAGE_TITLES، فلا يبتلعها العنوان الديناميكي.
  const dynamicTitle = (path: string): string | null => {
    // منشئ الصفحات مسارٌ فرعي تحت محرر المحتوى — يُلتقط **قبله** وإلا ابتلعه
    if (path.startsWith("/admin/content/") && path.endsWith("/builder")) return "منشئ الصفحات";
    if (path.startsWith("/admin/content/")) return "محرر المحتوى";
    // /admin/discounts/<id> — شاشة كوبون واحد (البانرات مسار ثابت التُقط قبلها)
    if (path.startsWith("/admin/discounts/")) return "تعديل كوبون";
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
        <SidebarContent
          brandName={brandName}
          pathname={pathname}
          collapsedGroups={collapsedGroups}
          onToggleGroup={toggleCollapsedGroup}
        />
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
              collapsedGroups={collapsedGroups}
              onToggleGroup={toggleCollapsedGroup}
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
