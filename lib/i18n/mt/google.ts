import "server-only";

import {
  decodeEntities,
  fetchJson,
  type MtProvider,
  normalizeTarget,
  nullResults,
  planInvocation,
} from "./provider";

/**
 * Google Cloud Translation (v2) — **مكتوب وخامد** كسابقه: لا يعمل إلا بوجود
 * `GOOGLE_TRANSLATE_API_KEY`. البديل الثاني حين لا يغطي DeepL لغة مطلوبة
 * (لغات الذيل الطويل: الروسية، الصينية، الأوردو…).
 *
 * v2 لا v3 عمداً: v3 يحتاج حساب خدمة وملف اعتماد ومشروعاً مربوطاً بالفوترة
 * بصلاحيات IAM، وهذا عبء تشغيلي لا يناسب مالكاً يدير الموقع من لوحته. v2
 * يحتاج مفتاح API واحداً في متغير بيئة، ويقبل دفعة نصوص في الطلب الواحد.
 *
 * `format: "text"` مقصود: الافتراضي HTML، وحينها يُرجع الرد كيانات مرمّزة
 * (‎&#39;‎) داخل نصوص عربية — فكّها في `decodeEntities` احتياطاً على أي حال.
 */

const ENDPOINT = "https://translation.googleapis.com/language/translate/v2";

export function createGoogleProvider(apiKey: string): MtProvider {
  return {
    id: "google",
    label: "Google Translate — بمفتاح مدفوع",

    async translate(texts: string[], target: string): Promise<(string | null)[]> {
      const out = nullResults(texts.length);

      const lang = normalizeTarget(target);
      if (!lang || lang.startsWith("ar")) return out;

      const plan = planInvocation(texts);
      if (plan.length === 0) return out;

      const data = await fetchJson(`${ENDPOINT}?key=${encodeURIComponent(apiKey.trim())}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          q: plan.map((entry) => entry.text),
          source: "ar",
          target: lang,
          format: "text",
        }),
      });

      if (!data || typeof data !== "object") return out;
      const payload = (data as Record<string, unknown>).data;
      if (!payload || typeof payload !== "object") return out;
      const list = (payload as Record<string, unknown>).translations;
      if (!Array.isArray(list)) return out;

      for (let i = 0; i < plan.length; i += 1) {
        const row = list[i];
        if (!row || typeof row !== "object") continue;
        const value = (row as Record<string, unknown>).translatedText;
        if (typeof value !== "string") continue;
        const clean = decodeEntities(value).trim();
        if (clean !== "") out[plan[i].index] = clean;
      }

      return out;
    },
  };
}
