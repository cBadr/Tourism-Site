import styles from "./motion.module.css";

/**
 * أصناف الحركة الجاهزة — تتبنّاها العارضات بلا أن تصير مكوّنات عميل.
 *
 * كلها CSS خالص: تحويمٌ وبريقٌ وتكبيرُ صورة. فالعارضة تبقى مكوّن **خادم**
 * كما هي، وتضيف صنفاً واحداً — بلا `"use client"`، وبلا بايت جافاسكربت.
 *
 * وكلها محروسة داخلياً بـ`(prefers-reduced-motion: no-preference)`
 * و`(hover: hover)` معاً، فلا يحتاج المتبنّي أن يتذكّر شيئاً.
 */
export const fx = {
  /** ارتفاعٌ لطيف للبطاقة عند التحويم (‏−٦ بكسل) + ظلٌّ أعمق. */
  cardLift: styles.cardLift,
  /** تكبير الصورة ٪٦ داخل بطاقةٍ تحمل `cardLift`. */
  zoomImage: styles.zoomImage,
  /** أيقونةٌ تتقدّم في اتجاه القراءة عند تحويم الحاضن. */
  nudgeIcon: styles.nudgeIcon,
  /** حاضنٌ يحرّك `nudgeIcon` بلا أن يكون بطاقةً مرتفعة (رابطٌ نصّي مثلاً). */
  nudgeHost: styles.nudgeHost,
  /** لمعانٌ يعبر الزر مرّة عند التحويم. يتطلّب `position: relative`. */
  shine: styles.shine,

  /** صورة البطل: Ken Burns بطيء ذهاباً وإياباً. */
  kenBurns: styles.kenBurns,
  /** سهم «مرّر لأسفل» المتأرجح. */
  scrollCue: styles.scrollCue,

  /**
   * 🔴 طبقتان **ساكنتان** لبطاقات الأسطول — ليستا حركة، ومُصدَّرتان هنا لأن
   * حزمة التصميم تسجّل أن الأرضية البيضاوية «فعلت للتجانس أكثر من أي شيء آخر»:
   * صور السيارات الأربع من بيئات مختلفة، وهذا التعتيم أسفل الكادر وحده هو ما
   * يجعلها تُقرأ أسطولاً واحداً على سطحٍ واحد. تُتبنّى كما هي ولا تُقرَّب.
   */
  fleetFloor: styles.fleetFloor,
  fleetScrim: styles.fleetScrim,
} as const;

/* ==========================================================================
   صنف البطاقة الحاضنة للوهج — ويعيش **هنا** لا في `pointer-glow.tsx`

   🔴 عيبٌ مقيس (2026-08-17): كان `export const pointerGlowHostClass` داخل
   `pointer-glow.tsx`، وأولُ سطرٍ فيه `"use client"`. و`components/site/why-us.tsx`
   مكوّنٌ **خادمي** يستورده من البرميل — فلا يعبر أصلاً. القياس من مسارٍ حيّ على
   الخادم قبل الإصلاح:

       typeof pointerGlowHostClass    → "function"   (مرجعُ عميل لا نصّ)
       Object.keys(…)                 → []
       Object.getOwnPropertyNames(…)  → ["length","name","prototype",
                                         "$$typeof","$$id","$$async"]
       cn(pointerGlowHostClass, fx.cardLift, …)
         → "motion-module__…__cardLift relative overflow-hidden …"
           أي **بلا `pointerGlowHost`** — `clsx` يُسقط القيمة غير النصّية صامتاً

   وأثرُه أن الوهج **ميّتٌ كاملاً** لا ناقص، لسببين معاً: قاعدة الـCSS
   (`.pointerGlowHost:hover .pointerGlow { opacity: 1 }`) لا تجد حاضناً فتبقى
   الطبقة `opacity: 0`، و`closest(selector)` في الشبكة لا يطابق شيئاً فلا يُضبط
   `--mx/--my` أبداً. **ولا شيء يرمي ولا شيء يُسجَّل ولا اختبارَ يسقط.**

   🔒 والقاعدة: ما يقرؤه الخادم والعميل معاً يعيش في وحدةٍ محيّدة — لا
   `"use client"` (فلا يعبر إلى الخادم) ولا `server-only` (فلا يعبر إلى العميل).
   وهذا الملف هو تلك الوحدة في `components/motion/**` بالفعل، ودليلُه في القياس
   نفسه: `fx.cardLift` عبَر نصّاً صحيحاً في اللحظة التي فشل فيها الآخر.

   ⚠ **ولا يُعاد تصديرُه من `pointer-glow.tsx`.** إعادةُ التصدير تُبقي البابَ
   مفتوحاً: المستورد لا يرى فرقاً، والقيمة تعود مرجعَ عميل من ذلك الطريق. نفس
   القرار اتُّخذ حرفياً في `app/portal/notifications/channel-meta.ts`.

   ولماذا خارج `fx`؟ لأن `fx.*` أصنافٌ **تُتبنّى وحدها** وتعمل بلا شيء آخر، وهذا
   الصنف لا معنى له بغير `<PointerGlowLayer />` داخل البطاقة و`PointerGlowGrid`
   حولها. فبقاؤه مستقلاً يقول ذلك.
   ========================================================================== */
export const pointerGlowHostClass = styles.pointerGlowHost;
