import { AlertTriangle, CheckCircle2, KeyRound, MapPin, XCircle } from "lucide-react";

import { fieldControlClass } from "@/app/admin/content/_components/fields";
import { HelpTip } from "@/components/shared/HelpTip";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import {
  PLACE_SEARCH_BOUNDS,
  PLACE_SEARCH_DEFAULTS,
  SERVICE_BOUNDS,
  isWithinServiceArea,
  type PlaceSearchSettings,
} from "@/lib/place-search-types";
import { createServerSupabase } from "@/lib/supabase/server";
import { cn } from "@/lib/utils";
import { savePlaceSearchSettings } from "./actions";

/**
 * شاشة «بحث الأماكن» — الصفّ الوحيد في `place_search_settings` (هجرة 0076).
 *
 * ما تحكمه هذه الشاشة أربع طبقات — **والانتقال بينها ليس واحداً**: بين
 * المزوّدَين يقع عند **تعذُّر** الأول لا عند عجزه عن الإيجاد؛ أما صفر نتيجة
 * فيقفز بالزائر مباشرةً إلى المخرجين. والترتيب:
 *
 *     Google Places  →  Nominatim  →  «حدّد على الخريطة»  →  «اطلب عرض سعر»
 *
 * وهي **لا تبني البحث** — تملك مفاتيحه: إطفاء المزوّد المدفوع حين تقفز الفوترة
 * بلا نشر، وترتيب المزوّدَين، وضابطَي التكلفة (أقل عدد حروف · تأجيل النداء).
 *
 * 🔴 **ولا حقل مفتاح هنا ولا في القاعدة.** `GOOGLE_MAPS_API_KEY` في البيئة
 * وحدها (اتفاقية §٣ · D-30)، وما تعرضه الشاشة عنه **حضورٌ أو غياب** لا قيمة ولا
 * جزء قيمة — ولو عُرض أوّل حرفين منه لصار سطراً يُصوَّر ويُشارَك.
 *
 * والقراءة بعميل جلسة المستخدم لا بمفتاح الخدمة: الجدول محروسٌ بـ`is_admin()`
 * في مساراته الأربعة، ومفتاحُ الخدمة يتخطّى RLS فيُري غيرَ المشرف ما لا يملكه.
 */

export const metadata = { title: "بحث الأماكن" };

const hasSupabaseEnv = () =>
  Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);

/** أرقام عربية هندية بلا فاصل آلاف — «٢٠٠٠» لا «٢٬٠٠٠» في نصٍّ عن مللي ثانية */
const arNum = new Intl.NumberFormat("ar-EG", { useGrouping: false });

const CHARS = PLACE_SEARCH_BOUNDS.minQueryChars;
const DEBOUNCE = PLACE_SEARCH_BOUNDS.debounceMs;

const ERROR_MESSAGES: Record<string, string> = {
  env: "قاعدة البيانات غير مربوطة — لا يمكن الحفظ بعد.",
  provider: "المزوّد الأساسي يجب أن يكون «جوجل» أو «Nominatim» — أعد الاختيار من القائمة.",
  chars: `أقل عدد حروف يجب أن يكون رقماً صحيحاً بين ${arNum.format(CHARS.min)} و${arNum.format(CHARS.max)}.`,
  debounce: `تأجيل البحث يجب أن يكون رقماً صحيحاً بين ${arNum.format(DEBOUNCE.min)} و${arNum.format(DEBOUNCE.max)} مللي ثانية.`,
  center: `مرساة الخريطة يجب أن تقع داخل نطاق التشغيل (خط عرض بين ${arNum.format(SERVICE_BOUNDS.minLat)} و${arNum.format(SERVICE_BOUNDS.maxLat)}، وخط طول بين ${arNum.format(SERVICE_BOUNDS.minLng)} و${arNum.format(SERVICE_BOUNDS.maxLng)}) — والتشغيل داخل مصر فقط.`,
  save: "فشل الحفظ — تأكد أنك مسجّل الدخول بحساب دوره admin، وأن هجرة 0076 مطبَّقة على القاعدة (راجع supabase/README.md، فخ الصفوف الصفرية).",
};

/**
 * قراءة صفّ الإعدادات.
 *
 * `ready` = الجدول موجودٌ وهذه الجلسة تملك قراءته. والتدهور الرشيق مقصود:
 * قاعدةٌ لم تُهاجَر بعد تعرض الشاشة بقيم العقد (`PLACE_SEARCH_DEFAULTS`) معطّلةً
 * برسالتها، لا صفحةَ خطأ.
 *
 * ⚠ وأعمدة مسمّاة لا `select("*")`: منحُ عمودٍ واحدٍ ينقص يجعل Postgres يرفض
 * **الجملة كلها**، فتسقط الشاشة إلى «لم تُهاجَر» وهي مهاجَرة — وهو العطل الذي
 * كلّف شاشة التسعير موتاً كاملاً.
 */
async function loadPlaceSearchSettings(): Promise<{
  settings: PlaceSearchSettings;
  ready: boolean;
  seeded: boolean;
}> {
  const supabase = await createServerSupabase();
  if (!supabase) return { settings: PLACE_SEARCH_DEFAULTS, ready: false, seeded: false };

  const res = await supabase
    .from("place_search_settings")
    .select(
      "google_enabled, primary_provider, map_picker_enabled, quote_fallback_enabled, min_query_chars, debounce_ms, default_center_lat, default_center_lng"
    )
    .limit(1);
  if (res.error) return { settings: PLACE_SEARCH_DEFAULTS, ready: false, seeded: false };

  const row = (res.data?.[0] ?? null) as Record<string, unknown> | null;
  // الجدول يُقرأ لكنه فارغ: الحفظ يُدرج الصفّ (انظر الإجراء)، فالشاشة تبقى فعّالة
  if (!row) return { settings: PLACE_SEARCH_DEFAULTS, ready: true, seeded: false };

  const int = (v: unknown, fallback: number) =>
    Number.isFinite(Number(v)) ? Number(v) : fallback;

  return {
    settings: {
      googleEnabled: row.google_enabled === true,
      primaryProvider: row.primary_provider === "google" ? "google" : "nominatim",
      mapPickerEnabled: row.map_picker_enabled === true,
      quoteFallbackEnabled: row.quote_fallback_enabled === true,
      minQueryChars: int(row.min_query_chars, PLACE_SEARCH_DEFAULTS.minQueryChars),
      debounceMs: int(row.debounce_ms, PLACE_SEARCH_DEFAULTS.debounceMs),
      // 0080 — المرساة. والحكم `isWithinServiceArea` نفسها التي يرفض بها
      // `/api/geocode/reverse`: صفٌّ خارج مصر (تعديلٌ سبق قيد 0080) يعرض
      // الافتراضي بدل أن تفتح الشاشة على مركزٍ لا نخدمه.
      defaultCenter: (() => {
        const lat = Number(row.default_center_lat);
        const lng = Number(row.default_center_lng);
        return isWithinServiceArea(lat, lng)
          ? { lat, lng }
          : PLACE_SEARCH_DEFAULTS.defaultCenter;
      })(),
    },
    ready: true,
    seeded: true,
  };
}

/** صفّ مفتاح إطفاء — العنوان وشرحه على السطر، والمربّع في طرف السطر المنطقي */
function ToggleRow({
  name,
  title,
  description,
  help,
  checked,
  disabled,
}: {
  name: string;
  title: string;
  description: string;
  help: string;
  checked: boolean;
  disabled?: boolean;
}) {
  return (
    <Label className="flex cursor-pointer items-center justify-between gap-3 rounded-lg border border-input p-3 text-sm font-normal">
      <span className="leading-relaxed">
        <span className="flex items-center gap-1.5 font-medium">
          {title}
          <HelpTip>{help}</HelpTip>
        </span>
        <span className="block text-muted-foreground">{description}</span>
      </span>
      <input
        type="checkbox"
        name={name}
        defaultChecked={checked}
        disabled={disabled}
        className="size-5 shrink-0 accent-primary"
      />
    </Label>
  );
}

/** حقل رقمي بحدّيه من العقد — `min`/`max` تُقرأ من `PLACE_SEARCH_BOUNDS` لا تُكتب */
function NumberField({
  id,
  name,
  label,
  help,
  suffix,
  defaultValue,
  bounds,
  step,
  disabled,
}: {
  id: string;
  name: string;
  label: string;
  help: string;
  suffix: string;
  defaultValue: number;
  bounds: { min: number; max: number };
  step: number;
  disabled?: boolean;
}) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id} className="flex items-center gap-1.5">
        {label}
        <HelpTip>{help}</HelpTip>
      </Label>
      <Input
        id={id}
        name={name}
        type="number"
        inputMode="numeric"
        dir="ltr"
        step={step}
        min={bounds.min}
        max={bounds.max}
        defaultValue={defaultValue}
        disabled={disabled}
        required
      />
      <p className="text-xs text-muted-foreground">
        {suffix} — المسموح من {arNum.format(bounds.min)} إلى {arNum.format(bounds.max)}، والحدّ
        مفروض في قاعدة البيانات نفسها.
      </p>
    </div>
  );
}

export default async function PlaceSearchPage({
  searchParams,
}: PageProps<"/admin/place-search">) {
  const [params, { settings, ready, seeded }] = await Promise.all([
    searchParams,
    loadPlaceSearchSettings(),
  ]);

  const wired = hasSupabaseEnv();
  const saved = params.saved === "1";
  const error = typeof params.error === "string" ? params.error : null;
  const readOnly = !ready;

  /**
   * 🔴 حضور المفتاح لا قيمته. مكوّن خادمي، فالقيمة لا تغادر الخادم أصلاً — وهذا
   * السطر يحوّلها إلى **بت واحد** قبل أن تلمس أي JSX، فلا يبقى في الحمولة ما
   * يُسرَّب حتى لو غُيِّرت الواجهة غداً.
   */
  const googleKeyPresent = Boolean(process.env.GOOGLE_MAPS_API_KEY);
  // مفعَّلٌ بلا مفتاح: جوجل خارج الخدمة والبحث يعمل على Nominatim بلا أن يشتكي أحد
  const googleEnabledButKeyless = settings.googleEnabled && !googleKeyPresent;
  /**
   * 🔴 فخّ الترتيب: جوجل مفعَّل وهو **ثانٍ**. و`lib/geo/search.ts` يقطع الحلقة
   * بـ`break` عند صفر نتيجة (صفرٌ = جوابٌ نهائي لا فشل)، فلا يُسأل الثاني إلا
   * حين يتعذّر الأول. أي أن هذا الضبط يترك مزوّداً مفعَّلاً — ومُفوتراً حين
   * يُنادى — بلا نداءٍ عملياً، والمالك يحسبه عاملاً.
   */
  const googleEnabledButSecond = settings.googleEnabled && settings.primaryProvider === "nominatim";

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="flex items-center gap-1.5 font-heading text-lg font-bold">
          <MapPin className="size-5 text-primary" />
          بحث الأماكن
        </h2>
        <HelpTip>
          حقلا الانطلاق والوصول يقبلان ما يرجعه البحث وحده. وهذه الشاشة تحكم من يُسأل وبأي
          ترتيب وبأي تكلفة، ولا تُدخل مفتاحاً ولا تكتب اسم مكان.
        </HelpTip>
        <Badge variant="outline" className="ms-auto">
          طبقات البحث: ٤
        </Badge>
      </div>

      <p className="text-sm leading-relaxed text-muted-foreground">
        أربع طبقات: بحث جوجل ← بحث Nominatim (خرائط مفتوحة، مجاني) ← تحديد النقطة على الخريطة ←
        طلب عرض سعر. والطبقتان الأخيرتان مخرجان مجانيان لمن لم يجد مكانه — لا مزوّدان. ⚠
        والانتقال بين المزوّدَين يقع حين **يتعذّر** الأول (مفتاح أو حصّة أو شبكة) لا حين لا يجد:
        صفر نتيجة جوابٌ نهائي ينتقل بالزائر إلى الخريطة مباشرةً.
      </p>

      {readOnly && (
        <Card className="flex flex-row items-start gap-3 border-amber-300 bg-amber-50 p-4 text-amber-900 dark:border-amber-700 dark:bg-amber-950 dark:text-amber-100">
          <AlertTriangle className="mt-0.5 size-5 shrink-0" />
          <div className="text-sm leading-relaxed">
            <p className="font-semibold">الشاشة معروضة للمعاينة فقط حالياً</p>
            {wired ? (
              <p>
                قاعدة البيانات مربوطة لكن جدول <code dir="ltr">place_search_settings</code> غير
                مقروء — نفّذ هجرة <code dir="ltr">0076_place_search_settings.sql</code> من{" "}
                <code dir="ltr">supabase/migrations</code>، وتأكد أن حسابك دوره{" "}
                <code dir="ltr">admin</code>، ثم أعد تحميل الصفحة. القيم المعروضة أدناه هي
                افتراضيات العقد وهي نفسها سلوك الموقع الحالي.
              </p>
            ) : (
              <p>
                قاعدة البيانات غير مربوطة بعد — الحفظ يُفعَّل بعد تنفيذ خطوات{" "}
                <code dir="ltr">supabase/README.md</code> وإعادة تشغيل الخادم.
              </p>
            )}
          </div>
        </Card>
      )}

      {ready && !seeded && (
        <Card className="flex flex-row items-start gap-3 border-amber-300 bg-amber-50 p-4 text-amber-900 dark:border-amber-700 dark:bg-amber-950 dark:text-amber-100">
          <AlertTriangle className="mt-0.5 size-5 shrink-0" />
          <p className="text-sm leading-relaxed">
            الجدول موجود لكنه بلا صفّ — يعمل الموقع الآن بافتراضيات العقد المعروضة أدناه. أول
            حفظٍ من هذه الشاشة يُنشئ الصفّ.
          </p>
        </Card>
      )}

      {saved && (
        <Card className="flex flex-row items-center gap-3 border-emerald-300 bg-emerald-50 p-4 text-emerald-900 dark:border-emerald-700 dark:bg-emerald-950 dark:text-emerald-100">
          <CheckCircle2 className="size-5 shrink-0" />
          <p className="text-sm font-medium">
            حُفظت إعدادات بحث الأماكن — تسري على البحث التالي بلا إعادة نشر.
          </p>
        </Card>
      )}

      {error && (
        <Card className="flex flex-row items-center gap-3 border-red-300 bg-red-50 p-4 text-red-900 dark:border-red-700 dark:bg-red-950 dark:text-red-100">
          <XCircle className="size-5 shrink-0" />
          <p className="text-sm font-medium">{ERROR_MESSAGES[error] ?? "حدث خطأ غير متوقع."}</p>
        </Card>
      )}

      <form action={readOnly ? undefined : savePlaceSearchSettings} className="space-y-6">
        {/* ── المزوّدون ─────────────────────────────────────────────────── */}
        <Card className="space-y-4 p-5">
          <div>
            <h3 className="font-heading text-base font-bold">المزوّدون</h3>
            <p className="text-sm text-muted-foreground">
              من يُسأل عن أسماء الأماكن، وبأي ترتيب.
            </p>
          </div>

          <ToggleRow
            name="google_enabled"
            title="تفعيل بحث جوجل"
            description="مطفأً لا يُسأل جوجل عن أسماء الأماكن ويعمل Nominatim وحده — وهو سلوك الموقع اليوم."
            checked={settings.googleEnabled}
            disabled={readOnly}
            help="مفتاح قطع لبحث الأماكن وحده: إطفاؤه يمنع سؤال جوجل عن أسماء الأماكن فوراً بلا إعادة نشر — وهو ما يُستعمل حين تقفز فاتورة البحث. ⚠ ولا يوقف نداءات المسافات: حساب المسافة بين نقطتين مسارٌ مستقل يقرأ مفتاح البيئة بنفسه وينادي Google Routes على الحساب نفسه، ولا تحكمه هذه الشاشة. وتفعيله وحده لا يكفي: بلا مفتاح في البيئة يبقى جوجل خارج الخدمة."
          />

          {/* 🔴 المفتاح في البيئة — نصٌّ مرئي لا تلميح: من يبحث عن حقلٍ لا يجده
              يظن الشاشة ناقصة، ومن يجد حقلاً يكتب فيه سرّاً في قاعدة بيانات */}
          <Card className="gap-2 bg-muted/40 p-4 text-sm leading-relaxed ring-0">
            <p className="flex flex-wrap items-center gap-2 font-medium">
              <KeyRound className="size-4 shrink-0 text-primary" />
              مفتاح جوجل يعيش في البيئة — ولا يُدخَل في اللوحة أبداً
              <Badge
                variant="outline"
                className={cn(
                  "ms-auto",
                  googleKeyPresent
                    ? "border-emerald-300 bg-emerald-100 text-emerald-900 dark:border-emerald-700 dark:bg-emerald-950 dark:text-emerald-100"
                    : "border-amber-300 bg-amber-100 text-amber-900 dark:border-amber-700 dark:bg-amber-950 dark:text-amber-100"
                )}
              >
                {googleKeyPresent ? "مضبوط" : "غير مضبوط"}
              </Badge>
            </p>
            <p className="text-muted-foreground">
              اكتب المفتاح في متغيّر البيئة <code dir="ltr">GOOGLE_MAPS_API_KEY</code> على
              الخادم (‏<code dir="ltr">.env.local</code> محلياً، ومتغيّرات البيئة في
              الاستضافة)، ثم أعد تشغيل الخادم. لا يوجد حقل لكتابته في هذه الشاشة ولن يوجد: ما
              يُخزَّن في قاعدة البيانات يقع في نطاق أي ثغرة قراءة، ولوحة التحكم تملك{" "}
              <span className="font-medium">هل يُستعمل جوجل</span> لا{" "}
              <span className="font-medium">ما هو مفتاحه</span>.
            </p>
            <p className="text-muted-foreground">
              وهذا السطر يقرأ <span className="font-medium">حضور المتغيّر فقط</span> — لا تُعرض
              قيمته ولا أي جزء منها في أي مكان من اللوحة.
            </p>
          </Card>

          {googleEnabledButKeyless && (
            <Card className="flex flex-row items-start gap-3 border-amber-300 bg-amber-50 p-4 text-amber-900 ring-0 dark:border-amber-700 dark:bg-amber-950 dark:text-amber-100">
              <AlertTriangle className="mt-0.5 size-5 shrink-0" />
              <p className="text-sm leading-relaxed">
                بحث جوجل مفعَّل لكن <code dir="ltr">GOOGLE_MAPS_API_KEY</code> غير مضبوط في
                بيئة هذا الخادم — فلن يُسأل جوجل، ويعمل البحث على Nominatim وحده{" "}
                <span className="font-medium">بلا رسالة خطأ للزائر</span>. اضبط المتغيّر وأعد
                تشغيل الخادم، أو أطفئ المفتاح أعلاه حتى لا تظن الميزة عاملة وهي ليست كذلك.
              </p>
            </Card>
          )}

          <div className="space-y-1.5">
            <Label htmlFor="primary_provider" className="flex items-center gap-1.5">
              المزوّد الأساسي
              <HelpTip>
                من يُسأل أولاً. والثاني لا يُسأل إلا حين يتعذّر الأول — مفتاح مفقود أو حصّة
                منتهية أو خطأ شبكة أو ردٌّ فاسد. أما صفر نتيجة فجوابٌ نهائي: المزوّد أجاب «لا
                أعرف هذا المكان» فلا يُسأل الثاني بعده، ويُنقل الزائر مباشرةً إلى تحديد النقطة
                على الخريطة. واختيار «جوجل» هنا لا يفعّله: ما دام مفتاح التفعيل أعلاه مطفأً لا
                يُسأل جوجل مهما كانت قيمة هذا الحقل.
              </HelpTip>
            </Label>
            <select
              id="primary_provider"
              name="primary_provider"
              defaultValue={settings.primaryProvider}
              disabled={readOnly}
              className={cn(fieldControlClass, "h-9")}
            >
              <option value="nominatim">Nominatim — خرائط مفتوحة، مجاني</option>
              <option value="google">جوجل — أدقّ في مصر، ومدفوع</option>
            </select>
            <p className="text-xs text-muted-foreground">
              Nominatim مجاني بلا حدّ فوترة وتغطيته في مصر أرقّ (القرى والكمبوندات والفنادق).
              وجوجل أدقّ ويُفوتَر على حسابك في Google Cloud.
            </p>
          </div>

          {googleEnabledButSecond && (
            <Card className="flex flex-row items-start gap-3 border-amber-300 bg-amber-50 p-4 text-amber-900 ring-0 dark:border-amber-700 dark:bg-amber-950 dark:text-amber-100">
              <AlertTriangle className="mt-0.5 size-5 shrink-0" />
              <p className="text-sm leading-relaxed">
                بحث جوجل مفعَّل لكن المزوّد الأساسي Nominatim — وفي هذا الترتيب{" "}
                <span className="font-medium">لا يكاد يُسأل جوجل أبداً</span>: صفر نتيجة من
                الأساسي جوابٌ نهائي لا ارتداد بعده (يمضي الزائر إلى الخريطة)، فلا يُسأل جوجل
                إلا إذا تعذّر Nominatim نفسه — انقطاع شبكة أو ردٌّ فاسد. أي أن مزوّداً مفعَّلاً
                يبقى ميتاً عملياً ولا تصل تغطيته إلى الزائر. اجعل «جوجل» هو المزوّد الأساسي إن
                كنت تريد تغطيته فعلاً، وإلا فإطفاؤه أصدق من إبقائه مفعَّلاً بلا أثر.
              </p>
            </Card>
          )}
        </Card>

        {/* ── المخرجان ─────────────────────────────────────────────────── */}
        <Card className="space-y-4 p-5">
          <div>
            <h3 className="font-heading text-base font-bold">مخرجا من لم يجد مكانه</h3>
            <p className="text-sm text-muted-foreground">
              مجانيان كلاهما، ولا يستهلكان نداءً لدى جوجل. وإطفاؤهما يترك الزائر الذي لم يجد
              مكانه بلا بديل عن نتائج البحث.
            </p>
          </div>

          <ToggleRow
            name="map_picker_enabled"
            title="تفعيل التحديد على الخريطة"
            description="الطبقة الثالثة: يُسقط الزائر دبوساً على الخريطة بدل أن يكتب الاسم."
            checked={settings.mapPickerEnabled}
            disabled={readOnly}
            help="يُعرض للزائر خيار تحديد نقطة على الخريطة حين لا يجد مكانه في نتائج البحث. الإحداثيات هي ما يُسعَّر، فالدبوس أدقّ من أي اسم مكتوب. وإطفاؤه يخفي الخيار."
          />

          <ToggleRow
            name="quote_fallback_enabled"
            title="تفعيل مخرج طلب عرض السعر"
            description="الطبقة الرابعة: يغادر الزائر بطلبٍ لا يغادر الموقع."
            checked={settings.quoteFallbackEnabled}
            disabled={readOnly}
            help="من لم يجد مكانه ولم يستعمل الخريطة يُعرض له الانتقال إلى نموذج طلب عرض سعر، فيصلك طلبه يدوياً بدل أن يُغلق الصفحة. وإطفاؤه يخفي هذا الرابط."
          />
        </Card>

        {/* ── ضابطا التكلفة ────────────────────────────────────────────── */}
        <Card className="space-y-4 p-5">
          <div>
            <h3 className="font-heading text-base font-bold">ضابطا التكلفة</h3>
            <p className="text-sm text-muted-foreground">
              كلاهما يقلّل عدد النداءات المُرسَلة إلى المزوّد أثناء الكتابة.
            </p>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <NumberField
              id="min_query_chars"
              name="min_query_chars"
              label="أقل عدد حروف قبل البحث"
              suffix="حرف"
              step={1}
              bounds={CHARS}
              defaultValue={settings.minQueryChars}
              disabled={readOnly}
              help={`لا يُرسَل أي نداء قبل أن يكتب الزائر هذا العدد من الحروف. حرفٌ واحد يعني نداءً مع كل ضغطة مفتاح تقريباً. ورقمٌ كبير يمنع البحث عن الأسماء القصيرة مثل «مصر» و«الجيزة» فيبدو البحث معطّلاً — ولذلك السقف ${arNum.format(CHARS.max)}.`}
            />
            <NumberField
              id="debounce_ms"
              name="debounce_ms"
              label="تأجيل البحث بعد الكتابة (مللي ثانية)"
              suffix="مللي ثانية"
              step={10}
              bounds={DEBOUNCE}
              defaultValue={settings.debounceMs}
              disabled={readOnly}
              help={`كم ينتظر الحقل بعد آخر ضغطة مفتاح قبل أن يُرسل النداء. الأكبر يعني نداءات أقل وإحساساً أبطأ بالاستجابة. و${arNum.format(DEBOUNCE.max)} مللي ثانية هي ثانيتان بعد آخر حرف — حدُّ ما يحتمله الزائر.`}
            />
          </div>

          <Card className="gap-2 bg-muted/40 p-4 text-sm leading-relaxed ring-0">
            <p className="font-medium">ما تفعله هذه الأرقام بالفاتورة</p>
            <p className="text-muted-foreground">
              الرقمان يقلّلان <span className="font-medium">عدد النداءات</span> على المزوّد.
              ومع جوجل تحديداً تُحتسب الفوترة بالجلسة الواحدة الممتدة من أول حرف حتى اختيار
              المكان — فتقليل النداءات يخفّف الحمل ولا يغيّر عدد وحدات الفوترة بالضرورة. أما
              مع Nominatim فلا فوترة أصلاً، والرقمان يحفظان حدود الاستعمال المجاني.
            </p>
          </Card>

          <Separator />

          {/* ── مرساة الخريطة (هجرة 0080) ── */}
          <div className="space-y-1">
            <h3 className="font-heading text-base font-bold">مرساة الخريطة</h3>
            <p className="text-sm text-muted-foreground">
              أين تفتح نافذة «حدّد الموقع على الخريطة» حين لا يكون الزائر قد اختار مكاناً بعد.
            </p>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <NumberField
              id="default_center_lat"
              name="default_center_lat"
              label="خط العرض"
              suffix="°"
              step={0.000001}
              bounds={{ min: SERVICE_BOUNDS.minLat, max: SERVICE_BOUNDS.maxLat }}
              defaultValue={settings.defaultCenter.lat}
              disabled={readOnly}
              help="نقطة فتح الخريطة، لا قيمة الحقل. الزائر لا يحصل على مكانٍ حتى يضغط «تأكيد هذا الموقع» — فالمرساة تختصر عليه الطريق ولا تختار عنه. والمدى هو صندوق منطقة الخدمة نفسه المفروض في قاعدة البيانات: نقطة خارج مصر تُرفض عند الحفظ."
            />
            <NumberField
              id="default_center_lng"
              name="default_center_lng"
              label="خط الطول"
              suffix="°"
              step={0.000001}
              bounds={{ min: SERVICE_BOUNDS.minLng, max: SERVICE_BOUNDS.maxLng }}
              defaultValue={settings.defaultCenter.lng}
              disabled={readOnly}
              help="انظر شرح خط العرض. والقيمتان تُحفظان معاً — نصفُ إحداثيّ لا معنى له."
            />
          </div>

          <Card className="gap-2 bg-muted/40 p-4 text-sm leading-relaxed ring-0">
            <p className="font-medium">لماذا هنا لا في الكود</p>
            <p className="text-muted-foreground">
              كانت النقطة مكتوبة داخل مكوّن الخريطة (وسط القاهرة)، فلا تتغيّر إلا بنشر جديد.
              والافتراضي الآن <span className="font-medium">مطار القاهرة</span> — حيث يبدأ أكثر
              العمل. ونسخة بعلامة أخرى في مدينة أخرى تغيّرها من هنا بلا مبرمج.
            </p>
          </Card>

          <Separator />
          <div className="flex justify-end">
            <Button type="submit" disabled={readOnly}>
              حفظ إعدادات بحث الأماكن
            </Button>
          </div>
        </Card>
      </form>
    </div>
  );
}
