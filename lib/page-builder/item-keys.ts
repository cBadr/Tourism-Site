/**
 * سكّ مفاتيح العناصر `_k` — العلاج المباشر لعطبٍ **مقيس** لا متوقَّع.
 *
 * العنوان القديم لعنصر داخل `items` ترتيبيٌّ (`<sectionId>.items.<i>.<field>`)،
 * فبدّل عنصرين — وهو ما يفعله السحب والإفلات حرفياً — تنتقل ترجمة الأول إلى
 * الثاني وتُعرض على الزائر ممزوجة. والمفتاح الثابت يجعل العنوان يصف **العنصر**
 * لا **موضعه** (العقد §٤).
 *
 * ⚠ والقاعدة المشتقة الإلزامية: **لا مقبض سحب على `items` كتلةٍ لا تحمل
 * عناصرها `_k`**. لذلك `itemsAreKeyed` ليست زينةً — هي شرط تفعيل الترتيب في
 * الشاشة.
 */

import { ITEM_KEY_FIELD, ITEM_KEY_PATTERN, type ItemKey } from "@/lib/page-builder-types";

const ALPHABET = "abcdefghijklmnopqrstuvwxyz0123456789";

/**
 * ست خانات `[a-z0-9]`. المصدر `crypto` حيث وُجد (المتصفح وNode 18+) — لا لأن
 * المفتاح سرّ، بل لأن `Math.random` في حلقةٍ ضيّقة يعطي تصادماً أكثر مما يبدو،
 * والتصادم هنا يعني عنصرين بعنوان ترجمة واحد.
 */
export function mintItemKey(taken: ReadonlySet<string> = new Set()): ItemKey {
  for (let attempt = 0; attempt < 50; attempt++) {
    let key = "";
    const bytes = new Uint8Array(6);
    if (typeof globalThis.crypto?.getRandomValues === "function") {
      globalThis.crypto.getRandomValues(bytes);
    } else {
      for (let i = 0; i < bytes.length; i++) bytes[i] = Math.floor(Math.random() * 256);
    }
    for (let i = 0; i < 6; i++) key += ALPHABET[bytes[i] % ALPHABET.length];
    if (!taken.has(key)) return key;
  }
  // خمسون محاولة فاشلة على فضاء ٢ مليار مفتاح تعني عطباً في مصدر العشوائية،
  // لا حظاً سيئاً — والصمت هنا يعني عنوان ترجمة مكرراً.
  throw new Error("تعذّر سكّ مفتاح عنصر فريد");
}

type Item = Record<string, unknown>;

/** هل القيمة مصفوفة عناصر؟ (كائنات مسطّحة — لا نصوص ولا مصفوفات متداخلة) */
export function isItemArray(value: unknown): value is Item[] {
  return (
    Array.isArray(value) &&
    value.every((entry) => typeof entry === "object" && entry !== null && !Array.isArray(entry))
  );
}

/** المفتاح صالحٌ ومطابقٌ للنمط؟ */
export function isValidItemKey(value: unknown): value is ItemKey {
  return typeof value === "string" && ITEM_KEY_PATTERN.test(value);
}

/**
 * هل **كل** عناصر هذه القائمة مفتاحةٌ ومفاتيحها فريدة؟ قائمةٌ فارغة = نعم
 * (لا شيء يُعاد ترتيبه فلا شيء يُكسر).
 */
export function itemsAreKeyed(value: unknown): boolean {
  if (!isItemArray(value)) return false;
  const seen = new Set<string>();
  for (const item of value) {
    const key = item[ITEM_KEY_FIELD];
    if (!isValidItemKey(key) || seen.has(key)) return false;
    seen.add(key);
  }
  return true;
}

/**
 * سكّ المفاتيح الناقصة **مع إبقاء الموجود كما هو** — المفتاح المنشور لا يُسحب.
 * يرجع القائمة الجديدة وعدد ما سُكَّ (‏`0` = لا تغيير، فلا تُوسَّخ المسودة).
 */
export function mintKeysForItems(value: unknown): { items: Item[]; minted: number } {
  if (!isItemArray(value)) return { items: [], minted: 0 };
  const taken = new Set<string>();
  for (const item of value) {
    const key = item[ITEM_KEY_FIELD];
    if (isValidItemKey(key)) taken.add(key);
  }
  let minted = 0;
  const items = value.map((item) => {
    const key = item[ITEM_KEY_FIELD];
    // المفتاح المكرر يُعاد سكّه: تكرارُه يعني عنوانَي ترجمةٍ واحداً لعنصرين
    if (isValidItemKey(key) && countIn(value, key) === 1) return item;
    const fresh = mintItemKey(taken);
    taken.add(fresh);
    minted++;
    return { ...item, [ITEM_KEY_FIELD]: fresh };
  });
  return { items, minted };
}

function countIn(items: Item[], key: string): number {
  let n = 0;
  for (const item of items) if (item[ITEM_KEY_FIELD] === key) n++;
  return n;
}

/**
 * إعادة سكّ **كل** المفاتيح — للاستيراد وحده.
 *
 * 🔴 قالبٌ مستورَد يحمل مفاتيح صفحته الأصلية، فلصقُه بلا إعادة سكّ يُسند
 * ترجمات صفحةٍ أخرى إلى صفحةٍ جديدة (الثمن ٢ في موجز المرحلة). ولذلك هذه
 * الدالة **لا تُعيد استعمال أي مفتاح**، ولا تُنادى إلا من مسار الاستيراد.
 */
export function remintItemKeys(value: unknown): Item[] {
  if (!isItemArray(value)) return [];
  const taken = new Set<string>();
  return value.map((item) => {
    const fresh = mintItemKey(taken);
    taken.add(fresh);
    return { ...item, [ITEM_KEY_FIELD]: fresh };
  });
}

export { ITEM_KEY_FIELD };
