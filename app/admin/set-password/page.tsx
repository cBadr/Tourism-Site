"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { KeyRound, TriangleAlert } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { createBrowserSupabase } from "@/lib/supabase/client";

/**
 * تعيين كلمة المرور — يصلها المستخدم من رابط دعوة/استعادة في بريده.
 * تتعامل مع صيغ Supabase الثلاث للروابط: token_hash+type (PKCE)،
 * أو ?code= (تبادل جلسة)، أو توكنات في الـ hash تلتقطها المكتبة تلقائياً.
 * لا تمر كلمة المرور بأي وسيط — المستخدم يحددها بنفسه هنا مباشرة.
 */

type Phase = "checking" | "ready" | "no-session" | "saving";

export default function SetPasswordPage() {
  const router = useRouter();
  const supabase = React.useMemo(() => createBrowserSupabase(), []);

  const [phase, setPhase] = React.useState<Phase>("checking");
  const [password, setPassword] = React.useState("");
  const [confirm, setConfirm] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);
  const [linkError, setLinkError] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (!supabase) {
      setPhase("no-session");
      return;
    }
    let cancelled = false;

    (async () => {
      const url = new URL(window.location.href);
      const hash = new URLSearchParams(url.hash.replace(/^#/, ""));

      // خطأ صريح مُعاد من Supabase في الرابط (توكن مستهلك/منتهٍ)
      const errCode = hash.get("error_code") ?? url.searchParams.get("error_code");
      if (errCode) {
        if (!cancelled) {
          setLinkError(
            errCode === "otp_expired"
              ? "هذا الرابط استُهلك أو انتهت صلاحيته — غالباً فتحه فلتر الحماية في بريدك تلقائياً قبلك. اطلب رابطاً جديداً."
              : `تعذر التحقق من الرابط (${errCode}) — اطلب رابطاً جديداً.`
          );
          setPhase("no-session");
        }
        return;
      }

      const tokenHash = url.searchParams.get("token_hash");
      const type = url.searchParams.get("type");
      const code = url.searchParams.get("code");
      const accessToken = hash.get("access_token");
      const refreshToken = hash.get("refresh_token");

      try {
        if (accessToken && refreshToken) {
          // توكنات مباشرة في الـ hash (صيغة روابط /auth/v1/verify) — الأوثق
          const { error: e } = await supabase.auth.setSession({
            access_token: accessToken,
            refresh_token: refreshToken,
          });
          if (e) throw e;
          window.history.replaceState(null, "", url.pathname);
        } else if (tokenHash && (type === "invite" || type === "recovery" || type === "email")) {
          const { error: e } = await supabase.auth.verifyOtp({
            type: type === "email" ? "email" : type,
            token_hash: tokenHash,
          });
          if (e) throw e;
        } else if (code) {
          const { error: e } = await supabase.auth.exchangeCodeForSession(code);
          if (e) throw e;
        }
      } catch {
        // نسقط لفحص الجلسة — قد تكون المكتبة التقطت الجلسة تلقائياً بالفعل
      }

      const { data } = await supabase.auth.getSession();
      if (cancelled) return;
      setPhase(data.session ? "ready" : "no-session");
    })();

    return () => {
      cancelled = true;
    };
  }, [supabase]);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!supabase) return;
    setError(null);

    if (password.length < 8) {
      setError("كلمة المرور يجب ألا تقل عن ٨ أحرف.");
      return;
    }
    if (password !== confirm) {
      setError("الكلمتان غير متطابقتين.");
      return;
    }

    setPhase("saving");
    const { data: updated, error: e } = await supabase.auth.updateUser({ password });
    if (e) {
      setPhase("ready");
      setError(
        e.message.toLowerCase().includes("different from the old")
          ? "كلمة المرور الجديدة مطابقة للقديمة — اختر كلمة مختلفة."
          : "تعذر حفظ كلمة المرور — حاول مرة أخرى."
      );
      return;
    }

    // الوجهة بحسب الدور — المتعهد الذي يقبل دعوته يبدأ من بورتاله مباشرة
    let destination = "/admin";
    if (updated?.user) {
      const { data: profile } = await supabase
        .from("profiles")
        .select("role")
        .eq("id", updated.user.id)
        .maybeSingle();
      if (profile?.role === "subcontractor") destination = "/portal";
    }

    router.replace(destination);
    router.refresh();
  }

  return (
    <Card className="w-full max-w-sm">
      <CardHeader>
        <CardTitle>تعيين كلمة المرور</CardTitle>
        <CardDescription>حدد كلمة مرور حسابك لدخول لوحة التحكم.</CardDescription>
      </CardHeader>
      <CardContent>
        {phase === "checking" && (
          <p className="py-4 text-center text-sm text-muted-foreground">جارٍ التحقق من الرابط...</p>
        )}

        {phase === "no-session" && (
          <div className="flex items-start gap-2 rounded-lg border border-amber-500/50 bg-amber-500/10 p-3 text-xs leading-relaxed text-amber-800 dark:text-amber-200">
            <TriangleAlert className="mt-0.5 size-4 shrink-0" />
            <span>
              {linkError ??
                "الرابط غير صالح أو منتهي الصلاحية. افتح رابط الدعوة من بريدك الإلكتروني مرة أخرى، أو اطلب رابطاً جديداً."}
            </span>
          </div>
        )}

        {(phase === "ready" || phase === "saving") && (
          <form onSubmit={handleSubmit} className="flex flex-col gap-4">
            {error && (
              <div
                role="alert"
                className="rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-xs leading-relaxed text-destructive"
              >
                {error}
              </div>
            )}

            <div className="flex flex-col gap-2">
              <Label htmlFor="new-password">كلمة المرور الجديدة</Label>
              <Input
                id="new-password"
                type="password"
                dir="ltr"
                autoComplete="new-password"
                required
                minLength={8}
                disabled={phase === "saving"}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </div>

            <div className="flex flex-col gap-2">
              <Label htmlFor="confirm-password">تأكيد كلمة المرور</Label>
              <Input
                id="confirm-password"
                type="password"
                dir="ltr"
                autoComplete="new-password"
                required
                minLength={8}
                disabled={phase === "saving"}
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
              />
            </div>

            <Button type="submit" disabled={phase === "saving"} className="w-full">
              <KeyRound className="size-4" />
              {phase === "saving" ? "جارٍ الحفظ..." : "حفظ ودخول اللوحة"}
            </Button>
          </form>
        )}
      </CardContent>
    </Card>
  );
}
