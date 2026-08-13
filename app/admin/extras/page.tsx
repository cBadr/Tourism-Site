import type { ReactNode } from "react";
import Link from "next/link";
import { ConciergeBell, Plus, Power, PowerOff, Trash2 } from "lucide-react";

import { formatMoney, toArabicDigits } from "@/components/booking/format";
import { HelpTip } from "@/components/shared/HelpTip";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { createServerSupabase } from "@/lib/supabase/server";
import { cn } from "@/lib/utils";
import { asNumber, asText, Banners, pick } from "../orders/_components/booking-ui";
import { createExtra, deleteExtra, saveExtra, toggleExtraActive } from "./actions";

/**
 * الخدمات الإضافية — كتالوج ما يشتريه العميل **فوق الرحلة** (هجرة `0031`).
 *
 * ثلاث حقائق تحكم كل نص في هذه الشاشة، وهي قرارات بدر المكتوبة في
 * `lib/extras-types.ts`:
 *
 *  (أ) الخدمة **طبقة بعد الذروة** لا حدٌّ داخل معادلة السعر: كرسي الأطفال بـ٢٠٠
 *      يبقى ٢٠٠ في يوم الذروة.
 *  (ب) الخدمة **خارج أساس الهامش وخارج أساس الخصم**: الكوبون يخصم سعر الرحلة
 *      وحده، وسقف موجة البث لا يتسع بقيمتها فلا يُدفع للمتعهد من مالٍ ليس هامشاً.
 *  (ج) **خدماتٌ ننفّذها نحن وحدنا** في هذه الدفعة — وما ينفّذه المتعهد مؤجَّل
 *      بسبب مكتوب (D-39)، فلا مسار في المستودع يدفع له مقابل إضافة.
 *
 * والجدول **يخرج فارغاً عمداً**: أسعار كرسي الأطفال والواي فاي لا يعرفها إلا
 * المالك (نفس سبب عدم بذر `tariffs` في `0005`). فالحالة الفارغة هنا تُعلِّم ولا
 * تدّعي وجود صفوف.
 *
 * لا حساب مالي في هذا الملف: سعر الوحدة يُقرأ ويُكتب، والضرب في الكمية والجمع
 * إلى الإجمالي داخل `price_extras` و`create_booking` في Postgres.
 */

export const metadata = { title: "الخدمات الإضافية" };

const hasSupabaseEnv = () =>
  Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);

type ExtraService = {
  id: string;
  slug: string;
  title: string;
  description: string | null;
  price: number | null;
  maxQty: number | null;
  active: boolean;
  sort: number;
};

/**
 * قراءة الكتالوج + عملة الموقع.
 *
 * `ready` تعني: البيئة مضبوطة والجدول موجود فعلاً (هجرة `0031` منفَّذة). وقبلها
 * تُعرض الشاشة للمعاينة معطَّلة بالكامل — لا نموذج يُرسَل إلى جدول غير موجود.
 */
async function loadExtras(): Promise<{
  extras: ExtraService[];
  currency: string;
  ready: boolean;
}> {
  const blank = { extras: [] as ExtraService[], currency: "EGP", ready: false };

  const supabase = await createServerSupabase();
  if (!supabase) return blank;

  const [extrasRes, currencyRes] = await Promise.all([
    supabase
      .from("extra_services")
      .select("*")
      .order("sort", { ascending: true })
      .order("title", { ascending: true }),
    supabase.from("pricing_settings").select("currency").limit(1).maybeSingle(),
  ]);

  const currency =
    (!currencyRes.error && asText(currencyRes.data?.currency)) || blank.currency;

  if (extrasRes.error) return { ...blank, currency };

  const extras = ((extrasRes.data ?? []) as Record<string, unknown>[]).map((row, index) => ({
    id: asText(row.id) ?? `extra-${index}`,
    slug: asText(row.slug) ?? "",
    title: asText(row.title) ?? "",
    description: asText(row.description),
    price: asNumber(pick(row, ["price"])),
    maxQty: asNumber(pick(row, ["max_qty", "maxQty"])),
    active: row.active === true,
    sort: asNumber(pick(row, ["sort"])) ?? 0,
  }));

  return { extras, currency, ready: true };
}

const ERROR_MESSAGES: Record<string, string> = {
  env: "قاعدة البيانات غير مربوطة — لا يمكن الحفظ بعد.",
  notready:
    "جدول الخدمات غير موجود — نفِّذ هجرة 0031 من supabase/migrations ثم أعد تحميل الصفحة. لم يُحفظ شيء.",
  title: "اسم الخدمة حقل إلزامي — وهو ما يقرؤه العميل في نموذج الحجز.",
  slug: "المعرّف غير صالح — حروف لاتينية صغيرة وأرقام تفصلها شرطات، وطوله بين حرفين و٤٠ (مثال: child-seat).",
  desc: "الوصف أطول من ٣٠٠ حرف — اختصره في سطر أو سطرين يقرؤهما العميل بجوار الخيار.",
  price: "سعر الوحدة يجب أن يكون رقماً غير سالب — والصفر مسموح لخدمة مجانية.",
  qty: "أقصى كمية يجب أن تكون عدداً صحيحاً بين ١ و٢٠ — وهو الحد الذي تفرضه القاعدة نفسها.",
  sort: "ترتيب العرض يجب أن يكون عدداً صحيحاً غير سالب.",
  exists: "يوجد خدمة بهذا المعرّف بالفعل — اختر معرّفاً آخر.",
  inuse:
    "لا يمكن حذف خدمة دخلت حجزاً — قاعدة البيانات رفضت الحذف حمايةً لتفسير سعر ذلك الحجز. أوقفها بدل حذفها: تختفي من نموذج الحجز فوراً ويبقى سعرها القديم مفهوماً في الحجوزات السابقة.",
  limits:
    "رفضت قاعدة البيانات القيمة — السعر لا يكون سالباً وأقصى كمية بين ١ و٢٠. لم يُحفظ شيء.",
  missing: "لم تعد هذه الخدمة موجودة — أعد تحميل الصفحة لترى القائمة الحقيقية.",
  save: "فشلت العملية — تأكد أنك مسجل الدخول بحساب دوره admin (راجع supabase/README.md، فخ الصفوف الصفرية).",
};

/** الخدمات الأربع التي ذكرها المالك — **أمثلة يضيفها بنفسه، لا صفوفاً موجودة** */
const EXAMPLE_SERVICES: { title: string; slug: string; note: string; ours: boolean }[] = [
  {
    title: "كرسي أطفال",
    slug: "child-seat",
    note: "سعر الكرسي الواحد، وأقصى كمية ٢ أو ٣ بحسب ما تتسع له السيارة.",
    ours: true,
  },
  {
    title: "واي فاي في السيارة",
    slug: "wifi",
    note: "أقصى كمية ١ — الخدمة للسيارة كلها لا لكل راكب.",
    ours: true,
  },
  {
    title: "مرشد سياحي",
    slug: "tour-guide",
    note: "أضفها فقط إن كنت أنت من يوفّر المرشد.",
    ours: false,
  },
  {
    title: "استقبال في المطار",
    slug: "airport-greeting",
    note: "أضفها فقط إن كان الاستقبال من فريقك لا من المتعهد.",
    ours: false,
  },
];

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
  maxLength,
}: {
  id: string;
  label: string;
  name: string;
  defaultValue?: string | null;
  placeholder?: string;
  help?: ReactNode;
  dir?: "rtl" | "ltr";
  disabled?: boolean;
  required?: boolean;
  pattern?: string;
  maxLength?: number;
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
        maxLength={maxLength}
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
  help?: ReactNode;
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

/** نص «؟» المعرّف — مكتوب مرة ويُقرأ في بطاقة الخدمة وفي نموذج الإضافة معاً */
const SLUG_HELP = (
  <>
    المعرّف الثابت الذي يرسله نموذج الحجز إلى قاعدة البيانات ليعرف أي خدمة اختار العميل.
    <strong className="font-semibold">
      {" "}
      تغيير الاسم المعروض آمن تماماً، وتغيير المعرّف ليس كذلك:
    </strong>{" "}
    الاختيار المرسَل بمعرّف قديم لا يطابق شيئاً فيُتجاهَل بصمت. لذلك لا يمكن تعديله بعد
    الإنشاء — من احتاج معرّفاً آخر فليُطفئ الخدمة ويُنشئ غيرها.
  </>
);

const MAX_QTY_HELP = (
  <>
    أقصى عدد يختاره العميل من هذه الخدمة في الحجز الواحد: كرسي أطفال ٣ · واي فاي ١.
    <strong className="font-semibold"> والحد مفروض في قاعدة البيانات لا في الواجهة:</strong>{" "}
    الطلب الذي يحمل كمية أكبر تُقصّها القاعدة إلى هذا الرقم قبل التسعير، فلا يلتفّ عليه أحد
    بتعديل الصفحة.
  </>
);

function ExtraCard({
  extra,
  currency,
  readOnly,
  confirmingDelete,
}: {
  extra: ExtraService;
  currency: string;
  readOnly: boolean;
  confirmingDelete: boolean;
}) {
  const f = (field: string) => `${extra.id}-${field}`;

  return (
    <Card className="space-y-4 p-5">
      <div className="flex flex-wrap items-center gap-2">
        <h3 className="font-heading text-base font-bold">{extra.title || "—"}</h3>
        <code dir="ltr" className="text-xs text-muted-foreground">
          {extra.slug}
        </code>
        <Badge variant={extra.active ? "default" : "secondary"}>
          {extra.active ? "معروضة" : "متوقفة"}
        </Badge>
        {extra.price !== null && (
          <span dir="ltr" className="text-sm font-medium text-muted-foreground">
            {formatMoney(extra.price, currency)}
          </span>
        )}
        <form
          action={readOnly ? undefined : toggleExtraActive.bind(null, extra.id)}
          className="ms-auto"
        >
          <Button
            type="submit"
            variant="ghost"
            size="sm"
            disabled={readOnly}
            title={
              extra.active
                ? "إيقاف الخدمة: تختفي من نموذج الحجز فوراً، والحجوزات القديمة تحتفظ بها وبسعرها"
                : "تفعيل الخدمة: تعود للظهور في نموذج الحجز بسعرها الحالي"
            }
          >
            {extra.active ? <PowerOff /> : <Power />}
            {extra.active ? "إيقاف" : "تفعيل"}
          </Button>
        </form>
      </div>

      <form action={readOnly ? undefined : saveExtra.bind(null, extra.id)} className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <TextField
            id={f("title")}
            label="اسم الخدمة"
            name="title"
            defaultValue={extra.title}
            disabled={readOnly}
            required
            help="الاسم كما يراه العميل في نموذج الحجز وفي صفحة متابعة حجزه. تغييره لا يمسّ الحجوزات السابقة: كل حجز يحتفظ بنسخة الاسم لحظة الحجز."
          />
          <div className="space-y-1.5">
            <Label className="flex items-center gap-1.5">
              المعرّف (Slug)
              <HelpTip>{SLUG_HELP}</HelpTip>
            </Label>
            <p
              dir="ltr"
              className="rounded-lg border border-dashed border-input bg-muted/40 px-2.5 py-1.5 font-mono text-sm text-muted-foreground"
            >
              {extra.slug}
            </p>
          </div>
        </div>

        <TextField
          id={f("description")}
          label="الوصف المختصر"
          name="description"
          defaultValue={extra.description}
          disabled={readOnly}
          maxLength={300}
          help="سطر واحد يظهر تحت اسم الخدمة في نموذج الحجز — اتركه فارغاً ليختفي."
        />

        <div className="grid gap-4 sm:grid-cols-3">
          <NumberField
            id={f("price")}
            label={`سعر الوحدة (${currency})`}
            name="price"
            defaultValue={extra.price}
            disabled={readOnly}
            required
            help={
              <>
                سعر الوحدة الواحدة، يُضرب في الكمية التي يختارها العميل.
                <strong className="font-semibold">
                  {" "}
                  ولا تمسّه عمولة الذروة ولا يخصمه كوبون:
                </strong>{" "}
                الخدمة تُضاف بعد بناء سعر الرحلة كاملاً — كرسي بـ٢٠٠ يبقى ٢٠٠ في يوم الذروة،
                ويبقى ٢٠٠ مع كوبون ٢٠٪.
              </>
            }
          />
          <NumberField
            id={f("max_qty")}
            label="أقصى كمية"
            name="max_qty"
            defaultValue={extra.maxQty}
            disabled={readOnly}
            required
            step="1"
            min={1}
            max={20}
            help={MAX_QTY_HELP}
          />
          <NumberField
            id={f("sort")}
            label="ترتيب العرض"
            name="sort"
            defaultValue={extra.sort}
            disabled={readOnly}
            step="1"
            min={0}
            help="ترتيب ظهور الخدمة في قائمة نموذج الحجز — الأصغر أولاً، والمتساويان يُرتَّبان بالاسم."
          />
        </div>

        <Label className="flex w-fit cursor-pointer items-center gap-2 text-sm font-normal">
          <input
            type="checkbox"
            name="active"
            defaultChecked={extra.active}
            disabled={readOnly}
            className="size-4 accent-primary"
          />
          الخدمة معروضة على العملاء
          <HelpTip>
            الخدمة المتوقفة تبقى ببياناتها وسعرها لكنها تختفي من نموذج الحجز، والاختيار
            المرسَل باسمها يُتجاهَل في القاعدة. والحجوزات التي اشترتها من قبل لا تتأثر
            إطلاقاً — لكلٍّ منها نسخته المجمَّدة من الاسم والسعر.
          </HelpTip>
        </Label>

        <div className="flex flex-wrap items-center justify-end gap-3">
          {confirmingDelete ? null : (
            <Link
              href={`/admin/extras?remove=${extra.id}`}
              className={cn(
                "inline-flex items-center gap-1.5 rounded-lg border border-red-300 px-3 py-1.5 text-sm text-red-700 transition-colors hover:bg-red-50 dark:border-red-800 dark:text-red-300 dark:hover:bg-red-950",
                readOnly && "pointer-events-none opacity-50"
              )}
            >
              <Trash2 className="size-4" />
              حذف
            </Link>
          )}
          <Button type="submit" disabled={readOnly}>
            حفظ الخدمة
          </Button>
        </div>
      </form>

      {confirmingDelete && (
        <form
          action={readOnly ? undefined : deleteExtra.bind(null, extra.id)}
          className="space-y-3 rounded-lg border border-red-300 bg-red-50 p-4 dark:border-red-700 dark:bg-red-950"
        >
          <p className="text-sm font-semibold text-red-900 dark:text-red-100">
            تأكيد حذف «{extra.title || extra.slug}»
          </p>
          <p className="text-sm leading-relaxed text-red-900/90 dark:text-red-100/90">
            الحذف نهائي ولا رجعة فيه. وإن كانت هذه الخدمة قد دخلت حجزاً واحداً فقاعدة
            البيانات ترفض حذفها وتبقى كما هي — عندها{" "}
            <span className="font-semibold">الإيقاف هو الخيار الصحيح</span>: يخفيها عن نموذج
            الحجز فوراً ويُبقي تفسير سعر تلك الحجوزات سليماً.
          </p>
          <div className="flex flex-wrap items-center gap-3">
            <Button type="submit" variant="destructive" disabled={readOnly}>
              <Trash2 />
              تأكيد الحذف
            </Button>
            <Link
              href="/admin/extras"
              className="text-sm text-muted-foreground transition-colors hover:text-foreground hover:underline"
            >
              تراجع
            </Link>
          </div>
        </form>
      )}
    </Card>
  );
}

/**
 * الحالة الفارغة — **تُعلِّم ولا تدّعي**.
 *
 * الجدول يخرج من الهجرة فارغاً عمداً، فالمالك وحده يعرف كم يساوي كرسي الأطفال.
 * والخدمات الأربع هنا **أمثلة يكتبها بنفسه**، ومنها اثنتان يوضّح نصّهما أن
 * تنفيذ المتعهد لها غير مبنيّ بعد (قرار بدر ٣ · D-39) — فلا تَعِد الشاشة بما
 * لا ينفّذه المستودع.
 */
function EmptyState({ currency }: { currency: string }) {
  return (
    <Card className="space-y-4 p-5">
      <div>
        <h3 className="flex items-center gap-1.5 font-heading text-base font-bold">
          <ConciergeBell className="size-4 text-primary" />
          لا توجد خدمات إضافية بعد
        </h3>
        <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
          الجدول يبدأ فارغاً عن قصد: سعر كرسي الأطفال أو الواي فاي قرارٌ تجاري لا يعرفه إلا
          أنت، وأي رقم نبذره سيصير سعراً حقيقياً أمام عميل. أضف أول خدمة من النموذج أدناه —
          وهذه أمثلة شائعة، ليست صفوفاً موجودة:
        </p>
      </div>

      <ul className="grid gap-2 sm:grid-cols-2">
        {EXAMPLE_SERVICES.map((example) => (
          <li
            key={example.slug}
            className="space-y-1 rounded-lg border border-dashed border-border p-3"
          >
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-sm font-medium">{example.title}</span>
              <code dir="ltr" className="text-xs text-muted-foreground">
                {example.slug}
              </code>
              {!example.ours && (
                <Badge variant="outline" className="text-muted-foreground">
                  ينفّذها متعهد؟
                </Badge>
              )}
            </div>
            <p className="text-xs leading-relaxed text-muted-foreground">{example.note}</p>
          </li>
        ))}
      </ul>

      <p className="text-xs leading-relaxed text-muted-foreground">
        وسعر <span dir="ltr">{formatMoney(0, currency)}</span> صالح أيضاً: خدمة تُعلَن ولا
        تُحاسَب (واي فاي مجاني مثلاً) — تظهر للعميل كخيار ولا تزيد إجماله.
      </p>

      <p className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm leading-relaxed text-amber-900 dark:border-amber-700 dark:bg-amber-950 dark:text-amber-100">
        <span className="font-semibold">قبل أن تضيف مرشداً سياحياً أو استقبال مطار:</span> هذا
        الكتالوج مبنيٌّ لخدمات <span className="font-semibold">تنفّذها أنت</span>. ما ينفّذه
        المتعهد لا يوجد اليوم مسار يدفع له مقابله: قوائم أسعاره لا تحمل إلا سعر الرحلة، وسقف
        موجة البث لا يتسع بقيمة الخدمة. فثمن الخدمة سيصل خزينتك كاملاً، وتسويته مع من نفّذها
        تبقى خارج النظام حتى تُبنى — <span className="font-semibold">بند مؤجَّل بقرار مكتوب</span>{" "}
        لا منسيّ.
      </p>
    </Card>
  );
}

export default async function ExtrasPage({ searchParams }: PageProps<"/admin/extras">) {
  const [params, { extras, currency, ready }] = await Promise.all([searchParams, loadExtras()]);

  const wired = hasSupabaseEnv();
  const savedCode = typeof params.saved === "string" ? params.saved : null;
  const error = typeof params.error === "string" ? params.error : null;
  const removing = typeof params.remove === "string" ? params.remove : null;
  const readOnly = !ready;

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="font-heading text-lg font-bold">الخدمات الإضافية</h2>
        <HelpTip>
          كل صف هنا خيار يشتريه العميل <span className="font-semibold">فوق سعر الرحلة</span>{" "}
          بكمية يختارها. موضعه في المعادلة آخرها:{" "}
          <span className="font-semibold">
            سعر الرحلة يُبنى ويُخصم منه الكوبون، ثم تُضاف الخدمات
          </span>{" "}
          — فلا الذروة تزيدها ولا الكوبون ينقصها. وسعرها لا يدخل حساب الهامش ولا سقف موجة
          البث، لأنها ثمن شيء تشتريه أنت لا ربحٌ على رحلة.
        </HelpTip>
        <Link
          href="/admin/pricing"
          className="ms-auto text-sm text-primary transition-colors hover:underline"
        >
          إعدادات التسعير والذروة
        </Link>
      </div>

      <Banners
        wired={wired}
        readOnly={readOnly}
        saved={savedCode !== null}
        error={error}
        errorMessages={ERROR_MESSAGES}
        savedMessage={
          savedCode === "deleted"
            ? "حُذفت الخدمة من الكتالوج — لم تكن داخل أي حجز، وإلا لرفضت قاعدة البيانات حذفها."
            : "حُفظت الخدمة وانعكست على نموذج الحجز فوراً."
        }
        readOnlyTitle="كتالوج الخدمات غير جاهز بعد"
        readOnlyBody={
          <p>
            قاعدة البيانات مربوطة لكن جدول <code dir="ltr">extra_services</code> غير موجود —
            نفِّذ هجرة <code dir="ltr">0031</code> من{" "}
            <code dir="ltr">supabase/migrations</code> ثم أعد تحميل الصفحة. المعروض الآن هيكل
            الشاشة معطَّلاً بالكامل.
          </p>
        }
      />

      {ready && extras.length === 0 && <EmptyState currency={currency} />}

      {extras.map((extra) => (
        <ExtraCard
          key={extra.id}
          extra={extra}
          currency={currency}
          readOnly={readOnly}
          confirmingDelete={removing === extra.id}
        />
      ))}

      {ready && extras.length > 0 && (
        <p className="text-xs text-muted-foreground">
          عدد الخدمات: {toArabicDigits(extras.length)} · المعروضة على العملاء:{" "}
          {toArabicDigits(extras.filter((extra) => extra.active).length)}
        </p>
      )}

      <form action={readOnly ? undefined : createExtra}>
        <Card className="space-y-4 p-5">
          <div>
            <h3 className="flex items-center gap-1.5 font-heading text-base font-bold">
              <Plus className="size-4 text-primary" />
              إضافة خدمة
              <HelpTip>
                تُضاف الخدمة معروضةً على العملاء مباشرةً لأن سعرها وكميتها القصوى إلزاميان في
                هذا النموذج — فلا شيء ناقص بعد الحفظ. وإن أردت تجهيزها قبل عرضها فألغِ مفتاح
                «معروضة على العملاء» أدناه ثم فعّلها من بطاقتها حين تجهز.
              </HelpTip>
            </h3>
            <p className="text-sm text-muted-foreground">
              اسم يقرؤه العميل، ومعرّف ثابت لا يتغير، وسعر وحدة، وأقصى كمية.
            </p>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <TextField
              id="new-title"
              label="اسم الخدمة"
              name="new.title"
              placeholder="كرسي أطفال"
              disabled={readOnly}
              required
            />
            <TextField
              id="new-slug"
              label="المعرّف (Slug)"
              name="new.slug"
              dir="ltr"
              placeholder="child-seat"
              pattern="[a-z0-9]+(-[a-z0-9]+)*"
              maxLength={40}
              disabled={readOnly}
              required
              help={SLUG_HELP}
            />
          </div>

          <TextField
            id="new-description"
            label="الوصف المختصر"
            name="new.description"
            placeholder="كرسي مثبَّت للأطفال حتى ٤ سنوات"
            maxLength={300}
            disabled={readOnly}
            help="اختياري — سطر يظهر تحت اسم الخدمة في نموذج الحجز."
          />

          <div className="grid gap-4 sm:grid-cols-2">
            <NumberField
              id="new-price"
              label={`سعر الوحدة (${currency})`}
              name="new.price"
              disabled={readOnly}
              required
              help="سعر الوحدة الواحدة. لا تمسّه الذروة ولا يخصمه كوبون — يُضاف كما هو إلى إجمالي الحجز."
            />
            <NumberField
              id="new-max-qty"
              label="أقصى كمية"
              name="new.max_qty"
              defaultValue={1}
              disabled={readOnly}
              required
              step="1"
              min={1}
              max={20}
              help={MAX_QTY_HELP}
            />
          </div>

          <Label className="flex w-fit cursor-pointer items-center gap-2 text-sm font-normal">
            <input
              type="checkbox"
              name="new.active"
              defaultChecked
              disabled={readOnly}
              className="size-4 accent-primary"
            />
            معروضة على العملاء فور الإضافة
          </Label>

          <div className="flex justify-end">
            <Button type="submit" disabled={readOnly}>
              <Plus />
              إضافة الخدمة
            </Button>
          </div>
        </Card>
      </form>
    </div>
  );
}
