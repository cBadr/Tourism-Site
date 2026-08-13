import { authorizeDispatchRequest, dispatchDenied, NO_STORE } from "@/lib/dispatch/guard";
import { getDispatchStats, runDispatchTick } from "@/lib/dispatch/tick";
import { createServiceSupabase } from "@/lib/supabase/admin";
import { runStaleSweep } from "@/lib/trip-settings";

/**
 * مسار دورة البث (المرحلة ٦).
 *
 *   POST /api/dispatch/tick        ← يشغّل دورة بث ويرجع ملخّصها
 *   GET  /api/dispatch/tick        ← إحصاء طابور البث (بلا أي كتابة)
 *   GET  /api/dispatch/tick?run=1  ← يشغّل دورة أيضاً (مهام Vercel Cron ترسل GET فقط)
 *
 * الحماية **نفس حماية عامل الإشعارات حرفياً** (`lib/dispatch/guard.ts`):
 * ترويسة `x-dispatch-key` تُطابَق بـ `NOTIFY_DISPATCH_KEY`، ويُقبل
 * `Authorization: Bearer <key>` لأن Vercel Cron يرسل السرّ بهذه الصيغة، ويُقبل
 * `CRON_SECRET` كمفتاح بديل. بلا أي مفتاح: مقفل في الإنتاج، مسموح في التطوير من
 * localhost وحدها.
 *
 * لماذا مسار HTTP لا `pg_cron`؟ لأن وجود `pg_cron` غير مضمون على كل مشروع
 * Supabase (عقد المرحلة ٦)، فالآلية المعتمَدة نداء HTTP من مهمة مجدولة أو من زر
 * في اللوحة، وأي جدولة داخل القاعدة إضافة لا بديل.
 *
 * الدورة نفسها لا ترمي استثناءً أبداً، لذلك كل رد هنا JSON صالح: النجاح ملخّص،
 * والفشل ملخّص فيه `reason` ورمز حالة يميّز «إعداد ناقص» عن «خلل تشغيلي».
 *
 * ومنذ الدفعة ٢ (هجرة 0027) تحمل الدورة عملاً ثانياً: بعد نجاح البث يُشغَّل
 * **كنس الطلبات غير المدفوعة** (`cancel_stale_bookings`) وتظهر عدّاداته في
 * المفتاح `sweep` من نفس الرد. لا يغيّر رمز الحالة ولا نتيجة البث بحال.
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** إعداد ناقص أو هجرة 0013 غير مطبَّقة ⇒ ٥٠٣ حتى تنبّه المهمةُ المجدولة المالكَ */
const NOT_READY = new Set(["no-service-client", "no-function", "no-table", "read-failed"]);
/** الدالة موجودة وفشلت، أو خلل في الغلاف ⇒ ٥٠٠ */
const FAILED = new Set(["rpc-failed", "worker-error"]);

function statusFor(reason: string | undefined): number {
  if (!reason) return 200;
  if (NOT_READY.has(reason)) return 503;
  if (FAILED.has(reason)) return 500;
  return 200; // already-running وغيره: حالة تشغيل عادية لا خطأ
}

/**
 * كنس الطلبات غير المدفوعة على نفس الدورة (الملاحظة ٣، هجرة 0027).
 *
 * لماذا هنا ولا مسار ولا جدولة جديدة؟ لأن هذه هي المهمة المجدولة الوحيدة
 * المضمونة على كل نسخة (‏`pg_cron` غير مضمون على مشاريع Supabase — عقد المرحلة ٦)،
 * وإضافة مسار ثانٍ تعني سرّاً ثانياً وجدولة ثانية تُنسى.
 *
 * وكما تُستدعى `startDispatchFor` بعد اعتماد التحويل: **الدالة لا ترمي استثناءً
 * أبداً ولا تغيّر نتيجة الدورة**. حالة الرد ورمزها يبقيان من `summary` وحده —
 * كنسٌ فشل لا يجعل دورة بثٍّ نجحت تبدو فاشلة للمهمة المجدولة، وسببه يظهر في
 * `sweep.reason` ليقرأه المالك. والبوابة الحقيقية داخل القاعدة: مفتاح
 * `unpaid_cancel_enabled` مطفأ ⇒ يرجع الكنس صفرين بهدوء.
 *
 * ولا يعمل الكنس إلا بعد **نجاح** الدورة: `ok = false` يعني بيئة ناقصة أو هجرة
 * غير مطبَّقة، وإلغاء حجوزات على قاعدة بهذا الوصف آخر ما نريد.
 */
async function sweepStale(ok: boolean) {
  if (!ok) return { ok: false, scanned: 0, cancelled: 0, failed: 0, reason: "tick-not-run" };

  const { ok: swept, scanned, cancelled, failed, reason } =
    await runStaleSweep(createServiceSupabase());
  return { ok: swept, scanned, cancelled, failed, ...(reason ? { reason } : {}) };
}

async function runAndRespond(): Promise<Response> {
  const summary = await runDispatchTick();
  const sweep = await sweepStale(summary.ok);

  return Response.json(
    { ...summary, sweep },
    { status: statusFor(summary.reason), headers: NO_STORE }
  );
}

export async function POST(request: Request): Promise<Response> {
  const denial = authorizeDispatchRequest(request);
  if (denial) return dispatchDenied(denial);

  return runAndRespond();
}

export async function GET(request: Request): Promise<Response> {
  const denial = authorizeDispatchRequest(request);
  if (denial) return dispatchDenied(denial);

  // Vercel Cron لا يرسل إلا GET — لذلك ?run=1 يشغّل نفس دورة POST
  const run = new URL(request.url).searchParams.get("run");
  if (run === "1" || run === "true") return runAndRespond();

  const stats = await getDispatchStats();
  return Response.json(stats, { status: statusFor(stats.reason), headers: NO_STORE });
}
