import Link from "next/link";
import { Plus } from "lucide-react";

import { SaveButton } from "@/components/admin/save-feedback";
import { HelpTip } from "@/components/shared/HelpTip";
import { Card } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import {
  COMMON_ERROR_MESSAGES,
  Field,
  fieldControlClass,
  StatusBanners,
} from "../_components/fields";
import { createPage } from "./actions";

export const metadata = { title: "صفحة جديدة" };

const hasSupabaseEnv = () =>
  Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);

/** الأنواع المسموح إنشاؤها يدوياً — الرئيسية والخدمات تُبذر من النظام */
const KIND_OPTIONS = [
  {
    value: "corridor",
    label: "صفحة مسار (سيو)",
    hint: "مثل «القاهرة–الأقصر» — تظهر تحت /routes وتستهدف بحث النقل بين مدينتين.",
  },
  {
    value: "static",
    label: "صفحة ثابتة",
    hint: "مثل «من نحن» أو «الشروط والأحكام» — تظهر على رابط مباشر من الجذر.",
  },
  {
    value: "landing",
    label: "صفحة هبوط (منشئ الكتل)",
    hint: "صفحة تسويقية تُبنى بالكتل: ترتيب بالسحب، ومسودة ومعاينة قبل النشر. تظهر على رابط مباشر من الجذر.",
  },
] as const;

export default async function NewContentPage({ searchParams }: PageProps<"/admin/content/new">) {
  const params = await searchParams;
  const wired = hasSupabaseEnv();
  const error = typeof params.error === "string" ? params.error : null;

  const errorMessages: Record<string, string> = {
    ...COMMON_ERROR_MESSAGES,
    title: "عنوان الصفحة حقل إلزامي.",
    slug: "المعرّف غير صالح — حروف لاتينية صغيرة وأرقام تفصلها شرطات فقط (مثال: cairo-luxor).",
    kind: "اختر نوع الصفحة: مسار سيو أو صفحة ثابتة أو صفحة هبوط.",
    exists: "يوجد صفحة بهذا المعرّف بالفعل — اختر معرّفاً آخر.",
    // رموز `SlugRejectCode` — سببٌ بعينه بدل «فشل الحفظ» العام
    "slug-format":
      "المعرّف غير صالح — حروف لاتينية صغيرة وأرقام تفصلها شرطات فقط (مثال: summer-offer).",
    "slug-reserved":
      "هذا المعرّف يملكه ملفٌ في التطبيق نفسه — الملف يفوز دائماً، فالصفحة كانت ستُنشر وتبقى ٤٠٤ للأبد.",
    "slug-prefix":
      "هذا المقطع بادئة يملكها قسم آخر من الموقع (الخدمات أو المسارات أو الحجز أو اللوحة).",
    "slug-taken": "توجد صفحة أخرى بهذا المعرّف.",
    "slug-redirect": "يوجد تحويل رابط يخطف هذا المسار — الصفحة لن تُرى أبداً.",
    forbidden: "هذا الإجراء لحساب دوره admin وحده.",
  };

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div className="flex items-center gap-3">
        <h2 className="font-heading text-lg font-bold">صفحة جديدة</h2>
        <Link
          href="/admin/content"
          className="ms-auto text-sm text-muted-foreground transition-colors hover:text-primary hover:underline"
        >
          العودة إلى المحتوى
        </Link>
      </div>

      <StatusBanners
        wired={wired}
        readOnly={!wired}
        saved={false}
        error={error}
        errorMessages={errorMessages}
      />

      <form action={createPage}>
        <Card className="space-y-4 p-5">
          <div>
            <h3 className="font-heading text-base font-bold">بيانات الصفحة</h3>
            <p className="text-sm text-muted-foreground">
              تُنشأ الصفحة كمسودة غير منشورة، وتفتح مباشرة في المحرر لإضافة أقسامها.
            </p>
          </div>

          <Field
            label="عنوان الصفحة"
            name="title"
            placeholder="نقل سياحي من القاهرة إلى الأقصر"
            required
            disabled={!wired}
            help="العنوان الظاهر في ترويسة الصفحة وفي قوائم لوحة التحكم — يمكن تعديله لاحقاً."
          />

          <Field
            label="المعرّف في الرابط (Slug)"
            name="slug"
            dir="ltr"
            placeholder="cairo-luxor"
            required
            pattern="[a-z0-9]+(-[a-z0-9]+)*"
            disabled={!wired}
            help="حروف لاتينية صغيرة وأرقام تفصلها شرطات فقط. يصبح جزءاً من رابط الصفحة ولا يتغير بعد الإنشاء حفاظاً على السيو."
          />

          <div className="space-y-1.5">
            <Label htmlFor="kind" className="flex items-center gap-1.5">
              نوع الصفحة
              <HelpTip>
                صفحات الرئيسية والخدمات الست تُنشأ من النظام — من هنا تضيف صفحات مسارات السيو
                (أقوى تكتيك لتصدر البحث) أو صفحات ثابتة عامة.
              </HelpTip>
            </Label>
            <select
              id="kind"
              name="kind"
              required
              disabled={!wired}
              defaultValue="corridor"
              className={fieldControlClass}
            >
              {KIND_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
            <ul className="space-y-0.5 pt-1 text-xs leading-relaxed text-muted-foreground">
              {KIND_OPTIONS.map((o) => (
                <li key={o.value}>
                  <span className="font-medium text-foreground">{o.label}:</span> {o.hint}
                </li>
              ))}
            </ul>
          </div>

          <Separator />
          <div className="flex justify-end">
            <SaveButton
              label="إنشاء الصفحة والانتقال للمحرر"
              icon={<Plus />}
              savedLabel="تم الإنشاء"
              pendingLabel="جارٍ الإنشاء…"
              failedLabel="لم تُنشأ"
              disabled={!wired}
              errorMessages={errorMessages}
            />
          </div>
        </Card>
      </form>
    </div>
  );
}
