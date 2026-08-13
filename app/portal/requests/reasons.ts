/**
 * أسباب اعتذار المتعهد عن عرض — قائمة قصيرة مقصودة.
 *
 * السبب اختياري دائماً (الرفض السريع أنفع للجميع من عرض يتعفن حتى تنتهي مهلته)،
 * لكن حين يُختار فهو إشارة تشغيلية حقيقية: «المستحق لا يغطي تكلفتي» تعني مراجعة
 * تسعير مسار، و«خارج نطاقي فعلاً» تعني مراجعة تغطية قائمة أسعار. لذلك القيم رموز
 * ثابتة تُخزَّن كما هي، والنص العربي وحده هو ما يتغير.
 *
 * الوحدة منفصلة عن `actions.ts` عمداً: ملف الـ "use server" لا يُصدِّر إلا دوالّ
 * غير متزامنة، فلا مكان فيه لثابت مشترك بين النموذج والإجراء.
 */

export const REJECT_REASONS = [
  { value: "busy", label: "مرتبط برحلة أخرى في نفس الموعد" },
  { value: "no_vehicle", label: "لا تتوفر لدي مركبة مناسبة لهذه الفئة" },
  { value: "out_of_range", label: "الموقع خارج نطاق تشغيلي فعلياً" },
  { value: "payout_low", label: "المستحق لا يغطي تكلفتي في هذه الرحلة" },
  { value: "timing", label: "الموعد لا يناسب جدولي" },
  { value: "other", label: "سبب آخر" },
] as const;

export type RejectReasonCode = (typeof REJECT_REASONS)[number]["value"];

export function rejectReasonLabel(code: string | null): string | null {
  if (!code) return null;
  return REJECT_REASONS.find((reason) => reason.value === code)?.label ?? null;
}
