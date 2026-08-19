import { MapPinPlus } from "lucide-react";

import { cn } from "@/lib/utils";
import { routePointLabels, type TripStop } from "./stops";

/**
 * سطرُ المسار: **المنطلق ثم المحطات بترتيبها ثم الوجهة**.
 *
 * ── لماذا مكوّنٌ واحد لا سطرٌ في كل شاشة ────────────────────────────────────
 * ستُّ شاشاتٍ تعرض هذا السطر (بطاقةُ العروض · ملخّصُ مسار الحجز · قائمةُ
 * الطلبات · تفصيلُ الطلب · طابورُ التشغيل · متابعةُ العميل)، وكانت كلُّها تكتب
 * `origin ← dest` بيدها. ونسخةٌ سابعةٌ للمحطات في كلٍّ منها تعني ستةَ ترتيباتٍ
 * تنحرف بأول تعديل — **القاعدة الذهبية ١٢: لا يُستنسخ منطق، يُفوَّض إليه**.
 *
 * ── 🔒 وحدةٌ محيَّدة بلا `"use client"` ─────────────────────────────────────
 * يستوردها العميلُ (`offers.tsx` · `checkout.tsx`) والخادمُ (شاشاتُ اللوحة
 * والبورتال وصفحةُ المتابعة) معاً. وهي بلا حالةٍ ولا خطّاف — عرضٌ محض — فتعمل
 * على الطرفين من نسخةٍ واحدة (القسم ٥ في `handover/LESSONS.md`).
 *
 * ── الإتاحة ────────────────────────────────────────────────────────────────
 * **السهم زخرفةٌ لقارئ الشاشة** (‏`aria-hidden`) — الترتيب هو ما يفصل «من» عن
 * «إلى»، وهو يُقرأ بالترتيب أصلاً. وهذا هو النمط القائم في هذا المستودع، مطبَّقاً
 * الآن على نقاطٍ أكثر من اثنتين بلا تغييرٍ في القاعدة.
 */
export function RouteLine({
  originLabel,
  destLabel,
  stops = [],
  className,
  /** رمزٌ يسبق السطر — تمرّره الشاشة لتبقى أيقونتها هي هي */
  icon,
  fallback = "—",
}: {
  originLabel: string;
  destLabel: string;
  stops?: readonly TripStop[];
  className?: string;
  icon?: React.ReactNode;
  fallback?: string;
}) {
  const points = routePointLabels(originLabel, stops, destLabel, fallback);

  return (
    <p className={cn("flex flex-wrap items-center gap-x-2 gap-y-1", className)}>
      {icon}
      {points.map((label, index) => (
        // 🔑 الفهرس مفتاحٌ مشروعٌ هنا وحده: قائمةٌ للعرض فقط، بلا حالةٍ في أي
        //    عنصر وبلا إدخال — فليس فيها ما «يهاجر» بين الصفوف عند التبديل.
        <span key={`${index}-${label}`} className="inline-flex items-center gap-2">
          {index > 0 ? (
            <span className="text-muted-foreground" aria-hidden="true">
              ←
            </span>
          ) : null}
          {/*
            المحطةُ تُميَّز عن الطرفين برمزٍ صغير لا بلونٍ وحده: اللون وحده لا
            يبلغ من يقرأ بتباينٍ منخفض ولا من يطبع الورقة بالأبيض والأسود
            (١٫٤٫١ AA)، وهذه الورقةُ تُطبع فعلاً في صفحة المتابعة.
          */}
          {index > 0 && index < points.length - 1 ? (
            <MapPinPlus className="size-3.5 shrink-0 text-muted-foreground" aria-hidden="true" />
          ) : null}
          <span>{label}</span>
        </span>
      ))}
    </p>
  );
}
