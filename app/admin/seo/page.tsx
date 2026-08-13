import Link from "next/link";
import { ExternalLink, Pencil, Save } from "lucide-react";

import { HelpTip } from "@/components/shared/HelpTip";
import { toArabicDigits } from "@/components/booking/format";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { isMetaComplete } from "@/lib/seo/meta";
import { pagePublicPath } from "@/lib/seo/site-paths";
import { readContentSnapshot } from "@/lib/stats/read";
import { createServerSupabase } from "@/lib/supabase/server";
import type { PageWithSections } from "@/lib/content-types";

import {
  COMMON_ERROR_MESSAGES,
  KIND_LABELS,
  KIND_ORDER,
  StatusBanners,
} from "../content/_components/fields";
import { getAdminContent } from "../content/loader";
import { MetaCounterField } from "./_components/meta-fields";
import { PathCode, SeoTabs } from "./_components/seo-ui";
import { saveMetadata } from "./actions";

export const metadata = { title: "مركز السيو" };

const hasSupabaseEnv = () =>
  Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);

const ERROR_MESSAGES: Record<string, string> = {
  ...COMMON_ERROR_MESSAGES,
  load: "تعذّرت قراءة الصفحات من قاعدة البيانات — أعد المحاولة.",
  title: "أحد عناوين السيو أطول مما يقبله الحقل — راجع الصفحات وقصّره.",
  description: "أحد أوصاف السيو أطول مما يقبله الحقل — راجع الصفحات وقصّره.",
};

/** صف صفحة واحدة داخل النموذج الجماعي */
function PageMetaRow({ page, disabled }: { page: PageWithSections; disabled: boolean }) {
  const complete = isMetaComplete(page.meta);
  const path = pagePublicPath(page.kind, page.slug);

  return (
    <div
      className={cn(
        "space-y-3 rounded-xl border p-4",
        complete
          ? "border-border"
          : "border-amber-300 bg-amber-50/40 dark:border-amber-800 dark:bg-amber-950/20"
      )}
    >
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
        <span className="font-medium">{page.title}</span>
        <PathCode>{path}</PathCode>

        {page.published ? (
          <Badge variant="secondary">منشورة</Badge>
        ) : (
          <Badge variant="outline">مسودة</Badge>
        )}

        {complete ? null : <Badge variant="destructive">ميتاداتا ناقصة</Badge>}

        <div className="ms-auto flex items-center gap-1">
          <Link
            href={`/admin/content/${page.id}`}
            className={cn(buttonVariants({ variant: "ghost", size: "xs" }))}
            title="فتح محرر محتوى هذه الصفحة"
          >
            <Pencil />
            المحتوى
          </Link>
          {page.published ? (
            <a
              href={path}
              target="_blank"
              rel="noreferrer"
              className={cn(buttonVariants({ variant: "ghost", size: "xs" }))}
              title="فتح الصفحة في الموقع العام"
            >
              <ExternalLink />
              معاينة
            </a>
          ) : null}
        </div>
      </div>

      {/* 🔒 بصمة «هذا الصف كان معروضاً في النموذج» — يقرؤها `saveMetadata` لتفرّق
          بين حقل أفرغه المالك عمداً وحقل **لم يُعرض أصلاً**. بدونها كان الحفظ من
          فلتر «الناقصة فقط» يمحو ميتاداتا كل صفحة مكتملة (غيرُ معروضة ⇒ حقولها
          غائبة ⇒ null ⇒ «تغيّر» ⇒ كتابة محو). الحقل غير مُعطَّل أبداً كي يُرسَل
          دائماً مع النموذج. */}
      <input type="hidden" name="rendered" value={page.id} />

      <div className="grid gap-3 lg:grid-cols-2">
        <MetaCounterField
          id={`meta-${page.id}-title`}
          name={`meta-${page.id}-title`}
          field="title"
          label="عنوان السيو"
          defaultValue={page.meta.title}
          placeholder={page.title}
          disabled={disabled}
        />
        <MetaCounterField
          id={`meta-${page.id}-description`}
          name={`meta-${page.id}-description`}
          field="description"
          label="وصف السيو"
          defaultValue={page.meta.description}
          placeholder="جملة أو جملتان تُقنعان الباحث بالنقر على هذه الصفحة بالذات."
          disabled={disabled}
        />
      </div>
    </div>
  );
}

export default async function SeoMetadataPage({ searchParams }: PageProps<"/admin/seo">) {
  const [params, { pages, readOnly }, supabase] = await Promise.all([
    searchParams,
    getAdminContent(),
    createServerSupabase(),
  ]);

  // القرار ٣ في موجز المرحلة ١٠: كل رقم معروض من view في Postgres. عدّ الصفوف
  // بـ `filter().length` كان يصنع مصدر حقيقة ثانياً ينحرف عن `/admin/stats/content`
  // — وينحرف فعلاً حين تسقط القراءة إلى `DEFAULT_PAGES` بعلامة readOnly.
  const snapshot = supabase ? await readContentSnapshot(supabase) : null;
  const counts = snapshot?.ready ? snapshot.data : null;

  const wired = hasSupabaseEnv();
  const disabled = readOnly || !wired;
  const filter = params.filter === "missing" ? "missing" : null;
  const error = typeof params.error === "string" ? params.error : null;

  const savedRaw = typeof params.saved === "string" ? Number(params.saved) : null;
  const savedCount = savedRaw !== null && Number.isFinite(savedRaw) ? savedRaw : null;

  // ترشيح الصفوف المعروضة — لا طباعة رقم مجمَّع (ذاك من العرض أعلاه)
  const incomplete = pages.filter((page) => !isMetaComplete(page.meta));

  const visible = filter === "missing" ? incomplete : pages;

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="font-heading text-lg font-bold">مركز السيو</h2>
        <HelpTip>
          كل ما يقرؤه محرك البحث عن الموقع في مكان واحد: عناوين الصفحات وأوصافها،
          وتحويلات الروابط القديمة، وفحص البيانات المهيكلة. التعديل هنا يظهر في نتائج
          البحث بعد أن يزور جوجل الصفحة من جديد — لا فور الحفظ.
        </HelpTip>
      </div>

      <SeoTabs active="/admin/seo" />

      <StatusBanners
        wired={wired}
        readOnly={readOnly}
        saved={savedCount !== null}
        error={error}
        errorMessages={ERROR_MESSAGES}
        savedMessage={
          savedCount === 0
            ? "لا تغييرات لحفظها — القيم كما هي."
            : `حُفظت ميتاداتا ${toArabicDigits(savedCount ?? 0)} صفحة، وانعكست على الموقع العام فوراً.`
        }
      />

      {/* ملخّص الحالة — الأرقام الثلاثة من `v_stats_content` نفسه الذي تقرؤه
          شاشة `/admin/stats/content`، فلا رقمان لنفس الشيء في شاشتين. وحين
          تتعذّر القراءة تظهر «—» لا صفر: «لا نعرف» ليست «لا يوجد». */}
      <div className="grid gap-3 sm:grid-cols-3">
        <Card className="gap-1 p-4">
          <span className="text-xs text-muted-foreground">صفحات الموقع</span>
          <span className="text-xl font-bold" dir="ltr">
            {counts?.pagesTotal !== null && counts?.pagesTotal !== undefined
              ? toArabicDigits(counts.pagesTotal)
              : "—"}
          </span>
        </Card>
        <Card className="gap-1 p-4">
          <span className="text-xs text-muted-foreground">ميتاداتا مكتملة</span>
          <span className="text-xl font-bold" dir="ltr">
            {counts?.metaComplete !== null && counts?.metaComplete !== undefined
              ? toArabicDigits(counts.metaComplete)
              : "—"}
          </span>
        </Card>
        <Card
          className={cn(
            "gap-1 p-4",
            (counts?.metaMissing ?? 0) > 0 &&
              "border-amber-300 bg-amber-50/50 dark:border-amber-800 dark:bg-amber-950/20"
          )}
        >
          <span className="text-xs text-muted-foreground">ميتاداتا ناقصة</span>
          <span className="text-xl font-bold" dir="ltr">
            {counts?.metaMissing !== null && counts?.metaMissing !== undefined
              ? toArabicDigits(counts.metaMissing)
              : "—"}
          </span>
        </Card>
      </div>

      <nav aria-label="ترشيح الصفحات" className="flex flex-wrap gap-2">
        <Link
          href="/admin/seo"
          aria-current={filter === null ? "page" : undefined}
          className={cn(
            buttonVariants({ variant: filter === null ? "secondary" : "ghost", size: "sm" })
          )}
        >
          كل الصفحات ({toArabicDigits(pages.length)})
        </Link>
        <Link
          href="/admin/seo?filter=missing"
          aria-current={filter === "missing" ? "page" : undefined}
          className={cn(
            buttonVariants({ variant: filter === "missing" ? "secondary" : "ghost", size: "sm" })
          )}
        >
          الناقصة فقط ({toArabicDigits(incomplete.length)})
        </Link>
      </nav>

      {visible.length === 0 ? (
        <Card className="p-6 text-center text-sm text-muted-foreground">
          {filter === "missing"
            ? "كل صفحات الموقع لها عنوان ووصف سيو — لا شيء ناقص هنا."
            : "لا صفحات بعد."}
        </Card>
      ) : (
        <form action={saveMetadata} className="space-y-6">
          {filter ? <input type="hidden" name="filter" value={filter} /> : null}

          {KIND_ORDER.map((kind) => {
            const group = visible
              .filter((page) => page.kind === kind)
              .sort((a, b) => a.sort - b.sort || a.title.localeCompare(b.title, "ar"));
            if (group.length === 0) return null;

            return (
              <Card key={kind} className="space-y-4 p-5">
                <div className="flex items-center gap-2">
                  <h3 className="font-heading text-base font-bold">{KIND_LABELS[kind]}</h3>
                  <Badge variant="outline">{toArabicDigits(group.length)}</Badge>
                </div>
                <div className="space-y-3">
                  {group.map((page) => (
                    <PageMetaRow key={page.id} page={page} disabled={disabled} />
                  ))}
                </div>
              </Card>
            );
          })}

          <div className="sticky bottom-0 flex items-center justify-end gap-3 border-t border-border bg-background/95 py-3 backdrop-blur">
            <p className="me-auto text-xs text-muted-foreground">
              الحفظ يكتب الصفحات التي تغيّرت وحدها.
            </p>
            <Button type="submit" disabled={disabled}>
              <Save />
              حفظ الميتاداتا
            </Button>
          </div>
        </form>
      )}
    </div>
  );
}
