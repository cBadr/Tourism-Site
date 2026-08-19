import { redirect } from "next/navigation";

/**
 * `/portal/notifications` — **إعادةُ توجيهٍ إلى قسم القنوات في «حسابي»**.
 *
 * ── لماذا توجيهٌ ولا حذف ────────────────────────────────────────────────────
 *
 * محرِّرُ القنوات انتقل بكامله إلى `/portal/profile#channels` (‏قسمٌ في «حسابي»)،
 * فلم يبقَ لهذه الشاشة محتوى — والإبقاءُ عليها بمحرِّرها كان يعني **بابين للشيء
 * الواحد**، وهو بعينه ما أمر المالك بإنهائه في 2026-08-19.
 *
 * لكن **حذفَ المسار ليس إنهاءً بل كسر**: العنوان مرّ على الشركاء شهوراً في شريط
 * التنقل وفي معالج التجهيز وفي دليل البورتال ورسائل الإدارة، وقد يكون محفوظاً في
 * متصفّح شريكٍ الآن. و٤٠٤ في وجهه تقول «الميزة زالت» لا «انتقلت» — وهو النمط ٣
 * في `LESSONS.md` مقلوباً: صفحةٌ كانت لها طرق ثم قُطعت.
 *
 * ── وماذا يُنقل معه ────────────────────────────────────────────────────────
 *
 * **معاملاتُ الحالة تُمرَّر كما هي.** رابطٌ محفوظ قد يحمل `?saved=1` أو
 * `?error=telegram-taken`، والوجهةُ تترجم الرمزَين نفسَهما من
 * `profile/_components/channels-summary.tsx` ← `ALERTS_ERROR_MESSAGES`. وإسقاطُها
 * هنا كان يبتلع رسالةً كتبها فعلٌ سابق.
 *
 * و`redirect()` مؤقّت (307) لا دائم عمداً: الدائم يُخزَّن في المتصفح فلا يُلغى
 * إن رجع القرار، والبورتال خلف تسجيل دخول فلا وزنَ لفهرسةٍ هنا أصلاً.
 */
export default async function PortalNotificationsPage({
  searchParams,
}: PageProps<"/portal/notifications">) {
  const params = await searchParams;

  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (typeof value === "string") query.set(key, value);
    // مصفوفة = المفتاح تكرّر في الرابط؛ يُنقل بتكراره لا بأول قيمة
    else if (Array.isArray(value)) for (const one of value) query.append(key, one);
  }

  const qs = query.toString();
  redirect(qs ? `/portal/profile?${qs}#channels` : "/portal/profile#channels");
}
