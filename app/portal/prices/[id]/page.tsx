import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowRight, Flag, MapPin, MessageSquareWarning, Save, Send } from "lucide-react";

import { PlacePicker } from "@/components/portal/place-picker";
import {
  Banners,
  CheckboxField,
  controlClass,
  countLabel,
  LIST_STATUS_HINTS,
  Notice,
  NotReadyNotice,
  NumberField,
  PageHeading,
  PriceListStatusBadge,
  TextField,
} from "@/components/portal/portal-ui";
import { HelpTip } from "@/components/shared/HelpTip";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { loadCurrency, loadPriceListItems } from "../../_lib/data";
import { isSchemaMissing, portalSetupAccess } from "../../_lib/session";
import { loadCoveredClasses, ROUTE_COLUMNS, toRoute, type PortalRoute } from "../_lib/sheets";
import { savePriceList } from "../actions";

/**
 * محرر **المسار** الواحد — الشاشة الوحيدة في البورتال التي تُدخل بيانات تدخل
 * محرك التسعير نقطةً نقطة. والمسار قد يكون داخل كشف (‏`?sheet=`) أو مستقلاً.
 *
 * 🔴 الفئات المعروضة هنا = فئات أسطول المتعهد وحدها، ومصدرها `price_sheet_classes`
 *    في Postgres — **التعريف الوحيد**. وفئةٌ مُسعَّرة في هذا المسار تبقى ظاهرة ولو
 *    لم يعد يملك فيها مركبة، لأن إخفاءها يعني محوَ سعرها بصمت في أول حفظ.
 *
 * ثلاث حقائق يجب أن تصل للمتعهد من الشاشة نفسها لا من دليل استخدام:
 * (١) النقطتان مرساتان لا وجهتان: النطاق حولهما هو ما يجعل «مصر الجديدة ← المعمورة»
 *     تُطابق قائمة «القاهرة ← الإسكندرية».
 * (٢) الرقم المكتوب تكلفته هو، لاتجاه واحد، والمنصة تضيف هامشها فوقه.
 * (٣) تعديل قائمة معتمدة يوقفها عن العمل حتى تُراجَع من جديد — ولذلك التنبيه بارز
 *     فوق النموذج لا في تلميح مخفي.
 *
 * المعرّف `new` في المسار يعني قائمة جديدة — لا مسار إضافي في العقد.
 */

export const metadata = { title: "قائمة أسعار" };

const ERROR_MESSAGES: Record<string, string> = {
  title: "عنوان القائمة حقل إلزامي — سمِّها باسم المسار مثل «القاهرة ← الإسكندرية».",
  origin_place: "اختر نقطة البداية من قائمة الاقتراحات حتى نعرف موقعها بدقة.",
  dest_place: "اختر نقطة النهاية من قائمة الاقتراحات حتى نعرف موقعها بدقة.",
  origin_radius: "نطاق نقطة البداية يجب أن يكون رقماً بين ٠ و٥٠٠ كم.",
  dest_radius: "نطاق نقطة النهاية يجب أن يكون رقماً بين ٠ و٥٠٠ كم.",
  cost: "قيم التكلفة يجب أن تكون أرقاماً أكبر من صفر — اترك الفئة فارغة إن كنت لا تغطيها.",
  cost_required:
    "اكتب تكلفتك في كل فئة تملك فيها مركبات في الخدمة — تركها فارغة يخرجك من عروض تخصك.",
  no_items: "لم تُسعّر أي فئة — القائمة بلا سعر واحد لا تفيد شيئاً.",
  classes: "لا فئة يمكنك تسعيرها — سجّل مركبةً واحدة على الأقل من شاشة «أسطولي» أولاً.",
  sheet: "تعذّر ضمّ المسار إلى الكشف — تأكد أن الكشف لحسابك ثم أعد المحاولة.",
};

/** بطاقة نقطة: مكان بإكمال تلقائي + نطاق كيلومترات حوله */
function EndpointCard({
  prefix,
  title,
  icon,
  place,
  radius,
  placeholder,
}: {
  prefix: "origin" | "dest";
  title: string;
  icon: React.ReactNode;
  place: { label: string; lat: number; lng: number } | null;
  radius: number | null;
  placeholder: string;
}) {
  return (
    <Card className="gap-4 p-5">
      <div className="flex items-center gap-2">
        <span className="text-primary">{icon}</span>
        <h3 className="font-heading text-base font-bold">{title}</h3>
      </div>

      <PlacePicker
        id={`${prefix}-place`}
        name={prefix}
        label="المكان"
        placeholder={placeholder}
        defaultPlace={place}
        help="ابحث بالاسم واختر من الاقتراحات — نحفظ إحداثيات النقطة لا نصها."
      />

      <NumberField
        id={`${prefix}-radius`}
        label="نطاق التغطية حول النقطة (كم)"
        name={`${prefix}_radius_km`}
        defaultValue={radius}
        placeholder="50"
        min={0}
        max={500}
        step="1"
        required
        help="المسافة الهوائية من النقطة في كل الاتجاهات."
        hint="مثال: ٥٠ كم حول القاهرة تعني أن أي نقطة داخل هذا النطاق — مصر الجديدة أو المعادي أو ٦ أكتوبر — تُعتبر داخل تغطيتك."
      />
    </Card>
  );
}

export default async function PortalPriceListPage({
  params,
  searchParams,
}: PageProps<"/portal/prices/[id]">) {
  const [{ id }, query, access] = await Promise.all([params, searchParams, portalSetupAccess()]);
  if (!access.ok) return null;

  const { supabase, sub } = access;
  const isNew = id === "new";

  let list: PortalRoute | null = null;
  let items = new Map<string, number>();

  if (!isNew) {
    const res = await supabase
      .from("price_lists")
      .select(ROUTE_COLUMNS)
      .eq("id", id)
      .eq("subcontractor_id", sub.id)
      .maybeSingle();

    if (res.error && isSchemaMissing(res.error)) {
      return (
        <div className="space-y-6">
          <PageHeading title="قائمة أسعار" />
          <NotReadyNotice what="قوائم الأسعار" />
        </div>
      );
    }
    if (res.error || !res.data) notFound();

    list = toRoute(res.data as Record<string, unknown>);
    items = await loadPriceListItems(supabase, list.id);
  }

  const [{ classes }, currency] = await Promise.all([
    loadCoveredClasses(supabase, undefined, isNew ? undefined : id),
    loadCurrency(supabase),
  ]);

  // الكشف الذي ينتمي إليه المسار: من الصف نفسه، أو من الرابط عند الإنشاء
  const sheetId =
    list?.sheetId ?? (typeof query.sheet === "string" && query.sheet.trim() !== ""
      ? query.sheet.trim()
      : null);

  const saved = query.saved === "1";
  const submitted = query.submitted === "1";
  const error = typeof query.error === "string" ? query.error : null;
  const isApproved = list?.status === "approved";

  return (
    <div className="space-y-6">
      <Link
        href={sheetId ? `/portal/prices/sheets/${sheetId}` : "/portal/prices"}
        className="inline-flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-primary"
      >
        <ArrowRight className="size-4" aria-hidden="true" />
        {sheetId ? "العودة إلى الكشف" : "كل قوائم الأسعار"}
      </Link>

      <PageHeading
        title={isNew ? "مسار جديد" : list?.title || "مسار"}
        help="المسار نقطتان ونطاق حول كل منهما، وتكلفتك في كل فئة تغطيها. النطاق هو ما يجعل «مصر الجديدة ← المعمورة» تُطابق «القاهرة ← الإسكندرية»."
        action={list ? <PriceListStatusBadge status={list.status} /> : null}
      >
        {list
          ? LIST_STATUS_HINTS[list.status]
          : sheetId
            ? "احفظه مسودة، ثم أرسل الكشف كله للاعتماد من صفحته بطلبٍ واحد."
            : "احفظه مسودة أولاً، وأرسله للاعتماد متى اكتمل."}
      </PageHeading>

      <Banners
        saved={saved || submitted}
        error={error}
        errorMessages={ERROR_MESSAGES}
        savedMessage={
          submitted
            ? "أُرسلت القائمة للاعتماد — ستصلك نتيجة المراجعة من الإدارة."
            : "حُفظت القائمة."
        }
      />

      {isApproved ? (
        <Notice tone="warning">
          <p className="font-semibold">هذه القائمة معتمدة وتعمل الآن</p>
          <p>
            أي تعديل تحفظه هنا يعيدها تلقائياً إلى «قيد الاعتماد»، فتتوقف عن دخول التسعير حتى
            تراجعها الإدارة من جديد. إن كان تعديلك طفيفاً فتأكد أنه يستحق التوقف المؤقت.
          </p>
        </Notice>
      ) : null}

      {list?.reviewNote ? (
        <Notice tone="info" icon={<MessageSquareWarning className="size-5 shrink-0" />}>
          <p className="font-semibold">ملاحظة الإدارة على هذه القائمة</p>
          <p>{list.reviewNote}</p>
        </Notice>
      ) : null}

      {classes.length === 0 ? (
        <Notice tone="warning">
          <p>{ERROR_MESSAGES.classes}</p>
        </Notice>
      ) : null}

      <form action={savePriceList.bind(null, isNew ? null : id)} className="space-y-6">
        {isNew && sheetId ? <input type="hidden" name="sheet_id" value={sheetId} /> : null}
        <Card className="gap-4 p-5">
          <TextField
            id="title"
            label="عنوان المسار"
            name="title"
            defaultValue={list?.title}
            placeholder="القاهرة ← الإسكندرية"
            required
            maxLength={160}
            help="اسم داخلي يميّز المسار عندك وعند الإدارة — لا يظهر للعميل."
          />
        </Card>

        <div className="grid gap-4 lg:grid-cols-2">
          <EndpointCard
            prefix="origin"
            title="نقطة البداية"
            icon={<MapPin className="size-5" aria-hidden="true" />}
            placeholder="مثل «القاهرة»"
            place={
              list ? { label: list.originLabel, lat: list.originLat, lng: list.originLng } : null
            }
            radius={list?.originRadiusKm ?? null}
          />
          <EndpointCard
            prefix="dest"
            title="نقطة النهاية"
            icon={<Flag className="size-5" aria-hidden="true" />}
            placeholder="مثل «الإسكندرية»"
            place={list ? { label: list.destLabel, lat: list.destLat, lng: list.destLng } : null}
            radius={list?.destRadiusKm ?? null}
          />
        </div>

        <Card className="gap-3 p-5">
          <CheckboxField
            name="bidirectional"
            label="القائمة تغطي الاتجاه المعاكس أيضاً"
            defaultChecked={list?.bidirectional ?? true}
            help="بتفعيلها تُطابَق أيضاً الرحلات القادمة من نطاق النهاية إلى نطاق البداية بنفس الأسعار."
          />
          <p className="text-xs leading-5 text-muted-foreground">
            أطفئها فقط إن كانت تكلفتك في اتجاه العودة مختلفة — عندها أنشئ لها قائمة مستقلة.
          </p>
        </Card>

        <Card className="gap-0 p-5">
          <div className="flex flex-wrap items-baseline justify-between gap-2 pb-1">
            <h3 className="flex items-center gap-1.5 font-heading text-base font-bold">
              تكلفتك في كل فئة
              <HelpTip>
                الرقم هنا تكلفتك أنت للاتجاه الواحد. المنصة تضيف هامشها فوقه وتعرض السعر
                النهائي على العميل، وعند تعدد المتعهدين المغطّين يُحتسب العرض على أقلهم تكلفة.
              </HelpTip>
            </h3>
            {currency ? (
              <span className="text-xs text-muted-foreground">القيم بعملة {currency}</span>
            ) : null}
          </div>
          <p className="pb-3 text-sm leading-relaxed text-muted-foreground">
            المعروض هنا فئات مركباتك في الخدمة وحدها، وكلها إلزامية. الفراغ يعني «لا أغطي
            هذه الفئة» ولا يعني صفراً.
          </p>

          <div>
            {classes.map((cls) => {
              const owned = cls.covered;
              const fieldId = `cost-${cls.slug}`;
              return (
                <div
                  key={cls.slug}
                  className="flex flex-wrap items-center gap-3 border-t border-border py-3"
                >
                  <div className="min-w-40 flex-1">
                    <Label htmlFor={fieldId} className="flex flex-wrap items-center gap-2">
                      {cls.title}
                      {cls.capacity ? (
                        <span className="text-xs font-normal text-muted-foreground">
                          حتى {countLabel(cls.capacity)} ركاب
                        </span>
                      ) : null}
                      {owned ? (
                        <Badge variant="secondary" className="text-[10px]">
                          لديك مركبات
                        </Badge>
                      ) : null}
                    </Label>
                    <p className="mt-0.5 text-xs leading-5 text-muted-foreground">
                      {owned
                        ? "إلزامية لأن لديك مركبة في الخدمة من هذه الفئة."
                        : "لم يعد لديك مركبة في الخدمة من هذه الفئة — امسح الرقم لإزالة تغطيتها، أو سجّل المركبة من «أسطولي»."}
                    </p>
                  </div>
                  <input
                    id={fieldId}
                    name={`cost.${cls.slug}`}
                    type="number"
                    inputMode="decimal"
                    dir="ltr"
                    min={1}
                    step="0.01"
                    required={owned}
                    defaultValue={items.get(cls.slug) ?? ""}
                    placeholder={owned ? "" : "لا أغطي"}
                    className={`${controlClass} w-36 shrink-0`}
                  />
                </div>
              );
            })}
          </div>

          {classes.length === 0 ? (
            <p className="border-t border-border pt-3 text-xs leading-5 text-muted-foreground">
              لا مركبات في الخدمة على حسابك بعد، فلا فئة تُعرض للتسعير. سجّل مركباتك من شاشة
              «أسطولي» ثم عُد إلى هنا — لا نسألك عن سعر فئةٍ لا تنفّذها.
            </p>
          ) : null}
        </Card>

        <Separator />

        <div className="flex flex-wrap items-center justify-end gap-3">
          <p className="me-auto max-w-md text-xs leading-5 text-muted-foreground">
            الحفظ يبقي القائمة عندك دون إشعار الإدارة. الإرسال ينقلها إلى «قيد الاعتماد»
            وتصبح جاهزة للمراجعة — ولا تدخل التسعير قبل أن تُعتمد.
          </p>
          <Button type="submit" name="intent" value="draft" variant="outline">
            <Save aria-hidden="true" />
            حفظ كمسودة
          </Button>
          <Button type="submit" name="intent" value="submit">
            <Send aria-hidden="true" />
            إرسال للاعتماد
          </Button>
        </div>
      </form>
    </div>
  );
}
