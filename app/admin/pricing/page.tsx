import { AlertTriangle, CheckCircle2, FlaskConical, Percent, XCircle } from "lucide-react";

import { HelpTip } from "@/components/shared/HelpTip";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { createServerSupabase } from "@/lib/supabase/server";
import { DEFAULT_MARGIN, type PriceSource } from "@/lib/subcontractor-types";
import { savePricingSettings, testQuote } from "./actions";

/**
 * شاشة التسعير — إعدادات التسعير العامة (الذروة + الهامش) + صندوق اختبار حي.
 * صندوق الاختبار يستدعي نفس دالة `quote_price` التي يستدعيها الموقع العام،
 * فيرى المدير أثر أي تعديل في التعريفة أو الذروة أو الهامش فوراً بلا فتح الموقع.
 * لا حساب مالي في هذا الملف — عرض النتائج فقط.
 *
 * المرحلة ٥: الهامش يخص **أسعار المتعهدين وحدها**. الرحلة المسعَّرة بتعريفة
 * الكيلومتر ربحها داخل التعريفة نفسها، فإضافة هامش فوقها احتساب مزدوج — لذلك
 * الدالة لا تطبّقه إلا حين يكون مصدر السعر متعهداً، وصندوق الاختبار يُظهر
 * المصدر والتكلفة والهامش لكل فئة حتى يرى المدير القاعدة تعمل قبل أن يثق بها.
 */

export const metadata = { title: "التسعير" };

const hasSupabaseEnv = () =>
  Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);

type PricingSettingsRow = {
  peakEnabled: boolean;
  peakPercent: number | null;
  currency: string;
  marginType: "percent" | "fixed";
  marginValue: number | null;
  marginMinAmount: number | null;
};

/** صف `quote_price` كما يرجع من rpc — snake_case حسب توقيع SQL في lib/pricing-types.ts */
type QuotePriceRow = {
  class_slug: string;
  class_title: string;
  capacity: number;
  total: number;
  base_fee: number;
  distance_cost: number;
  waiting_cost: number;
  round_trip_applied: boolean;
  peak_applied: boolean;
  min_applied: boolean;
  /** أعمدة المرحلة ٥ — تغيب قبل تطبيق هجرة 0010 */
  price_source?: string | null;
  subcontractor_id?: string | null;
  subcontractor_cost?: number | string | null;
  margin_amount?: number | string | null;
};

const numberFmt = new Intl.NumberFormat("ar-EG", { maximumFractionDigits: 2 });
const money = (v: unknown) => numberFmt.format(Number(v ?? 0));

/** عرض مبلغ قد يكون غائباً — الشرطة أوضح من صفر كاذب */
const moneyOrDash = (v: unknown) =>
  v === null || v === undefined || v === "" ? null : money(v);

const PRICE_SOURCE_LABELS: Record<PriceSource, string> = {
  subcontractor: "سعر متعهد",
  tariff: "تعريفة كيلومتر",
};

function isPriceSource(value: unknown): value is PriceSource {
  return value === "subcontractor" || value === "tariff";
}

const ERROR_MESSAGES: Record<string, string> = {
  env: "قاعدة البيانات غير مربوطة — لا يمكن الحفظ بعد.",
  percent: "نسبة الذروة يجب أن تكون رقماً بين ٠ و١٠٠.",
  margin:
    "إعدادات الهامش غير صالحة: النوع نسبة مئوية أو مبلغ ثابت، وقيمة الهامش وأرضيته رقمان موجبان (النسبة حتى ٥٠٠٪).",
  marginmig:
    "أعمدة الهامش غير موجودة في قاعدة البيانات بعد — نفِّذ هجرة المرحلة ٥ من supabase/migrations ثم أعد المحاولة.",
  test: "بيانات الاختبار غير صالحة: مسافة أكبر من صفر، وعدد ركاب صحيح من ١ فأكثر، وساعات انتظار من ٠ إلى ٢٤.",
  coords:
    "صيغة الإحداثيات غير صحيحة — اكتب كل نقطة هكذا: خط العرض ثم فاصلة ثم خط الطول، مثال 30.0444, 31.2357.",
  coordpair:
    "التغطية تُطابَق بنقطتين معاً — إما أن تملأ إحداثيات الانطلاق والوصول كليهما أو تتركهما فارغين لاختبار التعريفة وحدها.",
  save: "فشل الحفظ — تأكد أنك مسجل الدخول بحساب دوره admin (راجع supabase/README.md، فخ الصفوف الصفرية).",
};

/**
 * قراءة صف الإعدادات الوحيد.
 * `ready` = جدول `pricing_settings` موجود، و`marginReady` = أعمدة الهامش وصلت
 * فعلاً (هجرة 0010). الفصل بينهما مقصود: قاعدة المرحلة ٣ يجب أن تُدير الذروة
 * بشكل كامل، ويظهر محرِّر الهامش وحده معطَّلاً برسالته.
 */
async function loadPricingSettings(): Promise<{
  settings: PricingSettingsRow;
  ready: boolean;
  marginReady: boolean;
}> {
  const fallback: PricingSettingsRow = {
    peakEnabled: false,
    peakPercent: null,
    currency: "EGP",
    marginType: DEFAULT_MARGIN.marginType,
    marginValue: null,
    marginMinAmount: null,
  };

  const supabase = await createServerSupabase();
  if (!supabase) return { settings: fallback, ready: false, marginReady: false };

  const res = await supabase.from("pricing_settings").select("*").limit(1);
  if (res.error) return { settings: fallback, ready: false, marginReady: false };

  const row = (res.data?.[0] ?? null) as Record<string, unknown> | null;
  if (!row) return { settings: fallback, ready: true, marginReady: false };

  const marginReady = "margin_type" in row;
  const rawType = row.margin_type;

  return {
    settings: {
      peakEnabled: row.peak_enabled === true,
      peakPercent: typeof row.peak_percent === "number" ? row.peak_percent : null,
      currency: typeof row.currency === "string" ? row.currency : "EGP",
      marginType:
        rawType === "percent" || rawType === "fixed" ? rawType : DEFAULT_MARGIN.marginType,
      marginValue: Number.isFinite(Number(row.margin_value)) ? Number(row.margin_value) : null,
      marginMinAmount: Number.isFinite(Number(row.margin_min_amount))
        ? Number(row.margin_min_amount)
        : null,
    },
    ready: true,
    marginReady,
  };
}

type TestCoords = { originLat: number; originLng: number; destLat: number; destLng: number };

type TestInput = {
  km: number;
  passengers: number;
  roundTrip: boolean;
  waitingHours: number;
  /** null = اختبار مسار التعريفة وحده (بلا مطابقة تغطية) */
  coords: TestCoords | null;
};

/** قراءة معاملات صندوق الاختبار من الرابط (يكتبها الإجراء بعد التحقق) */
function readTestInput(params: Record<string, string | string[] | undefined>): TestInput | null {
  if (params.test !== "1") return null;
  const get = (key: string): number | null => {
    const v = params[key];
    if (typeof v !== "string" || v.trim() === "") return null;
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  };
  const km = get("km");
  const passengers = get("pax");
  if (km === null || km <= 0 || passengers === null || passengers < 1) return null;

  const originLat = get("olat");
  const originLng = get("olng");
  const destLat = get("dlat");
  const destLng = get("dlng");
  const coords =
    originLat !== null && originLng !== null && destLat !== null && destLng !== null
      ? { originLat, originLng, destLat, destLng }
      : null;

  return {
    km,
    passengers: Math.trunc(passengers),
    roundTrip: params.rt === "1",
    waitingHours: get("wait") ?? 0,
    coords,
  };
}

/**
 * تنفيذ التسعير التجريبي — نفس rpc التي يستدعيها /api/quote للموقع العام.
 *
 * بإحداثيات: تشتغل مطابقة التغطية فيظهر أثر أسعار المتعهدين. بلا إحداثيات:
 * مسار التعريفة كما في المرحلة ٣. وقبل تطبيق الهجرة يفشل الاستدعاء الثماني
 * بـ PGRST202 فنسقط إلى التوقيع الرباعي بدل تعطيل الصندوق كله.
 */
async function runTestQuote(
  input: TestInput
): Promise<{ rows: QuotePriceRow[]; failed: boolean; coverageEngaged: boolean }> {
  const supabase = await createServerSupabase();
  if (!supabase) return { rows: [], failed: true, coverageEngaged: false };

  const baseArgs = {
    p_distance_km: input.km,
    p_passengers: input.passengers,
    p_round_trip: input.roundTrip,
    p_waiting_hours: input.waitingHours,
  };

  let coverageEngaged = input.coords !== null;

  let { data, error } = await supabase.rpc(
    "quote_price",
    input.coords
      ? {
          ...baseArgs,
          p_origin_lat: input.coords.originLat,
          p_origin_lng: input.coords.originLng,
          p_dest_lat: input.coords.destLat,
          p_dest_lng: input.coords.destLng,
        }
      : baseArgs
  );

  if (error && (error.code === "PGRST202" || error.code === "42883")) {
    coverageEngaged = false;
    ({ data, error } = await supabase.rpc("quote_price", baseArgs));
  }

  if (error) return { rows: [], failed: true, coverageEngaged: false };
  return { rows: (data ?? []) as QuotePriceRow[], failed: false, coverageEngaged };
}

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
  defaultValue?: number | string | null;
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

/** حقل نصي حر — يخدم إحداثيات الاختبار المنسوخة من خرائط جوجل */
function TextField({
  id,
  label,
  name,
  defaultValue,
  placeholder,
  help,
  disabled,
}: {
  id: string;
  label: string;
  name: string;
  defaultValue?: string;
  placeholder?: string;
  help?: string;
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
        type="text"
        dir="ltr"
        defaultValue={defaultValue ?? ""}
        placeholder={placeholder}
        disabled={disabled}
      />
    </div>
  );
}

/** خيار نوع الهامش — بديل عن select بنفس إيقاع بطاقات هذه الشاشة */
function MarginTypeOption({
  value,
  title,
  description,
  checked,
  disabled,
}: {
  value: "percent" | "fixed";
  title: string;
  description: string;
  checked: boolean;
  disabled?: boolean;
}) {
  return (
    <Label className="flex cursor-pointer items-start gap-3 rounded-lg border border-input p-3 text-sm font-normal has-[:checked]:border-primary has-[:checked]:bg-primary/5">
      <input
        type="radio"
        name="margin_type"
        value={value}
        defaultChecked={checked}
        disabled={disabled}
        className="mt-0.5 size-4 shrink-0 accent-primary"
      />
      <span className="leading-relaxed">
        <span className="font-medium">{title}</span>
        <span className="block text-muted-foreground">{description}</span>
      </span>
    </Label>
  );
}

/** خلية علامة في جدول النتائج: ✓ عند تطبيق القاعدة و— عند تجاوزها */
function Flag({ on, label }: { on: boolean; label: string }) {
  return on ? (
    <Badge variant="secondary" className="whitespace-nowrap">
      {label}
    </Badge>
  ) : (
    <span className="text-muted-foreground">—</span>
  );
}

/** وسم مصدر السعر — يميّز بصرياً بين ما جاء من متعهد وما جاء من التعريفة */
function SourceBadge({ source }: { source: PriceSource }) {
  return (
    <Badge
      variant="outline"
      className={
        source === "subcontractor"
          ? "whitespace-nowrap border-violet-300 bg-violet-100 text-violet-900 dark:border-violet-700 dark:bg-violet-950 dark:text-violet-100"
          : "whitespace-nowrap border-sky-300 bg-sky-100 text-sky-900 dark:border-sky-700 dark:bg-sky-950 dark:text-sky-100"
      }
    >
      {PRICE_SOURCE_LABELS[source]}
    </Badge>
  );
}

export default async function PricingPage({ searchParams }: PageProps<"/admin/pricing">) {
  const [params, { settings, ready, marginReady }] = await Promise.all([
    searchParams,
    loadPricingSettings(),
  ]);
  const wired = hasSupabaseEnv();
  const saved = params.saved === "1";
  const error = typeof params.error === "string" ? params.error : null;
  const readOnly = !ready;
  const marginEditable = ready && marginReady;

  const testInput = readTestInput(params);
  const test = testInput && ready ? await runTestQuote(testInput) : null;

  // هل ظهر المصدر في النتيجة أصلاً؟ (قاعدة قبل الهجرة لا ترجع العمود)
  const showSourceColumns = Boolean(test && test.rows.some((r) => isPriceSource(r.price_source)));
  const anySubcontractor = Boolean(
    test && test.rows.some((r) => r.price_source === "subcontractor")
  );

  const pointValue = (lat: number | undefined, lng: number | undefined) =>
    lat !== undefined && lng !== undefined ? `${lat}, ${lng}` : "";

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="font-heading text-lg font-bold">التسعير</h2>
        <HelpTip>
          هذه الشاشة للمعاملات العامة فوق كل الفئات. أسعار كل فئة (الكيلومتر والمصروف الثابت
          والحد الأدنى والانتظار والذهاب والعودة) مكانها شاشة «الأسطول».
        </HelpTip>
        <Badge variant="outline" className="ms-auto">
          العملة: <span dir="ltr">{settings.currency}</span>
        </Badge>
      </div>

      {readOnly && (
        <Card className="flex flex-row items-start gap-3 border-amber-300 bg-amber-50 p-4 text-amber-900 dark:border-amber-700 dark:bg-amber-950 dark:text-amber-100">
          <AlertTriangle className="mt-0.5 size-5 shrink-0" />
          <div className="text-sm leading-relaxed">
            <p className="font-semibold">شاشة التسعير معروضة للمعاينة فقط حالياً</p>
            {wired ? (
              <p>
                قاعدة البيانات مربوطة لكن جدول <code dir="ltr">pricing_settings</code> ودالة{" "}
                <code dir="ltr">quote_price</code> غير جاهزين — نفِّذ هجرة المرحلة ٣ من{" "}
                <code dir="ltr">supabase/migrations</code> ثم أعد تحميل الصفحة.
              </p>
            ) : (
              <p>
                قاعدة البيانات غير مربوطة بعد — الحفظ والاختبار يُفعَّلان بعد تنفيذ خطوات{" "}
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
            حُفظت إعدادات التسعير وانعكست على كل عروض الأسعار فوراً.
          </p>
        </Card>
      )}

      {error && (
        <Card className="flex flex-row items-center gap-3 border-red-300 bg-red-50 p-4 text-red-900 dark:border-red-700 dark:bg-red-950 dark:text-red-100">
          <XCircle className="size-5 shrink-0" />
          <p className="text-sm font-medium">{ERROR_MESSAGES[error] ?? "حدث خطأ غير متوقع."}</p>
        </Card>
      )}

      <form action={readOnly ? undefined : savePricingSettings} className="space-y-6">
        <Card className="space-y-4 p-5">
          <div>
            <h3 className="flex items-center gap-1.5 font-heading text-base font-bold">
              عمولة الذروة
              <HelpTip>
                نسبة مئوية تُضاف فوق السعر النهائي للعرض (بعد المسافة والحد الأدنى والذهاب
                والعودة والانتظار)، وتُطبَّق على كل الفئات معاً.
              </HelpTip>
            </h3>
            <p className="text-sm text-muted-foreground">
              للأعياد والمناسبات وأوقات تكدس الطلبات.
            </p>
          </div>

          <Label className="flex cursor-pointer items-center justify-between gap-3 rounded-lg border border-input p-3 text-sm font-normal">
            <span className="leading-relaxed">
              <span className="font-medium">تفعيل عمولة الذروة الآن</span>
              <span className="block text-muted-foreground">
                عند التفعيل تُضاف النسبة لكل عرض سعر جديد فوراً — بلا إعادة نشر ولا كود.
              </span>
            </span>
            <input
              type="checkbox"
              name="peak_enabled"
              defaultChecked={settings.peakEnabled}
              disabled={readOnly}
              className="size-5 shrink-0 accent-primary"
            />
          </Label>

          <div className="grid gap-4 sm:grid-cols-2">
            <NumberField
              id="peak_percent"
              label="نسبة الذروة (٪)"
              name="peak_percent"
              defaultValue={settings.peakPercent}
              disabled={readOnly}
              required
              step="0.5"
              min={0}
              max={100}
              help="مثال: ١٥ تعني زيادة ١٥٪ فوق السعر النهائي. يمكنك ضبط النسبة مسبقاً وتركها غير مفعّلة حتى موعد الذروة."
            />
            <div className="space-y-1.5">
              <Label htmlFor="currency" className="flex items-center gap-1.5">
                عملة الأسعار
                <HelpTip>
                  عملة واحدة في هذه المرحلة، وتُقرأ من قاعدة البيانات لا من الكود. تعدد
                  العملات يأتي مع مرحلة اللغات وبوابات الدفع الدولية.
                </HelpTip>
              </Label>
              <Input id="currency" dir="ltr" defaultValue={settings.currency} disabled readOnly />
            </div>
          </div>

          <Card className="gap-2 bg-muted/40 p-4 text-sm leading-relaxed ring-0">
            <p className="font-medium">كيف تعمل عمولة الذروة</p>
            <p className="text-muted-foreground">
              تُضاف فوق السعر النهائي أياً كان مصدره — تعريفة الكيلومتر أو سعر متعهد —
              فهي آخر خطوة في الحساب دائماً. التفعيل الآن <span className="font-medium">يدوي</span>{" "}
              من هذا المفتاح، وفي مرحلة لاحقة يتولاه وكيل الذكاء الاصطناعي تلقائياً بحسب
              المناسبات وتكدس الطلبات.
            </p>
          </Card>
        </Card>

        {/* الهامش — يخص أسعار المتعهدين وحدها */}
        <Card className="space-y-4 p-5">
          <div>
            <h3 className="flex items-center gap-1.5 font-heading text-base font-bold">
              <Percent className="size-4 text-primary" />
              الهامش
              <HelpTip>
                ربح الموقع فوق <span className="font-medium">تكلفة المتعهد</span>. حين يغطي متعهد
                معتمد مسار الرحلة يصير سعر العميل = أرخص تكلفة متعهد + هذا الهامش.
              </HelpTip>
            </h3>
            <p className="text-sm text-muted-foreground">
              يُطبَّق على الرحلات المسعَّرة من قوائم أسعار المتعهدين فقط.
            </p>
          </div>

          {!marginEditable && (
            <Card className="flex flex-row items-start gap-3 border-amber-300 bg-amber-50 p-4 text-amber-900 ring-0 dark:border-amber-700 dark:bg-amber-950 dark:text-amber-100">
              <AlertTriangle className="mt-0.5 size-5 shrink-0" />
              <p className="text-sm leading-relaxed">
                أعمدة الهامش غير موجودة في <code dir="ltr">pricing_settings</code> بعد — نفِّذ
                هجرة المرحلة ٥ من <code dir="ltr">supabase/migrations</code> ثم أعد تحميل الصفحة.
                حفظ إعدادات الذروة يعمل الآن كالمعتاد.
              </p>
            </Card>
          )}

          <div className="grid gap-3 sm:grid-cols-2">
            <MarginTypeOption
              value="percent"
              title="نسبة مئوية"
              description="الهامش = تكلفة المتعهد × النسبة. يكبر الربح مع كبر الرحلة تلقائياً."
              checked={settings.marginType === "percent"}
              disabled={!marginEditable}
            />
            <MarginTypeOption
              value="fixed"
              title="مبلغ ثابت"
              description="الهامش مبلغ واحد لكل رحلة أياً كانت تكلفتها — أبسط في التتبع."
              checked={settings.marginType === "fixed"}
              disabled={!marginEditable}
            />
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <NumberField
              id="margin_value"
              label="قيمة الهامش"
              name="margin_value"
              defaultValue={settings.marginValue ?? DEFAULT_MARGIN.marginValue}
              disabled={!marginEditable}
              required={marginEditable}
              step="0.5"
              min={0}
              help="تُقرأ بحسب النوع أعلاه: مع «نسبة مئوية» الرقم ٢٠ يعني ٢٠٪ من تكلفة المتعهد، ومع «مبلغ ثابت» يعني ٢٠ جنيهاً لكل رحلة."
            />
            <NumberField
              id="margin_min_amount"
              label="أرضية الهامش (بالجنيه)"
              name="margin_min_amount"
              defaultValue={settings.marginMinAmount ?? DEFAULT_MARGIN.marginMinAmount}
              disabled={!marginEditable}
              step="10"
              min={0}
              help="أقل ربح تقبله من رحلة متعهد. تحمي المسارات الرخيصة: ٢٠٪ من تكلفة ٣٠٠ جنيه = ٦٠ جنيهاً فقط، والأرضية ترفعها إلى الحد الذي تحدده."
            />
          </div>

          <Card className="gap-2 bg-muted/40 p-4 text-sm leading-relaxed ring-0">
            <p className="font-medium">لماذا لا يُطبَّق الهامش على تعريفة الكيلومتر</p>
            <p className="text-muted-foreground">
              تعريفة الكيلومتر في شاشة «الأسطول»{" "}
              <span className="font-medium">تحتوي ربح الموقع أصلاً</span> — فهي سعر بيع لا سعر
              شراء. إضافة الهامش فوقها احتساب مزدوج يرفع السعر مرتين. أما قائمة أسعار المتعهد
              فهي <span className="font-medium">تكلفة شراء</span> بلا ربح، ومن هنا يأتي الهامش.
            </p>
            <p className="text-muted-foreground">
              ترتيب الحساب كاملاً: تكلفة المتعهد ← + الهامش (بأرضيته) ← الحد الأدنى للفئة ←
              الذهاب والعودة ← ساعات الانتظار ← عمولة الذروة. وعند تعدد المتعهدين المغطّين
              للمسار يُؤخذ <span className="font-medium">أرخصهم</span>.
            </p>
          </Card>

          <Separator />
          <div className="flex justify-end">
            <Button type="submit" disabled={readOnly}>
              حفظ إعدادات التسعير
            </Button>
          </div>
        </Card>
      </form>

      <form action={readOnly ? undefined : testQuote}>
        <Card className="space-y-4 p-5">
          <div>
            <h3 className="flex items-center gap-1.5 font-heading text-base font-bold">
              <FlaskConical className="size-4 text-primary" />
              صندوق اختبار الأسعار
              <HelpTip>
                يستدعي نفس دالة التسعير التي يستدعيها الموقع العام بالمسافة التي تكتبها (بلا
                خرائط ولا عناوين) — فتتحقق من أثر أي تعديل في التعريفة أو الذروة أو الهامش فوراً
                بدون فتح الموقع.
              </HelpTip>
            </h3>
            <p className="text-sm text-muted-foreground">
              لا يحفظ شيئاً ولا يُنشئ طلباً — عرض نتيجة فقط.
            </p>
          </div>

          <div className="grid gap-4 sm:grid-cols-3">
            <NumberField
              id="distance_km"
              label="المسافة (كم)"
              name="distance_km"
              defaultValue={testInput?.km ?? null}
              disabled={readOnly}
              required
              step="1"
              min={1}
              help="مسافة الاتجاه الواحد بالكيلومتر — في الموقع تأتي من محرك المسافات."
            />
            <NumberField
              id="passengers"
              label="عدد الركاب"
              name="passengers"
              defaultValue={testInput?.passengers ?? null}
              disabled={readOnly}
              required
              step="1"
              min={1}
              help="يحدد الفئات المرشّحة: أصغر فئة تكفي العدد + الفئة الأعلى مباشرة."
            />
            <NumberField
              id="waiting_hours"
              label="ساعات الانتظار"
              name="waiting_hours"
              defaultValue={testInput?.waitingHours ?? 0}
              disabled={readOnly}
              step="0.5"
              min={0}
              max={24}
              help="تُضرب في سعر ساعة الانتظار الخاص بكل فئة."
            />
          </div>

          <Label className="flex w-fit cursor-pointer items-center gap-2 text-sm font-normal">
            <input
              type="checkbox"
              name="round_trip"
              defaultChecked={testInput?.roundTrip ?? false}
              disabled={readOnly}
              className="size-4 accent-primary"
            />
            ذهاب وعودة
            <HelpTip>
              يطبّق معامل الذهاب والعودة الخاص بكل فئة بعد الحد الأدنى وقبل ساعات الانتظار.
            </HelpTip>
          </Label>

          <Separator />

          {/* الإحداثيات — اختيارية، وهي ما يشغّل مطابقة التغطية */}
          <div className="space-y-3">
            <div>
              <p className="flex items-center gap-1.5 text-sm font-medium">
                إحداثيات المسار (اختيارية)
                <HelpTip>
                  افتح خرائط جوجل، اضغط بزر الفأرة الأيمن على النقطة، وانسخ الرقمين كما هما ثم
                  الصقهما هنا. الصيغة: خط العرض ثم فاصلة ثم خط الطول.
                </HelpTip>
              </p>
              <p className="text-sm text-muted-foreground">
                اترك الحقلين فارغين لاختبار مسار{" "}
                <span className="font-medium">تعريفة الكيلومتر</span> وحده. بملئهما تشتغل مطابقة
                تغطية المتعهدين ويظهر مصدر السعر لكل فئة.
              </p>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <TextField
                id="origin_point"
                label="نقطة الانطلاق"
                name="origin_point"
                placeholder="30.0444, 31.2357"
                defaultValue={pointValue(
                  testInput?.coords?.originLat,
                  testInput?.coords?.originLng
                )}
                disabled={readOnly}
                help="تُطابَق مع نقطة بداية كل قائمة أسعار معتمدة ضمن نطاقها بالكيلومترات."
              />
              <TextField
                id="dest_point"
                label="نقطة الوصول"
                name="dest_point"
                placeholder="31.2001, 29.9187"
                defaultValue={pointValue(testInput?.coords?.destLat, testInput?.coords?.destLng)}
                disabled={readOnly}
                help="تُطابَق مع نقطة نهاية القائمة. القائمة ثنائية الاتجاه تُطابق الاتجاه المعاكس أيضاً."
              />
            </div>
          </div>

          <div className="flex justify-end">
            <Button type="submit" variant="outline" disabled={readOnly}>
              احسب الأسعار
            </Button>
          </div>

          {test && testInput && (
            <>
              <Separator />
              {test.failed ? (
                <p className="text-sm font-medium text-red-700 dark:text-red-300">
                  تعذر الاحتساب — تأكد أن دالة <code dir="ltr">quote_price</code> منفَّذة في
                  قاعدة البيانات (هجرة المرحلة ٣).
                </p>
              ) : test.rows.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  لا توجد فئة نشطة تتسع لـ {numberFmt.format(testInput.passengers)} راكباً —
                  فعّل فئة أكبر من شاشة الأسطول أو راجع سعات الفئات.
                </p>
              ) : (
                <div className="space-y-2">
                  <p className="text-sm text-muted-foreground">
                    نتيجة {numberFmt.format(testInput.km)} كم ·{" "}
                    {numberFmt.format(testInput.passengers)} راكباً ·{" "}
                    {testInput.roundTrip ? "ذهاب وعودة" : "اتجاه واحد"} ·{" "}
                    {numberFmt.format(testInput.waitingHours)} ساعة انتظار ·{" "}
                    {testInput.coords ? "مع مطابقة التغطية" : "بلا إحداثيات (التعريفة وحدها)"}
                  </p>

                  <div className="overflow-x-auto">
                    <table
                      className={
                        showSourceColumns
                          ? "w-full min-w-[56rem] text-sm"
                          : "w-full min-w-[38rem] text-sm"
                      }
                    >
                      <thead>
                        <tr className="border-b border-border text-start text-xs text-muted-foreground">
                          <th className="p-2 text-start font-medium">الفئة</th>
                          <th className="p-2 text-start font-medium">السعة</th>
                          {showSourceColumns && (
                            <>
                              <th className="p-2 text-start font-medium">مصدر السعر</th>
                              <th className="p-2 text-start font-medium">تكلفة المتعهد</th>
                              <th className="p-2 text-start font-medium">الهامش</th>
                            </>
                          )}
                          <th className="p-2 text-start font-medium">المصروف الثابت</th>
                          <th className="p-2 text-start font-medium">تكلفة المسافة</th>
                          <th className="p-2 text-start font-medium">الانتظار</th>
                          <th className="p-2 text-start font-medium">القواعد المطبَّقة</th>
                          <th className="p-2 text-start font-medium">الإجمالي</th>
                        </tr>
                      </thead>
                      <tbody>
                        {test.rows.map((row) => {
                          const source = isPriceSource(row.price_source)
                            ? row.price_source
                            : null;
                          const cost = moneyOrDash(row.subcontractor_cost);
                          const margin = moneyOrDash(row.margin_amount);
                          return (
                            <tr
                              key={row.class_slug}
                              className="border-b border-border last:border-0"
                            >
                              <td className="p-2">
                                <span className="font-medium">{row.class_title}</span>
                                <code dir="ltr" className="ms-1.5 text-xs text-muted-foreground">
                                  {row.class_slug}
                                </code>
                              </td>
                              <td className="p-2" dir="ltr">
                                {numberFmt.format(Number(row.capacity))}
                              </td>
                              {showSourceColumns && (
                                <>
                                  <td className="p-2">
                                    {source ? (
                                      <SourceBadge source={source} />
                                    ) : (
                                      <span className="text-muted-foreground">—</span>
                                    )}
                                  </td>
                                  <td className="p-2" dir="ltr">
                                    {cost ?? <span className="text-muted-foreground">—</span>}
                                  </td>
                                  <td className="p-2" dir="ltr">
                                    {margin ?? <span className="text-muted-foreground">—</span>}
                                  </td>
                                </>
                              )}
                              <td className="p-2" dir="ltr">
                                {money(row.base_fee)}
                              </td>
                              <td className="p-2" dir="ltr">
                                {money(row.distance_cost)}
                              </td>
                              <td className="p-2" dir="ltr">
                                {money(row.waiting_cost)}
                              </td>
                              <td className="p-2">
                                <span className="flex flex-wrap gap-1">
                                  <Flag on={row.min_applied} label="الحد الأدنى" />
                                  <Flag on={row.round_trip_applied} label="ذهاب وعودة" />
                                  <Flag on={row.peak_applied} label="ذروة" />
                                </span>
                              </td>
                              <td className="p-2 font-bold" dir="ltr">
                                {money(row.total)} {settings.currency}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>

                  {/* قراءة النتيجة: هل اشتغلت التغطية فعلاً؟ */}
                  {testInput.coords && !test.coverageEngaged && (
                    <p className="text-sm leading-relaxed text-amber-800 dark:text-amber-200">
                      أدخلتَ إحداثيات لكن دالة <code dir="ltr">quote_price</code> في قاعدة
                      البيانات لم تُرقَّ بعد لتقبلها — نُفِّذ الاختبار بتعريفة الكيلومتر وحدها.
                      طبّق هجرة المرحلة ٥ من <code dir="ltr">supabase/migrations</code> ثم أعد
                      الاختبار لترى مصدر السعر والتكلفة والهامش.
                    </p>
                  )}
                  {test.coverageEngaged && !anySubcontractor && (
                    <p className="text-sm leading-relaxed text-amber-800 dark:text-amber-200">
                      لا توجد قائمة أسعار معتمدة تغطي هذا المسار — سُعِّرت كل الفئات بتعريفة
                      الكيلومتر. راجع نطاقات القوائم في شاشة المتعهدين، أو وسّع نطاق النقطة.
                    </p>
                  )}
                  {anySubcontractor && (
                    <p className="text-sm leading-relaxed text-muted-foreground">
                      الفئات الموسومة <span className="font-medium">«سعر متعهد»</span> سعرها =
                      أرخص تكلفة متعهد مغطٍّ + الهامش (بأرضيته)، والباقي على تعريفة الكيلومتر.
                      عمودا التكلفة والهامش داخليان تماماً —{" "}
                      <span className="font-medium">لا يظهران للعميل إطلاقاً</span>.
                    </p>
                  )}
                  {!testInput.coords && (
                    <p className="text-sm leading-relaxed text-muted-foreground">
                      بلا إحداثيات لا تُطابَق التغطية أصلاً — هذه نتيجة مسار تعريفة الكيلومتر.
                      املأ نقطتي المسار أعلاه لاختبار أسعار المتعهدين.
                    </p>
                  )}
                  {test.coverageEngaged && !showSourceColumns && (
                    <p className="text-sm leading-relaxed text-amber-800 dark:text-amber-200">
                      الدالة قبلت الإحداثيات لكنها لم تُرجع عمود مصدر السعر — تأكد أن هجرة
                      المرحلة ٥ طُبِّقت كاملة على قاعدة البيانات.
                    </p>
                  )}

                  <p className="text-xs text-muted-foreground">
                    الأرقام كلها من دالة <code dir="ltr">quote_price</code> في قاعدة البيانات —
                    نفس ما يراه العميل في الموقع العام لحظة الاختبار.
                  </p>
                </div>
              )}
            </>
          )}
        </Card>
      </form>
    </div>
  );
}
