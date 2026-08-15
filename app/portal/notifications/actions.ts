"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { scanForPairing, sendPairingProof } from "@/lib/notifications/telegram-pairing";
import { getSettings } from "@/lib/settings";
import { createServiceSupabase } from "@/lib/supabase/admin";
import { portalSetupAccess } from "../_lib/session";

/**
 * إجراءات شاشة «قنوات التنبيه».
 *
 * القواعد الثابتة في كل إجراء بورتال (وهي هنا كما هي في `drivers/actions.ts`):
 * - `portalSetupAccess()` **أولاً**: الغلاف يحمي شجرة التصيير لا نقاط الـ POST،
 *   وهذه نقاط مستقلة تُنادى مباشرة. والحارس الموسَّع لأن الشاشة إعدادٌ لا تشغيل
 *   (انظر ترويسة `data.ts`).
 * - كل نهاية `redirect` بـ`saved=1` أو `error=code` — والرمز يُترجَم في الشاشة.
 *   🔒 **رمزٌ لا جملة**: لا نص خطأ يُولَّد في الخادم.
 * - لا حساب ولا قرار إتاحة هنا: `portal_set_alert_prefs` تكتب، و
 *   `partner_availability()` تقرّر. الشاشة لا تعيد اشتقاق شيء.
 */

const url = (qs: string) => `/portal/notifications?${qs}`;

/* ------------------------------------------------------------------ */
/* (١) القنوات ومفتاح الاستقبال                                        */
/* ------------------------------------------------------------------ */

/**
 * حفظ التفضيلات الخمس دفعةً واحدة.
 *
 * ⚠ **ولماذا نموذجٌ واحد بزرّ حفظ، لا خمسة مفاتيح تُحفظ فور اللمس؟** لأن إطفاء
 * آخر قناةٍ بالغة يعني **غير متصل** — أي توقّف العروض. وتنفيذُ ذلك بلمسةٍ بلا
 * مراجعة هو بعينه ما حذّر منه المالك: ألا يكتشف المتعهد الحالة بفقد عمل. فالنموذج
 * يعرض أثر الاختيار **قبل** الحفظ (`ChannelsForm`)، والحفظ فعلٌ واعٍ.
 */
export async function saveAlertPrefs(formData: FormData) {
  const access = await portalSetupAccess();
  if (!access.ok) redirect(url(`error=${access.code}`));

  const on = (name: string) => formData.get(name) != null;

  const res = await access.supabase.rpc("portal_set_alert_prefs", {
    p_telegram: on("telegram"),
    p_webpush: on("webpush"),
    p_inbox: on("inbox"),
    p_email: on("email"),
    p_accept: on("accepting"),
  });

  if (res.error) redirect(url("error=save"));

  revalidatePath("/", "layout");
  redirect(url("saved=1"));
}

/* ------------------------------------------------------------------ */
/* (٢) ربط تليجرام                                                     */
/* ------------------------------------------------------------------ */

/**
 * التقاط معرّف المحادثة بعد أن يضغط المتعهد «ابدأ» في تليجرام.
 *
 * التسلسل: الشاشة تعرض رابطاً عميقاً يحمل رمزاً مؤقتاً ⇒ يفتحه ويضغط «ابدأ» ⇒
 * يعود ويضغط «تحققتُ» ⇒ هذا الإجراء يمسح آخر تحديثات البوت بحثاً عن رمزه هو.
 * التفصيل ومقاييس البوت في `lib/notifications/telegram-pairing.ts`.
 *
 * 🔒 **حارس الازدواج**: محادثةٌ واحدة لا تُربط بمتعهدين. لولاه لتلقّى الأول عروض
 * الثاني بتكاليفها — وهو نصّ ما يمنعه **D-19** (لا يعرف متعهدٌ تكلفة متعهدٍ آخر).
 * والفحص بمفتاح الخدمة لأن RLS تحجب عن الشريك صفوف غيره بحق، فلا يستطيع أن يرى
 * التصادم بنفسه. ولا يخرج منه إلى الواجهة إلا **رمزٌ** (`taken`) — لا اسم ولا صف.
 */
export async function linkTelegram() {
  const access = await portalSetupAccess();
  if (!access.ok) redirect(url(`error=${access.code}`));
  const { supabase, sub } = access;

  const scan = await scanForPairing(sub.id);
  if (!scan.ok) redirect(url(`error=${scan.issue}`));

  const service = createServiceSupabase();
  if (service) {
    const clash = await service
      .from("subcontractors")
      .select("id")
      .eq("telegram_chat_id", scan.chatId)
      .neq("id", sub.id)
      .limit(1);
    if (clash.error) redirect(url("error=save"));
    if ((clash.data?.length ?? 0) > 0) redirect(url("error=taken"));
  }

  const res = await supabase.rpc("portal_set_telegram_chat_id", { p_chat_id: scan.chatId });
  if (res.error) redirect(url("error=save"));

  // الإثبات لا الادّعاء: رسالةٌ تمرّ بالمسار نفسه الذي ستمرّ به العروض. وفشلُها
  // لا يُلغي ربطاً وقع — يُعلَن بعلامته الخاصة كي يبحث المتعهد عن السبب.
  const settings = await getSettings();
  const proved = await sendPairingProof(scan.chatId, settings.brand.name, sub.companyName);

  revalidatePath("/", "layout");
  redirect(url(proved ? "linked=1" : "linked=1&error=proof"));
}

/** فصل القناة — النص الفارغ يُفرّغ العمود (وهو ما توثّقه الدالة في 0054). */
export async function unlinkTelegram() {
  const access = await portalSetupAccess();
  if (!access.ok) redirect(url(`error=${access.code}`));

  const res = await access.supabase.rpc("portal_set_telegram_chat_id", { p_chat_id: "" });
  if (res.error) redirect(url("error=save"));

  revalidatePath("/", "layout");
  redirect(url("unlinked=1"));
}

/**
 * رسالة تجربة.
 *
 * ولماذا زرٌّ مستقل بعد الربط؟ لأن الربط يثبت أن المحادثة كانت مفتوحة **لحظتها**،
 * ولا يثبت أنها ما زالت كذلك: من يحظر البوت أو يحذف المحادثة يبقى في شاشته
 * «متصل» بينما لا يصله شيء — والقاعدة لا تعرف الحظر، فوجهةُ الإرسال موجودة عندها.
 * وهذه القناة اليوم هي **الوحيدة** التي تبلغ متعهداً فعلاً، فثمن اكتشاف انقطاعها
 * متأخراً رحلةٌ ضائعة.
 */
export async function testTelegram() {
  const access = await portalSetupAccess();
  if (!access.ok) redirect(url(`error=${access.code}`));
  const { sub } = access;

  // 🔒 المعرّف لا يُقرأ إلى الواجهة ولا يمرّ في رابط: الإرسال يقع في الخادم
  // بمفتاح الخدمة، ولا يخرج من هنا إلا نجاحٌ أو رمز فشل.
  const service = createServiceSupabase();
  if (!service) redirect(url("error=env"));

  const row = await service
    .from("subcontractors")
    .select("telegram_chat_id")
    .eq("id", sub.id)
    .maybeSingle();

  if (row.error) redirect(url("error=save"));
  const chatId =
    typeof row.data?.telegram_chat_id === "string" ? row.data.telegram_chat_id.trim() : "";
  if (chatId === "") redirect(url("error=no-match"));

  const settings = await getSettings();
  const sent = await sendPairingProof(chatId, settings.brand.name, sub.companyName);

  // فشل الإرسال على وجهةٍ مسجَّلة = الحظر أو حذف المحادثة، وهو ما وُجد الزر له.
  // ولا يُمسح المعرّف آلياً: المسح قرار المتعهد، والتشخيص وظيفتنا.
  if (!sent) redirect(url("error=test-failed"));

  redirect(url("tested=1"));
}
