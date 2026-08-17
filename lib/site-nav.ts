import { cache } from "react";
import { NAV_LINKS } from "@/components/site/links";
import { DEFAULT_LOCALE } from "@/lib/i18n-types";

/**
 * الشريط العلوي — طبقةُ قراءةٍ واحدة فوق دالة `site_nav` في القاعدة (هجرة `0094`).
 *
 * ── لماذا ملفٌّ مستقل لا دالةٌ في `components/site/links.ts` ─────────────────
 *
 * `links.ts` **يستورده جزيرتان عميلتان**: `components/site/account-menu.tsx`
 * و`components/booking/offers.tsx`. وأي مسارٍ إلى `@/lib/supabase/server` من ملفٍّ
 * تستورده جزيرةُ عميل يجرّ الخادميّ إلى حزمة المتصفح. فبقي `links.ts` نقياً كما
 * كان، وسكن النداءُ هنا — بنفس نمط `lib/content.ts` حرفاً: `hasEnv()` ثم
 * `await import` داخل الدالة، وسقوطٌ إلى الاحتياطي عند أي فشل.
 *
 * ── والمصدر واحدٌ للشريط والدرج واللوحة ─────────────────────────────────────
 *
 * البند الرابع من بنود بدر: «الدرج على الجوال يتبع الشريط من مصدرٍ واحد —
 * قائمتان تفترقان يوماً ما». فالترويسة تنادي `getSiteNav` **مرةً واحدة**
 * وتُصيَّر من نتيجتها القائمتان، واللوحة تنادي الشيء نفسه فتحذيرُها هو حكم
 * القاعدة لا رقمٌ ثانٍ مكتوبٌ في الواجهة.
 */

const hasEnv = () =>
  Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);

/** بندٌ في الشريط — `kind` يميّز صفحةً من بندٍ حرّ، ولا فرق في التصيير */
export type NavItem = {
  kind: "page" | "link";
  /** معرّف الصفّ (صفحةٍ أو بندٍ حرّ) — مفتاح React ومرجع أزرار اللوحة */
  id: string;
  /** مسارٌ بلا بادئة لغة — `localeHref` يضيفها عند التصيير */
  href: string;
  /** التسمية جاهزةً بلغة الزائر (مشتقّةً من العنوان أو من الاختصار) */
  label: string;
  /**
   * مفتاحٌ نسبيٌّ في مساحة `site.nav` بملفّي الرسائل — للبنود الستة القائمة.
   * موجودٌ ⇒ التسمية تُقرأ من المستودع و`label` احتياطيُّها. غائبٌ ⇒ `label` هي
   * الجواب النهائي (صفحةٌ، أو بندٌ حرٌّ كتب المالك نصَّه).
   */
  labelKey: string | null;
};

export type SiteNav = {
  cap: number;
  count: number;
  overCap: boolean;
  items: NavItem[];
};

/**
 * 🔒 الاحتياطي = القائمة المحفورة نفسها التي كانت تُصيَّر قبل `0094`.
 *
 * وهو ليس تجميلاً: بلا بيئة Supabase (تطوير محلي قبل الربط) أو عند فشل الشبكة،
 * الترويسة **بلا تنقّلٍ إطلاقاً** — لا في الشريط ولا في الدرج. فالسقوط يقع إلى
 * «كما كان الموقع أمس» لا إلى «ترويسةٌ عارية»، وهو نفس اختيار `lib/content.ts`
 * حين تفشل قراءة الصفحات.
 */
function fallbackNav(): SiteNav {
  const items: NavItem[] = NAV_LINKS.map((link) => ({
    kind: "link" as const,
    id: link.key,
    href: link.href,
    label: link.label,
    labelKey: link.key,
  }));
  return { cap: items.length, count: items.length, overCap: false, items };
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** يقرأ بنداً واحداً من الحمولة — والناقصُ يُسقط ولا يُصيَّر نصفَ رابط */
function parseItem(raw: unknown): NavItem | null {
  if (!isPlainObject(raw)) return null;
  const href = typeof raw.href === "string" ? raw.href.trim() : "";
  const label = typeof raw.label === "string" ? raw.label.trim() : "";
  const id = typeof raw.id === "string" ? raw.id : "";
  if (!href || !label || !id) return null;
  return {
    kind: raw.kind === "page" ? "page" : "link",
    id,
    href,
    label,
    labelKey: typeof raw.labelKey === "string" && raw.labelKey !== "" ? raw.labelKey : null,
  };
}

/**
 * الشريط بلغة الزائر. `cache` لأن الترويسة واللوحة قد تناديها في الطلب نفسه،
 * والدالة `stable` في القاعدة فلا معنى لندائها مرتين.
 *
 * ⚠ **ولا تُلقي أبداً**: ترويسةٌ بلا تنقّل أهون من صفحةٍ بـ٥٠٠، والاحتياطي
 * يعرض ما كان يُعرض قبل الهجرة.
 */
export const getSiteNav = cache(async (locale: string = DEFAULT_LOCALE): Promise<SiteNav> => {
  if (!hasEnv()) return fallbackNav();
  try {
    const { createServerSupabase } = await import("@/lib/supabase/server");
    const supabase = await createServerSupabase();
    if (!supabase) return fallbackNav();

    const { data, error } = await supabase.rpc("site_nav", { p_locale: locale });
    if (error || !isPlainObject(data)) return fallbackNav();

    const items = Array.isArray(data.items)
      ? data.items.map(parseItem).filter((item): item is NavItem => item !== null)
      : [];
    // شريطٌ فارغٌ من القاعدة **ليس** حالةً نعرضها: إمّا أن المالك أطفأ الستة
    // كلها (وهو ما لا يقصده أحد) أو أن الحمولة وصلت مشوَّهة. والاحتياطي أصدق.
    if (items.length === 0) return fallbackNav();

    const cap = typeof data.cap === "number" ? data.cap : items.length;
    const count = typeof data.count === "number" ? data.count : items.length;
    return { cap, count, overCap: count > cap, items };
  } catch {
    return fallbackNav();
  }
});
