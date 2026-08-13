import "server-only";

import { fetchJson, type MtProvider, normalizeTarget, nullResults, planInvocation } from "./provider";

/**
 * DeepL — **مكتوب وخامد**: لا يعمل إلا إذا وُجد `DEEPL_API_KEY` في البيئة.
 *
 * سبب وجوده الآن رغم غياب المفتاح: العقد يشترط أن تُضاف جودة أعلى بمفتاح فقط،
 * بلا تعديل كود ولا هجرة ولا إعادة بناء لخط الإنتاج. حين يشتري المالك مفتاحاً
 * يضبط متغيرين ويعيد التشغيل، وتصير كل مسودة جديدة أفضل — والمراجَع المنشور
 * لا يُمس (المزوّد مسجَّل في عمود `provider` لكل صف، فيُعرف مصدر كل مسودة).
 *
 * مفتاح النسخة المجانية ينتهي بـ `:fx` ويُنادى على نطاق مختلف — نميّزه هنا
 * حتى لا يقع المالك في خطأ «مفتاح صحيح ونطاق خاطئ» الشهير.
 *
 * DeepL يقبل دفعة نصوص في طلب واحد (حتى ٥٠)، فلا حاجة للتسلسل ولا للفواصل.
 */

const FREE_HOST = "https://api-free.deepl.com";
const PRO_HOST = "https://api.deepl.com";

/** DeepL يريد رمز اللغة بحروف كبيرة، وبعض اللغات بصيغة إقليمية إلزامية */
function deeplTarget(target: string): string | null {
  const lang = normalizeTarget(target);
  if (!lang) return null;
  const upper = lang.toUpperCase();
  // الإنجليزية والبرتغالية عند DeepL تحتاج تحديد اللهجة في الهدف
  if (upper === "EN") return "EN-US";
  if (upper === "PT") return "PT-PT";
  return upper;
}

export function createDeeplProvider(apiKey: string): MtProvider {
  const host = apiKey.trim().endsWith(":fx") ? FREE_HOST : PRO_HOST;

  return {
    id: "deepl",
    label: "DeepL — بمفتاح مدفوع",

    async translate(texts: string[], target: string): Promise<(string | null)[]> {
      const out = nullResults(texts.length);

      const lang = deeplTarget(target);
      if (!lang || lang.startsWith("AR")) return out;

      const plan = planInvocation(texts);
      if (plan.length === 0) return out;

      const data = await fetchJson(`${host}/v2/translate`, {
        method: "POST",
        headers: {
          Authorization: `DeepL-Auth-Key ${apiKey.trim()}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          text: plan.map((entry) => entry.text),
          source_lang: "AR",
          target_lang: lang,
        }),
      });

      if (!data || typeof data !== "object") return out;
      const list = (data as Record<string, unknown>).translations;
      if (!Array.isArray(list)) return out;

      for (let i = 0; i < plan.length; i += 1) {
        const row = list[i];
        if (!row || typeof row !== "object") continue;
        const value = (row as Record<string, unknown>).text;
        if (typeof value !== "string") continue;
        const clean = value.trim();
        if (clean !== "") out[plan[i].index] = clean;
      }

      return out;
    },
  };
}
