/**
 * بناء عقد schema.org — **المصدر الأوحد** لكل بيانات مهيكلة في المستودع.
 *
 * ── لماذا وحدة شبه مستقلة؟ ─────────────────────────────────────────────────
 * لأن ثلاثة أسطح تحتاجها ولا تجتمع في شجرة واحدة: الصفحة الرئيسية
 * (`components/seo/JsonLd.tsx`)، وصفحتا الخدمة والمسار، و**شاشة الفحص في
 * اللوحة** التي يجب أن تقول للمالك ما يخرج فعلاً لا ما يُظنّ أنه يخرج. ولو حمل
 * هذا الملف تبعيةً على `getSettings` أو `next/headers` لصار استيراده من طبقة
 * الفحص جرَّ نصفِ الخادم. فهو هنا **دوالّ نقية** تأخذ قيماً جاهزة وتُرجع كائنات،
 * ولا يعرف شيئاً عن الطلب ولا عن القاعدة.
 *
 * ⚠ واستيراد `lib/phone` وحده لا ينقض ذلك: هو **ورقةٌ بلا استيراد واحد** بحكم
 * ترويسته (يناديه الوسيط في كل طلب)، فجرّه لا يجرّ شيئاً خلفه. والشرط المقصود
 * أعلاه «لا تبعية على الطلب أو القاعدة» لا «لا استيراد» حرفياً.
 *
 * ── القاعدة التي تحكم كل دالة هنا: الحقل غير المضبوط لا يخرج ────────────────
 * لا نصاً فارغاً، ولا `null`، ولا افتراضاً مخترعاً. وبطاقة نشاط تعلن عنواناً
 * غير صحيح **أسوأ** من بطاقة بلا عنوان: الأولى تُفقد الثقة عند أول زائر يصل إلى
 * مكان لا وجود له، والثانية تنقص إشارةً وحسب (نصّ العقد في `lib/seo-types.ts`).
 *
 * ⚠ **ولا تُصدَّق أنواع TypeScript هنا.** مصدر هذه القيم عمود `jsonb`؛ فالحقل
 * المعلن `number | null` قد يصل نصاً، و`string[]` قد يصل كائناً، لأن أحداً لم
 * يتحقق منه عند الكتابة قبل هذه الشاشة. ولذلك يمرّ **كل** حقل على مطبِّع أدناه:
 * قيمة مشوّهة تعني حقلاً غائباً، لا عقدةً كاذبة ولا صفحةً ساقطة.
 *
 * ── ما لا يُخترَع هنا أبداً ────────────────────────────────────────────────
 * لا `AggregateRating` ولا `Offer` بسعر — كلاهما يحتاج رقماً حقيقياً من القاعدة،
 * وتقييمٌ مخترَع في البيانات المهيكلة سببٌ معلن لعقوبة يدوية من جوجل. والأسعار
 * تُحسب في Postgres وحدها (D-05) ولا تُقرَّب في طبقة عرض.
 */

import { e164Number } from "@/lib/phone";
import type { BusinessInfo } from "@/lib/seo-types";

export type JsonLdNode = Record<string, unknown>;

/* ------------------------------------------------------------------ */
/* (١) مطبِّعات القيم — الحارس بين `jsonb` وبين ما يقرؤه جوجل            */
/* ------------------------------------------------------------------ */

/** نصّ مضبوط فعلاً — الفراغ وغير النص كلاهما «غير مضبوط» */
function text(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed === "" ? null : trimmed;
}

/** مصفوفة نصوص غير فارغة — غير المصفوفة تعني قائمة فارغة لا خطأً */
function textList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((entry) => {
    const one = text(entry);
    return one === null ? [] : [one];
  });
}

/**
 * إحداثي ضمن مداه الحقيقي — وإلا فلا إحداثي.
 *
 * ولماذا فحص المدى لا مجرد فحص النوع؟ لأن خط عرض ٥٠٠ يمرّ في `JSON.stringify`
 * بلا شكوى ويُخرج بطاقة نشاط تدّعي موقعاً غير موجود على الأرض. والقيمة غير
 * الرقمية أخطر: `NaN` يُسلسَل إلى `null` فتخرج `GeoCoordinates` بحقل فارغ.
 */
function coordinate(value: unknown, limit: number): number | null {
  if (typeof value !== "number" || !Number.isFinite(value)) return null;
  return Math.abs(value) <= limit ? value : null;
}

/**
 * روابط الحسابات الرسمية — **رابط مطلق فقط، وبلا تكرار**.
 *
 * ⚠ ولماذا فحصٌ زائد على «غير فارغ»؟ لأن `sameAs` في schema.org **رابط** لا اسم
 * حساب، والقاعدة الحية أثبتت الحالة عملياً: الحقول الخمسة كانت تحمل معرّف
 * الحساب نفسه (`RentLimousine`) خمس مرات، فيخرج الرسم يعلن خمس هويات متطابقة
 * ليست روابط أصلاً. وهذا ليس نقصَ إشارة بل إشارةٌ خاطئة: محرك البحث يحاول ربط
 * الموقع بكيان لا يستطيع الوصول إليه، ثم يهمل الحقل كله بما فيه الروابط السليمة
 * لو وُجدت. والتكرار يُحذف للسبب نفسه — إعلان الهوية مرتين لا يضاعف الثقة.
 *
 * وقيمةُ المالك تبقى كما كتبها في الإعدادات؛ المرفوض هو **إعلانها لجوجل** بصفة
 * لا تنطبق عليها. وشاشة الفحص تنادي هذه الدالة نفسها فتقول له لماذا لم تخرج.
 */
export function sameAsList(values: unknown): string[] {
  const seen = new Set<string>();
  return textList(values).flatMap((value) => {
    if (!/^https?:\/\//i.test(value)) return [];
    if (seen.has(value)) return [];
    seen.add(value);
    return [value];
  });
}

/**
 * يضمّ إلى العقدة **الحقول المضبوطة وحدها**.
 * الغائب (`null`/`undefined`) والمصفوفة الفارغة لا يخرجان مفتاحاً أصلاً — وهذا
 * هو الفرق بين «لم يُذكر» و«ذُكر فارغاً»، والثاني إشارة خاطئة لا نقصُ إشارة.
 */
function withPresent(base: JsonLdNode, optional: Record<string, unknown>): JsonLdNode {
  const out: JsonLdNode = { ...base };
  for (const [key, value] of Object.entries(optional)) {
    if (value === null || value === undefined) continue;
    if (Array.isArray(value) && value.length === 0) continue;
    out[key] = value;
  }
  return out;
}

/* ------------------------------------------------------------------ */
/* (٢) المُسلسِل — وسم <script> واحد لا نسخة منه في كل مكوّن            */
/* ------------------------------------------------------------------ */

/**
 * نصّ الوسم: تسلسل ثم استبدال `<`.
 *
 * الاستبدال ليس تجميلاً: قيمة من القاعدة تحمل `</script>` تُنهي الوسم مبكراً
 * وتُحوّل ما بعدها إلى ترميز الصفحة — أي حقن نصّ عبر حقلٍ يملؤه المحرِّر. وترميز
 * `<` يبقى `<` نفسه في نظر مُحلّل JSON فلا تتغير البيانات بحرف.
 */
export function jsonLdText(data: unknown): string {
  return JSON.stringify(data).replace(/</g, "\\u003c");
}

/** رسم واحد بسياق واحد — العقد الغائبة (`null`) تسقط بلا فجوة في المصفوفة */
export function jsonLdGraph(nodes: (JsonLdNode | null)[]): JsonLdNode {
  return {
    "@context": "https://schema.org",
    "@graph": nodes.filter((node): node is JsonLdNode => node !== null),
  };
}

/* ------------------------------------------------------------------ */
/* (٣) معرّفات عقد الموقع — الربط بـ @id بدل تكرار البيانات              */
/* ------------------------------------------------------------------ */

/**
 * معرّفات ثابتة على مستوى الموقع كله.
 *
 * وهذا جوهر الرسم: العقدة تُعرَّف **مرة واحدة** ويشير إليها الباقون بـ`@id`.
 * فالشعار كائن `ImageObject` واحد تشير إليه المؤسسة والنشاط معاً، والخدمة في أي
 * صفحة تشير إلى مقدّمها بـ`@id` بدل أن تعيد كتابة بطاقته. وتكرار البطاقة في كل
 * صفحة يجعل تعديل رقم الهاتف يحتاج إعادة زحف الموقع كاملاً بدل صفحة واحدة.
 *
 * ⚠ `business` يبقى `#business` حرفياً كما كان قبل هذه التوسعة: هو المعرّف الذي
 * تشير إليه `ItemList` المنشورة منذ المرحلة الأولى، وتغييره يقطع كل إشارة سابقة.
 */
export type SiteNodeIds = {
  organization: string;
  website: string;
  business: string;
  logo: string;
};

export function siteNodeIds(baseUrl: string): SiteNodeIds {
  return {
    organization: `${baseUrl}/#organization`,
    website: `${baseUrl}/#website`,
    business: `${baseUrl}/#business`,
    logo: `${baseUrl}/#logo`,
  };
}

/* ------------------------------------------------------------------ */
/* (٤) عقد الموقع: الشعار والمؤسسة والموقع الإلكتروني                    */
/* ------------------------------------------------------------------ */

/** عقدة الشعار — تُبنى فقط حين يكون للشعار رابط مطلق صالح */
export function logoNode(ids: SiteNodeIds, absoluteLogoUrl: string | null): JsonLdNode | null {
  const url = text(absoluteLogoUrl);
  if (url === null) return null;
  return { "@type": "ImageObject", "@id": ids.logo, url };
}

/**
 * عقدة المؤسسة — **الكيان الناشر** لا نسخةً ثانية من بطاقة النشاط.
 *
 * قسمة العمل بينها وبين `LocalBusiness` مقصودة ولا تكرار فيها: هنا الهوية
 * القانونية والشعار، وهناك الحقائق المكانية (العنوان والإحداثيات والساعات).
 * وما يجمعهما رابط `parentOrganization`، فلا يُكتب حقلٌ مرتين في رسم واحد.
 *
 * `legalName` يخرج من `company.legalName` وحده — واسمٌ قانوني مخترع من الاسم
 * التجاري ادّعاءٌ عن كيان مسجَّل، وهو آخر ما يُخترَع.
 */
export function organizationNode(input: {
  ids: SiteNodeIds;
  baseUrl: string;
  name: string;
  legalName: string | null;
  hasLogo: boolean;
}): JsonLdNode {
  return withPresent(
    {
      "@type": "Organization",
      "@id": input.ids.organization,
      name: input.name,
      url: input.baseUrl,
    },
    {
      legalName: text(input.legalName),
      logo: input.hasLogo ? { "@id": input.ids.logo } : null,
    }
  );
}

/**
 * عقدة الموقع الإلكتروني — تعرّف «هذا الموقع» ككيان وتُسند نشره إلى المؤسسة.
 *
 * ولا `potentialAction` بصيغة `SearchAction` هنا: لا بحث داخلي في هذا الموقع،
 * وإعلان إجراء بحثٍ غير موجود يجعل جوجل يطلب مساراً يردّ ٤٠٤.
 */
export function webSiteNode(input: {
  ids: SiteNodeIds;
  baseUrl: string;
  name: string;
  inLanguage: string;
}): JsonLdNode {
  return {
    "@type": "WebSite",
    "@id": input.ids.website,
    url: input.baseUrl,
    name: input.name,
    inLanguage: input.inLanguage,
    publisher: { "@id": input.ids.organization },
  };
}

/* ------------------------------------------------------------------ */
/* (٥) بطاقة النشاط — أعلى عائد سيو في منتج نقل محلي                     */
/* ------------------------------------------------------------------ */

/**
 * عنوان بريدي مهيكل — أو `null` إن لم يُضبط أي جزء منه.
 *
 * لا حدّ أدنى مفروض على أجزائه: المالك الذي كتب المدينة وحدها أعطى إشارة محلية
 * حقيقية، ورفضها لأن الشارع ناقص يحرمه إياها بلا مقابل. أما الكائن الفارغ فلا
 * يخرج أصلاً — `PostalAddress` بلا حقل واحد ضجيج لا بيانات.
 */
export function postalAddressNode(business: BusinessInfo): JsonLdNode | null {
  const node = withPresent(
    { "@type": "PostalAddress" },
    {
      streetAddress: text(business.streetAddress),
      addressLocality: text(business.addressLocality),
      addressRegion: text(business.addressRegion),
      postalCode: text(business.postalCode),
      addressCountry: text(business.addressCountry),
    }
  );
  // مفتاح واحد فقط = `@type` وحده ⇒ لا عنوان
  return Object.keys(node).length > 1 ? node : null;
}

/**
 * إحداثيات النشاط — **معاً أو لا شيء**.
 *
 * خط عرض بلا خط طول لا يحدّد نقطةً على الأرض، و`GeoCoordinates` ناقصة تُقرأ
 * موقعاً مجهولاً لا موقعاً تقريبياً.
 */
export function geoNode(business: BusinessInfo): JsonLdNode | null {
  const latitude = coordinate(business.latitude, 90);
  const longitude = coordinate(business.longitude, 180);
  if (latitude === null || longitude === null) return null;
  return { "@type": "GeoCoordinates", latitude, longitude };
}

/**
 * بطاقة النشاط المحلي.
 *
 * ⚠ **`areaServed` تغيّر سلوكه بقصد ووجب التصريح به:** كان مثبَّتاً `"EG"` في
 * الكود يخرج لكل نسخة whitelabel مهما كان بلدها (نقضٌ صريح لـ D-04)، وصار من
 * `settings.business.areaServed`. فالقائمة الفارغة **لا تُخرج الحقل إطلاقاً**
 * بدل أن تُخرج بلداً لم يقله المالك. وهذا الفرق الوحيد عن مخرجات ما قبل التوسعة،
 * وشاشة الفحص تعلنه للمالك بدل أن تدفنه.
 */
export function localBusinessNode(input: {
  ids: SiteNodeIds;
  baseUrl: string;
  name: string;
  description: string | null;
  inLanguage: string;
  telephone: string | null;
  sameAs: string[];
  business: BusinessInfo;
  hasLogo: boolean;
}): JsonLdNode {
  const image = input.hasLogo ? { "@id": input.ids.logo } : null;
  return withPresent(
    {
      "@type": "LocalBusiness",
      "@id": input.ids.business,
      name: input.name,
      url: input.baseUrl,
      inLanguage: input.inLanguage,
      parentOrganization: { "@id": input.ids.organization },
    },
    {
      description: text(input.description),
      image,
      logo: image,
      address: postalAddressNode(input.business),
      geo: geoNode(input.business),
      openingHours: text(input.business.openingHours),
      priceRange: text(input.business.priceRange),
      areaServed: textList(input.business.areaServed),
      /**
       * ⚠ **بالصيغة الدولية لا كما خُزّن، والتطبيع هنا لا عند المنادي.**
       *
       * كان `text(input.telephone)` فيخرج `"telephone":"01010000506"` — وهذا
       * الحقل بالذات لا يقرؤه إنسان بل زاحف: schema.org تنصّ على الصيغة الدولية،
       * وجوجل يبني منه زرّ الاتصال بجوار نتيجة البحث ويطابق الرقم مع بطاقة
       * «الأنشطة التجارية». والرقم المحلي **بلا سياق بلد** لا يُطابق شيئاً؛ فلا
       * زرّ ولا ربط — أي أن أثمن إشارةٍ محلية في هذا المنتج كانت تخرج مهدورة.
       *
       * وموضع التطبيع داخل الباني قصدٌ لا كسل: **شاشة فحص السيو تنادي بناة هذا
       * الملف نفسها** لتقول للمالك ما يخرج فعلاً (انظر ترويسة `lib/seo/audit.ts`).
       * فلو طُبِّع عند المنادي في `components/seo/JsonLd.tsx` لصار للحقل مصدران:
       * ما يُصدَّر، وما تظنّه الشاشة — وهو النمط ٢ بعينه. و`auditBusiness` تنادي
       * `e164Number` نفسها للسبب ذاته، تماماً كما تنادي `sameAsList` أدناه.
       */
      telephone: e164Number(input.telephone),
      sameAs: sameAsList(input.sameAs),
    }
  );
}

/* ------------------------------------------------------------------ */
/* (٦) عقد الصفحات: قائمة الخدمات وخدمةٌ ومسار تنقّل                     */
/* ------------------------------------------------------------------ */

/** قائمة الخدمات في الرئيسية — كل عنصر يشير إلى مقدّمه بـ`@id` لا بنسخة منه */
export function servicesItemListNode(input: {
  providerId: string;
  services: { title: string; short: string }[];
}): JsonLdNode | null {
  if (input.services.length === 0) return null;
  return {
    "@type": "ItemList",
    itemListElement: input.services.map((service, index) => ({
      "@type": "ListItem",
      position: index + 1,
      item: {
        "@type": "Service",
        name: service.title,
        description: service.short,
        provider: { "@id": input.providerId },
      },
    })),
  };
}

/**
 * عقدة خدمة لصفحة خدمة واحدة.
 *
 * الوصف من `pages.meta.description` وحده: الوصف الافتراضي العام يصف الموقع كله،
 * ووضعه هنا يجعل الخدمات الست تُعرّف نفسها بنصّ واحد — أي محتوى مكرر يُقدَّم
 * لمحرك البحث في بياناته المهيكلة بيده. وغيابه أنظف من تكراره.
 *
 * و`@id` يحمل رابط الصفحة بلغتها: النسخة الإنجليزية مستندٌ آخر لا نسخةٌ من
 * العربية، ودمجهما في معرّف واحد يجعل الوصفين يتنازعان عقدةً واحدة.
 */
export function serviceNode(input: {
  url: string;
  name: string;
  description: string | null;
  providerId: string;
  areaServed: string[];
}): JsonLdNode | null {
  const name = text(input.name);
  if (name === null) return null;
  return withPresent(
    {
      "@type": "Service",
      "@id": `${input.url}#service`,
      name,
      url: input.url,
      provider: { "@id": input.providerId },
    },
    {
      description: text(input.description),
      areaServed: textList(input.areaServed),
    }
  );
}

export type BreadcrumbEntry = { name: string; url: string };

/**
 * مسار التنقّل — يُظهر في نتيجة البحث سطرَ المسار بدل رابط خام طويل.
 *
 * ⚠ **درجتان لا ثلاث، وهذا ليس نقصاً:** لا صفحة فهرس لـ`/services` ولا
 * لـ`/routes` في `app/` (المقطع `[slug]` وحده)، فدرجةٌ وسطى تشير إليهما تعلن
 * لمحرك البحث رابطاً يردّ ٤٠٤ — ومسار تنقّل يقود إلى العدم أسوأ من غيابه.
 * فإن وُجدت صفحة فهرس يوماً، تُضاف الدرجة هنا وحدها.
 *
 * وأقلّ من درجتين لا يُخرج شيئاً: «الرئيسية» وحدها ليست مساراً.
 */
export function breadcrumbNode(input: {
  id: string;
  entries: BreadcrumbEntry[];
}): JsonLdNode | null {
  const entries = input.entries.flatMap((entry) => {
    const name = text(entry.name);
    const url = text(entry.url);
    return name === null || url === null ? [] : [{ name, url }];
  });
  if (entries.length < 2) return null;
  return {
    "@type": "BreadcrumbList",
    "@id": input.id,
    itemListElement: entries.map((entry, index) => ({
      "@type": "ListItem",
      position: index + 1,
      name: entry.name,
      item: entry.url,
    })),
  };
}
