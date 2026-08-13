import "server-only";

import { createDeeplProvider } from "./deepl";
import { createGoogleProvider } from "./google";
import { createMyMemoryProvider } from "./mymemory";
import { createNullProvider, MT_MAX_CHARS, MT_MAX_TEXTS, type MtProvider } from "./provider";

/**
 * سجل مزوّدي الترجمة الآلية — نقطة الاختيار الوحيدة.
 *
 * القاعدة: **المزوّد يُبدَّل بمتغير بيئة لا بتعديل كود.** الشاشات والمسار
 * الإداري لا يعرفان أي مزوّد يعمل؛ ينادون `resolveMtProvider()` ويعرضون اسمه
 * للمالك. إضافة مزوّد رابع لاحقاً = ملف واحد هنا وسطر في هذا الاختيار.
 *
 * الاختيار:
 *  · `MT_PROVIDER=mymemory` (الافتراضي عملياً) — مجاني بلا مفتاح.
 *  · `MT_PROVIDER=deepl`  + `DEEPL_API_KEY`            — جودة أعلى، مدفوع.
 *  · `MT_PROVIDER=google` + `GOOGLE_TRANSLATE_API_KEY` — تغطية لغات أوسع.
 *  · `MT_PROVIDER=off` — تُطفأ الترجمة الآلية تماماً، ويبقى خط المراجعة اليدوي
 *    شغالاً كما هو (الطابور والتحرير والنشر لا تعتمد على أي مزوّد).
 *
 * وبلا `MT_PROVIDER` نستنتج: مفتاح DeepL موجود ⇒ DeepL، وإلا مفتاح Google ⇒
 * Google، وإلا MyMemory. أي «مزوّد مطلوب بلا مفتاحه» يسقط إلى المزوّد المجاني
 * بدل أن يتعطل الزر بصمت — مع جملة تشرح ذلك في `describeMtProvider().note`.
 */

export {
  MT_MAX_CHARS,
  MT_MAX_TEXTS,
  MT_MAX_TEXT_CHARS,
  MT_SEGMENT_CHARS,
  type MtProvider,
} from "./provider";

/** وصف المزوّد السارِي — للعرض في لوحة اللغات (لا يُظهر أي مفتاح) */
export type MtProviderInfo = {
  id: string;
  label: string;
  /** يعمل بلا مفتاح مدفوع؟ */
  keyless: boolean;
  /** جاهز للاستعمال الآن؟ */
  ready: boolean;
  /** جملة عربية تشرح الحالة للمالك */
  note: string;
  /** السقف الصلب لكل ضغطة زر */
  maxTexts: number;
  maxChars: number;
};

const deeplKey = () => process.env.DEEPL_API_KEY?.trim() || null;
const googleKey = () => process.env.GOOGLE_TRANSLATE_API_KEY?.trim() || null;

/** الاسم المطلوب من البيئة بعد التطبيع، أو null حين لا اختيار صريح */
function requested(): "mymemory" | "deepl" | "google" | "off" | null {
  const value = process.env.MT_PROVIDER?.trim().toLowerCase();
  if (!value) return null;
  if (value === "mymemory" || value === "deepl" || value === "google" || value === "off") {
    return value;
  }
  return null;
}

/** أي مزوّد سيعمل فعلاً — القرار نفسه الذي يستعمله `resolveMtProvider` */
function decide(): { id: "mymemory" | "deepl" | "google" | "off"; fellBack: boolean } {
  const want = requested();

  if (want === "off") return { id: "off", fellBack: false };
  if (want === "deepl") {
    return deeplKey() ? { id: "deepl", fellBack: false } : { id: "mymemory", fellBack: true };
  }
  if (want === "google") {
    return googleKey() ? { id: "google", fellBack: false } : { id: "mymemory", fellBack: true };
  }
  if (want === "mymemory") return { id: "mymemory", fellBack: false };

  if (deeplKey()) return { id: "deepl", fellBack: false };
  if (googleKey()) return { id: "google", fellBack: false };
  return { id: "mymemory", fellBack: false };
}

export function resolveMtProvider(): MtProvider {
  const { id } = decide();

  if (id === "off") {
    return createNullProvider("الترجمة الآلية مُطفأة بالإعداد (MT_PROVIDER=off)");
  }
  if (id === "deepl") {
    const key = deeplKey();
    if (key) return createDeeplProvider(key);
  }
  if (id === "google") {
    const key = googleKey();
    if (key) return createGoogleProvider(key);
  }
  return createMyMemoryProvider();
}

export function describeMtProvider(): MtProviderInfo {
  const { id, fellBack } = decide();
  const base = { maxTexts: MT_MAX_TEXTS, maxChars: MT_MAX_CHARS };

  if (id === "off") {
    return {
      ...base,
      id: "none",
      label: "الترجمة الآلية مُطفأة",
      keyless: true,
      ready: false,
      note: "المتغير MT_PROVIDER مضبوط على off — زر «ترجم الباقي آلياً» لن يكتب شيئاً. المراجعة والنشر اليدويان يعملان كالمعتاد.",
    };
  }

  if (id === "deepl") {
    return {
      ...base,
      id: "deepl",
      label: "DeepL",
      keyless: false,
      ready: true,
      note: "مفتاح DeepL مضبوط — أجود المسودات. الحصة تُحاسَب على حسابك عند DeepL لا على حصة مجانية.",
    };
  }

  if (id === "google") {
    return {
      ...base,
      id: "google",
      label: "Google Translate",
      keyless: false,
      ready: true,
      note: "مفتاح Google مضبوط — تغطية لغات أوسع. الحصة تُحاسَب على مشروعك في Google Cloud.",
    };
  }

  const email = process.env.MYMEMORY_EMAIL?.trim();
  const quota = email
    ? "وبريدك مضبوط في MYMEMORY_EMAIL فالحصة اليومية مرفوعة."
    : "بلا مفتاح ولا حساب، فالحصة اليومية صغيرة (بضعة آلاف حرف لكل عنوان IP). اضبط MYMEMORY_EMAIL ببريدك لرفعها مجاناً.";

  return {
    ...base,
    id: "mymemory",
    label: "MyMemory (مجاني)",
    keyless: true,
    ready: true,
    note: fellBack
      ? `طلبتَ مزوّداً بمفتاح لكن المفتاح غير مضبوط في البيئة، فرجعنا إلى MyMemory المجاني. ${quota}`
      : `المزوّد المجاني الافتراضي: ${quota}`,
  };
}
