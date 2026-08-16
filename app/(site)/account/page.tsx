import { redirect } from "next/navigation";

import { localePath } from "@/lib/i18n-types";
import { resolveLocale } from "@/lib/i18n/content";
import { ACCOUNT_HOME_PATH } from "./_lib/session";

/**
 * `/account` — لا شاشة، تحويلٌ إلى «حجوزاتي».
 *
 * لماذا يوجد أصلاً؟ لأن من يكتب `/account` بيده أو يقصّ الجزء الأخير من الرابط
 * يستحق صفحةً لا خطأ ٤٠٤، و«منطقة الحساب» اليوم شاشةٌ واحدة. وحين تنضمّ إليها
 * شاشة الولاء (المرحلة ١٢ب — المرحلة الثانية) يصير هذا الملف صفحةَ المنطقة
 * وتُلغى منه سطر التحويل وحده.
 *
 * والتحويل يحفظ لغة الزائر: العربية بلا بادئة والإنجليزية تحت `/en` — فلا
 * يُلقى من فتح `/en/account` في نسخة عربية.
 */
export default async function AccountIndexPage() {
  const locale = await resolveLocale();
  redirect(localePath(locale, ACCOUNT_HOME_PATH));
}
