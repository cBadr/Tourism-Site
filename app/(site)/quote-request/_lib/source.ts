/**
 * وسومُ الحملة في رابط `/quote-request` — قراءةً وتنقية.
 *
 * ── لماذا هذا الملف ────────────────────────────────────────────────────────
 * بدر يريد أن يعرف **من أيّ حملةٍ جاء الطلب**، والحملة تصل في معاملات الرابط
 * (`utm_source` · `utm_medium` · `utm_campaign`) — وهي المتعارف عليه في جوجل
 * وميتا وكل من يشتري نقرة. وهذا الملف هو نظير `prefill.ts` لتلك الوسوم:
 * يقرؤها على الخادم من `searchParams` ويسلّمها منقّاةً إلى جزيرة النموذج.
 *
 * ── والمبدأ الحاكم — نفس مبدأ `prefill.ts` حرفاً ───────────────────────────
 * 🔒 **هذه معاملات رابط، لا وقائع.** الرابط يُلصق ويُشارَك ويُصنع باليد، فما يصل
 * منه **مدخلُ مستخدمٍ غير موثوق** بكل معنى الكلمة. والفرق عن `prefill.ts` أن
 * هذه **تُخزَّن** في عمود ثم **تُعرض في لوحة المالك** — أي أن الإهمال هنا يصنع
 * متجهَ حقنٍ وتشويهٍ مكتمل الشروط، لا مجرد حقلٍ يُملأ خطأً.
 *
 * ولذلك التنقية هنا **قصٌّ مبكر لا حارس**: الحاجز ثلاث طبقاتٍ في Postgres
 * (`quote_source_tag` + مُشغّلٌ على الجدول + قيدُ شكل). وقواعد القصّ نفسها
 * تعيش في `lib/request-source-types.ts` مرةً واحدة يقرؤها الخادم والعميل معاً —
 * فلا يُبنى في هذا الملف اجتهادٌ ثانٍ ينحرف عنها (النمط ٨).
 */

import { normalizeSourceTag } from "@/lib/request-source-types";

/** ما تحمله وسومُ الحملة — والغائب أو الفاسد **يغيب** فلا يُخزَّن نصّاً فارغاً */
export type CampaignTags = {
  utmSource: string | null;
  utmMedium: string | null;
  utmCampaign: string | null;
};

export const EMPTY_CAMPAIGN_TAGS: CampaignTags = {
  utmSource: null,
  utmMedium: null,
  utmCampaign: null,
};

type SearchParamsShape = { [key: string]: string | string[] | undefined };

/** يقرأ مفتاحاً نصّياً واحداً — والمكرر (مصفوفة) يُهمَل كما يُهمَل الغائب */
function single(value: string | string[] | undefined): string | undefined {
  return typeof value === "string" ? value : undefined;
}

/**
 * يقرأ وسوم الحملة من معاملات الرابط.
 *
 * والوسم غير الصالح يخرج `null` ولا يُرفض الطلب: زائرٌ لصق رابطاً بوسمٍ قذر
 * لا يستحق أن يُمنع من طلب سيارة. ما يُفقد وسمٌ، وما كان سيُفقد **مبيع**.
 */
export function readCampaignTags(params: SearchParamsShape): CampaignTags {
  return {
    utmSource: normalizeSourceTag(single(params.utm_source)),
    utmMedium: normalizeSourceTag(single(params.utm_medium)),
    utmCampaign: normalizeSourceTag(single(params.utm_campaign)),
  };
}

/** هل في الرابط وسمُ حملةٍ أصلاً؟ */
export function hasCampaignTags(tags: CampaignTags): boolean {
  return Boolean(tags.utmSource || tags.utmMedium || tags.utmCampaign);
}
