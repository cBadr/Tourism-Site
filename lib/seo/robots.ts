import type { MetadataRoute } from "next";

import { AI_CRAWLERS, ALWAYS_DISALLOWED, type RobotsSettings } from "@/lib/seo-types";

/**
 * بناء `robots.txt` ومعاينته — **مصدر واحد لا نسختان**.
 *
 * ولماذا استُخرج من `app/robots.ts` أصلاً؟ لأن شاشة الإعدادات تَعِد المالك بأن
 * يرى «الملف الناتج» قبل الحفظ، ووعدٌ كهذا يُخلَف بأهدأ طريقة ممكنة: نسخةٌ ثانية
 * من منطق القواعد في الشاشة تنحرف عن الملف الحقيقي بعد أول تعديل، فيقرأ المالك
 * ملفاً سليماً بينما يُقدَّم لجوجل ملفٌ آخر — ولا رسالة خطأ واحدة بينهما (النمط ٨
 * في `handover/LESSONS.md`: مصدران لقرار واحد). فالقواعد تُبنى هنا مرة، ويقرؤها
 * المسار العام والشاشة معاً.
 */

/**
 * قاعدة واحدة في الملف كما يعرّفها Next — تُستخرج من نوعه بدل إعادة كتابتها،
 * فترقية الإطار تكسر البناء هنا بدل أن تُنتج ملفاً صامتاً بحقل لم يعد مقروءاً.
 */
export type RobotsRule = Extract<MetadataRoute.Robots["rules"], readonly unknown[]>[number];

/**
 * المسارات الإضافية الممنوعة بعد تنقيتها.
 *
 * `jsonb` لا يضمن نوعاً: صفٌّ عُدّل بيد أو استوردته أداة قد يحمل نصاً مكان
 * المصفوفة، ونشرُه بـ`...` كان يفكّكه إلى حروف فيخرج سطر منع لكل حرف. الفحص
 * هنا أرخص من ملف robots.txt يمنع مسارات وهمية على النطاق كله.
 */
function extraDisallow(disallow: RobotsSettings["disallow"]): string[] {
  if (!Array.isArray(disallow)) return [];
  return disallow
    .filter((entry): entry is string => typeof entry === "string")
    .map((entry) => entry.trim())
    /*
     * ثلاثة رفضٍ يقع كلٌّ منها صامتاً لولا هذا السطر، وأمسكتها المراجعة:
     *
     *   • `""` — سطر `Disallow:` فارغ معناه في المعيار **«لا تمنع شيئاً»**،
     *     أي عكس ما كتبه المالك تماماً.
     *   • `"search"` بلا شرطة بادئة — سطرٌ تتجاهله المحلّلات، فيظن المالك أنه
     *     منع مساراً ولم يمنع.
     *   • `"/"` — يمنع **الموقع كله**. وله مفتاحه المخصّص (`indexable`) الذي
     *     يمنع بالطبقتين معاً؛ أما هنا فيُنتج ملفاً فيه `Allow: /` و
     *     `Disallow: /` معاً: جوجل يرجّح السماح وبينج يرجّح المنع، فيصير
     *     نصفُ محركات البحث محجوباً بلا أن يقول أحد شيئاً.
     *
     * والتشذيب قبل الفحص مقصود: `" /search"` نيّةٌ صحيحة بمسافة زائدة، تُصلَح
     * ولا تُرفض.
     */
    .filter((entry) => entry !== "" && entry !== "/" && entry.startsWith("/"));
}

/**
 * قواعد الملف من الإعدادات — نفس الترتيب الذي يخرج به الملف حرفاً بحرف.
 *
 * `ALWAYS_DISALLOWED` تُضاف دائماً ولا تُستبدل بما يكتبه المالك: لوحة التحكم
 * وبوابة المتعهدين و`/api` ليست محتوى، وحذفُها من الشاشة سهوٌ لا يجوز أن يكون
 * ممكناً أصلاً. قائمة المالك تُضاف فوقها لا مكانها.
 */
export function buildRobotsRules(robots: RobotsSettings): RobotsRule[] {
  const extra = extraDisallow(robots.disallow);

  // إطفاء الفهرسة: منع الجذر يغني عن تعداد ما تحته — والقاعدة الواحدة أوضح
  // للمالك حين يقرأ الملف بنفسه من أن يجدها مبعثرة بين استثناءات.
  const publicRule: RobotsRule = robots.indexable
    ? { userAgent: "*", allow: "/", disallow: [...ALWAYS_DISALLOWED, ...extra] }
    : { userAgent: "*", disallow: "/" };

  /**
   * زواحف الذكاء الاصطناعي: قاعدة مستقلة لكل وكيل لا قاعدة واحدة بقائمة وكلاء —
   * معيار robots.txt يقرأ المجموعة بأسمائها، وخلطُ اثني عشر وكيلاً في مجموعة
   * واحدة يجعل بعضها يتجاهل السطر كله. والقاعدة تُضاف **فقط** عند الطلب: قائمة
   * منع فارغة أفضل من قائمة موجودة بلا أثر.
   */
  const aiRules: RobotsRule[] = robots.blockAiCrawlers
    ? AI_CRAWLERS.map((userAgent) => ({ userAgent, disallow: "/" }))
    : [];

  // الوكلاء المخصوصون أولاً: من يقرأ الملف بعينه يرى قراره في أعلاه
  return [...aiRules, publicRule];
}

/** قيمة قد تكون نصاً أو مصفوفة — كما يقبلها Next في كل حقل قاعدة */
function toList(value: string | string[] | undefined): string[] {
  if (value === undefined) return [];
  return Array.isArray(value) ? value : [value];
}

/**
 * نصّ الملف كما يكتبه Next حرفاً بحرف — للمعاينة في اللوحة وحدها.
 *
 * ⚠ **هذه الدالة تحاكي `resolveRobots` في**
 * `node_modules/next/dist/build/webpack/loaders/metadata/resolve-route-data.js`:
 * سطر `User-Agent` لكل وكيل، ثم `Allow` ثم `Disallow`، وسطر فارغ بعد كل مجموعة،
 * ثم `Sitemap` في الذيل. ولا تُستعمل في تقديم الملف نفسه إطلاقاً — Next يكتبه
 * من `app/robots.ts`.
 *
 * وحدّ الانحراف الممكن هنا **شكلٌ لا سياسة**: القواعد نفسها تأتي من
 * `buildRobotsRules` أعلاه، فأسوأ ما قد يحدث أن يختلف تنسيق سطر في المعاينة —
 * لا أن يُعرض منعٌ غير مطبَّق أو يُخفى منع مطبَّق.
 */
export function renderRobotsTxt(rules: RobotsRule[], sitemapUrl: string): string {
  let content = "";
  for (const rule of rules) {
    // غياب الوكيل يعني «الجميع» — نفس الافتراضي الذي يطبّقه Next لا افتراضٌ آخر
    const agents = toList(rule.userAgent);
    for (const agent of agents.length > 0 ? agents : ["*"]) {
      content += `User-Agent: ${agent}\n`;
    }
    for (const item of toList(rule.allow)) content += `Allow: ${item}\n`;
    for (const item of toList(rule.disallow)) content += `Disallow: ${item}\n`;
    content += "\n";
  }
  content += `Sitemap: ${sitemapUrl}\n`;
  return content;
}
