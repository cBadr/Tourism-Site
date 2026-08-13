import ar from "@/messages/ar.json";
import en from "@/messages/en.json";
import { DEFAULT_LOCALE } from "./config";

/**
 * كتالوجات نصوص الواجهة (namespace = `ui` في عقد `lib/i18n-types.ts`).
 *
 * ── قاعدة السقوط على العربية (القاعدة ٤) ────────────────────────────────────
 * لا نكتفي بـ `getMessageFallback` وقت العرض: ندمج كتالوج اللغة **فوق** العربي
 * عند التحميل، فأي مفتاح ناقص أو غير مترجَم بعد يخرج بنصه العربي جاهزاً. النتيجة
 * أن الزائر لا يرى مفتاحاً خاماً ولا فراغاً في أي حال — ولا يرى صفحة نصفها فارغ
 * لمجرد أن ملف اللغة تأخر عن ملف العربية بمفتاح واحد.
 *
 * الملفات مستورَدة استيراداً ثابتاً لا ديناميكياً: عددها صغير ومعروف وقت البناء،
 * والاستيراد الثابت يجعل الدمج فوق العربية ممكناً بلا انتظار أي وعد.
 */

export type MessageNode = string | { [key: string]: MessageNode };
export type MessageCatalog = { [key: string]: MessageNode };

/** الكتالوجات المشحونة مع المستودع */
const CATALOGS: Record<string, MessageCatalog> = {
  ar: ar as MessageCatalog,
  en: en as MessageCatalog,
};

/** الكتالوج العربي — الأصل الذي يُدمج فوقه كل شيء */
export const BASE_CATALOG: MessageCatalog = CATALOGS[DEFAULT_LOCALE] ?? {};

function isNode(value: unknown): value is { [key: string]: MessageNode } {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** دمج عميق: قيمة اللغة تسبق، والعربية تسدّ كل ثغرة */
function mergeCatalogs(base: MessageCatalog, override: MessageCatalog): MessageCatalog {
  const out: MessageCatalog = { ...base };
  for (const [key, value] of Object.entries(override)) {
    const current = out[key];
    if (isNode(current) && isNode(value)) {
      out[key] = mergeCatalogs(current, value);
      continue;
    }
    // نص فارغ = «لم يُترجم بعد» ⇒ يبقى العربي مكانه
    if (typeof value === "string" && value.trim() === "" && current !== undefined) continue;
    out[key] = value;
  }
  return out;
}

const memo = new Map<string, MessageCatalog>();

/** رسائل لغة كاملة مدموجة فوق العربية — تُحسب مرة واحدة لكل لغة في العملية */
export function getMessages(locale: string): MessageCatalog {
  const cached = memo.get(locale);
  if (cached) return cached;

  const catalog = CATALOGS[locale];
  const merged =
    locale === DEFAULT_LOCALE || !catalog
      ? BASE_CATALOG
      : mergeCatalogs(BASE_CATALOG, catalog);

  memo.set(locale, merged);
  return merged;
}

/** هل للغة ملف رسائل في المستودع؟ (غيابه ليس عطلاً — تعمل بالعربية) */
export function hasMessageCatalog(locale: string): boolean {
  return locale in CATALOGS;
}

/** قراءة مفتاح منقّط من كتالوج — تُستعمل في مسار السقوط الأخير */
export function readMessage(catalog: MessageCatalog, path: string): string | null {
  let node: MessageNode | undefined = catalog;
  for (const part of path.split(".")) {
    if (!isNode(node)) return null;
    node = node[part];
  }
  return typeof node === "string" ? node : null;
}
