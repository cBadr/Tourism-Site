import { redirect } from "next/navigation";

/**
 * `/portal/agreement` — **المسار باقٍ، والشاشة انتقلت.**
 *
 * ── لماذا تحويلٌ لا حذف ────────────────────────────────────────────────────
 *
 * الاتفاقية صارت قسماً في ملف المستخدم (`/portal/profile#agreement`) بأمر المالك
 * 2026-08-19. وحذفُ هذا الملف كان يُنتج **٤٠٤ في بورتالٍ يعمل به شريك حقيقي**،
 * وأربعةُ طرقٍ تصل إلى هنا اليوم ولا تُحصى ما في متصفّحه من إشارات مرجعية:
 *
 *   | الطريق | أين هو |
 *   |---|---|
 *   | بندُ معالج التجهيز | `app/portal/_lib/onboarding.ts` (‏`href` من اتحادٍ حرفيّ في `readiness-settle.ts`) |
 *   | إبطالُ ذاكرة اللوحة بعد النشر | `app/admin/partner-agreement/actions.ts:329` |
 *   | روابطُ محفوظة في متصفح الشريك | لا تُحصى |
 *   | تبويبٌ مفتوحٌ منذ أمس | يُحدَّث فيصل |
 *
 * ⚠ **وسلسلةُ الاستعلام تُحمَل معها بقصد.** فعلُ القبول ينتهي بـ`redirect` يحمل
 * `saved=1` أو `error=code`، وأيُّ تحويلٍ يُسقطها يجعل الشريك يقبل الاتفاقية ثم
 * لا يرى شيئاً يقول إن قبولَه سُجّل — وهو أسوأ من غياب الرسالة أصلاً. والفعلُ
 * نفسه صار يوجّه إلى `/portal/profile` مباشرةً (‏`./actions.ts`)، وهذا الحمل
 * شبكةُ أمانٍ للروابط القديمة لا الطريقَ المعتاد.
 *
 * والمرساةُ `#agreement` تصل في ترويسة `Location` ويحترمها المتصفح، فيهبط
 * الشريك على القسم لا على أعلى الصفحة.
 */
export default async function PortalAgreementPage({
  searchParams,
}: PageProps<"/portal/agreement">) {
  const params = await searchParams;

  const qs = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (typeof value === "string") qs.set(key, value);
    else if (Array.isArray(value) && typeof value[0] === "string") qs.set(key, value[0]);
  }

  const query = qs.toString();
  redirect(`/portal/profile${query ? `?${query}` : ""}#agreement`);
}
