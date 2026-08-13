import Link from "next/link";
import {
  BarChart3,
  Megaphone,
  Percent,
  Plus,
  Power,
  PowerOff,
  ShieldAlert,
  TicketPercent,
} from "lucide-react";

import { formatAmount, formatDateLabel, formatMoney } from "@/components/booking/format";
import { HelpTip } from "@/components/shared/HelpTip";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { DEFAULT_DISCOUNT_SETTINGS } from "@/lib/discount-types";
import { createServerSupabase } from "@/lib/supabase/server";
import { cn } from "@/lib/utils";
import {
  CheckboxField,
  ErrorAlert,
  NotReady,
  NumberField,
  SavedAlert,
  SelectField,
  TextField,
  UsageMeter,
} from "./_components/fields";
import { createCoupon, saveDiscountSettings, toggleCoupon } from "./actions";
import {
  blank,
  hasSupabaseEnv,
  type LoadedCoupon,
  type LoadedDiscountSettings,
  readCoupons,
  readCurrency,
  readDiscountSettings,
} from "./loader";

/**
 * إدارة الكوبونات وإعدادات نظام الخصومات (المرحلة ١٢أ).
 *
 * **ما تفعله هذه الشاشة وما لا تفعله** — القاعدة ٣ في `lib/discount-types.ts`:
 * الخصم يُحسب في `public.apply_discount` وحدها، وهي التي تمنع نزول الهامش تحت
 * أرضيته. هذه الشاشة تكتب **شروط** الكوبون ولا تُقرّر قيمة خصم واحدة، ولا
 * تستطيع أن تسمح بما ترفضه القاعدة. لذلك كل نص هنا يقول أين يقع الإنفاذ
 * صراحةً: شاشة تدّعي إنفاذاً لا تملكه هي النمط ٢ في `handover/LESSONS.md`،
 * وقد وقع في هذا المستودع مرتين.
 */

export const metadata = { title: "الخصومات" };

const ERROR_MESSAGES: Record<string, string> = {
  env: "قاعدة البيانات غير مربوطة — لا يمكن الحفظ بعد.",
  code: "الرمز غير صالح — حروف لاتينية وأرقام وشرطات فقط، من ٣ إلى ٣٢ خانة (مثال: SUMMER-25).",
  exists: "يوجد كوبون بهذا الرمز بالفعل — المقارنة بلا حساسية لحالة الأحرف، فـ summer وSUMMER رمز واحد.",
  kind: "اختر نوع الخصم: نسبة مئوية أو مبلغ ثابت.",
  value: "قيمة الخصم يجب أن تكون رقماً أكبر من صفر.",
  percent: "نسبة الخصم لا تتجاوز ١٠٠٪.",
  maxpercent: "السقف العام للخصم يجب أن يكون بين ٠ و١٠٠٪.",
  marginpercent: "أدنى هامش بعد الخصم يجب أن يكون نسبة بين ٠ و١٠٠٪.",
  marginamount: "أدنى هامش بالجنيه يجب أن يكون رقماً غير سالب.",
  ratelimit: "حدّ المحاولات يجب أن يكون عدداً صحيحاً من ١ إلى ٦٠٠ في الدقيقة.",
  constraint:
    "رفضت قاعدة البيانات هذه القيم لمخالفتها أحد قيودها. راجع القيمة والنافذة والسقف ثم أعد المحاولة.",
  save: "فشل الحفظ — تأكد أنك مسجل الدخول بحساب دوره admin (راجع supabase/README.md، فخ الصفوف الصفرية).",
};

/**
 * حالة الكوبون **كما تُقرأ من صفّه الآن** — وصف لا إنفاذ.
 *
 * الحسم النهائي يقع في `apply_discount` لحظة التطبيق، وقد يختلف عن هذا الوصف
 * بفارق ثوانٍ (كوبون انتهى بينما الصفحة مفتوحة). لذلك تحمل الشاشة تلميحاً
 * يقول ذلك بدل أن يقرأ المالك «سارٍ» على أنه ضمان.
 */
function couponState(coupon: LoadedCoupon, nowIso: string): {
  label: string;
  tone: "live" | "off" | "waiting" | "done";
} {
  if (!coupon.enabled) return { label: "معطَّل", tone: "off" };
  if (coupon.endsAt !== null && coupon.endsAt <= nowIso) return { label: "انتهت نافذته", tone: "done" };
  if (coupon.startsAt !== null && coupon.startsAt > nowIso)
    return { label: "لم يبدأ بعد", tone: "waiting" };
  if (coupon.maxUses !== null && coupon.usedCount >= coupon.maxUses)
    return { label: "بلغ سقف الاستخدام", tone: "done" };
  return { label: "سارٍ الآن", tone: "live" };
}

const STATE_CLASSES: Record<string, string> = {
  live: "border-emerald-400 text-emerald-700 dark:text-emerald-300",
  off: "text-muted-foreground",
  waiting: "border-sky-400 text-sky-700 dark:text-sky-300",
  done: "border-amber-400 text-amber-700 dark:text-amber-300",
};

/** نافذة الصلاحية في سطر واحد — «بلا نهاية» تُكتب لفظاً لا تُترك فارغة */
function windowLabel(coupon: LoadedCoupon): string {
  const from = formatDateLabel(coupon.startsAt);
  const to = formatDateLabel(coupon.endsAt);
  if (!from && !to) return "بلا نافذة — سارٍ من لحظة تفعيله وحتى تعطيله";
  if (from && !to) return `من ${from} · بلا نهاية`;
  if (!from && to) return `حتى ${to}`;
  return `${from} ← ${to}`;
}

function CouponRow({
  coupon,
  currency,
  maxPercent,
  systemEnabled,
}: {
  coupon: LoadedCoupon;
  currency: string;
  maxPercent: number;
  systemEnabled: boolean;
}) {
  const nowIso = new Date().toISOString();
  const state = couponState(coupon, nowIso);
  const overCap = coupon.kind === "percent" && coupon.value > maxPercent;

  return (
    <tr className="border-b border-border align-top last:border-0 hover:bg-muted/40">
      <td className="p-2">
        <Link
          href={`/admin/discounts/${coupon.id}`}
          dir="ltr"
          className="block font-medium text-primary hover:underline"
        >
          {coupon.code}
        </Link>
        <span className="mt-0.5 block text-xs text-muted-foreground">
          {coupon.classSlugs.length === 0
            ? "كل الفئات"
            : `فئات: ${coupon.classSlugs.join("، ")}`}
        </span>
      </td>

      <td className="p-2">
        <span dir="ltr" className="block font-medium tabular-nums">
          {coupon.kind === "percent"
            ? `${formatAmount(coupon.value)}٪`
            : formatMoney(coupon.value, currency)}
        </span>
        {coupon.kind === "percent" && coupon.maxAmount !== null ? (
          <span className="block text-xs text-muted-foreground">
            بسقف {formatMoney(coupon.maxAmount, currency)}
          </span>
        ) : null}
        {overCap ? (
          <span className="mt-1 block text-xs text-amber-700 dark:text-amber-300">
            أعلى من السقف العام ({formatAmount(maxPercent)}٪)
          </span>
        ) : null}
      </td>

      <td className="p-2 text-xs leading-relaxed text-muted-foreground">{windowLabel(coupon)}</td>

      <td className="p-2">
        <UsageMeter used={coupon.usedCount} cap={coupon.maxUses} compact />
        <span className="mt-1 block text-xs text-muted-foreground">
          {coupon.maxUsesPerPhone === null
            ? "بلا حد لكل عميل"
            : `${formatAmount(coupon.maxUsesPerPhone)} لكل رقم هاتف`}
        </span>
      </td>

      <td className="p-2">
        <Badge variant="outline" className={cn("font-normal", STATE_CLASSES[state.tone])}>
          {state.label}
        </Badge>
        {state.tone === "live" && !systemEnabled ? (
          <span className="mt-1 block text-xs text-amber-700 dark:text-amber-300">
            لا يعمل — النظام مطفأ
          </span>
        ) : null}
      </td>

      <td className="p-2">
        <div className="flex flex-wrap items-center gap-1">
          <Link
            href={`/admin/discounts/${coupon.id}`}
            className={cn(buttonVariants({ variant: "ghost", size: "sm" }))}
          >
            تعديل
          </Link>
          <form action={toggleCoupon.bind(null, coupon.id, "/admin/discounts")}>
            <Button
              type="submit"
              variant="ghost"
              size="sm"
              title={
                coupon.enabled
                  ? "تعطيل الكوبون: يُرفض فوراً في كل عرض سعر وحجز جديد، والحجوزات القائمة لا تتأثر"
                  : "تفعيل الكوبون: يعمل ضمن نافذة صلاحيته وشروطه"
              }
            >
              {coupon.enabled ? <PowerOff /> : <Power />}
              {coupon.enabled ? "تعطيل" : "تفعيل"}
            </Button>
          </form>
        </div>
      </td>
    </tr>
  );
}

function SettingsCard({
  settings,
  currency,
  readOnly,
  ready,
}: {
  settings: LoadedDiscountSettings;
  currency: string;
  readOnly: boolean;
  /** هل نجحت قراءة الإعدادات؟ الفشل يُقال، ولا يُقرأ الافتراضي على أنه محفوظ */
  ready: boolean;
}) {
  return (
    <Card className="space-y-4 p-5">
      <div>
        <h3 className="flex flex-wrap items-center gap-1.5 font-heading text-base font-bold">
          <ShieldAlert className="size-4 shrink-0 text-primary" />
          إعدادات نظام الخصومات
          <HelpTip>
            هذه القيم يقرأها الحاجز داخل قاعدة البيانات (<code dir="ltr">apply_discount</code>) عند
            كل تطبيق خصم. تغييرها يسري على العروض الجديدة فوراً، ولا يغيّر جنيهاً واحداً في حجز
            قائم — لقطة سعر الحجز مجمَّدة بما فيها خصمه.
          </HelpTip>
        </h3>
        {!ready ? (
          <p className="mt-1 text-sm text-amber-700 dark:text-amber-300">
            تعذّرت قراءة الإعدادات من قاعدة البيانات — المعروض أدناه هو الافتراضي المكتوب في
            العقد لا ما هو محفوظ فعلاً. السبب مذكور في البطاقة الكهرمانية أعلى الشاشة.
          </p>
        ) : !settings.exists ? (
          <p className="mt-1 text-sm text-amber-700 dark:text-amber-300">
            لا صف إعدادات في قاعدة البيانات بعد — المعروض هو الافتراضي المكتوب في العقد، وليس
            محفوظاً. اضغط «حفظ الإعدادات» لإنشائه.
          </p>
        ) : null}
      </div>

      <form action={readOnly ? undefined : saveDiscountSettings} className="space-y-4">
        <CheckboxField
          id="discount-enabled"
          name="enabled"
          label="نظام الخصومات مفعَّل"
          defaultChecked={settings.enabled}
          disabled={readOnly}
          help="المفتاح الرئيسي. وهو مطفأ في البذرة عمداً: لا حملة تبدأ بلا قرار بشري. وهو مطفأ ⇒ كل كوبون يُرفض مهما كان مفعّلاً وضمن نافذته."
        />

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <NumberField
            id="max-percent"
            label="أقصى نسبة خصم مسموح بها"
            name="max_percent"
            defaultValue={settings.maxPercent}
            disabled={readOnly}
            required
            step="0.5"
            min={0}
            max={100}
            help="حارس فوق الحارس: لا يتجاوز أي خصم هذه النسبة من إجمالي الرحلة — وذلك يشمل الكوبون بمبلغ ثابت أيضاً، فمبلغ كبير على رحلة رخيصة يُقلَّص إلى هذه النسبة. الفرض داخل apply_discount لا في هذه الشاشة، فلا يستطيع أي مسار تخطيه."
          />
          <NumberField
            id="min-margin-percent"
            label="أدنى هامش بعد الخصم (٪)"
            name="min_margin_percent_after_discount"
            defaultValue={settings.minMarginPercentAfterDiscount}
            disabled={readOnly}
            required
            step="0.5"
            min={0}
            max={100}
            help="نسبةً من تكلفة المتعهد. الخصم الذي ينزل بالهامش تحتها يُقلَّص إلى ما تحتمله الأرضية — أو يُرفض إن لم يبقَ ما يُخصم."
          />
          <NumberField
            id="min-margin-amount"
            label={`أدنى هامش بعد الخصم (${currency})`}
            name="min_margin_amount_after_discount"
            defaultValue={settings.minMarginAmountAfterDiscount}
            disabled={readOnly}
            required
            help="أرضية بالمبلغ تعمل مع النسبة معاً: يُؤخذ الأشدّ منهما. تحمي الرحلات الرخيصة التي تكون نسبتها كبيرة ومبلغها تافهاً."
          />
          <NumberField
            id="verify-rate-limit"
            label="محاولات التحقق في الدقيقة"
            name="verify_rate_limit_per_minute"
            defaultValue={settings.verifyRateLimitPerMinute}
            disabled={readOnly}
            required
            step="1"
            min={1}
            max={600}
            help="لكل عنوان زائر. مسار التحقق من الرمز عام يقبل مدخلاً من المتصفح، فبلا حدّ تُجرَّب آلاف الرموز حتى يُصاب رمز صالح. الرقم يُقرأ من هنا ويُفرض في مسار التحقق العام، لا في المتصفح."
          />
        </div>

        <div className="flex justify-end">
          <Button type="submit" disabled={readOnly}>
            حفظ الإعدادات
          </Button>
        </div>
      </form>
    </Card>
  );
}

export default async function DiscountsPage({ searchParams }: PageProps<"/admin/discounts">) {
  const params = await searchParams;
  const wired = hasSupabaseEnv();
  const supabase = await createServerSupabase();

  const [currency, settingsRead, couponsRead] = supabase
    ? await Promise.all([readCurrency(supabase), readDiscountSettings(supabase), readCoupons(supabase)])
    : ([
        "EGP",
        // القيم من العقد لا مكتوبة هنا — رقمٌ منسوخ يوماً يصير مصدر حقيقة موازياً
        blank<LoadedDiscountSettings>(
          { ...DEFAULT_DISCOUNT_SETTINGS, id: null, exists: false },
          "discount_settings"
        ),
        blank<LoadedCoupon[]>([], "coupons"),
      ] as const);

  const readOnly = !couponsRead.ready;
  const saved = params.saved === "1";
  const enabledFlash = params.enabled === "1";
  const disabledFlash = params.disabled === "1";
  const error = typeof params.error === "string" ? params.error : null;
  const settings = settingsRead.data;

  return (
    <div className="mx-auto max-w-6xl space-y-5">
      <div>
        <h2 className="flex flex-wrap items-center gap-2 font-heading text-lg font-bold">
          <TicketPercent className="size-5 shrink-0 text-primary" />
          الخصومات والكوبونات
          <HelpTip>
            الخصم طبقة تقع بعد بناء السعر لا خطوة داخله: خصم ١٠٪ يعني ١٠٪ من السعر الذي يراه
            العميل بعد عمولة الذروة. ويُقتطع من هامش الموقع وحده — تكلفة المتعهد التزام تعاقدي
            لا تمسّها حملة تسويقية.
          </HelpTip>
        </h2>
        <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
          أنشئ الكوبونات واضبط شروطها، وتابع استخدامها مقابل سقفها. القيمة المطبَّقة فعلاً
          تحسمها قاعدة البيانات، وتظهر في سجل استخدام كل كوبون.
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Link
          href="/admin/discounts/banners"
          className={cn(buttonVariants({ variant: "outline", size: "sm" }))}
        >
          <Megaphone />
          بانرات العروض
        </Link>
        <Link
          href="/admin/stats/discounts"
          className={cn(buttonVariants({ variant: "outline", size: "sm" }))}
        >
          <BarChart3 />
          إحصائيات الخصومات
        </Link>
      </div>

      {(!couponsRead.ready || couponsRead.failure !== null) && (
        <NotReady
          wired={wired}
          missing={couponsRead.missing ?? "coupons"}
          failure={couponsRead.failure}
        />
      )}

      {saved && <SavedAlert>حُفظ التغيير وسرى على العروض الجديدة فوراً.</SavedAlert>}
      {enabledFlash && <SavedAlert>فُعِّل الكوبون — يعمل الآن ضمن نافذة صلاحيته وشروطه.</SavedAlert>}
      {disabledFlash && (
        <SavedAlert>
          عُطِّل الكوبون — يُرفض فوراً في كل عرض سعر جديد، والحجوزات القائمة لا تتأثر.
        </SavedAlert>
      )}
      {error && <ErrorAlert>{ERROR_MESSAGES[error] ?? "حدث خطأ غير متوقع."}</ErrorAlert>}

      {/* الإنذار يُبنى على قراءة الإعدادات نفسها: «مطفأ» يُقال حين نعرف أنه مطفأ
          فعلاً، لا حين تعذّرت القراءة فسقطنا إلى افتراضي العقد */}
      {settingsRead.ready && !settings.enabled && (
        <Card className="flex flex-row items-start gap-3 border-amber-300 bg-amber-50 p-4 text-amber-900 dark:border-amber-700 dark:bg-amber-950 dark:text-amber-100">
          <ShieldAlert className="mt-0.5 size-5 shrink-0" />
          <div className="space-y-1 text-sm leading-relaxed">
            <p className="font-semibold">نظام الخصومات مطفأ الآن</p>
            <p>
              لا كوبون يُطبَّق مهما كان مفعّلاً وضمن نافذته، ولا يظهر حقل الكوبون أثراً في أي
              سعر. فعّله من بطاقة الإعدادات أدناه حين تبدأ الحملة فعلاً.
            </p>
          </div>
        </Card>
      )}

      <SettingsCard
        settings={settings}
        currency={currency}
        readOnly={readOnly || !settingsRead.ready}
        ready={settingsRead.ready}
      />

      <Card className="space-y-4 p-5">
        <div className="flex flex-wrap items-start gap-2">
          <div className="min-w-0 flex-1">
            <h3 className="flex flex-wrap items-center gap-1.5 font-heading text-base font-bold">
              <Percent className="size-4 shrink-0 text-primary" />
              الكوبونات
              <HelpTip>
                عمود «الاستخدام» يعرض العدّاد مقابل السقف كما تكتبهما القاعدة. والزيادة الذرّية
                عند الحجز تمنع تجاوز السقف حتى مع حجزين متزامنين على آخر استخدام متاح.
              </HelpTip>
            </h3>
            <p className="mt-0.5 text-sm text-muted-foreground">
              اضغط الرمز لفتح شاشة الكوبون: بقية الشروط، وسجل الاستخدام بالقيمة الاسمية مقابل
              المطبَّقة فعلاً.
            </p>
          </div>
        </div>

        {couponsRead.ready && couponsRead.data.length === 0 ? (
          <div className="rounded-lg border border-dashed border-border bg-muted/30 p-5 text-center">
            <p className="text-sm font-medium">لا كوبون بعد</p>
            <p className="mx-auto mt-1 max-w-md text-xs leading-relaxed text-muted-foreground">
              أضف أول كوبون من النموذج أدناه. يُنشأ معطَّلاً دائماً، فتضبط شروطه ثم تفعّله حين
              تبدأ الحملة.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[52rem] text-sm">
              <thead>
                <tr className="border-b border-border text-xs text-muted-foreground">
                  <th className="p-2 text-start font-medium">الرمز والنطاق</th>
                  <th className="p-2 text-start font-medium">قيمة الخصم</th>
                  <th className="p-2 text-start font-medium">نافذة الصلاحية</th>
                  <th className="p-2 text-start font-medium">الاستخدام</th>
                  <th className="p-2 text-start font-medium">الحالة</th>
                  <th className="p-2 text-start font-medium">إجراءات</th>
                </tr>
              </thead>
              <tbody>
                {couponsRead.data.map((coupon) => (
                  <CouponRow
                    key={coupon.id}
                    coupon={coupon}
                    currency={currency}
                    maxPercent={settings.maxPercent}
                    systemEnabled={settings.enabled}
                  />
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <form action={readOnly ? undefined : createCoupon}>
        <Card className="space-y-4 p-5">
          <div>
            <h3 className="flex items-center gap-1.5 font-heading text-base font-bold">
              كوبون جديد
              <HelpTip>
                الرمز والنوع والقيمة فقط الآن. بقية الشروط (النافذة، السقوف، الفئات، الحد لكل
                عميل) تُضبط في شاشة الكوبون بعد إنشائه.
              </HelpTip>
            </h3>
            <p className="text-sm text-muted-foreground">
              يُنشأ الكوبون <strong>معطَّلاً</strong> دائماً — لا حملة تبدأ بلا قرار بشري.
            </p>
          </div>

          <div className="grid gap-4 sm:grid-cols-3">
            <TextField
              id="new-code"
              label="رمز الكوبون"
              name="code"
              dir="ltr"
              placeholder="SUMMER-25"
              disabled={readOnly}
              required
              maxLength={32}
              pattern="[A-Za-z0-9][A-Za-z0-9-]{1,30}[A-Za-z0-9]"
              help="ما يكتبه العميل في حقل الكوبون. المقارنة وقت التحقق بلا حساسية لحالة الأحرف ولا مسافات، فيُخزَّن هنا بحروف كبيرة."
              hint="حروف لاتينية وأرقام وشرطات، ٣–٣٢ خانة."
            />
            <SelectField
              id="new-kind"
              label="نوع الخصم"
              name="kind"
              defaultValue="percent"
              disabled={readOnly}
              options={[
                { value: "percent", label: "نسبة مئوية" },
                { value: "amount", label: "مبلغ ثابت" },
              ]}
              help="النسبة تُحسب من الإجمالي بعد بناء السعر كاملاً. المبلغ الثابت يُخصم كما هو — وكلاهما يخضع لأرضية الهامش."
            />
            <NumberField
              id="new-value"
              label="القيمة"
              name="value"
              disabled={readOnly}
              required
              min={0}
              help="نسبة مئوية (١٠ تعني ١٠٪) أو مبلغ بعملة الموقع، بحسب النوع المختار."
            />
          </div>

          <div className="flex justify-end">
            <Button type="submit" disabled={readOnly}>
              <Plus />
              إضافة الكوبون
            </Button>
          </div>
        </Card>
      </form>

      <Separator />

      <p className="text-xs leading-relaxed text-muted-foreground">
        هوية العميل في «الحد لكل عميل» هي <strong>رقم الهاتف المكتوب في الحجز وحده</strong> — لا
        حساب ولا بريد ولا جهاز. فمن يحجز برقمين يُحسب عميلين، ومن يحجز لأسرته برقم واحد يُحسب
        عميلاً واحداً. هذا حدّ النظام اليوم، وحسابات العملاء مؤجَّلة إلى المرحلة ١٢ب.
      </p>
    </div>
  );
}
