import { telLink, waLink } from "@/lib/phone";
import { socialHref, type SiteSettings, type SocialSettings } from "@/lib/site-config";
import { DEFAULT_LOCALE, localePath } from "@/lib/i18n-types";
import type { Tx } from "./i18n";

/**
 * روابط التنقل والأدوات المشتركة لمكوّنات الموقع العام.
 * لا قيم علامة تجارية هنا — كل شيء يُشتق من SiteSettings وقت التنفيذ.
 *
 * المرحلة ٨: كل رابط داخلي يمر بـ `localePath(locale, path)` — العربية تبقى بلا
 * بادئة حرفياً (`/#services`)، والإنجليزية تحصل على `/en#services`. ونصوص
 * القائمة تأتي من مساحة `site.nav`، وأسماء الشبكات من `site.social`.
 */

/**
 * روابط القائمة — مسارات مطلقة عمداً (`/#services` لا `#services`):
 * الترويسة تظهر في كل الصفحات، والمرساة النسبية لا تعني شيئاً في
 * `/book` أو `/services/...` لأن تلك الأقسام موجودة في الرئيسية وحدها.
 */
export const NAV_LINKS = [
  { href: "/#services", key: "services", label: "الخدمات" },
  { href: "/#fleet", key: "fleet", label: "الأسطول" },
  { href: "/#why", key: "why", label: "لماذا نحن" },
  { href: "/#contact", key: "contact", label: "تواصل" },
  /**
   * «اطلب عرض سعر» — المسار الموازي للحاسبة، وكان **مفهرساً بلا مدخل بشري**:
   * `app/sitemap.ts` يعلنه بأولوية ٠٫٧ فيصله الزاحف، بينما إشارته الوحيدة للزائر
   * سطرٌ داخل `components/booking/offers.tsx` — أي **بعد** بحثٍ ناجح في `/book`.
   * ومن جاء لجولة سياحية أو مناسبة أو مؤتمر لا يصل ذلك السطر أصلاً: ثلاث من
   * الخدمات الست خارج الحاسبة بنيوياً، فالبحث لا يعطيه عرضاً يقرأ ما تحته.
   * والمفتاح `site.nav.quoteRequest` موجود في `ar.json` و`en.json` منذ المرحلة ٨
   * لرابطٍ لم يُضَف قط — أي أن الغياب سهوٌ لا قرار.
   *
   * **وموضعه هنا بالذات — بعد المراسي الأربع وقبل «تابع حجزك» — بحجّتين:**
   *
   * ١ الأربعة قبله مراسٍ في الرئيسية (`/#…`) وما بعده صفحات مستقلة. وإقحام
   *   صفحة وسط كتلة المراسي يكسر تجانساً يقرؤه الزائر بلا وعي: أول القائمة
   *   يتصفّح الصفحة، وآخرها يغادرها.
   *
   * ٢ وهو **سطح اكتساب** لا خدمة: من يطلب عرض سعر لم يحجز بعد، ومن يفتح
   *   «تابع حجزك» أو «حجوزاتي» حجز أصلاً. فالزائر الجديد — وهو أكثر من يمسح
   *   القائمة — يلقى مدخله قبل مدخلَي ما بعد الحجز. وترتيب `app/sitemap.ts`
   *   يقول الشيء نفسه بأرقامه: ‏`/book` ٠٫٩ ثم هذه ٠٫٧ ثم `/track` ٠٫٦،
   *   و«حجوزاتي» خارج الخريطة كلياً.
   *
   * ⚠ وهي **سابع** رابط في القائمة، وإضافتها هي ما كسر ترويسة `/en`: الروابط
   * السبعة تحتاج ٧١٠ بكسل بالإنجليزية فالتفّت أربعة منها سطرين بين ١٠٢٤
   * و‏١١٣٠. أُصلح برفع عتبة التنقّل في `header.tsx` إلى `xl` — والتعليق هناك
   * يحمل الأرقام المقيسة. **ومن يضيف رابطاً ثامناً يعيد القياس هناك أولاً.**
   */
  { href: "/quote-request", key: "quoteRequest", label: "اطلب عرض سعر" },
  /**
   * «تابع حجزك» — الملاحظة ١ في ملحق ٢ من الرؤية: من أغلق التبويب فقد الطريق
   * إلى حجزه، والمطلوب **مدخل ظاهر في الموقع** لا نموذجاً مدفوناً.
   *
   * موضعه في هذه القائمة وحدها يكفي لثلاثة أسطح: التنقل في الترويسة، وقائمة
   * الجوال (‏`details` بلا JavaScript)، وعمود «أقسام الموقع» في التذييل —
   * ثلاثتها تقرأ `navLinks()` من هنا. ومسارٌ مطلق لأن الترويسة تظهر في كل صفحة.
   *
   * وهو **آخر** القائمة عمداً: من يبحث عن حجزه يعرف ما يريد ويمسح القائمة
   * كاملة، ومن يتصفح لأول مرة يجب أن تلقاه الخدمات لا نموذج متابعة لا يعنيه.
   */
  { href: "/track", key: "track", label: "تابع حجزك" },
] as const;

/**
 * ── 📌 «حجوزاتي» غادرت هذه القائمة (الفجوة ١٣) ─────────────────────────────
 *
 * كانت هنا سابعَ رابط، وتُعرض للجميع لأن إخفاءها عمّن لا جلسة له كان يستلزم
 * قراءة الجلسة في **الترويسة** — أي في كل صفحة من الموقع. وقد زال هذا القيد:
 * `components/site/account-menu.tsx` جزيرةٌ صغيرة تقرأ الجلسة عندها وحدها،
 * فالترويسة تبقى خادميةً ثابتة و«حجوزاتي» تظهر **تحت زرّ الحساب** لمن له جلسة.
 *
 * والمكسب ليس ترتيبياً فقط: مدخلٌ إلى قائمةٍ فارغة معروضٌ على كل زائر جديد
 * ضجيجٌ في شريط الروابط، والقائمة نفسها `noindex` فليست مسار زحف أصلاً.
 *
 * ⚠ ورابطها الثابت يبقى مع ذلك في **التذييل** (‏`footer.tsx`) بجوار «دخول
 * العملاء»: التذييل خادميّ لا يقرأ جلسةً، ومن فقد الجزيرة (‏JavaScript معطّل)
 * يجد الطريقين هناك.
 */
export const ACCOUNT_LINKS = [
  { href: "/account/login", key: "signIn", label: "دخول العملاء" },
  { href: "/account/bookings", key: "account", label: "حجوزاتي" },
] as const;

/** روابط الحساب بلغة الزائر — للتذييل وحده (‏الترويسة تستعمل الجزيرة) */
export function accountLinks(t?: Tx, locale: string = DEFAULT_LOCALE): { href: string; label: string }[] {
  return ACCOUNT_LINKS.map((link) => ({
    href: localeHref(link.href, locale),
    label: t ? t(link.key, link.label) : link.label,
  }));
}

/** روابط القائمة بلغة الزائر — النص من مساحة `site.nav` والمسار من localePath */
export function navLinks(t?: Tx, locale: string = DEFAULT_LOCALE): { href: string; label: string }[] {
  return NAV_LINKS.map((link) => ({
    href: localeHref(link.href, locale),
    label: t ? t(link.key, link.label) : link.label,
  }));
}

/**
 * 🔒 هل يصلح هذا النصّ **مساراً داخلياً**؟ `/x` نعم · `//x` و`http…` و`x` لا.
 *
 * ── لماذا هي هنا لا في عارضة (م‑٧، القاعدة الذهبية ١٢) ──────────────────────
 *
 * كانت دالةً **خاصة** داخل `components/sections/route-rail.tsx`. ولمّا صارت
 * بطاقات الخدمات تحمل `href` محرَّراً من اللوحة كذلك، كان الطريق المعتاد أن
 * تُنسخ — وهي الطريقة التي وُلد بها نصفُ عيوب هذا المستودع. فنُقلت **بجسمها
 * حرفاً** إلى مالك `localeHref` و`bookingHref`، وتُستورَد ولا تُعرَّف ثانيةً.
 * ونسختان من قاعدة «ما هو الرابط الداخلي» تنحرفان، وأولُ انحرافٍ بينهما ثغرةُ
 * تحويلٍ في صفحةٍ عامة.
 *
 * ⚠ **ولا تُستعمل على صورة، ولا يُستعمل `safeMediaSrc` على رابط:** هذه
 * **أوسع بقصد** (المسار الداخلي يجوز أن يحمل `?` و`#`، و`?class=sedan` يعتمد
 * عليه)، وتلك **أضيق** (ترفض `:` كلها). فاستعمالُ حارس المسار على صورة يفتح
 * `javascript:`، واستعمالُ حارس الصورة على رابط يقتل الاستعلام.
 */
export function internalPath(href: string | undefined | null): string | null {
  if (typeof href !== "string") return null;
  const value = href.trim();
  if (!value.startsWith("/") || value.startsWith("//")) return null;
  return value;
}

/** مسار داخلي بلغة الزائر — يحافظ على مرساة `#` وعلى الروابط الخارجية كما هي */
export function localeHref(path: string, locale: string = DEFAULT_LOCALE): string {
  if (/^(https?:|mailto:|tel:|#)/.test(path)) return path;
  const [pathname = "/", hash] = path.split("#");
  const prefixed = localePath(locale, pathname || "/");
  return hash ? `${prefixed}#${hash}` : prefixed;
}

/**
 * رابط محادثة واتساب مع رقمنا.
 *
 * ⚠ العنوان يُبنى في `waLink` لا هنا: المخزَّن محليٌّ (`01010000506`) و`wa.me`
 * يشترط الصيغة الدولية، فنزع الرموز وحده كان يفتح رسالة «الرقم غير صالح» في
 * **كل** سطح يناديه. وبعد إصلاح هذه الدالة وحدها بقيت أربع شاشات تبني العنوان
 * بيدها فورثت العيب — فصار البناء كله في `lib/phone.ts` وقاعدة لِنت تحرسه.
 *
 * ويبقى الإرجاع `string` لأن كل مناديه يضعه في `href` مباشرةً؛ وحين يتعذّر بناء
 * الرقم يعود إلى `wa.me` بلا وجهة — يفتح واتساب ولا يدّعي محادثةً مع رقمٍ خاطئ.
 * ومن يملك بديلاً أحسن (‏`contactHref`) يفحص القيمة قبل النداء أصلاً.
 */
export function waHref(whatsapp: string): string {
  return waLink(whatsapp) ?? "https://wa.me/";
}

/**
 * نيّة مشاركة على واتساب **بلا رقم مستقبِل** — `wa.me/?text=…`.
 *
 * والفرق عن `waHref` أعلاه ليس تجميلياً: ذاك يفتح محادثة مع رقمنا نحن، وهذا يفتح
 * منتقي جهات الاتصال فيختار المُرسِل وجهته بنفسه (نفسه غالباً). ولهذا وحده يصلح
 * لصفحة `/booking/[token]`: نيّة خاصة موجَّهة يملك العميل طرفيها، لا نشر عام
 * يضع رابطاً هو مفتاح حجزه في فهرس (‏`lib/export-types.ts` §٥).
 */
export function waShareHref(text: string): string {
  return `https://wa.me/?text=${encodeURIComponent(text)}`;
}

/** يبني رابط تليجرام من معرف أو رابط كامل */
export function telegramHref(telegram: string): string {
  if (/^https?:\/\//.test(telegram)) return telegram;
  return `https://t.me/${telegram.replace(/^@/, "")}`;
}

/**
 * رابط اتصال هاتفي — **بالصيغة الدولية**، لا بنزع الرموز وحده.
 *
 * ⚠ كان `tel:${phone.replace(/[^+\d]/g, "")}` فيخرج `tel:01010000506` من الرقم
 * المخزَّن محلياً. وهذا ليس مكسوراً كما كان `wa.me` — يطلب من هاتفٍ داخل مصر —
 * لكنه يفشل صامتاً عند **من هو خارجها**، وهو جمهور منتج نقلٍ سياحي بعينه.
 * الموازنة كاملةً ولماذا لا يخسر المحلي شيئاً عند `telLink` في `lib/phone.ts`.
 *
 * والنص المعروض للزائر لا يتغير بحرف: `contact.tsx` يعرض `channel.value` خاماً
 * ويضع هذه في `href` وحدها.
 *
 * ويبقى الإرجاع `string` لأن ستة مواضع تضعه في `href` مباشرةً وكلها تحرس
 * `if (phone)` قبل النداء؛ فـ`tel:` العاري لا يُبلغه إلا نصٌّ بلا رقم واحد —
 * وهو الناتج نفسه الذي كان يعطيه السطر القديم لتلك الحالة بالضبط.
 */
export function telHref(phone: string): string {
  return telLink(phone) ?? "tel:";
}

/**
 * وجهة زر «احجز الآن» = صفحة الحجز دائماً (منذ المرحلة ٣: محرك التسعير والحجز
 * يعمل فعلياً، فلا معنى لتحويل العميل إلى واتساب أو إلى قسم التواصل).
 * قنوات التواصل تبقى متاحة كبديل ثانوي: الزر العائم وقسم «تواصل» وأزرار
 * الاستفسار في بطاقات العروض.
 */
export const BOOKING_PATH = "/book";

export function bookingHref(_settings?: SiteSettings, locale: string = DEFAULT_LOCALE): string {
  return localeHref(BOOKING_PATH, locale);
}

/**
 * قناة الاستفسار الثانوية: واتساب إن وُجد، وإلا الهاتف، وإلا قسم التواصل
 * في الصفحة الرئيسية. تُستخدم في الأزرار الثانوية لا في زر الحجز الأساسي.
 */
export function contactHref(settings: SiteSettings, locale: string = DEFAULT_LOCALE): string {
  if (settings.contact.whatsapp) return waHref(settings.contact.whatsapp);
  if (settings.contact.phone) return telHref(settings.contact.phone);
  return localeHref("/#contact", locale);
}

/** خصائص الروابط الخارجية (تُفتح في تبويب جديد) */
export function externalLinkProps(
  href: string
): { target: "_blank"; rel: "noopener noreferrer" } | Record<string, never> {
  return href.startsWith("http")
    ? { target: "_blank", rel: "noopener noreferrer" }
    : {};
}

export type SocialKey = keyof SocialSettings;

export const SOCIAL_LABELS: Record<SocialKey, string> = {
  facebook: "فيسبوك",
  x: "منصة إكس",
  linkedin: "لينكد إن",
  github: "جيت هاب",
  instagram: "إنستغرام",
};

export type SocialEntry = { key: SocialKey; label: string; href: string };

/**
 * حسابات التواصل التي **يُبنى منها رابط مطلق** — بأسماء بلغة الزائر.
 *
 * ⚠ الشرط ليس «غير فارغ» بل «‏`socialHref` أرجعت عنواناً»: القيمة المخزّنة معرّف
 * حساب غالباً (`RentLimousine`)، ووضعُها في `href` كما هي يصنع رابطاً **نسبياً**
 * يتغيّر مقصده بتغيّر الصفحة. الشرح الكامل ولماذا يُرفض ما لا يُطبَّع في
 * `lib/site-config.ts` عند `socialHref` — وهي المصدر الوحيد الذي تناديه هذه
 * الدالة و`sameAs` في البيانات المهيكلة وشاشة فحص السيو معاً.
 */
export function socialEntries(socials: SocialSettings, t?: Tx): SocialEntry[] {
  return (Object.keys(SOCIAL_LABELS) as SocialKey[]).flatMap((key) => {
    const href = socialHref(key, socials[key]);
    if (!href) return [];
    const label = t ? t(key, SOCIAL_LABELS[key]) : SOCIAL_LABELS[key];
    return [{ key, label, href }];
  });
}
