import "server-only";

import { createECDH, createPrivateKey, createPublicKey, type KeyObject } from "node:crypto";

/**
 * تحويلات المفاتيح لدفع الويب — **بـ`node:crypto` وحده، بلا حزمة واحدة**.
 *
 * ── لماذا بلا `web-push` ────────────────────────────────────────────────────
 *
 * الحزمة الشائعة تجرّ اعتماديات وتوقيعاً وتحديثات أمنية على مسارٍ لا نُنادي منه
 * إلا شيئين: توقيع ES256 وتشفير `aes128gcm`. وكلاهما في Node منذ سنوات
 * (`hkdfSync` · `createCipheriv` · `sign` بترميز `ieee-p1363`). فالكلفة الحقيقية
 * للحزمة ليست حجمها بل أنها تصير **المكان الذي لا يقرؤه أحد** حين يفشل الإرسال.
 * وسياسة المستودع صريحة: لا اعتمادية جديدة بلا سببٍ مكتوب — ولا سبب هنا.
 *
 * ── توليد المفاتيح: أمرٌ واحد، بلا استيراد هذا الملف ────────────────────────
 *
 * VAPID زوجُ مفاتيح P-256 ثابتٌ للمنصة كلها (لا لكل متعهد)، يُولَّد **مرة
 * واحدة** ويعيش في البيئة. ⚠ وتغييرُه لاحقاً يُبطل **كل** الاشتراكات المسجَّلة
 * — كل متعهد يعيد التفعيل من جهازه — فيُولَّد ويُحفَظ ولا يُدوَّر بلا سبب.
 *
 * ```bash
 * node -e "const c=require('crypto');const{publicKey,privateKey}=c.generateKeyPairSync('ec',{namedCurve:'prime256v1'});console.log('VAPID_PUBLIC_KEY='+publicKey.export({type:'spki',format:'der'}).subarray(-65).toString('base64url'));console.log('VAPID_PRIVATE_KEY='+privateKey.export({format:'jwk'}).d)"
 * ```
 *
 * ثم في `.env.local` (وعلى الخادم):
 * `VAPID_PUBLIC_KEY` · `VAPID_PRIVATE_KEY` · `VAPID_SUBJECT=mailto:you@example.com`
 *
 * والأسماء الثلاثة **ليست اختياراً**: هي المكتوبة في `PROVIDER_ENV` بعقد
 * `lib/partner-alerts-types.ts`، وهي ما تقيسه `syncProviderReadiness` وتكتبه في
 * `notification_providers` فتقرؤه القاعدة في حساب الإتاحة. اسمٌ ثالث هنا يعني
 * قناةً تعمل والقاعدة تحسبها ميتة.
 */

/** طول المفتاح العام غير المضغوط لمنحنى P-256: بادئة `0x04` + إحداثيان ٣٢ بايت */
export const P256_PUBLIC_KEY_BYTES = 65;
/** طول المفتاح الخاص الخام */
export const P256_PRIVATE_KEY_BYTES = 32;
/** طول سرّ المصادقة في اشتراك الدفع (RFC 8291 §3.2) */
export const AUTH_SECRET_BYTES = 16;

export const toBase64Url = (value: Buffer): string => value.toString("base64url");

/**
 * فكّ base64url بتحقق من الطول.
 *
 * ⚠ **ولماذا التحقق من الطول هنا لا عند الاستعمال؟** لأن `Buffer.from(x,
 * 'base64url')` **لا ترمي أبداً**: تتجاهل كل حرفٍ غير صالح وتُرجع ما تجمّع. فنصٌّ
 * تالف يصير عازلاً قصيراً يمرّ إلى `computeSecret` فيرمي هناك بخطأ OpenSSL لا
 * يقول شيئاً — أو أسوأ: يمرّ وينتج تشفيراً لا يفكّه الجهاز، فتُوسم الرسالة
 * «أُرسلت» ولا تظهر بطاقة واحدة. ولذلك الرفض هنا صريحٌ وبطول متوقَّع.
 */
export function fromBase64Url(value: string, expectedBytes?: number): Buffer | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (trimmed === "") return null;
  // فحصٌ نصّي قبل الفكّ: `Buffer.from` تبتلع الحروف الغريبة بدل أن ترفضها
  if (!/^[A-Za-z0-9_-]+={0,2}$/.test(trimmed)) return null;

  const buffer = Buffer.from(trimmed, "base64url");
  if (buffer.length === 0) return null;
  if (expectedBytes !== undefined && buffer.length !== expectedBytes) return null;
  return buffer;
}

/** هل هذا المفتاح العام صالحٌ شكلاً؟ (٦٥ بايت تبدأ بـ`0x04`) */
export function isValidPublicKey(raw: Buffer | null): raw is Buffer {
  return raw !== null && raw.length === P256_PUBLIC_KEY_BYTES && raw[0] === 0x04;
}

/**
 * مفتاح خاص محمَّل + المفتاح العام **المشتقّ منه**.
 *
 * والاشتقاق هو الفائدة: مقارنته بـ`VAPID_PUBLIC_KEY` المكتوب في البيئة تمسك
 * أشيع خطأ تشغيلي في هذه القناة — نسخُ نصف زوجٍ ونصفِ زوجٍ آخر. وبلا هذه
 * المقارنة يظهر العطب **بعد النشر** بـ`403 Forbidden` من خدمة الدفع، وهو ردٌّ
 * لا يقول «مفاتيحك لا تتطابق» بل لا يقول شيئاً.
 */
export type LoadedPrivateKey = { key: KeyObject; publicKeyRaw: Buffer };

/**
 * يقبل الشكلين اللذين يصلان فعلاً:
 * - **base64url لـ`d` الخام** (٣٢ بايت) — ما يطبعه الأمر أعلاه، وما تكتبه كل
 *   الأدوات الشائعة.
 * - **PEM بصيغة PKCS#8** — لمن ولّد المفتاح بـ`openssl` ولصقه كما هو.
 *
 * ولا يرمي أبداً: يرجع `null` ويترك للمنادي رمزَ خطأ مفهوماً.
 */
export function loadPrivateKey(value: string): LoadedPrivateKey | null {
  const trimmed = typeof value === "string" ? value.trim() : "";
  if (trimmed === "") return null;

  try {
    if (trimmed.includes("BEGIN")) {
      const key = createPrivateKey(trimmed);
      const jwk = createPublicKey(key).export({ format: "jwk" }) as {
        crv?: string;
        x?: string;
        y?: string;
      };
      if (jwk.crv !== "P-256" || !jwk.x || !jwk.y) return null;
      const x = fromBase64Url(jwk.x, 32);
      const y = fromBase64Url(jwk.y, 32);
      if (!x || !y) return null;
      return { key, publicKeyRaw: Buffer.concat([Buffer.from([0x04]), x, y]) };
    }

    const d = fromBase64Url(trimmed, P256_PRIVATE_KEY_BYTES);
    if (!d) return null;

    // اشتقاق (x, y) من d: `createECDH` أقصر طريق وأقلّه افتراضات
    const ecdh = createECDH("prime256v1");
    ecdh.setPrivateKey(d);
    const publicKeyRaw = ecdh.getPublicKey();
    if (!isValidPublicKey(publicKeyRaw)) return null;

    const key = createPrivateKey({
      key: {
        kty: "EC",
        crv: "P-256",
        d: toBase64Url(d),
        x: toBase64Url(publicKeyRaw.subarray(1, 33)),
        y: toBase64Url(publicKeyRaw.subarray(33, 65)),
      },
      format: "jwk",
    });
    return { key, publicKeyRaw };
  } catch {
    return null;
  }
}
