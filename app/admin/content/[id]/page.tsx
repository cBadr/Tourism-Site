import Link from "next/link";
import { notFound } from "next/navigation";
import { Blocks, ChevronDown, ChevronUp, ExternalLink, Plus, Trash2 } from "lucide-react";

import { HelpTip } from "@/components/shared/HelpTip";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { cn } from "@/lib/utils";
import { SECTION_TYPE_LABELS } from "@/lib/content-types";
import {
  COMMON_ERROR_MESSAGES,
  Field,
  fieldControlClass,
  StatusBanners,
  TextareaField,
} from "../_components/fields";
import { BUILDER_KIND_LABELS, builderPublicPath } from "@/lib/page-builder/registry";
import { getAdminPageById } from "../loader";
import { SectionFields } from "./_components/section-fields";
import { addSection, deleteSection, moveSection, savePage } from "./actions";

export const metadata = { title: "محرر المحتوى" };

const hasSupabaseEnv = () =>
  Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);

/**
 * محرر الصفحة — نموذج حفظ واحد يضم حقول الصفحة ومحتوى كل الأقسام معاً:
 * أزرار الترتيب/الحذف داخل النموذج نفسه عبر formAction (لا نماذج متداخلة)،
 * مع formNoValidate حتى لا تعطّلها فحوص الحقول الإلزامية. إضافة قسم نموذج مستقل.
 */
export default async function ContentEditorPage({
  params,
  searchParams,
}: PageProps<"/admin/content/[id]">) {
  const [{ id }, sp] = await Promise.all([params, searchParams]);
  const { page, readOnly } = await getAdminPageById(id);
  if (!page) notFound();

  const wired = hasSupabaseEnv();
  const saved = sp.saved === "1";
  const error = typeof sp.error === "string" ? sp.error : null;

  const errorMessages: Record<string, string> = {
    ...COMMON_ERROR_MESSAGES,
    title: "عنوان الصفحة حقل إلزامي.",
    type: "نوع القسم المطلوب غير معروف.",
  };

  const iconButton = (extra?: string) =>
    cn(buttonVariants({ variant: "ghost", size: "icon-sm" }), extra);

  // نوع `landing` قد يسبق تسجيله في `lib/content-types.ts`، والمسار يُقرأ من
  // مصدرٍ متسامح يرجع `null` بدل أن يعرض رابطاً فارغاً
  const pagePath = builderPublicPath(page.kind, page.slug);

  /**
   * 🔒 هذا المحرر **مسطّح ويبقى مسطّحاً**: يعرض كتل الجذر وحدها، وأبناء كتلة
   * الأعمدة تُحرَّر في المنشئ. والسبب ليس ذوقاً — `moveSection` هنا يعيد ترقيم
   * `sort` لكل صفوف الصفحة تسلسلياً، فلو دخل الأبناء في العدّ لخلط ترتيبَ
   * الأعمدة داخل أبيها بترتيب الصفحة نفسها.
   */
  const rootSections = page.sections.filter((section) => !section.parentId);
  const nestedCount = page.sections.length - rootSections.length;

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      {/* ترويسة المحرر: العنوان + النوع + الحالة + الرابط العام */}
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="font-heading text-lg font-bold">{page.title}</h2>
        <Badge variant="outline">{BUILDER_KIND_LABELS[page.kind] ?? page.kind}</Badge>
        <Badge variant={page.published ? "default" : "secondary"}>
          {page.published ? "منشورة" : "مسودة"}
        </Badge>
        <span className="ms-auto flex items-center gap-3">
          <Link
            href={`/admin/content/${page.id}/builder`}
            className="flex items-center gap-1 text-sm text-muted-foreground transition-colors hover:text-primary hover:underline"
          >
            <Blocks className="size-3.5" />
            المنشئ
          </Link>
          {pagePath && (
            <Link
              href={pagePath}
              target="_blank"
              className="flex items-center gap-1 text-sm text-muted-foreground transition-colors hover:text-primary hover:underline"
            >
              <ExternalLink className="size-3.5" />
              <span dir="ltr">{pagePath}</span>
            </Link>
          )}
          <Link
            href="/admin/content"
            className="text-sm text-muted-foreground transition-colors hover:text-primary hover:underline"
          >
            العودة إلى المحتوى
          </Link>
        </span>
      </div>

      <StatusBanners
        wired={wired}
        readOnly={readOnly}
        saved={saved}
        error={error}
        errorMessages={errorMessages}
        savedMessage="حُفظ التغيير وانعكس على الموقع العام فوراً — افتح رابط الصفحة للتأكد."
      />

      <form action={savePage.bind(null, page.id)} className="space-y-6">
        {/* حقول الصفحة: العنوان والنشر والميتا */}
        <Card className="space-y-4 p-5">
          <div>
            <h3 className="flex items-center gap-1.5 font-heading text-base font-bold">
              بيانات الصفحة
              <HelpTip>
                هذه الحقول تخص الصفحة كلها: عنوانها وحالة نشرها وبيانات السيو. محتوى الأقسام
                نفسه يُحرَّر في البطاقات التالية، والحفظ بزر واحد أسفل الصفحة يشمل الجميع.
              </HelpTip>
            </h3>
            <p className="flex items-center gap-1.5 text-sm text-muted-foreground">
              المعرّف في الرابط: <code dir="ltr">{page.slug || "الرئيسية"}</code>
              <HelpTip>
                المعرّف يُحدَّد عند إنشاء الصفحة ولا يتغير بعدها حفاظاً على روابط السيو
                المفهرسة.
              </HelpTip>
            </p>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field
              label="عنوان الصفحة"
              name="title"
              defaultValue={page.title}
              disabled={readOnly}
              required
            />
            <div className="space-y-1.5">
              <span className="flex items-center gap-1.5 text-sm font-medium">
                حالة النشر
                <HelpTip>
                  الصفحة غير المنشورة لا تظهر في الموقع العام ولا في خريطة الموقع — تبقى
                  مسودة تراها لوحة التحكم فقط.
                </HelpTip>
              </span>
              <Label className="flex h-8 cursor-pointer items-center gap-2 text-sm font-normal">
                <input
                  type="checkbox"
                  name="published"
                  defaultChecked={page.published}
                  disabled={readOnly}
                  className="size-4 accent-primary"
                />
                منشورة في الموقع العام
              </Label>
            </div>
          </div>

          <Field
            label="عنوان السيو (Meta Title)"
            name="meta.title"
            defaultValue={page.meta.title}
            disabled={readOnly}
            help="الطول المقترح ٦٠ حرفاً كحد أقصى. لا تُضف اسم العلامة — قالب العنوان في الإعدادات يضيفه تلقائياً. الفارغ يستخدم عنوان الصفحة."
          />
          <TextareaField
            label="وصف السيو (Meta Description)"
            name="meta.description"
            defaultValue={page.meta.description}
            rows={3}
            disabled={readOnly}
            help="الطول المقترح ١٤٠–١٦٠ حرفاً — يظهر تحت العنوان في نتائج البحث. الفارغ يستخدم الوصف الافتراضي من الإعدادات."
          />
        </Card>

        {/* الأقسام بترتيب العرض */}
        <div className="flex items-center gap-1.5">
          <h3 className="font-heading text-base font-bold">أقسام الصفحة</h3>
          <HelpTip>
            تُعرض في الموقع بهذا الترتيب من الأعلى للأسفل — رتّبها بالأسهم. الترتيب والحذف
            يُنفَّذان فوراً، أما تعديلات الحقول فتُحفظ بزر «حفظ التغييرات».
          </HelpTip>
        </div>

        {nestedCount > 0 && (
          <Card className="p-4 text-sm leading-relaxed text-muted-foreground">
            في هذه الصفحة {nestedCount} كتلة داخل كتلة أعمدة — لا تظهر هنا لأن هذا المحرر مسطّح.
            حرّرها ورتّبها من{" "}
            <Link href={`/admin/content/${page.id}/builder`} className="text-primary hover:underline">
              منشئ الصفحات
            </Link>
            .
          </Card>
        )}

        {rootSections.length === 0 && (
          <Card className="p-5 text-sm text-muted-foreground">
            لا أقسام في هذه الصفحة بعد — أضف أول قسم من بطاقة «إضافة قسم» بالأسفل.
          </Card>
        )}

        {rootSections.map((section, index) => {
          const typeInfo = SECTION_TYPE_LABELS[section.type];
          return (
            <Card key={section.id} className="space-y-4 p-5">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-heading text-sm font-bold">{typeInfo.label}</span>
                <HelpTip>{typeInfo.hint}</HelpTip>
                {!section.visible && <Badge variant="secondary">مخفي</Badge>}
                <span className="ms-auto flex items-center gap-0.5">
                  <button
                    type="submit"
                    formAction={moveSection.bind(null, page.id, section.id, "up")}
                    formNoValidate
                    disabled={readOnly || index === 0}
                    aria-label="تحريك القسم لأعلى"
                    title="تحريك لأعلى"
                    className={iconButton()}
                  >
                    <ChevronUp />
                  </button>
                  <button
                    type="submit"
                    formAction={moveSection.bind(null, page.id, section.id, "down")}
                    formNoValidate
                    disabled={readOnly || index === rootSections.length - 1}
                    aria-label="تحريك القسم لأسفل"
                    title="تحريك لأسفل"
                    className={iconButton()}
                  >
                    <ChevronDown />
                  </button>
                  <button
                    type="submit"
                    formAction={deleteSection.bind(null, page.id, section.id)}
                    formNoValidate
                    disabled={readOnly}
                    aria-label="حذف القسم نهائياً"
                    title="حذف القسم نهائياً — لا تراجع بعد الحذف"
                    className={cn(
                      buttonVariants({ variant: "destructive", size: "icon-sm" })
                    )}
                  >
                    <Trash2 />
                  </button>
                </span>
              </div>

              <SectionFields section={section} disabled={readOnly} />

              <Label className="flex w-fit cursor-pointer items-center gap-2 text-sm font-normal">
                <input
                  type="checkbox"
                  name={`section-${section.id}-visible`}
                  defaultChecked={section.visible}
                  disabled={readOnly}
                  className="size-4 accent-primary"
                />
                ظاهر في الموقع
                <HelpTip>
                  القسم المخفي يبقى محفوظاً بمحتواه لكنه لا يظهر في الموقع العام — مفيد
                  لتجهيز محتوى قبل إطلاقه.
                </HelpTip>
              </Label>
            </Card>
          );
        })}

        <Separator />
        <div className="flex items-center justify-end gap-3">
          <p className="me-auto text-xs text-muted-foreground">
            الحفظ يشمل حقول الصفحة ومحتوى كل الأقسام معاً.
          </p>
          <Button type="submit" disabled={readOnly}>
            حفظ التغييرات
          </Button>
        </div>
      </form>

      {/* إضافة قسم — نموذج مستقل خارج نموذج الحفظ (لا تداخل نماذج في HTML) */}
      <form action={addSection.bind(null, page.id)}>
        <Card className="space-y-4 p-5">
          <div>
            <h3 className="flex items-center gap-1.5 font-heading text-base font-bold">
              إضافة قسم
              <HelpTip>
                يُضاف القسم الجديد في آخر الصفحة بمحتوى فارغ — رتّبه بالأسهم ثم املأ حقوله
                واحفظ.
              </HelpTip>
            </h3>
          </div>
          <div className="flex flex-wrap items-end gap-3">
            <div className="min-w-52 flex-1 space-y-1.5">
              <Label htmlFor="new-section-type">نوع القسم</Label>
              <select
                id="new-section-type"
                name="type"
                defaultValue="rich-text"
                disabled={readOnly}
                className={fieldControlClass}
              >
                {Object.entries(SECTION_TYPE_LABELS).map(([value, info]) => (
                  <option key={value} value={value}>
                    {info.label}
                  </option>
                ))}
              </select>
            </div>
            <Button type="submit" variant="outline" disabled={readOnly}>
              <Plus />
              إضافة قسم
            </Button>
          </div>
        </Card>
      </form>
      <div className="pb-8" />
    </div>
  );
}
