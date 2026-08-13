import "server-only";

import { cache } from "react";

/**
 * أكبر سعة حقائب في الأسطول النشط — سقفُ عدّاد الحقائب في شاشة الحجز.
 *
 * ── لماذا وُجد هذا الملف ──────────────────────────────────────────────────
 * عدّاد الحقائب كان مسقوفاً بـ`MAX_LUGGAGE = 20` **ثابتاً في الكود**، بينما
 * الأهلية في القاعدة `luggage_capacity >= p_luggage` على فئات قد تكون أكبر
 * سعتها ستّاً. فالشاشة كانت تعرض على العميل أرقاماً **تضمن صفر عروض**: يرفع
 * العدّاد إلى ثمانية فيُقابَل بـ«لا توجد فئة» بلا أن يفهم أن الرقم نفسه كان
 * مستحيلاً منذ اللحظة التي عُرض فيها. وهذا هو «الشاشة تَعِد بما لا تفعله
 * القاعدة» في أبسط صوره.
 *
 * ⚠ **وهذا سقفُ إدخال لا قاعدة أهلية** (D-12 بلا مساس): الترشيح كله يبقى داخل
 * `quote_price`، ولا تُخفى فئة هنا ولا تُظهَر. ما يفعله هذا الرقم أنه يمنع
 * الشاشة من **عرض خيار لا يمكن أن ينجح** — والفرق بين الاثنين هو الفرق بين
 * «لا أعرض ما يستحيل» و«أقرّر بدل القاعدة».
 *
 * ── ولماذا الجدول لا دالة ────────────────────────────────────────────────
 * `vehicle_classes` ممنوحة `select` لـ`anon` منذ 0005، وسياستها للزائر
 * `active = true` — فالقراءة هنا بمفتاح anon ترى **الفئات النشطة وحدها** بحكم
 * RLS لا بحكم شرطٍ نكتبه. ولا عمود حسّاس في هذا الجدول أصلاً (التعريفات في
 * `tariffs` وهي جدول آخر)، والعمود المقروء واحد.
 *
 * ── والفشل يقع بلا سقف جديد ──────────────────────────────────────────────
 * هجرة غير مطبَّقة (لا عمود `luggage_capacity`) · بيئة ناقصة · خطأ قراءة ⇒
 * `null`، والويدجت يبقى على `MAX_LUGGAGE` كما كان حرفياً. لا تشديد بالخطأ:
 * سقفٌ صفريٌّ ناتجٌ عن قراءة فاشلة كان سيمنع كل عميل من إعلان حقيبة واحدة.
 */

/** حدٌّ علوي مطلق يطابق `check (luggage_capacity between 0 and 99)` في 0031 */
const MAX_SANE_CAPACITY = 99;

const loadMaxLuggageCapacity = cache(async (): Promise<number | null> => {
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) {
    return null;
  }
  try {
    const { createServerSupabase } = await import("@/lib/supabase/server");
    const supabase = await createServerSupabase();
    if (!supabase) return null;

    // `order + limit 1` لا تجميع: PostgREST لا يُجري `max()` على جدول مباشرةً،
    // والصف الأعلى ترتيباً هو الأكبر سعةً — قراءةٌ واحدة بلا حساب.
    const { data, error } = await supabase
      .from("vehicle_classes")
      .select("luggage_capacity")
      .eq("active", true)
      .order("luggage_capacity", { ascending: false })
      .limit(1);

    if (error || !Array.isArray(data) || data.length === 0) return null;

    const raw = (data[0] as { luggage_capacity?: unknown }).luggage_capacity;
    const value = typeof raw === "number" ? raw : Number(raw);
    if (!Number.isFinite(value) || value < 1) return null;

    return Math.min(Math.trunc(value), MAX_SANE_CAPACITY);
  } catch {
    return null;
  }
});

/**
 * أكبر سعة حقائب بين الفئات النشطة، أو `null` حين تتعذّر القراءة.
 * مُذاكَرة لكل طلب (‏`cache`) كنظيرتها في `extras-catalog.ts`.
 */
export async function getMaxLuggageCapacity(): Promise<number | null> {
  return loadMaxLuggageCapacity();
}
