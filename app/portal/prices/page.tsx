import Link from "next/link";
import { FolderPlus, MapPin, Plus, ReceiptText, Repeat, Send, Trash2 } from "lucide-react";

import { toArabicDigits } from "@/components/booking/format";
import {
  Banners,
  countLabel,
  dateLabel,
  EmptyState,
  LIST_STATUS_HINTS,
  NotReadyNotice,
  Notice,
  PageHeading,
  PriceListStatusBadge,
  TextField,
} from "@/components/portal/portal-ui";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { portalSetupAccess } from "../_lib/session";
import { routesText, SheetCounts } from "./_components/sheet-bits";
import { countItemsByRoute, loadRoutes, loadSheets } from "./_lib/sheets";
import { deletePriceList, submitPriceList } from "./actions";
import { saveSheet } from "./sheets/actions";

/**
 * أسعار المتعهد — الشاشة التي يعيش فيها عمله الحقيقي.
 *
 * 🔑 بعد 0102 صار المستوى الأعلى هو **الكشف**: قائمة أسعار واحدة تضم مسارات
 * كثيرة وتُرسَل للاعتماد مرّة واحدة. وقبل ذلك كانت كل «قائمة» مساراً واحداً
 * بطلب اعتماد مستقل — ومئة مسار كانت تعني مئة طلب، وهو ما شكا منه المالك.
 *
 * والمسارات القديمة المستقلة (‏`sheet_id = null`) تبقى تعمل كما هي في قسمها
 * الخاص بلا أي مساس ببياناتها: تحويلها إلى كشف قرارُ صاحبها لا قرارُ ترحيل.
 */

export const metadata = { title: "قوائم أسعاري" };

const ERROR_MESSAGES: Record<string, string> = {
  already_pending: "هذا المسار مُرسَل بالفعل وينتظر مراجعة الإدارة.",
  delete_locked:
    "لا يمكن حذف مسار معتمد أو قيد الاعتماد — راسل الإدارة لسحبه حتى لا تختفي تغطية من تحت عروض قائمة.",
  sheet_title: "اسم الكشف حقل إلزامي — سمِّه باسم يميّزه مثل «أسعار ٢٠٢٦».",
  sheet_locked: "لا يمكن حذف كشف فيه مسار معتمد يعمل الآن.",
  notfound: "العنصر غير موجود أو ليس لحسابك.",
};

export default async function PortalPricesPage({
  searchParams,
}: PageProps<"/portal/prices">) {
  const [query, access] = await Promise.all([searchParams, portalSetupAccess()]);
  if (!access.ok) return null;

  const { supabase, sub } = access;

  const [{ sheets, ready: sheetsReady }, { routes, ready }] = await Promise.all([
    loadSheets(supabase, sub.id),
    loadRoutes(supabase, sub.id),
  ]);

  if (!ready) {
    return (
      <div className="space-y-6">
        <PageHeading title="قوائم أسعاري" />
        <NotReadyNotice what="قوائم الأسعار" />
      </div>
    );
  }

  const loose = routes.filter((r) => r.sheetId === null);
  const counts = await countItemsByRoute(supabase, loose.map((r) => r.id));

  const saved = query.saved === "1";
  const submitted = query.submitted === "1";
  const deleted = query.deleted === "1";
  const error = typeof query.error === "string" ? query.error : null;

  return (
    <div className="space-y-6">
      <PageHeading
        title="قوائم أسعاري"
        help="القائمة (الكشف) تضم مسارات كثيرة وتُرسَل للاعتماد مرة واحدة. لا مسار يدخل التسعير قبل أن تعتمده الإدارة."
      >
        سجّل تكلفتك في كل مسار تغطّيه. الأرقام تكلفتك للاتجاه الواحد، والمنصة تضيف هامشها
        فوقها قبل عرض السعر على العميل.
      </PageHeading>

      <Banners
        saved={saved || submitted || deleted}
        error={error}
        errorMessages={ERROR_MESSAGES}
        savedMessage={
          deleted ? "حُذف." : submitted ? "أُرسل للاعتماد." : "حُفظ."
        }
      />

      {!sheetsReady && (
        <Notice tone="warning">
          <p className="font-semibold">كشوف الأسعار غير متاحة على الخادم بعد</p>
          <p>
            المسارات أدناه تعمل كما هي. تجميعها في كشف واحد يحتاج هجرة{" "}
            <code dir="ltr">0102</code> — تواصل مع الإدارة.
          </p>
        </Notice>
      )}

      {/* ------------------------------------------------------------ */}
      {/* الكشوف — المستوى الأعلى                                       */}
      {/* ------------------------------------------------------------ */}
      {sheetsReady && (
        <Card className="gap-4 p-5">
          <div className="flex flex-wrap items-center gap-2">
            <FolderPlus className="size-4 shrink-0 text-primary" aria-hidden="true" />
            <h3 className="font-heading text-base font-bold">كشف أسعار جديد</h3>
          </div>
          <p className="text-sm leading-relaxed text-muted-foreground">
            الكشف وعاء لمسارات كثيرة. أنشئه ثم ارفع ملف CSV بمساراتك كلها، وأرسله للاعتماد
            بطلبٍ واحد بدل طلب لكل مسار.
          </p>
          <form action={saveSheet.bind(null, null)} className="flex flex-wrap items-end gap-3">
            <div className="min-w-56 flex-1">
              <TextField
                id="new-sheet-title"
                label="اسم الكشف"
                name="title"
                placeholder="أسعار ٢٠٢٦"
                required
                maxLength={160}
              />
            </div>
            <Button type="submit">
              <Plus aria-hidden="true" />
              إنشاء
            </Button>
          </form>
        </Card>
      )}

      {sheetsReady && sheets.length > 0 && (
        <div className="space-y-3">
          {sheets.map((sheet) => (
            <Card key={sheet.id} className="gap-3 p-5">
              <div className="flex flex-wrap items-center gap-2">
                <ReceiptText className="size-4 shrink-0 text-primary" aria-hidden="true" />
                <Link
                  href={`/portal/prices/sheets/${sheet.id}`}
                  className="min-w-0 font-heading text-base font-bold transition-colors hover:text-primary hover:underline"
                >
                  {sheet.title}
                </Link>
                <span className="ms-auto text-xs text-muted-foreground">
                  أُنشئ في {dateLabel(sheet.createdAt)}
                </span>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant="secondary">{routesText(sheet.routes)}</Badge>
                <SheetCounts sheet={sheet} />
              </div>
              {sheet.note ? (
                <p className="text-xs leading-5 text-muted-foreground">{sheet.note}</p>
              ) : null}
              <Link
                href={`/portal/prices/sheets/${sheet.id}`}
                className={cn(buttonVariants({ variant: "outline", size: "sm" }), "self-start")}
              >
                فتح الكشف
              </Link>
            </Card>
          ))}
        </div>
      )}

      {sheetsReady && sheets.length === 0 && loose.length === 0 && (
        <EmptyState
          icon={<ReceiptText className="size-5" aria-hidden="true" />}
          title="لا أسعار بعد"
          action={null}
        >
          أنشئ كشفاً من النموذج أعلاه، ثم ارفع مساراتك دفعةً واحدة. بلا سعرٍ معتمدٍ واحد لا
          تصلك رحلات عبر التغطية.
        </EmptyState>
      )}

      {/* ------------------------------------------------------------ */}
      {/* المسارات المستقلة — النموذج القديم، تبقى تعمل كما هي           */}
      {/* ------------------------------------------------------------ */}
      {loose.length > 0 && (
        <div className="space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <MapPin className="size-4 shrink-0 text-primary" aria-hidden="true" />
            <h3 className="font-heading text-base font-bold">مسارات مستقلة</h3>
            <span className="text-xs text-muted-foreground">
              أُنشئت قبل الكشوف — تعمل كما هي، ولكلٍّ منها اعتمادها الخاص
            </span>
            <Link
              href="/portal/prices/new"
              className={cn(buttonVariants({ variant: "outline", size: "sm" }), "ms-auto")}
            >
              <Plus aria-hidden="true" />
              مسار مستقل
            </Link>
          </div>

          {loose.map((route) => {
            const removable = route.status === "draft" || route.status === "rejected";
            return (
              <Card key={route.id} className="gap-3 p-5">
                <div className="flex flex-wrap items-center gap-2">
                  <Link
                    href={`/portal/prices/${route.id}`}
                    className="min-w-0 font-heading text-base font-bold transition-colors hover:text-primary hover:underline"
                  >
                    {route.title || "مسار بلا عنوان"}
                  </Link>
                  <PriceListStatusBadge status={route.status} />
                  {route.bidirectional ? (
                    <Badge variant="outline" className="gap-1">
                      <Repeat aria-hidden="true" />
                      الاتجاهان
                    </Badge>
                  ) : null}
                  <span className="ms-auto text-xs text-muted-foreground">
                    أُنشئ في {dateLabel(route.createdAt)}
                  </span>
                </div>

                <p className="text-sm text-muted-foreground">
                  {route.originLabel} ← {route.destLabel} ·{" "}
                  {toArabicDigits(counts.get(route.id) ?? 0)} فئة مُسعَّرة
                </p>

                <p className="text-xs leading-5 text-muted-foreground">
                  {LIST_STATUS_HINTS[route.status]}
                </p>

                {route.reviewNote ? (
                  <p className="rounded-lg border border-border bg-muted/40 p-3 text-sm leading-relaxed">
                    <span className="font-medium">ملاحظة الإدارة:</span> {route.reviewNote}
                  </p>
                ) : null}

                <div className="flex flex-wrap items-center gap-2">
                  <Link
                    href={`/portal/prices/${route.id}`}
                    className={cn(buttonVariants({ variant: "outline", size: "sm" }))}
                  >
                    تحرير
                  </Link>
                  {removable && (
                    <>
                      <form action={submitPriceList.bind(null, route.id)}>
                        <Button type="submit" size="sm">
                          <Send aria-hidden="true" />
                          إرسال للاعتماد
                        </Button>
                      </form>
                      <form action={deletePriceList.bind(null, route.id)}>
                        <Button type="submit" size="sm" variant="ghost" className="text-destructive">
                          <Trash2 aria-hidden="true" />
                          حذف
                        </Button>
                      </form>
                    </>
                  )}
                </div>
              </Card>
            );
          })}
        </div>
      )}

      <p className="text-xs leading-5 text-muted-foreground">
        عدد المسارات كلها: {countLabel(routes.length)}. لا شيء منها يدخل التسعير قبل اعتماد
        الإدارة، والمعتمد الذي تعدّله يعود إلى المراجعة تلقائياً.
      </p>
    </div>
  );
}
