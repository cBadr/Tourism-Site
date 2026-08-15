import "server-only";

import { cache } from "react";

import { isProviderReady } from "@/lib/notifications/providers";
import {
  PARTNER_CHANNELS,
  isPartnerChannel,
  type PartnerChannel,
} from "@/lib/partner-alerts-types";
import { isSchemaMissing, portalSetupAccess } from "../_lib/session";

/**
 * قراءة حالة تنبيهات المتعهد الحالي — نداءٌ واحد إلى `portal_alert_prefs()`.
 *
 * ── لماذا لا تُحسب الحالة هنا؟ ──────────────────────────────────────────────
 *
 * لأن **الحوض هو من يقرّر**، لا الشاشة. `dispatch_pool` تقرأ `partner_available()`
 * التي تقرأ `partner_availability()` — والدالة نفسها بحرفها هي ما ترجع
 * `reachable/willing/available` هنا. فلو أعادت الواجهة اشتقاق الحالة من القنوات
 * لصار في المشروع مصدرا حقيقة يفترقان يوم تتغيّر واحدة منهما، وتُعرض على المتعهد
 * حالةٌ ليست الحالة التي يُبثّ بها. (النمط ٢ في `LESSONS.md` بصيغته الأخطر: شاشة
 * تقول «متصل» وحوضٌ يتخطّاه.)
 *
 * وما يُشتقّ هنا شيءٌ واحد لا تعرفه القاعدة: **لماذا** ليست القناة بالغة —
 * أنقصه عنوانٌ يملك إصلاحه، أم مزوّدٌ لا يملكه أحد غير المالك؟ والفرق هو الفرق
 * بين «افعل هذا الآن» و«لا شيء مطلوب منك».
 *
 * ولا حساب مالي هنا ولا قرار أهلية — قراءةٌ وتصنيف (D-05).
 */

/* ------------------------------------------------------------------ */
/* الأنواع                                                             */
/* ------------------------------------------------------------------ */

/**
 * حالة القناة الواحدة كما تُعرض. الأربع الأولى هي بالضبط التمييز الذي طلبه
 * المالك: متصلة · غير متصلة · معطّلة من المالك · مطفأة بيد المتعهد.
 */
export type ChannelState =
  /** بالغة الآن — تصلك عليها عروض الرحلات */
  | "reaching"
  /** الصندوق: يعمل ولا يبلغ — يستلزم أن تنظر، ولذلك لا يُحسب في «متصل» */
  | "logged-only"
  /** مفعَّلة وينقصها **عنوانك**: معرّف محادثة · جهاز · بريد. الإصلاح بيدك */
  | "needs-link"
  /** مفعَّلة وعنوانك مكتمل، والمزوّد غير مضبوط عند المنصة — **لا شيء مطلوب منك** */
  | "provider-dark"
  /** أطفأتَها بنفسك */
  | "off";

export type PartnerAlertsView = {
  enabled: Record<PartnerChannel, boolean>;
  channels: Record<PartnerChannel, ChannelState>;
  /** هل يملك المتعهد عنواناً على هذه القناة؟ (معرّف · جهاز · بريد) */
  hasAddress: Record<PartnerChannel, boolean>;
  /**
   * هل مزوّد هذه القناة يعمل؟ يخدم **التنبؤ الحيّ** في النموذج وحده — أما وسم
   * الحالة الظاهر فمن القاعدة، لأنها هي من يقرّر البثّ.
   */
  providerOk: Record<PartnerChannel, boolean>;
  /** هل سُجّل معرّف محادثة تليجرام؟ (لا يُرجع المعرّف نفسه — اتفاقية ٧) */
  hasTelegramId: boolean;
  /**
   * 🔴 ارتباطٌ خاطئ قائم: محادثته هي **نفسها** وجهة إشعارات فريق التشغيل
   * (0057). ولا يُنشأ هذا الارتباط بعد اليوم — لكن ما سبق الحارس باقٍ، ويجب
   * أن يُرى ويُفصل بنقرة لا أن يظلّ صامتاً. ولا يسرّب شيئاً: من يقرأ `true`
   * هو **صاحب المحادثة** يفتحها في تطبيقه الآن.
   */
  telegramIsOps: boolean;
  pushDevices: number;
  hasEmail: boolean;
  /** مفتاح «راغب» — العامل الثاني في الإتاحة */
  accepting: boolean;
  reachable: boolean;
  willing: boolean;
  available: boolean;
  reachingChannels: PartnerChannel[];
};

export type AlertsResult =
  | { state: "ready"; view: PartnerAlertsView }
  /** القاعدة قبل هجرة 0054 — بطاقة «غير جاهز» لا شاشة خطأ */
  | { state: "hidden" }
  | { state: "failed" };

/* ------------------------------------------------------------------ */
/* التصنيف                                                             */
/* ------------------------------------------------------------------ */

const bool = (value: unknown, fallback = false): boolean =>
  typeof value === "boolean" ? value : fallback;

/**
 * تصنيف قناةٍ واحدة. الترتيب مقصود: **المطفأة أولاً** لأن من أطفأ قناة لا يريد
 * أن يُقال له «ينقصك عنوان» عليها؛ ثم البالغة فعلاً كما قالتها القاعدة؛ ثم
 * التمييز الذي يهمّ حقاً — عنوانٌ ناقص (بيده) أم مزوّدٌ مطفأ (ليس بيده).
 */
function classify(
  enabled: boolean,
  reaching: boolean,
  hasAddress: boolean
): ChannelState {
  if (!enabled) return "off";
  if (reaching) return "reaching";
  return hasAddress ? "provider-dark" : "needs-link";
}

/* ------------------------------------------------------------------ */
/* القراءة                                                             */
/* ------------------------------------------------------------------ */

/**
 * ⚠ الحارس **الموسَّع** (`portalSetupAccess`): المدعوّ في مرحلة التجهيز يربط
 * تليجرامه من اليوم. وسنده قياس لا تقدير — `current_subcontractor_id()` قُرئت
 * حيّةً (`pg_get_functiondef`) فلا شرط حالة فيها، ودوال البورتال هنا كلها
 * مبنيّة عليها. والمكسب أن الشريك يصل يوم اعتماده **بقناةٍ تعمل** بدل أن يبدأ
 * يومه الأول غير متصل ولا يعرف.
 */
export const loadPartnerAlerts = cache(async (): Promise<AlertsResult> => {
  const access = await portalSetupAccess();
  if (!access.ok) return { state: "failed" };

  /**
   * نداءان لا واحد — ونداءٌ ثانٍ **أرخص من عمودٍ ثانٍ عشر** في نوع إرجاع
   * `portal_alert_prefs()`: تغييرُ نوع إرجاع دالةٍ حيّة يستلزم `drop` ثم إعادة
   * كتابة جسمها كاملاً، وهو الطريق الذي وُلد منه انحدارُ `0031` (D-58).
   *
   * ⚠ وفشلُ الثاني **لا يُسقط الشاشة**: غيابُ الدالة يعني قاعدةً قبل `0057`،
   * والحالة عندها «لا نعرف» لا «لا تصادم» — لكنها لا تمنع الشريك من قراءة
   * قنواته. فتُقرأ `false` ولا يُعرض تحذيرٌ لا سند له (القاعدة ١٥).
   */
  const [res, opsRes] = await Promise.all([
    access.supabase.rpc("portal_alert_prefs"),
    access.supabase.rpc("portal_telegram_is_ops"),
  ]);

  if (res.error) {
    return isSchemaMissing(res.error) ? { state: "hidden" } : { state: "failed" };
  }

  const row = (Array.isArray(res.data) ? res.data[0] : res.data) as
    | Record<string, unknown>
    | undefined;
  if (!row) return { state: "hidden" };

  const enabled: Record<PartnerChannel, boolean> = {
    telegram: bool(row.telegram_enabled, true),
    webpush: bool(row.webpush_enabled, true),
    inbox: bool(row.inbox_enabled, true),
    email: bool(row.email_enabled, true),
  };

  const reachingChannels = (Array.isArray(row.reaching_channels) ? row.reaching_channels : [])
    .map(String)
    .filter(isPartnerChannel);
  const reaches = (channel: PartnerChannel) => reachingChannels.includes(channel);

  const hasTelegramId = bool(row.has_telegram_id);
  const pushDevices = Number.isFinite(Number(row.push_devices)) ? Number(row.push_devices) : 0;
  const hasEmail = typeof access.sub.email === "string" && access.sub.email.trim() !== "";

  const hasAddress: Record<PartnerChannel, boolean> = {
    telegram: hasTelegramId,
    webpush: pushDevices > 0,
    email: hasEmail,
    // الصندوق بلا عنوان أصلاً — والقيمة `true` كي لا يُصنَّف «ينقصك عنوان» أبداً
    inbox: true,
  };

  /**
   * جاهزية المزوّد.
   *
   * ⚠ **مصدران يتفقان اليوم وقد يفترقان لدورة**: القاعدة تقرأ
   * `notification_providers` (تكتبه طبقة التسليم كل دورة عامل)، والخادم يقرأ
   * البيئة مباشرةً. فحين تكون القناة **مفعَّلة وعنوانها مكتمل**، جوابُ القاعدة
   * قاطع — بلوغها الآن هو الجواب — لأنها هي من يقرّر البثّ. وفيما عدا ذلك
   * (مطفأة أو بلا عنوان) لا جواب عندها أصلاً، فتقود البيئة.
   */
  const provider = (channel: PartnerChannel, ready: () => boolean): boolean =>
    enabled[channel] && hasAddress[channel] ? reaches(channel) : ready();

  const providerOk: Record<PartnerChannel, boolean> = {
    telegram: provider("telegram", () => isProviderReady("telegram")),
    webpush: provider("webpush", () => isProviderReady("webpush")),
    email: provider("email", () => isProviderReady("email")),
    inbox: true,
  };

  const channels: Record<PartnerChannel, ChannelState> = {
    telegram: classify(enabled.telegram, reaches("telegram"), hasAddress.telegram),
    webpush: classify(enabled.webpush, reaches("webpush"), hasAddress.webpush),
    email: classify(enabled.email, reaches("email"), hasAddress.email),
    // الصندوق بلا عنوان ولا مزوّد: صفُّ الإشعار نفسه هو التسليم. ولا يُوسم
    // «بالغاً» أبداً — وهو قرارٌ لا سهو (القرار البنيوي ١ في هجرة 0054).
    inbox: enabled.inbox ? "logged-only" : "off",
  };

  return {
    state: "ready",
    view: {
      enabled,
      channels,
      hasAddress,
      providerOk,
      hasTelegramId,
      telegramIsOps: hasTelegramId && !opsRes.error && opsRes.data === true,
      pushDevices,
      hasEmail,
      accepting: bool(row.accepting_offers, true),
      reachable: bool(row.reachable),
      willing: bool(row.willing, true),
      available: bool(row.available),
      reachingChannels,
    },
  };
});

/** ترتيب العرض الثابت — نسخةٌ واحدة يقرؤها الخادم والعميل معاً */
export const CHANNEL_ORDER: readonly PartnerChannel[] = PARTNER_CHANNELS;
