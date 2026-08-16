import "server-only";

import { cache } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";

import { createServerSupabase } from "@/lib/supabase/server";
import { isSchemaMissing } from "@/lib/supabase/schema-errors";

/**
 * ╔══════════════════════════════════════════════════════════════════════════╗
 * ║  بوابة حساب العميل — مصدر الحقيقة الوحيد لهوية العميل داخل `/account`    ║
 * ╚══════════════════════════════════════════════════════════════════════════╝
 *
 * نظيرةُ `app/portal/_lib/session.ts` حرفاً بحرف في شكلها: بوابةٌ مُذاكَرة لكل
 * طلب يقرؤها الغلاف، وحارسٌ مستقل (`accountAccess`) يُستدعى في **بداية كل
 * server action** لأن الإجراءات نقاط POST مستقلة عن شجرة التصيير — الغلاف لا
 * يحميها.
 *
 * ── 🔒 (١) عميلٌ مربوط بجلسة العميل، لا مفتاح الخدمة. وهذا ليس تفضيلاً ──────
 *
 * الدوال الثلاث في `0044` تأخذ الهوية من `auth.uid()` داخلها، ومفتاح الخدمة
 * يعمل **بلا** `auth.uid()`. والقياس الحيّ (بمعاملة تُلغى) يقول:
 *
 * | النداء بمفتاح الخدمة | النتيجة المقيسة |
 * |---|---|
 * | `link_booking_by_token` | استثناء `hint = 'forbidden'` — واضح |
 * | `link_booking_by_reference` | استثناء `hint = 'forbidden'` — واضح |
 * | `my_bookings()` | **صفر صفوف بلا خطأ واحد** — صامت |
 *
 * والصفّ الثالث هو الفخّ: من «يبسّط» هذا السطح إلى `createServiceSupabase`
 * سيرى شاشةً فارغة لا رسالة خطأ، فيظنّها «لا حجوزات لهذا العميل» — أي ميزةً
 * معطوبة تمرّ من كل مراجعة تقرأ الشيفرة ولا تنادي الدالة.
 *
 * ── 🔒 (٢) ولا يُقرأ `profiles.phone` هنا ولا في أي ملف من هذا السطح ────────
 *
 * `handle_new_user` (قُرئت حيّة من `pg_get_functiondef` — D-58) تنسخ
 * `raw_user_meta_data ->> 'phone'` إلى `profiles.phone` عند كل تسجيل، وتلك
 * حمولةٌ **يكتبها المسجِّل بنفسه** بالمفتاح العلني — فيكتب فيها رقم عميلٍ يعرفه.
 * فالحقل «ما ادّعاه المستخدم» لا «هاتف العميل» (العقد §٢)، وأسلمُ معاملةٍ له
 * ألّا يُقرأ أصلاً: قائمة الأعمدة أدناه **لا تذكره**، فلا يصل هذه الطبقة كي
 * يُخطئ أحدٌ في تفسيره. والربط لا يحتاجه أصلاً — يمرّ بـ`find_booking_by_reference`
 * التي تطلب الهاتف من صاحبه في النموذج مع مرجع الحجز (العقد §٥).
 *
 * ── (٣) ولا حارس دور ─────────────────────────────────────────────────────
 *
 * `/account` سطحٌ لكل صاحب جلسة: مشرفٌ أو متعهدٌ يفتحه فلا يرى إلا ما ربطه
 * **هو** بحسابه، ولا تُوجد في الحمولة تكلفةٌ ولا هامشٌ ولا هويةُ متعهد أصلاً
 * (العقد §١). والسؤال الحاكم — «ماذا يرى متعهدٌ مسجَّل دخول هنا؟» — جوابه:
 * قائمته هو، فارغةً ما لم يربط. وربطُه بمرجعٍ يستلزم مرجعَ الحجز وهاتفَ صاحبه
 * معاً، والمرجع **سُحب من حمولات البورتال في 0028** لهذا السبب بعينه.
 */

/** صفحة الدخول والتسجيل — وجهة كل مسار بلا جلسة */
export const ACCOUNT_LOGIN_PATH = "/account/login";

/** أول صفحة يراها العميل بعد الدخول */
export const ACCOUNT_HOME_PATH = "/account/bookings";

/** ما يعرفه السطح عن صاحب الجلسة — ولا حرف زيادة */
export type AccountUser = {
  id: string;
  /** بريد الحساب — مُثبَتٌ بالدخول نفسه، بخلاف الهاتف */
  email: string | null;
  /** الاسم كما كتبه صاحبه وقت التسجيل — للتحية وحدها، لا للمطابقة */
  displayName: string | null;
};

/**
 * حالات البوابة:
 * - `env`: بيئة Supabase غير مضبوطة (تطوير محلي قبل ربط القاعدة).
 * - `anonymous`: لا جلسة — الغلاف يعيد التوجيه إلى الدخول.
 * - `schema`: جداول ١٢ب غير منفَّذة (هجرة `0044`) — حالة عرض لا حالة فشل.
 * - `active`: جلسة صالحة ولها صفٌّ في `profiles`.
 */
export type AccountGate =
  | { state: "env" }
  | { state: "anonymous" }
  | { state: "schema" }
  | { state: "active"; user: AccountUser };

export const hasSupabaseEnv = () =>
  Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);

/**
 * 🔒 الأعمدة المقروءة من `profiles` — **`phone` غائب عمداً** (البند ٢ أعلاه).
 * و`role` غائبٌ كذلك: السطح لا يتفرّع على الدور، وحقلٌ يُقرأ بلا مستهلك يصير
 * غداً حارساً يظنّه أحدهم مضبوطاً.
 */
const PROFILE_COLUMNS = "id, full_name";

const asText = (value: unknown): string | null =>
  typeof value === "string" && value.trim() !== "" ? value.trim() : null;

/**
 * حلّ هوية صاحب الجلسة. لا تُعيد التوجيه بنفسها (تبقى دالة نقية قابلة
 * للمذاكرة) — الغلاف هو من يترجم `anonymous` إلى redirect.
 *
 * ⚠ `getUser()` لا `getSession()`: الأولى تتحقق من التوكن مع خادم المصادقة،
 * والثانية تصدّق ما في الكوكي كما هو. نفس ما يفعله `proxy.ts` في حارس اللوحة
 * ونفس ما يفعله البورتال.
 */
export const readAccountGate = cache(async (): Promise<AccountGate> => {
  const supabase = await createServerSupabase();
  if (!supabase) return { state: "env" };

  const { data: auth } = await supabase.auth.getUser();
  const user = auth?.user ?? null;
  if (!user) return { state: "anonymous" };

  // وجودُ الصف شرطٌ حقيقي لا تجميل: الدوال الثلاث ترفع `forbidden` حين لا
  // يجد `auth.uid()` صفاً في `profiles` — فلو سقط مُشغّل `handle_new_user`
  // يوماً، رأى العميل رفضاً غامضاً في كل إجراء بدل حالةٍ مفهومة هنا.
  const res = await supabase.from("profiles").select(PROFILE_COLUMNS).eq("id", user.id).limit(1);

  if (res.error) {
    if (isSchemaMissing(res.error)) return { state: "schema" };
    // خطأ صلاحيات أو سياسة = لا هوية من منظور هذا السطح
    return { state: "anonymous" };
  }

  const row = (res.data?.[0] ?? null) as Record<string, unknown> | null;
  if (!row) return { state: "anonymous" };

  return {
    state: "active",
    user: {
      id: user.id,
      email: asText(user.email),
      // الاسم من `profiles` أولاً (يكتبه المُشغّل من الحمولة)، ثم من بيانات
      // المصادقة — والاثنان من صاحبهما، فالسقوط بينهما بلا أثر أمني.
      displayName:
        asText(row.full_name) ??
        asText((user.user_metadata as Record<string, unknown> | null)?.full_name),
    },
  };
});

/** رموز منع الوصول — كلها لها رسائل في `_lib/messages.ts` */
export type AccountDenial = "env" | "auth" | "schema";

export type AccountAccess =
  | { ok: true; supabase: SupabaseClient; user: AccountUser }
  | { ok: false; code: AccountDenial };

/**
 * حارس الـ server actions: يُستدعى في **بداية كل إجراء** قبل أي كتابة.
 *
 * وهو ليس حارساً أمنياً — الحارس الحقيقي `auth.uid()` **داخل** دوال `0044`،
 * ولا يمكن الالتفاف عليه من هنا بحال. غرضه أن يتحوّل الرفض إلى **رسالة عربية
 * مفهومة** بدل استثناء Postgres خام، وأن يُسلّم العميلَ المربوط بالجلسة الصحيح
 * إلى الإجراء فلا يختار أحدٌ مفتاح الخدمة سهواً.
 */
export async function accountAccess(): Promise<AccountAccess> {
  const gate = await readAccountGate();
  if (gate.state === "env") return { ok: false, code: "env" };
  if (gate.state === "schema") return { ok: false, code: "schema" };
  if (gate.state !== "active") return { ok: false, code: "auth" };

  const supabase = await createServerSupabase();
  if (!supabase) return { ok: false, code: "env" };
  return { ok: true, supabase, user: gate.user };
}

/**
 * وجهةٌ داخلية آمنة من مَعلم `next`.
 *
 * 🔒 المشكلة التي يمنعها: `?next=https://evil.example` على صفحة الدخول يصنع
 * **تحويلاً مفتوحاً** يوقّعه نطاقنا — يصل الضحيةَ رابطٌ من موقعنا فينتهي على
 * صفحة دخولٍ مزوّرة. والفحص يرفض كل ما ليس مساراً داخلياً صريحاً:
 *   • يبدأ بشرطة مائلة واحدة (`//host` عنوانٌ بروتوكولُه ضمنيّ — مرفوض)
 *   • بلا شرطة خلفية `\` (المتصفحات تعاملها معاملة `/` فتلتفّ على الفحص الساذج)
 *   • بلا `:` قبل أول `/` — لا `javascript:` ولا `data:`
 * وما لم يمرّ الفحص يعود العميل إلى صفحته الافتراضية لا إلى مكانٍ يختاره غيره.
 */
export function safeNextPath(value: unknown, fallback: string = ACCOUNT_HOME_PATH): string {
  if (typeof value !== "string") return fallback;
  const raw = value.trim();
  if (raw === "" || raw.length > 512) return fallback;
  if (!raw.startsWith("/")) return fallback;
  if (raw.startsWith("//")) return fallback;
  if (raw.includes("\\")) return fallback;
  return raw;
}
