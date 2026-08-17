import Link from "next/link";
import { Blocks, Eye, EyeOff, Plus } from "lucide-react";

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
  sectionCountLabel,
  StatusBanners,
} from "./_components/fields";
import { NAV_LABEL_MAX } from "@/components/site/links";
import { NavBarCard } from "./_components/nav-bar-card";
import { builderPublicPath } from "@/lib/page-builder/registry";
import { togglePublished } from "./[id]/actions";
import { getAdminContent } from "./loader";

export const metadata = { title: "المحتوى" };

const hasSupabaseEnv = () =>
  Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);

/**
 * مجموعات القائمة. `landing` **نصٌّ لا `PageKind`** بقصد: نوع صفحة الهبوط قائمٌ
 * في قيد قاعدة البيانات منذ هجرة منشئ الصفحات، وقد يسبق تسجيلَه في
 * `lib/content-types.ts` الذي يملكه عارض الصفحات — فصفحةٌ من هذا النوع يجب أن
 * تظهر في القائمة **اليوم** لا أن تختفي بلا أثر (النمط ٣ في `LESSONS.md`).
 */
const GROUP_ORDER: string[] = Array.from(new Set<string>([...KIND_ORDER, "landing"]));
const GROUP_LABELS: Record<string, string> = KIND_LABELS;

/**
 * رسائل أخطاء إجراءات الشريط العلوي فوق المشتركة.
 *
 * ورسالةُ `navLinkAccount` تشرح **لماذا** لا تكتفي بـ«ممنوع»: المالك الذي يمنعه
 * النظام من شيءٍ يبدو معقولاً يحتاج أن يعرف ما حُرس، وإلا التمس طريقاً آخر إليه.
 */
const NAV_ERROR_MESSAGES: Record<string, string> = {
  ...COMMON_ERROR_MESSAGES,
  navLinkLabel: "تسمية البند حقل إلزامي.",
  navLinkLabelLong: `تسمية البند أطول من ${NAV_LABEL_MAX} حرفاً — الشريط العلوي يقرأه الزائر في لمحة، فاكتب كلمة أو كلمتين.`,
  navLinkHref:
    "الرابط غير صالح: اكتب مساراً داخلياً يبدأ بشرطة مائلة واحدة (‏/book أو /#services) أو عنواناً كاملاً يبدأ بـhttp.",
  navLinkAccount:
    "روابط حساب العميل (‏/account…) لا تُضاف إلى الشريط: مدخل «دخول العملاء» مركّب في الترويسة وفي درج الجوال وفي التذييل بنيوياً، فلا يُحذف بنقرة. وبند حرّ إليه يصنع نسخة ثانية قابلة للحذف تظنها الأصل.",
};

const KIND_DESCRIPTIONS: Record<string, string> = {
  home: "صفحة الموقع الأولى — أقسامها تُرتّب وتُحرَّر من هنا.",
  service: "الخدمات الست — لكل خدمة صفحة كاملة ببنية بيع وأسئلة شائعة.",
  corridor: "صفحات سيو للنقل بين مدينتين — أقوى تكتيك لتصدر نتائج البحث.",
  static: "صفحات عامة مثل «من نحن» والشروط.",
  landing: "صفحات تُبنى بالكتل من منشئ الصفحات — تظهر على رابط مباشر من الجذر.",
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
          <code dir="ltr">{builderPublicPath(page.kind, page.slug) ?? "—"}</code>
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

      {/* مدخل منشئ الصفحات — الشاشة بلا رابطٍ إليها شاشةٌ لم تُبنَ
          (القاعدة الذهبية ١٧ في `handover/INDEX.md`) */}
      <Link
        href={`/admin/content/${page.id}/builder`}
        title="فتح الصفحة في منشئ الكتل: ترتيب بالسحب، ومسودة، ومعاينة، ونشر"
        className={cn(buttonVariants({ variant: "outline", size: "sm" }))}
      >
        <Blocks />
        المنشئ
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
        errorMessages={NAV_ERROR_MESSAGES}
      />

      <PagePulse data={pulse} />

      {/* الشريط العلوي — الدفعة ج: الترويسة صارت تُبنى من القاعدة كالتذييل */}
      <NavBarCard readOnly={readOnly} />

      {GROUP_ORDER.map((kind) => {
        const group = pages
          .filter((p) => (p.kind as string) === kind)
          .sort((a, b) => a.sort - b.sort || a.title.localeCompare(b.title, "ar"));
        if (group.length === 0) return null;
        return (
          <Card key={kind}>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                {GROUP_LABELS[kind]}
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
