"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";

import { localePath } from "@/lib/i18n-types";
import { resolveLocale } from "@/lib/i18n/content";
import { createServiceSupabase } from "@/lib/supabase/admin";
import { checkPerMinute } from "@/lib/discounts/rate-limit";
import { requestClientKey } from "@/lib/lookup/client-key";
import { accountAccess } from "../_lib/session";
import { loadMyBookings } from "./data";

/**
 * إجراءا شاشة «حجوزاتي»: **أضِف حجزاً سابقاً**، و**افتح صفحة حجز من القائمة**.
 *
 * الشكل القياسي (اتفاقية ٤) بلا تخطٍّ: فحص البيئة ← تحقق ← نداء ← `redirect()`
 * في نهاية **كل** مسار، نجاحاً وفشلاً، والحالة تسافر رمزاً في query string لا في
 * ذاكرة عميل. فالنموذجان يعملان وJavaScript معطّل، والنتيجة رابط قابل للتحديث.
 *
 * ══════════════════════════════════════════════════════════════════════════
 *  🔒 (١) عميل مربوط بالجلسة — لا مفتاح خدمة، ولا مسار غيره
 * ══════════════════════════════════════════════════════════════════════════
 *
 * الدالتان `my_bookings()` و`link_booking_by_reference()` تشتقّان الهوية من
 * `auth.uid()` داخلهما (قُرئتا حيّتين من `pg_get_functiondef` — D-58). ومفتاح
 * الخدمة بلا `auth.uid()`: فالأولى ترجع **صفر صفوف** والثانية ترفض بـ`forbidden`
 * — أي أن «تبسيط» هذا الملف إلى `createServiceSupabase` لا يفتح ثغرة بل يعطّل
 * الميزة بصمت، وهو بالضبط ما صُمّمت عليه.
 *
 * والعميل يأتي من `accountAccess()` — بوابة السطح نفسها التي يقرؤها الغلاف —
 * فلا يوجد في `/account` تعريفان لـ«صاحب جلسة» ينحرفان، ولا موضعٌ يختار فيه
 * أحدٌ مفتاح الخدمة سهواً. وهي تُستدعى في **بداية كل إجراء**: الإجراءات نقاط
 * `POST` مستقلة عن شجرة التصيير، والغلاف لا يحميها (نمط `portalAccess` حرفياً).
 *
 * ══════════════════════════════════════════════════════════════════════════
 *  🔒 (٢) كيف يصل صفٌّ في القائمة إلى صفحة حجزه، والقائمة **لا تحمل توكناً**
 * ══════════════════════════════════════════════════════════════════════════
 *
 * `MyBookingRow` بلا `publicToken` عمداً (نصّ العقد): التوكن مفتاح صفحة عامة بلا
 * كلمة سرّ، ووضعه في حمولة **قائمة** يعني أن تسريب سجلٍّ واحد يسلّم مفاتيح كل
 * حجوزات العميل دفعةً واحدة. فالسطر يحمل **المرجع** وحده، والانتقال يمرّ من هنا:
 *
 *  ١ الملكية تُثبَت من `my_bookings()` **بعميل الجلسة** — وهي المرجع الوحيد
 *    للإذن في هذا المسار. المرجع المُرسَل يُطابَق بقائمة صاحب الجلسة نفسها.
 *  ٢ ثم — وبعدها فقط — يُقرأ `public_token` بمفتاح الخدمة لصفٍّ **واحد** بمرجعه
 *    (‏`bookings_reference_key` فريد، مقيسٌ على الكتالوج) ويُحوَّل إليه.
 *
 * فالتوكن يُصدَر للصفحة المطلوبة وحدها ولا يعبر المتصفح في أي قائمة، والقرارُ
 * الأمني كلّه في الخطوة (١) — الخطوة (٢) قراءةُ عنوانٍ بعد أن ثبت الإذن، لا إذن.
 *
 * ⚠ **وترتيبهما هو الحارس**: من يقلبهما (يقرأ التوكن ثم يتحقق) يكون قد قرأ مفتاح
 * حجزٍ ليس لصاحب الجلسة قبل أن يسأل — ويكفي خطأُ فرعٍ واحد بعدها ليخرج.
 *
 * ولا مرجعَ يُكتب في رابط إطلاقاً — لا في النجاح ولا في الخطأ — للسبب المكتوب في
 * `app/track/page.tsx` حرفياً: رقم الحجز يتسرّب في سجلات الخادم وفي ترويسة
 * المُحيل إلى كل وسم قياس مركَّب في `app/layout.tsx`. لذلك النموذجان `POST`
 * والمرجع في جسم الطلب، والنجاح يقول «أُضيف» والقائمة تحته تُظهره بنفسها.
 */

/* ------------------------------------------------------------------ */
/* عقد الرموز — والمقصود منه أن تفشل الترجمةُ الناقصة في البناء لا في الإنتاج */
/* ------------------------------------------------------------------ */

/**
 * كل رمز خطأ يستطيع هذان الإجراءان إصداره — **ولا رمز خارج هذه القائمة**.
 *
 * والصفحة تبني `Record<AccountErrorCode, …>` عليه، فإضافة رمزٍ هنا بلا رسالة
 * هناك **لا تبني** أصلاً. هذا هو العلاج البنيوي لعيبٍ تكرّر في هذا المستودع:
 * رمزٌ يُشحن بلا جملة، فيرى المستخدم شاشةً بلا سبب. الحارس مكتوبٌ مرة ويُنفَّذ
 * آلياً، لا يُتذكَّر في المراجعة (نفس منطق `CUSTOMER_FORBIDDEN_COLUMNS` في العقد).
 */
export type AccountErrorCode =
  /** متغيرات Supabase غير مضبوطة على هذا الخادم */
  | "env"
  /** لا جلسة — أو جلسة بلا صف في `profiles` (تلميح `forbidden` من الدالة) */
  | "auth"
  /** هجرة 0044 غير مطبَّقة هنا */
  | "schema"
  /** مرجع أو هاتف ناقص — يرفعه `find_booking_by_reference` بتلميحه */
  | "invalid-input"
  /** ٨ محاولات لكل ربع ساعة لكل حساب، أو خانق الذاكرة قبلها */
  | "rate-limited"
  /**
   * ⚠ **لا يفرّق** بين «مرجع لا وجود له» و«مرجع صحيح بهاتف خاطئ» — والتفريق
   * يجعل النموذج مُثبِتاً لوجود الحجز لمن يملك المرجع وحده. الرمز نفسه الذي
   * ترفعه `/track` للسبب نفسه (‏`LinkRefusal` في العقد).
   */
  | "not-found"
  /** فشل غير مصنَّف — شبكة أو خطأ لم نعرفه */
  | "save"
  /** طُلب فتح مرجعٍ ليس في قائمة صاحب الجلسة */
  | "open-denied"
  /** المرجع في القائمة ولم نستطع قراءة توكنه — عطلٌ عندنا لا خطأ منه */
  | "open-missing";

/** رموز «نجاح» — تُعرض بنبرة الخبر لا بنبرة الخطأ */
export type AccountNoticeCode = "linked" | "already-linked";

/* ------------------------------------------------------------------ */
/* أدوات مشتركة                                                        */
/* ------------------------------------------------------------------ */

const PAGE = "/account/bookings";

/** مسار الصفحة بلغة الزائر — العربية بلا بادئة والإنجليزية تحت `/en` */
function pageUrl(locale: string, query?: string): string {
  const base = localePath(locale, PAGE);
  return query ? `${base}?${query}` : base;
}

const errorUrl = (locale: string, code: AccountErrorCode) =>
  pageUrl(locale, `error=${code}`);

const noticeUrl = (locale: string, code: AccountNoticeCode) =>
  pageUrl(locale, `notice=${code}`);

/** الأرقام العربية الهندية تُقبل في الحقول وتُحوَّل قبل الإرسال (اتفاقية ١) */
const toLatinDigits = (s: string) =>
  s.replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 0x0660));

/** أطوال دفاعية — حارس حجم لا تحقق: التحقق الحقيقي في القاعدة وحدها */
const MAX_REFERENCE_LENGTH = 32;
const MAX_PHONE_LENGTH = 32;

/** نص من الحقل: تحويل الخانات ثم تشذيب ثم سقف طول */
function field(formData: FormData, name: string, maxLength: number): string {
  const raw = formData.get(name);
  if (typeof raw !== "string") return "";
  return toLatinDigits(raw).replace(/\s+/g, " ").trim().slice(0, maxLength);
}

/** رموز «المخطط ناقص» — نفس مجموعة `data.ts` وبوابة البورتال */
const SCHEMA_CODES = new Set(["42P01", "42703", "42883", "PGRST202", "PGRST204", "PGRST205"]);

/** تلميحات `link_booking_by_reference` كما قرأناها من التعريف الحيّ (D-58) */
const LINK_HINTS: Record<string, AccountErrorCode | "already-linked"> = {
  forbidden: "auth",
  "invalid-input": "invalid-input",
  "rate-limited": "rate-limited",
  "already-linked": "already-linked",
  /**
   * لا ترفعه `link_booking_by_reference` (صفر صفوف هو عقدها عند «لا نتيجة» —
   * D-48)، لكنه مكتوبٌ لأن `link_booking_by_token` ترفعه، ولأن أرخص من تتبّع
   * تلميحٍ مجهول أن نترجمه إلى جملته الصحيحة إن وصل يوماً.
   */
  "not-found": "not-found",
};

/**
 * سقف الطبقة الأولى — محاولة ربطٍ في الدقيقة لكل بصمة.
 *
 * وهو **ليس** الخانق المُلزِم: المُلزِم في القاعدة، ودلوه `'acct:' || auth.uid()`
 * — معرّفٌ لا يزوّره المنادي ولا يدوّره، ٨ محاولات لكل ربع ساعة **لكل حساب**.
 * وظيفة هذه الطبقة أن تقصّ الفيضان قبل أن يكلّف ذهاباً وإياباً إلى القاعدة، وهي
 * خريطةٌ في ذاكرة النسخة الواحدة تُصفَّر مع كل نشر (‏`lib/discounts/rate-limit.ts`
 * يكتب حدودها بصدق). وأعلى من الحدّ الدائم عمداً كما في `/track`: من قصده أن
 * **يحكم** هو ذاك، وتساويهما يحجب إنساناً عاد بعد انقضاء نافذة القاعدة بحدٍّ
 * ثانٍ لا يعرف عنه شيئاً.
 */
const MAX_LINKS_PER_MINUTE = 10;

/* ------------------------------------------------------------------ */
/* (١) أضِف حجزاً سابقاً                                                */
/* ------------------------------------------------------------------ */

/**
 * يربط حجزاً بحساب صاحب الجلسة بمرجعه وهاتفه — نفس الزوج الذي تطلبه `/track`.
 *
 * والتفويض كامل: لا تطبيع مرجع هنا ولا تطبيع هاتف ولا فحص شكل. كلّه داخل
 * `find_booking_by_reference` التي تناديها الدالة، وهي مُصلَّبة بما لا يُعاد
 * بناؤه (تقبل `TR-ABC123` و`tr abc123` سواءً، وتقبل الطولين ٦ و١٠، وتطبّع
 * الهاتف بدالةٍ لا تُمنح للزائر بحال). وتكرارُ التحقق هنا يعني قاعدتَي تحقق
 * تنحرفان — وأولُ ضحاياه حجزٌ أطال رمزه بعد تصادم.
 */
export async function linkBooking(formData: FormData): Promise<void> {
  const locale = await resolveLocale();

  // ── (١) الخانق في الذاكرة — قبل قراءة البيئة وقبل تحليل المدخلات ─────────
  const clientKey = await requestClientKey();
  const verdict = checkPerMinute(`account-link:${clientKey}`, MAX_LINKS_PER_MINUTE);
  if (!verdict.ok) redirect(errorUrl(locale, "rate-limited"));

  // ── (٢) البوابة: البيئة والجلسة والمخطط في فحص واحد ─────────────────────
  const access = await accountAccess();
  if (!access.ok) redirect(errorUrl(locale, access.code === "auth" ? "auth" : access.code));

  // ── (٣) المدخلات: حضورٌ وسقف طول فقط ────────────────────────────────────
  const reference = field(formData, "reference", MAX_REFERENCE_LENGTH);
  const phone = field(formData, "phone", MAX_PHONE_LENGTH);
  if (reference === "" || phone === "") redirect(errorUrl(locale, "invalid-input"));

  // ── (٤) النداء الوحيد ───────────────────────────────────────────────────
  let outcome: AccountErrorCode | AccountNoticeCode = "save";

  try {
    const { data, error } = await access.supabase.rpc("link_booking_by_reference", {
      p_reference: reference,
      p_phone: phone,
      // يصل من الخادم ويبقى في التوقيع، والقاعدة **لا تستعمله مفتاحاً للدلو**
      // عمداً: خلطُه بمعرّف الحساب يعيد للمنادي توليدَ دلوٍ جديد في كل طلب.
      p_client_key: clientKey,
    });

    if (error) {
      const code = error.code ?? "";
      const hint = typeof error.hint === "string" ? error.hint.trim() : "";
      outcome = SCHEMA_CODES.has(code) ? "schema" : (LINK_HINTS[hint] ?? "save");
    } else {
      // 🔒 **صفر صفوف = لا نتيجة، وهذا عقد الدالة لا حالة حافّة.** لا ترفع
      // `not-found` عمداً: كل نداء PostgREST معاملة واحدة، والاستثناء يُرجعها
      // ومعها صفُّ عدّاد المحاولات ⇒ فالمحاولة الفاشلة لا تُحسب ويبقى تعدادُ
      // المراجع بلا خانق (D-48). الترجمة إلى `not-found` مكانها هنا.
      const rows = Array.isArray(data) ? data : data ? [data] : [];
      outcome = rows.length === 0 ? "not-found" : "linked";
    }
  } catch {
    outcome = "save";
  }

  // `redirect` ترمي، فهي **خارج** كتلة try دائماً (توثيق Next لهذه النسخة)
  if (outcome === "linked" || outcome === "already-linked") {
    // القائمة تُقرأ في هذه الصفحة وحدها، فالتفريغ عليها لا على الشجرة كلها
    revalidatePath(PAGE);
    redirect(noticeUrl(locale, outcome));
  }

  redirect(errorUrl(locale, outcome));
}

/* ------------------------------------------------------------------ */
/* (٢) افتح صفحة حجز من القائمة                                         */
/* ------------------------------------------------------------------ */

/**
 * يحوّل صاحب الجلسة إلى `/booking/[token]` لحجزٍ **في قائمته هو**.
 *
 * الخطوتان مشروحتان في ترويسة الملف: الإذن من `my_bookings()` بعميل الجلسة، ثم
 * — وبعدها فقط — قراءةُ التوكن بمفتاح الخدمة لصفٍّ واحد بمرجعه. والمطابقة
 * بتساوٍ نصّي تامّ مع ما أرجعته القاعدة نفسها لا بتطبيعٍ من عندنا: المرجع الذي
 * يصل هنا هو ما صيّرته الصفحة قبل قليل، وأي «تسامح» في المطابقة يوسّع ما يُقبل
 * بلا أن يوسّع ما يملكه صاحب الجلسة — أي يفتح فرقاً بلا فائدة.
 */
export async function openBooking(formData: FormData): Promise<void> {
  const locale = await resolveLocale();

  const reference = field(formData, "reference", MAX_REFERENCE_LENGTH);
  if (reference === "") redirect(errorUrl(locale, "open-denied"));

  // ── (١) الإذن: قائمة صاحب الجلسة وحدها ──────────────────────────────────
  const mine = await loadMyBookings();
  if (mine.state === "env") redirect(errorUrl(locale, "env"));
  if (mine.state === "anonymous") redirect(errorUrl(locale, "auth"));
  if (mine.state === "schema") redirect(errorUrl(locale, "schema"));
  if (mine.state === "failed") redirect(errorUrl(locale, "save"));

  const owned = mine.rows.some((row) => row.reference === reference);
  if (!owned) redirect(errorUrl(locale, "open-denied"));

  // ── (٢) العنوان: توكن صفٍّ واحد، بعد أن ثبت الإذن ────────────────────────
  const service = createServiceSupabase();
  if (!service) redirect(errorUrl(locale, "env"));

  let token: string | null = null;
  try {
    const { data, error } = await service
      .from("bookings")
      .select("public_token")
      .eq("reference", reference)
      .limit(1);

    if (!error) {
      const row = (data?.[0] ?? null) as { public_token?: unknown } | null;
      const value = typeof row?.public_token === "string" ? row.public_token.trim() : "";
      if (value !== "") token = value;
    }
  } catch {
    token = null;
  }

  if (token === null) redirect(errorUrl(locale, "open-missing"));

  redirect(localePath(locale, `/booking/${encodeURIComponent(token)}`));
}
