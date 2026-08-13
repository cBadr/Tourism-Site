"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { createServerSupabase } from "@/lib/supabase/server";

/**
 * إجراءات شاشة الأسطول — تحرير فئات السيارات (`vehicle_classes`) وتعريفاتها (`tariffs`).
 *
 * قواعد ثابتة:
 * - كل حساب مالي داخل دالة `quote_price` في Postgres — هنا **تحقق من المدخلات فقط**
 *   (لا تُحسب أسعار في TypeScript إطلاقاً، قرار معماري ٤).
 * - اتفاقية «إعادة التوجيه بعد العملية» (اعتبار ٨): النجاح والفشل كلاهما redirect
 *   برمز في الـ query string تعرضه الصفحة كتنبيه.
 * - فخ RLS المعروف: update/insert ينجحان ظاهرياً بصفر صفوف عند رفض السياسة —
 *   لذلك نفحص `.select()` بعد كل كتابة.
 * - `revalidatePath("/", "layout")` لأن الفئات والأسعار تظهر في الموقع العام
 *   (قسم الأسطول وويدجت البحث والعروض).
 * - **سعة الحقائب** (‏`luggage_capacity`، هجرة `0031`) مُدخَل لا قرار: شرط
 *   الأهلية الثاني يُفحص داخل `quote_price` وحدها مع سعة الركاب (D-12)، وهذه
 *   الشاشة تكتب الرقم فقط.
 */

const url = (qs: string) => `/admin/fleet?${qs}`;

/** معرّف لاتيني صغير بشرطات — يدخل في روابط وردود API فلا يُترك حراً */
const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

/** حدود عاقلة تمنع الأخطاء المطبعية الكارثية (ليست قواعد تسعير) */
const MAX_CAPACITY = 200;
/** `check (luggage_capacity between 0 and 99)` في هجرة `0031` — المدى نفسه هنا */
const MAX_LUGGAGE = 99;
const MAX_SORT = 999;
const MIN_ROUND_TRIP_FACTOR = 1;
const MAX_ROUND_TRIP_FACTOR = 3;

/** الأرقام العربية الهندية تُقبل في الحقول الرقمية وتُحوَّل قبل التحقق */
const toLatinDigits = (s: string) =>
  s.replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 0x0660));

/** نص مُشذّب أو null */
function text(formData: FormData, name: string): string | null {
  const v = formData.get(name);
  return typeof v === "string" && v.trim() !== "" ? v.trim() : null;
}

/** رقم منتهٍ أو null (الفارغ وغير الرقمي كلاهما null) */
function num(formData: FormData, name: string): number | null {
  const v = formData.get(name);
  if (typeof v !== "string" || v.trim() === "") return null;
  const n = Number(toLatinDigits(v.trim()));
  return Number.isFinite(n) ? n : null;
}

const checked = (formData: FormData, name: string) => formData.get(name) != null;

/**
 * «العمود غير موجود» — قاعدة لم تُنفَّذ عليها هجرة `0031` بعد.
 * Postgres يرفع 42703، وPostgREST يردّ PGRST204 من ذاكرة المخطط عند الكتابة.
 */
const isMissingColumn = (code: string | undefined) => code === "42703" || code === "PGRST204";

/**
 * سعة الحقائب من النموذج — ثلاث حالات لا تُخلط:
 *   `undefined` = الحقل غير مُرسَل أصلاً (شاشةٌ عُرضت قبل هجرة `0031`) ⇒ **لا
 *                 يُكتب العمود إطلاقاً**، فلا نطمس قيمةً بافتراضٍ من عندنا.
 *   رقم صالح    = يُكتب.
 *   `"invalid"` = مُرسَل وخارج المدى ⇒ رسالة خطأ باسمه لا رسالة عامة.
 */
function readLuggage(formData: FormData): number | undefined | "invalid" {
  const raw = formData.get("luggage_capacity");
  if (typeof raw !== "string" || raw.trim() === "") return undefined;
  const n = Number(toLatinDigits(raw.trim()));
  if (!Number.isFinite(n) || !Number.isInteger(n) || n < 0 || n > MAX_LUGGAGE) return "invalid";
  return n;
}

type Money = {
  per_km: number;
  base_fee: number;
  min_price: number;
  waiting_hour_price: number;
};

/** حقول التعريفة المالية الأربعة — كلها إلزامية وغير سالبة، وإلا null */
function readMoney(formData: FormData): Money | null {
  const per_km = num(formData, "per_km");
  const base_fee = num(formData, "base_fee");
  const min_price = num(formData, "min_price");
  const waiting_hour_price = num(formData, "waiting_hour_price");
  const values = [per_km, base_fee, min_price, waiting_hour_price];
  if (values.some((v) => v === null || v < 0)) return null;
  return {
    per_km: per_km as number,
    base_fee: base_fee as number,
    min_price: min_price as number,
    waiting_hour_price: waiting_hour_price as number,
  };
}

/** تعريفة صفرية بالكامل = فئة تُسعَّر بلا شيء — تُمنع من التفعيل حمايةً للإيراد */
const isZeroTariff = (m: { per_km: number; base_fee: number; min_price: number }) =>
  m.per_km <= 0 && m.base_fee <= 0 && m.min_price <= 0;

/**
 * حفظ فئة واحدة كاملة: بيانات العرض في `vehicle_classes` + صف التعريفة في `tariffs`
 * (upsert لأن الفئة قد تكون بلا تعريفة إن أُنشئت من خارج اللوحة).
 */
export async function saveClass(classId: string, formData: FormData) {
  const supabase = await createServerSupabase();
  if (!supabase) redirect(url("error=env"));

  const title = text(formData, "title");
  if (!title) redirect(url("error=title"));

  const capacity = num(formData, "capacity");
  if (capacity === null || !Number.isInteger(capacity) || capacity < 1 || capacity > MAX_CAPACITY)
    redirect(url("error=capacity"));

  const sort = num(formData, "sort") ?? 0;
  if (!Number.isInteger(sort) || sort < 0 || sort > MAX_SORT) redirect(url("error=sort"));

  const money = readMoney(formData);
  if (!money) redirect(url("error=money"));

  const factor = num(formData, "round_trip_factor");
  if (
    factor === null ||
    factor < MIN_ROUND_TRIP_FACTOR ||
    factor > MAX_ROUND_TRIP_FACTOR
  )
    redirect(url("error=factor"));

  const luggage = readLuggage(formData);
  if (luggage === "invalid") redirect(url("error=luggage"));

  const active = checked(formData, "active");
  // فئة نشطة بتعريفة صفرية تعني عروضاً بسعر صفر أمام العملاء — تُرفض قبل الكتابة
  if (active && isZeroTariff(money)) redirect(url("error=tariff"));

  const classRes = await supabase
    .from("vehicle_classes")
    .update({
      title,
      capacity,
      short: text(formData, "short"),
      active,
      sort,
      ...(luggage === undefined ? {} : { luggage_capacity: luggage }),
    })
    .eq("id", classId)
    .select("id");

  // نموذجٌ يحمل سعة حقائب على قاعدة لم تُهاجَر: الكتابة الفاشلة لم تُغيّر شيئاً،
  // فنقولها صراحةً بدل أن نُسقط العمود بصمت ونُعلن حفظاً ناقصاً (النمط ٢ في LESSONS).
  if (classRes.error && isMissingColumn(classRes.error.code)) redirect(url("error=luggagemig"));

  if (classRes.error || !classRes.data || classRes.data.length === 0)
    redirect(url("error=save"));

  const tariffRes = await supabase
    .from("tariffs")
    .upsert({ class_id: classId, ...money, round_trip_factor: factor }, { onConflict: "class_id" })
    .select("class_id");
  if (tariffRes.error || !tariffRes.data || tariffRes.data.length === 0)
    redirect(url("error=save"));

  revalidatePath("/", "layout");
  redirect(url("saved=1"));
}

/**
 * إضافة فئة جديدة — تُنشأ **متوقفة** بتعريفة صفرية عمداً: لا تظهر للعملاء
 * قبل أن يضبط المدير أسعارها ويفعّلها من بطاقتها.
 */
export async function createClass(formData: FormData) {
  const supabase = await createServerSupabase();
  if (!supabase) redirect(url("error=env"));

  const title = text(formData, "new.title");
  if (!title) redirect(url("error=title"));

  const slug = text(formData, "new.slug")?.toLowerCase() ?? null;
  if (!slug || !SLUG_PATTERN.test(slug)) redirect(url("error=slug"));

  const capacity = num(formData, "new.capacity");
  if (capacity === null || !Number.isInteger(capacity) || capacity < 1 || capacity > MAX_CAPACITY)
    redirect(url("error=capacity"));

  // ترتيب العرض: بعد آخر فئة موجودة
  const last = await supabase
    .from("vehicle_classes")
    .select("sort")
    .order("sort", { ascending: false })
    .limit(1);
  const nextSort = ((last.data?.[0]?.sort as number | undefined) ?? -1) + 1;

  const created = await supabase
    .from("vehicle_classes")
    .insert({ slug, title, capacity, active: false, sort: nextSort })
    .select("id")
    .single();

  if (created.error || !created.data) {
    // 23505 = unique_violation على slug — رسالة أوضح من فشل الحفظ العام
    redirect(url(`error=${created.error?.code === "23505" ? "exists" : "save"}`));
  }

  const newId = created.data.id as string;

  // صف التعريفة الافتراضي: أصفار + معامل ذهاب وعودة محايد (ضعف السعر بلا خصم).
  // لا أسعار حقيقية في الكود — المدير يضبطها من البطاقة ثم يفعّل الفئة.
  const tariffRes = await supabase
    .from("tariffs")
    .insert({
      class_id: newId,
      per_km: 0,
      base_fee: 0,
      min_price: 0,
      waiting_hour_price: 0,
      round_trip_factor: 2,
    })
    .select("class_id");

  if (tariffRes.error || !tariffRes.data || tariffRes.data.length === 0) {
    // لا معاملات عبر PostgREST: نحذف الفئة اليتيمة حتى لا تبقى بلا تعريفة
    await supabase.from("vehicle_classes").delete().eq("id", newId);
    redirect(url("error=save"));
  }

  revalidatePath("/", "layout");
  redirect(url("saved=1"));
}

/**
 * تفعيل/إيقاف فئة بضغطة واحدة من ترويسة بطاقتها.
 * التفعيل مشروط بوجود تعريفة غير صفرية — نفس حارس `saveClass`.
 */
export async function toggleActive(classId: string) {
  const supabase = await createServerSupabase();
  if (!supabase) redirect(url("error=env"));

  const current = await supabase
    .from("vehicle_classes")
    .select("active")
    .eq("id", classId)
    .single();
  if (current.error || current.data == null) redirect(url("error=save"));

  const next = !current.data.active;

  if (next) {
    const tariff = await supabase
      .from("tariffs")
      .select("per_km, base_fee, min_price")
      .eq("class_id", classId)
      .maybeSingle();
    if (tariff.error) redirect(url("error=save"));
    const row = tariff.data as
      | { per_km: number | null; base_fee: number | null; min_price: number | null }
      | null;
    if (
      !row ||
      isZeroTariff({
        per_km: Number(row.per_km ?? 0),
        base_fee: Number(row.base_fee ?? 0),
        min_price: Number(row.min_price ?? 0),
      })
    )
      redirect(url("error=tariff"));
  }

  const res = await supabase
    .from("vehicle_classes")
    .update({ active: next })
    .eq("id", classId)
    .select("id");
  if (res.error || !res.data || res.data.length === 0) redirect(url("error=save"));

  revalidatePath("/", "layout");
  redirect(url("saved=1"));
}
