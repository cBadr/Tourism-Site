"use server";

import { redirect } from "next/navigation";
import { localePath } from "@/lib/i18n-types";
import { resolveLocale } from "@/lib/i18n/content";
import { createServiceSupabase } from "@/lib/supabase/admin";
import { checkPerMinute } from "@/lib/discounts/rate-limit";
import { requestClientKey } from "@/lib/lookup/client-key";
import type { BookingLookupErrorCode } from "@/lib/booking-types";

/**
 * الإجراء الخادمي لنموذج «تابع حجزك» — الملاحظة ١ في ملحق ٢ من الرؤية.
 *
 * الشكل القياسي لأي Server Action هنا (اتفاقية ٤): فحص البيئة ← تحقق ← كتابة
 * بفحص صفر صفوف ← `redirect()` في نهاية **كل** مسار. والحالة تسافر في رمز
 * query string لا في ذاكرة عميل — فالنموذج يعمل وJavaScript معطّل، والنتيجة
 * رابط قابل للتحديث.
 *
 * ── ثلاث حراسات، بترتيب التنفيذ ────────────────────────────────────────────
 *
 * (١) **خانق في الذاكرة قبل أي عمل** — نفس ترتيب `app/api/discount/verify`:
 *     أرخص فحص أولاً، قبل قراءة البيئة وقبل تحليل المدخلات. غرضه حماية **نداء
 *     القاعدة نفسه**: الخانق الدائم يعيش في `booking_lookup_attempts` داخل
 *     `find_booking_by_reference`، لكن كل رفض منه يكلّف ذهاباً وإياباً. فالطبقة
 *     الأولى تقصّ الفيضان قبل أن يصل، والثانية — الدائمة — هي الملزِمة.
 *     وحدوده مكتوبة بصدق في `lib/discounts/rate-limit.ts`: خريطة في ذاكرة
 *     النسخة الواحدة، تُصفَّر مع كل نشر، ولا تُشارك بين نسخ الخادم.
 *
 * (٢) **لا عنوان IP يصل القاعدة إطلاقاً.** البصمة تُحسب هنا:
 *     `sha256(ip + ":" + salt)` وأول ٣٢ خانة ست عشرية منها، وهي وحدها ما يُمرَّر
 *     في `p_client_key`. الجدول يعدّ المحاولات ولا يعرف صاحبها، والصفوف تُكنس
 *     بعد ساعة. والملح من البيئة فلا تكون البصمة قابلة للعكس بجدول قوس قزح على
 *     فضاء عناوين IPv4 كله (٤ مليارات احتمال — قابلة للتعداد بلا ملح).
 *
 * (٣) **مفتاح الخدمة لا جلسة الزائر — ولا مسار غيره.** الدالة **غير ممنوحة**
 *     لـ `anon` ولا لـ `authenticated`، وفحصٌ في الهجرة يُسقطها إن مُنحت يوماً.
 *     والسبب أن `p_client_key` بصمةٌ يحسبها هذا الملف: فلو نودِيت الدالة مباشرةً
 *     من المتصفح لاختار المنادي بصمة جديدة في كل طلب، فصار لكل محاولة دلوٌ
 *     عدّاده ١ **ولا يبلغ الحدّ أبداً** — أي خانق بالاسم فقط. من «يبسّط» هذا
 *     الملف إلى عميل الزائر يمحو الخانق بلا أن يكسر شيئاً ظاهراً.
 *
 * ── ما لا يفعله هذا الملف ─────────────────────────────────────────────────
 * لا يقرأ الحجز ولا يعرض منه حرفاً: `find_booking_by_reference` ترجع **التوكن
 * وحده**، وهذا الملف يحوّل إليه ثم ينتهي. من عرف المرجع والهاتف معاً استحقّ ما
 * يستحقه حاملُ الرابط الذي وصله يوم الحجز — لا أكثر.
 *
 * ولا `revalidatePath` هنا: الإجراء لا يغيّر شيئاً معروضاً (صف العدّاد لا
 * يُقرأ في أي صفحة)، وإبطال الشجرة بلا سبب كلفةٌ على كل زائر.
 */

/**
 * سقف الطبقة الأولى — طلباً في الدقيقة لكل بصمة.
 *
 * فوق ما يسمح به الخانق الدائم (‏٨ محاولات كل ربع ساعة) عمداً: من قصده أن
 * **يحكم** هو ذاك، وهذا لا يعدو أن يقصّ الفيضان الذي يستنزف نداءات القاعدة.
 * لو ساويناه بالحدّ الدائم لصار إنسانٌ يعيد المحاولة بعد انقضاء نافذة القاعدة
 * محجوباً بحدٍّ ثانٍ لا يعرف عنه شيئاً.
 */
const MAX_ATTEMPTS_PER_MINUTE = 10;

/** الأرقام العربية الهندية تُقبل في الحقول وتُحوَّل قبل الإرسال (اتفاقية ١) */
const toLatinDigits = (s: string) =>
  s.replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 0x0660));

/** أطوال دفاعية — حارس حجم لا تحقق: التحقق الحقيقي في القاعدة وحدها */
const MAX_REFERENCE_LENGTH = 32;
const MAX_PHONE_LENGTH = 32;

/**
 * الدالة غائبة أو الجدول غائب أو الصلاحية غير ممنوحة ⇒ **البيئة غير جاهزة**
 * (هجرة 0027 غير مطبَّقة) لا خطأ من الزائر. نفس التصنيف في `lib/payments/intents.ts`.
 */
const NOT_MIGRATED = new Set(["42883", "PGRST202", "42P01", "PGRST205", "42501"]);

/** رموز التلميح التي ترفعها `find_booking_by_reference` بـ `using hint = '…'` */
const KNOWN_HINTS: ReadonlySet<string> = new Set<BookingLookupErrorCode>([
  "invalid-input",
  "not-found",
  "rate-limited",
]);

/** مسار الصفحة بلغة الزائر — العربية بلا بادئة والإنجليزية تحت `/en` */
function trackUrl(locale: string, error?: BookingLookupErrorCode): string {
  const base = localePath(locale, "/track");
  return error ? `${base}?error=${error}` : base;
}

/**
 * ⚠ **البصمة انتقلت ولم تتغيّر.** كانت `requestIp` و`fingerprint` مكتوبتين هنا
 * حين كان هذا السطح وحده يفوّض إلى `find_booking_by_reference`. ثم صار له ثانٍ
 * («أضِف حجزاً سابقاً» في `/account/bookings`)، ونسخُ **ترتيبِ ملحٍ أمنيّ** مرتين
 * يعني نسختين تنحرفان يوم يُصحَّح الأصل — فالوحدة المشتركة `lib/lookup/client-key.ts`
 * تحمل الجسمين بتعليقيهما كما هما، وهذا الملف يناديها (القاعدة ١٢: فوِّض ولا تستنسخ).
 */

/** نص من الحقل: تحويل الخانات ثم تشذيب ثم سقف طول */
function field(formData: FormData, name: string, maxLength: number): string {
  const raw = formData.get(name);
  if (typeof raw !== "string") return "";
  return toLatinDigits(raw).replace(/\s+/g, " ").trim().slice(0, maxLength);
}

/**
 * يبحث عن حجز بمرجعه وهاتف صاحبه، ويحوّل إلى صفحة متابعته.
 *
 * لا يخبر الزائر **أي** الحقلين أخطأ: من يعرف أن الهاتف صحيح والمرجع خطأ يملك
 * نصف الجواب، وقد صار البحث عنده تعداداً على فضاء المرجع وحده (‏٣١⁶ ≈ ٢٩٫٧ بت).
 * رسالة واحدة لكليهما — وهذا قرار أمني لا اختصار في النص.
 */
export async function findBooking(formData: FormData): Promise<void> {
  const locale = await resolveLocale();

  // ── (١) الخانق في الذاكرة — قبل قراءة البيئة وقبل تحليل المدخلات ─────────
  const clientKey = await requestClientKey();
  const verdict = checkPerMinute(`track:${clientKey}`, MAX_ATTEMPTS_PER_MINUTE);
  if (!verdict.ok) redirect(trackUrl(locale, "rate-limited"));

  // ── (٢) البيئة — بلا متغيراتها يرجع العميل null والاستدعاء عليه ينفجر ────
  const supabase = createServiceSupabase();
  if (!supabase) redirect(trackUrl(locale, "db-unavailable"));

  // ── (٣) المدخلات: حضورٌ وسقف طول فقط ────────────────────────────────────
  // التحقق الفعلي (شكل المرجع، تطبيع الهاتف، طوله) داخل الدالة في القاعدة —
  // تكراره هنا يعني قاعدتَي تحقق تنحرفان: المرجع يقبل الطولين ٦ و١٠ مثلاً،
  // وفرضُ `{6}` في الواجهة كان سيقفل الباب على حجز أطال رمزه بعد تصادم.
  const reference = field(formData, "reference", MAX_REFERENCE_LENGTH);
  const phone = field(formData, "phone", MAX_PHONE_LENGTH);
  if (reference === "" || phone === "") redirect(trackUrl(locale, "invalid-input"));

  // ── (٤) النداء الوحيد — والتوكن وحده ما يعود منه ────────────────────────
  let token: string | null = null;
  let code: BookingLookupErrorCode = "db-unavailable";

  try {
    const { data, error } = await supabase.rpc("find_booking_by_reference", {
      p_reference: reference,
      p_phone: phone,
      p_client_key: clientKey,
    });

    if (error) {
      const hint = typeof error.hint === "string" ? error.hint.trim() : "";
      code = NOT_MIGRATED.has(error.code ?? "")
        ? "db-unavailable"
        : KNOWN_HINTS.has(hint)
          ? (hint as BookingLookupErrorCode)
          : "db-unavailable";
    } else {
      // دالة تُرجع جدولاً ⇒ مصفوفة صفوف؛ والحارس يحمي من تغيّر الشكل مستقبلاً
      const row = (Array.isArray(data) ? data[0] : data) as
        | { public_token?: unknown }
        | null
        | undefined;
      const value = typeof row?.public_token === "string" ? row.public_token.trim() : "";
      // 🔒 **صفر صفوف = لا نتيجة، وهذا عقد الدالة لا حالة حافّة.** الدالة لا
      // ترفع `not-found` عمداً: كل نداء PostgREST معاملة واحدة، والاستثناء
      // يُرجعها ومعها صفُّ عدّاد المحاولات ⇒ فالمحاولة الفاشلة لا تُحسب ويبقى
      // تعدادُ المراجع بلا خانق. الترجمة إلى `not-found` مكانها هنا.
      if (value === "") code = "not-found";
      else token = value;
    }
  } catch {
    // شبكة أو بيئة — لا نُظهر تفصيلاً، والرمز يقول للزائر: أعد المحاولة لاحقاً
    code = "db-unavailable";
  }

  // `redirect` ترمي، فهي **خارج** كتلة try دائماً (توثيق Next لهذه النسخة)
  if (token === null) redirect(trackUrl(locale, code));

  redirect(localePath(locale, `/booking/${encodeURIComponent(token)}`));
}
