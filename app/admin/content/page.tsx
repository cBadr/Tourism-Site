import Link from "next/link";
import { Eye, EyeOff, Plus } from "lucide-react";

import { HelpTip } from "@/components/shared/HelpTip";
import { PagePulse } from "@/components/stats/page-pulse";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { readPagePulse } from "@/lib/stats/pulse";
import { createServerSupabase } from "@/lib/supabase/server";
import type { PageWithSections } from "@/lib/content-types";
import {
  COMMON_ERROR_MESSAGES,
  KIND_LABELS,
  KIND_ORDER,
  publicPath,
  sectionCountLabel,
  StatusBanners,
} from "./_components/fields";
import { togglePublished } from "./[id]/actions";
import { getAdminContent } from "./loader";

export const metadata = { title: "المحتوى" };

const hasSupabaseEnv = () =>
  Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);

const KIND_DESCRIPTIONS: Record<string, string> = {
  home: "صفحة الموقع الأولى — أقسامها تُرتّب وتُحرَّر من هنا.",
  service: "الخدمات الست — لكل خدمة صفحة كاملة ببنية بيع وأسئلة شائعة.",
  corridor: "صفحات سيو للنقل بين مدينتين — أقوى تكتيك لتصدر نتائج البحث.",
  static: "صفحات عامة مثل «من نحن» والشروط.",
};

function PageRow({ page, readOnly }: { page: PageWithSections; readOnly: boolean }) {
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-2 py-3 first:pt-0 last:pb-0">
      <div className="min-w-0 flex-1 basis-52">
        <Link
          href={`/admin/content/${page.id}`}
          className="font-medium transition-colors hover:text-primary hover:underline"
        >
          {page.title}
        </Link>
        <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-muted-foreground">
          <code dir="ltr">{publicPath(page)}</code>
          <span>·</span>
          <span>{sectionCountLabel(page.sections.length)}</span>
        </div>
      </div>

      <Badge variant={page.published ? "default" : "secondary"}>
        {page.published ? "منشورة" : "مسودة"}
      </Badge>

      <form action={togglePublished.bind(null, page.id)} className="contents">
        <Button
          type="submit"
          variant="ghost"
          size="sm"
          disabled={readOnly}
          title={
            page.published
              ? "إخفاء الصفحة من الموقع العام (تصبح مسودة)"
              : "نشر الصفحة في الموقع العام"
          }
        >
          {page.published ? <EyeOff /> : <Eye />}
          {page.published ? "إلغاء النشر" : "نشر"}
        </Button>
      </form>

      <Link
        href={`/admin/content/${page.id}`}
        className={cn(buttonVariants({ variant: "outline", size: "sm" }))}
      >
        تحرير
      </Link>
    </div>
  );
}

export default async function ContentListPage({ searchParams }: PageProps<"/admin/content">) {
  // العميل يُنشأ أولاً لأن `readPagePulse` يحتاجه، وإنشاؤه لا يلمس الشبكة —
  // فتبقى قراءة النبض متوازية مع قراءة الصفحات لا بعدها.
  const supabase = await createServerSupabase();
  const [params, { pages, readOnly }, pulse] = await Promise.all([
    searchParams,
    getAdminContent(),
    readPagePulse(supabase, "/admin/content"),
  ]);
  const wired = hasSupabaseEnv();
  const saved = params.saved === "1";
  const error = typeof params.error === "string" ? params.error : null;

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="font-heading text-lg font-bold">محتوى الموقع</h2>
        <HelpTip>
          كل صفحة في الموقع العام تُبنى من أقسام مرتّبة تُحرَّر من هنا — أي تعديل يظهر في
          الموقع فور الحفظ. الصفحات المسودة لا تظهر للزوار.
        </HelpTip>
        {readOnly ? (
          <Button className="ms-auto" disabled>
            <Plus />
            صفحة جديدة
          </Button>
        ) : (
          <Link href="/admin/content/new" className={cn(buttonVariants(), "ms-auto")}>
            <Plus />
            صفحة جديدة
          </Link>
        )}
      </div>

      <StatusBanners
        wired={wired}
        readOnly={readOnly}
        saved={saved}
        error={error}
        errorMessages={COMMON_ERROR_MESSAGES}
      />

      <PagePulse data={pulse} />

      {KIND_ORDER.map((kind) => {
        const group = pages
          .filter((p) => p.kind === kind)
          .sort((a, b) => a.sort - b.sort || a.title.localeCompare(b.title, "ar"));
        if (group.length === 0) return null;
        return (
          <Card key={kind}>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                {KIND_LABELS[kind]}
                <Badge variant="outline">{group.length}</Badge>
              </CardTitle>
              <CardDescription>{KIND_DESCRIPTIONS[kind]}</CardDescription>
            </CardHeader>
            <CardContent className="divide-y divide-border">
              {group.map((page) => (
                <PageRow key={page.id} page={page} readOnly={readOnly} />
              ))}
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
