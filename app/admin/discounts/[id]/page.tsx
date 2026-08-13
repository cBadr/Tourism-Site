import Link from "next/link";
import {
  ArrowRight,
  ListChecks,
  Power,
  PowerOff,
  Scissors,
  TicketPercent,
  Users,
} from "lucide-react";

import {
  formatAmount,
  formatDateTimeLabel,
  formatMoney,
} from "@/components/booking/format";
import { HelpTip } from "@/components/shared/HelpTip";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { createServerSupabase } from "@/lib/supabase/server";
import { cn } from "@/lib/utils";
import {
  CheckboxField,
  ClampedBadge,
  ErrorAlert,
  NotReady,
  NumberField,
  SavedAlert,
  SelectField,
  TextField,
  DateField,
  UsageMeter,
} from "../_components/fields";
import { saveCoupon, toggleCoupon } from "../actions";
import { cairoDateInput } from "../input";
import {
  blank,
  type ClassOption,
  type CouponRedemption,
  hasSupabaseEnv,
  type LoadedCoupon,
  MAX_ROWS,
  readBookingRefs,
  readClassOptions,
  readCoupon,
  readCurrency,
  readRedemptions,
} from "../loader";

/**
 * شاشة كوبون واحد: شروطه، وسجل استخدامه.
 *
 * **لماذا يظهر «الاسمي مقابل المطبَّق» في هذه الشاشة؟** لأن أرضية الهامش قد
 * تُقلّص خصماً دون أن يشعر أحد: المالك يعلن «٣٠٪» وتطبّق القاعدة ١٢٪ لأن الرحلة
 * لا تحتمل أكثر. بلا هذا الجدول يكتشف الفارق يوماً من تقرير الهامش ويظنّه عطلاً
 * — وهو النمط ٢ في `handover/LESSONS.md` بعينه (واجهة تَعِد بما لا يقع). ولذلك
 * أيضاً لا تُملأ خانة «الاسمي» بقيمة المطبَّق حين لا تُرجعها القاعدة: يُكتب «—»
 * ويُقال السبب، فالفراغ الصادق أهون من عمود يوحي بأن كل خصم طُبِّق كاملاً.
 */

export const metadata = { title: "تعديل كوبون" };

const ERROR_MESSAGES: Record<string, string> = {
  env: "قاعدة البيانات غير مربوطة — لا يمكن الحفظ بعد.",
  code: "الرمز غير صالح — حروف لاتينية وأرقام وشرطات فقط، من ٣ إلى ٣٢ خانة.",
  exists: "يوجد كوبون آخر بهذا الرمز — المقارنة بلا حساسية لحالة الأحرف.",
  kind: "اختر نوع الخصم: نسبة مئوية أو مبلغ ثابت.",
  value: "قيمة الخصم يجب أن تكون رقماً أكبر من صفر.",
  percent: "نسبة الخصم لا تتجاوز ١٠٠٪.",
  maxamount: "سقف قيمة الخصم يجب أن يكون رقماً أكبر من صفر — اتركه فارغاً إن كنت لا تريد سقفاً.",
  mintotal: "أدنى إجمالي للرحلة يجب أن يكون رقماً غير سالب — اتركه فارغاً إن كان الكوبون بلا شرط.",
  classes: "إحدى الفئات المختارة غير موجودة — أعد تحميل الصفحة واختر من القائمة.",
  dates: "تاريخ غير صالح — استعمل منتقي التاريخ في الحقل.",
  window: "تاريخ البداية يجب أن يسبق تاريخ النهاية.",
  maxuses: "سقف الاستخدام الإجمالي يجب أن يكون عدداً صحيحاً من ١ فأكثر — اتركه فارغاً لبلا سقف.",
  perphone: "الحد لكل عميل يجب أن يكون عدداً صحيحاً من ١ فأكثر — اتركه فارغاً لبلا حد.",
  capbelowused:
    "رفضت قاعدة البيانات السقف: لا يمكن أن يكون أقل من عدد الاستخدامات الواقعة فعلاً. لإيقاف الكوبون استعمل زر «تعطيل» بدلاً من خفض السقف.",
  constraint:
    "رفضت قاعدة البيانات هذه القيم لمخالفتها أحد قيودها. راجع القيمة والنافذة والسقف ثم أعد المحاولة.",
  save: "فشل الحفظ — تأكد أنك مسجل الدخول بحساب دوره admin (راجع supabase/README.md، فخ الصفوف الصفرية).",
};

/** صف استخدام واحد — القيمتان تُطبعان كما وصلتا، ولا يُشتق بينهما فارق */
function RedemptionRow({
  row,
  currency,
  booking,
  currentCode,
}: {
  row: CouponRedemption;
  currency: string;
  booking: { reference: string; status: string | null; total: number | null } | undefined;
  /** رمز الكوبون الآن — يُظهر الفرق حين استُخدم برمز قديم قبل تعديله */
  currentCode: string;
}) {
  const usedOtherCode =
    row.code !== null && row.code.toUpperCase() !== currentCode.toUpperCase();
  return (
    <tr className="border-b border-border align-top last:border-0 hover:bg-muted/40">
      <td className="p-2 text-xs whitespace-nowrap text-muted-foreground">
        {formatDateTimeLabel(row.createdAt) ?? "—"}
      </td>
      <td className="p-2">
        {row.bookingId && booking ? (
          <Link
            href={`/admin/orders/${row.bookingId}`}
            dir="ltr"
            className="font-medium text-primary hover:underline"
          >
            {booking.reference}
          </Link>
        ) : (
          <span className="text-xs text-muted-foreground">—</span>
        )}
        {usedOtherCode ? (
          <span dir="ltr" className="mt-0.5 block text-[11px] text-muted-foreground">
            استُخدم برمز: {row.code}
          </span>
        ) : null}
      </td>
      <td className="p-2">
        <span dir="ltr" className="text-xs text-muted-foreground">
          {row.phone ?? "—"}
        </span>
      </td>
      <td className="p-2">
        <span dir="ltr" className="tabular-nums">
          {row.amountNominal === null ? "—" : formatMoney(row.amountNominal, currency)}
        </span>
      </td>
      <td className="p-2">
        <span dir="ltr" className="font-medium tabular-nums">
          {row.amount === null ? "—" : formatMoney(row.amount, currency)}
        </span>
      </td>
      <td className="p-2">
        {row.clamped === true ? (
          <ClampedBadge />
        ) : row.clamped === false ? (
          <span className="text-xs text-muted-foreground">طُبِّق كاملاً</span>
        ) : (
          <span className="text-xs text-muted-foreground">غير معروف</span>
        )}
      </td>
    </tr>
  );
}

function ClassPicker({
  options,
  selected,
  disabled,
}: {
  options: ClassOption[];
  selected: string[];
  disabled: boolean;
}) {
  if (options.length === 0) {
    return (
      <p className="text-xs leading-relaxed text-muted-foreground">
        لا فئات سيارات في قاعدة البيانات — الكوبون يبقى ساري المفعول على كل الفئات.
      </p>
    );
  }
  return (
    <div className="flex flex-wrap gap-3">
      {options.map((option) => (
        <label
          key={option.slug}
          className="flex cursor-pointer items-center gap-2 rounded-lg border border-border px-2.5 py-1.5 text-sm"
        >
          <input
            type="checkbox"
            name="class_slugs"
            value={option.slug}
            defaultChecked={selected.includes(option.slug)}
            disabled={disabled}
            className="size-4 accent-primary"
          />
          <span>{option.title}</span>
          {!option.active ? (
            <Badge variant="outline" className="text-[10px] font-normal text-muted-foreground">
              فئة متوقفة
            </Badge>
          ) : null}
        </label>
      ))}
    </div>
  );
}

export default async function CouponPage({
  params,
  searchParams,
}: PageProps<"/admin/discounts/[id]">) {
  const [{ id }, query] = await Promise.all([params, searchParams]);
  const wired = hasSupabaseEnv();
  const supabase = await createServerSupabase();

  const [currency, couponRead, classesRead, redemptionsRead] = supabase
    ? await Promise.all([
        readCurrency(supabase),
        readCoupon(supabase, id),
        readClassOptions(supabase),
        readRedemptions(supabase, id),
      ])
    : ([
        "EGP",
        blank<LoadedCoupon | null>(null, "coupons"),
        blank<ClassOption[]>([], "vehicle_classes"),
        blank<CouponRedemption[]>([], "coupon_redemptions"),
      ] as const);

  const coupon = couponRead.data;
  const bookings =
    supabase && redemptionsRead.ready
      ? await readBookingRefs(
          supabase,
          redemptionsRead.data.map((row) => row.bookingId ?? "")
        )
      : new Map<string, { reference: string; status: string | null; total: number | null }>();

  const saved = query.saved === "1";
  const created = query.created === "1";
  const enabledFlash = query.enabled === "1";
  const disabledFlash = query.disabled === "1";
  const error = typeof query.error === "string" ? query.error : null;
  const readOnly = !couponRead.ready || coupon === null;

  // هل في السجل صف واحد على الأقل قلّصته الأرضية؟ (فحص وجود لا تجميع رقم)
  const anyClamped = redemptionsRead.data.some((row) => row.clamped === true);
  // القيمة الاسمية لا يسجّلها الجدول اليوم — يُقال ذلك صراحةً بدل عمود «—» صامت
  const nominalMissing =
    redemptionsRead.ready &&
    redemptionsRead.data.length > 0 &&
    redemptionsRead.data.every((row) => row.amountNominal === null);

  return (
    <div className="mx-auto max-w-5xl space-y-5">
      <Link
        href="/admin/discounts"
        className={cn(buttonVariants({ variant: "ghost", size: "sm" }), "w-fit")}
      >
        <ArrowRight />
        كل الكوبونات
      </Link>

      {(!couponRead.ready || couponRead.failure !== null) && (
        <NotReady
          wired={wired}
          missing={couponRead.missing ?? "coupons"}
          failure={couponRead.failure}
        />
      )}

      {couponRead.ready && coupon === null && (
        <Card className="p-5 text-sm leading-relaxed">
          لا كوبون بهذا المعرّف — قد يكون الرابط قديماً. ارجع إلى{" "}
          <Link href="/admin/discounts" className="text-primary hover:underline">
            قائمة الكوبونات
          </Link>
          .
        </Card>
      )}

      {created && (
        <SavedAlert>
          أُنشئ الكوبون معطَّلاً. اضبط شروطه ونافذته أدناه ثم فعّله حين تبدأ الحملة.
        </SavedAlert>
      )}
      {saved && <SavedAlert>حُفظت شروط الكوبون وسرت على العروض الجديدة فوراً.</SavedAlert>}
      {enabledFlash && <SavedAlert>فُعِّل الكوبون.</SavedAlert>}
      {disabledFlash && <SavedAlert>عُطِّل الكوبون — يُرفض فوراً في كل عرض سعر جديد.</SavedAlert>}
      {error && <ErrorAlert>{ERROR_MESSAGES[error] ?? "حدث خطأ غير متوقع."}</ErrorAlert>}

      {coupon !== null && (
        <>
          <Card className="space-y-4 p-5">
            <div className="flex flex-wrap items-center gap-2">
              <TicketPercent className="size-5 shrink-0 text-primary" />
              <h2 dir="ltr" className="font-heading text-lg font-bold">
                {coupon.code}
              </h2>
              <Badge variant={coupon.enabled ? "default" : "secondary"}>
                {coupon.enabled ? "مفعَّل" : "معطَّل"}
              </Badge>
              <form
                action={toggleCoupon.bind(null, coupon.id, `/admin/discounts/${coupon.id}`)}
                className="ms-auto"
              >
                <Button
                  type="submit"
                  variant="ghost"
                  size="sm"
                  title={
                    coupon.enabled
                      ? "تعطيل الكوبون: يُرفض فوراً في كل عرض سعر وحجز جديد"
                      : "تفعيل الكوبون: يعمل ضمن نافذة صلاحيته وشروطه"
                  }
                >
                  {coupon.enabled ? <PowerOff /> : <Power />}
                  {coupon.enabled ? "تعطيل" : "تفعيل"}
                </Button>
              </form>
            </div>

            <div className="flex flex-wrap items-end gap-6">
              <div>
                <span className="mb-1 flex items-center gap-1.5 text-xs text-muted-foreground">
                  الاستخدام مقابل السقف
                  <HelpTip>
                    العدّاد يزيد داخل معاملة الحجز نفسها ذرّياً، فحجزان متزامنان على آخر استخدام
                    متاح لا يتجاوزان السقف. وسقفٌ فارغ يعني بلا سقف إجمالي.
                  </HelpTip>
                </span>
                <UsageMeter used={coupon.usedCount} cap={coupon.maxUses} />
              </div>
              <p className="max-w-md text-xs leading-relaxed text-muted-foreground">
                خفض السقف تحت عدد الاستخدامات الواقعة ترفضه قاعدة البيانات بقيد على الصف نفسه —
                لإيقاف الكوبون فوراً استعمل زر «تعطيل».
              </p>
            </div>
          </Card>

          <form action={readOnly ? undefined : saveCoupon.bind(null, coupon.id)}>
            <Card className="space-y-5 p-5">
              <h3 className="font-heading text-base font-bold">شروط الكوبون</h3>

              <div className="grid gap-4 sm:grid-cols-3">
                <TextField
                  id="code"
                  label="الرمز"
                  name="code"
                  dir="ltr"
                  defaultValue={coupon.code}
                  disabled={readOnly}
                  required
                  maxLength={32}
                  pattern="[A-Za-z0-9][A-Za-z0-9-]{1,30}[A-Za-z0-9]"
                  help="تغيير الرمز بعد نشر الحملة يُبطل كل ما طُبع أو أُرسل بالرمز القديم فوراً — لا يبقى الرمزان صالحين معاً."
                />
                <SelectField
                  id="kind"
                  label="نوع الخصم"
                  name="kind"
                  defaultValue={coupon.kind}
                  disabled={readOnly}
                  options={[
                    { value: "percent", label: "نسبة مئوية" },
                    { value: "amount", label: "مبلغ ثابت" },
                  ]}
                  help="النسبة تُحسب من إجمالي الرحلة بعد بناء السعر كاملاً (بما فيه الذروة). المبلغ الثابت يُخصم كما هو."
                />
                <NumberField
                  id="value"
                  label={coupon.kind === "percent" ? "القيمة (٪)" : `القيمة (${currency})`}
                  name="value"
                  defaultValue={coupon.value}
                  disabled={readOnly}
                  required
                  min={0}
                  help="القيمة الاسمية للحملة. المطبَّق فعلاً قد يكون أقل حين تتدخل أرضية الهامش — وسيظهر ذلك في سجل الاستخدام أدناه موسوماً «قُلِّص»."
                />
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <NumberField
                  id="max-amount"
                  label={`سقف قيمة الخصم (${currency})`}
                  name="max_amount"
                  defaultValue={coupon.maxAmount}
                  disabled={readOnly || coupon.kind !== "percent"}
                  min={0}
                  placeholder="بلا سقف"
                  help="يخصّ النسبة وحدها: «٢٠٪ بحد أقصى ٣٠٠» تعني أن رحلة بألفين تُخصم ٣٠٠ لا ٤٠٠. اتركه فارغاً لبلا سقف."
                  hint={
                    coupon.kind === "percent"
                      ? "اتركه فارغاً لبلا سقف."
                      : "لا معنى له مع المبلغ الثابت — يُحفظ فارغاً."
                  }
                />
                <NumberField
                  id="min-trip-total"
                  label={`أدنى إجمالي للرحلة (${currency})`}
                  name="min_trip_total"
                  defaultValue={coupon.minTripTotal}
                  disabled={readOnly}
                  min={0}
                  placeholder="بلا شرط"
                  help="الكوبون لا يعمل إن كان إجمالي الرحلة أقل من هذا الرقم. يُقارَن بالإجمالي قبل الخصم."
                />
              </div>

              <div className="space-y-2">
                <span className="flex items-center gap-1.5 text-sm font-medium">
                  الفئات المشمولة
                  <HelpTip>
                    بلا اختيار = كل الفئات. تخصيص الكوبون لمسار بعينه غير متاح: «المسار» ليس
                    كياناً تسعيرياً في هذه المنصة (التغطية تُحسب بنطاقات حول نقطتين)، والتخصيص
                    مؤجَّل حتى يُعرَّف.
                  </HelpTip>
                </span>
                <ClassPicker
                  options={classesRead.data}
                  selected={coupon.classSlugs}
                  disabled={readOnly}
                />
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <DateField
                  id="starts-at"
                  label="يبدأ من"
                  name="starts_at"
                  defaultValue={cairoDateInput(coupon.startsAt)}
                  disabled={readOnly}
                  help="يُحفظ عند منتصف ليل ذلك اليوم بتوقيت القاهرة. اتركه فارغاً ليعمل الكوبون من لحظة تفعيله."
                  hint={
                    coupon.startsAt
                      ? `المحفوظ: ${formatDateTimeLabel(coupon.startsAt) ?? "—"}`
                      : "بلا بداية محددة."
                  }
                />
                <DateField
                  id="ends-at"
                  label="ينتهي في نهاية يوم"
                  name="ends_at"
                  defaultValue={cairoDateInput(coupon.endsAt)}
                  disabled={readOnly}
                  help="آخر ثانية من ذلك اليوم بتوقيت القاهرة — فاليوم المكتوب يبقى صالحاً كاملاً. اتركه فارغاً لحملة بلا نهاية."
                  hint={
                    coupon.endsAt
                      ? `المحفوظ: ${formatDateTimeLabel(coupon.endsAt) ?? "—"}`
                      : "بلا نهاية محددة."
                  }
                />
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <NumberField
                  id="max-uses"
                  label="سقف الاستخدام الإجمالي"
                  name="max_uses"
                  defaultValue={coupon.maxUses}
                  disabled={readOnly}
                  step="1"
                  min={1}
                  placeholder="بلا سقف"
                  help="أقصى عدد حجوزات يُقبل فيها الكوبون على الإطلاق. العدّاد يزيد ذرّياً داخل معاملة الحجز، فلا يتجاوز السقف حتى مع حجزين متزامنين."
                />
                <NumberField
                  id="max-uses-per-phone"
                  label="الحد لكل عميل"
                  name="max_uses_per_phone"
                  defaultValue={coupon.maxUsesPerPhone}
                  disabled={readOnly}
                  step="1"
                  min={1}
                  placeholder="بلا حد"
                  help="هوية العميل هنا هي رقم الهاتف المكتوب في الحجز وحده — لا حساب ولا بريد ولا جهاز. رقمان لشخص واحد = عميلان."
                  hint="الهوية = رقم الهاتف فقط."
                />
              </div>

              <CheckboxField
                id="enabled"
                name="enabled"
                label="الكوبون مفعَّل"
                defaultChecked={coupon.enabled}
                disabled={readOnly}
                help="المعطَّل يُرفض فوراً في كل عرض سعر وحجز جديد. والحجوزات القائمة لا تتأثر: خصمها مجمَّد في لقطة سعرها."
              />

              <div className="flex justify-end">
                <Button type="submit" disabled={readOnly}>
                  حفظ الشروط
                </Button>
              </div>
            </Card>
          </form>

          <Card className="space-y-4 p-5">
            <div>
              <h3 className="flex flex-wrap items-center gap-1.5 font-heading text-base font-bold">
                <ListChecks className="size-4 shrink-0 text-primary" />
                سجل الاستخدام
                <HelpTip>
                  صف لكل استخدام: القيمة المطبَّقة فعلاً بعد أرضية الهامش، وعمود يقول هل قلّصتها
                  الأرضية. أما «القيمة الاسمية» فلا يسجّلها جدول الاستخدامات اليوم — تبقى «—»،
                  والعلامة التي تخبرك أن الخصم لم يقع كاملاً هي عمود «التقليص» لا فرقٌ بين رقمين.
                </HelpTip>
              </h3>
              <p className="mt-0.5 text-sm leading-relaxed text-muted-foreground">
                آخر {formatAmount(MAX_ROWS)} استخدام على الأكثر، الأحدث أولاً.
              </p>
            </div>

            {(!redemptionsRead.ready || redemptionsRead.failure !== null) && (
              <NotReady
                wired={wired}
                missing={redemptionsRead.missing ?? "coupon_redemptions"}
                failure={redemptionsRead.failure}
              />
            )}

            {anyClamped && (
              <div className="flex items-start gap-3 rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm leading-relaxed text-amber-900 dark:border-amber-700 dark:bg-amber-950 dark:text-amber-100">
                <Scissors className="mt-0.5 size-4 shrink-0" />
                <p>
                  بعض استخدامات هذا الكوبون طُبِّقت بأقل من قيمته المعلنة: أرضية الهامش قلّصت
                  الخصم لأن الرحلة لا تحتمل أكثر. الصفوف الموسومة أدناه هي هي. إن تكرر ذلك، فقيمة
                  الحملة أعلى مما تحتمله هوامش هذه الفئة — راجع القيمة أو الفئات المشمولة.
                </p>
              </div>
            )}

            {nominalMissing && (
              <div className="flex items-start gap-3 rounded-lg border border-dashed border-border p-3 text-xs leading-relaxed text-muted-foreground">
                <Scissors className="mt-0.5 size-4 shrink-0" />
                <p>
                  عمود «القيمة الاسمية» يظهر «—» لأن جدول الاستخدامات
                  (<code dir="ltr">coupon_redemptions</code>) يسجّل المبلغ المطبَّق ووسم التقليص،
                  ولا يسجّل القيمة قبل التقليص. الخانة تبقى فارغة عمداً ولا تُملأ بقيمة
                  المطبَّق — والعلامة التي تخبرك أن الخصم لم يقع كاملاً هي عمود «التقليص».
                </p>
              </div>
            )}

            {redemptionsRead.ready && redemptionsRead.data.length === 0 ? (
              <div className="rounded-lg border border-dashed border-border bg-muted/30 p-5 text-center">
                <p className="text-sm font-medium">لم يُستخدم هذا الكوبون بعد</p>
                <p className="mx-auto mt-1 max-w-md text-xs leading-relaxed text-muted-foreground">
                  يظهر هنا صف لكل حجز طُبِّق فيه الكوبون، بقيمته الاسمية وقيمته الفعلية.
                </p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[46rem] text-sm">
                  <thead>
                    <tr className="border-b border-border text-xs text-muted-foreground">
                      <th className="p-2 text-start font-medium">التاريخ</th>
                      <th className="p-2 text-start font-medium">الحجز</th>
                      <th className="p-2 text-start font-medium">هاتف العميل</th>
                      <th className="p-2 text-start font-medium">القيمة الاسمية</th>
                      <th className="p-2 text-start font-medium">المطبَّق فعلاً</th>
                      <th className="p-2 text-start font-medium">التقليص</th>
                    </tr>
                  </thead>
                  <tbody>
                    {redemptionsRead.data.map((row) => (
                      <RedemptionRow
                        key={row.id}
                        row={row}
                        currency={currency}
                        currentCode={coupon.code}
                        booking={row.bookingId ? bookings.get(row.bookingId) : undefined}
                      />
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Card>

          <Separator />

          <div className="flex items-start gap-3 rounded-lg border border-dashed border-border p-3 text-xs leading-relaxed text-muted-foreground">
            <Users className="mt-0.5 size-4 shrink-0 text-primary" />
            <p>
              «الحد لكل عميل» يُفرض على <strong>رقم الهاتف المكتوب في الحجز</strong> وحده — وهي
              هوية العميل الوحيدة في المنصة اليوم. عميل يحجز برقمين يستهلك حدّين، وأسرة تحجز
              برقم واحد تستهلك حدّاً واحداً. لا تَعِد في إعلانك بما لا يفرضه هذا الحد.
            </p>
          </div>
        </>
      )}
    </div>
  );
}
