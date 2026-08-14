/**
 * ╔══════════════════════════════════════════════════════════════════════════╗
 * ║  رموز صفحة الدخول والتسجيل ← رسائلها العربية                             ║
 * ╚══════════════════════════════════════════════════════════════════════════╝
 *
 * ⚠ **حدود هذا الملف مقصودة**: رموزُ شاشة «حجوزاتي» ليست هنا — تعيش مع شاشتها
 * في `app/account/bookings/actions.ts` (‏`AccountErrorCode`) ورسائلُها في
 * `bookings/page.tsx`. خريطتان لسطحين، ولا خريطة ثالثة تدّعي شمولهما: خريطةٌ
 * «جامعة» تُغري كل صفحة بقراءة رموز صفحةٍ أخرى، فيُعرض على شاشة الدخول رمزٌ
 * لا معنى له فيها.
 *
 * ── لماذا خريطة أصلاً لا نصوص في المكان ────────────────────────────────────
 *
 * لأن هذا المستودع **شحن رموزاً بلا رسائل أكثر من مرة**: الإجراء يعيد التوجيه
 * بـ`?error=x` والصفحة لا تعرف `x`، فيرى المستخدم شاشةً بلا سطر واحد يشرح ما
 * حدث — وهو أسوأ من رسالة عامة لأنه يبدو نجاحاً صامتاً. والخريطة هنا **مُفهرسة
 * بنوع الاتحاد** (`Record<AccountLoginCode, …>`)، فرمزٌ يُضاف بلا رسالة **لا
 * يُبنى أصلاً**: `tsc` يرفض الخريطة الناقصة.
 *
 * ولا `useState` لرسالةٍ في الصفحة الخادمية: الحالة تسافر في `query string`
 * (اتفاقية ٤)، فتعمل وJavaScript معطّل، والنتيجة رابط قابل للتحديث.
 */

/** نبرة البطاقة — تحكم اللون والأيقونة، ولا تُشتق من اسم الرمز */
export type AccountTone = "success" | "info" | "error";

/**
 * كل رمز يستطيع أي مسارٍ يهبط على `/account/login` أن يُنتجه:
 * الخروج (`actions.ts`)، ومهبط رابط البريد (`callback/route.ts`)، والنموذج
 * نفسه حين يحتاج التسجيلُ تأكيداً.
 */
export type AccountLoginCode =
  | "signed-out"
  | "check-email"
  | "confirmed"
  | "confirm-failed"
  | "confirm-expired"
  | "env";

export type AccountMessage = {
  tone: AccountTone;
  /** مفتاح الترجمة داخل مساحة `pages.account` */
  key: string;
  /** النص العربي حين لا ترجمة منشورة — وهو النص الفعلي اليوم */
  fallback: string;
};

/** كل رسالة تقول للعميل **ماذا يفعل الآن** لا ماذا حدث عندنا */
export const ACCOUNT_LOGIN_MESSAGES: Record<AccountLoginCode, AccountMessage> = {
  "signed-out": {
    tone: "success",
    key: "notices.signedOut",
    fallback: "تم تسجيل خروجك. حجوزاتك محفوظة كما هي، وتعود إليها بتسجيل الدخول.",
  },
  "check-email": {
    tone: "info",
    key: "notices.checkEmail",
    fallback:
      "أرسلنا رسالة تأكيد إلى بريدك. افتحها واضغط الرابط لتفعيل حسابك، وراجع مجلد البريد غير المرغوب إن لم تجدها.",
  },
  confirmed: {
    tone: "success",
    key: "notices.confirmed",
    fallback: "تم تأكيد بريدك وتفعيل حسابك — أهلاً بك.",
  },
  "confirm-failed": {
    tone: "error",
    key: "notices.confirmFailed",
    fallback: "تعذّر تأكيد الرابط. سجّل دخولك لطلب رسالة جديدة، أو تواصل معنا.",
  },
  "confirm-expired": {
    tone: "error",
    key: "notices.confirmExpired",
    fallback: "انتهت صلاحية رابط التأكيد أو استُخدم من قبل. سجّل دخولك لطلب رابط جديد.",
  },
  env: {
    tone: "error",
    key: "notices.env",
    fallback: "الخدمة غير متاحة الآن لسبب تقني عندنا. أعد المحاولة بعد قليل أو تواصل معنا.",
  },
};

type SearchParams = Record<string, string | string[] | undefined>;

const first = (value: string | string[] | undefined): string | undefined =>
  Array.isArray(value) ? value[0] : value;

/** الرمز إن كان معروفاً — وما ليس في الخريطة **لا يُعرض إطلاقاً** */
function readCode(value: unknown): AccountLoginCode | null {
  return typeof value === "string" && value in ACCOUNT_LOGIN_MESSAGES
    ? (value as AccountLoginCode)
    : null;
}

/**
 * يقرأ الرمز من `?done=` أو `?error=` — والخريطة واحدة للاثنين.
 *
 * لماذا مَعلمان لا واحد؟ لأن نبرة الرسالة من الخريطة لا من اسم المَعلم، فالفصل
 * للقراءة البشرية للرابط وحدها. ولأن الخريطة واحدة، **لا يوجد مسار يُنتج رمزاً
 * بلا رسالة** مهما اختار المنادي من المَعلمين.
 */
export function readLoginNotice(params: SearchParams): AccountLoginCode | null {
  return readCode(first(params.done)) ?? readCode(first(params.error));
}

/* ------------------------------------------------------------------------ */
/* أخطاء النموذج نفسه — على العميل لا في الرابط                              */
/* ------------------------------------------------------------------------ */

/**
 * 🔒 **لماذا هذه الرسائل ليست رموزاً في `query string` كسائر السطح؟**
 *
 * لأن تبادل بيانات الاعتماد لا يمرّ بخادمنا أصلاً: النموذج ينادي Supabase Auth
 * من المتصفح مباشرةً تماماً كما يفعل `app/admin/login/page.tsx` منذ المرحلة ٥ —
 * فكلمة المرور لا تصل إلى أي إجراء خادمي ولا إلى أي سجل من سجلاتنا. الثمن أن
 * رسالة الخطأ حالةٌ على العميل، والمكسب أن الخادم **لا يرى الكلمة إطلاقاً**.
 * والانضباط نفسه محفوظ: رمزٌ لكل سبب، وخريطة مُفهرسة بالنوع لا نصوص متناثرة.
 *
 * ⚠ **والخريطة تحمل مفتاح ترجمة لا نصاً خاماً** — كسائر خرائط هذا السطح. كانت
 * `Record<AuthErrorCode, string>` بنصوصٍ عربية تُعرض كما هي، فكان زائرُ `/en`
 * يرى نموذجاً إنجليزياً ورسالةَ خطئه عربية. وهو العيب نفسه الذي شُحنت به بطاقة
 * الطاقم: نصٌّ في المكان لا مفتاحٌ في `messages/*.json`. والاحتياطي يبقى عربياً
 * (القاعدة الرابعة في عقد المرحلة ٨: الترجمة الغائبة تعني العربية لا مفتاحاً خاماً).
 */
export type AuthErrorCode =
  | "invalid-credentials"
  | "email-not-confirmed"
  | "rate-limited"
  | "weak-password"
  | "invalid-email"
  | "signups-disabled"
  | "network"
  | "env"
  | "unknown";

export const AUTH_ERROR_TEXT: Record<AuthErrorCode, { key: string; fallback: string }> = {
  "invalid-credentials": {
    key: "authErrors.invalidCredentials",
    fallback: "بيانات الدخول غير صحيحة — تحقق من البريد الإلكتروني وكلمة المرور.",
  },
  "email-not-confirmed": {
    key: "authErrors.emailNotConfirmed",
    fallback: "لم يُفعَّل بريدك بعد — افتح رسالة التأكيد التي أرسلناها لك ثم أعد تسجيل الدخول.",
  },
  "rate-limited": {
    key: "authErrors.rateLimited",
    fallback: "محاولات كثيرة متتالية — انتظر قليلاً ثم أعد المحاولة.",
  },
  "weak-password": {
    key: "authErrors.weakPassword",
    fallback: "كلمة المرور قصيرة أو ضعيفة — اجعلها ٨ أحرف على الأقل وامزج الحروف والأرقام.",
  },
  "invalid-email": {
    key: "authErrors.invalidEmail",
    fallback: "صيغة البريد الإلكتروني غير صحيحة — راجعها وأعد المحاولة.",
  },
  "signups-disabled": {
    key: "authErrors.signupsDisabled",
    fallback: "التسجيل الذاتي مغلق حالياً. تواصل معنا وسنفتح لك حسابك.",
  },
  network: {
    key: "authErrors.network",
    fallback: "تعذر الاتصال بالخادم — تحقق من اتصالك بالإنترنت وحاول مجدداً.",
  },
  env: {
    key: "authErrors.env",
    fallback: "قاعدة البيانات غير مربوطة بعد — يُفعَّل الدخول والتسجيل بعد ضبط متغيرات Supabase.",
  },
  unknown: {
    key: "authErrors.unknown",
    fallback: "تعذّر إتمام العملية — حاول مرة أخرى.",
  },
};

/**
 * رسالة Supabase (إنجليزية) ← رمزنا.
 *
 * ⚠ الترتيب مقصود: «Email not confirmed» تحوي كلمة `email`، و«Invalid login
 * credentials» تحوي `invalid` — فالأخصّ يُفحص قبل الأعمّ، وإلا ابتلع النمطُ
 * العام حالةً لها رسالة أدق. (نفس درس ترتيب الأنماط في
 * `app/portal/requests/actions.ts`.)
 *
 * 🔒 **ولا نميّز «بريد مسجَّل سلفاً» إطلاقاً** — لا هنا ولا في النموذج: تمييزه
 * يحوّل نموذج التسجيل إلى **كاشف عضوية** يُسأل «هل لفلان حساب عندكم؟» بلا حدّ.
 * وSupabase نفسها تُخفيه حين تكون تأكيدات البريد مفعّلة، فنحن نُبقي الإخفاء في
 * الحالتين ونعرض دائماً «راجع بريدك».
 */
export function toAuthErrorCode(message: string | null | undefined): AuthErrorCode {
  const m = (message ?? "").toLowerCase();
  if (m.includes("email not confirmed") || m.includes("email_not_confirmed")) {
    return "email-not-confirmed";
  }
  if (m.includes("invalid login credentials") || m.includes("invalid_credentials")) {
    return "invalid-credentials";
  }
  if (m.includes("rate limit") || m.includes("too many") || m.includes("over_request")) {
    return "rate-limited";
  }
  if (m.includes("password") && (m.includes("short") || m.includes("weak") || m.includes("least"))) {
    return "weak-password";
  }
  if (
    m.includes("invalid email") ||
    m.includes("email_address_invalid") ||
    m.includes("unable to validate email")
  ) {
    return "invalid-email";
  }
  if (m.includes("signup") && m.includes("disabled")) return "signups-disabled";
  if (m.includes("network") || m.includes("fetch")) return "network";
  return "unknown";
}
