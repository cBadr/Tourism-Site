import "server-only";

import { createHmac, timingSafeEqual } from "node:crypto";

import { escapeHtml } from "@/lib/notifications/render";
import { sendTelegram } from "@/lib/notifications/telegram";

/**
 * التقاط معرّف محادثة تليجرام للمتعهد (ج١ في
 * `docs/phase-briefs/FAILED-TRIPS-AND-PARTNER-ALERTS.md`).
 *
 * ── المشكلة التي يحلّها هذا الملف ────────────────────────────────────────────
 *
 * `subcontractors.telegram_chat_id` هو الوجهة التي بلا مثلها تُطلب قناة تليجرام
 * ولا تصل أحداً — وهو بعينه الجذر المقيس الذي أنشأ الموجة كلها. **والمتعهد لا
 * يستطيع أن يعرف هذا الرقم**: لا يظهره تطبيق تليجرام في أي شاشة، ولا يوجد إلا
 * داخل تحديثات البوت نفسه. فالتقاطه عملٌ من طرفنا لا طلبٌ منه.
 *
 * ── ما قِيس على البوت الحيّ قبل اختيار التدفّق (2026-08-15) ──────────────────
 *
 * | ما قِيس | القيمة | أثره على التصميم |
 * |---|---|---|
 * | `getMe` | يعمل — البوت قائم | القناة صالحة اليوم بلا شراء |
 * | `getWebhookInfo.url` | **فارغ** — لا ويبهوك | `getUpdates` **متاح**، وهو ما بُني عليه |
 * | `getUpdates` | يعمل، والإزاحة السالبة مقبولة | نقرأ آخر التحديثات بلا أن نستهلك تحديث غيرنا |
 * | `getMyCommands` | فارغة | لا يلزم تسجيل `/start`: ضغطُ «ابدأ» يرسله دائماً |
 *
 * ── ولماذا هذا التدفّق دون غيره ─────────────────────────────────────────────
 *
 * 1. **ويبهوك**: يستلزم تسجيل عنوان عامّ على البوت — تغييرٌ عامٌّ على أداة
 *    المالك الحيّة، ويستلزم نشراً. ولو ضُبط غداً فـ`getUpdates` يردّ **409**،
 *    ولذلك يُميَّز هذا الرد برمزٍ خاص (`webhook-set`) لا يُبتلع في «فشل عام».
 * 2. **«الصق معرّفك»**: يستلزم أن يعرفه، ولا يعرفه — فيلجأ إلى بوتٍ خارجي أو
 *    يلصق `@username` الذي ترفضه `portal_set_telegram_chat_id` بحقّ.
 * 3. **رابط عميق + رمزٌ مؤقّت + مسحُ التحديثات عند الطلب** ✅ — يعمل بالبوت
 *    **كما هو مضبوط الآن**: بلا ويبهوك، وبلا نشر، وبلا متغيّر بيئة جديد.
 *
 * ── ولماذا لا جدول للرموز المعلَّقة؟ ────────────────────────────────────────
 *
 * الرمز **مشتقٌّ لا مخزَّن**: `HMAC(سرّ, معرّف المتعهد + نافذة زمنية)`. فلا صفَّ
 * يُكتب ولا يُكنس ولا تُضاف هجرة، والتحقق إعادةُ اشتقاق. والأهم أن **المطابقة
 * تقع داخل جلسة المتعهد نفسه**: لا يُقرأ من التحديثات إلا ما طابق رمزَ صاحب
 * الجلسة، فلا يمكن لهذا المسار أن يكتب وجهةً لمتعهدٍ آخر مهما كان في الطابور.
 *
 * 🔒 **والسرّ هو `TELEGRAM_BOT_TOKEN` نفسه** بفاصلٍ مجاليّ صريح: هو خادميٌّ بحت،
 * ووجودُه شرطُ عمل القناة أصلاً — فلا يُضاف متغيّر بيئة يحجب الميزة على بدر.
 */

/* ------------------------------------------------------------------ */
/* (١) الاتصال بواجهة البوت                                            */
/* ------------------------------------------------------------------ */

const API_BASE = "https://api.telegram.org";
const TIMEOUT_MS = 8000;

/** ما يُقرأ من طابور التحديثات في المسحة الواحدة. */
const SCAN_LIMIT = 50;

type ApiResult<T> =
  | { ok: true; result: T }
  | { ok: false; status: number; description: string };

async function callBot<T>(method: string, body: Record<string, unknown>): Promise<ApiResult<T>> {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) return { ok: false, status: 0, description: "no-token" };

  try {
    const res = await fetch(`${API_BASE}/bot${token}/${method}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(TIMEOUT_MS),
      cache: "no-store",
    });
    // واجهة البوت ترجع 200 مع ok=false أحياناً — الجسم يُقرأ دائماً
    const json = (await res.json().catch(() => null)) as
      | { ok?: boolean; result?: T; description?: string }
      | null;

    if (json?.ok === true && json.result !== undefined) return { ok: true, result: json.result };
    return {
      ok: false,
      status: res.status,
      description: json?.description ?? `HTTP ${res.status}`,
    };
  } catch {
    return { ok: false, status: 0, description: "network" };
  }
}

/* ------------------------------------------------------------------ */
/* (٢) هوية البوت — الرابط العميق يُبنى منها لا من اسمٍ مكتوب في الكود   */
/* ------------------------------------------------------------------ */

export type BotIdentity = { id: number; username: string };

/**
 * ⚠ **لا يُكتب اسم البوت في الكود.** المالك يملك تغييره من تطبيق تليجرام في أي
 * لحظة، ورابطٌ عميق إلى اسمٍ قديم يفتح محادثةً مع لا أحد — والمتعهد يقرأ ذلك
 * عطلاً في المنصة. فالاسم يُقرأ حياً ويُذاكَر لعشر دقائق.
 *
 * والذاكرة تفرّق بين النجاح والفشل: الفشل يُذاكَر ثلاثين ثانية فقط، كي يتعافى
 * انقطاعٌ عابر بلا أن ننتظر دورة كاملة.
 */
const BOT_TTL_OK_MS = 10 * 60 * 1000;
const BOT_TTL_FAIL_MS = 30 * 1000;

let botMemo: { at: number; value: BotIdentity | null } | null = null;

export async function readBotIdentity(): Promise<BotIdentity | null> {
  const now = Date.now();
  if (botMemo) {
    const ttl = botMemo.value ? BOT_TTL_OK_MS : BOT_TTL_FAIL_MS;
    if (now - botMemo.at < ttl) return botMemo.value;
  }

  const res = await callBot<{ id: number; username?: string }>("getMe", {});
  const value =
    res.ok && typeof res.result.username === "string" && res.result.username.trim() !== ""
      ? { id: res.result.id, username: res.result.username.trim() }
      : null;

  botMemo = { at: now, value };
  return value;
}

/** رابط «ابدأ» العميق: ضغطُ الزر يرسل `/start <الرمز>` إلى البوت. */
export function pairingDeepLink(botUsername: string, code: string): string {
  return `https://t.me/${encodeURIComponent(botUsername)}?start=${encodeURIComponent(code)}`;
}

/* ------------------------------------------------------------------ */
/* (٣) الرمز المؤقت — مشتقٌّ لا مخزَّن                                   */
/* ------------------------------------------------------------------ */

/**
 * طول النافذة. الرمز يُقبل في نافذته وفي التي تليها، فصلاحيته الفعلية بين عشر
 * دقائق وعشرين — تكفي لفتح تليجرام وضغط «ابدأ»، ولا تكفي لأن يبقى رابطٌ منسوخ
 * في محادثةٍ صالحاً بعد أيام.
 */
const WINDOW_MS = 10 * 60 * 1000;

/** النوافذ المقبولة، ثم النوافذ التي نُميّزها لنقول «انتهت صلاحيته» لا «لم نجد». */
const FRESH_WINDOWS = [0, -1];
const STALE_WINDOWS = [-2, -3, -4, -5];

/**
 * الفاصل المجاليّ: يمنع أن يكون رمزُ الربط صالحاً لأي استعمالٍ آخر للتوكن نفسه
 * لو استُعمل مفتاحاً في مكان ثانٍ يوماً ما.
 */
const DOMAIN = "partner-telegram-pairing:v1";

function pairingSecret(): string | null {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  return typeof token === "string" && token.trim() !== "" ? token : null;
}

function codeFor(subcontractorId: string, windowIndex: number): string | null {
  const secret = pairingSecret();
  if (!secret) return null;
  return createHmac("sha256", secret)
    .update(`${DOMAIN}:${subcontractorId}:${windowIndex}`)
    .digest("base64url")
    // حمولة الرابط العميق تقبل [A-Za-z0-9_-] حتى ٦٤ محرفاً، وbase64url داخلها.
    // و٢٤ محرفاً = ١٤٤ بت، أبعد من أن تُخمَّن وأقصر من أن يشوّه الرابط.
    .slice(0, 24);
}

const windowIndexNow = () => Math.floor(Date.now() / WINDOW_MS);

/** الرمز المعروض الآن — يُبنى منه الرابط العميق في كل تصيير للصفحة. */
export function currentPairingCode(subcontractorId: string): string | null {
  return codeFor(subcontractorId, windowIndexNow());
}

function codesFor(subcontractorId: string, offsets: number[]): string[] {
  const base = windowIndexNow();
  return offsets
    .map((offset) => codeFor(subcontractorId, base + offset))
    .filter((code): code is string => code !== null);
}

/**
 * مقارنةٌ بزمنٍ ثابت. والطولان يُقارنان أولاً لأن `timingSafeEqual` ترمي على
 * اختلاف الطول — والرمي هنا كان سيصير قناةً جانبية بذاته.
 */
function sameCode(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
}

/* ------------------------------------------------------------------ */
/* (٤) مسح التحديثات                                                    */
/* ------------------------------------------------------------------ */

/**
 * أسباب تعذّر الربط — **رموزٌ لا جُمل** (🔒 قاعدة المشروع: الخادم يرسل رمزاً
 * والواجهة تترجمه).
 */
export const PAIRING_ISSUES = [
  "no-credentials", // لا `TELEGRAM_BOT_TOKEN` في البيئة
  "bot-unreachable", // تعذّر بلوغ واجهة البوت (شبكة أو توكن مرفوض)
  "webhook-set", // ويبهوك مضبوط ⇒ `getUpdates` يردّ 409، والتدفّق كله يحتاج بديلاً
  "no-match", // لا رسالة «ابدأ» برمز هذا المتعهد في آخر التحديثات
  "expired", // وُجدت رسالته لكن برمز نافذةٍ مضت — الحل تحديث الصفحة لا الشكوى
  "not-private", // ضغط «ابدأ» داخل مجموعة لا في محادثة خاصة
] as const;
export type PairingIssue = (typeof PAIRING_ISSUES)[number];

export type PairingScan =
  | { ok: true; chatId: string }
  | { ok: false; issue: PairingIssue };

type TelegramUpdate = {
  update_id?: number;
  message?: {
    date?: number;
    text?: string;
    chat?: { id?: number | string; type?: string };
  };
};

/** `/start <حمولة>` كما يرسلها الرابط العميق، ومعها صيغة `/start@bot` في المجموعات. */
const START_PATTERN = /^\/start(?:@[A-Za-z0-9_]+)?\s+([A-Za-z0-9_-]{1,64})$/;

/**
 * البحث عن ضغطة «ابدأ» التي تخصّ هذا المتعهد.
 *
 * ⚠ **الإزاحة السالبة مقصودة ولا تُستبدل بإزاحةٍ مؤكِّدة.** `getUpdates` طابورٌ
 * واحد للبوت كله: من يقرأ بإزاحةٍ أعلى من `update_id` **يحذفه للجميع**. ومتعهدان
 * يربطان في الدقيقة نفسها ⇒ أولهما كان سيبتلع ضغطة الثاني فتضيع بلا أثر. فالقراءة
 * بـ`offset = -SCAN_LIMIT` تعطي آخر التحديثات **بلا تأكيد**، فيجد كلٌّ منهما ضغطته.
 *
 * 🔒 **ولا يخرج من هذه الدالة إلا معرّف محادثةٍ طابق رمزَ صاحب الجلسة**: باقي
 * التحديثات — وفيها رسائل المالك ومحادثات متعهدين آخرين — تُقرأ وتُهمَل ولا
 * تُسجَّل ولا تُعاد إلى أي واجهة.
 */
export async function scanForPairing(subcontractorId: string): Promise<PairingScan> {
  if (!pairingSecret()) return { ok: false, issue: "no-credentials" };

  const fresh = codesFor(subcontractorId, FRESH_WINDOWS);
  const stale = codesFor(subcontractorId, STALE_WINDOWS);
  if (fresh.length === 0) return { ok: false, issue: "no-credentials" };

  const res = await callBot<TelegramUpdate[]>("getUpdates", {
    offset: -SCAN_LIMIT,
    limit: SCAN_LIMIT,
    timeout: 0,
    allowed_updates: ["message"],
  });

  if (!res.ok) {
    // 409 من `getUpdates` معناه واحدٌ لا ثانيَ له: ويبهوك مضبوط على البوت.
    // وتمييزه ضروري لأن علاجه مختلف تماماً — لا يُصلحه المتعهد بإعادة المحاولة.
    if (res.status === 409 || /webhook/i.test(res.description)) {
      return { ok: false, issue: "webhook-set" };
    }
    return { ok: false, issue: "bot-unreachable" };
  }

  // حزامٌ ثانٍ فوق النافذة: التحديث يبقى في الطابور ٢٤ ساعة، والنافذة تمنع
  // القديم أصلاً — لكن فحص التاريخ يجعل الأمر مقروءاً ولا يعتمد على استنتاج.
  const oldestAcceptable = Math.floor((Date.now() - (FRESH_WINDOWS.length + 1) * WINDOW_MS) / 1000);

  let sawStale = false;
  let sawGroup = false;

  // من الأحدث إلى الأقدم: من ضغط «ابدأ» مرتين يُربَط بآخر محادثة اختارها
  for (const update of [...res.result].reverse()) {
    const message = update.message;
    const text = typeof message?.text === "string" ? message.text.trim() : "";
    const match = START_PATTERN.exec(text);
    if (!match) continue;

    const payload = match[1];
    const isFresh = fresh.some((code) => sameCode(code, payload));
    if (!isFresh) {
      if (stale.some((code) => sameCode(code, payload))) sawStale = true;
      continue;
    }

    if (typeof message?.date === "number" && message.date < oldestAcceptable) {
      sawStale = true;
      continue;
    }

    // محادثة خاصة وحدها: معرّف مجموعةٍ يقبله البوت اليوم ثم تُقرأ عروض الرحلات
    // فيها أمام كل من فيها — وفيهم من ليس المتعهد. (D-19: لا تسريب تكلفة.)
    if (message?.chat?.type !== "private") {
      sawGroup = true;
      continue;
    }

    const chatId = message.chat?.id;
    if (typeof chatId !== "number" && typeof chatId !== "string") continue;
    return { ok: true, chatId: String(chatId) };
  }

  if (sawGroup) return { ok: false, issue: "not-private" };
  if (sawStale) return { ok: false, issue: "expired" };
  return { ok: false, issue: "no-match" };
}

/* ------------------------------------------------------------------ */
/* (٥) رسالة التأكيد — الدليل الوحيد الصادق على أن القناة تعمل            */
/* ------------------------------------------------------------------ */

/**
 * شاشةٌ تقول «متصل» لا تثبت شيئاً: تثبت أن صفّاً كُتب. والذي يثبت وصول الرسالة
 * هو **رسالةٌ تصل**. فتُرسَل واحدة فور الربط وواحدة عند الطلب من الشاشة، وكلتاهما
 * تمرّ بالمسار نفسه الذي ستمرّ به عروض الرحلات.
 *
 * ولا ترمي أبداً: فشلُ الإرسال بعد ربطٍ ناجح يُبلَّغ ولا يُلغي الربط.
 */
export async function sendPairingProof(
  chatId: string,
  brandName: string,
  companyName: string
): Promise<boolean> {
  const body = [
    `✅ <b>تم ربط تليجرام</b> — ${escapeHtml(brandName)}`,
    "",
    `المتعهد: <b>${escapeHtml(companyName)}</b>`,
    "ستصلك عروض الرحلات على هذه المحادثة.",
    "",
    "لإيقاف الاستقبال، افتح «قنوات التنبيه» في بورتال المتعهدين — ولا توقفه من تليجرام،",
    "فحظرُ البوت من هنا يجعلك <b>غير متصل</b> بلا أن يظهر ذلك في شاشتك.",
  ].join("\n");

  const outcome = await sendTelegram(chatId, body);
  return outcome.ok === true;
}
