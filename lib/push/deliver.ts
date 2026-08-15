import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { sendWebPush, type SendOptions } from "@/lib/push/send";
import { isGone, type PushDeliveryReport, type PushPayload, type PushTarget } from "@/lib/push/types";

/**
 * التسليم إلى **كل أجهزة متعهد** دفعةً واحدة — الطبقة التي ينادينها طبقةُ
 * الإشعارات، فلا تعرف شيئاً عن VAPID ولا عن `aes128gcm`.
 *
 * ── ثلاثة قرارات في هذا الملف وحده ─────────────────────────────────────────
 *
 * 1. **«نجح» = جهازٌ واحد على الأقل.** متعهدٌ له هاتفٌ وحاسوب، والحاسوب مغلق
 *    ⇒ الرسالة وصلت. أما صفرُ نجاحٍ فتعذّرُ بلوغ، وهو ما يستحق التصعيد إلى
 *    التشغيل (`partner-unreachable`) — والفرق بينهما هو الفرق بين إنسانٍ
 *    يُتصل به وإنسانٍ لا يُزعج.
 *
 * 2. 🔒 **الاشتراك الميت يُحذف في الدورة نفسها.** لا كنسٌ ليليّ ولا مهمة
 *    مجدولة: صفٌّ ميت يُبقي `partner_channels` تعدّ `webpush` قناةً **بالغة**،
 *    فيُحسب صاحبه «متاحاً» ويشمله البثّ ولا يصله شيء — وهو **العيب الذي وُجدت
 *    هذه الموجة كلها لعلاجه**، فيُغلق حيث يُكتشف.
 *
 * 3. **التسليم متوازٍ.** `Promise.all` لا حلقة `await`: متعهدٌ بأربعة أجهزة
 *    وخدمةٌ بطيئة يعني أربع مهلٍ متتابعة (٤٠ ثانية) داخل دورة عاملٍ لها سقفها.
 */

/** أعمدة الاشتراك التي يقرؤها هذا الملف — `endpoint` لا يخرج من الخادم */
const SUBSCRIPTION_COLUMNS = "id, endpoint, p256dh, auth";

type SubscriptionRow = {
  id: string;
  endpoint: string;
  p256dh: string;
  auth: string;
};

export type DeliverOptions = SendOptions & {
  /**
   * تحديث `last_seen_at` بعد نجاح.
   *
   * ⚠ **ينجح بمفتاح الخدمة وحده**: `authenticated` بلا `update` على الجدول
   * بقرار `0055` (التحديث يمرّ بـ`portal_register_push` وحدها). فالفشل هنا
   * متوقَّع لا خطأ، ويُبتلع بصمت — والعمود يبقى صادقاً في المسار الذي يهمّ.
   */
  touchLastSeen?: boolean;
};

/**
 * يرسل إلى كل أجهزة المتعهد ويحذف ما مات منها.
 *
 * لا يرمي أبداً — الفشل يعود في `reason`. والمنادي هو من يقرّر ماذا يعني
 * `sent = 0` في سياقه (تصعيد · إعادة محاولة · لا شيء).
 */
export async function deliverPushToPartner(
  supabase: SupabaseClient,
  subcontractorId: string,
  payload: PushPayload,
  options: DeliverOptions = {}
): Promise<PushDeliveryReport> {
  const empty: PushDeliveryReport = { targets: 0, sent: 0, failed: 0, pruned: 0, reason: null };

  const res = await supabase
    .from("partner_push_subscriptions")
    .select(SUBSCRIPTION_COLUMNS)
    .eq("subcontractor_id", subcontractorId);

  if (res.error) return { ...empty, reason: `read-failed: ${res.error.message}` };

  const rows = (res.data ?? []) as SubscriptionRow[];
  if (rows.length === 0) return { ...empty, reason: "no-recipient" };

  return deliverPushToTargets(supabase, rows, payload, options);
}

/**
 * نفس المنطق على قائمة اشتراكاتٍ قُرئت سلفاً — يخدم مسار «أرسل تنبيهاً
 * تجريبياً» في البورتال بلا استعلامٍ ثانٍ.
 */
export async function deliverPushToTargets(
  supabase: SupabaseClient,
  rows: (PushTarget & { id?: string })[],
  payload: PushPayload,
  options: DeliverOptions = {}
): Promise<PushDeliveryReport> {
  if (rows.length === 0) {
    return { targets: 0, sent: 0, failed: 0, pruned: 0, reason: "no-recipient" };
  }

  const results = await Promise.all(
    rows.map(async (row) => ({ row, outcome: await sendWebPush(row, payload, options) }))
  );

  const dead = results.filter((r) => isGone(r.outcome)).map((r) => r.row.endpoint);
  const alive = results.filter((r) => r.outcome.ok).map((r) => r.row.endpoint);

  let pruned = 0;
  if (dead.length > 0) {
    const del = await supabase
      .from("partner_push_subscriptions")
      .delete()
      .in("endpoint", dead)
      .select("id");
    // فخّ الصفوف الصفرية (اتفاقية ٤): «نجاح» بصفر صفوف يعني أن RLS رفضت الحذف
    pruned = del.error ? 0 : (del.data?.length ?? 0);
  }

  if (alive.length > 0 && options.touchLastSeen !== false) {
    await supabase
      .from("partner_push_subscriptions")
      .update({ last_seen_at: new Date().toISOString() })
      .in("endpoint", alive);
  }

  const sent = alive.length;
  const failed = results.length - sent;

  // سببٌ واحد للسجل — أول فشلٍ يمثّل البقية عادةً (الخدمة نفسها لكل الأجهزة)
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
