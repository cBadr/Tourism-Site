"use client";

import { useEffect } from "react";

/**
 * ╔══════════════════════════════════════════════════════════════════════════╗
 * ║  طيّ أعمدة التذييل على الجوال — نقلٌ لسلوك `main.js` في التصميم           ║
 * ╚══════════════════════════════════════════════════════════════════════════╝
 *
 * ── لماذا الطيّ بالجافاسكربت لا بالـCSS ─────────────────────────────────────
 *
 * `<details>` يُفتح ويُغلق بالسمة `open` وحدها، **ولا يملك CSS فتحه**: قاعدة
 * المتصفح تخفي المحتوى عبر `::details-content` (وهو حديثٌ ومختلف بين
 * المتصفحات). فالخياران: أن تُكتب الأعمدة **مغلقةً** ويُفتحها CSS على المكتب
 * (لا يمكن مُحكماً)، أو أن تُكتب **مفتوحةً** ويطويها الجافاسكربت على الجوال.
 *
 * 🔒 **والثاني وحده يفشل فشلاً آمناً.** بلا جافاسكربت — أو قبل الترطيب، أو
 * لزاحفٍ لا ينفّذه — تبقى **كل** الروابط مفتوحةً ومقروءة، أي **سلوك التذييل
 * اليوم بالحرف**. والأول كان يعني: جافاسكربت معطّل ⇒ تذييلٌ لا يظهر منه إلا
 * أربعة عناوين، و**كل روابط الخدمات والمسارات محجوبة عن الزاحف وعن الزائر**
 * في موقعٍ السيو هو منتجه.
 *
 * ── وما لا يُطوى أبداً ──────────────────────────────────────────────────────
 *
 * العمود الحامل لـ`data-ftr-keep` يبقى مفتوحاً على كل عرض — وفيه **«تابع
 * حجزك»** الذي سمّاه بدر شكواه الأولى. وتذييلٌ أنيق يُخفي رابط المتابعة يعيد
 * إنتاج المشكلة التي أُضيف لأجلها.
 *
 * ولا يقرأ هذا المكوّن جلسةً ولا بياناتٍ: يضبط سمةً على DOM ويصيّر `null` —
 * فالتذييل يبقى مكوّن خادم كما هو (نفس مبرر جزيرة الترويسة).
 */
export function FooterAccordionSync() {
  useEffect(() => {
    if (!window.matchMedia) return;
    /** نفس نقطة `md` في Tailwind — فوقها الأعمدة عناوين ساكنة لا أزرار */
    const wide = window.matchMedia("(min-width: 768px)");

    const panels = Array.from(
      document.querySelectorAll<HTMLDetailsElement>("details[data-ftr-acc]")
    );

    /** المفتوح دائماً: أي عمودٍ على المكتب، وحامل `data-ftr-keep` في كل عرض */
    const pinned = (panel: HTMLDetailsElement) =>
      wide.matches || panel.hasAttribute("data-ftr-keep");

    const sync = () => {
      panels.forEach((panel) => {
        panel.open = pinned(panel);
      });
    };

    /**
     * 🔒 حارسُ الطيّ. على المكتب لا سهمَ يُظهر أن العمود قابلٌ للطيّ ولا سهمَ
     * يعيد فتحه، فطيُّه هناك بابٌ لا مقبض له. و`pointer-events-none` تمنع
     * الفأرة وحدها — أما `Enter` على `<summary>` المركَّز عليه فيطويه فعلاً.
     * فيُعاد الفتح هنا. ولا دورة لا نهائية: `open = true` على مفتوحٍ أصلاً
     * لا يطلق `toggle` ثانيةً.
     */
    const guard = (event: Event) => {
      const panel = event.currentTarget as HTMLDetailsElement;
      if (!panel.open && pinned(panel)) panel.open = true;
    };

    sync();
    wide.addEventListener("change", sync);
    panels.forEach((panel) => panel.addEventListener("toggle", guard));

    return () => {
      wide.removeEventListener("change", sync);
      panels.forEach((panel) => panel.removeEventListener("toggle", guard));
    };
  }, []);

  return null;
}
