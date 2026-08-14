import { IdCard, Plus, Power, PowerOff, Trash2 } from "lucide-react";

import {
  Banners,
  CheckboxField,
  countLabel,
  EmptyState,
  NotReadyNotice,
  PageHeading,
  TextField,
} from "@/components/portal/portal-ui";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { portalAccess } from "../_lib/session";
import { createDriver, deleteDriver, saveDriver, toggleDriver } from "./actions";
import { loadDrivers, type PortalDriver } from "./data";

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
 */

export const metadata = { title: "سائقيّ" };

const ERROR_MESSAGES: Record<string, string> = {
  name: "اسم السائق حقل إلزامي — اكتبه كاملاً كما سيقرأه العميل.",
  phone: "رقم هاتف السائق غير صالح — اكتب رقماً كاملاً (٨ أرقام فأكثر).",
};

function DriverCard({ driver }: { driver: PortalDriver }) {
  const f = (field: string) => `${driver.id}-${field}`;

  return (
    <Card className="gap-4 p-5">
      <div className="flex flex-wrap items-center gap-2">
        <IdCard className="size-4 shrink-0 text-primary" aria-hidden="true" />
        <h3 className="font-heading text-base font-bold">{driver.name || "سائق بلا اسم"}</h3>
        <Badge variant={driver.active ? "default" : "secondary"}>
          {driver.active ? "في الخدمة" : "موقوف"}
        </Badge>
        <form action={toggleDriver.bind(null, driver.id)} className="ms-auto">
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
            help="سجل داخلي بينك وبين الإدارة — لا يصل العميل إطلاقاً."
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
  const [params, access] = await Promise.all([searchParams, portalAccess()]);
  if (!access.ok) return null;

  const { supabase, sub } = access;
  const { drivers, ready } = await loadDrivers(supabase, sub.id);

  const saved = params.saved === "1";
  const deleted = params.deleted === "1";
  const error = typeof params.error === "string" ? params.error : null;

  const activeCount = drivers.filter((driver) => driver.active).length;

  return (
    <div className="space-y-6">
      <PageHeading
        title="سائقيّ"
        help="سجلك أنت لا سجل المنصة: نحن نعرض للعميل من أعلنته، ولا ندير سائقيك ولا نتواصل معهم. والصور غير مطلوبة حالياً — إضافتها تحتاج مساحة تخزين خاصة تحمي بيانات سائقك، وهي مؤجَّلة عمداً."
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

      {ready && drivers.length > 0 ? (
        <p className="text-sm text-muted-foreground">
          {countLabel(drivers.length)} سائقاً مسجّلاً، منهم {countLabel(activeCount)} في الخدمة.
        </p>
      ) : null}

      {ready && drivers.length === 0 ? (
        <EmptyState
          icon={<IdCard className="size-5" aria-hidden="true" />}
          title="لم تسجّل أي سائق بعد"
          action={
            <a href="#add-driver" className="text-sm text-primary underline underline-offset-4">
              أضف أول سائق الآن
            </a>
          }
        >
          أكثر ما يقلق العميل بعد الحجز سؤال واحد: من سيأتيني وبأي سيارة. السجل هنا يوفّر عليك
          إعادة كتابة الاسم والهاتف في كل رحلة — تكتبها مرة، ثم يصير إسناد السائق نقرتين. وبلا
          سائق واحد مسجّل يبقى عميلك بلا إجابة، ويبقى هاتفك هو الذي يرن.
        </EmptyState>
      ) : null}

      {drivers.map((driver) => (
        <DriverCard key={driver.id} driver={driver} />
      ))}

      <form action={createDriver} id="add-driver">
        <Card className="gap-4 p-5">
          <div>
            <h3 className="font-heading text-base font-bold">إضافة سائق</h3>
            <p className="text-sm text-muted-foreground">
              سجّل كل من يقود لك فعلاً — العدد لا يهم بقدر أن يكون من يُسنَد إليه موجوداً في
              القائمة وقت الإسناد.
            </p>
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
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3">
            <CheckboxField name="new.active" label="السائق في الخدمة" defaultChecked disabled={!ready} />
            <Button type="submit" disabled={!ready}>
              <Plus aria-hidden="true" />
              إضافة السائق
            </Button>
          </div>
        </Card>
      </form>
    </div>
  );
}
