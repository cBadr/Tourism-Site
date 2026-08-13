import "server-only";

import { createServiceSupabase } from "@/lib/supabase/admin";
import { isMissingFunction, isMissingTable, readDispatchSettings } from "@/lib/dispatch/settings";
import type { StartDispatchResult } from "@/lib/dispatch/types";

/**
 * إطلاق البث لحجز واحد — الغلاف حول `start_dispatch(p_booking_id uuid)`.
 *
 * يُستدعى من الخطاف التلقائي لحظة تحوّل الحجز إلى «مؤكَّد» (اعتماد التحويل في
 * اللوحة اليوم، و webhook الدفع في المرحلة ٨). ولذلك عقده صارم:
 *
 * **لا يرمي استثناءً أبداً، ولا يفشل الإجراء المُستدعي مهما حدث.** فشل البث
 * حالة تشغيلية يعالجها المالك من الطابور اليدوي؛ أما فشل *اعتماد التحويل* بسبب
 * البث فكارثة: العميل دفع والنظام يرفض تأكيد حجزه. لذلك كل مسار خطأ هنا ينتهي
 * بسجل واضح وقيمة راجعة، لا برمي.
 *
 * البوابة `autoStart` تُقرأ من `dispatch_settings`: لو أطفأها المالك يبقى الحجز
 * مؤكَّداً بلا بث وينتظر إطلاقاً يدوياً من لوحة الطلب. و`force: true` يتخطى
 * البوابة — للزر اليدوي «ابدأ البث الآن».
 *
 * السجل سطر JSON واحد يبدأ بـ `[dispatch:start]` ليسهل ترشيحه في سجلات Vercel.
 */

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function log(result: StartDispatchResult): StartDispatchResult {
  const line = JSON.stringify({
    at: new Date().toISOString(),
    bookingId: result.bookingId,
    started: result.started,
    reason: result.reason ?? null,
    detail: result.detail ?? null,
  });
  if (result.ok) console.info(`[dispatch:start] ${line}`);
  else console.warn(`[dispatch:start] ${line}`);
  return result;
}

export async function startDispatchFor(
  bookingId: string,
  options: { force?: boolean } = {}
): Promise<StartDispatchResult> {
  const id = typeof bookingId === "string" ? bookingId.trim() : "";

  if (!UUID_PATTERN.test(id)) {
    return log({ ok: false, bookingId: id, started: false, reason: "invalid-booking" });
  }

  try {
    const supabase = createServiceSupabase();
    if (!supabase) {
      return log({ ok: false, bookingId: id, started: false, reason: "no-service-client" });
    }

    if (!options.force) {
      const { settings } = await readDispatchSettings(supabase);
      if (!settings.autoStart) {
        // تخطٍّ مقصود لا فشل: ok=true حتى لا يظهر في السجل كخلل يستحق التحقيق
        return log({ ok: true, bookingId: id, started: false, reason: "auto-start-off" });
      }
    }

    const { data, error } = await supabase.rpc("start_dispatch", { p_booking_id: id });

    if (error) {
      // اتفاقية المشروع: كل `raise exception` في SQL يحمل `using hint = '<رمز>'`
      const hint = typeof error.hint === "string" ? error.hint.trim() : "";
      const reason = isMissingFunction(error.code)
        ? "no-function"
        : isMissingTable(error.code)
          ? "no-table"
          : hint !== ""
            ? hint
            : "rpc-failed";
      return log({ ok: false, bookingId: id, started: false, reason, detail: error.message });
    }

    // `start_dispatch` تنجح بلا استثناء في ثلاث حالات لا يُبَث فيها شيء:
    // دورة جارية بالفعل، أو لا مرشحين داخل سقف الموجة، أو استُنفدت الموجات.
    // تجاهل الصف الراجع كان يجعل اللوحة تعلن «بُثَّت موجة جديدة» في كل مرة.
    const row = (Array.isArray(data) ? data[0] : data) as
      | { status?: string; round?: number; offers?: number }
      | null
      | undefined;
    const offers = Number(row?.offers ?? 0);

    if (offers > 0) {
      return log({ ok: true, bookingId: id, started: true, detail: `offers=${offers}` });
    }

    const reason =
      row?.status === "manual"
        ? "rounds-exhausted"
        : row?.status === "assigned"
          ? "already-assigned"
          : row?.status === "broadcasting"
            ? "already-dispatching"
            : "no-candidates";

    return log({ ok: true, bookingId: id, started: false, reason });
  } catch (err) {
    return log({
      ok: false,
      bookingId: id,
      started: false,
      reason: "worker-error",
      detail: err instanceof Error ? err.message : "خطأ غير متوقع",
    });
  }
}
