"use client";

import { useState } from "react";

/**
 * مصغَّرُ مستندِ سائق — **الوحدةُ الوحيدة التي تعرض ملفاً موقَّعاً**، تقرؤها
 * اللوحة والبورتال معاً (القاعدة ١٢: لا يُستنسخ منطقٌ قائم).
 *
 * ══════════════════════════════════════════════════════════════════════════
 *  🔴 العطل الذي وُلدت منه — مقيسٌ لا مستنتَج (2026-08-18)
 * ══════════════════════════════════════════════════════════════════════════
 *
 * كان `<img loading="lazy">` يحمل رابطاً موقَّعاً عمرُه **٦٠ ثانية**، والبطاقةُ
 * تقع أسفل صفحةِ متعهدٍ تعرض أسطولاً وأربعاً وعشرين بطاقةَ أسعار. والقياسُ في
 * المتصفح: صورةٌ على بعد **١٣٣١١ بكسل** تحت النافذة **لم تُطلب إطلاقاً** بعد
 * ٩٫٤ ثانية (‏`performance.getEntriesByName(...).length === 0`). فحين يبلغها
 * التمرير يكون التوقيع قد مات، فيردّ التخزين:
 *
 *     HTTP 400 {"error":"InvalidJWT","message":"\"exp\" claim timestamp check failed"}
 *
 * و`<img>` الفاشل قِيس في المتصفح: `naturalWidth = 0` و`innerText = ""` —
 * **مربّعٌ فارغٌ بلا كلمةٍ واحدة**. وهذا بعينه ما رآه المالك.
 *
 * ── فثلاثةُ أقفال، لا واحد ───────────────────────────────────────────────
 *
 * | القفل | ما يمنعه |
 * |---|---|
 * | **لا `loading="lazy"`** | المتصفح يطلب الصورة مع بقية الصفحة، **داخل** الدقيقة — وهو الافتراض الذي بُني عليه عمرُ الدقيقة في `lib/driver-docs-types.ts` أصلاً |
 * | **`onError` يكتب السبب** | ولو انتهت الصلاحية رغم ذلك (تبويبٌ تُرك مفتوحاً، شبكةٌ بطيئة) فالمكان يقول **ماذا يفعل المالك**، لا يبقى فارغاً |
 * | **PDF لا يُحقن في `<img>`** | الدلو يقبل `application/pdf`، و`<img src="….pdf">` يفشل **دائماً** — أي مربّعٌ فارغٌ أبديّ لرخصةٍ رُفعت PDF |
 *
 * ⚠ ولا يُعاد `loading="lazy"` إلى هنا ما دام عمرُ الرابط دقيقة. من أراد
 * الكسلَ فليُطل العمر أولاً في العقد (`DRIVER_DOC_URL_TTL`) — والاثنان معاً
 * هما العطل.
 */

/** الامتدادُ يُقرأ من مسار الكائن داخل الرابط الموقَّع، قبل `?token=` */
function isPdfUrl(url: string): boolean {
  const path = url.split("?")[0] ?? "";
  return path.toLowerCase().endsWith(".pdf");
}

export function DriverDocView({ url, label }: { url: string; label: string }) {
  const [failed, setFailed] = useState(false);

  if (isPdfUrl(url)) {
    return (
      <a
        href={url}
        target="_blank"
        rel="noreferrer"
        className="flex size-full flex-col items-center justify-center gap-1 px-2 text-center text-[11px] leading-4 text-primary underline underline-offset-2"
      >
        <span>{label} — ملف PDF</span>
        <span className="text-muted-foreground">افتحه في تبويب جديد</span>
      </a>
    );
  }

  if (failed) {
    return (
      <span className="px-2 text-center text-[11px] leading-4 text-muted-foreground">
        انتهت صلاحية رابط العرض (عمرُه دقيقة) — حدِّث الصفحة ليُولَّد رابطٌ جديد.
      </span>
    );
  }

  return (
    <a href={url} target="_blank" rel="noreferrer" className="block size-full">
      {/* رابطٌ موقَّع قصير العمر على نطاق التخزين — لا `next/image` كي لا يُضاف
          نطاق التخزين إلى `remotePatterns` فيُفتح لكل صورة في المشروع. */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={url}
        alt={label}
        decoding="async"
        className="size-full object-contain"
        onError={() => setFailed(true)}
      />
    </a>
  );
}
