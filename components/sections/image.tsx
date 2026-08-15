import type { SectionContentMap } from "@/lib/content-types";

/**
 * كتلة «صورة» — صورةٌ من دلو `media` ومعها نصٌّ بديل **قابل للترجمة**.
 *
 * `alt` نصٌّ للزائر لا سمةٌ تقنية (العقد §١٠): يقرؤه من لا يرى الصورة، ويفهرسه
 * جوجل، ويظهر في طابور الترجمة كأي نصٍّ آخر. ولهذا هو `required` — كتلةٌ بلا
 * نصٍّ بديل لا تُصيَّر أصلاً بدل أن تُصيَّر صورةً صمّاء على صفحةٍ عامة.
 *
 * ── لماذا `<img>` لا `next/image` ────────────────────────────────────────────
 * لا `images.remotePatterns` في `next.config.ts`، ومصدر الصورة نطاق Supabase
 * Storage — فـ`next/image` كان سيرفض الرابط وقت التصيير ويُسقط الصفحة كلها.
 * والمستودع كله بلا `next/image` (مقيس: صفر استيراد)، فهذا اتّساقٌ لا استثناء.
 */

/**
 * 🔒 مصدرٌ داخلي أو لا مصدر — لا نطاق خارجي إطلاقاً (العقد §١٠).
 *
 * وثلاثة أسباب لا سبب واحد:
 *  • **الخصوصية:** صورةٌ من نطاق غريب على صفحةٍ عامة تُرسل عنوان كل زائر ومُحيله
 *    إلى ذلك النطاق — قياسٌ من الباب الخلفي بلا مرور على حارس D-44.
 *  • **الـ whitelabel:** رابطٌ مطلق يعيش في صفٍّ يُصدَّر مع القالب، فتُطلق
 *    العلامة الثانية بصور الأولى (D-01).
 *  • **الأمان:** `javascript:` و`data:` و`//host` كلها تبدأ بما يشبه المسار.
 *
 * والرفض يُسقط الكتلة كلها لأن `src` حقلٌ إلزامي — «الحقل الناقص ⇒ تصيير `null`».
 */
export function safeMediaSrc(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const raw = value.trim();
  if (raw === "") return null;

  // مسار داخلي: يبدأ بشرطة واحدة فقط، وبلا مخطط ولا محرف تحكّم
  if (raw.startsWith("/")) {
    if (raw.startsWith("//") || raw.startsWith("/\\")) return null;
    if (raw.includes(":")) return null;
    // محرف تحكّم داخل مسار = قيمة مصنوعة لحقن سمة لا مسارٌ حقيقي
    if (/[\u0000-\u001f\u007f]/.test(raw)) return null;
    return raw;
  }

  /**
   * أو رابطٌ مطلق **من مشروع Supabase نفسه** — وهو ما تُخرجه
   * `storage.from("media").getPublicUrl(path)`. المقارنة على `origin` لا
   * بـ`startsWith` على النص: `https://evil.com/?x=https://<ref>.supabase.co`
   * يمرّ من مقارنة النص ولا يمرّ من مقارنة الأصل.
   */
  const base = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!base) return null;
  try {
    const url = new URL(raw);
    const origin = new URL(base).origin;
    return url.origin === origin ? url.toString() : null;
  } catch {
    return null;
  }
}

export function ImageSection({ content }: { content: SectionContentMap["image"] }) {
  const src = safeMediaSrc(content.src);
  const alt = typeof content.alt === "string" ? content.alt.trim() : "";
  // الحارس هنا شبكةٌ ثانية: بوابة `blockRenders` في `render.tsx` تكون قد أسقطت
  // الكتلة سلفاً. وتكراره مقصود — العارضة تُصيَّر من المعاينة أيضاً، والقاعدة
  // «لا تنهار صفحة عامة بسبب كتلةٍ نصفَ مضبوطة» لا تُترك لمنادٍ واحد.
  if (src === null || alt === "") return null;

  const caption = typeof content.caption === "string" ? content.caption.trim() : "";

  return (
    <section className="py-10 md:py-14">
      <figure className="mx-auto w-full max-w-4xl px-4 sm:px-6">
        {/* eslint-disable-next-line @next/next/no-img-element -- لا remotePatterns للتخزين، والشرح في رأس الملف */}
        <img
          src={src}
          alt={alt}
          loading="lazy"
          decoding="async"
          className="h-auto w-full rounded-2xl ring-1 ring-border"
        />
        {caption !== "" ? (
          <figcaption className="mt-3 text-center text-sm leading-7 text-muted-foreground">
            {caption}
          </figcaption>
        ) : null}
      </figure>
    </section>
  );
}
