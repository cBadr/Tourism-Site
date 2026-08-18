import { ImageUp, LayoutGrid, Trash2 } from "lucide-react";

import { HelpTip } from "@/components/shared/HelpTip";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { createServerSupabase } from "@/lib/supabase/server";
import { FleetClassGrid } from "@/lib/vehicles/fleet-grid";
import { loadFleetBreakdown, loadFleetPhotos } from "@/lib/vehicles/photos";
import { adminRemoveVehiclePhoto, adminUploadVehiclePhoto } from "./fleet-photo-actions";

/**
 * الأسطولُ مفصَّلاً لكل فئة، بصور المركبات — وهذه هي ملاحظة المالك بنصّها:
 *
 *   «في الجزء الخاص بالأسطول: لا تظهر عدد السيارات المتاحة لدى المتعهد ولا
 *    أنواعها ولا صورها في كل فئة.»
 *
 * ── ما كان قائماً وما نقص — مقيسٌ لا مظنون (2026-08-18) ──────────────────
 *
 * | البند | قبل | بعد |
 * |---|---|---|
 * | العدد | إجماليٌّ وحده: «الأسطول ٢ نشطة» | **لكل فئة**: العدد والنشط منها |
 * | الأنواع | جدولٌ بسطرٍ لكل مركبة | مجموعةٌ لكل فئة، **والفئة الفارغة تُقال** |
 * | الصور | 🔴 `photo_path` عمودٌ قائمٌ منذ 0040 **بلا رافعٍ واحد** ⇒ لا صورة توجد أصلاً | رفعٌ من اللوحة ومن البوابة، وعرضٌ برابطٍ موقَّع |
 *
 * فالنقصُ الثالث لم يكن عيبَ عرض بل **غيابَ ما يُعرض** (القاعدة الذهبية ١٧:
 * عمودٌ بلا رافع ليس مبنيّاً). ولذلك بدأت الهجرة 0136 من الرفع لا من العرض.
 *
 * ── 🔒 والقراءة بجلسة المشرف لا بمفتاح الخدمة ────────────────────────────
 *
 * الرابط الموقَّع يُولَّد بـ`createServerSupabase()` — أي بجلسة من يفتح الشاشة.
 * فالسياسة `vehicle_photos_select_own_or_admin` هي التي تسمح، عبر `is_admin()`.
 * ولو وُقِّع بمفتاح الخدمة لَعملت الصفحة **حتى لو انهارت السياسة**، ولَما شهد
 * اختبارٌ على شيء. وثمنُ هذا الاختيار مذكور: مشرفٌ بلا دور `admin` في
 * `profiles` لا يرى الصور — وهو المطلوب.
 *
 * ── ولا تكرارَ للجدول القائم ────────────────────────────────────────────
 *
 * بطاقةُ «الأسطول» فوق هذه تبقى كما هي: جدولٌ مسطَّح بسطرٍ لكل مركبة، وهو أنفعُ
 * للبحث عن لوحةٍ بعينها. وهذه تُجيب سؤالاً آخر: **ماذا يملك الشريك في كل فئة،
 * وماذا لا يملك.** ولا يُقرأ أحدهما بديلاً عن الآخر.
 */
/**
 * حصيلةُ آخر عملية صورة — بمفتاحٍ مستقل `fleetphoto=` لا `error=`.
 *
 * والسببُ مكتوبٌ كاملاً في `fleet-photo-actions.ts`: خريطةُ رسائل الشريط
 * العلويّ في ملفٍّ مشترك خارج هذه الجبهة، فرمزٌ لا تعرفه يُطبع «حدث خطأ غير
 * متوقع» — ويُخفي أن الملف كان كبيراً أو صيغته مرفوضة. **ولكل سببٍ هنا جملتُه،
 * وكلُّها تقول ماذا يفعل المشرف الآن** (اتفاقية §١ و§٤).
 */
const PHOTO_FEEDBACK: Record<string, { tone: "ok" | "bad"; text: string }> = {
  saved: { tone: "ok", text: "حُفظت صورة المركبة." },
  doc_empty: { tone: "bad", text: "لم تختر ملفاً — اختر صورة ثم اضغط الرفع." },
  doc_type: {
    tone: "bad",
    text: "صيغة الصورة غير مقبولة — استعمل JPG أو PNG أو WEBP (ولا يُقبل PDF لصورة مركبة).",
  },
  doc_size: {
    tone: "bad",
    text: "حجم الصورة أكبر من الحد المسموح (٥ ميجابايت) — اضغطها أو اختر أخرى.",
  },
  upload: {
    tone: "bad",
    text: "رفض التخزينُ الملف — تأكد أنك مسجَّل الدخول بحساب دوره admin، ثم أعد المحاولة.",
  },
  save: {
    tone: "bad",
    text: "رُفعت الصورة ولم يُقبل حفظ مسارها في سجل المركبة، فحُذفت فوراً. تأكد أن دورك admin ثم أعد المحاولة.",
  },
  notfound: { tone: "bad", text: "لم تعد هذه المركبة في سجل الشريك — أعد تحميل الصفحة." },
  env: { tone: "bad", text: "قاعدة البيانات غير مربوطة على هذا الخادم." },
};

function PhotoFeedback({ code }: { code: string | null }) {
  const entry = code ? PHOTO_FEEDBACK[code] : undefined;
  if (!entry) return null;
  return (
    <p
      className={
        entry.tone === "ok"
          ? "rounded-lg border border-emerald-500/40 bg-emerald-500/10 p-3 text-sm font-medium"
          : "rounded-lg border border-destructive/40 bg-destructive/10 p-3 text-sm font-medium"
      }
    >
      {entry.text}
    </p>
  );
}

export async function FleetBreakdownCard({
  subcontractorId,
  feedback = null,
}: {
  subcontractorId: string;
  /** قيمة `?fleetphoto=` كما وردت — تُترجَم هنا إلى جملةٍ عربية واحدة */
  feedback?: string | null;
}) {
  const supabase = await createServerSupabase();
  if (!supabase) return null;

  const [breakdown, photos] = await Promise.all([
    loadFleetBreakdown(supabase, subcontractorId),
    loadFleetPhotos(supabase, subcontractorId),
  ]);

  // 0136 غير مطبَّقة أو الجدول محجوب ⇒ لا بطاقة، ولا رسالة خطأ تُقلق بلا داعٍ
  if (!breakdown.ready || !photos.ready) return null;

  return (
    <Card className="p-5" id="fleet-detail">
      <FleetClassGrid
        rows={breakdown.rows}
        vehicles={photos.vehicles}
        truncated={photos.truncated}
        intro={
          <div>
            <h3 className="flex items-center gap-1.5 font-heading text-base font-bold">
              <LayoutGrid className="size-4 text-primary" />
              الأسطول مفصَّلاً لكل فئة
              <HelpTip>
                كل فئة على المنصة لها كتلة هنا، حتى التي لا مركبة فيها — لأن معرفة ما لا
                يملكه الشريك قرارُ إسناد كما معرفة ما يملك. والصورة يرفعها الشريك من بوابته
                أو ترفعها أنت من هنا، ولا تصل العميل ولا متعهداً آخر. وبيانات المركبة نفسها
                (الاسم واللوحة والفئة) يملكها الشريك ولا تُعدَّل من هذه الشاشة.
              </HelpTip>
            </h3>
            <p className="text-sm text-muted-foreground">
              الأعداد محسوبة في قاعدة البيانات لا في هذه الصفحة، ورابط عرض الصورة يُولَّد
              بجلستك أنت ويموت بعد دقيقة.
            </p>
            <div className="mt-3">
              <PhotoFeedback code={feedback} />
            </div>
          </div>
        }
        photoForm={(vehicle) => (
          <div className="space-y-2 rounded-lg bg-muted/30 p-2">
            <form
              action={adminUploadVehiclePhoto.bind(null, subcontractorId, vehicle.id)}
              className="space-y-1.5"
            >
              <Label
                htmlFor={`admin-${vehicle.id}-photo`}
                className="text-[11px] text-muted-foreground"
              >
                رفع صورة نيابةً عن الشريك (JPG أو PNG أو WEBP، حتى ٥ ميجابايت)
              </Label>
              <Input
                id={`admin-${vehicle.id}-photo`}
                name="file"
                type="file"
                accept="image/jpeg,image/png,image/webp"
                required
                className="h-auto py-1.5 text-xs file:me-2 file:rounded-md file:border-0 file:bg-muted file:px-2 file:py-1 file:text-xs"
              />
              <Button type="submit" size="sm" variant="secondary">
                <ImageUp aria-hidden="true" />
                {vehicle.photo.kind === "url" ? "استبدال الصورة" : "رفع الصورة"}
              </Button>
            </form>
            {vehicle.photo.kind === "none" ? null : (
              <form action={adminRemoveVehiclePhoto.bind(null, subcontractorId, vehicle.id)}>
                <Button type="submit" size="sm" variant="ghost">
                  <Trash2 aria-hidden="true" />
                  إزالة الصورة
                </Button>
              </form>
            )}
          </div>
        )}
      />
    </Card>
  );
}
