import Link from "next/link";
import { ArrowRight, Megaphone, Plus, Power, PowerOff } from "lucide-react";

import { formatDateTimeLabel } from "@/components/booking/format";
import { HelpTip } from "@/components/shared/HelpTip";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { createServerSupabase } from "@/lib/supabase/server";
import { cn } from "@/lib/utils";
import {
  CheckboxField,
  DateField,
  ErrorAlert,
  NotReady,
  NumberField,
  SavedAlert,
  SelectField,
  TextareaField,
  TextField,
} from "../_components/fields";
import { cairoDateInput } from "../input";
import {
  blank,
  hasSupabaseEnv,
  type LoadedBanner,
  type LoadedCoupon,
  readBanners,
  readCoupons,
} from "../loader";
import { createBanner, saveBanner, toggleBanner } from "./actions";

/**
 * بانرات العروض — نصوص تحفيزية يملكها المالك، **بلا أثر على أي سعر**.
 *
 * البانر يعرض رمز كوبون للعرض فقط؛ التحقق من الرمز وقيمته يبقيان في
 * `apply_discount` وحدها. ولذلك تحذّر الشاشة حين يشير بانر إلى رمز لا كوبون
 * له، أو إلى كوبون معطَّل: الإعلان الذي يَعِد بخصم لا يقع هو النمط ٢ في
 * `handover/LESSONS.md` واقعاً أمام العميل لا أمام المالك.
 */

export const metadata = { title: "بانرات العروض" };

const PLACEMENTS: { value: LoadedBanner["placement"]; label: string; where: string }[] = [
  {
    value: "home",
    label: "الصفحة الرئيسية",
    where: "أعلى الصفحة الرئيسية — أوسع مدى وأقلّ نية شراء.",
  },
  {
    value: "offers",
    label: "شاشة العروض",
    where: "مع بطاقات الأسعار بعد البحث — الزائر يقارن الآن، وهذا أنسب موضع للتحفيز.",
  },
  {
    value: "checkout",
    label: "صفحة الحجز",
    where: "قبل تأكيد الحجز مباشرةً — يذكّر بالرمز من قرّر بالفعل.",
  },
];

const PLACEMENT_LABELS: Record<string, string> = Object.fromEntries(
  PLACEMENTS.map((one) => [one.value, one.label])
);

const ERROR_MESSAGES: Record<string, string> = {
  env: "قاعدة البيانات غير مربوطة — لا يمكن الحفظ بعد.",
  title: "عنوان البانر إلزامي ولا يتجاوز ١٢٠ حرفاً.",
  body: "نص البانر لا يتجاوز ٤٠٠ حرف.",
  placement: "اختر موضع ظهور البانر.",
  code: "رمز الكوبون غير صالح — حروف لاتينية وأرقام وشرطات فقط. اتركه فارغاً لبانر بلا رمز.",
  dates: "تاريخ غير صالح — استعمل منتقي التاريخ في الحقل.",
  window: "تاريخ البداية يجب أن يسبق تاريخ النهاية.",
  sort: "ترتيب العرض يجب أن يكون عدداً صحيحاً بين ٠ و٩٩٩.",
  save: "فشل الحفظ — تأكد أنك مسجل الدخول بحساب دوره admin (راجع supabase/README.md، فخ الصفوف الصفرية).",
};

/** حالة الرمز المعروض في البانر مقابل الكوبونات الحقيقية */
function codeState(
  banner: LoadedBanner,
  coupons: LoadedCoupon[]
): { tone: "none" | "ok" | "off" | "missing"; note: string } {
  if (!banner.couponCode) return { tone: "none", note: "بانر بلا رمز — نصّ تحفيزي فقط." };
  const found = coupons.find(
    (coupon) => coupon.code.toUpperCase() === banner.couponCode?.toUpperCase()
  );
  if (!found)
    return {
      tone: "missing",
      note: "لا كوبون بهذا الرمز في قاعدة البيانات — الزائر سيكتبه ويُرفض.",
    };
  if (!found.enabled)
    return { tone: "off", note: "الكوبون موجود لكنه معطَّل — الرمز المعروض لن يعمل." };
  return { tone: "ok", note: "الرمز يطابق كوبوناً مفعَّلاً." };
}

const CODE_TONE: Record<string, string> = {
  none: "text-muted-foreground",
  ok: "text-emerald-700 dark:text-emerald-300",
  off: "text-amber-700 dark:text-amber-300",
  missing: "text-red-700 dark:text-red-300",
};

function BannerCard({
  banner,
  coupons,
  readOnly,
}: {
  banner: LoadedBanner;
  coupons: LoadedCoupon[];
  readOnly: boolean;
}) {
  const f = (name: string) => `${banner.id}-${name}`;
  const code = codeState(banner, coupons);

  return (
    <Card className="space-y-4 p-5">
      <div className="flex flex-wrap items-center gap-2">
        <h3 className="font-heading text-base font-bold">{banner.title || "بانر بلا عنوان"}</h3>
        <Badge variant="outline" className="font-normal">
          {PLACEMENT_LABELS[banner.placement] ?? banner.placement}
        </Badge>
        <Badge variant={banner.enabled ? "default" : "secondary"}>
          {banner.enabled ? "ظاهر" : "مخفي"}
        </Badge>
        <form action={readOnly ? undefined : toggleBanner.bind(null, banner.id)} className="ms-auto">
          <Button
            type="submit"
            variant="ghost"
            size="sm"
            disabled={readOnly}
            title={
              banner.enabled
                ? "إخفاء البانر: يختفي من الموقع العام فوراً"
                : "إظهار البانر: يظهر ضمن نافذة صلاحيته"
            }
          >
            {banner.enabled ? <PowerOff /> : <Power />}
            {banner.enabled ? "إخفاء" : "إظهار"}
          </Button>
        </form>
      </div>

      <p className={cn("text-xs leading-relaxed", CODE_TONE[code.tone])}>{code.note}</p>

      <form action={readOnly ? undefined : saveBanner.bind(null, banner.id)} className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <TextField
            id={f("title")}
            label="العنوان"
            name="title"
            defaultValue={banner.title}
            disabled={readOnly}
            required
            maxLength={120}
            help="السطر الذي يقرأه الزائر أولاً. اجعله يقول العرض نفسه لا شعاراً عاماً."
          />
          <SelectField
            id={f("placement")}
            label="موضع الظهور"
            name="placement"
            defaultValue={banner.placement}
            disabled={readOnly}
            options={PLACEMENTS.map((one) => ({ value: one.value, label: one.label }))}
            help="ثلاثة مواضع فقط: الرئيسية، شاشة العروض، صفحة الحجز. البانر يظهر في موضع واحد — أنشئ نسخة أخرى لموضع ثانٍ."
          />
        </div>

        <TextareaField
          id={f("body")}
          label="النص"
          name="body"
          defaultValue={banner.body}
          disabled={readOnly}
          maxLength={400}
          help="سطر أو سطران يشرحان الشرط: «للرحلات فوق ٥٠٠ جنيه» مثلاً. اتركه فارغاً ليظهر العنوان وحده."
        />

        <div className="grid gap-4 sm:grid-cols-4">
          <TextField
            id={f("coupon_code")}
            label="رمز الكوبون المعروض"
            name="coupon_code"
            dir="ltr"
            defaultValue={banner.couponCode}
            disabled={readOnly}
            maxLength={32}
            help="للعرض فقط. كتابته هنا لا تُنشئ كوبوناً ولا تفعّله — الرمز يُتحقق منه في قاعدة البيانات حين يكتبه العميل."
          />
          <DateField
            id={f("starts_at")}
            label="يظهر من"
            name="starts_at"
            defaultValue={cairoDateInput(banner.startsAt)}
            disabled={readOnly}
            help="منتصف ليل ذلك اليوم بتوقيت القاهرة. اتركه فارغاً ليظهر فور تفعيله."
            hint={
              banner.startsAt ? `المحفوظ: ${formatDateTimeLabel(banner.startsAt) ?? "—"}` : undefined
            }
          />
          <DateField
            id={f("ends_at")}
            label="يختفي بعد نهاية يوم"
            name="ends_at"
            defaultValue={cairoDateInput(banner.endsAt)}
            disabled={readOnly}
            help="آخر ثانية من ذلك اليوم بتوقيت القاهرة، فاليوم المكتوب يبقى ظاهراً كاملاً."
            hint={banner.endsAt ? `المحفوظ: ${formatDateTimeLabel(banner.endsAt) ?? "—"}` : undefined}
          />
          <NumberField
            id={f("sort")}
            label="ترتيب العرض"
            name="sort"
            defaultValue={banner.sort}
            disabled={readOnly}
            step="1"
            min={0}
            max={999}
            help="الأصغر أولاً حين يوجد أكثر من بانر في الموضع نفسه."
          />
        </div>

        <CheckboxField
          id={f("enabled")}
          name="enabled"
          label="البانر ظاهر"
          defaultChecked={banner.enabled}
          disabled={readOnly}
          help="المخفي يبقى بنصّه ونافذته لكنه لا يظهر للزوار إطلاقاً."
        />

        <div className="flex justify-end">
          <Button type="submit" disabled={readOnly}>
            حفظ البانر
          </Button>
        </div>
      </form>
    </Card>
  );
}

export default async function BannersPage({
  searchParams,
}: PageProps<"/admin/discounts/banners">) {
  const params = await searchParams;
  const wired = hasSupabaseEnv();
  const supabase = await createServerSupabase();

  const [bannersRead, couponsRead] = supabase
    ? await Promise.all([readBanners(supabase), readCoupons(supabase)])
    : ([blank<LoadedBanner[]>([], "promo_banners"), blank<LoadedCoupon[]>([], "coupons")] as const);

  const readOnly = !bannersRead.ready;
  const saved = params.saved === "1";
  const created = params.created === "1";
  const enabledFlash = params.enabled === "1";
  const disabledFlash = params.disabled === "1";
  const error = typeof params.error === "string" ? params.error : null;

  return (
    <div className="mx-auto max-w-4xl space-y-5">
      <Link
        href="/admin/discounts"
        className={cn(buttonVariants({ variant: "ghost", size: "sm" }), "w-fit")}
      >
        <ArrowRight />
        الخصومات والكوبونات
      </Link>

      <div>
        <h2 className="flex flex-wrap items-center gap-2 font-heading text-lg font-bold">
          <Megaphone className="size-5 shrink-0 text-primary" />
          بانرات العروض
          <HelpTip>
            البانر إعلان نصّي فقط: لا يمنح خصماً ولا يغيّر سعراً. أثره الوحيد أن يرى الزائر
            العرض ورمزه، والخصم نفسه لا يقع إلا حين يكتب الرمز ويقبله النظام.
          </HelpTip>
        </h2>
        <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
          ثلاثة مواضع ونافذة صلاحية لكل بانر. والشرط مفروض في قاعدة البيانات نفسها: سياسة
          القراءة العامة لا تُرجع إلا بانراً «ظاهراً» وداخل نافذته، فلا يظهر شيء بخطأ في شاشة.
        </p>
      </div>

      {(!bannersRead.ready || bannersRead.failure !== null) && (
        <NotReady
          wired={wired}
          missing={bannersRead.missing ?? "promo_banners"}
          failure={bannersRead.failure}
        />
      )}

      {created && (
        <SavedAlert>أُنشئ البانر مخفياً — راجع نصّه ثم أظهره من زر «إظهار».</SavedAlert>
      )}
      {saved && <SavedAlert>حُفظ البانر وانعكس على الموقع العام فوراً.</SavedAlert>}
      {enabledFlash && <SavedAlert>ظهر البانر في موضعه على الموقع العام.</SavedAlert>}
      {disabledFlash && <SavedAlert>أُخفي البانر — اختفى من الموقع العام فوراً.</SavedAlert>}
      {error && <ErrorAlert>{ERROR_MESSAGES[error] ?? "حدث خطأ غير متوقع."}</ErrorAlert>}

      <Card className="space-y-2 p-5">
        <h3 className="font-heading text-sm font-bold">المواضع الثلاثة</h3>
        <ul className="space-y-1.5 text-xs leading-relaxed text-muted-foreground">
          {PLACEMENTS.map((one) => (
            <li key={one.value}>
              <strong className="text-foreground">{one.label}:</strong> {one.where}
            </li>
          ))}
        </ul>
      </Card>

      {bannersRead.ready && bannersRead.data.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border bg-muted/30 p-5 text-center">
          <p className="text-sm font-medium">لا بانر بعد</p>
          <p className="mx-auto mt-1 max-w-md text-xs leading-relaxed text-muted-foreground">
            أضف أول بانر من النموذج أدناه. يُنشأ مخفياً، فتراجع نصّه ثم تُظهره.
          </p>
        </div>
      ) : (
        bannersRead.data.map((banner) => (
          <BannerCard
            key={banner.id}
            banner={banner}
            coupons={couponsRead.data}
            readOnly={readOnly}
          />
        ))
      )}

      <form action={readOnly ? undefined : createBanner}>
        <Card className="space-y-4 p-5">
          <div>
            <h3 className="flex items-center gap-1.5 font-heading text-base font-bold">
              بانر جديد
              <HelpTip>
                يُنشأ مخفياً دائماً مهما كان المربّع، كما يُنشأ الكوبون معطَّلاً: لا نصّ يظهر على
                الموقع العام بضغطة واحدة بلا مراجعة.
              </HelpTip>
            </h3>
            <p className="text-sm text-muted-foreground">
              اكتب العنوان واختر الموضع، ثم أظهره من بطاقته بعد المراجعة.
            </p>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <TextField
              id="new-banner-title"
              label="العنوان"
              name="new.title"
              placeholder="خصم ١٠٪ على رحلات المطار"
              disabled={readOnly}
              required
              maxLength={120}
            />
            <SelectField
              id="new-banner-placement"
              label="موضع الظهور"
              name="new.placement"
              defaultValue="offers"
              disabled={readOnly}
              options={PLACEMENTS.map((one) => ({ value: one.value, label: one.label }))}
            />
          </div>

          <TextareaField
            id="new-banner-body"
            label="النص"
            name="new.body"
            placeholder="اكتب الرمز في خانة الكوبون قبل تأكيد الحجز."
            disabled={readOnly}
            maxLength={400}
          />

          <div className="grid gap-4 sm:grid-cols-4">
            <TextField
              id="new-banner-code"
              label="رمز الكوبون المعروض"
              name="new.coupon_code"
              dir="ltr"
              placeholder="SUMMER-25"
              disabled={readOnly}
              maxLength={32}
              help="اختياري — وللعرض فقط."
            />
            <DateField
              id="new-banner-starts"
              label="يظهر من"
              name="new.starts_at"
              disabled={readOnly}
            />
            <DateField
              id="new-banner-ends"
              label="يختفي بعد نهاية يوم"
              name="new.ends_at"
              disabled={readOnly}
            />
            <NumberField
              id="new-banner-sort"
              label="ترتيب العرض"
              name="new.sort"
              defaultValue={0}
              disabled={readOnly}
              step="1"
              min={0}
              max={999}
            />
          </div>

          <div className="flex justify-end">
            <Button type="submit" disabled={readOnly}>
              <Plus />
              إضافة البانر
            </Button>
          </div>
        </Card>
      </form>
    </div>
  );
}
