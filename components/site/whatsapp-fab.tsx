import type { SiteSettings } from "@/lib/site-config";
import { cn } from "@/lib/utils";
import { DEFAULT_LOCALE } from "@/lib/i18n-types";
import { getT } from "@/lib/i18n/content";
import { waHref } from "./links";
import { WhatsAppIcon } from "./social-icons";

/**
 * زر واتساب عائم (أسفل اليسار في واجهة RTL) — يظهر فقط عند توفر رقم واتساب.
 * اللون الأخضر هنا هوية منصة واتساب نفسها، لا لون العلامة.
 *
 * 🔴 **و`hiddenOnMobile` ليس ذوقاً بل منعُ تراكب.** الصفحات التي تركّب
 * `SiteCtaBar` تضع شريطاً ثابتاً بعرض الشاشة أسفلها، **وفيه واتساب إجراءً**؛
 * فالقرص العائم كان يقع فوق الشريط ويغطّي جزءاً منه. والتصميم لا يعرف زرّاً
 * عائماً أصلاً — واتساب فيه داخل الشريط وحده.
 *
 * وتُمرَّر الراية من الصفحة لا تُستنتج هنا: هذا المكوّن لا يعرف أيَّ صفحةٍ
 * ركّبت الشريط، **ومن ركّبه هو من يعرف**. والافتراضي `false` فلا تتغيّر صفحة
 * لم تُلمس ببايت.
 */
export async function WhatsAppFab({
  settings,
  locale = DEFAULT_LOCALE,
  hiddenOnMobile = false,
}: {
  settings: SiteSettings;
  locale?: string;
  hiddenOnMobile?: boolean;
}) {
  const whatsapp = settings.contact.whatsapp;
  if (!whatsapp) return null;

  const t = await getT("site.whatsappFab", locale);

  return (
    <a
      href={waHref(whatsapp)}
      target="_blank"
      rel="noopener noreferrer"
      aria-label={t("label", "تواصل معنا عبر واتساب")}
      className={cn(
        "fixed bottom-5 left-5 z-50 grid size-14 place-items-center rounded-full bg-[#25D366] text-white shadow-lg shadow-black/25 transition-transform duration-300 hover:scale-110 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 sm:bottom-6 sm:left-6",
        hiddenOnMobile && "hidden md:grid"
      )}
    >
      <WhatsAppIcon className="size-7" />
    </a>
  );
}
