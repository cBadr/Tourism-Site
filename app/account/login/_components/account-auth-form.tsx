"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { LogIn, TriangleAlert, UserPlus } from "lucide-react";

import { createBrowserSupabase } from "@/lib/supabase/client";
import {
  AUTH_ERROR_TEXT,
  toAuthErrorCode,
  type AuthErrorCode,
} from "../../_lib/messages";

/**
 * ╔══════════════════════════════════════════════════════════════════════════╗
 * ║  نموذج دخول العميل وتسجيله — والكلمة لا تمرّ بخادمنا                     ║
 * ╚══════════════════════════════════════════════════════════════════════════╝
 *
 * 🔒 **لماذا مكوّن عميل ونداءٌ مباشر لا Server Action؟**
 *
 * لأن هذا هو النظام القائم في المستودع منذ المرحلة ٥: `app/admin/login/page.tsx`
 * ينادي `supabase.auth.signInWithPassword` من المتصفح، فكلمةُ المرور تذهب من
 * الجهاز إلى خادم المصادقة **بلا محطة عندنا** — لا في حمولة إجراء، ولا في سجل
 * خادم، ولا في أثر تدقيقي. وSupabase Auth وحدها تملك بيانات الاعتماد؛ ونحن لا
 * نلمسها ولا نخزّنها ولا نتحقق منها.
 *
 * والثمن مكتوبٌ صراحةً: هذا النموذج وحده في المشروع لا يعمل وJavaScript معطّل.
 * وبقيةُ السطح — الربط والخروج — إجراءاتٌ خادمية تعمل بلا JavaScript كالمعتاد.
 *
 * ⚠ **ولا حقلَ هاتفٍ في التسجيل. وهذا قرار أمني لا اختصار في النموذج.**
 * `handle_new_user` في القاعدة تنسخ `raw_user_meta_data ->> 'phone'` إلى
 * `profiles.phone` عند كل تسجيل، وتلك حمولةٌ يكتبها المسجِّل بنفسه — فيضع فيها
 * رقم عميلٍ يعرفه. فلو ربطنا الحجوزات بها لصارت **مفتاحاً لحجوزات غيره**
 * (العقد §٢). والربط عندنا يمرّ بـ`link_booking_by_reference` التي تطلب مرجع
 * الحجز وهاتفه معاً في نموذج مستقل، فحقلُ الهاتف هنا لا يفيد ميزةً واحدة
 * **ويُنشئ حقلاً يظنّه القارئ التالي مُثبَتاً**. فلا يُجمع أصلاً.
 *
 * ولا `console.log` واحد في هذا الملف: أي طباعة داخل معالج النموذج تصل أدوات
 * المطوّر وإضافات المتصفح، وقد تحمل ما في الحقول.
 */

type Mode = "signin" | "signup";

/** أدنى طول تقبله Supabase افتراضياً — فحصٌ محلي يوفّر ذهاباً وإياباً لا أكثر */
const MIN_PASSWORD = 8;

const fieldClass =
  "h-12 w-full rounded-2xl border border-input bg-background px-3 text-base outline-none transition-colors focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50";

type AccountAuthFormProps = {
  /** وجهة ما بعد الدخول — مُصفّاة على الخادم بـ`safeNextPath` قبل أن تصل هنا */
  next: string;
  /** رسالة «راجع بريدك» تُعرض على صفحة الدخول برمزها بعد تسجيلٍ يحتاج تأكيداً */
  checkEmailPath: string;
};

export function AccountAuthForm({ next, checkEmailPath }: AccountAuthFormProps) {
  const router = useRouter();
  const supabase = React.useMemo(() => createBrowserSupabase(), []);

  const [mode, setMode] = React.useState<Mode>("signin");
  const [email, setEmail] = React.useState("");
  const [password, setPassword] = React.useState("");
  const [fullName, setFullName] = React.useState("");
  const [error, setError] = React.useState<AuthErrorCode | null>(null);
  const [loading, setLoading] = React.useState(false);

  const dbMissing = supabase === null;
  const disabled = dbMissing || loading;
  const signup = mode === "signup";

  function switchMode(nextMode: Mode) {
    setMode(nextMode);
    setError(null);
    // الكلمة **لا تُنقل** بين الوضعين: من كتب كلمته للدخول ثم انتقل إلى إنشاء
    // حساب لا يقصد أن تصير كلمته الدائمة بالسهو، والعكس أخطر.
    setPassword("");
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!supabase) return;

    setLoading(true);
    setError(null);

    if (signup && password.length < MIN_PASSWORD) {
      setLoading(false);
      setError("weak-password");
      return;
    }

    if (signup) {
      const { data, error: signUpError } = await supabase.auth.signUp({
        email,
        password,
        options: {
          // 🔒 لا `phone` هنا بحال — انظر ترويسة الملف. والاسم لبيانات العرض
          //    وحدها، وهو من صاحبه فلا يُبنى عليه حكم.
          data: fullName.trim() === "" ? {} : { full_name: fullName.trim() },
          // مهبط رابط التأكيد — مسارٌ خادميّ يبدّل رمز PKCE بجلسة. و`origin`
          // من المتصفح لا من إعداد: نسخة Whitelabel على نطاق آخر تعمل بلا تعديل.
          emailRedirectTo: `${window.location.origin}/account/callback?next=${encodeURIComponent(next)}`,
        },
      });

      if (signUpError) {
        setLoading(false);
        setError(toAuthErrorCode(signUpError.message));
        return;
      }

      // 🔒 **ولا نفرّق بين «حساب جديد» و«بريد مسجَّل سلفاً»**: Supabase تُرجع في
      //    الحالتين مستخدماً بلا جلسة حين تكون التأكيدات مفعّلة، وتمييزُهما في
      //    الواجهة يحوّل النموذج إلى كاشف عضوية يُسأل «هل لفلان حساب عندكم؟».
      //    فالرسالة واحدة: راجع بريدك.
      if (!data.session) {
        router.replace(`${checkEmailPath}?done=check-email`);
        router.refresh();
        return;
      }

      // تأكيدات البريد مطفأة في المشروع ⇒ الجلسة جاهزة فوراً
      router.replace(next);
      router.refresh();
      return;
    }

    const { error: signInError } = await supabase.auth.signInWithPassword({ email, password });

    if (signInError) {
      setLoading(false);
      setError(toAuthErrorCode(signInError.message));
      return;
    }

    router.replace(next);
    router.refresh();
  }

  return (
    <div className="flex flex-col gap-5 rounded-3xl border border-border bg-card p-5 text-card-foreground sm:p-6">
      {/* مبدّل الوضع — زرّان لا رابطان: لا إعادة تحميل ولا فقدان ما كُتب */}
      <div
        role="tablist"
        aria-label="الدخول أو إنشاء حساب"
        className="grid grid-cols-2 gap-1 rounded-2xl bg-muted p-1"
      >
        {(
          [
            ["signin", "تسجيل الدخول"],
            ["signup", "حساب جديد"],
          ] as const
        ).map(([value, label]) => (
          <button
            key={value}
            type="button"
            role="tab"
            aria-selected={mode === value}
            onClick={() => switchMode(value)}
            className={`h-10 rounded-xl text-sm font-semibold transition-colors ${
              mode === value
                ? "bg-background text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      <form onSubmit={handleSubmit} className="flex flex-col gap-4" noValidate={dbMissing}>
        {dbMissing && (
          <div className="flex items-start gap-2 rounded-2xl border border-amber-500/50 bg-amber-500/10 p-3 text-xs leading-relaxed text-amber-800 dark:text-amber-200">
            <TriangleAlert className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
            <span>{AUTH_ERROR_TEXT.env}</span>
          </div>
        )}

        {error && (
          <div
            role="alert"
            className="rounded-2xl border border-destructive/30 bg-destructive/10 p-3 text-xs leading-relaxed text-destructive"
          >
            {AUTH_ERROR_TEXT[error]}
          </div>
        )}

        {signup && (
          <div className="flex flex-col gap-2">
            <label htmlFor="account-name" className="text-sm font-medium">
              الاسم <span className="text-muted-foreground">(اختياري)</span>
            </label>
            <input
              id="account-name"
              name="full_name"
              type="text"
              autoComplete="name"
              maxLength={80}
              disabled={disabled}
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              className={fieldClass}
            />
          </div>
        )}

        <div className="flex flex-col gap-2">
          <label htmlFor="account-email" className="text-sm font-medium">
            البريد الإلكتروني
          </label>
          <input
            id="account-email"
            name="email"
            type="email"
            dir="ltr"
            required
            autoComplete="email"
            disabled={disabled}
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className={`${fieldClass} text-start`}
          />
        </div>

        <div className="flex flex-col gap-2">
          <label htmlFor="account-password" className="text-sm font-medium">
            كلمة المرور
          </label>
          <input
            id="account-password"
            name="password"
            type="password"
            dir="ltr"
            required
            minLength={signup ? MIN_PASSWORD : undefined}
            autoComplete={signup ? "new-password" : "current-password"}
            disabled={disabled}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            aria-describedby={signup ? "account-password-help" : undefined}
            className={`${fieldClass} text-start`}
          />
          {signup && (
            <p id="account-password-help" className="text-xs leading-5 text-muted-foreground">
              {MIN_PASSWORD} أحرف على الأقل.
            </p>
          )}
        </div>

        <button
          type="submit"
          disabled={disabled}
          className="inline-flex h-12 w-full items-center justify-center gap-2 rounded-2xl bg-primary text-base font-semibold text-primary-foreground shadow-lg shadow-primary/25 transition-all hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50 disabled:opacity-60"
        >
          {signup ? (
            <UserPlus className="size-5" aria-hidden="true" />
          ) : (
            <LogIn className="size-5" aria-hidden="true" />
          )}
          {loading ? "جارٍ التنفيذ..." : signup ? "أنشئ حسابي" : "دخول"}
        </button>
      </form>
    </div>
  );
}
