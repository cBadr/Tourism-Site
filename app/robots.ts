import type { MetadataRoute } from "next";
import { getBaseUrl } from "@/lib/seo";
import { getSettings } from "@/lib/settings";
import { buildRobotsRules } from "@/lib/seo/robots";

/**
 * robots.txt — قواعده من `site_settings.seo.robots` بعد أن كان قاعدةً واحدة
 * صمّاء محفورة في هذا الملف.
 *
 * ── ثلاثة أشياء لم تكن ممكنة وهي مطلوبة فعلاً ───────────────────────────────
 *  ١ **إطفاء الفهرسة كلياً** — نسخة قبل الإطلاق كانت تُفهرَس بلا مفتاح لمنعها،
 *    وسحبُ صفحةٍ من النتائج بعد فهرستها أبطأ بكثير من منعها ابتداءً.
 *  ٢ **منع مسار بعينه** بلا نشر كود.
 *  ٣ **حجب زواحف نماذج الذكاء الاصطناعي** — قرار يخصّ المالك وحده.
 *
 * ── ولماذا بناء القواعد ليس هنا ─────────────────────────────────────────────
 * `lib/seo/robots.ts` يبنيها، لأن شاشة `/admin/seo/settings` تعرض على المالك
 * **الملف الناتج** قبل أن يحفظ — ولو بنته الشاشة بنفسها لانحرفت النسختان بعد
 * أول تعديل، فقرأ المالك ملفاً سليماً بينما يُقدَّم لجوجل ملفٌ آخر بلا رسالة
 * خطأ واحدة. القواعد تُبنى مرة، ويقرؤها هذا المسار والشاشة معاً.
 *
 * ⚠ **الفارق الوحيد المقصود عن مخرجات الأمس**: `Disallow: /api` صار ضمن المنع
 * الدائم بنصّ العقد (`lib/seo-types.ts`)، ولم يكن مذكوراً. وهي مسارات لا تُقدّم
 * صفحةً لزائر فلا تُهدر عليها ميزانية زحف، والباقي — الترتيب والقاعدة `Allow: /`
 * وسطر الخريطة — كما كان حرفاً بحرف حين لا إعداد مضبوطاً.
 */
export default async function robots(): Promise<MetadataRoute.Robots> {
  const baseUrl = getBaseUrl();
  const settings = await getSettings();

  return {
    rules: buildRobotsRules(settings.seo.robots),
    sitemap: `${baseUrl}/sitemap.xml`,
  };
}
