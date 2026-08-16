import { Card, CardContent, CardToneIcon } from "@/components/ui/card";
import type { SectionContentMap } from "@/lib/content-types";
import type { BlockStyle } from "@/lib/page-builder-types";

/**
 * تنبيه بارز — للبند الذي **يُغضب حين يُكتشف متأخراً**: رسوم الإلغاء، ونافذة
 * الاسترداد، وما لا يشمله السعر. هذه بنودٌ تُقرأ متأخرةً حين تُدفن في نثر،
 * ومكلفةٌ حين تُقرأ متأخرة — فإبرازُها ليس تجميلاً بل تقليلُ نزاع.
 *
 * ── 🔒 القاعدة الذهبية ١٢ منطبقةً حرفاً: يُفوَّض ولا يُستنسخ ────────────────
 *
 * نظامُ النبرة **موجودٌ ومشحون**: `components/ui/card.tsx` يعرف
 * `--card-tone` وقشرتَه (حدٌّ جانبي منطقي + ٦٪ من اللون خلفيةً + حلقة)،
 * ويعرف `CardToneIcon` التي تحمل المعنى **لمن لا يميّز الألوان**. وقيمُه
 * `--tone-info`/`--tone-warning` معرَّفةٌ في `app/globals.css` في الكتل الثلاث
 * (فاتح · داكن · قسمٌ رمليٌّ داخل داكن).
 *
 * فهذا الملف **لا يكتب لوناً واحداً**: يختار رمزاً ويمرّره. ونتيجتُه أن م‑٩
 * (مبدّل الفاتح/الداكن) يبقى «أضف لوحةً ثانية» ولا يصير «فُكّ عتمةً محفورة».
 *
 * ── والنبرة من `style` لا من النصّ ──────────────────────────────────────────
 *
 * `content.style.tone` رمزٌ مغلق يختاره المالك من قائمة (العقد §٥)، ولا يصل
 * فهرس الترجمة أصلاً. ولو كان حقلاً نصّياً لدخل الطابور، ولترجمه مزوّدٌ آلي
 * إلى «تحذير» — فلا يقابل شيئاً، ويعود التنبيه بلا نبرة على `/en` وحدها.
 */
export function CalloutSection({
  content,
  style,
}: {
  content: SectionContentMap["callout"];
  /** `style` مطهَّرٌ من `readBlockStyle` — لا يقرأ هذا المكوّن `content.style` */
  style?: BlockStyle | null;
}) {
  const paragraphs = (content.body ?? "")
    .split(/\r?\n\s*\r?\n/)
    .map((paragraph) => paragraph.trim())
    .filter(Boolean);
  if (paragraphs.length === 0) return null;

  /** الغياب يعني «معلومة» لا «بلا نبرة» — الذهبية ١٥ */
  const tone = style?.tone ?? "info";
  const title = (content.title ?? "").trim();

  return (
    <section className="py-5 md:py-6">
      <div className="mx-auto w-full max-w-wrap px-gut">
        <div className="prose-measure">
          <Card variant={tone} className="text-body">
            <CardContent className="flex items-start gap-3">
              {/* الأيقونة تحمل المعنى بلا لون، ومعها نصٌّ لقارئ الشاشة */}
              <CardToneIcon variant={tone} className="mt-1 shrink-0" />
              <div className="prose-ar min-w-0 flex-1">
                {title ? <p className="font-bold text-foreground">{title}</p> : null}
                {paragraphs.map((paragraph, index) => (
                  <p key={index}>{paragraph}</p>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </section>
  );
}
