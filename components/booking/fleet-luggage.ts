import "server-only";

import { cache } from "react";

/**
 * سقفا إدخال الأسطول — أكبر سعة **ركاب** وأكبر سعة **حقائب** بين الفئات النشطة.
 *
 * ── لماذا وُجد هذا الملف ──────────────────────────────────────────────────
 * كان عدّادا الشاشة مسقوفين بثابتين في الكود (`MAX_LUGGAGE = 20` و
 * `MAX_PASSENGERS = 60`) بينما الأهلية في القاعدة `capacity >= p_passengers`
 * و`luggage_capacity >= p_luggage` على فئات قد تكون أصغر من ذلك بكثير. فالشاشة
 * كانت تعرض على العميل أرقاماً **تضمن صفر عروض**: يرفع العدّاد فيُقابَل بـ«لا
 * توجد فئة» بلا أن يفهم أن الرقم نفسه كان مستحيلاً منذ اللحظة التي عُرض فيها.
 * وهذا هو «الشاشة تَعِد بما لا تفعله القاعدة» في أبسط صوره.
 *
 * ⚠ **وهذان سقفا إدخال لا قاعدة أهلية** (D-12 بلا مساس): الترشيح كله يبقى داخل
 * `quote_price`، ولا تُخفى فئة هنا ولا تُظهَر. ما يفعله الرقمان أنهما يمنعان
 * الشاشة من **عرض خيار لا يمكن أن ينجح** — والفرق بين الاثنين هو الفرق بين
 * «لا أعرض ما يستحيل» و«أقرّر بدل القاعدة».
 *
 * ── ولماذا قراءةٌ واحدة تُرجع الرقمين ────────────────────────────────────
 * كان سقف الحقائب يُقرأ هنا وسقف الركاب يُقرأ في `GET /api/quote` — **مصدران
 * لرقمٍ واحد من جدولٍ واحد**، وهو نمط العيب الذي احترق به هذا المشروع مراراً
 * (النمط ٨ في `handover/LESSONS.md`): أول شرطٍ يُضاف لأحدهما — «النشطة **و**
 * المرئية للحجز» مثلاً — يجعل الشاشة تسقف الركاب بأسطولٍ غير الذي تسقف به
 * الحقائب. فصار المصدر واحداً، والمسار العام حُذف لأن كل مُركِّبٍ للويدجت له
 * غلافٌ خادمي يقرأ من هنا (`app/book/page.tsx` و`components/booking/booking-widget.tsx`).
 *
 * و`order + limit 1` لم يعد يصلح: أكبرُ الفئات سعةَ ركاب ليست بالضرورة أكبرها
 * سعةَ حقائب، فالرقمان لا يخرجان من صفٍّ واحد. والفئات النشطة قليلة (أربع في
 * قاعدة بدر اليوم) فينتقي هذا الملف الأكبر من الصفوف نفسها — انتقاءُ عددٍ لا
 * حسابُ مال، ولا شيء من التسعير يمرّ من هنا (D-05 بلا مساس).
 *
 * ── ولماذا الجدول لا دالة ────────────────────────────────────────────────
 * `vehicle_classes` ممنوحة `select` لـ`anon` منذ 0005، وسياستها للزائر
 * `active = true` — فالقراءة هنا بمفتاح anon ترى **الفئات النشطة وحدها** بحكم
 * RLS لا بحكم شرطٍ نكتبه. ولا عمود حسّاس في هذا الجدول أصلاً (التعريفات في
 * `tariffs` وهي جدول آخر)، والعمودان المقروءان سعتان لا غير.
 *
 * ── والفشل يقع بلا سقف جديد ──────────────────────────────────────────────
 * هجرة غير مطبَّقة · بيئة ناقصة · خطأ قراءة · جدول فارغ ⇒ `null` **للرقمين
 * معاً**، والويدجت يبقى على ثابتيه كما كان حرفياً. لا تشديد بالخطأ: سقفٌ صفريٌّ
 * ناتجٌ عن قراءة فاشلة كان سيمنع كل عميل من طلب راكب واحد أو إعلان حقيبة واحدة.
 */

/** حدٌّ علوي مطلق يطابق `check (luggage_capacity between 0 and 99)` في 0031 */
const MAX_SANE_LUGGAGE = 99;

/**
 * حدُّ عقلٍ لسعة الركاب — القاعدة تفرض `capacity > 0` بلا سقف أعلى، والويدجت
 * يقصّ بعده على ثابته المطلق. وجوده هنا يمنع رقماً عبثياً في صفٍّ واحد من أن
 * يصير سقف الشاشة كلها.
 */
const MAX_SANE_PASSENGERS = 99;

/** سقفا الإدخال المشتقّان من الأسطول — و`null` تعني «تعذّرت القراءة» لا «صفر» */
export type FleetCaps = {
  maxPassengers: number | null;
  maxLuggage: number | null;
};

/** القيمة التي تعني «لا نعرف» — وهي **غير** «صفر» و**غير** «لا ينطبق» */
const NO_CAPS: FleetCaps = { maxPassengers: null, maxLuggage: null };

/** رقمٌ صالح مقصوصٌ على حدّه الأعلى، أو `null` لكل ما عداه */
function toCap(raw: unknown, ceiling: number): number | null {
  const value = typeof raw === "number" ? raw : Number(raw);
  if (!Number.isFinite(value) || value < 1) return null;
  return Math.min(Math.trunc(value), ceiling);
}

/** أكبر قيمة صالحة في عمودٍ عبر الصفوف — و`null` حين لا قيمة صالحة أصلاً */
function maxOf(
  rows: readonly Record<string, unknown>[],
  column: string,
  ceiling: number
): number | null {
  let best: number | null = null;
  for (const row of rows) {
    const value = toCap(row[column], ceiling);
    if (value !== null && (best === null || value > best)) best = value;
  }
  return best;
}

const loadFleetCaps = cache(async (): Promise<FleetCaps> => {
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) {
    return NO_CAPS;
  }
  try {
    const { createServerSupabase } = await import("@/lib/supabase/server");
    const supabase = await createServerSupabase();
    if (!supabase) return NO_CAPS;

    const { data, error } = await supabase
      .from("vehicle_classes")
      .select("capacity, luggage_capacity")
      .eq("active", true);

    if (!error && Array.isArray(data) && data.length > 0) {
      const rows = data as Record<string, unknown>[];
      return {
        maxPassengers: maxOf(rows, "capacity", MAX_SANE_PASSENGERS),
        maxLuggage: maxOf(rows, "luggage_capacity", MAX_SANE_LUGGAGE),
      };
    }

    // درجةُ توافقٍ واحدة، ونظيرها الحرفي في `app/api/quote/route.ts`: قاعدة قبل
    // 0031 بلا عمود `luggage_capacity` تُفشل القراءة **بعموديها معاً**، فيسقط
    // سقف الركاب معها بلا سبب. فنعيدها بالعمود القديم وحده: يبقى سقف الركاب
    // مقروءاً، ويسقط سقف الحقائب إلى ثابت الواجهة كما كان قبل الدفعة ٣ حرفياً.
    const legacy = await supabase.from("vehicle_classes").select("capacity").eq("active", true);
    if (legacy.error || !Array.isArray(legacy.data) || legacy.data.length === 0) return NO_CAPS;

    return {
      maxPassengers: maxOf(
        legacy.data as Record<string, unknown>[],
        "capacity",
        MAX_SANE_PASSENGERS
      ),
      maxLuggage: null,
    };
  } catch {
    return NO_CAPS;
  }
});

/**
 * سقفا الركاب والحقائب من الأسطول النشط — مُذاكَران لكل طلب (‏`cache`) كنظيرتهما
 * في `extras-catalog.ts`، فالغلافان الخادميان يناديانها بلا رحلة قاعدة ثانية.
 */
export async function getFleetCaps(): Promise<FleetCaps> {
  return loadFleetCaps();
}
