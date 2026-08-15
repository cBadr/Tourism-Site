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
  const [classesRes, tariffsRes, settingsRes, marginRes] = await Promise.all([
    supabase
      .from("vehicle_classes")
      .select("id, slug, title, capacity, active, sort")
      .order("sort", { ascending: true })
      .order("capacity", { ascending: true }),
    supabase.from("tariffs").select("class_id, min_price"),
    /**
     * ── 🔴 كان `select("*")`، وكان **يفشل دائماً** ─────────────────────────
     *
     * التعليق القديم برّره بأن «أعمدة الهامش تُضيفها هجرة المرحلة ٥، وطلبها
     * بالاسم قبل تنفيذها يُفشل الاستعلام». والأعمدة موجودة منذ `0010` —
     * لكن `pricing_settings` تمنح `authenticated` قراءةً **على مستوى العمود**
     * وأعمدةُ الهامش مستثناة عمداً منذ `0011_partner_isolation`. فطلبُ `*`
     * يُرفض **دائماً**، ويُبتلع الرفض في `settingsRes.error` بصمت، فيسقط
     * `readMargin` على **قيم العقد الافتراضية**.
     *
     * ⚠ **والأثر ليس تجميلياً**: هاتان الشاشتان تعرضان «سعر العميل» المحسوب
     * بهذا الهامش. فكان المالك يرى سعراً مبنيّاً على هامشٍ **ليس هامشه** —
     * وتصادفُ تطابق الافتراضي مع المحفوظ اليوم (٢٠٪) هو ما أخفى العطب.
     * ولو غيّره من شاشة التسعير لبقيت هاتان الشاشتان تحسبان بالقديم.
     *
     * والعملة تُقرأ من الجدول (ممنوحة)، والهامش من `get_margin_settings()` —
     * `security definer` محروسة بـ`is_admin()`: صفٌّ للمشرف، وصفر للمتعهد.
     */
    supabase.from("pricing_settings").select("currency").limit(1).maybeSingle(),
    supabase.rpc("get_margin_settings"),
  ]);

  const settingsRow = settingsRes.error
    ? null
    : ((settingsRes.data ?? null) as Record<string, unknown> | null);
  const marginRow = (
    !marginRes.error && Array.isArray(marginRes.data) ? (marginRes.data[0] ?? null) : null
  ) as Record<string, unknown> | null;
  const margin = readMargin(marginRow);
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
