"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { localePath } from "@/lib/i18n-types";
import { resolveLocale } from "@/lib/i18n/content";
import { createServerSupabase } from "@/lib/supabase/server";
import { isSchemaMissing } from "@/lib/supabase/schema-errors";

import type { AccountErrorCode, AccountNoticeCode } from "./bookings/actions";
import { ACCOUNT_HOME_PATH, ACCOUNT_LOGIN_PATH, accountAccess } from "./_lib/session";

/**
 * ╔══════════════════════════════════════════════════════════════════════════╗
 * ║  إجراءات منطقة الحساب — الخروج، والربط بالتوكن بعد إتمام حجز             ║
 * ╚══════════════════════════════════════════════════════════════════════════╝
 *
 * الشكل القياسي (اتفاقية ٤): فحص البيئة والهوية ← تحقق ← نداء ← `redirect()` في
 * نهاية **كل** مسار، نجاحاً وفشلاً، والحالة تسافر رمزاً في `query string`.
 *
 * ── 🔒 ما لا يفعله هذا الملف: لا يلمس كلمة مرور واحدة ──────────────────────
 *
 * لا تسجيلَ دخول ولا إنشاءَ حساب هنا. تبادلُ بيانات الاعتماد يجري من المتصفح
 * إلى Supabase Auth مباشرةً (`login/_components/account-auth-form.tsx`) تماماً
 * كما يفعل `app/admin/login/page.tsx` منذ المرحلة ٥ — فالكلمة لا تمرّ بخادمنا
 * ولا بسجلاته ولا بحمولة أي إجراء، وSupabase Auth وحدها تملك بيانات الاعتماد.
 *
 * والخروج **يجري هنا** لأنه لا يحمل سرّاً: حذف كوكيز الجلسة يجب أن يقع على
 * الخادم في نفس الاستجابة، وإلا بقيت نافذةٌ يظل فيها الكوكي حياً بينما تبدو
 * الواجهة خارجة.
 *
 * ── وأين مدخل الربط الثاني؟ ───────────────────────────────────────────────
 *
 * «أضِف حجزاً سابقاً» (بالمرجع والهاتف) يعيش في `bookings/actions.ts` مع شاشته.
 * وهذا الملف يملك **المدخل الآخر وحده** — الربط بحيازة التوكن — لأنه لا يُنادى
 * من شاشة الحساب بل من صفحة الحجز `/booking/[token]` بعد الإتمام. ورموزُهما
 * **واحدة** بالاستيراد لا بالنسخ (`AccountErrorCode`)، فرسالةُ كل رمز مكتوبة
 * مرةً في `bookings/page.tsx` — ولو أضاف هذا الملف رمزاً من عنده لَما بُني.
 */

/** مسار شاشة «حجوزاتي» بلغة الزائر — العربية بلا بادئة والإنجليزية تحت `/en` */
const bookingsUrl = (locale: string, query: string) =>
  `${localePath(locale, ACCOUNT_HOME_PATH)}?${query}`;

const errorUrl = (locale: string, code: AccountErrorCode) =>
  bookingsUrl(locale, `error=${code}`);

const noticeUrl = (locale: string, code: AccountNoticeCode) =>
  bookingsUrl(locale, `notice=${code}`);

/** رفضُ بوابة الحساب ← رمزُ الشاشة. الثلاثة مفصولة ليقول كلٌّ سببه */
const DENIAL_CODE = {
  env: "env",
  auth: "auth",
  schema: "schema",
} as const satisfies Record<string, AccountErrorCode>;

/**
 * تلميحات `link_booking_by_token` كما قُرئت من التعريف الحيّ (D-58): ترفع
 * `forbidden` و`invalid-input` و`not-found` و`already-linked` — لا غير.
 *
 * ولا تُعرض رسالة Postgres الخام أبداً: نصّها عربيٌّ سليم في الهجرة، لكنه يكشف
 * أسماء الدوال لمن يقرؤه ويتغيّر بتغيّرها فتتغير الشاشة بلا علمنا. الرمز عقدٌ
 * ثابت بيننا وبين القاعدة، والجملة ملك الشاشة (نفس قرار `setTripCrew`).
 */
const TOKEN_HINTS: Record<string, AccountErrorCode | AccountNoticeCode> = {
  forbidden: "auth",
  "invalid-input": "invalid-input",
  "not-found": "not-found",
  "already-linked": "already-linked",
};

type RpcError = { message?: string; hint?: string; code?: string } | null;

/* ------------------------------------------------------------------ */
/* (١) الخروج                                                          */
/* ------------------------------------------------------------------ */

/**
 * خروج العميل — إلى صفحة الدخول لا إلى الصفحة الرئيسية.
 *
 * والوجهة قرار لا تفصيل: من ضغط «خروج» يريد تأكيداً أن الجلسة انتهت فعلاً،
 * والصفحةُ الرئيسية لا تقول ذلك بحرف. ورسالة `signed-out` تقول صراحةً إن
 * الحجوزات محفوظة — لأن «الحساب طبقةُ راحة لا بوابة» (العقد §٥)، وخروجٌ يبدو
 * محواً يخيف من لا يعرف ذلك.
 */
export async function signOutAccount(): Promise<void> {
  const locale = await resolveLocale();
  const supabase = await createServerSupabase();
  if (supabase) await supabase.auth.signOut();

  // الغلاف والصفحات كلها مبنية على الجلسة — تُفرَّغ ذاكرتها كاملة بعد الخروج
  revalidatePath("/", "layout");
  redirect(`${localePath(locale, ACCOUNT_LOGIN_PATH)}?done=signed-out`);
}

/* ------------------------------------------------------------------ */
/* (٢) «أضِف هذا الحجز إلى حسابي» — بحيازة التوكن                      */
/* ------------------------------------------------------------------ */

/**
 * يربط حجزاً بحساب صاحب الجلسة بحيازة توكنه العام — مسار ما بعد الإتمام.
 *
 * يُستدعى من `/booking/[token]` بالتوكن الذي تعرضه تلك الصفحة أصلاً، فيمرّره
 * الخادم **وسيطاً مربوطاً** (bound) لا حقلَ نموذجٍ مكشوفاً في HTML.
 *
 * 🔒 **ولا سقف على هذا المسار، ولا شيء فيه يُعدّ** — وهذا ليس سهواً: التوكن
 * سلسلة عشوائية طويلة، ومن يملكه يرى صفحة الحجز كاملةً أصلاً، فالربط **لا يكشف
 * حرفاً جديداً** وإنما يضيف سطراً إلى قائمة صاحبه. وتعدادُ التوكنات ليس مسار
 * هذه الدالة بل مسار `get_booking_by_token` القائم منذ 0007 بشرط الطول نفسه.
 *
 * 🔒 **والحساب من الجلسة لا من وسيط**: وسيطٌ يعني أن من يملك توكناً يربطه بحساب
 * غيره، فيرى الضحية في «حجوزاتي» رحلةً ليست له — أو أسوأ: يُبنى الولاء لاحقاً
 * على قائمة مدسوسة. والحارس داخل الدالة (`auth.uid()`) لا هنا، ولذلك النداء
 * بعميلٍ **مربوط بالجلسة**: مفتاح الخدمة بلا `auth.uid()` فيُرفض بـ`forbidden`
 * بالتصميم (مقيسٌ حياً، لا مستنتَجاً).
 */
export async function linkBookingByToken(token: string): Promise<void> {
  const locale = await resolveLocale();

  const access = await accountAccess();
  if (!access.ok) redirect(errorUrl(locale, DENIAL_CODE[access.code]));

  // شرط الطول نفسه المكتوب في `get_booking_by_token` و`link_booking_by_token`:
  // توكنٌ قصير ليس توكناً. وسقفٌ أعلى كي لا يُرسَل نصٌّ ضخم إلى القاعدة.
  const value = typeof token === "string" ? token.trim() : "";
  if (value.length < 32 || value.length > 256) {
    redirect(errorUrl(locale, "invalid-input"));
  }

  let notice: AccountNoticeCode | null = null;
  let error: AccountErrorCode = "save";

  try {
    const { data, error: rpcError } = await access.supabase.rpc("link_booking_by_token", {
      p_token: value,
    });

    if (rpcError) {
      const err = rpcError as RpcError;
      if (isSchemaMissing(err)) {
        error = "schema";
      } else {
        const hint = typeof err?.hint === "string" ? err.hint.trim() : "";
        const mapped = TOKEN_HINTS[hint];
        // `already-linked` رفضٌ في القاعدة و**نجاحٌ في نظر العميل** (نصّ العقد):
        // من طلب الإضافة وجد الحجز في قائمته، وهو ما أراد. فتُعرض خبراً لا خطأ.
        if (mapped === "already-linked") notice = mapped;
        else error = (mapped as AccountErrorCode | undefined) ?? "save";
      }
    } else {
      const row = (Array.isArray(data) ? data[0] : data) as { reference?: unknown } | null;
      // ⚠ صفر صفوف هنا **ليس** عقداً بخلاف `link_booking_by_reference`: هذه
      //    الدالة ترمي على «لا حجز بهذا الرابط» لأن لا عدّاد في مسارها يُرجَع
      //    مع الاستثناء (D-48). فالفراغ شذوذٌ يُعامَل فشلاً عاماً لا «لم يُعثر».
      if (typeof row?.reference === "string" && row.reference.trim() !== "") {
        notice = "linked";
      }
    }
  } catch {
    // شبكة أو بيئة — لا تفصيل للعميل، والرمز يقول له: أعد المحاولة لاحقاً
    error = "save";
  }

  // القائمة تُقرأ من `my_bookings()` في مكوّن خادمي — تُفرَّغ ذاكرتها بعد إضافة
  revalidatePath("/", "layout");

  // `redirect` ترمي، فهي **خارج** كتلة try دائماً (توثيق Next لهذه النسخة).
  // ولا مرجعَ يُكتب في الرابط: رقم الحجز يتسرب في سجلات الخادم وفي ترويسة
  // المُحيل إلى كل وسم قياس مركَّب في `app/layout.tsx` — نفس قرار `/track`.
  if (notice) redirect(noticeUrl(locale, notice));
  redirect(errorUrl(locale, error));
}
