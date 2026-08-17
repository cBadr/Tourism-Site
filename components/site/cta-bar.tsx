import { ArrowLeft } from "lucide-react";
import { SlideUpBar } from "@/components/motion";
import type { SiteSettings } from "@/lib/site-config";
import { DEFAULT_LOCALE } from "@/lib/i18n-types";
import { getT } from "@/lib/i18n/content";
import { BOOKING_WIDGET_ANCHOR_ID, bookingHref, waHref } from "./links";
import { WhatsAppIcon } from "./social-icons";

/**
 * ╔══════════════════════════════════════════════════════════════════════════╗
 * ║  شريط الإجراء السفلي — «احجز الآن» + واتساب، على الجوال وحده             ║
 * ╚══════════════════════════════════════════════════════════════════════════╝
 *
 * ── الشكوى المقيسة ─────────────────────────────────────────────────────────
 *
 * بدر: «و كمان في Tours-02 كان في شريط للحجز و التواصل بيظهر في آخر الصفحة،
 * لكن حالياً مش موجود في الموقع!».
 *
 * وهو `#mbar` في `index.html` — والسبب في غيابه ليس أنه لم يُنقل: **مُحرّكه
 * منقولٌ منذ م‑٥ ولم يستورده أحد**. `components/motion/slide-up-bar.tsx`
 * كان وحدةً بلا مستورد: مُصدَّرةً من `components/motion/index.ts` ولا سطر في
 * المستودع كله يناديها. فهذا الملف **يركّبها ولا يكتب حركةً جديدة**.
 *
 * ── ما نُقل عن التصميم بأرقامه ─────────────────────────────────────────────
 *
 * | التصميم (`style.css` §١٨ + `main.js` §٩) | هنا |
 * |---|---|
 * | يظهر عند `pageYOffset > hero.offsetHeight − 140` | **لم يعد** — انظر «الحدّ صار الويدجت» أدناه |
 * | `translateY(115%)` ⇐ `none` | `motion.module.css` §٧ حرفاً |
 * | مخفيّ فوق ‎٩٠٠px | `md:hidden` (‏٧٦٨ — نقطة هذا المستودع) |
 * | زرّ الحجز `flex:2` وواتساب `flex:1` بحدّ ‎٩٦px | نفسها |
 * | `env(safe-area-inset-bottom)` | نفسها |
 * | `body{ padding-block-end: --mbar-h }` | **فاصلٌ في التدفّق** لا حشوٌ على `body` |
 *
 * ── وثلاثة قرارات تخصّ هذا المستودع وحده ───────────────────────────────────
 *
 * 🔴 **(١) الفراغ السفلي فاصلٌ يُصيَّره هذا المكوّن، لا `padding` على `body`.**
 *     التصميم صفحةٌ واحدة فحشوُ `body` فيه صحيح دائماً. وهنا الشريط يُركَّب على
 *     **صفحات التصفّح وحدها**، فحشوٌ عامٌّ كان يترك فراغاً ٦٨ بكسل أسفل `/book`
 *     و`/account` بلا شريطٍ يملؤه. والفاصل يولد ويموت مع الشريط بالضبط —
 *     فلا يُغطّى آخرُ سطرٍ في أي صفحة، ولا يبقى فراغٌ في صفحةٍ بلا شريط.
 *
 * ── 🔴 الحدّ صار **الويدجت** لا البطل (شكوى المالك 2026-08-17) ──────────────
 *
 * > الشريط يظهر و«احسب السعر» ما زال على الشاشة — إجراءان رئيسيان في إطارٍ
 * > واحد. «المفروض يظهر لما العميل ينزل عند الأسطول.»
 *
 * والعطل **في المقياس لا في الميزة**: على الجوال يعيش ويدجت الحجز أسفل البطل
 * ومتداخلاً معه، فحدّ التصميم (`ارتفاع البطل − ١٤٠`) يقع **داخل** الويدجت.
 * وهو حدٌّ صحيح في صفحةٍ واحدةٍ بلا ويدجت — وهي الصفحة التي نُقل عنها.
 *
 * فصار `afterId` يقيس **قاع الويدجت نفسه**: لا شريط قبل أن يغادر الشاشة
 * كاملاً. وهذا هو القرار (٢) أدناه مطبَّقاً على **جزءٍ** من صفحةٍ بدل صفحةٍ
 * كاملة: «لا شريط فوق شاشةٍ فيها زرّ إرسال».
 *
 * ⚠ وأثرٌ ثانٍ مقصود: بعد ضغط «احسب السعر» تنمو بطاقاتُ الأسعار ثم مسارُ إتمام
 *   الحجز **داخل الويدجت نفسه**، فيظلّ الشريط غائباً طوال ذلك — ولا يقع فوق
 *   «تأكيد الحجز» في الرئيسية كما لا يقع فوقه في `/book`.
 *
 * 🔒 وصفحات بلا ويدجت (خدمات · مسارات · الباني) لا يتغيّر سلوكها: غياب المرساة
 *   يُسقط الحدّ إلى البطل حرفاً (`slide-up-bar.tsx`).
 *
 * 🔴 **(٢) لا يُركَّب على صفحات الحجز ولا الحساب** (‏`/book` · `/booking/[token]`
 *     · `/track` · `/quote-request` · `/account/**` · `/payment/return`).
 *     وظيفته أن يُدخل **متصفّحاً** إلى `/book`؛ وفوق `/book` نفسه هو زرٌّ يعِد
 *     بالصفحة التي أنت فيها، **وفوق شاشةٍ فيها زرّ إرسال هو خطرُ تغطيةٍ على
 *     أهمّ زرٍّ في المنتج**. فمعيار التركيب: صفحةٌ تُقرأ لا صفحةٌ تُملأ.
 *
 * 🔴 **(٣) والزرّ العائم يُخفى حيث يظهر الشريط** (`hiddenOnMobile` في
 *     `WhatsAppFab`): كلاهما ثابتٌ أسفل الشاشة، فاجتماعهما يضع القرص الأخضر
 *     **فوق** الشريط. والتصميم لا يعرف زرّاً عائماً أصلاً — واتساب فيه إجراءٌ
 *     داخل الشريط، وهو ما نُقل. ويبقى العائم على المكتب حيث لا شريط.
 *
 * ⚠ **ولا رقم مكتوب هنا**: الوجهة من `waHref(settings.contact.whatsapp)`
 *   و`bookingHref` — والرقم من `site_settings` عبر `lib/phone.ts`، وقاعدة لِنت
 *   تحرس ذلك بعد أن شُحن رقمٌ خاطئ خمس مرات.
 *
 * ⚠ **وتقليل الحركة يلغي الانزلاق لا الظهور**: قاعدة `transition` كلها داخل
 *   `prefers-reduced-motion: no-preference`، فالشريط يظهر ويختفي بلا تدرّج.
 *   وبلا جافاسكربت يبقى **ظاهراً دائماً** — زرُّ حجزٍ زائدٌ أهون من زرٍّ مخفيّ
 *   للأبد (الحجّة مكتوبة في `slide-up-bar.tsx`).
 */
export async function SiteCtaBar({
  settings,
  locale = DEFAULT_LOCALE,
}: {
  settings: SiteSettings;
  locale?: string;
}) {
  const [t, tHeader] = await Promise.all([
    getT("site.ctaBar", locale),
    getT("site.header", locale),
  ]);

  const whatsapp = settings.contact.whatsapp;

  return (
    <>
      {/*
        الفاصل — عنصرٌ في التدفّق بارتفاع الشريط + قاع الشاشة الآمن. وهو ما
        يمنع الشريطَ الثابت من تغطية آخر سطرٍ في الصفحة (وفي التذييل: صفّ
        الحقوق وخريطة الموقع).
      */}
      <div
        aria-hidden="true"
        className="h-[calc(4.25rem+env(safe-area-inset-bottom,0px))] md:hidden"
      />

      <SlideUpBar afterId={BOOKING_WIDGET_ANCHOR_ID} className="fixed inset-x-0 bottom-0 z-50 border-t border-border bg-card/95 px-4 pt-2 pb-[calc(0.5rem+env(safe-area-inset-bottom,0px))] shadow-lg shadow-black/25 backdrop-blur-sm md:hidden">
        <div className="mx-auto flex max-w-lg items-center gap-2">
          <a
            href={bookingHref(settings, locale)}
            className="inline-flex h-12 flex-[2] items-center justify-center gap-2 rounded-xl bg-primary px-4 text-sm font-bold text-primary-foreground transition-colors hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
          >
            {tHeader("bookNow", "احجز الآن")}
            <ArrowLeft className="size-4" aria-hidden="true" />
          </a>

          {/*
            واتساب إجراءٌ ثانوي — ويغيب كله حين لا رقم في الإعدادات.
            واللون الأخضر هوية منصة واتساب نفسها لا لون العلامة — وهو الاستثناء
            نفسه المكتوب في `whatsapp-fab.tsx`، بالقيمة نفسها كي لا يفترق
            الزرّان بدرجةٍ يراها العين.
          */}
          {whatsapp ? (
            <a
              href={waHref(whatsapp)}
              target="_blank"
              rel="noopener noreferrer"
              aria-label={t("whatsapp", "تواصل معنا عبر واتساب")}
              className="inline-flex h-12 max-w-24 flex-1 items-center justify-center rounded-xl bg-[#25D366] text-white transition-transform duration-300 hover:scale-105 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
            >
              <WhatsAppIcon className="size-6" />
            </a>
          ) : null}
        </div>
      </SlideUpBar>
    </>
  );
}
