import { errorJson, guard, NO_STORE } from "@/app/api/push/_shared";
import { deliverPushToTargets } from "@/lib/push/deliver";
import { buildPushPayload } from "@/lib/push/payload";
import type { PushTarget } from "@/lib/push/types";
import { isVapidReady } from "@/lib/push/vapid";
import { isSchemaMissing } from "@/lib/supabase/schema-errors";

/**
 * POST /api/push/test — تنبيهٌ تجريبي إلى أجهزة صاحب الجلسة وحدها.
 *
 * ── ولماذا هذا المسار ليس ترفاً ────────────────────────────────────────────
 *
 * سلسلة دفع الويب سبع حلقات: تصريح المتصفح ← عامل خدمة مسجَّل ← اشتراك ←
 * صفٌّ في القاعدة ← مفاتيح VAPID ← تشفير ← خدمة الدفع. وانقطاعُ أيٍّ منها يبدو
 * **متطابقاً** من وجهة نظر المتعهد: لا شيء يصل. فبلا زرٍّ يقول «جرّبها الآن»
 * يكتشف العطبَ يومَ يفوته عرضُ رحلة — وهو اليوم الذي وُجدت القناة كلها لمنعه.
 *
 * والتجربة تسلك **نفس** مسار الإرسال الحقيقي حرفاً بحرف (`deliverPushToTargets`)،
 * لا مساراً مبسَّطاً بجواره: نسخةُ اختبارٍ تنجح بينما يفشل الأصل أسوأ من لا
 * اختبار (النمط ٩ في `LESSONS.md` — حارسٌ لا يمكن أن يفشل).
 *
 * 🔒 **ولا مُدخَل واحد من المتصفح يدخل الحمولة.** النصّ ثابتٌ هنا، والأجهزة
 * تُقرأ من الجلسة. فلا يصلح المسار جسراً لإرسال نصٍّ يختاره أحد إلى جهازٍ
 * يختاره — وهو أول ما يُساء استعماله في مسارٍ كهذا.
 */

export const runtime = "nodejs";

/** حدٌّ ضيّق: زرُّ تجربة يُنقر مرة، وتكرارُه لا يثبت شيئاً جديداً */
const MAX_PER_MINUTE = 3;

export async function POST(): Promise<Response> {
  const gate = await guard(MAX_PER_MINUTE, "test");
  if (!gate.ok) return gate.response;

  // القناة غير مضبوطة على الخادم: رمزٌ صريح لا «فشل الإرسال» — المطلوب من
  // المالك مفتاحٌ في البيئة، ولا شيء مطلوب من المتعهد
  if (!isVapidReady()) return errorJson("not-configured", 503);

  const supabase = gate.access.supabase;

  /**
   * ⚠ القراءة بجلسة المتعهد نفسه لا بمفتاح الخدمة: سياسة
   * `partner_push_select_own_or_admin` تحصر الصفوف بصاحبها، فيستحيل بنيوياً أن
   * يرسل هذا المسار إلى جهاز غيره — ولو أخطأنا في شرط `where`.
   */
  const res = await supabase
    .from("partner_push_subscriptions")
    .select("id, endpoint, p256dh, auth")
    .eq("subcontractor_id", gate.access.sub.id);

  if (res.error) {
    return isSchemaMissing(res.error) ? errorJson("schema", 503) : errorJson("save", 500);
  }

  const targets = (res.data ?? []) as (PushTarget & { id: string })[];
  if (targets.length === 0) {
    return Response.json(
      { ok: true, targets: 0, sent: 0, pruned: 0, reason: "no-recipient" },
      { headers: NO_STORE }
    );
  }

  const payload = buildPushPayload({
    event: "push_test",
    title: "تنبيهات الجهاز تعمل",
    body: "هكذا سيصلك عرض الرحلة. أبقِ التنبيهات مفعّلة حتى لا تفوتك الطلبات.",
    url: "/portal/requests",
    // وسمٌ ثابت: تجربتان متتاليتان بطاقةٌ واحدة تتجدّد، لا بطاقتان متكدّستان
    tag: "push-test",
  });

  const report = await deliverPushToTargets(supabase, targets, payload, {
    urgency: "high",
    ttlSeconds: 60,
    /**
     * لا نلمس `last_seen_at` هنا: `authenticated` بلا `update` على الجدول
     * بقرار `0055`، فالمحاولة تفشل بلا أثرٍ ونستغني عنها بدل أن نُصدر ضجيجاً.
     */
    touchLastSeen: false,
  });

  return Response.json(
    {
      ok: report.sent > 0,
      targets: report.targets,
      sent: report.sent,
      pruned: report.pruned,
      // رمزٌ للسجل لا جملةٌ للعرض — الشاشة تقول جملتها بالعربية من عندها
      reason: report.reason,
    },
    { headers: NO_STORE }
  );
}
