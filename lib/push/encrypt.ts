import "server-only";

import { createCipheriv, createECDH, hkdfSync, randomBytes } from "node:crypto";

import {
  AUTH_SECRET_BYTES,
  fromBase64Url,
  isValidPublicKey,
  P256_PUBLIC_KEY_BYTES,
} from "@/lib/push/keys";
import { MAX_PUSH_PLAINTEXT } from "@/lib/push/types";

/**
 * تشفير حمولة دفع الويب — `aes128gcm` (RFC 8188) بمشتقّات RFC 8291.
 *
 * ── لماذا التشفير ليس اختيارياً هنا ─────────────────────────────────────────
 *
 * خدمة الدفع وسيطٌ لا نأتمنه: هي التي تخزّن الرسالة حتى يستيقظ الجهاز. فالمعيار
 * يفرض ألا تفهمها — المفتاح يُشتقّ من زوجٍ **عابر** نولّده لكل رسالة، ومن مفتاح
 * الجهاز العام وسرِّ مصادقته اللذين لا يملكهما الوسيط. ونحن لا نحتفظ بالزوج
 * العابر: نرسله في الترويسة نفسها ونرميه.
 *
 * ── الخطوات كما في المعيار، بلا اجتهاد ──────────────────────────────────────
 *
 * ```text
 * ecdh_secret = ECDH(as_private, ua_public)                       (٣٢ بايت)
 * IKM   = HKDF(ikm=ecdh_secret, salt=auth_secret,
 *              info="WebPush: info"‖0x00‖ua_public‖as_public, 32)
 * CEK   = HKDF(ikm=IKM, salt=salt, info="Content-Encoding: aes128gcm"‖0x00, 16)
 * NONCE = HKDF(ikm=IKM, salt=salt, info="Content-Encoding: nonce"‖0x00,     12)
 * body  = salt(16) ‖ rs(4) ‖ idlen(1)=65 ‖ as_public(65) ‖ AES128GCM(CEK, NONCE, plaintext‖0x02)
 * ```
 *
 * ⚠ **و`0x02` في آخر النص الصريح ليس حشواً زائداً**: هو فاصل «هذا آخر سجلّ» في
 * RFC 8188. وبـ`0x01` بدلاً منه يفكّ الجهاز التشفير بنجاح ثم **ينتظر سجلاً
 * تالياً لا يأتي**، فلا تظهر بطاقة — بلا خطأ في أي طرف. أعطبُ ما في هذا الملف
 * بايتٌ واحد لا يُخطئه إلا من كتبه من ذاكرته.
 *
 * ── وما لا نفعله عمداً ──────────────────────────────────────────────────────
 *
 * لا نقسّم الحمولة على سجلّات. السقف ٤٠٩٦ بايت للجسم كله عند كل خدمة دفع، فأي
 * حمولة تحتاج سجلَّين مرفوضةٌ سلفاً — والقصّ يقع **قبل** الوصول إلى هنا
 * (`lib/push/payload.ts`)، ويُرفض هنا برمزٍ صريح لا يُقصّ صامتاً.
 */

/** حجم السجل المعلَن في الترويسة — نفس ما تعلنه كل التطبيقات الشائعة */
const RECORD_SIZE = 4096;

const KEY_INFO_PREFIX = Buffer.from("WebPush: info\0", "utf8");
const CEK_INFO = Buffer.from("Content-Encoding: aes128gcm\0", "utf8");
const NONCE_INFO = Buffer.from("Content-Encoding: nonce\0", "utf8");

/** فاصل «آخر سجلّ» في RFC 8188 — اقرأ التحذير أعلاه قبل تغييره */
const LAST_RECORD_DELIMITER = 0x02;

export type EncryptResult =
  | { ok: true; body: Buffer }
  /** `bad-key` = مفتاح الجهاز أو سرّه غير صالح · `too-large` = تجاوز السقف */
  | { ok: false; code: "bad-key" | "too-large" | "crypto-failed" };

const hkdf = (ikm: Buffer, salt: Buffer, info: Buffer, length: number): Buffer =>
  Buffer.from(hkdfSync("sha256", ikm, salt, info, length));

/**
 * يشفّر `plaintext` لجهازٍ بعينه ويرجع **جسم الطلب كاملاً** جاهزاً للإرسال.
 *
 * لا يرمي أبداً: خطأ التشفير يرجع رمزاً، لأن المنادي داخل دورة عاملٍ تعالج
 * طابور إشعارات — واستثناءٌ واحد من جهازٍ واحد لا يجوز أن يوقف الطابور كله.
 */
export function encryptPushPayload(
  plaintext: Buffer,
  p256dh: string,
  auth: string
): EncryptResult {
  if (plaintext.length > MAX_PUSH_PLAINTEXT) return { ok: false, code: "too-large" };

  const uaPublic = fromBase64Url(p256dh, P256_PUBLIC_KEY_BYTES);
  const authSecret = fromBase64Url(auth, AUTH_SECRET_BYTES);
  if (!isValidPublicKey(uaPublic) || !authSecret) return { ok: false, code: "bad-key" };

  try {
    // زوجٌ عابر لكل رسالة — لا يُخزَّن ولا يُعاد استعماله
    const ephemeral = createECDH("prime256v1");
    ephemeral.generateKeys();
    const asPublic = ephemeral.getPublicKey();
    const sharedSecret = ephemeral.computeSecret(uaPublic);

    const salt = randomBytes(16);

    const keyInfo = Buffer.concat([KEY_INFO_PREFIX, uaPublic, asPublic]);
    const ikm = hkdf(sharedSecret, authSecret, keyInfo, 32);
    const contentKey = hkdf(ikm, salt, CEK_INFO, 16);
    const nonce = hkdf(ikm, salt, NONCE_INFO, 12);

    const cipher = createCipheriv("aes-128-gcm", contentKey, nonce);
    const ciphertext = Buffer.concat([
      cipher.update(plaintext),
      cipher.update(Buffer.from([LAST_RECORD_DELIMITER])),
      cipher.final(),
      cipher.getAuthTag(),
    ]);

    const header = Buffer.alloc(5);
    header.writeUInt32BE(RECORD_SIZE, 0);
    header.writeUInt8(asPublic.length, 4);

    return { ok: true, body: Buffer.concat([salt, header, asPublic, ciphertext]) };
  } catch {
    return { ok: false, code: "crypto-failed" };
  }
}
