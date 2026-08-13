import "server-only";

import {
  decodeEntities,
  fetchJson,
  MT_GAP_MS,
  type MtProvider,
  normalizeTarget,
  nullResults,
  planInvocation,
  segmentText,
  sleep,
} from "./provider";

/**
 * MyMemory — المزوّد الافتراضي: **مجاني بلا مفتاح**.
 *
 * لماذا هو الافتراضي؟ لأن المشروع لا يملك مفتاحاً مدفوعاً اليوم، وخط الإنتاج
 * كله (توليد ← مسودة ← مراجعة ← نشر) يجب أن يعمل من أول يوم بلا اشتراك. جودته
 * أقل من DeepL بوضوح — وهذا مقبول لأن مخرجاته **مسودة تُراجَع** لا نص يُنشر.
 *
 * حدود الخدمة المجانية كما توثّقها هي:
 *  · الاستعلام الواحد قصير (~٥٠٠ بايت) ⇒ النص الطويل يُقسَّم في `segmentText`.
 *  · حصة يومية للزائر المجهول (بضعة آلاف حرف لكل IP)، ترتفع كثيراً بإضافة
 *    بريد إلكتروني في المعامل `de` ⇒ متغير البيئة الاختياري `MYMEMORY_EMAIL`.
 *  · لا دفعات: نص واحد لكل طلب ⇒ نرسل بالتسلسل بفاصل مؤدب بين الطلبات، لا
 *    عشرات الطلبات المتوازية التي تُقرأ عند المزوّد كإساءة استعمال.
 *
 * حين تنفد الحصة يرد المزوّد بنص تحذير بدل ترجمة. نلتقط ذلك ونتوقف فوراً عن
 * بقية الدفعة: إكمال النداءات بعد نفاد الحصة يملأ الطابور بنصوص تحذير
 * إنجليزية تبدو ترجمات — وهذا أسوأ من لا شيء.
 */

const ENDPOINT = "https://api.mymemory.translated.net/get";

/** أنماط ردود «الحصة نفدت» أو «الاستعلام مرفوض» كما يكتبها المزوّد */
const QUOTA_PATTERN = /MYMEMORY WARNING|USED ALL AVAILABLE FREE TRANSLATIONS|QUOTA/i;
const REJECTED_PATTERN = /QUERY LENGTH LIMIT|INVALID (SOURCE|TARGET) LANGUAGE|PLEASE (SELECT|SPECIFY)/i;

type OneResult = { text: string | null; quotaExhausted: boolean };

async function requestOne(text: string, langpair: string): Promise<OneResult> {
  const params = new URLSearchParams({ q: text, langpair });

  // البريد ليس سرّاً ولا مفتاحاً — مجرد تعريف يرفع الحصة اليومية عند المزوّد
  const email = process.env.MYMEMORY_EMAIL?.trim();
  if (email) params.set("de", email);

  const data = await fetchJson(`${ENDPOINT}?${params.toString()}`);
  if (!data || typeof data !== "object") return { text: null, quotaExhausted: false };

  const body = data as Record<string, unknown>;
  const status = Number(body.responseStatus);
  const details = typeof body.responseDetails === "string" ? body.responseDetails : "";

  if (QUOTA_PATTERN.test(details) || status === 429) {
    return { text: null, quotaExhausted: true };
  }

  const payload =
    body.responseData && typeof body.responseData === "object"
      ? (body.responseData as Record<string, unknown>)
      : null;
  const translated =
    payload && typeof payload.translatedText === "string" ? payload.translatedText : null;

  if (translated === null || (Number.isFinite(status) && status !== 200)) {
    return { text: null, quotaExhausted: false };
  }
  if (QUOTA_PATTERN.test(translated)) return { text: null, quotaExhausted: true };
  if (REJECTED_PATTERN.test(translated)) return { text: null, quotaExhausted: false };

  const clean = decodeEntities(translated).trim();
  return { text: clean === "" ? null : clean, quotaExhausted: false };
}

export function createMyMemoryProvider(): MtProvider {
  return {
    id: "mymemory",
    label: "MyMemory — مجاني بلا مفتاح",

    async translate(texts: string[], target: string): Promise<(string | null)[]> {
      const out = nullResults(texts.length);

      const lang = normalizeTarget(target);
      if (!lang || lang.startsWith("ar")) return out; // العربية هي الأصل لا الهدف

      const langpair = `ar|${lang}`;
      const plan = planInvocation(texts);
      let lastCallAt = 0;

      for (const entry of plan) {
        const parts = segmentText(entry.text);
        if (!parts) continue; // نص أطول من الحد — يبقى للمراجع البشري

        const pieces: string[] = [];
        let quotaExhausted = false;

        for (const part of parts) {
          const wait = MT_GAP_MS - (Date.now() - lastCallAt);
          if (wait > 0) await sleep(wait);
          lastCallAt = Date.now();

          const result = await requestOne(part, langpair);
          if (result.quotaExhausted) {
            quotaExhausted = true;
            break;
          }
          if (result.text === null) break; // فشل مقطع ⇒ لا نلصق نصاً ناقصاً
          pieces.push(result.text);
        }

        // نفاد الحصة يوقف الدفعة كلها — الباقي يبقى في الطابور ليوم آخر
        if (quotaExhausted) break;
        if (pieces.length === parts.length) {
          const joined = pieces.join(" ").trim();
          out[entry.index] = joined === "" ? null : joined;
        }
      }

      return out;
    },
  };
}
