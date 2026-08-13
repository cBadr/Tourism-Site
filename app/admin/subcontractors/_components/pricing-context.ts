import type { SupabaseClient } from "@supabase/supabase-js";

import { asNumber, asText } from "../../orders/_components/booking-ui";
import { readMargin, type MarginView } from "./subcontractor-ui";

/**
 * سياق التسعير الذي تحتاجه شاشتا مراجعة الأسعار وملف المتعهد:
 * الفئات وأرضية سعر كل فئة (من `tariffs`) + إعدادات الهامش والعملة.
 *
 * كل هذه قيم **مُدخلات** تُقرأ كما هي من القاعدة — لا يُحسب هنا شيء. الحساب
 * الملزم يقع داخل `quote_price` لحظة التسعير، وما تعرضه الشاشة معاينة لقاعدته.
 */

export type ClassInfo = {
  slug: string;
  title: string;
  capacity: number | null;
  /** أرضية سعر الفئة من التعريفة — صمام الأمان الأخير فوق سعر المتعهد + الهامش */
  minPrice: number | null;
  active: boolean;
  sort: number;
};

export type PricingContext = {
  classes: ClassInfo[];
  byClass: Map<string, ClassInfo>;
  margin: MarginView;
  currency: string;
  /** هل قُرئت الفئات فعلاً؟ (جدول المرحلة ٣ موجود) */
  ready: boolean;
};

export const EMPTY_PRICING_CONTEXT: PricingContext = {
  classes: [],
  byClass: new Map(),
  margin: readMargin(null),
  currency: "EGP",
  ready: false,
};

export async function loadPricingContext(supabase: SupabaseClient): Promise<PricingContext> {
  const [classesRes, tariffsRes, settingsRes] = await Promise.all([
    supabase
      .from("vehicle_classes")
      .select("id, slug, title, capacity, active, sort")
      .order("sort", { ascending: true })
      .order("capacity", { ascending: true }),
    supabase.from("tariffs").select("class_id, min_price"),
    // `select("*")` لا أعمدة مسمّاة: أعمدة الهامش تُضيفها هجرة المرحلة ٥، وطلبها
    // بالاسم قبل تنفيذها كان سيُفشل الاستعلام كله بدل السقوط على قيم العقد
    supabase.from("pricing_settings").select("*").limit(1).maybeSingle(),
  ]);

  const settingsRow = settingsRes.error
    ? null
    : ((settingsRes.data ?? null) as Record<string, unknown> | null);
  const margin = readMargin(settingsRow);
  const currency = asText(settingsRow?.currency) ?? "EGP";

  if (classesRes.error) {
    return { ...EMPTY_PRICING_CONTEXT, byClass: new Map(), margin, currency };
  }

  // أرضية السعر مرتبطة بالفئة عبر `class_id` لا عبر الـ slug — نربط في الذاكرة
  // (استعلامان مستقلان أمتن من الـ embed لأنه لا يعتمد على اسم علاقة المفتاح)
  const minByClassId = new Map<string, number | null>();
  if (!tariffsRes.error) {
    for (const row of (tariffsRes.data ?? []) as Record<string, unknown>[]) {
      const classId = asText(row.class_id);
      if (classId) minByClassId.set(classId, asNumber(row.min_price));
    }
  }

  const classes: ClassInfo[] = ((classesRes.data ?? []) as Record<string, unknown>[])
    .map((row, index) => {
      const slug = asText(row.slug);
      if (!slug) return null;
      const id = asText(row.id);
      return {
        slug,
        title: asText(row.title) ?? slug,
        capacity: asNumber(row.capacity),
        minPrice: id ? (minByClassId.get(id) ?? null) : null,
        active: row.active !== false,
        sort: asNumber(row.sort) ?? index,
      };
    })
    .filter((c): c is ClassInfo => c !== null);

  const byClass = new Map(classes.map((c) => [c.slug, c]));
  return { classes, byClass, margin, currency, ready: true };
}
