"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { createServerSupabase } from "@/lib/supabase/server";

/**
 * إجراءات شاشة التسعير — إعدادات التسعير العامة (`pricing_settings`) + صندوق الاختبار.
 *
 * `pricing_settings` جدول صف واحد: نحدّث الصف الموجود، وإن لم يوجد نُدرجه.
 * لا حساب مالي هنا — التحقق من المدخلات فقط، والأسعار كلها من دالة `quote_price`.
 * اتفاقية «إعادة التوجيه بعد العملية»: النجاح والفشل كلاهما redirect برمز في الرابط.
 *
 * المرحلة ٥: أُضيفت أعمدة الهامش الثلاثة (`margin_type` و`margin_value`
 * و`margin_min_amount`). لأنها تصل مع هجرة 0010، كل مسار يلمسها يتحقق أولاً من
 * وجودها فعلياً في الجدول — قاعدة لم تُهاجر بعد يجب أن تحفظ الذروة بنجاح لا أن
 * تسقط الشاشة كلها.
 */

const url = (qs: string) => `/admin/pricing?${qs}`;

const MAX_PEAK_PERCENT = 100;
const MAX_TEST_KM = 5000;
const MAX_TEST_PASSENGERS = 60;
const MAX_TEST_WAITING_HOURS = 24;
/** سقف الهامش النسبي — ٥٠٠٪ مبالغة أصلاً، وما فوقه خطأ كتابة لا نية */
const MAX_MARGIN_PERCENT = 500;
/** سقف الهامش الثابت وأرضيته بالجنيه */
const MAX_MARGIN_AMOUNT = 1_000_000;

/** الأرقام العربية الهندية تُقبل في الحقول الرقمية وتُحوَّل قبل التحقق */
const toLatinDigits = (s: string) =>
  s.replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 0x0660));

function num(formData: FormData, name: string): number | null {
  const v = formData.get(name);
  if (typeof v !== "string" || v.trim() === "") return null;
  const n = Number(toLatinDigits(v.trim()));
  return Number.isFinite(n) ? n : null;
}

/**
 * نقطة جغرافية مكتوبة كما تُنسخ من خرائط جوجل: «30.0444, 31.2357».
 * نقبل الفاصلة العربية والمسافة والأرقام الهندية، ونرفض ما عدا ذلك.
 * الإرجاع: null = الحقل فارغ (مقبول)، false = مكتوب لكنه غير صالح (خطأ).
 */
function parsePoint(formData: FormData, name: string): { lat: number; lng: number } | null | false {
  const raw = formData.get(name);
  if (typeof raw !== "string" || raw.trim() === "") return null;

  const parts = toLatinDigits(raw)
    .replace(/[،؛]/g, ",")
    .split(",")
    .map((p) => p.trim())
    .filter((p) => p !== "");

  if (parts.length !== 2) return false;

  const lat = Number(parts[0]);
  const lng = Number(parts[1]);
  if (!Number.isFinite(lat) || Math.abs(lat) > 90) return false;
  if (!Number.isFinite(lng) || Math.abs(lng) > 180) return false;
  return { lat, lng };
}

/**
 * هل وصلت أعمدة الهامش إلى الجدول؟ استعلام عمود واحد أرخص فحص ممكن:
 * العمود المفقود يجعل PostgREST يرد بخطأ، ووجوده يرد بصف (أو لا صفوف) بلا خطأ.
 */
async function marginColumnsReady(
  supabase: NonNullable<Awaited<ReturnType<typeof createServerSupabase>>>
): Promise<boolean> {
  const res = await supabase.from("pricing_settings").select("margin_type").limit(1);
  return !res.error;
}

/**
 * حفظ إعدادات التسعير: مفتاح الذروة ونسبتها + إعدادات الهامش.
 * النسبة تُقبل حتى لو كان المفتاح مطفأً (تُجهَّز مسبقاً).
 */
export async function savePricingSettings(formData: FormData) {
  const supabase = await createServerSupabase();
  if (!supabase) redirect(url("error=env"));

  const peakPercent = num(formData, "peak_percent");
  if (peakPercent === null || peakPercent < 0 || peakPercent > MAX_PEAK_PERCENT)
    redirect(url("error=percent"));

  const patch: Record<string, unknown> = {
    peak_enabled: formData.get("peak_enabled") != null,
    peak_percent: peakPercent,
  };

  // حقول الهامش لا تُرسَل إطلاقاً حين تعرضها الشاشة معطّلة (لم تُهاجر القاعدة)،
  // فوجود `margin_type` في الجسم هو إشارة «الشاشة تعرض المحرِّر فعلاً».
  const marginType = formData.get("margin_type");
  if (marginType !== null) {
    if (marginType !== "percent" && marginType !== "fixed") redirect(url("error=margin"));

    const marginValue = num(formData, "margin_value");
    const ceiling = marginType === "percent" ? MAX_MARGIN_PERCENT : MAX_MARGIN_AMOUNT;
    if (marginValue === null || marginValue < 0 || marginValue > ceiling)
      redirect(url("error=margin"));

    const marginMin = num(formData, "margin_min_amount") ?? 0;
    if (marginMin < 0 || marginMin > MAX_MARGIN_AMOUNT) redirect(url("error=margin"));

    if (!(await marginColumnsReady(supabase))) redirect(url("error=marginmig"));

    patch.margin_type = marginType;
    patch.margin_value = marginValue;
    patch.margin_min_amount = marginMin;
  }

  const existing = await supabase.from("pricing_settings").select("*").limit(1);
  if (existing.error) redirect(url("error=save"));

  const current = (existing.data?.[0] ?? null) as Record<string, unknown> | null;

  if (current) {
    // الصف الوحيد: نقيّده بعمود id إن وُجد، وإلا بمرشّح يطابق الصف الوحيد دائماً
    // (`peak_enabled` مضمون الوجود بحسب العقد) — لا نرسل تحديثاً بلا مرشّح أبداً
    const query = supabase.from("pricing_settings").update(patch);
    const res = await (current.id === undefined
      ? query.not("peak_enabled", "is", null)
      : query.eq("id", current.id as string)
    ).select();
    // صفر صفوف مع نجاح ظاهري = RLS رفضت الكتابة (المستخدم ليس admin)
    if (res.error || !res.data || res.data.length === 0) redirect(url("error=save"));
  } else {
    // الجدول فارغ — نُنشئ الصف الوحيد بعملة العقد (EGP في المرحلة ٣)
    const res = await supabase
      .from("pricing_settings")
      .insert({ ...patch, currency: "EGP" })
      .select();
    if (res.error || !res.data || res.data.length === 0) redirect(url("error=save"));
  }

  revalidatePath("/", "layout");
  redirect(url("saved=1"));
}

/**
 * صندوق الاختبار — لا يكتب شيئاً: يتحقق من المدخلات ثم يعيد التوجيه لنفس الشاشة
 * بمعاملات مطبَّعة في الرابط، والصفحة نفسها تستدعي `quote_price` وتعرض النتيجة.
 * الفائدة: نتيجة قابلة للمشاركة وللتحديث بلا حالة عميل ولا حساب في TypeScript.
 *
 * الإحداثيات اختيارية: بتركها فارغة نختبر مسار تعريفة الكيلومتر وحده، وبملئها
 * تشتغل مطابقة التغطية فيظهر أثر أسعار المتعهدين والهامش في الجدول.
 */
export async function testQuote(formData: FormData) {
  const distanceKm = num(formData, "distance_km");
  if (distanceKm === null || distanceKm <= 0 || distanceKm > MAX_TEST_KM)
    redirect(url("error=test"));

  const passengers = num(formData, "passengers");
  if (
    passengers === null ||
    !Number.isInteger(passengers) ||
    passengers < 1 ||
    passengers > MAX_TEST_PASSENGERS
  )
    redirect(url("error=test"));

  const waitingHours = num(formData, "waiting_hours") ?? 0;
  if (waitingHours < 0 || waitingHours > MAX_TEST_WAITING_HOURS) redirect(url("error=test"));

  const roundTrip = formData.get("round_trip") != null;

  const origin = parsePoint(formData, "origin_point");
  const dest = parsePoint(formData, "dest_point");
  if (origin === false || dest === false) redirect(url("error=coords"));
  // نقطة واحدة لا تكفي: التغطية تُطابق نقطتين معاً، فنصف الإحداثيات خطأ صامت
  if ((origin === null) !== (dest === null)) redirect(url("error=coordpair"));

  const qs = new URLSearchParams({
    test: "1",
    km: String(distanceKm),
    pax: String(passengers),
    wait: String(waitingHours),
    rt: roundTrip ? "1" : "0",
  });

  if (origin && dest) {
    qs.set("olat", String(origin.lat));
    qs.set("olng", String(origin.lng));
    qs.set("dlat", String(dest.lat));
    qs.set("dlng", String(dest.lng));
  }

  redirect(url(qs.toString()));
}
