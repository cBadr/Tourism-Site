import { LogOut, UserRound } from "lucide-react";

import { getT, resolveLocale } from "@/lib/i18n/content";
import { readAccountGate } from "./_lib/session";
import { signOutAccount } from "./actions";

/**
 * غلاف منطقة الحساب — **شريطُ سياقٍ رفيع، لا واجهة ثالثة**.
 *
 * ── لماذا يوجد هذا الملف أصلاً ─────────────────────────────────────────────
 *
 * لأن الخروج بلا زرٍّ يناديه **ليس مبنيّاً** من وجهة نظر مالكه (القاعدة ١٧ في
 * `handover/INDEX.md`: «ابحث عن المنادي قبل أن تعلن الاكتمال» — سطحُ تصديرٍ كامل
 * شُحن مرةً بلا زر تنزيل واحد). و`signOutAccount` إجراءٌ خادميّ يجب أن يظهر في
 * **كل** صفحة من صفحات الحساب، فمكانه الطبيعي الغلاف لا صفحةٌ بعينها.
 *
 * ── ولماذا شريط فوق ترويسة الموقع لا ترويسةٌ خاصة ─────────────────────────
 *
 * صفحات هذه المنطقة تركّب `SiteHeader` و`SiteFooter` بنفسها كأي صفحة عامة —
 * فالحساب امتدادٌ للموقع لا واجهةٌ منفصلة كـ`/admin` و`/portal`. فلا يجوز أن
 * يبني الغلاف ترويسةً ثانية. وشريطٌ رفيع فوق الترويسة هو الشكل الذي يقول
 * «أنت داخل حسابك» بلا أن ينافسها.
 *
 * ⚠ **ولا يظهر الشريط لمن لا جلسة له** — ومن ذلك `/account/login` نفسها: زرُّ
 * خروجٍ فوق نموذج دخول رسالةٌ متناقضة. والحالة `env` كذلك بلا شريط: بيئةٌ غير
 * مضبوطة ليس فيها جلسة تُنهى.
 *
 * ولا `noindex` هنا: الميتاداتا تُدمج بالحقل عبر المقاطع، فوسمٌ في الغلاف كان
 * سيسحب `/account/login` — وهي **صفحة وصولٍ مفهرَسة عمداً** — إلى خارج الفهرس
 * معه. فكل صفحة تملك وسمها: «حجوزاتي» `noindex` بنصّها، والدخول مفهرَسة.
 *
 * ⚠ **ونصّا الشريط مفتاحان لا نصّان في المكان.** كانا مكتوبين عربيةً هنا، وهذا
 * الغلاف يعلو **كل** صفحة من صفحات الحساب — فكان زائرُ `/en` يرى شريطاً عربياً
 * فوق شاشةٍ إنجليزية في كل صفحة منها. (نفس عيب بطاقة الطاقم حرفياً.)
 */
export default async function AccountLayout({ children }: LayoutProps<"/account">) {
  const gate = await readAccountGate();
  if (gate.state !== "active") return <>{children}</>;

  // ⚠ **بعد حارس الجلسة لا قبله**: الغلاف يعمل على كل طلبات `/account` بما فيها
  //    من لا جلسة له، وقراءةُ الترجمات لمن لن يرى الشريط أصلاً كلفةٌ بلا مقابل.
  const locale = await resolveLocale();
  const t = await getT("pages.account", locale);

  // البريد مُثبَتٌ بالدخول نفسه؛ والاسم يكتبه صاحبه. ولا هاتفَ هنا بحال:
  // `profiles.phone` منسوخٌ من حمولة تسجيلٍ غير مُتحقَّق منها (العقد §٢)،
  // وعرضُه بجوار «مسجّل دخولك باسم» يجعله يبدو بياناً مُثبَتاً وهو ليس كذلك.
  const label = gate.user.displayName ?? gate.user.email ?? "";

  return (
    <>
      <div className="border-b border-border bg-muted/50">
        <div className="mx-auto flex w-full max-w-6xl items-center justify-between gap-3 px-4 py-1.5 text-xs sm:px-6">
          <span className="flex min-w-0 items-center gap-1.5 text-muted-foreground">
            <UserRound className="size-3.5 shrink-0" aria-hidden="true" />
            <span className="truncate">
              {label ? t("bar.signedInAs", "مسجّل دخولك باسم") : t("bar.signedIn", "مسجّل دخولك")}
              {label ? <span className="font-medium text-foreground"> {label}</span> : null}
            </span>
          </span>

          {/*
            نموذج `POST` لا رابط: الخروج يغيّر حالة الخادم، ورابطُ GET يستهلكه
            سابقُ الجلب في المتصفح فيَخرج المستخدم بلا أن يضغط شيئاً.
          */}
          <form action={signOutAccount}>
            <button
              type="submit"
              className="inline-flex shrink-0 items-center gap-1.5 rounded-lg px-2 py-1 font-medium text-muted-foreground transition-colors hover:text-primary focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
            >
              <LogOut className="size-3.5" aria-hidden="true" />
              {t("bar.signOut", "خروج")}
            </button>
          </form>
        </div>
      </div>

      {children}
    </>
  );
}
