import Link from "next/link";
import { CheckCircle2, ExternalLink, Eye, Pencil, ShieldAlert } from "lucide-react";

import { HelpTip } from "@/components/shared/HelpTip";
import { toArabicDigits } from "@/components/booking/format";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { getSettings } from "@/lib/settings";
import {
  SCHEMA_LABELS,
  auditBusiness,
  auditPages,
  sortByUrgency,
  worstSeverity,
  type PageAudit,
} from "@/lib/seo/audit";

import { getAdminContent } from "../../content/loader";
import {
  OkBadge,
  PathCode,
  SEVERITY_LABELS,
  SEVERITY_STYLES,
  SeoTabs,
  SeverityIcon,
} from "../_components/seo-ui";

export const metadata = { title: "فحص البيانات المهيكلة" };

/**
 * تقرير فحص — **قراءة محضة**. لا Server Action في هذا الملف ولا زر يكتب شيئاً:
 * كل زر هنا رابط إلى الشاشة التي تُصلح العطب. منطق الفحص كله في
 * `lib/seo/audit.ts` وهو يعكس ما يُصدَّر فعلاً في `components/seo/JsonLd.tsx`
 * و`components/sections/faq.tsx` — لا تخميناً ولا نسبة مطمئنة.
 */

function PageAuditCard({ row }: { row: PageAudit }) {
  const severity = worstSeverity(row.issues);
  const tone = severity === null ? "border-border" : SEVERITY_STYLES[severity];

  return (
    <Card className={cn("space-y-3 border p-4", severity === null ? "border-border" : tone)}>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
        <span className="font-medium">{row.title}</span>
        <PathCode>{row.path}</PathCode>
        {row.published ? null : <Badge variant="outline">مسودة</Badge>}

        {severity === null ? (
          <OkBadge>سليمة</OkBadge>
        ) : (
          <Badge variant="outline" className="gap-1">
            <SeverityIcon severity={severity} />
            {SEVERITY_LABELS[severity]}
          </Badge>
        )}

        <div className="ms-auto flex flex-wrap items-center gap-1">
          <Link
            href={`/admin/seo#meta-${row.id}-title`}
            className={cn(buttonVariants({ variant: "ghost", size: "xs" }))}
            title="تحرير عنوان ووصف هذه الصفحة"
          >
            <Pencil />
            الميتاداتا
          </Link>
          <Link
            href={`/admin/content/${row.id}`}
            className={cn(buttonVariants({ variant: "ghost", size: "xs" }))}
            title="تحرير أقسام هذه الصفحة"
          >
            <Eye />
            الأقسام
          </Link>
          {row.published ? (
            <a
              href={row.path}
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

      <div className="flex flex-wrap items-center gap-2 text-xs">
        <span className="text-muted-foreground">البيانات المهيكلة المُصدَّرة:</span>
        {row.jsonLd.length === 0 ? (
          <Badge variant="outline">لا شيء</Badge>
        ) : (
          row.jsonLd.map((schema) => (
            <Badge key={schema} variant="secondary" className="gap-1">
              <CheckCircle2 className="size-3" aria-hidden="true" />
              {SCHEMA_LABELS[schema]}
              <span dir="ltr" className="text-muted-foreground">
                {schema}
              </span>
            </Badge>
          ))
        )}
      </div>

      {row.issues.length > 0 && (
        <ul className="space-y-1.5 text-sm leading-relaxed">
          {row.issues.map((issue) => (
            <li key={issue.code} className="flex items-start gap-2">
              <SeverityIcon severity={issue.severity} className="mt-0.5" />
              <span>{issue.text}</span>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

export default async function SeoAuditPage({ searchParams }: PageProps<"/admin/seo/audit">) {
  const [params, { pages, readOnly }, settings] = await Promise.all([
    searchParams,
    getAdminContent(),
    getSettings(),
  ]);

  const filter = params.filter === "issues" ? "issues" : null;
  const rows = sortByUrgency(auditPages(pages));

  const withIssues = rows.filter((row) => row.issues.length > 0);
  const errors = rows.filter((row) => worstSeverity(row.issues) === "error");
  const noJsonLd = rows.filter((row) => row.jsonLd.length === 0);
  const visible = filter === "issues" ? withIssues : rows;

  const business = auditBusiness({
    phone: settings.contact.phone,
    description: settings.seo.defaultDescription,
    socials: Object.values(settings.socials),
  });

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="font-heading text-lg font-bold">فحص البيانات المهيكلة</h2>
        <HelpTip>
          البيانات المهيكلة (JSON-LD) هي ما يقرؤه محرك البحث ليعرض مقتطفاً موسّعاً: أسئلة
          قابلة للفتح، بطاقة نشاط تجاري، قائمة خدمات. هذا التقرير يقرأ فقط ولا يعدّل شيئاً.
        </HelpTip>
      </div>

      <SeoTabs active="/admin/seo/audit" />

      {readOnly && (
        <Card className="flex flex-row items-start gap-3 border-amber-300 bg-amber-50 p-4 text-amber-900 dark:border-amber-700 dark:bg-amber-950 dark:text-amber-100">
          <ShieldAlert className="mt-0.5 size-5 shrink-0" aria-hidden="true" />
          <p className="text-sm leading-relaxed">
            المفحوص الآن هو المحتوى الافتراضي المدمج لا صفوف قاعدة البيانات — النتيجة
            للمعاينة فقط حتى تُنفَّذ هجرة المحتوى وبذرتها.
          </p>
        </Card>
      )}

      <div className="grid gap-3 sm:grid-cols-3">
        <Card className="gap-1 p-4">
          <span className="text-xs text-muted-foreground">صفحات مفحوصة</span>
          <span className="text-xl font-bold" dir="ltr">
            {toArabicDigits(rows.length)}
          </span>
        </Card>
        <Card
          className={cn(
            "gap-1 p-4",
            errors.length > 0 &&
              "border-red-300 bg-red-50/50 dark:border-red-800 dark:bg-red-950/20"
          )}
        >
          <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
            بها عطب يمنع التصدير
            <HelpTip>
              قسم أسئلة مخفي، أو قسم أسئلة بلا سؤال وجواب مكتملين — في الحالتين لا يُعرض
              القسم للزائر ولا تُصدَّر بياناته إطلاقاً.
            </HelpTip>
          </span>
          <span className="text-xl font-bold" dir="ltr">
            {toArabicDigits(errors.length)}
          </span>
        </Card>
        <Card
          className={cn(
            "gap-1 p-4",
            noJsonLd.length > 0 &&
              "border-amber-300 bg-amber-50/50 dark:border-amber-800 dark:bg-amber-950/20"
          )}
        >
          <span className="text-xs text-muted-foreground">بلا بيانات مهيكلة</span>
          <span className="text-xl font-bold" dir="ltr">
            {toArabicDigits(noJsonLd.length)}
          </span>
        </Card>
      </div>

      {/* بطاقة النشاط التجاري — تُصدَّر من الصفحة الرئيسية وحدها */}
      <Card className="space-y-3 p-5">
        <div>
          <h3 className="flex items-center gap-1.5 font-heading text-base font-bold">
            بطاقة النشاط التجاري
            <HelpTip>
              تُصدَّر من الصفحة الرئيسية وحدها، وتصف الموقع كله لمحركات البحث: الاسم
              والوصف والهاتف وحسابات التواصل. الحقل الفارغ لا يُدرَج أصلاً — لا يُرسَل فارغاً.
            </HelpTip>
          </h3>
          <p className="text-sm text-muted-foreground">
            نوعاها <code dir="ltr">LocalBusiness</code> و<code dir="ltr">ItemList</code>{" "}
            مصدرهما إعدادات الموقع لا محتوى الصفحة.
          </p>
        </div>

        <ul className="space-y-2 text-sm">
          {business.map((field) => (
            <li key={field.key} className="flex items-start gap-2">
              {field.present ? (
                <CheckCircle2
                  className="mt-0.5 size-4 shrink-0 text-emerald-600 dark:text-emerald-400"
                  aria-hidden="true"
                />
              ) : (
                <ShieldAlert
                  className="mt-0.5 size-4 shrink-0 text-amber-600 dark:text-amber-400"
                  aria-hidden="true"
                />
              )}
              <span className="leading-relaxed">
                <span className="font-medium">{field.label}</span>
                {field.present ? (
                  <span className="text-muted-foreground"> — مضبوط.</span>
                ) : (
                  <span className="text-muted-foreground"> — غير مضبوط. {field.note}</span>
                )}
              </span>
            </li>
          ))}
        </ul>

        <Link
          href="/admin/settings"
          className={cn(buttonVariants({ variant: "outline", size: "sm" }), "w-fit")}
        >
          <Pencil />
          تعديل بيانات الموقع
        </Link>
      </Card>

      <nav aria-label="ترشيح نتائج الفحص" className="flex flex-wrap gap-2">
        <Link
          href="/admin/seo/audit"
          aria-current={filter === null ? "page" : undefined}
          className={cn(
            buttonVariants({ variant: filter === null ? "secondary" : "ghost", size: "sm" })
          )}
        >
          كل الصفحات ({toArabicDigits(rows.length)})
        </Link>
        <Link
          href="/admin/seo/audit?filter=issues"
          aria-current={filter === "issues" ? "page" : undefined}
          className={cn(
            buttonVariants({ variant: filter === "issues" ? "secondary" : "ghost", size: "sm" })
          )}
        >
          ما يحتاج إصلاحاً ({toArabicDigits(withIssues.length)})
        </Link>
      </nav>

      {visible.length === 0 ? (
        <Card className="p-6 text-center text-sm text-muted-foreground">
          لا شيء يحتاج إصلاحاً — كل صفحة تُصدِّر بياناتها المهيكلة وميتاداتاها مكتملة.
        </Card>
      ) : (
        <div className="space-y-3 pb-8">
          {visible.map((row) => (
            <PageAuditCard key={row.id} row={row} />
          ))}
        </div>
      )}
    </div>
  );
}
