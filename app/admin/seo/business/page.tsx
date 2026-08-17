import { Info, MapPin, Save, ShieldAlert } from "lucide-react";

import { SaveButton } from "@/components/admin/save-feedback";
import { HelpTip } from "@/components/shared/HelpTip";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { getSettings } from "@/lib/settings";

import { COMMON_ERROR_MESSAGES, StatusBanners, fieldControlClass } from "../../content/_components/fields";
import { SeoTabs } from "../_components/seo-ui";
import { saveBusinessInfo } from "./actions";

export const metadata = { title: "بطاقة النشاط" };

const hasSupabaseEnv = () =>
  Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);

/**
 * بطاقة النشاط (LocalBusiness) — **أعلى عائد سيو في هذا المنتج تحديداً**.
 *
 * ولماذا هنا بالذات؟ لأن هذا نشاط نقل **محلي**: من يبحث عن «ليموزين مطار
 * القاهرة» يبحث بنيّة محلية، وجوجل يرتّب النتائج المحلية بإشارات لا تخرج إلا من
 * بطاقة نشاط مكتملة — العنوان والإحداثيات وساعات العمل ونطاق السعر. والبطاقة
 * التي كانت تُصدَّر تحمل ستة حقول ولا شيء من هذه.
 *
 * وكل حقل اختياري بقرار العقد: بطاقة تعلن عنواناً غير صحيح أسوأ من بطاقة بلا
 * عنوان — الأولى تُفقد الثقة عند أول زائر يصل إلى مكان لا وجود له.
 */

const ERROR_MESSAGES: Record<string, string> = {
  ...COMMON_ERROR_MESSAGES,
  long: "أحد الحقول أطول مما يقبله — راجع العنوان والمناطق المخدومة.",
  country: "رمز الدولة حرفان لاتينيان فقط — EG لمصر، SA للسعودية، AE للإمارات.",
  latitude: "خط العرض يجب أن يكون رقماً بين ٩٠- و٩٠ — انسخه من خرائط جوجل كما هو.",
  longitude: "خط الطول يجب أن يكون رقماً بين ١٨٠- و١٨٠ — انسخه من خرائط جوجل كما هو.",
  geopair:
    "الإحداثيتان معاً أو لا شيء — نقطة على الخريطة بخط عرض بلا خط طول ليست نقطة، ولن تُعلَن لمحركات البحث.",
  "areas-many": "المناطق المخدومة أكثر مما تحتاجه أي حالة حقيقية — اذكر المحافظات لا الأحياء.",
};

export default async function SeoBusinessPage({
  searchParams,
}: PageProps<"/admin/seo/business">) {
  const [settings, params] = await Promise.all([getSettings(), searchParams]);

  const wired = hasSupabaseEnv();
  const saved = params.saved === "1";
  const error = typeof params.error === "string" ? params.error : null;
  const business = settings.business;

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="font-heading text-lg font-bold">بطاقة النشاط</h2>
        <HelpTip>
          بيانات نشاطك كما تُعلَن لمحركات البحث في البيانات المهيكلة: أين أنت، ومتى تعمل،
          وما نطاق أسعارك، وأي المناطق تخدم. لا تظهر هذه الحقول للزائر على الصفحة — يقرؤها
          محرك البحث وحده.
        </HelpTip>
      </div>

      <SeoTabs active="/admin/seo/business" />

      {!wired && (
        <Card className="flex flex-row items-start gap-3 border-amber-300 bg-amber-50 p-4 text-amber-900 dark:border-amber-700 dark:bg-amber-950 dark:text-amber-100">
          <ShieldAlert className="mt-0.5 size-5 shrink-0" aria-hidden="true" />
          <p className="text-sm leading-relaxed">
            قاعدة البيانات غير مربوطة — الحقول ظاهرة للاطلاع والحفظ معطّل حتى تُنفَّذ خطوات{" "}
            <code dir="ltr">supabase/README.md</code> ويُعاد تشغيل الخادم.
          </p>
        </Card>
      )}

      <StatusBanners
        wired={wired}
        readOnly={false}
        saved={saved}
        error={error}
        errorMessages={ERROR_MESSAGES}
        savedMessage="حُفظت بطاقة النشاط — تُعلَن في البيانات المهيكلة من الآن."
      />

      {/* لماذا تستحق هذه الشاشة وقت المالك — بالسبب لا بالوعد */}
      <Card className="flex flex-row items-start gap-3 border-sky-300 bg-sky-50 p-4 text-sky-900 dark:border-sky-700 dark:bg-sky-950 dark:text-sky-100">
        <Info className="mt-0.5 size-5 shrink-0" aria-hidden="true" />
        <div className="space-y-1 text-sm leading-relaxed">
          <p className="font-semibold">لماذا هذه الشاشة تحديداً هي الأعلى عائداً</p>
          <p>
            نشاطك نقل <strong>محلي</strong>، ومن يبحث عن «سيارة من مطار القاهرة» يبحث بنيّة
            محلية. وجوجل يرتّب النتائج المحلية بإشارات لا تصله إلا من بطاقة نشاط مكتملة:
            العنوان والإحداثيات وساعات العمل ونطاق السعر والمناطق المخدومة. صفحتان
            متساويتان في المحتوى تفترقان في الترتيب حين تكمل إحداهما هذه البطاقة.
          </p>
          <p>
            وكل حقل هنا اختياري بقصد:{" "}
            <strong>بطاقة تعلن عنواناً غير صحيح أسوأ من بطاقة بلا عنوان</strong> — اترك ما
            لا تتيقّن منه فارغاً، فالحقل الفارغ لا يُعلَن أصلاً.
          </p>
        </div>
      </Card>

      <form action={saveBusinessInfo} className="space-y-6">
        <Card className="space-y-4 p-5">
          <div>
            <h3 className="font-heading text-base font-bold">العنوان</h3>
            <p className="text-sm text-muted-foreground">
              عنوان المقر كما يُكتب في المراسلات — اتركه كله فارغاً إن كنت تعمل بلا مقر
              يستقبل عملاء.
            </p>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="streetAddress">الشارع ورقم المبنى</Label>
            <Input
              id="streetAddress"
              name="streetAddress"
              defaultValue={business.streetAddress ?? ""}
              placeholder="١٢ شارع الثورة"
              disabled={!wired}
            />
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="addressLocality">المدينة</Label>
              <Input
                id="addressLocality"
                name="addressLocality"
                defaultValue={business.addressLocality ?? ""}
                placeholder="القاهرة"
                disabled={!wired}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="addressRegion">المحافظة</Label>
              <Input
                id="addressRegion"
                name="addressRegion"
                defaultValue={business.addressRegion ?? ""}
                placeholder="محافظة القاهرة"
                disabled={!wired}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="postalCode">الرمز البريدي</Label>
              <Input
                id="postalCode"
                name="postalCode"
                dir="ltr"
                defaultValue={business.postalCode ?? ""}
                placeholder="11511"
                disabled={!wired}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="addressCountry" className="flex items-center gap-1.5">
                رمز الدولة
                <HelpTip>
                  حرفان لاتينيان بمعيار ISO: EG لمصر، SA للسعودية، AE للإمارات. هذه صيغة
                  تقرؤها محركات البحث، لا اسم الدولة كما يُكتب للزائر.
                </HelpTip>
              </Label>
              <Input
                id="addressCountry"
                name="addressCountry"
                dir="ltr"
                defaultValue={business.addressCountry ?? ""}
                placeholder="EG"
                maxLength={2}
                disabled={!wired}
              />
            </div>
          </div>
        </Card>

        <Card className="space-y-4 p-5">
          <div>
            <h3 className="flex items-center gap-1.5 font-heading text-base font-bold">
              <MapPin className="size-4" aria-hidden="true" />
              الإحداثيات
              <HelpTip>
                افتح خرائط جوجل، اضغط مطوّلاً على موقع مقرك، وستظهر أعلى الشاشة نقطة بصيغة
                ‏30.0444, 31.2357 — الأول خط العرض والثاني خط الطول. انسخهما كما هما.
              </HelpTip>
            </h3>
            <p className="text-sm text-muted-foreground">
              الإحداثيتان معاً أو لا شيء — ونقطة خاطئة أسوأ من لا نقطة.
            </p>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="latitude">خط العرض (latitude)</Label>
              <Input
                id="latitude"
                name="latitude"
                dir="ltr"
                inputMode="decimal"
                defaultValue={business.latitude === null ? "" : String(business.latitude)}
                placeholder="30.0444"
                disabled={!wired}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="longitude">خط الطول (longitude)</Label>
              <Input
                id="longitude"
                name="longitude"
                dir="ltr"
                inputMode="decimal"
                defaultValue={business.longitude === null ? "" : String(business.longitude)}
                placeholder="31.2357"
                disabled={!wired}
              />
            </div>
          </div>
        </Card>

        <Card className="space-y-4 p-5">
          <div>
            <h3 className="font-heading text-base font-bold">التشغيل والأسعار</h3>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="openingHours" className="flex items-center gap-1.5">
              ساعات العمل
              <HelpTip>
                صيغة معيارية تقرؤها محركات البحث بأيام لاتينية مختصرة:
                ‏Mo Tu We Th Fr Sa Su. مثال خدمة على مدار الساعة: Mo-Su 00:00-23:59. ومثال
                دوام نهاري بإجازة الجمعة: Sa-Th 09:00-18:00.
              </HelpTip>
            </Label>
            <Input
              id="openingHours"
              name="openingHours"
              dir="ltr"
              defaultValue={business.openingHours ?? ""}
              placeholder="Mo-Su 00:00-23:59"
              disabled={!wired}
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="priceRange" className="flex items-center gap-1.5">
              نطاق السعر
              <HelpTip>
                إشارة تقريبية لمستوى السعر تظهر في بعض نتائج البحث المحلية. تُقبل الرموز
                العالمية (‏$$‎) أو مدى صريح بعملتك (‏٥٠٠–٣٠٠٠ ج.م). ليست سعراً ملزماً ولا
                تدخل في حساب أي حجز.
              </HelpTip>
            </Label>
            <Input
              id="priceRange"
              name="priceRange"
              defaultValue={business.priceRange ?? ""}
              placeholder="٥٠٠–٣٠٠٠ ج.م"
              disabled={!wired}
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="areaServed" className="flex items-center gap-1.5">
              المناطق المخدومة
              <HelpTip>
                منطقة في كل سطر — اذكر المحافظات والمدن التي تصل إليها فعلاً لا الأحياء.
                اتركها فارغة ليبقى الإعلان على مستوى الدولة كما هو اليوم.
              </HelpTip>
            </Label>
            <textarea
              id="areaServed"
              name="areaServed"
              rows={4}
              defaultValue={business.areaServed.join("\n")}
              placeholder={"القاهرة\nالجيزة\nالإسكندرية"}
              disabled={!wired}
              className={cn(fieldControlClass, "min-h-20 leading-relaxed")}
            />
          </div>
        </Card>

        <div className="sticky bottom-0 flex items-center justify-end gap-3 border-t border-border bg-background/95 py-3 backdrop-blur">
          <p className="me-auto text-xs text-muted-foreground">
            الحقل الفارغ لا يُعلَن — لا يُرسَل فارغاً.
          </p>
          <SaveButton
            label="حفظ بطاقة النشاط"
            icon={<Save />}
            disabled={!wired}
            errorMessages={ERROR_MESSAGES}
            savedMessages={{
              "1": "حُفظت بطاقة النشاط وانعكست على البيانات المنظَّمة في كل صفحة.",
            }}
          />
        </div>
      </form>

      <p className="pb-8 text-xs leading-relaxed text-muted-foreground">
        لمراجعة ما يُصدَّر فعلاً من هذه البطاقة ومن صفحات الموقع، افتح تبويب «البيانات
        المهيكلة».
      </p>
    </div>
  );
}
