"use server";

import { readLeadTime, type LeadTime } from "./lead-time";
import { readPhoneEcho, type PhoneEcho } from "./phone-echo";

/**
 * إجراءان خادميان يخدمان جزيرة الحاسبة — **بلا مسارٍ عام جديد.**
 *
 * نفس تعليل `hold-action.ts` حرفياً: نموذج الحجز يعيش داخل ويدجت العميل
 * (`search-widget` ← `offers` ← `checkout`) وهي جزيرةٌ تُركَّب في أكثر من صفحة
 * خادمية، فتمريرُ القيم عبر كل شجرة الاستدعاء أثقل من دالتين خادميتين. ولا
 * يُنشأ مسار تحت `app/` لأجل قراءتين.
 *
 * ── وماذا يكسب مناديهما ──────────────────────────────────────────────────
 * الدالة الخادمية نقطةُ HTTP عامة بطبعها، فالسؤال ليس «من يناديها» بل «ماذا
 * يكسب مناديها»:
 *
 * • `previewLeadTime` تُخرج **أقرب موعد متاح ومدّة المهلة** — وهو بعينه ما
 *   تقوله رسالةُ الرفض لأي زائر يحاول موعداً أقرب. أي أنها لا تكشف شيئاً لا
 *   يناله بمحاولةٍ واحدة، وتوفّر عليه المحاولة.
 *
 * • `previewPhoneEcho` تُخرج **الشكل المعياري لنصٍّ أرسله المنادي نفسه**.
 *   `normalize_phone` دالةٌ نصّية صرفة `immutable` لا تلمس صفاً ولا تقرأ
 *   إعداداً — فالمنادي يستعيد ما أعطاه بعد تنسيقه، لا أكثر. ولا تُنادى إلا
 *   بهاتفٍ يكتبه صاحبه في نموذجه.
 */
export async function previewLeadTime(): Promise<LeadTime> {
  return readLeadTime();
}

export async function previewPhoneEcho(phone: string): Promise<PhoneEcho> {
  return readPhoneEcho(phone);
}
