import { CheckCircle2, Info, TriangleAlert } from "lucide-react";

import { getT } from "@/lib/i18n/content";
import { ACCOUNT_LOGIN_MESSAGES, readLoginNotice, type AccountTone } from "../../_lib/messages";

/**
 * بطاقة نتيجة الإجراء — **المستهلك الوحيد لخريطة الرموز**.
 *
 * لماذا مكوّن مشترك لا شرطٌ في كل صفحة؟ لأن العيب الذي يتكرر في هذا المستودع هو
 * «رمز بلا رسالة»: إجراءٌ يعيد التوجيه بـ`?error=x` وصفحةٌ لا تعرف `x`، فيرى
 * المستخدم شاشةً صامتة تبدو نجاحاً. وحين تكون القراءة والعرض في مكان واحد،
 * تكفي **إضافة الرمز إلى الخريطة** ليظهر في كل صفحة تستعمل هذا المكوّن — ولا
 * يوجد موضعٌ ثانٍ يُنسى.
 *
 * وهو مكوّن خادمي بلا حالة: النتيجة تُقرأ من الرابط (اتفاقية ٤)، فيعمل
 * وJavaScript معطّل، ويبقى الرابط قابلاً للتحديث والمشاركة.
 */

const TONE_CLASS: Record<AccountTone, string> = {
  success: "border-emerald-500/40 bg-emerald-500/10 text-emerald-800 dark:text-emerald-200",
  info: "border-sky-500/40 bg-sky-500/10 text-sky-800 dark:text-sky-200",
  error: "border-destructive/40 bg-destructive/10 text-destructive",
};

const TONE_ICON: Record<AccountTone, typeof Info> = {
  success: CheckCircle2,
  info: Info,
  error: TriangleAlert,
};

type AccountLoginNoticeProps = {
  /** `searchParams` كما وصلت الصفحة — يُقرأ منها `done` و`error` معاً */
  params: Record<string, string | string[] | undefined>;
  locale: string;
};

export async function AccountLoginNotice({ params, locale }: AccountLoginNoticeProps) {
  const code = readLoginNotice(params);
  if (!code) return null;

  const message = ACCOUNT_LOGIN_MESSAGES[code];
  const t = await getT("pages.account", locale);
  const Icon = TONE_ICON[message.tone];

  return (
    <p
      role={message.tone === "error" ? "alert" : "status"}
      className={`mb-6 flex items-start gap-2 rounded-2xl border px-3 py-2.5 text-sm leading-6 ${TONE_CLASS[message.tone]}`}
    >
      <Icon className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
      {t(message.key, message.fallback)}
    </p>
  );
}
