import { AlertTriangle, CheckCircle2, Plus, Power, PowerOff, XCircle } from "lucide-react";

import { HelpTip } from "@/components/shared/HelpTip";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { VEHICLE_CLASSES } from "@/lib/site-config";
import { createServerSupabase } from "@/lib/supabase/server";
import { createClass, saveClass, toggleActive } from "./actions";

/**
 * شاشة الأسطول — فئات السيارات وتعريفة كل فئة في مكان واحد.
 * لكل فئة نموذج واحد يحفظ بيانات العرض والتعريفة معاً (بطاقة = فئة).
 * كل الأرقام تُقرأ وتُكتب فقط؛ الحساب كله داخل دالة `quote_price` في Postgres.
 */

export const metadata = { title: "الأسطول والتعريفة" };

const hasSupabaseEnv = () =>
  Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);

type Tariff = {
  perKm: number | null;
  baseFee: number | null;
  minPrice: number | null;
  waitingHourPrice: number | null;
  roundTripFactor: number | null;
};

type FleetClass = {
  id: string;
  slug: string;
  title: string;
  capacity: number | null;
  short: string | null;
  active: boolean;
  sort: number;
  tariff: Tariff | null;
};

/** صفوف قاعدة البيانات كما تأتي (snake_case) قبل التطبيع */
type ClassRow = {
  id: string;
  slug: string;
  title: string;
  capacity: number | null;
  short: string | null;
  active: boolean | null;
  sort: number | null;
};

type TariffRow = {
  class_id: string;
  per_km: number | null;
  base_fee: number | null;
  min_price: number | null;
  waiting_hour_price: number | null;
  round_trip_factor: number | null;
};

/**
 * قراءة الفئات وتعريفاتها باستعلامين مستقلين ثم الربط في الذاكرة —
 * أبسط وأمتن من الـ embed لأنه لا يعتمد على اسم علاقة المفتاح الأجنبي.
 * `ready` تعني: البيئة مضبوطة والجدولان موجودان فعلاً (هجرة المرحلة ٣ مُنفَّذة).
 */
async function loadFleet(): Promise<{ classes: FleetClass[]; ready: boolean }> {
  const supabase = await createServerSupabase();
  if (!supabase) return { classes: [], ready: false };

  const [classesRes, tariffsRes] = await Promise.all([
    supabase
      .from("vehicle_classes")
      .select("id, slug, title, capacity, short, active, sort")
      .order("sort", { ascending: true })
      .order("capacity", { ascending: true }),
    supabase
      .from("tariffs")
      .select("class_id, per_km, base_fee, min_price, waiting_hour_price, round_trip_factor"),
  ]);

  if (classesRes.error || tariffsRes.error) return { classes: [], ready: false };

  const tariffs = new Map<string, Tariff>();
  for (const row of (tariffsRes.data ?? []) as TariffRow[]) {
    tariffs.set(row.class_id, {
      perKm: row.per_km,
      baseFee: row.base_fee,
      minPrice: row.min_price,
      waitingHourPrice: row.waiting_hour_price,
      roundTripFactor: row.round_trip_factor,
    });
  }

  const classes = ((classesRes.data ?? []) as ClassRow[]).map((row) => ({
    id: row.id,
    slug: row.slug,
    title: row.title,
    capacity: row.capacity,
    short: row.short,
    active: row.active === true,
    sort: row.sort ?? 0,
    tariff: tariffs.get(row.id) ?? null,
  }));

  return { classes, ready: true };
}

/** معاينة شكل الشاشة قبل ربط قاعدة البيانات — بلا أي أرقام (الأسعار من القاعدة حصراً) */
const PREVIEW_CLASSES: FleetClass[] = VEHICLE_CLASSES.map((c, i) => ({
  id: `preview-${c.slug}`,
  slug: c.slug,
  title: c.title,
  capacity: null,
  short: c.short,
  active: true,
  sort: i,
  tariff: null,
}));

const ERROR_MESSAGES: Record<string, string> = {
  env: "قاعدة البيانات غير مربوطة — لا يمكن الحفظ بعد.",
  title: "اسم الفئة حقل إلزامي.",
  slug: "المعرّف غير صالح — حروف لاتينية صغيرة وأرقام تفصلها شرطات فقط (مثال: mini-bus).",
  capacity: "السعة يجب أن تكون عدداً صحيحاً من ١ فأكثر.",
  sort: "ترتيب العرض يجب أن يكون عدداً صحيحاً غير سالب.",
  money: "قيم التعريفة يجب أن تكون أرقاماً غير سالبة — لا تترك حقلاً فارغاً.",
  factor: "معامل الذهاب والعودة يجب أن يكون بين ١ و٣.",
  tariff: "لا يمكن تفعيل فئة بتعريفة صفرية — اضبط سعر الكيلومتر أو المصروف الثابت أو الحد الأدنى واحفظ أولاً.",
  exists: "يوجد فئة بهذا المعرّف بالفعل — اختر معرّفاً آخر.",
  save: "فشل الحفظ — تأكد أنك مسجل الدخول بحساب دوره admin (راجع supabase/README.md، فخ الصفوف الصفرية).",
};

function TextField({
  id,
  label,
  name,
  defaultValue,
  placeholder,
  help,
  dir = "rtl",
  disabled,
  required,
  pattern,
}: {
  id: string;
  label: string;
  name: string;
  defaultValue?: string | null;
  placeholder?: string;
  help?: string;
  dir?: "rtl" | "ltr";
  disabled?: boolean;
  required?: boolean;
  pattern?: string;
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
        dir={dir}
        defaultValue={defaultValue ?? ""}
        placeholder={placeholder}
        disabled={disabled}
        required={required}
        pattern={pattern}
      />
    </div>
  );
}

/** حقل رقمي — الأرقام دائماً ltr حتى تُقرأ الكسور والعملة بترتيبها الصحيح */
function NumberField({
  id,
  label,
  name,
  defaultValue,
  help,
  disabled,
  required,
  step = "0.01",
  min = 0,
  max,
}: {
  id: string;
  label: string;
  name: string;
  defaultValue?: number | null;
  help?: string;
  disabled?: boolean;
  required?: boolean;
  step?: string;
  min?: number;
  max?: number;
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
        type="number"
        inputMode="decimal"
        dir="ltr"
        step={step}
        min={min}
        max={max}
        defaultValue={defaultValue ?? ""}
        disabled={disabled}
        required={required}
      />
    </div>
  );
}

function ClassCard({ cls, readOnly }: { cls: FleetClass; readOnly: boolean }) {
  const f = (field: string) => `${cls.slug}-${field}`;

  return (
    <Card className="space-y-4 p-5">
      <div className="flex flex-wrap items-center gap-2">
        <h3 className="font-heading text-base font-bold">{cls.title}</h3>
        <code dir="ltr" className="text-xs text-muted-foreground">
          {cls.slug}
        </code>
        <Badge variant={cls.active ? "default" : "secondary"}>
          {cls.active ? "نشطة" : "متوقفة"}
        </Badge>
        <form
          action={readOnly ? undefined : toggleActive.bind(null, cls.id)}
          className="ms-auto"
        >
          <Button
            type="submit"
            variant="ghost"
            size="sm"
            disabled={readOnly}
            title={
              cls.active
                ? "إيقاف الفئة: تختفي من نتائج البحث وعروض الأسعار فوراً"
                : "تفعيل الفئة: تعود للظهور في نتائج البحث بحسب سعتها"
            }
          >
            {cls.active ? <PowerOff /> : <Power />}
            {cls.active ? "إيقاف" : "تفعيل"}
          </Button>
        </form>
      </div>

      <form action={readOnly ? undefined : saveClass.bind(null, cls.id)} className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-3">
          <TextField
            id={f("title")}
            label="اسم الفئة"
            name="title"
            defaultValue={cls.title}
            disabled={readOnly}
            required
            help="الاسم كما يراه العميل في بطاقات العروض وقسم الأسطول."
          />
          <NumberField
            id={f("capacity")}
            label="السعة (عدد الركاب)"
            name="capacity"
            defaultValue={cls.capacity}
            disabled={readOnly}
            required
            step="1"
            min={1}
            help="السعة تتحكم في قاعدة الترشيح: يعرض النظام أصغر فئة تكفي عدد الركاب ثم الفئة الأعلى مباشرة (تحفيزاً للترقية). الأطفال يُحسبون ضمن العدد، وتغيير الرقم يغيّر أي فئة تظهر للعميل فوراً."
          />
          <NumberField
            id={f("sort")}
            label="ترتيب العرض"
            name="sort"
            defaultValue={cls.sort}
            disabled={readOnly}
            step="1"
            min={0}
            help="ترتيب ظهور الفئة في قسم الأسطول بالموقع العام — الأصغر أولاً. لا يؤثر على ترتيب العروض (يحكمه عدد الركاب)."
          />
        </div>

        <TextField
          id={f("short")}
          label="الوصف المختصر"
          name="short"
          defaultValue={cls.short}
          disabled={readOnly}
          help="سطر واحد يظهر تحت اسم الفئة في الموقع — اتركه فارغاً ليختفي."
        />

        <Label className="flex w-fit cursor-pointer items-center gap-2 text-sm font-normal">
          <input
            type="checkbox"
            name="active"
            defaultChecked={cls.active}
            disabled={readOnly}
            className="size-4 accent-primary"
          />
          الفئة نشطة
          <HelpTip>
            الفئة المتوقفة تبقى ببياناتها وتعريفتها لكنها تختفي من الموقع ومن عروض الأسعار.
            لا يمكن تفعيل فئة تعريفتها صفرية بالكامل.
          </HelpTip>
        </Label>

        <Separator />

        <div className="flex items-center gap-1.5">
          <h4 className="font-heading text-sm font-bold">التعريفة</h4>
          <HelpTip>
            ترتيب الحساب: (المصروف الثابت + المسافة × سعر الكيلومتر) ← يُرفع للحد الأدنى إن
            قلّ عنه ← يُضرب في معامل الذهاب والعودة ← تُضاف ساعات الانتظار ← تُضاف عمولة
            الذروة إن كانت مفعّلة من شاشة التسعير.
          </HelpTip>
        </div>

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <NumberField
            id={f("per_km")}
            label="سعر الكيلومتر"
            name="per_km"
            defaultValue={cls.tariff?.perKm ?? null}
            disabled={readOnly}
            required
            help="يُضرب في مسافة الرحلة بالكيلومتر. القيمة بعملة الموقع المحددة في شاشة التسعير."
          />
          <NumberField
            id={f("base_fee")}
            label="المصروف الثابت للرحلة"
            name="base_fee"
            defaultValue={cls.tariff?.baseFee ?? null}
            disabled={readOnly}
            required
            help="مبلغ يُضاف لكل رحلة مهما كانت مسافتها (تجهيز السيارة والسائق) قبل حساب المسافة."
          />
          <NumberField
            id={f("min_price")}
            label="الحد الأدنى للرحلة"
            name="min_price"
            defaultValue={cls.tariff?.minPrice ?? null}
            disabled={readOnly}
            required
            help="أرضية سعر الفئة: أي رحلة يقل حسابها عن هذا الرقم تُسعَّر به — يحمي المسافات القصيرة من أسعار غير مجدية. يُطبَّق قبل معامل الذهاب والعودة."
          />
          <NumberField
            id={f("waiting_hour_price")}
            label="سعر ساعة الانتظار"
            name="waiting_hour_price"
            defaultValue={cls.tariff?.waitingHourPrice ?? null}
            disabled={readOnly}
            required
            help="يُضرب في عدد ساعات الانتظار التي يطلبها العميل، ويُضاف بعد معامل الذهاب والعودة."
          />
          <NumberField
            id={f("round_trip_factor")}
            label="معامل الذهاب والعودة"
            name="round_trip_factor"
            defaultValue={cls.tariff?.roundTripFactor ?? null}
            disabled={readOnly}
            required
            step="0.05"
            min={1}
            max={3}
            help="مضاعِف يُطبَّق على سعر الاتجاه الواحد عند اختيار العميل ذهاباً وعودة: ١٫٨ تعني ضعف السعر بخصم ١٠٪، و٢ ضعف السعر بلا خصم، و١ بلا زيادة. المدى المسموح من ١ إلى ٣."
          />
        </div>

        <div className="flex justify-end">
          <Button type="submit" disabled={readOnly}>
            حفظ الفئة
          </Button>
        </div>
      </form>
    </Card>
  );
}

export default async function FleetPage({ searchParams }: PageProps<"/admin/fleet">) {
  const [params, { classes, ready }] = await Promise.all([searchParams, loadFleet()]);
  const wired = hasSupabaseEnv();
  const saved = params.saved === "1";
  const error = typeof params.error === "string" ? params.error : null;
  const readOnly = !ready;
  // قبل جاهزية الجداول نعرض هيكل الشاشة بالفئات الافتراضية (معطّلة بالكامل)،
  // وبعدها نعرض الفئات الحقيقية فقط — فلا يُرسَل أبداً حفظ لمعرّف غير موجود
  const shown = ready ? classes : PREVIEW_CLASSES;

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="font-heading text-lg font-bold">الأسطول والتعريفة</h2>
        <HelpTip>
          كل فئة سيارات هنا = بطاقة تجمع بيانات عرضها في الموقع وتعريفتها المالية. أي تعديل
          يظهر في نتائج البحث وعروض الأسعار فور الحفظ — جرّبه مباشرة من صندوق الاختبار في
          شاشة التسعير.
        </HelpTip>
      </div>

      {readOnly && (
        <Card className="flex flex-row items-start gap-3 border-amber-300 bg-amber-50 p-4 text-amber-900 dark:border-amber-700 dark:bg-amber-950 dark:text-amber-100">
          <AlertTriangle className="mt-0.5 size-5 shrink-0" />
          <div className="text-sm leading-relaxed">
            <p className="font-semibold">الأسطول معروض للمعاينة فقط حالياً</p>
            {wired ? (
              <p>
                قاعدة البيانات مربوطة لكن جدولي <code dir="ltr">vehicle_classes</code> و
                <code dir="ltr">tariffs</code> غير جاهزين — نفِّذ هجرة المرحلة ٣ من{" "}
                <code dir="ltr">supabase/migrations</code> ثم أعد تحميل الصفحة. المعروض الآن
                هيكل الشاشة بالفئات الافتراضية بلا أي أسعار.
              </p>
            ) : (
              <p>
                قاعدة البيانات غير مربوطة بعد — التحرير يُفعَّل بعد تنفيذ خطوات{" "}
                <code dir="ltr">supabase/README.md</code> وإعادة تشغيل الخادم.
              </p>
            )}
          </div>
        </Card>
      )}

      {saved && (
        <Card className="flex flex-row items-center gap-3 border-emerald-300 bg-emerald-50 p-4 text-emerald-900 dark:border-emerald-700 dark:bg-emerald-950 dark:text-emerald-100">
          <CheckCircle2 className="size-5 shrink-0" />
          <p className="text-sm font-medium">
            حُفظت الفئة وانعكست على أسعار الموقع فوراً — تحقق من الأثر بصندوق الاختبار في شاشة
            التسعير.
          </p>
        </Card>
      )}

      {error && (
        <Card className="flex flex-row items-center gap-3 border-red-300 bg-red-50 p-4 text-red-900 dark:border-red-700 dark:bg-red-950 dark:text-red-100">
          <XCircle className="size-5 shrink-0" />
          <p className="text-sm font-medium">{ERROR_MESSAGES[error] ?? "حدث خطأ غير متوقع."}</p>
        </Card>
      )}

      {ready && classes.length === 0 && (
        <Card className="p-5 text-sm text-muted-foreground">
          لا توجد فئات سيارات بعد — أضف أول فئة من النموذج أدناه، أو نفِّذ بذرة الفئات الأربع
          من <code dir="ltr">supabase/migrations</code>.
        </Card>
      )}

      {shown.map((cls) => (
        <ClassCard key={cls.id} cls={cls} readOnly={readOnly} />
      ))}

      <form action={readOnly ? undefined : createClass}>
        <Card className="space-y-4 p-5">
          <div>
            <h3 className="flex items-center gap-1.5 font-heading text-base font-bold">
              إضافة فئة
              <HelpTip>
                الفئات الأربع الافتراضية تغطي أغلب الطلبات — أضف فئة جديدة فقط عند وجود سيارة
                بسعة أو مستوى مختلف (ليموزين مثلاً). تُنشأ الفئة متوقفة بتعريفة صفرية، فاضبط
                أسعارها من بطاقتها ثم فعّلها.
              </HelpTip>
            </h3>
            <p className="text-sm text-muted-foreground">
              فئة جديدة لا تظهر للعملاء قبل ضبط تعريفتها وتفعيلها.
            </p>
          </div>

          <div className="grid gap-4 sm:grid-cols-3">
            <TextField
              id="new-title"
              label="اسم الفئة"
              name="new.title"
              placeholder="ليموزين"
              disabled={readOnly}
              required
            />
            <TextField
              id="new-slug"
              label="المعرّف (Slug)"
              name="new.slug"
              dir="ltr"
              placeholder="limousine"
              pattern="[a-z0-9]+(-[a-z0-9]+)*"
              disabled={readOnly}
              required
              help="حروف لاتينية صغيرة وأرقام تفصلها شرطات فقط — يُستخدم في ردود واجهة التسعير ولا يتغير بعد الإنشاء."
            />
            <NumberField
              id="new-capacity"
              label="السعة (عدد الركاب)"
              name="new.capacity"
              disabled={readOnly}
              required
              step="1"
              min={1}
              help="أقصى عدد ركاب تتسع له الفئة — هو أساس ترشيحها للعميل."
            />
          </div>

          <div className="flex justify-end">
            <Button type="submit" disabled={readOnly}>
              <Plus />
              إضافة الفئة
            </Button>
          </div>
        </Card>
      </form>
    </div>
  );
}
