import Link from "next/link";
import { notFound } from "next/navigation";
import { PenLine } from "lucide-react";

import { HelpTip } from "@/components/shared/HelpTip";
import { BuilderEditor } from "@/components/admin/page-builder/builder-editor";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Field, StatusBanners, TextareaField } from "../../_components/fields";
import { BUILDER_KIND_LABELS, builderPublicPath } from "@/lib/page-builder/registry";
import { readBuilderPage } from "@/lib/page-builder/read";
import {
  discardDraft,
  importTemplateIntoPage,
  publishDraft,
  saveDraft,
  savePageMeta,
} from "./actions";

export const metadata = { title: "منشئ الصفحات" };

const hasSupabaseEnv = () =>
  Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);

/**
 * شاشة منشئ الصفحات — المسودة والكتل والنشر.
 *
 * ⚠ **وشرطٌ من العقد §٩ مُنفَّذ هنا حرفياً:** الصلاحية تُقرأ من `builder_access()`
 * **قبل** رسم أي مقبض. دور `ops` يدخل `/admin` من الوسيط بينما كل سياسة كتابة
 * تشترط `is_admin()` — فلو رُسمت له الأزرار لسحب وأفلت وضغط «حفظ» ثم اصطدم بفخ
 * Supabase الشهير: **صفر صفوف بلا خطأ**، وعملُه ضائع بلا سببٍ مفهوم.
 */
export default async function PageBuilderScreen({
  params,
  searchParams,
}: PageProps<"/admin/content/[id]/builder">) {
  const [{ id }, sp] = await Promise.all([params, searchParams]);

  if (!hasSupabaseEnv()) {
    return (
      <div className="mx-auto max-w-4xl space-y-6">
        <h2 className="font-heading text-lg font-bold">منشئ الصفحات</h2>
        <StatusBanners
          wired={false}
          readOnly
          saved={false}
          error={null}
          errorMessages={{}}
        />
      </div>
    );
  }

  const data = await readBuilderPage(id);
  if (!data) notFound();

  const publicPath = builderPublicPath(data.kind, data.slug);
  const kindLabel = BUILDER_KIND_LABELS[data.kind] ?? data.kind;

  const published =
    sp.published === "1"
      ? `حُدِّثت ${Number(sp.u ?? 0)} كتلة · أُضيفت ${Number(sp.i ?? 0)} · حُذفت ${Number(sp.d ?? 0)}`
      : null;

  const status = {
    saved: sp.saved === "1",
    published,
    discarded: sp.discarded === "1",
    imported: sp.imported === "1",
    error: typeof sp.error === "string" ? sp.error : null,
  };

  if (data.access === "denied") {
    return (
      <div className="mx-auto max-w-4xl space-y-6">
        <h2 className="font-heading text-lg font-bold">منشئ الصفحات</h2>
        <Card className="p-5 text-sm leading-relaxed">
          هذه الشاشة لحسابات الإدارة. إن كنت ترى هذه الرسالة بحساب إداري فالجلسة انتهت — أعِد
          تسجيل الدخول.
        </Card>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="font-heading text-lg font-bold">{data.title}</h2>
        <Badge variant="outline">{kindLabel}</Badge>
        <Badge variant={data.published ? "default" : "secondary"}>
          {data.published ? "منشورة" : "مسودة"}
        </Badge>
        {data.access === "read-only" && <Badge variant="secondary">قراءة فقط</Badge>}
        <span className="ms-auto flex items-center gap-3 text-sm">
          <Link
            href={`/admin/content/${data.id}`}
            className="flex items-center gap-1 text-muted-foreground transition-colors hover:text-primary hover:underline"
          >
            <PenLine className="size-3.5" />
            المحرر القديم
          </Link>
          <Link
            href="/admin/content"
            className="text-muted-foreground transition-colors hover:text-primary hover:underline"
          >
            العودة إلى المحتوى
          </Link>
        </span>
      </div>

      {data.access === "read-only" && (
        <Card className="border-amber-300 bg-amber-50 p-4 text-sm leading-relaxed text-amber-900 dark:border-amber-700 dark:bg-amber-950 dark:text-amber-100">
          <p className="font-semibold">المنشئ مفتوح للقراءة فقط بحسابك</p>
          <p>
            حقّ البناء والنشر لدور <code dir="ltr">admin</code> وحده في قاعدة البيانات. الأزرار
            معطّلة هنا عمداً بدل أن تسمح بعملٍ يُرفض عند الحفظ.
          </p>
        </Card>
      )}

      {/* بيانات الصفحة — تُحفظ فوراً وليست جزءاً من المسودة، لأن بوابة النشر
          تقرؤها من الصفّ الحيّ لا من اللقطة. */}
      <form action={savePageMeta.bind(null, data.id)}>
        <Card className="space-y-4 p-5">
          <div className="flex items-center gap-1.5">
            <h3 className="font-heading text-base font-bold">بيانات الصفحة</h3>
            <HelpTip>
              العنوان ووصف السيو يُحفظان فوراً وليسا جزءاً من المسودة — بوابة النشر تقرؤهما من
              الصفحة نفسها، فلو انتظرا النشر لبقي المانع قائماً مهما كتبتَ.
            </HelpTip>
          </div>
          <Field
            label="عنوان الصفحة"
            name="title"
            defaultValue={data.title}
            required
            disabled={data.access !== "edit"}
          />
          <TextareaField
            label="وصف السيو (Meta Description)"
            name="metaDescription"
            defaultValue={data.metaDescription}
            rows={3}
            disabled={data.access !== "edit"}
            help="الطول المقترح ١٤٠–١٦٠ حرفاً. غيابه يمنع النشر — السيو هو المنتج، فالوصف شرط لا تحسين."
          />

          {/* حالة نشر الصفحة نفسها — منفصلة عن نشر الكتل، والفرق يُقال صراحةً */}
          <Label className="flex w-fit cursor-pointer items-center gap-2 text-sm font-normal">
            <input
              type="checkbox"
              name="published"
              defaultChecked={data.published}
              disabled={data.access !== "edit"}
              className="size-4 accent-primary"
            />
            الصفحة منشورة في الموقع العام
            <HelpTip>
              مفتاحان لا واحد: هذا يفتح الصفحة نفسها للزوار، وزر «نشر» أدناه يدفع الكتل من
              المسودة إلى الصفحة. صفحةٌ كتلها منشورة وهي نفسها مسودة تبقى ٤٠٤ للزائر.
            </HelpTip>
          </Label>

          <div className="flex justify-end">
            <Button type="submit" variant="outline" size="sm" disabled={data.access !== "edit"}>
              حفظ بيانات الصفحة
            </Button>
          </div>
        </Card>
      </form>

      {/* 🔴 الفخ الذي لا يراه أحد إلا بفتح الرابط: الكتل منشورة والصفحة مسودة.
          `publish_page_revision` لا تلمس `pages.published` بقصد — فالتنبيه هنا
          بدل أن يفتح المالك `/{slug}` فيجد ٤٠٤ بلا تفسير (النمط ٣ في LESSONS). */}
      {!data.published && (
        <Card className="border-amber-300 bg-amber-50 p-4 text-sm leading-relaxed text-amber-900 dark:border-amber-700 dark:bg-amber-950 dark:text-amber-100">
          <p className="font-semibold">الصفحة نفسها غير منشورة بعد</p>
          <p>
            زر «نشر» أدناه يدفع الكتل من المسودة إلى الصفحة، لكنه لا يفتح الصفحة للزوار. فعّل
            «الصفحة منشورة في الموقع العام» أعلاه ليصل إليها أحد — وإلا بقي{" "}
            <code dir="ltr">{publicPath ?? "الرابط"}</code> صفحةَ ٤٠٤.
          </p>
        </Card>
      )}

      <BuilderEditor
        pageId={data.id}
        pageKind={data.kind}
        pageTitle={data.title}
        publicPath={publicPath}
        access={data.access}
        initialBlocks={data.blocks}
        revisionId={data.draftRevisionId}
        rev={data.draftRev}
        hasUnpublishedChanges={data.hasUnpublishedChanges}
        blockers={data.blockers}
        status={status}
        saveAction={saveDraft.bind(null, data.id)}
        publishAction={publishDraft.bind(null, data.id)}
        discardAction={discardDraft.bind(null, data.id)}
        importAction={importTemplateIntoPage.bind(null, data.id)}
      />

      {/* تاريخ اللقطات — «مَن ومتى» بلا جسم اللقطة (‏`builder_revisions` تُسقط
          `snapshot` من إسقاطها، فلا تُحمَّل عشرات الكيلوبايتات لعرض تاريخ). */}
      {data.revisions.length > 0 && (
        <Card className="space-y-3 p-5">
          <div className="flex items-center gap-1.5">
            <h3 className="font-heading text-base font-bold">تاريخ اللقطات</h3>
            <HelpTip>
              كل نشرة تُبقي لقطتها في السجل: المسودة الحالية، والمنشورة، وما قبلها مؤرشفاً.
            </HelpTip>
          </div>
          <ul className="divide-y divide-border text-sm">
            {data.revisions.map((revision) => (
              <li key={revision.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 py-2">
                <Badge
                  variant={
                    revision.status === "draft"
                      ? "default"
                      : revision.status === "published"
                        ? "secondary"
                        : "outline"
                  }
                >
                  {REVISION_STATUS_LABELS[revision.status] ?? revision.status}
                </Badge>
                <span className="text-muted-foreground">
                  {new Date(revision.created_at).toLocaleString("ar-EG")}
                </span>
                {revision.created_by_name && (
                  <span className="text-muted-foreground">· {revision.created_by_name}</span>
                )}
                {revision.published_at && (
                  <span className="ms-auto text-xs text-muted-foreground">
                    نُشرت {new Date(revision.published_at).toLocaleString("ar-EG")}
                  </span>
                )}
              </li>
            ))}
          </ul>
        </Card>
      )}
      <div className="pb-8" />
    </div>
  );
}

const REVISION_STATUS_LABELS: Record<string, string> = {
  draft: "مسودة",
  published: "منشورة",
  archived: "مؤرشفة",
};
