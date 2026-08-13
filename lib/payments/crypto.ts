import { createHmac, createVerify, randomBytes, timingSafeEqual } from "node:crypto";

/**
 * أدوات التوقيع المشتركة بين المحوّلات.
 *
 * ثلاث قواعد تحكم كل دالة هنا:
 *
 * (١) **المقارنة بزمن ثابت دائماً.** مقارنة توقيعين بـ `===` تُسرّب طول البادئة
 *     المتطابقة عبر زمن التنفيذ، ومن يستطيع إرسال آلاف الطلبات يستنتج التوقيع
 *     الصحيح محرفاً محرفاً. كل مقارنة هنا تمر بـ `timingSafeEqual`.
 *
 * (٢) **الجسم الخام لا المُعاد بناؤه.** توقيع المزوّد على البايتات التي أرسلها
 *     حرفياً؛ `JSON.parse` ثم `JSON.stringify` يغيّر المسافات وترتيب المفاتيح
 *     فيُبطل توقيعاً صحيحاً. الاستثناء الوحيد مزوّد يوثّق صراحةً أنه يوقّع على
 *     صيغة مُعاد بناؤها (NOWPayments) — وهناك نبني ما وثّقه بالضبط.
 *
 * (٣) **لا مفتاح فارغ.** الدوال هنا لا تفحص ذلك؛ الفحص في `requireEnv` قبلها،
 *     لأن HMAC بمفتاح فارغ توقيع يستطيع أي أحد إنتاجه.
 */

export type HmacAlgorithm = "sha256" | "sha512" | "md5";

export function hmacHex(algorithm: HmacAlgorithm, secret: string, payload: string): string {
  return createHmac(algorithm, secret).update(payload, "utf8").digest("hex");
}

export function hmacBase64(algorithm: HmacAlgorithm, secret: string, payload: string): string {
  return createHmac(algorithm, secret).update(payload, "utf8").digest("base64");
}

/** مقارنة نصين بزمن ثابت — اختلاف الطول يُرد فوراً (الطول ليس سرّاً) */
export function safeEqual(a: string, b: string): boolean {
  const left = Buffer.from(a, "utf8");
  const right = Buffer.from(b, "utf8");
  if (left.length !== right.length) return false;
  return timingSafeEqual(left, right);
}

/** مقارنة توقيعين ست عشريين بلا حساسية لحالة الأحرف (المزوّدون يخلطون) */
export function safeEqualHex(a: string, b: string): boolean {
  return safeEqual(a.trim().toLowerCase(), b.trim().toLowerCase());
}

/** التحقق من توقيع RSA (SHA256withRSA) — يستعمله PayPal وBinance Pay */
export function verifyRsaSha256(
  publicKeyPem: string,
  payload: string,
  signatureBase64: string
): boolean {
  try {
    const verifier = createVerify("RSA-SHA256");
    verifier.update(payload, "utf8");
    verifier.end();
    return verifier.verify(publicKeyPem, signatureBase64, "base64");
  } catch {
    // مفتاح مشوّه أو توقيع ليس base64 — رفض، لا انهيار
    return false;
  }
}

/**
 * CRC32 (متعدد الحدود IEEE 802.3) — يحتاجه تحقق PayPal من الـ webhook.
 *
 * مكتوب هنا يدوياً بدل `zlib.crc32` لأن تلك الدالة لم تُضف إلا في إصدارات
 * حديثة من Node، وإخفاق الاعتماد عليها يظهر وقت التشغيل على منصة النشر لا
 * وقت البناء — وهو آخر مكان نريد أن يفشل فيه تحقق توقيع.
 */
const CRC32_TABLE: Uint32Array = (() => {
  const table = new Uint32Array(256);
  for (let i = 0; i < 256; i += 1) {
    let c = i;
    for (let k = 0; k < 8; k += 1) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    table[i] = c >>> 0;
  }
  return table;
})();

export function crc32(input: string): number {
  const bytes = Buffer.from(input, "utf8");
  let crc = 0xffffffff;
  for (let i = 0; i < bytes.length; i += 1) {
    crc = CRC32_TABLE[(crc ^ bytes[i]) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

/**
 * تسلسل JSON بمفاتيح مرتبة أبجدياً على كل المستويات.
 *
 * ليس تجميلاً: NOWPayments توثّق أن توقيع الـ IPN يُحسب على الجسم **بعد** ترتيب
 * مفاتيحه، فإعادة البناء هنا مطابقة لما تفعله مكتبتهم لا اجتهاد منّا.
 */
export function sortedJson(value: unknown): string {
  return JSON.stringify(sortValue(value));
}

function sortValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortValue);
  if (value !== null && typeof value === "object") {
    const source = value as Record<string, unknown>;
    const out: Record<string, unknown> = {};
    for (const key of Object.keys(source).sort()) out[key] = sortValue(source[key]);
    return out;
  }
  return value;
}

/** نص عشوائي ست عشري — الأرقام العشوائية (nonce) في طلبات المزوّدين */
export function randomHex(bytes: number): string {
  return randomBytes(Math.max(bytes, 1)).toString("hex");
}

/**
 * نص أبجدي رقمي قصير من عشوائية آمنة — مرجع الطلب لدى المزوّدين الذين يشترطون
 * ألّا يحوي المرجع رموزاً (Binance Pay مثلاً: حروف وأرقام فقط).
 */
export function randomAlnum(length: number): string {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
  const size = Math.max(length, 1);
  const bytes = randomBytes(size);
  let out = "";
  for (let i = 0; i < size; i += 1) out += alphabet[bytes[i] % alphabet.length];
  return out;
}
