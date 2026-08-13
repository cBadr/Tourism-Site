/**
 * ترجمة اسم الحدث الموحّد إلى اسمه لدى كل مزوّد.
 *
 * العقد (`lib/analytics-types.ts`) ينص: «الاسم موحّد عبر كل المزوّدين، ويُترجَم
 * داخل كل محوّل إلى اسمه لدى المزوّد (مثلاً `booking_paid` ⇒ `purchase` في GA4
 * و`Purchase` في ميتا)». هذا الملف هو ذلك المحوّل، ومكانه واحد لسبب واحد:
 * لو تكرّر الجدول في محوّل المتصفح ومحوّل الخادم لانحرف أحدهما يوماً ما، فيصير
 * حدث الشراء الخادمي باسم غير حدث الشراء من المتصفح ⇒ ازدواج في تقارير ميتا
 * بدل إزالة التكرار.
 *
 * ── لماذا هذه المطابقات تحديداً ─────────────────────────────────────────────
 * أسماء GA4 من قائمة الأحداث الموصى بها، وأسماء ميتا من قائمة الأحداث القياسية
 * (Standard Events). ما لا مقابل قياسي له عندنا يأخذ أقرب مقابل **صادقاً**:
 *
 *   search_performed → search / Search              زائر بحث عن رحلة
 *   quote_viewed     → view_item_list / ViewContent ظهرت له قائمة العروض
 *   quote_requested  → generate_lead / Lead         ترك بياناته لعرض سعر يدوي
 *   booking_created  → begin_checkout / InitiateCheckout  أنشأ حجزاً غير مدفوع
 *   booking_started  → add_payment_info / AddPaymentInfo  اختار بوابة وبدأ الدفع
 *   booking_paid     → purchase / Purchase          وصل التحصيل فعلاً
 *
 * ملاحظة على `booking_created` مقابل `booking_paid`: الحجز يُنشأ **قبل** الدفع
 * في هذه المنصة (حالته `pending_payment`)، فلو أُرسل بوصفه `purchase` لصار كل
 * حجز مهجور إيراداً في تقارير جوجل وميتا — وهذا بالضبط ما يجعل أرقام الإعلانات
 * تبدو ممتازة وهي كاذبة. الشراء حدث واحد ومكانه نقطة تأكيد التحصيل وحدها.
 */

import type { FunnelEvent } from "@/lib/analytics-types";

export type ProviderEventNames = {
  /** اسم الحدث في GA4 / dataLayer */
  ga4: string;
  /** اسم الحدث القياسي في ميتا (بكسل وCAPI معاً) */
  meta: string;
};

export const PROVIDER_EVENT_NAMES: Record<FunnelEvent, ProviderEventNames> = {
  search_performed: { ga4: "search", meta: "Search" },
  quote_viewed: { ga4: "view_item_list", meta: "ViewContent" },
  quote_requested: { ga4: "generate_lead", meta: "Lead" },
  booking_created: { ga4: "begin_checkout", meta: "InitiateCheckout" },
  booking_started: { ga4: "add_payment_info", meta: "AddPaymentInfo" },
  booking_paid: { ga4: "purchase", meta: "Purchase" },
};

export function providerEventNames(event: FunnelEvent): ProviderEventNames {
  return PROVIDER_EVENT_NAMES[event];
}
