"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { LogIn, TriangleAlert } from "lucide-react";

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
 * صفحة دخول الإدارة — مكوّن عميل يستدعي createBrowserSupabase():
 * عندما يرجع null (بيئة Supabase غير مضبوطة) يُعطَّل النموذج مع ملاحظة واضحة،
 * وإلا signInWithPassword ثم توجيه إلى /admin — والأخطاء تُعرض بالعربية.
 */

function toArabicError(message: string): string {
  const m = message.toLowerCase();
  if (m.includes("invalid login credentials")) {
    return "بيانات الدخول غير صحيحة — تحقق من البريد الإلكتروني وكلمة المرور.";
  }
  if (m.includes("email not confirmed")) {
    return "البريد الإلكتروني غير مُفعَّل بعد — أكّد بريدك ثم أعد المحاولة.";
  }
  if (m.includes("rate limit") || m.includes("too many")) {
    return "محاولات كثيرة متتالية — انتظر قليلاً ثم أعد المحاولة.";
  }
  if (m.includes("network") || m.includes("fetch")) {
    return "تعذر الاتصال بالخادم — تحقق من اتصالك بالإنترنت وحاول مجدداً.";
  }
  return "تعذر تسجيل الدخول — حاول مرة أخرى.";
}

export default function AdminLoginPage() {
  const router = useRouter();
  const supabase = React.useMemo(() => createBrowserSupabase(), []);

  const [email, setEmail] = React.useState("");
  const [password, setPassword] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);
  const [loading, setLoading] = React.useState(false);

  const dbMissing = supabase === null;
  const disabled = dbMissing || loading;

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!supabase) return;

    setLoading(true);
    setError(null);

    const { data, error: signInError } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (signInError) {
      setLoading(false);
      setError(toArabicError(signInError.message));
      return;
    }

    // الوجهة بحسب الدور: المتعهد إلى بورتاله، والمشرف إلى اللوحة.
    // بدون هذا يهبط المتعهد على /admin فيعيده الحارس، فتبدو الشاشة كأنها عطل.
    let destination = "/admin";
    if (data.user) {
      const { data: profile } = await supabase
        .from("profiles")
        .select("role")
        .eq("id", data.user.id)
        .maybeSingle();
      if (profile?.role === "subcontractor") destination = "/portal";
    }

    router.replace(destination);
    router.refresh();
  }

  return (
    <Card className="w-full max-w-sm">
      <CardHeader>
        <CardTitle>تسجيل الدخول</CardTitle>
        <CardDescription>ادخل إلى لوحة التحكم ببريدك الإلكتروني وكلمة المرور.</CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="flex flex-col gap-4" noValidate={dbMissing}>
          {dbMissing && (
            <div className="flex items-start gap-2 rounded-lg border border-amber-500/50 bg-amber-500/10 p-3 text-xs leading-relaxed text-amber-800 dark:text-amber-200">
              <TriangleAlert className="mt-0.5 size-4 shrink-0" />
              <span>
                قاعدة البيانات غير مربوطة بعد — يُفعَّل تسجيل الدخول بعد ضبط متغيرات
                Supabase (اتبع خطوات supabase/README.md).
              </span>
            </div>
          )}

          {error && (
            <div
              role="alert"
              className="rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-xs leading-relaxed text-destructive"
            >
              {error}
            </div>
          )}

          <div className="flex flex-col gap-2">
            <Label htmlFor="admin-email">البريد الإلكتروني</Label>
            <Input
              id="admin-email"
              type="email"
              dir="ltr"
              autoComplete="email"
              placeholder="admin@example.com"
              required
              disabled={disabled}
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </div>

          <div className="flex flex-col gap-2">
            <Label htmlFor="admin-password">كلمة المرور</Label>
            <Input
              id="admin-password"
              type="password"
              dir="ltr"
              autoComplete="current-password"
              required
              disabled={disabled}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </div>

          <Button type="submit" disabled={disabled} className="w-full">
            <LogIn className="size-4" />
            {loading ? "جارٍ الدخول..." : "دخول"}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
