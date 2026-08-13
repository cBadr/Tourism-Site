"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { SupabaseClient } from "@supabase/supabase-js";

import type { PriceListStatus } from "@/lib/subcontractor-types";
import { isPriceListStatus } from "../_lib/data";
import {
  clamp,
  isLat,
  isLng,
  MAX_COST,
  MAX_RADIUS_KM,
  MAX_TEXT,
  num,
  text,
} from "../_lib/form";
import { portalAccess } from "../_lib/session";

/**
 * إجراءات قوائم أسعار المتعهد — قلب المرحلة ٥ من جهة البورتال.
 *
 * القواعد المحسومة التي ينفّذها هذا الملف:
 * - المتعهد لا يعتمد نفسه أبداً: الحفظ يبقي القائمة مسودة/مرفوضة كما هي، والإرسال
 *   يضعها في `pending`، و`approved` حكرٌ على الإدارة.
 * - تعديل قائمة **معتمدة** يعيدها إلى `pending` فوراً — إبقاؤها معتمدة يعني تغيّر
 *   تكلفة تحت عروض حيّة بلا مراجعة، وهو ما لا يُقبل.
 * - الأسعار **تكلفة المتعهد** للاتجاه الواحد؛ الهامش والسعر النهائي يُحسبان في
 *   Postgres وحدها ولا يُلمسان هنا.
 *
 * تفضيل الدوال على الكتابة المباشرة: نستدعي `upsert_price_list` و`submit_price_list`
 * أولاً، فإن لم تكن الدالة موجودة بعد على الخادم (رمز PGRST202/42883) سقطنا إلى
 * كتابة مباشرة مكافئة عبر RLS. هذا يبقي البورتال عاملاً قبل تركيب دوال المرحلة ٥
 * وبعدها، وتبقى الدالة هي المرجع متى وُجدت.
 */

const listUrl = (qs: string) => `/portal/prices?${qs}`;
const editorUrl = (id: string, qs: string) => `/portal/prices/${id}?${qs}`;

/** رموز «الدالة غير موجودة/توقيعها مختلف» — إشارة السقوط إلى الكتابة المباشرة */
const MISSING_FUNCTION_CODES = new Set(["PGRST202", "42883"]);
const isMissingFunction = (error: { code?: string | null } | null | undefined) =>
  Boolean(error?.code && MISSING_FUNCTION_CODES.has(error.code));

type ListFields = {
  title: string;
  origin_label: string;
  origin_lat: number;
  origin_lng: number;
  origin_radius_km: number;
  dest_label: string;
  dest_lat: number;
  dest_lng: number;
  dest_radius_km: number;
  bidirectional: boolean;
};

type Item = { class_slug: string; cost: number };

/** قراءة نقطة (تسمية + إحداثيات + نطاق) — تُعيد رمز خطأ نصياً عند الفشل */
function readEndpoint(
  formData: FormData,
  prefix: "origin" | "dest"
): { label: string; lat: number; lng: number; radius: number } | string {
  const label = clamp(text(formData, `${prefix}_label`), MAX_TEXT);
  const lat = num(formData, `${prefix}_lat`);
  const lng = num(formData, `${prefix}_lng`);

  // الاسم بلا إحداثيات = نقطة لم تُختر من قائمة الاقتراحات، والتغطية تحتاج نقطة حقيقية
  if (!label || !isLat(lat) || !isLng(lng)) return `${prefix}_place`;

  const radius = num(formData, `${prefix}_radius_km`);
  if (radius === null || radius < 0 || radius > MAX_RADIUS_KM) return `${prefix}_radius`;

  return { label, lat, lng, radius };
}

function readFields(formData: FormData): ListFields | string {
  const title = clamp(text(formData, "title"), MAX_TEXT);
  if (!title) return "title";

  const origin = readEndpoint(formData, "origin");
  if (typeof origin === "string") return origin;

  const dest = readEndpoint(formData, "dest");
  if (typeof dest === "string") return dest;

  return {
    title,
    origin_label: origin.label,
    origin_lat: origin.lat,
    origin_lng: origin.lng,
    origin_radius_km: origin.radius,
    dest_label: dest.label,
    dest_lat: dest.lat,
    dest_lng: dest.lng,
    dest_radius_km: dest.radius,
    bidirectional: formData.get("bidirectional") != null,
  };
}

/**
 * أسعار الفئات: الفارغ يعني «لا أغطي هذه الفئة» ولا يُكتب صفاً، والصفر مرفوض
 * (رحلة بتكلفة صفر ليست تغطية بل خطأ إدخال). الفئات التي يملك فيها المتعهد
 * مركبات إلزامية — قائمة تُغفل فئة يعمل عليها تُخرجه من عروض تخصه.
 */
function readItems(
  formData: FormData,
  classSlugs: string[],
  requiredSlugs: Set<string>
): Item[] | string {
  const items: Item[] = [];

  for (const slug of classSlugs) {
    const cost = num(formData, `cost.${slug}`);
    if (cost === null) {
      if (requiredSlugs.has(slug)) return "cost_required";
      continue;
    }
    if (cost <= 0 || cost > MAX_COST) return "cost";
    items.push({ class_slug: slug, cost });
  }

  if (items.length === 0) return "no_items";
  return items;
}

/** فئات السيارات النشطة على المنصة — مرجع الخادم لا قائمة النموذج */
async function activeClassSlugs(supabase: SupabaseClient): Promise<string[]> {
  const res = await supabase
    .from("vehicle_classes")
    .select("slug, sort")
    .eq("active", true)
    .order("sort", { ascending: true });
  if (res.error) return [];
  return (res.data ?? [])
    .map((row) => (row as Record<string, unknown>).slug)
    .filter((slug): slug is string => typeof slug === "string");
}

/** الفئات التي يملك المتعهد فيها مركبات في الخدمة */
async function ownedClassSlugs(
  supabase: SupabaseClient,
  subcontractorId: string
): Promise<Set<string>> {
  const res = await supabase
    .from("subcontractor_vehicles")
    .select("class_slug")
    .eq("subcontractor_id", subcontractorId)
    .eq("active", true);
  const slugs = new Set<string>();
  if (res.error) return slugs;
  for (const row of res.data ?? []) {
    const slug = (row as Record<string, unknown>).class_slug;
    if (typeof slug === "string") slugs.add(slug);
  }
  return slugs;
}

/** معرّف القائمة كما قد تُرجعه الدالة: نصاً، أو صفاً/مصفوفة صفوف تحمل `id` */
function readReturnedId(data: unknown): string | null {
  if (typeof data === "string" && data.trim() !== "") return data;
  const row = Array.isArray(data) ? data[0] : data;
  if (row && typeof row === "object") {
    const id = (row as Record<string, unknown>).id;
    if (typeof id === "string" && id.trim() !== "") return id;
  }
  return null;
}

/** الحالة الحالية لقائمة يملكها المتعهد — null إن لم توجد */
async function currentStatus(
  supabase: SupabaseClient,
  subcontractorId: string,
  listId: string
): Promise<PriceListStatus | null> {
  const res = await supabase
    .from("price_lists")
    .select("status")
    .eq("id", listId)
    .eq("subcontractor_id", subcontractorId)
    .maybeSingle();
  if (res.error || !res.data) return null;
  const status = (res.data as Record<string, unknown>).status;
  return isPriceListStatus(status) ? status : "draft";
}

/**
 * الكتابة المباشرة — بديل `upsert_price_list` حين لا تكون الدالة منشورة بعد.
 * بلا معاملة واحدة (PostgREST لا يوفرها)، لذلك ترتيب العمليات مقصود: الرأس أولاً
 * ثم البنود، فأسوأ حالة انقطاع تترك قائمة برأس محدَّث وبنود قديمة تُصحَّح بحفظ ثانٍ.
 */
async function writeDirect(
  supabase: SupabaseClient,
  subcontractorId: string,
  listId: string | null,
  fields: ListFields,
  items: Item[]
): Promise<{ id: string } | { error: "notfound" | "save" }> {
  let id = listId;

  if (id) {
    const status = await currentStatus(supabase, subcontractorId, id);
    if (!status) return { error: "notfound" };

    // القاعدة: تعديل المعتمدة يعيدها للمراجعة؛ وما دونها يحتفظ بحالته حتى يُرسَل
    const nextStatus: PriceListStatus = status === "approved" ? "pending" : status;

    const res = await supabase
      .from("price_lists")
      .update({ ...fields, status: nextStatus })
      .eq("id", id)
      .eq("subcontractor_id", subcontractorId)
      .select("id");
    if (res.error || !res.data || res.data.length === 0) return { error: "save" };
  } else {
    const res = await supabase
      .from("price_lists")
      .insert({ ...fields, subcontractor_id: subcontractorId, status: "draft" })
      .select("id")
      .single();
    if (res.error || !res.data) return { error: "save" };
    id = String((res.data as Record<string, unknown>).id);
  }

  const cleared = await supabase.from("price_list_items").delete().eq("price_list_id", id);
  if (cleared.error) return { error: "save" };

  const inserted = await supabase
    .from("price_list_items")
    .insert(items.map((item) => ({ ...item, price_list_id: id })))
    .select("class_slug");
  if (inserted.error || !inserted.data || inserted.data.length === 0) return { error: "save" };

  return { id };
}

/** الإرسال للاعتماد — الدالة أولاً، وإلا تحديث مباشر إلى `pending` */
async function submitList(
  supabase: SupabaseClient,
  subcontractorId: string,
  listId: string
): Promise<boolean> {
  const rpc = await supabase.rpc("submit_price_list", { p_id: listId });
  if (!rpc.error) return true;
  if (!isMissingFunction(rpc.error)) return false;

  const res = await supabase
    .from("price_lists")
    .update({ status: "pending" })
    .eq("id", listId)
    .eq("subcontractor_id", subcontractorId)
    .select("id");
  return !res.error && (res.data?.length ?? 0) > 0;
}

/**
 * حفظ قائمة (إنشاء أو تعديل). `listId = null` يعني قائمة جديدة.
 * الزر المضغوط يصل في `intent`: `draft` حفظ فقط، `submit` حفظ ثم إرسال للاعتماد.
 */
export async function savePriceList(listId: string | null, formData: FormData) {
  const access = await portalAccess();
  const back = (qs: string) => (listId ? editorUrl(listId, qs) : listUrl(qs));
  if (!access.ok) redirect(back(`error=${access.code}`));
  const { supabase, sub } = access;

  const fields = readFields(formData);
  if (typeof fields === "string") redirect(back(`error=${fields}`));

  const [classSlugs, owned] = await Promise.all([
    activeClassSlugs(supabase),
    ownedClassSlugs(supabase, sub.id),
  ]);
  if (classSlugs.length === 0) redirect(back("error=classes"));

  const required = new Set([...owned].filter((slug) => classSlugs.includes(slug)));
  const items = readItems(formData, classSlugs, required);
  if (typeof items === "string") redirect(back(`error=${items}`));

  const submit = text(formData, "intent") === "submit";

  // الدالة أولاً؛ والسقوط إلى الكتابة المباشرة عند غيابها وحدها لا عند فشلها
  const rpc = await supabase.rpc("upsert_price_list", {
    p_id: listId,
    p_title: fields.title,
    p_origin_label: fields.origin_label,
    p_origin_lat: fields.origin_lat,
    p_origin_lng: fields.origin_lng,
    p_origin_radius_km: fields.origin_radius_km,
    p_dest_label: fields.dest_label,
    p_dest_lat: fields.dest_lat,
    p_dest_lng: fields.dest_lng,
    p_dest_radius_km: fields.dest_radius_km,
    p_bidirectional: fields.bidirectional,
    p_items: items,
  });

  let savedId: string | null = null;

  if (!rpc.error) {
    // الدالة قد تُرجع المعرّف نصاً أو صفاً يحمله؛ وفي التعديل يكفينا المعرّف القائم
    savedId = readReturnedId(rpc.data) ?? listId;
    if (!savedId) {
      // إنشاء نجح لكن الدالة لم تُرجع المعرّف: القائمة محفوظة ولا وجهة لنا سوى
      // شاشة القوائم — الإرسال للاعتماد متاح منها بضغطة، فلا شيء يضيع
      revalidatePath("/", "layout");
      redirect(listUrl("saved=1"));
    }
  } else if (isMissingFunction(rpc.error)) {
    const written = await writeDirect(supabase, sub.id, listId, fields, items);
    if ("error" in written) redirect(back(`error=${written.error}`));
    savedId = written.id;
  } else {
    redirect(back("error=save"));
  }

  if (!savedId) redirect(back("error=save"));
  const targetId = savedId;

  if (submit) {
    const done = await submitList(supabase, sub.id, targetId);
    revalidatePath("/", "layout");
    redirect(editorUrl(targetId, done ? "submitted=1" : "error=save"));
  }

  revalidatePath("/", "layout");
  redirect(editorUrl(targetId, "saved=1"));
}

/** إرسال قائمة قائمة للاعتماد من شاشة القوائم بلا فتح المحرر */
export async function submitPriceList(listId: string) {
  const access = await portalAccess();
  if (!access.ok) redirect(listUrl(`error=${access.code}`));
  const { supabase, sub } = access;

  const status = await currentStatus(supabase, sub.id, listId);
  if (!status) redirect(listUrl("error=notfound"));
  if (status === "pending") redirect(listUrl("error=already_pending"));

  const done = await submitList(supabase, sub.id, listId);
  if (!done) redirect(listUrl("error=save"));

  revalidatePath("/", "layout");
  redirect(listUrl("submitted=1"));
}

/**
 * حذف قائمة — للمسودات والمرفوضة وحدها. القائمة المعتمدة أو التي تنتظر المراجعة
 * تخص الإدارة أيضاً: سحبها يمر بها حتى لا تختفي تغطية من تحت عروض حيّة.
 */
export async function deletePriceList(listId: string) {
  const access = await portalAccess();
  if (!access.ok) redirect(listUrl(`error=${access.code}`));
  const { supabase, sub } = access;

  const status = await currentStatus(supabase, sub.id, listId);
  if (!status) redirect(listUrl("error=notfound"));
  if (status !== "draft" && status !== "rejected") redirect(listUrl("error=delete_locked"));

  // البنود أولاً: لو لم يكن المفتاح الأجنبي متتالي الحذف بقيت بنود يتيمة
  await supabase.from("price_list_items").delete().eq("price_list_id", listId);

  const res = await supabase
    .from("price_lists")
    .delete()
    .eq("id", listId)
    .eq("subcontractor_id", sub.id)
    .select("id");

  if (res.error || !res.data || res.data.length === 0) redirect(listUrl("error=save"));

  revalidatePath("/", "layout");
  redirect(listUrl("deleted=1"));
}
