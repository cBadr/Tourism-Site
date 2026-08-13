import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import type { PriceListStatus } from "@/lib/subcontractor-types";
import { isSchemaMissing } from "./session";

/**
 * قراءات مشتركة بين شاشات البورتال (الأسطول ومحرر الأسعار ولوحة المتعهد).
 *
 * كل استعلام هنا مقيَّد بـ `subcontractor_id` صراحةً رغم أن RLS تفرض العزل أصلاً:
 * حزامان لا حزام واحد، فالشرط في الاستعلام يجعل النية مقروءة في الكود، وسياسة RLS
 * تبقى خط الدفاع الذي لا يُتجاوز.
 *
 * `ready = false` تعني «هجرة المرحلة ٥ غير منفَّذة» لا «فشل» — الشاشة تعرض
 * حينها بطاقة تشرح الخطوة الناقصة بدل قائمة فارغة مُضلِّلة.
 */

export type PortalVehicleClass = {
  id: string;
  slug: string;
  title: string;
  capacity: number | null;
  sort: number;
};

/** فئات السيارات النشطة وحدها — الفئة المتوقفة لا تُسعَّر فلا معنى لعرضها للمتعهد */
export async function loadVehicleClasses(
  supabase: SupabaseClient
): Promise<{ classes: PortalVehicleClass[]; ready: boolean }> {
  const res = await supabase
    .from("vehicle_classes")
    .select("id, slug, title, capacity, active, sort")
    .eq("active", true)
    .order("sort", { ascending: true })
    .order("capacity", { ascending: true });

  if (res.error) return { classes: [], ready: false };

  const classes = (res.data ?? []).map((row) => {
    const r = row as Record<string, unknown>;
    return {
      id: String(r.id),
      slug: String(r.slug),
      title: typeof r.title === "string" ? r.title : String(r.slug),
      capacity: typeof r.capacity === "number" ? r.capacity : null,
      sort: typeof r.sort === "number" ? r.sort : 0,
    };
  });

  return { classes, ready: true };
}

/**
 * عملة المنصة من `pricing_settings` — لا تُكتب في الكود إطلاقاً (انضباط الـ Whitelabel).
 * تُستخدم لعرض وحدة حقول التكلفة فقط؛ ولا يُحسب بها شيء في TypeScript.
 */
export async function loadCurrency(supabase: SupabaseClient): Promise<string | null> {
  const res = await supabase.from("pricing_settings").select("currency").limit(1).maybeSingle();
  if (res.error || !res.data) return null;
  const currency = (res.data as Record<string, unknown>).currency;
  return typeof currency === "string" && currency.trim() !== "" ? currency.trim() : null;
}

export type PortalVehicle = {
  id: string;
  classSlug: string;
  label: string;
  modelYear: number | null;
  plate: string | null;
  seats: number | null;
  active: boolean;
};

export const VEHICLE_COLUMNS = "id, class_slug, label, model_year, plate, seats, active";

export async function loadVehicles(
  supabase: SupabaseClient,
  subcontractorId: string
): Promise<{ vehicles: PortalVehicle[]; ready: boolean }> {
  const res = await supabase
    .from("subcontractor_vehicles")
    .select(VEHICLE_COLUMNS)
    .eq("subcontractor_id", subcontractorId)
    .order("class_slug", { ascending: true })
    .order("label", { ascending: true });

  if (res.error) return { vehicles: [], ready: !isSchemaMissing(res.error) };

  const vehicles = (res.data ?? []).map((row) => {
    const r = row as Record<string, unknown>;
    return {
      id: String(r.id),
      classSlug: typeof r.class_slug === "string" ? r.class_slug : "",
      label: typeof r.label === "string" ? r.label : "",
      modelYear: typeof r.model_year === "number" ? r.model_year : null,
      plate: typeof r.plate === "string" && r.plate.trim() !== "" ? r.plate.trim() : null,
      seats: typeof r.seats === "number" ? r.seats : null,
      active: r.active === true,
    };
  });

  return { vehicles, ready: true };
}

export type PortalPriceList = {
  id: string;
  title: string;
  originLabel: string;
  originLat: number;
  originLng: number;
  originRadiusKm: number;
  destLabel: string;
  destLat: number;
  destLng: number;
  destRadiusKm: number;
  bidirectional: boolean;
  status: PriceListStatus;
  reviewNote: string | null;
  createdAt: string | null;
};

export const PRICE_LIST_COLUMNS =
  "id, title, origin_label, origin_lat, origin_lng, origin_radius_km, dest_label, dest_lat, dest_lng, dest_radius_km, bidirectional, status, review_note, created_at";

const numberOf = (v: unknown): number => {
  const n = typeof v === "number" ? v : typeof v === "string" ? Number(v) : NaN;
  return Number.isFinite(n) ? n : 0;
};

export function isPriceListStatus(value: unknown): value is PriceListStatus {
  return value === "draft" || value === "pending" || value === "approved" || value === "rejected";
}

export function toPriceList(row: Record<string, unknown>): PortalPriceList {
  return {
    id: String(row.id),
    title: typeof row.title === "string" ? row.title : "",
    originLabel: typeof row.origin_label === "string" ? row.origin_label : "",
    originLat: numberOf(row.origin_lat),
    originLng: numberOf(row.origin_lng),
    originRadiusKm: numberOf(row.origin_radius_km),
    destLabel: typeof row.dest_label === "string" ? row.dest_label : "",
    destLat: numberOf(row.dest_lat),
    destLng: numberOf(row.dest_lng),
    destRadiusKm: numberOf(row.dest_radius_km),
    bidirectional: row.bidirectional === true,
    status: isPriceListStatus(row.status) ? row.status : "draft",
    reviewNote:
      typeof row.review_note === "string" && row.review_note.trim() !== ""
        ? row.review_note.trim()
        : null,
    createdAt: typeof row.created_at === "string" ? row.created_at : null,
  };
}

export async function loadPriceLists(
  supabase: SupabaseClient,
  subcontractorId: string
): Promise<{ lists: PortalPriceList[]; ready: boolean }> {
  const res = await supabase
    .from("price_lists")
    .select(PRICE_LIST_COLUMNS)
    .eq("subcontractor_id", subcontractorId)
    .order("created_at", { ascending: false });

  if (res.error) return { lists: [], ready: !isSchemaMissing(res.error) };
  return { lists: (res.data ?? []).map((row) => toPriceList(row as Record<string, unknown>)), ready: true };
}

/** أسعار فئات قائمة واحدة — خريطة slug ← تكلفة */
export async function loadPriceListItems(
  supabase: SupabaseClient,
  priceListId: string
): Promise<Map<string, number>> {
  const res = await supabase
    .from("price_list_items")
    .select("class_slug, cost")
    .eq("price_list_id", priceListId);

  const items = new Map<string, number>();
  if (res.error) return items;
  for (const row of res.data ?? []) {
    const r = row as Record<string, unknown>;
    if (typeof r.class_slug === "string") items.set(r.class_slug, numberOf(r.cost));
  }
  return items;
}

/** عدد الفئات المُسعَّرة في كل قائمة — استعلام واحد لكل الصفحة لا واحد لكل صف */
export async function countItemsByList(
  supabase: SupabaseClient,
  priceListIds: string[]
): Promise<Map<string, number>> {
  const counts = new Map<string, number>();
  if (priceListIds.length === 0) return counts;

  const res = await supabase
    .from("price_list_items")
    .select("price_list_id")
    .in("price_list_id", priceListIds);

  if (res.error) return counts;
  for (const row of res.data ?? []) {
    const id = String((row as Record<string, unknown>).price_list_id);
    counts.set(id, (counts.get(id) ?? 0) + 1);
  }
  return counts;
}
