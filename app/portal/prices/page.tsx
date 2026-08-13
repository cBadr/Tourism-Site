import Link from "next/link";
import {
  ArrowLeft,
  MapPin,
  MessageSquareWarning,
  Plus,
  ReceiptText,
  Repeat,
  Send,
  Trash2,
} from "lucide-react";

import { formatDistance, toArabicDigits } from "@/components/booking/format";
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
} from "@/components/portal/portal-ui";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { countItemsByList, loadPriceLists, type PortalPriceList } from "../_lib/data";
import { portalAccess } from "../_lib/session";
import { deletePriceList, submitPriceList } from "./actions";

/**
 * قوائم أسعار المتعهد — الشاشة التي يعيش فيها عمله الحقيقي.
 *
 * كل قائمة = مسار بنقطتين ونطاقيهما وأسعار فئاته. الحالة هي البطل هنا: المتعهد
 * يحتاج أن يعرف بنظرة واحدة أي قوائمه تعمل فعلاً (المعتمدة) وأيها ينتظره هو
 * (المسودة والمرفوضة) وأيها ينتظر الإدارة (قيد الاعتماد) — ولذلك تتصدر الشارةُ
 * البطاقةَ وتُعرض ملاحظة المراجعة كاملة بلا طيّ.
 */

export const metadata = { title: "قوائم أسعاري" };

const ERROR_MESSAGES: Record<string, string> = {
  already_pending: "هذه القائمة مُرسَلة بالفعل وتنتظر مراجعة الإدارة.",
  delete_locked:
    "لا يمكن حذف قائمة معتمدة أو قيد الاعتماد — راسل الإدارة لسحبها حتى لا تختفي تغطية من تحت عروض قائمة.",
};

function ListCard({ list, itemCount }: { list: PortalPriceList; itemCount: number }) {
  // المسودة والمرفوضة وحدهما بانتظار خطوة من المتعهد؛ المعتمدة تعمل والمُرسَلة عند الإدارة
  const removable = list.status === "draft" || list.status === "rejected";
  const sendable = removable;

  return (
    <Card className="gap-4 p-5">
      <div className="flex flex-wrap items-center gap-2">
        <ReceiptText className="size-4 shrink-0 text-primary" aria-hidden="true" />
        <h3 className="min-w-0 font-heading text-base font-bold">
          {list.title || "قائمة بلا عنوان"}
        </h3>
        <PriceListStatusBadge status={list.status} />
        {list.bidirectional ? (
          <Badge variant="outline" className="gap-1">
            <Repeat aria-hidden="true" />
            الاتجاهان
          </Badge>
        ) : null}
        <span className="ms-auto text-xs text-muted-foreground">
          أُنشئت في {dateLabel(list.createdAt)}
        </span>
      </div>

      <p className="text-xs leading-5 text-muted-foreground">{LIST_STATUS_HINTS[list.status]}</p>

      <div className="grid gap-3 sm:grid-cols-2">
        {[
          { label: "من", place: list.originLabel, radius: list.originRadiusKm },
          { label: "إلى", place: list.destLabel, radius: list.destRadiusKm },
        ].map((point) => (
          <div key={point.label} className="rounded-xl bg-muted/60 p-3">
            <div className="flex items-center gap-2 text-sm font-medium">
              <MapPin className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
              <span className="text-muted-foreground">{point.label}</span>
              <span className="min-w-0 truncate">{point.place || "—"}</span>
            </div>
            <p className="mt-1 text-xs text-muted-foreground">
              نطاق التغطية: {formatDistance(point.radius)} حول هذه النقطة
            </p>
          </div>
        ))}
      </div>

      <p className="text-sm text-muted-foreground">
        {itemCount > 0
          ? `مُسعَّرة لـ ${countLabel(itemCount)} من الفئات.`
          : "لا فئات مُسعَّرة في هذه القائمة بعد."}
      </p>

      {list.reviewNote ? (
        <div className="flex items-start gap-2 rounded-xl border border-amber-300 bg-amber-50 p-3 text-sm leading-relaxed text-amber-900 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-100">
          <MessageSquareWarning className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
          <span>
            <span className="font-semibold">ملاحظة الإدارة: </span>
            {list.reviewNote}
          </span>
        </div>
      ) : null}

      <div className="flex flex-wrap items-center gap-2">
        <Link
          href={`/portal/prices/${list.id}`}
          className={cn(buttonVariants({ variant: "outline", size: "sm" }))}
        >
          فتح القائمة وتعديلها
          <ArrowLeft aria-hidden="true" />
        </Link>

        {sendable ? (
          <form action={submitPriceList.bind(null, list.id)}>
            <Button type="submit" size="sm" variant="secondary">
              <Send aria-hidden="true" />
              إرسال للاعتماد
            </Button>
          </form>
        ) : null}

        {removable ? (
          <details className="ms-auto">
            <summary className="w-fit cursor-pointer list-none text-xs text-muted-foreground transition-colors hover:text-destructive">
              حذف القائمة
            </summary>
            <form
              action={deletePriceList.bind(null, list.id)}
              className="mt-2 flex flex-wrap items-center gap-3 rounded-xl bg-muted/60 p-3"
            >
              <p className="min-w-0 flex-1 text-xs leading-5 text-muted-foreground">
                يحذف القائمة وأسعار فئاتها نهائياً.
              </p>
              <Button type="submit" variant="destructive" size="sm">
                <Trash2 aria-hidden="true" />
                تأكيد الحذف
              </Button>
            </form>
          </details>
        ) : null}
      </div>
    </Card>
  );
}

export default async function PortalPricesPage({ searchParams }: PageProps<"/portal/prices">) {
  const [params, access] = await Promise.all([searchParams, portalAccess()]);
  if (!access.ok) return null;

  const { supabase, sub } = access;
  const { lists, ready } = await loadPriceLists(supabase, sub.id);
  const itemCounts = await countItemsByList(
    supabase,
    lists.map((list) => list.id)
  );

  const saved = params.saved === "1";
  const submitted = params.submitted === "1";
  const deleted = params.deleted === "1";
  const error = typeof params.error === "string" ? params.error : null;

  return (
    <div className="space-y-6">
      <PageHeading
        title="قوائم أسعاري"
        help="القائمة تغطي مساراً لا نقطتين بعينهما: أي رحلة تقع بدايتها ونهايتها داخل النطاقين تُسعَّر منها."
        action={
          <Link href="/portal/prices/new" className={cn(buttonVariants())}>
            <Plus aria-hidden="true" />
            قائمة جديدة
          </Link>
        }
      >
        لكل مسار تعمل عليه قائمة واحدة تحمل تكلفتك في كل فئة. المعتمدة وحدها تدخل تسعير
        الرحلات، والتعديل عليها يعيدها للمراجعة.
      </PageHeading>

      <Banners
        saved={saved || submitted || deleted}
        error={error}
        errorMessages={ERROR_MESSAGES}
        savedMessage={
          submitted
            ? "أُرسلت القائمة للاعتماد — ستصلك نتيجة المراجعة من الإدارة."
            : deleted
              ? "حُذفت القائمة."
              : "حُفظت القائمة."
        }
      />

      {!ready ? <NotReadyNotice what="قوائم الأسعار" /> : null}

      {ready && lists.length === 0 ? (
        <EmptyState
          icon={<ReceiptText className="size-5" aria-hidden="true" />}
          title="لا توجد قوائم أسعار بعد"
          action={
            <Link href="/portal/prices/new" className={cn(buttonVariants())}>
              <Plus aria-hidden="true" />
              أنشئ أول قائمة
            </Link>
          }
        >
          قائمة الأسعار هي الطريقة الوحيدة التي يعرف بها النظام أنك تغطي مساراً وبكم. ابدأ
          بالمسار الذي تنفّذه أكثر من غيره: حدّد نقطتيه ونطاق كل نقطة، ثم اكتب تكلفتك في
          الفئات التي تملك فيها مركبات.
        </EmptyState>
      ) : null}

      {lists.map((list) => (
        <ListCard key={list.id} list={list} itemCount={itemCounts.get(list.id) ?? 0} />
      ))}

      {ready && lists.length > 0 ? (
        <Notice tone="info">
          <p>
            عندك {toArabicDigits(lists.length)} من القوائم. كلما ضاق النطاق كانت تكلفتك أدق،
            وكلما اتسع غطّيت رحلات أكثر بسعر واحد — والاختيار بينهما قرارك أنت.
          </p>
        </Notice>
      ) : null}
    </div>
  );
}
