import "server-only";

import { sign } from "node:crypto";
import type { KeyObject } from "node:crypto";

import { missingEnvFor } from "@/lib/notifications/providers";
import {
  fromBase64Url,
  isValidPublicKey,
  loadPrivateKey,
  P256_PUBLIC_KEY_BYTES,
  toBase64Url,
} from "@/lib/push/keys";

/**
 * VAPID — هوية الخادم أمام خدمات الدفع (RFC 8292).
 *
 * ── ما الذي يفعله هذا الملف بالضبط ──────────────────────────────────────────
 *
 * خدمة الدفع (Apple · Google · Mozilla) لا تعرف من نحن، ولا تقبل من مجهول أن
 * يوقظ أجهزة مستخدميها. فنوقّع لكل نداءٍ **JWT قصير العمر** بمفتاحنا الخاص،
 * ونرفق معه مفتاحنا العام — وهو نفس المفتاح الذي وقّع به المتصفحُ اشتراكه
 * (`applicationServerKey` وقت `subscribe`). فتتحقق الخدمة من التطابق.
 *
 * 🔒 **ولهذا التطابق عاقبةٌ تشغيلية تُكتب مرة وتُقرأ دائماً:** تغييرُ زوج VAPID
 * يُبطل **كل** اشتراكٍ مسجَّل — لا يُخطَر أحد، ولا تفشل الرسالة بخطأٍ مفهوم، بل
 * ترفضها الخدمة بـ`403` جهازاً جهازاً. ومن يبدّل المفاتيح على قاعدةٍ عاملة يجب
 * أن يفرّغ `partner_push_subscriptions` في الهجرة نفسها، وإلا بقي كل متعهدٍ
 * «بالغاً» في حساب الإتاحة وهو لا يسمع شيئاً.
 *
 * ── ولماذا لا يُقرأ `process.env` إلا هنا ──────────────────────────────────
 *
 * لأن قياس الجاهزية له مالكٌ واحد سلفاً (`lib/notifications/providers.ts`)
 * يكتبه في `notification_providers` فتقرؤه القاعدة. فالمصدر واحد: القائمة
 * `PROVIDER_ENV.webpush` هناك، وما يُقرأ هنا يُقاس بها لا بأسماءٍ مكرَّرة.
 */

/**
 * عمر التوقيع. الحدّ الأقصى في RFC 8292 أربعٌ وعشرون ساعة، ونأخذ اثنتي عشرة:
 * توقيعٌ مسروق من سجلٍّ أو وسيط يبقى صالحاً مدةً أقصر، ولا كلفة على أحد —
 * التوقيع يُعاد بناؤه من الذاكرة في أجزاء من المللي ثانية.
 */
const JWT_TTL_SECONDS = 12 * 60 * 60;

/** هامش تجديد: لا نستعمل توقيعاً بقي له أقل من هذا (ساعتان) */
const JWT_REFRESH_MARGIN_SECONDS = 2 * 60 * 60;

export type VapidConfig = {
  /** المفتاح العام base64url — **عامٌّ بطبيعته**، يُسلَّم للمتصفح ليشترك به */
  publicKey: string;
  privateKey: KeyObject;
  /** `mailto:` أو `https:` — به تصل إليك الخدمة إن أسأت التصرف */
  subject: string;
};

export type VapidLoad =
  | { ok: true; config: VapidConfig }
  /**
   * رمزٌ لا جملة (قاعدة المشروع): `missing` = متغيّرٌ ناقص · `invalid-key` =
   * مفتاحٌ لا يُقرأ · `key-mismatch` = زوجٌ غير متطابق · `invalid-subject`.
   */
  | { ok: false; code: "missing" | "invalid-key" | "key-mismatch" | "invalid-subject"; missing: string[] };

/**
 * ذاكرة التحميل: تحليل المفتاح وبناء `KeyObject` عمليةٌ متكرّرة على كل رسالة
 * وكل جهاز. والمفتاح مأخوذٌ من نصّ البيئة نفسه، فتغيّرُه في التطوير يُبطل
 * الذاكرة تلقائياً بلا إعادة تشغيل.
 */
let cache: { fingerprint: string; result: VapidLoad } | null = null;

/**
 * تطبيع `VAPID_SUBJECT`.
 *
 * الخطأ الشائع كتابة البريد وحده (`you@example.com`) بلا `mailto:` — وبعض خدمات
 * الدفع ترفض الطلب كلّه لذلك. والتطبيع هنا **تصحيحٌ لا تساهُل**: بريدٌ صالح له
 * معنى واحد، وما عداه يُرفض برمزٍ صريح بدل أن يُرسَل ويُردّ بـ`400` غامض.
 */
function normalizeSubject(raw: string): string | null {
  const value = raw.trim();
  if (value === "") return null;
  if (value.startsWith("mailto:") || value.startsWith("https://")) return value;
  if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) return `mailto:${value}`;
  return null;
}

export function loadVapid(): VapidLoad {
  const publicKey = (process.env.VAPID_PUBLIC_KEY ?? "").trim();
  const privateKeyRaw = (process.env.VAPID_PRIVATE_KEY ?? "").trim();
  const subjectRaw = (process.env.VAPID_SUBJECT ?? "").trim();

  const fingerprint = `${publicKey}|${privateKeyRaw.length}|${subjectRaw}`;
  if (cache && cache.fingerprint === fingerprint) return cache.result;

  const result = ((): VapidLoad => {
    // المصدر الواحد لأسماء المتغيّرات — لا قائمة ثانية هنا
    const missing = missingEnvFor("webpush");
    if (missing.length > 0) return { ok: false, code: "missing", missing };

    const subject = normalizeSubject(subjectRaw);
    if (!subject) return { ok: false, code: "invalid-subject", missing: ["VAPID_SUBJECT"] };

    const declaredPublic = fromBase64Url(publicKey, P256_PUBLIC_KEY_BYTES);
    if (!isValidPublicKey(declaredPublic)) {
      return { ok: false, code: "invalid-key", missing: ["VAPID_PUBLIC_KEY"] };
    }

    const loaded = loadPrivateKey(privateKeyRaw);
    if (!loaded) return { ok: false, code: "invalid-key", missing: ["VAPID_PRIVATE_KEY"] };

    // 🔒 الزوج يتطابق أو لا يعمل شيء — والفحص هنا لا عند أول `403` في الإنتاج
    if (!loaded.publicKeyRaw.equals(declaredPublic)) {
      return { ok: false, code: "key-mismatch", missing: [] };
    }

    return {
      ok: true,
      config: {
        // نُعيد التطبيع من العازل لا من النصّ: حشوُ `=` أو مسافةٌ في البيئة
        // تُنتج مفتاحاً يختلف حرفاً عمّا اشترك به المتصفح، والرفض حينها صامت
        publicKey: toBase64Url(declaredPublic),
        privateKey: loaded.key,
        subject,
      },
    };
  })();

  cache = { fingerprint, result };
  return result;
}

/** هل القناة مضبوطة فعلاً؟ (تُنادى من مسار المفتاح العام ومن طبقة التسليم) */
export function isVapidReady(): boolean {
  return loadVapid().ok;
}

/** المفتاح العام للمتصفح — `null` حين لا تكون القناة مضبوطة */
export function vapidPublicKey(): string | null {
  const load = loadVapid();
  return load.ok ? load.config.publicKey : null;
}

/** توقيعٌ محفوظ لكل جمهور (origin خدمة الدفع) حتى يقترب انتهاؤه */
const jwtCache = new Map<string, { token: string; expiresAt: number }>();

/**
 * ترويسة `Authorization` لنداءٍ إلى `endpoint`.
 *
 * ⚠ **الجمهور هو أصل العنوان لا العنوان**: `aud` في التوقيع يجب أن يكون
 * `https://fcm.googleapis.com` لا المسار الكامل بمعرّف الجهاز. ومن يضع العنوان
 * كاملاً يوقّع لكل جهازٍ توقيعاً مستقلاً، فيرفض بعضُ الخدمات ويقبل بعضُها —
 * وهو أسوأ أشكال العطب: يعمل في الاختبار على متصفحٍ ويسقط على آخر.
 */
export function vapidAuthorization(endpoint: string): string | null {
  const load = loadVapid();
  if (!load.ok) return null;

  let audience: string;
  try {
    audience = new URL(endpoint).origin;
  } catch {
    return null;
  }

  const now = Math.floor(Date.now() / 1000);
  const cached = jwtCache.get(audience);
  if (cached && cached.expiresAt - now > JWT_REFRESH_MARGIN_SECONDS) {
    return `vapid t=${cached.token}, k=${load.config.publicKey}`;
  }

  const expiresAt = now + JWT_TTL_SECONDS;
  const header = toBase64Url(Buffer.from(JSON.stringify({ typ: "JWT", alg: "ES256" })));
  const body = toBase64Url(
    Buffer.from(JSON.stringify({ aud: audience, exp: expiresAt, sub: load.config.subject }))
  );
  const signingInput = `${header}.${body}`;

  let signature: Buffer;
  try {
    /**
     * `ieee-p1363` لا الافتراضي.
     *
     * Node يوقّع ECDSA بترميز DER افتراضياً، وJWT/ES256 يشترط التسلسل الخام
     * `R‖S` بأربعٍ وستين بايت. والفرق **لا يظهر محلياً**: التوقيع يُبنى بنجاح
     * ويُرسل ويُرفض بـ`401` من الخدمة. سطرٌ واحد، وهو أكثر ما يُخطئ فيه من
     * يكتب VAPID بيده.
     */
    signature = sign("sha256", Buffer.from(signingInput), {
      key: load.config.privateKey,
      dsaEncoding: "ieee-p1363",
    });
  } catch {
    return null;
  }

  const token = `${signingInput}.${toBase64Url(signature)}`;
  jwtCache.set(audience, { token, expiresAt });
  return `vapid t=${token}, k=${load.config.publicKey}`;
}
