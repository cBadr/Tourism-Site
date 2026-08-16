"use client";

import * as React from "react";
import { Share2 } from "lucide-react";

/**
 * «أرسل تفاصيل رحلتك» — ن‑٧، على **صفحة تأكيد الحجز** وحدها.
 *
 * ══════════════════════════════════════════════════════════════════════════
 *  ما يُشارَك، ولماذا هذا بالضبط ولا حرف زيادة
 * ══════════════════════════════════════════════════════════════════════════
 *
 * قرار بدر: المشاركة هنا لغرضٍ واحد — **إرسال تفاصيل الرحلة لمن يهمّه**: زوجةٌ
 * تنتظر، أو من يستقبل الضيف. والنص يُركَّب **على الخادم** (`app/(site)/booking/
 * [token]/page.tsx`) فلا يبنيه هذا الملف ولا يضيف إليه حقلاً:
 *
 *   ✅ رقم الحجز · المسار · الموعد · رابط المتابعة
 *   ⛔ **ولا مبلغ ولا عمولة ولا هامش** (‏D-19: العميل نفسه لا يرى تكلفتنا،
 *      فمن يصله النص أولى بألا يرى ثمناً أصلاً)
 *   ⛔ **ولا هاتف** — ولا يحتاج حجباً هنا: `0049` قنّعت `customer_phone`
 *      و`customer_whatsapp` داخل `get_booking_by_token` نفسها، فالصفحة لا تملك
 *      الرقم لتُسرّبه. **ولا يُعاد فتح ذلك الباب لتزيين نصّ مشاركة.**
 *
 * ⚠ **ورابط المتابعة مفتاحٌ لا عنوان.** من يفتحه يرى الصفحة كاملةً — ولهذا
 *   يبقى النشر العام ممنوعاً في هذه الصفحة (‏`lib/export-types.ts` §٥): لا
 *   فيسبوك ولا إكس ولا بطاقة Open Graph. وما هنا **نيّةٌ خاصة يختار المُرسِل
 *   وجهتها بنفسه** — كزرّ واتساب أعلى الصفحة حرفياً، لا سطحٌ عام جديد.
 *
 * ── والتحسين التدريجي هو الشكل ────────────────────────────────────────────
 *
 * العنصر **وسمُ `<a>` حقيقي** إلى نيّة واتساب بلا مستقبِل، فيعمل بلا جافاسكربت.
 * وحيث يوجد `navigator.share` (الجوال غالباً، وهو موضع الاستعمال الحقيقي)
 * يعترض هذا الملف النقرة ويفتح منتقي المشاركة الأصلي — فيصل النصّ إلى تليجرام
 * أو الرسائل أو أي تطبيق يختاره، بدل حبسه في واتساب.
 *
 * ⚠ والاعتراض **لا يقع إلا بعد التركيب**: `canShare` تبدأ `false` وتُضبط في
 *   `useEffect`، فما يُصيَّر على الخادم وما يُصيَّر أول مرة في المتصفح واحد.
 */
export function TripShare({
  /** النصّ كاملاً كما ركّبه الخادم — لا يُبنى هنا ولا يُضاف إليه */
  text,
  /** رابط المتابعة — يُمرَّر مستقلاً لأن `navigator.share` يفصل النصّ عن الرابط */
  url,
  /** عنوان بطاقة المشاركة الأصلية */
  title,
  /** وجهة الاحتياطي بلا سكربت — تُبنى على الخادم بـ`waShareHref` */
  fallbackHref,
  label,
  className,
}: {
  text: string;
  url: string;
  title: string;
  fallbackHref: string;
  label: string;
  className?: string;
}) {
  const [canShare, setCanShare] = React.useState(false);

  React.useEffect(() => {
    setCanShare(typeof navigator !== "undefined" && typeof navigator.share === "function");
  }, []);

  async function handleClick(event: React.MouseEvent<HTMLAnchorElement>) {
    if (!canShare) return; // بلا اعتراض: الوسم يذهب إلى واتساب كما هو
    event.preventDefault();
    try {
      await navigator.share({ title, text, url });
    } catch (error) {
      /**
       * ⚠ **والفرق بين الرفضين يقرّر ما يحدث بعده:**
       *
       * `AbortError` هو **إلغاء المستخدم** — أغلق ورقة المشاركة بنفسه، ففتحُ
       * واتساب بعده يناقض ما فعله للتوّ.
       *
       * وأي خطأ آخر (‏سياق غير آمن، سياسة أذونات، متصفحٌ يعلن `share` ولا
       * ينفّذها) يعني أن **نقرتَه ذهبت بلا شيء** — فيُفتح الاحتياطي الذي كان
       * سيُفتح لو لم نعترض أصلاً. بلا هذا الفرع يبدو الزرّ معطّلاً بلا سبب.
       */
      const aborted = error instanceof Error && error.name === "AbortError";
      if (!aborted) window.open(fallbackHref, "_blank", "noopener,noreferrer");
    }
  }

  return (
    <a
      href={fallbackHref}
      target="_blank"
      rel="noopener noreferrer"
      onClick={handleClick}
      className={className}
    >
      <Share2 className="size-4 shrink-0" aria-hidden="true" />
      {label}
    </a>
  );
}
