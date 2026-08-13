import "server-only";

import { cache } from "react";
import type { PublicExtra } from "./extras";

/**
 * قارئ كتالوج الخدمات الإضافية — دالة `public_extras()` (هجرة 0031).
 *
 * ── لماذا يُقرأ على الخادم لا في الجزيرة ──────────────────────────────────
 * نفس تعليل `lib/discounts/banners.ts` حرفياً: قراءة من المتصفح = رحلة شبكة
 * إضافية على أسخن مسار في الموقع (ويدجت البطل يُصيَّر في كل صفحة رئيسية)،
 * ووميضُ قائمة تظهر بعد الرسم. فتُقرأ هنا مرة لكل طلب (‏`cache`) وتصل الويدجت
 * `props` قابلة للتسلسل.
 *
 * ── ولماذا الدالة لا الجدول ───────────────────────────────────────────────
 * `extra_services` **ممنوع على `anon`** بالكامل؛ السطح العام الوحيد هو
 * `public_extras()` — و**نوع إرجاعها لا يحمل عموداً داخلياً أصلاً** (لا `id`
 * ولا `active` ولا `sort`)، فما لا يوجد في النوع لا يتسرب بخطأ في الواجهة
 * (اتفاقية ٧ في `CONVENTIONS.md`).
 *
 * ── والفشل يقع فارغاً ─────────────────────────────────────────────────────
 * هجرة غير مطبَّقة · صلاحية غير ممنوحة · بيئة ناقصة ⇒ **مصفوفة فارغة**،
 * والواجهة لا تعرض شيئاً إطلاقاً (لا صندوقاً فارغاً ولا عنواناً بلا محتوى).
 * وهذه هي الحالة الافتراضية اليوم: الجدول **بلا بذرة** بقرار — أسعار كرسي
 * الأطفال والواي فاي لا يعرفها إلا المالك، ويضيفها من `/admin/extras`.
 */

type PublicExtraRow = {
  slug: unknown;
  title: unknown;
  description: unknown;
  price: unknown;
  max_qty: unknown;
};

const loadPublicExtras = cache(async (): Promise<PublicExtra[]> => {
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) {
    return [];
  }
  try {
    const { createServerSupabase } = await import("@/lib/supabase/server");
    const supabase = await createServerSupabase();
    if (!supabase) return [];

    // الترتيب (`sort, title`) داخل الدالة نفسها — لا `order` هنا حتى يبقى ترتيب
    // العرض قراراً واحداً في القاعدة يراه المالك في `/admin/extras`.
    const { data, error } = await supabase.rpc("public_extras");
    if (error || !Array.isArray(data)) return [];

    const rows = data as PublicExtraRow[];
    const out: PublicExtra[] = [];
    for (const row of rows) {
      const slug = typeof row.slug === "string" ? row.slug : "";
      const title = typeof row.title === "string" ? row.title : "";
      if (slug.length === 0 || title.length === 0) continue;

      // الأرقام تصل من PostgREST نصاً أحياناً (numeric) — التحويل قراءةٌ لا حساب
      const price = Number(row.price);
      const maxQty = Number(row.max_qty);
      if (!Number.isFinite(price) || price < 0) continue;

      out.push({
        slug,
        title,
        description: typeof row.description === "string" ? row.description : null,
        price,
        // خدمة بلا سقف مفهوم تُعامل كخدمة واحدة — والحدّ الحقيقي في القاعدة
        maxQty: Number.isFinite(maxQty) && maxQty >= 1 ? Math.trunc(maxQty) : 1,
      });
    }
    return out;
  } catch {
    return [];
  }
});

/** كتالوج الخدمات المفعَّلة للواجهة العامة — مُذاكَر لكل طلب */
export async function getPublicExtras(): Promise<PublicExtra[]> {
  return loadPublicExtras();
}
