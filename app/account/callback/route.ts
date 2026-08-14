import { NextResponse, type NextRequest } from "next/server";

import { createServerSupabase } from "@/lib/supabase/server";
import { ACCOUNT_HOME_PATH, ACCOUNT_LOGIN_PATH, safeNextPath } from "../_lib/session";

/**
 * ╔══════════════════════════════════════════════════════════════════════════╗
 * ║  مهبط روابط البريد — تبديل رمز PKCE بجلسة                                ║
 * ╚══════════════════════════════════════════════════════════════════════════╝
 *
 * لماذا يلزم مسارٌ خادميّ أصلاً؟ لأن `@supabase/ssr` يستعمل تدفّق **PKCE**: رابط
 * تأكيد البريد يمرّ بـ`…/auth/v1/verify` عند Supabase ثم يهبط عندنا ومعه
 * `?code=…` وحده — لا جلسة فيه. والتبديل يحتاج `code_verifier` المخزَّن في كوكي
 * كتبه المتصفح لحظة التسجيل، ويقرؤه عميلُ الخادم. فبلا هذا المسار يهبط العميل
 * على صفحةٍ لا تفهم الرمز، فيرى «سجّل دخولك» بعد أن أكّد بريده لتوّه.
 *
 * ولماذا Route Handler لا صفحة؟ لأن التبديل **يكتب كوكيز الجلسة**، والكتابة في
 * مكوّن خادمي تُبتلع صامتةً (انظر `catch` في `lib/supabase/server.ts`) — فتنجح
 * العملية ولا تُحفظ الجلسة. الـRoute Handler يملك الاستجابة فيكتب فيها فعلاً.
 *
 * 🔒 **ولا يُقرأ من الرابط شيءٌ يُوثَق به إلا الرمز:** `next` يمرّ على
 * `safeNextPath` فلا يصير هذا المسار تحويلاً مفتوحاً يوقّعه نطاقنا، وكل نتيجة
 * — نجاحاً وفشلاً — تنتهي بـ`redirect` برمزٍ له رسالة في `_lib/messages.ts`.
 */
export async function GET(request: NextRequest): Promise<Response> {
  const { searchParams, origin } = request.nextUrl;

  const to = (path: string, param: "done" | "error", code: string) =>
    NextResponse.redirect(new URL(`${path}?${param}=${code}`, origin));

  // (١) رفضٌ صريح من Supabase (رابط منتهٍ أو مستهلَك) — يصل في `error*`
  const providerError = searchParams.get("error") ?? searchParams.get("error_code");
  if (providerError) {
    const expired = /expired|used|otp_expired|access_denied/i.test(
      `${providerError} ${searchParams.get("error_description") ?? ""}`
    );
    return to(ACCOUNT_LOGIN_PATH, "error", expired ? "confirm-expired" : "confirm-failed");
  }

  const code = searchParams.get("code");
  if (!code) return to(ACCOUNT_LOGIN_PATH, "error", "confirm-failed");

  const supabase = await createServerSupabase();
  if (!supabase) return to(ACCOUNT_LOGIN_PATH, "error", "env");

  const { error } = await supabase.auth.exchangeCodeForSession(code);
  if (error) {
    // رمزٌ مستهلَك أو `code_verifier` مفقود (فُتح الرابط في متصفح آخر) — والحالتان
    // تُقالان بجملة واحدة: «اطلب رابطاً جديداً»، فالتفريق بينهما لا يغيّر ما يفعله.
    return to(ACCOUNT_LOGIN_PATH, "error", "confirm-expired");
  }

  const next = safeNextPath(searchParams.get("next"), ACCOUNT_HOME_PATH);
  return to(next, "done", "confirmed");
}
