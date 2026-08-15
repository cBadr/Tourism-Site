import "server-only";

import { createServiceSupabase } from "@/lib/supabase/admin";
import { readTripSettings } from "@/lib/trip-settings";

/**
 * مهلة حجز الطلب غير المدفوع — **قراءةُ ما تقرّره القاعدة، لا حسابٌ يوازيه.**
 *
 * ── لماذا هذا الملف أصلاً ─────────────────────────────────────────────────
 * رفع بدر `unpaid_timeout_minutes` إلى ٣٦٠ بنفسه من اللوحة (2026-08-15)،
 * والعميل لا يُقال له شيء: يفتح صفحته بعد يومين فيجدها ملغاة. فالمطلوب سطرٌ
 * يقول **متى** — في الحاسبة قبل التأكيد، وفي صفحة المتابعة بعده.
 *
 * ── ⚠ والجملة السهلة كاذبة ────────────────────────────────────────────────
 * «ست ساعات من الآن» **خطأ** منذ الهجرة `0052`. الكنس لم يعد يقيس عمر الحجز
 * وحده؛ صار يسأل `booking_hold_until(created_at, pickupAt)` وهي:
 *
 *     greatest( created_at + المهلة ,  pickupAt − المهلة )
 *
 * أي **الأبعد** من الأمرين. فحجزٌ لرحلةٍ بعد شهر محفوظ حتى ست ساعات قبل
 * موعدها — أي قرابة الشهر لا ست ساعات — وحجزُ رحلةٍ بعد ساعتين محفوظ ست ساعات
 * كاملة رغم أن موعده يمرّ خلالها. ومن كتب «٣٦٠ دقيقة من الإنشاء» في الواجهة
 * أخاف عميلاً لا داعي لإخافته، وطمأن آخر بلا حق.
 *
 * ولذلك **لا تُحسب هذه المعادلة هنا إطلاقاً**: تُنادى الدالة نفسها التي ينادي
 * بها الكنس (‏`cancel_stale_bookings` تستدعيها حرفياً في شرطها وفي ترتيبها).
 * وهي ممنوحة لـ`anon` عمداً في `0052` — بنصّ تعليقها: «تعريفٌ واحد تعرضه
 * الواجهة نفسها». فالتاريخ المشتقّ سطحٌ عام بقرارٍ سابق، لا كشفٌ نُحدثه اليوم.
 *
 * ── ولماذا يُقرأ المفتاح كذلك ─────────────────────────────────────────────
 * `booking_hold_until` تحسب التاريخ ولو كان الكنس **مطفأً** — لا تنظر إلى
 * `unpaid_cancel_enabled` أصلاً. فبلا قراءة المفتاح كنّا نقول «حجزك محفوظ حتى
 * كذا» بينما لا شيء يُلغى في هذا الموقع أبداً: تهديدٌ لا يقع. والمفتاح في
 * `trip_settings` وسياسة قراءته `is_admin()` و`trip_config()` غير ممنوحة لأي
 * دور مستخدم (‏عمداً — `lib/trip-settings.ts` §لماذا لا trip_config)، فالقراءة
 * بعميل الخدمة وحدها، وهي **قراءة صفٍّ واحد لا كتابة**.
 *
 * ── والفشل يقع صامتاً ─────────────────────────────────────────────────────
 * بلا `SUPABASE_SERVICE_ROLE_KEY`، أو بهجرةٍ غير مطبَّقة، أو بأي خطأ: يعود
 * `enabled: false` فلا تُصيَّر جملة المهلة أصلاً. **الصمت هو الاتجاه الآمن**
 * هنا: موعدٌ مخترَع أسوأ من لا موعد.
 */

export type PaymentHold = {
  /**
   * الكنس التلقائي مفعَّل **فعلاً** — وهو شرط عرض أي جملة مهلة. `false` يعني
   * إمّا أن المالك أطفأه، وإمّا أننا لم نستطع القراءة؛ وكلاهما يُسكِت السطر.
   */
  enabled: boolean;
  /**
   * ISO — **أبكر** لحظة يجوز فيها الإلغاء التلقائي.
   *
   * 🔒 «أبكر» لا «موعد الإلغاء»: الكنس يستثني كذلك كل حجزٍ عليه نشاط إيصالٍ
   * حديث (‏`0028`)، فمن رُفض إيصاله اليوم تمتدّ مهلته أبعد من هذا التاريخ ولا
   * تقصر عنه أبداً. فالرقم أرضيةٌ آمنة، وصياغة الواجهة تقول «محفوظ حتى» ولا
   * تقول «يُلغى في» — والفرق بينهما هو الفرق بين وعدٍ نفي به ووعدٍ نخلفه.
   */
  holdUntil: string | null;
};

const NO_HOLD: PaymentHold = { enabled: false, holdUntil: null };

/** طابع زمني صالح فقط — أي نصّ آخر يصير `null` ولا يُمرَّر إلى القاعدة */
function isoOrNull(value: string | null | undefined): string | null {
  if (typeof value !== "string" || value.trim().length === 0) return null;
  return Number.isFinite(Date.parse(value)) ? value : null;
}

/**
 * متى يبقى هذا الحجز محفوظاً؟
 *
 * @param createdAtIso لحظة إنشاء الحجز — أو **الآن** حين تكون هذه معاينةً قبل
 *   الإنشاء (خطوة الدفع في الحاسبة). والفارق بين لحظة المعاينة ولحظة التأكيد
 *   دقائق، وهي معاينة معلنة كمعاينة العربون تماماً؛ والرقم المُلزِم يظهر في
 *   صفحة المتابعة وهي مصدره الوحيد.
 * @param pickupAtIso موعد الانطلاق من لقطة الرحلة — و`null` يعني «بلا موعد»،
 *   وهي حالةٌ تتعامل معها القاعدة بالعمر وحده.
 */
export async function readPaymentHold(
  createdAtIso: string | null,
  pickupAtIso: string | null
): Promise<PaymentHold> {
  const createdAt = isoOrNull(createdAtIso);
  if (createdAt === null) return NO_HOLD;

  const service = createServiceSupabase();
  if (!service) return NO_HOLD;

  try {
    const { settings, loaded } = await readTripSettings(service);
    // لم نقرأ الصف، أو قرأناه والمفتاح مطفأ ⇒ لا إلغاء تلقائي يُخبَر عنه
    if (!loaded || !settings.unpaidCancelEnabled) return NO_HOLD;

    const { data, error } = await service.rpc("booking_hold_until", {
      p_created_at: createdAt,
      p_pickup_at: isoOrNull(pickupAtIso),
    });

    if (error) return NO_HOLD;

    const holdUntil = isoOrNull(typeof data === "string" ? data : null);
    return holdUntil === null ? NO_HOLD : { enabled: true, holdUntil };
  } catch {
    return NO_HOLD;
  }
}
