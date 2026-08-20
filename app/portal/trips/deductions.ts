import "server-only";

import { cache } from "react";

import { isSchemaMissing, portalAccess } from "../_lib/session";

/**
 * الخصومات الواقعة على المتعهد — ولماذا لهذه الشاشة سطحٌ خاص بها (هجرة `0130`).
 *
 * البند ٨ من اتفاقية المتعهد المنشورة يشترط أن يكون مبرِّر الخصم المكتوب
 * «يُثبَّت في السجل **ويُتاح للمتعهد**». وقبل `0130` لم يكن للمتعهد سطحٌ يقرأ
 * منه ذلك إطلاقاً — وهو مقيسٌ لا مظنون:
 *
 *   • `portal_balance()` تُرجع **مجاميع** (‏مستحق · محصَّل · مدفوع · الصافي)
 *     ولا تُرجع بنداً واحداً، فالمتعهد يرى رصيده ينقص ولا يعرف عن أي رحلة.
 *   • `portal_trips()` لا تحمل السبب ولا الإجراء ولا المبلغ — **وهذا مقصود
 *     ومُختبَر** (‏`failed_trip_tests` (ط-١))، فلا يُضاف إليها.
 *   • و`booking_failures` و`trip_withdrawals` محجوبان عن `authenticated` كلياً
 *     (‏(ط-٢)) — وهو حاجزٌ يبقى: القراءة تمرّ عبر دالة `security definer`
 *     مقصورة على صاحب الجلسة، لا بمنحةٍ على الجدول.
 *
 * 🔒 **ولا وسيط هوية إطلاقاً**: نطاق `portal_deductions()` مثبَّتٌ داخلها عبر
 *    `current_subcontractor_id()`. أولُ وسيطٍ كهذا يحوّلها من دالةٍ مقصورة على
 *    صاحبها إلى تسريبٍ لكل متعهد عن كل متعهد (سابقة **D-20**) — وهي نفس القاعدة
 *    المكتوبة في `app/portal/_lib/balance.ts`.
 *
 * 🔒 وما لا يوجد في نوع الإرجاع لا يُسرَّب بخطأ في الواجهة: لا مرجعَ عميل
 *    (‏رمزُ الرحلة وحده)، ولا اسمَ عميل، ولا سعرَ رحلة، ولا هامش (**D-19**).
 *
 * ولا رقم يُحسب هنا: TypeScript يعرض ويُنسّق فقط (**D-05**).
 */

/** بندُ خصمٍ واحد كما يقرؤه صاحبه */
export type PortalDeduction = {
  /** `failure` رحلةٌ عُلِّمت فاشلة · `apology` خصمٌ نُفِّذ على اعتذارٍ بعد الإسناد */
  kind: "failure" | "apology";
  bookingId: string | null;
  /** رمزُ الرحلة في البورتال — لا مرجعُ العميل */
  tripCode: string | null;
  reasonLabel: string | null;
  amount: number | null;
  currency: string | null;
  /** المبرَّر المكتوب — هو بيتُ القصيد في هذا السطح كله */
  writtenReason: string | null;
  /**
   * رقمُ نسخة الاتفاقية التي كانت **مقبولةً منه** لحظةَ وقوع الواقعة (‏`0147`).
   *
   * 🔴 وليس زينة: البند ٨ يقول إن الخصم «يُقاس بالنسخة التي كانت مقبولةً منه
   * وقت وقوع الواقعة» — **ومن لا يعرف رقمَها لا يستطيع أن يحتجّ بها**. فالوعدُ
   * بحقِّ تظلّمٍ يستند إلى وثيقةٍ مجهولةِ الرقم وعدٌ ناقص.
   *
   * و`null` تعني **«قبل هذا النظام»** لا «بلا اتفاقية» — فالصفوفُ التي كُتبت
   * قبل `0147` لا ختمَ لها، والشاشةُ تصمت عنها بدل أن تكتب رقماً لم يُقَس.
   */
  agreementVersion: number | null;
  appliedAt: string | null;
};

export type DeductionsResult = {
  rows: PortalDeduction[];
  /** `false` ⇒ هجرة `0130` غير منفَّذة بعد — لا «لا خصومات» */
  ready: boolean;
  /** عطل قراءة — يُقال ولا يُعرض قائمةً فارغة */
  failed: boolean;
};

const rowsOf = (data: unknown): Record<string, unknown>[] =>
  Array.isArray(data) ? (data as Record<string, unknown>[]) : [];

const asText = (v: unknown): string | null =>
  typeof v === "string" && v.trim() !== "" ? v : null;

/** `null` = «لم يصل» لا «صفر» — صفرٌ مخترَع في شاشة مال كذبةٌ تتحول إلى نزاع */
const asNumber = (v: unknown): number | null => {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string" && v.trim() !== "") {
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  }
  return null;
};

export const loadDeductions = cache(async (): Promise<DeductionsResult> => {
  const access = await portalAccess();
  if (!access.ok) {
    return { rows: [], ready: access.code !== "schema", failed: false };
  }

  const res = await access.supabase.rpc("portal_deductions");
  if (res.error) {
    const missing = isSchemaMissing(res.error);
    return { rows: [], ready: !missing, failed: !missing };
  }

  const rows = rowsOf(res.data).map((row): PortalDeduction => {
    const kind = asText(row.kind);
    return {
      kind: kind === "apology" ? "apology" : "failure",
      bookingId: asText(row.booking_id),
      tripCode: asText(row.trip_code),
      reasonLabel: asText(row.reason_label),
      amount: asNumber(row.amount),
      currency: asText(row.currency),
      writtenReason: asText(row.written_reason),
      agreementVersion: asNumber(row.agreement_version),
      appliedAt: asText(row.applied_at),
    };
  });

  return { rows, ready: true, failed: false };
});
