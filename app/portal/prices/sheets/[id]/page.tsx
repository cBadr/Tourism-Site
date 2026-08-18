import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowRight, MapPin, MessageSquareWarning, Plus, Send, Trash2 } from "lucide-react";

import { toArabicDigits } from "@/components/booking/format";
import {
  Banners,
  countLabel,
  dateLabel,
  LIST_STATUS_HINTS,
  Notice,
  NotReadyNotice,
  PageHeading,
  PriceListStatusBadge,
  TextField,
} from "@/components/portal/portal-ui";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { portalSetupAccess } from "../../../_lib/session";
import { routesText, SheetCounts } from "../../_components/sheet-bits";
import {
  loadItemsByRoute,
  loadCoveredClasses,
  loadRoutes,
  loadSheet,
} from "../../_lib/sheets";
import { ImportPanel } from "../_components/import-panel";
import { deleteSheet, importSheetRows, saveSheet, submitSheet } from "../actions";

/**
 * كشف أسعار واحد — الشاشة التي حلّت شكوى المالك: مئة مسار في مكان واحد،
 * تُملأ من ملف، وتُرسَل للاعتماد **بطلبٍ واحد**.
 *
 * ثلاث حقائق تصل من الشاشة نفسها لا من دليل:
 * (١) الأرقام تكلفة المتعهد للاتجاه الواحد، والمنصة تضيف هامشها فوقها.
 * (٢) لا مسار يدخل التسعير قبل أن تعتمده الإدارة — الحالة على كل مسار لا على الكشف.
 * (٣) الاستيراد لا يمسّ المعتمد ولا ما ينتظر المراجعة، ويقول لماذا رفض كل صف.
 */

export const metadata = { title: "كشف أسعار" };

const ERROR_MESSAGES: Record<string, string> = {
  sheet_title: "اسم الكشف حقل إلزامي — سمِّه باسم يميّزه مثل «أسعار ٢٠٢٦».",
  sheet_locked:
    "لا يمكن حذف كشف فيه مسار معتمد يعمل الآن — راسل الإدارة لسحب اعتماده أولاً حتى لا تختفي تغطية من تحت عروض قائمة.",
  "invalid-input": "لا مسار جاهز للإرسال — أضف مساراً وسعِّر فيه فئة واحدة على الأقل.",
  "invalid-status": "حالة الكشف لا تسمح بهذا الإجراء الآن.",
  notfound: "الكشف غير موجود أو ليس لحسابك.",
  forbidden: "هذا الإجراء ليس من صلاحيتك.",
};

export default async function PortalPriceSheetPage({
  params,
  searchParams,
}: PageProps<"/portal/prices/sheets/[id]">) {
  const [{ id }, query, access] = await Promise.all([params, searchParams, portalSetupAccess()]);
  if (!access.ok) return null;

  const { supabase, sub } = access;

  const [sheet, { routes, ready }, { classes }] = await Promise.all([
    loadSheet(supabase, id),
    loadRoutes(supabase, sub.id),
    loadCoveredClasses(supabase),
  ]);

  if (!ready) {
    return (
      <div className="space-y-6">
        <PageHeading title="كشف أسعار" />
        <NotReadyNotice what="كشوف الأسعار" />
      </div>
    );
  }
  if (!sheet) notFound();

  const mine = routes.filter((r) => r.sheetId === id);
  const { items: priceItems, truncated: pricesTruncated } = await loadItemsByRoute(
    supabase,
    mine.map((r) => r.id)
  );

  const submitted = typeof query.submitted === "string" ? Number(query.submitted) : null;
  const error = typeof query.error === "string" ? query.error : null;
  const covered = classes.filter((c) => c.covered);
  // أسماءُ الفئات بالعربية من نفس مصدر شاشة التسعير — لا قائمةٌ ثانية تنحرف
  const classTitles = new Map(classes.map((c) => [c.slug, c.title]));
  const sendable = sheet.draftCount + sheet.rejectedCount > 0;

  return (
    <div className="space-y-6">
      <Link
        href="/portal/prices"
        className="inline-flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-primary"
      >
        <ArrowRight className="size-4" aria-hidden="true" />
        كل كشوف الأسعار
      </Link>

      <PageHeading
        title={sheet.title}
        help="الكشف يضم مسارات كثيرة ويُرسَل للاعتماد مرة واحدة. الحالة تخصّ كل مسار على حدة — والمعتمد وحده يدخل التسعير."
      >
        {routesText(sheet.routes)} · أُنشئ في {dateLabel(sheet.createdAt)}
      </PageHeading>

      <Banners
        saved={submitted !== null && Number.isFinite(submitted)}
        error={error}
        errorMessages={ERROR_MESSAGES}
        savedMessage={
          submitted && submitted > 0
            ? `أُرسل ${countLabel(submitted)} مساراً للاعتماد في طلب واحد — ستصلك نتيجة المراجعة من الإدارة.`
            : "حُفظ الكشف."
        }
      />

      <div className="flex flex-wrap items-center gap-2">
        <SheetCounts sheet={sheet} />
      </div>

      {sheet.note ? (
        <Notice tone="info" icon={<MessageSquareWarning className="size-5 shrink-0" />}>
          <p>{sheet.note}</p>
        </Notice>
      ) : null}

      {covered.length === 0 ? (
        <Notice tone="warning">
          <p className="font-semibold">لا فئة يمكنك تسعيرها بعد</p>
          <p>
            الفئات المعروضة للتسعير هي فئات مركباتك في الخدمة وحدها. سجّل مركبةً واحدة على
            الأقل من شاشة{" "}
            <Link href="/portal/fleet" className="underline underline-offset-4">
              أسطولي
            </Link>{" "}
            ثم عُد إلى هنا.
          </p>
        </Notice>
      ) : (
        <ImportPanel
          action={importSheetRows.bind(null, id)}
          templateHref="/portal/prices/template"
          disabled={false}
        />
      )}

      <Card className="gap-4 p-5">
        <div className="flex flex-wrap items-center gap-2">
          <MapPin className="size-4 shrink-0 text-primary" aria-hidden="true" />
          <h3 className="font-heading text-base font-bold">مسارات الكشف</h3>
          <Link
            href={`/portal/prices/new?sheet=${id}`}
            className={cn(buttonVariants({ variant: "outline", size: "sm" }), "ms-auto")}
          >
            <Plus aria-hidden="true" />
            مسار بالخريطة
          </Link>
        </div>

        {mine.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            لا مسارات بعد — ارفع ملف CSV أعلاه، أو أضف مساراً واحداً بالخريطة.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[34rem] text-sm">
              <thead>
                <tr className="border-b border-border text-xs text-muted-foreground">
                  <th className="p-2 text-start font-medium">المسار</th>
                  <th className="p-2 text-start font-medium">من ← إلى</th>
                  <th className="p-2 text-start font-medium">الأسعار لكل فئة</th>
                  <th className="p-2 text-start font-medium">الحالة</th>
                </tr>
              </thead>
              <tbody>
                {mine.map((route) => (
                  <tr key={route.id} className="border-b border-border last:border-0">
                    <td className="p-2 align-top">
                      <Link
                        href={`/portal/prices/${route.id}`}
                        className="font-medium transition-colors hover:text-primary hover:underline"
                      >
                        {route.title || "مسار بلا عنوان"}
                      </Link>
                      {route.reviewNote ? (
                        <p className="mt-0.5 text-xs leading-5 text-amber-700 dark:text-amber-300">
                          {route.reviewNote}
                        </p>
                      ) : null}
                    </td>
                    <td className="p-2 align-top text-muted-foreground">
                      {route.originLabel} ← {route.destLabel}
                    </td>
                    <td className="p-2 align-top">
                      {(() => {
                        const rows = priceItems.get(route.id) ?? [];
                        /*
                         * 🔴 «لا سعر» تُقال ولا تُترك خانةً فارغة: مسارٌ بلا سعرٍ
                         * لا يدخل التسعير أصلاً، فسكوتُ الجدول عنه يخفي عن المتعهد
                         * أهمَّ ما يحتاج أن يراه.
                         */
                        if (rows.length === 0) {
                          return (
                            <span className="text-xs text-amber-700 dark:text-amber-300">
                              بلا سعر بعد
                            </span>
                          );
                        }
                        return (
                          <ul className="space-y-0.5">
                            {rows.map((it) => (
                              <li key={it.classSlug} className="flex gap-1.5 whitespace-nowrap">
                                <span className="text-muted-foreground">
                                  {classTitles.get(it.classSlug) ?? it.classSlug}
                                </span>
                                <span className="font-medium tabular-nums">
                                  {toArabicDigits(it.cost)}
                                </span>
                              </li>
                            ))}
                          </ul>
                        );
                      })()}
                    </td>
                    <td className="p-2 align-top">
                      <PriceListStatusBadge status={route.status} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {pricesTruncated ? (
          <p className="text-xs leading-5 text-amber-700 dark:text-amber-300">
            ⚠ الكشف أكبر من أن تُقرأ أسعاره كلها في مرة — بعضُ الأرقام غير معروضة هنا.
            افتح المسار لترى سعره كاملاً.
          </p>
        ) : null}

        <p className="text-xs leading-5 text-muted-foreground">
          {LIST_STATUS_HINTS.draft} الأرقام تكلفتك أنت للاتجاه الواحد، والمنصة تضيف هامشها
          فوقها.
        </p>
      </Card>

      <Card className="gap-3 p-5">
        <h3 className="font-heading text-base font-bold">إرسال الكشف للاعتماد</h3>
        <p className="text-sm leading-relaxed text-muted-foreground">
          يُرسل كل مسارات الكشف الجاهزة (المسودة والمرفوضة التي فيها سعر واحد على الأقل) في
          طلبٍ واحد. المسارات المعتمدة تبقى تعمل كما هي، ولا يدخل التسعير شيءٌ لم يُعتمد.
        </p>
        <form action={submitSheet.bind(null, id)}>
          <Button type="submit" disabled={!sendable}>
            <Send aria-hidden="true" />
            إرسال {sendable ? countLabel(sheet.draftCount + sheet.rejectedCount) : ""} مساراً
            للاعتماد
          </Button>
        </form>
      </Card>

      <Card className="gap-4 p-5">
        <h3 className="font-heading text-base font-bold">اسم الكشف وملاحظته</h3>
        <form action={saveSheet.bind(null, id)} className="space-y-4">
          <TextField
            id="sheet-title"
            label="اسم الكشف"
            name="title"
            defaultValue={sheet.title}
            required
            maxLength={160}
            help="اسم داخلي يميّزه عندك وعند الإدارة — لا يظهر للعميل."
          />
          <TextField
            id="sheet-note"
            label="ملاحظة (اختيارية)"
            name="note"
            defaultValue={sheet.note ?? ""}
            maxLength={2000}
            help="مثل «أسعار موسم الصيف» — يقرأها المراجع مع الكشف."
          />
          <Button type="submit" variant="outline">
            حفظ
          </Button>
        </form>
      </Card>

      <form action={deleteSheet.bind(null, id)}>
        <Button type="submit" variant="ghost" className="text-destructive">
          <Trash2 aria-hidden="true" />
          حذف الكشف ومساراته
        </Button>
        <p className="mt-1 text-xs leading-5 text-muted-foreground">
          الحذف ممنوع ما دام في الكشف مسارٌ معتمد يعمل — القاعدة نفسها ترفضه حتى لا تختفي
          تغطية من تحت عروض سعرٍ قائمة.
        </p>
      </form>
    </div>
  );
}
