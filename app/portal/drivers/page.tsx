import Link from "next/link";
import {
  CircleSlash,
  IdCard,
  ListChecks,
  Plus,
  Power,
  PowerOff,
  Trash2,
  X,
} from "lucide-react";

import {
  Banners,
  CheckboxField,
  countLabel,
  dateLabel,
  EmptyState,
  NotReadyNotice,
  Notice,
  PageHeading,
  TextField,
} from "@/components/portal/portal-ui";
import { HelpTip } from "@/components/shared/HelpTip";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { cn } from "@/lib/utils";
import { portalSetupAccess } from "../_lib/session";
import { DriverDocs, LicenseBadge } from "./_components/driver-docs";
import { createDriver, deleteDriver, saveDriver, toggleDriver } from "./actions";
import {
  loadDriverTripsReport,
  loadDrivers,
  type DriverTripStats,
  type PortalDriver,
} from "./data";

/**
 * سجلّ سائقي المتعهد — من ينفّذ الرحلة فعلاً.
 *
 * ⚠ **السجلّ ملك الشريك لا المنصة**: «قسم السائقين أُلغي بقرار بدر (2026-08-11)
 * — لا إدارة سائقين مباشرين إطلاقاً». فهذه الشاشة نظير `/portal/fleet` حرفاً
 * بحرف: يملؤها المتعهد ويديرها بنفسه، ولا شاشة تقابلها في `/admin`. المنصة
 * **تعرض** ما أعلنه الشريك ولا **تدير** من ينفّذ.
 *
 * وما يقرؤه العميل من هذا السجلّ بعد الإسناد: الاسم والهاتف لا غير. رقم الرخصة
 * لا يخرج من نوع إرجاع `get_booking_by_token` أصلاً، والهاتف محجوب **داخل
 * القاعدة** حتى تحلّ نافذته قبل موعد الالتقاء — لا في هذه الشاشة ولا في أي JSX.
 *
 * ── 🔒 وما أضافته 0120: الصورة والرخصة، وحدودُ من يراهما ─────────────────
 *
 * | من | يرى ماذا |
 * |---|---|
 * | **العميل** | لا شيء من هذا اللوح — ولا حقلَ صورةٍ ولا رخصةٍ في نوع إرجاع `get_booking_by_token` أصلاً |
 * | **المتعهد** | صور سائقيه **هو** ورخصهم — والسياسة تقيّد المسار بـ`current_subcontractor_id()` فلا يبلغ منافسه (D-19 · D-20) |
 * | **اللوحة** | كل شيء، بـ`is_admin()` |
 *
 * ولا مسار خام يصل هذه الشاشة: `data.ts` يحوّل المسارات إلى **روابط موقَّعة
 * عمرها دقيقة**، والتوقيع بجلسة الشريك نفسها — فالسياسة هي الحارس لا `.eq()`.
 *
 * ══════════════════════════════════════════════════════════════════════════
 *  🔴 ترتيب الشاشة — ملاحظة بدر (2026-08-19) بنصّها
 * ══════════════════════════════════════════════════════════════════════════
 *
 * «أرى أن واجهة الصفحة عبارة عن تعديل مباشر وإضافة مباشرة للسائقين، في حين أنه
 * من المناسب أن تبدأ الصفحة بعرض السائقين وتقارير الرحلات لكل سائق، مع مراعاة
 * إدراج جدول السائقين وتنظيم خيارات التعديل والإضافة.»
 *
 * فصارت: **جدولٌ أولاً** (اسم · حالة · رخصة · مستندات · رحلاته)، ثم لوحُ تحريرٍ
 * **لسائقٍ واحد** يُفتح بزرّ. وما كان أربعة نماذج مفتوحة لأربعة سائقين صار
 * قراءةً واحدة يفتح منها ما يريد.
 *
 * 🔴 **ولماذا الفتح بالرابط (`?edit=`) لا بحالةٍ في المتصفح** — والسبب مقيسٌ
 *   لا مُشتهى: صورُ المستندات روابطُ موقَّعة **عمرها دقيقة**
 *   (‏`DRIVER_DOC_URL_TTL`)، ولوحٌ يُطوى ويُفتح بجافاسكربت بعد دقيقتين يعرض
 *   مربّعاً فارغاً — وهو بعينه العطل الذي عولج في `lib/drivers/doc-thumb.tsx`
 *   في 2026-08-18. أما الرابط فيُعيد تصيير الصفحة، **فيُوقَّع الرابط من جديد
 *   لحظة الفتح**. ولذلك أيضاً تعود إجراءات السائق إلى `?edit=<id>` بعد الحفظ:
 *   رفعُ صورةٍ ثم عودةٌ إلى لوحٍ مغلق يعني ألّا يرى الشريك ما رفعه.
 *   ⚠ ولا `loading="lazy"` على أيٍّ من هذه الصور — القفل الثالث في تلك الوحدة.
 */

export const metadata = { title: "سائقيّ" };

const ERROR_MESSAGES: Record<string, string> = {
  name: "اسم السائق حقل إلزامي — اكتبه كاملاً كما سيقرأه العميل.",
  phone: "رقم هاتف السائق غير صالح — اكتب رقماً كاملاً (٨ أرقام فأكثر).",
  license: "رقم الرخصة قصير — اتركه فارغاً أو اكتبه كاملاً (٣ خانات فأكثر).",
  expiry: "تاريخ انتهاء الرخصة غير صالح — اختره من التقويم أو اتركه فارغاً.",
  doc_type: "نوع الملف غير مقبول — ارفع صورة JPG أو PNG أو WEBP أو ملف PDF.",
  doc_size: "الملف أكبر من ٥ ميجابايت — صغّر الصورة ثم أعد الرفع.",
  doc_empty: "لم تختر ملفاً — اختر ملفاً من جهازك ثم اضغط رفع.",
  upload: "تعذّر رفع الملف — تأكد من نوعه وحجمه، وإن تكرر فأبلغ الإدارة.",
};

/**
 * حقل تاريخٍ محلّي — `TextField` المشتركة تقبل `text/email/tel/url` لا `date`،
 * وتوسيعُها ملفٌّ مشترك يبنيه غيري الآن. فالحقل هنا، ونقله إليها لاحقاً توسعة
 * لا تغيير.
 */
function DateField({
  id,
  label,
  name,
  defaultValue,
  help,
  hint,
  disabled,
}: {
  id: string;
  label: string;
  name: string;
  defaultValue?: string | null;
  help?: string;
  hint?: string;
  disabled?: boolean;
}) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id} className="flex items-center gap-1.5">
        {label}
        {help ? <HelpTip>{help}</HelpTip> : null}
      </Label>
      <Input
        id={id}
        name={name}
        type="date"
        dir="ltr"
        defaultValue={defaultValue ?? ""}
        disabled={disabled}
        min="1970-01-01"
        max="2100-01-01"
      />
      {hint ? <p className="text-xs leading-5 text-muted-foreground">{hint}</p> : null}
    </div>
  );
}

/** حالة المستندات في الجدول — ثلاث حالات لا تُخلط (نفس تفريق `driver-docs.tsx`) */
function DocsCell({ driver }: { driver: PortalDriver }) {
  const both = driver.hasPhoto && driver.hasLicensePhoto;
  const none = !driver.hasPhoto && !driver.hasLicensePhoto;

  if (none && driver.docsPurgedAt) {
    return (
      <span className="text-xs text-muted-foreground">
        حُذفت بانقضاء مدة الحفظ — سلوك النظام لا عطل
      </span>
    );
  }

  return (
    <div className="flex flex-wrap gap-1">
      <Badge variant={driver.hasPhoto ? "secondary" : "outline"} className="text-[11px] font-normal">
        الصورة {driver.hasPhoto ? "موجودة" : "ناقصة"}
      </Badge>
      <Badge
        variant={driver.hasLicensePhoto ? "secondary" : "outline"}
        className="text-[11px] font-normal"
      >
        الرخصة {driver.hasLicensePhoto ? "موجودة" : "ناقصة"}
      </Badge>
      {both ? null : (
        <span className="text-[11px] leading-5 text-muted-foreground">اختيارية</span>
      )}
    </div>
  );
}

/** خانة الرحلات — عددٌ مع تفصيله، وآخر رحلة بمرجعها ومسارها */
function TripsCell({
  stats,
  readable,
}: {
  stats: DriverTripStats | undefined;
  readable: boolean;
}) {
  if (!readable) {
    return (
      <span className="text-xs text-muted-foreground">
        ربط الرحلة بالسائق غير مقروء من الخادم الآن
      </span>
    );
  }
  if (!stats || stats.total === 0) {
    return <span className="text-xs text-muted-foreground">لم تُسنَد إليه رحلة بعد</span>;
  }

  return (
    <div className="space-y-1">
      <div className="flex flex-wrap items-center gap-1.5">
        <Badge variant="secondary">{countLabel(stats.total)} رحلة</Badge>
        {stats.upcoming > 0 ? (
          <span className="text-[11px] text-muted-foreground">
            قادمة {countLabel(stats.upcoming)}
          </span>
        ) : null}
        {stats.completed > 0 ? (
          <span className="text-[11px] text-muted-foreground">
            منفَّذة {countLabel(stats.completed)}
          </span>
        ) : null}
        {stats.troubled > 0 ? (
          <span className="text-[11px] text-amber-700 dark:text-amber-300">
            ملغاة أو متعثّرة {countLabel(stats.troubled)}
          </span>
        ) : null}
      </div>
      {stats.last ? (
        <p className="text-[11px] leading-5 text-muted-foreground">
          آخرها <span dir="ltr">{stats.last.reference}</span> · {stats.last.originLabel} ←{" "}
          {stats.last.destLabel}
          {stats.last.pickupAt ? ` · ${dateLabel(stats.last.pickupAt)}` : ""}
        </p>
      ) : null}
    </div>
  );
}

/** لوح تحرير سائقٍ واحد — يُفتح بالرابط، فتُوقَّع روابط صوره لحظة فتحه */
function DriverPanel({ driver }: { driver: PortalDriver }) {
  const f = (field: string) => `${driver.id}-${field}`;

  return (
    <Card className="gap-4 p-5" id="driver-panel">
      <div className="flex flex-wrap items-center gap-2">
        <IdCard className="size-4 shrink-0 text-primary" aria-hidden="true" />
        <h3 className="font-heading text-base font-bold">{driver.name || "سائق بلا اسم"}</h3>
        <Badge variant={driver.active ? "default" : "secondary"}>
          {driver.active ? "في الخدمة" : "خارج الخدمة"}
        </Badge>
        <LicenseBadge driver={driver} />
        <Link
          href="/portal/drivers"
          className={cn(buttonVariants({ variant: "ghost", size: "sm" }), "ms-auto")}
        >
          <X aria-hidden="true" />
          إغلاق
        </Link>
        <form action={toggleDriver.bind(null, driver.id)}>
          <Button
            type="submit"
            variant="ghost"
            size="sm"
            title={
              driver.active
                ? "إيقاف السائق مؤقتاً — يبقى في سجلك ولا يظهر في قائمة إسناد الرحلات"
                : "إعادة السائق إلى الخدمة"
            }
          >
            {driver.active ? <PowerOff aria-hidden="true" /> : <Power aria-hidden="true" />}
            {driver.active ? "إيقاف" : "تشغيل"}
          </Button>
        </form>
      </div>

      <form action={saveDriver.bind(null, driver.id)} className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <TextField
            id={f("name")}
            label="اسم السائق"
            name="name"
            defaultValue={driver.name}
            required
            maxLength={120}
            help="هذا الاسم يقرؤه العميل على صفحة متابعة رحلته بعد إسنادها إليك — اكتبه كاملاً وواضحاً."
          />
          <TextField
            id={f("phone")}
            label="هاتف السائق"
            name="phone"
            type="tel"
            dir="ltr"
            defaultValue={driver.phone}
            required
            maxLength={32}
            help="لا يصل العميل فور الإسناد: يظهر له قبل موعد الالتقاء بمدة تضبطها الإدارة، كي يجد سائقه إن تأخر ولا يتخطاك قبل ذلك."
          />
          <TextField
            id={f("license")}
            label="رقم الرخصة"
            name="license_no"
            dir="ltr"
            defaultValue={driver.licenseNo}
            maxLength={40}
            help="سجل داخلي بينك وبين الإدارة — لا يصل العميل إطلاقاً. ويبقى محفوظاً عندنا حتى بعد حذف الصور، كي لا تفقد رحلةٌ قديمة اسم من نفّذها."
          />
          <DateField
            id={f("expiry")}
            label="انتهاء الرخصة"
            name="license_expiry"
            defaultValue={driver.licenseExpiry}
            help="الاتفاقية تُلزمك بإيقاف أي سائق سقطت رخصته. والتاريخ هنا يجعل ذلك ظاهراً لك ولنا قبل أن يقع."
          />
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3">
          <CheckboxField
            name="active"
            label="السائق في الخدمة"
            defaultChecked={driver.active}
            help="السائق الموقوف يبقى بكل بياناته ولا يظهر في قائمة إسناد الرحلات."
          />
          <Button type="submit">حفظ السائق</Button>
        </div>
      </form>

      <Separator />

      {/* المستندات في نماذج مستقلة عن نموذج الحفظ — HTML لا يسمح بتداخل النماذج،
          ورفعُ ملفٍّ لا يجوز أن يُلزم بإعادة إرسال بقية الحقول */}
      <div className="space-y-2">
        <div className="flex items-center gap-2">
          <h4 className="text-sm font-semibold">مستندات السائق</h4>
          <Badge variant="outline" className="text-[11px] font-normal">
            لا تصل العميل
          </Badge>
        </div>
        <p className="text-xs leading-5 text-muted-foreground">
          اختيارية، وتراها أنت والإدارة فقط. أي تعديل على رقم الرخصة أو تاريخها أو صورتها يُلغي
          توثيق الإدارة السابق تلقائياً، فتُراجَع من جديد. وروابط العرض تُولَّد لحظة فتح هذا اللوح
          وعمرها دقيقة — إن قرأت رسالة انتهاء الصلاحية فحدِّث الصفحة ليُولَّد رابط جديد.
        </p>
        <DriverDocs driver={driver} />
      </div>

      {/* الحذف خطوتان بلا جافاسكربت: الكشف ثم التأكيد — ونموذجه مستقل عن نموذج
          الحفظ لأن HTML لا يسمح بتداخل النماذج */}
      <details>
        <summary className="w-fit cursor-pointer list-none text-xs text-muted-foreground transition-colors hover:text-destructive">
          حذف هذا السائق نهائياً
        </summary>
        <form
          action={deleteDriver.bind(null, driver.id)}
          className="mt-2 flex flex-wrap items-center gap-3 rounded-xl bg-muted/60 p-3"
        >
          <p className="min-w-0 flex-1 text-xs leading-5 text-muted-foreground">
            الحذف نهائي ولا يمكن التراجع عنه، ويمحو اسم السائق من صفحات الرحلات التي نفّذها.
            إن كان متوقفاً مؤقتاً فأوقفه بدل حذفه حتى يبقى في سجلك ويبقى ما مضى كما هو.
          </p>
          <Button type="submit" variant="destructive" size="sm">
            <Trash2 aria-hidden="true" />
            تأكيد الحذف
          </Button>
        </form>
      </details>
    </Card>
  );
}

export default async function PortalDriversPage({ searchParams }: PageProps<"/portal/drivers">) {
  const [params, access] = await Promise.all([searchParams, portalSetupAccess()]);
  if (!access.ok) return null;

  const { supabase, sub } = access;
  const [{ drivers, ready }, report] = await Promise.all([
    loadDrivers(supabase, sub.id),
    loadDriverTripsReport(),
  ]);

  const saved = params.saved === "1";
  const deleted = params.deleted === "1";
  const error = typeof params.error === "string" ? params.error : null;

  // اللوح المفتوح يسافر في الرابط: معرّف سائق، أو `new` لنموذج الإضافة
  const edit = typeof params.edit === "string" ? params.edit : null;
  const editing = edit && edit !== "new" ? drivers.find((d) => d.id === edit) ?? null : null;
  const adding = edit === "new";

  const activeCount = drivers.filter((driver) => driver.active).length;
  // الربط بالسائق: لا يُقال «لا رحلات» حين يكون العطل في القراءة نفسها
  const tripsReadable = report.ready && !report.failed && report.linkReadable;

  return (
    <div className="space-y-6">
      <PageHeading
        title="سائقيّ"
        help="سجلك أنت لا سجل المنصة: نحن نعرض للعميل من أعلنته، ولا ندير سائقيك ولا نتواصل معهم. والصور والرخص تُخزَّن في مساحة خاصة لا يصلها العميل ولا أي متعهد آخر، وتُحذف بعد خمس سنوات من انتهاء العلاقة بيننا كما في اتفاقية الشراكة."
        action={
          ready && !adding ? (
            <Link
              href="/portal/drivers?edit=new#driver-panel"
              className={cn(buttonVariants({ size: "sm" }))}
            >
              <Plus aria-hidden="true" />
              إضافة سائق
            </Link>
          ) : null
        }
      >
        سجّل هنا من يقودون رحلاتك مرة واحدة، ثم اخترهم بنقرتين عند إسناد كل رحلة. العميل يقرأ
        اسم السائق وسيارته ليعرف من سيأتيه — ولا يقرأ اسم شركتك ولا ما تتقاضاه.
      </PageHeading>

      <Banners
        saved={saved || deleted}
        error={error}
        errorMessages={ERROR_MESSAGES}
        savedMessage={deleted ? "حُذف السائق." : "حُفظت بيانات السائق."}
      />

      {!ready ? <NotReadyNotice what="سجل السائقين" /> : null}

      {ready && drivers.length === 0 ? (
        <EmptyState
          icon={<IdCard className="size-5" aria-hidden="true" />}
          title="لم تسجّل أي سائق بعد"
          action={
            <Link
              href="/portal/drivers?edit=new#driver-panel"
              className="text-sm text-primary underline underline-offset-4"
            >
              أضف أول سائق الآن
            </Link>
          }
        >
          أكثر ما يقلق العميل بعد الحجز سؤال واحد: من سيأتيني وبأي سيارة. السجل هنا يوفّر عليك
          إعادة كتابة الاسم والهاتف في كل رحلة — تكتبها مرة، ثم يصير إسناد السائق نقرتين. وبلا
          سائق واحد مسجّل يبقى عميلك بلا إجابة، ويبقى هاتفك هو الذي يرن.
        </EmptyState>
      ) : null}

      {/* ------------------------------------------------------------ */}
      {/* الجدول أولاً — قراءةٌ قبل أي نموذج                             */}
      {/* ------------------------------------------------------------ */}
      {ready && drivers.length > 0 ? (
        <Card className="gap-4 p-5">
          <div className="flex flex-wrap items-center gap-2">
            <ListChecks className="size-4 shrink-0 text-primary" aria-hidden="true" />
            <h3 className="font-heading text-base font-bold">سائقوك</h3>
            <span className="text-xs text-muted-foreground">
              {countLabel(drivers.length)} مسجّلاً · {countLabel(activeCount)} في الخدمة
            </span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full min-w-[46rem] text-sm">
              <thead>
                <tr className="border-b border-border text-xs text-muted-foreground">
                  <th className="p-2 text-start font-medium">السائق</th>
                  <th className="p-2 text-start font-medium">الحالة</th>
                  <th className="p-2 text-start font-medium">الرخصة</th>
                  <th className="p-2 text-start font-medium">المستندات</th>
                  <th className="p-2 text-start font-medium">رحلاته</th>
                  <th className="p-2 text-start font-medium"> </th>
                </tr>
              </thead>
              <tbody>
                {drivers.map((driver) => (
                  <tr
                    key={driver.id}
                    className={cn(
                      "border-b border-border last:border-0",
                      editing?.id === driver.id ? "bg-muted/50" : null
                    )}
                  >
                    <td className="p-2 align-top">
                      <Link
                        href={`/portal/drivers?edit=${driver.id}#driver-panel`}
                        className="font-medium transition-colors hover:text-primary hover:underline"
                      >
                        {driver.name || "سائق بلا اسم"}
                      </Link>
                      <p className="mt-0.5 text-xs text-muted-foreground" dir="ltr">
                        {driver.phone}
                      </p>
                    </td>
                    <td className="p-2 align-top">
                      <Badge variant={driver.active ? "default" : "secondary"}>
                        {driver.active ? "في الخدمة" : "خارج الخدمة"}
                      </Badge>
                    </td>
                    <td className="p-2 align-top">
                      <div className="space-y-1">
                        {driver.licenseNo ? (
                          <p className="text-xs" dir="ltr">
                            {driver.licenseNo}
                          </p>
                        ) : (
                          <p className="text-xs text-muted-foreground">بلا رقم</p>
                        )}
                        {driver.licenseExpiry ? (
                          <p className="text-[11px] text-muted-foreground">
                            حتى {dateLabel(driver.licenseExpiry)}
                          </p>
                        ) : null}
                        <LicenseBadge driver={driver} />
                      </div>
                    </td>
                    <td className="p-2 align-top">
                      <DocsCell driver={driver} />
                    </td>
                    <td className="p-2 align-top">
                      <TripsCell
                        stats={report.byDriver.get(driver.id)}
                        readable={tripsReadable}
                      />
                    </td>
                    <td className="p-2 align-top">
                      <Link
                        href={`/portal/drivers?edit=${driver.id}#driver-panel`}
                        className={cn(buttonVariants({ variant: "outline", size: "sm" }))}
                      >
                        تعديل
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/*
           * 🔴 ما لا نملكه يُقال ولا يُختلق: الربطُ الوحيد بين رحلةٍ وسائق هو
           * `dispatches.assigned_driver_id` — أي ما سجّلته أنت طاقماً للرحلة.
           * فرحلةٌ نفّذها سائقٌ ولم تسجّله لها لا يعرف النظام عنها شيئاً.
           */}
          {tripsReadable && report.withoutDriver > 0 ? (
            <p className="flex items-start gap-2 text-xs leading-5 text-muted-foreground">
              <CircleSlash className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
              {countLabel(report.withoutDriver)} من رحلاتك المُسنَدة بلا سائق مسجَّل — العدّاد
              أعلاه يحسب ما سجّلتَه طاقماً للرحلة وحده، فسجّل السائق من صفحة الرحلة كي يظهر
              هنا وكي يعرف عميلك من سيأتيه.
            </p>
          ) : null}

          {!tripsReadable ? (
            <p className="text-xs leading-5 text-amber-700 dark:text-amber-300">
              تعذّرت قراءة رحلاتك الآن، فأعمدة «رحلاته» غير مقروءة — وهذا ليس معناه أنه بلا
              رحلات. حدِّث الصفحة، وإن تكرر فأبلغ الإدارة.
            </p>
          ) : null}
        </Card>
      ) : null}

      {/* ------------------------------------------------------------ */}
      {/* ثم التحرير — لسائقٍ واحد يُفتح بزرّ، لا نموذجٌ مفتوح يستقبلك      */}
      {/* ------------------------------------------------------------ */}
      {ready && edit && !editing && !adding ? (
        <Notice tone="warning">
          <p>السائق الذي طلبت تحريره غير موجود في سجلك — ربما حُذف. اختر سائقاً من الجدول.</p>
        </Notice>
      ) : null}

      {editing ? <DriverPanel driver={editing} /> : null}

      {adding ? (
        <form action={createDriver} id="driver-panel">
          <Card className="gap-4 p-5">
            <div className="flex flex-wrap items-start gap-2">
              <div className="min-w-0 flex-1">
                <h3 className="font-heading text-base font-bold">إضافة سائق</h3>
                <p className="text-sm text-muted-foreground">
                  سجّل كل من يقود لك فعلاً — العدد لا يهم بقدر أن يكون من يُسنَد إليه موجوداً في
                  القائمة وقت الإسناد.
                </p>
              </div>
              <Link
                href="/portal/drivers"
                className={cn(buttonVariants({ variant: "ghost", size: "sm" }))}
              >
                <X aria-hidden="true" />
                إلغاء
              </Link>
            </div>

            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              <TextField
                id="new-name"
                label="اسم السائق"
                name="new.name"
                placeholder="مثال: محمد أحمد"
                required
                maxLength={120}
                disabled={!ready}
              />
              <TextField
                id="new-phone"
                label="هاتف السائق"
                name="new.phone"
                type="tel"
                dir="ltr"
                required
                maxLength={32}
                disabled={!ready}
              />
              <TextField
                id="new-license"
                label="رقم الرخصة"
                name="new.license_no"
                dir="ltr"
                maxLength={40}
                disabled={!ready}
                hint="اختياري — سجل داخلي لا يظهر للعميل."
              />
              <DateField
                id="new-expiry"
                label="انتهاء الرخصة"
                name="new.license_expiry"
                disabled={!ready}
                hint="اختياري — ويظهر لك تنبيه حين تنتهي."
              />
            </div>

            <p className="text-xs leading-5 text-muted-foreground">
              وصورة السائق وصورة رخصته تُرفعان من بطاقته بعد إضافته — لأن الملف يُخزَّن باسم
              السائق نفسه، فلا وجود له قبل أن يوجد هو.
            </p>

            <div className="flex flex-wrap items-center justify-between gap-3">
              <CheckboxField
                name="new.active"
                label="السائق في الخدمة"
                defaultChecked
                disabled={!ready}
              />
              <Button type="submit" disabled={!ready}>
                <Plus aria-hidden="true" />
                إضافة السائق
              </Button>
            </div>
          </Card>
        </form>
      ) : null}
    </div>
  );
}
