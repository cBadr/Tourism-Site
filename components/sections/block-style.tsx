import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import {
  CALLOUT_TONE_TOKENS,
  SPACING_TOKENS,
  STYLE_FIELD,
  THEME_COLOR_TOKENS,
  type BlockStyle,
  type CalloutToneToken,
  type SpacingToken,
  type ThemeColorToken,
} from "@/lib/page-builder-types";

/**
 * `content.style` — المنطقة التي **لا تدخلها الترجمة ولا يدخلها CSS حرّ**
 * (العقد `lib/page-builder-types.ts` §٥).
 *
 * ── ثلاث قواعد تحكم هذا الملف ───────────────────────────────────────────────
 *
 * (١) **رموز الثيم لا ألوان خام.** الرمز غير المعروف يُسقَط بصمت ولا يُمرَّر إلى
 *     الصنف. والسبب D-01/D-04: لونٌ محفور في صفٍّ من `sections` يُصدَّر مع
 *     القالب، فتُطلَق العلامة الثانية بلون الأولى في كل صفحة مبنية — صامتاً.
 *     ومنعُ ذلك يجب أن يقع **هنا أيضاً** لا في المحرر وحده، لأن الإدراج المباشر
 *     عبر PostgREST أو محرر SQL يتخطى كل شاشة (نفس مبرر مُشغّلات القاعدة).
 *
 * (٢) **الغياب يعني الافتراضي لا الصفر** (القاعدة الذهبية ١٥). فالكتلة بلا
 *     `style` تخرج من هنا **كما دخلت حرفاً بحرف**: لا غلاف، ولا صنف، ولا عقدة
 *     DOM إضافية. وهذا مقيس لا مأمول — الأقسام الـ٩٣ القائمة كلها بلا `style`،
 *     فتصييرها اليوم لا يتغيّر ببايت واحد.
 *
 * (٣) **`spacing` يُصفّر إيقاع القسم ثم يعطيه بديله** بدل أن يُضاف فوقه: القسم
 *     يحمل `py-16 md:py-24` في جسمه، وإضافةُ حشوٍ خارجي كانت تجعل «مضغوط» أوسع
 *     من «افتراضي». فالغلاف يصفّر حشو الابن بـ`!` ثم يحمله بنفسه.
 */

/** القيمة نصّاً وضمن قائمة الرموز المسموحة — وإلا `null` */
function tokenOf<T extends string>(value: unknown, allowed: readonly T[]): T | null {
  return typeof value === "string" && (allowed as readonly string[]).includes(value)
    ? (value as T)
    : null;
}

/**
 * يقرأ `content.style` ويُطهّره. أي مفتاح خارج `BlockStyle` يُهمَل، وأي رمز خارج
 * القوائم يُهمَل — فما يخرج من هنا قابلٌ للتصيير دائماً.
 */
export function readBlockStyle(content: unknown): BlockStyle | null {
  if (typeof content !== "object" || content === null || Array.isArray(content)) return null;
  const raw = (content as Record<string, unknown>)[STYLE_FIELD];
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) return null;

  const record = raw as Record<string, unknown>;
  const background = tokenOf<ThemeColorToken>(record.background, THEME_COLOR_TOKENS);
  const spacing = tokenOf<SpacingToken>(record.spacing, SPACING_TOKENS);
  const hideOnMobile = record.hideOnMobile === true;
  /**
   * 🆕 م‑١٠ — `tone` يمرّ من هنا **ولا يخرج في `blockStyleClass`**: هو المقبض
   * الوحيد الذي يصف **داخل** الكتلة لا غلافها، فتقرؤه العارضة عبر
   * `SectionProps.style`. وتطهيرُه هنا لا هناك شرطٌ لا زينة: قيمةٌ من محرر SQL
   * أو من PostgREST لا تمرّ على أي شاشة (نفس مبرر القاعدة (١) في الترويسة).
   */
  const tone = tokenOf<CalloutToneToken>(record.tone, CALLOUT_TONE_TOKENS);

  if (background === null && spacing === null && !hideOnMobile && tone === null) return null;
  return {
    ...(background !== null ? { background } : {}),
    ...(spacing !== null ? { spacing } : {}),
    ...(hideOnMobile ? { hideOnMobile: true } : {}),
    ...(tone !== null ? { tone } : {}),
  };
}

/**
 * أصناف الخلفية — **نصوصٌ حرفية** لا مركّبة بالسلاسل، لأن Tailwind يمسح المصدر
 * بحثاً عن أصناف كاملة فلا يولّد ما بُني وقت التشغيل.
 *
 * و`brand-accent` **مزيجٌ خافت لا خلفية صمّاء** بقصد: لونُ العلامة يأتي من
 * الإعدادات ولا يقابله `--brand-accent-foreground` في الثيم، فخلفيةٌ صمّاء منه
 * قد تُخفي نصَّها على علامةٍ فاتحة. والمزيج يبقي لون النصّ الموروث مقروءاً مهما
 * كان لون العلامة — وهو استعمالُه نفسه في `app/globals.css`.
 */
const BACKGROUND_CLASS: Record<ThemeColorToken, string> = {
  default: "",
  primary: "bg-primary text-primary-foreground",
  secondary: "bg-secondary text-secondary-foreground",
  accent: "bg-accent text-accent-foreground",
  muted: "bg-muted",
  card: "bg-card",
  "brand-accent": "bg-[color-mix(in_oklab,var(--brand-accent)_12%,transparent)]",
};

/** إيقاع رأسي بديل — يصفّر حشو القسم الابن ثم يحمله الغلاف */
const SPACING_CLASS: Record<SpacingToken, string> = {
  compact: "py-8 md:py-10 [&>section]:py-0!",
  default: "",
  roomy: "py-24 md:py-32 [&>section]:py-0!",
};

/**
 * الأصناف الناتجة عن `style` — نصّ فارغ يعني «لا غلاف».
 *
 * ⚠ **و`tone` ليست هنا بقصد**: هي المقبض الوحيد الذي يصف داخل الكتلة لا
 * غلافها، فلو أخرجت صنفاً هنا لصار للتنبيه إطارٌ ملوّن **وغلافٌ ملوّن حوله**.
 * وكتلةٌ لا تحمل إلا `tone` تخرج من هنا بنصٍّ فارغ ⇒ لا عقدة DOM إضافية —
 * وهو نفس تعهّد القاعدة (٢) في الترويسة.
 */
export function blockStyleClass(style: BlockStyle | null): string {
  if (style === null) return "";
  return cn(
    style.background ? BACKGROUND_CLASS[style.background] : "",
    style.spacing ? SPACING_CLASS[style.spacing] : "",
    /**
     * `hideOnMobile` تخطيطٌ لا محتوى: الكتلة تبقى في DOM ومقروءةً للزاحف
     * ولقارئ الشاشة على المكتب، وتُخفى بصرياً على الجوال. و`hidden` في Tailwind
     * هي `display:none` — تُخفيها عن قارئ الشاشة أيضاً على الجوال، وهذا هو
     * المعنى المقصود من «أخفِ هذه الكتلة على الجوال» لا إخفاءٌ بصريٌّ وحده.
     */
    style.hideOnMobile ? "hidden md:block" : ""
  );
}

/**
 * غلاف التنسيق — **لا يوجد حين لا لزوم له**.
 *
 * إرجاع `children` كما هي عند غياب الأصناف ليس تحسيناً للأداء بل شرطُ ألا تتغيّر
 * صفحةٌ قائمة: عقدة `<div>` زائدة حول قسمٍ كامل تكسر قواعد التجاور
 * (‏`:first-child` والهوامش المنهارة) في تخطيطٍ لم يُبنَ لها.
 */
export function BlockStyleWrapper({
  style,
  children,
}: {
  style: BlockStyle | null;
  children: ReactNode;
}) {
  const className = blockStyleClass(style);
  if (className === "") return <>{children}</>;
  return <div className={className}>{children}</div>;
}
