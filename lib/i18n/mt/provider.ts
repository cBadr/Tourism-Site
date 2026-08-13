import type { MtProvider } from "@/lib/i18n-types";

/**
 * الطبقة المشتركة لمزوّدي الترجمة الآلية (المرحلة ٨).
 *
 * الواجهة نفسها في العقد (`lib/i18n-types.ts`): دالة واحدة تأخذ دفعة نصوص
 * عربية وتُرجع مصفوفة بالطول نفسه، فيها النص المترجم أو `null` لكل عنصر تعذّرت
 * ترجمته. **لا مزوّد يرمي استثناءً أبداً** — الفشل يُبلَّغ بـ null، لأن هذا
 * الطابور يعمل خلف زر في اللوحة وخلف مهمة مجدولة، وسقوط الطلب كله بسبب نص
 * واحد يعني ترجمة صفر بدل ترجمة تسعة من عشرة.
 *
 * ── السقف الصلب: لماذا لا نترجم كل شيء بضغطة واحدة ────────────────────────
 * المزوّد الافتراضي (MyMemory) مجاني بلا مفتاح، وحصته اليومية للزائر المجهول
 * صغيرة (بضعة آلاف حرف). لو أطلقنا ٦٠٠ مفتاح دفعةً واحدة لاحترقت حصة اليوم في
 * ثوانٍ وعاد الباقي فارغاً — والمالك يظن أن الخط معطّل. لذلك كل استدعاء محدود
 * بعدد نصوص وعدد حروف، والباقي يبقى في الطابور لضغطة تالية. القيود هنا مركزية
 * حتى لا يفلت منها مزوّد جديد يُضاف لاحقاً.
 *
 * ملاحظة على الجودة: MyMemory يرفض النص الطويل (حد الاستعلام ~٥٠٠ بايت)، لذلك
 * النص الطويل يُقسَّم إلى مقاطع عند حدود الجمل ثم تُلصق النتائج. أطول من ذلك
 * يُترك بلا ترجمة آلية عمداً — فقرة كاملة مقطّعة آلياً تنتج نصاً رديئاً يضيع
 * وقت المراجع بدل أن يوفّره.
 */

export type { MtProvider };

/** أقصى عدد نصوص في استدعاء واحد للمزوّد — سقف صلب ضد حرق الحصة اليومية */
export const MT_MAX_TEXTS = 40;

/** أقصى مجموع حروف في استدعاء واحد */
export const MT_MAX_CHARS = 4000;

/** نص أطول من هذا لا يُرسَل للترجمة الآلية إطلاقاً (يُترك للمراجع البشري) */
export const MT_MAX_TEXT_CHARS = 1200;

/** أقصى طول مقطع واحد — دون حد استعلام MyMemory (~٥٠٠ بايت) بهامش أمان */
export const MT_SEGMENT_CHARS = 420;

/** أقصى عدد مقاطع للنص الواحد */
export const MT_MAX_SEGMENTS = 4;

/** مهلة الطلب الواحد — لا ننتظر مزوّداً بطيئاً أكثر من هذا */
export const MT_TIMEOUT_MS = 8000;

/** أقل فاصل زمني بين طلبين متتاليين — تهذيب تجاه خدمة مجانية */
export const MT_GAP_MS = 400;

/** عنصر من الدفعة اجتاز السقوف والفلترة، ومعه موضعه الأصلي */
export type MtPlanEntry = { index: number; text: string };

export const sleep = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms));

/** مصفوفة نتائج فارغة بطول الدفعة — «لم يُترجم شيء» بصيغة العقد */
export function nullResults(count: number): (string | null)[] {
  return new Array<string | null>(count).fill(null);
}

/** كود لغة هدف مقبول: en، fr، pt-BR… وبحروف صغيرة للجزء الأول */
export function normalizeTarget(target: string): string | null {
  const value = target.trim();
  if (!/^[A-Za-z]{2,3}(-[A-Za-z0-9]{2,8})?$/.test(value)) return null;
  const [base, region] = value.split("-");
  return region ? `${base.toLowerCase()}-${region.toUpperCase()}` : base.toLowerCase();
}

/** حرف عربي أو لاتيني — بهروب يونيكود لا بحروف حرفية داخل الصنف */
const LETTER = /[A-Za-z؀-ۿ]/;

/**
 * نص يستحق نداء شبكة؟ الفارغ وما لا حرف فيه (أرقام، رموز، روابط) لا يُرسَل —
 * المزوّد سيُرجعه كما هو أو يفسده، وفي الحالتين أهدرنا من الحصة بلا مقابل.
 */
export function isTranslatable(text: string): boolean {
  const value = text.trim();
  if (value === "") return false;
  if (value.length > MT_MAX_TEXT_CHARS) return false;
  if (/^https?:\/\/\S+$/i.test(value)) return false;
  // حرف عربي أو لاتيني واحد على الأقل (نطاق يونيكود بالهروب لا بالحرف)
  return LETTER.test(value);
}

/**
 * تخطيط الدفعة: يرشّح ما لا يستحق الترجمة، ويقف عند السقوف (عدد وحروف).
 * ما لم يدخل الخطة يبقى `null` في النتيجة — أي يبقى في الطابور لضغطة تالية.
 */
export function planInvocation(texts: string[]): MtPlanEntry[] {
  const entries: MtPlanEntry[] = [];
  let chars = 0;

  for (let index = 0; index < texts.length; index += 1) {
    if (entries.length >= MT_MAX_TEXTS) break;
    const text = texts[index] ?? "";
    if (!isTranslatable(text)) continue;
    const trimmed = text.trim();
    if (chars + trimmed.length > MT_MAX_CHARS) break;
    chars += trimmed.length;
    entries.push({ index, text: trimmed });
  }

  return entries;
}

/** علامات نهاية الجملة التي نقطع بعدها */
const SENTENCE_END = new Set([".", "!", "?", "؟", "؛", "\n"]);

/** قسمة النص إلى جمل مع إبقاء علامة النهاية ملتصقة بجملتها */
function splitSentences(value: string): string[] {
  const out: string[] = [];
  let current = "";

  for (const char of value) {
    current += char;
    if (SENTENCE_END.has(char)) {
      out.push(current.trim());
      current = "";
    }
  }
  if (current.trim() !== "") out.push(current.trim());
  return out.filter((s) => s !== "");
}

/**
 * تقطيع نص طويل إلى مقاطع عند حدود الجمل (ثم عند المسافات عند الضرورة).
 * `null` تعني «لا تترجمه آلياً»: إما أطول من الحد أو يحتاج مقاطع أكثر من
 * المسموح — والنص المقطّع أكثر من اللازم يخرج ركيكاً لا يستحق المراجعة.
 */
export function segmentText(text: string): string[] | null {
  const value = text.trim();
  if (value === "") return null;
  if (value.length <= MT_SEGMENT_CHARS) return [value];
  if (value.length > MT_MAX_TEXT_CHARS) return null;

  // الجمل أولاً: النقطة والفاصلة المنقوطة وعلامتا الاستفهام والتعجب وسطر جديد.
  // القسمة يدوية لا بـ lookbehind — بناء لغوي أحدث من هدف الترجمة في tsconfig.
  const sentences = splitSentences(value);
  const chunks: string[] = [];
  let current = "";

  const push = (piece: string) => {
    const clean = piece.trim();
    if (clean !== "") chunks.push(clean);
  };

  for (const sentence of sentences) {
    if (sentence.length > MT_SEGMENT_CHARS) {
      // جملة واحدة أطول من الحد — تُقطع عند آخر مسافة قبل الحد
      push(current);
      current = "";
      let rest = sentence;
      while (rest.length > MT_SEGMENT_CHARS) {
        const window = rest.slice(0, MT_SEGMENT_CHARS);
        const cut = window.lastIndexOf(" ");
        const head = cut > 40 ? window.slice(0, cut) : window;
        push(head);
        rest = rest.slice(head.length);
      }
      current = rest.trim();
      continue;
    }

    if ((current + " " + sentence).trim().length > MT_SEGMENT_CHARS) {
      push(current);
      current = sentence;
    } else {
      current = current === "" ? sentence : `${current} ${sentence}`;
    }
  }
  push(current);

  if (chunks.length === 0 || chunks.length > MT_MAX_SEGMENTS) return null;
  return chunks;
}

/**
 * نداء شبكة لا يرمي أبداً: مهلة صريحة، وأي فشل (شبكة، مهلة، JSON تالف، رمز
 * حالة غير ناجح) يرجع null. الفصل بين «فشل» و«رد فيه خطأ» يقع في كل مزوّد.
 */
export async function fetchJson(
  url: string,
  init?: RequestInit,
  timeoutMs: number = MT_TIMEOUT_MS
): Promise<unknown | null> {
  try {
    const response = await fetch(url, {
      ...init,
      cache: "no-store",
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (!response.ok) return null;
    return (await response.json()) as unknown;
  } catch {
    return null;
  }
}

/** فك كيانات HTML الشائعة — بعض المزوّدين يُرجعون ‎&#39;‎ و‎&quot;‎ كما هي */
export function decodeEntities(text: string): string {
  return text
    .replace(/&#(\d+);/g, (_, code: string) => String.fromCharCode(Number(code)))
    .replace(/&#x([0-9a-f]+);/gi, (_, code: string) => String.fromCharCode(parseInt(code, 16)))
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&");
}

/** مزوّد صامت — يُرجع nulls دائماً. يُستعمل حين تُطفأ الترجمة الآلية بالإعداد */
export function createNullProvider(reason: string): MtProvider {
  return {
    id: "none",
    label: reason,
    async translate(texts: string[]): Promise<(string | null)[]> {
      return nullResults(texts.length);
    },
  };
}
