"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { SupabaseClient } from "@supabase/supabase-js";

import {
  clamp,
  MAX_MODEL_YEAR,
  MAX_SEATS,
  MIN_MODEL_YEAR,
  num,
  text,
} from "../_lib/form";
import { portalAccess } from "../_lib/session";

/**
 * إجراءات أسطول المتعهد — جدول `subcontractor_vehicles`.
 *
 * قواعد ثابتة:
 * - `portalAccess()` أولاً، وكل استعلام مقيَّد بـ `subcontractor_id` صراحةً فوق RLS.
 * - فئة المركبة تُتحقَّق من `vehicle_classes` النشطة على الخادم: القائمة المنسدلة
 *   حماية تجربة لا حماية بيانات، فمن يعدّل النموذج لا يستطيع اختراع فئة.
 * - فخ RLS المعروف: `.select()` بعد كل كتابة وفحص طول النتيجة (صفر صفوف = رفض سياسة).
 */

const url = (qs: string) => `/portal/fleet?${qs}`;

const MAX_LABEL = 120;
const MAX_PLATE = 32;

type VehicleFields = {
  class_slug: string;
  label: string;
  model_year: number | null;
  plate: string | null;
  seats: number | null;
  active: boolean;
};

/** قراءة الحقول والتحقق منها — تُعيد رمز خطأ نصياً بدل الرمي */
function readVehicle(formData: FormData, prefix = ""): VehicleFields | string {
  const p = (name: string) => `${prefix}${name}`;

  const classSlug = text(formData, p("class_slug"));
  if (!classSlug) return "class";

  const label = clamp(text(formData, p("label")), MAX_LABEL);
  if (!label) return "label";

  const modelYear = num(formData, p("model_year"));
  if (
    modelYear !== null &&
    (!Number.isInteger(modelYear) || modelYear < MIN_MODEL_YEAR || modelYear > MAX_MODEL_YEAR)
  )
    return "year";

  const seats = num(formData, p("seats"));
  if (seats !== null && (!Number.isInteger(seats) || seats < 1 || seats > MAX_SEATS)) return "seats";

  return {
    class_slug: classSlug,
    label,
    model_year: modelYear,
    plate: clamp(text(formData, p("plate")), MAX_PLATE),
    seats,
    active: formData.get(p("active")) != null,
  };
}

/** الفئة موجودة ونشطة فعلاً — وإلا فالمركبة لن تُسعَّر أبداً وسيظن صاحبها العكس */
async function classExists(supabase: SupabaseClient, slug: string): Promise<boolean> {
  const res = await supabase
    .from("vehicle_classes")
    .select("slug")
    .eq("slug", slug)
    .eq("active", true)
    .limit(1);
  return !res.error && (res.data?.length ?? 0) > 0;
}

export async function createVehicle(formData: FormData) {
  const access = await portalAccess();
  if (!access.ok) redirect(url(`error=${access.code}`));
  const { supabase, sub } = access;

  const fields = readVehicle(formData, "new.");
  if (typeof fields === "string") redirect(url(`error=${fields}`));
  if (!(await classExists(supabase, fields.class_slug))) redirect(url("error=class"));

  const res = await supabase
    .from("subcontractor_vehicles")
    .insert({ ...fields, subcontractor_id: sub.id })
    .select("id");

  if (res.error || !res.data || res.data.length === 0) redirect(url("error=save"));

  revalidatePath("/", "layout");
  redirect(url("saved=1"));
}

export async function saveVehicle(vehicleId: string, formData: FormData) {
  const access = await portalAccess();
  if (!access.ok) redirect(url(`error=${access.code}`));
  const { supabase, sub } = access;

  const fields = readVehicle(formData);
  if (typeof fields === "string") redirect(url(`error=${fields}`));
  if (!(await classExists(supabase, fields.class_slug))) redirect(url("error=class"));

  const res = await supabase
    .from("subcontractor_vehicles")
    .update(fields)
    .eq("id", vehicleId)
    .eq("subcontractor_id", sub.id)
    .select("id");

  if (res.error) redirect(url("error=save"));
  if (!res.data || res.data.length === 0) redirect(url("error=notfound"));

  revalidatePath("/", "layout");
  redirect(url("saved=1"));
}

/** تفعيل/إيقاف مركبة — الإيقاف يبقيها في السجل ويخرجها من حساب فئاتك المطلوبة */
export async function toggleVehicle(vehicleId: string) {
  const access = await portalAccess();
  if (!access.ok) redirect(url(`error=${access.code}`));
  const { supabase, sub } = access;

  const current = await supabase
    .from("subcontractor_vehicles")
    .select("active")
    .eq("id", vehicleId)
    .eq("subcontractor_id", sub.id)
    .maybeSingle();

  if (current.error) redirect(url("error=save"));
  if (!current.data) redirect(url("error=notfound"));

  const res = await supabase
    .from("subcontractor_vehicles")
    .update({ active: current.data.active !== true })
    .eq("id", vehicleId)
    .eq("subcontractor_id", sub.id)
    .select("id");

  if (res.error || !res.data || res.data.length === 0) redirect(url("error=save"));

  revalidatePath("/", "layout");
  redirect(url("saved=1"));
}

export async function deleteVehicle(vehicleId: string) {
  const access = await portalAccess();
  if (!access.ok) redirect(url(`error=${access.code}`));
  const { supabase, sub } = access;

  const res = await supabase
    .from("subcontractor_vehicles")
    .delete()
    .eq("id", vehicleId)
    .eq("subcontractor_id", sub.id)
    .select("id");

  if (res.error) redirect(url("error=save"));
  if (!res.data || res.data.length === 0) redirect(url("error=notfound"));

  revalidatePath("/", "layout");
  redirect(url("deleted=1"));
}
