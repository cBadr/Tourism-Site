import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import type {
  PriceImportRow,
  PriceSheetClass,
  PriceSheetRow,
} from "@/lib/subcontractor-types";
import { isPriceListStatus, toPriceList, type PortalPriceList } from "../../_lib/data";

/**
 * قراءات كشوف الأسعار — كلها عبر دوال Postgres لا عبر استعلامات جدولية:
 * `price_sheet_stats` و`price_sheet_classes` هما **التعريف الوحيد** للعدّادات
 * وللفئات المغطّاة. أي عدّ أو تصفية تُكتب هنا تصير مصدر حقيقة ثانياً ينحرف.
 *
 * ملاحظة عزل: الدالتان `security definer` وتفرضان الهوية بأنفسهما — المتعهد
 * لا يرى غير كشوفه مهما مرّر من معرّفات، وهذا مقيسٌ في `price_sheet_tests.sql`
 * بدور `authenticated` لا بدور مالك القاعدة.
 */

const numberOf = (v: unknown): number => {
  const n = typeof v === "number" ? v : typeof v === "string" ? Number(v) : NaN;
  return Number.isFinite(n) ? n : 0;
};

const textOrNull = (v: unknown): string | null =>
  typeof v === "string" && v.trim() !== "" ? v.trim() : null;

/** أعمدة المسار + عمود الكشف — لا نلمس `PRICE_LIST_COLUMNS` المشترك */
export const ROUTE_COLUMNS =
  "id, title, origin_label, origin_lat, origin_lng, origin_radius_km, dest_label, dest_lat, dest_lng, dest_radius_km, bidirectional, status, review_note, created_at, sheet_id";

export type PortalRoute = PortalPriceList & { sheetId: string | null };

export function toRoute(row: Record<string, unknown>): PortalRoute {
  return { ...toPriceList(row), sheetId: textOrNull(row.sheet_id) };
}

function toSheet(row: Record<string, unknown>): PriceSheetRow {
  return {
    id: String(row.id),
    subcontractorId: String(row.subcontractor_id ?? ""),
    companyName: typeof row.company_name === "string" ? row.company_name : "",
    title: typeof row.title === "string" ? row.title : "",
    note: textOrNull(row.note),
    routes: numberOf(row.routes),
    draftCount: numberOf(row.draft_count),
    pendingCount: numberOf(row.pending_count),
    approvedCount: numberOf(row.approved_count),
    rejectedCount: numberOf(row.rejected_count),
    createdAt: typeof row.created_at === "string" ? row.created_at : null,
    updatedAt: typeof row.updated_at === "string" ? row.updated_at : null,
  };
}

/** `ready = false` تعني «هجرة 0102 غير منفَّذة» لا «فشل» */
export async function loadSheets(
  supabase: SupabaseClient,
  subcontractorId?: string
): Promise<{ sheets: PriceSheetRow[]; ready: boolean }> {
  const res = await supabase.rpc("price_sheet_stats", {
    p_subcontractor_id: subcontractorId ?? null,
  });
  if (res.error) return { sheets: [], ready: false };
  return {
    sheets: ((res.data ?? []) as Record<string, unknown>[]).map(toSheet),
    ready: true,
  };
}

export async function loadSheet(
  supabase: SupabaseClient,
  sheetId: string
): Promise<PriceSheetRow | null> {
  const { sheets } = await loadSheets(supabase);
  return sheets.find((s) => s.id === sheetId) ?? null;
}

/** فئات هذا المتعهد المعروضة للتسعير — التعريف الوحيد، من Postgres */
export async function loadCoveredClasses(
  supabase: SupabaseClient,
  subcontractorId?: string,
  priceListId?: string
): Promise<{ classes: PriceSheetClass[]; ready: boolean }> {
  const res = await supabase.rpc("price_sheet_classes", {
    p_subcontractor_id: subcontractorId ?? null,
    p_price_list_id: priceListId ?? null,
  });
  if (res.error) return { classes: [], ready: false };

  const classes = ((res.data ?? []) as Record<string, unknown>[]).map((r) => ({
    slug: String(r.slug),
    title: typeof r.title === "string" ? r.title : String(r.slug),
    capacity: typeof r.capacity === "number" ? r.capacity : null,
    sort: typeof r.sort === "number" ? r.sort : 0,
    covered: r.covered === true,
  }));
  return { classes, ready: true };
}

/** مسارات المتعهد كلها، مقسومة: داخل كشوف، ومستقلة (النموذج القديم) */
export async function loadRoutes(
  supabase: SupabaseClient,
  subcontractorId: string
): Promise<{ routes: PortalRoute[]; ready: boolean }> {
  const res = await supabase
    .from("price_lists")
    .select(ROUTE_COLUMNS)
    .eq("subcontractor_id", subcontractorId)
    .order("created_at", { ascending: false });

  if (res.error) return { routes: [], ready: false };
  return {
    routes: ((res.data ?? []) as Record<string, unknown>[]).map(toRoute),
    ready: true,
  };
}

/** عدد الفئات المُسعَّرة لكل مسار — استعلام واحد للصفحة كلها */
export async function countItemsByRoute(
  supabase: SupabaseClient,
  routeIds: string[]
): Promise<Map<string, number>> {
  const counts = new Map<string, number>();
  if (routeIds.length === 0) return counts;
  const res = await supabase
    .from("price_list_items")
    .select("price_list_id")
    .in("price_list_id", routeIds);
  if (res.error) return counts;
  for (const row of res.data ?? []) {
    const id = String((row as Record<string, unknown>).price_list_id);
    counts.set(id, (counts.get(id) ?? 0) + 1);
  }
  return counts;
}

export function toImportRow(row: Record<string, unknown>): PriceImportRow {
  return {
    rowNo: numberOf(row.row_no),
    accepted: row.accepted === true,
    action: typeof row.action === "string" ? row.action : "rejected",
    routeTitle: textOrNull(row.route_title),
    classesSaved: numberOf(row.classes_saved),
    reason: textOrNull(row.reason),
  };
}

export { isPriceListStatus };
