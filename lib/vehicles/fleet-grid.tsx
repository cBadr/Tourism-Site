import { CarFront, ImageOff, TriangleAlert } from "lucide-react";
import type { ReactNode } from "react";

import { toArabicDigits } from "@/components/booking/format";
import { Badge } from "@/components/ui/badge";
import { DriverDocView } from "@/lib/drivers/doc-thumb";
import {
  VEHICLE_PHOTO_STATE_TEXT,
  type FleetClassRow,
  type VehiclePhotoView,
} from "./types";

/**
 * شبكةُ الأسطول مفصَّلاً لكل فئة — **مكوّنٌ واحد تقرؤه اللوحة والبوابة معاً**
 * (القاعدة الذهبية ١٢: لا يُستنسخ منطقٌ قائم).
 *
 * ── ما يعالجه، بنصّ ملاحظة المالك ────────────────────────────────────────
 *
 * «لا تظهر عدد السيارات المتاحة لدى المتعهد ولا أنواعها ولا صورها في كل فئة.»
 * فكل فئةٍ هنا لها كتلتُها: **العدد · النشط منها · مدى المقاعد · مركباتها
 * بصورها**.
 *
 * ── 🔴 والصفرُ يُقال ولا يُحذف سطرُه ─────────────────────────────────────
 *
 * الفئةُ التي لا مركبة فيها **تُرسم** بجملة «لا مركبة في هذه الفئة». وسطرٌ
 * غائبٌ يقرؤه المشرف «لم يُرسم» لا «لا يملك» — والفرق بينهما قرارُ إسنادٍ
 * كامل. ومصدرُ هذه الصفوف دالةُ Postgres `subcontractor_fleet_breakdown` التي
 * تقرأ **كتالوج الفئات** لا صفوف المركبات، فالصفر يُقرأ ولا يُشتق من غياب.
 *
 * ── 🔴 ولا `loading="lazy"` — العطلُ المقيس لا المظنون ───────────────────
 *
 * العرضُ كلُّه يمرّ بـ`DriverDocView` (‏`lib/drivers/doc-thumb.tsx`) ولا يُعاد
 * كتابته هنا. وفيها ثلاثة أقفال وُلدت من عطلٍ قِيس في المتصفح 2026-08-18:
 * رابطٌ موقَّع عمرُه دقيقة، وصورةٌ على بعد ١٣٣١١ بكسل **لم تُطلب بعد ٩٫٤
 * ثانية** لأنها كسولة، فحين بلغها التمرير مات التوقيع ورُسم مربّعٌ فارغ. وهذه
 * الشبكة تقع في **نفس** الموضع من نفس الصفحة — فالتفويض إليها هو العلاج نفسه.
 *
 * 🔒 **ولا مسار خام يعبر إلى JSX**: ما يصل رابطٌ موقَّع عمره دقيقة، والمفتاح
 * يبقى على الخادم (نفس قرار `receipt_path` في 0039 و`photo_path` في 0120).
 */

/** خانةُ صورةٍ واحدة — إمّا صورةٌ وإمّا **جملةٌ تقول ماذا يُفعل**، ولا مربّع صامت */
function PhotoBox({ vehicle }: { vehicle: VehiclePhotoView }) {
  return (
    <div className="flex h-28 w-full items-center justify-center overflow-hidden rounded-lg border border-dashed border-border bg-muted/40">
      {vehicle.photo.kind === "url" ? (
        <DriverDocView url={vehicle.photo.url} label={`صورة ${vehicle.label}`} />
      ) : (
        <span className="flex flex-col items-center gap-1 px-2 text-center text-[11px] leading-4 text-muted-foreground">
          <ImageOff className="size-4" aria-hidden="true" />
          {VEHICLE_PHOTO_STATE_TEXT[vehicle.photo.kind]}
        </span>
      )}
    </div>
  );
}

/** مدى المقاعد كما يُقرأ: رقمٌ واحد إن تساوت، ومدىً إن اختلفت */
function seatsText(row: FleetClassRow): string {
  if (row.seatsMin === null || row.seatsMax === null) return "غير محدَّد";
  return row.seatsMin === row.seatsMax
    ? `${toArabicDigits(row.seatsMin)} مقعداً`
    : `${toArabicDigits(row.seatsMin)}–${toArabicDigits(row.seatsMax)} مقعداً`;
}

export function FleetClassGrid({
  rows,
  vehicles,
  truncated,
  /**
   * زرُّ الرفع/الإزالة لكل مركبة — تمرّره الشاشةُ المضيفة لأن الإجراء يختلف:
   * البوابة تكتب بجلسة الشريك واللوحة بجلسة المشرف. والعرضُ واحد، والكتابةُ
   * لكلٍّ بابُه — فلا تُستنسخ الشبكة مرتين لأجل زرّ.
   */
  photoForm,
  /** نصٌّ يشرح للقارئ من أين تأتي هذه الأرقام — يختلف بين اللوحة والبوابة */
  intro,
}: {
  rows: FleetClassRow[];
  vehicles: VehiclePhotoView[];
  truncated: boolean;
  photoForm?: (vehicle: VehiclePhotoView) => ReactNode;
  intro?: ReactNode;
}) {
  const byClass = new Map<string, VehiclePhotoView[]>();
  for (const vehicle of vehicles) {
    const list = byClass.get(vehicle.classSlug);
    if (list) list.push(vehicle);
    else byClass.set(vehicle.classSlug, [vehicle]);
  }

  const totalVehicles = rows.reduce((sum, row) => sum + row.total, 0);
  const totalPhotos = rows.reduce((sum, row) => sum + row.withPhoto, 0);

  return (
    <div className="space-y-4">
      {intro}

      <p className="text-sm text-muted-foreground">
        {toArabicDigits(rows.length)} فئة على المنصة · {toArabicDigits(totalVehicles)} مركبة
        مسجّلة · {toArabicDigits(totalPhotos)} منها لها صورة.
      </p>

      {truncated ? (
        <p className="rounded-lg bg-muted/60 p-3 text-xs leading-5 text-muted-foreground">
          عدد المركبات تجاوز سقف العرض، فالمعروض أدناه ناقص. والأعداد في رؤوس الفئات محسوبة
          في قاعدة البيانات وتبقى صحيحة.
        </p>
      ) : null}

      <div className="space-y-4">
        {rows.map((row) => {
          const list = byClass.get(row.classSlug) ?? [];
          return (
            <div key={row.classSlug} className="rounded-xl border border-border/70 p-4">
              <div className="flex flex-wrap items-center gap-2">
                <CarFront className="size-4 shrink-0 text-primary" aria-hidden="true" />
                <h4 className="font-heading text-sm font-bold">{row.title}</h4>

                {row.capacity === null ? null : (
                  <Badge variant="outline">
                    سعة الفئة {toArabicDigits(row.capacity)}
                  </Badge>
                )}

                {row.classActive ? null : (
                  <Badge variant="secondary">فئة غير مفعّلة على المنصة</Badge>
                )}

                <Badge variant={row.total === 0 ? "secondary" : "default"} className="ms-auto">
                  {toArabicDigits(row.total)} مركبة · {toArabicDigits(row.active)} في الخدمة
                </Badge>
              </div>

              {row.total === 0 ? (
                /* 🔴 الصفرُ يُقال — الفئة التي لا مركبة فيها تُكتب ولا تُحذف */
                <p className="mt-3 rounded-lg bg-muted/50 p-3 text-sm text-muted-foreground">
                  لا مركبة في هذه الفئة. ولا يُطلب سعرٌ لفئةٍ بلا مركبة، ولا تدخل رحلاتها
                  في البثّ.
                </p>
              ) : (
                <>
                  <p className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                    <span>المقاعد: {seatsText(row)}</span>
                    <span>
                      الصور: {toArabicDigits(row.withPhoto)} من {toArabicDigits(row.total)}
                    </span>
                    {row.seatsMismatch > 0 ? (
                      <span className="flex items-center gap-1 text-amber-600 dark:text-amber-400">
                        <TriangleAlert className="size-3.5" aria-hidden="true" />
                        {toArabicDigits(row.seatsMismatch)} مركبة تخالف مقاعدُها سعة الفئة
                        المعلَنة للعميل
                      </span>
                    ) : null}
                  </p>

                  <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                    {list.map((vehicle) => (
                      <div key={vehicle.id} className="space-y-2">
                        <PhotoBox vehicle={vehicle} />
                        <div className="flex flex-wrap items-center gap-1.5">
                          <span className="text-sm font-semibold">{vehicle.label}</span>
                          <Badge variant={vehicle.active ? "default" : "secondary"}>
                            {vehicle.active ? "في الخدمة" : "متوقفة"}
                          </Badge>
                        </div>
                        <p className="flex flex-wrap gap-x-2 text-xs text-muted-foreground">
                          <span>
                            {vehicle.seats === null
                              ? "مقاعد غير محدَّدة"
                              : `${toArabicDigits(vehicle.seats)} مقعداً`}
                          </span>
                          {vehicle.color ? <span>· {vehicle.color}</span> : null}
                          {vehicle.modelYear === null ? null : (
                            <span dir="ltr">· {toArabicDigits(vehicle.modelYear)}</span>
                          )}
                          {vehicle.plate ? (
                            <span dir="ltr" className="font-mono">
                              · {vehicle.plate}
                            </span>
                          ) : null}
                        </p>
                        {photoForm ? photoForm(vehicle) : null}
                      </div>
                    ))}

                    {/* عددٌ يقول أكثر ممّا وصل ⇒ يُقال، ولا يُترك فارقاً يُخمَّن */}
                    {list.length < row.total ? (
                      <p className="text-xs text-muted-foreground">
                        و{toArabicDigits(row.total - list.length)} مركبة أخرى في هذه الفئة
                        لم تُعرض هنا.
                      </p>
                    ) : null}
                  </div>
                </>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
