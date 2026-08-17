"use client";

import { useEffect } from "react";

/**
 * ╔══════════════════════════════════════════════════════════════════════════╗
 * ║  أكورديون «واحدٌ مفتوح لا أكثر» — آليةٌ واحدة لكل مجموعة `<details>`      ║
 * ╚══════════════════════════════════════════════════════════════════════════╝
 *
 * ── لماذا وُلد هذا الملف (القاعدة الذهبية ١٢) ───────────────────────────────
 *
 * كُتب أولاً داخل `footer-accordion.tsx` لأعمدة التذييل. ثم طلب بدر السلوك
 * نفسه للأسئلة الشائعة — و«اكتب أكورديوناً ثانياً» هي الطريقة التي وُلد بها
 * نصفُ عيوب هذا المستودع: نسختان تبدآن متطابقتين، ثم يُصلَح إفلاتُ التركيز في
 * إحداهما ويبقى في الأخرى. فنُقل الجسمُ إلى هنا، **ولا يعرّفه أيٌّ منهما**.
 *
 * ── والفرقان بين المستهلكَين **بيانات لا كود** ──────────────────────────────
 *
 * | | التذييل | الأسئلة الشائعة |
 * |---|---|---|
 * | ما يبدأ مفتوحاً | «حجزك وحسابك» (`defaultAttr`) | **لا شيء** — والكل مطويّ |
 * | فوق `md` | الأعمدة الأربعة مفتوحة والطيّ معطَّل (`openAllAbove`) | الأحادية سارية في كل عرض |
 *
 * وكلاهما مقبضٌ اختياري هنا، فالاختلاف يُقرأ في موضع الاستعمال سطراً واحداً.
 *
 * ── ثلاثة أشياء يحملها هذا المكوّن ولا يجوز أن تُفقد عند إعادة الاستعمال ────
 *
 * **(١) 🔴 لا رايةَ «أنا أزامن الآن».** حدث `toggle` على `<details>` **يُطلَق في
 *      مهمةٍ مؤجَّلة** لا فور تغيير السمة (نصّ المواصفة: «queue a details toggle
 *      event task»). فرايةٌ تُرفع وتُخفض حول سطر `panel.open = …` تكون قد سقطت
 *      قبل أن يصل الحدث — أي حارسٌ لا يحرس. فالمعالج **متقارب بذاته** بدل ذلك:
 *      كل حالةٍ يبلغها يعيد إنتاجها بلا تغيير، فتقف السلسلة عند أول دورة.
 *      (فتحُ ب ⇒ يُغلق أ ⇒ حدثُ أ لا يجد ما يفعله ⇒ سكون.)
 *
 * **(٢) 🔴 التركيز لا يُترك داخل لوحةٍ تُخفى.** الحالة: زائرٌ بلوحة مفاتيح داخل
 *      لوحةٍ مفتوحة، ثم يفتح أخرى بنقرةٍ باللمس أو الفأرة (وسفاري لا ينقل
 *      التركيز إلى `<summary>` عند النقر). فتُغلق الأولى **والتركيز في جوفها** —
 *      يصير على عنصرٍ `content-visibility: hidden` فيقذفه المتصفح إلى `<body>`،
 *      ويستأنف الزائر تنقّله من أول الصفحة. فيُنقل إلى عنوان اللوحة المغلَقة:
 *      أقربُ موضعٍ ذي معنى، وضغطةٌ واحدة تعيد فتح ما كان مفتوحاً.
 *
 * **(٣) والاستماع على `toggle` لا على `click`** — وهو ما يجعل «يعمل بلوحة
 *      المفاتيح» صحيحاً **بالبناء لا بفرعٍ ثانٍ**: المتصفح يُطلق `toggle` مهما
 *      كان سبب التغيّر (نقرة · `Enter` · مسافة · بحثُ الصفحة الذي يفتح
 *      `<details>` تلقائياً · تغييرٌ برمجي). فلا مسارَ فأرةٍ ينحرف عن مسار
 *      لوحة المفاتيح، لأنه لا مسارَ ثانٍ أصلاً.
 *
 * ── والنطاق حاويةٌ لا المستند ──────────────────────────────────────────────
 *
 * اللوحات تُجمَع من داخل `scopeId` وحده. فصفحةٌ فيها قسما أسئلةٍ شائعة تعمل
 * مجموعتين مستقلتين — لا يُغلق سؤالٌ في قسمٍ لأن زائراً فتح سؤالاً في الآخر.
 *
 * ولا يقرأ هذا المكوّن جلسةً ولا بياناتٍ: يضبط سمةً على DOM ويصيّر `null` —
 * فمستهلكوه يبقون مكوّنات خادم كما هم.
 */
export function SingleOpenAccordion({
  scopeId,
  defaultAttr,
  openAllAbove,
}: {
  /** معرّف الحاوية — حدُّ المجموعة الواحدة */
  scopeId: string;
  /** سمة اللوحة التي تبدأ مفتوحة؛ غيابها = الكل مطويّ ابتداءً */
  defaultAttr?: string;
  /** استعلام وسائط تُفتح فوقه كل اللوحات ويُعطَّل الطيّ (التذييل وحده) */
  openAllAbove?: string;
}) {
  useEffect(() => {
    const scope = document.getElementById(scopeId);
    if (!scope) return;

    const panels = Array.from(
      scope.querySelectorAll<HTMLDetailsElement>("details[data-acc]")
    );
    if (panels.length === 0) return;

    const wide =
      openAllAbove && window.matchMedia ? window.matchMedia(openAllAbove) : null;

    /**
     * اللوحة المفتوحة. تبدأ من المعلَّمة بـ`defaultAttr` إن وُجدت، ثم تتبع آخر
     * ما فتحه الزائر، و`null` تعني «الكل مطويّ» وهي حالةٌ مشروعة.
     *
     * ومحلُّه متغيّرٌ في نطاق الأثر لا `useState`: تبديلُه لا يعيد تصيير شيئاً
     * (نكتب على DOM مباشرةً)، وحالةُ React كانت تشتري دورة تصييرٍ كاملة مقابل
     * سمةٍ واحدة — نفس مبرر `flow-road.tsx` عند `is-live`.
     */
    let current: HTMLDetailsElement | null =
      (defaultAttr && panels.find((panel) => panel.hasAttribute(defaultAttr))) || null;

    const close = (panel: HTMLDetailsElement) => {
      if (!panel.open) return;
      const active = document.activeElement;
      if (active instanceof HTMLElement && panel.contains(active)) {
        panel.querySelector("summary")?.focus();
      }
      panel.open = false;
    };

    /** اللوحة التي يقصدها `#hash` — هي نفسها أو ما يحويها */
    const panelFromHash = (): HTMLDetailsElement | null => {
      const raw = location.hash.slice(1);
      if (!raw) return null;
      let id = raw;
      try {
        id = decodeURIComponent(raw);
      } catch {
        /* هاشٌ مشوّه الترميز يُقرأ خاماً بدل أن يرمي */
      }
      const target = document.getElementById(id);
      if (!target) return null;
      return panels.find((panel) => panel === target || panel.contains(target)) ?? null;
    };

    /** الحالة الصحيحة للعرض الحالي — عند الترطيب وعند تبدّل العرض */
    const apply = () => {
      if (wide?.matches) {
        panels.forEach((panel) => {
          panel.open = true;
        });
        return;
      }
      panels.forEach((panel) => {
        if (panel === current) panel.open = true;
        else close(panel);
      });
    };

    const onToggle = (event: Event) => {
      const panel = event.currentTarget as HTMLDetailsElement;

      /*
        فوق الحدّ (التذييل): العنوان ساكن، و`pointer-events-none` تمنع الفأرة
        وحدها — أما `Enter` على `<summary>` المركَّز عليه فيطويه فعلاً، ولا سهمَ
        هناك يعيد فتحه. فيُعاد. والفتحُ على مفتوحٍ لا يُطلق حدثاً فتقف السلسلة.
      */
      if (wide?.matches) {
        if (!panel.open) panel.open = true;
        return;
      }

      if (panel.open) {
        current = panel;
        panels.forEach((other) => {
          if (other !== panel) close(other);
        });
        return;
      }

      // طوى الزائر المفتوح ⇒ لا يبقى شيء مفتوحاً، ولا يُفتح بديلٌ عنه
      if (current === panel) current = null;
    };

    /**
     * 🔗 الوصول على مرساة: تُفتح اللوحة المقصودة **ثم** يُصحَّح التمرير.
     *
     * 🔴 **والترتيب هو كل المسألة.** المتصفح يمرّر إلى الهدف بنفسه قبل أن يعمل
     * هذا الكود — أي على **التخطيط المطويّ**. ثم يُفتح السؤال فينمو ارتفاعه
     * ويزيح كل ما تحته، فيصير الموضع الذي استقرّ عنده المتصفح غير موضع السؤال.
     * فالتصحيح يقع بعد التوسّع لا قبله.
     *
     * وإطارٌ واحد يكفي: `open = true` تُغيّر الشجرة فوراً، و`scrollIntoView`
     * تفرض حساب التخطيط عند ندائها — فبحلول الإطار التالي يكون الارتفاع
     * الجديد سارياً.
     *
     * ⚠ **وبلا `behavior: "smooth"` بقصد**: م‑١٠ أزالت `scroll-behavior: smooth`
     * من `<html>` ولم تستبدلها (‏`app/globals.css` §المذكور هناك)، فالقيمة
     * المحسوبة `auto`. وطلبُ الانزلاق صراحةً هنا كان **نقضاً لذلك القرار من
     * بابٍ خلفي**، ويتخطى حارس `prefers-reduced-motion` الباقي أسفل ذلك الملف.
     *
     * ولا يُنقل التركيز: المتصفح يضبط «نقطة بدء تنقّل التركيز» على هدف المرساة
     * وحده — فنقلٌ صريح يسلب التركيز عند كل `hashchange` بلا أن يطلبه أحد.
     */
    const revealFromHash = (scroll: boolean) => {
      const panel = panelFromHash();
      if (!panel) return;
      current = panel;
      apply();
      if (!scroll) return;
      requestAnimationFrame(() => panel.scrollIntoView({ block: "start" }));
    };

    const onHashChange = () => revealFromHash(true);

    const fromHash = panelFromHash();
    if (fromHash) current = fromHash;
    apply();
    if (fromHash) {
      requestAnimationFrame(() => fromHash.scrollIntoView({ block: "start" }));
    }

    wide?.addEventListener("change", apply);
    window.addEventListener("hashchange", onHashChange);
    panels.forEach((panel) => panel.addEventListener("toggle", onToggle));

    return () => {
      wide?.removeEventListener("change", apply);
      window.removeEventListener("hashchange", onHashChange);
      panels.forEach((panel) => panel.removeEventListener("toggle", onToggle));
    };
  }, [scopeId, defaultAttr, openAllAbove]);

  return null;
}
