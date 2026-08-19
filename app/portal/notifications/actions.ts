"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { scanForPairing, sendPairingProof } from "@/lib/notifications/telegram-pairing";
import { readTelegramBindCode } from "@/lib/partner-alerts-types";
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

/**
 * 🔴 الوجهة `/portal/profile#channels` لا `/portal/notifications`.
 *
 * محرِّرُ القنوات صار قسماً في «حسابي» (‏`profile/_components/channels-summary.tsx`)،
 * وهذه الأفعال هي أفعاله بعينها — **نسخةٌ واحدة، لا ثانية لها** (القاعدة الذهبية ١٢).
 * فلو بقيت الوجهة على الشاشة القديمة لَحفِظ الشريكُ من «حسابي» ثم قُذف إلى صفحةٍ
 * أخرى تحوّله بدورها فيعود — قفزتان ورسالةُ نجاحٍ يراها في غير مكانه.
 *
 * ⚠ **والرموز تبقى بنصّها** (`saved` · `linked` · `unlinked` · `tested` · `error=…`)،
 * وتترجمها `profile/page.tsx` من `ALERTS_ERROR_MESSAGES` المُصدَّرة من قسم القنوات
 * نفسه — كما تفعل بالضبط مع رموز الاتفاقية. ورمزٌ يعبر بلا جملةٍ تقابله يصل
 * الشريكَ «حدث خطأ غير متوقع»، وهي الثغرة التي أوجدت 0097.
 *
 * والمرساة `#channels` في آخر الرابط بعد معاملات الحالة — فهو الترتيب الوحيد
 * الصحيح في عنوان URL، ويهبط به الشريك على القسم لا على رأس الصفحة.
 */
const url = (qs: string) => `/portal/profile?${qs}#channels`;

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
 * 🔒 **حارس الازدواج صار في القاعدة** (0057) — على **الجدول** لا هنا.
 *
 * كان الفحص استعلاماً بمفتاح الخدمة في هذا الملف، وأسقطناه لسببين:
 *   ١. **مصدرا حقيقة**: القاعدة الآن تحمل القيد (فهرسٌ فريد + مُشغِّل)، ونسخةٌ
 *      ثانية منه في TypeScript تفترق عنه عند أول تعديل — والفرق يظهر بتسريب.
 *   ٢. وذاك الفحص كان يحرس **نصف الباب**: يسأل «هل لمتعهدٍ آخر هذه المحادثة؟»
 *      ولا يسأل «هل هي وجهةُ فريق التشغيل؟» — وهو الشقّ **الأخطر**، لأن رسائل
 *      التشغيل تحمل اسم العميل وهاتفه وسعره وهامشنا. وهو التصادم الذي وقع
 *      فعلاً في قاعدة بدر (مقيسٌ 2026-08-15) ومرّ من هنا بلا اعتراض.
 *
 * والرفض يصل **رمزاً في `hint`** لا جملةً، فتترجمه الشاشة (`ERROR_MESSAGES`).
 * ولا يخرج منه اسمُ الجهة المتصادمة أبداً: «مربوطة بحسابٍ آخر» يكفي الشريك
 * ليصلح، ومعرفةُ **مَن** هي بعينها ما يمنعه D-20.
 */
export async function linkTelegram() {
  const access = await portalSetupAccess();
  if (!access.ok) redirect(url(`error=${access.code}`));
  const { supabase, sub } = access;

  const scan = await scanForPairing(sub.id);
  if (!scan.ok) redirect(url(`error=${scan.issue}`));

  const res = await supabase.rpc("portal_set_telegram_chat_id", { p_chat_id: scan.chatId });
  if (res.error) redirect(url(`error=${readTelegramBindCode(res.error) ?? "save"}`));

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
