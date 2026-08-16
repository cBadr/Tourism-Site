import type { SectionContentMap } from "@/lib/content-types";

/**
 * شريط الأرقام — نقلٌ لقسم `.statband` في التصميم.
 *
 * 🔴 **القرار الذي يقوم عليه هذا الملف (قرار بدر ٣): الكتلة تُشحن والأرقام لا.**
 * الأربعة في التصميم — «١٢٬٤٠٠ رحلة» و«٩ محافظات» و«٤٫٨/٥ متوسط تقييم» —
 * ثلاثةٌ منها تناقض القاعدة نصّاً: `bookings = 0`، و`areaServed` فارغ ويناقض
 * ثماني مدن في JSON-LD على الصفحة نفسها، ولا جدول تقييمات في القاعدة إطلاقاً.
 * فلا رقم منها يُنقل حرفاً، والحقول تنتظر ما يملكه المالك فعلاً.
 *
 * ولذلك الكتلة **لا تُصيَّر بلا عنصر واحد** (`requiredFields: ["items"]` في
 * السجل): شريطٌ فارغ على صفحةٍ عامة أسوأ من غيابه، والمالك يملؤه أو يتركه.
 *
 * ⚠ **و`value` نصٌّ لا رقم، وهذا مقصود:** العربية تكتب ١٢٬٤٠٠ والإنجليزية
 *   12,400 — والفاصلة نفسها تختلف. فلو عاش الرقم في `style` لتجمّد على صيغة
 *   لغةٍ واحدة في اللغتين، والثمن سطرٌ في طابور الترجمة لا أكثر.
 *
 * ⚠ **ولا عدّاد متحرك هنا:** عدّاد التصميم جزيرةُ عميل تعدّ من صفر إلى قيمة،
 *   وهي تفترض أن القيمة **رقم**. وما دامت نصّاً محرَّراً («٢٤/٧» · «أربع فئات»)
 *   فالعدّ عليه إما مستحيل أو كاذب. الحركة الوحيدة الباقية ظهورٌ بالتدرّج،
 *   وهي CSS خالصة بلا جافاسكربت.
 */
export function StatBandSection({
  content,
}: {
  content: SectionContentMap["stat-band"];
}) {
  // العنصر بلا قيمة ولا تسمية بطاقةٌ فارغة — تُسقَط ولا تُعرض بشرطة
  const items = (content.items ?? []).filter((item) => item?.value || item?.label);
  if (items.length === 0) return null;

  return (
    <section className="border-y border-border/60 bg-primary/[0.04] py-12 md:py-16">
      <div className="mx-auto w-full max-w-6xl px-4 sm:px-6">
        {content.title ? (
          <h2 className="mb-9 text-center text-2xl font-bold leading-snug tracking-tight sm:text-3xl">
            {content.title}
          </h2>
        ) : null}

        <ul
          role="list"
          className="grid grid-cols-2 gap-x-6 gap-y-9 text-center sm:gap-x-10 lg:grid-cols-4"
        >
          {items.map((item, index) => (
            <li
              // `_k` عنوان الترجمة الثابت — ومفتاح React معه، فلا يُعاد بناء
              // البطاقة عند إعادة الترتيب
              key={(item as { _k?: string })._k ?? `${item.value}-${index}`}
              className="flex flex-col items-center gap-1.5"
            >
              {item.value ? (
                <p className="flex items-baseline justify-center gap-0.5 text-3xl font-extrabold tracking-tight text-primary sm:text-4xl md:text-5xl">
                  <span>{item.value}</span>
                  {item.suffix ? (
                    <span className="text-xl font-bold text-primary/70 sm:text-2xl">
                      {item.suffix}
                    </span>
                  ) : null}
                </p>
              ) : null}
              {item.label ? (
                <p className="text-pretty text-sm leading-6 text-muted-foreground sm:text-base">
                  {item.label}
                </p>
              ) : null}
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
