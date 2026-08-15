import { CarFront, Plus, Power, PowerOff, Trash2 } from "lucide-react";
import type { SupabaseClient } from "@supabase/supabase-js";

import {
  Banners,
  CheckboxField,
  countLabel,
  EmptyState,
  NotReadyNotice,
  Notice,
  NumberField,
  PageHeading,
  SelectField,
  TextField,
} from "@/components/portal/portal-ui";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { loadVehicleClasses, loadVehicles, type PortalVehicle } from "../_lib/data";
import { portalSetupAccess } from "../_lib/session";
import { createVehicle, deleteVehicle, saveVehicle, toggleVehicle } from "./actions";

/**
 * أسطول المتعهد — المركبات التي ينفّذ بها الرحلات.
 *
 * الفئة هي الحقل الوحيد الذي يهم المحرك: هي ما يربط المركبة بأسعار المتعهد وبقاعدة
 * ترشيح السيارات حسب عدد الركاب.
 *
 * ⚠ **وبعد الهجرة 0040 لم يعد باقي الصف سجلاً داخلياً محضاً**: `get_booking_by_token`
 * صارت تُخرج للعميل — بعد الإسناد وحده — اسم المركبة ولونها ولوحتها وسنتها، لأن
 * الملاحظة ٥ نصّها «العميل لا يعرف ما سيأتيه… ولا رقمها ولا لونها». وانضباط
 * الـ Whitelabel باقٍ حيث كان: **وقت البحث والتسعير** يرى العميل فئة لا ماركة؛
 * وبعد أن يصير للرحلة منفّذٌ بعينه يرى سيارتها هي. ولذلك تشرح حقول هذه الشاشة
 * الآن ما الذي يُقرأ ومتى — فمن يظن الاسم داخلياً يكتب فيه ما لا يُقرأ على العميل.
 */

export const metadata = { title: "أسطولي" };

/**
 * ألوان الأسطول — استعلامٌ ثانٍ صغير، عن قصد لا سهواً.
 *
 * `VEHICLE_COLUMNS` في `app/portal/_lib/data.ts` عقدٌ تتشاركه أكثر من شاشة ولا
 * تملكه هذه الصفحة، واللون لا يحتاجه إلا محرّر الأسطول. والبديل الوحيد الخطر هو
 * حقلٌ بلا قيمة ابتدائية: `saveVehicle` تكتب حقول المركبة كلها في كل حفظ، فنموذج
 * لا يحمل اللون الحالي **يمحوه** مع أول تعديل لأي حقل آخر — عطبُ بيانات صامت لا
 * نقصُ عرض. وحين يضمّ العقد المشترك اللون يُحذف هذا كله بسطرين.
 */
async function loadVehicleColors(
  supabase: SupabaseClient,
  subcontractorId: string
): Promise<Map<string, string>> {
  const colors = new Map<string, string>();
  const res = await supabase
    .from("subcontractor_vehicles")
    .select("id, color")
    .eq("subcontractor_id", subcontractorId);

  // العمود ناقص (هجرة 0040 غير منفَّذة) ⇒ خريطة فارغة وحقلٌ فارغ، لا شاشة خطأ
  if (res.error) return colors;

  for (const row of res.data ?? []) {
    const r = row as Record<string, unknown>;
    const color = typeof r.color === "string" ? r.color.trim() : "";
    if (color !== "") colors.set(String(r.id), color);
  }
  return colors;
}

const ERROR_MESSAGES: Record<string, string> = {
  class: "اختر فئة مركبة صالحة من القائمة.",
  label: "اسم المركبة حقل إلزامي — اكتب الماركة والموديل ليسهل تمييزها.",
  year: "سنة الموديل يجب أن تكون سنة صحيحة.",
  seats: "عدد المقاعد يجب أن يكون عدداً صحيحاً من ١ فأكثر.",
};

function VehicleCard({
  vehicle,
  color,
  options,
}: {
  vehicle: PortalVehicle;
  /** يصل منفصلاً عن `PortalVehicle` — انظر `loadVehicleColors` أعلاه */
  color: string | null;
  options: { value: string; label: string }[];
}) {
  const f = (field: string) => `${vehicle.id}-${field}`;

  return (
    <Card className="gap-4 p-5">
      <div className="flex flex-wrap items-center gap-2">
        <CarFront className="size-4 shrink-0 text-primary" aria-hidden="true" />
        <h3 className="font-heading text-base font-bold">{vehicle.label || "مركبة بلا اسم"}</h3>
        <Badge variant={vehicle.active ? "default" : "secondary"}>
          {vehicle.active ? "في الخدمة" : "متوقفة"}
        </Badge>
        <form action={toggleVehicle.bind(null, vehicle.id)} className="ms-auto">
          <Button
            type="submit"
            variant="ghost"
            size="sm"
            title={
              vehicle.active
                ? "إيقاف المركبة مؤقتاً — تبقى في سجلك ولا تُحتسب ضمن فئاتك العاملة"
                : "إعادة المركبة إلى الخدمة"
            }
          >
            {vehicle.active ? <PowerOff aria-hidden="true" /> : <Power aria-hidden="true" />}
            {vehicle.active ? "إيقاف" : "تشغيل"}
          </Button>
        </form>
      </div>

      <form action={saveVehicle.bind(null, vehicle.id)} className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <SelectField
            id={f("class")}
            label="الفئة"
            name="class_slug"
            defaultValue={vehicle.classSlug}
            options={options}
            required
            help="الفئة تحدد أي أسعار تُطلب منك وأي رحلات تناسب هذه المركبة."
          />
          <TextField
            id={f("label")}
            label="اسم المركبة"
            name="label"
            defaultValue={vehicle.label}
            required
            maxLength={120}
            help="اكتبه ماركةً وموديلاً كما يقرؤهما راكب واقف في الشارع: يظهر للعميل بعد إسناد رحلته إليك ليعرف السيارة القادمة، ولا يظهر قبل ذلك ولا يدل عليك."
          />
          <NumberField
            id={f("year")}
            label="سنة الموديل"
            name="model_year"
            defaultValue={vehicle.modelYear}
            min={1970}
            max={2100}
            step="1"
          />
          <TextField
            id={f("plate")}
            label="رقم اللوحة"
            name="plate"
            dir="ltr"
            defaultValue={vehicle.plate}
            maxLength={32}
            help="يقرؤه العميل بعد الإسناد ليتحقق أن السيارة الواقفة أمامه هي سيارته — فاكتبه كما هو على اللوحة حرفاً برقم."
          />
          <TextField
            id={f("color")}
            label="اللون"
            name="color"
            defaultValue={color}
            maxLength={40}
            help="بلا قائمة مغلقة: «فضي» و«رمادي فاتح» وصفان مشروعان، والأدق هو الأنفع."
            hint="أول ما يميّز به العميل سيارتك من بعيد — اكتبه كما تصفه لمن ينتظرك."
          />
          <NumberField
            id={f("seats")}
            label="عدد المقاعد"
            name="seats"
            defaultValue={vehicle.seats}
            min={1}
            max={200}
            step="1"
            hint="اتركه فارغاً لاعتماد سعة الفئة."
          />
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3">
          <CheckboxField
            name="active"
            label="المركبة في الخدمة"
            defaultChecked={vehicle.active}
            help="المركبة المتوقفة تبقى بكل بياناتها ولا تُحتسب ضمن الفئات التي تعمل عليها."
          />
          <Button type="submit">حفظ المركبة</Button>
        </div>
      </form>

      {/* الحذف خطوتان بلا جافاسكربت: الكشف ثم التأكيد — ونموذجه مستقل عن نموذج
          الحفظ لأن HTML لا يسمح بتداخل النماذج */}
      <details>
        <summary className="w-fit cursor-pointer list-none text-xs text-muted-foreground transition-colors hover:text-destructive">
          حذف هذه المركبة نهائياً
        </summary>
        <form
          action={deleteVehicle.bind(null, vehicle.id)}
          className="mt-2 flex flex-wrap items-center gap-3 rounded-xl bg-muted/60 p-3"
        >
          <p className="min-w-0 flex-1 text-xs leading-5 text-muted-foreground">
            الحذف نهائي ولا يمكن التراجع عنه. إن كانت المركبة متوقفة مؤقتاً فأوقفها بدل حذفها
            حتى تبقى في سجلك.
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

export default async function PortalFleetPage({ searchParams }: PageProps<"/portal/fleet">) {
  const [params, access] = await Promise.all([searchParams, portalSetupAccess()]);
  if (!access.ok) return null;

  const { supabase, sub } = access;
  const [{ classes, ready: classesReady }, { vehicles, ready }, colors] = await Promise.all([
    loadVehicleClasses(supabase),
    loadVehicles(supabase, sub.id),
    loadVehicleColors(supabase, sub.id),
  ]);

  const saved = params.saved === "1";
  const deleted = params.deleted === "1";
  const error = typeof params.error === "string" ? params.error : null;

  const baseOptions = classes.map((cls) => ({
    value: cls.slug,
    label: cls.capacity ? `${cls.title} — حتى ${countLabel(cls.capacity)} ركاب` : cls.title,
  }));

  /** فئة مركبة قائمة لم تعد نشطة تبقى ظاهرة في قائمتها حتى لا تُبدَّل صامتةً */
  const optionsFor = (slug: string) =>
    baseOptions.some((option) => option.value === slug)
      ? baseOptions
      : [...baseOptions, { value: slug, label: `${slug} (فئة غير مفعّلة)` }];

  const activeCount = vehicles.filter((vehicle) => vehicle.active).length;

  return (
    <div className="space-y-6">
      <PageHeading
        title="أسطولي"
        help="فئات مركباتك هي ما يربطك بمحرك التسعير: الفئة التي لا تملك فيها مركبة لا يُطلب منك تسعيرها."
      >
        سجّل هنا المركبات التي تنفّذ بها الرحلات. العميل يرى فئة السيارة وحدها وقت الحجز؛
        فإذا أُسندت الرحلة إليك وأسندتَ لها مركبة قرأ اسمها ولونها ولوحتها ليعرف ما سيأتيه —
        ولا يقرأ اسم شركتك ولا ما تتقاضاه.
      </PageHeading>

      <Banners
        saved={saved || deleted}
        error={error}
        errorMessages={ERROR_MESSAGES}
        savedMessage={deleted ? "حُذفت المركبة." : "حُفظت بيانات المركبة."}
      />

      {!ready ? <NotReadyNotice what="سجل الأسطول" /> : null}

      {ready && !classesReady ? (
        <Notice tone="warning">
          <p>تعذر تحميل فئات السيارات الآن — أعد تحميل الصفحة، وإن تكرر الأمر راجع الإدارة.</p>
        </Notice>
      ) : null}

      {ready && classesReady && classes.length === 0 ? (
        <Notice tone="warning">
          <p>لا توجد فئات سيارات مفعّلة على المنصة بعد، فلا يمكن تسجيل مركبة. راجع الإدارة.</p>
        </Notice>
      ) : null}

      {ready && vehicles.length > 0 ? (
        <p className="text-sm text-muted-foreground">
          {countLabel(vehicles.length)} مركبة مسجّلة، منها {countLabel(activeCount)} في الخدمة.
        </p>
      ) : null}

      {ready && vehicles.length === 0 ? (
        <EmptyState
          icon={<CarFront className="size-5" aria-hidden="true" />}
          title="لم تسجّل أي مركبة بعد"
          action={
            <a href="#add-vehicle" className="text-sm text-primary underline underline-offset-4">
              أضف أول مركبة الآن
            </a>
          }
        >
          أسطولك ليس سجلاً شكلياً: الفئات التي تملك فيها مركبات هي الفئات التي يُطلب منك
          تسعيرها في قوائم الأسعار، وهي التي تحدد أي الرحلات تناسبك. بلا مركبة واحدة تبقى
          قوائم أسعارك بلا أساس.
        </EmptyState>
      ) : null}

      {vehicles.map((vehicle) => (
        <VehicleCard
          key={vehicle.id}
          vehicle={vehicle}
          color={colors.get(vehicle.id) ?? null}
          options={optionsFor(vehicle.classSlug)}
        />
      ))}

      <form action={createVehicle} id="add-vehicle">
        <Card className="gap-4 p-5">
          <div>
            <h3 className="font-heading text-base font-bold">إضافة مركبة</h3>
            <p className="text-sm text-muted-foreground">
              أضف مركبة لكل سيارة تعمل فعلاً — الكمية لا تهم بقدر تغطية الفئات.
            </p>
          </div>

          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <SelectField
              id="new-class"
              label="الفئة"
              name="new.class_slug"
              options={baseOptions}
              placeholder="اختر الفئة"
              defaultValue=""
              required
              disabled={!ready || classes.length === 0}
            />
            <TextField
              id="new-label"
              label="اسم المركبة"
              name="new.label"
              placeholder="مثال: هيونداي إلنترا"
              required
              maxLength={120}
              disabled={!ready || classes.length === 0}
            />
            <NumberField
              id="new-year"
              label="سنة الموديل"
              name="new.model_year"
              min={1970}
              max={2100}
              step="1"
              disabled={!ready || classes.length === 0}
            />
            <TextField
              id="new-plate"
              label="رقم اللوحة"
              name="new.plate"
              dir="ltr"
              maxLength={32}
              disabled={!ready || classes.length === 0}
            />
            <TextField
              id="new-color"
              label="اللون"
              name="new.color"
              placeholder="مثال: أبيض لؤلؤي"
              maxLength={40}
              disabled={!ready || classes.length === 0}
            />
            <NumberField
              id="new-seats"
              label="عدد المقاعد"
              name="new.seats"
              min={1}
              max={200}
              step="1"
              disabled={!ready || classes.length === 0}
            />
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3">
            <CheckboxField name="new.active" label="المركبة في الخدمة" defaultChecked disabled={!ready} />
            <Button type="submit" disabled={!ready || classes.length === 0}>
              <Plus aria-hidden="true" />
              إضافة المركبة
            </Button>
          </div>
        </Card>
      </form>
    </div>
  );
}
