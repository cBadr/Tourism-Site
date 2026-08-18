import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { sendWebPush, type SendOptions } from "@/lib/push/send";
import { isGone, type PushDeliveryReport, type PushPayload } from "@/lib/push/types";

/**
 * التسليمُ إلى **أجهزة عميلٍ واحد** — كلُّ أجهزةِ حجزٍ بعينه دفعةً واحدة.
 *
 * ══════════════════════════════════════════════════════════════════════════
 *  لماذا هنا ولا يُنادى `deliverPushToPartner` (‏القاعدة الذهبية ١٢)
 * ══════════════════════════════════════════════════════════════════════════
 *
 * التشفيرُ والتوقيعُ والمهلةُ وقراءةُ VAPID **مفوَّضةٌ كاملةً** إلى
 * `sendWebPush` — ولا سطرَ منها منسوخٌ هنا. والمنسوخُ هو الحلقةُ وحدها، وسببُه
 * مقيسٌ لا ذوقيّ: `deliverPushToTargets` في `lib/push/deliver.ts` تكنس
 * الاشتراكاتِ الميتة بـ`delete … from "partner_push_subscriptions"` — **اسمُ
 * الجدول مكتوبٌ في جسمها**. فمناداتُها على أجهزة عميلٍ كانت تفعل شيئين
 * خاطئين معاً:
 *
 *   ١. تحذف من **جدول المتعهدين** صفوفاً بعناوينَ ليست لهم.
 *   ٢. **ولا تحذف** صفَّ العميل الميت — فيبقى `customer_channels` تعدّ
 *      `customer_push` قناةً **بالغة**، فيُحسب العميلُ «متاحاً» ولا يصله شيء.
 *      وهو حرفياً العيبُ الذي وُجدت له موجةُ دفعِ المتعهد كلُّها (البند ٢ في
 *      ترويسة `lib/push/deliver.ts`).
 *
 * ⚠ **والعلاجُ الصحيح تعميمُ `deliverPushToTargets` بمعامل جدول** — وهو ملفٌّ
 *   خارج نطاق هذه الجبهة، فلم يُحرَّر ويُبلَّغ بدلاً من ذلك. ومتى عُمِّم يُحذف
 *   هذا الملفُّ ويُنادى الأصل.
 */

/** أعمدةُ الاشتراك التي يقرؤها هذا الملف — `endpoint` لا يخرج من الخادم */
const SUBSCRIPTION_COLUMNS = "id, endpoint, p256dh, auth";

type SubscriptionRow = {
  id: string;
  endpoint: string;
  p256dh: string;
  auth: string;
};

/**
 * يرسل إلى كل أجهزة العميل المسجَّلة على هذا الحجز، ويحذف ما مات منها في
 * الدورة نفسها.
 *
 * لا يرمي أبداً — الفشلُ يعود في `reason`، ومناديه يقرّر ماذا يعني `sent = 0`.
 */
export async function deliverPushToCustomer(
  supabase: SupabaseClient,
  bookingId: string,
  payload: PushPayload,
  options: SendOptions = {}
): Promise<PushDeliveryReport> {
  const empty: PushDeliveryReport = { targets: 0, sent: 0, failed: 0, pruned: 0, reason: null };

  const res = await supabase
    .from("customer_push_subscriptions")
    .select(SUBSCRIPTION_COLUMNS)
    .eq("booking_id", bookingId);

  if (res.error) return { ...empty, reason: `read-failed: ${res.error.message}` };

  const rows = (res.data ?? []) as SubscriptionRow[];
  if (rows.length === 0) return { ...empty, reason: "no-recipient" };

  // متوازٍ لا متتابع: عميلٌ بهاتفٍ وحاسوبٍ وخدمةٌ بطيئة = مهلتان متتابعتان
  // داخل دورةِ عاملٍ لها ميزانيةٌ زمنية.
  const results = await Promise.all(
    rows.map(async (row) => ({ row, outcome: await sendWebPush(row, payload, options) }))
  );

  const dead = results.filter((r) => isGone(r.outcome)).map((r) => r.row.id);
  const alive = results.filter((r) => r.outcome.ok).map((r) => r.row.id);

  let pruned = 0;
  if (dead.length > 0) {
    // 🔒 الحذفُ **بالمعرّف** لا بالعنوان: متصفحٌ واحد قد يتابع حجزين بالعنوان
    //    نفسه (الفريدُ في القاعدة `(booking_id, endpoint)`)، وحذفٌ بالعنوان
    //    كان يُسقط اشتراكَ حجزٍ آخر ما زال حيّاً.
    const del = await supabase
      .from("customer_push_subscriptions")
      .delete()
      .in("id", dead)
      .select("id");
    // فخّ الصفوف الصفرية (اتفاقية ٤): «نجاح» بصفر صفوف = RLS رفضت الحذف
    pruned = del.error ? 0 : (del.data?.length ?? 0);
  }

  if (alive.length > 0) {
    await supabase
      .from("customer_push_subscriptions")
      .update({ last_seen_at: new Date().toISOString() })
      .in("id", alive);
  }

  const sent = alive.length;
  const failed = results.length - sent;

  const firstProblem = results.find((r) => !r.outcome.ok)?.outcome;
  const reason =
    sent > 0
      ? null
      : firstProblem && !firstProblem.ok
        ? "skipped" in firstProblem
          ? firstProblem.skipped
          : firstProblem.error
        : "unknown";

  return { targets: results.length, sent, failed, pruned, reason };
}
