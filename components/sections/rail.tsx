import type { ReactNode } from "react";
import { RailDots } from "@/components/motion";
import { cn } from "@/lib/utils";

/**
 * ╔══════════════════════════════════════════════════════════════════════════╗
 * ║  السكة الأفقية — **آليةٌ واحدة** لكل شريط بطاقات على الجوال               ║
 * ╚══════════════════════════════════════════════════════════════════════════╝
 *
 * ── لماذا وُلد هذا الملف (القاعدة الذهبية ١٢) ───────────────────────────────
 *
 * السكة كانت مكتوبةً **داخل** `components/sections/route-rail.tsx` سطوراً في
 * `className`. ثم طلب بدر أن يتجانب الأسطولُ كالمسارات — و«اكتب سكةً ثانية»
 * هي الطريقة التي وُلد بها نصفُ عيوب هذا المستودع: شريطان يبدآن متطابقين ثم
 * ينحرفان عند أول إصلاح، فيُصلَح `snap` في أحدهما ويبقى مكسوراً في الآخر.
 *
 * فنُقلت السكة **بجسمها** إلى هنا، ويستوردها الشريطان ولا يعرّفها أيٌّ منهما.
 * والتصميم نفسه يقول هذا: `.rail` صنفٌ واحد في `style.css` يلبسه
 * `#routeRail` و`#fleetRail` معاً، والفرق بينهما سطرٌ في شبكة الديسكتوب.
 *
 * ── وما تحمله السكة معها، ولا يُسقط أيٌّ منه عند إعادة الاستعمال ────────────
 *
 * | الخاصية | لماذا هي شرطٌ لا زينة |
 * |---|---|
 * | **بطاقةٌ ناقصة عند الحافة** (`w-64` داخل حاويةٍ ٣٧٥) | شريطٌ يبدو صفاً كاملاً أسوأ من عمود: العميل لا يعرف أن تحته المزيد فلا يسحب. وهذا نصّ تحفّظ بدر نفسه |
 * | `snap-x snap-mandatory` + `snap-start` | السحب يستقر على بطاقةٍ كاملة لا على نصفها |
 * | `-mx-4 px-4` (و`sm:-mx-6 px-6`) | أول بطاقة وآخرها تلتصقان بحافة الشاشة أثناء السحب، فلا يبقى هامشٌ ميت يوحي بالنهاية |
 * | `tabIndex={0}` + `aria-label` | من لا يستعمل لمساً يمرّر بالأسهم — وهو ما يفعله `tabindex="0"` في التصميم على السكتين |
 * | **نقاطٌ تحت الشريط** (`RailDots`) | مؤشّر «كم بقي» — لا تُصيَّر على الخادم، فمن لا جافاسكربت عنده لا يرى أزراراً لا تعمل |
 *
 * 🔒 **والنقاط لا تُصيَّر إلا على الجوال** (`md:hidden`): فوق ذلك تصير السكة
 * شبكةً بلا تمرير، ومؤشّرُ تمرير لشبكةٍ ساكنة كذبٌ بصري.
 */

export function Rail({
  /** معرّف الحاوية — تقرؤه `RailDots` وحدها، وهو نفس معرّف التصميم */
  id,
  label,
  /** أصناف شبكة الديسكتوب: من أي نقطة تتوقف السكة وبكم عمود */
  gridClassName,
  className,
  children,
}: {
  id: string;
  label: string;
  gridClassName: string;
  className?: string;
  children: ReactNode;
}) {
  return (
    <>
      <ul
        id={id}
        role="list"
        tabIndex={0}
        aria-label={label}
        className={cn(
          "-mx-4 flex snap-x snap-mandatory gap-4 overflow-x-auto px-4 pb-4 sm:-mx-6 sm:px-6",
          /* شريط التمرير الأصلي مخفيّ كما في التصميم — الحافةُ الناقصة والنقاط
             تحمل الإشارة، والسكة تصير شبكةً بلا تمرير فوق `md` أصلاً */
          "[-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60",
          gridClassName,
          className
        )}
      >
        {children}
      </ul>

      <RailDots
        railId={id}
        label={label}
        className="mt-1 flex items-center justify-center gap-1 md:hidden"
        dotClassName="grid size-7 place-items-center rounded-full transition-colors before:size-2 before:rounded-full before:bg-muted-foreground/35 before:transition-all before:duration-300 before:content-[''] aria-selected:before:scale-150 aria-selected:before:bg-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60"
      />
    </>
  );
}

/**
 * غلاف البطاقة الواحدة داخل السكة. عرضٌ ثابت على الجوال (فتظهر حافةُ التالية)
 * و`auto` داخل الشبكة على المكتب.
 *
 * ⚠ **ولا يُكتب `w-64` في العارضتين**: لو انحرف الرقمان انحرفت «حافة البطاقة
 * الناقصة» في أحدهما — وهي بالضبط الخاصية التي طلب بدر نقلها.
 */
export function RailItem({
  className,
  children,
}: {
  className?: string;
  children: ReactNode;
}) {
  return <li className={cn("w-64 shrink-0 snap-start md:w-auto", className)}>{children}</li>;
}

/** شبكة الديسكتوب حين تتوقف السكة عند `md` — عمودان ثم ثلاثة */
export const RAIL_GRID_3 =
  "md:mx-0 md:grid md:grid-cols-2 md:gap-5 md:overflow-visible md:px-0 md:pb-0 lg:grid-cols-3";

/** ونفسها بأربعة أعمدة — فئات الأسطول الأربع */
export const RAIL_GRID_4 =
  "md:mx-0 md:grid md:grid-cols-2 md:gap-5 md:overflow-visible md:px-0 md:pb-0 lg:grid-cols-4";
