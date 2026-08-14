import Link from "next/link";
import { ChevronDown, ExternalLink, EyeOff, Pencil, Save } from "lucide-react";

import { HelpTip } from "@/components/shared/HelpTip";
import { PagePulse } from "@/components/stats/page-pulse";
import { toArabicDigits } from "@/components/booking/format";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { isMetaComplete } from "@/lib/seo/meta";
import { pagePublicPath } from "@/lib/seo/site-paths";
import { readPagePulse } from "@/lib/stats/pulse";
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
import { PathCode, SeoSwitch, SeoTabs } from "./_components/seo-ui";
import { saveMetadata } from "./actions";

export const metadata = { title: "مركز السيو" };

const hasSupabaseEnv = () =>
  Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);

const ERROR_MESSAGES: Record<string, string> = {
  ...COMMON_ERROR_MESSAGES,
  load: "تعذّرت قراءة الصفحات من قاعدة البيانات — أعد المحاولة.",
  title: "أحد عناوين السيو أطول مما يقبله الحقل — راجع الصفحات وقصّره.",
  description: "أحد أوصاف السيو أطول مما يقبله الحقل — راجع الصفحات وقصّره.",
  ogimage:
    "رابط صورة المشاركة في الصفحة المُبرَزة غير صالح — مسار داخلي يبدأ بشرطة مائلة (‏/brand/og.png) أو رابط كامل يبدأ بـ https://. المنصات تجلب الصورة من خوادمها فلا ينفع فيها مسار نسبي.",
  canonical:
    "المسار القانوني في الصفحة المُبرَزة ليس مساراً داخلياً — يبدأ بشرطة مائلة واحدة بلا نطاق وبلا نقطتين. ورابط قانوني إلى موقع آخر يهدي وزن صفحتك له بلا رسالة خطأ واحدة.",
};

/** صف صفحة واحدة داخل النموذج الجماعي */
function PageMetaRow({
  page,
  disabled,
  highlighted,
}: {
  page: PageWithSections;
  disabled: boolean;
  /** الصف الذي ردّه الإجراء بخطأ — يُبرَز بدل أن يبحث المالك عنه بين عشرين صفاً */
  highlighted: boolean;
}) {
  const complete = isMetaComplete(page.meta);
  const path = pagePublicPath(page.kind, page.slug);

  const noindex = page.meta.noindex === true;
  const excluded = page.meta.excludeFromSitemap === true;
  const pageImage = page.meta.ogImageUrl ?? "";
  const canonical = page.meta.canonicalPath ?? "";

  /**
   * الخيارات المتقدمة مطويّة إلا حين تكون مضبوطة فعلاً.
   *
   * ولماذا `<details>` لا إخفاء بجافاسكربت؟ لأن الحقول المطويّة **تُرسل مع
   * النموذج كما هي** — فلا يكسر الطيّ حارس `rendered` ولا يُفرِّغ حقلاً لم
   * يفتحه أحد. ولأن الصفحة كلها بلا جزيرة عميل عدا عدّاد الأحرف.
   */
  const hasExtras = noindex || excluded || pageImage !== "" || canonical !== "";

  return (
    <div
      className={cn(
        "space-y-3 rounded-xl border p-4",
        complete
          ? "border-border"
          : "border-amber-300 bg-amber-50/40 dark:border-amber-800 dark:bg-amber-950/20",
        highlighted && "border-red-400 ring-2 ring-red-300 dark:border-red-700 dark:ring-red-800"
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

        {/* حالتان تُغيّران ظهور الصفحة في البحث — تُقرآن من الصف بلا فتح الطيّ */}
        {noindex ? (
          <Badge className="border-amber-300 bg-amber-50 text-amber-900 dark:border-amber-700 dark:bg-amber-950 dark:text-amber-100">
            <EyeOff className="size-3.5" aria-hidden="true" />
            ممنوعة من الفهرسة
          </Badge>
        ) : null}
        {excluded ? <Badge variant="outline">خارج خريطة الموقع</Badge> : null}

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

      <details open={hasExtras || highlighted} className="group/extras">
        <summary className="w-fit cursor-pointer list-none text-xs font-medium text-muted-foreground transition-colors hover:text-foreground">
          <ChevronDown
            className="me-1 inline size-3.5 align-middle transition-transform group-open/extras:rotate-180"
            aria-hidden="true"
          />
          خيارات سيو هذه الصفحة
        </summary>

        <div className="mt-3 space-y-3 rounded-lg border border-dashed border-input p-3">
          <SeoSwitch
            name={`meta-${page.id}-noindex`}
            title="امنع فهرسة هذه الصفحة"
            hint="تبقى الصفحة تعمل للزوار وتختفي من نتائج البحث. للصفحات التي لا يُبحث عنها: شكراً على طلبك، عرض مؤقت، نسخة مكرّرة لا تنافس أصلها."
            defaultChecked={noindex}
            disabled={disabled}
          />

          <SeoSwitch
            name={`meta-${page.id}-nositemap`}
            title="استثنِ الصفحة من خريطة الموقع"
            hint="خريطة الموقع اقتراحُ زيارة لا إذنُ فهرسة — فالاستثناء وحده لا يمنع الظهور في النتائج. استعمله للصفحات الهامشية كي تتركّز زيارات الزاحف على ما يهمّك."
            defaultChecked={excluded}
            disabled={disabled}
          />

          <div className="grid gap-3 lg:grid-cols-2">
            <div className="space-y-1.5">
              <Label
                htmlFor={`meta-${page.id}-ogimage`}
                className="flex items-center gap-1.5 text-xs text-muted-foreground"
              >
                صورة مشاركة خاصة بالصفحة
                <HelpTip>
                  تسبق صورة الموقع العامة حين تُضبط. مسار داخلي يبدأ بشرطة مائلة أو رابط
                  كامل يبدأ بـ https://، ومقاسها ١٢٠٠×٦٣٠. اتركها فارغة لتُستعمل صورة
                  الموقع.
                </HelpTip>
              </Label>
              <Input
                id={`meta-${page.id}-ogimage`}
                name={`meta-${page.id}-ogimage`}
                dir="ltr"
                defaultValue={pageImage}
                placeholder="/brand/og-service.png"
                disabled={disabled}
              />
            </div>

            <div className="space-y-1.5">
              <Label
                htmlFor={`meta-${page.id}-canonical`}
                className="flex items-center gap-1.5 text-xs text-muted-foreground"
              >
                المسار القانوني
                <HelpTip>
                  يُستعمل حين تكون لهذه الصفحة نسخة أخرى بمحتوى متقارب، فتوجّه وزن البحث
                  إلى النسخة الأصل. اكتب المسار العربي الأصيل بلا بادئة لغة — تُركَّب
                  تلقائياً لكل لغة. اتركه فارغاً ليبقى المسار الحقيقي للصفحة.
                </HelpTip>
              </Label>
              <Input
                id={`meta-${page.id}-canonical`}
                name={`meta-${page.id}-canonical`}
                dir="ltr"
                defaultValue={canonical}
                placeholder={path}
                disabled={disabled}
              />
            </div>
          </div>
        </div>
      </details>
    </div>
  );
}

export default async function SeoMetadataPage({ searchParams }: PageProps<"/admin/seo">) {
  // القرار ٣ في موجز المرحلة ١٠ قائم كما هو: كل رقم معروض محسوب في Postgres، لا
  // بعدّ صفوفٍ حُمّلت للعرض. وما كان ثلاث بطاقات محلية فوق `readContentSnapshot`
  // صار شريط النبض نفسه — شريطان يعرضان الأرقام ذاتها كانا سيجعلان انحرافهما
  // مسألة وقت. والعميل يُنشأ أولاً لأن `readPagePulse` يحتاجه، وإنشاؤه لا يلمس
  // الشبكة فتبقى قراءة النبض متوازية مع قراءة الصفحات.
  const supabase = await createServerSupabase();
  const [params, { pages, readOnly }, pulse] = await Promise.all([
    searchParams,
    getAdminContent(),
    readPagePulse(supabase, "/admin/seo"),
  ]);

  const wired = hasSupabaseEnv();
  const disabled = readOnly || !wired;
  const filter = params.filter === "missing" ? "missing" : null;
  const error = typeof params.error === "string" ? params.error : null;
  const errorRow = typeof params.row === "string" ? params.row : null;

  const savedRaw = typeof params.saved === "string" ? Number(params.saved) : null;
  const savedCount = savedRaw !== null && Number.isFinite(savedRaw) ? savedRaw : null;

  // ترشيح الصفوف المعروضة — لا طباعة رقم مجمَّع (ذاك من العرض أعلاه)
  const incomplete = pages.filter((page) => !isMetaComplete(page.meta));

  const visible = filter === "missing" ? incomplete : pages;

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <div className="flex flex-wrap items-center gap-2">
        {/* العنوان يبقى «مركز السيو» لا «الميتاداتا»: هذا مدخل القسم من الشريط
            الجانبي، وعنوانه هنا يطابق `export const metadata` وخريطة `PAGE_TITLES`
            حرفاً بحرف — واختلافها يجعل المالك يقرأ عنوانين ويظن أنه غادر القسم. */}
        <h2 className="font-heading text-lg font-bold">مركز السيو</h2>
        <HelpTip>
          عنوان كل صفحة ووصفها كما يظهران في نتيجة البحث، وخيارات تخصّ الصفحة وحدها:
          منع فهرستها، أو استثناؤها من خريطة الموقع، أو صورة مشاركة لها، أو مسار قانوني
          يوجّه وزنها إلى صفحة أخرى. أما ما ينطبق على الموقع كله فتبويب «الإعدادات
          العامة». والتعديل هنا يظهر في نتائج البحث بعد أن يزور جوجل الصفحة من جديد —
          لا فور الحفظ.
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

      {/* ملخّص الحالة — أرقامه من `pulse_stats` الذي يفوّض إلى مصدر
          `/admin/stats/content` نفسه، فلا رقمان لنفس الشيء في شاشتين. وحين
          تتعذّر القراءة يظهر السبب سطراً واحداً لا صفر: «لا نعرف» ليست «لا يوجد». */}
      <PagePulse data={pulse} />

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
                    <PageMetaRow
                      key={page.id}
                      page={page}
                      disabled={disabled}
                      highlighted={errorRow === page.id}
                    />
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
